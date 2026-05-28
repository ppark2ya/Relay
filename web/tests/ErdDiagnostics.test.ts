import { describe, expect, test } from 'bun:test';
import { normalizeErdDiagnostics } from '../src/components/erd/ErdDiagnostics';

describe('normalizeErdDiagnostics', () => {
  test('returns an empty array for null diagnostics', () => {
    expect(normalizeErdDiagnostics(null)).toEqual([]);
  });

  test('returns an empty array for missing diagnostics', () => {
    expect(normalizeErdDiagnostics(undefined)).toEqual([]);
  });
});
