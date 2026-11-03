import type { ReactNode } from 'react';
import '@nexg/ui/globals.css';

import { ToastProvider } from '@nexg/ui';
import type { Metadata, Viewport } from 'next';
import { RegisterServiceWorker } from '@/components/notifications/register-sw';

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
  themeColor: '#F6F3EC',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <head>
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
      <body className="bg-bg text-ink min-h-dvh font-sans">
        <ToastProvider>{children}</ToastProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
