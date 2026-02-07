import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useCollections, useCreateCollection, useDeleteCollection, useDuplicateCollection, useCreateRequest, useDeleteRequest, useDuplicateRequest, useFlows, useCreateFlow, useDeleteFlow, useDuplicateFlow, useHistory, useDeleteHistory } from '../hooks/useApi';
import { useClickOutside } from '../hooks/useClickOutside';
import type { Request, Collection, Flow, History } from '../types';
import { MethodBadge, TabNav, InlineCreateForm } from './ui';

interface SidebarProps {
  view: 'requests' | 'flows' | 'history';
  onViewChange: (view: 'requests' | 'flows' | 'history') => void;
  onSelectRequest: (request: Request | null) => void;
  onSelectFlow: (flow: Flow | null) => void;
  onSelectHistory: (history: History) => void;
  selectedRequestId?: number;
  selectedFlowId?: number;
}

function groupHistoryByDate(history: History[]): { label: string; items: History[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = new Map<string, History[]>();

  for (const item of history) {
    const date = new Date(item.createdAt);
    const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    let label: string;
    if (itemDate.getTime() === today.getTime()) {
      label = 'Today';
    } else if (itemDate.getTime() === yesterday.getTime()) {
      label = 'Yesterday';
    } else {
      label = itemDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(item);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function containsRequest(collection: Collection, requestId: number): boolean {
  if (collection.requests?.some(r => r.id === requestId)) return true;
  if (collection.children?.some(c => containsRequest(c, requestId))) return true;
  return false;
}

function CollectionTree({
  collections,
  onSelectRequest,
  selectedRequestId,
  onDeleteCollection,
  onDeleteRequest,
  onCreateRequest,
  onDuplicateCollection,
  onDuplicateRequest,
}: {
  collections: Collection[];
  onSelectRequest: (request: Request) => void;
  selectedRequestId?: number;
  onDeleteCollection: (id: number) => void;
  onDeleteRequest: (id: number) => void;
  onCreateRequest: (collectionId: number) => void;
  onDuplicateCollection: (id: number) => void;
  onDuplicateRequest: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const lastAutoExpandedRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (selectedRequestId && selectedRequestId !== lastAutoExpandedRef.current) {
      lastAutoExpandedRef.current = selectedRequestId;
      const toExpand: number[] = [];
      for (const c of collections) {
        if (containsRequest(c, selectedRequestId)) {
          toExpand.push(c.id);
        }
      }
      if (toExpand.length > 0) {
        setExpanded(prev => {
          const next = new Set(prev);
          toExpand.forEach(id => next.add(id));
          return next;
        });
      }
    }
  }, [selectedRequestId, collections]);

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
          <div onClick={() => toggleExpand(collection.id)} className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded group cursor-pointer">
            <svg className={`w-4 h-4 transition-transform text-gray-500 dark:text-gray-400 ${expanded.has(collection.id) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            <span className="flex-1 text-sm truncate dark:text-gray-200">{collection.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onCreateRequest(collection.id); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              title="Add Request"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicateCollection(collection.id); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              title="Duplicate Collection"
            >
              <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteCollection(collection.id); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
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
                    selectedRequestId === request.id ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <MethodBadge method={request.method} />
                  <span className="flex-1 text-sm truncate dark:text-gray-200">{request.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDuplicateRequest(request.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    title="Duplicate Request"
                  >
                    <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteRequest(request.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    title="Delete Request"
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
                  onDuplicateCollection={onDuplicateCollection}
                  onDuplicateRequest={onDuplicateRequest}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Sidebar({ view, onViewChange, onSelectRequest, onSelectFlow, onSelectHistory, selectedRequestId, selectedFlowId }: SidebarProps) {
  const { data: collections = [] } = useCollections();
  const { data: flows = [] } = useFlows();
  const { data: history = [] } = useHistory();
  const createCollection = useCreateCollection();
  const deleteCollection = useDeleteCollection();
  const createRequest = useCreateRequest();
  const deleteRequest = useDeleteRequest();
  const createFlow = useCreateFlow();
  const deleteFlow = useDeleteFlow();
  const duplicateCollection = useDuplicateCollection();
  const duplicateRequest = useDuplicateRequest();
  const duplicateFlow = useDuplicateFlow();
  const deleteHistory = useDeleteHistory();

  const [newCollectionName, setNewCollectionName] = useState('');
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [showNewFlow, setShowNewFlow] = useState(false);
  const [expandedDateGroups, setExpandedDateGroups] = useState<Set<string>>(new Set(['Today', 'Yesterday']));

  const dateGroups = useMemo(() => groupHistoryByDate(history), [history]);

  const toggleDateGroup = (label: string) => {
    setExpandedDateGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

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
    <aside className="w-64 min-w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      {/* View Tabs */}
      <TabNav
        tabs={[
          { key: 'requests', label: 'Requests' },
          { key: 'flows', label: 'Flows' },
          { key: 'history', label: 'History' },
        ]}
        activeTab={view}
        onTabChange={key => onViewChange(key as 'requests' | 'flows' | 'history')}
        tabClassName="flex-1"
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {view === 'requests' && (
          <>
            <div className="mb-2">
              <InlineCreateForm
                isOpen={showNewCollection}
                onOpenChange={setShowNewCollection}
                value={newCollectionName}
                onValueChange={setNewCollectionName}
                onSubmit={handleCreateCollection}
                placeholder="Collection name"
                buttonLabel="New Collection"
              />
            </div>
            <CollectionTree
              collections={collections}
              onSelectRequest={onSelectRequest}
              selectedRequestId={selectedRequestId}
              onDeleteCollection={id => deleteCollection.mutate(id)}
              onDeleteRequest={id => deleteRequest.mutate(id)}
              onCreateRequest={handleCreateRequest}
              onDuplicateCollection={id => duplicateCollection.mutate(id)}
              onDuplicateRequest={id => duplicateRequest.mutate(id)}
            />
          </>
        )}

        {view === 'flows' && (
          <>
            <div className="mb-2" ref={newFlowRef}>
              <InlineCreateForm
                isOpen={showNewFlow}
                onOpenChange={setShowNewFlow}
                value={newFlowName}
                onValueChange={setNewFlowName}
                onSubmit={handleCreateFlow}
                placeholder="Flow name"
                buttonLabel="New Flow"
              />
            </div>
            <div className="space-y-1">
              {flows.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No flows created yet</p>
              ) : (
                flows.map(flow => (
                  <div
                    key={flow.id}
                    onClick={() => onSelectFlow(flow)}
                    className={`px-2 py-1 rounded cursor-pointer group ${
                      selectedFlowId === flow.id ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate dark:text-gray-200">{flow.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{flow.description || 'No description'}</div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); duplicateFlow.mutate(flow.id); }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded ml-1"
                        title="Duplicate Flow"
                      >
                        <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => handleDeleteFlow(flow.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded ml-1"
                        title="Delete Flow"
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
              <p className="text-sm text-gray-500 dark:text-gray-400 p-2">No history yet</p>
            ) : (
              dateGroups.map(group => (
                <div key={group.label}>
                  <div
                    onClick={() => toggleDateGroup(group.label)}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                  >
                    <svg className={`w-4 h-4 transition-transform text-gray-500 dark:text-gray-400 ${expandedDateGroups.has(group.label) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200">{group.label}</span>
                    <span className="text-xs text-gray-400">{group.items.length}</span>
                  </div>
                  {expandedDateGroups.has(group.label) && (
                    <div className="ml-2">
                      {group.items.map(item => (
                        <div
                          key={item.id}
                          onClick={() => onSelectHistory(item)}
                          className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded group cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <MethodBadge method={item.method} />
                            <span className={`text-xs ${item.statusCode && item.statusCode >= 400 ? 'text-red-500' : 'text-green-500'}`}>
                              {item.statusCode || 'Error'}
                            </span>
                            <span className="text-xs text-gray-400">{formatTime(item.createdAt)}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteHistory.mutate(item.id); }}
                              className="ml-auto opacity-0 group-hover:opacity-100 p-0.5"
                            >
                              <svg className="w-3 h-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-300 truncate">{item.url}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
