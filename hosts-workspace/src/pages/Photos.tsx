import { useEffect, useState, type FormEvent } from 'react';

import { errorMessage, workspaceRequest } from '../client';
import { Badge, Button, Empty, Icon, PageHeader, Pager, Panel } from '../ui';
import { useWorkspace } from '../workspace';

type Photo = { path: string; alt?: string; cover?: boolean; url: string };
type Gallery = { version: string; limit: number; photos: Photo[] };

export function PhotosPage() {
  const w = useWorkspace();
  const kind = w.section === 'unit' ? 'unit' : 'property';
  const record = (kind === 'property' ? w.data.properties : w.data.units).find(
    (item) => item.id === w.recordId,
  );
  const back = () =>
    record ? w.go(kind, record.id, kind === 'unit' ? 'details' : 'overview') : w.go('properties');

  if (!record || (kind === 'property' && !w.propertyWrites))
    return (
      <Empty title="Gallery unavailable" description="Open a property or unit in your workspace.">
        <Button onClick={back}>Properties</Button>
      </Empty>
    );

  return (
    <GalleryEditor
      key={kind + record.id}
      kind={kind}
      id={record.id}
      name={record.name}
      back={back}
    />
  );
}

function GalleryEditor({
  kind,
  id,
  name,
  back,
}: {
  kind: 'property' | 'unit';
  id: string;
  name: string;
  back: () => void;
}) {
  const { go, refresh, run, notify } = useWorkspace();
  const endpoint = '/photos?' + new URLSearchParams({ kind, id });
  const [saved, setSaved] = useState<Gallery | null>(null);
  const [draft, setDraft] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [load, setLoad] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [upload, setUpload] = useState<{ file: File; operationId: string } | null>(null);
  const [alt, setAlt] = useState('');
  const [remove, setRemove] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const current = Math.max(1, Math.min(page, draft.length));
  const photo = draft[current - 1];
  const dirty = saved !== null && JSON.stringify(draft) !== JSON.stringify(saved.photos);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    workspaceRequest<Gallery>(endpoint, { signal: controller.signal })
      .then((result) => {
        setSaved(result);
        setDraft(result.photos);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(errorMessage(cause, 'The gallery could not be loaded.'));
      });
    return () => controller.abort();
  }, [endpoint, load]);

  async function mutate(init: RequestInit) {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      const next = await workspaceRequest<Gallery>(endpoint, init);
      setSaved(next);
      setDraft(next.photos);
      await refresh();
      notify('Gallery saved.');
      return true;
    } catch (cause) {
      setError(errorMessage(cause, 'The gallery could not be saved.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!upload || dirty) return;
    const form = event.currentTarget;
    const body = new FormData();
    body.set('file', upload.file);
    body.set('operationId', upload.operationId);
    body.set('alt', alt);
    if (await mutate({ method: 'POST', body })) {
      form.reset();
      setUpload(null);
      setAlt('');
    }
  }

  function move(by: number) {
    const position = current - 1;
    const next = [...draft];
    [next[position], next[position + by]] = [next[position + by], next[position]];
    setDraft(next);
    setPage(current + by);
  }

  return (
    <div className="management-page">
      <PageHeader title="Photos" subtitle={name}>
        <Button onClick={back}>
          <Icon name="left" size={17} />
          Back to {kind}
        </Button>
      </PageHeader>
      <Panel className="mg-fill-panel host-gallery">
        <div className="mg-panel-heading">
          <h2>{kind === 'property' ? 'Property gallery' : 'Unit gallery'}</h2>
          {saved && (
            <Badge>
              {draft.length} of {saved.limit}
            </Badge>
          )}
        </div>
        {error && (
          <div role="alert" className="mg-local-toolbar">
            <span>{error}</span>
            <Button onClick={() => setLoad((value) => value + 1)}>Reload gallery</Button>
          </div>
        )}
        {!saved && !error && <p>Loading gallery…</p>}
        {saved && (
          <>
            {photo ? (
              <>
                <div className="host-gallery-photo">
                  {photo.url ? (
                    <img src={photo.url} alt={photo.alt || name} />
                  ) : (
                    <Icon name="building" size={44} />
                  )}
                </div>
                <div className="mg-row-actions">
                  <Button
                    disabled={busy || photo.cover}
                    onClick={() =>
                      setDraft(draft.map((item) => ({ ...item, cover: item.path === photo.path })))
                    }
                  >
                    {photo.cover ? 'Cover photo' : 'Use as cover'}
                  </Button>
                  <Button disabled={busy || current === 1} onClick={() => move(-1)}>
                    Move earlier
                  </Button>
                  <Button disabled={busy || current === draft.length} onClick={() => move(1)}>
                    Move later
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => setDraft(draft.filter((item) => item.path !== photo.path))}
                  >
                    Remove photo
                  </Button>
                </div>
                <label className="field">
                  <span>Photo description</span>
                  <input
                    maxLength={160}
                    disabled={busy}
                    value={photo.alt ?? ''}
                    onChange={(event) =>
                      setDraft(
                        draft.map((item) =>
                          item.path === photo.path ? { ...item, alt: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <Pager page={current} total={draft.length} pageSize={1} onChange={setPage} />
              </>
            ) : (
              <p className="mg-small-note">Add a photo to start this gallery.</p>
            )}
            {dirty ? (
              <div className="mg-row-actions">
                <Button disabled={busy} onClick={() => setDraft(saved.photos)}>
                  Cancel changes
                </Button>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() =>
                    void mutate({
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        version: saved.version,
                        photos: draft.map(({ path, alt, cover }) => ({ path, alt, cover })),
                      }),
                    })
                  }
                >
                  Save gallery
                </Button>
              </div>
            ) : (
              <form className="host-gallery-form" onSubmit={add}>
                <label className="field">
                  <span>Add photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy || draft.length >= saved.limit}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      setUpload(file ? { file, operationId: crypto.randomUUID() } : null);
                    }}
                  />
                </label>
                <label className="field">
                  <span>New photo description</span>
                  <input
                    maxLength={160}
                    value={alt}
                    onChange={(event) => setAlt(event.target.value)}
                    disabled={busy}
                  />
                </label>
                <Button type="submit" variant="primary" disabled={busy || !upload}>
                  {busy ? 'Uploading…' : 'Upload'}
                </Button>
              </form>
            )}
          </>
        )}
        {kind === 'property' && (
          <div className="host-gallery-removal">
            {remove ? (
              <form
                className="host-gallery-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (confirmation !== name || busy) return;
                  setBusy(true);
                  try {
                    if (
                      await run({
                        type: 'delete',
                        collection: 'properties',
                        id,
                        record: { confirmName: confirmation },
                      })
                    )
                      go('properties');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label className="field">
                  <span>Type {name} to confirm removal</span>
                  <input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    required
                    disabled={busy}
                  />
                </label>
                <Button disabled={busy} onClick={() => setRemove(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={busy || confirmation !== name}>
                  Confirm removal
                </Button>
              </form>
            ) : (
              <Button variant="ghost" disabled={busy || dirty} onClick={() => setRemove(true)}>
                Remove property
              </Button>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
