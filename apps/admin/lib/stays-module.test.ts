import { describe, expect, it } from 'vitest';

import { activeHref, CONSOLE_NAV } from './console-nav';
import {
  kesFull,
  label,
  minuteClock,
  occupancyText,
  REPORTS,
  SOURCE_LABEL,
  staysHref,
  unitEconomics,
  uuidOrNull,
} from './stays-module';

describe('unitEconomics', () => {
  it('takes VAT out of the commission before the property manager share', () => {
    /* KES 23,950 at 15% VAT-inclusive, 16% VAT, 20% to the PM. */
    const e = unitEconomics(23_950, { commission_pct: 15, vat_pct: 16, pm_share_pct: 20 });
    expect(e).toEqual({ commission: 3593, pmShare: 619, net: 2973 });
  });

  it('is null when there is no booking to average', () => {
    expect(unitEconomics(null, { commission_pct: 15, vat_pct: 16, pm_share_pct: 20 })).toBeNull();
  });
});

describe('figures and labels', () => {
  it('writes shillings in full and a dash when unknown', () => {
    expect(kesFull(48000)).toBe('KES 48,000');
    expect(kesFull(null)).toBe('—');
  });

  it('writes minutes after midnight as a Nairobi clock time', () => {
    expect(minuteClock(14 * 60 + 18)).toBe('2:18 PM');
    expect(minuteClock(11 * 60 + 3)).toBe('11:03 AM');
    expect(minuteClock(null)).toBe('—');
  });

  it('labels known keys and humanises unknown ones', () => {
    expect(label(SOURCE_LABEL, 'booking_com')).toBe('Booking.com');
    expect(label(SOURCE_LABEL, 'walk_in')).toBe('Walk-in');
    expect(label(SOURCE_LABEL, 'some_new_source')).toBe('Some new source');
    expect(occupancyText(null)).toBe('—');
  });
});

describe('addresses', () => {
  it('accepts only uuids from the address bar', () => {
    expect(uuidOrNull('c3000000-0000-4000-8000-000000000001')).toBe(
      'c3000000-0000-4000-8000-000000000001',
    );
    expect(uuidOrNull('all')).toBeNull();
    expect(uuidOrNull("1' or 1=1")).toBeNull();
    expect(uuidOrNull(undefined)).toBeNull();
  });

  it('keeps the period and the city on every stays link', () => {
    expect(
      staysHref('/stays/units', { from: '2026-11-01', to: '2026-11-26' }, null, {
        tab: 'occupied',
      }),
    ).toBe('/stays/units?from=2026-11-01&to=2026-11-26&tab=occupied');
  });

  it('offers a report for each library tile, with unique keys', () => {
    expect(new Set(REPORTS.map((r) => r.key)).size).toBe(REPORTS.length);
  });
});

describe('the Stays sidebar', () => {
  const stays = CONSOLE_NAV.find((g) => g.key === 'stays')!;

  it('lists the mockups’ sub-items in their order', () => {
    expect(stays.items.slice(0, 20).map((i) => i.label)).toEqual([
      'Overview',
      'Hosts',
      'Guests',
      'Buildings & Properties',
      'Accommodation Units',
      'Property Managers & Partners',
      'Reservations',
      'Check-ins & Check-outs',
      'Availability & Rates',
      'Guest Spending & Concierge',
      'Reviews & Ratings',
      'Verification & Compliance',
      'Acquisition & Referrals',
      'QR Codes & Marketing',
      'Finance & Commissions',
      'Payouts & Settlements',
      'Incidents & Disputes',
      'Performance & Analytics',
      'Reports',
      'Stays Configuration',
    ]);
  });

  it('marks the open screen, not Overview, on a sub-page', () => {
    expect(activeHref(stays.items, '/stays/units', null)).toBe('/stays/units');
    expect(activeHref(stays.items, '/stays', null)).toBe('/stays');
  });

  it('puts Integrations at the top level', () => {
    expect(CONSOLE_NAV.find((g) => g.key === 'integrations')?.href).toBe('/integrations');
  });
});
