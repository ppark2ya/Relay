import type { FlowResult } from '../../types';
import { formatBodySize, formatBody } from './useFlowRunner';

interface FlowResultPanelProps {
  flowResult: FlowResult;
  expandedResultIds: Set<string>;
  copiedKey: string | null;
  onToggleExpand: (key: string) => void;
  onCopyBody: (key: string, body: string) => void;
}

export function FlowResultPanel({
  flowResult,
  expandedResultIds,
  copiedKey,
  onToggleExpand,
  onCopyBody,
}: FlowResultPanelProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold dark:text-gray-100">
            Flow Result
            <span className={`ml-2 text-xs ${flowResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {flowResult.success ? 'Success' : 'Failed'}
            </span>
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">{flowResult.totalTimeMs}ms total</span>
        </div>
        {flowResult.error && (
          <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-xs text-red-700 dark:text-red-400">
            {flowResult.error}
          </div>
        )}
        {flowResult.warnings && flowResult.warnings.length > 0 && (
          <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
            <div className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Warnings</div>
            {flowResult.warnings.map((w, i) => (
              <div key={i} className="text-xs text-amber-600 dark:text-amber-400">⚠ {w}</div>
            ))}
          </div>
        )}
        <div className="space-y-2">
          {flowResult.steps.map((stepResult) => {
            const resultKey = `${stepResult.stepId}-${stepResult.iteration || 0}`;
            const isExpanded = expandedResultIds.has(resultKey);
            const hasBody = !stepResult.skipped && stepResult.executeResult.body && !stepResult.executeResult.error;
            const isBinary = stepResult.executeResult.isBinary;

            return (
            <div
              key={resultKey}
              className={`rounded-lg border ${
                stepResult.skipped
                  ? 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                  : stepResult.executeResult.error || stepResult.executeResult.statusCode >= 400
                  ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700'
                  : 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700'
              }`}
            >
              <div
                className={`p-3 ${hasBody || isBinary ? 'cursor-pointer select-none' : ''}`}
                onClick={() => (hasBody || isBinary) && onToggleExpand(resultKey)}
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
                      <span className={`text-xs ${stepResult.executeResult.error || stepResult.executeResult.statusCode >= 400 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {stepResult.executeResult.statusCode || 'Error'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{stepResult.executeResult.durationMs}ms</span>
                      {stepResult.executeResult.bodySize > 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">{formatBodySize(stepResult.executeResult.bodySize)}</span>
                      )}
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
                  <div className="ml-auto flex items-center gap-1">
                    {hasBody && !isBinary && (
                      <button
                        className="text-xs px-1.5 py-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400"
                        onClick={(e) => { e.stopPropagation(); onCopyBody(resultKey, stepResult.executeResult.body); }}
                      >
                        {copiedKey === resultKey ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                    {(hasBody || isBinary) && (
                      <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                </div>
                {/* Body preview when collapsed */}
                {!isExpanded && hasBody && !isBinary && stepResult.executeResult.body && (
                  <div className="mt-1 text-xs text-gray-400 dark:text-gray-500 truncate font-mono">
                    {stepResult.executeResult.body.slice(0, 100)}
                  </div>
                )}
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
                {/* Show goto warnings */}
                {stepResult.warnings && stepResult.warnings.length > 0 && (
                  <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {stepResult.warnings.map((w, i) => (
                      <div key={i}>⚠ {w}</div>
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
              {/* Expanded response body */}
              {isExpanded && (
                <div className="px-3 pb-3">
                  {isBinary ? (
                    <div className="text-xs text-gray-500 dark:text-gray-400 italic">(Binary response)</div>
                  ) : hasBody ? (
                    <pre className="text-xs font-mono bg-gray-100 dark:bg-gray-900 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">
                      {formatBody(stepResult.executeResult.body)}
                    </pre>
                  ) : null}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
