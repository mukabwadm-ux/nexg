import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeDispatcher } from './handler.ts';
import { apnsMessage, copy, fcmMessage, type Delivery } from './payload.ts';
import { createNativeSender, type Outcome } from './providers.ts';

const instant = Date.parse('2026-11-15T09:00:00Z');
const fixture: Delivery = {
  id: '108',
  lease: 'e704fe03-43b2-43e9-8fb9-888c2d10d284',
  binding: 2,
  installation_id: 'd8000000-0000-7000-8000-000000000001',
  app: 'consumer',
  platform: 'ios',
  environment: 'sandbox',
  token: 'abcdef1234567890'.repeat(4),
  locale: 'en',
  surface: 'alert',
  watch_id: null,
  subject: 'order',
  subject_id: 'd8000000-0000-7000-8000-000000000002',
  stage: 'picked_up',
  terminal: false,
  deadline: null,
  occurred_at: new Date(instant - 1000).toISOString(),
  expires_at: new Date(instant + 20_000).toISOString(),
};

test('APNs uses the app topic, binds the notification to the current installation and keeps tokens out of the body', () => {
  const payload = apnsMessage(fixture, instant);
  assert.equal(payload.headers['apns-topic'], 'com.nexg.app');
  assert.equal(payload.headers['apns-push-type'], 'alert');
  assert.equal(payload.body.nexg_d8?.installationId, fixture.installation_id);
  assert.equal(payload.body.nexg_d8?.binding, 2);
  assert.equal(payload.body.nexg_d8?.eventId, '108');
  assert.doesNotMatch(JSON.stringify(payload.body), new RegExp(fixture.token));
});

test('ActivityKit updates contain Expo Widgets props and end at a verified terminal stage', () => {
  const cases = [
    {
      app: 'consumer',
      subject: 'order',
      stage: 'picked_up',
      final: 'delivered',
      name: 'NexgConsumerProgress',
      topic: 'com.nexg.app',
    },
    {
      app: 'stays',
      subject: 'stay',
      stage: 'held',
      final: 'booked',
      name: 'NexgStaysTracking',
      topic: 'com.nexg.stay',
    },
    {
      app: 'rider',
      subject: 'job',
      stage: 'assigned',
      final: 'completed',
      name: 'RiderJobActivity',
      topic: 'com.nexg.rider',
    },
  ] as const;
  for (const row of cases) {
    const delivery = {
      ...fixture,
      ...row,
      surface: 'live' as const,
      watch_id: fixture.subject_id,
      locale: 'sw' as const,
      deadline: new Date(instant + 10000).toISOString(),
    };
    const payload = apnsMessage(delivery, instant);
    assert.equal(payload.headers['apns-topic'], row.topic + '.push-type.liveactivity');
    assert.equal(payload.headers['apns-push-type'], 'liveactivity');
    assert.ok('event' in payload.body.aps);
    assert.equal(payload.body.aps.event, 'update');
    assert.ok('stale-date' in payload.body.aps);
    assert.equal(payload.body.aps['stale-date'], instant / 1000 + 10);
    const state = payload.body.aps['content-state']!;
    assert.equal(state.name, row.name);
    const props = JSON.parse(state.props);
    assert.match(props.stale, /Fungua NexG/);
    if (row.app === 'stays') assert.equal(props.endsAt, instant + 10000);
    const terminal = apnsMessage({ ...delivery, stage: row.final, terminal: true }, instant);
    assert.ok('event' in terminal.body.aps);
    assert.equal(terminal.body.aps.event, 'end');
    assert.ok('dismissal-date' in terminal.body.aps);
    assert.equal(terminal.body.aps['dismissal-date'], instant / 1000);
  }
});

test('Android gets data-only updates for the active watch and user-visible offers with a bounded TTL', () => {
  const android = { ...fixture, app: 'rider' as const, platform: 'android' as const };
  const live = fcmMessage(
    {
      ...android,
      surface: 'live',
      subject: 'job',
      watch_id: fixture.subject_id,
      stage: 'completed',
      terminal: true,
    },
    instant,
  ).message;
  assert.equal(live.android.notification, undefined);
  assert.equal(live.android.priority, 'HIGH');
  assert.equal(live.android.restricted_package_name, 'com.nexg.rider');
  const payload = JSON.parse(live.data.nexg_d8);
  assert.equal(payload.watchId, fixture.subject_id);
  assert.equal(payload.terminal, true);
  assert.equal(payload.binding, 2);
  assert.equal(payload.progress, 100);

  const offer = fcmMessage({ ...android, subject: 'offer', stage: 'offered' }, instant).message;
  assert.equal(offer.android.notification?.channel_id, 'rider.offers');
  assert.equal(offer.android.notification?.visibility, 'PRIVATE');
  assert.equal(offer.android.ttl, '20s');
  assert.equal(offer.android.priority, 'HIGH');
});

async function pem(algorithm: EcKeyGenParams | RsaHashedKeyGenParams) {
  const keys = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey));
  return (
    '-----BEGIN PRIVATE KEY-----\n' +
    btoa(String.fromCharCode(...bytes)) +
    '\n-----END PRIVATE KEY-----'
  );
}

test('APNs authenticates against the sandbox, retries 429 and retires an unregistered token', async () => {
  const config: Record<string, string> = {
    D8_APNS_KEY: await pem({ name: 'ECDSA', namedCurve: 'P-256' }),
    D8_APNS_KEY_ID: 'FIXTURE',
    D8_APNS_TEAM_ID: 'TESTTEAM',
  };
  let attempts = 0;
  const send = createNativeSender({
    read: (key) => config[key],
    now: () => instant,
    async fetch(endpoint, options) {
      assert.ok(endpoint.startsWith('https://api.sandbox.push.apple.com/3/device/'));
      const headers = new Headers(options.headers);
      assert.match(headers.get('authorization') ?? '', /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
      assert.equal(headers.get('apns-topic'), 'com.nexg.app');
      attempts += 1;
      return new Response(null, { status: attempts === 1 ? 429 : 410 });
    },
  });
  assert.equal(await send(fixture), 'retry');
  assert.equal(await send(fixture), 'gone');
  assert.equal(await send({ ...fixture, expires_at: new Date(instant).toISOString() }), 'expired');
  assert.equal(attempts, 2);
});

test('FCM shares the OAuth exchange and distinguishes an invalid token from a failed project', async () => {
  const config: Record<string, string> = {
    D8_FCM_SANDBOX_PROJECT: 'd8-sandbox',
    D8_FCM_CLIENT_EMAIL: 'test@d8-sandbox.iam.gserviceaccount.com',
    D8_FCM_PRIVATE_KEY: await pem({
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    }),
  };
  let oauthRequests = 0;
  let sends = 0;
  const send = createNativeSender({
    read: (key) => config[key],
    now: () => instant,
    async fetch(endpoint, options) {
      if (endpoint === 'https://oauth2.googleapis.com/token') {
        oauthRequests += 1;
        assert.match(String(options.body), /assertion=[\w-]+\.[\w-]+\.[\w-]+/);
        return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
      }
      assert.equal(endpoint, 'https://fcm.googleapis.com/v1/projects/d8-sandbox/messages:send');
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer fixture-access');
      sends += 1;
      return Response.json(
        {
          error: { details: [{ errorCode: sends === 1 ? 'UNREGISTERED' : 'SENDER_ID_MISMATCH' }] },
        },
        { status: 404 },
      );
    },
  });
  const android: Delivery = { ...fixture, platform: 'android' };
  assert.deepEqual((await Promise.all([send(android), send(android)])).sort(), ['failed', 'gone']);
  assert.equal(oauthRequests, 1);
  assert.equal(sends, 2);
});

test('dispatcher rejects missing credentials and reports per-delivery outcomes without exposing tokens', async () => {
  let claims = 0;
  const outcomes: Outcome[] = [];
  const handler = createNativeDispatcher({
    secret: 'fixture-secret',
    enabled: true,
    queue: {
      async claim(limit) {
        assert.equal(limit, 12);
        claims += 1;
        return [fixture, { ...fixture, id: '109' }];
      },
      async finish(_delivery, result) {
        outcomes.push(result);
        return true;
      },
    },
    async send(delivery) {
      if (delivery.id === '109') throw new Error('fixture transport failure');
      return 'sent';
    },
  });
  const url = 'https://fixture.example/native-push-dispatch';
  assert.equal((await handler(new Request(url))).status, 405);
  assert.equal((await handler(new Request(url, { method: 'POST' }))).status, 401);
  assert.equal(claims, 0);
  const response = await handler(
    new Request(url, {
      method: 'POST',
      headers: { 'x-native-push-secret': 'fixture-secret' },
    }),
  );
  assert.deepEqual(await response.json(), { claimed: 2, outcomes: { sent: 1, retry: 1 } });
  assert.deepEqual(outcomes.sort(), ['retry', 'sent']);
});

test('every stage the database can queue has words, and none shows a code, a price or an address', () => {
  const stages: Record<string, string[]> = {
    order: [
      'confirmed',
      'preparing',
      'ready',
      'picked_up',
      'arriving',
      'delivered',
      'cancelled',
      'disputed',
      'refunded',
    ],
    booking: [
      'payment_due',
      'quote',
      'confirmed',
      'changed',
      'reminder',
      'upcoming',
      'cancelled',
      'completed',
    ],
    stay: [
      'held',
      'booked',
      'changed',
      'check_in_soon',
      'checked_in',
      'check_out_soon',
      'checked_out',
      'cancelled',
      'hold_expired',
    ],
    ticket: ['reply'],
    conversation: ['host_message', 'guest_message', 'nexg_joined', 'nexg_message'],
    job: [
      'assigned',
      'ready',
      'picked_up',
      'arriving',
      'delivered',
      'completed',
      'cancelled',
      'reassigned',
    ],
    offer: ['offered', 'expiring'],
    disposal: ['disposal_approved', 'disposal_rejected'],
    payout: ['payout_approved', 'payout_paid', 'payout_rejected'],
    account: ['account_active', 'account_suspended', 'account_offboarded'],
  };
  for (const [subject, list] of Object.entries(stages)) {
    for (const stage of list) {
      for (const locale of ['en', 'sw'] as const) {
        const words = copy({ ...fixture, subject: subject as Delivery['subject'], stage, locale });
        assert.ok(words.title.length > 0, `${subject}.${stage} has a title`);
        assert.doesNotMatch(words.title + words.body, /\d{3,}|KES|Ksh|\bstreet\b|\broad\b/i);
      }
    }
  }
});

test('Consumer live activities use the app widget props and its icons', () => {
  const live = { ...fixture, surface: 'live' as const, watch_id: fixture.subject_id };
  const order = JSON.parse(apnsMessage(live, instant).body.aps['content-state']!.props);
  assert.deepEqual(Object.keys(order).sort(), [
    'body',
    'icon',
    'progress',
    'short',
    'stale',
    'title',
  ]);
  assert.equal(order.icon, 'bag');
  const booking = JSON.parse(
    apnsMessage({ ...live, subject: 'booking', stage: 'upcoming' }, instant).body.aps[
      'content-state'
    ]!.props,
  );
  assert.equal(booking.icon, 'calendar');
});

test('A rider offer is time-sensitive on iPhone', () => {
  const offer = apnsMessage(
    { ...fixture, app: 'rider', subject: 'offer', stage: 'offered' },
    instant,
  );
  assert.equal(offer.body.aps['interruption-level'], 'time-sensitive');
});

test('the probe proves the Firebase credential with a made-up token and sends nothing real', async () => {
  const key = await pem({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  });
  const run = async (status: number, errorCode: string) => {
    const bodies: string[] = [];
    const send = createNativeSender({
      read: (name) =>
        ({
          D8_FCM_PROJECT: 'nexg-live',
          D8_FCM_CLIENT_EMAIL: 'probe@nexg-live.iam.gserviceaccount.com',
          D8_FCM_PRIVATE_KEY: key,
        })[name],
      now: () => instant,
      async fetch(endpoint, options) {
        if (endpoint === 'https://oauth2.googleapis.com/token') {
          return Response.json({ access_token: 'fixture-access', expires_in: 3600 });
        }
        bodies.push(String(options.body));
        return Response.json(
          { error: { status: 'INVALID_ARGUMENT', details: [{ errorCode }] } },
          { status },
        );
      },
    });
    return { report: await send.probe(), bodies };
  };
  const ok = await run(400, 'INVALID_ARGUMENT');
  assert.equal(ok.report.fcm.result, 'credential_ok');
  assert.equal(ok.report.fcm.reason, 'INVALID_ARGUMENT');
  assert.equal(ok.report.fcm_sandbox.result, 'not_configured');
  assert.equal(ok.report.apns.result, 'not_configured');
  const sent = JSON.parse(ok.bodies[0]);
  assert.equal(sent.validate_only, true);
  assert.equal(sent.message.token, 'nexg.probe.not.a.device');
  assert.equal(sent.message.notification, undefined, 'the probe carries no visible notification');
  const refused = await run(403, 'SENDER_ID_MISMATCH');
  assert.equal(refused.report.fcm.result, 'credential_refused');
});

test('a probe needs the secret, works while delivery is off, and claims nothing', async () => {
  let claims = 0;
  const handler = createNativeDispatcher({
    secret: 'fixture-secret',
    enabled: false,
    queue: {
      async claim() {
        claims += 1;
        return [];
      },
      async finish() {
        return true;
      },
    },
    send: async () => 'sent',
    probe: async () => ({
      fcm: { result: 'credential_ok', status: 400 },
      fcm_sandbox: { result: 'not_configured' },
      apns: { result: 'not_configured' },
    }),
  });
  const url = 'https://fixture.example/native-push-dispatch';
  const body = JSON.stringify({ probe: true });
  assert.equal((await handler(new Request(url, { method: 'POST', body }))).status, 401);
  const response = await handler(
    new Request(url, {
      method: 'POST',
      body,
      headers: { 'x-native-push-secret': 'fixture-secret' },
    }),
  );
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.delivery, 'disabled');
  assert.equal(report.providers.fcm.result, 'credential_ok');
  const plain = await handler(
    new Request(url, {
      method: 'POST',
      body: '{}',
      headers: { 'x-native-push-secret': 'fixture-secret' },
    }),
  );
  assert.equal(plain.status, 503, 'without the probe flag a disabled sender still refuses to send');
  assert.equal(claims, 0);
});
