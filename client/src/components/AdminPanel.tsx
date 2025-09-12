import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/ui/logo';
import { logoSettingsSchema } from '@shared/schema';
import { z } from 'zod';
import { useTranslation } from '@/lib/i18n';
import { apiRequest } from '@/lib/queryClient';
import { 
  BarChart3, 
  ShoppingCart, 
  Users, 
  TrendingUp, 
  Plus, 
  Edit, 
  Trash2, 
  Download,
  Upload,
  Package,
  Clock,
  MapPin,
  Receipt,
  Printer,
  Settings2,
  ChefHat,
  Coffee,
  Pizza,
  IceCream,
  AlertTriangle,
  RefreshCcw,
  Trash,
  Database
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import type { OrderWithDetails, MenuItem, MenuCategory, Table, Department, LogoSettings, InsertLogoSettings } from '@shared/schema';

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState('overview');
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [showDepartmentDialog, setShowDepartmentDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Validation schema for logo form
  const logoFormSchema = logoSettingsSchema.extend({
    logo_url: z.string().url().or(z.literal('')).optional(),
    logo_name: z.string().optional(),
  });

  // Forms
  const itemForm = useForm();
  const categoryForm = useForm();
  const tableForm = useForm();
  const departmentForm = useForm();
  const logoForm = useForm({
    resolver: zodResolver(logoFormSchema),
    defaultValues: {
      logo_enabled: false,
      logo_url: '',
      logo_name: '',
    }
  });

  // Data fetching
  const { data: orders = [] } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/orders'],
    refetchInterval: 30000,
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['/api/menu/items'],
  });

  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ['/api/menu/categories'],
  });

  const { data: tables = [] } = useQuery<Table[]>({
    queryKey: ['/api/tables'],
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['/api/departments'],
  });

  const { data: dailySales } = useQuery({
    queryKey: ['/api/analytics/daily-sales', new Date().toISOString().split('T')[0]],
  });

  const { data: topDishes } = useQuery({
    queryKey: ['/api/analytics/top-dishes', new Date().toISOString().split('T')[0]],
  });

  const { data: logoSettings } = useQuery<LogoSettings>({
    queryKey: ['/api/settings/logo'],
  });

  // Mutations
  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/menu/items', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/menu/items'] });
      setShowItemDialog(false);
      itemForm.reset();
      toast({
        title: t('common.success'),
        description: 'Articolo creato con successo',
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PATCH', `/api/menu/items/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/menu/items'] });
      setShowItemDialog(false);
      setEditingItem(null);
      itemForm.reset();
      toast({
        title: t('common.success'),
        description: 'Articolo aggiornato con successo',
      });
    },
    onError: (error) => {
      toast({
        title: 'Errore',
        description: 'Errore durante l\'aggiornamento dell\'articolo',
        variant: 'destructive',
      });
      console.error('Update error:', error);
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/menu/items/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/menu/items'] });
      toast({
        title: t('common.success'),
        description: 'Articolo eliminato con successo',
      });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/menu/categories', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/menu/categories'] });
      setShowCategoryDialog(false);
      categoryForm.reset();
      toast({
        title: t('common.success'),
        description: 'Categoria creata con successo',
      });
    },
  });

  const createTableMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/tables', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tables'] });
      setShowTableDialog(false);
      tableForm.reset();
      toast({
        title: t('common.success'),
        description: 'Tavolo creato con successo',
      });
    },
  });

  const createDepartmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/departments', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/departments'] });
      setShowDepartmentDialog(false);
      setEditingDepartment(null);
      departmentForm.reset();
      toast({
        title: t('common.success'),
        description: 'Reparto creato con successo',
      });
    },
  });

  const updateDepartmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PATCH', `/api/departments/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/departments'] });
      setShowDepartmentDialog(false);
      setEditingDepartment(null);
      departmentForm.reset();
      toast({
        title: t('common.success'),
        description: 'Reparto aggiornato con successo',
      });
    },
  });

  const deleteDepartmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/departments/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/departments'] });
      toast({
        title: t('common.success'),
        description: 'Reparto eliminato con successo',
      });
    },
  });

  // Logo settings mutation
  const updateLogoMutation = useMutation({
    mutationFn: async (data: InsertLogoSettings) => {
      const response = await apiRequest('POST', '/api/settings/logo', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/logo'] });
      toast({
        title: t('common.success'),
        description: 'Impostazioni logo salvate con successo',
      });
    },
    onError: (error) => {
      toast({
        title: 'Errore',
        description: 'Errore durante il salvataggio delle impostazioni logo',
        variant: 'destructive',
      });
      console.error('Logo update error:', error);
    },
  });

  // Reset system mutation
  const resetSystemMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/reset-system');
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all queries to refresh data
      queryClient.invalidateQueries();
      toast({
        title: 'Sistema Azzerato',
        description: 'Tutti i dati sono stati eliminati e il sistema è stato resettato',
      });
    },
    onError: (error) => {
      toast({
        title: 'Errore',
        description: 'Errore durante il reset del sistema',
        variant: 'destructive',
      });
      console.error('Reset error:', error);
    },
  });

  // Stats calculations
  const todayOrders = orders.filter(order => {
    const orderDate = new Date(order.createdAt || '').toDateString();
    const today = new Date().toDateString();
    return orderDate === today;
  });

  const totalRevenue = todayOrders.reduce((sum, order) => sum + parseFloat(order.total || '0'), 0);
  const avgOrderValue = todayOrders.length > 0 ? totalRevenue / todayOrders.length : 0;
  const occupiedTables = tables.filter(table => table.status === 'occupied').length;

  const stations = [
    { value: 'cucina', label: 'Cucina', icon: ChefHat },
    { value: 'bar', label: 'Bar', icon: Coffee },
    { value: 'pizza', label: 'Pizza', icon: Pizza },
    { value: 'dessert', label: 'Dessert', icon: IceCream },
    { value: 'griglia', label: 'Griglia', icon: ChefHat },
    { value: 'friggitrice', label: 'Friggitrice', icon: ChefHat },
    { value: 'stazione_fredda', label: 'Stazione Fredda', icon: ChefHat },
  ];

  const onSubmitItem = (data: any) => {
    const itemData = {
      ...data,
      price: data.price.toString(),
      prepTimeMinutes: parseInt(data.prepTimeMinutes) || 0,
      isAvailable: true,
    };

    if (editingItem) {
      updateItemMutation.mutate({ id: editingItem.id, data: itemData });
    } else {
      createItemMutation.mutate(itemData);
    }
  };

  const onSubmitCategory = (data: any) => {
    const categoryData = {
      ...data,
      sortOrder: parseInt(data.sortOrder) || 0,
      isActive: true,
    };
    createCategoryMutation.mutate(categoryData);
  };

  const onSubmitTable = (data: any) => {
    const tableData = {
      ...data,
      number: parseInt(data.number),
      seats: parseInt(data.seats),
      xPosition: parseInt(data.xPosition) || 0,
      yPosition: parseInt(data.yPosition) || 0,
      status: 'free',
    };
    createTableMutation.mutate(tableData);
  };

  const onSubmitDepartment = (data: any) => {
    // Validation: if setting as main, remove main from others
    const departmentData = {
      ...data,
      sortOrder: parseInt(data.sortOrder) || 0,
      isActive: true,
      isMain: data.isMain || false,
    };

    if (editingDepartment) {
      updateDepartmentMutation.mutate({ id: editingDepartment.id, data: departmentData });
    } else {
      createDepartmentMutation.mutate(departmentData);
    }
  };

  const onSubmitLogo = (data: any) => {
    const logoData: InsertLogoSettings = {
      logo_enabled: data.logo_enabled || false,
      logo_url: data.logo_url || null,
      logo_name: data.logo_name || null,
    };
    updateLogoMutation.mutate(logoData);
  };

  const openEditItem = (item: MenuItem) => {
    setEditingItem(item);
    // Reset form first
    itemForm.reset();
    // Set all values
    itemForm.setValue('name', item.name);
    itemForm.setValue('description', item.description || '');
    itemForm.setValue('price', parseFloat(item.price).toFixed(2));
    itemForm.setValue('categoryId', item.categoryId);
    itemForm.setValue('station', item.station || '');
    itemForm.setValue('prepTimeMinutes', item.prepTimeMinutes || 0);
    // Campi inventario
    itemForm.setValue('trackInventory', item.trackInventory || false);
    itemForm.setValue('currentStock', item.currentStock || 0);
    itemForm.setValue('minStock', item.minStock || 0);
    itemForm.setValue('departmentId', item.departmentId || '');
    setShowItemDialog(true);
  };

  const openEditDepartment = (department: Department) => {
    setEditingDepartment(department);
    departmentForm.setValue('name', department.name);
    departmentForm.setValue('code', department.code);
    departmentForm.setValue('sortOrder', department.sortOrder || 0);
    departmentForm.setValue('isMain', department.isMain || false);
    setShowDepartmentDialog(true);
  };

  const exportSalesReport = () => {
    const csvContent = [
      ['Data', 'Numero Ordine', 'Tavolo', 'Totale', 'Stato'].join(','),
      ...todayOrders.map(order => [
        new Date(order.createdAt || '').toLocaleDateString('it-IT'),
        order.orderNumber,
        `Tavolo ${order.table?.number || 'N/A'}`,
        `€${parseFloat(order.total || '0').toFixed(2)}`,
        order.status
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendite_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const confirmResetSystem = () => {
    if (window.confirm('ATTENZIONE: Questa operazione eliminerà TUTTI gli ordini, libererà tutti i tavoli e azzeererà i totalizzatori. Questa azione NON PUÒ essere annullata. Sei sicuro di voler continuare?')) {
      if (window.confirm('Sei VERAMENTE sicuro? Tutti i dati verranno persi definitivamente.')) {
        resetSystemMutation.mutate();
      }
    }
  };

  // Initialize logo form when logo settings are loaded
  useEffect(() => {
    if (logoSettings) {
      logoForm.setValue('logo_enabled', logoSettings.logo_enabled);
      logoForm.setValue('logo_url', logoSettings.logo_url || '');
      logoForm.setValue('logo_name', logoSettings.logo_name || '');
    }
  }, [logoSettings, logoForm]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">{t('admin.title')}</h1>
          <p className="text-lg text-gray-600">{t('admin.subtitle')}</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-9">
            <TabsTrigger value="overview">{t('admin.overview')}</TabsTrigger>
            <TabsTrigger value="menu">{t('admin.menu')}</TabsTrigger>
            <TabsTrigger value="departments">Reparti</TabsTrigger>
            <TabsTrigger value="tables">{t('admin.tables')}</TabsTrigger>
            <TabsTrigger value="orders">{t('admin.orders')}</TabsTrigger>
            <TabsTrigger value="inventory">{t('admin.inventory')}</TabsTrigger>
            <TabsTrigger value="analytics">{t('admin.analytics')}</TabsTrigger>
            <TabsTrigger value="operations">Operazioni</TabsTrigger>
            <TabsTrigger value="settings">{t('admin.settings')}</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-4 gap-6">
              <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100">{t('admin.revenue_today')}</p>
                      <p className="text-3xl font-bold">€{totalRevenue.toFixed(2)}</p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-blue-200" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-100">{t('admin.orders_today')}</p>
                      <p className="text-3xl font-bold">{todayOrders.length}</p>
                    </div>
                    <ShoppingCart className="w-8 h-8 text-green-200" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-purple-100">{t('admin.avg_order_value')}</p>
                      <p className="text-3xl font-bold">€{avgOrderValue.toFixed(2)}</p>
                    </div>
                    <BarChart3 className="w-8 h-8 text-purple-200" />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-orange-100">{t('admin.table_occupancy')}</p>
                      <p className="text-3xl font-bold">{occupiedTables}/{tables.length}</p>
                    </div>
                    <Users className="w-8 h-8 text-orange-200" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {t('admin.recent_orders')}
                    <Button size="sm" onClick={exportSalesReport}>
                      <Download className="w-4 h-4 mr-2" />
                      {t('admin.export_report')}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {todayOrders.slice(0, 5).map(order => (
                      <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium">#{String(order.orderNumber).padStart(4, '0')}</div>
                          <div className="text-sm text-gray-500">
                            Tavolo {order.table?.number} • {formatDistanceToNow(new Date(order.createdAt || ''), { 
                              addSuffix: true, 
                              locale: language === 'it' ? it : undefined 
                            })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">€{parseFloat(order.total || '0').toFixed(2)}</div>
                          <Badge variant={
                            order.status === 'paid' ? 'default' : 
                            order.status === 'ready' ? 'secondary' : 
                            'outline'
                          }>
                            {t(`status.${order.status}`)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.top_dishes')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(topDishes as any)?.map((dish: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium">{dish.name}</div>
                          <div className="text-sm text-gray-500">{dish.count} ordini</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-green-600">#{index + 1}</div>
                        </div>
                      </div>
                    )) || []}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Menu Management Tab */}
          <TabsContent value="menu" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Gestione Menu</h2>
              <div className="space-x-2">
                <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Plus className="w-4 h-4 mr-2" />
                      Nuova Categoria
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nuova Categoria</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={categoryForm.handleSubmit(onSubmitCategory)} className="space-y-4">
                      <div>
                        <Label htmlFor="categoryName">Nome</Label>
                        <Input id="categoryName" {...categoryForm.register('name', { required: true })} />
                      </div>
                      <div>
                        <Label htmlFor="categoryDescription">Descrizione</Label>
                        <Textarea id="categoryDescription" {...categoryForm.register('description')} />
                      </div>
                      <div>
                        <Label htmlFor="sortOrder">Ordine</Label>
                        <Input type="number" id="sortOrder" {...categoryForm.register('sortOrder')} />
                      </div>
                      <Button type="submit" className="w-full">{t('common.save')}</Button>
                    </form>
                  </DialogContent>
                </Dialog>

                <Dialog open={showItemDialog} onOpenChange={(open) => {
                  setShowItemDialog(open);
                  if (!open) {
                    setEditingItem(null);
                    itemForm.reset();
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Nuovo Articolo
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{editingItem ? 'Modifica Articolo' : 'Nuovo Articolo'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={itemForm.handleSubmit(onSubmitItem)} className="space-y-4">
                      <div>
                        <Label htmlFor="itemName">Nome</Label>
                        <Input id="itemName" {...itemForm.register('name', { required: true })} />
                      </div>
                      <div>
                        <Label htmlFor="itemDescription">Descrizione</Label>
                        <Textarea id="itemDescription" {...itemForm.register('description')} />
                      </div>
                      <div>
                        <Label htmlFor="itemPrice">Prezzo (€)</Label>
                        <Input type="number" step="0.01" id="itemPrice" {...itemForm.register('price', { required: true })} />
                      </div>
                      <div>
                        <Label htmlFor="categoryId">Categoria</Label>
                        <Controller
                          name="categoryId"
                          control={itemForm.control}
                          defaultValue=""
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleziona categoria" />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map(category => (
                                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div>
                        <Label htmlFor="station">Stazione</Label>
                        <Controller
                          name="station"
                          control={itemForm.control}
                          defaultValue=""
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleziona stazione" />
                              </SelectTrigger>
                              <SelectContent>
                                {stations.map(station => (
                                  <SelectItem key={station.value} value={station.value}>{station.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div>
                        <Label htmlFor="prepTime">Tempo Preparazione (minuti)</Label>
                        <Input type="number" id="prepTime" {...itemForm.register('prepTimeMinutes')} />
                      </div>
                      
                      {/* Gestione Inventario */}
                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-3">Gestione Inventario</h4>
                        <div className="flex items-center space-x-2 mb-3">
                          <input type="checkbox" id="trackInventory" {...itemForm.register('trackInventory')} />
                          <Label htmlFor="trackInventory">Abilita controllo inventario</Label>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="currentStock">Giacenza Attuale</Label>
                            <Input type="number" id="currentStock" {...itemForm.register('currentStock')} />
                          </div>
                          <div>
                            <Label htmlFor="minStock">Giacenza Minima</Label>
                            <Input type="number" id="minStock" {...itemForm.register('minStock')} />
                          </div>
                        </div>
                        
                        <div className="mt-3">
                          <Label htmlFor="departmentId">Reparto</Label>
                          <Controller
                            name="departmentId"
                            control={itemForm.control}
                            defaultValue=""
                            render={({ field }) => (
                              <Select value={field.value} onValueChange={field.onChange}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleziona reparto" />
                                </SelectTrigger>
                                <SelectContent>
                                  {departments.map(department => (
                                    <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                      </div>
                      
                      <Button type="submit" className="w-full">{t('common.save')}</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {categories.map(category => (
                <Card key={category.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {category.name}
                      <Badge variant="outline">{menuItems.filter(item => item.categoryId === category.id).length} articoli</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      {menuItems
                        .filter(item => item.categoryId === category.id)
                        .map(item => (
                          <div key={item.id} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-medium">{item.name}</h3>
                              <div className="flex space-x-1">
                                <Button size="sm" variant="ghost" onClick={() => openEditItem(item)}>
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => deleteItemMutation.mutate(item.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                            {item.trackInventory && (
                              <div className="flex items-center space-x-2 mb-2 text-xs">
                                <span className="text-gray-500">Stock:</span>
                                <Badge 
                                  className={`${
                                    (item.currentStock || 0) <= 0 ? 'bg-red-100 text-red-800' :
                                    (item.currentStock || 0) <= (item.minStock || 0) ? 'bg-orange-100 text-orange-800' :
                                    'bg-green-100 text-green-800'
                                  }`}
                                >
                                  {item.currentStock || 0} / min: {item.minStock || 0}
                                </Badge>
                                <span className="text-gray-400">
                                  {departments.find(d => d.id === item.departmentId)?.name || 'N/A'}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-green-600">€{parseFloat(item.price).toFixed(2)}</span>
                              <div className="flex items-center space-x-2 text-xs text-gray-500">
                                <Clock className="w-3 h-3" />
                                <span>{item.prepTimeMinutes || 0} min</span>
                                <Badge variant="outline" className="text-xs">
                                  {item.station || 'cucina'}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Departments Management Tab */}
          <TabsContent value="departments" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Gestione Reparti</h2>
              <Dialog open={showDepartmentDialog} onOpenChange={setShowDepartmentDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Nuovo Reparto
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingDepartment ? 'Modifica Reparto' : 'Nuovo Reparto'}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={departmentForm.handleSubmit(onSubmitDepartment)} className="space-y-4">
                    <div>
                      <Label htmlFor="departmentName">Nome Reparto</Label>
                      <Input id="departmentName" {...departmentForm.register('name', { required: true })} />
                    </div>
                    <div>
                      <Label htmlFor="departmentCode">Codice</Label>
                      <Input id="departmentCode" {...departmentForm.register('code', { required: true })} />
                      <p className="text-sm text-gray-500 mt-1">Es: cucina, bar, pizza</p>
                    </div>
                    <div>
                      <Label htmlFor="departmentSortOrder">Ordine</Label>
                      <Input type="number" id="departmentSortOrder" {...departmentForm.register('sortOrder')} />
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="isMain" {...departmentForm.register('isMain')} />
                      <Label htmlFor="isMain">Reparto Principale</Label>
                    </div>
                    <Button type="submit" className="w-full">
                      {editingDepartment ? 'Aggiorna' : 'Crea'} Reparto
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {departments.map(department => (
                <Card key={department.id} className={`${department.isMain ? 'border-blue-400 bg-blue-50' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-semibold text-lg">{department.name}</h3>
                        <p className="text-sm text-gray-600">Codice: {department.code}</p>
                        {department.isMain && (
                          <Badge className="bg-blue-100 text-blue-800 mt-1">Principale</Badge>
                        )}
                      </div>
                      <div className="flex space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditDepartment(department)}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => deleteDepartmentMutation.mutate(department.id)}
                          disabled={department.isMain || false}
                          data-testid={`delete-department-${department.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      Ordine: {department.sortOrder || 0}
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {departments.length === 0 && (
                <div className="col-span-3 text-center py-8 text-gray-500">
                  <ChefHat className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p>Nessun reparto configurato.</p>
                  <p className="text-sm">Inizia creando il tuo primo reparto.</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tables Management Tab */}
          <TabsContent value="tables" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Gestione Tavoli</h2>
              <Dialog open={showTableDialog} onOpenChange={setShowTableDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Nuovo Tavolo
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nuovo Tavolo</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={tableForm.handleSubmit(onSubmitTable)} className="space-y-4">
                    <div>
                      <Label htmlFor="tableNumber">Numero Tavolo</Label>
                      <Input type="number" id="tableNumber" {...tableForm.register('number', { required: true })} />
                    </div>
                    <div>
                      <Label htmlFor="seats">Posti</Label>
                      <Input type="number" id="seats" {...tableForm.register('seats', { required: true })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="xPosition">Posizione X</Label>
                        <Input type="number" id="xPosition" {...tableForm.register('xPosition')} />
                      </div>
                      <div>
                        <Label htmlFor="yPosition">Posizione Y</Label>
                        <Input type="number" id="yPosition" {...tableForm.register('yPosition')} />
                      </div>
                    </div>
                    <Button type="submit" className="w-full">{t('common.save')}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-6 gap-4">
              {tables.map(table => (
                <Card key={table.id} className={`p-4 text-center ${
                  table.status === 'free' ? 'bg-green-50 border-green-200' :
                  table.status === 'occupied' ? 'bg-red-50 border-red-200' :
                  'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="text-2xl font-bold">{table.number}</div>
                  <div className="text-sm text-gray-600">{table.seats} posti</div>
                  <Badge variant={
                    table.status === 'free' ? 'default' :
                    table.status === 'occupied' ? 'destructive' :
                    'secondary'
                  } className="mt-2">
                    {t(`status.${table.status}`)}
                  </Badge>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Orders Management Tab */}
          <TabsContent value="orders" className="space-y-6">
            <h2 className="text-2xl font-bold">{t('admin.all_orders')}</h2>
            <div className="space-y-4">
              {orders.slice(0, 20).map(order => (
                <Card key={order.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">#{String(order.orderNumber).padStart(4, '0')}</div>
                        <div className="text-sm text-gray-600">
                          Tavolo {order.table?.number} • {new Date(order.createdAt || '').toLocaleString('it-IT')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">€{parseFloat(order.total || '0').toFixed(2)}</div>
                        <Badge variant={
                          order.status === 'paid' ? 'default' : 
                          order.status === 'ready' ? 'secondary' : 
                          'outline'
                        }>
                          {t(`status.${order.status}`)}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Inventory Tab */}
          <TabsContent value="inventory" className="space-y-6">
            <h2 className="text-2xl font-bold">Gestione Magazzino</h2>
            <div className="grid grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Package className="w-5 h-5 mr-2" />
                    Ingredienti Principali
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <span>Farina (kg)</span>
                      <Badge variant="outline">25 kg</Badge>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <span>Mozzarella (kg)</span>
                      <Badge variant="outline">15 kg</Badge>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-red-50 border-red-200 rounded">
                      <span>Pomodoro (kg)</span>
                      <Badge variant="destructive">3 kg - Scorte basse</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Receipt className="w-5 h-5 mr-2" />
                    Scontrini Non Fiscali
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button className="w-full mb-3">
                    <Printer className="w-4 h-4 mr-2" />
                    Stampa Scontrino Ultimo Ordine
                  </Button>
                  <Button variant="outline" className="w-full">
                    <Settings2 className="w-4 h-4 mr-2" />
                    Configura Template
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <ChefHat className="w-5 h-5 mr-2" />
                    Ticket per Reparti
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stations.map(station => (
                      <Button key={station.value} variant="outline" className="w-full justify-start">
                        <station.icon className="w-4 h-4 mr-2" />
                        Stampa {station.label}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <h2 className="text-2xl font-bold">{t('admin.analytics')}</h2>
            <div className="grid grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.daily_sales')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>{t('admin.total_revenue')}</span>
                      <span className="font-semibold">€{(dailySales as any)?.total?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('admin.orders_count')}</span>
                      <span className="font-semibold">{(dailySales as any)?.orderCount || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('admin.avg_order_value')}</span>
                      <span className="font-semibold">€{(dailySales as any)?.avgOrderValue?.toFixed(2) || '0.00'}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.performance')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>{t('admin.active_orders')}</span>
                      <span className="font-semibold">{orders.filter(o => ['new', 'preparing'].includes(o.status)).length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tempo medio preparazione</span>
                      <span className="font-semibold">12 min</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Efficienza cucina</span>
                      <Badge variant="default">85%</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <h2 className="text-2xl font-bold">Impostazioni Sistema</h2>
            <div className="grid grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Configurazione Generale</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Nome Ristorante</Label>
                    <Input defaultValue="Il Mio Ristorante" />
                  </div>
                  <div>
                    <Label>Indirizzo</Label>
                    <Input defaultValue="Via Roma 123, Milano" />
                  </div>
                  <div>
                    <Label>Telefono</Label>
                    <Input defaultValue="+39 02 123456" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input defaultValue="info@ristorante.it" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Configurazione IVA e Fiscale</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Aliquota IVA Predefinita</Label>
                    <Select defaultValue="22">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="4">4%</SelectItem>
                        <SelectItem value="10">10%</SelectItem>
                        <SelectItem value="22">22%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Partita IVA</Label>
                    <Input placeholder="IT12345678901" />
                  </div>
                  <div>
                    <Label>Codice Fiscale</Label>
                    <Input placeholder="RSSMRA80A01F205Z" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Gestione Logo Aziendale</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={logoForm.handleSubmit(onSubmitLogo)} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="logo_enabled">Abilita Logo Aziendale</Label>
                      <Controller
                        name="logo_enabled"
                        control={logoForm.control}
                        render={({ field }) => (
                          <Switch
                            id="logo_enabled"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-logo-enabled"
                          />
                        )}
                      />
                    </div>

                    {logoForm.watch('logo_enabled') && (
                      <>
                        <div>
                          <Label htmlFor="logo_url">URL Logo</Label>
                          <Input
                            id="logo_url"
                            type="url"
                            placeholder="https://esempio.com/logo.png"
                            {...logoForm.register('logo_url')}
                            data-testid="input-logo-url"
                          />
                          {logoForm.formState.errors.logo_url && (
                            <p className="text-sm text-red-600 mt-1">
                              {logoForm.formState.errors.logo_url.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="logo_name">Nome Logo</Label>
                          <Input
                            id="logo_name"
                            placeholder="Nome del ristorante"
                            {...logoForm.register('logo_name')}
                            data-testid="input-logo-name"
                          />
                          {logoForm.formState.errors.logo_name && (
                            <p className="text-sm text-red-600 mt-1">
                              {logoForm.formState.errors.logo_name.message}
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    <div className="border-t pt-4">
                      <Label className="text-sm font-medium mb-2 block">Anteprima Logo</Label>
                      <div className="flex justify-center p-4 bg-gray-50 rounded-lg min-h-[80px] items-center">
                        {!logoForm.watch('logo_enabled') ? (
                          <span className="text-gray-500 text-sm">Logo disabilitato</span>
                        ) : (
                          <Logo
                            variant="admin"
                            fallback={logoForm.watch('logo_name') || "Logo Ristorante"}
                            data-testid="preview-logo-admin"
                          />
                        )}
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full"
                      disabled={updateLogoMutation.isPending}
                      data-testid="button-save-logo"
                    >
                      {updateLogoMutation.isPending ? 'Salvando...' : 'Salva Impostazioni Logo'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Operations Tab */}
          <TabsContent value="operations" className="space-y-6">
            <div className="max-w-4xl mx-auto">
              <Card className="bg-red-50 border-red-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-red-700">
                    <AlertTriangle className="w-6 h-6" />
                    Operazioni Critiche
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-red-100 p-4 rounded-lg border border-red-300">
                    <h3 className="font-semibold text-red-800 mb-2">⚠️ ATTENZIONE</h3>
                    <p className="text-red-700 text-sm">
                      Le operazioni in questa sezione sono irreversibili e comportano la perdita completa di dati. 
                      Utilizzare solo in caso di estrema necessità o per inizializzare un nuovo periodo operativo.
                    </p>
                  </div>

                  <div className="grid gap-6">
                    <Card className="border-red-300 bg-white">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-700">
                          <Database className="w-5 h-5" />
                          Reset Completo Sistema
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="text-sm text-gray-700 space-y-2">
                            <p><strong>Questa operazione eliminerà:</strong></p>
                            <ul className="list-disc list-inside ml-4 space-y-1">
                              <li>Tutti gli ordini in corso e completati</li>
                              <li>Tutti i pagamenti registrati</li>
                              <li>La cronologia delle vendite e analytics</li>
                              <li>I log di audit del sistema</li>
                            </ul>
                            <p><strong>Resetterà:</strong></p>
                            <ul className="list-disc list-inside ml-4 space-y-1">
                              <li>Tutti i tavoli allo stato "libero"</li>
                              <li>I totalizzatori delle vendite</li>
                              <li>Le statistiche di performance</li>
                              <li>I contatori degli ordini (ripartirà da 1)</li>
                            </ul>
                            <p><strong>Manterrà:</strong></p>
                            <ul className="list-disc list-inside ml-4 space-y-1">
                              <li>Menu e categorie</li>
                              <li>Tavoli e configurazione</li>
                              <li>Reparti e impostazioni</li>
                              <li>Utenti e permessi</li>
                            </ul>
                          </div>
                          
                          <div className="pt-4 border-t">
                            <Button 
                              variant="destructive" 
                              size="lg"
                              className="w-full"
                              onClick={confirmResetSystem}
                              disabled={resetSystemMutation.isPending}
                              data-testid="button-reset-system"
                            >
                              <Trash className="w-4 h-4 mr-2" />
                              {resetSystemMutation.isPending ? 'Resettando...' : 'Esegui Reset Completo del Sistema'}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-orange-300 bg-orange-50">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-orange-700">
                          <RefreshCcw className="w-5 h-5" />
                          Operazioni di Manutenzione
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          <Button variant="outline" className="h-20 flex-col" disabled>
                            <RefreshCcw className="w-6 h-6 mb-2" />
                            <span className="text-sm">Pulizia Log Vecchi</span>
                            <span className="text-xs text-gray-500">(Prossimamente)</span>
                          </Button>
                          <Button variant="outline" className="h-20 flex-col" disabled>
                            <Database className="w-6 h-6 mb-2" />
                            <span className="text-sm">Backup Database</span>
                            <span className="text-xs text-gray-500">(Prossimamente)</span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}