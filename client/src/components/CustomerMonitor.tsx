import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  
  const { lastMessage, isConnected } = useWebSocketContext();

  // Fetch orders that customers should see (preparing, ready)
  const { data: orders = [] } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/orders'],
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  // Filter and separate orders
  const allPreparingOrders = orders.filter(order => 
    order.status === 'preparing' || 
    (order.status === 'new' && order.orderLines.some(line => line.status === 'preparing'))
  );

  const allReadyOrders = orders.filter(order => 
    order.status === 'ready' || 
    order.orderLines.every(line => line.status === 'ready' || line.status === 'served')
  );

  // Limit displayed orders and create "others" sections
  const maxDisplayed = 3;
  const preparingOrders = allPreparingOrders.slice(0, maxDisplayed);
  const otherPreparingOrders = allPreparingOrders.slice(maxDisplayed);
  const readyOrders_ = allReadyOrders.slice(0, maxDisplayed);
  const otherReadyOrders = allReadyOrders.slice(maxDisplayed);

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'order-status-updated':
          const { order } = lastMessage.data;
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
          if (order.status === 'ready') {
            setReadyOrders(prev => new Set([...Array.from(prev), order.id]));
            // Play notification sound
            if (audioEnabled) {
              playNotificationSound();
            }
          }
          break;
        case 'order-line-status-updated':
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
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
  }, [lastMessage, orders, audioEnabled, queryClient]);

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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-800 to-indigo-900">
      {/* Header */}
      <div className="bg-white/20 backdrop-blur-sm border-b border-white/30 p-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-1">{t('customer.title')}</h1>
          <p className="text-white/90 text-lg">{t('customer.subtitle')}</p>
          <div className="flex items-center justify-center mt-2 space-x-3">
            {isConnected ? (
              <Wifi className="w-4 h-4 text-green-300" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-300" />
            )}
            <span className="text-white/80 text-sm">
              {isConnected ? t('customer.live_updates') : t('customer.connecting')}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4">
        {allPreparingOrders.length === 0 && allReadyOrders.length === 0 ? (
          <div className="text-center text-white mt-16">
            <ChefHat className="w-16 h-16 mx-auto mb-4 text-white/50" />
            <h2 className="text-2xl font-bold mb-2">{t('customer.no_orders')}</h2>
            <p className="text-white/80 text-lg">{t('customer.no_orders_desc')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {/* Preparing Orders Section */}
            <div>
              <div className="text-center mb-4">
                <div className="bg-orange-500/30 backdrop-blur-sm rounded-xl p-3 border border-orange-300/50">
                  <ChefHat className="w-8 h-8 mx-auto mb-2 text-orange-300" />
                  <h2 className="text-xl font-bold text-white mb-1">{t('customer.cooking')}</h2>
                  <p className="text-orange-200 text-sm font-semibold">{allPreparingOrders.length} {t('kds.order').toLowerCase()}</p>
                </div>
              </div>

              <div className="space-y-3">
                {preparingOrders.map((order) => {
                  const progress = getOrderProgress(order);
                  const estimatedTime = getEstimatedTime(order);
                  const elapsedTime = getElapsedTime(order);
                  
                  return (
                    <Card 
                      key={order.id}
                      className="bg-white/15 backdrop-blur-sm border-orange-300/50 hover:bg-white/20 transition-colors shadow-lg"
                      data-testid={`preparing-order-${order.id}`}
                    >
                      <CardContent className="p-3">
                        <div className="text-center mb-3">
                          <div className="text-4xl font-bold text-orange-200 mb-1" data-testid={`order-number-${order.id}`}>
                            {order.orderNumber}
                          </div>
                          <div className="text-white/90 text-xs font-medium">{t('customer.order_number')}</div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-white/90">
                            <span className="flex items-center gap-1 text-xs">
                              <Clock className="w-3 h-3" />
                              {t('customer.progress')}
                            </span>
                            <span className="font-bold text-orange-200">{progress}%</span>
                          </div>
                          
                          <Progress 
                            value={progress} 
                            className="h-2 bg-white/30"
                            data-testid={`progress-${order.id}`}
                          />
                          
                          <div className="flex justify-between text-xs text-white/80">
                            <span className="font-medium">{estimatedTime}</span>
                            <span>{elapsedTime} fa</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Other Preparing Orders Section */}
              {otherPreparingOrders.length > 0 && (
                <div className="mt-4">
                  <div className="text-center mb-2">
                    <div className="bg-orange-500/20 backdrop-blur-sm rounded-lg p-2 border border-orange-300/30">
                      <h3 className="text-sm font-bold text-orange-200">ALTRI ({otherPreparingOrders.length})</h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {otherPreparingOrders.map((order) => (
                      <Card 
                        key={order.id}
                        className="bg-white/10 backdrop-blur-sm border-orange-300/30 hover:bg-white/15 transition-colors"
                        data-testid={`other-preparing-order-${order.id}`}
                      >
                        <CardContent className="p-2 text-center">
                          <div className="text-2xl font-bold text-orange-200 mb-1" data-testid={`other-order-number-${order.id}`}>
                            {order.orderNumber}
                          </div>
                          <div className="text-xs text-white/80">{getElapsedTime(order)} fa</div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ready Orders Section */}
            <div>
              <div className="text-center mb-4">
                <div className="bg-green-500/30 backdrop-blur-sm rounded-xl p-3 border border-green-300/50">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-300" />
                  <h2 className="text-xl font-bold text-white mb-1">{t('customer.order_ready')}</h2>
                  <p className="text-green-200 text-sm font-semibold">{allReadyOrders.length} {t('kds.order').toLowerCase()}</p>
                </div>
              </div>

              <div className="space-y-3">
                {readyOrders_.map((order) => {
                  const elapsedTime = getElapsedTime(order);
                  
                  return (
                    <Card 
                      key={order.id}
                      className="bg-gradient-to-br from-green-600/40 to-emerald-600/40 backdrop-blur-sm border-green-200/80 shadow-2xl transform hover:scale-102 transition-transform animate-pulse ring-4 ring-yellow-300/70 border-2"
                      data-testid={`ready-order-${order.id}`}
                    >
                      <CardContent className="p-3">
                        <div className="text-center mb-2">
                          <div className="text-4xl font-bold text-white mb-1 drop-shadow-lg" data-testid={`ready-order-number-${order.id}`}>
                            {order.orderNumber}
                          </div>
                          <div className="text-white/90 text-xs font-medium">{t('customer.order_number')}</div>
                        </div>
                        
                        <div className="text-center space-y-2">
                          <Bell className="w-10 h-10 mx-auto text-yellow-200 animate-bounce drop-shadow-lg" />
                          <div className="text-lg font-bold text-white drop-shadow-lg" data-testid={`ready-status-${order.id}`}>
                            {t('customer.order_ready')}
                          </div>
                          <div className="text-yellow-100 text-sm font-bold drop-shadow-md">{t('customer.collect')}</div>
                          <div className="text-xs text-white/80">
                            Pronto da {elapsedTime}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Other Ready Orders Section */}
              {otherReadyOrders.length > 0 && (
                <div className="mt-4">
                  <div className="text-center mb-2">
                    <div className="bg-green-500/20 backdrop-blur-sm rounded-lg p-2 border border-green-300/30">
                      <h3 className="text-sm font-bold text-green-200">ALTRI ({otherReadyOrders.length})</h3>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {otherReadyOrders.map((order) => (
                      <Card 
                        key={order.id}
                        className="bg-green-500/20 backdrop-blur-sm border-green-300/40 hover:bg-green-500/30 transition-colors animate-pulse"
                        data-testid={`other-ready-order-${order.id}`}
                      >
                        <CardContent className="p-2 text-center">
                          <div className="text-2xl font-bold text-white mb-1 drop-shadow-lg" data-testid={`other-ready-order-number-${order.id}`}>
                            {order.orderNumber}
                          </div>
                          <div className="text-xs text-yellow-100 font-semibold">PRONTO</div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-white/50">
          <p className="text-sm">{t('customer.thank_you')}</p>
        </div>
      </div>
    </div>
  );
}