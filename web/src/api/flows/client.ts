import api from '../client';
import type { Flow, FlowStep, FlowResult } from './types';

export const getFlows = () => api.get('flows').json<Flow[]>();

export const getFlow = (id: number) => api.get(`flows/${id}`).json<Flow>();

export const createFlow = (data: { name: string; description: string }) =>
  api.post('flows', { json: data }).json<Flow>();

export const updateFlow = (id: number, data: { name: string; description: string }) =>
  api.put(`flows/${id}`, { json: data }).json<Flow>();

export const deleteFlow = (id: number) => api.delete(`flows/${id}`);

export const duplicateFlow = (id: number) =>
  api.post(`flows/${id}/duplicate`).json<Flow>();

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
