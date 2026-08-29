import { NextResponse } from 'next/server'
import { getDb, auditLog } from '@/lib/db/database'
import { processFailedPayment, processRecoveryOutcome } from '@/lib/engine/orchestrator'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request) {
  try {
    const rawBody = await request.text()

    if (rawBody.length > 1048576) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    let data
    try {
      data = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { event, payload } = data

    if (!event || !payload || !payload.payment) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const p = payload.payment.entity || payload.payment
    const paymentId = p.id || payload.payment.id

    // Webhook signature verification stub
    const signature = request.headers.get('x-razorpay-signature')
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET

    if (webhookSecret) {
      if (signature) {
        console.log(`[Webhook] Signature verification would happen for event: ${event}`)
      } else {
        auditLog({
          entityType: 'webhook',
          entityId: paymentId || 'webhook',
          eventType: 'webhook_signature_warning',
          actor: 'system',
          description: 'Webhook signature missing but RAZORPAY_WEBHOOK_SECRET is set',
          details: { event, warning: 'Missing x-razorpay-signature header' }
        })
      }
    }

    const idempotencyKey = `${event}_${payload.payment.id || payload.payment.entity?.id}`

    const db = getDb()

    // Idempotency check
    const existingEvent = db.prepare('SELECT id FROM events WHERE idempotency_key = ?').get(idempotencyKey)
    if (existingEvent) {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
    }

    if (event === 'payment.failed') {
      // Out-of-order handling: check if payment already has status 'success'
      const existingPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId)

      if (existingPayment && existingPayment.status === 'success') {
        auditLog({
          entityType: 'webhook',
          entityId: paymentId,
          eventType: 'payment_failed_out_of_order',
          actor: 'system',
          description: `Out-of-order webhook ignored: payment ${paymentId} already succeeded`,
          details: { event, payload, currentStatus: existingPayment.status }
        })
      } else {
        db.prepare(`
          INSERT INTO payments (id, customer_id, subscription_id, invoice_id, amount, status, failure_reason, attempted_at)
          VALUES (?, ?, ?, ?, ?, 'failed', ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET 
            status = 'failed',
            failure_reason = excluded.failure_reason,
            attempted_at = excluded.attempted_at
        `).run(paymentId, p.customer_id, p.subscription_id || null, p.invoice_id || null, p.amount, p.error_reason || p.failure_reason || 'unknown')
        
        await processFailedPayment(paymentId)
        auditLog({ entityType: 'webhook', entityId: paymentId, eventType: 'payment_failed_webhook', actor: 'system', description: `Payment failed webhook processed`, details: { event, payload } })
      }
    } else if (event === 'payment.captured' || event === 'subscription.charged') {
      db.prepare(`
        INSERT INTO payments (id, customer_id, subscription_id, invoice_id, amount, status, attempted_at)
        VALUES (?, ?, ?, ?, ?, 'success', datetime('now'))
        ON CONFLICT(id) DO UPDATE SET status = 'success'
      `).run(paymentId, p.customer_id, p.subscription_id || null, p.invoice_id || null, p.amount)

      const cases = db.prepare(`
        SELECT id FROM recovery_cases 
        WHERE customer_id = ? AND status IN ('open', 'in_progress')
      `).all(p.customer_id)

      for (const c of cases) {
        await processRecoveryOutcome(c.id, { success: true })
      }

      if (event === 'subscription.charged' && p.subscription_id) {
        db.prepare(`UPDATE subscriptions SET status = 'active' WHERE id = ?`).run(p.subscription_id)
      }

      auditLog({ entityType: 'webhook', entityId: paymentId, eventType: 'payment_success_webhook', actor: 'system', description: `Payment success webhook processed`, details: { event, payload } })
    }

    // Store the idempotency_key when inserting into the events table for the webhook event
    const eventId = uuidv4()
    const customerExists = p.customer_id ? db.prepare('SELECT id FROM customers WHERE id = ?').get(p.customer_id) : null
    const paymentExists = paymentId ? db.prepare('SELECT id FROM payments WHERE id = ?').get(paymentId) : null

    db.prepare(`
      INSERT INTO events (id, event_type, customer_id, payment_id, source, amount, metadata, idempotency_key, processed, created_at)
      VALUES (?, ?, ?, ?, 'webhook', ?, ?, ?, 1, datetime('now'))
    `).run(
      eventId,
      event,
      customerExists ? p.customer_id : null,
      paymentExists ? paymentId : null,
      p.amount || 0,
      JSON.stringify({ event, payload }),
      idempotencyKey
    )

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
