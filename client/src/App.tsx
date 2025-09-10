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
    <WebSocketProvider>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/pos" component={PosInterface} />
        <Route path="/kitchen" component={KitchenDisplay} />
        <Route path="/customer" component={CustomerMonitor} />
        <Route path="/waiter" component={WaiterInterface} />
        <Route path="/queue" component={QueueManagement} />
        <Route path="/admin" component={AdminPanel} />
        <Route component={NotFound} />
      </Switch>
    </WebSocketProvider>
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
