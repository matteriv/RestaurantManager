/**
 * AutoPrintService - Handles automated printing after payment completion
 * Integrates with existing printer configuration and detection systems
 */

import { apiRequest } from '@/lib/queryClient';

export interface PrintJob {
  id: string;
  type: 'customer_receipt' | 'department_ticket';
  url: string;
  printerName?: string;
  departmentCode?: string;
  priority: number; // 1 = highest (customer), 2 = department tickets
  status: 'pending' | 'printing' | 'success' | 'failed' | 'retry';
  attempts: number;
  maxAttempts: number;
  error?: string;
  createdAt: Date;
  lastAttemptAt?: Date;
}

export interface AutoPrintResult {
  success: boolean;
  printJobs: PrintJob[];
  errors: string[];
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
}

export interface PaymentResponse {
  receiptUrls: {
    printable: string;
    printablePost: string;
  };
  departmentReceiptUrls: Record<string, string>;
  receiptReady: boolean;
}

export interface PrinterConfig {
  terminalId: string;
  printerName: string;
  printerDescription: string;
  isDefault: boolean;
  connectionType: 'local' | 'network' | 'bluetooth';
  isActive: boolean;
}

export class AutoPrintService {
  private static instance: AutoPrintService;
  private printQueue: PrintJob[] = [];
  private isProcessing = false;
  private eventListeners: Map<string, Function[]> = new Map();
  
  // Configuration
  private readonly RETRY_DELAYS = [1000, 3000, 5000]; // ms
  private readonly DEFAULT_MAX_ATTEMPTS = 3;
  private readonly PRINT_TIMEOUT = 30000; // 30 seconds

  private constructor() {
    // Initialize service
    this.setupEventListeners();
  }

  public static getInstance(): AutoPrintService {
    if (!AutoPrintService.instance) {
      AutoPrintService.instance = new AutoPrintService();
    }
    return AutoPrintService.instance;
  }

  /**
   * Main entry point - Process automatic printing after payment
   */
  public async processPaymentPrint(
    terminalId: string,
    paymentResponse: PaymentResponse,
    orderData?: {
      items: any[];
      notes: string;
      subtotal: number;
      tax: number;
      total: number;
    }
  ): Promise<AutoPrintResult> {
    try {
      console.log('🖨️ Starting auto-print process for terminal:', terminalId);
      
      // Get printer configurations for this terminal
      const printerConfigs = await this.getPrinterConfigurations(terminalId);
      
      // Generate print jobs
      const printJobs = await this.generatePrintJobs(
        paymentResponse,
        printerConfigs,
        orderData
      );
      
      // Add jobs to queue and process
      this.addJobsToQueue(printJobs);
      const result = await this.processQueue();
      
      this.emit('auto-print-completed', result);
      
      return result;
    } catch (error) {
      console.error('❌ Auto-print process failed:', error);
      const errorResult: AutoPrintResult = {
        success: false,
        printJobs: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0
      };
      
      this.emit('auto-print-error', errorResult);
      return errorResult;
    }
  }

  /**
   * Generate print jobs from payment response
   */
  private async generatePrintJobs(
    paymentResponse: PaymentResponse,
    printerConfigs: PrinterConfig[],
    orderData?: any
  ): Promise<PrintJob[]> {
    const jobs: PrintJob[] = [];
    
    // Get default customer receipt printer
    const defaultPrinter = printerConfigs.find(p => p.isDefault && p.isActive);
    
    // Customer receipt job (highest priority)
    if (paymentResponse.receiptUrls?.printable && defaultPrinter) {
      jobs.push({
        id: `customer-${Date.now()}`,
        type: 'customer_receipt',
        url: paymentResponse.receiptUrls.printable,
        printerName: defaultPrinter.printerName,
        priority: 1,
        status: 'pending',
        attempts: 0,
        maxAttempts: this.DEFAULT_MAX_ATTEMPTS,
        createdAt: new Date()
      });
    }

    // Department ticket jobs
    if (paymentResponse.departmentReceiptUrls) {
      Object.entries(paymentResponse.departmentReceiptUrls).forEach(([departmentCode, url], index) => {
        // For now, use default printer for department tickets
        // TODO: In future, implement department-specific printer configuration
        if (defaultPrinter) {
          jobs.push({
            id: `department-${departmentCode}-${Date.now()}`,
            type: 'department_ticket',
            url: url,
            printerName: defaultPrinter.printerName,
            departmentCode: departmentCode,
            priority: 2,
            status: 'pending',
            attempts: 0,
            maxAttempts: this.DEFAULT_MAX_ATTEMPTS,
            createdAt: new Date()
          });
        }
      });
    }

    // If no printer configured, create a job for manual printing
    if (jobs.length === 0 && paymentResponse.receiptUrls?.printable) {
      jobs.push({
        id: `manual-${Date.now()}`,
        type: 'customer_receipt',
        url: paymentResponse.receiptUrls.printable,
        printerName: 'browser_default',
        priority: 1,
        status: 'pending',
        attempts: 0,
        maxAttempts: 1,
        createdAt: new Date()
      });
    }

    console.log(`📋 Generated ${jobs.length} print jobs`);
    return jobs;
  }

  /**
   * Add jobs to print queue
   */
  private addJobsToQueue(jobs: PrintJob[]): void {
    this.printQueue.push(...jobs);
    // Sort by priority (1 = highest)
    this.printQueue.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Process the print queue
   */
  private async processQueue(): Promise<AutoPrintResult> {
    if (this.isProcessing) {
      console.log('⏳ Print queue already processing');
      return this.getQueueResult();
    }

    this.isProcessing = true;
    console.log(`🔄 Processing ${this.printQueue.length} print jobs`);

    try {
      // Process jobs in priority order
      for (const job of this.printQueue) {
        if (job.status === 'pending' || job.status === 'retry') {
          await this.processPrintJob(job);
          
          // Small delay between jobs to avoid overwhelming printer
          await this.delay(500);
        }
      }

      const result = this.getQueueResult();
      
      // Clear completed jobs from queue
      this.printQueue = this.printQueue.filter(job => 
        job.status === 'pending' || job.status === 'retry'
      );
      
      return result;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single print job
   */
  private async processPrintJob(job: PrintJob): Promise<void> {
    job.status = 'printing';
    job.attempts++;
    job.lastAttemptAt = new Date();
    
    this.emit('print-job-started', job);
    
    try {
      console.log(`🖨️ Printing job ${job.id} on ${job.printerName} (attempt ${job.attempts})`);
      
      if (job.printerName === 'browser_default') {
        // Use browser printing for manual fallback
        await this.printWithBrowser(job.url);
      } else if (job.printerName) {
        // Use system printer
        await this.printWithSystemPrinter(job.url, job.printerName);
      } else {
        throw new Error('No printer specified for print job');
      }
      
      job.status = 'success';
      console.log(`✅ Print job ${job.id} completed successfully`);
      this.emit('print-job-success', job);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown print error';
      job.error = errorMessage;
      
      console.error(`❌ Print job ${job.id} failed (attempt ${job.attempts}):`, errorMessage);
      
      // Determine if we should retry
      if (job.attempts < job.maxAttempts) {
        job.status = 'retry';
        console.log(`🔄 Will retry job ${job.id} in ${this.RETRY_DELAYS[job.attempts - 1] || 5000}ms`);
        
        // Schedule retry
        setTimeout(() => {
          if (job.status === 'retry') {
            this.processPrintJob(job);
          }
        }, this.RETRY_DELAYS[job.attempts - 1] || 5000);
        
        this.emit('print-job-retry', job);
      } else {
        job.status = 'failed';
        console.error(`💥 Print job ${job.id} failed permanently after ${job.attempts} attempts`);
        this.emit('print-job-failed', job);
      }
    }
  }

  /**
   * Print using browser window (fallback method)
   */
  private async printWithBrowser(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const printWindow = window.open(url, '_blank', 'width=800,height=600');
      
      if (!printWindow) {
        reject(new Error('Failed to open print window - popup blocked?'));
        return;
      }

      const timeout = setTimeout(() => {
        printWindow.close();
        reject(new Error('Print timeout - window did not load in time'));
      }, this.PRINT_TIMEOUT);

      printWindow.addEventListener('load', () => {
        clearTimeout(timeout);
        
        // Wait a bit for content to render, then print
        setTimeout(() => {
          try {
            printWindow.print();
            
            // Close window after printing
            setTimeout(() => {
              printWindow.close();
              resolve();
            }, 1000);
          } catch (error) {
            printWindow.close();
            reject(new Error('Failed to execute print command'));
          }
        }, 500);
      });

      printWindow.addEventListener('error', () => {
        clearTimeout(timeout);
        printWindow.close();
        reject(new Error('Failed to load print content'));
      });
    });
  }

  /**
   * Print using system printer (via API)
   */
  private async printWithSystemPrinter(url: string, printerName: string): Promise<void> {
    try {
      // Call backend print API
      const response = await apiRequest('POST', '/api/print/direct', {
        url: url,
        printerName: printerName,
        copies: 1,
        silent: true
      });

      if (!response.ok) {
        throw new Error(`Print API returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Print failed on server');
      }
      
      console.log('✅ System print completed:', result);
    } catch (error) {
      console.error('❌ System print failed:', error);
      // Fallback to browser printing
      await this.printWithBrowser(url);
    }
  }

  /**
   * Get printer configurations for terminal
   */
  private async getPrinterConfigurations(terminalId: string): Promise<PrinterConfig[]> {
    try {
      const response = await apiRequest('GET', `/api/printers/terminals?posTerminalId=${terminalId}`);
      
      if (response.ok) {
        return await response.json();
      } else {
        console.warn('No printer configurations found for terminal:', terminalId);
        return [];
      }
    } catch (error) {
      console.error('Failed to get printer configurations:', error);
      return [];
    }
  }

  /**
   * Get current queue processing result
   */
  private getQueueResult(): AutoPrintResult {
    const totalJobs = this.printQueue.length;
    const successfulJobs = this.printQueue.filter(job => job.status === 'success').length;
    const failedJobs = this.printQueue.filter(job => job.status === 'failed').length;
    const errors = this.printQueue
      .filter(job => job.status === 'failed' && job.error)
      .map(job => job.error!);

    return {
      success: failedJobs === 0 && totalJobs > 0,
      printJobs: [...this.printQueue],
      errors,
      totalJobs,
      successfulJobs,
      failedJobs
    };
  }

  /**
   * Manually retry failed jobs
   */
  public async retryFailedJobs(): Promise<AutoPrintResult> {
    const failedJobs = this.printQueue.filter(job => job.status === 'failed');
    
    if (failedJobs.length === 0) {
      return this.getQueueResult();
    }

    console.log(`🔄 Manually retrying ${failedJobs.length} failed print jobs`);
    
    // Reset failed jobs to retry
    failedJobs.forEach(job => {
      job.status = 'retry';
      job.attempts = 0; // Reset attempt count for manual retry
      job.error = undefined;
    });

    return await this.processQueue();
  }

  /**
   * Event system for UI feedback
   */
  public on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  public off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  private setupEventListeners(): void {
    // Setup global error handlers, connectivity checks, etc.
    window.addEventListener('online', () => {
      console.log('🌐 Connection restored - processing pending print jobs');
      this.processQueue();
    });
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current queue status
   */
  public getQueueStatus(): {
    total: number;
    pending: number;
    printing: number;
    success: number;
    failed: number;
    retry: number;
  } {
    return {
      total: this.printQueue.length,
      pending: this.printQueue.filter(j => j.status === 'pending').length,
      printing: this.printQueue.filter(j => j.status === 'printing').length,
      success: this.printQueue.filter(j => j.status === 'success').length,
      failed: this.printQueue.filter(j => j.status === 'failed').length,
      retry: this.printQueue.filter(j => j.status === 'retry').length,
    };
  }

  /**
   * Clear all completed jobs from queue
   */
  public clearCompletedJobs(): void {
    this.printQueue = this.printQueue.filter(job => 
      job.status !== 'success' && job.status !== 'failed'
    );
  }
}

// Export singleton instance
export const autoPrintService = AutoPrintService.getInstance();