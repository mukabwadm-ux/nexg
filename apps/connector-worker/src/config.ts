export interface WorkerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  batchSize: number;
  leaseSeconds: number;
  maxAttempts: number;
  baseDelaySeconds: number;
  pollIntervalMs: number;
}

function requiredInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  min: number,
  max: number,
): number {
  const raw = environment[name];
  if (!raw || !/^\d+$/.test(raw)) {
    throw new Error(`${name} must be set to an integer.`);
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }

  return value;
}

export function readWorkerConfig(environment: NodeJS.ProcessEnv): WorkerConfig {
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !URL.canParse(supabaseUrl)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL.');
  }
  const parsedSupabaseUrl = new URL(supabaseUrl);
  if (!['http:', 'https:'].includes(parsedSupabaseUrl.protocol)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must use HTTP or HTTPS.');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must be configured for the worker.');
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    batchSize: requiredInteger(environment, 'CONNECTOR_WORKER_BATCH_SIZE', 1, 100),
    leaseSeconds: requiredInteger(environment, 'CONNECTOR_WORKER_LEASE_SECONDS', 1, 3600),
    maxAttempts: requiredInteger(environment, 'CONNECTOR_WORKER_MAX_ATTEMPTS', 1, 20),
    baseDelaySeconds: requiredInteger(environment, 'CONNECTOR_WORKER_BASE_DELAY_SECONDS', 1, 86400),
    pollIntervalMs: requiredInteger(environment, 'CONNECTOR_WORKER_POLL_INTERVAL_MS', 1, 86400000),
  };
}
