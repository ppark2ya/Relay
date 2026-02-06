import { useState, useCallback } from 'react';
import { useCollections, useCreateCollection, useDeleteCollection, useCreateRequest, useDeleteRequest, useFlows, useCreateFlow, useDeleteFlow, useHistory, useDeleteHistory } from '../hooks/useApi';
import { useClickOutside } from '../hooks/useClickOutside';
import type { Request, Collection, Flow } from '../types';

interface SidebarProps {
  view: 'requests' | 'flows' | 'history';
  onViewChange: (view: 'requests' | 'flows' | 'history') => void;
  onSelectRequest: (request: Request | null) => void;
  onSelectFlow: (flow: Flow | null) => void;
  selectedRequestId?: number;
  selectedFlowId?: number;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-600',
  POST: 'text-yellow-600',
  PUT: 'text-blue-600',
  DELETE: 'text-red-600',
  PATCH: 'text-purple-600',
};

function CollectionTree({
  collections,
  onSelectRequest,
  selectedRequestId,
  onDeleteCollection,
  onDeleteRequest,
  onCreateRequest,
}: {
  collections: Collection[];
  onSelectRequest: (request: Request) => void;
  selectedRequestId?: number;
  onDeleteCollection: (id: number) => void;
  onDeleteRequest: (id: number) => void;
  onCreateRequest: (collectionId: number) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpanded(newExpanded);
  };

  return (
    <div className="space-y-1">
      {collections.map(collection => (
        <div key={collection.id}>
          <div className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 rounded group">
            <button onClick={() => toggleExpand(collection.id)} className="p-0.5">
              <svg className={`w-4 h-4 transition-transform ${expanded.has(collection.id) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            <span className="flex-1 text-sm truncate">{collection.name}</span>
            <button
              onClick={() => onCreateRequest(collection.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded"
              title="Add Request"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={() => onDeleteCollection(collection.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded"
              title="Delete Collection"
            >
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          {expanded.has(collection.id) && (
            <div className="ml-4">
              {collection.requests?.map(request => (
                <div
                  key={request.id}
                  onClick={() => onSelectRequest(request)}
                  className={`flex items-center gap-2 px-2 py-1 cursor-pointer rounded group ${
                    selectedRequestId === request.id ? 'bg-blue-100' : 'hover:bg-gray-100'
                  }`}
                >
                  <span className={`text-xs font-mono font-semibold ${METHOD_COLORS[request.method] || 'text-gray-600'}`}>
                    {request.method}
                  </span>
                  <span className="flex-1 text-sm truncate">{request.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteRequest(request.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded"
                  >
                    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
              {collection.children && collection.children.length > 0 && (
                <CollectionTree
                  collections={collection.children}
                  onSelectRequest={onSelectRequest}
                  selectedRequestId={selectedRequestId}
                  onDeleteCollection={onDeleteCollection}
                  onDeleteRequest={onDeleteRequest}
                  onCreateRequest={onCreateRequest}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Sidebar({ view, onViewChange, onSelectRequest, onSelectFlow, selectedRequestId, selectedFlowId }: SidebarProps) {
  const { data: collections = [] } = useCollections();
  const { data: flows = [] } = useFlows();
  const { data: history = [] } = useHistory();
  const createCollection = useCreateCollection();
  const deleteCollection = useDeleteCollection();
  const createRequest = useCreateRequest();
  const deleteRequest = useDeleteRequest();
  const createFlow = useCreateFlow();
  const deleteFlow = useDeleteFlow();
  const deleteHistory = useDeleteHistory();

  const [newCollectionName, setNewCollectionName] = useState('');
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [showNewFlow, setShowNewFlow] = useState(false);

  const closeNewFlow = useCallback(() => setShowNewFlow(false), []);
  const newFlowRef = useClickOutside<HTMLDivElement>(closeNewFlow, showNewFlow);

  const handleCreateCollection = () => {
    if (newCollectionName.trim()) {
      createCollection.mutate({ name: newCollectionName.trim() });
      setNewCollectionName('');
      setShowNewCollection(false);
    }
  };

  const handleCreateRequest = (collectionId: number) => {
    createRequest.mutate({
      collectionId,
      name: 'New Request',
      method: 'GET',
      url: 'https://api.example.com',
    });
  };

  const handleCreateFlow = () => {
    if (newFlowName.trim()) {
      createFlow.mutate({ name: newFlowName.trim(), description: '' }, {
        onSuccess: (flow) => {
          onSelectFlow(flow);
        },
      });
      setNewFlowName('');
      setShowNewFlow(false);
    }
  };

  const handleDeleteFlow = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteFlow.mutate(id);
    if (selectedFlowId === id) {
      onSelectFlow(null);
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* View Tabs */}
      <div className="flex border-b border-gray-200">
        {(['requests', 'flows', 'history'] as const).map(v => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={`flex-1 px-2 py-2 text-sm font-medium ${
              view === v ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {view === 'requests' && (
          <>
            <div className="mb-2">
              {showNewCollection ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newCollectionName}
                    onChange={e => setNewCollectionName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateCollection()}
                    placeholder="Collection name"
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                    autoFocus
                  />
                  <button onClick={handleCreateCollection} className="px-2 py-1 bg-blue-600 text-white text-sm rounded">
                    Add
                  </button>
                  <button onClick={() => setShowNewCollection(false)} className="px-2 py-1 text-sm text-gray-500">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewCollection(true)}
                  className="w-full px-2 py-1 text-sm text-left text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Collection
                </button>
              )}
            </div>
            <CollectionTree
              collections={collections}
              onSelectRequest={onSelectRequest}
              selectedRequestId={selectedRequestId}
              onDeleteCollection={id => deleteCollection.mutate(id)}
              onDeleteRequest={id => deleteRequest.mutate(id)}
              onCreateRequest={handleCreateRequest}
            />
          </>
        )}

        {view === 'flows' && (
          <>
            <div className="mb-2" ref={newFlowRef}>
              {showNewFlow ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newFlowName}
                    onChange={e => setNewFlowName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreateFlow()}
                    placeholder="Flow name"
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                    autoFocus
                  />
                  <button onClick={handleCreateFlow} className="px-2 py-1 bg-blue-600 text-white text-sm rounded">
                    Add
                  </button>
                  <button onClick={() => setShowNewFlow(false)} className="px-2 py-1 text-sm text-gray-500">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewFlow(true)}
                  className="w-full px-2 py-1 text-sm text-left text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Flow
                </button>
              )}
            </div>
            <div className="space-y-1">
              {flows.length === 0 ? (
                <p className="text-sm text-gray-500 p-2">No flows created yet</p>
              ) : (
                flows.map(flow => (
                  <div
                    key={flow.id}
                    onClick={() => onSelectFlow(flow)}
                    className={`px-2 py-1 rounded cursor-pointer group ${
                      selectedFlowId === flow.id ? 'bg-blue-100' : 'hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{flow.name}</div>
                        <div className="text-xs text-gray-500 truncate">{flow.description || 'No description'}</div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteFlow(flow.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 rounded ml-1"
                      >
                        <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {view === 'history' && (
          <div className="space-y-1">
            {history.length === 0 ? (
              <p className="text-sm text-gray-500 p-2">No history yet</p>
            ) : (
              history.map(item => (
                <div key={item.id} className="px-2 py-1 hover:bg-gray-100 rounded group">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-semibold ${METHOD_COLORS[item.method] || 'text-gray-600'}`}>
                      {item.method}
                    </span>
                    <span className={`text-xs ${item.statusCode && item.statusCode >= 400 ? 'text-red-500' : 'text-green-500'}`}>
                      {item.statusCode || 'Error'}
                    </span>
                    <span className="text-xs text-gray-400">{item.durationMs}ms</span>
                    <button
                      onClick={() => deleteHistory.mutate(item.id)}
                      className="ml-auto opacity-0 group-hover:opacity-100 p-0.5"
                    >
                      <svg className="w-3 h-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-xs text-gray-600 truncate">{item.url}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
