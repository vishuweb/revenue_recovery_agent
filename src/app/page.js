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
  const [loadError, setLoadError] = useState(null);
  const [timeframe, setTimeframe] = useState('week');
  const [segmentedView, setSegmentedView] = useState('telemetry');
  const [selectedCaseForAction, setSelectedCaseForAction] = useState(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Dashboard request failed (${res.status})`);
      setData(json);
      setLoadError(null);
    } catch (e) {
      console.error(e);
      setLoadError(e.message || 'Unable to load dashboard data');
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

  if (loading) {
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

  if (loadError || !data) {
    return (
      <div className="card" style={{ maxWidth: '620px', margin: '48px auto', textAlign: 'center', padding: '32px' }}>
        <h1 className="hero-title" style={{ fontSize: '24px' }}>Dashboard unavailable</h1>
        <p style={{ color: '#8e9ba9', margin: '12px 0 20px' }}>{loadError || 'No dashboard data was returned.'}</p>
        <button className="btn btn-primary" onClick={() => { setLoading(true); fetchDashboard(); }}>
          <IconRefresh size={14} /> Retry loading
        </button>
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
            Autonomous Revenue Recovery
          </div>
          <h1 className="hero-title">
            Revenue Recovery & <em>Orchestration</em>
          </h1>
          <p className="hero-subtitle">
            Autonomous retry orchestration, dunning automation, and personalized churn prevention workflows.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Segmented Switcher (like Expenses / Income in reference image) */}
          <div className="segmented-pill">
            <button
              className={`segmented-pill-btn ${segmentedView === 'telemetry' ? 'active' : ''}`}
              onClick={() => setSegmentedView('telemetry')}
            >
              Live Telemetry
            </button>
            <button
              className={`segmented-pill-btn ${segmentedView === 'queue' ? 'active' : ''}`}
              onClick={() => {
                setSegmentedView('queue');
                router.push('/cases');
              }}
            >
              Priority Queue
            </button>
          </div>

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
        </div>
      </div>

      {/* Main Volume Display & Timeframe Filter Bar (matching reference layout) */}
      <div
        className="card"
        style={{
          marginBottom: '24px',
          background: 'linear-gradient(180deg, #212832 0%, #1a202c 100%)',
          border: '1px solid #3B3E47',
          padding: '24px 28px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#8e9ba9', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
              Total Processed Volume
            </div>
            <div className="font-mono" style={{ fontSize: '36px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {formatCurrency(data.totalRevenue)}
            </div>
          </div>

          {/* Timeframe selector: Day | Week | Month | Year | [📅] */}
          <div className="timeframe-bar">
            {['day', 'week', 'month', 'year'].map((t) => (
              <span
                key={t}
                className={`timeframe-item ${timeframe === t ? 'active' : ''}`}
                onClick={() => setTimeframe(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </span>
            ))}
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: '#28303d',
                border: '1px solid #3B3E47',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00FFF5',
                cursor: 'pointer'
              }}
              title="Select custom date range"
            >
              <IconAnalytics size={14} />
            </div>
          </div>
        </div>

        {/* 30-Day Glowing Area Chart directly embedded in the hero card */}
        <div style={{ height: '240px', width: '100%', marginTop: '20px' }}>
          <RevenueChart data={data.recoveryTrend} />
        </div>
      </div>

      {/* Dual-Contrast Category / Metric Cards (Featured Teal + Slate Graphite) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>Performance Metrics</h3>
        <Link href="/cases" style={{ fontSize: '12px', color: '#00FFF5', textDecoration: 'none', fontWeight: 600 }}>
          View All Analytics →
        </Link>
      </div>

      <div className="grid-cols-4" style={{ marginBottom: '24px' }}>
        {/* Card 1: FEATURED VIBRANT TEAL CARD (matches the active "Taxi" card from image) */}
        <div className="card-featured-teal stat-card">
          <div className="stat-header">
            <span className="stat-label">Net Recovered</span>
            <div className="stat-icon-wrapper">
              <IconSuccess size={18} />
            </div>
          </div>
          <span className="stat-value">{formatCurrency(data.revenueRecovered)}</span>
          <div className="stat-footer">
            <span style={{ fontWeight: 700 }}>Rescued from Churn</span>
          </div>
        </div>

        {/* Card 2: Slate Card with Danger Accent */}
        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Revenue At Risk</span>
            <div className="stat-icon-wrapper" style={{ color: '#fb7185', background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.28)' }}>
              <IconWarning size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: '#fb7185' }}>{formatCurrency(data.revenueAtRisk)}</span>
          <div className="stat-footer">
            <span className="badge danger" style={{ fontSize: '10.5px' }}>{data.activeCases || 0} active cases</span>
          </div>
        </div>

        {/* Card 3: Slate Card with Conversion Accent */}
        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Recovery Conversion</span>
            <div className="stat-icon-wrapper">
              <IconAnalytics size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: '#00FFF5' }}>{data.recoveryRate || 0}%</span>
          <div className="stat-footer">
            <span className="stat-trend-up">
              <IconTrendUp size={14} />
              <span>+28%</span>
            </span>
            <span>vs baseline dunning</span>
          </div>
        </div>

        {/* Card 4: Slate Card with Net ROI */}
        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Net Agent ROI</span>
            <div className="stat-icon-wrapper">
              <IconShield size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: '#00FFF5' }}>
            {formatCurrency((data.revenueRecovered || 0) - (data.interventionCost || 0))}
          </span>
          <div className="stat-footer">
            <span className="stat-trend-up">
              <IconTrendUp size={14} />
              <span>Positive ROI</span>
            </span>
            <span>net profit</span>
          </div>
        </div>
      </div>

      {/* Analytics Breakdown Grid */}
      <div className="grid-cols-2" style={{ marginBottom: '24px' }}>
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">
                <IconWarning size={16} color="#f59e0b" />
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
                <IconCases size={16} color="#00FFF5" />
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
              <IconZap size={16} color="#00FFF5" />
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
                      <CustomerAvatar name={c.customer_name} size={30} showStatus statusColor={c.status === 'recovered' ? '#00FFF5' : '#f59e0b'} />
                      <div>
                        <div style={{ fontWeight: 600, color: '#ffffff' }}>{c.customer_name}</div>
                        <div style={{ fontSize: '11px', color: '#8e9ba9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="font-mono">{c.id.substring(0, 8)}</span>
                          <button
                            onClick={(e) => handleCopyId(e, c.id)}
                            style={{ background: 'transparent', border: 0, color: '#8e9ba9', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
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
                    <span className="badge muted" style={{ fontSize: '11px', color: '#cbd5e1' }}>
                      {c.recommended_action || 'Smart Dunning'}
                    </span>
                  </td>
                  <td style={{ color: '#8e9ba9', fontSize: '11.5px' }}>
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
                  <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: '#8e9ba9' }}>
                    No recovery cases logged yet. Visit the <Link href="/simulator" style={{ color: '#00FFF5' }}>Sandbox</Link> to inject test scenarios.
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
