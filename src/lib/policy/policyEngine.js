/**
 * PolicyEngine — deterministic gate between an AI/LLM recommendation and
 * actual execution.
 *
 * This is intentionally a thin adapter over lib/engine/guardrails.js, which
 * already implements every hard business rule (max retries, cooldowns,
 * contact limits, margin protection, customer fatigue, expiry, etc.) and is
 * used by the existing deterministic orchestrator. The agent graph's
 * `policy_gate` node calls this same evaluator so both pipelines are bound
 * by exactly one set of rules — there is no second, divergent policy
 * implementation to keep in sync.
 *
 * The LLM never sees this module and can never call it in a way that
 * changes its answer: `evaluate()` takes only data, returns only a
 * decision, and performs no side effects.
 */
import { checkGuardrails, POLICY } from '../engine/guardrails.js';

export { POLICY };

/**
 * @param {Object} caseData - recovery_cases row (or an equivalent in-memory shape)
 * @param {Object|string} proposedAction - action object or action_type string
 * @param {Object[]} actionsHistory - prior recovery_actions rows for this case
 * @param {Object} [customerData] - customers row
 * @param {Object} [crossCaseData] - { recentInterventionCount }
 * @returns {{ allowed: boolean, violations: string[], warnings: string[], modifications: string[] }}
 */
export function evaluatePolicy(caseData, proposedAction, actionsHistory = [], customerData = null, crossCaseData = null) {
  return checkGuardrails(caseData, proposedAction, actionsHistory, customerData, crossCaseData);
}

/**
 * Classify a violation set into a terminal disposition for the agent loop.
 * Hard, unrecoverable violations (case already resolved/expired, customer
 * fatigue) stop the case outright. Everything else is a candidate for
 * human escalation when the amount at risk justifies the cost of a review.
 */
export function classifyDenial(violations, amountAtRisk) {
  const hardStopCodes = ['CASE_EXPIRED', 'ALREADY_RECOVERED', 'CUSTOMER_OPTED_OUT', 'CUSTOMER_FATIGUE'];
  const isHardStop = violations.some((v) => hardStopCodes.some((code) => v.startsWith(code)));

  if (isHardStop) {
    return { disposition: 'STOPPED', reason: violations[0] };
  }

  if ((amountAtRisk || 0) > POLICY.APPROVAL_THRESHOLD_PAISE) {
    return { disposition: 'ESCALATE', reason: `High-value case blocked by policy: ${violations[0]}` };
  }

  return { disposition: 'STOPPED', reason: violations[0] || 'Policy rejected the proposed action' };
}
