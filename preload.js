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
  },
  // Desktop Dynamic Island Overlay IPC
  syncDynamicIsland: (state) => ipcRenderer.send('dynamic-island-sync', state),
  toggleDynamicIsland: () => ipcRenderer.invoke('dynamic-island-toggle'),
  isDynamicIslandEnabled: () => ipcRenderer.invoke('dynamic-island-get-enabled'),
  onDynamicIslandControl: (callback) => {
    ipcRenderer.on('dynamic-island-control', (_event, payload) => callback(payload));
  },
  onDynamicIslandVisibilityChanged: (callback) => {
    ipcRenderer.on('dynamic-island-visibility-changed', (_event, visible) => callback(visible));
  },
  onDynamicIslandState: (callback) => {
    ipcRenderer.on('dynamic-island-state', (_event, state) => callback(state));
  },
  sendDynamicIslandControl: (action, value) => ipcRenderer.send('dynamic-island-control-from-ui', { action, value }),
  setDynamicIslandIgnoreMouse: (ignore) => ipcRenderer.send('dynamic-island-ignore-mouse', Boolean(ignore)),
  requestDynamicIslandState: () => ipcRenderer.send('dynamic-island-request-state')
});
