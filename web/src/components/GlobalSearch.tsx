import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useCollections } from '../api/collections';
import { useFlows } from '../api/flows';
import { useHistory } from '../api/history';
import { matchesQuery, flattenRequests, type FlatRequest } from '../utils/searchUtils';
import { MethodBadge } from './ui';
import type { Request } from '../api/requests';
import type { Flow } from '../api/flows';
import type { History } from '../api/history';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRequest: (request: Request) => void;
  onSelectFlow: (flow: Flow) => void;
  onSelectHistory: (history: History) => void;
}

interface SearchResult {
  type: 'request' | 'flow' | 'history';
  id: string;
  item: FlatRequest | Flow | History;
}

const MAX_REQUESTS = 10;
const MAX_FLOWS = 5;
const MAX_HISTORY = 10;

export function GlobalSearch({ isOpen, onClose, onSelectRequest, onSelectFlow, onSelectHistory }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: collections = [] } = useCollections();
  const { data: flows = [] } = useFlows();
  const { data: history = [] } = useHistory();

  const allRequests = useMemo(() => flattenRequests(collections), [collections]);

  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) return [];

    const items: SearchResult[] = [];

    const matchedRequests = allRequests
      .filter((fr) => matchesQuery(fr.request.name, query) || matchesQuery(fr.request.url, query))
      .slice(0, MAX_REQUESTS);
    for (const fr of matchedRequests) {
      items.push({ type: 'request', id: `r-${fr.request.id}`, item: fr });
    }

    const matchedFlows = flows
      .filter((f) => matchesQuery(f.name, query) || matchesQuery(f.description, query))
      .slice(0, MAX_FLOWS);
    for (const f of matchedFlows) {
      items.push({ type: 'flow', id: `f-${f.id}`, item: f });
    }

    const matchedHistory = history
      .filter((h) => matchesQuery(h.method, query) || matchesQuery(h.url, query))
      .slice(0, MAX_HISTORY);
    for (const h of matchedHistory) {
      items.push({ type: 'history', id: `h-${h.id}`, item: h });
    }

    return items;
  }, [query, allRequests, flows, history]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = useCallback((result: SearchResult) => {
    onClose();
    if (result.type === 'request') {
      onSelectRequest((result.item as FlatRequest).request);
    } else if (result.type === 'flow') {
      onSelectFlow(result.item as Flow);
    } else {
      onSelectHistory(result.item as History);
    }
  }, [onClose, onSelectRequest, onSelectFlow, onSelectHistory]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [results, selectedIndex, handleSelect, onClose]);

  if (!isOpen) return null;

  // Group results by type for section headers
  const requestResults = results.filter((r) => r.type === 'request');
  const flowResults = results.filter((r) => r.type === 'flow');
  const historyResults = results.filter((r) => r.type === 'history');

  // Map from result to its flat index
  let flatIndex = 0;
  const renderSection = (
    label: string,
    items: SearchResult[],
    renderItem: (result: SearchResult, idx: number) => React.ReactNode,
  ) => {
    if (items.length === 0) return null;
    const section = (
      <div key={label}>
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {label}
        </div>
        {items.map((result) => {
          const idx = flatIndex++;
          return renderItem(result, idx);
        })}
      </div>
    );
    return section;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-h-[60vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search requests, flows, history..."
            className="flex-1 bg-transparent text-sm outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {!query.trim() && (
            <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-500">
              Type to search across requests, flows, and history
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-500">
              No results found
            </div>
          )}
          {(() => {
            flatIndex = 0;
            return (
              <>
                {renderSection('Requests', requestResults, (result, idx) => {
                  const fr = result.item as FlatRequest;
                  return (
                    <div
                      key={result.id}
                      data-selected={idx === selectedIndex}
                      onClick={() => handleSelect(result)}
                      className={`px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                        idx === selectedIndex
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <MethodBadge method={fr.request.method} />
                      <span className="text-xs font-medium truncate dark:text-gray-200">
                        {fr.request.name}
                      </span>
                      <span className="text-xs text-gray-400 truncate ml-auto flex-shrink-0 max-w-[40%]">
                        {fr.collectionPath}
                      </span>
                    </div>
                  );
                })}
                {renderSection('Flows', flowResults, (result, idx) => {
                  const flow = result.item as Flow;
                  return (
                    <div
                      key={result.id}
                      data-selected={idx === selectedIndex}
                      onClick={() => handleSelect(result)}
                      className={`px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                        idx === selectedIndex
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="text-xs font-medium truncate dark:text-gray-200">
                        {flow.name}
                      </span>
                      {flow.description && (
                        <span className="text-xs text-gray-400 truncate ml-auto flex-shrink-0 max-w-[40%]">
                          {flow.description}
                        </span>
                      )}
                    </div>
                  );
                })}
                {renderSection('History', historyResults, (result, idx) => {
                  const h = result.item as History;
                  return (
                    <div
                      key={result.id}
                      data-selected={idx === selectedIndex}
                      onClick={() => handleSelect(result)}
                      className={`px-3 py-1.5 flex items-center gap-2 cursor-pointer ${
                        idx === selectedIndex
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <MethodBadge method={h.method} />
                      <span className="text-xs truncate dark:text-gray-200">
                        {h.url}
                      </span>
                      <span className={`text-xs flex-shrink-0 ${
                        h.statusCode && h.statusCode >= 400
                          ? 'text-red-500'
                          : 'text-green-500'
                      }`}>
                        {h.statusCode || 'Error'}
                      </span>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
