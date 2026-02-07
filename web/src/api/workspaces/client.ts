import api from '../client';
import type { Workspace } from './types';

export const getWorkspaces = () => api.get('workspaces').json<Workspace[]>();

export const createWorkspace = (data: { name: string }) =>
  api.post('workspaces', { json: data }).json<Workspace>();

export const updateWorkspace = (id: number, data: { name: string }) =>
  api.put(`workspaces/${id}`, { json: data }).json<Workspace>();

export const deleteWorkspace = (id: number) => api.delete(`workspaces/${id}`);
