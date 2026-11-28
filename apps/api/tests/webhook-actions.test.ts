import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, createServerClient } = vi.hoisted(() => {
  const rpc = vi.fn();
  const createServerClient = vi.fn(() => ({ rpc }));
  return { rpc, createServerClient };
});
vi.mock('@supabase/ssr', () => ({ createServerClient }));
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => undefined }) }));

import {
  createWebhookEndpoint,
  readWebhookDeliveries,
  sendWebhookSample,
  sendWebhookTest,
  setWebhookEndpointEnabled,
} from '../app/developers/webhook-actions';
import { listWebhookEndpoints } from '../lib/webhooks';

const MERCHANT = '22222222-2222-4222-8222-222222222222';
const ENDPOINT = '33333333-3333-4333-8333-333333333333';
const ROW = {
  id: ENDPOINT,
  merchant_id: MERCHANT,
  merchant_name: 'Sunrise Tours',
  environment: 'live',
  url: 'https://hooks.example.com/nexg',
  description: null,
  secret_prefix: 'whsec_ab12cd',
  enabled: true,
  created_at: '2026-11-17T06:00:00+00:00',
  last_delivery_at: null,
  last_delivery_ok: null,
  last_status_code: null,
  waiting: 0,
  failed: 0,
};

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  rpc.mockImplementation(async (name: string) =>
    name === 'rpc_api_webhook_endpoints'
      ? { data: [ROW], error: null }
      : name === 'rpc_api_webhook_endpoint_create'
        ? {
            data: {
              id: ENDPOINT,
              secret: `whsec_${'0'.repeat(64)}`,
              secret_prefix: 'whsec_000000',
            },
            error: null,
          }
        : { data: null, error: null },
  );
});
afterEach(() => vi.unstubAllEnvs());

describe('webhook endpoints in the developer console', () => {
  it('adds an endpoint and shows its secret once, with the refreshed list', async () => {
    const result = await createWebhookEndpoint(
      form({
        merchant_id: MERCHANT,
        url: ' https://hooks.example.com/nexg ',
        environment: 'test',
        description: 'Back office',
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      secretPrefix: 'whsec_000000',
      endpoints: [{ id: ENDPOINT, merchantName: 'Sunrise Tours', environment: 'live' }],
    });
    expect(rpc).toHaveBeenCalledWith('rpc_api_webhook_endpoint_create', {
      p_merchant_id: MERCHANT,
      p_url: 'https://hooks.example.com/nexg',
      p_environment: 'test',
      p_description: 'Back office',
    });
  });

  it('asks for a merchant before calling the database', async () => {
    const result = await createWebhookEndpoint(form({ url: 'https://hooks.example.com/nexg' }));
    expect(result).toEqual({ ok: false, message: 'Choose the merchant these events are for.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes the database’s refusal through in its own words', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Use an https address on a public host, such as https://example.com/nexg/events.',
      },
    });
    const result = await createWebhookEndpoint(
      form({ merchant_id: MERCHANT, url: 'http://10.0.0.1/x', environment: 'live' }),
    );
    expect(result).toEqual({
      ok: false,
      message: 'Use an https address on a public host, such as https://example.com/nexg/events.',
    });
  });

  it('sends a test event and switches an endpoint off by id only', async () => {
    expect(await sendWebhookTest('not-an-id')).toEqual({ ok: false, message: 'No such endpoint.' });
    expect(rpc).not.toHaveBeenCalled();

    const sent = await sendWebhookTest(ENDPOINT);
    expect(sent).toMatchObject({ ok: true, endpoints: [{ id: ENDPOINT }] });
    expect(rpc).toHaveBeenCalledWith('rpc_api_webhook_ping', { p_id: ENDPOINT });

    expect(await sendWebhookSample(ENDPOINT, 'booking.created')).toEqual({
      ok: false,
      message: 'Choose which reservation event to send.',
    });
    const sample = await sendWebhookSample(ENDPOINT, 'reservation.updated');
    expect(sample).toMatchObject({ ok: true, endpoints: [{ id: ENDPOINT }] });
    expect(rpc).toHaveBeenCalledWith('rpc_api_webhook_sample', {
      p_id: ENDPOINT,
      p_type: 'reservation.updated',
    });

    const off = await setWebhookEndpointEnabled(ENDPOINT, false);
    expect(off).toMatchObject({ ok: true, message: 'Switched off. Waiting events were dropped.' });
    expect(rpc).toHaveBeenCalledWith('rpc_api_webhook_endpoint_set_enabled', {
      p_id: ENDPOINT,
      p_enabled: false,
    });
  });

  it('reads deliveries, and refuses a list it cannot read', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          event_id: '55555555-5555-4555-8555-555555555555',
          type: 'booking.created',
          reference: 'NX-261117-0001',
          status: 'requested',
          state: 'delivered',
          attempts: 1,
          last_status_code: 204,
          last_error: null,
          created_at: '2026-11-17T06:00:00+00:00',
          delivered_at: '2026-11-17T06:00:41+00:00',
          next_attempt_at: null,
        },
      ],
      error: null,
    });
    expect(await readWebhookDeliveries(ENDPOINT)).toMatchObject({
      ok: true,
      deliveries: [{ type: 'booking.created', state: 'delivered', lastStatusCode: 204 }],
    });

    rpc.mockResolvedValueOnce({ data: [{ id: 'broken' }], error: null });
    expect(await listWebhookEndpoints({ rpc })).toEqual({
      ok: false,
      message: 'The endpoints could not be read.',
    });
  });
});
