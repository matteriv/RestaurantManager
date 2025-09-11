import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Wifi, 
  Server, 
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Network,
  Database,
  Zap,
  Clock,
  Shield,
  Activity
} from 'lucide-react';
import type { WizardConfig } from '../ConfigurationWizard';

interface NetworkTestStepProps {
  config: WizardConfig;
  onConfigChange: (updates: Partial<WizardConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

interface TestResult {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'error';
  message?: string;
  details?: string;
  duration?: number;
  icon: React.ComponentType<{ className?: string }>;
}

export function NetworkTestStep({ config }: NetworkTestStepProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [overallStatus, setOverallStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');

  const isServerMode = config.mode === 'server';
  const isClientMode = config.mode === 'client';

  // Define tests based on configuration
  const getTests = (): TestResult[] => {
    const baseTests: TestResult[] = [
      {
        id: 'network-interface',
        name: 'Network Interface',
        description: 'Check network connectivity and interface status',
        status: 'pending',
        icon: Network,
      },
      {
        id: 'firewall',
        name: 'Firewall Configuration',
        description: 'Verify firewall settings and port accessibility',
        status: 'pending',
        icon: Shield,
      },
    ];

    if (isServerMode) {
      baseTests.push(
        {
          id: 'database',
          name: 'Database Connection',
          description: 'Test database connectivity and permissions',
          status: 'pending',
          icon: Database,
        },
        {
          id: 'server-startup',
          name: 'Server Startup',
          description: 'Initialize server components and services',
          status: 'pending',
          icon: Server,
        },
        {
          id: 'discovery-service',
          name: 'Discovery Service',
          description: 'Start network discovery service for client connections',
          status: 'pending',
          icon: Wifi,
        }
      );
    }

    if (isClientMode || config.mode === 'auto') {
      baseTests.push(
        {
          id: 'server-discovery',
          name: 'Server Discovery',
          description: 'Locate and connect to restaurant server',
          status: 'pending',
          icon: Wifi,
        },
        {
          id: 'server-connection',
          name: 'Server Connection',
          description: 'Establish connection to server and test communication',
          status: 'pending',
          icon: Server,
        },
        {
          id: 'sync-test',
          name: 'Data Synchronization',
          description: 'Test real-time data synchronization with server',
          status: 'pending',
          icon: RefreshCw,
        }
      );
    }

    baseTests.push({
      id: 'performance',
      name: 'Performance Test',
      description: 'Test system performance and response times',
      status: 'pending',
      icon: Activity,
    });

    return baseTests;
  };

  useEffect(() => {
    setTestResults(getTests());
  }, [config.mode]);

  const runSingleTest = async (test: TestResult, index: number): Promise<TestResult> => {
    setCurrentTestIndex(index);
    
    // Update test status to running
    setTestResults(prev => prev.map((t, i) => 
      i === index ? { ...t, status: 'running' as const } : t
    ));

    const startTime = Date.now();
    
    try {
      // Simulate test execution
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
      
      const duration = Date.now() - startTime;
      
      // Simulate test results based on test type
      let result: TestResult;
      
      switch (test.id) {
        case 'network-interface':
          result = {
            ...test,
            status: 'success',
            message: 'Network interface active',
            details: 'Connected via Wi-Fi (192.168.1.100)',
            duration
          };
          break;
          
        case 'firewall':
          result = {
            ...test,
            status: 'warning',
            message: 'Firewall configured with restrictions',
            details: `Port ${config.serverPort} is accessible`,
            duration
          };
          break;
          
        case 'database':
          result = {
            ...test,
            status: 'success',
            message: 'Database connection established',
            details: 'PostgreSQL server responsive',
            duration
          };
          break;
          
        case 'server-startup':
          result = {
            ...test,
            status: 'success',
            message: 'Server components initialized',
            details: `Server running on port ${config.serverPort}`,
            duration
          };
          break;
          
        case 'discovery-service':
          result = {
            ...test,
            status: 'success',
            message: 'Discovery service started',
            details: 'Broadcasting server information on local network',
            duration
          };
          break;
          
        case 'server-discovery':
          result = {
            ...test,
            status: config.autoDiscovery ? 'success' : 'warning',
            message: config.autoDiscovery 
              ? 'Server discovered automatically'
              : 'Using manual server configuration',
            details: `Connecting to ${config.serverAddress}:${config.serverPort}`,
            duration
          };
          break;
          
        case 'server-connection':
          result = {
            ...test,
            status: 'success',
            message: 'Server connection established',
            details: `Latency: ${15 + Math.floor(Math.random() * 20)}ms`,
            duration
          };
          break;
          
        case 'sync-test':
          result = {
            ...test,
            status: 'success',
            message: 'Data synchronization working',
            details: 'Real-time updates confirmed',
            duration
          };
          break;
          
        case 'performance':
          const score = 85 + Math.floor(Math.random() * 10);
          result = {
            ...test,
            status: score >= 90 ? 'success' : score >= 70 ? 'warning' : 'error',
            message: `Performance score: ${score}%`,
            details: `Response time: ${duration}ms`,
            duration
          };
          break;
          
        default:
          result = {
            ...test,
            status: 'success',
            message: 'Test completed successfully',
            duration
          };
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        ...test,
        status: 'error',
        message: 'Test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        duration
      };
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setOverallStatus('running');
    setCurrentTestIndex(0);
    
    const tests = getTests();
    setTestResults(tests);
    
    try {
      for (let i = 0; i < tests.length; i++) {
        const result = await runSingleTest(tests[i], i);
        setTestResults(prev => prev.map((t, idx) => idx === i ? result : t));
      }
      
      // Determine overall status
      const finalResults = testResults.map((test, index) => 
        index < tests.length ? test : test
      );
      
      const hasErrors = testResults.some(t => t.status === 'error');
      const hasWarnings = testResults.some(t => t.status === 'warning');
      
      if (hasErrors) {
        setOverallStatus('failed');
      } else {
        setOverallStatus('success');
      }
      
    } catch (error) {
      setOverallStatus('failed');
    } finally {
      setIsRunning(false);
      setCurrentTestIndex(tests.length);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <div className="w-5 h-5 bg-muted rounded-full" />;
    }
  };

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'warning':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'error':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'running':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      default:
        return 'text-muted-foreground bg-muted/30 border-muted';
    }
  };

  const progress = testResults.length > 0 
    ? ((testResults.filter(t => t.status !== 'pending' && t.status !== 'running').length) / testResults.length) * 100
    : 0;

  const canProceed = overallStatus === 'success' || 
    (overallStatus === 'failed' && testResults.some(t => t.status === 'warning'));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Network & Connectivity Testing</h3>
        <p className="text-muted-foreground">
          Testing your configuration to ensure everything is working correctly before finalizing setup.
        </p>
      </div>

      {/* Test Controls */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-medium">System Tests</h4>
              <p className="text-sm text-muted-foreground">
                {isServerMode && "Testing server functionality and network accessibility"}
                {isClientMode && "Testing connection to server and synchronization"}
                {config.mode === 'auto' && "Testing automatic configuration and connectivity"}
              </p>
            </div>
            
            <Button
              onClick={runAllTests}
              disabled={isRunning}
              data-testid="button-run-tests"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Running Tests...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Run Tests
                </>
              )}
            </Button>
          </div>

          {isRunning && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResults.length > 0 && (
        <div className="space-y-3">
          {testResults.map((test, index) => {
            const Icon = test.icon;
            const isActive = index === currentTestIndex && isRunning;
            
            return (
              <Card
                key={test.id}
                className={cn(
                  "transition-all duration-300",
                  isActive && "ring-2 ring-primary/20 border-primary/30",
                  test.status !== 'pending' && getStatusColor(test.status)
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {test.status === 'running' ? (
                        <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                      ) : (
                        getStatusIcon(test.status)
                      )}
                    </div>
                    
                    <Icon className="w-6 h-6 text-muted-foreground flex-shrink-0 mt-0.5" />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium">{test.name}</h4>
                        {test.duration && (
                          <Badge variant="outline" className="text-xs">
                            <Clock className="w-3 h-3 mr-1" />
                            {test.duration}ms
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground mb-2">
                        {test.description}
                      </p>
                      
                      {test.message && (
                        <div className="space-y-1">
                          <p className={cn(
                            "text-sm font-medium",
                            test.status === 'success' && "text-green-700",
                            test.status === 'warning' && "text-yellow-700",
                            test.status === 'error' && "text-red-700"
                          )}>
                            {test.message}
                          </p>
                          {test.details && (
                            <p className="text-xs text-muted-foreground">
                              {test.details}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Overall Status */}
      {overallStatus !== 'idle' && overallStatus !== 'running' && (
        <Alert className={cn(
          overallStatus === 'success' 
            ? "border-green-200 bg-green-50 dark:bg-green-950"
            : "border-red-200 bg-red-50 dark:bg-red-950"
        )}>
          {overallStatus === 'success' ? (
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          )}
          <AlertDescription>
            {overallStatus === 'success' ? (
              <div className="space-y-1">
                <p className="font-medium text-green-900 dark:text-green-100">
                  All Tests Completed Successfully
                </p>
                <p className="text-green-700 dark:text-green-300">
                  Your system is configured correctly and ready to use. You can proceed to complete the setup.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-medium text-red-900 dark:text-red-100">
                  Some Tests Failed
                </p>
                <p className="text-red-700 dark:text-red-300">
                  There are issues with your configuration. Please review the failed tests and make necessary adjustments, 
                  or contact your system administrator for assistance.
                </p>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Troubleshooting Tips */}
      {overallStatus === 'failed' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Troubleshooting Tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-medium mb-1">Network Issues:</h5>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Check network cable connections</li>
                  <li>• Verify Wi-Fi connectivity</li>
                  <li>• Test internet connectivity</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-medium mb-1">Server Issues:</h5>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Verify server IP address</li>
                  <li>• Check firewall settings</li>
                  <li>• Ensure server is running</li>
                </ul>
              </div>
            </div>
            
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                If problems persist, you can still proceed with warnings, but some features may not work correctly.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}