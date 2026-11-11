import type { FastifyInstance } from 'fastify';
import { parseSchema } from '../../contracts/validate.js';
import { ReadServiceError } from '../../contracts/readErrors.js';
import { queryObject, type RouteContext } from './context.js';

export function registerEventRoutes(app: FastifyInstance, context: RouteContext): void {
  app.post('/api/discovery/events', async request => {
    queryObject(request.query, []);
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new ReadServiceError('INVALID_REQUEST', 400, false, 'correct_request', ['/']);
    const value = parseSchema('ClientEvents', request.body);
    return context.ingest(value, request);
  });
}
