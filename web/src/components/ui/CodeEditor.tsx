import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { graphql as graphqlParser } from 'codemirror-graphql/cm6-legacy/mode';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const highlightTheme = syntaxHighlighting(HighlightStyle.define([
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

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: 'json' | 'graphql';
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
  const extensions = useMemo(() => {
    const exts = [EditorView.lineWrapping, highlightTheme];
    if (language === 'json') exts.push(json());
    if (language === 'graphql') exts.push(StreamLanguage.define(graphqlParser));
    return exts;
  }, [language]);

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
      className="border border-gray-300 rounded text-sm overflow-hidden"
    />
  );
}
