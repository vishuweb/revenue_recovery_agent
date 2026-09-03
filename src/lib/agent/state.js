import { Annotation } from '@langchain/langgraph';

/**
 * Overwrite reducer — last write wins. Used for scalar/object channels that
 * a single node owns at a time (this is a linear-ish graph, not a fan-in).
 */
function overwrite(_current, update) {
  return update === undefined ? _current : update;
}

/** Append reducer for the bounded audit trail kept inside graph state. */
function appendCapped(cap) {
  return (current = [], update) => {
    const additions = Array.isArray(update) ? update : [update];
    const merged = [...current, ...additions.filter(Boolean)];
    return merged.length > cap ? merged.slice(merged.length - cap) : merged;
  };
}

/**
 * AgentState — the single serializable state object threaded through every
 * LangGraph node. Keep this small: no raw LLM transcripts, no full DB rows
 * dumped wholesale, no unbounded arrays. Anything large (full customer
 * payment history, full audit log) stays in the database and is referenced
 * here only via id or a short summary.
 */
export const AgentState = Annotation.Root({
  // ---- identifiers -------------------------------------------------------
  threadId: Annotation({ reducer: overwrite, default: () => null }),
  caseId: Annotation({ reducer: overwrite, default: () => null }),
  actionId: Annotation({ reducer: overwrite, default: () => null }),
  paymentId: Annotation({ reducer: overwrite, default: () => null }),
  customerId: Annotation({ reducer: overwrite, default: () => null }),

  // ---- input event --------------------------------------------------------
  event: Annotation({ reducer: overwrite, default: () => null }),

  // ---- loaded context (small, id-bearing summaries only) -----------------
  customer: Annotation({ reducer: overwrite, default: () => null }),
  payment: Annotation({ reducer: overwrite, default: () => null }),
  caseRecord: Annotation({ reducer: overwrite, default: () => null }),

  amount_at_risk: Annotation({ reducer: overwrite, default: () => 0 }),
  customer_value: Annotation({ reducer: overwrite, default: () => 0 }),

  // ---- analysis ------------------------------------------------------------
  failure_reason: Annotation({ reducer: overwrite, default: () => null }),
  failure_category: Annotation({ reducer: overwrite, default: () => 'unknown' }),
  is_retryable: Annotation({ reducer: overwrite, default: () => false }),
  failure_explanation: Annotation({ reducer: overwrite, default: () => null }),

  risk_score: Annotation({ reducer: overwrite, default: () => 0 }),
  priority_tier: Annotation({ reducer: overwrite, default: () => 'low' }),
  recovery_probability: Annotation({ reducer: overwrite, default: () => 0 }),

  // ---- memory (bounded summaries, not raw dumps) --------------------------
  retrieved_memory: Annotation({ reducer: overwrite, default: () => null }),

  // ---- decision --------------------------------------------------------
  candidate_actions: Annotation({ reducer: overwrite, default: () => [] }),
  selected_action: Annotation({ reducer: overwrite, default: () => null }),
  action_reason: Annotation({ reducer: overwrite, default: () => null }),
  action_params: Annotation({ reducer: overwrite, default: () => ({}) }),
  llm_used: Annotation({ reducer: overwrite, default: () => false }),
  llm_fallback_reason: Annotation({ reducer: overwrite, default: () => null }),

  // ---- policy ------------------------------------------------------------
  policy_result: Annotation({ reducer: overwrite, default: () => null }),

  // ---- execution -----------------------------------------------------------
  execution_result: Annotation({ reducer: overwrite, default: () => null }),
  outcome: Annotation({ reducer: overwrite, default: () => null }),

  // ---- loop control / stopping rules ---------------------------------------
  attempt_count: Annotation({ reducer: overwrite, default: () => 0 }),
  max_attempts: Annotation({ reducer: overwrite, default: () => 5 }),
  iteration_count: Annotation({ reducer: overwrite, default: () => 0 }),
  max_iterations: Annotation({ reducer: overwrite, default: () => 6 }),
  next_action: Annotation({ reducer: overwrite, default: () => null }),
  stop_reason: Annotation({ reducer: overwrite, default: () => null }),

  // ---- timestamps / audit --------------------------------------------------
  timestamps: Annotation({ reducer: (c = {}, u) => ({ ...c, ...(u || {}) }), default: () => ({}) }),
  audit_trail: Annotation({ reducer: appendCapped(50), default: () => [] }),
});

/**
 * Build the initial AgentState for a fresh run.
 * @param {import('./eventNormalizer.js').NormalizedEvent} event
 * @param {{ threadId?: string, maxAttempts?: number, maxIterations?: number }} [opts]
 */
export function buildInitialState(event, opts = {}) {
  return {
    threadId: opts.threadId || `case_${event.paymentId || event.customerId}_${Date.now()}`,
    paymentId: event.paymentId || null,
    customerId: event.customerId || null,
    event,
    max_attempts: opts.maxAttempts || 5,
    max_iterations: opts.maxIterations || 6,
    timestamps: { startedAt: new Date().toISOString() },
    audit_trail: [{ phase: 'agent_started', at: new Date().toISOString(), summary: `Agent run started for ${event.eventType}` }],
  };
}
