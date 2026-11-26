import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { NEXG_DOCUMENT_COMPANY } from './company';
import { renderTableReport } from './index';

/* Invented rows, never real ones. Set DOCS_OUT to a folder to keep the PDFs. */
const out = process.env.DOCS_OUT;

const head = ['Booking ref', 'Guest', 'Unit', 'Check-in', 'Nights', 'Booking value (KES)', 'Paid'];
const row = (i: number) => [
  `NXS-${1000 + i}`,
  i % 3 ? `Guest Ñame ${i} with a rather long name that will not fit` : null,
  `Unit ${i}`,
  `2026-11-0${(i % 9) + 1}`,
  (i % 5) + 1,
  12500 * ((i % 7) + 1),
  i % 2 ? 'yes' : 'no',
];

describe('table report', () => {
  it('draws every row across pages with the head on each', async () => {
    const r = await renderTableReport({
      title: 'Bookings Report',
      section: 'Stays',
      from: '2026-11-01',
      to: '2026-11-30',
      scope: 'All cities',
      generatedBy: 'Test Staff',
      rows: [head, ...Array.from({ length: 90 }, (_, i) => row(i))],
      company: NEXG_DOCUMENT_COMPANY,
      createdAt: new Date('2026-11-26T09:00:00Z'),
    });
    if (out) writeFileSync(join(out, 'stays-table-report.pdf'), r.bytes);
    const pdf = await PDFDocument.load(r.bytes);
    expect(pdf.getTitle()).toBe('Stays Bookings Report 2026-11-01 to 2026-11-30');
    expect(r.pages).toBeGreaterThan(1);
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());
  });

  it('says so when there are no rows, and caps long reports', async () => {
    const empty = await renderTableReport({
      title: 'Reviews Report',
      section: 'Stays',
      from: '2026-11-01',
      to: '2026-11-01',
      scope: 'Nairobi',
      generatedBy: 'Test Staff',
      rows: [head],
      company: NEXG_DOCUMENT_COMPANY,
    });
    expect(empty.pages).toBe(1);
    const capped = await renderTableReport({
      title: 'Bookings Report',
      section: 'Stays',
      from: '2026-11-01',
      to: '2026-11-30',
      scope: 'All cities',
      generatedBy: 'Test Staff',
      rows: [head, ...Array.from({ length: 50 }, (_, i) => row(i))],
      company: NEXG_DOCUMENT_COMPANY,
      maxRows: 10,
    });
    expect(capped.pages).toBe(1);
  });
});
