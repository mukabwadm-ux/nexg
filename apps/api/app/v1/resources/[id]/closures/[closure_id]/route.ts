/**
 * DELETE /v1/resources/[id]/closures/[closure_id]?expected_version=N
 *
 * Opens a closed time again. Needs the resource's version you read (in the
 * query, as a DELETE has no body) and an Idempotency-Key; a live key with
 * catalogue_write.
 */
import { jsonError, withErrorEnvelope } from '@/lib/http';
import { ENGINE_ID, setupChange } from '@/lib/reservation-routes';
import { ApiResource } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string; closure_id: string } }) => {
    const version = new URL(request.url).searchParams.get('expected_version');
    if (!version || !/^[1-9]\d{0,9}$/.test(version)) {
      return jsonError('invalid_request', 'Send the resource’s version as ?expected_version=.', {
        fields: { expected_version: 'The version from GET /v1/resources, a whole number.' },
      });
    }
    if (!ENGINE_ID.test(params.closure_id)) {
      return jsonError('invalid_request', 'Invalid closure ID', {
        fields: { closure_id: 'The id of a closure, from GET /v1/resources.' },
      });
    }
    return setupChange(request, {
      method: 'DELETE',
      path: `/v1/platform/resources/${encodeURIComponent(params.id)}/closures/${encodeURIComponent(params.closure_id)}`,
      id: params.id,
      query: { expected_version: version },
      result: ApiResource,
      name: 'resource',
    });
  },
);
