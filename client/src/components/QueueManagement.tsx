import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { apiRequest } from '@/lib/queryClient';
import { 
  Clock, 
  Users, 
  UserPlus, 
  PhoneCall, 
  MessageSquare,
  CheckCircle,
  XCircle,
  Timer,
  TrendingUp
} from 'lucide-react';
import type { Table } from '@shared/schema';

interface QueueEntry {
  id: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  estimatedWait: number;
  status: 'waiting' | 'called' | 'seated' | 'cancelled';
  joinTime: Date;
  tablePreference?: string;
  notes?: string;
}

export function QueueManagement() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [newCustomer, setNewCustomer] = useState({
    customerName: '',
    customerPhone: '',
    partySize: 1,
    tablePreference: '',
    notes: ''
  });
  const [showAddDialog, setShowAddDialog] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lastMessage } = useWebSocketContext();

  // Fetch tables data to show availability
  const { data: tables = [] } = useQuery<Table[]>({
    queryKey: ['/api/tables'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Mock queue management functions (in a real implementation, these would be API calls)
  const addToQueue = (customerData: Omit<QueueEntry, 'id' | 'joinTime' | 'status' | 'estimatedWait'>) => {
    const availableTables = tables.filter(t => t.status === 'free' && t.seats >= customerData.partySize);
    const estimatedWait = availableTables.length > 0 ? 5 : queue.length * 15 + 30;
    
    const newEntry: QueueEntry = {
      id: Math.random().toString(36).substr(2, 9),
      ...customerData,
      status: 'waiting',
      joinTime: new Date(),
      estimatedWait
    };
    
    setQueue(prev => [...prev, newEntry]);
    
    toast({
      title: "Customer added to queue",
      description: `${customerData.customerName} has been added to the waiting list.`,
    });
  };

  const updateQueueStatus = (id: string, status: QueueEntry['status']) => {
    setQueue(prev => prev.map(entry => 
      entry.id === id ? { ...entry, status } : entry
    ));
    
    const customer = queue.find(entry => entry.id === id);
    if (customer) {
      toast({
        title: "Status updated",
        description: `${customer.customerName}'s status updated to ${status}.`,
      });
    }
  };

  const removeFromQueue = (id: string) => {
    setQueue(prev => prev.filter(entry => entry.id !== id));
  };

  // Calculate wait times and statistics
  const waitingCustomers = queue.filter(entry => entry.status === 'waiting');
  const totalWaiting = waitingCustomers.length;
  const averageWaitTime = waitingCustomers.length > 0 
    ? Math.round(waitingCustomers.reduce((acc, entry) => acc + entry.estimatedWait, 0) / waitingCustomers.length)
    : 0;
  
  const freeTables = tables.filter(table => table.status === 'free');
  const occupiedTables = tables.filter(table => table.status === 'occupied');

  const getStatusColor = (status: QueueEntry['status']) => {
    switch (status) {
      case 'waiting': return 'bg-yellow-100 text-yellow-800';
      case 'called': return 'bg-blue-100 text-blue-800';
      case 'seated': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatWaitTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getTimeSinceJoined = (joinTime: Date) => {
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - joinTime.getTime()) / (1000 * 60));
    return formatWaitTime(diffMinutes);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Queue Management</h1>
              <p className="text-muted-foreground">Manage customer waiting list and table assignments</p>
            </div>
          </div>
          
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button data-testid="add-customer-button">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Customer to Queue</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Customer Name</label>
                  <Input
                    value={newCustomer.customerName}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, customerName: e.target.value }))}
                    placeholder="Enter customer name"
                    data-testid="input-customer-name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Phone Number</label>
                  <Input
                    value={newCustomer.customerPhone}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, customerPhone: e.target.value }))}
                    placeholder="Enter phone number"
                    data-testid="input-customer-phone"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Party Size</label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={newCustomer.partySize}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, partySize: parseInt(e.target.value) || 1 }))}
                    data-testid="input-party-size"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Notes (Optional)</label>
                  <Input
                    value={newCustomer.notes}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Special requests, allergies, etc."
                    data-testid="input-notes"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      if (newCustomer.customerName && newCustomer.customerPhone) {
                        addToQueue(newCustomer);
                        setNewCustomer({
                          customerName: '',
                          customerPhone: '',
                          partySize: 1,
                          tablePreference: '',
                          notes: ''
                        });
                        setShowAddDialog(false);
                      }
                    }}
                    disabled={!newCustomer.customerName || !newCustomer.customerPhone}
                    data-testid="button-add-to-queue"
                  >
                    Add to Queue
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowAddDialog(false)}
                    data-testid="button-cancel-add"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{totalWaiting}</div>
            <div className="text-sm text-muted-foreground">Waiting</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{freeTables.length}</div>
            <div className="text-sm text-muted-foreground">Free Tables</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{occupiedTables.length}</div>
            <div className="text-sm text-muted-foreground">Occupied</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{averageWaitTime}m</div>
            <div className="text-sm text-muted-foreground">Avg Wait</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Queue List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Current Queue</h2>
          {queue.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No customers in queue</p>
              </CardContent>
            </Card>
          ) : (
            queue.map((entry, index) => (
              <Card key={entry.id} className="border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium">{entry.customerName}</h3>
                      <p className="text-sm text-muted-foreground">
                        Party of {entry.partySize} • {entry.customerPhone}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge className={getStatusColor(entry.status)}>
                        {entry.status}
                      </Badge>
                      <p className="text-sm text-muted-foreground mt-1">
                        #{index + 1} in line
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                    <span>Waiting: {getTimeSinceJoined(entry.joinTime)}</span>
                    <span>Est. wait: {formatWaitTime(entry.estimatedWait)}</span>
                  </div>
                  
                  {entry.notes && (
                    <p className="text-sm text-muted-foreground mb-3 italic">"{entry.notes}"</p>
                  )}
                  
                  <div className="flex gap-2">
                    {entry.status === 'waiting' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateQueueStatus(entry.id, 'called')}
                          data-testid={`call-customer-${entry.id}`}
                        >
                          <PhoneCall className="w-4 h-4 mr-1" />
                          Call
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => updateQueueStatus(entry.id, 'seated')}
                          data-testid={`seat-customer-${entry.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Seat
                        </Button>
                      </>
                    )}
                    {entry.status === 'called' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => updateQueueStatus(entry.id, 'seated')}
                          data-testid={`seat-called-customer-${entry.id}`}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Seat
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateQueueStatus(entry.id, 'waiting')}
                          data-testid={`return-to-queue-${entry.id}`}
                        >
                          Return to Queue
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        updateQueueStatus(entry.id, 'cancelled');
                        removeFromQueue(entry.id);
                      }}
                      data-testid={`cancel-customer-${entry.id}`}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Table Status */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Table Status</h2>
          <div className="grid grid-cols-2 gap-3">
            {tables.map((table) => {
              const suitableCustomers = waitingCustomers.filter(
                customer => customer.partySize <= table.seats
              );
              
              return (
                <Card 
                  key={table.id}
                  className={`border ${
                    table.status === 'free' ? 'border-green-200 bg-green-50' :
                    table.status === 'occupied' ? 'border-yellow-200 bg-yellow-50' :
                    'border-red-200 bg-red-50'
                  }`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium">Table {table.number}</h3>
                      <Badge 
                        className={
                          table.status === 'free' ? 'bg-green-100 text-green-800' :
                          table.status === 'occupied' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }
                      >
                        {table.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {table.seats} seats
                    </p>
                    {table.status === 'free' && suitableCustomers.length > 0 && (
                      <p className="text-xs text-green-600">
                        {suitableCustomers.length} waiting customer(s) can be seated
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}