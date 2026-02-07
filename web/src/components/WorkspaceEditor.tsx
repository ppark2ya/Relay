import { useState, useMemo, useCallback } from 'react';
import {
  useWorkspaces,
  useCreateWorkspace,
  useUpdateWorkspace,
  useDeleteWorkspace,
} from '../api/workspaces';
import type { Workspace } from '../types';
import { Modal, StatusDot, InlineCreateForm, EmptyState } from './ui';

interface WorkspaceEditorProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspaceId: number;
  onSwitchWorkspace: (id: number) => void;
}

export function WorkspaceEditor({ isOpen, onClose, currentWorkspaceId, onSwitchWorkspace }: WorkspaceEditorProps) {
  const { data: workspaces = [] } = useWorkspaces();
  const createWorkspace = useCreateWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();

  const [selectedWsId, setSelectedWsId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [showNewWsInput, setShowNewWsInput] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [syncedWsId, setSyncedWsId] = useState<number | null>(null);

  // Auto-select current workspace or first one
  const effectiveWsId = useMemo(() => {
    if (selectedWsId !== null && workspaces.some(w => w.id === selectedWsId)) {
      return selectedWsId;
    }
    if (isOpen && workspaces.length > 0) {
      const current = workspaces.find(w => w.id === currentWorkspaceId);
      return (current || workspaces[0]).id;
    }
    return null;
  }, [isOpen, workspaces, selectedWsId, currentWorkspaceId]);

  const selectedWs = useMemo(() =>
    workspaces.find(w => w.id === effectiveWsId) || null,
    [workspaces, effectiveWsId]
  );

  // Sync form fields when selected workspace changes
  if (selectedWs && selectedWs.id !== syncedWsId) {
    setSyncedWsId(selectedWs.id);
    setName(selectedWs.name);
  }

  const setSelectedWorkspace = useCallback((ws: Workspace | null) => {
    setSelectedWsId(ws?.id || null);
  }, []);

  const closeModal = useCallback(() => {
    onClose();
    setSelectedWsId(null);
    setSyncedWsId(null);
    setShowNewWsInput(false);
    setNewWsName('');
  }, [onClose]);

  const handleCreateWorkspace = () => {
    if (newWsName.trim()) {
      createWorkspace.mutate({ name: newWsName.trim() }, {
        onSuccess: (ws) => {
          setSelectedWorkspace(ws);
          setShowNewWsInput(false);
          setNewWsName('');
        },
      });
    }
  };

  const handleSave = () => {
    if (!selectedWs) return;

    updateWorkspace.mutate({
      id: selectedWs.id,
      data: { name },
    }, {
      onSuccess: (ws) => {
        setSelectedWorkspace(ws);
      },
    });
  };

  const handleDelete = () => {
    if (!selectedWs) return;
    if (selectedWs.id === 1) return; // Cannot delete Default workspace
    if (!confirm(`Are you sure you want to delete "${selectedWs.name}"? All data in this workspace will be permanently deleted.`)) return;

    deleteWorkspace.mutate(selectedWs.id, {
      onSuccess: () => {
        setSelectedWorkspace(null);
        // If deleting the current workspace, switch to Default
        if (selectedWs.id === currentWorkspaceId) {
          onSwitchWorkspace(1);
        }
      },
    });
  };

  const handleSwitch = () => {
    if (!selectedWs) return;
    onSwitchWorkspace(selectedWs.id);
    closeModal();
  };

  const isCurrent = selectedWs?.id === currentWorkspaceId;

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title="Manage Workspaces" maxWidth="max-w-2xl">
      <div className="flex flex-1 overflow-hidden">
        {/* Workspace List */}
        <div className="w-48 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <InlineCreateForm
              isOpen={showNewWsInput}
              onOpenChange={setShowNewWsInput}
              value={newWsName}
              onValueChange={setNewWsName}
              onSubmit={handleCreateWorkspace}
              placeholder="Workspace name"
              buttonLabel="New Workspace"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => setSelectedWorkspace(ws)}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                  selectedWs?.id === ws.id ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {ws.id === currentWorkspaceId && <StatusDot color="blue" />}
                <span className="truncate dark:text-gray-200">{ws.name}</span>
              </button>
            ))}
            {workspaces.length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                No workspaces yet
              </div>
            )}
          </div>
        </div>

        {/* Workspace Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedWs ? (
            <>
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Workspace name"
                  />
                  {isCurrent ? (
                    <span className="px-3 py-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-md whitespace-nowrap">
                      Current
                    </span>
                  ) : (
                    <button
                      onClick={handleSwitch}
                      className="px-3 py-2 text-sm text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 whitespace-nowrap"
                    >
                      Switch
                    </button>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <button
                  onClick={handleDelete}
                  disabled={selectedWs.id === 1}
                  className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                  title={selectedWs.id === 1 ? 'Cannot delete the Default workspace' : undefined}
                >
                  Delete Workspace
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateWorkspace.isPending}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateWorkspace.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={
                <svg className="w-12 h-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
              message="Select or create a workspace"
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
