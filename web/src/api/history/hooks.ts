import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../shared/queryKeys';
import * as api from './client';

export const useHistory = () =>
  useQuery({ queryKey: queryKeys.history, queryFn: api.getHistory });

export const useDeleteHistory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteHistory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.history }),
  });
};
