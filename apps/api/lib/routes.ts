/**
 * The /v1 routes NexG serves, and the methods each one answers.
 *
 * The middleware reads this table to answer a path that is not an endpoint
 * with a JSON 404, and a method an endpoint does not serve with a JSON 405,
 * instead of Next.js's HTML page and empty 405. It is plain data so the
 * middleware stays small. `tests/reference.test.ts` keeps it equal to the
 * route files under `app/v1` and to the live endpoints in the registry.
 */
export type V1Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface V1Route {
  /** As the registry writes it: `{id}` stands for one path segment. */
  path: string;
  methods: readonly V1Method[];
}

export const V1_ROUTES: readonly V1Route[] = [
  { path: '/v1/catalog/merchants', methods: ['GET'] },
  { path: '/v1/catalog/merchants/{id}', methods: ['GET'] },
  { path: '/v1/experiences', methods: ['GET'] },
  { path: '/v1/orders', methods: ['GET', 'POST'] },
  { path: '/v1/orders/{id}', methods: ['GET'] },
  { path: '/v1/services', methods: ['GET'] },
  { path: '/v1/zones', methods: ['GET'] },
];

const MATCHERS = V1_ROUTES.map((route) => ({
  route,
  pattern: new RegExp(`^${route.path.replace(/\{\w+\}/g, '[^/]+')}/?$`),
}));

/** The route that serves this path, or null when none does. */
export function matchV1Route(pathname: string): V1Route | null {
  return MATCHERS.find(({ pattern }) => pattern.test(pathname))?.route ?? null;
}

/** The Allow header, as Next.js writes it: the route's methods, HEAD with GET, and OPTIONS. */
export function allowHeader(methods: readonly V1Method[]): string {
  return [...methods, ...(methods.includes('GET') ? ['HEAD'] : []), 'OPTIONS'].join(', ');
}
