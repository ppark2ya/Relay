import type { FormDataItem } from '../ui';

// ─── Constants ───

export const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
export const METHODS_WITH_WS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'WS'];
export const BODY_TYPES = ['none', 'json', 'text', 'xml', 'form-urlencoded', 'formdata', 'graphql'];

export const COMMON_HEADERS = [
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

// ─── Types ───

export type ScriptMode = 'dsl' | 'javascript';
export type HeadersMode = 'key-value' | 'raw';

export interface KeyValueItem {
  key: string;
  value: string;
  enabled: boolean;
}

// ─── Functions ───

/** Detect if a script is JavaScript (not JSON DSL) */
export function detectScriptMode(script: string): ScriptMode {
  const trimmed = script.trim();
  if (!trimmed) return 'javascript'; // Default for empty
  // JSON DSL starts with {
  return trimmed.startsWith('{') ? 'dsl' : 'javascript';
}

/** Normalize legacy body type values to unified types */
export function normalizeBodyType(bt: string): string {
  if (bt === 'raw') return 'text';
  if (bt === 'form') return 'form-urlencoded';
  return bt;
}

/** Parse headers JSON string into key-value items with enabled state */
export function parseHeaders(headersJson: string): KeyValueItem[] {
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
}

/** Serialize key-value items to JSON headers string (with enabled state) */
export function serializeHeaderItems(items: KeyValueItem[]): string {
  const obj: Record<string, { value: string; enabled: boolean }> = {};
  items.forEach(({ key, value, enabled }) => {
    if (key.trim()) obj[key] = { value, enabled };
  });
  return JSON.stringify(obj, null, 2);
}

/** Parse form-urlencoded body string into key-value items */
export function parseFormBody(bodyStr: string): KeyValueItem[] {
  if (!bodyStr.trim()) return [];
  return bodyStr.split('&').map(pair => {
    const [k, ...rest] = pair.split('=');
    return {
      key: decodeURIComponent(k || ''),
      value: decodeURIComponent(rest.join('=')),
      enabled: true,
    };
  });
}

/** Serialize key-value items to URL-encoded string */
export function buildFormBody(items: KeyValueItem[]): string {
  return items
    .filter(i => i.enabled && i.key.trim())
    .map(i => `${encodeURIComponent(i.key)}=${encodeURIComponent(i.value)}`)
    .join('&');
}

/** Parse formdata body JSON string into FormDataItem array */
export function parseFormDataBody(bodyStr: string): FormDataItem[] {
  try {
    const parsed = JSON.parse(bodyStr) as Array<{ key: string; value: string; type: 'text' | 'file'; enabled: boolean; contentType?: string }>;
    return parsed.map(item => ({ ...item, file: undefined }));
  } catch {
    return [];
  }
}

/** Serialize FormDataItem array to JSON for saving */
export function serializeFormDataItems(items: FormDataItem[]): string {
  return JSON.stringify(items.map(({ key, value, type, enabled, fileId, fileSize, contentType }) =>
    ({ key, value, type, enabled, ...(fileId ? { fileId, fileSize } : {}), ...(contentType ? { contentType } : {}) })));
}

/** Build GraphQL body JSON from query and variables */
export function buildGraphqlBody(query: string, variables: string): string {
  const payload: { query: string; variables?: Record<string, unknown> } = { query };
  if (variables.trim()) {
    try { payload.variables = JSON.parse(variables); } catch { /* ignore */ }
  }
  return JSON.stringify(payload);
}

/** Parse GraphQL body JSON into query and variables */
export function parseGraphqlBody(bodyStr: string): { query: string; variables: string } {
  try {
    const parsed = JSON.parse(bodyStr);
    return {
      query: parsed.query || '',
      variables: parsed.variables ? JSON.stringify(parsed.variables, null, 2) : '',
    };
  } catch {
    return { query: bodyStr, variables: '' };
  }
}
