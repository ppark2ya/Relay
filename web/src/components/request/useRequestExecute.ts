import { useCallback, useRef } from 'react';
import { useExecuteRequest, useExecuteAdhoc, useExecuteRequestWithFiles, useExecuteAdhocWithFiles } from '../../api/requests';
import type { Request, ExecuteResult, ScriptResult } from '../../types';
import type { FormDataItem, ScriptDiagnostic } from '../ui';
import { serializeFormDataItems, buildFormBody, buildGraphqlBody } from '../shared';

interface ExecuteFormState {
  method: string;
  url: string;
  bodyType: string;
  body: string;
  headerItems: Array<{ key: string; value: string; enabled: boolean }>;
  cookieItems: Array<{ key: string; value: string; enabled: boolean }>;
  formItems: Array<{ key: string; value: string; enabled: boolean }>;
  formDataItems: FormDataItem[];
  graphqlVariables: string;
  proxyId: number | null;
}

interface UseRequestExecuteOptions {
  request: Request | null;
  formState: ExecuteFormState;
  isFromHistory: boolean;
  onExecute: (result: ExecuteResult) => void;
  onExecutingChange?: (executing: boolean) => void;
  onScriptResults?: (pre: ScriptResult | undefined, post: ScriptResult | undefined) => void;
  setPreScriptDiagnostics: (d: ScriptDiagnostic[]) => void;
  setPostScriptDiagnostics: (d: ScriptDiagnostic[]) => void;
}

export function useRequestExecute({
  request,
  formState,
  isFromHistory,
  onExecute,
  onExecutingChange,
  onScriptResults,
  setPreScriptDiagnostics,
  setPostScriptDiagnostics,
}: UseRequestExecuteOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);

  const executeRequest = useExecuteRequest();
  const executeAdhoc = useExecuteAdhoc();
  const executeRequestWithFiles = useExecuteRequestWithFiles();
  const executeAdhocWithFiles = useExecuteAdhocWithFiles();

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const handleExecute = () => {
    if (!request) return;

    const { method, url, bodyType, body, headerItems, cookieItems, formItems, formDataItems, graphqlVariables, proxyId } = formState;

    // Abort any in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    onExecutingChange?.(true);

    // Build headers
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

    const buildGraphqlBodyForSave = () => buildGraphqlBody(body, graphqlVariables);
    const bodyToSend = bodyType === 'graphql' ? buildGraphqlBodyForSave() : bodyType === 'form-urlencoded' ? buildFormBody(formItems) : body;

    const onSettled = () => {
      onExecutingChange?.(false);
      abortControllerRef.current = null;
    };

    const handleSavedResult = (result: ExecuteResult & { preScriptResult?: ScriptResult; postScriptResult?: ScriptResult }) => {
      onExecute(result);
      onScriptResults?.(result.preScriptResult, result.postScriptResult);

      const toDiags = (sr?: ScriptResult): ScriptDiagnostic[] =>
        (sr?.errorDetails || [])
          .filter(d => d.line && d.line > 0)
          .map(d => ({ line: d.line!, message: d.message, severity: 'error' as const }));
      setPreScriptDiagnostics(toDiags(result.preScriptResult));
      setPostScriptDiagnostics(toDiags(result.postScriptResult));
    };

    const proxyIdForExec = proxyId === null ? -1 : proxyId;

    // Use multipart upload for formdata body type
    if (bodyType === 'formdata') {
      const enabledItems = formDataItems.filter(i => i.enabled);
      const hasRuntimeFiles = enabledItems.some(i => i.type === 'file' && i.file);
      const allFilesHaveIds = enabledItems
        .filter(i => i.type === 'file')
        .every(i => i.fileId);

      if (!hasRuntimeFiles && allFilesHaveIds && enabledItems.length > 0) {
        const formDataBody = serializeFormDataItems(formDataItems);
        if (isFromHistory) {
          executeAdhoc.mutate({
            data: { method, url, headers: headersJson, body: formDataBody, proxyId: proxyIdForExec },
            signal: controller.signal,
          }, {
            onSuccess: (result) => onExecute(result),
            onSettled,
          });
        } else {
          executeRequest.mutate({
            id: request.id,
            overrides: { method, url, headers: headersJson, body: formDataBody, bodyType: 'formdata', proxyId: proxyIdForExec },
            signal: controller.signal,
          }, {
            onSuccess: handleSavedResult,
            onSettled,
          });
        }
        return;
      }

      if (hasRuntimeFiles || enabledItems.length > 0) {
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
            onSuccess: handleSavedResult,
            onSettled,
          });
        }
        return;
      }
    }

    if (isFromHistory) {
      executeAdhoc.mutate({
        data: { method, url, headers: headersJson, body: bodyToSend, proxyId: proxyIdForExec },
        signal: controller.signal,
      }, {
        onSuccess: (result) => onExecute(result),
        onSettled,
      });
    } else {
      executeRequest.mutate({
        id: request.id,
        overrides: {
          method,
          url,
          headers: headersJson,
          body: bodyToSend,
          bodyType: bodyType === 'graphql' ? 'json' : bodyType,
          proxyId: proxyIdForExec,
        },
        signal: controller.signal,
      }, {
        onSuccess: handleSavedResult,
        onSettled,
      });
    }
  };

  const isExecuting = executeRequest.isPending || executeAdhoc.isPending || executeRequestWithFiles.isPending || executeAdhocWithFiles.isPending;

  return {
    handleExecute,
    handleCancel,
    isExecuting,
  };
}
