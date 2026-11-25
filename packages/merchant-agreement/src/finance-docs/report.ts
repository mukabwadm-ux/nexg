import type { DocumentCompany } from './company';
import type { IconName } from './icons';
import {
  C,
  LEFT,
  PAGE_W,
  RIGHT,
  WIDTH,
  day,
  drawFootBar,
  drawHeader,
  drawTab,
  drawWatermark,
  finish,
  moneyShort,
  monthName,
  newBook,
  phoneText,
  type Canvas,
  type RenderedDocument,
} from './kit';

/**
 * The branded monthly financial report, after the owner's mockup:
 * "FINANCIAL REPORT" with its reference and a confidential tag, four cards
 * (transaction value, NexG revenue, operating expenses, operating profit),
 * revenue by source as bars, the profit summary, and who prepared and
 * approved it.
 */

export interface ReportLine {
  label: string;
  icon: IconName;
  cents: number;
}

export interface ReportDocument {
  reference: string;
  /** YYYY-MM. */
  month: string;
  /** YYYY-MM-DD. */
  issueDate: string;
  gtvCents: number;
  revenueCents: number;
  expensesCents: number;
  /** Revenue by source, largest first; the bars follow the largest. */
  lines: ReportLine[];
  company: DocumentCompany;
  createdAt?: Date;
}

const CENTER = PAGE_W / 2;
const MAX_LINES = 6;

function drawCards(c: Canvas, doc: ReportDocument) {
  const top = 288;
  const h = 86;
  const profit = doc.revenueCents - doc.expensesCents;
  const cards: {
    x: number;
    w: number;
    icon: IconName;
    label: string[];
    cents: number;
    last?: boolean;
  }[] = [
    { x: 21, w: 143, icon: 'coins', label: ['Gross transaction', 'value'], cents: doc.gtvCents },
    { x: 173, w: 125, icon: 'trending', label: ['Net NEXG', 'revenue'], cents: doc.revenueCents },
    { x: 308, w: 126, icon: 'layers', label: ['Operating', 'expenses'], cents: doc.expensesCents },
    {
      x: 443,
      w: RIGHT + 1 - 443,
      icon: 'chart',
      label: ['Operating', 'profit'],
      cents: profit,
      last: true,
    },
  ];
  for (const card of cards) {
    if (card.last) {
      c.gradientBox(card.x, top, card.w, h, 9, C.cream, C.goldLight);
      c.box(card.x, top, card.w, h, { border: C.gold, borderWidth: 1.2, radius: 9 });
    } else {
      c.box(card.x, top, card.w, h, {
        fill: C.cream,
        border: C.creamLine,
        borderWidth: 0.9,
        radius: 9,
      });
    }
    c.icon(card.icon, card.x + 14, top + 13, 22, C.goldText, 1.9);
    card.label.forEach((line, i) =>
      c.text(line, card.x + 44, top + 23 + i * 13, { size: 10.5, maxWidth: card.w - 50 }),
    );
    c.text(moneyShort(card.cents), card.x + 15, top + 70, {
      size: 21,
      weight: 'bold',
      maxWidth: card.w - 26,
    });
  }
}

function drawRevenue(c: Canvas, doc: ReportDocument): number {
  drawTab(c, LEFT + 2, 393, 20);
  c.text('Revenue by source', 43, 409.5, { size: 19, weight: 'bold' });
  c.line(LEFT, 421, RIGHT, 421, C.gold, 0.9);

  let shown = doc.lines.filter((l) => l.cents !== 0);
  if (shown.length > MAX_LINES) {
    const rest = shown.slice(MAX_LINES - 1).reduce((s, l) => s + l.cents, 0);
    shown = [
      ...shown.slice(0, MAX_LINES - 1),
      { label: 'Other services', icon: 'grid', cents: rest },
    ];
  }
  const max = Math.max(1, ...shown.map((l) => Math.abs(l.cents)));
  let y = 431;
  if (!shown.length) {
    c.text('No revenue was recorded this month.', 43, y + 20, { size: 12, color: C.muted });
    y += 32;
  }
  for (const line of shown) {
    c.box(27, y, 30, 26, { fill: C.cream, radius: 6 });
    c.icon(line.icon, 32, y + 3, 20, C.goldText, 1.9);
    c.text(line.label, 70, y + 18, { size: 12.5, maxWidth: 118 });
    const trackX = 195;
    const trackW = 303;
    c.box(trackX, y + 8, trackW, 10, { fill: C.track, radius: 5 });
    const w = Math.max(10, (trackW * Math.abs(line.cents)) / max);
    c.gradientBox(trackX, y + 8, w, 10, 5, C.gold, C.goldDeep);
    c.text(moneyShort(line.cents), 567, y + 18, { size: 12.5, align: 'right' });
    y += 30;
  }
  return y + 4;
}

function drawSummary(c: Canvas, doc: ReportDocument, top: number): number {
  const profit = doc.revenueCents - doc.expensesCents;
  c.line(LEFT, top, RIGHT, top, C.gold, 0.9);
  c.text('Net revenue', 38, top + 28, { size: 15 });
  c.text(moneyShort(doc.revenueCents), 557, top + 28, { size: 15, align: 'right' });
  c.line(38, top + 38, 557, top + 38, C.rule, 0.8);
  c.text('Operating expenses', 38, top + 58, { size: 15 });
  c.text(moneyShort(doc.expensesCents), 557, top + 58, { size: 15, align: 'right' });
  const bar = top + 69;
  c.box(LEFT + 1, bar, WIDTH - 2, 36, { fill: C.creamDeep, radius: 8 });
  c.text(profit < 0 ? 'Operating loss before tax' : 'Operating profit before tax', 38, bar + 23.5, {
    size: 16,
    weight: 'bold',
  });
  c.text(moneyShort(profit), 560, bar + 25, { size: 20, weight: 'bold', align: 'right' });
  return bar + 36;
}

function drawSignOff(c: Canvas, top: number) {
  c.line(LEFT, top, RIGHT, top, C.gold, 0.9);
  const y = top + 31;
  c.icon('pencil', 34, y - 18, 24, C.goldText, 1.8);
  c.line(74, y - 18, 74, y + 16, C.gold, 1.6);
  c.text('Prepared by', 89, y - 2, { size: 11 });
  c.text('Finance Department', 89, y + 15, { size: 13, weight: 'bold' });
  c.line(258, y - 18, 258, y + 16, C.rule, 0.8);
  c.icon('user', 294, y - 18, 24, C.goldText, 1.8);
  c.line(333, y - 18, 333, y + 16, C.gold, 1.6);
  c.text('Reviewed and approved by', 348, y - 2, { size: 11 });
  c.line(348, y + 15, 470, y + 15, C.muted, 0.6);
  c.text('Name, signature and date', 348, y + 25, { size: 7.5, color: C.muted });
}

export async function renderReport(doc: ReportDocument): Promise<RenderedDocument> {
  const book = await newBook();
  const c = book.addPage();
  drawHeader(c, doc.company);

  c.text('FINANCIAL REPORT', 24, 181, { size: 31, weight: 'bold' });
  c.text(doc.reference, 24, 201, { size: 14.5, color: C.muted, tracking: 0.6 });
  c.line(350, 166, 350, 201, C.gold, 1.6);
  c.box(368, 167, RIGHT + 1 - 368, 28, {
    fill: C.cream,
    border: C.creamLine,
    borderWidth: 0.8,
    radius: 7,
  });
  c.icon('lock', 382, 173, 16, C.goldText, 2.2);
  c.text('Confidential  •  Management use', 404, 185.5, { size: 11.5, maxWidth: RIGHT - 410 });

  drawTab(c, LEFT + 2, 233, 28);
  c.text('Monthly financial performance', 51, 249, { size: 21, weight: 'bold' });
  c.text(`${monthName(doc.month)}  •  KES  •  Issued ${day(doc.issueDate, true)}`, 51, 265, {
    size: 12,
    color: C.muted,
  });

  drawCards(c, doc);
  const end = drawRevenue(c, doc);
  const summaryEnd = drawSummary(c, doc, Math.max(end + 4, 580));
  drawSignOff(c, Math.min(summaryEnd + 18, 728));
  drawWatermark(c, 492, 716, 92);

  drawFootBar(c, 788, 10);
  c.text('NEXG FINANCE  •  CONFIDENTIAL  •  PAGE 1 OF 1', CENTER, 816, {
    size: 10,
    weight: 'bold',
    tracking: 1.6,
    align: 'center',
  });
  const company = doc.company;
  c.text(
    `${company.legalName}  ·  KRA PIN ${company.kraPin}  ·  ${company.email}  ·  ${phoneText(company)}  ·  Verify at nexgapp.com/verify/${doc.reference}`,
    CENTER,
    830,
    { size: 6.6, color: C.muted, align: 'center', maxWidth: WIDTH },
  );

  return finish(book, {
    title: `Financial Report ${doc.reference}`,
    subject: `Monthly financial report for ${monthName(doc.month)}`,
    reference: doc.reference,
    createdAt: doc.createdAt ?? new Date(`${doc.issueDate.slice(0, 10)}T09:00:00Z`),
    company,
  });
}
