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

    if (!razorpay_payment_id) {
      return NextResponse.json({ error: 'razorpay_payment_id is required' }, { status: 400 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    // Verify signature if secret is configured
    if (keySecret && razorpay_order_id && razorpay_signature) {
      const isValid = RazorpayProvider.verifyPaymentSignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      }, keySecret);

      if (!isValid) {
        auditLog({
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
    const effectiveAmount = amount || 50000;

    // Record or update payment record
    db.prepare(`
      INSERT INTO payments (
        id, customer_id, amount, status, method, provider_payment_id, attempted_at, created_at
      ) VALUES (?, ?, ?, 'success', 'card', ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET 
        status = 'success',
        provider_payment_id = excluded.provider_payment_id,
        attempted_at = excluded.attempted_at
    `).run(
      razorpay_payment_id,
      customerId || 'direct_customer',
      effectiveAmount,
      razorpay_payment_id
    );

    // If linked to a recovery case, resolve it
    if (caseId) {
      const caseRecord = db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(caseId);
      if (caseRecord && caseRecord.status !== 'recovered') {
        await processRecoveryOutcome(caseId, {
          success: true,
          providerPaymentId: razorpay_payment_id,
          amount: effectiveAmount
        });
      }
    }

    auditLog({
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
