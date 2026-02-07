import { useState, useMemo, useCallback } from 'react';
import {
  useProxies,
  useCreateProxy,
  useUpdateProxy,
  useDeleteProxy,
  useActivateProxy,
  useDeactivateProxy,
  useTestProxy,
} from '../api/proxies';
import type { Proxy } from '../types';
import { Modal, StatusDot, FormField, InlineCreateForm, EmptyState } from './ui';

interface ProxyEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProxyEditor({ isOpen, onClose }: ProxyEditorProps) {
  const { data: proxies = [] } = useProxies();
  const createProxy = useCreateProxy();
  const updateProxy = useUpdateProxy();
  const deleteProxy = useDeleteProxy();
  const activateProxy = useActivateProxy();
  const deactivateProxy = useDeactivateProxy();
  const testProxy = useTestProxy();

  const [selectedProxyId, setSelectedProxyId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [showNewProxyInput, setShowNewProxyInput] = useState(false);
  const [newProxyName, setNewProxyName] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncedProxyId, setSyncedProxyId] = useState<number | null>(null);

  // Auto-select first proxy or active one
  const effectiveProxyId = useMemo(() => {
    if (selectedProxyId !== null && proxies.some(p => p.id === selectedProxyId)) {
      return selectedProxyId;
    }
    if (isOpen && proxies.length > 0) {
      const active = proxies.find(p => p.isActive);
      return (active || proxies[0]).id;
    }
    return null;
  }, [isOpen, proxies, selectedProxyId]);

  const selectedProxy = useMemo(() =>
    proxies.find(p => p.id === effectiveProxyId) || null,
    [proxies, effectiveProxyId]
  );

  // Sync form fields when selected proxy changes (React recommended pattern)
  if (selectedProxy && selectedProxy.id !== syncedProxyId) {
    setSyncedProxyId(selectedProxy.id);
    setName(selectedProxy.name);
    setUrl(selectedProxy.url);
    setTestResult(null);
  }

  const setSelectedProxy = useCallback((proxy: Proxy | null) => {
    setSelectedProxyId(proxy?.id || null);
  }, []);

  const closeModal = useCallback(() => {
    onClose();
    setSelectedProxyId(null);
    setSyncedProxyId(null);
    setShowNewProxyInput(false);
    setNewProxyName('');
    setTestResult(null);
  }, [onClose]);

  const handleCreateProxy = () => {
    if (newProxyName.trim()) {
      createProxy.mutate({ name: newProxyName.trim(), url: '' }, {
        onSuccess: (proxy) => {
          setSelectedProxy(proxy);
          setShowNewProxyInput(false);
          setNewProxyName('');
        },
      });
    }
  };

  const handleSave = () => {
    if (!selectedProxy) return;

    updateProxy.mutate({
      id: selectedProxy.id,
      data: { name, url },
    }, {
      onSuccess: (proxy) => {
        setSelectedProxy(proxy);
      },
    });
  };

  const handleDelete = () => {
    if (!selectedProxy) return;
    if (!confirm(`Are you sure you want to delete "${selectedProxy.name}"?`)) return;

    deleteProxy.mutate(selectedProxy.id, {
      onSuccess: () => {
        setSelectedProxy(null);
      },
    });
  };

  const handleActivate = () => {
    if (!selectedProxy) return;
    activateProxy.mutate(selectedProxy.id, {
      onSuccess: (proxy) => {
        setSelectedProxy(proxy);
      },
    });
  };

  const handleDeactivate = () => {
    if (!selectedProxy) return;
    deactivateProxy.mutate(undefined, {
      onSuccess: () => {
        setSelectedProxy({ ...selectedProxy, isActive: false });
      },
    });
  };

  const handleTest = () => {
    if (!selectedProxy) return;
    setTestResult(null);

    testProxy.mutate(selectedProxy.id, {
      onSuccess: (result) => {
        setTestResult({
          success: result.success,
          message: result.success ? (result.message || 'Proxy is working!') : (result.error || 'Proxy test failed'),
        });
      },
      onError: (error) => {
        setTestResult({
          success: false,
          message: error.message || 'Failed to test proxy',
        });
      },
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title="Manage Proxies" maxWidth="max-w-2xl">
      <div className="flex flex-1 overflow-hidden">
        {/* Proxy List */}
        <div className="w-48 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <InlineCreateForm
              isOpen={showNewProxyInput}
              onOpenChange={setShowNewProxyInput}
              value={newProxyName}
              onValueChange={setNewProxyName}
              onSubmit={handleCreateProxy}
              placeholder="Proxy name"
              buttonLabel="New Proxy"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {proxies.map(proxy => (
              <button
                key={proxy.id}
                onClick={() => setSelectedProxy(proxy)}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                  selectedProxy?.id === proxy.id ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {proxy.isActive && <StatusDot color="green" />}
                <span className="truncate dark:text-gray-200">{proxy.name}</span>
              </button>
            ))}
            {proxies.length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                No proxies yet
              </div>
            )}
          </div>
        </div>

        {/* Proxy Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedProxy ? (
            <>
              <div className="p-4 space-y-4">
                {/* Name */}
                <FormField label="Name">
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Proxy name"
                    />
                    {!selectedProxy.isActive ? (
                      <button
                        onClick={handleActivate}
                        className="px-3 py-2 text-sm text-green-600 dark:text-green-400 border border-green-300 dark:border-green-600 rounded-md hover:bg-green-50 dark:hover:bg-green-900/30 whitespace-nowrap"
                      >
                        Set Active
                      </button>
                    ) : (
                      <button
                        onClick={handleDeactivate}
                        className="px-3 py-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 hover:border-red-300 whitespace-nowrap"
                      >
                        Active
                      </button>
                    )}
                  </div>
                </FormField>

                {/* URL */}
                <FormField label="Proxy URL">
                  <input
                    type="text"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="http://proxy.example.com:8080"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Supported formats: http://host:port, http://user:pass@host:port, socks5://host:port
                  </p>
                </FormField>

                {/* Test Proxy */}
                <div>
                  <button
                    onClick={handleTest}
                    disabled={testProxy.isPending || !url.trim()}
                    className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200 disabled:opacity-50"
                  >
                    {testProxy.isPending ? 'Testing...' : 'Test Connection'}
                  </button>
                  {testResult && (
                    <div className={`mt-2 px-3 py-2 rounded-md text-sm ${
                      testResult.success ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}>
                      {testResult.message}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="mt-auto p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <button
                  onClick={handleDelete}
                  className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md"
                >
                  Delete Proxy
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateProxy.isPending}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateProxy.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={
                <svg className="w-12 h-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              }
              message="Select or create a proxy"
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
