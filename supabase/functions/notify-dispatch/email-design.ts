/**
 * NexG's email design, for inboxes.
 *
 * The look is the house design in docs/merchant-portal-plan/email-concept:
 * the wordmark header, a status line with a tinted mark, one large title,
 * readable copy, detail rows, one gold action and the support footer. Those
 * files are browser mock-ups (a stylesheet, web fonts, a script); this
 * renders the same layout the way email clients need it: tables, inline
 * styles, no script.
 *
 * Every email NexG sends goes through here. A sender gives the subject and
 * the plain text it already writes, plus the purpose of the email; the
 * purpose decides the status line, colour and action label, and whether an
 * uploaded design (Admin > Settings > Notifications & templates) replaces the
 * house one. The plain text is always sent as well, for clients that show no
 * HTML, and a sender falls back to it alone if rendering ever fails.
 *
 * The emails Supabase sends itself (sign-in codes, password reset) are built
 * here too, as the files in supabase/templates; production uses the copies
 * pasted into the Supabase dashboard.
 *
 * This file has no imports on purpose: the notify-dispatch edge function
 * runs a copy of it (supabase/functions/notify-dispatch/email-design.ts,
 * written by scripts/sync-email-design.mjs; a test fails when they differ).
 */

export type EmailTone = 'gold' | 'green' | 'red' | 'amber' | 'blue';

export interface EmailContent {
  /** Small label beside the wordmark: MERCHANT, GUEST, HOST, TEAM. */
  audience?: string;
  /** The status line above the title, in capitals. */
  eyebrow?: string;
  tone?: EmailTone;
  title: string;
  greeting?: string;
  /** Plain text. A blank line starts a paragraph; web addresses become links. */
  intro: string;
  code?: string;
  codeLabel?: string;
  expiry?: string;
  amount?: string;
  amountLabel?: string;
  rows?: [string, string][];
  steps?: string[];
  action?: { label: string; url?: string };
  actionNote?: string;
  callout?: { title: string; body: string; warning?: boolean };
  closing?: string;
  /** The line inboxes show after the subject. */
  preheader?: string;
}

export interface RenderOptions {
  /** Where the wordmark and font are served from ('' for the current site). */
  assetBase?: string;
  supportEmail?: string;
}

export const DEFAULT_ASSET_BASE = 'https://www.nexgapp.com';
export const SUPPORT_EMAIL = 'info@nexgapp.com';

// ───────────────────────────────────────────────────────────── purposes

/** Who sends an email today. "none" is a design NexG does not send yet. */
export type EmailSender = 'outbox' | 'website' | 'console' | 'supabase' | 'none';

export interface EmailPurpose {
  key: string;
  label: string;
  area: string;
  audience: string;
  tone: EmailTone;
  eyebrow: string;
  actionLabel?: string;
  /** The design in docs/merchant-portal-plan/email-concept it follows. */
  conceptId?: string;
  sender: EmailSender;
  /** Outbox templates it covers; a trailing % matches a prefix. */
  templates?: string[];
  /** For Supabase's own emails: where in its dashboard the design goes. */
  supabaseTemplate?: string;
}

export const EMAIL_SENDERS: Record<EmailSender, string> = {
  outbox: 'Sent by NexG automatically',
  website: 'Sent by the website',
  console: 'Sent from the console',
  supabase: 'Sent by Supabase (paste the design into its dashboard)',
  none: 'Not sent yet',
};

export const EMAIL_AREAS = [
  'Access and security',
  'Onboarding and verification',
  'Orders and bookings',
  'Money',
  'Team and account',
  'Support',
  'Guests',
  'Riders and hosts',
  'Careers',
  'NexG team',
  'Everything else',
] as const;

const M = 'MERCHANT';

export const EMAIL_PURPOSES: EmailPurpose[] = [
  // Access and security. Supabase sends the first two, from the templates pasted into its dashboard.
  {
    key: 'auth.code',
    label: 'Sign-in and verification code',
    area: 'Access and security',
    audience: 'ACCOUNT',
    tone: 'gold',
    eyebrow: 'SECURE SIGN-IN',
    conceptId: '02-sign-in-otp',
    sender: 'supabase',
    supabaseTemplate: 'Authentication > Emails > Magic link, and Change email address',
  },
  {
    key: 'auth.password_reset',
    label: 'Password reset, and the welcome that sets a password',
    area: 'Access and security',
    audience: 'ACCOUNT',
    tone: 'gold',
    eyebrow: 'ACCOUNT RECOVERY',
    actionLabel: 'Reset password',
    conceptId: '03-password-reset',
    sender: 'supabase',
    supabaseTemplate: 'Authentication > Emails > Reset password',
  },
  {
    key: 'auth.verification_welcome',
    label: 'Welcome and verify email',
    area: 'Access and security',
    audience: M,
    tone: 'gold',
    eyebrow: 'WELCOME TO NEXG',
    conceptId: '01-email-verification-otp',
    sender: 'none',
  },
  {
    key: 'auth.password_changed',
    label: 'Password changed',
    area: 'Access and security',
    audience: M,
    tone: 'green',
    eyebrow: 'SECURITY NOTICE',
    actionLabel: 'Review account security',
    conceptId: '04-password-changed',
    sender: 'none',
  },
  {
    key: 'auth.new_sign_in',
    label: 'New sign-in',
    area: 'Access and security',
    audience: M,
    tone: 'amber',
    eyebrow: 'ACCOUNT ACTIVITY',
    actionLabel: 'Review account security',
    conceptId: '05-new-sign-in',
    sender: 'none',
  },
  {
    key: 'auth.email_change',
    label: 'Confirm email change by link',
    area: 'Access and security',
    audience: M,
    tone: 'gold',
    eyebrow: 'CONFIRM ACCOUNT CHANGE',
    actionLabel: 'Confirm email change',
    conceptId: '06-email-change-confirmation',
    sender: 'none',
  },
  {
    key: 'auth.email_changed',
    label: 'Email changed',
    area: 'Access and security',
    audience: M,
    tone: 'green',
    eyebrow: 'SECURITY NOTICE',
    actionLabel: 'Review account security',
    conceptId: '30-email-changed',
    sender: 'none',
  },

  // Onboarding and verification
  {
    key: 'merchant.setup',
    label: 'Finish setting up (reminder)',
    area: 'Onboarding and verification',
    audience: M,
    tone: 'gold',
    eyebrow: 'FINISH YOUR SETUP',
    actionLabel: 'Continue setup',
    conceptId: '07-welcome',
    sender: 'outbox',
    templates: ['bell_merchant.setup_reminder'],
  },
  {
    key: 'merchant.application_received',
    label: 'Application received',
    area: 'Onboarding and verification',
    audience: M,
    tone: 'blue',
    eyebrow: 'APPLICATION RECEIVED',
    actionLabel: 'View application status',
    conceptId: '08-application-received',
    sender: 'none',
  },
  {
    key: 'merchant.documents_needed',
    label: 'Documents need attention',
    area: 'Onboarding and verification',
    audience: M,
    tone: 'amber',
    eyebrow: 'ACTION REQUIRED',
    actionLabel: 'Review and upload document',
    conceptId: '09-documents-action-required',
    sender: 'none',
  },
  {
    key: 'merchant.approved',
    label: 'Business approved',
    area: 'Onboarding and verification',
    audience: M,
    tone: 'green',
    eyebrow: 'BUSINESS APPROVED',
    actionLabel: 'Review go-live setup',
    conceptId: '10-business-approved',
    sender: 'outbox',
    templates: ['bell_merchant.application_approved'],
  },
  {
    key: 'merchant.not_approved',
    label: 'Application not approved',
    area: 'Onboarding and verification',
    audience: M,
    tone: 'amber',
    eyebrow: 'APPLICATION UPDATE',
    actionLabel: 'Review application decision',
    conceptId: '11-application-not-approved',
    sender: 'none',
  },
  {
    key: 'merchant.document_expiring',
    label: 'Document expiring',
    area: 'Onboarding and verification',
    audience: M,
    tone: 'amber',
    eyebrow: 'DOCUMENT REMINDER',
    actionLabel: 'Update business document',
    conceptId: '12-document-expiring',
    sender: 'none',
  },
  {
    key: 'merchant.live',
    label: 'Business live, with the signed agreement attached',
    area: 'Onboarding and verification',
    audience: M,
    tone: 'green',
    eyebrow: 'YOUR BUSINESS IS LIVE',
    actionLabel: 'Open your dashboard',
    conceptId: '31-business-live',
    sender: 'outbox',
    templates: ['partner_merchant_live', 'bell_merchant.live'],
  },
  {
    key: 'merchant.document_approved',
    label: 'Document approved',
    area: 'Onboarding and verification',
    audience: M,
    tone: 'green',
    eyebrow: 'DOCUMENT APPROVED',
    actionLabel: 'View verification status',
    conceptId: '32-document-approved',
    sender: 'none',
  },

  // Orders and bookings
  {
    key: 'merchant.new_order',
    label: 'New order',
    area: 'Orders and bookings',
    audience: M,
    tone: 'green',
    eyebrow: 'ORDER CONFIRMED',
    actionLabel: 'Open order',
    conceptId: '13-new-order',
    sender: 'none',
  },
  {
    key: 'merchant.booking_confirmed',
    label: 'Booking confirmed',
    area: 'Orders and bookings',
    audience: M,
    tone: 'green',
    eyebrow: 'BOOKING CONFIRMED',
    actionLabel: 'View booking',
    conceptId: '14-booking-confirmed',
    sender: 'none',
  },
  {
    key: 'merchant.work_cancelled',
    label: 'Booking cancelled (to hosts)',
    area: 'Orders and bookings',
    audience: 'HOST',
    tone: 'amber',
    eyebrow: 'CANCELLATION UPDATE',
    actionLabel: 'View cancellation details',
    conceptId: '15-work-cancelled',
    sender: 'outbox',
    templates: ['host_booking_cancelled'],
  },
  {
    key: 'merchant.customer_message',
    label: 'New customer message',
    area: 'Orders and bookings',
    audience: M,
    tone: 'blue',
    eyebrow: 'NEW MESSAGE',
    actionLabel: 'Read message in NexG',
    conceptId: '16-customer-message',
    sender: 'none',
  },
  {
    key: 'merchant.booking_updated',
    label: 'Booking updated',
    area: 'Orders and bookings',
    audience: M,
    tone: 'blue',
    eyebrow: 'BOOKING UPDATE',
    actionLabel: 'Review updated booking',
    conceptId: '29-booking-updated',
    sender: 'none',
  },

  // Money
  {
    key: 'merchant.payment_received',
    label: 'Customer payment confirmed',
    area: 'Money',
    audience: M,
    tone: 'green',
    eyebrow: 'PAYMENT CONFIRMED',
    actionLabel: 'View payment details',
    conceptId: '17-payment-received',
    sender: 'none',
  },
  {
    key: 'merchant.payout_sent',
    label: 'Payout started',
    area: 'Money',
    audience: M,
    tone: 'blue',
    eyebrow: 'PAYOUT INITIATED',
    actionLabel: 'Track payout',
    conceptId: '18-payout-sent',
    sender: 'none',
  },
  {
    key: 'merchant.payout_failed',
    label: 'Payout failed',
    area: 'Money',
    audience: M,
    tone: 'red',
    eyebrow: 'PAYOUT ACTION REQUIRED',
    actionLabel: 'Review payout issue',
    conceptId: '19-payout-failed',
    sender: 'none',
  },
  {
    key: 'merchant.refund_completed',
    label: 'Refund processed',
    area: 'Money',
    audience: M,
    tone: 'blue',
    eyebrow: 'REFUND UPDATE',
    actionLabel: 'View refund details',
    conceptId: '20-refund-completed',
    sender: 'none',
  },
  {
    key: 'merchant.payout_completed',
    label: 'Payout completed',
    area: 'Money',
    audience: M,
    tone: 'green',
    eyebrow: 'PAYOUT COMPLETED',
    actionLabel: 'View payout confirmation',
    conceptId: '33-payout-completed',
    sender: 'none',
  },
  {
    key: 'finance.document',
    label: 'Invoices and statements from Finance',
    area: 'Money',
    audience: 'FINANCE',
    tone: 'gold',
    eyebrow: 'FROM NEXG FINANCE',
    actionLabel: 'Open statement',
    conceptId: '21-statement-ready',
    sender: 'console',
    templates: ['finance%', 'invoice%', 'tax%', 'statement%'],
  },
  {
    key: 'partner.payout_details_changed',
    label: 'Payout details changed (to hosts)',
    area: 'Money',
    audience: 'HOST',
    tone: 'amber',
    eyebrow: 'FINANCIAL SECURITY',
    actionLabel: 'Review payout settings',
    conceptId: '22-payout-details-changed',
    sender: 'outbox',
    templates: ['host_payout_details'],
  },
  {
    key: 'partner.payout_details_verified',
    label: 'Payout details verified (to hosts)',
    area: 'Money',
    audience: 'HOST',
    tone: 'green',
    eyebrow: 'PAYOUT DETAILS VERIFIED',
    actionLabel: 'View payout settings',
    sender: 'outbox',
    templates: ['host_payout_verified'],
  },

  // Team and account
  {
    key: 'merchant.team_invitation',
    label: 'Team invitation',
    area: 'Team and account',
    audience: M,
    tone: 'gold',
    eyebrow: 'TEAM INVITATION',
    actionLabel: 'Review invitation',
    conceptId: '23-team-invitation',
    sender: 'outbox',
    templates: ['merchant_team_invite'],
  },
  {
    key: 'merchant.team_access_changed',
    label: 'Access changed',
    area: 'Team and account',
    audience: M,
    tone: 'blue',
    eyebrow: 'TEAM ACCESS UPDATE',
    actionLabel: 'View my access',
    conceptId: '24-team-access-changed',
    sender: 'none',
  },
  {
    key: 'merchant.restricted',
    label: 'Business paused, suspended or delisted',
    area: 'Team and account',
    audience: M,
    tone: 'red',
    eyebrow: 'BUSINESS STATUS UPDATE',
    actionLabel: 'Review business status',
    conceptId: '25-account-restricted',
    sender: 'outbox',
    templates: ['bell_merchant.paused', 'bell_merchant.suspended', 'bell_merchant.delisted'],
  },
  {
    key: 'merchant.restored',
    label: 'Business restored',
    area: 'Team and account',
    audience: M,
    tone: 'green',
    eyebrow: 'BUSINESS STATUS UPDATE',
    actionLabel: 'Open merchant workspace',
    conceptId: '26-account-restored',
    sender: 'none',
  },
  {
    key: 'merchant.holiday_reminder',
    label: 'Public holiday reminder',
    area: 'Team and account',
    audience: M,
    tone: 'amber',
    eyebrow: 'PUBLIC HOLIDAY',
    actionLabel: 'Set your holiday hours',
    sender: 'outbox',
    templates: ['bell_merchant.holiday_reminder'],
  },
  {
    key: 'merchant.other',
    label: 'Other business updates',
    area: 'Team and account',
    audience: M,
    tone: 'blue',
    eyebrow: 'BUSINESS UPDATE',
    actionLabel: 'Open business workspace',
    sender: 'outbox',
    templates: ['bell_merchant.%'],
  },
  {
    key: 'partner.update',
    label: 'Partner status updates',
    area: 'Team and account',
    audience: 'PARTNER',
    tone: 'blue',
    eyebrow: 'ACCOUNT UPDATE',
    actionLabel: 'Open NexG',
    sender: 'outbox',
    templates: ['partner_%'],
  },

  // Support
  {
    key: 'support.received',
    label: 'Support request received',
    area: 'Support',
    audience: 'SUPPORT',
    tone: 'blue',
    eyebrow: 'SUPPORT REQUEST RECEIVED',
    conceptId: '27-support-received',
    sender: 'website',
  },
  {
    key: 'support.resolved',
    label: 'Support request resolved',
    area: 'Support',
    audience: 'SUPPORT',
    tone: 'green',
    eyebrow: 'SUPPORT UPDATE',
    conceptId: '28-support-resolved',
    sender: 'console',
  },
  {
    key: 'support.reply',
    label: 'Support reply',
    area: 'Support',
    audience: 'SUPPORT',
    tone: 'blue',
    eyebrow: 'A REPLY FROM SUPPORT',
    actionLabel: 'Read support reply',
    conceptId: '34-support-reply',
    sender: 'none',
  },

  // Guests
  {
    key: 'guest.order',
    label: 'Order updates',
    area: 'Guests',
    audience: 'GUEST',
    tone: 'blue',
    eyebrow: 'YOUR ORDER',
    actionLabel: 'Track your order',
    sender: 'outbox',
    templates: ['bell_order.%'],
  },
  {
    key: 'guest.refund',
    label: 'Refund updates',
    area: 'Guests',
    audience: 'GUEST',
    tone: 'blue',
    eyebrow: 'YOUR REFUND',
    actionLabel: 'View refund',
    sender: 'outbox',
    templates: ['bell_refund.%'],
  },
  {
    key: 'guest.receipt',
    label: 'Receipts',
    area: 'Guests',
    audience: 'GUEST',
    tone: 'gold',
    eyebrow: 'RECEIPT',
    actionLabel: 'View or print it',
    sender: 'outbox',
    templates: ['receipt%'],
  },
  {
    key: 'guest.stay_confirmed',
    label: 'Stay booked',
    area: 'Guests',
    audience: 'GUEST',
    tone: 'green',
    eyebrow: 'STAY CONFIRMED',
    sender: 'website',
  },

  // Riders and hosts
  {
    key: 'rider.status',
    label: 'Rider status updates',
    area: 'Riders and hosts',
    audience: 'RIDER',
    tone: 'blue',
    eyebrow: 'RIDER UPDATE',
    actionLabel: 'Open your rider dashboard',
    sender: 'outbox',
    templates: ['bell_rider.%'],
  },
  {
    key: 'applicant.receipt',
    label: 'Application receipts (jobs and hosts)',
    area: 'Riders and hosts',
    audience: 'APPLICANT',
    tone: 'blue',
    eyebrow: 'APPLICATION RECEIVED',
    sender: 'outbox',
    templates: ['job_receipt', 'host_receipt'],
  },
  {
    key: 'host.update',
    label: 'Other host updates',
    area: 'Riders and hosts',
    audience: 'HOST',
    tone: 'blue',
    eyebrow: 'HOST UPDATE',
    actionLabel: 'Open your host workspace',
    sender: 'outbox',
    templates: ['host_%', 'bell_host.%'],
  },

  // Careers
  {
    key: 'careers.application_update',
    label: 'Job application updates',
    area: 'Careers',
    audience: 'CAREERS',
    tone: 'blue',
    eyebrow: 'YOUR APPLICATION',
    actionLabel: 'See my applications',
    sender: 'outbox',
    templates: ['bell_careers.%'],
  },
  {
    key: 'careers.employer',
    label: 'Hiring alerts to businesses',
    area: 'Careers',
    audience: 'HIRING',
    tone: 'gold',
    eyebrow: 'HIRING',
    actionLabel: 'Open Hiring',
    sender: 'outbox',
    templates: ['bell_merchant.vacancy_application', 'bell_careers.vacancy_taken_down'],
  },

  // NexG team
  {
    key: 'staff.alert',
    label: 'Alerts to the NexG team',
    area: 'NexG team',
    audience: 'TEAM',
    tone: 'gold',
    eyebrow: 'FOR THE NEXG TEAM',
    actionLabel: 'Open the console',
    sender: 'outbox',
    templates: ['bell_staff.%', 'staff_%'],
  },
  {
    key: 'forms.alert',
    label: 'Website form alerts',
    area: 'NexG team',
    audience: 'TEAM',
    tone: 'gold',
    eyebrow: 'NEW FORM SUBMISSION',
    actionLabel: 'Open in the console',
    sender: 'outbox',
    templates: ['form_%'],
  },

  // Everything else
  {
    key: 'all',
    label: 'Every other email',
    area: 'Everything else',
    audience: 'NEXG',
    tone: 'gold',
    eyebrow: 'FROM NEXG',
    actionLabel: 'Open NexG',
    sender: 'outbox',
    templates: ['%'],
  },
];

const byKey = new Map(EMAIL_PURPOSES.map((p) => [p.key, p]));

export function emailPurpose(key: string): EmailPurpose {
  return byKey.get(key) ?? byKey.get('all')!;
}

export function isEmailPurpose(key: string): boolean {
  return byKey.has(key);
}

function matches(template: string, pattern: string): boolean {
  return pattern.endsWith('%') ? template.startsWith(pattern.slice(0, -1)) : template === pattern;
}

/**
 * The purpose an outbox template belongs to. An exact template wins over a
 * prefix, and a longer prefix over a shorter one, so "bell_merchant.live" is
 * the business-live email and not "bell_merchant.%"; "all" catches the rest.
 */
export function purposeForTemplate(template: string): EmailPurpose {
  let best: { purpose: EmailPurpose; score: number } | null = null;
  for (const purpose of EMAIL_PURPOSES) {
    for (const pattern of purpose.templates ?? []) {
      if (!matches(template, pattern)) continue;
      const score = pattern.endsWith('%') ? pattern.length - 1 : 10_000;
      if (!best || score > best.score) best = { purpose, score };
    }
  }
  return best?.purpose ?? emailPurpose('all');
}

// ───────────────────────────────────────────────────────────── text

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT = "Manrope,'Segoe UI',Helvetica,Arial,sans-serif";
const INTRO = `margin:0 0 14px;font-family:${FONT};font-size:14px;line-height:1.8;color:#5e594f;`;

function linkify(escaped: string): string {
  return escaped.replace(
    /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g,
    (url) => `<a href="${url}" style="color:#78580a;text-decoration:underline;">${url}</a>`,
  );
}

/** Plain text as paragraphs: a blank line between paragraphs, single breaks kept. */
export function textToHtml(text: string, style: string = INTRO): string {
  return text
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim() !== '')
    .map((p) => `<p style="${style}">${linkify(escapeHtml(p.trim())).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * The content a plain email already has, in the house layout: the subject
 * becomes the title, a first line such as "Hi Amina," the greeting, a closing
 * "Open it: https://…" line the action button, and a "— NexG" signature makes
 * way for the design's own sign-off.
 */
export function fromPlainEmail(input: {
  subject: string;
  body: string;
  purpose: EmailPurpose;
}): EmailContent {
  let body = input.body.replace(/\r\n/g, '\n').trim();
  body = body
    .replace(/\n*[—–-]+[ \t]*(?:The[ \t]+)?NexG(?:[ \t]+[A-Za-z]+){0,2}[ \t]*$/i, '')
    .trim();

  let action: EmailContent['action'];
  const link = body.match(
    /\n*(?:Open(?: it| in admin| in NexG)?|View(?: or print)? it|Continue|Reply here|Track it)[ \t]*:[ \t]*(https?:\/\/\S+)\s*$/i,
  );
  if (link && link[1]) {
    action = { label: input.purpose.actionLabel ?? 'Open in NexG', url: link[1] };
    body = body.slice(0, link.index).trim();
  }

  let greeting: string | undefined;
  const first = body.match(/^((?:Hi|Hello|Dear)\b[^\n]{0,60},)\n+/);
  if (first && first[1]) {
    greeting = first[1];
    body = body.slice(first[0].length).trim();
  }

  const preheader = body
    .split('\n')
    .find((line) => line.trim() !== '')
    ?.trim()
    .slice(0, 140);
  return {
    audience: input.purpose.audience,
    eyebrow: input.purpose.eyebrow,
    tone: input.purpose.tone,
    title: input.subject.trim() || 'A message from NexG',
    greeting,
    intro: body,
    action,
    preheader,
  };
}

// ───────────────────────────────────────────────────────────── layout

const TONES: Record<EmailTone, { bg: string; fg: string; border: string; mark: string }> = {
  gold: { bg: '#fbf7ea', fg: '#86640d', border: '#ecdfb9', mark: '&#10022;' },
  green: { bg: '#edf6ee', fg: '#25653a', border: '#dcebdd', mark: '&#10003;' },
  red: { bg: '#fff0ed', fg: '#a8382c', border: '#f0d6d0', mark: '!' },
  amber: { bg: '#fcf5e5', fg: '#8c6818', border: '#ecdfbd', mark: '!' },
  blue: { bg: '#eff4f9', fg: '#315b7b', border: '#dce7f0', mark: 'i' },
};

const FOOTER_NAMES: Record<string, string> = {
  MERCHANT: 'NexG Merchant',
  HOST: 'NexG Hosts',
  RIDER: 'NexG Riders',
  TEAM: 'NexG Console',
  FINANCE: 'NexG Finance',
  SUPPORT: 'NexG Support',
  CAREERS: 'NexG Careers',
  HIRING: 'NexG Careers',
};

/** Every piece is HTML already: escaped text, or markup this file built. */
interface Frame {
  docTitle: string;
  preheader?: string;
  audience: string;
  footerName: string;
  tone: EmailTone;
  eyebrow?: string;
  title: string;
  greeting?: string;
  body: string;
  assetBase: string;
  supportEmail: string;
}

function frame(f: Frame): string {
  const tone = TONES[f.tone];
  const base = f.assetBase.replace(/\/$/, '');
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">` +
    `<title>${f.docTitle}</title>` +
    `<style>@font-face{font-family:Manrope;font-style:normal;font-weight:400 800;font-display:swap;src:url(${base}/email/manrope-latin.woff2) format('woff2');}a{color:#78580a;}@media (max-width:600px){.nx-pad{padding-left:22px!important;padding-right:22px!important;}.nx-title{font-size:26px!important;}}</style>` +
    `</head><body style="margin:0;padding:0;background:#f6f3ec;-webkit-text-size-adjust:100%;">` +
    (f.preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f6f3ec;font-size:1px;line-height:1px;">${f.preheader}</div>`
      : '') +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f3ec;"><tr><td align="center" style="padding:28px 12px;">` +
    `<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e4dfd4;border-radius:12px;">` +
    // header: wordmark and audience
    `<tr><td class="nx-pad" style="padding:0 36px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #ece8df;"><tr>` +
    `<td style="padding:30px 0 26px;"><img src="${base}/email/nexg-wordmark.png" width="114" alt="NexG" style="display:block;border:0;outline:none;width:114px;height:auto;"></td>` +
    `<td align="right" style="padding:30px 0 26px;font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:1.8px;color:#6f685b;white-space:nowrap;"><span style="color:#b48b1f;font-size:8px;">&#9679;</span>&nbsp;${f.audience}</td>` +
    `</tr></table></td></tr>` +
    // the message
    `<tr><td class="nx-pad" style="padding:30px 36px 27px;">` +
    (f.eyebrow
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td width="39" height="39" align="center" valign="middle" style="width:39px;height:39px;background:${tone.bg};border:1px solid ${tone.border};border-radius:11px;font-family:Arial,sans-serif;font-size:17px;font-weight:700;line-height:39px;color:${tone.fg};">${tone.mark}</td>` +
        `<td style="padding-left:11px;font-family:${FONT};font-size:10px;font-weight:800;letter-spacing:1.35px;color:#746b55;">${f.eyebrow}</td>` +
        `</tr></table>`
      : '') +
    `<h1 class="nx-title" style="margin:21px 0 23px;font-family:${FONT};font-size:30px;line-height:1.24;font-weight:800;letter-spacing:-1px;color:#141414;">${f.title}</h1>` +
    (f.greeting
      ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:14px;font-weight:700;color:#141414;">${f.greeting}</p>`
      : '') +
    f.body +
    `<p style="margin:22px 0 0;font-family:${FONT};font-size:12px;line-height:1.8;color:#454036;">Here to help,<br><strong>The NexG team</strong></p>` +
    `</td></tr>` +
    // footer
    `<tr><td class="nx-pad" style="padding:0 36px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #ece8df;"><tr>` +
    `<td style="padding:21px 0 26px;font-family:${FONT};font-size:10px;line-height:1.9;color:#81796a;">Need a hand?<br><a href="mailto:${f.supportEmail}" style="color:#625a4e;font-weight:700;text-decoration:none;">${f.supportEmail}</a></td>` +
    `<td align="right" style="padding:21px 0 26px;font-family:${FONT};font-size:10px;line-height:1.9;color:#807768;">${f.footerName}<br><a href="https://www.nexgapp.com" style="color:#a79b84;text-decoration:none;">nexgapp.com</a></td>` +
    `</tr></table></td></tr>` +
    `</table>` +
    `<!--[if mso]></td></tr></table><![endif]-->` +
    `</td></tr></table></body></html>`
  );
}

function codePanel(code: string, label: string, expiry?: string): string {
  /* A Supabase template's {{ .Token }} is one piece of text; a real code is drawn digit by digit. */
  const value = code.includes('{{')
    ? `<div style="font-family:${FONT};font-size:32px;font-weight:800;letter-spacing:8px;color:#242118;">${code}</div>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${[
        ...code.replace(/\s/g, ''),
      ]
        .map(
          (d) =>
            `<td style="padding:0 4px;"><div style="width:42px;height:54px;line-height:54px;border:1px solid #e9dfc8;border-radius:7px;background:#ffffff;font-family:${FONT};font-size:27px;font-weight:800;color:#242118;text-align:center;">${escapeHtml(d)}</div></td>`,
        )
        .join('')}</tr></table>`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:25px 0 21px;background:#fbf8ef;border:1px solid #eee3c7;border-radius:10px;"><tr><td align="center" style="padding:24px 12px;">` +
    `<div style="font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:0.6px;color:#6e634b;margin-bottom:13px;">${label}</div>` +
    value +
    (expiry
      ? `<div style="font-family:${FONT};font-size:11px;color:#71664d;margin-top:15px;">${expiry}</div>`
      : '') +
    `</td></tr></table>`
  );
}

function rowsTable(rows: [string, string][]): string {
  const cells = rows
    .map(([k, v], i) => {
      const line = i < rows.length - 1 ? 'border-bottom:1px solid #ece8df;' : '';
      return (
        `<tr><td valign="top" style="padding:12px 12px 12px 0;${line}font-family:${FONT};font-size:12px;line-height:1.65;color:#776e5f;">${k}</td>` +
        `<td align="right" valign="top" style="padding:12px 0;${line}font-family:${FONT};font-size:12px;line-height:1.65;font-weight:700;color:#141414;">${v}</td></tr>`
      );
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;background:#fdfcf9;border:1px solid #ece8df;border-radius:9px;"><tr><td style="padding:4px 17px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table></td></tr></table>`;
}

function callout(title: string, body: string, warning = false): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;background:${warning ? '#fff9ee' : '#f9f8f3'};border:1px solid ${warning ? '#eddfbd' : '#ebe5d8'};border-radius:8px;"><tr><td style="padding:16px 17px;">` +
    `<div style="font-family:${FONT};font-size:12px;font-weight:800;color:#141414;margin-bottom:4px;">${title}</div>` +
    `<div style="font-family:${FONT};font-size:12px;line-height:1.75;color:#726955;">${body}</div>` +
    `</td></tr></table>`
  );
}

function button(label: string, url: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:25px 0 0;"><tr><td align="center" bgcolor="#d4a72c" style="background:#d4a72c;border:1px solid #bd9323;border-radius:7px;">` +
    `<a href="${url}" style="display:block;padding:15px 18px;font-family:${FONT};font-size:13px;font-weight:800;color:#211b0d;text-decoration:none;text-align:center;">${label}&nbsp;&nbsp;&rarr;</a>` +
    `</td></tr></table>`
  );
}

function note(text: string): string {
  return `<p style="margin:11px 0 0;font-family:${FONT};font-size:11px;line-height:1.8;color:#7a7262;text-align:center;">${text}</p>`;
}

/** The message without the button: what an uploaded design's {{content}} becomes. */
function messageBlock(content: EmailContent): string {
  return leadBlock(content) + tailBlock(content);
}

/** The words and the details: everything that comes before the button. */
function leadBlock(content: EmailContent): string {
  const parts: string[] = [textToHtml(content.intro)];
  if (content.code) {
    parts.push(
      codePanel(
        escapeHtml(content.code),
        escapeHtml(content.codeLabel ?? 'YOUR ONE-TIME CODE'),
        content.expiry ? escapeHtml(content.expiry) : undefined,
      ),
    );
  }
  if (content.amount) {
    parts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:23px 0;background:#faf9f5;border:1px solid #ece8df;border-radius:10px;"><tr><td style="padding:21px 24px;">` +
        `<div style="font-family:${FONT};font-size:11px;color:#6b6457;">${escapeHtml(content.amountLabel ?? 'Amount')}</div>` +
        `<div style="font-family:${FONT};font-size:32px;font-weight:800;letter-spacing:-1px;color:#141414;margin-top:5px;">${escapeHtml(content.amount)}</div>` +
        `</td></tr></table>`,
    );
  }
  if (content.rows?.length) {
    parts.push(rowsTable(content.rows.map(([k, v]) => [escapeHtml(k), escapeHtml(v)])));
  }
  if (content.steps?.length) {
    const steps = content.steps
      .map(
        (s, i) =>
          `<tr><td valign="top" style="padding:7px 12px 7px 0;"><div style="width:23px;height:23px;line-height:23px;border:1px solid #eadcb6;border-radius:12px;background:#fbf7ea;text-align:center;font-family:${FONT};font-size:10px;font-weight:700;color:#86640d;">${i + 1}</div></td>` +
          `<td valign="top" style="padding:8px 0 7px;font-family:${FONT};font-size:13px;line-height:1.65;color:#514c43;">${escapeHtml(s)}</td></tr>`,
      )
      .join('');
    parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">${steps}</table>`,
    );
  }
  return parts.join('');
}

/** The side note and the closing words, which the house design puts after the button. */
function tailBlock(content: EmailContent): string {
  const parts: string[] = [];
  if (content.callout) {
    parts.push(
      callout(
        escapeHtml(content.callout.title),
        escapeHtml(content.callout.body),
        content.callout.warning,
      ),
    );
  }
  if (content.closing) {
    parts.push(
      textToHtml(
        content.closing,
        `margin:23px 0 0;font-family:${FONT};font-size:12px;line-height:1.8;color:#6c6458;`,
      ),
    );
  }
  return parts.join('');
}

/** The button and the line under it; empty when the message links nowhere. */
function actionBlock(content: EmailContent): string {
  const after = content.actionNote ? note(escapeHtml(content.actionNote)) : '';
  if (!content.action?.url) return after;
  return button(escapeHtml(content.action.label), escapeHtml(content.action.url)) + after;
}

function footerName(audience: string): string {
  return FOOTER_NAMES[audience] ?? 'NexG';
}

/** The house design: what every email looks like unless a design was uploaded for its purpose. */
export function renderHouseEmail(content: EmailContent, options: RenderOptions = {}): string {
  const audience = content.audience ?? 'NEXG';
  return frame({
    docTitle: escapeHtml(content.title),
    preheader: content.preheader ? escapeHtml(content.preheader) : undefined,
    audience: escapeHtml(audience),
    footerName: escapeHtml(footerName(audience)),
    tone: content.tone ?? 'gold',
    eyebrow: content.eyebrow ? escapeHtml(content.eyebrow) : undefined,
    title: escapeHtml(content.title),
    greeting: content.greeting ? escapeHtml(content.greeting) : undefined,
    body: leadBlock(content) + actionBlock(content) + tailBlock(content),
    assetBase: options.assetBase ?? DEFAULT_ASSET_BASE,
    supportEmail: escapeHtml(options.supportEmail ?? SUPPORT_EMAIL),
  });
}

// ───────────────────────────────────────────────────────── uploaded designs

/** What an uploaded design may use. {{content}} is required. */
export const DESIGN_PLACEHOLDERS: { name: string; note: string }[] = [
  {
    name: 'content',
    note: 'The message itself: its paragraphs, details and any code or amount. Required.',
  },
  { name: 'action', note: 'The gold button, when the message links somewhere. Empty otherwise.' },
  { name: 'title', note: 'The headline. For most emails it is the subject.' },
  { name: 'greeting', note: 'For example "Hi Amina," when the message has one.' },
  { name: 'eyebrow', note: 'The status line, such as BUSINESS APPROVED.' },
  { name: 'preheader', note: 'The line inboxes show after the subject.' },
  { name: 'action_url', note: 'Only the button’s address, to draw your own button.' },
  { name: 'action_label', note: 'Only the button’s words.' },
  { name: 'support_email', note: 'NexG’s support address.' },
  { name: 'year', note: 'This year, for a copyright line.' },
];

const SUPABASE_FIELD = /\{\{\s*\.(Token|TokenHash|ConfirmationURL)\s*\}\}/;
const CONTENT_FIELD = /\{\{\s*content\s*\}\}/;

/** Problems that stop a design being saved, in plain words. None means it can be saved. */
export function checkDesign(html: string, purposeKey: string): string[] {
  const problems: string[] = [];
  if (!isEmailPurpose(purposeKey)) problems.push('Choose what the design is for.');
  if (html.trim().length < 40) problems.push('The file looks empty.');
  if (html.length > 400_000) {
    problems.push('The file is larger than 400 KB. Gmail cuts off emails that big.');
  }
  if (/<script\b/i.test(html))
    problems.push('Emails cannot run scripts. Remove the <script> tags.');
  if (purposeKey.startsWith('auth.')) {
    if (!SUPABASE_FIELD.test(html)) {
      problems.push(
        'A design for a Supabase email must keep {{ .Token }}, {{ .TokenHash }} or {{ .ConfirmationURL }}, which Supabase fills in.',
      );
    }
  } else if (!CONTENT_FIELD.test(html)) {
    problems.push(
      'Put {{content}} where the message goes. Without it the email would arrive empty.',
    );
  }
  return problems;
}

/** Things that will not stop a design being saved but will show badly in an inbox. */
export function designWarnings(html: string): string[] {
  const warnings: string[] = [];
  const relative = [...html.matchAll(/\b(?:src|background)\s*=\s*["']([^"']+)["']/gi)]
    .map((m) => m[1] ?? '')
    .filter((src) => !/^(?:https?:|cid:|data:|\{\{)/i.test(src.trim()));
  if (relative.length) {
    warnings.push(
      `${relative.length === 1 ? 'An image uses' : `${relative.length} images use`} a file name (${relative
        .slice(0, 3)
        .join(
          ', ',
        )}) instead of a full web address, so inboxes cannot show ${relative.length === 1 ? 'it' : 'them'}. Upload the images with the design, or use addresses that start with https://.`,
    );
  }
  if (/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(html)) {
    warnings.push(
      'The design links a separate stylesheet. Most inboxes ignore those; put the styles in the file itself.',
    );
  }
  return warnings;
}

/** Swaps images a design names by file ("assets/logo.png") for the web addresses of uploaded copies. */
export function replaceImageNames(html: string, urls: Record<string, string>): string {
  const lookup = new Map(Object.entries(urls).map(([name, url]) => [name.toLowerCase(), url]));
  if (lookup.size === 0) return html;
  const swap = (ref: string): string => {
    if (/^(?:https?:|cid:|data:|\{\{)/i.test(ref.trim())) return ref;
    const name = (ref.trim().split(/[?#]/)[0] ?? '').split(/[\\/]/).pop() ?? '';
    return lookup.get(name.toLowerCase()) ?? ref;
  };
  return html
    .replace(
      /(\b(?:src|background)\s*=\s*)(["'])([^"']+)\2/gi,
      (_, attr: string, quote: string, ref: string) => `${attr}${quote}${swap(ref)}${quote}`,
    )
    .replace(
      /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
      (_, quote: string, ref: string) => `url(${quote}${swap(ref)}${quote})`,
    );
}

/** An uploaded design, filled in. Unknown {{placeholders}} are left out; Supabase's {{ .X }} ones are kept. */
export function renderUploadedEmail(
  html: string,
  content: EmailContent,
  options: RenderOptions = {},
): string {
  const values: Record<string, string> = {
    content: messageBlock(content),
    action: actionBlock(content),
    title: escapeHtml(content.title),
    greeting: content.greeting ? escapeHtml(content.greeting) : '',
    eyebrow: content.eyebrow ? escapeHtml(content.eyebrow) : '',
    preheader: content.preheader ? escapeHtml(content.preheader) : '',
    action_url: content.action?.url ? escapeHtml(content.action.url) : '',
    action_label: content.action ? escapeHtml(content.action.label) : '',
    support_email: escapeHtml(options.supportEmail ?? SUPPORT_EMAIL),
    year: String(new Date().getFullYear()),
  };
  return html.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, name: string) => values[name] ?? '');
}

/** The design a purpose uses: the uploaded one when there is one, else the house design. */
export function renderEmail(
  content: EmailContent,
  uploaded: string | null | undefined,
  options: RenderOptions = {},
): string {
  return uploaded
    ? renderUploadedEmail(uploaded, content, options)
    : renderHouseEmail(content, options);
}

/**
 * What a sender calls: the HTML for one email, or null when anything goes
 * wrong, in which case the sender sends the plain text alone. An email must
 * never fail to go out because its decoration did.
 */
export function composeEmailHtml(input: {
  subject: string;
  text: string;
  purpose: string;
  content?: EmailContent;
  design?: string | null;
  assetBase?: string;
}): string | null {
  try {
    const purpose = emailPurpose(input.purpose);
    const content: EmailContent = input.content
      ? {
          audience: purpose.audience,
          eyebrow: purpose.eyebrow,
          tone: purpose.tone,
          ...input.content,
        }
      : fromPlainEmail({ subject: input.subject, body: input.text, purpose });
    return renderEmail(content, input.design, { assetBase: input.assetBase });
  } catch {
    return null;
  }
}

/** The house design with every placeholder in place: the file to start a new design from. */
export function starterDesign(options: RenderOptions = {}): string {
  return frame({
    docTitle: '{{title}}',
    preheader: '{{preheader}}',
    audience: 'NEXG',
    footerName: 'NexG',
    tone: 'gold',
    eyebrow: '{{eyebrow}}',
    title: '{{title}}',
    greeting: '{{greeting}}',
    body: '{{content}}{{action}}',
    assetBase: options.assetBase ?? DEFAULT_ASSET_BASE,
    supportEmail: '{{support_email}}',
  });
}

// ─────────────────────────────────────────────── Supabase's own emails

/*
 * Supabase fills these with Go template fields: {{ .Token }}, {{ .Email }},
 * {{ .SiteURL }}, {{ .TokenHash }} and the user's metadata under .Data.
 * The recovery email doubles as the welcome that sets a first password:
 * nexg_welcome* keys are set by apps/web/lib/merchant-welcome.ts and cleared
 * when the password is set.
 */

/** supabase/templates/otp-code.html: the sign-in and verification code. */
export function supabaseCodeTemplate(options: RenderOptions = {}): string {
  return frame({
    docTitle: 'Your NexG code',
    preheader: 'Your one-time NexG code is inside. It works once and expires soon.',
    audience: 'ACCOUNT',
    footerName: 'NexG',
    tone: 'gold',
    eyebrow: 'SECURE SIGN-IN',
    title: 'Your NexG code',
    body:
      textToHtml('Use this code to verify your email or sign in to NexG.') +
      codePanel('{{ .Token }}', 'YOUR ONE-TIME CODE', 'It works once and expires soon.') +
      callout(
        'Keep this code private',
        'NexG will never ask you to share this code. If you did not ask for it, you can ignore this email.',
        true,
      ),
    assetBase: options.assetBase ?? DEFAULT_ASSET_BASE,
    supportEmail: options.supportEmail ?? SUPPORT_EMAIL,
  });
}

const P = (html: string) => `<p style="${INTRO}">${html}</p>`;
const confirmLink = (next: string) =>
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=${next}`;

/** supabase/templates/password-recovery.html: reset a password, or set the first one. */
export function supabaseRecoveryTemplate(options: RenderOptions = {}): string {
  const welcome =
    `{{ if .Data.nexg_welcome_host }}` +
    P(
      'Thank you for registering{{ if .Data.nexg_welcome_business }} <strong>{{ .Data.nexg_welcome_business }}</strong>{{ end }} with NexG Hosts. Your first month of property management is free.',
    ) +
    P(
      'Next: set your password, sign in to your host workspace and upload your ID and proof of authority to let the property. Once NexG approves them, you can list your units.',
    ) +
    `{{ else if .Data.nexg_welcome_rider }}` +
    P('Thank you for applying to ride with NexG. Our team is reviewing your application.') +
    P(
      'Next: set your password and sign in to your rider dashboard to follow your documents and order your NexG rider kit. Your account goes live once your documents are verified and your kit is paid for at the onboarding session.',
    ) +
    `{{ else if .Data.nexg_welcome_customer }}` +
    P(
      'Your NexG account is ready. Order from local merchants, book stays and follow every delivery live, all from one account.',
    ) +
    `{{ else }}` +
    P(
      'Thank you for registering{{ if .Data.nexg_welcome_business }} <strong>{{ .Data.nexg_welcome_business }}</strong>{{ end }} with NexG. Our team is reviewing your application.',
    ) +
    `{{ end }}` +
    rowsTable([
      [
        '{{ if .Data.nexg_welcome_host }}Host workspace login{{ else if .Data.nexg_welcome_rider }}Rider dashboard login{{ else if .Data.nexg_welcome_customer }}NexG login{{ else }}Merchant workspace login{{ end }}',
        '{{ .Email }}',
      ],
      ['Password', 'Choose your own with the button below'],
    ]) +
    `{{ if .Data.nexg_welcome_host }}` +
    button('Set your password', confirmLink('%2Freset-password%3Fnext%3D%252Fhost')) +
    `{{ else if .Data.nexg_welcome_rider }}` +
    button('Set your password', confirmLink('%2Freset-password%3Fnext%3D%252Frider')) +
    `{{ else if .Data.nexg_welcome_customer }}` +
    button('Set your password', confirmLink('%2Freset-password')) +
    `{{ else }}` +
    button('Set your password', confirmLink('%2Freset-password%3Fnext%3D%252Fmerchant')) +
    `{{ end }}` +
    note(
      '{{ if .Data.nexg_welcome_host }}After that, sign in at {{ .SiteURL }}/hosts/sign-in to finish your setup.{{ else if .Data.nexg_welcome_rider }}After that, sign in at {{ .SiteURL }}/riders/sign-in to reach your rider dashboard.{{ else if .Data.nexg_welcome_customer }}After that, sign in at {{ .SiteURL }}/sign-in on any device.{{ else }}After that, sign in at {{ .SiteURL }}/merchants/sign-in to follow your application and finish your setup.{{ end }}',
    ) +
    callout(
      'The button works once',
      'It also expires. If it has, choose &quot;Forgot password&quot; on the sign-in page and enter {{ .Email }}.',
    );

  const reset =
    P(
      'We received a request to reset the password for <strong>{{ .Email }}</strong>. Use the button below to choose a new one.',
    ) +
    button('Choose a new password', confirmLink('%2Freset-password')) +
    note('The button works once and expires.') +
    callout(
      'Did not ask for this?',
      'You can ignore this email. Your password stays the same unless you choose a new one.',
    );

  return frame({
    docTitle:
      '{{ if .Data.nexg_welcome }}Welcome to NexG{{ else }}Reset your NexG password{{ end }}',
    preheader:
      '{{ if .Data.nexg_welcome }}Set your password to finish setting up your NexG account.{{ else }}Choose a new password for your NexG account.{{ end }}',
    audience:
      '{{ if .Data.nexg_welcome_host }}HOST{{ else if .Data.nexg_welcome_rider }}RIDER{{ else if .Data.nexg_welcome_customer }}NEXG{{ else if .Data.nexg_welcome }}MERCHANT{{ else }}ACCOUNT{{ end }}',
    footerName: 'NexG',
    tone: 'gold',
    eyebrow: '{{ if .Data.nexg_welcome }}WELCOME TO NEXG{{ else }}ACCOUNT RECOVERY{{ end }}',
    title:
      '{{ if .Data.nexg_welcome }}Welcome to NexG{{ if .Data.nexg_welcome_first_name }}, {{ .Data.nexg_welcome_first_name }}{{ end }}{{ else }}Reset your password{{ end }}',
    body:
      `{{ if .Data.nexg_welcome }}${welcome}{{ else }}${reset}{{ end }}` +
      `<p style="margin:22px 0 0;font-family:${FONT};font-size:11px;line-height:1.8;color:#8a8273;">NexG will never ask you for your password by email or phone.</p>`,
    assetBase: options.assetBase ?? DEFAULT_ASSET_BASE,
    supportEmail: options.supportEmail ?? SUPPORT_EMAIL,
  });
}

/** The house version of each Supabase email, by purpose. */
export function supabaseTemplateFor(
  purposeKey: string,
  options: RenderOptions = {},
): string | null {
  if (purposeKey === 'auth.code') return supabaseCodeTemplate(options);
  if (purposeKey === 'auth.password_reset') return supabaseRecoveryTemplate(options);
  return null;
}
