import type { ExecuteResult } from '../shared/types';

export interface Flow {
  id: number;
  name: string;
  description: string;
  sortOrder: number;
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
  loopCount: number;
  preScript: string;
  postScript: string;
  continueOnError: boolean;
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

export interface ScriptResult {
  success: boolean;
  errors?: string[];
  assertionsPassed: number;
  assertionsFailed: number;
  updatedVars?: Record<string, string>;
  flowAction: 'next' | 'goto' | 'stop' | 'repeat';
  gotoStepName?: string;
  gotoStepOrder?: number;
}

export interface StepResult {
  stepId: number;
  requestId?: number;
  requestName: string;
  executeResult: ExecuteResult;
  extractedVars: Record<string, string>;
  skipped: boolean;
  skipReason?: string;
  iteration?: number;
  loopCount?: number;
  preScriptResult?: ScriptResult;
  postScriptResult?: ScriptResult;
}

// DSL Types for Script Editor
export interface Assertion {
  type: 'status' | 'jsonpath' | 'header' | 'responseTime' | 'bodyContains';
  path?: string;
  name?: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'exists' | 'regex';
  value?: string | number | boolean | string[];
}

export interface VariableOperation {
  name: string;
  value?: string | number | boolean;
  from?: string;
  operation?: 'set' | 'increment' | 'decrement' | 'math' | 'concat' | 'conditional';
  by?: number;
  expression?: string;
  values?: string[];
  condition?: string;
  ifTrue?: string | number | boolean;
  ifFalse?: string | number | boolean;
}

export interface FlowControlAction {
  action: 'next' | 'goto' | 'stop' | 'repeat';
  step?: string;
  stepOrder?: number;
}

export interface FlowControl {
  type?: 'always' | 'conditional' | 'switch';
  action?: 'next' | 'goto' | 'stop' | 'repeat';
  step?: string;
  stepOrder?: number;
  condition?: string;
  onTrue?: FlowControlAction;
  onFalse?: FlowControlAction;
  cases?: Array<{
    condition: string;
    action: 'next' | 'goto' | 'stop' | 'repeat';
    step?: string;
    stepOrder?: number;
  }>;
  default?: FlowControlAction;
}

export interface Script {
  assertions?: Assertion[];
  setVariables?: VariableOperation[];
  flow?: FlowControl;
}
