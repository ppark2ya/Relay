import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../shared/queryKeys';
import * as api from './client';

export const useProxies = () =>
  useQuery({ queryKey: queryKeys.proxies, queryFn: api.getProxies });

export const useCreateProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createProxy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.proxies }),
  });
};

export const useUpdateProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; url: string } }) =>
      api.updateProxy(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.proxies }),
  });
};

export const useDeleteProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteProxy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.proxies }),
  });
};

export const useActivateProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.activateProxy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.proxies }),
  });
};

export const useDeactivateProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deactivateProxy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.proxies }),
  });
};

export const useTestProxy = () => {
  return useMutation({
    mutationFn: api.testProxy,
  });
};
