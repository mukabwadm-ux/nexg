import { createClient } from '@supabase/supabase-js';
import {
  ConnectorJobStateSchema,
  ConnectorJobSchema,
  type ConnectorJob,
  type ConnectorRepository,
  type ConnectorWorkerOptions,
} from '@nexg/connectors';

export class SupabaseConnectorRepository implements ConnectorRepository {
  private readonly client;

  constructor(
    supabaseUrl: string,
    serviceRoleKey: string,
    private readonly options: ConnectorWorkerOptions,
  ) {
    this.client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async claim(limit: number, leaseSeconds: number): Promise<ConnectorJob[]> {
    const { data, error } = await this.client.rpc('rpc_connector_outbox_claim', {
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    });

    if (error) {
      throw new Error(`Could not claim connector work: ${error.message}`);
    }
    if (!Array.isArray(data)) {
      throw new Error('Connector claim returned an invalid response.');
    }

    return data.map((row) => ConnectorJobSchema.parse(row));
  }

  async finish(input: Parameters<ConnectorRepository['finish']>[0]) {
    const { data, error } = await this.client.rpc('rpc_connector_outbox_finish', {
      p_outbox_id: input.job.outbox_id,
      p_lease_token: input.job.lease_token,
      p_succeeded: input.succeeded,
      p_result: input.result,
      p_error_code: input.errorCode,
      p_retryable: input.retryable,
      p_max_attempts: this.options.maxAttempts,
      p_base_delay_seconds: this.options.baseDelaySeconds,
      p_elapsed_ms: input.elapsedMs,
    });

    if (error) {
      throw new Error(`Could not finish connector work: ${error.message}`);
    }

    return ConnectorJobStateSchema.parse(data);
  }
}
