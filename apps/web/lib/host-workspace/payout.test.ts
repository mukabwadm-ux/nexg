import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { HostWorkspaceError, type HostWorkspaceAccess } from './access';
import {
  declareHostPayout,
  payoutInput,
  payoutInputMessage,
  readHostPayout,
  toDeclarePayload,
  toPayoutAnswer,
} from './payout';

/* Test values only: made-up numbers in Safaricom's, a bank's and KRA's formats. */
const HOST = '11111111-1111-4111-8111-111111111111';
const MASKED = {
  rail: 'bank',
  destination_masked: 'Test Bank ···0000',
  account_name: 'Test Host',
  bank_name: 'Test Bank',
  kra_pin_set: true,
  version: 2,
  verified: false,
  declared_at: '2026-11-24T10:00:00Z',
  status_note: 'NexG is checking these details.',
};

function access(
  rpc: (fn: string, args: Record<string, unknown>) => unknown,
  overrides: Partial<HostWorkspaceAccess> = {},
): HostWorkspaceAccess {
  return {
    db: { rpc: async (fn: string, args: Record<string, unknown>) => rpc(fn, args) },
    userId: 'user',
    email: '',
    hostId: HOST,
    name: 'Host',
    role: 'Owner',
    unitScope: null,
    ...overrides,
  } as unknown as HostWorkspaceAccess;
}

function refusedWith(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) =>
      error instanceof HostWorkspaceError
        ? { status: error.status, message: error.message }
        : error,
  );
}

describe('host payout input', () => {
  it('accepts an M-PESA number with spaces and a lower-case KRA PIN', () => {
    const parsed = payoutInput.parse({
      rail: 'mpesa_phone',
      phoneNumber: '0700 000 000',
      accountName: '  Test Host ',
      kraPin: 'a 000000000 z',
    });
    expect(toDeclarePayload(parsed)).toEqual({
      rail: 'mpesa_phone',
      phoneNumber: '0700000000',
      accountName: 'Test Host',
      kraPin: 'A000000000Z',
    });
  });

  it('leaves out an empty KRA PIN so the one on file is kept', () => {
    const parsed = payoutInput.parse({ rail: 'mpesa_till', tillNumber: '000000', kraPin: ' ' });
    expect(toDeclarePayload(parsed)).toEqual({ rail: 'mpesa_till', tillNumber: '000000' });
  });

  it('strips spaces from a bank account number', () => {
    const parsed = payoutInput.parse({
      rail: 'bank',
      bankName: 'Test Bank',
      accountName: 'Test Host',
      accountNumber: '0000 0000-0000',
    });
    expect(toDeclarePayload(parsed)).toEqual({
      rail: 'bank',
      bankName: 'Test Bank',
      accountName: 'Test Host',
      accountNumber: '000000000000',
    });
  });

  it('sends the paybill keys the function expects', () => {
    const parsed = payoutInput.parse({
      rail: 'mpesa_paybill',
      paybillNumber: '000000',
      accountReference: 'TEST-1',
    });
    expect(toDeclarePayload(parsed)).toEqual({
      rail: 'mpesa_paybill',
      paybillNumber: '000000',
      accountReference: 'TEST-1',
    });
  });

  it('refuses in plain words', () => {
    const message = (input: unknown) => {
      const result = payoutInput.safeParse(input);
      return result.success ? null : payoutInputMessage(result.error);
    };
    expect(
      message({ rail: 'mpesa_phone', phoneNumber: '0700000000', accountName: 'X', kraPin: 'B1' }),
    ).toBe('Enter your KRA PIN as it is on your certificate, such as A123456789B.');
    expect(message({ rail: 'mpesa_phone', phoneNumber: '0500000000', accountName: 'X' })).toBe(
      'Enter a Kenyan M-PESA number, such as 0712 345 678.',
    );
    expect(message({ rail: 'mpesa_till', tillNumber: '00-00' })).toBe(
      'A till or paybill number is digits only.',
    );
    expect(message({ rail: 'mpesa_till', tillNumber: '000000', accountName: 'X' })).toBe(
      'Fill in the fields for that payout method, and only those.',
    );
    expect(message({ rail: 'cash' })).toBe(
      'Choose how you want to be paid: M-PESA number, till, paybill or bank.',
    );
    expect(
      message({ rail: 'bank', bankName: 'Test Bank', accountName: ' ', accountNumber: '0000' }),
    ).toBe('Enter the name on the bank account.');
  });
});

describe('host payout answers', () => {
  it('reads back only the masked view, and null when nothing is on file', () => {
    expect(toPayoutAnswer({ ok: true, payout: null })).toEqual({ payout: null });
    expect(
      toPayoutAnswer({
        ok: true,
        payout: { ...MASKED, account: { accountNumber: '000000000000' } },
        note: 'Saved.',
      }),
    ).toEqual({
      payout: {
        rail: 'bank',
        destinationMasked: 'Test Bank ···0000',
        accountName: 'Test Host',
        bankName: 'Test Bank',
        kraPinSet: true,
        version: 2,
        verified: false,
        declaredAt: '2026-11-24T10:00:00Z',
        statusNote: 'NexG is checking these details.',
      },
      note: 'Saved.',
    });
  });

  it('treats an odd shape as a load failure, not as "no details"', () => {
    expect(() => toPayoutAnswer(null)).toThrow(HostWorkspaceError);
    expect(() => toPayoutAnswer({ ok: true, payout: { rail: 'bank' } })).toThrow(
      HostWorkspaceError,
    );
  });
});

describe('host payout calls', () => {
  it('reads for the signed-in host', async () => {
    const calls: unknown[] = [];
    const result = await readHostPayout(
      access((fn, args) => {
        calls.push([fn, args]);
        return { data: { ok: true, payout: MASKED }, error: null };
      }),
    );
    expect(calls).toEqual([['rpc_host_payout_mine', { p_host_id: HOST }]]);
    expect(result.payout?.destinationMasked).toBe('Test Bank ···0000');
  });

  it('keeps managers and unit-scoped owners out without calling the database', async () => {
    const rpc = vi.fn();
    for (const overrides of [
      { role: 'Manager' as const },
      { unitScope: ['22222222-2222-4222-8222-222222222222'] },
    ]) {
      expect(await refusedWith(readHostPayout(access(rpc, overrides)))).toEqual({
        status: 403,
        message: 'Only the owner of this host account can see or change where NexG pays you.',
      });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("declares and returns the function's note", async () => {
    const calls: unknown[] = [];
    const result = await declareHostPayout(
      access((fn, args) => {
        calls.push([fn, args]);
        return {
          data: { ok: true, payout: MASKED, note: 'Saved. 1 payout not yet sent will wait.' },
          error: null,
        };
      }),
      payoutInput.parse({ rail: 'mpesa_till', tillNumber: '000000' }),
    );
    expect(calls).toEqual([
      [
        'rpc_host_payout_declare_mine',
        { p_host_id: HOST, p_payout: { rail: 'mpesa_till', tillNumber: '000000' } },
      ],
    ]);
    expect(result.note).toBe('Saved. 1 payout not yet sent will wait.');
  });

  it("shows the function's own refusal, and a careful message for anything else", async () => {
    const declare = (error: { code: string; message: string }) =>
      refusedWith(
        declareHostPayout(
          access(() => ({ data: null, error })),
          payoutInput.parse({ rail: 'mpesa_till', tillNumber: '000000' }),
        ),
      );
    expect(
      await declare({ code: '22023', message: 'A till or paybill number is digits only.' }),
    ).toEqual({
      status: 400,
      message: 'A till or paybill number is digits only.',
    });
    expect(
      await declare({
        code: '42501',
        message: 'Only the owner of this host account can change where NexG pays you.',
      }),
    ).toEqual({
      status: 403,
      message: 'Only the owner of this host account can change where NexG pays you.',
    });
    expect(await declare({ code: '08006', message: 'connection lost at 10.0.0.1' })).toEqual({
      status: 503,
      message: 'Saving could not be confirmed. Refresh before trying again.',
    });
  });
});
