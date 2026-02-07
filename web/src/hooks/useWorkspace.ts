import { createContext, useContext, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkspaces } from '../api/workspaces';

export interface WorkspaceContextValue {
  currentWorkspaceId: number;
  switchWorkspace: (id: number) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({
  currentWorkspaceId: 1,
  switchWorkspace: () => {},
});

export function useWorkspaceContext(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}

export function useWorkspaceProvider(): WorkspaceContextValue {
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<number>(() => {
    const stored = localStorage.getItem('workspaceId');
    return stored ? parseInt(stored, 10) || 1 : 1;
  });
  const queryClient = useQueryClient();

  const switchWorkspace = useCallback((id: number) => {
    setCurrentWorkspaceId(id);
    localStorage.setItem('workspaceId', String(id));
    // Invalidate all queries to re-fetch data for the new workspace
    queryClient.invalidateQueries();
  }, [queryClient]);

  return { currentWorkspaceId, switchWorkspace };
}

// Re-export for convenience
export { useWorkspaces };
