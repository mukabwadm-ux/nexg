import '@nexg/ui/globals.css';

import { ToastProvider } from '@nexg/ui';
import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';

/**
 * The NexG public API.
 *
 * Read-only endpoints for public consumers, plus the documentation and
 * the developer console that make them usable.
 */

/**
 * Manrope 400/600/700/800, self-hosted by next/font so there is no
 * render-blocking request to Google. The same face the marketing site
 * and the staff console use, so the API does not feel like a different
 * product.
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
    default: 'NexG API',
    template: '%s - NexG API',
  },
  description: 'NexG public API: merchant catalog, zones, and experiences.',
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