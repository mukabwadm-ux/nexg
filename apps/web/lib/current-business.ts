import { cookies } from 'next/headers';

import type { createClient } from './supabase/server';

/**
 * Which of a signed-in merchant's businesses the portal is working on.
 *
 * One sign-in may own several businesses (a `merchant_user` row each). The
 * choice lives in an httpOnly cookie holding a merchant id, and it is only a
 * preference: it is honoured when this user is an owner or manager of that
 * merchant, and otherwise ignored, so the database's own pick
 * (`fn_partner_home`) stands. Nothing reads the cookie except
 * `resolveCurrentBusiness`, which `requireMerchant` and the other merchant
 * identity readers go through.
 */
export const CURRENT_BUSINESS_COOKIE = 'nexg_business';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Roles that open the merchant workspace (requireMerchant refuses the rest). */
const WORKSPACE_ROLES = ['owner', 'manager'];

type Client = ReturnType<typeof createClient>;

/** The fields of `fn_partner_home`'s answer this module reads and rewrites. */
export interface HomeAnswer {
  kind: string;
  id?: string;
  name?: string | null;
  status?: string;
  pct?: number;
  submitted?: boolean;
  ready?: boolean;
  home: string;
}

export function isBusinessId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** The id in the cookie, if it looks like one. Not yet checked against anyone. */
export function chosenBusinessId(): string | null {
  try {
    const value = cookies().get(CURRENT_BUSINESS_COOKIE)?.value;
    return isBusinessId(value) ? value.toLowerCase() : null;
  } catch {
    // Outside a request (unit tests, build) there is no cookie to honour.
    return null;
  }
}

export function rememberBusiness(merchantId: string): void {
  cookies().set(CURRENT_BUSINESS_COOKIE, merchantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * The merchant home for the chosen business, or `home` unchanged.
 *
 * Only a merchant answer is rewritten (staff, riders and hosts keep theirs),
 * and only when the chosen merchant is one this user owns or manages. Any
 * read that fails leaves the database's pick in place rather than failing
 * the page.
 */
export async function resolveCurrentBusiness<T extends HomeAnswer>(
  client: Client,
  userId: string,
  home: T,
  chosen: string | null = chosenBusinessId(),
): Promise<T> {
  if (home.kind !== 'merchant' || !chosen || chosen === home.id?.toLowerCase()) return home;
  const [membership, merchant, readiness] = await Promise.all([
    client
      .from('merchant_user')
      .select('role')
      .eq('merchant_id', chosen)
      .eq('user_id', userId)
      .maybeSingle(),
    client
      .from('merchant')
      .select('id,trading_name,legal_name,status,submitted_at')
      .eq('id', chosen)
      .maybeSingle(),
    client.rpc('fn_merchant_readiness', { p_merchant_id: chosen }),
  ]);
  const role = (membership.data as { role?: string } | null)?.role;
  if (membership.error || !role || !WORKSPACE_ROLES.includes(role)) return home;
  if (merchant.error || !merchant.data) return home;
  const m = merchant.data as {
    id: string;
    trading_name: string | null;
    legal_name: string | null;
    status: string;
    submitted_at: string | null;
  };
  const pctValue = Number((readiness.data as { pct?: unknown } | null)?.pct ?? 0);
  const pct = Number.isFinite(pctValue) ? Math.round(pctValue) : 0;
  return {
    ...home,
    id: m.id,
    name: m.trading_name ?? m.legal_name,
    status: m.status,
    pct,
    submitted: m.submitted_at !== null,
    ready: m.submitted_at !== null || pct >= 80,
    home: '/merchant',
  };
}

export interface BusinessChoice {
  id: string;
  name: string;
  status: string;
  /** Live, In review, Draft, or the closed states. */
  label: string;
}

/** The plain word the switcher shows beside a business. */
export function businessLabel(status: string, submitted: boolean): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'paused':
      return 'Paused';
    case 'suspended':
      return 'Suspended';
    case 'delisted':
    case 'offboarded':
      return 'Closed';
    default:
      return submitted ? 'In review' : 'Draft';
  }
}

/**
 * Every business this user can open the workspace for, by name. A read
 * failure gives an empty list: the switcher then shows only Add business.
 */
export async function listBusinesses(client: Client, userId: string): Promise<BusinessChoice[]> {
  const { data, error } = await client
    .from('merchant_user')
    .select('role, merchant:merchant_id(id,trading_name,legal_name,status,submitted_at)')
    .eq('user_id', userId);
  if (error || !data) return [];
  const rows = data as unknown as Array<{
    role: string;
    merchant: {
      id: string;
      trading_name: string | null;
      legal_name: string | null;
      status: string;
      submitted_at: string | null;
    } | null;
  }>;
  return rows
    .filter((row) => row.merchant && WORKSPACE_ROLES.includes(row.role))
    .map((row) => {
      const m = row.merchant!;
      const name = (m.trading_name ?? m.legal_name ?? '').trim() || 'Unnamed business';
      return { id: m.id, name, status: m.status, label: businessLabel(m.status, !!m.submitted_at) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether this user may make `merchantId` their current business. */
export async function mayChooseBusiness(
  client: Client,
  userId: string,
  merchantId: string,
): Promise<boolean> {
  if (!isBusinessId(merchantId)) return false;
  const { data, error } = await client
    .from('merchant_user')
    .select('role')
    .eq('merchant_id', merchantId)
    .eq('user_id', userId)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  return !error && !!role && WORKSPACE_ROLES.includes(role);
}
