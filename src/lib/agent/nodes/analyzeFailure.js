import { classifyFailure } from '../../engine/classifier.js';
import { getStructuredCompletion } from '../llm/provider.js';
import { FailureAnalysisSchema } from '../schemas.js';

/**
 * analyze_failure — classification is deterministic ground truth (the same
 * lib/engine/classifier.js used by the existing pipeline); the LLM is only
 * asked for a human-readable root-cause explanation and a confidence score.
 * It cannot change the category, the base recovery probability, or whether
 * the failure is retryable — those numbers drive money-affecting decisions
 * downstream and stay under deterministic control.
 */
export async function analyzeFailure(state) {
  const classification = classifyFailure(state.failure_reason, state.payment?.failure_source);

  // Batch runs (see /api/agent/batch) explicitly disable the LLM so 100+
  // cases stay fast and never depend on a live model — this is a real
  // skip, not a fallback-after-trying, so the timeline must say so
  // honestly rather than implying a call was attempted.
  const llmResult = state.llm_enabled
    ? await getStructuredCompletion({
        systemPrompt: 'You are a payments analyst. Given a payment failure reason and category, write one concise sentence explaining the likely root cause for a support dashboard. Respond ONLY with JSON matching: {"rootCause": string, "category": one of ["temporary","behavioral","permanent","abandonment","opportunity","unknown"], "confidence": number 0-1}.',
        userPrompt: `Failure reason: ${state.failure_reason || 'unknown'}\nDeterministic category: ${classification.category}\nBase recovery probability: ${classification.baseRecoveryProbability}\nCustomer plan: ${state.customer?.plan || 'unknown'}`,
        schema: FailureAnalysisSchema,
      })
    : { ok: false, reason: 'llm_disabled_for_batch_run' };

  const explanation = llmResult.ok
    ? llmResult.data.rootCause
    : classification.description;

  return {
    failure_category: classification.category,
    is_retryable: classification.isRetryable,
    failure_explanation: explanation,
    analysis_ai_assisted: llmResult.ok,
    analysis_ai_fallback_reason: llmResult.ok ? null : llmResult.reason,
    audit_trail: [{
      phase: 'analyze_failure', at: new Date().toISOString(),
      summary: `Classified as ${classification.category} (retryable=${classification.isRetryable}). ${llmResult.ok ? 'LLM explanation used.' : `LLM unavailable, using deterministic description (${llmResult.reason}).`}`,
    }],
  };
}
