import { PaymentProvider } from './provider.js';
import { v4 as uuidv4 } from 'uuid';

class SimulationProvider extends PaymentProvider {
  constructor() {
    super();
    this.payments = new Map();
  }

  async retryPayment(paymentId, amount, customerId, caseData = null) {
    let success = false;
    let probability = 0.5; // default

    if (caseData && caseData.recovery_probability) {
      probability = caseData.recovery_probability;
      
      if (caseData.attempts_made === 0) probability *= 0.6; // first retry often fails
      else if (caseData.attempts_made === 1) probability *= 1.2; 
    }

    if (Math.random() < probability) {
      success = true;
    }

    const providerPaymentId = 'sim_pay_' + uuidv4();
    this.payments.set(providerPaymentId, {
      status: success ? 'success' : 'failed',
      amount
    });

    return {
      success,
      providerPaymentId,
      failureReason: success ? null : 'card_declined'
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
}

let instance = null;
export function getSimulationProvider() {
  if (!instance) instance = new SimulationProvider();
  return instance;
}
