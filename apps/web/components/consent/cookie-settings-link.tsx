'use client';

import { openCookieSettings } from '@/lib/consent/client';

/** The footer's "Cookie Settings": reopens the cookie preferences. */
export function CookieSettingsLink({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      {label}
    </button>
  );
}
