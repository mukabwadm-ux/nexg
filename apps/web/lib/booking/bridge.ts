import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface BookingIdentity {
  businessId: string;
  userId: string;
  role: 'owner' | 'manager' | 'customer';
  branches?: string[] | null;
  businessName?: string;
  subcategoryId?: string;
  answers?: Record<string, unknown>;
  businessStatus?: string;
}

export const MAX_BOOKING_BODY_BYTES = 64 * 1024;

/** Anonymous actors have separate signed sessions; booking tokens still control records. */
export function bookingCustomerSession(
  cookieHeader: string | null,
  secret: string,
  now = Date.now(),
) {
  if (secret.length < 32)
    throw new Error('BOOKING_BRIDGE_SECRET must have at least 32 characters.');
  const name = 'nexg_booking_session';
  const raw = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  const sign = (value: string) =>
    createHmac('sha256', secret).update(`customer-session:${value}`).digest('base64url');
  if (raw && /^[A-Za-z0-9_-]{43}\.\d{13}\.[A-Za-z0-9_-]{43}$/.test(raw)) {
    const [id, expiry, signature] = raw.split('.') as [string, string, string];
    const expected = sign(`${id}.${expiry}`);
    if (
      Number(expiry) > now &&
      Number(expiry) <= now + 31 * 86400_000 &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      return { userId: `guest_${id}`, cookieValue: raw, created: false };
  }
  const id = randomBytes(32).toString('base64url'),
    expiry = now + 30 * 86400_000;
  const value = `${id}.${expiry}`;
  return { userId: `guest_${id}`, cookieValue: `${value}.${sign(value)}`, created: true };
}

export function bookingHeaders(identity: BookingIdentity, secret: string, now = Date.now()) {
  if (secret.length < 32)
    throw new Error('BOOKING_BRIDGE_SECRET must have at least 32 characters.');
  const { answers: _onboardingAnswers, ...claims } = identity;
  const context = Buffer.from(JSON.stringify({ ...claims, expiresAt: now + 60_000 })).toString(
    'base64url',
  );
  return {
    'x-nexg-booking-context': context,
    'x-nexg-booking-signature': createHmac('sha256', secret).update(context).digest('hex'),
  };
}

const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const COMMANDS = new Set([
  'quote',
  'workflow',
  'confirm',
  'cancel',
  'complete',
  'reschedule',
  'accept',
  'start',
  'check-in',
  'check_in',
  'check_out',
  'return',
  'release',
  'record_payment',
  'record_refund',
  'approve',
  'decline',
]);

export function allowedBookingPath(
  parts: string[],
  method: string,
  audience: 'merchant' | 'customer',
) {
  if (parts.some((part) => !ID.test(part))) return false;
  const [section, id, action] = parts;
  if (parts.length === 1) {
    if (method === 'GET')
      return (
        audience === 'merchant'
          ? ['workspace', 'profiles', 'questions', 'availability', 'catalog']
          : ['catalog', 'availability']
      ).includes(section ?? '');
    if (audience === 'merchant' && method === 'PUT') return section === 'configuration';
    if (method === 'POST')
      return audience === 'merchant'
        ? ['resources', 'offerings', 'bookings', 'quote'].includes(section ?? '')
        : ['bookings', 'quote'].includes(section ?? '');
  }
  if (section === 'bookings' && id && parts.length === 2 && method === 'GET') return true;
  if (section === 'bookings' && id && action && parts.length === 3 && method === 'POST') {
    return audience === 'customer'
      ? ['cancel', 'reschedule', 'quote', 'workflow'].includes(action)
      : COMMANDS.has(action);
  }
  if (
    audience === 'merchant' &&
    ['resources', 'offerings'].includes(section ?? '') &&
    id &&
    parts.length === 2
  )
    return ['PUT', 'PATCH', 'DELETE'].includes(method);
  if (
    audience === 'merchant' &&
    section === 'resources' &&
    id &&
    action === 'closures' &&
    parts.length === 3
  )
    return method === 'POST';
  if (
    audience === 'merchant' &&
    section === 'offerings' &&
    id &&
    action === 'occurrences' &&
    parts.length === 3
  )
    return method === 'POST';
  return false;
}

export function sameOriginMutation(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const supplied = new URL(origin),
      internal = new URL(request.url);
    const host = request.headers.get('host') ?? internal.host;
    const forwardedProtocol = request.headers.get('x-forwarded-proto');
    const protocol =
      forwardedProtocol === 'https' || forwardedProtocol === 'http'
        ? `${forwardedProtocol}:`
        : internal.protocol;
    // Next may reconstruct the internal URL with localhost while the browser
    // used the actual Host header. Keep the browser's host and protocol exact.
    return (
      supplied.origin === origin &&
      supplied.host === host.toLowerCase() &&
      supplied.protocol === protocol
    );
  } catch {
    return false;
  }
}

export function localBookingSandboxEnabled(
  hostname: string,
  env: Record<string, string | undefined>,
) {
  return (
    env.NODE_ENV === 'development' &&
    env.NEXG_BOOKING_SANDBOX === '1' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
  );
}

export function problem(status: number, detail: string, code = 'booking_unavailable') {
  return Response.json(
    {
      type: `urn:nexg:booking:${code}`,
      title:
        status === 401
          ? 'Sign in required'
          : status === 403
            ? 'Access denied'
            : status === 404
              ? 'Not found'
              : 'Booking request could not be completed',
      status,
      detail,
    },
    {
      status,
      headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' },
    },
  );
}

/** Trusted initial import uses a body, not an oversized identity header. */
export async function bootstrapMerchantBooking(identity: BookingIdentity) {
  if (!identity.answers && !identity.subcategoryId) return;
  const secret = process.env.BOOKING_BRIDGE_SECRET;
  const service = process.env.BOOKING_ENGINE_URL;
  if (!secret || secret.length < 32 || !service) return;
  const target = new URL('/v1/bootstrap', service);
  const response = await fetch(target, {
    method: 'POST',
    headers: { ...bookingHeaders(identity, secret), 'content-type': 'application/json' },
    body: JSON.stringify({
      businessName: identity.businessName,
      subcategoryId: identity.subcategoryId,
      answers: identity.answers ?? {},
      businessStatus: identity.businessStatus,
    }),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error('The existing onboarding details could not be loaded into booking setup.');
}

export async function forwardBookingRequest(
  request: Request,
  parts: string[],
  identity: BookingIdentity,
  audience: 'merchant' | 'customer',
) {
  if (!allowedBookingPath(parts, request.method, audience))
    return problem(404, 'This booking action is not available.', 'not_found');
  if (!sameOriginMutation(request))
    return problem(403, 'Open this action from your NEXG portal.', 'origin_mismatch');
  const secret = process.env.BOOKING_BRIDGE_SECRET;
  if (!secret || secret.length < 32)
    return problem(
      503,
      'The booking connection has not been configured.',
      'connection_setup_required',
    );
  const configured = process.env.BOOKING_ENGINE_URL;
  if (!configured)
    return problem(503, 'The booking service is not configured.', 'connection_setup_required');
  const base = new URL(configured);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
    return problem(503, 'The booking connection is invalid.');
  const source = new URL(request.url);
  const remotePath =
    audience === 'customer'
      ? `/v1/public/${encodeURIComponent(identity.businessId)}/${parts.join('/')}`
      : `/v1/${parts.join('/')}`;
  const target = new URL(remotePath, base);
  for (const key of [
    'offeringId',
    'date',
    'quantity',
    'startTime',
    'endTime',
    'resourceId',
    'resourceIds',
    'subcategoryId',
    'offeringModel',
    'from',
    'to',
  ]) {
    const value = source.searchParams.get(key);
    if (value && value.length <= 256) target.searchParams.set(key, value);
  }
  const headers = new Headers({ ...bookingHeaders(identity, secret), accept: 'application/json' });
  for (const key of ['idempotency-key', 'x-booking-customer-token', 'if-match']) {
    const value = request.headers.get(key);
    if (value && value.length <= 512) headers.set(key, value);
  }
  let body: string | undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > MAX_BOOKING_BODY_BYTES)
      return problem(413, 'The booking request is too large.', 'body_too_large');
    if (!(request.headers.get('content-type') ?? '').startsWith('application/json'))
      return problem(415, 'Send booking details as JSON.', 'invalid_content_type');
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      let next = await reader.read();
      while (!next.done) {
        bytes += next.value.byteLength;
        if (bytes > MAX_BOOKING_BODY_BYTES) {
          await reader.cancel();
          return problem(413, 'The booking request is too large.', 'body_too_large');
        }
        chunks.push(next.value);
        next = await reader.read();
      }
    }
    body = Buffer.concat(chunks).toString('utf8');
    try {
      JSON.parse(body || '{}');
    } catch {
      return problem(400, 'The booking details are not valid JSON.', 'invalid_json');
    }
    headers.set('content-type', 'application/json');
  }
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('json'))
      return problem(502, 'The booking service returned an unexpected response.');
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        'content-type': type,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return problem(
      503,
      'The booking service is unavailable. Your request has not been confirmed. Keep its reference before retrying.',
      'service_unavailable',
    );
  }
}
