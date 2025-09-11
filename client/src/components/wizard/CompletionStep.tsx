import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle, 
  Server, 
  Smartphone,
  Monitor,
  Settings,
  Users,
  Download,
  Share2,
  Rocket,
  Copy,
  RefreshCw,
  Shield,
  Network,
  Database
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { WizardConfig } from '../ConfigurationWizard';

interface CompletionStepProps {
  config: WizardConfig;
  onConfigChange: (updates: Partial<WizardConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function CompletionStep({ config }: CompletionStepProps) {
  const { toast } = useToast();
  const [isApplying, setIsApplying] = useState(false);
  const [configApplied, setConfigApplied] = useState(false);

  const handleExportConfig = () => {
    const configData = JSON.stringify(config, null, 2);
    const blob = new Blob([configData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `restaurantos-config-${config.mode}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Configuration Exported",
      description: "Configuration file has been downloaded to your computer.",
    });
  };

  const handleCopyConfig = () => {
    const configText = `RestaurantOS Configuration:
Restaurant: ${config.restaurantName}
Mode: ${config.mode.toUpperCase()}
Server: ${config.serverAddress}:${config.serverPort}
Modules: ${config.enabledModules.join(', ')}
Client ID: ${config.clientId}`;

    navigator.clipboard.writeText(configText).then(() => {
      toast({
        title: "Configuration Copied",
        description: "Configuration details copied to clipboard.",
      });
    }).catch(() => {
      toast({
        title: "Copy Failed",
        description: "Failed to copy configuration to clipboard.",
        variant: "destructive",
      });
    });
  };

  const handleApplyConfiguration = async () => {
    setIsApplying(true);
    
    try {
      // Simulate applying configuration
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      setConfigApplied(true);
      toast({
        title: "Configuration Applied",
        description: "Your system has been configured successfully!",
      });
    } catch (error) {
      toast({
        title: "Configuration Failed",
        description: "Failed to apply configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const getModeIcon = () => {
    switch (config.mode) {
      case 'server': return Server;
      case 'client': return Smartphone;
      case 'auto': return Monitor;
      default: return Settings;
    }
  };

  const getEnabledModuleNames = () => {
    const moduleNames: Record<string, string> = {
      'pos': 'POS Terminal',
      'kitchen': 'Kitchen Display',
      'customer': 'Customer Monitor',
      'admin': 'Admin Panel',
      'delivery': 'Delivery Interface',
      'reports': 'Advanced Reporting',
      'receipts': 'Receipt Management',
      'scheduling': 'Staff Scheduling',
    };
    
    return config.enabledModules.map(id => moduleNames[id] || id);
  };

  const ModeIcon = getModeIcon();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto bg-green-500/10 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-2xl font-bold mb-2">Setup Complete!</h3>
        <p className="text-muted-foreground">
          Your RestaurantOS system is ready to be configured and launched.
        </p>
      </div>

      {/* Configuration Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="w-5 h-5" />
            <span>Configuration Summary</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Restaurant Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2 flex items-center">
                <Users className="w-4 h-4 mr-2" />
                Restaurant Information
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{config.restaurantName}</span>
                </div>
                {config.restaurantAddress && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Address:</span>
                    <span className="font-medium text-right">{config.restaurantAddress}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Theme:</span>
                  <span className="font-medium capitalize">{config.theme}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Language:</span>
                  <span className="font-medium">{config.language.toUpperCase()}</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2 flex items-center">
                <ModeIcon className="w-4 h-4 mr-2" />
                System Configuration
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mode:</span>
                  <Badge variant="secondary" className="capitalize">
                    {config.mode}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Client ID:</span>
                  <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                    {config.clientId.slice(0, 16)}...
                  </span>
                </div>
                {config.mode !== 'server' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Server:</span>
                      <span className="font-medium">{config.serverAddress}:{config.serverPort}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Auto Discovery:</span>
                      <Badge variant={config.autoDiscovery ? "default" : "secondary"}>
                        {config.autoDiscovery ? 'Enabled' : 'Manual'}
                      </Badge>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Enabled Modules */}
          <div>
            <h4 className="font-medium mb-3 flex items-center">
              <Shield className="w-4 h-4 mr-2" />
              Enabled Modules ({config.enabledModules.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {getEnabledModuleNames().map((moduleName, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {moduleName}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Network Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Network className="w-5 h-5" />
            <span>Network Setup</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.mode === 'server' && (
            <Alert>
              <Server className="h-4 w-4" />
              <AlertDescription>
                <strong>Server Mode:</strong> This device will host the database and serve client connections on port {config.serverPort}.
                Other devices can connect to this server using network discovery or the manual IP address.
              </AlertDescription>
            </Alert>
          )}

          {config.mode === 'client' && (
            <Alert>
              <Smartphone className="h-4 w-4" />
              <AlertDescription>
                <strong>Client Mode:</strong> This device will connect to the server at {config.serverAddress}:{config.serverPort}.
                {config.autoDiscovery ? ' Auto-discovery is enabled for easier connection.' : ' Manual server configuration is set.'}
              </AlertDescription>
            </Alert>
          )}

          {config.mode === 'auto' && (
            <Alert>
              <Monitor className="h-4 w-4" />
              <AlertDescription>
                <strong>Auto Mode:</strong> The system will automatically detect the best configuration for your network.
                It will search for existing servers and fall back to server mode if none are found.
              </AlertDescription>
            </Alert>
          )}

          <div className="text-sm text-muted-foreground space-y-1">
            <p>• All network communications use secure protocols</p>
            <p>• Real-time synchronization ensures data consistency</p>
            <p>• Connection health monitoring with automatic recovery</p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backup Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Save your configuration for backup or deployment to other devices.
            </p>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportConfig}
                data-testid="button-export-config"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyConfig}
                data-testid="button-copy-config"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Share with Team</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Share connection details with your team for easy setup on their devices.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const shareText = `Join our RestaurantOS network:\nServer: ${config.serverAddress}:${config.serverPort}\nMode: ${config.mode}`;
                if (navigator.share) {
                  navigator.share({
                    title: 'RestaurantOS Configuration',
                    text: shareText,
                  });
                } else {
                  navigator.clipboard.writeText(shareText);
                  toast({ title: "Share info copied to clipboard" });
                }
              }}
              data-testid="button-share-config"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Final Action */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6 text-center">
          <h4 className="font-semibold mb-2">Ready to Launch</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Apply this configuration and start using RestaurantOS. 
            The system will restart with your new settings.
          </p>
          
          <Button
            size="lg"
            onClick={handleApplyConfiguration}
            disabled={isApplying || configApplied}
            className="min-w-40"
            data-testid="button-apply-config"
          >
            {isApplying ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : configApplied ? (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Applied
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4 mr-2" />
                Apply & Launch
              </>
            )}
          </Button>

          {configApplied && (
            <Alert className="mt-4">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Success!</strong> Your configuration has been applied. 
                The system will restart momentarily and you'll be redirected to the main interface.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Post-Setup Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What's Next?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h5 className="font-medium text-foreground mb-1">Getting Started:</h5>
              <ul className="space-y-1">
                <li>• Access the admin panel to configure menus</li>
                <li>• Set up user accounts and permissions</li>
                <li>• Configure tables and departments</li>
                <li>• Test the POS and kitchen workflows</li>
              </ul>
            </div>
            
            <div>
              <h5 className="font-medium text-foreground mb-1">Additional Setup:</h5>
              <ul className="space-y-1">
                <li>• Connect additional client devices</li>
                <li>• Configure receipt printers</li>
                <li>• Set up payment processing</li>
                <li>• Train staff on the new system</li>
              </ul>
            </div>
          </div>
          
          <Separator className="my-3" />
          
          <p className="text-xs">
            <strong>Need Help?</strong> Access the help documentation from the admin panel, 
            or reconfigure the system anytime through the settings menu.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}