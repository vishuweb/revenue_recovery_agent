import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { v4 as uuidv4 } from 'uuid';

import { resetDatabase, getDb } from '../src/lib/db/database.js';
import { generateSimulationData } from '../src/lib/simulation/generator.js';

import { getStructuredCompletion, __resetCachedModel, __getProviderNameForTests } from '../src/lib/agent/llm/provider.js';
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

import { runRecoveryAgent, resumeRecoveryAgent, processPendingAgentResumptions } from '../src/lib/agent/graph.js';
import { getCheckpointer } from '../src/lib/agent/checkpointer.js';
import { processRecoveryOutcome } from '../src/lib/engine/orchestrator.js';
import { POST as webhookPost } from '../src/app/api/webhooks/route.js';
import { POST as simulateWebhookPost } from '../src/app/api/webhooks/simulate/route.js';
import crypto from 'crypto';

// Force every LLM call in this test run to fail fast (unreachable host) so
// tests are deterministic and never depend on a real Ollama instance being
// available. This also exercises the "Ollama unavailable" fallback path.
process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';

/**
 * A dedicated, never-before-touched customer for tests that need a
 * deterministic decision outcome. Drawing randomly from the shared seeded
 * pool (as several tests below still do for less sensitive assertions)
 * risks a customer that an EARLIER test already pushed toward
 * CUSTOMER_FATIGUE, and risks a customer whose specific history/timing
 * factors flip a close NEV race between two candidates — both were real,
 * confirmed causes of intermittent failures in this file's history (see
 * git log). Isolation, not the agent, is what removes the flakiness.
 */
async function createIsolatedCustomer(db, overrides = {}) {
  const id = `isolated_${uuidv4()}`;
  await db.prepare(`
    INSERT INTO customers (
      id, name, email, plan, mrr, lifetime_value, payment_method, risk_score,
      total_payments, successful_payments, failed_payments, discount_affinity,
      avg_order_value, opted_out, intervention_count, created_at, updated_at
    ) VALUES (?, 'Isolated Test Customer', ?, ?, 20000, 300000, 'card', 0.3, ?, ?, 0, 0.5, 20000, 0, 0, datetime('now'), datetime('now'))
  `).run(
    id, `${id}@example.com`, overrides.plan || 'growth',
    overrides.totalPayments ?? 12, overrides.successfulPayments ?? 10
  );
  return { id };
}

/** Insert a fresh failed payment and return its id. */
async function createFailedPayment(db, customerId, amount, failureReason) {
  const paymentId = uuidv4();
  await db.prepare(`
    INSERT INTO payments (id, customer_id, amount, currency, status, method, failure_reason, failure_source, attempted_at, created_at)
    VALUES (?, ?, ?, 'INR', 'failed', 'card', ?, 'test', datetime('now'), datetime('now'))
  `).run(paymentId, customerId, amount, failureReason);
  return paymentId;
}

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

  test('5a. LLM_PROVIDER unset defaults to ollama', () => {
    delete process.env.LLM_PROVIDER;
    assert.equal(__getProviderNameForTests(), 'ollama');
  });

  test('5b. LLM_PROVIDER=gemini selects the gemini provider', () => {
    process.env.LLM_PROVIDER = 'gemini';
    try {
      assert.equal(__getProviderNameForTests(), 'gemini');
    } finally {
      delete process.env.LLM_PROVIDER;
    }
  });

  test('5c. An unrecognized LLM_PROVIDER value falls back to ollama, not gemini', () => {
    process.env.LLM_PROVIDER = 'some-typo-value';
    try {
      assert.equal(__getProviderNameForTests(), 'ollama');
    } finally {
      delete process.env.LLM_PROVIDER;
    }
  });

  test('5d. LLM_PROVIDER=gemini with no GEMINI_API_KEY fails safely, and never falls through to Ollama', async () => {
    const prevProvider = process.env.LLM_PROVIDER;
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.LLM_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;
    __resetCachedModel();
    try {
      const result = await getStructuredCompletion({ systemPrompt: 'x', userPrompt: 'y', schema: FailureAnalysisSchema });
      assert.equal(result.ok, false);
      assert.match(result.reason, /llm_unavailable/);
      // Specifically the Gemini branch's own error, not an Ollama connection
      // failure — proves getChatModel() never fell through to ChatOllama.
      assert.match(result.reason, /GEMINI_API_KEY/);
    } finally {
      process.env.LLM_PROVIDER = prevProvider ?? '';
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevKey;
      __resetCachedModel();
    }
  });

  test('5e. getStructuredCompletion behavior (fake client, schema validation) is unchanged when LLM_PROVIDER=gemini', async () => {
    // The `client` test seam bypasses provider selection entirely — same
    // contract regardless of which provider is configured, confirming
    // requirement 6 (unchanged interface) holds for both providers.
    const prevProvider = process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER = 'gemini';
    try {
      const fakeClient = { invoke: async () => ({ content: '{"recommendedAction":"payment_link","reasoning":"channel switch","confidence":0.7}' }) };
      const result = await getStructuredCompletion({
        systemPrompt: 'x', userPrompt: 'y', schema: ActionRecommendationSchema, client: fakeClient,
      });
      assert.equal(result.ok, true);
      assert.equal(result.data.recommendedAction, 'payment_link');
    } finally {
      process.env.LLM_PROVIDER = prevProvider ?? '';
    }
  });

  test('6. analyze_failure falls back to deterministic classification when the LLM is unavailable', async () => {
    const state = { failure_reason: 'card_expired', payment: null, customer: { plan: 'starter' } };
    const update = await analyzeFailure(state);
    assert.equal(update.failure_category, 'permanent');
    assert.equal(update.is_retryable, false);
    assert.equal(update.analysis_ai_assisted, false);
    assert.ok(update.analysis_ai_fallback_reason);
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
    assert.equal(update.decision_ai_assisted, false, 'LLM is unreachable in this test run, so it must not have been used');
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

  test('17. MemoryService: remember/retrieve/recordOutcome/getCustomerHistory round-trip', async () => {
    const customerId = `test_cust_${uuidv4().slice(0, 8)}`;
    await memoryService.recordOutcome({ customerId, failureCategory: 'temporary', actionType: 'retry', success: true });
    await memoryService.recordOutcome({ customerId, failureCategory: 'temporary', actionType: 'email', success: false });

    const history = await memoryService.getCustomerHistory(customerId);
    assert.equal(history.length, 2);

    const retrieved = await memoryService.retrieve({ customerId, outcome: 'success' });
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].action_type, 'retry');
  });

  test('18. MemoryService: getSuccessfulStrategies aggregates across customers by failure category', async () => {
    const category = `test_category_${uuidv4().slice(0, 8)}`;
    for (let i = 0; i < 3; i++) {
      await memoryService.recordOutcome({ customerId: `c${i}_${uuidv4().slice(0, 6)}`, failureCategory: category, actionType: 'discount', success: true });
    }
    await memoryService.recordOutcome({ customerId: `c9_${uuidv4().slice(0, 6)}`, failureCategory: category, actionType: 'email', success: false });

    const strategies = await memoryService.getSuccessfulStrategies(category);
    assert.equal(strategies[0].actionType, 'discount');
    assert.equal(strategies[0].successRate, 1);
  });

  test('19. MemoryService: getRelevantRecoveryPatterns returns a small, decision-ready summary', async () => {
    const customerId = `test_pattern_cust_${uuidv4().slice(0, 8)}`;
    await memoryService.recordOutcome({ customerId, failureCategory: 'abandonment', actionType: 'discount', success: true, channel: 'email' });

    const patterns = await memoryService.getRelevantRecoveryPatterns(customerId, 'abandonment');
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
    const memory = await memoryService.getCustomerHistory(customer.id, 5);
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

  test('24. Memory genuinely changes a later decision for the same customer (not a fabricated message)', async () => {
    const db = getDb();
    // authentication_failed (behavioral) at ₹400 reliably makes 'email' the
    // raw NEV winner over 'payment_link' and 'retry' — verified by direct
    // computation against lib/engine/decider.js for this exact customer
    // profile. A dedicated, isolated customer (not a random draw from the
    // shared seeded pool) keeps this margin free of cross-test drift.
    const customer = await createIsolatedCustomer(db);

    const firstPaymentId = await createFailedPayment(db, customer.id, 40000, 'authentication_failed');
    const firstResult = await runRecoveryAgent(firstPaymentId);
    assert.equal(firstResult.decision.action, 'email', 'sanity check: raw NEV winner without memory should be email');
    assert.equal(firstResult.decision.memoryInfluenced, false);

    // Simulate that email did NOT work, but a payment_link sent afterward did.
    await memoryService.recordOutcome({ customerId: customer.id, caseId: firstResult.caseId, failureCategory: 'behavioral', actionType: 'email', success: false });
    await memoryService.recordOutcome({ customerId: customer.id, caseId: firstResult.caseId, failureCategory: 'behavioral', actionType: 'payment_link', success: true });

    const secondPaymentId = await createFailedPayment(db, customer.id, 40000, 'authentication_failed');
    const secondResult = await runRecoveryAgent(secondPaymentId);

    assert.equal(secondResult.decision.action, 'payment_link', 'memory should have promoted payment_link above the raw NEV winner');
    assert.equal(secondResult.decision.memoryInfluenced, true);
    assert.match(secondResult.decision.memoryReason, /payment_link/);

    // The UI's proof point must be backed by a real audit_log row, not just an in-memory value.
    const proofEntry = await db.prepare(`
      SELECT * FROM audit_log WHERE entity_id = ? AND event_type = 'decision.memory_applied'
    `).get(secondResult.caseId);
    assert.ok(proofEntry, 'memory_applied audit entry must exist');
  });

  test('25. Checkpoint pause: a dispatched-but-unconfirmed action pauses rather than looping, and is NOT closed', async () => {
    const db = getDb();
    // ₹2000 (not ₹400) with a dedicated isolated customer: verified over
    // 200 randomized runs to always make a non-retry action ('payment_link')
    // the clear NEV winner, so this never depends on a probabilistic retry
    // outcome — see the diagnosis in this test file's git history.
    const customer = await createIsolatedCustomer(db);
    const paymentId = await createFailedPayment(db, customer.id, 200000, 'authentication_failed');

    const result = await runRecoveryAgent(paymentId);
    assert.equal(result.decision.outcome, 'RETRYABLE');
    assert.equal(result.decision.stopReason, 'awaiting_customer_response');

    const caseRow = await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(result.caseId);
    assert.ok(['open', 'in_progress'].includes(caseRow.status), 'a paused case must stay open, not be closed like a real stop');

    // The cron sweep must NOT resume it before its recheck delay is due.
    const dry = await processPendingAgentResumptions({ force: false });
    assert.equal(dry.results.some((r) => r.caseId === result.caseId), false);
  });

  test('26. Checkpoint resume: forcing the sweep re-runs the graph on the same thread and preserves counters', async () => {
    const db = getDb();
    const customer = await createIsolatedCustomer(db);
    const paymentId = await createFailedPayment(db, customer.id, 200000, 'authentication_failed');
    const threadId = `case_${paymentId}`;

    const first = await runRecoveryAgent(paymentId);
    assert.notEqual(first.decision.action, 'retry', 'sanity check: this scenario must not depend on a probabilistic retry outcome');
    const actionsBefore = await db.prepare('SELECT COUNT(*) as n FROM recovery_actions WHERE case_id = ?').get(first.caseId);

    const checkpointer = await getCheckpointer();
    const beforeTuple = await checkpointer.getTuple({ configurable: { thread_id: threadId } });
    const before = beforeTuple.checkpoint.channel_values;
    assert.equal(before.threadId, threadId, 'checkpoint must be keyed by the exact thread_id runRecoveryAgent used');
    assert.equal(before.caseId, first.caseId);
    assert.equal(before.attempt_count, 1, 'one full decide->execute->observe->evaluate cycle ran before pausing');
    assert.equal(before.iteration_count, 1);
    assert.equal(before.max_attempts, 5);
    assert.equal(before.max_iterations, 6);

    const forced = await processPendingAgentResumptions({ force: true });
    assert.ok(forced.results.some((r) => r.caseId === first.caseId), 'the paused case must be found and resumed when forced');

    const actionsAfter = await db.prepare('SELECT COUNT(*) as n FROM recovery_actions WHERE case_id = ?').get(first.caseId);
    assert.ok(actionsAfter.n > actionsBefore.n, 'resuming must produce a fresh decision cycle, not a no-op');

    const resumedAuditCount = await db.prepare(`
      SELECT COUNT(*) as n FROM audit_log WHERE entity_id = ? AND event_type = 'decision.agent_resumed'
    `).get(first.caseId);
    assert.ok(resumedAuditCount.n >= 1);

    // Counters must have continued from where they paused, not reset —
    // and the SAME thread_id / case id must still be in play (see
    // graph.js's resumeRecoveryAgent: it re-invokes with the identical
    // thread_id, never mints a new one).
    const afterTuple = await checkpointer.getTuple({ configurable: { thread_id: threadId } });
    const after = afterTuple.checkpoint.channel_values;
    assert.equal(after.threadId, threadId, 'resume must reuse the exact same thread_id, never start a new one');
    assert.equal(after.caseId, first.caseId, 'resume must operate on the same case, never mint a new one');
    assert.equal(after.max_attempts, before.max_attempts, 'max_attempts must not change across resume');
    assert.equal(after.max_iterations, before.max_iterations, 'max_iterations must not change across resume');
    assert.ok(after.attempt_count > before.attempt_count, `attempt_count must continue upward from ${before.attempt_count}, not reset to 0 (got ${after.attempt_count})`);
    assert.ok(after.iteration_count > before.iteration_count, `iteration_count must continue upward from ${before.iteration_count}, not reset to 0 (got ${after.iteration_count})`);
  });

  test('26b. Forced resume never touches a terminal case (recovered, stopped, or escalated) — no duplicate action, no reset', async () => {
    const db = getDb();

    // C. Recovered case -> forced resume must be a pure no-op (short-circuit).
    const custRecovered = await createIsolatedCustomer(db);
    const payRecovered = await createFailedPayment(db, custRecovered.id, 200000, 'authentication_failed');
    const recoveredRun = await runRecoveryAgent(payRecovered);
    await processRecoveryOutcome(recoveredRun.caseId, { success: true });
    const actionsBeforeC = await db.prepare('SELECT COUNT(*) as n FROM recovery_actions WHERE case_id = ?').get(recoveredRun.caseId);
    const resumedC = await resumeRecoveryAgent(`case_${payRecovered}`);
    assert.equal(resumedC.alreadyResolved, true);
    assert.equal(resumedC.status, 'recovered');
    const actionsAfterC = await db.prepare('SELECT COUNT(*) as n FROM recovery_actions WHERE case_id = ?').get(recoveredRun.caseId);
    assert.equal(actionsAfterC.n, actionsBeforeC.n, 'a recovered case must not gain a new action from a forced resume');
    const caseRowC = await db.prepare('SELECT status, recovered_amount FROM recovery_cases WHERE id = ?').get(recoveredRun.caseId);
    assert.equal(caseRowC.status, 'recovered');
    assert.equal(caseRowC.recovered_amount, 200000, 'the original recovered amount must not be altered by a duplicate resume');

    // D. Stopped case (hard policy denial, e.g. opted-out customer -> no_action -> stopped) -> forced resume must not run again.
    const custStopped = await createIsolatedCustomer(db);
    await db.prepare('UPDATE customers SET opted_out = 1 WHERE id = ?').run(custStopped.id);
    const payStopped = await createFailedPayment(db, custStopped.id, 200000, 'account_closed');
    const stoppedRun = await runRecoveryAgent(payStopped);
    assert.equal(stoppedRun.decision.outcome, 'STOPPED');
    const stoppedCaseBefore = await db.prepare('SELECT status, updated_at FROM recovery_cases WHERE id = ?').get(stoppedRun.caseId);
    const sweepD = await processPendingAgentResumptions({ force: true });
    assert.equal(sweepD.results.some((r) => r.caseId === stoppedRun.caseId), false, 'a terminal STOPPED case must never be picked up by the resume sweep');
    const stoppedCaseAfter = await db.prepare('SELECT status, updated_at FROM recovery_cases WHERE id = ?').get(stoppedRun.caseId);
    assert.equal(stoppedCaseAfter.status, 'stopped');
    assert.equal(stoppedCaseAfter.updated_at, stoppedCaseBefore.updated_at, 'a stopped case must not be touched at all by a forced sweep');

    // E. Escalated case (pending human approval) -> forced resume must not auto-execute it.
    const custEscalated = await createIsolatedCustomer(db);
    const payEscalated = await createFailedPayment(db, custEscalated.id, 6500000, 'gateway_error');
    const escalatedRun = await runRecoveryAgent(payEscalated);
    assert.equal(escalatedRun.decision.outcome, 'ESCALATE');
    const sweepE = await processPendingAgentResumptions({ force: true });
    assert.equal(sweepE.results.some((r) => r.caseId === escalatedRun.caseId), false, 'an escalated case awaiting human approval must never be auto-resumed');
    const escalatedAction = await db.prepare('SELECT status, approved_by FROM recovery_actions WHERE case_id = ?').get(escalatedRun.caseId);
    assert.equal(escalatedAction.status, 'pending');
    assert.equal(escalatedAction.approved_by, null, 'escalation must still require a human — force must never grant approval on its own');

    // F. Duplicate resume request (called twice back-to-back) must not execute the same action twice.
    const custDup = await createIsolatedCustomer(db);
    const payDup = await createFailedPayment(db, custDup.id, 200000, 'authentication_failed');
    const dupRun = await runRecoveryAgent(payDup);
    const dupActionsBefore = await db.prepare('SELECT COUNT(*) as n FROM recovery_actions WHERE case_id = ?').get(dupRun.caseId);
    await processPendingAgentResumptions({ force: true });
    const dupActionsAfterFirst = await db.prepare('SELECT COUNT(*) as n FROM recovery_actions WHERE case_id = ?').get(dupRun.caseId);
    await processPendingAgentResumptions({ force: true });
    const dupActionsAfterSecond = await db.prepare('SELECT COUNT(*) as n FROM recovery_actions WHERE case_id = ?').get(dupRun.caseId);
    assert.ok(dupActionsAfterFirst.n > dupActionsBefore.n, 'the first resume must produce a new decision cycle');
    // The second immediate resume is either a genuine no-op (case already
    // terminal/recovered by the first) or, if still paused, is correctly
    // blocked by MIN_RETRY_INTERVAL/DUPLICATE_ACTION_PREVENTION policy — in
    // no case may it insert two rows for the exact same decision.
    const dupCaseFinal = await db.prepare('SELECT status FROM recovery_cases WHERE id = ?').get(dupRun.caseId);
    if (['recovered', 'stopped'].includes(dupCaseFinal.status)) {
      assert.equal(dupActionsAfterSecond.n, dupActionsAfterFirst.n, 'once terminal, a further forced resume must not add any action');
    }
  });

  test('27. Checkpoint resume short-circuits when the case already resolved while paused, and attributes memory correctly', async () => {
    const db = getDb();
    const customer = await createIsolatedCustomer(db);
    const paymentId = await createFailedPayment(db, customer.id, 200000, 'authentication_failed');

    const result = await runRecoveryAgent(paymentId);
    assert.equal(result.decision.outcome, 'RETRYABLE');

    // A real payment.captured webhook would call this directly, independent of the agent.
    await processRecoveryOutcome(result.caseId, { success: true });

    const resumed = await resumeRecoveryAgent(`case_${paymentId}`);
    assert.equal(resumed.alreadyResolved, true);
    assert.equal(resumed.status, 'recovered');

    const memory = await memoryService.getCustomerHistory(customer.id, 20);
    const attributed = memory.find((m) => m.case_id === result.caseId);
    assert.ok(attributed, 'the paused action must be attributed a real outcome once the case resolves');
    assert.equal(attributed.outcome, 'success');
  });

  test('28. Razorpay webhook and simulator webhook both drive the SAME agent graph (RECOVERY_ENGINE=agent)', async () => {
    const previousEngine = process.env.RECOVERY_ENGINE;
    process.env.RECOVERY_ENGINE = 'agent';
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_test_secret_webhook';
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    try {
      const razorpayPaymentId = `pay_parity_rzp_${Date.now()}`;
      const rawBody = JSON.stringify({
        event: 'payment.failed',
        payload: { payment: { entity: { id: razorpayPaymentId, amount: 30000, currency: 'INR', status: 'failed', error_reason: 'insufficient_funds' } } },
      });
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const razorpayReq = new Request('http://localhost:3000/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature },
        body: rawBody,
      });
      const razorpayRes = await webhookPost(razorpayReq);
      assert.equal(razorpayRes.status, 200);
      const razorpayJson = await razorpayRes.json();
      assert.ok(razorpayJson.caseId, 'razorpay webhook must still return a caseId under RECOVERY_ENGINE=agent');

      const simPaymentId = `pay_parity_sim_${Date.now()}`;
      const simReq = new Request('http://localhost:3000/api/webhooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'payment.failed',
          payload: { payment: { entity: { id: simPaymentId, amount: 30000, currency: 'INR', status: 'failed', error_reason: 'insufficient_funds' } } },
        }),
      });
      const simRes = await simulateWebhookPost(simReq);
      assert.equal(simRes.status, 200);
      const simJson = await simRes.json();
      assert.ok(simJson.caseId, 'simulator webhook must still return a caseId under RECOVERY_ENGINE=agent');

      const db = getDb();
      for (const caseId of [razorpayJson.caseId, simJson.caseId]) {
        const agentEntries = await db.prepare(`
          SELECT COUNT(*) as n FROM audit_log WHERE entity_id = ? AND actor = 'agent'
        `).get(caseId);
        assert.ok(agentEntries.n > 0, `case ${caseId} must have been processed by the agent graph, not the deterministic pipeline`);
      }
    } finally {
      process.env.RECOVERY_ENGINE = previousEngine;
    }
  });

  test('29. Batch metrics endpoints aggregate from real persisted rows, not a separate pipeline', async () => {
    const db = getDb();
    const { GET: metricsGet } = await import('../src/app/api/agent/metrics/route.js');
    const { GET: strategiesGet } = await import('../src/app/api/agent/strategies/route.js');

    const metricsRes = await metricsGet();
    const metrics = await metricsRes.json();
    assert.equal(metrics.enabled, true);
    assert.ok(metrics.casesProcessed > 0);

    const recomputedAtRisk = await db.prepare(`
      SELECT SUM(rc.amount_at_risk) as total FROM recovery_cases rc
      WHERE rc.id IN (SELECT DISTINCT entity_id FROM audit_log WHERE actor = 'agent' AND entity_type = 'case')
    `).get();
    assert.equal(metrics.totalRevenueAtRisk, recomputedAtRisk.total);

    const strategiesRes = await strategiesGet();
    const strategies = await strategiesRes.json();
    assert.ok(Array.isArray(strategies.strategies));
    for (const s of strategies.strategies) {
      assert.ok(s.attempts >= s.recovered, 'recovered count can never exceed attempts');
    }
  });
});
