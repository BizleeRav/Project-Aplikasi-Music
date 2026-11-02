const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const axios = require('axios');
const helper = require('./suno-login-helper');

/**
 * Triggers genuine Suno AI generation via headless/offscreen Chrome
 * using the user's authentic logged-in session (bypassing Cloudflare Turnstile).
 */
async function triggerSunoBrowserGenerate({ prompt, tags, title, make_instrumental }) {
  const browserPath = helper.findBrowserExecutable();
  if (!browserPath) {
    throw new Error('Google Chrome atau Microsoft Edge tidak ditemukan di laptop ini.');
  }

  const profileDir = path.join(os.homedir(), 'AppData', 'Roaming', 'AuraSound', 'suno_browser_profile');
  if (!fs.existsSync(profileDir)) {
    throw new Error('Profil login Suno belum tersedia. Silakan hubungkan akun Suno Anda terlebih dahulu.');
  }

  const debugPort = 9333;
  console.log(`[Suno Browser Generator] Launching offscreen browser on port ${debugPort}...`);

  const chromeProc = spawn(browserPath, [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=960,720',
    '--window-position=-3000,-3000',
    'https://suno.com/create'
  ]);

  const cleanup = () => {
    try { chromeProc.kill(); } catch (e) {}
  };

  try {
    // 1. Wait for CDP endpoint to be available (max 10s)
    let tab = null;
    for (let i = 0; i < 20; i++) {
      try {
        const targets = (await axios.get(`http://127.0.0.1:${debugPort}/json`, { timeout: 1000 })).data;
        tab = targets.find(t => t.url && t.url.includes('suno.com/create'));
        if (tab) break;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 500));
    }

    if (!tab) {
      throw new Error('Gagal membuka tab Suno Create.');
    }

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });

    let msgId = 1;
    function sendCommand(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        const handler = (evt) => {
          try {
            const data = JSON.parse(evt.data);
            if (data.id === id) {
              ws.removeEventListener('message', handler);
              if (data.error) reject(data.error);
              else resolve(data.result);
            }
          } catch (e) {}
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await sendCommand('Network.enable');

    let generateRequestId = null;
    let generateClips = null;

    ws.addEventListener('message', async (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.method === 'Network.responseReceived') {
          const url = data.params?.response?.url || '';
          if (url.includes('/api/generate')) {
            generateRequestId = data.params?.requestId;
            console.log('[Suno Browser Generator] Detected generate response URL:', url);
          }
        }
      } catch (e) {}
    });

    // 2. Prepare prompt text: if user provided prompt, use prompt; else use lyrics/tags
    const fullPrompt = prompt || `${tags || ''} ${title || ''}`.trim();

    // 3. Evaluate script in page to enter prompt and click Create
    const evalScript = `(async function() {
      // Wait for textarea
      let textarea = null;
      for (let i = 0; i < 25; i++) {
        textarea = document.querySelector('textarea');
        if (textarea) break;
        await new Promise(r => setTimeout(r, 400));
      }
      if (!textarea) return { error: 'Textarea input tidak ditemukan di suno.com' };

      const promptValue = ${JSON.stringify(fullPrompt)};
      textarea.focus();
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeSetter.call(textarea, promptValue);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));

      // Wait 1.5s for Cloudflare Turnstile token validation
      await new Promise(r => setTimeout(r, 1500));

      // Find Create button
      const buttons = Array.from(document.querySelectorAll('button'));
      const createBtn = buttons.find(b => {
        const txt = (b.innerText || '').trim();
        return txt === 'Create' || txt.startsWith('Create (');
      });

      if (!createBtn) return { error: 'Tombol Create tidak ditemukan' };
      if (createBtn.disabled) return { error: 'Tombol Create saat ini tidak aktif (disabled)' };

      createBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      createBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      createBtn.click();

      return { success: true, text: createBtn.innerText };
    })()`;

    const evalResult = await sendCommand('Runtime.evaluate', {
      expression: evalScript,
      awaitPromise: true,
      returnByValue: true
    });

    const pageRes = evalResult?.result?.value;
    console.log('[Suno Browser Generator] Eval result:', pageRes);
    if (pageRes?.error) {
      throw new Error(pageRes.error);
    }

    // 4. Wait up to 12s for the generate network response or read response body
    const pollStart = Date.now();
    while (Date.now() - pollStart < 12000) {
      if (generateRequestId) {
        try {
          const bodyData = await sendCommand('Network.getResponseBody', { requestId: generateRequestId });
          if (bodyData && bodyData.body) {
            const parsed = JSON.parse(bodyData.body);
            generateClips = parsed.clips || parsed.data?.clips || [];
            if (generateClips.length > 0) {
              console.log('[Suno Browser Generator] Successfully captured clips from network response:', generateClips.length);
              break;
            }
          }
        } catch (e) {}
      }
      await new Promise(r => setTimeout(r, 600));
    }

    ws.close();
    cleanup();

    // 5. If we captured clips directly from network response, return them
    if (generateClips && generateClips.length > 0) {
      return {
        success: true,
        clips: generateClips.map(c => ({
          id: c.id,
          title: c.title || title || 'Lagu Suno AI',
          status: c.status || 'submitted',
          model: c.major_model_version || 'v6-mini',
          duration: '3:00'
        }))
      };
    }

    // 6. Otherwise, check feed API for recently submitted clips
    const sess = await helper.extractSunoSessionFromProfile(profileDir);
    if (sess && sess.token) {
      const feedRes = await axios.get('https://studio-api.prod.suno.com/api/feed/v2', {
        headers: {
          'Authorization': `Bearer ${sess.token}`,
          'User-Agent': 'Mozilla/5.0'
        },
        timeout: 8000
      });
      const feedClips = feedRes.data?.clips || feedRes.data || [];
      const submitted = feedClips.slice(0, 2);
      if (submitted.length > 0) {
        return {
          success: true,
          clips: submitted.map(c => ({
            id: c.id,
            title: c.title || title || 'Lagu Suno AI',
            status: c.status || 'submitted',
            model: c.major_model_version || 'v6-mini',
            duration: '3:00'
          }))
        };
      }
    }

    throw new Error('Suno AI belum mengembalikan ID lagu baru. Silakan coba klik Generate sekali lagi.');
  } catch (err) {
    cleanup();
    throw err;
  }
}

module.exports = {
  triggerSunoBrowserGenerate
};
