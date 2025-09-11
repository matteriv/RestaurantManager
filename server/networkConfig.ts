import { promises as fs } from 'fs';
import { join } from 'path';
import { type RestaurantServer, type NetworkInterface } from './networkUtils';
import { type ConnectionAttempt } from './clientDiscovery';

export interface NetworkConfiguration {
  version: string;
  lastUpdated: Date;
  clientId: string;
  mode: 'server' | 'client' | 'auto';
  preferences: NetworkPreferences;
  discoveredServers: StoredServer[];
  connectionHistory: ConnectionHistory[];
  networkProfiles: NetworkProfile[];
}

export interface NetworkPreferences {
  autoConnect: boolean;
  preferredServerTypes: string[];
  connectionTimeout: number;
  discoveryInterval: number;
  retryAttempts: number;
  enableLogging: boolean;
  saveConnectionHistory: boolean;
  maxHistoryEntries: number;
}

export interface StoredServer extends RestaurantServer {
  isFavorite: boolean;
  priority: number;
  connectionCount: number;
  lastConnected?: Date;
  savedAt: Date;
  nickname?: string;
  notes?: string;
}

export interface ConnectionHistory {
  id: string;
  serverId: string;
  serverName: string;
  address: string;
  port: number;
  timestamp: Date;
  duration?: number; // ms
  success: boolean;
  error?: string;
  networkProfile?: string;
}

export interface NetworkProfile {
  id: string;
  name: string;
  description?: string;
  networkInterfaces: NetworkInterface[];
  preferredServers: string[]; // server IDs
  autoConnectServer?: string; // server ID
  createdAt: Date;
  lastUsed?: Date;
}

export interface NetworkConfigManager {
  loadConfig(): Promise<NetworkConfiguration>;
  saveConfig(config: NetworkConfiguration): Promise<void>;
  addServer(server: RestaurantServer, options?: Partial<Pick<StoredServer, 'isFavorite' | 'priority' | 'nickname' | 'notes'>>): Promise<void>;
  removeServer(serverId: string): Promise<void>;
  updateServer(serverId: string, updates: Partial<StoredServer>): Promise<void>;
  getServer(serverId: string): Promise<StoredServer | null>;
  getServers(): Promise<StoredServer[]>;
  getFavoriteServers(): Promise<StoredServer[]>;
  addConnectionHistory(history: Omit<ConnectionHistory, 'id'>): Promise<void>;
  getConnectionHistory(serverId?: string): Promise<ConnectionHistory[]>;
  clearConnectionHistory(): Promise<void>;
  addNetworkProfile(profile: Omit<NetworkProfile, 'id' | 'createdAt'>): Promise<NetworkProfile>;
  updateNetworkProfile(profileId: string, updates: Partial<NetworkProfile>): Promise<void>;
  getNetworkProfiles(): Promise<NetworkProfile[]>;
  deleteNetworkProfile(profileId: string): Promise<void>;
  exportConfig(): Promise<string>;
  importConfig(configData: string): Promise<void>;
  reset(): Promise<void>;
}

export class FileNetworkConfigManager implements NetworkConfigManager {
  private configPath: string;
  private config: NetworkConfiguration | null = null;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(configPath?: string) {
    this.configPath = configPath || join(process.cwd(), '.network-config.json');
  }

  async loadConfig(): Promise<NetworkConfiguration> {
    if (this.config) {
      return this.config;
    }

    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Convert date strings back to Date objects
      this.config = this.deserializeConfig(parsed);
      
      // Upgrade config if needed
      this.config = this.upgradeConfig(this.config);
      
      return this.config;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create default config
        this.config = this.createDefaultConfig();
        await this.saveConfig(this.config);
        return this.config;
      }
      throw error;
    }
  }

  async saveConfig(config: NetworkConfiguration): Promise<void> {
    this.config = { ...config, lastUpdated: new Date() };
    
    // Debounce saves to avoid too frequent writes
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(async () => {
      try {
        const serialized = this.serializeConfig(this.config!);
        await fs.writeFile(this.configPath, JSON.stringify(serialized, null, 2), 'utf-8');
      } catch (error) {
        console.error('Failed to save network config:', error);
      }
    }, 1000);
  }

  async addServer(server: RestaurantServer, options: Partial<Pick<StoredServer, 'isFavorite' | 'priority' | 'nickname' | 'notes'>> = {}): Promise<void> {
    const config = await this.loadConfig();
    
    // Check if server already exists
    const existingIndex = config.discoveredServers.findIndex(s => s.id === server.id);
    
    const storedServer: StoredServer = {
      ...server,
      isFavorite: options.isFavorite || false,
      priority: options.priority || 0,
      connectionCount: existingIndex >= 0 ? config.discoveredServers[existingIndex].connectionCount : 0,
      lastConnected: existingIndex >= 0 ? config.discoveredServers[existingIndex].lastConnected : undefined,
      savedAt: new Date(),
      nickname: options.nickname,
      notes: options.notes,
    };

    if (existingIndex >= 0) {
      config.discoveredServers[existingIndex] = storedServer;
    } else {
      config.discoveredServers.push(storedServer);
    }

    await this.saveConfig(config);
  }

  async removeServer(serverId: string): Promise<void> {
    const config = await this.loadConfig();
    config.discoveredServers = config.discoveredServers.filter(s => s.id !== serverId);
    await this.saveConfig(config);
  }

  async updateServer(serverId: string, updates: Partial<StoredServer>): Promise<void> {
    const config = await this.loadConfig();
    const serverIndex = config.discoveredServers.findIndex(s => s.id === serverId);
    
    if (serverIndex >= 0) {
      config.discoveredServers[serverIndex] = {
        ...config.discoveredServers[serverIndex],
        ...updates,
      };
      await this.saveConfig(config);
    }
  }

  async getServer(serverId: string): Promise<StoredServer | null> {
    const config = await this.loadConfig();
    return config.discoveredServers.find(s => s.id === serverId) || null;
  }

  async getServers(): Promise<StoredServer[]> {
    const config = await this.loadConfig();
    return [...config.discoveredServers].sort((a, b) => {
      // Sort by priority (higher first), then by last seen
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return b.lastSeen.getTime() - a.lastSeen.getTime();
    });
  }

  async getFavoriteServers(): Promise<StoredServer[]> {
    const servers = await this.getServers();
    return servers.filter(s => s.isFavorite);
  }

  async addConnectionHistory(history: Omit<ConnectionHistory, 'id'>): Promise<void> {
    const config = await this.loadConfig();
    
    if (!config.preferences.saveConnectionHistory) {
      return;
    }

    const historyEntry: ConnectionHistory = {
      ...history,
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    config.connectionHistory.unshift(historyEntry);

    // Limit history size
    if (config.connectionHistory.length > config.preferences.maxHistoryEntries) {
      config.connectionHistory = config.connectionHistory.slice(0, config.preferences.maxHistoryEntries);
    }

    // Update server connection count if successful
    if (history.success) {
      const server = config.discoveredServers.find(s => s.id === history.serverId);
      if (server) {
        server.connectionCount++;
        server.lastConnected = history.timestamp;
      }
    }

    await this.saveConfig(config);
  }

  async getConnectionHistory(serverId?: string): Promise<ConnectionHistory[]> {
    const config = await this.loadConfig();
    
    if (serverId) {
      return config.connectionHistory.filter(h => h.serverId === serverId);
    }
    
    return [...config.connectionHistory];
  }

  async clearConnectionHistory(): Promise<void> {
    const config = await this.loadConfig();
    config.connectionHistory = [];
    await this.saveConfig(config);
  }

  async addNetworkProfile(profile: Omit<NetworkProfile, 'id' | 'createdAt'>): Promise<NetworkProfile> {
    const config = await this.loadConfig();
    
    const newProfile: NetworkProfile = {
      ...profile,
      id: `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
    };

    config.networkProfiles.push(newProfile);
    await this.saveConfig(config);
    
    return newProfile;
  }

  async updateNetworkProfile(profileId: string, updates: Partial<NetworkProfile>): Promise<void> {
    const config = await this.loadConfig();
    const profileIndex = config.networkProfiles.findIndex(p => p.id === profileId);
    
    if (profileIndex >= 0) {
      config.networkProfiles[profileIndex] = {
        ...config.networkProfiles[profileIndex],
        ...updates,
      };
      await this.saveConfig(config);
    }
  }

  async getNetworkProfiles(): Promise<NetworkProfile[]> {
    const config = await this.loadConfig();
    return [...config.networkProfiles].sort((a, b) => {
      // Sort by last used (most recent first), then by name
      if (a.lastUsed && b.lastUsed) {
        return b.lastUsed.getTime() - a.lastUsed.getTime();
      }
      if (a.lastUsed && !b.lastUsed) return -1;
      if (!a.lastUsed && b.lastUsed) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async deleteNetworkProfile(profileId: string): Promise<void> {
    const config = await this.loadConfig();
    config.networkProfiles = config.networkProfiles.filter(p => p.id !== profileId);
    await this.saveConfig(config);
  }

  async exportConfig(): Promise<string> {
    const config = await this.loadConfig();
    return JSON.stringify(this.serializeConfig(config), null, 2);
  }

  async importConfig(configData: string): Promise<void> {
    try {
      const parsed = JSON.parse(configData);
      const config = this.deserializeConfig(parsed);
      const upgradedConfig = this.upgradeConfig(config);
      
      await this.saveConfig(upgradedConfig);
      this.config = upgradedConfig;
    } catch (error) {
      throw new Error(`Failed to import config: ${error}`);
    }
  }

  async reset(): Promise<void> {
    this.config = this.createDefaultConfig();
    await this.saveConfig(this.config);
  }

  private createDefaultConfig(): NetworkConfiguration {
    return {
      version: '1.0.0',
      lastUpdated: new Date(),
      clientId: `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      mode: 'auto',
      preferences: {
        autoConnect: true,
        preferredServerTypes: ['server'],
        connectionTimeout: 5000,
        discoveryInterval: 30000,
        retryAttempts: 3,
        enableLogging: true,
        saveConnectionHistory: true,
        maxHistoryEntries: 100,
      },
      discoveredServers: [],
      connectionHistory: [],
      networkProfiles: [],
    };
  }

  private serializeConfig(config: NetworkConfiguration): any {
    return {
      ...config,
      lastUpdated: config.lastUpdated.toISOString(),
      discoveredServers: config.discoveredServers.map(server => ({
        ...server,
        lastSeen: server.lastSeen.toISOString(),
        lastConnected: server.lastConnected?.toISOString(),
        savedAt: server.savedAt.toISOString(),
      })),
      connectionHistory: config.connectionHistory.map(history => ({
        ...history,
        timestamp: history.timestamp.toISOString(),
      })),
      networkProfiles: config.networkProfiles.map(profile => ({
        ...profile,
        createdAt: profile.createdAt.toISOString(),
        lastUsed: profile.lastUsed?.toISOString(),
      })),
    };
  }

  private deserializeConfig(data: any): NetworkConfiguration {
    return {
      ...data,
      lastUpdated: new Date(data.lastUpdated),
      discoveredServers: (data.discoveredServers || []).map((server: any) => ({
        ...server,
        lastSeen: new Date(server.lastSeen),
        lastConnected: server.lastConnected ? new Date(server.lastConnected) : undefined,
        savedAt: new Date(server.savedAt),
      })),
      connectionHistory: (data.connectionHistory || []).map((history: any) => ({
        ...history,
        timestamp: new Date(history.timestamp),
      })),
      networkProfiles: (data.networkProfiles || []).map((profile: any) => ({
        ...profile,
        createdAt: new Date(profile.createdAt),
        lastUsed: profile.lastUsed ? new Date(profile.lastUsed) : undefined,
      })),
    };
  }

  private upgradeConfig(config: NetworkConfiguration): NetworkConfiguration {
    // Handle version upgrades here
    if (config.version !== '1.0.0') {
      // Upgrade logic for future versions
    }

    // Ensure all required fields exist
    const defaultConfig = this.createDefaultConfig();
    
    return {
      ...defaultConfig,
      ...config,
      version: '1.0.0',
      preferences: {
        ...defaultConfig.preferences,
        ...config.preferences,
      },
    };
  }
}

// Singleton instance
let configManager: NetworkConfigManager | null = null;

export function getNetworkConfigManager(configPath?: string): NetworkConfigManager {
  if (!configManager) {
    configManager = new FileNetworkConfigManager(configPath);
  }
  return configManager;
}

export function createNetworkConfigManager(configPath?: string): NetworkConfigManager {
  return new FileNetworkConfigManager(configPath);
}