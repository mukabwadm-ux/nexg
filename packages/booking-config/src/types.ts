export const BOOKING_MODELS = [
  'ORDER',
  'APPOINTMENT',
  'FIELD_VISIT',
  'ASSET_INTERVAL',
  'TRANSFER',
  'SESSION_CAPACITY',
  'SPACE_RESERVATION',
  'TOUR',
  'PRODUCTION_DUE',
  'REQUEST_QUOTE',
  'LINKED_WINDOWS',
  'SERVICE_JOB',
  'ENTITLEMENT',
  'FREIGHT',
  'STORAGE',
] as const;
export type BookingModel = (typeof BOOKING_MODELS)[number];
export type JSONSchema = Record<string, unknown>;
export type AnswerScope = {
  businessId?: string;
  activityId?: string;
  offeringId?: string;
  locationId?: string;
  resourceId?: string;
  sessionId?: string;
  poolId?: string;
};
export type ScopedAnswer = { questionId: string; value: unknown; scope?: AnswerScope };
export type ConfigIssue = {
  code: string;
  message: string;
  severity: 'required' | 'clarification' | 'invalid';
  questionId?: string;
  field?: string;
};
export type AuthorityMode =
  | 'NEXG_AUTHORITATIVE'
  | 'EXTERNAL_AUTHORITATIVE'
  | 'SHARED_WITH_RULES'
  | 'READ_ONLY_EXTERNAL';
export type AuthorityBinding = {
  data_class: string;
  authority: AuthorityMode;
  owner_reference: string;
  scope?: Record<string, string>;
  shared_rule_reference?: string | null;
};
export type BookingResourceFact = {
  id: string;
  active: boolean;
  kind?: string;
  locationId?: string;
  capacity?: number;
  capacityUnit?: string;
  quantityScale?: number;
  capacityMode?: 'per-reservation' | 'per-guest';
  hasSchedule?: boolean;
};
export type ReservationFeePolicy = {
  mode: 'no_fee' | 'fixed' | 'percentage';
  amountMinor?: number;
  percentageBps?: number;
  treatment: 'applied_in_addition' | 'credited_to_total';
  requiredBeforeConfirmation: boolean;
  refundTerms: string;
};
export type BookingOfferingFact = {
  id?: string;
  model: BookingModel;
  kind?: string;
  method?: string;
  name?: string;
  priceMinor?: number;
  currency?: 'KES';
  active?: boolean;
  durationMinutes?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  resourceIds?: string[];
  capacity?: number;
  capacityUnit?: string;
  intakeMode?: string;
  bookingEnabled?: boolean;
  authority?: AuthorityBinding[];
  leadTimeMinutes?: number;
  horizonDays?: number;
  buffers?: { beforeMinutes: number; afterMinutes: number; turnaroundMinutes?: number };
  serviceAreaConfigured?: boolean;
  travelConfigured?: boolean;
  policy?: { paymentPolicyId?: string; changePolicyId?: string; version?: number };
  reservationFee?: ReservationFeePolicy;
  /** Actual server-loaded typed setup; raw onboarding text is not inventory. */
  specialistSetup?: import('./specialists').SpecialistSetup | unknown;
};
export type ResolveBookingInput = {
  subcategoryId: string;
  answers?: Record<string, unknown>;
  operationalAnswers?: Record<string, unknown>;
  bookingSetup?: Record<string, unknown>;
  canonicalAnswers?: Record<string, unknown>;
  answerRecords?: ScopedAnswer[];
  scope?: AnswerScope;
  inheritTemplateAnswers?: boolean;
  offering?: BookingOfferingFact;
  resources?: BookingResourceFact[];
  authority?: AuthorityBinding[];
  offeringModel?: BookingModel;
  selectedMethod?: string;
  selectedOfferingKind?: string;
  selectedDriverOption?: string;
  acceptedScopeConfirmed?: boolean;
};
export type BookingVocabulary = {
  workSingular?: string;
  offeringSingular?: string;
  memberOrCustomer?: string;
  terminologyRule?: string;
};
export type BookingProfileSummary = {
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  name: string;
  defaultModelId: BookingModel;
  candidateModels: BookingModel[];
  specialtyNeeds: string;
  vocabulary: BookingVocabulary;
};
export type BookingQuestion = {
  id: string;
  key: string;
  label: string;
  canonicalTarget: string;
  schema: JSONSchema;
  scope: string;
  required: boolean;
  value?: unknown;
};
export type WorkflowBinding = {
  modelId: BookingModel;
  workflowId: string;
  variantId: string | null;
  linkedExecution: boolean;
  createsWork: false;
};
export type ResolvedBookingConfiguration = {
  subcategoryId: string;
  categoryId: string;
  candidateModels: BookingModel[];
  models: BookingModel[];
  activeModels: BookingModel[];
  primaryModel: BookingModel | null;
  workflowBindings: WorkflowBinding[];
  missingInputs: ConfigIssue[];
  clarifications: ConfigIssue[];
  invalidInputs: ConfigIssue[];
  normalizedAnswers: Record<string, unknown>;
  sourceAnswers: ScopedAnswer[];
  componentValues: Record<string, unknown>;
  attributes: Record<string, unknown>;
  matchedRules: string[];
  pendingRules: string[];
  needsScheduling: boolean;
  isReady: boolean;
  canConfirmNative: boolean;
  status: 'SETUP_REQUIRED' | 'CLARIFICATION_REQUIRED' | 'CONFIGURED';
  timezone: 'Africa/Nairobi';
  currency: 'KES';
  vocabulary: BookingVocabulary;
  configurationRevision: string;
  registryRevision: string;
  createsWork: false;
};
export type Predicate =
  | { all: Predicate[] }
  | { any: Predicate[] }
  | {
      path: string;
      op: 'eq' | 'neq' | 'in' | 'contains' | 'intersects' | 'exists' | 'nonempty';
      value?: unknown;
      questionId?: string;
    };
export type QuestionDefinition = {
  id: string;
  key: string;
  label: string;
  canonicalTarget: string;
  schema: JSONSchema;
  sourceSchema?: JSONSchema;
  normalization?: { booleanMapping?: Record<string, boolean>; [key: string]: unknown };
  origin: string;
  captureMode: string;
  captureScope: string;
  applicability?: { bookingModelIds?: string[]; subcategoryIds?: string[]; [key: string]: unknown };
  visibleWhen: Predicate;
  requiredWhen: Predicate;
  semanticValidators: string[];
};
export type ProfileDefinition = {
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  name: string;
  sourceWorkflowId: string;
  defaultModelId: BookingModel;
  sourceQuestionIds: string[];
  sourceQuestionKeys: string[];
  candidateModelIds: BookingModel[];
  enablementGuard: Predicate;
  bindings: {
    modelId: BookingModel;
    condition: Predicate;
    requiredQuestionIds: string[];
    composition?: string;
  }[];
  rules: {
    id: string;
    condition: Predicate;
    requiredQuestionIds: string[];
    effects: {
      addModels?: BookingModel[];
      suppressModels?: BookingModel[];
      replacePrimaryModel?: BookingModel | null;
      setAttributes?: Record<string, unknown>;
      clarification?: string | null;
    };
  }[];
  specialtyNeeds: string;
  vocabulary: BookingVocabulary;
};
export type Registry = {
  revision: string;
  timezone: string;
  questions: QuestionDefinition[];
  aliases: {
    sourceQuestionId: string;
    sourceKey: string;
    inputPath: string;
    targetQuestionId: string;
    scope: string;
    mode: string;
  }[];
  componentBridges: {
    sourceQuestionId: string;
    targetQuestionId: string;
    canonicalTarget: string;
    componentPath: string;
    rule: string;
  }[];
  dataClasses: (string | { id: string })[];
  models: {
    id: BookingModel;
    requiredSetup: string[];
    calendar: string;
    reservationDefault: string;
    resources: string[];
    capacityUnit: string;
  }[];
  intakeByModel: Record<BookingModel, { allowedModes: string[]; note: string }>;
  profiles: ProfileDefinition[];
};
