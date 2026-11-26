import type { LegalDocument } from './types';

/**
 * Privacy Policy, transcribed from the client's Word document "Nexg Privacy
 * Policy". The operative wording is theirs; the clause number for section 11
 * (lost in the Word list formatting) has been restored. The plain-English
 * notes are ours.
 */
export const privacy: LegalDocument = {
  slug: 'privacy',
  key: 'privacy',
  title: 'Privacy Policy',
  tagline: 'What we collect and why',
  intro:
    'This Privacy Policy explains how NexGenius Concierge Limited collects, uses, shares and protects personal data in connection with the Platform, in compliance with the Data Protection Act, 2019 and its Regulations.',
  version: null,
  lastUpdated: '18 November 2026',
  draft: false,
  sections: [
    {
      id: 'data-we-collect',
      heading: 'Data We Collect',
      body: [
        'Account data: name, phone number, email address, date of birth (where relevant), delivery address.',
        'Order data: items ordered, order value, order history, delivery instructions.',
        'Location data: GPS location at time of order and during delivery tracking.',
        'Payment data: payment method tokens processed by our licensed payment service provider; NexGenius does not store full card numbers.',
        'Device and usage data: device identifiers, IP address, app version, crash logs, and interaction data collected via cookies and SDKs.',
        'Support data: records of communications with our customer support team, including complaint details.',
      ],
      plainEnglish:
        'Your contact details, what you order, where it goes, how you pay (never your full card number), your device, and your support chats.',
    },
    {
      id: 'how-we-use-your-data',
      heading: 'How We Use Your Data',
      body: [
        'We use your personal data to:',
        '(a) create and manage your account;',
        '(b) process and fulfil orders, including sharing necessary details with the relevant Rider, Merchant or Property Partner;',
        '(c) process payments and prevent fraud;',
        '(d) provide customer support;',
        '(e) improve and personalise the Platform;',
        '(f) send service communications and, where you have opted in, marketing communications; and',
        '(g) comply with legal and regulatory obligations, including tax and anti-money-laundering requirements.',
      ],
      plainEnglish:
        'To run your account and orders, take payment safely, help you, improve NexG, and meet the law. Marketing only if you opt in.',
    },
    {
      id: 'legal-basis',
      heading: 'Legal Basis for Processing',
      body: [
        'We process your data on the basis of:',
        '(a) performance of a contract with you (order fulfilment, account management);',
        '(b) your consent (marketing communications, precise location tracking where not strictly necessary for order fulfilment);',
        '(c) our legitimate interests (fraud prevention, service improvement), balanced against your rights; and',
        '(d) compliance with a legal obligation (tax records, regulatory reporting).',
      ],
      plainEnglish:
        'Mostly because we need it to deliver your order. Marketing and extra location tracking need your consent.',
    },
    {
      id: 'sharing-of-data',
      heading: 'Sharing of Data',
      body: [
        'We share your data with:',
        '(a) the Rider assigned to your order, limited to what is necessary for delivery (name, delivery location, contact number);',
        '(b) the Merchant or Property Partner fulfilling your order;',
        '(c) our payment service provider;',
        '(d) cloud hosting and infrastructure providers acting as our data processors under written Data Processing Agreements; and',
        '(e) regulators, law enforcement or courts where required by law.',
        'We do not sell your personal data to third parties.',
      ],
      plainEnglish:
        'Only with those who make your order happen, our service providers, and the authorities when the law requires. Never sold.',
    },
    {
      id: 'cross-border-transfers',
      heading: 'Cross-Border Transfers',
      body: [
        'Where any service provider processes your data outside Kenya, we ensure an appropriate transfer safeguard is in place, such as contractual data protection clauses, consistent with section 48 of the Data Protection Act, 2019.',
      ],
      plainEnglish: 'If your data is handled outside Kenya, it is protected by contract first.',
    },
    {
      id: 'data-retention',
      heading: 'Data Retention',
      body: [
        'We retain account and order data for as long as your account is active and for up to seven (7) years thereafter to meet tax and legal record-keeping obligations. Precise trip geolocation data is retained for ninety (90) days after delivery, save where needed longer for an active safety, fraud or legal investigation.',
      ],
      plainEnglish:
        'Order records up to 7 years after you close your account, for tax. Exact delivery locations for 90 days.',
    },
    {
      id: 'your-rights',
      heading: 'Your Rights',
      body: [
        'Under the Data Protection Act, 2019 you have the right to: be informed of the use of your data; access your data; request correction of inaccurate data; request deletion of data no longer necessary for the purpose collected; object to or restrict certain processing; data portability; and to lodge a complaint with the Office of the Data Protection Commissioner. Requests may be made through the Platform’s privacy settings or by writing to our Data Protection Officer at derrick@nexgapp.com.',
      ],
      plainEnglish:
        'You can see, correct, move or delete your data, or object. Ask us or the Commissioner.',
    },
    {
      id: 'security',
      heading: 'Security',
      body: [
        'We apply technical and organisational measures including encryption in transit and at rest, access controls, and staff confidentiality obligations to protect your data. No system is completely secure, and we encourage you to safeguard your account credentials.',
      ],
      plainEnglish:
        'We encrypt and restrict access to your data. Keep your own sign-in codes private too.',
    },
    {
      id: 'children',
      heading: 'Children',
      body: [
        'The Platform is not directed at persons under eighteen (18) and we do not knowingly collect data from children. If we become aware that we have inadvertently collected such data, we will delete it promptly.',
      ],
      plainEnglish: 'NexG is for adults. Any children’s data we find, we delete.',
    },
    {
      id: 'changes',
      heading: 'Changes to this Policy',
      body: [
        'We may update this Privacy Policy from time to time. Material changes will be notified through the Platform at least seven (7) days before taking effect.',
      ],
      plainEnglish: 'We give you 7 days’ notice of important changes.',
    },
    {
      id: 'contact-and-complaints',
      heading: 'Contact and Complaints',
      body: [
        'For privacy queries or to exercise your rights, contact our Data Protection Officer at derrick@nexgapp.com. You may also lodge a complaint with the Office of the Data Protection Commissioner, Kenya, via dataprotection.go.ke.',
      ],
      plainEnglish: 'Email derrick@nexgapp.com, or complain to the Data Protection Commissioner.',
    },
  ],
  // Ours, like the plain-English notes: each point restates a section above.
  glance: [
    'We never sell your personal data.',
    'Your rider gets only what they need to deliver: your name, delivery location and contact number.',
    'Exact delivery locations are kept for 90 days after delivery, unless an investigation needs them longer.',
    'Order records are kept for up to 7 years after you close your account, for tax.',
    'Marketing only if you opt in.',
    'You can ask to see, correct, move or delete your data.',
  ],
  request: {
    afterSection: 'your-rights',
    title: 'Make a privacy request',
    text: 'To see, correct, move or delete your data, write to our Data Protection Officer.',
    email: 'derrick@nexgapp.com',
    label: 'Email the privacy team',
    link: { href: '/account/delete', label: 'Delete your account' },
  },
};
