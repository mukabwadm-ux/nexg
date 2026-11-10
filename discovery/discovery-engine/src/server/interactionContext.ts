import type { FastifyRequest } from 'fastify';
import type { ReadBudget } from '../orchestrator/readBudget.js';

/** Existing platform authentication adapter, never an engine identity issuer.
 * Resolve existing request credentials inside NexG and return an opaque verified
 * authorization-context reference, not a token/email/raw account record.
 * Catalog providers and telemetry never receive those credentials.
 */
export interface InteractionContextResolver { resolve(request: FastifyRequest, signal: AbortSignal): Promise<string | undefined> }

export async function resolveInteractionContext(resolver: InteractionContextResolver | undefined, request: FastifyRequest, budget: ReadBudget): Promise<string | undefined> {
  if (!resolver) return;
  const controller = new AbortController(); const signal = AbortSignal.any([budget.signal, controller.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Context deadline')); }, 200); });
    const context = await budget.waitFor(Promise.race([Promise.resolve().then(() => resolver.resolve(request, signal)), timeout]));
    return typeof context === 'string' && /^[A-Za-z0-9_:/.-]{1,128}$/.test(context) ? context : undefined;
  } catch { budget.assertOpen(); return; }
  finally { clearTimeout(timer); controller.abort(); }
}
