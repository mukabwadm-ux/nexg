'use client';

import { CalendarDays, Check, Eye, ImagePlus, LockKeyhole, Percent, Plus, X } from 'lucide-react';
import Image from 'next/image';
import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { SchemaField } from '../booking/schema-field';
import type { JsonSchema } from '../booking/types';
import {
  capacityLabel,
  fulfilmentOptions,
  priceLabel,
  discountLabel,
  type Issue,
  type MerchantOfferingConfiguration,
  type Offering,
  type OfferingProfile,
} from './model';
import { schemas, type Field } from './schemas';
import { PresentationAndBundle, QuantityAndChoices, visibilityLabel } from './catalogue-options';

export type EditorTab = 'details' | 'pricing' | 'availability' | 'preview' | 'history';
export function Label({
  title,
  children,
  hint,
}: {
  title: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const control =
    isValidElement(children) &&
    typeof children.type === 'string' &&
    ['input', 'select', 'textarea'].includes(children.type)
      ? cloneElement(children as ReactElement, {
          'aria-labelledby': `${id}-label`,
          'aria-describedby': hint ? `${id}-hint` : undefined,
        })
      : children;
  return (
    <label className="of-field">
      <span id={`${id}-label`}>{title}</span>
      {control}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </label>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`of-status of-status-${value}`}>
      <span aria-hidden="true" />
      {value.charAt(0).toUpperCase() + value.slice(1)}
    </span>
  );
}
export function PriceSummary({ item }: { item: Offering }) {
  const current = priceLabel(item);
  const original = priceLabel({ ...item, discount: undefined });
  return (
    <>
      <span>{current}</span>
      {current !== original && (
        <small className="of-original-price">
          <s>{original}</s> · {discountLabel(item)}
        </small>
      )}
      {item.discount?.enabled && current === original && (
        <small className="of-original-price">{discountLabel(item)}</small>
      )}
    </>
  );
}
function SpecialistField({
  field,
  value,
  onChange,
  error,
}: {
  field: Field;
  value: string | number | undefined;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <Label title={`${field.label}${field.required ? ' *' : ''}`} hint={error ?? field.hint}>
      {field.type === 'textarea' ? (
        <textarea
          aria-invalid={!!error}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
        />
      ) : field.type === 'select' ? (
        <select
          aria-invalid={!!error}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {field.options?.map((v) => <option key={v}>{v}</option>)}
        </select>
      ) : (
        <input
          aria-invalid={!!error}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          type={field.type ?? 'text'}
          min={field.min}
          step={field.type === 'number' ? 1 : undefined}
        />
      )}
    </Label>
  );
}

export function OfferingEditor({
  item,
  profile,
  configuration,
  catalogue,
  tab,
  setTab,
  change,
  issues,
  busy,
  dirty,
  onSave,
  onClose,
  onDuplicate,
  onConnections,
  onReload,
  onAdd,
  setupDraftOnly = false,
  canPublish = false,
  onUploadImage,
  readOnly = false,
}: {
  item: Offering;
  profile: OfferingProfile;
  configuration: MerchantOfferingConfiguration;
  catalogue: Offering[];
  tab: EditorTab;
  setTab: (tab: EditorTab) => void;
  change: (item: Offering) => void;
  issues: Issue[];
  busy: boolean;
  dirty: boolean;
  onSave: (publication?: Offering['publication']) => void;
  onClose: () => void;
  onDuplicate: () => void;
  onConnections: () => void;
  onReload: () => void;
  onAdd: () => void;
  setupDraftOnly?: boolean;
  /* Shows Publish even where saving is otherwise draft-only: the setup
     drawer, whose source publishes through the catalogue item. */
  canPublish?: boolean;
  onUploadImage?: (item: Offering, file: File) => Promise<{ path: string; url: string }>;
  readOnly?: boolean;
}) {
  const schema = schemas[item.schemaId]!;
  const uploadRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  const patch = (update: Partial<Offering>) => {
    if (!readOnly) change({ ...item, ...update });
  };
  const lockedDetails =
    readOnly || item.sources.details === 'external' || item.publication === 'archived';
  const lockedPrice =
    readOnly || item.sources.price === 'external' || item.publication === 'archived';
  const lockedAvailability =
    readOnly || item.sources.availability === 'external' || item.publication === 'archived';
  const fieldIssue = (key: string) => issues.find((issue) => issue.key === key)?.message;
  const allResources = [...new Set([...schema.resources, ...item.resources])];
  async function upload(file?: File) {
    if (!file) return;
    const input = uploadRef.current;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2_000_000) {
      if (input) {
        input.setCustomValidity('Choose a JPG, PNG or WebP smaller than 2 MB.');
        input.reportValidity();
        input.value = '';
      }
      return;
    }
    if (onUploadImage) {
      try {
        const uploaded = await onUploadImage(item, file);
        if (itemRef.current.id === item.id)
          change({
            ...itemRef.current,
            image: uploaded.url,
            imageStoragePath: uploaded.path,
            imageAlt: itemRef.current.imageAlt ?? '',
          });
      } catch (error) {
        if (input) {
          input.setCustomValidity(
            error instanceof Error ? error.message : 'Could not upload the photo.',
          );
          input.reportValidity();
          input.value = '';
        }
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => patch({ image: String(reader.result), imageAlt: item.imageAlt ?? '' });
    reader.readAsDataURL(file);
  }
  return (
    <aside className="of-editor" aria-label="Offering editor" aria-busy={busy}>
      <div className="of-editor-heading">
        <div>
          <div className="of-title-row">
            <h2>{item.name || 'New offering'}</h2>
            <Status value={item.publication} />
          </div>
          <p>
            {schema.label} ·{' '}
            {item.sources.details === 'external' ? 'Details managed externally' : 'Managed in NEXG'}
            {dirty ? ' · Unsaved' : ''}
          </p>
          <div className="of-editor-shortcuts">
            <button
              type="button"
              className="of-button of-discount-action"
              disabled={lockedPrice || !['fixed', 'unit'].includes(item.priceMode)}
              onClick={() => {
                setTab('pricing');
                if (!item.discount?.enabled)
                  patch({
                    discount: {
                      enabled: true,
                      kind: 'percentage',
                      value: '',
                      startsAt: '',
                      endsAt: '',
                    },
                  });
                window.requestAnimationFrame(() => {
                  const body = bodyRef.current;
                  const section = body?.querySelector<HTMLElement>('[data-discount-section]');
                  if (body && section)
                    body.scrollTop +=
                      section.getBoundingClientRect().top - body.getBoundingClientRect().top;
                });
              }}
            >
              <Percent size={14} aria-hidden="true" />
              {item.discount?.enabled ? 'Edit discount' : 'Add discount'}
            </button>
            <button type="button" className="of-button" onClick={onAdd}>
              <Plus size={14} aria-hidden="true" />
              Add offering
            </button>
          </div>
        </div>
        <button
          type="button"
          className="of-icon"
          aria-label="Close offering editor"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      <div className="of-editor-tabs" role="tablist" aria-label="Offering sections">
        {(['details', 'pricing', 'availability', 'preview', 'history'] as EditorTab[]).map((id) => (
          <button
            type="button"
            role="tab"
            id={`of-tab-${id}`}
            aria-controls={`of-panel-${id}`}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            key={id}
            onClick={() => setTab(id)}
            onKeyDown={(e) => {
              const ids: EditorTab[] = ['details', 'pricing', 'availability', 'preview', 'history'];
              if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === 'Home'
                    ? ids[0]!
                    : e.key === 'End'
                      ? ids[4]!
                      : ids[(ids.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : 4)) % 5]!;
                setTab(next);
                document.getElementById(`of-tab-${next}`)?.focus();
              }
            }}
          >
            {id.charAt(0).toUpperCase() + id.slice(1)}
            {issues.some((i) => i.tab === id) && (
              <span className="of-error-dot" aria-label="has errors" />
            )}
          </button>
        ))}
      </div>
      <div
        className="of-editor-body"
        ref={bodyRef}
        role="tabpanel"
        id={`of-panel-${tab}`}
        aria-labelledby={`of-tab-${tab}`}
        tabIndex={0}
      >
        {issues.length > 0 && (
          <div className="of-error" role="alert">
            <strong>Check these details</strong>
            <ul>
              {issues.map((issue) => (
                <li key={issue.key + issue.message}>
                  <button type="button" onClick={() => setTab(issue.tab)}>
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tab === 'details' && (
          <>
            {lockedDetails && (
              <p className="of-note">
                <LockKeyhole size={15} />
                {readOnly
                  ? 'This saved catalogue entry is available for review.'
                  : item.publication === 'archived'
                    ? 'Archived offerings are read-only. Restore as a draft to edit them.'
                    : 'Edit these details in your connected system. Changes appear after the next confirmed sync.'}
              </p>
            )}
            <fieldset disabled={lockedDetails || busy} className="of-fields">
              <Label title="Name *" hint={fieldIssue('name')}>
                <input
                  maxLength={150}
                  value={item.name}
                  aria-invalid={!!fieldIssue('name')}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </Label>
              <Label title="Description" hint={fieldIssue('description')}>
                <textarea
                  maxLength={4000}
                  rows={2}
                  value={item.description}
                  onChange={(e) => patch({ description: e.target.value })}
                />
              </Label>
              <div className="of-two">
                <Label title="Price (KES)">
                  <input
                    value={item.price}
                    onChange={(e) => patch({ price: e.target.value })}
                    disabled={
                      lockedPrice || item.priceMode === 'quote' || item.priceMode === 'enquiry'
                    }
                    inputMode="decimal"
                    placeholder={
                      item.priceMode === 'quote'
                        ? 'Quoted per request'
                        : item.priceMode === 'enquiry'
                          ? 'No checkout price'
                          : '0.00'
                    }
                  />
                </Label>
                <Label title="Price basis">
                  <input
                    value={item.unit}
                    onChange={(e) => patch({ unit: e.target.value })}
                    disabled={lockedPrice}
                  />
                </Label>
              </div>
              <div className="of-specialist-fields" data-schema={item.schemaId}>
                {schema.fields
                  .filter(
                    (field) =>
                      field.key !== 'preparation_minutes' ||
                      profile.categoryId === 'restaurants_food',
                  )
                  .map((field) => (
                    <SpecialistField
                      key={field.key}
                      field={field}
                      value={item.fields[field.key]}
                      onChange={(value) =>
                        patch({ fields: { ...item.fields, [field.key]: value } })
                      }
                      error={fieldIssue(field.key)}
                    />
                  ))}
              </div>
              <details className="of-disclosure">
                <summary>Fulfilment and handover</summary>
                <div className="of-fields">
                  <p className="of-muted">
                    Uses the business location: Westlands. Only methods this offering supports are
                    shown.
                  </p>
                  {fulfilmentOptions(item.schemaId).map((method) => (
                    <label className="of-check" key={method}>
                      <input
                        type="checkbox"
                        checked={(
                          item.fulfilmentMethods ?? [fulfilmentOptions(item.schemaId)[0]!]
                        ).includes(method)}
                        onChange={(e) => {
                          const current = item.fulfilmentMethods ?? [
                            fulfilmentOptions(item.schemaId)[0]!,
                          ];
                          patch({
                            fulfilmentMethods: e.target.checked
                              ? [...current, method]
                              : current.filter((m) => m !== method),
                          });
                        }}
                      />
                      {method}
                    </label>
                  ))}
                  <Label title="Fulfilment instructions">
                    <textarea
                      rows={2}
                      value={item.fulfilmentInstructions ?? ''}
                      onChange={(e) => patch({ fulfilmentInstructions: e.target.value })}
                    />
                  </Label>
                </div>
              </details>
              <details className="of-disclosure">
                <summary>Photo and discovery details</summary>
                <div className="of-fields">
                  {item.image && (
                    <div className="of-media">
                      <Image
                        unoptimized
                        width={480}
                        height={320}
                        src={item.image}
                        alt={item.imageAlt || 'Offering photo preview'}
                      />
                      <button
                        type="button"
                        className="of-link"
                        onClick={() =>
                          patch({
                            image: undefined,
                            imageStoragePath: undefined,
                            imageAlt: undefined,
                          })
                        }
                      >
                        Remove photo
                      </button>
                    </div>
                  )}
                  <Label title="Offering photo" hint="JPG, PNG or WebP · up to 2 MB">
                    <span className="of-upload">
                      <ImagePlus size={16} />
                      <input
                        ref={uploadRef}
                        type="file"
                        disabled={setupDraftOnly && !onUploadImage}
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          e.target.setCustomValidity('');
                          void upload(e.target.files?.[0]);
                        }}
                      />
                    </span>
                  </Label>
                  {item.image && (
                    <Label title="Photo description">
                      <input
                        value={item.imageAlt ?? ''}
                        onChange={(e) => patch({ imageAlt: e.target.value })}
                      />
                    </Label>
                  )}
                  {profile.attributes.length > 0 ? (
                    <>
                      <p className="of-muted">
                        Business defaults are inherited. An override applies only to this offering;
                        it does not verify a public claim.
                      </p>
                      {profile.attributes.map((attribute) => {
                        const override = Object.hasOwn(item.attributes, attribute.id);
                        const inherited = configuration.inheritedAttributes[attribute.id];
                        return (
                          <div className="of-attribute" key={attribute.id}>
                            <label className="of-check">
                              <input
                                type="checkbox"
                                checked={override}
                                onChange={(e) => {
                                  const next = { ...item.attributes };
                                  if (e.target.checked) next[attribute.id] = inherited ?? undefined;
                                  else delete next[attribute.id];
                                  patch({ attributes: next });
                                }}
                              />
                              Customize {attribute.label.replace(/\?$/, '')}
                            </label>
                            {override ? (
                              <SchemaField
                                label={attribute.label}
                                schema={attribute.schema as JsonSchema}
                                value={item.attributes[attribute.id]}
                                onChange={(value) =>
                                  patch({
                                    attributes: { ...item.attributes, [attribute.id]: value },
                                  })
                                }
                              />
                            ) : (
                              <p className="of-muted">
                                {inherited === undefined
                                  ? 'No business default supplied.'
                                  : `Business default: ${Array.isArray(inherited) ? inherited.join(', ') : String(inherited)}`}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <p className="of-muted">
                      No additional listing attributes are required for this specialty.
                    </p>
                  )}
                </div>
              </details>
            </fieldset>
            <section className="of-section">
              <h3>Availability</h3>
              <div className="of-availability-summary">
                <CalendarDays size={21} />
                <div>
                  <strong>{capacityLabel(item)}</strong>
                  <p>{schema.guidance}</p>
                </div>
                <button type="button" className="of-link" onClick={() => setTab('availability')}>
                  Manage
                </button>
              </div>
            </section>
            <section className="of-section">
              <h3>Business policies</h3>
              <p className="of-muted">
                Uses the merchant’s cancellation, rescheduling and fulfilment defaults.
                Offering-specific terms above apply only to this listing.
              </p>
            </section>
            <section className="of-section">
              <PresentationAndBundle
                item={item}
                catalogue={catalogue}
                change={change}
                disabled={lockedDetails || busy}
              />
            </section>
          </>
        )}
        {tab === 'pricing' && (
          <div className="of-fields">
            {lockedPrice && (
              <p className="of-note">
                <LockKeyhole size={15} />
                Prices are read-only here. Update them in the connected system.
              </p>
            )}
            <fieldset disabled={lockedPrice || busy} className="of-fields">
              {schema.capacity !== 'stock' && item.priceMode !== 'enquiry' && (
                <fieldset className="of-fields">
                  <legend className="of-section-title">Reservation fee</legend>
                  <Label title="Reservation fee policy" hint={fieldIssue('reservationFee')}>
                    <select
                      value={item.reservationFee?.mode ?? 'none'}
                      onChange={(e) =>
                        patch({
                          reservationFee: {
                            mode: e.target.value as 'none' | 'fixed' | 'percentage',
                            amount: item.reservationFee?.amount ?? '',
                            creditToTotal: item.reservationFee?.creditToTotal ?? true,
                          },
                        })
                      }
                    >
                      <option value="none">No reservation fee</option>
                      <option value="fixed">Fixed amount in KES</option>
                      <option value="percentage">Percentage of the accepted price</option>
                    </select>
                  </Label>
                  {item.reservationFee && item.reservationFee.mode !== 'none' && (
                    <>
                      <Label
                        title={
                          item.reservationFee.mode === 'fixed'
                            ? 'Reservation fee (KES)'
                            : 'Reservation fee (%)'
                        }
                      >
                        <input
                          inputMode="decimal"
                          value={item.reservationFee.amount}
                          onChange={(e) =>
                            patch({
                              reservationFee: { ...item.reservationFee!, amount: e.target.value },
                            })
                          }
                        />
                      </Label>
                      <label className="of-check">
                        <input
                          type="checkbox"
                          checked={item.reservationFee.creditToTotal}
                          onChange={(e) =>
                            patch({
                              reservationFee: {
                                ...item.reservationFee!,
                                creditToTotal: e.target.checked,
                              },
                            })
                          }
                        />
                        Credit the fee towards the final total
                      </label>
                    </>
                  )}
                  <p className="of-note">
                    This sets the policy for new reservations. Existing accepted terms stay
                    unchanged. Collection and refunds are handled in Work/Money; saving here does
                    not charge anyone.
                  </p>
                </fieldset>
              )}
              <Label title="Pricing method">
                <select
                  value={item.priceMode}
                  onChange={(e) =>
                    patch({
                      priceMode: e.target.value as Offering['priceMode'],
                      discount:
                        ['quote', 'enquiry'].includes(e.target.value) && item.discount
                          ? { ...item.discount, enabled: false }
                          : item.discount,
                    })
                  }
                >
                  {schema.priceModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {
                        {
                          fixed: 'Fixed price',
                          unit: 'Per unit',
                          quote: 'Quote for each request',
                          enquiry: 'Enquiry only',
                        }[mode]
                      }
                    </option>
                  ))}
                </select>
              </Label>
              {item.priceMode === 'quote' || item.priceMode === 'enquiry' ? (
                <p className="of-note">
                  {item.priceMode === 'quote'
                    ? 'Customers see “Price on quotation”. A request does not reserve capacity or confirm a final price.'
                    : 'Customers make an administrative enquiry. No zero-price purchase or professional service approval is implied.'}
                </p>
              ) : (
                <div className="of-two">
                  <Label title="Price (KES) *" hint={fieldIssue('price')}>
                    <input
                      inputMode="decimal"
                      value={item.price}
                      onChange={(e) => patch({ price: e.target.value })}
                    />
                  </Label>
                  <Label title="Per *">
                    <input
                      value={item.unit}
                      maxLength={60}
                      onChange={(e) => patch({ unit: e.target.value })}
                    />
                  </Label>
                </div>
              )}
              {schema.capacity === 'stock' && (
                <section className="of-section">
                  <h3>Variants</h3>
                  <p className="of-muted">
                    Each variant has its own price and stock. Keep listing stock as a source
                    summary.
                  </p>
                  {item.variants.map((v, index) => (
                    <div className="of-variant" key={v.id}>
                      <Label title={`Variant ${index + 1} name`}>
                        <input
                          value={v.name}
                          onChange={(e) =>
                            patch({
                              variants: item.variants.map((x) =>
                                x.id === v.id ? { ...x, name: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </Label>
                      <div className="of-two">
                        <Label title="SKU">
                          <input
                            value={v.sku}
                            onChange={(e) =>
                              patch({
                                variants: item.variants.map((x) =>
                                  x.id === v.id ? { ...x, sku: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </Label>
                        <Label title="Variant price (KES)">
                          <input
                            inputMode="decimal"
                            value={v.price}
                            onChange={(e) =>
                              patch({
                                variants: item.variants.map((x) =>
                                  x.id === v.id ? { ...x, price: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </Label>
                      </div>
                      <Label title="Variant stock">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          disabled={lockedAvailability}
                          value={v.stock ?? ''}
                          onChange={(e) =>
                            patch({
                              variants: item.variants.map((x) =>
                                x.id === v.id
                                  ? {
                                      ...x,
                                      stock:
                                        e.target.value === '' ? undefined : Number(e.target.value),
                                    }
                                  : x,
                              ),
                            })
                          }
                        />
                      </Label>
                      <button
                        type="button"
                        className="of-link"
                        onClick={() =>
                          patch({ variants: item.variants.filter((x) => x.id !== v.id) })
                        }
                      >
                        Remove variant
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="of-button"
                    onClick={() =>
                      patch({
                        variants: [
                          ...item.variants,
                          { id: crypto.randomUUID(), name: '', sku: '', price: item.price },
                        ],
                      })
                    }
                  >
                    Add variant
                  </button>
                </section>
              )}
            </fieldset>
            <section className="of-section">
              <h3>Customer price</h3>
              <strong>
                <PriceSummary item={item} />
              </strong>
              <p className="of-muted">
                Displayed in KES. This frontend preview does not collect payments or calculate final
                booking charges.
              </p>
            </section>
            <QuantityAndChoices item={item} change={change} disabled={lockedPrice || busy} />
          </div>
        )}
        {tab === 'availability' && (
          <div className="of-fields">
            <label className="of-check">
              <input
                type="checkbox"
                disabled={lockedAvailability || busy}
                checked={item.availabilityPaused ?? false}
                onChange={(e) => patch({ availabilityPaused: e.target.checked })}
              />
              Pause new purchases or bookings for this listing
            </label>
            <p>{schema.guidance}</p>
            <div className="of-availability-summary">
              <CalendarDays size={22} />
              <div>
                <strong>{capacityLabel(item)}</strong>
                <p>Publication and current availability are separate.</p>
              </div>
            </div>
            {lockedAvailability && (
              <p className="of-note">
                <LockKeyhole size={16} />
                Availability is read-only.{' '}
                {item.sync === 'current'
                  ? 'Last source confirmation is displayed below.'
                  : 'Current stock or capacity is unknown until the source confirms it.'}
              </p>
            )}
            <fieldset disabled={lockedAvailability || busy} className="of-fields">
              <label className="of-check">
                <input
                  type="checkbox"
                  checked={item.availabilityLinked}
                  onChange={(e) => patch({ availabilityLinked: e.target.checked })}
                />
                {schema.capacity === 'stock'
                  ? 'Link inventory to this offering'
                  : schema.capacity === 'scope'
                    ? 'Request workflow configured'
                    : 'Link availability to this offering'}
              </label>
              {schema.capacity === 'stock' ? (
                <Label
                  title="Stock quantity"
                  hint="An empty value is unknown, never zero. Preview inventory only."
                >
                  <input
                    inputMode="decimal"
                    type="number"
                    min="0"
                    step="any"
                    value={item.stock ?? ''}
                    onChange={(e) =>
                      patch({
                        stock: e.target.value === '' ? undefined : Number(e.target.value),
                        stockAsOf: new Date().toISOString(),
                      })
                    }
                  />
                </Label>
              ) : allResources.length > 0 ? (
                <fieldset className="of-resource-list">
                  <legend>
                    Eligible{' '}
                    {schema.capacity === 'asset'
                      ? 'assets'
                      : schema.capacity === 'space'
                        ? 'spaces'
                        : 'resources'}
                  </legend>
                  {allResources.map((name) => (
                    <label className="of-check" key={name}>
                      <input
                        type="checkbox"
                        checked={item.resources.includes(name)}
                        onChange={(e) =>
                          patch({
                            resources: e.target.checked
                              ? [...item.resources, name]
                              : item.resources.filter((r) => r !== name),
                          })
                        }
                      />
                      {name}
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </fieldset>
            {item.stockAsOf && (
              <p className="of-muted">
                Last quantity: {item.stock ?? 'unknown'} ·{' '}
                {new Intl.DateTimeFormat('en-KE', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Africa/Nairobi',
                }).format(new Date(item.stockAsOf))}{' '}
                EAT{item.sync !== 'current' ? ' · historical value' : ''}
              </p>
            )}
            <button type="button" className="of-button" onClick={onConnections}>
              View source ownership
            </button>
            <p className="of-muted">
              The booking engine already manages calendars, dated sessions, resource closures and
              allocation. This preview links the offering configuration; it does not change that
              engine or create live capacity.
            </p>
          </div>
        )}
        {tab === 'preview' && (
          <div className="of-customer-preview">
            {visibilityLabel(item) && <p className="of-note">{visibilityLabel(item)}</p>}
            <p className="of-muted">Customer preview · saved or unsaved listing</p>
            {item.image && (
              <Image
                unoptimized
                width={480}
                height={320}
                src={item.image}
                alt={item.imageAlt ?? ''}
              />
            )}
            <h3>{item.name || 'Your offering name'}</h3>
            <p>{item.description || 'Your description appears here.'}</p>
            <strong>
              <PriceSummary item={item} />
            </strong>
            {discountLabel(item) && <p className="of-note">{discountLabel(item)}</p>}
            {item.quantityRules && (
              <p className="of-muted">
                Quantity: from {item.quantityRules.minimum}
                {item.quantityRules.maximum ? ` to ${item.quantityRules.maximum}` : ''} {item.unit}{' '}
                · {item.quantityRules.precision} decimal places
              </p>
            )}
            {(item.optionGroups ?? []).map((g) => (
              <div key={g.id}>
                <h3>{g.name || 'Option group'}</h3>
                <p className="of-muted">
                  Choose {g.minimum}–{g.maximum}
                </p>
                {g.choices.map((c) => (
                  <p key={c.id}>
                    {c.name || 'Unnamed choice'} · +KES {c.extra || '0'}
                  </p>
                ))}
              </div>
            ))}
            {(item.bundleItems ?? []).map((c) => (
              <p key={c.offeringId}>
                {c.quantity} ×{' '}
                {catalogue.find((o) => o.id === c.offeringId)?.name ?? 'Constituent not selected'}
              </p>
            ))}
            <p>{schema.label} · Westlands</p>
            <p>{capacityLabel(item)}</p>
            {schema.capacity !== 'scope' && (
              <p className="of-muted">
                Availability is checked against the configured source before confirmation.
              </p>
            )}
            <span className="of-customer-action">
              {item.availabilityPaused
                ? 'Temporarily unavailable'
                : item.priceMode === 'quote'
                  ? 'Request quote'
                  : item.priceMode === 'enquiry'
                    ? 'Enquire'
                    : schema.action}
            </span>
            <p className="of-muted">Display preview only. Customer transactions are not enabled.</p>
          </div>
        )}
        {tab === 'history' && (
          <>
            <h3>Listing history</h3>
            {item.history.length ? (
              <ol className="of-history">
                {item.history.map((h) => (
                  <li key={h.version}>
                    <Check size={15} />
                    <div>
                      <strong>{h.action}</strong>
                      <p>
                        Version {h.version} ·{' '}
                        {new Intl.DateTimeFormat('en-KE', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: 'Africa/Nairobi',
                        }).format(new Date(h.at))}{' '}
                        EAT
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="of-muted">Save this draft to begin its history.</p>
            )}
            <button type="button" className="of-button" onClick={onReload}>
              Reload saved version
            </button>
            {!readOnly && (
              <button type="button" className="of-button" onClick={onDuplicate}>
                Duplicate as draft
              </button>
            )}
          </>
        )}
      </div>
      <div className="of-editor-footer">
        <button
          type="button"
          className="of-button"
          aria-label="Preview offering"
          onClick={() => setTab('preview')}
        >
          <Eye size={16} />
          <span>Preview</span>
        </button>
        {readOnly ? (
          <span className="of-note">Saved catalogue entry · view only</span>
        ) : item.publication === 'archived' ? (
          <button
            className="of-button of-primary"
            type="button"
            disabled={busy}
            onClick={() => onSave('draft')}
          >
            Restore as draft
          </button>
        ) : (
          <>
            <button type="button" className="of-button" disabled={busy} onClick={() => onSave()}>
              {busy ? 'Saving…' : item.publication === 'published' ? 'Save changes' : 'Save draft'}
            </button>
            {(!setupDraftOnly || canPublish) && (
              <button
                type="button"
                className="of-button of-primary"
                disabled={busy}
                onClick={() =>
                  onSave(item.publication === 'published' && !dirty ? 'draft' : 'published')
                }
              >
                {item.publication === 'published'
                  ? dirty
                    ? 'Publish changes'
                    : 'Unpublish'
                  : canPublish
                    ? 'Publish'
                    : 'Publish offering'}
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
