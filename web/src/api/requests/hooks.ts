import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../shared/queryKeys';
import * as api from './client';

export const useRequests = () =>
  useQuery({ queryKey: queryKeys.requests, queryFn: api.getRequests });

export const useRequest = (id: number) =>
  useQuery({ queryKey: queryKeys.request(id), queryFn: () => api.getRequest(id), enabled: !!id });

export const useCreateRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requests });
      queryClient.invalidateQueries({ queryKey: queryKeys.collections });
    },
  });
};

export const useUpdateRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof api.updateRequest>[1] }) =>
      api.updateRequest(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requests });
      queryClient.invalidateQueries({ queryKey: queryKeys.request(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.collections });
    },
  });
};

export const useDeleteRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requests });
      queryClient.invalidateQueries({ queryKey: queryKeys.collections });
    },
  });
};

export const useDuplicateRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.duplicateRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requests });
      queryClient.invalidateQueries({ queryKey: queryKeys.collections });
    },
  });
};

export const useExecuteRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      variables,
      overrides,
      signal,
    }: {
      id: number;
      variables?: Record<string, string>;
      overrides?: { method: string; url: string; headers: string; body: string; bodyType: string; proxyId?: number };
      signal?: AbortSignal;
    }) => api.executeRequest(id, variables, overrides, signal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.history }),
  });
};

export const useExecuteAdhoc = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, signal }: { data: Parameters<typeof api.executeAdhoc>[0]; signal?: AbortSignal }) =>
      api.executeAdhoc(data, signal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.history }),
  });
};
