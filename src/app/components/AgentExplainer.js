'use client';

import { useState } from 'react';
import {
  IconInfo, IconChevronDown, IconChevronRight, IconRefresh, IconCard,
  IconMessage, IconUser, IconDiscount, IconShield, IconStars, IconDatabase,
} from './Icons';

const FLOW_STEPS = [
  { label: 'Detect', type: 'deterministic', desc: 'A payment fails — via a real Razorpay webhook or the simulator — and enters the graph as one normalized event. Same shape either way.' },
  { label: 'Analyze', type: 'ai', desc: 'The failure reason is classified deterministically (temporary / behavioral / permanent / ...). The LLM only adds a plain-English root-cause note — it cannot change the category.' },
  { label: 'Score', type: 'deterministic', desc: "Recovery probability and priority are computed from the customer's real payment history. Pure math, no AI." },
  { label: 'Recall Memory', type: 'deterministic', desc: "Looks up this customer's own past outcomes with each strategy, plus category-wide success rates." },
  { label: 'Decide', type: 'ai', desc: "Picks from a pre-computed, financially-safe candidate list. Memory can re-rank it (a proven strategy for this customer gets boosted); the LLM, if available, picks among those same safe options and explains why." },
  { label: 'Policy Gate', type: 'deterministic', desc: 'Hard business rules — retry caps, cooldowns, contact limits, margin protection, customer-fatigue limits. Can only ALLOW or DENY. Nothing upstream, including the LLM, can bypass it.' },
  { label: 'Execute', type: 'deterministic', desc: 'Calls exactly one bounded tool (see below) to actually act. Reached only after the policy gate allows.' },
  { label: 'Observe', type: 'deterministic', desc: 'Reads back what really happened: recovered, failed, or dispatched-and-awaiting-the-customer.' },
  { label: 'Learn', type: 'deterministic', desc: 'Writes the real outcome to long-term memory so the next decision for this customer is informed by it — provably, not just in a prompt.' },
];

const TOOLS = [
  { icon: IconRefresh, name: 'retryPayment', desc: 'Retries the charge through the real payment provider (Razorpay or the simulator).' },
  { icon: IconCard, name: 'createPaymentLink', desc: 'Creates a hosted link for the customer to pay directly.' },
  { icon: IconMessage, name: 'sendRecoveryNotification', desc: 'Sends one bounded, pre-templated email / SMS / cart-reminder — no free-form content, no arbitrary recipients.' },
  { icon: IconUser, name: 'escalateCase', desc: 'Hands the case to a human for approval. Never moves money itself.' },
  { icon: IconDiscount, name: 'recordRecoveryAction', desc: 'Records a bounded incentive (discount, free shipping, targeted campaign) or a deliberate no-op.' },
];

const OUTCOMES = [
  { label: 'Recovered', color: '#00FFF5', desc: 'The payment came back. Agent stops — nothing more to do.' },
  { label: 'Escalated', color: '#fbbf24', desc: 'Above a policy threshold (e.g. high value) — a human must approve. The agent never acts alone here.' },
  { label: 'Paused', color: '#38bdf8', desc: "Dispatched an action (e.g. email) and is waiting on the customer's real-world response. Resumes automatically later — see the cron sweep." },
  { label: 'Stopped', color: '#94a3b8', desc: 'Policy or the engine correctly ended the case (limits reached, already resolved, customer opted out, etc.).' },
  { label: 'Failed', color: '#fb7185', desc: 'Retries exhausted and the failure was not recoverable.' },
];

export function AgentExplainer() {
  const [open, setOpen] = useState(false);

  return (
    <div className="card" style={{ marginBottom: '16px', padding: 0, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', cursor: 'pointer', padding: '14px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <IconInfo size={16} color="#00FFF5" />
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#ffffff' }}>
            How the autonomous agent works — and exactly what it&apos;s allowed to do
          </span>
        </div>
        {open ? <IconChevronDown size={14} color="#8e9ba9" /> : <IconChevronRight size={14} color="#8e9ba9" />}
      </button>

      {open && (
        <div style={{ padding: '0 18px 20px' }}>
          <p style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '18px', maxWidth: '720px' }}>
            <strong style={{ color: '#ffffff' }}>Its job:</strong> when a payment fails, figure out why, decide the
            single best (already financially-approved) way to try to recover it, check that a hard policy allows it,
            act, watch what really happens, and remember it for next time. It is wired into the app at exactly two
            points — the real Razorpay webhook and the simulator — and both feed the identical graph below.
          </p>

          {/* Flow */}
          <h4 style={{ fontSize: '11px', fontWeight: 700, color: '#8e9ba9', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
            The flow — every step tagged by who&apos;s actually deciding
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {FLOW_STEPS.map((step, i) => (
              <div key={step.label} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span className="font-mono" style={{ fontSize: '10.5px', color: '#5f6d7e', width: '16px', flexShrink: 0, paddingTop: '2px' }}>{i + 1}</span>
                <span
                  className="badge"
                  style={{
                    flexShrink: 0, width: '108px', textAlign: 'center', fontSize: '10.5px',
                    background: step.type === 'ai' ? 'rgba(251,191,36,0.12)' : 'rgba(148,163,184,0.12)',
                    color: step.type === 'ai' ? '#fbbf24' : '#94a3b8',
                  }}
                >
                  {step.label}
                </span>
                <span className="badge" style={{ flexShrink: 0, fontSize: '9.5px', background: step.type === 'ai' ? 'rgba(0,255,245,0.1)' : 'rgba(148,163,184,0.08)', color: step.type === 'ai' ? '#00FFF5' : '#5f6d7e' }}>
                  {step.type === 'ai' ? 'AI can influence' : 'deterministic'}
                </span>
                <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5, margin: 0 }}>{step.desc}</p>
              </div>
            ))}
          </div>

          {/* Tools */}
          <h4 style={{ fontSize: '11px', fontWeight: 700, color: '#8e9ba9', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
            Tools the agent has access to — nothing else
          </h4>
          <p style={{ fontSize: '12px', color: '#8e9ba9', marginBottom: '10px', maxWidth: '720px' }}>
            The LLM never calls these. It picks a label from a pre-approved list; only the graph itself, after the
            policy gate allows, invokes the matching tool below.
          </p>
          <div className="grid-cols-3" style={{ marginBottom: '20px', gap: '10px' }}>
            {TOOLS.map((tool) => (
              <div key={tool.name} style={{ background: 'var(--surface-elevated)', border: '1px solid #3B3E47', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <tool.icon size={14} color="#00FFF5" />
                  <span className="font-mono" style={{ fontSize: '11.5px', fontWeight: 700, color: '#ffffff' }}>{tool.name}</span>
                </div>
                <p style={{ fontSize: '11px', color: '#8e9ba9', lineHeight: 1.4, margin: 0 }}>{tool.desc}</p>
              </div>
            ))}
          </div>

          {/* Outcomes */}
          <h4 style={{ fontSize: '11px', fontWeight: 700, color: '#8e9ba9', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
            What can happen at the end of a case
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px' }}>
            {OUTCOMES.map((o) => (
              <div key={o.label} style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: o.color, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', width: '80px', flexShrink: 0 }}>{o.label}</span>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>{o.desc}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid #232833' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#8e9ba9' }}>
              <IconShield size={13} color="#00FFF5" /> Money only moves after the deterministic policy gate allows it
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#8e9ba9' }}>
              <IconStars size={13} color="#fbbf24" /> AI (Ollama) only reasons and picks among pre-approved options
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#8e9ba9' }}>
              <IconDatabase size={13} color="#38bdf8" /> Every step is written to the audit trail, per case
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
