import { v4 as uuidv4 } from 'uuid';

/**
 * Auto-create (or return the existing) customer record so the recovery
 * pipeline never halts on an unrecognized customer_id.
 *
 * This was previously duplicated verbatim in both
 * `processFailedPayment` and `processEvent` in lib/engine/orchestrator.js;
 * it now lives in one place so the deterministic orchestrator and the
 * LangGraph agent's `load_customer_context` node stay in sync.
 *
 * @param {Object} db
 * @param {{ customerId?: string, amount?: number, method?: string }} params
 * @returns {Promise<Object>} the customer row
 */
export async function ensureCustomer(db, { customerId, amount, method } = {}) {
  const existing = customerId ? await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) : null;
  if (existing) return existing;

  const now = new Date().toISOString();
  const finalId = customerId || `cust_${uuidv4().substring(0, 8)}`;
  const baseAmount = amount || 50000;

  const customer = {
    id: finalId,
    name: 'Direct Customer',
    email: `${finalId}@example.com`,
    plan: 'starter',
    mrr: baseAmount,
    lifetime_value: baseAmount * 3,
    payment_method: method || 'card',
    risk_score: 0.3,
    total_payments: 1,
    successful_payments: 1,
    failed_payments: 0,
    discount_affinity: 0.5,
    avg_order_value: baseAmount,
    opted_out: 0,
    intervention_count: 0,
  };

  await db.prepare(`
    INSERT INTO customers (
      id, name, email, phone, company, plan, mrr, lifetime_value, payment_method,
      risk_score, total_payments, successful_payments, failed_payments,
      discount_affinity, avg_order_value, opted_out, intervention_count, created_at, updated_at
    ) VALUES (?, ?, ?, null, 'Direct Account', 'starter', ?, ?, ?, 0.3, 1, 1, 0, 0.5, ?, 0, 0, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
  `).run(customer.id, customer.name, customer.email, customer.mrr, customer.lifetime_value, customer.payment_method, customer.avg_order_value, now, now);

  return customer;
}
