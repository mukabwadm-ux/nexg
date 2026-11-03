import { describe, expect, it } from 'vitest';
import {
  ConnectorManifest,
  ConnectionBinding,
  ConnectionCredentialReference,
  ExternalIdentityLink,
  IntegrationConnection,
  IntegrationMapping,
  mapIntegrationEnum,
} from '@nexg/contracts/integration-connection';
import {
  guardIntegrationDelivery,
  PlatformAdapterRegistry,
  transitionConnection,
  type DeliveryFence,
  type PlatformAdapter,
  type VerifiedConnectionContext,
} from '../lib/integration/policy';

const connectionId = '10000000-0000-4000-8000-000000000001';
const tenantId = '10000000-0000-4000-8000-000000000002';
const locationId = '10000000-0000-4000-8000-000000000003';
const secretReferenceId = '10000000-0000-4000-8000-000000000004';
const machineCredentialId = '10000000-0000-4000-8000-000000000005';
const operationId = '10000000-0000-4000-8000-000000000006';
const snapshotId = '10000000-0000-4000-8000-000000000007';
const otherId = '20000000-0000-4000-8000-000000000001';
const digest = `sha256:${'a'.repeat(64)}`;

function manifest(): ConnectorManifest {
  return ConnectorManifest.parse({
    contractVersion: '1.0.0',
    providerId: 'fixture_erp',
    adapterVersion: '1.0.0',
    dataClasses: ['OFFERING_PRICE'],
    authMethods: ['OAUTH2'],
    operations: [
      {
        id: 'catalog.read',
        dataClass: 'OFFERING_PRICE',
        direction: 'PULL',
        effect: 'READ',
        ownerOperation: 'catalog.propose_import',
        platformPermission: 'catalog:read',
        requiredScopes: ['catalog.read'],
      },
    ],
    supportedMethods: ['API', 'POLL'],
    rateLimit: { requestsPerMinute: 30, concurrency: 1 },
    pagination: 'CURSOR',
    ordering: 'MONOTONIC_SEQUENCE',
    webhookVerification: 'UNSUPPORTED',
    deletion: 'EXPLICIT_TOMBSTONE_ONLY',
  });
}
function adapter(value = manifest()): PlatformAdapter {
  return {
    manifest: value,
    sharedRules: [],
    handlers: {
      'catalog.read': async () => ({ state: 'REJECTED', reasonCode: 'TEST_FIXTURE_ONLY' }),
    },
  };
}
function registry(value = manifest()) {
  return new PlatformAdapterRegistry([adapter(value)]);
}
function connection(): IntegrationConnection {
  return IntegrationConnection.parse({
    contractVersion: '1.0.0',
    id: connectionId,
    tenantId,
    locationIds: [locationId],
    providerId: 'fixture_erp',
    externalInstanceId: 'company-1',
    adapterVersion: '1.0.0',
    version: 0,
    approvalRevision: 3,
    state: 'REQUESTED',
    authorization: 'AUTHORIZATION_REQUIRED',
    setup: 'UNMAPPED',
    synchronization: 'NOT_STARTED',
    credential: { secretReferenceId, machineCredentialId, version: 1, authMethod: 'OAUTH2' },
    bindings: [
      {
        dataClass: 'OFFERING_PRICE',
        authority: 'READ_ONLY_EXTERNAL',
        direction: 'PULL',
        operationIds: ['catalog.read'],
        sharedRuleId: null,
      },
    ],
    mappingVersion: null,
    mappingDigest: null,
  });
}
function context(value = connection()): VerifiedConnectionContext {
  return {
    tenantId,
    locationIds: [locationId],
    principalKind: 'OPERATOR',
    currentSession: true,
    setupAllowed: true,
    operationsAllowed: true,
    approvedRevision: 3,
    actorPermissions: ['connections.manage', 'catalog:read'],
    platformPermissions: ['catalog:read'],
    pendingOperations: 0,
    credential: {
      tenantId,
      locationIds: [locationId],
      machineCredentialId,
      secretReferenceId,
      version: 1,
      authMethod: 'OAUTH2',
      active: true,
      authorizedScopes: ['catalog.read'],
    },
    evidence: {
      connectionId,
      connectionVersion: value.version,
      adapterVersion: '1.0.0',
      credentialVersion: 1,
      testPassed: true,
      testedOperationIds: ['catalog.read'],
      mappingVersion: '1.0.0',
      mappingDigest: digest,
      mappingComplete: true,
      previewPassed: true,
      pendingDispositionRecorded: false,
    },
  };
}
function command(action: string, value = connection()) {
  return { operationId, expectedVersion: value.version, action };
}
function active(): IntegrationConnection {
  return {
    ...connection(),
    version: 4,
    state: 'ACTIVE',
    authorization: 'AUTHORIZED',
    setup: 'READY',
    mappingVersion: '1.0.0',
    mappingDigest: digest,
  };
}
function checkpoint() {
  return {
    contractVersion: '1.0.0',
    connectionId,
    tenantId,
    locationId,
    dataClass: 'OFFERING_PRICE',
    operationId: 'catalog.read',
    version: 5,
    adapterVersion: '1.0.0',
    mappingVersion: '1.0.0',
    snapshotId,
    snapshotUpperSequence: 10,
    lastSequence: 10,
    cursor: 'opaque-10',
  };
}
function envelope() {
  return {
    contractVersion: '1.0.0',
    connectionId,
    tenantId,
    locationId,
    dataClass: 'OFFERING_PRICE',
    operationId: 'catalog.read',
    externalEntityType: 'product',
    externalId: 'external-12',
    eventId: 'delivery-1',
    adapterVersion: '1.0.0',
    mappingVersion: '1.0.0',
    snapshotId,
    phase: 'INCREMENTAL',
    sourceSequence: 11,
    sourceVersion: 'opaque-11',
    origin: 'EXTERNAL',
    causationOperationId: null,
    mutation: 'UPSERT',
    observedAt: '2026-11-02T10:00:00Z',
    effectiveAt: '2026-11-02T09:59:00+00:00',
  };
}
function fence(): DeliveryFence {
  return {
    externalEntityType: 'product',
    externalId: 'external-12',
    expectedCheckpointVersion: 5,
    authenticityVerified: true,
    seenEventIds: [],
    locallyIssuedOperationIds: [],
    tombstoneSequence: null,
  };
}
function deliveryContext() {
  return { ...context(active()), principalKind: 'MACHINE' as const, currentSession: false };
}

describe('strict provider-neutral declarations', () => {
  it('requires a secret reference rather than accepting credential content', () => {
    expect(ConnectionCredentialReference.parse(connection().credential)).toEqual({
      secretReferenceId,
      machineCredentialId,
      version: 1,
      authMethod: 'OAUTH2',
    });
    expect(
      ConnectionCredentialReference.safeParse({
        ...connection().credential,
        token: 'not-a-config-field',
      }).success,
    ).toBe(false);
    expect(
      ConnectionCredentialReference.safeParse({
        ...connection().credential,
        secretReferenceId: 'https://secret.example/token',
      }).success,
    ).toBe(false);
  });

  it('rejects missing authority, readonly push, duplicate class and invented manifest capability', () => {
    const binding = connection().bindings[0]!;
    expect(ConnectionBinding.safeParse({ ...binding, authority: undefined }).success).toBe(false);
    expect(ConnectionBinding.safeParse({ ...binding, direction: 'PUSH' }).success).toBe(false);
    expect(
      IntegrationConnection.safeParse({ ...connection(), bindings: [binding, binding] }).success,
    ).toBe(false);
    expect(
      ConnectorManifest.safeParse({
        ...manifest(),
        operations: [{ ...manifest().operations[0], dataClass: 'PAYOUT' }],
      }).success,
    ).toBe(false);
    expect(
      ConnectorManifest.safeParse({ ...manifest(), supportedMethods: ['WEBHOOK'] }).success,
    ).toBe(false);
  });

  it('keeps unknown enum values explicit and mappings declarative', () => {
    expect(mapIntegrationEnum('paid', { paid: 'SETTLED' })).toEqual({
      state: 'MAPPED',
      value: 'SETTLED',
    });
    expect(mapIntegrationEnum('new_status', { paid: 'SETTLED' })).toEqual({
      state: 'UNMAPPED',
      externalValue: 'new_status',
    });
    expect(mapIntegrationEnum('constructor', {})).toEqual({
      state: 'UNMAPPED',
      externalValue: 'constructor',
    });
    const mapping = {
      contractVersion: '1.0.0',
      connectionId,
      version: '1.0.0',
      dataClass: 'OFFERING_PRICE',
      fields: [
        {
          source: ['unit'],
          target: ['unit'],
          transform: {
            kind: 'UNIT',
            sourceUnit: 'box',
            targetUnit: 'piece',
            factor: { numerator: 12, denominator: 1 },
          },
        },
      ],
    };
    expect(IntegrationMapping.parse(mapping).fields[0]?.transform).toEqual({
      kind: 'UNIT',
      sourceUnit: 'box',
      targetUnit: 'piece',
      factor: { numerator: 12, denominator: 1 },
    });
    expect(
      IntegrationMapping.safeParse({ ...mapping, fields: [...mapping.fields, ...mapping.fields] })
        .success,
    ).toBe(false);
    expect(IntegrationMapping.safeParse({ ...mapping, execute: 'arbitrary-code' }).success).toBe(
      false,
    );
    expect(
      IntegrationMapping.safeParse({
        ...mapping,
        fields: [{ ...mapping.fields[0], target: ['__proto__'] }],
      }).success,
    ).toBe(false);
  });

  it('requires tenant/location and versioned external identity links', () => {
    const link = {
      contractVersion: '1.0.0',
      connectionId,
      tenantId,
      locationId,
      dataClass: 'OFFERING_PRICE',
      externalEntityType: 'product',
      externalId: '0012',
      nexgEntityId: otherId,
      mappingVersion: '1.0.0',
      sourceVersion: 'v1',
      tombstoned: false,
    };
    expect(ExternalIdentityLink.parse(link).externalId).toBe('0012');
    expect(ExternalIdentityLink.safeParse({ ...link, locationId: null }).success).toBe(false);
  });
});

describe('platform registration and connection lifecycle', () => {
  it('denies Odoo, QuickBooks and unimplemented providers even with ready-looking metadata', () => {
    for (const providerId of ['odoo', 'quickbooks', 'fixture_erp']) {
      const value = { ...active(), state: 'PREVIEWED', providerId };
      expect(
        transitionConnection(
          value,
          command('ACTIVATE', value as IntegrationConnection),
          context(value as IntegrationConnection),
        ),
      ).toEqual({ ok: false, code: 'PROVIDER_NOT_IMPLEMENTED' });
    }
  });

  it('refuses missing implementation and freezes registered metadata against later mutation', () => {
    expect(() => new PlatformAdapterRegistry([{ ...adapter(), handlers: {} }])).toThrow(
      'Every declared operation needs exactly one platform implementation.',
    );
    const candidate = adapter();
    const entries = new PlatformAdapterRegistry([candidate]);
    candidate.manifest.operations[0]!.requiredScopes.push('unapproved.scope');
    const result = transitionConnection(connection(), command('TEST'), context(), entries);
    expect(result.ok && result.connection.state).toBe('TESTED');
    expect(() =>
      entries.find('fixture_erp', '1.0.0')!.manifest.operations.push(manifest().operations[0]!),
    ).toThrow();
  });

  it('requires real current test evidence, mapping and preview before activation', () => {
    const entries = registry();
    let value = connection();
    for (const action of ['TEST', 'MAP', 'PREVIEW', 'ACTIVATE']) {
      const request =
        action === 'MAP'
          ? { ...command(action, value), mappingVersion: '1.0.0', mappingDigest: digest }
          : command(action, value);
      const result = transitionConnection(value, request, context(value), entries);
      if (!result.ok) throw new Error(result.code);
      value = result.connection;
    }
    expect({
      state: value.state,
      version: value.version,
      setup: value.setup,
      authorization: value.authorization,
      synchronization: value.synchronization,
    }).toEqual({
      state: 'ACTIVE',
      version: 4,
      setup: 'READY',
      authorization: 'AUTHORIZED',
      synchronization: 'NOT_STARTED',
    });
    expect(transitionConnection(connection(), command('ACTIVATE'), context(), entries)).toEqual({
      ok: false,
      code: 'CURRENT_PREVIEW_REQUIRED',
    });
    expect(
      transitionConnection(
        connection(),
        command('TEST'),
        { ...context(), evidence: undefined },
        entries,
      ),
    ).toEqual({ ok: false, code: 'CURRENT_TEST_REQUIRED' });
    const wrongEvidence = context();
    wrongEvidence.evidence!.connectionId = otherId;
    expect(transitionConnection(connection(), command('TEST'), wrongEvidence, entries)).toEqual({
      ok: false,
      code: 'CURRENT_TEST_REQUIRED',
    });
  });

  it.each([
    [
      'foreign tenant',
      (ctx: VerifiedConnectionContext) => {
        ctx.tenantId = otherId;
      },
      'CONNECTION_SCOPE_DENIED',
    ],
    [
      'foreign location',
      (ctx: VerifiedConnectionContext) => {
        ctx.locationIds = [otherId];
      },
      'CONNECTION_SCOPE_DENIED',
    ],
    [
      'revoked session',
      (ctx: VerifiedConnectionContext) => {
        ctx.currentSession = false;
      },
      'CONNECTION_ADMIN_REQUIRED',
    ],
    [
      'no operator permission',
      (ctx: VerifiedConnectionContext) => {
        ctx.actorPermissions = ['connections.manage'];
      },
      'OPERATION_PERMISSION_DENIED',
    ],
    [
      'no platform permission',
      (ctx: VerifiedConnectionContext) => {
        ctx.platformPermissions = [];
      },
      'OPERATION_PERMISSION_DENIED',
    ],
    [
      'revoked credential',
      (ctx: VerifiedConnectionContext) => {
        ctx.credential!.active = false;
      },
      'CREDENTIAL_NOT_CURRENT',
    ],
    [
      'missing provider scope',
      (ctx: VerifiedConnectionContext) => {
        ctx.credential!.authorizedScopes = [];
      },
      'CREDENTIAL_SCOPE_MISSING',
    ],
    [
      'stale approval',
      (ctx: VerifiedConnectionContext) => {
        ctx.approvedRevision = 2;
      },
      'CURRENT_APPROVAL_REQUIRED',
    ],
    [
      'pending workspace',
      (ctx: VerifiedConnectionContext) => {
        ctx.operationsAllowed = false;
      },
      'CURRENT_APPROVAL_REQUIRED',
    ],
  ])('denies activation for %s', (_name, mutate, code) => {
    const value = { ...active(), state: 'PREVIEWED' as const };
    const ctx = context(value);
    mutate(ctx);
    expect(transitionConnection(value, command('ACTIVATE', value), ctx, registry())).toEqual({
      ok: false,
      code,
    });
  });

  it('fences stale versions, undeclared operations and unimplemented shared rules', () => {
    expect(
      transitionConnection(
        connection(),
        { ...command('TEST'), expectedVersion: 9 },
        context(),
        registry(),
      ),
    ).toEqual({ ok: false, code: 'CONNECTION_VERSION_CONFLICT' });
    const unsupported = connection();
    unsupported.bindings[0]!.operationIds = ['catalog.write'];
    expect(transitionConnection(unsupported, command('TEST'), context(), registry())).toEqual({
      ok: false,
      code: 'OPERATION_NOT_IMPLEMENTED',
    });
    const shared = connection();
    shared.bindings[0] = {
      ...shared.bindings[0]!,
      authority: 'SHARED_WITH_RULES',
      sharedRuleId: 'rule.v1',
    };
    expect(transitionConnection(shared, command('TEST'), context(), registry())).toEqual({
      ok: false,
      code: 'SHARED_RULE_NOT_REGISTERED',
    });
    const nexg = connection();
    nexg.bindings[0]!.authority = 'NEXG_AUTHORITATIVE';
    expect(transitionConnection(nexg, command('TEST'), context(), registry())).toEqual({
      ok: false,
      code: 'AUTHORITY_DIRECTION_DENIED',
    });
  });

  it('pauses and reconnects without claiming a fresh sync; rotation invalidates earlier setup', () => {
    const value = active();
    const entries = registry();
    const paused = transitionConnection(value, command('PAUSE', value), context(value), entries);
    expect(paused.ok && [paused.connection.state, paused.connection.synchronization]).toEqual([
      'PAUSED',
      'STALE',
    ]);
    const reconnected = transitionConnection(
      value,
      command('RECONNECT', value),
      context(value),
      entries,
    );
    expect(
      reconnected.ok && [
        reconnected.connection.state,
        reconnected.connection.credential,
        reconnected.connection.authorization,
      ],
    ).toEqual(['RECONNECT_REQUIRED', null, 'AUTHORIZATION_REQUIRED']);
    const ctx = context(value);
    ctx.credential = { ...ctx.credential!, secretReferenceId: otherId, version: 2 };
    const rotated = transitionConnection(
      value,
      {
        ...command('ROTATE', value),
        credential: { ...value.credential!, secretReferenceId: otherId, version: 2 },
      },
      ctx,
      entries,
    );
    expect(
      rotated.ok && [
        rotated.connection.state,
        rotated.connection.authorization,
        rotated.connection.setup,
        rotated.connection.version,
      ],
    ).toEqual(['REQUESTED', 'AUTHORIZATION_REQUIRED', 'UNMAPPED', 5]);
    expect(
      transitionConnection(
        value,
        { ...command('ROTATE', value), credential: value.credential },
        context(value),
        entries,
      ),
    ).toEqual({ ok: false, code: 'CREDENTIAL_ROTATION_REQUIRED' });
  });

  it('requires a recorded pending-operation disposition before disconnect and keeps disconnect terminal', () => {
    const value = active();
    const ctx = context(value);
    ctx.pendingOperations = 1;
    expect(transitionConnection(value, command('DISCONNECT', value), ctx)).toEqual({
      ok: false,
      code: 'PENDING_RECONCILIATION_REQUIRED',
    });
    ctx.evidence!.pendingDispositionRecorded = true;
    const result = transitionConnection(value, command('DISCONNECT', value), ctx);
    expect(
      result.ok && [
        result.connection.state,
        result.connection.credential,
        result.connection.authorization,
      ],
    ).toEqual(['DISCONNECTED', null, 'REVOKED']);
    if (!result.ok) throw new Error(result.code);
    expect(
      transitionConnection(
        result.connection,
        command('TEST', result.connection),
        context(result.connection),
        registry(),
      ),
    ).toEqual({ ok: false, code: 'CONNECTION_DISCONNECTED' });
  });
});

describe('delivery fences before an existing domain owner can accept a proposal', () => {
  it('admits a verified current proposal and explicit tombstone without deleting owner records', () => {
    expect(
      guardIntegrationDelivery(
        active(),
        checkpoint(),
        envelope(),
        deliveryContext(),
        fence(),
        registry(),
      ),
    ).toEqual({ ok: true, disposition: 'APPLY_PROPOSAL' });
    expect(
      guardIntegrationDelivery(
        active(),
        checkpoint(),
        { ...envelope(), mutation: 'TOMBSTONE' },
        deliveryContext(),
        fence(),
        registry(),
      ),
    ).toEqual({ ok: true, disposition: 'RECORD_TOMBSTONE' });
    expect(
      guardIntegrationDelivery(
        active(),
        { ...checkpoint(), lastSequence: null },
        { ...envelope(), phase: 'SNAPSHOT', sourceSequence: 10 },
        deliveryContext(),
        fence(),
        registry(),
      ),
    ).toEqual({ ok: true, disposition: 'APPLY_PROPOSAL' });
  });

  it.each([
    ['foreign tenant', { tenantId: otherId }, 'DELIVERY_SCOPE_DENIED'],
    ['foreign location', { locationId: otherId }, 'DELIVERY_SCOPE_DENIED'],
    ['foreign entity fence', { externalId: 'different-record' }, 'DELIVERY_SCOPE_DENIED'],
    ['mapping changed', { mappingVersion: '2.0.0' }, 'DELIVERY_VERSION_CONFLICT'],
    ['snapshot changed', { snapshotId: otherId }, 'DELIVERY_VERSION_CONFLICT'],
    ['stale event', { sourceSequence: 9 }, 'DELIVERY_SEQUENCE_CONFLICT'],
    [
      'snapshot outside boundary',
      { phase: 'SNAPSHOT', sourceSequence: 11 },
      'DELIVERY_SEQUENCE_CONFLICT',
    ],
  ])('denies %s', (_name, changes, code) => {
    expect(
      guardIntegrationDelivery(
        active(),
        checkpoint(),
        { ...envelope(), ...changes },
        deliveryContext(),
        fence(),
        registry(),
      ),
    ).toEqual({ ok: false, code });
  });

  it('checks signature trust, checkpoint concurrency, approval and credential revocation before delivery', () => {
    expect(
      guardIntegrationDelivery(
        active(),
        checkpoint(),
        envelope(),
        deliveryContext(),
        { ...fence(), authenticityVerified: false },
        registry(),
      ),
    ).toEqual({ ok: false, code: 'DELIVERY_UNVERIFIED' });
    expect(
      guardIntegrationDelivery(
        active(),
        checkpoint(),
        envelope(),
        deliveryContext(),
        { ...fence(), expectedCheckpointVersion: 4 },
        registry(),
      ),
    ).toEqual({ ok: false, code: 'DELIVERY_VERSION_CONFLICT' });
    const pending = deliveryContext();
    pending.operationsAllowed = false;
    expect(
      guardIntegrationDelivery(active(), checkpoint(), envelope(), pending, fence(), registry()),
    ).toEqual({ ok: false, code: 'CURRENT_APPROVAL_REQUIRED' });
    const revoked = deliveryContext();
    revoked.credential!.active = false;
    expect(
      guardIntegrationDelivery(active(), checkpoint(), envelope(), revoked, fence(), registry()),
    ).toEqual({ ok: false, code: 'CREDENTIAL_NOT_CURRENT' });
    expect(
      guardIntegrationDelivery(
        { ...active(), state: 'PAUSED' },
        checkpoint(),
        envelope(),
        deliveryContext(),
        fence(),
        registry(),
      ),
    ).toEqual({ ok: false, code: 'CONNECTION_NOT_ACTIVE' });
  });

  it('deduplicates and suppresses origin/causation echoes before any owner proposal', () => {
    expect(
      guardIntegrationDelivery(
        active(),
        checkpoint(),
        envelope(),
        deliveryContext(),
        { ...fence(), seenEventIds: ['delivery-1'] },
        registry(),
      ),
    ).toEqual({ ok: true, disposition: 'IGNORE_DUPLICATE' });
    expect(
      guardIntegrationDelivery(
        active(),
        checkpoint(),
        { ...envelope(), origin: 'NEXG' },
        deliveryContext(),
        fence(),
        registry(),
      ),
    ).toEqual({ ok: true, disposition: 'IGNORE_ECHO' });
    expect(
      guardIntegrationDelivery(
        active(),
        checkpoint(),
        { ...envelope(), causationOperationId: operationId },
        deliveryContext(),
        { ...fence(), locallyIssuedOperationIds: [operationId] },
        registry(),
      ),
    ).toEqual({ ok: true, disposition: 'IGNORE_ECHO' });
  });

  it('reconciles opaque ordering and fences resurrection even when a newer timestamp or sequence arrives', () => {
    expect(
      guardIntegrationDelivery(
        active(),
        checkpoint(),
        { ...envelope(), sourceSequence: null },
        deliveryContext(),
        fence(),
        registry(),
      ),
    ).toEqual({ ok: true, disposition: 'RECONCILE' });
    const unordered = manifest();
    unordered.ordering = 'RECONCILE_BEFORE_APPLY';
    expect(
      guardIntegrationDelivery(
        active(),
        checkpoint(),
        envelope(),
        deliveryContext(),
        fence(),
        registry(unordered),
      ),
    ).toEqual({ ok: true, disposition: 'RECONCILE' });
    expect(
      guardIntegrationDelivery(
        active(),
        checkpoint(),
        envelope(),
        deliveryContext(),
        { ...fence(), tombstoneSequence: 10 },
        registry(),
      ),
    ).toEqual({ ok: false, code: 'DELETION_FENCE_REQUIRES_RECONCILIATION' });
  });
});
