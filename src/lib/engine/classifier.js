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
  'temporary_failure': { category: 'temporary', baseRecoveryProbability: 0.70, isRetryable: true },
  'high_value_failure': { category: 'temporary', baseRecoveryProbability: 0.80, isRetryable: true },
  'bad_request_error': { category: 'temporary', baseRecoveryProbability: 0.50, isRetryable: true },
  'server_error': { category: 'temporary', baseRecoveryProbability: 0.75, isRetryable: true },
  'payment_failed': { category: 'temporary', baseRecoveryProbability: 0.50, isRetryable: true }
};

function normalizeKey(str) {
  if (!str) return 'unknown';
  return String(str).toLowerCase().trim().replace(/[\s-]+/g, '_');
}

export function classifyFailure(failureReason, failureSource) {
  const defaultClass = { category: 'unknown', baseRecoveryProbability: 0.30, isRetryable: true };
  const normalized = normalizeKey(failureReason);
  const classification = reasonToClass[normalized] || defaultClass;

  return {
    category: classification.category,
    baseRecoveryProbability: classification.baseRecoveryProbability,
    description: classification.description || `Classified as ${classification.category} failure (${classification.baseRecoveryProbability * 100}% base recovery)`,
    isRetryable: classification.isRetryable
  };
}

export function classifyEvent(eventType, metadata) {
  const defaultClass = { category: 'unknown', baseRecoveryProbability: 0.30, isRetryable: true };
  const normalized = normalizeKey(eventType);
  const classification = reasonToClass[normalized] || defaultClass;

  return {
    category: classification.category,
    baseRecoveryProbability: classification.baseRecoveryProbability,
    description: classification.description || `Classified as ${classification.category} event`,
    isRetryable: classification.isRetryable
  };
}
