'use client';

import { browserUuid } from '@/lib/browser-uuid';
import {
  checkDeclared,
  MIN_SIDE_PX,
  PROMO_MEDIA_BUCKET,
  VIDEO_MAX_SECONDS,
  mediaPath,
  sniffType,
  type PromoMediaKind,
} from '@/lib/promo-media';
import { createClient } from '@/lib/supabase/client';

/**
 * The browser half of a merchant's own image or video: checking the file
 * before anything is sent, a still frame for a video, and the upload.
 *
 * Nothing is uploaded while the merchant chooses and previews: the preview
 * plays the file from memory (an object URL). Files go up only when they
 * press Submit, so a preview they walk away from leaves nothing in storage.
 */

/** A file that passed every browser check, ready to preview and send. */
export interface PickedMedia {
  kind: PromoMediaKind;
  file: File;
  /** Plays or shows the file from memory, for the preview. */
  url: string;
  width: number;
  height: number;
  /** Seconds, for a video. */
  duration?: number;
  /** A video's still frame, captured here, shown before it plays. */
  poster?: { blob: Blob; url: string };
}

export function releasePicked(picked: PickedMedia | null) {
  if (!picked) return;
  URL.revokeObjectURL(picked.url);
  if (picked.poster) URL.revokeObjectURL(picked.poster.url);
}

const TYPE_NAMES: Record<string, string> = {
  'image/jpeg': 'a JPG',
  'image/png': 'a PNG',
  'image/webp': 'a WebP',
  'video/mp4': 'an MP4',
  'video/webm': 'a WebM',
  'video/quicktime': 'a QuickTime (.mov)',
};

/** Reads a file's first bytes. */
async function head(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 32).arrayBuffer());
}

function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('unreadable'));
    image.src = url;
  });
}

/** Resolves once the event fires, or rejects on error or after a while. */
function once(target: HTMLMediaElement, event: string, ms = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, ms);
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error('unplayable'));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      target.removeEventListener(event, done);
      target.removeEventListener('error', fail);
    };
    target.addEventListener(event, done);
    target.addEventListener('error', fail);
  });
}

/**
 * Loads the video the way a guest's browser would, so a file that will not
 * play is refused here rather than after review, and takes a still from
 * about a second in (past any fade from black) for its poster.
 */
async function inspectVideo(url: string) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await once(video, 'loadeddata');
    let duration = video.duration;
    /* Some WebM files (screen and in-browser recordings) do not say how long
       they are: seeking past the end makes the browser work it out. */
    if (duration === Infinity) {
      const ended = once(video, 'seeked');
      video.currentTime = 1e101;
      await ended;
      duration = video.duration;
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!Number.isFinite(duration) || !width || !height) throw new Error('unplayable');

    const at = Math.min(1, duration / 3);
    if (at > 0) {
      const seeked = once(video, 'seeked');
      video.currentTime = at;
      await seeked;
    }

    const scale = Math.min(1, 1280 / width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('unplayable');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    if (!blob) throw new Error('unplayable');
    return { duration, width, height, poster: blob };
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

/**
 * Every check that can be made before sending: the declared type and size,
 * the first bytes, that it opens, its dimensions and, for a video, its
 * length. Returns the file ready to preview, or the sentence to show.
 */
export async function pickMedia(
  file: File,
): Promise<{ ok: true; media: PickedMedia } | { ok: false; message: string }> {
  const declared = checkDeclared(file.type, file.size);
  if (!declared.ok) return declared;

  const actual = sniffType(await head(file));
  if (actual !== file.type) {
    const said = actual ? TYPE_NAMES[actual] : null;
    return {
      ok: false,
      message: said
        ? `That file is really ${said} file, whatever its name says. Export it as ${TYPE_NAMES[file.type]} file, or choose another.`
        : 'That file does not look like an image or a video. Export it again, or choose another.',
    };
  }

  const url = URL.createObjectURL(file);
  try {
    if (declared.kind === 'image') {
      const { width, height } = await imageSize(url);
      if (Math.min(width, height) < MIN_SIDE_PX) {
        URL.revokeObjectURL(url);
        return {
          ok: false,
          message: `That image is ${width} × ${height} pixels, which looks soft on a phone. Use one at least ${MIN_SIDE_PX} pixels on its shorter side.`,
        };
      }
      return { ok: true, media: { kind: 'image', file, url, width, height } };
    }

    const video = await inspectVideo(url);
    if (video.duration > VIDEO_MAX_SECONDS + 0.5) {
      URL.revokeObjectURL(url);
      return {
        ok: false,
        message: `That video runs ${Math.round(video.duration)} seconds. A video can be up to ${VIDEO_MAX_SECONDS} seconds: trim it and try again.`,
      };
    }
    if (Math.min(video.width, video.height) < MIN_SIDE_PX) {
      URL.revokeObjectURL(url);
      return {
        ok: false,
        message: `That video is ${video.width} × ${video.height} pixels, which looks soft on a phone. Export it at 720p or more.`,
      };
    }
    return {
      ok: true,
      media: {
        kind: 'video',
        file,
        url,
        width: video.width,
        height: video.height,
        duration: video.duration,
        poster: { blob: video.poster, url: URL.createObjectURL(video.poster) },
      },
    };
  } catch {
    URL.revokeObjectURL(url);
    return {
      ok: false,
      message:
        declared.kind === 'video'
          ? 'This browser cannot play that video, so most guests could not either. Export it as an MP4 (H.264) or WebM and try again.'
          : 'That image could not be opened. Export it again as JPG, PNG or WebP.',
    };
  }
}

/** Where an upload has got to: a fraction from 0 to 1. */
export type UploadProgress = (fraction: number) => void;

/**
 * Sends one file to the merchant's folder in promo-media. XMLHttpRequest
 * rather than fetch so the bytes sent can be shown; same endpoint, token and
 * storage policies as supabase-js. Never overwrites (x-upsert false).
 */
async function sendFile(
  path: string,
  body: Blob,
  type: string,
  onProgress?: UploadProgress,
): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Your session ended. Sign in and try again.');

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
  const url = `${base}/storage/v1/object/${PROMO_MEDIA_BUCKET}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      let message = 'The file could not be sent. Try again.';
      try {
        const reply = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        const said = reply.message ?? reply.error ?? '';
        if (/size|large/i.test(said)) message = 'That file is over the size limit.';
        else if (/mime|type/i.test(said)) message = 'That file type is not accepted.';
        else if (/policy|security|unauthori/i.test(said))
          message = 'You cannot upload for this business. Sign in again and retry.';
      } catch {
        /* Not JSON: keep the plain sentence. */
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('The connection dropped while sending. Try again.'));
    xhr.send(body);
  });
}

/**
 * Uploads a picked file (and a video's still) and returns their paths. The
 * progress covers both, weighted by size.
 */
export async function uploadPicked(
  merchantId: string,
  picked: PickedMedia,
  onProgress?: UploadProgress,
): Promise<{ kind: PromoMediaKind; path: string; posterPath: string | null }> {
  const path = mediaPath(merchantId, browserUuid(), picked.file.type);
  const posterBytes = picked.poster?.blob.size ?? 0;
  const total = picked.file.size + posterBytes;

  await sendFile(path, picked.file, picked.file.type, (fraction) =>
    onProgress?.((fraction * picked.file.size) / total),
  );

  if (!picked.poster) return { kind: picked.kind, path, posterPath: null };

  const posterPath = mediaPath(merchantId, browserUuid(), 'image/jpeg');
  try {
    await sendFile(posterPath, picked.poster.blob, 'image/jpeg', (fraction) =>
      onProgress?.((picked.file.size + fraction * posterBytes) / total),
    );
  } catch (error) {
    await removeMedia([path]);
    throw error;
  }
  return { kind: picked.kind, path, posterPath };
}

/**
 * Deletes files nothing uses any more: a replaced upload, or one whose save
 * was refused. The bucket's delete policy refuses anything still in use, so
 * a mistake here cannot take a live card down. Best effort: a file left
 * behind costs storage, not correctness.
 */
export async function removeMedia(paths: readonly (string | null | undefined)[]) {
  const list = paths.filter((path): path is string => Boolean(path));
  if (!list.length) return;
  try {
    await createClient().storage.from(PROMO_MEDIA_BUCKET).remove(list);
  } catch {
    /* Left for a later clean-up. */
  }
}
