import type { FastifyRequest } from 'fastify';
import { ReadServiceError } from '../../contracts/readErrors.js';
import type { DiscoveryReadService } from '../../orchestrator/readService.js';
import type { ReadBudget } from '../../orchestrator/readBudget.js';
import type { Schemas } from '../../contracts/index.js';

export interface RouteContext {
  service: DiscoveryReadService; budgetFor(request: FastifyRequest): ReadBudget; callerFor(request: FastifyRequest): string;
  deliver(page: Schemas['EnginePage'], request: FastifyRequest): Promise<Schemas['EnginePage']>;
  ingest(value: unknown, request: FastifyRequest): Promise<Schemas['EventReceipt']>;
}
export function queryObject(value: unknown, allowed: readonly string[]): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReadServiceError('INVALID_REQUEST', 400, false, 'correct_request', ['/query']);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.includes(key) || typeof item !== 'string' || !item || item.length > 256) throw new ReadServiceError('INVALID_REQUEST', 400, false, 'correct_request', ['/query']);
    result[key] = item;
  }
  return result;
}
