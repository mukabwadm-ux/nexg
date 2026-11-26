import { describe, expect, it } from 'vitest';

import { activeHref, CONSOLE_NAV, navFor } from './console-nav';
import {
  asStatus,
  clock12,
  COMMS_PAGES,
  csvSafe,
  kpisOf,
  logRef,
  messageName,
  monthGrid,
  nairobiDay,
  ordinal,
  providerState,
  rate,
  renderPreview,
  scheduleWords,
  smsParts,
  trendOf,
} from './comms';

describe('the Communications sidebar group', () => {
  const group = CONSOLE_NAV.find((g) => g.key === 'communications')!;

  it('sits right after System, drawn under it, in the designs’ order', () => {
    const keys = CONSOLE_NAV.map((g) => g.key);
    expect(keys.indexOf('communications')).toBe(keys.indexOf('system') + 1);
    expect(group.under).toBe('system');
    expect(group.items.map((i) => i.label)).toEqual([
      'Overview',
      'Email Configuration',
      'SMS Configuration',
      'Push Notifications',
      'WhatsApp Configuration',
      'Message Templates',
      'Automated Workflows',
      'Scheduled Messages',
      'Manual & Bulk Messaging',
      'Message Queue',
      'Delivery Logs',
      'Analytics & Reports',
      'Preferences & Consent',
    ]);
  });

  it('links the same pages as the tab strip', () => {
    expect(group.items.map((i) => i.href)).toEqual(COMMS_PAGES.map((p) => p.href));
  });

  it('shows for the communications module, and for Settings until that module is on the database (full Settings only)', () => {
    expect(navFor(new Set(['communications'])).some((g) => g.key === 'communications')).toBe(true);
    expect(
      navFor(new Set(['settings', 'settings:full'])).some((g) => g.key === 'communications'),
    ).toBe(true);
    expect(navFor(new Set(['settings'])).some((g) => g.key === 'communications')).toBe(false);
    expect(navFor(new Set(['orders'])).some((g) => g.key === 'communications')).toBe(false);
  });

  it('marks the open page', () => {
    expect(activeHref(group.items, '/communications/logs', null)).toBe('/communications/logs');
    expect(activeHref(group.items, '/communications', null)).toBe('/communications');
  });
});

describe('figures', () => {
  it('reads KPIs with missing values as zero', () => {
    expect(kpisOf({ total: '5', sent: 3 })).toEqual({
      total: 5,
      sent: 3,
      queued: 0,
      failed: 0,
      skipped: 0,
      retried: 0,
      recipients: 0,
    });
    expect(kpisOf(null).total).toBe(0);
  });

  it('writes a share, or a dash with nothing to divide by', () => {
    expect(rate(921, 1000)).toBe('92.1%');
    expect(rate(1, 0)).toBe('—');
  });

  it('reads the trend rows', () => {
    expect(trendOf([{ at: '2026-11-01T00:00:00', sent: 2, total: 3 }])[0]).toMatchObject({
      at: '2026-11-01T00:00:00',
      sent: 2,
      total: 3,
      failed: 0,
    });
    expect(trendOf('nope')).toEqual([]);
  });
});

describe('channel state', () => {
  it('treats anything unknown as not checked', () => {
    expect(asStatus({ status: 'weird' }).status).toBe('unknown');
    expect(asStatus(undefined).status).toBe('unknown');
    expect(asStatus({ status: 'connected', provider: 'resend' }).provider).toBe('resend');
  });

  it('shows only the gateway in use as connected', () => {
    const sms = asStatus({ status: 'connected', provider: 'africastalking' });
    expect(providerState(sms, 'africastalking')).toBe('connected');
    expect(providerState(sms, 'twilio')).toBe('not_connected');
    expect(providerState(asStatus({ status: 'not_connected' }), 'twilio')).toBe('not_connected');
  });
});

describe('words', () => {
  it('fills variables like the database does and drops unknown ones', () => {
    expect(
      renderPreview('Hi {{ first_name }} in {{city}}{{nope}}', {
        first_name: 'John',
        city: 'Nairobi',
      }),
    ).toBe('Hi John in Nairobi');
  });

  it('counts SMS parts, shorter when the text needs unicode', () => {
    expect(smsParts('')).toEqual({ chars: 0, parts: 0 });
    expect(smsParts('a'.repeat(160)).parts).toBe(1);
    expect(smsParts('a'.repeat(161)).parts).toBe(2);
    expect(smsParts('😀'.repeat(71)).parts).toBe(2);
  });

  it('names a message by its subject, else its template', () => {
    expect(messageName({ subject: 'Booking Confirmation', template: 'x' })).toBe(
      'Booking Confirmation',
    );
    expect(messageName({ template: 'bell_order.confirmed' })).toBe('Order confirmed');
    expect(messageName({ template: 'comms.CMP-0004', campaign_ref: 'CMP-0004' })).toBe(
      'Campaign CMP-0004',
    );
  });

  it('writes the short log id the database writes', () => {
    expect(logRef('31c6c6cc-6045-4fa6-b313-cf0a09ee257a')).toBe('DL-31C6C6');
  });

  it('keeps spreadsheet formulas out of exports', () => {
    expect(csvSafe('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(csvSafe('-1')).toBe("'-1");
    expect(csvSafe('Hello')).toBe('Hello');
    expect(csvSafe(5)).toBe(5);
  });
});

describe('schedules', () => {
  it('says when a schedule runs', () => {
    expect(
      scheduleWords({
        kind: 'recurring',
        frequency: 'weekly',
        weekday: 1,
        time_of_day: '09:00:00',
      }),
    ).toBe('Every Mon, 9:00 AM');
    expect(
      scheduleWords({ kind: 'recurring', frequency: 'monthly', monthday: 1, time_of_day: '11:00' }),
    ).toBe('1st of month, 11:00 AM');
    expect(scheduleWords({ kind: 'one_time' })).toBe('Once');
    expect(clock12('16:00')).toBe('4:00 PM');
    expect(clock12('00:05')).toBe('12:05 AM');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(11)).toBe('11th');
  });

  it('lays a month out Monday first', () => {
    const grid = monthGrid('2026-11-01');
    expect(grid[0]).toEqual({ day: '2026-10-26', inMonth: false });
    expect(grid.filter((c) => c.inMonth)).toHaveLength(30);
    expect(grid.length % 7).toBe(0);
  });

  it('puts an instant on its Nairobi day', () => {
    expect(nairobiDay('2026-11-26T22:30:00Z')).toBe('2026-11-27');
    expect(nairobiDay('2026-11-26T20:30:00Z')).toBe('2026-11-26');
  });
});
