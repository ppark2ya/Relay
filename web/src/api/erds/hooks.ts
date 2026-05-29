import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../shared/queryKeys';
import * as api from './client';

export const useErds = () =>
  useQuery({ queryKey: queryKeys.erds, queryFn: api.getErds });

export const useErd = (id: number) =>
  useQuery({ queryKey: queryKeys.erd(id), queryFn: () => api.getErd(id), enabled: !!id });

export const useCreateErd = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createErd,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erds });
      queryClient.invalidateQueries({ queryKey: queryKeys.erdCollections });
    },
  });
};

export const useUpdateErd = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; dsl: string } }) =>
      api.updateErd(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erds });
      queryClient.invalidateQueries({ queryKey: queryKeys.erd(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.erdCollections });
    },
  });
};

export const useDeleteErd = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteErd,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erds });
      queryClient.invalidateQueries({ queryKey: queryKeys.erdCollections });
    },
  });
};

export const useDuplicateErd = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.duplicateErd,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erds });
      queryClient.invalidateQueries({ queryKey: queryKeys.erdCollections });
    },
  });
};

export const useReorderErds = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.reorderErds,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erds });
      queryClient.invalidateQueries({ queryKey: queryKeys.erdCollections });
    },
  });
};

export const usePreviewErd = () =>
  useMutation({ mutationFn: api.previewErd });

export const useGenerateKotlin = () =>
  useMutation({ mutationFn: api.generateKotlin });

export const useGenerateJava = () =>
  useMutation({ mutationFn: api.generateJava });

export const useGenerateMySQLDDL = () =>
  useMutation({ mutationFn: api.generateMySQLDDL });
