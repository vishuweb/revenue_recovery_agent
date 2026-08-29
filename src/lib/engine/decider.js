/**
 * Recovery Action Decision Engine
 * 
 * Evaluates all eligible candidate actions using Net Expected Value (NEV)
 * optimization. Selects the action with the highest positive NEV.
 * 
 * If ALL candidates have NEV ≤ 0, selects `no_action` — explicitly deciding
 * that doing nothing is the optimal financial decision.
 * 
 * "Do Nothing" is a first-class action, not a failure state.
 * 
 * Decision Pipeline:
 *   1. Generate eligible candidate actions based on case context
 *   2. For each candidate, compute action-specific recovery probability
 *   3. Calculate NEV = (probability × amount) - intervention cost
 *   4. Rank by NEV and select the winner
 *   5. Return full candidate evaluation for decision transparency
 */

import { predictForAction } from './predictor.js';
import { evaluateCandidates, calculateInterventionCost } from './economics.js';

/**
 * Decide the optimal recovery action for a case.
 * 
 * @param {Object} caseData — case row with failure_reason, attempts_made, etc.
 * @param {Object} customerData — customer row
 * @param {Object} classification — from classifier { category, isRetryable, baseProbability }
 * @param {Object} prediction — from predictRecovery { probability, factors }
 * @param {Object} priority — from calculatePriority { score, tier }
 * @returns {{ action, reasoning, requiresApproval, scheduledDelay, discount_percent, intervention_cost, candidates, allNegativeNEV, isAIFallback }}
 */
export function decideAction(caseData, customerData, classification, prediction, priority) {
  const maxAttempts = caseData.max_attempts || 5;
  const attemptsMade = caseData.attempts_made || 0;
  const amountAtRisk = caseData.amount_at_risk || 0;
  const failureCategory = classification.category || 'unknown';

  // Step 1: Build candidate action list based on eligibility
  const candidates = [];

  // Always include no_action as baseline
  candidates.push(buildCandidate('no_action', caseData, customerData, classification, prediction, {
    reasoning: 'Baseline: no intervention',
  }));

  // Retry — only if retryable and under max attempts
  if (classification.isRetryable && attemptsMade < Math.min(maxAttempts, 3)) {
    const delay = getRetryDelay(caseData.failure_reason, failureCategory);
    candidates.push(buildCandidate('retry', caseData, customerData, classification, prediction, {
      reasoning: `Retry after ${delay / (60 * 1000)}m delay`,
      scheduledDelay: delay,
    }));
  }

  // Payment link — always eligible for card issues or behavioral
  if (['permanent', 'behavioral', 'temporary'].includes(failureCategory)) {
    candidates.push(buildCandidate('payment_link', caseData, customerData, classification, prediction, {
      reasoning: 'Send updated payment link',
    }));
  }

  // Email — if customer hasn't opted out
  if (customerData?.opted_out !== 1) {
    candidates.push(buildCandidate('email', caseData, customerData, classification, prediction, {
      reasoning: 'Personalized recovery email',
    }));
  }

  // Cart reminder — only for abandonment
  if (failureCategory === 'abandonment' && customerData?.opted_out !== 1) {
    candidates.push(buildCandidate('cart_reminder', caseData, customerData, classification, prediction, {
      reasoning: 'Cart abandonment reminder',
    }));
  }

  // Discount (5%) — for abandonment or opportunity with affinity
  if (['abandonment', 'opportunity'].includes(failureCategory)) {
    candidates.push(buildCandidate('discount', caseData, customerData, classification, prediction, {
      reasoning: 'Recovery incentive (5% discount)',
      discountPercent: 5,
    }));
  }

  // Discount (10%) — for high-affinity customers or urgent inventory
  if (failureCategory === 'opportunity' || (failureCategory === 'abandonment' && (customerData?.discount_affinity || 0) > 0.5)) {
    const hoursToExpiry = caseData.metadata?.hours_to_expiry ?? 999;
    if (hoursToExpiry <= 18 || (customerData?.discount_affinity || 0) > 0.7) {
      candidates.push(buildCandidate('discount', caseData, customerData, classification, prediction, {
        reasoning: 'Maximum recovery incentive (10% discount)',
        discountPercent: 10,
      }));
    }
  }

  // Free shipping — high-value abandonment
  if (failureCategory === 'abandonment' && amountAtRisk > 50000) {
    candidates.push(buildCandidate('free_shipping', caseData, customerData, classification, prediction, {
      reasoning: 'Free shipping incentive for high-value cart',
    }));
  }

  // Targeted campaign — opportunity/clearance
  if (failureCategory === 'opportunity') {
    candidates.push(buildCandidate('targeted_campaign', caseData, customerData, classification, prediction, {
      reasoning: 'Full-price clearance campaign',
    }));
  }

  // Escalate — high-value or enterprise
  if (amountAtRisk > 2000000 || customerData?.plan === 'enterprise') {
    candidates.push(buildCandidate('escalate', caseData, customerData, classification, prediction, {
      reasoning: 'Escalate to human analyst',
      requiresApproval: true,
    }));
  }

  // Step 2: Evaluate all candidates via NEV
  const evaluation = evaluateCandidates(amountAtRisk, candidates);

  // Step 3: Build the result
  const selected = evaluation.selected;

  // Determine if approval is needed
  let requiresApproval = selected.requiresApproval;
  if (amountAtRisk > 5000000 || selected.action === 'escalate') {
    requiresApproval = true;
  }

  // Build comprehensive reasoning
  let reasoning = selected.reasoning;
  if (selected.action === 'no_action' || evaluation.allNegative) {
    reasoning = buildNoActionReasoning(caseData, customerData, classification, prediction, evaluation);
  } else {
    const runner_up = evaluation.candidates.find(c => !c.selected && c.nev > 0);
    if (runner_up) {
      reasoning += ` | NEV: ₹${(selected.nev / 100).toFixed(0)} vs runner-up ${runner_up.action}: ₹${(runner_up.nev / 100).toFixed(0)}`;
    }
  }

  return {
    action: selected.action,
    reasoning,
    requiresApproval,
    scheduledDelay: selected.scheduledDelay || 0,
    discount_percent: selected.discountPercent || undefined,
    intervention_cost: selected.interventionCost,
    candidates: evaluation.candidates,
    allNegativeNEV: evaluation.allNegative,
    isAIFallback: false,
  };
}

/**
 * Build a candidate object with action-specific probability.
 */
function buildCandidate(action, caseData, customerData, classification, prediction, overrides = {}) {
  const discountPercent = overrides.discountPercent || 0;
  const actionProbability = predictForAction(
    prediction.probability,
    action,
    customerData,
    caseData,
    discountPercent
  );

  return {
    action,
    probability: actionProbability,
    discountPercent,
    reasoning: overrides.reasoning || action,
    scheduledDelay: overrides.scheduledDelay || 0,
    requiresApproval: overrides.requiresApproval || false,
  };
}

/**
 * Calculate retry delay based on failure reason.
 */
function getRetryDelay(failureReason, failureCategory) {
  const RETRY_DELAYS = {
    gateway_error: 30 * 60 * 1000,           // 30 minutes
    network_error: 30 * 60 * 1000,
    bank_server_down: 30 * 60 * 1000,
    payment_timed_out: 2 * 60 * 60 * 1000,   // 2 hours
    insufficient_funds: 6 * 60 * 60 * 1000,   // 6 hours
    card_declined: 24 * 60 * 60 * 1000,       // 24 hours
    subscription_failed: 6 * 60 * 60 * 1000,
  };

  return RETRY_DELAYS[failureReason] || 60 * 60 * 1000; // Default: 1 hour
}

/**
 * Build a detailed reasoning string when no_action is selected.
 */
function buildNoActionReasoning(caseData, customerData, classification, prediction, evaluation) {
  const reasons = [];

  if (prediction.probability < 0.10) {
    reasons.push(`recovery probability is ${(prediction.probability * 100).toFixed(1)}%`);
  }

  const bestPositiveAction = evaluation.candidates.find(c => c.action !== 'no_action');
  if (bestPositiveAction && bestPositiveAction.nev <= 0) {
    reasons.push(`best candidate (${bestPositiveAction.action}) has NEV of ₹${(bestPositiveAction.nev / 100).toFixed(0)}`);
  }

  if (caseData.attempts_made >= (caseData.max_attempts || 5)) {
    reasons.push('maximum retry attempts exhausted');
  }

  if (customerData?.opted_out === 1) {
    reasons.push('customer opted out of communications');
  }

  if (classification.category === 'permanent' && !classification.isRetryable) {
    reasons.push(`permanent failure (${caseData.failure_reason})`);
  }

  const reasonText = reasons.length > 0 ? reasons.join(', ') : 'all candidates have negative net expected value';

  return `No action is the optimal decision. ₹${((caseData.amount_at_risk || 0) / 100).toFixed(0)} revenue at risk, but ${reasonText}. Automated recovery stopped to avoid negative ROI.`;
}
