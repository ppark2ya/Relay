import { useRef } from 'react';

export interface FormDataItem {
  key: string;
  value: string;
  type: 'text' | 'file';
  enabled: boolean;
  file?: File;
}

interface FormDataEditorProps {
  items: FormDataItem[];
  onChange: (items: FormDataItem[]) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileInput({ item, onChange }: { item: FormDataItem; onChange: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 flex items-center gap-2">
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
        className={`px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 ${
          !(item.enabled) ? 'opacity-50' : ''
        }`}
      >
        Choose File
      </button>
      {item.file ? (
        <span className={`text-sm text-gray-600 dark:text-gray-300 truncate ${!(item.enabled) ? 'opacity-50' : ''}`}>
          {item.file.name} ({formatFileSize(item.file.size)})
        </span>
      ) : (
        <span className={`text-sm text-gray-400 dark:text-gray-500 ${!(item.enabled) ? 'opacity-50' : ''}`}>
          No file selected
        </span>
      )}
    </div>
  );
}

export function FormDataEditor({ items, onChange }: FormDataEditorProps) {
  const handleChange = (index: number, field: keyof FormDataItem, val: string | boolean | File) => {
    const newItems = [...items];
    if (field === 'type') {
      // Reset file/value when switching type
      newItems[index] = { ...newItems[index], type: val as 'text' | 'file', value: '', file: undefined };
    } else {
      newItems[index] = { ...newItems[index], [field]: val };
    }
    onChange(newItems);
  };

  const handleFileChange = (index: number, file: File) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], file, value: file.name };
    onChange(newItems);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...items, { key: '', value: '', type: 'text', enabled: true }]);
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={e => handleChange(index, 'enabled', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          <input
            type="text"
            value={item.key}
            onChange={e => handleChange(index, 'key', e.target.value)}
            placeholder="Field name"
            className={`w-36 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-gray-100 ${
              !item.enabled ? 'opacity-50' : ''
            }`}
          />
          <select
            value={item.type}
            onChange={e => handleChange(index, 'type', e.target.value)}
            className={`px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-gray-100 ${
              !item.enabled ? 'opacity-50' : ''
            }`}
          >
            <option value="text">Text</option>
            <option value="file">File</option>
          </select>
          {item.type === 'file' ? (
            <FileInput item={item} onChange={file => handleFileChange(index, file)} />
          ) : (
            <input
              type="text"
              value={item.value}
              onChange={e => handleChange(index, 'value', e.target.value)}
              placeholder="Value"
              className={`flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-gray-100 ${
                !item.enabled ? 'opacity-50' : ''
              }`}
            />
          )}
          <button
            onClick={() => handleRemove(index)}
            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <button
        onClick={handleAdd}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        + Add Field
      </button>
    </div>
  );
}
