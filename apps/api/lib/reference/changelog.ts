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
    date: '2026-11-14',
    kind: 'added',
    title: 'Book a service',
    body: [
      'POST /v1/orders books a service for your guests, such as an airport transfer, a courier or a venue, with a key that has merchant_write. NexG prices it from its fee settings for your city, and the booking is charged to your merchant’s account.',
      'Every booking needs an Idempotency-Key: a retry with the same key gets the first answer back and never books twice. The answer is 201 with the receipt as data.booking and a Location header for the full order.',
      'A service can be booked in a city once NexG has priced it there, and there is no test mode yet: every booking is a real order.',
    ],
    endpoints: ['create-order'],
  },
  {
    date: '2026-11-11',
    kind: 'fixed',
    title: 'Keys are always checked, and every /v1 answer is JSON',
    body: [
      'A key sent as X-Api-Key to merchants, a merchant, experiences, zones or services could be answered from NexG’s cache without being checked, so an unknown or revoked key got 200 instead of 401. A request that carries a key is now never answered from a cache: the key is checked and the request spends tokens every time. Requests without a key are cached as before.',
      'Answers to requests with a key carry RateLimit-Remaining: the whole tokens left in your bucket after that request.',
      'A path under /v1 that is not an endpoint answers 404 not_found as JSON instead of a web page, and a method an endpoint does not accept answers 405 method_not_allowed with an Allow header instead of an empty body.',
    ],
    endpoints: [
      'list-merchants',
      'get-merchant',
      'list-zones',
      'list-experiences',
      'list-services',
      'list-orders',
      'get-order',
    ],
  },
  {
    date: '2026-11-10',
    kind: 'added',
    title: 'Read one order by id',
    body: [
      'GET /v1/orders/{id} returns one of your merchant’s orders, as the same object the list returns. It needs a key with merchant_read; an id from another merchant is answered as not found.',
    ],
    endpoints: ['get-order'],
  },
  {
    date: '2026-11-10',
    kind: 'fixed',
    title: 'Your orders, lists, paging, search and error statuses',
    body: [
      'GET /v1/orders works: every call used to fail with 500 inside the database read behind it. Pages of orders now start with the newest and follow the cursor without losing any.',
      'limit is accepted (1 to 100) instead of always being refused. Pages after the first no longer skip merchants or events. A cursor the endpoint did not issue is refused with 400 instead of starting again at page one.',
      'q may contain commas and parentheses. GET /v1/experiences lists upcoming events again: ticket_bands and suggested_blocks are lists, as the database stores them. An unknown city on experiences returns an empty list instead of every city.',
      'An unknown merchant answers 404 instead of 400, and server failures answer 500 instead of 400, always with the JSON error body. NexG now logs the X-Request-Id of every server error, so a quoted id can be traced.',
    ],
    endpoints: ['list-merchants', 'get-merchant', 'list-zones', 'list-experiences', 'list-orders'],
  },
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
