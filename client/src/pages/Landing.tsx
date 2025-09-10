import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChefHat, Monitor, Receipt, Users } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-secondary flex flex-col">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-sm border-b border-white/20 p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <ChefHat className="w-8 h-8 text-white" />
            <h1 className="text-2xl font-bold text-white">RestaurantOS</h1>
          </div>
          <Button 
            onClick={() => window.location.href = '/api/login'}
            className="bg-white text-primary hover:bg-white/90"
            data-testid="login-button"
          >
            Sign In
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-white mb-6">
            Complete Restaurant Management System
          </h1>
          <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
            Streamline your restaurant operations with our comprehensive POS, Kitchen Display, 
            and Customer Monitoring system. Real-time updates, offline capabilities, and 
            seamless integration for maximum efficiency.
          </p>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardContent className="p-6 text-center">
                <Receipt className="w-12 h-12 text-white mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">POS Terminal</h3>
                <p className="text-white/70 text-sm">
                  Tablet-optimized interface for quick order taking and table management
                </p>
              </CardContent>
            </Card>
            
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardContent className="p-6 text-center">
                <ChefHat className="w-12 h-12 text-white mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Kitchen Display</h3>
                <p className="text-white/70 text-sm">
                  Real-time order management for kitchen staff with timer and status tracking
                </p>
              </CardContent>
            </Card>
            
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardContent className="p-6 text-center">
                <Monitor className="w-12 h-12 text-white mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Customer Monitor</h3>
                <p className="text-white/70 text-sm">
                  Keep customers informed with order status and estimated completion times
                </p>
              </CardContent>
            </Card>
            
            <Card className="bg-white/10 backdrop-blur-sm border-white/20">
              <CardContent className="p-6 text-center">
                <Users className="w-12 h-12 text-white mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Admin Dashboard</h3>
                <p className="text-white/70 text-sm">
                  Comprehensive analytics and reporting for business insights
                </p>
              </CardContent>
            </Card>
          </div>
          
          <Button 
            size="lg"
            onClick={() => window.location.href = '/api/login'}
            className="bg-white text-primary hover:bg-white/90 text-lg px-8 py-3"
            data-testid="get-started-button"
          >
            Get Started
          </Button>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-white/10 backdrop-blur-sm border-t border-white/20 p-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-white text-center mb-6">Key Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-white">
            <div className="text-center">
              <h3 className="font-semibold mb-2">Real-time Updates</h3>
              <p className="text-white/70 text-sm">
                WebSocket-powered live updates across all devices for seamless coordination
              </p>
            </div>
            <div className="text-center">
              <h3 className="font-semibold mb-2">Offline Support</h3>
              <p className="text-white/70 text-sm">
                Continue operations even without internet connection with automatic sync
              </p>
            </div>
            <div className="text-center">
              <h3 className="font-semibold mb-2">Multi-role Access</h3>
              <p className="text-white/70 text-sm">
                Different interfaces and permissions for managers, waiters, and kitchen staff
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white/5 border-t border-white/20 p-4">
        <div className="max-w-7xl mx-auto text-center text-white/60 text-sm">
          <p>&copy; 2024 RestaurantOS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
