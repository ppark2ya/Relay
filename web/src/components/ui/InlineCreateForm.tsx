interface InlineCreateFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  buttonLabel: string;
}

export function InlineCreateForm({
  isOpen,
  onOpenChange,
  value,
  onValueChange,
  onSubmit,
  placeholder,
  buttonLabel,
}: InlineCreateFormProps) {
  if (isOpen) {
    return (
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={value}
          onChange={e => onValueChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSubmit();
            if (e.key === 'Escape') {
              onOpenChange(false);
              onValueChange('');
            }
          }}
          placeholder={placeholder}
          className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-gray-100"
          autoFocus
        />
        <div className="flex gap-1">
          <button
            onClick={() => { onOpenChange(false); onValueChange(''); }}
            className="flex-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            className="flex-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
          >
            Add
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => onOpenChange(true)}
      className="w-full px-2 py-1 text-xs text-left text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded flex items-center gap-1"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      {buttonLabel}
    </button>
  );
}
