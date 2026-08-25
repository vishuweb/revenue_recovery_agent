'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '../page';
import { CustomerAvatar } from '../components/CustomerAvatar';
import { useToast } from '../components/ToastContext';
import {
  IconSearch,
  IconRefresh,
  IconCustomers,
  IconUser,
  IconRupee
} from '../components/Icons';

export default function CustomersPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('mrr');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(search)}&sortBy=${sortBy}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [search, sortBy, toast]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchCustomers();
    }, 250);
    return () => clearTimeout(delayDebounceFn);
  }, [fetchCustomers]);

  const getRiskScoreBar = (score = 0) => {
    let color = '#10b981';
    if (score > 40) color = '#f59e0b';
    if (score > 70) color = '#f43f5e';

    return (
      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, score)}%`, height: '100%', background: color, borderRadius: 'inherit' }} />
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="dashboard-hero">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />Account Portfolio</div>
          <h1 className="hero-title">Customer Directory</h1>
          <p className="hero-subtitle">
            Subscribers and accounts analyzed by the engine for retention health and lifetime value metrics.
          </p>
        </div>
        <div>
          <button className="btn btn-secondary btn-sm" onClick={fetchCustomers}>
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
              placeholder="Search by customer name, email address, or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <select
              className="select"
              style={{ width: '200px' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="mrr">Sort: MRR (Highest)</option>
              <option value="lifetime_value">Sort: Lifetime Value</option>
              <option value="risk_score">Sort: Churn Risk (Highest)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Customer Table */}
      <div className="card">
        {loading ? (
          <div className="skeleton" style={{ height: '360px' }} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer Account</th>
                  <th>Company</th>
                  <th>Plan Tier</th>
                  <th>Monthly (MRR)</th>
                  <th>Lifetime Value</th>
                  <th>Risk Score</th>
                  <th>Active At Risk</th>
                  <th>Recovery State</th>
                </tr>
              </thead>
              <tbody>
                {data?.customers?.map((c) => (
                  <tr key={c.id} onClick={() => router.push(`/customers/${c.id}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CustomerAvatar name={c.name} size={32} showStatus statusColor={c.risk_score > 60 ? 'var(--danger)' : 'var(--emerald)'} />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {c.company || 'Direct'}
                      </span>
                    </td>
                    <td>
                      <span className="badge primary" style={{ fontSize: '11px' }}>{c.plan_name || 'Standard'}</span>
                    </td>
                    <td>
                      <span className="font-mono" style={{ fontWeight: 600, color: '#34d399' }}>
                        {formatCurrency(c.mrr)}
                      </span>
                    </td>
                    <td className="font-mono" style={{ fontWeight: 600 }}>{formatCurrency(c.lifetime_value)}</td>
                    <td style={{ width: '130px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600 }}>
                          <span style={{ color: c.risk_score > 60 ? '#fb7185' : 'var(--text-primary)' }}>
                            {Math.round(c.risk_score || 0)} / 100
                          </span>
                          <span style={{ color: 'var(--text-dim)' }}>risk</span>
                        </div>
                        {getRiskScoreBar(c.risk_score)}
                      </div>
                    </td>
                    <td>
                      {c.active_at_risk > 0 ? (
                        <span className="font-mono" style={{ fontWeight: 600, color: '#fb7185' }}>
                          {formatCurrency(c.active_at_risk)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>₹0</span>
                      )}
                    </td>
                    <td>
                      {c.active_cases_count > 0 ? (
                        <span className="badge warning">{c.active_cases_count} Case Active</span>
                      ) : (
                        <span className="badge success">Healthy</span>
                      )}
                    </td>
                  </tr>
                ))}

                {(!data?.customers || data.customers.length === 0) && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No customers matched &ldquo;{search}&rdquo;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
