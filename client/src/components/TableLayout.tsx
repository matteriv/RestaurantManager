import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { apiRequest } from '@/lib/queryClient';
import { Move, Users, Clock, Euro } from 'lucide-react';
import type { TableWithOrders, OrderWithDetails } from '@shared/schema';

interface TableLayoutProps {
  onTableSelect?: (table: TableWithOrders) => void;
  selectedTableId?: string;
  showOrderTransfer?: boolean;
}

export function TableLayout({ onTableSelect, selectedTableId, showOrderTransfer = false }: TableLayoutProps) {
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [targetTableId, setTargetTableId] = useState<string>('');

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lastMessage } = useWebSocketContext();

  // Fetch tables with orders
  const { data: tables = [] } = useQuery<TableWithOrders[]>({
    queryKey: ['/api/tables/with-orders'],
  });

  // Transfer order mutation
  const transferOrderMutation = useMutation({
    mutationFn: async ({ orderId, tableId }: { orderId: string; tableId: string }) => {
      const response = await apiRequest('PATCH', `/api/orders/${orderId}`, { tableId });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Order transferred",
        description: "The order has been successfully transferred to the new table.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tables/with-orders'] });
      setTransferDialogOpen(false);
      setSelectedOrder(null);
      setTargetTableId('');
    },
    onError: (error) => {
      toast({
        title: "Transfer failed",
        description: "Failed to transfer the order. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'table-status-updated':
        case 'order-status-updated':
        case 'new-order':
          queryClient.invalidateQueries({ queryKey: ['/api/tables/with-orders'] });
          break;
      }
    }
  }, [lastMessage, queryClient]);

  const getTableStatus = (table: TableWithOrders) => {
    const activeOrders = table.orders.filter(order => 
      ['new', 'preparing', 'ready'].includes(order.status)
    );

    if (activeOrders.length > 0) {
      return {
        status: 'occupied',
        label: 'Occupied',
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        orderCount: activeOrders.length,
        totalAmount: activeOrders.reduce((sum, order) => sum + Number(order.total), 0),
        oldestOrder: activeOrders.reduce((oldest, order) => 
          new Date(order.createdAt) < new Date(oldest.createdAt) ? order : oldest
        )
      };
    }

    const closingOrders = table.orders.filter(order => order.status === 'served');
    if (closingOrders.length > 0) {
      return {
        status: 'closing',
        label: 'Closing',
        color: 'bg-red-100 text-red-800 border-red-200',
        orderCount: closingOrders.length,
        totalAmount: closingOrders.reduce((sum, order) => sum + Number(order.total), 0),
      };
    }

    return {
      status: 'free',
      label: 'Free',
      color: 'bg-green-100 text-green-800 border-green-200',
      orderCount: 0,
      totalAmount: 0,
    };
  };

  const getTimeElapsed = (createdAt: string) => {
    const minutes = Math.floor((new Date().getTime() - new Date(createdAt).getTime()) / (1000 * 60));
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 min';
    return `${minutes} min`;
  };

  const handleTableClick = (table: TableWithOrders) => {
    if (onTableSelect) {
      onTableSelect(table);
    }
  };

  const handleOrderTransfer = (order: OrderWithDetails) => {
    setSelectedOrder(order);
    setTransferDialogOpen(true);
  };

  const executeTransfer = () => {
    if (selectedOrder && targetTableId) {
      transferOrderMutation.mutate({
        orderId: selectedOrder.id,
        tableId: targetTableId,
      });
    }
  };

  // Create a grid layout based on table positions or simple grid
  const maxCols = 8;
  const gridTables = tables.slice().sort((a, b) => a.number - b.number);

  return (
    <div className="space-y-6">
      {/* Table Grid */}
      <div className="grid grid-cols-8 gap-4">
        {gridTables.map((table) => {
          const tableStatus = getTableStatus(table);
          const isSelected = selectedTableId === table.id;
          
          return (
            <Card
              key={table.id}
              className={`
                aspect-square cursor-pointer transition-all duration-200 border-2
                ${isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}
                ${tableStatus.color}
                hover:shadow-md hover:scale-105
              `}
              onClick={() => handleTableClick(table)}
              data-testid={`table-layout-${table.id}`}
            >
              <CardContent className="p-3 h-full flex flex-col justify-between">
                {/* Table Header */}
                <div className="text-center">
                  <div className="text-lg font-bold">T{table.number}</div>
                  <Badge 
                    variant="secondary" 
                    className="text-xs"
                    data-testid={`table-status-${table.id}`}
                  >
                    {tableStatus.label}
                  </Badge>
                </div>

                {/* Table Details */}
                <div className="text-center text-xs space-y-1">
                  {tableStatus.status === 'free' && (
                    <div className="flex items-center justify-center space-x-1">
                      <Users className="w-3 h-3" />
                      <span>{table.seats} seats</span>
                    </div>
                  )}

                  {tableStatus.status === 'occupied' && tableStatus.oldestOrder && (
                    <>
                      <div className="flex items-center justify-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{getTimeElapsed(tableStatus.oldestOrder.createdAt)}</span>
                      </div>
                      <div className="font-medium">
                        {tableStatus.orderCount} order{tableStatus.orderCount > 1 ? 's' : ''}
                      </div>
                      {showOrderTransfer && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-full text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOrderTransfer(tableStatus.oldestOrder!);
                          }}
                          data-testid={`transfer-order-${table.id}`}
                        >
                          <Move className="w-3 h-3 mr-1" />
                          Move
                        </Button>
                      )}
                    </>
                  )}

                  {tableStatus.status === 'closing' && (
                    <div className="flex items-center justify-center space-x-1">
                      <Euro className="w-3 h-3" />
                      <span>€{tableStatus.totalAmount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Table Legend */}
      <div className="flex items-center justify-center space-x-6 text-sm">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-green-100 border border-green-200 rounded"></div>
          <span>Free</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-yellow-100 border border-yellow-200 rounded"></div>
          <span>Occupied</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 bg-red-100 border border-red-200 rounded"></div>
          <span>Closing</span>
        </div>
      </div>

      {/* Order Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent data-testid="transfer-dialog">
          <DialogHeader>
            <DialogTitle>Transfer Order</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="text-sm">
                <p className="font-medium">Order #{selectedOrder.orderNumber}</p>
                <p className="text-muted-foreground">
                  From: Table {selectedOrder.table?.number}
                </p>
                <p className="text-muted-foreground">
                  Total: €{Number(selectedOrder.total).toFixed(2)}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Select target table:</label>
                <div className="grid grid-cols-6 gap-2 mt-2">
                  {tables
                    .filter(table => {
                      const status = getTableStatus(table);
                      return status.status === 'free' && table.id !== selectedOrder.tableId;
                    })
                    .map((table) => (
                      <Button
                        key={table.id}
                        variant={targetTableId === table.id ? 'default' : 'outline'}
                        className="aspect-square text-xs"
                        onClick={() => setTargetTableId(table.id)}
                        data-testid={`transfer-target-${table.id}`}
                      >
                        T{table.number}
                      </Button>
                    ))
                  }
                </div>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setTransferDialogOpen(false)}
                  data-testid="cancel-transfer"
                >
                  Cancel
                </Button>
                <Button
                  onClick={executeTransfer}
                  disabled={!targetTableId || transferOrderMutation.isPending}
                  data-testid="confirm-transfer"
                >
                  Transfer Order
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
