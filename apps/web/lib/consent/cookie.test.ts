import { describe, expect, it } from 'vitest';

import { consentDefaultScript } from '@/lib/analytics/gtag';
import { stayPurchase, stayViewItem } from '@/lib/analytics/stay-events';

import {
  ACCEPT_ALL,
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  REJECT_ALL,
  consentCookieString,
  googleConsent,
  isAnalyticsExcluded,
  isConsentBannerHidden,
  isMeasurementId,
  makeConsent,
  parseConsent,
  readConsentCookie,
  serializeConsent,
  shouldLoadAnalytics,
} from './cookie';

const NOW = new Date('2026-11-26T10:00:00Z');
const raw = (value: unknown) => encodeURIComponent(JSON.stringify(value));

describe('consent cookie', () => {
  it('round-trips a choice', () => {
    const consent = makeConsent({ functional: true, analytics: false, marketing: true }, NOW);
    expect(parseConsent(serializeConsent(consent), NOW)).toEqual(consent);
  });

  it('reads it out of a whole cookie header', () => {
    const consent = makeConsent(ACCEPT_ALL, NOW);
    const header = `nexg_locale=sw; ${CONSENT_COOKIE}=${serializeConsent(consent)}; nexg_asked=1`;
    expect(readConsentCookie(header, NOW)).toEqual(consent);
    expect(readConsentCookie('nexg_locale=sw; nexg_asked=1', NOW)).toBeNull();
    expect(readConsentCookie('', NOW)).toBeNull();
  });

  it('treats anything unreadable as no choice', () => {
    expect(parseConsent(undefined, NOW)).toBeNull();
    expect(parseConsent('not json', NOW)).toBeNull();
    expect(parseConsent('%E0%A4%A', NOW)).toBeNull();
    expect(parseConsent(raw([1, 2]), NOW)).toBeNull();
    expect(parseConsent(raw(null), NOW)).toBeNull();
  });

  it('asks again for another version or a missing or non-boolean category', () => {
    const base = {
      v: 1,
      functional: true,
      analytics: true,
      marketing: true,
      at: NOW.toISOString(),
    };
    expect(parseConsent(raw(base), NOW)).not.toBeNull();
    expect(parseConsent(raw({ ...base, v: 2 }), NOW)).toBeNull();
    expect(parseConsent(raw({ ...base, v: '1' }), NOW)).toBeNull();
    expect(parseConsent(raw({ ...base, analytics: 'yes' }), NOW)).toBeNull();
    const { marketing: _dropped, ...noMarketing } = base;
    expect(parseConsent(raw(noMarketing), NOW)).toBeNull();
  });

  it('expires after 12 months and refuses dates in the future', () => {
    const old = new Date(NOW.getTime() - CONSENT_MAX_AGE_SECONDS * 1000 - 1000);
    const recent = new Date(NOW.getTime() - CONSENT_MAX_AGE_SECONDS * 1000 + 60_000);
    expect(parseConsent(serializeConsent(makeConsent(ACCEPT_ALL, old)), NOW)).toBeNull();
    expect(parseConsent(serializeConsent(makeConsent(ACCEPT_ALL, recent)), NOW)).not.toBeNull();
    const future = new Date(NOW.getTime() + 24 * 3600 * 1000);
    expect(parseConsent(serializeConsent(makeConsent(ACCEPT_ALL, future)), NOW)).toBeNull();
    expect(parseConsent(raw({ ...makeConsent(ACCEPT_ALL, NOW), at: 'yesterday' }), NOW)).toBeNull();
  });

  it('drops unknown fields rather than carrying them', () => {
    const value = { ...makeConsent(REJECT_ALL, NOW), email: 'someone@example.com' };
    expect(parseConsent(raw(value), NOW)).toEqual(makeConsent(REJECT_ALL, NOW));
  });

  it('writes a first-party, Lax, 12-month cookie', () => {
    const text = consentCookieString(makeConsent(ACCEPT_ALL, NOW), { secure: true });
    expect(text.startsWith(`${CONSENT_COOKIE}=`)).toBe(true);
    expect(text).toContain('Path=/');
    expect(text).toContain(`Max-Age=${CONSENT_MAX_AGE_SECONDS}`);
    expect(text).toContain('SameSite=Lax');
    expect(text).toContain('Secure');
    expect(text).not.toContain('Domain=');
    expect(consentCookieString(makeConsent(ACCEPT_ALL, NOW), { secure: false })).not.toContain(
      'Secure',
    );
  });
});

describe('Google consent signals', () => {
  it('denies everything optional with no choice', () => {
    expect(googleConsent(null)).toEqual({
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
    });
  });

  it('grants only what was allowed', () => {
    const signals = googleConsent(
      makeConsent({ functional: false, analytics: true, marketing: false }, NOW),
    );
    expect(signals.analytics_storage).toBe('granted');
    expect(signals.ad_storage).toBe('denied');
    expect(signals.ad_user_data).toBe('denied');
    expect(signals.functionality_storage).toBe('denied');
  });

  it('sets the defaults in the head without loading any Google script', () => {
    const pushed: unknown[][] = [];
    const window: Record<string, unknown> = {};
    new Function('window', consentDefaultScript())(window);
    (window.dataLayer as IArguments[]).forEach((args) => pushed.push(Array.from(args)));
    expect(pushed).toHaveLength(1);
    expect(pushed[0]![0]).toBe('consent');
    expect(pushed[0]![1]).toBe('default');
    expect(pushed[0]![2]).toMatchObject({ analytics_storage: 'denied', ad_storage: 'denied' });
    expect(consentDefaultScript()).not.toContain('googletagmanager');
  });
});

describe('loading analytics only after consent', () => {
  const id = 'G-ABC123XYZ';
  const allowed = makeConsent({ functional: false, analytics: true, marketing: false }, NOW);

  it('needs a measurement ID', () => {
    expect(isMeasurementId(id)).toBe(true);
    expect(isMeasurementId('')).toBe(false);
    expect(isMeasurementId(undefined)).toBe(false);
    expect(isMeasurementId('UA-12345-1')).toBe(false);
    expect(isMeasurementId('G-abc"><script>')).toBe(false);
    expect(shouldLoadAnalytics({ measurementId: undefined, consent: allowed, pathname: '/' })).toBe(
      false,
    );
  });

  it('never loads before a choice, after Reject all, or with analytics off', () => {
    expect(shouldLoadAnalytics({ measurementId: id, consent: null, pathname: '/' })).toBe(false);
    expect(
      shouldLoadAnalytics({
        measurementId: id,
        consent: makeConsent(REJECT_ALL, NOW),
        pathname: '/',
      }),
    ).toBe(false);
    expect(
      shouldLoadAnalytics({
        measurementId: id,
        consent: makeConsent({ functional: true, analytics: false, marketing: true }, NOW),
        pathname: '/stays',
      }),
    ).toBe(false);
  });

  it('loads once analytics is allowed, on public pages', () => {
    expect(shouldLoadAnalytics({ measurementId: id, consent: allowed, pathname: '/' })).toBe(true);
    expect(
      shouldLoadAnalytics({ measurementId: id, consent: allowed, pathname: '/stays/the-loft' }),
    ).toBe(true);
    expect(
      shouldLoadAnalytics({ measurementId: id, consent: allowed, pathname: '/merchants' }),
    ).toBe(true);
  });

  it('never runs on partner workspaces, sign-in links or health pages', () => {
    for (const pathname of [
      '/merchant',
      '/merchant/orders',
      '/merchant-live-preview',
      '/booking-workspace',
      '/host',
      '/rider/jobs',
      '/receipts/abc',
      '/auth/callback',
      '/reset-password',
      '/categories/pharmacy',
      '/explore/health-and-beauty',
    ]) {
      expect(isAnalyticsExcluded(pathname), pathname).toBe(true);
      expect(shouldLoadAnalytics({ measurementId: id, consent: allowed, pathname }), pathname).toBe(
        false,
      );
    }
  });

  it('hides the banner only in workspaces', () => {
    expect(isConsentBannerHidden('/merchant/orders')).toBe(true);
    expect(isConsentBannerHidden('/rider')).toBe(true);
    expect(isConsentBannerHidden('/merchants')).toBe(false);
    expect(isConsentBannerHidden('/riders')).toBe(false);
    expect(isConsentBannerHidden('/')).toBe(false);
    expect(isConsentBannerHidden('/categories/pharmacy')).toBe(false);
  });
});

describe('stay events', () => {
  it('carry listing data and KES amounts, nothing about the guest', () => {
    const view = stayViewItem({ slug: 'the-loft', name: 'The Loft', fromRateKes: 8500.4 });
    expect(view).toEqual({
      name: 'view_item',
      params: {
        currency: 'KES',
        value: 8500,
        items: [{ item_id: 'the-loft', item_name: 'The Loft', item_category: 'stay', price: 8500 }],
      },
    });

    const purchase = stayPurchase({
      reference: 'NXG-PAY-123',
      slug: 'the-loft',
      property: 'The Loft',
      unit: 'Unit 2',
      nights: 3,
      paidKes: 25500,
    });
    expect(purchase.params).toMatchObject({
      currency: 'KES',
      value: 25500,
      transaction_id: 'NXG-PAY-123',
      items: [{ item_id: 'the-loft', price: 8500, quantity: 3 }],
    });
    expect(JSON.stringify(purchase)).not.toMatch(/email|phone|first_name|@/i);
  });
});
