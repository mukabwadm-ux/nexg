import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_REQUEST_BYTES, type RouteRequest } from './contract.ts';
import { createRoutesHandler } from './handler.ts';

const accountId = 'e580202d-4c33-444c-90b2-2787106876d2';
const config = {
  enabled: 'true',
  supabaseUrl: 'https://backend.example.test',
  supabaseAnonKey: 'mock-public-key',
  googleApiKey: 'mock-server-routes-key',
};
const now = Date.parse('2026-11-15T09:30:00Z');
const itinerary: RouteRequest = {
  contractVersion: '1',
  requestId: 'route-request-1',
  contextId: 'local-day-1',
  travelMode: 'DRIVE',
  stops: [
    { id: 'start', latitude: 0, longitude: 0 },
    { id: 'lunch', latitude: 1, longitude: 2 },
    { id: 'end', latitude: 3, longitude: 4 },
  ],
};
// Google's documented example polyline.
const polyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const leg = { distanceMeters: 4500, duration: '73.125s', polyline: { encodedPolyline: polyline } };

function routeRequest(body: unknown = itinerary, init: RequestInit = {}) {
  return new Request('https://backend.example.test/functions/v1/maps-routes', {
    method: 'POST',
    headers: { authorization: 'Bearer mock-user-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
}

type MockOptions = {
  auth?: () => Response;
  budget?: () => Response;
  google?: (signal: AbortSignal) => Response | Promise<Response>;
  timeoutMs?: number;
  config?: Partial<typeof config>;
};

function mock(options: MockOptions = {}) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    assert(!(input instanceof Request));
    const url = new URL(input);
    calls.push({ url, init });
    switch (url.pathname) {
      case '/auth/v1/user':
        return options.auth?.() ?? Response.json({ id: accountId, is_anonymous: false });
      case '/rest/v1/rpc/rpc_maps_route_budget':
        return options.budget?.() ?? Response.json({ allowed: true, accountId });
      case '/directions/v2:computeRoutes':
        return options.google?.(init.signal!) ?? Response.json({ routes: [{ legs: [leg, leg] }] });
      default:
        throw new Error('Unexpected destination');
    }
  };
  const handle = createRoutesHandler(
    { ...config, ...options.config },
    {
      fetcher,
      now: () => now,
      timeoutMs: options.timeoutMs,
    },
  );
  return { handle, calls };
}

test('verifies the caller, reserves their budget and returns ordered, decoded Google legs', async () => {
  const { handle, calls } = mock();
  const response = await handle(routeRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  const coordinates = [
    { latitude: 38.5, longitude: -120.2 },
    { latitude: 40.7, longitude: -120.95 },
    { latitude: 43.252, longitude: -126.453 },
  ];
  assert.deepEqual(result, {
    contractVersion: '1',
    requestId: itinerary.requestId,
    accountId,
    provider: 'google-routes',
    travelMode: 'DRIVE',
    computedAt: '2026-11-15T09:30:00.000Z',
    expiresAt: '2026-11-15T09:35:00.000Z',
    status: 'available',
    legs: [
      {
        fromStopId: 'start',
        toStopId: 'lunch',
        distanceMeters: 4500,
        durationSeconds: 73.125,
        coordinates,
      },
      {
        fromStopId: 'lunch',
        toStopId: 'end',
        distanceMeters: 4500,
        durationSeconds: 73.125,
        coordinates,
      },
    ],
    warnings: [],
  });
  assert.deepEqual(
    calls.map(({ url, init }) => [url.href, init.method]),
    [
      ['https://backend.example.test/auth/v1/user', 'GET'],
      ['https://backend.example.test/rest/v1/rpc/rpc_maps_route_budget', 'POST'],
      ['https://routes.googleapis.com/directions/v2:computeRoutes', 'POST'],
    ],
  );
  for (const call of calls.slice(0, 2)) {
    const headers = new Headers(call.init.headers);
    assert.equal(headers.get('authorization'), 'Bearer mock-user-token');
    assert.equal(headers.get('apikey'), config.supabaseAnonKey);
    assert.equal(headers.get('x-goog-api-key'), null);
  }
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { p_context_id: itinerary.contextId });
  const provider = calls[2].init;
  const headers = new Headers(provider.headers);
  assert.equal(headers.get('authorization'), null);
  assert.equal(headers.get('apikey'), null);
  assert.equal(headers.get('x-goog-api-key'), config.googleApiKey);
  assert.equal(
    headers.get('x-goog-fieldmask'),
    'routes.legs.distanceMeters,routes.legs.duration,routes.legs.polyline.encodedPolyline,routes.warnings',
  );
  assert.deepEqual(JSON.parse(String(provider.body)), {
    origin: { location: { latLng: { latitude: 0, longitude: 0 } } },
    intermediates: [{ location: { latLng: { latitude: 1, longitude: 2 } } }],
    destination: { location: { latLng: { latitude: 3, longitude: 4 } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    computeAlternativeRoutes: false,
    optimizeWaypointOrder: false,
    polylineEncoding: 'ENCODED_POLYLINE',
    polylineQuality: 'OVERVIEW',
  });
});

test('walking keeps a plain explicit caution and bounds provider warnings', async () => {
  const { handle, calls } = mock({
    google: () =>
      Response.json({
        routes: [
          {
            legs: [leg, leg],
            warnings: [
              '<b>Footpath</b> detour',
              'Footpath detour',
              null,
              'x'.repeat(700),
              `${'y'.repeat(499)}😀 Footpath`,
              ...Array.from({ length: 10 }, (_, index) => `Other warning ${index}`),
            ],
          },
        ],
      }),
  });
  const response = await handle(routeRequest({ ...itinerary, travelMode: 'WALK' }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.travelMode, 'WALK');
  assert.equal(result.warnings.length, 8);
  assert.match(result.warnings[0], /may omit sidewalks/);
  assert.equal(result.warnings[1], 'Footpath detour');
  assert.equal(result.warnings[2].length, 500);
  assert.equal(result.warnings[3], 'y'.repeat(499));
  assert.equal('routingPreference' in JSON.parse(String(calls[2].init.body)), false);
});

test('does not try any upstream service until the endpoint and credentials are configured', async () => {
  for (const missing of [{ enabled: 'false' }, { googleApiKey: '' }, { supabaseUrl: 'bad' }]) {
    const { handle, calls } = mock({ config: missing });
    const response = await handle(routeRequest());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { contractVersion: '1', code: 'unavailable' });
    assert.deepEqual(calls, []);
  }
});

test('rejects non-POST methods and a missing or rejected bearer', async () => {
  const { handle, calls } = mock({
    auth: () => Response.json({ message: 'private' }, { status: 401 }),
  });
  const get = await handle(new Request('https://backend.example.test/functions/v1/maps-routes'));
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('allow'), 'POST');
  const missing = await handle(routeRequest(itinerary, { headers: {} }));
  assert.equal(missing.status, 401);
  assert.equal(calls.length, 0);
  const expired = await handle(routeRequest());
  assert.equal(expired.status, 401);
  assert.deepEqual(await expired.json(), {
    contractVersion: '1',
    code: 'unauthenticated',
    requestId: itinerary.requestId,
  });
  assert.equal(calls.length, 1);
});

test('gives a temporary (guest) session its route when the budget allows it', async () => {
  const { handle, calls } = mock({
    auth: () => Response.json({ id: accountId, is_anonymous: true }),
  });
  const response = await handle(routeRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(
    calls.map((call) => call.url.pathname),
    ['/auth/v1/user', '/rest/v1/rpc/rpc_maps_route_budget', '/directions/v2:computeRoutes'],
  );
});

test('asks a guest to sign in once their free plan is used, without a Google request', async () => {
  const { handle, calls } = mock({
    auth: () => Response.json({ id: accountId, is_anonymous: true }),
    budget: () => Response.json({ accountId, allowed: false, reason: 'sign_in_required' }),
  });
  const response = await handle(routeRequest());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'sign_in_required');
  assert.equal(calls.length, 2);
});

test('fails closed when the reservation is missing or bound to a different account', async () => {
  for (const quota of [{ allowed: true }, { allowed: true, accountId: 'foreign' }, { accountId }]) {
    const { handle, calls } = mock({ budget: () => Response.json(quota) });
    assert.equal((await handle(routeRequest())).status, 503);
    assert.equal(calls.length, 2);
  }
});

test('returns unauthenticated when the quota service rejects a verified bearer', async () => {
  const { handle, calls } = mock({
    budget: () => Response.json({ message: 'private upstream error' }, { status: 401 }),
  });
  const response = await handle(routeRequest());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    contractVersion: '1',
    code: 'unauthenticated',
    requestId: itinerary.requestId,
  });
  assert.equal(calls.length, 2);
});

test('sends retry-after on a quota denial without calling Google', async () => {
  const { handle, calls } = mock({
    budget: () => Response.json({ accountId, allowed: false, retryAfterSeconds: 47 }),
  });
  const response = await handle(routeRequest());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '47');
  assert.equal((await response.json()).code, 'rate_limited');
  assert.equal(calls.length, 2);
});

test('validates ordered stops, modes, IDs and payload limits before quota', async () => {
  const { handle, calls } = mock();
  const corrupt = [
    { ...itinerary, accountId },
    { ...itinerary, stops: [itinerary.stops[0], itinerary.stops[0]] },
    {
      ...itinerary,
      stops: Array.from({ length: 13 }, (_, index) => ({
        ...itinerary.stops[0],
        id: String(index),
      })),
    },
    { ...itinerary, stops: [itinerary.stops[0], { ...itinerary.stops[1], latitude: 91 }] },
    { ...itinerary, stops: [itinerary.stops[0], { ...itinerary.stops[1], longitude: null }] },
    { ...itinerary, stops: [itinerary.stops[0], { ...itinerary.stops[1], unexpected: 'data' }] },
    { ...itinerary, travelMode: 'BICYCLE' },
    { ...itinerary, requestId: '' },
    { ...itinerary, contextId: 'a\nb' },
    { ...itinerary, contextId: 'a'.repeat(121) },
  ];
  for (const body of corrupt) assert.equal((await handle(routeRequest(body))).status, 400);
  for (const body of ['{broken', ' '.repeat(MAX_REQUEST_BYTES + 1)]) {
    assert.equal((await handle(routeRequest(itinerary, { body }))).status, 400);
  }
  assert.equal(calls.length, 0);
});

test('keeps valid no-route responses distinct from a provider failure', async () => {
  for (const data of [{ routes: [] }, {}]) {
    const { handle } = mock({ google: () => Response.json(data) });
    const response = await handle(routeRequest());
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'no_route');
    assert.deepEqual(result.legs, []);
    assert.deepEqual(result.warnings, []);
  }
  const { handle } = mock({
    google: () => Response.json({ error: { message: 'provider-secret-error' } }, { status: 429 }),
  });
  const response = await handle(routeRequest());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    contractVersion: '1',
    code: 'unavailable',
    requestId: itinerary.requestId,
  });
});

test('uses the documented protobuf default only for an omitted distance', async () => {
  const { distanceMeters: _, ...zeroDistance } = leg;
  const { handle } = mock({
    google: () => Response.json({ routes: [{ legs: [zeroDistance, leg] }] }),
  });
  const result = await (await handle(routeRequest())).json();
  assert.equal(result.status, 'available');
  assert.equal(result.legs[0].distanceMeters, 0);
});

test('rejects partial routes, malformed leg geometry and excessive measurements or vertices', async () => {
  const excessivelyLongLeg = { ...leg, polyline: { encodedPolyline: '??'.repeat(5001) } };
  const variants = [
    [leg],
    [leg, { ...leg, distanceMeters: 2_000_001 }],
    [leg, { ...leg, duration: '172800.1s' }],
    [leg, { ...leg, distanceMeters: '4500' }],
    [leg, { ...leg, polyline: { encodedPolyline: '?' } }],
    [leg, { ...leg, polyline: { encodedPolyline: '??' } }],
    [excessivelyLongLeg, excessivelyLongLeg],
  ];
  for (const legs of variants) {
    const { handle } = mock({ google: () => Response.json({ routes: [{ legs }] }) });
    const response = await handle(routeRequest());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'unavailable');
  }
});

test('aborts paid upstream work on deadline and preserves the prior reservation', async () => {
  let aborted = false;
  const { handle, calls } = mock({
    timeoutMs: 100,
    google: (signal) =>
      new Promise((_, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(signal.reason);
          },
          { once: true },
        );
      }),
  });
  const keepAlive = setTimeout(() => {}, 1_000);
  try {
    const response = await handle(routeRequest());
    assert.equal(response.status, 503);
    assert.equal(calls.length, 3);
    assert.equal(aborted, true);
  } finally {
    clearTimeout(keepAlive);
  }
});

test('does not enter Google when the client cancels during quota reservation', async () => {
  const client = new AbortController();
  const { handle, calls } = mock({
    budget: () => {
      client.abort();
      return Response.json({ accountId, allowed: true });
    },
  });
  const response = await handle(routeRequest(itinerary, { signal: client.signal }));
  assert.equal(response.status, 503);
  assert.equal(calls.length, 2);
});
