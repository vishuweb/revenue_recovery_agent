import { PaymentProvider } from './base.js';
import crypto from 'crypto';

/**
 * Razorpay Payment Provider
 * Communicates with Razorpay REST API using server-side Test Mode credentials.
 * Credentials must be provided via environment variables:
 * - RAZORPAY_KEY_ID
 * - RAZORPAY_KEY_SECRET
 * - RAZORPAY_WEBHOOK_SECRET
 */
export class RazorpayProvider extends PaymentProvider {
  constructor(options = {}) {
    super();
    this.keyId = options.keyId || process.env.RAZORPAY_KEY_ID || '';
    this.keySecret = options.keySecret || process.env.RAZORPAY_KEY_SECRET || '';
    this.webhookSecret = options.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || '';
    this.baseUrl = options.baseUrl || 'https://api.razorpay.com/v1';
  }

  /**
   * Helper to determine if credentials are configured
   */
  isConfigured() {
    return Boolean(this.keyId && this.keySecret);
  }

  /**
   * Generates Basic Auth header for Razorpay API
   */
  getAuthHeader() {
    if (!this.isConfigured()) {
      throw new Error('Razorpay API keys are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    }
    const token = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    return `Basic ${token}`;
  }

  /**
   * Create Razorpay Order for Standard Web Checkout
   * @param {Object} params - { amount (paise), currency, receipt, notes }
   */
  async createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    if (!this.isConfigured()) {
      throw new Error('Razorpay credentials missing. Cannot create order.');
    }

    const payload = {
      amount: Math.round(amount),
      currency: currency || 'INR',
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: notes || {}
    };

    const response = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getAuthHeader()
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      const errorMsg = data?.error?.description || data?.error?.code || 'Failed to create Razorpay Order';
      throw new Error(`Razorpay Order Error: ${errorMsg}`);
    }

    return {
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      receipt: data.receipt,
      status: data.status,
      raw: data
    };
  }

  /**
   * Create a Razorpay Payment Link (Self-Service Recovery)
   * @param {string} customerId
   * @param {number} amount in paise
   * @param {string} description
   * @param {Object} [options] - { customer, notes, expireBy }
   */
  async createPaymentLink(customerId, amount, description, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Razorpay credentials missing. Cannot create payment link.');
    }

    const payload = {
      amount: Math.round(amount),
      currency: 'INR',
      accept_partial: false,
      description: description || `Recovery settlement for Customer ${customerId}`,
      customer: options.customer || {
        name: options.customerName || `Customer ${customerId}`,
        email: options.customerEmail || undefined,
        contact: options.customerPhone || undefined
      },
      notify: {
        sms: Boolean(options.notifySms),
        email: Boolean(options.notifyEmail)
      },
      reminder_enable: true,
      notes: {
        customerId,
        caseId: options.caseId || '',
        source: 'revenue_recovery_agent',
        ...(options.notes || {})
      }
    };

    if (options.expireBy) {
      payload.expire_by = options.expireBy;
    }

    const response = await fetch(`${this.baseUrl}/payment_links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getAuthHeader()
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      const errorMsg = data?.error?.description || data?.error?.code || 'Failed to create Razorpay Payment Link';
      throw new Error(`Razorpay Payment Link Error: ${errorMsg}`);
    }

    return {
      url: data.short_url,
      linkId: data.id,
      status: data.status,
      amount: data.amount,
      raw: data
    };
  }

  /**
   * Retry/Charge Payment via Razorpay
   */
  async retryPayment(paymentId, amount, customerId, caseData = null) {
    if (!this.isConfigured()) {
      throw new Error('Razorpay credentials missing. Cannot retry payment.');
    }

    const linkResult = await this.createPaymentLink(
      customerId,
      amount,
      `Retry payment for case ${caseData?.id || paymentId}`,
      {
        caseId: caseData?.id,
        notes: { originalPaymentId: paymentId }
      }
    );

    return {
      success: true,
      providerPaymentId: linkResult.linkId,
      url: linkResult.url,
      action: 'payment_link_created'
    };
  }

  /**
   * Fetch payment status from Razorpay API
   * @param {string} providerPaymentId
   */
  async getPaymentStatus(providerPaymentId) {
    if (!this.isConfigured()) {
      throw new Error('Razorpay credentials missing. Cannot fetch payment status.');
    }

    const response = await fetch(`${this.baseUrl}/payments/${providerPaymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': this.getAuthHeader()
      }
    });

    const data = await response.json();
    if (!response.ok) {
      const errorMsg = data?.error?.description || data?.error?.code || 'Payment lookup failed';
      throw new Error(`Razorpay Lookup Error: ${errorMsg}`);
    }

    return {
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      errorReason: data.error_reason,
      raw: data
    };
  }

  /**
   * Verify Webhook Signature using HMAC SHA256 with timing-safe comparison
   * @param {string} rawBody - Raw request body string
   * @param {string} signature - Header 'x-razorpay-signature'
   * @param {string} [customSecret] - Optional override webhook secret
   * @returns {boolean}
   */
  static verifyWebhookSignature(rawBody, signature, customSecret = null) {
    const secret = customSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
    }
    if (!signature || !rawBody) {
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'utf8');

      if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Verify Standard Checkout client signature
   * @param {Object} params - { razorpay_order_id, razorpay_payment_id, razorpay_signature }
   * @param {string} [customSecret]
   * @returns {boolean}
   */
  static verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }, customSecret = null) {
    const secret = customSecret || process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      throw new Error('RAZORPAY_KEY_SECRET is not configured');
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return false;
    }

    try {
      const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const signatureBuffer = Buffer.from(razorpay_signature, 'utf8');

      if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    } catch {
      return false;
    }
  }
}

let razorpayInstance = null;
export function getRazorpayProvider(options = {}) {
  if (!razorpayInstance || Object.keys(options).length > 0) {
    razorpayInstance = new RazorpayProvider(options);
  }
  return razorpayInstance;
}
