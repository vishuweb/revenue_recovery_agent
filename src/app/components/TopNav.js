'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CommandPalette } from './CommandPalette';
import { useToast } from './ToastContext';
import {
  IconSearch,
  IconRefresh,
  IconSimulator,
  IconZap,
  IconChevronRight
} from './Icons';

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);

  const getPageTitle = () => {
    if (pathname === '/') return 'Overview';
    if (pathname.startsWith('/cases')) return pathname === '/cases' ? 'Recovery Cases' : 'Case Detail';
    if (pathname.startsWith('/customers')) return pathname === '/customers' ? 'Customer Portfolio' : 'Customer Profile';
    if (pathname.startsWith('/simulator')) return 'Orchestrator Sandbox';
    if (pathname.startsWith('/audit')) return 'Compliance & Audit';
    return 'Operations';
  };

  const handleRunSweep = async () => {
    setIsSweeping(true);
    toast.info('Initiating automated recovery pipeline sweep...');
    try {
      const res = await fetch('/api/cron');
      if (res.ok) {
        toast.success('Pipeline sweep completed successfully. Cases updated.');
        router.refresh();
      } else {
        toast.warning('Pipeline sweep concluded with warnings.');
      }
    } catch {
      toast.error('Network failure executing pipeline sweep.');
    } finally {
      setIsSweeping(false);
    }
  };

  return (
    <>
      <header className="top-nav">
        <div className="top-nav-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#8e9ba9' }}>
            <span>Operations</span>
            <IconChevronRight size={12} color="#5f6d7e" />
            <span style={{ color: '#ffffff', fontWeight: 600 }}>{getPageTitle()}</span>
          </div>
        </div>

        <div className="top-nav-right">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setIsCommandOpen(true)}
            title="Quick Search & Navigation (Ctrl+K)"
            style={{ minWidth: '210px', justifyContent: 'space-between', color: '#cbd5e1' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconSearch size={14} color="#8e9ba9" />
              <span style={{ fontSize: '12.5px' }}>Quick Search</span>
            </span>
            <kbd
              style={{
                fontSize: '10px',
                padding: '2px 5px',
                background: '#212832',
                border: '1px solid #3B3E47',
                borderRadius: '4px',
                color: '#00FFF5',
                fontFamily: 'monospace'
              }}
            >
              ⌘K
            </kbd>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRunSweep}
            disabled={isSweeping}
            title="Execute scheduled recovery evaluation across active cases"
          >
            <IconRefresh size={14} className={isSweeping ? 'spin' : ''} />
            <span>{isSweeping ? 'Evaluating...' : 'Run Pipeline'}</span>
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => router.push('/simulator')}
            title="Launch Sandbox"
          >
            <IconSimulator size={15} />
            <span>Sandbox</span>
          </button>
        </div>
      </header>

      <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />
    </>
  );
}
