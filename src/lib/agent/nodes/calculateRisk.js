import { classifyFailure } from '../../engine/classifier.js';
import { predictRecovery } from '../../engine/predictor.js';
import { calculatePriority } from '../../engine/prioritizer.js';

/**
 * calculate_risk — deterministic multi-factor scoring, reusing the exact
 * predictor/prioritizer already used by the deterministic pipeline. No LLM
 * involvement: recovery probability and priority directly drive financial
 * decisions downstream (NEV calculation, policy thresholds), so they stay
 * fully deterministic and reproducible.
 */
export async function calculateRisk(state) {
  const classification = classifyFailure(state.failure_reason, state.payment?.failure_source);

  const caseData = {
    attempts_made: state.attempt_count || 0,
    max_attempts: state.max_attempts || 5,
    failure_category: state.failure_category || classification.category,
    amount_at_risk: state.amount_at_risk || 0,
    opened_at: state.timestamps?.startedAt || new Date().toISOString(),
  };

  const prediction = predictRecovery(classification.baseRecoveryProbability, state.customer, caseData);
  const priority = calculatePriority(prediction.probability, state.amount_at_risk || 0, state.customer_value || 0, 100);

  return {
    recovery_probability: prediction.probability,
    risk_score: priority.score,
    priority_tier: priority.tier,
    audit_trail: [{
      phase: 'calculate_risk', at: new Date().toISOString(),
      summary: `Recovery probability ${(prediction.probability * 100).toFixed(1)}%, priority ${priority.tier} (score ${priority.score.toFixed(1)})`,
    }],
  };
}
