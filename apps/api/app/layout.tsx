import '@nexg/ui/globals.css';
import './site.css';

import { ToastProvider } from '@nexg/ui';
// Manrope 400/600/700/800 from the repo, never fetched at build time.
import { manrope } from '@nexg/ui/fonts/manrope';
import type { Metadata, Viewport } from 'next';

import { LanguagePreferenceProvider } from '@/components/docs/code';
import { Masthead } from '@/components/site/masthead';
import { SiteFooter } from '@/components/site/site-footer';
import { navForClient } from '@/lib/reference/navigation';

/**
 * The NexG API at api.nexgapp.com: the endpoints under /v1, the developer
 * documentation, and the console that issues keys.
 */

export const metadata: Metadata = {
  metadataBase: new URL('https://api.nexgapp.com'),
  title: {
    default: 'NexG API for developers',
    template: '%s · NexG API',
  },
  description:
    'Build on NexG: read live merchants, catalogues, delivery zones and experiences, read your own orders, and send signed events back to NexG.',
};

export const viewport: Viewport = {
  themeColor: '#141414',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="bg-bg text-ink flex min-h-dvh flex-col font-sans">
        <a
          href="#content"
          className="bg-gold text-ink sr-only z-50 rounded-md px-4 py-2 text-sm font-bold focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
        >
          Skip to content
        </a>
        <ToastProvider>
          <LanguagePreferenceProvider>
            <Masthead nav={navForClient()} />
            <div id="content" className="flex flex-1 flex-col">
              {children}
            </div>
            <SiteFooter />
          </LanguagePreferenceProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
