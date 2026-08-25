'use client';

import React from 'react';

const GRADIENTS = [
  'linear-gradient(135deg, #1e293b, #334155)',
  'linear-gradient(135deg, #1e3a8a, #2563eb)',
  'linear-gradient(135deg, #065f46, #059669)',
  'linear-gradient(135deg, #3730a3, #4f46e5)',
  'linear-gradient(135deg, #075985, #0284c7)',
  'linear-gradient(135deg, #78350f, #d97706)'
];

export function CustomerAvatar({ name = 'Customer', size = 32, showStatus = false, statusColor = 'var(--emerald)' }) {
  const getInitials = (str) => {
    if (!str) return 'C';
    const parts = str.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const getGradientIndex = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % GRADIENTS.length;
  };

  const initials = getInitials(name);
  const bgGradient = GRADIENTS[getGradientIndex(name)];

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          background: bgGradient,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontWeight: 700,
          fontSize: `${Math.max(10, Math.floor(size * 0.38))}px`,
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)'
        }}
        title={name}
      >
        {initials}
      </div>
      {showStatus && (
        <span
          style={{
            position: 'absolute',
            bottom: '-1px',
            right: '-1px',
            width: `${Math.max(7, Math.floor(size * 0.28))}px`,
            height: `${Math.max(7, Math.floor(size * 0.28))}px`,
            borderRadius: '50%',
            backgroundColor: statusColor,
            border: '2px solid #0b0e16',
            boxShadow: `0 0 4px ${statusColor}`
          }}
        />
      )}
    </div>
  );
}
