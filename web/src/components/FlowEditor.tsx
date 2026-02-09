import { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useFlow,
  useFlowSteps,
  useUpdateFlow,
  useRunFlow,
  useCreateFlowStep,
  useUpdateFlowStep,
  useDeleteFlowStep,
} from '../api/flows';
import { useRequests } from '../api/requests';
import { useProxies } from '../api/proxies';
import { useClickOutside } from '../hooks/useClickOutside';
import type { Flow, FlowStep, FlowResult, StepResult } from '../types';
import { MethodBadge, EmptyState, FormField, INPUT_CLASS, CodeEditor, KeyValueEditor, FormDataEditor } from './ui';
import type { FormDataItem } from './ui';

interface FlowEditorProps {
  flow: Flow | null;
  onUpdate: (flow: Flow) => void;
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const BODY_TYPES = ['none', 'json', 'text', 'xml', 'form-urlencoded', 'formdata', 'graphql'];

interface StepEditState {
  name: string;
  method: string;
  url: string;
  headers: string;
  body: string;
  bodyType: string;
  formItems: Array<{ key: string; value: string; enabled: boolean }>;
  formDataItems: FormDataItem[];
  graphqlVariables: string;
  delayMs: number;
  extractVars: string;
  condition: string;
  proxyId: number | null;
  loopCount: number;
  preScript: string;
  postScript: string;
  continueOnError: boolean;
}

function parseFormBody(bodyStr: string): Array<{ key: string; value: string; enabled: boolean }> {
  if (!bodyStr.trim()) return [];
  return bodyStr.split('&').map(pair => {
    const [k, ...rest] = pair.split('=');
    return {
      key: decodeURIComponent(k || ''),
      value: decodeURIComponent(rest.join('=')),
      enabled: true,
    };
  });
}

function buildFormBody(items: Array<{ key: string; value: string; enabled: boolean }>): string {
  return items
    .filter(i => i.enabled && i.key.trim())
    .map(i => `${encodeURIComponent(i.key)}=${encodeURIComponent(i.value)}`)
    .join('&');
}

function stepToEditState(step: FlowStep): StepEditState {
  const bodyType = step.bodyType || 'none';
  const body = step.body || '';

  let parsedBody = body;
  let graphqlVariables = '';
  let formItems: Array<{ key: string; value: string; enabled: boolean }> = [];
  let formDataItems: FormDataItem[] = [];

  if (bodyType === 'graphql' && body) {
    try {
      const parsed = JSON.parse(body);
      parsedBody = parsed.query || '';
      graphqlVariables = parsed.variables ? JSON.stringify(parsed.variables, null, 2) : '';
    } catch {
      parsedBody = body;
    }
  } else if (bodyType === 'form-urlencoded') {
    formItems = parseFormBody(body);
  } else if (bodyType === 'formdata') {
    try {
      const parsed = JSON.parse(body) as Array<{ key: string; value: string; type: 'text' | 'file'; enabled: boolean }>;
      formDataItems = parsed.map(item => ({ ...item, file: undefined }));
    } catch {
      formDataItems = [];
    }
  }

  return {
    name: step.name,
    method: step.method,
    url: step.url,
    headers: step.headers || '{}',
    body: parsedBody,
    bodyType,
    formItems,
    formDataItems,
    graphqlVariables,
    delayMs: step.delayMs,
    extractVars: step.extractVars === '{}' ? '' : (step.extractVars || ''),
    condition: step.condition || '',
    proxyId: step.proxyId ?? null,
    loopCount: step.loopCount || 1,
    preScript: step.preScript || '',
    postScript: step.postScript || '',
    continueOnError: step.continueOnError || false,
  };
}

interface SortableStepProps {
  step: FlowStep;
  index: number;
  stepsLength: number;
  isSelected: boolean;
  hasChanges: boolean;
  onToggleSelection: (stepId: number, e: React.MouseEvent) => void;
  onExpand: (stepId: number) => void;
  onDelete: (stepId: number) => void;
  expandedStepId: number | null;
  editState: StepEditState | undefined;
  stepResults: StepResult[];
  onEditChange: (stepId: number, field: keyof StepEditState, value: string | number | boolean | Array<{ key: string; value: string; enabled: boolean }> | FormDataItem[]) => void;
  onSaveStep: (stepId: number) => void;
  updateStepPending: boolean;
  proxies: Array<{ id: number; name: string; url: string; isActive: boolean }>;
  activeGlobalProxy: { id: number; name: string; url: string } | undefined;
}

function SortableStep({
  step,
  index,
  stepsLength,
  isSelected,
  hasChanges,
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

  const stepResult = stepResults.find(sr => sr.stepId === step.id);
  const isStepError = stepResult && !stepResult.skipped && (stepResult.executeResult.error || stepResult.executeResult.statusCode >= 400);
  const isStepSuccess = stepResult && !stepResult.skipped && !isStepError;
  const isStepSkipped = stepResult?.skipped;

  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-3">
      {/* Checkbox + Drag handle + Step number */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={isSelected}
            onClick={(e) => onToggleSelection(step.id, e)}
            onChange={() => {}}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>
          <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center text-sm font-medium ${
            isStepError ? 'bg-red-500' : isStepSuccess ? 'bg-green-500' : isStepSkipped ? 'bg-gray-400' : 'bg-blue-600'
          }`}>
            {isStepError ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : isStepSuccess ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              index + 1
            )}
          </div>
        </div>
        {index < stepsLength - 1 && (
          <div className="w-0.5 flex-1 bg-gray-300 dark:bg-gray-600 my-1 ml-10" />
        )}
      </div>

      {/* Step content */}
      <div className={`flex-1 rounded-lg border overflow-hidden group ${
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
          className={`p-4 cursor-pointer ${
            isStepError
              ? 'hover:bg-red-100 dark:hover:bg-red-900/40'
              : isStepSuccess
              ? 'hover:bg-green-100 dark:hover:bg-green-900/40'
              : 'hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <div className="flex items-center gap-3">
            <svg
              className={`w-4 h-4 transition-transform ${
                isStepError ? 'text-red-400' : isStepSuccess ? 'text-green-400' : 'text-gray-400'
              } ${expandedStepId === step.id ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <MethodBadge method={step.method} />
            <span className="font-medium dark:text-gray-200 flex items-center gap-1.5">
              {(edit?.name ?? step.name) || 'Untitled Step'}
              {hasChanges && (
                <span className="w-2 h-2 rounded-full bg-blue-500" title="Unsaved changes" />
              )}
            </span>
            {step.loopCount > 1 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-700">
                ×{step.loopCount}
              </span>
            )}
            {(step.preScript || step.postScript) && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700" title={`${step.preScript ? 'Pre-script' : ''}${step.preScript && step.postScript ? ' + ' : ''}${step.postScript ? 'Post-script' : ''}`}>
                <svg className="w-3 h-3 mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Script
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1">{step.url}</span>
            {isStepError && stepResult && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {stepResult.executeResult.statusCode || 'ERR'}
                <span className="text-red-400">·</span>
                {stepResult.executeResult.durationMs}ms
              </span>
            )}
            {isStepSuccess && stepResult && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {stepResult.executeResult.statusCode}
                <span className="text-green-400">·</span>
                {stepResult.executeResult.durationMs}ms
                {stepResult.loopCount && stepResult.loopCount > 1 && (
                  <span className="ml-1 text-green-500">({stepResult.iteration}/{stepResult.loopCount})</span>
                )}
              </span>
            )}
            {isStepSkipped && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                Skipped
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(step.id); }}
              className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          {isStepError && stepResult && stepResult.executeResult.error && (
            <div className="mt-2 ml-7 flex items-start gap-1.5 text-xs text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded px-2 py-1.5">
              <svg className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="break-all">{stepResult.executeResult.error}</span>
            </div>
          )}
          {step.delayMs > 0 && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 ml-7">
              Delay: {step.delayMs}ms
            </div>
          )}
          {step.extractVars && step.extractVars !== '{}' && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 ml-7">
              Extract: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{step.extractVars}</code>
            </div>
          )}
        </div>

        {/* Expanded Inline Edit */}
        {expandedStepId === step.id && edit && (
          <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="space-y-3 text-sm">
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
                    className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-sm font-mono focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
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

              {/* Headers */}
              <FormField label="Headers (JSON)">
                <textarea
                  value={edit.headers}
                  onChange={e => onEditChange(step.id, 'headers', e.target.value)}
                  placeholder='{"Content-Type": "application/json"}'
                  rows={3}
                  className={`${INPUT_CLASS} font-mono resize-y`}
                />
              </FormField>

              {/* Body Type + Body */}
              <FormField label="Body">
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
                        height="96px"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Variables (JSON)</label>
                      <CodeEditor
                        value={edit.graphqlVariables}
                        onChange={val => onEditChange(step.id, 'graphqlVariables', val)}
                        language="json"
                        placeholder='{ "id": "123" }'
                        height="80px"
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
                  />
                )}
                {edit.bodyType !== 'none' && edit.bodyType !== 'graphql' && edit.bodyType !== 'form-urlencoded' && edit.bodyType !== 'formdata' && (
                  <CodeEditor
                    value={edit.body}
                    onChange={val => onEditChange(step.id, 'body', val)}
                    language={edit.bodyType === 'json' ? 'json' : edit.bodyType === 'xml' ? 'xml' : undefined}
                    placeholder={edit.bodyType === 'json' ? '{\n  "key": "value"\n}' : edit.bodyType === 'xml' ? '<root>\n  <item>value</item>\n</root>' : 'Request body...'}
                    height="96px"
                  />
                )}
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
                  className="px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="__global__">Global (inherit){activeGlobalProxy ? ` — ${activeGlobalProxy.name}` : ''}</option>
                  <option value="__none__">No Proxy (direct)</option>
                  {proxies.map(p => (
                    <option key={p.id} value={String(p.id)}>{p.name} — {p.url}</option>
                  ))}
                </select>
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
                  className="w-24 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
              </FormField>

              {/* Delay */}
              <FormField label="Delay (ms)">
                <input
                  type="number"
                  value={edit.delayMs}
                  onChange={e => onEditChange(step.id, 'delayMs', parseInt(e.target.value) || 0)}
                  min={0}
                  className="w-32 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
              </FormField>

              {/* Extract Variables */}
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
                  rows={2}
                  className={`${INPUT_CLASS} font-mono resize-y`}
                />
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

              {/* Pre-Script */}
              <FormField label={
                <span className="flex items-center gap-1">
                  Pre-Script
                  <span className="relative group/prescript">
                    <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="absolute bottom-full left-0 mb-1.5 hidden group-hover/prescript:block w-72 px-3 py-2 text-xs text-gray-100 bg-gray-800 dark:bg-gray-700 rounded-md shadow-lg z-50 font-normal leading-relaxed">
                      요청 실행 전에 실행되는 스크립트입니다. 변수 설정, 흐름 제어를 수행할 수 있습니다. DSL Guide에서 문법을 확인하세요.
                    </span>
                  </span>
                </span>
              }>
                <CodeEditor
                  value={edit.preScript}
                  onChange={val => onEditChange(step.id, 'preScript', val)}
                  language="json"
                  placeholder='{"setVariables": [{"name": "counter", "operation": "increment"}]}'
                  height="80px"
                />
              </FormField>

              {/* Post-Script */}
              <FormField label={
                <span className="flex items-center gap-1">
                  Post-Script
                  <span className="relative group/postscript">
                    <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="absolute bottom-full left-0 mb-1.5 hidden group-hover/postscript:block w-72 px-3 py-2 text-xs text-gray-100 bg-gray-800 dark:bg-gray-700 rounded-md shadow-lg z-50 font-normal leading-relaxed">
                      요청 실행 후에 실행되는 스크립트입니다. 응답 검증(assertions), 변수 추출, 흐름 제어를 수행할 수 있습니다.
                    </span>
                  </span>
                </span>
              }>
                <CodeEditor
                  value={edit.postScript}
                  onChange={val => onEditChange(step.id, 'postScript', val)}
                  language="json"
                  placeholder='{"assertions": [{"type": "status", "operator": "eq", "value": 200}]}'
                  height="80px"
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
                  className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1"
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

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => onSaveStep(step.id)}
                  disabled={updateStepPending}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateStepPending ? 'Saving...' : 'Save Step'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FlowEditor({ flow, onUpdate }: FlowEditorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showRequestDropdown, setShowRequestDropdown] = useState(false);
  const [flowResult, setFlowResult] = useState<FlowResult | null>(null);
  const [expandedStepId, setExpandedStepId] = useState<number | null>(null);
  const [editStates, setEditStates] = useState<Record<number, StepEditState>>({});
  const [selectedStepIds, setSelectedStepIds] = useState<Set<number>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: flowData } = useFlow(flow?.id || 0);
  const { data: steps = [] } = useFlowSteps(flow?.id || 0);
  const { data: requests = [] } = useRequests();
  const { data: proxies = [] } = useProxies();
  const activeGlobalProxy = proxies.find(p => p.isActive);

  const updateFlow = useUpdateFlow();
  const runFlow = useRunFlow();
  const createStep = useCreateFlowStep();
  const updateStep = useUpdateFlowStep();
  const deleteStep = useDeleteFlowStep();

  const [syncedFlowId, setSyncedFlowId] = useState<number | null>(null);

  const closeAddMenu = useCallback(() => {
    setShowAddMenu(false);
    setShowRequestDropdown(false);
  }, []);
  const addMenuRef = useClickOutside<HTMLDivElement>(closeAddMenu, showAddMenu || showRequestDropdown);

  // Sync form fields when flow data changes (React recommended pattern)
  if (flowData && flowData.id !== syncedFlowId) {
    setSyncedFlowId(flowData.id);
    setName(flowData.name);
    setDescription(flowData.description || '');
  }

  // Check if a step has unsaved changes
  const hasStepChanges = useCallback((stepId: number): boolean => {
    const edit = editStates[stepId];
    const step = steps.find(s => s.id === stepId);
    if (!edit || !step) return false;

    return (
      edit.name !== step.name ||
      edit.method !== step.method ||
      edit.url !== step.url ||
      edit.headers !== (step.headers || '{}') ||
      edit.bodyType !== (step.bodyType || 'none') ||
      edit.delayMs !== step.delayMs ||
      edit.extractVars !== (step.extractVars === '{}' ? '' : (step.extractVars || '')) ||
      edit.condition !== (step.condition || '') ||
      edit.proxyId !== (step.proxyId ?? null) ||
      edit.loopCount !== (step.loopCount || 1) ||
      edit.preScript !== (step.preScript || '') ||
      edit.postScript !== (step.postScript || '') ||
      edit.continueOnError !== (step.continueOnError || false)
    );
  }, [editStates, steps]);

  // Memoize handleSave to use in useEffect
  const handleSave = useCallback(() => {
    if (flow) {
      updateFlow.mutate({
        id: flow.id,
        data: { name, description },
      }, {
        onSuccess: (data) => onUpdate(data),
      });
    }
  }, [flow, name, description, updateFlow, onUpdate]);

  const handleRun = () => {
    if (flow) {
      setFlowResult(null);
      const stepIds = selectedStepIds.size > 0 ? Array.from(selectedStepIds) : undefined;
      runFlow.mutate({ flowId: flow.id, stepIds }, {
        onSuccess: (result) => setFlowResult(result),
        onError: (error) => {
          setFlowResult({
            flowId: flow.id,
            flowName: flow.name,
            steps: [],
            totalTimeMs: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Flow execution failed',
          });
        },
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !flow) return;

    const sortedSteps = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const oldIndex = sortedSteps.findIndex(s => s.id === active.id);
    const newIndex = sortedSteps.findIndex(s => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sortedSteps, oldIndex, newIndex);

    reordered.forEach((step, idx) => {
      const newOrder = idx + 1;
      if (step.stepOrder !== newOrder) {
        updateStep.mutate({
          flowId: flow.id,
          stepId: step.id,
          data: {
            stepOrder: newOrder,
            name: step.name,
            method: step.method,
            url: step.url,
            headers: step.headers,
            body: step.body,
            bodyType: step.bodyType,
            delayMs: step.delayMs,
            extractVars: step.extractVars,
            condition: step.condition,
            proxyId: step.proxyId === null ? -1 : step.proxyId,
            loopCount: step.loopCount,
            preScript: step.preScript,
            postScript: step.postScript,
            continueOnError: step.continueOnError,
          },
        });
      }
    });
  };

  const toggleStepSelection = (stepId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedStepIds(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const handleAddBlankStep = () => {
    if (flow) {
      const nextOrder = steps.length > 0 ? Math.max(...steps.map(s => s.stepOrder)) + 1 : 1;
      createStep.mutate({
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
      const nextOrder = steps.length > 0 ? Math.max(...steps.map(s => s.stepOrder)) + 1 : 1;
      createStep.mutate({
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
          preScript: '',
          postScript: '',
          continueOnError: false,
        },
      });
      setShowRequestDropdown(false);
      setShowAddMenu(false);
    }
  };

  const handleDeleteStep = (stepId: number) => {
    if (flow) {
      deleteStep.mutate({ flowId: flow.id, stepId });
      if (expandedStepId === stepId) {
        setExpandedStepId(null);
      }
      setEditStates(prev => {
        const next = { ...prev };
        delete next[stepId];
        return next;
      });
    }
  };

  const handleExpandStep = (stepId: number) => {
    if (expandedStepId === stepId) {
      setExpandedStepId(null);
    } else {
      setExpandedStepId(stepId);
      const step = steps.find(s => s.id === stepId);
      if (step && !editStates[stepId]) {
        setEditStates(prev => ({ ...prev, [stepId]: stepToEditState(step) }));
      }
    }
  };

  const handleEditChange = (stepId: number, field: keyof StepEditState, value: string | number | boolean | Array<{ key: string; value: string; enabled: boolean }> | FormDataItem[]) => {
    setEditStates(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], [field]: value },
    }));
  };

  const handleSaveStep = useCallback((stepId: number) => {
    if (!flow) return;
    const edit = editStates[stepId];
    if (!edit) return;
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    // Build body based on bodyType
    let bodyToSave = edit.body;
    if (edit.bodyType === 'graphql') {
      const graphqlPayload: { query: string; variables?: Record<string, unknown> } = { query: edit.body };
      if (edit.graphqlVariables.trim()) {
        try { graphqlPayload.variables = JSON.parse(edit.graphqlVariables); } catch { /* ignore */ }
      }
      bodyToSave = JSON.stringify(graphqlPayload);
    } else if (edit.bodyType === 'form-urlencoded') {
      bodyToSave = buildFormBody(edit.formItems);
    } else if (edit.bodyType === 'formdata') {
      bodyToSave = JSON.stringify(edit.formDataItems.map(({ key, value, type, enabled }) => ({ key, value, type, enabled })));
    }

    updateStep.mutate({
      flowId: flow.id,
      stepId,
      data: {
        requestId: step.requestId,
        stepOrder: step.stepOrder,
        delayMs: edit.delayMs,
        extractVars: edit.extractVars,
        condition: edit.condition,
        name: edit.name,
        method: edit.method,
        url: edit.url,
        headers: edit.headers,
        body: bodyToSave,
        bodyType: edit.bodyType,
        proxyId: edit.proxyId === null ? -1 : edit.proxyId,
        loopCount: edit.loopCount,
        preScript: edit.preScript,
        postScript: edit.postScript,
        continueOnError: edit.continueOnError,
      },
    }, {
      onSuccess: (updatedStep) => {
        // Sync editStates with the saved step to clear the "unsaved" indicator
        setEditStates(prev => ({
          ...prev,
          [stepId]: stepToEditState(updatedStep),
        }));
      },
    });
  }, [flow, editStates, steps, updateStep]);

  // Cmd+S / Ctrl+S to save expanded step
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (flow && expandedStepId && hasStepChanges(expandedStepId)) {
          handleSaveStep(expandedStepId);
        } else if (flow) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flow, expandedStepId, hasStepChanges, handleSaveStep, handleSave]);

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
            {isEditingName ? (
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onBlur={() => setIsEditingName(false)}
                onKeyDown={e => {
                  if (e.key === 'Enter') setIsEditingName(false);
                  if (e.key === 'Escape') {
                    setName(flowData?.name || '');
                    setIsEditingName(false);
                  }
                }}
                className="text-xl font-semibold px-2 py-1 border border-blue-500 rounded focus:outline-none w-full dark:bg-gray-700 dark:text-gray-100"
                autoFocus
              />
            ) : (
              <h2
                onClick={() => setIsEditingName(true)}
                className="text-xl font-semibold cursor-pointer hover:text-blue-600 dark:text-gray-100"
                title="Click to edit name"
              >
                {name}
              </h2>
            )}
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add description..."
              className="mt-1 text-sm text-gray-500 dark:text-gray-400 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
            />
          </div>
          <button
            onClick={handleRun}
            disabled={runFlow.isPending || steps.length === 0}
            className="px-6 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {runFlow.isPending ? (
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
                {selectedStepIds.size > 0 ? `Run Selected (${selectedStepIds.size})` : 'Run Flow'}
              </>
            )}
          </button>
          <button
            onClick={handleSave}
            disabled={updateFlow.isPending}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
          >
            Save
          </button>
        </div>
      </div>

      {/* Flow Steps */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-3xl mx-auto">
          <div className="space-y-3">
            {steps.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p>No steps in this flow yet.</p>
                <p className="text-sm">Add a blank step or copy from an existing request.</p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={[...steps].sort((a, b) => a.stepOrder - b.stepOrder).map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {[...steps]
                    .sort((a, b) => a.stepOrder - b.stepOrder)
                    .map((step, index) => (
                      <SortableStep
                        key={step.id}
                        step={step}
                        index={index}
                        stepsLength={steps.length}
                        isSelected={selectedStepIds.has(step.id)}
                        hasChanges={hasStepChanges(step.id)}
                        onToggleSelection={toggleStepSelection}
                        onExpand={handleExpandStep}
                        onDelete={handleDeleteStep}
                        expandedStepId={expandedStepId}
                        editState={editStates[step.id]}
                        stepResults={flowResult?.steps || []}
                        onEditChange={handleEditChange}
                        onSaveStep={handleSaveStep}
                        updateStepPending={updateStep.isPending}
                        proxies={proxies}
                        activeGlobalProxy={activeGlobalProxy}
                      />
                    ))
                  }
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Add Step Button */}
          <div className="mt-4 relative" ref={addMenuRef}>
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Step
            </button>
            {showAddMenu && !showRequestDropdown && (
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
                  className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <div className="font-medium dark:text-gray-200">Copy From Request</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Copy data from an existing request as a template</div>
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
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Select a request to copy</span>
                </div>
                {requests.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 dark:text-gray-400">No requests available. Create requests first.</div>
                ) : (
                  requests.map(req => (
                    <button
                      key={req.id}
                      onClick={() => handleCopyFromRequest(req.id)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 dark:text-gray-200"
                    >
                      <MethodBadge method={req.method} />
                      <span className="font-medium dark:text-gray-200">{req.name}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{req.url}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Flow Result */}
      {flowResult && (
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold dark:text-gray-100">
                Flow Result
                <span className={`ml-2 text-sm ${flowResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {flowResult.success ? 'Success' : 'Failed'}
                </span>
              </h3>
              <span className="text-sm text-gray-500 dark:text-gray-400">{flowResult.totalTimeMs}ms total</span>
            </div>
            {flowResult.error && (
              <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-400">
                {flowResult.error}
              </div>
            )}
            <div className="space-y-2">
              {flowResult.steps.map((stepResult) => (
                <div
                  key={`${stepResult.stepId}-${stepResult.iteration || 0}`}
                  className={`p-3 rounded-lg border ${
                    stepResult.skipped
                      ? 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                      : stepResult.executeResult.error || stepResult.executeResult.statusCode >= 400
                      ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700'
                      : 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium dark:text-gray-200">
                      {stepResult.requestName || 'Untitled'}
                      {stepResult.loopCount && stepResult.loopCount > 1 && (
                        <span className="ml-1 text-purple-600 dark:text-purple-400">
                          ({stepResult.iteration}/{stepResult.loopCount})
                        </span>
                      )}
                    </span>
                    {stepResult.skipped ? (
                      <span className="text-xs text-gray-500 dark:text-gray-400">Skipped: {stepResult.skipReason}</span>
                    ) : (
                      <>
                        <span className={`text-sm ${stepResult.executeResult.error || stepResult.executeResult.statusCode >= 400 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {stepResult.executeResult.statusCode || 'Error'}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{stepResult.executeResult.durationMs}ms</span>
                      </>
                    )}
                    {/* Show assertion results if available */}
                    {stepResult.postScriptResult && (stepResult.postScriptResult.assertionsPassed > 0 || stepResult.postScriptResult.assertionsFailed > 0) && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        stepResult.postScriptResult.assertionsFailed > 0
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      }`}>
                        {stepResult.postScriptResult.assertionsPassed}/{stepResult.postScriptResult.assertionsPassed + stepResult.postScriptResult.assertionsFailed} assertions
                      </span>
                    )}
                    {/* Show flow action if not next */}
                    {stepResult.postScriptResult && stepResult.postScriptResult.flowAction !== 'next' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        {stepResult.postScriptResult.flowAction}
                        {stepResult.postScriptResult.gotoStepName && ` → ${stepResult.postScriptResult.gotoStepName}`}
                      </span>
                    )}
                  </div>
                  {stepResult.executeResult.error && (
                    <div className="mt-1 text-xs text-red-600 dark:text-red-400">{stepResult.executeResult.error}</div>
                  )}
                  {/* Show assertion errors */}
                  {stepResult.postScriptResult?.errors && stepResult.postScriptResult.errors.length > 0 && (
                    <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {stepResult.postScriptResult.errors.map((err, i) => (
                        <div key={i}>{err}</div>
                      ))}
                    </div>
                  )}
                  {/* Show extracted variables */}
                  {Object.keys(stepResult.extractedVars || {}).length > 0 && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Variables: {Object.entries(stepResult.extractedVars).map(([k, v]) => `${k}=${v}`).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
