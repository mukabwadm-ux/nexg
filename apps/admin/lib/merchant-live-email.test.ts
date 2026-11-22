import { describe, expect, it } from 'vitest';

import { liveEmailSummary, recipientLabel, type LiveEmailStatus } from './merchant-live-email';

const status = (over: Partial<LiveEmailStatus>): LiveEmailStatus => ({
  state: 'waiting',
  live: true,
  reference: 'NXG-MA-3F9A1C2B7D4E',
  recipient: 'a•••@example.com',
  recipient_source: 'owner_sign_in',
  reason: null,
  queued_at: '2026-11-22T08:00:00Z',
  sent_at: null,
  attempts: 0,
  last_error: null,
  sends: 1,
  can_resend: false,
  ...over,
});

describe('the "business is live" email, for staff', () => {
  it('names the masked address and which one it is', () => {
    expect(recipientLabel(status({}))).toBe('a•••@example.com (the owner’s sign-in email)');
    expect(recipientLabel(status({ recipient_source: 'business_email' }))).toBe(
      'a•••@example.com (the business email)',
    );
    expect(recipientLabel(status({ recipient: null }))).toBeNull();
  });

  it('says after signing that the owner is being emailed, with the agreement attached', () => {
    expect(liveEmailSummary(status({}))).toBe(
      'The owner is being emailed that the business is live, with the signed agreement attached, at a•••@example.com (the owner’s sign-in email).',
    );
  });

  it('points at Send again when it did not go, with the reason', () => {
    expect(
      liveEmailSummary(
        status({
          state: 'skipped',
          reason: 'Partner emails are switched off in Settings › Email routing (partner_updates).',
          can_resend: true,
        }),
      ),
    ).toBe(
      'The owner’s “business is live” email did not go: Partner emails are switched off in Settings › Email routing (partner_updates). Use Send again on the merchant page.',
    );
  });

  it('says nothing while the business is not live, or when nothing was signed', () => {
    expect(liveEmailSummary(status({ state: 'not_live', live: false }))).toBe('');
    expect(liveEmailSummary(status({ state: 'not_signed' }))).toBe('');
    expect(liveEmailSummary(null)).toBe('');
  });
});
