const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const http = require('http');
const fs = require('fs');

let activeLoginProcess = null;
let activeLoginState = {
  status: 'idle', // 'idle' | 'waiting_login' | 'success' | 'failed'
  message: '',
  token: null,
  timestamp: 0
};

// Find available browser (Chrome in AppData or Program Files, or Microsoft Edge)
function findBrowserExecutable() {
  const userChrome = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe');
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    userChrome,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getLoginStatus() {
  return activeLoginState;
}

function cancelLogin() {
  if (activeLoginProcess) {
    try {
      activeLoginProcess.kill();
    } catch (e) {}
    activeLoginProcess = null;
  }
  activeLoginState = {
    status: 'idle',
    message: 'Login dibatalkan.',
    token: null,
    timestamp: Date.now()
  };
}

function clearLoginSessionProfile() {
  cancelLogin();
  const tempProfileDir = path.join(os.tmpdir(), 'suno_auto_login_profile');
  if (fs.existsSync(tempProfileDir)) {
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

/**
 * Launch official browser window and automatically capture Clerk session token on login
 */
async function launchAutomaticSunoLogin() {
  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    throw new Error('Tidak ditemukan Microsoft Edge atau Google Chrome di laptop ini.');
  }

  // Cancel any previous session
  cancelLogin();

  const debugPort = 9226;
  const tempProfileDir = path.join(os.tmpdir(), 'suno_auto_login_profile');
  if (!fs.existsSync(tempProfileDir)) {
    fs.mkdirSync(tempProfileDir, { recursive: true });
  }

  activeLoginState = {
    status: 'waiting_login',
    message: 'Jendela Suno dibuka di layar Anda. Silakan login ke akun Anda...',
    token: null,
    timestamp: Date.now()
  };

  // Chromium flags for guaranteed visible separate window with remote debugging
  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--remote-debugging-address=127.0.0.1`,
    `--user-data-dir=${tempProfileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=960,780',
    '--new-window',
    'https://suno.com/me'
  ];

  try {
    activeLoginProcess = spawn(browserPath, args, {
      detached: true,
      stdio: 'ignore'
    });
    activeLoginProcess.unref();
  } catch (err) {
    activeLoginState = {
      status: 'failed',
      message: `Gagal membuka browser: ${err.message}`,
      token: null,
      timestamp: Date.now()
    };
    throw err;
  }

  // Force window to foreground after launch
  const bringToFront = () => {
    try {
      const ps = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class FocusWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint id1, uint id2, bool f);
  public static void Force(IntPtr h) {
    IntPtr fg = GetForegroundWindow();
    uint t1 = GetWindowThreadProcessId(fg, IntPtr.Zero);
    uint t2 = GetCurrentThreadId();
    AttachThreadInput(t2, t1, true);
    ShowWindow(h, 9);
    BringWindowToTop(h);
    SetForegroundWindow(h);
    AttachThreadInput(t2, t1, false);
  }
}
"@; Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { [FocusWin]::Force($_.MainWindowHandle) }`;
      spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { detached: true, stdio: 'ignore' }).unref();
    } catch (e) {}
  };

  setTimeout(bringToFront, 1200);
  setTimeout(bringToFront, 2500);

  // Poller loop to check CDP for Clerk session token
  const startTime = Date.now();
  const maxTimeoutMs = 180000; // 3 minutes timeout
  let cdpConnectedOnce = false;
  let cdpFailCount = 0;

  const pollInterval = setInterval(() => {
    if (Date.now() - startTime > maxTimeoutMs) {
      clearInterval(pollInterval);
      cancelLogin();
      activeLoginState = {
        status: 'failed',
        message: 'Waktu login habis (timeout 3 menit).',
        token: null,
        timestamp: Date.now()
      };
      return;
    }

    if (activeLoginState.status !== 'waiting_login') {
      clearInterval(pollInterval);
      return;
    }

    // Query CDP targets
    const req = http.get(`http://127.0.0.1:${debugPort}/json`, res => {
      cdpConnectedOnce = true;
      cdpFailCount = 0;
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          const sunoPage = targets.find(t => t.type === 'page' && (t.url.includes('suno.com') || t.url.includes('clerk.suno.com')));
          if (!sunoPage || !sunoPage.webSocketDebuggerUrl) return;

          // Connect via native Node.js WebSocket
          const ws = new WebSocket(sunoPage.webSocketDebuggerUrl);
          let wsClosed = false;

          const closeWs = () => {
            if (!wsClosed) {
              wsClosed = true;
              try { ws.close(); } catch (e) {}
            }
          };

          const wsTimer = setTimeout(closeWs, 1800);

          ws.onopen = () => {
            ws.send(JSON.stringify({
              id: 1,
              method: 'Runtime.evaluate',
              params: {
                expression: `(async () => {
                  try {
                    if (window.Clerk && window.Clerk.session) {
                      const t = await window.Clerk.session.getToken();
                      if (t && typeof t === 'string' && t.length > 25) return t;
                    }
                  } catch (e) {}
                  return null;
                })()`,
                awaitPromise: true,
                returnByValue: true
              }
            }));
          };

          ws.onmessage = (event) => {
            clearTimeout(wsTimer);
            try {
              const resp = JSON.parse(event.data);
              const capturedToken = resp?.result?.result?.value;

              if (capturedToken && typeof capturedToken === 'string' && capturedToken.length > 25) {
                clearInterval(pollInterval);
                closeWs();

                activeLoginState = {
                  status: 'success',
                  message: 'Berhasil login! Akun Suno resmi Anda telah terhubung!',
                  token: capturedToken,
                  timestamp: Date.now()
                };

                // Close browser window cleanly now that login succeeded via CDP
                try {
                  ws.send(JSON.stringify({ id: 99, method: 'Browser.close' }));
                } catch (e) {}

                if (activeLoginProcess) {
                  try { activeLoginProcess.kill(); } catch (e) {}
                  activeLoginProcess = null;
                }
              }
            } catch (err) {}
            closeWs();
          };

          ws.onerror = () => {
            clearTimeout(wsTimer);
            closeWs();
          };
        } catch (parseErr) {}
      });
    });

    req.on('error', () => {
      if (cdpConnectedOnce) {
        cdpFailCount++;
        // If window was closed by the user after being connected
        if (cdpFailCount > 8) {
          clearInterval(pollInterval);
          activeLoginState = {
            status: 'failed',
            message: 'Jendela Suno ditutup.',
            token: null,
            timestamp: Date.now()
          };
        }
      }
    });
  }, 1500);

  return { success: true, message: 'Jendela login Suno berhasil dibuka di layar Anda.' };
}

module.exports = {
  launchAutomaticSunoLogin,
  getLoginStatus,
  cancelLogin,
  clearLoginSessionProfile,
  findBrowserExecutable
};
