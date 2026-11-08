import { validateSourceOrigin } from '../adapters/platform/httpTransport.js';

export interface ReadServerConfig {
  host: '127.0.0.1'; port: number; sourceOrigin?: string;
  search?: { origin: string; apiKey: string; namespace: string };
  operationsEnabled?: true;
  otlpOrigin?: string;
}

/** Read only named settings; no ambient credential/configuration forwarding. */
export function readServerConfig(environment: Readonly<Record<string, string | undefined>> = process.env): ReadServerConfig {
  const port = environment.DISCOVERY_ENGINE_PORT ?? '5190';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid DISCOVERY_ENGINE_PORT');
  const source = environment.DISCOVERY_SOURCE_API_ORIGIN;
  const enabled = environment.DISCOVERY_SEARCH_ENABLED;
  if (environment.DISCOVERY_OPERATOR_ENABLED !== undefined && !['0', '1'].includes(environment.DISCOVERY_OPERATOR_ENABLED)) throw new Error('Invalid DISCOVERY_OPERATOR_ENABLED');
  if (enabled !== undefined && !['0', '1'].includes(enabled)) throw new Error('Invalid DISCOVERY_SEARCH_ENABLED');
  let search: ReadServerConfig['search'];
  if (enabled === '1') {
    const origin = environment.DISCOVERY_SEARCH_ORIGIN ?? 'http://127.0.0.1:8108';
    const apiKey = environment.DISCOVERY_SEARCH_API_KEY;
    const namespace = environment.DISCOVERY_SEARCH_NAMESPACE ?? 'nexg_discovery';
    if (!apiKey || apiKey.length < 16 || apiKey.length > 256 || /[\s\u0000-\u001f]/u.test(apiKey)
      || !/^[a-z][a-z0-9_]{2,40}$/.test(namespace)) throw new Error('Invalid search configuration');
    search = { origin: validateSourceOrigin(origin).origin, apiKey, namespace };
  }
  return { host: '127.0.0.1', port: Number(port), ...(source ? { sourceOrigin: validateSourceOrigin(source).origin } : {}), ...(search ? { search } : {}),
    ...(environment.DISCOVERY_OPERATOR_ENABLED === '1' ? { operationsEnabled: true } : {}),
    ...(environment.DISCOVERY_OTLP_ORIGIN ? { otlpOrigin: environment.DISCOVERY_OTLP_ORIGIN } : {}) };
}
