import { classifyFailure } from '../../engine/classifier.js';
import { decideAction } from '../../engine/decider.js';
import { deterministicFallback } from '../../engine/fallback.js';
import { getStructuredCompletion } from '../llm/provider.js';
import { ActionRecommendationSchema } from '../schemas.js';

/**
 * decide_recovery_action — candidate generation and NEV evaluation are
 * fully deterministic (lib/engine/decider.js + economics.js, unchanged).
 * The LLM is given ONLY the candidates that already have a positive net
 * expected value (i.e. the financially-sound set the deterministic engine
 * itself produced) plus the customer's remembered history, and asked to
 * pick which one to lead with and explain why. If the LLM is unavailable,
 * returns invalid JSON, or recommends anything outside that pre-approved
 * set, the deterministic top-NEV pick is used unchanged — the LLM can
 * influence *ordering among safe options*, never invent one, never revive
 * a negative-NEV action, and never touch money directly.
 */
export async function decideRecoveryAction(state) {
  const classification = classifyFailure(state.failure_reason, state.payment?.failure_source);

  const caseData = {
    attempts_made: state.attempt_count || 0,
    max_attempts: state.max_attempts || 5,
    failure_category: state.failure_category || classification.category,
    amount_at_risk: state.amount_at_risk || 0,
    failure_reason: state.failure_reason,
    metadata: state.event?.metadata || {},
  };
  const prediction = { probability: state.recovery_probability || 0 };
  const priority = { score: state.risk_score || 0, tier: state.priority_tier || 'low' };

  let decision;
  try {
    decision = decideAction(caseData, state.customer, classification, prediction, priority);
  } catch (err) {
    decision = deterministicFallback(caseData, state.customer, classification);
  }

  const positiveNevCandidates = (decision.candidates || []).filter((c) => c.nev > 0);
  let finalAction = decision.action;
  let finalReason = decision.reasoning;
  let llmUsed = false;
  let llmFallbackReason = decision.isAIFallback ? 'deterministic_fallback_engine_used' : null;

  if (!decision.allNegativeNEV && positiveNevCandidates.length > 0) {
    const memory = state.retrieved_memory || {};
    const llmResult = await getStructuredCompletion({
      systemPrompt: `You are a revenue-recovery strategist. Choose the single best action from the given list to recover a failed/at-risk payment. You may ONLY choose an action from the provided candidate list — any other answer is invalid. Respond ONLY with JSON matching: {"recommendedAction": one of the candidate actions, "reasoning": string, "confidence": number 0-1}.`,
      userPrompt: [
        `Candidate actions (already financially approved, positive net expected value): ${positiveNevCandidates.map((c) => `${c.action} (NEV ₹${(c.nev / 100).toFixed(0)}, probability ${(c.probability * 100).toFixed(0)}%)`).join('; ')}`,
        `Failure category: ${state.failure_category}. ${state.failure_explanation || ''}`,
        `Customer plan: ${state.customer?.plan || 'unknown'}, lifetime value ₹${((state.customer_value || 0) / 100).toFixed(0)}, discount affinity ${state.customer?.discount_affinity ?? 0.5}.`,
        `Customer memory: preferred channel=${memory.preferredChannel || 'unknown'}, prior successful actions=[${(memory.priorSuccessfulActions || []).join(', ')}], prior failed actions=[${(memory.priorFailedActions || []).join(', ')}].`,
        `Category-wide effective strategies: ${(memory.topStrategiesForCategory || []).map((s) => `${s.action} (${s.successRate}% success)`).join(', ') || 'no history yet'}.`,
      ].join('\n'),
      schema: ActionRecommendationSchema,
    });

    if (llmResult.ok && positiveNevCandidates.some((c) => c.action === llmResult.data.recommendedAction)) {
      const chosen = positiveNevCandidates.find((c) => c.action === llmResult.data.recommendedAction);
      finalAction = chosen.action;
      finalReason = `${llmResult.data.reasoning} (NEV ₹${(chosen.nev / 100).toFixed(0)}, confidence ${(llmResult.data.confidence * 100).toFixed(0)}%)`;
      llmUsed = true;
    } else if (llmResult.ok) {
      llmFallbackReason = `llm_recommended_ineligible_action: ${llmResult.data.recommendedAction}`;
    } else {
      llmFallbackReason = llmResult.reason;
    }
  }

  const selectedCandidate = (decision.candidates || []).find((c) => c.action === finalAction) || null;

  return {
    candidate_actions: decision.candidates || [],
    selected_action: finalAction,
    action_reason: finalReason,
    action_params: {
      discountPercent: selectedCandidate?.discountPercent || 0,
      interventionCost: selectedCandidate?.interventionCost || 0,
      scheduledDelay: selectedCandidate?.scheduledDelay || 0,
      requiresApproval: selectedCandidate?.requiresApproval || (state.amount_at_risk > 5000000),
      nev: selectedCandidate?.nev ?? null,
    },
    llm_used: llmUsed,
    llm_fallback_reason: llmFallbackReason,
    audit_trail: [{
      phase: 'decide_recovery_action', at: new Date().toISOString(),
      summary: `Selected '${finalAction}' — ${llmUsed ? 'LLM-guided among policy-eligible options' : `deterministic NEV selection${llmFallbackReason ? ` (${llmFallbackReason})` : ''}`}`,
    }],
  };
}
