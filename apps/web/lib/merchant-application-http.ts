import { randomUUID } from 'node:crypto';
import { MerchantApplicationCommand } from '@nexg/contracts/merchant-application';

export type ApplicationPorts = {
  enabled: boolean;
  emailVerificationRequired?: boolean;
  authenticate: () => Promise<
    boolean | {
      authenticated: boolean;
      anonymous: boolean;
      email?: string | null;
      emailConfirmed?: boolean;
    }
  >;
  verifyApplicationEmail?: (
    merchantId: string,
    email: string,
    signal: AbortSignal,
  ) => Promise<boolean>;
  rpc: (
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<{ data: unknown; error: null | { code?: string; message?: string; hint?: string } }>;
};
const limit = 96 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class RequestFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function sameOriginMutation(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const supplied = new URL(origin);
    const internal = new URL(request.url);
    const host = request.headers.get('host') ?? internal.host;
    const forwardedProtocol = request.headers.get('x-forwarded-proto');
    const protocol =
      forwardedProtocol === 'https' || forwardedProtocol === 'http'
        ? `${forwardedProtocol}:`
        : internal.protocol;
    // Next may reconstruct an internal localhost URL while the browser uses
    // the requested Host, especially for loopback aliases and reverse proxies.
    return (
      supplied.origin === origin &&
      supplied.host === host.toLowerCase() &&
      supplied.protocol === protocol
    );
  } catch {
    return false;
  }
}
async function body(request: Request, signal: AbortSignal) {
  if (request.headers.get('content-type')?.split(';')[0]?.toLowerCase() !== 'application/json')
    throw new RequestFailure(415, 'unsupported_media_type', 'Use application/json.');
  if (request.headers.has('content-encoding'))
    throw new RequestFailure(
      415,
      'unsupported_encoding',
      'Compressed request bodies are not supported.',
    );
  const reader = request.body?.getReader();
  if (!reader) throw new RequestFailure(400, 'invalid_request', 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => {
    void reader.cancel();
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestFailure(413, 'payload_too_large', 'Request exceeds 96 KiB.');
      }
      chunks.push(value);
    }
    if (signal.aborted)
      throw new RequestFailure(504, 'deadline_exceeded', 'The request deadline expired.');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof RequestFailure) throw error;
    throw new RequestFailure(400, 'invalid_json', 'The request is not valid JSON.');
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
export function applicationHandler(ports: ApplicationPorts) {
  return async function handle(request: Request): Promise<Response> {
    const supplied = request.headers.get('x-request-id');
    const requestId = supplied && uuid.test(supplied) ? supplied : randomUUID();
    const headers = {
      'cache-control': 'private, no-store',
      'x-request-id': requestId,
      vary: 'Cookie, Origin',
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const problem = (
      status: number,
      code: string,
      detail: string,
      extra: Record<string, string> = {},
    ) =>
      Response.json(
        { type: `urn:nexg:problem:${code}`, title: code, status, detail, request_id: requestId },
        { status, headers: { ...headers, ...extra, 'content-type': 'application/problem+json' } },
      );
    try {
      if (!ports.enabled)
        return problem(404, 'not_available', 'The connected registration flow is not enabled.');
      if (!sameOriginMutation(request))
        return problem(
          403,
          'origin_rejected',
          'Open registration from this website before saving.',
        );
      const actor = await Promise.race([
        ports.authenticate(),
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener(
            'abort',
            () =>
              reject(
                new RequestFailure(
                  504,
                  'deadline_exceeded',
                  'Authentication could not be confirmed.',
                ),
              ),
            { once: true },
          ),
        ),
      ]);
      const authenticated = typeof actor === 'boolean' ? actor : actor.authenticated;
      const anonymous = typeof actor === 'boolean' ? false : actor.anonymous;
      const email = typeof actor === 'boolean' ? undefined : actor.email;
      const emailConfirmed = typeof actor === 'boolean' ? false : actor.emailConfirmed === true;
      if (!authenticated)
        return problem(401, 'sign_in_required', 'Sign in to save or open your application.');
      let name: string, args: Record<string, unknown>;
      if (request.method === 'GET') {
        const query = new URL(request.url).searchParams;
        const operationId = query.get('operationId');
        const id = query.get('merchantId') ?? operationId;
        if (
          !id ||
          !uuid.test(id) ||
          (operationId && query.has('merchantId')) ||
          [...query.keys()].some((key) => !['merchantId', 'operationId', 'view'].includes(key))
        )
          return problem(400, 'invalid_request', 'Choose one valid application.');
        if (query.get('view') && !['application', 'payout'].includes(query.get('view')!))
          return problem(400, 'invalid_request', 'Unknown application view.');
        if (anonymous && query.get('view') === 'payout')
          return problem(403, 'access_denied', 'Create your merchant account before opening payout details.');
        if (operationId && query.has('view'))
          return problem(400, 'invalid_request', 'Operation lookup has no data view.');
        name = operationId
          ? 'rpc_merchant_application_operation_read'
          : query.get('view') === 'payout'
            ? 'rpc_merchant_application_payout_read'
            : 'rpc_merchant_application_read';
        args = operationId ? { p_operation_id: id } : { p_merchant_id: id };
      } else if (request.method === 'POST') {
        const command = MerchantApplicationCommand.safeParse(
          await body(request, controller.signal),
        );
        if (!command.success)
          return problem(
            422,
            'invalid_request',
            'Check the supplied fields, selection and draft limits.',
          );
        const input = command.data;
        if (anonymous && (input.command === 'payout' || input.command === 'activity'))
          return problem(403, 'access_denied', 'Create your merchant account before using this workspace action.');
        if (input.command === 'submit' && ports.emailVerificationRequired) {
          if (anonymous || !email || !emailConfirmed)
            return problem(
              403,
              'email_verification_required',
              'Verify the business email address before submitting this application.',
            );
          if (!ports.verifyApplicationEmail)
            return problem(
              503,
              'application_unavailable',
              'Email verification could not be confirmed. Reload before retrying.',
            );
          if (!(await ports.verifyApplicationEmail(input.merchantId, email, controller.signal)))
            return problem(
              403,
              'email_verification_required',
              'Verify the email address saved on this application before submitting.',
            );
        }
        if (input.command === 'start') {
          name = 'rpc_merchant_application_start';
          args = {
            p_operation_id: input.operationId,
            p_payload: input.capture,
            p_merchant_id: input.merchantId ?? null,
          };
        } else if (input.command === 'save') {
          name = 'rpc_merchant_application_save';
          args = {
            p_merchant_id: input.merchantId,
            p_expected_revision: input.expectedRevision,
            p_operation_id: input.operationId,
            p_payload: input.capture,
          };
        } else if (input.command === 'submit') {
          name = 'rpc_merchant_application_submit';
          args = {
            p_merchant_id: input.merchantId,
            p_expected_revision: input.expectedRevision,
            p_operation_id: input.operationId,
          };
        } else if (input.command === 'payout') {
          name = 'rpc_merchant_application_payout_save';
          args = {
            p_merchant_id: input.merchantId,
            p_expected_version: input.expectedVersion,
            p_operation_id: input.operationId,
            p_payout: input.payout,
          };
        } else {
          name = 'rpc_merchant_session_activity';
          args = { p_merchant_id: input.merchantId };
        }
      } else return problem(405, 'method_not_allowed', 'Use GET or POST.');
      if (controller.signal.aborted)
        throw new RequestFailure(
          504,
          'deadline_exceeded',
          'The operation outcome is unknown. Reload before retrying the same operation.',
        );
      const result = await ports.rpc(name, args, controller.signal);
      if (result.error) {
        const code = result.error.code;
        if (code === 'P4290') {
          const seconds = /^\d+$/.test(result.error.hint ?? '') ? Number(result.error.hint) : 0;
          return problem(
            429,
            'rate_limited',
            'Too many application requests. Wait before retrying the same operation.',
            Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86400
              ? { 'retry-after': String(seconds) }
              : {},
          );
        }
        if (['40001', '23505'].includes(code ?? ''))
          return problem(
            409,
            'revision_conflict',
            'The application changed or this operation key was used differently. Reload before editing.',
          );
        if (['42501', '28000'].includes(code ?? ''))
          return problem(
            403,
            'access_denied',
            'This session cannot perform this operation. Sign in again or contact support.',
          );
        if (['22023', '23514'].includes(code ?? ''))
          return problem(
            422,
            'invalid_request',
            'The supplied application or payout details are not valid for this operation.',
          );
        if (code === 'P0002')
          return problem(404, 'application_not_found', 'The requested application is unavailable.');
        return problem(
          503,
          'application_unavailable',
          'The operation could not be confirmed. Reload before retrying with the same operation key.',
        );
      }
      return Response.json({ data: result.data, request_id: requestId }, { headers });
    } catch (error) {
      if (error instanceof RequestFailure) return problem(error.status, error.code, error.message);
      return problem(
        controller.signal.aborted ? 504 : 503,
        controller.signal.aborted ? 'deadline_exceeded' : 'application_unavailable',
        'The outcome could not be confirmed. Reload before retrying with the same operation key.',
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
