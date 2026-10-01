import api from '../client';
import type { Collection, PostmanImportResult } from './types';

export const getCollections = () => api.get('collections').json<Collection[]>();

export const getCollection = (id: number) => api.get(`collections/${id}`).json<Collection>();

export const createCollection = (data: { name: string; parentId?: number }) =>
  api.post('collections', { json: data }).json<Collection>();

export const updateCollection = (id: number, data: { name: string; parentId?: number }) =>
  api.put(`collections/${id}`, { json: data }).json<Collection>();

export const deleteCollection = (id: number) => api.delete(`collections/${id}`);

export const duplicateCollection = (id: number) =>
  api.post(`collections/${id}/duplicate`).json<Collection>();

export const exportPostmanCollection = (id: number) =>
  api.get(`collections/${id}/export/postman`).blob();

export const importPostmanCollection = (file: File) => {
  const body = new FormData();
  body.set('file', file);
  return api.post('collections/import/postman', { body }).json<PostmanImportResult>();
};

export const reorderCollections = (orders: { id: number; sortOrder: number; parentId?: number | null }[]) =>
  api.put('collections/reorder', { json: { orders } });
