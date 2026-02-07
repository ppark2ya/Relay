import api from '../client';
import type { ExecuteResult } from '../shared/types';
import type { Request } from './types';

export const getRequests = () => api.get('requests').json<Request[]>();

export const getRequest = (id: number) => api.get(`requests/${id}`).json<Request>();

export const createRequest = (data: Partial<Request>) =>
  api.post('requests', { json: data }).json<Request>();

export const updateRequest = (id: number, data: Partial<Request>) =>
  api.put(`requests/${id}`, { json: data }).json<Request>();

export const deleteRequest = (id: number) => api.delete(`requests/${id}`);

export const duplicateRequest = (id: number) =>
  api.post(`requests/${id}/duplicate`).json<Request>();

export const executeRequest = (
  id: number,
  variables?: Record<string, string>,
  overrides?: { method: string; url: string; headers: string; body: string; bodyType: string; proxyId?: number },
  signal?: AbortSignal,
) =>
  api.post(`requests/${id}/execute`, { json: { variables, ...overrides }, signal }).json<ExecuteResult>();

export const executeAdhoc = (
  data: { method: string; url: string; headers: string; body: string; variables?: Record<string, string>; proxyId?: number },
  signal?: AbortSignal,
) => api.post('execute', { json: data, signal }).json<ExecuteResult>();
