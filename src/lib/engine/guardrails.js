/**
 * Policy & Guardrail Engine
 * 
 * Enforces deterministic business rules AFTER the AI decision engine
 * selects an action. This is the safety layer between AI recommendation
 * and action execution.
 * 
 * Flow: AI RECOMMENDATION → POLICY ENGINE → APPROVED/MODIFIED/REJECTED → EXECUTOR
 * 
 * Guardrails are configured via the POLICY object. In production,
 * these would be loaded from a database or config service per tenant.
 */

// Configurable policy constants
export const POLICY = {
  MAX_RETRY_ATTEMPTS: 5,
  MIN_RETRY_INTERVAL_MS: 30 * 60 * 1000,    // 30 minutes
  MAX_EMAILS_PER_CASE: 3,
  MAX_SMS_PER_CASE: 2,
  MAX_DISCOUNT_PERCENT: 10,
  MARGIN_PROTECTION_PERCENT: 15,             // Intervention cost must be < 15% of amount at risk
  CASE_EXPIRY_DAYS: 20,
  MAX_INTERVENTIONS_PER_CUSTOMER_30D: 5,     // Customer fatigue: max interventions across ALL cases
  APPROVAL_THRESHOLD_PAISE: 5000000,         // ₹50,000
};

/**
 * Check all guardrails for a proposed action.
 * Returns { allowed, violations[], warnings[], modifications[] }.
 * 
 * Modifications are policy adjustments applied automatically
 * (e.g., discount clamped from 20% to 10%) — the action is still allowed
 * but the parameters have been changed.
 * 
 * @param {Object} caseData — recovery_cases row
 * @param {Object} proposedAction — action object or string
 * @param {Object[]} actionsHistory — all recovery_actions for this case
 * @param {Object} [customerData] — customer row
 * @param {Object} [crossCaseData] — { recentInterventionCount } across all customer cases
 * @returns {{ allowed: boolean, violations: string[], warnings: string[], modifications: string[] }}
 */
export function checkGuardrails(caseData, proposedAction, actionsHistory, customerData = null, crossCaseData = null) {
  const violations = [];
  const warnings = [];
  const modifications = [];

  const actionName = typeof proposedAction === 'object' ? proposedAction.action_type : proposedAction;
  const actionObj = typeof proposedAction === 'object' ? proposedAction : null;

  // ── Hard limits ────────────────────────────────────────────────────

  // 1. Max retry attempts
  if (actionName === 'retry' && caseData.attempts_made >= POLICY.MAX_RETRY_ATTEMPTS) {
    violations.push(`MAX_RETRY_ATTEMPTS: Maximum attempts (${POLICY.MAX_RETRY_ATTEMPTS}) reached`);
  }

  // 2. Minimum retry interval
  if (actionName === 'retry') {
    const retries = actionsHistory.filter(a => a.action_type === 'retry' && a.executed_at);
    if (retries.length > 0) {
      const sorted = [...retries].sort((a, b) => new Date(b.executed_at) - new Date(a.executed_at));
      const lastRetryTime = new Date(sorted[0].executed_at).getTime();
      // Guard against NaN from invalid date
      if (!isNaN(lastRetryTime)) {
        const timeSinceLastRetry = Date.now() - lastRetryTime;
        if (timeSinceLastRetry < POLICY.MIN_RETRY_INTERVAL_MS) {
          violations.push(`MIN_RETRY_INTERVAL: Last retry was ${Math.round(timeSinceLastRetry / 60000)}m ago, minimum is ${POLICY.MIN_RETRY_INTERVAL_MS / 60000}m`);
        }
      }
    }
  }

  // 3. Email cap per case
  const emails = actionsHistory.filter(a => a.action_type === 'email');
  if (actionName === 'email' && emails.length >= POLICY.MAX_EMAILS_PER_CASE) {
    violations.push(`MAX_EMAILS_PER_CASE: Sent ${emails.length} emails, max is ${POLICY.MAX_EMAILS_PER_CASE}`);
  }

  // 4. SMS cap per case
  const sms = actionsHistory.filter(a => a.action_type === 'sms');
  if (actionName === 'sms' && sms.length >= POLICY.MAX_SMS_PER_CASE) {
    violations.push(`MAX_SMS_PER_CASE: Sent ${sms.length} SMS, max is ${POLICY.MAX_SMS_PER_CASE}`);
  }

  // 5. Duplicate action prevention
  const actionId = actionObj ? actionObj.id : null;
  const pendingExec = actionsHistory.filter(a =>
    (actionId ? a.id !== actionId : true) &&
    a.action_type === actionName &&
    ['pending', 'executing'].includes(a.status)
  );
  if (pendingExec.length > 0) {
    violations.push(`DUPLICATE_ACTION_PREVENTION: Action ${actionName} is already pending or executing`);
  }

  // 6. Case expired
  if (caseData.expires_at && new Date(caseData.expires_at) < new Date()) {
    violations.push(`CASE_EXPIRED: The case has expired`);
  }

  // 7. Already recovered
  if (caseData.status === 'recovered') {
    violations.push(`ALREADY_RECOVERED: The case is already recovered`);
  }

  // 8. Discount cap — MODIFY rather than reject
  if (actionObj && actionObj.discount_percent && actionObj.discount_percent > POLICY.MAX_DISCOUNT_PERCENT) {
    modifications.push(`MAX_DISCOUNT_PERCENT: Discount clamped from ${actionObj.discount_percent}% to ${POLICY.MAX_DISCOUNT_PERCENT}%`);
    // The caller should apply this modification
  }

  // 9. Customer opted out of communications
  if (customerData && customerData.opted_out === 1 && ['email', 'sms', 'cart_reminder'].includes(actionName)) {
    violations.push(`CUSTOMER_OPTED_OUT: Customer has opted out of communications`);
  }

  // 10. Margin protection
  const proposedCost = (actionObj && actionObj.intervention_cost) || caseData.intervention_cost || 0;
  if (proposedCost > 0 && caseData.amount_at_risk > 0) {
    const costPercent = (proposedCost / caseData.amount_at_risk) * 100;
    if (costPercent > POLICY.MARGIN_PROTECTION_PERCENT) {
      violations.push(`MARGIN_PROTECTION: Intervention cost (${costPercent.toFixed(1)}%) exceeds ${POLICY.MARGIN_PROTECTION_PERCENT}% of amount at risk`);
    }
  }

  // 11. Negative NEV warning (not a violation — the decider already handles this)
  if (actionObj && actionObj.nev != null && actionObj.nev < 0) {
    warnings.push(`NEGATIVE_NEV: This action has negative net expected value (₹${(actionObj.nev / 100).toFixed(0)})`);
  }

  // ── Cross-case customer fatigue ────────────────────────────────────

  // 12. Customer fatigue across all active cases
  if (crossCaseData && crossCaseData.recentInterventionCount >= POLICY.MAX_INTERVENTIONS_PER_CUSTOMER_30D) {
    if (!['no_action', 'stop'].includes(actionName)) {
      violations.push(`CUSTOMER_FATIGUE: Customer received ${crossCaseData.recentInterventionCount} interventions in 30 days, max is ${POLICY.MAX_INTERVENTIONS_PER_CUSTOMER_30D}`);
    }
  }

  // ── Warnings (non-blocking) ────────────────────────────────────────

  // 13. Case age warning
  if (caseData.opened_at) {
    const openedTime = new Date(caseData.opened_at).getTime();
    if (!isNaN(openedTime)) {
      const caseAge = Date.now() - openedTime;
      if (caseAge > POLICY.CASE_EXPIRY_DAYS * 24 * 60 * 60 * 1000) {
        warnings.push(`RECOVERY_WINDOW: Case is over ${POLICY.CASE_EXPIRY_DAYS} days old`);
      }
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
    warnings,
    modifications,
  };
}
