import type { LegalDocument } from './types';

/**
 * Terms of service, transcribed from the signed-off `Terms of Service`
 * artboard. The wording is the client's, including the draft notice.
 *
 * `draft` stays true and `version` stays null until a Kenyan lawyer has
 * reviewed it. Both are read by the page and by any acceptance recorded
 * against it — there is deliberately no way to accept an unversioned
 * document.
 */
export const terms: LegalDocument = {
  slug: 'terms',
  key: 'terms',
  title: 'Terms of Service',
  tagline: 'Rules for using NexG as a guest',
  intro:
    'The rules for using NexG as a guest. We’ve written a plain-English summary beside every section — the summary helps you read, but the full text is what applies.',
  version: null,
  lastUpdated: null,
  draft: true,
  sections: [
    {
      id: 'who-we-are',
      heading: 'Who we are',
      body: [
        'NexG is operated by Nexgenius Concierge Limited, a company registered in Kenya. Contact details and registered office are listed at the end of this document.',
      ],
      plainEnglish: 'We are a Kenyan company. Here is how to reach us.',
    },
    {
      id: 'what-nexg-does',
      heading: 'What NexG does',
      body: [
        'NexG is a platform that lets you request goods and services from independent merchants and have them delivered by independent riders, with help from our concierge team. NexG is not the seller of the goods or the provider of the delivery unless we say so explicitly for a particular service.',
      ],
      plainEnglish:
        'We connect you with merchants and riders. Most of what you order is sold by them, not by us.',
    },
    {
      id: 'your-account',
      heading: 'Your account',
      body: [
        'You can order as a guest without an account. If you create one, you are responsible for keeping your phone number current and your one-time codes private. You must be 18 or older to create an account or place an order.',
      ],
      plainEnglish: 'Keep your phone number up to date. You must be 18+.',
    },
    {
      id: 'placing-an-order',
      heading: 'Placing an order',
      body: [
        'The price, delivery fee, service fee (if any) and estimated delivery time are shown before you confirm. By confirming you agree to pay that amount. Merchant prices may differ from in-store prices.',
      ],
      plainEnglish: 'You see the full price before you confirm. That is what you pay.',
    },
    {
      id: 'payments',
      heading: 'Payments',
      body: [
        'We accept M-Pesa, cards, pay on delivery (where offered) and charge-to-room at participating hotels. Card payments are processed by our payment provider; we do not store full card numbers. Pay-on-delivery orders may be limited in value or require a confirmed phone number.',
      ],
      plainEnglish: 'Pay how you like. We never store your full card number.',
    },
    {
      id: 'cancellations-and-refunds',
      heading: 'Cancellations and refunds',
      body: [
        'You can cancel free of charge until the merchant confirms your order. After that, cancellation fees may apply as set out in our Refunds & Cancellations policy. Refunds are returned to the original payment method.',
      ],
      plainEnglish: 'Cancel free until the merchant confirms. After that, see the Refunds policy.',
    },
    {
      id: 'concierge-requests',
      heading: 'Concierge requests',
      body: [
        'For requests outside the catalogue, a concierge will quote a price and time before anything is purchased on your behalf. Nothing is bought until you approve the quote.',
      ],
      plainEnglish: 'For special requests, we quote first. Nothing is bought until you say yes.',
    },
    {
      id: 'delivery-and-tracking',
      heading: 'Delivery and tracking',
      body: [
        'Delivery times are estimates. You can track your rider live. If an order is late or incomplete, tell us through the order screen and we will investigate with the merchant and rider.',
      ],
      plainEnglish: 'Times are estimates. Track live, and tell us quickly if something is wrong.',
    },
    {
      id: 'restricted-items',
      heading: 'Restricted items',
      body: [
        'Alcohol is delivered only to persons aged 18 or over and a rider may ask for ID. We do not deliver prescription medicines, weapons, or items prohibited under Kenyan law.',
      ],
      plainEnglish: 'Alcohol is 18+ with ID. Some items we simply will not carry.',
    },
    {
      id: 'your-conduct',
      heading: 'Your conduct',
      body: [
        'Treat riders, merchants and concierge staff with respect. Abuse, fraud, chargeback abuse or repeated pay-on-delivery refusals may lead to account suspension.',
      ],
      plainEnglish: 'Be decent to the people serving you, or we may close your account.',
    },
    {
      id: 'our-liability',
      heading: 'Our liability',
      body: [
        'To the extent permitted by law, NexG’s liability for any order is limited to the amount you paid for that order. We are not liable for the quality of goods supplied by merchants beyond helping you obtain a refund or replacement.',
      ],
      plainEnglish:
        'If something goes wrong, our liability is capped at what you paid for that order.',
    },
    {
      id: 'changes-to-these-terms',
      heading: 'Changes to these terms',
      body: [
        'We may update these terms. We will show the “last updated” date at the top and, for material changes, notify you in the app or by SMS before they take effect.',
      ],
      plainEnglish: 'If we change something important, we will tell you first.',
    },
    {
      id: 'governing-law-and-disputes',
      heading: 'Governing law and disputes',
      body: [
        'These terms are governed by the laws of Kenya. Disputes will first be handled through our support team; unresolved disputes may be referred to the courts of Kenya.',
      ],
      plainEnglish: 'Kenyan law applies. Talk to support first.',
    },
  ],
};
