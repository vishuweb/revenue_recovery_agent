'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '../page';
import { useToast } from '../components/ToastContext';
import {
  IconSimulator,
  IconZap,
  IconRefresh,
  IconWarning,
  IconCoins,
  IconSuccess,
  IconShield,
  IconChevronRight,
  IconCard
} from '../components/Icons';

export default function SimulatorPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const handleCommand = async (command, params = {}) => {
    setLoading(true);
    toast.info(`Simulating ${params.scenario || command}...`);
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, params })
      });
      const data = await res.json();
      if (res.ok) {
        setLastResult(data);
        toast.success(`Simulation completed! ${data.message || ''}`);
      } else {
        toast.error(data.error || 'Simulation failed');
      }
    } catch {
      toast.error('Network failure connecting to simulation engine');
    } finally {
      setLoading(false);
    }
  };

  const handleRazorpayTestCheckout = async (amountInRupees = 499) => {
    setLoading(true);
    toast.info('Creating Razorpay order...');
    try {
      const res = await fetch('/api/razorpay/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountInRupees * 100,
          currency: 'INR',
          description: 'Sandbox Test Payment'
        })
      });

      const orderData = await res.json();
      if (!res.ok) {
        toast.error(orderData.error || 'Failed to create order');
        return;
      }

      setLastResult(orderData);

      const loadScript = (src) => {
        return new Promise((resolve) => {
          if (document.querySelector(`script[src="${src}"]`)) {
            resolve(true);
            return;
          }
          const script = document.createElement('script');
          script.src = src;
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
      };

      const scriptLoaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      if (!scriptLoaded || typeof window.Razorpay === 'undefined') {
        toast.warning('Razorpay Checkout script not reachable. Simulated verify dispatched.');
        const verifyRes = await fetch('/api/razorpay/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpay_order_id: orderData.orderId,
            razorpay_payment_id: `pay_sim_${Date.now()}`,
            razorpay_signature: 'sim_sig',
            amount: amountInRupees * 100
          })
        });
        const verifyData = await verifyRes.json();
        setLastResult(verifyData);
        toast.success('Simulated checkout settlement recorded!');
        return;
      }

      const options = {
        key: orderData.keyId || 'rzp_test_mock',
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'Revenue Recovery Sandbox',
        description: 'Test Mode Checkout Transaction',
        order_id: orderData.orderId,
        prefill: {
          name: 'Demo Merchant',
          email: 'merchant@example.com',
          contact: '+919999999999'
        },
        theme: {
          color: '#00ADB4'
        },
        handler: async function (response) {
          toast.info('Verifying test payment signature...');
          const verifyRes = await fetch('/api/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount: amountInRupees * 100
            })
          });

          const verifyData = await verifyRes.json();
          setLastResult(verifyData);
          if (verifyRes.ok) {
            toast.success('Razorpay Test Payment verified & logged!');
          } else {
            toast.error(verifyData.error || 'Verification failed');
          }
        },
        modal: {
          ondismiss: function () {
            toast.info('Razorpay checkout window closed');
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', async function (response) {
        toast.error(`Razorpay Checkout Failed: ${response.error?.description || 'Declined'}`);
        try {
          const webhookRes = await fetch('/api/webhooks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'payment.failed',
              payload: {
                payment: {
                  entity: {
                    id: response.error?.metadata?.payment_id || `pay_fail_${Date.now()}`,
                    amount: amountInRupees * 100,
                    currency: 'INR',
                    status: 'failed',
                    error_code: response.error?.code || 'BAD_REQUEST_ERROR',
                    error_reason: response.error?.reason || 'payment_failed',
                    notes: { source: 'standard_web_checkout_failure' }
                  }
                }
              }
            })
          });
          const webhookData = await webhookRes.json();
          setLastResult(webhookData);
          toast.info('Dispatched payment.failed event to Recovery Engine.');
        } catch (e) {
          console.error(e);
        }
      });

      rzp.open();
    } catch (e) {
      console.error(e);
      toast.error('Failed to launch Razorpay checkout');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulateWebhook = async (eventType) => {
    setLoading(true);
    toast.info(`Sending ${eventType} webhook...`);
    try {
      const paymentId = `pay_rzp_${Date.now()}`;
      const payload = {
        event: eventType,
        payload: {
          payment: {
            entity: {
              id: paymentId,
              amount: 299900,
              currency: 'INR',
              status: eventType === 'payment.captured' ? 'captured' : 'failed',
              method: 'card',
              error_code: eventType === 'payment.failed' ? 'card_declined' : null,
              error_reason: eventType === 'payment.failed' ? 'insufficient_funds' : null,
              notes: {
                customer_name: 'Test Customer',
                source: 'razorpay_webhook_test'
              }
            }
          }
        }
      };

      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setLastResult(data);
      if (res.ok) {
        toast.success(`Webhook '${eventType}' processed by Recovery Agent!`);
      } else {
        toast.error(data.error || 'Webhook failed');
      }
    } catch {
      toast.error('Failed to dispatch webhook');
    } finally {
      setLoading(false);
    }
  };

  const scenarios = [
    {
      id: 'temporary',
      name: 'Temporary Insufficient Funds (Soft Decline)',
      desc: 'Simulates a transient debit card balance deficiency. Engine should prescribe exponential backoff retry aligned with banking deposit windows.',
      color: '#00FFF5',
      badge: 'Soft Decline'
    },
    {
      id: 'expired_card',
      name: 'Expired Card / Invalid Token (Hard Decline)',
      desc: 'Simulates an expired card token. Engine should halt charge retries and dispatch self-service payment update link with high-touch email.',
      color: '#f59e0b',
      badge: 'Hard Decline'
    },
    {
      id: 'high_value',
      name: 'High-Value Enterprise Account Failure ($5,000+ MRR)',
      desc: 'Simulates payment failure on an Enterprise Tier customer. Engine should flag P0 Priority and prepare immediate dedicated account manager concierge escalation.',
      color: '#fb7185',
      badge: 'P0 Critical'
    },
    {
      id: 'cart_abandoned',
      name: 'Checkout Session / 3DS OTP Dropoff',
      desc: 'Simulates customer dropping out during 3D-Secure authentication. Engine should trigger an abandoned checkout incentive workflow.',
      color: '#38bdf8',
      badge: 'Dropoff'
    }
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="dashboard-hero">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />Orchestrator Sandbox</div>
          <h1 className="hero-title">Scenario Simulator & Gateway Sandbox</h1>
          <p className="hero-subtitle">
            Inject synthetic payment failures, trigger live Razorpay Standard Web Checkout, and observe real-time autonomous recovery decisions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleCommand('seed')}
            disabled={loading}
          >
            <IconCoins size={14} />
            <span>Re-seed Dataset</span>
          </button>
        </div>
      </div>

      {/* Razorpay Standard Web Checkout Sandbox Section */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginBottom: '14px' }}>
          Razorpay Standard Web Checkout & Webhooks
        </h3>

        <div className="grid-cols-3">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="badge primary" style={{ color: '#00FFF5' }}>Standard Checkout</span>
                <span className="font-mono" style={{ fontSize: '11px', color: '#5f6d7e' }}>Test Mode</span>
              </div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
                Launch Razorpay Modal
              </h4>
              <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                Creates a test Razorpay order and opens the official Standard Web Checkout modal. Test successful and failing cards interactively.
              </p>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleRazorpayTestCheckout(499)}
              disabled={loading}
            >
              <IconCard size={14} />
              <span>Launch Test Checkout (₹499)</span>
            </button>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="badge danger">Decline Event</span>
                <span className="font-mono" style={{ fontSize: '11px', color: '#5f6d7e' }}>Webhook</span>
              </div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
                Simulate payment.failed
              </h4>
              <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                Delivers an authentic Razorpay failure webhook. Exercises signature validation, idempotency, classifier, NEV optimizer, and case creation.
              </p>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleSimulateWebhook('payment.failed')}
              disabled={loading}
              style={{ border: '1px solid rgba(244, 63, 94, 0.4)', color: '#fb7185' }}
            >
              <IconWarning size={14} />
              <span>Fire payment.failed Webhook</span>
            </button>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="badge success">Recovery Event</span>
                <span className="font-mono" style={{ fontSize: '11px', color: '#5f6d7e' }}>Webhook</span>
              </div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
                Simulate payment.captured
              </h4>
              <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                Delivers a Razorpay payment capture webhook. Automatically links to active recovery cases, resolves debt, and classifies revenue attribution.
              </p>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleSimulateWebhook('payment.captured')}
              disabled={loading}
              style={{ border: '1px solid #00ADB4', color: '#00FFF5' }}
            >
              <IconSuccess size={14} />
              <span>Fire payment.captured Webhook</span>
            </button>
          </div>
        </div>
      </div>

      {/* Scenario Archetypes Grid */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginBottom: '14px' }}>
          Inject Failure Archetypes
        </h3>

        <div className="grid-cols-2">
          {scenarios.map((sc) => (
            <div
              key={sc.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span className="badge primary" style={{ color: sc.color }}>{sc.badge}</span>
                  <span className="font-mono" style={{ fontSize: '11px', color: '#5f6d7e' }}>scenario::{sc.id}</span>
                </div>
                <h4 style={{ fontSize: '14.5px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>{sc.name}</h4>
                <p style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.5 }}>{sc.desc}</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #3B3E47', paddingTop: '14px' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleCommand('trigger_scenario', { scenario: sc.id })}
                  disabled={loading}
                >
                  <IconZap size={14} />
                  <span>Trigger Scenario</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Batch Simulation & Sweeper */}
      <div className="grid-cols-2" style={{ marginBottom: '24px' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <IconSimulator size={16} color="#00FFF5" />
                <span>Bulk Scenario Injection</span>
              </h3>
              <p className="card-subtitle">Inject 5 randomized realistic payment failure cases across customer tiers</p>
            </div>
          </div>
          <p style={{ fontSize: '12.5px', color: '#cbd5e1', marginBottom: '16px', lineHeight: 1.5 }}>
            Populate your triage queue with a representative blend of soft declines, expired credit cards, and enterprise churn risks.
          </p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleCommand('bulk_scenarios', { count: 5 })}
            disabled={loading}
          >
            <IconZap size={14} />
            <span>Generate 5 Bulk Cases</span>
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <IconRefresh size={16} color="#00FFF5" />
                <span>Execute Batch Pipeline Sweep</span>
              </h3>
              <p className="card-subtitle">Run the autonomous cron engine across all pending cases</p>
            </div>
          </div>
          <p style={{ fontSize: '12.5px', color: '#cbd5e1', marginBottom: '16px', lineHeight: 1.5 }}>
            Simulates a scheduled cron job evaluating exponential retry readiness, sending dunning emails, and resolving settled cases.
          </p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleCommand('run_cron')}
            disabled={loading}
          >
            <IconRefresh size={14} />
            <span>Execute Pipeline Sweep</span>
          </button>
        </div>
      </div>

      {/* Simulation Result Output */}
      {lastResult && (
        <div className="card card-elevated">
          <div className="card-header">
            <h3 className="card-title">
              <IconSuccess size={16} color="#00FFF5" />
              <span>Simulation Execution Telemetry</span>
            </h3>
            {lastResult.case?.id && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => router.push(`/cases/${lastResult.case.id}`)}
              >
                <span>View Generated Case</span>
                <IconChevronRight size={13} />
              </button>
            )}
          </div>

          <div style={{ background: '#12151d', border: '1px solid #3B3E47', borderRadius: '8px', padding: '14px', overflowX: 'auto' }}>
            <pre className="font-mono" style={{ fontSize: '12px', color: '#00FFF5', margin: 0 }}>
              {JSON.stringify(lastResult, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}