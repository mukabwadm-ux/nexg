import type { ConnectorAdapter } from './contracts.ts';

export class ConnectorRegistryError extends Error {
  readonly code: 'duplicate_adapter' | 'unknown_adapter';

  constructor(message: string, code: 'duplicate_adapter' | 'unknown_adapter') {
    super(message);
    this.name = 'ConnectorRegistryError';
    this.code = code;
  }
}

export class ConnectorRegistry {
  private readonly adapters = new Map<string, ConnectorAdapter>();

  constructor(adapters: ConnectorAdapter[]) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.id)) {
        throw new ConnectorRegistryError(
          `Adapter "${adapter.id}" is registered more than once.`,
          'duplicate_adapter',
        );
      }
      this.adapters.set(adapter.id, adapter);
    }
  }

  get(id: string): ConnectorAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new ConnectorRegistryError(
        `Adapter "${id}" is not registered in this worker.`,
        'unknown_adapter',
      );
    }
    return adapter;
  }
}
