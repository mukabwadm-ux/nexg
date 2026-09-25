import '@nexg/ui/globals.css';

import { ToastProvider } from '@nexg/ui';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';

/** Manrope 400/600/700/800 (spec section 2), self-hosted by next/font. */
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: {
    default: 'NexG Admin',
    template: '%s · NexG Admin',
  },
  description: 'Internal console for NexG staff.',
  // The console must never be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#141414',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="bg-bg text-ink min-h-dvh font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
