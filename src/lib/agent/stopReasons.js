/**
 * Human-readable stopping/escalation messages for the agent timeline UI.
 * Internal codes (policy violation strings, evaluate_outcome's stop_reason
 * values) are mapped to short, concrete sentences — never chain-of-thought,
 * always a concise "why we stopped/escalated" statement.
 */
const EXACT = {
  recovered: 'Payment recovered. Agent stopped further actions.',
  escalated_pending_human_approval: 'Escalated to a human for approval — no automatic action was taken.',
  max_attempts_reached: 'Retry blocked because the maximum retry limit was reached.',
  max_graph_iterations_reached: 'Reached the maximum number of reasoning cycles for this case. Stopped safely.',
  recovery_failed_not_retryable: 'Recovery attempts exhausted and the failure is not retryable. Agent stopped.',
  awaiting_customer_response: 'Waiting for the customer to respond. The agent will automatically re-check later.',
  awaiting_scheduled_retry: 'Retry scheduled for later. The agent will automatically resume when it is due.',
  policy_or_engine_stopped: 'Stopped by policy.',
};

const PREFIX_MATCHES = [
  [/^MAX_RETRY_ATTEMPTS/, 'Retry blocked because the maximum retry limit was reached.'],
  [/^MIN_RETRY_INTERVAL/, 'Retry blocked — too soon since the last attempt. Policy requires a minimum cooldown.'],
  [/^MAX_EMAILS_PER_CASE/, 'Further email contact blocked — the per-case email limit was reached.'],
  [/^MAX_SMS_PER_CASE/, 'Further SMS contact blocked — the per-case SMS limit was reached.'],
  [/^CUSTOMER_FATIGUE/, 'Further customer contact blocked by policy (too many interventions recently).'],
  [/^CUSTOMER_OPTED_OUT/, 'Customer opted out of communications. No further contact attempted.'],
  [/^CASE_EXPIRED/, 'Case expired before recovery completed.'],
  [/^ALREADY_RECOVERED/, 'Case was already recovered — no further action needed.'],
  [/^MARGIN_PROTECTION/, 'Blocked — the proposed intervention cost too much relative to the amount at risk.'],
  [/^DUPLICATE_ACTION_PREVENTION/, 'Blocked — an identical action was already in flight for this case.'],
];

/**
 * @param {string|null} stopReason - evaluate_outcome's stop_reason, or a policy violation code
 * @param {string|null} [outcome] - RECOVERED | RETRYABLE | FAILED | ESCALATE | STOPPED
 * @returns {string}
 */
export function describeStopReason(stopReason, outcome) {
  if (!stopReason) {
    if (outcome === 'RECOVERED') return EXACT.recovered;
    return 'Agent is still processing this case.';
  }

  if (EXACT[stopReason]) return EXACT[stopReason];

  for (const [pattern, message] of PREFIX_MATCHES) {
    if (pattern.test(stopReason)) return message;
  }

  if (outcome === 'ESCALATE') {
    return `Failure classified as high-risk or non-recoverable. Agent escalated. (${stopReason})`;
  }

  return stopReason;
}
