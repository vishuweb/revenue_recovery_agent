import { PaymentProvider } from './base.js';
import { getSimulationProvider, SimulationProvider, MockPaymentProvider } from './simulation.js';
import { getRazorpayProvider, RazorpayProvider } from './razorpay.js';

export {
  PaymentProvider,
  SimulationProvider,
  MockPaymentProvider,
  RazorpayProvider,
  getSimulationProvider,
  getRazorpayProvider
};

/**
 * Returns the appropriate payment provider.
 * If preference is 'razorpay' or (preference is 'auto' and RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET are set),
 * returns RazorpayProvider. Otherwise falls back to SimulationProvider.
 *
 * @param {'auto' | 'razorpay' | 'simulation' | 'mock'} [preference='auto']
 */
export function getPaymentProvider(preference = 'auto') {
  const hasRazorpayKeys = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

  if (preference === 'razorpay' || (preference === 'auto' && hasRazorpayKeys)) {
    return getRazorpayProvider();
  }

  return getSimulationProvider();
}
