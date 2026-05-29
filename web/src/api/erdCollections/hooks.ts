import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../shared/queryKeys';
import * as api from './client';

export const useErdCollections = () =>
  useQuery({ queryKey: queryKeys.erdCollections, queryFn: api.getErdCollections });

export const useErdCollection = (id: number) =>
  useQuery({ queryKey: queryKeys.erdCollection(id), queryFn: () => api.getErdCollection(id), enabled: !!id });

export const useCreateErdCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createErdCollection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.erdCollections }),
  });
};

export const useUpdateErdCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; parentId?: number } }) =>
      api.updateErdCollection(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erdCollections });
      queryClient.invalidateQueries({ queryKey: queryKeys.erdCollection(id) });
    },
  });
};

export const useDeleteErdCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteErdCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erdCollections });
      queryClient.invalidateQueries({ queryKey: queryKeys.erds });
    },
  });
};

export const useDuplicateErdCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.duplicateErdCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erdCollections });
      queryClient.invalidateQueries({ queryKey: queryKeys.erds });
    },
  });
};

export const useReorderErdCollections = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.reorderErdCollections,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.erdCollections }),
  });
};
