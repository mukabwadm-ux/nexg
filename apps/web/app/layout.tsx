import '@nexg/ui/globals.css';

import { ToastProvider } from '@nexg/ui';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';

import { PersonalizedChrome } from '@/components/consent/personalized-chrome';
import { WelcomeGate } from '@/components/consent/welcome-gate';
import { LocationBannerSlot, LocationSheetSlot } from '@/components/location/chrome';
import { SiteLocationProvider } from '@/components/location/provider';
import { RegisterServiceWorker } from '@/components/notifications/register-sw';
import { DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';
import { canMachineTranslate } from '@/lib/i18n/translate';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body className="bg-bg text-ink min-h-dvh font-sans">
        <ToastProvider>
          <SiteLocationProvider initial={null}>
            {/* Under the nav on every page, and only when there is
                something honest to say about precision. */}
            <LocationBannerSlot />
            {children}
            {/* Once per visit, over a rendered page, on the first
                page that needs a place. */}
            <LocationSheetSlot />

            <RegisterServiceWorker />
            <PersonalizedChrome />

            {/* Real support: what somebody types here becomes a
                conversation on the concierge desk, routed to a
                person.

                Held back until the consent bar has been answered.
                That bar is a full-width strip at the bottom of the
                screen and sits above this button, so showing them
                together puts a button on screen that cannot be
                pressed — which reads as broken rather than as
                "answer this first". */}
            <WelcomeGate locale={DEFAULT_LOCALE} canTranslate={canMachineTranslate()} />
          </SiteLocationProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
