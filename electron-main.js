const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
let sunoLoginWin = null;

// Track active DSP configuration across all media players and subframes
let currentDspConfig = {
  bass: 6,
  width: 1.4,
  eq: [8, 6, 2, -3, -2, 3, 6, 8, 10, 11] // Default Dolby Atmos acoustic preset
};

function injectDspIntoFrames(targetFrame) {
  const dspScript = `
    (function() {
      if (window.__auraDspAttached) {
        if (typeof window.__auraSetDsp === 'function') {
          window.__auraSetDsp(${JSON.stringify(currentDspConfig)});
        }
        return;
      }

      let audioCtx = null;
      let sourceNode = null;
      let bassFilter = null;
      let eqFilters = [];
      let splitter = null;
      let merger = null;
      let spatialGain = null;
      let sideInverter = null;
      let limiter = null;
      let gainNode = null;

      const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

      function hookVideo() {
        const video = document.querySelector('video');
        if (!video) return false;
        if (video.__auraHooked) return true;

        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return false;
          audioCtx = new AudioCtx();

          sourceNode = audioCtx.createMediaElementSource(video);

          // Sub-bass booster @ 90Hz
          bassFilter = audioCtx.createBiquadFilter();
          bassFilter.type = 'lowshelf';
          bassFilter.frequency.value = 90;
          bassFilter.gain.value = ${currentDspConfig.bass};

          // 10-Band Equalizer Filters
          const initialGains = ${JSON.stringify(currentDspConfig.eq)};
          eqFilters = frequencies.map((freq, i) => {
            const f = audioCtx.createBiquadFilter();
            if (i === 0) f.type = 'lowshelf';
            else if (i === frequencies.length - 1) f.type = 'highshelf';
            else {
              f.type = 'peaking';
              f.Q.value = 1.4;
            }
            f.frequency.value = freq;
            f.gain.value = initialGains[i] || 0;
            return f;
          });

          // 3D Spatial Soundstage Matrix (Mid-Side Matrix)
          splitter = audioCtx.createChannelSplitter(2);
          merger = audioCtx.createChannelMerger(2);

          const midL = audioCtx.createGain(); midL.gain.value = 0.5;
          const midR = audioCtx.createGain(); midR.gain.value = 0.5;
          const sideL = audioCtx.createGain(); sideL.gain.value = 0.5;
          const sideR = audioCtx.createGain(); sideR.gain.value = -0.5;

          spatialGain = audioCtx.createGain();
          spatialGain.gain.value = ${currentDspConfig.width};

          sideInverter = audioCtx.createGain();
          sideInverter.gain.value = -1.0;

          splitter.connect(midL, 0);
          splitter.connect(midR, 1);
          splitter.connect(sideL, 0);
          splitter.connect(sideR, 1);

          sideL.connect(spatialGain);
          sideR.connect(spatialGain);

          midL.connect(merger, 0, 0);
          midR.connect(merger, 0, 0);
          spatialGain.connect(merger, 0, 0);

          midL.connect(merger, 0, 1);
          midR.connect(merger, 0, 1);
          spatialGain.connect(sideInverter);
          sideInverter.connect(merger, 0, 1);

          // Studio Brickwall Limiter to prevent clipping distortion
          limiter = audioCtx.createDynamicsCompressor();
          limiter.threshold.value = -1.5;
          limiter.knee.value = 6;
          limiter.ratio.value = 18;
          limiter.attack.value = 0.003;
          limiter.release.value = 0.15;

          gainNode = audioCtx.createGain();
          gainNode.gain.value = 1.0;

          // Connect audio graph
          let prev = sourceNode;
          prev.connect(bassFilter);
          prev = bassFilter;

          eqFilters.forEach(f => {
            prev.connect(f);
            prev = f;
          });

          prev.connect(splitter);
          merger.connect(limiter);
          limiter.connect(gainNode);
          gainNode.connect(audioCtx.destination);

          const resumeCtx = () => {
            if (audioCtx && audioCtx.state === 'suspended') {
              audioCtx.resume();
            }
          };
          video.addEventListener('play', resumeCtx);
          video.addEventListener('playing', resumeCtx);
          resumeCtx();

          video.__auraHooked = true;
          window.__auraDspAttached = true;
          console.log('[AuraSound DSP] Studio Acoustic Engine successfully hooked to YouTube video stream!');
          return true;
        } catch (e) {
          console.error('[AuraSound DSP] Hook error:', e);
          return false;
        }
      }

      window.__auraSetDsp = function(config) {
        if (!config) return;
        if (!hookVideo()) return;

        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }

        if (typeof config.bass === 'number' && bassFilter) {
          bassFilter.gain.setTargetAtTime(config.bass, audioCtx.currentTime, 0.02);
        }
        if (Array.isArray(config.eq) && eqFilters.length === config.eq.length) {
          config.eq.forEach((g, i) => {
            eqFilters[i].gain.setTargetAtTime(g, audioCtx.currentTime, 0.02);
          });
        }
        if (typeof config.width === 'number' && spatialGain) {
          spatialGain.gain.setTargetAtTime(config.width, audioCtx.currentTime, 0.02);
        }
      };

      window.addEventListener('message', (ev) => {
        if (ev.data && ev.data.type === 'AURA_UPDATE_DSP') {
          window.__auraSetDsp(ev.data.config);
        }
      });

      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (hookVideo() || attempts > 30) {
          clearInterval(interval);
        }
      }, 400);
    })();
  `;

  if (targetFrame && typeof targetFrame.executeJavaScript === 'function') {
    targetFrame.executeJavaScript(dspScript).catch(() => {});
  } else if (mainWindow && mainWindow.webContents) {
    function traverseFrames(fr) {
      if (!fr) return;
      fr.executeJavaScript(dspScript).catch(() => {});
      if (Array.isArray(fr.frames)) {
        fr.frames.forEach(traverseFrames);
      }
    }
    traverseFrames(mainWindow.webContents.mainFrame);
  }
}

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

  // Configure global session headers to remove CORS & frame barriers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};
    responseHeaders['Access-Control-Allow-Origin'] = ['*'];
    responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS, HEAD'];
    responseHeaders['Access-Control-Allow-Headers'] = ['*'];
    delete responseHeaders['x-frame-options'];
    delete responseHeaders['X-Frame-Options'];
    callback({ responseHeaders });
  });

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
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  // Watch for subframes (like YouTube iframe) and inject DSP automatically
  mainWindow.webContents.on('did-frame-finish-load', () => {
    setTimeout(() => {
      injectDspIntoFrames();
    }, 600);
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

// Real-Time DSP Audio Parameter Synchronization across Subframes
ipcMain.on('update-dsp-settings', (_event, config) => {
  if (config) {
    currentDspConfig = { ...currentDspConfig, ...config };
    injectDspIntoFrames();
  }
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
