import { useState, useRef, useEffect } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import { useCollections, useCreateCollection, useDeleteCollection, useDuplicateCollection, useImportPostmanCollection, useReorderCollections } from '../../api/collections';
import { useCreateRequest, useDeleteRequest, useDuplicateRequest, useReorderRequests } from '../../api/requests';
import { useFlows, useCreateFlow, useDeleteFlow, useDuplicateFlow, useReorderFlows } from '../../api/flows';
import { useErds, useCreateErd, useDeleteErd, useDuplicateErd, useReorderErds } from '../../api/erds';
import { useErdCollections, useCreateErdCollection, useDeleteErdCollection, useDuplicateErdCollection, useReorderErdCollections } from '../../api/erdCollections';
import { useHistory, useDeleteHistory } from '../../api/history';
import { useQACases, useQATopics } from '../../api/qa';
import { useClickOutside } from '../../hooks/useClickOutside';
import type { Request, Flow, History, ErdDocument, ErdCollection } from '../../types';
import { InlineCreateForm } from '../ui';
import { filterCollectionTree, filterFlows, filterErds, filterErdCollectionTree, filterHistory } from '../../utils/searchUtils';
import { groupHistoryByDate, findCollectionById, findCollectionSiblings, findRequestSiblings } from './sidebar-utils';
import { CollectionTree } from './CollectionTree';
import { FlowList } from './FlowList';
import { ErdList } from './ErdList';
import { HistoryList } from './HistoryList';

interface SidebarProps {
  view: 'requests' | 'flows' | 'history' | 'erds' | 'qa';
  onViewChange: (view: 'requests' | 'flows' | 'history' | 'erds' | 'qa') => void;
  onSelectRequest: (request: Request | null) => void;
  onSelectFlow: (flow: Flow | null) => void;
  onSelectErd: (erd: ErdDocument | null) => void;
  onSelectHistory: (history: History) => void;
  selectedRequestId?: number;
  selectedFlowId?: number;
  selectedErdId?: number;
}

export function Sidebar({ view, onViewChange, onSelectRequest, onSelectFlow, onSelectErd, onSelectHistory, selectedRequestId, selectedFlowId, selectedErdId }: SidebarProps) {
  const { data: collections = [] } = useCollections();
  const { data: flows = [] } = useFlows();
  const { data: erds = [] } = useErds();
  const { data: erdCollections = [] } = useErdCollections();
  const { data: history = [] } = useHistory();
  const { data: qaCases = [] } = useQACases();
  const { data: qaTopics = [] } = useQATopics();
  const createCollection = useCreateCollection();
  const deleteCollection = useDeleteCollection();
  const createRequest = useCreateRequest();
  const deleteRequest = useDeleteRequest();
  const createFlow = useCreateFlow();
  const deleteFlow = useDeleteFlow();
  const createErd = useCreateErd();
  const createErdCollection = useCreateErdCollection();
  const deleteErd = useDeleteErd();
  const deleteErdCollection = useDeleteErdCollection();
  const duplicateCollection = useDuplicateCollection();
  const importPostmanCollection = useImportPostmanCollection();
  const duplicateRequest = useDuplicateRequest();
  const duplicateFlow = useDuplicateFlow();
  const duplicateErd = useDuplicateErd();
  const duplicateErdCollection = useDuplicateErdCollection();
  const deleteHistory = useDeleteHistory();
  const reorderCollections = useReorderCollections();
  const reorderRequests = useReorderRequests();
  const reorderFlows = useReorderFlows();
  const reorderErds = useReorderErds();
  const reorderErdCollections = useReorderErdCollections();

  const [newCollectionName, setNewCollectionName] = useState('');
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [showNewFlow, setShowNewFlow] = useState(false);
  const [newErdName, setNewErdName] = useState('');
  const [showNewErd, setShowNewErd] = useState(false);
  const [newErdCollectionName, setNewErdCollectionName] = useState('');
  const [showNewErdCollection, setShowNewErdCollection] = useState(false);
  const [expandedDateGroups, setExpandedDateGroups] = useState<Set<string>>(new Set(['Today', 'Yesterday']));
  const [filterQuery, setFilterQuery] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

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
  const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const isResizing = useRef(false);

  useEffect(() => {
    localStorage.setItem('sidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(isCollapsed));
  }, [isCollapsed]);

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

  const rootErds = erds.filter(erd => !erd.collectionId);
  const filteredRootErds = !filterQuery.trim() ? rootErds : filterErds(rootErds, filterQuery);
  const filteredErdCollections = !filterQuery.trim()
    ? { collections: erdCollections, expandedIds: null as Set<number> | null }
    : filterErdCollectionTree(erdCollections, filterQuery);

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
  const closeNewErd = () => setShowNewErd(false);
  const newErdRef = useClickOutside<HTMLDivElement>(closeNewErd, showNewErd);
  const closeNewErdCollection = () => setShowNewErdCollection(false);
  const newErdCollectionRef = useClickOutside<HTMLDivElement>(closeNewErdCollection, showNewErdCollection);

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

  const handlePostmanImport = (file?: File) => {
    if (!file) return;
    importPostmanCollection.mutate(file, {
      onSuccess: (result) => {
        setFilterQuery('');
        if (result.warnings?.length) {
          window.alert(`Imported with warnings:\n${result.warnings.join('\n')}`);
        }
      },
      onError: async (error) => {
        const response = (error as { response?: Response }).response;
        const payload = response ? await response.json().catch(() => null) as { error?: string } | null : null;
        window.alert(payload?.error ?? 'Postman collection import failed. Check the JSON format and try again.');
      },
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

  const handleCreateErd = (collectionId?: number) => {
    if (collectionId) {
      createErd.mutate({ name: 'New ERD', collectionId }, {
        onSuccess: (erd) => {
          onSelectErd(erd);
        },
      });
      return;
    }
    if (newErdName.trim()) {
      createErd.mutate({ name: newErdName.trim() }, {
        onSuccess: (erd) => {
          onSelectErd(erd);
        },
      });
      setNewErdName('');
      setShowNewErd(false);
    }
  };

  const handleCreateErdCollection = () => {
    if (newErdCollectionName.trim()) {
      createErdCollection.mutate({ name: newErdCollectionName.trim() });
      setNewErdCollectionName('');
      setShowNewErdCollection(false);
    }
  };

  const handleCreateErdSubfolder = (parentId: number) => {
    createErdCollection.mutate({ name: 'New Folder', parentId });
  };

  const handleDeleteFlow = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteFlow.mutate(id);
    if (selectedFlowId === id) {
      onSelectFlow(null);
    }
  };

  const handleDeleteErd = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteErd.mutate(id);
    if (selectedErdId === id) {
      onSelectErd(null);
    }
  };

  const handleDeleteErdCollection = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteErdCollection.mutate(id);
    if (selectedErdId && erds.some(erd => erd.id === selectedErdId && erd.collectionId === id)) {
      onSelectErd(null);
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

  const handleErdDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('erd-col-') && overId.startsWith('erd-col-')) {
      const activeCollectionId = parseInt(activeId.replace('erd-col-', ''), 10);
      const overCollectionId = parseInt(overId.replace('erd-col-', ''), 10);
      const activeSiblings = findErdCollectionSiblings(filteredErdCollections.collections, activeCollectionId);
      const overSiblings = findErdCollectionSiblings(filteredErdCollections.collections, overCollectionId);
      if (!activeSiblings || !overSiblings || activeSiblings.parentId !== overSiblings.parentId) return;

      const reordered = arrayMove(activeSiblings.siblings, activeSiblings.index, overSiblings.index);
      reorderErdCollections.mutate(reordered.map((collection, idx) => ({
        id: collection.id,
        sortOrder: idx + 1,
        parentId: activeSiblings.parentId,
      })));
    }

    if (activeId.startsWith('erd-') && overId.startsWith('erd-') && !activeId.startsWith('erd-col-') && !overId.startsWith('erd-col-')) {
      const activeErdId = parseInt(activeId.replace('erd-', ''), 10);
      const overErdId = parseInt(overId.replace('erd-', ''), 10);
      const activeSiblings = findErdSiblings(filteredErdCollections.collections, filteredRootErds, activeErdId);
      const overSiblings = findErdSiblings(filteredErdCollections.collections, filteredRootErds, overErdId);
      if (!activeSiblings || !overSiblings) return;

      if (activeSiblings.collectionId === overSiblings.collectionId) {
        const reordered = arrayMove(activeSiblings.siblings, activeSiblings.index, overSiblings.index);
        reorderErds.mutate(reordered.map((erd, idx) => ({
          id: erd.id,
          sortOrder: idx + 1,
          collectionId: activeSiblings.collectionId,
        })));
      } else {
        const movedErd = activeSiblings.siblings[activeSiblings.index];
        const newSiblings = [...overSiblings.siblings];
        newSiblings.splice(overSiblings.index + 1, 0, movedErd);
        reorderErds.mutate(newSiblings.map((erd, idx) => ({
          id: erd.id,
          sortOrder: idx + 1,
          collectionId: overSiblings.collectionId,
        })));
      }
    }

    if (activeId.startsWith('erd-') && !activeId.startsWith('erd-col-') && overId.startsWith('erd-col-')) {
      const activeErdId = parseInt(activeId.replace('erd-', ''), 10);
      const overCollectionId = parseInt(overId.replace('erd-col-', ''), 10);
      const activeSiblings = findErdSiblings(filteredErdCollections.collections, filteredRootErds, activeErdId);
      if (!activeSiblings || activeSiblings.collectionId === overCollectionId) return;

      const targetCollection = findErdCollectionById(filteredErdCollections.collections, overCollectionId);
      const existingErds = targetCollection?.erds ?? [];
      reorderErds.mutate([{
        id: activeErdId,
        sortOrder: existingErds.length + 1,
        collectionId: overCollectionId,
      }]);
    }
  };

  return (
    <aside className="relative bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex overflow-hidden" style={{ width: isCollapsed ? 64 : sidebarWidth, minWidth: isCollapsed ? 64 : MIN_WIDTH, maxWidth: MAX_WIDTH }}>
      {/* Resize handle */}
      {!isCollapsed && <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 active:bg-blue-500 z-10 transition-colors"
      />}

      {/* Fixed primary navigation: it stays visible while the explorer panel is collapsed. */}
      <nav aria-label="Workspace sections" className="w-16 shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-2 gap-1 bg-gray-50/70 dark:bg-gray-900/30">
        {[
          { key: 'requests', label: 'Requests', short: 'R' },
          { key: 'flows', label: 'Flows', short: 'F' },
          { key: 'erds', label: 'ERDs', short: 'E' },
          { key: 'qa', label: 'QA', short: 'Q' },
          { key: 'history', label: 'History', short: 'H' },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            aria-label={tab.label}
            title={tab.label}
            onClick={() => { onViewChange(tab.key as 'requests' | 'flows' | 'history' | 'erds' | 'qa'); setIsCollapsed(false); }}
            className={`w-12 rounded-lg py-2 flex flex-col items-center gap-1 text-[10px] font-medium transition-colors ${
              view === tab.key
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold ${view === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>{tab.short}</span>
            <span>{tab.label}</span>
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setIsCollapsed(value => !value)}
          className="mb-1 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-300"
          title={isCollapsed ? 'Expand explorer' : 'Collapse explorer'}
          aria-label={isCollapsed ? 'Expand explorer' : 'Collapse explorer'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
          </svg>
        </button>
      </nav>

      {/* Contextual secondary explorer */}
      {!isCollapsed && <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
      <div className="px-2 pt-3">
        <div className="mb-2 px-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
          {{ requests: 'Requests', flows: 'Flows', erds: 'ERDs', qa: 'QA 관리', history: 'History' }[view]}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={filterQuery}
            onChange={(e) => { setFilterQuery(e.target.value); if (view === 'qa') window.dispatchEvent(new CustomEvent('qa:search', { detail: e.target.value })); }}
            placeholder={view === 'qa' ? 'QA 케이스 검색' : 'Filter...'}
              className="w-full pl-7 pr-6 py-1 text-xs bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded outline-none focus:border-blue-400 dark:focus:border-blue-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
            {filterQuery && (
              <button
                onClick={() => setFilterQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                title="Clear filter"
              >
                <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {view === 'requests' && (
          <>
            <div className="mb-2 flex gap-1">
              <div className="flex-1">
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
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  handlePostmanImport(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                disabled={importPostmanCollection.isPending}
                className="shrink-0 px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 dark:text-gray-200"
                title="Import Postman Collection"
              >
                {importPostmanCollection.isPending ? 'Importing…' : 'Import'}
              </button>
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

        {view === 'erds' && (
          <>
            <div className="mb-2 space-y-2">
              <div ref={newErdCollectionRef}>
                <InlineCreateForm
                  isOpen={showNewErdCollection}
                  onOpenChange={setShowNewErdCollection}
                  value={newErdCollectionName}
                  onValueChange={setNewErdCollectionName}
                  onSubmit={handleCreateErdCollection}
                  placeholder="Collection name"
                  buttonLabel="New Collection"
                />
              </div>
              <div ref={newErdRef}>
              <InlineCreateForm
                isOpen={showNewErd}
                onOpenChange={setShowNewErd}
                value={newErdName}
                onValueChange={setNewErdName}
                onSubmit={handleCreateErd}
                placeholder="ERD name"
                buttonLabel="New ERD"
              />
              </div>
            </div>
            <ErdList
              collections={filteredErdCollections.collections}
              erds={filteredRootErds}
              selectedErdId={selectedErdId}
              onSelectErd={onSelectErd}
              onCreateErd={handleCreateErd}
              onCreateSubfolder={handleCreateErdSubfolder}
              onDuplicateCollection={id => duplicateErdCollection.mutate(id)}
              onDeleteCollection={handleDeleteErdCollection}
              onDuplicateErd={id => duplicateErd.mutate(id)}
              onDeleteErd={handleDeleteErd}
              forceExpandedIds={filteredErdCollections.expandedIds}
              isDndDisabled={isDndDisabled}
              onDragEnd={handleErdDragEnd}
              emptyMessage={filterQuery.trim() ? 'No matching items' : 'No ERDs created yet'}
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
        {view === 'qa' && (
          <div className="space-y-5 px-1">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('qa:create'))}
              className="w-full rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              + QA 케이스 추가
            </button>
            <div>
              <p className="mb-2 px-1 text-[10px] font-semibold tracking-wider text-gray-400">STATUS</p>
              <div className="space-y-0.5">
                {(['전체', '대기', '진행 중', '완료', '실패'] as const).map(status => {
                  const count = status === '전체' ? qaCases.length : qaCases.filter(item => item.status === status).length;
                  const color = status === '완료' ? 'bg-emerald-500' : status === '진행 중' ? 'bg-blue-500' : status === '실패' ? 'bg-rose-500' : 'bg-slate-400';
                  return <button key={status} type="button" onClick={() => window.dispatchEvent(new CustomEvent('qa:status', { detail: status }))} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-300 dark:hover:bg-blue-950/30">
                    <span className={`h-1.5 w-1.5 rounded-full ${color}`} /><span className="flex-1">{status}</span><span className="text-[11px] text-gray-400">{count}</span>
                  </button>;
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 px-1 text-[10px] font-semibold tracking-wider text-gray-400">TOPIC</p>
              <div className="space-y-0.5">
                {qaTopics.map(topic => <button key={topic.id} type="button" onClick={() => window.dispatchEvent(new CustomEvent('qa:topic', { detail: topic.id }))} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-300 dark:hover:bg-blue-950/30">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: topic.color }} /><span className="flex-1 truncate">{topic.name}</span><span className="text-[11px] text-gray-400">{topic.caseCount}</span>
                </button>)}
                {!qaTopics.length && <p className="px-2 py-1 text-xs text-gray-400">등록된 Topic이 없습니다.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
      </div>}
    </aside>
  );
}

function findErdCollectionById(collections: ErdCollection[], id: number): ErdCollection | null {
  for (const collection of collections) {
    if (collection.id === id) return collection;
    const found = findErdCollectionById(collection.children ?? [], id);
    if (found) return found;
  }
  return null;
}

function findErdCollectionSiblings(
  collections: ErdCollection[],
  id: number,
  parentId: number | null = null,
): { siblings: ErdCollection[]; index: number; parentId: number | null } | null {
  const index = collections.findIndex(collection => collection.id === id);
  if (index !== -1) {
    return { siblings: collections, index, parentId };
  }
  for (const collection of collections) {
    const found = findErdCollectionSiblings(collection.children ?? [], id, collection.id);
    if (found) return found;
  }
  return null;
}

function findErdSiblings(
  collections: ErdCollection[],
  rootErds: ErdDocument[],
  id: number,
): { siblings: ErdDocument[]; index: number; collectionId: number | null } | null {
  const rootIndex = rootErds.findIndex(erd => erd.id === id);
  if (rootIndex !== -1) {
    return { siblings: rootErds, index: rootIndex, collectionId: null };
  }
  for (const collection of collections) {
    const found = findErdSiblingsInCollection(collection, id);
    if (found) return found;
  }
  return null;
}

function findErdSiblingsInCollection(
  collection: ErdCollection,
  id: number,
): { siblings: ErdDocument[]; index: number; collectionId: number } | null {
  const erds = collection.erds ?? [];
  const index = erds.findIndex(erd => erd.id === id);
  if (index !== -1) {
    return { siblings: erds, index, collectionId: collection.id };
  }
  for (const child of collection.children ?? []) {
    const found = findErdSiblingsInCollection(child, id);
    if (found) return found;
  }
  return null;
}
