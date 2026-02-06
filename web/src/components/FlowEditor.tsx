import { useState, useEffect, useCallback } from 'react';
import {
  useFlow,
  useFlowSteps,
  useUpdateFlow,
  useRunFlow,
  useCreateFlowStep,
  useDeleteFlowStep,
  useRequests,
} from '../hooks/useApi';
import { useClickOutside } from '../hooks/useClickOutside';
import type { Flow, FlowResult } from '../types';

interface FlowEditorProps {
  flow: Flow | null;
  onUpdate: (flow: Flow) => void;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-600',
  POST: 'text-yellow-600',
  PUT: 'text-blue-600',
  DELETE: 'text-red-600',
  PATCH: 'text-purple-600',
};

export function FlowEditor({ flow, onUpdate }: FlowEditorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [showRequestDropdown, setShowRequestDropdown] = useState(false);
  const [flowResult, setFlowResult] = useState<FlowResult | null>(null);
  const [expandedStepId, setExpandedStepId] = useState<number | null>(null);

  const { data: flowData } = useFlow(flow?.id || 0);
  const { data: steps = [] } = useFlowSteps(flow?.id || 0);
  const { data: requests = [] } = useRequests();

  const updateFlow = useUpdateFlow();
  const runFlow = useRunFlow();
  const createStep = useCreateFlowStep();
  const deleteStep = useDeleteFlowStep();

  const closeRequestDropdown = useCallback(() => setShowRequestDropdown(false), []);
  const requestDropdownRef = useClickOutside<HTMLDivElement>(closeRequestDropdown, showRequestDropdown);

  useEffect(() => {
    if (flowData) {
      setName(flowData.name);
      setDescription(flowData.description || '');
    }
  }, [flowData]);

  const handleSave = () => {
    if (flow) {
      updateFlow.mutate({
        id: flow.id,
        data: { name, description },
      }, {
        onSuccess: (data) => onUpdate(data),
      });
    }
  };

  const handleRun = () => {
    if (flow) {
      runFlow.mutate(flow.id, {
        onSuccess: (result) => setFlowResult(result),
      });
    }
  };

  const handleAddStep = (requestId: number) => {
    if (flow) {
      const nextOrder = steps.length > 0 ? Math.max(...steps.map(s => s.stepOrder)) + 1 : 1;
      createStep.mutate({
        flowId: flow.id,
        data: {
          requestId,
          stepOrder: nextOrder,
          delayMs: 0,
          extractVars: '{}',
          condition: '',
        },
      });
      setShowRequestDropdown(false);
    }
  };

  const handleDeleteStep = (stepId: number) => {
    if (flow) {
      deleteStep.mutate({ flowId: flow.id, stepId });
    }
  };

  const getRequestById = (id: number) => requests.find(r => r.id === id);

  if (!flow) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          <p>Select a flow from the sidebar or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Flow Header */}
      <div className="bg-white border-b border-gray-200 p-4">
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
                className="text-xl font-semibold px-2 py-1 border border-blue-500 rounded focus:outline-none w-full"
                autoFocus
              />
            ) : (
              <h2
                onClick={() => setIsEditingName(true)}
                className="text-xl font-semibold cursor-pointer hover:text-blue-600"
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
              className="mt-1 text-sm text-gray-500 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
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
                Run Flow
              </>
            )}
          </button>
          <button
            onClick={handleSave}
            disabled={updateFlow.isPending}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Save
          </button>
        </div>
      </div>

      {/* Flow Steps */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <div className="space-y-3">
            {steps.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No steps in this flow yet.</p>
                <p className="text-sm">Add requests to create your flow.</p>
              </div>
            ) : (
              steps
                .sort((a, b) => a.stepOrder - b.stepOrder)
                .map((step, index) => {
                  const request = getRequestById(step.requestId);
                  return (
                    <div key={step.id} className="flex items-stretch gap-3">
                      {/* Step number */}
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        {index < steps.length - 1 && (
                          <div className="w-0.5 flex-1 bg-gray-300 my-1" />
                        )}
                      </div>

                      {/* Step content */}
                      <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden group">
                        <div
                          onClick={() => setExpandedStepId(expandedStepId === step.id ? null : step.id)}
                          className="p-4 cursor-pointer hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3">
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform ${expandedStepId === step.id ? 'rotate-90' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span className={`text-xs font-mono font-semibold ${METHOD_COLORS[request?.method || ''] || 'text-gray-600'}`}>
                              {request?.method || 'N/A'}
                            </span>
                            <span className="font-medium">{request?.name || 'Unknown Request'}</span>
                            <span className="text-xs text-gray-400 truncate flex-1">{request?.url}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteStep(step.id); }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-50 rounded"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          {step.delayMs > 0 && (
                            <div className="mt-2 text-xs text-gray-500 ml-7">
                              Delay: {step.delayMs}ms
                            </div>
                          )}
                          {step.extractVars && step.extractVars !== '{}' && (
                            <div className="mt-2 text-xs text-gray-500 ml-7">
                              Extract: <code className="bg-gray-100 px-1 rounded">{step.extractVars}</code>
                            </div>
                          )}
                        </div>

                        {/* Expanded Request Details */}
                        {expandedStepId === step.id && request && (
                          <div className="border-t border-gray-200 bg-gray-50 p-4">
                            <div className="space-y-3 text-sm">
                              {/* URL */}
                              <div>
                                <div className="text-xs font-medium text-gray-500 mb-1">URL</div>
                                <div className="font-mono text-xs bg-white p-2 rounded border border-gray-200 break-all">
                                  {request.url}
                                </div>
                              </div>

                              {/* Headers */}
                              {request.headers && request.headers !== '{}' && (
                                <div>
                                  <div className="text-xs font-medium text-gray-500 mb-1">Headers</div>
                                  <pre className="font-mono text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto">
                                    {(() => {
                                      try {
                                        return JSON.stringify(JSON.parse(request.headers), null, 2);
                                      } catch {
                                        return request.headers;
                                      }
                                    })()}
                                  </pre>
                                </div>
                              )}

                              {/* Body */}
                              {request.body && request.bodyType !== 'none' && (
                                <div>
                                  <div className="text-xs font-medium text-gray-500 mb-1">
                                    Body <span className="text-gray-400">({request.bodyType})</span>
                                  </div>
                                  <pre className="font-mono text-xs bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-40">
                                    {(() => {
                                      if (request.bodyType === 'json') {
                                        try {
                                          return JSON.stringify(JSON.parse(request.body), null, 2);
                                        } catch {
                                          return request.body;
                                        }
                                      }
                                      return request.body;
                                    })()}
                                  </pre>
                                </div>
                              )}

                              {/* No headers/body message */}
                              {(!request.headers || request.headers === '{}') && (!request.body || request.bodyType === 'none') && (
                                <div className="text-xs text-gray-400 italic">
                                  No headers or body configured
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          {/* Add Step Button */}
          <div className="mt-4 relative" ref={requestDropdownRef}>
            <button
              onClick={() => setShowRequestDropdown(!showRequestDropdown)}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Step
            </button>
            {showRequestDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                {requests.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">No requests available. Create requests first.</div>
                ) : (
                  requests.map(req => (
                    <button
                      key={req.id}
                      onClick={() => handleAddStep(req.id)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-3"
                    >
                      <span className={`text-xs font-mono font-semibold ${METHOD_COLORS[req.method] || 'text-gray-600'}`}>
                        {req.method}
                      </span>
                      <span className="font-medium">{req.name}</span>
                      <span className="text-xs text-gray-400 truncate">{req.url}</span>
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
        <div className="bg-white border-t border-gray-200 max-h-80 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">
                Flow Result
                <span className={`ml-2 text-sm ${flowResult.success ? 'text-green-600' : 'text-red-600'}`}>
                  {flowResult.success ? 'Success' : 'Failed'}
                </span>
              </h3>
              <span className="text-sm text-gray-500">{flowResult.totalTimeMs}ms total</span>
            </div>
            <div className="space-y-2">
              {flowResult.steps.map((stepResult, index) => (
                <div
                  key={stepResult.stepId}
                  className={`p-3 rounded-lg border ${
                    stepResult.skipped
                      ? 'bg-gray-50 border-gray-200'
                      : stepResult.executeResult.statusCode >= 400
                      ? 'bg-red-50 border-red-200'
                      : 'bg-green-50 border-green-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{index + 1}. {stepResult.requestName}</span>
                    {stepResult.skipped ? (
                      <span className="text-xs text-gray-500">Skipped: {stepResult.skipReason}</span>
                    ) : (
                      <>
                        <span className={`text-sm ${stepResult.executeResult.statusCode >= 400 ? 'text-red-600' : 'text-green-600'}`}>
                          {stepResult.executeResult.statusCode}
                        </span>
                        <span className="text-xs text-gray-500">{stepResult.executeResult.durationMs}ms</span>
                      </>
                    )}
                  </div>
                  {stepResult.executeResult.error && (
                    <div className="mt-1 text-xs text-red-600">{stepResult.executeResult.error}</div>
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
