import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Logo } from '@/components/ui/logo';
import { useToast } from '@/hooks/use-toast';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { useAutoPrint } from '@/hooks/useAutoPrint';
import { apiRequest } from '@/lib/queryClient';
import { Plus, Minus, Send, CreditCard, StickyNote, Split, X, Coffee, Utensils, Wine, Dessert, ChefHat, Fish, Pizza, Salad, Soup, Beef, Package, ShoppingCart, Printer, Settings, PrinterCheck, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import type { MenuItem, MenuCategory, OrderLine, InsertOrderLine, PrinterTerminal, InsertPrinterTerminal } from '@shared/schema';

interface OrderItem extends InsertOrderLine {
  tempId: string;
  menuItem: MenuItem;
}

export function PosInterface() {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [receiptMethod, setReceiptMethod] = useState<'print'>('print');
  const [showPrinterDialog, setShowPrinterDialog] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('windows_default');
  
  // Generate unique terminal ID
  const getTerminalId = () => {
    let terminalId = localStorage.getItem('pos_terminal_id');
    if (!terminalId) {
      // Generate ID based on browser fingerprint and timestamp
      const fingerprint = `${navigator.userAgent.slice(0, 20)}-${Date.now()}`;
      terminalId = btoa(fingerprint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
      localStorage.setItem('pos_terminal_id', terminalId);
    }
    return terminalId;
  };
  
  const terminalId = getTerminalId();
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lastMessage } = useWebSocketContext();
  
  // Auto-print integration
  const autoPrint = useAutoPrint({
    showToastNotifications: true,
    autoRetryOnError: true,
    retryDelay: 3000,
  });

  // Fetch data with auto-refresh
  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ['/api/menu/categories'],
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch available printers
  const { data: availablePrinters = [] } = useQuery<any[]>({
    queryKey: ['/api/printers/available'],
    enabled: showPrinterDialog,
  });

  // Fetch current printer configuration for this terminal
  const { data: printerConfig } = useQuery<PrinterTerminal[]>({
    queryKey: ['/api/printers/terminals', terminalId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/printers/terminals?posTerminalId=${terminalId}`);
      return response.json();
    },
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['/api/menu/items', selectedCategory],
    queryFn: async () => {
      const response = await apiRequest('GET', selectedCategory ? `/api/menu/items?categoryId=${selectedCategory}` : '/api/menu/items');
      return response.json();
    },
    refetchInterval: 15000, // Refresh every 15 seconds for products
  });


  // Daily sales data
  const { data: dailySales = { total: 0, orderCount: 0, avgOrderValue: 0 } } = useQuery({
    queryKey: ['/api/analytics/daily-sales', new Date().toISOString().split('T')[0]],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/analytics/daily-sales?date=${new Date().toISOString().split('T')[0]}`);
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Mutations
  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const response = await apiRequest('POST', '/api/orders', orderData);
      return response.json();
    },
    onSuccess: () => {
      setOrderItems([]);
      setOrderNotes('');
      toast({
        title: "Order sent to kitchen",
        description: "The order has been successfully sent to the kitchen.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/daily-sales'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send order to kitchen.",
        variant: "destructive",
      });
    },
  });

  // Printer configuration mutation
  const savePrinterMutation = useMutation({
    mutationFn: async (printerData: InsertPrinterTerminal) => {
      const response = await apiRequest('POST', '/api/printers/terminals', printerData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configurazione stampante salvata",
        description: "La configurazione della stampante è stata aggiornata con successo.",
      });
      setShowPrinterDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/printers/terminals', terminalId] });
    },
    onError: (error) => {
      toast({
        title: "Errore",
        description: "Impossibile salvare la configurazione della stampante.",
        variant: "destructive",
      });
    },
  });

  // Payment mutation with auto-print integration
  const paymentMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      const response = await apiRequest('POST', '/api/payments/process', paymentData);
      return response.json();
    },
    onSuccess: async (paymentResponse) => {
      // Capture order data before clearing UI state
      const orderData = {
        items: orderItems,
        notes: orderNotes,
        subtotal: calculateSubtotal(),
        tax: calculateTax(),
        total: calculateTotal()
      };
      
      // Clear UI state after capturing data
      setOrderItems([]);
      setOrderNotes('');
      setShowPaymentDialog(false);
      
      toast({
        title: "Payment processed",
        description: "Processing automatic printing...",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/daily-sales'] });
      
      // Trigger auto-print if payment response contains receipt URLs
      if (autoPrint.isEnabled && (paymentResponse.receiptUrls || paymentResponse.departmentReceiptUrls)) {
        try {
          await autoPrint.actions.processPaymentPrint(
            terminalId,
            paymentResponse,
            orderData
          );
        } catch (error) {
          console.error('Auto-print failed:', error);
          // Fallback to manual printing if auto-print fails completely
          setTimeout(() => {
            printReceipt(orderData);
          }, 100);
        }
      } else if (!autoPrint.isEnabled) {
        // Manual printing when auto-print is disabled
        setTimeout(() => {
          printReceipt(orderData);
        }, 100);
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to process payment.",
        variant: "destructive",
      });
    },
  });

  // Set default category and printer selection
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  // Set current printer selection from saved config
  useEffect(() => {
    if (printerConfig && printerConfig.length > 0) {
      const defaultPrinter = printerConfig.find(p => p.isDefault) || printerConfig[0];
      setSelectedPrinter(defaultPrinter.printerName);
    }
  }, [printerConfig]);

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'order-status-updated':
          queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
          break;
      }
    }
  }, [lastMessage, queryClient]);

  const addItemToOrder = (menuItem: MenuItem) => {
    const existingItem = orderItems.find(item => 
      item.menuItemId === menuItem.id && !item.notes
    );

    if (existingItem) {
      setOrderItems(items => 
        items.map(item => 
          item.tempId === existingItem.tempId
            ? { ...item, quantity: (item.quantity || 1) + 1, totalPrice: (((item.quantity || 1) + 1) * Number(menuItem.price)).toString() }
            : item
        )
      );
    } else {
      const newItem: OrderItem = {
        tempId: Date.now().toString(),
        menuItemId: menuItem.id,
        quantity: 1,
        unitPrice: menuItem.price,
        totalPrice: menuItem.price,
        status: 'new',
        notes: '',
        modifiers: '',
        menuItem,
      };
      setOrderItems(items => [...items, newItem]);
    }
  };

  const updateItemQuantity = (tempId: string, change: number) => {
    setOrderItems(items => 
      items.map(item => {
        if (item.tempId === tempId) {
          const newQuantity = Math.max(0, (item.quantity || 1) + change);
          if (newQuantity === 0) {
            return null;
          }
          return {
            ...item,
            quantity: newQuantity,
            totalPrice: (newQuantity * Number(item.unitPrice)).toString()
          };
        }
        return item;
      }).filter(Boolean) as OrderItem[]
    );
  };

  const removeItem = (tempId: string) => {
    setOrderItems(items => items.filter(item => item.tempId !== tempId));
  };

  // Get category icon
  const getCategoryIcon = (categoryName: string) => {
    const name = categoryName.toLowerCase();
    if (name.includes('drink') || name.includes('beverage') || name.includes('coffee') || name.includes('caffè')) return Coffee;
    if (name.includes('main') || name.includes('principal') || name.includes('primi') || name.includes('secondi')) return Utensils;
    if (name.includes('wine') || name.includes('vino') || name.includes('alcohol')) return Wine;
    if (name.includes('dessert') || name.includes('dolci') || name.includes('sweet')) return Dessert;
    if (name.includes('appetizer') || name.includes('antipasti') || name.includes('starter')) return ChefHat;
    if (name.includes('fish') || name.includes('pesce') || name.includes('seafood')) return Fish;
    if (name.includes('pizza')) return Pizza;
    if (name.includes('salad') || name.includes('insalata')) return Salad;
    if (name.includes('soup') || name.includes('zuppa')) return Soup;
    if (name.includes('meat') || name.includes('carne') || name.includes('beef')) return Beef;
    if (name.includes('pasta')) return Package;
    return Utensils;
  };


  const calculateSubtotal = () => {
    return orderItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
  };

  const calculateTax = () => {
    const subtotal = calculateSubtotal();
    return subtotal * 0.22; // 22% tax
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  const processPayment = () => {
    const paymentData = {
      orderItems: orderItems.map(item => ({
        menuItemId: item.menuItemId,
        quantity: Number(item.quantity || 1), // Ensure it's a number
        unitPrice: String(item.unitPrice), // Ensure it's a string
        totalPrice: String(item.totalPrice), // Ensure it's a string
        notes: item.notes || '', // Ensure it's not undefined
      })),
      total: calculateTotal().toString(),
      notes: orderNotes || '', // Ensure it's not undefined
      receiptMethod: 'print' as const,
    };

    paymentMutation.mutate(paymentData);
  };

  const printReceipt = (receiptData?: any) => {
    // Use passed receipt data or fallback to current state (for backward compatibility)
    const data = receiptData || {
      items: orderItems,
      notes: orderNotes,
      subtotal: calculateSubtotal(),
      tax: calculateTax(),
      total: calculateTotal()
    };
    
    // Create printable receipt content
    const receiptContent = `
      <div style="font-family: monospace; width: 300px; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2>Restaurant Receipt</h2>
          <p>Date: ${new Date().toLocaleDateString()}</p>
          <p>Time: ${new Date().toLocaleTimeString()}</p>
        </div>
        <hr>
        <div style="margin: 20px 0;">
          ${data.items?.map((item: any) => `
            <div style="display: flex; justify-content: space-between; margin: 5px 0;">
              <span>${item.menuItem.name} x${item.quantity}</span>
              <span>€${Number(item.totalPrice).toFixed(2)}</span>
            </div>
          `).join('') || '<p>No items</p>'}
        </div>
        <hr>
        <div style="margin: 10px 0;">
          <div style="display: flex; justify-content: space-between;">
            <span>Subtotal:</span>
            <span>€${data.subtotal?.toFixed(2) || '0.00'}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Tax (22%):</span>
            <span>€${data.tax?.toFixed(2) || '0.00'}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.2em;">
            <span>Total:</span>
            <span>€${data.total?.toFixed(2) || '0.00'}</span>
          </div>
        </div>
        ${data.notes ? `<p style="margin-top: 20px;">Notes: ${data.notes}</p>` : ''}
        <div style="text-align: center; margin-top: 20px;">
          <p>Thank you for your visit!</p>
        </div>
      </div>
    `;

    // Open print window
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Receipt</title>
            <style>
              @media print {
                body { margin: 0; }
                @page { size: 80mm auto; margin: 0; }
              }
            </style>
          </head>
          <body>
            ${receiptContent}
            <script>
              window.onload = function() {
                window.print();
                window.close();
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const sendToKitchen = () => {
    if (orderItems.length === 0) {
      toast({
        title: "Empty order",
        description: "Please add items to the order before sending.",
        variant: "destructive",
      });
      return;
    }

    const subtotal = calculateSubtotal();
    const tax = calculateTax();
    const total = calculateTotal();

    createOrderMutation.mutate({
      status: 'new',
      subtotal: subtotal.toString(),
      tax: tax.toString(),
      total: total.toString(),
      notes: orderNotes,
      orderLines: orderItems.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        notes: item.notes,
        modifiers: item.modifiers,
      })),
    });
  };

  const getTableStatusColor = (status: string) => {
    switch (status) {
      case 'free': return 'bg-green-100 text-green-800 border-green-200';
      case 'occupied': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'closing': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Sidebar with Menu Categories */}
      <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Logo />
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">POS Terminal</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">ID: {terminalId}</p>
            </div>
          </div>
          
          {/* Auto-print status indicator */}
          <div className="flex items-center space-x-2">
            {autoPrint.isEnabled ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" data-testid="status-auto-print-enabled" />
            ) : (
              <AlertCircle className="w-4 h-4 text-yellow-500" data-testid="status-auto-print-disabled" />
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowPrinterDialog(true)}
              data-testid="button-printer-settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Daily Sales */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Sales Today</h2>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300">Total Sales:</span>
              <span className="font-medium text-gray-900 dark:text-white" data-testid="text-daily-sales">€{dailySales.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300">Orders:</span>
              <span className="font-medium text-gray-900 dark:text-white" data-testid="text-order-count">{dailySales.orderCount}</span>
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Categories</h2>
            <div className="space-y-2">
              {categories.map(category => {
                const IconComponent = getCategoryIcon(category.name);
                return (
                  <Button
                    key={category.id}
                    variant={selectedCategory === category.id ? "default" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => setSelectedCategory(category.id)}
                    data-testid={`button-category-${category.id}`}
                  >
                    <IconComponent className="w-4 h-4 mr-2" />
                    {category.name}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Menu Items Grid */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {menuItems.map(item => (
              <Card
                key={item.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => addItemToOrder(item)}
                data-testid={`card-menu-item-${item.id}`}
              >
                <CardContent className="p-4">
                  <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-md mb-3 flex items-center justify-center">
                    <Package className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-white mb-1" data-testid={`text-item-name-${item.id}`}>
                    {item.name}
                  </h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mb-2 line-clamp-2">
                    {item.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-gray-900 dark:text-white" data-testid={`text-item-price-${item.id}`}>
                      €{Number(item.price).toFixed(2)}
                    </span>
                    <Badge variant={item.isAvailable ? "default" : "secondary"}>
                      {item.isAvailable ? "Available" : "Out of Stock"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Order Summary Footer */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="grid grid-cols-3 gap-6">
            {/* Order Items */}
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Current Order</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNotesDialog(true)}
                  data-testid="button-add-notes"
                >
                  <StickyNote className="w-4 h-4 mr-2" />
                  Notes
                </Button>
              </div>
              
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {orderItems.map(item => (
                  <div key={item.tempId} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-3 rounded-lg" data-testid={`order-item-${item.tempId}`}>
                    <div className="flex-1">
                      <h4 className="font-medium text-sm text-gray-900 dark:text-white" data-testid={`text-order-item-name-${item.tempId}`}>
                        {item.menuItem.name}
                      </h4>
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        €{Number(item.unitPrice).toFixed(2)} each
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateItemQuantity(item.tempId, -1)}
                        data-testid={`button-decrease-${item.tempId}`}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-8 text-center font-medium text-gray-900 dark:text-white" data-testid={`text-quantity-${item.tempId}`}>
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateItemQuantity(item.tempId, 1)}
                        data-testid={`button-increase-${item.tempId}`}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.tempId)}
                        data-testid={`button-remove-${item.tempId}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="text-right ml-4">
                      <span className="font-semibold text-gray-900 dark:text-white" data-testid={`text-item-total-${item.tempId}`}>
                        €{Number(item.totalPrice).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Total & Actions */}
            <div>
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mb-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">Subtotal:</span>
                    <span className="text-gray-900 dark:text-white" data-testid="text-subtotal">€{calculateSubtotal().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">Tax (22%):</span>
                    <span className="text-gray-900 dark:text-white" data-testid="text-tax">€{calculateTax().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span className="text-gray-900 dark:text-white">Total:</span>
                    <span className="text-gray-900 dark:text-white" data-testid="text-total">€{calculateTotal().toFixed(2)}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Button
                  onClick={sendToKitchen}
                  disabled={orderItems.length === 0 || createOrderMutation.isPending}
                  className="w-full"
                  variant="outline"
                  data-testid="button-send-kitchen"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send to Kitchen
                </Button>
                <Button
                  onClick={() => setShowPaymentDialog(true)}
                  disabled={orderItems.length === 0}
                  className="w-full"
                  data-testid="button-payment"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Process Payment
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notes Dialog */}
      <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
        <DialogContent data-testid="dialog-notes">
          <DialogHeader>
            <DialogTitle>Order Notes</DialogTitle>
          </DialogHeader>
          <Textarea
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="Add special instructions or notes..."
            className="min-h-[100px]"
            data-testid="input-order-notes"
          />
          <Button onClick={() => setShowNotesDialog(false)} data-testid="button-save-notes">
            Save Notes
          </Button>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md" data-testid="dialog-payment">
          <DialogHeader>
            <DialogTitle>Process Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div className="flex justify-between text-lg font-bold">
                <span>Total Amount:</span>
                <span data-testid="text-payment-total">€{calculateTotal().toFixed(2)}</span>
              </div>
            </div>
            <Button
              onClick={processPayment}
              disabled={paymentMutation.isPending}
              className="w-full"
              data-testid="button-confirm-payment"
            >
              {paymentMutation.isPending ? (
                <>
                  <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Confirm Payment
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Printer Settings Dialog */}
      <Dialog open={showPrinterDialog} onOpenChange={setShowPrinterDialog}>
        <DialogContent className="max-w-2xl" data-testid="dialog-printer-settings">
          <DialogHeader>
            <DialogTitle>Configurazione Stampanti</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Auto-print Status */}
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-white mb-3 block">
                Stato Stampa Automatica
              </label>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-2">
                  {autoPrint.isEnabled ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                  )}
                  <span className="text-sm" data-testid="text-auto-print-status">
                    {autoPrint.isEnabled ? 'Stampa automatica attiva' : 'Stampa automatica disattivata'}
                  </span>
                </div>
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    variant={autoPrint.isEnabled ? "secondary" : "default"}
                    onClick={autoPrint.enableAutoPrint}
                    data-testid="button-enable-auto-print"
                  >
                    Attiva
                  </Button>
                  <Button
                    size="sm"
                    variant={!autoPrint.isEnabled ? "secondary" : "default"}
                    onClick={autoPrint.disableAutoPrint}
                    data-testid="button-disable-auto-print"
                  >
                    Disattiva
                  </Button>
                </div>
              </div>
            </div>

            {/* Available Printers */}
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-white mb-3 block">
                Stampanti Disponibili
              </label>
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg">
                {(!availablePrinters || availablePrinters.length === 0) ? (
                  <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                    <Printer className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Nessuna stampante rilevata</p>
                    <p className="text-xs mt-1">Verifica che le stampanti siano accese e connesse alla rete</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-600">
                    {availablePrinters.map((printer: any, index: number) => (
                      <div key={printer.name || index} className="p-3 flex items-center justify-between" data-testid={`printer-option-${printer.name}`}>
                        <div className="flex items-center space-x-3">
                          <Printer className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          <div>
                            <div className="font-medium text-sm text-gray-900 dark:text-white">
                              {printer.displayName || printer.name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {printer.name} - {printer.status || 'Online'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            size="sm"
                            variant={selectedPrinter === printer.name ? "default" : "outline"}
                            onClick={() => {
                              setSelectedPrinter(printer.name);
                              savePrinterMutation.mutate({
                                terminalId: terminalId,
                                printerName: printer.name,
                                isDefault: true,
                                isActive: true
                              });
                            }}
                            data-testid={`button-select-printer-${printer.name}`}
                          >
                            {selectedPrinter === printer.name ? 'Selezionata' : 'Seleziona'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Current Configuration */}
            {printerConfig && printerConfig.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-900 dark:text-white mb-3 block">
                  Configurazione Attuale
                </label>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  {printerConfig.map((config, index) => (
                    <div key={config.id || index} className="flex items-center justify-between" data-testid={`printer-config-${config.id}`}>
                      <div className="flex items-center space-x-2">
                        <PrinterCheck className="w-4 h-4 text-blue-600" />
                        <div>
                          <div className="font-medium text-sm text-gray-900 dark:text-white">
                            {config.printerName}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {config.isDefault && '(Predefinita)'}
                          </div>
                        </div>
                      </div>
                      <Badge variant={config.isActive ? "default" : "secondary"}>
                        {config.isActive ? 'Attiva' : 'Disattiva'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Print Queue Status */}
            {autoPrint.state.printJobs.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-900 dark:text-white mb-3 block">
                  Coda di Stampa
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {autoPrint.state.printJobs.map((job, index) => (
                    <div key={job.id || index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded text-sm" data-testid={`print-job-${job.id}`}>
                      <span>{job.type === 'customer_receipt' ? 'Scontrino Cliente' : `Cucina ${job.departmentCode}`}</span>
                      <Badge variant={
                        job.status === 'success' ? 'default' :
                        job.status === 'failed' ? 'destructive' :
                        job.status === 'printing' ? 'secondary' : 'outline'
                      }>
                        {job.status === 'success' ? 'Completato' : 
                         job.status === 'failed' ? 'Fallito' :
                         job.status === 'printing' ? 'Stampa...' : job.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setShowPrinterDialog(false)}
                data-testid="button-close-printer-settings"
              >
                Chiudi
              </Button>
              <div className="flex space-x-2">
                {autoPrint.state.canRetry && (
                  <Button
                    variant="outline"
                    onClick={() => autoPrint.actions.retryFailedJobs()}
                    data-testid="button-retry-failed-prints"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Riprova Fallite
                  </Button>
                )}
                <Button
                  onClick={() => printReceipt()}
                  variant="secondary"
                  data-testid="button-test-print"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Test Stampa
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
