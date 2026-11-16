'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { saveVacancy, type VacancyInput } from '@/app/merchant/hiring/actions';
import { CATEGORIES, JOB_TYPES, PAY_PERIODS } from '@/lib/careers/board';

export interface VacancyDraft {
  id: string;
  title: string;
  category: string;
  job_type: string;
  city_id: string;
  area: string | null;
  openings: number;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  description: string;
  requirements: string | null;
  closes_on: string | null;
  status: string;
  /* Since 20261225000100: a take-down by NexG, which only NexG lifts. */
  taken_down_at?: string | null;
  taken_down_reason?: string | null;
}

const field =
  'border-border-strong bg-surface text-ink placeholder:text-muted-light focus:border-ink w-full rounded-lg border px-3 text-[0.875rem] font-semibold transition-colors focus:outline-none';

const label = 'text-[0.75rem] font-extrabold';
const hint = 'text-muted-light font-semibold';

function wholeNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').replace(/[,\s]/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

/**
 * Write or edit a job. "Publish" puts it on the board, which only a verified
 * business can do; until then the job can be kept as a draft. The checks are
 * the database's: this form only shows what it says.
 */
export function VacancyForm({
  cities,
  defaultCityId,
  live,
  vacancy,
}: {
  cities: { id: string; name: string }[];
  defaultCityId: string | null;
  live: boolean;
  vacancy?: VacancyDraft;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<'publish' | 'save' | null>(null);
  const [outcome, setOutcome] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const isOpen = vacancy?.status === 'open';

  async function submit(form: HTMLFormElement, publish: boolean) {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const salaryMin = wholeNumber(data.get('salary_min'));
    const salaryMax = wholeNumber(data.get('salary_max'));
    if (Number.isNaN(salaryMin) || Number.isNaN(salaryMax)) {
      setOutcome({ ok: false, message: 'Write the pay as a number, such as 45000.' });
      return;
    }
    const input: VacancyInput = {
      id: vacancy?.id,
      title: String(data.get('title') ?? ''),
      category: String(data.get('category') ?? ''),
      jobType: String(data.get('job_type') ?? ''),
      cityId: String(data.get('city_id') ?? ''),
      area: String(data.get('area') ?? ''),
      openings: Number(data.get('openings') ?? 1) || 1,
      salaryMin,
      salaryMax,
      salaryPeriod: String(data.get('salary_period') ?? ''),
      description: String(data.get('description') ?? ''),
      requirements: String(data.get('requirements') ?? ''),
      closesOn: String(data.get('closes_on') ?? ''),
    };
    setBusy(publish ? 'publish' : 'save');
    setOutcome(null);
    const result = await saveVacancy(input, publish);
    setBusy(null);
    setOutcome(result);
    if (result.ok && result.id) {
      if (!vacancy) router.push(`/merchant/hiring/${result.id}`);
      else router.refresh();
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        /* Enter saves and never publishes: an open job stays open, anything
           else stays a draft until Publish is pressed. */
        void submit(event.currentTarget, false);
      }}
      className="space-y-4 p-4"
    >
      <label className="block">
        <span className={label}>Job title</span>
        <input
          name="title"
          required
          minLength={3}
          maxLength={120}
          defaultValue={vacancy?.title ?? ''}
          placeholder="Front office receptionist"
          className={`${field} mt-1 h-11`}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Category</span>
          <select
            name="category"
            required
            defaultValue={vacancy?.category ?? ''}
            className={`${field} mt-1 h-11`}
          >
            <option value="" disabled>
              Pick one
            </option>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Type of job</span>
          <select
            name="job_type"
            required
            defaultValue={vacancy?.job_type ?? ''}
            className={`${field} mt-1 h-11`}
          >
            <option value="" disabled>
              Pick one
            </option>
            {JOB_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
        <label className="block">
          <span className={label}>City</span>
          <select
            name="city_id"
            required
            defaultValue={vacancy?.city_id ?? defaultCityId ?? ''}
            className={`${field} mt-1 h-11`}
          >
            <option value="" disabled>
              Pick one
            </option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>
            Area <span className={hint}>(optional)</span>
          </span>
          <input
            name="area"
            maxLength={80}
            defaultValue={vacancy?.area ?? ''}
            placeholder="Westlands"
            className={`${field} mt-1 h-11`}
          />
        </label>
        <label className="block">
          <span className={label}>Openings</span>
          <input
            name="openings"
            type="number"
            min={1}
            max={500}
            required
            defaultValue={vacancy?.openings ?? 1}
            className={`${field} mt-1 h-11`}
          />
        </label>
      </div>

      <fieldset>
        <legend className={label}>
          Pay in shillings{' '}
          <span className={hint}>(optional, but jobs that say get more applicants)</span>
        </legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-3">
          <input
            name="salary_min"
            inputMode="numeric"
            aria-label="Lowest pay"
            placeholder="From, such as 45000"
            defaultValue={vacancy?.salary_min ?? ''}
            className={`${field} h-11`}
          />
          <input
            name="salary_max"
            inputMode="numeric"
            aria-label="Highest pay"
            placeholder="To, such as 60000"
            defaultValue={vacancy?.salary_max ?? ''}
            className={`${field} h-11`}
          />
          <select
            name="salary_period"
            aria-label="Pay period"
            defaultValue={vacancy?.salary_period ?? 'month'}
            className={`${field} h-11`}
          >
            {PAY_PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <label className="block">
        <span className={label}>What the job is</span>
        <textarea
          name="description"
          required
          minLength={20}
          maxLength={6000}
          rows={6}
          defaultValue={vacancy?.description ?? ''}
          placeholder="What the person will do day to day, the hours, and who they work with."
          className={`${field} mt-1 py-2.5 leading-[1.6]`}
        />
      </label>

      <label className="block">
        <span className={label}>
          What they need <span className={hint}>(optional)</span>
        </span>
        <textarea
          name="requirements"
          maxLength={4000}
          rows={4}
          defaultValue={vacancy?.requirements ?? ''}
          placeholder="Experience, certificates, languages."
          className={`${field} mt-1 py-2.5 leading-[1.6]`}
        />
      </label>

      <label className="block sm:max-w-[14rem]">
        <span className={label}>
          Closing date <span className={hint}>(optional)</span>
        </span>
        <input
          name="closes_on"
          type="date"
          defaultValue={vacancy?.closes_on ?? ''}
          className={`${field} mt-1 h-11`}
        />
      </label>

      {outcome ? (
        <p
          role={outcome.ok ? 'status' : 'alert'}
          className={`rounded-lg px-3 py-2 text-[0.8125rem] font-bold ${
            outcome.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {outcome.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {isOpen ? (
          <button
            type="submit"
            disabled={busy !== null}
            className="bg-ink h-11 rounded-lg px-5 text-[0.875rem] font-bold text-white disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy !== null || !live}
              onClick={(event) => void submit(event.currentTarget.form!, true)}
              className="bg-gold text-ink h-11 rounded-lg px-5 text-[0.875rem] font-extrabold disabled:opacity-50"
            >
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={(event) => void submit(event.currentTarget.form!, false)}
              className="border-border-strong h-11 rounded-lg border px-5 text-[0.875rem] font-bold disabled:opacity-60"
            >
              {busy === 'save' ? 'Saving…' : vacancy ? 'Save changes' : 'Save as draft'}
            </button>
          </>
        )}
        {vacancy?.taken_down_at ? (
          <p className="text-muted-light text-[0.75rem] font-semibold">
            NexG took this job down, so it cannot be published until NexG lifts that.
          </p>
        ) : !live ? (
          <p className="text-muted-light text-[0.75rem] font-semibold">
            You can publish once NexG has verified your business.
          </p>
        ) : null}
      </div>
    </form>
  );
}
