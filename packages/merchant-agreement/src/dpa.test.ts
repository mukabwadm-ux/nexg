import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { DPA_TEXT_SHA256, DPA_VERSION, dpaText } from '@nexg/contracts/merchant-dpa';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { buildDpa, dpaFillValues, type DpaFill } from './dpa';
import { SAMPLE_LETTERHEAD, TINY_PNG } from './fixtures';
import { renderSignedDpa } from './index';
import { renderAgreementPdf } from './pdf';

/* An invented merchant, never a real one. */
function sampleDpaFill(signer = true): DpaFill {
  return {
    acceptedAt: new Date('2026-11-25T07:42:00Z'),
    reference: 'NXG-DPA-SAMPLE000001',
    version: DPA_VERSION,
    merchant: {
      legalName: 'Sample Pharmacy Limited',
      registrationNumber: 'PVT-SAMPLE01',
      kraPin: 'P000000000A',
      address: 'Shop 4, Sample Mall, Ngong Road, Nairobi',
      postalAddress: null,
      email: 'owner@sample.example',
      phone: '+254711000000',
      signatoryName: 'Sample Owner',
      signatoryTitle: 'Director',
    },
    annex: {
      sensitive_data: 'Health data (prescriptions), under Addendum F2.3',
      dpo_name: 'Sample Owner',
      dpo_email: 'owner@sample.example',
      dpo_phone: '+254 711 000 000',
      odpc_registration: null,
    },
    signer: signer ? { name: 'Sample Signatory', title: 'Director' } : null,
    record: {
      accountEmail: 'owner@sample.example',
      ip: '198.51.100.7',
      device: 'Chrome · Windows',
      acceptanceId: '00000000-0000-4000-8000-000000000001',
      textSha256: DPA_TEXT_SHA256,
    },
  };
}

const text = (doc: ReturnType<typeof buildDpa>) =>
  doc.blocks
    .flatMap((b) =>
      b.kind === 'p'
        ? [b.runs.map((r) => r.text).join('')]
        : b.kind === 'table'
          ? b.rows.flat(2).map((p) => p.runs.map((r) => r.text).join(''))
          : b.kind === 'dpa-execution'
            ? [...b.parties.flatMap((p) => [p.heading, ...p.rows.flat()]), ...b.record.flat()]
            : [],
    )
    .join('\n');

describe('Data Processing Agreement PDF', () => {
  it('fills every blank with the merchant’s details', () => {
    const fill = sampleDpaFill();
    const values = dpaFillValues(fill);
    expect(values.cover_date).toBe('DATED THE 25TH DAY OF NOVEMBER 2026');
    expect(values.dpo_contact).toBe('Sample Owner, owner@sample.example, +254 711 000 000');
    expect(values.odpc_registration).toBe('Not applicable');
    const filled = text(buildDpa(fill));
    expect(filled).not.toMatch(/\[Vendor|\{\{|………/);
    expect(filled).toContain('and Sample Pharmacy Limited (the “Processor”');
    expect(filled).toContain('For Sample Pharmacy Limited (Processor):');
    expect(filled).toContain('P052549908S');
    expect(filled).toContain('Studio House, Marcus Garvey Road');
    expect(filled).toContain('198.51.100.7');
    // The filled wording is the published wording with the blanks filled.
    expect(dpaText(values)).toContain('Sample Pharmacy Limited');
  });

  it('keeps the blanks when published unfilled', () => {
    const blank = text(buildDpa());
    expect(blank).toContain('[Vendor/Merchant Name]');
    expect(blank).toContain('Witness: ____________________________');
  });

  it('renders a filled, signed copy on the letterhead', async () => {
    const signed = await renderSignedDpa(sampleDpaFill(), {
      letterhead: SAMPLE_LETTERHEAD,
      signature: { bytes: TINY_PNG, type: 'png' },
    });
    expect(signed.sha256).toBe(createHash('sha256').update(signed.bytes).digest('hex'));
    const pdf = await PDFDocument.load(signed.bytes);
    expect(pdf.getPageCount()).toBe(signed.pages);
    expect(signed.pages).toBeGreaterThanOrEqual(4);
    expect(signed.pages).toBeLessThanOrEqual(10);
    expect(pdf.getTitle()).toBe('NexG Data Processing Agreement');
    if (process.env.DPA_SAMPLE_PDF) writeFileSync(process.env.DPA_SAMPLE_PDF, signed.bytes);
  }, 30_000);

  it('renders without NexG’s signatory, and the same bytes twice', async () => {
    const render = () =>
      renderSignedDpa(sampleDpaFill(false), {
        letterhead: { ...SAMPLE_LETTERHEAD, poBox: '' },
        signature: null,
      });
    const [a, b] = await Promise.all([render(), render()]);
    expect(a.sha256).toBe(b.sha256);
    const blank = await renderAgreementPdf(buildDpa(), { version: DPA_VERSION });
    expect(blank.pages).toBeGreaterThanOrEqual(4);
  }, 30_000);
});
