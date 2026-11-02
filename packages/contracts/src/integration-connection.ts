import { z } from 'zod';

/** Internal adapter contracts. These do not register a provider or grant runtime access. */
const Id = z.string().uuid();
const Key = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_.:-]*$/);
const Version = z
  .string()
  .max(32)
  .regex(/^\d+\.\d+\.\d+$/);
const Revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Scope = z.string().min(1).max(160);
const unique = <T>(values: T[]) => new Set(values).size === values.length;

export const IntegrationDataClass = z.enum([
  'OFFERING_PRICE',
  'STOCK_RESERVATION',
  'SCHEDULE_CAPACITY',
  'WORK_EXECUTION',
  'FULFILMENT',
  'COLLECTION',
  'REFUND',
  'SETTLEMENT',
  'PAYOUT',
  'BUSINESS_CONTACT',
  'METRICS',
]);
export type IntegrationDataClass = z.infer<typeof IntegrationDataClass>;
export const IntegrationAuthority = z.enum([
  'NEXG_AUTHORITATIVE',
  'EXTERNAL_AUTHORITATIVE',
  'SHARED_WITH_RULES',
  'READ_ONLY_EXTERNAL',
]);
export const IntegrationAuthMethod = z.enum(['OAUTH2', 'API_KEY', 'BASIC', 'MTLS']);
export const IntegrationOperation = z
  .object({
    id: Key,
    dataClass: IntegrationDataClass,
    direction: z.enum(['PULL', 'PUSH']),
    effect: z.enum(['READ', 'PROPOSE', 'WRITE', 'RECONCILE']),
    /** Resolve through an existing owning domain; never a table name or an arbitrary URL. */
    ownerOperation: Key,
    platformPermission: Key,
    requiredScopes: z.array(Scope).max(50).refine(unique),
  })
  .strict()
  .superRefine((operation, ctx) => {
    if (operation.effect === 'WRITE' && operation.direction !== 'PUSH') {
      ctx.addIssue({ code: 'custom', message: 'A provider write must declare PUSH direction.' });
    }
  });
export type IntegrationOperation = z.infer<typeof IntegrationOperation>;

export const ConnectorManifest = z
  .object({
    contractVersion: z.literal('1.0.0'),
    providerId: Key,
    adapterVersion: Version,
    dataClasses: z.array(IntegrationDataClass).min(1).max(11).refine(unique),
    authMethods: z.array(IntegrationAuthMethod).min(1).max(4).refine(unique),
    operations: z.array(IntegrationOperation).min(1).max(100),
    supportedMethods: z
      .array(z.enum(['API', 'WEBHOOK', 'POLL', 'FILE']))
      .min(1)
      .max(4)
      .refine(unique),
    rateLimit: z
      .object({
        requestsPerMinute: z.number().int().positive().max(1_000_000),
        concurrency: z.number().int().positive().max(100),
      })
      .strict(),
    pagination: z.enum(['CURSOR', 'PAGE', 'NONE']),
    ordering: z.enum(['MONOTONIC_SEQUENCE', 'RECONCILE_BEFORE_APPLY']),
    webhookVerification: z.enum(['SIGNATURE', 'AUTHENTICATED_CHANNEL', 'UNSUPPORTED']),
    deletion: z.literal('EXPLICIT_TOMBSTONE_ONLY'),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (!unique(manifest.operations.map((operation) => operation.id))) {
      ctx.addIssue({ code: 'custom', message: 'Operation identifiers must be unique.' });
    }
    for (const operation of manifest.operations) {
      if (!manifest.dataClasses.includes(operation.dataClass)) {
        ctx.addIssue({ code: 'custom', message: 'Operation uses an undeclared data class.' });
      }
    }
    if (
      manifest.supportedMethods.includes('WEBHOOK') &&
      manifest.webhookVerification === 'UNSUPPORTED'
    ) {
      ctx.addIssue({ code: 'custom', message: 'Webhook support requires verification.' });
    }
  });
export type ConnectorManifest = z.infer<typeof ConnectorManifest>;

export const ConnectionBinding = z
  .object({
    dataClass: IntegrationDataClass,
    authority: IntegrationAuthority,
    direction: z.enum(['PULL', 'PUSH', 'BOTH']),
    operationIds: z.array(Key).min(1).max(100).refine(unique),
    sharedRuleId: Key.nullable(),
  })
  .strict()
  .superRefine((binding, ctx) => {
    if (binding.authority === 'READ_ONLY_EXTERNAL' && binding.direction !== 'PULL') {
      ctx.addIssue({ code: 'custom', message: 'Read-only data cannot push to the provider.' });
    }
    if (binding.authority === 'SHARED_WITH_RULES' && binding.sharedRuleId === null) {
      ctx.addIssue({ code: 'custom', message: 'Shared authority requires a registered rule.' });
    }
    if (binding.authority !== 'SHARED_WITH_RULES' && binding.sharedRuleId !== null) {
      ctx.addIssue({ code: 'custom', message: 'Shared rules apply only to shared authority.' });
    }
  });
export type ConnectionBinding = z.infer<typeof ConnectionBinding>;

/** UUID references only: raw API keys, passwords, tokens and secret URLs are not fields. */
export const ConnectionCredentialReference = z
  .object({
    secretReferenceId: Id,
    machineCredentialId: Id,
    version: Revision.refine((value) => value > 0),
    authMethod: IntegrationAuthMethod,
  })
  .strict();

export const IntegrationConnection = z
  .object({
    contractVersion: z.literal('1.0.0'),
    id: Id,
    tenantId: Id,
    locationIds: z.array(Id).min(1).max(100).refine(unique),
    providerId: Key,
    /** An opaque account/company identity, never a URL, password or token. */
    externalInstanceId: z.string().min(1).max(160),
    adapterVersion: Version,
    version: Revision,
    approvalRevision: Revision,
    state: z.enum([
      'REQUESTED',
      'TESTED',
      'MAPPED',
      'PREVIEWED',
      'ACTIVE',
      'PAUSED',
      'RECONNECT_REQUIRED',
      'DISCONNECTED',
    ]),
    authorization: z.enum([
      'NOT_CONNECTED',
      'AUTHORIZATION_REQUIRED',
      'AUTHORIZED',
      'EXPIRED',
      'REVOKED',
    ]),
    setup: z.enum(['UNMAPPED', 'VALIDATING', 'READY', 'BLOCKED']),
    synchronization: z.enum([
      'NOT_STARTED',
      'SYNCING',
      'CURRENT',
      'PARTIAL',
      'STALE',
      'FAILED',
      'UNKNOWN',
    ]),
    credential: ConnectionCredentialReference.nullable(),
    bindings: z.array(ConnectionBinding).min(1).max(11),
    mappingVersion: Version.nullable(),
    mappingDigest: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict()
  .superRefine((connection, ctx) => {
    if (!unique(connection.bindings.map((binding) => binding.dataClass))) {
      ctx.addIssue({ code: 'custom', message: 'Declare one authority per data class.' });
    }
    if ((connection.mappingVersion === null) !== (connection.mappingDigest === null)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Mapping version and digest must be declared together.',
      });
    }
  });
export type IntegrationConnection = z.infer<typeof IntegrationConnection>;

const Path = z
  .array(
    z
      .string()
      .min(1)
      .max(80)
      .refine((part) => !['__proto__', 'prototype', 'constructor'].includes(part)),
  )
  .min(1)
  .max(16);
const Rational = z
  .object({
    numerator: z.number().int().positive().max(1_000_000_000),
    denominator: z.number().int().positive().max(1_000_000_000),
  })
  .strict();
const Currency = z.string().regex(/^[A-Z]{3}$/);
export const IntegrationFieldMapping = z
  .object({
    source: Path,
    target: Path,
    transform: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('COPY') }).strict(),
      z
        .object({
          kind: z.literal('ENUM'),
          values: z
            .record(z.string().min(1).max(160), z.string().min(1).max(80))
            .refine((values) => Object.keys(values).length <= 500),
          unknown: z.literal('UNMAPPED'),
        })
        .strict(),
      z
        .object({ kind: z.literal('UNIT'), sourceUnit: Scope, targetUnit: Scope, factor: Rational })
        .strict(),
      z
        .object({
          kind: z.literal('CURRENCY'),
          sourceCurrency: Currency,
          targetCurrency: Currency,
          rate: Rational,
          rateReference: Scope,
          rounding: z.enum(['HALF_UP', 'HALF_EVEN']),
        })
        .strict(),
      z
        .object({
          kind: z.literal('INSTANT'),
          sourceTimeZone: Scope,
          requiresOffset: z.literal(true),
        })
        .strict(),
      z.object({ kind: z.literal('IDENTIFIER'), linkNamespace: Key }).strict(),
    ]),
  })
  .strict();
export const IntegrationMapping = z
  .object({
    contractVersion: z.literal('1.0.0'),
    connectionId: Id,
    version: Version,
    dataClass: IntegrationDataClass,
    fields: z.array(IntegrationFieldMapping).min(1).max(200),
  })
  .strict()
  .refine((mapping) => unique(mapping.fields.map((field) => JSON.stringify(field.target))), {
    message: 'Each target field has one mapping.',
  });

export const ExternalIdentityLink = z
  .object({
    contractVersion: z.literal('1.0.0'),
    connectionId: Id,
    tenantId: Id,
    locationId: Id,
    dataClass: IntegrationDataClass,
    externalEntityType: Key,
    externalId: z.string().min(1).max(240),
    nexgEntityId: Id,
    mappingVersion: Version,
    sourceVersion: z.string().min(1).max(160),
    tombstoned: z.boolean(),
  })
  .strict();

/** An adapter proves this boundary; wall-clock timestamps do not establish ordering. */
export const IntegrationCheckpoint = z
  .object({
    contractVersion: z.literal('1.0.0'),
    connectionId: Id,
    tenantId: Id,
    locationId: Id,
    dataClass: IntegrationDataClass,
    operationId: Key,
    version: Revision,
    adapterVersion: Version,
    mappingVersion: Version,
    snapshotId: Id,
    snapshotUpperSequence: Revision,
    lastSequence: Revision.nullable(),
    cursor: z.string().max(2048).nullable(),
  })
  .strict();
export type IntegrationCheckpoint = z.infer<typeof IntegrationCheckpoint>;

export const IntegrationEnvelope = z
  .object({
    contractVersion: z.literal('1.0.0'),
    connectionId: Id,
    tenantId: Id,
    locationId: Id,
    dataClass: IntegrationDataClass,
    operationId: Key,
    externalEntityType: Key,
    externalId: z.string().min(1).max(240),
    eventId: z.string().min(1).max(240),
    adapterVersion: Version,
    mappingVersion: Version,
    snapshotId: Id,
    phase: z.enum(['SNAPSHOT', 'INCREMENTAL']),
    sourceSequence: Revision.nullable(),
    sourceVersion: z.string().min(1).max(160),
    origin: z.enum(['EXTERNAL', 'NEXG']),
    causationOperationId: Id.nullable(),
    mutation: z.enum(['UPSERT', 'TOMBSTONE']),
    observedAt: z.string().datetime({ offset: true }),
    effectiveAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type IntegrationEnvelope = z.infer<typeof IntegrationEnvelope>;

export function mapIntegrationEnum(
  value: string,
  mapping: Record<string, string>,
): { state: 'MAPPED'; value: string } | { state: 'UNMAPPED'; externalValue: string } {
  return Object.hasOwn(mapping, value)
    ? { state: 'MAPPED', value: mapping[value]! }
    : { state: 'UNMAPPED', externalValue: value };
}
