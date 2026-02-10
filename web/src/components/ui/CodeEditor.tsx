import { useMemo, useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { graphql as graphqlParser } from 'codemirror-graphql/cm6-legacy/mode';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const lightHighlightTheme = syntaxHighlighting(HighlightStyle.define([
  // JSON: property names (keys) — blue
  { tag: tags.propertyName, color: '#2563eb' },
  // String values — green
  { tag: tags.string, color: '#16a34a' },
  // Numbers — orange
  { tag: tags.number, color: '#d97706' },
  // Booleans, null — purple
  { tag: tags.bool, color: '#9333ea' },
  { tag: tags.null, color: '#9333ea' },
  // Punctuation (braces, brackets, colon, comma) — gray
  { tag: tags.punctuation, color: '#6b7280' },
  { tag: tags.separator, color: '#6b7280' },

  // GraphQL: keywords (query, mutation, fragment, on, etc.) — purple
  { tag: tags.keyword, color: '#9333ea', fontWeight: 'bold' },
  // GraphQL: type names — teal
  { tag: tags.typeName, color: '#0d9488' },
  // GraphQL: field names / atoms — blue
  { tag: tags.atom, color: '#2563eb' },
  // GraphQL: directives, attributes — rose
  { tag: tags.attributeName, color: '#e11d48' },
  // GraphQL: variables ($var) — orange
  { tag: tags.variableName, color: '#d97706' },
  // Comments — gray italic
  { tag: tags.comment, color: '#9ca3af', fontStyle: 'italic' },
  // Definitions (name after query/mutation keyword)
  { tag: tags.definition(tags.variableName), color: '#2563eb', fontWeight: 'bold' },
]));

const darkHighlightTheme = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.propertyName, color: '#60a5fa' },
  { tag: tags.string, color: '#4ade80' },
  { tag: tags.number, color: '#fbbf24' },
  { tag: tags.bool, color: '#c084fc' },
  { tag: tags.null, color: '#c084fc' },
  { tag: tags.punctuation, color: '#9ca3af' },
  { tag: tags.separator, color: '#9ca3af' },
  { tag: tags.keyword, color: '#c084fc', fontWeight: 'bold' },
  { tag: tags.typeName, color: '#2dd4bf' },
  { tag: tags.atom, color: '#60a5fa' },
  { tag: tags.attributeName, color: '#fb7185' },
  { tag: tags.variableName, color: '#fbbf24' },
  { tag: tags.comment, color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.definition(tags.variableName), color: '#60a5fa', fontWeight: 'bold' },
]));

const darkEditorTheme = EditorView.theme({
  '&': { backgroundColor: '#374151' },
  '.cm-gutters': { backgroundColor: '#374151', borderRight: '1px solid #4b5563' },
  '.cm-activeLineGutter': { backgroundColor: '#4b5563' },
  '.cm-activeLine': { backgroundColor: '#4b5563' },
  '.cm-cursor': { borderLeftColor: '#e5e7eb' },
  '.cm-selectionBackground': { backgroundColor: '#4b5563 !important' },
  '.cm-content': { color: '#e5e7eb' },
  '.cm-placeholder': { color: '#9ca3af' },
}, { dark: true });

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: 'json' | 'graphql' | 'xml' | 'html' | 'css' | 'javascript';
  placeholder?: string;
  height?: string;
  readOnly?: boolean;
}

export function CodeEditor({
  value,
  onChange,
  language,
  placeholder,
  height = '120px',
  readOnly = false,
}: CodeEditorProps) {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const extensions = useMemo(() => {
    const exts = [
      EditorView.lineWrapping,
      isDark ? darkHighlightTheme : lightHighlightTheme,
    ];
    if (isDark) exts.push(darkEditorTheme);
    if (language === 'json') exts.push(json());
    if (language === 'graphql') exts.push(StreamLanguage.define(graphqlParser));
    if (language === 'xml') exts.push(xml());
    if (language === 'html') exts.push(html());
    if (language === 'css') exts.push(css());
    if (language === 'javascript') exts.push(javascript());
    return exts;
  }, [language, isDark]);

  return (
    <CodeMirror
      value={value}
      onChange={readOnly ? undefined : onChange}
      extensions={extensions}
      placeholder={placeholder}
      height={height}
      readOnly={readOnly}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: !readOnly,
      }}
      className="border border-gray-300 dark:border-gray-600 rounded text-sm overflow-hidden"
      theme={isDark ? 'dark' : 'light'}
    />
  );
}
