'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '../../page';
import { CustomerAvatar } from '../../components/CustomerAvatar';
import { useToast } from '../../components/ToastContext';
import {
  IconRefresh,
  IconUser,
  IconCard,
  IconWarning,
  IconSuccess,
  IconRupee,
  IconShield,
  IconCoins,
  IconDiscount,
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
      toast.error('Failed to load customer profile');
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
        <div className="skeleton" style={{ height: '36px', width: '150px', marginBottom: '16px' }} />
        <div className="skeleton" style={{ height: '90px', marginBottom: '20px' }} />
        <div className="grid-cols-3" style={{ marginBottom: '20px' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton" style={{ height: '110px' }} />
          ))}
        </div>
      </div>
    );
  }

  const { customer, paymentHistory, recoveryCases, stats } = data;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'recovered':
      case 'succeeded':
      case 'success':
        return <span className="badge success">Success</span>;
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
      {/* Header Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => router.push('/customers')}>
          ← Back to Customers
        </button>
        <button className="btn btn-secondary btn-sm" onClick={fetchCustomer}>
          <IconRefresh size={13} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Customer Header Banner */}
      <div className="card" style={{ marginBottom: '20px', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <CustomerAvatar name={customer?.name || 'Customer'} size={48} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{customer?.name}</h1>
                <span className="badge primary">{customer?.plan_name || 'Standard Tier'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                <span>{customer?.company || 'Direct'}</span>
                <span>•</span>
                <span>{customer?.email}</span>
                <span>•</span>
                <span className="font-mono" style={{ color: 'var(--text-dim)' }}>ID: {customer?.id?.substring(0, 8)}</span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Monthly Recurring (MRR)</div>
            <div className="font-mono" style={{ fontSize: '24px', fontWeight: 700, color: '#34d399', marginTop: '2px' }}>
              {formatCurrency(customer?.mrr)}
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid-cols-3" style={{ marginBottom: '20px' }}>
        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Lifetime Value (LTV)</span>
            <div className="stat-icon-wrapper">
              <IconCoins size={16} />
            </div>
          </div>
          <span className="stat-value">{formatCurrency(customer?.lifetime_value)}</span>
          <div className="stat-footer">
            <span>Total historical billing volume</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Churn Risk Rating</span>
            <div className="stat-icon-wrapper">
              <IconWarning size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: (customer?.risk_score || 0) > 60 ? '#fb7185' : '#60a5fa' }}>
            {customer?.risk_score || 0} <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>/ 100</span>
          </span>
          <div className="stat-footer">
            <span>{(customer?.risk_score || 0) > 60 ? 'High Risk Account' : 'Normal Standing'}</span>
          </div>
        </div>

        <div className="card stat-card">
          <div className="stat-header">
            <span className="stat-label">Payment Success Rate</span>
            <div className="stat-icon-wrapper">
              <IconSuccess size={16} />
            </div>
          </div>
          <span className="stat-value" style={{ color: '#34d399' }}>
            {stats?.paymentSuccessRate || 95}%
          </span>
          <div className="stat-footer">
            <span>Charge authorization rate</span>
          </div>
        </div>
      </div>

      {/* Payment History & Recovery Cases */}
      <div className="grid-cols-2" style={{ marginBottom: '20px' }}>
        {/* Recovery Cases */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <IconShield size={16} color="var(--text-secondary)" />
              <span>Recovery Cases ({recoveryCases?.length || 0})</span>
            </h3>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Status</th>
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
                    <td>
                      <span className="badge muted" style={{ fontSize: '10.5px' }}>{rc.failure_reason}</span>
                    </td>
                    <td>{getStatusBadge(rc.status)}</td>
                    <td style={{ color: 'var(--text-dim)', fontSize: '11.5px' }}>
                      {new Date(rc.opened_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {(!recoveryCases || recoveryCases.length === 0) && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No active or past recovery cases for this subscriber.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Transactions Log */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <IconCard size={16} color="var(--text-secondary)" />
              <span>Payment History ({paymentHistory?.length || 0})</span>
            </h3>
          </div>
          <div className="table-container">
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
                {paymentHistory?.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-mono" style={{ fontWeight: 600 }}>{formatCurrency(p.amount)}</span>
                    </td>
                    <td>{getStatusBadge(p.status)}</td>
                    <td>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{p.method || 'Credit Card'}</span>
                    </td>
                    <td style={{ color: 'var(--text-dim)', fontSize: '11.5px' }}>
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {(!paymentHistory || paymentHistory.length === 0) && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No historical transactions recorded.
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
