import api from '../client';
import type { UploadedFile } from './types';

export const uploadFile = (file: File): Promise<UploadedFile> => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('files/upload', { body: formData }).json<UploadedFile>();
};

export const deleteFile = (id: number) => api.delete(`files/${id}`);
