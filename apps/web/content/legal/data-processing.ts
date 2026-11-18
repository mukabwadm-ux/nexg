import type { LegalDocument } from './types';

/**
 * Data Processing Agreement (standard form for vendors and merchants),
 * transcribed from the client's Word document. The operative wording is
 * theirs; clause numbers lost in the Word list formatting have been restored
 * (they match the cross-references inside the text: clause 11 for breaches,
 * clause 13 for retention). The cover page and execution block are left out,
 * and the Annex 1 rows that are filled in per counterparty say so. The
 * plain-English notes are ours.
 *
 * Signed per merchant rather than accepted on the site, so it has no
 * legal_document_key.
 */
export const dataProcessing: LegalDocument = {
  slug: 'data-processing',
  key: null,
  title: 'Data Processing Agreement',
  tagline: 'For merchants and vendors',
  intro:
    'The standard form Data Processing Agreement for vendors and merchants. It forms part of each business’s agreement with Nexgenius Concierge Limited and sets out how personal data shared between them is protected under the Data Protection Act, 2019.',
  version: null,
  lastUpdated: '18 November 2026',
  draft: false,
  sections: [
    {
      id: 'parties-and-roles',
      heading: 'Parties and Roles',
      body: [
        'THIS DATA PROCESSING AGREEMENT (“DPA”) forms part of, and is incorporated into, the underlying commercial agreement (the “Principal Agreement”) between NexGenius Concierge Limited (the “Controller”, where NexGenius determines the purposes and means of processing) and [Vendor/Merchant Name] (the “Processor”, where the counterparty processes personal data on the Controller’s behalf), each a “Party”.',
        'Where the counterparty instead determines the purposes and means of processing certain data shared with it (e.g. a Merchant using End-User contact data received via the Platform, or a Property Partner sharing guest data), the roles under clauses 3–14 apply with the counterparty as Controller and NexGenius as Processor for that specific processing, as identified in Annex 1.',
      ],
      plainEnglish:
        'Usually NexG decides how the data is used and the business handles it for us. Where the business decides, the roles swap.',
    },
    {
      id: 'definitions',
      heading: 'Definitions',
      body: [
        '1.1 Terms defined in the Data Protection Act, 2019 (the “Act”), including “personal data”, “processing”, “data controller”, “data processor”, “data subject”, “personal data breach”, “sensitive personal data”, “consent” and “data protection officer”, bear the same meaning in this DPA.',
      ],
      plainEnglish: 'Words mean what the Data Protection Act says they mean.',
    },
    {
      id: 'subject-matter-and-duration',
      heading: 'Subject Matter and Duration',
      body: [
        '2.1 This DPA governs the Processor’s processing of personal data on behalf of the Controller for the duration of the Principal Agreement, and for such further period as the Processor retains any such data in accordance with clause 13.',
        '2.2 The subject matter, nature, purpose, categories of data subjects, and categories of personal data are set out in Annex 1.',
      ],
      plainEnglish:
        'It lasts as long as the main agreement, and as long as any data is still kept.',
    },
    {
      id: 'processor-obligations',
      heading: 'Processor Obligations',
      body: [
        '3.1 The Processor shall process personal data only:',
        '(a) on documented instructions from the Controller, including as set out in the Principal Agreement and this DPA;',
        '(b) to the extent necessary to perform its obligations under the Principal Agreement; and',
        '(c) in compliance with the Act.',
        '3.2 The Processor shall promptly inform the Controller if, in its opinion, an instruction infringes the Act.',
        '3.3 The Processor shall ensure that persons authorised to process the personal data have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.',
        '3.4 The Processor shall implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk, including as described in Annex 2, having regard to the state of the art, cost of implementation, and the nature, scope and purposes of processing.',
        '3.5 The Processor shall assist the Controller, insofar as reasonably possible, in responding to data subject requests to exercise their rights under Part IV of the Act, and in the Controller’s compliance with its obligations regarding security of processing, breach notification, and data protection impact assessments.',
        '3.6 Where processing under this DPA is likely to result in a high risk to the rights and freedoms of data subjects within the meaning of section 31 of the Act, the Processor shall promptly notify the Controller and provide such information as the Controller reasonably requires to complete a data protection impact assessment.',
      ],
      plainEnglish:
        'Use the data only as instructed and only for the service, keep it confidential and secure, and help us meet our duties.',
    },
    {
      id: 'registration',
      heading: 'Registration',
      body: [
        '4.1 The Processor warrants that, to the extent required under section 18 of the Act, it is registered as a data processor with the Office of the Data Protection Commissioner, and shall promptly notify the Controller if it becomes subject to mandatory registration and register accordingly.',
        '4.2 The Processor shall maintain such registration for the duration of this DPA, notify the Data Commissioner of any change in the particulars specified under section 19(2) of the Act, and provide the Controller with a copy of its certificate of registration on request.',
      ],
      plainEnglish:
        'Register with the Data Protection Commissioner if the law requires it, and keep it current.',
    },
    {
      id: 'data-protection-officer',
      heading: 'Data Protection Officer',
      body: [
        '5.1 Each Party shall designate a data protection officer to the extent required under section 24 of the Act, having regard to whether its core activities involve regular and systematic monitoring of data subjects or processing of sensitive personal data at scale.',
        '5.2 Each Party shall provide the other Party with its data protection officer’s contact details (or, where no designation is required, the contact details of an equivalent compliance contact), and shall notify the other Party promptly of any change.',
      ],
      plainEnglish: 'Each side names a data protection contact and tells the other who it is.',
    },
    {
      id: 'sub-processing',
      heading: 'Sub-Processing',
      body: [
        '6.1 The Processor shall not engage another processor (a “Sub-Processor”) without the Controller’s prior written or general authorisation. Where general authorisation is given, the Processor shall inform the Controller of any intended changes concerning the addition or replacement of Sub-Processors, giving the Controller an opportunity to object.',
        '6.2 Where a Sub-Processor is engaged, the Processor shall impose on that Sub-Processor, by way of a written contract, data protection obligations no less protective than those set out in this DPA, and shall remain fully liable to the Controller for the Sub-Processor’s performance.',
      ],
      plainEnglish:
        'No passing the data to another company without our OK, and the business stays responsible for them.',
    },
    {
      id: 'cross-border-transfers',
      heading: 'Cross-Border Transfers',
      body: [
        '7.1 The Processor shall not transfer personal data outside Kenya save in accordance with sections 48 to 50 of the Act, and shall, before any such transfer, inform the Controller of the destination country and the safeguard relied upon (for example, standard contractual clauses, proof furnished to the Data Commissioner of appropriate safeguards, or another mechanism permitted under section 48).',
        '7.2 Where the transfer involves sensitive personal data, the Processor shall not transfer it outside Kenya unless the data subject has given consent to the transfer and the Processor has confirmed the appropriate safeguards required under section 49(1) of the Act.',
        '7.3 The Controller may object to a proposed transfer within a reasonable period of being informed, in which case the Processor shall not proceed with that transfer.',
      ],
      plainEnglish:
        'Data leaves Kenya only with proper safeguards, after telling us, and we can say no.',
    },
    {
      id: 'sensitive-personal-data',
      heading: 'Sensitive Personal Data',
      body: [
        '8.1 Where the personal data processed under this DPA includes sensitive personal data, being data revealing race, health status, ethnic social origin, conscience, belief, genetic data, biometric data, property details, marital status, family details, sex or sexual orientation, as defined in the Act, the Processor shall process such data only on a ground permitted under Part V of the Act (sections 44 to 47) and as identified in Annex 1.',
        '8.2 The Processor shall apply additional technical and organisational safeguards to sensitive personal data appropriate to the heightened risk of harm, including restricting access to personnel who require it, and shall not process health data otherwise than by or under the responsibility of a person subject to an obligation of professional secrecy, in accordance with section 46 of the Act.',
      ],
      plainEnglish:
        'Sensitive data, such as health details, gets extra protection and tighter access.',
    },
    {
      id: 'childrens-data',
      heading: 'Children’s Data',
      body: [
        '9.1 The Processor shall not process personal data relating to a child, within the meaning of the Act, except on the Controller’s documented instructions and only where consent has been given by the child’s parent or guardian in accordance with section 33 of the Act.',
        '9.2 Where the Processor’s systems collect personal data that may include data of a child, the Processor shall implement age-verification and consent mechanisms appropriate to the factors listed in section 33(3) of the Act and shall process such data in a manner that protects and advances the best interests of the child.',
      ],
      plainEnglish:
        'Children’s data only with a parent’s or guardian’s consent, and in the child’s interest.',
    },
    {
      id: 'data-subject-rights',
      heading: 'Data Subject Rights',
      body: [
        '10.1 The Processor shall, taking into account the nature of the processing, assist the Controller by appropriate technical and organisational measures, insofar as possible, in fulfilling the Controller’s obligation to respond to a data subject exercising any right under section 26 of the Act, including the rights to be informed, to access, to object to processing, and to correction or deletion of false or misleading data.',
        '10.2 Where applicable to the processing under this DPA, the Processor shall further assist the Controller in giving effect to a data subject’s right to restriction of processing under section 34, to object to automated individual decision-making under section 35, and to data portability under section 38 (including providing a structured, commonly used and machine-readable copy of the data subject’s personal data, to enable the Controller to comply within the thirty-day period specified in section 38(6)).',
        '10.3 Where the Processor receives a data subject request directly, it shall promptly forward it to the Controller without responding, unless legally required to respond.',
        '10.4 The Processor shall not make a decision based solely on automated processing, including profiling, which produces legal effects concerning or significantly affects a data subject, except on the Controller’s documented instructions and subject to the safeguards required under section 35 of the Act.',
      ],
      plainEnglish:
        'Help people see, correct, move or delete their data. Pass their requests to us rather than answering yourself.',
    },
    {
      id: 'personal-data-breach-notification',
      heading: 'Personal Data Breach Notification',
      body: [
        '11.1 The Processor shall notify the Controller without undue delay, and in any event within twenty-four (24) hours of becoming aware, a shorter period than, but consistent with, the forty-eight (48) hour backstop in section 43(3) of the Act, of any personal data breach affecting data processed under this DPA, providing sufficient information to allow the Controller to meet any obligation to notify the Office of the Data Protection Commissioner within seventy-two (72) hours under section 43(1) of the Act.',
        '11.2 The notification shall describe, to the extent known: the nature of the breach; the categories and approximate number of data subjects and records affected; the likely consequences; the measures taken or proposed to address the breach and mitigate its effects; and, where applicable, the identity of any unauthorised person and the contact details of the Processor’s data protection officer, consistent with section 43(5) of the Act.',
        '11.3 The Processor shall maintain a record of each personal data breach, including the facts relating to the breach, its effects, and the remedial action taken, and shall make that record available to the Controller on request, consistent with section 43(8) of the Act.',
      ],
      plainEnglish:
        'Tell us about any data breach within 24 hours, with the details, and keep a record of it.',
    },
    {
      id: 'audits-and-compliance',
      heading: 'Audits and Compliance',
      body: [
        '12.1 The Processor shall make available to the Controller information reasonably necessary to demonstrate compliance with this DPA, and shall allow for and contribute to audits, including inspections, conducted by the Controller or an auditor mandated by the Controller, on reasonable prior notice and subject to reasonable confidentiality safeguards.',
      ],
      plainEnglish: 'We can check, with notice, that the business is keeping to this agreement.',
    },
    {
      id: 'data-retention-and-deletion',
      heading: 'Data Retention and Deletion',
      body: [
        '13.1 The Processor shall not retain personal data processed under this DPA for longer than is reasonably necessary to fulfil the purpose for which it was processed, and shall delete, erase, anonymise or pseudonymise such data at the expiry of the applicable retention period, in accordance with section 39 of the Act, save where retention is required or authorised by law or necessary for the establishment, exercise or defence of a legal claim.',
        '13.2 On termination or expiry of the Principal Agreement, the Processor shall, at the Controller’s election, return or securely delete all personal data processed under this DPA and certify such deletion, save to the extent retention is required by applicable law, in which case the Processor shall continue to protect the data and limit processing to the purpose of that legal requirement.',
      ],
      plainEnglish:
        'Keep data only as long as needed. When the agreement ends, return or delete it.',
    },
    {
      id: 'liability',
      heading: 'Liability',
      body: [
        '14.1 Each Party’s liability arising under this DPA is subject to any limitation of liability set out in the Principal Agreement. Nothing in this DPA limits a Party’s liability for its own breach of the Act to the extent such liability cannot lawfully be limited.',
      ],
      plainEnglish:
        'The main agreement’s liability limits apply, except where the law says they cannot.',
    },
    {
      id: 'governing-law',
      heading: 'Governing Law',
      body: [
        '15.1 This DPA is governed by the laws of Kenya and shall be interpreted consistently with the Principal Agreement, of which it forms part.',
      ],
      plainEnglish: 'Kenyan law applies.',
    },
    {
      id: 'annex-1-details-of-processing',
      heading: 'Annex 1: Details of Processing',
      body: [
        'Controller: NexGenius Concierge Limited.',
        'Processor: the Vendor, Merchant or Property Partner named in the Principal Agreement.',
        'Subject matter: Provision of services supporting the NexGenius platform.',
        'Duration: Term of the Principal Agreement, plus any agreed retention period.',
        'Categories of data subjects: End-Users, Riders, Merchants, and/or Property Partner guests, as applicable to the specific service.',
        'Categories of personal data: Name, contact details, order data, location data, payment tokens, and other data as specified in the Principal Agreement or onboarding documentation.',
        'Nature of processing: Collection, storage, transmission, and analysis as necessary to provide the contracted service.',
        'Legal basis for processing: Performance of the Principal Agreement / consent / legitimate interests.',
        'Categories of sensitive personal data (if any): specified per Merchant category when the agreement is signed (for example, health data for Pharmacy merchants under Addendum F2.3), or “None” if not applicable.',
        'Data Protection Officer or compliance contact (Processor), and the Processor’s Data Commissioner registration number (if applicable): completed for each Processor when the agreement is signed.',
      ],
      plainEnglish:
        'Who the parties are, whose data is involved, what data, and why. Some rows are filled in for each business.',
    },
    {
      id: 'annex-2-security-measures',
      heading: 'Annex 2: Technical and Organisational Security Measures',
      body: [
        '(a) Encryption of personal data in transit (TLS 1.2 or higher) and, where technically feasible, at rest.',
        '(b) Role-based access control restricting access to personal data to personnel who require it for the performance of the service.',
        '(c) Logging and monitoring of access to production systems containing personal data.',
        '(d) Regular security testing and patch management appropriate to the Processor’s systems.',
        '(e) A documented incident response procedure enabling breach notification within the timeframe at clause 11.',
        '(f) Contractual flow-down of equivalent security obligations to any authorised Sub-Processor.',
        '(g) Additional access restrictions and, where applicable, field-level encryption or masking for sensitive personal data and any data relating to a child.',
        '(h) Data protection impact assessment and risk-review procedures triggered by any new processing activity likely to result in a high risk to data subjects, consistent with section 31 of the Act.',
      ],
      plainEnglish:
        'The minimum security: encryption, need-to-know access, logging, testing, a breach plan, and extra care for sensitive and children’s data.',
    },
  ],
};
