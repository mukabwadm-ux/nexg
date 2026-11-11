import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ApiOrder,
  ApiService,
  BookingReceipt,
  CatalogueItem,
  ERROR_CODES,
  ListRequest,
  PageEnvelope,
  PublicEvent,
  PublicMerchant,
  PublicZone,
  ServiceBooking,
} from '@nexg/contracts/api';

import { tokenize } from '../lib/highlight';
import { jsonError, parseQuery } from '../lib/http';
import { CHANGELOG } from '../lib/reference/changelog';
import { ENDPOINTS, endpointBySlug } from '../lib/reference/endpoints';
import { DOCS_NAV, GUIDE_SECTIONS } from '../lib/reference/navigation';
import { requestSamples } from '../lib/reference/samples';
import type { EndpointDoc, HttpMethod } from '../lib/reference/types';

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
  ServiceBooking,
  BookingReceipt,
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
        data: z.object({ merchant: PublicMerchant, catalogue: z.array(CatalogueItem) }).strict(),
        meta: z.object({ api_version: z.literal('v1') }).strict(),
      })
      .strict();
    expect(() => detail.parse(endpoint('get-merchant').responseExample)).not.toThrow();
  });

  it('the coming-soon examples follow their planned contracts', () => {
    const booking = endpoint('create-order');
    expect(() => ServiceBooking.parse(booking.example.body)).not.toThrow();
    expect(() => BookingReceipt.parse(booking.responseExample)).not.toThrow();
    const one = z
      .object({
        ok: z.literal(true),
        data: z.object({ items: z.array(ApiOrder) }).strict(),
        meta: z.object({ api_version: z.literal('v1') }).strict(),
      })
      .strict();
    expect(() => one.parse(endpoint('get-order').responseExample)).not.toThrow();
  });

  it('the experiences example has the database’s shape for bands and blocks', () => {
    const asStored = PublicEvent.extend({
      ticket_bands: z.array(
        z
          .object({ label: z.string(), price_kes: z.number().int(), currency: z.literal('KES') })
          .strict(),
      ),
      suggested_blocks: z.array(z.record(z.string())),
    }).strict();
    expect(() =>
      PageEnvelope(asStored).parse(endpoint('list-experiences').responseExample),
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

describe('the known issues the docs admit to are still real', () => {
  /*
   * Each test below pins a bug the reference warns readers about. When a
   * fix lands, the test fails: delete the known issue from the registry
   * (and the guides), add a "fixed" changelog entry, then delete the test.
   */

  it('refuses a limit sent in the query string', () => {
    expect(parseQuery(ListRequest, new URLSearchParams('limit=5')).ok).toBe(false);
  });

  it('cannot parse an upcoming event as the database stores it', () => {
    const [stored] = (
      endpoint('list-experiences').responseExample as { data: { items: unknown[] } }
    ).data.items;
    expect(PublicEvent.safeParse(stored).success).toBe(false);
  });

  it('answers errors without an explicit status with HTTP 400', () => {
    // Why an unknown merchant is 400 not_found, and some failures 400 internal_error.
    expect(jsonError('not_found', 'Merchant not found').status).toBe(400);
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

  it.each(['GET', 'POST', 'PATCH'] as HttpMethod[])(
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
