import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertStayPilotEnabled } from '../src/stay-pilot.js';
import { quoteStay, createStayHold } from '../src/stays.js';
test('production and development cannot activate room inventory even with a fixture marker', () => {
  for (const environment of ['production', 'development', undefined])
    for (const pilotState of [undefined, 'disabled', 'enabled', 'synthetic_fixture_enabled'])
      assert.throws(() => assertStayPilotEnabled({ pilotState }, environment ?? 'unset'), {
        code: 'stay_pilot_disabled',
      });
});
test('test environment also stays closed unless explicit synthetic fixture state is present', () => {
  for (const pilotState of [undefined, 'disabled', 'enabled'])
    assert.throws(() => assertStayPilotEnabled({ pilotState }, 'test'), {
      code: 'stay_pilot_disabled',
    });
  assert.doesNotThrow(() =>
    assertStayPilotEnabled({ pilotState: 'synthetic_fixture_enabled' }, 'test'),
  );
});
test('production quote and hold stop before accessing commands, including cached replays', async () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = 'production';
  const engine: any = {
    managementContext: () => {
      throw new Error('Production must not enter command or replay lookup');
    },
  };
  const identity = { businessId: 'unused', userId: 'unused', role: 'customer', expiresAt: 0 };
  try {
    await assert.rejects(() => quoteStay(engine, identity, {} as any, 'cached-key'), {
      code: 'stay_pilot_disabled',
    });
    await assert.rejects(() => createStayHold(engine, identity, {} as any), {
      code: 'stay_pilot_disabled',
    });
  } finally {
    if (previous === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previous;
  }
});
