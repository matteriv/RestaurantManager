import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  AlertCircle,
  Wifi,
  Server,
  Smartphone,
  Settings2,
  Users,
  ShoppingCart,
  ChefHat,
  Monitor,
  Truck,
  Shield
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  WelcomeStep,
  ModeSelectionStep,
  RestaurantInfoStep,
  NetworkConfigStep,
  ModuleSelectionStep,
  NetworkTestStep,
  CompletionStep,
} from './wizard';

export interface WizardConfig {
  // Basic Info
  restaurantName: string;
  restaurantAddress: string;
  
  // Mode
  mode: 'server' | 'client' | 'auto';
  
  // Network
  serverAddress: string;
  serverPort: number;
  clientId: string;
  autoDiscovery: boolean;
  
  // Modules
  enabledModules: string[];
  
  // Theme & Language
  theme: 'light' | 'dark';
  language: string;
}

export interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType<{
    config: WizardConfig;
    onConfigChange: (updates: Partial<WizardConfig>) => void;
    onNext: () => void;
    onBack: () => void;
  }>;
  canSkip?: boolean;
}

const wizardSteps: WizardStep[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    description: 'Welcome to RestaurantOS Setup',
    icon: Shield,
    component: WelcomeStep,
  },
  {
    id: 'mode',
    title: 'Mode Selection',
    description: 'Choose your setup mode',
    icon: Settings2,
    component: ModeSelectionStep,
  },
  {
    id: 'restaurant',
    title: 'Restaurant Info',
    description: 'Basic restaurant information',
    icon: Users,
    component: RestaurantInfoStep,
  },
  {
    id: 'network',
    title: 'Network Configuration',
    description: 'Configure network settings',
    icon: Wifi,
    component: NetworkConfigStep,
  },
  {
    id: 'modules',
    title: 'Module Selection',
    description: 'Choose enabled modules',
    icon: ShoppingCart,
    component: ModuleSelectionStep,
  },
  {
    id: 'testing',
    title: 'Network Testing',
    description: 'Test connectivity',
    icon: Server,
    component: NetworkTestStep,
  },
  {
    id: 'completion',
    title: 'Setup Complete',
    description: 'Finalize configuration',
    icon: CheckCircle,
    component: CompletionStep,
  },
];

interface ConfigurationWizardProps {
  isReconfigure?: boolean;
  existingConfig?: Partial<WizardConfig>;
  onComplete: (config: WizardConfig) => void;
  onCancel?: () => void;
}

export default function ConfigurationWizard({
  isReconfigure = false,
  existingConfig,
  onComplete,
  onCancel,
}: ConfigurationWizardProps) {
  const { toast } = useToast();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [config, setConfig] = useState<WizardConfig>({
    restaurantName: '',
    restaurantAddress: '',
    mode: 'auto',
    serverAddress: '',
    serverPort: 5000,
    clientId: '',
    autoDiscovery: true,
    enabledModules: ['pos', 'kitchen', 'customer'],
    theme: 'light',
    language: 'en',
    ...existingConfig,
  });

  const currentStep = wizardSteps[currentStepIndex];
  const StepComponent = currentStep.component;
  const progress = ((currentStepIndex + 1) / wizardSteps.length) * 100;

  useEffect(() => {
    // Generate client ID if not provided
    if (!config.clientId) {
      const newClientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setConfig(prev => ({ ...prev, clientId: newClientId }));
    }
  }, []);

  const handleConfigChange = (updates: Partial<WizardConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (currentStepIndex < wizardSteps.length - 1) {
      // Mark current step as completed
      if (!completedSteps.includes(currentStep.id)) {
        setCompletedSteps(prev => [...prev, currentStep.id]);
      }
      setCurrentStepIndex(prev => prev + 1);
    } else {
      // Final step - complete wizard
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const handleStepClick = (stepIndex: number) => {
    const step = wizardSteps[stepIndex];
    // Can only navigate to completed steps or the next step
    if (stepIndex <= currentStepIndex || completedSteps.includes(step.id)) {
      setCurrentStepIndex(stepIndex);
    }
  };

  const handleComplete = () => {
    try {
      onComplete(config);
      toast({
        title: "Configuration Complete",
        description: "Your system has been configured successfully.",
      });
    } catch (error) {
      toast({
        title: "Configuration Error",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {isReconfigure ? 'Reconfigure' : 'Setup'} RestaurantOS
          </h1>
          <p className="text-muted-foreground">
            {isReconfigure 
              ? 'Update your restaurant system configuration'
              : 'Configure your restaurant management system step by step'
            }
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Step {currentStepIndex + 1} of {wizardSteps.length}
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <Progress value={progress} className="h-2" data-testid="wizard-progress" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Step Navigation Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Setup Steps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {wizardSteps.map((step, index) => {
                  const Icon = step.icon;
                  const isCompleted = completedSteps.includes(step.id);
                  const isCurrent = index === currentStepIndex;
                  const isAccessible = index <= currentStepIndex || isCompleted;

                  return (
                    <button
                      key={step.id}
                      onClick={() => handleStepClick(index)}
                      disabled={!isAccessible}
                      className={cn(
                        "w-full text-left p-3 rounded-lg transition-all duration-200",
                        "flex items-start space-x-3 group",
                        isCurrent && "bg-primary text-primary-foreground",
                        !isCurrent && isCompleted && "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300",
                        !isCurrent && !isCompleted && isAccessible && "hover:bg-muted",
                        !isAccessible && "opacity-50 cursor-not-allowed"
                      )}
                      data-testid={`wizard-step-${step.id}`}
                    >
                      <div className={cn(
                        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                        isCurrent && "bg-primary-foreground text-primary",
                        !isCurrent && isCompleted && "bg-green-500 text-white",
                        !isCurrent && !isCompleted && "bg-muted text-muted-foreground"
                      )}>
                        {isCompleted ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <Icon className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium truncate">
                          {step.title}
                        </h4>
                        <p className="text-xs opacity-75 truncate">
                          {step.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Quick Info Panel */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-sm">Current Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>Mode:</span>
                  <Badge variant="outline" className="text-xs">
                    {config.mode.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Modules:</span>
                  <Badge variant="outline" className="text-xs">
                    {config.enabledModules.length}
                  </Badge>
                </div>
                {config.restaurantName && (
                  <div className="pt-2 border-t">
                    <p className="font-medium truncate">{config.restaurantName}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <Card className="min-h-[600px]">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <currentStep.icon className="w-5 h-5" />
                  <span>{currentStep.title}</span>
                </CardTitle>
                <p className="text-muted-foreground">
                  {currentStep.description}
                </p>
              </CardHeader>
              <CardContent>
                <StepComponent
                  config={config}
                  onConfigChange={handleConfigChange}
                  onNext={handleNext}
                  onBack={handleBack}
                />
              </CardContent>
            </Card>

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-6">
              <div className="flex space-x-2">
                {currentStepIndex > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    data-testid="wizard-back-button"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                )}
                {onCancel && (
                  <Button
                    variant="ghost"
                    onClick={handleCancel}
                    data-testid="wizard-cancel-button"
                  >
                    Cancel
                  </Button>
                )}
              </div>

              <div className="flex space-x-2">
                {currentStep.canSkip && (
                  <Button
                    variant="ghost"
                    onClick={handleNext}
                    data-testid="wizard-skip-button"
                  >
                    Skip
                  </Button>
                )}
                <Button
                  onClick={handleNext}
                  data-testid="wizard-next-button"
                >
                  {currentStepIndex === wizardSteps.length - 1 ? (
                    <>
                      Complete Setup
                      <CheckCircle className="w-4 h-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}