/**
 * The owner's merchant onboarding template (common fields plus the Part F
 * category addenda), as rpc_merchant_onboarding_read returns it, and the same
 * checks the database makes, so the form can say what is wrong before saving.
 * The database (merchant_onboarding_field) is the source of truth.
 */

export type OnboardingFieldType = 'text' | 'long_text' | 'date' | 'yes_no' | 'select' | 'rows';
export type OnboardingSection = 'business' | 'owner' | 'payout' | 'policies' | 'compliance';

export interface OnboardingColumn {
  key: string;
  label: string;
  type: 'text' | 'date';
  pattern?: string;
  future_date?: boolean;
  placeholder?: string;
}

export interface OnboardingField {
  key: string;
  section: OnboardingSection;
  label: string;
  hint: string | null;
  type: OnboardingFieldType;
  options: { value: string; label: string }[];
  columns: OnboardingColumn[];
  pattern: string | null;
  placeholder: string | null;
  required: 'yes' | 'no' | 'conditional';
  required_when: { field: string; equals: string } | null;
  must_be_yes: boolean;
  future_date: boolean;
  source: string;
}

export type OnboardingRow = Record<string, string>;
export type OnboardingValue = string | OnboardingRow[];
export type OnboardingAnswers = Record<string, OnboardingValue>;

export interface OnboardingDetails {
  category: string | null;
  fields: OnboardingField[];
  answers: OnboardingAnswers;
  missing: { key: string; label: string }[];
  updated_at: string | null;
}

export const ONBOARDING_SECTIONS: { key: OnboardingSection; title: string }[] = [
  { key: 'business', title: 'Business' },
  { key: 'owner', title: 'Owner or director' },
  { key: 'compliance', title: 'Licences and compliance' },
  { key: 'payout', title: 'Payout' },
  { key: 'policies', title: 'Policies' },
];

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const TYPES: OnboardingFieldType[] = ['text', 'long_text', 'date', 'yes_no', 'select', 'rows'];
const SECTIONS: OnboardingSection[] = ['business', 'owner', 'payout', 'policies', 'compliance'];

function parseField(raw: unknown): OnboardingField | null {
  const f = obj(raw);
  const key = str(f.key);
  const label = str(f.label);
  const type = TYPES.find((t) => t === f.type);
  const section = SECTIONS.find((s) => s === f.section) ?? 'compliance';
  if (!key || !label || !type) return null;
  const when = obj(f.required_when);
  return {
    key,
    section,
    label,
    hint: str(f.hint),
    type,
    options: (Array.isArray(f.options) ? f.options : [])
      .map((o) => ({ value: str(obj(o).value) ?? '', label: str(obj(o).label) ?? '' }))
      .filter((o) => o.value),
    columns: (Array.isArray(f.columns) ? f.columns : [])
      .map((c): OnboardingColumn | null => {
        const col = obj(c);
        const k = str(col.key);
        if (!k) return null;
        return {
          key: k,
          label: str(col.label) ?? k,
          type: col.type === 'date' ? 'date' : 'text',
          ...(str(col.pattern) ? { pattern: str(col.pattern)! } : {}),
          ...(col.future_date === true ? { future_date: true } : {}),
          ...(str(col.placeholder) ? { placeholder: str(col.placeholder)! } : {}),
        };
      })
      .filter((c): c is OnboardingColumn => c !== null),
    pattern: str(f.pattern),
    placeholder: str(f.placeholder),
    required: f.required === 'yes' || f.required === 'conditional' ? f.required : 'no',
    required_when:
      str(when.field) && str(when.equals)
        ? { field: str(when.field)!, equals: str(when.equals)! }
        : null,
    must_be_yes: f.must_be_yes === true,
    future_date: f.future_date === true,
    source: str(f.source) ?? '',
  };
}

function parseAnswers(raw: unknown): OnboardingAnswers {
  const out: OnboardingAnswers = {};
  for (const [key, value] of Object.entries(obj(raw))) {
    if (typeof value === 'string') out[key] = value;
    else if (Array.isArray(value))
      out[key] = value.map((row) =>
        Object.fromEntries(
          Object.entries(obj(row)).map(([k, v]) => [k, typeof v === 'string' ? v : '']),
        ),
      );
  }
  return out;
}

export function parseOnboardingDetails(data: unknown): OnboardingDetails {
  const d = obj(data);
  return {
    category: str(d.category),
    fields: (Array.isArray(d.fields) ? d.fields : [])
      .map(parseField)
      .filter((f): f is OnboardingField => f !== null),
    answers: parseAnswers(d.answers),
    missing: (Array.isArray(d.missing) ? d.missing : [])
      .map((m) => ({ key: str(obj(m).key) ?? '', label: str(obj(m).label) ?? '' }))
      .filter((m) => m.key),
    updated_at: str(d.updated_at),
  };
}

/** A conditional field shows only once the question it hangs off is answered that way. */
export function isFieldShown(field: OnboardingField, answers: OnboardingAnswers): boolean {
  if (field.required !== 'conditional' || !field.required_when) return true;
  return answers[field.required_when.field] === field.required_when.equals;
}

export function isFieldRequired(field: OnboardingField, answers: OnboardingAnswers): boolean {
  return (
    field.required === 'yes' || (field.required === 'conditional' && isFieldShown(field, answers))
  );
}

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function dateError(value: string, future: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'needs a date';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return 'needs a real date';
  if (value < '1990-01-01' || value > '2100-12-31') return 'needs a real date';
  if (future && value < today()) return 'has passed; renew it before you continue';
  return null;
}

function matches(pattern: string | null | undefined, value: string): boolean {
  if (!pattern) return true;
  try {
    return new RegExp(pattern, 'i').test(value);
  } catch {
    return true;
  }
}

/** Why a value is not acceptable for its field, or null: the database's own checks. */
export function onboardingValueError(
  field: OnboardingField,
  value: OnboardingValue | undefined,
): string | null {
  if (field.type === 'rows') {
    if (!Array.isArray(value) || value.length === 0) return 'needs at least one row';
    if (value.length > 50) return 'can have at most 50 rows';
    for (const [i, row] of value.entries())
      for (const col of field.columns) {
        const v = (row[col.key] ?? '').trim();
        const err =
          col.type === 'date'
            ? dateError(v, col.future_date === true)
            : v.length < 2 || v.length > 200
              ? 'is missing'
              : !matches(col.pattern, v)
                ? 'is not in the expected format'
                : null;
        if (err) return `row ${i + 1}: ${col.label} ${err}`;
      }
    return null;
  }
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return 'is missing';
  switch (field.type) {
    case 'text':
    case 'long_text':
      if (v.length < 2) return 'is too short';
      if (v.length > (field.type === 'text' ? 200 : 2000)) return 'is too long';
      return matches(field.pattern, v) ? null : 'is not in the expected format';
    case 'date':
      return dateError(v, field.future_date);
    case 'yes_no':
      return v === 'yes' || v === 'no' ? null : 'needs Yes or No';
    case 'select':
      return field.options.some((o) => o.value === v) ? null : 'needs one of the listed options';
  }
  return null;
}

const empty = (value: OnboardingValue | undefined) =>
  value === undefined || (typeof value === 'string' ? value.trim() === '' : value.length === 0);

/** The first problem with the answers, as "Label: problem", or null when they are complete. */
export function onboardingProblems(
  fields: OnboardingField[],
  answers: OnboardingAnswers,
): { key: string; message: string }[] {
  const problems: { key: string; message: string }[] = [];
  for (const field of fields) {
    if (!isFieldShown(field, answers)) continue;
    const value = answers[field.key];
    if (empty(value)) {
      if (isFieldRequired(field, answers))
        problems.push({ key: field.key, message: `${field.label}: is missing` });
      continue;
    }
    const err = onboardingValueError(field, value);
    if (err) problems.push({ key: field.key, message: `${field.label}: ${err}` });
    else if (field.must_be_yes && isFieldRequired(field, answers) && value !== 'yes')
      problems.push({ key: field.key, message: `${field.label}: needs Yes to continue` });
  }
  return problems;
}

/**
 * What to send to rpc_merchant_onboarding_save: every field of the category,
 * trimmed, with hidden conditional fields and (for a quiet draft save)
 * invalid values cleared rather than refused.
 */
export function onboardingAnswersToSave(
  fields: OnboardingField[],
  answers: OnboardingAnswers,
  { dropInvalid = false }: { dropInvalid?: boolean } = {},
): Record<string, OnboardingValue | null> {
  const out: Record<string, OnboardingValue | null> = {};
  for (const field of fields) {
    const value = answers[field.key];
    if (!isFieldShown(field, answers) || empty(value)) {
      out[field.key] = null;
      continue;
    }
    if (dropInvalid && onboardingValueError(field, value)) continue;
    out[field.key] =
      typeof value === 'string'
        ? value.trim()
        : value!.map((row) =>
            Object.fromEntries(field.columns.map((c) => [c.key, (row[c.key] ?? '').trim()])),
          );
  }
  return out;
}

/** An answer as staff read it. */
export function onboardingDisplay(field: OnboardingField, value: OnboardingValue | undefined) {
  if (value === undefined || (typeof value === 'string' && !value)) return null;
  if (typeof value !== 'string') return null;
  if (field.type === 'yes_no') return value === 'yes' ? 'Yes' : value === 'no' ? 'No' : value;
  if (field.type === 'select') return field.options.find((o) => o.value === value)?.label ?? value;
  return value;
}

/** True when a date answer has passed or falls within `days` days. */
export function expiresSoon(value: string, days = 30): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  return value <= limit.toISOString().slice(0, 10);
}
