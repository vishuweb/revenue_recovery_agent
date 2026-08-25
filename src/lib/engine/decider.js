export function decideAction(caseData, customerData, classification, prediction, priority) {
  let action = 'escalate';
  let reasoning = '';
  let requiresApproval = false;
  let scheduledDelay = 0; // ms
  let discount_percent = undefined;
  let intervention_cost = undefined;

  const maxAttempts = caseData.max_attempts || 5;

  if (caseData.attempts_made >= maxAttempts) {
    action = 'stop';
    reasoning = 'Maximum retry attempts exhausted';
  } else if (prediction.probability < 0.10) {
    action = 'stop';
    reasoning = 'Recovery probability too low';
  } else if (classification.category === 'permanent' && classification.isRetryable === false) {
    if (caseData.failure_reason === 'card_expired' || caseData.failure_reason === 'invalid_card') {
      action = 'payment_link';
      reasoning = 'Customer needs to update payment method';
    } else {
      action = 'escalate';
      reasoning = 'Permanent failure requiring manual intervention';
    }
  } else if (classification.category === 'temporary' && caseData.attempts_made < 3) {
    action = 'retry';
    if (['gateway_error', 'network_error', 'bank_server_down'].includes(caseData.failure_reason)) {
      scheduledDelay = 30 * 60 * 1000;
    } else if (caseData.failure_reason === 'insufficient_funds') {
      scheduledDelay = 6 * 60 * 60 * 1000;
    } else if (caseData.failure_reason === 'card_declined') {
      scheduledDelay = 24 * 60 * 60 * 1000;
    } else if (caseData.failure_reason === 'payment_timed_out') {
      scheduledDelay = 2 * 60 * 60 * 1000;
    } else {
      scheduledDelay = 60 * 60 * 1000;
    }
    reasoning = `Temporary failure, attempting retry after delay (${scheduledDelay/1000}s)`;
  } else if (classification.category === 'behavioral') {
    if (customerData.plan === 'enterprise' || customerData.lifetime_value > 500000) {
      action = 'email';
      reasoning = 'Behavioral failure for high-value customer, sending personalized email';
    } else {
      action = 'payment_link';
      reasoning = 'Behavioral failure, sending payment link';
    }
  } else if (classification.category === 'abandonment' && customerData.discount_affinity > 0.5 && caseData.amount_at_risk > customerData.avg_order_value) {
    action = 'discount';
    reasoning = 'High value abandonment with discount affinity, offering discount';
    scheduledDelay = 3600000;
  } else if (classification.category === 'abandonment' && caseData.amount_at_risk > 50000) {
    action = 'free_shipping';
    reasoning = 'High value abandonment, offering free shipping';
  } else if (classification.category === 'abandonment' && caseData.attempts_made < 2) {
    action = 'cart_reminder';
    reasoning = 'Recent abandonment, sending cart reminder';
  } else if (classification.category === 'opportunity') {
    const hoursToExpiry = caseData.metadata?.hours_to_expiry ?? 12;
    // Dynamic markdown policy: If urgency is high (<18h remaining) or customer is price sensitive (>0.45 affinity)
    if (hoursToExpiry <= 18 || (customerData && customerData.discount_affinity > 0.45)) {
      action = 'discount';
      if (hoursToExpiry <= 12 || (customerData && customerData.discount_affinity > 0.7)) {
        discount_percent = 10;
        reasoning = `Urgent inventory expiration (${hoursToExpiry}h left); applying maximum 10% salvage markdown to avoid total write-off`;
      } else {
        discount_percent = 5;
        reasoning = `Expiring inventory (${hoursToExpiry}h left); deploying 5% clearance incentive for high-affinity buyer`;
      }
      intervention_cost = Math.round(caseData.amount_at_risk * (discount_percent / 100));
    } else {
      action = 'targeted_campaign';
      reasoning = `Expiring inventory with runway (${hoursToExpiry}h left); testing full-price clearance campaign (0% discount) to protect gross margin`;
    }
  } else if (caseData.attempts_made >= 3 && prediction.probability > 0.3) {
    action = 'email';
    reasoning = 'Multiple retries failed, probability is decent, switching to email outreach';
  } else {
    action = 'escalate';
    reasoning = 'Defaulting to escalation';
  }

  if (action === 'discount') {
    if (!discount_percent) {
      discount_percent = 5;
      if (customerData && customerData.discount_affinity > 0.7) {
        discount_percent = 10;
      }
      intervention_cost = Math.round(caseData.amount_at_risk * (discount_percent / 100));
    }
  }

  if (caseData.amount_at_risk > 5000000 || action === 'escalate') {
    requiresApproval = true;
  }

  return {
    action,
    reasoning,
    requiresApproval,
    scheduledDelay,
    discount_percent,
    intervention_cost
  };
}
