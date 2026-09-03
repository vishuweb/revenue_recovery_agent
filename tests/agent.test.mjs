import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';

import { resetDatabase, getDb } from '../src/lib/db/database.js';
import { generateSimulationData } from '../src/lib/simulation/generator.js';

import { getStructuredCompletion } from '../src/lib/agent/llm/provider.js';
import { ActionRecommendationSchema, FailureAnalysisSchema, safeParseStructured } from '../src/lib/agent/schemas.js';
import { normalizePaymentEvent } from '../src/lib/agent/eventNormalizer.js';
import { buildInitialState } from '../src/lib/agent/state.js';

import { analyzeFailure } from '../src/lib/agent/nodes/analyzeFailure.js';
import { calculateRisk } from '../src/lib/agent/nodes/calculateRisk.js';
import { decideRecoveryAction } from '../src/lib/agent/nodes/decideRecoveryAction.js';
import { policyGate, routePolicyGate } from '../src/lib/agent/nodes/policyGate.js';
import { evaluateOutcome, routeEvaluateOutcome } from '../src/lib/agent/nodes/evaluateOutcome.js';

import { evaluatePolicy, classifyDenial } from '../src/lib/policy/policyEngine.js';
import * as memoryService from '../src/lib/memory/memoryService.js';

import { runRecoveryAgent } from '../src/lib/agent/graph.js';

// Force every LLM call in this test run to fail fast (unreachable host) so
// tests are deterministic and never depend on a real Ollama instance being
// available. This also exercises the "Ollama unavailable" fallback path.
process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';

describe('LangGraph Recovery Agent', () => {
  before(async () => {
    await resetDatabase();
    await generateSimulationData();
  });

  test('1. Event normalization produces a consistent shape from a payments row', () => {
    const event = normalizePaymentEvent({ id: 'pay_1', customer_id: 'cust_1', amount: 1000, status: 'failed', failure_reason: 'card_declined' }, 'simulator');
    assert.equal(event.eventType, 'payment.failed');
    assert.equal(event.paymentId, 'pay_1');
    assert.equal(event.amount, 1000);
    assert.equal(event.source, 'simulator');
  });

  test('2. Structured LLM output: valid JSON is accepted', async () => {
    const fakeClient = { invoke: async () => ({ content: '{"recommendedAction":"retry","reasoning":"looks temporary","confidence":0.8}' }) };
    const result = await getStructuredCompletion({
      systemPrompt: 'x', userPrompt: 'y', schema: ActionRecommendationSchema, client: fakeClient,
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.recommendedAction, 'retry');
  });

  test('3. Structured LLM output: malformed JSON is rejected, never thrown', async () => {
    const fakeClient = { invoke: async () => ({ content: 'I cannot help with that, sorry!' }) };
    const result = await getStructuredCompletion({
      systemPrompt: 'x', userPrompt: 'y', schema: ActionRecommendationSchema, client: fakeClient,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /invalid_llm_output/);
  });

  test('4. Structured LLM output: an out-of-catalog action is rejected by schema validation', () => {
    const parsed = safeParseStructured(ActionRecommendationSchema, '{"recommendedAction":"wire_transfer_all_funds","reasoning":"x","confidence":0.9}');
    assert.equal(parsed.ok, false);
  });

  test('5. Structured LLM output: unreachable Ollama host fails fast and safely (no throw)', async () => {
    const result = await getStructuredCompletion({ systemPrompt: 'x', userPrompt: 'y', schema: FailureAnalysisSchema });
    assert.equal(result.ok, false);
    assert.match(result.reason, /llm_unavailable/);
  });

  test('6. analyze_failure falls back to deterministic classification when the LLM is unavailable', async () => {
    const state = { failure_reason: 'card_expired', payment: null, customer: { plan: 'starter' } };
    const update = await analyzeFailure(state);
    assert.equal(update.failure_category, 'permanent');
    assert.equal(update.is_retryable, false);
    assert.equal(update.llm_used, false);
    assert.ok(update.failure_explanation);
  });

  test('7. calculate_risk produces a bounded probability and a priority tier', async () => {
    const state = {
      failure_reason: 'insufficient_funds', payment: null,
      customer: { lifetime_value: 200000, total_payments: 10, successful_payments: 9 },
      amount_at_risk: 50000, customer_value: 200000, attempt_count: 0, max_attempts: 5,
      timestamps: { startedAt: new Date().toISOString() },
    };
    const update = await calculateRisk(state);
    assert.ok(update.recovery_probability >= 0 && update.recovery_probability <= 1);
    assert.ok(['low', 'medium', 'high', 'critical'].includes(update.priority_tier));
  });

  test('8. decide_recovery_action only ever selects an action present in the deterministic candidate list', async () => {
    const state = {
      failure_reason: 'insufficient_funds', payment: null,
      customer: { plan: 'starter', lifetime_value: 100000, discount_affinity: 0.5, opted_out: 0 },
      amount_at_risk: 50000, attempt_count: 0, max_attempts: 5,
      recovery_probability: 0.7, risk_score: 40, priority_tier: 'medium',
      retrieved_memory: { preferredChannel: null, priorSuccessfulActions: [], priorFailedActions: [], topStrategiesForCategory: [] },
    };
    const update = await decideRecoveryAction(state);
    const candidateNames = update.candidate_actions.map((c) => c.action);
    assert.ok(candidateNames.includes(update.selected_action), 'selected action must come from the computed candidate list');
    assert.equal(update.llm_used, false, 'LLM is unreachable in this test run, so it must not have been used');
  });

  test('9. policy_gate denies retries beyond the maximum attempt count', async () => {
    const state = {
      caseId: null, customerId: 'cust_x', selected_action: 'retry',
      amount_at_risk: 10000, attempt_count: 5, action_params: {},
      customer: null, timestamps: {},
    };
    // simulate 5 prior retries via evaluatePolicy directly (policyGate reads history from DB by caseId, which is null here)
    const result = evaluatePolicy({ attempts_made: 5, amount_at_risk: 10000, status: 'open' }, 'retry', []);
    assert.equal(result.allowed, false);
    assert.match(result.violations.join(';'), /MAX_RETRY_ATTEMPTS/);

    const { disposition } = classifyDenial(result.violations, 10000);
    assert.equal(disposition, 'STOPPED');
  });

  test('10. policy_gate escalates (rather than silently stops) high-value denials', () => {
    const { disposition } = classifyDenial(['SOME_SOFT_VIOLATION: unrelated'], 6000000); // > APPROVAL_THRESHOLD_PAISE
    assert.equal(disposition, 'ESCALATE');
  });

  test('11. policy_gate node itself correctly routes ALLOW vs DENY', async () => {
    const allowState = { caseId: null, customerId: null, selected_action: 'email', amount_at_risk: 1000, attempt_count: 0, action_params: {}, customer: { opted_out: 0 }, timestamps: {} };
    const allowUpdate = await policyGate(allowState);
    assert.equal(routePolicyGate({ policy_result: allowUpdate.policy_result }), 'ALLOW');

    const denyState = { caseId: null, customerId: null, selected_action: 'email', amount_at_risk: 1000, attempt_count: 0, action_params: {}, customer: { opted_out: 1 }, timestamps: {} };
    const denyUpdate = await policyGate(denyState);
    assert.equal(routePolicyGate({ policy_result: denyUpdate.policy_result }), 'DENY');
  });

  test('12. evaluate_outcome stops immediately on RECOVERED / ESCALATE, never loops', async () => {
    const recovered = await evaluateOutcome({ outcome: 'RECOVERED', attempt_count: 0, iteration_count: 0, max_attempts: 5, max_iterations: 6 });
    assert.equal(routeEvaluateOutcome(recovered), 'end');
    assert.equal(recovered.stop_reason, 'recovered');

    const escalated = await evaluateOutcome({ outcome: 'ESCALATE', attempt_count: 0, iteration_count: 0, max_attempts: 5, max_iterations: 6 });
    assert.equal(routeEvaluateOutcome(escalated), 'end');
  });

  test('13. evaluate_outcome continues on RETRYABLE while under both bounds', async () => {
    const update = await evaluateOutcome({ outcome: 'RETRYABLE', attempt_count: 1, iteration_count: 1, max_attempts: 5, max_iterations: 6, is_retryable: true });
    assert.equal(routeEvaluateOutcome(update), 'continue');
    assert.equal(update.stop_reason, null);
  });

  test('14. evaluate_outcome enforces the max_attempts stopping rule — never loops forever', async () => {
    const update = await evaluateOutcome({ outcome: 'RETRYABLE', attempt_count: 4, iteration_count: 1, max_attempts: 5, max_iterations: 6 });
    assert.equal(routeEvaluateOutcome(update), 'end');
    assert.equal(update.stop_reason, 'max_attempts_reached');
  });

  test('15. evaluate_outcome enforces the max_iterations graph safety cap independently of max_attempts', async () => {
    const update = await evaluateOutcome({ outcome: 'RETRYABLE', attempt_count: 0, iteration_count: 5, max_attempts: 50, max_iterations: 6 });
    assert.equal(routeEvaluateOutcome(update), 'end');
    assert.equal(update.stop_reason, 'max_graph_iterations_reached');
  });

  test('16. evaluate_outcome stops FAILED (non-retryable, no attempts left)', async () => {
    const update = await evaluateOutcome({ outcome: 'FAILED', attempt_count: 4, iteration_count: 1, max_attempts: 5, max_iterations: 6 });
    assert.equal(routeEvaluateOutcome(update), 'end');
    assert.equal(update.stop_reason, 'recovery_failed_not_retryable');
  });

  test('17. MemoryService: remember/retrieve/recordOutcome/getCustomerHistory round-trip', () => {
    const customerId = `test_cust_${uuidv4().slice(0, 8)}`;
    memoryService.recordOutcome({ customerId, failureCategory: 'temporary', actionType: 'retry', success: true });
    memoryService.recordOutcome({ customerId, failureCategory: 'temporary', actionType: 'email', success: false });

    const history = memoryService.getCustomerHistory(customerId);
    assert.equal(history.length, 2);

    const retrieved = memoryService.retrieve({ customerId, outcome: 'success' });
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].action_type, 'retry');
  });

  test('18. MemoryService: getSuccessfulStrategies aggregates across customers by failure category', () => {
    const category = `test_category_${uuidv4().slice(0, 8)}`;
    for (let i = 0; i < 3; i++) {
      memoryService.recordOutcome({ customerId: `c${i}_${uuidv4().slice(0, 6)}`, failureCategory: category, actionType: 'discount', success: true });
    }
    memoryService.recordOutcome({ customerId: `c9_${uuidv4().slice(0, 6)}`, failureCategory: category, actionType: 'email', success: false });

    const strategies = memoryService.getSuccessfulStrategies(category);
    assert.equal(strategies[0].actionType, 'discount');
    assert.equal(strategies[0].successRate, 1);
  });

  test('19. MemoryService: getRelevantRecoveryPatterns returns a small, decision-ready summary', () => {
    const customerId = `test_pattern_cust_${uuidv4().slice(0, 8)}`;
    memoryService.recordOutcome({ customerId, failureCategory: 'abandonment', actionType: 'discount', success: true, channel: 'email' });

    const patterns = memoryService.getRelevantRecoveryPatterns(customerId, 'abandonment');
    assert.equal(patterns.customerId, customerId);
    assert.ok(patterns.priorSuccessfulActions.includes('discount'));
    assert.ok(Array.isArray(patterns.topStrategiesForCategory));
  });

  test('20. Idempotency: running the agent twice for the same payment does not create a second case', async () => {
    const db = getDb();
    const customer = await db.prepare('SELECT * FROM customers LIMIT 1').get();
    const paymentId = uuidv4();
    await db.prepare(`
      INSERT INTO payments (id, customer_id, amount, currency, status, method, failure_reason, failure_source, attempted_at, created_at)
      VALUES (?, ?, 20000, 'INR', 'failed', 'card', 'card_declined', 'test', datetime('now'), datetime('now'))
    `).run(paymentId, customer.id);

    const first = await runRecoveryAgent(paymentId);
    assert.ok(first.caseId);
    assert.notEqual(first.skipped, true);

    const second = await runRecoveryAgent(paymentId);
    assert.equal(second.skipped, true);
    assert.equal(second.caseId, first.caseId);

    const caseCount = await db.prepare('SELECT COUNT(*) as count FROM recovery_cases WHERE payment_id = ?').get(paymentId);
    assert.equal(caseCount.count, 1);
  });

  test('21. End-to-end: a permanent, low-value failure is deterministically STOPPED via no_action', async () => {
    const db = getDb();
    const customer = await db.prepare(`
      SELECT * FROM customers WHERE opted_out = 0 ORDER BY lifetime_value ASC LIMIT 1
    `).get();
    const paymentId = uuidv4();
    await db.prepare(`
      INSERT INTO payments (id, customer_id, amount, currency, status, method, failure_reason, failure_source, attempted_at, created_at)
      VALUES (?, ?, 500, 'INR', 'failed', 'card', 'account_closed', 'test', datetime('now'), datetime('now'))
    `).run(paymentId, customer.id);

    const result = await runRecoveryAgent(paymentId);
    assert.equal(result.decision.action, 'no_action');
    assert.equal(result.decision.outcome, 'STOPPED');

    const caseRow = await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(result.caseId);
    assert.equal(caseRow.status, 'stopped');

    // Audit trail must show every stage of the loop, with the agent as actor.
    const audit = await db.prepare(`SELECT event_type FROM audit_log WHERE entity_id = ? AND actor = 'agent' ORDER BY created_at ASC`).all(result.caseId);
    const phases = audit.map((a) => a.event_type);
    assert.ok(phases.includes('decision.event_received'));
    assert.ok(phases.includes('decision.classified'));
    assert.ok(phases.includes('decision.action_selected'));
    assert.ok(phases.includes('decision.agent_stopped'));

    // update_memory must have written a fact for this customer + category.
    const memory = memoryService.getCustomerHistory(customer.id, 5);
    assert.ok(memory.some((m) => m.action_type === 'no_action'));
  });

  test('22. End-to-end: a high-value case is deterministically ESCALATEd, never auto-executed', async () => {
    const db = getDb();
    const customer = await db.prepare('SELECT * FROM customers LIMIT 1').get();
    const paymentId = uuidv4();
    await db.prepare(`
      INSERT INTO payments (id, customer_id, amount, currency, status, method, failure_reason, failure_source, attempted_at, created_at)
      VALUES (?, ?, 6000000, 'INR', 'failed', 'card', 'gateway_error', 'test', datetime('now'), datetime('now'))
    `).run(paymentId, customer.id);

    const result = await runRecoveryAgent(paymentId);
    assert.equal(result.decision.outcome, 'ESCALATE');
    assert.equal(result.decision.stopReason, 'escalated_pending_human_approval');

    // The case must remain open (awaiting a human), and no money-moving
    // action must have been marked completed.
    const caseRow = await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(result.caseId);
    assert.notEqual(caseRow.status, 'recovered');
    const action = await db.prepare('SELECT * FROM recovery_actions WHERE case_id = ?').get(result.caseId);
    assert.equal(action.status, 'pending');
    assert.equal(action.approved_by, null);
  });

  test('23. Graph branching: outcome is always one of the five defined terminal states', async () => {
    const db = getDb();
    const customers = await db.prepare('SELECT * FROM customers LIMIT 5').all();
    const validOutcomes = ['RECOVERED', 'RETRYABLE', 'FAILED', 'ESCALATE', 'STOPPED'];

    for (const customer of customers) {
      const paymentId = uuidv4();
      await db.prepare(`
        INSERT INTO payments (id, customer_id, amount, currency, status, method, failure_reason, failure_source, attempted_at, created_at)
        VALUES (?, ?, ?, 'INR', 'failed', 'card', 'insufficient_funds', 'test', datetime('now'), datetime('now'))
      `).run(paymentId, customer.id, 10000 + Math.floor(Math.random() * 40000));

      const result = await runRecoveryAgent(paymentId);
      assert.ok(validOutcomes.includes(result.decision.outcome), `unexpected outcome: ${result.decision.outcome}`);
    }
  });
});
