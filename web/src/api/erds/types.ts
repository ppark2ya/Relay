export interface ErdDocument {
  id: number;
  name: string;
  dsl: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ErdDiagnostic {
  line?: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface ErdPreviewResult {
  mermaid: string;
  diagnostics: ErdDiagnostic[];
}

export interface ErdGeneratedFile {
  path: string;
  content: string;
}

export interface ErdKotlinResult {
  files: ErdGeneratedFile[];
}
