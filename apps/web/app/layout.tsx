import '@nexg/ui/globals.css';

import { ToastProvider } from '@nexg/ui';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';

import { WelcomeConsent } from '@/components/consent/welcome';
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
};

export const viewport: Viewport = {
  themeColor: '#F6F3EC',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * Read on the server, so the page arrives in the right language rather
   * than flashing English and then swapping. `lang` follows it, which is
   * what a screen reader uses to choose a voice.
   */
  const locale = getLocale();
  const asked = hasBeenAsked();

  return (
    <html lang={locale} className={manrope.variable}>
      <body className="bg-bg text-ink min-h-dvh font-sans">
        <ToastProvider>
          {children}
          {/* Rendered only when they have not answered, so a returning
              visitor never sees it and nothing flickers on their screen
              while the client works out whether to hide it. */}
          {!asked && <WelcomeConsent locale={locale} canTranslate={canMachineTranslate()} />}
        </ToastProvider>
      </body>
    </html>
  );
}
