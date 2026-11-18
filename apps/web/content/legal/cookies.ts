import type { LegalDocument } from './types';

/**
 * Cookies Policy, transcribed from the client's Word document. The operative
 * wording is theirs. The opening scope paragraphs are joined into the intro
 * so the thirteen numbered sections keep the numbers the text refers to
 * ("section 4", "section 13"); the tables are written out row by row.
 *
 * Two edits from the Word file: the ODPC registration number is still blank
 * there, so the sentence stops before it, and the Data Protection Officer's
 * email is given as the nexgapp.com address in both places (the Word file had
 * a personal address in section 13). The plain-English notes are ours.
 *
 * Schedule 1, the list of cookies and providers the text refers to, has not
 * been supplied yet.
 */
export const cookies: LegalDocument = {
  slug: 'cookies',
  key: 'cookies',
  title: 'Cookie Policy',
  tagline: 'Cookies and similar tech',
  intro:
    'We set only strictly necessary cookies without asking you; every other cookie or tracking technology is switched off until you choose to allow it, and you can change your choice at any time. This Cookies Policy explains what we use, why, and how you control it. It applies to every part of the NexGenius platform (the “Platform”) where cookies, software development kits (SDKs) or similar technologies are used: the NexGenius mobile application; the NexGenius website at www.nexgapp.com; the web ordering pages that open when you scan a NexGenius QR code at a hotel or other Property Partner premises; and the web dashboards used by Merchants, Riders and Property Partners. This Cookies Policy forms part of, and should be read together with, the Privacy Policy in Part II of our End-User Terms and Conditions. Words defined in those Terms have the same meaning here.',
  version: null,
  lastUpdated: '18 November 2026',
  draft: false,
  sections: [
    {
      id: 'who-we-are',
      heading: 'Who we are',
      body: [
        'The Platform is operated by NexGenius Concierge Limited (“NexGenius”, “we”, “us”), a private limited company incorporated in Kenya under Certificate of Incorporation No. PVT-L51DZJ32, of P.O. Box 50691-00100, Nairobi, Kenya.',
        'NexGenius is the data controller for personal data collected through first-party cookies and SDKs on the Platform. We are registered with the Office of the Data Protection Commissioner (ODPC) as a data controller and data processor under section 18 of the Data Protection Act, 2019 (the “Act”).',
        'Where a third party sets its own cookies on the Platform, that third party may also act as a controller of the data it collects. Section 6 and Schedule 1 identify those third parties.',
        'Our Data Protection Officer can be reached at derrick@nexgapp.com or at the postal address above.',
      ],
      plainEnglish:
        'We are a Kenyan company registered with the Data Protection Commissioner. Here is how to reach our data protection officer.',
    },
    {
      id: 'what-cookies-are',
      heading: 'What cookies and similar technologies are',
      body: [
        'Cookies are small text files that a website stores on your device to remember information such as your login, preferences and activity. Our mobile application achieves the same results through other technologies. In this Cookies Policy, “cookies” covers all of the following:',
        'Cookies: text files placed in your web browser by the website or QR ordering page you visit.',
        'SDKs: pieces of code from us or a third-party provider built into our mobile application, which collect device and usage information.',
        'Local and session storage: data stored by your browser or our application on your device, used in the same way as cookies.',
        'Pixels, tags and web beacons: small pieces of code or tiny images that record when a page is viewed or an email is opened.',
        'Device and advertising identifiers: identifiers assigned by your device’s operating system, such as the Android Advertising ID or Apple’s Identifier for Advertisers (IDFA), and push-notification tokens.',
      ],
      plainEnglish:
        '“Cookies” here means anything that remembers you on your device, in the browser or in the app.',
    },
    {
      id: 'types-of-cookies',
      heading: 'Types of cookies we use',
      body: [
        'Every cookie on the Platform is either a session or a persistent cookie, and either a first-party or a third-party cookie. Schedule 1 states which applies to each one.',
        'Session cookie: deleted automatically when you close your browser or end your app session. Example: keeping your basket while you order from a hotel room via a QR code.',
        'Persistent cookie: stays on your device for a fixed period, or until you delete it. Example: remembering your cookie choices for 12 months.',
        'First-party cookie: set by NexGenius on our own domain or application. Example: keeping you signed in to your account.',
        'Third-party cookie: set by another organisation whose service we use. Example: analytics, crash-reporting, advertising or payment providers listed in Schedule 1.',
      ],
      plainEnglish:
        'Some cookies last only while you browse, some stay longer. Some are ours, some belong to services we use.',
    },
    {
      id: 'why-we-use-cookies',
      heading: 'Why we use cookies and our legal basis',
      body: [
        'We group cookies into four categories. Only the first is switched on by default; the other three are used only with your consent.',
        'Strictly necessary: keep you signed in; secure your session and prevent fraud; keep your basket and checkout working; link a QR-code order to the correct property and room; balance traffic across our servers; collect crash and stability diagnostics; remember your cookie choices. Legal basis: necessary to perform our contract with you, and our legitimate interests in security and fraud prevention (section 30(1)(b)). Default: always on, the Platform cannot work without them.',
        'Functional: remember your language, recently viewed Merchants and other preferences; power the in-app or website support chat. Legal basis: your consent (sections 30(1)(a) and 32). Default: off until you allow them.',
        'Analytics and performance: count visits and screens viewed; show us how features are used and where users drop off; test improvements. Legal basis: your consent (sections 30(1)(a) and 32). Default: off until you allow them.',
        'Marketing and advertising: measure which campaigns bring users to NexGenius; show you NexGenius offers on other websites and apps; limit how often you see the same advertisement. Legal basis: your express consent for commercial use of personal data (sections 30(1)(a), 32 and 37). Default: off until you allow them.',
        'We ask for consent through a clear choice: rejecting non-essential cookies is as easy as accepting them, no box is pre-ticked, and scrolling or continuing to browse is never treated as consent. We keep a record of your choice so that we can show how and when you gave or withdrew consent, as section 32 of the Act requires.',
      ],
      plainEnglish:
        'Only the cookies the site needs to work are on. Preferences, analytics and marketing stay off until you say yes.',
    },
    {
      id: 'what-cookies-collect',
      heading: 'What information cookies collect and how we use it',
      body: [
        'Depending on the categories you allow, cookies may collect:',
        '(a) device and browser information, such as device model, operating system, app version, browser type and screen size;',
        '(b) your IP address, and an approximate (town or city-level) location derived from it;',
        '(c) unique identifiers, such as a cookie ID, an app installation ID and, where you permit it, your device’s advertising identifier;',
        '(d) how you use the Platform, such as screens and pages viewed, searches, items added to your basket, time spent and the website or campaign that referred you;',
        '(e) login and session tokens;',
        '(f) for QR-code orders, the Property Partner and room or unit reference encoded in the QR code; and',
        '(g) your cookie consent choices.',
        'We use this information only for the purposes listed in section 4. When you are signed in, it may be linked to your account and handled in line with the Privacy Policy. Analytics reports we produce are aggregated and do not identify you.',
        'What we do not do with cookies:',
        'No precise location. Cookies do not collect your GPS location. Precise location for delivery is collected only through your device’s location permission, as described in the Privacy Policy.',
        'No health-related tracking for advertising. We do not place marketing or third-party analytics cookies on pharmacy or health-related pages, and we do not share pharmacy order contents or health-related browsing with advertising partners. Health data is sensitive personal data under the Act and is used only to fulfil your order.',
        'No payment card details. Cookies never store your card or mobile-money credentials. Payment pages run by our licensed payment service provider may set their own strictly necessary cookies.',
        'No guest profiling. Room or unit references from QR codes are used only to route and reconcile that order. They are not used for advertising.',
        'No sale of data. We do not sell information collected through cookies.',
      ],
      plainEnglish:
        'Cookies know your device and how you use NexG, never your exact location, payment details or pharmacy orders. We never sell it.',
    },
    {
      id: 'third-parties-and-transfers',
      heading: 'Third parties and transfers outside Kenya',
      body: [
        'We use third-party providers in these categories, each named in Schedule 1:',
        '(a) cloud hosting and content-delivery providers;',
        '(b) analytics and crash-reporting providers;',
        '(c) advertising and campaign-attribution partners;',
        '(d) our licensed payment service provider; and',
        '(e) customer-support chat providers.',
        'Providers that process cookie data on our behalf do so as our data processors under written Data Processing Agreements. Advertising partners may use the data they collect for their own purposes as independent controllers, and their own privacy policies then apply. Schedule 1 links to each provider’s policy and, where available, its opt-out tool.',
        'Some providers store or process data outside Kenya. Before any such transfer we put in place the safeguards required by sections 48 and 49 of the Act, such as contractual data protection clauses. Schedule 1 states the country where each provider’s data is held.',
        'The Platform may link to websites we do not operate, such as a Merchant’s own website. Their cookies are governed by their own policies, not this one.',
      ],
      plainEnglish:
        'Some services we use set cookies too. They work under contract with us, and data sent abroad is protected first.',
    },
    {
      id: 'storage-and-protection',
      heading: 'How we store and protect cookie data',
      body: [
        'We collect only the cookie data we need for each purpose, and we protect it with the same measures that apply to all personal data we hold:',
        '(a) encryption in transit (TLS 1.2 or higher) and at rest;',
        '(b) role-based access controls and audit logging for staff access;',
        '(c) multi-factor authentication for administrative access to our systems;',
        '(d) secure, HttpOnly and SameSite settings on our session cookies;',
        '(e) pseudonymous identifiers in place of names wherever possible; and',
        '(f) confidentiality obligations and data protection training for staff.',
      ],
      plainEnglish:
        'Cookie data is encrypted, access is limited and logged, and staff are trained.',
    },
    {
      id: 'how-long-we-keep-it',
      heading: 'How long cookies and cookie data are kept',
      body: [
        'Session cookies: until you close your browser or end your app session.',
        'Persistent cookies: for the period shown for each cookie in Schedule 1, and in any case no longer than 13 months.',
        'Your cookie consent choice: 12 months, after which we ask you again; we also ask again if we add a new category of cookies.',
        'Analytics data linked to an identifier: up to 26 months, after which it is deleted or kept only in aggregated, anonymised form.',
        'Records of your consent: for as long as we rely on that consent, and 24 months afterwards, so that we can prove it was given.',
        'Cookie data linked to your account: in line with the retention periods in the Privacy Policy.',
      ],
      plainEnglish:
        'No cookie lasts more than 13 months. We ask for your choice again every 12 months.',
    },
    {
      id: 'manage-cookies',
      heading: 'How to manage cookies and opt out',
      body: [
        'You can accept, reject or adjust non-essential cookies at any time, and withdrawing consent is as easy as giving it. Withdrawal does not affect processing that took place before you withdrew.',
        'On our website and QR ordering pages. On your first visit, a cookie banner offers three equally prominent options: Accept all, Reject all and Manage preferences. No non-essential cookie is set until you choose. To change your choice later, select Cookie Settings in the page footer.',
        'In the NexGenius app. On first launch you are asked which categories to allow. To change your choice, go to Profile > Privacy Settings > Cookies and Tracking. On iPhone and iPad, we ask your permission through Apple’s App Tracking Transparency prompt before any tracking across other companies’ apps or websites.',
        'In your device settings. Android: Settings > Google > Ads lets you delete or reset your advertising ID. iOS: Settings > Privacy & Security > Tracking lets you stop apps from asking to track you. Location, notification and other permissions can be switched off in your device settings at any time.',
        'In your browser. Most browsers, including Chrome, Safari, Firefox and Edge, let you view, block and delete cookies through their settings or privacy menu. If you block strictly necessary cookies, you will not be able to sign in, place orders or complete payment.',
        'Third-party opt-outs. Where a provider offers its own opt-out tool, Schedule 1 links to it.',
      ],
      plainEnglish:
        'Change your choice any time on the site, in the app, on your phone or in your browser.',
    },
    {
      id: 'your-rights',
      heading: 'Your rights',
      body: [
        'Under section 26 of the Act and the Privacy Policy, you have the right to be informed of how cookie data is used; to access it; to have it corrected or deleted; to object to or restrict its processing; to data portability; and to withdraw your consent at any time. You can exercise these rights through the Platform’s privacy settings or by writing to our Data Protection Officer at the contact details in section 13.',
      ],
      plainEnglish: 'You can see, correct, delete or move your data, and take back your consent.',
    },
    {
      id: 'children',
      heading: 'Children',
      body: [
        'The Platform is intended for people aged eighteen (18) and over. We do not knowingly set non-essential cookies for children. If we learn that we have done so, we will delete the related data promptly.',
      ],
      plainEnglish: 'NexG is for adults. Any children’s cookie data we find, we delete.',
    },
    {
      id: 'changes',
      heading: 'Changes to this Cookies Policy',
      body: [
        'We may update this Cookies Policy when our use of cookies or the law changes. We will notify material changes through the Platform at least seven (7) days before they take effect. If we introduce a new category of non-essential cookies, we will ask for your consent again before using it. The “Last Updated” date at the top shows when this policy last changed.',
      ],
      plainEnglish:
        'We give 7 days’ notice of big changes, and ask again before any new kind of cookie.',
    },
    {
      id: 'contact-and-complaints',
      heading: 'Contact and complaints',
      body: [
        'For questions about this Cookies Policy, or to exercise your rights, contact our Data Protection Officer:',
        'Email: derrick@nexgapp.com',
        'Post: NexGenius Concierge Limited, P.O. Box 50691-00100, Nairobi, Kenya',
        'You may also raise a data protection complaint through the complaints process in our Refund, Cancellation and Complaints Policy. If you are not satisfied with our response, you may complain to the Office of the Data Protection Commissioner at www.odpc.go.ke.',
      ],
      plainEnglish:
        'Write to our data protection officer. Still unhappy? Complain to the Data Protection Commissioner.',
    },
  ],
};
