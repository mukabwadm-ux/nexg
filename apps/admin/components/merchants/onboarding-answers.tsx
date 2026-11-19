import {
  ONBOARDING_SECTIONS,
  expiresSoon,
  isFieldShown,
  onboardingDisplay,
  parseOnboardingDetails,
  type OnboardingField,
  type OnboardingRow,
} from '@nexg/contracts/merchant-onboarding-details';

import { createClient } from '@/lib/supabase/server';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  });

function DateValue({ value }: { value: string }) {
  const passed = value < new Date().toISOString().slice(0, 10);
  return (
    <span>
      {value}
      {passed ? (
        <span className="bg-danger-bg text-danger ml-2 rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
          Expired
        </span>
      ) : expiresSoon(value) ? (
        <span className="bg-warning-bg text-warning ml-2 rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
          Expires within 30 days
        </span>
      ) : null}
    </span>
  );
}

function RowsValue({ field, rows }: { field: OnboardingField; rows: OnboardingRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-xs">
        <thead>
          <tr className="text-muted">
            {field.columns.map((c) => (
              <th key={c.key} className="py-1 pr-3 font-bold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-border border-t">
              {field.columns.map((c) => (
                <td key={c.key} className="py-1.5 pr-3 font-semibold">
                  {c.type === 'date' && row[c.key] ? (
                    <DateValue value={row[c.key]!} />
                  ) : (
                    (row[c.key] ?? '—')
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What the merchant gave for the owner's onboarding template (common fields
 * and their category's addendum), for the reviewer: every answer, what is
 * still missing, and licence dates that have passed or are close. Read
 * through rpc_merchant_onboarding_read; hidden where the database does not
 * have the template yet.
 */
export async function MerchantOnboardingAnswers({ merchantId }: { merchantId: string }) {
  const supabase = createClient();
  const [{ data, error }, { data: merchant }] = await Promise.all([
    supabase.rpc('rpc_merchant_onboarding_read', { p_merchant_id: merchantId }),
    supabase.from('merchant').select('commission_pct').eq('id', merchantId).maybeSingle(),
  ]);
  if (error || !data) return null;
  const details = parseOnboardingDetails(data);
  const missing = new Set(details.missing.map((m) => m.key));
  const commission = (merchant as { commission_pct: number | string | null } | null)
    ?.commission_pct;

  return (
    <section
      aria-labelledby="onboarding-answers"
      className="border-border bg-surface mt-4 rounded-2xl border p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="onboarding-answers" className="text-[0.9375rem] font-extrabold">
          Onboarding details
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
            details.missing.length ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'
          }`}
        >
          {details.missing.length ? `${details.missing.length} missing` : 'Complete'}
        </span>
      </div>
      <p className="text-muted mt-1 text-xs font-semibold">
        From the merchant onboarding template
        {details.updated_at
          ? ` · last changed ${when(details.updated_at)}`
          : ' · nothing saved yet'}
      </p>
      {details.missing.length ? (
        <p className="bg-warning-bg text-ink mt-3 rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          Missing: {details.missing.map((m) => m.label).join('; ')}
        </p>
      ) : null}

      {ONBOARDING_SECTIONS.map((section) => {
        const fields = details.fields.filter(
          (f) => f.section === section.key && isFieldShown(f, details.answers),
        );
        if (!fields.length) return null;
        return (
          <div key={section.key} className="mt-4">
            <h3 className="text-muted text-[0.6875rem] font-extrabold uppercase tracking-wide">
              {section.title}
            </h3>
            <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,16rem)_1fr]">
              {fields.map((field) => {
                const value = details.answers[field.key];
                return (
                  <div key={field.key} className="contents">
                    <dt className="text-muted font-semibold">
                      {field.label}
                      <span className="text-muted-light block text-[0.6875rem]">
                        {field.source}
                      </span>
                    </dt>
                    <dd className="font-bold">
                      {Array.isArray(value) && value.length ? (
                        <RowsValue field={field} rows={value} />
                      ) : field.type === 'date' && typeof value === 'string' && value ? (
                        <DateValue value={value} />
                      ) : (
                        (onboardingDisplay(field, value) ?? (
                          <span className={missing.has(field.key) ? 'text-danger' : 'text-muted'}>
                            {missing.has(field.key) ? 'Missing' : 'Not given'}
                          </span>
                        ))
                      )}
                      {field.must_be_yes && value === 'no' ? (
                        <span className="text-danger block text-xs">Not confirmed</span>
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        );
      })}

      <div className="mt-4">
        <h3 className="text-muted text-[0.6875rem] font-extrabold uppercase tracking-wide">
          Set by NexG
        </h3>
        <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,16rem)_1fr]">
          <dt className="text-muted font-semibold">Standard commission rate</dt>
          <dd className="font-bold">
            {commission !== null && commission !== undefined ? `${Number(commission)}%` : '—'}
          </dd>
        </dl>
      </div>
    </section>
  );
}
