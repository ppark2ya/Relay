import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useErds, useUpdateErd } from '../api/erds';
import * as erdApi from '../api/erds/client';
import type { ErdDocument, ErdGeneratedFile, ErdPreviewDiagram } from '../api/erds';
import { CodeEditor, EmptyState, TabNav, type ScriptDiagnostic } from './ui';
import { ErdDiagram } from './ErdDiagram';
import { normalizeErdDiagnostics } from './ErdDiagnostics';

interface ErdEditorProps {
  erd: ErdDocument | null;
  onUpdate: (erd: ErdDocument | null) => void;
}

type ErdEditorTab = 'preview' | 'kotlin' | 'java' | 'guide';
type GeneratedCodeLanguage = 'kotlin' | 'java';
type GeneratedCodeStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface GeneratedCodeState {
  files: ErdGeneratedFile[];
  selectedFile: string;
  status: GeneratedCodeStatus;
  message: string;
}

const CODEGEN_LABELS: Record<GeneratedCodeLanguage, string> = {
  kotlin: 'Kotlin',
  java: 'Java',
};

const initialGeneratedCodeState: Record<GeneratedCodeLanguage, GeneratedCodeState> = {
  kotlin: {
    files: [],
    selectedFile: '',
    status: 'idle',
    message: 'Kotlin files will appear after the ERD DSL is valid.',
  },
  java: {
    files: [],
    selectedFile: '',
    status: 'idle',
    message: 'Java files will appear after the ERD DSL is valid.',
  },
};

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
  const erdDraftId = erd?.id ?? 0;
  const [draft, setDraft] = useState(() => ({ erdId: erdDraftId, dsl: erd?.dsl || DEFAULT_DSL }));
  const dsl = draft.erdId === erdDraftId ? draft.dsl : erd?.dsl || DEFAULT_DSL;
  const [activeTab, setActiveTab] = useState<ErdEditorTab>('preview');
  const [diagram, setDiagram] = useState<ErdPreviewDiagram>({ entities: [], relations: [] });
  const [diagnostics, setDiagnostics] = useState<ScriptDiagnostic[]>([]);
  const [generatedCode, setGeneratedCode] = useState(initialGeneratedCodeState);
  const [editorWidth, setEditorWidth] = useState(() => {
    const saved = localStorage.getItem('erdEditorWidth');
    if (saved) {
      const n = parseFloat(saved);
      if (n >= 30 && n <= 70) return n;
    }
    return 46;
  });
  const isResizing = useRef(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    localStorage.setItem('erdEditorWidth', String(editorWidth));
  }, [editorWidth]);

  useEffect(() => {
    if (!erdDraftId) return;
    const seq = ++requestSeq.current;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setGeneratedCode({
        kotlin: makeGeneratedCodeState('loading', 'Generating Kotlin files...'),
        java: makeGeneratedCodeState('loading', 'Generating Java files...'),
      });
      void (async () => {
        try {
          const result = await erdApi.previewErd(dsl);
          if (cancelled || seq !== requestSeq.current) return;
          const previewDiagnostics = normalizeErdDiagnostics(result.diagnostics);
          setDiagram(result.diagram ?? { entities: [], relations: [] });
          setDiagnostics(previewDiagnostics.map(d => ({
            line: d.line || 1,
            message: d.message,
            severity: d.severity,
          })));

          if (previewDiagnostics.length === 0) {
            const [kotlin, java] = await Promise.all([
              loadGeneratedCode('kotlin', erdApi.generateKotlin(dsl)),
              loadGeneratedCode('java', erdApi.generateJava(dsl)),
            ]);
            if (cancelled || seq !== requestSeq.current) return;
            setGeneratedCode({ kotlin, java });
          } else {
            setGeneratedCode({
              kotlin: makeGeneratedCodeState('error', 'Fix the ERD DSL diagnostics before generating Kotlin files.'),
              java: makeGeneratedCodeState('error', 'Fix the ERD DSL diagnostics before generating Java files.'),
            });
          }
        } catch (error) {
          if (cancelled || seq !== requestSeq.current) return;
          setDiagram({ entities: [], relations: [] });
          setDiagnostics([{ line: 1, message: `Preview failed: ${formatMutationError(error)}`, severity: 'error' }]);
          setGeneratedCode({
            kotlin: makeGeneratedCodeState('error', 'Preview failed, so Kotlin files could not be generated.'),
            java: makeGeneratedCodeState('error', 'Preview failed, so Java files could not be generated.'),
          });
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [dsl, erdDraftId]);

  const handleDslChange = useCallback((value: string) => {
    setDraft({ erdId: erdDraftId, dsl: value });
  }, [erdDraftId]);

  const handleSave = () => {
    if (!erd) return;
    const latestName = erds.find(item => item.id === erd.id)?.name || erd.name;
    updateErd.mutate({ id: erd.id, data: { name: latestName, dsl } }, {
      onSuccess: (updated) => onUpdate(updated),
    });
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

  const handleSelectGeneratedFile = useCallback((language: GeneratedCodeLanguage, path: string) => {
    setGeneratedCode(prev => ({
      ...prev,
      [language]: {
        ...prev[language],
        selectedFile: path,
      },
    }));
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
          <p className="text-xs text-gray-500 dark:text-gray-400">ERD DSL to JPA Entities</p>
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
              onChange={handleDslChange}
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
                { key: 'java', label: 'Java' },
                { key: 'guide', label: 'Guide' },
              ]}
              activeTab={activeTab}
              onTabChange={key => setActiveTab(key as ErdEditorTab)}
              className="flex-1 border-b-0"
            />
          </div>

          {activeTab === 'preview' && (
            <div className="flex-1 min-h-0 bg-gray-50 dark:bg-gray-900">
              {diagnostics.length > 0 ? (
                <div className="p-4 space-y-2">
                  {diagnostics.map((diag, index) => (
                    <div key={index} className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
                      {diag.message}
                    </div>
                  ))}
                </div>
              ) : (
                <ErdDiagram diagram={diagram} />
              )}
            </div>
          )}

          {activeTab === 'kotlin' && (
            <GeneratedCodePanel
              language="kotlin"
              state={generatedCode.kotlin}
              onSelectFile={handleSelectGeneratedFile}
            />
          )}

          {activeTab === 'java' && (
            <GeneratedCodePanel
              language="java"
              state={generatedCode.java}
              onSelectFile={handleSelectGeneratedFile}
            />
          )}

          {activeTab === 'guide' && (
            <ErdDslGuide />
          )}
        </div>
      </div>
    </div>
  );
}

function GeneratedCodePanel({
  language,
  state,
  onSelectFile,
}: {
  language: GeneratedCodeLanguage;
  state: GeneratedCodeState;
  onSelectFile: (language: GeneratedCodeLanguage, path: string) => void;
}) {
  const selectedContent = useMemo(
    () => state.files.find(file => file.path === state.selectedFile)?.content || state.files[0]?.content || '',
    [state.files, state.selectedFile],
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {state.files.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
          {state.files.map(file => (
            <button
              key={file.path}
              onClick={() => onSelectFile(language, file.path)}
              className={`px-2 py-1 text-xs rounded border ${
                (state.selectedFile || state.files[0]?.path) === file.path
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
        {state.status === 'ready' ? (
          <CodeEditor value={selectedContent} language="javascript" height="100%" readOnly />
        ) : (
          <GeneratedCodeStateMessage status={state.status} message={state.message} />
        )}
      </div>
    </div>
  );
}

function makeGeneratedCodeState(
  status: GeneratedCodeStatus,
  message: string,
  files: ErdGeneratedFile[] = [],
): GeneratedCodeState {
  return {
    files,
    selectedFile: files[0]?.path || '',
    status,
    message,
  };
}

async function loadGeneratedCode(
  language: GeneratedCodeLanguage,
  promise: Promise<{ files: ErdGeneratedFile[] }>,
): Promise<GeneratedCodeState> {
  const label = CODEGEN_LABELS[language];
  try {
    const generated = await withRequestTimeout(
      promise,
      10000,
      `${label} generation timed out.`,
    );
    if (generated.files.length > 0) {
      return makeGeneratedCodeState('ready', '', generated.files);
    }
    return makeGeneratedCodeState(
      'empty',
      `No ${label} files were generated because the DSL has no entities.`,
    );
  } catch (error) {
    return makeGeneratedCodeState(
      'error',
      `${label} generation failed: ${formatMutationError(error)}`,
    );
  }
}

function formatMutationError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Unknown error';
}

function withRequestTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const handle = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(handle);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(handle);
        reject(error);
      },
    );
  });
}

function GeneratedCodeStateMessage({ status, message }: { status: Exclude<GeneratedCodeStatus, 'ready'>; message: string }) {
  const tone = status === 'error'
    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
    : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300';

  return (
    <div className={`h-full rounded border p-4 text-xs ${tone}`}>
      {message}
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
            It is separate from Relay Flow Script DSL and is used only for ERD preview and JPA entity generation.
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
              ['packageName', 'string', 'Package name. Also controls generated Kotlin and Java file paths.'],
              ['entities', 'array', 'Entity definitions rendered as ERD boxes and generated as JPA classes.'],
              ['relations', 'array', 'Relationship definitions rendered as lines and generated as JPA associations.'],
            ]}
          />
        </GuideSection>

        <GuideSection title="entities">
          <p>Each entity becomes one ERD node, one Kotlin file, and one Java file.</p>
          <GuideTable
            rows={[
              ['name', 'string', 'Required. Generated class name and ERD entity label.'],
              ['table', 'string', 'Optional. Database table name. If omitted, the generator derives a snake-case plural table name.'],
              ['fields', 'array', 'Required. Scalar fields for columns and primary keys.'],
            ]}
          />
        </GuideSection>

        <GuideSection title="fields">
          <p>
            Fields describe scalar columns. At least one field should use <code className="font-mono">"id": true</code>.
            Foreign key columns for JPA relationships are usually declared with <code className="font-mono">relations[].joinColumn</code>,
            not duplicated here, unless you want a separate scalar property too.
          </p>
          <GuideTable
            rows={[
              ['name', 'string', 'Required. Generated property or field name.'],
              ['type', 'string', 'Required. Type such as Long, String, BigDecimal, Boolean, or LocalDateTime. Java generation maps Int to Integer.'],
              ['column', 'string', 'Optional. Database column name. If omitted, the generator derives snake-case from name.'],
              ['id', 'boolean', 'Marks the primary key and emits @Id plus @GeneratedValue.'],
              ['nullable', 'boolean', 'Defaults to true. false emits a non-null Kotlin type and nullable = false.'],
              ['unique', 'boolean', 'Emits unique = true in @Column and UK in the preview field label.'],
            ]}
          />
        </GuideSection>

        <GuideSection title="relations">
          <p>
            Relations connect two entities in the preview and add JPA relationship properties to the source entity.
            The <code className="font-mono">field</code> value is the relation property name, such as
            <code className="font-mono"> user</code>; <code className="font-mono">joinColumn</code> is the database FK column,
            such as <code className="font-mono">user_id</code>.
          </p>
          <GuideTable
            rows={[
              ['from', 'string', 'Required. Source/owning entity. The generated association is added here.'],
              ['to', 'string', 'Required. Target entity. Must match an entity name.'],
              ['type', 'string', 'Required. one-to-one, one-to-many, many-to-one, or many-to-many.'],
              ['field', 'string', 'Required. Relationship property or field name and ERD line label. This is not the FK column name.'],
              ['joinColumn', 'string', 'FK column used for owning single-side associations such as many-to-one and one-to-one.'],
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
            <li>Explicit scalar fields are always generated as Kotlin properties, so a field named <code className="font-mono">user_id</code> is separate from a relation field named <code className="font-mono">user</code>.</li>
            <li><code className="font-mono">BigDecimal</code> fields add <code className="font-mono">java.math.BigDecimal</code> imports.</li>
          </ul>
        </GuideSection>

        <GuideSection title="Java JPA generation">
          <ul className="list-disc pl-5 space-y-1">
            <li>Uses Spring Boot 3 style <code className="font-mono">jakarta.persistence.*</code> imports.</li>
            <li>Generates Lombok <code className="font-mono">@Getter</code>, <code className="font-mono">@Setter</code>, <code className="font-mono">@Builder</code>, <code className="font-mono">@NoArgsConstructor(access = AccessLevel.PROTECTED)</code>, and <code className="font-mono">@AllArgsConstructor</code>.</li>
            <li>Collection relations are generated as <code className="font-mono">List&lt;T&gt;</code> with <code className="font-mono">@Builder.Default</code> and <code className="font-mono">new ArrayList&lt;&gt;()</code>.</li>
            <li><code className="font-mono">BigDecimal</code>, <code className="font-mono">LocalDate</code>, <code className="font-mono">LocalDateTime</code>, and <code className="font-mono">Instant</code> fields add matching Java imports.</li>
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
