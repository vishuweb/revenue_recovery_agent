'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { formatCurrency } from '../page';
import { useToast } from '../components/ToastContext';
import {
  IconAudit,
  IconSearch,
  IconRefresh,
  IconCopy,
  IconZap,
  IconSuccess,
  IconWarning,
  IconClock,
  IconShield
} from '../components/Icons';

export default function AuditPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [search, setSearch] = useState('');
  const [expandedDetails, setExpandedDetails] = useState(new Set());

  const toggleDetails = (id) => {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit?entity_type=${entityType}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load audit entries');
    } finally {
      setLoading(false);
    }
  }, [entityType, toast]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const copyPayload = (e, details) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(details, null, 2));
    toast.success('JSON payload copied to clipboard');
  };

  const getActorBadge = (actor) => {
    if (actor === 'ai_engine' || actor === 'engine') {
      return (
        <span className="badge primary" style={{ fontSize: '10.5px' }}>
          Engine
        </span>
      );
    }
    if (actor === 'system') {
      return <span className="badge muted" style={{ fontSize: '10.5px' }}>System</span>;
    }
    return <span className="badge info" style={{ fontSize: '10.5px' }}>{actor}</span>;
  };

  const getEventIcon = (type = '') => {
    if (type.includes('failed') || type.includes('stopped')) return <IconWarning size={14} color="#fb7185" />;
    if (type.includes('recovered') || type.includes('success')) return <IconSuccess size={14} color="#34d399" />;
    if (type.includes('approved') || type.includes('action')) return <IconZap size={14} color="#60a5fa" />;
    return <IconAudit size={14} color="var(--text-dim)" />;
  };

  const filteredEntries = data?.entries?.filter((entry) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      entry.event_type?.toLowerCase().includes(q) ||
      entry.description?.toLowerCase().includes(q) ||
      entry.actor?.toLowerCase().includes(q) ||
      entry.entity_id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="dashboard-hero">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />Compliance & Security</div>
          <h1 className="hero-title">Audit Trail</h1>
          <p className="hero-subtitle">
            Immutable chronological transaction and pipeline event log for complete operational auditability.
          </p>
        </div>
        <div>
          <button className="btn btn-secondary btn-sm" onClick={fetchAudit}>
            <IconRefresh size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '18px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div className="search-wrapper" style={{ flex: 1, minWidth: '260px' }}>
            <span className="search-icon-inside">
              <IconSearch size={14} />
            </span>
            <input
              type="text"
              className="input search-input"
              placeholder="Search audit descriptions, event types, actors, or entity IDs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <select
              className="select"
              style={{ width: '190px' }}
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            >
              <option value="">All Entity Types</option>
              <option value="case">Recovery Cases</option>
              <option value="payment">Payments</option>
              <option value="customer">Customers</option>
              <option value="action">Pipeline Actions</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Timeline */}
      <div className="card">
        {loading ? (
          <div className="skeleton" style={{ height: '400px' }} />
        ) : (
          <div className="timeline">
            {filteredEntries?.map((entry) => (
              <div key={entry.id} className="timeline-item">
                <div className="timeline-indicator">
                  <div className="timeline-dot">
                    {getEventIcon(entry.event_type)}
                  </div>
                  <div className="timeline-line" />
                </div>

                <div className="timeline-content">
                  <div
                    style={{
                      background: 'var(--surface-color)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      padding: '14px 16px',
                      transition: 'border-color var(--transition-fast)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {entry.event_type}
                        </span>
                        {getActorBadge(entry.actor)}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {entry.details && (
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                            onClick={() => toggleDetails(entry.id)}
                          >
                            {expandedDetails.has(entry.id) ? 'Hide Payload' : 'View Payload'}
                          </button>
                        )}
                        <span className="font-mono" style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
                          {new Date(entry.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    <p style={{ color: 'var(--text-secondary)', fontSize: '12.5px', lineHeight: 1.5, marginBottom: '10px' }}>
                      {entry.description}
                    </p>

                    {/* Expandable JSON payload */}
                    {expandedDetails.has(entry.id) && entry.details && (
                      <div style={{ position: 'relative', marginBottom: '10px' }}>
                        <pre
                          className="font-mono"
                          style={{
                            background: '#080a0f',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '6px',
                            padding: '10px 12px',
                            maxHeight: '200px',
                            overflow: 'auto',
                            fontSize: '11.5px',
                            color: '#93c5fd'
                          }}
                        >
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '10.5px', padding: '2px 6px' }}
                          onClick={(e) => copyPayload(e, entry.details)}
                        >
                          <IconCopy size={11} />
                          <span>Copy</span>
                        </button>
                      </div>
                    )}

                    {/* Footer Entity Meta */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11.5px',
                        color: 'var(--text-dim)',
                        background: 'rgba(0, 0, 0, 0.25)',
                        padding: '6px 10px',
                        borderRadius: '6px'
                      }}
                    >
                      <div>
                        Target:{' '}
                        <span className="font-mono" style={{ color: '#93c5fd', fontWeight: 600 }}>
                          {entry.entity_type} #{entry.entity_id?.substring(0, 8)}
                        </span>
                      </div>
                      {entry.amount != null && (
                        <div className="font-mono" style={{ color: '#fb7185', fontWeight: 600 }}>
                          Amount: {formatCurrency(entry.amount)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {filteredEntries?.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No audit events matching &ldquo;{search}&rdquo;.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
