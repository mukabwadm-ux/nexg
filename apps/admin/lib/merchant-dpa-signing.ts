import { randomUUID } from 'node:crypto';

import { MerchantDpaAnnex } from '@nexg/contracts/merchant-dpa';
import type { Database } from '@nexg/db';
import { DPA_RENDER_VERSION, renderSignedDpa, type DpaFill } from '@nexg/merchant-agreement';
import type { SupabaseClient } from '@supabase/supabase-js';

import { AGREEMENTS_BUCKET } from '@/lib/merchant-agreement-signing';

/**
 * Signing a merchant's Data Processing Agreement (20270327000100), the same
 * way its merchant agreement is signed (merchant-agreement-signing.ts): the
 * database says whether the merchant has accepted the current DPA and hands
 * over what it was filled with and NexG's signatory
 * (rpc_merchant_dpa_signing_context); this renders the PDF on the NexG
 * letterhead with NexG's signature, stores it in the private bucket and
 * records it (rpc_merchant_dpa_sign_record). It runs as the staff member, so
 * storage and the database check their access as usual. A signed copy is
 * never replaced: calling this again changes nothing.
 */

type Client = SupabaseClient<Database>;

interface Signed {
  storage_path: string;
  sha256: string;
  pages: number;
  signed_at: string;
  reference: string;
}

/** What rpc_merchant_dpa_signing_context returns. */
export interface DpaSigningContext {
  ready: boolean;
  missing: string[];
  acceptance: {
    id: string;
    merchant_id: string;
    version: string;
    sha256: string;
    accepted_at: string;
    account_email: string | null;
    ip: string | null;
    device_label: string | null;
    reference: string;
    details: {
      legal_name: string;
      registration_number: string | null;
      kra_pin: string;
      address: string;
      postal_address: string | null;
      signatory_name: string;
      signatory_title: string;
      email: string;
      phone: string;
      annex: unknown;
    };
  } | null;
  signer: {
    id: string;
    signatory_name: string;
    signatory_title: string;
    po_box: string;
    registered_office: string;
    email: string;
    phone: string;
    website: string;
    signature_path: string;
    signature_type: 'image/png' | 'image/jpeg';
  } | null;
  signed: Signed | null;
}

export type DpaIssueResult =
  | { status: 'issued'; copy: Signed }
  | { status: 'signed'; copy: Signed }
  | { status: 'waiting'; missing: string[] }
  | { status: 'unavailable'; message: string };

export async function dpaSigningContext(client: Client, merchantId: string) {
  const { data, error } = await client.rpc('rpc_merchant_dpa_signing_context', {
    p_merchant_id: merchantId,
  });
  if (error) return { context: null, error: error.message, code: error.code };
  return { context: data as unknown as DpaSigningContext, error: null, code: null };
}

/** The DPA's fill-in values from a ready context. */
export function dpaFillFrom(context: DpaSigningContext): DpaFill {
  const { acceptance: a, signer } = context;
  if (!a || !signer) throw new Error('The DPA is not ready to sign.');
  const d = a.details;
  return {
    acceptedAt: new Date(a.accepted_at),
    reference: a.reference,
    version: a.version,
    merchant: {
      legalName: d.legal_name,
      registrationNumber: d.registration_number,
      kraPin: d.kra_pin,
      address: d.address,
      postalAddress: d.postal_address,
      email: d.email,
      phone: d.phone,
      signatoryName: d.signatory_name,
      signatoryTitle: d.signatory_title,
    },
    annex: MerchantDpaAnnex.parse(d.annex),
    signer: { name: signer.signatory_name, title: signer.signatory_title },
    record: {
      accountEmail: a.account_email ?? d.email,
      ip: a.ip,
      device: a.device_label,
      acceptanceId: a.id,
      textSha256: a.sha256,
    },
  };
}

/**
 * Signs the merchant's accepted DPA if it is ready and not yet signed.
 * Never throws for "not ready": it says what is missing instead. Before
 * the migration runs it says the DPA is not set up.
 */
export async function issueSignedDpa(client: Client, merchantId: string): Promise<DpaIssueResult> {
  const { context, error, code } = await dpaSigningContext(client, merchantId);
  if (!context)
    return {
      status: 'unavailable',
      message:
        code === 'PGRST202'
          ? 'The data processing agreement is not set up in the database yet.'
          : (error ?? 'The DPA signing details could not be read.'),
    };
  if (context.signed) return { status: 'signed', copy: context.signed };
  if (!context.ready || !context.signer || !context.acceptance)
    return { status: 'waiting', missing: context.missing };

  const signature = await client.storage
    .from(AGREEMENTS_BUCKET)
    .download(context.signer.signature_path);
  if (signature.error || !signature.data)
    return { status: 'unavailable', message: 'NexG’s signature could not be read from storage.' };

  const s = context.signer;
  const rendered = await renderSignedDpa(dpaFillFrom(context), {
    letterhead: {
      registeredOffice: s.registered_office,
      poBox: s.po_box,
      phone: s.phone,
      email: s.email,
      website: s.website,
    },
    signature: {
      bytes: new Uint8Array(await signature.data.arrayBuffer()),
      type: s.signature_type === 'image/png' ? 'png' : 'jpg',
    },
  });

  const path = `dpa/${merchantId}/${randomUUID()}.pdf`;
  const upload = await client.storage
    .from(AGREEMENTS_BUCKET)
    .upload(path, rendered.bytes, { contentType: 'application/pdf', upsert: false });
  if (upload.error)
    return {
      status: 'unavailable',
      message: `The signed DPA could not be stored: ${upload.error.message}`,
    };

  const { data, error: recordError } = await client.rpc('rpc_merchant_dpa_sign_record', {
    p_merchant_id: merchantId,
    p_acceptance_id: context.acceptance.id,
    p_signer_id: s.id,
    p_storage_path: path,
    p_sha256: rendered.sha256,
    p_pages: rendered.pages,
    p_render_version: DPA_RENDER_VERSION,
  });
  if (recordError) {
    // The upload is not a signed copy until it is recorded: clear it.
    await client.storage.from(AGREEMENTS_BUCKET).remove([path]);
    return { status: 'unavailable', message: recordError.message };
  }
  return { status: 'issued', copy: data as unknown as Signed };
}

/** One line for staff about an issue attempt. */
export function dpaIssueSummary(result: DpaIssueResult): string {
  switch (result.status) {
    case 'issued':
      return `Data processing agreement signed and issued (${result.copy.reference}).`;
    case 'signed':
      return `The data processing agreement was already signed (${result.copy.reference}).`;
    case 'waiting':
      return `Data processing agreement not signed yet: ${result.missing.join(' ')}`;
    default:
      return `Data processing agreement not signed: ${result.message}`;
  }
}
