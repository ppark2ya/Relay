import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useCollections, useCreateCollection, useDeleteCollection, useDuplicateCollection, useUpdateCollection } from '../api/collections';
import { useCreateRequest, useDeleteRequest, useDuplicateRequest } from '../api/requests';
import { useFlows, useCreateFlow, useDeleteFlow, useDuplicateFlow, useUpdateFlow } from '../api/flows';
import { useHistory, useDeleteHistory } from '../api/history';
import { useClickOutside } from '../hooks/useClickOutside';
import type { Request, Collection, Flow, History } from '../types';
import { MethodBadge, TabNav, InlineCreateForm } from './ui';
import { filterCollectionTree, filterFlows, filterHistory } from '../utils/searchUtils';

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
  onCreateSubfolder,
  onDuplicateCollection,
  onDuplicateRequest,
  forceExpandedIds,
}: {
  collections: Collection[];
  onSelectRequest: (request: Request) => void;
  selectedRequestId?: number;
  onDeleteCollection: (id: number) => void;
  onDeleteRequest: (id: number) => void;
  onCreateRequest: (collectionId: number) => void;
  onCreateSubfolder: (parentId: number) => void;
  onDuplicateCollection: (id: number) => void;
  onDuplicateRequest: (id: number) => void;
  forceExpandedIds?: Set<number> | null;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [lastAutoExpanded, setLastAutoExpanded] = useState<number | undefined>(undefined);
  const [editingCollectionId, setEditingCollectionId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const updateCollection = useUpdateCollection();

  // Render-time state adjustment (React recommended pattern)
  if (selectedRequestId && selectedRequestId !== lastAutoExpanded) {
    setLastAutoExpanded(selectedRequestId);
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

  // When forceExpandedIds is active (filter mode), use it; otherwise use manual state
  const effectiveExpanded = forceExpandedIds ?? expanded;

  const toggleExpand = (id: number) => {
    if (forceExpandedIds) return; // Don't allow manual toggle during filter
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
            <svg className={`w-4 h-4 transition-transform text-gray-500 dark:text-gray-400 ${effectiveExpanded.has(collection.id) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            {editingCollectionId === collection.id ? (
              <input
                type="text"
                value={editName}
                data-rename-input
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const trimmed = editName.trim();
                    if (trimmed && trimmed !== collection.name) {
                      updateCollection.mutate({ id: collection.id, data: { name: trimmed } });
                    }
                    setEditingCollectionId(null);
                  }
                  if (e.key === 'Escape') {
                    setEditingCollectionId(null);
                  }
                }}
                onBlur={() => {
                  const trimmed = editName.trim();
                  if (trimmed && trimmed !== collection.name) {
                    updateCollection.mutate({ id: collection.id, data: { name: trimmed } });
                  }
                  setEditingCollectionId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
                className="flex-1 text-xs bg-white dark:bg-gray-700 border border-blue-500 rounded px-1 py-0 outline-none dark:text-gray-200"
              />
            ) : (
              <span
                className="flex-1 text-xs truncate dark:text-gray-200"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingCollectionId(collection.id);
                  setEditName(collection.name);
                }}
              >
                {collection.name}
              </span>
            )}
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
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(prev => new Set(prev).add(collection.id));
                onCreateSubfolder(collection.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              title="Add Subfolder"
            >
              <svg className="w-4 h-4 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingCollectionId(collection.id);
                setEditName(collection.name);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
              title="Rename Collection"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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
          {effectiveExpanded.has(collection.id) && (
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
                  <span className="flex-1 text-xs truncate dark:text-gray-200">
                    {request.name}
                  </span>
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
                  onCreateSubfolder={onCreateSubfolder}
                  onDuplicateCollection={onDuplicateCollection}
                  onDuplicateRequest={onDuplicateRequest}
                  forceExpandedIds={forceExpandedIds}
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
  const [editingFlowId, setEditingFlowId] = useState<number | null>(null);
  const [editFlowName, setEditFlowName] = useState('');
  const updateFlow = useUpdateFlow();
  const [expandedDateGroups, setExpandedDateGroups] = useState<Set<string>>(new Set(['Today', 'Yesterday']));
  const [filterQuery, setFilterQuery] = useState('');

  // Resizable sidebar
  const MIN_WIDTH = 220;
  const MAX_WIDTH = 480;
  const DEFAULT_WIDTH = 288;
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    if (saved) {
      const n = parseInt(saved, 10);
      if (n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
    return DEFAULT_WIDTH;
  });
  const isResizing = useRef(false);

  useEffect(() => {
    localStorage.setItem('sidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX)));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  const dateGroups = useMemo(() => groupHistoryByDate(history), [history]);

  // Filter data based on filterQuery
  const filteredCollections = useMemo(() => {
    if (!filterQuery.trim()) return { collections, expandedIds: null as Set<number> | null };
    return filterCollectionTree(collections, filterQuery);
  }, [collections, filterQuery]);

  const filteredFlows = useMemo(() => {
    if (!filterQuery.trim()) return flows;
    return filterFlows(flows, filterQuery);
  }, [flows, filterQuery]);

  const filteredHistory = useMemo(() => {
    if (!filterQuery.trim()) return history;
    return filterHistory(history, filterQuery);
  }, [history, filterQuery]);

  const filteredDateGroups = useMemo(
    () => groupHistoryByDate(filteredHistory),
    [filteredHistory],
  );

  // Reset filter when tab changes
  const prevView = useRef(view);
  if (prevView.current !== view) {
    prevView.current = view;
    if (filterQuery) setFilterQuery('');
  }

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

  const handleCreateSubfolder = (parentId: number) => {
    createCollection.mutate({ name: 'New Folder', parentId });
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
    <aside className="relative bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden" style={{ width: sidebarWidth, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 active:bg-blue-500 z-10 transition-colors"
      />
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

      {/* Filter */}
      <div className="px-2 pt-2">
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter..."
            className="w-full pl-7 pr-6 py-1 text-xs bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded outline-none focus:border-blue-400 dark:focus:border-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

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
              collections={filteredCollections.collections}
              onSelectRequest={onSelectRequest}
              selectedRequestId={selectedRequestId}
              onDeleteCollection={id => deleteCollection.mutate(id)}
              onDeleteRequest={id => deleteRequest.mutate(id)}
              onCreateRequest={handleCreateRequest}
              onCreateSubfolder={handleCreateSubfolder}
              onDuplicateCollection={id => duplicateCollection.mutate(id)}
              onDuplicateRequest={id => duplicateRequest.mutate(id)}
              forceExpandedIds={filteredCollections.expandedIds}
            />
            {filterQuery.trim() && filteredCollections.collections.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 p-2 text-center">No matching items</p>
            )}
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
              {filteredFlows.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 p-2">
                  {filterQuery.trim() ? 'No matching items' : 'No flows created yet'}
                </p>
              ) : (
                filteredFlows.map(flow => (
                  <div
                    key={flow.id}
                    onClick={() => onSelectFlow(flow)}
                    className={`px-2 py-1 rounded cursor-pointer group ${
                      selectedFlowId === flow.id ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center">
                      <div className="flex-1 min-w-0">
                        {editingFlowId === flow.id ? (
                          <input
                            type="text"
                            value={editFlowName}
                            data-rename-input
                            onChange={(e) => setEditFlowName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const trimmed = editFlowName.trim();
                                if (trimmed && trimmed !== flow.name) {
                                  updateFlow.mutate({ id: flow.id, data: { name: trimmed, description: flow.description || '' } });
                                }
                                setEditingFlowId(null);
                              }
                              if (e.key === 'Escape') {
                                setEditingFlowId(null);
                              }
                            }}
                            onBlur={() => {
                              const trimmed = editFlowName.trim();
                              if (trimmed && trimmed !== flow.name) {
                                updateFlow.mutate({ id: flow.id, data: { name: trimmed, description: flow.description || '' } });
                              }
                              setEditingFlowId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                            className="w-full text-xs font-medium bg-white dark:bg-gray-700 border border-blue-500 rounded px-1 py-0 outline-none dark:text-gray-200"
                          />
                        ) : (
                          <div
                            className="text-xs font-medium truncate dark:text-gray-200"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingFlowId(flow.id);
                              setEditFlowName(flow.name);
                            }}
                          >
                            {flow.name}
                          </div>
                        )}
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
            {filteredHistory.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 p-2">
                {filterQuery.trim() ? 'No matching items' : 'No history yet'}
              </p>
            ) : (
              filteredDateGroups.map(group => (
                <div key={group.label}>
                  <div
                    onClick={() => toggleDateGroup(group.label)}
                    className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                  >
                    <svg className={`w-4 h-4 transition-transform text-gray-500 dark:text-gray-400 ${expandedDateGroups.has(group.label) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-200">{group.label}</span>
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
