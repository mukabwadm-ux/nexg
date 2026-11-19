import type { Delivery } from './payload.ts';
import type { Outcome } from './providers.ts';

type Queue = {
  claim: (limit: number) => Promise<Delivery[]>;
  finish: (delivery: Delivery, outcome: Outcome) => Promise<boolean>;
};

type Dependencies = {
  secret: string;
  enabled: boolean;
  queue: Queue;
  send: (delivery: Delivery) => Promise<Outcome>;
};

async function verified(presented: string, secret: string) {
  if (!secret || presented.length > 512) return false;
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [input, expected] = await Promise.all([digest(presented), digest(secret)]);
  let mismatch = 0;
  for (let index = 0; index < input.length; index += 1) mismatch |= input[index] ^ expected[index];
  return mismatch === 0;
}

export function createNativeDispatcher(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST')
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    if (!(await verified(request.headers.get('x-native-push-secret') ?? '', deps.secret))) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!deps.enabled) return Response.json({ error: 'delivery_disabled' }, { status: 503 });

    try {
      const deliveries = await deps.queue.claim(12);
      const outcomes = await Promise.allSettled(
        deliveries.map(async (delivery) => {
          const outcome = await deps.send(delivery).catch(() => 'retry' as const);
          const finished = await deps.queue.finish(delivery, outcome);
          return finished ? outcome : 'lease_lost';
        }),
      );
      const counts: Record<string, number> = {};
      for (const result of outcomes) {
        const key = result.status === 'fulfilled' ? result.value : 'settle_failed';
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return Response.json({ claimed: deliveries.length, outcomes: counts });
    } catch {
      return Response.json({ error: 'queue_unavailable' }, { status: 503 });
    }
  };
}
