import {
  DPA,
  DPA_BLANKS,
  DPA_TITLE,
  annexValues,
  clauseLabel,
  fillDpaText,
  itemLabel,
  subClauseLabel,
  type DpaField,
  type MerchantDpaAnnex,
} from '@nexg/contracts/merchant-dpa';

import {
  formatNairobi,
  formatPhone,
  ordinal,
  type AgreementDocument,
  type ResolvedBlock,
  type ResolvedParagraph,
  type ResolvedRun,
} from './document';
import { NEXG_DOCUMENT_COMPANY } from './finance-docs/company';
import { COMPANY_NAME, COMPANY_NUMBER } from './pdf';

/**
 * The Data Processing Agreement, laid out for the agreement renderer
 * (renderAgreementPdf): the owner's wording (packages/contracts
 * merchant-dpa.ts) with Word's clause numbers, and, when filled, the
 * merchant's details in its blanks and an execution page that records the
 * electronic acceptance.
 */

export interface DpaFill {
  /** When the merchant accepted: the DPA's date. */
  acceptedAt: Date;
  /** Printed in every footer, e.g. NXG-DPA-1A2B3C4D5E6F. */
  reference: string;
  version: string;
  merchant: {
    legalName: string;
    registrationNumber: string | null;
    kraPin: string;
    address: string;
    postalAddress?: string | null;
    email: string;
    phone: string;
    signatoryName: string;
    signatoryTitle: string;
  };
  annex: MerchantDpaAnnex;
  /** NexG's signatory (Settings › Agreement signing), when one is set up. */
  signer: { name: string; title: string } | null;
  record: {
    accountEmail: string;
    ip: string | null;
    device: string | null;
    /** The acceptance's id in the database. */
    acceptanceId: string;
    /** SHA-256 of the wording accepted (DPA_TEXT_SHA256). */
    textSha256: string;
  };
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

/** The value of every blank for a filled-in DPA. */
export function dpaFillValues(fill: DpaFill): Record<DpaField, string> {
  const { day, month, year } = dateParts(fill.acceptedAt);
  const name = fill.merchant.legalName;
  return {
    cover_date: `DATED THE ${ordinal(day).toUpperCase()} DAY OF ${month.toUpperCase()} ${year}`,
    processor_cover: name.toUpperCase(),
    processor: name,
    processor_annex: name,
    processor_execution: name,
    ...annexValues(fill.annex),
  };
}

const run = (text: string, style: Partial<Omit<ResolvedRun, 'text'>> = {}): ResolvedRun => ({
  text,
  bold: Boolean(style.bold),
  italic: Boolean(style.italic),
  underline: Boolean(style.underline),
});

function paragraph(
  runs: ResolvedRun[],
  options: Partial<Omit<ResolvedParagraph, 'kind' | 'runs'>> = {},
): ResolvedParagraph {
  return {
    kind: 'p',
    heading: false,
    label: null,
    labelAt: 0,
    textAt: 0,
    align: 'justify',
    pageBreak: false,
    ...options,
    runs,
  };
}

const EMPTY = paragraph([]);

/** The DPA's execution page for a filled-in copy. */
function execution(fill: DpaFill, values: Record<DpaField, string>): ResolvedBlock {
  const m = fill.merchant;
  const signed = formatNairobi(fill.acceptedAt, false);
  const blank = '____________________________';
  const company = NEXG_DOCUMENT_COMPANY;
  return {
    kind: 'dpa-execution',
    parties: [
      {
        heading: DPA.execution.controller,
        signature: Boolean(fill.signer),
        rows: [
          ['Particulars', `${COMPANY_NAME}, Company No. ${COMPANY_NUMBER}`],
          ['KRA PIN', company.kraPin],
          ['Address', `${company.addressLine1}, ${company.addressLine2}`],
          [
            'Signed',
            fill.signer
              ? `Signed electronically for ${COMPANY_NAME}, which issues this DPA as its standard form.`
              : blank,
          ],
          ['Name', fill.signer?.name ?? blank],
          ['Title/Capacity', fill.signer?.title ?? blank],
          ['Date', fill.signer ? signed : blank],
          ['Witness', fill.signer ? 'Not applicable: signed electronically.' : blank],
        ],
      },
      {
        heading: fillDpaText(DPA.execution.processor, values),
        signature: false,
        rows: [
          [
            'Particulars',
            m.registrationNumber
              ? `${m.legalName}, Registration No. ${m.registrationNumber}`
              : m.legalName,
          ],
          ['KRA PIN', m.kraPin],
          ['Address', m.postalAddress?.trim() ? `${m.address}; ${m.postalAddress}` : m.address],
          ['Email and phone', `${m.email}, ${formatPhone(m.phone)}`],
          ['Signed', 'Accepted electronically (see the electronic acceptance record below).'],
          ['Name', m.signatoryName],
          ['Title/Capacity', m.signatoryTitle],
          ['Date', signed],
          ['Witness', 'Not applicable: accepted electronically.'],
        ],
      },
    ],
    record: [
      ['Accepted by', `${m.signatoryName}, ${m.signatoryTitle}, for ${m.legalName}`],
      ['Account email', fill.record.accountEmail],
      ['Date and time', formatNairobi(fill.acceptedAt)],
      ['IP address', fill.record.ip ?? 'Not recorded'],
      ['Device', fill.record.device ?? 'Not recorded'],
      ['Document', `NexG ${DPA_TITLE}, version ${fill.version}`],
      ['Wording SHA-256', fill.record.textSha256],
      [
        'How',
        `Read the DPA and ticked “I have read and agree to the NexG ${DPA_TITLE}” while signed in to NexG as the account above.`,
      ],
      ['Acceptance reference', fill.record.acceptanceId],
    ],
  };
}

/**
 * The DPA as published (its blanks) when no fill is given, or filled in
 * and accepted when it is.
 */
export function buildDpa(fill?: DpaFill): AgreementDocument {
  const values: Record<DpaField, string> = fill ? dpaFillValues(fill) : { ...DPA_BLANKS };
  const f = (text: string) => fillDpaText(text, values);
  const blocks: ResolvedBlock[] = [];

  // The cover: centred, bold, ended by the first empty paragraph.
  for (const line of DPA.cover) blocks.push(paragraph([run(f(line), { bold: true })]));
  blocks.push(EMPTY);

  blocks.push(paragraph([run(DPA.heading, { bold: true })], { align: 'center' }));
  blocks.push(paragraph([run(DPA.subtitle, { italic: true })], { align: 'center' }));
  for (const p of DPA.preamble)
    blocks.push(
      paragraph([...(p.lead ? [run(p.lead, { bold: true })] : []), run(f(p.text))]),
    );

  DPA.clauses.forEach((clause, c) => {
    blocks.push(
      paragraph([run(clause.heading, { bold: true })], {
        heading: true,
        label: clauseLabel(c + 1),
        textAt: 36,
        align: 'left',
      }),
    );
    clause.paragraphs.forEach((p, i) => {
      blocks.push(paragraph([run(f(p.text))], { label: subClauseLabel(c + 1, i + 1), textAt: 36 }));
      (p.items ?? []).forEach((item, n) =>
        blocks.push(paragraph([run(f(item))], { label: itemLabel(n), labelAt: 36, textAt: 72 })),
      );
    });
  });

  blocks.push(
    paragraph([run(DPA.annex1.heading, { bold: true })], {
      heading: true,
      align: 'left',
      pageBreak: true,
    }),
  );
  const cell = (text: string, bold = false) => [paragraph([run(text, { bold })], { align: 'left' })];
  blocks.push({
    kind: 'table',
    role: 'annex',
    cols: [2, 3],
    rows: [
      DPA.annex1.header.map((text) => cell(text, true)),
      ...DPA.annex1.rows.map(([item, description]) => [cell(f(item)), cell(f(description))]),
    ],
  });

  blocks.push(paragraph([run(DPA.annex2.heading, { bold: true })], { heading: true, align: 'left' }));
  for (const measure of DPA.annex2.measures)
    blocks.push(paragraph([run(f(measure))], { label: '•', labelAt: 18, textAt: 36 }));

  blocks.push(
    paragraph([run(DPA.execution.heading, { bold: true })], {
      heading: true,
      align: 'left',
      pageBreak: Boolean(fill),
    }),
  );
  if (fill) blocks.push(execution(fill, values));
  else
    for (const heading of [DPA.execution.controller, DPA.execution.processor]) {
      blocks.push(paragraph([run(f(heading), { bold: true })], { align: 'left' }));
      for (const line of DPA.execution.lines)
        blocks.push(paragraph([run(`${line}: ____________________________`)], { align: 'left' }));
    }

  return { agreementId: 'data-processing', title: DPA_TITLE, heading: DPA_TITLE, blocks };
}
