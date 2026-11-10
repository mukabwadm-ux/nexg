/**
 * The shapes the API reference is written in.
 *
 * Everything the documentation says about an endpoint lives in one typed
 * registry (`endpoints.ts`), next to the changelog (`changelog.ts`). The
 * reference pages, the sidebar, the home page and the changelog all read
 * from it, and `tests/reference.test.ts` checks it against the route
 * handlers that actually exist, so the docs cannot quietly drift from the
 * API they describe.
 */

export type HttpMethod = 'GET' | 'POST' | 'PATCH';

/**
 * - `live`: the route is served on api.nexgapp.com (or nexgapp.com).
 * - `sandbox`: the route is served, but only does its job on test
 *   deployments today (for example, the bank webhook with the NexG
 *   Sandbox Bank).
 * - `coming_soon`: designed in the database or the contracts package, but
 *   no route serves it yet. Calling it returns 404 or 405.
 */
export type EndpointStatus = 'live' | 'sandbox' | 'coming_soon';

/** Which NexG host serves the route. */
export type Host = 'api' | 'web';

export const HOSTS: Record<Host, string> = {
  api: 'https://api.nexgapp.com',
  web: 'https://nexgapp.com',
};

export type ApiScope = 'public_read' | 'merchant_read' | 'merchant_write';

export type EndpointGroup =
  | 'Catalogue'
  | 'Zones'
  | 'Experiences'
  | 'Services'
  | 'Orders'
  | 'Callbacks to NexG';

export type AuthDoc =
  /** Works without a key; a key with `public_read` gets its own bucket. */
  | { kind: 'optional_key'; scope: 'public_read' }
  /** Needs a key with this scope; `merchantBound` keys act for one merchant. */
  | { kind: 'key'; scope: ApiScope; merchantBound: boolean }
  /** The sender signs the body; there is no API key. */
  | { kind: 'signature'; header: string }
  | { kind: 'none' };

export interface ParamDoc {
  name: string;
  in: 'path' | 'query' | 'header';
  type: string;
  required: boolean;
  description: string;
  /** Behaviour today that differs from what the parameter is for. */
  knownIssue?: string;
}

export interface FieldDoc {
  name: string;
  type: string;
  nullable?: boolean;
  description: string;
}

/** A named object in a request or response, documented field by field. */
export interface ResourceDoc {
  /**
   * The schema in `@nexg/contracts/api` this mirrors, checked by the tests.
   * Absent for objects that have no contract schema (the bank event).
   */
  schema?:
    | 'PublicMerchant'
    | 'CatalogueItem'
    | 'PublicZone'
    | 'PublicEvent'
    | 'ApiService'
    | 'ApiOrder'
    | 'ServiceBooking'
    | 'BookingReceipt';
  title: string;
  /** Where the object sits in the body, e.g. `data.items[]`. */
  at: string;
  fields: FieldDoc[];
}

export interface ErrorDoc {
  status: number;
  /**
   * `error.code` for API routes; `reason` for the webhook. Null when the
   * response has no JSON body at all (Next.js's own 500 after a crash).
   */
  code: string | null;
  when: string;
}

export interface CodeSample {
  language: 'curl' | 'javascript' | 'python' | 'http';
  label: string;
  code: string;
}

export interface EndpointDoc {
  /** URL slug under /docs/reference. Stable: links point at it. */
  slug: string;
  method: HttpMethod;
  host: Host;
  /** Path with `{param}` placeholders, as callers write it. */
  path: string;
  status: EndpointStatus;
  group: EndpointGroup;
  title: string;
  /** One sentence, shown in lists. */
  summary: string;
  /** Paragraphs for the endpoint page. */
  description: string[];
  auth: AuthDoc;
  /** Rate-limit tokens one call spends, or null where no bucket applies. */
  rateCost: number | null;
  /** The Cache-Control header on a successful response. */
  cache: string | null;
  paginated: boolean;
  params: ParamDoc[];
  /** Values used to build the request samples. */
  example: {
    path?: Record<string, string>;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: unknown;
  };
  /** Request samples written by hand, replacing the generated ones. */
  samples?: CodeSample[];
  requestResources?: ResourceDoc[];
  responseStatus: string;
  responseExample: unknown;
  responseResources: ResourceDoc[];
  errors: ErrorDoc[];
  notes?: string[];
  knownIssues?: string[];
  /**
   * Set while a live endpoint is failing for ordinary requests. Shown as a
   * warning wherever the endpoint is listed, not only on its own page.
   */
  warning?: string;
  /** The date it was first served (YYYY-MM-DD); absent while coming soon. */
  since?: string;
  /**
   * The route file that serves it, relative to the repository root. For a
   * coming-soon endpoint, the file a future route would live in: the tests
   * check that it does not serve this method yet.
   */
  source: string;
}

export interface ChangelogEntry {
  /** YYYY-MM-DD */
  date: string;
  kind: 'added' | 'changed' | 'fixed' | 'deprecated' | 'removed' | 'docs';
  title: string;
  body: string[];
  /** Endpoint slugs this entry is about. */
  endpoints: string[];
}
