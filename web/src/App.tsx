import { useState, useCallback, useRef, useMemo, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './components/Sidebar';
import { RequestEditor } from './components/RequestEditor';
import { ResponseViewer } from './components/ResponseViewer';
import { FlowEditor } from './components/FlowEditor';
import { WebSocketPanel } from './components/WebSocketPanel';
import { Header } from './components/Header';
import { useNavigation } from './hooks/useNavigation';
import { useRequest } from './api/requests';
import { useFlow } from './api/flows';
import { useWebSocket } from './hooks/useWebSocket';
import { WorkspaceContext, useWorkspaceProvider } from './hooks/useWorkspace';
import { GlobalSearch } from './components/GlobalSearch';
import type { Request, ExecuteResult, ScriptResult, Flow, History } from './types';

const queryClient = new QueryClient();

function AppContent() {
  // Local state for selections made via sidebar/history clicks
  const [localRequest, setLocalRequest] = useState<Request | null>(null);
  const [localFlow, setLocalFlow] = useState<Flow | null>(null);
  const [response, setResponse] = useState<ExecuteResult | null>(null);
  const [scriptResults, setScriptResults] = useState<{ pre?: ScriptResult; post?: ScriptResult } | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentMethod, setCurrentMethod] = useState('GET');
  const cancelRef = useRef<(() => void) | null>(null);
  const cancelCallbacks = useMemo(() => ({
    onCancelReady: (fn: (() => void) | null) => { cancelRef.current = fn; },
    cancel: () => cancelRef.current?.(),
  }), []);

  const [showGlobalSearch, setShowGlobalSearch] = useState(false);

  // Horizontal panel resize (Request / Response split)
  const MIN_PANEL = 25;
  const MAX_PANEL = 75;
  const [requestPanelWidth, setRequestPanelWidth] = useState(() => {
    const saved = localStorage.getItem('requestPanelWidth');
    if (saved) {
      const n = parseFloat(saved);
      if (n >= MIN_PANEL && n <= MAX_PANEL) return n;
    }
    return 50;
  });
  const isPanelResizing = useRef(false);

  useEffect(() => {
    localStorage.setItem('requestPanelWidth', String(requestPanelWidth));
  }, [requestPanelWidth]);

  const handlePanelResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    isPanelResizing.current = true;
    const container = (e.target as HTMLElement).parentElement!;

    const onMouseMove = (ev: globalThis.MouseEvent) => {
      if (!isPanelResizing.current) return;
      const rect = container.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setRequestPanelWidth(Math.min(MAX_PANEL, Math.max(MIN_PANEL, pct)));
    };

    const onMouseUp = () => {
      isPanelResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowGlobalSearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const importCookiesRef = useRef<((cookies: Array<{ key: string; value: string; enabled: boolean }>) => void) | null>(null);

  // WebSocket controls
  const ws = useWebSocket();

  // Clear local overrides when browser back/forward changes the URL
  const handleUrlChange = useCallback(() => {
    setLocalRequest(null);
    setLocalFlow(null);
    setResponse(null);
  }, []);

  const { view, resourceId, navigateToRequest, navigateToFlow, navigateToView } = useNavigation(handleUrlChange);

  // Fetch resource from URL for deep-link / direct navigation
  const requestQueryId = view === 'requests' && resourceId ? resourceId : 0;
  const flowQueryId = view === 'flows' && resourceId ? resourceId : 0;
  const { data: urlRequest } = useRequest(requestQueryId);
  const { data: urlFlow } = useFlow(flowQueryId);

  // Derive selected items: local override takes priority (for history items with id=0),
  // then URL-fetched data, then null
  const selectedRequest = localRequest ?? (requestQueryId ? urlRequest ?? null : null);
  const selectedFlow = localFlow ?? (flowQueryId ? urlFlow ?? null : null);

  const handleMethodChange = useCallback((method: string) => {
    setCurrentMethod(method);
    // Disconnect WS when switching away from WS method
    if (method !== 'WS' && ws.status !== 'disconnected') {
      ws.disconnect();
    }
  }, [ws]);

  const handleScriptResults = useCallback((pre: ScriptResult | undefined, post: ScriptResult | undefined) => {
    if (pre || post) {
      setScriptResults({ pre, post });
    } else {
      setScriptResults(null);
    }
  }, []);

  const handleSelectRequest = useCallback((request: Request | null) => {
    setLocalRequest(request);
    setResponse(null);
    setScriptResults(null);
    // Disconnect WS when switching requests
    if (ws.status !== 'disconnected') {
      ws.disconnect();
    }
    if (request && request.id > 0) {
      navigateToRequest(request.id);
    } else if (!request) {
      navigateToView('requests');
    }
  }, [navigateToRequest, navigateToView, ws]);

  const handleSelectFlow = useCallback((flow: Flow | null) => {
    setLocalFlow(flow);
    if (flow) {
      navigateToFlow(flow.id);
    } else {
      navigateToView('flows');
    }
  }, [navigateToFlow, navigateToView]);

  const handleViewChange = useCallback((newView: 'requests' | 'flows' | 'history') => {
    navigateToView(newView);
  }, [navigateToView]);

  const handleSelectHistory = useCallback((item: History) => {
    // Infer bodyType from Content-Type header
    let bodyType = 'none';
    try {
      const headers = JSON.parse(item.requestHeaders || '{}');
      const contentType = Object.entries(headers).find(
        ([k]) => k.toLowerCase() === 'content-type'
      )?.[1] as string | undefined;
      if (contentType) {
        if (contentType.includes('json')) bodyType = 'json';
        else if (contentType.includes('xml')) bodyType = 'xml';
        else if (contentType.includes('form-urlencoded')) bodyType = 'form-urlencoded';
        else if (contentType.includes('form')) bodyType = 'form-urlencoded';
        else bodyType = 'text';
      } else if (item.requestBody) {
        bodyType = 'text';
      }
    } catch {
      if (item.requestBody) bodyType = 'text';
    }

    // Always use id=0 for history-loaded requests so useRequest won't fetch from DB
    const syntheticRequest: Request = {
      id: 0,
      name: `${item.method} ${item.url}`,
      method: item.method,
      url: item.url,
      headers: item.requestHeaders || '{}',
      body: item.requestBody || '',
      bodyType,
      sortOrder: 0,
    };

    // Build response from history data
    let responseHeaders: Record<string, string> = {};
    try {
      responseHeaders = JSON.parse(item.responseHeaders || '{}');
    } catch { /* ignore */ }

    const historyResponse: ExecuteResult = {
      statusCode: item.statusCode || 0,
      headers: responseHeaders,
      body: item.isBinary ? '' : (item.responseBody || ''),
      bodyBase64: item.isBinary ? (item.responseBody || '') : undefined,
      bodySize: item.bodySize || 0,
      isBinary: item.isBinary,
      durationMs: item.durationMs || 0,
      error: item.error,
      resolvedUrl: item.url,
      resolvedHeaders: {},
    };

    setLocalRequest(syntheticRequest);
    setResponse(historyResponse);
    // Navigate to requests view but don't put history item in URL
    navigateToView('requests');
  }, [navigateToView]);

  const isWSMode = currentMethod === 'WS';

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          view={view}
          onViewChange={handleViewChange}
          onSelectRequest={handleSelectRequest}
          onSelectFlow={handleSelectFlow}
          onSelectHistory={handleSelectHistory}
          selectedRequestId={selectedRequest?.id}
          selectedFlowId={selectedFlow?.id}
        />
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className={`flex-1 flex flex-row overflow-hidden ${view === 'requests' ? '' : 'hidden'}`}>
            {/* Left Panel: Request Editor */}
            <div className="flex flex-col min-h-0" style={{ width: `${requestPanelWidth}%` }}>
              <RequestEditor
                request={selectedRequest}
                onExecute={setResponse}
                onUpdate={setLocalRequest}
                onExecutingChange={setIsExecuting}
                onCancelReady={cancelCallbacks.onCancelReady}
                onMethodChange={handleMethodChange}
                onImportCookiesReady={(fn) => { importCookiesRef.current = fn; }}
                onScriptResults={handleScriptResults}
                ws={ws}
              />
            </div>

            {/* Resize Handle */}
            <div
              onMouseDown={handlePanelResizeStart}
              className="w-1.5 shrink-0 cursor-col-resize bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 active:bg-blue-500 transition-colors"
            />

            {/* Right Panel: Response / WebSocket */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              {isWSMode ? (
                <WebSocketPanel
                  messages={ws.messages}
                  isConnected={ws.status === 'connected'}
                  onSend={ws.send}
                  onClear={ws.clearMessages}
                />
              ) : (
                <>
                  {scriptResults && (scriptResults.pre || scriptResults.post) && (
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center gap-4 text-xs">
                      {scriptResults.pre && (
                        <span className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-600 dark:text-gray-300">Pre-Script:</span>
                          {scriptResults.pre.assertionsPassed > 0 && (
                            <span className="text-green-600 dark:text-green-400">{scriptResults.pre.assertionsPassed} passed</span>
                          )}
                          {scriptResults.pre.assertionsFailed > 0 && (
                            <span className="text-red-600 dark:text-red-400">{scriptResults.pre.assertionsFailed} failed</span>
                          )}
                          {scriptResults.pre.assertionsPassed === 0 && scriptResults.pre.assertionsFailed === 0 && (
                            <span className={scriptResults.pre.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                              {scriptResults.pre.success ? 'OK' : 'Error'}
                            </span>
                          )}
                          {scriptResults.pre.errors?.map((e, i) => (
                            <span key={i} className="text-red-600 dark:text-red-400">{e}</span>
                          ))}
                        </span>
                      )}
                      {scriptResults.post && (
                        <span className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-600 dark:text-gray-300">Post-Script:</span>
                          {scriptResults.post.assertionsPassed > 0 && (
                            <span className="text-green-600 dark:text-green-400">{scriptResults.post.assertionsPassed} passed</span>
                          )}
                          {scriptResults.post.assertionsFailed > 0 && (
                            <span className="text-red-600 dark:text-red-400">{scriptResults.post.assertionsFailed} failed</span>
                          )}
                          {scriptResults.post.assertionsPassed === 0 && scriptResults.post.assertionsFailed === 0 && (
                            <span className={scriptResults.post.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                              {scriptResults.post.success ? 'OK' : 'Error'}
                            </span>
                          )}
                          {scriptResults.post.errors?.map((e, i) => (
                            <span key={i} className="text-red-600 dark:text-red-400">{e}</span>
                          ))}
                        </span>
                      )}
                    </div>
                  )}
                  <ResponseViewer
                    response={response}
                    isLoading={isExecuting}
                    onCancel={cancelCallbacks.cancel}
                    onImportCookies={(cookies) => importCookiesRef.current?.(cookies)}
                  />
                </>
              )}
            </div>
          </div>
          <div className={`flex-1 flex flex-col overflow-hidden ${view === 'flows' ? '' : 'hidden'}`}>
            <FlowEditor
              flow={selectedFlow}
              onUpdate={setLocalFlow}
            />
          </div>
          {view === 'history' && (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <div className="text-center text-gray-500 dark:text-gray-400">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>Select a history item from the sidebar to view details</p>
              </div>
            </div>
          )}
        </main>
      </div>
      <GlobalSearch
        isOpen={showGlobalSearch}
        onClose={() => setShowGlobalSearch(false)}
        onSelectRequest={handleSelectRequest}
        onSelectFlow={handleSelectFlow}
        onSelectHistory={handleSelectHistory}
      />
    </div>
  );
}

function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspaceProvider();
  return (
    <WorkspaceContext.Provider value={workspace}>
      {children}
    </WorkspaceContext.Provider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>
        <AppContent />
      </WorkspaceProvider>
    </QueryClientProvider>
  );
}

export default App;
