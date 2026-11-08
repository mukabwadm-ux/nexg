import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** Public anonymous paging isolation only. This grants no identity or private access. */
export class AnonymousCallerScopes {
  readonly #secret = randomBytes(32);
  #sign(value: string): string { return createHmac('sha256', this.#secret).update(value).digest('base64url'); }
  resolve(request: FastifyRequest, reply: FastifyReply): string {
    const cookies = (request.headers.cookie ?? '').split(';').map(value => value.trim());
    const values = cookies.filter(value => value.startsWith('nexg_discovery_page='));
    if (values.length === 1) {
      const match = /^nexg_discovery_page=([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(values[0]!);
      if (match) {
        const expected = Buffer.from(this.#sign(match[1]!)); const actual = Buffer.from(match[2]!);
        if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
          reply.header('Set-Cookie', `${values[0]}; Path=/api/discovery; HttpOnly; SameSite=Strict; Max-Age=300${request.protocol === 'https' ? '; Secure' : ''}`);
          return match[1]!;
        }
      }
    }
    const caller = randomBytes(32).toString('base64url');
    reply.header('Set-Cookie', `nexg_discovery_page=${caller}.${this.#sign(caller)}; Path=/api/discovery; HttpOnly; SameSite=Strict; Max-Age=300${request.protocol === 'https' ? '; Secure' : ''}`);
    return caller;
  }
}
