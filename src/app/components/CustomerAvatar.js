'use client';

import React from 'react';

const GRADIENTS = [
  'linear-gradient(135deg, #00ADB4, #00FFF5)',
  'linear-gradient(135deg, #212832, #3B3E47)',
  'linear-gradient(135deg, #008187, #00ADB4)',
  'linear-gradient(135deg, #28303d, #525763)',
  'linear-gradient(135deg, #005f63, #00d2da)',
  'linear-gradient(135deg, #181d26, #3B3E47)'
];

export function CustomerAvatar({ name = 'Customer', size = 32, showStatus = false, statusColor = '#00FFF5' }) {
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
          border: '1px solid #3B3E47',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)'
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
            border: '2px solid #212832',
            boxShadow: `0 0 5px ${statusColor}`
          }}
        />
      )}
    </div>
  );
}
