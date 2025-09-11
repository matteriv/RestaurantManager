const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Dialog methods
  showErrorDialog: (title, content) => ipcRenderer.invoke('show-error-dialog', title, content),
  showInfoDialog: (title, content) => ipcRenderer.invoke('show-info-dialog', title, content),
  
  // Menu navigation handlers
  onMenuNewOrder: (callback) => ipcRenderer.on('menu-new-order', callback),
  onNavigateTo: (callback) => ipcRenderer.on('navigate-to', callback),
  
  // Service discovery
  onServiceDiscovered: (callback) => ipcRenderer.on('service-discovered', callback),
  
  // Clean up listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Platform info
  platform: process.platform,
  
  // Print functionality
  print: () => {
    window.print();
  }
});

// Security: Remove any Node.js APIs from the window object
delete window.require;
delete window.exports;
delete window.module;