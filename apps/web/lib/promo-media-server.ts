import {
  EXTENSION,
  IMAGE_TYPES,
  PROMO_MEDIA_BUCKET,
  VIDEO_TYPES,
  mediaOwner,
  sniffType,
  type PromoMediaRef,
} from '@/lib/promo-media';

/**
 * The server half of a merchant's own image or video.
 *
 * The database checks the type and size storage recorded, but storage
 * records the type the browser declared. This reads the first bytes of what
 * actually arrived, so a renamed file is refused even if the browser checks
 * were skipped. It runs with the merchant's own session: the bucket's read
 * policy lets them read their own folder and nothing else. It holds no
 * secret, so it needs no server-only guard, but it is only called from
 * server actions and server-rendered pages.
 */

interface StorageClient {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        seconds: number,
      ): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
      createSignedUrls(
        paths: string[],
        seconds: number,
      ): Promise<{
        data: { path: string | null; signedUrl: string; error: string | null }[] | null;
        error: unknown;
      }>;
    };
  };
}

const TYPE_OF_EXTENSION = Object.fromEntries(
  Object.entries(EXTENSION).map(([type, extension]) => [extension, type]),
);

async function firstBytes(client: StorageClient, path: string): Promise<Uint8Array | null> {
  const { data, error } = await client.storage.from(PROMO_MEDIA_BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return null;
  try {
    const response = await fetch(data.signedUrl, {
      headers: { Range: 'bytes=0-31' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer()).slice(0, 32);
  } catch {
    return null;
  }
}

async function checkOne(
  client: StorageClient,
  path: string,
  allowed: readonly string[],
  what: string,
): Promise<string | null> {
  const declared = TYPE_OF_EXTENSION[path.split('.').pop() ?? ''];
  if (!declared || !allowed.includes(declared)) return `${what} has the wrong file type.`;
  const bytes = await firstBytes(client, path);
  if (!bytes) return 'The upload could not be checked. Try again.';
  if (sniffType(bytes) !== declared) {
    return `${what} is not the kind of file its name says. Export it again and choose it once more.`;
  }
  return null;
}

/**
 * Everything the server checks before the database does: the files are in
 * this merchant's folder and are what their names say. Null when they pass;
 * otherwise the sentence to show.
 */
export async function checkMerchantMedia(
  client: unknown,
  merchantId: string,
  media: PromoMediaRef | null,
): Promise<string | null> {
  if (!media) return null;
  if (media.kind !== 'image' && media.kind !== 'video') return 'Choose an image or a video.';
  for (const path of [media.path, media.posterPath]) {
    if (path && mediaOwner(path) !== merchantId) {
      return 'That file is not one of your uploads. Choose it again.';
    }
  }
  return verifyUploaded(client, media);
}

/** Null when what arrived is what it claims to be; otherwise the sentence to show. */
export async function verifyUploaded(
  client: unknown,
  media: PromoMediaRef | null,
): Promise<string | null> {
  if (!media) return null;
  const storage = client as StorageClient;
  if (media.kind === 'image') {
    return checkOne(storage, media.path, IMAGE_TYPES, 'The image');
  }
  const video = await checkOne(storage, media.path, VIDEO_TYPES, 'The video');
  if (video) return video;
  if (!media.posterPath) return 'The video needs its still frame. Choose it again.';
  return checkOne(storage, media.posterPath, IMAGE_TYPES, 'The video’s still frame');
}

/**
 * Signed links for showing files, path → URL. Paths that cannot be signed
 * (not readable by this caller, or gone) are left out, and whoever draws
 * the card falls back to the merchant's own photo.
 */
export async function signMedia(
  client: unknown,
  paths: readonly (string | null | undefined)[],
  seconds: number,
): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (!list.length) return {};
  try {
    const { data, error } = await (client as StorageClient).storage
      .from(PROMO_MEDIA_BUCKET)
      .createSignedUrls(list, seconds);
    if (error || !data) return {};
    return Object.fromEntries(
      data.flatMap((row) =>
        row.path && row.signedUrl && !row.error ? [[row.path, row.signedUrl]] : [],
      ),
    );
  } catch {
    return {};
  }
}
