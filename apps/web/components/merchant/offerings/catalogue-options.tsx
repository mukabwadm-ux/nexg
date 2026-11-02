'use client';

import { Label } from './editor';
import { capacityLabel, priceLabel, type Offering } from './model';

export type ChoiceGroup = {
  id: string;
  name: string;
  minimum: number;
  maximum: number;
  choices: { id: string; name: string; extra: string; variantIds: string[] }[];
};
export type CatalogueOptions = {
  section?: string;
  tags?: string[];
  quantityRules?: { minimum: string; maximum: string; precision: number };
  optionGroups?: ChoiceGroup[];
  bundleItems?: { offeringId: string; quantity: number }[];
  visibility?: {
    startsAt: string;
    endsAt: string;
    locations: string[];
    channel: 'marketplace' | 'direct' | 'both';
  };
  availabilityPaused?: boolean;
  discount?: {
    enabled: boolean;
    kind: 'percentage' | 'amount';
    value: string;
    startsAt: string;
    endsAt: string;
  };
};

export function QuantityAndChoices({
  item,
  change,
  disabled,
}: {
  item: Offering;
  change: (item: Offering) => void;
  disabled: boolean;
}) {
  const groups = item.optionGroups ?? [];
  const rules = item.quantityRules ?? { minimum: '1', maximum: '', precision: 0 };
  function updateGroup(id: string, patch: Partial<ChoiceGroup>) {
    change({ ...item, optionGroups: groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  }
  return (
    <fieldset disabled={disabled} className="of-fields">
      <section className="of-section" data-discount-section>
        <h3>Offering discount</h3>
        <label className="of-check">
          <input
            type="checkbox"
            checked={item.discount?.enabled ?? false}
            disabled={
              disabled ||
              ((item.priceMode === 'quote' || item.priceMode === 'enquiry') &&
                !item.discount?.enabled)
            }
            onChange={(e) =>
              change({
                ...item,
                discount: {
                  ...(item.discount ?? { kind: 'percentage', value: '', startsAt: '', endsAt: '' }),
                  enabled: e.target.checked,
                },
              })
            }
          />
          Apply a discount to this offering
        </label>
        {item.priceMode === 'quote' || item.priceMode === 'enquiry' ? (
          <p className="of-muted">
            Set an agreed fixed or unit price before applying a listing discount.
          </p>
        ) : (
          item.discount?.enabled && (
            <div className="of-fields">
              <div className="of-two">
                <Label title="Discount type">
                  <select
                    value={item.discount.kind}
                    onChange={(e) =>
                      change({
                        ...item,
                        discount: {
                          ...item.discount!,
                          kind: e.target.value as 'percentage' | 'amount',
                        },
                      })
                    }
                  >
                    <option value="percentage">Percentage off</option>
                    <option value="amount">Fixed KES off per unit</option>
                  </select>
                </Label>
                <Label
                  title={
                    item.discount.kind === 'percentage'
                      ? 'Discount percentage'
                      : 'Discount amount (KES)'
                  }
                >
                  <input
                    inputMode="decimal"
                    value={item.discount.value}
                    placeholder={
                      item.discount.kind === 'percentage' ? 'For example, 15' : 'For example, 500'
                    }
                    onChange={(e) =>
                      change({ ...item, discount: { ...item.discount!, value: e.target.value } })
                    }
                  />
                </Label>
              </div>
              <div className="of-two">
                <Label title="Discount starts (Nairobi time)">
                  <input
                    type="datetime-local"
                    value={item.discount.startsAt}
                    onChange={(e) =>
                      change({ ...item, discount: { ...item.discount!, startsAt: e.target.value } })
                    }
                  />
                </Label>
                <Label title="Discount ends (optional)">
                  <input
                    type="datetime-local"
                    value={item.discount.endsAt}
                    onChange={(e) =>
                      change({ ...item, discount: { ...item.discount!, endsAt: e.target.value } })
                    }
                  />
                </Label>
              </div>
              <p className="of-muted">
                Discount applies to each priced unit or variant, before any checkout charges. Leave
                dates empty to start now with no scheduled end. Preview the price, then publish the
                offering or its changes.
              </p>
              <strong>{priceLabel(item)}</strong>
            </div>
          )
        )}
      </section>
      <details className="of-disclosure">
        <summary>Quantity and precision</summary>
        <div className="of-fields">
          <p className="of-muted">
            Quantities use the price unit: {item.unit}. Weight, area, time and participant places
            keep their own units.
          </p>
          <div className="of-two">
            <Label title="Minimum quantity">
              <input
                inputMode="decimal"
                value={rules.minimum}
                onChange={(e) =>
                  change({ ...item, quantityRules: { ...rules, minimum: e.target.value } })
                }
              />
            </Label>
            <Label title="Maximum quantity (optional)">
              <input
                inputMode="decimal"
                value={rules.maximum}
                onChange={(e) =>
                  change({ ...item, quantityRules: { ...rules, maximum: e.target.value } })
                }
              />
            </Label>
          </div>
          <Label title="Quantity decimal places">
            <select
              value={rules.precision}
              onChange={(e) =>
                change({ ...item, quantityRules: { ...rules, precision: Number(e.target.value) } })
              }
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'Whole units' : `${n} decimal places`}
                </option>
              ))}
            </select>
          </Label>
        </div>
      </details>
      <details className="of-disclosure">
        <summary>Options and extras ({groups.length})</summary>
        <div className="of-fields">
          <p className="of-muted">
            Use groups for sizes, extras or service choices. Extra prices are per selected choice;
            they do not rewrite the base price.
          </p>
          {groups.map((group) => (
            <section className="of-variant" key={group.id}>
              <Label title="Option group name">
                <input
                  value={group.name}
                  onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                />
              </Label>
              <div className="of-two">
                <Label title="Minimum choices">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={group.minimum}
                    onChange={(e) => updateGroup(group.id, { minimum: Number(e.target.value) })}
                  />
                </Label>
                <Label title="Maximum choices">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={group.maximum}
                    onChange={(e) => updateGroup(group.id, { maximum: Number(e.target.value) })}
                  />
                </Label>
              </div>
              {group.choices.map((choice) => (
                <div className="of-fields of-attribute" key={choice.id}>
                  <div className="of-two">
                    <Label title="Choice name">
                      <input
                        value={choice.name}
                        onChange={(e) =>
                          updateGroup(group.id, {
                            choices: group.choices.map((c) =>
                              c.id === choice.id ? { ...c, name: e.target.value } : c,
                            ),
                          })
                        }
                      />
                    </Label>
                    <Label title="Extra price (KES)">
                      <input
                        inputMode="decimal"
                        value={choice.extra}
                        onChange={(e) =>
                          updateGroup(group.id, {
                            choices: group.choices.map((c) =>
                              c.id === choice.id ? { ...c, extra: e.target.value } : c,
                            ),
                          })
                        }
                      />
                    </Label>
                  </div>
                  {item.variants.length > 0 && (
                    <fieldset>
                      <legend>Compatible variants · none selected means all</legend>
                      {item.variants.map((v) => (
                        <label className="of-check" key={v.id}>
                          <input
                            type="checkbox"
                            checked={choice.variantIds.includes(v.id)}
                            onChange={(e) =>
                              updateGroup(group.id, {
                                choices: group.choices.map((c) =>
                                  c.id === choice.id
                                    ? {
                                        ...c,
                                        variantIds: e.target.checked
                                          ? [...c.variantIds, v.id]
                                          : c.variantIds.filter((id) => id !== v.id),
                                      }
                                    : c,
                                ),
                              })
                            }
                          />
                          {v.name || 'Unnamed variant'}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <button
                    type="button"
                    className="of-link"
                    onClick={() =>
                      updateGroup(group.id, {
                        choices: group.choices.filter((c) => c.id !== choice.id),
                      })
                    }
                  >
                    Remove choice
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="of-button"
                onClick={() =>
                  updateGroup(group.id, {
                    choices: [
                      ...group.choices,
                      { id: crypto.randomUUID(), name: '', extra: '0', variantIds: [] },
                    ],
                  })
                }
              >
                Add choice
              </button>
              <button
                type="button"
                className="of-link"
                onClick={() =>
                  change({ ...item, optionGroups: groups.filter((g) => g.id !== group.id) })
                }
              >
                Remove group
              </button>
            </section>
          ))}
          <button
            type="button"
            className="of-button"
            onClick={() =>
              change({
                ...item,
                optionGroups: [
                  ...groups,
                  { id: crypto.randomUUID(), name: '', minimum: 0, maximum: 1, choices: [] },
                ],
              })
            }
          >
            Add option group
          </button>
        </div>
      </details>
    </fieldset>
  );
}

export function PresentationAndBundle({
  item,
  catalogue,
  change,
  disabled,
}: {
  item: Offering;
  catalogue: Offering[];
  change: (item: Offering) => void;
  disabled: boolean;
}) {
  const visibility = item.visibility ?? {
    startsAt: '',
    endsAt: '',
    locations: ['Westlands'],
    channel: 'both' as const,
  };
  const components = item.bundleItems ?? [];
  return (
    <fieldset disabled={disabled} className="of-fields">
      <details className="of-disclosure">
        <summary>Organization and visibility</summary>
        <div className="of-fields">
          <Label title="Catalogue section">
            <input
              value={item.section ?? ''}
              placeholder="For example, signature services"
              onChange={(e) => change({ ...item, section: e.target.value })}
            />
          </Label>
          <Label
            title="Discovery tags"
            hint="Separate tags with commas. Tags describe an offering; they do not verify a claim."
          >
            <input
              value={(item.tags ?? []).join(',')}
              onChange={(e) => change({ ...item, tags: e.target.value.split(',') })}
            />
          </Label>
          <Label title="Visible through">
            <select
              value={visibility.channel}
              onChange={(e) =>
                change({
                  ...item,
                  visibility: {
                    ...visibility,
                    channel: e.target.value as typeof visibility.channel,
                  },
                })
              }
            >
              <option value="both">Marketplace and direct link</option>
              <option value="marketplace">Marketplace</option>
              <option value="direct">Direct link</option>
            </select>
          </Label>
          <div className="of-two">
            <Label title="Visibility starts (Nairobi time)">
              <input
                type="datetime-local"
                value={visibility.startsAt}
                onChange={(e) =>
                  change({ ...item, visibility: { ...visibility, startsAt: e.target.value } })
                }
              />
            </Label>
            <Label title="Visibility ends (optional)">
              <input
                type="datetime-local"
                value={visibility.endsAt}
                onChange={(e) =>
                  change({ ...item, visibility: { ...visibility, endsAt: e.target.value } })
                }
              />
            </Label>
          </div>
          <fieldset>
            <legend>Applicable locations</legend>
            {['Westlands', 'Kilimani'].map((location) => (
              <label className="of-check" key={location}>
                <input
                  type="checkbox"
                  checked={visibility.locations.includes(location)}
                  onChange={(e) =>
                    change({
                      ...item,
                      visibility: {
                        ...visibility,
                        locations: e.target.checked
                          ? [...visibility.locations, location]
                          : visibility.locations.filter((l) => l !== location),
                      },
                    })
                  }
                />
                {location} · sample location
              </label>
            ))}
          </fieldset>
          <p className="of-muted">
            Publication and its visibility window are separate. These settings affect the local
            preview only.
          </p>
        </div>
      </details>
      <details className="of-disclosure">
        <summary>Bundle composition ({components.length})</summary>
        <div className="of-fields">
          <p className="of-muted">
            Reference existing listings rather than copy their stock or resources. The bundle uses
            its own stated price. Constituents must remain published, available and compatible at
            confirmation.
          </p>
          {components.map((component, index) => (
            <div className="of-fields of-attribute" key={index}>
              <Label title={`Included offering ${index + 1}`}>
                <select
                  value={component.offeringId}
                  onChange={(e) =>
                    change({
                      ...item,
                      bundleItems: components.map((c, i) =>
                        i === index ? { ...c, offeringId: e.target.value } : c,
                      ),
                    })
                  }
                >
                  <option value="">Choose an offering</option>
                  {catalogue
                    .filter((o) => o.id !== item.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} · {o.publication} · {capacityLabel(o)}
                      </option>
                    ))}
                </select>
              </Label>
              <Label title="Included quantity">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={component.quantity}
                  onChange={(e) =>
                    change({
                      ...item,
                      bundleItems: components.map((c, i) =>
                        i === index ? { ...c, quantity: Number(e.target.value) } : c,
                      ),
                    })
                  }
                />
              </Label>
              <button
                type="button"
                className="of-link"
                onClick={() =>
                  change({ ...item, bundleItems: components.filter((_, i) => i !== index) })
                }
              >
                Remove included offering
              </button>
            </div>
          ))}
          <button
            type="button"
            className="of-button"
            onClick={() =>
              change({ ...item, bundleItems: [...components, { offeringId: '', quantity: 1 }] })
            }
          >
            Add included offering
          </button>
          {components.map((c) => {
            const o = catalogue.find((entry) => entry.id === c.offeringId);
            return (
              o && (
                <p className="of-muted" key={o.id}>
                  {c.quantity} × {o.name} · {priceLabel(o)}
                </p>
              )
            );
          })}
        </div>
      </details>
    </fieldset>
  );
}

export function visibilityLabel(item: Offering, now = Date.now()) {
  if (item.publication !== 'published') return '';
  const start = item.visibility?.startsAt ? Date.parse(`${item.visibility.startsAt}+03:00`) : null;
  const end = item.visibility?.endsAt ? Date.parse(`${item.visibility.endsAt}+03:00`) : null;
  if (start !== null && now < start) return 'Scheduled visibility';
  if (end !== null && now >= end) return 'Visibility window ended';
  return item.visibility?.channel === 'direct' ? 'Direct link only' : 'Visible in preview';
}
