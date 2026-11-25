import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { NEXG_DOCUMENT_COMPANY, documentCompany, verifyUrl } from './company';
import { renderReceipt, renderReport, renderSettlement, renderTaxInvoice } from './index';
import { dayRange, kes, moneyShort } from './kit';

/* Invented parties and figures, never real ones. Set DOCS_OUT to a folder to keep the PDFs. */
const company = NEXG_DOCUMENT_COMPANY;
const out = process.env.DOCS_OUT;
const keep = (name: string, bytes: Uint8Array) => {
  if (out) writeFileSync(join(out, name), bytes);
};

async function check(bytes: Uint8Array, title: string) {
  expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getTitle()).toBe(title);
  expect(pdf.getAuthor()).toBe('Nexgenius Concierge Limited');
  return pdf;
}

describe('branded finance documents', () => {
  it('renders a tax invoice', async () => {
    const r = await renderTaxInvoice({
      number: 'NEXG-INV-2026-00001',
      issueDate: '2026-11-24',
      dueDate: '2026-11-30',
      billTo: { legalName: 'Sample Customer Ltd', kraPin: 'P000000000A' },
      lines: [
        {
          description: 'Concierge service',
          quantity: 1,
          unitPriceCents: 1000000,
          vatRate: 'standard',
          vatPct: 16,
          netCents: 1000000,
          vatCents: 160000,
          grossCents: 1160000,
        },
      ],
      netCents: 1000000,
      vatCents: 160000,
      grossCents: 1160000,
      checkCode: 'abc123def456',
      company,
    });
    expect((await check(r.bytes, 'Tax Invoice NEXG-INV-2026-00001')).getPageCount()).toBe(1);
    keep('invoice.pdf', r.bytes);
  }, 30_000);

  it('renders a receipt', async () => {
    const r = await renderReceipt({
      reference: 'NEXG-RCT-2026-00001',
      checkCode: 'abc123def456',
      issueDate: '2026-11-24',
      receivedFrom: 'Sample Customer Ltd',
      paidOn: '2026-11-24',
      method: 'mpesa',
      transactionId: 'SAMPLE12AB',
      invoiceNumber: 'NEXG-INV-2026-00001',
      amountCents: 1160000,
      netCents: 1000000,
      vatCents: 160000,
      balanceCents: 0,
      company,
    });
    await check(r.bytes, 'Payment Receipt NEXG-RCT-2026-00001');
    keep('receipt.pdf', r.bytes);
  }, 30_000);

  it('renders a settlement statement', async () => {
    const r = await renderSettlement({
      reference: 'NEXG-MST-2026-00001',
      checkCode: 'abc123def456',
      issueDate: '2026-11-24',
      partyType: 'merchant',
      partyName: 'Sample Restaurant',
      partyCode: 'MER-0001',
      periodFrom: '2026-11-16',
      periodTo: '2026-11-22',
      grossCents: 10000000,
      orders: 120,
      commissionCents: 1400000,
      commissionVatCents: 193103,
      adjustmentCents: 0,
      netCents: 8600000,
      payoutMethod: 'Bank transfer',
      settlementReference: 'SAMPLE-REF',
      status: 'Paid',
      company,
    });
    await check(r.bytes, 'Merchant Settlement NEXG-MST-2026-00001');
    keep('settlement.pdf', r.bytes);
  }, 30_000);

  it('renders a monthly report', async () => {
    const r = await renderReport({
      reference: 'NEXG-FR-2026-00011',
      month: '2026-11',
      issueDate: '2026-11-24',
      gtvCents: 500000000,
      revenueCents: 85000000,
      expensesCents: 52000000,
      lines: [
        { label: 'Food & delivery', icon: 'utensils', cents: 30000000 },
        { label: 'Stays', icon: 'bed', cents: 25000000 },
        { label: 'Transport', icon: 'car', cents: 12000000 },
        { label: 'Experiences', icon: 'ticket', cents: 10000000 },
        { label: 'Other services', icon: 'grid', cents: 8000000 },
      ],
      company: documentCompany('+254700000000'),
    });
    await check(r.bytes, 'Financial Report NEXG-FR-2026-00011');
    keep('report.pdf', r.bytes);
  }, 30_000);

  it('runs a long invoice onto more pages', async () => {
    const line = {
      description:
        'A long line description that wraps onto a second line in the table of the invoice',
      quantity: 2,
      unitPriceCents: 50000,
      vatRate: 'standard' as const,
      vatPct: 16,
      netCents: 100000,
      vatCents: 16000,
      grossCents: 116000,
    };
    const r = await renderTaxInvoice({
      number: 'NEXG-INV-2026-00002',
      issueDate: '2026-11-24',
      dueDate: '2026-12-24',
      billTo: {
        legalName: 'Łódź Žabka & Söhne – “Ltd”',
        address: 'Sample Road',
        email: 'a@b.example',
      },
      lines: Array.from({ length: 30 }, () => line),
      netCents: 3000000,
      vatCents: 480000,
      grossCents: 3480000,
      notes: 'Purchase order PO-0001.',
      company,
    });
    expect(r.pages).toBeGreaterThan(1);
    keep('invoice-long.pdf', r.bytes);
  }, 30_000);

  it('formats figures and links', () => {
    expect(moneyShort(10000000)).toBe('100,000');
    expect(moneyShort(1050)).toBe('10.50');
    expect(kes(-250000)).toBe('KES -2,500');
    expect(dayRange('2026-11-16', '2026-11-22')).toBe('16–22 November 2026');
    expect(verifyUrl('NEXG-RCT-2026-00001', 'abc')).toBe(
      'https://www.nexgapp.com/verify/NEXG-RCT-2026-00001?c=abc',
    );
    expect(documentCompany(' ').phone).toBe(NEXG_DOCUMENT_COMPANY.phone);
  });
});
