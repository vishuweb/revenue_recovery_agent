import { recordOutcome } from '../../memory/memoryService.js';
import { NOTIFICATION_CHANNELS } from '../tools/actionExecutor.js';
import { logDecision } from '../../engine/observability.js';

/**
 * update_memory — writes one bounded, structured fact about this attempt
 * to long-term memory (lib/memory/memoryService.js) so future decisions
 * for this customer, and for this failure category system-wide, are
 * informed by what actually worked.
 *
 * When the action only dispatched an outreach and is now awaiting a real
 * customer response (see observe_outcome), the outcome isn't known yet —
 * writing "success" here would be a guess, not a fact. That case is
 * skipped; the real outcome gets recorded once the case actually resolves
 * (see graph.js's resumeRecoveryAgent, which attributes the eventual
 * result to this same action).
 */
export async function updateMemory(state) {
  const entityId = state.caseId || state.paymentId || 'unknown';

  if (state.awaiting_real_world_signal) {
    await logDecision(entityId, 'memory_retrieved', {
      message: `Outcome for '${state.selected_action}' not yet known — memory write deferred until the case resolves (see resume/short-circuit logic).`,
    }, { actor: 'agent', entityType: 'case' });
    return {
      audit_trail: [{
        phase: 'update_memory', at: new Date().toISOString(),
        summary: `Outcome for '${state.selected_action}' not yet known — memory write deferred until the case resolves`,
      }],
    };
  }

  if (state.selected_action && state.customerId) {
    const success = state.outcome === 'RECOVERED' || Boolean(state.execution_result?.success);
    recordOutcome({
      customerId: state.customerId,
      caseId: state.caseId,
      failureCategory: state.failure_category,
      actionType: state.selected_action,
      success,
      discountPercent: state.action_params?.discountPercent || null,
      channel: NOTIFICATION_CHANNELS.has(state.selected_action) ? state.selected_action : null,
      detail: { llmUsed: state.decision_ai_assisted, memoryInfluenced: state.memory_influenced, nev: state.action_params?.nev, outcome: state.outcome },
    });
    await logDecision(entityId, 'memory_updated', {
      actionType: state.selected_action, success,
      message: `Recorded '${state.selected_action}' as ${success ? 'successful' : 'unsuccessful'} for this customer — informs future decisions.`,
    }, { actor: 'agent' });
  }

  return {
    audit_trail: [{
      phase: 'update_memory', at: new Date().toISOString(),
      summary: `Recorded outcome for '${state.selected_action}' -> ${state.outcome}`,
    }],
  };
}
