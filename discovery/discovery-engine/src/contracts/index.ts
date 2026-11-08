import type { components } from './wire.generated.js';

export type Schemas = components['schemas'];
export type EngineRequest = Schemas['EngineRequest'];
export type EngineRef = Schemas['EngineRef'];
export type SourceRef = Schemas['SourceRef'];
export type ObservedRef = Schemas['ObservedRef'];
export type Evidence = Schemas['Evidence'];
export type Money = Schemas['Money'];
export type Quantity = Schemas['Quantity'];
export type Interval = Schemas['Interval'];
export type Decision = Schemas['Decision'];
export type Selection = Schemas['Selection'];
export type SupportedFilter = Schemas['SupportedFilter'];
export type EngineError = Schemas['EngineError'];
export type Fact<T> = (Omit<Extract<Schemas['BooleanFact'], { state: 'known' }>, 'value'> & { value: T })
  | Exclude<Schemas['BooleanFact'], { state: 'known' }>;

export class ContractError extends Error {
  constructor(public readonly code: EngineError['code'], public readonly fieldPaths: readonly string[], message = code) {
    super(message);
    this.name = 'ContractError';
  }
}
