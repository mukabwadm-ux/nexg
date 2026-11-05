export const REAL_REGISTRATION_PATH = '/merchants/apply';
export const DEMO_PORTAL_PATH = '/merchant-live-preview?state=setup';

// A configured platform origin is public routing information, never a token.
// Form values, application IDs and operation IDs are never copied to this URL.
export function platformRegistrationHref(value, development = false) {
  const base = value || (development ? 'http://127.0.0.1:3000' : '');
  if (!base) return null;
  try {
    const url = new URL(base);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (url.protocol !== 'https:' && !(development && loopback && url.protocol === 'http:'))
      return null;
    return new URL(REAL_REGISTRATION_PATH, url.origin).href;
  } catch {
    return null;
  }
}

export const DEMO_REGISTRATION = Object.freeze({
  registryRevision: 'nexg-booking-2026-10-31.1',
  categoryId: 'restaurants_food',
  subcategories: ['restaurant'],
  business: {
    name: 'Demo business',
    firstName: 'Demo',
    lastName: 'User',
    email: 'demo@example.invalid',
    phone: '+254700000000',
    branchCount: 1,
    registered: false,
    sameBusinessPhone: true,
    businessPhone: '+254700000000',
    marketing: false,
  },
  policies: { terms: true },
});
