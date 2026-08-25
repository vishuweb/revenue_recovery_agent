export function predictRecovery(baseProb, customerData, caseData) {
  const { total_payments, successful_payments, failed_payments, lifetime_value, mrr, plan } = customerData;
  const { attempts_made, max_attempts, failure_category, amount_at_risk, opened_at } = caseData;

  const customerHistoryFactor = total_payments > 0 
    ? Math.max(0.5, Math.min(1.5, successful_payments / total_payments)) 
    : 1.0;

  const retryDecayFactor = Math.max(0.3, 1.0 - (attempts_made * 0.15));

  let customerValueFactor = 1.0;
  if (lifetime_value > 500000) customerValueFactor = 1.2;
  else if (lifetime_value > 200000) customerValueFactor = 1.1;

  const hoursSinceOpened = opened_at ? (Date.now() - new Date(opened_at).getTime()) / (1000 * 60 * 60) : 0;
  let timingFactor = 0.5;
  if (failure_category === 'abandonment') {
    if (hoursSinceOpened < 1) timingFactor = 1.0;
    else if (hoursSinceOpened < 6) timingFactor = 0.7;
    else if (hoursSinceOpened < 24) timingFactor = 0.4;
    else timingFactor = 0.2;
  } else {
    if (hoursSinceOpened < 6) timingFactor = 1.0;
    else if (hoursSinceOpened < 24) timingFactor = 0.95;
    else if (hoursSinceOpened < 72) timingFactor = 0.85;
    else if (hoursSinceOpened < 168) timingFactor = 0.7;
  }

  let discountAffinityFactor = 1.0;
  if (failure_category === 'abandonment' && customerData.discount_affinity > 0.5) {
    discountAffinityFactor = 1.1;
  }

  let opportunityBoost = 1.0;
  if (failure_category === 'opportunity') {
    if (customerData.avg_order_value > 50000) opportunityBoost = 1.2;
    // Price elasticity boost: if urgent markdown / discount is applied, conversion probability jumps
    const hoursToExpiry = caseData.metadata?.hours_to_expiry ?? 24;
    if (hoursToExpiry <= 12 || customerData.discount_affinity > 0.45) {
      opportunityBoost *= 2.4; // 22% -> 53%+
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
      { name: 'opportunityBoost', value: opportunityBoost }
    ],
    explanation: `Predicted probability is ${(finalProb*100).toFixed(1)}%. Factors: history ${customerHistoryFactor.toFixed(2)}, retry decay ${retryDecayFactor.toFixed(2)}, value ${customerValueFactor.toFixed(2)}, timing ${timingFactor.toFixed(2)}.`
  };
}
