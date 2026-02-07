export const queryKeys = {
  collections: ['collections'] as const,
  requests: ['requests'] as const,
  request: (id: number) => ['requests', id] as const,
  environments: ['environments'] as const,
  proxies: ['proxies'] as const,
  flows: ['flows'] as const,
  flow: (id: number) => ['flows', id] as const,
  flowSteps: (flowId: number) => ['flows', flowId, 'steps'] as const,
  history: ['history'] as const,
};
