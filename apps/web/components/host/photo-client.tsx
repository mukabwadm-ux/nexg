'use client';

import * as React from 'react';

import { setPropertyPhotos } from '@/app/host/actions';
import { createClient } from '@/lib/supabase/client';

import { Said, useAction } from './form';
import type { Photo } from './vocab';


/** Ten megabytes, and the bucket enforces it too. */
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Uploading a property photo.
 *
 * The file goes to storage from the browser and only the path
 * goes through the server action. Routing a ten-megabyte JPEG
 * through a server action would mean holding it in memory on a
 * serverless function that is billed by the millisecond, for no
 * benefit — the storage policies are the security boundary
 * either way, and they check the host id in the path.
 *
 * Previews come from signed URLs because the bucket is private.
 * A public bucket would make every property photograph findable
 * by anyone who guessed a filename.
 */
export function PropertyPhotos({
  hostId,
  propertyId,
  photos,
  signed,
}: {
  hostId: string;
  propertyId: string;
  photos: Photo[];
  /** path → signed URL, resolved on the server where the key is. */
  signed: Record<string, string>;
}) {
  const [list, setList] = React.useState<Photo[]>(photos);
  const [urls, setUrls] = React.useState<Record<string, string>>(signed);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const save = useAction();
  const input = React.useRef<HTMLInputElement>(null);

  const cover = list.find((p) => p.cover) ?? list[0] ?? null;

  const upload = async (file: File) => {
    setProblem(null);

    if (!TYPES.includes(file.type)) {
      setProblem('JPEG, PNG or WebP. A HEIC straight off an iPhone will not display for guests.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setProblem(
        `That is ${Math.round(file.size / 1048576)} MB and the limit is 10. A photo this large also takes a guest on 3G half a minute to load.`,
      );
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    /* `{host}/{property}/{random}` — the host id is first because
       the storage policy reads it from the path. */
    const path = `${hostId}/${propertyId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from('host-photos')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      setBusy(false);
      setProblem(error.message);
      return;
    }

    const { data: urlData } = await supabase.storage
      .from('host-photos')
      .createSignedUrl(path, 60 * 60);

    /* The first photo uploaded is the cover, because a property
       with photos and no cover renders a blank banner and looks
       broken rather than unset. */
    const next: Photo[] = [...list, { path, cover: list.length === 0 }];
    setList(next);
    if (urlData?.signedUrl) setUrls((u) => ({ ...u, [path]: urlData.signedUrl }));
    setBusy(false);
    save.run(() => setPropertyPhotos(propertyId, next));
    if (input.current) input.current.value = '';
  };

  const makeCover = (path: string) => {
    const next = list.map((p) => ({ ...p, cover: p.path === path }));
    setList(next);
    save.run(() => setPropertyPhotos(propertyId, next));
  };

  const remove = (path: string) => {
    const next = list.filter((p) => p.path !== path);
    /* Removing the cover promotes the next one rather than
       leaving the property with photos and no banner. */
    if (next.length > 0 && !next.some((p) => p.cover)) next[0] = { ...next[0]!, cover: true };
    setList(next);
    save.run(() => setPropertyPhotos(propertyId, next));
    void createClient().storage.from('host-photos').remove([path]);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
          Photos
        </p>
        <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold leading-[1.5]">
          The cover is the photograph across the top of your portal and in the square beside your
          name. JPEG, PNG or WebP, up to 10 MB. Up to twelve per property.
        </p>
      </div>

      {cover ? (
        <div className="border-border overflow-hidden rounded-xl border">
          <div className="bg-ink relative h-32">
            {urls[cover.path] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[cover.path]}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-muted-light absolute inset-0 flex items-center justify-center text-[0.6875rem] font-extrabold uppercase tracking-wide">
                Loading
              </span>
            )}
          </div>
          <p className="text-muted-light border-border border-t px-3 py-2 text-[0.6875rem] font-extrabold uppercase tracking-wide">
            This is your banner
          </p>
        </div>
      ) : null}

      {list.length > 1 ? (
        <div className="grid grid-cols-4 gap-2">
          {list.map((p) => (
            <div key={p.path} className="group relative">
              <div className="bg-bg border-border h-16 overflow-hidden rounded-lg border">
                {urls[p.path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[p.path]} alt={p.alt ?? ''} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="mt-1 flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => makeCover(p.path)}
                  className={`text-[0.625rem] font-extrabold ${
                    p.cover ? 'text-gold-text' : 'text-muted-light hover:text-ink'
                  }`}
                >
                  {p.cover ? 'Cover' : 'Make cover'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.path)}
                  className="text-muted-light hover:text-danger text-[0.625rem] font-extrabold"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : list.length === 1 ? (
        <button
          type="button"
          onClick={() => remove(list[0]!.path)}
          className="text-muted-light hover:text-danger text-[0.6875rem] font-extrabold"
        >
          Remove this photo
        </button>
      ) : null}

      <div>
        <input
          ref={input}
          type="file"
          accept={TYPES.join(',')}
          disabled={busy || list.length >= 12}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
          className="text-muted file:border-border-strong file:bg-bg file:text-ink w-full text-[0.75rem] font-semibold file:mr-3 file:rounded-lg file:border file:px-3 file:py-1.5 file:text-[0.75rem] file:font-extrabold"
        />
        {list.length >= 12 ? (
          <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
            Twelve is the most. Remove one to add another.
          </p>
        ) : null}
      </div>

      {busy ? (
        <p className="text-muted text-[0.75rem] font-semibold">Uploading…</p>
      ) : null}
      {problem ? (
        <p className="bg-danger/10 text-danger rounded-lg px-3 py-2.5 text-[0.75rem] font-semibold leading-[1.6]">
          {problem}
        </p>
      ) : null}
      <Said outcome={save.outcome} />
    </div>
  );
}

/** The add-a-photo prompt shown before a property exists. */
export function PhotoAfterSaving() {
  return (
    <p className="bg-bg text-muted rounded-lg px-3 py-2.5 text-[0.75rem] font-semibold leading-[1.6]">
      Add the property first, then reopen it to upload a photo. A file needs somewhere to belong
      before it can be filed, and uploading into a property that is never saved would leave the
      picture orphaned in storage.
    </p>
  );
}

