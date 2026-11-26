import { createHash } from 'node:crypto';

import { z } from 'zod';

import { coverOf, photosOf, type Photo } from '@/lib/host-workspace/vocab';
import {
  HostWorkspaceError, localHostWorkspaceEnabled, hostWorkspaceAccess, hostWorkspaceError,
  hostWorkspaceJson, requireWorkspaceOrigin, type HostWorkspaceAccess,
} from '@/lib/host-workspace/access';

export const dynamic = 'force-dynamic';
const maxBytes = 10 * 1024 * 1024;
const targetSchema = z.object({ kind: z.enum(['property', 'unit']), id: z.string().uuid() });
const photoSchema = z.object({ path: z.string(), alt: z.string().max(160).optional(), cover: z.boolean().optional() });
type Target = z.infer<typeof targetSchema>;

function targetFrom(request: Request) {
  const query = new URL(request.url).searchParams;
  return targetSchema.parse({ kind: query.get('kind'), id: query.get('id') });
}

async function gallery(access: HostWorkspaceAccess, target: Target) {
  if (
    access.unitScope &&
    (target.kind === 'property' || !access.unitScope.includes(target.id))
  ) throw new HostWorkspaceError(403, 'This gallery is outside your workspace access.');

  const { db, hostId } = access;
  const result = target.kind === 'property'
    ? await db.from('property').select('photos').eq('host_id', hostId).eq('id', target.id).is('deleted_at', null).maybeSingle()
    : await db.from('unit').select('photos').eq('host_id', hostId).eq('id', target.id).is('archived_at', null).maybeSingle();
  if (result.error) throw new HostWorkspaceError(503, 'The gallery could not be loaded.');
  if (!result.data) throw new HostWorkspaceError(404, 'This gallery could not be found.');
  return result.data.photos ?? [];
}

function revision(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function view(access: HostWorkspaceAccess, target: Target, raw: Awaited<ReturnType<typeof gallery>>) {
  const photos = photosOf(raw);
  const { data: signed } = photos.length
    ? await access.db.storage.from('host-photos').createSignedUrls(photos.map(photo => photo.path), 3600)
    : { data: [] };
  const urls = new Map(signed?.map(row => [row.path, row.signedUrl]));
  const cover = coverOf(photos);
  return hostWorkspaceJson({
    version: revision(raw), limit: target.kind === 'property' ? 12 : 8,
    photos: photos.map(photo => ({...photo, cover: photo.path === cover?.path, url: urls.get(photo.path) ?? ''})),
  });
}

async function save(access: HostWorkspaceAccess, target: Target, previous: Awaited<ReturnType<typeof gallery>>, photos: Photo[]) {
  const { error } = await access.db.rpc('rpc_host_workspace_photos_set', {
    p_kind: target.kind, p_id: target.id, p_expected: previous,
    p_photos: photos.map(({path,alt,cover}) => ({path,alt,cover})),
  });
  if (error?.code === '40001') return false;
  if (error?.code === '42501') throw new HostWorkspaceError(403, 'This gallery is outside your workspace access.');
  if (error?.code === '22023') throw new HostWorkspaceError(400, error.message);
  if (error) throw new HostWorkspaceError(503, 'The gallery save could not be confirmed. Refresh before trying again.');
  return true;
}

function respond(error: unknown) {
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return hostWorkspaceJson({error:'Choose a valid photo or gallery.'},400);
  return hostWorkspaceError(error);
}

export async function GET(request: Request) {
  if (!localHostWorkspaceEnabled()) return hostWorkspaceJson({error:'Workspace unavailable.'},404);
  try {
    const target = targetFrom(request);
    const access = await hostWorkspaceAccess();
    return await view(access,target,await gallery(access,target));
  } catch (error) { return respond(error); }
}

export async function POST(request: Request) {
  if (!localHostWorkspaceEnabled()) return hostWorkspaceJson({error:'Workspace unavailable.'},404);
  try {
    requireWorkspaceOrigin(request);
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data') ||
      Number(request.headers.get('content-length')) > maxBytes + 16_000)
      throw new HostWorkspaceError(400, 'Choose a PNG, JPEG or WebP photo up to 10 MB.');

    const target = targetFrom(request);
    const access = await hostWorkspaceAccess();
    const form = await request.formData();
    const operationId = z.string().uuid().parse(form.get('operationId'));
    const file = form.get('file');
    const extension = file instanceof File && ({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'} as Record<string,string>)[file.type];
    if (!(file instanceof File) || !extension || !file.size || file.size > maxBytes)
      throw new HostWorkspaceError(400, 'Choose a PNG, JPEG or WebP photo up to 10 MB.');
    const alt = z.string().trim().max(160).parse(form.get('alt') ?? '');
    const path = access.hostId + '/' + target.id + '/' + operationId + '.' + extension;
    let current = await gallery(access,target);
    const initial = photosOf(current);
    if (initial.some(photo => photo.path === path)) return await view(access,target,current);
    if (initial.length >= (target.kind === 'property' ? 12 : 8))
      throw new HostWorkspaceError(400, 'Remove one photo before adding another.');

    const { error } = await access.db.storage.from('host-photos').upload(path,file,{contentType:file.type,upsert:false});
    if (error && !/already exists|duplicate/i.test(error.message))
      throw new HostWorkspaceError(503, 'The photo upload could not be confirmed. Retry the same file.');

    for (let attempt = 0; attempt < 3; attempt++) {
      const photos = photosOf(current);
      if (photos.some(photo => photo.path === path)) return await view(access,target,current);
      if (await save(access,target,current,[...photos,{path,alt,cover:photos.length === 0}]))
        return await view(access,target,await gallery(access,target));
      current = await gallery(access,target);
    }
    throw new HostWorkspaceError(409, 'The gallery is being edited. Refresh and retry the same photo.');
  } catch (error) { return respond(error); }
}

export async function PATCH(request: Request) {
  if (!localHostWorkspaceEnabled()) return hostWorkspaceJson({error:'Workspace unavailable.'},404);
  try {
    requireWorkspaceOrigin(request);
    const target = targetFrom(request);
    const access = await hostWorkspaceAccess();
    const body = await request.text();
    if (body.length > 20_000) throw new HostWorkspaceError(400, 'The gallery update is too large.');
    const update = z.object({version:z.string().length(64),photos:z.array(photoSchema).max(12)}).parse(JSON.parse(body));
    const current = await gallery(access,target);
    const allowed = new Set(photosOf(current).map(photo => photo.path));
    if (update.photos.some(photo => !allowed.has(photo.path)) ||
        new Set(update.photos.map(photo => photo.path)).size !== update.photos.length)
      throw new HostWorkspaceError(400, 'Choose photos from this gallery.');
    const cover = coverOf(update.photos)?.path;
    const next = update.photos.map(photo => ({...photo,cover:photo.path === cover}));
    if (revision(current) !== update.version || !await save(access,target,current,next))
      throw new HostWorkspaceError(409, 'The gallery changed. Refresh before saving again.');
    return await view(access,target,await gallery(access,target));
  } catch (error) { return respond(error); }
}
