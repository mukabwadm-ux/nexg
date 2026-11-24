import { createHash } from 'node:crypto';

import { z } from 'zod';
import {
  hostWorkspaceEnabled,
  hostWorkspaceAccess,
  hostWorkspaceError,
  hostWorkspaceJson,
  HostWorkspaceError,
  requireWorkspaceOrigin,
  type HostWorkspaceAccess,
} from '@/lib/host-workspace/access';
import {
  GUIDE_ASSET_BUCKET,
  readPublishedGuide,
  requireGuideUnit,
  requireGuideWrite,
} from '@/lib/host-workspace/guides';
import { validateGlb } from '@/lib/host-workspace/guide-model';
import {
  isJsonRequest,
  readUploadStep,
  requireUploaded,
  signUpload,
  uploadedObject,
} from '@/lib/host-workspace/direct-upload';

/*
 * A unit guide's floor plan and 3D model.
 *
 * Vercel stops request bodies at about 4.5 MB, so a scanned model cannot come
 * through the API. POST JSON {action:'upload-url', unit, kind, revision, digest,
 * fileName, mime, size} returns a signed upload URL into host-guide-assets, the
 * client sends the file straight to Storage, and POST JSON {action:'complete',
 * ..., path} downloads it, checks it as the multipart upload does, and attaches
 * it to the draft. The path is fixed by the file's sha256 (digest), so a retry
 * of the same file reuses what already arrived. Multipart still works for
 * files under the body limit.
 */

export const dynamic = 'force-dynamic';

const PLAN_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MODEL_TYPE = 'model/gltf-binary';
type Kind = 'plan' | 'model';

function maxBytesFor(kind: Kind) {
  return (kind === 'model' ? 12 : 2) * 1024 * 1024;
}

function tooLarge(kind: Kind) {
  return new HostWorkspaceError(
    413,
    kind === 'model' ? 'Choose a GLB file up to 12 MB.' : 'Choose a floor plan up to 2 MB.',
  );
}

export async function GET(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Guide unavailable.' }, 404);
  const code = new URL(request.url).searchParams.get('code')?.toUpperCase() ?? '';
  try {
    const guide = await readPublishedGuide(code);
    return guide
      ? hostWorkspaceJson(guide)
      : hostWorkspaceJson({ error: 'This guide is unavailable.' }, 404);
  } catch (error) {
    return hostWorkspaceError(error);
  }
}

function isPlan(bytes: Buffer, mime: string) {
  if (mime === 'image/png')
    return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (mime === 'image/jpeg') return bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  return (
    mime === 'image/webp' &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  );
}

const stepSchema = z.object({
  unit: z.string().uuid(),
  kind: z.enum(['plan', 'model']),
  revision: z.number().int().nonnegative(),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  fileName: z.string().max(400).optional().default(''),
  mime: z.string().max(100),
  size: z.number().int(),
});
const uploadStepSchema = z.discriminatedUnion('action', [
  stepSchema.extend({ action: z.literal('upload-url') }),
  stepSchema.extend({ action: z.literal('complete'), path: z.string().max(400) }),
]);
type Step = z.infer<typeof stepSchema>;

/** The file's extension, after the same type and size checks as the multipart upload. */
function extensionFor(step: Step) {
  if (step.size <= 0) throw new HostWorkspaceError(400, 'Choose a guide file.');
  if (step.size > maxBytesFor(step.kind)) throw tooLarge(step.kind);
  if (step.kind === 'model') {
    if (step.mime !== MODEL_TYPE || !/\.glb$/i.test(step.fileName))
      throw new HostWorkspaceError(400, 'Choose a GLB file.');
    return 'glb';
  }
  const extension = PLAN_TYPES[step.mime];
  if (!extension) throw new HostWorkspaceError(400, 'Choose a PNG, JPEG or WebP floor plan.');
  return extension;
}

/** Download the stored file and run the multipart upload's checks on it, removing it if it fails. */
async function checkStoredFile(access: HostWorkspaceAccess, step: Step, path: string) {
  await requireUploaded(
    access,
    GUIDE_ASSET_BUCKET,
    path,
    { mime: step.mime, maxBytes: maxBytesFor(step.kind) },
    tooLarge(step.kind).message,
  );
  const { data, error } = await access.db.storage.from(GUIDE_ASSET_BUCKET).download(path);
  if (error || !data)
    throw new HostWorkspaceError(503, 'The upload could not be checked. Try again.');
  const bytes = Buffer.from(await data.arrayBuffer());
  try {
    if (createHash('sha256').update(bytes).digest('hex') !== step.digest)
      throw new HostWorkspaceError(400, 'The file changed while it was uploading. Try again.');
    if (step.kind === 'model') validateGlb(bytes);
    else if (!isPlan(bytes, step.mime))
      throw new HostWorkspaceError(400, 'Choose a PNG, JPEG or WebP floor plan.');
  } catch (refusal) {
    await access.db.storage.from(GUIDE_ASSET_BUCKET).remove([path]);
    throw refusal;
  }
}

/* rpc_host_workspace_guide_asset_record is newer than the generated types. */
type Recorder = {
  rpc: (
    name: 'rpc_host_workspace_guide_asset_record',
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code: string; message: string } | null }>;
};

/** The two JSON steps of a direct upload. */
async function uploadStep(request: Request) {
  const step = uploadStepSchema.parse(await readUploadStep(request));
  const extension = extensionFor(step);
  const access = await hostWorkspaceAccess(request);
  await requireGuideUnit(access, step.unit);
  const path = `${access.hostId}/${step.unit}/${step.kind}/${step.digest}.${extension}`;

  if (step.action === 'upload-url') {
    const done = hostWorkspaceJson({ path, signedUrl: null, token: null, done: true });
    // The same file already reached Storage (a retry after the connection
    // dropped, or the guide changed before it was recorded): skip the send and
    // let complete check the stored file. Signing again would be refused as a
    // duplicate, because the path is fixed by the file's digest.
    if (await uploadedObject(access, GUIDE_ASSET_BUCKET, path)) return done;
    try {
      return hostWorkspaceJson(await signUpload(access, GUIDE_ASSET_BUCKET, path));
    } catch (error) {
      if (error instanceof HostWorkspaceError && error.status === 409) return done;
      throw error;
    }
  }

  if (step.path !== path)
    throw new HostWorkspaceError(400, 'This upload does not belong to this guide.');
  await checkStoredFile(access, step, path);
  const { error } = await (access.db as unknown as Recorder).rpc(
    'rpc_host_workspace_guide_asset_record',
    {
      p_unit_id: step.unit,
      p_revision: step.revision,
      p_kind: step.kind,
      p_path: path,
      p_digest: step.digest,
    },
  );
  requireGuideWrite(error);
  return hostWorkspaceJson({
    message:
      step.kind === 'model' ? '3D model added to the draft.' : 'Floor plan added to the draft.',
  });
}

/**
 * Attach a floor plan or 3D model to the guide draft: the JSON upload-url /
 * complete steps for any size, or multipart (?unit=&kind=&revision=, file) for
 * files under the request body limit.
 */
export async function POST(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Guide unavailable.' }, 404);
  try {
    requireWorkspaceOrigin(request);
    if (isJsonRequest(request)) return await uploadStep(request);
    const access = await hostWorkspaceAccess(request);
    const params = new URL(request.url).searchParams;
    const unitId = z.string().uuid().parse(params.get('unit'));
    const kind = z.enum(['plan', 'model']).parse(params.get('kind'));
    const revision = z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().nonnegative())
      .parse(params.get('revision'));
    await requireGuideUnit(access, unitId);
    const max = maxBytesFor(kind);
    if (Number(request.headers.get('content-length')) > max + 16384) throw tooLarge(kind);
    const file = (await request.formData()).get('file');
    if (!(file instanceof File) || !file.size)
      throw new HostWorkspaceError(400, 'Choose a guide file.');
    if (file.size > max) throw tooLarge(kind);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (kind === 'model') {
      if (!/\.glb$/i.test(file.name)) throw new HostWorkspaceError(400, 'Choose a GLB file.');
      validateGlb(bytes);
    } else if (!isPlan(bytes, file.type)) {
      throw new HostWorkspaceError(400, 'Choose a PNG, JPEG or WebP floor plan.');
    }
    const { error } = await access.db.rpc('rpc_host_workspace_guide_asset_put', {
      p_unit_id: unitId,
      p_revision: revision,
      p_kind: kind,
      p_mime: kind === 'model' ? MODEL_TYPE : file.type,
      p_base64: bytes.toString('base64'),
    });
    requireGuideWrite(error);
    return hostWorkspaceJson({
      message: kind === 'model' ? '3D model added to the draft.' : 'Floor plan added to the draft.',
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return hostWorkspaceJson({ error: 'Check the unit and guide file details.' }, 400);
    if (error instanceof TypeError)
      return hostWorkspaceJson({ error: 'Choose a valid guide file.' }, 400);
    return hostWorkspaceError(error);
  }
}
