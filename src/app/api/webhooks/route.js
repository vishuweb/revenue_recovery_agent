import { NextResponse } from 'next/server'
import { getDb, auditLog } from '@/lib/db/database'
import { processFailedPayment, processRecoveryOutcome } from '@/lib/engine/orchestrator'

export async function POST(request) {
  try {
    const data = await request.json()
    const { event, payload } = data

    if (!event || !payload || !payload.payment) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const db = getDb()

    if (event === 'payment.failed') {
      const p = payload.payment.entity || payload.payment
      let paymentId = p.id
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
    else if (event === 'payment.captured' || event === 'subscription.charged') {
      const p = payload.payment.entity || payload.payment
      let paymentId = p.id
      
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

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
