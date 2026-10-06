import '@nexg/ui/globals.css';

import { LocationBanner, LocationSheet, type Place, type ResolutionStep } from '@nexg/location';
import { ToastProvider } from '@nexg/ui';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';

import { cityFromConnection } from '@/app/location-actions';
import { WelcomeConsent } from '@/components/consent/welcome';
import { AfterLocationSettled } from '@/components/location/after-location';
import { SiteLocationProvider } from '@/components/location/provider';
import { FloatingChat } from '@/components/chat/floating-chat';
import { RegisterServiceWorker } from '@/components/notifications/register-sw';
import { canMachineTranslate, getLocale, hasBeenAsked } from '@/lib/i18n';

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * Read on the server, so the page arrives in the right language rather
   * than flashing English and then swapping. `lang` follows it, which is
   * what a screen reader uses to choose a voice.
   */
  const locale = getLocale();
  const asked = hasBeenAsked();

  /*
   * The last rung of the resolution ladder, walked on the server
   * so the page arrives already pointed at a plausible city
   * instead of resolving one after hydration and shifting under
   * the reader.
   *
   * This is the only location work that happens without being
   * asked for, and it is deliberately the weakest kind: an edge
   * header, a city, labelled "from your connection" everywhere
   * it appears, and never enough to lock a price. The browser's
   * own location is not touched here or anywhere else on load —
   * that happens inside a click, in one file, and a test fails
   * the build if it ever happens anywhere else.
   */
  const fromConnection = await cityFromConnection();
  const initial = fromConnection
    ? { place: fromConnection.place as unknown as Place, step: 'ip_city' as ResolutionStep }
    : null;

  return (
    <html lang={locale} className={manrope.variable}>
      <body className="bg-bg text-ink min-h-dvh font-sans">
        <ToastProvider>
          <SiteLocationProvider initial={initial}>
            {/* Under the nav on every page, and only when there is
                something honest to say about precision. */}
            <LocationBanner />
            {children}
            {/* Once per visit, over a rendered page, on the first
                page that needs a place. */}
            <LocationSheet />

            <RegisterServiceWorker />

            {/* Above the footer, below the location sheet. Real
                support: what somebody types here becomes a
                conversation on the concierge desk with a person
                routed to it. */}
            <FloatingChat />

          {/* Rendered only when they have not answered, so a returning
                visitor never sees it and nothing flickers on their screen
                while the client works out whether to hide it — and only
                once the location question is settled, so the two first-visit
                asks queue rather than stack. */}
            {!asked && (
              <AfterLocationSettled>
                <WelcomeConsent locale={locale} canTranslate={canMachineTranslate()} />
              </AfterLocationSettled>
            )}
          </SiteLocationProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
