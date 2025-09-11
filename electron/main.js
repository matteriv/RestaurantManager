const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

// Keep a global reference of the window object
let mainWindow;
let serverProcess;
// Use the same port logic as Express server
let serverPort = parseInt(process.env.PORT || '5000', 10);

// Network Discovery Services
let serverDiscovery = null;
let clientDiscovery = null;
let healthMonitor = null;
let configManager = null;
let networkMode = 'auto'; // 'server', 'client', 'auto'

// Enable live reload for Electron in development
if (isDev) {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

// Configure electron-log
log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs/main.log');
log.transports.console.format = '{h}:{i}:{s} {text}';

// Configure auto-updater logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Network discovery initialization
async function initializeNetworkDiscovery() {
  try {
    // Import network discovery modules (using dynamic import for ES modules in CommonJS)
    const { getServerDiscoveryService } = await import('../server/serverDiscovery.js');
    const { getClientDiscoveryService } = await import('../server/clientDiscovery.js');
    const { getNetworkHealthMonitor } = await import('../server/networkHealthMonitor.js');
    const { getNetworkConfigManager } = await import('../server/networkConfig.js');

    // Initialize services
    configManager = getNetworkConfigManager(path.join(app.getPath('userData'), 'network-config.json'));
    
    const config = await configManager.loadConfig();
    networkMode = config.mode;

    log.info(`Network discovery mode: ${networkMode}`);

    // Initialize health monitor
    healthMonitor = getNetworkHealthMonitor({
      enableLogging: true,
      checkInterval: 15000,
      enableAutoReconnect: true,
    });

    // Set up health monitor events
    healthMonitor.on('connection-lost', (serverId) => {
      log.warn(`Connection lost to server: ${serverId}`);
      sendToRenderer('network-connection-lost', { serverId });
    });

    healthMonitor.on('connection-restored', (serverId) => {
      log.info(`Connection restored to server: ${serverId}`);
      sendToRenderer('network-connection-restored', { serverId });
    });

    healthMonitor.on('server-discovered', (server) => {
      log.info(`Server discovered: ${server.name} at ${server.address}:${server.port}`);
      sendToRenderer('network-server-discovered', { server });
    });

    await healthMonitor.start();

    // Initialize discovery services based on mode
    if (networkMode === 'server' || networkMode === 'auto') {
      await initializeServerMode();
    }

    if (networkMode === 'client' || networkMode === 'auto') {
      await initializeClientMode();
    }

    log.info('Network discovery system initialized successfully');
  } catch (error) {
    log.error('Failed to initialize network discovery:', error);
  }
}

async function initializeServerMode() {
  try {
    const { getServerDiscoveryService } = await import('../server/serverDiscovery.js');
    
    serverDiscovery = getServerDiscoveryService({
      port: 44201,
      serverPort: serverPort,
      broadcastInterval: 10000,
      enableLogging: true,
    });

    // Set up server discovery events
    serverDiscovery.on('server-discovered', (server) => {
      log.info(`Server discovered in server mode: ${server.name}`);
      sendToRenderer('network-server-discovered', { server });
      
      // Add to health monitoring
      if (healthMonitor) {
        healthMonitor.addServer(server);
      }

      // Save to config
      if (configManager) {
        configManager.addServer(server).catch(error => {
          log.error('Failed to save discovered server:', error);
        });
      }
    });

    serverDiscovery.on('error', (error) => {
      log.error('Server discovery error:', error);
      sendToRenderer('network-error', { error: error.message, source: 'server-discovery' });
    });

    serverDiscovery.on('network-changed', (status) => {
      log.info('Network changed in server mode');
      sendToRenderer('network-status-changed', status);
    });

    await serverDiscovery.start();
    log.info('Server discovery service started');
  } catch (error) {
    log.error('Failed to start server discovery:', error);
  }
}

async function initializeClientMode() {
  try {
    const { getClientDiscoveryService } = await import('../server/clientDiscovery.js');
    
    clientDiscovery = getClientDiscoveryService({
      port: 44201,
      discoveryInterval: 30000,
      autoConnect: true,
      enableLogging: true,
    });

    // Set up client discovery events
    clientDiscovery.on('server-discovered', (server) => {
      log.info(`Server discovered in client mode: ${server.name}`);
      sendToRenderer('network-server-discovered', { server });
      
      // Add to health monitoring
      if (healthMonitor) {
        healthMonitor.addServer(server);
      }

      // Save to config
      if (configManager) {
        configManager.addServer(server).catch(error => {
          log.error('Failed to save discovered server:', error);
        });
      }
    });

    clientDiscovery.on('connected', (server) => {
      log.info(`Connected to server: ${server.name}`);
      sendToRenderer('network-connected', { server });
      
      // Set as connected server in health monitor
      if (healthMonitor) {
        healthMonitor.setConnectedServer(server);
      }
    });

    clientDiscovery.on('disconnected', (serverId) => {
      log.info(`Disconnected from server: ${serverId}`);
      sendToRenderer('network-disconnected', { serverId });
      
      // Clear connected server in health monitor
      if (healthMonitor) {
        healthMonitor.setConnectedServer(null);
      }
    });

    clientDiscovery.on('discovery-complete', (servers) => {
      log.info(`Discovery complete. Found ${servers.length} servers`);
      sendToRenderer('network-discovery-complete', { servers });
    });

    clientDiscovery.on('error', (error) => {
      log.error('Client discovery error:', error);
      sendToRenderer('network-error', { error: error.message, source: 'client-discovery' });
    });

    await clientDiscovery.start();
    log.info('Client discovery service started');
  } catch (error) {
    log.error('Failed to start client discovery:', error);
  }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the app URL
  const startUrl = isDev 
    ? `http://localhost:${serverPort}` 
    : `http://localhost:${serverPort}`;
  
  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
    
    // Start network discovery after window is ready
    initializeNetworkDiscovery();
  });

  // Wait for server to start, then load the URL
  const loadApp = () => {
    mainWindow.loadURL(startUrl)
      .catch((err) => {
        log.error('Failed to load URL:', err);
        // Retry after delay if server isn't ready
        setTimeout(loadApp, 2000);
      });
  };

  // Start loading after a brief delay to allow server startup
  setTimeout(loadApp, 1000);

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle window controls
  mainWindow.on('minimize', () => {
    mainWindow.hide();
  });

  // Create application menu
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Order',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu-new-order');
            }
          }
        },
        {
          label: 'Print Receipt',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.print();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'POS Terminal',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('navigate-to', '/pos');
            }
          }
        },
        {
          label: 'Kitchen Display',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('navigate-to', '/kitchen');
            }
          }
        },
        {
          label: 'Admin Panel',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('navigate-to', '/admin');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.reload();
            }
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Restaurant Manager',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Restaurant Manager',
              message: `Restaurant Management System v${app.getVersion()}`,
              detail: 'A comprehensive POS and restaurant management solution.'
            });
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function startServer() {
  return new Promise((resolve, reject) => {
    log.info('Starting Express server...');
    
    const serverScript = path.join(__dirname, '..', 'dist', 'index.js');
    const devServerScript = path.join(__dirname, '..', 'server', 'index.ts');
    
    const scriptToRun = isDev ? devServerScript : serverScript;
    const command = isDev ? 'tsx' : 'node';
    
    serverProcess = spawn(command, [scriptToRun], {
      env: {
        ...process.env,
        NODE_ENV: isDev ? 'development' : 'production',
        PORT: serverPort.toString()
      },
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', (data) => {
      const message = data.toString();
      log.info('Server:', message.trim());
      
      // Check if server has started successfully
      if (message.includes(`serving on port ${serverPort}`)) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const message = data.toString();
      log.error('Server Error:', message.trim());
    });

    serverProcess.on('error', (error) => {
      log.error('Failed to start server:', error);
      reject(error);
    });

    serverProcess.on('close', (code) => {
      log.info(`Server process exited with code ${code}`);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, 30000);
  });
}

// IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-error-dialog', async (event, title, content) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'error',
    title,
    message: title,
    detail: content,
    buttons: ['OK']
  });
  return result;
});

ipcMain.handle('show-info-dialog', async (event, title, content) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title,
    message: title,
    detail: content,
    buttons: ['OK']
  });
  return result;
});

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  log.info('Update available.');
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available.');
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater. ' + err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  log.info(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded');
  autoUpdater.quitAndInstall();
});

// App events
app.whenReady().then(async () => {
  try {
    // Start the Express server first
    await startServer();
    
    // Then create the Electron window
    createWindow();
    
    // Check for updates in production
    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify();
    }
    
  } catch (error) {
    log.error('Failed to start application:', error);
    
    // Show error dialog and quit
    dialog.showErrorBox('Startup Error', 
      `Failed to start the restaurant management system: ${error.message}`);
    app.quit();
  }
});

app.on('window-all-closed', async () => {
  // Clean up network discovery services
  await cleanupNetworkDiscovery();
  
  // Kill server process
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev && url.startsWith('http://localhost:')) {
    // Allow self-signed certificates in development
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// Cleanup on exit
// Helper function to send messages to renderer process
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// Network discovery cleanup function
async function cleanupNetworkDiscovery() {
  try {
    if (serverDiscovery) {
      await serverDiscovery.stop();
      log.info('Server discovery stopped');
    }
    
    if (clientDiscovery) {
      await clientDiscovery.stop();
      log.info('Client discovery stopped');
    }
    
    if (healthMonitor) {
      await healthMonitor.stop();
      log.info('Health monitor stopped');
    }
  } catch (error) {
    log.error('Error during network discovery cleanup:', error);
  }
}

// IPC handlers for network discovery
ipcMain.handle('network-get-status', async () => {
  try {
    const status = {
      mode: networkMode,
      servers: [],
      connectedServer: null,
      healthStatus: null,
    };

    if (clientDiscovery) {
      status.servers = clientDiscovery.getDiscoveredServers();
      status.connectedServer = clientDiscovery.getConnectedServer();
    } else if (serverDiscovery) {
      status.servers = serverDiscovery.getDiscoveredServers();
    }

    if (healthMonitor) {
      status.healthStatus = healthMonitor.getHealthStatus();
    }

    return status;
  } catch (error) {
    log.error('Error getting network status:', error);
    throw error;
  }
});

ipcMain.handle('network-discover-servers', async () => {
  try {
    if (clientDiscovery) {
      return await clientDiscovery.discoverServers();
    }
    return [];
  } catch (error) {
    log.error('Error discovering servers:', error);
    throw error;
  }
});

ipcMain.handle('network-connect-server', async (event, serverId) => {
  try {
    if (!clientDiscovery) {
      throw new Error('Client discovery not available');
    }

    const servers = clientDiscovery.getDiscoveredServers();
    const server = servers.find(s => s.id === serverId);
    
    if (!server) {
      throw new Error('Server not found');
    }

    return await clientDiscovery.connectToServer(server);
  } catch (error) {
    log.error('Error connecting to server:', error);
    throw error;
  }
});

ipcMain.handle('network-disconnect', async () => {
  try {
    if (clientDiscovery) {
      clientDiscovery.disconnect();
    }
    return true;
  } catch (error) {
    log.error('Error disconnecting:', error);
    throw error;
  }
});

ipcMain.handle('network-set-mode', async (event, mode) => {
  try {
    if (!['server', 'client', 'auto'].includes(mode)) {
      throw new Error('Invalid network mode');
    }

    networkMode = mode;
    
    // Update config
    if (configManager) {
      const config = await configManager.loadConfig();
      config.mode = mode;
      await configManager.saveConfig(config);
    }

    // Restart network discovery with new mode
    await cleanupNetworkDiscovery();
    await initializeNetworkDiscovery();
    
    return true;
  } catch (error) {
    log.error('Error setting network mode:', error);
    throw error;
  }
});

ipcMain.handle('network-get-config', async () => {
  try {
    if (configManager) {
      return await configManager.loadConfig();
    }
    return null;
  } catch (error) {
    log.error('Error getting network config:', error);
    throw error;
  }
});

ipcMain.handle('network-save-server', async (event, server, options = {}) => {
  try {
    if (configManager) {
      await configManager.addServer(server, options);
      return true;
    }
    return false;
  } catch (error) {
    log.error('Error saving server:', error);
    throw error;
  }
});

ipcMain.handle('network-remove-server', async (event, serverId) => {
  try {
    if (configManager) {
      await configManager.removeServer(serverId);
      return true;
    }
    return false;
  } catch (error) {
    log.error('Error removing server:', error);
    throw error;
  }
});

ipcMain.handle('network-get-connection-history', async (event, serverId) => {
  try {
    if (configManager) {
      return await configManager.getConnectionHistory(serverId);
    }
    return [];
  } catch (error) {
    log.error('Error getting connection history:', error);
    throw error;
  }
});

ipcMain.handle('network-export-config', async () => {
  try {
    if (configManager) {
      return await configManager.exportConfig();
    }
    return null;
  } catch (error) {
    log.error('Error exporting config:', error);
    throw error;
  }
});

ipcMain.handle('network-import-config', async (event, configData) => {
  try {
    if (configManager) {
      await configManager.importConfig(configData);
      
      // Restart network discovery to apply new config
      await cleanupNetworkDiscovery();
      await initializeNetworkDiscovery();
      
      return true;
    }
    return false;
  } catch (error) {
    log.error('Error importing config:', error);
    throw error;
  }
});

process.on('SIGTERM', async () => {
  await cleanupNetworkDiscovery();
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  app.quit();
});

process.on('SIGINT', async () => {
  await cleanupNetworkDiscovery();
  if (serverProcess) {
    serverProcess.kill('SIGINT');
  }
  app.quit();
});