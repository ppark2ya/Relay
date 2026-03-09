import { useState, useRef, useEffect } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import { useCollections, useCreateCollection, useDeleteCollection, useDuplicateCollection, useReorderCollections } from '../../api/collections';
import { useCreateRequest, useDeleteRequest, useDuplicateRequest, useReorderRequests } from '../../api/requests';
import { useFlows, useCreateFlow, useDeleteFlow, useDuplicateFlow, useReorderFlows } from '../../api/flows';
import { useHistory, useDeleteHistory } from '../../api/history';
import { useClickOutside } from '../../hooks/useClickOutside';
import type { Request, Flow, History } from '../../types';
import { TabNav, InlineCreateForm } from '../ui';
import { filterCollectionTree, filterFlows, filterHistory } from '../../utils/searchUtils';
import { groupHistoryByDate, findCollectionById, findCollectionSiblings, findRequestSiblings } from './sidebar-utils';
import { CollectionTree } from './CollectionTree';
import { FlowList } from './FlowList';
import { HistoryList } from './HistoryList';

interface SidebarProps {
  view: 'requests' | 'flows' | 'history';
  onViewChange: (view: 'requests' | 'flows' | 'history') => void;
  onSelectRequest: (request: Request | null) => void;
  onSelectFlow: (flow: Flow | null) => void;
  onSelectHistory: (history: History) => void;
  selectedRequestId?: number;
  selectedFlowId?: number;
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
  const reorderCollections = useReorderCollections();
  const reorderRequests = useReorderRequests();
  const reorderFlows = useReorderFlows();

  const [newCollectionName, setNewCollectionName] = useState('');
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [showNewFlow, setShowNewFlow] = useState(false);
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

  const handleResizeStart = (e: React.MouseEvent) => {
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
  };

  // Filter data based on filterQuery
  const filteredCollections = !filterQuery.trim()
    ? { collections, expandedIds: null as Set<number> | null }
    : filterCollectionTree(collections, filterQuery);

  const filteredFlows = !filterQuery.trim() ? flows : filterFlows(flows, filterQuery);

  const filteredHistory = !filterQuery.trim() ? history : filterHistory(history, filterQuery);

  const filteredDateGroups = groupHistoryByDate(filteredHistory);

  // Reset filter when tab changes (React 19 pattern: adjust state during render)
  const [prevView, setPrevView] = useState(view);
  if (prevView !== view) {
    setPrevView(view);
    setFilterQuery('');
  }

  const isDndDisabled = !!filterQuery.trim();

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

  const closeNewFlow = () => setShowNewFlow(false);
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

  // --- Collection/Request DnD handler ---
  const handleCollectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Same type reorder
    if (activeId.startsWith('col-') && overId.startsWith('col-')) {
      const activeColId = parseInt(activeId.replace('col-', ''), 10);
      const overColId = parseInt(overId.replace('col-', ''), 10);

      const activeSiblings = findCollectionSiblings(filteredCollections.collections, activeColId);
      const overSiblings = findCollectionSiblings(filteredCollections.collections, overColId);

      if (!activeSiblings || !overSiblings) return;

      // Only allow reorder within same parent
      if (activeSiblings.parentId !== overSiblings.parentId) return;

      const oldIndex = activeSiblings.index;
      const newIndex = overSiblings.index;
      const reordered = arrayMove(activeSiblings.siblings, oldIndex, newIndex);

      const orders = reordered.map((c, idx) => ({
        id: c.id,
        sortOrder: idx + 1,
      }));
      reorderCollections.mutate(orders);
    }

    if (activeId.startsWith('req-') && overId.startsWith('req-')) {
      const activeReqId = parseInt(activeId.replace('req-', ''), 10);
      const overReqId = parseInt(overId.replace('req-', ''), 10);

      const activeSiblings = findRequestSiblings(filteredCollections.collections, activeReqId);
      const overSiblings = findRequestSiblings(filteredCollections.collections, overReqId);

      if (!activeSiblings || !overSiblings) return;

      // Same collection reorder
      if (activeSiblings.collectionId === overSiblings.collectionId) {
        const oldIndex = activeSiblings.index;
        const newIndex = overSiblings.index;
        const reordered = arrayMove(activeSiblings.siblings, oldIndex, newIndex);

        const orders = reordered.map((r, idx) => ({
          id: r.id,
          sortOrder: idx + 1,
        }));
        reorderRequests.mutate(orders);
      } else {
        // Cross-collection move: move request to the other collection
        const targetCollectionId = overSiblings.collectionId;
        const newSiblings = [...overSiblings.siblings];
        const movedRequest = activeSiblings.siblings[activeSiblings.index];

        // Insert after the over item
        const insertIdx = overSiblings.index + 1;
        newSiblings.splice(insertIdx, 0, movedRequest);

        const orders = newSiblings.map((r, idx) => ({
          id: r.id,
          sortOrder: idx + 1,
          collectionId: targetCollectionId,
        }));
        reorderRequests.mutate(orders);
      }
    }

    // Request dropped on a collection => move into that collection
    if (activeId.startsWith('req-') && overId.startsWith('col-')) {
      const activeReqId = parseInt(activeId.replace('req-', ''), 10);
      const overColId = parseInt(overId.replace('col-', ''), 10);

      const activeSiblings = findRequestSiblings(filteredCollections.collections, activeReqId);
      if (!activeSiblings || activeSiblings.collectionId === overColId) return;

      // Move request to the target collection at the end
      const targetCollection = findCollectionById(filteredCollections.collections, overColId);
      const existingRequests = targetCollection?.requests || [];
      const maxOrder = existingRequests.length;

      reorderRequests.mutate([{
        id: activeReqId,
        sortOrder: maxOrder + 1,
        collectionId: overColId,
      }]);
    }
  };

  // --- Flow DnD handler ---
  const handleFlowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id).replace('flow-', '');
    const overId = String(over.id).replace('flow-', '');

    const oldIndex = filteredFlows.findIndex(f => f.id === parseInt(activeId, 10));
    const newIndex = filteredFlows.findIndex(f => f.id === parseInt(overId, 10));
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(filteredFlows, oldIndex, newIndex);
    const orders = reordered.map((f, idx) => ({
      id: f.id,
      sortOrder: idx + 1,
    }));
    reorderFlows.mutate(orders);
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
              isDndDisabled={isDndDisabled}
              onDragEnd={handleCollectionDragEnd}
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
            <FlowList
              flows={filteredFlows}
              selectedFlowId={selectedFlowId}
              onSelectFlow={onSelectFlow}
              onDuplicateFlow={id => duplicateFlow.mutate(id)}
              onDeleteFlow={handleDeleteFlow}
              isDndDisabled={isDndDisabled}
              onDragEnd={handleFlowDragEnd}
              emptyMessage={filterQuery.trim() ? 'No matching items' : 'No flows created yet'}
            />
          </>
        )}

        {view === 'history' && (
          <HistoryList
            dateGroups={filteredDateGroups}
            expandedDateGroups={expandedDateGroups}
            onToggleDateGroup={toggleDateGroup}
            onSelectHistory={onSelectHistory}
            onDeleteHistory={id => deleteHistory.mutate(id)}
            emptyMessage={filterQuery.trim() ? 'No matching items' : 'No history yet'}
          />
        )}
      </div>
    </aside>
  );
}
