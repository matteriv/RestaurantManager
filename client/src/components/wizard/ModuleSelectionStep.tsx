import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ShoppingCart, 
  ChefHat, 
  Monitor, 
  Settings, 
  Truck,
  Users,
  BarChart3,
  Receipt,
  Clock,
  CheckCircle,
  Info,
  AlertTriangle
} from 'lucide-react';
import type { WizardConfig } from '../ConfigurationWizard';

interface ModuleSelectionStepProps {
  config: WizardConfig;
  onConfigChange: (updates: Partial<WizardConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'core' | 'optional' | 'advanced';
  dependencies: string[];
  conflicts: string[];
  recommendedFor: string[];
  features: string[];
  resourceUsage: 'low' | 'medium' | 'high';
  serverRequired: boolean;
}

const availableModules: ModuleInfo[] = [
  {
    id: 'pos',
    name: 'POS Terminal',
    description: 'Point of Sale interface for taking orders and processing payments',
    icon: ShoppingCart,
    category: 'core',
    dependencies: [],
    conflicts: [],
    recommendedFor: ['server', 'client'],
    features: [
      'Order creation and modification',
      'Payment processing',
      'Table management',
      'Receipt printing',
      'Customer information'
    ],
    resourceUsage: 'medium',
    serverRequired: true,
  },
  {
    id: 'kitchen',
    name: 'Kitchen Display System',
    description: 'Kitchen interface for managing order preparation and timing',
    icon: ChefHat,
    category: 'core',
    dependencies: [],
    conflicts: [],
    recommendedFor: ['server', 'client'],
    features: [
      'Order queue management',
      'Preparation timing',
      'Station assignments',
      'Order status updates',
      'Kitchen performance metrics'
    ],
    resourceUsage: 'medium',
    serverRequired: true,
  },
  {
    id: 'customer',
    name: 'Customer Monitor',
    description: 'Public display showing order status for customers',
    icon: Monitor,
    category: 'optional',
    dependencies: [],
    conflicts: [],
    recommendedFor: ['client'],
    features: [
      'Order status display',
      'Queue numbers',
      'Wait time estimates',
      'Promotional content',
      'Multi-language support'
    ],
    resourceUsage: 'low',
    serverRequired: true,
  },
  {
    id: 'delivery',
    name: 'Delivery Interface',
    description: 'Interface for managing delivery orders and drivers',
    icon: Truck,
    category: 'optional',
    dependencies: ['pos'],
    conflicts: [],
    recommendedFor: ['client'],
    features: [
      'Delivery order management',
      'Driver assignments',
      'Route optimization',
      'Delivery tracking',
      'Customer notifications'
    ],
    resourceUsage: 'medium',
    serverRequired: true,
  },
  {
    id: 'admin',
    name: 'Admin Panel',
    description: 'Administrative interface for system management and analytics',
    icon: Settings,
    category: 'core',
    dependencies: [],
    conflicts: [],
    recommendedFor: ['server'],
    features: [
      'User management',
      'Menu configuration',
      'Analytics and reports',
      'System settings',
      'Audit logs'
    ],
    resourceUsage: 'medium',
    serverRequired: false,
  },
  {
    id: 'reports',
    name: 'Advanced Reporting',
    description: 'Detailed analytics and business intelligence reports',
    icon: BarChart3,
    category: 'advanced',
    dependencies: ['admin'],
    conflicts: [],
    recommendedFor: ['server'],
    features: [
      'Sales analytics',
      'Performance metrics',
      'Inventory reports',
      'Staff productivity',
      'Custom dashboards'
    ],
    resourceUsage: 'high',
    serverRequired: false,
  },
  {
    id: 'receipts',
    name: 'Receipt Management',
    description: 'Advanced receipt printing and email capabilities',
    icon: Receipt,
    category: 'optional',
    dependencies: ['pos'],
    conflicts: [],
    recommendedFor: ['server', 'client'],
    features: [
      'Custom receipt templates',
      'Email receipts',
      'QR code integration',
      'Multiple printer support',
      'Receipt history'
    ],
    resourceUsage: 'low',
    serverRequired: true,
  },
  {
    id: 'scheduling',
    name: 'Staff Scheduling',
    description: 'Employee scheduling and time tracking',
    icon: Clock,
    category: 'advanced',
    dependencies: ['admin'],
    conflicts: [],
    recommendedFor: ['server'],
    features: [
      'Shift scheduling',
      'Time tracking',
      'Payroll integration',
      'Availability management',
      'Labor cost analysis'
    ],
    resourceUsage: 'medium',
    serverRequired: false,
  },
];

export function ModuleSelectionStep({ config, onConfigChange }: ModuleSelectionStepProps) {
  const [selectedModules, setSelectedModules] = useState<string[]>(
    config.enabledModules || ['pos', 'kitchen', 'customer']
  );

  const isServerMode = config.mode === 'server';
  const isClientMode = config.mode === 'client';

  const handleModuleToggle = (moduleId: string, enabled: boolean) => {
    let newSelection = [...selectedModules];
    
    if (enabled) {
      // Add module
      if (!newSelection.includes(moduleId)) {
        newSelection.push(moduleId);
      }
      
      // Add dependencies
      const module = availableModules.find(m => m.id === moduleId);
      if (module) {
        module.dependencies.forEach(dep => {
          if (!newSelection.includes(dep)) {
            newSelection.push(dep);
          }
        });
      }
    } else {
      // Remove module
      newSelection = newSelection.filter(id => id !== moduleId);
      
      // Remove dependent modules
      const dependentModules = availableModules.filter(m => 
        m.dependencies.includes(moduleId) && newSelection.includes(m.id)
      );
      dependentModules.forEach(dep => {
        newSelection = newSelection.filter(id => id !== dep.id);
      });
    }
    
    setSelectedModules(newSelection);
    onConfigChange({ enabledModules: newSelection });
  };

  const getModulesByCategory = (category: 'core' | 'optional' | 'advanced') => {
    return availableModules.filter(module => {
      if (module.category !== category) return false;
      
      // Filter by mode compatibility
      if (isServerMode && !module.recommendedFor.includes('server')) {
        return module.category === 'core'; // Always show core modules
      }
      if (isClientMode && !module.recommendedFor.includes('client')) {
        return false;
      }
      
      return true;
    });
  };

  const isModuleEnabled = (moduleId: string) => selectedModules.includes(moduleId);
  
  const isModuleDisabled = (module: ModuleInfo) => {
    // Check if any conflicting modules are selected
    return module.conflicts.some(conflict => selectedModules.includes(conflict));
  };

  const getModuleDependencies = (module: ModuleInfo) => {
    return module.dependencies.filter(dep => !selectedModules.includes(dep));
  };

  const categories = [
    {
      id: 'core',
      name: 'Core Modules',
      description: 'Essential functionality for restaurant operations',
      icon: CheckCircle,
    },
    {
      id: 'optional',
      name: 'Optional Modules',
      description: 'Additional features to enhance your restaurant',
      icon: Info,
    },
    {
      id: 'advanced',
      name: 'Advanced Modules',
      description: 'Professional tools for detailed management and analytics',
      icon: AlertTriangle,
    },
  ] as const;

  const totalResourceUsage = selectedModules.reduce((total, moduleId) => {
    const module = availableModules.find(m => m.id === moduleId);
    if (!module) return total;
    
    switch (module.resourceUsage) {
      case 'low': return total + 1;
      case 'medium': return total + 2;
      case 'high': return total + 3;
      default: return total;
    }
  }, 0);

  const getResourceUsageColor = () => {
    if (totalResourceUsage <= 5) return 'text-green-600';
    if (totalResourceUsage <= 10) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Module Selection</h3>
        <p className="text-muted-foreground">
          Choose which restaurant modules to enable. You can change these settings later in the admin panel.
        </p>
      </div>

      {/* Mode-specific information */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          {isServerMode && (
            <>
              <strong>Server Mode:</strong> You can enable any modules. Server-only modules like Admin Panel will run locally.
            </>
          )}
          {isClientMode && (
            <>
              <strong>Client Mode:</strong> Showing modules compatible with client devices. Some advanced features require server access.
            </>
          )}
          {config.mode === 'auto' && (
            <>
              <strong>Auto Mode:</strong> Module availability will be determined based on the detected network configuration.
            </>
          )}
        </AlertDescription>
      </Alert>

      {/* Module Categories */}
      {categories.map((category) => {
        const modules = getModulesByCategory(category.id as any);
        if (modules.length === 0) return null;

        const CategoryIcon = category.icon;
        
        return (
          <Card key={category.id}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CategoryIcon className="w-5 h-5" />
                <span>{category.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {modules.filter(m => isModuleEnabled(m.id)).length}/{modules.length} enabled
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {modules.map((module) => {
                const Icon = module.icon;
                const enabled = isModuleEnabled(module.id);
                const disabled = isModuleDisabled(module);
                const missingDeps = getModuleDependencies(module);
                
                return (
                  <div
                    key={module.id}
                    className={`p-4 rounded-lg border ${
                      enabled 
                        ? 'bg-primary/5 border-primary/20' 
                        : disabled 
                          ? 'bg-muted/30 border-muted' 
                          : 'bg-card border-border'
                    } ${disabled ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        checked={enabled}
                        onCheckedChange={(checked) => handleModuleToggle(module.id, !!checked)}
                        disabled={disabled}
                        className="mt-1"
                        data-testid={`module-${module.id}`}
                      />
                      
                      <Icon className={`w-8 h-8 mt-0.5 ${
                        enabled ? 'text-primary' : 'text-muted-foreground'
                      }`} />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <h4 className="font-medium">{module.name}</h4>
                          <Badge 
                            variant={module.resourceUsage === 'high' ? 'destructive' : 'secondary'} 
                            className="text-xs"
                          >
                            {module.resourceUsage} resource
                          </Badge>
                          {module.serverRequired && (
                            <Badge variant="outline" className="text-xs">
                              Requires Server
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-3">
                          {module.description}
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div>
                            <h5 className="font-medium mb-1">Features:</h5>
                            <ul className="space-y-0.5 text-muted-foreground">
                              {module.features.slice(0, 3).map((feature, index) => (
                                <li key={index}>• {feature}</li>
                              ))}
                              {module.features.length > 3 && (
                                <li>• +{module.features.length - 3} more...</li>
                              )}
                            </ul>
                          </div>
                          
                          {(module.dependencies.length > 0 || module.conflicts.length > 0) && (
                            <div>
                              {module.dependencies.length > 0 && (
                                <>
                                  <h5 className="font-medium mb-1">Dependencies:</h5>
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    {module.dependencies.map((dep) => (
                                      <Badge key={dep} variant="outline" className="text-xs">
                                        {availableModules.find(m => m.id === dep)?.name || dep}
                                      </Badge>
                                    ))}
                                  </div>
                                </>
                              )}
                              
                              {module.conflicts.length > 0 && (
                                <>
                                  <h5 className="font-medium mb-1">Conflicts:</h5>
                                  <div className="flex flex-wrap gap-1">
                                    {module.conflicts.map((conflict) => (
                                      <Badge key={conflict} variant="destructive" className="text-xs">
                                        {availableModules.find(m => m.id === conflict)?.name || conflict}
                                      </Badge>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {missingDeps.length > 0 && (
                          <Alert className="mt-3">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                              Requires: {missingDeps.map(dep => 
                                availableModules.find(m => m.id === dep)?.name || dep
                              ).join(', ')}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {/* Summary */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <h4 className="font-medium mb-3">Configuration Summary</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Selected Modules:</span>
              <span className="font-medium ml-2">{selectedModules.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Resource Usage:</span>
              <span className={`font-medium ml-2 ${getResourceUsageColor()}`}>
                {totalResourceUsage <= 5 ? 'Low' : totalResourceUsage <= 10 ? 'Medium' : 'High'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Configuration:</span>
              <span className="font-medium ml-2 capitalize">{config.mode} Mode</span>
            </div>
          </div>
          
          {selectedModules.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <h5 className="font-medium mb-2">Enabled Modules:</h5>
              <div className="flex flex-wrap gap-2">
                {selectedModules.map(moduleId => {
                  const module = availableModules.find(m => m.id === moduleId);
                  return module ? (
                    <Badge key={moduleId} variant="secondary" className="text-xs">
                      {module.name}
                    </Badge>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}