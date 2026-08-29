import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import { resetDatabase, getDb } from '../src/lib/db/database.js';
import { classifyFailure } from '../src/lib/engine/classifier.js';
import { predictRecovery, predictForAction } from '../src/lib/engine/predictor.js';
import { calculatePriority } from '../src/lib/engine/prioritizer.js';
import { decideAction } from '../src/lib/engine/decider.js';
import { checkGuardrails } from '../src/lib/engine/guardrails.js';
import { calculateNEV, evaluateCandidates } from '../src/lib/engine/economics.js';
import { deterministicFallback } from '../src/lib/engine/fallback.js';
import { classifyAttribution, estimateNaiveBaseline } from '../src/lib/engine/attribution.js';
import { processFailedPayment, processEvent, executeRecoveryAction } from '../src/lib/engine/orchestrator.js';
import { parseCSV, autoMapColumns } from '../src/lib/dataset/parser.js';

describe('AI Revenue Recovery Platform - Core Engine Tests', () => {
  before(() => {
    resetDatabase();
  });

  test('1. NEV Calculation & Candidate Evaluation', () => {
    // Probability 0.5 on 100,000 paise (₹1,000). Action 'email' cost = 2,500 paise (₹25)
    // Expected recovery = 50,000. NEV = 47,500
    const res = calculateNEV(100000, 0.5, 'email');
    assert.equal(res.expectedRecovery, 50000);
    assert.equal(res.interventionCost, 2500);
    assert.equal(res.nev, 47500);

    // Evaluate candidates where a positive NEV exists
    const evalRes = evaluateCandidates(100000, [
      { action: 'retry', probability: 0.6 },
      { action: 'no_action', probability: 0.1 },
    ]);
    assert.equal(evalRes.allNegative, false);
    assert.equal(evalRes.selected.action, 'retry');
  });

  test('2. "Do Nothing" (no_action) Selection when all candidates have negative NEV or low probability', () => {
    const caseData = { attempts_made: 5, max_attempts: 5, amount_at_risk: 5000, failure_reason: 'card_expired' };
    const customer = { plan: 'starter', lifetime_value: 1000, discount_affinity: 0.1 };
    const classification = classifyFailure('card_expired', 'gateway');
    const prediction = predictRecovery(classification.baseRecoveryProbability, customer, caseData);
    const priority = calculatePriority(prediction.probability, 5000, 1000, 10);

    const decision = decideAction(caseData, customer, classification, prediction, priority);
    assert.equal(decision.action, 'no_action');
    assert.match(decision.reasoning, /No action is the optimal decision/);
  });

  test('3. Policy & Guardrail Enforcement (Discount Clamping & Opt-out)', () => {
    const caseData = { attempts_made: 1, amount_at_risk: 10000, opened_at: new Date().toISOString(), status: 'open' };
    const customer = { opted_out: 1 };
    const history = [];

    // Customer opted out -> communication actions blocked
    const guardOptOut = checkGuardrails(caseData, { action_type: 'email' }, history, customer);
    assert.equal(guardOptOut.allowed, false);
    assert.match(guardOptOut.violations[0], /CUSTOMER_OPTED_OUT/);

    // Excessive discount -> modification flagged
    const guardDiscount = checkGuardrails(caseData, { action_type: 'discount', discount_percent: 20 }, history, null);
    assert.equal(guardDiscount.modifications.length, 1);
    assert.match(guardDiscount.modifications[0], /MAX_DISCOUNT_PERCENT/);
  });

  test('4. Idempotency Check for Failed Payments', () => {
    const db = getDb();
    const custId = 'cust_test_idempotent';
    const payId = 'pay_test_idempotent';

    db.prepare(`
      INSERT INTO customers (id, name, email, plan, mrr, lifetime_value)
      VALUES (?, 'Idempotent Test', 'test@example.com', 'starter', 1000, 5000)
    `).run(custId);

    db.prepare(`
      INSERT INTO payments (id, customer_id, amount, status, failure_reason)
      VALUES (?, ?, 50000, 'failed', 'insufficient_funds')
    `).run(payId, custId);

    // First processing creates a case
    const firstCall = processFailedPayment(payId);
    assert.ok(firstCall.caseId);
    assert.equal(firstCall.skipped, undefined);

    // Second processing returns existing case without duplicate insertion
    const secondCall = processFailedPayment(payId);
    assert.equal(secondCall.caseId, firstCall.caseId);
    assert.equal(secondCall.skipped, true);
  });

  test('5. AI Fallback Engine', () => {
    const caseData = { max_attempts: 5, attempts_made: 0, amount_at_risk: 10000 };
    const customer = { plan: 'starter', opted_out: 0 };
    const classification = { category: 'temporary', isRetryable: true };

    const fallback = deterministicFallback(caseData, customer, classification);
    assert.equal(fallback.isAIFallback, true);
    assert.match(fallback.reasoning, /AI unavailable — deterministic recovery policy applied/);
    assert.equal(fallback.action, 'retry');
  });

  test('6. Revenue Attribution Classification', () => {
    const caseDataOrganic = { status: 'recovered', recovered_amount: 10000, opened_at: new Date().toISOString(), resolved_at: new Date().toISOString() };
    const attrOrganic = classifyAttribution(caseDataOrganic, []);
    assert.equal(attrOrganic.type, 'organic');

    const caseDataRecovered = { status: 'recovered', recovered_amount: 10000 };
    const actionsRecovered = [{ action_type: 'retry', status: 'completed', result: 'success', executed_at: new Date().toISOString() }];
    const attrRecovered = classifyAttribution(caseDataRecovered, actionsRecovered);
    assert.equal(attrRecovered.type, 'recovered');
  });

  test('7. CSV Parsing & Column Mapping', () => {
    const rawCSV = `Customer Name,User Email,Decline Reason,Amount Risk\nJohn Doe,john@example.com,insufficient_funds,150.00`;
    const parsed = parseCSV(rawCSV);
    assert.equal(parsed.rows.length, 1);

    const mapping = autoMapColumns(parsed.headers);
    assert.equal(mapping['Customer Name'], 'customer_name');
    assert.equal(mapping['User Email'], 'customer_email');
    assert.equal(mapping['Decline Reason'], 'failure_reason');
    assert.equal(mapping['Amount Risk'], 'amount');
  });

  test('8. High-Value Escalation Threshold', () => {
    const caseData = { attempts_made: 0, max_attempts: 5, amount_at_risk: 10000000, failure_reason: 'gateway_error' }; // ₹1,00,000
    const customer = { plan: 'enterprise', lifetime_value: 5000000 };
    const classification = classifyFailure('gateway_error', 'gateway');
    const prediction = predictRecovery(0.8, customer, caseData);
    const priority = calculatePriority(0.8, 10000000, 5000000, 100);

    const decision = decideAction(caseData, customer, classification, prediction, priority);
    assert.equal(decision.requiresApproval, true);
  });
});
