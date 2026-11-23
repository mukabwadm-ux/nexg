import 'server-only';

import { z } from 'zod';

import { deactivateSavedCard, paystackMode, paystackProof } from '@/lib/paystack';
import { customerApiClient } from '@/lib/supabase/customer-api';

/**
 * A customer's saved cards, for the phone apps:
 *
 *   GET    /api/customer/payment-methods/cards
 *          {cards: [{id, brand, lastFour, expiryMonth, expiryYear, bank?}], test?}
 *   DELETE /api/customer/payment-methods/cards/{cardId}
 *
 * Only brand, last four, expiry and bank ever leave the server. Only cards
 * saved in the current Paystack mode are listed, because only those can pay.
 * With no Paystack key the list is empty.
 */

const headers = { 'Cache-Control': 'private, no-store' };
const cardId = z.string().uuid();
const brands = ['visa', 'mastercard', 'amex', 'verve', 'other'] as const;

type Client = ReturnType<typeof customerApiClient>;
type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
const rpc = (client: Client, fn: string, args: Record<string, unknown> = {}) =>
  (client as unknown as { rpc: Rpc }).rpc(fn, args);

function problem(status: number, code: string, title: string) {
  return Response.json(
    { type: 'about:blank', title, status, code },
    { status, headers: { ...headers, 'Content-Type': 'application/problem+json' } },
  );
}
const signIn = () => problem(401, 'AUTH_REQUIRED', 'Sign in to see your saved cards.');
const unavailable = () =>
  problem(503, 'SERVICE_UNAVAILABLE', 'Saved cards are unavailable right now. Try again shortly.');

async function account(request: Request): Promise<Client | Response> {
  const token = /^Bearer ([\w.-]{1,4096})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return signIn();
  const supabase = customerApiClient(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error) return [400, 401, 403].includes(error.status ?? 0) ? signIn() : unavailable();
  /* Guests have no saved cards. */
  if (!user || user.is_anonymous) return signIn();
  return supabase;
}

interface CardRow {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  bank: string | null;
  is_test: boolean;
}

export async function listCards(request: Request) {
  try {
    const supabase = await account(request);
    if (supabase instanceof Response) return supabase;
    const mode = paystackMode();
    if (!mode) return Response.json({ cards: [] }, { headers });

    const result = await rpc(supabase, 'rpc_my_cards');
    if (result.error) return result.error.code === '42501' ? signIn() : unavailable();
    const rows = Array.isArray(result.data) ? (result.data as CardRow[]) : [];
    const cards = rows
      .filter((row) => row.is_test === (mode === 'test'))
      .filter((row) => brands.includes(row.brand as (typeof brands)[number]))
      .map((row) => ({
        id: row.id,
        brand: row.brand,
        lastFour: row.last4,
        expiryMonth: row.exp_month,
        expiryYear: row.exp_year,
        ...(row.bank ? { bank: row.bank } : {}),
      }));
    return Response.json({ cards, ...(mode === 'test' ? { test: true } : {}) }, { headers });
  } catch {
    return unavailable();
  }
}

export async function removeCard(request: Request, rawId: string) {
  try {
    const id = cardId.safeParse(rawId);
    if (!id.success) return problem(404, 'NOT_FOUND', 'That card is no longer saved.');
    const supabase = await account(request);
    if (supabase instanceof Response) return supabase;
    const mode = paystackMode();
    const proof = mode ? paystackProof(mode) : null;
    if (!mode || !proof) return unavailable();

    const result = await rpc(supabase, 'rpc_my_card_remove', {
      p_card_id: id.data,
      p_proof: proof,
    });
    if (result.error) {
      if (result.error.code === '42501') return signIn();
      if (result.error.code === '22023')
        return problem(404, 'NOT_FOUND', 'That card is no longer saved.');
      return unavailable();
    }
    const removed = result.data as { authorization_code?: string } | null;
    /* The card is already gone from NexG; switching it off at Paystack too is best effort. */
    if (removed?.authorization_code) await deactivateSavedCard(mode, removed.authorization_code);
    return new Response(null, { status: 204, headers });
  } catch {
    return unavailable();
  }
}
