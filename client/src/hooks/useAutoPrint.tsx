/**
 * useAutoPrint Hook - React integration for AutoPrintService
 * Provides state management and UI integration for automated printing
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { 
  autoPrintService, 
  type AutoPrintResult, 
  type PrintJob, 
  type PaymentResponse 
} from '@/services/autoPrintService';

export interface AutoPrintState {
  isProcessing: boolean;
  printJobs: PrintJob[];
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  errors: string[];
  lastResult?: AutoPrintResult;
  canRetry: boolean;
}

export interface AutoPrintActions {
  processPaymentPrint: (
    terminalId: string,
    paymentResponse: PaymentResponse,
    orderData?: any
  ) => Promise<AutoPrintResult>;
  retryFailedJobs: () => Promise<AutoPrintResult>;
  clearCompletedJobs: () => void;
  getQueueStatus: () => {
    total: number;
    pending: number;
    printing: number;
    success: number;
    failed: number;
    retry: number;
  };
}

export interface UseAutoPrintOptions {
  showToastNotifications?: boolean;
  autoRetryOnError?: boolean;
  retryDelay?: number;
  maxNotificationHistory?: number;
}

export interface UseAutoPrintReturn {
  state: AutoPrintState;
  actions: AutoPrintActions;
  isEnabled: boolean;
  enableAutoPrint: () => void;
  disableAutoPrint: () => void;
}

const DEFAULT_OPTIONS: Required<UseAutoPrintOptions> = {
  showToastNotifications: true,
  autoRetryOnError: false,
  retryDelay: 3000,
  maxNotificationHistory: 10,
};

export function useAutoPrint(options: UseAutoPrintOptions = {}): UseAutoPrintReturn {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { toast } = useToast();
  
  // State management
  const [state, setState] = useState<AutoPrintState>({
    isProcessing: false,
    printJobs: [],
    totalJobs: 0,
    successfulJobs: 0,
    failedJobs: 0,
    errors: [],
    canRetry: false,
  });

  // Auto-print enabled/disabled state
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    // Get from localStorage or default to true
    const stored = localStorage.getItem('auto-print-enabled');
    return stored !== null ? JSON.parse(stored) : true;
  });

  // Refs for cleanup and avoiding stale closures
  const eventListenersRef = useRef<Array<{ event: string; handler: Function }>>([]);
  const notificationHistoryRef = useRef<string[]>([]);

  // Save enabled state to localStorage
  useEffect(() => {
    localStorage.setItem('auto-print-enabled', JSON.stringify(isEnabled));
  }, [isEnabled]);

  // Setup event listeners for AutoPrintService
  useEffect(() => {
    const eventHandlers = [
      {
        event: 'auto-print-completed',
        handler: (result: AutoPrintResult) => {
          console.log('🖨️ Auto-print completed:', result);
          updateStateFromResult(result);
          
          if (opts.showToastNotifications) {
            if (result.success) {
              // Count how many used fallback
              const fallbackJobs = result.printJobs?.filter(job => job.usedFallback)?.length || 0;
              const networkJobs = result.successfulJobs - fallbackJobs;
              
              let description = `${result.successfulJobs}/${result.totalJobs} stampe completate`;
              if (fallbackJobs > 0 && networkJobs > 0) {
                description += ` (${networkJobs} rete, ${fallbackJobs} browser)`;
              } else if (fallbackJobs > 0) {
                description += ` tramite browser`;
              } else {
                description += ` tramite rete`;
              }
              
              toast({
                title: "Stampa completata",
                description,
              });
            } else {
              const failedAfterFallback = result.printJobs?.filter(job => 
                job.status === 'failed' && job.usedFallback
              )?.length || 0;
              
              let description = `${result.failedJobs}/${result.totalJobs} stampe fallite`;
              if (failedAfterFallback > 0) {
                description += ` (anche con browser fallback)`;
              }
              description += `. Clicca per riprovare.`;
              
              toast({
                title: "Errore stampa",
                description,
                variant: "destructive",
                action: result.failedJobs > 0 ? (
                  <ToastAction altText="Riprova stampe fallite" onClick={async () => {
                    await retryFailedJobs();
                  }}>
                    Riprova
                  </ToastAction>
                ) : undefined,
              });
            }
          }
        }
      },
      {
        event: 'auto-print-error',
        handler: (result: AutoPrintResult) => {
          console.error('❌ Auto-print error:', result);
          updateStateFromResult(result);
          
          if (opts.showToastNotifications) {
            toast({
              title: "Errore stampa automatica",
              description: result.errors[0] || "Errore sconosciuto durante la stampa",
              variant: "destructive",
            });
          }
        }
      },
      {
        event: 'print-job-started',
        handler: (job: PrintJob) => {
          console.log('🔄 Print job started:', job.id);
          updatePrintJobInState(job);
          
          if (opts.showToastNotifications) {
            const jobType = job.type === 'receipt' 
              ? 'scontrino cliente'
              : `ticket ${job.departmentCode}`;
              
            const method = job.printerName === 'browser_default' || job.usedFallback 
              ? 'browser'
              : `stampante ${job.printerName}`;
              
            const message = `Stampando ${jobType} tramite ${method}...`;
            
            // Only show if this notification hasn't been shown recently
            if (!notificationHistoryRef.current.includes(job.id)) {
              toast({
                title: "Stampa in corso",
                description: message,
                duration: 2000,
              });
              
              // Add to history and limit size
              notificationHistoryRef.current.push(job.id);
              if (notificationHistoryRef.current.length > opts.maxNotificationHistory) {
                notificationHistoryRef.current.shift();
              }
            }
          }
        }
      },
      {
        event: 'print-job-success',
        handler: (job: PrintJob) => {
          console.log('✅ Print job success:', job.id);
          updatePrintJobInState(job);
        }
      },
      {
        event: 'print-job-failed',
        handler: (jobData: any) => {
          console.error('💥 Print job failed:', jobData.id, jobData.finalError);
          updatePrintJobInState(jobData);
          
          if (opts.showToastNotifications) {
            const jobType = jobData.type === 'receipt' 
              ? 'scontrino cliente'
              : `ticket ${jobData.departmentCode}`;
              
            const fallbackInfo = jobData.triedFallback 
              ? ` (tentato anche browser fallback)`
              : ` (prova manuale con browser)`;
              
            const errorSummary = jobData.networkAttempts > 0 && jobData.fallbackAttempts > 0
              ? `Falliti ${jobData.networkAttempts} tentativi di rete e ${jobData.fallbackAttempts} browser`
              : jobData.networkAttempts > 0 
              ? `Falliti ${jobData.networkAttempts} tentativi di rete`
              : 'Stampa fallita';
            
            toast({
              title: `Errore stampa ${jobType}`,
              description: `${errorSummary}${fallbackInfo}`,
              variant: "destructive",
              duration: 6000,
              action: (
                <ToastAction altText="Riprova stampa" onClick={async () => {
                  await retryFailedJobs();
                }}>
                  Riprova
                </ToastAction>
              ),
            });
          }
        }
      },
      {
        event: 'print-job-retry',
        handler: (job: PrintJob) => {
          console.log('🔄 Print job retrying:', job.id);
          updatePrintJobInState(job);
          
          if (opts.showToastNotifications) {
            const retryReason = job.errorType === 'network' ? 'connessione di rete'
              : job.errorType === 'printer' ? 'stampante'
              : job.errorType === 'timeout' ? 'timeout'
              : 'errore sconosciuto';
                
            toast({
              title: "Ritentativo stampa",
              description: `Ritentativo ${job.attempts}/${job.maxAttempts} per ${retryReason}...`,
              duration: 2000,
            });
          }
        }
      },
      {
        event: 'print-fallback-started',
        handler: (data: { job: PrintJob; reason: string }) => {
          console.log('🌐 Print fallback started:', data.job.id, 'reason:', data.reason);
          updatePrintJobInState(data.job);
          
          if (opts.showToastNotifications) {
            const reasonText = data.reason === 'network' ? 'errore di rete'
              : data.reason === 'printer' ? 'stampante offline'
              : data.reason === 'timeout' ? 'timeout connessione'
              : 'errore di sistema';
              
            const jobType = data.job.type === 'receipt' 
              ? 'scontrino cliente' 
              : `ticket ${data.job.departmentCode}`;
              
            toast({
              title: "Stampa con browser",
              description: `${reasonText.charAt(0).toUpperCase() + reasonText.slice(1)} - usando stampa browser per ${jobType}`,
              duration: 3000,
            });
          }
        }
      },
      {
        event: 'browser-print-started',
        handler: (data: { job: PrintJob; method: string }) => {
          console.log('🖨️ Browser print started:', data.job.id);
          
          if (opts.showToastNotifications && !notificationHistoryRef.current.includes(`browser-${data.job.id}`)) {
            const jobType = data.job.type === 'receipt' 
              ? 'scontrino cliente' 
              : `ticket ${data.job.departmentCode}`;
              
            toast({
              title: "Finestra stampa aperta",
              description: `Controlla la finestra popup per stampare il ${jobType}`,
              duration: 4000,
            });
            
            // Add to notification history
            notificationHistoryRef.current.push(`browser-${data.job.id}`);
            if (notificationHistoryRef.current.length > opts.maxNotificationHistory) {
              notificationHistoryRef.current.shift();
            }
          }
        }
      }
    ];

    // Register all event listeners
    eventHandlers.forEach(({ event, handler }) => {
      autoPrintService.on(event, handler);
      eventListenersRef.current.push({ event, handler });
    });

    // Cleanup function
    return () => {
      eventListenersRef.current.forEach(({ event, handler }) => {
        autoPrintService.off(event, handler);
      });
      eventListenersRef.current = [];
    };
  }, [opts.showToastNotifications, opts.maxNotificationHistory, toast]);

  // Update state from AutoPrintResult
  const updateStateFromResult = useCallback((result: AutoPrintResult) => {
    setState(prevState => ({
      ...prevState,
      isProcessing: false,
      printJobs: result.printJobs,
      totalJobs: result.totalJobs,
      successfulJobs: result.successfulJobs,
      failedJobs: result.failedJobs,
      errors: result.errors,
      lastResult: result,
      canRetry: result.failedJobs > 0,
    }));
  }, []);

  // Update individual print job in state
  const updatePrintJobInState = useCallback((updatedJob: PrintJob) => {
    setState(prevState => ({
      ...prevState,
      isProcessing: updatedJob.status === 'printing',
      printJobs: prevState.printJobs.map(job => 
        job.id === updatedJob.id ? updatedJob : job
      ),
    }));
  }, []);

  // Actions
  const processPaymentPrint = useCallback(async (
    terminalId: string,
    paymentResponse: PaymentResponse,
    orderData?: any
  ): Promise<AutoPrintResult> => {
    if (!isEnabled) {
      console.log('🖨️ Auto-print disabled, skipping');
      return {
        success: true,
        printJobs: [],
        errors: [],
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
      };
    }

    setState(prevState => ({
      ...prevState,
      isProcessing: true,
      errors: [],
    }));

    try {
      const result = await autoPrintService.processPaymentPrint(
        terminalId,
        paymentResponse,
        orderData
      );

      // Auto-retry on error if enabled
      if (!result.success && opts.autoRetryOnError && result.failedJobs > 0) {
        setTimeout(() => {
          console.log('🔄 Auto-retrying failed print jobs...');
          retryFailedJobs();
        }, opts.retryDelay);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Failed to process payment print:', error);
      
      setState(prevState => ({
        ...prevState,
        isProcessing: false,
        errors: [errorMessage],
      }));

      if (opts.showToastNotifications) {
        toast({
          title: "Errore processo stampa",
          description: errorMessage,
          variant: "destructive",
        });
      }

      throw error;
    }
  }, [isEnabled, opts.autoRetryOnError, opts.retryDelay, toast, opts.showToastNotifications]);

  const retryFailedJobs = useCallback(async (): Promise<AutoPrintResult> => {
    setState(prevState => ({
      ...prevState,
      isProcessing: true,
    }));

    try {
      const result = await autoPrintService.retryFailedJobs();
      
      if (opts.showToastNotifications) {
        if (result.success) {
          toast({
            title: "Stampe completate",
            description: "Tutte le stampe sono state completate con successo",
          });
        } else {
          toast({
            title: "Alcune stampe ancora fallite",
            description: `${result.failedJobs} stampe necessitano ancora di attenzione`,
            variant: "destructive",
          });
        }
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Failed to retry print jobs:', error);
      
      setState(prevState => ({
        ...prevState,
        isProcessing: false,
        errors: [...prevState.errors, errorMessage],
      }));

      if (opts.showToastNotifications) {
        toast({
          title: "Errore ritentativo",
          description: errorMessage,
          variant: "destructive",
        });
      }

      throw error;
    }
  }, [opts.showToastNotifications, toast]);

  const clearCompletedJobs = useCallback(() => {
    autoPrintService.clearCompletedJobs();
    setState(prevState => ({
      ...prevState,
      printJobs: prevState.printJobs.filter(job => 
        job.status !== 'success' && job.status !== 'failed'
      ),
      canRetry: false,
    }));
  }, []);

  const getQueueStatus = useCallback(() => {
    return autoPrintService.getQueueStatus();
  }, []);

  const enableAutoPrint = useCallback(() => {
    setIsEnabled(true);
    if (opts.showToastNotifications) {
      toast({
        title: "Stampa automatica attivata",
        description: "Gli scontrini verranno stampati automaticamente dopo il pagamento",
      });
    }
  }, [opts.showToastNotifications, toast]);

  const disableAutoPrint = useCallback(() => {
    setIsEnabled(false);
    if (opts.showToastNotifications) {
      toast({
        title: "Stampa automatica disattivata",
        description: "Dovrai stampare manualmente gli scontrini",
        variant: "destructive",
      });
    }
  }, [opts.showToastNotifications, toast]);

  return {
    state,
    actions: {
      processPaymentPrint,
      retryFailedJobs,
      clearCompletedJobs,
      getQueueStatus,
    },
    isEnabled,
    enableAutoPrint,
    disableAutoPrint,
  };
}

// Helper hook for simple auto-print status checking
export function useAutoPrintStatus() {
  const { state, isEnabled } = useAutoPrint({ showToastNotifications: false });
  
  return {
    isProcessing: state.isProcessing,
    hasFailedJobs: state.failedJobs > 0,
    canRetry: state.canRetry,
    isEnabled,
    totalJobs: state.totalJobs,
    successfulJobs: state.successfulJobs,
    failedJobs: state.failedJobs,
  };
}