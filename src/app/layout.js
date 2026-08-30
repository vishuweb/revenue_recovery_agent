import './globals.css';
import { AppShell } from './components/AppShell';

export const metadata = {
  title: 'Recovr — Autonomous Revenue Recovery & Payment Orchestration',
  description: 'Autonomous Revenue Recovery & Payment Dispute Resolution Platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}