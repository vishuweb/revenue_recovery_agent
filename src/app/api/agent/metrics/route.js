import { NextResponse } from 'next/server.js';
import { getDb } from '../../../../lib/db/database.js';

/**
 * GET /api/agent/metrics — aggregate stats for the dashboard's "Agent"
 * panel. Derived entirely from audit_log entries the agent itself wrote
 * (actor = 'agent') plus the recovery_cases those entries reference —
 * no new business tables, nothing that could drift from the ledger the
 * rest of the dashboard already trusts.
 *
 * STOPPED and FAILED are both persisted as recovery_cases.status='stopped'
 * (no separate DB status exists for "exhausted retries" vs "policy
 * stopped") — this endpoint tells them apart using the outcome recorded
 * in each case's `decision.agent_stopped` audit entry instead.
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
      SELECT entity_id, details FROM audit_log WHERE actor = 'agent' AND event_type = 'decision.agent_stopped'
    `).all();
    // Keep only the latest agent_stopped entry per case (a paused-then-resumed
    // case can accumulate several before finally settling).
    const latestByCase = new Map();
    for (const e of (stoppedEntries || [])) {
      let details;
      try { details = JSON.parse(e.details); } catch { continue; }
      latestByCase.set(e.entity_id, details);
    }
    const loopStats = [...latestByCase.values()];

    const automaticActionsRow = await db.prepare(`
      SELECT COUNT(*) as count FROM audit_log WHERE actor = 'agent' AND event_type = 'decision.action_selected'
    `).get();

    const totalRevenueAtRisk = cases.reduce((sum, c) => sum + (c.amount_at_risk || 0), 0);
    const totalRecovered = cases.reduce((sum, c) => sum + (c.recovered_amount || 0), 0);
    const recoveredCases = cases.filter((c) => c.status === 'recovered');
    const recoveredCount = recoveredCases.length;
    const escalatedCount = loopStats.filter((l) => l.outcome === 'ESCALATE' && !l.paused).length;
    const failedCount = loopStats.filter((l) => l.outcome === 'FAILED').length;
    const stoppedCount = loopStats.filter((l) => l.outcome === 'STOPPED').length;
    const pausedCount = cases.filter((c) => ['open', 'in_progress'].includes(c.status)).length - escalatedCount;
    const nonPausedLoops = loopStats.filter((l) => !l.paused);
    const avgAttempts = nonPausedLoops.length > 0 ? nonPausedLoops.reduce((sum, l) => sum + (l.attempts || 0), 0) / nonPausedLoops.length : 0;

    const recoveryTimesMs = recoveredCases
      .filter((c) => c.opened_at && c.resolved_at)
      .map((c) => new Date(c.resolved_at).getTime() - new Date(c.opened_at).getTime())
      .filter((ms) => Number.isFinite(ms) && ms >= 0);
    const avgRecoveryTimeMs = recoveryTimesMs.length > 0 ? recoveryTimesMs.reduce((a, b) => a + b, 0) / recoveryTimesMs.length : 0;

    return NextResponse.json({
      enabled: true,
      casesProcessed: cases.length,
      totalRevenueAtRisk,
      totalRecovered,
      recoveryRate: cases.length > 0 ? (recoveredCount / cases.length) * 100 : 0,
      recoveredCount,
      escalatedCount,
      stoppedCount,
      failedCount,
      pausedCount: Math.max(0, pausedCount),
      automaticActions: automaticActionsRow?.count || 0,
      avgAttempts,
      avgRecoveryTimeMs,
    });
  } catch (error) {
    console.error('Agent Metrics Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
