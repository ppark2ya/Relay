import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../shared/queryKeys';
import * as api from './client';

export const useEnvironments = () =>
  useQuery({ queryKey: queryKeys.environments, queryFn: api.getEnvironments });

export const useCreateEnvironment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createEnvironment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.environments }),
  });
};

export const useUpdateEnvironment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; variables: string } }) =>
      api.updateEnvironment(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.environments }),
  });
};

export const useDeleteEnvironment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteEnvironment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.environments }),
  });
};

export const useActivateEnvironment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.activateEnvironment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.environments }),
  });
};
