import { Fragment, useRef } from 'react';

export interface FormDataItem {
  key: string;
  value: string;
  type: 'text' | 'file';
  enabled: boolean;
  file?: File;
  fileId?: number;
  fileSize?: number;
}

interface FormDataEditorProps {
  items: FormDataItem[];
  onChange: (items: FormDataItem[]) => void;
  onFileUpload?: (index: number, file: File) => void;
  onFileRemove?: (index: number, fileId: number) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileInput({ item, onChange, onRemove }: { item: FormDataItem; onChange: (file: File) => void; onRemove?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 ${!item.enabled ? 'opacity-50' : ''}`}>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onChange(file);
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600"
      >
        Choose File
      </button>
      {item.file ? (
        <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
          {item.file.name} ({formatFileSize(item.file.size)})
        </span>
      ) : item.fileId ? (
        <span className="text-sm text-gray-600 dark:text-gray-300 truncate flex items-center gap-1">
          {item.value} {item.fileSize != null && `(${formatFileSize(item.fileSize)})`}
          {onRemove && (
            <button
              onClick={e => { e.stopPropagation(); onRemove(); }}
              className="p-0.5 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
              title="Remove saved file"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </span>
      ) : (
        <span className="text-sm text-gray-400 dark:text-gray-500">
          No file selected
        </span>
      )}
    </div>
  );
}

const CELL_BORDER = 'border-l border-gray-200 dark:border-gray-700';
const ROW_BORDER = 'border-t border-gray-200 dark:border-gray-700';
const GRID_COLS = { gridTemplateColumns: '2.5rem 1fr 5rem 2fr 2.25rem' };

export function FormDataEditor({ items, onChange, onFileUpload, onFileRemove }: FormDataEditorProps) {
  const handleChange = (index: number, field: keyof FormDataItem, val: string | boolean | File) => {
    const newItems = [...items];
    if (field === 'type') {
      const oldItem = newItems[index];
      // If switching away from file type and there's a saved fileId, notify parent to delete
      if (oldItem.type === 'file' && oldItem.fileId && onFileRemove) {
        onFileRemove(index, oldItem.fileId);
      }
      newItems[index] = { ...newItems[index], type: val as 'text' | 'file', value: '', file: undefined, fileId: undefined, fileSize: undefined };
    } else {
      newItems[index] = { ...newItems[index], [field]: val };
    }
    onChange(newItems);
  };

  const handleFileChange = (index: number, file: File) => {
    if (onFileUpload) {
      // Delegate to parent for upload
      onFileUpload(index, file);
    } else {
      // Fallback: just set the File object locally
      const newItems = [...items];
      newItems[index] = { ...newItems[index], file, value: file.name };
      onChange(newItems);
    }
  };

  const handleRemove = (index: number) => {
    const item = items[index];
    if (item.fileId && onFileRemove) {
      onFileRemove(index, item.fileId);
    }
    onChange(items.filter((_, i) => i !== index));
  };

  const handleFileRemove = (index: number) => {
    const item = items[index];
    if (item.fileId && onFileRemove) {
      onFileRemove(index, item.fileId);
    }
    const newItems = [...items];
    newItems[index] = { ...newItems[index], file: undefined, fileId: undefined, fileSize: undefined, value: '' };
    onChange(newItems);
  };

  const handleAdd = () => {
    onChange([...items, { key: '', value: '', type: 'text', enabled: true }]);
  };

  const inputClass = (item: FormDataItem) =>
    `w-full px-3 py-1.5 text-sm bg-transparent outline-none dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
      !item.enabled ? 'opacity-50' : ''
    }`;

  return (
    <div>
      <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
        <div className="grid" style={GRID_COLS}>
          {/* Header */}
          <div className="bg-gray-50 dark:bg-gray-800" />
          <div className={`bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 ${CELL_BORDER}`}>Key</div>
          <div className={`bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 ${CELL_BORDER}`}>Type</div>
          <div className={`bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 ${CELL_BORDER}`}>Value</div>
          <div className="bg-gray-50 dark:bg-gray-800" />

          {/* Rows */}
          {items.map((item, index) => (
            <Fragment key={index}>
              <div className={`${ROW_BORDER} flex items-center justify-center`}>
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={e => handleChange(index, 'enabled', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
              </div>
              <div className={`${ROW_BORDER} ${CELL_BORDER} min-w-0 flex items-center`}>
                <input
                  type="text"
                  value={item.key}
                  onChange={e => handleChange(index, 'key', e.target.value)}
                  placeholder="Key"
                  className={inputClass(item)}
                />
              </div>
              <div className={`${ROW_BORDER} ${CELL_BORDER} flex items-center`}>
                <select
                  value={item.type}
                  onChange={e => handleChange(index, 'type', e.target.value)}
                  className={`w-full px-2 py-1.5 text-sm bg-transparent outline-none dark:text-gray-100 cursor-pointer ${
                    !item.enabled ? 'opacity-50' : ''
                  }`}
                >
                  <option value="text">Text</option>
                  <option value="file">File</option>
                </select>
              </div>
              <div className={`${ROW_BORDER} ${CELL_BORDER} min-w-0 flex items-center`}>
                {item.type === 'file' ? (
                  <FileInput
                    item={item}
                    onChange={file => handleFileChange(index, file)}
                    onRemove={() => handleFileRemove(index)}
                  />
                ) : (
                  <input
                    type="text"
                    value={item.value}
                    onChange={e => handleChange(index, 'value', e.target.value)}
                    placeholder="Value"
                    className={inputClass(item)}
                  />
                )}
              </div>
              <div className={`${ROW_BORDER} flex items-center justify-center`}>
                <button
                  onClick={() => handleRemove(index)}
                  className="p-1 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
      <button
        onClick={handleAdd}
        className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        + Add Field
      </button>
    </div>
  );
}
