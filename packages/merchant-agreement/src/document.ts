import {
  isField,
  type Block,
  type Paragraph,
  type Run,
  type Table,
  type TableRole,
} from './template';
import { TEMPLATE } from './template.generated';

/**
 * One merchant agreement, expanded from the shared template and filled in:
 * the clause numbers Word printed, the blanks replaced by the merchant's and
 * NexG's details, and (when filled) the execution table replaced by the
 * electronic signature and acceptance record.
 */

export interface MerchantParty {
  /** Registered name, as on the registration certificate. */
  legalName: string;
  registrationNumber: string;
  kraPin: string;
  /** Physical business address. */
  address: string;
  /** P.O. Box, when the business has one; notices go to the address otherwise. */
  postalAddress?: string | null;
  email: string;
  phone: string;
  signatoryName: string;
  signatoryTitle: string;
  /** Designated representative for disputes (Stage 1). */
  representativeName: string;
  representativeTitle: string;
  /** Owner, managing director or principal (Stage 2). */
  principalName: string;
}

export interface CompanyParty {
  /** "12345-00100", printed as "P.O. Box 12345-00100, Nairobi, Kenya". */
  poBox: string;
  email: string;
  phone: string;
  registeredOffice: string;
  website: string;
  signatoryName: string;
  signatoryTitle: string;
  representativeName: string;
  representativeTitle: string;
}

export interface AcceptanceRecord {
  /** Who ticked the box, as the merchant named its signatory. */
  name: string;
  title: string;
  acceptedAt: Date;
  /** The account the box was ticked from. */
  accountEmail: string;
  version: string;
  /** The acceptance's id in the database. */
  reference: string;
  /** The category named in the box the merchant ticked, e.g. "Beauty & Personal Care". */
  categoryName?: string;
}

export interface AgreementFill {
  agreementId: string;
  version: string;
  /** When NexG signed: the agreement's date. */
  issuedAt: Date;
  /** Printed in the footer, e.g. NXG-MA-1A2B3C4D. */
  reference: string;
  merchant: MerchantParty;
  company: CompanyParty;
  commissionPct: number;
  inRoomCommissionPct: number;
  settlementCycle: 'weekly' | 'biweekly';
  acceptance: AcceptanceRecord;
}

export interface ResolvedRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface ResolvedParagraph {
  kind: 'p';
  heading: boolean;
  /** The number or bullet Word printed before the text, if any. */
  label: string | null;
  /** Where the label starts, in points from the left margin. */
  labelAt: number;
  /** Where the text starts (every line), in points from the left margin. */
  textAt: number;
  align: 'left' | 'center' | 'justify' | 'right';
  pageBreak: boolean;
  runs: ResolvedRun[];
}

export interface ResolvedTable {
  kind: 'table';
  role: TableRole;
  /** Relative column widths. */
  cols: number[];
  rows: ResolvedParagraph[][][];
}

export interface ExecutionBlock {
  kind: 'execution';
  company: { name: string; signatoryName: string; signatoryTitle: string; signedAt: Date };
  merchant: { signatoryName: string; signatoryTitle: string };
  acceptance: AcceptanceRecord & { category: string };
}

export type ResolvedBlock = ResolvedParagraph | ResolvedTable | ExecutionBlock;

export interface AgreementDocument {
  agreementId: string;
  title: string;
  blocks: ResolvedBlock[];
}

/** The agreements the template knows, by id. */
export const TEMPLATE_AGREEMENTS: readonly string[] = Object.keys(TEMPLATE.categories);

export function agreementTitle(agreementId: string): string {
  const category = TEMPLATE.categories[agreementId];
  if (!category) throw new Error(`No template for agreement ${agreementId}`);
  return category.title;
}

/** The agreement's blocks, with this agreement's variant in every slot. */
export function expandTemplate(agreementId: string): (Paragraph | Table)[] {
  const category = TEMPLATE.categories[agreementId];
  if (!category) throw new Error(`No template for agreement ${agreementId}`);
  return TEMPLATE.body.flatMap((block: Block) => {
    if (block.k !== 'slot') return [block];
    const variant = TEMPLATE.slots[block.id]?.[category.pick[block.id] ?? -1];
    if (!variant) throw new Error(`Agreement ${agreementId} has no variant for slot ${block.id}`);
    return variant;
  });
}

/** The value of every field as the published PDF prints it: the blanks. */
export function blankValues(agreementId: string): Record<string, string> {
  const title = agreementTitle(agreementId);
  return { ...TEMPLATE.blanks, category: title, CATEGORY: title.toUpperCase() };
}

const NAIROBI = 'Africa/Nairobi';

function dateParts(at: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: NAIROBI,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: Number(get('day')), month: get('month'), year: get('year') };
}

export function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${{ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th'}`;
}

/** "17 November 2026 at 10:42 EAT". */
export function formatNairobi(at: Date, withTime = true): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: NAIROBI,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(at);
  if (!withTime) return date;
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: NAIROBI,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
  return `${date} at ${time} EAT`;
}

/** 14 → "14", 12.5 → "12.5". */
export function formatPct(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 100)
    throw new Error(`Bad percentage ${value}`);
  return String(Math.round(value * 100) / 100);
}

/** +254712345678 → "+254 712 345 678"; anything else as given. */
export function formatPhone(phone: string): string {
  const m = phone.replace(/\s+/g, '').match(/^\+254(\d{3})(\d{3})(\d{3})$/);
  return m ? `+254 ${m[1]} ${m[2]} ${m[3]}` : phone.trim();
}

/** The value of every field for a filled-in agreement. */
export function fillValues(fill: AgreementFill): Record<string, string> {
  const title = agreementTitle(fill.agreementId);
  const { day, month, year } = dateParts(fill.issuedAt);
  const m = fill.merchant;
  const c = fill.company;
  return {
    category: title,
    CATEGORY: title.toUpperCase(),
    cover_day: ordinal(day).toUpperCase(),
    cover_month_year: `${month} ${year}`.toUpperCase(),
    made_day: ordinal(day),
    made_month_year: `${month}, ${year}`,
    merchant_cover: m.legalName.toUpperCase(),
    company_po_box: c.poBox,
    merchant_name: m.legalName,
    merchant_registration: m.registrationNumber,
    merchant_address: m.address,
    merchant_kra_pin: m.kraPin,
    commission_pct: formatPct(fill.commissionPct),
    in_room_pct: formatPct(fill.inRoomCommissionPct),
    weekly_box: fill.settlementCycle === 'weekly' ? '☒' : '☐',
    biweekly_box: fill.settlementCycle === 'biweekly' ? '☒' : '☐',
    merchant_party: m.legalName,
    merchant_postal: m.postalAddress?.trim() || m.address,
    company_email: c.email,
    merchant_email: m.email,
    company_phone: formatPhone(c.phone),
    merchant_phone: formatPhone(m.phone),
    company_rep_name: c.representativeName,
    company_rep_title: c.representativeTitle,
    merchant_rep_name: m.representativeName,
    merchant_rep_title: m.representativeTitle,
    merchant_principal: m.principalName,
  };
}

function resolveRuns(runs: Run[], values: Record<string, string>): ResolvedRun[] {
  return runs.map((run) => {
    let text: string;
    if (isField(run)) {
      const value = values[run.f];
      if (value === undefined) throw new Error(`No value for field ${run.f}`);
      text = value;
    } else text = run.t;
    return { text, bold: Boolean(run.b), italic: Boolean(run.i), underline: Boolean(run.u) };
  });
}

const TWIP = 1 / 20;

/** Word's numbering for list 2 (1. / 1.1 / (a)) and list 3 (bullets). */
class Numbering {
  private level = [0, 0, 0];

  label(n: Paragraph['n']): { label: string; labelAt: number; textAt: number } | null {
    if (n === undefined) return null;
    if (n === 'b') return { label: '•', labelAt: 18, textAt: 36 };
    if (n === 0) {
      this.level = [this.level[0]! + 1, 0, 0];
      return { label: `${this.level[0]}.`, labelAt: 0, textAt: 36 };
    }
    if (n === 1) {
      this.level = [this.level[0]!, this.level[1]! + 1, 0];
      return { label: `${this.level[0]}.${this.level[1]}`, labelAt: 0, textAt: 36 };
    }
    this.level = [this.level[0]!, this.level[1]!, this.level[2]! + 1];
    return { label: `(${String.fromCharCode(96 + this.level[2]!)})`, labelAt: 36, textAt: 72 };
  }
}

function resolveParagraph(
  p: Paragraph,
  values: Record<string, string>,
  numbering: Numbering | null,
): ResolvedParagraph {
  let runs = resolveRuns(p.r, values);
  let label: string | null = null;
  let labelAt = 0;
  let textAt = 0;
  const numbered = numbering?.label(p.n) ?? null;
  if (numbered) ({ label, labelAt, textAt } = numbered);
  else if (p.il !== undefined) {
    textAt = p.il * TWIP;
    labelAt = textAt - (p.ih ?? 0) * TWIP;
    // "(A)<tab>The Company…": a hanging label typed into the text.
    const first = runs[0];
    if (p.ih && first && first.text.includes('\t')) {
      const [head, ...rest] = first.text.split('\t');
      label = head ?? '';
      runs = [{ ...first, text: rest.join('\t') }, ...runs.slice(1)];
    }
  }
  return {
    kind: 'p',
    heading: p.s === 'h1',
    label,
    labelAt,
    textAt,
    align: p.a === 'c' ? 'center' : p.a === 'j' ? 'justify' : p.a === 'r' ? 'right' : 'left',
    pageBreak: Boolean(p.pb),
    runs,
  };
}

function resolveTable(t: Table, values: Record<string, string>): ResolvedTable {
  return {
    kind: 'table',
    role: t.role,
    cols: t.cols,
    rows: t.rows.map((cells) =>
      cells.map((paragraphs) => paragraphs.map((p) => resolveParagraph(p, values, null))),
    ),
  };
}

/**
 * The agreement as published (blanks) when no fill is given, or filled in
 * and executed electronically when it is.
 */
export function buildAgreement(agreementId: string, fill?: AgreementFill): AgreementDocument {
  if (fill && fill.agreementId !== agreementId) throw new Error('Fill is for another agreement.');
  const title = agreementTitle(agreementId);
  const values = fill ? fillValues(fill) : blankValues(agreementId);
  const numbering = new Numbering();
  const blocks: ResolvedBlock[] = expandTemplate(agreementId).map((block) => {
    if (block.k === 'p') return resolveParagraph(block, values, numbering);
    if (block.role === 'execution' && fill)
      return {
        kind: 'execution',
        company: {
          name: 'NEXGENIUS CONCIERGE LIMITED',
          signatoryName: fill.company.signatoryName,
          signatoryTitle: fill.company.signatoryTitle,
          signedAt: fill.issuedAt,
        },
        merchant: {
          signatoryName: fill.merchant.signatoryName,
          signatoryTitle: fill.merchant.signatoryTitle,
        },
        acceptance: { ...fill.acceptance, category: title },
      };
    return resolveTable(block, values);
  });
  return { agreementId, title, blocks };
}

/**
 * The canonical text of an agreement's template with the given field
 * values: one line per paragraph, table cells in reading order, no clause
 * numbers. With blankValues() it is the original's text, which
 * template.generated.ts records as sourceSha256. Must match plainText() in
 * scripts/merchant-agreements/build-template.mjs.
 */
export function templateText(agreementId: string, values = blankValues(agreementId)): string {
  const line = (p: Paragraph) => p.r.map((r) => (isField(r) ? (values[r.f] ?? '') : r.t)).join('');
  const lines: string[] = [];
  for (const block of expandTemplate(agreementId)) {
    if (block.k === 'p') lines.push(line(block));
    else
      for (const row of block.rows)
        for (const cell of row) for (const p of cell) lines.push(line(p));
  }
  return lines.join('\n');
}

/** Every field the template uses, with its blank. */
export const AGREEMENT_FIELDS: Readonly<Record<string, string>> = TEMPLATE.blanks;

export function sourceSha256(agreementId: string): string {
  const category = TEMPLATE.categories[agreementId];
  if (!category) throw new Error(`No template for agreement ${agreementId}`);
  return category.sourceSha256;
}
