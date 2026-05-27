import { useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  useFlowSteps,
  useCreateFlowStep,
  useUpdateFlowStep,
  useDeleteFlowStep,
} from '../../api/flows';
import type { Flow, FlowStep } from '../../types';
import type { FormDataItem } from '../ui';
import {
  type ScriptMode, type HeadersMode,
  detectScriptMode, parseHeaders,
  parseFormBody, parseFormDataBody, parseGraphqlBody,
  serializeHeaderItems, buildFormBody, serializeFormDataItems, buildGraphqlBody,
} from '../shared';

export interface StepEditState {
  name: string;
  method: string;
  url: string;
  headers: string;
  headerItems: Array<{ key: string; value: string; enabled: boolean }>;
  headersMode: HeadersMode;
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
  preScriptMode: ScriptMode;
  postScriptMode: ScriptMode;
  continueOnError: boolean;
}

export function stepToEditState(step: FlowStep): StepEditState {
  const bodyType = step.bodyType || 'none';
  const body = step.body || '';

  let parsedBody = body;
  let graphqlVariables = '';
  let formItems: Array<{ key: string; value: string; enabled: boolean }> = [];
  let formDataItems: FormDataItem[] = [];

  if (bodyType === 'graphql' && body) {
    const gql = parseGraphqlBody(body);
    parsedBody = gql.query;
    graphqlVariables = gql.variables;
  } else if (bodyType === 'form-urlencoded') {
    formItems = parseFormBody(body);
  } else if (bodyType === 'formdata') {
    formDataItems = parseFormDataBody(body);
  }

  const headersStr = step.headers || '{}';

  return {
    name: step.name,
    method: step.method,
    url: step.url,
    headers: headersStr,
    headerItems: parseHeaders(headersStr),
    headersMode: 'key-value' as HeadersMode,
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
    preScriptMode: detectScriptMode(step.preScript || ''),
    postScriptMode: detectScriptMode(step.postScript || ''),
    continueOnError: step.continueOnError || false,
  };
}

export function useFlowStepEdit(flow: Flow | null) {
  const { data: steps = [] } = useFlowSteps(flow?.id || 0);
  const createStep = useCreateFlowStep();
  const updateStep = useUpdateFlowStep();
  const deleteStep = useDeleteFlowStep();

  const [editStates, setEditStates] = useState<Record<number, StepEditState>>({});
  const [expandedStepId, setExpandedStepId] = useState<number | null>(null);
  const [selectedStepIds, setSelectedStepIds] = useState<Set<number>>(new Set());

  const hasStepChanges = (stepId: number): boolean => {
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

  const handleEditChange = (stepId: number, field: keyof StepEditState, value: string | number | boolean | ScriptMode | HeadersMode | Array<{ key: string; value: string; enabled: boolean }> | FormDataItem[]) => {
    setEditStates(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], [field]: value },
    }));
  };

  const handleSaveStep = (stepId: number) => {
    if (!flow) return;
    const edit = editStates[stepId];
    if (!edit) return;
    const step = steps.find(s => s.id === stepId);
    if (!step) return;

    // Build body based on bodyType
    let bodyToSave = edit.body;
    if (edit.bodyType === 'graphql') {
      bodyToSave = buildGraphqlBody(edit.body, edit.graphqlVariables);
    } else if (edit.bodyType === 'form-urlencoded') {
      bodyToSave = buildFormBody(edit.formItems);
    } else if (edit.bodyType === 'formdata') {
      bodyToSave = serializeFormDataItems(edit.formDataItems);
    }

    // Build headers: use headerItems (key-value mode) or raw text
    const headersToSave = edit.headersMode === 'key-value'
      ? serializeHeaderItems(edit.headerItems)
      : edit.headers;

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
        headers: headersToSave,
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

  const toggleAllSteps = () => {
    if (selectedStepIds.size === steps.length) {
      setSelectedStepIds(new Set());
    } else {
      setSelectedStepIds(new Set(steps.map(s => s.id)));
    }
  };

  const allStepsSelected = steps.length > 0 && selectedStepIds.size === steps.length;
  const someStepsSelected = selectedStepIds.size > 0 && selectedStepIds.size < steps.length;

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

  return {
    steps, createStep, updateStep, deleteStep,
    editStates, expandedStepId, setExpandedStepId, selectedStepIds,
    hasStepChanges,
    handleExpandStep, handleEditChange, handleSaveStep, handleDeleteStep,
    toggleStepSelection, toggleAllSteps,
    allStepsSelected, someStepsSelected,
    handleDragEnd,
  };
}
