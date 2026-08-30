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

// Custom floating pill tooltip matching the $458.40 tooltip in the reference image
function CustomPillTooltip({ active, payload, label, isCurrency = true }) {
  if (active && payload && payload.length) {
    const item = payload[0];
    const val = item?.value;
    const formatted = isCurrency
      ? `₹${Number(val).toLocaleString('en-IN')}`
      : val;

    return (
      <div
        style={{
          background: '#ffffff',
          color: '#12151d',
          borderRadius: '8px',
          padding: '6px 12px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
          border: '1px solid rgba(0, 173, 180, 0.3)',
          textAlign: 'center',
          pointerEvents: 'none'
        }}
      >
        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '2px' }}>
          {label}
        </div>
        <div
          className="font-mono"
          style={{
            fontSize: '13.5px',
            fontWeight: 800,
            color: '#00ADB4',
            letterSpacing: '-0.02em'
          }}
        >
          {formatted}
        </div>
      </div>
    );
  }
  return null;
}

// Multi-item tooltip for detailed views
function DetailedTooltip({ active, payload, label, isCurrency = true }) {
  if (active && payload && payload.length) {
    return (
      <div
        style={{
          background: '#212832',
          border: '1px solid #3B3E47',
          borderRadius: '10px',
          padding: '10px 14px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
          fontSize: '12px'
        }}
      >
        <div style={{ color: '#cbd5e1', marginBottom: '6px', fontWeight: 600 }}>{label}</div>
        {payload.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: item.color || item.fill
              }}
            />
            <span style={{ color: '#8e9ba9' }}>{item.name}:</span>
            <span className="font-mono" style={{ fontWeight: 700, color: '#ffffff' }}>
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
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#8e9ba9', fontSize: '13px' }}>
        No recovery trend data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 18, right: 12, left: -16, bottom: 0 }}>
        <defs>
          {/* Glowing teal gradient matching the reference image */}
          <linearGradient id="tealAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00FFF5" stopOpacity={0.65} />
            <stop offset="45%" stopColor="#00ADB4" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#00ADB4" stopOpacity={0.0} />
          </linearGradient>

          {/* At-risk subtle gradient */}
          <linearGradient id="riskAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.0} />
          </linearGradient>

          {/* Glow filter for stroke */}
          <filter id="tealGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#3B3E47" strokeOpacity={0.6} vertical={false} />
        
        <XAxis
          dataKey="date"
          stroke="#8e9ba9"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          dy={6}
        />
        
        <YAxis
          stroke="#8e9ba9"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`}
        />

        <Tooltip content={<CustomPillTooltip />} cursor={{ stroke: '#3B3E47', strokeDasharray: '4 4' }} />

        <Legend
          verticalAlign="top"
          align="right"
          iconType="circle"
          wrapperStyle={{ paddingBottom: '12px', fontSize: '12px' }}
        />

        {/* Primary Recovered Curve with Electric Teal Glow */}
        <Area
          type="monotone"
          dataKey="recovered"
          name="Recovered Volume"
          stroke="#00FFF5"
          strokeWidth={2.8}
          fillOpacity={1}
          fill="url(#tealAreaGradient)"
          activeDot={{
            r: 6,
            fill: '#00FFF5',
            stroke: '#ffffff',
            strokeWidth: 2,
            style: { filter: 'drop-shadow(0 0 6px #00FFF5)' }
          }}
        />

        {/* Secondary At-Risk Curve */}
        <Area
          type="monotone"
          dataKey="atRisk"
          name="At Risk Volume"
          stroke="#f43f5e"
          strokeWidth={1.8}
          fillOpacity={1}
          fill="url(#riskAreaGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function FailureReasonsChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#8e9ba9', fontSize: '13px' }}>
        No failure reason data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 24, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="barTealGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00ADB4" />
            <stop offset="100%" stopColor="#00FFF5" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#3B3E47" strokeOpacity={0.6} horizontal={false} />
        <XAxis
          type="number"
          stroke="#8e9ba9"
          fontSize={11}
          tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
        />
        <YAxis
          dataKey="reason"
          type="category"
          stroke="#cbd5e1"
          fontSize={11}
          width={110}
        />
        <Tooltip content={<DetailedTooltip />} />
        <Bar
          dataKey="amount"
          name="Revenue at Risk"
          fill="url(#barTealGradient)"
          radius={[0, 6, 6, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

const PIE_COLORS = {
  open: '#f59e0b',
  in_progress: '#00ADB4',
  recovered: '#00FFF5',
  failed: '#f43f5e',
  stopped: '#3B3E47',
  expired: '#8e9ba9'
};

export function StatusPieChart({ data }) {
  if (!data) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#8e9ba9', fontSize: '13px' }}>
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
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#8e9ba9', fontSize: '13px' }}>
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
          paddingAngle={4}
          dataKey="value"
          stroke="#212832"
          strokeWidth={2}
        >
          {formattedData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.rawKey] || '#00ADB4'} />
          ))}
        </Pie>
        <Tooltip content={<DetailedTooltip isCurrency={false} />} />
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
  let color = 'linear-gradient(90deg, #00ADB4, #00FFF5)';
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
          background: '#3B3E47',
          borderRadius: '9999px',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percentage}%`,
            background: color,
            borderRadius: '9999px',
            boxShadow: value >= 0.6 ? '0 0 6px rgba(0, 255, 245, 0.5)' : 'none'
          }}
        />
      </div>
      <span className="font-mono" style={{ fontSize: '11px', color: '#cbd5e1', minWidth: '28px' }}>
        {percentage}%
      </span>
    </div>
  );
}
