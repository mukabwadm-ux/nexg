'use client';

import {
  DPA,
  DPA_BLANKS,
  DPA_TITLE,
  annexValues,
  clauseLabel,
  fillDpaText,
  itemLabel,
  subClauseLabel,
  suggestedSensitiveData,
  MerchantDpaAnnex,
  type DpaField,
  type MerchantDpaAnnexInput,
} from '@nexg/contracts/merchant-dpa';
import { Download, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { acceptDpa, makeDpaCopy } from '@/app/merchant/documents/dpa-actions';
import { Panel } from '@/components/partner/bits';

/** One acceptance, as rpc_merchant_dpa_read lists it. */
export interface DpaAcceptance {
  id: string;
  version: string;
  current: boolean;
  accepted_at: string;
  account_email: string | null;
  reference: string;
  storage_path: string | null;
  pages: number | null;
  copy_stored_at: string | null;
  details: { legal_name?: string; signatory_name?: string; signatory_title?: string } | null;
}

/** What rpc_merchant_dpa_read returns. */
export interface DpaRecord {
  version: { version: string; sha256: string; published_on: string } | null;
  category: string | null;
  can_accept: boolean;
  party_ready: boolean;
  suggested: { dpo_name: string | null; dpo_email: string | null; dpo_phone: string | null };
  accepted: boolean;
  acceptances: DpaAcceptance[];
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  });

const downloadHref = (merchantId: string, copy: DpaAcceptance) =>
  `/merchant/documents/dpa?merchant=${encodeURIComponent(merchantId)}&copy=${encodeURIComponent(copy.id)}`;

/*
 * The DPA's wording, with the merchant's name and Annex 1 answers in its
 * blanks as far as they are known. The signed copy is filled the same way.
 */
function DpaText({ values }: { values: Record<DpaField, string> }) {
  const f = (text: string) => fillDpaText(text, values);
  return (
    <div className="text-ink space-y-3 text-[0.8125rem] font-medium leading-[1.65]">
      <p className="text-center font-extrabold">{DPA.heading}</p>
      <p className="text-muted -mt-2 text-center italic">{DPA.subtitle}</p>
      {DPA.preamble.map((p, i) => (
        <p key={i}>
          {p.lead ? <strong>{p.lead}</strong> : null}
          {f(p.text)}
        </p>
      ))}
      {DPA.clauses.map((clause, c) => (
        <section key={clause.heading} className="space-y-2">
          <h4 className="font-extrabold">
            {clauseLabel(c + 1)} {clause.heading}
          </h4>
          {clause.paragraphs.map((p, i) => (
            <div key={i}>
              <p className="flex gap-2">
                <span className="w-10 shrink-0">{subClauseLabel(c + 1, i + 1)}</span>
                <span>{f(p.text)}</span>
              </p>
              {p.items?.map((item, n) => (
                <p key={n} className="ml-12 mt-1 flex gap-2">
                  <span className="w-6 shrink-0">{itemLabel(n)}</span>
                  <span>{f(item)}</span>
                </p>
              ))}
            </div>
          ))}
        </section>
      ))}
      <section className="space-y-2">
        <h4 className="font-extrabold">{DPA.annex1.heading}</h4>
        <table className="w-full border-collapse text-left text-[0.75rem]">
          <thead>
            <tr>
              {DPA.annex1.header.map((cell) => (
                <th key={cell} className="border-border bg-surface border px-2 py-1 font-extrabold">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DPA.annex1.rows.map(([item, description]) => (
              <tr key={item}>
                <td className="border-border border px-2 py-1 align-top">{f(item)}</td>
                <td className="border-border border px-2 py-1 align-top">{f(description)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="space-y-1">
        <h4 className="font-extrabold">{DPA.annex2.heading}</h4>
        <ul className="list-disc space-y-1 pl-5">
          {DPA.annex2.measures.map((measure) => (
            <li key={measure}>{f(measure)}</li>
          ))}
        </ul>
      </section>
      <section className="space-y-1">
        <h4 className="font-extrabold">{DPA.execution.heading}</h4>
        {[DPA.execution.controller, DPA.execution.processor].map((party) => (
          <div key={party}>
            <p className="font-extrabold">{f(party)}</p>
            {DPA.execution.lines.map((line) => (
              <p key={line}>{line}: ____________________________</p>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  type = 'text',
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-ink text-[0.75rem] font-bold">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="border-border bg-surface text-ink mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
      />
      {hint ? (
        <span className="text-muted mt-1 block text-[0.6875rem] font-semibold">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * NexG's Data Processing Agreement on the Documents page, next to the
 * merchant agreement: the full wording to read, the Annex 1 details, and
 * the box the owner ticks to accept it. Accepting fills it in with the
 * business's agreement details and stores a signed copy here.
 */
export function DpaPanel({
  merchantId,
  record,
  legalName = null,
}: {
  merchantId: string;
  /** Null until 20270326000100 runs: the panel then stays hidden. */
  record: DpaRecord | null;
  /** The registered name saved in the agreement details, when there is one. */
  legalName?: string | null;
}) {
  const router = useRouter();
  const [annex, setAnnex] = React.useState<MerchantDpaAnnexInput>(() => ({
    sensitive_data: suggestedSensitiveData(record?.category),
    dpo_name: record?.suggested.dpo_name ?? '',
    dpo_email: record?.suggested.dpo_email ?? '',
    dpo_phone: record?.suggested.dpo_phone ?? '',
    odpc_registration: '',
  }));
  const [readToEnd, setReadToEnd] = React.useState(false);
  const [ticked, setTicked] = React.useState(false);
  const [busy, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const scroller = React.useRef<HTMLDivElement>(null);

  // A text short enough to need no scrolling counts as read once shown.
  React.useEffect(() => {
    const box = scroller.current;
    if (box && box.scrollHeight <= box.clientHeight + 8) setReadToEnd(true);
  }, []);

  if (!record?.version) return null;
  const version = record.version.version;
  const current = record.acceptances.find((entry) => entry.current) ?? null;
  const earlier = record.acceptances.filter((entry) => !entry.current);

  const name = current?.details?.legal_name ?? legalName ?? null;
  const parsed = MerchantDpaAnnex.safeParse(annex);
  const values: Record<DpaField, string> = {
    ...DPA_BLANKS,
    ...(name ? { processor: name, processor_annex: name, processor_execution: name } : {}),
    ...(parsed.success ? annexValues(parsed.data) : {}),
  };

  const set = (key: keyof MerchantDpaAnnexInput) => (value: string) => {
    setAnnex((previous) => ({ ...previous, [key]: value }));
    setMessage(null);
  };

  function accept() {
    if (!parsed.success) {
      setMessage({ ok: false, text: parsed.error.issues[0]?.message ?? 'Check the details.' });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const outcome = await acceptDpa(merchantId, version, annex);
      if (!outcome.ok) {
        setMessage({ ok: false, text: outcome.message ?? 'Your acceptance could not be saved.' });
        return;
      }
      setMessage({
        ok: true,
        text: outcome.copyPending
          ? 'Accepted. Your signed copy is not ready yet; try “Make my signed copy” below.'
          : 'Accepted. Your signed copy is below.',
      });
      router.refresh();
    });
  }

  function retryCopy() {
    setMessage(null);
    startTransition(async () => {
      const outcome = await makeDpaCopy(merchantId);
      setMessage(
        outcome.ok
          ? { ok: true, text: 'Your signed copy is ready.' }
          : { ok: false, text: outcome.message ?? 'The signed copy could not be made. Retry.' },
      );
      router.refresh();
    });
  }

  return (
    <Panel title="Data processing agreement" note={`Version ${version}`}>
      <div className="space-y-3">
        <p className="text-ink flex items-center gap-2 text-[0.9375rem] font-extrabold">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          NexG {DPA_TITLE}
        </p>
        <p className="text-muted text-[0.8125rem] font-semibold leading-[1.6]">
          How your business handles the personal data of NexG customers, riders and guests, under
          Kenya’s Data Protection Act, 2019. It forms part of your merchant agreement, and every
          business on NexG accepts it before going live.
        </p>

        {current ? (
          <div className="bg-success-bg rounded-lg px-3 py-2.5">
            <p className="text-success text-[0.8125rem] font-bold">
              Accepted on {when(current.accepted_at)}
              {current.details?.signatory_name
                ? ` by ${current.details.signatory_name}${current.details.signatory_title ? `, ${current.details.signatory_title}` : ''}`
                : ''}
              . Reference {current.reference}.
            </p>
            {current.storage_path ? (
              <a
                href={downloadHref(merchantId, current)}
                className="text-ink mt-2 inline-flex items-center gap-2 text-[0.8125rem] font-extrabold underline underline-offset-2"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download your signed DPA (PDF{current.pages ? `, ${current.pages} pages` : ''})
              </a>
            ) : (
              <div className="mt-2">
                <p className="text-ink text-[0.8125rem] font-semibold">
                  Your signed copy is not ready yet.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={retryCopy}
                  className="bg-gold text-ink mt-2 rounded-lg px-3 py-2 text-[0.75rem] font-extrabold disabled:opacity-40"
                >
                  {busy ? 'Making it…' : 'Make my signed copy'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div
              ref={scroller}
              onScroll={(event) => {
                const box = event.currentTarget;
                if (box.scrollTop + box.clientHeight >= box.scrollHeight - 24) setReadToEnd(true);
              }}
              role="region"
              aria-label={`The ${DPA_TITLE}`}
              className="border-border max-h-[26rem] overflow-y-auto rounded-xl border p-4"
              data-dpa-text
            >
              <DpaText values={values} />
            </div>

            <div className="border-border rounded-xl border p-3" data-dpa-annex>
              <p className="text-ink text-[0.8125rem] font-extrabold">Your details for Annex 1</p>
              <p className="text-muted mt-1 text-xs font-semibold leading-[1.6]">
                The rest of the DPA is filled in with your details for the agreement.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field
                    id="dpa-sensitive"
                    label="Sensitive personal data you handle"
                    hint="For example health data for a pharmacy. Write “None” if you handle none."
                    value={annex.sensitive_data}
                    onChange={set('sensitive_data')}
                    disabled={busy}
                  />
                </div>
                <Field
                  id="dpa-dpo-name"
                  label="Data protection officer or compliance contact"
                  value={annex.dpo_name}
                  onChange={set('dpo_name')}
                  disabled={busy}
                />
                <Field
                  id="dpa-dpo-email"
                  label="Their email"
                  type="email"
                  value={annex.dpo_email}
                  onChange={set('dpo_email')}
                  disabled={busy}
                />
                <Field
                  id="dpa-dpo-phone"
                  label="Their phone"
                  type="tel"
                  value={annex.dpo_phone}
                  onChange={set('dpo_phone')}
                  disabled={busy}
                />
                <Field
                  id="dpa-odpc"
                  label="Data Commissioner registration number (optional)"
                  hint="Leave empty if your business is not registered; the DPA then says “Not applicable”."
                  value={annex.odpc_registration ?? ''}
                  onChange={set('odpc_registration')}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="border-gold/40 bg-gold/5 rounded-xl border p-3">
              {!record.party_ready ? (
                <p className="text-ink text-[0.8125rem] font-bold">
                  Save your details for the agreement first: the DPA is filled in with them.
                </p>
              ) : !record.can_accept ? (
                <p className="text-ink text-[0.8125rem] font-bold">
                  The business owner reads and accepts the DPA.
                </p>
              ) : !readToEnd ? (
                <p className="text-ink text-[0.8125rem] font-bold">
                  Read the agreement to the end to accept it.
                </p>
              ) : null}
              <label className="mt-2 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={ticked}
                  disabled={!readToEnd || !record.can_accept || !record.party_ready || busy}
                  onChange={(event) => setTicked(event.target.checked)}
                  className="accent-gold mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="text-ink text-[0.8125rem] font-semibold">
                  I have read and agree to the NexG {DPA_TITLE}.
                </span>
              </label>
              <button
                type="button"
                disabled={!ticked || busy || !record.can_accept || !record.party_ready}
                onClick={accept}
                className="bg-gold text-ink mt-3 rounded-lg px-3 py-2 text-[0.75rem] font-extrabold disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Accept and sign'}
              </button>
            </div>
          </>
        )}

        {message ? (
          <p
            role={message.ok ? 'status' : 'alert'}
            className={`text-[0.75rem] font-bold ${message.ok ? 'text-success' : 'text-danger'}`}
          >
            {message.text}
          </p>
        ) : null}

        {earlier.length ? (
          <div>
            <p className="text-muted text-[0.75rem] font-bold">Earlier versions you accepted</p>
            <ul className="mt-1 space-y-1">
              {earlier.map((copy) => (
                <li key={copy.id} className="text-[0.8125rem] font-semibold">
                  {copy.storage_path ? (
                    <a
                      href={downloadHref(merchantId, copy)}
                      className="text-ink underline underline-offset-2"
                    >
                      Version {copy.version}, accepted {when(copy.accepted_at)}
                    </a>
                  ) : (
                    `Version ${copy.version}, accepted ${when(copy.accepted_at)}`
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
