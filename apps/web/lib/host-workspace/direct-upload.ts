import { HostWorkspaceError, type HostWorkspaceAccess } from './access';

/*
 * Direct uploads for host files.
 *
 * Vercel refuses a request body over about 4.5 MB before our code runs, so a
 * phone photo cannot come through the API as multipart. Instead the API checks
 * the file details, signs an upload for one exact path, the client sends the
 * file straight to Supabase Storage, and the API checks what arrived before it
 * records it.
 *
 * Both steps use the host member's own client (access.db), so the existing
 * storage policies decide: createSignedUploadUrl is refused unless the member
 * could insert at that path, and list only shows objects the member can read.
 */

/** Requests with this content type use the upload-url / complete steps. */
export function isJsonRequest(request: Request) {
  return Boolean(request.headers.get('content-type')?.startsWith('application/json'));
}

/** Read a small JSON body. Larger bodies are not upload steps. */
export async function readUploadStep(request: Request): Promise<unknown> {
  const body = await request.text();
  if (body.length > 4_000) throw new HostWorkspaceError(400, 'The upload request is too large.');
  return JSON.parse(body);
}

export async function signUpload(access: HostWorkspaceAccess, bucket: string, path: string) {
  const { data, error } = await access.db.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: false });
  if (error || !data) {
    if (/already exists|duplicate/i.test(error?.message ?? ''))
      throw new HostWorkspaceError(409, 'This file was already uploaded. Refresh and try again.');
    throw new HostWorkspaceError(503, 'The upload could not be started. Try again.');
  }
  return { path: data.path || path, signedUrl: data.signedUrl, token: data.token };
}

export interface UploadedObject {
  size: number;
  mime: string;
}

/**
 * The object at `path`, as the member's client can see it, or null when
 * nothing is there yet.
 */
export async function uploadedObject(
  access: HostWorkspaceAccess,
  bucket: string,
  path: string,
): Promise<UploadedObject | null> {
  const slash = path.lastIndexOf('/');
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await access.db.storage
    .from(bucket)
    .list(folder, { search: name, limit: 10 });
  if (error) throw new HostWorkspaceError(503, 'The upload could not be checked. Try again.');
  const found = data?.find((item) => item.name === name);
  if (!found) return null;
  const metadata = (found.metadata ?? {}) as { size?: unknown; mimetype?: unknown };
  return {
    size: typeof metadata.size === 'number' ? metadata.size : Number(metadata.size) || 0,
    mime: typeof metadata.mimetype === 'string' ? metadata.mimetype : '',
  };
}

/** Throws unless the uploaded object is there, not empty, within size and of the type named. */
export async function requireUploaded(
  access: HostWorkspaceAccess,
  bucket: string,
  path: string,
  expected: { mime: string; maxBytes: number },
  message: string,
) {
  const object = await uploadedObject(access, bucket, path);
  if (!object)
    throw new HostWorkspaceError(
      409,
      'The file has not finished uploading. Try the same file again.',
    );
  if (!object.size || object.size > expected.maxBytes || object.mime !== expected.mime) {
    await access.db.storage.from(bucket).remove([path]);
    throw new HostWorkspaceError(400, message);
  }
  return object;
}
