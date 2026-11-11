import test from 'node:test';
import assert from 'node:assert/strict';
import { ResearchTypesense } from '../src/evaluation/researchTypesense.js';

test('research adapter preserves public IDs, overfetches before self exclusion, and only cleans up its own isolated generation', async () => {
  const original = globalThis.fetch; let generation = ''; const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); paths.push(`${init?.method}:${url.pathname}`);
    const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/collections') { generation = JSON.parse(String(init?.body)).name; return response({ name: generation }); }
    if (url.pathname.endsWith('/documents/import')) return new Response('{"success":true}\n{"success":true}', { headers: { 'content-type': 'text/plain' } });
    if (url.pathname.endsWith('/documents/search')) { assert.equal(url.searchParams.get('per_page'), '101'); return response({ hits: [{ document: { id: 'query-self' } }, { document: { id: 'public-original' } }] }); }
    return response({ name: generation, num_documents: 2 });
  };
  try {
    const index = new ResearchTypesense('http://127.0.0.1:8108', 'a'.repeat(32));
    await index.prepare([{ id: 'query-self', title: '', text: 'alpha' }, { id: 'public-original', title: 'Beta', text: 'alpha beta' }]);
    assert.deepEqual(await index.search('alpha', 'query-self'), ['public-original']); await index.close();
    assert.match(generation, /^nexg_eval_g_[a-f0-9]{32}$/); assert.equal(paths.at(-1), `DELETE:/collections/${generation}`);
    assert.equal(paths.some(path => path.includes('/aliases/')), false);
  } finally { globalThis.fetch = original; }
});

test('a row-level failed research import cannot become a successful searchable corpus', async () => {
  const original = globalThis.fetch; let generation = '';
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/collections') { generation = JSON.parse(String(init?.body)).name; return new Response(JSON.stringify({ name: generation })); }
    if (url.pathname.endsWith('/documents/import')) return new Response('{"success":false,"error":"PRIVATE_RAW_ERROR"}');
    return new Response(JSON.stringify({ name: generation, num_documents: 0 }));
  };
  try {
    const index = new ResearchTypesense('http://127.0.0.1:8108', 'a'.repeat(32));
    await assert.rejects(index.prepare([{ id: 'public-original', title: '', text: 'alpha' }]), error => error instanceof Error && error.message === 'RESEARCH_PARTIAL_IMPORT');
    await assert.rejects(index.search('alpha', 'query'), error => error instanceof Error && error.message === 'RESEARCH_NOT_READY');
    await index.close();
  } finally { globalThis.fetch = original; }
});
