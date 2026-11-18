const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openSunoLogin: () => ipcRenderer.invoke('open-suno-login'),
  onSunoTokenCaptured: (callback) => {
    ipcRenderer.on('suno-token-captured', (_event, token) => callback(token));
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },
  restartAndInstallUpdate: () => ipcRenderer.send('restart-app'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize-toggle'),
  closeWindow: () => ipcRenderer.send('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowMaximizedChange: (callback) => {
    ipcRenderer.on('window-maximized-changed', (_event, isMaximized) => callback(isMaximized));
  }
});
