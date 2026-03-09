import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { deleteFile, uploadFile } from '../../api/files';
import type { FlowStep, StepResult } from '../../types';
import type { FormDataItem } from '../ui';
import { CodeEditor, FormDataEditor, FormField, INPUT_CLASS, KeyValueEditor, MethodBadge } from '../ui';
import {
  METHODS, BODY_TYPES, COMMON_HEADERS,
  type ScriptMode, type HeadersMode,
  parseHeaders, serializeHeaderItems,
  ScriptEditor,
} from '../shared';
import type { StepEditState } from './useFlowStepEdit';

export interface SortableStepProps {
  step: FlowStep;
  index: number;
  stepsLength: number;
  isSelected: boolean;
  hasChanges: boolean;
  isRunningStep: boolean;
  onToggleSelection: (stepId: number, e: React.MouseEvent) => void;
  onExpand: (stepId: number) => void;
  onDelete: (stepId: number) => void;
  expandedStepId: number | null;
  editState: StepEditState | undefined;
  stepResults: StepResult[];
  onEditChange: (stepId: number, field: keyof StepEditState, value: string | number | boolean | ScriptMode | HeadersMode | Array<{ key: string; value: string; enabled: boolean }> | FormDataItem[]) => void;
  onSaveStep: (stepId: number) => void;
  updateStepPending: boolean;
  proxies: Array<{ id: number; name: string; url: string; isActive: boolean }>;
  activeGlobalProxy: { id: number; name: string; url: string } | undefined;
  collectionName?: string;
}

export function SortableStep({
  step,
  index,
  stepsLength,
  isSelected,
  hasChanges,
  isRunningStep,
  onToggleSelection,
  onExpand,
  onDelete,
  expandedStepId,
  editState: edit,
  stepResults,
  onEditChange,
  onSaveStep,
  updateStepPending,
  proxies,
  activeGlobalProxy,
  collectionName,
}: SortableStepProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [stepScriptTab, setStepScriptTab] = useState<'pre' | 'post'>('pre');

  const stepResult = stepResults.find(sr => sr.stepId === step.id);
  const isStepError = stepResult && !stepResult.skipped && (stepResult.executeResult.error || stepResult.executeResult.statusCode >= 400);
  const isStepSuccess = stepResult && !stepResult.skipped && !isStepError;
  const isStepSkipped = stepResult?.skipped;

  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-2">
      {/* Checkbox + Drag handle + Step number */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-0.5">
          <input
            type="checkbox"
            checked={isSelected}
            onClick={(e) => onToggleSelection(step.id, e)}
            onChange={() => {}}
            className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>
          <div className={`w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-medium ${
            isRunningStep ? 'bg-yellow-500' : isStepError ? 'bg-red-500' : isStepSuccess ? 'bg-green-500' : isStepSkipped ? 'bg-gray-400' : 'bg-blue-600'
          }`}>
            {isRunningStep ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : isStepError ? (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : isStepSuccess ? (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              index + 1
            )}
          </div>
        </div>
        {index < stepsLength - 1 && (
          <div className="w-0.5 flex-1 bg-gray-300 dark:bg-gray-600 my-0.5 ml-8" />
        )}
      </div>

      {/* Step content */}
      <div className={`flex-1 rounded-md border overflow-hidden group ${
        isStepError
          ? 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700'
          : isStepSuccess
          ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700'
          : isSelected
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}>
        <div
          onClick={() => onExpand(step.id)}
          className={`px-3 py-2 cursor-pointer ${
            isStepError
              ? 'hover:bg-red-100 dark:hover:bg-red-900/40'
              : isStepSuccess
              ? 'hover:bg-green-100 dark:hover:bg-green-900/40'
              : 'hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <MethodBadge method={step.method} className="text-[10px]" />
            {collectionName && (
              <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 max-w-[120px] truncate" title={collectionName}>
                <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                {collectionName}
              </span>
            )}
            <span className="text-xs font-medium dark:text-gray-200 flex items-center gap-1">
              {(edit?.name ?? step.name) || 'Untitled Step'}
              {hasChanges && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Unsaved changes" />
              )}
            </span>
            {step.loopCount > 1 && (
              <span className="inline-flex items-center px-1 py-px rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-700">
                ×{step.loopCount}
              </span>
            )}
            {step.bodyType && step.bodyType !== 'none' && step.body && step.body.trim() && (
              <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700" title="Body has content">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Body
              </span>
            )}
            {(step.preScript || step.postScript) && (
              <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[10px] font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700" title={`${step.preScript ? 'Pre-script' : ''}${step.preScript && step.postScript ? ' + ' : ''}${step.postScript ? 'Post-script' : ''}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Script
              </span>
            )}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate flex-1">{step.url}</span>
            {isStepError && stepResult && (
              <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {stepResult.executeResult.statusCode || 'ERR'}
                <span className="text-red-400">·</span>
                {stepResult.executeResult.durationMs}ms
              </span>
            )}
            {isStepSuccess && stepResult && (
              <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {stepResult.executeResult.statusCode}
                <span className="text-green-400">·</span>
                {stepResult.executeResult.durationMs}ms
                {stepResult.loopCount && stepResult.loopCount > 1 && (
                  <span className="ml-0.5 text-green-500">({stepResult.iteration}/{stepResult.loopCount})</span>
                )}
              </span>
            )}
            {isStepSkipped && (
              <span className="inline-flex items-center px-1.5 py-px rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                Skipped
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(step.id); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          {isStepError && stepResult && stepResult.executeResult.error && (
            <div className="mt-1 ml-5 flex items-start gap-1 text-[10px] text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded px-1.5 py-1">
              <svg className="w-3 h-3 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="break-all">{stepResult.executeResult.error}</span>
            </div>
          )}
          {step.delayMs > 0 && (
            <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 ml-5">
              Delay: {step.delayMs}ms
            </div>
          )}
          {step.extractVars && step.extractVars !== '{}' && (
            <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 ml-5">
              Extract: <code className="bg-gray-100 dark:bg-gray-700 px-0.5 rounded">{step.extractVars}</code>
            </div>
          )}
        </div>

      </div>

      {/* Fullscreen Modal */}
      {expandedStepId === step.id && edit && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) onExpand(step.id); }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-3">
                <MethodBadge method={edit.method} />
                <h3 className="text-base font-semibold dark:text-gray-100">
                  {edit.name || 'Untitled Step'}
                </h3>
                {hasChanges && (
                  <span className="w-2 h-2 rounded-full bg-blue-500" title="Unsaved changes" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSaveStep(step.id)}
                  disabled={updateStepPending}
                  className="px-4 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateStepPending ? 'Saving...' : 'Save Step'}
                </button>
                <button
                  onClick={() => onExpand(step.id)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-4 text-xs">
                {/* 2-column grid for short fields */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Name */}
                  <FormField label="Name">
                    <input
                      type="text"
                      value={edit.name}
                      onChange={e => onEditChange(step.id, 'name', e.target.value)}
                      placeholder="Step name"
                      className={INPUT_CLASS}
                    />
                  </FormField>

                  {/* Method + URL */}
                  <FormField label="Request">
                    <div className="flex gap-2">
                      <select
                        value={edit.method}
                        onChange={e => onEditChange(step.id, 'method', e.target.value)}
                        className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                      >
                        {METHODS.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={edit.url}
                        onChange={e => onEditChange(step.id, 'url', e.target.value)}
                        placeholder="https://api.example.com/endpoint"
                        className={`flex-1 ${INPUT_CLASS} font-mono`}
                      />
                    </div>
                  </FormField>

                  {/* Proxy */}
                  <FormField label="Proxy">
                    <select
                      value={edit.proxyId === null ? '__global__' : edit.proxyId === 0 ? '__none__' : String(edit.proxyId)}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '__global__') onEditChange(step.id, 'proxyId', null as unknown as number);
                        else if (val === '__none__') onEditChange(step.id, 'proxyId', 0);
                        else onEditChange(step.id, 'proxyId', parseInt(val));
                      }}
                      className="px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    >
                      <option value="__global__">Global (inherit){activeGlobalProxy ? ` — ${activeGlobalProxy.name}` : ''}</option>
                      <option value="__none__">No Proxy (direct)</option>
                      {proxies.map(p => (
                        <option key={p.id} value={String(p.id)}>{p.name} — {p.url}</option>
                      ))}
                    </select>
                  </FormField>

                  {/* Condition */}
                  <FormField label={
                    <span className="flex items-center gap-1">
                      Condition
                      <span className="relative group/condition">
                        <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="absolute bottom-full left-0 mb-1.5 hidden group-hover/condition:block w-64 px-3 py-2 text-xs text-gray-100 bg-gray-800 dark:bg-gray-700 rounded-md shadow-lg z-50 font-normal leading-relaxed">
                          변수가 존재하고 비어있지 않으면 이 스텝을 실행합니다. 조건이 비어있으면 항상 실행됩니다.
                          <span className="block mt-1 text-gray-400">예: {`{{token}}`} — token 변수가 있을 때만 실행</span>
                        </span>
                      </span>
                    </span>
                  }>
                    <input
                      type="text"
                      value={edit.condition}
                      onChange={e => onEditChange(step.id, 'condition', e.target.value)}
                      placeholder='{{token}}'
                      className={`${INPUT_CLASS} font-mono`}
                    />
                  </FormField>

                  {/* Loop Count */}
                  <FormField label={
                    <span className="flex items-center gap-1">
                      Loop Count
                      <span className="relative group/loop">
                        <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="absolute bottom-full left-0 mb-1.5 hidden group-hover/loop:block w-48 px-3 py-2 text-xs text-gray-100 bg-gray-800 dark:bg-gray-700 rounded-md shadow-lg z-50 font-normal leading-relaxed">
                          이 Step을 N번 반복 실행합니다. {'{{__iteration__}}'}, {'{{__loopCount__}}'} 변수로 현재 반복 횟수를 참조할 수 있습니다.
                        </span>
                      </span>
                    </span>
                  }>
                    <input
                      type="number"
                      value={edit.loopCount}
                      onChange={e => onEditChange(step.id, 'loopCount', Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      max={100}
                      className="w-24 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </FormField>

                  {/* Delay */}
                  <FormField label="Delay (ms)">
                    <input
                      type="number"
                      value={edit.delayMs}
                      onChange={e => onEditChange(step.id, 'delayMs', parseInt(e.target.value) || 0)}
                      min={0}
                      className="w-32 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-xs focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </FormField>
                </div>

                {/* Headers - full width */}
                <FormField label={
                  <span className="flex items-center gap-2">
                    Headers
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (edit.headersMode === 'raw') {
                            // Raw → Key-Value: parse current headers text
                            onEditChange(step.id, 'headerItems', parseHeaders(edit.headers));
                          }
                          onEditChange(step.id, 'headersMode', 'key-value');
                        }}
                        className={`px-2 py-0.5 text-xs rounded border ${
                          edit.headersMode === 'key-value'
                            ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-400'
                            : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        Key-Value
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (edit.headersMode === 'key-value') {
                            // Key-Value → Raw: serialize current headerItems
                            onEditChange(step.id, 'headers', serializeHeaderItems(edit.headerItems));
                          }
                          onEditChange(step.id, 'headersMode', 'raw');
                        }}
                        className={`px-2 py-0.5 text-xs rounded border ${
                          edit.headersMode === 'raw'
                            ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-400'
                            : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        Raw
                      </button>
                    </span>
                  </span>
                }>
                  {edit.headersMode === 'key-value' ? (
                    <KeyValueEditor
                      items={edit.headerItems}
                      onChange={items => onEditChange(step.id, 'headerItems', items.map(i => ({ ...i, enabled: i.enabled ?? true })))}
                      showEnabled
                      keyPlaceholder="Header name"
                      valuePlaceholder="Value"
                      addLabel="+ Add Header"
                      suggestions={COMMON_HEADERS}
                    />
                  ) : (
                    <textarea
                      value={edit.headers}
                      onChange={e => onEditChange(step.id, 'headers', e.target.value)}
                      placeholder='{"Content-Type": {"value": "application/json", "enabled": true}}'
                      rows={4}
                      className={`${INPUT_CLASS} font-mono resize-y`}
                    />
                  )}
                </FormField>

                {/* Body Type + Body - full width */}
                <FormField label={
                  <span className="flex items-center gap-1.5">
                    Body
                    {edit.bodyType !== 'none' && (
                      edit.bodyType === 'form-urlencoded' ? edit.formItems.some(i => i.key.trim()) :
                      edit.bodyType === 'formdata' ? edit.formDataItems.some(i => i.key.trim()) :
                      edit.body.trim().length > 0
                    ) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    )}
                  </span>
                }>
                  <div className="flex gap-2 mb-2">
                    {BODY_TYPES.map(bt => (
                      <button
                        key={bt}
                        onClick={() => onEditChange(step.id, 'bodyType', bt)}
                        className={`px-2 py-1 text-xs rounded border ${
                          edit.bodyType === bt
                            ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-400'
                            : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        {bt === 'formdata' ? 'multipart' : bt}
                      </button>
                    ))}
                  </div>
                  {edit.bodyType === 'graphql' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Query</label>
                        <CodeEditor
                          value={edit.body}
                          onChange={val => onEditChange(step.id, 'body', val)}
                          language="graphql"
                          placeholder="{ health }"
                          height="200px"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Variables (JSON)</label>
                        <CodeEditor
                          value={edit.graphqlVariables}
                          onChange={val => onEditChange(step.id, 'graphqlVariables', val)}
                          language="json"
                          placeholder='{ "id": "123" }'
                          height="120px"
                        />
                      </div>
                    </div>
                  )}
                  {edit.bodyType === 'form-urlencoded' && (
                    <KeyValueEditor
                      items={edit.formItems}
                      onChange={items => onEditChange(step.id, 'formItems', items.map(i => ({ ...i, enabled: i.enabled ?? true })))}
                      showEnabled
                      keyPlaceholder="Field name"
                      valuePlaceholder="Value"
                      addLabel="+ Add Field"
                    />
                  )}
                  {edit.bodyType === 'formdata' && (
                    <FormDataEditor
                      items={edit.formDataItems}
                      onChange={items => onEditChange(step.id, 'formDataItems', items)}
                      onFileUpload={async (index, file) => {
                        const tempItems = [...edit.formDataItems];
                        tempItems[index] = { ...tempItems[index], file, value: file.name };
                        onEditChange(step.id, 'formDataItems', tempItems);
                        try {
                          const uploaded = await uploadFile(file);
                          onEditChange(step.id, 'formDataItems', (() => {
                            const next = [...tempItems];
                            next[index] = { ...next[index], file: undefined, fileId: uploaded.id, fileSize: uploaded.size, value: uploaded.originalName };
                            return next;
                          })());
                        } catch {
                          // Upload failed, keep the local File object as fallback
                        }
                      }}
                      onFileRemove={async (_index, fileId) => {
                        try { await deleteFile(fileId); } catch { /* ignore */ }
                      }}
                    />
                  )}
                  {edit.bodyType !== 'none' && edit.bodyType !== 'graphql' && edit.bodyType !== 'form-urlencoded' && edit.bodyType !== 'formdata' && (
                    <CodeEditor
                      value={edit.body}
                      onChange={val => onEditChange(step.id, 'body', val)}
                      language={edit.bodyType === 'json' ? 'json' : edit.bodyType === 'xml' ? 'xml' : undefined}
                      placeholder={edit.bodyType === 'json' ? '{\n  "key": "value"\n}' : edit.bodyType === 'xml' ? '<root>\n  <item>value</item>\n</root>' : 'Request body...'}
                      height="200px"
                    />
                  )}
                </FormField>

                {/* Extract Variables - full width */}
                <FormField label={
                  <span className="flex items-center gap-1">
                    Extract Variables
                    <span className="relative group/extract">
                      <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="absolute bottom-full left-0 mb-1.5 hidden group-hover/extract:block w-64 px-3 py-2 text-xs text-gray-100 bg-gray-800 dark:bg-gray-700 rounded-md shadow-lg z-50 font-normal leading-relaxed">
                        JSON 응답에서 값을 추출하여 다음 스텝에서 {'{{변수명}}'}으로 사용할 수 있습니다. JSONPath 문법을 사용합니다.
                        <span className="block mt-1 text-gray-400">예: {`{"token": "$.data.accessToken"}`}</span>
                      </span>
                    </span>
                  </span>
                }>
                  <textarea
                    value={edit.extractVars}
                    onChange={e => onEditChange(step.id, 'extractVars', e.target.value)}
                    placeholder='{"token": "$.data.accessToken"}'
                    rows={3}
                    className={`${INPUT_CLASS} font-mono resize-y`}
                  />
                </FormField>

                {/* Scripts - subtabs */}
                <FormField label={
                  <span className="flex items-center gap-1">
                    Scripts
                    {(edit.preScript.trim() || edit.postScript.trim()) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    )}
                    <span className="relative group/scripts">
                      <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="absolute bottom-full left-0 mb-1.5 hidden group-hover/scripts:block w-72 px-3 py-2 text-xs text-gray-100 bg-gray-800 dark:bg-gray-700 rounded-md shadow-lg z-50 font-normal leading-relaxed">
                        Pre-Script: 요청 실행 전에 실행. Post-Script: 요청 실행 후 응답 검증, 변수 추출, 흐름 제어.
                      </span>
                    </span>
                  </span>
                }>
                  <ScriptEditor
                    preScript={edit.preScript}
                    postScript={edit.postScript}
                    preScriptMode={edit.preScriptMode}
                    postScriptMode={edit.postScriptMode}
                    onPreScriptChange={val => onEditChange(step.id, 'preScript', val)}
                    onPostScriptChange={val => onEditChange(step.id, 'postScript', val)}
                    onPreScriptModeChange={mode => onEditChange(step.id, 'preScriptMode', mode)}
                    onPostScriptModeChange={mode => onEditChange(step.id, 'postScriptMode', mode)}
                    activeTab={stepScriptTab}
                    onTabChange={setStepScriptTab}
                    height="200px"
                  />
                </FormField>

                {/* Continue On Error */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`continueOnError-${step.id}`}
                    checked={edit.continueOnError}
                    onChange={e => onEditChange(step.id, 'continueOnError', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <label
                    htmlFor={`continueOnError-${step.id}`}
                    className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"
                  >
                    Continue on Error
                    <span className="relative group/continue">
                      <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="absolute bottom-full left-0 mb-1.5 hidden group-hover/continue:block w-64 px-3 py-2 text-xs text-gray-100 bg-gray-800 dark:bg-gray-700 rounded-md shadow-lg z-50 font-normal leading-relaxed">
                        이 스텝에서 오류가 발생해도 Flow 실행을 계속합니다. 비활성화하면 오류 시 즉시 중단됩니다.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
