import type { FastifyInstance } from 'fastify';
import { parseSchema } from '../../contracts/validate.js';
import { ReadServiceError } from '../../contracts/readErrors.js';
import { queryObject, type RouteContext } from './context.js';

export function registerHealthRoutes(app: FastifyInstance, context: RouteContext): void {
  app.get('/api/discovery/release', async request => {
    queryObject(request.query, []);
    const release = context.service.release;
    return parseSchema('ReleaseContext', { contractVersion: '1', discoveryReleaseId: release.releaseId, versions: context.service.versions(),
      collections: release.collections.map(item => ({ id: item.id, categoryId: item.categoryId,
        ...('titleKey' in item ? { titleKey: item.titleKey } : { title: item.title }) })) });
  });
  app.get('/api/discovery/health', async request => {
    queryObject(request.query, []);
    return parseSchema('EngineHealth', await context.service.health(context.budgetFor(request)));
  });
  app.get('/api/discovery/capabilities', async request => {
    const query = queryObject(request.query, ['releaseId']);
    if (!query.releaseId) throw new ReadServiceError('INVALID_REQUEST', 400, false, 'correct_request', ['/releaseId']);
    return context.service.capabilities(query.releaseId, context.budgetFor(request));
  });
}
