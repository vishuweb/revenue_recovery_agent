'use client';

import Link from 'next/link';
import { IconWarning, IconChevronRight } from './components/Icons';

export default function NotFound() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        padding: '32px'
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '14px',
          background: 'rgba(0, 173, 180, 0.12)',
          border: '1px solid rgba(0, 173, 180, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#00FFF5',
          marginBottom: '18px'
        }}
      >
        <IconWarning size={28} />
      </div>
      <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
        Page Not Found
      </h2>
      <p style={{ fontSize: '13.5px', color: '#8e9ba9', maxWidth: '400px', marginBottom: '24px' }}>
        The requested resource or recovery case could not be located in the telemetry system.
      </p>
      <Link href="/" className="btn btn-primary btn-sm">
        <span>Return to Overview</span>
        <IconChevronRight size={14} />
      </Link>
    </div>
  );
}