import { EventEmitter } from 'events';
import {
  testHttpConnectivity,
  getNetworkInterfaces,
  type RestaurantServer,
  type NetworkStatus,
  type NetworkInterface,
} from './networkUtils';
import { getNetworkConfigManager, type ConnectionHistory, type NetworkConfigManager } from './networkConfig';

export interface HealthMonitorConfig {
  checkInterval: number; // ms
  connectionTimeout: number; // ms
  maxRetries: number;
  retryDelay: number; // ms
  enableAutoReconnect: boolean;
  enableNetworkDetection: boolean;
  enableLogging: boolean;
  healthThreshold: number; // successful checks out of last N
  samplingWindow: number; // number of recent checks to consider
}

export interface HealthCheckResult {
  serverId: string;
  address: string;
  port: number;
  timestamp: Date;
  isHealthy: boolean;
  latency?: number;
  error?: string;
  attempt: number;
}

export interface NetworkHealthStatus {
  isOnline: boolean;
  connectedServer?: RestaurantServer;
  serverHealth: Map<string, HealthCheckResult[]>;
  networkInterfaces: NetworkInterface[];
  lastNetworkCheck: Date;
  totalChecks: number;
  failedChecks: number;
  averageLatency?: number;
}

export interface HealthMonitorEvents {
  'health-check': (result: HealthCheckResult) => void;
  'server-healthy': (serverId: string) => void;
  'server-unhealthy': (serverId: string, error: string) => void;
  'connection-lost': (serverId: string) => void;
  'connection-restored': (serverId: string) => void;
  'reconnect-attempt': (serverId: string, attempt: number) => void;
  'reconnect-success': (serverId: string) => void;
  'reconnect-failed': (serverId: string, maxRetriesReached: boolean) => void;
  'network-changed': (interfaces: NetworkInterface[]) => void;
  'status-update': (status: NetworkHealthStatus) => void;
  'error': (error: Error) => void;
}

export declare interface NetworkHealthMonitor {
  on<U extends keyof HealthMonitorEvents>(
    event: U, 
    listener: HealthMonitorEvents[U]
  ): this;
  emit<U extends keyof HealthMonitorEvents>(
    event: U, 
    ...args: Parameters<HealthMonitorEvents[U]>
  ): boolean;
}

export class NetworkHealthMonitor extends EventEmitter {
  private config: HealthMonitorConfig;
  private configManager: NetworkConfigManager;
  private isRunning = false;
  private checkTimer: NodeJS.Timeout | null = null;
  private networkTimer: NodeJS.Timeout | null = null;
  
  private monitoredServers = new Map<string, RestaurantServer>();
  private serverHealth = new Map<string, HealthCheckResult[]>();
  private reconnectAttempts = new Map<string, number>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  private currentInterfaces: NetworkInterface[] = [];
  private connectedServer: RestaurantServer | null = null;
  
  private totalChecks = 0;
  private failedChecks = 0;

  constructor(config: Partial<HealthMonitorConfig> = {}) {
    super();
    
    this.config = {
      checkInterval: 10000, // 10 seconds
      connectionTimeout: 5000,
      maxRetries: 3,
      retryDelay: 5000, // 5 seconds
      enableAutoReconnect: true,
      enableNetworkDetection: true,
      enableLogging: true,
      healthThreshold: 3, // 3 out of 5 checks must succeed
      samplingWindow: 5,
      ...config,
    };

    this.configManager = getNetworkConfigManager();
    this.updateNetworkInterfaces();
  }

  /**
   * Start the health monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.log('Health monitor already running');
      return;
    }

    this.isRunning = true;
    this.startHealthChecks();
    
    if (this.config.enableNetworkDetection) {
      this.startNetworkMonitoring();
    }

    this.log('Network health monitor started');
  }

  /**
   * Stop the health monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Clear timers
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    if (this.networkTimer) {
      clearInterval(this.networkTimer);
      this.networkTimer = null;
    }

    // Clear reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    this.log('Network health monitor stopped');
  }

  /**
   * Add a server to monitor
   */
  addServer(server: RestaurantServer): void {
    this.monitoredServers.set(server.id, server);
    
    if (!this.serverHealth.has(server.id)) {
      this.serverHealth.set(server.id, []);
    }

    this.log(`Added server to monitoring: ${server.name} (${server.address}:${server.port})`);
  }

  /**
   * Remove a server from monitoring
   */
  removeServer(serverId: string): void {
    const server = this.monitoredServers.get(serverId);
    if (server) {
      this.monitoredServers.delete(serverId);
      this.serverHealth.delete(serverId);
      this.reconnectAttempts.delete(serverId);
      
      // Clear reconnect timer if exists
      const timer = this.reconnectTimers.get(serverId);
      if (timer) {
        clearTimeout(timer);
        this.reconnectTimers.delete(serverId);
      }

      this.log(`Removed server from monitoring: ${server.name}`);
    }
  }

  /**
   * Set the currently connected server
   */
  setConnectedServer(server: RestaurantServer | null): void {
    this.connectedServer = server;
    
    if (server) {
      this.addServer(server);
      this.log(`Set connected server: ${server.name}`);
    } else {
      this.log('Cleared connected server');
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): NetworkHealthStatus {
    const averageLatency = this.calculateAverageLatency();
    
    return {
      isOnline: this.isRunning && this.currentInterfaces.length > 0,
      connectedServer: this.connectedServer || undefined,
      serverHealth: new Map(this.serverHealth),
      networkInterfaces: [...this.currentInterfaces],
      lastNetworkCheck: new Date(),
      totalChecks: this.totalChecks,
      failedChecks: this.failedChecks,
      averageLatency,
    };
  }

  /**
   * Get server health for a specific server
   */
  getServerHealth(serverId: string): HealthCheckResult[] {
    return [...(this.serverHealth.get(serverId) || [])];
  }

  /**
   * Check if a server is currently healthy
   */
  isServerHealthy(serverId: string): boolean {
    const checks = this.serverHealth.get(serverId) || [];
    if (checks.length === 0) return false;

    const recentChecks = checks.slice(-this.config.samplingWindow);
    const healthyChecks = recentChecks.filter(check => check.isHealthy).length;
    
    return healthyChecks >= this.config.healthThreshold;
  }

  /**
   * Force a health check for all servers
   */
  async checkAllServers(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    
    for (const [serverId, server] of this.monitoredServers.entries()) {
      const result = await this.checkServerHealth(server);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Force a health check for a specific server
   */
  async checkServer(serverId: string): Promise<HealthCheckResult | null> {
    const server = this.monitoredServers.get(serverId);
    if (!server) return null;

    return await this.checkServerHealth(server);
  }

  private startHealthChecks(): void {
    this.checkTimer = setInterval(async () => {
      if (this.monitoredServers.size === 0) return;

      for (const [serverId, server] of this.monitoredServers.entries()) {
        try {
          await this.checkServerHealth(server);
        } catch (error) {
          this.log(`Error checking server ${server.name}: ${error}`);
        }
      }

      // Emit status update
      const status = this.getHealthStatus();
      this.emit('status-update', status);
    }, this.config.checkInterval);
  }

  private async checkServerHealth(server: RestaurantServer): Promise<HealthCheckResult> {
    const startTime = Date.now();
    this.totalChecks++;

    try {
      const connectivity = await testHttpConnectivity(
        server.address, 
        server.port, 
        this.config.connectionTimeout
      );

      const result: HealthCheckResult = {
        serverId: server.id,
        address: server.address,
        port: server.port,
        timestamp: new Date(),
        isHealthy: connectivity.isReachable,
        latency: connectivity.latency,
        error: connectivity.error,
        attempt: 1,
      };

      // Store result
      this.storeHealthResult(server.id, result);

      // Emit events
      this.emit('health-check', result);

      if (result.isHealthy) {
        this.handleHealthyServer(server.id);
      } else {
        this.failedChecks++;
        this.handleUnhealthyServer(server.id, result.error || 'Unknown error');
      }

      // Save to connection history if this is the connected server
      if (this.connectedServer && this.connectedServer.id === server.id) {
        await this.saveConnectionHistory(server, result);
      }

      return result;
    } catch (error: any) {
      this.failedChecks++;
      
      const result: HealthCheckResult = {
        serverId: server.id,
        address: server.address,
        port: server.port,
        timestamp: new Date(),
        isHealthy: false,
        error: error.message,
        attempt: 1,
      };

      this.storeHealthResult(server.id, result);
      this.emit('health-check', result);
      this.handleUnhealthyServer(server.id, error.message);

      return result;
    }
  }

  private storeHealthResult(serverId: string, result: HealthCheckResult): void {
    let results = this.serverHealth.get(serverId) || [];
    results.push(result);

    // Keep only recent results
    if (results.length > this.config.samplingWindow * 2) {
      results = results.slice(-this.config.samplingWindow * 2);
    }

    this.serverHealth.set(serverId, results);
  }

  private handleHealthyServer(serverId: string): void {
    const wasUnhealthy = !this.isServerHealthy(serverId);
    
    if (wasUnhealthy) {
      this.emit('server-healthy', serverId);
      
      // If this was the connected server, emit connection restored
      if (this.connectedServer && this.connectedServer.id === serverId) {
        this.emit('connection-restored', serverId);
      }
    }

    // Clear reconnect attempts
    this.reconnectAttempts.delete(serverId);
    const timer = this.reconnectTimers.get(serverId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(serverId);
    }
  }

  private handleUnhealthyServer(serverId: string, error: string): void {
    const wasHealthy = this.isServerHealthy(serverId);
    
    if (wasHealthy) {
      this.emit('server-unhealthy', serverId, error);
      
      // If this was the connected server, emit connection lost
      if (this.connectedServer && this.connectedServer.id === serverId) {
        this.emit('connection-lost', serverId);
      }
    }

    // Start reconnection attempts if enabled
    if (this.config.enableAutoReconnect && this.connectedServer && this.connectedServer.id === serverId) {
      this.startReconnectAttempts(serverId);
    }
  }

  private startReconnectAttempts(serverId: string): void {
    const attempts = this.reconnectAttempts.get(serverId) || 0;
    
    if (attempts >= this.config.maxRetries) {
      this.emit('reconnect-failed', serverId, true);
      return;
    }

    const server = this.monitoredServers.get(serverId);
    if (!server) return;

    // Clear existing timer
    const existingTimer = this.reconnectTimers.get(serverId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule reconnect attempt
    const timer = setTimeout(async () => {
      const newAttempts = attempts + 1;
      this.reconnectAttempts.set(serverId, newAttempts);
      
      this.emit('reconnect-attempt', serverId, newAttempts);
      this.log(`Reconnect attempt ${newAttempts}/${this.config.maxRetries} for server ${server.name}`);

      try {
        const result = await this.checkServerHealth(server);
        
        if (result.isHealthy) {
          this.emit('reconnect-success', serverId);
          this.log(`Reconnected to server ${server.name}`);
        } else {
          // Schedule next attempt
          this.startReconnectAttempts(serverId);
        }
      } catch (error) {
        this.log(`Reconnect attempt failed for ${server.name}: ${error}`);
        this.startReconnectAttempts(serverId);
      }
    }, this.config.retryDelay * Math.pow(2, attempts)); // Exponential backoff

    this.reconnectTimers.set(serverId, timer);
  }

  private startNetworkMonitoring(): void {
    this.networkTimer = setInterval(() => {
      this.checkNetworkChanges();
    }, 15000); // Every 15 seconds
  }

  private checkNetworkChanges(): void {
    const newInterfaces = getNetworkInterfaces();
    const oldInterfaces = this.currentInterfaces;
    
    if (this.haveInterfacesChanged(newInterfaces, oldInterfaces)) {
      this.log('Network interfaces changed');
      this.currentInterfaces = newInterfaces;
      this.emit('network-changed', newInterfaces);
      
      // Force health checks on all servers after network change
      setTimeout(() => {
        this.checkAllServers().catch(error => {
          this.log(`Error during post-network-change health check: ${error}`);
        });
      }, 2000); // Wait 2 seconds for network to stabilize
    }
  }

  private haveInterfacesChanged(current: NetworkInterface[], previous: NetworkInterface[]): boolean {
    if (current.length !== previous.length) return true;
    
    for (const currentIface of current) {
      const match = previous.find(prev => 
        prev.name === currentIface.name && 
        prev.address === currentIface.address &&
        prev.type === currentIface.type
      );
      if (!match) return true;
    }
    
    return false;
  }

  private updateNetworkInterfaces(): void {
    this.currentInterfaces = getNetworkInterfaces();
  }

  private calculateAverageLatency(): number | undefined {
    let totalLatency = 0;
    let count = 0;

    for (const results of this.serverHealth.values()) {
      for (const result of results) {
        if (result.isHealthy && result.latency !== undefined) {
          totalLatency += result.latency;
          count++;
        }
      }
    }

    return count > 0 ? totalLatency / count : undefined;
  }

  private async saveConnectionHistory(server: RestaurantServer, result: HealthCheckResult): Promise<void> {
    try {
      await this.configManager.addConnectionHistory({
        serverId: server.id,
        serverName: server.name,
        address: server.address,
        port: server.port,
        timestamp: result.timestamp,
        success: result.isHealthy,
        error: result.error,
      });
    } catch (error) {
      this.log(`Failed to save connection history: ${error}`);
    }
  }

  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[NetworkHealthMonitor] ${message}`);
    }
  }
}

// Singleton instance
let healthMonitor: NetworkHealthMonitor | null = null;

export function getNetworkHealthMonitor(config?: Partial<HealthMonitorConfig>): NetworkHealthMonitor {
  if (!healthMonitor) {
    healthMonitor = new NetworkHealthMonitor(config);
  }
  return healthMonitor;
}

export function createNetworkHealthMonitor(config?: Partial<HealthMonitorConfig>): NetworkHealthMonitor {
  return new NetworkHealthMonitor(config);
}