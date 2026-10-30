'use client';

import type { Database, Json } from '@nexg/db';
import { Button } from '@nexg/ui';
import { ImagePlus, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

type CategoryRow = Database['public']['Tables']['category_config']['Row'];
type Requirement = { kind: string; label: string };
type JsonRecord = { [key: string]: Json | undefined };

interface QuestionOption extends JsonRecord {
  value: string;
  label: string;
}

interface QuestionDraft extends JsonRecord {
  key: string;
  label: string;
  type: 'single' | 'multi' | 'text';
  options: QuestionOption[];
  hint: string;
}

interface SubcategoryDraft extends JsonRecord {
  id: string;
  name: string;
  icon: string;
  fields: string[];
  fulfillmentHint: string;
  workflowHint: string;
  defaultWorkflow: string;
  questions?: QuestionDraft[];
}

interface DocumentRuleDraft extends JsonRecord {
  doc: string;
  when: JsonRecord;
}

interface CategoryDraft {
  category: string;
  label: string;
  description: string;
  icon: string;
  card_kind: string;
  eta_style: string;
  color: string;
  bg: string;
  sort: number;
  is_active: boolean;
  featured_eligible: boolean;
  requires_ops_mapping: boolean;
  prep_time_required: boolean;
  image_path: string;
  catalogue_example: {
    name: string;
    description: string;
    pricePlaceholder: string;
    photoHint: string;
  };
  questions: QuestionDraft[];
  subcategories: SubcategoryDraft[];
  extra_doc_rules: DocumentRuleDraft[];
  badge_rules: Json;
}

const labelClass = 'mb-1.5 block text-xs font-bold text-ink';
const inputClass =
  'border-border bg-surface text-ink placeholder:text-muted-light focus:border-gold focus:ring-gold/20 w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-4 disabled:opacity-60';

function isRecord(value: Json | undefined): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readOptions(value: Json | undefined): QuestionOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (!isRecord(option)) return [];
    if (typeof option.value !== 'string' || typeof option.label !== 'string') return [];
    return [{ value: option.value, label: option.label }];
  });
}

function readQuestions(value: Json): QuestionDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    if (typeof raw.key !== 'string' || typeof raw.label !== 'string') return [];
    const type =
      raw.type === 'multi' || raw.type === 'text' || raw.type === 'single' ? raw.type : 'single';
    return [
      {
        ...raw,
        key: raw.key,
        label: raw.label,
        type,
        options: readOptions(raw.options),
        hint: typeof raw.hint === 'string' ? raw.hint : '',
      },
    ];
  });
}

function readSubcategories(value: Json): SubcategoryDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return [];
    const fields = Array.isArray(raw.fields)
      ? raw.fields.filter((field): field is string => typeof field === 'string')
      : [];
    return [
      {
        ...raw,
        id: raw.id,
        name: raw.name,
        icon: typeof raw.icon === 'string' ? raw.icon : '',
        fields,
        fulfillmentHint: typeof raw.fulfillmentHint === 'string' ? raw.fulfillmentHint : '',
        workflowHint: typeof raw.workflowHint === 'string' ? raw.workflowHint : '',
        defaultWorkflow: typeof raw.defaultWorkflow === 'string' ? raw.defaultWorkflow : '',
        ...(Array.isArray(raw.questions) ? { questions: readQuestions(raw.questions) } : {}),
      },
    ];
  });
}

function readRules(value: Json): DocumentRuleDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.doc !== 'string' || !isRecord(raw.when)) return [];
    return [{ ...raw, doc: raw.doc, when: raw.when }];
  });
}

function fromRow(row: CategoryRow): CategoryDraft {
  const example = isRecord(row.catalogue_example) ? row.catalogue_example : {};
  return {
    category: row.category,
    label: row.label,
    description: row.description ?? '',
    icon: row.icon,
    card_kind: row.card_kind,
    eta_style: row.eta_style,
    color: row.color ?? '',
    bg: row.bg ?? '',
    sort: row.sort,
    is_active: row.is_active,
    featured_eligible: row.featured_eligible,
    requires_ops_mapping: row.requires_ops_mapping,
    prep_time_required: row.prep_time_required,
    image_path: row.image_path ?? '',
    catalogue_example: {
      name: typeof example.name === 'string' ? example.name : '',
      description: typeof example.description === 'string' ? example.description : '',
      pricePlaceholder:
        typeof example.pricePlaceholder === 'string' ? example.pricePlaceholder : '',
      photoHint: typeof example.photoHint === 'string' ? example.photoHint : '',
    },
    questions: readQuestions(row.questions),
    subcategories: readSubcategories(row.subcategories),
    extra_doc_rules: readRules(row.extra_doc_rules),
    badge_rules: row.badge_rules,
  };
}

function newCategory(): CategoryDraft {
  return {
    category: '',
    label: '',
    description: '',
    icon: 'Store',
    card_kind: 'products',
    eta_style: 'minutes',
    color: '',
    bg: '',
    sort: 100,
    is_active: true,
    featured_eligible: true,
    requires_ops_mapping: false,
    prep_time_required: false,
    image_path: '',
    catalogue_example: { name: '', description: '', pricePlaceholder: '', photoHint: '' },
    questions: [],
    subcategories: [],
    extra_doc_rules: [],
    badge_rules: {},
  };
}

function makeQuestion(): QuestionDraft {
  return { key: '', label: '', type: 'single', options: [], hint: '' };
}

function makeSubcategory(): SubcategoryDraft {
  return {
    id: '',
    name: '',
    icon: '',
    fields: [],
    fulfillmentHint: '',
    workflowHint: '',
    defaultWorkflow: '',
    questions: [],
  };
}

function makeRule(kind: string): DocumentRuleDraft {
  return { doc: kind, when: { answer_key: '' } };
}

function updateAt<T>(items: T[], index: number, patch: Partial<T>): T[] {
  return items.map((item, current) => (current === index ? { ...item, ...patch } : item));
}

export function CategoryManager({
  categories,
  requirements,
}: {
  categories: CategoryRow[];
  requirements: Requirement[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string | null>(categories[0]?.category ?? null);
  const [draft, setDraft] = React.useState<CategoryDraft | null>(
    categories[0] ? fromRow(categories[0]) : null,
  );
  const [isNew, setIsNew] = React.useState(categories.length === 0);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!selectedId) return;
    const row = categories.find((category) => category.category === selectedId);
    if (row && !isNew) setDraft(fromRow(row));
  }, [categories, selectedId, isNew]);

  const update = (patch: Partial<CategoryDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setMessage('');
    setError('');
  };

  const selectCategory = (category: CategoryRow) => {
    setIsNew(false);
    setSelectedId(category.category);
    setDraft(fromRow(category));
    setMessage('');
    setError('');
  };

  const startNew = () => {
    setIsNew(true);
    setSelectedId(null);
    setDraft(newCategory());
    setMessage('');
    setError('');
  };

  const persist = async (value: CategoryDraft) => {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(value.category)) {
      setError('Use a stable ID with lowercase letters, numbers, and underscores.');
      return false;
    }
    if (!value.label.trim()) {
      setError('Add a display name before saving.');
      return false;
    }

    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error: saveError } = await createClient().rpc('rpc_category_config_save', {
        p_category: value.category,
        p_config: {
          ...value,
          label: value.label.trim(),
          description: value.description.trim(),
          image_path: value.image_path || null,
        } as Json,
      });
      if (saveError) {
        setError(saveError.message);
        return false;
      }

      setIsNew(false);
      setSelectedId(value.category);
      setMessage('Category saved. Public pages and in-progress applications now use this setup.');
      router.refresh();
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this category.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file: File) => {
    if (!draft?.category.trim()) {
      setError('Enter and save the category ID before uploading its image.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Choose an image smaller than 5 MB.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');
    try {
      const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
      const path = `${draft.category}/${crypto.randomUUID()}-${filename}`;
      const client = createClient();
      const { error: uploadError } = await client.storage
        .from('category-images')
        .upload(path, file, { contentType: file.type, cacheControl: '31536000' });
      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      const next = { ...draft, image_path: path };
      setDraft(next);
      const saved = await persist(next);
      if (saved) setMessage('Image updated and published to category pages.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload the image.');
    } finally {
      setBusy(false);
    }
  };

  const publicImage = draft?.image_path
    ? createClient().storage.from('category-images').getPublicUrl(draft.image_path).data.publicUrl
    : null;

  if (!draft) return null;

  return (
    <div className="grid gap-6 xl:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold">Category list</h2>
          <Button size="sm" variant="outline" onClick={startNew}>
            <Plus className="mr-1.5 h-4 w-4" />
            New
          </Button>
        </div>
        <div className="divide-border border-border overflow-hidden rounded-xl border bg-surface">
          {categories.length === 0 ? (
            <p className="text-muted-light px-4 py-5 text-sm">No categories have been configured.</p>
          ) : (
            categories.map((category) => (
              <button
                key={category.category}
                type="button"
                onClick={() => selectCategory(category)}
                aria-current={selectedId === category.category && !isNew ? 'true' : undefined}
                className={`border-border flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left last:border-0 ${
                  selectedId === category.category && !isNew
                    ? 'bg-gold/10 text-ink'
                    : 'text-ink hover:bg-bg'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{category.label}</span>
                  <span className="text-muted-light mt-0.5 block truncate text-[0.6875rem]">
                    {category.category}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[0.625rem] font-bold ${
                    category.is_active ? 'bg-success-bg text-success' : 'bg-bg text-muted-light'
                  }`}
                >
                  {category.is_active ? 'Active' : 'Archived'}
                </span>
              </button>
            ))
          )}
        </div>
        <p className="text-muted-light mt-3 text-xs leading-relaxed">
          Categories are archived, not erased, so merchants already using one keep their history.
        </p>
      </aside>

      <section className="min-w-0 rounded-xl border border-border bg-surface">
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-base font-extrabold">{isNew ? 'Create category' : draft.label}</h2>
            <p className="text-muted-light mt-1 text-xs">
              Configuration changes apply to new and in-progress applications.
            </p>
          </div>
          <Button loading={busy} onClick={() => void persist(draft)}>
            <Save className="mr-2 h-4 w-4" />
            Save category
          </Button>
        </div>

        <div className="space-y-8 p-5">
          {error && (
            <p role="alert" className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="rounded-lg border border-success/30 bg-success-bg px-4 py-3 text-sm text-success">
              {message}
            </p>
          )}

          <section aria-labelledby="basics-heading">
            <h3 id="basics-heading" className="mb-4 text-sm font-extrabold">
              Category details
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Stable category ID">
                <input
                  className={inputClass}
                  value={draft.category}
                  disabled={!isNew || busy}
                  onChange={(event) => update({ category: event.target.value })}
                  placeholder="for example, home_services"
                  autoComplete="off"
                />
              </Field>
              <Field label="Display name">
                <input
                  className={inputClass}
                  value={draft.label}
                  disabled={busy}
                  onChange={(event) => update({ label: event.target.value })}
                  placeholder="Home Services"
                />
              </Field>
              <Field label="Description">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={draft.description}
                  disabled={busy}
                  onChange={(event) => update({ description: event.target.value })}
                  placeholder="What customers can find in this category"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Icon name">
                  <input
                    className={inputClass}
                    value={draft.icon}
                    disabled={busy}
                    onChange={(event) => update({ icon: event.target.value })}
                    placeholder="Store"
                  />
                </Field>
                <Field label="Display order">
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    value={draft.sort}
                    disabled={busy}
                    onChange={(event) => update({ sort: Number(event.target.value) })}
                  />
                </Field>
              </div>
              <Field label="Catalogue style">
                <select
                  className={inputClass}
                  value={draft.card_kind}
                  disabled={busy}
                  onChange={(event) => update({ card_kind: event.target.value })}
                >
                  <option value="products">Products</option>
                  <option value="services">Services</option>
                  <option value="menu">Menu</option>
                </select>
              </Field>
              <Field label="Customer-facing timing">
                <select
                  className={inputClass}
                  value={draft.eta_style}
                  disabled={busy}
                  onChange={(event) => update({ eta_style: event.target.value })}
                >
                  <option value="minutes">Minutes</option>
                  <option value="turnaround">Turnaround</option>
                </select>
              </Field>
              <Field label="Category colour">
                <input
                  className={inputClass}
                  value={draft.color}
                  disabled={busy}
                  onChange={(event) => update({ color: event.target.value })}
                  placeholder="#7c3aed"
                />
              </Field>
              <Field label="Category background">
                <input
                  className={inputClass}
                  value={draft.bg}
                  disabled={busy}
                  onChange={(event) => update({ bg: event.target.value })}
                  placeholder="#f5f3ff"
                />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
              <Toggle
                label={draft.is_active ? 'Category is active' : 'Category is archived'}
                checked={draft.is_active}
                disabled={busy}
                onChange={(is_active) => update({ is_active })}
              />
              <Toggle
                label="Eligible for featured placement"
                checked={draft.featured_eligible}
                disabled={busy}
                onChange={(featured_eligible) => update({ featured_eligible })}
              />
              <Toggle
                label="Requires operations mapping"
                checked={draft.requires_ops_mapping}
                disabled={busy}
                onChange={(requires_ops_mapping) => update({ requires_ops_mapping })}
              />
              <Toggle
                label="Requires preparation time"
                checked={draft.prep_time_required}
                disabled={busy}
                onChange={(prep_time_required) => update({ prep_time_required })}
              />
            </div>
          </section>

          <section aria-labelledby="image-heading" className="border-border border-t pt-6">
            <h3 id="image-heading" className="mb-3 text-sm font-extrabold">
              Category image
            </h3>
            <div className="flex flex-wrap items-center gap-4">
              {publicImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- Supabase public category image
                <img
                  src={publicImage}
                  alt={`${draft.label || 'Category'} preview`}
                  className="h-24 w-32 rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="flex h-24 w-32 items-center justify-center rounded-lg border border-dashed border-border text-muted-light">
                  <ImagePlus className="h-6 w-6" aria-hidden="true" />
                </div>
              )}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                    event.currentTarget.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  loading={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus className="mr-2 h-4 w-4" />
                  {draft.image_path ? 'Replace image' : 'Upload image'}
                </Button>
                <p className="text-muted-light mt-2 max-w-sm text-xs">
                  JPG, PNG, or WebP up to 5 MB. Uploading publishes the image immediately.
                </p>
              </div>
            </div>
          </section>

          <section aria-labelledby="catalogue-heading" className="border-border border-t pt-6">
            <h3 id="catalogue-heading" className="mb-1 text-sm font-extrabold">
              Catalogue examples
            </h3>
            <p className="text-muted-light mb-4 text-xs">
              Shown as category-relevant guidance when a merchant adds their first products.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Example item name">
                <input
                  className={inputClass}
                  value={draft.catalogue_example.name}
                  disabled={busy}
                  onChange={(event) =>
                    update({
                      catalogue_example: { ...draft.catalogue_example, name: event.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Price placeholder">
                <input
                  className={inputClass}
                  value={draft.catalogue_example.pricePlaceholder}
                  disabled={busy}
                  onChange={(event) =>
                    update({
                      catalogue_example: {
                        ...draft.catalogue_example,
                        pricePlaceholder: event.target.value,
                      },
                    })
                  }
                  placeholder="KES 1,200"
                />
              </Field>
              <Field label="Example description">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={draft.catalogue_example.description}
                  disabled={busy}
                  onChange={(event) =>
                    update({
                      catalogue_example: {
                        ...draft.catalogue_example,
                        description: event.target.value,
                      },
                    })
                  }
                />
              </Field>
              <Field label="Photo guidance">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={draft.catalogue_example.photoHint}
                  disabled={busy}
                  onChange={(event) =>
                    update({
                      catalogue_example: {
                        ...draft.catalogue_example,
                        photoHint: event.target.value,
                      },
                    })
                  }
                />
              </Field>
            </div>
          </section>

          <section aria-labelledby="questions-heading" className="border-border border-t pt-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 id="questions-heading" className="text-sm font-extrabold">
                  Onboarding questions
                </h3>
                <p className="text-muted-light mt-1 text-xs">
                  Answers are stored on the application and may drive document requirements.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => update({ questions: [...draft.questions, makeQuestion()] })}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add question
              </Button>
            </div>
            <QuestionList
              questions={draft.questions}
              disabled={busy}
              onChange={(questions) => update({ questions })}
            />
          </section>

          <section aria-labelledby="subcategories-heading" className="border-border border-t pt-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 id="subcategories-heading" className="text-sm font-extrabold">
                  Subcategories
                </h3>
                <p className="text-muted-light mt-1 text-xs">
                  Each specialty can have its own required answers and fulfilment details.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  update({ subcategories: [...draft.subcategories, makeSubcategory()] })
                }
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add subcategory
              </Button>
            </div>
            <SubcategoryList
              subcategories={draft.subcategories}
              disabled={busy}
              onChange={(subcategories) => update({ subcategories })}
            />
          </section>

          <section aria-labelledby="documents-heading" className="border-border border-t pt-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 id="documents-heading" className="text-sm font-extrabold">
                  Conditional document requirements
                </h3>
                <p className="text-muted-light mt-1 text-xs">
                  Choose an existing document and require it when an answer matches a value.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || requirements.length === 0}
                onClick={() =>
                  update({
                    extra_doc_rules: [
                      ...draft.extra_doc_rules,
                      makeRule(requirements[0]?.kind ?? ''),
                    ],
                  })
                }
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add requirement
              </Button>
            </div>
            {requirements.length === 0 ? (
              <p className="text-muted-light text-sm">
                There are no required merchant documents to attach yet.
              </p>
            ) : (
              <DocumentRuleList
                rules={draft.extra_doc_rules}
                requirements={requirements}
                disabled={busy}
                onChange={(extra_doc_rules) => update({ extra_doc_rules })}
              />
            )}
          </section>

          <div className="border-border flex justify-end border-t pt-5">
            <Button loading={busy} onClick={() => void persist(draft)}>
              <Save className="mr-2 h-4 w-4" />
              Save category
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-gold h-4 w-4 rounded border-border"
      />
      {label}
    </label>
  );
}

function QuestionList({
  questions,
  disabled,
  onChange,
}: {
  questions: QuestionDraft[];
  disabled: boolean;
  onChange: (questions: QuestionDraft[]) => void;
}) {
  if (!questions.length) {
    return <p className="text-muted-light text-sm">No category-level questions configured.</p>;
  }
  return (
    <div className="divide-border border-border divide-y rounded-lg border">
      {questions.map((question, index) => (
        <fieldset key={`${question.key}-${index}`} className="grid gap-3 p-4 sm:grid-cols-2">
          <legend className="sr-only">Question {index + 1}</legend>
          <Field label="Answer key">
            <input
              className={inputClass}
              value={question.key}
              disabled={disabled}
              onChange={(event) => onChange(updateAt(questions, index, { key: event.target.value }))}
              placeholder="business_type"
            />
          </Field>
          <Field label="Question text">
            <input
              className={inputClass}
              value={question.label}
              disabled={disabled}
              onChange={(event) =>
                onChange(updateAt(questions, index, { label: event.target.value }))
              }
              placeholder="What kind of business is this?"
            />
          </Field>
          <Field label="Answer type">
            <select
              className={inputClass}
              value={question.type}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  updateAt(questions, index, {
                    type: event.target.value as QuestionDraft['type'],
                    options: event.target.value === 'text' ? [] : question.options,
                  }),
                )
              }
            >
              <option value="single">Choose one</option>
              <option value="multi">Choose multiple</option>
              <option value="text">Free text</option>
            </select>
          </Field>
          <Field label="Helper text">
            <input
              className={inputClass}
              value={question.hint}
              disabled={disabled}
              onChange={(event) => onChange(updateAt(questions, index, { hint: event.target.value }))}
            />
          </Field>
          {question.type !== 'text' && (
            <Field label="Options (one per line: value | label)">
              <textarea
                className={inputClass}
                rows={3}
                value={question.options.map((option) => `${option.value} | ${option.label}`).join('\n')}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    updateAt(questions, index, {
                      options: event.target.value
                        .split('\n')
                        .map((line) => line.split('|').map((part) => part.trim()))
                        .filter(([value, label]) => !!value && !!label)
                        .map(([value, label]) => ({ value: value!, label: label! })),
                    }),
                  )
                }
                placeholder={'wash_fold | Wash and fold\nalterations | Alterations'}
              />
            </Field>
          )}
          <div className="flex items-end justify-end">
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange(questions.filter((_, current) => current !== index))}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Remove question
            </Button>
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function SubcategoryList({
  subcategories,
  disabled,
  onChange,
}: {
  subcategories: SubcategoryDraft[];
  disabled: boolean;
  onChange: (subcategories: SubcategoryDraft[]) => void;
}) {
  if (!subcategories.length) {
    return <p className="text-muted-light text-sm">No subcategories configured.</p>;
  }
  return (
    <div className="space-y-4">
      {subcategories.map((subcategory, index) => (
        <fieldset key={`${subcategory.id}-${index}`} className="rounded-lg border border-border p-4">
          <legend className="sr-only">Subcategory {index + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Stable ID">
              <input
                className={inputClass}
                value={subcategory.id}
                disabled={disabled}
                onChange={(event) =>
                  onChange(updateAt(subcategories, index, { id: event.target.value }))
                }
                placeholder="adult_products"
              />
            </Field>
            <Field label="Display name">
              <input
                className={inputClass}
                value={subcategory.name}
                disabled={disabled}
                onChange={(event) =>
                  onChange(updateAt(subcategories, index, { name: event.target.value }))
                }
                placeholder="Adult products"
              />
            </Field>
            <Field label="Icon name">
              <input
                className={inputClass}
                value={subcategory.icon}
                disabled={disabled}
                onChange={(event) =>
                  onChange(updateAt(subcategories, index, { icon: event.target.value }))
                }
                placeholder="ShieldAlert"
              />
            </Field>
            <Field label="Legacy setup keys (comma-separated)">
              <input
                className={inputClass}
                value={subcategory.fields.join(', ')}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    updateAt(subcategories, index, {
                      fields: event.target.value
                        .split(',')
                        .map((field) => field.trim())
                        .filter(Boolean),
                    }),
                  )
                }
                placeholder="age_gate_method, discreet_packaging"
              />
            </Field>
            <Field label="Fulfilment hint">
              <input
                className={inputClass}
                value={subcategory.fulfillmentHint}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    updateAt(subcategories, index, { fulfillmentHint: event.target.value }),
                  )
                }
                placeholder="Discreet handoff; age check where required"
              />
            </Field>
            <Field label="Workflow hint">
              <input
                className={inputClass}
                value={subcategory.workflowHint}
                disabled={disabled}
                onChange={(event) =>
                  onChange(updateAt(subcategories, index, { workflowHint: event.target.value }))
                }
                placeholder="Collect availability before confirming"
              />
            </Field>
            <Field label="Default workflow steps (separate with →)">
              <input
                className={inputClass}
                value={subcategory.defaultWorkflow}
                disabled={disabled}
                onChange={(event) =>
                  onChange(updateAt(subcategories, index, { defaultWorkflow: event.target.value }))
                }
                placeholder="Request → Confirm → Fulfil"
              />
            </Field>
            <div className="flex items-end justify-end">
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onChange(subcategories.filter((_, current) => current !== index))}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Remove subcategory
              </Button>
            </div>
          </div>
          <div className="border-border mt-4 border-t pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-xs font-extrabold">Specialty questions</h4>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  onChange(
                    updateAt(subcategories, index, {
                      questions: [...(subcategory.questions ?? []), makeQuestion()],
                    }),
                  )
                }
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add question
              </Button>
            </div>
            {subcategory.questions?.length ? (
              <QuestionList
                questions={subcategory.questions}
                disabled={disabled}
                onChange={(questions) =>
                  onChange(updateAt(subcategories, index, { questions }))
                }
              />
            ) : (
              <p className="text-muted-light text-xs">
                This specialty currently uses its existing configured setup questions.
              </p>
            )}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function DocumentRuleList({
  rules,
  requirements,
  disabled,
  onChange,
}: {
  rules: DocumentRuleDraft[];
  requirements: Requirement[];
  disabled: boolean;
  onChange: (rules: DocumentRuleDraft[]) => void;
}) {
  if (!rules.length) {
    return <p className="text-muted-light text-sm">No conditional documents configured.</p>;
  }
  return (
    <div className="divide-border border-border divide-y rounded-lg border">
      {rules.map((rule, index) => {
        const condition = Object.entries(rule.when)[0] ?? ['', ''];
        const alwaysApply = Object.keys(rule.when).length === 0;
        return (
          <div key={`${rule.doc}-${index}`} className="grid gap-3 p-4 sm:grid-cols-3">
            <Field label="Document">
              <select
                className={inputClass}
                value={rule.doc}
                disabled={disabled}
                onChange={(event) => onChange(updateAt(rules, index, { doc: event.target.value }))}
              >
                {requirements.map((requirement) => (
                  <option key={requirement.kind} value={requirement.kind}>
                    {requirement.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-center">
              <Toggle
                label="Always require for this category"
                checked={alwaysApply}
                disabled={disabled}
                onChange={(checked) =>
                  onChange(
                    updateAt(rules, index, {
                      when: checked ? {} : { answer_key: '' },
                    }),
                  )
                }
              />
            </div>
            {!alwaysApply && (
              <>
                <Field label="Answer key">
                  <input
                    className={inputClass}
                    value={typeof condition[0] === 'string' ? condition[0] : ''}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(
                        updateAt(rules, index, {
                          when: { [event.target.value]: condition[1] ?? '' },
                        }),
                      )
                    }
                    placeholder="sells_alcohol"
                  />
                </Field>
                <Field label="Matching answer">
                  <input
                    className={inputClass}
                    value={typeof condition[1] === 'string' ? condition[1] : ''}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(
                        updateAt(rules, index, {
                          when: { [condition[0] || 'answer_key']: event.target.value },
                        }),
                      )
                    }
                    placeholder="yes"
                  />
                </Field>
              </>
            )}
            <div className="sm:col-span-3">
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onChange(rules.filter((_, current) => current !== index))}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Remove requirement
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
