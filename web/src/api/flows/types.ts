import type { ExecuteResult } from '../shared/types';

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
