'use client';

import React, { useState } from 'react';
import { formatCurrency } from '../page';
import { useToast } from './ToastContext';
import { CustomerAvatar } from './CustomerAvatar';
import {
  IconClose,
  IconSparkles,
  IconWarning,
  IconShield,
  IconDiscount,
  IconMessage,
  IconZap,
  IconSuccess
} from './Icons';

function ModalCloseButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--glass-border)',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '8px',
        transition: 'all 110ms ease',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.09)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
        e.currentTarget.style.color = 'var(--text-muted)';
      }}
      aria-label="Close modal"
    >
      <IconClose size={14} />
    </button>
  );
}

const toneOptions = [
  { id: 'concierge', label: 'Concierge', desc: 'High-touch & helpful', icon: 'star' },
  { id: 'standard',  label: 'Standard',  desc: 'Direct billing notice', icon: 'diamond' },
  { id: 'urgent',    label: 'Urgent',    desc: 'Service suspension', icon: 'zap' },
];

function ToneIcon({ type }) {
  if (type === 'star') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--primary-glow)" stroke="none">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
  if (type === 'diamond') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-secondary)" stroke="none">
      <polygon points="12 2 22 9 12 22 2 9" />
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--warning-glow)" stroke="none">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function ActionModal({ isOpen, onClose, caseItem, onActionSuccess }) {
  const toast = useToast();
  const [discount, setDiscount] = useState(caseItem?.discount_percent || 10);
  const [tone, setTone] = useState('concierge');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !caseItem) return null;

  const recoveryPct = Math.round((caseItem.recovery_probability || 0.75) * 100);

  const handleExecute = async (actionType) => {
    setLoading(true);
    toast.info('Executing ' + actionType + ' workflow...');
    try {
      const res = await fetch('/api/cases/' + caseItem.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType, customDiscount: discount, tone })
      });

      if (res.ok) {
        toast.success('Intervention dispatched successfully.');
        if (onActionSuccess) onActionSuccess();
        onClose();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to dispatch intervention');
      }
    } catch {
      toast.error('Network error communicating with recovery engine');
    } finally {
      setLoading(false);
    }
  };

  const caseIdShort = caseItem.id ? caseItem.id.substring(0, 8) : 'N/A';

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <CustomerAvatar name={caseItem.customer_name || 'Customer'} size={36} />
            <div>
              <h3
                id="modal-title"
                style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.015em' }}
              >
                Execute Recovery Intervention
              </h3>
              <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>#{caseIdShort}</span>
                <span style={{ color: 'var(--text-faint)' }}>|</span>
                <span>{caseItem.customer_name}</span>
              </p>
            </div>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Risk / Recovery cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{
              padding: '14px 16px',
              background: 'rgba(244, 63, 94, 0.07)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-card)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <IconWarning size={13} color="var(--danger-glow)" />
                <span style={{ fontSize: '10.5px', color: 'var(--danger)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  At Risk
                </span>
              </div>
              <div className="font-mono" style={{ fontSize: '19px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatCurrency(caseItem.amount_at_risk)}
              </div>
            </div>

            <div style={{
              padding: '14px 16px',
              background: 'rgba(16, 185, 129, 0.06)',
              border: '1px solid var(--emerald-border)',
              borderRadius: 'var(--radius-card)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <IconSuccess size={13} color="var(--emerald-glow)" />
                <span style={{ fontSize: '10.5px', color: 'var(--emerald)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Recovery
                </span>
              </div>
              <div className="font-mono" style={{ fontSize: '19px', fontWeight: 700, color: 'var(--emerald-glow)' }}>
                {recoveryPct}%
              </div>
            </div>
          </div>

          {/* AI Recommendation */}
          <div style={{
            background: 'var(--surface-color)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-card)',
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <IconSparkles size={14} color="var(--primary-glow)" />
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.055em' }}>
                  AI Strategy
                </span>
              </div>
              <span className="badge primary">{caseItem.recommended_action || 'Smart Dunning'}</span>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {caseItem.ai_reasoning || 'Engine evaluated customer tier, transaction history, and decline codes to prescribe an automated retry sequence and customized billing notification.'}
            </p>
          </div>

          {/* Outreach Tone selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <IconMessage size={13} color="var(--text-muted)" />
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>Outreach Template Tone</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '7px' }}>
              {toneOptions.map((t) => {
                const selected = tone === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid ' + (selected ? 'var(--primary-accent)' : 'var(--glass-border)'),
                      background: selected ? 'var(--primary-soft)' : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      transition: 'all 110ms ease',
                      position: 'relative',
                    }}
                  >
                    {selected && (
                      <div style={{
                        position: 'absolute', top: '7px', right: '8px',
                        width: '14px', height: '14px', borderRadius: '50%',
                        background: 'var(--primary-gradient)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                    <div style={{ marginBottom: '4px' }}>
                      <ToneIcon type={t.icon} />
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: selected ? 'var(--primary-glow)' : 'var(--text-primary)' }}>{t.label}</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--text-dim)', marginTop: '2px' }}>{t.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Discount Slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconDiscount size={13} color="var(--text-muted)" />
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>Retention Incentive</span>
              </div>
              <span className="font-mono gradient-text" style={{ fontSize: '13px', fontWeight: 700 }}>
                {discount}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              step="5"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--primary-accent)', cursor: 'pointer', height: '4px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-faint)', marginTop: '5px' }}>
              <span>0% Standard</span>
              <span style={{ color: 'var(--primary-glow)', fontWeight: 600 }}>15% Recommended</span>
              <span>30% Max</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => handleExecute('stop')}
            disabled={loading}
            style={{ color: 'var(--danger-glow)', marginRight: 'auto' }}
          >
            Dismiss Case
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleExecute('escalate')}
            disabled={loading}
          >
            Escalate to Analyst
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => handleExecute('execute')}
            disabled={loading}
            style={{ minWidth: '155px' }}
          >
            <IconZap size={13} />
            <span>{loading ? 'Dispatching...' : 'Dispatch Intervention'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}