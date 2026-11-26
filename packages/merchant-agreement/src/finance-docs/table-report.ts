import { createHash } from 'node:crypto';

import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

import { drawString, printable, widthOf, type Fonts } from '../pdf';
import { DOC_LOGO_PNG_BASE64 } from './assets.generated';
import type { DocumentCompany } from './company';
import { C, dayRange, type RenderedDocument } from './kit';

/**
 * A report table as a branded PDF: the same rows a spreadsheet export has,
 * on landscape A4 in the house look (the logo and a gold rule at the top, a
 * black table head, zebra rows, the gold foot rule with the page count).
 * For console reports such as Stays › Reports; the finance documents keep
 * their own layouts.
 */

export type TableCell = string | number | null | undefined;

export interface TableReportDocument {
  /** "Bookings Report". */
  title: string;
  /** The section it comes from, printed above the title: "Stays". */
  section: string;
  /** YYYY-MM-DD. */
  from: string;
  /** YYYY-MM-DD. */
  to: string;
  /** "All cities", "Nairobi". */
  scope: string;
  /** Who printed it. */
  generatedBy: string;
  /** The first row is the head. */
  rows: TableCell[][];
  company: DocumentCompany;
  createdAt?: Date;
  /** At most this many body rows are drawn; the rest are counted in a note. */
  maxRows?: number;
}

const W = 841.89;
const H = 595.28;
const M = 24;
const TOP = 96;
const FOOT = H - 34;
const SIZE = 7;
const HEAD_SIZE = 6.8;
const ROW_H = 13;
const PAD = 3;

function cellText(value: TableCell): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? value.toLocaleString('en-US')
      : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return String(value).replace(/\s+/g, ' ').trim() || '—';
}

/** Text cut to a width with an ellipsis. */
function fit(text: string, font: PDFFont, size: number, room: number): string {
  const shown = printable(text, font);
  if (widthOf(font, shown, size) <= room) return shown;
  const chars = [...shown];
  while (chars.length > 1 && widthOf(font, chars.join('') + '…', size) > room) chars.pop();
  return chars.join('') + '…';
}

/** Column widths from the head and the first rows, scaled to the page. */
function widths(fonts: Fonts, rows: TableCell[][], room: number): number[] {
  const head = rows[0] ?? [];
  const sample = rows.slice(1, 300);
  const natural = head.map((h, i) => {
    let w = Math.min(widthOf(fonts.bold, printable(cellText(h), fonts.bold), HEAD_SIZE), 70);
    for (const r of sample) {
      const t = printable(cellText(r[i]), fonts.regular);
      w = Math.max(w, widthOf(fonts.regular, t, SIZE));
    }
    return Math.min(Math.max(w, 24), 170) + PAD * 2;
  });
  const total = natural.reduce((s, w) => s + w, 0) || 1;
  return natural.map((w) => (w * room) / total);
}

export async function renderTableReport(doc: TableReportDocument): Promise<RenderedDocument> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const logo = await pdf.embedPng(Buffer.from(DOC_LOGO_PNG_BASE64, 'base64'));

  const head = (doc.rows[0] ?? []).map(cellText);
  const all = doc.rows.slice(1);
  const max = doc.maxRows ?? 2000;
  const body = all.slice(0, max);
  const cols = widths(fonts, doc.rows, W - M * 2);
  const numeric = head.map((_, i) =>
    body.some((r) => typeof r[i] === 'number')
      ? body.every((r) => typeof r[i] === 'number' || r[i] == null)
      : false,
  );
  const period = dayRange(doc.from, doc.to);
  const created = doc.createdAt ?? new Date();

  const text = (
    page: PDFPage,
    value: string,
    x: number,
    y: number,
    o: {
      size?: number;
      bold?: boolean;
      color?: typeof C.ink;
      align?: 'left' | 'right' | 'center';
    } = {},
  ) => {
    const font = o.bold ? fonts.bold : fonts.regular;
    const size = o.size ?? SIZE;
    const shown = printable(value, font);
    const w = widthOf(font, shown, size);
    const left = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    drawString(page, shown, { x: left, y: H - y, size, font, color: o.color ?? C.ink });
  };
  const rect = (page: PDFPage, x: number, y: number, w: number, h: number, color: typeof C.ink) =>
    page.drawRectangle({ x, y: H - y - h, width: w, height: h, color });

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const drawHead = () => {
    let x = M;
    rect(page, M, y, W - M * 2, ROW_H + 2, C.black);
    head.forEach((h, i) => {
      const w = cols[i]!;
      const t = fit(h, fonts.bold, HEAD_SIZE, w - PAD * 2);
      if (numeric[i])
        text(page, t, x + w - PAD, y + 9.6, {
          size: HEAD_SIZE,
          bold: true,
          color: C.white,
          align: 'right',
        });
      else text(page, t, x + PAD, y + 9.6, { size: HEAD_SIZE, bold: true, color: C.white });
      x += w;
    });
    y += ROW_H + 2;
  };

  const newPage = () => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    const logoH = 46;
    const logoW = (logo.width / logo.height) * logoH;
    page.drawImage(logo, { x: M, y: H - 18 - logoH, width: logoW, height: logoH });
    text(page, `${doc.section.toUpperCase()}  •  ${doc.title.toUpperCase()}`, W - M, 36, {
      size: 13,
      bold: true,
      align: 'right',
    });
    text(page, `${period}  •  ${doc.scope}  •  KES`, W - M, 52, {
      size: 9,
      color: C.muted,
      align: 'right',
    });
    text(
      page,
      `Generated ${created.toISOString().slice(0, 16).replace('T', ' ')} UTC by ${doc.generatedBy}`,
      W - M,
      65,
      { size: 7.5, color: C.muted, align: 'right' },
    );
    page.drawLine({
      start: { x: M, y: H - 78 },
      end: { x: W - M, y: H - 78 },
      thickness: 1.6,
      color: C.gold,
    });
    y = TOP - 8;
    drawHead();
  };

  newPage();
  if (body.length === 0) {
    text(page, 'No rows for this period.', M + PAD, y + 14, { size: 9, color: C.muted });
  }
  body.forEach((r, ri) => {
    if (y + ROW_H > FOOT - 8) newPage();
    if (ri % 2 === 1) rect(page, M, y, W - M * 2, ROW_H, C.zebra);
    let x = M;
    head.forEach((_, i) => {
      const w = cols[i]!;
      const t = fit(cellText(r[i]), fonts.regular, SIZE, w - PAD * 2);
      if (numeric[i]) text(page, t, x + w - PAD, y + 9, { align: 'right' });
      else text(page, t, x + PAD, y + 9);
      x += w;
    });
    y += ROW_H;
  });
  if (all.length > body.length) {
    if (y + ROW_H > FOOT - 8) newPage();
    text(
      page,
      `Showing the first ${body.length.toLocaleString('en-US')} of ${all.length.toLocaleString('en-US')} rows. The spreadsheet (CSV) export has every row.`,
      M + PAD,
      y + 12,
      { size: 8, bold: true, color: C.goldText },
    );
  }

  const company = doc.company;
  pages.forEach((p, i) => {
    p.drawRectangle({ x: M, y: 30, width: (W - M * 2) * 0.62, height: 4, color: C.gold });
    p.drawRectangle({
      x: M + (W - M * 2) * 0.62 + 4,
      y: 30,
      width: (W - M * 2) * 0.38 - 4,
      height: 4,
      color: C.black,
    });
    text(
      p,
      `${company.legalName}  ·  KRA PIN ${company.kraPin}  ·  ${company.website}  ·  Confidential, for NexG staff`,
      M,
      H - 16,
      { size: 6.6, color: C.muted },
    );
    text(p, `PAGE ${i + 1} OF ${pages.length}`, W - M, H - 16, {
      size: 7,
      bold: true,
      align: 'right',
    });
  });

  pdf.setTitle(`${doc.section} ${doc.title} ${doc.from} to ${doc.to}`);
  pdf.setAuthor(company.legalName);
  pdf.setSubject(`${doc.title}, ${period}, ${doc.scope}`);
  pdf.setCreator('NexG');
  pdf.setProducer('NexG');
  pdf.setCreationDate(created);
  pdf.setModificationDate(created);
  const bytes = await pdf.save();
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    pages: pages.length,
  };
}
