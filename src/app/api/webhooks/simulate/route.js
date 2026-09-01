import { NextResponse } from 'next/server.js';
import { getDb, auditLog } from '../../../../lib/db/database.js';
import { processFailedPayment, processRecoveryOutcome } from '../../../../lib/engine/orchestrator.js';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request) {
  try {
    const rawBody = await request.text();

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

    const paymentId = paymentEntity?.id || (orderEntity ? `order_pay_${orderEntity.id}` : (paymentLinkEntity ? `plink_pay_${paymentLinkEntity.id}` : `pay_${event_id || uuidv4()}`));
    const entityNotes = paymentEntity?.notes || orderEntity?.notes || paymentLinkEntity?.notes || {};
    const noteCaseId = entityNotes.caseId || entityNotes.case_id || null;
    const noteCustomerId = entityNotes.customerId || entityNotes.customer_id || null;
    const idempotencyKey = `${event}_${paymentId}`;
    const db = getDb();

    // Check before creating a fallback customer so a repeated simulator event
    // cannot create an orphan customer record.
    const existingEvent = await db.prepare('SELECT id FROM events WHERE idempotency_key = ?').get(idempotencyKey);
    if (existingEvent) {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    // Determine customer ID
    let customerId = paymentEntity?.customer_id || noteCustomerId || null;
    const customerEmail = paymentEntity?.email || paymentLinkEntity?.customer?.email || null;
    const customerContact = paymentEntity?.contact || paymentLinkEntity?.customer?.contact || null;

    if (!customerId && customerEmail) {
      const existingCustomer = await db.prepare('SELECT id FROM customers WHERE email = ?').get(customerEmail);
      if (existingCustomer) customerId = existingCustomer.id;
    }

    if (!customerId) {
      customerId = `cust_${uuidv4().substring(0, 8)}`;
      const now = new Date().toISOString();
      await db.prepare(`
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
        now, now
      );
    } else {
      const customerExists = await db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
      if (!customerExists) {
        const now = new Date().toISOString();
        await db.prepare(`
          INSERT INTO customers (
            id, name, email, phone, company, plan, mrr, lifetime_value, payment_method,
            risk_score, total_payments, successful_payments, failed_payments,
            discount_affinity, avg_order_value, opted_out, intervention_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'starter', ?, ?, ?, 0.3, 1, 1, 0, 0.5, ?, 0, 0, ?, ?)
        `).run(
          customerId,
          'Customer ' + customerId.substring(0, 6),
          `${customerId}@example.com`,
          null,
          'Direct Account',
          paymentEntity?.amount || 50000,
          (paymentEntity?.amount || 50000) * 3,
          paymentEntity?.method || 'card',
          paymentEntity?.amount || 50000,
          now, now
        );
      }
    }

    const amount = paymentEntity?.amount || orderEntity?.amount || paymentLinkEntity?.amount || 0;
    const failureReason = paymentEntity?.error_code || paymentEntity?.error_reason || paymentEntity?.failure_reason || 'payment_failed';

    let triggeredCaseId = null;

    if (event === 'payment.failed') {
      const existingPayment = paymentId ? (await db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId)) : null;

      if (!existingPayment || existingPayment.status !== 'success') {
        await db.prepare(`
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

        await auditLog({
          entityType: 'webhook',
          entityId: paymentId || 'failed_payment',
          eventType: 'payment_failed_webhook',
          actor: 'simulator',
          description: `[SIMULATED] Razorpay payment failed: ${failureReason}`,
          details: { event, amount, failureReason, caseId: triggeredCaseId },
          amount
        });
      }
    } else if (event === 'payment.authorized') {
      // Authorization is intentionally not treated as a recovered payment.
      await db.prepare(`
        INSERT INTO payments (id, customer_id, subscription_id, invoice_id, amount, status, method, provider_payment_id, attempted_at)
        VALUES (?, ?, ?, ?, ?, 'authorized', ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          status = 'authorized',
          provider_payment_id = excluded.provider_payment_id,
          attempted_at = excluded.attempted_at
      `).run(
        paymentId, customerId, paymentEntity?.subscription_id || null,
        paymentEntity?.invoice_id || null, amount,
        paymentEntity?.method || 'card', paymentEntity?.id || paymentId
      );
      await auditLog({
        entityType: 'webhook', entityId: paymentId, eventType: 'payment_authorized_webhook', actor: 'simulator',
        description: '[SIMULATED] Payment authorized; awaiting capture before recovery settlement',
        details: { event, amount, customerId }, amount
      });
    } else if (
      event === 'payment.captured' ||
      event === 'order.paid' ||
      event === 'payment_link.paid' ||
      event === 'subscription.charged'
    ) {
      if (paymentId) {
        await db.prepare(`
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

      // Link to matching RecoveryCase
      let targetCases = [];
      if (noteCaseId) {
        const specificCase = await db.prepare(`SELECT id FROM recovery_cases WHERE id = ? AND status IN ('open', 'in_progress')`).get(noteCaseId);
        if (specificCase) targetCases.push(specificCase);
      }

      if (targetCases.length === 0 && paymentId) {
        targetCases = await db.prepare(`
          SELECT id FROM recovery_cases 
          WHERE payment_id = ? AND status IN ('open', 'in_progress')
          ORDER BY opened_at DESC
        `).all(paymentId);
      }

      for (const c of (targetCases || [])) {
        await processRecoveryOutcome(c.id, {
          success: true,
          providerPaymentId: paymentEntity?.id || paymentId,
          amount
        });
        triggeredCaseId = c.id;
      }

      await auditLog({
        entityType: 'webhook',
        entityId: paymentId || 'captured_payment',
        eventType: 'payment_success_webhook',
        actor: 'simulator',
        description: `[SIMULATED] Payment captured: ₹${(amount / 100).toFixed(0)}`,
        details: { event, amount, customerId, resolvedCases: (targetCases || []).map(c => c.id) },
        amount
      });
    }

    // Persist event with idempotency key
    await db.prepare(`
      INSERT INTO events (id, event_type, customer_id, payment_id, source, amount, metadata, idempotency_key, processed, created_at)
      VALUES (?, ?, ?, ?, 'simulator', ?, ?, ?, 1, datetime('now'))
    `).run(
      uuidv4(),
      event,
      customerId,
      paymentId,
      amount,
      JSON.stringify({ event, payload, simulated: true }),
      idempotencyKey
    );

    return NextResponse.json({
      received: true,
      simulated: true,
      event,
      paymentId,
      caseId: triggeredCaseId
    });
  } catch (error) {
    console.error('Simulated Webhook Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
