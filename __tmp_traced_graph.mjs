import { getDb } from './src/lib/db/database.js';
getDb();
console.log('DATABASE_URL set:', Boolean(process.env.DATABASE_URL));

import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentState, buildInitialState } from './src/lib/agent/state.js';
import { getCheckpointer } from './src/lib/agent/checkpointer.js';
import { normalizePaymentEvent } from './src/lib/agent/eventNormalizer.js';

import { detectEvent } from './src/lib/agent/nodes/detectEvent.js';
import { loadCustomerContext } from './src/lib/agent/nodes/loadCustomerContext.js';
import { analyzeFailure } from './src/lib/agent/nodes/analyzeFailure.js';
import { calculateRisk } from './src/lib/agent/nodes/calculateRisk.js';
import { retrieveMemory } from './src/lib/agent/nodes/retrieveMemory.js';
import { decideRecoveryAction } from './src/lib/agent/nodes/decideRecoveryAction.js';
import { policyGate, routePolicyGate } from './src/lib/agent/nodes/policyGate.js';
import { policyDenied } from './src/lib/agent/nodes/policyDenied.js';
import { executeAction } from './src/lib/agent/nodes/executeAction.js';
import { observeOutcome } from './src/lib/agent/nodes/observeOutcome.js';
import { updateMemory } from './src/lib/agent/nodes/updateMemory.js';
import { evaluateOutcome, routeEvaluateOutcome } from './src/lib/agent/nodes/evaluateOutcome.js';
import { randomUUID } from 'crypto';

function traced(name, fn) {
  return async (state) => {
    console.log(`  [${name}] START`);
    const t0 = Date.now();
    try {
      const result = await fn(state);
      console.log(`  [${name}] DONE in ${Date.now() - t0}ms`);
      return result;
    } catch (err) {
      console.log(`  [${name}] FAILED after ${Date.now() - t0}ms:`, err.message);
      throw err;
    }
  };
}

const graph = new StateGraph(AgentState)
  .addNode('detect_event', traced('detect_event', detectEvent))
  .addNode('load_customer_context', traced('load_customer_context', loadCustomerContext))
  .addNode('analyze_failure', traced('analyze_failure', analyzeFailure))
  .addNode('calculate_risk', traced('calculate_risk', calculateRisk))
  .addNode('retrieve_memory', traced('retrieve_memory', retrieveMemory))
  .addNode('decide_recovery_action', traced('decide_recovery_action', decideRecoveryAction))
  .addNode('policy_gate', traced('policy_gate', policyGate))
  .addNode('policy_denied', traced('policy_denied', policyDenied))
  .addNode('execute_action', traced('execute_action', executeAction))
  .addNode('observe_outcome', traced('observe_outcome', observeOutcome))
  .addNode('update_memory', traced('update_memory', updateMemory))
  .addNode('evaluate_outcome', traced('evaluate_outcome', evaluateOutcome))
  .addEdge(START, 'detect_event')
  .addEdge('detect_event', 'load_customer_context')
  .addEdge('load_customer_context', 'analyze_failure')
  .addEdge('analyze_failure', 'calculate_risk')
  .addEdge('calculate_risk', 'retrieve_memory')
  .addEdge('retrieve_memory', 'decide_recovery_action')
  .addEdge('decide_recovery_action', 'policy_gate')
  .addConditionalEdges('policy_gate', routePolicyGate, { ALLOW: 'execute_action', DENY: 'policy_denied' })
  .addEdge('policy_denied', 'update_memory')
  .addEdge('execute_action', 'observe_outcome')
  .addEdge('observe_outcome', 'update_memory')
  .addEdge('update_memory', 'evaluate_outcome')
  .addConditionalEdges('evaluate_outcome', routeEvaluateOutcome, { continue: 'decide_recovery_action', end: END });

const checkpointer = await getCheckpointer();
const compiled = graph.compile({ checkpointer });

const db = getDb();
const customerId = `verify_pg_traced_${randomUUID()}`;
await db.prepare(`INSERT INTO customers (id, name, email, plan, mrr, lifetime_value, payment_method, risk_score, total_payments, successful_payments, failed_payments, discount_affinity, avg_order_value, opted_out, intervention_count, created_at, updated_at) VALUES (?, 'PG Verify', ?, 'growth', 20000, 300000, 'card', 0.3, 12, 10, 0, 0.5, 20000, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(customerId, `${customerId}@example.com`);
const paymentId = randomUUID();
await db.prepare(`INSERT INTO payments (id, customer_id, amount, currency, status, method, failure_reason, failure_source, attempted_at, created_at) VALUES (?, ?, 200000, 'INR', 'failed', 'card', 'authentication_failed', 'pg_verify', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(paymentId, customerId);

const event = normalizePaymentEvent(await db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId), 'system');
const threadId = `case_${paymentId}`;
const initialState = buildInitialState(event, { threadId, llmEnabled: false });

console.log('\n=== Invoking traced graph ===');
const t0 = Date.now();
const finalState = await compiled.invoke(initialState, { configurable: { thread_id: threadId }, recursionLimit: 50 });
console.log(`\n=== TOTAL: ${Date.now() - t0}ms ===`);
console.log('outcome:', finalState.outcome, 'action:', finalState.selected_action);

await db.prepare(`DELETE FROM recovery_actions WHERE case_id IN (SELECT id FROM recovery_cases WHERE customer_id = ?)`).run(customerId);
await db.prepare(`DELETE FROM audit_log WHERE entity_id IN (SELECT id FROM recovery_cases WHERE customer_id = ?)`).run(customerId);
await db.prepare(`DELETE FROM recovery_cases WHERE customer_id = ?`).run(customerId);
await db.prepare(`DELETE FROM payments WHERE customer_id = ?`).run(customerId);
await db.prepare(`DELETE FROM agent_memory WHERE customer_id = ?`).run(customerId);
await db.prepare(`DELETE FROM customers WHERE id = ?`).run(customerId);

process.exit(0);
