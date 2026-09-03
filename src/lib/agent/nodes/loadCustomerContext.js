import { getDb } from '../../db/database.js';
import { ensureCustomer } from '../../db/customers.js';

/**
 * load_customer_context — pulls the minimal customer/payment context needed
 * for scoring and decisioning. Reuses the same `ensureCustomer` helper the
 * deterministic orchestrator uses, so a customer created via the agent path
 * and one created via a webhook are indistinguishable to the rest of the
 * system.
 */
export async function loadCustomerContext(state) {
  const db = getDb();
  const { event } = state;

  const payment = event.paymentId ? await db.prepare('SELECT * FROM payments WHERE id = ?').get(event.paymentId) : null;
  const customer = await ensureCustomer(db, {
    customerId: event.customerId,
    amount: event.amount || payment?.amount,
    method: payment?.method,
  });

  return {
    customer,
    payment,
    customerId: customer.id,
    amount_at_risk: event.amount || payment?.amount || 0,
    customer_value: customer.lifetime_value || 0,
    timestamps: { contextLoadedAt: new Date().toISOString() },
    audit_trail: [{ phase: 'load_customer_context', at: new Date().toISOString(), summary: `Loaded customer ${customer.id} (LTV ₹${((customer.lifetime_value || 0) / 100).toFixed(0)})` }],
  };
}
