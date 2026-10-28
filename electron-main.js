const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// CRITICAL: Ensure app name is unified to PascalCase 'AuraSound' so userData is consistently C:\Users\<User>\AppData\Roaming\AuraSound
try {
  app.setName('AuraSound');
  const userDataDir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  process.env.AURASOUND_DATA_DIR = userDataDir;
} catch (e) {
  console.warn('Could not set AURASOUND_DATA_DIR in electron:', e);
}

let mainWindow = null;
let sunoLoginWin = null;

// Ensure local server is running on port 3000
function ensureServerRunning() {
  return new Promise((resolve) => {
    let resolved = false;
    let serverStarted = false;

    const startServer = () => {
      if (serverStarted) return;
      serverStarted = true;
      try {
        require('./server');
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(true);
          }
        }, 800);
      } catch (err) {
        console.error('Error starting internal server:', err);
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }
    };

    const req = http.get('http://127.0.0.1:3000/api/network-info', (res) => {
      res.resume();
      if (!resolved) {
        resolved = true;
        resolve(true);
      }
    });

    req.setTimeout(500, () => {
      req.destroy();
      startServer();
    });

    req.on('error', () => {
      startServer();
    });
  });
}

async function createMainWindow() {
  await ensureServerRunning();

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'AuraSound Music Hub',
    backgroundColor: '#070a12',
    icon: path.join(__dirname, 'public', 'icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  // Clean User-Agent globally and on window so no service detects Electron/AuraSound
  try {
    const rawUa = mainWindow.webContents.getUserAgent();
    const cleanUa = rawUa.replace(/Electron\/[0-9.]+\s*/i, '').replace(/AuraSound\/[0-9.]+\s*/i, '');
    mainWindow.webContents.setUserAgent(cleanUa);
  } catch (e) {}

  const LOCAL_URL = 'http://localhost:3000';

  // Load native local server for direct low-latency audio streaming & Web Audio DSP processing
  mainWindow.loadURL(LOCAL_URL).catch((err) => {
    console.error('Failed to load local server in Electron window:', err);
  });

  // Log any renderer console messages and load failures for debugging
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer Load Error] Failed to load ${validatedURL}: ${errorCode} - ${errorDescription}`);
  });

  // Handle any popup windows cleanly in Electron (prevent blank white windows)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log(`[WindowOpenHandler] Blocked child window for: ${url}`);
    if (url.startsWith('http:') || url.startsWith('https:')) {
      const { shell } = require('electron');
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Enable F5 and Ctrl+R reload shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      mainWindow.reload();
    }
  });

  // Remove default menu bar for sleek modern desktop look
  mainWindow.setMenuBarVisibility(false);
  if (typeof mainWindow.removeMenu === 'function') {
    mainWindow.removeMenu();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });

  // Check for updates if electron-updater is installed
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
      if (mainWindow) mainWindow.webContents.send('update-available', info);
    });

    autoUpdater.on('update-downloaded', (info) => {
      if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
    });

    // Quietly check for updates in background
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 4000);
  } catch (e) {
    // electron-updater will be active in production builds
  }
}

// IPC: Automatic Suno Login Window & Token Extraction (Zero Copy-Pasting!)
ipcMain.handle('open-suno-login', async () => {
  if (sunoLoginWin && !sunoLoginWin.isDestroyed()) {
    sunoLoginWin.focus();
    return { status: 'already_open' };
  }

  sunoLoginWin = new BrowserWindow({
    width: 900,
    height: 720,
    title: 'Login ke Akun Resmi Suno.com',
    parent: mainWindow,
    modal: true,
    backgroundColor: '#0a0d14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  sunoLoginWin.setMenuBarVisibility(false);
  if (typeof sunoLoginWin.removeMenu === 'function') {
    sunoLoginWin.removeMenu();
  }

  sunoLoginWin.webContents.setWindowOpenHandler(({ url }) => {
    // Navigate within sunoLoginWin instead of opening a blank child window
    sunoLoginWin.loadURL(url);
    return { action: 'deny' };
  });

  sunoLoginWin.loadURL('https://suno.com/me');

  let tokenPoller = null;
  let tokenCaptured = false;

  tokenPoller = setInterval(async () => {
    if (!sunoLoginWin || sunoLoginWin.isDestroyed()) {
      clearInterval(tokenPoller);
      return;
    }

    try {
      // Execute within Suno.com context to get Clerk JWT token automatically
      const token = await sunoLoginWin.webContents.executeJavaScript(`
        (async () => {
          try {
            if (window.Clerk && window.Clerk.session) {
              const t = await window.Clerk.session.getToken();
              if (t && typeof t === 'string' && t.length > 20) {
                return t;
              }
            }
          } catch (e) {}
          return null;
        })()
      `);

      if (token && !tokenCaptured) {
        tokenCaptured = true;
        clearInterval(tokenPoller);

        // Send token to mainWindow to store in client state & server config
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('suno-token-captured', token);
        }

        // Close the login window automatically!
        if (sunoLoginWin && !sunoLoginWin.isDestroyed()) {
          sunoLoginWin.close();
        }
      }
    } catch (err) {
      // Ignore cross-origin transition errors while page loads
    }
  }, 1000);

  sunoLoginWin.on('closed', () => {
    if (tokenPoller) clearInterval(tokenPoller);
    sunoLoginWin = null;
  });

  return { status: 'opened' };
});

ipcMain.on('restart-app', () => {
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.quitAndInstall();
  } catch (e) {
    app.relaunch();
    app.exit(0);
  }
});

app.whenReady().then(() => {
  try {
    if (session && session.defaultSession) {
      const defaultUa = session.defaultSession.getUserAgent();
      const cleanUa = defaultUa.replace(/Electron\/[0-9.]+\s*/i, '').replace(/AuraSound\/[0-9.]+\s*/i, '');
      session.defaultSession.setUserAgent(cleanUa);
    }
  } catch (e) {}

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
