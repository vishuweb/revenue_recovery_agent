import { getDb } from '../../db/database.js';
import { evaluatePolicy } from '../../policy/policyEngine.js';

/**
 * policy_gate — the deterministic safety layer between the (possibly
 * LLM-influenced) recommendation and execution. Exactly mirrors the rules
 * the existing deterministic pipeline enforces (lib/engine/guardrails.js),
 * so nothing the agent does is held to a looser standard. The LLM has no
 * visibility into or influence over this node.
 */
export async function policyGate(state) {
  const db = getDb();
  const openedAt = state.timestamps?.startedAt || new Date().toISOString();

  const caseData = {
    status: state.caseRecord?.status || 'open',
    attempts_made: state.attempt_count || 0,
    amount_at_risk: state.amount_at_risk || 0,
    intervention_cost: state.action_params?.interventionCost || 0,
    opened_at: openedAt,
    expires_at: state.caseRecord?.expires_at || new Date(new Date(openedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const proposedAction = {
    action_type: state.selected_action,
    discount_percent: state.action_params?.discountPercent || undefined,
    intervention_cost: state.action_params?.interventionCost || 0,
    nev: state.action_params?.nev ?? undefined,
  };

  const actionsHistory = state.caseId
    ? await db.prepare('SELECT * FROM recovery_actions WHERE case_id = ?').all(state.caseId)
    : [];

  let recentInterventionCount = 0;
  if (state.customerId) {
    const row = await db.prepare(`
      SELECT COUNT(*) as count FROM recovery_actions ra
      JOIN recovery_cases rc ON ra.case_id = rc.id
      WHERE rc.customer_id = ? AND ra.executed_at > datetime('now', '-30 days')
    `).get(state.customerId);
    recentInterventionCount = row?.count || 0;
  }

  const result = evaluatePolicy(caseData, proposedAction, actionsHistory, state.customer, { recentInterventionCount });

  const summary = result.allowed
    ? `Policy ALLOWED '${state.selected_action}'${result.modifications.length ? ` (modified: ${result.modifications.join('; ')})` : ''}`
    : `Policy DENIED '${state.selected_action}': ${result.violations.join('; ')}`;

  return {
    policy_result: result,
    audit_trail: [{ phase: 'policy_gate', at: new Date().toISOString(), summary }],
  };
}

/** Router used by the graph's conditional edge out of policy_gate. */
export function routePolicyGate(state) {
  return state.policy_result?.allowed ? 'ALLOW' : 'DENY';
}
