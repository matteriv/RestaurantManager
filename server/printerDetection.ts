import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

interface DetectedPrinter {
  name: string;
  description: string;
  connectionType: 'network' | 'usb' | 'bluetooth' | 'local';
  status: 'online' | 'offline' | 'unknown';
  driver?: string;
  port?: string;
  ipAddress?: string;
  macAddress?: string;
}

interface PrinterCache {
  printers: DetectedPrinter[];
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

// Cache implementation - 30 seconds TTL to avoid repeated OS calls
let printerCache: PrinterCache | null = null;
const CACHE_TTL = 30 * 1000; // 30 seconds
const COMMAND_TIMEOUT = 10000; // 10 seconds timeout for OS commands

/**
 * Mock/fallback printers to return if real detection fails
 */
const getMockPrinters = (): DetectedPrinter[] => [
  {
    name: "Sistema_Predefinito",
    description: "Stampante di Sistema Predefinita",
    connectionType: "local",
    status: "online"
  },
  {
    name: "EPSON_TM_T20",
    description: "EPSON TM-T20 Receipt Printer",
    connectionType: "network",
    ipAddress: "192.168.1.100",
    status: "offline"
  },
  {
    name: "STAR_TSP143",
    description: "Star TSP143III Receipt Printer",
    connectionType: "usb",
    port: "USB001",
    status: "offline"
  }
];

/**
 * Detect printers on Windows using wmic command
 */
async function detectWindowsPrinters(): Promise<DetectedPrinter[]> {
  try {
    const { stdout } = await execAsync(
      'wmic printer get Name,Status,DriverName,Local,Network /format:csv',
      { timeout: COMMAND_TIMEOUT }
    );

    const lines = stdout.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
    const printers: DetectedPrinter[] = [];

    for (const line of lines) {
      const parts = line.split(',').map(part => part.trim());
      if (parts.length >= 5) {
        const [, driverName, local, name, network, status] = parts;
        
        if (name && name !== 'Name') {
          let connectionType: DetectedPrinter['connectionType'] = 'local';
          if (network && network.toLowerCase() === 'true') {
            connectionType = 'network';
          } else if (name.toLowerCase().includes('usb')) {
            connectionType = 'usb';
          } else if (name.toLowerCase().includes('bluetooth')) {
            connectionType = 'bluetooth';
          }

          let printerStatus: DetectedPrinter['status'] = 'unknown';
          if (status) {
            const statusLower = status.toLowerCase();
            if (statusLower.includes('ok') || statusLower.includes('ready') || statusLower.includes('idle')) {
              printerStatus = 'online';
            } else if (statusLower.includes('offline') || statusLower.includes('error')) {
              printerStatus = 'offline';
            }
          }

          printers.push({
            name: name.replace(/"/g, ''),
            description: driverName ? `${name} (${driverName})` : name,
            connectionType,
            status: printerStatus,
            driver: driverName || undefined
          });
        }
      }
    }

    return printers.length > 0 ? printers : getMockPrinters();
  } catch (error) {
    console.error('Error detecting Windows printers:', error);
    return getMockPrinters();
  }
}

/**
 * Detect printers on Linux/macOS using lpstat command
 */
async function detectUnixPrinters(): Promise<DetectedPrinter[]> {
  try {
    // Get list of printers
    const { stdout: printersOutput } = await execAsync('lpstat -p', { timeout: COMMAND_TIMEOUT });
    
    // Get default printer
    let defaultPrinter = '';
    try {
      const { stdout: defaultOutput } = await execAsync('lpstat -d', { timeout: COMMAND_TIMEOUT });
      const defaultMatch = defaultOutput.match(/system default destination: (.+)/);
      if (defaultMatch) {
        defaultPrinter = defaultMatch[1].trim();
      }
    } catch (error) {
      // Default printer detection failed, continue without it
    }

    const printerLines = printersOutput.split('\n').filter(line => line.trim());
    const printers: DetectedPrinter[] = [];

    for (const line of printerLines) {
      // Parse lpstat output format: "printer PRINTER_NAME is idle/disabled/..."
      const match = line.match(/printer\s+(.+?)\s+is\s+(.+)/);
      if (match) {
        const [, name, statusText] = match;
        
        let status: DetectedPrinter['status'] = 'unknown';
        const statusLower = statusText.toLowerCase();
        if (statusLower.includes('idle') || statusLower.includes('accepting')) {
          status = 'online';
        } else if (statusLower.includes('disabled') || statusLower.includes('stopped')) {
          status = 'offline';
        }

        // Try to determine connection type based on printer name
        let connectionType: DetectedPrinter['connectionType'] = 'local';
        const nameLower = name.toLowerCase();
        if (nameLower.includes('network') || nameLower.includes('ip')) {
          connectionType = 'network';
        } else if (nameLower.includes('usb')) {
          connectionType = 'usb';
        } else if (nameLower.includes('bluetooth')) {
          connectionType = 'bluetooth';
        }

        let description = name;
        if (name === defaultPrinter) {
          description += ' (Default)';
        }

        printers.push({
          name,
          description,
          connectionType,
          status
        });
      }
    }

    return printers.length > 0 ? printers : getMockPrinters();
  } catch (error) {
    console.error('Error detecting Unix printers:', error);
    return getMockPrinters();
  }
}

/**
 * Get available printers using OS-specific detection with caching
 */
export async function getAvailablePrinters(): Promise<DetectedPrinter[]> {
  // Check cache first
  if (printerCache && (Date.now() - printerCache.timestamp) < printerCache.ttl) {
    console.log('🖨️ Returning cached printer list');
    return printerCache.printers;
  }

  console.log('🔍 Detecting available printers...');
  
  let printers: DetectedPrinter[] = [];
  const platform = os.platform();

  try {
    if (platform === 'win32') {
      printers = await detectWindowsPrinters();
    } else if (platform === 'linux' || platform === 'darwin') {
      printers = await detectUnixPrinters();
    } else {
      console.warn(`Unsupported platform: ${platform}, using mock printers`);
      printers = getMockPrinters();
    }

    // Update cache
    printerCache = {
      printers,
      timestamp: Date.now(),
      ttl: CACHE_TTL
    };

    console.log(`✅ Found ${printers.length} printers on ${platform}`);
    return printers;
  } catch (error) {
    console.error('Critical error in printer detection:', error);
    return getMockPrinters();
  }
}

/**
 * Clear the printer cache to force fresh detection
 */
export function clearPrinterCache(): void {
  printerCache = null;
  console.log('🗑️ Printer cache cleared');
}

/**
 * Get cache status for debugging
 */
export function getCacheStatus(): { isCached: boolean; age?: number; ttl?: number } {
  if (!printerCache) {
    return { isCached: false };
  }
  
  const age = Date.now() - printerCache.timestamp;
  return {
    isCached: age < printerCache.ttl,
    age,
    ttl: printerCache.ttl
  };
}