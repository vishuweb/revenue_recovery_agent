import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/database'
import { estimateNaiveBaseline } from '@/lib/engine/attribution'

export async function GET() {
  try {
    const db = getDb()

    const totalRevenueRow = await db.prepare(`SELECT SUM(amount) as sum FROM payments WHERE status = 'success'`).get()
    const revenueAtRiskRow = await db.prepare(`SELECT SUM(amount_at_risk) as sum FROM recovery_cases WHERE status IN ('open', 'in_progress')`).get()
    const revenueRecoveredRow = await db.prepare(`SELECT SUM(recovered_amount) as sum FROM recovery_cases WHERE status = 'recovered'`).get()
    const failedCasesAtRiskRow = await db.prepare(`SELECT SUM(amount_at_risk) as sum FROM recovery_cases WHERE status = 'failed'`).get()
    
    const revenueRecovered = revenueRecoveredRow?.sum || 0
    const failedCasesAtRisk = failedCasesAtRiskRow?.sum || 0
    const recoveryRate = revenueRecovered + failedCasesAtRisk > 0 
      ? (revenueRecovered / (revenueRecovered + failedCasesAtRisk)) * 100 
      : 0

    const customersAtRiskRow = await db.prepare(`SELECT COUNT(DISTINCT customer_id) as count FROM recovery_cases WHERE status IN ('open', 'in_progress')`).get()
    const activeCasesRow = await db.prepare(`SELECT COUNT(*) as count FROM recovery_cases WHERE status IN ('open', 'in_progress')`).get()
    const totalFailedPaymentsRow = await db.prepare(`SELECT COUNT(*) as count FROM payments WHERE status = 'failed'`).get()
    const avgRecoveryProbabilityRow = await db.prepare(`SELECT AVG(recovery_probability) as avg FROM recovery_cases WHERE status IN ('open', 'in_progress')`).get()

    const failureReasons = await db.prepare(`
      SELECT failure_reason as reason, COUNT(*) as count, SUM(amount) as amount 
      FROM payments 
      WHERE status = 'failed' 
      GROUP BY failure_reason
    `).all()

    const recentCases = await db.prepare(`
      SELECT rc.*, c.name as customer_name 
      FROM recovery_cases rc
      JOIN customers c ON rc.customer_id = c.id
      ORDER BY rc.opened_at DESC
      LIMIT 10
    `).all()

    const recoveryTrend = await db.prepare(`
      SELECT 
        date(opened_at) as date,
        SUM(CASE WHEN status = 'recovered' THEN recovered_amount ELSE 0 END) as recovered,
        SUM(CASE WHEN status IN ('open', 'in_progress') THEN amount_at_risk ELSE 0 END) as atRisk
      FROM recovery_cases
      WHERE date(opened_at) >= date('now', '-30 days')
      GROUP BY date(opened_at)
      ORDER BY date(opened_at) ASC
    `).all()

    const statusBreakdownRows = await db.prepare(`SELECT status, COUNT(*) as count FROM recovery_cases GROUP BY status`).all()
    const statusBreakdown = { open: 0, in_progress: 0, recovered: 0, failed: 0, stopped: 0, expired: 0 }
    for (const row of (statusBreakdownRows || [])) {
      if (statusBreakdown[row.status] !== undefined) statusBreakdown[row.status] = row.count
    }

    let interventionCost = 0
    try {
      const interventionCostRow = await db.prepare(`SELECT COALESCE(SUM(intervention_cost), 0) as sum FROM recovery_cases`).get()
      interventionCost = interventionCostRow?.sum || 0
    } catch (e) {
      // column might not exist in old schema
    }
    const netRecovery = revenueRecovered - interventionCost

    const recoveryByAction = await db.prepare(`
      SELECT recommended_action as action, COUNT(*) as count, COALESCE(SUM(recovered_amount),0) as recovered 
      FROM recovery_cases 
      GROUP BY recommended_action
    `).all()

    const recoveryBySegment = await db.prepare(`
      SELECT c.plan, COUNT(*) as count, SUM(rc.amount_at_risk) as atRisk, SUM(rc.recovered_amount) as recovered 
      FROM recovery_cases rc 
      JOIN customers c ON rc.customer_id = c.id 
      GROUP BY c.plan
    `).all()

    let eventBreakdown = []
    try {
      eventBreakdown = await db.prepare(`SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type`).all()
    } catch (e) {
      // table might not exist in old schema
    }

    let attributionBreakdown = []
    try {
      attributionBreakdown = await db.prepare(`
        SELECT attribution_type, COUNT(*) as count, 
          COALESCE(SUM(recovered_amount), 0) as recovered,
          COALESCE(SUM(amount_at_risk), 0) as atRisk
        FROM recovery_cases
        GROUP BY attribution_type
      `).all()
    } catch (e) {
      // column might not exist in old schema
    }

    let strategyComparison = null
    try {
      const allCases = await db.prepare(`
        SELECT amount_at_risk, recovered_amount, failure_category FROM recovery_cases
      `).all()
      strategyComparison = estimateNaiveBaseline(allCases || [])
    } catch (e) {
      // column might not exist in old schema
    }

    let noActionCount = 0
    try {
      const noActionRow = await db.prepare(`
        SELECT COUNT(*) as count FROM recovery_cases WHERE recommended_action = 'no_action'
      `).get()
      noActionCount = noActionRow?.count || 0
    } catch (e) {
      // column might not exist in old schema
    }

    let avgNEV = 0
    try {
      const avgNEVRow = await db.prepare(`
        SELECT AVG(net_expected_value) as avg FROM recovery_cases WHERE status IN ('open', 'in_progress')
      `).get()
      avgNEV = avgNEVRow?.avg || 0
    } catch (e) {
      // column might not exist in old schema
    }

    return NextResponse.json({
      totalRevenue: totalRevenueRow?.sum || 0,
      revenueAtRisk: revenueAtRiskRow?.sum || 0,
      revenueRecovered,
      recoveryRate,
      customersAtRisk: customersAtRiskRow?.count || 0,
      activeCases: activeCasesRow?.count || 0,
      totalFailedPayments: totalFailedPaymentsRow?.count || 0,
      avgRecoveryProbability: avgRecoveryProbabilityRow?.avg || 0,
      failureReasons: failureReasons || [],
      recentCases: recentCases || [],
      recoveryTrend: recoveryTrend || [],
      statusBreakdown,
      interventionCost,
      netRecovery,
      recoveryByAction: recoveryByAction || [],
      recoveryBySegment: recoveryBySegment || [],
      eventBreakdown: eventBreakdown || [],
      attributionBreakdown: attributionBreakdown || [],
      strategyComparison,
      noActionCount,
      avgNEV
    })
  } catch (error) {
    console.error('Dashboard Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
