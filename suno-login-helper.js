const { spawn, execFileSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

let activeLoginProcess = null;
let activeLoginState = {
  status: 'idle', // 'idle' | 'waiting_login' | 'success' | 'failed'
  message: '',
  token: null,
  timestamp: 0
};

// Locate Chrome or Edge
function findBrowserExecutable() {
  const userChrome = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe');
  const candidates = [
    userChrome,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
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
  const profileDir = path.join(os.homedir(), 'AppData', 'Roaming', 'AuraSound', 'suno_browser_profile');
  if (fs.existsSync(profileDir)) {
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

/**
 * DPAPI Master Key Decryption for Chromium
 */
function getMasterKey(localStatePath) {
  if (!fs.existsSync(localStatePath)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
    const b64Key = state?.os_crypt?.encrypted_key;
    if (!b64Key) return null;
    const rawKey = Buffer.from(b64Key, 'base64');
    const dpapiPayload = rawKey.slice(5);

    const psScript = `
      Add-Type -AssemblyName System.Security
      $b = [Convert]::FromBase64String('${dpapiPayload.toString('base64')}')
      $un = [System.Security.Cryptography.ProtectedData]::Unprotect($b, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
      [Convert]::ToBase64String($un)
    `;
    const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], { encoding: 'utf8' }).trim();
    return Buffer.from(out, 'base64');
  } catch (e) {
    return null;
  }
}

function decryptCookieValue(encryptedBuffer, masterKey) {
  if (!encryptedBuffer || encryptedBuffer.length < 3 + 12 + 16) return null;
  const prefix = encryptedBuffer.slice(0, 3).toString('utf8');
  if (prefix !== 'v10' && prefix !== 'v11') return null;
  const iv = encryptedBuffer.slice(3, 15);
  const ciphertextAndTag = encryptedBuffer.slice(15);
  const tag = ciphertextAndTag.slice(ciphertextAndTag.length - 16);
  const ciphertext = ciphertextAndTag.slice(0, ciphertextAndTag.length - 16);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    return null;
  }
}

/**
 * Directly extracts active Suno/Clerk session from Chromium profile SQLite cookies database
 */
async function extractSunoSessionFromProfile(profileDir) {
  const localStatePath = path.join(profileDir, 'Local State');
  const cookiesPath = path.join(profileDir, 'Default', 'Network', 'Cookies');
  if (!fs.existsSync(cookiesPath) || !fs.existsSync(localStatePath)) return null;

  const masterKey = getMasterKey(localStatePath);
  if (!masterKey) return null;

  const tempCopy = path.join(os.tmpdir(), `temp_suno_extract_${Date.now()}.sqlite`);
  try {
    fs.copyFileSync(cookiesPath, tempCopy);
  } catch (e) {
    return null;
  }

  try {
    const raw = fs.readFileSync(tempCopy);
    try { fs.unlinkSync(tempCopy); } catch (e) {}

    let clientJwt = null;
    const targets = ['__client_Jnxw', '__client', '__session'];

    for (const t of targets) {
      let idx = 0;
      while ((idx = raw.indexOf(Buffer.from(t), idx + 1)) !== -1) {
        const slice = raw.slice(idx, idx + 4000);
        let v10Pos = 0;
        while ((v10Pos = slice.indexOf(Buffer.from('v10'), v10Pos + 1)) !== -1) {
          for (let len = 30; len <= 1200; len++) {
            const cand = slice.slice(v10Pos, v10Pos + len);
            const dec = decryptCookieValue(cand, masterKey);
            if (dec && (dec.includes('eyJhbGci') || dec.includes('__client') || dec.includes('suno') || dec.includes('clerk'))) {
              const match = dec.match(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/);
              if (match) {
                clientJwt = match[0];
                break;
              }
            }
          }
          if (clientJwt) break;
        }
        if (clientJwt) break;
      }
      if (clientJwt) break;
    }

    if (!clientJwt) return null;

    // Exchange client JWT for fresh Suno session access token via official auth endpoint
    let jwt = null;
    let username = 'Suno User';
    let sessionId = null;

    for (const host of ['clerk.suno.com', 'auth.suno.com']) {
      try {
        const res = await axios.get(`https://${host}/v1/client`, {
          headers: {
            'Cookie': `__client=${clientJwt}`,
            'Origin': 'https://suno.com'
          },
          timeout: 8000
        });
        const clientData = res.data?.response;
        const session = clientData?.sessions?.[0];
        jwt = session?.last_active_token?.jwt;
        username = session?.user?.username || session?.user?.first_name || 'Suno User';
        sessionId = session?.id;
        if (jwt) break;
      } catch (e) {}
    }

    return {
      token: jwt || clientJwt,
      username,
      sessionId
    };
  } catch (err) {
    try { fs.unlinkSync(tempCopy); } catch (e) {}
    return null;
  }
}

/**
 * Called when a valid token is captured
 */
function notifyTokenCaptured(token) {
  activeLoginState = {
    status: 'success',
    message: '🎉 Berhasil login! Akun Suno resmi Anda telah terhubung!',
    token,
    timestamp: Date.now()
  };

  // Automatically save to sunoService config
  try {
    const sunoService = require('./suno-service');
    sunoService.saveConfig({
      suno_api_key: token,
      suno_provider: 'suno_official'
    });
  } catch (e) {}

  // Close the browser window automatically
  if (activeLoginProcess) {
    try {
      activeLoginProcess.kill();
      activeLoginProcess = null;
    } catch (e) {}
  }

  // Force close any lingering Chrome processes using this isolated profile
  try {
    const ps = `Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object { $_.CommandLine -like "*suno_browser_profile*" } | Stop-Process -Force`;
    spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { detached: true, stdio: 'ignore' }).unref();
  } catch (e) {}

  // Notify Electron main window to refresh UI
  try {
    const { BrowserWindow } = require('electron');
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      if (!win.isDestroyed()) {
        win.webContents.send('suno-token-captured', token);
      }
    }
  } catch (e) {}
}

/**
 * Launch official browser window and automatically poll profile database for session completion
 */
async function launchAutomaticSunoLogin() {
  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    throw new Error('Tidak ditemukan Google Chrome atau Microsoft Edge di laptop ini.');
  }

  cancelLogin();

  const profileDir = path.join(os.homedir(), 'AppData', 'Roaming', 'AuraSound', 'suno_browser_profile');
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  // Check if session is already present in profile
  try {
    const existing = await extractSunoSessionFromProfile(profileDir);
    if (existing && existing.token) {
      notifyTokenCaptured(existing.token);
      return { success: true, message: 'Akun Suno Anda langsung terhubung secara otomatis!' };
    }
  } catch (e) {}

  activeLoginState = {
    status: 'waiting_login',
    message: 'Google Chrome terbuka! Silakan klik "Continue with Google" dan pilih akun Anda...',
    token: null,
    timestamp: Date.now()
  };

  // Clean Chrome flags WITHOUT any remote debugging port or automation flags
  const args = [
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=980,780',
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

  // Poller loop: Directly watches the Chromium cookies database every 1.5s
  const startTime = Date.now();
  const maxTimeoutMs = 300000; // 5 mins

  const cookiePoller = setInterval(async () => {
    if (activeLoginState.status !== 'waiting_login') {
      clearInterval(cookiePoller);
      return;
    }

    if (Date.now() - startTime > maxTimeoutMs) {
      clearInterval(cookiePoller);
      cancelLogin();
      activeLoginState = {
        status: 'failed',
        message: 'Waktu login habis (timeout 5 menit).',
        token: null,
        timestamp: Date.now()
      };
      return;
    }

    try {
      const session = await extractSunoSessionFromProfile(profileDir);
      if (session && session.token && session.token.length > 20) {
        clearInterval(cookiePoller);
        notifyTokenCaptured(session.token);
      }
    } catch (e) {}
  }, 1500);

  return { success: true, message: 'Google Chrome berhasil dibuka. Silakan login dengan akun Google Anda.' };
}

module.exports = {
  launchAutomaticSunoLogin,
  getLoginStatus,
  cancelLogin,
  clearLoginSessionProfile,
  findBrowserExecutable,
  notifyTokenCaptured,
  extractSunoSessionFromProfile
};
