import { useEffect, useState, type FormEvent } from 'react';

import { errorMessage, uploadFile, workspaceRequest } from '../client';
import { Badge, Button, Empty, Icon, PageHeader, Pager, Panel } from '../ui';
import { useWorkspace } from '../workspace';

type Photo = { path: string; alt?: string; cover?: boolean; room?: string; url: string };
type Room = { value: string; label: string };
type Gallery = { version: string; limit: number; rooms?: Room[]; photos: Photo[] };
/* Guests browse a unit room by room (owner, 24 Nov 2026). The server sends the list; this is the fallback. */
const ROOMS: Room[] = [
  { value: 'living', label: 'Living area' },
  { value: 'dining', label: 'Dining' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'bedroom', label: 'Bedroom / bed area' },
  { value: 'washroom', label: 'Washroom' },
  { value: 'outside', label: 'Balcony & outside' },
  { value: 'other', label: 'Other' },
];
const MAX_BYTES = 10 * 1024 * 1024;
const roomOf = (photo: Photo) => photo.room || 'other';

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
  const [sending, setSending] = useState<{ index: number; progress: number } | null>(null);
  const [error, setError] = useState('');
  const [upload, setUpload] = useState<{ file: File; operationId: string }[]>([]);
  const [room, setRoom] = useState('living');
  const [filter, setFilter] = useState('all');
  const [alt, setAlt] = useState('');
  const [remove, setRemove] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const rooms = saved?.rooms?.length ? saved.rooms : ROOMS;
  const shown = filter === 'all' ? draft : draft.filter((item) => roomOf(item) === filter);
  const current = Math.max(1, Math.min(page, shown.length));
  const photo = shown[current - 1];
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

  async function mutate(init: RequestInit | (() => Promise<Gallery>)) {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      const next =
        typeof init === 'function' ? await init() : await workspaceRequest<Gallery>(endpoint, init);
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

  /* Several photos at once, all tagged with the chosen room. Each is its own upload, so a failure keeps the ones
     already sent and leaves the rest ready to retry. */
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!upload.length || dirty) return;
    const form = event.currentTarget;
    let sent = 0;
    for (const [index, item] of upload.entries()) {
      setSending({ index, progress: 0 });
      const sentPhoto = await mutate(() =>
        uploadFile<Gallery>(
          endpoint,
          { operationId: item.operationId, alt, room },
          item.file,
          (progress) => setSending({ index, progress }),
        ),
      );
      if (!sentPhoto) break;
      sent += 1;
    }
    setSending(null);
    if (sent === upload.length) {
      form.reset();
      setUpload([]);
      setAlt('');
      setFilter(room);
      setPage(1);
    } else setUpload(upload.slice(sent));
  }

  /* Swaps this photo with its neighbour in the room being shown, keeping the whole gallery's order. */
  function move(by: number) {
    const neighbour = shown[current - 1 + by];
    if (!photo || !neighbour) return;
    const a = draft.indexOf(photo);
    const b = draft.indexOf(neighbour);
    const next = [...draft];
    [next[a], next[b]] = [next[b], next[a]];
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
            <div className="host-gallery-rooms" role="tablist" aria-label="Rooms">
              {[{ value: 'all', label: 'All' }, ...rooms].map((item) => {
                const count =
                  item.value === 'all'
                    ? draft.length
                    : draft.filter((entry) => roomOf(entry) === item.value).length;
                return (
                  <Button
                    key={item.value}
                    role="tab"
                    aria-selected={filter === item.value}
                    variant={filter === item.value ? 'primary' : undefined}
                    onClick={() => {
                      setFilter(item.value);
                      setPage(1);
                      if (item.value !== 'all') setRoom(item.value);
                    }}
                  >
                    {item.label} · {count}
                  </Button>
                );
              })}
            </div>
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
                  <Button disabled={busy || current === shown.length} onClick={() => move(1)}>
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
                  <span>Room</span>
                  <select
                    disabled={busy}
                    value={roomOf(photo)}
                    onChange={(event) =>
                      setDraft(
                        draft.map((item) =>
                          item.path === photo.path ? { ...item, room: event.target.value } : item,
                        ),
                      )
                    }
                  >
                    {rooms.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
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
                <Pager page={current} total={shown.length} pageSize={1} onChange={setPage} />
              </>
            ) : (
              <p className="mg-small-note">
                {filter === 'all'
                  ? 'Add a photo to start this gallery.'
                  : 'No photos in this room yet. Add some below.'}
              </p>
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
                        photos: draft.map(({ path, alt, cover, room }) => ({
                          path,
                          alt,
                          cover,
                          ...(room ? { room } : {}),
                        })),
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
                  <span>Room</span>
                  <select
                    value={room}
                    disabled={busy}
                    onChange={(event) => setRoom(event.target.value)}
                  >
                    {rooms.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Add photos · JPEG, PNG or WebP, up to 10 MB each</span>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy || draft.length >= saved.limit}
                    onChange={(event) => {
                      setError('');
                      const files = Array.from(event.target.files ?? []);
                      const tooBig = files.filter((file) => file.size > MAX_BYTES);
                      const space = saved.limit - draft.length;
                      const fits = files.filter((file) => file.size <= MAX_BYTES).slice(0, space);
                      if (tooBig.length)
                        setError(tooBig.map((file) => file.name).join(', ') + ' is over 10 MB.');
                      else if (fits.length < files.length)
                        setError(
                          `This gallery holds ${saved.limit} photos. Only the first ${fits.length} will be added.`,
                        );
                      setUpload(fits.map((file) => ({ file, operationId: crypto.randomUUID() })));
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
                <Button type="submit" variant="primary" disabled={busy || !upload.length}>
                  {sending
                    ? `Uploading${upload.length > 1 ? ` ${sending.index + 1} of ${upload.length}` : ''} ${Math.round(sending.progress * 100)}%…`
                    : busy
                      ? 'Saving…'
                      : upload.length > 1
                        ? `Upload ${upload.length} photos`
                        : 'Upload'}
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
