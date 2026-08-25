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

    const caseRecord = db.prepare(`SELECT * FROM recovery_cases WHERE id = ?`).get(id)
    if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

    const newActionId = uuidv4()
    
    const actionObj = {
      id: newActionId,
      case_id: id,
      type: actionType,
      status: 'pending',
      priority: 'high',
      scheduled_for: new Date().toISOString(),
      created_at: new Date().toISOString()
    }
    
    // Guardrails check could be simulated here, or pass action directly
    const guardrailsResult = checkGuardrails(caseRecord, actionType, [], null)
    if (!guardrailsResult.allowed) {
      return NextResponse.json({ error: 'Guardrails failed', details: guardrailsResult.violations }, { status: 403 })
    }

    db.prepare(`
      INSERT INTO recovery_actions (id, case_id, action_type, status, scheduled_at, ai_reasoning, created_at)
      VALUES (?, ?, ?, 'pending', datetime('now'), 'Manual action created by user', datetime('now'))
    `).run(newActionId, id, actionType)

    auditLog({ entityType: 'case', entityId: id, eventType: 'manual_action_created', actor: 'user', description: `Manual action ${actionType} created`, details: { actionId: newActionId, actionType } })

    let result = null
    if (execute) {
      db.prepare(`UPDATE recovery_actions SET status = 'approved', approved_by = 'user' WHERE id = ?`).run(newActionId)
      result = await executeRecoveryAction(newActionId)
    }

    const savedAction = db.prepare(`SELECT * FROM recovery_actions WHERE id = ?`).get(newActionId)

    return NextResponse.json({ action: savedAction, executionResult: result })
  } catch (error) {
    console.error('Case Actions POST Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
