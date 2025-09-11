import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  Network, 
  Settings, 
  Users,
  CheckCircle,
  ArrowRight,
  Server,
  Smartphone,
  Monitor
} from 'lucide-react';
import type { WizardConfig } from '../ConfigurationWizard';

interface WelcomeStepProps {
  config: WizardConfig;
  onConfigChange: (updates: Partial<WizardConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const features = [
    {
      icon: Network,
      title: 'Multi-Client Architecture',
      description: 'Connect multiple devices across your restaurant network',
    },
    {
      icon: Shield,
      title: 'Secure Setup',
      description: 'Easy configuration with built-in security features',
    },
    {
      icon: Settings,
      title: 'Flexible Modules',
      description: 'Enable only the features you need for your operation',
    },
    {
      icon: Users,
      title: 'Team Collaboration',
      description: 'Seamless coordination between front and back of house',
    },
  ];

  const setupModes = [
    {
      icon: Server,
      title: 'Server Mode',
      description: 'Central hub that other devices connect to',
      badge: 'Recommended for Main Terminal',
    },
    {
      icon: Smartphone,
      title: 'Client Mode',
      description: 'Connect to an existing server instance',
      badge: 'For Additional Devices',
    },
    {
      icon: Monitor,
      title: 'Auto Mode',
      description: 'Automatically detect and configure network setup',
      badge: 'Smart Detection',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Message */}
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
          <Shield className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-2">Welcome to RestaurantOS</h2>
          <p className="text-muted-foreground text-lg">
            Your complete restaurant management solution
          </p>
        </div>
      </div>

      {/* Key Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <Card key={index} className="p-4">
              <CardContent className="p-0">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">{feature.title}</h3>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Setup Modes Preview */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Setup Modes Available</h3>
        <div className="grid grid-cols-1 gap-3">
          {setupModes.map((mode, index) => {
            const Icon = mode.icon;
            return (
              <div 
                key={index}
                className="flex items-center space-x-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <Icon className="w-8 h-8 text-primary" />
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h4 className="font-medium">{mode.title}</h4>
                    <Badge variant="secondary" className="text-xs">
                      {mode.badge}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{mode.description}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Setup Process Overview */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-6 h-6 text-primary mt-1" />
            <div>
              <h3 className="font-semibold mb-2">What happens next?</h3>
              <p className="text-sm text-muted-foreground mb-3">
                This wizard will guide you through the complete setup process:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Choose your setup mode (Server, Client, or Auto)</li>
                <li>• Configure basic restaurant information</li>
                <li>• Set up network connectivity</li>
                <li>• Select which modules to enable</li>
                <li>• Test your configuration</li>
                <li>• Complete setup and start using the system</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Call to Action */}
      <div className="text-center pt-4">
        <p className="text-sm text-muted-foreground mb-4">
          Ready to get started? The setup process takes about 5-10 minutes.
        </p>
      </div>
    </div>
  );
}