const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

// Hardware 96kHz / 24-Bit Studio Master Audio Engine & Ultra-Low Jitter Buffer
app.commandLine.appendSwitch('audio-output-sample-rate', '96000');
app.commandLine.appendSwitch('audio-buffer-size', '512');
app.commandLine.appendSwitch('force-wave-audio', 'false');
app.commandLine.appendSwitch('high-dpi-support', '1');

let mainWindow = null;
let sunoLoginWin = null;

// Ensure local server is running on port 3000
function ensureServerRunning() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/api/network-info', (res) => {
      resolve(true);
    });
    req.on('error', () => {
      // Server is not running yet, require server.js to start it in-process
      try {
        require('./server');
        // Give Express 800ms to bind to port 3000
        setTimeout(() => resolve(true), 800);
      } catch (err) {
        console.error('Error starting internal server:', err);
        resolve(false);
      }
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

  const CLOUD_URL = 'https://project-aplikasi-music.vercel.app';
  const LOCAL_URL = 'http://localhost:3000';

  // Load live cloud server by default so the desktop app is ALWAYS 100% updated 24/7
  mainWindow.loadURL(CLOUD_URL).catch(() => {
    console.warn('Could not connect to cloud server, falling back to local server...');
    mainWindow.loadURL(LOCAL_URL);
  });

  // Enable F5 and Ctrl+R reload shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      mainWindow.reload();
    }
  });

  // Remove default menu bar for sleek modern desktop look
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', () => {
    mainWindow = null;
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
