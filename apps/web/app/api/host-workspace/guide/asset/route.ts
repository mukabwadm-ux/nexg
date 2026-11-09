import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  hostWorkspaceEnabled,
  hostWorkspaceAccess,
  hostWorkspaceError,
  hostWorkspaceJson,
  HostWorkspaceError,
} from '@/lib/host-workspace/access';
import { guideCode } from '@/lib/host-workspace/guides';

export const dynamic = 'force-dynamic';

const asset = z.object({
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary']),
  base64: z.string(),
});

export async function GET(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Guide file unavailable.' }, 404);
  const params = new URL(request.url).searchParams;
  const id = z.string().uuid().safeParse(params.get('id'));
  const code = params.get('code')?.toUpperCase() ?? null;
  if (!id.success || (code !== null && !guideCode.test(code)))
    return hostWorkspaceJson({ error: 'Guide file unavailable.' }, 404);
  try {
    const db = code ? createClient() : (await hostWorkspaceAccess()).db;
    const { data, error } = await db.rpc('rpc_host_workspace_guide_asset', {
      p_id: id.data,
      p_code: code ?? undefined,
    });
    if (error) throw new HostWorkspaceError(503, 'The guide file could not be loaded.');
    const decoded = asset.safeParse(data);
    if (!decoded.success) return hostWorkspaceJson({ error: 'Guide file unavailable.' }, 404);
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
