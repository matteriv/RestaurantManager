import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useKitchenTimer, formatTimer } from '@/hooks/useKitchenTimer';
import { Clock, AlertTriangle, Play, Check } from 'lucide-react';
import type { OrderLine, MenuItem } from '@shared/schema';
import { useTranslation } from '@/lib/i18n';

interface OrderLineItemProps {
  orderLine: OrderLine & { menuItem: MenuItem };
  onStatusUpdate: (orderLineId: string, status: string) => void;
  isUpdating?: boolean;
}

export function OrderLineItem({ orderLine, onStatusUpdate, isUpdating = false }: OrderLineItemProps) {
  const { t } = useTranslation();
  
  // Determine the start time based on status
  const getStartTime = () => {
    switch (orderLine.status) {
      case 'preparing':
        return orderLine.startedAt;
      case 'ready':
        return orderLine.completedAt;
      default:
        return null;
    }
  };

  const timer = useKitchenTimer(
    getStartTime() || undefined, 
    orderLine.menuItem.prepTimeMinutes || undefined
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
            {(orderLine.status === 'preparing' || orderLine.status === 'ready') && (
              <div className={`flex items-center space-x-1 text-xs px-2 py-1 rounded ${
                timer.isOverdue ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white/80'
              }`}>
                <Clock className="w-3 h-3" />
                <span>{formatTimer(timer)}</span>
                {timer.expectedTime && (
                  <span className="text-white/60">
                    /{timer.expectedTime}min
                  </span>
                )}
                {timer.isOverdue && <AlertTriangle className="w-3 h-3 text-red-400" />}
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