import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Clock, CheckCircle2, Package, RefreshCw } from "lucide-react";
import type { OrderWithDetails } from "@shared/schema";

export function DeliveryInterface() {
  const { toast } = useToast();
  const [completingOrders, setCompletingOrders] = useState<Set<string>>(new Set());

  // Query to fetch ready orders
  const { data: readyOrders = [], isLoading, refetch } = useQuery<OrderWithDetails[]>({
    queryKey: ["/api/orders", "ready"],
    queryFn: () => fetch("/api/orders?status=ready").then((res) => res.json()),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  // Mutation to mark order as delivered/served
  const confirmDeliveryMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest('PATCH', `/api/orders/${orderId}/status`, {
        status: 'served'
      });
      return response.json();
    },
    onSuccess: (_, orderId) => {
      setCompletingOrders(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      
      toast({
        title: "Consegna confermata",
        description: "L'ordine è stato marcato come consegnato.",
      });
      
      // Refresh the orders list
      queryClient.invalidateQueries({ queryKey: ["/api/orders", "ready"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (_, orderId) => {
      setCompletingOrders(prev => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
      
      toast({
        title: "Errore",
        description: "Impossibile confermare la consegna. Riprova.",
        variant: "destructive",
      });
    },
  });

  const handleConfirmDelivery = async (orderId: string) => {
    setCompletingOrders(prev => new Set(prev).add(orderId));
    confirmDeliveryMutation.mutate(orderId);
  };

  const formatTime = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPrice = (price: string | number) => {
    return `€${Number(price).toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600 dark:text-gray-400">Caricamento ordini pronti...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-lg mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg">
                <Package className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  Consegna Ordini
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {readyOrders.length} ordini pronti
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              data-testid="refresh-orders"
              className="shrink-0"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="max-w-lg mx-auto p-4 space-y-4">
        {readyOrders.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Nessun ordine pronto
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Tutti gli ordini sono stati consegnati!
              </p>
            </CardContent>
          </Card>
        ) : (
          readyOrders.map((order) => {
            const isCompleting = completingOrders.has(order.id);
            
            return (
              <Card key={order.id} className="overflow-hidden" data-testid={`order-card-${order.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-lg">
                        <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                          #{order.orderNumber}
                        </span>
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          Ordine #{order.orderNumber}
                        </CardTitle>
                        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                          <Clock className="h-4 w-4" />
                          <span>{order.createdAt ? formatTime(order.createdAt) : 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      PRONTO
                    </Badge>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-0">
                  {/* Order Items */}
                  <div className="space-y-2 mb-4">
                    {order.orderLines.map((line, index) => (
                      <div key={line.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-sm font-medium text-gray-900 dark:text-white min-w-[2rem] text-center bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">
                            {line.quantity}x
                          </span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {line.menuItem.name}
                            </p>
                            {line.notes && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                                {line.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {formatPrice(line.totalPrice)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <Separator className="my-4" />

                  {/* Order Total and Notes */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-semibold text-gray-900 dark:text-white">
                        Totale:
                      </span>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatPrice(order.total)}
                      </span>
                    </div>
                    
                    {order.notes && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                          <strong>Note:</strong> {order.notes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Confirm Delivery Button */}
                  <Button
                    onClick={() => handleConfirmDelivery(order.id)}
                    disabled={isCompleting}
                    className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 text-base"
                    data-testid={`confirm-delivery-${order.id}`}
                  >
                    {isCompleting ? (
                      <>
                        <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                        Confermando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-5 w-5 mr-2" />
                        Conferma Consegna
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}