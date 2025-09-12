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
import { apiRequest } from '@/lib/queryClient';
import { Plus, Minus, Send, CreditCard, StickyNote, Split, X, Coffee, Utensils, Wine, Dessert, ChefHat, Fish, Pizza, Salad, Soup, Beef, Package, ShoppingCart, Printer, Settings } from 'lucide-react';
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

  // Fetch data with auto-refresh
  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ['/api/menu/categories'],
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch available printers
  const { data: availablePrinters = [] } = useQuery({
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

  // Payment mutation
  const paymentMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      const response = await apiRequest('POST', '/api/payments/process', paymentData);
      return response.json();
    },
    onSuccess: () => {
      // Capture receipt data before clearing UI state
      const receiptData = {
        items: orderItems,
        notes: orderNotes,
        subtotal: calculateSubtotal(),
        tax: calculateTax(),
        total: calculateTotal()
      };
      
      // Clear UI state after capturing receipt data
      setOrderItems([]);
      setOrderNotes('');
      setShowPaymentDialog(false);
      
      toast({
        title: "Payment processed",
        description: "Order completed and receipt printed successfully.",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/daily-sales'] });
      
      // Print receipt with captured data to avoid using cleared state
      setTimeout(() => {
        printReceipt(receiptData);
      }, 100);
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
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        notes: item.notes,
      })),
      total: calculateTotal().toString(),
      notes: orderNotes,
      receiptMethod: 'print',
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
      <div className="flex h-screen bg-background">
      {/* Left Panel - Menu */}
      <div className="w-3/4 bg-card border-r border-border">
        {/* Daily Sales Summary */}
        <div className="border-b border-border bg-blue-50 px-4 py-2">
          <div className="flex items-center justify-between w-full">
            {/* Logo Section */}
            <div className="flex items-center space-x-3">
              <Logo variant="pos" data-testid="pos-logo" />
              
              {/* Discrete Printer Configuration Button */}
              <Dialog open={showPrinterDialog} onOpenChange={setShowPrinterDialog}>
                <DialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="p-2 h-8 w-8 text-blue-600 hover:bg-blue-100" 
                    data-testid="printer-config-button"
                    title="Configurazione Stampante"
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]" data-testid="printer-config-dialog">
                  <DialogHeader>
                    <DialogTitle className="flex items-center space-x-2">
                      <Printer className="h-5 w-5" />
                      <span>Configurazione Stampante</span>
                    </DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      Seleziona la stampante da utilizzare per questo terminale POS.
                    </div>
                    
                    {/* Current Configuration */}
                    {printerConfig && printerConfig.length > 0 && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="text-sm font-medium text-green-800">Configurazione Attuale</div>
                        <div className="text-sm text-green-700 mt-1">
                          {printerConfig.find(p => p.isDefault)?.printerDescription || printerConfig[0]?.printerDescription || 'Stampante configurata'}
                        </div>
                      </div>
                    )}
                    
                    {/* Terminal ID Info */}
                    <div className="text-xs text-muted-foreground bg-gray-50 p-2 rounded">
                      ID Terminale: {terminalId}
                    </div>
                    
                    {/* Printer Selection */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium">Seleziona Stampante:</label>
                      
                      {/* Windows Default Option */}
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="windows_default"
                          name="printer"
                          value="windows_default"
                          checked={selectedPrinter === 'windows_default'}
                          onChange={(e) => setSelectedPrinter(e.target.value)}
                          className="h-4 w-4"
                          data-testid="printer-option-windows-default"
                        />
                        <label htmlFor="windows_default" className="text-sm">
                          <span className="font-medium">Stampante Predefinita Windows</span>
                          <div className="text-xs text-muted-foreground">Utilizza la stampante predefinita del sistema</div>
                        </label>
                      </div>
                      
                      {/* Available Printers */}
                      {availablePrinters.map((printer: any) => (
                        <div key={printer.name} className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id={printer.name}
                            name="printer"
                            value={printer.name}
                            checked={selectedPrinter === printer.name}
                            onChange={(e) => setSelectedPrinter(e.target.value)}
                            className="h-4 w-4"
                            data-testid={`printer-option-${printer.name}`}
                          />
                          <label htmlFor={printer.name} className="text-sm">
                            <div className="font-medium">{printer.description}</div>
                            <div className="text-xs text-muted-foreground">
                              {printer.connectionType === 'network' && printer.ipAddress && `IP: ${printer.ipAddress}`}
                              {printer.connectionType === 'usb' && printer.port && `Porta: ${printer.port}`}
                              {printer.connectionType === 'bluetooth' && printer.macAddress && `MAC: ${printer.macAddress}`}
                              <span className={`ml-2 inline-block w-2 h-2 rounded-full ${
                                printer.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                              }`}></span>
                              <span className="ml-1">{printer.status === 'online' ? 'Online' : 'Offline'}</span>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-2 pt-4">
                      <Button 
                        variant="outline" 
                        onClick={() => setShowPrinterDialog(false)}
                        data-testid="printer-cancel-button"
                      >
                        Annulla
                      </Button>
                      <Button 
                        onClick={() => {
                          const printerData: InsertPrinterTerminal = {
                            terminalId,
                            printerName: selectedPrinter,
                            printerDescription: selectedPrinter === 'windows_default' 
                              ? 'Stampante Predefinita Windows'
                              : availablePrinters.find((p: any) => p.name === selectedPrinter)?.description || selectedPrinter,
                            isDefault: true,
                            connectionType: selectedPrinter === 'windows_default' ? 'local' : (
                              availablePrinters.find((p: any) => p.name === selectedPrinter)?.connectionType || 'local'
                            ) as 'local' | 'network' | 'bluetooth',
                            isActive: true,
                          };
                          savePrinterMutation.mutate(printerData);
                        }}
                        disabled={savePrinterMutation.isPending}
                        data-testid="printer-save-button"
                      >
                        {savePrinterMutation.isPending ? 'Salvataggio...' : 'Salva Configurazione'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
            {/* Title Section */}
            <h3 className="text-sm font-medium text-blue-900">Vendite di Oggi</h3>
            
            {/* Stats Section */}
            <div className="flex items-center space-x-6 text-sm">
              <div className="flex items-center space-x-2">
                <span className="text-blue-700">Ordini:</span>
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  {dailySales.orderCount}
                </Badge>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-blue-700">Totale:</span>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  €{dailySales.total ? Number(dailySales.total).toFixed(2) : '0.00'}
                </Badge>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-blue-700">Media:</span>
                <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                  €{dailySales.avgOrderValue ? Number(dailySales.avgOrderValue).toFixed(2) : '0.00'}
                </Badge>
              </div>
            </div>
          </div>
        </div>
        
        {/* Category Tabs */}
        <div className="border-b border-border bg-muted/30">
          <div className="flex gap-1 p-2 overflow-x-auto">
            {categories.map((category) => {
              const IconComponent = getCategoryIcon(category.name);
              return (
                <Button
                  key={category.id}
                  variant={selectedCategory === category.id ? 'default' : 'ghost'}
                  size="lg"
                  onClick={() => setSelectedCategory(category.id)}
                  data-testid={`category-tab-${category.id}`}
                  className="flex flex-col items-center space-y-1 px-3 py-2 h-14 min-w-18 text-center"
                >
                  <IconComponent className="w-6 h-6" />
                  <span className="text-xs font-medium">{category.name}</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Menu Items Grid */}
            <div className="p-4 grid grid-cols-3 gap-4">
          {menuItems.map((item, index) => {
            const isOutOfStock = item.trackInventory && (item.currentStock || 0) <= 0;
            const isLowStock = item.trackInventory && (item.currentStock || 0) > 0 && (item.currentStock || 0) <= (item.minStock || 0);
            const hasStock = item.trackInventory && (item.currentStock || 0) > (item.minStock || 0);
            
            return (
                  <Card 
                    className={`
                      transition-all relative h-32 cursor-pointer border-2
                      ${isOutOfStock 
                        ? 'opacity-50 cursor-not-allowed bg-gray-50' 
                        : 'hover:shadow-lg hover:border-primary/50'
                      }
                    `}
                    onClick={() => !isOutOfStock && addItemToOrder(item)}
                    data-testid={`menu-item-${item.id}`}
                  >
                <CardContent className="p-3 h-full">
                  <div className="text-left h-full flex flex-col justify-between">
                    {/* Stock indicator badge */}
                    {item.trackInventory && (
                      <div className="absolute top-2 right-2">
                        <Badge 
                          className={`text-xs ${
                            isOutOfStock ? 'bg-red-100 text-red-800' :
                            isLowStock ? 'bg-orange-100 text-orange-800' :
                            'bg-green-100 text-green-800'
                          }`}
                        >
                          {isOutOfStock ? 'Esaurito' : 
                           isLowStock ? 'Scorte basse' : 
                           'Disponibile'}
                        </Badge>
                      </div>
                    )}
                    
                    <div className="flex-1">
                      <h3 className={`font-semibold text-sm leading-tight ${isOutOfStock ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {item.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-tight">{item.description}</p>
                      
                      {/* Stock info */}
                      {item.trackInventory && (
                        <div className="flex items-center space-x-1 mt-1 text-xs text-muted-foreground">
                          <span>Stock: {item.currentStock || 0}</span>
                          {(item.minStock || 0) > 0 && (
                            <span>| Min: {item.minStock}</span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center mt-2 pt-1">
                      <span className={`text-lg font-bold ${isOutOfStock ? 'text-muted-foreground' : 'text-primary'}`}>
                        €{Number(item.price).toFixed(2)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {(item.prepTimeMinutes || 0) > 0 ? `${item.prepTimeMinutes || 0} min` : 'Ready'}
                      </span>
                    </div>
                    
                    {isOutOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-10 rounded">
                        <span className="text-lg font-bold text-red-600">Non Disponibile</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
            </div>
      </div>

      {/* Right Panel - Order */}
      <div className="w-1/4 bg-card flex flex-col">
        {/* Current Order Header */}
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Current Order</h2>
          </div>
        </div>

        {/* Order Items */}
        <div className="flex-1 p-4">
              <div className="space-y-3 min-h-32 p-3 rounded-lg border border-border">
            {orderItems.map((item, index) => (
                  <Card 
                    key={item.tempId} 
                    className="bg-accent/50 border border-border" 
                    data-testid={`order-item-${item.tempId}`}
                  >
                <CardContent className="p-3">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-sm">{item.menuItem.name}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.tempId)}
                      className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                      data-testid={`remove-item-${item.tempId}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateItemQuantity(item.tempId, -1)}
                        className="h-6 w-6 p-0"
                        data-testid={`decrease-quantity-${item.tempId}`}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold" data-testid={`quantity-${item.tempId}`}>
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateItemQuantity(item.tempId, 1)}
                        className="h-6 w-6 p-0"
                        data-testid={`increase-quantity-${item.tempId}`}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="font-bold text-primary text-sm" data-testid={`item-total-${item.tempId}`}>
                      €{Number(item.totalPrice).toFixed(2)}
                    </span>
                  </div>
                  {item.notes && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      <Badge variant="secondary">{item.notes}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {orderItems.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Clicca sui prodotti per aggiungere all'ordine</p>
              </div>
            )}
              </div>
        </div>

        {/* Order Summary & Actions */}
        <div className="border-t border-border p-4 space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span>Subtotal:</span>
            <span data-testid="subtotal">€{calculateSubtotal().toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span>Tax (22%):</span>
            <span data-testid="tax">€{calculateTax().toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center font-semibold text-lg pt-2 border-t border-border">
            <span>Total:</span>
            <span className="text-primary" data-testid="total">€{calculateTotal().toFixed(2)}</span>
          </div>
          
          <div className="flex space-x-2 mt-4">
            <Button
              className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90"
              onClick={sendToKitchen}
              disabled={createOrderMutation.isPending || orderItems.length === 0}
              data-testid="send-to-kitchen"
            >
              <Send className="w-4 h-4 mr-1" />
              Send to Kitchen
            </Button>
            <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
              <DialogTrigger asChild>
                <Button
                  className="flex-1 bg-success text-white hover:bg-success/90"
                  disabled={orderItems.length === 0}
                  data-testid="payment"
                >
                  <CreditCard className="w-4 h-4 mr-1" />
                  Payment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Process Payment</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Total Amount:</span>
                      <span className="text-xl font-bold text-primary">€{calculateTotal().toFixed(2)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mb-3">
                      Items: {orderItems.length}
                    </div>
                    
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-center p-4 bg-blue-50 rounded-lg">
                      <Printer className="w-8 h-8 mr-3 text-blue-600" />
                      <div>
                        <h4 className="font-medium text-blue-900">Print Receipt</h4>
                        <p className="text-sm text-blue-700">Receipt will be printed automatically</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex space-x-2 pt-4">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => setShowPaymentDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      className="flex-1 bg-success text-white hover:bg-success/90"
                      onClick={processPayment}
                      disabled={paymentMutation.isPending}
                      data-testid="confirm-payment"
                    >
                      {paymentMutation.isPending ? 'Processing...' : 'Process Payment & Print'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="flex space-x-2">
            <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex-1" data-testid="add-note">
                  <StickyNote className="w-4 h-4 mr-1" />
                  Add Note
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Order Notes</DialogTitle>
                </DialogHeader>
                <div className="mt-4">
                  <Textarea
                    placeholder="Enter order notes..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    data-testid="order-notes-input"
                  />
                  <div className="flex justify-end mt-4">
                    <Button onClick={() => setShowNotesDialog(false)} data-testid="save-notes">
                      Save Notes
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" className="flex-1" data-testid="split-bill">
              <Split className="w-4 h-4 mr-1" />
              Split Bill
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
