import { getDb } from '../../db/database.js';

/**
 * observe_outcome — reads back what actually happened (case status +
 * structured tool result) and classifies it into one of the five outcomes
 * the rest of the loop understands: RECOVERED, RETRYABLE, FAILED,
 * ESCALATE, STOPPED.
 */
export async function observeOutcome(state) {
  const db = getDb();
  const caseRow = state.caseId ? await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(state.caseId) : null;
  const execResult = state.execution_result || {};

  let outcome;
  if (caseRow?.status === 'recovered') {
    outcome = 'RECOVERED';
  } else if (execResult.error === 'pending_approval') {
    outcome = 'ESCALATE';
  } else if (caseRow?.status === 'stopped') {
    outcome = 'STOPPED';
  } else if (execResult.error === 'dead_letter') {
    outcome = 'FAILED';
  } else if (execResult.success) {
    // Executed cleanly (e.g. payment link / notification sent) but recovery
    // itself is still pending the customer's action — keep the case alive
    // for the next evaluation pass, bounded by evaluate_outcome.
    outcome = 'RETRYABLE';
  } else {
    const attemptsRemaining = (state.attempt_count || 0) + 1 < (state.max_attempts || 5);
    outcome = state.is_retryable && attemptsRemaining ? 'RETRYABLE' : 'FAILED';
  }

  return {
    caseRecord: caseRow,
    outcome,
    audit_trail: [{
      phase: 'observe_outcome', at: new Date().toISOString(),
      summary: `Outcome: ${outcome}${caseRow ? ` (case status: ${caseRow.status})` : ''}`,
    }],
  };
}
