import { useState, useMemo, useCallback } from 'react';
import {
  useProxies,
  useCreateProxy,
  useUpdateProxy,
  useDeleteProxy,
  useActivateProxy,
  useDeactivateProxy,
  useTestProxy,
} from '../hooks/useApi';
import { useClickOutside } from '../hooks/useClickOutside';
import type { Proxy } from '../types';

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

  const modalRef = useClickOutside<HTMLDivElement>(closeModal, isOpen);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Manage Proxies</h2>
          <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Proxy List */}
          <div className="w-48 border-r border-gray-200 flex flex-col">
            <div className="p-3 border-b border-gray-200">
              {showNewProxyInput ? (
                <div className="flex flex-col gap-1">
                  <input
                    type="text"
                    value={newProxyName}
                    onChange={e => setNewProxyName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreateProxy();
                      if (e.key === 'Escape') {
                        setShowNewProxyInput(false);
                        setNewProxyName('');
                      }
                    }}
                    placeholder="Proxy name"
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                    autoFocus
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setShowNewProxyInput(false); setNewProxyName(''); }}
                      className="flex-1 px-2 py-1 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateProxy}
                      className="flex-1 px-2 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewProxyInput(true)}
                  className="w-full px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Proxy
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {proxies.map(proxy => (
                <button
                  key={proxy.id}
                  onClick={() => setSelectedProxy(proxy)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                    selectedProxy?.id === proxy.id ? 'bg-blue-100' : 'hover:bg-gray-100'
                  }`}
                >
                  {proxy.isActive && (
                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  )}
                  <span className="truncate">{proxy.name}</span>
                </button>
              ))}
              {proxies.length === 0 && (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Proxy name"
                      />
                      {!selectedProxy.isActive ? (
                        <button
                          onClick={handleActivate}
                          className="px-3 py-2 text-sm text-green-600 border border-green-300 rounded-md hover:bg-green-50 whitespace-nowrap"
                        >
                          Set Active
                        </button>
                      ) : (
                        <button
                          onClick={handleDeactivate}
                          className="px-3 py-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-red-50 hover:text-red-600 hover:border-red-300 whitespace-nowrap"
                        >
                          Active
                        </button>
                      )}
                    </div>
                  </div>

                  {/* URL */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Proxy URL</label>
                    <input
                      type="text"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="http://proxy.example.com:8080"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Supported formats: http://host:port, http://user:pass@host:port, socks5://host:port
                    </p>
                  </div>

                  {/* Test Proxy */}
                  <div>
                    <button
                      onClick={handleTest}
                      disabled={testProxy.isPending || !url.trim()}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      {testProxy.isPending ? 'Testing...' : 'Test Connection'}
                    </button>
                    {testResult && (
                      <div className={`mt-2 px-3 py-2 rounded-md text-sm ${
                        testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {testResult.message}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-auto p-4 border-t border-gray-200 flex items-center justify-between">
                  <button
                    onClick={handleDelete}
                    className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md"
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
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                  <p className="text-sm">Select or create a proxy</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
