import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

import { createClient } from './supabase/server';
import {
  loadMerchantWorkspaceAccess,
  MerchantAccessError,
  type MerchantWorkspaceAccess,
} from './merchant-access';
import { perRequest } from './per-request';
import { resolveCurrentBusiness } from './current-business';
import { PORTALS } from '@/lib/auth-portals';

export interface PartnerHome {
  kind: 'merchant' | 'rider' | 'host' | 'guest' | 'staff' | 'anonymous';
  id?: string;
  name?: string | null;
  status?: string;
  pct?: number;
  submitted?: boolean;
  ready?: boolean;
  home: string;
}

/**
 * Who is signed in, and whether this page is theirs.
 *
 * The answer comes from `fn_partner_home` rather than being worked
 * out here, so the sign-in redirect, the merchant pages and the
 * rider pages cannot disagree — the way they would the first time
 * somebody changed the threshold in one place.
 *
 * Note what this does *not* do: it does not decide what the person
 * may read or change. Every query below it is still filtered by the
 * row policies, so a merchant who reached a rider page by typing
 * the URL would see nothing even if this check were wrong.
 */
export async function partnerHome(): Promise<PartnerHome> {
  return (await signedIn()).home;
}

/*
 * The user and their partner home, asked once per request. The portal
 * layout and its page both need them, and requireMerchant used to ask
 * Supabase for the user a second time straight after partnerHome had.
 */
const signedIn = perRequest(async (): Promise<{ user: User | null; home: PartnerHome }> => {
  const client = createClient();
  /*
   * Together, not one after the other: fn_partner_home reads the user from
   * the session token itself, and its answer is used only once getUser has
   * confirmed that user with Supabase.
   */
  const [auth, { data, error }] = await Promise.all([
    client.auth.getUser(),
    client.rpc('fn_partner_home'),
  ]);
  if (auth.error || !auth.data.user)
    return { user: null, home: { kind: 'anonymous', home: '/sign-in' } };
  if (error) throw new Error('Your account could not be loaded. Please retry.');
  const home = (data as unknown as PartnerHome) ?? { kind: 'anonymous', home: '/sign-in' };
  // An owner of several businesses works on the one they chose last.
  return {
    user: auth.data.user,
    home: await resolveCurrentBusiness(client, auth.data.user.id, home),
  };
});

/*
 * Membership and workspace access are independent reads (the access RPC is
 * a stable SQL function), so they run together, once per request. Their
 * results are still checked in the old order: membership first.
 */
const merchantAccess = perRequest(async (merchantId: string, userId: string) => {
  const client = createClient();
  const [membership, access] = await Promise.all([
    client
      .from('merchant_user')
      .select('role')
      .eq('merchant_id', merchantId)
      .eq('user_id', userId)
      .maybeSingle(),
    loadMerchantWorkspaceAccess(client, merchantId).then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    ),
  ]);
  return { membership, access };
});

/** Operations require current approval. Home and setup may use the narrower access. */
export type AuthorizedMerchant = PartnerHome & {
  id: string;
  userId: string;
  isAnonymous: boolean;
  access: MerchantWorkspaceAccess;
};

export async function requireMerchant(
  options: {
    access?: 'operations' | 'setup' | 'workspace-setup' | 'shell';
    merchantId?: string;
  } = {},
): Promise<AuthorizedMerchant> {
  const workspaceSetup = options.access === 'workspace-setup';
  const setup = options.access === 'setup' || workspaceSetup;
  const { user, home: me } = await signedIn();
  if (me.kind === 'anonymous') redirect(PORTALS.merchant.signIn);
  if (me.kind !== 'merchant' || !me.id) redirect(me.home);
  // A supplied target must match the database-selected workspace. Object-level
  // membership and capability checks remain in the existing owner commands.
  if (options.merchantId && options.merchantId !== me.id) redirect('/merchant');
  if (!user) redirect('/merchants/sign-in?reason=workspace-session');
  // An unknown session type must never be granted operational access.
  const isAnonymous = user.is_anonymous !== false;
  if (isAnonymous && !setup && options.access !== 'shell') redirect('/merchant');
  const { membership: memberRead, access: accessRead } = await merchantAccess(me.id, user.id);
  const { data: membership, error } = memberRead;
  if (error) throw new MerchantAccessError('Your workspace membership could not be checked.', 503);
  if (!membership || !['owner', 'manager'].includes(membership.role))
    redirect('/merchants/sign-in?reason=workspace-access');
  if (!accessRead.value) throw accessRead.error;
  const access = accessRead.value;
  // Approved operational members can open the shared layout even when the
  // application owner is the only member allowed to edit registration setup.
  if (!access.setup && !access.operations) {
    // A current rejected application has no workspace capability. Give it a
    // status-only recovery route instead of returning it to sign-in and Home.
    if (access.state === 'rejected') redirect('/merchants/decision');
    // An expired session or a lost membership signs in again. A valid session
    // with no access (a paused or delisted business, or a manager before
    // approval) would only be sent straight back here after signing in, so it
    // gets the status page, which says access is restricted.
    if (access.reason) redirect('/merchants/sign-in?reason=workspace-session');
    redirect('/merchants/decision');
  }
  if (isAnonymous && (access.state === 'legacy' || !access.setup || access.operations))
    redirect('/merchant');
  if (setup && access.state !== 'legacy') {
    if (!access.setup)
      throw new MerchantAccessError('Only the application owner can edit setup.', 403);
    const { data: merchant, error: merchantError } = await createClient()
      .from('merchant')
      .select('status')
      .eq('id', me.id)
      .maybeSingle();
    if (merchantError)
      throw new MerchantAccessError('Your business setup could not be checked.', 503);
    const canEditDraft =
      merchant &&
      (['applied', 'documents_pending', 'under_review'].includes(merchant.status) ||
        (workspaceSetup && merchant.status === 'live'));
    if (!canEditDraft)
      throw new MerchantAccessError('Draft setup is not available for this business.', 403);
  }
  if (!setup && options.access !== 'shell' && !access.operations) redirect('/merchant');
  return { ...me, id: me.id, userId: user.id, isAnonymous, access };
}

export function requireMerchantSetup(): Promise<AuthorizedMerchant> {
  return requireMerchant({ access: 'setup' });
}

/**
 * The setup pages from before the merchant workspace (Catalogue, Stores,
 * Hours, Documents) serve legacy merchants and new-form applications under
 * review. Once an application is approved those records live in the
 * workspace (Offerings, Business, Availability), and the setup access check
 * refuses the page. Older links, the live dashboard and settings still point
 * here, so send the merchant to the workspace section instead of an error.
 */
export async function setupPageOrWorkspace<T>(
  load: () => Promise<T>,
  workspaceHref: string,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof MerchantAccessError && error.status === 403) redirect(workspaceHref);
    throw error;
  }
}

/**
 * A host, unlike the other two, is never turned away for being
 * unfinished.
 *
 * The merchant and rider portals bounce an incomplete account
 * back to an application form, because until a merchant has a
 * menu there is genuinely nothing to run. A host is different:
 * the onboarding lives inside the portal, and somebody with one
 * half-built unit still has properties, a team, a verification
 * code and a QR pack on the way to look at. Sending them out to
 * a form to finish one step is how a half-finished setup stays
 * half-finished.
 */
export async function requireHost(): Promise<PartnerHome & { id: string }> {
  const me = await partnerHome();
  if (me.kind === 'anonymous') redirect(PORTALS.host.signIn);
  if (me.kind !== 'host' || !me.id) redirect(me.home);
  return me as PartnerHome & { id: string };
}

/** The same, for the same reason: R1 is built for this rider. */
export async function requireRider(): Promise<PartnerHome & { id: string }> {
  const me = await partnerHome();
  if (me.kind === 'anonymous') redirect(PORTALS.rider.signIn);
  if (me.kind !== 'rider' || !me.id) redirect(me.home);
  return me as PartnerHome & { id: string };
}

/** The sentence under the partner's name in the header. */
export function statusLine(status: string | undefined, pct: number | undefined): string {
  switch (status) {
    case 'live':
      return 'Live · taking orders';
    case 'active':
      return 'Active';
    case 'under_review':
      return 'With us for review';
    case 'documents_pending':
      return `Waiting on documents · ${pct ?? 0}% set up`;
    case 'applied':
      return `Application in progress · ${pct ?? 0}%`;
    case 'paused':
      return 'Paused';
    case 'suspended':
      return 'Suspended';
    case 'delisted':
      return 'Delisted';
    case 'offboarded':
      return 'Offboarded';
    default:
      return status ?? '';
  }
}
