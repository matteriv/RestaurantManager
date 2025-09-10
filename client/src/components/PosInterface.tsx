import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { apiRequest } from '@/lib/queryClient';
import { Plus, Minus, Send, CreditCard, StickyNote, Split, X, TableCellsSplit, Coffee, Utensils, Wine, Dessert, ChefHat, Fish, Pizza, Salad, Soup, Beef, Package, GripVertical, ShoppingCart } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import type { MenuItem, MenuCategory, Table, OrderLine, InsertOrderLine } from '@shared/schema';

interface OrderItem extends InsertOrderLine {
  tempId: string;
  menuItem: MenuItem;
}

export function PosInterface() {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lastMessage } = useWebSocketContext();

  // Fetch data with auto-refresh
  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ['/api/menu/categories'],
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['/api/menu/items', selectedCategory],
    queryFn: async () => {
      const response = await apiRequest('GET', selectedCategory ? `/api/menu/items?categoryId=${selectedCategory}` : '/api/menu/items');
      return response.json();
    },
    refetchInterval: 15000, // Refresh every 15 seconds for products
  });

  const { data: tables = [] } = useQuery<Table[]>({
    queryKey: ['/api/tables'],
    refetchInterval: 10000, // Refresh every 10 seconds for table status
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
      setSelectedTable(null);
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

  // Set default category
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'table-status-updated':
          queryClient.invalidateQueries({ queryKey: ['/api/tables'] });
          break;
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
        orderId: '', // Will be set when order is created
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

  // Handle drag end for adding items to order
  const handleDragEnd = (result: any) => {
    if (!result.destination) return;

    if (result.source.droppableId === 'menu-items' && result.destination.droppableId === 'order-items') {
      // Adding item from menu to order
      const draggedItem = menuItems.find(item => item.id === result.draggableId);
      if (draggedItem) {
        addItemToOrder(draggedItem);
      }
    } else if (result.source.droppableId === 'order-items' && result.destination.droppableId === 'order-items') {
      // Reordering items within the order
      const items = Array.from(orderItems);
      const [reorderedItem] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, reorderedItem);
      setOrderItems(items);
    }
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
      tableId: selectedTable?.id || null, // Tavolo opzionale
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
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex h-screen bg-background">
      {/* Left Panel - Menu */}
      <div className="w-2/3 bg-card border-r border-border">
        {/* Daily Sales Summary */}
        <div className="border-b border-border bg-blue-50 px-4 py-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-blue-900">Vendite di Oggi</h3>
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
                  className="flex flex-col items-center space-y-1 px-4 py-3 h-16 min-w-20 text-center"
                >
                  <IconComponent className="w-6 h-6" />
                  <span className="text-xs font-medium">{category.name}</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Menu Items Grid */}
        <Droppable droppableId="menu-items" isDropDisabled={true}>
          {(provided) => (
            <div 
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="p-2 grid grid-cols-4 gap-2 h-full overflow-y-auto"
            >
          {menuItems.map((item, index) => {
            const isOutOfStock = item.trackInventory && (item.currentStock || 0) <= 0;
            const isLowStock = item.trackInventory && (item.currentStock || 0) > 0 && (item.currentStock || 0) <= (item.minStock || 0);
            const hasStock = item.trackInventory && (item.currentStock || 0) > (item.minStock || 0);
            
            return (
              <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={!!isOutOfStock}>
                {(provided, snapshot) => (
                  <Card 
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`
                      transition-all relative h-24 cursor-pointer
                      ${isOutOfStock 
                        ? 'opacity-50 cursor-not-allowed bg-gray-50' 
                        : 'hover:shadow-lg hover:scale-105'
                      }
                      ${snapshot.isDragging ? 'shadow-2xl rotate-6' : ''}
                    `}
                    onClick={() => !isOutOfStock && addItemToOrder(item)}
                    data-testid={`menu-item-${item.id}`}
                  >
                <CardContent className="p-2">
                  <div className="text-left">
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
                    
                    <h3 className={`font-medium text-sm ${isOutOfStock ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {item.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                    
                    {/* Stock info */}
                    {item.trackInventory && (
                      <div className="flex items-center space-x-1 mt-1 text-xs text-muted-foreground">
                        <span>Stock: {item.currentStock || 0}</span>
                        {(item.minStock || 0) > 0 && (
                          <span>| Min: {item.minStock}</span>
                        )}
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center mt-2">
                      <span className={`text-lg font-semibold ${isOutOfStock ? 'text-muted-foreground' : 'text-primary'}`}>
                        €{Number(item.price).toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(item.prepTimeMinutes || 0) > 0 ? `${item.prepTimeMinutes || 0} min` : 'Ready'}
                      </span>
                    </div>
                    
                    {isOutOfStock && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-10 rounded">
                        <span className="text-sm font-medium text-red-600">Non Disponibile</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
                )}
              </Draggable>
            );
          })}
          {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>

      {/* Right Panel - Order */}
      <div className="w-1/3 bg-card flex flex-col">
        {/* Table Selection */}
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Current Order</h2>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">Table:</span>
              <Dialog open={showTableDialog} onOpenChange={setShowTableDialog}>
                <DialogTrigger asChild>
                  <Button variant="default" size="sm" data-testid="table-selector">
                    <TableCellsSplit className="w-4 h-4 mr-1" />
                    {selectedTable ? `Table ${selectedTable.number}` : 'Select Table'}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Select Table</DialogTitle>
                  </DialogHeader>
                  <div className="grid grid-cols-6 gap-2 mt-4">
                    {tables.map((table) => (
                      <Button
                        key={table.id}
                        variant={selectedTable?.id === table.id ? 'default' : 'outline'}
                        className={`aspect-square text-xs ${getTableStatusColor(table.status)}`}
                        onClick={() => {
                          setSelectedTable(table);
                          setShowTableDialog(false);
                        }}
                        disabled={table.status === 'occupied'}
                        data-testid={`table-option-${table.id}`}
                      >
                        <div className="text-center">
                          <div>T{table.number}</div>
                          <div className="text-xs">{table.status}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="flex-1 p-4 overflow-y-auto">
          <Droppable droppableId="order-items">
            {(provided, snapshot) => (
              <div 
                {...provided.droppableProps}
                ref={provided.innerRef}
                className={`space-y-3 min-h-32 p-2 rounded-lg border-2 border-dashed transition-colors ${
                  snapshot.isDraggingOver ? 'border-primary bg-primary/5' : 'border-transparent'
                }`}
              >
            {orderItems.map((item, index) => (
              <Draggable key={item.tempId} draggableId={item.tempId} index={index}>
                {(provided, snapshot) => (
                  <Card 
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    key={item.tempId} 
                    className={`bg-accent/50 ${snapshot.isDragging ? 'shadow-lg rotate-2' : ''}`} 
                    data-testid={`order-item-${item.tempId}`}
                  >
                    <div {...provided.dragHandleProps} className="flex items-center justify-center p-1 cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                    </div>
                <CardContent className="p-3">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-sm">{item.menuItem.name}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.tempId)}
                      className="text-destructive hover:bg-destructive/10 h-6 w-6 p-0"
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
                      <span className="w-8 text-center" data-testid={`quantity-${item.tempId}`}>
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
                    <span className="font-semibold text-primary" data-testid={`item-total-${item.tempId}`}>
                      €{Number(item.totalPrice).toFixed(2)}
                    </span>
                  </div>
                  {item.notes && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{item.notes}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
                )}
              </Draggable>
            ))}
            {orderItems.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Trascina qui i prodotti o clicca per aggiungere all'ordine</p>
              </div>
            )}
            {provided.placeholder}
              </div>
            )}
          </Droppable>
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
            <Button
              className="flex-1 bg-success text-white hover:bg-success/90"
              disabled={orderItems.length === 0}
              data-testid="payment"
            >
              <CreditCard className="w-4 h-4 mr-1" />
              Payment
            </Button>
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
    </DragDropContext>
  );
}
