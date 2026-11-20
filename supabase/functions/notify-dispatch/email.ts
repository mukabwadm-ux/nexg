/**
 * The email half of notify-dispatch, kept apart so it can be tested with the
 * sender injected (email.test.ts): nothing leaves the machine in a test.
 *
 * A message carries its plain text in `body` and, for the app emails, an HTML
 * part in `html`. Resend gets both, so a mail app that shows only text still
 * reads the whole message.
 */

export interface EmailMessage {
  recipient: string;
  subject: string | null;
  body: string;
  html?: string | null;
  payload?: Record<string, unknown> | null;
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
}

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
    const res = await fetchImpl('https://api.resend.com/emails', {
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
