import { describe, expect, it } from 'vitest';

import {
  bytes,
  change,
  companyAccess,
  daysUntil,
  fileBadge,
  fileKind,
  hrefWith,
  initials,
  kes,
  periodBounds,
  periodFrom,
  periodQuery,
  quantity,
  storageKey,
  suggestedOrder,
  toCsv,
  uploadProblem,
} from './company';

describe('companyAccess', () => {
  it('lets full approve, limited write, and view only look', () => {
    expect(companyAccess('full')).toEqual({ canWrite: true, canApprove: true });
    expect(companyAccess('limited')).toEqual({ canWrite: true, canApprove: false });
    expect(companyAccess('view')).toEqual({ canWrite: false, canApprove: false });
    expect(companyAccess('view', true)).toEqual({ canWrite: true, canApprove: true });
  });
});

describe('periodFrom', () => {
  const today = '2026-11-13';

  it('opens on this month so far', () => {
    expect(periodFrom(undefined, today)).toEqual({ from: '2026-11-01', to: '2026-11-13' });
  });

  it('keeps a real range from the address bar', () => {
    expect(periodFrom({ from: '2026-10-01', to: '2026-10-31' }, today)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
  });

  it('ignores days that do not exist, reversed ranges and half ranges', () => {
    const fallback = { from: '2026-11-01', to: '2026-11-13' };
    expect(periodFrom({ from: '2026-02-30', to: '2026-03-02' }, today)).toEqual(fallback);
    expect(periodFrom({ from: '2026-11-10', to: '2026-11-01' }, today)).toEqual(fallback);
    expect(periodFrom({ from: '2026-11-10' }, today)).toEqual(fallback);
    expect(periodFrom({ from: 'nope', to: '2026-11-01' }, today)).toEqual(fallback);
  });

  it('stops at today', () => {
    expect(periodFrom({ from: '2026-11-05', to: '2026-12-31' }, today)).toEqual({
      from: '2026-11-05',
      to: '2026-11-13',
    });
  });

  it('writes nothing in the address bar for the default period', () => {
    expect(periodQuery({ from: '2026-11-01', to: '2026-11-13' }, today)).toBe('');
    expect(periodQuery({ from: '2026-10-01', to: '2026-10-31' }, today)).toBe(
      'from=2026-10-01&to=2026-10-31',
    );
  });

  it('turns a period into Nairobi midnights, the end exclusive', () => {
    expect(periodBounds({ from: '2026-11-01', to: '2026-11-13' })).toEqual({
      start: '2026-10-31T21:00:00.000Z',
      end: '2026-11-13T21:00:00.000Z',
    });
  });
});

describe('formatting', () => {
  it('writes money, quantities and sizes the way the designs do', () => {
    expect(kes(108_000_000)).toBe('KES 1,080,000');
    expect(kes(null)).toBe('—');
    expect(quantity('24.00', 'pcs')).toBe('24');
    expect(quantity(200, 'L')).toBe('200 L');
    expect(quantity(2.5, 'kg')).toBe('2.5 kg');
    expect(quantity(25, 'ream')).toBe('25 reams');
    expect(quantity(1, 'box')).toBe('1 box');
    expect(bytes(3_355_443)).toBe('3.2 MB');
    expect(bytes(248_000)).toBe('242 KB');
    expect(bytes(512)).toBe('512 B');
  });

  it('measures change only against something', () => {
    expect(change(110, 100)).toBeCloseTo(10);
    expect(change(5, 0)).toBeNull();
  });

  it('counts days to a date', () => {
    expect(daysUntil('2026-11-20', '2026-11-13')).toBe(7);
    expect(daysUntil('2026-11-10', '2026-11-13')).toBe(-3);
  });

  it('builds links without empty parameters', () => {
    expect(hrefWith('/company/files', { tab: 'all', from: '', q: null })).toBe(
      '/company/files?tab=all',
    );
    expect(hrefWith('/company/files', {})).toBe('/company/files');
  });
});

describe('files', () => {
  it('knows a file by its type, then by its name', () => {
    expect(fileKind('application/pdf')).toBe('pdf');
    expect(
      fileKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a.xlsx'),
    ).toBe('sheet');
    expect(fileKind('application/vnd.ms-excel', 'rates.csv')).toBe('text');
    expect(fileKind('', 'Brand.pptx')).toBe('slides');
    expect(fileKind('image/png')).toBe('image');
    expect(fileKind('application/octet-stream', 'thing.bin')).toBe('other');
    expect(fileBadge('Company_Policies_v3.docx')).toBe('DOCX');
    expect(fileBadge('README', 'text/plain')).toBe('TEXT');
  });

  it('refuses empty, oversized and unknown uploads before they start', () => {
    expect(uploadProblem({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toBeNull();
    expect(uploadProblem({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toMatch(/empty/);
    expect(uploadProblem({ name: 'a.pdf', type: 'application/pdf', size: 60 * 1024 ** 2 })).toMatch(
      /50 MB/,
    );
    expect(uploadProblem({ name: 'a.exe', type: 'application/x-msdownload', size: 10 })).toMatch(
      /not a type/,
    );
  });

  it('stores uploads in the uploader’s folder under a safe name', () => {
    expect(storageKey('u1', 'NEXG Partnership Agreement (final).pdf', 'r1')).toBe(
      'u1/r1/NEXG_Partnership_Agreement_final.pdf',
    );
    expect(storageKey('u1', '%%%', 'r1')).toBe('u1/r1/file');
  });
});

describe('people', () => {
  it('takes initials from words, not numbers or signs', () => {
    expect(initials('Jotham Mutai')).toBe('JM');
    expect(initials('Rider #442 – Brian O.')).toBe('RB');
    expect(initials('[Dev Admin]')).toBe('DA');
    expect(initials('aisha@nexgapp.com')).toBe('AN');
    expect(initials('')).toBe('—');
  });
});

describe('inventory', () => {
  it('suggests ordering back up to twice the reorder level', () => {
    expect(suggestedOrder(3, 4)).toBe(5);
    expect(suggestedOrder(10, 4)).toBe(0);
    expect(suggestedOrder(0, 0)).toBe(1);
  });

  it('writes CSV that spreadsheets read back', () => {
    expect(
      toCsv([
        ['Name', 'Note'],
        ['Helmet', 'Size "L", black'],
      ]),
    ).toBe('Name,Note\r\nHelmet,"Size ""L"", black"');
  });
});
