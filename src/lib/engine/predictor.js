/**
 * Recovery Probability Predictor
 * 
 * Multi-factor probability model that predicts likelihood of successful recovery.
 * Supports action-specific probability adjustments — different actions have
 * different chances of success for different failure categories.
 * 
 * Not a trained ML model. Uses calibrated heuristic multipliers.
 * Honest label: "Heuristic probability model, not statistically calibrated."
 */

/**
 * Predict base recovery probability with multi-factor adjustments.
 * 
 * @param {number} baseProb — from classifier
 * @param {Object} customerData — customer row (may have missing fields)
 * @param {Object} caseData — case row or synthesized case data
 * @returns {{ probability: number, factors: Object[], explanation: string }}
 */
export function predictRecovery(baseProb, customerData, caseData) {
  // Defensive defaults for missing customer data
  const totalPayments = customerData?.total_payments || 0;
  const successfulPayments = customerData?.successful_payments || 0;
  const lifetimeValue = customerData?.lifetime_value || 0;
  const attemptsMade = caseData?.attempts_made || 0;
  const failureCategory = caseData?.failure_category || 'unknown';
  const openedAt = caseData?.opened_at;
  const discountAffinity = customerData?.discount_affinity || 0.5;
  const avgOrderValue = customerData?.avg_order_value || 0;

  // Factor 1: Customer payment history (with sample size weighting)
  let customerHistoryFactor = 1.0;
  if (totalPayments > 0) {
    const rawRatio = successfulPayments / totalPayments;
    // Sample size weight: more history → more trust in the ratio
    const sampleWeight = Math.min(1.0, totalPayments / 20); // Full trust at 20+ payments
    customerHistoryFactor = (rawRatio * sampleWeight) + (1.0 * (1 - sampleWeight));
    customerHistoryFactor = Math.max(0.5, Math.min(1.5, customerHistoryFactor));
  }

  // Factor 2: Retry exhaustion decay
  const retryDecayFactor = Math.max(0.3, 1.0 - (attemptsMade * 0.15));

  // Factor 3: Customer value tier
  let customerValueFactor = 1.0;
  if (lifetimeValue > 500000) customerValueFactor = 1.2;
  else if (lifetimeValue > 200000) customerValueFactor = 1.1;

  // Factor 4: Time decay (different curves for abandonment vs payment failures)
  const hoursSinceOpened = openedAt 
    ? Math.max(0, (Date.now() - new Date(openedAt).getTime()) / (1000 * 60 * 60))
    : 0;
  // Guard against NaN from invalid date
  const safeHours = isNaN(hoursSinceOpened) ? 0 : hoursSinceOpened;
  
  let timingFactor = 0.5;
  if (failureCategory === 'abandonment') {
    if (safeHours < 1) timingFactor = 1.0;
    else if (safeHours < 6) timingFactor = 0.7;
    else if (safeHours < 24) timingFactor = 0.4;
    else timingFactor = 0.2;
  } else {
    if (safeHours < 6) timingFactor = 1.0;
    else if (safeHours < 24) timingFactor = 0.95;
    else if (safeHours < 72) timingFactor = 0.85;
    else if (safeHours < 168) timingFactor = 0.7;
  }

  // Factor 5: Discount affinity
  let discountAffinityFactor = 1.0;
  if (failureCategory === 'abandonment' && discountAffinity > 0.5) {
    discountAffinityFactor = 1.1;
  }

  // Factor 6: Opportunity/clearance urgency boost
  let opportunityBoost = 1.0;
  if (failureCategory === 'opportunity') {
    if (avgOrderValue > 50000) opportunityBoost = 1.2;
    const hoursToExpiry = caseData?.metadata?.hours_to_expiry ?? 24;
    if (hoursToExpiry <= 12 || discountAffinity > 0.45) {
      opportunityBoost *= 2.4;
    }
  }

  let finalProb = baseProb * customerHistoryFactor * retryDecayFactor * customerValueFactor * timingFactor * discountAffinityFactor * opportunityBoost;
  finalProb = Math.max(0.01, Math.min(0.95, finalProb));

  return {
    probability: finalProb,
    factors: [
      { name: 'baseProbability', value: baseProb },
      { name: 'customerHistoryFactor', value: customerHistoryFactor },
      { name: 'retryDecayFactor', value: retryDecayFactor },
      { name: 'customerValueFactor', value: customerValueFactor },
      { name: 'timingFactor', value: timingFactor },
      { name: 'discountAffinityFactor', value: discountAffinityFactor },
      { name: 'opportunityBoost', value: opportunityBoost },
    ],
    explanation: `Predicted probability is ${(finalProb * 100).toFixed(1)}%. Factors: history ${customerHistoryFactor.toFixed(2)} (${totalPayments} samples), retry decay ${retryDecayFactor.toFixed(2)}, value ${customerValueFactor.toFixed(2)}, timing ${timingFactor.toFixed(2)}.`,
  };
}

/**
 * Predict recovery probability adjusted for a specific action type.
 * Different actions have different effectiveness per failure category.
 * 
 * @param {number} baseProb — base probability from predictRecovery
 * @param {string} action — candidate action type
 * @param {Object} customerData
 * @param {Object} caseData
 * @param {number} [discountPercent=0]
 * @returns {number} adjusted probability for this specific action
 */
export function predictForAction(baseProb, action, customerData, caseData, discountPercent = 0) {
  const failureCategory = caseData?.failure_category || 'unknown';

  // Action-specific probability modifiers
  const ACTION_MODIFIERS = {
    retry: {
      temporary: 1.0,       // Retries work well for temporary failures
      behavioral: 0.3,      // Retrying doesn't fix behavioral issues
      permanent: 0.05,      // Almost never works for permanent
      abandonment: 0.1,     // Retrying a cart abandonment doesn't help
      opportunity: 0.1,
      unknown: 0.5,
    },
    payment_link: {
      temporary: 0.5,
      behavioral: 0.6,
      permanent: 0.4,       // New payment method might work
      abandonment: 0.5,
      opportunity: 0.3,
      unknown: 0.4,
    },
    email: {
      temporary: 0.3,
      behavioral: 0.5,
      permanent: 0.3,
      abandonment: 0.4,
      opportunity: 0.3,
      unknown: 0.3,
    },
    discount: {
      temporary: 0.3,
      behavioral: 0.5,
      permanent: 0.2,
      abandonment: 0.7,     // Discounts effective for price-sensitive abandonment
      opportunity: 0.6,
      unknown: 0.3,
    },
    cart_reminder: {
      temporary: 0.1,
      behavioral: 0.3,
      permanent: 0.05,
      abandonment: 0.5,     // Direct relevance to cart abandonment
      opportunity: 0.2,
      unknown: 0.2,
    },
    free_shipping: {
      temporary: 0.1,
      behavioral: 0.3,
      permanent: 0.05,
      abandonment: 0.4,
      opportunity: 0.3,
      unknown: 0.2,
    },
    targeted_campaign: {
      temporary: 0.1,
      behavioral: 0.2,
      permanent: 0.05,
      abandonment: 0.3,
      opportunity: 0.4,
      unknown: 0.2,
    },
    escalate: {
      temporary: 0.4,
      behavioral: 0.5,
      permanent: 0.3,
      abandonment: 0.3,
      opportunity: 0.2,
      unknown: 0.3,
    },
    no_action: {
      // Organic self-cure rate (what happens if we do nothing)
      temporary: 0.15,      // Some temp failures resolve on their own
      behavioral: 0.05,
      permanent: 0.01,
      abandonment: 0.08,    // Some customers come back on their own
      opportunity: 0.02,
      unknown: 0.05,
    },
  };

  const modifiers = ACTION_MODIFIERS[action] || ACTION_MODIFIERS.escalate;
  const modifier = modifiers[failureCategory] || modifiers.unknown || 0.3;

  let adjustedProb = baseProb * modifier;

  // Discount boost: higher discount → higher conversion for price-sensitive customers
  if (action === 'discount' && discountPercent > 0) {
    const discountBoost = 1.0 + (discountPercent * 0.02);
    const affinityBoost = (customerData?.discount_affinity || 0.5) > 0.5 ? 1.15 : 1.0;
    adjustedProb *= discountBoost * affinityBoost;
  }

  return Math.max(0.01, Math.min(0.95, adjustedProb));
}
