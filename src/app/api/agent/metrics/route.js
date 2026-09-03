import { NextResponse } from 'next/server.js';
import { getDb } from '../../../../lib/db/database.js';

/**
 * GET /api/agent/metrics — aggregate stats for the dashboard's "Agent"
 * panel. Derived entirely from audit_log entries the agent itself wrote
 * (actor = 'agent') plus the recovery_cases those entries reference —
 * no new business tables, nothing that could drift from the ledger the
 * rest of the dashboard already trusts.
 */
export async function GET() {
  try {
    const db = getDb();

    const agentCaseRows = await db.prepare(`
      SELECT DISTINCT entity_id as id FROM audit_log WHERE actor = 'agent' AND entity_type = 'case'
    `).all();
    const caseIds = (agentCaseRows || []).map((r) => r.id);

    if (caseIds.length === 0) {
      return NextResponse.json({ enabled: false, casesProcessed: 0 });
    }

    const placeholders = caseIds.map(() => '?').join(',');
    const cases = await db.prepare(`SELECT * FROM recovery_cases WHERE id IN (${placeholders})`).all(...caseIds);

    const stoppedEntries = await db.prepare(`
      SELECT details FROM audit_log WHERE actor = 'agent' AND event_type = 'decision.agent_stopped'
    `).all();
    const loopStats = (stoppedEntries || [])
      .map((e) => { try { return JSON.parse(e.details); } catch { return null; } })
      .filter(Boolean);

    const automaticActionsRow = await db.prepare(`
      SELECT COUNT(*) as count FROM audit_log WHERE actor = 'agent' AND event_type = 'decision.action_selected'
    `).get();

    const totalRevenueAtRisk = cases.reduce((sum, c) => sum + (c.amount_at_risk || 0), 0);
    const totalRecovered = cases.reduce((sum, c) => sum + (c.recovered_amount || 0), 0);
    const recoveredCount = cases.filter((c) => c.status === 'recovered').length;
    const stoppedCount = cases.filter((c) => c.status === 'stopped').length;
    const escalatedCount = loopStats.filter((l) => l.outcome === 'ESCALATE').length;
    const avgAttempts = loopStats.length > 0 ? loopStats.reduce((sum, l) => sum + (l.attempts || 0), 0) / loopStats.length : 0;

    return NextResponse.json({
      enabled: true,
      casesProcessed: cases.length,
      totalRevenueAtRisk,
      totalRecovered,
      recoveryRate: cases.length > 0 ? (recoveredCount / cases.length) * 100 : 0,
      recoveredCount,
      escalatedCount,
      stoppedCount,
      automaticActions: automaticActionsRow?.count || 0,
      avgAttempts,
    });
  } catch (error) {
    console.error('Agent Metrics Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
