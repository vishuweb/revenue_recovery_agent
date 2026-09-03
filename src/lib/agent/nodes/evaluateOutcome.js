import { getDb } from '../../db/database.js';
import { logDecision } from '../../engine/observability.js';

/**
 * evaluate_outcome — the loop's only stopping-rule authority. Every path
 * through this node either produces a bounded `next_action` (loop back to
 * decide_recovery_action) or a `stop_reason` (terminate). Nothing else in
 * the graph decides whether to continue looping.
 *
 * Hard bounds enforced here, independent of anything the LLM or the
 * deterministic decider recommends:
 *   - max_attempts   (business retry cap, default 5 — matches POLICY.MAX_RETRY_ATTEMPTS)
 *   - max_iterations (graph-level safety cap, default 6)
 */
export async function evaluateOutcome(state) {
  const iteration = (state.iteration_count || 0) + 1;
  const attempts = (state.attempt_count || 0) + 1;
  const maxIterations = state.max_iterations || 6;
  const maxAttempts = state.max_attempts || 5;

  let stopReason = null;
  let nextAction = null;

  if (state.outcome === 'RECOVERED') {
    stopReason = 'recovered';
  } else if (state.outcome === 'ESCALATE') {
    stopReason = 'escalated_pending_human_approval';
  } else if (state.outcome === 'STOPPED') {
    stopReason = state.stop_reason || 'policy_or_engine_stopped';
  } else if (state.outcome === 'RETRYABLE') {
    if (iteration >= maxIterations) {
      stopReason = 'max_graph_iterations_reached';
    } else if (attempts >= maxAttempts) {
      stopReason = 'max_attempts_reached';
    } else {
      nextAction = 'decide_recovery_action';
    }
  } else {
    stopReason = 'recovery_failed_not_retryable';
  }

  if (!nextAction) {
    const entityId = state.caseId || state.paymentId || 'unknown';
    await logDecision(entityId, 'agent_stopped', { outcome: state.outcome, stopReason, attempts, iterations: iteration }, { actor: 'agent' });

    // Close out the case for any terminal, non-recovered, non-escalated
    // disposition reached via the retry loop itself (policy_denied already
    // closes cases it stops directly).
    if (state.caseId && state.outcome !== 'RECOVERED' && state.outcome !== 'ESCALATE' && state.outcome !== 'STOPPED') {
      const db = getDb();
      await db.prepare(`
        UPDATE recovery_cases SET status = 'stopped', resolved_at = ?, updated_at = ?
        WHERE id = ? AND status IN ('open', 'in_progress')
      `).run(new Date().toISOString(), new Date().toISOString(), state.caseId);
    }
  }

  return {
    attempt_count: attempts,
    iteration_count: iteration,
    next_action: nextAction,
    stop_reason: nextAction ? null : stopReason,
    timestamps: { lastEvaluatedAt: new Date().toISOString() },
    audit_trail: [{
      phase: 'evaluate_outcome', at: new Date().toISOString(),
      summary: nextAction
        ? `Continuing: attempt ${attempts}/${maxAttempts}, iteration ${iteration}/${maxIterations}`
        : `Stopping: ${stopReason}`,
    }],
  };
}

/** Router used by the graph's conditional edge out of evaluate_outcome. */
export function routeEvaluateOutcome(state) {
  return state.next_action === 'decide_recovery_action' ? 'continue' : 'end';
}
