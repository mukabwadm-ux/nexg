import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { WorkspaceConnectionError, errorMessage, workspaceRequest } from '../client';
import { Badge, Button, Panel } from '../ui';
import './host-payout.css';

/*
 * Where NexG pays this host (owner, 24 Nov 2026). The owner declares the
 * details; NexG's Finance team checks them before any payout goes there. The
 * screen only ever shows them masked (/api/host-workspace/payout, backed by
 * rpc_host_payout_mine and rpc_host_payout_declare_mine). Its own component so
 * the Finances page mounts it with one line.
 */

type Rail = 'mpesa_phone' | 'mpesa_till' | 'mpesa_paybill' | 'bank';
type Payout = {
  rail: Rail;
  destinationMasked: string;
  accountName: string | null;
  bankName: string | null;
  kraPinSet: boolean;
  version: number;
  verified: boolean;
  declaredAt: string;
  statusNote: string;
};
type Field = {
  key: string;
  label: string;
  maxLength: number;
  numeric?: boolean;
  hint?: string;
  autoComplete?: string;
};

const RAILS: { value: Rail; label: string }[] = [
  { value: 'mpesa_phone', label: 'M-PESA number' },
  { value: 'mpesa_till', label: 'M-PESA till' },
  { value: 'mpesa_paybill', label: 'M-PESA paybill' },
  { value: 'bank', label: 'Bank account' },
];

const FIELDS: Record<Rail, Field[]> = {
  mpesa_phone: [
    {
      key: 'phoneNumber',
      label: 'M-PESA number',
      maxLength: 20,
      numeric: true,
      hint: '0712 345 678',
      autoComplete: 'tel',
    },
    { key: 'accountName', label: 'Name on the M-PESA account', maxLength: 200 },
  ],
  mpesa_till: [{ key: 'tillNumber', label: 'Till number', maxLength: 20, numeric: true }],
  mpesa_paybill: [
    { key: 'paybillNumber', label: 'Paybill number', maxLength: 20, numeric: true },
    { key: 'accountReference', label: 'Your account number at the paybill', maxLength: 100 },
  ],
  bank: [
    { key: 'bankName', label: 'Bank', maxLength: 100 },
    { key: 'accountName', label: 'Name on the account', maxLength: 200 },
    { key: 'accountNumber', label: 'Account number', maxLength: 40, numeric: true },
  ],
};

const railLabel = (rail: Rail) => RAILS.find((item) => item.value === rail)?.label ?? 'Payout';
const savedOn = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
};

type Load =
  | { state: 'loading' }
  | { state: 'failed'; message: string; retry: boolean }
  | { state: 'ready'; payout: Payout | null };

export function HostPayoutDetails() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [rail, setRail] = useState<Rail>('mpesa_phone');
  const [values, setValues] = useState<Record<string, string>>({});
  const [kraPin, setKraPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /* True after this owner replaced details NexG had already checked. */
  const [paused, setPaused] = useState(false);
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ state: 'loading' });
    workspaceRequest<{ payout: Payout | null }>('/payout', { signal: controller.signal })
      .then((result) => {
        setLoad({ state: 'ready', payout: result.payout });
        setEditing(!result.payout);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        const refused = failure instanceof WorkspaceConnectionError && failure.status === 403;
        setLoad({
          state: 'failed',
          message: refused ? failure.message : 'Your payout details could not be loaded.',
          retry: !refused,
        });
      });
    return () => controller.abort();
  }, [attempt]);

  const startEditing = useCallback((current: Payout | null) => {
    setRail(current?.rail ?? 'mpesa_phone');
    setValues({});
    setKraPin('');
    setError('');
    setNotice('');
    setEditing(true);
  }, []);

  if (load.state === 'loading')
    return (
      <Panel className="hp-panel">
        <h2>How you get paid</h2>
        <p className="hp-muted" role="status">
          Loading your payout details…
        </p>
      </Panel>
    );
  if (load.state === 'failed')
    return (
      <Panel className="hp-panel">
        <h2>How you get paid</h2>
        <p role="alert">{load.message}</p>
        {load.retry && (
          <div className="hp-actions">
            <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
          </div>
        )}
      </Panel>
    );

  const payout = load.payout;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    const body: Record<string, string> = { rail };
    for (const field of FIELDS[rail]) body[field.key] = values[field.key] ?? '';
    if (kraPin.trim()) body.kraPin = kraPin;
    const wasVerified = payout?.verified === true;
    try {
      const result = await workspaceRequest<{ payout: Payout | null; note: string }>('/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setLoad({ state: 'ready', payout: result.payout });
      setPaused(wasVerified && result.payout?.verified === false);
      setEditing(false);
      setValues({});
      setKraPin('');
      setNotice(result.note);
      heading.current?.focus();
    } catch (failure) {
      setError(
        errorMessage(failure, 'Saving could not be confirmed. Refresh before trying again.'),
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const changed = payout && !payout.verified && (paused || payout.version > 1);

  return (
    <Panel className="hp-panel">
      <div className="hp-head">
        <h2 ref={heading} tabIndex={-1}>
          How you get paid
        </h2>
        {payout &&
          !editing &&
          (payout.verified ? (
            <Badge tone="success">Checked by NexG</Badge>
          ) : (
            <Badge tone="warning">Waiting for NexG to check</Badge>
          ))}
      </div>

      {!payout && (
        <p className="hp-muted">
          Tell NexG where to send your share of each stay. NexG checks the details before the first
          payout.
        </p>
      )}

      {notice && (
        <p className="hp-notice" role="status">
          {notice}
        </p>
      )}

      {payout && !editing && (
        <>
          <dl className="hp-summary">
            <div>
              <dt>Paid to</dt>
              <dd>
                {railLabel(payout.rail)} · {payout.destinationMasked}
              </dd>
            </div>
            {payout.accountName && (
              <div>
                <dt>Name on the account</dt>
                <dd>{payout.accountName}</dd>
              </div>
            )}
            <div>
              <dt>KRA PIN</dt>
              <dd>{payout.kraPinSet ? 'Given' : 'Not given'}</dd>
            </div>
            {savedOn(payout.declaredAt) && (
              <div>
                <dt>Saved</dt>
                <dd>{savedOn(payout.declaredAt)}</dd>
              </div>
            )}
          </dl>
          {changed && (
            <p className="hp-warning">
              You changed your payout details. Payouts are paused until NexG checks the new ones.
            </p>
          )}
          {payout.statusNote && <p className="hp-muted">{payout.statusNote}</p>}
          <div className="hp-actions">
            <Button onClick={() => startEditing(payout)}>Change payout details</Button>
          </div>
        </>
      )}

      {editing && (
        <form className="hp-form" onSubmit={(event) => void save(event)} aria-busy={saving}>
          <fieldset disabled={saving}>
            <legend className="hp-legend">How should NexG pay you?</legend>
            <div className="hp-rails">
              {RAILS.map((item) => (
                <label key={item.value} className={rail === item.value ? 'active' : ''}>
                  <input
                    type="radio"
                    name="hp-rail"
                    value={item.value}
                    checked={rail === item.value}
                    onChange={() => {
                      setRail(item.value);
                      setValues({});
                      setError('');
                    }}
                  />
                  {item.label}
                </label>
              ))}
            </div>
            {(rail === 'mpesa_till' || rail === 'mpesa_paybill') && (
              <p className="hp-muted">
                {
                  "Paystack can only pay a bank account or an M-PESA number directly, so with a till or paybill you are paid in NexG's weekly payout run."
                }
              </p>
            )}
            {FIELDS[rail].map((field) => (
              <label className="field" key={rail + field.key}>
                <span>{field.label}</span>
                <input
                  required
                  autoComplete={field.autoComplete ?? 'off'}
                  inputMode={field.numeric ? 'numeric' : undefined}
                  maxLength={field.maxLength}
                  placeholder={field.hint}
                  value={values[field.key] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.key]: event.target.value }))
                  }
                />
              </label>
            ))}
            <label className="field">
              <span>KRA PIN (optional)</span>
              <input
                autoComplete="off"
                maxLength={14}
                placeholder="A123456789B"
                value={kraPin}
                onChange={(event) => setKraPin(event.target.value)}
              />
              {payout?.kraPinSet && (
                <small className="hp-muted">
                  NexG already has your KRA PIN. Leave this empty to keep it.
                </small>
              )}
            </label>
            {payout && (
              <p className="hp-muted">
                {payout.verified
                  ? 'NexG has checked your current details. If you save new ones, payouts pause until NexG checks them.'
                  : 'New details replace the ones you saved. NexG checks them before paying you.'}
              </p>
            )}
            {error && (
              <p role="alert" className="hp-error">
                {error}
              </p>
            )}
            <div className="hp-actions">
              <Button variant="primary" type="submit">
                {saving ? 'Saving…' : 'Save payout details'}
              </Button>
              {payout && (
                <Button
                  onClick={() => {
                    setEditing(false);
                    setError('');
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </fieldset>
        </form>
      )}
    </Panel>
  );
}
