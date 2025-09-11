import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Server, 
  Smartphone, 
  Monitor,
  Info,
  CheckCircle,
  AlertCircle,
  Network,
  Database,
  Users,
  Settings
} from 'lucide-react';
import type { WizardConfig } from '../ConfigurationWizard';

interface ModeSelectionStepProps {
  config: WizardConfig;
  onConfigChange: (updates: Partial<WizardConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

const setupModes = [
  {
    value: 'server' as const,
    icon: Server,
    title: 'Server Mode',
    subtitle: 'Central Hub',
    description: 'This device will act as the central server that other devices connect to. Recommended for your main terminal or a dedicated server machine.',
    features: [
      'Hosts the main database',
      'Manages all client connections',
      'Handles data synchronization',
      'Can run all modules locally'
    ],
    requirements: [
      'Stable network connection',
      'Adequate processing power',
      'Database storage space'
    ],
    badge: 'Recommended for Main Terminal',
    color: 'bg-blue-500',
  },
  {
    value: 'client' as const,
    icon: Smartphone,
    title: 'Client Mode',
    subtitle: 'Connect to Existing Server',
    description: 'This device will connect to an existing RestaurantOS server. Perfect for additional POS terminals, kitchen displays, or mobile devices.',
    features: [
      'Connects to remote server',
      'Lightweight operation',
      'Real-time synchronization',
      'Module-specific interfaces'
    ],
    requirements: [
      'Network connection to server',
      'Server IP address or discovery',
      'Minimal local storage'
    ],
    badge: 'For Additional Devices',
    color: 'bg-green-500',
  },
  {
    value: 'auto' as const,
    icon: Monitor,
    title: 'Auto Mode',
    subtitle: 'Smart Detection',
    description: 'Automatically detect the best configuration for your network. The system will scan for existing servers and configure accordingly.',
    features: [
      'Automatic server discovery',
      'Fallback to server mode',
      'Network topology detection',
      'Zero-configuration setup'
    ],
    requirements: [
      'UDP broadcast enabled',
      'Network discovery permissions',
      'Fallback capabilities'
    ],
    badge: 'Smart Detection',
    color: 'bg-purple-500',
  },
];

export function ModeSelectionStep({ config, onConfigChange }: ModeSelectionStepProps) {
  const [selectedMode, setSelectedMode] = useState(config.mode);

  const handleModeChange = (mode: 'server' | 'client' | 'auto') => {
    setSelectedMode(mode);
    onConfigChange({ mode });
  };

  const selectedModeInfo = setupModes.find(mode => mode.value === selectedMode);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Choose Your Setup Mode</h3>
        <p className="text-muted-foreground">
          Select how this device should operate in your restaurant network.
        </p>
      </div>

      <RadioGroup 
        value={selectedMode} 
        onValueChange={handleModeChange}
        className="space-y-4"
      >
        {setupModes.map((mode) => {
          const Icon = mode.icon;
          const isSelected = selectedMode === mode.value;
          
          return (
            <div key={mode.value} className="relative">
              <Label
                htmlFor={mode.value}
                className={`block p-0 cursor-pointer ${isSelected ? 'ring-2 ring-primary ring-offset-2 rounded-lg' : ''}`}
              >
                <Card className={`transition-all duration-200 ${isSelected ? 'border-primary shadow-md' : 'hover:border-muted-foreground/50'}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <RadioGroupItem 
                          value={mode.value}
                          id={mode.value}
                          className="mt-1"
                          data-testid={`mode-${mode.value}`}
                        />
                      </div>
                      
                      <div className="flex-shrink-0">
                        <div className={`w-12 h-12 rounded-lg ${mode.color} bg-opacity-10 flex items-center justify-center`}>
                          <Icon className={`w-6 h-6 ${mode.color.replace('bg-', 'text-')}`} />
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <h4 className="text-lg font-semibold">{mode.title}</h4>
                          <Badge variant="secondary" className="text-xs">
                            {mode.badge}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-4">
                          {mode.description}
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <h5 className="font-medium mb-2 flex items-center">
                              <CheckCircle className="w-4 h-4 mr-1 text-green-500" />
                              Features
                            </h5>
                            <ul className="space-y-1 text-muted-foreground">
                              {mode.features.map((feature, index) => (
                                <li key={index} className="flex items-start">
                                  <span className="w-1 h-1 bg-muted-foreground rounded-full mt-2 mr-2 flex-shrink-0"></span>
                                  {feature}
                                </li>
                              ))}
                            </ul>
                          </div>
                          
                          <div>
                            <h5 className="font-medium mb-2 flex items-center">
                              <Info className="w-4 h-4 mr-1 text-blue-500" />
                              Requirements
                            </h5>
                            <ul className="space-y-1 text-muted-foreground">
                              {mode.requirements.map((requirement, index) => (
                                <li key={index} className="flex items-start">
                                  <span className="w-1 h-1 bg-muted-foreground rounded-full mt-2 mr-2 flex-shrink-0"></span>
                                  {requirement}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Label>
            </div>
          );
        })}
      </RadioGroup>

      {/* Mode-specific Information */}
      {selectedModeInfo && (
        <Alert>
          <selectedModeInfo.icon className="h-4 w-4" />
          <AlertDescription>
            <strong>{selectedModeInfo.title} Selected:</strong> {' '}
            {selectedMode === 'server' && 
              "You'll configure database settings, network options, and which modules to run on this server."
            }
            {selectedMode === 'client' && 
              "You'll need to specify the server address or use automatic discovery to connect to an existing server."
            }
            {selectedMode === 'auto' && 
              "The system will automatically scan your network for existing servers and configure the optimal setup."
            }
          </AlertDescription>
        </Alert>
      )}

      {/* Network Topology Helper */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <h4 className="font-medium mb-3 flex items-center">
            <Network className="w-4 h-4 mr-2" />
            Typical Restaurant Setup
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <Database className="w-8 h-8 mx-auto mb-2 text-blue-500" />
              <h5 className="font-medium">Main Server</h5>
              <p className="text-xs text-muted-foreground">Back office computer or dedicated server</p>
            </div>
            <div className="text-center">
              <Monitor className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <h5 className="font-medium">POS Terminals</h5>
              <p className="text-xs text-muted-foreground">Front desk tablets or computers</p>
            </div>
            <div className="text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-purple-500" />
              <h5 className="font-medium">Kitchen Display</h5>
              <p className="text-xs text-muted-foreground">Kitchen screens and mobile devices</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}