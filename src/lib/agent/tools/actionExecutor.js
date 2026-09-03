import { getPaymentProvider } from '../../providers/provider.js';
import { auditLog } from '../../db/database.js';
import { executeRecoveryAction } from '../../engine/orchestrator.js';

/**
 * ActionExecutor — the only tools the agent may call.
 *
 * Every function here validates its inputs, never accepts a free-form
 * action name or URL from the LLM, and always returns the same structured
 * shape: { success, action, timestamp, externalReference, message, error }.
 * The LLM never calls these directly — `decide_recovery_action` picks an
 * action *name* from a pre-computed, policy-eligible candidate list, and
 * only the `execute_action` graph node (after the deterministic policy
 * gate has approved it) invokes the matching tool below.
 */

function toolResult({ success, action, externalReference = null, message = null, error = null }) {
  return { success, action, timestamp: new Date().toISOString(), externalReference, message, error };
}

/** Retry a failed payment through the configured payment provider (Razorpay or simulation). */
export async function retryPayment(paymentId, amount, customerId, caseData = null) {
  if (!paymentId || !customerId) return toolResult({ success: false, action: 'retry', error: 'paymentId and customerId are required' });
  if (!(amount > 0)) return toolResult({ success: false, action: 'retry', error: 'amount must be a positive number' });

  try {
    const provider = getPaymentProvider();
    const result = await provider.retryPayment(paymentId, amount, customerId, caseData);
    return toolResult({
      success: Boolean(result.success),
      action: 'retry',
      externalReference: result.providerPaymentId || null,
      message: result.success ? 'Payment retry succeeded' : `Payment retry failed: ${result.failureReason || 'unknown'}`,
      error: result.success ? null : (result.failureReason || 'retry_failed'),
    });
  } catch (err) {
    return toolResult({ success: false, action: 'retry', error: err.message });
  }
}

/** Create a hosted payment link for the customer to self-serve recovery. */
export async function createPaymentLink(customerId, amount, description, options = {}) {
  if (!customerId) return toolResult({ success: false, action: 'payment_link', error: 'customerId is required' });
  if (!(amount > 0)) return toolResult({ success: false, action: 'payment_link', error: 'amount must be a positive number' });

  try {
    const provider = getPaymentProvider();
    const result = await provider.createPaymentLink(customerId, amount, description, options);
    return toolResult({
      success: true,
      action: 'payment_link',
      externalReference: result.linkId || null,
      message: result.url ? `Payment link created: ${result.url}` : 'Payment link created',
    });
  } catch (err) {
    return toolResult({ success: false, action: 'payment_link', error: err.message });
  }
}

export const NOTIFICATION_CHANNELS = new Set(['email', 'sms', 'cart_reminder']);

/** Send a bounded, pre-templated recovery notification. No free-form content, no arbitrary recipients. */
export async function sendRecoveryNotification(customerId, channel, caseId, message = null) {
  if (!NOTIFICATION_CHANNELS.has(channel)) {
    return toolResult({ success: false, action: channel, error: `Unsupported notification channel: ${channel}` });
  }
  if (!customerId) return toolResult({ success: false, action: channel, error: 'customerId is required' });

  // No real email/SMS provider is wired up yet — this is the same explicitly
  // labeled stand-in the deterministic engine already uses for these
  // channels (see lib/engine/orchestrator.js executeRecoveryAction).
  return toolResult({
    success: true,
    action: channel,
    message: message || `${channel} notification dispatched to customer ${customerId}`,
  });
}

/** Hand a case off to a human analyst. Always requires approval; never itself moves money. */
export async function escalateCase(caseId, reason) {
  if (!caseId) return toolResult({ success: false, action: 'escalate', error: 'caseId is required' });

  try {
    await auditLog({
      entityType: 'case',
      entityId: caseId,
      eventType: 'agent_escalation',
      actor: 'agent',
      description: `Agent escalated case to human analyst: ${reason || 'policy or confidence threshold'}`,
      details: { reason },
    });
    return toolResult({ success: true, action: 'escalate', message: `Escalated: ${reason || 'requires human review'}` });
  } catch (err) {
    return toolResult({ success: false, action: 'escalate', error: err.message });
  }
}

/** Record a bounded-cost incentive action (discount, free_shipping, cart_reminder, targeted_campaign) or a deliberate no-op. */
export async function recordRecoveryAction(caseId, actionType, details = {}) {
  if (!caseId || !actionType) return toolResult({ success: false, action: actionType, error: 'caseId and actionType are required' });

  try {
    await auditLog({
      entityType: 'case',
      entityId: caseId,
      eventType: 'agent_action_recorded',
      actor: 'agent',
      description: `Agent recorded action ${actionType}`,
      details,
    });
    return toolResult({ success: true, action: actionType, message: `Recorded ${actionType}` });
  } catch (err) {
    return toolResult({ success: false, action: actionType, error: err.message });
  }
}

/**
 * The dispatcher the `execute_action` graph node actually calls: it inserts
 * the recovery_actions row and delegates real execution to the existing,
 * fully-tested `executeRecoveryAction` in the deterministic orchestrator —
 * so dead-letter handling, retryable-vs-permanent error classification, and
 * provider execution are implemented exactly once for both pipelines.
 * The result is reshaped into the standard tool contract.
 */
export async function executeActionTool(actionId) {
  const result = await executeRecoveryAction(actionId);
  const success = result.status === 'completed';

  return toolResult({
    success,
    action: result.result?.action || null,
    externalReference: result.result?.providerPaymentId || result.result?.url || null,
    message: result.result?.msg || result.reason || (success ? 'Action completed' : `Action ${result.status}`),
    // `error` doubles as a machine-readable non-success status code
    // (e.g. 'pending_approval', 'dead_letter', 'skipped') so callers can
    // branch without re-deriving it from the message string.
    error: success ? null : (result.status === 'error' ? result.error : result.status),
  });
}
