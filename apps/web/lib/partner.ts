import { redirect } from 'next/navigation';

import { createClient } from './supabase/server';
import {
  loadMerchantWorkspaceAccess,
  MerchantAccessError,
  type MerchantWorkspaceAccess,
} from './merchant-access';

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
  const client = createClient();
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user) return { kind: 'anonymous', home: '/sign-in' };
  const { data, error } = await client.rpc('fn_partner_home');
  if (error) throw new Error('Your account could not be loaded. Please retry.');
  return (data as unknown as PartnerHome) ?? { kind: 'anonymous', home: '/sign-in' };
}

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
  const me = await partnerHome();
  if (me.kind !== 'merchant' || !me.id) redirect(me.home);
  // A supplied target must match the database-selected workspace. Object-level
  // membership and capability checks remain in the existing owner commands.
  if (options.merchantId && options.merchantId !== me.id) redirect('/merchant');
  const client = createClient();
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user) redirect('/sign-in?reason=workspace-session');
  // An unknown session type must never be granted operational access.
  const isAnonymous = auth.data.user.is_anonymous !== false;
  if (isAnonymous && !setup && options.access !== 'shell') redirect('/merchant');
  const { data: membership, error } = await client
    .from('merchant_user')
    .select('role')
    .eq('merchant_id', me.id)
    .eq('user_id', auth.data.user.id)
    .maybeSingle();
  if (error) throw new MerchantAccessError('Your workspace membership could not be checked.', 503);
  if (!membership || !['owner', 'manager'].includes(membership.role))
    redirect('/sign-in?reason=workspace-access');
  const access = await loadMerchantWorkspaceAccess(client, me.id);
  // Approved operational members can open the shared layout even when the
  // application owner is the only member allowed to edit registration setup.
  if (!access.setup && !access.operations) {
    // A current rejected application has no workspace capability. Give it a
    // status-only recovery route instead of returning it to sign-in and Home.
    if (access.state === 'rejected') redirect('/merchants/decision');
    redirect('/sign-in?reason=workspace-session');
  }
  if (isAnonymous && (access.state === 'legacy' || !access.setup || access.operations))
    redirect('/merchant');
  if (setup && access.state !== 'legacy') {
    if (!access.setup)
      throw new MerchantAccessError('Only the application owner can edit setup.', 403);
    const { data: merchant, error: merchantError } = await client
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
  return { ...me, id: me.id, userId: auth.data.user.id, isAnonymous, access };
}

export function requireMerchantSetup(): Promise<AuthorizedMerchant> {
  return requireMerchant({ access: 'setup' });
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
  if (me.kind !== 'host' || !me.id) redirect(me.home);
  return me as PartnerHome & { id: string };
}

/** The same, for the same reason: R1 is built for this rider. */
export async function requireRider(): Promise<PartnerHome & { id: string }> {
  const me = await partnerHome();
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
