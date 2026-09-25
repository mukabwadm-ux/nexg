import { describe, expect, it } from 'vitest';

import { formatBytes, MAX_FILE_BYTES, validateFile } from './file';

function fakeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  // jsdom derives size from the contents; override it for the limit checks.
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validateFile', () => {
  it('accepts a JPEG within the limit', () => {
    expect(validateFile(fakeFile('id.jpg', 'image/jpeg', 2_000_000))).toBeNull();
  });

  it('accepts a PDF within the limit', () => {
    expect(validateFile(fakeFile('permit.pdf', 'application/pdf', 1_000_000))).toBeNull();
  });

  it('rejects an unsupported type', () => {
    expect(validateFile(fakeFile('sheet.xlsx', 'application/vnd.ms-excel', 1000))).toMatch(
      /not accepted/i,
    );
  });

  it('rejects an oversized PDF, which cannot be compressed', () => {
    expect(validateFile(fakeFile('permit.pdf', 'application/pdf', MAX_FILE_BYTES + 1))).toMatch(
      /limit is 10\.0 MB/,
    );
  });

  it('lets an oversized image through so compression can run first', () => {
    expect(validateFile(fakeFile('photo.jpg', 'image/jpeg', MAX_FILE_BYTES + 1))).toBeNull();
  });
});

describe('formatBytes', () => {
  it('formats across the unit boundaries', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5_242_880)).toBe('5.0 MB');
  });
});
