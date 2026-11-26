import { customerApiClient } from '@/lib/supabase/customer-api';
import { MERCHANT_BOOKING_ID } from './bridge';

type Contact = { name: string } & ({ email: string } | { phone: string });
export type MovieCustomerResult =
  | { ok: true; userId: string; contact: Contact }
  | { ok: false; reason: 'sign_in' | 'profile_required' | 'unavailable' };

/** Trust only the server-validated Auth subject and confirmed contact. Profile
 * display name only labels the hold; it is not proof of identity or authority. */
export async function resolveNativeMovieCustomer(request: Request): Promise<MovieCustomerResult> {
  const token = /^Bearer ([\w.-]{1,4096})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return { ok: false, reason: 'sign_in' };
  try {
    const { data: { user }, error } = await customerApiClient(token).auth.getUser(token);
    if (error) return { ok: false, reason: [400, 401, 403].includes(error.status ?? 0) ? 'sign_in' : 'unavailable' };
    if (!user || user.is_anonymous || !MERCHANT_BOOKING_ID.test(user.id))
      return { ok: false, reason: 'sign_in' };

    const parts = [user.user_metadata?.first_name, user.user_metadata?.last_name]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map(v => v.trim());
    const display = [parts.join(' '), user.user_metadata?.full_name, user.user_metadata?.display_name, user.user_metadata?.name];
    const name = display.find((v): v is string => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 200)?.trim();
    if (!name || /[\r\n]/.test(name)) return { ok: false, reason: 'profile_required' };
    const email = user.email;
    if (user.email_confirmed_at && email && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return { ok: true, userId: user.id.toLowerCase(), contact: { name, email } };
    const phone = user.phone;
    if (user.phone_confirmed_at && phone && /^\+?[1-9]\d{6,14}$/.test(phone))
      return { ok: true, userId: user.id.toLowerCase(), contact: { name, phone } };
    return { ok: false, reason: 'profile_required' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
