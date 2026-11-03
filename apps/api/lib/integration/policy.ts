import { z } from 'zod';

import {
  ConnectorManifest,
  ConnectionCredentialReference,
  IntegrationCheckpoint,
  IntegrationConnection,
  IntegrationEnvelope,
  type IntegrationOperation,
} from '@nexg/contracts/integration-connection';

type Outcome =
  | { state: 'CONFIRMED'; externalReference: string }
  | { state: 'UNKNOWN' | 'REJECTED'; reasonCode: string };
export type AdapterHandler = (input: {
  connection: IntegrationConnection;
  operationId: string;
  /** The owning domain validates its own command before this boundary. */
  command: unknown;
}) => Promise<Outcome>;
export interface PlatformAdapter {
  manifest: ConnectorManifest;
  handlers: Readonly<Record<string, AdapterHandler>>;
  sharedRules: readonly {
    id: string;
    dataClass: IntegrationConnection['bindings'][number]['dataClass'];
    resolve: AdapterHandler;
  }[];
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Construct only in trusted platform code, never from a merchant manifest or JSON. */
export class PlatformAdapterRegistry {
  private readonly entries: Readonly<Record<string, PlatformAdapter>>;

  constructor(adapters: readonly PlatformAdapter[]) {
    const entries: Record<string, PlatformAdapter> = Object.create(null);
    for (const adapter of adapters) {
      const manifest = ConnectorManifest.parse(adapter.manifest);
      const key = `${manifest.providerId}@${manifest.adapterVersion}`;
      const operationIds = manifest.operations.map((operation) => operation.id);
      if (Object.hasOwn(entries, key)) throw new Error('Duplicate platform adapter version.');
      if (
        operationIds.length !== Object.keys(adapter.handlers).length ||
        operationIds.some(
          (id) =>
            !Object.hasOwn(adapter.handlers, id) || typeof adapter.handlers[id] !== 'function',
        )
      ) {
        throw new Error('Every declared operation needs exactly one platform implementation.');
      }
      if (
        new Set(adapter.sharedRules.map((rule) => rule.id)).size !== adapter.sharedRules.length ||
        adapter.sharedRules.some(
          (rule) =>
            !rule.id ||
            !manifest.dataClasses.includes(rule.dataClass) ||
            typeof rule.resolve !== 'function',
        )
      ) {
        throw new Error('Shared rules require a data class and a platform implementation.');
      }
      entries[key] = freeze({
        manifest,
        handlers: { ...adapter.handlers },
        sharedRules: adapter.sharedRules.map((rule) => ({ ...rule })),
      });
    }
    this.entries = freeze(entries);
    Object.freeze(this);
  }

  find(providerId: string, version: string): PlatformAdapter | undefined {
    return this.entries[`${providerId}@${version}`];
  }
}

/** No Odoo, QuickBooks or other provider implementation is registered in this increment. */
export const platformAdapterRegistry = new PlatformAdapterRegistry([]);

export interface VerifiedConnectionContext {
  /** Server-derived current session/membership/approval, never request-body claims. */
  tenantId: string;
  locationIds: readonly string[];
  principalKind: 'OPERATOR' | 'MACHINE';
  currentSession: boolean;
  setupAllowed: boolean;
  operationsAllowed: boolean;
  approvedRevision: number | null;
  actorPermissions: readonly string[];
  platformPermissions: readonly string[];
  credential: null | {
    tenantId: string;
    locationIds: readonly string[];
    machineCredentialId: string;
    secretReferenceId: string;
    version: number;
    authMethod: z.infer<typeof ConnectionCredentialReference>['authMethod'];
    active: boolean;
    authorizedScopes: readonly string[];
  };
  /** Evidence is produced by a registered adapter/owner, not by a browser form. */
  evidence?: {
    connectionId: string;
    connectionVersion: number;
    adapterVersion: string;
    credentialVersion: number;
    testPassed: boolean;
    testedOperationIds: readonly string[];
    mappingVersion: string | null;
    mappingDigest: string | null;
    mappingComplete: boolean;
    previewPassed: boolean;
    pendingDispositionRecorded: boolean;
  };
  pendingOperations: number;
}

type Denied = { ok: false; code: string };
const deny = (code: string): Denied => ({ ok: false, code });
const revision = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1);
const actionBase = { operationId: z.string().uuid(), expectedVersion: revision };
export const ConnectionAction = z.discriminatedUnion('action', [
  z.object({ ...actionBase, action: z.literal('TEST') }).strict(),
  z
    .object({
      ...actionBase,
      action: z.literal('MAP'),
      mappingVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
      mappingDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
  z.object({ ...actionBase, action: z.literal('PREVIEW') }).strict(),
  z.object({ ...actionBase, action: z.literal('ACTIVATE') }).strict(),
  z.object({ ...actionBase, action: z.literal('PAUSE') }).strict(),
  z.object({ ...actionBase, action: z.literal('RECONNECT') }).strict(),
  z
    .object({
      ...actionBase,
      action: z.literal('ROTATE'),
      credential: ConnectionCredentialReference,
    })
    .strict(),
  z.object({ ...actionBase, action: z.literal('DISCONNECT') }).strict(),
]);

function scopeGuard(
  connection: IntegrationConnection,
  context: VerifiedConnectionContext,
): Denied | null {
  if (
    connection.tenantId !== context.tenantId ||
    connection.locationIds.some((id) => !context.locationIds.includes(id))
  ) {
    return deny('CONNECTION_SCOPE_DENIED');
  }
  return null;
}

function actorGuard(
  connection: IntegrationConnection,
  context: VerifiedConnectionContext,
): Denied | null {
  if (
    context.principalKind !== 'OPERATOR' ||
    !context.currentSession ||
    !context.setupAllowed ||
    !context.actorPermissions.includes('connections.manage')
  ) {
    return deny('CONNECTION_ADMIN_REQUIRED');
  }
  return scopeGuard(connection, context);
}

function capabilityGuard(
  connection: IntegrationConnection,
  context: VerifiedConnectionContext,
  registry: PlatformAdapterRegistry,
): Denied | PlatformAdapter {
  const adapter = registry.find(connection.providerId, connection.adapterVersion);
  if (!adapter) return deny('PROVIDER_NOT_IMPLEMENTED');
  for (const binding of connection.bindings) {
    if (
      binding.sharedRuleId !== null &&
      !adapter.sharedRules.some(
        (rule) => rule.id === binding.sharedRuleId && rule.dataClass === binding.dataClass,
      )
    ) {
      return deny('SHARED_RULE_NOT_REGISTERED');
    }
    for (const id of binding.operationIds) {
      const operation = adapter.manifest.operations.find((entry) => entry.id === id);
      if (!operation || operation.dataClass !== binding.dataClass)
        return deny('OPERATION_NOT_IMPLEMENTED');
      if (
        (binding.direction !== 'BOTH' && binding.direction !== operation.direction) ||
        (binding.authority === 'READ_ONLY_EXTERNAL' &&
          !['READ', 'RECONCILE'].includes(operation.effect)) ||
        (binding.authority === 'NEXG_AUTHORITATIVE' &&
          operation.direction === 'PULL' &&
          operation.effect !== 'PROPOSE')
      )
        return deny('AUTHORITY_DIRECTION_DENIED');
      if (
        !context.platformPermissions.includes(operation.platformPermission) ||
        !context.actorPermissions.includes(operation.platformPermission)
      )
        return deny('OPERATION_PERMISSION_DENIED');
    }
  }
  return adapter;
}

function credentialGuard(
  connection: IntegrationConnection,
  context: VerifiedConnectionContext,
  adapter: PlatformAdapter,
): Denied | null {
  const expected = connection.credential;
  const current = context.credential;
  if (
    !expected ||
    !current ||
    !current.active ||
    current.tenantId !== connection.tenantId ||
    expected.machineCredentialId !== current.machineCredentialId ||
    expected.secretReferenceId !== current.secretReferenceId ||
    expected.version !== current.version ||
    expected.authMethod !== current.authMethod ||
    !adapter.manifest.authMethods.includes(expected.authMethod) ||
    connection.locationIds.some((id) => !current.locationIds.includes(id))
  )
    return deny('CREDENTIAL_NOT_CURRENT');
  const selectedIds = connection.bindings.flatMap((binding) => binding.operationIds);
  if (
    adapter.manifest.operations.some(
      (operation) =>
        selectedIds.includes(operation.id) &&
        operation.requiredScopes.some((scope) => !current.authorizedScopes.includes(scope)),
    )
  )
    return deny('CREDENTIAL_SCOPE_MISSING');
  return null;
}

function evidenceGuard(
  connection: IntegrationConnection,
  context: VerifiedConnectionContext,
): Denied | null {
  const evidence = context.evidence;
  if (
    !evidence ||
    evidence.connectionId !== connection.id ||
    evidence.connectionVersion !== connection.version ||
    evidence.adapterVersion !== connection.adapterVersion ||
    evidence.credentialVersion !== connection.credential?.version ||
    !evidence.testPassed ||
    connection.bindings.some((binding) =>
      binding.operationIds.some((id) => !evidence.testedOperationIds.includes(id)),
    )
  ) {
    return deny('CURRENT_TEST_REQUIRED');
  }
  return null;
}

/** Pure transition decision only: the existing owner must persist/journal it atomically. No provider I/O. */
export function transitionConnection(
  input: unknown,
  commandInput: unknown,
  context: VerifiedConnectionContext,
  registry = platformAdapterRegistry,
): Denied | { ok: true; connection: IntegrationConnection; operationId: string } {
  const parsed = IntegrationConnection.safeParse(input);
  const command = ConnectionAction.safeParse(commandInput);
  if (!parsed.success || !command.success) return deny('INVALID_CONNECTION_COMMAND');
  const connection = parsed.data;
  const action = command.data;
  const actorDenied = actorGuard(connection, context);
  if (actorDenied) return actorDenied;
  if (connection.version !== action.expectedVersion) return deny('CONNECTION_VERSION_CONFLICT');
  if (connection.state === 'DISCONNECTED') return deny('CONNECTION_DISCONNECTED');
  const next = { ...connection, version: connection.version + 1 };
  const evidence = context.evidence;
  if (action.action === 'DISCONNECT') {
    if (
      context.pendingOperations > 0 &&
      (!evidence?.pendingDispositionRecorded ||
        evidence.connectionId !== connection.id ||
        evidence.connectionVersion !== connection.version)
    )
      return deny('PENDING_RECONCILIATION_REQUIRED');
    return {
      ok: true,
      operationId: action.operationId,
      connection: {
        ...next,
        state: 'DISCONNECTED',
        credential: null,
        authorization: 'REVOKED',
        setup: 'BLOCKED',
        synchronization: 'UNKNOWN',
      },
    };
  }
  if (action.action === 'PAUSE') {
    if (connection.state !== 'ACTIVE') return deny('CONNECTION_TRANSITION_DENIED');
    return {
      ok: true,
      operationId: action.operationId,
      connection: { ...next, state: 'PAUSED', synchronization: 'STALE' },
    };
  }
  if (action.action === 'RECONNECT') {
    return {
      ok: true,
      operationId: action.operationId,
      connection: {
        ...next,
        state: 'RECONNECT_REQUIRED',
        credential: null,
        authorization: 'AUTHORIZATION_REQUIRED',
        setup: 'BLOCKED',
        synchronization: 'STALE',
      },
    };
  }
  if (action.action === 'ROTATE') {
    if (
      connection.credential &&
      (action.credential.secretReferenceId === connection.credential.secretReferenceId ||
        (action.credential.machineCredentialId === connection.credential.machineCredentialId &&
          action.credential.version <= connection.credential.version))
    )
      return deny('CREDENTIAL_ROTATION_REQUIRED');
    const rotated = { ...connection, credential: action.credential };
    const capability = capabilityGuard(rotated, context, registry);
    if ('ok' in capability) return capability;
    const credentialDenied = credentialGuard(rotated, context, capability);
    if (credentialDenied) return credentialDenied;
    return {
      ok: true,
      operationId: action.operationId,
      connection: {
        ...next,
        credential: action.credential,
        state: 'REQUESTED',
        authorization: 'AUTHORIZATION_REQUIRED',
        setup: 'UNMAPPED',
        synchronization: 'UNKNOWN',
      },
    };
  }
  const adapter = capabilityGuard(connection, context, registry);
  if ('ok' in adapter) return adapter;
  const denied =
    credentialGuard(connection, context, adapter) ?? evidenceGuard(connection, context);
  if (denied) return denied;
  switch (action.action) {
    case 'TEST':
      if (!['REQUESTED', 'RECONNECT_REQUIRED', 'PAUSED'].includes(connection.state))
        return deny('CONNECTION_TRANSITION_DENIED');
      return {
        ok: true,
        operationId: action.operationId,
        connection: { ...next, state: 'TESTED', authorization: 'AUTHORIZED', setup: 'UNMAPPED' },
      };
    case 'MAP':
      if (!['TESTED', 'MAPPED'].includes(connection.state))
        return deny('CONNECTION_TRANSITION_DENIED');
      if (
        !evidence?.mappingComplete ||
        evidence.mappingVersion !== action.mappingVersion ||
        evidence.mappingDigest !== action.mappingDigest
      )
        return deny('COMPLETE_MAPPING_REQUIRED');
      return {
        ok: true,
        operationId: action.operationId,
        connection: {
          ...next,
          state: 'MAPPED',
          mappingVersion: action.mappingVersion,
          mappingDigest: action.mappingDigest,
          setup: 'VALIDATING',
        },
      };
    case 'PREVIEW':
    case 'ACTIVATE': {
      if (
        !evidence?.mappingComplete ||
        evidence.mappingVersion !== connection.mappingVersion ||
        evidence.mappingDigest !== connection.mappingDigest ||
        !connection.mappingVersion ||
        !evidence.previewPassed
      ) {
        return deny('CURRENT_PREVIEW_REQUIRED');
      }
      if (action.action === 'PREVIEW') {
        if (!['MAPPED', 'PAUSED'].includes(connection.state))
          return deny('CONNECTION_TRANSITION_DENIED');
        return {
          ok: true,
          operationId: action.operationId,
          connection: { ...next, state: 'PREVIEWED', setup: 'READY' },
        };
      }
      if (
        connection.state !== 'PREVIEWED' ||
        connection.authorization !== 'AUTHORIZED' ||
        connection.setup !== 'READY'
      ) {
        return deny('CONNECTION_TRANSITION_DENIED');
      }
      if (!context.operationsAllowed || context.approvedRevision !== connection.approvalRevision)
        return deny('CURRENT_APPROVAL_REQUIRED');
      return {
        ok: true,
        operationId: action.operationId,
        connection: { ...next, state: 'ACTIVE', synchronization: 'NOT_STARTED' },
      };
    }
  }
}

export interface DeliveryFence {
  externalEntityType: string;
  externalId: string;
  expectedCheckpointVersion: number;
  authenticityVerified: boolean;
  seenEventIds: readonly string[];
  locallyIssuedOperationIds: readonly string[];
  /** Tombstones survive disconnect/reconnect; absence from a snapshot never deletes an owner record. */
  tombstoneSequence: number | null;
}

/** A guarded proposal for the existing domain owner. APPLY never means provider-confirmed business success. */
export function guardIntegrationDelivery(
  connectionInput: unknown,
  checkpointInput: unknown,
  envelopeInput: unknown,
  context: VerifiedConnectionContext,
  fence: DeliveryFence,
  registry = platformAdapterRegistry,
):
  | Denied
  | {
      ok: true;
      disposition:
        | 'APPLY_PROPOSAL'
        | 'RECORD_TOMBSTONE'
        | 'IGNORE_DUPLICATE'
        | 'IGNORE_ECHO'
        | 'RECONCILE';
    } {
  const c = IntegrationConnection.safeParse(connectionInput);
  const p = IntegrationCheckpoint.safeParse(checkpointInput);
  const e = IntegrationEnvelope.safeParse(envelopeInput);
  if (!c.success || !p.success || !e.success) return deny('INVALID_DELIVERY');
  const connection = c.data;
  const checkpoint = p.data;
  const envelope = e.data;
  const actorDenied = scopeGuard(connection, context);
  if (actorDenied) return actorDenied;
  if (context.principalKind !== 'MACHINE') return deny('MACHINE_PRINCIPAL_REQUIRED');
  if (!context.operationsAllowed || context.approvedRevision !== connection.approvalRevision)
    return deny('CURRENT_APPROVAL_REQUIRED');
  if (
    connection.state !== 'ACTIVE' ||
    connection.authorization !== 'AUTHORIZED' ||
    connection.setup !== 'READY'
  )
    return deny('CONNECTION_NOT_ACTIVE');
  const adapter = capabilityGuard(connection, context, registry);
  if ('ok' in adapter) return adapter;
  const credentialDenied = credentialGuard(connection, context, adapter);
  if (credentialDenied) return credentialDenied;
  if (!fence.authenticityVerified) return deny('DELIVERY_UNVERIFIED');
  if (
    envelope.connectionId !== connection.id ||
    checkpoint.connectionId !== connection.id ||
    envelope.tenantId !== connection.tenantId ||
    checkpoint.tenantId !== connection.tenantId ||
    !connection.locationIds.includes(envelope.locationId) ||
    checkpoint.locationId !== envelope.locationId ||
    checkpoint.dataClass !== envelope.dataClass ||
    checkpoint.operationId !== envelope.operationId ||
    fence.externalEntityType !== envelope.externalEntityType ||
    fence.externalId !== envelope.externalId
  )
    return deny('DELIVERY_SCOPE_DENIED');
  const operation: IntegrationOperation | undefined = adapter.manifest.operations.find(
    (item) => item.id === envelope.operationId,
  );
  const binding = connection.bindings.find(
    (item) =>
      item.dataClass === envelope.dataClass && item.operationIds.includes(envelope.operationId),
  );
  if (
    !operation ||
    !binding ||
    operation.dataClass !== envelope.dataClass ||
    operation.direction !== 'PULL'
  )
    return deny('DELIVERY_OPERATION_DENIED');
  if (
    checkpoint.version !== fence.expectedCheckpointVersion ||
    envelope.adapterVersion !== connection.adapterVersion ||
    checkpoint.adapterVersion !== connection.adapterVersion ||
    envelope.mappingVersion !== connection.mappingVersion ||
    checkpoint.mappingVersion !== connection.mappingVersion ||
    envelope.snapshotId !== checkpoint.snapshotId
  )
    return deny('DELIVERY_VERSION_CONFLICT');
  if (fence.seenEventIds.includes(envelope.eventId))
    return { ok: true, disposition: 'IGNORE_DUPLICATE' };
  if (
    envelope.origin === 'NEXG' ||
    (envelope.causationOperationId !== null &&
      fence.locallyIssuedOperationIds.includes(envelope.causationOperationId))
  )
    return { ok: true, disposition: 'IGNORE_ECHO' };
  if (adapter.manifest.ordering === 'RECONCILE_BEFORE_APPLY' || envelope.sourceSequence === null)
    return { ok: true, disposition: 'RECONCILE' };
  if (
    (envelope.phase === 'SNAPSHOT' && envelope.sourceSequence > checkpoint.snapshotUpperSequence) ||
    (envelope.phase === 'INCREMENTAL' &&
      envelope.sourceSequence <= checkpoint.snapshotUpperSequence) ||
    (checkpoint.lastSequence !== null && envelope.sourceSequence <= checkpoint.lastSequence)
  )
    return deny('DELIVERY_SEQUENCE_CONFLICT');
  if (fence.tombstoneSequence !== null && envelope.mutation === 'UPSERT')
    return deny('DELETION_FENCE_REQUIRES_RECONCILIATION');
  if (fence.tombstoneSequence !== null && envelope.sourceSequence <= fence.tombstoneSequence)
    return deny('DELIVERY_SEQUENCE_CONFLICT');
  return {
    ok: true,
    disposition: envelope.mutation === 'TOMBSTONE' ? 'RECORD_TOMBSTONE' : 'APPLY_PROPOSAL',
  };
}
