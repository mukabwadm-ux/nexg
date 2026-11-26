import { localHostWorkspaceEnabled } from '@/lib/host-workspace/routes';
import { guideCode } from '@/lib/host-workspace/guides';
import { hostWorkspaceHtml } from '@/lib/host-workspace/shell';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { code: string } }) {
  if (!localHostWorkspaceEnabled() || !guideCode.test(params.code.toUpperCase())) {
    return new Response('Guide unavailable.', { status: 404 });
  }
  return hostWorkspaceHtml();
}
