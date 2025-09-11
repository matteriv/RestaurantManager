import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  performHealthCheck, 
  getApiConfig, 
  shouldRetryConnection,
  initializeApiConfig 
} from '@/lib/queryClient';
import { useSystemConfig } from './useSystemConfig';

export interface ConnectionHealth {
  isHealthy: boolean;
  isOnline: boolean;
  isChecking: boolean;
  lastCheck?: Date;
  latency?: number;
  error?: string;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

export interface UseConnectionHealthOptions {
  checkInterval?: number; // milliseconds
  maxRetries?: number;
  enabled?: boolean;
  onConnectionLost?: () => void;
  onConnectionRestored?: () => void;
  onError?: (error: string) => void;
}

export function useConnectionHealth(options: UseConnectionHealthOptions = {}) {
  const {
    checkInterval = 30000, // 30 seconds
    maxRetries = 5,
    enabled = true,
    onConnectionLost,
    onConnectionRestored,
    onError,
  } = options;

  const { config } = useSystemConfig();
  
  const [health, setHealth] = useState<ConnectionHealth>({
    isHealthy: true,
    isOnline: navigator.onLine,
    isChecking: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: maxRetries,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const wasHealthyRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const performCheck = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    if (!enabled || !navigator.onLine) {
      return false;
    }

    const apiConfig = getApiConfig();
    
    // For server mode or no remote config, always consider healthy
    if (!apiConfig.isRemote) {
      setHealth(prev => ({
        ...prev,
        isHealthy: true,
        lastCheck: new Date(),
        error: undefined,
        latency: 0,
      }));
      return true;
    }

    try {
      setHealth(prev => ({ ...prev, isChecking: true }));
      
      const startTime = Date.now();
      const isHealthy = await performHealthCheck(5000);
      const latency = Date.now() - startTime;

      if (signal?.aborted) {
        return health.isHealthy;
      }

      const newHealth: Partial<ConnectionHealth> = {
        isHealthy,
        lastCheck: new Date(),
        latency,
        isChecking: false,
      };

      if (isHealthy) {
        newHealth.error = undefined;
        newHealth.reconnectAttempts = 0;
        
        // Notify if connection was restored
        if (!wasHealthyRef.current) {
          onConnectionRestored?.();
        }
      } else {
        newHealth.error = 'Health check failed';
        newHealth.reconnectAttempts = Math.min(health.reconnectAttempts + 1, maxRetries);
        
        // Notify if connection was lost
        if (wasHealthyRef.current) {
          onConnectionLost?.();
        }
        
        onError?.(newHealth.error);
      }

      setHealth(prev => ({ ...prev, ...newHealth }));
      wasHealthyRef.current = isHealthy;
      
      return isHealthy;
    } catch (error: any) {
      if (signal?.aborted) {
        return health.isHealthy;
      }

      const errorMessage = error.message || 'Health check error';
      
      setHealth(prev => ({
        ...prev,
        isHealthy: false,
        isChecking: false,
        error: errorMessage,
        lastCheck: new Date(),
        reconnectAttempts: Math.min(prev.reconnectAttempts + 1, maxRetries),
      }));
      
      if (wasHealthyRef.current) {
        onConnectionLost?.();
      }
      
      onError?.(errorMessage);
      wasHealthyRef.current = false;
      
      return false;
    }
  }, [enabled, health.reconnectAttempts, maxRetries, onConnectionLost, onConnectionRestored, onError]);

  const startHealthCheck = useCallback(() => {
    if (!enabled) return;

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Perform initial check
    performCheck();

    // Set up periodic checks
    intervalRef.current = setInterval(() => {
      // Only check if we should retry connection or if currently healthy
      if (shouldRetryConnection() || health.isHealthy) {
        performCheck();
      }
    }, checkInterval);
  }, [enabled, checkInterval, performCheck, health.isHealthy]);

  const stopHealthCheck = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const forceCheck = useCallback(async (): Promise<boolean> => {
    // Cancel any ongoing check
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    return await performCheck(abortControllerRef.current.signal);
  }, [performCheck]);

  const reset = useCallback(() => {
    setHealth(prev => ({
      ...prev,
      reconnectAttempts: 0,
      error: undefined,
    }));
    wasHealthyRef.current = true;
  }, []);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setHealth(prev => ({ ...prev, isOnline: true }));
      if (enabled) {
        forceCheck();
      }
    };

    const handleOffline = () => {
      setHealth(prev => ({ 
        ...prev, 
        isOnline: false,
        isHealthy: false,
        error: 'Network offline',
      }));
      
      if (wasHealthyRef.current) {
        onConnectionLost?.();
      }
      wasHealthyRef.current = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [enabled, forceCheck, onConnectionLost]);

  // Start/stop health check based on config changes
  useEffect(() => {
    if (config && enabled) {
      // Initialize API config and start health check
      initializeApiConfig(config).then(() => {
        startHealthCheck();
      });
    } else {
      stopHealthCheck();
    }

    return () => {
      stopHealthCheck();
    };
  }, [config, enabled, startHealthCheck, stopHealthCheck]);

  // Handle browser visibility change to pause/resume checks
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopHealthCheck();
      } else if (enabled) {
        startHealthCheck();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, startHealthCheck, stopHealthCheck]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopHealthCheck();
    };
  }, [stopHealthCheck]);

  return {
    health,
    forceCheck,
    reset,
    start: startHealthCheck,
    stop: stopHealthCheck,
  };
}