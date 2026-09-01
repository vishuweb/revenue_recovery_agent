import { NextResponse } from 'next/server'
import { resetDatabase } from '@/lib/db/database'
import { generateSimulationData } from '@/lib/simulation/generator'
import { triggerScenario } from '@/lib/simulation/scenarios'
import { executeRecoveryAction, processRecoveryOutcome, processFailedPayment, processEvent, processPendingAutomations } from '@/lib/engine/orchestrator'
import { getDb } from '@/lib/db/database'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request) {
  try {
    const { command, params } = await request.json()
    const db = getDb()

    if (command === 'seed') {
      await resetDatabase()
      const stats = await generateSimulationData()
      return NextResponse.json({ success: true, message: 'Database seeded', stats })
    }

    if (command === 'trigger_event') {
      let { eventType, customerId, amount } = params || {}
      if (!eventType) return NextResponse.json({ error: 'eventType required' }, { status: 400 })
      
      if (!customerId) {
        const randomCustomer = await db.prepare(`SELECT id FROM customers ORDER BY RANDOM() LIMIT 1`).get()
        if (!randomCustomer) return NextResponse.json({ error: 'No customers found' }, { status: 404 })
        customerId = randomCustomer.id
      }

      const eventId = uuidv4()
      await db.prepare(`
        INSERT INTO events (id, event_type, customer_id, source, amount, metadata, processed, created_at)
        VALUES (?, ?, ?, 'simulator', ?, '{}', 0, datetime('now'))
      `).run(eventId, eventType, customerId, amount || 0)

      const result = await processEvent(eventId)
      return NextResponse.json({ success: true, eventId, case: result })
    }

    if (command === 'trigger_scenario') {
      const result = await triggerScenario(params?.scenario || 'random')
      return NextResponse.json({ success: true, case: result })
    }

    if (command === 'execute_action') {
      if (!params?.actionId) return NextResponse.json({ error: 'actionId required' }, { status: 400 })
      const result = await executeRecoveryAction(params.actionId)
      return NextResponse.json({ success: true, result })
    }

    if (command === 'simulate_recovery') {
      if (!params?.caseId) return NextResponse.json({ error: 'caseId required' }, { status: 400 })
      const caseRecord = await db.prepare(`SELECT * FROM recovery_cases WHERE id = ?`).get(params.caseId)
      if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

      const newPaymentId = uuidv4()
      await db.prepare(`
        INSERT INTO payments (id, customer_id, subscription_id, invoice_id, amount, status, attempted_at)
        VALUES (?, ?, ?, ?, ?, 'success', datetime('now'))
      `).run(newPaymentId, caseRecord.customer_id, null, null, caseRecord.amount_at_risk)

      await processRecoveryOutcome(params.caseId, { success: true })
      
      const updatedCase = await db.prepare(`SELECT * FROM recovery_cases WHERE id = ?`).get(params.caseId)
      return NextResponse.json({ success: true, case: updatedCase })
    }

    if (command === 'simulate_failure') {
      if (!params?.caseId) return NextResponse.json({ error: 'caseId required' }, { status: 400 })
      const caseRecord = await db.prepare(`SELECT * FROM recovery_cases WHERE id = ?`).get(params.caseId)
      if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

      const newPaymentId = uuidv4()
      await db.prepare(`
        INSERT INTO payments (id, customer_id, subscription_id, invoice_id, amount, status, failure_reason, attempted_at)
        VALUES (?, ?, ?, ?, ?, 'failed', 'insufficient_funds', datetime('now'))
      `).run(newPaymentId, caseRecord.customer_id, null, null, caseRecord.amount_at_risk)

      await processFailedPayment(newPaymentId)

      const updatedCase = await db.prepare(`SELECT * FROM recovery_cases WHERE id = ?`).get(params.caseId)
      return NextResponse.json({ success: true, case: updatedCase })
    }

    if (command === 'bulk_scenarios') {
      const count = params?.count || 5
      const cases = []
      for (let i = 0; i < count; i++) {
        const c = await triggerScenario('random')
        cases.push(c)
      }
      return NextResponse.json({ success: true, cases })
    }

    // Execute Pipeline Sweep — triggered by "Execute Pipeline Sweep" button in the simulator UI.
    if (command === 'run_cron') {
      const results = await processPendingAutomations()
      return NextResponse.json({
        success: true,
        message: `Pipeline sweep complete: ${results.actionsProcessed} action(s) executed, ${results.paymentsProcessed} unhandled payment(s) queued`,
        results
      })
    }

    return NextResponse.json({ error: 'Unknown command' }, { status: 400 })
  } catch (error) {
    console.error('Simulator Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
