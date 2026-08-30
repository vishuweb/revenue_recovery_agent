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
  IconChevronRight
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
          <h1 className="hero-title">Scenario Simulator</h1>
          <p className="hero-subtitle">
            Inject synthetic payment failures, run batch simulations, and observe autonomous classification in real-time.
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