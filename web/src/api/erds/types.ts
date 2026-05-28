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

export interface ErdPreviewEntity {
  name: string;
  fields: string[];
}

export interface ErdPreviewRelation {
  from: string;
  fromCardinality: string;
  to: string;
  toCardinality: string;
  label: string;
}

export interface ErdPreviewDiagram {
  entities: ErdPreviewEntity[];
  relations: ErdPreviewRelation[];
}

export interface ErdPreviewResult {
  mermaid: string;
  diagram?: ErdPreviewDiagram;
  diagnostics: ErdDiagnostic[] | null;
}

export interface ErdGeneratedFile {
  path: string;
  content: string;
}

export interface ErdGeneratedCodeResult {
  files: ErdGeneratedFile[];
}

export type ErdKotlinResult = ErdGeneratedCodeResult;
export type ErdJavaResult = ErdGeneratedCodeResult;
