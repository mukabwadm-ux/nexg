/**
 * push-dispatch — sends the notifications that are already in
 * the bell to the screens of the people they belong to.
 *
 * It lives here, as an Edge Function, rather than in the web app
 * for one reason that is not negotiable: sending requires the
 * service role, and the service role must never be an
 * environment variable on `apps/web` or `apps/admin`. Those are
 * built into bundles that reach browsers. This runs inside
 * Supabase, where the key already is.
 *
 * It is a drain, not a trigger. It takes everything unsent,
 * sends it, and marks it — so a run that dies halfway resends
 * at most, and the push `tag` means a resend replaces the
 * notification on the device rather than stacking a second one.
 * At-least-once with a replace is the right trade here; nobody
 * is harmed by seeing "your rider is nearly there" twice, and
 * somebody is harmed by never seeing it.
 */
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@nexgapp.com';
const DISPATCH_SECRET = Deno.env.get('PUSH_DISPATCH_SECRET') ?? '';

interface Due {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  href: string | null;
  tag: string | null;
}

interface Sub {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

Deno.serve(async (request) => {
  /*
   * The function is invoked by pg_cron, not by a person, so it
   * is closed to anything without the shared secret. Compared
   * in full rather than short-circuiting on the first wrong
   * character — a timing side channel on a secret that sends
   * notifications is not much, but the comparison costs nothing.
   */
  const presented = request.headers.get('x-push-secret') ?? '';
  if (!DISPATCH_SECRET || presented.length !== DISPATCH_SECRET.length ||
      !timingSafeEqual(presented, DISPATCH_SECRET)) {
    return json({ ok: false, error: 'not for you' }, 401);
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    /*
     * Said rather than failed silently. Without the keys the
     * browser could not have subscribed either, so this is a
     * deployment that is half-configured and the answer should
     * name the missing half.
     */
    return json({
      ok: false,
      error: 'No VAPID keys on this function. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.',
    }, 503);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { data: due, error: dueError } = await supabase.rpc('rpc_push_due', { p_limit: 200 });
  if (dueError) return json({ ok: false, error: dueError.message }, 500);

  const rows = (due ?? []) as Due[];
  if (rows.length === 0) return json({ ok: true, sent: 0, note: 'nothing waiting' });

  /* One query for every subscription involved, rather than one
     per notification — the same person usually has two or three
     and the same device receives several in a run. */
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: subsData } = await supabase
    .from('push_subscription')
    .select('id, user_id, endpoint, p256dh, auth_key')
    .in('user_id', userIds)
    .is('failed_at', null);

  const subs = (subsData ?? []) as Sub[];
  const byUser = new Map<string, Sub[]>();
  for (const s of subs) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(s);
    byUser.set(s.user_id, list);
  }

  let sent = 0;
  let gone = 0;
  const delivered: string[] = [];
  const dead: string[] = [];

  for (const row of rows) {
    const targets = byUser.get(row.user_id) ?? [];

    /*
     * Nobody subscribed is not a failure. They read the bell
     * instead, and marking it sent stops it being retried for
     * ever against a person who never turned push on.
     */
    if (targets.length === 0) {
      delivered.push(row.id);
      continue;
    }

    const payload = JSON.stringify({
      title: row.title,
      body: row.body ?? '',
      href: row.href ?? '/',
      tag: row.tag ?? undefined,
    });

    for (const target of targets) {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth_key },
          },
          payload,
          { TTL: 60 * 60 },
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        /*
         * 404 and 410 mean the browser threw the subscription
         * away — the app was uninstalled, or the push service
         * rotated it. That is not an error to retry, it is a
         * row to retire.
         */
        if (status === 404 || status === 410) {
          dead.push(target.endpoint);
          gone += 1;
        }
      }
    }

    delivered.push(row.id);
  }

  if (delivered.length > 0) {
    await supabase.rpc('rpc_push_mark_sent', { p_ids: delivered });
  }
  if (dead.length > 0) {
    await supabase.rpc('rpc_push_retire', { p_endpoints: dead });
  }

  return json({ ok: true, considered: rows.length, sent, retired: gone });
});

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
