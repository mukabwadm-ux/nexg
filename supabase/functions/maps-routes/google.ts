import {
  type Coordinate,
  isCoordinate,
  isObject,
  MAX_COORDINATES,
  MAX_DISTANCE_METERS,
  MAX_DURATION_SECONDS,
  readBoundedJson,
  type RouteLeg,
  type RouteRequest,
  type RouteResult,
} from './contract.ts';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const FIELD_MASK = [
  'routes.legs.distanceMeters',
  'routes.legs.duration',
  'routes.legs.polyline.encodedPolyline',
  'routes.warnings',
].join(',');
const MAX_GOOGLE_RESPONSE_BYTES = 524_288;
const MAX_WARNING_LENGTH = 500;
const MAX_WARNINGS = 8;
const WALK_CAUTION =
  'Walking routes may omit sidewalks or pedestrian paths. Check local conditions.';

function waypoint({ latitude, longitude }: Coordinate) {
  return { location: { latLng: { latitude, longitude } } };
}

function decodePolyline(encoded: unknown, coordinateLimit: number): Coordinate[] {
  if (typeof encoded !== 'string' || encoded.length > MAX_COORDINATES * 12) {
    throw new Error('Invalid polyline');
  }
  const polyline = encoded;
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates: Coordinate[] = [];

  function readDelta() {
    let value = 0;
    for (let place = 1; place <= 32 ** 5 && index < polyline.length; place *= 32) {
      const byte = polyline.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) break;
      value += (byte & 31) * place;
      if (byte < 32) return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
    }
    throw new Error('Invalid polyline delta');
  }

  while (index < polyline.length) {
    if (coordinates.length >= coordinateLimit) throw new Error('Polyline limit exceeded');
    latitude += readDelta();
    longitude += readDelta();
    const point = { latitude: latitude / 100_000, longitude: longitude / 100_000 };
    if (!isCoordinate(point)) throw new Error('Invalid polyline coordinate');
    coordinates.push(point);
  }
  if (coordinates.length < 2) throw new Error('Incomplete polyline');
  return coordinates;
}

function durationSeconds(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{1,6}(?:\.\d{1,9})?s$/.test(value)) {
    throw new Error('Invalid leg duration');
  }
  const seconds = Number(value.slice(0, -1));
  if (seconds > MAX_DURATION_SECONDS) throw new Error('Leg duration limit exceeded');
  return seconds;
}

function warningsFor(value: unknown, walking: boolean): string[] {
  // Keep room for the explicit WALK caution even if the provider returns many warnings.
  const warnings = walking ? [WALK_CAUTION] : [];
  if (!Array.isArray(value)) return warnings;
  for (const item of value) {
    if (warnings.length === MAX_WARNINGS) break;
    if (typeof item !== 'string') continue;
    const plain = item
      .replace(/<[^<>]*>/gu, '')
      .replace(/[<>\p{C}]/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
      .slice(0, MAX_WARNING_LENGTH)
      .replace(/[\uD800-\uDBFF]$/, '')
      .trimEnd();
    if (plain && !warnings.includes(plain)) warnings.push(plain);
  }
  return warnings;
}

export async function computeGoogleRoute(
  fetcher: typeof fetch,
  apiKey: string,
  input: RouteRequest,
  signal: AbortSignal,
): Promise<RouteResult> {
  const { stops, travelMode } = input;
  const response = await fetcher(ROUTES_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
      'x-goog-fieldmask': FIELD_MASK,
    },
    body: JSON.stringify({
      origin: waypoint(stops[0]),
      destination: waypoint(stops[stops.length - 1]),
      intermediates: stops.slice(1, -1).map(waypoint),
      travelMode,
      routingPreference: travelMode === 'DRIVE' ? 'TRAFFIC_AWARE' : undefined,
      computeAlternativeRoutes: false,
      optimizeWaypointOrder: false,
      polylineEncoding: 'ENCODED_POLYLINE',
      polylineQuality: 'OVERVIEW',
    }),
    redirect: 'error',
    signal,
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new Error('Route provider unavailable');
  }
  const data = await readBoundedJson(response, MAX_GOOGLE_RESPONSE_BYTES, signal);
  if (!isObject(data) || 'error' in data) throw new Error('Invalid route provider response');
  // An empty repeated field may be omitted from a successful protobuf JSON response.
  if (Object.keys(data).length === 0 || (Array.isArray(data.routes) && data.routes.length === 0)) {
    return { status: 'unavailable', reason: 'no_route', legs: [], warnings: [] };
  }
  if (!Array.isArray(data.routes) || data.routes.length !== 1 || !isObject(data.routes[0])) {
    throw new Error('Invalid route provider response');
  }
  const route = data.routes[0];
  if (!Array.isArray(route.legs) || route.legs.length !== stops.length - 1) {
    throw new Error('Route legs did not match stops');
  }

  let remainingCoordinates = MAX_COORDINATES;
  const legs: RouteLeg[] = route.legs.map((leg, index) => {
    if (!isObject(leg) || !isObject(leg.polyline)) throw new Error('Invalid route leg');
    // Google may omit the masked scalar field when it has its protobuf default of zero.
    const distanceMeters = 'distanceMeters' in leg ? leg.distanceMeters : 0;
    if (
      typeof distanceMeters !== 'number' ||
      !Number.isInteger(distanceMeters) ||
      distanceMeters < 0 ||
      distanceMeters > MAX_DISTANCE_METERS
    ) {
      throw new Error('Invalid route leg');
    }
    const coordinates = decodePolyline(leg.polyline.encodedPolyline, remainingCoordinates);
    remainingCoordinates -= coordinates.length;
    return {
      fromStopId: stops[index].id,
      toStopId: stops[index + 1].id,
      distanceMeters,
      durationSeconds: durationSeconds(leg.duration),
      coordinates,
    };
  });
  return {
    status: 'available',
    legs,
    warnings: warningsFor(route.warnings, travelMode === 'WALK'),
  };
}
