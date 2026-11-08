import type { FastifyInstance } from 'fastify';
import { parseSchema } from '../../contracts/validate.js';
import { ReadServiceError } from '../../contracts/readErrors.js';
import { queryObject, type RouteContext } from './context.js';

export function registerCatalogRoutes(app: FastifyInstance, context: RouteContext): void {
  app.get('/api/discovery/areas', async request => {
    queryObject(request.query, []);
    return parseSchema('Areas', await context.service.getAreas(context.budgetFor(request)));
  });
  app.get<{ Params: { id: string } }>('/api/discovery/merchants/:id', async request => {
    queryObject(request.query, []);
    return parseSchema('PublicMerchant', await context.service.getMerchant(request.params.id, context.budgetFor(request)));
  });
  app.post('/api/discovery/results', async request => {
    queryObject(request.query, []);
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new ReadServiceError('INVALID_REQUEST', 400, false, 'correct_request', ['/']);
    const page = await context.service.results(request.body, context.budgetFor(request), context.callerFor(request));
    return context.deliver(page, request);
  });
}
