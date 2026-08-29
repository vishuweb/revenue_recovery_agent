/**
 * Revenue Attribution Engine
 * 
 * Classifies recovered revenue into categories based on causal evidence.
 * Honest about the inherent limitation: without a randomized holdout group,
 * we cannot prove causal attribution. We label accordingly.
 * 
 * Attribution Types:
 * - organic:      Customer self-cured before any intervention executed
 * - recovered:    Direct recovery via a retry that succeeded
 * - assisted:     Recovery after an intervention (email, discount, etc.) was executed
 * - unrecovered:  Case closed without recovery
 */

/**
 * Classify the attribution type for a resolved recovery case.
 * 
 * @param {Object} caseData — full recovery_cases row
 * @param {Object[]} actions — all recovery_actions for this case
 * @returns {{ type: string, confidence: string, explanation: string }}
 */
export function classifyAttribution(caseData, actions) {
  // Unrecovered: case was not recovered
  if (caseData.status !== 'recovered' || !caseData.recovered_amount) {
    return {
      type: 'unrecovered',
      confidence: 'definitive',
      explanation: 'Case was not recovered. Revenue remains at risk.',
    };
  }

  const executedActions = actions.filter(a => a.status === 'completed' && a.executed_at);
  const successfulRetries = executedActions.filter(a => a.action_type === 'retry' && a.result === 'success');

  // No intervention was executed before recovery → organic self-cure
  if (executedActions.length === 0) {
    return {
      type: 'organic',
      confidence: 'high',
      explanation: 'Customer payment succeeded before any intervention was executed. Likely organic self-cure.',
    };
  }

  // Check timing: if recovery happened very quickly after case creation (< 1 hour)
  // and no meaningful intervention (retry, discount) succeeded, likely organic
  if (caseData.opened_at && caseData.resolved_at) {
    const openedMs = new Date(caseData.opened_at).getTime();
    const resolvedMs = new Date(caseData.resolved_at).getTime();
    const durationMs = resolvedMs - openedMs;

    if (durationMs < 60 * 60 * 1000 && successfulRetries.length === 0) {
      return {
        type: 'organic',
        confidence: 'medium',
        explanation: `Recovery within ${Math.round(durationMs / 60000)} minutes of case creation, no retry succeeded. Attributed as organic.`,
      };
    }
  }

  // Direct recovery: a retry action specifically succeeded
  if (successfulRetries.length > 0) {
    return {
      type: 'recovered',
      confidence: 'high',
      explanation: `Direct recovery via ${successfulRetries.length} successful retry attempt(s). Attributed recovery.`,
    };
  }

  // Assisted recovery: other interventions executed before payment succeeded
  const executedNonRetry = executedActions.filter(a => a.action_type !== 'retry');
  if (executedNonRetry.length > 0) {
    const actionTypes = [...new Set(executedNonRetry.map(a => a.action_type))].join(', ');
    return {
      type: 'assisted',
      confidence: 'medium',
      explanation: `Recovery after ${executedNonRetry.length} intervention(s) (${actionTypes}). Attributed as assisted — causal link is probable but not proven without holdout.`,
    };
  }

  // Fallback: some actions executed but all failed, yet case recovered → likely organic
  return {
    type: 'organic',
    confidence: 'low',
    explanation: 'Interventions were attempted but all failed. Recovery was likely organic.',
  };
}

/**
 * Estimate a naive retry baseline for strategy comparison.
 * 
 * Simulates what a simple "retry everything immediately" strategy
 * would recover, using base category probabilities for temporary failures only.
 * 
 * This is NOT a rigorous A/B test. Label as:
 * "Estimated comparison based on historical category probabilities."
 * 
 * @param {Object[]} cases — array of recovery_cases rows
 * @returns {{ naiveEstimate: number, adaptiveActual: number, incrementalValue: number, caseCount: number }}
 */
export function estimateNaiveBaseline(cases) {
  // Naive strategy: retry only temporary failures, with base probabilities
  const NAIVE_PROBABILITIES = {
    temporary: 0.45,    // Average base prob for temp failures, no optimization
    behavioral: 0.10,   // Naive retry doesn't address behavioral causes
    permanent: 0.02,    // Almost never works for permanent failures
    abandonment: 0.05,  // Retry doesn't help abandonment
    opportunity: 0.03,  // Retry doesn't capture opportunity
    unknown: 0.15,
  };

  let naiveEstimate = 0;
  let adaptiveActual = 0;

  for (const c of cases) {
    const category = c.failure_category || 'unknown';
    const naiveProb = NAIVE_PROBABILITIES[category] || 0.15;
    naiveEstimate += Math.round(c.amount_at_risk * naiveProb);
    adaptiveActual += (c.recovered_amount || 0);
  }

  return {
    naiveEstimate,
    adaptiveActual,
    incrementalValue: adaptiveActual - naiveEstimate,
    caseCount: cases.length,
    disclaimer: 'Estimated comparison based on historical category probabilities. Not a statistically valid A/B test.',
  };
}
