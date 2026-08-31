export class PaymentProvider {
  async retryPayment(paymentId, amount, customerId, caseData = null) {
    throw new Error('Not implemented');
  }

  async createPaymentLink(customerId, amount, description, options = {}) {
    throw new Error('Not implemented');
  }

  async getPaymentStatus(providerPaymentId) {
    throw new Error('Not implemented');
  }
}
