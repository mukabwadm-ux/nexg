'use client';

import { CalendarDays, CircleHelp, FileText, List, ArrowRight } from 'lucide-react';
import * as React from 'react';

import { kenyaTime, type DataRequest } from './model';
import { useSettings } from './store';
import { Action, Badge, Card, Empty, Field, Modal, Note, TextLink } from './ui';
import s from './settings.module.css';

export function PrivacyScreen() {
  const { state, identity, commit, busy } = useSettings();
  const [review, setReview] = React.useState(true);
  const [from, setFrom] = React.useState('2026-10-01');
  const [to, setTo] = React.useState('2026-11-01');
  const [records, setRecords] = React.useState([
    'Current profile and preferences',
    'Your account activity',
  ]);
  const [error, setError] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [closure, setClosure] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState('');
  const [submitted, setSubmitted] = React.useState<string | null>(null);
  const selected = state.requests.find((request) => request.id === selectedId);
  const date = (value: string) => {
    const parsed = new Date(`${value}T12:00:00+03:00`);
    return Number.isNaN(parsed.getTime())
      ? 'Choose a date'
      : new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Nairobi',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(parsed);
  };
  const period = `${date(from)}–${date(to)} · Kenya time`;
  function validate() {
    if (!from || !to || from > to || !records.length) {
      setError('Choose at least one record type and an end date on or after the start date.');
      return false;
    }
    setError('');
    return true;
  }
  async function submit(type = 'Personal data export') {
    if (!validate()) return;
    const id = `DR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const request: DataRequest = {
      id,
      type,
      period: type === 'Account closure request' ? 'Account scope' : period,
      format: 'CSV',
      status: 'Submitted',
      createdAt: kenyaTime(),
    };
    if (
      await commit(
        (prev) => ({ ...prev, requests: [request, ...prev.requests] }),
        `${type} submitted in sample.`,
      )
    ) {
      if (type === 'Account closure request') {
        setClosure(false);
        setConfirmation('');
        setSelectedId(id);
      } else setSubmitted(id);
    }
  }
  function downloadSample() {
    const quote = (v: string) => `"${(/^[=+@\-\t\r]/.test(v) ? "'" + v : v).replace(/"/g, '""')}"`;
    const text =
      'sample_only,record,value\r\ntrue,display_name,' +
      quote(state.name) +
      '\r\ntrue,time_format,' +
      quote(state.preferences.timeFormat) +
      '\r\n';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'nexg-sample-personal-data.csv';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!identity.sample)
    return (
      <div className={s.grid}>
        <Card
          title="Your data & privacy"
          description="Manage requests for your personal account data."
        >
          <Note>
            Data exports and account-closure requests require the records and identity owners. No
            request is submitted by changing a preference.
          </Note>
          <TextLink href="/merchant/support">Contact support about your data</TextLink>
        </Card>
        <Card title="Business records">
          <p>
            Authorized financial records and statements remain in Money. Team access remains in
            Business.
          </p>
          <TextLink href="/merchant/money">Open Money</TextLink>
        </Card>
      </div>
    );
  return (
    <>
      <div className={s.grid}>
        <Card>
          <div className={s.steps}>
            <span>Scope</span>
            <ArrowRight size={18} />
            {review ? <strong>Review</strong> : <span>Review</span>}
          </div>
          {submitted ? (
            <div className={s.form}>
              <h2>Request submitted</h2>
              <Note tone="success">Your sample request was recorded in this browser.</Note>
              <p>
                Reference: <strong>{submitted}</strong>
              </p>
              <p>
                Submitted is separate from approved, prepared or completed. No real export or
                deletion has taken place.
              </p>
              <div className={s.actions}>
                <Action onClick={() => setSelectedId(submitted)}>View request</Action>
                <Action
                  onClick={() => {
                    setSubmitted(null);
                    setReview(false);
                  }}
                >
                  New request
                </Action>
              </div>
            </div>
          ) : (
            <>
              <h2>{review ? 'Review your data request' : 'Choose your request scope'}</h2>
              <p className={s.muted}>
                {review
                  ? 'Check the details of your request before submitting.'
                  : 'Choose the personal records and activity period you need.'}
              </p>
              {review ? (
                <div className={`${s.inset} ${s.sectionGap}`}>
                  <ReviewRow icon={<FileText size={25} />} title="Request type">
                    Personal data export
                  </ReviewRow>
                  <ReviewRow icon={<List size={25} />} title="Includes">
                    <ul>
                      {records.map((record) => (
                        <li key={record}>{record}</li>
                      ))}
                    </ul>
                  </ReviewRow>
                  <ReviewRow icon={<CalendarDays size={24} />} title="Activity period">
                    {period}
                  </ReviewRow>
                  <ReviewRow icon={<FileText size={25} />} title="Format">
                    CSV
                  </ReviewRow>
                </div>
              ) : (
                <div className={`${s.form} ${s.sectionGap}`}>
                  <fieldset>
                    <legend>Record types</legend>
                    {['Current profile and preferences', 'Your account activity'].map((record) => (
                      <label key={record} className={s.checkRow}>
                        <input
                          type="checkbox"
                          checked={records.includes(record)}
                          onChange={(e) =>
                            setRecords(
                              e.target.checked
                                ? [...records, record]
                                : records.filter((r) => r !== record),
                            )
                          }
                        />
                        {record}
                      </label>
                    ))}
                  </fieldset>
                  <div className={s.grid}>
                    <Field label="Activity from">
                      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </Field>
                    <Field label="Activity to">
                      <input
                        type="date"
                        value={to}
                        min={from}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field label="Format">
                    <select>
                      <option>CSV</option>
                    </select>
                  </Field>
                </div>
              )}
              <div className={s.sectionGap}>
                <Note>
                  <strong>This request covers only your account.</strong>
                  <p>Business records and customer data are excluded.</p>
                </Note>
              </div>
              <div className={s.sectionGap}>
                <h3>What happens next</h3>
                <p className={s.muted}>
                  Submit your request to start processing. Follow its status in Request history.
                </p>
              </div>
              {error && (
                <div className={s.sectionGap}>
                  <Note tone="danger">{error}</Note>
                </div>
              )}
              <div className={`${s.between} ${s.sectionGap}`}>
                <Action
                  onClick={() => {
                    setReview(false);
                    setError('');
                  }}
                >
                  Back
                </Action>
                <Action
                  variant="gold"
                  loading={busy}
                  onClick={() => {
                    if (!validate()) return;
                    if (!review) setReview(true);
                    else void submit();
                  }}
                >
                  {review ? 'Submit request' : 'Review request'}
                </Action>
              </div>
            </>
          )}
        </Card>
        <div className={s.stack}>
          <Card
            title="Request history"
            description="Your past data requests for your personal account."
          >
            {state.requests.length ? (
              state.requests.map((request) => (
                <div className={s.inset} key={request.id} style={{ marginTop: 12 }}>
                  <div className={s.between}>
                    <div className={s.identityRow}>
                      <span className={s.roundIcon}>
                        <FileText size={24} />
                      </span>
                      <div>
                        <strong>{request.id}</strong>
                        <p>{request.type}</p>
                        <span className={`${s.small} ${s.muted}`}>{request.createdAt}</span>
                      </div>
                    </div>
                    <div>
                      <Badge
                        tone={
                          request.status === 'Completed' || request.status === 'Ready'
                            ? 'success'
                            : 'info'
                        }
                      >
                        {request.status}
                      </Badge>
                      <br />
                      <TextLink onClick={() => setSelectedId(request.id)}>View details</TextLink>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <Empty title="No requests yet">Submitted requests will appear here.</Empty>
            )}
          </Card>
          <Card
            title="Account closure"
            description="Review how closing your account affects access and business ownership before requesting closure."
          >
            <button className={s.closureButton} onClick={() => setClosure(true)}>
              Review account closure
            </button>
          </Card>
          <Card>
            <div className={s.identityRow}>
              <CircleHelp size={24} />
              <h3>Help with data requests</h3>
            </div>
            <p>Find out more about what data is included in your request and how it’s processed.</p>
            <TextLink href="/merchant/support">Get help</TextLink>
          </Card>
        </div>
      </div>
      {selected && (
        <Modal
          open={selectedId !== null}
          onClose={() => setSelectedId(null)}
          title={selected.id}
          description="Personal request details. Scope and access are checked independently of the displayed status."
        >
          <div className={s.form}>
            <h3>{selected.type}</h3>
            <Badge tone="info">{selected.status}</Badge>
            <dl className={s.definitionList}>
              <dt>Scope</dt>
              <dd>Your account</dd>
              <dt>Period</dt>
              <dd>{selected.period}</dd>
              <dt>Requested</dt>
              <dd>{selected.createdAt}</dd>
            </dl>
            <Note>
              This is a sample request. No real account data is exported and no account is erased.
              No response deadline or retention period is promised.
            </Note>
            <div className={s.actions}>
              {selected.status === 'Submitted' && (
                <Action
                  loading={busy}
                  onClick={async () => {
                    await commit(
                      (prev) => ({
                        ...prev,
                        requests: prev.requests.map((r) =>
                          r.id === selected.id ? { ...r, status: 'Cancelled' } : r,
                        ),
                      }),
                      'Sample request cancelled.',
                    );
                  }}
                >
                  Cancel request
                </Action>
              )}
              {selected.status === 'Completed' && (
                <Action onClick={downloadSample}>Download sample CSV</Action>
              )}
              <Action variant="gold" onClick={() => setSelectedId(null)}>
                Done
              </Action>
            </div>
          </div>
        </Modal>
      )}
      <Modal
        open={closure}
        onClose={() => {
          setClosure(false);
          setConfirmation('');
        }}
        title="Review account closure"
        description="Requesting closure is different from signing out, business closure or deleting records."
      >
        <div className={s.form}>
          <Note tone="warning">
            Review business ownership, team continuity, open work and financial obligations before
            requesting closure. These owners decide what can happen.
          </Note>
          <p>
            This preview records a request only. It does not delete records, close the business or
            revoke your actual access.
          </p>
          <Field label="Type CLOSE to request sample account closure">
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <div className={s.actions}>
            <Action onClick={() => setClosure(false)}>Cancel</Action>
            <Action
              variant="danger"
              disabled={confirmation !== 'CLOSE'}
              loading={busy}
              onClick={() => void submit('Account closure request')}
            >
              Submit closure request
            </Action>
          </div>
        </div>
      </Modal>
    </>
  );
}
function ReviewRow({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={s.reviewRow}>
      <span className={s.roundIcon}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <div className={s.muted} style={{ marginTop: 4 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
