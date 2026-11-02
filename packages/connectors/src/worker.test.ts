import { describe, expect, it, vi } from 'vitest';

import type { ConnectorJob, ConnectorRepository } from './contracts.ts';
import { MockSupplierAdapter } from './mock-supplier.ts';
import { ConnectorRegistry } from './registry.ts';
import { processConnectorBatch } from './worker.ts';

const job: ConnectorJob = {
  outbox_id: '98bade74-6c47-4a5e-a7f5-1a973dfe37bb',
  connection_id: 'bf7f97d7-cffa-4b13-bcac-a21330a56538',
  adapter_id: 'mock-supplier',
  operation: 'runtime.echo',
  payload: { reference: 'sample-1' },
  idempotency_key: 'runtime-test-key-0001',
  attempts: 1,
  lease_token: '506cdca9-4c12-4f20-bfa5-e70fdc6a1130',
  manifest: {
    family: 'supplier',
    version: '1.0.0',
    simulation_only: true,
    capabilities: { 'runtime.echo': { supported: true } },
  },
};

function repositoryFor(claimed: ConnectorJob[]) {
  const finish = vi.fn(
    async (_input: Parameters<ConnectorRepository['finish']>[0]) => 'delivered' as const,
  );
  const repository: ConnectorRepository = {
    claim: vi.fn(async () => claimed),
    finish: vi.fn(async (input) => {
      return finish(input);
    }),
  };
  return { repository, finish };
}

describe('processConnectorBatch', () => {
  it('claims and processes a sandbox mock operation without making a real provider call', async () => {
    const { repository, finish } = repositoryFor([job]);
    const registry = new ConnectorRegistry([new MockSupplierAdapter()]);

    const result = await processConnectorBatch(repository, registry, {
      batchSize: 10,
      leaseSeconds: 30,
      maxAttempts: 3,
      baseDelaySeconds: 5,
    });

    expect(result).toMatchObject({
      claimed: 1,
      finished: 1,
      states: [{ outboxId: job.outbox_id, state: 'delivered' }],
    });
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        job,
        succeeded: true,
        result: {
          simulated: true,
          operation: 'runtime.echo',
          received_keys: ['reference'],
        },
      }),
    );
  });

  it('dead-letters work when the worker does not have the adapter', async () => {
    const { repository, finish } = repositoryFor([job]);

    await processConnectorBatch(repository, new ConnectorRegistry([]), {
      batchSize: 10,
      leaseSeconds: 30,
      maxAttempts: 3,
      baseDelaySeconds: 5,
    });

    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        succeeded: false,
        errorCode: 'unknown_adapter',
        retryable: false,
      }),
    );
  });

  it('does not execute a capability that the connection manifest did not declare', async () => {
    const adapter = new MockSupplierAdapter();
    const execute = vi.spyOn(adapter, 'execute');
    const { repository, finish } = repositoryFor([{ ...job, operation: 'booking.create' }]);

    await processConnectorBatch(repository, new ConnectorRegistry([adapter]), {
      batchSize: 10,
      leaseSeconds: 30,
      maxAttempts: 3,
      baseDelaySeconds: 5,
    });

    expect(execute).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        succeeded: false,
        errorCode: 'unsupported_capability',
      }),
    );
  });
});
