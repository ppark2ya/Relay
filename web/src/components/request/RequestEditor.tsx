import { useState, useCallback, useEffect } from 'react';
import { uploadFile, deleteFile } from '../../api/files';
import { useClickOutside } from '../../hooks/useClickOutside';
import type { Request, ExecuteResult, ScriptResult, WSConnectionStatus } from '../../types';
import { TabNav, KeyValueEditor, FormDataEditor, EmptyState, METHOD_BG_COLORS, METHOD_TEXT_COLORS, CodeEditor } from '../ui';
import { METHODS_WITH_WS as METHODS, COMMON_HEADERS, ScriptEditor } from '../shared';
import { useRequestForm } from './useRequestForm';
import { useRequestExecute } from './useRequestExecute';

interface WSControls {
  status: WSConnectionStatus;
  connect: (url: string, headers: string, proxyId?: number | null, requestId?: number, subprotocols?: string[]) => void;
  disconnect: () => void;
}

interface RequestEditorProps {
  request: Request | null;
  onExecute: (result: ExecuteResult) => void;
  onUpdate: (request: Request) => void;
  onExecutingChange?: (executing: boolean) => void;
  onCancelReady?: (fn: (() => void) | null) => void;
  onMethodChange?: (method: string) => void;
  onImportCookiesReady?: (fn: ((cookies: Array<{ key: string; value: string; enabled: boolean }>) => void) | null) => void;
  onScriptResults?: (pre: ScriptResult | undefined, post: ScriptResult | undefined) => void;
  ws?: WSControls;
}

type Tab = 'params' | 'headers' | 'cookies' | 'body' | 'scripts';

export function RequestEditor({ request, onExecute, onUpdate, onExecutingChange, onCancelReady, onMethodChange, onImportCookiesReady, onScriptResults, ws }: RequestEditorProps) {
  const form = useRequestForm(request, onUpdate);

  const [activeTab, setActiveTab] = useState<Tab>('params');
  const [showMethodDropdown, setShowMethodDropdown] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [showProxySelector, setShowProxySelector] = useState(false);
  const [scriptTab, setScriptTab] = useState<'pre' | 'post'>('pre');

  const { handleExecute, handleCancel, isExecuting } = useRequestExecute({
    request,
    formState: {
      method: form.method,
      url: form.url,
      bodyType: form.bodyType,
      body: form.body,
      headerItems: form.headerItems,
      cookieItems: form.cookieItems,
      formItems: form.formItems,
      formDataItems: form.formDataItems,
      graphqlVariables: form.graphqlVariables,
      proxyId: form.proxyId,
    },
    isFromHistory: form.isFromHistory,
    onExecute,
    onExecutingChange,
    onScriptResults,
    setPreScriptDiagnostics: form.setPreScriptDiagnostics,
    setPostScriptDiagnostics: form.setPostScriptDiagnostics,
  });

  // Expose cancel function to parent
  useEffect(() => {
    onCancelReady?.(handleCancel);
    return () => onCancelReady?.(null);
  }, [onCancelReady, handleCancel]);

  // Expose import cookies function to parent
  useEffect(() => {
    if (!onImportCookiesReady) return;
    const handler = (imported: Array<{ key: string; value: string; enabled: boolean }>) => {
      form.handleImportCookies(imported);
      setActiveTab('cookies');
    };
    onImportCookiesReady(handler);
    return () => onImportCookiesReady(null);
  }, [onImportCookiesReady, form.handleImportCookies]);

  // Notify parent when method changes
  useEffect(() => {
    onMethodChange?.(form.method);
  }, [form.method, onMethodChange]);

  const closeMethodDropdown = useCallback(() => setShowMethodDropdown(false), []);
  const methodDropdownRef = useClickOutside<HTMLDivElement>(closeMethodDropdown, showMethodDropdown);

  const closeEnvVars = useCallback(() => setShowEnvVars(false), []);
  const envVarsRef = useClickOutside<HTMLDivElement>(closeEnvVars, showEnvVars);

  const closeProxySelector = useCallback(() => setShowProxySelector(false), []);
  const proxySelectorRef = useClickOutside<HTMLDivElement>(closeProxySelector, showProxySelector);

  // Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        const target = e.target;
        if (target instanceof HTMLInputElement && target.hasAttribute('data-rename-input')) {
          target.blur();
          return;
        }
        if (request && !form.isFromHistory) {
          form.handleSave();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [request, form.isFromHistory, form.handleSave]);

  if (!request) {
    return (
      <EmptyState
        className="bg-gray-50 dark:bg-gray-900"
        icon={
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
        message="Select a request from the sidebar or create a new one"
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-800">
      {/* History banner */}
      {form.isFromHistory && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2 shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Loaded from history. Edit and re-send, or select a saved request.
        </div>
      )}

      {/* Request Name */}
      <div className="px-4 pt-3 pb-1 shrink-0">
        {isEditingName ? (
          <input
            type="text"
            value={form.name}
            onChange={e => form.setName(e.target.value)}
            onBlur={() => setIsEditingName(false)}
            onKeyDown={e => {
              if (e.key === 'Enter') setIsEditingName(false);
              if (e.key === 'Escape') {
                form.setName(request.name);
                setIsEditingName(false);
              }
            }}
            className="text-base font-medium px-2 py-1 border border-blue-500 rounded focus:outline-none dark:bg-gray-700 dark:text-gray-100"
            autoFocus
          />
        ) : (
          <h2
            onClick={() => setIsEditingName(true)}
            className="text-base font-medium cursor-pointer hover:text-blue-600 dark:text-gray-100 flex items-center gap-1.5"
            title="Click to edit name"
          >
            {form.name}
            {form.hasChanges && (
              <span className="w-2 h-2 rounded-full bg-blue-500" title="Unsaved changes" />
            )}
          </h2>
        )}
      </div>

      {/* URL Bar */}
      <div className="p-4 pt-2 flex gap-2 shrink-0">
        <div className="relative" ref={methodDropdownRef}>
          <button
            onClick={() => setShowMethodDropdown(!showMethodDropdown)}
            className={`w-28 px-3 py-2 rounded-l-md text-xs text-white font-medium ${METHOD_BG_COLORS[form.method]} flex items-center justify-between gap-1`}
          >
            {form.method}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showMethodDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg dark:shadow-gray-900/50 z-10">
              {METHODS.map(m => (
                <button
                  key={m}
                  onClick={() => { form.setMethod(m); setShowMethodDropdown(false); }}
                  className={`block w-full px-4 py-2 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700 font-medium ${METHOD_TEXT_COLORS[m]} ${form.method === m ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="text"
          value={form.url}
          onChange={e => form.handleUrlChange(e.target.value)}
          placeholder="Enter URL or paste text (use {{variable}} for env vars)"
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs dark:bg-gray-700 dark:text-gray-100"
        />
        {/* Proxy Selector */}
        <div className="relative" ref={proxySelectorRef}>
          <button
            onClick={() => setShowProxySelector(!showProxySelector)}
            className={`h-full px-3 py-2 border rounded-md flex items-center gap-1.5 text-xs ${
              form.proxyId === null
                ? form.activeGlobalProxy
                  ? 'border-green-300 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-900/30'
                  : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                : form.proxyId === 0
                ? 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                : 'border-yellow-300 text-yellow-700 hover:bg-yellow-50 dark:border-yellow-600 dark:text-yellow-400 dark:hover:bg-yellow-900/30'
            }`}
            title={
              form.proxyId === null
                ? form.activeGlobalProxy ? `Global: ${form.activeGlobalProxy.name}` : 'Global (no proxy active)'
                : form.proxyId === 0
                ? 'No Proxy (direct)'
                : `Proxy: ${form.proxies.find(p => p.id === form.proxyId)?.name || 'Unknown'}`
            }
          >
            <span className={`w-2 h-2 rounded-full ${
              form.proxyId === null
                ? form.activeGlobalProxy ? 'bg-green-500' : 'bg-gray-400'
                : form.proxyId === 0
                ? 'bg-gray-400'
                : 'bg-yellow-500'
            }`} />
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
          </button>
          {showProxySelector && (
            <div className="absolute top-full right-0 mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-gray-900/50 z-20">
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
                <span className="text-xs font-medium dark:text-gray-200">Proxy</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {/* Global (inherit) */}
                <button
                  onClick={() => { form.setProxyId(null); setShowProxySelector(false); }}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${form.proxyId === null ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium dark:text-gray-200">Global (inherit)</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {form.activeGlobalProxy ? form.activeGlobalProxy.name : 'No proxy active'}
                    </div>
                  </div>
                  {form.proxyId === null && (
                    <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                {/* No Proxy (direct) */}
                <button
                  onClick={() => { form.setProxyId(0); setShowProxySelector(false); }}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${form.proxyId === 0 ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium dark:text-gray-200">No Proxy (direct)</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Bypass global proxy</div>
                  </div>
                  {form.proxyId === 0 && (
                    <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                {/* Proxy list */}
                {form.proxies.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { form.setProxyId(p.id); setShowProxySelector(false); }}
                    className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${form.proxyId === p.id ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                  >
                    <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium dark:text-gray-200">{p.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.url}</div>
                    </div>
                    {form.proxyId === p.id && (
                      <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Environment Variables Popup */}
        <div className="relative" ref={envVarsRef}>
          <button
            onClick={() => setShowEnvVars(!showEnvVars)}
            className={`h-full px-3 py-2 border rounded-md flex items-center gap-1 ${
              form.activeEnv ? 'border-green-300 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-900/30' : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
            title={form.activeEnv ? `Environment: ${form.activeEnv.name}` : 'No active environment'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            <span className="text-xs">{'{{}}'}</span>
          </button>
          {showEnvVars && (
            <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-gray-900/50 z-20">
              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium dark:text-gray-200">
                    {form.activeEnv ? form.activeEnv.name : 'No Environment'}
                  </span>
                  {form.activeEnv && (
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Active
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {Object.keys(form.envVariables).length > 0 ? (
                  <div className="p-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 px-1">Click to copy variable syntax</p>
                    {Object.entries(form.envVariables).map(([key, value]) => (
                      <button
                        key={key}
                        onClick={() => {
                          navigator.clipboard.writeText(`{{${key}}}`);
                          setShowEnvVars(false);
                        }}
                        className="w-full px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center justify-between gap-2"
                      >
                        <code className="text-xs text-blue-600 dark:text-blue-400">{`{{${key}}}`}</code>
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-32">{value}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400">
                    {form.activeEnv ? 'No variables defined' : 'Select an environment to use variables'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {form.method === 'WS' && ws ? (
          <>
            {/* WS Status */}
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              <span className={`w-2 h-2 rounded-full ${ws.status === 'connected' ? 'bg-green-500' : ws.status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-gray-400'}`} />
              {ws.status === 'connected' ? 'Connected' : ws.status === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </div>
            {/* Connect/Disconnect */}
            <button
              onClick={() => {
                if (ws.status === 'connected' || ws.status === 'connecting') {
                  ws.disconnect();
                } else {
                  const headersObj: Record<string, string> = {};
                  let subprotocols: string[] = [];
                  form.headerItems.forEach(({ key, value, enabled }) => {
                    if (key.trim() && enabled) {
                      if (key.toLowerCase() === 'sec-websocket-protocol') {
                        subprotocols = value.split(',').map(s => s.trim()).filter(Boolean);
                      } else {
                        headersObj[key] = value;
                      }
                    }
                  });
                  ws.connect(form.url, JSON.stringify(headersObj), form.proxyId, request?.id, subprotocols);
                }
              }}
              className={`px-4 py-2 text-xs font-medium rounded-md text-white ${
                ws.status === 'connected' || ws.status === 'connecting'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {ws.status === 'connected' || ws.status === 'connecting' ? 'Disconnect' : 'Connect'}
            </button>
          </>
        ) : isExecuting ? (
          <button
            onClick={handleCancel}
            className="px-6 py-2 text-xs bg-red-600 text-white font-medium rounded-md hover:bg-red-700"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleExecute}
            className="px-6 py-2 text-xs bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
          >
            Send
          </button>
        )}
        {!form.isFromHistory && (
          <button
            onClick={form.handleSave}
            disabled={form.updateRequest.isPending}
            className="px-6 py-2 text-xs bg-gray-600 text-white font-medium rounded-md hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600"
          >
            Save
          </button>
        )}
      </div>

      {/* Tabs */}
      <TabNav
        tabs={form.method === 'WS' ? [
          { key: 'headers', label: 'Headers', badge: form.validHeadersCount },
        ] : [
          { key: 'params', label: 'Params', badge: form.validParamsCount },
          { key: 'headers', label: 'Headers', badge: form.validHeadersCount },
          { key: 'cookies', label: 'Cookies', badge: form.validCookiesCount },
          { key: 'body', label: 'Body', dot: form.hasBodyContent },
          { key: 'scripts', label: 'Scripts', dot: form.hasScriptsContent },
        ]}
        activeTab={form.method === 'WS' ? 'headers' : activeTab}
        onTabChange={key => setActiveTab(key as Tab)}
        className="px-4 shrink-0"
      />

      {/* Tab Content */}
      <div className="p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'params' && form.method !== 'WS' && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <KeyValueEditor
              items={form.paramItems}
              onChange={items => form.handleParamChange(items.map(i => ({ ...i, enabled: i.enabled ?? true })))}
              showEnabled
              keyPlaceholder="Parameter name"
              valuePlaceholder="Value"
              addLabel="+ Add Parameter"
            />
          </div>
        )}

        {(activeTab === 'headers' || form.method === 'WS') && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <KeyValueEditor
              items={form.headerItems}
              onChange={items => form.setHeaderItems(items.map(i => ({ ...i, enabled: i.enabled ?? true })))}
              showEnabled
              keyPlaceholder="Header name"
              valuePlaceholder="Value"
              addLabel="+ Add Header"
              suggestions={COMMON_HEADERS}
            />
          </div>
        )}

        {activeTab === 'cookies' && form.method !== 'WS' && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <KeyValueEditor
              items={form.cookieItems}
              onChange={items => form.setCookieItems(items.map(i => ({ ...i, enabled: i.enabled ?? true })))}
              showEnabled
              keyPlaceholder="Cookie name"
              valuePlaceholder="Value"
              addLabel="+ Add Cookie"
            />
          </div>
        )}

        {activeTab === 'body' && form.method !== 'WS' && (
          <div className="flex-1 flex flex-col min-h-0 gap-2">
            <div className="flex gap-4 text-xs shrink-0">
              {['none', 'json', 'text', 'xml', 'form-urlencoded', 'formdata', 'graphql'].map(type => (
                <label key={type} className="flex items-center gap-1 dark:text-gray-200">
                  <input
                    type="radio"
                    name="bodyType"
                    checked={form.bodyType === type}
                    onChange={() => form.setBodyType(type)}
                  />
                  {type === 'formdata' ? 'multipart' : type}
                </label>
              ))}
            </div>
            {form.bodyType === 'graphql' && (
              <div className="flex-1 flex flex-col min-h-0 gap-3">
                <div className="flex-1 flex flex-col min-h-0">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1 shrink-0">Query</label>
                  <div className="flex-1 min-h-0 relative">
                    <div className="absolute inset-0">
                      <CodeEditor
                        value={form.body}
                        onChange={form.setBody}
                        language="graphql"
                        placeholder="{ health }"
                        height="100%"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex flex-col min-h-0">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1 shrink-0">Variables (JSON)</label>
                  <div className="flex-1 min-h-0 relative">
                    <div className="absolute inset-0">
                      <CodeEditor
                        value={form.graphqlVariables}
                        onChange={form.setGraphqlVariables}
                        language="json"
                        placeholder='{ "id": "123" }'
                        height="100%"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {form.bodyType === 'form-urlencoded' && (
              <div className="flex-1 overflow-y-auto min-h-0">
                <KeyValueEditor
                  items={form.formItems}
                  onChange={items => form.setFormItems(items.map(i => ({ ...i, enabled: i.enabled ?? true })))}
                  showEnabled
                  keyPlaceholder="Field name"
                  valuePlaceholder="Value"
                  addLabel="+ Add Field"
                />
              </div>
            )}
            {form.bodyType === 'formdata' && (
              <div className="flex-1 overflow-y-auto min-h-0">
              <FormDataEditor
                items={form.formDataItems}
                onChange={form.setFormDataItems}
                onFileUpload={async (index, file) => {
                  form.setFormDataItems(prev => {
                    const next = [...prev];
                    next[index] = { ...next[index], file, value: file.name };
                    return next;
                  });
                  try {
                    const uploaded = await uploadFile(file);
                    form.setFormDataItems(prev => {
                      const next = [...prev];
                      next[index] = { ...next[index], file: undefined, fileId: uploaded.id, fileSize: uploaded.size, value: uploaded.originalName };
                      return next;
                    });
                  } catch {
                    // Upload failed, keep the local File object as fallback
                  }
                }}
                onFileRemove={async (_index, fileId) => {
                  try { await deleteFile(fileId); } catch { /* ignore */ }
                }}
              />
              </div>
            )}
            {form.bodyType !== 'none' && form.bodyType !== 'graphql' && form.bodyType !== 'form-urlencoded' && form.bodyType !== 'formdata' && (
              <div className="flex-1 min-h-0 relative">
                <div className="absolute inset-0">
                  <CodeEditor
                    value={form.body}
                    onChange={form.setBody}
                    language={form.bodyType === 'json' ? 'json' : form.bodyType === 'xml' ? 'xml' : undefined}
                    placeholder={form.bodyType === 'json' ? '{\n  "key": "value"\n}' : form.bodyType === 'xml' ? '<root>\n  <item>value</item>\n</root>' : 'Request body'}
                    height="100%"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'scripts' && form.method !== 'WS' && (
          <div className="flex-1 flex flex-col min-h-0 gap-2">
            <ScriptEditor
              preScript={form.preScript}
              postScript={form.postScript}
              preScriptMode={form.preScriptMode}
              postScriptMode={form.postScriptMode}
              onPreScriptChange={v => { form.setPreScript(v); form.setPreScriptDiagnostics([]); }}
              onPostScriptChange={v => { form.setPostScript(v); form.setPostScriptDiagnostics([]); }}
              onPreScriptModeChange={form.setPreScriptMode}
              onPostScriptModeChange={form.setPostScriptMode}
              activeTab={scriptTab}
              onTabChange={setScriptTab}
              preScriptDiagnostics={form.preScriptDiagnostics}
              postScriptDiagnostics={form.postScriptDiagnostics}
            />
          </div>
        )}
      </div>
    </div>
  );
}
