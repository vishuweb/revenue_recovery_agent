import { getDb } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

export function generateSimulationData() {
  const db = getDb();
  
  const profiles = [
    { plan: 'enterprise', count: 5, mrrRange: [50000, 200000], ltvRange: [500000, 2000000] },
    { plan: 'growth', count: 5, mrrRange: [15000, 50000], ltvRange: [100000, 500000] },
    { plan: 'starter', count: 10, mrrRange: [5000, 15000], ltvRange: [10000, 100000] }
  ];

  const firstNames = ['Rahul', 'Priya', 'Amit', 'Neha', 'Sanjay', 'Pooja', 'Vikram', 'Anjali', 'Karan', 'Sneha'];
  const lastNames = ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Verma', 'Reddy', 'Jain', 'Das', 'Shah'];
  const companies = ['TechCorp', 'InnoSolutions', 'DataMinds', 'CloudScale', 'GlobalSystems', 'SmartRetail', 'FutureFinance', 'WebWorks'];
  
  for (const profile of profiles) {
    for (let i = 0; i < profile.count; i++) {
      const customerId = uuidv4();
      const mrr = Math.floor(Math.random() * (profile.mrrRange[1] - profile.mrrRange[0])) + profile.mrrRange[0];
      const ltv = Math.floor(Math.random() * (profile.ltvRange[1] - profile.ltvRange[0])) + profile.ltvRange[0];
      
      const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
      const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
      const name = `${fn} ${ln}`;
      
      let pm = 'card';
      const r = Math.random();
      if (r > 0.7) pm = 'upi';
      if (r > 0.9) pm = 'netbanking';

      const totalPayments = Math.floor(Math.random() * 18) + 6; // 6-24
      const failRate = Math.random() * 0.3; // 0-30% failure rate
      let successfulPayments = 0;
      let failedPayments = 0;
      
      const now = new Date().toISOString();

      const discount_affinity = Math.random();
      let avg_order_value = 0;
      if (profile.plan === 'starter') avg_order_value = Math.floor(Math.random() * (15000 - 8000)) + 8000;
      else if (profile.plan === 'growth') avg_order_value = Math.floor(Math.random() * (50000 - 20000)) + 20000;
      else if (profile.plan === 'enterprise') avg_order_value = Math.floor(Math.random() * (200000 - 60000)) + 60000;

      db.prepare(`
        INSERT INTO customers (
          id, name, email, phone, company, plan, mrr, lifetime_value, 
          payment_method, card_last4, card_expiry, risk_score, 
          total_payments, successful_payments, failed_payments, 
          discount_affinity, avg_order_value, opted_out, intervention_count,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        customerId, name, `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`, `+9198765${Math.floor(10000 + Math.random() * 90000)}`,
        companies[Math.floor(Math.random() * companies.length)], profile.plan, mrr, ltv, pm,
        pm === 'card' ? Math.floor(1000 + Math.random() * 9000).toString() : null,
        pm === 'card' ? '12/25' : null, Math.random(), totalPayments, 0, 0,
        discount_affinity, avg_order_value, 0, 0,
        now, now
      );

      const subId = uuidv4();
      db.prepare(`
        INSERT INTO subscriptions (
          id, customer_id, plan_id, plan_name, amount, interval, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        subId, customerId, `${profile.plan}_plan`, profile.plan, mrr, 'monthly', 'active', now, now
      );

      const failureReasons = ['insufficient_funds', 'gateway_error', 'card_declined', 'payment_timed_out', 'authentication_failed', 'card_expired'];

      for (let j = 0; j < totalPayments; j++) {
        const invId = uuidv4();
        const payId = uuidv4();
        const isSuccess = Math.random() > failRate;
        if (isSuccess) successfulPayments++; else failedPayments++;
        
        const date = new Date(Date.now() - (j * 30 * 24 * 60 * 60 * 1000)).toISOString();
        const reason = isSuccess ? null : failureReasons[Math.floor(Math.random() * failureReasons.length)];

        db.prepare(`
          INSERT INTO invoices (
            id, customer_id, subscription_id, amount, currency, status, due_date, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          invId, customerId, subId, mrr, 'INR', isSuccess ? 'paid' : 'overdue', date, date
        );

        db.prepare(`
          INSERT INTO payments (
            id, customer_id, subscription_id, invoice_id, amount, currency, status, 
            method, failure_reason, failure_source, provider_payment_id, attempted_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          payId, customerId, subId, invId, mrr, 'INR', isSuccess ? 'success' : 'failed',
          pm, reason, isSuccess ? null : 'bank', `raz_${uuidv4()}`, date, date
        );
      }

      db.prepare('UPDATE customers SET successful_payments = ?, failed_payments = ? WHERE id = ?').run(successfulPayments, failedPayments, customerId);
    }
  }

  const allCustomers = db.prepare('SELECT id, avg_order_value FROM customers').all();
  if (allCustomers.length > 0) {
    const numAbandonments = Math.floor(Math.random() * 3) + 3; // 3 to 5
    for (let i = 0; i < numAbandonments; i++) {
      const cust = allCustomers[Math.floor(Math.random() * allCustomers.length)];
      db.prepare(`
        INSERT INTO events (
          id, event_type, customer_id, source, amount, metadata, processed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), 'checkout_abandoned', cust.id, 'website', cust.avg_order_value || 10000, JSON.stringify({ items: ['abandoned_item'] }), 0, new Date().toISOString());
    }

    const numExpiry = Math.floor(Math.random() * 2) + 1; // 1 to 2
    for (let i = 0; i < numExpiry; i++) {
      const cust = allCustomers[Math.floor(Math.random() * allCustomers.length)];
      db.prepare(`
        INSERT INTO events (
          id, event_type, customer_id, source, amount, metadata, processed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), 'near_expiry_inventory', cust.id, 'inventory_system', cust.avg_order_value || 5000, JSON.stringify({ item_id: 'expiring_sku' }), 0, new Date().toISOString());
    }
  }
}
