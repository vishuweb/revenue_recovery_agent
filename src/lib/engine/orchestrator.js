import { getDb, auditLog } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import { classifyFailure, classifyEvent } from './classifier.js';
import { predictRecovery } from './predictor.js';
import { calculatePriority } from './prioritizer.js';
import { decideAction } from './decider.js';
import { checkGuardrails, POLICY } from './guardrails.js';
import { deterministicFallback } from './fallback.js';
import { classifyAttribution } from './attribution.js';
import { logDecision } from './observability.js';
import { getPaymentProvider, getSimulationProvider } from '../providers/provider.js';

/**
 * Process a failed payment — idempotent.
 * If a recovery case already exists for this payment_id, returns existing case.
 */
export function processFailedPayment(paymentId) {
  const db = getDb();
  
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment) throw new Error('Payment not found');

  // Idempotency: check if case already exists for this payment
  const existingCase = db.prepare('SELECT id FROM recovery_cases WHERE payment_id = ?').get(paymentId);
  if (existingCase) {
    logDecision(existingCase.id, 'idempotency_skip', { key: paymentId, reason: 'Recovery case already exists' });
    return { caseId: existingCase.id, actionId: null, decision: null, skipped: true };
  }
  
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(payment.customer_id);
  if (!customer) throw new Error('Customer not found');

  const classification = classifyFailure(payment.failure_reason, payment.failure_source);
  
  const caseData = {
    attempts_made: 0,
    max_attempts: 5,
    failure_category: classification.category,
    amount_at_risk: payment.amount,
    opened_at: new Date().toISOString(),
    failure_reason: payment.failure_reason,
  };

  const prediction = predictRecovery(classification.baseRecoveryProbability, customer, caseData);
  
  let urgency = 100;
  const priority = calculatePriority(prediction.probability, payment.amount, customer.lifetime_value, urgency);

  // Decision with AI fallback
  let decision;
  try {
    decision = decideAction(caseData, customer, classification, prediction, priority);
  } catch (err) {
    decision = deterministicFallback(caseData, customer, classification);
    logDecision(paymentId, 'ai_fallback', { reason: err.message });
  }

  // Wrap in transaction for atomicity
  const caseId = uuidv4();
  const actionId = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const scheduledAt = new Date(Date.now() + (decision.scheduledDelay || 0)).toISOString();

  const selectedCandidate = decision.candidates ? decision.candidates.find(c => c.selected) : null;
  const expectedRecovery = selectedCandidate ? (selectedCandidate.expectedRecovery || 0) : 0;
  const nev = selectedCandidate ? (selectedCandidate.nev || 0) : 0;

  const insertCase = db.transaction(() => {
    db.prepare(`
      INSERT INTO recovery_cases (
        id, customer_id, payment_id, subscription_id, invoice_id, amount_at_risk,
        expected_recovery, net_expected_value, candidate_actions,
        failure_reason, failure_category, recovery_probability, priority_score,
        recommended_action, ai_reasoning, status, current_step, max_attempts,
        attempts_made, recovered_amount, opened_at, expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      caseId, customer.id, payment.id, payment.subscription_id, payment.invoice_id, payment.amount,
      expectedRecovery, nev, decision.candidates ? JSON.stringify(decision.candidates) : null,
      payment.failure_reason, classification.category, prediction.probability, priority.score,
      decision.action, decision.reasoning, 'open', 1, 5, 0, 0, caseData.opened_at, expiresAt, now
    );

    db.prepare(`
      INSERT INTO recovery_actions (
        id, case_id, action_type, status, scheduled_at, requires_approval, ai_reasoning, discount_percent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      actionId, caseId, decision.action, 'pending', scheduledAt,
      decision.requiresApproval ? 1 : 0, decision.reasoning,
      decision.discount_percent || null, now
    );
  });

  insertCase();

  // Observability
  logDecision(caseId, 'event_received', { failureReason: payment.failure_reason, amountAtRisk: payment.amount });
  logDecision(caseId, 'classified', { category: classification.category, baseProbability: classification.baseRecoveryProbability });
  logDecision(caseId, 'predicted', { probability: prediction.probability, factors: prediction.factors });
  logDecision(caseId, 'prioritized', { tier: priority.tier, score: priority.score });
  logDecision(caseId, 'candidates_generated', { candidateCount: (decision.candidates || []).length });
  logDecision(caseId, 'action_selected', {
    action: decision.action, nev, expectedRecovery,
    allNegativeNEV: decision.allNegativeNEV, isAIFallback: decision.isAIFallback,
  }, { amount: payment.amount });

  return { caseId, actionId, decision };
}

/**
 * Process a business event (abandonment, expiry, etc.) — idempotent.
 */
export function processEvent(eventId) {
  const db = getDb();
  
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) throw new Error('Event not found');
  
  // Idempotency: skip if already processed
  if (event.processed === 1) {
    logDecision(eventId, 'idempotency_skip', { key: eventId, reason: 'Event already processed' });
    return { caseId: null, actionId: null, decision: null, skipped: true };
  }

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(event.customer_id);
  if (!customer) throw new Error('Customer not found');

  const metadata = event.metadata ? JSON.parse(event.metadata) : {};
  const classification = classifyEvent(event.event_type, metadata);
  
  const paymentId = uuidv4();

  const caseData = {
    attempts_made: 0,
    max_attempts: 5,
    failure_category: classification.category,
    amount_at_risk: event.amount || 0,
    opened_at: new Date().toISOString(),
    metadata,
    failure_reason: event.event_type,
  };

  const prediction = predictRecovery(classification.baseRecoveryProbability, customer, caseData);
  const priority = calculatePriority(prediction.probability, caseData.amount_at_risk, customer.lifetime_value, 100);

  // Decision with AI fallback
  let decision;
  try {
    decision = decideAction(caseData, customer, classification, prediction, priority);
  } catch (err) {
    decision = deterministicFallback(caseData, customer, classification);
    logDecision(eventId, 'ai_fallback', { reason: err.message });
  }

  const caseId = uuidv4();
  const actionId = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const scheduledAt = new Date(Date.now() + (decision.scheduledDelay || 0)).toISOString();
  const initialCost = decision.intervention_cost || 0;

  const selectedCandidate = decision.candidates ? decision.candidates.find(c => c.selected) : null;
  const expectedRecovery = selectedCandidate ? (selectedCandidate.expectedRecovery || 0) : 0;
  const nev = selectedCandidate ? (selectedCandidate.nev || 0) : 0;

  const insertEventCase = db.transaction(() => {
    db.prepare(`
      INSERT INTO payments (
        id, customer_id, amount, currency, status, method, failure_reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(paymentId, customer.id, event.amount || 0, 'INR', 'pending', 'none', event.event_type, now);

    db.prepare(`
      INSERT INTO recovery_cases (
        id, customer_id, event_id, payment_id, amount_at_risk, intervention_cost,
        expected_recovery, net_expected_value, candidate_actions,
        failure_reason, failure_category, recovery_probability, priority_score,
        recommended_action, ai_reasoning, status, current_step, max_attempts,
        attempts_made, recovered_amount, opened_at, expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      caseId, customer.id, event.id, paymentId, caseData.amount_at_risk, initialCost,
      expectedRecovery, nev, decision.candidates ? JSON.stringify(decision.candidates) : null,
      event.event_type, classification.category, prediction.probability, priority.score,
      decision.action, decision.reasoning, 'open', 1, 5, 0, 0, caseData.opened_at, expiresAt, now
    );

    db.prepare(`
      INSERT INTO recovery_actions (
        id, case_id, action_type, status, scheduled_at, requires_approval, ai_reasoning, discount_percent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      actionId, caseId, decision.action, 'pending', scheduledAt,
      decision.requiresApproval ? 1 : 0, decision.reasoning,
      decision.discount_percent || null, now
    );

    db.prepare('UPDATE events SET processed = 1 WHERE id = ?').run(event.id);
    db.prepare('UPDATE customers SET intervention_count = COALESCE(intervention_count, 0) + 1, last_intervention_at = ? WHERE id = ?').run(now, customer.id);
  });

  insertEventCase();

  // Observability
  logDecision(caseId, 'event_received', { eventType: event.event_type, amountAtRisk: event.amount });
  logDecision(caseId, 'classified', { category: classification.category, baseProbability: classification.baseRecoveryProbability });
  logDecision(caseId, 'predicted', { probability: prediction.probability });
  logDecision(caseId, 'action_selected', { action: decision.action, nev, allNegativeNEV: decision.allNegativeNEV });

  return { caseId, actionId, decision };
}

/**
 * Execute a recovery action — with guardrails, error classification, and dead-letter support.
 */
export async function executeRecoveryAction(actionId) {
  const db = getDb();
  
  const action = db.prepare('SELECT * FROM recovery_actions WHERE id = ?').get(actionId);
  if (!action) throw new Error('Action not found');

  // Dead-letter check: don't execute if already dead-lettered
  if (action.status === 'dead_letter') {
    return { status: 'dead_letter', reason: 'Action was moved to dead-letter queue' };
  }
  
  const caseData = db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(action.case_id);
  if (!caseData) throw new Error('Case not found');

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(caseData.customer_id);
  const history = db.prepare('SELECT * FROM recovery_actions WHERE case_id = ?').all(caseData.id);

  // Cross-case customer fatigue check
  const recentInterventions = db.prepare(`
    SELECT COUNT(*) as count FROM recovery_actions ra
    JOIN recovery_cases rc ON ra.case_id = rc.id
    WHERE rc.customer_id = ? AND ra.executed_at > datetime('now', '-30 days')
  `).get(caseData.customer_id);

  const guardrailsResult = checkGuardrails(caseData, action, history, customer, {
    recentInterventionCount: recentInterventions?.count || 0,
  });

  // Log policy check
  logDecision(caseData.id, guardrailsResult.allowed ? 'policy_checked' : 'policy_rejected', {
    allowed: guardrailsResult.allowed,
    violations: guardrailsResult.violations,
    warnings: guardrailsResult.warnings,
    modifications: guardrailsResult.modifications,
  });
  
  if (!guardrailsResult.allowed) {
    db.prepare('UPDATE recovery_actions SET status = ?, result_details = ? WHERE id = ?')
      .run('skipped', JSON.stringify({ violations: guardrailsResult.violations }), action.id);
    
    return { status: 'skipped', guardrailsResult };
  }

  // Apply policy modifications (e.g., discount clamping)
  if (guardrailsResult.modifications.length > 0) {
    logDecision(caseData.id, 'policy_modified', {
      modifications: guardrailsResult.modifications,
    });
  }

  if (action.requires_approval === 1 && !action.approved_by) {
    return { status: 'pending_approval' };
  }

  db.prepare('UPDATE recovery_actions SET status = ?, executed_at = ? WHERE id = ?')
    .run('executing', new Date().toISOString(), action.id);

  const provider = getPaymentProvider();
  
  let result;
  let executionError = null;

  try {
    if (action.action_type === 'retry') {
      const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(caseData.payment_id);
      result = await provider.retryPayment(payment?.id || caseData.payment_id, payment?.amount || caseData.amount_at_risk, caseData.customer_id, caseData);
      
      if (result.success) {
        db.prepare('UPDATE recovery_actions SET status = ?, result = ?, result_details = ? WHERE id = ?')
          .run('completed', 'success', JSON.stringify(result), action.id);
        
        processRecoveryOutcome(caseData.id, result);
        logDecision(caseData.id, 'executed', { actionType: 'retry', result: 'success', paymentId: result.providerPaymentId || null });
      } else {
        db.prepare('UPDATE recovery_actions SET status = ?, result = ?, result_details = ? WHERE id = ?')
          .run('failed', 'failed', JSON.stringify(result), action.id);
        
        db.prepare('UPDATE recovery_cases SET attempts_made = attempts_made + 1, updated_at = ? WHERE id = ?')
          .run(new Date().toISOString(), caseData.id);

        logDecision(caseData.id, 'execution_failed', { actionType: 'retry', error: result.failureReason || 'unknown' });

        // Re-evaluate and schedule next action
        scheduleNextAction(caseData.id, customer);
      }
    } else if (action.action_type === 'payment_link') {
      const customerRecord = customer || db.prepare('SELECT * FROM customers WHERE id = ?').get(caseData.customer_id);
      result = await provider.createPaymentLink(
        caseData.customer_id,
        caseData.amount_at_risk,
        `Recovery for case ${caseData.id}`,
        {
          caseId: caseData.id,
          customerName: customerRecord?.name,
          customerEmail: customerRecord?.email,
          customerPhone: customerRecord?.phone,
          notes: {
            case_id: caseData.id,
            customer_id: caseData.customer_id
          }
        }
      );
      db.prepare('UPDATE recovery_actions SET status = ?, result = ?, result_details = ? WHERE id = ?')
        .run('completed', 'success', JSON.stringify(result), action.id);
      logDecision(caseData.id, 'executed', { actionType: 'payment_link', result: 'success', paymentUrl: result.url || null });
    } else if (action.action_type === 'no_action') {
      // No_action is explicitly "do nothing" — mark as completed successfully
      result = { msg: 'No action taken — optimal financial decision', success: true };
      db.prepare('UPDATE recovery_actions SET status = ?, result = ?, result_details = ? WHERE id = ?')
        .run('completed', 'no_action', JSON.stringify(result), action.id);
      logDecision(caseData.id, 'executed', { actionType: 'no_action', result: 'completed' });
    } else if (['discount', 'free_shipping', 'cart_reminder', 'targeted_campaign'].includes(action.action_type)) {
      result = { msg: `Executed ${action.action_type}`, success: true };
      db.prepare('UPDATE recovery_actions SET status = ?, result = ?, result_details = ? WHERE id = ?')
        .run('completed', 'success', JSON.stringify(result), action.id);

      if (action.discount_percent) {
        const clampedDiscount = Math.min(action.discount_percent, POLICY.MAX_DISCOUNT_PERCENT);
        const interventionCost = Math.round(caseData.amount_at_risk * (clampedDiscount / 100));
        db.prepare('UPDATE recovery_cases SET intervention_cost = ? WHERE id = ?')
          .run(interventionCost, caseData.id);
      }
      logDecision(caseData.id, 'executed', { actionType: action.action_type, result: 'success' });
    } else {
      // email, sms, escalate, stop
      result = { msg: `Executed ${action.action_type}` };
      db.prepare('UPDATE recovery_actions SET status = ?, result = ?, result_details = ? WHERE id = ?')
        .run('completed', 'success', JSON.stringify(result), action.id);
      logDecision(caseData.id, 'executed', { actionType: action.action_type, result: 'success' });
    }
  } catch (err) {
    executionError = err;
    
    // Classify error: retryable vs permanent
    const isRetryable = err.message && (
      err.message.includes('timeout') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('network')
    );

    // Count previous failures for this action type
    const failureCount = history.filter(a => 
      a.action_type === action.action_type && a.status === 'failed'
    ).length;

    if (isRetryable && failureCount < 3) {
      // Retry with backoff
      db.prepare('UPDATE recovery_actions SET status = ?, result_details = ? WHERE id = ?')
        .run('failed', JSON.stringify({ error: err.message, retryable: true }), action.id);
      logDecision(caseData.id, 'execution_failed', { actionType: action.action_type, error: err.message, retryable: true });
    } else {
      // Move to dead-letter queue
      db.prepare('UPDATE recovery_actions SET status = ?, result_details = ? WHERE id = ?')
        .run('dead_letter', JSON.stringify({ error: err.message, retryable: false, failureCount }), action.id);
      logDecision(caseData.id, 'dead_letter', { actionType: action.action_type, reason: `${failureCount + 1} failures: ${err.message}` });
    }

    return { status: 'error', error: err.message };
  }

  return { status: 'completed', result };
}

/**
 * Schedule the next action after a failed attempt.
 */
function scheduleNextAction(caseId, customer) {
  const db = getDb();
  const updatedCaseData = db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(caseId);
  if (!updatedCaseData) return;

  const classification = classifyFailure(updatedCaseData.failure_reason);
  const prediction = predictRecovery(classification.baseRecoveryProbability, customer, updatedCaseData);
  const priority = calculatePriority(prediction.probability, updatedCaseData.amount_at_risk, customer.lifetime_value, 100);

  let nextDecision;
  try {
    nextDecision = decideAction(updatedCaseData, customer, classification, prediction, priority);
  } catch (err) {
    nextDecision = deterministicFallback(updatedCaseData, customer, classification);
  }

  const nextActionId = uuidv4();
  const scheduledAt = new Date(Date.now() + (nextDecision.scheduledDelay || 0)).toISOString();

  db.prepare(`
    INSERT INTO recovery_actions (
      id, case_id, action_type, status, scheduled_at, requires_approval, ai_reasoning, discount_percent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextActionId, caseId, nextDecision.action, 'pending', scheduledAt,
    nextDecision.requiresApproval ? 1 : 0, nextDecision.reasoning,
    nextDecision.discount_percent || null, new Date().toISOString()
  );

  // Update case NEV
  const selectedCandidate = nextDecision.candidates ? nextDecision.candidates.find(c => c.selected) : null;
  if (selectedCandidate) {
    db.prepare('UPDATE recovery_cases SET expected_recovery = ?, net_expected_value = ?, candidate_actions = ?, recommended_action = ?, ai_reasoning = ?, recovery_probability = ?, updated_at = ? WHERE id = ?')
      .run(
        selectedCandidate.expectedRecovery || 0, selectedCandidate.nev || 0,
        JSON.stringify(nextDecision.candidates), nextDecision.action, nextDecision.reasoning,
        prediction.probability, new Date().toISOString(), caseId
      );
  }
}

/**
 * Process a successful recovery outcome — with attribution.
 */
export function processRecoveryOutcome(caseId, paymentResult) {
  const db = getDb();
  
  const caseData = db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(caseId);
  if (!caseData) return;

  if (paymentResult.success) {
    // Determine attribution
    const actions = db.prepare('SELECT * FROM recovery_actions WHERE case_id = ?').all(caseId);
    const attribution = classifyAttribution(caseData, actions);

    const updateRecovery = db.transaction(() => {
      db.prepare(`
        UPDATE recovery_cases 
        SET status = 'recovered', recovered_amount = amount_at_risk, 
            attribution_type = ?, resolved_at = ?, updated_at = ? 
        WHERE id = ?
      `).run(attribution.type, new Date().toISOString(), new Date().toISOString(), caseId);

      // Adaptive feedback loop
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(caseData.customer_id);
      if (customer) {
        const successfulAction = db.prepare("SELECT * FROM recovery_actions WHERE case_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1").get(caseId);
        const discountGiven = successfulAction?.discount_percent || 0;
        
        let updatedAffinity = customer.discount_affinity || 0.5;
        if (discountGiven > 0) {
          updatedAffinity = Math.min(1.0, updatedAffinity * 0.85 + (discountGiven / 10.0) * 0.15);
        } else {
          updatedAffinity = Math.max(0.0, updatedAffinity * 0.85 + 0.10 * 0.15);
        }

        db.prepare(`
          UPDATE customers 
          SET successful_payments = successful_payments + 1, 
              total_payments = total_payments + 1,
              discount_affinity = ?
          WHERE id = ?
        `).run(parseFloat(updatedAffinity.toFixed(4)), caseData.customer_id);
      } else {
        db.prepare('UPDATE customers SET successful_payments = successful_payments + 1, total_payments = total_payments + 1 WHERE id = ?').run(caseData.customer_id);
      }

      if (caseData.subscription_id) {
        db.prepare("UPDATE subscriptions SET status = 'active', updated_at = ? WHERE id = ?").run(new Date().toISOString(), caseData.subscription_id);
      }
    });

    updateRecovery();

    logDecision(caseId, 'recovered', { recoveredAmount: caseData.amount_at_risk }, { amount: caseData.amount_at_risk });
    logDecision(caseId, 'recovery_attributed', { attributionType: attribution.type, confidence: attribution.confidence, explanation: attribution.explanation });
  }
}

export async function processPendingAutomations() {
  const db = getDb();
  const now = new Date().toISOString();
  
  const pendingActions = db.prepare(`
    SELECT id FROM recovery_actions 
    WHERE status = 'pending' 
      AND scheduled_at <= ?
      AND (requires_approval = 0 OR approved_by IS NOT NULL)
  `).all(now);

  const actionResults = [];
  for (const action of pendingActions) {
    try {
      const result = await executeRecoveryAction(action.id);
      actionResults.push({ id: action.id, status: result.status });
    } catch (e) {
      actionResults.push({ id: action.id, status: 'error', error: e.message });
    }
  }

  const unhandledPayments = db.prepare(`
    SELECT p.id FROM payments p
    LEFT JOIN recovery_cases r ON p.id = r.payment_id
    WHERE p.status = 'failed' AND r.id IS NULL
  `).all();

  const caseResults = [];
  for (const payment of unhandledPayments) {
    try {
      const result = processFailedPayment(payment.id);
      caseResults.push({ id: payment.id, caseId: result.caseId });
    } catch (e) {
      caseResults.push({ id: payment.id, error: e.message });
    }
  }

  return { 
    actionsProcessed: actionResults.length, 
    actionResults,
    paymentsProcessed: caseResults.length,
    caseResults
  };
}
