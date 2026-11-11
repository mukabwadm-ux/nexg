import { fileURLToPath } from 'node:url';
import { ControlFileStore } from './controlFileStore.js';
import { operatorReasons, type OperatorReason, type RuntimeFlags, OperatorError } from './runtimeControl.js';

/** OS-local operator command. The directory is fixed inside standalone Discovery;
 * no environment-supplied source path, HTTP admin route or credential artifact.
 */
export async function runOperator(args: readonly string[]) {
  const store = new ControlFileStore(fileURLToPath(new URL('../../../.runtime/operations/', import.meta.url)));
  const [command, ...rest] = args;
  if (command === 'inspect' && !rest.length) return store.read();
  const defaults: RuntimeFlags = { serving: true, search: false, events: false, tracing: true, profile: 'low_cost' };
  if (command === 'init' && !rest.length) return store.init(defaults);
  const expected = rest[0];
  if (!expected || !/^\d+$/.test(expected) || !Number.isSafeInteger(Number(expected))) throw new OperatorError('INVALID_OPERATOR_ARGUMENTS');
  if (command === 'rollback' && rest.length === 3 && /^\d+$/.test(rest[1]!)) {
    const reason = rest[2] as OperatorReason;
    if (!operatorReasons.includes(reason) || reason === 'initial' || reason === 'control_invalid') throw new OperatorError('INVALID_OPERATOR_ARGUMENTS');
    return store.rollback(Number(expected), Number(rest[1]), reason);
  }
  const reason = rest[1] as OperatorReason;
  if (!operatorReasons.includes(reason) || reason === 'initial' || reason === 'control_invalid') throw new OperatorError('INVALID_OPERATOR_ARGUMENTS');
  if (command === 'baseline' && rest.length === 2) return store.set(Number(expected), defaults, reason);
  if (command === 'disable' && rest.length === 2) return store.set(Number(expected), { ...defaults, serving: false }, reason);
  if (command === 'set' && rest.length === 4 && ['serving', 'search', 'events', 'tracing', 'profile'].includes(rest[2]!)) {
    const current = await store.read(); const key = rest[2] as keyof RuntimeFlags; const input = rest[3];
    if (key === 'profile' ? !['low_cost', 'quality'].includes(input!) : !['on', 'off'].includes(input!)) throw new OperatorError('INVALID_OPERATOR_ARGUMENTS');
    // There is no reviewed quality/model artifact in V1 yet.
    if (key === 'profile' && input === 'quality') throw new OperatorError('CAPABILITY_NOT_CONFIGURED');
    const flags = { ...current.flags, [key]: key === 'profile' ? input : input === 'on' } as RuntimeFlags;
    return store.set(Number(expected), flags, reason);
  }
  throw new OperatorError('INVALID_OPERATOR_ARGUMENTS');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { console.log(JSON.stringify(await runOperator(process.argv.slice(2)))); }
  catch (error) { console.error(JSON.stringify({ code: error instanceof OperatorError ? error.code : 'OPERATOR_FAILED' })); process.exitCode = 1; }
}
