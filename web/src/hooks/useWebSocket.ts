import { useState, useCallback, useRef, useEffect } from 'react';
import type { WSMessage, WSConnectionStatus } from '../types';

interface RelayEnvelope {
  type: 'connected' | 'received' | 'error' | 'closed';
  url?: string;
  subprotocol?: string;
  payload?: string;
  format?: string;
  message?: string;
  code?: number;
  reason?: string;
  timestamp?: string;
}

let messageIdCounter = 0;

export function useWebSocket() {
  const [status, setStatus] = useState<WSConnectionStatus>('disconnected');
  const [messages, setMessages] = useState<WSMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback((url: string, headers: string, proxyId?: number | null, wsConnectionId?: number, subprotocols?: string[]) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const relayUrl = `${protocol}//${window.location.host}/api/ws/relay`;
    const ws = new WebSocket(relayUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send connect envelope
      const connectMsg: Record<string, unknown> = {
        type: 'connect',
        url,
        headers: headers || '{}',
      };
      if (proxyId !== undefined && proxyId !== null) {
        connectMsg.proxyId = proxyId;
      }
      if (wsConnectionId) {
        connectMsg.wsConnectionId = wsConnectionId;
      }
      if (subprotocols?.length) {
        connectMsg.subprotocols = subprotocols;
      }
      ws.send(JSON.stringify(connectMsg));
    };

    ws.onmessage = (event) => {
      const envelope: RelayEnvelope = JSON.parse(event.data);
      const ts = envelope.timestamp || new Date().toISOString();

      switch (envelope.type) {
        case 'connected': {
          setStatus('connected');
          const subInfo = envelope.subprotocol ? ` [${envelope.subprotocol}]` : '';
          setMessages(prev => [...prev, {
            id: String(++messageIdCounter),
            type: 'system',
            payload: `Connected to ${envelope.url}${subInfo}`,
            format: 'text',
            timestamp: ts,
          }]);
          break;
        }
        case 'received':
          setMessages(prev => [...prev, {
            id: String(++messageIdCounter),
            type: 'received',
            payload: envelope.payload || '',
            format: (envelope.format as 'text' | 'binary') || 'text',
            timestamp: ts,
          }]);
          break;
        case 'error':
          setMessages(prev => [...prev, {
            id: String(++messageIdCounter),
            type: 'system',
            payload: `Error: ${envelope.message}`,
            format: 'text',
            timestamp: ts,
          }]);
          setStatus('disconnected');
          break;
        case 'closed':
          setMessages(prev => [...prev, {
            id: String(++messageIdCounter),
            type: 'system',
            payload: `Connection closed (code: ${envelope.code}, reason: ${envelope.reason || 'N/A'})`,
            format: 'text',
            timestamp: ts,
          }]);
          setStatus('disconnected');
          break;
      }
    };

    ws.onerror = () => {
      setMessages(prev => [...prev, {
        id: String(++messageIdCounter),
        type: 'system',
        payload: 'WebSocket relay error',
        format: 'text',
        timestamp: new Date().toISOString(),
      }]);
      setStatus('disconnected');
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
    };
  }, []);

  const send = useCallback((payload: string, format: 'text' | 'binary' = 'text') => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'send', payload, format }));
      setMessages(prev => [...prev, {
        id: String(++messageIdCounter),
        type: 'sent',
        payload,
        format,
        timestamp: new Date().toISOString(),
      }]);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'close' }));
    }
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return { status, messages, connect, send, disconnect, clearMessages };
}
