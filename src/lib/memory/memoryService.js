import { v4 as uuidv4 } from 'uuid';
import * as store from './sqliteMemory.js';

/**
 * MemoryService — the agent's long-term memory.
 *
 * This is deliberately separate from LangGraph's checkpoint saver
 * (lib/agent/checkpointer.js), which only persists in-flight graph state
 * for resuming a single run. MemoryService persists durable, structured
 * facts *across* runs and *across* cases for the same customer: which
 * strategies worked, which didn't, and what channel they respond to.
 *
 * It is also separate from the business database (customers/payments/
 * recovery_cases remain the source of truth there) — this only stores
 * derived recovery-strategy signal, never a duplicate of business records.
 *
 * Storage is pluggable: everything here goes through sqliteMemory.js's
 * insert/query/aggregate interface, so swapping to a Postgres-backed
 * adapter later means changing that one file, not this one.
 */

/**
 * Remember a structured fact about a recovery attempt.
 * @param {{customerId:string, caseId?:string, failureCategory:string, actionType:string, outcome:'success'|'failure'|'unknown', discountPercent?:number, channel?:string, detail?:object}} fact
 */
export function remember(fact) {
  if (!fact?.customerId || !fact?.actionType) {
    throw new Error('memoryService.remember requires customerId and actionType');
  }
  store.insert({ id: uuidv4(), ...fact });
}

/**
 * Retrieve raw memory facts matching filters (bounded, most recent first).
 * @param {{customerId?:string, failureCategory?:string, actionType?:string, outcome?:string, limit?:number}} filters
 */
export function retrieve(filters = {}) {
  return store.query(filters);
}

/**
 * Record the outcome of an executed recovery action — the primary write
 * path used by the agent's update_memory node.
 */
export function recordOutcome({ customerId, caseId, failureCategory, actionType, success, discountPercent, channel, detail }) {
  remember({
    customerId,
    caseId,
    failureCategory: failureCategory || 'unknown',
    actionType,
    outcome: success ? 'success' : 'failure',
    discountPercent,
    channel,
    detail,
  });
}

/** Bounded recent history for one customer — used to personalize decisions. */
export function getCustomerHistory(customerId, limit = 10) {
  return retrieve({ customerId, limit });
}

/** Which action types have historically worked best for a failure category, system-wide. */
export function getSuccessfulStrategies(failureCategory, limit = 5) {
  return store.aggregateStrategyEffectiveness(failureCategory, limit).filter((s) => s.successes > 0);
}

/**
 * Combine customer-specific history with category-wide strategy
 * effectiveness into one small, decision-ready summary. This is the shape
 * fed into `retrieve_memory` -> `decide_recovery_action`.
 */
export function getRelevantRecoveryPatterns(customerId, failureCategory) {
  const customerHistory = getCustomerHistory(customerId, 5);
  const categoryStrategies = getSuccessfulStrategies(failureCategory, 5);

  const channelCounts = {};
  for (const entry of customerHistory) {
    if (entry.channel) channelCounts[entry.channel] = (channelCounts[entry.channel] || 0) + 1;
  }
  const preferredChannel = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const priorAttemptsThisCategory = customerHistory.filter((e) => e.failure_category === failureCategory);
  const priorFailedActions = [...new Set(priorAttemptsThisCategory.filter((e) => e.outcome === 'failure').map((e) => e.action_type))];
  const priorSuccessfulActions = [...new Set(priorAttemptsThisCategory.filter((e) => e.outcome === 'success').map((e) => e.action_type))];

  return {
    customerId,
    failureCategory,
    preferredChannel,
    priorFailedActions,
    priorSuccessfulActions,
    topStrategiesForCategory: categoryStrategies.map((s) => ({ action: s.actionType, successRate: Math.round(s.successRate * 100) })),
    sampleSize: customerHistory.length,
  };
}
