import 'server-only';

import { randomUUID } from 'node:crypto';

import { MerchantDpaAnnex } from '@nexg/contracts/merchant-dpa';
import { NEXG_DOCUMENT_COMPANY } from '@nexg/merchant-agreement/documents';
import { DPA_RENDER_VERSION, renderSignedDpa, type DpaFill } from '@nexg/merchant-agreement';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/*
 * The merchant's filled-in, signed Data Processing Agreement, made right
 * after the owner accepts it (20270326000100).
 *
 * Preferably as NexG, with the service role: then the copy carries NexG's
 * signature (when its signatory is set up in Settings › Agreement signing)
 * and no merchant token touches it. That client does exactly this and
 * nothing else: read what the copy needs, upload it, attach it. Who may ask
 * for a copy (the merchant's own members) is checked with their own token
 * before this runs.
 *
 * Where this server has no service role key (the web project has none
 * today), the copy is stored with the owner's own token instead: the
 * database lets the owner upload to its dpa/ folder only while an
 * acceptance waits for its copy, attaches it once, and leaves NexG's
 * signatory off it. Either way the copy is rendered from what the
 * acceptance recorded, the same bytes every time.
 */

const BUCKET = 'merchant-agreements';

interface CopyContext {
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
    storage_path: string | null;
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
  };
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
}

export type DpaCopyResult =
  | { status: 'stored'; storagePath: string }
  | { status: 'unavailable'; message: string };

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}

/** The DPA's fill-in values from what the database recorded at acceptance. */
export function dpaFillFrom(context: CopyContext): DpaFill {
  const { acceptance: a, signer } = context;
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
    signer: signer ? { name: signer.signatory_name, title: signer.signatory_title } : null,
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
 * Renders, stores and attaches the signed copy of one acceptance. Safe to
 * call again: an acceptance that has its copy is left as it is.
 */
export async function storeDpaCopy(
  acceptanceId: string,
  /** The owner's own client: used only when there is no service role key. */
  owner: SupabaseClient,
): Promise<DpaCopyResult> {
  const db = serviceClient() ?? owner;
  const { data, error } = await db.rpc('fn_merchant_dpa_copy_context', {
    p_acceptance_id: acceptanceId,
  });
  if (error || !data)
    return { status: 'unavailable', message: error?.message ?? 'The DPA could not be read.' };
  const context = data as unknown as CopyContext;
  if (context.acceptance.storage_path)
    return { status: 'stored', storagePath: context.acceptance.storage_path };

  let signature: { bytes: Uint8Array; type: 'png' | 'jpg' } | null = null;
  if (context.signer) {
    const image = await db.storage.from(BUCKET).download(context.signer.signature_path);
    if (image.error || !image.data)
      return { status: 'unavailable', message: 'NexG’s signature could not be read.' };
    signature = {
      bytes: new Uint8Array(await image.data.arrayBuffer()),
      type: context.signer.signature_type === 'image/png' ? 'png' : 'jpg',
    };
  }
  const s = context.signer;
  const rendered = await renderSignedDpa(dpaFillFrom(context), {
    letterhead: s
      ? {
          registeredOffice: s.registered_office,
          poBox: s.po_box,
          phone: s.phone,
          email: s.email,
          website: s.website,
        }
      : {
          registeredOffice: NEXG_DOCUMENT_COMPANY.addressLine1,
          poBox: '',
          phone: '',
          email: '',
          website: NEXG_DOCUMENT_COMPANY.website,
        },
    signature,
  });

  const path = `dpa/${context.acceptance.merchant_id}/${randomUUID()}.pdf`;
  const upload = await db.storage
    .from(BUCKET)
    .upload(path, rendered.bytes, { contentType: 'application/pdf', upsert: false });
  if (upload.error)
    return { status: 'unavailable', message: `The signed copy could not be stored.` };
  const { error: recordError } = await db.rpc('fn_merchant_dpa_copy_record', {
    p_acceptance_id: acceptanceId,
    p_storage_path: path,
    p_sha256: rendered.sha256,
    p_pages: rendered.pages,
    p_render_version: DPA_RENDER_VERSION,
    p_signer_id: s?.id ?? null,
  });
  if (recordError) {
    // Not a signed copy until it is attached: clear the upload.
    await db.storage.from(BUCKET).remove([path]);
    return { status: 'unavailable', message: recordError.message };
  }
  return { status: 'stored', storagePath: path };
}
