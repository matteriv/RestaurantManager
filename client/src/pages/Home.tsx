import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { 
  Monitor, 
  Receipt, 
  ChefHat, 
  Settings, 
  LogOut, 
  ExternalLink,
  Copy
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
  const { user } = useAuth();
  const { toast } = useToast();

  const interfaces = [
    {
      id: 'pos',
      name: 'POS Terminal',
      description: 'Take orders and manage tables',
      url: '/pos',
      icon: Receipt,
      color: 'bg-blue-500 text-white',
      recommended: 'Tablet/Desktop',
    },
    {
      id: 'kitchen',
      name: 'Kitchen Display',
      description: 'Manage kitchen operations and order tracking',
      url: '/kitchen',
      icon: ChefHat,
      color: 'bg-orange-500 text-white',
      recommended: 'Large Screen',
    },
    {
      id: 'customer',
      name: 'Customer Monitor',
      description: 'Public display showing order status',
      url: '/customer',
      icon: Monitor,
      color: 'bg-purple-500 text-white',
      recommended: 'Public Display',
    },
    {
      id: 'admin',
      name: 'Admin Panel',
      description: 'Analytics, reporting and system management',
      url: '/admin',
      icon: Settings,
      color: 'bg-gray-600 text-white',
      recommended: 'Management',
    },
  ];

  const copyToClipboard = (url: string) => {
    const fullUrl = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      toast({
        title: "URL copied",
        description: "Link copied to clipboard successfully.",
      });
    }).catch(() => {
      toast({
        title: "Error",
        description: "Failed to copy link to clipboard.",
        variant: "destructive",
      });
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-primary">RestaurantOS</h1>
              <span className="text-sm text-muted-foreground">Complete POS & Kitchen Management</span>
            </div>
            
            {/* User Menu */}
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">
                Welcome, {(user as any)?.firstName || 'User'}
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

      {/* Main Content */}
      <main className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-4">System Access Points</h2>
            <p className="text-lg text-muted-foreground">
              Choose the interface that matches your role and device. Each area has a direct URL for easy access.
            </p>
          </div>

          {/* Interface Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {interfaces.map((interface_) => {
              const Icon = interface_.icon;
              
              return (
                <Card 
                  key={interface_.id}
                  className="group hover:shadow-lg transition-all duration-200 border-2 hover:border-primary/20"
                >
                  <CardHeader className="text-center">
                    <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${interface_.color}`}>
                      <Icon className="w-8 h-8" />
                    </div>
                    <CardTitle className="text-lg">{interface_.name}</CardTitle>
                    <Badge variant="secondary" className="mx-auto w-fit">
                      {interface_.recommended}
                    </Badge>
                  </CardHeader>
                  <CardContent className="text-center space-y-4">
                    <p className="text-muted-foreground text-sm">
                      {interface_.description}
                    </p>
                    
                    <div className="flex flex-col gap-2">
                      <Link href={interface_.url}>
                        <Button 
                          className="w-full"
                          data-testid={`access-${interface_.id}`}
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Access {interface_.name}
                        </Button>
                      </Link>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(interface_.url)}
                        data-testid={`copy-url-${interface_.id}`}
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy URL
                      </Button>
                    </div>

                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                      <code>{window.location.origin}{interface_.url}</code>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* URL Reference Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <ExternalLink className="w-5 h-5" />
                <span>Direct Access URLs</span>
              </CardTitle>
              <p className="text-muted-foreground">
                Bookmark these URLs for quick access or share them with your team members.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {interfaces.map((interface_) => (
                  <div 
                    key={interface_.id}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <interface_.icon className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{interface_.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {interface_.recommended}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <code className="text-sm bg-background px-2 py-1 rounded border">
                        {window.location.origin}{interface_.url}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(interface_.url)}
                        data-testid={`copy-table-url-${interface_.id}`}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
