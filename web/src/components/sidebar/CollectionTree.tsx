import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useUpdateCollection } from '../../api/collections';
import type { Request, Collection } from '../../types';
import { MethodBadge } from '../ui';
import { containsRequest } from './sidebar-utils';

// --- Sortable Request Item ---
function SortableRequestItem({
  request,
  selectedRequestId,
  onSelectRequest,
  onDuplicateRequest,
  onDeleteRequest,
  isDndDisabled,
}: {
  request: Request;
  selectedRequestId?: number;
  onSelectRequest: (request: Request) => void;
  onDuplicateRequest: (id: number) => void;
  onDeleteRequest: (id: number) => void;
  isDndDisabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `req-${request.id}`, disabled: isDndDisabled, data: { type: 'request', item: request } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
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
  );
}

// --- Sortable Collection Item ---
function SortableCollectionItem({
  collection,
  effectiveExpanded,
  onToggleExpand,
  onExpand,
  onSelectRequest,
  selectedRequestId,
  onDeleteCollection,
  onDeleteRequest,
  onCreateRequest,
  onCreateSubfolder,
  onDuplicateCollection,
  onDuplicateRequest,
  forceExpandedIds,
  isDndDisabled,
  editingCollectionId,
  setEditingCollectionId,
  editName,
  setEditName,
  updateCollection,
}: {
  collection: Collection;
  effectiveExpanded: Set<number>;
  onToggleExpand: (id: number) => void;
  onExpand: (id: number) => void;
  onSelectRequest: (request: Request) => void;
  selectedRequestId?: number;
  onDeleteCollection: (id: number) => void;
  onDeleteRequest: (id: number) => void;
  onCreateRequest: (collectionId: number) => void;
  onCreateSubfolder: (parentId: number) => void;
  onDuplicateCollection: (id: number) => void;
  onDuplicateRequest: (id: number) => void;
  forceExpandedIds?: Set<number> | null;
  isDndDisabled: boolean;
  editingCollectionId: number | null;
  setEditingCollectionId: (id: number | null) => void;
  editName: string;
  setEditName: (name: string) => void;
  updateCollection: ReturnType<typeof useUpdateCollection>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `col-${collection.id}`, disabled: isDndDisabled, data: { type: 'collection', item: collection } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const requests = collection.requests || [];
  const children = collection.children || [];
  const requestIds = requests.map(r => `req-${r.id}`);

  return (
    <div ref={setNodeRef} style={style}>
      <div {...attributes} {...listeners} onClick={() => onToggleExpand(collection.id)} className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded group cursor-pointer">
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
          onClick={(e) => { e.stopPropagation(); onExpand(collection.id); onCreateRequest(collection.id); }}
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
            onExpand(collection.id);
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
          <SortableContext items={requestIds} strategy={verticalListSortingStrategy}>
            {requests.map(request => (
              <SortableRequestItem
                key={request.id}
                request={request}
                selectedRequestId={selectedRequestId}
                onSelectRequest={onSelectRequest}
                onDuplicateRequest={onDuplicateRequest}
                onDeleteRequest={onDeleteRequest}
                isDndDisabled={isDndDisabled}
              />
            ))}
          </SortableContext>
          {children.length > 0 && (
            <SortableCollectionList
              collections={children}
              onToggleExpand={onToggleExpand}
              onExpand={onExpand}
              effectiveExpanded={effectiveExpanded}
              onSelectRequest={onSelectRequest}
              selectedRequestId={selectedRequestId}
              onDeleteCollection={onDeleteCollection}
              onDeleteRequest={onDeleteRequest}
              onCreateRequest={onCreateRequest}
              onCreateSubfolder={onCreateSubfolder}
              onDuplicateCollection={onDuplicateCollection}
              onDuplicateRequest={onDuplicateRequest}
              forceExpandedIds={forceExpandedIds}
              isDndDisabled={isDndDisabled}
              editingCollectionId={editingCollectionId}
              setEditingCollectionId={setEditingCollectionId}
              editName={editName}
              setEditName={setEditName}
              updateCollection={updateCollection}
            />
          )}
        </div>
      )}
    </div>
  );
}

// --- Sortable Collection List (wraps siblings with SortableContext) ---
function SortableCollectionList({
  collections,
  effectiveExpanded,
  onToggleExpand,
  onExpand,
  onSelectRequest,
  selectedRequestId,
  onDeleteCollection,
  onDeleteRequest,
  onCreateRequest,
  onCreateSubfolder,
  onDuplicateCollection,
  onDuplicateRequest,
  forceExpandedIds,
  isDndDisabled,
  editingCollectionId,
  setEditingCollectionId,
  editName,
  setEditName,
  updateCollection,
}: {
  collections: Collection[];
  effectiveExpanded: Set<number>;
  onToggleExpand: (id: number) => void;
  onExpand: (id: number) => void;
  onSelectRequest: (request: Request) => void;
  selectedRequestId?: number;
  onDeleteCollection: (id: number) => void;
  onDeleteRequest: (id: number) => void;
  onCreateRequest: (collectionId: number) => void;
  onCreateSubfolder: (parentId: number) => void;
  onDuplicateCollection: (id: number) => void;
  onDuplicateRequest: (id: number) => void;
  forceExpandedIds?: Set<number> | null;
  isDndDisabled: boolean;
  editingCollectionId: number | null;
  setEditingCollectionId: (id: number | null) => void;
  editName: string;
  setEditName: (name: string) => void;
  updateCollection: ReturnType<typeof useUpdateCollection>;
}) {
  const collectionIds = collections.map(c => `col-${c.id}`);

  return (
    <SortableContext items={collectionIds} strategy={verticalListSortingStrategy}>
      <div className="space-y-1">
        {collections.map(collection => (
          <SortableCollectionItem
            key={collection.id}
            collection={collection}
            effectiveExpanded={effectiveExpanded}
            onToggleExpand={onToggleExpand}
            onExpand={onExpand}
            onSelectRequest={onSelectRequest}
            selectedRequestId={selectedRequestId}
            onDeleteCollection={onDeleteCollection}
            onDeleteRequest={onDeleteRequest}
            onCreateRequest={onCreateRequest}
            onCreateSubfolder={onCreateSubfolder}
            onDuplicateCollection={onDuplicateCollection}
            onDuplicateRequest={onDuplicateRequest}
            forceExpandedIds={forceExpandedIds}
            isDndDisabled={isDndDisabled}
            editingCollectionId={editingCollectionId}
            setEditingCollectionId={setEditingCollectionId}
            editName={editName}
            setEditName={setEditName}
            updateCollection={updateCollection}
          />
        ))}
      </div>
    </SortableContext>
  );
}

export function CollectionTree({
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
  isDndDisabled,
  onDragEnd,
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
  isDndDisabled: boolean;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [lastAutoExpanded, setLastAutoExpanded] = useState<number | undefined>(undefined);
  const [editingCollectionId, setEditingCollectionId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const updateCollection = useUpdateCollection();
  const [activeDragItem, setActiveDragItem] = useState<{ type: string; item: Collection | Request } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

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

  const expand = (id: number) => {
    if (forceExpandedIds) return;
    setExpanded(prev => new Set(prev).add(id));
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;
    if (data) {
      setActiveDragItem({ type: data.type, item: data.item });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragItem(null);
    onDragEnd(event);
  };

  return (
    <DndContext
      sensors={isDndDisabled ? undefined : sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableCollectionList
        collections={collections}
        effectiveExpanded={effectiveExpanded}
        onToggleExpand={toggleExpand}
        onExpand={expand}
        onSelectRequest={onSelectRequest}
        selectedRequestId={selectedRequestId}
        onDeleteCollection={onDeleteCollection}
        onDeleteRequest={onDeleteRequest}
        onCreateRequest={onCreateRequest}
        onCreateSubfolder={onCreateSubfolder}
        onDuplicateCollection={onDuplicateCollection}
        onDuplicateRequest={onDuplicateRequest}
        forceExpandedIds={forceExpandedIds}
        isDndDisabled={isDndDisabled}
        editingCollectionId={editingCollectionId}
        setEditingCollectionId={setEditingCollectionId}
        editName={editName}
        setEditName={setEditName}
        updateCollection={updateCollection}
      />
      <DragOverlay>
        {activeDragItem?.type === 'collection' && (
          <div className="bg-white dark:bg-gray-800 rounded shadow-lg px-2 py-1 text-xs flex items-center gap-1 border border-gray-200 dark:border-gray-600">
            <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            {(activeDragItem.item as Collection).name}
          </div>
        )}
        {activeDragItem?.type === 'request' && (
          <div className="bg-white dark:bg-gray-800 rounded shadow-lg px-2 py-1 text-xs flex items-center gap-1 border border-gray-200 dark:border-gray-600">
            <MethodBadge method={(activeDragItem.item as Request).method} />
            {(activeDragItem.item as Request).name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
