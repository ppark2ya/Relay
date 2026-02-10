import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../shared/queryKeys';
import type { FlowStep } from './types';
import * as api from './client';

export const useFlows = () =>
  useQuery({ queryKey: queryKeys.flows, queryFn: api.getFlows });

export const useFlow = (id: number) =>
  useQuery({ queryKey: queryKeys.flow(id), queryFn: () => api.getFlow(id), enabled: !!id });

export const useFlowSteps = (flowId: number) =>
  useQuery({ queryKey: queryKeys.flowSteps(flowId), queryFn: () => api.getFlowSteps(flowId), enabled: !!flowId });

export const useCreateFlow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createFlow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.flows }),
  });
};

export const useUpdateFlow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; description: string } }) =>
      api.updateFlow(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.flows }),
  });
};

export const useDeleteFlow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteFlow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.flows }),
  });
};

export const useDuplicateFlow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.duplicateFlow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.flows }),
  });
};

export const useReorderFlows = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.reorderFlows,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.flows }),
  });
};

export const useRunFlow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ flowId, stepIds }: { flowId: number; stepIds?: number[] }) =>
      api.runFlow(flowId, stepIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.history }),
  });
};

export const useCreateFlowStep = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ flowId, data }: { flowId: number; data: Parameters<typeof api.createFlowStep>[1] }) =>
      api.createFlowStep(flowId, data),
    onSuccess: (_, { flowId }) => queryClient.invalidateQueries({ queryKey: queryKeys.flowSteps(flowId) }),
  });
};

export const useUpdateFlowStep = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ flowId, stepId, data }: { flowId: number; stepId: number; data: Partial<FlowStep> }) =>
      api.updateFlowStep(flowId, stepId, data),
    onSuccess: (_, { flowId }) => queryClient.invalidateQueries({ queryKey: queryKeys.flowSteps(flowId) }),
  });
};

export const useDeleteFlowStep = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ flowId, stepId }: { flowId: number; stepId: number }) =>
      api.deleteFlowStep(flowId, stepId),
    onSuccess: (_, { flowId }) => queryClient.invalidateQueries({ queryKey: queryKeys.flowSteps(flowId) }),
  });
};
