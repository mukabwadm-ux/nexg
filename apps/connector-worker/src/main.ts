import { setTimeout as sleep } from 'node:timers/promises';
import { MockSupplierAdapter, ConnectorRegistry, processConnectorBatch } from '@nexg/connectors';

import { readWorkerConfig } from './config.ts';
import { SupabaseConnectorRepository } from './supabase-repository.ts';

async function main() {
  const config = readWorkerConfig(process.env);
  const options = {
    batchSize: config.batchSize,
    leaseSeconds: config.leaseSeconds,
    maxAttempts: config.maxAttempts,
    baseDelaySeconds: config.baseDelaySeconds,
  };
  const repository = new SupabaseConnectorRepository(
    config.supabaseUrl,
    config.serviceRoleKey,
    options,
  );
  const registry = new ConnectorRegistry([new MockSupplierAdapter()]);
  let stopping = false;

  process.once('SIGINT', () => {
    stopping = true;
  });
  process.once('SIGTERM', () => {
    stopping = true;
  });

  while (!stopping) {
    const result = await processConnectorBatch(repository, registry, options);
    if (result.claimed === 0) {
      await sleep(config.pollIntervalMs);
    }
  }
}

main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown worker error';
  console.error(
    JSON.stringify({
      event: 'connector_worker.failed',
      message: errorMessage
        .replaceAll(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '\u0000', '[redacted]')
        .replaceAll(process.env.DATABASE_URL ?? '\u0000', '[redacted]'),
    }),
  );
  process.exitCode = 1;
});
