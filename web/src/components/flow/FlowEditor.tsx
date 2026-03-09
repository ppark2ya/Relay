import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useCallback, useEffect, useState } from 'react';
import { useCollections } from '../../api/collections';
import type { Collection } from '../../api/collections/types';
import { useImportCollection } from '../../api/flows';
import { useProxies } from '../../api/proxies';
import { useRequests } from '../../api/requests';
import { useClickOutside } from '../../hooks/useClickOutside';
import type { Flow } from '../../types';
import { EmptyState, MethodBadge } from '../ui';
import { useFlowForm } from './useFlowForm';
import { useFlowRunner } from './useFlowRunner';
import { useFlowStepEdit } from './useFlowStepEdit';
import { SortableStep } from './SortableStep';
import { FlowResultPanel } from './FlowResultPanel';

interface FlowEditorProps {
  flow: Flow | null;
  onUpdate: (flow: Flow) => void;
}

export function FlowEditor({ flow, onUpdate }: FlowEditorProps) {
  const form = useFlowForm(flow, onUpdate);
  const runner = useFlowRunner(flow);
  const stepEdit = useFlowStepEdit(flow);

  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showRequestDropdown, setShowRequestDropdown] = useState(false);
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false);

  const { data: requests = [] } = useRequests();
  const { data: collections = [] } = useCollections();
  const { data: proxies = [] } = useProxies();
  const activeGlobalProxy = proxies.find(p => p.isActive);

  const importCollectionMutation = useImportCollection();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const closeAddMenu = useCallback(() => {
    setShowAddMenu(false);
    setShowRequestDropdown(false);
    setShowCollectionDropdown(false);
  }, []);
  const addMenuRef = useClickOutside<HTMLDivElement>(closeAddMenu, showAddMenu || showRequestDropdown || showCollectionDropdown);

  // Build collection name lookup maps
  const collectionNameMap = new Map<number, string>();
  const requestCollectionMap = new Map<number, string>();

  const flattenCollections = (cols: Collection[], depth = 0) => {
    for (const col of cols) {
      collectionNameMap.set(col.id, col.name);
      if (col.children) flattenCollections(col.children, depth + 1);
    }
  };
  flattenCollections(collections);

  for (const req of requests) {
    if (req.collectionId) {
      const name = collectionNameMap.get(req.collectionId);
      if (name) requestCollectionMap.set(req.id, name);
    }
  }

  // Count requests per collection (flat count, non-recursive)
  const collectionRequestCounts = new Map<number, number>();
  for (const req of requests) {
    if (req.collectionId) {
      collectionRequestCounts.set(req.collectionId, (collectionRequestCounts.get(req.collectionId) || 0) + 1);
    }
  }

  const handleImportCollection = (collectionId: number) => {
    if (flow) {
      importCollectionMutation.mutate({ flowId: flow.id, collectionId });
      setShowCollectionDropdown(false);
      setShowAddMenu(false);
    }
  };

  const handleAddBlankStep = () => {
    if (flow) {
      const nextOrder = stepEdit.steps.length > 0 ? Math.max(...stepEdit.steps.map(s => s.stepOrder)) + 1 : 1;
      stepEdit.createStep.mutate({
        flowId: flow.id,
        data: {
          stepOrder: nextOrder,
          delayMs: 0,
          extractVars: '',
          condition: '',
          name: '',
          method: 'GET',
          url: '',
          headers: '{}',
          body: '',
          bodyType: 'none',
          loopCount: 1,
          preScript: '',
          postScript: '',
          continueOnError: false,
        },
      });
      setShowAddMenu(false);
    }
  };

  const handleCopyFromRequest = (requestId: number) => {
    if (flow) {
      const req = requests.find(r => r.id === requestId);
      if (!req) return;
      const nextOrder = stepEdit.steps.length > 0 ? Math.max(...stepEdit.steps.map(s => s.stepOrder)) + 1 : 1;
      stepEdit.createStep.mutate({
        flowId: flow.id,
        data: {
          requestId,
          stepOrder: nextOrder,
          delayMs: 0,
          extractVars: '',
          condition: '',
          name: req.name,
          method: req.method,
          url: req.url,
          headers: req.headers || '{}',
          body: req.body || '',
          bodyType: req.bodyType || 'none',
          loopCount: 1,
          preScript: req.preScript || '',
          postScript: req.postScript || '',
          continueOnError: false,
        },
      });
      setShowRequestDropdown(false);
      setShowAddMenu(false);
    }
  };

  // Cmd+S / Ctrl+S to save, ESC to close modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        const target = e.target;
        if (target instanceof HTMLInputElement && target.hasAttribute('data-rename-input')) {
          target.blur();
          return;
        }
        if (flow && stepEdit.expandedStepId && stepEdit.hasStepChanges(stepEdit.expandedStepId)) {
          stepEdit.handleSaveStep(stepEdit.expandedStepId);
        } else if (flow) {
          form.handleSave();
        }
      }
      if (e.key === 'Escape' && stepEdit.expandedStepId) {
        stepEdit.setExpandedStepId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flow, stepEdit.expandedStepId, stepEdit.hasStepChanges, stepEdit.handleSaveStep, form.handleSave]);

  if (!flow) {
    return (
      <EmptyState
        className="bg-gray-50 dark:bg-gray-900"
        icon={
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
        }
        message="Select a flow from the sidebar or create a new one"
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Flow Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            {form.isEditingName ? (
              <input
                type="text"
                value={form.name}
                onChange={e => form.setName(e.target.value)}
                onBlur={() => form.setIsEditingName(false)}
                onKeyDown={e => {
                  if (e.key === 'Enter') form.setIsEditingName(false);
                  if (e.key === 'Escape') {
                    form.setName(form.flowData?.name || '');
                    form.setIsEditingName(false);
                  }
                }}
                className="text-lg font-semibold px-2 py-1 border border-blue-500 rounded focus:outline-none w-full dark:bg-gray-700 dark:text-gray-100"
                autoFocus
              />
            ) : (
              <h2
                onClick={() => form.setIsEditingName(true)}
                className="text-lg font-semibold cursor-pointer hover:text-blue-600 dark:text-gray-100"
                title="Click to edit name"
              >
                {form.name}
              </h2>
            )}
            <input
              type="text"
              value={form.description}
              onChange={e => form.setDescription(e.target.value)}
              placeholder="Add description..."
              className="mt-1 text-xs text-gray-500 dark:text-gray-400 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
            />
          </div>
          <button
            onClick={() => runner.handleRun(stepEdit.selectedStepIds)}
            disabled={runner.isRunning || stepEdit.steps.length === 0}
            className="px-6 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {runner.isRunning ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {stepEdit.selectedStepIds.size > 0 ? `Run Selected (${stepEdit.selectedStepIds.size})` : 'Run Flow'}
              </>
            )}
          </button>
          {runner.isRunning && (
            <button
              onClick={runner.handleCancel}
              className="px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Cancel
            </button>
          )}
          {runner.isRunning && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {runner.completedStepIds.size}/{stepEdit.steps.length} steps
            </span>
          )}
          <button
            onClick={form.handleSave}
            disabled={form.updateFlow.isPending}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
          >
            Save
          </button>
        </div>
      </div>

      {/* Flow Steps */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto">
          <div className="space-y-2">
            {stepEdit.steps.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p>No steps in this flow yet.</p>
                <p className="text-xs">Add a blank step or copy from an existing request.</p>
              </div>
            ) : (
              <>
              {stepEdit.steps.length > 1 && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center gap-0.5">
                    <input
                      type="checkbox"
                      ref={(el) => {
                        if (el) el.indeterminate = stepEdit.someStepsSelected;
                      }}
                      checked={stepEdit.allStepsSelected}
                      onChange={stepEdit.toggleAllSteps}
                      className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                  <label onClick={stepEdit.toggleAllSteps} className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                    All
                    {stepEdit.selectedStepIds.size > 0 && ` (${stepEdit.selectedStepIds.size}/${stepEdit.steps.length})`}
                  </label>
                </div>
              )}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={stepEdit.handleDragEnd}
              >
                <SortableContext
                  items={[...stepEdit.steps].sort((a, b) => a.stepOrder - b.stepOrder).map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {[...stepEdit.steps]
                    .sort((a, b) => a.stepOrder - b.stepOrder)
                    .map((step, index) => (
                      <SortableStep
                        key={step.id}
                        step={step}
                        index={index}
                        stepsLength={stepEdit.steps.length}
                        isSelected={stepEdit.selectedStepIds.has(step.id)}
                        hasChanges={stepEdit.hasStepChanges(step.id)}
                        isRunningStep={runner.runningStepId === step.id}
                        onToggleSelection={stepEdit.toggleStepSelection}
                        onExpand={stepEdit.handleExpandStep}
                        onDelete={stepEdit.handleDeleteStep}
                        expandedStepId={stepEdit.expandedStepId}
                        editState={stepEdit.editStates[step.id]}
                        stepResults={runner.flowResult?.steps || []}
                        onEditChange={stepEdit.handleEditChange}
                        onSaveStep={stepEdit.handleSaveStep}
                        updateStepPending={stepEdit.updateStep.isPending}
                        proxies={proxies}
                        activeGlobalProxy={activeGlobalProxy}
                        collectionName={step.requestId ? requestCollectionMap.get(step.requestId) : undefined}
                      />
                    ))
                  }
                </SortableContext>
              </DndContext>
              </>
            )}
          </div>

          {/* Add Step Button */}
          <div className="mt-3 relative" ref={addMenuRef}>
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md text-xs text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Step
            </button>
            {showAddMenu && !showRequestDropdown && !showCollectionDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-gray-900/50 z-10">
                <button
                  onClick={handleAddBlankStep}
                  className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 border-b border-gray-100 dark:border-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <div>
                    <div className="font-medium dark:text-gray-200">Add Blank Step</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Create an empty step and configure it manually</div>
                  </div>
                </button>
                <button
                  onClick={() => setShowRequestDropdown(true)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 border-b border-gray-100 dark:border-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <div className="font-medium dark:text-gray-200">Copy From Request</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Copy data from an existing request as a template</div>
                  </div>
                </button>
                <button
                  onClick={() => setShowCollectionDropdown(true)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <div>
                    <div className="font-medium dark:text-gray-200">Import from Collection</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Import all requests from a collection as steps</div>
                  </div>
                </button>
              </div>
            )}
            {showRequestDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-gray-900/50 z-10 max-h-64 overflow-y-auto">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                  <button
                    onClick={() => setShowRequestDropdown(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Select a request to copy</span>
                </div>
                {requests.length === 0 ? (
                  <div className="p-4 text-xs text-gray-500 dark:text-gray-400">No requests available. Create requests first.</div>
                ) : (
                  (() => {
                    // Group requests by collection
                    const grouped = new Map<string, typeof requests>();
                    for (const req of requests) {
                      const colName = req.collectionId ? (collectionNameMap.get(req.collectionId) || 'Unknown') : 'No Collection';
                      if (!grouped.has(colName)) grouped.set(colName, []);
                      grouped.get(colName)!.push(req);
                    }
                    return Array.from(grouped.entries()).map(([colName, reqs]) => (
                      <div key={colName}>
                        <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-750 border-b border-gray-100 dark:border-gray-700">
                          {colName}
                        </div>
                        {reqs.map(req => (
                          <button
                            key={req.id}
                            onClick={() => handleCopyFromRequest(req.id)}
                            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 dark:text-gray-200"
                          >
                            <MethodBadge method={req.method} />
                            <span className="font-medium dark:text-gray-200">{req.name}</span>
                            <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{req.url}</span>
                          </button>
                        ))}
                      </div>
                    ));
                  })()
                )}
              </div>
            )}
            {showCollectionDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-gray-900/50 z-10 max-h-64 overflow-y-auto">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                  <button
                    onClick={() => setShowCollectionDropdown(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Select a collection to import</span>
                </div>
                {collections.length === 0 ? (
                  <div className="p-4 text-xs text-gray-500 dark:text-gray-400">No collections available. Create collections first.</div>
                ) : (
                  (() => {
                    const renderCollections = (cols: Collection[], depth = 0): React.ReactNode[] =>
                      cols.flatMap(col => {
                        const count = collectionRequestCounts.get(col.id) || 0;
                        return [
                          <button
                            key={col.id}
                            onClick={() => handleImportCollection(col.id)}
                            disabled={count === 0 || importCollectionMutation.isPending}
                            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ paddingLeft: `${16 + depth * 16}px` }}
                          >
                            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            <span className="font-medium dark:text-gray-200">{col.name}</span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {count > 0 ? `${count} request${count > 1 ? 's' : ''}` : 'empty'}
                            </span>
                          </button>,
                          ...(col.children ? renderCollections(col.children, depth + 1) : []),
                        ];
                      });
                    return renderCollections(collections);
                  })()
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Flow Result */}
      {runner.flowResult && (
        <FlowResultPanel
          flowResult={runner.flowResult}
          expandedResultIds={runner.expandedResultIds}
          copiedKey={runner.copiedKey}
          onToggleExpand={runner.toggleResultExpand}
          onCopyBody={runner.handleCopyBody}
        />
      )}
    </div>
  );
}
