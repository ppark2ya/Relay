import { useState } from 'react';
import type { ExecuteResult } from '../types';

interface ResponseViewerProps {
  response: ExecuteResult | null;
}

type Tab = 'body' | 'headers';

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function getStatusColor(code: number): string {
  if (code >= 200 && code < 300) return 'text-green-600 bg-green-50';
  if (code >= 300 && code < 400) return 'text-blue-600 bg-blue-50';
  if (code >= 400 && code < 500) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

export function ResponseViewer({ response }: ResponseViewerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('body');

  if (!response) {
    return (
      <div className="flex-1 bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>Response will appear here</p>
        </div>
      </div>
    );
  }

  if (response.error) {
    return (
      <div className="flex-1 bg-gray-50 p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-600 font-medium mb-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Error
          </div>
          <p className="text-red-800">{response.error}</p>
          {response.resolvedUrl && (
            <p className="text-sm text-gray-500 mt-2">
              Requested URL: {response.resolvedUrl}
            </p>
          )}
        </div>
      </div>
    );
  }

  const contentType = response.headers?.['Content-Type'] || response.headers?.['content-type'] || '';
  const isJson = contentType.includes('json');

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden">
      {/* Status Bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 bg-gray-50">
        <span className={`px-2 py-0.5 rounded font-medium ${getStatusColor(response.statusCode)}`}>
          {response.statusCode}
        </span>
        <span className="text-sm text-gray-500">
          {response.durationMs}ms
        </span>
        {isJson && (
          <span className="text-xs px-2 py-0.5 bg-gray-200 rounded">JSON</span>
        )}
        <span className="text-xs text-gray-400 truncate flex-1">
          {response.resolvedUrl}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-4">
        {(['body', 'headers'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === tab
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'body' && (
          <pre className="text-sm font-mono whitespace-pre-wrap break-words">
            {isJson ? formatJson(response.body) : response.body}
          </pre>
        )}

        {activeTab === 'headers' && (
          <div className="space-y-1">
            {Object.entries(response.headers || {}).map(([key, value]) => (
              <div key={key} className="flex gap-4 text-sm">
                <span className="font-medium text-gray-700 min-w-[200px]">{key}</span>
                <span className="text-gray-600">{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
