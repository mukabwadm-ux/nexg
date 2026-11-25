import 'server-only';

import { createHash } from 'node:crypto';

import type { Database } from '@nexg/db';
import type { Letterhead } from '@nexg/merchant-agreement';
import { renderInvoicePdf, type InvoicePdfInput } from '@nexg/merchant-agreement/invoice';
import type { SupabaseClient } from '@supabase/supabase-js';

import { taxInvoiceCheckCode } from './finance-documents';
import { billToOf, normaliseDetail, type ClientInvoiceDetail } from './client-invoices';

/**
 * A client invoice's PDF: rendered here on the NexG letterhead, stored in
 * the private finance-invoices bucket under the signed-in person's folder,
 * and recorded with its SHA-256 (rpc_fin_invoice_pdf_record). Everything
 * runs with the person's own session, so storage and the database check
 * their access as usual. An invoice that already has a PDF keeps it.
 */

export const INVOICES_BUCKET = 'finance-invoices';

type Client = SupabaseClient<Database>;

interface LetterheadRow {
  registered_office: string;
  po_box: string;
  phone: string;
  email: string;
  website: string;
}

export async function invoiceDetail(
  client: Client,
  id: string,
): Promise<{ detail: ClientInvoiceDetail | null; error: string | null }> {
  const { data, error } = await client.rpc('rpc_fin_invoice_detail', { p_id: id });
  if (error || !data)
    return { detail: null, error: error?.message ?? 'That invoice is not on file.' };
  return { detail: normaliseDetail(data as unknown as ClientInvoiceDetail), error: null };
}

export function pdfInput(d: ClientInvoiceDetail): InvoicePdfInput {
  const bill = billToOf(d);
  return {
    number: d.invoice.number ?? 'DRAFT',
    issueDate: d.invoice.issue_date,
    dueDate: d.invoice.due_date,
    billTo: {
      legalName: bill.legal_name,
      tradingName: bill.trading_name,
      kraPin: bill.kra_pin,
      address: bill.address,
      email: bill.email,
    },
    lines: d.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unit_price_cents,
      vatRate: l.vat_rate,
      vatPct: l.vat_pct,
      netCents: l.net_cents,
      vatCents: l.vat_cents,
      grossCents: l.gross_cents,
    })),
    netCents: d.invoice.net_cents,
    vatCents: d.invoice.vat_cents,
    grossCents: d.invoice.gross_cents,
    notes: d.invoice.notes,
    kraStatus: d.tax_invoice?.kra_status ?? 'pending',
    kraReference: d.tax_invoice?.kra_reference ?? null,
    checkCode: d.tax_invoice ? taxInvoiceCheckCode(d.tax_invoice.id) : null,
    createdAt: new Date(d.invoice.issued_at ?? `${d.invoice.issue_date}T09:00:00Z`),
  };
}

/** The invoice's PDF in storage, made now if it has none yet. */
export async function ensureInvoicePdf(
  client: Client,
  d: ClientInvoiceDetail,
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const number = d.invoice.number;
  if (!number || d.invoice.status === 'draft') {
    return { ok: false, message: 'Only an issued invoice has a PDF.' };
  }
  if (d.invoice.pdf_path) return { ok: true, path: d.invoice.pdf_path };

  const [letterhead, user] = await Promise.all([
    client.rpc('rpc_fin_letterhead'),
    client.auth.getUser(),
  ]);
  if (letterhead.error) return { ok: false, message: letterhead.error.message };
  const uid = user.data.user?.id;
  if (!uid) return { ok: false, message: 'Sign in again, then make the PDF.' };

  const row = letterhead.data as unknown as LetterheadRow | null;
  const head: Letterhead | null = row
    ? {
        registeredOffice: row.registered_office,
        poBox: row.po_box,
        phone: row.phone,
        email: row.email,
        website: row.website,
      }
    : null;

  let rendered: { bytes: Uint8Array; sha256: string };
  try {
    rendered = await renderInvoicePdf(pdfInput(d), head);
  } catch (cause) {
    return {
      ok: false,
      message: `The PDF could not be made: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }

  const path = `${uid}/${d.invoice.id}/${number}.pdf`;
  const upload = await client.storage
    .from(INVOICES_BUCKET)
    .upload(path, rendered.bytes, { contentType: 'application/pdf', upsert: false });
  let sha256 = rendered.sha256;
  if (upload.error) {
    /* Stored by an earlier attempt that did not get as far as recording it:
       record the file that is there, by its own fingerprint. */
    const existing = await client.storage.from(INVOICES_BUCKET).download(path);
    if (existing.error || !existing.data) {
      return { ok: false, message: `The PDF could not be stored: ${upload.error.message}` };
    }
    sha256 = createHash('sha256')
      .update(new Uint8Array(await existing.data.arrayBuffer()))
      .digest('hex');
  }

  const { error } = await client.rpc('rpc_fin_invoice_pdf_record', {
    p_id: d.invoice.id,
    p_path: path,
    p_sha256: sha256,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, path };
}

export async function invoicePdfBytes(client: Client, path: string): Promise<Uint8Array | null> {
  const { data, error } = await client.storage.from(INVOICES_BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** A link valid for a minute that downloads the PDF, named by its number. */
export async function invoicePdfLink(
  client: Client,
  path: string,
  number: string,
): Promise<string | null> {
  const { data } = await client.storage
    .from(INVOICES_BUCKET)
    .createSignedUrl(path, 60, { download: `NexG-Invoice-${number}.pdf` });
  return data?.signedUrl ?? null;
}
