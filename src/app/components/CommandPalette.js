'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './ToastContext';
import {
  IconSearch,
  IconDashboard,
  IconCases,
  IconCustomers,
  IconSimulator,
  IconAudit,
  IconRefresh,
  IconZap,
  IconCoins
} from './Icons';

export function CommandPalette({ isOpen, onClose }) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const staticActions = [
    { id: 'nav-overview', label: 'Go to Overview Dashboard', category: 'Navigation', icon: IconDashboard, run: () => router.push('/') },
    { id: 'nav-cases', label: 'Go to Recovery Cases', category: 'Navigation', icon: IconCases, run: () => router.push('/cases') },
    { id: 'nav-customers', label: 'Go to Customer Portfolio', category: 'Navigation', icon: IconCustomers, run: () => router.push('/customers') },
    { id: 'nav-simulator', label: 'Go to Orchestrator Sandbox', category: 'Navigation', icon: IconSimulator, run: () => router.push('/simulator') },
    { id: 'nav-audit', label: 'Go to Compliance & Audit', category: 'Navigation', icon: IconAudit, run: () => router.push('/audit') },
    {
      id: 'act-sweep',
      label: 'Execute Pipeline Sweep (Batch Retry & Evaluation)',
      category: 'Pipeline Action',
      icon: IconRefresh,
      run: async () => {
        toast.info('Triggering recovery pipeline sweep...');
        try {
          const res = await fetch('/api/cron');
          if (res.ok) {
            toast.success('Pipeline sweep executed successfully! Monitored cases refreshed.');
          } else {
            toast.error('Pipeline sweep completed with warnings.');
          }
        } catch {
          toast.error('Failed to trigger pipeline sweep.');
        }
      }
    },
    {
      id: 'act-sim-seed',
      label: 'Reset & Re-seed Simulation Data',
      category: 'Data Management',
      icon: IconCoins,
      run: async () => {
        toast.info('Generating sample transaction cases...');
        try {
          const res = await fetch('/api/simulator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'seed' })
          });
          if (res.ok) {
            toast.success('Simulation database seeded with realistic financial cases!');
            router.refresh();
          }
        } catch {
          toast.error('Failed to seed simulator.');
        }
      }
    },
    {
      id: 'act-sim-event',
      label: 'Simulate Payment Failure Event',
      category: 'Sandbox Test',
      icon: IconZap,
      run: async () => {
        toast.info('Injecting synthetic failure scenario...');
        try {
          const res = await fetch('/api/simulator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'trigger_scenario', params: { scenario: 'random' } })
          });
          const d = await res.json();
          if (d.success) {
            toast.success(`Case #${d.case?.id?.substring(0, 8) || 'new'} created! Recovery workflow initiated.`);
            router.push('/cases');
          }
        } catch {
          toast.error('Scenario injection failed.');
        }
      }
    }
  ];

  const filteredActions = staticActions.filter(action =>
    action.label.toLowerCase().includes(query.toLowerCase()) ||
    action.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(true);
      }
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % (filteredActions.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredActions.length) % (filteredActions.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredActions[selectedIndex]) {
          filteredActions[selectedIndex].run();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredActions, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', borderBottom: '1px solid #3B3E47' }}>
          <IconSearch size={18} color="#00FFF5" />
          <input
            ref={inputRef}
            type="text"
            className="input"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Type a command or jump to page... (e.g. 'cases', 'sweep')"
            style={{
              flex: 1,
              border: 0,
              background: 'transparent',
              fontSize: '14px',
              padding: 0,
              boxShadow: 'none'
            }}
          />
          <span style={{ fontSize: '11px', color: '#5f6d7e', fontFamily: 'monospace' }}>ESC</span>
        </div>

        <div style={{ maxHeight: '340px', overflowY: 'auto', padding: '8px' }}>
          {filteredActions.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: '#8e9ba9' }}>
              No commands matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredActions.map((action, idx) => {
              const IconComponent = action.icon;
              return (
                <div
                  key={action.id}
                  onClick={() => {
                    action.run();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderRadius: 'var(--border-radius-btn)',
                    cursor: 'pointer',
                    background: idx === selectedIndex ? 'rgba(0, 173, 180, 0.15)' : 'transparent',
                    color: idx === selectedIndex ? '#ffffff' : '#cbd5e1',
                    border: idx === selectedIndex ? '1px solid rgba(0, 173, 180, 0.3)' : '1px solid transparent',
                    transition: 'background var(--transition-fast)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ color: idx === selectedIndex ? '#00FFF5' : '#8e9ba9' }}>
                      <IconComponent size={16} />
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>{action.label}</span>
                  </div>
                  <span style={{ fontSize: '10.5px', color: '#5f6d7e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {action.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderTop: '1px solid #3B3E47', background: '#181d26', fontSize: '11px', color: '#5f6d7e' }}>
          <div>Use <kbd style={{ padding: '1px 4px', background: '#212832', border: '1px solid #3B3E47', borderRadius: '3px' }}>↑</kbd> <kbd style={{ padding: '1px 4px', background: '#212832', border: '1px solid #3B3E47', borderRadius: '3px' }}>↓</kbd> to navigate, <kbd style={{ padding: '1px 4px', background: '#212832', border: '1px solid #3B3E47', borderRadius: '3px' }}>↵</kbd> to select</div>
          <div>Recovr Quick Actions</div>
        </div>
      </div>
    </div>
  );
}
