'use server';

import { z } from 'zod';

import { createClient } from '@/lib/session';
import {
  listWebhookDeliveries,
  listWebhookEndpoints,
  rpcCaller,
  type DeliveryList,
  type WebhookEndpoint,
} from '@/lib/webhooks';

/**
 * Webhook endpoints, from the developer console.
 *
 * Every rule is in the database functions these call, which check the
 * signed-in session and that the person owns the merchant. These actions
 * only shape the request and the answer. A mutation answers with the
 * refreshed list, so the page does not need to reload.
 */

const Id = z.string().uuid();

const CreateSchema = z.object({
  merchant_id: z.string().uuid({ message: 'Choose the merchant these events are for.' }),
  url: z.string().trim().min(1, 'Enter the address NexG should send events to.').max(300),
  environment: z.enum(['live', 'test']),
  description: z.string().trim().max(120).optional(),
});

export type WebhookResult =
  | { ok: true; endpoints: WebhookEndpoint[]; message?: string }
  | { ok: false; message: string };

export type CreatedEndpoint =
  | { ok: true; endpoints: WebhookEndpoint[]; secret: string; secretPrefix: string }
  | { ok: false; message: string };

async function refreshed(message?: string): Promise<WebhookResult> {
  const list = await listWebhookEndpoints(rpcCaller(createClient()));
  if (!list.ok) return { ok: false, message: list.message };
  return { ok: true, endpoints: list.endpoints, message };
}

export async function createWebhookEndpoint(formData: FormData): Promise<CreatedEndpoint> {
  const parsed = CreateSchema.safeParse({
    merchant_id: formData.get('merchant_id') || '',
    url: formData.get('url') || '',
    environment: formData.get('environment') || 'live',
    description: (formData.get('description') as string | null) || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'That endpoint is not in a shape we understand.',
    };
  }

  const db = rpcCaller(createClient());
  const { data, error } = await db.rpc('rpc_api_webhook_endpoint_create', {
    p_merchant_id: parsed.data.merchant_id,
    p_url: parsed.data.url,
    p_environment: parsed.data.environment,
    p_description: parsed.data.description ?? null,
  });
  if (error) return { ok: false, message: error.message };

  const created = z
    .object({ secret: z.string().startsWith('whsec_'), secret_prefix: z.string() })
    .safeParse(data);
  if (!created.success) return { ok: false, message: 'The endpoint could not be added.' };

  const list = await listWebhookEndpoints(db);
  return {
    ok: true,
    endpoints: list.ok ? list.endpoints : [],
    secret: created.data.secret,
    secretPrefix: created.data.secret_prefix,
  };
}

export async function sendWebhookTest(endpointId: string): Promise<WebhookResult> {
  if (!Id.safeParse(endpointId).success) return { ok: false, message: 'No such endpoint.' };
  const { error } = await rpcCaller(createClient()).rpc('rpc_api_webhook_ping', {
    p_id: endpointId,
  });
  if (error) return { ok: false, message: error.message };
  return refreshed('A test event is on its way. It usually arrives within a minute.');
}

export async function setWebhookEndpointEnabled(
  endpointId: string,
  enabled: boolean,
): Promise<WebhookResult> {
  if (!Id.safeParse(endpointId).success) return { ok: false, message: 'No such endpoint.' };
  const { error } = await rpcCaller(createClient()).rpc('rpc_api_webhook_endpoint_set_enabled', {
    p_id: endpointId,
    p_enabled: enabled,
  });
  if (error) return { ok: false, message: error.message };
  return refreshed(enabled ? 'Switched on.' : 'Switched off. Waiting events were dropped.');
}

export async function deleteWebhookEndpoint(endpointId: string): Promise<WebhookResult> {
  if (!Id.safeParse(endpointId).success) return { ok: false, message: 'No such endpoint.' };
  const { error } = await rpcCaller(createClient()).rpc('rpc_api_webhook_endpoint_delete', {
    p_id: endpointId,
  });
  if (error) return { ok: false, message: error.message };
  return refreshed('Removed.');
}

export async function readWebhookDeliveries(endpointId: string): Promise<DeliveryList> {
  if (!Id.safeParse(endpointId).success) return { ok: false, message: 'No such endpoint.' };
  return listWebhookDeliveries(rpcCaller(createClient()), endpointId);
}
