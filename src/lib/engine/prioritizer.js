export function calculatePriority(recoveryProbability, amountAtRisk, customerValue, urgency) {
  const normalizedAmount = Math.min(amountAtRisk / 10000000, 1.0) * 100;
  const normalizedCustomerValue = Math.min(customerValue / 5000000, 1.0) * 100;
  
  const score = (normalizedAmount * 0.35) + (recoveryProbability * 100 * 0.30) + (normalizedCustomerValue * 0.20) + (urgency * 0.15);

  let tier = 'low';
  if (score >= 75) tier = 'critical';
  else if (score >= 50) tier = 'high';
  else if (score >= 25) tier = 'medium';

  return {
    score,
    tier,
    factors: {
      normalizedAmount,
      recoveryProbabilityScore: recoveryProbability * 100,
      normalizedCustomerValue,
      urgency
    }
  };
}
