import { getDb } from '../../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import { logDecision } from '../../engine/observability.js';
import { executeActionTool } from '../tools/actionExecutor.js';

// Actions whose "success" only means the outreach was dispatched, not that
// the customer has responded (see observe_outcome). Their recovery_actions
// row is stamped with a real recheck time so the cron sweep
// (processPendingAgentResumptions) knows when it's worth looking again —
// configurable for demos via AGENT_RECHECK_DELAY_MS (default 30 minutes).
const PAUSE_WORTHY_ACTIONS = new Set(['payment_link', 'email', 'sms', 'cart_reminder', 'discount', 'free_shipping', 'targeted_campaign']);
const RECHECK_DELAY_MS = parseInt(process.env.AGENT_RECHECK_DELAY_MS, 10) || 30 * 60 * 1000;

/** Honest phrasing — "disabled by design for a batch run" is not the same claim as "the model was unreachable". */
function describeAiSkip(stage, reason, fallbackMessage) {
  if (reason === 'llm_disabled_for_batch_run') {
    return `AI reasoning intentionally skipped for this batch run (performance) — deterministic policy handled ${stage.replace(/_/g, ' ')}.`;
  }
  return fallbackMessage;
}

/**
 * execute_action — reached only after policy_gate ALLOWs. Creates the
 * recovery_cases row on the first pass (identical shape to what
 * lib/engine/orchestrator.js's processFailedPayment writes, so the
 * dashboard renders agent-run cases exactly like deterministic ones),
 * inserts the recovery_actions row, then delegates real execution to the
 * shared `executeActionTool`, which is itself a thin wrapper over the
 * existing, fully-tested `executeRecoveryAction` — provider calls,
 * dead-letter handling, and error classification are implemented once.
 */
export async function executeAction(state) {
  const db = getDb();
  const now = new Date().toISOString();
  let caseId = state.caseId;

  if (!caseId) {
    caseId = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const selected = (state.candidate_actions || []).find((c) => c.action === state.selected_action);

    await db.prepare(`
      INSERT INTO recovery_cases (
        id, customer_id, payment_id, amount_at_risk,
        expected_recovery, net_expected_value, candidate_actions,
        failure_reason, failure_category, recovery_probability, priority_score,
        recommended_action, ai_reasoning, status, current_step, max_attempts,
        attempts_made, recovered_amount, opened_at, expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, ?, 0, 0, ?, ?, ?)
    `).run(
      caseId, state.customerId, state.paymentId, state.amount_at_risk,
      selected?.expectedRecovery || 0, selected?.nev || 0, JSON.stringify(state.candidate_actions || []),
      state.failure_reason, state.failure_category, state.recovery_probability, state.risk_score,
      state.selected_action, `[Agent] ${state.action_reason}`, state.max_attempts,
      state.timestamps?.startedAt || now, expiresAt, now
    );

    await logDecision(caseId, 'event_received', { failureReason: state.failure_reason, amountAtRisk: state.amount_at_risk }, { actor: 'agent', amount: state.amount_at_risk });
    await logDecision(caseId, 'context_loaded', {
      customerId: state.customerId, customerPlan: state.customer?.plan,
      lifetimeValue: state.customer_value, amountAtRisk: state.amount_at_risk, aiAssisted: false,
    }, { actor: 'agent' });
    await logDecision(caseId, 'classified', {
      category: state.failure_category, baseProbability: state.recovery_probability,
      aiAssisted: state.analysis_ai_assisted, explanation: state.failure_explanation,
    }, { actor: 'agent' });
    if (!state.analysis_ai_assisted && state.analysis_ai_fallback_reason) {
      await logDecision(caseId, 'ai_unavailable', {
        stage: 'analyze_failure', reason: state.analysis_ai_fallback_reason,
        message: describeAiSkip('analyze_failure', state.analysis_ai_fallback_reason, 'AI reasoning unavailable. Deterministic classifier used instead — no unsafe action was taken.'),
      }, { actor: 'agent' });
    }
    await logDecision(caseId, 'predicted', { probability: state.recovery_probability, aiAssisted: false }, { actor: 'agent' });
    await logDecision(caseId, 'memory_retrieved', {
      sampleSize: state.retrieved_memory?.sampleSize || 0,
      priorSuccessfulActions: state.retrieved_memory?.priorSuccessfulActions || [],
      priorFailedActions: state.retrieved_memory?.priorFailedActions || [],
      aiAssisted: false,
    }, { actor: 'agent' });
    await logDecision(caseId, 'candidates_generated', { candidateCount: (state.candidate_actions || []).length, aiAssisted: false }, { actor: 'agent' });
  }

  const actionId = uuidv4();
  const requiresApproval = Boolean(state.action_params?.requiresApproval);
  const provenance = [state.decision_ai_assisted ? 'LLM' : null, state.memory_influenced ? 'Memory' : null].filter(Boolean).join('+');
  const scheduledDelay = PAUSE_WORTHY_ACTIONS.has(state.selected_action)
    ? Math.max(state.action_params?.scheduledDelay || 0, RECHECK_DELAY_MS)
    : (state.action_params?.scheduledDelay || 0);

  await db.prepare(`
    INSERT INTO recovery_actions (
      id, case_id, action_type, status, scheduled_at, requires_approval, ai_reasoning, discount_percent, created_at
    ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
  `).run(
    actionId, caseId, state.selected_action,
    new Date(Date.now() + scheduledDelay).toISOString(),
    requiresApproval ? 1 : 0,
    `[Agent${provenance ? `+${provenance}` : ''}] ${state.action_reason}`,
    state.action_params?.discountPercent || null,
    now
  );

  await logDecision(caseId, 'action_selected', {
    action: state.selected_action, nev: state.action_params?.nev,
    aiAssisted: state.decision_ai_assisted, memoryInfluenced: state.memory_influenced,
  }, { actor: 'agent', amount: state.amount_at_risk });

  // Reaching this node at all means policy_gate returned ALLOW (see
  // graph.js's fixed edges) — the DENY path never gets here, it goes to
  // policy_denied instead, which logs its own 'policy_rejected' entry.
  await logDecision(caseId, 'policy_checked', {
    allowed: true, modifications: state.policy_result?.modifications || [], aiAssisted: false,
  }, { actor: 'agent' });

  if (!state.decision_ai_assisted && state.decision_ai_fallback_reason) {
    await logDecision(caseId, 'ai_unavailable', {
      stage: 'decide_recovery_action', reason: state.decision_ai_fallback_reason,
      message: describeAiSkip('decide_recovery_action', state.decision_ai_fallback_reason, 'AI reasoning unavailable. Deterministic recovery policy selected the safest eligible action.'),
    }, { actor: 'agent' });
  }

  // Findable, standalone proof point for "memory changed a decision" —
  // deliberately a separate log entry from action_selected so it's easy
  // to isolate in a demo (see /api/agent/cases/[id]'s memory panel).
  if (state.memory_influenced) {
    const adj = state.memory_adjustment;
    await logDecision(caseId, 'memory_applied', {
      selectedAction: state.selected_action, reason: state.memory_reason,
      adjustment: adj,
      message: adj
        ? `Previous recovery outcome influenced this decision: ${state.memory_reason}. Probability ${(adj.originalProbability * 100).toFixed(0)}% → ${(adj.adjustedProbability * 100).toFixed(0)}%, NEV ₹${(adj.originalNev / 100).toFixed(0)} → ₹${(adj.adjustedNev / 100).toFixed(0)}. Without memory, '${adj.rawWinnerWithoutMemory}' would have been selected instead of '${adj.newWinnerWithMemory}'.`
        : `Previous recovery outcome influenced this decision: ${state.memory_reason}.`,
    }, { actor: 'agent' });
  }

  // Actions the agent is allowed to run autonomously are auto-approved here
  // (mirroring the dashboard's manual "Approve & Dispatch" flow); anything
  // requiring approval (escalate, high-value) is left pending for a human.
  if (!requiresApproval) {
    await db.prepare(`UPDATE recovery_actions SET status = 'approved', approved_by = 'agent' WHERE id = ?`).run(actionId);
  }

  const toolResult = await executeActionTool(actionId);

  return {
    caseId,
    actionId,
    execution_result: toolResult,
    audit_trail: [{
      phase: 'execute_action', at: new Date().toISOString(),
      summary: `Executed '${state.selected_action}': ${toolResult.success ? 'success' : (toolResult.error || 'not completed')}`,
    }],
  };
}
