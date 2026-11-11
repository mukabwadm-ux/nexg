/**
 * The staff idle timeout, in one place.
 *
 * The console can take a merchant live and read uploaded national
 * IDs, so a session left open on a shared desk is a door left open.
 * Five minutes without a request from this person and the session is
 * closed — not dimmed, not warned-then-forgotten: closed, by the
 * server as well as by this page.
 *
 * Server and client read the same constant so the two halves cannot
 * drift apart. The middleware enforces it on every request — the
 * client half is the courtesy that lands a still-open tab on the
 * sign-in page instead of leaving a dead console on the screen.
 */
export const STAFF_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/** The cookie the middleware touches on every authenticated request. */
export const STAFF_SEEN_COOKIE = 'nexg_staff_seen';

/**
 * How long the last-seen cookie lives: as long as a Supabase sign-in can
 * (the 400 days @supabase/ssr gives its own cookies).
 *
 * It used to live twice the timeout, ten minutes, and that was the gap: a
 * session idle for more than ten minutes had no cookie left, and a missing
 * cookie reads as a fresh sign-in, so the session carried on. The rule held
 * only for idle periods between five and ten minutes. Because the stamp now
 * names the sign-in it belongs to (see readStaffSeen), it can live as long
 * as that sign-in without ever closing the next one.
 */
export const STAFF_SEEN_MAX_AGE_S = 400 * 24 * 60 * 60;

/**
 * The time rule alone: last seen more than the timeout ago. `seen` is 0
 * when there is no stamp.
 */
export function isStaffIdle(seen: number, now: number): boolean {
  return seen > 0 && now - seen > STAFF_IDLE_TIMEOUT_MS;
}

/** A last-seen stamp: which sign-in session it was made in, and when. */
export interface StaffSeen {
  session: string;
  seen: number;
}

/**
 * Reads the cookie `<session>.<milliseconds>`. A stamp from before stamps
 * named their session (just the milliseconds) reads with session '', so it
 * belongs to no session and is replaced on the next request.
 */
export function readStaffSeen(value: string | null | undefined): StaffSeen | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  const session = dot >= 0 ? value.slice(0, dot) : '';
  const seen = Number(dot >= 0 ? value.slice(dot + 1) : value);
  return Number.isFinite(seen) && seen > 0 ? { session, seen } : null;
}

export function writeStaffSeen(session: string, now: number): string {
  return `${session}.${now}`;
}

/**
 * The sign-in session an access token belongs to: Supabase's `session_id`
 * claim, which stays the same when the token is refreshed and changes with
 * every sign-in. Null when it cannot be read.
 */
export function sessionIdOf(accessToken: string | null | undefined): string | null {
  const payload = accessToken?.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as {
      session_id?: unknown;
    };
    return typeof claims.session_id === 'string' && /^[0-9a-f-]{8,64}$/i.test(claims.session_id)
      ? claims.session_id
      : null;
  } catch {
    return null;
  }
}

/**
 * The gate the middleware asks on every authenticated request.
 *
 * Pure, so the rule can be tested without a request. Only a stamp made in
 * this same sign-in session counts. No stamp, or a stamp left by an earlier
 * session (signed out by hand, then in again a day later), is a fresh
 * sign-in and must pass: a stricter reading would sign somebody out on
 * their first click.
 */
export function isStaffSessionIdle(stamp: StaffSeen | null, session: string, now: number): boolean {
  return stamp !== null && stamp.session === session && isStaffIdle(stamp.seen, now);
}
