import { createNativeDispatcher } from './handler.ts';
import type { Delivery } from './payload.ts';
import { createNativeSender } from './providers.ts';

const read = (key: string) => Deno.env.get(key);
const url = read('SUPABASE_URL')?.replace(/\/+$/, '');
const credential = read('SUPABASE_SERVICE_ROLE_KEY');
const send = createNativeSender({
  read,
  fetch: (endpoint, request) => fetch(endpoint, request),
  now: Date.now,
});

async function rpc(
  name: 'fn_native_push_claim' | 'fn_native_push_finish',
  args: Record<string, unknown>,
) {
  if (!url || !credential) throw new Error('Native queue is not configured');
  const response = await fetch(url + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      apikey: credential,
      authorization: 'Bearer ' + credential,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Native queue request failed');
  return response.json();
}

Deno.serve(
  createNativeDispatcher({
    secret: read('D8_DISPATCH_SECRET') ?? '',
    enabled: read('D8_DELIVERY_ENABLED') === 'true',
    send,
    queue: {
      async claim(limit) {
        const result = await rpc('fn_native_push_claim', { p_limit: limit });
        if (!Array.isArray(result)) throw new Error('Native queue returned an invalid claim');
        return result as Delivery[];
      },
      async finish(delivery, outcome) {
        return (
          (await rpc('fn_native_push_finish', {
            p_id: delivery.id,
            p_lease: delivery.lease,
            p_result: outcome,
          })) === true
        );
      },
    },
  }),
);
