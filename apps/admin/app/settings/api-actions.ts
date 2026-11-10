'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/*
 * Settings → API. Every rule (who may change a connection, that live
 * connections are public https, that a credential goes into Vault and never
 * comes back out, that tests are spaced and audited) is enforced by the
 * RPCs in supabase/migrations/20261201000100_api_connections.sql. These
 * add a readable sentence and the path to refresh.
 */

export interface ApiOutcome {
  ok: boolean;
  message?: string;
  id?: string;
}

export interface ApiTestOutcome {
  done: boolean;
  ok?: boolean;
  status_code?: number | null;
  latency_ms?: number | null;
  detail?: string | null;
  url?: string;
  message?: string;
}

/* Not in the generated types until they are regenerated with these RPCs. */
async function call(fn: string, args: Record<string, unknown>) {
  const client = createClient();
  return (await (
    client.rpc as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  )(fn, args)) as {
    data: unknown;
    error: { message: string } | null;
  };
}

const clean = (message: string) => message.replace(/^.*?:\s*(?=[A-Z])/, '');

function result(
  error: { message: string } | null,
  message: string,
  extra: Partial<ApiOutcome> = {},
) {
  if (error) return { ok: false, message: clean(error.message) };
  revalidatePath('/settings');
  return { ok: true, message, ...extra };
}

export interface ConnectionInput {
  id?: string;
  name: string;
  kind: string;
  environment: string;
  base_url: string;
  auth_type: string;
  auth_header: string;
  test_path: string;
  contact_name: string;
  contact_email: string;
  notes: string;
}

export async function saveApiConnection(input: ConnectionInput): Promise<ApiOutcome> {
  const { data, error } = await call('rpc_api_connection_save', { p: input });
  return result(error, 'Saved.', { id: (data as { id?: string } | null)?.id });
}

export async function setApiSecret(
  id: string,
  kind: 'credential' | 'webhook',
  value: string,
): Promise<ApiOutcome> {
  const { error } = await call('rpc_api_connection_set_secret', {
    p_id: id,
    p_kind: kind,
    p_value: value,
  });
  return result(error, 'Stored in Vault. It will not be shown again.');
}

export async function clearApiSecret(
  id: string,
  kind: 'credential' | 'webhook',
): Promise<ApiOutcome> {
  const { error } = await call('rpc_api_connection_clear_secret', { p_id: id, p_kind: kind });
  return result(error, 'Removed.');
}

export async function setApiEnabled(id: string, enabled: boolean): Promise<ApiOutcome> {
  const { error } = await call('rpc_api_connection_set_enabled', { p_id: id, p_enabled: enabled });
  return result(error, enabled ? 'Switched on.' : 'Switched off.');
}

export async function startApiTest(id: string): Promise<ApiOutcome> {
  const { data, error } = await call('rpc_api_connection_test', { p_id: id });
  if (error) return { ok: false, message: clean(error.message) };
  return { ok: true, id: data as string };
}

export async function readApiTest(testId: string): Promise<ApiTestOutcome> {
  const { data, error } = await call('rpc_api_connection_test_result', { p_test_id: testId });
  if (error) return { done: true, ok: false, message: clean(error.message) };
  const outcome = data as ApiTestOutcome;
  if (outcome.done) revalidatePath('/settings');
  return outcome;
}
