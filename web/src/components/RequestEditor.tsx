import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useUpdateRequest, useExecuteRequest, useExecuteAdhoc, useExecuteRequestWithFiles, useExecuteAdhocWithFiles, useRequest } from '../api/requests';
import { useEnvironments } from '../api/environments';
import { useProxies } from '../api/proxies';
import { useClickOutside } from '../hooks/useClickOutside';
import type { Request, ExecuteResult, WSConnectionStatus } from '../types';
import { TabNav, KeyValueEditor, FormDataEditor, EmptyState, METHOD_BG_COLORS, METHOD_TEXT_COLORS, CodeEditor } from './ui';
import type { FormDataItem } from './ui';

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
  ws?: WSControls;
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'WS'];

/** Normalize legacy body type values to unified types */
function normalizeBodyType(bt: string): string {
  if (bt === 'raw') return 'text';
  if (bt === 'form') return 'form-urlencoded';
  return bt;
}

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

type Tab = 'params' | 'headers' | 'cookies' | 'body';

export function RequestEditor({ request, onExecute, onUpdate, onExecutingChange, onCancelReady, onMethodChange, onImportCookiesReady, ws }: RequestEditorProps) {
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
  const [formItems, setFormItems] = useState<Array<{ key: string; value: string; enabled: boolean }>>([]);
  const [formDataItems, setFormDataItems] = useState<FormDataItem[]>([]);
  const [cookieItems, setCookieItems] = useState<Array<{ key: string; value: string; enabled: boolean }>>([]);
  const [graphqlVariables, setGraphqlVariables] = useState('');
  const [proxyId, setProxyId] = useState<number | null>(null); // null = global inherit, 0 = no proxy, >0 = specific

  const abortControllerRef = useRef<AbortController | null>(null);

  const updateRequest = useUpdateRequest();
  const executeRequest = useExecuteRequest();
  const executeAdhoc = useExecuteAdhoc();
  const executeRequestWithFiles = useExecuteRequestWithFiles();
  const executeAdhocWithFiles = useExecuteAdhocWithFiles();
  const { data: environments = [] } = useEnvironments();
  const { data: proxies = [] } = useProxies();

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  // Expose cancel function to parent
  useEffect(() => {
    onCancelReady?.(handleCancel);
    return () => onCancelReady?.(null);
  }, [onCancelReady, handleCancel]);

  // Expose import cookies function to parent
  const handleImportCookies = useCallback((imported: Array<{ key: string; value: string; enabled: boolean }>) => {
    setCookieItems(prev => {
      const existing = new Map(prev.filter(c => c.key.trim()).map(c => [c.key, c]));
      for (const c of imported) {
        existing.set(c.key, c);
      }
      return Array.from(existing.values());
    });
    setActiveTab('cookies');
  }, []);

  useEffect(() => {
    onImportCookiesReady?.(handleImportCookies);
    return () => onImportCookiesReady?.(null);
  }, [onImportCookiesReady, handleImportCookies]);

  // Notify parent when method changes
  useEffect(() => {
    onMethodChange?.(method);
  }, [method, onMethodChange]);

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
  const [showProxySelector, setShowProxySelector] = useState(false);

  const closeMethodDropdown = useCallback(() => setShowMethodDropdown(false), []);
  const methodDropdownRef = useClickOutside<HTMLDivElement>(closeMethodDropdown, showMethodDropdown);

  const closeEnvVars = useCallback(() => setShowEnvVars(false), []);
  const envVarsRef = useClickOutside<HTMLDivElement>(closeEnvVars, showEnvVars);

  const closeProxySelector = useCallback(() => setShowProxySelector(false), []);
  const proxySelectorRef = useClickOutside<HTMLDivElement>(closeProxySelector, showProxySelector);

  const activeGlobalProxy = proxies.find(p => p.isActive);

  // Parse query params from URL (supports {{variable}} in base URL)
  const parseParamsFromUrl = useCallback((urlString: string) => {
    const qIndex = urlString.indexOf('?');
    if (qIndex === -1 || qIndex === urlString.length - 1) {
      setParamItems([]);
      return;
    }
    const queryString = urlString.slice(qIndex + 1);
    const params: Array<{ key: string; value: string; enabled: boolean }> = [];
    queryString.split('&').forEach(pair => {
      if (!pair) return;
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) {
        params.push({ key: decodeURIComponent(pair), value: '', enabled: true });
      } else {
        params.push({
          key: decodeURIComponent(pair.slice(0, eqIndex)),
          value: decodeURIComponent(pair.slice(eqIndex + 1)),
          enabled: true,
        });
      }
    });
    setParamItems(params);
  }, []);

  // Parse form-urlencoded body string into key-value items
  const parseFormBody = useCallback((bodyStr: string) => {
    if (!bodyStr.trim()) return [];
    return bodyStr.split('&').map(pair => {
      const [k, ...rest] = pair.split('=');
      return {
        key: decodeURIComponent(k || ''),
        value: decodeURIComponent(rest.join('=')),
        enabled: true,
      };
    });
  }, []);

  // Serialize form items to URL-encoded string
  const buildFormBody = useCallback((items: Array<{ key: string; value: string; enabled: boolean }>) => {
    return items
      .filter(i => i.enabled && i.key.trim())
      .map(i => `${encodeURIComponent(i.key)}=${encodeURIComponent(i.value)}`)
      .join('&');
  }, []);

  // Parse cookies from JSON string (same format as headers)
  const parseCookies = useCallback((cookiesJson: string) => {
    try {
      const parsed = JSON.parse(cookiesJson || '{}');
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
    setBodyType(normalizeBodyType(fullRequestData.bodyType || 'none'));

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

    setFormItems(fullRequestData.bodyType === 'form' || fullRequestData.bodyType === 'form-urlencoded' ? parseFormBody(fullRequestData.body || '') : []);
    if (fullRequestData.bodyType === 'formdata' && fullRequestData.body) {
      try {
        const parsed = JSON.parse(fullRequestData.body) as Array<{ key: string; value: string; type: 'text' | 'file'; enabled: boolean }>;
        setFormDataItems(parsed.map(item => ({ ...item, file: undefined })));
      } catch {
        setFormDataItems([]);
      }
    } else {
      setFormDataItems([]);
    }
    setHeaderItems(parseHeaders(fullRequestData.headers || '{}'));
    setCookieItems(parseCookies(fullRequestData.cookies || '{}'));
    parseParamsFromUrl(fullRequestData.url);
    setProxyId(fullRequestData.proxyId ?? null);
  }

  // Sync form state from history-loaded synthetic request (id=0)
  const [syncedHistoryUrl, setSyncedHistoryUrl] = useState<string | null>(null);

  if (request && request.id === 0 && request.url !== syncedHistoryUrl) {
    setSyncedHistoryUrl(request.url);
    setSyncedRequestId(null);
    setName(request.name);
    setMethod(request.method);
    setUrl(request.url);
    setBodyType(normalizeBodyType(request.bodyType || 'none'));
    setBody(request.body || '');
    setGraphqlVariables('');
    setFormItems(request.bodyType === 'form' || request.bodyType === 'form-urlencoded' ? parseFormBody(request.body || '') : []);
    if (request.bodyType === 'formdata' && request.body) {
      try {
        const parsed = JSON.parse(request.body) as Array<{ key: string; value: string; type: 'text' | 'file'; enabled: boolean }>;
        setFormDataItems(parsed.map(item => ({ ...item, file: undefined })));
      } catch {
        setFormDataItems([]);
      }
    } else {
      setFormDataItems([]);
    }
    setHeaderItems(parseHeaders(request.headers || '{}'));
    setCookieItems(parseCookies(request.cookies || '{}'));
    parseParamsFromUrl(request.url);
    setProxyId(null);
  }

  // Build URL from base + enabled params only (supports {{variable}} in base URL)
  const buildUrlWithParams = (baseUrl: string, params: Array<{ key: string; value: string; enabled: boolean }>) => {
    const base = baseUrl.split('?')[0];
    const enabledParams = params.filter(p => p.enabled && p.key.trim());
    if (enabledParams.length === 0) return base;
    const queryString = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    return `${base}?${queryString}`;
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

  // Get cookies JSON for saving (includes enabled state)
  const getCookiesJsonForSave = () => {
    const obj: Record<string, { value: string; enabled: boolean }> = {};
    cookieItems.forEach(({ key, value, enabled }) => {
      if (key.trim()) obj[key] = { value, enabled };
    });
    return JSON.stringify(obj, null, 2);
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
      const cookiesJson = getCookiesJsonForSave();
      const collectionId = fullRequestData?.collectionId ?? request.collectionId;

      // Build body based on type
      const bodyToSave = bodyType === 'graphql'
        ? buildGraphqlBody()
        : bodyType === 'form-urlencoded'
        ? buildFormBody(formItems)
        : bodyType === 'formdata'
        ? JSON.stringify(formDataItems.map(({ key, value, type, enabled }) => ({ key, value, type, enabled })))
        : body;

      updateRequest.mutate({
        id: request.id,
        data: {
          name,
          method,
          url,
          headers: headersJson,
          body: bodyToSave,
          bodyType,
          cookies: cookiesJson,
          collectionId, // Preserve collectionId
          proxyId: proxyId === null ? -1 : proxyId,
        },
      }, {
        onSuccess: (data) => {
          onUpdate(data);
        },
      });
    }
  };

  // Cmd+S / Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (request && !isFromHistory) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [request, isFromHistory, handleSave]);

  const handleExecute = () => {
    if (!request) return;

    // Abort any in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    onExecutingChange?.(true);

    // Build headers - for graphql, ensure Content-Type is set
    const headersObj: Record<string, string> = {};
    headerItems.forEach(({ key, value, enabled }) => {
      if (key.trim() && enabled) headersObj[key] = value;
    });

    // Merge enabled cookies into Cookie header
    const cookiePairs = cookieItems
      .filter(c => c.key.trim() && c.enabled)
      .map(c => `${c.key}=${c.value}`)
      .join('; ');
    if (cookiePairs) {
      const existing = headersObj['Cookie'] || '';
      headersObj['Cookie'] = existing ? `${existing}; ${cookiePairs}` : cookiePairs;
    }

    // Auto-add Content-Type if not present
    if (bodyType === 'graphql' && !headersObj['Content-Type']) {
      headersObj['Content-Type'] = 'application/json';
    }
    if (bodyType === 'form-urlencoded' && !headersObj['Content-Type']) {
      headersObj['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    if (bodyType === 'text' && !headersObj['Content-Type']) {
      headersObj['Content-Type'] = 'text/plain';
    }
    if (bodyType === 'xml' && !headersObj['Content-Type']) {
      headersObj['Content-Type'] = 'application/xml';
    }

    const headersJson = JSON.stringify(headersObj, null, 2);

    // Build body based on type
    const bodyToSend = bodyType === 'graphql' ? buildGraphqlBody() : bodyType === 'form-urlencoded' ? buildFormBody(formItems) : body;

    const onSettled = () => {
      onExecutingChange?.(false);
      abortControllerRef.current = null;
    };

    // Map proxyId: null→-1 (global inherit), 0→0 (no proxy), N→N (specific)
    const proxyIdForExec = proxyId === null ? -1 : proxyId;

    // Use multipart upload for formdata body type
    if (bodyType === 'formdata') {
      const enabledItems = formDataItems.filter(i => i.enabled);
      const hasFiles = enabledItems.some(i => i.type === 'file' && i.file);

      if (hasFiles || enabledItems.length > 0) {
        if (isFromHistory) {
          executeAdhocWithFiles.mutate({
            items: formDataItems,
            overrides: { method, url, headers: headersJson, proxyId: proxyIdForExec },
            signal: controller.signal,
          }, {
            onSuccess: (result) => onExecute(result),
            onSettled,
          });
        } else {
          executeRequestWithFiles.mutate({
            id: request.id,
            items: formDataItems,
            overrides: { method, url, headers: headersJson, bodyType: 'formdata', proxyId: proxyIdForExec },
            signal: controller.signal,
          }, {
            onSuccess: (result) => onExecute(result),
            onSettled,
          });
        }
        return;
      }
    }

    if (isFromHistory) {
      // Ad-hoc execution for history-loaded requests
      executeAdhoc.mutate({
        data: { method, url, headers: headersJson, body: bodyToSend, proxyId: proxyIdForExec },
        signal: controller.signal,
      }, {
        onSuccess: (result) => onExecute(result),
        onSettled,
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
          proxyId: proxyIdForExec,
        },
        signal: controller.signal,
      }, {
        onSuccess: (result) => onExecute(result),
        onSettled,
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

  // Count enabled cookies with non-empty keys
  const validCookiesCount = useMemo(() =>
    cookieItems.filter(c => c.key.trim() && c.enabled).length,
    [cookieItems]
  );

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

  const isExecuting = executeRequest.isPending || executeAdhoc.isPending || executeRequestWithFiles.isPending || executeAdhocWithFiles.isPending;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* History banner */}
      {isFromHistory && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-700 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
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
            className="text-lg font-medium px-2 py-1 border border-blue-500 rounded focus:outline-none dark:bg-gray-700 dark:text-gray-100"
            autoFocus
          />
        ) : (
          <h2
            onClick={() => setIsEditingName(true)}
            className="text-lg font-medium cursor-pointer hover:text-blue-600 dark:text-gray-100"
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
            className={`w-28 px-3 py-2 rounded-l-md text-white font-medium ${METHOD_BG_COLORS[method]} flex items-center justify-between gap-1`}
          >
            {method}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showMethodDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg dark:shadow-gray-900/50 z-10">
              {METHODS.map(m => (
                <button
                  key={m}
                  onClick={() => { setMethod(m); setShowMethodDropdown(false); }}
                  className={`block w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 font-medium ${METHOD_TEXT_COLORS[m]} ${method === m ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
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
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm dark:bg-gray-700 dark:text-gray-100"
        />
        {/* Proxy Selector */}
        <div className="relative" ref={proxySelectorRef}>
          <button
            onClick={() => setShowProxySelector(!showProxySelector)}
            className={`h-full px-3 py-2 border rounded-md flex items-center gap-1.5 text-sm ${
              proxyId === null
                ? activeGlobalProxy
                  ? 'border-green-300 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-900/30'
                  : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                : proxyId === 0
                ? 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                : 'border-yellow-300 text-yellow-700 hover:bg-yellow-50 dark:border-yellow-600 dark:text-yellow-400 dark:hover:bg-yellow-900/30'
            }`}
            title={
              proxyId === null
                ? activeGlobalProxy ? `Global: ${activeGlobalProxy.name}` : 'Global (no proxy active)'
                : proxyId === 0
                ? 'No Proxy (direct)'
                : `Proxy: ${proxies.find(p => p.id === proxyId)?.name || 'Unknown'}`
            }
          >
            <span className={`w-2 h-2 rounded-full ${
              proxyId === null
                ? activeGlobalProxy ? 'bg-green-500' : 'bg-gray-400'
                : proxyId === 0
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
                <span className="text-sm font-medium dark:text-gray-200">Proxy</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {/* Global (inherit) */}
                <button
                  onClick={() => { setProxyId(null); setShowProxySelector(false); }}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${proxyId === null ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium dark:text-gray-200">Global (inherit)</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {activeGlobalProxy ? activeGlobalProxy.name : 'No proxy active'}
                    </div>
                  </div>
                  {proxyId === null && (
                    <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                {/* No Proxy (direct) */}
                <button
                  onClick={() => { setProxyId(0); setShowProxySelector(false); }}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${proxyId === 0 ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium dark:text-gray-200">No Proxy (direct)</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Bypass global proxy</div>
                  </div>
                  {proxyId === 0 && (
                    <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                {/* Proxy list */}
                {proxies.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setProxyId(p.id); setShowProxySelector(false); }}
                    className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${proxyId === p.id ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                  >
                    <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium dark:text-gray-200">{p.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.url}</div>
                    </div>
                    {proxyId === p.id && (
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
              activeEnv ? 'border-green-300 text-green-700 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-900/30' : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
            title={activeEnv ? `Environment: ${activeEnv.name}` : 'No active environment'}
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
                  <span className="text-sm font-medium dark:text-gray-200">
                    {activeEnv ? activeEnv.name : 'No Environment'}
                  </span>
                  {activeEnv && (
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Active
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {Object.keys(envVariables).length > 0 ? (
                  <div className="p-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 px-1">Click to copy variable syntax</p>
                    {Object.entries(envVariables).map(([key, value]) => (
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
                  <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    {activeEnv ? 'No variables defined' : 'Select an environment to use variables'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {method === 'WS' && ws ? (
          <>
            {/* WS Status */}
            <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
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
                  headerItems.forEach(({ key, value, enabled }) => {
                    if (key.trim() && enabled) {
                      if (key.toLowerCase() === 'sec-websocket-protocol') {
                        subprotocols = value.split(',').map(s => s.trim()).filter(Boolean);
                      } else {
                        headersObj[key] = value;
                      }
                    }
                  });
                  ws.connect(url, JSON.stringify(headersObj), proxyId, request?.id, subprotocols);
                }
              }}
              className={`px-4 py-2 font-medium rounded-md text-white ${
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
            className="px-6 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleExecute}
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
          >
            Send
          </button>
        )}
        {!isFromHistory && (
          <button
            onClick={handleSave}
            disabled={updateRequest.isPending}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
          >
            Save
          </button>
        )}
      </div>

      {/* Tabs */}
      <TabNav
        tabs={method === 'WS' ? [
          { key: 'headers', label: 'Headers', badge: validHeadersCount },
        ] : [
          { key: 'params', label: 'Params', badge: validParamsCount },
          { key: 'headers', label: 'Headers', badge: validHeadersCount },
          { key: 'cookies', label: 'Cookies', badge: validCookiesCount },
          { key: 'body', label: 'Body' },
        ]}
        activeTab={method === 'WS' ? 'headers' : activeTab}
        onTabChange={key => setActiveTab(key as Tab)}
        className="px-4"
      />

      {/* Tab Content */}
      <div className="p-4 max-h-48 overflow-y-auto">
        {activeTab === 'params' && method !== 'WS' && (
          <KeyValueEditor
            items={paramItems}
            onChange={items => handleParamChange(items.map(i => ({ ...i, enabled: i.enabled ?? true })))}
            showEnabled
            keyPlaceholder="Parameter name"
            valuePlaceholder="Value"
            addLabel="+ Add Parameter"
          />
        )}

        {(activeTab === 'headers' || method === 'WS') && (
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

        {activeTab === 'cookies' && method !== 'WS' && (
          <KeyValueEditor
            items={cookieItems}
            onChange={items => setCookieItems(items.map(i => ({ ...i, enabled: i.enabled ?? true })))}
            showEnabled
            keyPlaceholder="Cookie name"
            valuePlaceholder="Value"
            addLabel="+ Add Cookie"
          />
        )}

        {activeTab === 'body' && method !== 'WS' && (
          <div className="space-y-2">
            <div className="flex gap-4 text-sm">
              {['none', 'json', 'text', 'xml', 'form-urlencoded', 'formdata', 'graphql'].map(type => (
                <label key={type} className="flex items-center gap-1 dark:text-gray-200">
                  <input
                    type="radio"
                    name="bodyType"
                    checked={bodyType === type}
                    onChange={() => setBodyType(type)}
                  />
                  {type === 'formdata' ? 'multipart' : type}
                </label>
              ))}
            </div>
            {bodyType === 'graphql' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Query</label>
                  <CodeEditor
                    value={body}
                    onChange={setBody}
                    language="graphql"
                    placeholder="{ health }"
                    height="96px"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Variables (JSON)</label>
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
            {bodyType === 'form-urlencoded' && (
              <KeyValueEditor
                items={formItems}
                onChange={items => setFormItems(items.map(i => ({ ...i, enabled: i.enabled ?? true })))}
                showEnabled
                keyPlaceholder="Field name"
                valuePlaceholder="Value"
                addLabel="+ Add Field"
              />
            )}
            {bodyType === 'formdata' && (
              <FormDataEditor
                items={formDataItems}
                onChange={setFormDataItems}
              />
            )}
            {bodyType !== 'none' && bodyType !== 'graphql' && bodyType !== 'form-urlencoded' && bodyType !== 'formdata' && (
              <CodeEditor
                value={body}
                onChange={setBody}
                language={bodyType === 'json' ? 'json' : bodyType === 'xml' ? 'xml' : undefined}
                placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : bodyType === 'xml' ? '<root>\n  <item>value</item>\n</root>' : 'Request body'}
                height="128px"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
