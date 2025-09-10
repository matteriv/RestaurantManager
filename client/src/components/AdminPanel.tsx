import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Receipt, Timer, Euro, TableCellsSplit, TrendingUp, TrendingDown } from 'lucide-react';
import type { OrderWithDetails, TableWithOrders } from '@shared/schema';

export function AdminPanel() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Fetch data
  const { data: orders = [] } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/orders'],
  });

  const { data: tablesWithOrders = [] } = useQuery<TableWithOrders[]>({
    queryKey: ['/api/tables/with-orders'],
  });

  const { data: dailySales } = useQuery({
    queryKey: ['/api/analytics/daily-sales', selectedDate],
  });

  const { data: topDishes = [] } = useQuery({
    queryKey: ['/api/analytics/top-dishes', selectedDate],
  });

  // Calculate stats
  const todayOrders = orders.filter(order => {
    const orderDate = new Date(order.createdAt).toDateString();
    const today = new Date().toDateString();
    return orderDate === today;
  });

  const avgPrepTime = todayOrders.length > 0 
    ? todayOrders.reduce((sum, order) => {
        const prepTimes = order.orderLines.map(line => line.menuItem.prepTimeMinutes || 10);
        const avgOrderPrepTime = prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length;
        return sum + avgOrderPrepTime;
      }, 0) / todayOrders.length
    : 0;

  const occupiedTables = tablesWithOrders.filter(table => 
    table.orders.some(order => ['new', 'preparing', 'ready'].includes(order.status))
  ).length;

  const totalTables = tablesWithOrders.length;
  const occupancyRate = totalTables > 0 ? (occupiedTables / totalTables) * 100 : 0;

  const getTableStatusColor = (table: TableWithOrders) => {
    const hasActiveOrders = table.orders.some(order => 
      ['new', 'preparing', 'ready'].includes(order.status)
    );
    
    if (hasActiveOrders) return 'bg-yellow-50 border-yellow-200';
    if (table.status === 'closing') return 'bg-red-50 border-red-200';
    return 'bg-green-50 border-green-200';
  };

  const getTableStatusText = (table: TableWithOrders) => {
    const activeOrder = table.orders.find(order => 
      ['new', 'preparing', 'ready'].includes(order.status)
    );
    
    if (activeOrder) {
      const minutesAgo = Math.floor(
        (new Date().getTime() - new Date(activeOrder.createdAt).getTime()) / (1000 * 60)
      );
      return `${minutesAgo} min`;
    }
    
    if (table.status === 'closing') {
      const totalAmount = table.orders
        .filter(order => order.status === 'paid')
        .reduce((sum, order) => sum + Number(order.total), 0);
      return `€${totalAmount.toFixed(2)}`;
    }
    
    return `${table.seats} seats`;
  };

  const getTableStatusLabel = (table: TableWithOrders) => {
    const hasActiveOrders = table.orders.some(order => 
      ['new', 'preparing', 'ready'].includes(order.status)
    );
    
    if (hasActiveOrders) return 'Occupied';
    if (table.status === 'closing') return 'Closing';
    return 'Free';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'preparing': return 'bg-yellow-100 text-yellow-800';
      case 'ready': return 'bg-green-100 text-green-800';
      case 'served': return 'bg-gray-100 text-gray-800';
      case 'paid': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const recentOrders = orders
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary">Restaurant Management</h1>
            <p className="text-muted-foreground mt-1">Overview and analytics dashboard</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Today's Revenue</div>
              <div className="text-2xl font-bold text-success" data-testid="daily-revenue">
                €{dailySales?.total.toFixed(2) || '0.00'}
              </div>
            </div>
            <Button data-testid="export-report">
              <Download className="w-4 h-4 mr-1" />
              Export Report
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">Orders</TabsTrigger>
          <TabsTrigger value="tables" data-testid="tab-tables">Tables</TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-primary" data-testid="orders-today-count">
                      {todayOrders.length}
                    </div>
                    <div className="text-sm text-muted-foreground">Orders Today</div>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Receipt className="w-6 h-6 text-primary" />
                  </div>
                </div>
                <div className="mt-2 text-sm text-success flex items-center">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  +12% from yesterday
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-primary" data-testid="avg-prep-time">
                      {avgPrepTime.toFixed(1)}
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Prep Time (min)</div>
                  </div>
                  <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center">
                    <Timer className="w-6 h-6 text-warning" />
                  </div>
                </div>
                <div className="mt-2 text-sm text-destructive flex items-center">
                  <TrendingDown className="w-3 h-3 mr-1" />
                  +2.1 min from target
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-primary" data-testid="avg-order-value">
                      €{dailySales?.avgOrderValue.toFixed(2) || '0.00'}
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Order Value</div>
                  </div>
                  <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                    <Euro className="w-6 h-6 text-success" />
                  </div>
                </div>
                <div className="mt-2 text-sm text-success flex items-center">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  +€5.20 from yesterday
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-primary" data-testid="table-occupancy">
                      {occupiedTables}/{totalTables}
                    </div>
                    <div className="text-sm text-muted-foreground">Tables Occupied</div>
                  </div>
                  <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
                    <TableCellsSplit className="w-6 h-6 text-secondary" />
                  </div>
                </div>
                <div className="mt-2 text-sm text-success">
                  {occupancyRate.toFixed(1)}% occupancy
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Recent Orders */}
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Recent Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentOrders.map((order) => (
                    <div 
                      key={order.id}
                      className="flex items-center justify-between p-3 bg-accent/30 rounded-lg"
                      data-testid={`recent-order-${order.id}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                          {order.orderNumber}
                        </div>
                        <div>
                          <div className="font-medium text-sm">
                            {order.table ? `Table ${order.table.number}` : 'Takeaway'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {order.orderLines.length} items • €{Number(order.total).toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={getStatusColor(order.status)}>
                          {order.status}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-1">
                          {Math.floor((new Date().getTime() - new Date(order.createdAt).getTime()) / (1000 * 60))} min ago
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Dishes */}
            <Card>
              <CardHeader>
                <CardTitle>Top Dishes Today</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topDishes.map((dish, index) => (
                    <div 
                      key={dish.menuItem.id}
                      className="flex items-center justify-between"
                      data-testid={`top-dish-${index}`}
                    >
                      <div>
                        <div className="font-medium text-sm">{dish.menuItem.name}</div>
                        <div className="text-xs text-muted-foreground">{dish.orderCount} orders</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-primary">€{dish.revenue.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>All Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {orders.map((order) => (
                  <div 
                    key={order.id}
                    className="border border-border rounded-lg p-4"
                    data-testid={`order-details-${order.id}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-4">
                        <span className="text-lg font-semibold">Order #{order.orderNumber}</span>
                        <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">
                          {order.table ? `Table ${order.table.number}` : 'Takeaway'}
                        </div>
                        <div className="text-sm font-medium">€{Number(order.total).toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      {order.orderLines.map((line) => (
                        <div key={line.id} className="bg-muted/50 rounded p-2">
                          <div className="font-medium">{line.menuItem.name}</div>
                          <div className="text-muted-foreground">Qty: {line.quantity}</div>
                          <Badge className={getStatusColor(line.status)} size="sm">
                            {line.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tables">
          <Card>
            <CardHeader>
              <CardTitle>Table Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-8 gap-4">
                {tablesWithOrders.map((table) => (
                  <Card 
                    key={table.id}
                    className={`aspect-square ${getTableStatusColor(table)} border-2`}
                    data-testid={`table-status-${table.id}`}
                  >
                    <CardContent className="p-3 text-center flex flex-col justify-center h-full">
                      <div className="text-lg font-bold">T{table.number}</div>
                      <div className="text-xs mt-1">
                        <div className="font-medium">{getTableStatusLabel(table)}</div>
                        <div className="text-muted-foreground">{getTableStatusText(table)}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Daily Sales Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Total Revenue:</span>
                    <span className="font-semibold">€{dailySales?.total.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Orders Count:</span>
                    <span className="font-semibold">{dailySales?.orderCount || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Average Order Value:</span>
                    <span className="font-semibold">€{dailySales?.avgOrderValue.toFixed(2) || '0.00'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Table Occupancy:</span>
                    <span className="font-semibold">{occupancyRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg Prep Time:</span>
                    <span className="font-semibold">{avgPrepTime.toFixed(1)} min</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Orders:</span>
                    <span className="font-semibold">
                      {orders.filter(o => ['new', 'preparing', 'ready'].includes(o.status)).length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
