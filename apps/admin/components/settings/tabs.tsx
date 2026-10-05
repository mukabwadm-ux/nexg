import { Card } from '@nexg/ui';
import Link from 'next/link';
import * as React from 'react';

import { rollbackVersion, stageChange } from '@/app/settings/actions';

import { RollbackButton, SettingField } from './controls';
import {
  CATEGORY_LABEL,
  type ChangeSetRow,
  type CityRow,
  DASH,
  type DefinitionRow,
  type DispatchRow,
  Empty,
  type IntegrationRow,
  kes,
  LEGAL_LABEL,
  type LegalRow,
  num,
  type PaymentRow,
  pct,
  Pill,
  type PricingRow,
  type RailRow,
  RAIL_LABEL,
  type RetentionRow,
  Section,
  type SettlementRow,
  SourceChip,
  STATUS_LABEL,
  STATUS_TONE,
  Td,
  Th,
  Tile,
  TIER_TONE,
  when,
  type ZoneRow,
  day,
  hoursLabel,
} from './shared';

/* Which role edits each group, for the lock text. */
const GROUP_OWNER: Record<string, string> = {
  cities: 'Ops manager edits this',
  fees: 'Finance edits this',
  dispatch: 'Finance and Ops edit this',
  settlement: 'Finance edits this',
  payments: 'Finance and Tech edit this',
  payouts: 'Finance edits this',
  integrations: 'Tech edits this',
  notifications: 'Growth edits this',
  branding: 'Growth edits this',
  legal: 'Legal edits this',
  retention: 'The DPO edits this',
};

export interface TabProps {
  cities: CityRow[];
  city: CityRow | null;
  zones: ZoneRow[];
  pricing: PricingRow[];
  dispatch: DispatchRow | null;
  settlement: SettlementRow | null;
  payments: PaymentRow[];
  integrations: IntegrationRow[];
  rails: RailRow[];
  legal: LegalRow[];
  retention: RetentionRow[];
  definitions: DefinitionRow[];
  changeSets: ChangeSetRow[];
  canEdit: (group: string) => boolean;
}

/* Find a definition so a field can render its own help and type. */
function def(defs: DefinitionRow[], key: string): DefinitionRow | undefined {
  return defs.find((d) => d.key === key);
}

// ═══════════════════════════════════════ H1 · Cities & coverage

export function CitiesTab({
  cities,
  city,
  zones,
  definitions,
  canEdit,
}: TabProps & { city: CityRow | null }) {
  const live = cities.filter((c) => c.status === 'live').length;
  const soft = cities.filter((c) => c.status === 'soft_launch');
  const allZones = cities.reduce((a, c) => a + Number(c.zones), 0);
  const activeZones = cities.reduce((a, c) => a + Number(c.zones_active), 0);
  const trialZones = cities.reduce((a, c) => a + Number(c.zones_trial), 0);
  const waitlist = cities.filter((c) => c.status === 'waitlist');

  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Live cities"
          value={num(live)}
          hint={soft.length > 0 ? `+ ${soft.map((c) => c.name).join(', ')} soft launch` : undefined}
        />
        <Tile
          label="Coverage zones"
          value={num(allZones)}
          hint={`${activeZones} active · ${trialZones} trial`}
        />
        <Tile
          label="Outside-zone requests · 7d"
          value={DASH}
          hint="tells you where to draw next"
        />
        <Tile
          label={waitlist[0] ? `${waitlist[0].name} waitlist` : 'Waitlist'}
          value={DASH}
          hint={`opens at ${DASH} sign-ups`}
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_28rem] xl:items-start">
        <div>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[40rem] text-left text-[0.8125rem]">
              <thead className="bg-bg text-muted-light">
                <tr>
                  <Th>City</Th>
                  <Th>Status</Th>
                  <Th>Zones</Th>
                  <Th>Hours</Th>
                  <Th>Supply</Th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {cities.map((c) => (
                  <tr key={c.city_id} className={city?.city_id === c.city_id ? 'bg-gold-soft/40' : ''}>
                    <Td>
                      <Link href={`/settings?tab=cities&city=${c.city_id}`} className="block">
                        <span className="font-extrabold">{c.name}</span>
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {c.currency} · {c.timezone}
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <Pill tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status] ?? c.status}</Pill>
                    </Td>
                    <Td>{num(c.zones)} zones</Td>
                    <Td>
                      <span className="tabular-nums">{hoursLabel(c.hours)}</span>
                    </Td>
                    <Td>
                      <span className="text-muted-light text-[0.75rem] font-semibold">
                        {c.status === 'waitlist'
                          ? `${DASH} on waitlist`
                          : `${DASH} merchants · ${DASH} riders`}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Section
            title="Global defaults · every city inherits unless overridden"
            sub="A change here moves every city that has not set its own value."
          >
            <Card className="divide-border divide-y p-5">
              <SettingField
                label="Guest-facing languages"
                help="English first · Kiswahili toggle on the website and receipts."
                group="cities"
                cityId={null}
                settingKey="city.languages"
                value={JSON.stringify(
                  (definitions.find((d) => d.key === 'city.languages')?.default_value as string[]) ??
                    ['en', 'sw'],
                )}
                valueType="text"
                canEdit={canEdit('cities')}
                lockedBy={GROUP_OWNER.cities}
                onStage={stageChange}
              />
              <SettingField
                label="Order cut-off before close"
                help="Last order accepted this many minutes before the city closing time."
                group="cities"
                cityId={null}
                settingKey="city.order_cutoff_min"
                unit="min"
                value={city?.order_cutoff_min ?? null}
                valueType="int"
                canEdit={canEdit('cities')}
                lockedBy={GROUP_OWNER.cities}
                onStage={stageChange}
              />
              <SettingField
                label="Outside-zone behaviour"
                help="What a guest sees when their stay is outside every zone."
                group="cities"
                cityId={null}
                settingKey="city.outside_zone_behaviour"
                value={city?.outside_zone_behaviour ?? 'show_waitlist_form'}
                valueType="enum"
                options={[
                  { value: 'show_waitlist_form', label: 'Show waitlist form' },
                  { value: 'show_nearest_zone', label: 'Show nearest zone' },
                  { value: 'hide', label: 'Hide' },
                ]}
                canEdit={canEdit('cities')}
                lockedBy={GROUP_OWNER.cities}
                onStage={stageChange}
              />
              <SettingField
                label="Public holidays"
                help="Merchants get a prompt to confirm hours 3 days ahead."
                group="cities"
                cityId={null}
                settingKey="city.holiday_calendar"
                value={city?.holiday_calendar ?? 'KE-2026'}
                valueType="text"
                canEdit={canEdit('cities')}
                lockedBy={GROUP_OWNER.cities}
                onStage={stageChange}
              />
              <SettingField
                label="New-city template"
                help="Zones, fee bands and rules copied when a city goes from waitlist to soft launch."
                group="cities"
                cityId={null}
                settingKey="city.new_city_template"
                value={null}
                valueType="text"
                canEdit={canEdit('cities')}
                lockedBy={GROUP_OWNER.cities}
                onStage={stageChange}
              />
            </Card>
          </Section>
        </div>

        {/* ───────────────────────── the city panel */}
        {city ? (
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[1.0625rem] font-extrabold tracking-tight">{city.name}</h2>
              <Pill tone={STATUS_TONE[city.status]}>
                {STATUS_LABEL[city.status] ?? city.status}
              </Pill>
            </div>
            <p className="text-muted mt-1.5 text-[0.75rem] font-semibold leading-[1.7]">
              Opened {day(city.launched_at)} · city manager {city.city_manager_id ? '[Staff]' : DASH}{' '}
              · {num(city.zones)} zones
            </p>

            <div className="border-border mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
              <Field label="Operating hours" value={hoursLabel(city.hours)} />
              <Field label="Late-night from" value={city.late_night_from ?? DASH} />
              <Field label="Currency" value={city.currency} />
              <Field label="Timezone" value={city.timezone} />
              <Field
                label="Max radius"
                value={city.max_radius_km ? `${city.max_radius_km} km` : DASH}
                hint="dispatch rounds"
              />
              <Field label="Cut-off before close" value={`${num(city.order_cutoff_min)} min`} />
            </div>

            <Section title="Zones" sub="">
              {zones.length === 0 ? (
                <Empty>
                  This city has no zones. A city cannot go live without at least one Core zone —
                  until then a guest searching here sees the outside-zone page.
                </Empty>
              ) : (
                <ul className="divide-border divide-y">
                  {zones.map((z) => (
                    <li key={z.zone_id} className="flex flex-wrap items-center gap-2 py-2.5">
                      <span className="min-w-[8rem] flex-1 text-[0.8125rem] font-bold">
                        {z.name}
                      </span>
                      <Pill tone={TIER_TONE[z.tier]}>{z.tier}</Pill>
                      <span className="text-muted-light text-[0.75rem] font-semibold tabular-nums">
                        ETA {z.eta_min ? `${z.eta_min} min` : DASH}
                      </span>
                      {z.delivery_band && (
                        <span className="text-muted-light text-[0.6875rem] font-bold">
                          band {z.delivery_band}
                        </span>
                      )}
                      {z.trial_review_due && (
                        <Pill tone="bg-warning-bg text-warning">REVIEW DUE</Pill>
                      )}
                      <Pill tone={z.enabled ? 'bg-success-bg text-success' : 'bg-bg text-muted-light'}>
                        {z.enabled ? 'ON' : 'OFF'}
                      </Pill>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
                Core = full menu and concierge · Extended = delivery fee band 2, no cash-on-delivery
                above cap · Trial = 30-day pilot, auto-review
              </p>
              <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-[1.7]">
                Drawing a polygon needs the map, which is not built here yet — zones are edited by
                GeoJSON import for now, and the list above is the keyboard-accessible equivalent
                either way.
              </p>
            </Section>

            {city.status !== 'live' && <Readiness city={city} zones={zones} />}
          </Card>
        ) : (
          <Card className="p-6">
            <p className="text-muted text-[0.8125rem] font-semibold leading-[1.8]">
              Pick a city to see its hours, zones and what it still needs before it can go live.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

/**
 * What a city still needs.
 *
 * Every item is something this database can actually check. The two
 * supply thresholds are not set, and the checklist says so rather
 * than inventing a number a city could be held to.
 */
function Readiness({ city, zones }: { city: CityRow; zones: ZoneRow[] }) {
  const items = [
    { ok: zones.some((z) => z.tier === 'core' && z.enabled), label: 'At least one Core zone, enabled' },
    { ok: !!city.hours, label: 'Operating hours set' },
    { ok: !!city.currency, label: 'Currency set' },
    { ok: !!city.max_radius_km, label: 'Max radius set' },
    { ok: city.order_cutoff_min !== null, label: 'Order cut-off set' },
  ];

  return (
    <Section title="Before this city can go live" sub="">
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.label} className="flex items-start gap-2 text-[0.8125rem] font-semibold">
            <span aria-hidden="true" className={i.ok ? 'text-success' : 'text-muted-light'}>
              {i.ok ? '✓' : '○'}
            </span>
            <span className={i.ok ? 'text-muted' : ''}>{i.label}</span>
          </li>
        ))}
        <li className="flex items-start gap-2 text-[0.8125rem] font-semibold">
          <span aria-hidden="true" className="text-muted-light">
            ○
          </span>
          <span>
            Minimum merchants and riders — <span className="font-extrabold">{DASH}</span>. Nobody
            has decided what a city needs before guests see it, so this cannot be checked yet.
          </span>
        </li>
      </ul>
    </Section>
  );
}

// ══════════════════════════════════════════ H2 · Fees & dispatch

export function FeesTab({
  city,
  pricing,
  dispatch,
  settlement,
  definitions,
  canEdit,
  cities,
}: TabProps) {
  const rows = pricing.filter((p) => p.city_id === city?.city_id);
  const first = rows[0];
  const editFees = canEdit('fees');
  const editDispatch = canEdit('dispatch');

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {cities
          .filter((c) => c.status === 'live' || c.status === 'soft_launch')
          .map((c) => (
          <Link
            key={c.city_id}
            href={`/settings?tab=fees&city=${c.city_id}`}
            className={`rounded-lg px-3 py-1.5 text-[0.8125rem] font-extrabold transition-colors ${
              city?.city_id === c.city_id
                ? 'bg-ink text-white'
                : 'border-border hover:bg-bg border bg-white'
            }`}
          >
            {c.name}
          </Link>
        ))}
        <span className="text-muted-light ml-2 text-[0.75rem] font-semibold">
          {cities.filter((c) => c.status === 'waitlist').length > 0
            ? `${cities
                .filter((c) => c.status === 'waitlist')
                .map((c) => c.name)
                .join(', ')} inherit${
                cities.filter((c) => c.status === 'waitlist').length === 1 ? 's' : ''
              } the template`
            : ''}
        </span>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <div>
          <Section
            title="Commission by merchant category"
            sub="Two-person approval · effective the next 00:00 in this city"
          >
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[44rem] text-left text-[0.8125rem]">
                <thead className="bg-bg text-muted-light">
                  <tr>
                    <Th>Category</Th>
                    <Th>Commission</Th>
                    <Th>Min / order</Th>
                    <Th>Featured eligible</Th>
                    <Th>Note</Th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {rows.map((r) => (
                    <tr key={r.category}>
                      <Td>
                        <span className="font-bold">
                          {CATEGORY_LABEL[r.category] ?? r.category}
                        </span>
                      </Td>
                      <Td>
                        <EditableCell
                          label={`Commission · ${CATEGORY_LABEL[r.category] ?? r.category}`}
                          settingKey="fees.commission"
                          group="fees"
                          cityId={r.city_id}
                          category={r.category}
                          value={r.commission_pct}
                          display={pct(r.commission_pct)}
                          valueType="pct"
                          canEdit={editFees}
                        />
                      </Td>
                      <Td>
                        <EditableCell
                          label={`Minimum order · ${CATEGORY_LABEL[r.category] ?? r.category}`}
                          settingKey="fees.min_order"
                          group="fees"
                          cityId={r.city_id}
                          category={r.category}
                          value={r.min_order}
                          display={kes(r.min_order)}
                          valueType="money"
                          canEdit={editFees}
                        />
                      </Td>
                      <Td>
                        <Pill
                          tone={
                            r.featured_eligible
                              ? 'bg-success-bg text-success'
                              : 'bg-bg text-muted-light'
                          }
                        >
                          {r.featured_eligible ? 'YES' : 'NO'}
                        </Pill>
                      </Td>
                      <Td>
                        <span className="text-muted text-[0.75rem] font-semibold leading-[1.6]">
                          {r.note ?? ''}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            {!editFees && (
              <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
                🔒 {GROUP_OWNER.fees}
              </p>
            )}
          </Section>

          <Section title="Guest fees" sub="">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <p className="text-[0.8125rem] font-extrabold">
                  Delivery fee bands · by zone tier and distance
                </p>
                <div className="divide-border mt-2 divide-y">
                  <FeeRow label="Band 1 · Core" meta="≤ 3 km" value={kes(first?.delivery_band_1)} />
                  <FeeRow label="Band 2 · Extended" meta="3–6 km" value={kes(first?.delivery_band_2)} />
                  <FeeRow label="Band 3 · edge" meta="6–8 km" value={kes(first?.delivery_band_3)} />
                  <FeeRow label="Night · 22:00+" meta="+ flat" value={kes(first?.night_surcharge)} />
                </div>
              </Card>

              <Card className="p-5">
                <p className="text-[0.8125rem] font-extrabold">Other guest fees</p>
                <div className="divide-border mt-2 divide-y">
                  <FeeRow label="Service fee · % of basket" value={pct(first?.service_pct)} />
                  <FeeRow label="Concierge request · flat" value={kes(first?.concierge_flat)} />
                  <FeeRow
                    label={`Small-basket fee below ${kes(first?.small_basket_threshold)}`}
                    value={kes(first?.small_basket_fee)}
                  />
                  <FeeRow label="Cash-on-delivery handling" value={kes(first?.cash_handling ?? 0)} />
                  <FeeRow
                    label="Airbnb host credit · welcome pack"
                    value={first?.host_credit_rule === 'host_billed' ? 'host-billed' : DASH}
                  />
                </div>
              </Card>
            </div>
            <p className="text-muted-light mt-3 text-[0.75rem] font-semibold leading-[1.7]">
              All fees show to the guest before checkout as one line each · no fee is hidden in the
              item price
            </p>
            {editFees && (
              <Card className="mt-4 p-5">
                <p className="text-[0.8125rem] font-extrabold">Set a guest fee</p>
                <div className="divide-border mt-2 divide-y">
                  {[
                    ['fees.delivery.band_1', 'Band 1 · Core', first?.delivery_band_1],
                    ['fees.delivery.band_2', 'Band 2 · Extended', first?.delivery_band_2],
                    ['fees.delivery.band_3', 'Band 3 · edge', first?.delivery_band_3],
                    ['fees.night_surcharge', 'Night surcharge', first?.night_surcharge],
                    ['fees.concierge_flat', 'Concierge request', first?.concierge_flat],
                    ['fees.small_basket_threshold', 'Small-basket threshold', first?.small_basket_threshold],
                    ['fees.small_basket_fee', 'Small-basket fee', first?.small_basket_fee],
                  ].map(([key, label, value]) => (
                    <SettingField
                      key={key as string}
                      label={label as string}
                      help={def(definitions, key as string)?.help}
                      group="fees"
                      cityId={city?.city_id ?? null}
                      settingKey={key as string}
                      unit="KES"
                      value={(value as number | null) ?? null}
                      valueType="money"
                      canEdit={editFees}
                      onStage={stageChange}
                    />
                  ))}
                  <SettingField
                    label="Service fee"
                    help={def(definitions, 'fees.service_pct')?.help}
                    group="fees"
                    cityId={city?.city_id ?? null}
                    settingKey="fees.service_pct"
                    unit="%"
                    value={first?.service_pct ?? null}
                    valueType="pct"
                    canEdit={editFees}
                    onStage={stageChange}
                  />
                </div>
              </Card>
            )}
          </Section>
        </div>

        {/* ───────────────────────── dispatch and settlement */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[1.0625rem] font-extrabold tracking-tight">Dispatch rules</h2>
              <Pill tone="bg-success-bg text-success">LIVE</Pill>
            </div>
            <div className="divide-border mt-3 divide-y">
              <SettingField
                label="Rider selection"
                help="Nearest ETA to the merchant first, like ride-hailing · not nearest to the guest"
                group="dispatch"
                cityId={city?.city_id ?? null}
                settingKey="dispatch.selection"
                value={dispatch?.selection ?? 'nearest_eta_to_merchant'}
                valueType="enum"
                options={[
                  { value: 'nearest_eta_to_merchant', label: 'Nearest ETA to merchant' },
                  { value: 'nearest_to_guest', label: 'Nearest to guest' },
                  { value: 'balanced', label: 'Balanced' },
                ]}
                canEdit={editDispatch}
                lockedBy={GROUP_OWNER.dispatch}
                onStage={stageChange}
              />
              <SettingField
                label="Accept window"
                help="Seconds a rider has before the request moves to the next one"
                group="dispatch"
                cityId={city?.city_id ?? null}
                settingKey="dispatch.accept_window_s"
                unit="s"
                value={dispatch?.accept_window_s ?? null}
                valueType="int"
                canEdit={editDispatch}
                lockedBy={GROUP_OWNER.dispatch}
                onStage={stageChange}
              />
              <SettingField
                label="Rounds before boost"
                help="How many riders are tried before the boost fee kicks in"
                group="dispatch"
                cityId={city?.city_id ?? null}
                settingKey="dispatch.rounds_before_boost"
                value={dispatch?.rounds_before_boost ?? null}
                valueType="int"
                canEdit={editDispatch}
                lockedBy={GROUP_OWNER.dispatch}
                onStage={stageChange}
              />
              <SettingField
                label="Search radius"
                help="From the merchant · widens by 1 km per round"
                group="dispatch"
                cityId={city?.city_id ?? null}
                settingKey="dispatch.search_radius_km"
                unit="km"
                value={dispatch?.search_radius_km ?? null}
                valueType="int"
                canEdit={editDispatch}
                lockedBy={GROUP_OWNER.dispatch}
                onStage={stageChange}
              />
              <SettingField
                label="Boost fee"
                help="Added to rider pay, not to the guest, after the rounds above"
                group="dispatch"
                cityId={city?.city_id ?? null}
                settingKey="dispatch.boost_fee"
                unit="KES"
                value={dispatch?.boost_fee ?? null}
                valueType="money"
                canEdit={editDispatch}
                lockedBy={GROUP_OWNER.dispatch}
                onStage={stageChange}
              />
              <SettingField
                label="Escalate to Concierge desk after"
                help="No rider found · desk sees it with a one-tap phone dispatch"
                group="dispatch"
                cityId={city?.city_id ?? null}
                settingKey="dispatch.escalate_min"
                unit="min"
                value={dispatch?.escalate_min ?? null}
                valueType="int"
                canEdit={editDispatch}
                lockedBy={GROUP_OWNER.dispatch}
                onStage={stageChange}
              />
              <SettingField
                label="Rider cash cap"
                help="Max cash a rider may hold before cash-on-delivery is disabled for them"
                group="dispatch"
                cityId={city?.city_id ?? null}
                settingKey="dispatch.rider_cash_cap"
                unit="KES"
                value={dispatch?.rider_cash_cap ?? null}
                valueType="money"
                canEdit={editDispatch}
                lockedBy={GROUP_OWNER.dispatch}
                onStage={stageChange}
              />
              <SettingField
                label="Stacking"
                help="Allow a rider to carry two orders when both are on the way"
                group="dispatch"
                cityId={city?.city_id ?? null}
                settingKey="dispatch.stacking"
                value={dispatch?.stacking ?? false}
                valueType="bool"
                canEdit={editDispatch}
                lockedBy={GROUP_OWNER.dispatch}
                onStage={stageChange}
              />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-[1.0625rem] font-extrabold tracking-tight">Settlement calendar</h2>
            <dl className="divide-border mt-3 divide-y text-[0.8125rem]">
              <Row
                label="Cycle"
                help="Merchants, riders and host credits settle in one run"
                value={settlement?.cycle === 'weekly_friday' ? 'Weekly · Friday' : (settlement?.cycle ?? DASH)}
              />
              <Row
                label="Cut-off"
                help="Orders and cash up to this point are in the run"
                value={settlement?.cutoff === 'thu_2359' ? 'Thu 23:59' : (settlement?.cutoff ?? DASH)}
              />
              <Row
                label="Approvals"
                help="Two people before money moves"
                value={(settlement?.approvals ?? 'finance+ops_manager').replace('+', ' + ').replace(/_/g, ' ')}
              />
              <Row
                label="Instant cash-out"
                help="Riders asked · not offered in v1"
                value={settlement?.instant_cashout ? 'On' : 'Off'}
              />
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════ H3 · Payments & integrations

export function PaymentsTab({ payments, integrations, rails, canEdit }: TabProps) {
  const healthy = integrations.filter((i) => i.status === 'connected').length;
  const pending = integrations.filter((i) => i.status === 'pending');
  const todo = integrations.filter((i) => i.status === 'to_do');
  const dueRotation = integrations.filter((i) => i.rotation_due).length;

  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Payment success · 24 h" value={`${DASH}%`} hint="M-Pesa + card" />
        <Tile label="Failed callbacks" value={DASH} hint="auto-retried · 0 stuck" />
        <Tile
          label="Integrations healthy"
          value={`${healthy} / ${integrations.length}`}
          hint={[
            pending.length > 0 ? `${pending.map((i) => i.label).join(', ')} pending` : null,
            todo.length > 0 ? `${todo.map((i) => i.label).join(', ')} to do` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          tone={todo.length > 0 ? 'warning' : undefined}
        />
        <Tile
          label="Keys due rotation"
          value={num(dueRotation)}
          hint="90-day rule"
          tone={dueRotation > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 lg:items-start">
        <div>
          <Section title="Guest payment methods" sub="Order of appearance at checkout">
            <div className="space-y-2">
              {payments.map((m) => (
                <Card key={m.key} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.875rem] font-extrabold">{m.label}</span>
                    <Pill tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status] ?? m.status}</Pill>
                    <Pill tone={m.enabled ? 'bg-success-bg text-success' : 'bg-bg text-muted-light'}>
                      {m.enabled ? 'ON' : 'OFF'}
                    </Pill>
                  </div>
                  <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.7]">
                    {[m.provider, m.note].filter(Boolean).join(' · ')}
                  </p>
                  {m.disabled_reason && (
                    <p className="text-danger mt-1 text-[0.75rem] font-semibold">
                      Off: {m.disabled_reason}
                    </p>
                  )}
                </Card>
              ))}
            </div>
            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
              Turning a method off is one of the few changes that may take effect immediately — an
              incident should not wait for midnight. It still needs a reason, and it still writes
              an event. The toggle itself is not wired here yet, so today this is a reading of the
              state rather than a control over it.
              {!canEdit('payments') && ` 🔒 ${GROUP_OWNER.payments}.`}
            </p>
          </Section>

          <Section title="Payouts · settlements" sub="">
            <div className="space-y-2">
              {rails.map((r) => (
                <Card key={r.party} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] font-extrabold capitalize">
                      {r.party.replace('_', ' ')}
                    </p>
                    <p className="text-muted mt-0.5 text-[0.75rem] font-semibold leading-[1.6]">
                      {r.note ?? ''}
                    </p>
                  </div>
                  <Pill>{RAIL_LABEL[r.rail] ?? r.rail}</Pill>
                </Card>
              ))}
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.8125rem] font-extrabold">Payout float alert</p>
                  <p className="text-muted mt-0.5 text-[0.75rem] font-semibold leading-[1.6]">
                    Warn Finance when the B2C wallet is below one week of payouts.
                  </p>
                </div>
                <span className="font-extrabold">{kes(rails[0]?.float_alert_amount)}</span>
              </Card>
            </div>
          </Section>
        </div>

        <div>
          <Section title="Integrations" sub="">
            <div className="space-y-2">
              {integrations.map((i) => (
                <Card key={i.key} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[0.875rem] font-extrabold">{i.label}</span>
                    <Pill tone={STATUS_TONE[i.status]}>
                      {i.status === 'pending' && (i.config.templates_total as number)
                        ? `PENDING ${
                            Number(i.config.templates_total) - Number(i.config.templates_approved)
                          }`
                        : (STATUS_LABEL[i.status] ?? i.status)}
                    </Pill>
                    {i.rotation_due && <Pill tone="bg-warning-bg text-warning">ROTATE KEY</Pill>}
                  </div>
                  <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.7]">
                    {[i.provider ? `[${i.provider}]` : null, i.notes].filter(Boolean).join(' · ')}
                  </p>
                  {i.blocks.length > 0 && i.status !== 'connected' && (
                    <p className="text-danger mt-1.5 text-[0.75rem] font-extrabold">
                      Blocks: {i.blocks.join(', ').replace(/_/g, ' ')}
                    </p>
                  )}
                  <p className="text-muted-light mt-1.5 text-[0.6875rem] font-semibold">
                    {i.secrets > 0
                      ? `${i.secrets} secret${i.secrets === 1 ? '' : 's'} in the vault · last rotated ${
                          i.key_rotated_at ? when(i.key_rotated_at) : 'never'
                        }`
                      : 'No secrets stored here.'}
                  </p>
                </Card>
              ))}
            </div>
            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
              Secrets live in the vault and this console holds only their names. There is no
              control here that could show you a key, which is the point.
            </p>
          </Section>

          <Section title="API keys & webhooks" sub="">
            <Empty>
              Keys are issued by the API build and are not editable from here yet. When they are,
              they will be shown once and never again — rotation and revocation are already logged.
            </Empty>
          </Section>
        </div>
      </div>
    </>
  );
}

// ════════════════════════════ the three tabs not yet drawn

export function NotificationsTab() {
  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Templates" value={DASH} hint="awaiting WhatsApp approval" />
        <Tile label="Sent · 24 h" value={DASH} />
        <Tile label="Delivery failures · 24 h" value={DASH} />
        <Tile label="Opt-outs" value={DASH} />
      </div>
      <Section title="Templates" sub="Every message NexG sends, in both languages.">
        <Empty>
          The templates themselves live in `message_template` from the onboarding builds and the
          editor is not wired here yet. What exists today: the rules below, and the fact that
          nothing is sent without a template somebody wrote — there is no code path that composes
          a message inline.
        </Empty>
      </Section>
      <Section
        title="Rules"
        sub="Which channels, in which order, and who is never interrupted."
      >
        <Empty>
          No notification rules are defined. Until they are, each module uses its own quiet-hours
          handling — which works, and is exactly the duplication this tab exists to collapse.
        </Empty>
      </Section>
    </>
  );
}

export function BrandingTab({ legal, canEdit }: TabProps) {
  const legalLocked = !canEdit('legal');
  return (
    <>
      <Section
        title="Brand"
        sub="Colours and logos feed packages/ui, so a change here is a scheduled version like any other."
      >
        <Empty>
          The tokens are still defined in `packages/ui` and generating them from settings is not
          done. Changing a colour today is a code change and a deploy — honest, and slower than
          this tab promises.
        </Empty>
      </Section>

      <Section
        title="Legal documents"
        sub="Publishing a version with re-acceptance puts a blocking card in that audience's dashboard."
      >
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-left text-[0.8125rem]">
            <thead className="bg-bg text-muted-light">
              <tr>
                <Th>Document</Th>
                <Th>Version</Th>
                <Th>Effective</Th>
                <Th>Re-acceptance</Th>
                <Th>Status</Th>
                <Th>Approved by</Th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {legal.map((l) => (
                <tr key={`${l.key}-${l.version}`}>
                  <Td>
                    <span className="font-bold">{LEGAL_LABEL[l.key] ?? l.key}</span>
                    {l.changelog && (
                      <span className="text-muted-light block text-[0.6875rem] font-semibold">
                        {l.changelog}
                      </span>
                    )}
                  </Td>
                  <Td>v{l.version}</Td>
                  <Td>{day(l.effective_from)}</Td>
                  <Td>
                    <span className="text-muted text-[0.75rem] font-semibold">
                      {l.requires_reacceptance_by ?? 'none'}
                    </span>
                  </Td>
                  <Td>
                    <Pill tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status] ?? l.status}</Pill>
                  </Td>
                  <Td>
                    <span className="text-muted-light text-[0.75rem] font-semibold">
                      {l.approved_by_name && l.second_approver_name
                        ? `${l.approved_by_name} + ${l.second_approver_name}`
                        : DASH}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-muted-light mt-3 text-[0.75rem] font-semibold leading-[1.7]">
          Every document is a draft. None has been written, and the public /legal pages render
          nothing rather than placeholder terms — because terms nobody wrote are not terms anybody
          agreed to.
          {legalLocked && ` 🔒 ${GROUP_OWNER.legal}.`}
        </p>
      </Section>
    </>
  );
}

export function RetentionTab({ retention }: Pick<TabProps, 'retention'>) {
  const unset = retention.filter((r) => r.period_not_set).length;
  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Retention rules" value={num(retention.length)} />
        <Tile
          label="Periods not set"
          value={num(unset)}
          tone={unset > 0 ? 'danger' : 'success'}
          hint="a rule with no period deletes nothing"
        />
        <Tile label="Next retention run" value="02:00" />
        <Tile label="Legal holds" value={DASH} hint="see the Audit log" />
      </div>

      <Section
        title="Retention rules"
        sub="The same rules the Audit log shows — one table, edited in one place, approved by the same two people."
      >
        {retention.length === 0 ? (
          <Empty>No retention rules are defined.</Empty>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[40rem] text-left text-[0.8125rem]">
              <thead className="bg-bg text-muted-light">
                <tr>
                  <Th>Record</Th>
                  <Th>Kept for</Th>
                  <Th>Basis</Th>
                  <Th>Then</Th>
                  <Th>Approved</Th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {retention.map((r) => (
                  <tr key={r.key}>
                    <Td>
                      <span className="font-bold">{r.subject}</span>
                    </Td>
                    <Td>
                      {r.period_not_set ? (
                        <Pill tone="bg-danger-bg text-danger">NOT SET</Pill>
                      ) : (
                        <span className="font-extrabold">{r.retain_for_label}</span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-muted text-[0.75rem] font-semibold">{r.basis}</span>
                    </Td>
                    <Td>{r.anonymise ? 'Anonymised' : 'Deleted'}</Td>
                    <Td>
                      {r.not_approved ? (
                        <Pill tone="bg-warning-bg text-warning">NOT APPROVED</Pill>
                      ) : (
                        <Pill tone="bg-success-bg text-success">IN FORCE</Pill>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="text-muted-light mt-3 text-[0.75rem] font-semibold leading-[1.7]">
          Editing a period is the same two-person action as in the Audit log, because it is the
          same row. A second editing surface for the same rule is how two teams end up believing
          different things about how long a phone number is kept.
        </p>
      </Section>

      <Section title="Consent texts" sub="">
        <Empty>
          No consent wording has been written. The checkout currently renders the sentence from the
          hospitality build; moving it here is what makes it versionable and DPO-approved.
        </Empty>
      </Section>
    </>
  );
}

// ──────────────────────────────────────────────────────── bits

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
        {label}
      </p>
      <p className="mt-1 text-[0.875rem] font-extrabold">{value}</p>
      {hint && <p className="text-muted-light text-[0.625rem] font-semibold">{hint}</p>}
    </div>
  );
}

function Row({ label, help, value }: { label: string; help?: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <dt className="font-extrabold">{label}</dt>
        {help && (
          <p className="text-muted mt-0.5 text-[0.75rem] font-semibold leading-[1.6]">{help}</p>
        )}
      </div>
      <dd className="shrink-0 text-right font-extrabold">{value}</dd>
    </div>
  );
}

function FeeRow({ label, meta, value }: { label: string; meta?: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-[0.8125rem] font-bold">{label}</span>
      <span className="ml-auto flex items-center gap-3">
        {meta && <span className="text-muted-light text-[0.6875rem] font-semibold">{meta}</span>}
        <span className="font-extrabold tabular-nums">{value}</span>
      </span>
    </div>
  );
}

/**
 * A fee in a table cell.
 *
 * Read-only until somebody holds the role — and when they do not,
 * the number is still shown. Hiding a commission from an ops manager
 * helps nobody; the value is not a secret, the ability to change it
 * is.
 */
function EditableCell({
  label,
  settingKey,
  group,
  cityId,
  category,
  value,
  display,
  valueType,
  canEdit,
}: {
  label: string;
  settingKey: string;
  group: string;
  cityId: string;
  category: string;
  value: number | null;
  display: string;
  valueType: 'pct' | 'money';
  canEdit: boolean;
}) {
  if (!canEdit) {
    return <span className="font-extrabold tabular-nums">{display}</span>;
  }
  return (
    <SettingField
      label={label}
      group={group}
      cityId={cityId}
      settingKey={settingKey}
      category={category}
      value={value}
      valueType={valueType}
      canEdit
      compact
      onStage={stageChange}
    />
  );
}

export { RollbackButton, rollbackVersion, SourceChip };
