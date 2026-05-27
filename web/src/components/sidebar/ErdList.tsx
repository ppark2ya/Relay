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
import { useUpdateErd } from '../../api/erds';
import type { ErdDocument } from '../../types';

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
  onDeleteErd: (id: number, e: React.MouseEvent) => void;
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

interface ErdListProps {
  erds: ErdDocument[];
  selectedErdId?: number;
  onSelectErd: (erd: ErdDocument) => void;
  onDuplicateErd: (id: number) => void;
  onDeleteErd: (id: number, e: React.MouseEvent) => void;
  isDndDisabled: boolean;
  onDragEnd: (event: DragEndEvent) => void;
  emptyMessage: string;
}

export function ErdList({
  erds,
  selectedErdId,
  onSelectErd,
  onDuplicateErd,
  onDeleteErd,
  isDndDisabled,
  onDragEnd,
  emptyMessage,
}: ErdListProps) {
  const [editingErdId, setEditingErdId] = useState<number | null>(null);
  const [editErdName, setEditErdName] = useState('');
  const updateErd = useUpdateErd();
  const [activeDragErd, setActiveDragErd] = useState<ErdDocument | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const erdIds = erds.map(erd => `erd-${erd.id}`);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'erd') {
      setActiveDragErd(data.item as ErdDocument);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragErd(null);
    onDragEnd(event);
  };

  return (
    <DndContext
      sensors={isDndDisabled ? undefined : sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={erdIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {erds.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 p-2">
              {emptyMessage}
            </p>
          ) : (
            erds.map(erd => (
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
            ))
          )}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeDragErd && (
          <div className="bg-white dark:bg-gray-800 rounded shadow-lg px-2 py-1 text-xs font-medium border border-gray-200 dark:border-gray-600">
            {activeDragErd.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
