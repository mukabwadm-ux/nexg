import type { LegalDocument } from './types';

/**
 * Merchant Agreement, transcribed from the client's Word document. The
 * operative wording is theirs; clause numbers lost in the Word list
 * formatting have been restored (they match the cross-references: 4.3, 4.4,
 * clause 6). The cover page, signature blocks and blank party particulars are
 * left out, since each merchant's own copy is completed when they sign. In
 * clause 11 a stray fragment ("s governed by the laws of Kenya.") repeating
 * 11.1 is dropped. The plain-English notes are ours.
 *
 * Annex A (Commission Schedule) and Annex B (Onboarding Warranties) are
 * referred to but were not supplied with the document.
 */
export const merchantAgreement: LegalDocument = {
  slug: 'merchant-terms',
  key: 'merchant_terms',
  title: 'Merchant Agreement',
  tagline: 'For businesses selling on NexG',
  intro:
    'The Merchant Agreement between Nexgenius Concierge Limited, a company incorporated under the laws of Kenya (the “Company” or “NexGenius”), and each business that lists and sells its goods or services on the NexGenius platform (the “Merchant”).',
  version: null,
  lastUpdated: '18 November 2026',
  draft: false,
  sections: [
    {
      id: 'appointment',
      heading: 'Appointment',
      body: [
        '1.1 NexGenius appoints the Merchant, on a non-exclusive basis, to list and offer its goods and/or services for order through the NexGenius platform (the “Platform”), and the Merchant accepts that appointment on the terms of this Agreement.',
        '1.2 Nothing in this Agreement creates a partnership, joint venture, agency (save the limited payment collection agency at clause 4.3) or employment relationship between the Parties. The Merchant remains an independent business responsible for its own staff, licensing, and regulatory compliance.',
      ],
      plainEnglish:
        'You can sell on NexG, and on other platforms too. You stay an independent business.',
    },
    {
      id: 'onboarding',
      heading: 'Onboarding',
      body: [
        '2.1 The Merchant shall complete the onboarding process, including verification of business registration, applicable licences (health, trade, liquor or other sector licences as relevant), tax registration (KRA PIN), and bank/mobile-money settlement details, before activation on the Platform.',
        '2.2 The Merchant’s specific onboarding warranties are set out in Annex B (Onboarding Warranties Annex) and are incorporated into and form part of this Agreement.',
      ],
      plainEnglish:
        'Before you go live we check your registration, licences, KRA PIN and payout details.',
    },
    {
      id: 'listing-and-order-fulfilment',
      heading: 'Listing and Order Fulfilment',
      body: [
        '3.1 The Merchant shall maintain accurate and current listings, including pricing, availability, and descriptions, and shall promptly update the Platform when an item becomes unavailable.',
        '3.2 The Merchant shall accept, prepare and hand over orders within the timeframes indicated on the Platform, and shall maintain applicable food safety, hygiene, pharmacy or other regulatory standards for its sector at all times.',
        '3.3 The Merchant shall package orders adequately for transport and shall not include any item not ordered or any unlawful item.',
      ],
      plainEnglish:
        'Keep your listings and prices accurate, prepare orders on time, and pack them well.',
    },
    {
      id: 'fees-commission-and-settlement',
      heading: 'Fees, Commission and Settlement',
      body: [
        '4.1 The Merchant shall pay NexGenius a commission on each completed order, calculated in accordance with the Commission Schedule at Annex A.',
        '4.2 NexGenius shall remit to the Merchant the order value net of the applicable commission and any agreed processing fee, on the settlement cycle set out in Annex A, into the bank or mobile-money account nominated by the Merchant.',
        '4.3 Where NexGenius collects payment from the End-User on the Merchant’s behalf, NexGenius does so as a limited payment collection agent of the Merchant solely for the purpose of facilitating settlement, and holds such funds, pending settlement, for the account of the Merchant less the commission due to NexGenius.',
        '4.4 NexGenius may withhold or offset settlement against amounts due to it for commission, refunds, chargebacks or verified customer complaints attributable to the Merchant.',
      ],
      plainEnglish:
        'We collect the customer’s payment for you and pay it out less our commission. Refunds you cause come off your payout.',
    },
    {
      id: 'cancellations-and-refunds',
      heading: 'Cancellations and Refunds',
      body: [
        '5.1 Cancellations and refunds shall be handled in accordance with NexGenius’s Refund, Cancellation and Complaints Policy, which the Merchant agrees to honour for orders attributable to Merchant error, including incorrect items, spoiled goods, or failure to fulfil an accepted order.',
      ],
      plainEnglish: 'If you get an order wrong, the Refund policy applies and you cover it.',
    },
    {
      id: 'merchant-warranties',
      heading: 'Merchant Warranties',
      body: [
        '6.1 The Merchant warrants that it holds all licences, permits and regulatory approvals required to lawfully sell the goods or services listed, that such goods and services comply with applicable Kenyan law (including, where relevant, the Public Health Act, the Pharmacy and Poisons Act, and the Food, Drugs and Chemical Substances Act), and that it will maintain such compliance throughout the term of this Agreement.',
        '6.2 The Merchant warrants that pricing displayed on the Platform will not exceed the Merchant’s standard in-store or direct pricing for the same item, save for a clearly disclosed delivery premium agreed with NexGenius.',
      ],
      plainEnglish:
        'You hold the licences you need, and you charge no more on NexG than in your own shop.',
    },
    {
      id: 'data-protection',
      heading: 'Data Protection',
      body: [
        '7.1 Each Party shall comply with the Data Protection Act, 2019 in respect of personal data shared under this Agreement. Where the Merchant processes End-User personal data received via the Platform, the terms of the Data Processing Agreement apply and are incorporated by reference.',
        '7.2 The Merchant shall not use End-User contact details obtained through the Platform for direct marketing outside the Platform without the End-User’s separate consent.',
      ],
      plainEnglish:
        'Protect customers’ data under the Data Processing Agreement, and don’t market to them outside NexG without their consent.',
    },
    {
      id: 'intellectual-property-and-branding',
      heading: 'Intellectual Property and Branding',
      body: [
        '8.1 Each Party retains ownership of its own trademarks, logos and content. The Merchant grants NexGenius a non-exclusive licence to display the Merchant’s name, logo, menu/catalogue and related content on the Platform and in NexGenius marketing, for the term of this Agreement.',
      ],
      plainEnglish:
        'Your brand stays yours. We may show your name, logo and menu on NexG and in our marketing.',
    },
    {
      id: 'term-and-termination',
      heading: 'Term and Termination',
      body: [
        '9.1 This Agreement commences on the date of onboarding approval and continues until terminated by either Party on thirty (30) days’ written notice, or immediately by NexGenius for:',
        '(a) breach of clause 6 (Merchant Warranties);',
        '(b) repeated verified customer complaints;',
        '(c) suspected fraud; or',
        '(d) loss of a licence required to trade.',
        '9.2 On termination, outstanding settlement due to the Merchant shall be paid within the next scheduled settlement cycle, less any amounts properly withheld under clause 4.4.',
      ],
      plainEnglish:
        'Either side can end it on 30 days’ notice; we can end it at once for fraud, complaints or lost licences. You are paid what is owed.',
    },
    {
      id: 'liability',
      heading: 'Liability',
      body: [
        '10.1 Save for liability which cannot be excluded under Kenyan law, NexGenius’s aggregate liability to the Merchant under this Agreement shall not exceed the total commission paid by the Merchant to NexGenius in the three (3) months preceding the claim.',
        '10.2 Any commission or omission directly attributable to the quality of service or goods delivered by the Merchant shall be the sole liability of the Merchant.',
      ],
      plainEnglish:
        'Our liability is capped at three months of commission. Problems with your goods are yours.',
    },
    {
      id: 'governing-law-and-dispute-resolution',
      heading: 'Governing Law and Dispute Resolution',
      body: [
        '11.1 This Agreement and the interpretation of its terms shall be governed by and construed in accordance with the laws of Kenya.',
        '11.2 Any disputes not resolved by good-faith negotiation within thirty (30) days shall be referred to arbitration in Nairobi under the Arbitration Act, 1995.',
        '11.3 Parties shall endeavor to resolve any dispute arising out of or relating to this Agreement, including any disputes regarding its formation, interpretation, performance, validity, breach or termination thereof, shall in the first instance be referred to the Parties for amicable resolution by direct negotiation, in good faith, within thirty (30) days of a written notice of dispute by one party to the other.',
        '11.4 If the dispute is not resolved within thirty (30) days of the written notice of dispute, the said negotiation fails, and the dispute shall be submitted to mediation under the rules of a mutually agreed mediation institution, without prejudice to either Party’s right.',
      ],
      plainEnglish:
        'Kenyan law applies. Talk it through for 30 days first, then go to a neutral third party.',
    },
  ],
};
