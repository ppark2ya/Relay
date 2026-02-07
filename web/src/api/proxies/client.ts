import api from '../client';
import type { Proxy } from './types';

export const getProxies = () => api.get('proxies').json<Proxy[]>();

export const getProxy = (id: number) => api.get(`proxies/${id}`).json<Proxy>();

export const createProxy = (data: { name: string; url: string }) =>
  api.post('proxies', { json: data }).json<Proxy>();

export const updateProxy = (id: number, data: { name: string; url: string }) =>
  api.put(`proxies/${id}`, { json: data }).json<Proxy>();

export const deleteProxy = (id: number) => api.delete(`proxies/${id}`);

export const activateProxy = (id: number) =>
  api.post(`proxies/${id}/activate`).json<Proxy>();

export const deactivateProxy = () => api.post('proxies/deactivate');

export const testProxy = (id: number) =>
  api.post(`proxies/${id}/test`).json<{ success: boolean; error?: string; message?: string }>();
