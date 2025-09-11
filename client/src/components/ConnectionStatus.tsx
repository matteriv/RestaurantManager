import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Wifi, 
  WifiOff, 
  Server, 
  AlertTriangle, 
  CheckCircle, 
  RotateCcw,
  Globe,
  Monitor,
  Clock
} from 'lucide-react';
import { useConnectionHealth } from '@/hooks/useConnectionHealth';
import { getApiConfig } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  className?: string;
  showDetails?: boolean;
  variant?: 'full' | 'compact' | 'indicator';
}

export function ConnectionStatus({ 
  className, 
  showDetails = false,
  variant = 'compact' 
}: ConnectionStatusProps) {
  const { toast } = useToast();
  const [apiConfig, setApiConfig] = useState(getApiConfig());
  
  const { health, forceCheck, reset } = useConnectionHealth({
    onConnectionLost: () => {
      toast({
        title: "Connection Lost",
        description: "Lost connection to server. Attempting to reconnect...",
        variant: "destructive",
      });
    },
    onConnectionRestored: () => {
      toast({
        title: "Connection Restored",
        description: "Successfully reconnected to server.",
      });
    },
    onError: (error) => {
      console.error('Connection health error:', error);
    },
  });

  useEffect(() => {
    // Update API config when it changes
    const interval = setInterval(() => {
      setApiConfig(getApiConfig());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const handleForceCheck = async () => {
    try {
      await forceCheck();
    } catch (error) {
      console.error('Force check failed:', error);
    }
  };

  const handleReset = () => {
    reset();
    toast({
      title: "Connection Reset",
      description: "Connection monitoring has been reset.",
    });
  };

  const getStatusColor = () => {
    if (!health.isOnline) return 'text-gray-500';
    if (!health.isHealthy) return 'text-red-500';
    return 'text-green-500';
  };

  const getStatusIcon = () => {
    if (!health.isOnline) return WifiOff;
    if (!health.isHealthy) return AlertTriangle;
    return CheckCircle;
  };

  const getStatusText = () => {
    if (!health.isOnline) return 'Offline';
    if (health.isChecking) return 'Checking...';
    if (!health.isHealthy) return 'Disconnected';
    return 'Connected';
  };

  const getServerModeText = () => {
    if (apiConfig.mode === 'server') return 'Server Mode';
    if (apiConfig.isRemote) return 'Client Mode';
    return 'Local Mode';
  };

  if (variant === 'indicator') {
    const StatusIcon = getStatusIcon();
    return (
      <div className={cn("flex items-center space-x-2", className)} data-testid="connection-indicator">
        <StatusIcon className={cn("w-4 h-4", getStatusColor())} />
        {showDetails && (
          <span className={cn("text-sm", getStatusColor())}>
            {getStatusText()}
          </span>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    const StatusIcon = getStatusIcon();
    return (
      <div className={cn("flex items-center justify-between p-2 bg-muted/30 rounded-lg", className)} data-testid="connection-compact">
        <div className="flex items-center space-x-2">
          <StatusIcon className={cn("w-4 h-4", getStatusColor())} />
          <span className="text-sm font-medium">{getStatusText()}</span>
          <Badge variant="outline" className="text-xs">
            {getServerModeText()}
          </Badge>
        </div>
        
        {!health.isHealthy && health.isOnline && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleForceCheck}
            disabled={health.isChecking}
            data-testid="button-retry-connection"
          >
            <RotateCcw className={cn("w-3 h-3", health.isChecking && "animate-spin")} />
          </Button>
        )}
      </div>
    );
  }

  // Full variant
  const StatusIcon = getStatusIcon();
  
  return (
    <Card className={className} data-testid="connection-status-full">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <StatusIcon className={cn("w-5 h-5", getStatusColor())} />
            <h3 className="font-medium">Connection Status</h3>
          </div>
          <Badge variant={health.isHealthy ? "default" : "destructive"}>
            {getStatusText()}
          </Badge>
        </div>

        <div className="space-y-3">
          {/* Server Mode */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              {apiConfig.isRemote ? (
                <Globe className="w-4 h-4 text-blue-500" />
              ) : (
                <Monitor className="w-4 h-4 text-green-500" />
              )}
              <span>Mode:</span>
            </div>
            <Badge variant="outline">{getServerModeText()}</Badge>
          </div>

          {/* Server Address */}
          {apiConfig.isRemote && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <Server className="w-4 h-4 text-blue-500" />
                <span>Server:</span>
              </div>
              <span className="font-mono text-xs">{apiConfig.baseUrl}</span>
            </div>
          )}

          {/* Network Status */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <Wifi className={cn("w-4 h-4", health.isOnline ? "text-green-500" : "text-gray-500")} />
              <span>Network:</span>
            </div>
            <Badge variant={health.isOnline ? "default" : "secondary"}>
              {health.isOnline ? "Online" : "Offline"}
            </Badge>
          </div>

          {/* Latency */}
          {health.latency !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <span>Latency:</span>
              </div>
              <span className="font-mono text-xs">{health.latency}ms</span>
            </div>
          )}

          {/* Last Check */}
          {health.lastCheck && (
            <div className="flex items-center justify-between text-sm">
              <span>Last Check:</span>
              <span className="text-muted-foreground text-xs">
                {health.lastCheck.toLocaleTimeString()}
              </span>
            </div>
          )}

          {/* Error Message */}
          {health.error && (
            <div className="p-2 bg-destructive/10 rounded text-sm text-destructive">
              {health.error}
            </div>
          )}

          {/* Reconnect Attempts */}
          {health.reconnectAttempts > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span>Retry Attempts:</span>
              <Badge variant="outline">
                {health.reconnectAttempts}/{health.maxReconnectAttempts}
              </Badge>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleForceCheck}
              disabled={health.isChecking}
              className="flex-1"
              data-testid="button-force-check"
            >
              <RotateCcw className={cn("w-4 h-4 mr-2", health.isChecking && "animate-spin")} />
              {health.isChecking ? 'Checking...' : 'Check Now'}
            </Button>
            
            {(health.reconnectAttempts > 0 || health.error) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                data-testid="button-reset-connection"
              >
                Reset
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}