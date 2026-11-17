import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { MERCHANT_BOOKING_ID } from './bridge';

type Contact = { name: string } & ({ email: string } | { phone: string });
export type StayCustomerResult =
  | { ok: true; userId: string; contact: Contact }
  | { ok: false; reason: 'sign_in' | 'profile_required' | 'unavailable' };

/** Supabase is used only to verify the signed-in subject, never as a Stay writer.
 * Profile display names label a reservation; only confirmed Auth contact is trusted.
 */
export async function resolveVerifiedStayCustomer(request: Request): Promise<StayCustomerResult> {
  const token = /^Bearer ([\w.-]{1,4096})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return { ok: false, reason: 'sign_in' };
  try {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          headers: { Authorization: `Bearer ${token}` },
          fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
        },
      },
    );
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);
    if (error)
      return {
        ok: false,
        reason: [400, 401, 403].includes(error.status ?? 0) ? 'sign_in' : 'unavailable',
      };
    if (!user || user.is_anonymous || !MERCHANT_BOOKING_ID.test(user.id))
      return { ok: false, reason: 'sign_in' };
    const parts = [user.user_metadata?.first_name, user.user_metadata?.last_name]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim());
    const names = [
      parts.join(' '),
      user.user_metadata?.full_name,
      user.user_metadata?.display_name,
      user.user_metadata?.name,
    ];
    const name = names
      .find(
        (v): v is string => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 200,
      )
      ?.trim();
    if (!name || /[\u0000-\u001f\u007f]/.test(name))
      return { ok: false, reason: 'profile_required' };
    const email = user.email;
    if (
      user.email_confirmed_at &&
      Number.isFinite(Date.parse(user.email_confirmed_at)) &&
      email &&
      email.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      return { ok: true, userId: user.id.toLowerCase(), contact: { name, email } };
    const phone = user.phone;
    if (
      user.phone_confirmed_at &&
      Number.isFinite(Date.parse(user.phone_confirmed_at)) &&
      phone &&
      /^\+?[1-9]\d{7,14}$/.test(phone)
    )
      return { ok: true, userId: user.id.toLowerCase(), contact: { name, phone } };
    return { ok: false, reason: 'profile_required' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
