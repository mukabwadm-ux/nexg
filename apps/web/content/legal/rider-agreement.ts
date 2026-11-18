import type { LegalDocument } from './types';

/**
 * Rider Independent Contract Agreement, transcribed from the client's Word
 * document "Rider Agreement". The operative wording is theirs; clause numbers
 * lost in the Word list formatting have been restored. The cover page,
 * signature blocks and blank party particulars are left out: this page is the
 * reference copy, and each rider's own copy is completed when they sign.
 * Deliveries are by motorbike only for now, so the clauses on other
 * vehicles (services, eligibility, safety, insurance) say motorcycle.
 * The plain-English notes are ours.
 */
export const riderAgreement: LegalDocument = {
  slug: 'rider-agreement',
  key: 'rider_agreement',
  title: 'Rider Agreement',
  tagline: 'For delivery partners',
  intro:
    'The Rider Independent Contract Agreement between Nexgenius Concierge Limited, a company incorporated under the laws of Kenya (the “Company” or “NexGenius”), and each rider who delivers through the NexGenius rider application (the “Rider”).',
  version: null,
  lastUpdated: '18 November 2026',
  draft: false,
  sections: [
    {
      id: 'nature-of-relationship',
      heading: 'Nature of Relationship',
      body: [
        '1.1 The Rider is engaged as an independent contractor and not as an employee, worker, partner or agent of NexGenius. Nothing in this Agreement shall be construed to create an employment relationship, and the Rider shall not be entitled to any benefit ordinarily available to an employee under the Employment Act, 2007, save as required by mandatory law.',
        '1.2 The Rider retains the right to determine when and whether to accept delivery requests offered through the NexGenius rider application, to use the Platform to also carry out third-party or personal errands, and to provide similar services to other platforms, subject only to the safety and conduct standards in this Agreement.',
        '1.3 The Parties acknowledge that the characterisation of this relationship as an independent contractor arrangement depends on the actual working relationship and not merely on this label; NexGenius shall administer the relationship consistently with that characterisation, including by not directing the Rider’s hours, exclusivity, or manner of work beyond what is reasonably necessary for platform safety and quality standards.',
      ],
      plainEnglish:
        'You are your own boss, not an employee. You choose when to ride and can work for other platforms too.',
    },
    {
      id: 'services',
      heading: 'Services',
      body: [
        '2.1 The Rider shall use the NexGenius rider application to accept, collect and deliver orders from Merchants and Property Partners to End-Users, using the Rider’s own motorcycle, and at the Rider’s own cost.',
        '2.2 The Rider shall handle goods with reasonable care, follow reasonable food-safety and handling guidance provided by NexGenius, and treat End-Users, Merchants and Property Partner staff courteously.',
      ],
      plainEnglish: 'You deliver orders on your own motorbike, carefully and politely.',
    },
    {
      id: 'eligibility-and-documentation',
      heading: 'Eligibility and Documentation',
      body: [
        '3.1 The Rider warrants that they hold a valid national identity document or passport, are at least eighteen (18) years old, and hold a valid driving licence for a motorcycle, valid motor insurance, and a valid PSV/boda-boda licence where required by the Traffic Act and NTSA regulations.',
        '3.2 The Rider shall provide copies of the above documents on onboarding and shall notify NexGenius immediately if any such document expires, is suspended, or is revoked.',
      ],
      plainEnglish:
        'You must be 18+, with ID, a licence and insurance. Tell us straight away if any of them lapses.',
    },
    {
      id: 'fees-and-payment',
      heading: 'Fees and Payment',
      body: [
        '4.1 The Rider shall be paid a delivery fee per completed order calculated in accordance with the fee structure communicated through the rider application, which may include a base fee, distance-based component, and applicable incentives.',
        '4.2 Payment shall be made to the Rider’s nominated mobile money or bank account on the payment cycle communicated by NexGenius (typically weekly).',
        '4.3 The Rider is responsible for their own operating costs, including fuel, vehicle maintenance, insurance and airtime/data.',
      ],
      plainEnglish:
        'You are paid per delivery, usually weekly, to M-Pesa or your bank. Fuel and upkeep are on you.',
    },
    {
      id: 'tax-status-and-withholding-tax-consent',
      heading: 'Tax Status and Withholding Tax Consent',
      body: [
        '5.1 The Rider acknowledges that, as an independent contractor, they are responsible for declaring and remitting their own income tax to the Kenya Revenue Authority (KRA) in respect of amounts earned under this Agreement, and that NexGenius does not withhold PAYE on the Rider’s behalf as it would for an employee.',
        '5.2 Where the Income Tax Act (Cap. 470) or KRA practice requires NexGenius to deduct withholding tax at the applicable rate on payments made to the Rider (including under any digital service tax, turnover tax withholding, or other withholding obligation applicable to payments made through a digital marketplace), the Rider hereby expressly consents to NexGenius: (a) deducting the applicable withholding tax from payments due to the Rider; (b) remitting such tax to the KRA under NexGenius’s or its nominated agent’s PIN, as required; and (c) issuing the Rider a withholding tax certificate reflecting the amount deducted, which the Rider may use to claim credit against their own tax liability.',
        '5.3 The Rider shall provide their KRA PIN to NexGenius as a condition of onboarding and payment, and shall keep this information current.',
        '5.4 This consent does not relieve the Rider of the obligation to file their own tax returns and account for any balance of tax due beyond amounts withheld under this clause.',
      ],
      plainEnglish:
        'You file your own taxes. Where the law requires it we deduct withholding tax and give you a certificate. We need your KRA PIN.',
    },
    {
      id: 'equipment-and-branding',
      heading: 'Equipment and Branding',
      body: [
        '6.1 Where NexGenius provides branded equipment (delivery bag, uniform items, or similar), such items remain the property of NexGenius and shall be returned on termination of this Agreement, failing which their replacement cost may be deducted from amounts due to the Rider.',
      ],
      plainEnglish: 'Branded kit stays ours. Return it when you stop, or we deduct what it costs.',
    },
    {
      id: 'conduct-and-safety',
      heading: 'Conduct and Safety',
      body: [
        '7.1 The Rider shall comply with traffic laws, wear any required safety equipment (including a helmet), and shall not operate under the influence of alcohol or drugs while performing services.',
        '7.2 The Rider shall not request or accept payment from an End-User, Merchant or Property Partner outside the Platform for orders routed through the Platform, and shall not solicit End-Users met through the Platform to transact off-platform.',
        '7.3 NexGenius may suspend or deactivate the Rider’s account for breach of this clause 7, for safety incidents, for a pattern of verified complaints, or for expiry of a required licence or insurance document under clause 3.',
      ],
      plainEnglish:
        'Ride safely and sober, wear a helmet, and take no payments outside the app, or your account may be closed.',
    },
    {
      id: 'insurance-and-liability',
      heading: 'Insurance and Liability',
      body: [
        '8.1 The Rider is responsible for maintaining insurance appropriate to their motorcycle as required by law. NexGenius does not provide statutory workmen’s compensation cover to the Rider given the independent contractor relationship, and the Rider is encouraged to maintain personal accident cover.',
        '8.2 The Rider shall indemnify NexGenius against claims arising from the Rider’s negligent or unlawful conduct in the performance of services, save to the extent caused by NexGenius’s own default.',
      ],
      plainEnglish:
        'Keep your own insurance; we do not provide work-injury cover. You answer for harm you cause.',
    },
    {
      id: 'data-protection',
      heading: 'Data Protection',
      body: [
        '9.1 NexGenius processes the Rider’s personal data, including real-time location during active deliveries, in accordance with the Data Protection Act, 2019, for the purposes of order routing, safety, performance monitoring, and payment. Details are set out in the Rider Privacy Notice provided on onboarding.',
      ],
      plainEnglish:
        'We see your location during deliveries, and use your data to route, protect and pay you.',
    },
    {
      id: 'term-and-termination',
      heading: 'Term and Termination',
      body: [
        '10.1 This Agreement continues until terminated by either Party on written notice through the rider application or by email, with immediate effect for breach of clause 7, or for safety, fraud or documentation reasons under clause 3.2, and otherwise on seven (7) days’ notice by either Party.',
      ],
      plainEnglish:
        'Either side can end it with 7 days’ notice, or at once for safety, fraud or missing papers.',
    },
    {
      id: 'governing-law',
      heading: 'Governing Law',
      body: [
        '11.1 This Agreement is governed by the laws of Kenya. Disputes shall first be raised through NexGenius’s rider support channel and, if unresolved within thirty (30) days, may be referred to arbitration in Nairobi under the Arbitration Act, 1995.',
      ],
      plainEnglish:
        'Kenyan law applies. Raise disputes with rider support first, then arbitration after 30 days.',
    },
  ],
};
