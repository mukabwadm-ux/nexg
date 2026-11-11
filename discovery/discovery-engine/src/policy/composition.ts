import { constraintDefinitions } from './registry.js';

type BoundsKey = 'party' | 'duration' | 'notice';
export type Constraint =
  | { key: BoundsKey; type: 'bounds'; unit: string; min?: number; max?: number }
  | { key: 'fulfillment'; type: 'allowed_set'; values: readonly string[] }
  | { key: 'required_acknowledgements'; type: 'requirements'; values: readonly string[] };
export interface ConstraintLayer {
  readonly origin: 'global' | 'workflow' | 'qualifier' | 'offering' | 'request';
  readonly ownerId: string;
  readonly revision: string;
  readonly constraints: readonly Constraint[];
}
export interface ComposedConstraints {
  readonly constraints: readonly Constraint[];
  readonly conflicts: readonly { key: string; code: 'EMPTY_ALLOWED_SET' | 'IMPOSSIBLE_BOUNDS' | 'INCOMPATIBLE_UNIT' | 'INVALID_CONSTRAINT' }[];
}

export function composeConstraints(layers: readonly ConstraintLayer[]): ComposedConstraints {
  const merged = new Map<string, Constraint>();
  const conflicts: { key: string; code: ComposedConstraints['conflicts'][number]['code'] }[] = [];
  for (const layer of layers) {
    if (!layer.ownerId || !layer.revision) throw new Error('Policy layers require owner and revision');
    for (const rule of layer.constraints) {
      if (!Object.hasOwn(constraintDefinitions, rule.key)) throw new Error('Unregistered policy rule');
      const definition = constraintDefinitions[rule.key];
      if (!definition || rule.type !== definition.type) throw new Error('Unregistered policy rule');
      const previous = merged.get(rule.key);
      if (rule.type === 'bounds') {
        if (!('unit' in definition) || rule.unit !== definition.unit || (previous?.type === 'bounds' && rule.unit !== previous.unit)) {
          conflicts.push({ key: rule.key, code: 'INCOMPATIBLE_UNIT' }); continue;
        }
        if ((rule.min === undefined && rule.max === undefined) || [rule.min, rule.max].some(n => n !== undefined && (!Number.isSafeInteger(n) || n < 0))) {
          conflicts.push({ key: rule.key, code: 'INVALID_CONSTRAINT' }); continue;
        }
        const lower = [rule.min, previous?.type === 'bounds' ? previous.min : undefined].filter(n => n !== undefined);
        const upper = [rule.max, previous?.type === 'bounds' ? previous.max : undefined].filter(n => n !== undefined);
        const min = lower.length ? Math.max(...lower) : undefined;
        const max = upper.length ? Math.min(...upper) : undefined;
        merged.set(rule.key, { key: rule.key, type: 'bounds', unit: rule.unit, ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) });
      } else {
        if (rule.type === 'requirements' && layer.origin === 'request') { conflicts.push({ key: rule.key, code: 'INVALID_CONSTRAINT' }); continue; }
        if (rule.values.some(value => typeof value !== 'string' || !value)) { conflicts.push({ key: rule.key, code: 'INVALID_CONSTRAINT' }); continue; }
        const prior = previous && previous.type !== 'bounds' ? previous.values : undefined;
        const values = rule.type === 'allowed_set' && prior ? rule.values.filter(value => prior.includes(value)) : [...(prior ?? []), ...rule.values];
        merged.set(rule.key, { key: rule.key, type: rule.type, values: [...new Set(values)].sort() } as Constraint);
      }
    }
  }
  for (const rule of merged.values()) {
    if (rule.type === 'bounds' && rule.min !== undefined && rule.max !== undefined && rule.min > rule.max) conflicts.push({ key: rule.key, code: 'IMPOSSIBLE_BOUNDS' });
    if (rule.type === 'allowed_set' && rule.values.length === 0) conflicts.push({ key: rule.key, code: 'EMPTY_ALLOWED_SET' });
  }
  return { constraints: [...merged.values()].sort((a, b) => a.key.localeCompare(b.key)), conflicts: conflicts.sort((a, b) => a.key.localeCompare(b.key) || a.code.localeCompare(b.code)) };
}
