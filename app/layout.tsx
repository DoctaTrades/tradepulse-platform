import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TradePulse Platform',
  description: 'Trading journal, options screener, and research — all in one platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
