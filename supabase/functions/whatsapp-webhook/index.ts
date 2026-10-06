/**
 * whatsapp-webhook — where Meta delivers messages.
 *
 * Two jobs. A GET is the verification handshake Meta performs
 * once when the webhook is registered. A POST is a delivery:
 * one or more messages, or a status update about something we
 * sent.
 *
 * Two things it is careful about, both of which are the kind of
 * mistake that only shows up in production:
 *
 * The signature is checked before the body is read as anything
 * but bytes. An unverified webhook endpoint is an open door for
 * writing messages into a support desk as any phone number.
 *
 * It answers 200 even when the handling fails. Meta retries a
 * non-200 with escalating backoff and eventually disables the
 * subscription — which turns one bad message into a silently
 * dead channel. Failures are recorded and the delivery is
 * acknowledged.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';

Deno.serve(async (request) => {
  const url = new URL(request.url);

  /* ─────────────────────── the one-time verification handshake */
  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (!VERIFY_TOKEN) {
      return new Response('WHATSAPP_VERIFY_TOKEN is not set on this function.', { status: 503 });
    }
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('no', { status: 403 });
  }

  if (request.method !== 'POST') {
    return new Response('no', { status: 405 });
  }

  /* Read as text first: the signature is over the raw bytes, and
     parsing then re-serialising would not reproduce them. */
  const raw = await request.text();

  if (!APP_SECRET) {
    return json({ ok: false, error: 'WHATSAPP_APP_SECRET is not set on this function.' }, 503);
  }

  const signature = request.headers.get('x-hub-signature-256') ?? '';
  if (!(await signatureValid(raw, signature, APP_SECRET))) {
    return json({ ok: false, error: 'bad signature' }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  let taken = 0;
  let failed = 0;

  try {
    const payload = JSON.parse(raw);

    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        const contacts: { wa_id?: string; profile?: { name?: string } }[] = value.contacts ?? [];
        const name = contacts[0]?.profile?.name ?? null;

        for (const message of value.messages ?? []) {
          /*
           * Text only for now. An image or a location arriving
           * is recorded as a line saying what it was rather
           * than dropped — an agent seeing nothing would
           * believe the guest sent nothing.
           */
          const body =
            message.type === 'text'
              ? message.text?.body
              : `[${message.type} received — not yet shown here]`;

          const { error } = await supabase.rpc('rpc_wa_inbound', {
            p_msisdn: `+${message.from}`,
            p_body: body ?? '[empty message]',
            p_provider_message_id: message.id,
            p_provider_conversation_id: value?.metadata?.phone_number_id ?? null,
            p_display_name: name,
          });

          if (error) failed += 1;
          else taken += 1;
        }
      }
    }
  } catch (e) {
    /* Still a 200. See the note at the top: a non-200 teaches
       Meta to stop delivering. */
    return json({ ok: false, error: String(e), note: 'acknowledged anyway' }, 200);
  }

  return json({ ok: true, taken, failed });
});

/**
 * Meta signs with HMAC-SHA256 over the raw body, hex, prefixed
 * `sha256=`. Compared in constant time — a signature check that
 * leaks timing is a signature check somebody can walk.
 */
async function signatureValid(raw: string, header: string, secret: string): Promise<boolean> {
  if (!header.startsWith('sha256=')) return false;
  const presented = header.slice('sha256='.length);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const expected = [...new Uint8Array(signed)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
