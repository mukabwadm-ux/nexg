/**
 * The four ways into NexG.
 *
 * Customers sign in at /sign-in and create an account at /sign-up.
 * Merchants, riders and hosts each have their own sign-in page beside their
 * public page, until they move to their own subdomains. Every redirect,
 * guard and email link that sends somebody to "sign in" asks this module
 * where, so a portal's address lives in one place.
 *
 * A portal only decides where somebody lands. What an account may do is
 * still settled by the database on every query.
 */

export type Portal = 'customer' | 'merchant' | 'rider' | 'host';

export interface PortalInfo {
  /** The sign-in page. */
  signIn: string;
  /** Where a signed-in account of this kind belongs. */
  home: string;
  /** Where somebody without an account starts. */
  start: string;
  /** "Merchant" in "Merchant sign in". */
  label: string;
}

export const PORTALS: Record<Portal, PortalInfo> = {
  customer: { signIn: '/sign-in', home: '/', start: '/sign-up', label: 'Customer' },
  merchant: {
    signIn: '/merchants/sign-in',
    home: '/merchant',
    start: '/merchants/apply',
    label: 'Merchant',
  },
  rider: { signIn: '/riders/sign-in', home: '/rider', start: '/riders/apply', label: 'Rider' },
  /* Hosts start on the public page; their onboarding lives inside the
     workspace once an account exists. */
  host: { signIn: '/hosts/sign-in', home: '/host', start: '/hosts', label: 'Host' },
};

export function isPortal(value: unknown): value is Portal {
  return value === 'customer' || value === 'merchant' || value === 'rider' || value === 'host';
}

/** The partner portal an account kind from fn_partner_home belongs to, if any. */
export function portalForKind(kind: string | null | undefined): Portal | null {
  return kind === 'merchant' || kind === 'rider' || kind === 'host' ? kind : null;
}

/** An internal path only: no scheme, no protocol-relative "//", no backslashes. */
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  if (!/^\/(?![/\\])/.test(value) || value.includes('\\')) return undefined;
  if ([...value].some((char) => char.charCodeAt(0) < 32)) return undefined;
  return value;
}

/** True when `path` is this portal's home or somewhere inside it. */
export function withinPortal(portal: Portal, path: string): boolean {
  const home = PORTALS[portal].home;
  if (home === '/') return true;
  return path === home || path.startsWith(`${home}/`) || path.startsWith(`${home}?`);
}

/** A sign-in URL for a portal, with optional query parameters. */
export function signInHref(
  portal: Portal,
  params: Record<string, string | undefined> = {},
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${PORTALS[portal].signIn}?${text}` : PORTALS[portal].signIn;
}

/** Sign-in, sign-up and password pages, where the location popup stays away. */
export function isAuthPage(pathname: string): boolean {
  return (
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/sign-up' ||
    pathname.startsWith('/sign-up/') ||
    Object.values(PORTALS).some(
      (portal) => pathname === portal.signIn || pathname.startsWith(`${portal.signIn}/`),
    )
  );
}

/** The portal a "Forgot password" request came from, after the reset. */
export function homeAfterReset(value: unknown): string {
  const allowed = new Set(Object.values(PORTALS).map((portal) => portal.home));
  return typeof value === 'string' && allowed.has(value) ? value : '/';
}

/** What fn_partner_home says this account is. */
export type PartnerHome = { kind?: string; home?: string } | null;

/**
 * Where somebody lands after signing in on a portal.
 *
 * The portal is a hint, not an answer: the real destination comes from
 * `fn_partner_home`, which reads what this account actually *is*.
 *
 * - Customer sign-in honours a safe `next` (the stay booking page, checkout)
 *   for everybody. With no `next`, a merchant, rider or host who used the
 *   customer page anyway goes to their own workspace rather than being
 *   stranded on the home page; they are already signed in, so there is no
 *   reason to send them to another form.
 * - A partner portal sends the account to its own home, keeping a `next`
 *   that points inside that portal (a bookmarked /host?open=… link). An
 *   account with nothing yet goes to where that kind of partner starts.
 */
export function landingFor(portal: Portal, home: PartnerHome, next: string | undefined): string {
  const partner = portalForKind(home?.kind);
  if (portal === 'customer') {
    if (next) return next;
    return partner && home?.home ? home.home : PORTALS.customer.home;
  }
  if (partner && home?.home) {
    if (partner === portal && next && withinPortal(portal, next)) return next;
    return home.home;
  }
  return PORTALS[portal].start;
}
