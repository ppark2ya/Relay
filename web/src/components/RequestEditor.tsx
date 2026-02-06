import { useState, useEffect, useMemo } from 'react';
import { useUpdateRequest, useExecuteRequest } from '../hooks/useApi';
import type { Request, ExecuteResult } from '../types';

interface RequestEditorProps {
  request: Request | null;
  onExecute: (result: ExecuteResult) => void;
  onUpdate: (request: Request) => void;
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-500',
  POST: 'bg-yellow-500',
  PUT: 'bg-blue-500',
  DELETE: 'bg-red-500',
  PATCH: 'bg-purple-500',
  HEAD: 'bg-gray-500',
  OPTIONS: 'bg-gray-500',
};

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

  const [headerItems, setHeaderItems] = useState<Array<{ key: string; value: string }>>([]);
  const [paramItems, setParamItems] = useState<Array<{ key: string; value: string }>>([]);

  const updateRequest = useUpdateRequest();
  const executeRequest = useExecuteRequest();

  // Sync form state with request prop
  useEffect(() => {
    if (request) {
      setName(request.name);
      setMethod(request.method);
      setUrl(request.url);
      setBody(request.body || '');
      setBodyType(request.bodyType || 'none');

      // Parse headers
      try {
        const parsed = JSON.parse(request.headers || '{}');
        setHeaderItems(Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) })));
      } catch {
        setHeaderItems([]);
      }

      // Parse params from URL
      parseParamsFromUrl(request.url);
    }
  }, [request?.id]);

  // Parse query params from URL
  const parseParamsFromUrl = (urlString: string) => {
    try {
      const urlObj = new URL(urlString);
      const params: Array<{ key: string; value: string }> = [];
      urlObj.searchParams.forEach((value, key) => {
        params.push({ key, value });
      });
      setParamItems(params);
    } catch {
      setParamItems([]);
    }
  };

  // Build URL from base + params
  const buildUrlWithParams = (baseUrl: string, params: Array<{ key: string; value: string }>) => {
    try {
      const urlObj = new URL(baseUrl.split('?')[0]);
      params.forEach(({ key, value }) => {
        if (key.trim()) {
          urlObj.searchParams.set(key, value);
        }
      });
      return urlObj.toString();
    } catch {
      // If URL is invalid, just append params manually
      const validParams = params.filter(p => p.key.trim());
      if (validParams.length === 0) return baseUrl.split('?')[0];
      const queryString = validParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
      return `${baseUrl.split('?')[0]}?${queryString}`;
    }
  };

  // Update URL when params change
  const handleParamChange = (newParams: Array<{ key: string; value: string }>) => {
    setParamItems(newParams);
    const newUrl = buildUrlWithParams(url, newParams);
    setUrl(newUrl);
  };

  // Update params when URL changes
  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    parseParamsFromUrl(newUrl);
  };

  const getHeadersJson = () => {
    const obj: Record<string, string> = {};
    headerItems.forEach(({ key, value }) => {
      if (key.trim()) obj[key] = value;
    });
    return JSON.stringify(obj, null, 2);
  };

  const handleSave = () => {
    if (request) {
      const headersJson = getHeadersJson();
      updateRequest.mutate({
        id: request.id,
        data: {
          ...request,
          name,
          method,
          url,
          headers: headersJson,
          body,
          bodyType,
          collectionId: request.collectionId, // Preserve collectionId
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

    const headersJson = getHeadersJson();

    // Execute with current form values (without needing to save)
    executeRequest.mutate({
      id: request.id,
      overrides: {
        method,
        url,
        headers: headersJson,
        body,
        bodyType,
      },
    }, {
      onSuccess: (result) => onExecute(result),
    });
  };

  // Count params with non-empty keys
  const validParamsCount = useMemo(() =>
    paramItems.filter(p => p.key.trim()).length,
    [paramItems]
  );

  if (!request) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p>Select a request from the sidebar or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-gray-200 bg-white">
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
        <div className="relative">
          <button
            onClick={() => setShowMethodDropdown(!showMethodDropdown)}
            className={`px-3 py-2 rounded-l-md text-white font-medium ${METHOD_COLORS[method]} flex items-center gap-1`}
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
                  className={`block w-full px-4 py-2 text-left hover:bg-gray-100 ${method === m ? 'bg-gray-100' : ''}`}
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
          placeholder="Enter URL or paste text"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleExecute}
          disabled={executeRequest.isPending}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {executeRequest.isPending ? 'Sending...' : 'Send'}
        </button>
        <button
          onClick={handleSave}
          disabled={updateRequest.isPending}
          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Save
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-4">
        {(['params', 'headers', 'body'] as const).map(tab => (
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
            {tab === 'params' && validParamsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-200 rounded-full">{validParamsCount}</span>
            )}
            {tab === 'headers' && headerItems.filter(h => h.key.trim()).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-200 rounded-full">{headerItems.filter(h => h.key.trim()).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-48 overflow-y-auto">
        {activeTab === 'params' && (
          <div className="space-y-2">
            {paramItems.map((item, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={item.key}
                  onChange={e => {
                    const newItems = [...paramItems];
                    newItems[index] = { ...newItems[index], key: e.target.value };
                    handleParamChange(newItems);
                  }}
                  placeholder="Parameter name"
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <input
                  type="text"
                  value={item.value}
                  onChange={e => {
                    const newItems = [...paramItems];
                    newItems[index] = { ...newItems[index], value: e.target.value };
                    handleParamChange(newItems);
                  }}
                  placeholder="Value"
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <button
                  onClick={() => {
                    handleParamChange(paramItems.filter((_, i) => i !== index));
                  }}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={() => setParamItems([...paramItems, { key: '', value: '' }])}
              className="text-sm text-blue-600 hover:underline"
            >
              + Add Parameter
            </button>
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="space-y-2">
            {headerItems.map((item, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  value={item.key}
                  onChange={e => {
                    const newItems = [...headerItems];
                    newItems[index] = { ...newItems[index], key: e.target.value };
                    setHeaderItems(newItems);
                  }}
                  placeholder="Header name"
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <input
                  type="text"
                  value={item.value}
                  onChange={e => {
                    const newItems = [...headerItems];
                    newItems[index] = { ...newItems[index], value: e.target.value };
                    setHeaderItems(newItems);
                  }}
                  placeholder="Value"
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <button
                  onClick={() => {
                    setHeaderItems(headerItems.filter((_, i) => i !== index));
                  }}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={() => setHeaderItems([...headerItems, { key: '', value: '' }])}
              className="text-sm text-blue-600 hover:underline"
            >
              + Add Header
            </button>
          </div>
        )}

        {activeTab === 'body' && (
          <div className="space-y-2">
            <div className="flex gap-4 text-sm">
              {['none', 'json', 'form', 'raw'].map(type => (
                <label key={type} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="bodyType"
                    checked={bodyType === type}
                    onChange={() => setBodyType(type)}
                  />
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </label>
              ))}
            </div>
            {bodyType !== 'none' && (
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Request body'}
                className="w-full h-32 px-3 py-2 border border-gray-300 rounded font-mono text-sm"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
