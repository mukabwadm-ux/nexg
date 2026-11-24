import type { LegalDocument } from './types';

/**
 * End-User Terms and Conditions, transcribed from the client's Word document
 * "1.3 End-User Terms and Conditions and Privacy Policy". The operative
 * wording is theirs; only the clause numbers lost in the Word list formatting
 * have been restored, and the blank contact details are the ones the site
 * already publishes (info@nexgapp.com, as in the Refunds policy, and the
 * postal address in the Cookie Policy). The plain-English notes are ours.
 *
 * The document's Part II, the Privacy Policy, is the separate /legal/privacy
 * page. Its effective date is still blank, so `version` stays null.
 */
export const terms: LegalDocument = {
  slug: 'terms',
  key: 'terms',
  title: 'End-User Terms and Conditions',
  tagline: 'Rules for using NexG as a customer',
  intro:
    'These End-User Terms and Conditions (“Terms”) govern access to and use of the NexGenius mobile application and website (together, the “Platform”) operated by NexGenius Concierge Limited (“NexGenius”, “we”, “us”). By creating an account or using the Platform you agree to be bound by these Terms.',
  version: null,
  lastUpdated: '23 November 2026',
  draft: false,
  sections: [
    {
      id: 'the-service',
      heading: 'The Service',
      body: [
        '1.1 NexGenius operates a technology platform that connects users (“you”, the “End-User”) with independent riders (“Riders”), merchants (“Merchants”) and participating hotels or properties (“Property Partners”) to enable the ordering, delivery and concierge fulfilment of goods and services.',
        '1.2 NexGenius is a technology intermediary. Riders are independent contractors and Merchants are independent businesses; NexGenius does not itself sell, prepare, or deliver the goods or services ordered through the Platform, save where expressly stated.',
      ],
      plainEnglish:
        'We connect you with riders, merchants and hotels. Most of what you order is sold and delivered by them, not by us.',
    },
    {
      id: 'eligibility-and-account-registration',
      heading: 'Eligibility and Account Registration',
      body: [
        '2.1 You must be at least eighteen (18) years old and capable of forming a binding contract under Kenyan law to create an account. You warrant that all registration information you provide is accurate, current and complete.',
        '2.2 You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Notify us immediately at info@nexgapp.com of any unauthorised use.',
      ],
      plainEnglish:
        'You must be 18+. Keep your sign-in private and tell us if someone else uses it.',
    },
    {
      id: 'orders-pricing-and-payment',
      heading: 'Orders, Pricing and Payment',
      body: [
        '3.1 Prices displayed on the Platform are set by the relevant Merchant or Property Partner and may include a NexGenius service fee, delivery fee and applicable taxes, each shown separately before checkout.',
        '3.2 Payment may be made by mobile money, card, or such other method as NexGenius enables from time to time through its licensed payment service provider. By submitting payment details you authorise NexGenius and its payment processor to charge the total order value.',
        '3.3 Orders are subject to acceptance by the relevant Merchant. NexGenius may cancel or decline any order at its discretion, including for suspected fraud, unavailability of items, or safety concerns, and will refund any amount already charged for a cancelled order in accordance with the Refund, Cancellation and Complaints Policy.',
      ],
      plainEnglish:
        'Merchants set prices; every fee is shown before you pay. If an order is cancelled, you get your money back.',
    },
    {
      id: 'delivery',
      heading: 'Delivery',
      body: [
        '4.1 Estimated delivery times are indicative only and not guaranteed. NexGenius is not liable for delays caused by traffic, weather, Rider availability, or circumstances beyond its reasonable control.',
        '4.2 You must provide an accurate delivery location and be reasonably available to receive the order. Where you are not available within a reasonable period after Rider arrival, the order may be treated as delivered and no refund will be due save as required by Kenyan consumer protection law.',
      ],
      plainEnglish:
        'Times are estimates. Give the right address and be there when the rider arrives.',
    },
    {
      id: 'user-conduct',
      heading: 'User Conduct',
      body: [
        '5.1 You shall not use the Platform to:',
        '(a) order or request unlawful goods or services;',
        '(b) harass, threaten or endanger a Rider, Merchant or Property Partner representative;',
        '(c) provide false information; or',
        '(d) attempt to circumvent NexGenius’s payment or fee systems by arranging off-platform transactions with a Rider or Merchant met through the Platform.',
        '5.2 NexGenius may suspend or terminate your account for breach of clause 5.1, safety concerns, or suspected fraud, with or without notice depending on severity.',
      ],
      plainEnglish:
        'Nothing unlawful, no abuse, no lies, and no deals off the app. Break this and we may close your account.',
    },
    {
      id: 'ratings-reviews-and-content',
      heading: 'Ratings, Reviews and Content',
      body: [
        '6.1 You may be invited to rate and review Riders, Merchants and Property Partners. Reviews must be honest, based on genuine experience, and free of defamatory, hateful or unlawful content. NexGenius may remove content that breaches this clause.',
      ],
      plainEnglish: 'Reviews must be honest and decent, or we take them down.',
    },
    {
      id: 'intellectual-property',
      heading: 'Intellectual Property',
      body: [
        '7.1 The Platform, including its software, design, trademarks and content (excluding Merchant-supplied content), is owned by or licensed to NexGenius and protected under the Copyright Act, 2001 and the Trade Marks Act. You are granted a limited, non-exclusive, non-transferable licence to use the Platform for personal, non-commercial ordering purposes only.',
      ],
      plainEnglish: 'The Platform is ours. You may use it to order for yourself.',
    },
    {
      id: 'limitation-of-liability',
      heading: 'Limitation of Liability',
      body: [
        '8.1 To the maximum extent permitted by Kenyan law, NexGenius’s aggregate liability to you arising out of or in connection with the Platform shall not exceed the value of the order giving rise to the claim in the ninety (90) days preceding the event. NexGenius is not liable for indirect, incidental or consequential loss.',
        '8.2 Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited, including liability for death or personal injury caused by NexGenius’s negligence or for fraud.',
      ],
      plainEnglish:
        'Our liability is capped at the value of the order in question, except where the law does not allow a cap.',
    },
    {
      id: 'indemnity',
      heading: 'Indemnity',
      body: [
        '9.1 You agree to indemnify NexGenius against claims, losses and costs arising from your breach of these Terms or your misuse of the Platform, save to the extent caused by NexGenius’s own default.',
      ],
      plainEnglish: 'If your breach or misuse costs us money, you cover it.',
    },
    {
      id: 'data-protection',
      heading: 'Data Protection',
      body: [
        '10.1 NexGenius processes your personal data in accordance with the Privacy Policy set out in Part II of this document and the Data Protection Act, 2019.',
      ],
      plainEnglish: 'Our Privacy Policy explains how we handle your data.',
    },
    {
      id: 'suspension-and-termination',
      heading: 'Suspension and Termination',
      body: [
        '11.1 Either party may terminate the account relationship at any time. NexGenius may suspend or terminate access immediately for breach of these Terms, suspected fraud, or a legal or regulatory requirement to do so.',
      ],
      plainEnglish:
        'You can leave any time. We can suspend you for a breach, fraud or a legal reason.',
    },
    {
      id: 'changes-to-these-terms',
      heading: 'Changes to these Terms',
      body: [
        '12.1 NexGenius may update these Terms from time to time. Material changes will be notified through the Platform or by email at least seven (7) days before taking effect. Continued use after the effective date constitutes acceptance.',
      ],
      plainEnglish: 'We give you 7 days’ notice of important changes.',
    },
    {
      id: 'governing-law-and-disputes',
      heading: 'Governing Law and Disputes',
      body: [
        '13.1 These Terms are governed by the laws of Kenya. Disputes shall first be raised through NexGenius’s complaints process (see the Refund, Cancellation and Complaints Policy). Unresolved disputes shall be subject to the exclusive jurisdiction of the courts of Kenya, save that either party may refer a dispute to arbitration in Nairobi under the Arbitration Act, 1995 by mutual written agreement.',
      ],
      plainEnglish: 'Kenyan law applies. Complain to us first; then the Kenyan courts.',
    },
    {
      id: 'contact',
      heading: 'Contact',
      body: [
        'Questions about these Terms may be sent to info@nexgapp.com or NexGenius Concierge Limited, P.O. Box 50691-00100, Nairobi.',
      ],
      plainEnglish: 'Email info@nexgapp.com or write to us in Nairobi.',
    },
  ],
};
