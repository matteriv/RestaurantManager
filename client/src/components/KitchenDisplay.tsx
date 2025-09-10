import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { apiRequest } from '@/lib/queryClient';
import { Play, Pause, Check, Clock, ChefHat } from 'lucide-react';
import type { OrderWithDetails } from '@shared/schema';

export function KitchenDisplay() {
  const [selectedStation, setSelectedStation] = useState<string>('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lastMessage, isConnected } = useWebSocketContext();

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch active orders
  const { data: orders = [] } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/orders'],
    refetchInterval: 30000, // Refetch every 30 seconds as backup
  });

  // Filter orders for kitchen display (new, preparing, ready)
  const kitchenOrders = orders.filter(order => 
    ['new', 'preparing', 'ready'].includes(order.status)
  );

  // Mutations
  const updateOrderLineStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest('PATCH', `/api/order-lines/${id}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update order status.",
        variant: "destructive",
      });
    },
  });

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'new-order':
        case 'order-status-updated':
        case 'order-line-status-updated':
          queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
          break;
      }
    }
  }, [lastMessage, queryClient]);

  const updateLineStatus = (lineId: string, status: string) => {
    updateOrderLineStatusMutation.mutate({ id: lineId, status });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'preparing': return 'bg-yellow-100 text-yellow-800';
      case 'ready': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getOrderPriority = (order: OrderWithDetails) => {
    const createdAt = new Date(order.createdAt);
    const now = new Date();
    const minutesElapsed = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60));
    
    if (minutesElapsed > 15) return 'high';
    if (minutesElapsed > 10) return 'medium';
    return 'normal';
  };

  const getOrderBorderColor = (order: OrderWithDetails) => {
    const priority = getOrderPriority(order);
    switch (priority) {
      case 'high': return 'border-red-400';
      case 'medium': return 'border-yellow-400';
      default: return 'border-border';
    }
  };

  const formatTimeElapsed = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const minutes = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
    
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 min ago';
    return `${minutes} min ago`;
  };

  const getStationOrders = () => {
    if (selectedStation === 'all') return kitchenOrders;
    
    return kitchenOrders.filter(order =>
      order.orderLines.some(line => 
        line.menuItem.station === selectedStation || 
        (selectedStation === 'cold_station' && !line.menuItem.station)
      )
    );
  };

  const getOrderStats = () => {
    const stats = {
      new: 0,
      preparing: 0,
      ready: 0,
    };

    kitchenOrders.forEach(order => {
      if (order.status === 'ready') {
        stats.ready++;
      } else {
        const hasPreparingLines = order.orderLines.some(line => line.status === 'preparing');
        if (hasPreparingLines) {
          stats.preparing++;
        } else {
          stats.new++;
        }
      }
    });

    return stats;
  };

  const stats = getOrderStats();
  const stationOrders = getStationOrders();

  return (
    <div className="min-h-screen bg-background p-6">
      {/* KDS Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <h1 className="text-3xl font-bold text-primary">Kitchen Display System</h1>
          <div className="flex items-center space-x-2">
            <span className="text-muted-foreground">Station:</span>
            <Select value={selectedStation} onValueChange={setSelectedStation}>
              <SelectTrigger className="w-48" data-testid="station-selector">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stations</SelectItem>
                <SelectItem value="grill">Grill</SelectItem>
                <SelectItem value="fryer">Fryer</SelectItem>
                <SelectItem value="cold_station">Cold Station</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-muted-foreground">{isConnected ? 'Live' : 'Disconnected'}</span>
          </div>
          <span className="text-muted-foreground" data-testid="current-time">
            {currentTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Active Orders Grid */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        {stationOrders.map((order) => (
          <Card 
            key={order.id} 
            className={`border-2 shadow-lg ${getOrderBorderColor(order)}`}
            data-testid={`order-card-${order.id}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl font-bold text-primary" data-testid={`order-number-${order.id}`}>
                    Order #{order.orderNumber}
                  </span>
                  <Badge className={getStatusColor(order.status)} data-testid={`order-status-${order.id}`}>
                    {order.status}
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground">
                    {order.table ? `Table ${order.table.number}` : 'Takeaway'}
                  </div>
                  <div className="text-sm text-destructive font-medium" data-testid={`order-time-${order.id}`}>
                    {formatTimeElapsed(order.createdAt)}
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                {order.orderLines.map((line) => (
                  <div 
                    key={line.id} 
                    className={`border rounded-lg p-3 ${getStatusColor(line.status).replace('text-', 'bg-').replace('800', '50')}`}
                    data-testid={`order-line-${line.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">
                        {line.menuItem.name} {line.quantity > 1 && `x${line.quantity}`}
                      </span>
                      <Badge className={getStatusColor(line.status)} data-testid={`line-status-${line.id}`}>
                        {line.status}
                      </Badge>
                    </div>
                    {line.notes && (
                      <div className="text-sm text-muted-foreground mb-2">{line.notes}</div>
                    )}
                    <div className="flex space-x-2">
                      {line.status === 'new' && (
                        <Button
                          size="sm"
                          className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90"
                          onClick={() => updateLineStatus(line.id, 'preparing')}
                          disabled={updateOrderLineStatusMutation.isPending}
                          data-testid={`start-line-${line.id}`}
                        >
                          <Play className="w-4 h-4 mr-1" />
                          Start
                        </Button>
                      )}
                      {line.status === 'preparing' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => updateLineStatus(line.id, 'new')}
                            disabled={updateOrderLineStatusMutation.isPending}
                            data-testid={`pause-line-${line.id}`}
                          >
                            <Pause className="w-4 h-4 mr-1" />
                            Pause
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 bg-success text-white hover:bg-success/90"
                            onClick={() => updateLineStatus(line.id, 'ready')}
                            disabled={updateOrderLineStatusMutation.isPending}
                            data-testid={`complete-line-${line.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Ready
                          </Button>
                        </>
                      )}
                      {line.status === 'ready' && (
                        <Button
                          size="sm"
                          className="w-full bg-success text-white"
                          onClick={() => updateLineStatus(line.id, 'served')}
                          disabled={updateOrderLineStatusMutation.isPending}
                          data-testid={`serve-line-${line.id}`}
                        >
                          <ChefHat className="w-4 h-4 mr-1" />
                          Mark Served
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Station Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-primary" data-testid="orders-queue-count">{stats.new}</div>
            <div className="text-sm text-muted-foreground">Orders in Queue</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-warning" data-testid="orders-preparing-count">{stats.preparing}</div>
            <div className="text-sm text-muted-foreground">In Preparation</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-success" data-testid="orders-ready-count">{stats.ready}</div>
            <div className="text-sm text-muted-foreground">Ready to Serve</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-primary">12.5</div>
            <div className="text-sm text-muted-foreground">Avg Prep Time (min)</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
