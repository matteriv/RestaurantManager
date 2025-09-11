import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { useTranslation } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Timer, Play, Pause, Check, ChefHat, Coffee, Pizza, IceCream, Flame, Wifi, WifiOff, Move, Clock, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { useKitchenTimer, formatTimer } from '@/hooks/useKitchenTimer';
import { OrderLineItem } from '@/components/OrderLineItem';
import type { OrderWithDetails, OrderLine } from '@shared/schema';

type Station = 'all' | 'bar' | 'pizza' | 'cucina' | 'dessert' | 'griglia' | 'friggitrice' | 'stazione_fredda';

const STATIONS = [
  { value: 'all', label: 'kds.all_stations', icon: ChefHat, color: 'bg-slate-600' },
  { value: 'bar', label: 'kds.bar', icon: Coffee, color: 'bg-amber-600' },
  { value: 'pizza', label: 'kds.pizza', icon: Pizza, color: 'bg-red-600' },
  { value: 'cucina', label: 'kds.kitchen', icon: ChefHat, color: 'bg-blue-600' },
  { value: 'dessert', label: 'kds.dessert', icon: IceCream, color: 'bg-pink-600' },
  { value: 'griglia', label: 'kds.grill', icon: Flame, color: 'bg-orange-600' },
  { value: 'friggitrice', label: 'kds.fryer', icon: Flame, color: 'bg-yellow-600' },
  { value: 'stazione_fredda', label: 'kds.cold_station', icon: ChefHat, color: 'bg-cyan-600' }
] as const;

export function KitchenDisplay() {
  const [selectedStation, setSelectedStation] = useState<Station>('all');
  const [activeOrders, setActiveOrders] = useState<{ [key: string]: Date }>({});
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lastMessage, isConnected } = useWebSocketContext();

  // Fetch orders
  const { data: orders = [] } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/orders'],
    refetchInterval: 3000, // Refetch every 3 seconds
  });

  // Filter orders for kitchen display
  const kitchenOrders = orders.filter(order => 
    ['new', 'preparing'].includes(order.status) && order.orderLines.length > 0
  );

  // Filter by station
  const filteredOrders = kitchenOrders.filter(order => {
    if (selectedStation === 'all') return true;
    
    return order.orderLines.some(line => {
      const station = line.menuItem.station?.toLowerCase();
      return station === selectedStation;
    });
  });

  // Group orders by line item status - show order in column if it has items in that status
  const getOrdersWithItemsInStatus = (status: string) => {
    return filteredOrders
      .filter(order => 
        order.orderLines.some(line => 
          (selectedStation === 'all' || line.menuItem.station?.toLowerCase() === selectedStation) &&
          (line.status || 'new') === status
        )
      )
      .map(order => ({
        ...order,
        // For display, we'll show all items but highlight the ones in this status
        orderLines: order.orderLines.filter(line => 
          selectedStation === 'all' || line.menuItem.station?.toLowerCase() === selectedStation
        )
      }));
  };

  const newOrders = getOrdersWithItemsInStatus('new');
  const preparingOrders = getOrdersWithItemsInStatus('preparing');
  const readyOrders = getOrdersWithItemsInStatus('ready');

  // Update order line status mutation
  const updateOrderLineMutation = useMutation({
    mutationFn: async ({ orderLineId, status }: { orderLineId: string; status: string }) => {
      return await apiRequest('PATCH', `/api/order-lines/${orderLineId}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('msg.error_updating'),
        variant: 'destructive',
      });
    },
  });

  // Start order mutation
  const startOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await apiRequest('PATCH', `/api/orders/${orderId}/status`, { status: 'preparing' });
    },
    onSuccess: (data, orderId) => {
      setActiveOrders(prev => ({ ...prev, [orderId]: new Date() }));
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
    },
  });

  // Mark order ready mutation
  const markReadyMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await apiRequest('PATCH', `/api/orders/${orderId}/status`, { status: 'ready' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
    },
  });

  // WebSocket updates
  useEffect(() => {
    if (lastMessage) {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
    }
  }, [lastMessage, queryClient]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'preparing': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'ready': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getLineStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-500';
      case 'preparing': return 'bg-yellow-500';
      case 'ready': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getElapsedTime = (order: OrderWithDetails) => {
    if (!order.createdAt) return '';
    return formatDistanceToNow(new Date(order.createdAt), { 
      addSuffix: false, 
      locale: language === 'it' ? it : undefined 
    });
  };

  const canStartOrder = (order: OrderWithDetails) => {
    if (selectedStation === 'all') return order.status === 'new';
    
    // Check if this station has any items in this order
    const stationItems = order.orderLines.filter(line => 
      line.menuItem.station?.toLowerCase() === selectedStation
    );
    
    return stationItems.length > 0 && stationItems.some(item => item.status === 'new');
  };

  const canCompleteOrder = (order: OrderWithDetails) => {
    if (selectedStation === 'all') {
      return order.orderLines.every(line => line.status === 'ready');
    }
    
    // For specific stations, check if all station items are ready
    const stationItems = order.orderLines.filter(line => 
      line.menuItem.station?.toLowerCase() === selectedStation
    );
    
    return stationItems.length > 0 && stationItems.every(item => item.status === 'ready');
  };

  const startOrder = (orderId: string) => {
    startOrderMutation.mutate(orderId);
  };

  const markOrderReady = (orderId: string) => {
    markReadyMutation.mutate(orderId);
  };

  const updateLineStatus = (orderLineId: string, status: string) => {
    updateOrderLineMutation.mutate({ orderLineId, status });
  };

  // Drag and drop handler
  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Check if dropped outside valid area
    if (!destination) return;

    // Check if dropped in same position
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    // Map column IDs to order statuses
    const statusMap: { [key: string]: string } = {
      'new-orders': 'new',
      'preparing-orders': 'preparing', 
      'ready-orders': 'ready'
    };

    const newStatus = statusMap[destination.droppableId];
    if (!newStatus) return;

    // Extract order ID from draggableId (format: order-{id})
    const orderId = draggableId.replace('order-', '');

    // Update order status
    if (newStatus === 'preparing') {
      startOrderMutation.mutate(orderId);
    } else if (newStatus === 'ready') {
      markReadyMutation.mutate(orderId);
    }
  };

  const selectedStationConfig = STATIONS.find(s => s.value === selectedStation);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-gray-800 to-slate-900">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-sm border-b border-white/20 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {selectedStationConfig && (
              <div className={`p-3 rounded-lg ${selectedStationConfig.color}`}>
                <selectedStationConfig.icon className="w-8 h-8 text-white" />
              </div>
            )}
            <div>
              <h1 className="text-4xl font-bold text-white">{t('kds.title')}</h1>
              <p className="text-white/80 text-lg">
                {t('kds.station')}: {selectedStationConfig ? t(selectedStationConfig.label) : t('kds.all_stations')}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {isConnected ? (
                <Wifi className="w-5 h-5 text-green-400" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-400" />
              )}
              <span className="text-white/60">
                {isConnected ? t('kds.live') : t('kds.disconnected')}
              </span>
            </div>

            <Select value={selectedStation} onValueChange={(value: Station) => setSelectedStation(value)}>
              <SelectTrigger className="w-48 bg-white/10 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATIONS.map(station => (
                  <SelectItem key={station.value} value={station.value}>
                    <div className="flex items-center space-x-2">
                      <station.icon className="w-4 h-4" />
                      <span>{t(station.label)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 mt-6">
          <div className="bg-blue-500/20 backdrop-blur-sm rounded-lg p-4 border border-blue-300/30">
            <div className="text-blue-300 text-sm">{t('kds.queue')}</div>
            <div className="text-3xl font-bold text-white">{newOrders.length}</div>
          </div>
          <div className="bg-yellow-500/20 backdrop-blur-sm rounded-lg p-4 border border-yellow-300/30">
            <div className="text-yellow-300 text-sm">{t('kds.preparing')}</div>
            <div className="text-3xl font-bold text-white">{preparingOrders.length}</div>
          </div>
          <div className="bg-green-500/20 backdrop-blur-sm rounded-lg p-4 border border-green-300/30">
            <div className="text-green-300 text-sm">{t('kds.avg_prep_time')}</div>
            <div className="text-3xl font-bold text-white">12</div>
          </div>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="p-6">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-3 gap-6">
          {/* New Orders */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">{t('status.new')}</h2>
            <Droppable droppableId="new-orders">
              {(provided, snapshot) => (
                <div 
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={`space-y-4 min-h-[200px] p-2 rounded-lg transition-all ${
                    snapshot.isDraggingOver ? 'bg-blue-500/10 border-2 border-blue-400 border-dashed' : ''
                  }`}
                >
                  {newOrders.map((order, index) => (
                    <Draggable key={order.id} draggableId={`order-${order.id}`} index={index}>
                      {(provided, snapshot) => (
                        <Card 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`bg-blue-500/20 backdrop-blur-sm border-blue-300/30 transition-all ${
                            snapshot.isDragging ? 'rotate-2 shadow-2xl scale-105' : ''
                          }`}
                          data-testid={`new-order-${order.id}`}
                        >
                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                            <div className="absolute top-2 right-2 text-blue-300">
                              <Move className="w-4 h-4" />
                            </div>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white text-sm">
                        #{String(order.orderNumber).padStart(4, '0')} - T{order.table?.number}
                      </CardTitle>
                      <div className="flex items-center space-x-1">
                        <Badge className="bg-blue-500 text-white text-xs px-1">
                          {order.orderLines.filter(line => (line.status || 'new') === 'new').length} nuovi
                        </Badge>
                        <Badge className="bg-white/10 text-white/80 text-xs px-1">
                          {getElapsedTime(order)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {order.orderLines
                      .filter(line => (line.status || 'new') === 'new')
                      .map(line => (
                        <OrderLineItem 
                          key={line.id}
                          orderLine={line}
                          order={order}
                          onStatusUpdate={updateLineStatus}
                          isUpdating={updateOrderLineMutation.isPending}
                        />
                      ))}
                    
                    {canStartOrder(order) && (
                            <Button 
                              onClick={() => startOrder(order.id)}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                              data-testid={`start-order-${order.id}`}
                            >
                              <Play className="w-4 h-4 mr-2" />
                              {t('kds.start')}
                            </Button>
                          )}
                          </CardContent>
                          </div>
                        </Card>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          {/* Preparing Orders */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">{t('kds.preparing')}</h2>
            <Droppable droppableId="preparing-orders">
              {(provided, snapshot) => (
                <div 
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={`space-y-4 min-h-[200px] p-2 rounded-lg transition-all ${
                    snapshot.isDraggingOver ? 'bg-yellow-500/10 border-2 border-yellow-400 border-dashed' : ''
                  }`}
                >
                  {preparingOrders.map((order, index) => (
                    <Draggable key={order.id} draggableId={`order-${order.id}`} index={index}>
                      {(provided, snapshot) => (
                        <Card 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`bg-yellow-500/20 backdrop-blur-sm border-yellow-300/30 transition-all ${
                            snapshot.isDragging ? 'rotate-2 shadow-2xl scale-105' : ''
                          }`}
                          data-testid={`preparing-order-${order.id}`}
                        >
                          <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                            <div className="absolute top-2 right-2 text-yellow-300">
                              <Move className="w-4 h-4" />
                            </div>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white text-sm">
                        #{String(order.orderNumber).padStart(4, '0')} - T{order.table?.number}
                      </CardTitle>
                      <div className="flex items-center space-x-1">
                        <Badge className="bg-yellow-500 text-white text-xs px-1">
                          <Timer className="w-2.5 h-2.5 mr-0.5" />
                          {order.orderLines.filter(line => (line.status || 'new') === 'preparing').length}
                        </Badge>
                        <Badge className="bg-white/10 text-white/80 text-xs px-1">
                          {getElapsedTime(order)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {order.orderLines
                      .filter(line => (line.status || 'new') === 'preparing')
                      .map(line => (
                        <OrderLineItem 
                          key={line.id}
                          orderLine={line}
                          order={order}
                          onStatusUpdate={updateLineStatus}
                          isUpdating={updateOrderLineMutation.isPending}
                        />
                      ))}
                    
                            {canCompleteOrder(order) && (
                              <Button 
                                onClick={() => markOrderReady(order.id)}
                                className="w-full bg-green-600 hover:bg-green-700 text-white"
                                data-testid={`complete-order-${order.id}`}
                              >
                                <Check className="w-4 h-4 mr-2" />
                                {t('kds.ready')}
                              </Button>
                            )}
                          </CardContent>
                          </div>
                        </Card>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          {/* Ready Orders */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">{t('kds.ready_to_serve')}</h2>
            <Droppable droppableId="ready-orders">
              {(provided, snapshot) => (
                <div 
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className={`space-y-4 min-h-[200px] p-2 rounded-lg transition-all ${
                    snapshot.isDraggingOver ? 'bg-green-500/10 border-2 border-green-400 border-dashed' : ''
                  }`}
                >
                  {readyOrders.map((order, index) => (
                      <Draggable key={order.id} draggableId={`order-${order.id}`} index={index}>
                        {(provided, snapshot) => (
                          <Card 
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`bg-green-500/20 backdrop-blur-sm border-green-300/30 transition-all ${
                              snapshot.isDragging ? 'rotate-2 shadow-2xl scale-105' : ''
                            }`}
                            data-testid={`ready-order-${order.id}`}
                          >
                            <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                              <div className="absolute top-2 right-2 text-green-300">
                                <Move className="w-4 h-4" />
                              </div>
                              <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                  <CardTitle className="text-white text-sm">
                                    #{String(order.orderNumber).padStart(4, '0')} - T{order.table?.number}
                                  </CardTitle>
                                  <div className="flex items-center space-x-1">
                                    <Badge className="bg-green-500 text-white text-xs px-1">
                                      <Check className="w-2.5 h-2.5 mr-0.5" />
                                      {order.orderLines.filter(line => (line.status || 'new') === 'ready').length}
                                    </Badge>
                                    <Badge className="bg-white/10 text-white/80 text-xs px-1">
                                      {getElapsedTime(order)}
                                    </Badge>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {order.orderLines
                                  .filter(line => (line.status || 'new') === 'ready')
                                  .map(line => (
                                    <OrderLineItem 
                                      key={line.id}
                                      orderLine={line}
                                      order={order}
                                      onStatusUpdate={updateLineStatus}
                                      isUpdating={updateOrderLineMutation.isPending}
                                    />
                                  ))}
                                
                                <div className="text-center text-green-300 mt-4">
                                  <Check className="w-8 h-8 mx-auto mb-2" />
                                  <div className="text-lg font-semibold">{t('kds.ready')}</div>
                                  <div className="text-sm text-green-300/80">Pronto da {getElapsedTime(order)}</div>
                                </div>
                              </CardContent>
                            </div>
                          </Card>
                        )}
                      </Draggable>
                    ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
          </div>
        </DragDropContext>
      </div>
    </div>
  );
}