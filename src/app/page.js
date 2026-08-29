'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RevenueChart, FailureReasonsChart, StatusPieChart, ProbabilityBar } from './components/Charts';
import { CustomerAvatar } from './components/CustomerAvatar';
import { ActionModal } from './components/ActionModal';
import { useToast } from './components/ToastContext';
import {
  IconRupee,
  IconWarning,
  IconSuccess,
  IconTrendUp,
  IconTrendDown,
  IconRefresh,
  IconSimulator,
  IconCases,
  IconDiscount,
  IconCopy,
  IconChevronRight,
  IconZap,
  IconShield,
  IconAnalytics
} from './components/Icons';

export function formatCurrency(paise) {
  if (paise == null) return '₹0';
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(rupees);
}

export default function DashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCaseForAction, setSelectedCaseForAction] = useState(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyId = (e, id) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    toast.success(`Copied Case ID: ${id.substring(0, 8)}`);
  };

  const handleOpenAction = (e, c) => {
    e.stopPropagation();
    setSelectedCaseForAction(c);
    setIsActionModalOpen(true);
  };

  if (loading || !data) {
    return (
      <div>
        <div className="dashboard-hero">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" />Pipeline Telemetry</div>
            <h1 className="hero-title">Recovering revenue in real-time.</h1>
          </div>
        </div>
        <div className="grid-cols-4" style={{ marginBottom: '20px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card skeleton" style={{ height: '120px' }} />
          ))}
        </div>
        <div className="card skeleton" style={{ height: '320px', marginBottom: '20px' }} />
        <div className="grid-cols-2">
          <div className="card skeleton" style={{ height: '280px' }} />
          <div className="card skeleton" style={{ height: '280px' }} />
        </div>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'recovered':
        return <span className="badge success">Recovered</span>;
      case 'failed':
        return <span className="badge danger">Failed</span>;
      case 'open':
        return <span className="badge warning">Open</span>;
      case 'in_progress':
        return <span className="badge primary">In Progress</span>;
      default:
        return <span className="badge muted">{status}</span>;
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Hero Header */}
      <div className="dashboard-hero">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Active Recovery Pipeline
          </div>
          <h1 className="hero-title">
            Revenue Recovery & <em>Orchestration</em>
          </h1>
          <p className="hero-subtitle">
            Autonomous retry orchestration, dunning automation, and personalized churn prevention workflows.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              fetchDashboard();
              toast.info('Telemetry data refreshed.');
            }}
          >
            <IconRefresh size={14} />
            <span>Refresh</span>
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => router.push('/analyze')}
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}
          >
            <IconZap size={14} />
            <span>Run Your Business Data</span>
          </button>
        </div>
      </div>

      {/* Dynamic Engine Callout Banner */}
      <div
        className="card card-elevated"
        style={{
          marginBottom: '20px',
          padding: '16px 20px',
          background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.12) 0%, rgba(52, 211, 153, 0.08) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.35)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="stat-icon-wrapper" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', width: '38px', height: '38px' }}>
            <IconZap size={20} />
          </div>
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Interactive Judge Mode: Test Your Own Business Dataset
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Upload any CSV with transaction or dropoff records to run the real decision pipeline and observe personalized dunning strategies.
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary btn-sm"
          onClick={() => router.push('/analyze')}
          style={{ padding: '6px 16px', fontWeight: 700 }}
        >
          <span>Launch Analysis Engine →</span>
        </button>
      </div>

      {/* Primary Financial Metric Cards */}
      <div className="grid-cols-4" style={{ marginBottom: '20px' }}>
        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Total Volume</span>
            <div className="stat-icon-wrapper">
              <IconRupee size={16} />
            </div>
          </div>
          <span className="stat-value">{formatCurrency(data.totalRevenue)}</span>
          <div className="stat-footer">
            <span className="stat-trend-up">
              <IconTrendUp size={14} />
              <span>98.2%</span>
            </span>
            <span>settlement rate</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Revenue At Risk</span>
            <div className="stat-icon-wrapper" style={{ color: 'var(--danger)', background: 'var(--danger-soft)' }}>
              <IconWarning size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: '#fb7185' }}>{formatCurrency(data.revenueAtRisk)}</span>
          <div className="stat-footer">
            <span className="badge danger" style={{ fontSize: '10.5px' }}>{data.activeCases || 0} active</span>
            <span>pipeline cases</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Revenue Recovered</span>
            <div className="stat-icon-wrapper" style={{ color: 'var(--emerald)', background: 'var(--emerald-soft)' }}>
              <IconSuccess size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: '#34d399' }}>{formatCurrency(data.revenueRecovered)}</span>
          <div className="stat-footer">
            <span className="stat-trend-up">
              <IconTrendUp size={14} />
              <span>Saved</span>
            </span>
            <span>from churn</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Recovery Conversion</span>
            <div className="stat-icon-wrapper" style={{ color: '#60a5fa', background: 'var(--primary-soft)' }}>
              <IconAnalytics size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: '#93c5fd' }}>{data.recoveryRate || 0}%</span>
          <div className="stat-footer">
            <span className="stat-trend-up">
              <IconTrendUp size={14} />
              <span>+28%</span>
            </span>
            <span>vs baseline dunning</span>
          </div>
        </div>
      </div>

      {/* Secondary Metrics Row */}
      <div className="grid-cols-3" style={{ marginBottom: '20px' }}>
        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Active Recovery Queue</span>
            <div className="stat-icon-wrapper">
              <IconCases size={16} />
            </div>
          </div>
          <span className="stat-value">{data.activeCases}</span>
          <div className="stat-footer">
            <span>{data.customersAtRisk || 0} accounts in retry cycle</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Concessions & Incentives</span>
            <div className="stat-icon-wrapper">
              <IconDiscount size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: '#fbbf24' }}>
            {formatCurrency(data.interventionCost || 0)}
          </span>
          <div className="stat-footer">
            <span>Discount courtesy allocated</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Net Recovery ROI</span>
            <div className="stat-icon-wrapper">
              <IconShield size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: '#34d399' }}>
            {formatCurrency((data.revenueRecovered || 0) - (data.interventionCost || 0))}
          </span>
          <div className="stat-footer">
            <span className="stat-trend-up">
              <IconTrendUp size={14} />
              <span>Positive ROI</span>
            </span>
            <span>net recovered value</span>
          </div>
        </div>
      </div>

      {/* Main Recovery Trend Chart */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">
              <IconAnalytics size={16} color="#60a5fa" />
              <span>30-Day Recovery Telemetry</span>
            </h3>
            <p className="card-subtitle">Daily comparison of Volume At Risk vs Settled Recoveries</p>
          </div>
          <span className="badge primary">Live Stream</span>
        </div>
        <div style={{ height: '260px', width: '100%' }}>
          <RevenueChart data={data.recoveryTrend} />
        </div>
      </div>

      {/* Analytics Breakdown Grid */}
      <div className="grid-cols-2" style={{ marginBottom: '20px' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <IconWarning size={16} color="var(--warning)" />
                <span>Decline Root Causes</span>
              </h3>
              <p className="card-subtitle">Gateway error categorization and retry feasibility</p>
            </div>
          </div>
          <div style={{ height: '220px', width: '100%' }}>
            <FailureReasonsChart data={data.failureReasons} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <IconCases size={16} color="#60a5fa" />
                <span>Pipeline Stage Distribution</span>
              </h3>
              <p className="card-subtitle">State lifecycle of active and settled dunning cases</p>
            </div>
          </div>
          <div style={{ height: '220px', width: '100%' }}>
            <StatusPieChart data={data.statusBreakdown} />
          </div>
        </div>
      </div>

      {/* Recent High-Priority Cases Table */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">
              <IconZap size={16} color="#60a5fa" />
              <span>Priority Recovery Queue</span>
            </h3>
            <p className="card-subtitle">Active payment issues ranked by probability score and LTV impact</p>
          </div>
          <Link href="/cases" className="btn btn-secondary btn-sm">
            <span>View All ({data.recentCases?.length || 0})</span>
            <IconChevronRight size={14} />
          </Link>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Amount At Risk</th>
                <th>Recovery Probability</th>
                <th>Status</th>
                <th>Prescribed Action</th>
                <th>Timestamp</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.recentCases?.map((c) => (
                <tr key={c.id} onClick={() => router.push(`/cases/${c.id}`)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <CustomerAvatar name={c.customer_name} size={30} showStatus statusColor={c.status === 'recovered' ? 'var(--emerald)' : 'var(--warning)'} />
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.customer_name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="font-mono">{c.id.substring(0, 8)}</span>
                          <button
                            onClick={(e) => handleCopyId(e, c.id)}
                            style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            title="Copy Case ID"
                          >
                            <IconCopy size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="font-mono" style={{ fontWeight: 600, color: '#fb7185' }}>
                      {formatCurrency(c.amount_at_risk)}
                    </span>
                  </td>
                  <td style={{ width: '140px' }}>
                    <ProbabilityBar value={c.recovery_probability} />
                  </td>
                  <td>{getStatusBadge(c.status)}</td>
                  <td>
                    <span className="badge muted" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {c.recommended_action || 'Smart Dunning'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-dim)', fontSize: '11.5px' }}>
                    {new Date(c.opened_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={(e) => handleOpenAction(e, c)}
                      title="Review Intervention"
                    >
                      <IconZap size={13} />
                      <span>Intervene</span>
                    </button>
                  </td>
                </tr>
              ))}
              {(!data.recentCases || data.recentCases.length === 0) && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No recovery cases logged yet. Visit the <Link href="/simulator" style={{ color: '#60a5fa' }}>Sandbox</Link> to inject test scenarios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Modal */}
      <ActionModal
        isOpen={isActionModalOpen}
        onClose={() => setIsActionModalOpen(false)}
        caseItem={selectedCaseForAction}
        onActionSuccess={fetchDashboard}
      />
    </div>
  );
}
