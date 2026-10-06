/**
 * notify-dispatch — the thing that actually sends.
 *
 * `notification_log` has been filling since the site went up and
 * nothing drained it. This drains it, through whichever provider
 * is configured, and records what happened.
 *
 * Three rules it is built around:
 *
 * 1. A provider that is not configured is reported, never
 *    guessed at. A message marked sent that never left is worse
 *    than one that visibly failed, because nobody goes looking.
 *
 * 2. Bodies carrying a one-time code are destroyed the moment
 *    they are sent. `rpc_outbox_sent` does that in the same
 *    statement that marks the row, so there is no window in
 *    which it is both sent and still readable.
 *
 * 3. Failures are classified before they are retried. A wrong
 *    phone number will fail identically five times and then be
 *    abandoned five minutes after the code expired; it should
 *    be abandoned on the first attempt instead.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DISPATCH_SECRET = Deno.env.get('NOTIFY_DISPATCH_SECRET') ?? '';

/* SMS — Africa's Talking first, Twilio if that is what is set. */
const AT_API_KEY = Deno.env.get('AT_API_KEY') ?? '';
const AT_USERNAME = Deno.env.get('AT_USERNAME') ?? '';
const AT_SENDER = Deno.env.get('AT_SENDER_ID') ?? '';
const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_FROM = Deno.env.get('TWILIO_FROM') ?? '';

/* Email */
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? '';

/* WhatsApp — Meta Cloud API */
const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN') ?? '';
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';

interface Due {
  id: string;
  channel: 'sms' | 'email' | 'whatsapp';
  recipient: string;
  template: string;
  subject: string | null;
  body: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

interface Outcome {
  ok: boolean;
  provider: string;
  ref?: string;
  error?: string;
  /** False for anything that will fail the same way next time. */
  retryable?: boolean;
}

Deno.serve(async (request) => {
  const presented = request.headers.get('x-dispatch-secret') ?? '';
  if (
    !DISPATCH_SECRET ||
    presented.length !== DISPATCH_SECRET.length ||
    !timingSafeEqual(presented, DISPATCH_SECRET)
  ) {
    return json({ ok: false, error: 'not for you' }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { data: due, error } = await supabase.rpc('rpc_outbox_due', { p_limit: 50 });
  if (error) return json({ ok: false, error: error.message }, 500);

  const rows = (due ?? []) as Due[];
  if (rows.length === 0) return json({ ok: true, sent: 0, note: 'nothing waiting' });

  let sent = 0;
  let failed = 0;
  const unconfigured = new Set<string>();

  for (const row of rows) {
    const outcome = await send(row);

    if (outcome.ok) {
      await supabase.rpc('rpc_outbox_sent', {
        p_id: row.id,
        p_provider: outcome.provider,
        p_provider_ref: outcome.ref ?? null,
      });
      sent += 1;
    } else {
      if (outcome.provider === 'none') unconfigured.add(row.channel);
      await supabase.rpc('rpc_outbox_failed', {
        p_id: row.id,
        p_error: outcome.error ?? 'unknown',
        /*
         * An unconfigured channel is retryable on purpose. The
         * message is not wrong — the deployment is — and once a
         * key is added the backlog should go out rather than
         * having been abandoned while nobody was looking.
         */
        p_retryable: outcome.retryable ?? true,
      });
      failed += 1;
    }
  }

  return json({
    ok: true,
    considered: rows.length,
    sent,
    failed,
    unconfigured: [...unconfigured],
  });
});

async function send(row: Due): Promise<Outcome> {
  if (!row.body) {
    /* Already redacted, or never rendered. Either way there is
       nothing to send and retrying will not produce one. */
    return { ok: false, provider: 'none', error: 'no body to send', retryable: false };
  }

  switch (row.channel) {
    case 'sms':
      return sendSms(row.recipient, row.body);
    case 'email':
      return sendEmail(row.recipient, row.subject ?? 'NexG', row.body);
    case 'whatsapp':
      return sendWhatsApp(row.recipient, row.body);
    default:
      return { ok: false, provider: 'none', error: `unknown channel`, retryable: false };
  }
}

async function sendSms(to: string, body: string): Promise<Outcome> {
  if (AT_API_KEY && AT_USERNAME) {
    try {
      const form = new URLSearchParams({ username: AT_USERNAME, to, message: body });
      if (AT_SENDER) form.set('from', AT_SENDER);

      const res = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          apiKey: AT_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: form,
      });
      const data = await res.json();
      const recipient = data?.SMSMessageData?.Recipients?.[0];

      /*
       * Africa's Talking answers 201 for a request it accepted,
       * including one it then refused per recipient. The
       * per-recipient status is the one that means delivery, so
       * that is what is checked — a 201 alone would mark an
       * invalid number as sent.
       */
      if (recipient?.statusCode === 101 || recipient?.statusCode === 102) {
        return { ok: true, provider: 'africastalking', ref: recipient.messageId };
      }
      return {
        ok: false,
        provider: 'africastalking',
        error: recipient?.status ?? JSON.stringify(data).slice(0, 300),
        /* 403/404-class per-recipient codes are about the number
           itself and will not improve with time. */
        retryable: !(recipient?.statusCode >= 401 && recipient?.statusCode <= 406),
      };
    } catch (e) {
      return { ok: false, provider: 'africastalking', error: String(e) };
    }
  }

  if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
        },
      );
      const data = await res.json();
      if (res.ok) return { ok: true, provider: 'twilio', ref: data.sid };
      return {
        ok: false,
        provider: 'twilio',
        error: data?.message ?? `HTTP ${res.status}`,
        retryable: res.status >= 500 || res.status === 429,
      };
    } catch (e) {
      return { ok: false, provider: 'twilio', error: String(e) };
    }
  }

  return {
    ok: false,
    provider: 'none',
    error:
      'No SMS provider configured. Set AT_API_KEY and AT_USERNAME, or TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.',
  };
}

async function sendEmail(to: string, subject: string, body: string): Promise<Outcome> {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    return {
      ok: false,
      provider: 'none',
      error: 'No email provider configured. Set RESEND_API_KEY and EMAIL_FROM.',
    };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text: body }),
    });
    const data = await res.json();
    if (res.ok) return { ok: true, provider: 'resend', ref: data.id };
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

async function sendWhatsApp(to: string, body: string): Promise<Outcome> {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    return {
      ok: false,
      provider: 'none',
      error: 'No WhatsApp provider configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.',
    };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to.replace(/^\+/, ''),
        type: 'text',
        text: { body },
      }),
    });
    const data = await res.json();
    if (res.ok) return { ok: true, provider: 'whatsapp', ref: data?.messages?.[0]?.id };
    return {
      ok: false,
      provider: 'whatsapp',
      error: data?.error?.message ?? `HTTP ${res.status}`,
      /*
       * 131047 is "outside the 24-hour window", which needs an
       * approved template rather than a retry. Retrying it
       * burns four more attempts and ends in the same place.
       */
      retryable: res.status >= 500 && data?.error?.code !== 131047,
    };
  } catch (e) {
    return { ok: false, provider: 'whatsapp', error: String(e) };
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
