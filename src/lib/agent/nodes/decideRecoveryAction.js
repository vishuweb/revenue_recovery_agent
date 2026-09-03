import { classifyFailure } from '../../engine/classifier.js';
import { decideAction } from '../../engine/decider.js';
import { deterministicFallback } from '../../engine/fallback.js';
import { calculateNEV } from '../../engine/economics.js';
import { getStructuredCompletion } from '../llm/provider.js';
import { ActionRecommendationSchema } from '../schemas.js';

const MEMORY_SUCCESS_BOOST = 1.20;  // capped at 0.95 probability
const MEMORY_FAILURE_PENALTY = 0.80;

/**
 * Re-price candidates using this specific customer's own remembered
 * outcomes. This is a real probability recalibration — not a ranking
 * hack — run through the exact same calculateNEV() used everywhere else:
 * a candidate this customer has personally recovered through before gets
 * its probability (and therefore its NEV) revised upward; one that has
 * personally failed for them gets revised downward. Candidates with no
 * memory signal are returned unchanged.
 *
 * @returns {{ adjusted: object[], adjustments: object[] }} adjustments
 *   lists only the candidates memory actually touched, for audit/UI use.
 */
function applyMemoryAdjustment(candidates, memory, amountAtRisk) {
  const successful = new Set(memory?.priorSuccessfulActions || []);
  const failed = new Set(memory?.priorFailedActions || []);
  const adjustments = [];

  const adjusted = candidates.map((c) => {
    if (!successful.has(c.action) && !failed.has(c.action)) {
      return c;
    }

    const wasSuccessful = successful.has(c.action);
    const adjustedProbability = wasSuccessful
      ? Math.min(0.95, c.probability * MEMORY_SUCCESS_BOOST)
      : Math.max(0.01, c.probability * MEMORY_FAILURE_PENALTY);

    const { expectedRecovery, interventionCost, nev } = calculateNEV(amountAtRisk, adjustedProbability, c.action, c.discountPercent || 0);

    adjustments.push({
      action: c.action,
      wasSuccessful,
      originalProbability: c.probability,
      adjustedProbability,
      originalNev: c.nev,
      adjustedNev: nev,
      reason: wasSuccessful
        ? `this customer has personally recovered via '${c.action}' before`
        : `'${c.action}' did not work for this customer previously`,
    });

    return { ...c, probability: adjustedProbability, expectedRecovery, interventionCost, nev };
  });

  return { adjusted, adjustments };
}

/**
 * decide_recovery_action — candidate generation is fully deterministic
 * (lib/engine/decider.js + economics.js, unchanged). Two things can shift
 * the raw NEV-optimal pick, both bounded and auditable:
 *
 *  1. Long-term memory (applyMemoryAdjustment, above) — re-prices
 *     candidates using this customer's own remembered outcomes, then
 *     re-ranks by the recalculated NEV. This can be proven: run the same
 *     customer through a failure twice, and the second decision visibly
 *     reflects the first outcome.
 *  2. The LLM — given ONLY the (memory-adjusted) positive-NEV candidates,
 *     asked to pick one and explain why.
 *
 * Neither can revive a negative-NEV action, invent a new one, or touch
 * money directly. If the LLM is unavailable, returns invalid JSON, or
 * recommends anything outside the pre-approved set, the memory-adjusted
 * deterministic top pick is used unchanged.
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

  const { adjusted: adjustedCandidates, adjustments: memoryAdjustments } = applyMemoryAdjustment(
    decision.candidates || [], state.retrieved_memory, state.amount_at_risk || 0
  );
  const rankedByAdjustedNev = [...adjustedCandidates].sort((a, b) => b.nev - a.nev);
  const allNegativeAdjusted = rankedByAdjustedNev.every((c) => c.nev <= 0);
  const noActionCandidate = rankedByAdjustedNev.find((c) => c.action === 'no_action');
  const deterministicTop = allNegativeAdjusted ? (noActionCandidate || rankedByAdjustedNev[0]) : rankedByAdjustedNev[0];

  // A changed top pick only counts as "memory influenced" when memory
  // adjusted the NEW winner itself — not when it merely demoted some other
  // candidate (e.g. penalizing a prior failure could hand the win to
  // 'no_action' without 'no_action' itself having any memory signal).
  const memoryReasonEntry = memoryAdjustments.find((a) => a.action === deterministicTop.action) || null;
  const memoryInfluenced = Boolean(memoryReasonEntry) && deterministicTop.action !== decision.action;

  let finalAction = deterministicTop.action;
  let finalReason = memoryInfluenced
    ? `Previous recovery outcome influenced this decision: ${memoryReasonEntry.reason} (adjusted probability ${(memoryReasonEntry.adjustedProbability * 100).toFixed(0)}% vs baseline ${(memoryReasonEntry.originalProbability * 100).toFixed(0)}%, NEV ₹${(deterministicTop.nev / 100).toFixed(0)}). Raw NEV without memory would have selected '${decision.action}'.`
    : decision.reasoning;
  let decisionAiAssisted = false;
  let decisionAiFallbackReason = decision.isAIFallback ? 'deterministic_fallback_engine_used' : null;

  const positiveNevCandidates = rankedByAdjustedNev.filter((c) => c.nev > 0);

  if (!allNegativeAdjusted && positiveNevCandidates.length > 0) {
    const memory = state.retrieved_memory || {};
    const llmResult = await getStructuredCompletion({
      systemPrompt: `You are a revenue-recovery strategist. Choose the single best action from the given list to recover a failed/at-risk payment. You may ONLY choose an action from the provided candidate list — any other answer is invalid. Respond ONLY with JSON matching: {"recommendedAction": one of the candidate actions, "reasoning": string, "confidence": number 0-1}.`,
      userPrompt: [
        `Candidate actions (already financially approved, positive net expected value, memory-adjusted): ${positiveNevCandidates.map((c) => `${c.action} (NEV ₹${(c.nev / 100).toFixed(0)}, probability ${(c.probability * 100).toFixed(0)}%)`).join('; ')}`,
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
      decisionAiAssisted = true;
    } else if (llmResult.ok) {
      decisionAiFallbackReason = `llm_recommended_ineligible_action: ${llmResult.data.recommendedAction}`;
    } else {
      decisionAiFallbackReason = llmResult.reason;
    }
  }

  const selectedCandidate = rankedByAdjustedNev.find((c) => c.action === finalAction) || null;

  return {
    candidate_actions: rankedByAdjustedNev,
    selected_action: finalAction,
    action_reason: finalReason,
    action_params: {
      discountPercent: selectedCandidate?.discountPercent || 0,
      interventionCost: selectedCandidate?.interventionCost || 0,
      scheduledDelay: selectedCandidate?.scheduledDelay || 0,
      requiresApproval: selectedCandidate?.requiresApproval || (state.amount_at_risk > 5000000),
      nev: selectedCandidate?.nev ?? null,
    },
    decision_ai_assisted: decisionAiAssisted,
    decision_ai_fallback_reason: decisionAiFallbackReason,
    memory_influenced: memoryInfluenced,
    memory_reason: memoryInfluenced ? memoryReasonEntry.reason : null,
    audit_trail: [{
      phase: 'decide_recovery_action', at: new Date().toISOString(),
      summary: `Selected '${finalAction}' — ${decisionAiAssisted ? 'LLM-guided among policy-eligible options' : `deterministic NEV selection${memoryInfluenced ? ' (memory-adjusted)' : ''}${decisionAiFallbackReason ? ` (${decisionAiFallbackReason})` : ''}`}`,
    }],
  };
}
