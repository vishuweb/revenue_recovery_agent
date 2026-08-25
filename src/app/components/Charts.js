'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

function CustomTooltip({ active, payload, label, isCurrency = true }) {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: '#0d111a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '8px',
          padding: '8px 12px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          fontSize: '12px'
        }}
      >
        <div style={{ color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 }}>{label}</div>
        {payload.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color || item.fill }} />
            <span style={{ color: 'var(--text-muted)' }}>{item.name}:</span>
            <span style={{ fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
              {isCurrency ? `₹${Number(item.value).toLocaleString('en-IN')}` : item.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export function RevenueChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>
        No recovery trend data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorRecovered" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="colorAtRisk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
        <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          stroke="var(--text-muted)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="circle"
          wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }}
        />
        <Area
          type="monotone"
          dataKey="recovered"
          name="Recovered"
          stroke="#10b981"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorRecovered)"
        />
        <Area
          type="monotone"
          dataKey="atRisk"
          name="At Risk"
          stroke="#f43f5e"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorAtRisk)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function FailureReasonsChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>
        No failure reason data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" horizontal={false} />
        <XAxis type="number" stroke="var(--text-muted)" fontSize={11} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
        <YAxis dataKey="reason" type="category" stroke="var(--text-secondary)" fontSize={11} width={110} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="amount" name="Revenue at Risk" fill="url(#barGradient)" radius={[0, 4, 4, 0]}>
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const PIE_COLORS = {
  open: '#f59e0b',
  in_progress: '#2563eb',
  recovered: '#10b981',
  failed: '#f43f5e',
  stopped: '#64748b',
  expired: '#94a3b8'
};

export function StatusPieChart({ data }) {
  if (!data) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>
        No status data available
      </div>
    );
  }

  const formattedData = Object.keys(data)
    .map((key) => ({
      name: key.replace('_', ' '),
      rawKey: key,
      value: data[key]
    }))
    .filter((item) => item.value > 0);

  if (formattedData.length === 0) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>
        No recovery cases logged
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={formattedData}
          cx="50%"
          cy="50%"
          innerRadius={62}
          outerRadius={84}
          paddingAngle={3}
          dataKey="value"
          stroke="none"
        >
          {formattedData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.rawKey] || '#2563eb'} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip isCurrency={false} />} />
        <Legend
          verticalAlign="bottom"
          align="center"
          iconType="circle"
          wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ProbabilityBar({ value = 0.5 }) {
  const percentage = Math.min(100, Math.max(0, Math.round(value * 100)));
  let color = '#10b981';
  if (value < 0.6) color = '#f59e0b';
  if (value < 0.3) color = '#f43f5e';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        maxWidth: '120px'
      }}
      title={`${percentage}% Recovery Probability`}
    >
      <div
        style={{
          flex: 1,
          height: '6px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '9999px',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percentage}%`,
            background: color,
            borderRadius: '9999px'
          }}
        />
      </div>
      <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', minWidth: '28px' }}>
        {percentage}%
      </span>
    </div>
  );
}
