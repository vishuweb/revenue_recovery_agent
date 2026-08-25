export function checkGuardrails(caseData, proposedAction, actionsHistory, customerData = null) {
  const violations = [];
  const warnings = [];

  const actionName = typeof proposedAction === 'object' ? proposedAction.action_type : proposedAction;
  const actionObj = typeof proposedAction === 'object' ? proposedAction : null;

  const MAX_RETRY_ATTEMPTS = 5;
  const MIN_RETRY_INTERVAL = 30 * 60 * 1000; // 30 min in ms
  const MAX_EMAILS_PER_CASE = 3;
  const MAX_SMS_PER_CASE = 2;

  if (actionName === 'retry' && caseData.attempts_made >= MAX_RETRY_ATTEMPTS) {
    violations.push(`MAX_RETRY_ATTEMPTS: Maximum attempts (${MAX_RETRY_ATTEMPTS}) reached`);
  }

  const retries = actionsHistory.filter(a => a.action_type === 'retry' && a.executed_at);
  if (actionName === 'retry' && retries.length > 0) {
    const lastRetry = retries.sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at))[0];
    const timeSinceLastRetry = Date.now() - new Date(lastRetry.executed_at).getTime();
    if (timeSinceLastRetry < MIN_RETRY_INTERVAL) {
      violations.push(`MIN_RETRY_INTERVAL: Last retry was less than 30 minutes ago`);
    }
  }

  const emails = actionsHistory.filter(a => a.action_type === 'email');
  if (actionName === 'email' && emails.length >= MAX_EMAILS_PER_CASE) {
    violations.push(`MAX_EMAILS_PER_CASE: Sent ${emails.length} emails, max is ${MAX_EMAILS_PER_CASE}`);
  }

  const sms = actionsHistory.filter(a => a.action_type === 'sms');
  if (actionName === 'sms' && sms.length >= MAX_SMS_PER_CASE) {
    violations.push(`MAX_SMS_PER_CASE: Sent ${sms.length} SMS, max is ${MAX_SMS_PER_CASE}`);
  }

  const actionId = actionObj ? actionObj.id : null;
  const pendingExec = actionsHistory.filter(a => (actionId ? a.id !== actionId : true) && a.action_type === actionName && ['pending', 'executing'].includes(a.status));
  if (pendingExec.length > 0) {
    violations.push(`DUPLICATE_ACTION_PREVENTION: Action ${actionName} is already pending or executing`);
  }

  if (caseData.expires_at && new Date(caseData.expires_at) < new Date()) {
    violations.push(`CASE_EXPIRED: The case has expired`);
  }

  if (caseData.status === 'recovered') {
    violations.push(`ALREADY_RECOVERED: The case is already recovered`);
  }

  const caseAge = Date.now() - new Date(caseData.opened_at).getTime();
  if (caseAge > 20 * 24 * 60 * 60 * 1000) { // 20 days
    warnings.push(`RECOVERY_WINDOW: Case is over 20 days old`);
  }

  // New Guardrails
  if (actionObj && actionObj.discount_percent && actionObj.discount_percent > 10) {
    violations.push(`MAX_DISCOUNT_PERCENT: Proposed discount ${actionObj.discount_percent}% exceeds 10%`);
  }

  if (customerData && customerData.opted_out === 1 && ['email', 'sms', 'cart_reminder'].includes(actionName)) {
    violations.push(`CUSTOMER_OPTED_OUT: Customer has opted out of communications`);
  }

  const proposedCost = (actionObj && actionObj.intervention_cost) || caseData.intervention_cost || 0;
  if (proposedCost > caseData.amount_at_risk * 0.15) {
    violations.push(`MARGIN_PROTECTION: Intervention cost exceeds 15% of amount at risk`);
  }

  return {
    allowed: violations.length === 0,
    violations,
    warnings
  };
}
