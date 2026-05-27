import type { History } from '../../types';
import { MethodBadge } from '../ui';
import { formatTime } from './sidebar-utils';

interface HistoryListProps {
  dateGroups: { label: string; items: History[] }[];
  expandedDateGroups: Set<string>;
  onToggleDateGroup: (label: string) => void;
  onSelectHistory: (item: History) => void;
  onDeleteHistory: (id: number) => void;
  emptyMessage: string;
}

export function HistoryList({
  dateGroups,
  expandedDateGroups,
  onToggleDateGroup,
  onSelectHistory,
  onDeleteHistory,
  emptyMessage,
}: HistoryListProps) {
  if (dateGroups.length === 0) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400 p-2">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {dateGroups.map(group => (
        <div key={group.label}>
          <div
            onClick={() => onToggleDateGroup(group.label)}
            className="flex items-center gap-1 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
          >
            <svg className={`w-4 h-4 transition-transform text-gray-500 dark:text-gray-400 ${expandedDateGroups.has(group.label) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-200">{group.label}</span>
            <span className="text-xs text-gray-400">{group.items.length}</span>
          </div>
          {expandedDateGroups.has(group.label) && (
            <div className="ml-2">
              {group.items.map(item => (
                <div
                  key={item.id}
                  onClick={() => onSelectHistory(item)}
                  className="px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded group cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <MethodBadge method={item.method} />
                    <span className={`text-xs ${item.statusCode && item.statusCode >= 400 ? 'text-red-500' : 'text-green-500'}`}>
                      {item.statusCode || 'Error'}
                    </span>
                    <span className="text-xs text-gray-400">{formatTime(item.createdAt)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteHistory(item.id); }}
                      className="ml-auto opacity-0 group-hover:opacity-100 p-0.5"
                    >
                      <svg className="w-3 h-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 truncate">{item.url}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
