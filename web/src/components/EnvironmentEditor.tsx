import { useState, useEffect, useCallback } from 'react';
import {
  useEnvironments,
  useCreateEnvironment,
  useUpdateEnvironment,
  useDeleteEnvironment,
  useActivateEnvironment,
} from '../hooks/useApi';
import { useClickOutside } from '../hooks/useClickOutside';
import type { Environment } from '../types';

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

  const [selectedEnv, setSelectedEnv] = useState<Environment | null>(null);
  const [name, setName] = useState('');
  const [variables, setVariables] = useState<VariableItem[]>([]);
  const [showNewEnvInput, setShowNewEnvInput] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');

  const closeModal = useCallback(() => {
    onClose();
    setSelectedEnv(null);
    setShowNewEnvInput(false);
    setNewEnvName('');
  }, [onClose]);

  const modalRef = useClickOutside<HTMLDivElement>(closeModal, isOpen);

  // Load selected environment data
  useEffect(() => {
    if (selectedEnv) {
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
  }, [selectedEnv]);

  // Auto-select first environment or active one
  useEffect(() => {
    if (isOpen && environments.length > 0 && !selectedEnv) {
      const active = environments.find(e => e.isActive);
      setSelectedEnv(active || environments[0]);
    }
  }, [isOpen, environments, selectedEnv]);

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

  const handleAddVariable = () => {
    setVariables([...variables, { key: '', value: '' }]);
  };

  const handleRemoveVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  const handleVariableChange = (index: number, field: 'key' | 'value', val: string) => {
    const newVars = [...variables];
    newVars[index] = { ...newVars[index], [field]: val };
    setVariables(newVars);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Manage Environments</h2>
          <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Environment List */}
          <div className="w-56 border-r border-gray-200 flex flex-col">
            <div className="p-3 border-b border-gray-200">
              {showNewEnvInput ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newEnvName}
                    onChange={e => setNewEnvName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateEnv();
                      if (e.key === 'Escape') {
                        setShowNewEnvInput(false);
                        setNewEnvName('');
                      }
                    }}
                    placeholder="Environment name"
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateEnv}
                    className="px-2 py-1 bg-blue-600 text-white text-sm rounded"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewEnvInput(true)}
                  className="w-full px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Environment
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {environments.map(env => (
                <button
                  key={env.id}
                  onClick={() => setSelectedEnv(env)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                    selectedEnv?.id === env.id ? 'bg-blue-100' : 'hover:bg-gray-100'
                  }`}
                >
                  {env.isActive && (
                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  )}
                  <span className="truncate">{env.name}</span>
                </button>
              ))}
              {environments.length === 0 && (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  No environments yet
                </div>
              )}
            </div>
          </div>

          {/* Environment Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedEnv ? (
              <>
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Environment name"
                    />
                    {!selectedEnv.isActive && (
                      <button
                        onClick={handleActivate}
                        className="px-3 py-2 text-sm text-green-600 border border-green-300 rounded-md hover:bg-green-50"
                      >
                        Set Active
                      </button>
                    )}
                    {selectedEnv.isActive && (
                      <span className="px-3 py-2 text-sm text-green-600 bg-green-50 rounded-md">
                        Active
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-gray-700">Variables</h3>
                    <p className="text-xs text-gray-500">
                      Use <code className="bg-gray-100 px-1 rounded">{'{{variableName}}'}</code> in requests
                    </p>
                  </div>
                  <div className="space-y-2">
                    {/* Header Row */}
                    <div className="flex gap-2 text-xs font-medium text-gray-500">
                      <div className="flex-1 px-2">Variable</div>
                      <div className="flex-1 px-2">Value</div>
                      <div className="w-8" />
                    </div>
                    {variables.map((item, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={item.key}
                          onChange={e => handleVariableChange(index, 'key', e.target.value)}
                          placeholder="Variable name"
                          className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm font-mono"
                        />
                        <input
                          type="text"
                          value={item.value}
                          onChange={e => handleVariableChange(index, 'value', e.target.value)}
                          placeholder="Value"
                          className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                        <button
                          onClick={() => handleRemoveVariable(index)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={handleAddVariable}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      + Add Variable
                    </button>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                  <button
                    onClick={handleDelete}
                    className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md"
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
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-sm">Select or create an environment</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
