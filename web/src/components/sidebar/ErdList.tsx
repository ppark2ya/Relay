import { useState, type MouseEvent as ReactMouseEvent } from 'react';
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
import { useUpdateErd } from '../../api/erds';
import { useUpdateErdCollection } from '../../api/erdCollections';
import type { ErdCollection, ErdDocument } from '../../types';

function SortableErdItem({
  erd,
  selectedErdId,
  onSelectErd,
  onDuplicateErd,
  onDeleteErd,
  editingErdId,
  setEditingErdId,
  editErdName,
  setEditErdName,
  updateErd,
  isDndDisabled,
}: {
  erd: ErdDocument;
  selectedErdId?: number;
  onSelectErd: (erd: ErdDocument) => void;
  onDuplicateErd: (id: number) => void;
  onDeleteErd: (id: number, e: ReactMouseEvent) => void;
  editingErdId: number | null;
  setEditingErdId: (id: number | null) => void;
  editErdName: string;
  setEditErdName: (name: string) => void;
  updateErd: ReturnType<typeof useUpdateErd>;
  isDndDisabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `erd-${erd.id}`, disabled: isDndDisabled, data: { type: 'erd', item: erd } });

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
      onClick={() => onSelectErd(erd)}
      className={`px-2 py-1 rounded cursor-pointer group ${
        selectedErdId === erd.id ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <div className="flex items-center">
        <div className="flex-1 min-w-0">
          {editingErdId === erd.id ? (
            <input
              type="text"
              value={editErdName}
              data-rename-input
              onChange={(e) => setEditErdName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const trimmed = editErdName.trim();
                  if (trimmed && trimmed !== erd.name) {
                    updateErd.mutate({ id: erd.id, data: { name: trimmed, dsl: erd.dsl } });
                  }
                  setEditingErdId(null);
                }
                if (e.key === 'Escape') {
                  setEditingErdId(null);
                }
              }}
              onBlur={() => {
                const trimmed = editErdName.trim();
                if (trimmed && trimmed !== erd.name) {
                  updateErd.mutate({ id: erd.id, data: { name: trimmed, dsl: erd.dsl } });
                }
                setEditingErdId(null);
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
                setEditingErdId(erd.id);
                setEditErdName(erd.name);
              }}
            >
              {erd.name}
            </div>
          )}
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">JSON DSL</div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicateErd(erd.id); }}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded ml-1"
          title="Duplicate ERD"
        >
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
        <button
          onClick={(e) => onDeleteErd(erd.id, e)}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded ml-1"
          title="Delete ERD"
        >
          <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function SortableErdCollectionItem({
  collection,
  effectiveExpanded,
  onToggleExpand,
  onExpand,
  selectedErdId,
  onSelectErd,
  onCreateErd,
  onCreateSubfolder,
  onDuplicateCollection,
  onDeleteCollection,
  onDuplicateErd,
  onDeleteErd,
  editingCollectionId,
  setEditingCollectionId,
  editCollectionName,
  setEditCollectionName,
  editingErdId,
  setEditingErdId,
  editErdName,
  setEditErdName,
  updateCollection,
  updateErd,
  isDndDisabled,
}: {
  collection: ErdCollection;
  effectiveExpanded: Set<number>;
  onToggleExpand: (id: number) => void;
  onExpand: (id: number) => void;
  selectedErdId?: number;
  onSelectErd: (erd: ErdDocument) => void;
  onCreateErd: (collectionId: number) => void;
  onCreateSubfolder: (parentId: number) => void;
  onDuplicateCollection: (id: number) => void;
  onDeleteCollection: (id: number, e: ReactMouseEvent) => void;
  onDuplicateErd: (id: number) => void;
  onDeleteErd: (id: number, e: ReactMouseEvent) => void;
  editingCollectionId: number | null;
  setEditingCollectionId: (id: number | null) => void;
  editCollectionName: string;
  setEditCollectionName: (name: string) => void;
  editingErdId: number | null;
  setEditingErdId: (id: number | null) => void;
  editErdName: string;
  setEditErdName: (name: string) => void;
  updateCollection: ReturnType<typeof useUpdateErdCollection>;
  updateErd: ReturnType<typeof useUpdateErd>;
  isDndDisabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `erd-col-${collection.id}`, disabled: isDndDisabled, data: { type: 'erdCollection', item: collection } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const children = collection.children ?? [];
  const erds = collection.erds ?? [];
  const itemIds = [
    ...children.map(child => `erd-col-${child.id}`),
    ...erds.map(erd => `erd-${erd.id}`),
  ];
  const expanded = effectiveExpanded.has(collection.id);

  return (
    <div ref={setNodeRef} style={style}>
      <div
        {...attributes}
        {...listeners}
        onClick={() => onToggleExpand(collection.id)}
        className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded group cursor-pointer"
      >
        <svg className={`w-4 h-4 transition-transform text-gray-500 dark:text-gray-400 ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
        {editingCollectionId === collection.id ? (
          <input
            type="text"
            value={editCollectionName}
            data-rename-input
            onChange={(e) => setEditCollectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const trimmed = editCollectionName.trim();
                if (trimmed && trimmed !== collection.name) {
                  updateCollection.mutate({ id: collection.id, data: { name: trimmed, parentId: collection.parentId } });
                }
                setEditingCollectionId(null);
              }
              if (e.key === 'Escape') {
                setEditingCollectionId(null);
              }
            }}
            onBlur={() => {
              const trimmed = editCollectionName.trim();
              if (trimmed && trimmed !== collection.name) {
                updateCollection.mutate({ id: collection.id, data: { name: trimmed, parentId: collection.parentId } });
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
              setEditCollectionName(collection.name);
            }}
          >
            {collection.name}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onExpand(collection.id); onCreateErd(collection.id); }}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          title="Add ERD"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onExpand(collection.id); onCreateSubfolder(collection.id); }}
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
            setEditCollectionName(collection.name);
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
          onClick={(e) => onDeleteCollection(collection.id, e)}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          title="Delete Collection"
        >
          <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a2 2 0 00-2 2v2M4 7h16" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className="ml-4">
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {children.map(child => (
              <SortableErdCollectionItem
                key={child.id}
                collection={child}
                effectiveExpanded={effectiveExpanded}
                onToggleExpand={onToggleExpand}
                onExpand={onExpand}
                selectedErdId={selectedErdId}
                onSelectErd={onSelectErd}
                onCreateErd={onCreateErd}
                onCreateSubfolder={onCreateSubfolder}
                onDuplicateCollection={onDuplicateCollection}
                onDeleteCollection={onDeleteCollection}
                onDuplicateErd={onDuplicateErd}
                onDeleteErd={onDeleteErd}
                editingCollectionId={editingCollectionId}
                setEditingCollectionId={setEditingCollectionId}
                editCollectionName={editCollectionName}
                setEditCollectionName={setEditCollectionName}
                editingErdId={editingErdId}
                setEditingErdId={setEditingErdId}
                editErdName={editErdName}
                setEditErdName={setEditErdName}
                updateCollection={updateCollection}
                updateErd={updateErd}
                isDndDisabled={isDndDisabled}
              />
            ))}
            {erds.map(erd => (
              <SortableErdItem
                key={erd.id}
                erd={erd}
                selectedErdId={selectedErdId}
                onSelectErd={onSelectErd}
                onDuplicateErd={onDuplicateErd}
                onDeleteErd={onDeleteErd}
                editingErdId={editingErdId}
                setEditingErdId={setEditingErdId}
                editErdName={editErdName}
                setEditErdName={setEditErdName}
                updateErd={updateErd}
                isDndDisabled={isDndDisabled}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

interface ErdListProps {
  collections: ErdCollection[];
  erds: ErdDocument[];
  selectedErdId?: number;
  onSelectErd: (erd: ErdDocument) => void;
  onCreateErd: (collectionId?: number) => void;
  onCreateSubfolder: (parentId: number) => void;
  onDuplicateCollection: (id: number) => void;
  onDeleteCollection: (id: number, e: ReactMouseEvent) => void;
  onDuplicateErd: (id: number) => void;
  onDeleteErd: (id: number, e: ReactMouseEvent) => void;
  forceExpandedIds?: Set<number> | null;
  isDndDisabled: boolean;
  onDragEnd: (event: DragEndEvent) => void;
  emptyMessage: string;
}

export function ErdList({
  collections,
  erds,
  selectedErdId,
  onSelectErd,
  onCreateErd,
  onCreateSubfolder,
  onDuplicateCollection,
  onDeleteCollection,
  onDuplicateErd,
  onDeleteErd,
  forceExpandedIds,
  isDndDisabled,
  onDragEnd,
  emptyMessage,
}: ErdListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [editingCollectionId, setEditingCollectionId] = useState<number | null>(null);
  const [editCollectionName, setEditCollectionName] = useState('');
  const [editingErdId, setEditingErdId] = useState<number | null>(null);
  const [editErdName, setEditErdName] = useState('');
  const updateCollection = useUpdateErdCollection();
  const updateErd = useUpdateErd();
  const [activeDragItem, setActiveDragItem] = useState<{ type: 'erd' | 'erdCollection'; name: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const effectiveExpanded = forceExpandedIds ?? expandedIds;
  const rootIds = [
    ...collections.map(collection => `erd-col-${collection.id}`),
    ...erds.map(erd => `erd-${erd.id}`),
  ];

  const toggleExpand = (id: number) => {
    if (forceExpandedIds) return;
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expand = (id: number) => {
    setExpandedIds(prev => new Set(prev).add(id));
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'erd') {
      setActiveDragItem({ type: 'erd', name: (data.item as ErdDocument).name });
    }
    if (data?.type === 'erdCollection') {
      setActiveDragItem({ type: 'erdCollection', name: (data.item as ErdCollection).name });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragItem(null);
    onDragEnd(event);
  };

  const hasItems = collections.length > 0 || erds.length > 0;

  return (
    <DndContext
      sensors={isDndDisabled ? undefined : sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {!hasItems ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 p-2">
              {emptyMessage}
            </p>
          ) : (
            <>
              {collections.map(collection => (
                <SortableErdCollectionItem
                  key={collection.id}
                  collection={collection}
                  effectiveExpanded={effectiveExpanded}
                  onToggleExpand={toggleExpand}
                  onExpand={expand}
                  selectedErdId={selectedErdId}
                  onSelectErd={onSelectErd}
                  onCreateErd={onCreateErd}
                  onCreateSubfolder={onCreateSubfolder}
                  onDuplicateCollection={onDuplicateCollection}
                  onDeleteCollection={onDeleteCollection}
                  onDuplicateErd={onDuplicateErd}
                  onDeleteErd={onDeleteErd}
                  editingCollectionId={editingCollectionId}
                  setEditingCollectionId={setEditingCollectionId}
                  editCollectionName={editCollectionName}
                  setEditCollectionName={setEditCollectionName}
                  editingErdId={editingErdId}
                  setEditingErdId={setEditingErdId}
                  editErdName={editErdName}
                  setEditErdName={setEditErdName}
                  updateCollection={updateCollection}
                  updateErd={updateErd}
                  isDndDisabled={isDndDisabled}
                />
              ))}
              {erds.map(erd => (
                <SortableErdItem
                  key={erd.id}
                  erd={erd}
                  selectedErdId={selectedErdId}
                  onSelectErd={onSelectErd}
                  onDuplicateErd={onDuplicateErd}
                  onDeleteErd={onDeleteErd}
                  editingErdId={editingErdId}
                  setEditingErdId={setEditingErdId}
                  editErdName={editErdName}
                  setEditErdName={setEditErdName}
                  updateErd={updateErd}
                  isDndDisabled={isDndDisabled}
                />
              ))}
            </>
          )}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeDragItem && (
          <div className="bg-white dark:bg-gray-800 rounded shadow-lg px-2 py-1 text-xs font-medium border border-gray-200 dark:border-gray-600">
            {activeDragItem.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
