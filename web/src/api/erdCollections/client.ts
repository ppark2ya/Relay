import api from '../client';
import type { ErdCollection } from './types';

export const getErdCollections = () => api.get('erd-collections').json<ErdCollection[]>();

export const getErdCollection = (id: number) => api.get(`erd-collections/${id}`).json<ErdCollection>();

export const createErdCollection = (data: { name: string; parentId?: number }) =>
  api.post('erd-collections', { json: data }).json<ErdCollection>();

export const updateErdCollection = (id: number, data: { name: string; parentId?: number }) =>
  api.put(`erd-collections/${id}`, { json: data }).json<ErdCollection>();

export const deleteErdCollection = (id: number) => api.delete(`erd-collections/${id}`);

export const duplicateErdCollection = (id: number) =>
  api.post(`erd-collections/${id}/duplicate`).json<ErdCollection>();

export const reorderErdCollections = (orders: { id: number; sortOrder: number; parentId?: number | null }[]) =>
  api.put('erd-collections/reorder', { json: { orders } });
