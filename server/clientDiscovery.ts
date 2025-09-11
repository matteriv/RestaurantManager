import { EventEmitter } from 'events';
import { createSocket, type Socket } from 'dgram';
import {
  getNetworkInterfaces,
  getPrimaryInterface,
  getBroadcastAddress,
  isValidServerAnnouncement,
  testHttpConnectivity,
  generateServerId,
  type RestaurantServer,
  type NetworkInterface,
  type NetworkStatus,
} from './networkUtils';

export interface ClientDiscoveryConfig {
  port: number;
  discoveryTimeout: number; // ms
  discoveryInterval: number; // ms
  maxRetries: number;
  autoConnect: boolean;
  enableLogging: boolean;
  preferredServerTypes: string[];
  connectionTimeout: number; // ms
}

export interface ConnectionAttempt {
  serverId: string;
  address: string;
  port: number;
  timestamp: Date;
  success: boolean;
  latency?: number;
  error?: string;
}

export interface ClientDiscoveryEvents {
  'server-discovered': (server: RestaurantServer) => void;
  'server-lost': (serverId: string) => void;
  'server-updated': (server: RestaurantServer) => void;
  'connection-attempt': (attempt: ConnectionAttempt) => void;
  'connected': (server: RestaurantServer) => void;
  'disconnected': (serverId: string) => void;
  'network-changed': (status: NetworkStatus) => void;
  'discovery-complete': (servers: RestaurantServer[]) => void;
  'error': (error: Error) => void;
  'started': () => void;
  'stopped': () => void;
}

export declare interface ClientDiscoveryService {
  on<U extends keyof ClientDiscoveryEvents>(
    event: U, 
    listener: ClientDiscoveryEvents[U]
  ): this;
  emit<U extends keyof ClientDiscoveryEvents>(
    event: U, 
    ...args: Parameters<ClientDiscoveryEvents[U]>
  ): boolean;
}

export class ClientDiscoveryService extends EventEmitter {
  private config: ClientDiscoveryConfig;
  private socket: Socket | null = null;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private networkCheckTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isDiscovering = false;
  
  private discoveredServers = new Map<string, RestaurantServer>();
  private connectionAttempts: ConnectionAttempt[] = [];
  private connectedServer: RestaurantServer | null = null;
  private lastNetworkCheck = new Date();
  private currentNetworkInterfaces: NetworkInterface[] = [];
  private clientId: string;

  constructor(config: Partial<ClientDiscoveryConfig> = {}) {
    super();
    
    this.config = {
      port: 44201,
      discoveryTimeout: 10000, // 10 seconds
      discoveryInterval: 30000, // 30 seconds
      maxRetries: 3,
      autoConnect: true,
      enableLogging: true,
      preferredServerTypes: ['server'],
      connectionTimeout: 5000,
      ...config,
    };

    this.clientId = generateServerId();
    this.updateNetworkInterfaces();
    this.setupNetworkMonitoring();
  }

  /**
   * Start the client discovery service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.log('Service already running');
      return;
    }

    try {
      await this.createSocket();
      this.startPeriodicDiscovery();
      this.isRunning = true;
      
      this.log('Client discovery started');
      this.emit('started');
      
      // Perform initial discovery
      await this.discoverServers();
    } catch (error) {
      this.log(`Failed to start service: ${error}`);
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Stop the client discovery service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.isDiscovering = false;
    
    // Clear all timers
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    
    if (this.networkCheckTimer) {
      clearInterval(this.networkCheckTimer);
      this.networkCheckTimer = null;
    }

    // Close socket
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    // Disconnect from current server
    if (this.connectedServer) {
      this.emit('disconnected', this.connectedServer.id);
      this.connectedServer = null;
    }

    this.discoveredServers.clear();
    this.connectionAttempts = [];
    
    this.log('Client discovery stopped');
    this.emit('stopped');
  }

  /**
   * Restart the service
   */
  async restart(): Promise<void> {
    this.log('Restarting client discovery service...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay
    await this.start();
  }

  /**
   * Manually discover servers on the network
   */
  async discoverServers(): Promise<RestaurantServer[]> {
    if (!this.socket || this.isDiscovering) {
      return Array.from(this.discoveredServers.values());
    }

    this.isDiscovering = true;
    this.log('Starting server discovery...');

    try {
      // Clear old servers
      this.discoveredServers.clear();
      
      // Send discovery requests to all network interfaces
      await this.sendDiscoveryRequests();
      
      // Wait for responses
      await new Promise(resolve => setTimeout(resolve, this.config.discoveryTimeout));
      
      const servers = Array.from(this.discoveredServers.values());
      this.log(`Discovery complete. Found ${servers.length} servers`);
      
      this.emit('discovery-complete', servers);
      
      // Auto-connect to best server if enabled
      if (this.config.autoConnect && servers.length > 0 && !this.connectedServer) {
        await this.connectToBestServer(servers);
      }
      
      return servers;
    } finally {
      this.isDiscovering = false;
    }
  }

  /**
   * Connect to a specific server
   */
  async connectToServer(server: RestaurantServer): Promise<boolean> {
    const attempt: ConnectionAttempt = {
      serverId: server.id,
      address: server.address,
      port: server.port,
      timestamp: new Date(),
      success: false,
    };

    this.emit('connection-attempt', attempt);
    this.log(`Attempting to connect to ${server.name} at ${server.address}:${server.port}`);

    try {
      const result = await testHttpConnectivity(server.address, server.port, this.config.connectionTimeout);
      
      if (result.isReachable) {
        attempt.success = true;
        attempt.latency = result.latency;
        
        // Update server data
        const updatedServer: RestaurantServer = {
          ...server,
          lastSeen: new Date(),
          latency: result.latency,
          isReachable: true,
        };
        
        this.discoveredServers.set(server.id, updatedServer);
        this.connectedServer = updatedServer;
        
        this.log(`Successfully connected to ${server.name}`);
        this.emit('connected', updatedServer);
        return true;
      } else {
        attempt.error = result.error;
        this.log(`Failed to connect to ${server.name}: ${result.error}`);
        return false;
      }
    } catch (error: any) {
      attempt.error = error.message;
      this.log(`Connection error to ${server.name}: ${error.message}`);
      return false;
    } finally {
      this.connectionAttempts.push(attempt);
      
      // Keep only last 50 attempts
      if (this.connectionAttempts.length > 50) {
        this.connectionAttempts = this.connectionAttempts.slice(-50);
      }
    }
  }

  /**
   * Disconnect from current server
   */
  disconnect(): void {
    if (this.connectedServer) {
      const serverId = this.connectedServer.id;
      this.connectedServer = null;
      this.log('Disconnected from server');
      this.emit('disconnected', serverId);
    }
  }

  /**
   * Get discovered servers
   */
  getDiscoveredServers(): RestaurantServer[] {
    return Array.from(this.discoveredServers.values());
  }

  /**
   * Get current connected server
   */
  getConnectedServer(): RestaurantServer | null {
    return this.connectedServer;
  }

  /**
   * Get connection attempts history
   */
  getConnectionAttempts(): ConnectionAttempt[] {
    return [...this.connectionAttempts];
  }

  /**
   * Get network status
   */
  getNetworkStatus(): NetworkStatus {
    return {
      isOnline: this.isRunning && this.currentNetworkInterfaces.length > 0,
      activeInterfaces: this.currentNetworkInterfaces,
      currentServer: this.connectedServer || undefined,
      discoveredServers: Array.from(this.discoveredServers.values()),
      lastCheck: this.lastNetworkCheck,
    };
  }

  /**
   * Test connectivity to current server
   */
  async testCurrentConnection(): Promise<boolean> {
    if (!this.connectedServer) {
      return false;
    }

    return await this.connectToServer(this.connectedServer);
  }

  /**
   * Force a network refresh
   */
  async refreshNetwork(): Promise<void> {
    this.updateNetworkInterfaces();
    
    if (this.isRunning) {
      // Re-discover servers on new network
      await this.discoverServers();
    }
  }

  private async createSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createSocket('udp4');
      
      this.socket.on('error', (error) => {
        this.log(`Socket error: ${error.message}`);
        this.emit('error', error);
      });

      this.socket.on('message', (message, remote) => {
        this.handleIncomingMessage(message, remote);
      });

      this.socket.on('listening', () => {
        if (this.socket) {
          this.socket.setBroadcast(true);
          const address = this.socket.address();
          this.log(`UDP socket listening on ${address.address}:${address.port}`);
          resolve();
        }
      });

      // Bind to any available port
      this.socket.bind(0, '0.0.0.0', (error) => {
        if (error) {
          this.log(`Failed to bind socket: ${error.message}`);
          reject(error);
        }
      });
    });
  }

  private startPeriodicDiscovery(): void {
    this.discoveryTimer = setInterval(() => {
      if (!this.isDiscovering) {
        this.discoverServers().catch(error => {
          this.log(`Periodic discovery error: ${error}`);
        });
      }
    }, this.config.discoveryInterval);
  }

  private async sendDiscoveryRequests(): Promise<void> {
    if (!this.socket) return;

    const interfaces = getNetworkInterfaces();
    const message = Buffer.from(JSON.stringify({
      type: 'restaurant-pos-discovery-request',
      clientId: this.clientId,
      timestamp: new Date().toISOString(),
    }));

    for (const iface of interfaces) {
      try {
        const broadcastAddr = getBroadcastAddress(iface);
        
        await new Promise<void>((resolve, reject) => {
          this.socket!.send(message, this.config.port, broadcastAddr, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });

        this.log(`Discovery request sent to ${broadcastAddr} via ${iface.name}`);
      } catch (error) {
        this.log(`Failed to send discovery request on ${iface.name}: ${error}`);
      }
    }
  }

  private handleIncomingMessage(message: Buffer, remote: any): void {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'restaurant-pos-announcement' && data.data) {
        this.handleServerAnnouncement(data.data, remote);
      }
    } catch (error) {
      this.log(`Error parsing incoming message: ${error}`);
    }
  }

  private handleServerAnnouncement(serverData: any, remote: any): void {
    if (!isValidServerAnnouncement(serverData)) {
      this.log(`Invalid server announcement from ${remote.address}`);
      return;
    }

    const server: RestaurantServer = {
      id: serverData.id,
      name: serverData.name || 'Unknown Restaurant',
      address: serverData.address || remote.address,
      port: serverData.port || 5000,
      version: serverData.version || '1.0.0',
      features: serverData.features || [],
      lastSeen: new Date(),
      isReachable: true,
      type: serverData.type || 'server',
    };

    const existing = this.discoveredServers.get(server.id);
    
    if (!existing) {
      this.discoveredServers.set(server.id, server);
      this.log(`Discovered new server: ${server.name} at ${server.address}:${server.port}`);
      this.emit('server-discovered', server);
    } else {
      // Update existing server
      const updated = { ...existing, ...server, lastSeen: new Date() };
      this.discoveredServers.set(server.id, updated);
      this.emit('server-updated', updated);
    }
  }

  private async connectToBestServer(servers: RestaurantServer[]): Promise<void> {
    // Sort servers by preference
    const sortedServers = this.sortServersByPreference(servers);
    
    for (const server of sortedServers) {
      const connected = await this.connectToServer(server);
      if (connected) {
        break; // Successfully connected
      }
    }
  }

  private sortServersByPreference(servers: RestaurantServer[]): RestaurantServer[] {
    return servers.sort((a, b) => {
      // Prefer servers in preferredServerTypes
      const aPreferred = this.config.preferredServerTypes.includes(a.type);
      const bPreferred = this.config.preferredServerTypes.includes(b.type);
      
      if (aPreferred && !bPreferred) return -1;
      if (!aPreferred && bPreferred) return 1;
      
      // Then prefer by latency (if available)
      if (a.latency && b.latency) {
        return a.latency - b.latency;
      }
      
      // Finally by last seen (more recent first)
      return b.lastSeen.getTime() - a.lastSeen.getTime();
    });
  }

  private setupNetworkMonitoring(): void {
    this.networkCheckTimer = setInterval(() => {
      this.checkNetworkChanges();
    }, 15000); // Every 15 seconds
  }

  private checkNetworkChanges(): void {
    const currentInterfaces = getNetworkInterfaces();
    const previousInterfaces = this.currentNetworkInterfaces;
    
    // Check for changes in network interfaces
    const interfacesChanged = this.haveInterfacesChanged(currentInterfaces, previousInterfaces);
    
    if (interfacesChanged) {
      this.log('Network interfaces changed, refreshing discovery...');
      this.updateNetworkInterfaces();
      
      const status = this.getNetworkStatus();
      this.emit('network-changed', status);
      
      // Test current connection if we have one
      if (this.connectedServer) {
        this.testCurrentConnection().then(connected => {
          if (!connected) {
            this.disconnect();
            // Try to discover and reconnect
            this.discoverServers().catch(error => {
              this.log(`Failed to rediscover after network change: ${error}`);
            });
          }
        });
      } else if (this.isRunning) {
        // Rediscover servers on new network
        this.discoverServers().catch(error => {
          this.log(`Failed to discover on network change: ${error}`);
        });
      }
    }
    
    this.lastNetworkCheck = new Date();
  }

  private haveInterfacesChanged(current: NetworkInterface[], previous: NetworkInterface[]): boolean {
    if (current.length !== previous.length) {
      return true;
    }
    
    for (const currentIface of current) {
      const match = previous.find(prev => 
        prev.name === currentIface.name && 
        prev.address === currentIface.address &&
        prev.type === currentIface.type
      );
      
      if (!match) {
        return true;
      }
    }
    
    return false;
  }

  private updateNetworkInterfaces(): void {
    this.currentNetworkInterfaces = getNetworkInterfaces();
    this.log(`Updated network interfaces: ${this.currentNetworkInterfaces.length} active`);
  }

  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[ClientDiscovery] ${message}`);
    }
  }
}

// Export singleton instance
let instance: ClientDiscoveryService | null = null;

export function getClientDiscoveryService(config?: Partial<ClientDiscoveryConfig>): ClientDiscoveryService {
  if (!instance) {
    instance = new ClientDiscoveryService(config);
  }
  return instance;
}

export function createClientDiscoveryService(config?: Partial<ClientDiscoveryConfig>): ClientDiscoveryService {
  return new ClientDiscoveryService(config);
}