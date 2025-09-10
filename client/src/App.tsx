import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Home from "@/pages/Home";
import { PosInterface } from "@/components/PosInterface";
import { KitchenDisplay } from "@/components/KitchenDisplay";
import { CustomerMonitor } from "@/components/CustomerMonitor";
import { AdminPanel } from "@/components/AdminPanel";
import { WaiterInterface } from "@/components/WaiterInterface";
import { QueueManagement } from "@/components/QueueManagement";
import { WebSocketProvider } from "@/contexts/WebSocketContext";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading || !isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/pos">
        <WebSocketProvider clientType="pos">
          <PosInterface />
        </WebSocketProvider>
      </Route>
      <Route path="/kitchen">
        <WebSocketProvider clientType="kds">
          <KitchenDisplay />
        </WebSocketProvider>
      </Route>
      <Route path="/customer">
        <WebSocketProvider clientType="customer">
          <CustomerMonitor />
        </WebSocketProvider>
      </Route>
      <Route path="/waiter">
        <WebSocketProvider clientType="waiter">
          <WaiterInterface />
        </WebSocketProvider>
      </Route>
      <Route path="/queue">
        <WebSocketProvider clientType="admin">
          <QueueManagement />
        </WebSocketProvider>
      </Route>
      <Route path="/admin">
        <WebSocketProvider clientType="admin">
          <AdminPanel />
        </WebSocketProvider>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
