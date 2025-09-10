import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDualKitchenTimer, formatTimer } from '@/hooks/useKitchenTimer';
import { Clock, AlertTriangle, Play, Check, Timer } from 'lucide-react';
import type { OrderLine, MenuItem, Order } from '@shared/schema';
import { useTranslation } from '@/lib/i18n';

interface OrderLineItemProps {
  orderLine: OrderLine & { menuItem: MenuItem };
  order: Order;
  onStatusUpdate: (orderLineId: string, status: string) => void;
  isUpdating?: boolean;
}

export function OrderLineItem({ orderLine, order, onStatusUpdate, isUpdating = false }: OrderLineItemProps) {
  const { t } = useTranslation();
  
  // Use dual timer system for waiting + preparation phases
  const {
    waitingTimer,
    preparationTimer,
    currentTimer,
    isWaiting,
    isPreparing
  } = useDualKitchenTimer(
    order.createdAt || undefined,
    orderLine.startedAt || undefined,
    orderLine.completedAt || undefined,
    orderLine.menuItem.prepTimeMinutes || undefined,
    orderLine.status || 'new'
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-500';
      case 'preparing': return 'bg-yellow-500';
      case 'ready': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getNextStatus = () => {
    switch (orderLine.status) {
      case 'new': return 'preparing';
      case 'preparing': return 'ready';
      default: return null;
    }
  };

  const getActionButton = () => {
    const nextStatus = getNextStatus();
    if (!nextStatus) return null;

    const isPreparingStep = nextStatus === 'preparing';
    const buttonColor = isPreparingStep ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700';
    const Icon = isPreparingStep ? Play : Check;
    const text = isPreparingStep ? t('kds.start') : t('kds.ready');

    return (
      <Button
        size="sm"
        onClick={() => onStatusUpdate(orderLine.id, nextStatus)}
        disabled={isUpdating}
        className={`${buttonColor} text-white text-xs px-2 py-1 h-6`}
        data-testid={`btn-advance-${orderLine.id}`}
      >
        <Icon className="w-3 h-3 mr-1" />
        {text}
      </Button>
    );
  };

  return (
    <div className="flex items-center justify-between p-3 bg-white/10 rounded-lg">
      <div className="flex-1 text-white">
        <div className="flex items-center justify-between">
          <div className="font-medium">{orderLine.menuItem.name}</div>
          <div className="flex items-center space-x-2">
            {/* Timer display */}
            <div className={`flex items-center space-x-1 text-xs px-2 py-1 rounded ${
              currentTimer.status === 'overdue' ? 'bg-red-500/20 text-red-300' :
              currentTimer.status === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
              'bg-white/10 text-white/80'
            }`}>
              {isWaiting ? <Timer className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              <span>{formatTimer(currentTimer)}</span>
              {currentTimer.expectedTime && isPreparing && (
                <span className="text-white/60">
                  /{currentTimer.expectedTime}min
                </span>
              )}
              {currentTimer.status === 'overdue' && <AlertTriangle className="w-3 h-3 text-red-400" />}
              {isWaiting && <span className="text-white/60 text-xs">attesa</span>}
            </div>
            
            {/* Progress bar for preparation phase */}
            {isPreparing && currentTimer.expectedTime && (
              <div className="w-16 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    currentTimer.status === 'overdue' ? 'bg-red-500' :
                    currentTimer.status === 'warning' ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(currentTimer.progressPercentage, 100)}%` }}
                />
              </div>
            )}
            
            {/* Status indicator */}
            <div className={`w-3 h-3 rounded-full ${getStatusColor(orderLine.status || 'new')}`}></div>
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-1">
          <div className="text-sm text-white/60">
            {orderLine.quantity && orderLine.quantity > 1 && (
              <span>Qty: {orderLine.quantity}</span>
            )}
            {orderLine.quantity && orderLine.quantity > 1 && orderLine.notes && <span> • </span>}
            {orderLine.notes && <span>Note: {orderLine.notes}</span>}
          </div>
          
          {/* Action button */}
          {getActionButton()}
        </div>
      </div>
    </div>
  );
}