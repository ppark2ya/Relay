import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../shared/queryKeys';
import * as api from './client';

export const useCollections = () =>
  useQuery({ queryKey: queryKeys.collections, queryFn: api.getCollections });

export const useCollection = (id: number) =>
  useQuery({ queryKey: [...queryKeys.collections, id], queryFn: () => api.getCollection(id), enabled: !!id });

export const useCreateCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createCollection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.collections }),
  });
};

export const useUpdateCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; parentId?: number } }) =>
      api.updateCollection(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.collections }),
  });
};

export const useDeleteCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteCollection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.collections }),
  });
};

export const useDuplicateCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.duplicateCollection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.collections }),
  });
};
