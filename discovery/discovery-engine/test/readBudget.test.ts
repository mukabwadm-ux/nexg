import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadBudget } from '../src/orchestrator/readBudget.js';
import { ReadServiceError } from '../src/contracts/readErrors.js';

const unavailable = (error: unknown) => error instanceof ReadServiceError && error.code === 'CATALOG_UNAVAILABLE';
const limit = (error: unknown) => error instanceof ReadServiceError && error.code === 'LIMIT_EXCEEDED';

test('one shared budget limits concurrency and all nested source calls', async () => {
  const budget = new ReadBudget(); let running = 0; let peak = 0;
  try {
    const values = await Promise.all(Array.from({ length: 16 }, (_, index) => budget.run(async () => {
      running++; peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 2)); running--; return index;
    })));
    assert.deepEqual(values, Array.from({ length: 16 }, (_, index) => index));
    assert.equal(peak, 4); assert.equal(budget.snapshot.calls, 16);
    await assert.rejects(budget.run(async () => 'seventeenth'), limit);
  } finally { budget.dispose(); }
});

test('eight distinct detail IDs are allowed; duplicates do not consume another detail slot', async () => {
  const budget = new ReadBudget();
  try {
    for (let index = 0; index < 8; index++) assert.equal(await budget.run(async () => index, `control-${index}`), index);
    assert.equal(await budget.run(async () => 'same', 'control-0'), 'same');
    await assert.rejects(budget.run(async () => 'ninth', 'control-8'), limit);
    assert.equal(budget.snapshot.uniqueDetails, 8);
  } finally { budget.dispose(); }
});

test('request memoization returns the same in-flight value without another source call', async () => {
  const budget = new ReadBudget(); let calls = 0;
  try {
    const load = () => budget.run(async () => { calls++; return { value: calls }; });
    const [first, second] = await Promise.all([budget.memo('same', load), budget.memo('same', load)]);
    assert.equal(first, second); assert.equal(calls, 1); assert.equal(budget.snapshot.calls, 1);
  } finally { budget.dispose(); }
});

test('deadline aborts an active read and queued reads without starting more work', async () => {
  const budget = new ReadBudget({ timeoutMs: 20, concurrency: 1 }); let calls = 0; let sourceAborted = false;
  try {
    const reads = Array.from({ length: 4 }, () => budget.run(async signal => {
      calls++; signal.addEventListener('abort', () => { sourceAborted = true; }, { once: true });
      return new Promise<never>(() => {});
    }));
    const outcomes = await Promise.allSettled(reads);
    assert.ok(outcomes.every(outcome => outcome.status === 'rejected' && unavailable(outcome.reason)));
    assert.equal(calls, 1); assert.equal(sourceAborted, true); assert.equal(budget.snapshot.calls, 1);
  } finally { budget.dispose(); }
});

test('parent cancellation and disposal prevent further reads; budgets cannot be enlarged', async () => {
  const controller = new AbortController(); const budget = new ReadBudget({ signal: controller.signal });
  controller.abort(); await assert.rejects(budget.run(async () => 'unexpected'), unavailable); budget.dispose();
  assert.throws(() => new ReadBudget({ maxCalls: 17 }));
  assert.throws(() => new ReadBudget({ maxDetails: 9 }));
  assert.throws(() => new ReadBudget({ concurrency: 5 }));
  assert.throws(() => new ReadBudget({ timeoutMs: 1001 }));
});

test('synchronous work finishing after the deadline cannot return a successful read', async () => {
  const budget = new ReadBudget({ timeoutMs: 10 });
  try {
    await assert.rejects(budget.run(async () => {
      const end = performance.now() + 20;
      while (performance.now() < end) { /* Deliberately hold the event loop past the deadline. */ }
      return 'late';
    }), unavailable);
  } finally { budget.dispose(); }
});
