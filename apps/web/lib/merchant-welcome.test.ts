import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EMAIL_RATE_LIMIT_MESSAGE,
  WELCOME_BUSINESS,
  WELCOME_FIRST_NAME,
  WELCOME_FLAG,
  WELCOME_CUSTOMER,
  WELCOME_HOST,
  clearedWelcomeMetadata,
  welcomeMetadata,
} from './merchant-welcome';
import { safeAuthNext } from './auth-next';

describe('welcomeMetadata', () => {
  it('flags the merchant and carries a clean first name and business name', () => {
    expect(welcomeMetadata({ firstName: '  Jane ', name: 'Jane\u0007s   Cafe\n' })).toEqual({
      [WELCOME_FLAG]: true,
      [WELCOME_FIRST_NAME]: 'Jane',
      [WELCOME_BUSINESS]: 'Jane s Cafe',
      [WELCOME_HOST]: null,
      [WELCOME_CUSTOMER]: null,
    });
  });

  it('marks customers so the email welcomes them without an application', () => {
    const metadata = welcomeMetadata({ firstName: 'Amina', name: null }, 'customer');
    expect(metadata[WELCOME_CUSTOMER]).toBe(true);
    expect(metadata[WELCOME_HOST]).toBeNull();
  });

  it('marks hosts so the email says host workspace and links to /host', () => {
    expect(welcomeMetadata({ name: 'Kilimani Stays' }, 'host')[WELCOME_HOST]).toBe(true);
  });

  it('uses null for missing or non-text names and caps their length', () => {
    const metadata = welcomeMetadata({ firstName: 42, name: 'x'.repeat(500) });
    expect(metadata[WELCOME_FIRST_NAME]).toBeNull();
    expect(metadata[WELCOME_BUSINESS]).toHaveLength(200);
    expect(welcomeMetadata({})[WELCOME_BUSINESS]).toBeNull();
  });
});

describe('clearedWelcomeMetadata', () => {
  it('clears every key the welcome sets', () => {
    expect(Object.keys(clearedWelcomeMetadata).sort()).toEqual(
      Object.keys(welcomeMetadata({})).sort(),
    );
    expect(Object.values(clearedWelcomeMetadata).every((value) => value === null)).toBe(true);
  });
});

describe('password recovery template', () => {
  const template = readFileSync(
    resolve(__dirname, '../../../supabase/templates/password-recovery.html'),
    'utf8',
  );

  it('reads the same metadata keys the app writes', () => {
    for (const key of [
      WELCOME_FLAG,
      WELCOME_FIRST_NAME,
      WELCOME_BUSINESS,
      WELCOME_HOST,
      WELCOME_CUSTOMER,
    ])
      expect(template).toContain(`.Data.${key}`);
  });

  it('has a welcome branch with the username and a normal reset branch', () => {
    expect(template).toMatch(
      /\{\{ if \.Data\.nexg_welcome \}\}[\s\S]*\{\{ \.Email \}\}[\s\S]*\{\{ else \}\}[\s\S]*\{\{ end \}\}/,
    );
    expect(template).not.toMatch(/password:\s*\S+@/i);
  });

  it('links straight to /auth/confirm so the button works in any browser', () => {
    // The PKCE ConfirmationURL needs a verifier in the requesting browser and
    // failed when the email was opened anywhere else.
    expect(template).not.toContain('.ConfirmationURL');
    const links = template.match(
      /href="\{\{ \.SiteURL \}\}\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&amp;type=recovery&amp;next=[^"]+"/g,
    );
    expect(links).toHaveLength(4);
    const nexts = links!.map((link) =>
      new URLSearchParams(link.replace(/&amp;/g, '&').split('?')[1]!.replace(/"$/, '')).get('next'),
    );
    expect(nexts).toEqual([
      '/reset-password?next=%2Fhost',
      '/reset-password',
      '/reset-password?next=%2Fmerchant',
      '/reset-password',
    ]);
    for (const next of nexts) expect(safeAuthNext(next)).toBe(next);
  });
});

describe('EMAIL_RATE_LIMIT_MESSAGE', () => {
  it('tells the merchant to check their inbox first', () => {
    expect(EMAIL_RATE_LIMIT_MESSAGE).toMatch(/check your inbox/i);
  });
});
