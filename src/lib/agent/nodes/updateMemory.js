import { recordOutcome } from '../../memory/memoryService.js';

const NOTIFICATION_CHANNELS = new Set(['email', 'sms', 'cart_reminder']);

/**
 * update_memory — writes one bounded, structured fact about this attempt
 * to long-term memory (lib/memory/memoryService.js) so future decisions
 * for this customer, and for this failure category system-wide, are
 * informed by what actually worked.
 */
export async function updateMemory(state) {
  if (state.selected_action && state.customerId) {
    recordOutcome({
      customerId: state.customerId,
      caseId: state.caseId,
      failureCategory: state.failure_category,
      actionType: state.selected_action,
      success: state.outcome === 'RECOVERED' || Boolean(state.execution_result?.success),
      discountPercent: state.action_params?.discountPercent || null,
      channel: NOTIFICATION_CHANNELS.has(state.selected_action) ? state.selected_action : null,
      detail: { llmUsed: state.llm_used, nev: state.action_params?.nev, outcome: state.outcome },
    });
  }

  return {
    audit_trail: [{
      phase: 'update_memory', at: new Date().toISOString(),
      summary: `Recorded outcome for '${state.selected_action}' -> ${state.outcome}`,
    }],
  };
}
