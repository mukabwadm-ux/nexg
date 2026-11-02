import {
  ConnectorExecutionResultSchema,
  type ConnectorAdapter,
  type ConnectorJob,
  type ConnectorRepository,
  type ConnectorWorkerOptions,
} from './contracts.ts';
import { ConnectorRegistryError } from './registry.ts';
import type { ConnectorRegistry } from './registry.ts';

export interface ConnectorBatchResult {
  claimed: number;
  finished: number;
  states: Array<{ outboxId: string; state: string }>;
}

export async function processConnectorBatch(
  repository: ConnectorRepository,
  registry: ConnectorRegistry,
  options: ConnectorWorkerOptions,
): Promise<ConnectorBatchResult> {
  const jobs = await repository.claim(options.batchSize, options.leaseSeconds);
  const states: ConnectorBatchResult['states'] = [];

  for (const job of jobs) {
    const startedAt = Date.now();
    const execution = await executeJob(registry, job);
    const result = ConnectorExecutionResultSchema.parse(execution.result);
    const state = await repository.finish({
      job,
      succeeded: execution.ok,
      result,
      errorCode: execution.ok ? null : execution.errorCode,
      retryable: execution.ok ? false : execution.retryable,
      maxAttempts: options.maxAttempts,
      baseDelaySeconds: options.baseDelaySeconds,
      elapsedMs: Math.max(0, Date.now() - startedAt),
    });

    states.push({ outboxId: job.outbox_id, state });
  }

  return { claimed: jobs.length, finished: states.length, states };
}

async function executeJob(
  registry: ConnectorRegistry,
  job: ConnectorJob,
): Promise<Awaited<ReturnType<ConnectorAdapter['execute']>>> {
  let adapter: ConnectorAdapter;
  try {
    adapter = registry.get(job.adapter_id);
  } catch (error) {
    if (error instanceof ConnectorRegistryError && error.code === 'unknown_adapter') {
      return {
        ok: false,
        errorCode: error.code,
        retryable: false,
        result: {},
      };
    }
    throw error;
  }

  if (adapter.family !== job.manifest.family) {
    return {
      ok: false,
      errorCode: 'adapter_family_mismatch',
      retryable: false,
      result: {},
    };
  }

  const capability = job.manifest.capabilities[job.operation];
  if (!capability?.supported) {
    return {
      ok: false,
      errorCode: 'unsupported_capability',
      retryable: false,
      result: {},
    };
  }

  return adapter.execute(job);
}
