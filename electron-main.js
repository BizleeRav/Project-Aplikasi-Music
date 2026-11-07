const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Ensure background windows (like silent Suno engine) execute JavaScript and DOM without throttling
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

if (process.env.RUN_SCRIPT) {
  try {
    require(process.env.RUN_SCRIPT);
  } catch (err) {
    console.error('Failed to run RUN_SCRIPT:', err);
  }
  return;
}

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

// Load authentic in-app Suno generator globally before server starts
try {
  require('./electron-suno-generator');
  console.log('[Electron Main] Loaded electron-suno-generator successfully!');
} catch (e) {
  console.warn('[Electron Main] Could not load electron-suno-generator:', e);
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
    if (typeof global.destroyWarmSunoEngine === 'function') {
      global.destroyWarmSunoEngine();
    }
    app.quit();
  });

  // Check for updates if electron-updater is installed
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('error', (err) => {
      console.warn('[AutoUpdater] Update check ignored:', err?.message || err);
    });

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

const FIREFOX_DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0';

function getCleanNativeUserAgent() {
  try {
    if (session && session.defaultSession) {
      const rawUa = session.defaultSession.getUserAgent() || '';
      const cleaned = rawUa
        .replace(/\s*Electron\/[^\s]+/gi, '')
        .replace(/\s*AuraSound\/[^\s]+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (cleaned) return cleaned;
    }
  } catch (e) {}
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome || '134.0.0.0'} Safari/537.36`;
}
global.getCleanNativeUserAgent = getCleanNativeUserAgent;

// IPC: Automatic Suno Login Window & Token Extraction (In-App Google OAuth Anti-Block!)
ipcMain.handle('open-suno-login', async () => {
  if (sunoLoginWin && !sunoLoginWin.isDestroyed()) {
    sunoLoginWin.focus();
    return { status: 'already_open' };
  }

  const cleanNativeUa = getCleanNativeUserAgent();
  const sunoSession = session.fromPartition('persist:suno_auth_session');
  sunoSession.setUserAgent(cleanNativeUa);

  // Only disguise User-Agent on Google OAuth domains; keep Suno & Cloudflare 100% native so Sec-CH-UA matches!
  sunoSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const u = (details.url || '').toLowerCase();
    const isGoogle = u.includes('accounts.google.com') || u.includes('google.com/o/oauth2') || u.includes('googleusercontent.com');
    if (isGoogle) {
      details.requestHeaders['User-Agent'] = FIREFOX_DESKTOP_UA;
      delete details.requestHeaders['Sec-CH-UA'];
      delete details.requestHeaders['Sec-CH-UA-Mobile'];
      delete details.requestHeaders['Sec-CH-UA-Platform'];
      delete details.requestHeaders['sec-ch-ua'];
      delete details.requestHeaders['sec-ch-ua-mobile'];
      delete details.requestHeaders['sec-ch-ua-platform'];
    }
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  sunoLoginWin = new BrowserWindow({
    width: 960,
    height: 740,
    title: 'Login ke Akun Resmi Suno.com',
    parent: mainWindow,
    modal: true,
    backgroundColor: '#0a0d14',
    webPreferences: {
      session: sunoSession,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  sunoLoginWin.webContents.setUserAgent(cleanNativeUa);

  sunoLoginWin.setMenuBarVisibility(false);
  if (typeof sunoLoginWin.removeMenu === 'function') {
    sunoLoginWin.removeMenu();
  }

  // Allow Google OAuth popup windows to function naturally without breaking window.opener
  const childWindows = new Set();
  sunoLoginWin.webContents.setWindowOpenHandler(({ url }) => {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: sunoLoginWin,
        modal: false,
        backgroundColor: '#ffffff',
        autoHideMenuBar: true,
        webPreferences: {
          session: sunoSession,
          nodeIntegration: false,
          contextIsolation: true
        }
      }
    };
  });

  sunoLoginWin.webContents.on('did-create-window', (childWin) => {
    childWindows.add(childWin);
    childWin.setMenuBarVisibility(false);
    if (typeof childWin.removeMenu === 'function') {
      childWin.removeMenu();
    }
    childWin.webContents.setUserAgent(FIREFOX_DESKTOP_UA);
    childWin.webContents.on('will-navigate', (event, navUrl) => {
      const u = (navUrl || '').toLowerCase();
      if (u.includes('google.com') || u.includes('googleusercontent.com')) {
        childWin.webContents.setUserAgent(FIREFOX_DESKTOP_UA);
      } else {
        childWin.webContents.setUserAgent(cleanNativeUa);
      }
    });
    childWin.on('closed', () => {
      childWindows.delete(childWin);
    });
  });

  sunoLoginWin.loadURL('https://suno.com/me').catch(() => {});

  let tokenPoller = null;
  let tokenCaptured = false;

  tokenPoller = setInterval(async () => {
    if ((!sunoLoginWin || sunoLoginWin.isDestroyed()) && childWindows.size === 0) {
      clearInterval(tokenPoller);
      return;
    }

    try {
      let token = null;

      // 1. Directly query Electron in-memory cookies (instant & 100% reliable)
      try {
        const cookies = await sunoSession.cookies.get({});
        const sessCookie = cookies.find(c => c.name === '__session' || c.name.startsWith('__session'));
        if (sessCookie && sessCookie.value && sessCookie.value.length > 20) {
          token = sessCookie.value;
        }

        // 1b. If no direct __session, look for __client to exchange with Clerk auth endpoint
        if (!token) {
          const clientCookie = cookies.find(c => c.name === '__client' || c.name.startsWith('__client'));
          if (clientCookie && clientCookie.value && clientCookie.value.length > 20) {
            try {
              const axios = require('axios');
              for (const host of ['auth.suno.com', 'clerk.suno.com']) {
                try {
                  const res = await axios.get(`https://${host}/v1/client`, {
                    headers: {
                      'Cookie': `__client=${clientCookie.value}`,
                      'Origin': 'https://suno.com'
                    },
                    timeout: 3000
                  });
                  const session = res.data?.response?.sessions?.[0];
                  const jwt = session?.last_active_token?.jwt;
                  if (jwt && jwt.length > 20) {
                    token = jwt;
                    break;
                  }
                } catch (e) {}
              }
            } catch (e) {}
          }
        }
      } catch (e) {}

      // 2. Also check defaultSession cookies as fallback
      if (!token) {
        try {
          const cookies = await session.defaultSession.cookies.get({});
          const sessCookie = cookies.find(c => c.name === '__session' || c.name.startsWith('__session'));
          if (sessCookie && sessCookie.value && sessCookie.value.length > 20) {
            token = sessCookie.value;
          }
        } catch (e) {}
      }

      // 3. Fallback: Execute within Suno.com context on sunoLoginWin AND any child window
      if (!token) {
        const allTargets = [];
        if (sunoLoginWin && !sunoLoginWin.isDestroyed()) allTargets.push(sunoLoginWin);
        for (const cw of childWindows) {
          if (cw && !cw.isDestroyed()) allTargets.push(cw);
        }

        for (const win of allTargets) {
          try {
            const t = await win.webContents.executeJavaScript(`
              (async () => {
                try {
                  if (window.Clerk && window.Clerk.session) {
                    const tok = await window.Clerk.session.getToken();
                    if (tok && typeof tok === 'string' && tok.length > 20) {
                      return tok;
                    }
                  }
                  const match = document.cookie.match(/__session=([^;]+)/);
                  if (match && match[1] && match[1].length > 20) return match[1];
                } catch (e) {}
                return null;
              })()
            `);
            if (t && typeof t === 'string' && t.length > 20 && t.startsWith('eyJ')) {
              token = t;
              break;
            }
          } catch (e) {}
        }
      }

      if (token && !tokenCaptured) {
        tokenCaptured = true;
        clearInterval(tokenPoller);

        // Also save to sunoService config directly
        try {
          const sunoService = require('./suno-service');
          sunoService.saveConfig({
            suno_api_key: token,
            suno_provider: 'suno_official'
          });
          await sunoSession.cookies.flushStore().catch(() => {});
          // syncOfficialFeed removed
        } catch (e) {}

        // Send token to mainWindow to store in client state & server config
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('suno-token-captured', token);
        }

        // Pre-warm Suno engine with newly authenticated session
        if (typeof global.initWarmSunoEngine === 'function') {
          setTimeout(() => {
            global.initWarmSunoEngine({ forceReload: true }).catch(() => {});
          }, 800);
        }

        // Close all child popup windows & login window automatically!
        for (const cw of childWindows) {
          try {
            if (cw && !cw.isDestroyed()) cw.close();
          } catch (e) {}
        }
        childWindows.clear();

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


global.clearSunoElectronSession = async () => {
  try {
    if (typeof global.destroyWarmSunoEngine === 'function') {
      global.destroyWarmSunoEngine();
    }
    const sunoSession = session.fromPartition('persist:suno_auth_session');
    await sunoSession.clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers']
    });
    await sunoSession.cookies.flushStore().catch(() => {});
    console.log('[Electron Main] Suno electron session cleared successfully.');
    return { success: true };
  } catch (err) {
    console.warn('[Electron Main] Error clearing Suno session:', err?.message || err);
    return { success: false, error: err?.message || err };
  }
};

ipcMain.handle('clear-suno-session', async () => {
  return await global.clearSunoElectronSession();
});

global.getFreshSunoToken = async () => {
  try {
    const sunoSession = session.fromPartition('persist:suno_auth_session');
    const cookies = await sunoSession.cookies.get({});
    let token = null;

    const findValidSessionJwt = (cookieList) => {
      const candidates = cookieList
        .filter(c => c && (c.name === '__session' || c.name.startsWith('__session')) && c.value && c.value.length > 20)
        .sort((a, b) => (a.name === '__session' ? -1 : b.name === '__session' ? 1 : 0));
      for (const sc of candidates) {
        try {
          const parts = sc.value.split('.');
          if (parts.length >= 2) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            if (payload?.exp && (payload.exp - 10) > Date.now() / 1000) {
              return sc.value;
            }
          }
        } catch (e) {}
      }
      return null;
    };

    token = findValidSessionJwt(cookies);

    const clientCookies = cookies.filter(c => c.name.startsWith('__client'));
    const hasClerkClient = clientCookies.some(c => c.name === '__client' && c.value && c.value.length > 20) ||
      clientCookies.some(c => c.name.startsWith('__client_uat') && c.value && c.value !== '0');

    if (!token && clientCookies.length > 0) {
      try {
        const axios = require('axios');
        const cookieHeader = clientCookies.map(c => `${c.name}=${c.value}`).join('; ');
        const cleanUa = getCleanNativeUserAgent();
        for (const host of ['auth.suno.com', 'clerk.suno.com']) {
          try {
            const res = await axios.get(`https://${host}/v1/client`, {
              headers: {
                'Cookie': cookieHeader,
                'Origin': 'https://suno.com',
                'Referer': 'https://suno.com/',
                'User-Agent': cleanUa
              },
              timeout: 4500
            });
            const sess = res.data?.response?.sessions?.[0];
            const jwt = sess?.last_active_token?.jwt;
            if (jwt && jwt.length > 20) {
              token = jwt;
              await sunoSession.cookies.set({
                url: 'https://suno.com',
                name: '__session',
                value: jwt,
                domain: '.suno.com',
                path: '/',
                secure: true,
                httpOnly: false,
                sameSite: 'lax'
              });
              await sunoSession.cookies.flushStore().catch(() => {});
              break;
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    // If Clerk client cookies exist (user is logged in) but 60s __session JWT expired while app was closed,
    // wake the silent warm engine so Clerk refreshes __session automatically in background!
    if (!token && hasClerkClient && typeof global.initWarmSunoEngine === 'function') {
      try {
        await global.initWarmSunoEngine();
        const refreshedCookies = await sunoSession.cookies.get({});
        token = findValidSessionJwt(refreshedCookies);
      } catch (e) {}
    }

    if (token) {
      try {
        const sunoService = require('./suno-service');
        const cfg = sunoService.getConfig();
        if (!cfg.suno_api_key || cfg.suno_api_key !== token) {
          sunoService.saveConfig({
            suno_api_key: token,
            suno_provider: 'suno_official'
          });
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('suno-token-captured', token);
          }
        }
      } catch (e) {}
      return token;
    }
    return null;
  } catch (err) {
    console.warn('[Electron Main] Error in getFreshSunoToken:', err?.message || err);
    return null;
  }
};

let warmEngineBootstrapped = false;

async function checkSunoSessionCookies() {
  const tok = await global.getFreshSunoToken();
  if (tok && !warmEngineBootstrapped && typeof global.initWarmSunoEngine === 'function') {
    warmEngineBootstrapped = true;
    setTimeout(() => {
      global.initWarmSunoEngine().catch(() => {});
    }, 1000);
  }
}

app.on('before-quit', () => {
  if (typeof global.destroyWarmSunoEngine === 'function') {
    global.destroyWarmSunoEngine();
  }
});

app.whenReady().then(() => {
  setTimeout(checkSunoSessionCookies, 2000);
  setInterval(checkSunoSessionCookies, 10000);

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
