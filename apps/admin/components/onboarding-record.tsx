import { Card } from '@nexg/ui';

import type { BranchRow, FleetRow } from '@/app/merchants/[id]/page';

/**
 * What the merchant told us, as they were told it back.
 *
 * The onboarding flow shows a live card and a readiness ring while a merchant
 * fills it in. None of that reached the console, so a reviewer on the call
 * was working from six fields and a document list while the applicant was
 * looking at twenty answers. This is the other half of that conversation.
 *
 * Answer keys are rendered through category_config's own labels rather than
 * prettified here: "nyama_choma" is not what the merchant tapped, "Nyama
 * choma" is, and a reviewer reading the answer back on the phone should be
 * reading the same words.
 */

interface Question {
  key: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[];
}

interface MerchantRecord {
  answers: unknown;
  onboarding_step: number;
  onboarding_source: string | null;
  source_url: string | null;
  submitted_at: string | null;
  waitlisted_at: string | null;
  requires_ops_mapping: boolean;
  hours_pattern: string | null;
  hours: unknown;
  late_night_until: string | null;
  prep_minutes: number;
  order_channels: string[];
  when_busy: string;
  packaging: string | null;
  pickup_instructions: string | null;
  rider_parking: string | null;
  landmark: string | null;
  branch_count_band: string | null;
  payout_rail: string | null;
  payout_account: unknown;
  payout_name_lookup: unknown;
  has_own_riders: boolean;
  fleet_dispatch_preference: string;
  onboarding_call_at: string | null;
  price_band: string | null;
}

/* The bands as the merchant saw them: "2_3" read back as "2 3". */
const BANDS: Record<string, string> = {
  just_this_one: 'just this one',
  '2_3': '2–3',
  '4_10': '4–10',
  more_than_10: 'more than 10',
};

const CHECKS: { key: string; label: string }[] = [
  { key: 'business_basics', label: 'Business basics' },
  { key: 'location', label: 'Location' },
  { key: 'hours_prep', label: 'Hours & prep' },
  { key: 'documents', label: 'Documents' },
  { key: 'payout', label: 'Payout details' },
  { key: 'first_items', label: 'First 5 items' },
];

export function OnboardingRecord({
  merchant,
  config,
  branches,
  fleet,
  readiness,
}: {
  merchant: MerchantRecord;
  config: { label: string; questions: unknown; card_kind: string } | null;
  branches: BranchRow[];
  fleet: FleetRow[];
  readiness: Record<string, unknown> | null;
}) {
  const answers = (merchant.answers ?? {}) as Record<string, string | string[]>;
  const questions = (config?.questions ?? []) as Question[];
  const payout = (merchant.payout_account ?? {}) as Record<string, string>;
  const lookup = merchant.payout_name_lookup as { matched: boolean | null; reason?: string } | null;

  return (
    <section>
      <h2 className="text-lg font-extrabold tracking-tight">What they told us</h2>
      <p className="text-muted mt-1 text-sm font-semibold">
        Captured during onboarding · reached step {merchant.onboarding_step} of 7
        {merchant.onboarding_source
          ? ` · started by ${merchant.onboarding_source === 'link' ? 'pasting a link' : 'typing it in'}`
          : ''}
      </p>

      {/* ------------------------------------------------------- readiness */}
      {readiness && (
        <Card className="mt-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-extrabold uppercase tracking-wide">Ready to go live</h3>
            <p className="text-sm font-extrabold">{String(readiness['pct'] ?? 0)}%</p>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {CHECKS.map((check) => {
              const done = readiness[check.key] === true;
              return (
                <li key={check.key} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${done ? 'bg-success' : 'bg-border-strong'}`}
                  />
                  <span className={`text-xs font-bold ${done ? '' : 'text-muted-light'}`}>
                    {check.label}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-light mt-3 text-xs font-semibold">
            The same figure the merchant watches on their own screen — both read
            fn_merchant_readiness.
          </p>
        </Card>
      )}

      {merchant.requires_ops_mapping && (
        <Card tone="muted" className="border-warning/40 bg-warning-bg mt-4 p-4">
          <p className="text-warning text-sm font-bold leading-[1.7]">
            This business chose “Something else”. Someone has to decide which category it really
            belongs in before it goes live — the document rules below are borrowed from whichever
            category they said was closest.
          </p>
        </Card>
      )}

      {merchant.waitlisted_at && (
        <Card tone="muted" className="border-warning/40 bg-warning-bg mt-4 p-4">
          <p className="text-warning text-sm font-bold leading-[1.7]">
            Waitlisted — their pin fell outside every active zone. They are not waiting on us to
            review anything; they are waiting on a zone.
          </p>
        </Card>
      )}

      {/* ------------------------------------------------------- the answers */}
      {questions.length > 0 && (
        <Card className="mt-4 p-5">
          <h3 className="text-sm font-extrabold uppercase tracking-wide">
            {config?.label} questions
          </h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {questions.map((question) => (
              <div key={question.key}>
                <dt className="text-muted-light text-xs font-semibold">{question.label}</dt>
                <dd className="mt-0.5 text-sm font-bold">
                  {describe(answers[question.key], question)}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {/* -------------------------------------------------------- branches */}
      <Card className="mt-4 p-5">
        <h3 className="text-sm font-extrabold uppercase tracking-wide">
          Branches
          {merchant.branch_count_band
            ? ` · they said ${BANDS[merchant.branch_count_band] ?? merchant.branch_count_band}`
            : ''}
        </h3>
        {branches.length === 0 ? (
          <p className="text-muted mt-2 text-sm font-semibold">No pin yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {branches.map((branch, index) => (
              <li
                key={index}
                className="border-border flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2 last:border-b-0 last:pb-0"
              >
                <span className="text-sm font-bold">
                  {branch.address_text ?? 'Address not given'}
                </span>
                {branch.is_primary && (
                  <span className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-wide">
                    Main
                  </span>
                )}
                <span
                  className={`text-xs font-bold ${branch.zone ? 'text-success' : 'text-warning'}`}
                >
                  {branch.zone
                    ? `${branch.zone.name} · ${branch.zone.tier} · ${branch.zone.eta_min}–${branch.zone.eta_max} min${
                        branch.zone.cod_allowed ? '' : ' · no cash on delivery'
                      }`
                    : 'Outside every zone'}
                </span>
                {branch.latitude && branch.longitude && (
                  <span className="text-muted-light text-[0.6875rem] font-semibold">
                    {branch.latitude.toFixed(4)}, {branch.longitude.toFixed(4)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Fact label="Pickup" value={label(merchant.pickup_instructions)} />
          <Fact label="Rider parking" value={label(merchant.rider_parking)} />
          <Fact label="Landmark" value={merchant.landmark} />
        </dl>
      </Card>

      {/* ----------------------------------------------------- how they work */}
      <Card className="mt-4 p-5">
        <h3 className="text-sm font-extrabold uppercase tracking-wide">How they work</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <Fact label="Hours pattern" value={label(merchant.hours_pattern)} />
          <Fact label="Open late until" value={merchant.late_night_until?.slice(0, 5) ?? null} />
          <Fact label="Prep time" value={`${merchant.prep_minutes} min`} />
          <Fact
            label="Order channels"
            value={merchant.order_channels.map(label).join(', ') || null}
          />
          <Fact label="When slammed" value={label(merchant.when_busy)} />
          <Fact label="Packaging" value={label(merchant.packaging)} />
        </dl>
        {merchant.hours != null && (
          <p className="text-muted-light mt-3 text-xs font-semibold">
            Published to merchant_hours as seven rows — the merchant page and the “Open now” pill
            read those, not this pattern.
          </p>
        )}
      </Card>

      {/* ---------------------------------------------------------- payout */}
      <Card className="mt-4 p-5">
        <h3 className="text-sm font-extrabold uppercase tracking-wide">Payout</h3>
        {merchant.payout_rail ? (
          <>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <Fact label="Rail" value={label(merchant.payout_rail)} />
              {Object.entries(payout).map(([key, value]) => (
                <Fact key={key} label={label(key) ?? key} value={value} />
              ))}
            </dl>
            <p
              className={`mt-3 text-xs font-bold ${lookup?.matched ? 'text-success' : 'text-warning'}`}
            >
              {lookup?.matched
                ? 'Name matches the permit.'
                : (lookup?.reason ??
                  'Not checked against the permit — do it before the first settlement.')}
            </p>
          </>
        ) : (
          <p className="text-muted mt-2 text-sm font-semibold">Not set yet.</p>
        )}
      </Card>

      {/* ----------------------------------------------------- their riders */}
      {(merchant.has_own_riders || fleet.length > 0) && (
        <Card className="mt-4 p-5">
          <h3 className="text-sm font-extrabold uppercase tracking-wide">Their own riders</h3>
          <p className="text-muted mt-1 text-xs font-semibold">
            Dispatch preference: {label(merchant.fleet_dispatch_preference)}. Every one of them
            still goes through rider onboarding and the same verification as a NexG rider.
          </p>
          {fleet.length === 0 ? (
            <p className="text-muted mt-2 text-sm font-semibold">
              They said they have riders but named none.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {fleet.map((rider) => (
                <li key={rider.phone} className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-sm font-bold">{rider.name}</span>
                  <span className="text-muted text-xs font-semibold">{rider.phone}</span>
                  <span className="text-muted text-xs font-semibold">
                    {rider.vehicle}
                    {rider.plate_no ? ` · ${rider.plate_no}` : ''}
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      rider.invite_status === 'active' ? 'text-success' : 'text-warning'
                    }`}
                  >
                    {rider.invite_status}
                    {rider.rider_id ? ' · linked to a rider account' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {merchant.onboarding_call_at && (
        <p className="text-muted mt-4 text-xs font-semibold">
          They picked an onboarding call slot: {merchant.onboarding_call_at}
        </p>
      )}
    </section>
  );
}

function Fact({ label: name, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-muted-light text-xs font-semibold">{name}</dt>
      <dd className="mt-0.5 text-sm font-bold">{value ?? '—'}</dd>
    </div>
  );
}

/** An answer, in the words the merchant actually tapped. */
function describe(value: string | string[] | undefined, question: Question): string {
  if (value === undefined || value === null || value === '') return '—';
  if (question.type === 'text') return String(value);

  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0) return '—';

  return values
    .map((v) => question.options?.find((o) => o.value === v)?.label ?? label(v))
    .join(', ');
}

/** snake_case to something readable, for the values with no option list. */
function label(value: string | null | undefined): string | null {
  if (!value) return null;
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
