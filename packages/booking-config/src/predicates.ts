import type { Predicate } from './types';

export type Truth = true | false | undefined;
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a))
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => sameValue(value, b[index]))
    );
  if (typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>;
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
    );
  }
  return false;
}
export function evaluatePredicate(predicate: Predicate, values: Record<string, unknown>): Truth {
  if ('all' in predicate) {
    const results = predicate.all.map((child) => evaluatePredicate(child, values));
    return results.includes(false) ? false : results.includes(undefined) ? undefined : true;
  }
  if ('any' in predicate) {
    const results = predicate.any.map((child) => evaluatePredicate(child, values));
    return results.includes(true) ? true : results.includes(undefined) ? undefined : false;
  }
  const exists =
    Object.hasOwn(values, predicate.path) &&
    values[predicate.path] !== undefined &&
    values[predicate.path] !== null;
  if (predicate.op === 'exists') return exists === (predicate.value ?? true);
  if (!exists) return undefined;
  const actual = values[predicate.path],
    expected = predicate.value;
  switch (predicate.op) {
    case 'eq':
      return sameValue(actual, expected);
    case 'neq':
      return !sameValue(actual, expected);
    case 'nonempty':
      return typeof actual === 'string' || Array.isArray(actual)
        ? actual.length > 0
        : typeof actual === 'object' && actual !== null
          ? Object.keys(actual).length > 0
          : false;
    case 'contains':
      return Array.isArray(actual) && actual.some((value) => sameValue(value, expected));
    case 'in':
      return Array.isArray(expected) && expected.some((value) => sameValue(value, actual));
    case 'intersects':
      return (
        Array.isArray(actual) &&
        Array.isArray(expected) &&
        actual.some((value) => expected.some((other) => sameValue(value, other)))
      );
  }
}
