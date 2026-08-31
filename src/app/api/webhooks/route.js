import { NextResponse } from 'next/server';
import { getDb, auditLog } from '@/lib/db/database';
import { processFailedPayment, processRecoveryOutcome } from '@/lib/engine/orchestrator';
import { RazorpayProvider } from '@/lib/providers/razorpay';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request) {
  try {
    const rawBody = await request.text();

    if (rawBody.length > 1048576) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    // Webhook signature verification
    const signature = request.headers.get('x-razorpay-signature');
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (webhookSecret) {
      if (!signature) {
        auditLog({
          entityType: 'webhook',
          entityId: 'security',
          eventType: 'webhook_signature_missing',
          actor: 'system',
          description: 'Webhook signature header missing with secret configured',
          details: { warning: 'Missing x-razorpay-signature header' }
        });
        return NextResponse.json({ error: 'Missing webhook signature' }, { status: 400 });
      }

      const isValid = RazorpayProvider.verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        auditLog({
          entityType: 'webhook',
          entityId: 'security',
          eventType: 'webhook_signature_failed',
          actor: 'system',
          description: 'Webhook HMAC SHA256 signature verification failed',
          details: { error: 'Invalid x-razorpay-signature' }
        });
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
      }
    }

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { event, payload, event_id } = data;

    if (!event || !payload) {
      return NextResponse.json({ error: 'Invalid payload structure' }, { status: 400 });
    }

    // Extract entities from payload
    const paymentEntity = payload.payment?.entity || payload.payment;
    const orderEntity = payload.order?.entity || payload.order;
    const paymentLinkEntity = payload.payment_link?.entity || payload.payment_link;

    const paymentId = paymentEntity?.id || (orderEntity ? `order_pay_${orderEntity.id}` : (paymentLinkEntity ? `plink_pay_${paymentLinkEntity.id}` : null));
    const entityNotes = paymentEntity?.notes || orderEntity?.notes || paymentLinkEntity?.notes || {};
    const noteCaseId = entityNotes.caseId || entityNotes.case_id || null;
    const noteCustomerId = entityNotes.customerId || entityNotes.customer_id || null;

    const db = getDb();

    // Determine customer ID
    let customerId = paymentEntity?.customer_id || noteCustomerId || null;
    const customerEmail = paymentEntity?.email || paymentLinkEntity?.customer?.email || null;
    const customerContact = paymentEntity?.contact || paymentLinkEntity?.customer?.contact || null;

    if (!customerId && customerEmail) {
      const existingCustomer = db.prepare('SELECT id FROM customers WHERE email = ?').get(customerEmail);
      if (existingCustomer) {
        customerId = existingCustomer.id;
      }
    }

    // Auto-create or ensure customer exists if external webhook arrives
    if (!customerId) {
      customerId = `cust_${uuidv4().substring(0, 8)}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO customers (
          id, name, email, phone, company, plan, mrr, lifetime_value, payment_method,
          risk_score, total_payments, successful_payments, failed_payments,
          discount_affinity, avg_order_value, opted_out, intervention_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'starter', ?, ?, ?, 0.3, 1, 1, 0, 0.5, ?, 0, 0, ?, ?)
      `).run(
        customerId,
        paymentEntity?.notes?.customer_name || (customerEmail ? customerEmail.split('@')[0] : 'Test Customer'),
        customerEmail || `${customerId}@example.com`,
        customerContact || null,
        'Direct Client',
        paymentEntity?.amount || 50000,
        (paymentEntity?.amount || 50000) * 3,
        paymentEntity?.method || 'card',
        paymentEntity?.amount || 50000,
        now,
        now
      );
    } else {
      const customerExists = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
      if (!customerExists) {
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO customers (
            id, name, email, phone, company, plan, mrr, lifetime_value, payment_method,
            risk_score, total_payments, successful_payments, failed_payments,
            discount_affinity, avg_order_value, opted_out, intervention_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'starter', ?, ?, ?, 0.3, 1, 1, 0, 0.5, ?, 0, 0, ?, ?)
        `).run(
          customerId,
          paymentEntity?.notes?.customer_name || 'Customer ' + customerId.substring(0, 6),
          customerEmail || `${customerId}@example.com`,
          customerContact || null,
          'Direct Account',
          paymentEntity?.amount || 50000,
          (paymentEntity?.amount || 50000) * 3,
          paymentEntity?.method || 'card',
          paymentEntity?.amount || 50000,
          now,
          now
        );
      }
    }

    const idempotencyKey = `${event}_${paymentId || event_id || uuidv4()}`;

    // Idempotency check
    const existingEvent = db.prepare('SELECT id FROM events WHERE idempotency_key = ?').get(idempotencyKey);
    if (existingEvent) {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    const amount = paymentEntity?.amount || orderEntity?.amount || paymentLinkEntity?.amount || 0;
    const failureReason = paymentEntity?.error_code || paymentEntity?.error_reason || paymentEntity?.failure_reason || 'payment_failed';

    let triggeredCaseId = null;

    if (event === 'payment.failed') {
      const existingPayment = paymentId ? db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) : null;

      if (existingPayment && existingPayment.status === 'success') {
        auditLog({
          entityType: 'webhook',
          entityId: paymentId,
          eventType: 'payment_failed_out_of_order',
          actor: 'system',
          description: `Out-of-order webhook ignored: payment ${paymentId} already succeeded`,
          details: { event, currentStatus: existingPayment.status }
        });
      } else {
        db.prepare(`
          INSERT INTO payments (id, customer_id, subscription_id, invoice_id, amount, status, method, failure_reason, failure_source, provider_payment_id, attempted_at)
          VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, 'razorpay', ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET 
            status = 'failed',
            failure_reason = excluded.failure_reason,
            failure_source = 'razorpay',
            attempted_at = excluded.attempted_at
        `).run(
          paymentId || `pay_${uuidv4().substring(0, 8)}`,
          customerId,
          paymentEntity?.subscription_id || null,
          paymentEntity?.invoice_id || null,
          amount,
          paymentEntity?.method || 'card',
          failureReason,
          paymentEntity?.id || null
        );

        const result = await processFailedPayment(paymentId);
        triggeredCaseId = result.caseId;

        auditLog({
          entityType: 'webhook',
          entityId: paymentId || 'failed_payment',
          eventType: 'payment_failed_webhook',
          actor: 'razorpay',
          description: `Razorpay payment failed: ${failureReason}`,
          details: { event, amount, failureReason, caseId: triggeredCaseId },
          amount
        });
      }
    } else if (
      event === 'payment.captured' ||
      event === 'payment.authorized' ||
      event === 'order.paid' ||
      event === 'payment_link.paid' ||
      event === 'subscription.charged'
    ) {
      if (paymentId) {
        db.prepare(`
          INSERT INTO payments (id, customer_id, subscription_id, invoice_id, amount, status, method, provider_payment_id, attempted_at)
          VALUES (?, ?, ?, ?, ?, 'success', ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET 
            status = 'success',
            provider_payment_id = excluded.provider_payment_id,
            attempted_at = excluded.attempted_at
        `).run(
          paymentId,
          customerId,
          paymentEntity?.subscription_id || null,
          paymentEntity?.invoice_id || null,
          amount,
          paymentEntity?.method || 'card',
          paymentEntity?.id || paymentId
        );
      }

      // Link to matching RecoveryCase:
      let targetCases = [];
      if (noteCaseId) {
        const specificCase = db.prepare(`SELECT id FROM recovery_cases WHERE id = ? AND status IN ('open', 'in_progress')`).get(noteCaseId);
        if (specificCase) targetCases.push(specificCase);
      }

      if (targetCases.length === 0 && customerId) {
        targetCases = db.prepare(`
          SELECT id FROM recovery_cases 
          WHERE customer_id = ? AND status IN ('open', 'in_progress')
          ORDER BY opened_at DESC
        `).all(customerId);
      }

      for (const c of targetCases) {
        await processRecoveryOutcome(c.id, {
          success: true,
          providerPaymentId: paymentEntity?.id || paymentId,
          amount
        });
        triggeredCaseId = c.id;
      }

      if (event === 'subscription.charged' && paymentEntity?.subscription_id) {
        db.prepare(`UPDATE subscriptions SET status = 'active', updated_at = datetime('now') WHERE id = ?`).run(paymentEntity.subscription_id);
      }

      auditLog({
        entityType: 'webhook',
        entityId: paymentId || 'captured_payment',
        eventType: 'payment_success_webhook',
        actor: 'razorpay',
        description: `Razorpay payment recovered: ₹${(amount / 100).toFixed(0)}`,
        details: { event, amount, customerId, resolvedCases: targetCases.map(c => c.id) },
        amount
      });
    }

    // Persist event into events table with idempotency key
    const eventRecordId = uuidv4();
    db.prepare(`
      INSERT INTO events (id, event_type, customer_id, payment_id, source, amount, metadata, idempotency_key, processed, created_at)
      VALUES (?, ?, ?, ?, 'razorpay_webhook', ?, ?, ?, 1, datetime('now'))
    `).run(
      eventRecordId,
      event,
      customerId,
      paymentId,
      amount,
      JSON.stringify({ event, payload }),
      idempotencyKey
    );

    return NextResponse.json({
      received: true,
      event,
      paymentId,
      caseId: triggeredCaseId
    });
  } catch (error) {
    console.error('Razorpay Webhook Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
