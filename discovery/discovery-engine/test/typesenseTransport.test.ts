import test from 'node:test';
import assert from 'node:assert/strict';
import { TypesenseTransport } from '../src/adapters/typesense/transport.js';
import { TypesenseIndexAdapter } from '../src/adapters/typesense/indexAdapter.js';
import { IndexingError } from '../src/indexing/contracts.js';

const key = 'c'.repeat(64); const collection = `nexg_discovery_g_${'d'.repeat(32)}`;
const isCode = (code: string) => (error: unknown) => error instanceof IndexingError && error.code === code;

test('search key stays in a header, and namespace/path/origin validation prevents arbitrary administration', async () => {
  let observed = '';
  const transport = new TypesenseTransport({ origin: 'http://index.test', apiKey: key, fetcher: async (url, init) => {
    observed = String(url); assert.equal((init?.headers as Record<string, string>)['X-TYPESENSE-API-KEY'], key);
    assert.equal(init?.redirect, 'manual'); assert.equal(init?.credentials, 'omit'); return new Response('{"ok":true}');
  } });
  assert.equal(await transport.request('GET', '/health', AbortSignal.timeout(1000)), '{"ok":true}'); assert.equal(observed, 'http://index.test/health');
  for (const path of ['/keys', '//external.test/health', '/collections/foreign', '/collections/nexg_discovery_g_bad'])
    await assert.rejects(transport.request('DELETE', path, AbortSignal.timeout(1000)), isCode('INVALID_SEARCH_PATH'));
  assert.throws(() => new TypesenseTransport({ origin: 'http://user:password@index.test', apiKey: key }), isCode('INVALID_SEARCH_ORIGIN'));
  assert.throws(() => new TypesenseTransport({ origin: 'http://index.test', apiKey: key, namespace: 'bad/filter' }), isCode('INVALID_SEARCH_NAMESPACE'));
});

test('redirect and network/write failures expose safe typed outcomes without retries', async () => {
  let calls = 0;
  const redirect = new TypesenseTransport({ origin: 'http://index.test', apiKey: key, fetcher: async () => { calls++; return new Response('private secret', { status: 302, headers: { location: 'http://other.test' } }); } });
  await assert.rejects(redirect.request('GET', '/health', AbortSignal.timeout(1000)), isCode('SEARCH_REQUEST_REJECTED')); assert.equal(calls, 1);
  const dead = new TypesenseTransport({ origin: 'http://index.test', apiKey: key, fetcher: async () => { throw new Error(key); } });
  await assert.rejects(dead.request('POST', '/collections', AbortSignal.timeout(1000), { body: {} }), error => {
    assert.equal((error as IndexingError).code, 'INDEX_WRITE_OUTCOME_UNKNOWN'); assert.equal(String(error).includes(key), false); return true;
  });
});

test('stream limits cancel oversized bodies and an expired read signal cancels stalled bodies', async () => {
  let canceled = false;
  const stream = () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('oversize')); }, cancel() { canceled = true; } });
  const transport = new TypesenseTransport({ origin: 'http://index.test', apiKey: key, fetcher: async () => new Response(stream()) });
  await assert.rejects(transport.request('GET', '/health', AbortSignal.timeout(1000), { maxBytes: 3 }), isCode('SEARCH_RESPONSE_TOO_LARGE')); assert.equal(canceled, true);
  canceled = false;
  // A referenced timer keeps this isolated control alive until AbortSignal fires.
  const keepAlive = setTimeout(() => {}, 100);
  try { await assert.rejects(transport.request('GET', '/health', AbortSignal.timeout(20)), isCode('SEARCH_UNAVAILABLE')); assert.equal(canceled, true); }
  finally { clearTimeout(keepAlive); }
});

test('ambiguous alias publication is reconciled before retry, and unreadable outcomes stay unknown', async () => {
  let alias: string | null = null; let puts = 0;
  const index = new TypesenseIndexAdapter({ origin: 'http://index.test', apiKey: key, fetcher: async (_url, init) => {
    if (init?.method === 'PUT') { puts++; alias = JSON.parse(String(init.body)).collection_name; throw new Error('response lost'); }
    return new Response(JSON.stringify({ collection_name: alias }));
  } });
  await index.pointAlias('serving', collection, AbortSignal.timeout(1000)); assert.equal(puts, 1); assert.equal(await index.readAlias('serving', AbortSignal.timeout(1000)), collection);
  const unknown = new TypesenseIndexAdapter({ origin: 'http://index.test', apiKey: key, fetcher: async () => { throw new Error('unreachable'); } });
  await assert.rejects(unknown.pointAlias('serving', collection, AbortSignal.timeout(1000)), isCode('ALIAS_PUBLICATION_UNKNOWN'));
});
