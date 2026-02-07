interface KeyValueItem {
  key: string;
  value: string;
  enabled?: boolean;
}

interface KeyValueEditorProps {
  items: KeyValueItem[];
  onChange: (items: KeyValueItem[]) => void;
  showEnabled?: boolean;
  showHeader?: boolean;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  keyClassName?: string;
}

export function KeyValueEditor({
  items,
  onChange,
  showEnabled = false,
  showHeader = false,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  addLabel = '+ Add',
  keyClassName = '',
}: KeyValueEditorProps) {
  const handleChange = (index: number, field: keyof KeyValueItem, val: string | boolean) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: val };
    onChange(newItems);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...items, { key: '', value: '', ...(showEnabled ? { enabled: true } : {}) }]);
  };

  return (
    <div className="space-y-2">
      {showHeader && (
        <div className="flex gap-2 text-xs font-medium text-gray-500">
          {showEnabled && <div className="w-4" />}
          <div className="flex-1 px-2">{keyPlaceholder}</div>
          <div className="flex-1 px-2">{valuePlaceholder}</div>
          <div className="w-8" />
        </div>
      )}
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          {showEnabled && (
            <input
              type="checkbox"
              checked={item.enabled ?? true}
              onChange={e => handleChange(index, 'enabled', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
          )}
          <input
            type="text"
            value={item.key}
            onChange={e => handleChange(index, 'key', e.target.value)}
            placeholder={keyPlaceholder}
            className={`flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm ${
              showEnabled && !(item.enabled ?? true) ? 'opacity-50' : ''
            } ${keyClassName}`}
          />
          <input
            type="text"
            value={item.value}
            onChange={e => handleChange(index, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            className={`flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm ${
              showEnabled && !(item.enabled ?? true) ? 'opacity-50' : ''
            }`}
          />
          <button
            onClick={() => handleRemove(index)}
            className="p-1.5 text-red-500 hover:bg-red-50 rounded"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <button
        onClick={handleAdd}
        className="text-sm text-blue-600 hover:underline"
      >
        {addLabel}
      </button>
    </div>
  );
}
