import '@nexg/ui/globals.css';

import { ToastProvider } from '@nexg/ui';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';

/**
 * Manrope 400/600/700/800 (spec section 2), self-hosted by next/font so there
 * is no render-blocking request to Google on a 3G connection.
 */
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: {
    default: 'NexG Concierge',
    template: '%s · NexG',
  },
  description:
    'Tell us where you are staying and what you need. A vetted local concierge delivers it to your door.',
};

export const viewport: Viewport = {
  themeColor: '#F6F3EC',
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
