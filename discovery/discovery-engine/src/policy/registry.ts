import { deepFreeze } from '../shared/immutable.js';
import type { Schemas } from '../contracts/index.js';

export type WorkflowKind = Schemas['WorkflowFilter']['value'];
export const workflowKinds = ['PURCHASE', 'APPOINTMENT', 'RENTAL', 'TRANSFER', 'TICKET', 'TOUR', 'SERVICE', 'REQUEST', 'ENTITLEMENT', 'RESOURCE_RESERVATION', 'TELECOM_ACTIVATION'] as const satisfies readonly WorkflowKind[];

// Other owners need their own typed feasibility module before availability claims.
export const intervalModules: Partial<Record<WorkflowKind, readonly ('resources' | 'route')[]>> = deepFreeze({
  APPOINTMENT: ['resources'], RENTAL: ['resources'], TRANSFER: ['resources', 'route'], RESOURCE_RESERVATION: ['resources'],
});

// Descriptors identify supported semantics, not connected owner operations.
export const policyRegistry = deepFreeze({
  version: '1',
  workflows: workflowKinds.map(kind => ({ kind, version: '1', operationalIntegration: false })),
  recurrence: 'composition_over_owner_occurrences',
  contextAuthority: 'discovery_only',
  unknownFacts: 'never_affirm',
  intervalModules,
});

export const constraintDefinitions = {
  party: { type: 'bounds', unit: 'person' },
  duration: { type: 'bounds', unit: 'minute' },
  notice: { type: 'bounds', unit: 'minute' },
  fulfillment: { type: 'allowed_set' },
  required_acknowledgements: { type: 'requirements' },
} as const;
