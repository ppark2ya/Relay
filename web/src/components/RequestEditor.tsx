import { useState, useMemo, useCallback } from 'react';
import { useUpdateRequest, useExecuteRequest, useExecuteAdhoc, useEnvironments, useRequest } from '../hooks/useApi';
import { useClickOutside } from '../hooks/useClickOutside';
import type { Request, ExecuteResult } from '../types';
import { TabNav, KeyValueEditor, EmptyState, METHOD_BG_COLORS, METHOD_TEXT_COLORS, CodeEditor } from './ui';

interface RequestEditorProps {
  request: Request | null;
  onExecute: (result: ExecuteResult) => void;
  onUpdate: (request: Request) => void;
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

const COMMON_HEADERS = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Content-Type',
  'Cookie',
  'Host',
  'If-Modified-Since',
  'If-None-Match',
  'Origin',
  'Referer',
  'User-Agent',
  'X-Requested-With',
  'X-Forwarded-For',
  'X-API-Key',
];

type Tab = 'params' | 'headers' | 'body';

export function RequestEditor({ request, onExecute, onUpdate }: RequestEditorProps) {
  const [name, setName] = useState('');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [bodyType, setBodyType] = useState('none');
  const [activeTab, setActiveTab] = useState<Tab>('params');
  const [showMethodDropdown, setShowMethodDropdown] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);

  const [headerItems, setHeaderItems] = useState<Array<{ key: string; value: string; enabled: boolean }>>([]);
  const [paramItems, setParamItems] = useState<Array<{ key: string; value: string; enabled: boolean }>>([]);
  const [graphqlVariables, setGraphqlVariables] = useState('');

  const updateRequest = useUpdateRequest();
  const executeRequest = useExecuteRequest();
  const executeAdhoc = useExecuteAdhoc();
  const { data: environments = [] } = useEnvironments();

  const isFromHistory = request?.id === 0;

  // Fetch full request data (collection API only returns basic info)
  const { data: fullRequestData } = useRequest(request?.id || 0);

  const activeEnv = environments.find(e => e.isActive);
  const envVariables = useMemo(() => {
    if (!activeEnv?.variables) return {};
    try {
      return JSON.parse(activeEnv.variables) as Record<string, string>;
    } catch {
      return {};
    }
  }, [activeEnv?.variables]);

  const [showEnvVars, setShowEnvVars] = useState(false);

  const closeMethodDropdown = useCallback(() => setShowMethodDropdown(false), []);
  const methodDropdownRef = useClickOutside<HTMLDivElement>(closeMethodDropdown, showMethodDropdown);

  const closeEnvVars = useCallback(() => setShowEnvVars(false), []);
  const envVarsRef = useClickOutside<HTMLDivElement>(closeEnvVars, showEnvVars);

  // Parse query params from URL
  const parseParamsFromUrl = useCallback((urlString: string) => {
    try {
      const urlObj = new URL(urlString);
      const params: Array<{ key: string; value: string; enabled: boolean }> = [];
      urlObj.searchParams.forEach((value, key) => {
        params.push({ key, value, enabled: true });
      });
      setParamItems(params);
    } catch {
      setParamItems([]);
    }
  }, []);

  // Parse headers from JSON string
  const parseHeaders = useCallback((headersJson: string) => {
    try {
      const parsed = JSON.parse(headersJson || '{}');
      return Object.entries(parsed).map(([key, val]) => {
        if (typeof val === 'object' && val !== null && 'value' in val) {
          const obj = val as { value: string; enabled: boolean };
          return { key, value: obj.value, enabled: obj.enabled ?? true };
        }
        return { key, value: String(val), enabled: true };
      });
    } catch {
      return [];
    }
  }, []);

  // Sync form state with full request data (React recommended render-time pattern)
  const [syncedRequestId, setSyncedRequestId] = useState<number | null>(null);

  if (fullRequestData && fullRequestData.id !== syncedRequestId && fullRequestData.id !== 0) {
    setSyncedRequestId(fullRequestData.id);
    setName(fullRequestData.name);
    setMethod(fullRequestData.method);
    setUrl(fullRequestData.url);
    setBodyType(fullRequestData.bodyType || 'none');

    if (fullRequestData.bodyType === 'graphql' && fullRequestData.body) {
      try {
        const parsed = JSON.parse(fullRequestData.body);
        setBody(parsed.query || '');
        setGraphqlVariables(parsed.variables ? JSON.stringify(parsed.variables, null, 2) : '');
      } catch {
        setBody(fullRequestData.body || '');
        setGraphqlVariables('');
      }
    } else {
      setBody(fullRequestData.body || '');
      setGraphqlVariables('');
    }

    setHeaderItems(parseHeaders(fullRequestData.headers));
    parseParamsFromUrl(fullRequestData.url);
  }

  // Sync form state from history-loaded synthetic request (id=0)
  const [syncedHistoryUrl, setSyncedHistoryUrl] = useState<string | null>(null);

  if (request && request.id === 0 && request.url !== syncedHistoryUrl) {
    setSyncedHistoryUrl(request.url);
    setSyncedRequestId(null);
    setName(request.name);
    setMethod(request.method);
    setUrl(request.url);
    setBodyType(request.bodyType || 'none');
    setBody(request.body || '');
    setGraphqlVariables('');
    setHeaderItems(parseHeaders(request.headers));
    parseParamsFromUrl(request.url);
  }

  // Build URL from base + enabled params only
  const buildUrlWithParams = (baseUrl: string, params: Array<{ key: string; value: string; enabled: boolean }>) => {
    const enabledParams = params.filter(p => p.enabled && p.key.trim());
    try {
      const urlObj = new URL(baseUrl.split('?')[0]);
      enabledParams.forEach(({ key, value }) => {
        urlObj.searchParams.set(key, value);
      });
      return urlObj.toString();
    } catch {
      // If URL is invalid, just append params manually
      if (enabledParams.length === 0) return baseUrl.split('?')[0];
      const queryString = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
      return `${baseUrl.split('?')[0]}?${queryString}`;
    }
  };

  // Update URL when params change
  const handleParamChange = (newParams: Array<{ key: string; value: string; enabled: boolean }>) => {
    setParamItems(newParams);
    const newUrl = buildUrlWithParams(url, newParams);
    setUrl(newUrl);
  };

  // Update params when URL changes
  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    parseParamsFromUrl(newUrl);
  };

  // Get headers JSON for saving (includes enabled state)
  const getHeadersJsonForSave = () => {
    const obj: Record<string, { value: string; enabled: boolean }> = {};
    headerItems.forEach(({ key, value, enabled }) => {
      if (key.trim()) obj[key] = { value, enabled };
    });
    return JSON.stringify(obj, null, 2);
  };

  // Build body for GraphQL type
  const buildGraphqlBody = () => {
    const graphqlPayload: { query: string; variables?: Record<string, unknown> } = {
      query: body,
    };
    if (graphqlVariables.trim()) {
      try {
        graphqlPayload.variables = JSON.parse(graphqlVariables);
      } catch {
        // Invalid JSON, ignore variables
      }
    }
    return JSON.stringify(graphqlPayload);
  };

  const handleSave = () => {
    if (request) {
      const headersJson = getHeadersJsonForSave();
      const collectionId = fullRequestData?.collectionId ?? request.collectionId;

      // For graphql type, store the combined JSON body
      const bodyToSave = bodyType === 'graphql' ? buildGraphqlBody() : body;

      updateRequest.mutate({
        id: request.id,
        data: {
          name,
          method,
          url,
          headers: headersJson,
          body: bodyToSave,
          bodyType,
          collectionId, // Preserve collectionId
        },
      }, {
        onSuccess: (data) => {
          onUpdate(data);
        },
      });
    }
  };

  const handleExecute = () => {
    if (!request) return;

    // Build headers - for graphql, ensure Content-Type is set
    const headersObj: Record<string, string> = {};
    headerItems.forEach(({ key, value, enabled }) => {
      if (key.trim() && enabled) headersObj[key] = value;
    });

    // For GraphQL, auto-add Content-Type if not present
    if (bodyType === 'graphql' && !headersObj['Content-Type']) {
      headersObj['Content-Type'] = 'application/json';
    }

    const headersJson = JSON.stringify(headersObj, null, 2);

    // Build body - for graphql, wrap in proper format
    const bodyToSend = bodyType === 'graphql' ? buildGraphqlBody() : body;

    if (isFromHistory) {
      // Ad-hoc execution for history-loaded requests
      executeAdhoc.mutate({
        method,
        url,
        headers: headersJson,
        body: bodyToSend,
      }, {
        onSuccess: (result) => onExecute(result),
      });
    } else {
      // Execute with current form values (without needing to save)
      executeRequest.mutate({
        id: request.id,
        overrides: {
          method,
          url,
          headers: headersJson,
          body: bodyToSend,
          bodyType: bodyType === 'graphql' ? 'json' : bodyType, // Send as json to backend
        },
      }, {
        onSuccess: (result) => onExecute(result),
      });
    }
  };

  // Count enabled params with non-empty keys
  const validParamsCount = useMemo(() =>
    paramItems.filter(p => p.key.trim() && p.enabled).length,
    [paramItems]
  );

  // Count enabled headers with non-empty keys
  const validHeadersCount = useMemo(() =>
    headerItems.filter(h => h.key.trim() && h.enabled).length,
    [headerItems]
  );

  if (!request) {
    return (
      <EmptyState
        className="bg-gray-50"
        icon={
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
        message="Select a request from the sidebar or create a new one"
      />
    );
  }

  const isExecuting = executeRequest.isPending || executeAdhoc.isPending;

  return (
    <div className="border-b border-gray-200 bg-white">
      {/* History banner */}
      {isFromHistory && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-700 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Loaded from history. Edit and re-send, or select a saved request.
        </div>
      )}

      {/* Request Name */}
      <div className="px-4 pt-3 pb-1">
        {isEditingName ? (
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={() => setIsEditingName(false)}
            onKeyDown={e => {
              if (e.key === 'Enter') setIsEditingName(false);
              if (e.key === 'Escape') {
                setName(request.name);
                setIsEditingName(false);
              }
            }}
            className="text-lg font-medium px-2 py-1 border border-blue-500 rounded focus:outline-none"
            autoFocus
          />
        ) : (
          <h2
            onClick={() => setIsEditingName(true)}
            className="text-lg font-medium cursor-pointer hover:text-blue-600"
            title="Click to edit name"
          >
            {name}
          </h2>
        )}
      </div>

      {/* URL Bar */}
      <div className="p-4 pt-2 flex gap-2">
        <div className="relative" ref={methodDropdownRef}>
          <button
            onClick={() => setShowMethodDropdown(!showMethodDropdown)}
            className={`px-3 py-2 rounded-l-md text-white font-medium ${METHOD_BG_COLORS[method]} flex items-center gap-1`}
          >
            {method}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showMethodDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10">
              {METHODS.map(m => (
                <button
                  key={m}
                  onClick={() => { setMethod(m); setShowMethodDropdown(false); }}
                  className={`block w-full px-4 py-2 text-left hover:bg-gray-100 font-medium ${METHOD_TEXT_COLORS[m]} ${method === m ? 'bg-gray-100' : ''}`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="text"
          value={url}
          onChange={e => handleUrlChange(e.target.value)}
          placeholder="Enter URL or paste text (use {{variable}} for env vars)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        />
        {/* Environment Variables Popup */}
        <div className="relative" ref={envVarsRef}>
          <button
            onClick={() => setShowEnvVars(!showEnvVars)}
            className={`px-3 py-2 border rounded-md flex items-center gap-1 ${
              activeEnv ? 'border-green-300 text-green-700 hover:bg-green-50' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
            }`}
            title={activeEnv ? `Environment: ${activeEnv.name}` : 'No active environment'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            <span className="text-xs">{'{{}}'}</span>
          </button>
          {showEnvVars && (
            <div className="absolute top-full right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
              <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {activeEnv ? activeEnv.name : 'No Environment'}
                  </span>
                  {activeEnv && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Active
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {Object.keys(envVariables).length > 0 ? (
                  <div className="p-2">
                    <p className="text-xs text-gray-500 mb-2 px-1">Click to copy variable syntax</p>
                    {Object.entries(envVariables).map(([key, value]) => (
                      <button
                        key={key}
                        onClick={() => {
                          navigator.clipboard.writeText(`{{${key}}}`);
                          setShowEnvVars(false);
                        }}
                        className="w-full px-2 py-1.5 text-left hover:bg-gray-100 rounded flex items-center justify-between gap-2"
                      >
                        <code className="text-xs text-blue-600">{`{{${key}}}`}</code>
                        <span className="text-xs text-gray-500 truncate max-w-32">{value}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-gray-500">
                    {activeEnv ? 'No variables defined' : 'Select an environment to use variables'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={handleExecute}
          disabled={isExecuting}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isExecuting ? 'Sending...' : 'Send'}
        </button>
        {!isFromHistory && (
          <button
            onClick={handleSave}
            disabled={updateRequest.isPending}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Save
          </button>
        )}
      </div>

      {/* Tabs */}
      <TabNav
        tabs={[
          { key: 'params', label: 'Params', badge: validParamsCount },
          { key: 'headers', label: 'Headers', badge: validHeadersCount },
          { key: 'body', label: 'Body' },
        ]}
        activeTab={activeTab}
        onTabChange={key => setActiveTab(key as Tab)}
        className="px-4"
      />

      {/* Tab Content */}
      <div className="p-4 max-h-48 overflow-y-auto">
        {activeTab === 'params' && (
          <KeyValueEditor
            items={paramItems}
            onChange={items => handleParamChange(items.map(i => ({ ...i, enabled: i.enabled ?? true })))}
            showEnabled
            keyPlaceholder="Parameter name"
            valuePlaceholder="Value"
            addLabel="+ Add Parameter"
          />
        )}

        {activeTab === 'headers' && (
          <KeyValueEditor
            items={headerItems}
            onChange={items => setHeaderItems(items.map(i => ({ ...i, enabled: i.enabled ?? true })))}
            showEnabled
            keyPlaceholder="Header name"
            valuePlaceholder="Value"
            addLabel="+ Add Header"
            suggestions={COMMON_HEADERS}
          />
        )}

        {activeTab === 'body' && (
          <div className="space-y-2">
            <div className="flex gap-4 text-sm">
              {['none', 'json', 'form', 'raw', 'graphql'].map(type => (
                <label key={type} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="bodyType"
                    checked={bodyType === type}
                    onChange={() => setBodyType(type)}
                  />
                  {type === 'graphql' ? 'GraphQL' : type.charAt(0).toUpperCase() + type.slice(1)}
                </label>
              ))}
            </div>
            {bodyType === 'graphql' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Query</label>
                  <CodeEditor
                    value={body}
                    onChange={setBody}
                    language="graphql"
                    placeholder="{ health }"
                    height="96px"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Variables (JSON)</label>
                  <CodeEditor
                    value={graphqlVariables}
                    onChange={setGraphqlVariables}
                    language="json"
                    placeholder='{ "id": "123" }'
                    height="80px"
                  />
                </div>
              </div>
            )}
            {bodyType !== 'none' && bodyType !== 'graphql' && (
              <CodeEditor
                value={body}
                onChange={setBody}
                language={bodyType === 'json' ? 'json' : undefined}
                placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Request body'}
                height="128px"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
