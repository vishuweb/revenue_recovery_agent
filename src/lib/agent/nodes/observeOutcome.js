import { getDb } from '../../db/database.js';

/**
 * observe_outcome — reads back what actually happened (case status +
 * structured tool result) and classifies it into one of the five outcomes
 * the rest of the loop understands: RECOVERED, RETRYABLE, FAILED,
 * ESCALATE, STOPPED.
 *
 * One distinction lives inside RETRYABLE: `retry` is the only action with
 * a real, immediate financial signal (the gateway either charged the card
 * or it didn't) — a failed retry means "reconsider right now" and the
 * graph loops immediately. Every other action that "succeeds" (an email
 * was sent, a payment link was created, a discount was offered) only
 * means the outreach was dispatched — recovery is still pending the
 * customer's action in the real world. Looping immediately on those would
 * just re-pick the same action against unchanged data, so those pause the
 * graph (`awaitingRealWorldSignal: true`) instead of looping — the cron
 * sweep (lib/agent/graph.js's processPendingAgentResumptions) picks the
 * case back up once real time has passed. See evaluate_outcome.
 */
export async function observeOutcome(state) {
  const db = getDb();
  const caseRow = state.caseId ? await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(state.caseId) : null;
  const execResult = state.execution_result || {};

  let outcome;
  let awaitingRealWorldSignal = false;

  if (caseRow?.status === 'recovered') {
    outcome = 'RECOVERED';
  } else if (execResult.error === 'pending_approval') {
    outcome = 'ESCALATE';
  } else if (caseRow?.status === 'stopped') {
    outcome = 'STOPPED';
  } else if (execResult.error === 'dead_letter') {
    outcome = 'FAILED';
  } else if (execResult.success) {
    outcome = 'RETRYABLE';
    awaitingRealWorldSignal = state.selected_action !== 'retry';
  } else {
    const attemptsRemaining = (state.attempt_count || 0) + 1 < (state.max_attempts || 5);
    outcome = state.is_retryable && attemptsRemaining ? 'RETRYABLE' : 'FAILED';
  }

  return {
    caseRecord: caseRow,
    outcome,
    awaiting_real_world_signal: awaitingRealWorldSignal,
    audit_trail: [{
      phase: 'observe_outcome', at: new Date().toISOString(),
      summary: `Outcome: ${outcome}${awaitingRealWorldSignal ? ' (paused — awaiting real-world customer response)' : ''}${caseRow ? ` (case status: ${caseRow.status})` : ''}`,
    }],
  };
}
