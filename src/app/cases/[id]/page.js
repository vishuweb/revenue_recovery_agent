'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '../../page';
import { ProbabilityBar } from '../../components/Charts';
import { CustomerAvatar } from '../../components/CustomerAvatar';
import { useToast } from '../../components/ToastContext';
import {
  IconCopy,
  IconRefresh,//i have to see changes 
  IconZap,
  IconShield,
  IconAudit,
  IconUser,
  IconCard,
  IconWarning,
  IconSuccess,
  IconClock,
  IconDiscount
} from '../../components/Icons';

export default function CaseDetailPage({ params }) {
  const router = useRouter();
  const toast = useToast();
  const unwrappedParams = React.use(params);
  const id = unwrappedParams.id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [agentData, setAgentData] = useState(null);

  const fetchCase = async () => {
    try {
      const res = await fetch(`/api/cases/${id}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.error('Case not found');
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load case');
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentData = async () => {
    try {
      const res = await fetch(`/api/agent/cases/${id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.isAgentCase) setAgentData(json);
      }
    } catch (e) {
      // The agent view is purely additive — silently skip if unavailable.
    }
  };

  useEffect(() => {
    fetchCase();
    fetchAgentData();
  }, [id]);

  const handleRazorpayCheckout = async () => {
    setActionLoading(true);
    toast.info('Initializing Razorpay Checkout session...');
    try {
      const res = await fetch('/api/razorpay/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: c.amount_at_risk,
          customerId: customer?.id,
          caseId: c.id,
          description: `Recovery settlement for Case ${c.id.substring(0, 8)}`
        })
      });

      const orderData = await res.json();
      if (!res.ok) {
        toast.error(orderData.error || 'Failed to initialize order');
        return;
      }

      // If not live checkout (no keys configured), handle simulated payment seamlessly
      if (!orderData.isLiveCheckout || !orderData.keyId || orderData.keyId.includes('mock')) {
        toast.info('Simulating Checkout Settlement (Add RAZORPAY_KEY_ID in .env.local for live modal)...');
        await fetch('/api/razorpay/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpay_order_id: orderData.orderId,
            razorpay_payment_id: `pay_sim_${Date.now()}`,
            razorpay_signature: 'sim_sig',
            caseId: c.id,
            customerId: customer?.id,
            amount: c.amount_at_risk
          })
        });
        toast.success('Simulated Razorpay recovery settled! Case marked as Recovered.');
        await fetchCase();
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
        name: 'Revenue Recovery Agent',
        description: `Case #${c.id.substring(0, 8)} Settlement`,
        order_id: orderData.orderId,
        prefill: {
          name: customer?.name,
          email: customer?.email,
          contact: customer?.phone
        },
        theme: {
          color: '#00ADB4'
        },
        handler: async function (response) {
          toast.info('Verifying Razorpay payment signature...');
          const verifyRes = await fetch('/api/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              caseId: c.id,
              customerId: customer?.id,
              amount: c.amount_at_risk
            })
          });

          if (verifyRes.ok) {
            toast.success('Razorpay payment verified! Case marked as Recovered.');
            await fetchCase();
          } else {
            const err = await verifyRes.json();
            toast.error(err.error || 'Signature verification failed');
          }
        },
        modal: {
          ondismiss: function () {
            toast.info('Razorpay checkout modal closed');
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        toast.error(`Payment failed: ${response.error?.description || 'Declined'}`);
      });
      rzp.open();
    } catch (e) {
      console.error(e);
      toast.error('Failed to launch Razorpay checkout');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAction = async (actionStr) => {
    setActionLoading(true);
    toast.info(`Executing ${actionStr} workflow...`);
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionStr })
      });
      if (res.ok) {
        toast.success(`Action '${actionStr}' executed successfully!`);
        await fetchCase();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Action execution failed');
      }
    } catch {
      toast.error('Network error executing action');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/cases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: noteText })
      });
      if (res.ok) {
        toast.success('Internal note appended to audit log.');
        setNoteText('');
        await fetchCase();
      } else {
        toast.error('Failed to save note.');
      }
    } catch {
      toast.error('Failed to save note.');
    } finally {
      setSavingNote(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard`);
  };

  if (loading || !data) {
    return (
      <div className="animate-fade-in">
        <div className="skeleton" style={{ height: '36px', width: '140px', marginBottom: '16px' }} />
        <div className="skeleton" style={{ height: '90px', marginBottom: '20px' }} />
        <div className="grid-cols-4" style={{ marginBottom: '20px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: '110px' }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: '300px' }} />
      </div>
    );
  }

  const { case: c, customer, actions, auditEntries, payment, subscription } = data;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'recovered':
        return <span className="badge success">Recovered</span>;
      case 'failed':
        return <span className="badge danger">Failed</span>;
      case 'open':
        return <span className="badge warning">Open</span>;
      case 'in_progress':
        return <span className="badge primary">In Progress</span>;
      case 'stopped':
        return <span className="badge muted">Stopped</span>;
      default:
        return <span className="badge muted">{status}</span>;
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => router.push('/cases')}>
          ← Back to Cases
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => copyToClipboard(c.id, 'Case ID')}
            title="Copy Case ID"
          >
            <IconCopy size={13} />
            <span>Copy ID</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={fetchCase}>
            <IconRefresh size={13} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Case Header Banner */}
      <div className="card" style={{ marginBottom: '20px', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <CustomerAvatar name={customer?.name || 'Customer'} size={46} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#ffffff' }}>{customer?.name}</h1>
                <span className="badge primary">{customer?.plan_name || 'Standard Tier'}</span>
                {getStatusBadge(c.status)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', color: '#cbd5e1', fontSize: '12.5px' }}>
                <span>{customer?.company || 'Company'}</span>
                <span>•</span>
                <span>{customer?.email}</span>
                <span>•</span>
                <span className="font-mono" style={{ color: '#5f6d7e' }}>ID: {c.id.substring(0, 8)}</span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#8e9ba9', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Amount At Risk
            </div>
            <div className="font-mono" style={{ fontSize: '24px', fontWeight: 700, color: '#fb7185', marginTop: '2px' }}>
              {formatCurrency(c.amount_at_risk)}
            </div>
          </div>
        </div>
      </div>

      {/* Key Diagnostic Metrics */}
      <div className="grid-cols-4" style={{ marginBottom: '20px' }}>
        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Recovery Probability</span>
            <div className="stat-icon-wrapper">
              <IconShield size={16} />
            </div>
          </div>
          <div style={{ marginTop: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span className="stat-value" style={{ color: '#00FFF5' }}>
                {Math.round((c.recovery_probability || 0.75) * 100)}%
              </span>
              <span style={{ fontSize: '11px', color: '#8e9ba9' }}>confidence</span>
            </div>
            <ProbabilityBar value={c.recovery_probability} />
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Priority Score</span>
            <div className="stat-icon-wrapper">
              <IconZap size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: (c.priority_score || 0) > 70 ? '#fb7185' : '#fbbf24' }}>
            {Math.round(c.priority_score || 0)} <span style={{ fontSize: '13px', color: '#5f6d7e' }}>/ 100</span>
          </span>
          <div className="stat-footer">
            <span>{(c.priority_score || 0) > 70 ? 'P0 Critical Impact' : 'Standard Priority'}</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Retry Cadence</span>
            <div className="stat-icon-wrapper">
              <IconRefresh size={16} />
            </div>
          </div>
          <span className="stat-value">
            {c.attempts_made} <span style={{ fontSize: '13px', color: '#5f6d7e' }}>/ {c.max_attempts || 5}</span>
          </span>
          <div className="stat-footer">
            <span>Attempts completed</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Decline Category</span>
            <div className="stat-icon-wrapper">
              <IconWarning size={16} />
            </div>
          </div>
          <div style={{ marginTop: '6px' }}>
            <span className="badge warning" style={{ fontSize: '11px' }}>
              {c.failure_reason ? c.failure_reason.replace('_', ' ') : 'insufficient_funds'}
            </span>
          </div>
          <div className="stat-footer" style={{ marginTop: '8px' }}>
            <span>Gateway decline code</span>
          </div>
        </div>
      </div>

      {/* Main Analysis and Customer Info Row */}
      <div className="grid-cols-3" style={{ marginBottom: '20px' }}>
        {/* Recovery Decision Engine Card */}
        <div className="card card-elevated" style={{ gridColumn: 'span 2' }}>
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <IconZap size={16} color="#00FFF5" />
                <span>Recovery Execution Strategy</span>
              </h3>
              <p className="card-subtitle">Automated plan calculated based on customer history and decline type</p>
            </div>
            <span className="badge primary">Pipeline Active</span>
          </div>

          <div style={{ background: '#181d26', border: '1px solid #3B3E47', borderRadius: 'var(--border-radius-card)', padding: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', color: '#8e9ba9', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
              Prescribed Intervention
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#00FFF5' }}>
              {c.recommended_action || 'Smart Dunning Sequence with Exponential Delay'}
            </div>
          </div>

          <div style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid #3B3E47', borderRadius: 'var(--border-radius-card)', padding: '16px', marginBottom: '20px' }}>
            <h4 style={{ fontSize: '11.5px', fontWeight: 700, color: '#8e9ba9', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Strategy Rationale
            </h4>
            <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6 }}>
              {c.ai_reasoning || 'Based on customer tenure, payment method error type, and recovery probability model, this tailored notification combined with smart retry scheduling maximizes payment conversion while minimizing churn risk.'}
            </p>
          </div>

          {/* Action Dispatcher Controls */}
          <div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#8e9ba9', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.04em' }}>
              Intervention Controls
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleAction('approve')}
                disabled={actionLoading || c.status === 'recovered' || c.status === 'failed'}
              >
                <IconZap size={14} />
                <span>{actionLoading ? 'Executing...' : 'Approve & Dispatch'}</span>
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleAction('execute')}
                disabled={actionLoading || c.status === 'recovered' || c.status === 'failed'}
              >
                <IconRefresh size={14} />
                <span>Retry Charge Now</span>
              </button>

              {(c.status === 'open' || c.status === 'in_progress') && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleRazorpayCheckout}
                  disabled={actionLoading}
                  style={{ border: '1px solid #00ADB4', color: '#00FFF5' }}
                >
                  <IconCard size={14} />
                  <span>Razorpay Standard Checkout</span>
                </button>
              )}

              {(c.status === 'open' || c.status === 'in_progress') && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleAction('escalate')}
                  disabled={actionLoading}
                >
                  <IconUser size={14} />
                  <span>Escalate to Support</span>
                </button>
              )}

              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleAction('stop')}
                disabled={actionLoading || c.status === 'recovered' || c.status === 'failed'}
              >
                <span>Dismiss Recovery</span>
              </button>
            </div>
          </div>
        </div>

        {/* Customer Profile Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <IconUser size={16} color="#cbd5e1" />
              <span>Customer Telemetry</span>
            </h3>
            {customer && (
              <Link href={`/customers/${customer.id}`} className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }}>
                Profile →
              </Link>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ color: '#8e9ba9', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Account</div>
              <div style={{ fontSize: '13.5px', fontWeight: 600, marginTop: '2px', color: '#ffffff' }}>{customer?.name}</div>
              <div style={{ fontSize: '12px', color: '#5f6d7e' }}>{customer?.company}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ color: '#8e9ba9', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Monthly (MRR)</div>
                <div className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: '#00FFF5', marginTop: '2px' }}>
                  {formatCurrency(customer?.mrr)}
                </div>
              </div>
              <div>
                <div style={{ color: '#8e9ba9', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lifetime Value</div>
                <div className="font-mono" style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px', color: '#ffffff' }}>
                  {formatCurrency(customer?.lifetime_value)}
                </div>
              </div>
            </div>

            <div>
              <div style={{ color: '#8e9ba9', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payment Success History</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: '#00FFF5' }}>
                  {customer?.payment_success_rate || 95}%
                </span>
                <div style={{ flex: 1, height: '6px', background: '#3B3E47', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ width: `${customer?.payment_success_rate || 95}%`, height: '100%', background: 'linear-gradient(90deg, #00ADB4, #00FFF5)' }} />
                </div>
              </div>
            </div>

            {subscription && (
              <div style={{ padding: '10px 12px', background: 'var(--surface-elevated)', border: '1px solid #3B3E47', borderRadius: '8px', fontSize: '12px' }}>
                <div style={{ color: '#8e9ba9' }}>Subscription Plan</div>
                <div style={{ fontWeight: 600, marginTop: '2px', color: '#ffffff' }}>{subscription.plan_id || 'Pro Tier'}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Autonomous Agent Insights — only rendered for cases the LangGraph agent handled */}
      {agentData && (
        <div className="card card-elevated" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <h3 className="card-title">
              <IconZap size={16} color="#00FFF5" />
              <span>Autonomous Agent Insights</span>
            </h3>
            <span className="badge primary">LangGraph + Ollama</span>
          </div>

          <div className="grid-cols-3" style={{ marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#8e9ba9', fontWeight: 600, textTransform: 'uppercase' }}>Loop Result</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
                {agentData.loopSummary?.outcome || 'In progress'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#8e9ba9', fontWeight: 600, textTransform: 'uppercase' }}>Stop Reason</div>
              <div style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '2px' }}>
                {agentData.loopSummary?.stopReason || '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#8e9ba9', fontWeight: 600, textTransform: 'uppercase' }}>Attempts / Iterations</div>
              <div className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: '#00FFF5', marginTop: '2px' }}>
                {agentData.loopSummary?.attempts ?? 0} / {agentData.loopSummary?.iterations ?? 0}
              </div>
            </div>
          </div>

          <div style={{ background: '#181d26', border: '1px solid #3B3E47', borderRadius: 'var(--border-radius-card)', padding: '14px' }}>
            <h4 style={{ fontSize: '11.5px', fontWeight: 700, color: '#8e9ba9', marginBottom: '8px', textTransform: 'uppercase' }}>
              What the agent remembered about this customer
            </h4>
            <p style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.6 }}>
              {agentData.memory?.sampleSize > 0
                ? `${agentData.memory.sampleSize} prior interaction(s). Preferred channel: ${agentData.memory.preferredChannel || 'unknown'}. Previously successful: [${(agentData.memory.priorSuccessfulActions || []).join(', ') || 'none yet'}]. Previously failed: [${(agentData.memory.priorFailedActions || []).join(', ') || 'none'}].`
                : 'No prior history for this customer — this was a cold-start decision based on category-wide strategy effectiveness.'}
            </p>
            {agentData.memory?.topStrategiesForCategory?.length > 0 && (
              <p style={{ fontSize: '12px', color: '#8e9ba9', marginTop: '8px' }}>
                Category-wide top strategies for &apos;{agentData.memory.failureCategory}&apos;: {agentData.memory.topStrategiesForCategory.map((s) => `${s.action} (${s.successRate}%)`).join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Recovery Timeline & Notes Grid */}
      <div className="grid-cols-2" style={{ marginBottom: '20px' }}>
        {/* Recovery Action Steps Timeline */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <IconClock size={16} color="#cbd5e1" />
              <span>Pipeline Execution Timeline</span>
            </h3>
            <span className="badge muted">{actions?.length || 0} events</span>
          </div>

          {actions?.length > 0 ? (
            <div className="timeline">
              {actions.map((a) => (
                <div key={a.id} className="timeline-item">
                  <div className="timeline-indicator">
                    <div className={`timeline-dot ${a.status === 'completed' || a.status === 'executed' ? 'completed' : 'active'}`}>
                      <IconZap size={12} />
                    </div>
                    <div className="timeline-line" />
                  </div>
                  <div className="timeline-content">
                    <div style={{ background: 'var(--surface-elevated)', border: '1px solid #3B3E47', borderRadius: '8px', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#00FFF5' }}>
                          {a.action_type ? a.action_type.replace('_', ' ').toUpperCase() : 'ACTION'}
                        </span>
                        <span className="font-mono" style={{ fontSize: '11px', color: '#5f6d7e' }}>
                          {new Date(a.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                        <span className="badge muted" style={{ fontSize: '10.5px' }}>{a.status}</span>
                        {a.discount_percent && (
                          <span className="badge warning" style={{ fontSize: '10.5px' }}>{a.discount_percent}% courtesy discount</span>
                        )}
                      </div>

                      {a.ai_reasoning && (
                        <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                          {a.ai_reasoning}
                        </p>
                      )}

                      {a.result && (
                        <div className="font-mono" style={{ marginTop: '6px', padding: '6px 8px', background: '#12151d', borderRadius: '6px', fontSize: '11.5px', color: '#5f6d7e' }}>
                          Outcome: {a.result}
                        </div>
                      )}

                      {(() => {
                        try {
                          const details = a.result_details ? JSON.parse(a.result_details) : null;
                          if (details?.url) {
                            return (
                              <div style={{ marginTop: '8px' }}>
                                <a
                                  href={details.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-secondary btn-sm"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#00FFF5' }}
                                >
                                  <span>Open Razorpay Payment Link ↗</span>
                                </a>
                              </div>
                            );
                          }
                        } catch {
                          return null;
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '32px', textAlign: 'center', color: '#8e9ba9' }}>
              No automated outreach actions dispatched yet.
            </div>
          )}
        </div>

        {/* Audit Log & Notes */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <IconAudit size={16} color="#cbd5e1" />
              <span>Case Audit Trail</span>
            </h3>
            <span className="badge info">Immutable</span>
          </div>

          {/* Quick Note Form */}
          <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input
              type="text"
              className="input"
              placeholder="Add internal operator note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary btn-sm" type="submit" disabled={savingNote || !noteText.trim()}>
              {savingNote ? 'Saving...' : 'Add Note'}
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto' }}>
            {auditEntries?.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #3B3E47',
                  borderRadius: '8px',
                  background: 'var(--surface-elevated)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span className="badge primary" style={{ fontSize: '10.5px' }}>{entry.event_type}</span>
                  <span className="font-mono" style={{ fontSize: '11px', color: '#5f6d7e' }}>
                    {new Date(entry.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#ffffff', marginTop: '4px' }}>{entry.description}</p>
                <div style={{ fontSize: '10.5px', color: '#5f6d7e', marginTop: '4px' }}>
                  Actor: <strong style={{ color: '#cbd5e1' }}>{entry.actor}</strong>
                </div>
              </div>
            ))}
            {(!auditEntries || auditEntries.length === 0) && (
              <div style={{ padding: '24px', textAlign: 'center', color: '#8e9ba9' }}>
                No audit entries recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}