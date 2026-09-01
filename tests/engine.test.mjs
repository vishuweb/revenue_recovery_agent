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
import { processFailedPayment, processEvent, executeRecoveryAction, processRecoveryOutcome } from '../src/lib/engine/orchestrator.js';
import { parseCSV, autoMapColumns } from '../src/lib/dataset/parser.js';
import { translateSqlToPg } from '../src/lib/db/pg-adapter.js';
import { RazorpayProvider } from '../src/lib/providers/razorpay.js';
import { POST as webhookPost } from '../src/app/api/webhooks/route.js';
import crypto from 'crypto';

describe('AI Revenue Recovery Platform - Core Engine Tests', () => {
  before(async () => {
    await resetDatabase();
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

  test('4. Idempotency Check for Failed Payments', async () => {
    const db = getDb();
    const custId = 'cust_test_idempotent';
    const payId = 'pay_test_idempotent';

    await db.prepare(`
      INSERT INTO customers (id, name, email, plan, mrr, lifetime_value)
      VALUES (?, 'Idempotent Test', 'test@example.com', 'starter', 1000, 5000)
    `).run(custId);

    await db.prepare(`
      INSERT INTO payments (id, customer_id, amount, status, failure_reason)
      VALUES (?, ?, 50000, 'failed', 'insufficient_funds')
    `).run(payId, custId);

    // First processing creates a case
    const firstCall = await processFailedPayment(payId);
    assert.ok(firstCall.caseId);
    assert.equal(firstCall.skipped, undefined);

    // Second processing returns existing case without duplicate insertion
    const secondCall = await processFailedPayment(payId);
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

  test('9. Repeated success outcomes settle a case and customer metrics exactly once', async () => {
    const db = getDb();
    const customerId = 'cust_outcome_once';
    const paymentId = 'pay_outcome_once';
    await db.prepare(`INSERT INTO customers (id, name, email, plan, mrr, lifetime_value) VALUES (?, 'Outcome Test', 'outcome@example.com', 'starter', 1000, 5000)`).run(customerId);
    await db.prepare(`INSERT INTO payments (id, customer_id, amount, status, failure_reason) VALUES (?, ?, 10000, 'failed', 'gateway_error')`).run(paymentId, customerId);
    const { caseId } = await processFailedPayment(paymentId);

    const first = await processRecoveryOutcome(caseId, { success: true });
    const second = await processRecoveryOutcome(caseId, { success: true });
    const customer = await db.prepare('SELECT successful_payments, total_payments FROM customers WHERE id = ?').get(customerId);

    assert.equal(first.recovered, true);
    assert.equal(second.skipped, true);
    assert.equal(customer.successful_payments, 1);
    assert.equal(customer.total_payments, 1);
  });

  test('10. PostgreSQL date-window translation does not create a phantom bind parameter', () => {
    const sql = translateSqlToPg("SELECT * FROM recovery_actions WHERE executed_at > datetime('now', '-30 days') AND case_id = ?");
    assert.match(sql, /INTERVAL '30 days'/);
    assert.match(sql, /case_id = \$1/);
    assert.doesNotMatch(sql, /INTERVAL '\$1 days'/);
  });

  test('11. Razorpay HMAC SHA256 Webhook Signature Validation', () => {
    const secret = 'whsec_test_secret_12345';
    const body = JSON.stringify({ event: 'payment.failed', payload: {} });
    const validSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const invalidSignature = 'invalid_hex_signature_abc123';

    assert.equal(RazorpayProvider.verifyWebhookSignature(body, validSignature, secret), true);
    assert.equal(RazorpayProvider.verifyWebhookSignature(body, invalidSignature, secret), false);
    assert.equal(RazorpayProvider.verifyWebhookSignature(body, '', secret), false);
  });

  test('12. Production Webhook: payment.failed creates payment, customer, and recovery case', async () => {
    const secret = 'whsec_test_secret_webhook';
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;

    const paymentId = `pay_wh_${Date.now()}`;
    const rawBody = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            amount: 499900,
            currency: 'INR',
            status: 'failed',
            error_code: 'card_declined',
            error_reason: 'insufficient_funds',
            email: 'webhook.client@example.com',
            notes: { customer_name: 'Webhook Client Corp' }
          }
        }
      }
    });

    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const req = new Request('http://localhost:3000/api/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': `evt_${Date.now()}_fail`
      },
      body: rawBody
    });

    const res = await webhookPost(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.received, true);
    assert.ok(data.caseId);

    const db = getDb();
    const caseRecord = await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(data.caseId);
    assert.ok(caseRecord);
    assert.equal(caseRecord.amount_at_risk, 499900);
    assert.equal(caseRecord.status, 'open');
  });

  test('13. Production Webhook: payment.authorized records authorization without settling case', async () => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_test_secret_webhook';
    const paymentId = `pay_auth_${Date.now()}`;
    const rawBody = JSON.stringify({
      event: 'payment.authorized',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            amount: 199900,
            currency: 'INR',
            status: 'authorized',
            email: 'auth.client@example.com'
          }
        }
      }
    });

    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const req = new Request('http://localhost:3000/api/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': `evt_${Date.now()}_auth`
      },
      body: rawBody
    });

    const res = await webhookPost(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.received, true);

    const db = getDb();
    const paymentRecord = await db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    assert.ok(paymentRecord);
    assert.equal(paymentRecord.status, 'authorized');
  });

  test('14. Production Webhook: payment.captured settles recovery case', async () => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_test_secret_webhook';
    const db = getDb();

    // Create an open case
    const custId = `cust_cap_${Date.now()}`;
    const payId = `pay_cap_${Date.now()}`;
    await db.prepare(`INSERT INTO customers (id, name, email, plan, mrr, lifetime_value) VALUES (?, 'Capture Cust', 'cap@example.com', 'growth', 299900, 1000000)`).run(custId);
    await db.prepare(`INSERT INTO payments (id, customer_id, amount, status, failure_reason) VALUES (?, ?, 299900, 'failed', 'gateway_error')`).run(payId, custId);
    const { caseId } = await processFailedPayment(payId);

    const rawBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: payId,
            amount: 299900,
            currency: 'INR',
            status: 'captured',
            notes: { caseId }
          }
        }
      }
    });

    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const req = new Request('http://localhost:3000/api/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': `evt_${Date.now()}_cap`
      },
      body: rawBody
    });

    const res = await webhookPost(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.received, true);

    const updatedCase = await db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(caseId);
    assert.equal(updatedCase.status, 'recovered');
    assert.equal(updatedCase.recovered_amount, 299900);
  });

  test('15. Production Webhook: x-razorpay-event-id deduplication handles redelivery idempotently', async () => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_test_secret_webhook';
    const eventId = `evt_dedup_${Date.now()}`;
    const payId = `pay_dedup_${Date.now()}`;

    const rawBody = JSON.stringify({
      event: 'payment.failed',
      event_id: eventId,
      payload: {
        payment: {
          entity: {
            id: payId,
            amount: 99900,
            currency: 'INR',
            status: 'failed',
            error_code: 'card_declined'
          }
        }
      }
    });

    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const makeReq = () => new Request('http://localhost:3000/api/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature,
        'x-razorpay-event-id': eventId
      },
      body: rawBody
    });

    // 1st delivery: creates case
    const res1 = await webhookPost(makeReq());
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.received, true);
    assert.equal(data1.duplicate, undefined);

    // 2nd delivery (redelivery of same event ID): skips duplicate processing
    const res2 = await webhookPost(makeReq());
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.received, true);
    assert.equal(data2.duplicate, true);
  });
});
