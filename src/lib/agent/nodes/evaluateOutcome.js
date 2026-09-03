import { getDb } from '../../db/database.js';
import { logDecision } from '../../engine/observability.js';
import { describeStopReason } from '../stopReasons.js';

/**
 * evaluate_outcome — the loop's only stopping-rule authority. Every path
 * through this node produces exactly one of three things:
 *   - a bounded `next_action` (loop back to decide_recovery_action, right now)
 *   - a `stop_reason` that closes the case (terminal)
 *   - a `stop_reason` that PAUSES the case (non-terminal — case stays
 *     open/in_progress, graph run ends here, and lib/agent/graph.js's
 *     processPendingAgentResumptions() cron sweep will re-invoke this
 *     thread later; see observe_outcome for why this exists)
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
  let paused = false;

  if (state.outcome === 'RECOVERED') {
    stopReason = 'recovered';
  } else if (state.outcome === 'ESCALATE') {
    stopReason = 'escalated_pending_human_approval';
  } else if (state.outcome === 'STOPPED') {
    stopReason = state.stop_reason || 'policy_or_engine_stopped';
  } else if (state.outcome === 'RETRYABLE' && state.awaiting_real_world_signal) {
    // The action was dispatched successfully, but only a real customer
    // response (or the passage of time) can move this case forward —
    // looping immediately would just re-select the same action against
    // unchanged data. Pause instead of looping or closing the case.
    stopReason = 'awaiting_customer_response';
    paused = true;
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
    await logDecision(entityId, 'agent_stopped', {
      outcome: state.outcome, stopReason, attempts, iterations: iteration, paused,
      message: describeStopReason(stopReason, state.outcome),
    }, { actor: 'agent' });

    // Close out the case for any truly terminal, non-recovered,
    // non-escalated, non-paused disposition reached via the retry loop
    // itself (policy_denied already closes cases it stops directly; a
    // paused case is deliberately left open for the cron sweep to resume).
    if (!paused && state.caseId && state.outcome !== 'RECOVERED' && state.outcome !== 'ESCALATE' && state.outcome !== 'STOPPED') {
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
        : `${paused ? 'Pausing' : 'Stopping'}: ${describeStopReason(stopReason, state.outcome)}`,
    }],
  };
}

/** Router used by the graph's conditional edge out of evaluate_outcome. */
export function routeEvaluateOutcome(state) {
  return state.next_action === 'decide_recovery_action' ? 'continue' : 'end';
}
