'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ToastProvider } from './components/ToastContext';
import { TopNav } from './components/TopNav';
import {
  IconDashboard,
  IconAnalytics,
  IconCases,
  IconCustomers,
  IconSimulator,
  IconAudit,
  IconSettings,
  IconSparkles
} from './components/Icons';

const navGroups = [
  {
    label: 'Main',
    links: [
      { href: '/', label: 'Overview', icon: IconDashboard, badge: 'live' },
      { href: '/analyze', label: 'Run Your Data', icon: IconAnalytics, badge: 'dynamic' },
      { href: '/cases', label: 'Recovery Cases', icon: IconCases },
      { href: '/customers', label: 'Customer Portfolio', icon: IconCustomers },
    ]
  },
  {
    label: 'Tools',
    links: [
      { href: '/simulator', label: 'Orchestrator Sandbox', icon: IconSimulator, badge: 'sandbox' },
      { href: '/audit', label: 'Compliance & Audit', icon: IconAudit },
    ]
  }
];

export default function RootLayout({ children }) {
  const pathname = usePathname();

  return (
    <html lang="en">
      <head>
        <title>Recovr - Revenue Recovery & Payment Orchestration</title>
        <meta name="description" content="Autonomous Revenue Recovery and Payment Dispute Resolution Platform" />
      </head>
      <body>
        <ToastProvider>
          <div className="app-layout">
            <aside className="sidebar">
              <Link className="brand" href="/" aria-label="Recovr home">
                <div className="brand-icon">
                  <IconSparkles size={17} color="#fff" />
                </div>
                <div className="brand-info">
                  <span className="brand-title">Recovr</span>
                  <span className="brand-subtitle">Revenue Engine</span>
                </div>
              </Link>

              <nav className="nav-section" aria-label="Main navigation">
                {navGroups.map((group) => (
                  <div key={group.label} style={{ marginBottom: '6px' }}>
                    <div className="nav-label">{group.label}</div>
                    <ul className="nav-menu">
                      {group.links.map((link) => {
                        const isActive = pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href));
                        const IconComponent = link.icon;
                        return (
                          <li key={link.href}>
                            <Link
                              href={link.href}
                              className={`nav-link${isActive ? ' active' : ''}`}
                            >
                              <span className="nav-icon">
                                <IconComponent size={17} />
                              </span>
                              <span style={{ flex: 1 }}>{link.label}</span>
                              {link.badge && (
                                <span className={`nav-badge nav-badge-${link.badge}`}>
                                  {link.badge === 'live' ? 'Live' : link.badge === 'dynamic' ? 'AI' : 'Sandbox'}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>

              <div className="sidebar-footer">
                <div className="system-status">
                  <span className="status-dot" />
                  <span style={{ flex: 1, fontSize: '11.5px' }}>Engine Online</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--text-faint)' }}>
                    v2.4.0
                  </span>
                </div>

                <div className="sidebar-user">
                  <div className="sidebar-user-avatar">RA</div>
                  <div className="sidebar-user-info">
                    <div className="sidebar-user-name">Admin User</div>
                    <div className="sidebar-user-role">Revenue Operations</div>
                  </div>
                  <div style={{ color: 'var(--text-faint)', display: 'flex' }}>
                    <IconSettings size={14} />
                  </div>
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
      </body>
    </html>
  );
}
