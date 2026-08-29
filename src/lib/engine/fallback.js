/**
 * Deterministic Fallback Engine
 * 
 * Applied when the primary decision engine encounters an error,
 * when an external AI/ML service is unavailable, or when the
 * decision pipeline throws unexpectedly.
 * 
 * This produces safe, conservative actions using only categorical rules.
 * Every fallback decision is clearly labeled so the audit trail shows
 * that the full decision engine was bypassed.
 */

import { calculateInterventionCost } from './economics.js';

/**
 * Generate a safe recovery action using deterministic rules only.
 * No probability models, no NEV optimization — just safe defaults.
 * 
 * @param {Object} caseData — { failure_reason, failure_category, attempts_made, max_attempts, amount_at_risk }
 * @param {Object} customer — { plan, lifetime_value, opted_out }
 * @param {Object} classification — { category, isRetryable }
 * @returns {{ action, reasoning, isAIFallback, scheduledDelay, requiresApproval, discount_percent, intervention_cost }}
 */
export function deterministicFallback(caseData, customer, classification) {
  const maxAttempts = caseData.max_attempts || 5;
  const attemptsMade = caseData.attempts_made || 0;

  // Rule 1: Hard limits — never exceed max retries
  if (attemptsMade >= maxAttempts) {
    return buildFallbackResult('stop', 'Maximum retry attempts exhausted. Fallback policy: stop.', caseData);
  }

  // Rule 2: Permanent failures — no retry, offer payment update
  if (classification.category === 'permanent' && !classification.isRetryable) {
    return buildFallbackResult('payment_link', 'Permanent failure detected. Fallback policy: send payment update link.', caseData);
  }

  // Rule 3: Customer opted out — no outreach
  if (customer && customer.opted_out === 1) {
    return buildFallbackResult('no_action', 'Customer opted out of communications. Fallback policy: no action.', caseData);
  }

  // Rule 4: Temporary failure with retries remaining — retry after 6 hours
  if (classification.category === 'temporary' && classification.isRetryable && attemptsMade < 3) {
    return buildFallbackResult('retry', 'Temporary failure with retries remaining. Fallback policy: retry after 6h delay.', caseData, {
      scheduledDelay: 6 * 60 * 60 * 1000, // 6 hours
    });
  }

  // Rule 5: Behavioral or abandonment — send payment link
  if (['behavioral', 'abandonment'].includes(classification.category)) {
    return buildFallbackResult('payment_link', 'Behavioral/abandonment failure. Fallback policy: send payment link.', caseData);
  }

  // Rule 6: High-value cases — escalate to human
  if (caseData.amount_at_risk > 5000000) { // > ₹50,000
    return buildFallbackResult('escalate', 'High-value case during AI unavailability. Fallback policy: escalate to human.', caseData, {
      requiresApproval: true,
    });
  }

  // Rule 7: Default — escalate
  return buildFallbackResult('escalate', 'No matching fallback rule. Fallback policy: escalate for manual review.', caseData, {
    requiresApproval: true,
  });
}

function buildFallbackResult(action, reasoning, caseData, overrides = {}) {
  const interventionCost = calculateInterventionCost(action, caseData.amount_at_risk || 0, 0);

  return {
    action,
    reasoning: `AI unavailable — deterministic recovery policy applied. ${reasoning}`,
    isAIFallback: true,
    scheduledDelay: overrides.scheduledDelay || 0,
    requiresApproval: overrides.requiresApproval || false,
    discount_percent: undefined,
    intervention_cost: interventionCost,
    candidates: [{
      action,
      probability: 0,
      expectedRecovery: 0,
      interventionCost,
      nev: 0 - interventionCost,
      reasoning: reasoning,
      selected: true,
    }],
  };
}
