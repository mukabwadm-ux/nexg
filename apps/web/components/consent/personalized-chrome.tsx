'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

import { WhatsAppButton } from '@/components/chat/whatsapp-button';
import { isLocaleTag } from '@/lib/i18n/dictionaries';
import { isBookingPage } from '@/lib/booking/routes';

const PREFERENCES_UPDATED = 'nexg:preferences-updated';

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  const entry = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

export function notifyPreferencesUpdated(): void {
  window.dispatchEvent(new Event(PREFERENCES_UPDATED));
}

export function PersonalizedChrome() {
  const pathname = usePathname();
  React.useEffect(() => {
    const update = () => {
      const locale = readCookie('nexg_locale');
      if (locale && isLocaleTag(locale)) document.documentElement.lang = locale;
    };

    update();
    window.addEventListener(PREFERENCES_UPDATED, update);
    return () => window.removeEventListener(PREFERENCES_UPDATED, update);
  }, []);

  return isBookingPage(pathname) ? null : <WhatsAppButton />;
}
