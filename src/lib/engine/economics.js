/**
 * Intervention Economics Engine
 * 
 * Calculates Net Expected Value (NEV) for candidate recovery actions.
 * NEV = (Recovery Probability × Amount at Risk) - Intervention Cost
 * 
 * The system selects the action with the highest positive NEV.
 * If all candidates have NEV ≤ 0, the optimal decision is no_action.
 */

// Intervention cost model (amounts in paise)
// Fixed costs represent operational overhead per execution.
// Variable costs are computed as a function of the amount at risk.
const ACTION_COST_MODEL = {
  retry:             { fixed: 0,    variableType: 'none',    description: 'Gateway retry — zero marginal cost' },
  payment_link:      { fixed: 5000, variableType: 'none',    description: 'Email/SMS delivery of payment link' },
  email:             { fixed: 2500, variableType: 'none',    description: 'Outreach email delivery cost' },
  sms:               { fixed: 1500, variableType: 'none',    description: 'SMS delivery cost' },
  cart_reminder:     { fixed: 2500, variableType: 'none',    description: 'Cart reminder notification cost' },
  discount:          { fixed: 0,    variableType: 'percent', description: 'Discount reduces recovered revenue' },
  free_shipping:     { fixed: 15000, variableType: 'none',   description: 'Shipping cost absorption' },
  targeted_campaign: { fixed: 5000, variableType: 'none',    description: 'Marketing campaign delivery cost' },
  escalate:          { fixed: 50000, variableType: 'none',   description: 'Human analyst time (~30 min)' },
  no_action:         { fixed: 0,    variableType: 'none',    description: 'No intervention — zero cost' },
  stop:              { fixed: 0,    variableType: 'none',    description: 'Case closure — zero cost' },
};

/**
 * Calculate intervention cost for a given action.
 * @param {string} action — action type
 * @param {number} amountAtRisk — amount in paise
 * @param {number} [discountPercent=0] — discount percentage if action is 'discount'
 * @returns {number} cost in paise
 */
export function calculateInterventionCost(action, amountAtRisk, discountPercent = 0) {
  const model = ACTION_COST_MODEL[action] || ACTION_COST_MODEL.escalate;
  let cost = model.fixed;

  if (model.variableType === 'percent' && discountPercent > 0) {
    cost += Math.round(amountAtRisk * (discountPercent / 100));
  }

  return cost;
}

/**
 * Calculate Net Expected Value for a single candidate action.
 * NEV = (adjustedProbability × amountAtRisk) - interventionCost
 * 
 * @param {number} amountAtRisk — amount in paise
 * @param {number} recoveryProbability — 0.0 to 1.0
 * @param {string} action — action type
 * @param {number} [discountPercent=0]
 * @returns {{ expectedRecovery: number, interventionCost: number, nev: number }}
 */
export function calculateNEV(amountAtRisk, recoveryProbability, action, discountPercent = 0) {
  const interventionCost = calculateInterventionCost(action, amountAtRisk, discountPercent);
  const expectedRecovery = Math.round(recoveryProbability * amountAtRisk);
  const nev = expectedRecovery - interventionCost;

  return {
    expectedRecovery,
    interventionCost,
    nev,
  };
}

/**
 * Evaluate multiple candidate actions and rank by NEV.
 * Returns sorted array (highest NEV first) with selection metadata.
 * 
 * @param {number} amountAtRisk
 * @param {Object[]} candidates — array of { action, probability, discountPercent?, reasoning? }
 * @returns {{ selected: Object, candidates: Object[], allNegative: boolean }}
 */
export function evaluateCandidates(amountAtRisk, candidates) {
  const evaluated = candidates.map(candidate => {
    const { expectedRecovery, interventionCost, nev } = calculateNEV(
      amountAtRisk,
      candidate.probability,
      candidate.action,
      candidate.discountPercent || 0
    );

    return {
      action: candidate.action,
      probability: candidate.probability,
      discountPercent: candidate.discountPercent || 0,
      expectedRecovery,
      interventionCost,
      nev,
      reasoning: candidate.reasoning || '',
      scheduledDelay: candidate.scheduledDelay || 0,
      requiresApproval: candidate.requiresApproval || false,
    };
  });

  // Sort by NEV descending
  evaluated.sort((a, b) => b.nev - a.nev);

  // Mark selection: pick highest NEV that is positive, else no_action
  const allNegative = evaluated.every(c => c.nev <= 0);
  let selectedIdx = 0;

  if (allNegative) {
    // Find no_action candidate or default to first (which will be the least negative)
    const noActionIdx = evaluated.findIndex(c => c.action === 'no_action');
    selectedIdx = noActionIdx >= 0 ? noActionIdx : 0;
  }

  const result = evaluated.map((c, i) => ({
    ...c,
    selected: i === selectedIdx,
  }));

  return {
    selected: result[selectedIdx],
    candidates: result,
    allNegative,
  };
}

/**
 * Get the cost model definition for an action.
 * Useful for displaying cost breakdown in the UI.
 */
export function getActionCostModel(action) {
  return ACTION_COST_MODEL[action] || null;
}

/**
 * Get all available action types from the cost model.
 */
export function getActionCatalog() {
  return Object.entries(ACTION_COST_MODEL).map(([action, model]) => ({
    action,
    ...model,
  }));
}
