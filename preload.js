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
  updateDspSettings: (config) => ipcRenderer.send('update-dsp-settings', config)
});
