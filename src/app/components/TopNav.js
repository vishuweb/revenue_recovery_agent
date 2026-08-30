'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CommandPalette } from './CommandPalette';
import { useToast } from './ToastContext';
import {
  IconSearch,
  IconRefresh,
  IconChevronRight,
  IconBell,
  IconSparkles
} from './Icons';

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);

  const getPageInfo = () => {
    if (pathname === '/') return { title: 'Overview', section: 'Dashboard' };
    if (pathname.startsWith('/analyze')) return { title: 'Run Your Data', section: 'Intelligence' };
    if (pathname.startsWith('/cases')) return { title: pathname === '/cases' ? 'Recovery Cases' : 'Case Detail', section: 'Operations' };
    if (pathname.startsWith('/customers')) return { title: pathname === '/customers' ? 'Customer Portfolio' : 'Customer Profile', section: 'Operations' };
    if (pathname.startsWith('/simulator')) return { title: 'Orchestrator Sandbox', section: 'Tools' };
    if (pathname.startsWith('/audit')) return { title: 'Compliance & Audit', section: 'Tools' };
    return { title: 'Overview', section: 'Dashboard' };
  };

  const { title, section } = getPageInfo();

  const handleRunSweep = async () => {
    setIsSweeping(true);
    toast.info('Initiating automated recovery pipeline sweep...');
    try {
      const res = await fetch('/api/cron');
      if (res.ok) {
        toast.success('Pipeline sweep completed. Cases updated.');
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
          <div className="breadcrumb">
            <span>{section}</span>
            <span className="breadcrumb-sep">
              <IconChevronRight size={12} color="var(--text-faint)" />
            </span>
            <span className="breadcrumb-current">{title}</span>
          </div>
        </div>

        <div className="top-nav-right">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setIsCommandOpen(true)}
            title="Quick Search and Navigation (Ctrl+K)"
            style={{ minWidth: '190px', justifyContent: 'space-between', color: 'var(--text-secondary)', gap: '10px' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <IconSearch size={13} color="var(--text-muted)" />
              <span style={{ fontSize: '12px' }}>Quick Search</span>
            </span>
            <span className="kbd">Ctrl K</span>
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRunSweep}
            disabled={isSweeping}
            title="Execute scheduled recovery evaluation across active cases"
          >
            <IconRefresh size={13} className={isSweeping ? 'spin' : ''} color="var(--text-secondary)" />
            <span>{isSweeping ? 'Evaluating...' : 'Run Pipeline'}</span>
          </button>

          <button
            className="btn btn-ghost btn-icon"
            title="Notifications"
            style={{ color: 'var(--text-muted)', position: 'relative' }}
          >
            <IconBell size={16} />
            <span
              style={{
                position: 'absolute',
                top: '6px', right: '6px',
                width: '6px', height: '6px',
                borderRadius: '50%',
                background: 'var(--danger)',
                border: '1.5px solid var(--bg-color)',
                boxShadow: '0 0 5px var(--danger-glow)'
              }}
            />
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => router.push('/analyze')}
            title="Upload and Analyze Your Dataset"
          >
            <IconSparkles size={14} />
            <span>Run Your Data</span>
          </button>
        </div>
      </header>

      <CommandPalette isOpen={isCommandOpen} onClose={() => setIsCommandOpen(false)} />
    </>
  );
}
