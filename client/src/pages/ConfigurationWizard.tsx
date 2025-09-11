import { useEffect } from 'react';
import { useLocation } from 'wouter';
import ConfigurationWizard from '@/components/ConfigurationWizard';
import { useSystemConfig } from '@/hooks/useSystemConfig';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { WizardConfig } from '@/components/ConfigurationWizard';

interface ConfigurationWizardPageProps {
  isReconfigure?: boolean;
}

export default function ConfigurationWizardPage({ isReconfigure = false }: ConfigurationWizardPageProps) {
  const [, navigate] = useLocation();
  const { 
    config,
    isLoading,
    error,
    completeSetup,
    updateConfig,
    isSetupComplete,
  } = useSystemConfig();

  // Redirect if setup is already complete and this isn't a reconfiguration
  useEffect(() => {
    if (!isReconfigure && isSetupComplete) {
      navigate('/');
    }
  }, [isSetupComplete, isReconfigure, navigate]);

  const handleComplete = async (wizardConfig: WizardConfig) => {
    try {
      if (isReconfigure) {
        // Update existing configuration
        await updateConfig(wizardConfig);
      } else {
        // Complete initial setup
        await completeSetup(wizardConfig);
      }
      
      // Navigate to home page after successful configuration
      navigate('/');
    } catch (error) {
      console.error('Failed to complete configuration:', error);
      // Error handling is managed by the wizard component through mutations
    }
  };

  const handleCancel = () => {
    if (isReconfigure) {
      // Return to home if reconfiguring
      navigate('/');
    } else {
      // For initial setup, there's nowhere to go back to
      // Could show a confirmation dialog or just stay on the wizard
      console.log('Setup cancelled - staying on wizard');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6 max-w-6xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center mb-4">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Loading Configuration
            </h1>
            <p className="text-muted-foreground">
              Checking system configuration...
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar skeleton */}
            <div className="lg:col-span-1">
              <div className="space-y-4">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            </div>

            {/* Main content skeleton */}
            <div className="lg:col-span-3">
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-96 w-full" />
                <div className="flex justify-between">
                  <Skeleton className="h-10 w-24" />
                  <Skeleton className="h-10 w-24" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6 max-w-2xl">
          <div className="mt-24">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <h3 className="font-semibold mb-2">Configuration Error</h3>
                <p className="mb-4">
                  Failed to load system configuration. This could be due to:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Database connection issues</li>
                  <li>Network connectivity problems</li>
                  <li>Corrupted configuration data</li>
                </ul>
                <p className="mt-4 text-sm">
                  <strong>Error details:</strong> {error.message}
                </p>
              </AlertDescription>
            </Alert>
            
            <div className="mt-6 text-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
              >
                Retry Loading
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Convert system config to wizard config format if available
  const existingConfig: Partial<WizardConfig> | undefined = config ? {
    restaurantName: config.restaurantName || '',
    restaurantAddress: config.restaurantAddress || '',
    mode: config.mode as 'server' | 'client' | 'auto' || 'auto',
    enabledModules: config.enabledModules ? JSON.parse(config.enabledModules) : [],
    theme: config.theme as 'light' | 'dark' || 'light',
    language: config.language || 'en',
    clientId: config.clientId || '',
    // Parse network config if available
    ...(config.networkConfig ? (() => {
      try {
        const networkConfig = JSON.parse(config.networkConfig);
        return {
          serverAddress: networkConfig.serverAddress || '',
          serverPort: networkConfig.serverPort || 5000,
          autoDiscovery: networkConfig.autoDiscovery ?? true,
        };
      } catch {
        return {
          serverAddress: '',
          serverPort: 5000,
          autoDiscovery: true,
        };
      }
    })() : {
      serverAddress: '',
      serverPort: 5000,
      autoDiscovery: true,
    }),
  } : undefined;

  return (
    <ConfigurationWizard
      isReconfigure={isReconfigure}
      existingConfig={existingConfig}
      onComplete={handleComplete}
      onCancel={!isReconfigure ? undefined : handleCancel}
    />
  );
}