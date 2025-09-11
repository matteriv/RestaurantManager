import { EventEmitter } from 'events';
import { createSocket, type Socket } from 'dgram';
import {
  getNetworkInterfaces,
  getPrimaryInterface,
  getBroadcastAddress,
  createServerAnnouncement,
  isValidServerAnnouncement,
  testHttpConnectivity,
  type RestaurantServer,
  type NetworkInterface,
  type NetworkStatus,
} from './networkUtils';

export interface ServerDiscoveryConfig {
  port: number;
  serverPort: number;
  broadcastInterval: number; // ms
  maxRetries: number;
  timeout: number; // ms
  autoRestart: boolean;
  enableLogging: boolean;
}

export interface DiscoveryEvents {
  'server-discovered': (server: RestaurantServer) => void;
  'server-lost': (serverId: string) => void;
  'server-updated': (server: RestaurantServer) => void;
  'network-changed': (status: NetworkStatus) => void;
  'error': (error: Error) => void;
  'started': () => void;
  'stopped': () => void;
}

export declare interface ServerDiscoveryService {
  on<U extends keyof DiscoveryEvents>(
    event: U, 
    listener: DiscoveryEvents[U]
  ): this;
  emit<U extends keyof DiscoveryEvents>(
    event: U, 
    ...args: Parameters<DiscoveryEvents[U]>
  ): boolean;
}

export class ServerDiscoveryService extends EventEmitter {
  private config: ServerDiscoveryConfig;
  private socket: Socket | null = null;
  private broadcastTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private networkCheckTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  
  private discoveredServers = new Map<string, RestaurantServer>();
  private lastNetworkCheck = new Date();
  private currentNetworkInterfaces: NetworkInterface[] = [];
  private serverId: string;
  private serverData: any;

  constructor(config: Partial<ServerDiscoveryConfig> = {}) {
    super();
    
    this.config = {
      port: 44201,
      serverPort: 5000,
      broadcastInterval: 10000, // 10 seconds
      maxRetries: 3,
      timeout: 5000,
      autoRestart: true,
      enableLogging: true,
      ...config,
    };

    this.serverId = '';
    this.updateServerData();
    this.updateNetworkInterfaces();
    
    // Set up network monitoring
    this.setupNetworkMonitoring();
  }

  /**
   * Start the server discovery service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.log('Service already running');
      return;
    }

    try {
      await this.createSocket();
      this.startBroadcasting();
      this.startServerCleanup();
      this.isRunning = true;
      
      this.log(`Server discovery started on port ${this.config.port}`);
      this.log(`Broadcasting server on ${this.serverData.address}:${this.serverData.port}`);
      this.emit('started');
    } catch (error) {
      this.log(`Failed to start service: ${error}`);
      this.emit('error', error as Error);
      throw error;
    }
  }

  /**
   * Stop the server discovery service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    // Clear all timers
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
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

    this.discoveredServers.clear();
    this.log('Server discovery stopped');
    this.emit('stopped');
  }

  /**
   * Restart the service
   */
  async restart(): Promise<void> {
    this.log('Restarting server discovery service...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief delay
    await this.start();
  }

  /**
   * Get the current network status
   */
  getNetworkStatus(): NetworkStatus {
    return {
      isOnline: this.isRunning && this.currentNetworkInterfaces.length > 0,
      activeInterfaces: this.currentNetworkInterfaces,
      discoveredServers: Array.from(this.discoveredServers.values()),
      lastCheck: this.lastNetworkCheck,
    };
  }

  /**
   * Get discovered servers
   */
  getDiscoveredServers(): RestaurantServer[] {
    return Array.from(this.discoveredServers.values());
  }

  /**
   * Manually test connectivity to a server
   */
  async testServerConnectivity(server: RestaurantServer): Promise<boolean> {
    try {
      const result = await testHttpConnectivity(server.address, server.port, this.config.timeout);
      
      if (result.isReachable) {
        // Update server data
        const updatedServer: RestaurantServer = {
          ...server,
          lastSeen: new Date(),
          latency: result.latency,
          isReachable: true,
        };
        
        this.discoveredServers.set(server.id, updatedServer);
        this.emit('server-updated', updatedServer);
        return true;
      } else {
        // Mark as unreachable
        const updatedServer: RestaurantServer = {
          ...server,
          isReachable: false,
        };
        
        this.discoveredServers.set(server.id, updatedServer);
        this.emit('server-updated', updatedServer);
        return false;
      }
    } catch (error) {
      this.log(`Error testing connectivity to ${server.address}:${server.port}: ${error}`);
      return false;
    }
  }

  /**
   * Force a network refresh
   */
  async refreshNetwork(): Promise<void> {
    this.updateNetworkInterfaces();
    this.updateServerData();
    
    if (this.isRunning && this.config.autoRestart) {
      await this.restart();
    }
  }

  /**
   * Get current server announcement data
   */
  getServerData(): any {
    return { ...this.serverData };
  }

  private async createSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createSocket('udp4');
      
      this.socket.on('error', (error) => {
        this.log(`Socket error: ${error.message}`);
        if (this.config.autoRestart && this.isRunning) {
          setTimeout(() => this.restart(), 5000);
        }
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

      // Bind to all interfaces
      this.socket.bind(this.config.port, '0.0.0.0', (error) => {
        if (error) {
          this.log(`Failed to bind socket: ${error.message}`);
          reject(error);
        }
      });
    });
  }

  private startBroadcasting(): void {
    this.broadcastAnnouncement(); // Send immediately
    
    this.broadcastTimer = setInterval(() => {
      this.broadcastAnnouncement();
    }, this.config.broadcastInterval);
  }

  private async broadcastAnnouncement(): Promise<void> {
    if (!this.socket || !this.isRunning) return;

    const interfaces = getNetworkInterfaces();
    const message = Buffer.from(JSON.stringify({
      type: 'restaurant-pos-announcement',
      data: this.serverData,
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

        this.log(`Broadcast sent to ${broadcastAddr} via ${iface.name} (${iface.address})`);
      } catch (error) {
        this.log(`Failed to broadcast on ${iface.name}: ${error}`);
      }
    }
  }

  private handleIncomingMessage(message: Buffer, remote: any): void {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'restaurant-pos-announcement' && data.data) {
        this.handleServerAnnouncement(data.data, remote);
      } else if (data.type === 'restaurant-pos-discovery-request') {
        // Respond to discovery request with our announcement
        this.sendDirectResponse(remote);
      }
    } catch (error) {
      this.log(`Error parsing incoming message: ${error}`);
    }
  }

  private handleServerAnnouncement(serverData: any, remote: any): void {
    // Don't process our own announcements
    if (serverData.id === this.serverId) {
      return;
    }

    if (!isValidServerAnnouncement(serverData)) {
      this.log(`Invalid server announcement from ${remote.address}`);
      return;
    }

    const server: RestaurantServer = {
      id: serverData.id,
      name: serverData.name || 'Unknown Restaurant',
      address: serverData.address || remote.address,
      port: serverData.port || this.config.serverPort,
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

  private async sendDirectResponse(remote: any): Promise<void> {
    if (!this.socket || !this.isRunning) return;

    const response = Buffer.from(JSON.stringify({
      type: 'restaurant-pos-announcement',
      data: this.serverData,
    }));

    try {
      await new Promise<void>((resolve, reject) => {
        this.socket!.send(response, remote.port, remote.address, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.log(`Direct response sent to ${remote.address}:${remote.port}`);
    } catch (error) {
      this.log(`Failed to send direct response: ${error}`);
    }
  }

  private startServerCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleServers();
    }, 30000); // Every 30 seconds
  }

  private cleanupStaleServers(): void {
    const staleThreshold = 60000; // 1 minute
    const now = new Date();
    
    for (const [id, server] of this.discoveredServers.entries()) {
      const timeSinceLastSeen = now.getTime() - server.lastSeen.getTime();
      
      if (timeSinceLastSeen > staleThreshold) {
        this.discoveredServers.delete(id);
        this.log(`Server ${server.name} (${id}) marked as lost`);
        this.emit('server-lost', id);
      }
    }
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
      this.log('Network interfaces changed, updating configuration...');
      this.updateNetworkInterfaces();
      this.updateServerData();
      
      const status = this.getNetworkStatus();
      this.emit('network-changed', status);
      
      if (this.config.autoRestart && this.isRunning) {
        this.restart().catch(error => {
          this.log(`Failed to restart after network change: ${error}`);
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

  private updateServerData(): void {
    this.serverData = createServerAnnouncement(this.config.serverPort);
    this.serverId = this.serverData.id;
    this.log(`Updated server data: ${this.serverData.name} (${this.serverId})`);
  }

  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[ServerDiscovery] ${message}`);
    }
  }
}

// Export singleton instance
let instance: ServerDiscoveryService | null = null;

export function getServerDiscoveryService(config?: Partial<ServerDiscoveryConfig>): ServerDiscoveryService {
  if (!instance) {
    instance = new ServerDiscoveryService(config);
  }
  return instance;
}

export function createServerDiscoveryService(config?: Partial<ServerDiscoveryConfig>): ServerDiscoveryService {
  return new ServerDiscoveryService(config);
}