import { getDb } from '../../db/database.js';
import { classifyDenial } from '../../policy/policyEngine.js';
import { logDecision } from '../../engine/observability.js';

/**
 * policy_denied — reached only when policy_gate returns DENY. Never
 * executes anything; classifies the denial into a terminal disposition
 * (STOPPED for hard business-rule violations, ESCALATE when the amount at
 * risk justifies a human look) and closes out the case if one exists.
 */
export async function policyDenied(state) {
  const violations = state.policy_result?.violations || [];
  const { disposition, reason } = classifyDenial(violations, state.amount_at_risk);
  const entityId = state.caseId || state.paymentId || 'unknown';

  await logDecision(entityId, 'policy_rejected', { violations }, { actor: 'agent', amount: state.amount_at_risk });

  if (state.caseId && disposition === 'STOPPED') {
    const db = getDb();
    await db.prepare(`
      UPDATE recovery_cases SET status = 'stopped', resolved_at = ?, updated_at = ?
      WHERE id = ? AND status IN ('open', 'in_progress')
    `).run(new Date().toISOString(), new Date().toISOString(), state.caseId);
  }

  return {
    outcome: disposition,
    stop_reason: reason,
    audit_trail: [{ phase: 'policy_denied', at: new Date().toISOString(), summary: `${disposition}: ${reason}` }],
  };
}
