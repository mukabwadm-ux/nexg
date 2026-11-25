import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import { customerApiClient } from '@/lib/supabase/customer-api';

import { connectorRegistry } from './registry';
import { cinemaServerDb } from './server-db';
import {
  CinemaProblem,
  cancelBooking,
  liveSeatMap,
  myHold,
  myHolds,
  placeHold,
  preparePayment,
  releaseHold,
  runWorker,
  type Rpc,
} from './service';

/*
 * The cinema endpoints (cinema-app-contract-2026-11-23.md, steps 2 to 8) and
 * the worker the database's cron calls. Errors are problem+json with a code,
 * and the title is the message to show.
 */

const headers = { 'Cache-Control': 'private, no-store' };
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const seat = z.string().regex(/^[A-Z]{1,2}\d{1,3}$/);
const holdInput = z
  .object({
    showingId: uuid,
    seats: z.array(seat).min(1).max(10),
    expectedTotalMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    requestId: uuid,
  })
  .strict();

function problem(status: number, code: string, title: string, extra: Record<string, unknown> = {}) {
  return Response.json(
    { type: 'about:blank', title, status, code, ...extra },
    { status, headers: { ...headers, 'Content-Type': 'application/problem+json' } },
  );
}

const signIn = () =>
  problem(401, 'AUTH_REQUIRED', 'Sign in, or continue as a guest, to book seats.');
const unavailable = () =>
  problem(503, 'SERVICE_UNAVAILABLE', 'Cinema checkout is unavailable. Try again shortly.');
const notFound = () => problem(404, 'NOT_FOUND', 'Seat hold not found.');

function asRpc(client: ReturnType<typeof customerApiClient>): Rpc {
  return async (fn, args = {}) => {
    const { data, error } = await client.rpc(fn as never, args as never);
    return {
      data,
      error: error ? { message: error.message, code: error.code, hint: error.hint } : null,
    };
  };
}

interface Caller {
  userId: string;
  user: Rpc;
  db: Rpc;
}

/* A read that only needs the customer's own token gets no server client. */
const noServer: Rpc = async () => {
  throw new Error('This endpoint does not use the server client.');
};

async function caller(request: Request, server = true): Promise<Caller | Response> {
  const token = /^Bearer ([\w.-]{1,4096})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return signIn();
  const db = server ? cinemaServerDb() : noServer;
  if (!db) return unavailable();
  const client = customerApiClient(token);
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);
  if (error) return [400, 401, 403].includes(error.status ?? 0) ? signIn() : unavailable();
  if (!user) return signIn();
  return { userId: user.id, user: asRpc(client), db };
}

async function handle(
  request: Request,
  work: (who: Caller) => Promise<unknown>,
  status = 200,
  server = true,
) {
  try {
    const who = await caller(request, server);
    if (who instanceof Response) return who;
    const body = await work(who);
    if (body === undefined) return new Response(null, { status: 204, headers });
    return Response.json(body, { status, headers });
  } catch (error) {
    if (error instanceof CinemaProblem)
      return problem(error.status, error.code, error.message, error.extra);
    return unavailable();
  }
}

function parseId(raw: string) {
  const id = uuid.safeParse(raw);
  return id.success ? id.data : null;
}

/* GET /api/customer/cinema/showings/{showingId}/seats */
export function seatsGet(request: Request, showingId: string) {
  const id = parseId(showingId);
  if (!id)
    return Promise.resolve(problem(410, 'SHOWING_CLOSED', 'This showing is no longer on sale.'));
  return handle(request, ({ user, db }) => liveSeatMap(user, db, connectorRegistry(db), id));
}

const pageQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    before: z.string().datetime({ offset: true }).optional(),
    beforeId: uuid.optional(),
  })
  .strict()
  .refine((q) => (q.before === undefined) === (q.beforeId === undefined));

/* GET /api/customer/cinema/holds: the customer's own holds and bookings,
   newest first, paged by ?before=…&beforeId=… from the answer's `next`. */
export function holdsGet(request: Request) {
  const query = pageQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success)
    return Promise.resolve(
      problem(422, 'INVALID_REQUEST', 'That page of your tickets could not be read.'),
    );
  return handle(request, ({ user }) => myHolds(user, query.data), 200, false);
}

/* POST /api/customer/cinema/holds */
export async function holdsPost(request: Request) {
  const body = holdInput.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return problem(422, 'INVALID_REQUEST', 'Choose one to ten seats from the seat map.');
  return handle(
    request,
    ({ userId, user, db }) => placeHold(user, db, connectorRegistry(db), { userId, ...body.data }),
    201,
  );
}

/* GET /api/customer/cinema/holds/{holdId} */
export function holdGet(request: Request, raw: string) {
  const id = parseId(raw);
  if (!id) return Promise.resolve(notFound());
  return handle(request, ({ user }) => myHold(user, id));
}

/* DELETE /api/customer/cinema/holds/{holdId} */
export function holdDelete(request: Request, raw: string) {
  const id = parseId(raw);
  if (!id) return Promise.resolve(notFound());
  return handle(request, async ({ user, db }) => {
    await releaseHold(user, db, connectorRegistry(db), id);
    return undefined;
  });
}

/* POST /api/customer/cinema/holds/{holdId}/pay */
export function holdPay(request: Request, raw: string) {
  const id = parseId(raw);
  if (!id) return Promise.resolve(notFound());
  return handle(request, ({ user, db }) => preparePayment(user, db, connectorRegistry(db), id));
}

/* POST /api/customer/cinema/holds/{holdId}/cancel: 200 once the cinema has
   cancelled, 202 while it has not answered (NexG keeps asking). */
export async function holdCancel(request: Request, raw: string) {
  const id = parseId(raw);
  if (!id) return notFound();
  try {
    const who = await caller(request);
    if (who instanceof Response) return who;
    const { status, body } = await cancelBooking(who.user, who.db, connectorRegistry(who.db), id);
    return Response.json(body, { status, headers });
  } catch (error) {
    if (error instanceof CinemaProblem)
      return problem(error.status, error.code, error.message, error.extra);
    return unavailable();
  }
}

function same(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The database's cron (x-cinema-worker-secret), or Vercel's (CRON_SECRET). */
export function workerAuthorised(request: Request) {
  const secret = process.env.CINEMA_WORKER_SECRET;
  const cron = process.env.CRON_SECRET;
  const given = request.headers.get('x-cinema-worker-secret');
  if (secret && secret.length >= 16 && given && same(given, secret)) return true;
  const bearer = request.headers.get('authorization');
  return Boolean(cron && cron.length >= 16 && bearer && same(bearer, `Bearer ${cron}`));
}

/* POST /api/internal/cinema/worker */
export async function workerPost(request: Request) {
  const db = cinemaServerDb();
  if (!db || (!process.env.CINEMA_WORKER_SECRET && !process.env.CRON_SECRET))
    return Response.json({ error: 'not_configured' }, { status: 503, headers });
  if (!workerAuthorised(request))
    return Response.json({ error: 'forbidden' }, { status: 403, headers });
  try {
    return Response.json(await runWorker(db, connectorRegistry(db)), { headers });
  } catch {
    return Response.json({ error: 'queue_unavailable' }, { status: 503, headers });
  }
}
