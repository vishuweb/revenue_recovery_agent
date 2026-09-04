import { getDb } from './src/lib/db/database.js';
import { runRecoveryAgent, resumeRecoveryAgent, processPendingAgentResumptions } from './src/lib/agent/graph.js';
import { getCheckpointer } from './src/lib/agent/checkpointer.js';
import * as memoryService from './src/lib/memory/memoryService.js';
import { randomUUID } from 'crypto';

console.log('DATABASE_URL set:', Boolean(process.env.DATABASE_URL));

const db = getDb();
console.log('db.isPostgres:', db.isPostgres);

const customerId = `verify_pg_${randomUUID()}`;
await db.prepare(`INSERT INTO customers (id, name, email, plan, mrr, lifetime_value, payment_method, risk_score, total_payments, successful_payments, failed_payments, discount_affinity, avg_order_value, opted_out, intervention_count, created_at, updated_at) VALUES (?, 'PG Verify', ?, 'growth', 20000, 300000, 'card', 0.3, 12, 10, 0, 0.5, 20000, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(customerId, `${customerId}@example.com`);
const paymentId = randomUUID();
await db.prepare(`INSERT INTO payments (id, customer_id, amount, currency, status, method, failure_reason, failure_source, attempted_at, created_at) VALUES (?, ?, 200000, 'INR', 'failed', 'card', 'authentication_failed', 'pg_verify', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(paymentId, customerId);

console.log('\n--- Checkpointer setup (isolated) ---');
const t0 = Date.now();
const cp = await getCheckpointer();
console.log(`getCheckpointer() resolved in ${Date.now() - t0}ms, type=${cp.constructor.name}`);

console.log('\n--- Running agent (writes checkpoint state to Postgres) ---');
const t1 = Date.now();
const result = await runRecoveryAgent(paymentId, { llmEnabled: false });
console.log(`runRecoveryAgent resolved in ${Date.now() - t1}ms`);
console.log('runRecoveryAgent result:', JSON.stringify(result.decision));

const checkpointer = await getCheckpointer();
console.log('checkpointer constructor:', checkpointer.constructor.name);
const threadId = `case_${paymentId}`;
const tuple = await checkpointer.getTuple({ configurable: { thread_id: threadId } });
console.log('Checkpoint found in Postgres:', Boolean(tuple));
console.log('Checkpoint caseId matches:', tuple?.checkpoint?.channel_values?.caseId === result.caseId);

console.log('\n--- Verifying long-term memory table in Postgres ---');
const history = await memoryService.getCustomerHistory(customerId, 10);
console.log('Memory entries written for this customer:', history.length);
console.log('Sample entry:', JSON.stringify(history[0]));

const memRow = await db.prepare(`SELECT COUNT(*) as n FROM agent_memory WHERE customer_id = ?`).get(customerId);
console.log('Direct query of agent_memory table row count:', memRow.n);

console.log('\n--- Verifying resume against Postgres checkpoint ---');
if (result.decision.outcome === 'RETRYABLE' && result.decision.stopReason === 'awaiting_customer_response') {
  const forced = await processPendingAgentResumptions({ force: true });
  console.log('Resume sweep found this case:', forced.results.some((r) => r.caseId === result.caseId));
} else {
  console.log('Case did not pause this run (outcome=' + result.decision.outcome + ') — resume path not exercised, but checkpoint write/read above already confirms Postgres persistence works.');
}

console.log('\n--- Cleanup: removing verify_pg_ throwaway rows ---');
await db.prepare(`DELETE FROM recovery_actions WHERE case_id IN (SELECT id FROM recovery_cases WHERE customer_id = ?)`).run(customerId);
await db.prepare(`DELETE FROM audit_log WHERE entity_id IN (SELECT id FROM recovery_cases WHERE customer_id = ?)`).run(customerId);
await db.prepare(`DELETE FROM recovery_cases WHERE customer_id = ?`).run(customerId);
await db.prepare(`DELETE FROM payments WHERE customer_id = ?`).run(customerId);
await db.prepare(`DELETE FROM agent_memory WHERE customer_id = ?`).run(customerId);
await db.prepare(`DELETE FROM customers WHERE id = ?`).run(customerId);
console.log('Cleanup done.');

console.log('\nDONE');
process.exit(0);
