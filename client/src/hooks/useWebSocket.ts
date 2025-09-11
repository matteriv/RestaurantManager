import { useEffect, useRef, useState, useCallback } from 'react';
import { getApiConfig, shouldRetryConnection } from '@/lib/queryClient';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp?: number;
  clientId?: string;
  origin?: string;
}

interface UseWebSocketOptions {
  clientType?: 'pos' | 'kds' | 'customer' | 'admin';
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  onReconnectAttempt?: (attempt: number, maxAttempts: number) => void;
  onReconnectFailed?: () => void;
  enabled?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;
  const clientIdRef = useRef<string | null>(null);

  // Generate unique client ID
  useEffect(() => {
    if (!clientIdRef.current) {
      clientIdRef.current = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }, []);

  const getWebSocketUrl = useCallback(() => {
    const apiConfig = getApiConfig();
    
    if (apiConfig.isRemote) {
      // For remote connections, extract host and port from baseUrl
      try {
        const url = new URL(apiConfig.baseUrl);
        const protocol = url.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${url.host}/ws`;
      } catch (error) {
        console.error('Error parsing remote URL for WebSocket:', error);
        throw new Error('Invalid remote server configuration');
      }
    } else {
      // For local connections, use current host
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${window.location.host}/ws`;
    }
  }, []);

  const connect = useCallback(() => {
    if (!options.enabled && options.enabled !== undefined) {
      console.log('WebSocket connection disabled');
      return;
    }

    console.log('connect() called - current state:', ws.current?.readyState);
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already open, skipping connection');
      return;
    }

    // For initial connection, check health status, but allow reconnection attempts
    // to run independently with their own backoff logic
    if (reconnectAttempts.current === 0 && !shouldRetryConnection()) {
      console.log('Health check suggests server unavailable, but will still attempt connection');
      // Continue with connection attempt - WebSocket has its own retry logic
    }

    try {
      const wsUrl = getWebSocketUrl();
      console.log('Connecting to WebSocket:', wsUrl);
      
      setConnectionError(null);
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        
        // Register client with enhanced information
        if (options.clientType) {
          const registrationMessage = {
            type: 'register',
            clientType: options.clientType,
            clientId: clientIdRef.current,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            capabilities: {
              canReceiveOrders: options.clientType === 'pos' || options.clientType === 'admin',
              canProcessOrders: options.clientType === 'kds' || options.clientType === 'admin',
              canDisplayCustomerInfo: options.clientType === 'customer' || options.clientType === 'admin',
            }
          };
          
          console.log('Registering client:', registrationMessage);
          ws.current?.send(JSON.stringify(registrationMessage));
        }
        
        options.onConnect?.();
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket disconnected - Code:', event.code, 'Reason:', event.reason, 'Clean:', event.wasClean);
        setIsConnected(false);
        
        // Set connection error for unexpected closures
        if (!event.wasClean) {
          setConnectionError(`Connection lost: ${event.reason || 'Unknown reason'}`);
        }
        
        options.onDisconnect?.();
        
        // Attempt to reconnect if enabled and within limits
        if (options.enabled !== false && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
          
          console.log(`Attempting to reconnect (${reconnectAttempts.current}/${maxReconnectAttempts}) in ${backoffMs}ms`);
          options.onReconnectAttempt?.(reconnectAttempts.current, maxReconnectAttempts);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            // Always attempt reconnection up to maxReconnectAttempts
            // Health checks inform UI but don't block reconnection attempts
            const isHealthy = shouldRetryConnection();
            if (!isHealthy) {
              console.log('Health check indicates server may be unavailable, but attempting reconnect anyway');
            }
            connect();
          }, backoffMs);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          console.log('Max reconnection attempts reached');
          setConnectionError('Failed to reconnect after multiple attempts');
          options.onReconnectFailed?.();
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionError('WebSocket connection error');
        options.onError?.(error);
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          // Add timestamp if not present
          if (!message.timestamp) {
            message.timestamp = Date.now();
          }
          
          // Log received message for debugging
          console.log('WebSocket message received:', message.type, message);
          
          setLastMessage(message);
          options.onMessage?.(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error, 'Raw data:', event.data);
        }
      };


    } catch (error: any) {
      console.error('Error creating WebSocket connection:', error);
      setConnectionError(error.message || 'Failed to create WebSocket connection');
      
      // Attempt reconnection if enabled
      if (options.enabled !== false && reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        const backoffMs = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 30000);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, backoffMs);
      }
    }
  }, [options.enabled, getWebSocketUrl]);

  const disconnect = useCallback(() => {
    console.log('Disconnecting WebSocket');
    
    // Clear reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Close WebSocket connection
    if (ws.current) {
      ws.current.close(1000, 'Client disconnect');
      ws.current = null;
    }
    
    setIsConnected(false);
    setConnectionError(null);
    reconnectAttempts.current = 0;
  }, []);

  const sendMessage = useCallback((type: string, data: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type,
        data,
        timestamp: Date.now(),
        clientId: clientIdRef.current,
        origin: options.clientType || 'unknown'
      };
      
      console.log('Sending WebSocket message:', message);
      ws.current.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('WebSocket not connected, cannot send message. State:', ws.current?.readyState);
      return false;
    }
  }, [options.clientType]);

  const forceReconnect = useCallback(() => {
    disconnect();
    reconnectAttempts.current = 0;
    connect();
  }, [connect, disconnect]);

  // Handle API config changes
  useEffect(() => {
    const apiConfig = getApiConfig();
    if (isConnected && apiConfig.isRemote) {
      // If API config changed to remote while connected, reconnect to new server
      console.log('API config changed, reconnecting WebSocket');
      forceReconnect();
    }
  }, [isConnected, forceReconnect]);

  // Main connection effect
  useEffect(() => {
    if (options.enabled === false) {
      console.log('WebSocket disabled, not connecting');
      return;
    }

    console.log('useWebSocket useEffect called with clientType:', options.clientType, 'enabled:', options.enabled);
    connect();
    
    return () => {
      console.log('useWebSocket cleanup called for clientType:', options.clientType);
      disconnect();
    };
  }, [connect, disconnect, options.clientType, options.enabled]);

  // Handle visibility change to optimize connections
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('Page hidden, pausing WebSocket activity');
      } else {
        console.log('Page visible, resuming WebSocket activity');
        if (!isConnected && options.enabled !== false) {
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isConnected, connect, options.enabled]);

  return {
    // Connection state
    isConnected,
    connectionError,
    reconnectAttempts: reconnectAttempts.current,
    maxReconnectAttempts,
    
    // Message handling
    lastMessage,
    sendMessage,
    
    // Connection control
    connect,
    disconnect,
    forceReconnect,
    
    // Client info
    clientId: clientIdRef.current,
    clientType: options.clientType,
  };
}
