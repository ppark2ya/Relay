export interface ErdDocument {
  id: number;
  collectionId?: number;
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

export type ErdPreviewColumnKey = 'PK' | 'UK' | 'FK' | 'IX';

export interface ErdPreviewColumn {
  keys: ErdPreviewColumnKey[];
  name: string;
  type: string;
  nullable: boolean;
  modified?: boolean;
}

export interface ErdPreviewEntity {
  name: string;
  columns: ErdPreviewColumn[];
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
export type ErdMySQLDDLResult = ErdGeneratedCodeResult;
