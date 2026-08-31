import { PaymentProvider } from './base.js';
import { v4 as uuidv4 } from 'uuid';

const FAILURE_REASONS = [
  'card_declined',
  'insufficient_funds',
  'network_error',
  'gateway_timeout',
  'bank_server_down'
];

function getRandomFailureReason() {
  const index = Math.floor(Math.random() * FAILURE_REASONS.length);
  return FAILURE_REASONS[index];
}

export class SimulationProvider extends PaymentProvider {
  constructor() {
    super();
    this.payments = new Map();
  }

  async retryPayment(paymentId, amount, customerId, caseData = null) {
    // Simulated transient infrastructure failures:
    // 5% chance of timeout error, 2% chance of network error
    const failureRoll = Math.random();
    if (failureRoll < 0.05) {
      throw new Error('Payment gateway timeout');
    } else if (failureRoll < 0.07) {
      throw new Error('network connection refused');
    }

    let probability = 0.5;
    if (caseData && typeof caseData.recovery_probability === 'number') {
      probability = caseData.recovery_probability;

      const attempts = caseData.attempts_made || 0;
      if (attempts === 0) {
        probability *= 0.85; // Initial retry attempt before customer engagement
      } else if (attempts === 1) {
        probability *= 1.1; // Second attempt timed with optimal retry window
      } else {
        // Diminishing returns with each subsequent failed retry
        probability *= Math.max(0.15, 1 - (attempts * 0.2));
      }
    }

    // Clamp probability between 0.05 and 0.95
    probability = Math.min(0.95, Math.max(0.05, probability));

    const success = Math.random() < probability;
    const failureReason = success ? null : getRandomFailureReason();
    const providerPaymentId = 'sim_pay_' + uuidv4();

    this.payments.set(providerPaymentId, {
      status: success ? 'success' : 'failed',
      amount,
      failureReason
    });

    return {
      success,
      providerPaymentId,
      failureReason
    };
  }

  async createPaymentLink(customerId, amount, description) {
    const linkId = 'sim_pl_' + uuidv4();
    const url = `https://sim-gateway.local/pay/${linkId}`;
    return {
      url,
      linkId
    };
  }

  async getPaymentStatus(providerPaymentId) {
    const record = this.payments.get(providerPaymentId);
    if (!record) return { status: 'unknown', amount: 0 };
    return record;
  }

  simulateActionOutcome(actionType, probability = 0.5, caseData = null) {
    let effectiveProb = typeof probability === 'number' ? probability : 0.5;
    if (caseData && typeof caseData.recovery_probability === 'number' && (probability === undefined || probability === null)) {
      effectiveProb = caseData.recovery_probability;
    }

    effectiveProb = Math.min(0.95, Math.max(0.05, effectiveProb));
    const success = Math.random() < effectiveProb;

    let details = '';
    if (success) {
      switch (actionType) {
        case 'discount':
          details = 'Customer accepted the discount incentive and completed payment.';
          break;
        case 'email':
          details = 'Customer opened recovery email and updated payment method.';
          break;
        case 'sms':
          details = 'Customer followed SMS link and cleared pending invoice.';
          break;
        case 'payment_link':
          details = 'Customer accessed direct payment link and submitted payment.';
          break;
        case 'cart_reminder':
          details = 'Customer returned to checkout via reminder and completed purchase.';
          break;
        case 'free_shipping':
          details = 'Customer accepted free shipping incentive and completed order.';
          break;
        case 'targeted_campaign':
          details = 'Customer converted through targeted recovery campaign.';
          break;
        case 'escalate':
          details = 'Account executive contacted customer and resolved billing discrepancy.';
          break;
        default:
          details = `Action '${actionType}' executed successfully with positive outcome.`;
          break;
      }
    } else {
      switch (actionType) {
        case 'discount':
          details = 'Discount offer was sent but customer did not convert.';
          break;
        case 'email':
          details = 'Recovery email delivered but no payment update received.';
          break;
        case 'sms':
          details = 'SMS sent but customer did not click recovery link.';
          break;
        case 'payment_link':
          details = 'Payment link generated but remained unpaid.';
          break;
        case 'cart_reminder':
          details = 'Cart reminder delivered without customer conversion.';
          break;
        case 'free_shipping':
          details = 'Free shipping offered but cart remained abandoned.';
          break;
        case 'targeted_campaign':
          details = 'Targeted campaign delivered without conversion.';
          break;
        case 'escalate':
          details = 'Escalation initiated but customer could not be reached.';
          break;
        default:
          details = `Action '${actionType}' executed but did not lead to recovery.`;
          break;
      }
    }

    return {
      success,
      details
    };
  }
}

export const MockPaymentProvider = SimulationProvider;

let instance = null;
export function getSimulationProvider() {
  if (!instance) instance = new SimulationProvider();
  return instance;
}
