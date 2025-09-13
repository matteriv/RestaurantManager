import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { networkInterfaces } from 'os';

const execAsync = promisify(exec);

// Common printer ports for network discovery
const PRINTER_PORTS = {
  RAW: 9100,     // Raw TCP/IP printing (most common)
  IPP: 631,      // Internet Printing Protocol (CUPS)
  LPR: 515,      // Line Printer Remote protocol
  HP_JETDIRECT: 9100, // HP JetDirect
  EPSON: 9100,   // Epson network printers
  CANON: 9100    // Canon network printers
};

// Network ranges to scan
interface NetworkRange {
  network: string;
  cidr: number;
  interface: string;
}

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

interface NetworkScanResult {
  ip: string;
  ports: number[];
  hostname?: string;
  manufacturer?: string;
  model?: string;
  status: 'online' | 'offline';
}

// Cache implementation - 30 seconds TTL to avoid repeated OS calls
let printerCache: PrinterCache | null = null;
const CACHE_TTL = 30 * 1000; // 30 seconds
const COMMAND_TIMEOUT = 10000; // 10 seconds timeout for OS commands
const NETWORK_SCAN_TIMEOUT = 30000; // 30 seconds for network scans
const QUICK_SCAN_TIMEOUT = 5000; // 5 seconds for quick port checks

/**
 * Mock/fallback printers to return if real detection fails
 * Now includes more realistic network examples
 */
const getMockPrinters = (): DetectedPrinter[] => [
  {
    name: "Sistema_Predefinito",
    description: "Stampante di Sistema Predefinita",
    connectionType: "local",
    status: "online"
  },
  {
    name: "EPSON_TM_T88V",
    description: "EPSON TM-T88V Receipt Printer (Network)",
    connectionType: "network",
    ipAddress: "192.168.1.100",
    port: "9100",
    status: "offline"
  },
  {
    name: "HP_LaserJet_Pro",
    description: "HP LaserJet Pro M404n (Network)",
    connectionType: "network",
    ipAddress: "192.168.1.110",
    port: "9100",
    status: "offline"
  },
  {
    name: "STAR_TSP143III",
    description: "Star TSP143III Receipt Printer",
    connectionType: "usb",
    port: "USB001",
    status: "offline"
  },
  {
    name: "Canon_PIXMA",
    description: "Canon PIXMA Network Printer",
    connectionType: "network",
    ipAddress: "192.168.1.120",
    port: "631",
    status: "offline"
  }
];

/**
 * Get local network ranges for scanning
 */
async function getLocalNetworkRanges(): Promise<NetworkRange[]> {
  const ranges: NetworkRange[] = [];
  const interfaces = networkInterfaces();

  for (const [name, nets] of Object.entries(interfaces)) {
    if (!nets) continue;
    
    for (const net of nets) {
      // Skip loopback and non-IPv4 interfaces
      if (net.family !== 'IPv4' || net.internal) continue;
      
      // Common private network ranges
      if (net.address.startsWith('192.168.') || 
          net.address.startsWith('10.') || 
          (net.address.startsWith('172.') && 
           parseInt(net.address.split('.')[1]) >= 16 && 
           parseInt(net.address.split('.')[1]) <= 31)) {
        
        // Calculate network address and CIDR
        const ip = net.address.split('.').map(Number);
        const mask = net.netmask.split('.').map(Number);
        const network = ip.map((octet, i) => octet & mask[i]).join('.');
        const cidr = mask.reduce((cidr, octet) => 
          cidr + octet.toString(2).split('1').length - 1, 0);
        
        ranges.push({
          network: `${network}/${cidr}`,
          cidr,
          interface: name
        });
      }
    }
  }
  
  console.log(`🌐 Found ${ranges.length} local network ranges:`, ranges.map(r => r.network));
  return ranges;
}

/**
 * Scan network for printers using nmap
 */
async function scanNetworkForPrinters(networkRange: string): Promise<NetworkScanResult[]> {
  const results: NetworkScanResult[] = [];
  const ports = Object.values(PRINTER_PORTS).join(',');
  
  try {
    console.log(`🔍 Scanning network ${networkRange} for printer ports ${ports}...`);
    
    // Use nmap to scan for open printer ports
    const { stdout } = await execAsync(
      `nmap -p ${ports} --open -T4 --host-timeout 3s ${networkRange} 2>/dev/null`,
      { timeout: NETWORK_SCAN_TIMEOUT }
    );
    
    const lines = stdout.split('\n');
    let currentIp = '';
    let currentPorts: number[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Parse IP address
      const ipMatch = trimmed.match(/Nmap scan report for (.+)/);
      if (ipMatch) {
        // Save previous result if exists
        if (currentIp && currentPorts.length > 0) {
          results.push({
            ip: currentIp,
            ports: [...currentPorts],
            status: 'online'
          });
        }
        
        currentIp = ipMatch[1].replace(/[()]/g, '').split(' ')[0];
        currentPorts = [];
        continue;
      }
      
      // Parse open ports
      const portMatch = trimmed.match(/(\d+)\/tcp\s+open/);
      if (portMatch) {
        const port = parseInt(portMatch[1]);
        if (Object.values(PRINTER_PORTS).includes(port)) {
          currentPorts.push(port);
        }
      }
    }
    
    // Don't forget the last result
    if (currentIp && currentPorts.length > 0) {
      results.push({
        ip: currentIp,
        ports: [...currentPorts],
        status: 'online'
      });
    }
    
    console.log(`✅ Network scan found ${results.length} potential printers in ${networkRange}`);
    return results;
  } catch (error) {
    console.warn(`⚠️ Network scan failed for ${networkRange}:`, error);
    return [];
  }
}

/**
 * Quick port check for a specific IP
 */
async function checkPrinterPort(ip: string, port: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `timeout 2 bash -c "echo > /dev/tcp/${ip}/${port}" 2>/dev/null && echo "open" || echo "closed"`,
      { timeout: QUICK_SCAN_TIMEOUT }
    );
    return stdout.trim() === 'open';
  } catch (error) {
    // Try nmap as fallback
    try {
      const { stdout } = await execAsync(
        `nmap -p ${port} --host-timeout 2s ${ip} 2>/dev/null | grep -q "${port}/tcp open" && echo "open" || echo "closed"`,
        { timeout: QUICK_SCAN_TIMEOUT }
      );
      return stdout.trim() === 'open';
    } catch (nmapError) {
      return false;
    }
  }
}

/**
 * Try to identify printer type and manufacturer
 */
async function identifyPrinterType(ip: string, port: number): Promise<{ manufacturer?: string; model?: string }> {
  try {
    // Try to get banner/service info using nmap
    const { stdout } = await execAsync(
      `nmap -p ${port} -sV --version-intensity 5 --host-timeout 5s ${ip} 2>/dev/null`,
      { timeout: 10000 }
    );
    
    const lines = stdout.toLowerCase();
    
    // Look for printer manufacturer keywords
    if (lines.includes('hp') || lines.includes('hewlett')) {
      return { manufacturer: 'HP' };
    } else if (lines.includes('epson')) {
      return { manufacturer: 'Epson' };
    } else if (lines.includes('canon')) {
      return { manufacturer: 'Canon' };
    } else if (lines.includes('brother')) {
      return { manufacturer: 'Brother' };
    } else if (lines.includes('xerox')) {
      return { manufacturer: 'Xerox' };
    } else if (lines.includes('samsung')) {
      return { manufacturer: 'Samsung' };
    } else if (lines.includes('lexmark')) {
      return { manufacturer: 'Lexmark' };
    } else if (lines.includes('kyocera')) {
      return { manufacturer: 'Kyocera' };
    } else if (lines.includes('star') || lines.includes('tsp')) {
      return { manufacturer: 'Star Micronics' };
    }
    
    // Check for common printer service names
    if (lines.includes('ipp') || lines.includes('cups')) {
      return { manufacturer: 'Network Printer' };
    } else if (lines.includes('jetdirect') || lines.includes('laserjet')) {
      return { manufacturer: 'HP' };
    }
    
    return {};
  } catch (error) {
    return {};
  }
}

/**
 * Detect network printers using comprehensive nmap scanning
 */
async function detectNetworkPrintersViaNmap(): Promise<DetectedPrinter[]> {
  const printers: DetectedPrinter[] = [];
  
  try {
    console.log('🌐 Starting network printer discovery...');
    const networkRanges = await getLocalNetworkRanges();
    
    if (networkRanges.length === 0) {
      console.log('📍 No local networks found, using common ranges');
      networkRanges.push(
        { network: '192.168.1.0/24', cidr: 24, interface: 'default' },
        { network: '192.168.0.0/24', cidr: 24, interface: 'default' },
        { network: '10.0.0.0/24', cidr: 24, interface: 'default' }
      );
    }
    
    // Scan each network range
    for (const range of networkRanges.slice(0, 3)) { // Limit to first 3 ranges
      const scanResults = await scanNetworkForPrinters(range.network);
      
      for (const result of scanResults) {
        // Try to identify each discovered printer
        for (const port of result.ports) {
          const identification = await identifyPrinterType(result.ip, port);
          
          const printerName = identification.manufacturer 
            ? `${identification.manufacturer}_${result.ip.replace(/\./g, '_')}`
            : `NetworkPrinter_${result.ip.replace(/\./g, '_')}`;
          
          const description = identification.manufacturer
            ? `${identification.manufacturer} Network Printer${identification.model ? ` ${identification.model}` : ''}`
            : `Network Printer at ${result.ip}`;
          
          // Check if printer is actually reachable
          const isReachable = await checkPrinterPort(result.ip, port);
          
          printers.push({
            name: printerName,
            description: `${description} (Port ${port})`,
            connectionType: 'network',
            status: isReachable ? 'online' : 'offline',
            ipAddress: result.ip,
            port: port.toString()
          });
        }
      }
    }
    
    console.log(`🖨️ Network discovery found ${printers.length} network printers`);
    return printers;
  } catch (error) {
    console.error('❌ Network printer discovery failed:', error);
    return [];
  }
}

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
 * Enhanced Unix printer detection with better CUPS handling
 */
async function detectUnixPrinters(): Promise<DetectedPrinter[]> {
  const printers: DetectedPrinter[] = [];
  let cupsAvailable = false;
  
  try {
    // First, check if CUPS scheduler is running
    try {
      await execAsync('lpstat -r', { timeout: 5000 });
      cupsAvailable = true;
      console.log('✅ CUPS scheduler is running');
    } catch (error) {
      console.warn('⚠️ CUPS scheduler not available or not running');
      cupsAvailable = false;
    }
    
    if (cupsAvailable) {
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
          console.warn('Could not determine default printer');
        }
        
        // Get detailed printer information
        let detailedInfo: { [key: string]: any } = {};
        try {
          const { stdout: detailOutput } = await execAsync('lpstat -l -p', { timeout: COMMAND_TIMEOUT });
          // Parse detailed printer information
          detailedInfo = parseDetailedPrinterInfo(detailOutput);
        } catch (error) {
          console.warn('Could not get detailed printer information');
        }

        const printerLines = printersOutput.split('\n').filter(line => line.trim());

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

            // Enhanced connection type detection
            let connectionType: DetectedPrinter['connectionType'] = 'local';
            let ipAddress: string | undefined;
            let port: string | undefined;
            
            const nameLower = name.toLowerCase();
            const detail = detailedInfo[name] || {};
            
            // Check device URI for connection type
            if (detail.device) {
              const deviceLower = detail.device.toLowerCase();
              if (deviceLower.includes('socket://') || deviceLower.includes('ipp://') || deviceLower.includes('http://')) {
                connectionType = 'network';
                // Extract IP address from URI
                const ipMatch = detail.device.match(/\/\/(\d+\.\d+\.\d+\.\d+)(?::(\d+))?/);
                if (ipMatch) {
                  ipAddress = ipMatch[1];
                  port = ipMatch[2] || '631';
                }
              } else if (deviceLower.includes('usb://')) {
                connectionType = 'usb';
                const portMatch = detail.device.match(/usb:\/\/([^?]+)/);
                if (portMatch) {
                  port = portMatch[1];
                }
              } else if (deviceLower.includes('bluetooth://')) {
                connectionType = 'bluetooth';
              }
            } else {
              // Fallback to name-based detection
              if (nameLower.includes('network') || nameLower.includes('ip') || nameLower.includes('wifi')) {
                connectionType = 'network';
              } else if (nameLower.includes('usb')) {
                connectionType = 'usb';
              } else if (nameLower.includes('bluetooth')) {
                connectionType = 'bluetooth';
              }
            }

            let description = name;
            if (name === defaultPrinter) {
              description += ' (Default)';
            }
            if (detail.location) {
              description += ` - ${detail.location}`;
            }
            if (detail.description && detail.description !== name) {
              description += ` (${detail.description})`;
            }

            const printer: DetectedPrinter = {
              name,
              description,
              connectionType,
              status,
              driver: detail.driver
            };
            
            if (ipAddress) printer.ipAddress = ipAddress;
            if (port) printer.port = port;
            
            printers.push(printer);
          }
        }
        
        console.log(`✅ CUPS found ${printers.length} configured printers`);
      } catch (error) {
        console.warn('⚠️ Error getting CUPS printer list:', error);
      }
    }
    
    // Always try network discovery as well
    console.log('🌐 Running network discovery...');
    const networkPrinters = await detectNetworkPrintersViaNmap();
    
    // Merge network printers, avoiding duplicates
    for (const netPrinter of networkPrinters) {
      const existingPrinter = printers.find(p => 
        p.ipAddress === netPrinter.ipAddress && p.port === netPrinter.port
      );
      
      if (!existingPrinter) {
        printers.push(netPrinter);
      } else {
        // Update status if network printer is online but CUPS shows offline
        if (netPrinter.status === 'online' && existingPrinter.status !== 'online') {
          existingPrinter.status = 'online';
        }
      }
    }

    return printers.length > 0 ? printers : getMockPrinters();
  } catch (error) {
    console.error('❌ Critical error in Unix printer detection:', error);
    
    // As fallback, try network discovery only
    try {
      console.log('🔄 Attempting network-only discovery as fallback...');
      const networkPrinters = await detectNetworkPrintersViaNmap();
      return networkPrinters.length > 0 ? networkPrinters : getMockPrinters();
    } catch (networkError) {
      console.error('❌ Network fallback also failed:', networkError);
      return getMockPrinters();
    }
  }
}

/**
 * Parse detailed printer information from lpstat -l output
 */
function parseDetailedPrinterInfo(output: string): { [key: string]: any } {
  const printers: { [key: string]: any } = {};
  const lines = output.split('\n');
  let currentPrinter = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // New printer section
    if (trimmed.startsWith('printer ')) {
      const match = trimmed.match(/printer\s+(.+?)\s+/);
      if (match) {
        currentPrinter = match[1];
        printers[currentPrinter] = {};
      }
    } else if (currentPrinter && trimmed) {
      // Parse printer details
      if (trimmed.includes('Description:')) {
        printers[currentPrinter].description = trimmed.split('Description:')[1]?.trim();
      } else if (trimmed.includes('Location:')) {
        printers[currentPrinter].location = trimmed.split('Location:')[1]?.trim();
      } else if (trimmed.includes('Device URI:')) {
        printers[currentPrinter].device = trimmed.split('Device URI:')[1]?.trim();
      } else if (trimmed.includes('Printer Driver:')) {
        printers[currentPrinter].driver = trimmed.split('Printer Driver:')[1]?.trim();
      }
    }
  }
  
  return printers;
}

/**
 * Get available printers using enhanced OS-specific detection with caching
 */
export async function getAvailablePrinters(): Promise<DetectedPrinter[]> {
  // Check cache first
  if (printerCache && (Date.now() - printerCache.timestamp) < printerCache.ttl) {
    console.log('🖨️ Returning cached printer list');
    return printerCache.printers;
  }

  console.log('🔍 Starting comprehensive printer detection...');
  
  let printers: DetectedPrinter[] = [];
  const platform = os.platform();
  const startTime = Date.now();

  try {
    if (platform === 'win32') {
      console.log('🪟 Running Windows printer detection...');
      printers = await detectWindowsPrinters();
      
      // Also try network discovery on Windows
      try {
        console.log('🌐 Adding network discovery for Windows...');
        const networkPrinters = await detectNetworkPrintersViaNmap();
        
        // Merge without duplicates
        for (const netPrinter of networkPrinters) {
          const exists = printers.some(p => 
            p.name === netPrinter.name || 
            (p.ipAddress && p.ipAddress === netPrinter.ipAddress)
          );
          if (!exists) {
            printers.push(netPrinter);
          }
        }
      } catch (error) {
        console.warn('⚠️ Network discovery failed on Windows:', error);
      }
      
    } else if (platform === 'linux' || platform === 'darwin') {
      console.log(`🐧 Running ${platform === 'darwin' ? 'macOS' : 'Linux'} printer detection...`);
      printers = await detectUnixPrinters();
    } else {
      console.warn(`❓ Unsupported platform: ${platform}, using mock printers with network discovery`);
      
      // Try network discovery even on unsupported platforms
      try {
        const networkPrinters = await detectNetworkPrintersViaNmap();
        printers = networkPrinters.length > 0 ? networkPrinters : getMockPrinters();
      } catch (error) {
        console.error('Network discovery failed on unsupported platform:', error);
        printers = getMockPrinters();
      }
    }

    // Update cache
    printerCache = {
      printers,
      timestamp: Date.now(),
      ttl: CACHE_TTL
    };

    const detectionTime = Date.now() - startTime;
    console.log(`✅ Found ${printers.length} printers on ${platform} (${detectionTime}ms)`);
    
    // Log summary by connection type
    const summary = printers.reduce((acc, printer) => {
      acc[printer.connectionType] = (acc[printer.connectionType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('📊 Printer summary:', summary);
    return printers;
  } catch (error) {
    console.error('❌ Critical error in printer detection:', error);
    
    // Final fallback - try just network discovery
    try {
      console.log('🔄 Attempting final network-only fallback...');
      const networkPrinters = await detectNetworkPrintersViaNmap();
      if (networkPrinters.length > 0) {
        console.log(`✅ Network fallback found ${networkPrinters.length} printers`);
        return networkPrinters;
      }
    } catch (fallbackError) {
      console.error('❌ Network fallback failed:', fallbackError);
    }
    
    console.log('🔄 Using mock printers as final fallback');
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
 * Scan a specific IP range for printers (public API)
 */
export async function scanIPRangeForPrinters(ipRange: string): Promise<DetectedPrinter[]> {
  console.log(`🎯 Manual IP range scan requested: ${ipRange}`);
  
  try {
    const scanResults = await scanNetworkForPrinters(ipRange);
    const printers: DetectedPrinter[] = [];
    
    for (const result of scanResults) {
      for (const port of result.ports) {
        const identification = await identifyPrinterType(result.ip, port);
        
        const printerName = identification.manufacturer 
          ? `${identification.manufacturer}_${result.ip.replace(/\./g, '_')}`
          : `ManualScan_${result.ip.replace(/\./g, '_')}`;
        
        const description = identification.manufacturer
          ? `${identification.manufacturer} Printer${identification.model ? ` ${identification.model}` : ''}`
          : `Network Printer at ${result.ip}`;
        
        const isReachable = await checkPrinterPort(result.ip, port);
        
        printers.push({
          name: printerName,
          description: `${description} (Manual Scan - Port ${port})`,
          connectionType: 'network',
          status: isReachable ? 'online' : 'offline',
          ipAddress: result.ip,
          port: port.toString()
        });
      }
    }
    
    console.log(`📍 Manual scan of ${ipRange} found ${printers.length} printers`);
    return printers;
  } catch (error) {
    console.error(`❌ Manual IP range scan failed for ${ipRange}:`, error);
    return [];
  }
}

/**
 * Test connectivity to a specific printer
 */
export async function testPrinterConnectivity(ip: string, port: number = 9100): Promise<boolean> {
  console.log(`🔌 Testing connectivity to ${ip}:${port}...`);
  
  try {
    const isReachable = await checkPrinterPort(ip, port);
    console.log(`${isReachable ? '✅' : '❌'} Printer at ${ip}:${port} is ${isReachable ? 'reachable' : 'unreachable'}`);
    return isReachable;
  } catch (error) {
    console.error(`❌ Connectivity test failed for ${ip}:${port}:`, error);
    return false;
  }
}

/**
 * Get cache status for debugging
 */
export function getCacheStatus(): { isCached: boolean; age?: number; ttl?: number; printerCount?: number } {
  if (!printerCache) {
    return { isCached: false };
  }
  
  const age = Date.now() - printerCache.timestamp;
  return {
    isCached: age < printerCache.ttl,
    age,
    ttl: printerCache.ttl,
    printerCount: printerCache.printers.length
  };
}

/**
 * Force refresh printer cache and return new results
 */
export async function refreshPrinterCache(): Promise<DetectedPrinter[]> {
  console.log('🔄 Force refreshing printer cache...');
  clearPrinterCache();
  return await getAvailablePrinters();
}