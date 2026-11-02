'use client';

import dynamic from 'next/dynamic';
import * as React from 'react';
import { usePathname } from 'next/navigation';

import { useLocation } from '@nexg/location';

import type { Locale } from '@/lib/i18n/dictionaries';

const WelcomeConsent = dynamic(
  () => import('@/components/consent/welcome').then((module) => module.WelcomeConsent),
  { ssr: false },
);

function hasAnswered(): boolean {
  return document.cookie.split(';').some((cookie) => cookie.trim() === 'nexg_asked=1');
}

export function WelcomeGate({ locale, canTranslate }: { locale: Locale; canTranslate: boolean }) {
  const pathname = usePathname();
  const { ready, sheetOpen, asked, place } = useLocation();
  const [showConsent, setShowConsent] = React.useState(false);
  const settled = ready && !sheetOpen && (asked || place !== null);

  React.useEffect(() => {
    setShowConsent(!hasAnswered());
  }, []);

  if (
    pathname === '/merchant-live-preview' ||
    pathname.startsWith('/merchant-live-preview/') ||
    !settled ||
    !showConsent
  )
    return null;
  return <WelcomeConsent locale={locale} canTranslate={canTranslate} />;
}
