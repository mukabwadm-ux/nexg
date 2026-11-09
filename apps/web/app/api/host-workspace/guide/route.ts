import { z } from 'zod';
import {
  localHostWorkspaceEnabled,
  hostWorkspaceAccess,
  hostWorkspaceError,
  hostWorkspaceJson,
  HostWorkspaceError,
  requireWorkspaceOrigin,
} from '@/lib/host-workspace/access';
import {
  readPublishedGuide,
  requireGuideUnit,
  requireGuideWrite,
} from '@/lib/host-workspace/guides';
import { validateGlb } from '@/lib/host-workspace/guide-model';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!localHostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Guide unavailable.' }, 404);
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

export async function POST(request: Request) {
  if (!localHostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Guide unavailable.' }, 404);
  try {
    requireWorkspaceOrigin(request);
    const access = await hostWorkspaceAccess();
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
    const max = (kind === 'model' ? 12 : 2) * 1024 * 1024;
    const tooLarge = () =>
      new HostWorkspaceError(
        413,
        kind === 'model' ? 'Choose a GLB file up to 12 MB.' : 'Choose a floor plan up to 2 MB.',
      );
    if (Number(request.headers.get('content-length')) > max + 16384) throw tooLarge();
    const file = (await request.formData()).get('file');
    if (!(file instanceof File) || !file.size)
      throw new HostWorkspaceError(400, 'Choose a guide file.');
    if (file.size > max) throw tooLarge();
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
      p_mime: kind === 'model' ? 'model/gltf-binary' : file.type,
      p_base64: bytes.toString('base64'),
    });
    requireGuideWrite(error);
    return hostWorkspaceJson({
      message: kind === 'model' ? '3D model added to the draft.' : 'Floor plan added to the draft.',
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return hostWorkspaceJson({ error: 'Check the unit and guide file details.' }, 400);
    if (error instanceof TypeError)
      return hostWorkspaceJson({ error: 'Choose a valid guide file.' }, 400);
    return hostWorkspaceError(error);
  }
}
