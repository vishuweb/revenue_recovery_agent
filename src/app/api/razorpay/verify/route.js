import { NextResponse } from 'next/server.js';
import { RazorpayProvider } from '../../../../lib/providers/razorpay.js';
import { getDb, auditLog } from '../../../../lib/db/database.js';
import { processRecoveryOutcome } from '../../../../lib/engine/orchestrator.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      caseId,
      customerId,
      amount
    } = body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return NextResponse.json({ error: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required' }, { status: 400 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      return NextResponse.json({ error: 'Payment verification is unavailable until Razorpay is configured' }, { status: 503 });
    }

    {
      const isValid = RazorpayProvider.verifyPaymentSignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      }, keySecret);

      if (!isValid) {
        await auditLog({
          entityType: 'payment',
          entityId: razorpay_payment_id,
          eventType: 'razorpay_signature_verification_failed',
          actor: 'razorpay',
          description: 'Client checkout signature verification failed',
          details: { razorpay_order_id, razorpay_payment_id }
        });
        return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
      }
    }

    const db = getDb();
    const caseRecord = caseId ? await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(caseId) : null;
    if (caseId && !caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    const effectiveCustomerId = caseRecord?.customer_id || customerId;
    if (!effectiveCustomerId) return NextResponse.json({ error: 'customerId or caseId is required' }, { status: 400 });
    const customer = await db.prepare('SELECT id FROM customers WHERE id = ?').get(effectiveCustomerId);
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    const effectiveAmount = caseRecord?.amount_at_risk ?? amount;
    if (!Number.isSafeInteger(effectiveAmount) || effectiveAmount <= 0 || (amount != null && caseRecord && amount !== caseRecord.amount_at_risk)) {
      return NextResponse.json({ error: 'A valid amount matching the recovery case is required' }, { status: 400 });
    }

    // Record or update payment record
    await db.prepare(`
      INSERT INTO payments (
        id, customer_id, amount, status, method, provider_payment_id, attempted_at, created_at
      ) VALUES (?, ?, ?, 'success', 'card', ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET 
        status = 'success',
        provider_payment_id = excluded.provider_payment_id,
        attempted_at = excluded.attempted_at
    `).run(
      razorpay_payment_id,
      effectiveCustomerId,
      effectiveAmount,
      razorpay_payment_id
    );

    // If linked to a recovery case, resolve it
    if (caseId) {
      if (caseRecord && caseRecord.status !== 'recovered') {
        await processRecoveryOutcome(caseId, {
          success: true,
          providerPaymentId: razorpay_payment_id,
          amount: effectiveAmount
        });
      }
    }

    await auditLog({
      entityType: 'payment',
      entityId: razorpay_payment_id,
      eventType: 'razorpay_payment_verified',
      actor: 'system',
      description: `Razorpay payment verified for order ${razorpay_order_id || 'direct'}`,
      details: { caseId, customerId, razorpay_order_id, razorpay_payment_id },
      amount: effectiveAmount
    });

    return NextResponse.json({
      success: true,
      message: 'Razorpay payment verified successfully',
      paymentId: razorpay_payment_id,
      caseId
    });
  } catch (error) {
    console.error('Razorpay Verification Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
