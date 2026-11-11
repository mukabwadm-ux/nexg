import type { ChangelogEntry } from './types';

/**
 * What changed in the NexG API, newest first.
 *
 * Add an entry in the same pull request as the change. The tests check
 * that every live endpoint in `endpoints.ts` has an `added` entry naming
 * its slug, that every slug named here exists, and that dates run newest
 * first, so the reference and this list move together.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-11-10',
    kind: 'docs',
    title: 'New developer documentation',
    body: [
      'A new home page, guides to authentication, errors, rate limits, webhooks and connecting your systems, and an endpoint reference with request samples in curl, JavaScript and Python.',
      'The reference and this changelog are generated from one registry that is checked against the API’s routes on every change, and they list known issues alongside each endpoint.',
    ],
    endpoints: [],
  },
  {
    date: '2026-11-10',
    kind: 'added',
    title: 'Bank collections and the signed bank webhook',
    body: [
      'Banks can send signed collection events to NexG, verified with an HMAC-SHA256 signature in X-Bank-Signature. Each event is recorded once, and only a verified event marks an order paid.',
      'Available with the NexG Sandbox Bank on test deployments. The production site waits for a real bank.',
    ],
    endpoints: ['bank-webhook', 'bank-webhook-check'],
  },
  {
    date: '2026-11-09',
    kind: 'changed',
    title: 'Developer console sign-in checks for bots',
    body: [
      'Signing in to the developer console now includes a Cloudflare Turnstile check, like the rest of nexgapp.com. API keys and requests are unaffected.',
    ],
    endpoints: [],
  },
  {
    date: '2026-11-02',
    kind: 'changed',
    title: 'One rate-limit bucket per merchant or developer',
    body: [
      'Requests spend tokens from a single bucket shared by all of a merchant’s keys (or all of a developer’s keys without a merchant), refilled each minute. Public reads cost 1 token and merchant order reads cost 3. A 429 carries Retry-After in seconds.',
      'Requests without a key share one anonymous bucket of 120 tokens a minute.',
      'Merchant keys stop working while the merchant is paused, suspended or delisted, or while its application is waiting for approval. They work again once it may operate.',
    ],
    endpoints: [
      'list-merchants',
      'get-merchant',
      'list-zones',
      'list-experiences',
      'list-services',
      'list-orders',
    ],
  },
  {
    date: '2026-10-22',
    kind: 'added',
    title: 'Read your merchant orders',
    body: [
      'GET /v1/orders returns the orders of the merchant your key is bound to, newest first. It needs a key with merchant_read; the key, never the request, decides the merchant.',
    ],
    endpoints: ['list-orders'],
  },
  {
    date: '2026-10-21',
    kind: 'added',
    title: 'NexG API v1',
    body: [
      'Public reads of live merchants and their catalogues, delivery zones, upcoming experiences and bookable services, all under /v1.',
      'The developer console at api.nexgapp.com/developers issues keys, chosen by merchant name rather than by id.',
    ],
    endpoints: [
      'list-merchants',
      'get-merchant',
      'list-zones',
      'list-experiences',
      'list-services',
    ],
  },
];
