import { QueryClient, QueryFunction } from "@tanstack/react-query";
import type { SystemConfig } from "@shared/schema";

// Global configuration for API endpoints
interface ApiConfig {
  baseUrl: string;
  mode: 'server' | 'client' | 'auto';
  isRemote: boolean;
  lastHealthCheck?: Date;
  isHealthy: boolean;
}

let apiConfig: ApiConfig = {
  baseUrl: '', // Will be set based on mode
  mode: 'auto',
  isRemote: false,
  isHealthy: true,
};

// Initialize API configuration based on system config
export async function initializeApiConfig(systemConfig?: SystemConfig | null): Promise<void> {
  if (!systemConfig) {
    // Default to local mode during setup
    apiConfig = {
      baseUrl: window.location.origin,
      mode: 'auto',
      isRemote: false,
      isHealthy: true,
    };
    return;
  }

  const mode = systemConfig.mode || 'auto';
  const networkConfig = systemConfig.networkConfig as any;
  
  if (mode === 'server' || (!networkConfig?.serverAddress)) {
    // Server mode or no remote config - use local endpoints
    apiConfig = {
      baseUrl: window.location.origin,
      mode,
      isRemote: false,
      isHealthy: true,
    };
  } else {
    // Client mode with remote server
    const serverAddress = networkConfig.serverAddress;
    const serverPort = networkConfig.serverPort || 5000;
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const baseUrl = `${protocol}//${serverAddress}:${serverPort}`;
    
    apiConfig = {
      baseUrl,
      mode,
      isRemote: true,
      isHealthy: true,
    };
    
    // Perform initial health check
    await performHealthCheck();
  }
  
  console.log('API Configuration initialized:', apiConfig);
}

// Get current API configuration
export function getApiConfig(): ApiConfig {
  return { ...apiConfig };
}

// Build full URL for API requests
export function buildApiUrl(endpoint: string): string {
  // Remove leading slash if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  
  // For local requests, use relative URLs
  if (!apiConfig.isRemote) {
    return `/${cleanEndpoint}`;
  }
  
  // For remote requests, use full URL
  return `${apiConfig.baseUrl}/${cleanEndpoint}`;
}

// Perform health check on remote server
export async function performHealthCheck(timeout: number = 5000): Promise<boolean> {
  if (!apiConfig.isRemote) {
    apiConfig.isHealthy = true;
    return true;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(buildApiUrl('/api/health'), {
      method: 'GET',
      signal: controller.signal,
      credentials: 'include',
    });
    
    clearTimeout(timeoutId);
    
    const isHealthy = response.ok;
    apiConfig.isHealthy = isHealthy;
    apiConfig.lastHealthCheck = new Date();
    
    if (!isHealthy) {
      console.warn('Health check failed:', response.status, response.statusText);
    }
    
    return isHealthy;
  } catch (error: any) {
    console.error('Health check error:', error.message);
    apiConfig.isHealthy = false;
    apiConfig.lastHealthCheck = new Date();
    return false;
  }
}

// Check if we should retry connection
export function shouldRetryConnection(): boolean {
  if (!apiConfig.isRemote) return false;
  if (apiConfig.isHealthy) return false;
  
  const lastCheck = apiConfig.lastHealthCheck;
  if (!lastCheck) return true;
  
  // Retry every 30 seconds
  return (Date.now() - lastCheck.getTime()) > 30000;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = buildApiUrl(url);
  
  // Check health for remote connections
  if (apiConfig.isRemote && !apiConfig.isHealthy && shouldRetryConnection()) {
    await performHealthCheck();
  }
  
  const res = await fetch(fullUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// Enhanced API request function with better error handling for multi-client
export async function safeApiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response | null> {
  try {
    return await apiRequest(method, url, data);
  } catch (error: any) {
    console.error('API request failed:', error.message);
    
    // For remote connections, mark as unhealthy and try to reconnect
    if (apiConfig.isRemote) {
      apiConfig.isHealthy = false;
      
      // Emit event for connection loss
      window.dispatchEvent(new CustomEvent('api-connection-lost', {
        detail: { error: error.message, url }
      }));
    }
    
    return null;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const endpoint = queryKey.join("/") as string;
    const fullUrl = buildApiUrl(endpoint);
    
    // Check health for remote connections
    if (apiConfig.isRemote && !apiConfig.isHealthy && shouldRetryConnection()) {
      await performHealthCheck();
    }
    
    const res = await fetch(fullUrl, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});