export class PaymentProvider {
  async retryPayment(paymentId, amount, customerId) {
    throw new Error('Not implemented');
  }

  async createPaymentLink(customerId, amount, description) {
    throw new Error('Not implemented');
  }

  async getPaymentStatus(providerPaymentId) {
    throw new Error('Not implemented');
  }
}
