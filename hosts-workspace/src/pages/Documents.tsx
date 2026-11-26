import { useEffect, useRef, useState } from 'react';

import { errorMessage, uploadFile, workspaceRequest } from '../client';
import { dateText } from '../model';
import { Badge, Button, Panel, Table } from '../ui';
import { useWorkspace } from '../workspace';

/*
 * Documents NexG needs before activating the account. Until NexG approves
 * them the host can set up properties and units, but guests see none of
 * them (the public views need a live host), so this panel is what stands
 * between a new host and their first guest.
 */

type Kind = 'id_document' | 'authority' | 'kra_pin' | 'business_registration';

interface HostDocument {
  id: string;
  kind: Kind;
  fileName: string;
  status: 'uploaded' | 'approved' | 'rejected';
  rejectionReason: string | null;
  uploadedAt: string;
  /** YYYY-MM-DD, null when the document does not expire (or no date was given). */
  expiresOn?: string | null;
  url: string;
}

/** Today in Nairobi as YYYY-MM-DD. */
const nairobiToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

/** Same rule as NexG's review: expired before today, expiring within 60 days once approved. */
function expiryState(row: HostDocument | undefined): 'expired' | 'expiring' | null {
  if (!row?.expiresOn || row.status === 'rejected') return null;
  const today = nairobiToday();
  if (row.expiresOn < today) return 'expired';
  const soon = new Date(`${today}T12:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 60);
  return row.status === 'approved' && row.expiresOn <= soon.toISOString().slice(0, 10)
    ? 'expiring'
    : null;
}

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

interface DocumentsView {
  status: 'applied' | 'verifying' | 'live' | 'paused' | 'offboarded';
  statusReason: string | null;
  submittedAt: string | null;
  missing: Kind[];
  documents: HostDocument[];
}

const KINDS: { kind: Kind; label: string; detail: string; required: boolean }[] = [
  {
    kind: 'id_document',
    label: 'ID or passport',
    detail: 'National ID (both sides) or passport of the person registering.',
    required: true,
  },
  {
    kind: 'authority',
    label: 'Proof of authority to let',
    detail: 'Title deed, a lease that allows subletting, or a management agreement with the owner.',
    required: true,
  },
  {
    kind: 'kra_pin',
    label: 'KRA PIN certificate',
    detail: 'Optional. Used on your commission invoices.',
    required: false,
  },
  {
    kind: 'business_registration',
    label: 'Business registration',
    detail: 'Optional. For companies and property managers.',
    required: false,
  },
];

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

export function DocumentsPanel() {
  const { notify } = useWorkspace();
  const [view, setView] = useState<DocumentsView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<Kind | 'submit' | null>(null);
  const [progress, setProgress] = useState(0);
  const [expiry, setExpiry] = useState<Partial<Record<Kind, string>>>({});
  const picker = useRef<HTMLInputElement>(null);
  const picking = useRef<Kind | null>(null);

  async function load() {
    try {
      setView(await workspaceRequest<DocumentsView>('/documents'));
      setLoadError('');
    } catch (error) {
      setLoadError(errorMessage(error, 'Your documents could not be loaded.'));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function upload(kind: Kind, file: File) {
    setBusy(kind);
    setProgress(0);
    try {
      setView(
        await uploadFile<DocumentsView>(
          '/documents',
          { kind, fileName: file.name, expiresOn: expiry[kind] || null },
          file,
          setProgress,
        ),
      );
      setExpiry((current) => ({ ...current, [kind]: '' }));
      notify('Document uploaded.');
    } catch (error) {
      notify(errorMessage(error, 'The upload did not finish. Try again.'));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy('submit');
    try {
      setView(await workspaceRequest<DocumentsView>('/documents', { method: 'PATCH' }));
      notify('Sent to NexG for review.');
    } catch (error) {
      notify(errorMessage(error, 'Your documents could not be submitted.'));
    } finally {
      setBusy(null);
    }
  }

  if (loadError)
    return (
      <Panel className="mg-fill-panel">
        <p className="mg-small-note">{loadError}</p>
        <Button onClick={() => void load()}>Try again</Button>
      </Panel>
    );
  if (!view)
    return (
      <Panel className="mg-fill-panel">
        <p className="mg-small-note">Loading your documents…</p>
      </Panel>
    );

  const editable =
    view.status === 'applied' || view.status === 'verifying' || view.status === 'live';
  const current = (kind: Kind) => view.documents.find((row) => row.kind === kind);
  const badge = (row: HostDocument | undefined, required: boolean) => {
    if (!row)
      return (
        <Badge tone={required ? 'warning' : 'neutral'}>{required ? 'Needed' : 'Optional'}</Badge>
      );
    const state = expiryState(row);
    if (state === 'expired') return <Badge tone="danger">Expired</Badge>;
    if (state === 'expiring') return <Badge tone="warning">Expires soon</Badge>;
    if (row.status === 'approved') return <Badge tone="success">Approved</Badge>;
    if (row.status === 'rejected') return <Badge tone="warning">Needs a new file</Badge>;
    return <Badge>{view.status === 'verifying' ? 'In review' : 'Uploaded'}</Badge>;
  };

  return (
    <Panel className="mg-fill-panel">
      <div className="mg-panel-heading">
        <h2>Documents for approval</h2>
        <Badge tone={view.status === 'live' ? 'success' : 'warning'}>
          {view.status === 'live'
            ? 'Approved'
            : view.status === 'verifying'
              ? 'In review'
              : view.status === 'offboarded'
                ? 'Not approved'
                : 'Action needed'}
        </Badge>
      </div>
      <p className="mg-small-note">
        {view.status === 'live'
          ? 'NexG approved your account. You can list and manage your properties.'
          : view.status === 'offboarded'
            ? 'NexG could not approve this host account, so your properties stay hidden from guests. Reply to the email NexG sent if you think this is a mistake.'
            : view.status === 'verifying'
              ? `Submitted${view.submittedAt ? ' ' + dateText(view.submittedAt) : ''}. NexG usually reviews documents within one working day. You can set up your properties meanwhile. They stay hidden from guests until NexG approves your account.`
              : 'Upload these so NexG can approve your account. You can set up your properties meanwhile. They stay hidden from guests until NexG approves your account.'}
      </p>
      {view.statusReason && (view.status === 'applied' || view.status === 'offboarded') && (
        <p className="mg-small-note">
          <strong>{view.statusReason}</strong>
        </p>
      )}

      <input
        ref={picker}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          const kind = picking.current;
          event.target.value = '';
          if (file && kind) void upload(kind, file);
        }}
      />

      <Table>
        <thead>
          <tr>
            <th>Document</th>
            <th>File</th>
            <th>State</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {KINDS.map(({ kind, label, detail, required }) => {
            const row = current(kind);
            return (
              <tr key={kind}>
                <td>
                  <strong>{label}</strong>
                  <br />
                  <span className="mg-small-note">{detail}</span>
                </td>
                <td>
                  {row ? (
                    row.url ? (
                      <a href={row.url} target="_blank" rel="noreferrer">
                        {row.fileName}
                      </a>
                    ) : (
                      row.fileName
                    )
                  ) : (
                    '—'
                  )}
                  {row?.status === 'rejected' && row.rejectionReason && (
                    <>
                      <br />
                      <span className="mg-small-note">{row.rejectionReason}</span>
                    </>
                  )}
                  {row?.expiresOn && row.status !== 'rejected' && (
                    <>
                      <br />
                      <span className="mg-small-note">
                        {expiryState(row) === 'expired' ? 'Expired' : 'Expires'}{' '}
                        {longDate(row.expiresOn)}
                        {expiryState(row) ? '. Upload the new one.' : ''}
                      </span>
                    </>
                  )}
                </td>
                <td>{badge(row, required)}</td>
                <td>
                  {editable && (row?.status !== 'approved' || expiryState(row) !== null) && (
                    <label className="field">
                      <span>Expiry date (if it has one)</span>
                      <input
                        type="date"
                        min={nairobiToday()}
                        value={expiry[kind] ?? ''}
                        disabled={busy !== null}
                        onChange={(event) =>
                          setExpiry((current) => ({ ...current, [kind]: event.target.value }))
                        }
                      />
                    </label>
                  )}
                  {editable && (row?.status !== 'approved' || expiryState(row) !== null) && (
                    <Button
                      disabled={busy !== null}
                      onClick={() => {
                        picking.current = kind;
                        picker.current?.click();
                      }}
                    >
                      {busy === kind
                        ? `Uploading ${Math.round(progress * 100)}%…`
                        : row
                          ? 'Replace'
                          : 'Upload'}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      {view.status === 'applied' && (
        <div className="mg-row-actions">
          <Button
            variant="primary"
            disabled={busy !== null || view.missing.length > 0}
            onClick={() => void submit()}
          >
            {busy === 'submit' ? 'Submitting…' : 'Submit for review'}
          </Button>
          {view.missing.length > 0 && (
            <span className="mg-small-note">
              Upload your ID or passport and proof of authority first.
            </span>
          )}
        </div>
      )}
    </Panel>
  );
}
