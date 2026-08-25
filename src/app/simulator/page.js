'use client';

import { useState } from 'react';
import { formatCurrency } from '../page';
import { useToast } from '../components/ToastContext';
import {
  IconCard,
  IconClock,
  IconWarning,
  IconSuccess,
  IconZap,
  IconRefresh,
  IconSimulator,
  IconRupee,
  IconCoins,
  IconInvoice,
  IconChevronRight
} from '../components/Icons';

export default function SimulatorPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [bulkCount, setBulkCount] = useState(5);
  const [activeTab, setActiveTab] = useState('all');

  const handleCommand = async (command, params = {}) => {
    setLoading(true);
    toast.info(`Executing simulation: ${command}...`);
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, params })
      });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        toast.success('Simulation executed successfully.');
      } else {
        toast.error(data.error || 'Simulation returned an error');
      }
    } catch (e) {
      console.error(e);
      setResult({ error: e.message });
      toast.error(`Simulation failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const scenarios = [
    {
      title: 'Temporary Insufficient Funds',
      desc: 'Temporary soft decline code. Engine computes recovery probability via smart retry delay.',
      type: 'temporary',
      category: 'card',
      icon: IconCard,
      badge: 'Soft Decline'
    },
    {
      title: 'Chronic Failure Over Time',
      desc: 'Multiple consecutive payment attempts failed. Requires analyst escalation or personalized outreach.',
      type: 'chronic',
      category: 'card',
      icon: IconClock,
      badge: 'High Risk'
    },
    {
      title: 'Enterprise High-Value Alert',
      desc: 'Tier-1 enterprise invoice failure (> ₹50,000). Priority P0 status assigned for urgent intervention.',
      type: 'high_value',
      category: 'card',
      icon: IconCoins,
      badge: 'Enterprise P0'
    },
    {
      title: 'Expired Card Hard Decline',
      desc: 'Card expiration date passed. Initiates automated self-serve payment update link with tokenization.',
      type: 'expired_card',
      category: 'card',
      icon: IconWarning,
      badge: 'Hard Decline'
    },
    {
      title: 'Checkout Abandoned',
      desc: 'Customer dropped off at payment step. Sends gentle reminder with courtesy concession.',
      type: 'checkout_abandoned',
      category: 'event',
      command: 'trigger_event',
      paramKey: 'eventType',
      icon: IconInvoice,
      badge: 'Dropoff'
    },
    {
      title: 'Authentication Session Timeout',
      desc: 'Payment authentication OTP timed out. Triggers instant retry link with preserved session.',
      type: 'checkout_timeout',
      category: 'event',
      command: 'trigger_event',
      paramKey: 'eventType',
      icon: IconRefresh,
      badge: 'Timeout'
    },
    {
      title: 'Near-Expiry Churn Risk',
      desc: 'Contract or plan nearing renewal threshold. Triggers fast-action outreach to retain account.',
      type: 'near_expiry_inventory',
      category: 'event',
      command: 'trigger_event',
      paramKey: 'eventType',
      icon: IconZap,
      badge: 'Urgent'
    }
  ];

  const filteredScenarios = activeTab === 'all'
    ? scenarios
    : scenarios.filter((s) => s.category === activeTab);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="dashboard-hero">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />Orchestrator Sandbox</div>
          <h1 className="hero-title">Scenario Simulator</h1>
          <p className="hero-subtitle">
            Inject synthetic transaction events, test recovery rule-matching, and simulate customer response outcomes.
          </p>
        </div>
      </div>

      {/* Control Hub & Live Feedback */}
      <div className="grid-cols-3" style={{ marginBottom: '20px' }}>
        {/* Workspace Control Panel */}
        <div className="card card-elevated" style={{ padding: '20px' }}>
          <div className="card-header">
            <h3 className="card-title">
              <IconZap size={16} color="#60a5fa" />
              <span>Sandbox Controls</span>
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Reset & Re-seed Environment
              </label>
              <button
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', marginTop: '6px', justifyContent: 'center' }}
                onClick={() => handleCommand('seed')}
                disabled={loading}
              >
                <IconCoins size={14} />
                <span>Re-seed Dataset</span>
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '12px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Batch Scenario Generator
              </label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <input
                  type="number"
                  className="input"
                  value={bulkCount}
                  onChange={(e) => setBulkCount(Math.max(1, Math.min(50, Number(e.target.value))))}
                  style={{ width: '70px', padding: '6px 10px' }}
                  min="1"
                  max="50"
                />
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => handleCommand('bulk_scenarios', { count: bulkCount })}
                  disabled={loading}
                >
                  <IconZap size={14} />
                  <span>Run {bulkCount} Batch Scenarios</span>
                </button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '12px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Automated Pipeline Sweep
              </label>
              <button
                className="btn btn-primary btn-sm"
                style={{ width: '100%', marginTop: '6px', justifyContent: 'center' }}
                onClick={async () => {
                  setLoading(true);
                  toast.info('Running recovery pipeline sweep...');
                  try {
                    const res = await fetch('/api/cron');
                    const data = await res.json();
                    setResult(data);
                    toast.success('Pipeline sweep completed successfully.');
                  } catch (err) {
                    setResult({ error: err.message });
                    toast.error('Pipeline execution failed');
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                <IconRefresh size={14} />
                <span>Execute Scheduled Pipeline</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Scenario Outcome Viewer */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header">
            <h3 className="card-title">
              <IconSimulator size={16} color="#60a5fa" />
              <span>Scenario Telemetry & Outcome</span>
            </h3>
            {result?.case && <span className="badge primary">Event Loaded</span>}
          </div>

          {loading ? (
            <div className="skeleton" style={{ height: '220px' }} />
          ) : result ? (
            <div style={{ background: 'var(--surface-color)', padding: '16px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              {result.case ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span className="badge warning">
                      Case #{result.case.id?.substring(0, 8)} Created
                    </span>
                    <span className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: '#fb7185' }}>
                      {formatCurrency(result.case.amount_at_risk)}
                    </span>
                  </div>

                  <div style={{ background: 'var(--card-color)', border: '1px solid var(--glass-border)', padding: '14px', borderRadius: '8px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        DECISION & STRATEGY
                      </span>
                      <span className="badge primary">{result.case.recommended_action || 'Smart Dunning'}</span>
                    </div>
                    <p style={{ fontSize: '12.5px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                      {result.case.ai_reasoning || 'Automated recovery evaluation complete.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                      Simulate customer behavioral response:
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#34d399' }}
                        onClick={() => handleCommand('simulate_recovery', { caseId: result.case.id })}
                      >
                        <IconSuccess size={13} />
                        <span>Customer Paid</span>
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#fb7185' }}
                        onClick={() => handleCommand('simulate_failure', { caseId: result.case.id })}
                      >
                        <IconWarning size={13} />
                        <span>Decline Again</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <pre className="font-mono" style={{ maxHeight: '180px', overflow: 'auto', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-dim)', textAlign: 'center' }}>
              <IconSimulator size={28} color="var(--text-dim)" />
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '8px' }}>
                No active scenario triggered
              </p>
              <p style={{ fontSize: '11.5px', marginTop: '2px', color: 'var(--text-dim)' }}>
                Select any scenario below to inject payment failures into the engine.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Scenario Triggers Category Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Scenario Archetypes</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            Choose a decline pattern to dispatch to the orchestrator
          </p>
        </div>

        <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '6px' }}>
          {[
            { id: 'all', label: 'All Patterns' },
            { id: 'card', label: 'Card Declines' },
            { id: 'event', label: 'Cart Events' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: 'none',
                background: activeTab === tab.id ? 'var(--primary-accent)' : 'transparent',
                color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scenario Cards Grid */}
      <div className="grid-cols-4">
        {filteredScenarios.map((s, i) => {
          const IconComponent = s.icon;
          return (
            <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div className="stat-icon-wrapper">
                    <IconComponent size={16} />
                  </div>
                  <span className="badge muted" style={{ fontSize: '10.5px' }}>{s.badge}</span>
                </div>
                <h4 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {s.title}
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5, marginBottom: '14px' }}>
                  {s.desc}
                </p>
              </div>

              <button
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  if (s.command) {
                    handleCommand(s.command, { [s.paramKey]: s.type });
                  } else {
                    handleCommand('trigger_scenario', { scenario: s.type });
                  }
                }}
                disabled={loading}
              >
                <IconZap size={13} />
                <span>Inject Event</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
