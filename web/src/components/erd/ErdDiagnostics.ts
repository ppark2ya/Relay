import type { ErdDiagnostic } from '../../api/erds';

export function normalizeErdDiagnostics(diagnostics: ErdDiagnostic[] | null | undefined): ErdDiagnostic[] {
  return diagnostics ?? [];
}
