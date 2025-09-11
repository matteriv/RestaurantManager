import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Store, 
  MapPin, 
  Palette, 
  Globe,
  Info,
  AlertCircle
} from 'lucide-react';
import type { WizardConfig } from '../ConfigurationWizard';

interface RestaurantInfoStepProps {
  config: WizardConfig;
  onConfigChange: (updates: Partial<WizardConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

const languages = [
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'it', label: 'Italiano', flag: '🇮🇹' },
  { value: 'es', label: 'Español', flag: '🇪🇸' },
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
  { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

const themes = [
  { value: 'light', label: 'Light Theme', description: 'Clean, bright interface' },
  { value: 'dark', label: 'Dark Theme', description: 'Dark, modern interface' },
];

export function RestaurantInfoStep({ config, onConfigChange }: RestaurantInfoStepProps) {
  const [formData, setFormData] = useState({
    restaurantName: config.restaurantName || '',
    restaurantAddress: config.restaurantAddress || '',
    theme: config.theme || 'light',
    language: config.language || 'en',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Update parent config when form data changes
    onConfigChange(formData);
  }, [formData, onConfigChange]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.restaurantName.trim()) {
      newErrors.restaurantName = 'Restaurant name is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAutoFillExample = () => {
    const exampleData = {
      restaurantName: 'Bella Vista Pizzeria',
      restaurantAddress: '123 Main Street, Downtown, City 12345',
      theme: 'light' as const,
      language: 'en',
    };
    setFormData(exampleData);
  };

  const isFormValid = formData.restaurantName.trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Restaurant Information</h3>
        <p className="text-muted-foreground">
          Provide basic information about your restaurant to personalize the system.
        </p>
      </div>

      {/* Restaurant Details */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center space-x-2 mb-4">
            <Store className="w-5 h-5 text-primary" />
            <h4 className="font-medium">Restaurant Details</h4>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="restaurant-name">
                Restaurant Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="restaurant-name"
                placeholder="Enter your restaurant name"
                value={formData.restaurantName}
                onChange={(e) => handleInputChange('restaurantName', e.target.value)}
                className={errors.restaurantName ? 'border-destructive' : ''}
                data-testid="input-restaurant-name"
              />
              {errors.restaurantName && (
                <p className="text-sm text-destructive mt-1 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {errors.restaurantName}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="restaurant-address">
                Address <span className="text-xs text-muted-foreground">(Optional)</span>
              </Label>
              <Textarea
                id="restaurant-address"
                placeholder="Enter your restaurant address"
                value={formData.restaurantAddress}
                onChange={(e) => handleInputChange('restaurantAddress', e.target.value)}
                rows={3}
                data-testid="input-restaurant-address"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will appear on receipts and reports
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appearance Settings */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center space-x-2 mb-4">
            <Palette className="w-5 h-5 text-primary" />
            <h4 className="font-medium">Appearance & Language</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Theme</Label>
              <Select 
                value={formData.theme} 
                onValueChange={(value) => handleInputChange('theme', value)}
              >
                <SelectTrigger data-testid="select-theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {themes.map((theme) => (
                    <SelectItem key={theme.value} value={theme.value}>
                      <div>
                        <div className="font-medium">{theme.label}</div>
                        <div className="text-xs text-muted-foreground">{theme.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Language</Label>
              <Select 
                value={formData.language} 
                onValueChange={(value) => handleInputChange('language', value)}
              >
                <SelectTrigger data-testid="select-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      <div className="flex items-center space-x-2">
                        <span>{lang.flag}</span>
                        <span>{lang.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Helper Actions */}
      <div className="flex justify-between items-center">
        <Button
          type="button"
          variant="outline"
          onClick={handleAutoFillExample}
          data-testid="button-autofill-example"
        >
          Use Example Data
        </Button>
        
        {!isFormValid && (
          <Alert className="max-w-md">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Please provide at least the restaurant name to continue.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Information Note */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <h5 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                Information Usage
              </h5>
              <p className="text-blue-700 dark:text-blue-300 mb-2">
                This information will be used throughout the system:
              </p>
              <ul className="text-blue-700 dark:text-blue-300 space-y-1">
                <li>• Restaurant name appears in the header and on receipts</li>
                <li>• Address is included on printed receipts and reports</li>
                <li>• Theme and language settings apply to all interfaces</li>
                <li>• You can change these settings later in the admin panel</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}