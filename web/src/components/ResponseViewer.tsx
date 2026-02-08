import { useState, useEffect, useCallback } from 'react';
import type { ExecuteResult } from '../types';
import { EmptyState, TabNav, CodeEditor } from './ui';

interface ResponseViewerProps {
  response: ExecuteResult | null;
  isLoading?: boolean;
  onCancel?: () => void;
  onImportCookies?: (cookies: Array<{ key: string; value: string; enabled: boolean }>) => void;
}

type Tab = 'body' | 'headers';

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getFilename(response: ExecuteResult): string {
  // Try Content-Disposition header
  const disposition = response.headers?.['Content-Disposition'] || response.headers?.['content-disposition'] || '';
  if (disposition) {
    const match = disposition.match(/filename[*]?=(?:UTF-8''|"?)([^";]+)/i);
    if (match) return decodeURIComponent(match[1].replace(/"/g, ''));
  }

  // Try URL path
  try {
    const urlPath = new URL(response.resolvedUrl).pathname;
    const lastSegment = urlPath.split('/').pop();
    if (lastSegment && lastSegment.includes('.')) return lastSegment;
  } catch { /* ignore */ }

  // Fallback based on Content-Type
  const ct = (response.headers?.['Content-Type'] || response.headers?.['content-type'] || '').split(';')[0].trim();
  const extMap: Record<string, string> = {
    'application/json': 'response.json',
    'application/xml': 'response.xml',
    'text/html': 'response.html',
    'text/css': 'response.css',
    'text/javascript': 'response.js',
    'application/pdf': 'response.pdf',
    'image/png': 'image.png',
    'image/jpeg': 'image.jpg',
    'image/gif': 'image.gif',
    'image/webp': 'image.webp',
    'image/svg+xml': 'image.svg',
    'application/zip': 'download.zip',
    'application/gzip': 'download.gz',
    'application/octet-stream': 'download.bin',
  };
  return extMap[ct] || 'response';
}

function downloadResponse(response: ExecuteResult) {
  let blob: Blob;
  const ct = response.headers?.['Content-Type'] || response.headers?.['content-type'] || 'application/octet-stream';

  if (response.isBinary && response.bodyBase64) {
    const binary = atob(response.bodyBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    blob = new Blob([bytes], { type: ct });
  } else {
    blob = new Blob([response.body], { type: ct });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getFilename(response);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getStatusColor(code: number): string {
  if (code >= 200 && code < 300) return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30';
  if (code >= 300 && code < 400) return 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30';
  if (code >= 400 && code < 500) return 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30';
  return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30';
}

function ElapsedTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [start] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((Date.now() - start) / 1000);
    }, 100);
    return () => clearInterval(interval);
  }, [start]);

  return <span className="text-sm text-gray-400 dark:text-gray-500 tabular-nums">{elapsed.toFixed(1)}s</span>;
}

function parseSetCookies(setCookieHeaders: string[]): Array<{ key: string; value: string; enabled: boolean }> {
  return setCookieHeaders.map(header => {
    // "name=value; Path=/; HttpOnly; ..." → extract "name" and "value"
    const nameValuePart = header.split(';')[0];
    const eqIndex = nameValuePart.indexOf('=');
    if (eqIndex === -1) return { key: nameValuePart.trim(), value: '', enabled: true };
    return {
      key: nameValuePart.slice(0, eqIndex).trim(),
      value: nameValuePart.slice(eqIndex + 1).trim(),
      enabled: true,
    };
  });
}

function isImageContentType(ct: string): boolean {
  return ct.startsWith('image/') && !ct.includes('svg');
}

export function ResponseViewer({ response, isLoading, onCancel, onImportCookies }: ResponseViewerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('body');

  const handleDownload = useCallback(() => {
    if (response) downloadResponse(response);
  }, [response]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
        <svg className="w-10 h-10 text-blue-500 animate-pulse mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Sending request...</p>
        <ElapsedTimer />
        <button
          onClick={onCancel}
          className="mt-4 px-4 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border border-red-300 dark:border-red-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
        >
          Cancel Request
        </button>
      </div>
    );
  }

  if (!response) {
    return (
      <EmptyState
        className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700"
        icon={
          <svg className="w-12 h-12 mx-auto mb-2 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        }
        message="Response will appear here"
      />
    );
  }

  if (response.error) {
    return (
      <div className="flex-1 bg-gray-50 dark:bg-gray-900 p-4">
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-medium mb-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Error
          </div>
          <p className="text-red-800 dark:text-red-300">{response.error}</p>
          {response.resolvedUrl && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Requested URL: {response.resolvedUrl}
            </p>
          )}
        </div>
      </div>
    );
  }

  const contentType = response.headers?.['Content-Type'] || response.headers?.['content-type'] || '';
  const isJson = contentType.includes('json');
  const isImage = isImageContentType(contentType);
  const bodySize = response.bodySize || (response.body ? response.body.length : 0);

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 overflow-hidden">
      {/* Status Bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <span className={`px-2 py-0.5 rounded font-medium ${getStatusColor(response.statusCode)}`}>
          {response.statusCode}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {response.durationMs}ms
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {formatSize(bodySize)}
        </span>
        {isJson && (
          <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded">JSON</span>
        )}
        <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex-1">
          {response.resolvedUrl}
        </span>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          title="Save response to file"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Save
        </button>
      </div>

      {/* Tabs */}
      <TabNav
        tabs={[
          { key: 'body', label: 'Body' },
          { key: 'headers', label: 'Headers' },
        ]}
        activeTab={activeTab}
        onTabChange={key => setActiveTab(key as Tab)}
        className="px-4"
      />

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'body' && (() => {
          // Binary + image: inline preview
          if (response.isBinary && isImage && response.bodyBase64) {
            return (
              <div className="flex flex-col items-center gap-4">
                <img
                  src={`data:${contentType};base64,${response.bodyBase64}`}
                  alt="Response preview"
                  className="max-w-full max-h-[60vh] object-contain rounded border border-gray-200 dark:border-gray-700"
                />
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                  Download Image ({formatSize(bodySize)})
                </button>
              </div>
            );
          }

          // Binary + non-image: placeholder with download button
          if (response.isBinary) {
            return (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
                <svg className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p className="text-lg font-medium mb-1">Binary Response</p>
                <p className="text-sm mb-4">{formatSize(bodySize)} &middot; {contentType || 'unknown type'}</p>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                >
                  Download File
                </button>
              </div>
            );
          }

          // Text: existing behavior
          if (isJson) {
            return (
              <CodeEditor
                value={formatJson(response.body)}
                language="json"
                readOnly
                height="100%"
              />
            );
          }
          return (
            <pre className="text-sm font-mono whitespace-pre-wrap break-words dark:text-gray-200">
              {response.body}
            </pre>
          );
        })()}

        {activeTab === 'headers' && (() => {
          const setCookieValues = response.multiValueHeaders?.['Set-Cookie'] || [];
          return (
            <div className="space-y-1">
              {Object.entries(response.headers || {}).map(([key, value]) => {
                // For Set-Cookie, show all values from multiValueHeaders
                if (key === 'Set-Cookie' && setCookieValues.length > 0) {
                  return setCookieValues.map((val, i) => (
                    <div key={`${key}-${i}`} className="flex gap-4 text-sm">
                      <span className="font-medium text-gray-700 dark:text-gray-200 min-w-[200px]">{key}</span>
                      <span className="text-gray-600 dark:text-gray-300">{val}</span>
                    </div>
                  ));
                }
                return (
                  <div key={key} className="flex gap-4 text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-200 min-w-[200px]">{key}</span>
                    <span className="text-gray-600 dark:text-gray-300">{value}</span>
                  </div>
                );
              })}
              {setCookieValues.length > 0 && onImportCookies && (
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700 mt-3">
                  <button
                    onClick={() => onImportCookies(parseSetCookies(setCookieValues))}
                    className="px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                  >
                    Import {setCookieValues.length} cookie{setCookieValues.length > 1 ? 's' : ''}
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
