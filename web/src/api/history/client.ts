import api from '../client';
import type { History } from './types';

export const getHistory = () => api.get('history').json<History[]>();

export const getHistoryItem = (id: number) => api.get(`history/${id}`).json<History>();

export const deleteHistory = (id: number) => api.delete(`history/${id}`);
