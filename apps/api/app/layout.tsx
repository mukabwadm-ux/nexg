import '@nexg/ui/globals.css';

import { ToastProvider } from '@nexg/ui';
// Manrope 400/600/700/800 from the repo, never fetched at build time.
import { manrope } from '@nexg/ui/fonts/manrope';
import type { Metadata } from 'next';

/**
 * The NexG public API.
 *
 * Read-only endpoints for public consumers, plus the documentation and
 * the developer console that make them usable.
 */

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
