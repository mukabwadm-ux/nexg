/**
 * Where an emailed auth link may send someone after it signs them in.
 * Only these exact destinations are allowed, so a link can never be turned
 * into an open redirect.
 */
const ALLOWED_NEXT = new Set(['/reset-password', '/reset-password?next=%2Fmerchant']);

export function safeAuthNext(requested: string | null): string {
  return requested && ALLOWED_NEXT.has(requested) ? requested : '/';
}

export const INVALID_LINK_PATH = '/forgot-password?error=invalid-link';
