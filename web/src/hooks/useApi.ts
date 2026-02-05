import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/client';

// Collections
export const useCollections = () => useQuery({ queryKey: ['collections'], queryFn: api.getCollections });
export const useCollection = (id: number) => useQuery({ queryKey: ['collections', id], queryFn: () => api.getCollection(id), enabled: !!id });

export const useCreateCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createCollection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collections'] }),
  });
};

export const useUpdateCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; parentId?: number } }) => api.updateCollection(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collections'] }),
  });
};

export const useDeleteCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteCollection,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collections'] }),
  });
};

// Requests
export const useRequests = () => useQuery({ queryKey: ['requests'], queryFn: api.getRequests });
export const useRequest = (id: number) => useQuery({ queryKey: ['requests', id], queryFn: () => api.getRequest(id), enabled: !!id });

export const useCreateRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
};

export const useUpdateRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof api.updateRequest>[1] }) => api.updateRequest(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
};

export const useDeleteRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['collections'] });
    },
  });
};

export const useExecuteRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, variables }: { id: number; variables?: Record<string, string> }) => api.executeRequest(id, variables),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] }),
  });
};

// Environments
export const useEnvironments = () => useQuery({ queryKey: ['environments'], queryFn: api.getEnvironments });

export const useCreateEnvironment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createEnvironment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['environments'] }),
  });
};

export const useUpdateEnvironment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; variables: string } }) => api.updateEnvironment(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['environments'] }),
  });
};

export const useDeleteEnvironment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteEnvironment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['environments'] }),
  });
};

export const useActivateEnvironment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.activateEnvironment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['environments'] }),
  });
};

// Proxies
export const useProxies = () => useQuery({ queryKey: ['proxies'], queryFn: api.getProxies });

export const useCreateProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createProxy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proxies'] }),
  });
};

export const useUpdateProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; url: string } }) => api.updateProxy(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proxies'] }),
  });
};

export const useDeleteProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteProxy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proxies'] }),
  });
};

export const useActivateProxy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.activateProxy,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proxies'] }),
  });
};

// Flows
export const useFlows = () => useQuery({ queryKey: ['flows'], queryFn: api.getFlows });
export const useFlow = (id: number) => useQuery({ queryKey: ['flows', id], queryFn: () => api.getFlow(id), enabled: !!id });
export const useFlowSteps = (flowId: number) => useQuery({ queryKey: ['flows', flowId, 'steps'], queryFn: () => api.getFlowSteps(flowId), enabled: !!flowId });

export const useCreateFlow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createFlow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows'] }),
  });
};

export const useUpdateFlow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; description: string } }) => api.updateFlow(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows'] }),
  });
};

export const useDeleteFlow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteFlow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['flows'] }),
  });
};

export const useRunFlow = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.runFlow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] }),
  });
};

export const useCreateFlowStep = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ flowId, data }: { flowId: number; data: Parameters<typeof api.createFlowStep>[1] }) => api.createFlowStep(flowId, data),
    onSuccess: (_, { flowId }) => queryClient.invalidateQueries({ queryKey: ['flows', flowId, 'steps'] }),
  });
};

export const useDeleteFlowStep = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ flowId, stepId }: { flowId: number; stepId: number }) => api.deleteFlowStep(flowId, stepId),
    onSuccess: (_, { flowId }) => queryClient.invalidateQueries({ queryKey: ['flows', flowId, 'steps'] }),
  });
};

// History
export const useHistory = () => useQuery({ queryKey: ['history'], queryFn: api.getHistory });

export const useDeleteHistory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteHistory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] }),
  });
};
