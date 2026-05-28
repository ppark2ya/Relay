import api from '../client';
import type { ErdDocument, ErdGeneratedCodeResult, ErdPreviewResult } from './types';

export const getErds = () => api.get('erds').json<ErdDocument[]>();

export const getErd = (id: number) => api.get(`erds/${id}`).json<ErdDocument>();

export const createErd = (data: { name: string; dsl?: string }) =>
  api.post('erds', { json: data }).json<ErdDocument>();

export const updateErd = (id: number, data: { name: string; dsl: string }) =>
  api.put(`erds/${id}`, { json: data }).json<ErdDocument>();

export const deleteErd = (id: number) => api.delete(`erds/${id}`);

export const duplicateErd = (id: number) =>
  api.post(`erds/${id}/duplicate`).json<ErdDocument>();

export const reorderErds = (orders: { id: number; sortOrder: number }[]) =>
  api.put('erds/reorder', { json: { orders } });

export const previewErd = (dsl: string) =>
  api.post('erds/preview', { json: { dsl } }).json<ErdPreviewResult>();

export const generateKotlin = (dsl: string) =>
  api.post('erds/generate/kotlin', { json: { dsl } }).json<ErdGeneratedCodeResult>();

export const generateJava = (dsl: string) =>
  api.post('erds/generate/java', { json: { dsl } }).json<ErdGeneratedCodeResult>();

export const generateMySQLDDL = (dsl: string) =>
  api.post('erds/generate/mysql-ddl', { json: { dsl } }).json<ErdGeneratedCodeResult>();
