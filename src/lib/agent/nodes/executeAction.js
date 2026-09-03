import { getDb } from '../../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import { logDecision } from '../../engine/observability.js';
import { executeActionTool } from '../tools/actionExecutor.js';

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
    await logDecision(caseId, 'classified', { category: state.failure_category, baseProbability: state.recovery_probability }, { actor: 'agent' });
    await logDecision(caseId, 'predicted', { probability: state.recovery_probability }, { actor: 'agent' });
    await logDecision(caseId, 'candidates_generated', { candidateCount: (state.candidate_actions || []).length }, { actor: 'agent' });
  }

  const actionId = uuidv4();
  const requiresApproval = Boolean(state.action_params?.requiresApproval);

  await db.prepare(`
    INSERT INTO recovery_actions (
      id, case_id, action_type, status, scheduled_at, requires_approval, ai_reasoning, discount_percent, created_at
    ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
  `).run(
    actionId, caseId, state.selected_action,
    new Date(Date.now() + (state.action_params?.scheduledDelay || 0)).toISOString(),
    requiresApproval ? 1 : 0,
    `[Agent${state.llm_used ? '+LLM' : ''}] ${state.action_reason}`,
    state.action_params?.discountPercent || null,
    now
  );

  await logDecision(caseId, 'action_selected', {
    action: state.selected_action, nev: state.action_params?.nev, llmUsed: state.llm_used,
  }, { actor: 'agent', amount: state.amount_at_risk });

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
