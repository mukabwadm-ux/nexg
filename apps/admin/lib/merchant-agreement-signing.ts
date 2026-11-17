import { randomUUID } from 'node:crypto';

import { getCategoryById } from '@nexg/contracts';
import type { Database } from '@nexg/db';
import {
  TEMPLATE_VERSION,
  fillValues,
  renderSignedAgreement,
  type AgreementFill,
} from '@nexg/merchant-agreement';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Signing a merchant's agreement: NexG's half of "the merchant is approved
 * and gets its agreement filled in and signed".
 *
 * The database says whether the merchant is ready and hands over everything
 * the agreement needs (rpc_merchant_agreement_signing_context); this renders
 * the PDF on the NexG letterhead with NexG's signature, stores it in the
 * private bucket and records it with its SHA-256
 * (rpc_merchant_agreement_sign_record). It runs as the staff member who
 * approves or presses "Issue signed agreement", so storage and the database
 * check their access as usual. A signed copy is never replaced: calling this
 * again for a signed acceptance changes nothing.
 */

export const AGREEMENTS_BUCKET = 'merchant-agreements';

type Client = SupabaseClient<Database>;

interface PartyRow {
  legal_name: string;
  registration_number: string | null;
  kra_pin: string;
  address: string;
  postal_address: string | null;
  signatory_name: string;
  signatory_title: string;
  representative_name: string;
  representative_title: string;
  principal_name: string;
}

interface SignerRow {
  id: string;
  signatory_name: string;
  signatory_title: string;
  representative_name: string;
  representative_title: string;
  po_box: string;
  registered_office: string;
  email: string;
  phone: string;
  website: string;
  in_room_commission_pct: number;
  signature_path: string;
  signature_type: 'image/png' | 'image/jpeg';
}

export interface SignedCopy {
  id: string;
  reference: string;
  storage_path: string;
  sha256: string;
  bytes: number;
  pages: number;
  signed_at: string;
  effective_on: string;
  version: string;
}

/** What rpc_merchant_agreement_signing_context returns. */
export interface SigningContext {
  ready: boolean;
  missing: string[];
  approved: boolean;
  category: string | null;
  agreement: { id: string; title: string; version: string } | null;
  acceptance: { id: string; accepted_at: string; account_email: string | null } | null;
  party: PartyRow | null;
  merchant: { id: string; trading_name: string; email: string | null; phone: string };
  commission: { pct: number | null; basis: 'negotiated' | 'own_riders' | 'nexg_delivery' } | null;
  settlement_cycle: 'weekly' | 'biweekly';
  signer: SignerRow | null;
  signed: SignedCopy | null;
}

export type IssueResult =
  | { status: 'issued'; copy: SignedCopy }
  | { status: 'signed'; copy: SignedCopy }
  | { status: 'waiting'; missing: string[] }
  | { status: 'unavailable'; message: string };

export async function signingContext(client: Client, merchantId: string) {
  const { data, error } = await client.rpc('rpc_merchant_agreement_signing_context', {
    p_merchant_id: merchantId,
  });
  if (error) return { context: null, error: error.message };
  return { context: data as unknown as SigningContext, error: null };
}

/* The agreement's reference: fixed by the acceptance it signs. */
export function referenceFor(acceptanceId: string): string {
  return `NXG-MA-${acceptanceId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

/* The date in Nairobi, as YYYY-MM-DD. */
function nairobiDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** The agreement's fill-in values from a ready context. */
export function fillFrom(context: SigningContext, issuedAt: Date): AgreementFill {
  const { agreement, acceptance, party, signer, commission } = context;
  if (!agreement || !acceptance || !party || !signer || commission?.pct == null)
    throw new Error('The merchant is not ready to sign.');
  return {
    agreementId: agreement.id,
    version: agreement.version,
    issuedAt,
    reference: referenceFor(acceptance.id),
    merchant: {
      legalName: party.legal_name,
      registrationNumber: party.registration_number ?? '',
      kraPin: party.kra_pin,
      address: party.address,
      postalAddress: party.postal_address,
      email: context.merchant.email ?? '',
      phone: context.merchant.phone,
      signatoryName: party.signatory_name,
      signatoryTitle: party.signatory_title,
      representativeName: party.representative_name,
      representativeTitle: party.representative_title,
      principalName: party.principal_name,
    },
    company: {
      poBox: signer.po_box,
      email: signer.email,
      phone: signer.phone,
      registeredOffice: signer.registered_office,
      website: signer.website,
      signatoryName: signer.signatory_name,
      signatoryTitle: signer.signatory_title,
      representativeName: signer.representative_name,
      representativeTitle: signer.representative_title,
    },
    commissionPct: Number(commission.pct),
    inRoomCommissionPct: Number(signer.in_room_commission_pct),
    settlementCycle: context.settlement_cycle,
    acceptance: {
      name: party.signatory_name,
      title: party.signatory_title,
      acceptedAt: new Date(acceptance.accepted_at),
      accountEmail: acceptance.account_email ?? context.merchant.email ?? '',
      version: agreement.version,
      reference: acceptance.id,
      categoryName: getCategoryById(context.category ?? '')?.name ?? agreement.title,
    },
  };
}

/**
 * Signs the merchant's current agreement if it is ready and not yet signed.
 * Never throws for "not ready": it says what is missing instead.
 */
export async function issueSignedAgreement(
  client: Client,
  merchantId: string,
): Promise<IssueResult> {
  const { context, error } = await signingContext(client, merchantId);
  if (!context)
    return { status: 'unavailable', message: error ?? 'The signing details could not be read.' };
  if (context.signed) return { status: 'signed', copy: context.signed };
  if (!context.ready || !context.signer || !context.acceptance)
    return { status: 'waiting', missing: context.missing };

  const signature = await client.storage
    .from(AGREEMENTS_BUCKET)
    .download(context.signer.signature_path);
  if (signature.error || !signature.data)
    return { status: 'unavailable', message: 'NexG’s signature could not be read from storage.' };

  const issuedAt = new Date();
  const fill = fillFrom(context, issuedAt);
  const rendered = await renderSignedAgreement(fill, {
    letterhead: {
      registeredOffice: context.signer.registered_office,
      poBox: context.signer.po_box,
      phone: context.signer.phone,
      email: context.signer.email,
      website: context.signer.website,
    },
    signature: {
      bytes: new Uint8Array(await signature.data.arrayBuffer()),
      type: context.signer.signature_type === 'image/png' ? 'png' : 'jpg',
    },
  });

  const path = `signed/${merchantId}/${randomUUID()}.pdf`;
  const upload = await client.storage
    .from(AGREEMENTS_BUCKET)
    .upload(path, rendered.bytes, { contentType: 'application/pdf', upsert: false });
  if (upload.error)
    return {
      status: 'unavailable',
      message: `The signed PDF could not be stored: ${upload.error.message}`,
    };

  const { data, error: recordError } = await client.rpc('rpc_merchant_agreement_sign_record', {
    p_merchant_id: merchantId,
    p_acceptance_id: context.acceptance.id,
    p_signer_id: context.signer.id,
    p_storage_path: path,
    p_sha256: rendered.sha256,
    p_pages: rendered.pages,
    p_reference: fill.reference,
    p_template_version: TEMPLATE_VERSION,
    p_effective_on: nairobiDate(issuedAt),
    p_details: {
      ...fillValues(fill),
      commission_basis: context.commission?.basis ?? null,
      acceptance_at: fill.acceptance.acceptedAt.toISOString(),
      account_email: fill.acceptance.accountEmail,
    },
  });
  if (recordError) {
    // The upload is not a signed copy until it is recorded: clear it.
    await client.storage.from(AGREEMENTS_BUCKET).remove([path]);
    return { status: 'unavailable', message: recordError.message };
  }
  return { status: 'issued', copy: data as unknown as SignedCopy };
}

/** A link valid for a minute to a signed copy, named by its reference. */
export async function signedCopyLink(
  client: Client,
  copy: Pick<SignedCopy, 'storage_path' | 'reference'>,
) {
  const { data } = await client.storage
    .from(AGREEMENTS_BUCKET)
    .createSignedUrl(copy.storage_path, 60, {
      download: `NexG-Merchant-Agreement-${copy.reference}.pdf`,
    });
  return data?.signedUrl ?? null;
}

/** One line for staff about an issue attempt. */
export function issueSummary(result: IssueResult): string {
  switch (result.status) {
    case 'issued':
      return `Merchant agreement signed and issued (${result.copy.reference}).`;
    case 'signed':
      return `The merchant agreement was already signed (${result.copy.reference}).`;
    case 'waiting':
      return `Merchant agreement not signed yet: ${result.missing.join(' ')}`;
    default:
      return `Merchant agreement not signed: ${result.message}`;
  }
}
