import { NextResponse } from 'next/server.js';
import { getDb } from '../../../../lib/db/database.js';

/**
 * GET /api/agent/strategies — per-strategy effectiveness, computed
 * directly from persisted agent-run recovery_actions/recovery_cases rows
 * (actor = 'agent', identified the same way /api/agent/metrics does).
 * No separate metrics pipeline — this is the evidence that the agent is
 * optimizing recovery rather than uniformly retrying everything (Buildathon
 * spec section 7).
 *
 * "Recovered" here means the action's parent case ultimately reached
 * status='recovered' — an approximation when multiple actions preceded a
 * recovery (the same approximation lib/engine/attribution.js already makes
 * explicit for the deterministic pipeline), not a claim of sole causation.
 */
export async function GET() {
  try {
    const db = getDb();

    const rows = await db.prepare(`
      SELECT
        ra.action_type as action,
        COUNT(*) as attempts,
        SUM(CASE WHEN rc.status = 'recovered' THEN 1 ELSE 0 END) as recovered,
        SUM(CASE WHEN rc.status = 'recovered' THEN rc.recovered_amount ELSE 0 END) as recoveredAmount
      FROM recovery_actions ra
      JOIN recovery_cases rc ON ra.case_id = rc.id
      WHERE ra.status = 'completed' AND ra.ai_reasoning LIKE '[Agent%'
      GROUP BY ra.action_type
      ORDER BY recovered DESC, attempts DESC
    `).all();

    const strategies = (rows || []).map((r) => ({
      action: r.action,
      attempts: r.attempts,
      recovered: r.recovered,
      recoveredAmount: r.recoveredAmount || 0,
      successRate: r.attempts > 0 ? (r.recovered / r.attempts) * 100 : 0,
    }));

    const escalations = await db.prepare(`
      SELECT COUNT(*) as count FROM recovery_actions
      WHERE action_type = 'escalate' AND ai_reasoning LIKE '[Agent%'
    `).get();

    const memoryInfluencedCount = await db.prepare(`
      SELECT COUNT(*) as count FROM audit_log
      WHERE actor = 'agent' AND event_type = 'decision.memory_applied'
    `).get();

    return NextResponse.json({
      strategies,
      escalations: escalations?.count || 0,
      memoryInfluencedDecisions: memoryInfluencedCount?.count || 0,
    });
  } catch (error) {
    console.error('Agent Strategies Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
