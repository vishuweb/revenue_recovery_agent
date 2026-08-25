import { getDb, auditLog } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import { classifyFailure, classifyEvent } from './classifier.js';
import { predictRecovery } from './predictor.js';
import { calculatePriority } from './prioritizer.js';
import { decideAction } from './decider.js';
import { checkGuardrails } from './guardrails.js';
import { getSimulationProvider } from '../providers/simulation.js';

export function processFailedPayment(paymentId) {
  const db = getDb();
  
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment) throw new Error('Payment not found');
  
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(payment.customer_id);
  if (!customer) throw new Error('Customer not found');

  const classification = classifyFailure(payment.failure_reason, payment.failure_source);
  
  const caseData = {
    attempts_made: 0,
    max_attempts: 5,
    failure_category: classification.category,
    amount_at_risk: payment.amount,
    opened_at: new Date().toISOString()
  };

  const prediction = predictRecovery(classification.baseRecoveryProbability, customer, caseData);
  
  let urgency = 100; // Fresh failure
  const priority = calculatePriority(prediction.probability, payment.amount, customer.lifetime_value, urgency);
  
  const decision = decideAction(
    { ...caseData, failure_reason: payment.failure_reason },
    customer,
    classification,
    prediction,
    priority
  );

  const caseId = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  
  db.prepare(`
    INSERT INTO recovery_cases (
      id, customer_id, payment_id, subscription_id, invoice_id, amount_at_risk, 
      failure_reason, failure_category, recovery_probability, priority_score, 
      recommended_action, ai_reasoning, status, current_step, max_attempts, 
      attempts_made, recovered_amount, opened_at, expires_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    caseId, customer.id, payment.id, payment.subscription_id, payment.invoice_id, payment.amount,
    payment.failure_reason, classification.category, prediction.probability, priority.score,
    decision.action, decision.reasoning, 'open', 1, 5, 0, 0, caseData.opened_at, expiresAt, new Date().toISOString()
  );

  const actionId = uuidv4();
  const scheduledAt = new Date(Date.now() + decision.scheduledDelay).toISOString();
  
  db.prepare(`
    INSERT INTO recovery_actions (
      id, case_id, action_type, status, scheduled_at, requires_approval, ai_reasoning, discount_percent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    actionId, caseId, decision.action, 'pending', scheduledAt, decision.requiresApproval ? 1 : 0, decision.reasoning, decision.discount_percent || null, new Date().toISOString()
  );

  auditLog({
    entityType: 'case',
    entityId: caseId,
    eventType: 'case_opened',
    description: `Recovery case opened for failed payment ${payment.id}`,
    details: JSON.stringify({ classification, prediction, priority, decision }),
    actor: 'system',
    amount: payment.amount
  });

  return { caseId, actionId, decision };
}

export function processEvent(eventId) {
  const db = getDb();
  
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) throw new Error('Event not found');
  
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(event.customer_id);
  if (!customer) throw new Error('Customer not found');

  const metadata = event.metadata ? JSON.parse(event.metadata) : {};
  const classification = classifyEvent(event.event_type, metadata);
  
  const paymentId = uuidv4();
  db.prepare(`
    INSERT INTO payments (
      id, customer_id, amount, currency, status, method, failure_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    paymentId, customer.id, event.amount || 0, 'INR', 'pending', 'none', event.event_type, new Date().toISOString()
  );

  const caseData = {
    attempts_made: 0,
    max_attempts: 5,
    failure_category: classification.category,
    amount_at_risk: event.amount || 0,
    opened_at: new Date().toISOString(),
    metadata
  };

  const prediction = predictRecovery(classification.baseRecoveryProbability, customer, caseData);
  
  const priority = calculatePriority(prediction.probability, caseData.amount_at_risk, customer.lifetime_value, 100);
  
  const decision = decideAction(
    { ...caseData, failure_reason: event.event_type },
    customer,
    classification,
    prediction,
    priority
  );

  const caseId = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const initialCost = decision.intervention_cost || 0;
  
  db.prepare(`
    INSERT INTO recovery_cases (
      id, customer_id, event_id, payment_id, amount_at_risk, intervention_cost,
      failure_reason, failure_category, recovery_probability, priority_score, 
      recommended_action, ai_reasoning, status, current_step, max_attempts, 
      attempts_made, recovered_amount, opened_at, expires_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    caseId, customer.id, event.id, paymentId, caseData.amount_at_risk, initialCost,
    event.event_type, classification.category, prediction.probability, priority.score,
    decision.action, decision.reasoning, 'open', 1, 5, 0, 0, caseData.opened_at, expiresAt, new Date().toISOString()
  );

  const actionId = uuidv4();
  const scheduledAt = new Date(Date.now() + decision.scheduledDelay).toISOString();
  
  db.prepare(`
    INSERT INTO recovery_actions (
      id, case_id, action_type, status, scheduled_at, requires_approval, ai_reasoning, discount_percent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    actionId, caseId, decision.action, 'pending', scheduledAt, decision.requiresApproval ? 1 : 0, decision.reasoning, decision.discount_percent || null, new Date().toISOString()
  );

  db.prepare('UPDATE events SET processed = 1 WHERE id = ?').run(event.id);

  db.prepare('UPDATE customers SET intervention_count = COALESCE(intervention_count, 0) + 1, last_intervention_at = ? WHERE id = ?').run(new Date().toISOString(), customer.id);

  auditLog({
    entityType: 'case',
    entityId: caseId,
    eventType: 'case_opened',
    description: `Recovery case opened for event ${event.id}`,
    details: JSON.stringify({ classification, prediction, priority, decision }),
    actor: 'system',
    amount: caseData.amount_at_risk
  });

  return { caseId, actionId, decision };
}

export async function executeRecoveryAction(actionId) {
  const db = getDb();
  
  const action = db.prepare('SELECT * FROM recovery_actions WHERE id = ?').get(actionId);
  if (!action) throw new Error('Action not found');
  
  const caseData = db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(action.case_id);
  if (!caseData) throw new Error('Case not found');

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(caseData.customer_id);

  const history = db.prepare('SELECT * FROM recovery_actions WHERE case_id = ?').all(caseData.id);
  
  const guardrailsResult = checkGuardrails(caseData, action, history, customer);
  
  if (!guardrailsResult.allowed) {
    db.prepare('UPDATE recovery_actions SET status = ?, result_details = ? WHERE id = ?')
      .run('skipped', JSON.stringify({ violations: guardrailsResult.violations }), action.id);
    
    auditLog({
      entityType: 'action',
      entityId: action.id,
      eventType: 'action_skipped',
      description: `Action skipped due to guardrails: ${guardrailsResult.violations.join(', ')}`,
      details: JSON.stringify(guardrailsResult),
      actor: 'system',
      amount: 0
    });
    return { status: 'skipped', guardrailsResult };
  }

  if (action.requires_approval === 1 && !action.approved_by) {
    return { status: 'pending_approval' };
  }

  db.prepare('UPDATE recovery_actions SET status = ?, executed_at = ? WHERE id = ?')
    .run('executing', new Date().toISOString(), action.id);

  const provider = getSimulationProvider();
  
  let result;
  if (action.action_type === 'retry') {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(caseData.payment_id);
    result = await provider.retryPayment(payment.id, payment.amount, payment.customer_id, caseData);
    
    if (result.success) {
      db.prepare('UPDATE recovery_actions SET status = ?, result = ?, result_details = ? WHERE id = ?')
        .run('completed', 'success', JSON.stringify(result), action.id);
      
      processRecoveryOutcome(caseData.id, result);
    } else {
      db.prepare('UPDATE recovery_actions SET status = ?, result = ?, result_details = ? WHERE id = ?')
        .run('failed', 'failed', JSON.stringify(result), action.id);
      
      db.prepare('UPDATE recovery_cases SET attempts_made = attempts_made + 1, updated_at = ? WHERE id = ?')
        .run(new Date().toISOString(), caseData.id);

      // Re-run AI to decide next action
      const updatedCaseData = db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(caseData.id);
      const classification = classifyFailure(payment.failure_reason, payment.failure_source);
      const prediction = predictRecovery(classification.baseRecoveryProbability, customer, updatedCaseData);
      const priority = calculatePriority(prediction.probability, payment.amount, customer.lifetime_value, 100);
      
      const nextDecision = decideAction(updatedCaseData, customer, classification, prediction, priority);
      
      const nextActionId = uuidv4();
      const scheduledAt = new Date(Date.now() + nextDecision.scheduledDelay).toISOString();
      
      db.prepare(`
        INSERT INTO recovery_actions (
          id, case_id, action_type, status, scheduled_at, requires_approval, ai_reasoning, discount_percent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nextActionId, caseData.id, nextDecision.action, 'pending', scheduledAt, nextDecision.requiresApproval ? 1 : 0, nextDecision.reasoning, nextDecision.discount_percent || null, new Date().toISOString()
      );
    }
  } else if (action.action_type === 'payment_link') {
    result = await provider.createPaymentLink(caseData.customer_id, caseData.amount_at_risk, `Recovery for case ${caseData.id}`);
    db.prepare('UPDATE recovery_actions SET status = ?, result = ?, result_details = ? WHERE id = ?')
      .run('completed', 'success', JSON.stringify(result), action.id);
  } else if (['discount', 'free_shipping', 'cart_reminder', 'targeted_campaign'].includes(action.action_type)) {
    result = { msg: `Executed ${action.action_type}`, success: true };
    db.prepare('UPDATE recovery_actions SET status = ?, result = ?, result_details = ? WHERE id = ?')
      .run('completed', 'success', JSON.stringify(result), action.id);

    if (action.discount_percent) {
      const interventionCost = Math.round(caseData.amount_at_risk * (action.discount_percent / 100));
      db.prepare('UPDATE recovery_cases SET intervention_cost = ? WHERE id = ?')
        .run(interventionCost, caseData.id);
    }
  } else {
    // email, sms, escalate, stop
    result = { msg: `Executed ${action.action_type}` };
    db.prepare('UPDATE recovery_actions SET status = ?, result = ?, result_details = ? WHERE id = ?')
      .run('completed', 'success', JSON.stringify(result), action.id);
  }

  auditLog({
    entityType: 'action',
    entityId: action.id,
    eventType: 'action_executed',
    description: `Action ${action.action_type} executed`,
    details: JSON.stringify({ result }),
    actor: 'system',
    amount: 0
  });

  return { status: 'completed', result };
}

export function processRecoveryOutcome(caseId, paymentResult) {
  const db = getDb();
  
  const caseData = db.prepare('SELECT * FROM recovery_cases WHERE id = ?').get(caseId);
  if (!caseData) return;

  if (paymentResult.success) {
    db.prepare(`
      UPDATE recovery_cases 
      SET status = 'recovered', recovered_amount = amount_at_risk, resolved_at = ?, updated_at = ? 
      WHERE id = ?
    `).run(new Date().toISOString(), new Date().toISOString(), caseId);

    // Adaptive Feedback Loop: Calibrate customer's discount_affinity based on recovery outcome
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(caseData.customer_id);
    if (customer) {
      const successfulAction = db.prepare("SELECT * FROM recovery_actions WHERE case_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1").get(caseId);
      const discountGiven = successfulAction?.discount_percent || 0;
      
      let updatedAffinity = customer.discount_affinity || 0.5;
      if (discountGiven > 0) {
        // Customer converted with discount -> update affinity
        updatedAffinity = Math.min(1.0, updatedAffinity * 0.85 + (discountGiven / 10.0) * 0.15);
      } else {
        // Customer converted at full price -> reduce discount reliance to preserve margin next time
        updatedAffinity = Math.max(0.0, updatedAffinity * 0.85 + 0.10 * 0.15);
      }

      db.prepare(`
        UPDATE customers 
        SET successful_payments = successful_payments + 1, 
            total_payments = total_payments + 1,
            discount_affinity = ?
        WHERE id = ?
      `).run(parseFloat(updatedAffinity.toFixed(4)), caseData.customer_id);

      auditLog({
        entityType: 'customer',
        entityId: caseData.customer_id,
        eventType: 'adaptive_affinity_calibrated',
        description: `Customer discount affinity calibrated from ${customer.discount_affinity?.toFixed(2)} to ${updatedAffinity.toFixed(2)} based on conversion outcome`,
        details: JSON.stringify({ previousAffinity: customer.discount_affinity, newAffinity: updatedAffinity, discountGiven }),
        actor: 'ai_engine',
        amount: 0
      });
    } else {
      db.prepare('UPDATE customers SET successful_payments = successful_payments + 1, total_payments = total_payments + 1 WHERE id = ?').run(caseData.customer_id);
    }

    if (caseData.subscription_id) {
      db.prepare("UPDATE subscriptions SET status = 'active', updated_at = ? WHERE id = ?").run(new Date().toISOString(), caseData.subscription_id);
    }

    auditLog({
      entityType: 'case',
      entityId: caseId,
      eventType: 'case_recovered',
      description: `Case recovered successfully`,
      details: JSON.stringify(paymentResult),
      actor: 'system',
      amount: caseData.amount_at_risk
    });
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
