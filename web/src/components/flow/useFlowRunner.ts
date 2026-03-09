import { useState, useRef } from 'react';
import { runFlowStream } from '../../api/flows';
import type { Flow, FlowResult, StepResult } from '../../types';

export function formatBodySize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function formatBody(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export function useFlowRunner(flow: Flow | null) {
  const [flowResult, setFlowResult] = useState<FlowResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runningStepId, setRunningStepId] = useState<number | null>(null);
  const [completedStepIds, setCompletedStepIds] = useState<Set<number>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  const [expandedResultIds, setExpandedResultIds] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleRun = (selectedStepIds: Set<number>) => {
    if (!flow) return;
    setFlowResult(null);
    setIsRunning(true);
    setRunningStepId(null);
    setCompletedStepIds(new Set());
    setExpandedResultIds(new Set());
    setCopiedKey(null);
    const stepIds = selectedStepIds.size > 0 ? Array.from(selectedStepIds) : undefined;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const accumulatedSteps: StepResult[] = [];

    runFlowStream(flow.id, stepIds, {
      onStepStart: (event) => {
        setRunningStepId(event.stepId);
      },
      onStepComplete: (result) => {
        accumulatedSteps.push(result);
        setCompletedStepIds(prev => new Set(prev).add(result.stepId));
        setFlowResult(prev => ({
          flowId: flow.id,
          flowName: prev?.flowName || flow.name,
          steps: [...accumulatedSteps],
          totalTimeMs: 0,
          success: true,
        }));
      },
      onFlowComplete: (event) => {
        setIsRunning(false);
        setRunningStepId(null);
        setFlowResult(prev => prev ? {
          ...prev,
          totalTimeMs: event.totalTimeMs,
          success: event.success,
          error: event.error,
        } : null);
      },
      onError: (error) => {
        setIsRunning(false);
        setRunningStepId(null);
        setFlowResult({
          flowId: flow.id,
          flowName: flow.name,
          steps: [...accumulatedSteps],
          totalTimeMs: 0,
          success: false,
          error,
        });
      },
    }, controller.signal);
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsRunning(false);
    setRunningStepId(null);
    setFlowResult(prev => prev ? { ...prev, success: false, error: 'Cancelled' } : null);
  };

  const toggleResultExpand = (key: string) => {
    setExpandedResultIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCopyBody = (key: string, body: string) => {
    navigator.clipboard.writeText(body);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return {
    flowResult, isRunning, runningStepId, completedStepIds,
    expandedResultIds, copiedKey,
    handleRun, handleCancel,
    toggleResultExpand, handleCopyBody,
  };
}
