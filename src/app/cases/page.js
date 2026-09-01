'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '../page';
import { ProbabilityBar } from '../components/Charts';
import { CustomerAvatar } from '../components/CustomerAvatar';
import { ActionModal } from '../components/ActionModal';
import { useToast } from '../components/ToastContext';
import {
  IconSearch,
  IconFilter,
  IconRefresh,
  IconSimulator,
  IconZap,
  IconCases,
  IconWarning,
  IconSuccess
} from '../components/Icons';

export default function CasesPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState('amount_at_risk');
  const [search, setSearch] = useState('');
  const [selectedCaseForAction, setSelectedCaseForAction] = useState(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (sortBy) params.append('sortBy', sortBy);
      if (search) params.append('search', search);

      const res = await fetch(`/api/cases?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load recovery cases');
    } finally {
      setLoading(false);
    }
  }, [status, sortBy, search, toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCases();
    }, 250);
    const interval = setInterval(fetchCases, 10000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchCases]);

  const handleOpenAction = (e, c) => {
    e.stopPropagation();
    setSelectedCaseForAction(c);
    setIsActionModalOpen(true);
  };

  const getPriorityBadge = (score = 0) => {
    if (score >= 80) {
      return (
        <span className="badge danger" style={{ fontSize: '11px' }}>
          P0 • {Math.round(score)}
        </span>
      );
    }
    if (score >= 50) {
      return (
        <span className="badge warning" style={{ fontSize: '11px' }}>
          P1 • {Math.round(score)}
        </span>
      );
    }
    if (score >= 30) {
      return (
        <span className="badge primary" style={{ fontSize: '11px' }}>
          P2 • {Math.round(score)}
        </span>
      );
    }
    return (
      <span className="badge muted" style={{ fontSize: '11px' }}>
        P3 • {Math.round(score)}
      </span>
    );
  };

  const getStatusBadge = (s) => {
    switch (s) {
      case 'recovered':
        return <span className="badge success">Recovered</span>;
      case 'failed':
        return <span className="badge danger">Failed</span>;
      case 'open':
        return <span className="badge warning">Open</span>;
      case 'in_progress':
        return <span className="badge primary">In Progress</span>;
      case 'stopped':
        return <span className="badge muted">Stopped</span>;
      default:
        return <span className="badge muted">{s}</span>;
    }
  };

  const filterTabs = [
    { label: 'All Cases', value: '' },
    { label: 'Open', value: 'open' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Recovered', value: 'recovered' },
    { label: 'Failed', value: 'failed' }
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="dashboard-hero">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" />Dunning Pipeline</div>
          <h1 className="hero-title">Recovery Cases</h1>
          <p className="hero-subtitle">
            Autonomous triage queue ranked by customer value and statistical probability of payment recovery.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary btn-sm" onClick={fetchCases}>
            <IconRefresh size={14} />
            <span>Refresh</span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => router.push('/simulator')}>
            <IconSimulator size={14} />
            <span>Simulate Case</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '18px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '6px', background: '#181d26', padding: '4px', borderRadius: '8px', border: '1px solid #3B3E47' }}>
            {filterTabs.map((tab) => {
              const isActive = status === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setStatus(tab.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: isActive ? '#00ADB4' : 'transparent',
                    color: isActive ? '#12151d' : '#8e9ba9',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search and Sort controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: 'flex-end', minWidth: '300px' }}>
            <div className="search-wrapper" style={{ flex: 1, maxWidth: '260px' }}>
              <span className="search-icon-inside">
                <IconSearch size={14} />
              </span>
              <input
                type="text"
                className="input search-input"
                placeholder="Search account name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              className="select"
              style={{ width: '180px' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="amount_at_risk">Sort: Amount At Risk</option>
              <option value="priority_score">Sort: Priority Score</option>
              <option value="recovery_probability">Sort: Probability</option>
              <option value="opened_at">Sort: Date Opened</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Cases Table */}
      <div className="card">
        {loading ? (
          <div className="skeleton" style={{ height: '360px' }} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Customer / Account</th>
                  <th>Amount At Risk</th>
                  <th>Decline Reason</th>
                  <th>Probability</th>
                  <th>Status</th>
                  <th>Prescribed Action</th>
                  <th>Opened</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {data?.cases?.map((c) => (
                  <tr key={c.id} onClick={() => router.push(`/cases/${c.id}`)}>
                    <td>{getPriorityBadge(c.priority_score)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CustomerAvatar name={c.name || c.customer_name} size={30} />
                        <div>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{c.name || c.customer_name}</div>
                          <div style={{ fontSize: '11px', color: '#8e9ba9' }}>
                            {c.company || c.customer_company || c.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="font-mono" style={{ fontWeight: 600, color: '#fb7185' }}>
                        {formatCurrency(c.amount_at_risk)}
                      </span>
                    </td>
                    <td>
                      <span className="badge muted" style={{ fontSize: '10.5px' }}>
                        {c.failure_reason ? c.failure_reason.replace('_', ' ') : 'Card declined'}
                      </span>
                    </td>
                    <td style={{ width: '130px' }}>
                      <ProbabilityBar value={c.recovery_probability} />
                    </td>
                    <td>{getStatusBadge(c.status)}</td>
                    <td>
                      <span className="badge primary" style={{ fontSize: '11px' }}>
                        {c.recommended_action || 'Smart Dunning'}
                      </span>
                    </td>
                    <td style={{ color: '#8e9ba9', fontSize: '11.5px' }}>
                      {new Date(c.opened_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => handleOpenAction(e, { ...c, customer_name: c.name || c.customer_name })}
                        title="Review and dispatch action"
                      >
                        <IconZap size={13} />
                        <span>Action</span>
                      </button>
                    </td>
                  </tr>
                ))}

                {data?.cases?.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '48px 24px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff' }}>No active recovery cases</div>
                      <p style={{ color: '#8e9ba9', fontSize: '13px', marginTop: '4px', maxWidth: '380px', margin: '4px auto 16px' }}>
                        All payments are up to date. You can simulate decline events in the sandbox.
                      </p>
                      <button className="btn btn-primary btn-sm" onClick={() => router.push('/simulator')}>
                        Launch Sandbox
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Review Modal */}
      <ActionModal
        isOpen={isActionModalOpen}
        onClose={() => setIsActionModalOpen(false)}
        caseItem={selectedCaseForAction}
        onActionSuccess={fetchCases}
      />
    </div>
  );
}
