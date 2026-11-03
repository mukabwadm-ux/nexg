import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EMAIL_RATE_LIMIT_MESSAGE,
  WELCOME_BUSINESS,
  WELCOME_FIRST_NAME,
  WELCOME_FLAG,
  clearedWelcomeMetadata,
  welcomeMetadata,
} from './merchant-welcome';

describe('welcomeMetadata', () => {
  it('flags the merchant and carries a clean first name and business name', () => {
    expect(welcomeMetadata({ firstName: '  Jane ', name: 'Jane\u0007s   Cafe\n' })).toEqual({
      [WELCOME_FLAG]: true,
      [WELCOME_FIRST_NAME]: 'Jane',
      [WELCOME_BUSINESS]: 'Jane s Cafe',
    });
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
    for (const key of [WELCOME_FLAG, WELCOME_FIRST_NAME, WELCOME_BUSINESS])
      expect(template).toContain(`.Data.${key}`);
  });

  it('has a welcome branch with the username and a normal reset branch', () => {
    expect(template).toMatch(
      /\{\{ if \.Data\.nexg_welcome \}\}[\s\S]*\{\{ \.Email \}\}[\s\S]*\{\{ else \}\}[\s\S]*\{\{ end \}\}/,
    );
    expect(template.match(/\{\{ \.ConfirmationURL \}\}/g)).toHaveLength(2);
    expect(template).not.toMatch(/password:\s*\S+@/i);
  });
});

describe('EMAIL_RATE_LIMIT_MESSAGE', () => {
  it('tells the merchant to check their inbox first', () => {
    expect(EMAIL_RATE_LIMIT_MESSAGE).toMatch(/check your inbox/i);
  });
});
