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
    <div>POS Interface - Testing JSX</div>
  );
}
