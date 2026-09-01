import { getDb, auditLog } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';
import { processFailedPayment, processEvent } from '../engine/orchestrator.js';

export async function triggerScenario(scenarioType) {
  const db = getDb();
  let type = scenarioType;
  
  const types = ['temporary_failure', 'chronic_failure', 'high_value_failure', 'expired_card', 'gateway_outage', 'checkout_abandoned', 'checkout_timeout', 'near_expiry_inventory'];
  if (type === 'random') type = types[Math.floor(Math.random() * types.length)];

  if (type === 'near_expiry_inventory') {
    // Select top cohort of customers ranked by composite propensity (affinity + payment history + value fit)
    const cohort = await db.prepare(`
      SELECT *, 
        (discount_affinity * 40 + 
         (CASE WHEN total_payments > 0 THEN (successful_payments * 1.0 / total_payments) * 30 ELSE 15 END) + 
         (CASE WHEN avg_order_value > 0 THEN 30 ELSE 15 END)
        ) as propensity_score
      FROM customers
      WHERE opted_out = 0
      ORDER BY propensity_score DESC
      LIMIT 5
    `).all();

    if (!cohort || cohort.length === 0) return { error: 'No eligible cohort customers found' };

    const hoursOptions = [6, 12, 18, 24, 48];
    const cases = [];

    for (let i = 0; i < cohort.length; i++) {
      const targetCustomer = cohort[i];
      const eventId = uuidv4();
      const amount = 35000; // 350 INR in paise
      const hoursToExpiry = hoursOptions[i % hoursOptions.length];
      const metadata = {
        item_id: 'expiring_sku_batch_101',
        hours_to_expiry: hoursToExpiry,
        cohort_rank: i + 1,
        cohort_size: cohort.length,
        campaign_name: 'Clearance Countdown Flash'
      };

      await db.prepare(`
        INSERT INTO events (
          id, event_type, customer_id, source, amount, metadata, processed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(eventId, type, targetCustomer.id, 'inventory_monitor', amount, JSON.stringify(metadata), 0, new Date().toISOString());

      const result = await processEvent(eventId);
      cases.push(result);
    }

    return { scenario: type, cohortSize: cohort.length, cases };
  }

  if (['checkout_abandoned', 'checkout_timeout'].includes(type)) {
    const targetCustomer = await db.prepare('SELECT * FROM customers ORDER BY RANDOM() LIMIT 1').get();
    if (!targetCustomer) return { error: 'No customers found' };
    
    const eventId = uuidv4();
    const amount = targetCustomer.avg_order_value || 10000;
    const metadata = { items: ['abandoned_cart_item'], cart_id: `cart_${uuidv4().substring(0, 8)}` };
    
    await db.prepare(`
      INSERT INTO events (
        id, event_type, customer_id, source, amount, metadata, processed, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, type, targetCustomer.id, 'storefront', amount, JSON.stringify(metadata), 0, new Date().toISOString());
    
    const result = await processEvent(eventId);
    return { scenario: type, cases: [result] };
  }

  let targetCustomer;
  const failureReasons = ['insufficient_funds', 'gateway_error', 'card_declined', 'payment_timed_out', 'authentication_failed', 'card_expired'];
  let failureReason = failureReasons[Math.floor(Math.random() * failureReasons.length)];
  let failureSource = 'bank';
  let isGatewayOutage = false;

  if (type === 'temporary_failure') {
    targetCustomer = await db.prepare('SELECT * FROM customers ORDER BY RANDOM() LIMIT 1').get();
  } else if (type === 'chronic_failure') {
    targetCustomer = await db.prepare('SELECT * FROM customers ORDER BY RANDOM() LIMIT 1').get();
    failureReason = 'card_declined';
    if (targetCustomer) {
      await db.prepare('UPDATE customers SET failed_payments = failed_payments + 5 WHERE id = ?').run(targetCustomer.id);
    }
  } else if (type === 'high_value_failure') {
    targetCustomer = await db.prepare("SELECT * FROM customers WHERE plan = 'enterprise' ORDER BY RANDOM() LIMIT 1").get();
  } else if (type === 'expired_card') {
    targetCustomer = await db.prepare("SELECT * FROM customers WHERE payment_method = 'card' ORDER BY RANDOM() LIMIT 1").get();
    if (!targetCustomer) targetCustomer = await db.prepare('SELECT * FROM customers ORDER BY RANDOM() LIMIT 1').get(); // Fallback
    failureReason = 'card_expired';
  } else if (type === 'gateway_outage') {
    isGatewayOutage = true;
    failureReason = 'gateway_error';
    failureSource = 'razorpay';
  }

  const createFailureForCustomer = async (customer, reason, source) => {
    const sub = await db.prepare('SELECT * FROM subscriptions WHERE customer_id = ? LIMIT 1').get(customer.id);
    const amount = customer.mrr;

    const invId = uuidv4();
    const date = new Date().toISOString();
    
    await db.prepare(`
      INSERT INTO invoices (
        id, customer_id, subscription_id, amount, currency, status, due_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(invId, customer.id, sub ? sub.id : null, amount, 'INR', 'unpaid', date, date);

    const payId = uuidv4();
    await db.prepare(`
      INSERT INTO payments (
        id, customer_id, subscription_id, invoice_id, amount, currency, status, 
        method, failure_reason, failure_source, provider_payment_id, attempted_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payId, customer.id, sub ? sub.id : null, invId, amount, 'INR', 'failed', customer.payment_method, reason, source, `raz_${uuidv4()}`, date, date);

    await db.prepare('UPDATE customers SET failed_payments = failed_payments + 1 WHERE id = ?').run(customer.id);
    if (sub) {
      await db.prepare("UPDATE subscriptions SET status = 'past_due' WHERE id = ?").run(sub.id);
    }

    return await processFailedPayment(payId);
  };

  if (isGatewayOutage) {
    const customers = await db.prepare('SELECT * FROM customers ORDER BY RANDOM() LIMIT 3').all();
    const cases = [];
    for (const c of customers) {
      cases.push(await createFailureForCustomer(c, failureReason, failureSource));
    }
    return { scenario: type, cases };
  } else {
    if (!targetCustomer) targetCustomer = await db.prepare('SELECT * FROM customers ORDER BY RANDOM() LIMIT 1').get();
    if (!targetCustomer) return { error: 'No customers available for scenario' };
    const result = await createFailureForCustomer(targetCustomer, failureReason, failureSource);
    return { scenario: type, cases: [result] };
  }
}
