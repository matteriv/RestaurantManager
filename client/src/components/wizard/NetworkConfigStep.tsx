import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Wifi, 
  Server, 
  Search,
  Zap,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Network,
  Shield,
  Clock
} from 'lucide-react';
import { useSystemConfig } from '@/hooks/useSystemConfig';
import { performHealthCheck, initializeApiConfig } from '@/lib/queryClient';
import type { WizardConfig } from '../ConfigurationWizard';

interface NetworkConfigStepProps {
  config: WizardConfig;
  onConfigChange: (updates: Partial<WizardConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

interface DiscoveredServer {
  id: string;
  name: string;
  address: string;
  port: number;
  version: string;
  features: string[];
  lastSeen: Date;
  latency?: number;
  isReachable: boolean;
}

export function NetworkConfigStep({ config, onConfigChange }: NetworkConfigStepProps) {
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [manualConfig, setManualConfig] = useState({
    address: config.serverAddress || '',
    port: config.serverPort || 5000,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [connectionTestResults, setConnectionTestResults] = useState<Record<string, { success: boolean; latency?: number; error?: string }>>({});

  // Use the system config hook for real discovery functionality
  const {
    discoveredServers,
    isDiscovering,
    startDiscovery,
    stopDiscovery,
    testConnection,
  } = useSystemConfig();

  const isServerMode = config.mode === 'server';
  const isClientMode = config.mode === 'client';
  const isAutoMode = config.mode === 'auto';

  useEffect(() => {
    if (isAutoMode || isClientMode) {
      handleStartDiscovery();
    }
    
    // Cleanup discovery on unmount - always call stopDiscovery to be safe
    return () => {
      stopDiscovery();
    };
  }, [config.mode, stopDiscovery]);

  const handleStartDiscovery = async () => {
    try {
      await startDiscovery();
    } catch (error) {
      console.error('Discovery failed:', error);
    }
  };

  const handleSelectServer = (server: DiscoveredServer) => {
    setSelectedServerId(server.id);
    onConfigChange({
      serverAddress: server.address,
      serverPort: server.port,
    });
    setErrors({});
  };

  const handleManualConfigChange = (field: 'address' | 'port', value: string | number) => {
    const updatedConfig = { ...manualConfig, [field]: value };
    setManualConfig(updatedConfig);
    onConfigChange({
      serverAddress: updatedConfig.address,
      serverPort: updatedConfig.port,
    });
    
    // Clear errors
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleTestConnection = async (server: DiscoveredServer) => {
    try {
      const result = await testConnection(server.address, server.port);
      setConnectionTestResults(prev => ({
        ...prev,
        [server.id]: result
      }));
    } catch (error: any) {
      setConnectionTestResults(prev => ({
        ...prev,
        [server.id]: { success: false, error: error.message }
      }));
    }
  };

  const handleTestManualConnection = async () => {
    if (!manualConfig.address || !manualConfig.port) {
      setErrors({ address: 'Please enter server address and port' });
      return;
    }

    try {
      const result = await testConnection(manualConfig.address, manualConfig.port);
      setConnectionTestResults(prev => ({
        ...prev,
        manual: result
      }));
      
      if (result.success) {
        setErrors({});
        // If successful, initialize API config for this server
        await initializeApiConfig({
          mode: config.mode,
          networkConfig: {
            serverAddress: manualConfig.address,
            serverPort: manualConfig.port,
          }
        } as any);
      } else {
        setErrors({ connection: result.error || 'Connection test failed' });
      }
    } catch (error: any) {
      setErrors({ connection: error.message || 'Connection test failed' });
    }
  };

  const handleToggleAutoDiscovery = (enabled: boolean) => {
    onConfigChange({ autoDiscovery: enabled });
  };

  const validateConfiguration = () => {
    const newErrors: Record<string, string> = {};
    
    if (isClientMode && !config.autoDiscovery) {
      if (!manualConfig.address.trim()) {
        newErrors.address = 'Server address is required';
      }
      if (!manualConfig.port || manualConfig.port < 1 || manualConfig.port > 65535) {
        newErrors.port = 'Valid port number is required';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isConfigurationComplete = () => {
    if (isServerMode) return true;
    if (isAutoMode) {
      return config.autoDiscovery ? discoveredServers.length > 0 : validateConfiguration();
    }
    if (isClientMode) {
      return config.autoDiscovery ? selectedServerId !== null : validateConfiguration();
    }
    return false;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Network Configuration</h3>
        <p className="text-muted-foreground">
          {isServerMode && "Configure how other devices can connect to this server."}
          {isClientMode && "Configure connection to the restaurant server."}
          {isAutoMode && "Automatically discover and configure network settings."}
        </p>
      </div>

      {/* Server Mode Configuration */}
      {isServerMode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Server className="w-5 h-5" />
              <span>Server Configuration</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="server-port">Server Port</Label>
                <Input
                  id="server-port"
                  type="number"
                  min="1"
                  max="65535"
                  value={manualConfig.port}
                  onChange={(e) => handleManualConfigChange('port', parseInt(e.target.value))}
                  data-testid="input-server-port"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Port for client connections (default: 5000)
                </p>
              </div>
              
              <div>
                <Label>Network Interfaces</Label>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center space-x-2 text-sm">
                    <Network className="w-4 h-4 text-green-500" />
                    <span>192.168.1.100</span>
                    <Badge variant="secondary">Wi-Fi</Badge>
                  </div>
                  <div className="flex items-center space-x-2 text-sm mt-1">
                    <Network className="w-4 h-4 text-green-500" />
                    <span>0.0.0.0</span>
                    <Badge variant="secondary">All Interfaces</Badge>
                  </div>
                </div>
              </div>
            </div>

            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                <strong>Server Mode:</strong> This device will host the database and serve other client devices. 
                Make sure this device has a stable network connection and sufficient resources.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Auto Discovery (Client and Auto modes) */}
      {(isClientMode || isAutoMode) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Search className="w-5 h-5" />
              <span>Server Discovery</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={config.autoDiscovery}
                  onCheckedChange={handleToggleAutoDiscovery}
                  data-testid="switch-auto-discovery"
                />
                <Label>Enable Automatic Discovery</Label>
              </div>
              
              {config.autoDiscovery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStartDiscovery}
                  disabled={isDiscovering}
                  data-testid="button-refresh-discovery"
                >
                  {isDiscovering ? (
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Search className="w-4 h-4 mr-2" />
                  )}
                  {isDiscovering ? 'Scanning...' : 'Scan Network'}
                </Button>
              )}
            </div>

            {config.autoDiscovery && (
              <div className="space-y-3">
                {isDiscovering && (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg">
                        <Skeleton className="w-8 h-8 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!isDiscovering && discoveredServers.length === 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No servers found on the network. Make sure a RestaurantOS server is running and accessible.
                    </AlertDescription>
                  </Alert>
                )}

                {discoveredServers.map((server) => (
                  <Card 
                    key={server.id}
                    className={`cursor-pointer transition-all ${
                      selectedServerId === server.id 
                        ? 'ring-2 ring-primary border-primary' 
                        : 'hover:border-muted-foreground/50'
                    }`}
                    onClick={() => handleSelectServer(server)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                            <Server className="w-5 h-5 text-green-500" />
                          </div>
                          <div>
                            <h4 className="font-medium">{server.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {server.address}:{server.port}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {server.latency && (
                            <Badge variant="secondary" className="text-xs">
                              <Clock className="w-3 h-3 mr-1" />
                              {server.latency}ms
                            </Badge>
                          )}
                          {server.isReachable ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-red-500" />
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 mt-3">
                        <span className="text-xs text-muted-foreground">Features:</span>
                        {server.features.map((feature) => (
                          <Badge key={feature} variant="outline" className="text-xs">
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual Configuration (Client mode when auto-discovery is off) */}
      {isClientMode && !config.autoDiscovery && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Network className="w-5 h-5" />
              <span>Manual Server Configuration</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="server-address">
                  Server IP Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="server-address"
                  placeholder="192.168.1.100"
                  value={manualConfig.address}
                  onChange={(e) => handleManualConfigChange('address', e.target.value)}
                  className={errors.address ? 'border-destructive' : ''}
                  data-testid="input-server-address"
                />
                {errors.address && (
                  <p className="text-sm text-destructive mt-1">{errors.address}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="manual-port">
                  Port <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="manual-port"
                  type="number"
                  min="1"
                  max="65535"
                  value={manualConfig.port}
                  onChange={(e) => handleManualConfigChange('port', parseInt(e.target.value))}
                  className={errors.port ? 'border-destructive' : ''}
                  data-testid="input-manual-port"
                />
                {errors.port && (
                  <p className="text-sm text-destructive mt-1">{errors.port}</p>
                )}
              </div>
            </div>

            <Alert>
              <Network className="h-4 w-4" />
              <AlertDescription>
                Enter the IP address and port of your RestaurantOS server. Contact your system administrator if you're unsure about these values.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Configuration Summary */}
      {isConfigurationComplete() && (
        <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <h5 className="font-medium text-green-900 dark:text-green-100 mb-1">
                  Network Configuration Ready
                </h5>
                <div className="text-green-700 dark:text-green-300 space-y-1">
                  {isServerMode && (
                    <p>• Server will listen on port {config.serverPort}</p>
                  )}
                  {(isClientMode || isAutoMode) && selectedServerId && (
                    <p>• Will connect to {config.serverAddress}:{config.serverPort}</p>
                  )}
                  {(isClientMode || isAutoMode) && !selectedServerId && config.autoDiscovery && (
                    <p>• Auto-discovery enabled for server detection</p>
                  )}
                  <p>• Client ID: {config.clientId}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}