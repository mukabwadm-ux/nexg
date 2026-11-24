import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  coverOf,
  PHOTO_LIMIT,
  PHOTO_ROOMS,
  photosOf,
  type Photo,
  type PhotoRoom,
} from '@/lib/host-workspace/vocab';
import {
  HostWorkspaceError,
  hostWorkspaceEnabled,
  hostWorkspaceAccess,
  hostWorkspaceError,
  hostWorkspaceJson,
  requireWorkspaceOrigin,
  type HostWorkspaceAccess,
} from '@/lib/host-workspace/access';
import {
  isJsonRequest,
  readUploadStep,
  requireUploaded,
  signUpload,
} from '@/lib/host-workspace/direct-upload';

/*
 * Large photos skip the API body (Vercel stops request bodies at about 4.5 MB):
 * POST JSON {action:'upload-url', room, mime, size, operationId} returns a
 * signed upload URL, the client sends the file straight to Storage, and
 * POST JSON {action:'complete', room, mime, size, operationId, alt, path}
 * adds it to the gallery. Multipart still works for small files.
 */

export const dynamic = 'force-dynamic';
const BUCKET = 'host-photos';
const BAD_PHOTO = 'Choose a PNG, JPEG or WebP photo up to 10 MB.';
const PHOTO_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const maxBytes = 10 * 1024 * 1024;
const targetSchema = z.object({ kind: z.enum(['property', 'unit']), id: z.string().uuid() });
const photoSchema = z.object({
  path: z.string(),
  alt: z.string().max(160).optional(),
  cover: z.boolean().optional(),
  room: z.enum(PHOTO_ROOMS.map((room) => room.value) as [PhotoRoom, ...PhotoRoom[]]).optional(),
});
const roomSchema = photoSchema.shape.room;
type Target = z.infer<typeof targetSchema>;

function targetFrom(request: Request) {
  const query = new URL(request.url).searchParams;
  return targetSchema.parse({ kind: query.get('kind'), id: query.get('id') });
}

async function gallery(access: HostWorkspaceAccess, target: Target) {
  if (access.unitScope && (target.kind === 'property' || !access.unitScope.includes(target.id)))
    throw new HostWorkspaceError(403, 'This gallery is outside your workspace access.');

  const { db, hostId } = access;
  const result =
    target.kind === 'property'
      ? await db
          .from('property')
          .select('photos')
          .eq('host_id', hostId)
          .eq('id', target.id)
          .is('deleted_at', null)
          .maybeSingle()
      : await db
          .from('unit')
          .select('photos')
          .eq('host_id', hostId)
          .eq('id', target.id)
          .is('archived_at', null)
          .maybeSingle();
  if (result.error) throw new HostWorkspaceError(503, 'The gallery could not be loaded.');
  if (!result.data) throw new HostWorkspaceError(404, 'This gallery could not be found.');
  return result.data.photos ?? [];
}

function revision(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function view(
  access: HostWorkspaceAccess,
  target: Target,
  raw: Awaited<ReturnType<typeof gallery>>,
) {
  const photos = photosOf(raw);
  const { data: signed } = photos.length
    ? await access.db.storage.from('host-photos').createSignedUrls(
        photos.map((photo) => photo.path),
        3600,
      )
    : { data: [] };
  const urls = new Map(signed?.map((row) => [row.path, row.signedUrl]));
  const cover = coverOf(photos);
  return hostWorkspaceJson({
    version: revision(raw),
    limit: PHOTO_LIMIT[target.kind],
    rooms: PHOTO_ROOMS,
    photos: photos.map((photo) => ({
      ...photo,
      cover: photo.path === cover?.path,
      url: urls.get(photo.path) ?? '',
    })),
  });
}

async function save(
  access: HostWorkspaceAccess,
  target: Target,
  previous: Awaited<ReturnType<typeof gallery>>,
  photos: Photo[],
) {
  const { error } = await access.db.rpc('rpc_host_workspace_photos_set', {
    p_kind: target.kind,
    p_id: target.id,
    p_expected: previous,
    p_photos: photos.map(({ path, alt, cover, room }) => ({ path, alt, cover, room })),
  });
  if (error?.code === '40001') return false;
  if (error?.code === '42501')
    throw new HostWorkspaceError(403, 'This gallery is outside your workspace access.');
  if (error?.code === '22023') throw new HostWorkspaceError(400, error.message);
  if (error)
    throw new HostWorkspaceError(
      503,
      'The gallery save could not be confirmed. Refresh before trying again.',
    );
  return true;
}

function respond(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return hostWorkspaceJson({ error: 'Choose a valid photo or gallery.' }, 400);
  return hostWorkspaceError(error);
}

export async function GET(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    const target = targetFrom(request);
    const access = await hostWorkspaceAccess(request);
    return await view(access, target, await gallery(access, target));
  } catch (error) {
    return respond(error);
  }
}

const stepSchema = z.object({
  operationId: z.string().uuid(),
  mime: z.string().max(100),
  size: z.number().int(),
  room: z.union([roomSchema, z.literal('')]).optional(),
  alt: z.string().trim().max(160).optional().default(''),
});
const uploadStepSchema = z.discriminatedUnion('action', [
  stepSchema.extend({ action: z.literal('upload-url') }),
  stepSchema.extend({ action: z.literal('complete'), path: z.string().max(400) }),
]);

function photoExtension(mime: string, size: number) {
  const extension = PHOTO_EXTENSIONS[mime];
  if (!extension || size <= 0 || size > maxBytes) throw new HostWorkspaceError(400, BAD_PHOTO);
  return extension;
}

type Gallery = Awaited<ReturnType<typeof gallery>>;

/** The gallery as it stands, after checking there is room for one more photo at `path`. */
async function roomForOneMore(access: HostWorkspaceAccess, target: Target, path: string) {
  const current = await gallery(access, target);
  const photos = photosOf(current);
  const present = photos.some((photo) => photo.path === path);
  if (!present && photos.length >= PHOTO_LIMIT[target.kind])
    throw new HostWorkspaceError(400, 'Remove one photo before adding another.');
  return { current, present };
}

/** Add the stored photo at `path` to the gallery, retrying if someone else saved first. */
async function addToGallery(
  access: HostWorkspaceAccess,
  target: Target,
  initial: Gallery,
  photo: { path: string; alt: string; room?: PhotoRoom },
) {
  let current = initial;
  const { path, alt, room } = photo;
  for (let attempt = 0; attempt < 3; attempt++) {
    const photos = photosOf(current);
    if (photos.some((item) => item.path === path)) return await view(access, target, current);
    if (
      await save(access, target, current, [
        ...photos,
        { path, alt, cover: photos.length === 0, ...(room ? { room } : {}) },
      ])
    )
      return await view(access, target, await gallery(access, target));
    current = await gallery(access, target);
  }
  throw new HostWorkspaceError(
    409,
    'The gallery is being edited. Refresh and retry the same photo.',
  );
}

/** The two JSON steps of a direct upload. */
async function uploadStep(request: Request) {
  const target = targetFrom(request);
  const step = uploadStepSchema.parse(await readUploadStep(request));
  const extension = photoExtension(step.mime, step.size);
  const access = await hostWorkspaceAccess(request);
  const path = access.hostId + '/' + target.id + '/' + step.operationId + '.' + extension;
  const { current, present } = await roomForOneMore(access, target, path);

  if (step.action === 'upload-url') {
    if (present) return hostWorkspaceJson({ path, signedUrl: null, token: null, done: true });
    return hostWorkspaceJson(await signUpload(access, BUCKET, path));
  }

  if (step.path !== path)
    throw new HostWorkspaceError(400, 'This upload does not belong to this gallery.');
  if (present) return await view(access, target, current);
  await requireUploaded(access, BUCKET, path, { mime: step.mime, maxBytes }, BAD_PHOTO);
  const room = step.room || undefined;
  return await addToGallery(access, target, current, { path, alt: step.alt, room });
}

/**
 * Add one photo: multipart (file, operationId, alt, room) for small files, or
 * the JSON upload-url / complete steps for any size.
 */
export async function POST(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    requireWorkspaceOrigin(request);
    if (isJsonRequest(request)) return await uploadStep(request);
    if (
      !request.headers.get('content-type')?.startsWith('multipart/form-data') ||
      Number(request.headers.get('content-length')) > maxBytes + 16_000
    )
      throw new HostWorkspaceError(400, BAD_PHOTO);

    const target = targetFrom(request);
    const access = await hostWorkspaceAccess(request);
    const form = await request.formData();
    const operationId = z.string().uuid().parse(form.get('operationId'));
    const file = form.get('file');
    const extension = file instanceof File ? PHOTO_EXTENSIONS[file.type] : undefined;
    if (!(file instanceof File) || !extension || !file.size || file.size > maxBytes)
      throw new HostWorkspaceError(400, BAD_PHOTO);
    const alt = z
      .string()
      .trim()
      .max(160)
      .parse(form.get('alt') ?? '');
    const room = roomSchema.parse(form.get('room') || undefined);
    const path = access.hostId + '/' + target.id + '/' + operationId + '.' + extension;
    const { current, present } = await roomForOneMore(access, target, path);
    if (present) return await view(access, target, current);

    const { error } = await access.db.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error && !/already exists|duplicate/i.test(error.message))
      throw new HostWorkspaceError(
        503,
        'The photo upload could not be confirmed. Retry the same file.',
      );

    return await addToGallery(access, target, current, { path, alt, room });
  } catch (error) {
    return respond(error);
  }
}

export async function PATCH(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    requireWorkspaceOrigin(request);
    const target = targetFrom(request);
    const access = await hostWorkspaceAccess(request);
    const body = await request.text();
    if (body.length > 60_000) throw new HostWorkspaceError(400, 'The gallery update is too large.');
    const update = z
      .object({
        version: z.string().length(64),
        photos: z.array(photoSchema).max(PHOTO_LIMIT[target.kind]),
      })
      .parse(JSON.parse(body));
    const current = await gallery(access, target);
    const allowed = new Set(photosOf(current).map((photo) => photo.path));
    if (
      update.photos.some((photo) => !allowed.has(photo.path)) ||
      new Set(update.photos.map((photo) => photo.path)).size !== update.photos.length
    )
      throw new HostWorkspaceError(400, 'Choose photos from this gallery.');
    const cover = coverOf(update.photos)?.path;
    const next = update.photos.map((photo) => ({ ...photo, cover: photo.path === cover }));
    if (revision(current) !== update.version || !(await save(access, target, current, next)))
      throw new HostWorkspaceError(409, 'The gallery changed. Refresh before saving again.');
    return await view(access, target, await gallery(access, target));
  } catch (error) {
    return respond(error);
  }
}
