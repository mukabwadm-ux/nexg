import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyOtp = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { verifyOtp } }) }));

import { GET } from './route';

function get(query: string) {
  return GET(new NextRequest(`https://nexgapp.com/auth/confirm?${query}`));
}

describe('GET /auth/confirm', () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    verifyOtp.mockResolvedValue({ error: null });
  });

  it('verifies the token once and goes straight to the merchant password screen', async () => {
    const response = await get(
      'token_hash=abc123&type=recovery&next=%2Freset-password%3Fnext%3D%252Fmerchant',
    );
    expect(verifyOtp).toHaveBeenCalledTimes(1);
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'abc123' });
    expect(response.headers.get('location')).toBe(
      'https://nexgapp.com/reset-password?next=%2Fmerchant',
    );
  });

  it('sends a normal reset to /reset-password', async () => {
    const response = await get('token_hash=abc123&type=recovery&next=%2Freset-password');
    expect(response.headers.get('location')).toBe('https://nexgapp.com/reset-password');
  });

  it('never redirects off-site or to unlisted pages', async () => {
    for (const next of [
      'https%3A%2F%2Fevil.example',
      '%2F%2Fevil.example',
      '%2Fmerchant%2Fmoney',
    ]) {
      const response = await get(`token_hash=abc123&type=recovery&next=${next}`);
      expect(response.headers.get('location')).toBe('https://nexgapp.com/');
    }
  });

  it('shows the invalid-link page when the token is rejected', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Email link is invalid or has expired' } });
    const response = await get('token_hash=used&type=recovery&next=%2Freset-password');
    expect(response.headers.get('location')).toBe(
      'https://nexgapp.com/forgot-password?error=invalid-link',
    );
  });

  it('rejects missing tokens and other link types without calling Supabase', async () => {
    for (const query of ['type=recovery', 'token_hash=abc123&type=signup', 'token_hash=abc123']) {
      const response = await get(query);
      expect(response.headers.get('location')).toBe(
        'https://nexgapp.com/forgot-password?error=invalid-link',
      );
    }
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
