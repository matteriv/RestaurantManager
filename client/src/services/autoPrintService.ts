/**
 * AutoPrintService - Handles automated printing after payment completion
 * Integrates with existing printer configuration and detection systems
 */

import { apiRequest } from '@/lib/queryClient';

export interface PrintJob {
  id: string;
  type: 'batch_print'; // Changed to support batch printing
  urls: string[]; // Array of URLs to print in batch
  urlTypes: Array<'customer_receipt' | 'department_ticket'>; // Types for each URL
  departmentCodes: Array<string | null>; // Department codes for each URL (null for customer receipt)
  printerName?: string;
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
  // Additional batch-specific properties
  totalUrls: number;
  successfulUrls?: number;
  failedUrls?: number;
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

export interface DefaultPrinterResponse {
  defaultPrinter: string | null;
  available: boolean;
  message: string;
  timestamp: string;
  cached: boolean;
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
   * Main entry point - Process automatic printing after payment using batch printing
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
      console.log('🖨️ Starting batch auto-print process for terminal:', terminalId);
      
      // Get system default printer
      const defaultPrinter = await this.getSystemDefaultPrinter();
      
      // Collect all URLs for batch printing
      const { urls, urlTypes, departmentCodes } = this.collectPrintUrls(paymentResponse);
      
      if (urls.length === 0) {
        console.log('⚠️ No URLs to print');
        return {
          success: true,
          printJobs: [],
          errors: [],
          totalJobs: 0,
          successfulJobs: 0,
          failedJobs: 0
        };
      }
      
      // Create single batch print job
      const batchJob = this.createBatchPrintJob(urls, urlTypes, departmentCodes, defaultPrinter);
      
      // Process the batch job
      const result = await this.processBatchPrintJob(batchJob);
      
      this.emit('auto-print-completed', result);
      
      return result;
    } catch (error) {
      console.error('❌ Batch auto-print process failed:', error);
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
   * Get system default printer from backend API
   */
  private async getSystemDefaultPrinter(): Promise<string | null> {
    try {
      console.log('🖨️ Fetching system default printer...');
      
      const response = await apiRequest('GET', '/api/printers/default');
      const result: DefaultPrinterResponse = await response.json();
      
      if (result.defaultPrinter && result.available) {
        console.log(`✅ System default printer found: ${result.defaultPrinter}`);
        return result.defaultPrinter;
      } else {
        console.log('⚠️ No system default printer available:', result.message);
        return null;
      }
    } catch (error) {
      console.error('❌ Failed to get system default printer:', error);
      return null;
    }
  }

  /**
   * Collect all URLs for batch printing from payment response
   */
  private collectPrintUrls(paymentResponse: PaymentResponse): {
    urls: string[];
    urlTypes: Array<'customer_receipt' | 'department_ticket'>;
    departmentCodes: Array<string | null>;
  } {
    const urls: string[] = [];
    const urlTypes: Array<'customer_receipt' | 'department_ticket'> = [];
    const departmentCodes: Array<string | null> = [];
    
    // 🔍 DEBUG: Log the entire payment response
    console.log('🔍 DEBUG: Payment response received for batch auto-print:', {
      receiptUrls: paymentResponse.receiptUrls,
      departmentReceiptUrls: paymentResponse.departmentReceiptUrls,
      hasReceiptUrls: !!paymentResponse.receiptUrls,
      hasDepartmentUrls: !!paymentResponse.departmentReceiptUrls,
      departmentUrlsKeys: paymentResponse.departmentReceiptUrls ? Object.keys(paymentResponse.departmentReceiptUrls) : [],
      departmentUrlsCount: paymentResponse.departmentReceiptUrls ? Object.keys(paymentResponse.departmentReceiptUrls).length : 0
    });
    
    // Add customer receipt URL (highest priority - first in batch)
    if (paymentResponse.receiptUrls?.printable) {
      urls.push(paymentResponse.receiptUrls.printable);
      urlTypes.push('customer_receipt');
      departmentCodes.push(null);
    }
    
    // Add department ticket URLs
    if (paymentResponse.departmentReceiptUrls) {
      Object.entries(paymentResponse.departmentReceiptUrls).forEach(([departmentCode, url]) => {
        urls.push(url);
        urlTypes.push('department_ticket');
        departmentCodes.push(departmentCode);
      });
    }
    
    console.log(`📋 Collected ${urls.length} URLs for batch printing:`);
    console.log(`  → ${urlTypes.filter(type => type === 'customer_receipt').length} customer receipt(s)`);
    const deptTickets = departmentCodes.filter(code => code !== null);
    console.log(`  → ${deptTickets.length} department ticket(s)${deptTickets.length > 0 ? ' for: ' + deptTickets.join(', ') : ''}`);
    
    return { urls, urlTypes, departmentCodes };
  }

  /**
   * Create a single batch print job
   */
  private createBatchPrintJob(
    urls: string[],
    urlTypes: Array<'customer_receipt' | 'department_ticket'>,
    departmentCodes: Array<string | null>,
    defaultPrinter: string | null
  ): PrintJob {
    const batchJob: PrintJob = {
      id: `batch-${Date.now()}`,
      type: 'batch_print',
      urls: urls,
      urlTypes: urlTypes,
      departmentCodes: departmentCodes,
      printerName: defaultPrinter || 'browser_default',
      status: 'pending',
      attempts: 0,
      maxAttempts: this.DEFAULT_MAX_ATTEMPTS,
      usedFallback: !defaultPrinter, // Use fallback if no default printer
      networkAttempts: 0,
      fallbackAttempts: 0,
      createdAt: new Date(),
      totalUrls: urls.length,
      successfulUrls: 0,
      failedUrls: 0
    };
    
    console.log(`📦 Created batch print job: ${batchJob.id}`);
    console.log(`  → Printer: ${batchJob.printerName}`);
    console.log(`  → URLs: ${batchJob.totalUrls}`);
    console.log(`  → Will use fallback: ${batchJob.usedFallback ? 'Yes' : 'No'}`);
    
    return batchJob;
  }

  /**
   * Process a single batch print job
   */
  private async processBatchPrintJob(batchJob: PrintJob): Promise<AutoPrintResult> {
    console.log(`🔄 Processing batch print job: ${batchJob.id}`);
    
    batchJob.status = 'printing';
    batchJob.attempts++;
    batchJob.lastAttemptAt = new Date();
    
    this.emit('print-job-started', batchJob);
    
    try {
      if (batchJob.printerName === 'browser_default' || batchJob.usedFallback) {
        // Use browser printing fallback
        await this.processBatchWithBrowser(batchJob);
      } else {
        // Try network printer first
        batchJob.networkAttempts = (batchJob.networkAttempts || 0) + 1;
        console.log(`🖨️ Attempting batch network print to ${batchJob.printerName} (attempt ${batchJob.networkAttempts}/${this.MAX_NETWORK_ATTEMPTS})`);
        await this.processBatchWithSystemPrinter(batchJob);
      }
      
      batchJob.status = 'success';
      batchJob.successfulUrls = batchJob.totalUrls;
      batchJob.failedUrls = 0;
      
      const printMethod = batchJob.usedFallback ? 'browser fallback' : `network printer ${batchJob.printerName}`;
      console.log(`✅ Batch print job ${batchJob.id} completed successfully using ${printMethod}`);
      
      this.emit('print-job-success', batchJob);
      
      return {
        success: true,
        printJobs: [batchJob],
        errors: [],
        totalJobs: 1,
        successfulJobs: 1,
        failedJobs: 0
      };
      
    } catch (error) {
      return await this.handleBatchPrintError(batchJob, error);
    }
  }

  /**
   * Process batch printing with network/system printer
   */
  private async processBatchWithSystemPrinter(batchJob: PrintJob): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.NETWORK_TIMEOUT);
    
    try {
      console.log(`🖨️ Sending batch print request to ${batchJob.printerName}`);
      console.log(`  → URLs: ${batchJob.totalUrls}`);
      console.log(`  → Types: ${batchJob.urlTypes.join(', ')}`);
      
      // Call backend batch print API with timeout
      const response = await apiRequest('POST', '/api/print/batch', {
        urls: batchJob.urls,
        printerName: batchJob.printerName,
        copies: 1,
        silent: true
      }, controller.signal);

      const result = await response.json();
      clearTimeout(timeoutId);
      
      if (!result.success) {
        // Categorize printer-specific errors
        if (result.error?.includes('offline') || result.error?.includes('unreachable')) {
          batchJob.errorType = 'printer';
        } else if (result.error?.includes('timeout')) {
          batchJob.errorType = 'timeout';
        } else {
          batchJob.errorType = 'printer';
        }
        
        throw new Error(result.error || 'Batch print failed on server');
      }
      
      console.log(`✅ Network batch print completed for job ${batchJob.id}:`, result);
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Check if this was an abort (timeout)
      if (error.name === 'AbortError' || error.message?.includes('abort') || error.message?.includes('signal')) {
        batchJob.errorType = 'timeout';
        throw new Error(`Network timeout after ${this.NETWORK_TIMEOUT}ms`);
      }
      
      // If no error type set, determine from error message
      if (!batchJob.errorType) {
        const errorMsg = error.message?.toLowerCase() || '';
        if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
          batchJob.errorType = 'network';
        } else if (errorMsg.includes('timeout')) {
          batchJob.errorType = 'timeout';
        } else {
          batchJob.errorType = 'printer';
        }
      }
      
      console.error(`❌ Network batch print failed for job ${batchJob.id}:`, error);
      throw error; // Re-throw to be handled by processBatchPrintJob
    }
  }

  /**
   * Process batch printing with browser fallback
   */
  private async processBatchWithBrowser(batchJob: PrintJob): Promise<void> {
    console.log(`🌐 Processing batch browser print for ${batchJob.totalUrls} documents`);
    
    batchJob.fallbackAttempts = (batchJob.fallbackAttempts || 0) + 1;
    
    // Print each URL individually with browser
    for (let i = 0; i < batchJob.urls.length; i++) {
      const url = batchJob.urls[i];
      const urlType = batchJob.urlTypes[i];
      const departmentCode = batchJob.departmentCodes[i];
      
      try {
        console.log(`🌐 Browser printing document ${i + 1}/${batchJob.totalUrls}: ${urlType}${departmentCode ? ` (${departmentCode})` : ''}`);
        
        // Create a temporary print job for individual URL
        const tempJob: PrintJob = {
          ...batchJob,
          id: `${batchJob.id}-${i}`,
          urls: [url],
          urlTypes: [urlType],
          departmentCodes: [departmentCode],
          totalUrls: 1
        };
        
        await this.printWithBrowser(url, tempJob);
        
        // Small delay between browser prints to avoid conflicts
        if (i < batchJob.urls.length - 1) {
          await this.delay(1200); // Increased delay for batch browser printing
        }
        
      } catch (error) {
        console.error(`❌ Browser print failed for document ${i + 1}: ${urlType}`, error);
        throw new Error(`Browser batch print failed at document ${i + 1}: ${error.message}`);
      }
    }
    
    console.log(`✅ Browser batch print completed for all ${batchJob.totalUrls} documents`);
  }

  /**
   * Handle batch print job errors with intelligent fallback logic
   */
  private async handleBatchPrintError(batchJob: PrintJob, error: any): Promise<AutoPrintResult> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown batch print error';
    batchJob.error = errorMessage;
    
    console.error(`❌ Batch print job ${batchJob.id} failed (attempt ${batchJob.attempts}):`, errorMessage);
    
    // Determine if we should try fallback or retry
    const shouldUseFallback = this.shouldUseFallback(batchJob, error);
    
    if (shouldUseFallback && !batchJob.usedFallback) {
      // Try browser fallback
      console.log(`🔄 Attempting browser fallback for batch job ${batchJob.id}`);
      
      try {
        batchJob.usedFallback = true;
        batchJob.status = 'printing';
        
        this.emit('print-fallback-started', { job: batchJob, reason: batchJob.errorType || 'network_error' });
        
        await this.processBatchWithBrowser(batchJob);
        
        batchJob.status = 'success';
        batchJob.successfulUrls = batchJob.totalUrls;
        batchJob.failedUrls = 0;
        
        console.log(`✅ Batch print job ${batchJob.id} completed successfully using browser fallback`);
        this.emit('print-job-success', batchJob);
        
        return {
          success: true,
          printJobs: [batchJob],
          errors: [],
          totalJobs: 1,
          successfulJobs: 1,
          failedJobs: 0
        };
        
      } catch (fallbackError) {
        console.error(`❌ Browser fallback also failed for batch job ${batchJob.id}:`, fallbackError);
        batchJob.error = `Network failed: ${errorMessage}; Browser fallback failed: ${fallbackError.message}`;
        batchJob.errorType = 'browser';
      }
    }
    
    // Determine if we should retry (without fallback) or fail permanently
    if (batchJob.attempts < batchJob.maxAttempts && this.shouldRetryJob(batchJob)) {
      batchJob.status = 'retry';
      const retryDelay = this.RETRY_DELAYS[batchJob.attempts - 1] || 5000;
      console.log(`🔄 Will retry batch job ${batchJob.id} in ${retryDelay}ms`);
      
      // Schedule retry
      setTimeout(async () => {
        if (batchJob.status === 'retry') {
          const retryResult = await this.processBatchPrintJob(batchJob);
          // Note: This is a simplified retry, in production you might want more sophisticated retry handling
        }
      }, retryDelay);
      
      this.emit('print-job-retry', batchJob);
      
      return {
        success: false,
        printJobs: [batchJob],
        errors: [errorMessage],
        totalJobs: 1,
        successfulJobs: 0,
        failedJobs: 0 // Still retrying
      };
    } else {
      batchJob.status = 'failed';
      batchJob.successfulUrls = 0;
      batchJob.failedUrls = batchJob.totalUrls;
      
      console.error(`💥 Batch print job ${batchJob.id} failed permanently after ${batchJob.attempts} attempts`);
      
      // Emit detailed failure event
      this.emit('print-job-failed', {
        id: batchJob.id,
        type: 'batch_print',
        totalUrls: batchJob.totalUrls,
        networkAttempts: batchJob.networkAttempts || 0,
        fallbackAttempts: batchJob.fallbackAttempts || 0,
        triedFallback: batchJob.usedFallback || false,
        finalError: errorMessage,
        errorType: batchJob.errorType
      });
      
      return {
        success: false,
        printJobs: [batchJob],
        errors: [errorMessage],
        totalJobs: 1,
        successfulJobs: 0,
        failedJobs: 1
      };
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