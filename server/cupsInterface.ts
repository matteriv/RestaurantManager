import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { getAvailablePrinters } from './printerDetection';

const execFileAsync = promisify(execFile);
const spawnAsync = (command: string, args: string[], options?: any): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => stdout += data.toString());
    child.stderr?.on('data', (data) => stderr += data.toString());
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', reject);
  });
};

// Security: Strict validation schemas for all inputs
const printOptionsSchema = z.object({
  copies: z.number().int().min(1).max(999).optional(),
  silent: z.boolean().optional(),
  pageSize: z.enum(['A4', 'Letter', 'Legal', 'A3', 'A5']).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  colorMode: z.enum(['color', 'monochrome']).optional(),
  duplex: z.enum(['none', 'long-edge', 'short-edge']).optional(),
  quality: z.enum(['draft', 'normal', 'high']).optional(),
  mediaType: z.enum(['plain', 'photo', 'transparency']).optional()
});

type PrintOptions = z.infer<typeof printOptionsSchema>;

const printerNameSchema = z.string().min(1).max(255).regex(/^[a-zA-Z0-9_\-\.]+$/, 'Invalid printer name format');
const jobIdSchema = z.string().min(1).max(255).regex(/^[a-zA-Z0-9_\-\.]+$/, 'Invalid job ID format');
const urlSchema = z.string().url().refine(
  (url) => url.startsWith('http://') || url.startsWith('https://'),
  'Only HTTP/HTTPS URLs are allowed'
);
const ipAddressSchema = z.string().ip();
const portSchema = z.number().int().min(1).max(65535);
const contentSchema = z.string().min(1).max(10_000_000); // 10MB limit

interface PrintJob {
  jobId: string;
  printerName: string;
  status: 'pending' | 'printing' | 'completed' | 'failed' | 'cancelled';
  content: string;
  copies: number;
  timestamp: Date;
  error?: string;
}

interface PrintResult {
  success: boolean;
  jobId?: string;
  message: string;
  printerName: string;
  copies: number;
  timestamp: string;
  error?: string;
  fallbackToBrowser?: boolean;
}

// Network printing protocols
enum PrintProtocol {
  RAW_TCP = 'raw_tcp',
  IPP = 'ipp', 
  HTTP = 'http',
  HTTPS = 'https',
  LPR = 'lpr'
}

// Cache for CUPS status checks
let cupsStatusCache: { available: boolean; timestamp: number } | null = null;
const CUPS_CACHE_TTL = 10000; // 10 seconds

/**
 * Check if CUPS is available and running - SECURE IMPLEMENTATION
 */
async function isCupsAvailable(): Promise<boolean> {
  // Check cache first
  if (cupsStatusCache && (Date.now() - cupsStatusCache.timestamp) < CUPS_CACHE_TTL) {
    return cupsStatusCache.available;
  }

  try {
    // Security: Use execFile with arguments array instead of shell command
    await execFileAsync('lpstat', ['-r'], { timeout: 5000 });
    cupsStatusCache = { available: true, timestamp: Date.now() };
    console.log('✅ CUPS scheduler is running');
    return true;
  } catch (error) {
    cupsStatusCache = { available: false, timestamp: Date.now() };
    console.warn('⚠️ CUPS scheduler not available:', error);
    return false;
  }
}

/**
 * Validate that a printer exists and is accessible - SECURE IMPLEMENTATION
 */
async function validatePrinter(printerName: string): Promise<{ valid: boolean; printer?: any; error?: string }> {
  try {
    // Security: Validate printer name format first
    const validation = printerNameSchema.safeParse(printerName);
    if (!validation.success) {
      return {
        valid: false,
        error: `Invalid printer name format: ${validation.error.errors.map(e => e.message).join(', ')}`
      };
    }

    const availablePrinters = await getAvailablePrinters();
    const printer = availablePrinters.find(p => p.name === printerName);
    
    if (!printer) {
      // Security: Limit information exposure in error messages
      const safeNames = availablePrinters
        .map(p => p.name)
        .filter(name => printerNameSchema.safeParse(name).success)
        .slice(0, 10); // Limit to 10 names to prevent DoS
      
      return {
        valid: false,
        error: `Printer not found. Available printers: ${safeNames.join(', ')}`
      };
    }

    // Check if printer is online (for network printers)
    if (printer.connectionType === 'network' && printer.status === 'offline') {
      console.warn(`⚠️ Network printer ${printerName} appears offline, attempting anyway...`);
    }

    return { valid: true, printer };
  } catch (error) {
    return {
      valid: false,
      error: 'Error validating printer'
    };
  }
}

/**
 * Combine multiple print URLs into a single HTML document with page breaks
 */
export async function combinePrintUrls(urls: string[]): Promise<string> {
  if (!urls || urls.length === 0) {
    throw new Error('No URLs provided for batch printing');
  }

  console.log(`📄 Combining ${urls.length} URLs into single document`);
  
  const combinedHtml = [`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Batch Print Document</title>
  <style>
    @media print {
      body { 
        margin: 0; 
        padding: 0; 
        font-family: monospace; 
        font-size: 12px;
      }
      .print-page {
        page-break-after: always;
        margin: 0;
        padding: 10px;
      }
      .print-page:last-child {
        page-break-after: auto;
      }
      .no-print { 
        display: none !important; 
      }
    }
    .print-page {
      margin-bottom: 20px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 20px;
    }
  </style>
</head>
<body>
`];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      // Security: Validate URL format
      const urlValidation = urlSchema.safeParse(url);
      if (!urlValidation.success) {
        console.warn(`❌ Invalid URL ${i + 1}: ${url}`);
        continue;
      }

      console.log(`📄 Fetching content ${i + 1}/${urls.length}: ${url}`);
      
      // Fetch the content from the URL
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Restaurant-POS-Printer/1.0'
        },
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (!response.ok) {
        console.warn(`❌ Failed to fetch URL ${i + 1}: ${response.status} ${response.statusText}`);
        continue;
      }

      const content = await response.text();
      
      // Extract body content if it's a full HTML document
      let bodyContent = content;
      const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        bodyContent = bodyMatch[1];
      } else {
        // If no body tag, clean up any HTML/head tags
        bodyContent = content
          .replace(/<\!DOCTYPE[^>]*>/gi, '')
          .replace(/<html[^>]*>/gi, '')
          .replace(/<\/html>/gi, '')
          .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
          .replace(/<body[^>]*>/gi, '')
          .replace(/<\/body>/gi, '');
      }

      // Add this content as a print page
      combinedHtml.push(`
  <div class="print-page" data-source-url="${url.replace(/"/g, '&quot;')}" data-page="${i + 1}">
    ${bodyContent}
  </div>
`);

      console.log(`✅ Added content ${i + 1}/${urls.length} to batch document`);

    } catch (error) {
      console.warn(`❌ Error fetching URL ${i + 1} (${url}):`, error);
      // Add an error page instead of failing completely
      combinedHtml.push(`
  <div class="print-page" data-source-url="${url.replace(/"/g, '&quot;')}" data-page="${i + 1}">
    <h3>Error Loading Document ${i + 1}</h3>
    <p>URL: ${url}</p>
    <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
  </div>
`);
    }
  }

  combinedHtml.push(`
</body>
</html>
`);

  const finalHtml = combinedHtml.join('');
  console.log(`📄 Combined document ready: ${finalHtml.length} characters, ${urls.length} pages`);
  
  return finalHtml;
}

/**
 * Download content from URL to temporary file - SECURE IMPLEMENTATION
 */
async function downloadContent(url: string): Promise<string> {
  try {
    // Security: Validate URL format and protocol
    const urlValidation = urlSchema.safeParse(url);
    if (!urlValidation.success) {
      throw new Error('Invalid URL format or protocol');
    }

    // Security: Generate safe temp file path
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const tempFilePath = path.join(tmpdir(), `print_${timestamp}_${randomSuffix}.html`);
    
    // Security: Use execFile with argument array instead of shell command
    await execFileAsync('curl', [
      '-s',                    // Silent
      '-L',                    // Follow redirects
      '--max-time', '30',      // Timeout
      '--max-filesize', '10M', // Size limit
      '--max-redirs', '5',     // Redirect limit
      '-o', tempFilePath,      // Output file
      url                      // URL (safely passed as argument)
    ], { timeout: 30000 });
    
    return tempFilePath;
  } catch (error) {
    throw new Error('Failed to download content: Network error or timeout');
  }
}

/**
 * Create temporary file from raw text content - SECURE IMPLEMENTATION
 */
async function createTempFile(content: string, extension: string = '.txt'): Promise<string> {
  // Security: Validate content
  const contentValidation = contentSchema.safeParse(content);
  if (!contentValidation.success) {
    throw new Error('Content validation failed: size limit exceeded or empty content');
  }

  // Security: Validate and sanitize extension
  const allowedExtensions = ['.txt', '.html', '.pdf', '.ps'];
  if (!allowedExtensions.includes(extension)) {
    extension = '.txt'; // Default to safe extension
  }

  // Security: Generate safe temp file path
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const tempFilePath = path.join(tmpdir(), `print_${timestamp}_${randomSuffix}${extension}`);
  
  await writeFile(tempFilePath, content, 'utf8');
  return tempFilePath;
}

/**
 * Build CUPS lp command with options - SECURE IMPLEMENTATION using argument arrays
 */
function buildPrintCommandArgs(printerName: string, filePath: string, options: PrintOptions = {}): string[] {
  // Security: Validate all inputs
  const printerValidation = printerNameSchema.safeParse(printerName);
  if (!printerValidation.success) {
    throw new Error('Invalid printer name format');
  }
  
  const optionsValidation = printOptionsSchema.safeParse(options);
  if (!optionsValidation.success) {
    throw new Error('Invalid print options');
  }

  // Security: Check file path exists and is secure
  if (!path.isAbsolute(filePath) || !filePath.startsWith(tmpdir())) {
    throw new Error('Invalid file path - must be absolute temp file');
  }

  const args: string[] = ['lp', '-d', printerName];
  
  // Add copies
  if (options.copies && options.copies > 1) {
    args.push('-n', options.copies.toString());
  }

  // Security: Build print options with whitelisted values only
  const printOptions: string[] = [];
  
  if (options.pageSize) {
    // Security: Only allow whitelisted page sizes
    const pageMap: Record<string, string> = {
      'A4': 'A4',
      'Letter': 'Letter', 
      'Legal': 'Legal',
      'A3': 'A3',
      'A5': 'A5'
    };
    const safePage = pageMap[options.pageSize];
    if (safePage) {
      printOptions.push(`media=${safePage}`);
    }
  }
  
  if (options.orientation) {
    // Security: Only allow whitelisted orientations
    const orientationValue = options.orientation === 'landscape' ? '4' : '3';
    printOptions.push(`orientation-requested=${orientationValue}`);
  }
  
  if (options.colorMode) {
    // Security: Only allow whitelisted color modes
    const colorValue = options.colorMode === 'color' ? 'RGB' : 'Gray';
    printOptions.push(`ColorModel=${colorValue}`);
  }
  
  if (options.duplex && options.duplex !== 'none') {
    // Security: Only allow whitelisted duplex values
    const duplexMap: Record<string, string> = {
      'long-edge': 'DuplexNoTumble',
      'short-edge': 'DuplexTumble'
    };
    const duplexValue = duplexMap[options.duplex];
    if (duplexValue) {
      printOptions.push(`sides=${duplexValue}`);
    }
  }
  
  if (options.quality) {
    // Security: Only allow whitelisted quality values
    const qualityMap: Record<string, string> = { 
      'draft': '3', 
      'normal': '4', 
      'high': '5' 
    };
    const qualityValue = qualityMap[options.quality];
    if (qualityValue) {
      printOptions.push(`print-quality=${qualityValue}`);
    }
  }

  if (printOptions.length > 0) {
    args.push('-o', printOptions.join(','));
  }

  // Add file path
  args.push(filePath);

  return args;
}

/**
 * Print via network printer directly (raw TCP/IP) - SECURE IMPLEMENTATION
 */
async function printViaNetworkRaw(printer: any, content: string): Promise<PrintResult> {
  // Security: Validate printer has required network info
  if (!printer.ipAddress || !printer.port) {
    throw new Error('Network printer missing IP address or port');
  }

  // Security: Validate IP address and port
  const ipValidation = ipAddressSchema.safeParse(printer.ipAddress);
  const portValidation = portSchema.safeParse(printer.port);
  
  if (!ipValidation.success) {
    throw new Error('Invalid IP address format');
  }
  if (!portValidation.success) {
    throw new Error('Invalid port number');
  }

  // Security: Validate content
  const contentValidation = contentSchema.safeParse(content);
  if (!contentValidation.success) {
    throw new Error('Content validation failed');
  }

  try {
    // For raw TCP printing, send content through temporary file
    const tempFile = await createTempFile(content);
    
    // Security: Use execFile with stdin redirection - safer than nc with arguments
    const child = spawn('nc', [
      '-w', '5',                    // Wait timeout
      '-q', '0',                   // Quit after EOF
      printer.ipAddress,           // IP address
      printer.port.toString()      // Port
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000
    });

    // Write content to stdin and close
    child.stdin?.write(content);
    child.stdin?.end();

    // Wait for completion
    await new Promise((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) {
          resolve(void 0);
        } else {
          reject(new Error(`Network print failed with code ${code}`));
        }
      });
      child.on('error', reject);
      
      // Timeout handling
      setTimeout(() => {
        child.kill();
        reject(new Error('Network print timeout'));
      }, 30000);
    });
    
    // Clean up temp file
    await unlink(tempFile).catch(() => {}); // Ignore cleanup errors

    const jobId = `netraw_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    return {
      success: true,
      jobId,
      message: `Document sent via raw TCP to printer`,
      printerName: printer.name,
      copies: 1,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    throw new Error('Network raw printing failed');
  }
}

/**
 * Main function to print document using CUPS
 */
export async function printDocument(
  printerName: string, 
  content: string, 
  options: PrintOptions = {}
): Promise<PrintResult> {
  console.log(`🖨️ Starting physical print job: ${content} -> ${printerName}`);
  
  try {
    // Validate printer exists
    const validation = await validatePrinter(printerName);
    if (!validation.valid) {
      throw new Error(validation.error || 'Printer validation failed');
    }

    const printer = validation.printer!;
    console.log(`✅ Printer validated: ${printer.name} (${printer.connectionType}, ${printer.status})`);

    // Check CUPS availability
    const cupsAvailable = await isCupsAvailable();
    
    // For network printers, we might try direct connection if CUPS fails
    if (printer.connectionType === 'network' && !cupsAvailable) {
      console.log('🌐 CUPS unavailable, attempting direct network printing...');
      try {
        return await printViaNetworkRaw(printer, content);
      } catch (networkError) {
        console.warn('⚠️ Direct network printing failed:', networkError);
        // Fall through to CUPS or error
      }
    }

    if (!cupsAvailable) {
      throw new Error('CUPS scheduler not available and direct network printing failed');
    }

    let tempFilePath: string;
    let needsCleanup = false;

    // Handle different content types
    if (content.startsWith('http://') || content.startsWith('https://')) {
      // Download URL content
      tempFilePath = await downloadContent(content);
      needsCleanup = true;
    } else if (content.includes('<html>') || content.includes('<!DOCTYPE')) {
      // HTML content - save to temp file
      tempFilePath = await createTempFile(content, '.html');
      needsCleanup = true;
    } else if (content.includes('\n') || content.length > 255) {
      // Raw text content - save to temp file
      tempFilePath = await createTempFile(content, '.txt');
      needsCleanup = true;
    } else {
      // Assume it's already a file path
      tempFilePath = content;
    }

    // Build and execute print command - SECURE IMPLEMENTATION
    const printArgs = buildPrintCommandArgs(printerName, tempFilePath, options);
    console.log(`🖨️ Executing lp with secure arguments`);

    const startTime = Date.now();
    // Security: Use execFile with argument array to prevent injection
    const { stdout, stderr } = await execFileAsync('lp', printArgs.slice(1), { 
      timeout: 60000 // 60 second timeout for print jobs
    });
    const printTime = Date.now() - startTime;

    // Clean up temp file if we created one
    if (needsCleanup) {
      try {
        await unlink(tempFilePath);
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup temp file:', cleanupError);
      }
    }

    // Extract job ID from CUPS output
    let jobId = `cups_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const jobMatch = stdout.match(/request id is (\S+)/);
    if (jobMatch) {
      jobId = jobMatch[1];
    }

    const result: PrintResult = {
      success: true,
      jobId,
      message: `Document sent to printer ${printerName} successfully${jobMatch ? ` (Job ID: ${jobId})` : ''}`,
      printerName,
      copies: options.copies || 1,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Print job completed in ${printTime}ms:`, result);
    
    if (stderr && stderr.trim()) {
      console.warn('⚠️ Print job warnings:', stderr);
      result.message += ` (Warnings: ${stderr.trim()})`;
    }

    return result;

  } catch (error) {
    const errorMessage = `Physical printing failed: ${error}`;
    console.error('❌ Print job failed:', errorMessage);

    return {
      success: false,
      message: errorMessage,
      printerName,
      copies: options.copies || 1,
      timestamp: new Date().toISOString(),
      error: errorMessage,
      fallbackToBrowser: true // Suggest fallback to browser printing
    };
  }
}

/**
 * Get print job status from CUPS - SECURE IMPLEMENTATION
 */
export async function getPrintJobStatus(jobId: string): Promise<any> {
  // Security: Validate job ID format
  const validation = jobIdSchema.safeParse(jobId);
  if (!validation.success) {
    return {
      jobId: 'invalid',
      status: 'error',
      error: 'Invalid job ID format'
    };
  }

  try {
    // Security: Use execFile with argument array
    const { stdout } = await execFileAsync('lpstat', ['-W', 'completed', '-o', jobId], { timeout: 5000 });
    return {
      jobId,
      status: stdout.includes('completed') ? 'completed' : 'unknown',
      details: stdout.trim().substring(0, 500) // Limit output size
    };
  } catch (error) {
    return {
      jobId,
      status: 'unknown',
      error: 'Query failed'
    };
  }
}

/**
 * Cancel a print job - SECURE IMPLEMENTATION
 */
export async function cancelPrintJob(jobId: string): Promise<boolean> {
  // Security: Validate job ID format
  const validation = jobIdSchema.safeParse(jobId);
  if (!validation.success) {
    console.error('❌ Invalid job ID format for cancellation');
    return false;
  }

  try {
    // Security: Use execFile with argument array
    await execFileAsync('cancel', [jobId], { timeout: 5000 });
    console.log(`✅ Cancelled print job: ${jobId}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to cancel print job');
    return false;
  }
}

/**
 * Get printer queue status - SECURE IMPLEMENTATION
 */
export async function getPrinterQueue(printerName?: string): Promise<any[]> {
  try {
    let args: string[];
    
    if (printerName) {
      // Security: Validate printer name
      const validation = printerNameSchema.safeParse(printerName);
      if (!validation.success) {
        console.error('Invalid printer name for queue query');
        return [];
      }
      args = ['lpq', '-P', printerName];
    } else {
      args = ['lpq', '-a'];
    }

    // Security: Use execFile with argument array
    const { stdout } = await execFileAsync('lpq', args.slice(1), { timeout: 5000 });
    
    // Parse lpq output safely
    const lines = stdout.split('\n')
      .filter(line => line.trim())
      .slice(0, 100); // Limit number of lines processed
    
    const jobs = [];
    
    for (const line of lines) {
      if (line.includes('active') || line.includes('1st') || line.includes('2nd')) {
        // Parse job information safely
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          // Security: Sanitize output data
          jobs.push({
            rank: parts[0].substring(0, 10),
            owner: parts[1].substring(0, 50),
            job: parts[2].substring(0, 50),
            files: parts.slice(3).join(' ').replace(/\s+\d+\s+bytes.*$/, '').substring(0, 200),
            size: (line.match(/(\d+)\s+bytes/)?.[1] || '0').substring(0, 20)
          });
        }
      }
    }
    
    return jobs.slice(0, 50); // Limit number of jobs returned
  } catch (error) {
    console.error('Error getting printer queue');
    return [];
  }
}

// Export secure validation schemas
export { 
  PrintOptions, 
  PrintResult, 
  PrintJob, 
  PrintProtocol,
  printOptionsSchema,
  printerNameSchema,
  jobIdSchema,
  urlSchema,
  contentSchema
};