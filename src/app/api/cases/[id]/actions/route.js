import { NextResponse } from 'next/server'
import { getDb, auditLog } from '@/lib/db/database'
import { executeRecoveryAction } from '@/lib/engine/orchestrator'
import { checkGuardrails } from '@/lib/engine/guardrails'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request, { params }) {
  try {
    const { id } = await params
    const { actionType, execute } = await request.json()
    const db = getDb()

    const allowedActionTypes = new Set(['retry', 'payment_link', 'email', 'sms', 'cart_reminder', 'discount', 'free_shipping', 'targeted_campaign', 'escalate', 'no_action'])
    if (!allowedActionTypes.has(actionType)) return NextResponse.json({ error: 'Unsupported actionType' }, { status: 400 })

    const caseRecord = await db.prepare(`SELECT * FROM recovery_cases WHERE id = ?`).get(id)
    if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

    const newActionId = uuidv4()
    
    // Guardrails check
    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(caseRecord.customer_id)
    const history = await db.prepare('SELECT * FROM recovery_actions WHERE case_id = ?').all(id)
    const guardrailsResult = checkGuardrails(caseRecord, actionType, history, customer)
    if (!guardrailsResult.allowed) {
      return NextResponse.json({ error: 'Guardrails failed', details: guardrailsResult.violations }, { status: 403 })
    }

    await db.prepare(`
      INSERT INTO recovery_actions (id, case_id, action_type, status, scheduled_at, ai_reasoning, created_at)
      VALUES (?, ?, ?, 'pending', datetime('now'), 'Manual action created by user', datetime('now'))
    `).run(newActionId, id, actionType)

    await auditLog({ entityType: 'case', entityId: id, eventType: 'manual_action_created', actor: 'user', description: `Manual action ${actionType} created`, details: { actionId: newActionId, actionType } })

    let result = null
    if (execute) {
      await db.prepare(`UPDATE recovery_actions SET status = 'approved', approved_by = 'user' WHERE id = ?`).run(newActionId)
      result = await executeRecoveryAction(newActionId)
    }

    const savedAction = await db.prepare(`SELECT * FROM recovery_actions WHERE id = ?`).get(newActionId)

    return NextResponse.json({ action: savedAction, executionResult: result })
  } catch (error) {
    console.error('Case Actions POST Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
