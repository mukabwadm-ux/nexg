import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

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
  const { data } = await createClient().rpc('fn_partner_home');
  return (data as unknown as PartnerHome) ?? { kind: 'anonymous', home: '/sign-in' };
}

/**
 * A merchant is no longer turned away for being unfinished.
 *
 * This used to bounce anybody under the readiness line back to
 * the application form, on the reasoning that a merchant with
 * no menu has nothing to run. That was true when the dashboard
 * had one state. It now has two, and the second one is built
 * for exactly this person: the setup strip, what going live
 * unlocks, and every section open with sample data.
 *
 * Sending them to a form instead means they never see what
 * finishing buys them — and it was the reason signing in
 * "did not work" for every real merchant on the system, all of
 * whom sit under the line.
 */
export async function requireMerchant(): Promise<PartnerHome & { id: string }> {
  const me = await partnerHome();
  if (me.kind !== 'merchant' || !me.id) redirect(me.home);
  return me as PartnerHome & { id: string };
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
