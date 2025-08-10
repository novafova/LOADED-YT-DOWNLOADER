const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVideoInfo: (url) => ipcRenderer.invoke('get-video-info', url),
  selectDownloadPath: () => ipcRenderer.invoke('select-download-path'),
  downloadVideo: (options) => ipcRenderer.invoke('download-video', options),
  convertAudio: (options) => ipcRenderer.invoke('convert-audio', options),
  
  // Auto-export functions
  getDefaultDownloadsPath: () => ipcRenderer.invoke('get-default-downloads-path'),
  ensureAutoExportDir: (dirPath) => ipcRenderer.invoke('ensure-auto-export-dir', dirPath),
  
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  
  // External links
  openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),
  
  // Fallback dialog
  showFallbackDialog: (options) => ipcRenderer.invoke('show-fallback-dialog', options),
  
  // Event listeners
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },
  onConversionProgress: (callback) => {
    ipcRenderer.on('conversion-progress', (event, percent) => callback(percent));
  },
  onDownloadFallbackRequired: (callback) => {
    ipcRenderer.on('download-fallback-required', (event, data) => callback(data));
  }
});