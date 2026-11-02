import { describe, expect, it } from 'vitest';

import { readWorkerConfig } from './config.ts';

const validEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  CONNECTOR_WORKER_BATCH_SIZE: '10',
  CONNECTOR_WORKER_LEASE_SECONDS: '60',
  CONNECTOR_WORKER_MAX_ATTEMPTS: '5',
  CONNECTOR_WORKER_BASE_DELAY_SECONDS: '30',
  CONNECTOR_WORKER_POLL_INTERVAL_MS: '1000',
};

describe('readWorkerConfig', () => {
  it('reads complete worker configuration', () => {
    expect(readWorkerConfig(validEnvironment)).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      serviceRoleKey: 'test-service-role-key',
      batchSize: 10,
      leaseSeconds: 60,
      maxAttempts: 5,
      baseDelaySeconds: 30,
      pollIntervalMs: 1000,
    });
  });

  it('rejects a non-HTTP Supabase URL', () => {
    expect(() =>
      readWorkerConfig({
        ...validEnvironment,
        NEXT_PUBLIC_SUPABASE_URL: 'file:///tmp/supabase',
      }),
    ).toThrow('must use HTTP or HTTPS');
  });

  it('rejects missing retry settings instead of choosing defaults', () => {
    expect(() =>
      readWorkerConfig({ ...validEnvironment, CONNECTOR_WORKER_MAX_ATTEMPTS: '' }),
    ).toThrow('CONNECTOR_WORKER_MAX_ATTEMPTS must be set');
  });
});
