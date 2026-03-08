export interface ExecuteResult {
  statusCode: number;
  headers: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  body: string;
  bodyBase64?: string;
  bodySize: number;
  isBinary?: boolean;
  durationMs: number;
  error?: string;
  resolvedUrl: string;
  resolvedHeaders: Record<string, string>;
}

export interface ErrorDetail {
  message: string;
  line?: number;
  column?: number;
}

export interface ScriptResult {
  success: boolean;
  errors?: string[];
  errorDetails?: ErrorDetail[];
  assertionsPassed: number;
  assertionsFailed: number;
  updatedVars?: Record<string, string>;
}

export interface RequestExecuteResult extends ExecuteResult {
  preScriptResult?: ScriptResult;
  postScriptResult?: ScriptResult;
}
