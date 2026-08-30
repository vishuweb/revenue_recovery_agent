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
  IconSparkles,
  IconClose,
  IconCoins,
  IconZap,
  IconDatabase,
  IconWorkflow,
  IconAnalytics
} from './Icons';

const STATIC_ACTIONS = [
  { id: 'nav-overview',   label: 'Overview Dashboard',       category: 'Navigate',  icon: IconDashboard,  run: (r) => r.push('/') },
  { id: 'nav-cases',      label: 'Recovery Cases',            category: 'Navigate',  icon: IconCases,      run: (r) => r.push('/cases') },
  { id: 'nav-customers',  label: 'Customer Portfolio',        category: 'Navigate',  icon: IconCustomers,  run: (r) => r.push('/customers') },
  { id: 'nav-simulator',  label: 'Orchestrator Sandbox',      category: 'Navigate',  icon: IconSimulator,  run: (r) => r.push('/simulator') },
  { id: 'nav-audit',      label: 'Compliance and Audit Log',  category: 'Navigate',  icon: IconAudit,      run: (r) => r.push('/audit') },
  { id: 'nav-analyze',    label: 'Run Your Business Data',    category: 'Navigate',  icon: IconAnalytics,  run: (r) => r.push('/analyze') },
  {
    id: 'act-sweep',
    label: 'Execute Pipeline Sweep',
    category: 'Pipeline',
    icon: IconRefresh,
    run: async (r, toast) => {
      toast.info('Triggering recovery pipeline sweep...');
      try {
        const res = await fetch('/api/cron');
        if (res.ok) toast.success('Pipeline sweep executed! Cases refreshed.');
        else toast.error('Pipeline sweep completed with warnings.');
      } catch { toast.error('Failed to trigger pipeline sweep.'); }
    }
  },
  {
    id: 'act-sim-seed',
    label: 'Reset and Re-seed Simulation Data',
    category: 'Data',
    icon: IconDatabase,
    run: async (r, toast) => {
      toast.info('Generating sample transaction cases...');
      try {
        const res = await fetch('/api/simulator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'seed' }) });
        if (res.ok) { toast.success('Simulation database seeded!'); r.refresh(); }
      } catch { toast.error('Failed to seed simulator.'); }
    }
  },
  {
    id: 'act-sim-event',
    label: 'Simulate Payment Failure Event',
    category: 'Sandbox',
    icon: IconZap,
    run: async (r, toast) => {
      toast.info('Injecting synthetic failure scenario...');
      try {
        const res = await fetch('/api/simulator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'trigger_scenario', params: { scenario: 'random' } }) });
        const d = await res.json();
        if (d.success) { toast.success('Case created! Recovery workflow initiated.'); r.push('/cases'); }
      } catch { toast.error('Scenario injection failed.'); }
    }
  }
];

function groupByCategory(actions) {
  const groups = {};
  for (const action of actions) {
    if (!groups[action.category]) groups[action.category] = [];
    groups[action.category].push(action);
  }
  return groups;
}

export function CommandPalette({ isOpen, onClose }) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const filtered = STATIC_ACTIONS.filter(a =>
    a.label.toLowerCase().includes(query.toLowerCase()) ||
    a.category.toLowerCase().includes(query.toLowerCase())
  );

  const grouped = groupByCategory(filtered);

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
        if (isOpen) onClose(); else onClose(true);
      }
      if (!isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(p => (p + 1) % (filtered.length || 1)); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIndex(p => (p - 1 + filtered.length) % (filtered.length || 1)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const action = filtered[selectedIndex];
        if (action) { action.run(router, toast); onClose(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose, router, toast]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '620px', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 18px', borderBottom: '1px solid var(--glass-border)',
          background: 'rgba(4,5,10,0.3)',
        }}>
          <IconSearch size={17} color="var(--primary-glow)" />
          <input
            ref={inputRef}
            type="text"
            className="input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Search commands, pages, actions..."
            style={{ flex: 1, border: 0, background: 'transparent', fontSize: '14px', padding: 0, boxShadow: 'none', color: 'var(--text-primary)' }}
          />
          <span className="kbd">ESC</span>
        </div>

        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <IconSearch size={28} color="var(--text-faint)" />
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>No commands found</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>Try searching for something else</div>
              </div>
            </div>
          ) : (
            Object.entries(grouped).map(([category, actions]) => (
              <div key={category} style={{ marginBottom: '4px' }}>
                <div style={{ padding: '7px 10px 4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-faint)' }}>
                  {category}
                </div>
                {actions.map((action) => {
                  const idx = filtered.indexOf(action);
                  const isSelected = idx === selectedIndex;
                  const IconComponent = action.icon;
                  return (
                    <div
                      key={action.id}
                      onClick={() => { action.run(router, toast); onClose(); }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '9px 12px', borderRadius: '10px', cursor: 'pointer',
                        background: isSelected ? 'rgba(99,102,241,0.10)' : 'transparent',
                        border: '1px solid ' + (isSelected ? 'rgba(99,102,241,0.18)' : 'transparent'),
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                        transition: 'all 100ms ease', position: 'relative',
                      }}
                    >
                      {isSelected && (
                        <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: '3px', borderRadius: '0 2px 2px 0', background: 'var(--primary-gradient)' }} />
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                        <span style={{ color: isSelected ? 'var(--primary-glow)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                          <IconComponent size={15} />
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 500 }}>{action.label}</span>
                      </div>
                      {isSelected && <span className="kbd" style={{ fontSize: '10px' }}>Enter</span>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderTop: '1px solid var(--glass-border)',
          background: 'rgba(4,5,10,0.4)', fontSize: '11px', color: 'var(--text-faint)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span><span className="kbd">Up</span> <span className="kbd">Down</span> navigate</span>
            <span><span className="kbd">Enter</span> select</span>
            <span><span className="kbd">ESC</span> close</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <IconSparkles size={11} color="var(--primary-glow)" />
            <span>Recovr Command Center</span>
          </div>
        </div>
      </div>
    </div>
  );
}
