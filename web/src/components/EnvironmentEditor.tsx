import { useState, useMemo, useCallback } from 'react';
import {
  useEnvironments,
  useCreateEnvironment,
  useUpdateEnvironment,
  useDeleteEnvironment,
  useActivateEnvironment,
} from '../hooks/useApi';
import type { Environment } from '../types';
import { Modal, StatusDot, KeyValueEditor, InlineCreateForm, EmptyState } from './ui';

interface EnvironmentEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

interface VariableItem {
  key: string;
  value: string;
}

export function EnvironmentEditor({ isOpen, onClose }: EnvironmentEditorProps) {
  const { data: environments = [] } = useEnvironments();
  const createEnv = useCreateEnvironment();
  const updateEnv = useUpdateEnvironment();
  const deleteEnv = useDeleteEnvironment();
  const activateEnv = useActivateEnvironment();

  const [selectedEnvId, setSelectedEnvId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [variables, setVariables] = useState<VariableItem[]>([]);
  const [showNewEnvInput, setShowNewEnvInput] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [syncedEnvId, setSyncedEnvId] = useState<number | null>(null);

  // Auto-select first environment or active one
  const effectiveEnvId = useMemo(() => {
    if (selectedEnvId !== null && environments.some(e => e.id === selectedEnvId)) {
      return selectedEnvId;
    }
    if (isOpen && environments.length > 0) {
      const active = environments.find(e => e.isActive);
      return (active || environments[0]).id;
    }
    return null;
  }, [isOpen, environments, selectedEnvId]);

  const selectedEnv = useMemo(() =>
    environments.find(e => e.id === effectiveEnvId) || null,
    [environments, effectiveEnvId]
  );

  // Sync form fields when selected env changes (React recommended pattern)
  if (selectedEnv && selectedEnv.id !== syncedEnvId) {
    setSyncedEnvId(selectedEnv.id);
    setName(selectedEnv.name);
    try {
      const parsed = JSON.parse(selectedEnv.variables || '{}');
      const items = Object.entries(parsed).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setVariables(items.length > 0 ? items : [{ key: '', value: '' }]);
    } catch {
      setVariables([{ key: '', value: '' }]);
    }
  }

  const setSelectedEnv = useCallback((env: Environment | null) => {
    setSelectedEnvId(env?.id || null);
  }, []);

  const closeModal = useCallback(() => {
    onClose();
    setSelectedEnvId(null);
    setSyncedEnvId(null);
    setShowNewEnvInput(false);
    setNewEnvName('');
  }, [onClose]);

  const handleCreateEnv = () => {
    if (newEnvName.trim()) {
      createEnv.mutate({ name: newEnvName.trim(), variables: '{}' }, {
        onSuccess: (env) => {
          setSelectedEnv(env);
          setShowNewEnvInput(false);
          setNewEnvName('');
        },
      });
    }
  };

  const handleSave = () => {
    if (!selectedEnv) return;

    const varsObj: Record<string, string> = {};
    variables.forEach(({ key, value }) => {
      if (key.trim()) {
        varsObj[key.trim()] = value;
      }
    });

    updateEnv.mutate({
      id: selectedEnv.id,
      data: {
        name,
        variables: JSON.stringify(varsObj),
      },
    }, {
      onSuccess: (env) => {
        setSelectedEnv(env);
      },
    });
  };

  const handleDelete = () => {
    if (!selectedEnv) return;
    if (!confirm(`Are you sure you want to delete "${selectedEnv.name}"?`)) return;

    deleteEnv.mutate(selectedEnv.id, {
      onSuccess: () => {
        setSelectedEnv(null);
      },
    });
  };

  const handleActivate = () => {
    if (!selectedEnv) return;
    activateEnv.mutate(selectedEnv.id);
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title="Manage Environments">
      <div className="flex flex-1 overflow-hidden">
        {/* Environment List */}
        <div className="w-56 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <InlineCreateForm
              isOpen={showNewEnvInput}
              onOpenChange={setShowNewEnvInput}
              value={newEnvName}
              onValueChange={setNewEnvName}
              onSubmit={handleCreateEnv}
              placeholder="Environment name"
              buttonLabel="New Environment"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {environments.map(env => (
              <button
                key={env.id}
                onClick={() => setSelectedEnv(env)}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                  selectedEnv?.id === env.id ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {env.isActive && <StatusDot color="green" />}
                <span className="truncate">{env.name}</span>
              </button>
            ))}
            {environments.length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                No environments yet
              </div>
            )}
          </div>
        </div>

        {/* Environment Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedEnv ? (
            <>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Environment name"
                  />
                  {!selectedEnv.isActive && (
                    <button
                      onClick={handleActivate}
                      className="px-3 py-2 text-sm text-green-600 dark:text-green-400 border border-green-300 dark:border-green-600 rounded-md hover:bg-green-50 dark:hover:bg-green-900/30"
                    >
                      Set Active
                    </button>
                  )}
                  {selectedEnv.isActive && (
                    <span className="px-3 py-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-md">
                      Active
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">Variables</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Use <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{variableName}}'}</code> in requests
                  </p>
                </div>
                <KeyValueEditor
                  items={variables}
                  onChange={setVariables}
                  showHeader
                  keyPlaceholder="Variable name"
                  valuePlaceholder="Value"
                  addLabel="+ Add Variable"
                  keyClassName="font-mono"
                />
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <button
                  onClick={handleDelete}
                  className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
                >
                  Delete Environment
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateEnv.isPending}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateEnv.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={
                <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
              message="Select or create an environment"
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
