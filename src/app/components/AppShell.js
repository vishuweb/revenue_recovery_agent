'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ToastProvider } from './ToastContext';
import { TopNav } from './TopNav';
import {
  IconDashboard,
  IconCases,
  IconCustomers,
  IconSimulator,
  IconAudit,
  IconZap
} from './Icons';

export function AppShell({ children }) {
  const pathname = usePathname();
  const navLinks = [
    { href: '/', label: 'Overview', icon: IconDashboard, badge: 'Live' },
    { href: '/cases', label: 'Recovery Cases', icon: IconCases },
    { href: '/customers', label: 'Customer Portfolio', icon: IconCustomers },
    { href: '/simulator', label: 'Orchestrator Sandbox', icon: IconSimulator, badge: 'Sandbox' },
    { href: '/audit', label: 'Compliance & Audit', icon: IconAudit },
  ];

  return (
    <ToastProvider>
      <div className="app-layout">
        <aside className="sidebar">
          <Link className="brand" href="/" aria-label="Recovr home">
            <div className="brand-icon">
              <IconZap size={20} />
            </div>
            <div className="brand-info">
              <span className="brand-title">Recovr</span>
              <span className="brand-subtitle">Revenue Engine</span>
            </div>
          </Link>

          <div className="nav-section">
            <div className="nav-label">Operations</div>
            <ul className="nav-menu">
              {navLinks.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href));
                const IconComponent = link.icon;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`nav-link${isActive ? ' active' : ''}`}
                    >
                      <span className="nav-icon">
                        <IconComponent size={18} />
                      </span>
                      <span style={{ flex: 1 }}>{link.label}</span>
                      {link.badge && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '9999px',
                            background: link.badge === 'Live' ? 'rgba(0, 255, 245, 0.12)' : 'rgba(59, 62, 71, 0.6)',
                            color: link.badge === 'Live' ? '#00FFF5' : '#8e9ba9',
                            border: `1px solid ${link.badge === 'Live' ? 'rgba(0, 255, 245, 0.3)' : '#3B3E47'}`
                          }}
                        >
                          {link.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="sidebar-footer">
            <div className="system-status">
              <div className="status-indicator">
                <span className="status-dot" />
                <span>Engine Online</span>
              </div>
              <span className="font-mono" style={{ fontSize: '11px', color: '#5f6d7e' }}>
                v2.4.0
              </span>
            </div>
          </div>
        </aside>

        <div className="main-wrapper">
          <TopNav />
          <main className="main-content">
            <div className="animate-fade-in">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}