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
