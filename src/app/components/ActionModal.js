'use client';

import React, { useState } from 'react';
import { formatCurrency } from '../page';
import { useToast } from './ToastContext';
import { CustomerAvatar } from './CustomerAvatar';
import {
  IconClose,
  IconZap,
  IconWarning,
  IconShield,
  IconDiscount,
  IconMessage
} from './Icons';

export function ActionModal({ isOpen, onClose, caseItem, onActionSuccess }) {
  const toast = useToast();
  const [discount, setDiscount] = useState(caseItem?.discount_percent || 10);
  const [tone, setTone] = useState('concierge');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !caseItem) return null;

  const handleExecute = async (actionType) => {
    setLoading(true);
    toast.info(`Executing ${actionType} workflow...`);
    try {
      const res = await fetch(`/api/cases/${caseItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionType,
          customDiscount: discount,
          tone
        })
      });

      if (res.ok) {
        toast.success(`Intervention '${actionType}' dispatched successfully.`);
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

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <CustomerAvatar name={caseItem.customer_name || 'Customer'} size={36} />
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff' }}>
                Execute Recovery Intervention
              </h3>
              <p style={{ fontSize: '12px', color: '#8e9ba9', marginTop: '2px' }}>
                Case #{caseItem.id?.substring(0, 8)} • {caseItem.customer_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 0,
              color: '#8e9ba9',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '6px',
              borderRadius: '6px'
            }}
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Risk Summary */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              background: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.28)',
              borderRadius: 'var(--border-radius-card)'
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: '#fb7185', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Amount At Risk
              </div>
              <div className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
                {formatCurrency(caseItem.amount_at_risk)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#8e9ba9', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Predicted Recovery
              </div>
              <div className="font-mono" style={{ fontSize: '16px', fontWeight: 700, color: '#00FFF5', marginTop: '2px' }}>
                {Math.round((caseItem.recovery_probability || 0.75) * 100)}%
              </div>
            </div>
          </div>

          {/* Recommended Action Spec */}
          <div
            style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--border-radius-card)',
              padding: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#00FFF5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Recommended Strategy
              </span>
              <span className="badge primary">{caseItem.recommended_action || 'Smart Dunning Sequence'}</span>
            </div>
            <p style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.5 }}>
              {caseItem.ai_reasoning || 'Engine evaluated customer tier, transaction history, and decline codes to prescribe an automated retry sequence and customized billing notification.'}
            </p>
          </div>

          {/* Outreach Configuration */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
              Outreach Template Tone
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { id: 'concierge', label: 'Concierge', desc: 'High touch & helpful' },
                { id: 'standard', label: 'Standard', desc: 'Direct billing notice' },
                { id: 'urgent', label: 'Urgent', desc: 'Service suspension warning' }
              ].map((t) => (
                <div
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${tone === t.id ? '#00ADB4' : '#3B3E47'}`,
                    background: tone === t.id ? 'rgba(0, 173, 180, 0.15)' : 'var(--surface-elevated)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: tone === t.id ? '#00FFF5' : '#ffffff' }}>{t.label}</div>
                  <div style={{ fontSize: '10.5px', color: '#8e9ba9', marginTop: '2px' }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Courtesy Discount */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
                Retention Incentive Discount
              </span>
              <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: '#00FFF5' }}>
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
              style={{ width: '100%', accentColor: '#00ADB4', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#5f6d7e', marginTop: '4px' }}>
              <span>0% (Standard)</span>
              <span>15% (Recommended)</span>
              <span>30% (Max Allowed)</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleExecute('stop')}
            disabled={loading}
            style={{ color: '#fb7185', marginRight: 'auto' }}
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
          >
            <IconZap size={14} />
            <span>{loading ? 'Dispatching...' : 'Dispatch Intervention'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
