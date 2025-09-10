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
        className={`${buttonColor} text-white text-xs px-1.5 py-0.5 h-5`}
        data-testid={`btn-advance-${orderLine.id}`}
      >
        <Icon className="w-2.5 h-2.5 mr-1" />
        {text}
      </Button>
    );
  };

  return (
    <div className="flex items-center justify-between p-2 bg-white/10 rounded text-xs">
      <div className="flex-1 text-white">
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm">{orderLine.menuItem.name}</div>
          <div className="flex items-center space-x-1">
            {/* Timer display */}
            <div className={`flex items-center space-x-1 px-1.5 py-0.5 rounded ${
              currentTimer.status === 'overdue' ? 'bg-red-500/20 text-red-300' :
              currentTimer.status === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
              'bg-white/10 text-white/80'
            }`}>
              {isWaiting ? <Timer className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
              <span className="text-xs">{formatTimer(currentTimer)}</span>
              {currentTimer.expectedTime && isPreparing && (
                <span className="text-white/60 text-xs">
                  /{currentTimer.expectedTime}m
                </span>
              )}
              {currentTimer.status === 'overdue' && <AlertTriangle className="w-2.5 h-2.5 text-red-400" />}
            </div>
            
            {/* Progress bar for preparation phase */}
            {isPreparing && currentTimer.expectedTime && (
              <div className="w-12 h-1 bg-white/20 rounded-full overflow-hidden">
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
            <div className={`w-2 h-2 rounded-full ${getStatusColor(orderLine.status || 'new')}`}></div>
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-0.5">
          <div className="text-xs text-white/60">
            {orderLine.quantity && orderLine.quantity > 1 && (
              <span>Q:{orderLine.quantity}</span>
            )}
            {orderLine.quantity && orderLine.quantity > 1 && orderLine.notes && <span> • </span>}
            {orderLine.notes && <span className="truncate max-w-20">{orderLine.notes}</span>}
            {isWaiting && <span className="text-yellow-300">attesa</span>}
          </div>
          
          {/* Action button */}
          {getActionButton()}
        </div>
      </div>
    </div>
  );
}