/**
 * The email half of notify-dispatch, kept apart so it can be tested with the
 * sender and the storage reads injected (email.test.ts): nothing leaves the
 * machine in a test.
 *
 * A message carries its plain text in `body` and, for the app emails, an HTML
 * part in `html`. Resend gets both, so a mail app that shows only text still
 * reads the whole message.
 *
 * Two things a queued email can ask for in its payload, both written only by
 * database functions (nothing else can write the outbox):
 *
 *   - `content`: the parts of the designed email (title, steps, a callout…),
 *     for an email that needs more than paragraphs drawn from its text;
 *   - `attachments`: files to attach, named by bucket and path. Only the
 *     buckets and paths listed in ATTACHABLE are read, each file is checked
 *     against the SHA-256 the payload gives, and a file that cannot be read
 *     stops the email rather than sending it without the file.
 */
import type { EmailContent } from './email-design.ts';

export interface EmailAttachment {
  filename: string;
  /** The file, base64. */
  content: string;
}

export interface EmailMessage {
  recipient: string;
  subject: string | null;
  body: string;
  html?: string | null;
  payload?: Record<string, unknown> | null;
  attachments?: EmailAttachment[];
}

export interface EmailOutcome {
  ok: boolean;
  provider: string;
  ref?: string;
  error?: string;
  retryable?: boolean;
}

export interface EmailConfig {
  apiKey: string;
  from: string;
  /**
   * Where the message is posted: Resend, unless RESEND_API_URL points a local
   * run at a stand-in that records what would have been sent. Never set in
   * production.
   */
  endpoint?: string;
}

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** What is posted to Resend for one message. */
export function resendBody(message: EmailMessage, defaultFrom: string): Record<string, unknown> {
  const payload = message.payload ?? {};
  const from = typeof payload.from === 'string' && payload.from ? payload.from : defaultFrom;
  const replyTo = typeof payload.reply_to === 'string' ? payload.reply_to : undefined;
  const html = typeof message.html === 'string' && message.html.trim() ? message.html : undefined;
  return {
    from,
    to: [message.recipient],
    subject: message.subject ?? 'NexG',
    text: message.body,
    ...(html ? { html } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
  };
}

export async function sendEmail(
  message: EmailMessage,
  config: EmailConfig,
  fetchImpl: Fetch,
): Promise<EmailOutcome> {
  if (!config.apiKey || !config.from) {
    return {
      ok: false,
      provider: 'none',
      error: 'No email provider configured. Set RESEND_API_KEY and EMAIL_FROM.',
    };
  }
  try {
    const res = await fetchImpl(config.endpoint || RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendBody(message, config.from)),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, provider: 'resend', ref: data?.id };
    return {
      ok: false,
      provider: 'resend',
      error: data?.message ?? `HTTP ${res.status}`,
      retryable: res.status >= 500 || res.status === 429,
    };
  } catch (e) {
    return { ok: false, provider: 'resend', error: String(e) };
  }
}

// ───────────────────────────────────────────────────────────── the parts

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.trim() && value.length <= max ? value : undefined;

/**
 * The designed email's parts from a payload's `content`, or undefined to draw
 * the email from its text as usual. Only the message's own parts are taken:
 * the status line, colour and audience stay the purpose's.
 */
export function contentFrom(payload: Record<string, unknown> | null | undefined) {
  const c = payload?.content;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return undefined;
  const raw = c as Record<string, unknown>;
  const title = text(raw.title, 200);
  const intro = text(raw.intro, 4000);
  if (!title || !intro) return undefined;

  const content: EmailContent = { title, intro };
  const greeting = text(raw.greeting, 120);
  if (greeting) content.greeting = greeting;
  const preheader = text(raw.preheader, 200);
  if (preheader) content.preheader = preheader;
  const closing = text(raw.closing, 2000);
  if (closing) content.closing = closing;
  const actionNote = text(raw.actionNote, 300);
  if (actionNote) content.actionNote = actionNote;

  if (Array.isArray(raw.steps)) {
    const steps = raw.steps.map((s) => text(s, 400)).filter((s): s is string => Boolean(s));
    if (steps.length) content.steps = steps.slice(0, 8);
  }
  if (Array.isArray(raw.rows)) {
    const rows = raw.rows.flatMap((r): [string, string][] => {
      if (!Array.isArray(r) || r.length !== 2) return [];
      const [k, v] = [text(r[0], 80), text(r[1], 300)];
      return k && v ? [[k, v]] : [];
    });
    if (rows.length) content.rows = rows.slice(0, 10);
  }
  const action = raw.action as Record<string, unknown> | undefined;
  const label = text(action?.label, 80);
  const url = text(action?.url, 500);
  if (label && url && /^https:\/\//.test(url)) content.action = { label, url };
  const callout = raw.callout as Record<string, unknown> | undefined;
  const calloutTitle = text(callout?.title, 120);
  const calloutBody = text(callout?.body, 1000);
  if (calloutTitle && calloutBody) content.callout = { title: calloutTitle, body: calloutBody };
  return content;
}

// ─────────────────────────────────────────────────────────── attachments

/**
 * The files an email may carry, by bucket: a path must match. Signed
 * merchant agreements only, for now; anything else in a payload is refused,
 * so a mistake elsewhere cannot mail a private file.
 */
export const ATTACHABLE: Record<string, RegExp> = {
  'merchant-agreements':
    /^signed\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/,
};

/** Resend takes 40 MB a message; nothing NexG attaches comes near 5 MB. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.pdf$/;

/** Reads a file from storage: its bytes, or null when it cannot be read. */
export type Download = (bucket: string, path: string) => Promise<Uint8Array | null>;

export type Attached =
  | { ok: true; attachments: EmailAttachment[] }
  | { ok: false; error: string; retryable: boolean };

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The files a payload's `attachments` names, read and checked. A payload
 * that names none gives none. A file that is not allowed, too large or not
 * the one on record will fail the same way next time, so it is not retried;
 * a file storage could not hand over this minute is.
 */
export async function prepareAttachments(
  payload: Record<string, unknown> | null | undefined,
  download: Download,
): Promise<Attached> {
  const listed = payload?.attachments;
  if (listed === undefined || listed === null) return { ok: true, attachments: [] };
  if (!Array.isArray(listed) || listed.length > 5) {
    return {
      ok: false,
      error: 'The attachments in this email are not readable.',
      retryable: false,
    };
  }
  const attachments: EmailAttachment[] = [];
  for (const item of listed) {
    const spec = (item ?? {}) as Record<string, unknown>;
    const bucket = typeof spec.bucket === 'string' ? spec.bucket : '';
    const path = typeof spec.path === 'string' ? spec.path : '';
    const filename = typeof spec.filename === 'string' ? spec.filename : '';
    const sha256 = typeof spec.sha256 === 'string' ? spec.sha256.toLowerCase() : '';
    const allowed = ATTACHABLE[bucket];
    if (!allowed || !allowed.test(path)) {
      return {
        ok: false,
        error: `Not a file an email may attach: ${bucket}/${path}`,
        retryable: false,
      };
    }
    if (!FILENAME.test(filename)) {
      return { ok: false, error: `Not a usable attachment name: ${filename}`, retryable: false };
    }
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      return {
        ok: false,
        error: `${filename} has no checksum to check it against.`,
        retryable: false,
      };
    }
    const bytes = await download(bucket, path).catch(() => null);
    if (!bytes) {
      return { ok: false, error: `${filename} could not be read from storage.`, retryable: true };
    }
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: `${filename} is empty or larger than 5 MB.`, retryable: false };
    }
    if ((await sha256Hex(bytes)) !== sha256) {
      return {
        ok: false,
        error: `${filename} in storage is not the file on record (SHA-256 differs).`,
        retryable: false,
      };
    }
    attachments.push({ filename, content: toBase64(bytes) });
  }
  return { ok: true, attachments };
}
