import Fastify, { type FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ReadBudget } from '../orchestrator/readBudget.js';
import { DiscoveryReadService } from '../orchestrator/readService.js';
import type { ServerDiscoveryProvider } from '../providers/DiscoveryProvider.js';
import { PlatformDiscoveryProvider } from '../adapters/platform/serverDiscoveryProvider.js';
import { BaselineReleaseReader } from '../releases/baselineReleaseReader.js';
import { validateReleaseArtifact, type ReleaseArtifact } from '../releases/artifact.js';
import { parseSchema } from '../contracts/validate.js';
import { ReadServiceError, safeError } from '../contracts/readErrors.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerCollectionRoutes } from './routes/collections.js';
import type { ReadServerConfig } from './config.js';
import type { RetrievalCandidatePort } from '../../engines/search-retrieval/src/ports.js';
import type { QueryRules } from '../../engines/query-understanding/src/index.js';
import { TypesenseIndexAdapter } from '../adapters/typesense/indexAdapter.js';
import { TypesenseServingRetrieval } from '../adapters/typesense/servingRetrieval.js';
import { ResultSessions, type SessionLimits } from '../orchestrator/resultSessions.js';
import { AnonymousCallerScopes } from './callerScope.js';
import { join } from 'node:path';
import { RuntimeController } from '../operations/runtimeControl.js';
import { ControlFileStore } from '../operations/controlFileStore.js';
import { InteractionPipeline } from '../events/pipeline.js';
import type { EventConfiguration } from '../events/ports.js';
import { SafeTelemetry, routeName } from '../observability/telemetry.js';
import { OtlpHttpExporter } from '../observability/otlp.js';
import { registerEventRoutes } from './routes/events.js';
import { resolveInteractionContext, type InteractionContextResolver } from './interactionContext.js';

export interface ReadServerOptions {
  config: ReadServerConfig;
  provider?: ServerDiscoveryProvider;
  release?: Readonly<ReleaseArtifact>;
  workspaceRoot?: string;
  maxActiveRequests?: number;
  readTimeoutMs?: number;
  retrieval?: RetrievalCandidatePort;
  queryRules?: QueryRules;
  sessionLimits?: SessionLimits;
  events?: EventConfiguration;
  interactionContext?: InteractionContextResolver;
  telemetry?: SafeTelemetry;
  /** Test/composition seam only. HTTP callers cannot supply operator records. */
  controlStore?: ControlFileStore;
}

/** Composition root only. Modules receive interfaces and no listening socket. */
export async function buildReadOnlyServer(options: ReadServerOptions) {
  const release = options.release ? validateReleaseArtifact(options.release)
    : await new BaselineReleaseReader(options.workspaceRoot ?? fileURLToPath(new URL('../../../../', import.meta.url))).resolvePublishedRelease();
  const provider = options.provider ?? new PlatformDiscoveryProvider(options.config.sourceOrigin ? { origin: options.config.sourceOrigin } : {});
  const retrieval = options.retrieval ?? (options.config.search ? new TypesenseServingRetrieval(new TypesenseIndexAdapter(options.config.search), release) : undefined);
  const sessions = new ResultSessions(options.sessionLimits);
  const events = options.events ? new InteractionPipeline(options.events) : undefined;
  const root = options.workspaceRoot ?? fileURLToPath(new URL('../../../../', import.meta.url));
  const controlStore = options.controlStore ?? (options.config.operationsEnabled ? new ControlFileStore(join(root, 'discovery-engine/.runtime/operations')) : undefined);
  const initial = await controlStore?.read();
  const controls = new RuntimeController({ search: Boolean(retrieval), events: Boolean(events && options.interactionContext), quality: false }, initial);
  const telemetry = options.telemetry ?? new SafeTelemetry(options.config.otlpOrigin ? new OtlpHttpExporter(options.config.otlpOrigin) : undefined);
  const service = new DiscoveryReadService(release, provider, { sessions, controls, ...(retrieval ? { retrieval } : {}), ...(options.queryRules ? { queryRules: options.queryRules } : {}) });
  const callerScopes = new AnonymousCallerScopes();
  const callers = new WeakMap<FastifyRequest, string>();
  const maxActive = options.maxActiveRequests ?? 32;
  const timeout = options.readTimeoutMs ?? 1000;
  if (!Number.isSafeInteger(maxActive) || maxActive < 1 || maxActive > 32 || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 1000) throw new Error('Invalid service limits');
  const app = Fastify({ logger: false, genReqId: () => randomUUID(), requestIdHeader: false,
    bodyLimit: 65536, requestTimeout: 1000, connectionTimeout: 2000, keepAliveTimeout: 5000, maxRequestsPerSocket: 100,
    trustProxy: false, forceCloseConnections: 'idle', return503OnClosing: true,
    onProtoPoisoning: 'error', onConstructorPoisoning: 'error', routerOptions: { maxParamLength: 256 } });
  const scopes = new WeakMap<FastifyRequest, ReadBudget>();
  const requestCleanup = new WeakMap<FastifyRequest, () => void>();
  const cleanups = new Set<() => void>();
  const budgets = new Set<ReadBudget>();
  const unsubscribe = controls.onChange(() => {
    sessions.clear(); events?.revoke();
    for (const budget of budgets) budget.cancel(new ReadServiceError('CURSOR_RESTART_REQUIRED', 409, false, 'restart_preserving_constraints'));
  });
  let refresh: Promise<void> | undefined;
  const refreshOperatorControls = () => refresh ??= (async () => {
    if (!controlStore) return;
    try { controls.apply(await controlStore.read()); } catch { controls.trip(); }
  })().finally(() => { refresh = undefined; });
  const poll = controlStore ? setInterval(() => { void refreshOperatorControls(); }, 250) : undefined;
  poll?.unref();
  let active = 0; let completed = 0; let overloads = 0;
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    const route = routeName(request.url);
    const trace = telemetry.start(route, controls.snapshot.flags.tracing);
    reply.header('X-Discovery-Trace-Id', trace.traceId);
    if (['results', 'collections', 'events'].includes(route)) callers.set(request, callerScopes.resolve(request, reply));
    if (active >= maxActive) {
      overloads++;
      trace.finish(429, 0);
      const failure = safeError(new ReadServiceError('RATE_LIMITED', 429, true, 'wait', [], 1), request.id);
      return reply.code(failure.status).header('Retry-After', '1').send(parseSchema('EngineError', failure.body));
    }
    active++;
    const budget = new ReadBudget({ timeoutMs: timeout, trace }); scopes.set(request, budget); budgets.add(budget);
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return; cleaned = true; active--; completed++; trace.finish(request.raw.aborted ? 499 : reply.statusCode, budget.snapshot.calls); budgets.delete(budget); budget.dispose(); cleanups.delete(cleanup); scopes.delete(request); requestCleanup.delete(request);
      request.raw.removeListener('aborted', cleanup); reply.raw.removeListener('close', cleanup);
    };
    cleanups.add(cleanup); requestCleanup.set(request, cleanup); request.raw.once('aborted', cleanup); reply.raw.once('close', cleanup);
  });
  app.addHook('onResponse', async request => { requestCleanup.get(request)?.(); });
  const budgetFor = (request: FastifyRequest): ReadBudget => {
    const budget = scopes.get(request); if (!budget) throw new ReadServiceError('OWNER_UNAVAILABLE', 503, true, 'retry_read'); return budget;
  };
  app.setErrorHandler((error, request, reply) => {
    const failure = safeError(error, request.id);
    if (failure.retryAfter !== undefined) reply.header('Retry-After', String(failure.retryAfter));
    return reply.code(failure.status).send(parseSchema('EngineError', failure.body));
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send(parseSchema('EngineError', {
    contractVersion: '1', requestId: request.id, code: 'NOT_FOUND', retryable: false, recovery: 'none', fieldPaths: [],
  })));
  app.addHook('onClose', async () => { clearInterval(poll); await refresh; unsubscribe(); for (const cleanup of [...cleanups]) cleanup(); sessions.clear(); events?.revoke(); await telemetry.close(); });
  const callerFor = (request: FastifyRequest) => callers.get(request) ?? 'public-no-paging';
  const context = { service, budgetFor, callerFor,
    deliver: async (page: import('../contracts/index.js').Schemas['EnginePage'], request: FastifyRequest) => {
      if (!controls.snapshot.flags.events || !events || !page.refs.length) return page;
      const budget = budgetFor(request);
      const contextRef = await budget.memo('interaction-context', () => resolveInteractionContext(options.interactionContext, request, budget));
      return events.issue(page, callerFor(request), budget, contextRef);
    },
    ingest: async (value: unknown, request: FastifyRequest) => {
      if (!events || !controls.snapshot.flags.events || !controls.snapshot.flags.serving) throw new ReadServiceError('UNSUPPORTED_CAPABILITY', 422, false, 'correct_request', ['/events']);
      const budget = budgetFor(request);
      const contextRef = await budget.memo('interaction-context', () => resolveInteractionContext(options.interactionContext, request, budget));
      const ingest = () => events.ingest(value, callerFor(request), budget, () => controls.snapshot.flags.events && controls.snapshot.flags.serving, contextRef);
      return budget.trace ? budget.trace.run('events.ingest', ingest) : ingest();
    } };
  registerHealthRoutes(app, context);
  registerCatalogRoutes(app, context);
  registerCollectionRoutes(app, context);
  registerEventRoutes(app, context);
  return { app, release, stats: () => ({ active, completed, overloads }), sessionStats: () => sessions.stats(),
    controls, refreshOperatorControls, telemetryStats: () => telemetry.snapshot(), eventStats: () => events?.stats() };
}
