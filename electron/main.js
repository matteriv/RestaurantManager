const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const discovery = require('udp-discovery').default;

// Keep a global reference of the window object
let mainWindow;
let serverProcess;
let serverPort = 5000;

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

// UDP Discovery for network service discovery
const udpDiscovery = new discovery({
  port: 44201,
  bindAddr: '0.0.0.0',
  dgramType: 'udp4'
});

// Service discovery functions
function startServiceDiscovery() {
  try {
    udpDiscovery.on('MessageBus', (data, info) => {
      log.info('Discovered service:', data, 'from', info.address);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('service-discovered', { data, info });
      }
    });

    // Announce this restaurant POS system
    udpDiscovery.sendMessage('restaurant-pos', {
      service: 'restaurant-management',
      version: app.getVersion(),
      port: serverPort,
      features: ['pos', 'kitchen', 'admin', 'customer']
    });

    log.info('UDP Discovery started on port 44201');
  } catch (error) {
    log.error('Failed to start service discovery:', error);
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
    
    // Start service discovery after window is ready
    startServiceDiscovery();
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

app.on('window-all-closed', () => {
  // Clean up UDP discovery
  if (udpDiscovery) {
    udpDiscovery.pause();
  }
  
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
process.on('SIGTERM', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  app.quit();
});

process.on('SIGINT', () => {
  if (serverProcess) {
    serverProcess.kill('SIGINT');
  }
  app.quit();
});