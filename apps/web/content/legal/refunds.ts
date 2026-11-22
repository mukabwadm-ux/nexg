import type { LegalDocument } from './types';

/**
 * Refund, Cancellation and Complaints Policy, transcribed from the client's
 * Word document of the same name. The operative wording is theirs; only the
 * clause numbers lost in the Word list formatting have been restored, the
 * complaints table is written out stage by stage, and the blank contact email
 * is the address the site already publishes. The plain-English notes are ours.
 *
 * The effective date in the document is still blank, so `version` stays null.
 */
export const refunds: LegalDocument = {
  slug: 'refunds',
  key: 'refunds',
  title: 'Refund, Cancellation and Complaints Policy',
  tagline: 'Cancellations, refunds and complaints',
  intro:
    'This Refund, Cancellation and Complaints Policy (“Policy”) applies to all orders placed through the NexGenius platform (the “Platform”) and forms part of the End-User Terms and Conditions and the Merchant Agreement. It sets out how cancellations, refunds and complaints are handled, consistent with the Consumer Protection Act, 2012.',
  version: null,
  lastUpdated: '18 November 2026',
  draft: false,
  sections: [
    {
      id: 'cancellation-by-the-end-user',
      heading: 'Cancellation by the End-User',
      body: [
        '1.1 An End-User may cancel an order free of charge at any time before the Merchant accepts it.',
        '1.2 Once a Merchant has accepted an order, cancellation may be subject to a partial charge to cover preparation already undertaken and any Rider already dispatched, as indicated on the Platform at the point of cancellation.',
        '1.3 Orders that have already been collected by a Rider for delivery cannot be cancelled, save where the item is later confirmed faulty, incorrect, or undelivered, in which case clause 3 applies.',
      ],
      plainEnglish:
        'Cancel free until the merchant accepts. After that a part charge may apply, and once a rider has collected it the order can no longer be cancelled.',
    },
    {
      id: 'cancellation-by-nexgenius-or-the-merchant',
      heading: 'Cancellation by NexGenius or the Merchant',
      body: [
        '2.1 NexGenius or the Merchant may cancel an order due to item unavailability, safety concerns, suspected fraud, or operational issues. Where an order is cancelled under this clause, any amount already charged to the End-User shall be refunded in full within the timeframe at clause 5.',
      ],
      plainEnglish: 'If we or the merchant cancel, you get everything back.',
    },
    {
      id: 'grounds-for-refund',
      heading: 'Grounds for Refund',
      body: [
        '3.1 An End-User may request a refund, in whole or in part, where:',
        '(a) the order was not delivered within a reasonable time and the End-User no longer wishes to receive it;',
        '(b) the item delivered was materially different from what was ordered (wrong item, missing item, or incorrect quantity);',
        '(c) the item delivered was spoiled, damaged, expired, or otherwise not of satisfactory quality;',
        '(d) the End-User was charged an incorrect amount due to a Platform, Merchant or payment processing error;',
        '(e) the order was cancelled by NexGenius or the Merchant under clause 2.',
        '3.2 Refund requests must be raised through the Platform’s support channel within forty-eight (48) hours of delivery (or of the expected delivery time, for non-delivered orders), save where a longer period is reasonable in the circumstances (for example, a latent quality defect not reasonably discoverable at delivery).',
      ],
      plainEnglish:
        'Late, wrong, missing, spoiled or overcharged? Ask for a refund within 48 hours of delivery.',
    },
    {
      id: 'assessment-of-refund-requests',
      heading: 'Assessment of Refund Requests',
      body: [
        '4.1 NexGenius shall review each refund request, which may include seeking information or photographic evidence from the End-User, and confirmation from the Merchant and/or Rider involved.',
        '4.2 Where the cause of the issue is attributable to the Merchant (e.g., wrong or spoiled item), the refund amount shall be recovered from the Merchant’s next settlement. Where attributable to a Rider (e.g., non-delivery, tampering), NexGenius shall address this through its Rider conduct process. Where attributable to a Platform or payment error, NexGenius bears the cost of the refund.',
      ],
      plainEnglish:
        'We may ask for a photo. Whoever caused the problem pays for the refund, not you.',
    },
    {
      id: 'refund-method-and-timeframe',
      heading: 'Refund Method and Timeframe',
      body: [
        '5.1 Approved refunds shall be processed to the original payment method (mobile money or card) or, at the End-User’s election where offered, as Platform credit, within five (5) business days of approval. Refunds to mobile money or card may take a further two to seven (2–7) business days to reflect, depending on the End-User’s payment provider.',
      ],
      plainEnglish:
        'Refunds go back the way you paid within 5 business days of approval, then 2–7 more for your provider.',
    },
    {
      id: 'complaints-process',
      heading: 'Complaints Process',
      body: [
        'Stage 1, Submission: End-User, Merchant, Rider or Property Partner submits a complaint via the Platform support channel, email, or in-app chat. Target timeframe: immediate acknowledgement.',
        'Stage 2, Triage: NexGenius support team categorises the complaint (order issue, safety, payment, conduct, data protection) and assigns it to the relevant team. Target timeframe: within 24 hours.',
        'Stage 3, Investigation: Relevant team gathers information from the parties involved (Merchant, Rider, Property Partner, payment processor as applicable). Target timeframe: within 3 business days for standard complaints; expedited for safety issues.',
        'Stage 4, Resolution: NexGenius communicates the outcome, including any refund, compensation, or corrective action, to the complainant. Target timeframe: within 5 business days of submission.',
        'Stage 5, Escalation: If unresolved or the complainant disagrees with the outcome, the matter is escalated to a senior support lead for review. Target timeframe: within 5 further business days.',
      ],
      plainEnglish:
        'We acknowledge at once, sort within a day, and aim to resolve in 5 business days. Not happy? A senior lead reviews it.',
    },
    {
      id: 'safety-and-urgent-complaints',
      heading: 'Safety and Urgent Complaints',
      body: [
        '7.1 Complaints involving personal safety, harassment, or suspected criminal conduct shall be prioritised for immediate review and may result in immediate suspension of the relevant Rider, Merchant or End-User account pending investigation, regardless of the standard timeframes at clause 6.',
      ],
      plainEnglish:
        'Safety comes first. We may suspend an account straight away while we look into it.',
    },
    {
      id: 'external-escalation',
      heading: 'External Escalation',
      body: [
        '8.1 Where a complaint is not resolved to the complainant’s satisfaction through NexGenius’s internal process, the complainant may refer a consumer protection matter to the Competition Authority of Kenya, a data protection matter to the Office of the Data Protection Commissioner, or, in either case, pursue the matter through the courts of Kenya or, by mutual agreement, arbitration in Nairobi under the Arbitration Act, 1995.',
      ],
      plainEnglish:
        'Still not resolved? You can go to the Competition Authority, the Data Protection Commissioner or the courts.',
    },
    {
      id: 'record-keeping',
      heading: 'Record-Keeping',
      body: [
        '9.1 NexGenius shall maintain a record of all complaints and their resolution for a minimum of three (3) years, for quality assurance, regulatory reporting, and dispute-resolution purposes.',
      ],
      plainEnglish: 'We keep a record of every complaint for at least three years.',
    },
    {
      id: 'contact',
      heading: 'Contact',
      body: [
        '10.1 Refund and complaint requests may be submitted through the Platform’s Help/Support section, or by email to info@nexgapp.com.',
      ],
      plainEnglish: 'Use Help in the app or email info@nexgapp.com.',
    },
  ],
};
