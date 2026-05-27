import api from '../client';
import type { Flow, FlowStep, FlowResult, StepStartEvent, StepResult, FlowCompleteEvent, RunFlowStreamCallbacks } from './types';

export const getFlows = () => api.get('flows').json<Flow[]>();

export const getFlow = (id: number) => api.get(`flows/${id}`).json<Flow>();

export const createFlow = (data: { name: string; description: string }) =>
  api.post('flows', { json: data }).json<Flow>();

export const updateFlow = (id: number, data: { name: string; description: string }) =>
  api.put(`flows/${id}`, { json: data }).json<Flow>();

export const deleteFlow = (id: number) => api.delete(`flows/${id}`);

export const duplicateFlow = (id: number) =>
  api.post(`flows/${id}/duplicate`).json<Flow>();

export const reorderFlows = (orders: { id: number; sortOrder: number }[]) =>
  api.put('flows/reorder', { json: { orders } });

export const runFlow = (id: number, stepIds?: number[]) =>
  api.post(`flows/${id}/run`, {
    json: stepIds && stepIds.length > 0 ? { stepIds } : {}
  }).json<FlowResult>();

export const getFlowSteps = (flowId: number) =>
  api.get(`flows/${flowId}/steps`).json<FlowStep[]>();

export const createFlowStep = (flowId: number, data: Partial<FlowStep>) =>
  api.post(`flows/${flowId}/steps`, { json: data }).json<FlowStep>();

export const updateFlowStep = (flowId: number, stepId: number, data: Partial<FlowStep>) =>
  api.put(`flows/${flowId}/steps/${stepId}`, { json: data }).json<FlowStep>();

export const deleteFlowStep = (flowId: number, stepId: number) =>
  api.delete(`flows/${flowId}/steps/${stepId}`);

export const importCollection = (flowId: number, collectionId: number) =>
  api.post(`flows/${flowId}/import-collection`, { json: { collectionId } }).json<FlowStep[]>();

export const runFlowStream = async (
  id: number,
  stepIds: number[] | undefined,
  callbacks: RunFlowStreamCallbacks,
  signal?: AbortSignal,
) => {
  const workspaceId = localStorage.getItem('workspaceId') || '1';
  const body = stepIds && stepIds.length > 0 ? JSON.stringify({ stepIds }) : '{}';

  const response = await fetch(`/api/flows/${id}/run/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-ID': workspaceId,
    },
    body,
    signal,
  });

  if (!response.ok || !response.body) {
    callbacks.onError('Failed to start flow stream');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ') && currentEvent) {
        const data = line.slice(6);
        try {
          switch (currentEvent) {
            case 'step:start':
              callbacks.onStepStart(JSON.parse(data) as StepStartEvent);
              break;
            case 'step:complete':
              callbacks.onStepComplete(JSON.parse(data) as StepResult);
              break;
            case 'flow:complete':
              callbacks.onFlowComplete(JSON.parse(data) as FlowCompleteEvent);
              break;
          }
        } catch {
          // ignore parse errors
        }
        currentEvent = '';
      } else if (line === '') {
        currentEvent = '';
      }
    }
  }
};
