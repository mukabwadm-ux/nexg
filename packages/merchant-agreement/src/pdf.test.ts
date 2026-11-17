import { createHash } from 'node:crypto';

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { SAMPLE_LETTERHEAD, TINY_PNG, sampleFill } from './fixtures';
import { TEMPLATE_VERSION, renderSignedAgreement } from './index';
import { buildAgreement } from './document';
import { renderAgreementPdf } from './pdf';

describe('signed agreement PDF', () => {
  it('renders a signed, filled agreement on the letterhead', async () => {
    const fill = sampleFill();
    const signed = await renderSignedAgreement(fill, {
      letterhead: SAMPLE_LETTERHEAD,
      signature: { bytes: TINY_PNG, type: 'png' },
    });
    expect(signed.sha256).toBe(createHash('sha256').update(signed.bytes).digest('hex'));
    const pdf = await PDFDocument.load(signed.bytes);
    expect(pdf.getPageCount()).toBe(signed.pages);
    expect(signed.pages).toBeGreaterThanOrEqual(10);
    expect(signed.pages).toBeLessThanOrEqual(24);
    expect(pdf.getTitle()).toBe('NexG Merchant Agreement – Beauty');
    expect(pdf.getAuthor()).toBe('NexGenius Concierge Limited');
    expect(pdf.getKeywords()).toContain(TEMPLATE_VERSION);
    // A4.
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
  }, 30_000);

  it('gives the same bytes for the same agreement, details and time', async () => {
    const render = () =>
      renderSignedAgreement(sampleFill(), {
        letterhead: SAMPLE_LETTERHEAD,
        signature: { bytes: TINY_PNG, type: 'png' },
      });
    const [a, b] = await Promise.all([render(), render()]);
    expect(a.sha256).toBe(b.sha256);
  }, 30_000);

  it('renders every agreement, blank and filled', async () => {
    for (const id of [
      'airport-transfers',
      'alcohol-and-beverages',
      'groceries',
      'logistics-and-shipping',
    ]) {
      const blank = await renderAgreementPdf(buildAgreement(id), { version: 'test' });
      expect(blank.pages, id).toBeGreaterThanOrEqual(10);
      const fill = {
        ...sampleFill(id, 'test'),
        merchant: { ...sampleFill().merchant, legalName: 'Łódź Žabka & Söhne – “Ltd”' },
      };
      const filled = await renderAgreementPdf(buildAgreement(id, fill), {
        version: 'test',
        letterhead: SAMPLE_LETTERHEAD,
        signature: { bytes: TINY_PNG, type: 'png' },
      });
      expect(filled.pages, id).toBeGreaterThanOrEqual(10);
    }
  }, 60_000);
});
