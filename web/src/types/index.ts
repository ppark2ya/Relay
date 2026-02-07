// Barrel re-exports for backwards compatibility with ../types imports
export type { Workspace } from '../api/workspaces';
export type { Collection } from '../api/collections';
export type { Request } from '../api/requests';
export type { Environment } from '../api/environments';
export type { Proxy } from '../api/proxies';
export type { Flow, FlowStep, FlowResult, StepResult } from '../api/flows';
export type { ExecuteResult } from '../api/shared/types';
export type { History } from '../api/history';

// WebSocket types (not part of any API domain)
export interface WSMessage {
  id: string;
  type: 'sent' | 'received' | 'system';
  payload: string;
  format: 'text' | 'binary';
  timestamp: string;
}

export type WSConnectionStatus = 'disconnected' | 'connecting' | 'connected';
