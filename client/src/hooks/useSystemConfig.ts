import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { SystemConfig, InsertSystemConfig } from '@shared/schema';
import type { WizardConfig } from '@/components/ConfigurationWizard';

interface NetworkDiscoveryService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getDiscoveredServers(): Promise<DiscoveredServer[]>;
}

interface DiscoveredServer {
  id: string;
  name: string;
  address: string;
  port: number;
  version: string;
  features: string[];
  lastSeen: Date;
  isReachable: boolean;
  latency?: number;
}

interface SystemConfigHook {
  // Configuration data
  config: SystemConfig | undefined;
  isLoading: boolean;
  error: Error | null;

  // Setup status
  isSetupComplete: boolean;
  isFirstRun: boolean;

  // Configuration actions
  updateConfig: (updates: Partial<WizardConfig>) => Promise<void>;
  completeSetup: (config: WizardConfig) => Promise<void>;
  resetConfig: () => Promise<void>;

  // Network discovery
  discoveredServers: DiscoveredServer[];
  isDiscovering: boolean;
  startDiscovery: () => Promise<void>;
  stopDiscovery: () => Promise<void>;

  // Utility functions
  testConnection: (address: string, port: number) => Promise<{ success: boolean; latency?: number; error?: string }>;
  exportConfig: () => string;
  importConfig: (configData: string) => Promise<void>;
}

export function useSystemConfig(): SystemConfigHook {
  const queryClient = useQueryClient();
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Fetch system configuration
  const {
    data: config,
    isLoading,
    error,
  } = useQuery<SystemConfig>({
    queryKey: ['/api/system/config'],
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Check if setup is complete
  const isSetupComplete = config?.setupComplete ?? false;
  const isFirstRun = !config;

  // Update configuration mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (updates: Partial<WizardConfig>): Promise<void> => {
      // Convert WizardConfig to InsertSystemConfig format
      const systemConfigUpdates: Partial<InsertSystemConfig> = {
        restaurantName: updates.restaurantName,
        restaurantAddress: updates.restaurantAddress,
        mode: updates.mode,
        enabledModules: updates.enabledModules,
        theme: updates.theme,
        language: updates.language,
        clientId: updates.clientId,
        networkConfig: updates.serverAddress && updates.serverPort ? {
          serverAddress: updates.serverAddress,
          serverPort: updates.serverPort,
          autoDiscovery: updates.autoDiscovery,
        } : undefined,
      };

      await apiRequest({
        url: '/api/system/config',
        method: 'PUT',
        body: systemConfigUpdates,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/system/config'] });
    },
  });

  // Complete setup mutation
  const completeSetupMutation = useMutation({
    mutationFn: async (wizardConfig: WizardConfig): Promise<void> => {
      const systemConfig: Partial<InsertSystemConfig> = {
        setupComplete: true,
        restaurantName: wizardConfig.restaurantName,
        restaurantAddress: wizardConfig.restaurantAddress,
        mode: wizardConfig.mode,
        enabledModules: wizardConfig.enabledModules,
        theme: wizardConfig.theme,
        language: wizardConfig.language,
        clientId: wizardConfig.clientId,
        networkConfig: {
          serverAddress: wizardConfig.serverAddress,
          serverPort: wizardConfig.serverPort,
          autoDiscovery: wizardConfig.autoDiscovery,
        },
      };

      await apiRequest({
        url: '/api/system/config',
        method: 'POST',
        body: systemConfig,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/system/config'] });
    },
  });

  // Reset configuration mutation
  const resetConfigMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      await apiRequest({
        url: '/api/system/config/reset',
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/system/config'] });
    },
  });

  // Network discovery functions
  const startDiscovery = async () => {
    setIsDiscovering(true);
    setDiscoveredServers([]);
    
    try {
      // Check if we're in Electron environment
      if (window.electronAPI?.networkDiscovery) {
        await window.electronAPI.networkDiscovery.start();
        
        // Set up listener for discovered servers
        window.electronAPI.networkDiscovery.onServerDiscovered((server: DiscoveredServer) => {
          setDiscoveredServers(prev => {
            const existing = prev.find(s => s.id === server.id);
            if (existing) {
              return prev.map(s => s.id === server.id ? server : s);
            } else {
              return [...prev, server];
            }
          });
        });
      } else {
        // Fallback for web environment - use API endpoint
        await apiRequest({
          url: '/api/system/discovery/start',
          method: 'POST',
        });
        
        // Poll for discovered servers
        const pollServers = async () => {
          try {
            const servers = await apiRequest({
              url: '/api/system/discovery/servers',
              method: 'GET',
            }) as DiscoveredServer[];
            setDiscoveredServers(servers);
          } catch (error) {
            console.error('Failed to poll servers:', error);
          }
        };
        
        // Poll every 2 seconds for 30 seconds
        const pollInterval = setInterval(pollServers, 2000);
        setTimeout(() => {
          clearInterval(pollInterval);
          setIsDiscovering(false);
        }, 30000);
      }
    } catch (error) {
      console.error('Failed to start network discovery:', error);
      setIsDiscovering(false);
    }
  };

  const stopDiscovery = async () => {
    setIsDiscovering(false);
    
    try {
      if (window.electronAPI?.networkDiscovery) {
        await window.electronAPI.networkDiscovery.stop();
      } else {
        await apiRequest({
          url: '/api/system/discovery/stop',
          method: 'POST',
        });
      }
    } catch (error) {
      console.error('Failed to stop network discovery:', error);
    }
  };

  // Test connection function
  const testConnection = async (address: string, port: number): Promise<{ success: boolean; latency?: number; error?: string }> => {
    try {
      const result = await apiRequest({
        url: '/api/system/test-connection',
        method: 'POST',
        body: { address, port },
      }) as { success: boolean; latency?: number; error?: string };
      
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Connection test failed',
      };
    }
  };

  // Configuration export/import
  const exportConfig = () => {
    if (!config) return '{}';
    
    const exportData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      config: config,
    };
    
    return JSON.stringify(exportData, null, 2);
  };

  const importConfig = async (configData: string) => {
    try {
      const parsed = JSON.parse(configData);
      
      if (parsed.config) {
        await updateConfigMutation.mutateAsync(parsed.config);
      } else {
        throw new Error('Invalid configuration format');
      }
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Clean up discovery on unmount
  useEffect(() => {
    return () => {
      if (isDiscovering) {
        stopDiscovery();
      }
    };
  }, [isDiscovering]);

  return {
    // Configuration data
    config,
    isLoading,
    error: error as Error | null,

    // Setup status  
    isSetupComplete,
    isFirstRun,

    // Configuration actions
    updateConfig: async (updates: Partial<WizardConfig>) => {
      await updateConfigMutation.mutateAsync(updates);
    },
    completeSetup: async (config: WizardConfig) => {
      await completeSetupMutation.mutateAsync(config);
    },
    resetConfig: async () => {
      await resetConfigMutation.mutateAsync();
    },

    // Network discovery
    discoveredServers,
    isDiscovering,
    startDiscovery,
    stopDiscovery,

    // Utility functions
    testConnection,
    exportConfig,
    importConfig,
  };
}

// Additional hook for checking setup status without loading full config
export function useSetupStatus() {
  const { data: status } = useQuery<{ setupComplete: boolean }>({
    queryKey: ['/api/system/setup-status'],
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    isSetupComplete: status?.setupComplete ?? false,
    isLoading: !status,
  };
}

// Type declarations for Electron API
declare global {
  interface Window {
    electronAPI?: {
      networkDiscovery?: {
        start(): Promise<void>;
        stop(): Promise<void>;
        onServerDiscovered(callback: (server: DiscoveredServer) => void): void;
      };
    };
  }
}