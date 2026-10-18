'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';

import { isLocaleTag } from '@/lib/i18n/dictionaries';

const PREFERENCES_UPDATED = 'nexg:preferences-updated';
const FloatingChat = dynamic(
  () => import('@/components/chat/floating-chat').then((module) => module.FloatingChat),
  { ssr: false },
);

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
  const [asked, setAsked] = React.useState(false);

  React.useEffect(() => {
    const update = () => {
      const locale = readCookie('nexg_locale');
      if (locale && isLocaleTag(locale)) document.documentElement.lang = locale;
      setAsked(readCookie('nexg_asked') === '1');
    };

    update();
    window.addEventListener(PREFERENCES_UPDATED, update);
    return () => window.removeEventListener(PREFERENCES_UPDATED, update);
  }, []);

  return asked ? <FloatingChat /> : null;
}
