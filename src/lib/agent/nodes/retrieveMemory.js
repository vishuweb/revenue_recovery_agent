import { getRelevantRecoveryPatterns } from '../../memory/memoryService.js';

/**
 * retrieve_memory — pulls a small, decision-ready summary of what has
 * worked for this customer and for this failure category historically.
 * Bounded by design (see memoryService.getRelevantRecoveryPatterns): a
 * handful of recent facts and a top-5 strategy list, never a raw dump.
 */
export async function retrieveMemory(state) {
  const patterns = await getRelevantRecoveryPatterns(state.customerId, state.failure_category);

  return {
    retrieved_memory: patterns,
    audit_trail: [{
      phase: 'retrieve_memory', at: new Date().toISOString(),
      summary: `Retrieved memory: ${patterns.sampleSize} prior interactions, ${patterns.topStrategiesForCategory.length} known-effective strategies for '${state.failure_category}'`,
    }],
  };
}
