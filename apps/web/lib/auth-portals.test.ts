import { describe, expect, it } from 'vitest';

import {
  homeAfterReset,
  isAuthPage,
  landingFor,
  safeNext,
  signInHref,
  withinPortal,
} from './auth-portals';

const merchant = { kind: 'merchant', home: '/merchant' };
const host = { kind: 'host', home: '/host' };
const guest = { kind: 'guest', home: '/' };

describe('safeNext', () => {
  it('keeps internal paths and drops everything that could leave the site', () => {
    expect(safeNext('/stays/kilimani/book?from=2026-12-01&to=2026-12-03')).toBe(
      '/stays/kilimani/book?from=2026-12-01&to=2026-12-03',
    );
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/ok\nSet-Cookie: x',
      '',
      undefined,
      42,
    ])
      expect(safeNext(bad)).toBeUndefined();
  });
});

describe('landingFor', () => {
  it('sends a customer to next, or home', () => {
    expect(landingFor('customer', guest, '/stays/a/book')).toBe('/stays/a/book');
    expect(landingFor('customer', guest, undefined)).toBe('/');
    expect(landingFor('customer', null, undefined)).toBe('/');
  });

  it('takes a partner who used the customer page to their workspace unless next says otherwise', () => {
    expect(landingFor('customer', merchant, undefined)).toBe('/merchant');
    expect(landingFor('customer', host, '/checkout')).toBe('/checkout');
  });

  it('keeps a partner next only inside that portal', () => {
    expect(landingFor('host', host, '/host?open=bookings')).toBe('/host?open=bookings');
    expect(landingFor('host', host, '/checkout')).toBe('/host');
    expect(landingFor('merchant', merchant, '/merchant/menu')).toBe('/merchant/menu');
  });

  it('sends an account with nothing yet to where that partner starts', () => {
    expect(landingFor('merchant', guest, '/merchant')).toBe('/merchants/apply');
    expect(landingFor('rider', guest, undefined)).toBe('/riders/apply');
    expect(landingFor('host', null, undefined)).toBe('/hosts');
  });

  it('sends a partner who used another partner portal to their own home', () => {
    expect(landingFor('rider', merchant, '/rider')).toBe('/merchant');
  });
});

describe('portal helpers', () => {
  it('builds portal sign-in links', () => {
    expect(signInHref('host', { next: '/host?open=1', empty: undefined })).toBe(
      '/hosts/sign-in?next=%2Fhost%3Fopen%3D1',
    );
    expect(signInHref('customer')).toBe('/sign-in');
  });

  it('knows which paths belong to a portal', () => {
    expect(withinPortal('host', '/hosts')).toBe(false);
    expect(withinPortal('host', '/host/stays')).toBe(true);
    expect(withinPortal('customer', '/anything')).toBe(true);
  });

  it('recognises every sign-in, sign-up and password page', () => {
    for (const path of [
      '/sign-in',
      '/sign-up',
      '/sign-up/finish',
      '/merchants/sign-in',
      '/merchants/sign-in/email',
      '/riders/sign-in',
      '/hosts/sign-in',
      '/forgot-password',
      '/reset-password',
    ])
      expect(isAuthPage(path)).toBe(true);
    expect(isAuthPage('/hosts')).toBe(false);
  });

  it('only returns to a portal home after a password reset', () => {
    expect(homeAfterReset('/host')).toBe('/host');
    expect(homeAfterReset('/rider')).toBe('/rider');
    expect(homeAfterReset('https://evil.example')).toBe('/');
  });
});
