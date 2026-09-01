import { NextResponse } from 'next/server'
import { getDb, auditLog } from '@/lib/db/database'
import { executeRecoveryAction } from '@/lib/engine/orchestrator'
import { v4 as uuidv4 } from 'uuid'

export async function GET(request, { params }) {
  try {
    const { id } = await params
    const db = getDb()

    const caseRecord = await db.prepare(`SELECT * FROM recovery_cases WHERE id = ?`).get(id)
    if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

    const customer = await db.prepare(`SELECT * FROM customers WHERE id = ?`).get(caseRecord.customer_id)
    const recoveryActions = await db.prepare(`SELECT * FROM recovery_actions WHERE case_id = ? ORDER BY created_at ASC`).all(id)
    const auditEntries = await db.prepare(`SELECT * FROM audit_log WHERE entity_id = ? ORDER BY created_at ASC`).all(id)
    const payment = await db.prepare(`SELECT * FROM payments WHERE id = ?`).get(caseRecord.payment_id)
    const subscription = customer ? (await db.prepare(`SELECT * FROM subscriptions WHERE customer_id = ?`).get(customer.id)) : null
    const invoice = payment ? (await db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(payment.invoice_id)) : null

    return NextResponse.json({
      case: caseRecord,
      customer,
      actions: recoveryActions,
      recoveryActions,
      auditEntries,
      payment,
      subscription,
      invoice
    })
  } catch (error) {
    console.error('Case Detail GET Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, notes } = body
    let { actionId } = body
    const db = getDb()

    const caseRecord = await db.prepare(`SELECT * FROM recovery_cases WHERE id = ?`).get(id)
    if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

    if (notes) {
      auditLog({ entityType: 'case', entityId: id, eventType: 'case_updated', actor: 'user', description: `Note added: ${notes}`, details: { notes } })
      return NextResponse.json({ success: true, message: 'Note recorded' })
    }

    if (action === 'approve') {
      if (!actionId) {
        const pendingAction = await db.prepare(`SELECT id FROM recovery_actions WHERE case_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`).get(id)
        if (pendingAction) actionId = pendingAction.id
      }
      if (!actionId) return NextResponse.json({ error: 'No pending action found to approve' }, { status: 400 })

      await db.prepare(`UPDATE recovery_actions SET status = 'approved', approved_by = 'user' WHERE id = ?`).run(actionId)
      auditLog({ entityType: 'case', entityId: id, eventType: 'action_approved', actor: 'user', description: `Action approved by user`, details: { actionId } })
      const result = await executeRecoveryAction(actionId)
      return NextResponse.json(result)
    }

    if (action === 'execute') {
      if (!actionId) {
        const pendingAction = await db.prepare(`SELECT id FROM recovery_actions WHERE case_id = ? AND status IN ('pending', 'approved') ORDER BY created_at DESC LIMIT 1`).get(id)
        if (pendingAction) actionId = pendingAction.id
      }
      if (!actionId) return NextResponse.json({ error: 'No action found to execute' }, { status: 400 })

      const result = await executeRecoveryAction(actionId)
      return NextResponse.json(result)
    }

    if (action === 'stop') {
      await db.prepare(`UPDATE recovery_cases SET status = 'stopped', resolved_at = datetime('now') WHERE id = ?`).run(id)
      auditLog({ entityType: 'case', entityId: id, eventType: 'case_stopped', actor: 'user', description: 'Case stopped by user', details: {} })
      return NextResponse.json({ success: true, message: 'Case stopped' })
    }

    if (action === 'escalate') {
      const newActionId = uuidv4()
      await db.prepare(`
        INSERT INTO recovery_actions (id, case_id, action_type, status, scheduled_at, ai_reasoning, created_at)
        VALUES (?, ?, 'escalate', 'pending', datetime('now'), 'Manually escalated by user', datetime('now'))
      `).run(newActionId, id)
      auditLog({ entityType: 'case', entityId: id, eventType: 'escalation_requested', actor: 'user', description: 'Case escalated to human agent', details: { actionId: newActionId } })
      return NextResponse.json({ success: true, actionId: newActionId })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Case Detail PATCH Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
