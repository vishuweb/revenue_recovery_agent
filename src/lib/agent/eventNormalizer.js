/**
 * Event Normalization
 *
 * Both the Razorpay webhook and the simulator ultimately produce a `payments`
 * row (see src/lib/db/schema.sql). This module maps that row — or a raw
 * business `events` row (abandonment, expiry, etc.) — into one common shape
 * so every downstream agent node only has to understand a single format,
 * regardless of where the event originated.
 */

/**
 * @typedef {Object} NormalizedEvent
 * @property {string} eventType
 * @property {string|null} paymentId
 * @property {string} customerId
 * @property {number} amount - paise
 * @property {string} currency
 * @property {string|null} failureReason
 * @property {string} timestamp - ISO 8601
 * @property {'razorpay_webhook'|'simulator'|'system'} source
 */

/**
 * Normalize a `payments` row (a failed/pending payment) into a NormalizedEvent.
 * @param {Object} payment - row from the `payments` table
 * @param {'razorpay_webhook'|'simulator'|'system'} [source='system']
 * @returns {NormalizedEvent}
 */
export function normalizePaymentEvent(payment, source = 'system') {
  if (!payment) throw new Error('normalizePaymentEvent: payment row is required');

  return {
    eventType: payment.status === 'failed' ? 'payment.failed' : `payment.${payment.status}`,
    paymentId: payment.id,
    customerId: payment.customer_id,
    amount: payment.amount || 0,
    currency: payment.currency || 'INR',
    failureReason: payment.failure_reason || null,
    timestamp: payment.attempted_at || payment.created_at || new Date().toISOString(),
    source,
  };
}

/**
 * Normalize a business `events` row (checkout_abandoned, near_expiry_inventory, etc.)
 * into a NormalizedEvent.
 * @param {Object} event - row from the `events` table
 * @returns {NormalizedEvent}
 */
export function normalizeBusinessEvent(event) {
  if (!event) throw new Error('normalizeBusinessEvent: event row is required');

  return {
    eventType: event.event_type,
    paymentId: event.payment_id || null,
    customerId: event.customer_id,
    amount: event.amount || 0,
    currency: 'INR',
    failureReason: event.event_type,
    timestamp: event.created_at || new Date().toISOString(),
    source: event.source === 'simulator' ? 'simulator' : 'system',
  };
}
