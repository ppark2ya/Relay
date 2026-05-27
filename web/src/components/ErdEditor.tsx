import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useErds, useGenerateKotlin, usePreviewErd, useUpdateErd } from '../api/erds';
import type { ErdDocument, ErdGeneratedFile } from '../api/erds';
import { CodeEditor, EmptyState, TabNav, type ScriptDiagnostic } from './ui';
import { ErdDiagram } from './ErdDiagram';

interface ErdEditorProps {
  erd: ErdDocument | null;
  onUpdate: (erd: ErdDocument | null) => void;
}

const DEFAULT_DSL = `{
  "packageName": "com.example.domain",
  "entities": [
    {
      "name": "User",
      "table": "users",
      "fields": [
        { "name": "id", "type": "Long", "id": true },
        { "name": "email", "type": "String", "nullable": false, "unique": true }
      ]
    },
    {
      "name": "Order",
      "table": "orders",
      "fields": [
        { "name": "id", "type": "Long", "id": true },
        { "name": "amount", "type": "BigDecimal", "nullable": false }
      ]
    }
  ],
  "relations": [
    {
      "from": "Order",
      "to": "User",
      "type": "many-to-one",
      "field": "user",
      "joinColumn": "user_id",
      "nullable": false
    }
  ]
}`;

export function ErdEditor({ erd, onUpdate }: ErdEditorProps) {
  const updateErd = useUpdateErd();
  const { data: erds = [] } = useErds();
  const previewErd = usePreviewErd();
  const generateKotlin = useGenerateKotlin();
  const previewMutate = previewErd.mutate;
  const generateKotlinMutate = generateKotlin.mutate;
  const [dsl, setDsl] = useState(DEFAULT_DSL);
  const [activeTab, setActiveTab] = useState<'preview' | 'kotlin'>('preview');
  const [mermaid, setMermaid] = useState('');
  const [diagnostics, setDiagnostics] = useState<ScriptDiagnostic[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<ErdGeneratedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [zoom, setZoom] = useState(1);
  const [diagramSize, setDiagramSize] = useState({ width: 1, height: 1 });
  const [editorWidth, setEditorWidth] = useState(() => {
    const saved = localStorage.getItem('erdEditorWidth');
    if (saved) {
      const n = parseFloat(saved);
      if (n >= 30 && n <= 70) return n;
    }
    return 46;
  });
  const isResizing = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    setDsl(erd?.dsl || DEFAULT_DSL);
    setMermaid('');
    setDiagnostics([]);
    setGeneratedFiles([]);
    setSelectedFile('');
  }, [erd?.id, erd?.dsl]);

  useEffect(() => {
    localStorage.setItem('erdEditorWidth', String(editorWidth));
  }, [editorWidth]);

  useEffect(() => {
    if (!erd) return;
    const seq = ++requestSeq.current;
    const handle = window.setTimeout(() => {
      previewMutate(dsl, {
        onSuccess: (result) => {
          if (seq !== requestSeq.current) return;
          setMermaid(result.mermaid);
          setDiagnostics(result.diagnostics.map(d => ({
            line: d.line || 1,
            message: d.message,
            severity: d.severity,
          })));
          if (result.diagnostics.length === 0) {
            generateKotlinMutate(dsl, {
              onSuccess: (generated) => {
                if (seq !== requestSeq.current) return;
                setGeneratedFiles(generated.files);
                setSelectedFile(prev => prev || generated.files[0]?.path || '');
              },
            });
          }
        },
      });
    }, 350);
    return () => window.clearTimeout(handle);
  }, [dsl, erd, previewMutate, generateKotlinMutate]);

  const selectedContent = useMemo(
    () => generatedFiles.find(file => file.path === selectedFile)?.content || generatedFiles[0]?.content || '',
    [generatedFiles, selectedFile],
  );

  const handleSave = () => {
    if (!erd) return;
    const latestName = erds.find(item => item.id === erd.id)?.name || erd.name;
    updateErd.mutate({ id: erd.id, data: { name: latestName, dsl } }, {
      onSuccess: (updated) => onUpdate(updated),
    });
  };

  const handleFit = () => {
    const container = previewRef.current;
    if (!container) {
      setZoom(1);
      return;
    }
    const availableWidth = Math.max(1, container.clientWidth - 64);
    const availableHeight = Math.max(1, container.clientHeight - 64);
    const nextZoom = Math.min(1, availableWidth / diagramSize.width, availableHeight / diagramSize.height);
    setZoom(Math.max(0.4, Math.min(2, nextZoom)));
  };

  const handleResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const container = (e.target as HTMLElement).parentElement!;

    const onMouseMove = (ev: globalThis.MouseEvent) => {
      if (!isResizing.current) return;
      const rect = container.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setEditorWidth(Math.min(70, Math.max(30, pct)));
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  if (!erd) {
    return (
      <EmptyState
        icon={
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 7h16M4 12h8m-8 5h16" />
          </svg>
        }
        message="Select or create an ERD document"
        className="bg-gray-50 dark:bg-gray-900"
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50 dark:bg-gray-900">
      <div className="h-12 px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{erd.name}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">ERD DSL to Kotlin JPA</p>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={updateErd.isPending}
          className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save
        </button>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex flex-col min-w-0" style={{ width: `${editorWidth}%` }}>
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-300">
            ERD JSON DSL
          </div>
          <div className="flex-1 min-h-0 p-3">
            <CodeEditor
              value={dsl}
              onChange={setDsl}
              language="json"
              height="100%"
              diagnostics={diagnostics}
            />
          </div>
        </div>

        <div
          onMouseDown={handleResizeStart}
          className="w-1.5 shrink-0 cursor-col-resize bg-gray-200 dark:bg-gray-700 hover:bg-blue-400 active:bg-blue-500 transition-colors"
        />

        <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-gray-800">
          <div className="flex items-center border-b border-gray-200 dark:border-gray-700">
            <TabNav
              tabs={[
                { key: 'preview', label: 'Preview' },
                { key: 'kotlin', label: 'Kotlin' },
              ]}
              activeTab={activeTab}
              onTabChange={key => setActiveTab(key as 'preview' | 'kotlin')}
              className="flex-1 border-b-0"
            />
            {activeTab === 'preview' && (
              <div className="px-2 flex items-center gap-1">
                <button onClick={() => setZoom(z => Math.max(0.4, z - 0.1))} className="px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">-</button>
                <button onClick={() => setZoom(1)} className="px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">{Math.round(zoom * 100)}%</button>
                <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">+</button>
                <button onClick={handleFit} className="px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200">Fit</button>
              </div>
            )}
          </div>

          {activeTab === 'preview' && (
            <div ref={previewRef} className="flex-1 min-h-0 overflow-auto bg-gray-50 dark:bg-gray-900">
              {diagnostics.length > 0 ? (
                <div className="p-4 space-y-2">
                  {diagnostics.map((diag, index) => (
                    <div key={index} className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
                      {diag.message}
                    </div>
                  ))}
                </div>
              ) : (
                <ErdDiagram mermaid={mermaid} zoom={zoom} onSizeChange={setDiagramSize} />
              )}
            </div>
          )}

          {activeTab === 'kotlin' && (
            <div className="flex-1 min-h-0 flex flex-col">
              {generatedFiles.length > 0 && (
                <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
                  {generatedFiles.map(file => (
                    <button
                      key={file.path}
                      onClick={() => setSelectedFile(file.path)}
                      className={`px-2 py-1 text-xs rounded border ${
                        (selectedFile || generatedFiles[0]?.path) === file.path
                          ? 'border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {file.path.split('/').pop()}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 min-h-0 p-3">
                <CodeEditor value={selectedContent} language="javascript" height="100%" readOnly />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
