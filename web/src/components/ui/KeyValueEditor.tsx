import { useState, useRef, useCallback, useEffect } from 'react';

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
  suggestions?: string[];
}

function AutocompleteInput({
  value,
  onChange,
  placeholder,
  className,
  suggestions,
  usedKeys,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  className: string;
  suggestions: string[];
  usedKeys: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = suggestions.filter(s => {
    const lower = s.toLowerCase();
    const input = value.toLowerCase();
    if (usedKeys.has(lower) && lower !== value.toLowerCase()) return false;
    if (!value) return true;
    return lower.includes(input);
  });

  const updatePosition = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, []);

  const openDropdown = useCallback(() => {
    updatePosition();
    setOpen(true);
  }, [updatePosition]);

  const handleSelect = useCallback((item: string) => {
    onChange(item);
    setOpen(false);
    setHighlightIndex(-1);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open || filtered.length === 0) {
      if (e.key === 'ArrowDown' && filtered.length > 0) {
        openDropdown();
        setHighlightIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex(prev => (prev + 1) % filtered.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex(prev => (prev <= 0 ? filtered.length - 1 : prev - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          handleSelect(filtered[highlightIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setHighlightIndex(-1);
        break;
    }
  }, [open, filtered, highlightIndex, handleSelect, openDropdown]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  // Close on outside click (check both input and dropdown)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        inputRef.current && !inputRef.current.contains(target) &&
        listRef.current && !listRef.current.contains(target)
      ) {
        setOpen(false);
        setHighlightIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => {
          onChange(e.target.value);
          openDropdown();
          setHighlightIndex(-1);
        }}
        onFocus={openDropdown}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
      />
      {open && filtered.length > 0 && dropdownPos && (
        <ul
          ref={listRef}
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg dark:shadow-gray-900/50 z-50 max-h-48 overflow-y-auto"
          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
        >
          {filtered.map((item, i) => (
            <li
              key={item}
              onMouseDown={e => {
                e.preventDefault();
                handleSelect(item);
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`px-3 py-1.5 text-sm cursor-pointer ${
                i === highlightIndex ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
  suggestions,
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

  const usedKeys = new Set(items.map(item => item.key.toLowerCase()).filter(k => k));

  return (
    <div className="space-y-2">
      {showHeader && (
        <div className="flex gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
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
          {suggestions ? (
            <AutocompleteInput
              value={item.key}
              onChange={val => handleChange(index, 'key', val)}
              placeholder={keyPlaceholder}
              className={`w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-gray-100 ${
                showEnabled && !(item.enabled ?? true) ? 'opacity-50' : ''
              } ${keyClassName}`}
              suggestions={suggestions}
              usedKeys={usedKeys}
            />
          ) : (
            <input
              type="text"
              value={item.key}
              onChange={e => handleChange(index, 'key', e.target.value)}
              placeholder={keyPlaceholder}
              className={`flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-gray-100 ${
                showEnabled && !(item.enabled ?? true) ? 'opacity-50' : ''
              } ${keyClassName}`}
            />
          )}
          <input
            type="text"
            value={item.value}
            onChange={e => handleChange(index, 'value', e.target.value)}
            placeholder={valuePlaceholder}
            className={`flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm dark:bg-gray-700 dark:text-gray-100 ${
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
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        {addLabel}
      </button>
    </div>
  );
}
