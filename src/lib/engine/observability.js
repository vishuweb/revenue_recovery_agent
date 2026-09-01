/**
 * Structured Observability Logger
 * 
 * Emits structured decision events to the audit_log table.
 * Every recovery case lifecycle phase is tracked with a consistent schema
 * so the audit trail is machine-parseable and UI-filterable.
 * 
 * Phases (in lifecycle order):
 *   event_received → context_loaded → classified → predicted →
 *   prioritized → candidates_generated → action_selected →
 *   policy_checked → policy_modified → policy_rejected →
 *   executed → execution_failed → recovered → ai_fallback
 */

import { auditLog } from '../db/database.js';

// All valid lifecycle phases
export const DECISION_PHASES = [
  'event_received',
  'context_loaded',
  'classified',
  'predicted',
  'prioritized',
  'candidates_generated',
  'action_selected',
  'policy_checked',
  'policy_modified',
  'policy_rejected',
  'executed',
  'execution_failed',
  'execution_timeout',
  'recovered',
  'recovery_attributed',
  'ai_fallback',
  'dead_letter',
  'idempotency_skip',
];

/**
 * Log a structured decision event.
 * 
 * @param {string} caseId — recovery case ID (or event/action ID)
 * @param {string} phase — one of DECISION_PHASES
 * @param {Object} data — phase-specific structured payload
 * @param {Object} [options] — { actor, amount, entityType }
 */
export async function logDecision(caseId, phase, data, options = {}) {
  const entry = {
    entityType: options.entityType || 'case',
    entityId: caseId,
    eventType: `decision.${phase}`,
    description: buildDescription(phase, data),
    details: JSON.stringify({
      phase,
      timestamp: new Date().toISOString(),
      ...data,
    }),
    actor: options.actor || 'engine',
    amount: options.amount || null,
  };

  try {
    await auditLog(entry);
  } catch (err) {
    // Observability must never crash the decision pipeline
    console.error(`[observability] Failed to log decision phase=${phase} case=${caseId}:`, err.message);
  }
}

/**
 * Build a human-readable description for each phase.
 */
function buildDescription(phase, data) {
  switch (phase) {
    case 'event_received':
      return `Event received: ${data.eventType || data.failureReason || 'unknown'}`;
    case 'context_loaded':
      return `Context loaded: customer=${data.customerId || '?'}, amount=₹${formatPaise(data.amountAtRisk)}`;
    case 'classified':
      return `Classified as ${data.category || '?'} (base probability: ${((data.baseProbability || 0) * 100).toFixed(0)}%)`;
    case 'predicted':
      return `Recovery probability predicted: ${((data.probability || 0) * 100).toFixed(1)}%`;
    case 'prioritized':
      return `Priority: ${data.tier || '?'} (score: ${(data.score || 0).toFixed(1)})`;
    case 'candidates_generated':
      return `${data.candidateCount || 0} candidate actions evaluated`;
    case 'action_selected':
      return `Selected: ${data.action || '?'} (NEV: ₹${formatPaise(data.nev)})`;
    case 'policy_checked':
      return `Policy check: ${data.allowed ? 'APPROVED' : 'VIOLATIONS FOUND'}`;
    case 'policy_modified':
      return `Policy modified action: ${data.modification || '?'}`;
    case 'policy_rejected':
      return `Policy REJECTED action: ${(data.violations || []).join('; ')}`;
    case 'executed':
      return `Action ${data.actionType || '?'} executed: ${data.result || '?'}`;
    case 'execution_failed':
      return `Action ${data.actionType || '?'} failed: ${data.error || 'unknown error'}`;
    case 'execution_timeout':
      return `Action ${data.actionType || '?'} timed out after ${data.timeoutMs || '?'}ms`;
    case 'recovered':
      return `Case recovered: ₹${formatPaise(data.recoveredAmount)}`;
    case 'recovery_attributed':
      return `Attribution: ${data.attributionType || '?'} (confidence: ${data.confidence || '?'})`;
    case 'ai_fallback':
      return `AI fallback applied: ${data.reason || 'primary engine unavailable'}`;
    case 'dead_letter':
      return `Action moved to dead-letter queue: ${data.reason || 'max retries exceeded'}`;
    case 'idempotency_skip':
      return `Duplicate detected, skipped: ${data.key || '?'}`;
    default:
      return `Decision phase: ${phase}`;
  }
}

function formatPaise(paise) {
  if (paise == null || isNaN(paise)) return '0';
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
