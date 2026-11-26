import { z } from 'zod';

/**
 * The NexG Data Processing Agreement (DPA) every merchant reads and accepts
 * during onboarding, next to its merchant agreement.
 *
 * The wording is the owner's "Data Processing Agreement" Word document,
 * word for word. Do not edit it here without the owner's say-so: a change
 * is a new version (DPA_PUBLISHED_ON and the checksum below), merchants who
 * accepted the old one keep their copy, and the database must be told of the
 * new version (merchant_dpa_version) by a migration.
 *
 * Clause numbers are the ones Word prints: 1–15, sub-clauses 1.1, 3.2 …,
 * items (a), (b) …. The blanks the original leaves for the merchant are
 * fields ({{name}}): the merchant's page shows the blank, the signed copy
 * the merchant's details.
 */

export const DPA_TITLE = 'Data Processing Agreement';

/** The day this wording was published to merchants. */
export const DPA_PUBLISHED_ON = '2026-11-25';

/**
 * SHA-256 of dpaText() with the blanks: the wording's fingerprint. A test
 * recomputes it, so an edit to the wording cannot slip through unversioned.
 */
export const DPA_TEXT_SHA256 = 'acd3d3e54ac562e0667529fd03bd22b1e75fabad5e97655d24d20b5baf57d896';

/** The version a merchant accepts: the publication day plus the fingerprint. */
export const DPA_VERSION = `${DPA_PUBLISHED_ON}+${DPA_TEXT_SHA256.slice(0, 12)}`;

/** The blanks, as the original prints them. */
export const DPA_BLANKS = {
  cover_date: 'DATED THE………………………..DAY OF………………………………………..…....2026',
  processor_cover: '……………………………………………',
  processor: '[Vendor/Merchant Name]',
  processor_annex: '[Vendor / Merchant / Property Partner name]',
  sensitive_data:
    '[To be specified per Merchant category — e.g. health data for Pharmacy merchants under Addendum F2.3 — state “None” if not applicable]',
  dpo_contact: '[Name, email, phone]',
  odpc_registration: '[Registration number, or “Not applicable”]',
  processor_execution: '[Vendor / Merchant Name]',
} as const;

export type DpaField = keyof typeof DPA_BLANKS;

export interface DpaParagraph {
  /** May hold {{field}} blanks. */
  text: string;
  /** "(a) …" items under the paragraph. */
  items?: string[];
}

export interface DpaClause {
  heading: string;
  paragraphs: DpaParagraph[];
}

export interface DpaDocument {
  /** The cover page, top to bottom; bold, centred. */
  cover: string[];
  heading: string;
  subtitle: string;
  /** The opening paragraphs; the first starts with its bold lead-in. */
  preamble: { lead?: string; text: string }[];
  clauses: DpaClause[];
  annex1: { heading: string; header: [string, string]; rows: [string, string][] };
  annex2: { heading: string; measures: string[] };
  execution: {
    heading: string;
    controller: string;
    processor: string;
    lines: string[];
  };
}

export const DPA: DpaDocument = {
  cover: [
    '{{cover_date}}',
    'NEXGENIUS CONCIERGE LIMITED',
    'AND',
    '{{processor_cover}}',
    'DATA PROCESSING AGREEMENT',
  ],
  heading: 'Data Processing Agreement',
  subtitle: 'Standard Form for Vendors and Merchants',
  preamble: [
    {
      lead: 'THIS DATA PROCESSING AGREEMENT',
      text: ' (“DPA”) forms part of, and is incorporated into, the underlying commercial agreement (the “Principal Agreement”) between NexGenius Concierge Limited (the “Controller”, where NexGenius determines the purposes and means of processing) and {{processor}} (the “Processor”, where the counterparty processes personal data on the Controller’s behalf), each a “Party”.',
    },
    {
      text: 'Where the counterparty instead determines the purposes and means of processing certain data shared with it (e.g. a Merchant using End-User contact data received via the Platform, or a Property Partner sharing guest data), the roles under clauses 3–14 apply with the counterparty as Controller and NexGenius as Processor for that specific processing, as identified in Annex 1.',
    },
  ],
  clauses: [
    {
      heading: 'Definitions',
      paragraphs: [
        {
          text: 'Terms defined in the Data Protection Act, 2019 (the “Act”); including “personal data”, “processing”, “data controller”, “data processor”, “data subject”, “personal data breach”, “sensitive personal data”, “consent” and “data protection officer”, bear the same meaning in this DPA.',
        },
      ],
    },
    {
      heading: 'Subject Matter and Duration',
      paragraphs: [
        {
          text: 'This DPA governs the Processor’s processing of personal data on behalf of the Controller for the duration of the Principal Agreement, and for such further period as the Processor retains any such data in accordance with clause 13.',
        },
        {
          text: 'The subject matter, nature, purpose, categories of data subjects, and categories of personal data are set out in Annex 1.',
        },
      ],
    },
    {
      heading: 'Processor Obligations',
      paragraphs: [
        {
          text: 'The Processor shall process personal data only:',
          items: [
            'on documented instructions from the Controller, including as set out in the Principal Agreement and this DPA;',
            'to the extent necessary to perform its obligations under the Principal Agreement; and',
            'in compliance with the Act.',
          ],
        },
        {
          text: 'The Processor shall promptly inform the Controller if, in its opinion, an instruction infringes the Act.',
        },
        {
          text: 'The Processor shall ensure that persons authorised to process the personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.',
        },
        {
          text: 'The Processor shall implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk, including as described in Annex 2, having regard to the state of the art, cost of implementation, and the nature, scope and purposes of processing.',
        },
        {
          text: 'The Processor shall assist the Controller, insofar as reasonably possible, in responding to data subject requests to exercise their rights under Part IV of the Act, and in the Controller’s compliance with its obligations regarding security of processing, breach notification, and data protection impact assessments.',
        },
        {
          text: 'Where processing under this DPA is likely to result in a high risk to the rights and freedoms of data subjects within the meaning of section 31 of the Act, the Processor shall promptly notify the Controller and provide such information as the Controller reasonably requires to complete a data protection impact assessment.',
        },
      ],
    },
    {
      heading: 'Registration',
      paragraphs: [
        {
          text: 'The Processor warrants that, to the extent required under section 18 of the Act, it is registered as a data processor with the Office of the Data Protection Commissioner, and shall promptly notify the Controller if it becomes subject to mandatory registration and register accordingly.',
        },
        {
          text: 'The Processor shall maintain such registration for the duration of this DPA, notify the Data Commissioner of any change in the particulars specified under section 19(2) of the Act, and provide the Controller with a copy of its certificate of registration on request.',
        },
      ],
    },
    {
      heading: 'Data Protection Officer',
      paragraphs: [
        {
          text: 'Each Party shall designate a data protection officer to the extent required under section 24 of the Act, having regard to whether its core activities involve regular and systematic monitoring of data subjects or processing of sensitive personal data at scale.',
        },
        {
          text: 'Each Party shall provide the other Party with its data protection officer’s contact details (or, where no designation is required, the contact details of an equivalent compliance contact), and shall notify the other Party promptly of any change.',
        },
      ],
    },
    {
      heading: 'Sub-Processing',
      paragraphs: [
        {
          text: 'The Processor shall not engage another processor (a “Sub-Processor”) without the Controller’s prior written or general authorisation. Where general authorisation is given, the Processor shall inform the Controller of any intended changes concerning the addition or replacement of Sub-Processors, giving the Controller an opportunity to object.',
        },
        {
          text: 'Where a Sub-Processor is engaged, the Processor shall impose on that Sub-Processor, by way of a written contract, data protection obligations no less protective than those set out in this DPA, and shall remain fully liable to the Controller for the Sub-Processor’s performance.',
        },
      ],
    },
    {
      heading: 'Cross-Border Transfers',
      paragraphs: [
        {
          text: 'The Processor shall not transfer personal data outside Kenya save in accordance with sections 48 to 50 of the Act, and shall, before any such transfer, inform the Controller of the destination country and the safeguard relied upon (for example, standard contractual clauses, proof furnished to the Data Commissioner of appropriate safeguards, or another mechanism permitted under section 48).',
        },
        {
          text: 'Where the transfer involves sensitive personal data, the Processor shall not transfer it outside Kenya unless the data subject has given consent to the transfer and the Processor has confirmed the appropriate safeguards required under section 49(1) of the Act.',
        },
        {
          text: 'The Controller may object to a proposed transfer within a reasonable period of being informed, in which case the Processor shall not proceed with that transfer.',
        },
      ],
    },
    {
      heading: 'Sensitive Personal Data',
      paragraphs: [
        {
          text: 'Where the personal data processed under this DPA includes sensitive personal data, being data revealing race, health status, ethnic social origin, conscience, belief, genetic data, biometric data, property details, marital status, family details, sex or sexual orientation, as defined in the Act, the Processor shall process such data only on a ground permitted under Part V of the Act (sections 44 to 47) and as identified in Annex 1.',
        },
        {
          text: 'The Processor shall apply additional technical and organisational safeguards to sensitive personal data appropriate to the heightened risk of harm, including restricting access to personnel who require it, and shall not process health data otherwise than by or under the responsibility of a person subject to an obligation of professional secrecy, in accordance with section 46 of the Act.',
        },
      ],
    },
    {
      heading: 'Children’s Data',
      paragraphs: [
        {
          text: 'The Processor shall not process personal data relating to a child, within the meaning of the Act, except on the Controller’s documented instructions and only where consent has been given by the child’s parent or guardian in accordance with section 33 of the Act.',
        },
        {
          text: 'Where the Processor’s systems collect personal data that may include data of a child, the Processor shall implement age-verification and consent mechanisms appropriate to the factors listed in section 33(3) of the Act and shall process such data in a manner that protects and advances the best interests of the child.',
        },
      ],
    },
    {
      heading: 'Data Subject Rights',
      paragraphs: [
        {
          text: 'The Processor shall, taking into account the nature of the processing, assist the Controller by appropriate technical and organisational measures, insofar as possible, in fulfilling the Controller’s obligation to respond to a data subject exercising any right under section 26 of the Act, including the rights to be informed, to access, to object to processing, and to correction or deletion of false or misleading data.',
        },
        {
          text: 'Where applicable to the processing under this DPA, the Processor shall further assist the Controller in giving effect to a data subject’s right to restriction of processing under section 34, to object to automated individual decision-making under section 35, and to data portability under section 38 (including providing a structured, commonly used and machine-readable copy of the data subject’s personal data, to enable the Controller to comply within the thirty-day period specified in section 38(6)).',
        },
        {
          text: 'Where the Processor receives a data subject request directly, it shall promptly forward it to the Controller without responding, unless legally required to respond.',
        },
        {
          text: 'The Processor shall not make a decision based solely on automated processing, including profiling, which produces legal effects concerning or significantly affects a data subject, except on the Controller’s documented instructions and subject to the safeguards required under section 35 of the Act.',
        },
      ],
    },
    {
      heading: 'Personal Data Breach Notification',
      paragraphs: [
        {
          text: 'The Processor shall notify the Controller without undue delay, and in any event within twenty-four (24) hours of becoming aware, a shorter period than, but consistent with, the forty-eight (48) hour backstop in section 43(3) of the Act, of any personal data breach affecting data processed under this DPA, providing sufficient information to allow the Controller to meet any obligation to notify the Office of the Data Protection Commissioner within seventy-two (72) hours under section 43(1) of the Act.',
        },
        {
          text: 'The notification shall describe, to the extent known: the nature of the breach; the categories and approximate number of data subjects and records affected; the likely consequences; the measures taken or proposed to address the breach and mitigate its effects; and, where applicable, the identity of any unauthorised person and the contact details of the Processor’s data protection officer, consistent with section 43(5) of the Act.',
        },
        {
          text: 'The Processor shall maintain a record of each personal data breach, including the facts relating to the breach, its effects, and the remedial action taken, and shall make that record available to the Controller on request, consistent with section 43(8) of the Act.',
        },
      ],
    },
    {
      heading: 'Audits and Compliance',
      paragraphs: [
        {
          text: 'The Processor shall make available to the Controller information reasonably necessary to demonstrate compliance with this DPA, and shall allow for and contribute to audits, including inspections, conducted by the Controller or an auditor mandated by the Controller, on reasonable prior notice and subject to reasonable confidentiality safeguards.',
        },
      ],
    },
    {
      heading: 'Data Retention and Deletion',
      paragraphs: [
        {
          text: 'The Processor shall not retain personal data processed under this DPA for longer than is reasonably necessary to fulfil the purpose for which it was processed, and shall delete, erase, anonymise or pseudonymise such data at the expiry of the applicable retention period, in accordance with section 39 of the Act, save where retention is required or authorised by law or necessary for the establishment, exercise or defence of a legal claim.',
        },
        {
          text: 'On termination or expiry of the Principal Agreement, the Processor shall, at the Controller’s election, return or securely delete all personal data processed under this DPA and certify such deletion, save to the extent retention is required by applicable law, in which case the Processor shall continue to protect the data and limit processing to the purpose of that legal requirement.',
        },
      ],
    },
    {
      heading: 'Liability',
      paragraphs: [
        {
          text: 'Each Party’s liability arising under this DPA is subject to any limitation of liability set out in the Principal Agreement. Nothing in this DPA limits a Party’s liability for its own breach of the Act to the extent such liability cannot lawfully be limited.',
        },
      ],
    },
    {
      heading: 'Governing Law',
      paragraphs: [
        {
          text: 'This DPA is governed by the laws of Kenya and shall be interpreted consistently with the Principal Agreement, of which it forms part.',
        },
      ],
    },
  ],
  annex1: {
    heading: 'Annex 1 — Details of Processing',
    header: ['Item', 'Description'],
    rows: [
      ['Controller', 'NexGenius Concierge Limited'],
      ['Processor', '{{processor_annex}}'],
      ['Subject matter', 'Provision of services supporting the NexGenius platform'],
      ['Duration', 'Term of the Principal Agreement, plus any agreed retention period'],
      [
        'Categories of data subjects',
        'End-Users, Riders, Merchants, and/or Property Partner guests, as applicable to the specific service',
      ],
      [
        'Categories of personal data',
        'Name, contact details, order data, location data, payment tokens, and other data as specified in the Principal Agreement or onboarding documentation',
      ],
      [
        'Nature of processing',
        'Collection, storage, transmission, and analysis as necessary to provide the contracted service',
      ],
      [
        'Legal basis for processing',
        'Performance of the Principal Agreement / consent / legitimate interests',
      ],
      ['Categories of sensitive personal data (if any)', '{{sensitive_data}}'],
      ['Data Protection Officer / compliance contact (Processor)', '{{dpo_contact}}'],
      [
        'Processor’s Data Commissioner registration number (if applicable)',
        '{{odpc_registration}}',
      ],
    ],
  },
  annex2: {
    heading: 'Annex 2 — Technical and Organisational Security Measures',
    measures: [
      'Encryption of personal data in transit (TLS 1.2 or higher) and, where technically feasible, at rest.',
      'Role-based access control restricting access to personal data to personnel who require it for the performance of the service.',
      'Logging and monitoring of access to production systems containing personal data.',
      'Regular security testing and patch management appropriate to the Processor’s systems.',
      'A documented incident response procedure enabling breach notification within the timeframe at clause 11.',
      'Contractual flow-down of equivalent security obligations to any authorised Sub-Processor.',
      'Additional access restrictions and, where applicable, field-level encryption or masking for sensitive personal data and any data relating to a child.',
      'Data protection impact assessment and risk-review procedures triggered by any new processing activity likely to result in a high risk to data subjects, consistent with section 31 of the Act.',
    ],
  },
  execution: {
    heading: 'Execution',
    controller: 'For NexGenius Concierge Limited (Controller):',
    processor: 'For {{processor_execution}} (Processor):',
    lines: ['Signed', 'Name', 'Title/Capacity', 'Date', 'Witness'],
  },
};

const FIELD = /\{\{([a-z_]+)\}\}/g;

/** A text with its {{field}} blanks replaced by the given values. */
export function fillDpaText(text: string, values: Readonly<Record<DpaField, string>>): string {
  return text.replace(FIELD, (_, name: string) => {
    const value = (values as Record<string, string>)[name];
    if (value === undefined) throw new Error(`No value for DPA field ${name}`);
    return value;
  });
}

/** "1.", "3.2.", "(a)": the labels Word prints. */
export function clauseLabel(clause: number): string {
  return `${clause}.`;
}
export function subClauseLabel(clause: number, paragraph: number): string {
  return `${clause}.${paragraph}.`;
}
export function itemLabel(item: number): string {
  return `(${String.fromCharCode(97 + item)})`;
}

/**
 * The DPA as plain text, one line per paragraph, table cells in reading
 * order, no clause numbers: what DPA_TEXT_SHA256 fingerprints when given the
 * blanks.
 */
export function dpaText(values: Readonly<Record<DpaField, string>> = DPA_BLANKS): string {
  const f = (text: string) => fillDpaText(text, values);
  const lines: string[] = [
    ...DPA.cover.map(f),
    DPA.heading,
    DPA.subtitle,
    ...DPA.preamble.map((p) => f(`${p.lead ?? ''}${p.text}`)),
  ];
  for (const clause of DPA.clauses) {
    lines.push(clause.heading);
    for (const p of clause.paragraphs) lines.push(f(p.text), ...(p.items ?? []).map(f));
  }
  lines.push(DPA.annex1.heading, ...DPA.annex1.header);
  for (const [item, description] of DPA.annex1.rows) lines.push(f(item), f(description));
  lines.push(DPA.annex2.heading, ...DPA.annex2.measures.map(f));
  lines.push(DPA.execution.heading, f(DPA.execution.controller));
  lines.push(...DPA.execution.lines.map((l) => `${l}: ____________________________`));
  lines.push(f(DPA.execution.processor));
  lines.push(...DPA.execution.lines.map((l) => `${l}: ____________________________`));
  return lines.join('\n');
}

/* ------------------------------------------------- what the merchant gives */

/** Categories whose merchants handle health data (Pharmacy, Health). */
export const DPA_HEALTH_CATEGORIES: ReadonlySet<string> = new Set(['pharmacy', 'health']);

/** What Annex 1 says about sensitive data before the merchant changes it. */
export function suggestedSensitiveData(categoryId: string | null | undefined): string {
  return categoryId && DPA_HEALTH_CATEGORIES.has(categoryId)
    ? 'Health data (prescriptions and health information of End-Users), under Addendum F2.3'
    : 'None';
}

const tidy = (value: string) => value.trim().replace(/\s+/g, ' ');

/**
 * The merchant's answers for Annex 1, checked the way
 * rpc_merchant_dpa_accept checks them and with the same messages.
 */
export const MerchantDpaAnnex = z
  .object({
    sensitive_data: z
      .string()
      .transform(tidy)
      .pipe(
        z
          .string()
          .min(2, 'Say which sensitive personal data you handle, or “None”.')
          .max(300, 'Keep the sensitive data line under 300 characters.'),
      ),
    dpo_name: z
      .string()
      .transform(tidy)
      .pipe(
        z
          .string()
          .min(2, 'Enter the name of your data protection officer or compliance contact.')
          .max(120, 'Enter the name of your data protection officer or compliance contact.'),
      ),
    dpo_email: z
      .string()
      .transform((value) => value.trim().toLowerCase())
      .pipe(
        z
          .string()
          .max(254, 'Enter a valid email for your compliance contact.')
          .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email for your compliance contact.'),
      ),
    dpo_phone: z
      .string()
      .transform(tidy)
      .pipe(
        z
          .string()
          .regex(
            /^\+?[0-9][0-9 ]{7,19}$/,
            'Enter your compliance contact’s phone in digits, for example +254 700 000 000.',
          ),
      ),
    odpc_registration: z
      .string()
      .transform(tidy)
      .refine(
        (value) => value.length <= 60,
        'Enter the registration number from your Data Commissioner certificate, or leave it empty.',
      )
      .transform((value) => value || null),
  })
  .strict();
export type MerchantDpaAnnexInput = z.input<typeof MerchantDpaAnnex>;
export type MerchantDpaAnnex = z.output<typeof MerchantDpaAnnex>;

/** The Annex 1 blanks filled from the merchant's answers. */
export function annexValues(annex: MerchantDpaAnnex): Pick<
  Record<DpaField, string>,
  'sensitive_data' | 'dpo_contact' | 'odpc_registration'
> {
  return {
    sensitive_data: annex.sensitive_data,
    dpo_contact: `${annex.dpo_name}, ${annex.dpo_email}, ${annex.dpo_phone}`,
    odpc_registration: annex.odpc_registration ?? 'Not applicable',
  };
}
