export interface History {
  id: number;
  requestId?: number;
  flowId?: number;
  method: string;
  url: string;
  requestHeaders: string;
  requestBody: string;
  statusCode?: number;
  responseHeaders: string;
  responseBody: string;
  durationMs?: number;
  error?: string;
  bodySize: number;
  isBinary?: boolean;
  createdAt: string;
}
