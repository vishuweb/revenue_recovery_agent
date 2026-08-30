'use client';

import { useEffect, useState } from 'react';
import { useToast } from '../components/ToastContext';
import {
  IconAudit,
  IconRefresh,
  IconShield,
  IconZap,
  IconClock,
  IconUser
} from '../components/Icons';

export default function AuditPage() {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/audit?limit=60');
      if (res.ok) {
        const json = await res.json();
        setEntries(json.entries || []);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, []);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="dashboard-hero">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />Compliance & Security</div>
          <h1 className="hero-title">Audit Trail</h1>
          <p className="hero-subtitle">
            Cryptographically timestamped, append-only ledger of all autonomous engine decisions and operator overrides.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchAudit}>
          <IconRefresh size={14} />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {/* Main Audit Grid */}
      <div className="grid-cols-3">
        {/* Stream */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header">
            <h3 className="card-title">
              <IconAudit size={16} color="#00FFF5" />
              <span>Immutable Ledger Stream</span>
            </h3>
            <span className="badge info">ACID Compliant</span>
          </div>

          {loading ? (
            <div className="skeleton" style={{ height: '360px' }} />
          ) : (
            <div className="timeline" style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '6px' }}>
              {entries.map((item) => {
                const isSelected = selectedEntry?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className="timeline-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedEntry(item)}
                  >
                    <div className="timeline-indicator">
                      <div className={`timeline-dot ${isSelected ? 'active' : ''}`}>
                        <IconShield size={12} />
                      </div>
                      <div className="timeline-line" />
                    </div>
                    <div className="timeline-content">
                      <div
                        style={{
                          background: isSelected ? 'rgba(0, 173, 180, 0.15)' : 'var(--surface-elevated)',
                          border: `1px solid ${isSelected ? '#00ADB4' : '#3B3E47'}`,
                          borderRadius: '8px',
                          padding: '12px 14px',
                          transition: 'all var(--transition-fast)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span className="badge primary" style={{ fontSize: '11px' }}>
                            {item.event_type}
                          </span>
                          <span className="font-mono" style={{ fontSize: '11px', color: '#5f6d7e' }}>
                            {new Date(item.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        <p style={{ fontSize: '12.5px', color: '#ffffff', marginTop: '4px' }}>{item.description}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', fontSize: '11px', color: '#8e9ba9' }}>
                          <span>Actor: <strong style={{ color: '#cbd5e1' }}>{item.actor}</strong></span>
                          <span className="font-mono" style={{ color: '#5f6d7e' }}>{item.entity_type}::{item.entity_id?.substring(0, 8)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {entries.length === 0 && (
                <div style={{ padding: '36px', textAlign: 'center', color: '#8e9ba9' }}>
                  No audit entries recorded yet.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected Entry Inspector */}
        <div className="card card-elevated" style={{ height: 'fit-content' }}>
          <div className="card-header">
            <h3 className="card-title">
              <IconZap size={16} color="#00FFF5" />
              <span>Event Details</span>
            </h3>
            {selectedEntry && <span className="badge primary">Inspect</span>}
          </div>

          {selectedEntry ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#8e9ba9', fontWeight: 600, textTransform: 'uppercase' }}>Event Type</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#00FFF5', marginTop: '2px' }}>{selectedEntry.event_type}</div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#8e9ba9', fontWeight: 600, textTransform: 'uppercase' }}>Description</div>
                <div style={{ fontSize: '13px', color: '#ffffff', marginTop: '2px' }}>{selectedEntry.description}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#8e9ba9', fontWeight: 600, textTransform: 'uppercase' }}>Actor</div>
                  <div style={{ fontSize: '12.5px', color: '#cbd5e1', marginTop: '2px' }}>{selectedEntry.actor}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#8e9ba9', fontWeight: 600, textTransform: 'uppercase' }}>Target Entity</div>
                  <div style={{ fontSize: '12.5px', color: '#cbd5e1', marginTop: '2px' }}>{selectedEntry.entity_type}</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#8e9ba9', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Payload Metadata</div>
                <div style={{ background: '#12151d', border: '1px solid #3B3E47', borderRadius: '8px', padding: '12px', overflowX: 'auto' }}>
                  <pre className="font-mono" style={{ fontSize: '11.5px', color: '#00FFF5', margin: 0 }}>
                    {selectedEntry.payload ? JSON.stringify(JSON.parse(selectedEntry.payload), null, 2) : 'No payload'}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '48px 16px', textAlign: 'center', color: '#8e9ba9' }}>
              Select an audit log entry on the left to inspect its complete immutable payload and actor signature.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}