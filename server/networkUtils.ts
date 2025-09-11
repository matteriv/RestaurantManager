import { networkInterfaces } from 'os';
import { createSocket } from 'dgram';

export interface NetworkInterface {
  name: string;
  address: string;
  netmask: string;
  family: 'IPv4' | 'IPv6';
  mac: string;
  internal: boolean;
  cidr: string | null;
  type: 'wifi' | 'ethernet' | 'virtual' | 'unknown';
}

export interface RestaurantServer {
  id: string;
  name: string;
  address: string;
  port: number;
  version: string;
  features: string[];
  lastSeen: Date;
  latency?: number;
  isReachable: boolean;
  type: 'server' | 'client';
}

export interface NetworkStatus {
  isOnline: boolean;
  activeInterfaces: NetworkInterface[];
  currentServer?: RestaurantServer;
  discoveredServers: RestaurantServer[];
  lastCheck: Date;
}

/**
 * Get all available network interfaces, excluding internal and non-IPv4 interfaces
 */
export function getNetworkInterfaces(): NetworkInterface[] {
  const interfaces = networkInterfaces();
  const result: NetworkInterface[] = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    if (!addresses) continue;

    for (const addr of addresses) {
      if (addr.family === 'IPv4' && !addr.internal) {
        result.push({
          name,
          address: addr.address,
          netmask: addr.netmask,
          family: addr.family,
          mac: addr.mac,
          internal: addr.internal,
          cidr: addr.cidr,
          type: detectInterfaceType(name),
        });
      }
    }
  }

  return result;
}

/**
 * Detect the type of network interface based on its name
 */
function detectInterfaceType(interfaceName: string): 'wifi' | 'ethernet' | 'virtual' | 'unknown' {
  const name = interfaceName.toLowerCase();
  
  // Wi-Fi interface patterns
  if (name.includes('wifi') || name.includes('wlan') || name.includes('wi-fi') || 
      name.startsWith('wl') || name.includes('airport')) {
    return 'wifi';
  }
  
  // Ethernet interface patterns
  if (name.includes('ethernet') || name.includes('eth') || name.startsWith('en') ||
      name.includes('local area connection') || name.includes('lan')) {
    return 'ethernet';
  }
  
  // Virtual interface patterns
  if (name.includes('virtual') || name.includes('vmware') || name.includes('vbox') ||
      name.includes('docker') || name.includes('veth') || name.includes('tun') ||
      name.includes('tap') || name.includes('bridge')) {
    return 'virtual';
  }
  
  return 'unknown';
}

/**
 * Get the primary network interface (first non-virtual interface)
 */
export function getPrimaryInterface(): NetworkInterface | null {
  const interfaces = getNetworkInterfaces();
  
  // Prefer ethernet, then wifi, then others
  const ethernet = interfaces.find(iface => iface.type === 'ethernet');
  if (ethernet) return ethernet;
  
  const wifi = interfaces.find(iface => iface.type === 'wifi');
  if (wifi) return wifi;
  
  // Return first non-virtual interface
  const nonVirtual = interfaces.find(iface => iface.type !== 'virtual');
  if (nonVirtual) return nonVirtual;
  
  // Last resort: return any interface
  return interfaces[0] || null;
}

/**
 * Calculate subnet range for a given interface
 */
export function getSubnetRange(iface: NetworkInterface): { start: string; end: string; network: string } {
  const ip = iface.address;
  const netmask = iface.netmask;
  
  // Convert IP and netmask to numbers
  const ipNum = ipToNumber(ip);
  const maskNum = ipToNumber(netmask);
  
  // Calculate network address
  const networkNum = ipNum & maskNum;
  
  // Calculate broadcast address
  const broadcastNum = networkNum | (~maskNum >>> 0);
  
  return {
    start: numberToIp(networkNum + 1),
    end: numberToIp(broadcastNum - 1),
    network: numberToIp(networkNum),
  };
}

/**
 * Convert IP address to number
 */
function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * Convert number to IP address
 */
function numberToIp(num: number): string {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255
  ].join('.');
}

/**
 * Test connectivity to a specific host and port
 */
export async function testConnectivity(host: string, port: number, timeout: number = 5000): Promise<{ isReachable: boolean; latency?: number; error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = createSocket('udp4');
    
    const cleanup = () => {
      socket.close();
    };
    
    const timer = setTimeout(() => {
      cleanup();
      resolve({ isReachable: false, error: 'Timeout' });
    }, timeout);
    
    socket.on('error', (error) => {
      clearTimeout(timer);
      cleanup();
      resolve({ isReachable: false, error: error.message });
    });
    
    socket.on('message', () => {
      const latency = Date.now() - startTime;
      clearTimeout(timer);
      cleanup();
      resolve({ isReachable: true, latency });
    });
    
    // Send a ping packet
    const message = Buffer.from('ping');
    socket.send(message, port, host, (error) => {
      if (error) {
        clearTimeout(timer);
        cleanup();
        resolve({ isReachable: false, error: error.message });
      }
    });
  });
}

/**
 * Test HTTP connectivity to a server
 */
export async function testHttpConnectivity(host: string, port: number, timeout: number = 5000): Promise<{ isReachable: boolean; latency?: number; error?: string }> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(`http://${host}:${port}/api/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    
    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    
    // Consider 2xx, 4xx as reachable (server is responding)
    const isReachable = response.status < 500;
    
    return { isReachable, latency };
  } catch (error: any) {
    clearTimeout(timeoutId);
    return { 
      isReachable: false, 
      error: error.name === 'AbortError' ? 'Timeout' : error.message 
    };
  }
}

/**
 * Generate a broadcast address for a given interface
 */
export function getBroadcastAddress(iface: NetworkInterface): string {
  const ip = iface.address;
  const netmask = iface.netmask;
  
  const ipNum = ipToNumber(ip);
  const maskNum = ipToNumber(netmask);
  const broadcastNum = ipNum | (~maskNum >>> 0);
  
  return numberToIp(broadcastNum);
}

/**
 * Validate if an IP address is in the same subnet as the interface
 */
export function isInSameSubnet(targetIp: string, iface: NetworkInterface): boolean {
  const targetNum = ipToNumber(targetIp);
  const ifaceNum = ipToNumber(iface.address);
  const maskNum = ipToNumber(iface.netmask);
  
  return (targetNum & maskNum) === (ifaceNum & maskNum);
}

/**
 * Get local IP addresses that can be used for binding
 */
export function getBindingAddresses(): string[] {
  const interfaces = getNetworkInterfaces();
  const addresses = interfaces.map(iface => iface.address);
  
  // Always include localhost for local testing
  if (!addresses.includes('127.0.0.1')) {
    addresses.unshift('127.0.0.1');
  }
  
  // Add 0.0.0.0 for binding to all interfaces
  addresses.unshift('0.0.0.0');
  
  return addresses;
}

/**
 * Generate a unique server ID based on network interfaces
 */
export function generateServerId(): string {
  const interfaces = getNetworkInterfaces();
  const primaryInterface = getPrimaryInterface();
  
  if (primaryInterface) {
    // Use MAC address + timestamp for uniqueness
    const timestamp = Date.now().toString(36);
    const macHash = primaryInterface.mac.replace(/:/g, '').toLowerCase();
    return `${macHash}-${timestamp}`;
  }
  
  // Fallback to random ID
  return `server-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create server announcement data
 */
export function createServerAnnouncement(serverPort: number = 5000): any {
  const primaryInterface = getPrimaryInterface();
  const serverId = generateServerId();
  
  return {
    id: serverId,
    service: 'restaurant-management',
    type: 'server',
    name: process.env.RESTAURANT_NAME || 'Restaurant POS',
    address: primaryInterface?.address || 'localhost',
    port: serverPort,
    version: process.env.npm_package_version || '1.0.0',
    features: ['pos', 'kitchen', 'admin', 'customer', 'delivery'],
    capabilities: {
      maxClients: 50,
      supportsOrdering: true,
      supportsPayments: true,
      supportsInventory: true,
      supportsReporting: true,
    },
    networkInterfaces: getNetworkInterfaces().map(iface => ({
      name: iface.name,
      address: iface.address,
      type: iface.type,
    })),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}

/**
 * Validate server announcement data
 */
export function isValidServerAnnouncement(data: any): boolean {
  return (
    data &&
    typeof data.id === 'string' &&
    typeof data.service === 'string' &&
    typeof data.address === 'string' &&
    typeof data.port === 'number' &&
    Array.isArray(data.features) &&
    data.service === 'restaurant-management'
  );
}