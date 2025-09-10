import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { apiRequest } from '@/lib/queryClient';
import { 
  Check, 
  Clock, 
  AlertCircle, 
  Users, 
  ChefHat,
  Smartphone,
  TableCellsSplit
} from 'lucide-react';
import type { Order, Table } from '@shared/schema';

interface OrderWithTable extends Order {
  table?: Table;
}

export function WaiterInterface() {
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lastMessage } = useWebSocketContext();

  // Fetch orders data
  const { data: orders = [] } = useQuery<OrderWithTable[]>({
    queryKey: ['/api/orders', selectedStatus],
    queryFn: async () => {
      const response = await apiRequest('GET', selectedStatus ? `/api/orders?status=${selectedStatus}` : '/api/orders');
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Fetch tables data
  const { data: tables = [] } = useQuery<Table[]>({
    queryKey: ['/api/tables'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Update order status mutation
  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const response = await apiRequest('PATCH', `/api/orders/${orderId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Order updated",
        description: "Order status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update order status.",
        variant: "destructive",
      });
    },
  });

  // Update table status mutation
  const updateTableStatusMutation = useMutation({
    mutationFn: async ({ tableId, status }: { tableId: string; status: string }) => {
      const response = await apiRequest('PATCH', `/api/tables/${tableId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Table updated",
        description: "Table status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tables'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update table status.",
        variant: "destructive",
      });
    },
  });

  const getOrderStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'preparing': return 'bg-yellow-100 text-yellow-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'served': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTableStatusColor = (status: string) => {
    switch (status) {
      case 'free': return 'bg-green-100 text-green-800 border-green-200';
      case 'occupied': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'closing': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const statusOptions = [
    { value: '', label: 'All Orders' },
    { value: 'new', label: 'New Orders' },
    { value: 'preparing', label: 'Preparing' },
    { value: 'ready', label: 'Ready to Serve' },
    { value: 'served', label: 'Served' },
  ];

  const activeOrders = orders.filter(order => 
    ['new', 'preparing', 'ready'].includes(order.status)
  );

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center space-x-3 mb-4">
          <Smartphone className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Waiter Interface</h1>
            <p className="text-muted-foreground">Mobile interface for waiters</p>
          </div>
        </div>

        {/* Status Filter */}
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((option) => (
            <Button
              key={option.value}
              variant={selectedStatus === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedStatus(option.value)}
              data-testid={`status-filter-${option.value || 'all'}`}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Active Orders Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {activeOrders.filter(o => o.status === 'new').length}
            </div>
            <div className="text-sm text-muted-foreground">New Orders</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {activeOrders.filter(o => o.status === 'preparing').length}
            </div>
            <div className="text-sm text-muted-foreground">Preparing</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {activeOrders.filter(o => o.status === 'ready').length}
            </div>
            <div className="text-sm text-muted-foreground">Ready to Serve</div>
          </CardContent>
        </Card>
      </div>

      {/* Orders List */}
      <div className="space-y-4 mb-8">
        <h2 className="text-lg font-semibold text-foreground">Orders</h2>
        {orders.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <ChefHat className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No orders found</p>
            </CardContent>
          </Card>
        ) : (
          orders.map((order) => (
            <Card key={order.id} className="border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    Order #{String(order.orderNumber).padStart(4, '0')}
                  </CardTitle>
                  <Badge className={getOrderStatusColor(order.status)}>
                    {order.status}
                  </Badge>
                </div>
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <span>Table {order.tableId}</span>
                  <span>€{Number(order.total).toFixed(2)}</span>
                  <span>{order.createdAt ? new Date(order.createdAt).toLocaleTimeString() : ''}</span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {order.status === 'new' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateOrderStatusMutation.mutate({ 
                        orderId: order.id, 
                        status: 'preparing' 
                      })}
                      data-testid={`confirm-order-${order.id}`}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Confirm Order
                    </Button>
                  )}
                  {order.status === 'ready' && (
                    <Button
                      size="sm"
                      onClick={() => updateOrderStatusMutation.mutate({ 
                        orderId: order.id, 
                        status: 'served' 
                      })}
                      data-testid={`mark-served-${order.id}`}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Mark as Served
                    </Button>
                  )}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        View Details
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Order #{String(order.orderNumber).padStart(4, '0')}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <p className="font-medium">Table: {order.tableId}</p>
                          <p className="text-sm text-muted-foreground">
                            Total: €{Number(order.total).toFixed(2)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Time: {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
                          </p>
                        </div>
                        {order.notes && (
                          <div>
                            <p className="font-medium">Notes:</p>
                            <p className="text-sm text-muted-foreground">{order.notes}</p>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Tables Status */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Tables Status</h2>
        <div className="grid grid-cols-2 gap-4">
          {tables.map((table) => (
            <Card 
              key={table.id}
              className={`border ${getTableStatusColor(table.status)}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Table {table.number}</h3>
                    <p className="text-sm opacity-80">{table.seats} seats</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className={getTableStatusColor(table.status)}>
                      {table.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {table.status === 'free' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => updateTableStatusMutation.mutate({ 
                        tableId: table.id, 
                        status: 'occupied' 
                      })}
                      data-testid={`occupy-table-${table.id}`}
                    >
                      <Users className="w-4 h-4 mr-1" />
                      Seat Guests
                    </Button>
                  )}
                  {table.status === 'occupied' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => updateTableStatusMutation.mutate({ 
                        tableId: table.id, 
                        status: 'closing' 
                      })}
                      data-testid={`close-table-${table.id}`}
                    >
                      <TableCellsSplit className="w-4 h-4 mr-1" />
                      Close Table
                    </Button>
                  )}
                  {table.status === 'closing' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => updateTableStatusMutation.mutate({ 
                        tableId: table.id, 
                        status: 'free' 
                      })}
                      data-testid={`free-table-${table.id}`}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Clear Table
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}