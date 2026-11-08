import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { SafeTelemetry, routeName } from '../src/observability/telemetry.js';
import { OtlpHttpExporter } from '../src/observability/otlp.js';
import { buildReadOnlyServer } from '../src/server/buildServer.js';
import { PlatformDiscoveryProvider } from '../src/adapters/platform/serverDiscoveryProvider.js';
import { controlFetch, merchantRequest } from './readControls.js';
import { release } from './helpers.js';

test('actual local OTLP receiver gets standard hex IDs/nanosecond times and fixed safe spans without private data', async t => {
  const received: { path: string; headers: Record<string, unknown>; body: any }[] = [];
  const collector = createServer((request, response) => {
    const chunks: Buffer[] = []; request.on('data', chunk => chunks.push(chunk)); request.on('end', () => {
      received.push({ path: request.url!, headers: request.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      response.writeHead(200, { 'content-type': 'application/json' }); response.end('{}');
    });
  });
  await new Promise<void>(resolve => collector.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => collector.close(() => resolve())));
  const address = collector.address(); assert.ok(address && typeof address === 'object');
  const telemetry = new SafeTelemetry(new OtlpHttpExporter(`http://127.0.0.1:${address.port}`));
  const server = await buildReadOnlyServer({ config: { host: '127.0.0.1', port: 5190 }, release, telemetry,
    provider: new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: controlFetch() }) });
  t.after(() => server.app.close());
  const request = merchantRequest(); request.query = 'protocol';
  const response = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: request,
    headers: { cookie: 'private=COOKIE_SECRET', authorization: 'Bearer AUTH_SECRET', traceparent: '00-11111111111111111111111111111111-2222222222222222-01', baggage: 'diagnosis=PRIVATE_SECRET' } });
  assert.equal(response.statusCode, 200); assert.match(String(response.headers['x-discovery-trace-id']), /^[a-f0-9]{32}$/);
  await telemetry.flush();
  const spans = received.flatMap(item => item.body.resourceSpans[0].scopeSpans[0].spans);
  assert.deepEqual(spans.map(span => span.name).sort(), ['discovery.results', 'query.understand', 'ranking', 'retrieval', 'source.read']);
  for (const span of spans) {
    assert.match(span.traceId, /^[a-f0-9]{32}$/); assert.match(span.spanId, /^[a-f0-9]{16}$/);
    assert.match(span.startTimeUnixNano, /^\d{19}$/); assert.ok(BigInt(span.endTimeUnixNano) >= BigInt(span.startTimeUnixNano));
    assert.equal(typeof span.kind, 'number'); assert.equal(span.status.code, 1);
    assert.notEqual(span.traceId, '11111111111111111111111111111111');
  }
  const serialized = JSON.stringify(received);
  for (const secret of ['COOKIE_SECRET', 'AUTH_SECRET', 'PRIVATE_SECRET', 'protocol-control', 'catalog.test', 'beauty-wellness', '11111111111111111111111111111111']) assert.equal(serialized.includes(secret), false, secret);
  assert.equal(received[0]!.path, '/v1/traces');
  const metrics = telemetry.snapshot(); assert.equal(metrics.routes.results?.count, 1); assert.equal(metrics.routes.results?.sourceCalls, 1);
  assert.equal(metrics.routes.results?.underfilled, 1); assert.equal(metrics.export.exported, 5);
  assert.equal(metrics.routes.results?.results, 1); assert.equal(metrics.routes.results?.candidates, 1);
});

test('partial success, malformed/oversized collector responses and export stalls never count as full success or block reads', async t => {
  const partial = new SafeTelemetry(new OtlpHttpExporter('http://127.0.0.1:4318', async () => new Response('{"partialSuccess":{"rejectedSpans":"1"}}', { headers: { 'content-type': 'application/json' } })));
  partial.start('areas').finish(200, 1); await partial.flush(); assert.deepEqual(partial.snapshot().export, { queued: 0, exported: 0, dropped: 1, failures: 0 });
  for (const body of ['invalid', 'x'.repeat(17000), '{"partialSuccess":{"rejectedSpans":"999"}}']) {
    const telemetry = new SafeTelemetry(new OtlpHttpExporter('http://127.0.0.1:4318', async () => new Response(body, { headers: { 'content-type': 'application/json' } })));
    telemetry.start('areas').finish(503, 1); await telemetry.flush();
    assert.deepEqual(telemetry.snapshot().export, { queued: 0, exported: 0, dropped: 1, failures: 1 }); await telemetry.close();
  }
  const stalled = new SafeTelemetry({ async export() { return new Promise<never>(() => {}); } });
  const server = await buildReadOnlyServer({ config: { host: '127.0.0.1', port: 5190 }, release, telemetry: stalled,
    provider: new PlatformDiscoveryProvider({ origin: 'http://catalog.test', fetcher: controlFetch() }) });
  t.after(() => server.app.close());
  const result = await server.app.inject({ method: 'POST', url: '/api/discovery/results', payload: merchantRequest() });
  assert.equal(result.statusCode, 200); assert.equal(result.json().refs[0].id, 'protocol-control');
  await stalled.flush(); assert.equal(stalled.snapshot().export.exported, 0); assert.equal(stalled.snapshot().export.dropped, 5);
});

test('trace queues/attribute series are bounded and disabled tracing keeps aggregate diagnostics available', async () => {
  let complete!: (value: number) => void;
  const telemetry = new SafeTelemetry({ async export() { return new Promise<number>(resolve => { complete = resolve; }); } });
  telemetry.start('areas').finish(200, 0);
  for (let index = 0; index < 400; index++) telemetry.start(routeName(`/arbitrary/private-${index}?secret=1`)).finish(404, 0);
  assert.equal(telemetry.snapshot().export.queued, 256); assert.equal(telemetry.snapshot().export.dropped, 144);
  const invisible = telemetry.start('results', false); invisible.finish(422, 0);
  assert.equal(telemetry.snapshot().routes.results?.errors, 1); assert.deepEqual(Object.keys(telemetry.snapshot().routes).sort(), ['areas', 'other', 'results']);
  complete(1); await telemetry.close(); assert.equal(telemetry.snapshot().export.queued, 0);
});
