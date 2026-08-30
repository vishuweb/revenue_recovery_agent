'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '../page';
import { CustomerAvatar } from '../components/CustomerAvatar';
import { useToast } from '../components/ToastContext';
import {
  IconSearch,
  IconRefresh,
  IconUser,
  IconWarning,
  IconShield,
  IconCoins,
  IconChevronRight
} from '../components/Icons';

export default function CustomersPage() {
  const router = useRouter();
  const toast = useToast();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('mrr');

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (sortBy) params.append('sortBy', sortBy);

      const res = await fetch(`/api/customers?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setCustomers(json.customers || []);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [search, sortBy, toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchCustomers]);

  const getChurnRiskBadge = (score = 0) => {
    if (score >= 0.7) {
      return (
        <span className="badge danger" style={{ fontSize: '11px' }}>
          High Risk • {Math.round(score * 100)}%
        </span>
      );
    }
    if (score >= 0.35) {
      return (
        <span className="badge warning" style={{ fontSize: '11px' }}>
          Medium • {Math.round(score * 100)}%
        </span>
      );
    }
    return (
      <span className="badge success" style={{ fontSize: '11px' }}>
        Healthy • {Math.round(score * 100)}%
      </span>
    );
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="dashboard-hero">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />Subscriber Portfolio</div>
          <h1 className="hero-title">Customer Accounts</h1>
          <p className="hero-subtitle">
            Subscriber directory with churn risk analytics and payment reliability metrics.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchCustomers}>
          <IconRefresh size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '18px', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div className="search-wrapper" style={{ flex: 1, maxWidth: '360px' }}>
            <span className="search-icon-inside">
              <IconSearch size={14} />
            </span>
            <input
              type="text"
              className="input search-input"
              placeholder="Search by customer name, company or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: '#8e9ba9' }}>Sort by:</span>
            <select
              className="select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ minWidth: '180px' }}
            >
              <option value="mrr">Monthly Revenue (MRR)</option>
              <option value="lifetime_value">Lifetime Value (LTV)</option>
              <option value="churn_risk_score">Churn Risk Score</option>
              <option value="name">Customer Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Customers Table */}
      <div className="card">
        {loading ? (
          <div className="skeleton" style={{ height: '360px' }} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Subscriber</th>
                  <th>Plan Tier</th>
                  <th>Monthly Revenue (MRR)</th>
                  <th>Lifetime Value</th>
                  <th>Payment Health</th>
                  <th>Churn Risk</th>
                  <th>Tenure</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((cust) => (
                  <tr key={cust.id} onClick={() => router.push(`/customers/${cust.id}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CustomerAvatar name={cust.name} size={32} />
                        <div>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{cust.name}</div>
                          <div style={{ fontSize: '11px', color: '#8e9ba9' }}>{cust.company || cust.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge primary" style={{ fontSize: '11px' }}>
                        {cust.plan_name || 'Pro Plan'}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono" style={{ fontWeight: 700, color: '#00FFF5' }}>
                        {formatCurrency(cust.mrr)}
                      </span>
                    </td>
                    <td>
                      <span className="font-mono" style={{ color: '#ffffff' }}>
                        {formatCurrency(cust.lifetime_value)}
                      </span>
                    </td>
                    <td style={{ width: '130px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="font-mono" style={{ fontSize: '11px', color: '#cbd5e1' }}>
                          {cust.payment_success_rate || 95}%
                        </span>
                        <div style={{ flex: 1, height: '5px', background: '#3B3E47', borderRadius: '9999px', overflow: 'hidden' }}>
                          <div style={{ width: `${cust.payment_success_rate || 95}%`, height: '100%', background: '#00FFF5' }} />
                        </div>
                      </div>
                    </td>
                    <td>{getChurnRiskBadge(cust.churn_risk_score)}</td>
                    <td style={{ color: '#8e9ba9', fontSize: '12px' }}>
                      {cust.tenure_months || 12} mos
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => router.push(`/customers/${cust.id}`)}>
                        <span>Profile</span>
                        <IconChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}

                {customers.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: '#8e9ba9' }}>
                      No customers matched your filter criteria.
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