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
 * The gate the middleware asks on every authenticated request.
 *
 * Pure, so the rule can be tested without a request. `seen` is the
 * last-seen cookie's timestamp (0 when the cookie is absent, which
 * happens exactly once — on the first request after a sign-in, before
 * this gate has ever stamped a cookie. That request must pass: a
 * stricter reading would sign somebody out on their first click).
 */
export function isStaffIdle(seen: number, now: number): boolean {
  return seen > 0 && now - seen > STAFF_IDLE_TIMEOUT_MS;
}
