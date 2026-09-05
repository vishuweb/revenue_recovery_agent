'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '../page';
import { useToast } from '../components/ToastContext';
import { AgentActivityPanel } from '../components/AgentActivityPanel';
import { CsvQuickImportCard } from '../components/CsvQuickImportCard';
import {
  IconSimulator,
  IconZap,
  IconRefresh,
  IconWarning,
  IconCoins,
  IconSuccess,
  IconCard
} from '../components/Icons';

// A case id can surface in several shapes depending on which API path
// produced it (webhook route returns it top-level; trigger_scenario wraps
// it inside case.cases[0]; trigger_agent_case spreads the agent result).
// Never invents one — returns null when the response genuinely has none
// (e.g. bulk/cron/seed actions that don't create a single case).
function extractCaseId(data) {
  if (!data) return null;
  return (
    data.caseId ||
    data.case?.id ||
    data.case?.cases?.[0]?.caseId ||
    data.case?.cases?.[0]?.id ||
    data.cases?.[0]?.caseId ||
    null
  );
}

export default function SimulatorPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [lastCaseId, setLastCaseId] = useState(null);
  const [metrics, setMetrics] = useState(null);

  const refreshMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/metrics');
      if (!res.ok) return;
      const data = await res.json();
      setMetrics(data);
    } catch {
      // Metrics strip is a convenience overlay — silently skip on failure,
      // never block or error out the simulator itself over it.
    }
  }, []);

  useEffect(() => {
    refreshMetrics();
    const interval = setInterval(refreshMetrics, 8000);
    return () => clearInterval(interval);
  }, [refreshMetrics]);

  const finishAction = (data) => {
    setLastResult(data);
    setLastCaseId(extractCaseId(data));
    refreshMetrics();
  };

  const handleCommand = async (command, params = {}) => {
    setLoading(true);
    setActiveAction(params.scenario || command);
    toast.info(`Simulating ${params.scenario || command}...`);
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, params })
      });
      const data = await res.json();
      if (res.ok) {
        finishAction(data);
        toast.success(`Simulation completed! ${data.message || ''}`);
      } else {
        toast.error(data.error || 'Simulation failed');
      }
    } catch {
      toast.error('Network failure connecting to simulation engine');
    } finally {
      setLoading(false);
      setActiveAction(null);
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

      // If not live checkout (no keys configured), handle simulated payment seamlessly
      if (!orderData.isLiveCheckout || !orderData.keyId || orderData.keyId.includes('mock')) {
        toast.info('Simulating Checkout in Sandbox Mode (Add RAZORPAY_KEY_ID in .env.local for live modal)...');
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
        setLastResult({
          mode: 'simulated_sandbox',
          order: orderData,
          settlement: verifyData,
          instructions: 'To test the live Razorpay Checkout popup, add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.local'
        });
        toast.success(`Simulated payment of ₹${amountInRupees} verified and settled!`);
        return;
      }

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
        toast.warning('Razorpay Checkout SDK not reachable.');
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
          const webhookRes = await fetch('/api/webhooks/simulate', {
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
    setActiveAction(eventType);
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

      const res = await fetch('/api/webhooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      finishAction(data);
      if (res.ok) {
        toast.success(`Webhook '${eventType}' processed by Recovery Agent!`);
      } else {
        toast.error(data.error || 'Webhook failed');
      }
    } catch {
      toast.error('Failed to dispatch webhook');
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  const scenarios = [
    {
      id: 'temporary_failure',
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
      id: 'high_value_failure',
      name: 'High-Value Enterprise Account Failure ($5,000+ MRR)',
      desc: 'Simulates payment failure on an Enterprise Tier customer. Engine should flag P0 Priority and prepare immediate dedicated account manager concierge escalation.',
      color: '#fb7185',
      badge: 'P0 Critical'
    },
    {
      id: 'checkout_abandoned',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleCommand('seed')}
            disabled={loading}
          >
            <IconCoins size={14} />
            <span>Re-seed Dataset</span>
          </button>
          <div style={{ width: '320px', maxWidth: '100%' }}>
            <CsvQuickImportCard />
          </div>
        </div>
      </div>

      {/* Live metrics strip — reflects the same backend metrics endpoint the
          dashboard uses, polled so results from simulator/CSV actions show
          up here without a manual refresh. */}
      {metrics && metrics.enabled !== false && (
        <div className="grid-cols-4" style={{ marginBottom: '24px', gap: '12px' }}>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '10.5px', color: '#8e9ba9', marginBottom: '4px' }}>Cases</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{metrics.casesProcessed ?? '—'}</div>
          </div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '10.5px', color: '#8e9ba9', marginBottom: '4px' }}>Amount at Risk</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#fb7185' }}>{formatCurrency(metrics.totalRevenueAtRisk || 0)}</div>
          </div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '10.5px', color: '#8e9ba9', marginBottom: '4px' }}>Revenue Recovered</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#00FFF5' }}>{formatCurrency(metrics.totalRecovered || 0)}</div>
          </div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '10.5px', color: '#8e9ba9', marginBottom: '4px' }}>Recovery Rate</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{(metrics.recoveryRate || 0).toFixed(1)}%</div>
          </div>
        </div>
      )}

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
              <span>{activeAction === 'payment.failed' ? 'Running Agent...' : 'Fire payment.failed Webhook'}</span>
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
              <span>{activeAction === 'payment.captured' ? 'Running Agent...' : 'Fire payment.captured Webhook'}</span>
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
                  <span>{activeAction === sc.id ? 'Running Agent...' : 'Trigger Scenario'}</span>
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

      {/* Autonomous LangGraph Agent */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
          Autonomous Agent (LangGraph + AI)
        </h3>
        <p style={{ fontSize: '12.5px', color: '#8e9ba9', marginBottom: '14px' }}>
          Runs the bounded agent loop — detect → analyze → score → decide → policy gate → execute → observe → learn — with its own audit trail and long-term memory, instead of the deterministic pipeline above.
        </p>
        <div className="grid-cols-2">
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">
                  <IconZap size={16} color="#00FFF5" />
                  <span>Run Single Case via Agent</span>
                </h3>
                <p className="card-subtitle">Create one failed payment and hand it to the LangGraph agent, start to finish</p>
              </div>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => handleCommand('trigger_agent_case')}
              disabled={loading}
            >
              <IconZap size={14} />
              <span>Run via Agent</span>
            </button>
          </div>

          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">
                  <IconSimulator size={16} color="#00FFF5" />
                  <span>Batch Agent Simulation</span>
                </h3>
                <p className="card-subtitle">20 varied cases through the agent — measurable recovered revenue, clearly labeled simulated</p>
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                setLoading(true);
                setActiveAction('batch');
                toast.info('Running 20 cases through the autonomous agent...');
                try {
                  const res = await fetch('/api/agent/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ count: 20 })
                  });
                  const data = await res.json();
                  if (res.ok) {
                    finishAction(data);
                    toast.success(`Batch complete: ${data.summary?.recoveredCount || 0} recovered, ${data.summary?.escalatedCount || 0} escalated, ${data.summary?.stoppedCount || 0} stopped`);
                  } else {
                    toast.error(data.error || 'Batch simulation failed');
                  }
                } catch {
                  toast.error('Network failure connecting to agent batch endpoint');
                } finally {
                  setLoading(false);
                  setActiveAction(null);
                }
              }}
              disabled={loading}
            >
              <IconRefresh size={14} />
              <span>{activeAction === 'batch' ? 'Running Agent...' : 'Run 20-Case Batch'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Agent Activity — the real, backend-produced decision trail for the
          most recently created case. Never an independent animation: this
          component fetches and reveals actual persisted state. */}
      {lastResult && lastCaseId && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginBottom: '14px' }}>
            Agent Activity
          </h3>
          <AgentActivityPanel
            key={lastCaseId}
            caseId={lastCaseId}
            amountAtRisk={lastResult.case?.cases?.[0]?.amount || lastResult.amount}
            failureReason={lastResult.case?.cases?.[0]?.failure_reason || lastResult.failureReason}
          />
        </div>
      )}

      {/* Fallback telemetry for actions that don't create a single case
          (seed, bulk scenarios, pipeline sweep, batch run) — still real
          backend output, just not shaped for the per-case activity panel. */}
      {lastResult && !lastCaseId && (
        <div className="card card-elevated">
          <div className="card-header">
            <h3 className="card-title">
              <IconSuccess size={16} color="#00FFF5" />
              <span>Simulation Execution Telemetry</span>
            </h3>
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