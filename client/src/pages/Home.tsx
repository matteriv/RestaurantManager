import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { PosInterface } from '@/components/PosInterface';
import { KitchenDisplay } from '@/components/KitchenDisplay';
import { CustomerMonitor } from '@/components/CustomerMonitor';
import { AdminPanel } from '@/components/AdminPanel';
import { Monitor, Receipt, ChefHat, Settings, LogOut } from 'lucide-react';

type InterfaceType = 'pos' | 'kds' | 'customer' | 'admin';

export default function Home() {
  const [selectedInterface, setSelectedInterface] = useState<InterfaceType>('pos');
  const { user } = useAuth();

  const interfaces = [
    {
      id: 'pos' as const,
      name: 'POS Terminal',
      description: 'Take orders and manage tables',
      icon: Receipt,
      color: 'bg-primary text-primary-foreground',
      component: PosInterface,
    },
    {
      id: 'kds' as const,
      name: 'Kitchen Display',
      description: 'Manage kitchen operations',
      icon: ChefHat,
      color: 'bg-secondary text-secondary-foreground',
      component: KitchenDisplay,
    },
    {
      id: 'customer' as const,
      name: 'Customer Monitor',
      description: 'Order status for customers',
      icon: Monitor,
      color: 'bg-success text-white',
      component: CustomerMonitor,
    },
    {
      id: 'admin' as const,
      name: 'Admin Panel',
      description: 'Analytics and management',
      icon: Settings,
      color: 'bg-muted text-muted-foreground',
      component: AdminPanel,
    },
  ];

  const selectedInterfaceConfig = interfaces.find(i => i.id === selectedInterface);
  const SelectedComponent = selectedInterfaceConfig?.component;

  return (
    <WebSocketProvider clientType={selectedInterface}>
      <div className="min-h-screen bg-background">
        {/* Header Navigation */}
        <header className="bg-card shadow-sm border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-4">
                <h1 className="text-xl font-bold text-primary">RestaurantOS</h1>
                <span className="text-sm text-muted-foreground">Complete POS & Kitchen Management</span>
              </div>
              
              {/* Interface Selector */}
              <nav className="flex space-x-2">
                {interfaces.map((interface_) => {
                  const Icon = interface_.icon;
                  const isSelected = selectedInterface === interface_.id;
                  
                  return (
                    <Button
                      key={interface_.id}
                      variant={isSelected ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setSelectedInterface(interface_.id)}
                      className={isSelected ? interface_.color : ''}
                      data-testid={`nav-${interface_.id}`}
                    >
                      <Icon className="w-4 h-4 mr-1" />
                      {interface_.name}
                    </Button>
                  );
                })}
              </nav>

              {/* User Menu */}
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">
                  Welcome, {user?.firstName || 'User'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.location.href = '/api/logout'}
                  data-testid="logout-button"
                >
                  <LogOut className="w-4 h-4 mr-1" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Interface Content */}
        <main>
          {SelectedComponent ? (
            <SelectedComponent />
          ) : (
            <div className="p-8">
              <div className="max-w-4xl mx-auto">
                <h2 className="text-2xl font-bold text-foreground mb-6">Select an Interface</h2>
                <div className="grid grid-cols-2 gap-6">
                  {interfaces.map((interface_) => {
                    const Icon = interface_.icon;
                    
                    return (
                      <Card 
                        key={interface_.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => setSelectedInterface(interface_.id)}
                        data-testid={`interface-card-${interface_.id}`}
                      >
                        <CardHeader>
                          <CardTitle className="flex items-center space-x-2">
                            <Icon className="w-6 h-6" />
                            <span>{interface_.name}</span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-muted-foreground">{interface_.description}</p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </WebSocketProvider>
  );
}
