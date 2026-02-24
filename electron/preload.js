const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs seguras al renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Info de la plataforma
  platform: process.platform,
  isElectron: true,
  
  // Versiones
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});

// Log para debugging
console.log('Preload script cargado - MarketPOS Desktop');
