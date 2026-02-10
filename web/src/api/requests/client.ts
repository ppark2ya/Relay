import api from '../client';
import type { ExecuteResult, RequestExecuteResult } from '../shared/types';
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

export const reorderRequests = (orders: { id: number; sortOrder: number; collectionId?: number | null }[]) =>
  api.put('requests/reorder', { json: { orders } });

export const executeRequest = (
  id: number,
  variables?: Record<string, string>,
  overrides?: { method: string; url: string; headers: string; body: string; bodyType: string; proxyId?: number },
  signal?: AbortSignal,
) =>
  api.post(`requests/${id}/execute`, { json: { variables, ...overrides }, signal }).json<RequestExecuteResult>();

export const executeAdhoc = (
  data: { method: string; url: string; headers: string; body: string; variables?: Record<string, string>; proxyId?: number },
  signal?: AbortSignal,
) => api.post('execute', { json: data, signal }).json<ExecuteResult>();

export interface FormDataFileItem {
  key: string;
  value: string;
  type: 'text' | 'file';
  enabled: boolean;
  file?: File;
}

export const executeRequestWithFiles = (
  id: number,
  items: FormDataFileItem[],
  overrides: { method: string; url: string; headers: string; bodyType: string; proxyId?: number },
  variables?: Record<string, string>,
  signal?: AbortSignal,
) => {
  const formData = new FormData();
  formData.append('_metadata', JSON.stringify({ variables, ...overrides }));
  formData.append('_items', JSON.stringify(items.map(({ key, value, type, enabled }) => ({ key, value, type, enabled }))));
  items.forEach((item, index) => {
    if (item.type === 'file' && item.file && item.enabled) {
      formData.append(`file_${index}`, item.file);
    }
  });
  return api.post(`requests/${id}/execute`, { body: formData, signal }).json<RequestExecuteResult>();
};

export const executeAdhocWithFiles = (
  items: FormDataFileItem[],
  overrides: { method: string; url: string; headers: string; proxyId?: number },
  variables?: Record<string, string>,
  signal?: AbortSignal,
) => {
  const formData = new FormData();
  formData.append('_metadata', JSON.stringify({ variables, ...overrides }));
  formData.append('_items', JSON.stringify(items.map(({ key, value, type, enabled }) => ({ key, value, type, enabled }))));
  items.forEach((item, index) => {
    if (item.type === 'file' && item.file && item.enabled) {
      formData.append(`file_${index}`, item.file);
    }
  });
  return api.post('execute', { body: formData, signal }).json<ExecuteResult>();
};
