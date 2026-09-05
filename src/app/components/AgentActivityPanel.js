'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '../page';
import {
  IconZap, IconSuccess, IconWarning, IconShield, IconUser, IconClock,
  IconRefresh, IconChevronRight,
} from './Icons';

const OUTCOME_META = {
  RECOVERED: { icon: '🎉', label: 'REVENUE RECOVERED', color: '#00FFF5', bg: 'rgba(0,255,245,0.08)' },
  STOPPED: { icon: '⏹', label: 'RECOVERY STOPPED', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
  ESCALATE: { icon: '⚠', label: 'HUMAN APPROVAL REQUIRED', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)' },
  RETRYABLE: { icon: '⏳', label: 'RECOVERY PAUSED', color: '#38bdf8', bg: 'rgba(56,189,248,0.08)' },
  FAILED: { icon: '⏹', label: 'RECOVERY FAILED', color: '#fb7185', bg: 'rgba(251,113,133,0.08)' },
};

/**
 * Reveals the REAL, already-persisted decision steps for one case with a
 * short staged pace (readability, not fabrication — the backend call that
 * produced this data already completed by the time this component
 * mounts; nothing here is invented or advanced independently of it).
 * Sourced entirely from /api/agent/cases/[id] (built once, reused by the
 * dashboard's case detail page too) — falls back to the plain /api/cases
 * endpoint when the case wasn't processed by the LangGraph agent, so this
 * panel is never blank regardless of which pipeline handled it.
 */
export function AgentActivityPanel({ caseId, amountAtRisk, failureReason, onError }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [agentData, setAgentData] = useState(null);
  const [fallbackCase, setFallbackCase] = useState(null);
  const [revealCount, setRevealCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setRevealCount(0);

    async function load() {
      try {
        const res = await fetch(`/api/agent/cases/${caseId}`);
        if (!res.ok) throw new Error(`Agent case lookup failed (${res.status})`);
        const json = await res.json();
        if (cancelled) return;

        if (json.isAgentCase) {
          setAgentData(json);
          setStatus('ready');
        } else {
          // Not processed by the LangGraph agent (e.g. RECOVERY_ENGINE isn't
          // 'agent') — fall back to the plain case record rather than a blank panel.
          const caseRes = await fetch(`/api/cases/${caseId}`);
          if (!caseRes.ok) throw new Error('Case not found');
          const caseJson = await caseRes.json();
          if (cancelled) return;
          setFallbackCase(caseJson);
          setStatus('ready');
        }
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err.message || 'Failed to load agent activity');
        setStatus('error');
        onError?.(err);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [caseId]);

  // Staged reveal of the already-real steps, for readability.
  useEffect(() => {
    if (status !== 'ready' || !agentData?.steps?.length) return;
    setRevealCount(0);
    let i = 0;
    timerRef.current = setInterval(() => {
      i += 1;
      setRevealCount(i);
      if (i >= agentData.steps.length) clearInterval(timerRef.current);
    }, 260);
    return () => clearInterval(timerRef.current);
  }, [status, agentData]);

  if (status === 'error') {
    return (
      <div className="card" style={{ borderColor: 'rgba(251,113,133,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fb7185', marginBottom: '6px' }}>
          <IconWarning size={16} />
          <strong>Recovery execution failed to load</strong>
        </div>
        <p style={{ fontSize: '12.5px', color: '#8e9ba9' }}>{errorMsg}</p>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="card card-elevated">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <span className="badge primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <IconZap size={13} /> RECOVERY AGENT ACTIVE
          </span>
        </div>
        <div style={{ fontSize: '14px', color: '#ffffff', marginBottom: '10px' }}>
          {formatCurrency(amountAtRisk)} · {(failureReason || '').replace(/_/g, ' ')}
        </div>
        <div className="skeleton" style={{ height: '14px', width: '70%', marginBottom: '8px' }} />
        <div className="skeleton" style={{ height: '14px', width: '50%' }} />
      </div>
    );
  }

  // ---- Deterministic-engine fallback (no LangGraph data available) ----
  if (fallbackCase) {
    const c = fallbackCase.case || fallbackCase;
    return (
      <div className="card card-elevated">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span className="badge muted">Deterministic Engine</span>
          <span style={{ fontSize: '11px', color: '#8e9ba9' }}>RECOVERY_ENGINE is not set to &quot;agent&quot; — this case ran the original NEV/policy pipeline, not LangGraph.</span>
        </div>
        <h4 style={{ fontSize: '15px', color: '#fff', marginBottom: '6px' }}>RECOVERY DECISION</h4>
        <p style={{ fontSize: '12.5px', color: '#cbd5e1', marginBottom: '4px' }}>Strategy: <strong style={{ color: '#00FFF5' }}>{c.recommended_action}</strong></p>
        <p style={{ fontSize: '12.5px', color: '#cbd5e1', marginBottom: '10px' }}>Reason: {c.ai_reasoning}</p>
        <Link href={`/cases/${c.id}`} className="btn btn-primary btn-sm">
          <span>View Full Case</span><IconChevronRight size={13} />
        </Link>
      </div>
    );
  }

  const { case: c, steps, memory, memoryProof, loopSummary } = agentData;
  const revealedSteps = steps.slice(0, revealCount);
  const stillRevealing = revealCount < steps.length;
  const outcome = loopSummary?.outcome || (c.status === 'recovered' ? 'RECOVERED' : null);
  const meta = OUTCOME_META[outcome] || OUTCOME_META.STOPPED;

  // Real memory signal only — never rendered on an empty/absent memory object.
  const hasMemory = memory && (memory.sampleSize > 0 || memory.priorSuccessfulActions?.length || memory.priorFailedActions?.length);

  // Real policy signal from the persisted steps.
  const policyStep = [...steps].reverse().find((s) => s.step === 'policy_result');

  return (
    <div className="card card-elevated" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="badge primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <IconZap size={13} /> RECOVERY AGENT ACTIVE
          </span>
          <span className="badge muted" style={{ fontSize: '10px' }}>LangGraph</span>
        </div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
          {formatCurrency(c.amount_at_risk)} · {(c.failure_reason || '').replace(/_/g, ' ')}
        </div>
      </div>

      {/* Step-by-step LangGraph timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {revealedSteps.map((s, i) => (
          <div key={`${s.step}-${i}`} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '5px 0' }}>
            <div style={{ width: '18px', flexShrink: 0, textAlign: 'center', paddingTop: '1px' }}>
              {i === revealedSteps.length - 1 && stillRevealing
                ? <span style={{ color: '#00FFF5' }} className="agent-spin-icon">⟳</span>
                : <span style={{ color: '#00FFF5' }}>✓</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>{s.label}</span>
                <span className="badge" style={{ fontSize: '9px', background: s.aiAssisted ? 'rgba(251,191,36,0.12)' : 'rgba(148,163,184,0.12)', color: s.aiAssisted ? '#fbbf24' : '#94a3b8' }}>
                  {s.aiAssisted ? 'AI-assisted' : 'Deterministic'}
                </span>
              </div>
              {s.explanation && <p style={{ fontSize: '11.5px', color: '#8e9ba9', marginTop: '2px' }}>{s.explanation}</p>}
            </div>
          </div>
        ))}
        {stillRevealing === false && revealedSteps.length === 0 && (
          <p style={{ fontSize: '12px', color: '#8e9ba9' }}>No step data available for this case yet.</p>
        )}
      </div>

      {!stillRevealing && (
        <>
          {/* Memory panel — only when the backend actually returned memory signal */}
          {hasMemory && (
            <div style={{ background: 'rgba(0,255,245,0.05)', border: '1px solid rgba(0,255,245,0.2)', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#00FFF5', marginBottom: '6px' }}>🧠 CUSTOMER MEMORY</div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span>Prior interactions: <strong style={{ color: '#fff' }}>{memory.sampleSize}</strong></span>
                {memory.priorSuccessfulActions?.length > 0 && (
                  <span>Previously successful strategy: <strong style={{ color: '#fff' }}>{memory.priorSuccessfulActions.join(', ')}</strong></span>
                )}
                {memory.priorFailedActions?.length > 0 && (
                  <span>Previously unsuccessful: <strong style={{ color: '#fff' }}>{memory.priorFailedActions.join(', ')}</strong></span>
                )}
                <span>Memory influenced this decision: <strong style={{ color: memoryProof ? '#00FFF5' : '#94a3b8' }}>{memoryProof ? 'YES' : 'No — not decisive this time'}</strong></span>
              </div>
              {memoryProof?.message && <p style={{ fontSize: '11.5px', color: '#8e9ba9', marginTop: '6px' }}>{memoryProof.message}</p>}
            </div>
          )}

          {/* Policy panel — only from a real logged policy check */}
          {policyStep && (
            <div style={{ background: policyStep.explanation?.toLowerCase().includes('reject') || policyStep.explanation?.toLowerCase().includes('denied') ? 'rgba(251,113,133,0.06)' : 'rgba(0,255,245,0.05)', border: `1px solid ${policyStep.explanation?.toLowerCase().includes('reject') ? 'rgba(251,113,133,0.3)' : 'rgba(0,255,245,0.2)'}`, borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: policyStep.explanation?.toLowerCase().includes('reject') ? '#fb7185' : '#00FFF5', marginBottom: '4px' }}>
                <IconShield size={13} /> {policyStep.explanation?.toLowerCase().includes('reject') ? '🛑 POLICY BLOCKED' : '🛡 POLICY CHECK: ALLOWED'}
              </div>
              <p style={{ fontSize: '12px', color: '#cbd5e1' }}>{policyStep.explanation}</p>
            </div>
          )}

          {/* Decision + outcome card */}
          <div style={{ background: meta.bg, border: `1px solid ${meta.color}55`, borderRadius: '10px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: meta.color, marginBottom: '10px' }}>
              <span style={{ fontSize: '20px' }}>{meta.icon}</span> {meta.label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px', color: '#cbd5e1', marginBottom: '10px' }}>
              <div><span style={{ color: '#8e9ba9' }}>Strategy:</span> <strong style={{ color: '#fff' }}>{c.recommended_action}</strong></div>
              <div><span style={{ color: '#8e9ba9' }}>Risk score:</span> <strong style={{ color: '#fff' }}>{Math.round(c.priority_score || 0)}/100</strong></div>
              <div><span style={{ color: '#8e9ba9' }}>Expected recovery:</span> <strong style={{ color: '#fff' }}>{formatCurrency(c.expected_recovery)}</strong></div>
              <div><span style={{ color: '#8e9ba9' }}>Recovery Case:</span> <strong className="font-mono" style={{ color: '#fff' }}>CASE-{c.id.slice(0, 8).toUpperCase()}</strong></div>
            </div>
            {c.ai_reasoning && <p style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '12px', lineHeight: 1.5 }}>{c.ai_reasoning.replace('[Agent]', '').trim()}</p>}
            {loopSummary?.friendlyMessage && <p style={{ fontSize: '12px', color: meta.color, marginBottom: '12px', fontWeight: 600 }}>{loopSummary.friendlyMessage}</p>}
            {outcome === 'RECOVERED' && (
              <div style={{ fontSize: '22px', fontWeight: 800, color: meta.color, marginBottom: '10px' }}>{formatCurrency(c.recovered_amount)}</div>
            )}
            <Link href={`/cases/${c.id}`} className="btn btn-primary btn-sm">
              <span>View Full Case / Timeline</span><IconChevronRight size={13} />
            </Link>
          </div>
        </>
      )}

    </div>
  );
}
