import { randomBytes } from 'node:crypto';

/** New observation/control IDs only; never rewrites external catalog identities. */
export function uuid7(now = Date.now()): string {
  const value = randomBytes(16); value.writeUIntBE(now, 0, 6);
  value[6] = (value[6]! & 15) | 0x70; value[8] = (value[8]! & 63) | 0x80;
  const hex = value.toString('hex'); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
