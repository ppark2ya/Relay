import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
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
  const [activeTab, setActiveTab] = useState<'preview' | 'kotlin' | 'guide'>('preview');
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
                { key: 'guide', label: 'Guide' },
              ]}
              activeTab={activeTab}
              onTabChange={key => setActiveTab(key as 'preview' | 'kotlin' | 'guide')}
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

          {activeTab === 'guide' && (
            <ErdDslGuide />
          )}
        </div>
      </div>
    </div>
  );
}

function ErdDslGuide() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-800">
      <div className="max-w-4xl px-5 py-4 space-y-5 text-xs text-gray-700 dark:text-gray-300">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">ERD JSON DSL</h3>
          <p>
            The ERD DSL is a JSON document with optional package metadata, a list of entities, and a list of relationships.
            It is separate from Relay Flow Script DSL and is used only for ERD preview and Kotlin JPA generation.
          </p>
          <pre className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 text-[11px] leading-5 text-gray-800 dark:text-gray-200">
{`{
  "packageName": "com.example.domain",
  "entities": [],
  "relations": []
}`}
          </pre>
        </section>

        <GuideSection title="Top-level properties">
          <GuideTable
            rows={[
              ['packageName', 'string', 'Kotlin package name. Also controls generated file paths.'],
              ['entities', 'array', 'Entity definitions rendered as ERD boxes and generated as Kotlin classes.'],
              ['relations', 'array', 'Relationship definitions rendered as lines and generated as JPA associations.'],
            ]}
          />
        </GuideSection>

        <GuideSection title="entities">
          <p>Each entity becomes one ERD node and one Kotlin file.</p>
          <GuideTable
            rows={[
              ['name', 'string', 'Required. Kotlin class name and ERD entity label.'],
              ['table', 'string', 'Optional. Database table name. If omitted, the generator derives a snake-case plural table name.'],
              ['fields', 'array', 'Required. Scalar fields for columns and primary keys.'],
            ]}
          />
        </GuideSection>

        <GuideSection title="fields">
          <p>Fields describe scalar columns. At least one field should use <code className="font-mono">"id": true</code>.</p>
          <GuideTable
            rows={[
              ['name', 'string', 'Required. Kotlin property name.'],
              ['type', 'string', 'Required. Kotlin type such as Long, String, BigDecimal, Boolean, or LocalDateTime.'],
              ['column', 'string', 'Optional. Database column name. If omitted, the generator derives snake-case from name.'],
              ['id', 'boolean', 'Marks the primary key and emits @Id plus @GeneratedValue.'],
              ['nullable', 'boolean', 'Defaults to true. false emits a non-null Kotlin type and nullable = false.'],
              ['unique', 'boolean', 'Emits unique = true in @Column and UK in the preview field label.'],
            ]}
          />
        </GuideSection>

        <GuideSection title="relations">
          <p>Relations connect two entities in the preview and add JPA relationship properties to the source entity.</p>
          <GuideTable
            rows={[
              ['from', 'string', 'Required. Source/owning entity. The generated Kotlin property is added here.'],
              ['to', 'string', 'Required. Target entity. Must match an entity name.'],
              ['type', 'string', 'Required. one-to-one, one-to-many, many-to-one, or many-to-many.'],
              ['field', 'string', 'Required. Kotlin property name and ERD line label.'],
              ['joinColumn', 'string', 'Used for owning single-side associations such as many-to-one and one-to-one.'],
              ['nullable', 'boolean', 'Defaults to true. false emits optional = false and nullable = false where applicable.'],
            ]}
          />
        </GuideSection>

        <GuideSection title="Relation types">
          <GuideTable
            rows={[
              ['many-to-one', 'Many source rows point to one target row. Example: many Order records reference one User.'],
              ['one-to-many', 'One source row owns a list of target rows. Generated as MutableList<Target>.'],
              ['one-to-one', 'One source row references exactly one target row. Useful for profile/detail tables.'],
              ['many-to-many', 'Both sides can contain many records. Generated as MutableList<Target> in v1.'],
            ]}
          />
        </GuideSection>

        <GuideSection title="Kotlin JPA generation">
          <ul className="list-disc pl-5 space-y-1">
            <li>Uses Spring Boot 3 style <code className="font-mono">jakarta.persistence.*</code> imports.</li>
            <li>Generates <code className="font-mono">open class</code> entities for JPA proxy compatibility.</li>
            <li>Generates <code className="font-mono">@Entity</code>, <code className="font-mono">@Table</code>, <code className="font-mono">@Id</code>, <code className="font-mono">@GeneratedValue</code>, and <code className="font-mono">@Column</code>.</li>
            <li>Relation annotations are generated from <code className="font-mono">relations</code>: <code className="font-mono">@ManyToOne</code>, <code className="font-mono">@OneToMany</code>, <code className="font-mono">@OneToOne</code>, or <code className="font-mono">@ManyToMany</code>.</li>
            <li><code className="font-mono">BigDecimal</code> fields add <code className="font-mono">java.math.BigDecimal</code> imports.</li>
          </ul>
        </GuideSection>

        <GuideSection title="Complete example">
          <pre className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 text-[11px] leading-5 text-gray-800 dark:text-gray-200">
            {DEFAULT_DSL}
          </pre>
        </GuideSection>
      </div>
    </div>
  );
}

function GuideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-900 dark:text-gray-100">{title}</h4>
      {children}
    </section>
  );
}

function GuideTable({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
      <table className="w-full border-collapse text-left text-[11px]">
        <tbody>
          {rows.map(([name, type, description]) => (
            <tr key={`${name}-${description}`} className="border-b last:border-b-0 border-gray-200 dark:border-gray-700">
              <td className="w-32 align-top px-3 py-2 font-mono font-semibold text-blue-700 dark:text-blue-300">{name}</td>
              {description ? (
                <>
                  <td className="w-36 align-top px-3 py-2 font-mono text-gray-500 dark:text-gray-400">{type}</td>
                  <td className="align-top px-3 py-2">{description}</td>
                </>
              ) : (
                <td className="align-top px-3 py-2" colSpan={2}>{type}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
