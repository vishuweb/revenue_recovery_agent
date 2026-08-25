const reasonToClass = {
  'insufficient_funds': { category: 'temporary', baseRecoveryProbability: 0.70, isRetryable: true },
  'payment_timed_out': { category: 'temporary', baseRecoveryProbability: 0.65, isRetryable: true },
  'gateway_error': { category: 'temporary', baseRecoveryProbability: 0.80, isRetryable: true },
  'bank_server_down': { category: 'temporary', baseRecoveryProbability: 0.75, isRetryable: true },
  'network_error': { category: 'temporary', baseRecoveryProbability: 0.75, isRetryable: true },
  'authentication_failed': { category: 'behavioral', baseRecoveryProbability: 0.40, isRetryable: true },
  'payment_cancelled': { category: 'behavioral', baseRecoveryProbability: 0.35, isRetryable: true },
  'card_declined': { category: 'temporary', baseRecoveryProbability: 0.50, isRetryable: true },
  'card_expired': { category: 'permanent', baseRecoveryProbability: 0.20, isRetryable: false },
  'account_closed': { category: 'permanent', baseRecoveryProbability: 0.05, isRetryable: false },
  'invalid_card': { category: 'permanent', baseRecoveryProbability: 0.15, isRetryable: false },
  'international_transaction_not_allowed': { category: 'permanent', baseRecoveryProbability: 0.25, isRetryable: false },
  'checkout_abandoned': { category: 'abandonment', baseRecoveryProbability: 0.45, isRetryable: false, description: 'Customer left checkout without completing purchase' },
  'checkout_timeout': { category: 'abandonment', baseRecoveryProbability: 0.35, isRetryable: false, description: 'Checkout session timed out' },
  'near_expiry_inventory': { category: 'opportunity', baseRecoveryProbability: 0.25, isRetryable: false, description: 'Inventory nearing expiry - recovery campaign opportunity' },
  'subscription_failed': { category: 'temporary', baseRecoveryProbability: 0.60, isRetryable: true, description: 'Subscription renewal payment failed' },
  'invoice_overdue': { category: 'behavioral', baseRecoveryProbability: 0.50, isRetryable: false, description: 'Invoice past due date' }
};

export function classifyFailure(failureReason, failureSource) {
  const defaultClass = { category: 'unknown', baseRecoveryProbability: 0.30, isRetryable: true };
  const classification = reasonToClass[failureReason] || defaultClass;

  return {
    category: classification.category,
    baseRecoveryProbability: classification.baseRecoveryProbability,
    description: classification.description || `Classified as ${classification.category} failure (${classification.baseRecoveryProbability * 100}% base recovery)`,
    isRetryable: classification.isRetryable
  };
}

export function classifyEvent(eventType, metadata) {
  const defaultClass = { category: 'unknown', baseRecoveryProbability: 0.30, isRetryable: true };
  const classification = reasonToClass[eventType] || defaultClass;

  return {
    category: classification.category,
    baseRecoveryProbability: classification.baseRecoveryProbability,
    description: classification.description || `Classified as ${classification.category} event`,
    isRetryable: classification.isRetryable
  };
}
