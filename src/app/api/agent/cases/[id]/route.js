import { NextResponse } from 'next/server.js';
import { getDb } from '../../../../../lib/db/database.js';
import { getRelevantRecoveryPatterns } from '../../../../../lib/memory/memoryService.js';
import { describeStopReason } from '../../../../../lib/agent/stopReasons.js';

/**
 * Maps raw audit_log rows (written by both the agent, actor='agent', and
 * the shared execution engine it delegates to, actor='engine' — see
 * executeActionTool in lib/agent/tools/actionExecutor.js) into the 13
 * conceptual steps of the agent loop. Each step is only present if its
 * event actually happened for this case; a case that paused won't have an
 * "outcome observed" for a later step yet.
 */
const STEP_DEFINITIONS = [
  { key: 'event_detected', label: 'Event detected', match: (e) => e.event_type === 'decision.event_received' },
  { key: 'context_loaded', label: 'Customer context loaded', match: (e) => e.event_type === 'decision.context_loaded' },
  { key: 'failure_analyzed', label: 'Failure analyzed', match: (e) => e.event_type === 'decision.classified' || (e.event_type === 'decision.ai_unavailable' && e._details?.stage === 'analyze_failure') },
  { key: 'risk_calculated', label: 'Risk calculated', match: (e) => e.event_type === 'decision.predicted' },
  { key: 'memory_retrieved', label: 'Relevant memory retrieved', match: (e) => e.event_type === 'decision.memory_retrieved' },
  { key: 'candidates_evaluated', label: 'Candidate strategies evaluated', match: (e) => e.event_type === 'decision.candidates_generated' },
  { key: 'agent_decision', label: 'Agent decision', match: (e) => e.event_type === 'decision.action_selected' || (e.event_type === 'decision.ai_unavailable' && e._details?.stage === 'decide_recovery_action') || e.event_type === 'decision.memory_applied' },
  { key: 'policy_result', label: 'Policy result', match: (e) => e.event_type === 'decision.policy_checked' || e.event_type === 'decision.policy_rejected' },
  { key: 'action_executed', label: 'Action executed', match: (e) => ['decision.executed', 'decision.execution_failed', 'decision.dead_letter'].includes(e.event_type) },
  { key: 'outcome_observed', label: 'Outcome observed', match: (e) => ['decision.recovered', 'decision.recovery_attributed'].includes(e.event_type) },
  { key: 'memory_updated', label: 'Memory updated', match: (e) => e.event_type === 'decision.memory_updated' },
  { key: 'next_or_stop', label: 'Next action / stopping reason', match: (e) => ['decision.agent_stopped', 'decision.agent_resumed'].includes(e.event_type) },
];

function buildSteps(auditRows) {
  const enriched = auditRows.map((e) => {
    let details = null;
    try { details = e.details ? JSON.parse(e.details) : null; } catch { /* ignore */ }
    return { ...e, _details: details };
  });

  const steps = [];
  for (const def of STEP_DEFINITIONS) {
    const matches = enriched.filter(def.match);
    for (const entry of matches) {
      const aiAssisted = entry._details?.aiAssisted === true || entry.event_type === 'decision.memory_applied';
      steps.push({
        step: def.key,
        label: def.label,
        status: 'completed',
        timestamp: entry.created_at,
        explanation: entry._details?.message || entry.description,
        aiAssisted,
        deterministic: !aiAssisted,
        actor: entry.actor,
        data: entry._details,
      });
    }
  }
  steps.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return steps;
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const db = getDb();

    const caseRecord = await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(id);
    if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    // Full timeline for this case (both actors) — the agent delegates real
    // execution to the shared engine, which logs under actor='engine'.
    const fullTimeline = await db.prepare(`
      SELECT * FROM audit_log WHERE entity_id = ? ORDER BY created_at ASC
    `).all(id);

    const isAgentCase = fullTimeline.some((e) => e.actor === 'agent');
    if (!isAgentCase) {
      return NextResponse.json({ case: caseRecord, isAgentCase: false, timeline: [], steps: [], memory: null, loopSummary: null });
    }

    const memory = getRelevantRecoveryPatterns(caseRecord.customer_id, caseRecord.failure_category);
    const steps = buildSteps(fullTimeline);

    const stoppedEntry = [...fullTimeline].reverse().find((e) => e.event_type === 'decision.agent_stopped');
    let loopSummary = null;
    if (stoppedEntry) {
      try {
        const parsed = JSON.parse(stoppedEntry.details);
        loopSummary = { ...parsed, friendlyMessage: describeStopReason(parsed.stopReason, parsed.outcome) };
      } catch { /* ignore */ }
    }

    const memoryAppliedEntry = fullTimeline.find((e) => e.event_type === 'decision.memory_applied');
    let memoryProof = null;
    if (memoryAppliedEntry) {
      try { memoryProof = JSON.parse(memoryAppliedEntry.details); } catch { /* ignore */ }
    }

    return NextResponse.json({
      case: caseRecord,
      isAgentCase: true,
      timeline: fullTimeline,
      steps,
      memory,
      memoryProof,
      loopSummary,
    });
  } catch (error) {
    console.error('Agent Case Detail Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
