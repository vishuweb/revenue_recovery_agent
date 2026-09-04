import { v4 as uuidv4 } from 'uuid';
import * as sqliteStore from './sqliteMemory.js';
import * as pgStore from './pgMemory.js';

/**
 * MemoryService — the agent's long-term memory.
 *
 * This is deliberately separate from LangGraph's checkpoint saver
 * (lib/agent/checkpointer.js), which only persists in-flight graph state
 * for resuming a single run. MemoryService persists durable, structured
 * facts *across* runs and *across* cases for the same customer: which
 * strategies worked, which didn't, and what channel they respond to.
 *
 * It is also separate from the business database's own tables (customers/
 * payments/recovery_cases remain the source of truth there) — this only
 * stores derived recovery-strategy signal, never a duplicate of business
 * records — even when, in production, it physically lives in the same
 * Postgres instance (see pgMemory.js).
 *
 * Storage is pluggable and chosen once per process: pgMemory.js (backed by
 * the `agent_memory` table in the same Postgres database as the business
 * data — see schema.pg.js) whenever DATABASE_URL is set, so this survives
 * serverless production correctly; sqliteMemory.js (a standalone local
 * file) otherwise. Every exported function here is async so either
 * backend can be awaited identically.
 *
 * Chosen lazily (per call, not once at module load) — mirroring
 * lib/db/database.js's own getDb() pattern — since DATABASE_URL may not
 * yet be loaded from .env.local at the moment this module is first
 * imported, depending on import order elsewhere in the app.
 */
function getStore() {
  return process.env.DATABASE_URL ? pgStore : sqliteStore;
}

/**
 * Remember a structured fact about a recovery attempt.
 * @param {{customerId:string, caseId?:string, failureCategory:string, actionType:string, outcome:'success'|'failure'|'unknown', discountPercent?:number, channel?:string, detail?:object}} fact
 */
export async function remember(fact) {
  if (!fact?.customerId || !fact?.actionType) {
    throw new Error('memoryService.remember requires customerId and actionType');
  }
  await getStore().insert({ id: uuidv4(), ...fact });
}

/**
 * Retrieve raw memory facts matching filters (bounded, most recent first).
 * @param {{customerId?:string, failureCategory?:string, actionType?:string, outcome?:string, limit?:number}} filters
 */
export async function retrieve(filters = {}) {
  return getStore().query(filters);
}

/**
 * Record the outcome of an executed recovery action — the primary write
 * path used by the agent's update_memory node.
 */
export async function recordOutcome({ customerId, caseId, failureCategory, actionType, success, discountPercent, channel, detail }) {
  await remember({
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
export async function getCustomerHistory(customerId, limit = 10) {
  return retrieve({ customerId, limit });
}

/** Which action types have historically worked best for a failure category, system-wide. */
export async function getSuccessfulStrategies(failureCategory, limit = 5) {
  const rows = await getStore().aggregateStrategyEffectiveness(failureCategory, limit);
  return rows.filter((s) => s.successes > 0);
}

/**
 * Combine customer-specific history with category-wide strategy
 * effectiveness into one small, decision-ready summary. This is the shape
 * fed into `retrieve_memory` -> `decide_recovery_action`.
 */
export async function getRelevantRecoveryPatterns(customerId, failureCategory) {
  const [customerHistory, categoryStrategies] = await Promise.all([
    getCustomerHistory(customerId, 5),
    getSuccessfulStrategies(failureCategory, 5),
  ]);

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
