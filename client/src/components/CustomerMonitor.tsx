import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { useTranslation } from '@/lib/i18n';
import { Bell, Clock, ChefHat, CheckCircle, Wifi, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import type { OrderWithDetails } from '@shared/schema';

export function CustomerMonitor() {
  const [readyOrders, setReadyOrders] = useState<Set<string>>(new Set());
  const [audioEnabled, setAudioEnabled] = useState(true);
  const { t, language } = useTranslation();
  
  const { lastMessage, isConnected } = useWebSocketContext();

  // Fetch orders that customers should see (preparing, ready)
  const { data: orders = [] } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/orders'],
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  // Filter and separate orders
  const preparingOrders = orders.filter(order => 
    order.status === 'preparing' || 
    (order.status === 'new' && order.orderLines.some(line => line.status === 'preparing'))
  );

  const readyOrders_ = orders.filter(order => 
    order.status === 'ready' || 
    order.orderLines.every(line => line.status === 'ready' || line.status === 'served')
  );

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'order-status-updated':
          const { order } = lastMessage.data;
          if (order.status === 'ready') {
            setReadyOrders(prev => new Set([...Array.from(prev), order.id]));
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
            setReadyOrders(prev => new Set([...Array.from(prev), orderId]));
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
    const readyLines = order.orderLines.filter(line => line.status === 'ready' || line.status === 'served').length;
    const preparingLines = order.orderLines.filter(line => line.status === 'preparing').length;
    
    // Calculate progress: preparing = 50%, ready = 100%
    const progress = ((preparingLines * 0.5) + readyLines) / totalLines * 100;
    return Math.round(progress);
  };

  const getEstimatedTime = (order: OrderWithDetails) => {
    const preparingLines = order.orderLines.filter(line => line.status === 'preparing');
    if (preparingLines.length === 0) return t('customer.order_ready');
    
    const avgPrepTime = preparingLines.reduce((sum, line) => 
      sum + (line.menuItem.prepTimeMinutes || 10), 0
    ) / preparingLines.length;
    
    return `${Math.ceil(avgPrepTime)} ${t('customer.remaining_min')}`;
  };

  const getElapsedTime = (order: OrderWithDetails) => {
    if (!order.createdAt) return '';
    return formatDistanceToNow(new Date(order.createdAt), { 
      addSuffix: false, 
      locale: language === 'it' ? it : undefined 
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-sm border-b border-white/20 p-6">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white mb-2">{t('customer.title')}</h1>
          <p className="text-white/80 text-xl">{t('customer.subtitle')}</p>
          <div className="flex items-center justify-center mt-4 space-x-3">
            {isConnected ? (
              <Wifi className="w-5 h-5 text-green-400" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-400" />
            )}
            <span className="text-white/60 text-lg">
              {isConnected ? t('customer.live_updates') : t('customer.connecting')}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        {preparingOrders.length === 0 && readyOrders_.length === 0 ? (
          <div className="text-center text-white mt-20">
            <ChefHat className="w-24 h-24 mx-auto mb-6 text-white/40" />
            <h2 className="text-4xl font-bold mb-4">{t('customer.no_orders')}</h2>
            <p className="text-white/80 text-xl">{t('customer.no_orders_desc')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-12">
            {/* Preparing Orders Section */}
            <div>
              <div className="text-center mb-8">
                <div className="bg-orange-500/20 backdrop-blur-sm rounded-2xl p-6 border border-orange-300/30">
                  <ChefHat className="w-12 h-12 mx-auto mb-3 text-orange-300" />
                  <h2 className="text-3xl font-bold text-white mb-2">{t('customer.cooking')}</h2>
                  <p className="text-orange-200 text-lg">{preparingOrders.length} {t('kds.order').toLowerCase()}</p>
                </div>
              </div>

              <div className="space-y-6">
                {preparingOrders.map((order) => {
                  const progress = getOrderProgress(order);
                  const estimatedTime = getEstimatedTime(order);
                  const elapsedTime = getElapsedTime(order);
                  
                  return (
                    <Card 
                      key={order.id}
                      className="bg-white/10 backdrop-blur-sm border-orange-300/30 hover:bg-white/15 transition-colors"
                      data-testid={`preparing-order-${order.id}`}
                    >
                      <CardContent className="p-6">
                        <div className="text-center mb-4">
                          <div className="text-6xl font-bold text-orange-300 mb-2" data-testid={`order-number-${order.id}`}>
                            {order.orderNumber}
                          </div>
                          <div className="text-white/80 text-sm">{t('customer.order_number')}</div>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="flex justify-between items-center text-white/80">
                            <span className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              {t('customer.progress')}
                            </span>
                            <span className="font-medium">{progress}%</span>
                          </div>
                          
                          <Progress 
                            value={progress} 
                            className="h-3 bg-white/20"
                            data-testid={`progress-${order.id}`}
                          />
                          
                          <div className="flex justify-between text-sm text-white/60">
                            <span>{t('customer.estimated_time')}: {estimatedTime}</span>
                            <span>{elapsedTime} fa</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Ready Orders Section */}
            <div>
              <div className="text-center mb-8">
                <div className="bg-green-500/20 backdrop-blur-sm rounded-2xl p-6 border border-green-300/30">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
                  <h2 className="text-3xl font-bold text-white mb-2">{t('customer.order_ready')}</h2>
                  <p className="text-green-200 text-lg">{readyOrders_.length} {t('kds.order').toLowerCase()}</p>
                </div>
              </div>

              <div className="space-y-6">
                {readyOrders_.map((order) => {
                  const elapsedTime = getElapsedTime(order);
                  
                  return (
                    <Card 
                      key={order.id}
                      className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-sm border-green-300/30 shadow-2xl transform hover:scale-105 transition-transform animate-pulse"
                      data-testid={`ready-order-${order.id}`}
                    >
                      <CardContent className="p-6">
                        <div className="text-center mb-4">
                          <div className="text-6xl font-bold text-green-300 mb-2" data-testid={`ready-order-number-${order.id}`}>
                            {order.orderNumber}
                          </div>
                          <div className="text-white/80 text-sm">{t('customer.order_number')}</div>
                        </div>
                        
                        <div className="text-center space-y-3">
                          <Bell className="w-16 h-16 mx-auto text-green-300 animate-bounce" />
                          <div className="text-2xl font-bold text-green-300" data-testid={`ready-status-${order.id}`}>
                            {t('customer.order_ready')}
                          </div>
                          <div className="text-green-200">{t('customer.collect')}</div>
                          <div className="text-sm text-white/60">
                            Pronto da {elapsedTime}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-16 text-white/40">
          <p className="text-lg">{t('customer.thank_you')}</p>
        </div>
      </div>
    </div>
  );
}