import type { FastifyInstance } from 'fastify';
import { ReadServiceError } from '../../contracts/readErrors.js';
import { queryObject, type RouteContext } from './context.js';

export function registerCollectionRoutes(app: FastifyInstance, context: RouteContext): void {
  app.post('/api/discovery/collections', async request => {
    queryObject(request.query, []);
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new ReadServiceError('INVALID_REQUEST', 400, false, 'correct_request', ['/']);
    const page = await context.service.collections(request.body, context.budgetFor(request), context.callerFor(request));
    const sections = await Promise.all(page.sections.map(async section => ({ ...section, page: await context.deliver(section.page, request) })));
    return { ...page, sections };
  });
}
