import { describe, expect, it } from 'vitest';
import { requestMerchantEmailCode, resendMerchantEmailCode, verifyMerchantEmailCode } from './merchant-email-otp';

type Auth = Parameters<typeof requestMerchantEmailCode>[0];

function applicant() {
  let user = { id: 'original-owner', is_anonymous: true, email: '', new_email: '', email_confirmed_at: '' };
  let deliveries = 0;
  const auth = {
    getUser: async () => ({ data: { user: { ...user } }, error: null }),
    updateUser: async ({ email }: { email: string }) => {
      user = { ...user, new_email: email };
      deliveries++;
      return { data: { user: { ...user } }, error: null };
    },
    // A fake public resend cannot find an anonymous user's current email.
    resend: async () => ({ error: null }),
    verifyOtp: async ({ token }: { token: string }) => {
      if (token !== '246810') return { data: { user: null }, error: { status: 403 } };
      user = { ...user, email: user.new_email, new_email: '', is_anonymous: false, email_confirmed_at: '2026-11-02T12:00:00Z' };
      return { data: { user: { ...user } }, error: null };
    },
    refreshSession: async () => ({ data: { user: { ...user } }, error: null }),
  } as unknown as Auth;
  return { auth, current: () => user, deliveries: () => deliveries };
}

describe('merchant email verification', () => {
  it('verifies the original applicant instead of replacing the application owner', async () => {
    const a = applicant();
    expect(await requestMerchantEmailCode(a.auth, 'original-owner', 'owner@example.com')).toBe('sent');
    await verifyMerchantEmailCode(a.auth, 'original-owner', 'owner@example.com', '246810');
    expect(a.current()).toMatchObject({ id: 'original-owner', email: 'owner@example.com', is_anonymous: false, email_confirmed_at: '2026-11-02T12:00:00Z' });
  });

  it('resumes an existing request without sending another code until explicitly requested', async () => {
    const a = applicant();
    expect(await requestMerchantEmailCode(a.auth, 'original-owner', 'owner@example.com')).toBe('sent');
    expect(await requestMerchantEmailCode(a.auth, 'original-owner', 'owner@example.com')).toBe('pending');
    expect(a.deliveries()).toBe(1);
    await resendMerchantEmailCode(a.auth, 'original-owner', 'owner@example.com');
    expect(a.deliveries()).toBe(2);
  });

  it('keeps the applicant unverified when a code is wrong', async () => {
    const a = applicant();
    await requestMerchantEmailCode(a.auth, 'original-owner', 'owner@example.com');
    await expect(verifyMerchantEmailCode(a.auth, 'original-owner', 'owner@example.com', '999999')).rejects.toThrow('invalid or has expired');
    expect(a.current()).toMatchObject({ id: 'original-owner', is_anonymous: true, email: '' });
  });

  it('refuses to send a code after the browser session changes owner', async () => {
    const a = applicant();
    await expect(requestMerchantEmailCode(a.auth, 'another-owner', 'owner@example.com')).rejects.toThrow('session has changed');
    expect(a.current()).toMatchObject({ id: 'original-owner', new_email: '', is_anonymous: true });
  });

  it('refuses a verification tied to a different email', async () => {
    const a = applicant();
    await requestMerchantEmailCode(a.auth, 'original-owner', 'owner@example.com');
    await expect(verifyMerchantEmailCode(a.auth, 'original-owner', 'other@example.com', '246810')).rejects.toThrow('request has changed');
    expect(a.current()).toMatchObject({ is_anonymous: true, new_email: 'owner@example.com' });
  });
});
