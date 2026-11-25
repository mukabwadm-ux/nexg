import { documentCompany } from './finance-docs/company';
import { money, type RenderedDocument } from './finance-docs/kit';
import { renderTaxInvoice, type TaxInvoiceLine } from './finance-docs/tax-invoice';
import type { Letterhead } from './pdf';

/**
 * A client tax invoice as a PDF, in the branded NexG design (see
 * finance-docs/tax-invoice.ts): pdf-lib and the standard Helvetica fonts
 * only, so it renders in a serverless function and the same invoice always
 * gives the same bytes. Long invoices run onto further pages.
 */

export type InvoiceVatRate = TaxInvoiceLine['vatRate'];
export type InvoicePdfLine = TaxInvoiceLine;

export interface InvoicePdfInput {
  number: string;
  /** YYYY-MM-DD. */
  issueDate: string;
  /** YYYY-MM-DD. */
  dueDate: string;
  billTo: {
    legalName: string;
    tradingName?: string | null;
    kraPin?: string | null;
    address?: string | null;
    email?: string | null;
  };
  lines: InvoicePdfLine[];
  netCents: number;
  vatCents: number;
  grossCents: number;
  notes?: string | null;
  /** The tax invoice's KRA status; "pending" until it is recorded. */
  kraStatus?: string | null;
  kraReference?: string | null;
  /** Replaces the default "how to pay" text. */
  paymentInstructions?: string | null;
  /** Printed in the QR code: unlocks the details on the verify page. */
  checkCode?: string | null;
  /** Document dates; the issue date when left out, so the bytes repeat. */
  createdAt?: Date;
}

export type RenderedInvoice = RenderedDocument;

/** 1724815 → "17,248.15". Exact: cents are never divided as floats. */
export const formatAmount = money;

/** The letterhead's saved phone, when there is one, goes in the company block. */
export function renderInvoicePdf(
  input: InvoicePdfInput,
  letterhead: Letterhead | null,
): Promise<RenderedInvoice> {
  return renderTaxInvoice({ ...input, company: documentCompany(letterhead?.phone) });
}
