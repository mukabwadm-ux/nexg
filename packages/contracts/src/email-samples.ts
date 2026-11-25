/**
 * Sample words for previewing email designs in Admin > Settings >
 * Notifications & templates. Purposes that follow a house design use that
 * design's own sample (email-concepts.ts); the rest have one here.
 */
import { EMAIL_CONCEPTS, type EmailConcept } from './email-concepts';
import type { EmailContent, EmailPurpose } from './email-design';

const conceptById = new Map(EMAIL_CONCEPTS.map((c) => [c.id, c]));

export function emailConcept(id: string | undefined): EmailConcept | undefined {
  return id ? conceptById.get(id) : undefined;
}

type Sample = { subject: string; content: Omit<EmailContent, 'audience' | 'eyebrow' | 'tone'> };

const SITE = 'https://www.nexgapp.com';

const SAMPLES: Record<string, Sample> = {
  'merchant.holiday_reminder': {
    subject: 'Madaraka Day is on Monday: are you open?',
    content: {
      title: 'Madaraka Day is on Monday: are you open?',
      intro:
        'Tell customers whether Karibu Kitchen opens on the public holiday. Set your holiday hours so nobody orders while you are closed.',
      action: { label: 'Set your holiday hours', url: `${SITE}/merchant/hours` },
    },
  },
  /* What fn_merchant_live_email_queue sends, for a restaurant (20270131000500). */
  'merchant.live': {
    subject: 'Congratulations! Karibu Kitchen is live on NexG',
    content: {
      title: 'Congratulations! Karibu Kitchen is live',
      greeting: 'Hi Amina,',
      intro:
        'Congratulations, and welcome to NexG. Karibu Kitchen is now live, and customers can find you on NexG.\n\nHere is what to do next:',
      steps: [
        'Add your menu in Offerings: each dish with its price and a photo, then publish it.',
        'Check your opening hours in Availability, so customers order only while you are open.',
        'Add your logo and a banner photo in Business, so customers recognise you.',
        'When you are ready for orders, press Start taking orders on your dashboard Home.',
      ],
      action: { label: 'Open your dashboard', url: 'https://nexgapp.com/merchant' },
      callout: {
        title: 'Your signed agreement is attached',
        body: 'NexG has signed your merchant agreement (NXG-MA-3F9A1C2B7D4E). The PDF is attached to this email: keep it for your records. You can download it again any time from Business › Documents in your dashboard.',
      },
      closing: 'Questions about getting set up? Reply to this email and we will help.',
      preheader: 'Your business is live. Your signed merchant agreement is attached.',
    },
  },
  'merchant.other': {
    subject: 'Your menu changes are live',
    content: {
      title: 'Your menu changes are live',
      intro: 'The prices you changed for Karibu Kitchen are now what customers see.',
      action: { label: 'Open business workspace', url: `${SITE}/merchant` },
    },
  },
  'partner.update': {
    subject: 'Your NexG account is active again',
    content: {
      title: 'Your NexG account is active again',
      intro:
        'Thank you for sorting out the documents we asked for. You can take work on NexG again.',
      action: { label: 'Open NexG', url: SITE },
    },
  },
  'partner.payout_details_verified': {
    subject: 'Your NexG payout details are verified',
    content: {
      title: 'Your NexG payout details are verified',
      greeting: 'Hi Wanjiru,',
      intro: 'We checked your payout details. Your next payout goes to the account below.',
      rows: [
        ['Paid to', 'M-Pesa ending 4821'],
        ['Next payout', 'Friday'],
      ],
      action: { label: 'View payout settings', url: `${SITE}/host` },
    },
  },
  'guest.order': {
    subject: 'Your order is on its way',
    content: {
      title: 'Your order is on its way',
      intro: 'Karibu Kitchen has handed your order to your rider. Follow it live on the map.',
      action: { label: 'Track your order', url: `${SITE}/orders` },
    },
  },
  'guest.refund': {
    subject: 'Your refund is approved',
    content: {
      title: 'Your refund is approved',
      intro:
        'We approved a refund of KES 850 for order NX-48213. It reaches your M-Pesa within two working days.',
      action: { label: 'View refund', url: `${SITE}/orders` },
    },
  },
  'guest.receipt': {
    subject: 'Receipt R-2026-00481 · KES 2,450.00',
    content: {
      title: 'Receipt R-2026-00481 · KES 2,450.00',
      intro:
        'Your NexG receipt R-2026-00481\n\nDinner for two, Karibu Kitchen\nKES 2,450.00\nPaid by M-Pesa · SKL4H2X9QP',
      action: { label: 'View or print it', url: `${SITE}/receipts/R-2026-00481` },
    },
  },
  'guest.stay_confirmed': {
    subject: 'Your stay is booked: Riverside Suites, 14 Dec',
    content: {
      title: 'Your stay is booked',
      greeting: 'Hi Amina,',
      intro: 'Your stay is booked and paid.',
      rows: [
        ['Property', 'Riverside Suites · Garden studio'],
        ['Check in', '14 Dec'],
        ['Check out', '17 Dec'],
        ['Paid', 'KES 21,000 by M-Pesa'],
      ],
      closing:
        'The exact address and how to get in come from your host before you arrive. Food, drinks, laundry and transfers can be ordered to the door through NexG for the whole of your stay.',
    },
  },
  'rider.status': {
    subject: 'Your rider account is active',
    content: {
      title: 'Your rider account is active',
      intro:
        'Your documents are verified and your kit is paid for. You can go online and take deliveries.',
      action: { label: 'Open your rider dashboard', url: `${SITE}/rider` },
    },
  },
  'applicant.receipt': {
    subject: 'We have your application',
    content: {
      title: 'We have your application',
      greeting: 'Hi Brian,',
      intro:
        'Thank you for applying to NexG. A person reads every application, and we will reply by email.',
    },
  },
  'host.update': {
    subject: 'Your listing is live',
    content: {
      title: 'Your listing is live',
      intro: 'Garden studio at Riverside Suites can now be booked by guests.',
      action: { label: 'Open your host workspace', url: `${SITE}/host` },
    },
  },
  'careers.application_update': {
    subject: 'Your application moved to interview',
    content: {
      title: 'Your application moved to interview',
      intro:
        'Karibu Kitchen would like to interview you for Line cook. They will contact you with a time.',
      action: { label: 'See my applications', url: `${SITE}/account?tab=jobs` },
    },
  },
  'careers.employer': {
    subject: 'New applicant for Line cook',
    content: {
      title: 'New applicant for Line cook',
      intro: 'Brian Otieno applied for Line cook. Their CV is attached to the application.',
      action: { label: 'Open Hiring', url: `${SITE}/merchant/hiring` },
    },
  },
  'staff.alert': {
    subject: 'New merchant waiting for approval',
    content: {
      title: 'New merchant waiting for approval',
      intro: 'Karibu Kitchen finished its application and is waiting for a review.',
      action: {
        label: 'Open the console',
        url: 'https://control.nexgapp.com/merchants/applications',
      },
    },
  },
  'forms.alert': {
    subject: 'New rider application: Brian Otieno',
    content: {
      title: 'New rider application: Brian Otieno',
      intro: 'Name: Brian Otieno\nPhone: +254 700 000 000\nArea: Westlands',
      action: { label: 'Open in the console', url: 'https://control.nexgapp.com/riders' },
    },
  },
  all: {
    subject: 'A message from NexG',
    content: {
      title: 'A message from NexG',
      greeting: 'Hi Amina,',
      intro:
        'This is how an email with no purpose of its own looks. The words come from whatever NexG is telling the person.',
      action: { label: 'Open NexG', url: SITE },
    },
  },
};

/**
 * Sample words for a purpose's preview. A design NexG does not send yet
 * shows exactly as drawn; one it sends shows with the status line, colour
 * and button it is sent with, or as it is actually written when it has a
 * sample of its own here.
 */
export function sampleEmail(purpose: EmailPurpose): { subject: string; content: EmailContent } {
  const concept = emailConcept(purpose.conceptId);
  if (concept && !(purpose.sender !== 'none' && SAMPLES[purpose.key])) {
    if (purpose.sender === 'none') return { subject: concept.subject, content: concept.content };
    return {
      subject: concept.subject,
      content: {
        ...concept.content,
        audience: purpose.audience,
        eyebrow: purpose.eyebrow,
        tone: purpose.tone,
        action:
          concept.content.action && purpose.actionLabel
            ? { label: purpose.actionLabel, url: concept.content.action.url }
            : undefined,
      },
    };
  }
  const sample = SAMPLES[purpose.key] ?? SAMPLES.all!;
  return {
    subject: sample.subject,
    content: {
      audience: purpose.audience,
      eyebrow: purpose.eyebrow,
      tone: purpose.tone,
      ...sample.content,
    },
  };
}

// ───────────────────────────────────── previewing Supabase's templates

type GoNode =
  | string
  | { kind: 'value'; path: string }
  | { kind: 'if'; branches: { cond: string | null; body: GoNode[] }[] };

const GO_ACTION = /^\{\{-?\s*([\s\S]*?)\s*-?\}\}$/;

function parseGo(tokens: string[], at: { i: number }): { nodes: GoNode[]; end: string } {
  const nodes: GoNode[] = [];
  while (at.i < tokens.length) {
    const token = tokens[at.i++] ?? '';
    const action = token.match(GO_ACTION)?.[1]?.trim();
    if (action === undefined) {
      if (token) nodes.push(token);
      continue;
    }
    if (action === 'end' || action === 'else' || action.startsWith('else if ')) {
      return { nodes, end: action };
    }
    if (action.startsWith('if ')) {
      const branches: { cond: string | null; body: GoNode[] }[] = [];
      let cond: string | null = action.slice(3).trim();
      for (;;) {
        const inner = parseGo(tokens, at);
        branches.push({ cond, body: inner.nodes });
        if (inner.end.startsWith('else if ')) {
          cond = inner.end.slice(8).trim();
          continue;
        }
        if (inner.end === 'else') {
          branches.push({ cond: null, body: parseGo(tokens, at).nodes });
        }
        break;
      }
      nodes.push({ kind: 'if', branches });
      continue;
    }
    nodes.push({ kind: 'value', path: action });
  }
  return { nodes, end: '' };
}

function renderGo(nodes: GoNode[], data: Record<string, string | boolean>): string {
  const value = (path: string) => data[path.replace(/^\./, '')];
  return nodes
    .map((node) => {
      if (typeof node === 'string') return node;
      if (node.kind === 'value') return String(value(node.path) ?? '');
      const branch = node.branches.find((b) => b.cond === null || Boolean(value(b.cond)));
      return branch ? renderGo(branch.body, data) : '';
    })
    .join('');
}

/** A Supabase template filled the way Supabase would, for a preview. Only if/else if/else/end and fields. */
export function fillSupabaseTemplate(
  html: string,
  data: Record<string, string | boolean> = {},
): string {
  const tokens = html.split(/(\{\{-?[\s\S]*?-?\}\})/);
  return renderGo(parseGo(tokens, { i: 0 }).nodes, {
    Token: '482916',
    TokenHash: 'sample',
    Email: 'amina@example.com',
    SiteURL: SITE,
    ConfirmationURL: `${SITE}/auth/confirm`,
    ...data,
  });
}

/** The ways a Supabase email can come out, to preview each. */
export const SUPABASE_VARIANTS: Record<
  string,
  { label: string; data: Record<string, string | boolean> }[]
> = {
  'auth.code': [{ label: 'Code', data: {} }],
  'auth.password_reset': [
    { label: 'Password reset', data: {} },
    {
      label: 'Welcome, merchant',
      data: {
        'Data.nexg_welcome': true,
        'Data.nexg_welcome_first_name': 'Amina',
        'Data.nexg_welcome_business': 'Karibu Kitchen',
      },
    },
    {
      label: 'Welcome, host',
      data: {
        'Data.nexg_welcome': true,
        'Data.nexg_welcome_host': true,
        'Data.nexg_welcome_first_name': 'Wanjiru',
      },
    },
    {
      label: 'Welcome, rider',
      data: {
        'Data.nexg_welcome': true,
        'Data.nexg_welcome_rider': true,
        'Data.nexg_welcome_first_name': 'Brian',
      },
    },
    {
      label: 'Welcome, customer',
      data: {
        'Data.nexg_welcome': true,
        'Data.nexg_welcome_customer': true,
        'Data.nexg_welcome_first_name': 'Amina',
      },
    },
  ],
};
