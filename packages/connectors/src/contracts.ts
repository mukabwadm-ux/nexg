import { z } from 'zod';

export const ConnectorManifestSchema = z
  .object({
    family: z.enum(['supplier', 'payments']),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    capabilities: z.record(z.string(), z.object({ supported: z.boolean() }).passthrough()),
    simulation_only: z.boolean().optional(),
  })
  .passthrough();

export type ConnectorManifest = z.infer<typeof ConnectorManifestSchema>;

export const ConnectorJobSchema = z
  .object({
    outbox_id: z.string().uuid(),
    connection_id: z.string().uuid(),
    adapter_id: z.string().min(2).max(63),
    operation: z.string().min(2).max(96),
    payload: z.record(z.string(), z.unknown()),
    idempotency_key: z.string().min(16).max(128),
    attempts: z.number().int().positive(),
    lease_token: z.string().uuid(),
    manifest: ConnectorManifestSchema,
  })
  .strict();

export type ConnectorJob = z.infer<typeof ConnectorJobSchema>;

export const ConnectorExecutionResultSchema = z.record(z.string(), z.unknown());
export type ConnectorExecutionResult = z.infer<typeof ConnectorExecutionResultSchema>;

export const ConnectorJobStateSchema = z.enum(['queued', 'leased', 'retry', 'delivered', 'dead']);
export type ConnectorJobState = z.infer<typeof ConnectorJobStateSchema>;

export type ConnectorExecution =
  | { ok: true; result: ConnectorExecutionResult }
  | {
      ok: false;
      errorCode: string;
      retryable: boolean;
      result: ConnectorExecutionResult;
    };

export interface ConnectorAdapter {
  readonly id: string;
  readonly family: ConnectorManifest['family'];
  execute(job: ConnectorJob): Promise<ConnectorExecution>;
}

export interface ConnectorRepository {
  claim(limit: number, leaseSeconds: number): Promise<ConnectorJob[]>;
  finish(input: {
    job: ConnectorJob;
    succeeded: boolean;
    result: ConnectorExecutionResult;
    errorCode: string | null;
    retryable: boolean;
    maxAttempts: number;
    baseDelaySeconds: number;
    elapsedMs: number;
  }): Promise<ConnectorJobState>;
}

export interface ConnectorWorkerOptions {
  batchSize: number;
  leaseSeconds: number;
  maxAttempts: number;
  baseDelaySeconds: number;
}
