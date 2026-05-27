import { useState } from 'react';
import { useUpdateRequest, useRequest } from '../../api/requests';
import { useEnvironments } from '../../api/environments';
import { useProxies } from '../../api/proxies';
import type { Request } from '../../types';
import type { FormDataItem, ScriptDiagnostic } from '../ui';
import {
  type ScriptMode,
  detectScriptMode, normalizeBodyType, parseHeaders,
  serializeHeaderItems, parseFormBody, buildFormBody,
  parseFormDataBody, serializeFormDataItems,
  buildGraphqlBody, parseGraphqlBody,
} from '../shared';

export function useRequestForm(
  request: Request | null,
  onUpdate: (request: Request) => void,
) {
  const [name, setName] = useState('');
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [bodyType, setBodyType] = useState('none');

  const [headerItems, setHeaderItems] = useState<Array<{ key: string; value: string; enabled: boolean }>>([]);
  const [paramItems, setParamItems] = useState<Array<{ key: string; value: string; enabled: boolean }>>([]);
  const [formItems, setFormItems] = useState<Array<{ key: string; value: string; enabled: boolean }>>([]);
  const [formDataItems, setFormDataItems] = useState<FormDataItem[]>([]);
  const [cookieItems, setCookieItems] = useState<Array<{ key: string; value: string; enabled: boolean }>>([]);
  const [graphqlVariables, setGraphqlVariables] = useState('');
  const [proxyId, setProxyId] = useState<number | null>(null);

  const [preScript, setPreScript] = useState('');
  const [postScript, setPostScript] = useState('');
  const [preScriptMode, setPreScriptMode] = useState<ScriptMode>('javascript');
  const [postScriptMode, setPostScriptMode] = useState<ScriptMode>('javascript');
  const [preScriptDiagnostics, setPreScriptDiagnostics] = useState<ScriptDiagnostic[]>([]);
  const [postScriptDiagnostics, setPostScriptDiagnostics] = useState<ScriptDiagnostic[]>([]);

  const updateRequest = useUpdateRequest();
  const { data: environments = [] } = useEnvironments();
  const { data: proxies = [] } = useProxies();

  const isFromHistory = request?.id === 0;
  const { data: fullRequestData } = useRequest(request?.id || 0);

  const activeEnv = environments.find(e => e.isActive);
  const envVariables = (() => {
    if (!activeEnv?.variables) return {};
    try {
      return JSON.parse(activeEnv.variables) as Record<string, string>;
    } catch {
      return {};
    }
  })();

  const activeGlobalProxy = proxies.find(p => p.isActive);

  // Parse query params from URL
  const parseParamsFromUrl = (urlString: string) => {
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
  };

  // Render-time sync with full request data
  const [syncedRequestId, setSyncedRequestId] = useState<number | null>(null);

  if (fullRequestData && fullRequestData.id !== syncedRequestId && fullRequestData.id !== 0) {
    setSyncedRequestId(fullRequestData.id);
    setName(fullRequestData.name);
    setMethod(fullRequestData.method);
    setUrl(fullRequestData.url);
    setBodyType(normalizeBodyType(fullRequestData.bodyType || 'none'));

    if (fullRequestData.bodyType === 'graphql' && fullRequestData.body) {
      const gql = parseGraphqlBody(fullRequestData.body);
      setBody(gql.query);
      setGraphqlVariables(gql.variables);
    } else {
      setBody(fullRequestData.body || '');
      setGraphqlVariables('');
    }

    setFormItems(fullRequestData.bodyType === 'form' || fullRequestData.bodyType === 'form-urlencoded' ? parseFormBody(fullRequestData.body || '') : []);
    setFormDataItems(fullRequestData.bodyType === 'formdata' && fullRequestData.body ? parseFormDataBody(fullRequestData.body) : []);
    setHeaderItems(parseHeaders(fullRequestData.headers || '{}'));
    setCookieItems(parseHeaders(fullRequestData.cookies || '{}'));
    parseParamsFromUrl(fullRequestData.url);
    setProxyId(fullRequestData.proxyId ?? null);
    setPreScript(fullRequestData.preScript || '');
    setPostScript(fullRequestData.postScript || '');
    setPreScriptDiagnostics([]);
    setPostScriptDiagnostics([]);
    setPreScriptMode(detectScriptMode(fullRequestData.preScript || ''));
    setPostScriptMode(detectScriptMode(fullRequestData.postScript || ''));
  }

  // Sync from history-loaded synthetic request (id=0)
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
    setFormDataItems(request.bodyType === 'formdata' && request.body ? parseFormDataBody(request.body) : []);
    setHeaderItems(parseHeaders(request.headers || '{}'));
    setCookieItems(parseHeaders(request.cookies || '{}'));
    parseParamsFromUrl(request.url);
    setProxyId(null);
  }

  // Build URL from base + enabled params
  const buildUrlWithParams = (baseUrl: string, params: Array<{ key: string; value: string; enabled: boolean }>) => {
    const base = baseUrl.split('?')[0];
    const enabledParams = params.filter(p => p.enabled && p.key.trim());
    if (enabledParams.length === 0) return base;
    const queryString = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    return `${base}?${queryString}`;
  };

  const handleParamChange = (newParams: Array<{ key: string; value: string; enabled: boolean }>) => {
    setParamItems(newParams);
    const newUrl = buildUrlWithParams(url, newParams);
    setUrl(newUrl);
  };

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);
    parseParamsFromUrl(newUrl);
  };

  const getCookiesJsonForSave = () => serializeHeaderItems(cookieItems);
  const getHeadersJsonForSave = () => serializeHeaderItems(headerItems);
  const buildGraphqlBodyForSave = () => buildGraphqlBody(body, graphqlVariables);

  const handleSave = () => {
    if (request) {
      const headersJson = getHeadersJsonForSave();
      const cookiesJson = getCookiesJsonForSave();
      const collectionId = fullRequestData?.collectionId ?? request.collectionId;

      const bodyToSave = bodyType === 'graphql'
        ? buildGraphqlBodyForSave()
        : bodyType === 'form-urlencoded'
        ? buildFormBody(formItems)
        : bodyType === 'formdata'
        ? serializeFormDataItems(formDataItems)
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
          collectionId,
          proxyId: proxyId === null ? -1 : proxyId,
          preScript,
          postScript,
        },
      }, {
        onSuccess: (data) => {
          onUpdate(data);
        },
      });
    }
  };

  const handleImportCookies = (imported: Array<{ key: string; value: string; enabled: boolean }>) => {
    setCookieItems(prev => {
      const existing = new Map(prev.filter(c => c.key.trim()).map(c => [c.key, c]));
      for (const c of imported) {
        existing.set(c.key, c);
      }
      return Array.from(existing.values());
    });
  };

  // Computed values
  const validParamsCount = paramItems.filter(p => p.key.trim() && p.enabled).length;

  const validHeadersCount = headerItems.filter(h => h.key.trim() && h.enabled).length;

  const validCookiesCount = cookieItems.filter(c => c.key.trim() && c.enabled).length;

  const hasBodyContent = (() => {
    if (bodyType === 'none') return false;
    if (bodyType === 'form-urlencoded') return formItems.some(i => i.key.trim());
    if (bodyType === 'formdata') return formDataItems.some(i => i.key.trim());
    return body.trim().length > 0;
  })();

  const hasScriptsContent = preScript.trim().length > 0 || postScript.trim().length > 0;

  const hasChanges = (() => {
    if (!fullRequestData || isFromHistory) return false;

    const savedBodyType = normalizeBodyType(fullRequestData.bodyType || 'none');

    const currentBody = bodyType === 'graphql'
      ? buildGraphqlBodyForSave()
      : bodyType === 'form-urlencoded'
      ? buildFormBody(formItems)
      : bodyType === 'formdata'
      ? serializeFormDataItems(formDataItems)
      : body;

    return (
      name !== fullRequestData.name ||
      method !== fullRequestData.method ||
      url !== fullRequestData.url ||
      bodyType !== savedBodyType ||
      currentBody !== (fullRequestData.body || '') ||
      getHeadersJsonForSave() !== (fullRequestData.headers || '{}') ||
      getCookiesJsonForSave() !== (fullRequestData.cookies || '{}') ||
      (proxyId ?? null) !== (fullRequestData.proxyId ?? null) ||
      preScript !== (fullRequestData.preScript || '') ||
      postScript !== (fullRequestData.postScript || '')
    );
  })();

  return {
    // Form state
    name, setName,
    method, setMethod,
    url, setUrl,
    body, setBody,
    bodyType, setBodyType,
    headerItems, setHeaderItems,
    paramItems, setParamItems,
    formItems, setFormItems,
    formDataItems, setFormDataItems,
    cookieItems, setCookieItems,
    graphqlVariables, setGraphqlVariables,
    proxyId, setProxyId,
    preScript, setPreScript,
    postScript, setPostScript,
    preScriptMode, setPreScriptMode,
    postScriptMode, setPostScriptMode,
    preScriptDiagnostics, setPreScriptDiagnostics,
    postScriptDiagnostics, setPostScriptDiagnostics,

    // Helpers
    handleParamChange,
    handleUrlChange,
    handleSave,
    handleImportCookies,
    buildGraphqlBodyForSave,

    // Data & computed
    fullRequestData,
    environments,
    proxies,
    activeEnv,
    envVariables,
    activeGlobalProxy,
    isFromHistory,
    updateRequest,
    validParamsCount,
    validHeadersCount,
    validCookiesCount,
    hasBodyContent,
    hasScriptsContent,
    hasChanges,
  };
}
