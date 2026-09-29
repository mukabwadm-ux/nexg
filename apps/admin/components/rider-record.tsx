import { Card } from '@nexg/ui';

/**
 * What the rider told us, as they were told it back.
 *
 * The console showed four fields — phone, city, vehicle, plate — while the
 * rider had answered twenty questions and watched a readiness ring fill up.
 * A rider ops person on the onboarding call was working blind by comparison.
 *
 * The two facts that decide activation are drawn as their own panel, because
 * they are the ones that stop a rider going live and the ones nobody could
 * see: whether anyone confirmed the M-Pesa line is in their name, and
 * whether a kit has actually been handed over.
 */

export interface RiderRecord {
  areas: string[];
  shifts: string[];
  cash_ok: boolean;
  kit_has: string[];
  bike_max_km: number | null;
  notes: string | null;
  ownership: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  insurance: string | null;
  years_riding: string | null;
  payout_msisdn: string | null;
  payout_name_lookup: { matched: boolean | null; name?: string; reason?: string } | null;
  phone_verified_at: string | null;
  onboarding_step: number;
  onboarding_session_at: string | null;
  kit_issued_at: string | null;
  source: string;
  employer_merchant_id: string | null;
  submitted_at: string | null;
  waitlisted_at: string | null;
}

const LABELS: Record<string, string> = {
  own: 'Theirs',
  rented: 'Rented / employer',
  family: 'Family',
  comprehensive: 'Comprehensive',
  third_party: 'Third party',
  none: 'No cover yet',
  new: 'New to it',
  '1_2': '1–2 years',
  '3_5': '3–5 years',
  '5_plus': '5+ years',
  mornings: 'Mornings',
  afternoons: 'Afternoons',
  evenings: 'Evenings',
  late_night: 'Late night',
  weekends: 'Weekends',
  bag: 'Insulated bag',
  phone_holder: 'Phone holder',
  jacket: 'Reflective jacket',
  rain_gear: 'Rain gear',
};

const CHECKS = [
  { key: 'about_you', label: 'About you' },
  { key: 'your_ride', label: 'Your ride' },
  { key: 'areas_hours', label: 'Areas & hours' },
  { key: 'documents', label: 'Documents' },
  { key: 'mpesa_payout', label: 'M-Pesa payout' },
  { key: 'kit_onboarding', label: 'Kit & onboarding' },
];

export function RiderRecordPanel({
  rider,
  readiness,
  merchantName,
}: {
  rider: RiderRecord;
  readiness: Record<string, unknown> | null;
  merchantName: string | null;
}) {
  const payoutMatched = rider.payout_name_lookup?.matched === true;

  return (
    <section>
      <h2 className="text-lg font-extrabold tracking-tight">What they told us</h2>
      <p className="text-muted mt-1 text-sm font-semibold">
        Captured during onboarding · reached step {rider.onboarding_step} of 6
        {rider.source === 'merchant_fleet'
          ? ` · declared by ${merchantName ?? 'a merchant'}, verified like any NexG rider`
          : ''}
      </p>

      {/* ------------------------------------------------- activation gates */}
      <Card className="mt-4 p-5">
        <h3 className="text-sm font-extrabold uppercase tracking-wide">Before they can go live</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-muted-light text-xs font-semibold">
              M-Pesa line registered to them
            </dt>
            <dd
              className={`mt-0.5 text-sm font-bold ${payoutMatched ? 'text-success' : 'text-warning'}`}
            >
              {payoutMatched
                ? `${rider.payout_name_lookup?.name} — matches`
                : 'Not confirmed — check the name against their ID'}
            </dd>
            {rider.payout_msisdn && (
              <dd className="text-muted mt-0.5 text-xs font-semibold">{rider.payout_msisdn}</dd>
            )}
          </div>
          <div>
            <dt className="text-muted-light text-xs font-semibold">Kit handed over</dt>
            <dd
              className={`mt-0.5 text-sm font-bold ${rider.kit_issued_at ? 'text-success' : 'text-warning'}`}
            >
              {rider.kit_issued_at ? `Issued ${nairobi(rider.kit_issued_at)}` : 'Not yet'}
            </dd>
          </div>
        </dl>
        <p className="text-muted-light mt-3 text-xs font-semibold leading-[1.7]">
          Activation refuses both unless you give a written reason, which goes in the audit trail
          with your name. Paying a line in somebody else&rsquo;s name is how a rider loses a
          week&rsquo;s earnings.
        </p>
      </Card>

      {readiness && (
        <Card className="mt-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-extrabold uppercase tracking-wide">
              Ready to be activated
            </h3>
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
            The same figure the rider watches on their own screen — both read fn_rider_readiness.
          </p>
        </Card>
      )}

      {/* ---------------------------------------------------------- the ride */}
      <Card className="mt-4 p-5">
        <h3 className="text-sm font-extrabold uppercase tracking-wide">Their ride</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <Fact label="Ownership" value={LABELS[rider.ownership ?? ''] ?? rider.ownership} />
          <Fact label="Insurance" value={LABELS[rider.insurance ?? ''] ?? rider.insurance} />
          <Fact
            label="Years riding"
            value={LABELS[rider.years_riding ?? ''] ?? rider.years_riding}
          />
          {rider.bike_max_km && (
            <Fact
              label="Willing to ride"
              value={rider.bike_max_km >= 100 ? 'Any distance' : `Up to ${rider.bike_max_km} km`}
            />
          )}
          {rider.owner_name && <Fact label="Owner on logbook" value={rider.owner_name} />}
          {rider.owner_phone && <Fact label="Owner’s phone" value={rider.owner_phone} />}
        </dl>
        {rider.ownership && rider.ownership !== 'own' && (
          <p className="border-warning/40 bg-warning-bg text-warning mt-3 rounded-lg border p-3 text-xs font-bold leading-[1.7]">
            The logbook will be in {rider.owner_name ?? 'the owner'}&rsquo;s name, not the
            rider&rsquo;s. Check the permission letter matches.
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------ where & when */}
      <Card className="mt-4 p-5">
        <h3 className="text-sm font-extrabold uppercase tracking-wide">Where &amp; when</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Fact label="Areas they know" value={rider.areas.join(', ') || null} />
          <Fact label="Shifts" value={rider.shifts.map((s) => LABELS[s] ?? s).join(', ') || null} />
          <Fact label="Cash on delivery" value={rider.cash_ok ? 'Happy to carry' : 'M-Pesa only'} />
          <Fact
            label="Kit they already have"
            value={rider.kit_has.map((k) => LABELS[k] ?? k).join(', ') || 'Nothing yet'}
          />
        </dl>
        {rider.notes && (
          <div className="border-border mt-3 border-t pt-3">
            <p className="text-muted-light text-xs font-semibold">In their words</p>
            <p className="mt-1 text-sm font-semibold leading-[1.7]">{rider.notes}</p>
          </div>
        )}
      </Card>

      {rider.onboarding_session_at && (
        <p className="text-muted mt-4 text-xs font-semibold">
          Kit session booked for {nairobi(rider.onboarding_session_at)}
        </p>
      )}
    </section>
  );
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* Nairobi wall time, built by hand — Intl on a server-rendered page can
   disagree with the browser's ICU data. Nairobi is UTC+3 all year. */
function nairobi(iso: string): string {
  const at = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${DAYS[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}, ${hh}:${mm}`;
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-muted-light text-xs font-semibold">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold">{value ?? '—'}</dd>
    </div>
  );
}
