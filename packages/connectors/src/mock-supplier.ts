import type { ConnectorAdapter, ConnectorExecution } from './contracts.ts';

export class MockSupplierAdapter implements ConnectorAdapter {
  readonly id = 'mock-supplier';
  readonly family = 'supplier' as const;

  async execute(job: Parameters<ConnectorAdapter['execute']>[0]): Promise<ConnectorExecution> {
    if (!job.manifest.simulation_only) {
      return {
        ok: false,
        errorCode: 'mock_adapter_requires_simulation_manifest',
        retryable: false,
        result: {},
      };
    }

    if (job.operation !== 'runtime.echo') {
      return {
        ok: false,
        errorCode: 'unsupported_capability',
        retryable: false,
        result: {},
      };
    }

    return {
      ok: true,
      result: {
        simulated: true,
        operation: job.operation,
        received_keys: Object.keys(job.payload).sort(),
      },
    };
  }
}
