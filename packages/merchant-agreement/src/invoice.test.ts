import { createHash } from 'node:crypto';

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { SAMPLE_LETTERHEAD } from './fixtures';
import {
  formatAmount,
  renderInvoicePdf,
  type InvoicePdfInput,
  type InvoicePdfLine,
} from './invoice';

/* An invented client and invoice, never a real one. */
function sampleInvoice(lineCount = 4): InvoicePdfInput {
  const base: InvoicePdfLine[] = [
    {
      description: 'Corporate concierge retainer, November',
      quantity: 2,
      unitPriceCents: 500000,
      vatRate: 'standard',
      vatPct: 16,
      netCents: 1000000,
      vatCents: 160000,
      grossCents: 1160000,
    },
    {
      description: 'Export logistics',
      quantity: 1,
      unitPriceCents: 250000,
      vatRate: 'zero',
      vatPct: 0,
      netCents: 250000,
      vatCents: 0,
      grossCents: 250000,
    },
    {
      description: 'Staff training',
      quantity: 3,
      unitPriceCents: 33333,
      vatRate: 'exempt',
      vatPct: 0,
      netCents: 99999,
      vatCents: 0,
      grossCents: 99999,
    },
    {
      description: 'Courier runs',
      quantity: 1.5,
      unitPriceCents: 123457,
      vatRate: 'standard',
      vatPct: 16,
      netCents: 185186,
      vatCents: 29630,
      grossCents: 214816,
    },
  ];
  const lines = Array.from({ length: lineCount }, (_, i) => base[i % base.length]!);
  const sum = (key: 'netCents' | 'vatCents' | 'grossCents') =>
    lines.reduce((s, l) => s + l[key], 0);
  return {
    number: 'NX-INV-2026-000123',
    issueDate: '2026-11-19',
    dueDate: '2026-12-19',
    billTo: {
      legalName: 'Sample Client Limited',
      tradingName: 'Sample Client',
      kraPin: 'P000000000A',
      address: 'Sample House, Sample Road, Nairobi',
      email: 'accounts@client.example',
    },
    lines,
    netCents: sum('netCents'),
    vatCents: sum('vatCents'),
    grossCents: sum('grossCents'),
    notes: 'Purchase order PO-0001.',
    kraStatus: 'pending',
  };
}

describe('client invoice PDF', () => {
  it('renders a tax invoice on the letterhead', async () => {
    const rendered = await renderInvoicePdf(sampleInvoice(), SAMPLE_LETTERHEAD);
    expect(Buffer.from(rendered.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    expect(rendered.sha256).toBe(createHash('sha256').update(rendered.bytes).digest('hex'));
    const pdf = await PDFDocument.load(rendered.bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(rendered.pages).toBe(1);
    expect(pdf.getTitle()).toBe('Tax Invoice NX-INV-2026-000123');
    expect(pdf.getAuthor()).toBe('NexGenius Concierge Limited');
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
  }, 30_000);

  it('gives the same bytes for the same invoice', async () => {
    const [a, b] = await Promise.all([
      renderInvoicePdf(sampleInvoice(), SAMPLE_LETTERHEAD),
      renderInvoicePdf(sampleInvoice(), SAMPLE_LETTERHEAD),
    ]);
    expect(a.sha256).toBe(b.sha256);
  }, 30_000);

  it('runs onto more pages, with no letterhead on file, and prints any name', async () => {
    const rendered = await renderInvoicePdf(
      {
        ...sampleInvoice(80),
        billTo: { legalName: 'Łódź Žabka & Söhne – “Ltd”', tradingName: null },
        notes: null,
      },
      null,
    );
    expect(Buffer.from(rendered.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    expect(rendered.pages).toBeGreaterThan(1);
    expect((await PDFDocument.load(rendered.bytes)).getPageCount()).toBe(rendered.pages);
  }, 30_000);

  it('writes amounts exactly, in shillings and cents', () => {
    expect(formatAmount(1724815)).toBe('17,248.15');
    expect(formatAmount(5)).toBe('0.05');
    expect(formatAmount(100000000000)).toBe('1,000,000,000.00');
    expect(formatAmount(-250000)).toBe('-2,500.00');
  });
});
