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
import { useUpdateFlow } from '../../api/flows';
import type { Flow } from '../../types';

function SortableFlowItem({
  flow,
  selectedFlowId,
  onSelectFlow,
  onDuplicateFlow,
  onDeleteFlow,
  editingFlowId,
  setEditingFlowId,
  editFlowName,
  setEditFlowName,
  updateFlow,
  isDndDisabled,
}: {
  flow: Flow;
  selectedFlowId?: number;
  onSelectFlow: (flow: Flow) => void;
  onDuplicateFlow: (id: number) => void;
  onDeleteFlow: (id: number, e: React.MouseEvent) => void;
  editingFlowId: number | null;
  setEditingFlowId: (id: number | null) => void;
  editFlowName: string;
  setEditFlowName: (name: string) => void;
  updateFlow: ReturnType<typeof useUpdateFlow>;
  isDndDisabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `flow-${flow.id}`, disabled: isDndDisabled, data: { type: 'flow', item: flow } });

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
          onClick={(e) => { e.stopPropagation(); onDuplicateFlow(flow.id); }}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded ml-1"
          title="Duplicate Flow"
        >
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
        <button
          onClick={(e) => onDeleteFlow(flow.id, e)}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded ml-1"
          title="Delete Flow"
        >
          <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface FlowListProps {
  flows: Flow[];
  selectedFlowId?: number;
  onSelectFlow: (flow: Flow) => void;
  onDuplicateFlow: (id: number) => void;
  onDeleteFlow: (id: number, e: React.MouseEvent) => void;
  isDndDisabled: boolean;
  onDragEnd: (event: DragEndEvent) => void;
  emptyMessage: string;
}

export function FlowList({
  flows,
  selectedFlowId,
  onSelectFlow,
  onDuplicateFlow,
  onDeleteFlow,
  isDndDisabled,
  onDragEnd,
  emptyMessage,
}: FlowListProps) {
  const [editingFlowId, setEditingFlowId] = useState<number | null>(null);
  const [editFlowName, setEditFlowName] = useState('');
  const updateFlow = useUpdateFlow();
  const [activeDragFlow, setActiveDragFlow] = useState<Flow | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const flowIds = flows.map(f => `flow-${f.id}`);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === 'flow') {
      setActiveDragFlow(data.item as Flow);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragFlow(null);
    onDragEnd(event);
  };

  return (
    <DndContext
      sensors={isDndDisabled ? undefined : sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={flowIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {flows.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 p-2">
              {emptyMessage}
            </p>
          ) : (
            flows.map(flow => (
              <SortableFlowItem
                key={flow.id}
                flow={flow}
                selectedFlowId={selectedFlowId}
                onSelectFlow={onSelectFlow}
                onDuplicateFlow={onDuplicateFlow}
                onDeleteFlow={onDeleteFlow}
                editingFlowId={editingFlowId}
                setEditingFlowId={setEditingFlowId}
                editFlowName={editFlowName}
                setEditFlowName={setEditFlowName}
                updateFlow={updateFlow}
                isDndDisabled={isDndDisabled}
              />
            ))
          )}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeDragFlow && (
          <div className="bg-white dark:bg-gray-800 rounded shadow-lg px-2 py-1 text-xs font-medium border border-gray-200 dark:border-gray-600">
            {activeDragFlow.name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
