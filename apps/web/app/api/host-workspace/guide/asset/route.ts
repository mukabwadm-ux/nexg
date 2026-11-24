import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  hostWorkspaceEnabled,
  hostWorkspaceAccess,
  hostWorkspaceError,
  hostWorkspaceJson,
  HostWorkspaceError,
} from '@/lib/host-workspace/access';
import { GUIDE_ASSET_BUCKET, guideCode } from '@/lib/host-workspace/guides';

export const dynamic = 'force-dynamic';

const mime = z.enum(['image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary']);
/* Files stored before direct uploads keep their bytes in the database; newer ones are in Storage. */
const asset = z.union([
  z.object({ mime, base64: z.string() }),
  z.object({ mime, path: z.string().min(1) }),
]);

/** How long a guide file's signed Storage link lasts. The page asks again on every load. */
const SIGNED_SECONDS = 600;

export async function GET(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Guide file unavailable.' }, 404);
  const params = new URL(request.url).searchParams;
  const id = z.string().uuid().safeParse(params.get('id'));
  const code = params.get('code')?.toUpperCase() ?? null;
  if (!id.success || (code !== null && !guideCode.test(code)))
    return hostWorkspaceJson({ error: 'Guide file unavailable.' }, 404);
  try {
    const db = code ? createClient() : (await hostWorkspaceAccess(request)).db;
    const { data, error } = await db.rpc('rpc_host_workspace_guide_asset', {
      p_id: id.data,
      p_code: code ?? undefined,
    });
    if (error) throw new HostWorkspaceError(503, 'The guide file could not be loaded.');
    const decoded = asset.safeParse(data);
    if (!decoded.success) return hostWorkspaceJson({ error: 'Guide file unavailable.' }, 404);
    if ('path' in decoded.data) {
      // A model can be larger than a function response may be, so the browser
      // fetches it from Storage. The storage policies allow the host members of
      // the unit, and anyone for a file the published guide uses.
      const signed = await db.storage
        .from(GUIDE_ASSET_BUCKET)
        .createSignedUrl(decoded.data.path, SIGNED_SECONDS);
      if (signed.error || !signed.data?.signedUrl)
        throw new HostWorkspaceError(503, 'The guide file could not be loaded.');
      return new Response(null, {
        status: 302,
        headers: {
          Location: signed.data.signedUrl,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    return new Response(new Uint8Array(Buffer.from(decoded.data.base64, 'base64')), {
      headers: {
        'Content-Type': decoded.data.mime,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return hostWorkspaceError(error);
  }
}
