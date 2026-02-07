export interface Collection {
  id: number;
  name: string;
  parentId?: number;
  children?: Collection[];
  requests?: Request[];
  createdAt: string;
  updatedAt: string;
}

export interface Request {
  id: number;
  collectionId?: number;
  name: string;
  method: string;
  url: string;
  headers?: string;
  body?: string;
  bodyType?: string;
  proxyId?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Environment {
  id: number;
  name: string;
  variables: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Proxy {
  id: number;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Flow {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowStep {
  id: number;
  flowId: number;
  requestId?: number;
  stepOrder: number;
  delayMs: number;
  extractVars: string;
  condition: string;
  name: string;
  method: string;
  url: string;
  headers: string;
  body: string;
  bodyType: string;
  proxyId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExecuteResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  error?: string;
  resolvedUrl: string;
  resolvedHeaders: Record<string, string>;
}

export interface FlowResult {
  flowId: number;
  flowName: string;
  steps: StepResult[];
  totalTimeMs: number;
  success: boolean;
  error?: string;
}

export interface StepResult {
  stepId: number;
  requestId?: number;
  requestName: string;
  executeResult: ExecuteResult;
  extractedVars: Record<string, string>;
  skipped: boolean;
  skipReason?: string;
}

export interface WSMessage {
  id: string;
  type: 'sent' | 'received' | 'system';
  payload: string;
  format: 'text' | 'binary';
  timestamp: string;
}

export type WSConnectionStatus = 'disconnected' | 'connecting' | 'connected';

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
  createdAt: string;
}
