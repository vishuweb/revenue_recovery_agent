'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '../../page';
import { CustomerAvatar } from '../../components/CustomerAvatar';
import { useToast } from '../../components/ToastContext';
import {
  IconUser,
  IconCard,
  IconWarning,
  IconSuccess,
  IconCases,
  IconRefresh,
  IconCoins,
  IconTrendUp,
  IconChevronRight
} from '../../components/Icons';

export default function CustomerDetailPage({ params }) {
  const router = useRouter();
  const toast = useToast();
  const unwrappedParams = React.use(params);
  const id = unwrappedParams.id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCustomer = async () => {
    try {
      const res = await fetch(`/api/customers/${id}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.error('Customer not found');
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load customer');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomer();
  }, [id]);

  if (loading || !data) {
    return (
      <div className="animate-fade-in">
        <div className="skeleton" style={{ height: '36px', width: '140px', marginBottom: '16px' }} />
        <div className="skeleton" style={{ height: '100px', marginBottom: '20px' }} />
        <div className="grid-cols-4" style={{ marginBottom: '20px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: '110px' }} />
          ))}
        </div>
      </div>
    );
  }

  const { customer, subscription, payments, recoveryCases, stats } = data;

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
      {/* Header Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => router.push('/customers')}>
          ← Back to Portfolio
        </button>
        <button className="btn btn-secondary btn-sm" onClick={fetchCustomer}>
          <IconRefresh size={13} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Customer Header Card */}
      <div className="card" style={{ marginBottom: '20px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <CustomerAvatar name={customer?.name || 'Customer'} size={52} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: '#ffffff' }}>{customer?.name}</h1>
                <span className="badge primary">{customer?.plan_name || 'Pro Tier'}</span>
                {customer?.churn_risk_score > 0.6 ? (
                  <span className="badge danger">High Churn Risk</span>
                ) : (
                  <span className="badge success">Healthy Account</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', color: '#cbd5e1', fontSize: '13px' }}>
                <span>{customer?.company || 'Company'}</span>
                <span>•</span>
                <span>{customer?.email}</span>
                <span>•</span>
                <span className="font-mono" style={{ color: '#5f6d7e' }}>ID: {customer?.id?.substring(0, 8)}</span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#8e9ba9', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Lifetime Value
            </div>
            <div className="font-mono" style={{ fontSize: '26px', fontWeight: 700, color: '#00FFF5', marginTop: '2px' }}>
              {formatCurrency(customer?.lifetime_value)}
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid-cols-4" style={{ marginBottom: '20px' }}>
        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Monthly Revenue (MRR)</span>
            <div className="stat-icon-wrapper">
              <IconCoins size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: '#00FFF5' }}>
            {formatCurrency(customer?.mrr)}
          </span>
          <div className="stat-footer">
            <span>Billed monthly</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Payment Success</span>
            <div className="stat-icon-wrapper">
              <IconSuccess size={16} />
            </div>
          </div>
          <span className="stat-value">
            {customer?.payment_success_rate || 95}%
          </span>
          <div className="stat-footer">
            <span>Historical reliability</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Total Transactions</span>
            <div className="stat-icon-wrapper">
              <IconCard size={16} />
            </div>
          </div>
          <span className="stat-value">
            {stats?.totalPayments || payments?.length || 0}
          </span>
          <div className="stat-footer">
            <span>{stats?.failedPayments || 0} declines logged</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Active Dunning Cases</span>
            <div className="stat-icon-wrapper">
              <IconCases size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: recoveryCases?.length > 0 ? '#fb7185' : '#00FFF5' }}>
            {recoveryCases?.length || 0}
          </span>
          <div className="stat-footer">
            <span>{recoveryCases?.length > 0 ? 'Requires attention' : 'All clear'}</span>
          </div>
        </div>
      </div>

      {/* Tables Row: Recent Payments and Recovery History */}
      <div className="grid-cols-2" style={{ marginBottom: '20px' }}>
        {/* Payment History */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <IconCard size={16} color="#cbd5e1" />
              <span>Transaction History</span>
            </h3>
            <span className="badge muted">{payments?.length || 0} charges</span>
          </div>

          <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments?.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-mono" style={{ fontWeight: 600, color: p.status === 'succeeded' ? '#ffffff' : '#fb7185' }}>
                        {formatCurrency(p.amount)}
                      </span>
                    </td>
                    <td>
                      {p.status === 'succeeded' ? (
                        <span className="badge success">Paid</span>
                      ) : (
                        <span className="badge danger">Failed</span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: '#cbd5e1' }}>
                      {p.payment_method || 'Credit Card'}
                    </td>
                    <td style={{ fontSize: '11.5px', color: '#8e9ba9' }}>
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}

                {(!payments || payments.length === 0) && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: '#8e9ba9' }}>
                      No payment records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recovery Cases History */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <IconCases size={16} color="#cbd5e1" />
              <span>Recovery Interventions</span>
            </h3>
            <span className="badge primary">{recoveryCases?.length || 0} cases</span>
          </div>

          <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {recoveryCases?.map((rc) => (
                  <tr key={rc.id} onClick={() => router.push(`/cases/${rc.id}`)}>
                    <td>
                      <span className="font-mono" style={{ fontWeight: 600, color: '#fb7185' }}>
                        {formatCurrency(rc.amount_at_risk)}
                      </span>
                    </td>
                    <td>{getStatusBadge(rc.status)}</td>
                    <td style={{ fontSize: '11.5px', color: '#00FFF5' }}>
                      {rc.recommended_action || 'Smart Dunning'}
                    </td>
                    <td style={{ fontSize: '11.5px', color: '#8e9ba9' }}>
                      {new Date(rc.opened_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}

                {(!recoveryCases || recoveryCases.length === 0) && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: '#8e9ba9' }}>
                      No past recovery incidents for this account.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}