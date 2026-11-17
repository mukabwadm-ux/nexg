import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * Webhook endpoints as the developer console shows them.
 *
 * The database decides everything: whose endpoints a person sees (the
 * merchants they own), what an address may be, and the signing secret,
 * which is shown once, when an endpoint is added, and never read back.
 */

const Row = z.object({
  id: z.string().uuid(),
  merchant_id: z.string().uuid(),
  merchant_name: z.string(),
  environment: z.enum(['live', 'test']),
  url: z.string(),
  description: z.string().nullable(),
  secret_prefix: z.string(),
  enabled: z.boolean(),
  created_at: z.string(),
  last_delivery_at: z.string().nullable(),
  last_delivery_ok: z.boolean().nullable(),
  last_status_code: z.number().int().nullable(),
  waiting: z.number().int(),
  failed: z.number().int(),
});

export interface WebhookEndpoint {
  id: string;
  merchantId: string;
  merchantName: string;
  environment: 'live' | 'test';
  url: string;
  description: string | null;
  secretPrefix: string;
  enabled: boolean;
  createdAt: string;
  lastDeliveryAt: string | null;
  lastDeliveryOk: boolean | null;
  lastStatusCode: number | null;
  waiting: number;
  failed: number;
}

const DeliveryRow = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  type: z.string(),
  reference: z.string().nullable(),
  status: z.string().nullable(),
  state: z.enum(['queued', 'sending', 'delivered', 'failed']),
  attempts: z.number().int(),
  last_status_code: z.number().int().nullable(),
  last_error: z.string().nullable(),
  created_at: z.string(),
  delivered_at: z.string().nullable(),
  next_attempt_at: z.string().nullable(),
});

export interface WebhookDelivery {
  id: string;
  type: string;
  reference: string | null;
  status: string | null;
  state: 'queued' | 'sending' | 'delivered' | 'failed';
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
  nextAttemptAt: string | null;
}

/** The functions are newer than the generated types; read through a narrow shape. */
export type RpcCaller = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export function rpcCaller(client: SupabaseClient | RpcCaller): RpcCaller {
  return client as unknown as RpcCaller;
}

export type EndpointList =
  | { ok: true; endpoints: WebhookEndpoint[] }
  | { ok: false; message: string };

/** The endpoints of every merchant the signed-in person owns. */
export async function listWebhookEndpoints(client: RpcCaller): Promise<EndpointList> {
  const { data, error } = await client.rpc('rpc_api_webhook_endpoints');
  if (error) return { ok: false, message: error.message };
  const rows = z.array(Row).safeParse(data ?? []);
  if (!rows.success) return { ok: false, message: 'The endpoints could not be read.' };
  return {
    ok: true,
    endpoints: rows.data.map((r) => ({
      id: r.id,
      merchantId: r.merchant_id,
      merchantName: r.merchant_name,
      environment: r.environment,
      url: r.url,
      description: r.description,
      secretPrefix: r.secret_prefix,
      enabled: r.enabled,
      createdAt: r.created_at,
      lastDeliveryAt: r.last_delivery_at,
      lastDeliveryOk: r.last_delivery_ok,
      lastStatusCode: r.last_status_code,
      waiting: r.waiting,
      failed: r.failed,
    })),
  };
}

export type DeliveryList =
  | { ok: true; deliveries: WebhookDelivery[] }
  | { ok: false; message: string };

/** The latest deliveries to one endpoint, newest first. */
export async function listWebhookDeliveries(
  client: RpcCaller,
  endpointId: string,
): Promise<DeliveryList> {
  const { data, error } = await client.rpc('rpc_api_webhook_deliveries', {
    p_endpoint_id: endpointId,
    p_limit: 20,
  });
  if (error) return { ok: false, message: error.message };
  const rows = z.array(DeliveryRow).safeParse(data ?? []);
  if (!rows.success) return { ok: false, message: 'The deliveries could not be read.' };
  return {
    ok: true,
    deliveries: rows.data.map((r) => ({
      id: r.id,
      type: r.type,
      reference: r.reference,
      status: r.status,
      state: r.state,
      attempts: r.attempts,
      lastStatusCode: r.last_status_code,
      lastError: r.last_error,
      createdAt: r.created_at,
      deliveredAt: r.delivered_at,
      nextAttemptAt: r.next_attempt_at,
    })),
  };
}
