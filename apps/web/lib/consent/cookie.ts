/**
 * The cookie-consent choice, as the Cookie Policy describes it
 * (content/legal/cookies.ts, sections 4 and 9): strictly necessary cookies
 * are always on; functional, analytics and marketing are off until the
 * visitor allows them, and the choice is kept for 12 months.
 *
 * Plain functions with no browser globals, so the server, the client and
 * the tests read the cookie the same way.
 */

export const CONSENT_COOKIE = 'nexg_consent';

/**
 * Bumped when a category is added or its meaning changes. A stored choice
 * with another version is treated as no choice, so everybody is asked
 * again, as the policy promises ("we also ask again if we add a new
 * category of cookies").
 */
export const CONSENT_VERSION = 1;

/** Twelve months, the period the policy gives for the consent choice. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type ConsentCategory = 'functional' | 'analytics' | 'marketing';

export const CONSENT_CATEGORIES: readonly ConsentCategory[] = [
  'functional',
  'analytics',
  'marketing',
];

export interface ConsentChoice {
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

export interface Consent extends ConsentChoice {
  /** CONSENT_VERSION when the choice was made. */
  v: number;
  /** When the choice was made, ISO 8601. The record the policy says we keep. */
  at: string;
}

export const ACCEPT_ALL: ConsentChoice = { functional: true, analytics: true, marketing: true };
export const REJECT_ALL: ConsentChoice = { functional: false, analytics: false, marketing: false };

export function makeConsent(choice: ConsentChoice, now: Date = new Date()): Consent {
  return {
    v: CONSENT_VERSION,
    functional: choice.functional === true,
    analytics: choice.analytics === true,
    marketing: choice.marketing === true,
    at: now.toISOString(),
  };
}

/**
 * A stored cookie value back into a choice, or null when there is no valid,
 * current choice: missing, unreadable, another version, a category that is
 * not a boolean, a date that is not a date or is in the future, or older
 * than 12 months. Null means "ask".
 */
export function parseConsent(
  raw: string | null | undefined,
  now: Date = new Date(),
): Consent | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (o.v !== CONSENT_VERSION) return null;
  for (const key of CONSENT_CATEGORIES) {
    if (typeof o[key] !== 'boolean') return null;
  }
  if (typeof o.at !== 'string') return null;
  const at = Date.parse(o.at);
  if (!Number.isFinite(at)) return null;
  /* A minute of clock skew is allowed; a choice "made" next week is not a choice. */
  if (at > now.getTime() + 60_000) return null;
  if (now.getTime() - at > CONSENT_MAX_AGE_SECONDS * 1000) return null;
  return {
    v: CONSENT_VERSION,
    functional: o.functional as boolean,
    analytics: o.analytics as boolean,
    marketing: o.marketing as boolean,
    at: new Date(at).toISOString(),
  };
}

export function serializeConsent(consent: Consent): string {
  return encodeURIComponent(JSON.stringify(consent));
}

/** The consent choice out of a whole `document.cookie` or Cookie header. */
export function readConsentCookie(
  cookieHeader: string | null | undefined,
  now: Date = new Date(),
): Consent | null {
  if (!cookieHeader) return null;
  const prefix = `${CONSENT_COOKIE}=`;
  const entry = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return entry ? parseConsent(entry.slice(prefix.length), now) : null;
}

/** The `document.cookie` assignment that stores a choice. First-party, Lax, 12 months. */
export function consentCookieString(consent: Consent, options: { secure: boolean }): string {
  return [
    `${CONSENT_COOKIE}=${serializeConsent(consent)}`,
    'Path=/',
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    ...(options.secure ? ['Secure'] : []),
  ].join('; ');
}

type ConsentSignal = 'granted' | 'denied';

/**
 * Google Consent Mode v2 signals for a choice. No choice means everything
 * optional is denied; only security storage, which is strictly necessary,
 * is granted.
 */
export function googleConsent(consent: Consent | null): Record<string, ConsentSignal> {
  const on = (yes: boolean | undefined): ConsentSignal => (yes ? 'granted' : 'denied');
  return {
    ad_storage: on(consent?.marketing),
    ad_user_data: on(consent?.marketing),
    ad_personalization: on(consent?.marketing),
    analytics_storage: on(consent?.analytics),
    functionality_storage: on(consent?.functional),
    personalization_storage: on(consent?.functional),
    security_storage: 'granted',
  };
}

/** A GA4 measurement ID: "G-" and letters or digits. Anything else is not loaded. */
export function isMeasurementId(id: string | null | undefined): id is string {
  return typeof id === 'string' && /^G-[A-Z0-9]{4,20}$/.test(id.trim());
}

/*
 * Partners' workspaces and the pages around signing in are not the public
 * shop: no banner, no analytics. The first path segment decides, so
 * /merchants (the public "register your business" page) is not /merchant.
 */
const WORKSPACE_SEGMENTS = new Set([
  'merchant',
  'merchant-live-preview',
  'merchant-preview',
  'merchant-work-preview',
  'merchant-email-verification-preview',
  'booking-workspace',
  'host',
  'rider',
  'receipts',
]);

const NO_ANALYTICS_SEGMENTS = new Set(['auth', 'reset-password', 'verify']);

/*
 * Section 5 of the Cookie Policy: no third-party analytics on pharmacy or
 * health-related pages.
 */
const HEALTH = /pharmac|health|clinic|medic/i;

function segments(pathname: string): string[] {
  return pathname.split(/[?#]/)[0]!.split('/').filter(Boolean);
}

/** Pages where the consent banner does not appear (partner workspaces). */
export function isConsentBannerHidden(pathname: string): boolean {
  const first = segments(pathname)[0] ?? '';
  return WORKSPACE_SEGMENTS.has(first);
}

/** Pages where analytics never runs, whatever the visitor chose. */
export function isAnalyticsExcluded(pathname: string): boolean {
  const parts = segments(pathname);
  const first = parts[0] ?? '';
  if (WORKSPACE_SEGMENTS.has(first) || NO_ANALYTICS_SEGMENTS.has(first)) return true;
  return parts.some((part) => HEALTH.test(part));
}

/**
 * The one rule for loading Google Analytics: a measurement ID is configured,
 * the visitor allowed analytics, and the page is not excluded.
 */
export function shouldLoadAnalytics(input: {
  measurementId: string | null | undefined;
  consent: Consent | null;
  pathname: string;
}): boolean {
  return (
    isMeasurementId(input.measurementId) &&
    input.consent?.analytics === true &&
    !isAnalyticsExcluded(input.pathname)
  );
}
