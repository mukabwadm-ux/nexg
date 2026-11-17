import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signInWithPassword } = vi.hoisted(() => ({ signInWithPassword: vi.fn() }));
vi.mock('@/lib/session', () => ({ createClient: () => ({ auth: { signInWithPassword } }) }));

import { signIn } from '../app/sign-in/actions';

function form(token?: string) {
  const data = new FormData();
  data.set('email', 'Someone@Example.com');
  data.set('password', 'a-placeholder-password');
  if (token) data.set('captchaToken', token);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  signInWithPassword.mockResolvedValue({ data: {}, error: null });
});

describe('signing in to the developer console', () => {
  it('passes the security check token to Supabase and signs in', async () => {
    expect(await signIn(form('turnstile-token'))).toMatchObject({
      ok: true,
      redirectTo: '/developers',
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'someone@example.com',
      password: 'a-placeholder-password',
      options: { captchaToken: 'turnstile-token' },
    });
  });

  it('names a failed security check instead of blaming the password', async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: {
        code: 'captcha_failed',
        status: 400,
        message: 'captcha protection: request disallowed (no captcha_token found)',
      },
    });
    expect(await signIn(form())).toEqual({
      ok: false,
      message: 'The security check did not go through. Press Sign in again.',
    });
  });

  it('names too many attempts', async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: {
        code: 'over_request_rate_limit',
        status: 429,
        message: 'Request rate limit reached',
      },
    });
    expect(await signIn(form('t'))).toMatchObject({
      ok: false,
      message: 'Too many attempts. Wait a minute, then try again.',
    });
  });

  it('never says which of the email and password was wrong', async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
    });
    expect(await signIn(form('t'))).toMatchObject({
      ok: false,
      message: 'That email and password do not match.',
    });
  });
});
