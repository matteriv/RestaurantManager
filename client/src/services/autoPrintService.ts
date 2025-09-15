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
  errorType?: 'network' | 'printer' | 'timeout' | 'browser' | 'unknown';
  usedFallback?: boolean;
  networkAttempts?: number;
  fallbackAttempts?: number;
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
  private readonly NETWORK_TIMEOUT = 15000; // 15 seconds for network printing
  private readonly BROWSER_TIMEOUT = 30000; // 30 seconds for browser printing
  private readonly MAX_NETWORK_ATTEMPTS = 2; // Try network first, then fallback
  private readonly MAX_FALLBACK_ATTEMPTS = 1; // Browser fallback attempts

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
        usedFallback: false,
        networkAttempts: 0,
        fallbackAttempts: 0,
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
            usedFallback: false,
            networkAttempts: 0,
            fallbackAttempts: 0,
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
        usedFallback: true,
        networkAttempts: 0,
        fallbackAttempts: 0,
        createdAt: new Date()
      });
    }

    // Enhanced logging for multi-department tickets
    const customerJobs = jobs.filter(job => job.type === 'customer_receipt');
    const departmentJobs = jobs.filter(job => job.type === 'department_ticket');
    
    console.log(`📋 Generated ${jobs.length} print jobs:`);
    console.log(`  → ${customerJobs.length} customer receipt(s)`);
    console.log(`  → ${departmentJobs.length} department ticket(s)${departmentJobs.length > 0 ? ' for: ' + departmentJobs.map(job => job.departmentCode).join(', ') : ''}`);
    
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
   * Process the print queue with smart batch printing
   */
  private async processQueue(): Promise<AutoPrintResult> {
    if (this.isProcessing) {
      console.log('⏳ Print queue already processing');
      return this.getQueueResult();
    }

    this.isProcessing = true;
    console.log(`🔄 Processing ${this.printQueue.length} print jobs`);

    try {
      // Group jobs by printer for batch printing
      const jobsByPrinter = this.groupJobsByPrinter();
      
      for (const [printerName, jobs] of Array.from(jobsByPrinter.entries())) {
        const pendingJobs = jobs.filter(job => job.status === 'pending' || job.status === 'retry');
        
        if (pendingJobs.length === 0) continue;
        
        if (pendingJobs.length === 1) {
          // Single job - use normal processing
          await this.processPrintJob(pendingJobs[0]);
        } else {
          // Multiple jobs for same printer - use batch printing
          console.log(`📄 Batch printing ${pendingJobs.length} jobs to ${printerName}`);
          await this.processBatchPrintJobs(printerName, pendingJobs);
        }
        
        // Small delay between printers to avoid overwhelming system
        await this.delay(300);
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
   * Group print jobs by printer name for batch processing
   */
  private groupJobsByPrinter(): Map<string, PrintJob[]> {
    const jobsByPrinter = new Map<string, PrintJob[]>();
    
    // Sort jobs by priority first
    const sortedJobs = [...this.printQueue].sort((a, b) => a.priority - b.priority);
    
    for (const job of sortedJobs) {
      const printerName = job.printerName || 'browser_default';
      
      if (!jobsByPrinter.has(printerName)) {
        jobsByPrinter.set(printerName, []);
      }
      jobsByPrinter.get(printerName)!.push(job);
    }
    
    return jobsByPrinter;
  }

  /**
   * Process multiple jobs as a single batch print
   */
  private async processBatchPrintJobs(printerName: string, jobs: PrintJob[]): Promise<void> {
    try {
      console.log(`🖨️ Starting batch print: ${jobs.length} documents to ${printerName}`);
      
      // Mark all jobs as printing
      jobs.forEach(job => {
        job.status = 'printing';
        job.attempts++;
        job.lastAttemptAt = new Date();
        this.emit('print-job-started', job);
      });

      // Extract URLs and check if we can batch print
      // All jobs can be batched if they have a printer name and haven't used fallback yet
      const canBatchPrint = jobs.every(job => 
        job.printerName && 
        !job.usedFallback
      );

      if (canBatchPrint) {
        // Use batch print API for all printer types (network, CUPS, and browser)
        const urls = jobs.map(job => job.url);
        
        try {
          console.log(`🖨️ Sending batch print request: ${urls.length} URLs to ${printerName} (${printerName === 'browser_default' ? 'browser printing' : 'network/CUPS printing'})`);
          
          const response = await apiRequest('POST', '/api/print/batch', {
            urls: urls,
            printerName: printerName,
            copies: 1,
            silent: true
          });
          
          const result = await response.json();
          
          if (result.success) {
            // Mark all jobs as successful
            jobs.forEach(job => {
              job.status = 'success';
              console.log(`✅ Batch print job ${job.id} completed successfully`);
              this.emit('print-job-success', job);
            });
            
            console.log(`✅ Batch print completed: ${jobs.length} documents printed to ${printerName}`);
            return;
          } else {
            throw new Error(result.error || 'Batch print failed on server');
          }
          
        } catch (batchError) {
          console.warn(`❌ Batch print failed, falling back to individual jobs:`, batchError);
          
          // Fall back to individual job processing
          for (const job of jobs) {
            job.status = 'pending'; // Reset status
            job.attempts--; // Reset attempt count
            await this.processPrintJob(job);
            await this.delay(300); // Small delay between individual jobs
          }
          return;
        }
      } else {
        // Use browser printing for fallback jobs
        console.log(`🌐 Using browser printing for ${jobs.length} jobs`);
        
        for (const job of jobs) {
          try {
            job.usedFallback = true;
            job.fallbackAttempts = (job.fallbackAttempts || 0) + 1;
            
            await this.printWithBrowser(job.url, job);
            
            job.status = 'success';
            console.log(`✅ Browser print job ${job.id} completed successfully`);
            this.emit('print-job-success', job);
            
            // Small delay between browser prints to avoid conflicts
            await this.delay(800);
            
          } catch (error) {
            await this.handlePrintJobError(job, error);
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Batch print processing failed:`, error);
      
      // Handle error for all jobs
      for (const job of jobs) {
        await this.handlePrintJobError(job, error);
      }
    }
  }

  /**
   * Process a single print job with automatic fallback
   */
  private async processPrintJob(job: PrintJob): Promise<void> {
    job.status = 'printing';
    job.attempts++;
    job.lastAttemptAt = new Date();
    
    this.emit('print-job-started', job);
    
    try {
      console.log(`🖨️ Processing print job ${job.id} (attempt ${job.attempts})`);
      
      if (job.printerName === 'browser_default' || job.usedFallback) {
        // Use browser printing (fallback or direct)
        job.fallbackAttempts = (job.fallbackAttempts || 0) + 1;
        console.log(`🌐 Using browser fallback for job ${job.id} (fallback attempt ${job.fallbackAttempts})`);
        await this.printWithBrowser(job.url, job);
        job.usedFallback = true;
        job.errorType = undefined; // Clear error type on success
      } else if (job.printerName && !job.usedFallback) {
        // Try network printer first
        job.networkAttempts = (job.networkAttempts || 0) + 1;
        console.log(`🖨️ Attempting network print on ${job.printerName} (network attempt ${job.networkAttempts}/${this.MAX_NETWORK_ATTEMPTS})`);
        await this.printWithSystemPrinterEnhanced(job.url, job.printerName, job);
      } else {
        throw new Error('No printer specified for print job');
      }
      
      job.status = 'success';
      const printMethod = job.usedFallback ? 'browser fallback' : `network printer ${job.printerName}`;
      console.log(`✅ Print job ${job.id} completed successfully using ${printMethod}`);
      this.emit('print-job-success', job);
      
    } catch (error) {
      await this.handlePrintJobError(job, error);
    }
  }

  /**
   * Enhanced browser printing with better error handling and UI feedback
   */
  private async printWithBrowser(url: string, job: PrintJob): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🌐 Opening browser print window for ${job.type}: ${url}`);
      
      // Enhanced window features for better printing
      const windowFeatures = [
        'width=800',
        'height=600',
        'scrollbars=yes',
        'resizable=yes',
        'toolbar=no',
        'menubar=no',
        'location=no',
        'directories=no',
        'status=no'
      ].join(',');
      
      const printWindow = window.open(url, `print-${job.id}`, windowFeatures);
      
      if (!printWindow) {
        const error = new Error('Failed to open print window - popup may be blocked by browser');
        job.errorType = 'browser';
        reject(error);
        return;
      }

      const timeout = setTimeout(() => {
        printWindow.close();
        const error = new Error(`Browser print timeout after ${this.BROWSER_TIMEOUT}ms`);
        job.errorType = 'timeout';
        reject(error);
      }, this.BROWSER_TIMEOUT);

      // Enhanced loading handling
      printWindow.addEventListener('load', () => {
        clearTimeout(timeout);
        console.log(`📄 Print content loaded for job ${job.id}`);
        
        // Add print styles if needed
        try {
          const printDoc = printWindow.document;
          if (printDoc && printDoc.head) {
            const printStyles = printDoc.createElement('style');
            printStyles.textContent = `
              @media print {
                body { margin: 0; font-family: monospace; }
                .no-print { display: none !important; }
                .print-break { page-break-after: always; }
              }
            `;
            printDoc.head.appendChild(printStyles);
          }
        } catch (styleError) {
          console.warn('Could not add print styles:', styleError);
        }
        
        // Wait for content to render, then print
        setTimeout(() => {
          try {
            console.log(`🖨️ Executing browser print for job ${job.id}`);
            printWindow.print();
            
            // Emit event for UI feedback
            this.emit('browser-print-started', { job, method: 'browser' });
            
            // Close window after printing with a delay
            setTimeout(() => {
              printWindow.close();
              console.log(`✅ Browser print completed for job ${job.id}`);
              resolve();
            }, 1500); // Increased delay for print dialog
            
          } catch (printError) {
            printWindow.close();
            const error = new Error('Failed to execute browser print command');
            job.errorType = 'browser';
            reject(error);
          }
        }, 800); // Increased wait time for better rendering
      });

      printWindow.addEventListener('error', (event) => {
        clearTimeout(timeout);
        printWindow.close();
        console.error('Browser print window error:', event);
        const error = new Error('Failed to load print content in browser');
        job.errorType = 'browser';
        reject(error);
      });
      
      // Handle window close before print completes
      printWindow.addEventListener('beforeunload', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Enhanced system printer with better error categorization
   */
  private async printWithSystemPrinterEnhanced(url: string, printerName: string, job: PrintJob): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.NETWORK_TIMEOUT);
    
    try {
      console.log(`🖨️ Sending print request to ${printerName} for job ${job.id}`);
      
      // Call backend print API with timeout
      const response = await apiRequest('POST', '/api/print/direct', {
        url: url,
        printerName: printerName,
        copies: 1,
        silent: true
      }, controller.signal);

      const result = await response.json();
      clearTimeout(timeoutId);
      
      if (!result.success) {
        // Categorize printer-specific errors
        if (result.error?.includes('offline') || result.error?.includes('unreachable')) {
          job.errorType = 'printer';
        } else if (result.error?.includes('timeout')) {
          job.errorType = 'timeout';
        } else {
          job.errorType = 'printer';
        }
        
        throw new Error(result.error || 'Print failed on server');
      }
      
      console.log(`✅ Network print completed for job ${job.id}:`, result);
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Check if this was an abort (timeout)
      if (error.name === 'AbortError' || error.message?.includes('abort') || error.message?.includes('signal')) {
        job.errorType = 'timeout';
        throw new Error(`Network timeout after ${this.NETWORK_TIMEOUT}ms`);
      }
      
      // If no error type set, determine from error message
      if (!job.errorType) {
        const errorMsg = error.message?.toLowerCase() || '';
        if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
          job.errorType = 'network';
        } else if (errorMsg.includes('timeout')) {
          job.errorType = 'timeout';
        } else {
          job.errorType = 'printer';
        }
      }
      
      console.error(`❌ Network print failed for job ${job.id}:`, error);
      throw error; // Re-throw to be handled by processPrintJob
    }
  }

  /**
   * Handle print job errors with intelligent fallback logic
   */
  private async handlePrintJobError(job: PrintJob, error: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown print error';
    job.error = errorMessage;
    
    console.error(`❌ Print job ${job.id} failed (attempt ${job.attempts}):`, errorMessage);
    
    // Determine if we should try fallback or retry
    const shouldUseFallback = this.shouldUseFallback(job, error);
    
    if (shouldUseFallback && !job.usedFallback) {
      // Try browser fallback
      console.log(`🔄 Attempting browser fallback for job ${job.id}`);
      
      try {
        job.usedFallback = true;
        job.fallbackAttempts = (job.fallbackAttempts || 0) + 1;
        job.status = 'printing';
        
        this.emit('print-fallback-started', { job, reason: job.errorType || 'network_error' });
        
        await this.printWithBrowser(job.url, job);
        
        job.status = 'success';
        console.log(`✅ Print job ${job.id} completed successfully using browser fallback`);
        this.emit('print-job-success', job);
        return;
        
      } catch (fallbackError) {
        console.error(`❌ Browser fallback also failed for job ${job.id}:`, fallbackError);
        job.error = `Network failed: ${errorMessage}; Browser fallback failed: ${fallbackError.message}`;
        job.errorType = 'browser';
      }
    }
    
    // Determine if we should retry (without fallback) or fail permanently
    if (job.attempts < job.maxAttempts && this.shouldRetryJob(job)) {
      job.status = 'retry';
      const retryDelay = this.RETRY_DELAYS[job.attempts - 1] || 5000;
      console.log(`🔄 Will retry job ${job.id} in ${retryDelay}ms`);
      
      // Schedule retry
      setTimeout(() => {
        if (job.status === 'retry') {
          this.processPrintJob(job);
        }
      }, retryDelay);
      
      this.emit('print-job-retry', job);
    } else {
      job.status = 'failed';
      console.error(`💥 Print job ${job.id} failed permanently after ${job.attempts} attempts`);
      
      // Emit detailed failure event
      this.emit('print-job-failed', {
        ...job,
        finalError: job.error,
        triedFallback: job.usedFallback,
        networkAttempts: job.networkAttempts || 0,
        fallbackAttempts: job.fallbackAttempts || 0
      });
    }
  }

  /**
   * Determine if we should use browser fallback based on error type and job state
   */
  private shouldUseFallback(job: PrintJob, error: any): boolean {
    // Don't fallback if already used fallback
    if (job.usedFallback) {
      return false;
    }
    
    // Don't fallback if this was already a browser job
    if (job.printerName === 'browser_default') {
      return false;
    }
    
    // Only fallback for network/printer/timeout errors after exhausting network attempts
    if (['network', 'printer', 'timeout'].includes(job.errorType || '')) {
      const networkAttempts = job.networkAttempts || 0;
      return networkAttempts >= this.MAX_NETWORK_ATTEMPTS;
    }
    
    // Check if error suggests network/printer issue and we've exhausted network attempts
    const errorMsg = error?.message?.toLowerCase() || '';
    const networkErrorKeywords = [
      'network', 'timeout', 'offline', 'unreachable', 
      'connection', 'fetch', 'cors', '404', '500', '503'
    ];
    
    const hasNetworkError = networkErrorKeywords.some(keyword => errorMsg.includes(keyword));
    if (hasNetworkError) {
      const networkAttempts = job.networkAttempts || 0;
      return networkAttempts >= this.MAX_NETWORK_ATTEMPTS;
    }
    
    return false;
  }

  /**
   * Determine if job should be retried (not counting fallback attempts)
   */
  private shouldRetryJob(job: PrintJob): boolean {
    // Don't retry browser errors
    if (job.errorType === 'browser') {
      return false;
    }
    
    // Retry network/timeout errors a limited number of times
    if (['network', 'timeout'].includes(job.errorType || '')) {
      const maxNetworkRetries = job.usedFallback ? 1 : this.MAX_NETWORK_ATTEMPTS;
      return (job.networkAttempts || 0) < maxNetworkRetries;
    }
    
    // Retry printer errors once
    if (job.errorType === 'printer') {
      return (job.networkAttempts || 0) < 1;
    }
    
    // Default retry logic
    return true;
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
  /**
   * Enhanced event system for detailed print tracking
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