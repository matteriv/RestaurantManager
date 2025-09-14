import { Switch, Route, useLocation } from "wouter";
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
import { DeliveryInterface } from "@/components/DeliveryInterface";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useEffect } from "react";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  
  // Build stamp for bundle verification
  console.log('🔧 Router build:', '__BUILD_2025-09-14T14:45Z__');
  
  // Debug: Check if Router component is running
  console.log('🔧 Router component executing:', {
    isAuthenticated,
    isLoading,
    location,
    timestamp: new Date().toISOString()
  });
  
  // UseEffect-based test-mode navigation (recommended React/Wouter pattern)
  useEffect(() => {
    try {
      const viteTestMode = import.meta.env.VITE_TEST_MODE;
      const host = window.location.hostname;
      const isLocal = host === 'localhost' || host === '127.0.0.1';
      const isReplit = host.includes('.replit.dev');
      const isTestMode = viteTestMode === 'true' || isLocal || isReplit;
      console.log('🔍 Test-mode nav (effect):', { isAuthenticated, isLoading, location, isTestMode });
      if (isAuthenticated && !isLoading && isTestMode && location === '/') {
        console.log('🧪 Test mode detected - redirecting to POS interface via useEffect');
        console.log('🚀 Navigation from Home to POS interface');
        setLocation('/pos', { replace: true });
      }
    } catch (e) { 
      console.error('❌ Test-mode nav error:', e); 
    }
  }, [isAuthenticated, isLoading, location, setLocation]);

  if (isLoading || !isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/customer">
          <WebSocketProvider clientType="customer">
            <CustomerMonitor />
          </WebSocketProvider>
        </Route>
        <Route component={NotFound} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/pos">
        <WebSocketProvider clientType="pos">
          <ErrorBoundary 
            fallbackTitle="POS Interface Error"
            fallbackDescription="There was an error loading the POS interface. This might be due to a configuration issue or network problem."
          >
            <PosInterface />
          </ErrorBoundary>
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
      <Route path="/admin">
        <WebSocketProvider clientType="admin">
          <AdminPanel />
        </WebSocketProvider>
      </Route>
      <Route path="/delivery">
        <WebSocketProvider clientType="pos">
          <DeliveryInterface />
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
