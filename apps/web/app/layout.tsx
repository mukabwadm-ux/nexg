import '@nexg/ui/globals.css';

import { ToastProvider } from '@nexg/ui';
import type { Metadata, Viewport } from 'next';
import { RegisterServiceWorker } from '@/components/notifications/register-sw';
import { REVEAL_SCRIPT } from '@/components/reveal-script';
import { LOCALE_SCRIPT } from '@/lib/i18n/script';
import { THEME_SCRIPT } from '@/components/theme/script';
import { ThemeSync } from '@/components/theme/theme-sync';

export const metadata: Metadata = {
  title: {
    default: 'NexG Concierge',
    template: '%s · NexG',
  },
  description:
    'Tell us where you are staying and what you need. A vetted local concierge delivers it to your door.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'NexG', statusBarStyle: 'default' },
  applicationName: 'NexG',
};

/*
 * What makes it installable. `appleWebApp` is what lets an
 * iPhone add it to the home screen as an app — and on iOS that
 * is also the only way web push works at all, so the two are
 * the same switch.
 */
export const viewport: Viewport = {
  /* The browser bar takes the page colour, cream or night, like an app's. */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F3EC' },
    { media: '(prefers-color-scheme: dark)', color: '#111315' },
  ],
  width: 'device-width',
  initialScale: 1,
  /* Edge to edge on phones with a notch; the fixed bars keep clear of it. */
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* The theme class is set by THEME_SCRIPT before React loads, hence the warning opt-out. */
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Light or dark before the first paint: no flash for dark-mode visitors. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* The chosen language and its direction (Arabic is right to left) before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: LOCALE_SCRIPT }} />
        {/* Homepage entrances: their items first appear through the animation. */}
        <script dangerouslySetInnerHTML={{ __html: REVEAL_SCRIPT }} />
        <link
          rel="preload"
          href="/fonts/manrope/v1/manrope-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-css-tags -- Static font faces bypass the development CSS compiler. */}
        <link rel="stylesheet" href="/fonts/manrope/v1/manrope.css" />
      </head>
      <body className="bg-bg text-page min-h-dvh font-sans">
        <ThemeSync />
        <ToastProvider>{children}</ToastProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
