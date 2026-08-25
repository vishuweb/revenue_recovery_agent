'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ToastProvider } from './components/ToastContext';
import { TopNav } from './components/TopNav';
import {
  IconDashboard,
  IconCases,
  IconCustomers,
  IconSimulator,
  IconAudit,
  IconZap,
  IconShield
} from './components/Icons';

export default function RootLayout({ children }) {
  const pathname = usePathname();
  const navLinks = [
    { href: '/', label: 'Overview', icon: IconDashboard, badge: 'Live' },
    { href: '/cases', label: 'Recovery Cases', icon: IconCases },
    { href: '/customers', label: 'Customer Portfolio', icon: IconCustomers },
    { href: '/simulator', label: 'Orchestrator Sandbox', icon: IconSimulator, badge: 'Sandbox' },
    { href: '/audit', label: 'Compliance & Audit', icon: IconAudit },
  ];

  return (
    <html lang="en">
      <head>
        <title>Recovr — Revenue Recovery & Payment Orchestration</title>
        <meta name="description" content="Autonomous Revenue Recovery & Payment Dispute Resolution Platform" />
      </head>
      <body>
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
                                fontSize: '10.5px',
                                fontWeight: 700,
                                padding: '1px 7px',
                                borderRadius: '9999px',
                                background: link.badge === 'Live' ? 'var(--emerald-soft)' : 'rgba(255, 255, 255, 0.06)',
                                color: link.badge === 'Live' ? 'var(--emerald)' : 'var(--text-secondary)',
                                border: `1px solid ${link.badge === 'Live' ? 'var(--emerald-border)' : 'var(--glass-border)'}`
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
                  <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
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
      </body>
    </html>
  );
}
