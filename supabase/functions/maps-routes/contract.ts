export const MAX_STOPS = 12;
export const MAX_COORDINATES = 10_000;
export const MAX_DISTANCE_METERS = 2_000_000;
export const MAX_DURATION_SECONDS = 172_800;
export const MAX_ID_LENGTH = 120;
export const MAX_REQUEST_BYTES = 24_576;
export const ROUTE_WINDOW_MS = 300_000;

export type TravelMode = 'DRIVE' | 'WALK';
export type Coordinate = { latitude: number; longitude: number };
export type RouteStop = Coordinate & { id: string };
export type RouteRequest = {
  contractVersion: '1';
  requestId: string;
  contextId: string;
  travelMode: TravelMode;
  stops: RouteStop[];
};
export type RouteLeg = {
  fromStopId: string;
  toStopId: string;
  distanceMeters: number;
  durationSeconds: number;
  coordinates: Coordinate[];
};
export type RouteResult =
  | { status: 'available'; legs: RouteLeg[]; warnings: string[] }
  | { status: 'unavailable'; reason: 'no_route'; legs: []; warnings: [] };

const controlCharacters = /[\p{C}]/u;

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value &&
    !controlCharacters.test(value)
  );
}

export function isCoordinate(value: unknown): value is Coordinate {
  return (
    isObject(value) &&
    typeof value.latitude === 'number' &&
    Number.isFinite(value.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === 'number' &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180
  );
}

function isStop(value: unknown): value is RouteStop {
  return (
    isObject(value) && Object.keys(value).length === 3 && isId(value.id) && isCoordinate(value)
  );
}

export function parseRouteRequest(value: unknown): RouteRequest | null {
  if (
    !isObject(value) ||
    Object.keys(value).length !== 5 ||
    value.contractVersion !== '1' ||
    !isId(value.requestId) ||
    !isId(value.contextId) ||
    (value.travelMode !== 'DRIVE' && value.travelMode !== 'WALK') ||
    !Array.isArray(value.stops) ||
    value.stops.length < 2 ||
    value.stops.length > MAX_STOPS ||
    !value.stops.every(isStop) ||
    new Set(value.stops.map((stop) => stop.id)).size !== value.stops.length
  ) {
    return null;
  }
  return {
    contractVersion: '1',
    requestId: value.requestId,
    contextId: value.contextId,
    travelMode: value.travelMode,
    stops: value.stops,
  };
}

export async function readBoundedJson(
  source: Request | Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<unknown> {
  const length = source.headers.get('content-length');
  if ((length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) || !source.body) {
    throw new Error('Invalid body length');
  }
  signal.throwIfAborted();
  const reader = source.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  function cancelRead() {
    void reader.cancel().catch(() => {});
  }
  signal.addEventListener('abort', cancelRead, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Body limit exceeded');
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    cancelRead();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancelRead);
    reader.releaseLock();
  }
}
