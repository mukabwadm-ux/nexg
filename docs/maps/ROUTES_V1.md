# Customer routes v1

The signed-in app calls `POST /functions/v1/maps-routes` when a customer requests a route through a plan's ordered stops. The Edge Function verifies the bearer token with Supabase Auth, reserves the account's route budget and calls Google Routes v2. The function sends the request coordinates to Google for computation.

## Request

Send the current Supabase user bearer in `Authorization` and the project's public Supabase key in `apikey`. Use `Content-Type: application/json`.

```ts
type RouteRequestV1 = {
  contractVersion: "1";
  requestId: string;
  contextId: string;
  travelMode: "DRIVE" | "WALK";
  stops: { id: string; latitude: number; longitude: number }[];
};
```

Provide two to twelve stops with distinct IDs. IDs are opaque printable strings of 1–120 UTF-16 code units without surrounding whitespace. Coordinates must be finite, within latitude ±90° and longitude ±180°. A context groups requests for the same planning view under one account's budget. The account comes from the verified bearer. The request allows only the fields shown and is capped at 24,576 bytes.

## Response

Availability and a valid no-route result use HTTP 200. Both include the verified account ID, echoed request ID, requested mode, computation time and expiration time. Every response from the function uses `Cache-Control: no-store`.

```ts
type RouteLegV1 = {
  fromStopId: string;
  toStopId: string;
  distanceMeters: number;
  durationSeconds: number;
  coordinates: { latitude: number; longitude: number }[];
};

type RouteResponseV1 = {
  contractVersion: "1";
  requestId: string;
  accountId: string;
  provider: "google-routes";
  travelMode: "DRIVE" | "WALK";
  computedAt: string;
  expiresAt: string;
} & (
  | { status: "available"; legs: RouteLegV1[]; warnings: string[] }
  | { status: "unavailable"; reason: "no_route"; legs: []; warnings: [] }
);
```

An available result has one leg per adjacent stop pair in the submitted order. Google supplies distance, duration and encoded geometry. The function converts duration to seconds and decodes at least two points per leg, up to 10,000 points across the response. A leg is capped at 2,000,000 meters and 172,800 seconds. The consumer uses the geometry in the current view for five minutes from `computedAt`. DRIVE requests traffic-aware duration at computation time. WALK responses include a pedestrian-path caution and displayable Google warnings. Warnings are plain text with at most eight entries of 500 characters each. [Google Routes v2](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes), [response field masks](https://developers.google.com/maps/documentation/routes/choose_fields)

Function errors contain `contractVersion: "1"`, a top-level `code` and the `requestId` when the body has been validated.

| HTTP | Code | Condition |
| --- | --- | --- |
| 400 | `invalid_request` | Invalid JSON, input shape or size |
| 401 | `unauthenticated` | Missing or rejected signed-in user bearer |
| 403 | `forbidden` | Anonymous Auth user or denied account |
| 405 | `method_not_allowed` | Method other than POST, with `Allow: POST` |
| 429 | `rate_limited` | Account budget exhausted, with `Retry-After` seconds |
| 503 | `unavailable` | Disabled or missing configuration, dependency failure, timeout or invalid upstream response |

The function limits request processing to 12 seconds and the Google response to 512 KiB. Infrastructure failures use the same public code without carrying upstream messages into the app.

## Account budget

`rpc_maps_route_budget(text)` uses `auth.uid()` and the Maps real-account check. The RPC locks one private counter row per account and consumes all three allowances in one transaction. The limits are 10 per UTC minute, 60 per UTC day and 20 per context per UTC day. A successful reservation consumes the budget before Google is called, including if that attempt later aborts or fails. A denial returns the time until the blocking bucket resets.

The row stores the active bucket times, counts and account-scoped context hashes. A new UTC day replaces the previous context counts on the next reservation. Account deletion removes the row. The RPC has a wiring-audit exemption for rate counters so there is no retained per-request audit trail. Coordinates, route responses and raw context IDs are absent from storage.

## Deployment

1. Apply `20261220000100_maps_route_budget.sql` before deploying the Edge Function. It installs the Maps real-account helper and the private quota counters.
2. Supply `GOOGLE_ROUTES_API_KEY` in the Edge environment as a server key restricted to the Routes API. Configure provider quotas for the project. The app's public maps key serves the renderer. Edge uses `SUPABASE_URL` and the runtime's default `SUPABASE_PUBLISHABLE_KEYS` entry or the legacy public `SUPABASE_ANON_KEY` to call Auth and PostgREST in the user's session. [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
3. Deploy with the function-specific `verify_jwt = false` setting in `supabase/config.toml` so the handler owns authentication and can return the versioned failure response. The handler verifies the bearer with Supabase Auth and sends it to PostgREST for the budget call. [Supabase authorization headers](https://supabase.com/docs/guides/functions/auth-headers)
4. Keep Google Maps attribution visible and verify the public Terms of Use and Privacy Policy for the Routes integration before enabling it. When Google results appear outside an attribution-visible Google map, include Google Maps attribution with those results. [Google Routes policies](https://developers.google.com/maps/documentation/routes/policies)
5. Set `MAPS_ROUTES_ENABLED=true` when the configured deployment is ready for acceptance. Removing or disabling the flag makes route requests return HTTP 503.

## Verification

Run the injected handler and provider tests with Node 24 using `node --test supabase/functions/maps-routes/handler.test.ts`. The pgTAP file `supabase/tests/75_maps_route_budget.sql` covers SQL grants, identity, quota windows and counters. Run it in the repository's isolated migrated database during database verification. Hosted auth, provider billing, the SQL migration and device acceptance need their runtime checks.
