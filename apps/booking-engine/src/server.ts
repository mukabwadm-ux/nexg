import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { authenticate, requireManager } from './auth.js';
import { createPayload } from './payload.js';
import { BookingEngine } from './engine.js';
import { addOccurrence } from './occurrences.js';
import { manageResource, manageOffering, createClosure } from './management.js';
import { BookingError, type Identity } from './types.js';

const MAX_BODY = 128 * 1024;
async function body(request: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY)
      throw new BookingError(413, 'This request is too large.', 'body_too_large');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new BookingError(400, 'Send a valid JSON object.', 'invalid_json');
  }
}
function respond(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}
const limits = new Map<string, { count: number; reset: number }>();
function rateLimit(identity: Identity) {
  const now = Date.now(),
    key = `${identity.businessId}:${identity.role}:${identity.userId}`;
  let value = limits.get(key);
  if (!value || value.reset < now) {
    value = { count: 0, reset: now + 60_000 };
    limits.set(key, value);
  }
  if (++value.count > 120)
    throw new BookingError(429, 'Too many requests. Please wait a moment.', 'rate_limited');
  if (limits.size > 10000) for (const [k, v] of limits) if (v.reset < now) limits.delete(k);
}

export function createBookingServer(engine: BookingEngine, secret: string) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://booking.local');
      if (url.pathname === '/health' && req.method === 'GET') {
        respond(res, 200, {
          ready: true,
          engine: 'Payload Reserve',
          timezone: 'Africa/Nairobi',
          googleRequired: false,
        });
        return;
      }
      const identity = authenticate(req.headers, secret);
      rateLimit(identity);
      const key =
        typeof req.headers['idempotency-key'] === 'string'
          ? req.headers['idempotency-key']
          : undefined;
      const token =
        typeof req.headers['x-booking-customer-token'] === 'string'
          ? req.headers['x-booking-customer-token']
          : undefined;
      const path = url.pathname;
      const availabilityOptions = {
        resourceIds: url.searchParams.get('resourceId')
          ? [url.searchParams.get('resourceId')!]
          : url.searchParams.get('resourceIds')?.split(',').filter(Boolean),
        quantity: url.searchParams.has('quantity')
          ? Number(url.searchParams.get('quantity'))
          : undefined,
        startTime: url.searchParams.get('startTime') ?? undefined,
        endTime: url.searchParams.get('endTime') ?? undefined,
      };
      if (path.startsWith('/v1/public/')) {
        const match = path.match(
          /^\/v1\/public\/([^/]+)\/(catalog|availability|quote|bookings)(?:\/([^/]+))?(?:\/(cancel|reschedule|quote|workflow))?$/,
        );
        if (
          !match ||
          decodeURIComponent(match[1]!) !== identity.businessId ||
          identity.role !== 'customer'
        )
          throw new BookingError(404, 'This booking page was not found.', 'not_found');
        const [, , route, id, action] = match;
        if (route === 'catalog' && req.method === 'GET')
          return respond(res, 200, await engine.publicCatalog(identity));
        if (route === 'quote' && req.method === 'POST')
          return respond(res, 200, await engine.quote(identity, await body(req), true));
        if (route === 'availability' && req.method === 'GET')
          return respond(
            res,
            200,
            await engine.availability(
              identity,
              url.searchParams.get('offeringId') ?? '',
              url.searchParams.get('date') ?? '',
              true,
              availabilityOptions,
            ),
          );
        if (route === 'bookings' && !id && req.method === 'POST')
          return respond(
            res,
            201,
            await engine.createBooking(identity, await body(req), key, true),
          );
        if (route === 'bookings' && id && !action && req.method === 'GET')
          return respond(res, 200, await engine.customerBooking(identity, id, token));
        if (route === 'bookings' && id && action === 'quote' && req.method === 'POST')
          return respond(res, 200, await engine.quoteBooking(identity, id, await body(req), token));
        if (route === 'bookings' && id && action && req.method === 'POST')
          return respond(
            res,
            200,
            await engine.changeBooking(identity, id, action, await body(req), key, token),
          );
        throw new BookingError(405, 'This action is not supported.', 'method_not_allowed');
      }
      requireManager(identity);
      if (path === '/v1/quote' && req.method === 'POST')
        return respond(res, 200, await engine.quote(identity, await body(req)));
      if (path === '/v1/bootstrap' && req.method === 'POST')
        return respond(res, 200, await engine.bootstrap(identity, await body(req)));
      if (path === '/v1/profiles' && req.method === 'GET')
        return respond(res, 200, await engine.profiles());
      if (path === '/v1/questions' && req.method === 'GET')
        return respond(
          res,
          200,
          await engine.questions(
            identity,
            url.searchParams.get('subcategoryId') ?? '',
            url.searchParams.get('offeringModel') ?? undefined,
          ),
        );
      if (path === '/v1/workspace' && req.method === 'GET')
        return respond(res, 200, await engine.workspace(identity));
      if (path === '/v1/configuration' && req.method === 'PUT')
        return respond(res, 200, await engine.configure(identity, await body(req), key));
      const occurrence = path.match(/^\/v1\/offerings\/([^/]+)\/occurrences$/);
      if (occurrence && req.method === 'POST')
        return respond(
          res,
          201,
          await addOccurrence(engine, identity, occurrence[1]!, await body(req), key),
        );
      const resourceEdit = path.match(/^\/v1\/resources\/([^/]+)$/),
        offeringEdit = path.match(/^\/v1\/offerings\/([^/]+)$/),
        closure = path.match(/^\/v1\/resources\/([^/]+)\/closures$/);
      if (resourceEdit && ['PUT', 'PATCH'].includes(req.method ?? ''))
        return respond(
          res,
          200,
          await manageResource(engine, identity, resourceEdit[1]!, await body(req), key),
        );
      if (offeringEdit && ['PUT', 'PATCH'].includes(req.method ?? ''))
        return respond(
          res,
          200,
          await manageOffering(engine, identity, offeringEdit[1]!, await body(req), key),
        );
      if (closure && req.method === 'POST')
        return respond(
          res,
          201,
          await createClosure(engine, identity, closure[1]!, await body(req), key),
        );
      if (path === '/v1/resources' && req.method === 'POST')
        return respond(res, 201, await engine.addResource(identity, await body(req), key));
      if (path === '/v1/offerings' && req.method === 'POST')
        return respond(res, 201, await engine.addOffering(identity, await body(req), key));
      if (path === '/v1/availability' && req.method === 'GET')
        return respond(
          res,
          200,
          await engine.availability(
            identity,
            url.searchParams.get('offeringId') ?? '',
            url.searchParams.get('date') ?? '',
            false,
            availabilityOptions,
          ),
        );
      if (path === '/v1/bookings' && req.method === 'POST')
        return respond(res, 201, await engine.createBooking(identity, await body(req), key));
      const mutation = path.match(
        /^\/v1\/bookings\/([^/]+)\/(confirm|accept|start|check_out|check_in|return|release|record_payment|record_refund|cancel|complete|reschedule|quote|workflow)$/,
      );
      if (mutation && mutation[2] === 'quote' && req.method === 'POST')
        return respond(
          res,
          200,
          await engine.quoteBooking(identity, mutation[1]!, await body(req)),
        );
      if (mutation && req.method === 'POST')
        return respond(
          res,
          200,
          await engine.changeBooking(identity, mutation[1]!, mutation[2]!, await body(req), key),
        );
      throw new BookingError(404, 'This action was not found.', 'not_found');
    } catch (error) {
      const known = error instanceof BookingError;
      const status = known ? error.status : ((error as any)?.status ?? 400);
      const detail = known
        ? error.message
        : (error as any)?.name === 'ValidationError'
          ? 'The requested time or details could not be accepted. Refresh availability and check the offering requirements.'
          : 'The booking could not be completed. No confirmed result is implied; retry with the same operation key.';
      if (!known) console.error('[booking-command]', error);
      respond(res, Number.isInteger(status) && status >= 400 && status < 600 ? status : 500, {
        type: `urn:nexg:booking:${known ? error.code : 'command_failed'}`,
        title: known ? error.code.replaceAll('_', ' ') : 'Booking command failed',
        status,
        detail,
      });
    }
  });
}

async function main() {
  const secret = process.env.BOOKING_BRIDGE_SECRET;
  if (!secret)
    throw new Error(
      'BOOKING_BRIDGE_SECRET is required. Configure the same private secret in the portal and booking runtime.',
    );
  const payload = await createPayload();
  const engine = new BookingEngine(payload, !process.env.BOOKING_DATABASE_URL);
  const server = createBookingServer(engine, secret);
  const port = Number(process.env.BOOKING_PORT ?? 3003),
    host = process.env.BOOKING_HOST ?? '127.0.0.1';
  server.listen(port, host, () =>
    console.log(
      `NEXG booking runtime listening at http://${host}:${port}; Google Calendar is optional.`,
    ),
  );
  const shutdown = () => {
    server.close(async () => {
      await payload.destroy();
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
