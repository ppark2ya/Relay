import axios from 'axios';
import type { Collection, Request, Environment, Proxy, Flow, FlowStep, ExecuteResult, FlowResult, History } from '../types';

const api = axios.create({
  baseURL: '/api',
});

// Collections
export const getCollections = () => api.get<Collection[]>('/collections').then(r => r.data);
export const getCollection = (id: number) => api.get<Collection>(`/collections/${id}`).then(r => r.data);
export const createCollection = (data: { name: string; parentId?: number }) => api.post<Collection>('/collections', data).then(r => r.data);
export const updateCollection = (id: number, data: { name: string; parentId?: number }) => api.put<Collection>(`/collections/${id}`, data).then(r => r.data);
export const deleteCollection = (id: number) => api.delete(`/collections/${id}`);

// Requests
export const getRequests = () => api.get<Request[]>('/requests').then(r => r.data);
export const getRequest = (id: number) => api.get<Request>(`/requests/${id}`).then(r => r.data);
export const createRequest = (data: Partial<Request>) => api.post<Request>('/requests', data).then(r => r.data);
export const updateRequest = (id: number, data: Partial<Request>) => api.put<Request>(`/requests/${id}`, data).then(r => r.data);
export const deleteRequest = (id: number) => api.delete(`/requests/${id}`);
export const executeRequest = (id: number, variables?: Record<string, string>) => api.post<ExecuteResult>(`/requests/${id}/execute`, { variables }).then(r => r.data);

// Environments
export const getEnvironments = () => api.get<Environment[]>('/environments').then(r => r.data);
export const getEnvironment = (id: number) => api.get<Environment>(`/environments/${id}`).then(r => r.data);
export const createEnvironment = (data: { name: string; variables: string }) => api.post<Environment>('/environments', data).then(r => r.data);
export const updateEnvironment = (id: number, data: { name: string; variables: string }) => api.put<Environment>(`/environments/${id}`, data).then(r => r.data);
export const deleteEnvironment = (id: number) => api.delete(`/environments/${id}`);
export const activateEnvironment = (id: number) => api.post<Environment>(`/environments/${id}/activate`).then(r => r.data);

// Proxies
export const getProxies = () => api.get<Proxy[]>('/proxies').then(r => r.data);
export const getProxy = (id: number) => api.get<Proxy>(`/proxies/${id}`).then(r => r.data);
export const createProxy = (data: { name: string; url: string }) => api.post<Proxy>('/proxies', data).then(r => r.data);
export const updateProxy = (id: number, data: { name: string; url: string }) => api.put<Proxy>(`/proxies/${id}`, data).then(r => r.data);
export const deleteProxy = (id: number) => api.delete(`/proxies/${id}`);
export const activateProxy = (id: number) => api.post<Proxy>(`/proxies/${id}/activate`).then(r => r.data);
export const testProxy = (id: number) => api.post<{ success: boolean; error?: string; message?: string }>(`/proxies/${id}/test`).then(r => r.data);

// Flows
export const getFlows = () => api.get<Flow[]>('/flows').then(r => r.data);
export const getFlow = (id: number) => api.get<Flow>(`/flows/${id}`).then(r => r.data);
export const createFlow = (data: { name: string; description: string }) => api.post<Flow>('/flows', data).then(r => r.data);
export const updateFlow = (id: number, data: { name: string; description: string }) => api.put<Flow>(`/flows/${id}`, data).then(r => r.data);
export const deleteFlow = (id: number) => api.delete(`/flows/${id}`);
export const runFlow = (id: number) => api.post<FlowResult>(`/flows/${id}/run`).then(r => r.data);
export const getFlowSteps = (flowId: number) => api.get<FlowStep[]>(`/flows/${flowId}/steps`).then(r => r.data);
export const createFlowStep = (flowId: number, data: Partial<FlowStep>) => api.post<FlowStep>(`/flows/${flowId}/steps`, data).then(r => r.data);
export const updateFlowStep = (flowId: number, stepId: number, data: Partial<FlowStep>) => api.put<FlowStep>(`/flows/${flowId}/steps/${stepId}`, data).then(r => r.data);
export const deleteFlowStep = (flowId: number, stepId: number) => api.delete(`/flows/${flowId}/steps/${stepId}`);

// History
export const getHistory = () => api.get<History[]>('/history').then(r => r.data);
export const getHistoryItem = (id: number) => api.get<History>(`/history/${id}`).then(r => r.data);
export const deleteHistory = (id: number) => api.delete(`/history/${id}`);
