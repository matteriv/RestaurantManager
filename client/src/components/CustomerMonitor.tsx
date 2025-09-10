import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { Bell } from 'lucide-react';
import type { OrderWithDetails } from '@shared/schema';

export function CustomerMonitor() {
  const [readyOrders, setReadyOrders] = useState<Set<string>>(new Set());
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  const { lastMessage, isConnected } = useWebSocketContext();

  // Fetch orders that customers should see (preparing, ready)
  const { data: orders = [] } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/orders'],
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Filter orders for customer display
  const customerOrders = orders.filter(order => 
    ['preparing', 'ready'].includes(order.status)
  );

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'order-status-updated':
          const { order } = lastMessage.data;
          if (order.status === 'ready') {
            setReadyOrders(prev => new Set([...prev, order.id]));
            // Play notification sound
            if (audioEnabled) {
              playNotificationSound();
            }
          }
          break;
        case 'order-line-status-updated':
          // Check if all lines in order are ready
          const orderId = lastMessage.data.orderLine.orderId;
          const orderToCheck = orders.find(o => o.id === orderId);
          if (orderToCheck && orderToCheck.orderLines.every(line => line.status === 'ready')) {
            setReadyOrders(prev => new Set([...prev, orderId]));
            if (audioEnabled) {
              playNotificationSound();
            }
          }
          break;
      }
    }
  }, [lastMessage, orders, audioEnabled]);

  const playNotificationSound = () => {
    try {
      // Create a simple notification sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  };

  const getOrderProgress = (order: OrderWithDetails) => {
    const totalLines = order.orderLines.length;
    const readyLines = order.orderLines.filter(line => line.status === 'ready').length;
    const preparingLines = order.orderLines.filter(line => line.status === 'preparing').length;
    
    // Calculate progress: preparing = 50%, ready = 100%
    const progress = ((preparingLines * 0.5) + readyLines) / totalLines * 100;
    return Math.round(progress);
  };

  const getEstimatedTime = (order: OrderWithDetails) => {
    const preparingLines = order.orderLines.filter(line => line.status === 'preparing');
    if (preparingLines.length === 0) return 'Ready!';
    
    const avgPrepTime = preparingLines.reduce((sum, line) => 
      sum + (line.menuItem.prepTimeMinutes || 10), 0
    ) / preparingLines.length;
    
    return `~${Math.ceil(avgPrepTime)} minutes remaining`;
  };

  const isOrderReady = (order: OrderWithDetails) => {
    return order.status === 'ready' || 
           order.orderLines.every(line => line.status === 'ready');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'preparing': return 'bg-yellow-100 text-yellow-800';
      case 'ready': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-secondary flex flex-col">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-sm border-b border-white/20 p-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Order Status</h1>
          <p className="text-white/80 text-lg">Track your order progress in real-time</p>
          <div className="flex items-center justify-center mt-2 space-x-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
            <span className="text-white/60 text-sm">{isConnected ? 'Live Updates' : 'Connecting...'}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        {customerOrders.length === 0 ? (
          <div className="text-center text-white">
            <h2 className="text-2xl font-bold mb-4">No Active Orders</h2>
            <p className="text-white/80">All orders have been served. Thank you!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-8 mb-8">
            {customerOrders.map((order) => {
              const orderReady = isOrderReady(order);
              const progress = getOrderProgress(order);
              
              return (
                <Card 
                  key={order.id}
                  className={`${
                    orderReady 
                      ? 'bg-gradient-to-br from-success to-green-400 text-white shadow-2xl transform animate-bounce' 
                      : 'bg-white shadow-2xl'
                  } rounded-2xl p-8 transform hover:scale-105 transition-transform`}
                  data-testid={`customer-order-${order.id}`}
                >
                  <CardContent className="p-0">
                    <div className="text-center mb-6">
                      <div className={`text-6xl font-bold mb-2 ${orderReady ? 'text-white' : 'text-primary'}`} data-testid={`order-number-display-${order.id}`}>
                        {order.orderNumber}
                      </div>
                      <div className={`text-xl ${orderReady ? 'text-white/80' : 'text-muted-foreground'}`}>
                        Order Number
                      </div>
                    </div>
                    
                    <div className="space-y-4 mb-6">
                      {order.orderLines.map((line) => (
                        <div 
                          key={line.id}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            orderReady ? 'bg-white/20' : 'bg-accent'
                          }`}
                          data-testid={`customer-line-${line.id}`}
                        >
                          <span className={`font-medium ${orderReady ? 'text-white' : 'text-foreground'}`}>
                            {line.menuItem.name} {line.quantity > 1 && `x${line.quantity}`}
                          </span>
                          <Badge 
                            className={orderReady ? 'bg-white/30 text-white' : getStatusColor(line.status)}
                            data-testid={`customer-line-status-${line.id}`}
                          >
                            {line.status}
                          </Badge>
                        </div>
                      ))}
                    </div>

                    {orderReady ? (
                      <div className="text-center">
                        <div className="text-4xl mb-4">
                          <Bell className="w-16 h-16 mx-auto text-white animate-bounce" />
                        </div>
                        <div className="text-2xl font-bold text-white mb-2" data-testid={`order-ready-${order.id}`}>
                          ORDER READY!
                        </div>
                        <div className="text-white/80">Please collect from counter</div>
                      </div>
                    ) : (
                      <>
                        <div className="mb-6">
                          <div className="flex justify-between text-sm text-muted-foreground mb-2">
                            <span>Progress</span>
                            <span data-testid={`estimated-time-${order.id}`}>{getEstimatedTime(order)}</span>
                          </div>
                          <Progress 
                            value={progress} 
                            className="h-3"
                            data-testid={`progress-bar-${order.id}`}
                          />
                        </div>

                        <div className="text-center">
                          <div className="inline-flex items-center space-x-2 text-warning">
                            <div className="w-3 h-3 bg-warning rounded-full animate-pulse"></div>
                            <span className="font-medium" data-testid={`status-text-${order.id}`}>
                              {progress < 100 ? 'Cooking in Progress' : 'Almost Ready!'}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Promotional Content */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <div className="text-center text-white">
            <h3 className="text-2xl font-bold mb-2">Today's Special</h3>
            <p className="text-lg mb-4">Fresh Pasta Carbonara - Only €16.00</p>
            <p className="text-white/80">Made with authentic Italian ingredients</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white/10 backdrop-blur-sm border-t border-white/20 p-4">
        <div className="text-center text-white/60 text-sm">
          <p>Thank you for dining with us! • Follow us @restaurant_social</p>
        </div>
      </div>
    </div>
  );
}
