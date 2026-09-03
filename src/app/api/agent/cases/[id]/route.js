import { NextResponse } from 'next/server.js';
import { getDb } from '../../../../../lib/db/database.js';
import { getRelevantRecoveryPatterns } from '../../../../../lib/memory/memoryService.js';

/**
 * GET /api/agent/cases/:id — the agent-specific view of a case: its
 * decision timeline (audit_log entries written by actor='agent') plus the
 * long-term memory patterns that informed the decision. Purely additive —
 * the existing /api/cases/:id endpoint and case detail page are untouched.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const db = getDb();

    const caseRecord = await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(id);
    if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    const agentTimeline = await db.prepare(`
      SELECT * FROM audit_log WHERE entity_id = ? AND actor = 'agent' ORDER BY created_at ASC
    `).all(id);

    const memory = getRelevantRecoveryPatterns(caseRecord.customer_id, caseRecord.failure_category);

    const stoppedEntry = agentTimeline.find((e) => e.event_type === 'decision.agent_stopped');
    const stoppedDetails = stoppedEntry?.details ? JSON.parse(stoppedEntry.details) : null;

    return NextResponse.json({
      case: caseRecord,
      isAgentCase: agentTimeline.length > 0,
      timeline: agentTimeline,
      memory,
      loopSummary: stoppedDetails,
    });
  } catch (error) {
    console.error('Agent Case Detail Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
