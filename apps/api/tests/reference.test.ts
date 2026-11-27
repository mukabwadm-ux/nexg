import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ApiBookingRider,
  ApiBookingRiderLocation,
  ApiClosure,
  ApiDeparture,
  ApiOffering,
  ApiOrder,
  ApiReservation,
  ApiReservationDriver,
  ApiReservationOffering,
  ApiReservationTrip,
  ApiResource,
  ApiService,
  BookingReceipt,
  ClosureRequest,
  DepartureRequest,
  OfferingUpdate,
  ReservationAccept,
  ReservationDecline,
  ReservationDriverRequest,
  TestReservationMove,
  TestReservationRequest,
  CatalogueItem,
  DeliveryCheck,
  DeliveryCheckRequest,
  DeliveryDropoff,
  DeliveryPickup,
  ERROR_CODES,
  ListRequest,
  PageEnvelope,
  PublicBranch,
  PublicEvent,
  PublicMerchant,
  PublicZone,
  ServiceBooking,
  WebhookEvent,
} from '@nexg/contracts/api';
import { EVENT_EXAMPLE, RESERVATION_EVENT_EXAMPLE } from '../lib/reference/events';

import { tokenize } from '../lib/highlight';
import { jsonError, parseQuery } from '../lib/http';
import { CHANGELOG } from '../lib/reference/changelog';
import { ENDPOINTS, endpointBySlug } from '../lib/reference/endpoints';
import { DOCS_NAV, GUIDE_SECTIONS } from '../lib/reference/navigation';
import { requestSamples } from '../lib/reference/samples';
import type { EndpointDoc, HttpMethod } from '../lib/reference/types';
import { V1_ROUTES } from '../lib/routes';

/**
 * The API reference is only worth reading if it is true. These tests hold
 * the registry in lib/reference to the code: the routes that exist, the
 * schemas responses are checked against, the changelog, and the known
 * issues the docs admit to.
 */

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const API_APP = join(REPO, 'apps', 'api', 'app');
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'] as const;

function walk(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}

/** The HTTP methods a route file exports, read from its source. */
function exportedMethods(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return METHODS.filter((method) =>
    new RegExp(
      `export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b|export\\s*\\{[^}]*\\bas\\s+${method}\\b`,
    ).test(source),
  );
}

/** apps/api/app/v1/catalog/merchants/[id]/route.ts -> /v1/catalog/merchants/{id} */
function routePath(file: string): string {
  const parts = relative(API_APP, file).split(sep).slice(0, -1);
  return `/${parts.join('/')}`.replace(/\[(\w+)\]/g, '{$1}');
}

function key(method: string, path: string) {
  return `${method} ${path}`;
}

const SCHEMAS = {
  PublicMerchant,
  CatalogueItem,
  PublicZone,
  PublicEvent,
  ApiService,
  ApiOrder,
  ApiBookingRider,
  ApiBookingRiderLocation,
  ApiReservation,
  ApiReservationOffering,
  ApiReservationTrip,
  ApiReservationDriver,
  ApiOffering,
  ApiDeparture,
  ApiResource,
  ApiClosure,
  PublicBranch,
  ServiceBooking,
  BookingReceipt,
  DeliveryCheckRequest,
  DeliveryCheck,
  DeliveryPickup,
  DeliveryDropoff,
} as const;

function endpoint(slug: string): EndpointDoc {
  const found = endpointBySlug(slug);
  if (!found) throw new Error(`No endpoint ${slug} in the registry.`);
  return found;
}

describe('the registry matches the routes that exist', () => {
  const routeFiles = walk(join(API_APP, 'v1')).filter((file) => file.endsWith(`${sep}route.ts`));
  const served = new Set(
    routeFiles.flatMap((file) =>
      exportedMethods(file).map((method) => key(method, routePath(file))),
    ),
  );

  it('finds the v1 route files', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  it('documents every method every v1 route serves, as live', () => {
    const documented = new Set(
      ENDPOINTS.filter((e) => e.host === 'api' && e.status !== 'coming_soon').map((e) =>
        key(e.method, e.path),
      ),
    );
    expect([...served].sort()).toEqual([...documented].sort());
  });

  it('gives the middleware a route table with exactly those routes and methods', () => {
    // The middleware answers anything else under /v1 with a JSON 404 or 405,
    // so a route missing from the table would be unreachable.
    const table = V1_ROUTES.flatMap((r) => r.methods.map((m) => key(m, r.path)));
    expect(new Set(table).size).toBe(table.length);
    expect([...table].sort()).toEqual([...served].sort());
  });

  it.each(ENDPOINTS.map((e) => [e.slug, e] as const))(
    '%s points at the file that serves it',
    (_, e) => {
      if (e.host === 'api') {
        const expected = `apps/api/app${e.path.replace(/\{(\w+)\}/g, '[$1]')}/route.ts`;
        expect(e.source).toBe(expected);
      }
      const file = join(REPO, ...e.source.split('/'));
      if (e.status === 'coming_soon') {
        // Designed, not served: the day a handler appears, flip the status.
        const methods = existsSync(file) ? exportedMethods(file) : [];
        expect(methods).not.toContain(e.method);
      } else {
        expect(existsSync(file)).toBe(true);
        expect(exportedMethods(file)).toContain(e.method);
      }
    },
  );

  it('has unique slugs and unique routes', () => {
    const slugs = ENDPOINTS.map((e) => e.slug);
    const routes = ENDPOINTS.map((e) => key(e.method, `${e.host}${e.path}`));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

describe('the documented shapes match @nexg/contracts/api', () => {
  const documented = ENDPOINTS.flatMap((e) => [
    ...(e.requestResources ?? []),
    ...e.responseResources,
  ]).filter((resource) => resource.schema);

  it.each(documented.map((r) => [`${r.title} (${r.at})`, r] as const))(
    '%s lists exactly the schema’s fields',
    (_, resource) => {
      const schema = SCHEMAS[resource.schema as keyof typeof SCHEMAS];
      expect(resource.fields.map((field) => field.name).sort()).toEqual(
        Object.keys(schema.shape).sort(),
      );
    },
  );

  it('list examples are valid pages', () => {
    expect(() =>
      PageEnvelope(PublicMerchant).parse(endpoint('list-merchants').responseExample),
    ).not.toThrow();
    expect(() =>
      PageEnvelope(PublicZone).parse(endpoint('list-zones').responseExample),
    ).not.toThrow();
    expect(() =>
      PageEnvelope(ApiService).parse(endpoint('list-services').responseExample),
    ).not.toThrow();
    expect(() =>
      PageEnvelope(ApiOrder).parse(endpoint('list-orders').responseExample),
    ).not.toThrow();
  });

  it('the merchant example is a valid merchant and catalogue', () => {
    const detail = z
      .object({
        ok: z.literal(true),
        data: z
          .object({
            merchant: PublicMerchant,
            branches: z.array(PublicBranch),
            catalogue: z.array(CatalogueItem),
          })
          .strict(),
        meta: z.object({ api_version: z.literal('v1') }).strict(),
      })
      .strict();
    expect(() => detail.parse(endpoint('get-merchant').responseExample)).not.toThrow();
  });

  it('the booking example follows its contracts', () => {
    const booking = endpoint('create-order');
    expect(() => ServiceBooking.parse(booking.example.body)).not.toThrow();
    const receipt = z
      .object({
        ok: z.literal(true),
        data: z.object({ booking: BookingReceipt }).strict(),
        meta: z.object({ api_version: z.literal('v1') }).strict(),
      })
      .strict();
    expect(() => receipt.parse(booking.responseExample)).not.toThrow();
  });

  it('the delivery check example follows its contracts', () => {
    const check = endpoint('check-delivery');
    expect(() => DeliveryCheckRequest.parse(check.example.body)).not.toThrow();
    const answer = z
      .object({
        ok: z.literal(true),
        data: DeliveryCheck,
        meta: z.object({ api_version: z.literal('v1') }).strict(),
      })
      .strict();
    expect(() => answer.parse(check.responseExample)).not.toThrow();
  });

  it('the order events example is a valid event', () => {
    expect(() => WebhookEvent.parse(EVENT_EXAMPLE)).not.toThrow();
  });

  it('the reservation event example is a valid event without the guest’s details', () => {
    const event = WebhookEvent.parse(RESERVATION_EVENT_EXAMPLE);
    expect(event.data.reservation).toBeDefined();
    expect(event.data.reservation).not.toHaveProperty('guest_name');
    expect(event.data.reservation).not.toHaveProperty('trip');
    expect(event.data.reservation).not.toHaveProperty('notes');
  });

  it('the reservation examples follow their contracts', () => {
    expect(() =>
      PageEnvelope(ApiReservation).parse(endpoint('list-reservations').responseExample),
    ).not.toThrow();
    const one = z
      .object({
        ok: z.literal(true),
        data: z.object({ reservation: ApiReservation }).strict(),
        meta: z.object({ api_version: z.literal('v1') }).strict(),
      })
      .strict();
    expect(() => one.parse(endpoint('get-reservation').responseExample)).not.toThrow();
  });

  const envelope = (data: z.ZodTypeAny) =>
    z
      .object({
        ok: z.literal(true),
        data,
        meta: z.object({ api_version: z.literal('v1') }).strict(),
      })
      .strict();

  it('the reservation action examples follow their contracts', () => {
    const one = envelope(z.object({ reservation: ApiReservation }).strict());
    const cases = [
      ['accept-reservation', ReservationAccept],
      ['decline-reservation', ReservationDecline],
      ['set-reservation-driver', ReservationDriverRequest],
      ['create-test-reservation', TestReservationRequest],
    ] as const;
    for (const [slug, request] of cases) {
      expect(() => request.parse(endpoint(slug).example.body), slug).not.toThrow();
      expect(() => one.parse(endpoint(slug).responseExample), slug).not.toThrow();
    }
    expect(() =>
      TestReservationMove.parse(endpoint('move-test-reservation').example.body),
    ).not.toThrow();
    expect(() =>
      envelope(
        z.object({ reservation: ApiReservation, previous_status: z.string() }).strict(),
      ).parse(endpoint('move-test-reservation').responseExample),
    ).not.toThrow();
  });

  it('the booking setup examples follow their contracts', () => {
    expect(() =>
      envelope(z.object({ items: z.array(ApiOffering) }).strict()).parse(
        endpoint('list-offerings').responseExample,
      ),
    ).not.toThrow();
    expect(() =>
      envelope(z.object({ items: z.array(ApiResource) }).strict()).parse(
        endpoint('list-resources').responseExample,
      ),
    ).not.toThrow();
    const offering = envelope(z.object({ offering: ApiOffering }).strict());
    const resource = envelope(z.object({ resource: ApiResource }).strict());
    expect(() => OfferingUpdate.parse(endpoint('update-offering').example.body)).not.toThrow();
    expect(() => offering.parse(endpoint('update-offering').responseExample)).not.toThrow();
    expect(() => DepartureRequest.parse(endpoint('add-departure').example.body)).not.toThrow();
    expect(() => offering.parse(endpoint('add-departure').responseExample)).not.toThrow();
    expect(() => ClosureRequest.parse(endpoint('close-resource').example.body)).not.toThrow();
    expect(() => resource.parse(endpoint('close-resource').responseExample)).not.toThrow();
    expect(() => resource.parse(endpoint('reopen-resource').responseExample)).not.toThrow();
  });

  it('the one-order example is a valid order', () => {
    const one = z
      .object({
        ok: z.literal(true),
        data: z.object({ order: ApiOrder }).strict(),
        meta: z.object({ api_version: z.literal('v1') }).strict(),
      })
      .strict();
    expect(() => one.parse(endpoint('get-order').responseExample)).not.toThrow();
  });

  it('the experiences example is a valid page of events', () => {
    expect(() =>
      PageEnvelope(PublicEvent).parse(endpoint('list-experiences').responseExample),
    ).not.toThrow();
  });

  it('uses only error codes from ERROR_CODES on API routes', () => {
    const codes = ENDPOINTS.filter((e) => e.host === 'api').flatMap((e) =>
      e.errors.map((error) => error.code),
    );
    // null marks a response with no JSON body, such as Next.js's own 500.
    for (const code of codes) if (code !== null) expect(Object.keys(ERROR_CODES)).toContain(code);
  });

  it('backs every warning with a written known issue', () => {
    for (const e of ENDPOINTS.filter((item) => item.warning)) {
      expect(e.status, e.slug).toBe('live');
      expect(e.knownIssues?.length, e.slug).toBeGreaterThan(0);
    }
  });
});

describe('the fixes the changelog announces stay fixed', () => {
  /*
   * These were known issues on the reference until 2026-11-10. If one
   * comes back, the changelog's "fixed" entry is no longer true.
   */

  it('accepts a limit sent in the query string, within 1 to 100', () => {
    const five = parseQuery(ListRequest, new URLSearchParams('limit=5'));
    expect(five.ok && five.data.limit).toBe(5);
    expect(parseQuery(ListRequest, new URLSearchParams('limit=0')).ok).toBe(false);
    expect(parseQuery(ListRequest, new URLSearchParams('limit=101')).ok).toBe(false);
    expect(parseQuery(ListRequest, new URLSearchParams('limit=ten')).ok).toBe(false);
    const none = parseQuery(ListRequest, new URLSearchParams(''));
    expect(none.ok && none.data.limit).toBe(25);
  });

  it('reads an event as the database stores it, prices as numbers', () => {
    const stored = {
      ...(endpoint('list-experiences').responseExample as { data: { items: object[] } }).data
        .items[0],
      // The console may store a price as numeric text, and bands without a currency.
      ticket_bands: [{ label: 'Regular', price_kes: '3500' }],
      suggested_blocks: [],
    };
    const parsed = PublicEvent.parse(stored);
    expect(parsed.ticket_bands).toEqual([{ label: 'Regular', price_kes: 3500 }]);
    expect(PublicEvent.safeParse({ ...stored, ticket_bands: [{ label: 'Free' }] }).success).toBe(
      false,
    );
  });

  it('answers each error code with its own status', () => {
    expect(jsonError('invalid_request', 'x').status).toBe(400);
    expect(jsonError('not_found', 'x').status).toBe(404);
    expect(jsonError('rate_limited', 'x').status).toBe(429);
    expect(jsonError('internal_error', 'x', { log: false }).status).toBe(500);
    // Credential failures still choose 401 and 403 themselves.
    expect(jsonError('not_found', 'x', { status: 401 }).status).toBe(401);
  });
});

describe('the changelog moves with the registry', () => {
  it('runs newest first, with real dates', () => {
    for (const entry of CHANGELOG) expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dates = CHANGELOG.map((entry) => entry.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('names only endpoints that exist', () => {
    for (const entry of CHANGELOG) {
      for (const slug of entry.endpoints) expect(endpointBySlug(slug), slug).toBeDefined();
    }
  });

  it.each(ENDPOINTS.filter((e) => e.status !== 'coming_soon').map((e) => [e.slug, e] as const))(
    '%s has an "added" entry on the date it went live',
    (slug, e) => {
      const added = CHANGELOG.find(
        (entry) => entry.kind === 'added' && entry.endpoints.includes(slug),
      );
      expect(added, `Add a changelog entry for ${slug}`).toBeDefined();
      expect(e.since).toBe(added?.date);
    },
  );

  it('never announces a coming-soon endpoint as added', () => {
    const soon = ENDPOINTS.filter((e) => e.status === 'coming_soon').map((e) => e.slug);
    for (const entry of CHANGELOG.filter((item) => item.kind === 'added')) {
      for (const slug of entry.endpoints) expect(soon).not.toContain(slug);
    }
  });
});

describe('the navigation matches the pages', () => {
  const links = DOCS_NAV.flatMap((section) => section.links);

  it.each(links.map((link) => [link.href] as const))('%s has a page', (href) => {
    const reference = /^\/docs\/reference\/(.+)$/.exec(href);
    if (reference) {
      expect(endpointBySlug(reference[1] ?? '')).toBeDefined();
      return;
    }
    const segments = href.split('/').filter(Boolean);
    expect(existsSync(join(API_APP, ...segments, 'page.tsx'))).toBe(true);
  });

  it('lists every guide page in the navigation', () => {
    const pages = walk(join(API_APP, 'docs'))
      .filter((file) => file.endsWith(`${sep}page.tsx`) && !file.includes('['))
      .map((file) => `/${relative(API_APP, file).split(sep).slice(0, -1).join('/')}`);
    const hrefs = new Set(links.map((link) => link.href));
    for (const page of pages)
      expect(hrefs.has(page), `${page} is not in the navigation`).toBe(true);
  });

  it('gives every guide a description', () => {
    for (const link of GUIDE_SECTIONS.flatMap((section) => section.links)) {
      expect(link.description.length).toBeGreaterThan(20);
    }
  });
});

describe('request samples', () => {
  it.each(ENDPOINTS.map((e) => [e.slug, e] as const))('%s has safe, complete samples', (_, e) => {
    const samples = requestSamples(e);
    expect(samples.length).toBeGreaterThanOrEqual(3);
    for (const sample of samples) {
      // Keys come from the environment, never pasted in.
      expect(sample.code).not.toMatch(/\b[0-9a-f]{64}\b/);
      if (e.auth.kind === 'key') expect(sample.code).toMatch(/NEXG_API_KEY/);
      // Public reads must work with no key set: Python must not index os.environ,
      // and JavaScript must not send the header when the key is missing.
      if (e.auth.kind === 'optional_key') {
        expect(sample.code).not.toContain('os.environ["NEXG_API_KEY"]');
        if (sample.language === 'javascript') expect(sample.code).toContain('key ?');
      }
      // Every sample calls the documented host and path.
      const path = e.path.replace(/\{(\w+)\}/g, (_m, name: string) => e.example.path?.[name] ?? '');
      expect(sample.code).toContain(path);
    }
  });

  it.each(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as HttpMethod[])(
    'writes %s calls with that method',
    (method) => {
      for (const e of ENDPOINTS.filter((item) => item.method === method && !item.samples)) {
        const [curl] = requestSamples(e);
        if (method === 'GET') expect(curl?.code).not.toMatch(/-X /);
        else expect(curl?.code).toContain(`-X ${method}`);
      }
    },
  );
});

describe('the highlighter', () => {
  const corpus = [
    ...ENDPOINTS.flatMap((e) =>
      requestSamples(e).map((sample) => ({
        code: sample.code,
        language: sample.language === 'curl' ? ('curl' as const) : sample.language,
      })),
    ),
    ...ENDPOINTS.map((e) => ({
      code: JSON.stringify(e.responseExample, null, 2),
      language: 'json' as const,
    })),
  ];

  it('gives back exactly the text it was given', () => {
    for (const { code, language } of corpus) {
      expect(
        tokenize(code, language)
          .map((token) => token.text)
          .join(''),
      ).toBe(code);
    }
  });

  it('tells JSON keys from string values', () => {
    const tokens = tokenize('{ "name": "Kilimani", "eta_min": 20, "cod": true }', 'json');
    expect(tokens.filter((t) => t.kind === 'key').map((t) => t.text)).toEqual([
      '"name"',
      '"eta_min"',
      '"cod"',
    ]);
    expect(tokens.find((t) => t.kind === 'string')?.text).toBe('"Kilimani"');
    expect(tokens.find((t) => t.kind === 'number')?.text).toBe('20');
    expect(tokens.find((t) => t.kind === 'literal')?.text).toBe('true');
  });

  it('reads shell comments, flags and variables without eating URLs', () => {
    const tokens = tokenize('curl https://x.test/a#b -H "X: $K" # done', 'curl');
    expect(tokens.find((t) => t.kind === 'comment')?.text).toBe('# done');
    expect(tokens.find((t) => t.kind === 'keyword' && t.text === '-H')).toBeDefined();
    expect(tokens.map((t) => t.text).join('')).toContain('https://x.test/a#b');
  });
});
