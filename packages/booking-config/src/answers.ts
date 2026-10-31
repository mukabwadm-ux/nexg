import {
  canonicalQuestionId,
  questionDefinition,
  questions,
  registry,
  validateSchema,
} from './registry';
import { sameValue } from './predicates';
import type {
  AnswerScope,
  ConfigIssue,
  QuestionDefinition,
  ResolveBookingInput,
  ScopedAnswer,
} from './types';

const scopeKeys = [
  'businessId',
  'activityId',
  'offeringId',
  'locationId',
  'resourceId',
  'sessionId',
  'poolId',
] as const;
const sourceKeys = new Map<string, string>();
for (const question of questions.values()) {
  const namespace =
    question.origin === 'NEW_OPERATIONAL_SETUP'
      ? 'operationalAnswers'
      : question.id.startsWith('BQ_')
        ? 'bookingSetup'
        : 'answers';
  sourceKeys.set(`${namespace}.${question.key}`, question.id);
  if (namespace === 'operationalAnswers')
    sourceKeys.set(`${namespace}.${question.key.toLowerCase()}`, question.id);
}
for (const alias of registry.aliases) sourceKeys.set(alias.inputPath, alias.sourceQuestionId);

function scoped(record: AnswerScope | undefined, target: AnswerScope, inherit: boolean): boolean {
  if (!record) return true;
  for (const key of scopeKeys) {
    if (record[key] !== undefined && record[key] !== target[key]) return false;
    if (!inherit && target[key] !== undefined && record[key] === undefined) return false;
  }
  return true;
}
function issue(
  code: string,
  message: string,
  questionId?: string,
  severity: ConfigIssue['severity'] = 'invalid',
): ConfigIssue {
  return { code, message, questionId, severity };
}
function normalize(question: QuestionDefinition, value: unknown): unknown {
  if (question.schema.type === 'boolean' && typeof value === 'string') {
    const mapping = question.normalization?.booleanMapping;
    if (mapping && Object.hasOwn(mapping, value)) return mapping[value];
  }
  if (question.id === 'Q_CAPACITY_LIMIT' && Number.isSafeInteger(value) && (value as number) > 0) {
    return { quantity_minor: value, scale: 0, unit: 'person' };
  }
  if (question.id === 'Q_DATA_AUTHORITY' && Array.isArray(value)) {
    return value.map((binding) => {
      if (typeof binding !== 'object' || binding === null) return binding;
      const b = binding as Record<string, unknown>;
      return b.data_class === 'payments' ? { ...b, data_class: 'finance.payment' } : binding;
    });
  }
  return value;
}
function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function semanticIssues(questionId: string, value: unknown): string[] {
  const result: string[] = [],
    v = object(value);
  if (!v) return result;
  if (questionId === 'BQ_RANGE_POLICY') {
    const min = object(v.minimum),
      max = object(v.maximum);
    const units: Record<string, number> = { minute: 1, hour: 60, day: 1440, week: 10080 };
    if (min && max && min.unit === max.unit && Number(min.value) > Number(max.value))
      result.push('Minimum period exceeds maximum.');
    if (
      min &&
      max &&
      v.calendar_basis === 'elapsed' &&
      typeof min.unit === 'string' &&
      typeof max.unit === 'string'
    ) {
      if (!units[min.unit] || !units[max.unit])
        result.push('Elapsed periods cannot silently convert calendar months or nights.');
      else if (Number(min.value) * units[min.unit]! > Number(max.value) * units[max.unit]!)
        result.push('Minimum period exceeds maximum.');
    }
    if (min && max && v.calendar_basis === 'local_calendar' && min.unit !== max.unit)
      result.push('Local calendar bounds require matching units and an explicit calendar policy.');
  }
  if (
    questionId === 'BQ_BOOKING_WINDOW' &&
    Number(v.minimum_lead_minutes) > Number(v.maximum_horizon_days) * 1440
  )
    result.push('Lead time exceeds booking horizon.');
  if (
    questionId === 'BQ_PICKUP_RETURN_POLICY' &&
    Number(v.minimum_processing_minutes) > Number(v.maximum_processing_minutes)
  )
    result.push('Minimum processing time exceeds maximum.');
  if (questionId === 'BQ_CAPACITY') {
    const capacity = object(v.capacity);
    if (capacity && Number(capacity.quantity_minor) <= 0)
      result.push('Active capacity must be positive.');
    if (
      typeof v.effective_from === 'string' &&
      typeof v.effective_until === 'string' &&
      Date.parse(v.effective_until) <= Date.parse(v.effective_from)
    )
      result.push('Capacity end must follow its start.');
  }
  if (questionId === 'BQ_RECURRENCE_RULE') {
    if ((v.end_date !== undefined) === (v.count !== undefined))
      result.push('Choose exactly one of recurrence end date or count.');
    if (
      typeof v.start_date === 'string' &&
      typeof v.end_date === 'string' &&
      v.end_date < v.start_date
    )
      result.push('Recurrence end precedes start.');
  }
  if (questionId === 'BQ_SPACE_POLICY') {
    const spaces = Array.isArray(v.spaces)
      ? v.spaces.map(object).filter((x): x is Record<string, unknown> => !!x)
      : [];
    const ids = new Set(spaces.map((s) => s.resource_id));
    if (ids.size !== spaces.length) result.push('Space resource IDs must be unique.');
    for (const space of spaces)
      if (Number(space.minimum_party_size) > Number(space.maximum_party_size))
        result.push('Space minimum party size exceeds maximum.');
    for (const combination of Array.isArray(v.combinations) ? v.combinations : []) {
      const c = object(combination);
      if (!c) continue;
      if (Number(c.minimum_party_size) > Number(c.maximum_party_size))
        result.push('Combination minimum party size exceeds maximum.');
      const resourceIds = Array.isArray(c.resource_ids) ? c.resource_ids : [];
      if (
        new Set(resourceIds).size !== resourceIds.length ||
        resourceIds.some((id) => !ids.has(id))
      )
        result.push('Table combinations must reference distinct configured spaces.');
    }
  }
  if (questionId === 'Q_WEEKLY_SCHEDULE') {
    const weekly = Array.isArray(v.weekly) ? v.weekly : [];
    const dayOffsets: Record<string, number> = {
      mon: 0,
      tue: 1440,
      wed: 2880,
      thu: 4320,
      fri: 5760,
      sat: 7200,
      sun: 8640,
    };
    const days = new Set<string>(),
      spans: { start: number; end: number }[] = [];
    const minutes = (time: unknown) =>
      typeof time === 'string' ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : NaN;
    for (const raw of weekly) {
      const day = object(raw);
      if (!day || typeof day.day !== 'string') continue;
      if (days.has(day.day)) result.push('Each weekday must be configured only once.');
      days.add(day.day);
      for (const rawInterval of Array.isArray(day.intervals) ? day.intervals : []) {
        const interval = object(rawInterval);
        if (!interval) continue;
        const start = minutes(interval.opens),
          end = minutes(interval.closes) + (interval.closes_next_day === true ? 1440 : 0);
        if (!(end > start) || end - start > 1440)
          result.push('Schedule intervals must have positive duration at most 24 hours.');
        else spans.push({ start: dayOffsets[day.day]! + start, end: dayOffsets[day.day]! + end });
      }
    }
    const expanded = [
      ...spans,
      ...spans.map((span) => ({ start: span.start + 10080, end: span.end + 10080 })),
    ].sort((a, b) => a.start - b.start);
    for (let i = 1; i < expanded.length; i++)
      if (expanded[i]!.start < expanded[i - 1]!.end)
        result.push('Resource schedule intervals cannot overlap, including overnight spans.');
    for (const raw of Array.isArray(v.exceptions) ? v.exceptions : []) {
      const exception = object(raw);
      if (
        exception?.closed === true &&
        Array.isArray(exception.intervals) &&
        exception.intervals.length > 0
      )
        result.push('A closed exception cannot also contain opening intervals.');
      if (
        typeof exception?.date === 'string' &&
        typeof exception.end_date === 'string' &&
        exception.end_date < exception.date
      )
        result.push('Exception end date precedes its start.');
    }
  }
  if (questionId === 'BQ_ENTITLEMENT_POLICY') {
    const validity = object(v.validity);
    if (
      typeof validity?.starts_on === 'string' &&
      typeof validity.ends_on === 'string' &&
      validity.ends_on < validity.starts_on
    )
      result.push('Entitlement validity end precedes its start.');
  }
  return result;
}

export function validateBookingAnswer(
  id: string,
  input: unknown,
): { valid: boolean; questionId?: string; value?: unknown; issues: ConfigIssue[] } {
  const question = questionDefinition(id);
  if (!question)
    return { valid: false, issues: [issue('UNKNOWN_QUESTION', 'Question is not registered.', id)] };
  const value = normalize(question, input);
  const errors = [...validateSchema(question, value), ...semanticIssues(question.id, value)];
  if (question.id === 'Q_DATA_AUTHORITY' && Array.isArray(value)) {
    const scopedBindings = new Map<string, unknown>();
    for (const raw of value) {
      const binding = object(raw);
      if (!binding) continue;
      if (binding.authority === 'SHARED_WITH_RULES' && !binding.shared_rule_reference)
        errors.push('Shared authority requires an approved shared rule reference.');
      const scope = object(binding.scope) || {};
      const key = `${String(binding.data_class)}:${JSON.stringify(
        Object.keys(scope)
          .sort()
          .map((k) => [k, scope[k]]),
      )}`;
      if (scopedBindings.has(key) && !sameValue(scopedBindings.get(key), binding))
        errors.push('A data class and scope cannot have conflicting owners.');
      scopedBindings.set(key, binding);
    }
  }
  if (question.id === 'Q_RESOURCE_INVENTORY' && Array.isArray(value)) {
    const ids = value.map((raw) => object(raw)?.resource_id);
    if (new Set(ids).size !== ids.length) errors.push('Resource IDs must be unique in this scope.');
  }
  return {
    valid: errors.length === 0,
    questionId: question.id,
    value,
    issues: errors.map((message) => issue('INVALID_ANSWER', message, question.id)),
  };
}

export function normalizeBookingAnswers(input: ResolveBookingInput): {
  answers: Record<string, unknown>;
  values: Record<string, unknown>;
  issues: ConfigIssue[];
  sources: ScopedAnswer[];
  componentValues: Record<string, unknown>;
} {
  const records: ScopedAnswer[] = [];
  const issues: ConfigIssue[] = [];
  const scope: AnswerScope = {
    ...input.scope,
    activityId: input.scope?.activityId || input.subcategoryId,
    offeringId: input.scope?.offeringId || input.offering?.id,
  };
  for (const namespace of ['answers', 'operationalAnswers', 'bookingSetup'] as const) {
    for (const [key, value] of Object.entries(input[namespace] || {})) {
      const ref = sourceKeys.get(`${namespace}.${key}`);
      if (!ref) {
        issues.push(issue('UNKNOWN_ANSWER', `Unregistered input ${namespace}.${key}.`));
        continue;
      }
      records.push({ questionId: ref, value, scope });
    }
  }
  for (const [ref, value] of Object.entries(input.canonicalAnswers || {}))
    records.push({ questionId: ref, value, scope });
  for (const record of input.answerRecords || [])
    if (scoped(record.scope, scope, input.inheritTemplateAnswers === true)) records.push(record);
  const answers: Record<string, unknown> = Object.create(null),
    values: Record<string, unknown> = Object.create(null);
  const conflictIds = new Set<string>();
  for (const record of records) {
    const id = canonicalQuestionId(record.questionId);
    if (!id) {
      issues.push(issue('UNKNOWN_ANSWER', 'Answer question is not registered.', record.questionId));
      continue;
    }
    if (record.value === undefined || record.value === null) continue;
    const result = validateBookingAnswer(record.questionId, record.value);
    issues.push(...result.issues);
    if (!result.valid) continue;
    if (Object.hasOwn(answers, id) && !sameValue(answers[id], result.value)) {
      conflictIds.add(id);
      issues.push(
        issue(
          'CONFLICTING_ANSWERS',
          'Explicit answers for the same fact and scope disagree. Clarify before publication.',
          id,
          'clarification',
        ),
      );
    } else answers[id] = result.value;
  }
  for (const id of conflictIds) delete answers[id];
  const timezone = answers.Q_LOCATION_TIMEZONE;
  if (timezone !== undefined && timezone !== 'Africa/Nairobi')
    issues.push(
      issue(
        'TIMEZONE_CONFLICT',
        'Scheduling is fixed to Kenya time.',
        'Q_LOCATION_TIMEZONE',
        'clarification',
      ),
    );
  answers.Q_LOCATION_TIMEZONE = 'Africa/Nairobi';
  for (const [id, value] of Object.entries(answers))
    values[questions.get(id)!.canonicalTarget] = value;
  const componentValues: Record<string, unknown> = Object.create(null);
  for (const bridge of registry.componentBridges) {
    const source = answers[bridge.sourceQuestionId];
    if (source === undefined) continue;
    componentValues[bridge.canonicalTarget] = source;
    const target = object(answers[bridge.targetQuestionId]);
    const existing = target?.[bridge.componentPath];
    if (existing !== undefined && !sameValue(existing, source)) {
      issues.push(
        issue(
          'CONFLICTING_COMPONENT',
          'Legacy and structured setup disagree; retain both and clarify.',
          bridge.targetQuestionId,
          'clarification',
        ),
      );
      delete values[questionDefinition(bridge.targetQuestionId)!.canonicalTarget];
      delete answers[bridge.targetQuestionId];
    }
  }
  return { answers, values, issues, sources: records, componentValues };
}
