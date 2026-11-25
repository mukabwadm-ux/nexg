import { verifyUrl, type DocumentCompany } from './company';
import type { IconName } from './icons';
import {
  C,
  LEFT,
  RIGHT,
  WIDTH,
  dayRange,
  drawCorporateLine,
  drawFootBar,
  drawHeader,
  drawQrTile,
  drawVerifyLine,
  drawWatermark,
  finish,
  kes,
  money,
  newBook,
  type Canvas,
  type RenderedDocument,
} from './kit';

/**
 * The branded settlement statement, after the owner's mockup: "MERCHANT
 * SETTLEMENT" with its reference, who is paid and for which period, four
 * cards (gross sales, orders, NexG commission, net settlement), the
 * calculation in a black-headed table closing on the net payout, and how
 * it was paid with the QR code that verifies it.
 */

export interface SettlementDocument {
  reference: string;
  checkCode?: string | null;
  /** YYYY-MM-DD. */
  issueDate: string;
  /** "merchant", "host", "rider"…: names the statement. */
  partyType: string;
  partyName: string;
  /** Printed as "Merchant ID: …". */
  partyCode: string;
  periodFrom: string;
  periodTo: string;
  grossCents: number;
  /** Orders the settlement pays for; null when not known. */
  orders: number | null;
  /** NexG's commission including its VAT, and that VAT. */
  commissionCents: number;
  commissionVatCents: number;
  adjustmentCents: number;
  netCents: number;
  payoutMethod: string;
  settlementReference: string;
  status: string;
  company: DocumentCompany;
  createdAt?: Date;
}

const PARTY_TITLES: Record<string, string> = {
  merchant: 'Merchant',
  host: 'Host',
  hotel: 'Hotel',
  rider: 'Rider',
  experience_partner: 'Partner',
  provider: 'Provider',
};

function partyTitle(type: string): string {
  return PARTY_TITLES[type] ?? 'Partner';
}

function drawCards(c: Canvas, doc: SettlementDocument) {
  const top = 340;
  const h = 124;
  const cards: {
    x: number;
    w: number;
    icon: IconName;
    label: string[];
    value: string;
    gold?: boolean;
    badge?: boolean;
  }[] = [
    { x: LEFT - 2, w: 143, icon: 'coins', label: ['Gross sales'], value: kes(doc.grossCents) },
    {
      x: 168,
      w: 124,
      icon: 'cart',
      label: ['Completed', 'orders'],
      value: doc.orders == null ? '–' : doc.orders.toLocaleString('en-US'),
    },
    {
      x: 299,
      w: 134,
      icon: 'percent',
      label: ['NEXG', 'commission'],
      value: kes(doc.commissionCents),
      badge: true,
    },
    {
      x: 439,
      w: RIGHT + 3 - 439,
      icon: 'transfer',
      label: ['Net', 'settlement'],
      value: kes(doc.netCents),
      gold: true,
    },
  ];
  for (const card of cards) {
    if (card.gold) c.gradientBox(card.x, top, card.w, h, 12, C.gold, C.goldDeep);
    else c.box(card.x, top, card.w, h, { fill: C.cream, radius: 12 });
    const ix = card.x + 13;
    if (card.gold) {
      c.circle(ix + 16, top + 26, 16, C.goldDeep);
      c.icon(card.icon, ix + 5, top + 15, 22, C.white, 2.2);
    } else if (card.badge) {
      c.circle(ix + 16, top + 26, 16, C.gold);
      c.icon(card.icon, ix + 5, top + 15, 22, C.white, 2.6);
    } else {
      c.icon(card.icon, ix, top + 10, 32, C.goldText, 1.8);
    }
    const color = card.gold ? C.white : C.ink;
    card.label.forEach((line, i) =>
      c.text(line, ix, top + (card.label.length === 1 ? 59 : 51) + i * 16, {
        size: 13,
        weight: card.gold ? 'bold' : 'regular',
        color,
      }),
    );
    c.text(card.value, ix, top + 99, { size: 19, weight: 'bold', color, maxWidth: card.w - 24 });
    c.rect(ix, top + 109, 56, 2.6, card.gold ? C.white : C.gold);
  }
}

function drawTable(c: Canvas, doc: SettlementDocument) {
  const top = 486;
  const headH = 31;
  c.box(LEFT + 1, top, WIDTH - 2, headH, {
    fill: C.black,
    radius: 10,
    corners: [true, true, false, false],
  });
  c.text('Description', 43, top + 20.5, { size: 13, weight: 'bold', color: C.white });
  c.text('Amount (KES)', 553, top + 20.5, {
    size: 13,
    weight: 'bold',
    color: C.white,
    align: 'right',
  });

  const rows: [string, number][] = [
    [`Gross ${partyTitle(doc.partyType).toLowerCase()} sales`, doc.grossCents],
    ['Commission excluding VAT', -(doc.commissionCents - doc.commissionVatCents)],
    ['VAT on commission', -doc.commissionVatCents],
    ['Other adjustments', doc.adjustmentCents],
  ];
  let y = top + headH;
  const rowH = 25.5;
  for (const [label, cents] of rows) {
    c.text(label, 43, y + 17, { size: 12.5 });
    c.text(money(cents), 553, y + 17, { size: 12.5, align: 'right' });
    y += rowH;
    c.line(LEFT + 1, y, RIGHT - 1, y, C.rule, 0.8);
  }
  const barH = 40;
  c.box(LEFT + 1, y, WIDTH - 2, barH, {
    fill: C.creamDeep,
    radius: 10,
    corners: [false, false, true, true],
  });
  c.text('Net payout', 43, y + 26, { size: 15, weight: 'bold' });
  const amount = kes(doc.netCents);
  const pillW = Math.max(140, c.width(amount, 17, 'bold') + 26);
  c.gradientBox(562 - pillW, y + 5, pillW, 30, 7, C.gold, C.goldDeep);
  c.text(amount, 562 - pillW / 2, y + 26, {
    size: 17,
    weight: 'bold',
    color: C.white,
    align: 'center',
  });
  c.box(LEFT + 1, top, WIDTH - 2, y + barH - top, { border: C.rule, borderWidth: 0.9, radius: 10 });
}

function drawPayout(c: Canvas, doc: SettlementDocument) {
  const top = 684;
  const h = 86;
  c.box(LEFT + 1, top, 408, h, { fill: C.panel, radius: 12 });
  c.icon('bank', 52, top + 20, 46, C.goldText, 1.9);
  c.line(122, top + 14, 122, top + h - 14, C.gold, 1.6);
  const room = 352 - 137;
  c.labelled('Payout method:', doc.payoutMethod, 137, top + 24, 11.5, room);
  c.labelled('Settlement reference:', doc.settlementReference, 137, top + 47, 11.5, room);
  c.labelled('Status:', doc.status, 137, top + 70, 11.5, room);
  drawQrTile(c, verifyUrl(doc.reference, doc.checkCode), 360, top + 12, 52);
}

export async function renderSettlement(doc: SettlementDocument): Promise<RenderedDocument> {
  const book = await newBook();
  const c = book.addPage();
  drawHeader(c, doc.company);

  const title = `${partyTitle(doc.partyType).toUpperCase()} SETTLEMENT`;
  c.text(title, 36, 197, { size: 33, weight: 'bold', maxWidth: 440 });
  const lw = c.text('Reference: ', 38, 219, { size: 13 });
  c.text(doc.reference, 38 + lw, 219, { size: 13, weight: 'bold' });
  c.icon('coins', 482, 186, 34, C.gold, 2);
  c.icon('chart', 516, 170, 42, C.gold, 2.4);

  /* Who is paid, and for which period. */
  c.box(30, 247, 86, 72, { fill: C.cream, radius: 12 });
  c.icon('store', 52, 262, 42, C.goldText, 1.9);
  c.line(131, 249, 131, 312, C.gold, 1.6);
  c.text(doc.partyName, 147, 265, { size: 19, weight: 'bold', maxWidth: RIGHT - 150 });
  c.text(`${partyTitle(doc.partyType)} ID: ${doc.partyCode}`, 147, 285, { size: 13 });
  c.icon('calendar', 147, 293, 16, C.goldText, 2);
  c.text(`Settlement period: ${dayRange(doc.periodFrom, doc.periodTo)}`, 172, 306, {
    size: 12.5,
    maxWidth: RIGHT - 175,
  });

  drawCards(c, doc);
  drawTable(c, doc);
  drawPayout(c, doc);
  drawWatermark(c, 450, 676, 122);

  drawVerifyLine(c, 'Computer-generated settlement statement', doc.reference, 789);
  drawCorporateLine(c, doc.company, 803.5);
  drawFootBar(c, 813);

  return finish(book, {
    title: `${partyTitle(doc.partyType)} Settlement ${doc.reference}`,
    subject: `Settlement statement ${doc.reference} for ${doc.partyName}`,
    reference: doc.reference,
    createdAt: doc.createdAt ?? new Date(`${doc.issueDate.slice(0, 10)}T09:00:00Z`),
    company: doc.company,
  });
}
