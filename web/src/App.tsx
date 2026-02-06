import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './components/Sidebar';
import { RequestEditor } from './components/RequestEditor';
import { ResponseViewer } from './components/ResponseViewer';
import { FlowEditor } from './components/FlowEditor';
import { Header } from './components/Header';
import type { Request, ExecuteResult, Flow, History } from './types';

const queryClient = new QueryClient();

function AppContent() {
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [response, setResponse] = useState<ExecuteResult | null>(null);
  const [view, setView] = useState<'requests' | 'flows' | 'history'>('requests');

  const handleSelectHistory = (item: History) => {
    // Infer bodyType from Content-Type header
    let bodyType = 'none';
    try {
      const headers = JSON.parse(item.requestHeaders || '{}');
      const contentType = Object.entries(headers).find(
        ([k]) => k.toLowerCase() === 'content-type'
      )?.[1] as string | undefined;
      if (contentType) {
        if (contentType.includes('json')) bodyType = 'json';
        else if (contentType.includes('form')) bodyType = 'form';
        else bodyType = 'raw';
      } else if (item.requestBody) {
        bodyType = 'raw';
      }
    } catch {
      if (item.requestBody) bodyType = 'raw';
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
    };

    // Build response from history data
    let responseHeaders: Record<string, string> = {};
    try {
      responseHeaders = JSON.parse(item.responseHeaders || '{}');
    } catch { /* ignore */ }

    const historyResponse: ExecuteResult = {
      statusCode: item.statusCode || 0,
      headers: responseHeaders,
      body: item.responseBody || '',
      durationMs: item.durationMs || 0,
      error: item.error,
      resolvedUrl: item.url,
      resolvedHeaders: {},
    };

    setSelectedRequest(syntheticRequest);
    setResponse(historyResponse);
    setView('requests');
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          view={view}
          onViewChange={setView}
          onSelectRequest={setSelectedRequest}
          onSelectFlow={setSelectedFlow}
          onSelectHistory={handleSelectHistory}
          selectedRequestId={selectedRequest?.id}
          selectedFlowId={selectedFlow?.id}
        />
        <main className="flex-1 flex flex-col overflow-hidden">
          {view === 'requests' && (
            <>
              <RequestEditor
                request={selectedRequest}
                onExecute={setResponse}
                onUpdate={setSelectedRequest}
              />
              <ResponseViewer response={response} />
            </>
          )}
          {view === 'flows' && (
            <FlowEditor
              flow={selectedFlow}
              onUpdate={setSelectedFlow}
            />
          )}
          {view === 'history' && (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>Select a history item from the sidebar to view details</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
