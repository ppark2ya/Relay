import api from '../client';
import type { Environment } from './types';

export const getEnvironments = () => api.get('environments').json<Environment[]>();

export const getEnvironment = (id: number) => api.get(`environments/${id}`).json<Environment>();

export const createEnvironment = (data: { name: string; variables: string }) =>
  api.post('environments', { json: data }).json<Environment>();

export const updateEnvironment = (id: number, data: { name: string; variables: string }) =>
  api.put(`environments/${id}`, { json: data }).json<Environment>();

export const deleteEnvironment = (id: number) => api.delete(`environments/${id}`);

export const activateEnvironment = (id: number) =>
  api.post(`environments/${id}/activate`).json<Environment>();
