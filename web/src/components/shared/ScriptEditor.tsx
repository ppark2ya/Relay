import { useState } from 'react';
import { CodeEditor } from '../ui';
import type { ScriptDiagnostic } from '../ui';
import type { ScriptMode } from './http-utils';

interface ScriptEditorProps {
  preScript: string;
  postScript: string;
  preScriptMode: ScriptMode;
  postScriptMode: ScriptMode;
  onPreScriptChange: (value: string) => void;
  onPostScriptChange: (value: string) => void;
  onPreScriptModeChange: (mode: ScriptMode) => void;
  onPostScriptModeChange: (mode: ScriptMode) => void;
  /** Fixed height (e.g. "200px"). If not set, uses flex layout (100%). */
  height?: string;
  preScriptDiagnostics?: ScriptDiagnostic[];
  postScriptDiagnostics?: ScriptDiagnostic[];
  /** External control of active tab */
  activeTab?: 'pre' | 'post';
  onTabChange?: (tab: 'pre' | 'post') => void;
}

export function ScriptEditor({
  preScript,
  postScript,
  preScriptMode,
  postScriptMode,
  onPreScriptChange,
  onPostScriptChange,
  onPreScriptModeChange,
  onPostScriptModeChange,
  height,
  preScriptDiagnostics,
  postScriptDiagnostics,
  activeTab: externalTab,
  onTabChange,
}: ScriptEditorProps) {
  const [internalTab, setInternalTab] = useState<'pre' | 'post'>('pre');
  const scriptTab = externalTab ?? internalTab;
  const setScriptTab = onTabChange ?? setInternalTab;

  const currentMode = scriptTab === 'pre' ? preScriptMode : postScriptMode;

  return (
    <>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setScriptTab('pre')}
            className={`px-3 py-1 text-xs rounded-md font-medium ${
              scriptTab === 'pre'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Pre-Script
          </button>
          <button
            type="button"
            onClick={() => setScriptTab('post')}
            className={`px-3 py-1 text-xs rounded-md font-medium ${
              scriptTab === 'post'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Post-Script
          </button>
        </div>
        <div className="flex gap-1 ml-auto">
          <button
            type="button"
            onClick={() => scriptTab === 'pre' ? onPreScriptModeChange('dsl') : onPostScriptModeChange('dsl')}
            className={`px-2 py-0.5 text-xs rounded border ${
              currentMode === 'dsl'
                ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-400'
                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            DSL
          </button>
          <button
            type="button"
            onClick={() => scriptTab === 'pre' ? onPreScriptModeChange('javascript') : onPostScriptModeChange('javascript')}
            className={`px-2 py-0.5 text-xs rounded border ${
              currentMode === 'javascript'
                ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-400'
                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            JavaScript
          </button>
        </div>
      </div>
      {scriptTab === 'pre' && (
        height ? (
          <CodeEditor
            value={preScript}
            onChange={onPreScriptChange}
            language={preScriptMode === 'javascript' ? 'javascript' : 'json'}
            placeholder={preScriptMode === 'javascript'
              ? '// Pre-request script\npm.variables.set("timestamp", Date.now().toString());'
              : '{"setVariables": [{"name": "counter", "operation": "increment"}]}'}
            height={height}
            diagnostics={preScriptDiagnostics}
          />
        ) : (
          <div className="flex-1 min-h-0 relative">
            <div className="absolute inset-0">
              <CodeEditor
                value={preScript}
                onChange={onPreScriptChange}
                language={preScriptMode === 'javascript' ? 'javascript' : 'json'}
                placeholder={preScriptMode === 'javascript'
                  ? '// Pre-request script\npm.variables.set("timestamp", Date.now().toString());'
                  : '{"setVariables": [{"name": "counter", "operation": "increment"}]}'}
                height="100%"
                diagnostics={preScriptDiagnostics}
              />
            </div>
          </div>
        )
      )}
      {scriptTab === 'post' && (
        height ? (
          <CodeEditor
            value={postScript}
            onChange={onPostScriptChange}
            language={postScriptMode === 'javascript' ? 'javascript' : 'json'}
            placeholder={postScriptMode === 'javascript'
              ? `// Post-request script (Postman-compatible)\npm.test("Status is 200", function() {\n    pm.response.to.have.status(200);\n});\n\nlet data = pm.response.json();\npm.environment.set("userId", data.id);`
              : '{"assertions": [{"type": "status", "operator": "eq", "value": 200}]}'}
            height={height}
            diagnostics={postScriptDiagnostics}
          />
        ) : (
          <div className="flex-1 min-h-0 relative">
            <div className="absolute inset-0">
              <CodeEditor
                value={postScript}
                onChange={onPostScriptChange}
                language={postScriptMode === 'javascript' ? 'javascript' : 'json'}
                placeholder={postScriptMode === 'javascript'
                  ? `// Post-request script (Postman-compatible)\npm.test("Status is 200", function() {\n    pm.response.to.have.status(200);\n});\n\nlet data = pm.response.json();\npm.environment.set("userId", data.id);`
                  : '{"assertions": [{"type": "status", "operator": "eq", "value": 200}]}'}
                height="100%"
                diagnostics={postScriptDiagnostics}
              />
            </div>
          </div>
        )
      )}
    </>
  );
}
