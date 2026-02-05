import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './components/Sidebar';
import { RequestEditor } from './components/RequestEditor';
import { ResponseViewer } from './components/ResponseViewer';
import { Header } from './components/Header';
import type { Request, ExecuteResult } from './types';

const queryClient = new QueryClient();

function AppContent() {
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [response, setResponse] = useState<ExecuteResult | null>(null);
  const [view, setView] = useState<'requests' | 'flows' | 'history'>('requests');

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          view={view}
          onViewChange={setView}
          onSelectRequest={setSelectedRequest}
          selectedRequestId={selectedRequest?.id}
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
            <div className="p-4">
              <h2 className="text-xl font-semibold mb-4">Flows</h2>
              <p className="text-gray-500">Flow 기능은 사이드바에서 플로우를 선택하세요.</p>
            </div>
          )}
          {view === 'history' && (
            <div className="p-4">
              <h2 className="text-xl font-semibold mb-4">History</h2>
              <p className="text-gray-500">History 기능은 사이드바에서 확인할 수 있습니다.</p>
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
