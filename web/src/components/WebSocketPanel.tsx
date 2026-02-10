import { useState, useRef, useEffect } from 'react';
import type { WSMessage } from '../types';

interface WebSocketPanelProps {
  messages: WSMessage[];
  isConnected: boolean;
  onSend: (payload: string, format?: 'text' | 'binary') => void;
  onClear: () => void;
}

export function WebSocketPanel({ messages, isConnected, onSend, onClear }: WebSocketPanelProps) {
  const [messageInput, setMessageInput] = useState('');
  const [messageFormat, setMessageFormat] = useState<'text' | 'json'>('text');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (messageInput.trim()) {
      onSend(messageInput, 'text');
      setMessageInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(messageInput);
      setMessageInput(JSON.stringify(parsed, null, 2));
    } catch {
      // not valid JSON
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      {/* Message Input */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <textarea
              value={messageInput}
              onChange={e => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isConnected ? 'Type a message... (Enter to send)' : 'Connect first to send messages'}
              disabled={!isConnected}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs dark:bg-gray-700 dark:text-gray-100 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex gap-1">
              <button
                onClick={() => setMessageFormat('text')}
                className={`px-2 py-1 text-xs rounded ${messageFormat === 'text' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                Text
              </button>
              <button
                onClick={() => { setMessageFormat('json'); formatJson(); }}
                className={`px-2 py-1 text-xs rounded ${messageFormat === 'json' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                JSON
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={!isConnected || !messageInput.trim()}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Message Log */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Messages</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{messages.length}</span>
            <button
              onClick={onClear}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-gray-500 text-xs py-8">
              No messages yet. Connect and start sending.
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={`px-3 py-1.5 rounded text-xs font-mono ${
                  msg.type === 'sent'
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400'
                    : msg.type === 'received'
                    ? 'bg-green-50 dark:bg-green-900/20 border-l-2 border-green-400'
                    : 'bg-gray-50 dark:bg-gray-800 border-l-2 border-gray-300 dark:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-sans ${
                    msg.type === 'sent' ? 'text-blue-500' : msg.type === 'received' ? 'text-green-500' : 'text-gray-400'
                  }`}>
                    {msg.type === 'sent' ? '\u2191' : msg.type === 'received' ? '\u2193' : '\u2022'} {formatTimestamp(msg.timestamp)}
                  </span>
                  <span className={`text-xs font-sans ${
                    msg.type === 'sent' ? 'text-blue-400' : msg.type === 'received' ? 'text-green-400' : 'text-gray-400'
                  }`}>
                    {msg.type}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap break-all text-xs text-gray-800 dark:text-gray-200">{msg.payload}</pre>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return '';
  }
}
