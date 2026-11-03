const { BrowserWindow, session } = require('electron');
const axios = require('axios');

const CHROME_DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/**
 * Executes authentic song generation inside Electron's authenticated Suno session.
 * Natively passes Cloudflare Turnstile bot verification and creates songs directly
 * in the user's official Suno account (ravenstars).
 */
async function generateWithSunoBrowser({ prompt, lyrics, tags, title, make_instrumental, model }) {
  console.log('[Suno Generator] Initializing authentic in-app generation on suno.com...');
  const sunoSession = session.fromPartition('persist:suno_auth_session');

  const genWin = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false, // Hidden background window
    webPreferences: {
      session: sunoSession,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  genWin.webContents.setUserAgent(CHROME_DESKTOP_UA);

  let capturedClips = null;
  let serverErrorMessage = null;

  try {
    // 1. Attach CDP to capture the network response from /api/generate
    try {
      genWin.webContents.debugger.attach('1.3');
      genWin.webContents.debugger.sendCommand('Network.enable');
      genWin.webContents.debugger.on('message', async (event, method, params) => {
        if (method === 'Network.responseReceived') {
          const url = params.response?.url || '';
          if (url.includes('/api/generate')) {
            console.log('[Suno Generator] Detected /api/generate network response:', params.response.status);
            try {
              const bodyRes = await genWin.webContents.debugger.sendCommand('Network.getResponseBody', {
                requestId: params.requestId
              });
              if (bodyRes && bodyRes.body) {
                const parsed = JSON.parse(bodyRes.body);
                if (parsed.clips && Array.isArray(parsed.clips) && parsed.clips.length > 0) {
                  capturedClips = parsed.clips;
                  console.log(`[Suno Generator] Successfully captured ${capturedClips.length} newly created clips from Suno!`);
                } else if (parsed.detail || parsed.detail_fallback || parsed.message) {
                  serverErrorMessage = parsed.detail || parsed.detail_fallback || parsed.message;
                  console.warn('[Suno Generator] Suno API returned message:', serverErrorMessage);
                }
              }
            } catch (e) {}
          }
        }
      });
    } catch (dbgErr) {
      console.warn('[Suno Generator] Debugger note:', dbgErr.message);
    }

    // 2. Load https://suno.com/create
    console.log('[Suno Generator] Loading https://suno.com/create...');
    await genWin.loadURL('https://suno.com/create');

    // 3. Wait for DOM and React components to mount
    let pageReady = false;
    for (let i = 0; i < 25; i++) {
      pageReady = await genWin.webContents.executeJavaScript(`
        Boolean(document.querySelector('textarea') || document.querySelector('button'))
      `).catch(() => false);
      if (pageReady) break;
      await new Promise(r => setTimeout(r, 400));
    }

    if (!pageReady) {
      throw new Error('Halaman Suno tidak merespons. Pastikan laptop terhubung ke internet.');
    }

    // 4. Wait 2 seconds for Cloudflare Turnstile token validation to complete naturally
    await new Promise(r => setTimeout(r, 2000));

    // Determine if input has explicit custom lyrics vs a prompt theme description
    const rawText = (lyrics || prompt || '').trim();
    const hasVerseMarkers = /\[(verse|chorus|intro|bridge|outro|hook|pre-chorus)/i.test(rawText);
    const isCustomLyrics = hasVerseMarkers || (lyrics && lyrics.trim().length > 25 && lyrics.includes('\n'));

    const genPayload = {
      isCustomLyrics,
      title: (title || '').trim(),
      lyrics: isCustomLyrics ? rawText : '',
      prompt: rawText,
      tags: (tags || '').trim(),
      make_instrumental: Boolean(make_instrumental)
    };

    // 5. Fill input and click Create
    const fillResult = await genWin.webContents.executeJavaScript(`
      (async () => {
        try {
          const payload = ${JSON.stringify(genPayload)};

          function setNativeValue(el, val) {
            if (!el) return;
            el.focus();
            const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }

          const allButtons = Array.from(document.querySelectorAll('button, [role="switch"]'));
          const customSwitch = allButtons.find(b => {
            const txt = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase();
            return txt === 'custom' || txt.includes('custom');
          });

          const textareas = () => Array.from(document.querySelectorAll('textarea'));
          const isCustomActive = textareas().length >= 2 || !!document.querySelector('input[placeholder*="title" i]');

          if (payload.isCustomLyrics) {
            // Ensure Custom mode is turned ON
            if (customSwitch && !isCustomActive) {
              customSwitch.click();
              await new Promise(r => setTimeout(r, 700));
            }

            const tas = textareas();
            const inputs = Array.from(document.querySelectorAll('input'));

            if (tas.length >= 2) {
              setNativeValue(tas[0], payload.lyrics);
              setNativeValue(tas[1], payload.tags);
            } else if (tas.length === 1) {
              setNativeValue(tas[0], payload.lyrics);
            }

            if (payload.title) {
              const titleInput = inputs.find(i => {
                const ph = (i.placeholder || i.getAttribute('aria-label') || '').toLowerCase();
                return ph.includes('title') || ph.includes('judul');
              });
              if (titleInput) setNativeValue(titleInput, payload.title);
            }
          } else {
            // Standard / Simple Mode: Suno writes the lyrics and music automatically from the prompt!
            if (customSwitch && isCustomActive) {
              customSwitch.click();
              await new Promise(r => setTimeout(r, 700));
            }

            const tas = textareas();
            const fullDesc = [payload.prompt, payload.tags, payload.title].filter(Boolean).join('. ');
            if (tas.length > 0) {
              setNativeValue(tas[0], fullDesc);
            }
          }

          // Handle Instrumental toggle
          if (payload.make_instrumental) {
            const instrBtn = Array.from(document.querySelectorAll('button, [role="switch"]')).find(b => {
              const txt = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase();
              return txt.includes('instrumental');
            });
            if (instrBtn && instrBtn.getAttribute('aria-checked') !== 'true') {
              instrBtn.click();
            }
          }

          // Wait 1.5s for Turnstile & form validation
          await new Promise(r => setTimeout(r, 1500));

          // Find the Create button
          const btns = Array.from(document.querySelectorAll('button'));
          const createBtn = btns.find(b => {
            const txt = (b.innerText || '').trim();
            return txt === 'Create' || txt.startsWith('Create (');
          });

          if (!createBtn) {
            return { error: 'Tombol Create tidak ditemukan di Suno.' };
          }
          if (createBtn.disabled) {
            return { error: 'Tombol Create Suno saat ini nonaktif (kuota kredit habis atau input belum lengkap).' };
          }

          createBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          createBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          createBtn.click();

          return { success: true, text: createBtn.innerText, mode: payload.isCustomLyrics ? 'custom' : 'standard' };
        } catch (err) {
          return { error: err.message };
        }
      })()
    `);

    console.log('[Suno Generator] DOM Fill & Click Result:', fillResult);
    if (fillResult.error) {
      throw new Error(fillResult.error);
    }

    // 6. Wait for clips response from CDP listener (up to 12s)
    for (let wait = 0; wait < 12; wait++) {
      if (capturedClips && capturedClips.length > 0) break;
      if (serverErrorMessage) throw new Error(`Suno Error: ${serverErrorMessage}`);
      await new Promise(r => setTimeout(r, 1000));
    }

    // 7. Fallback: Query official Suno feed API if not yet captured
    if (!capturedClips || capturedClips.length === 0) {
      console.log('[Suno Generator] Polling Suno feed API for newly submitted clips...');
      const sunoService = require('./suno-service');
      const token = sunoService.getConfig().suno_api_key;
      if (token && token.length > 20) {
        for (let p = 0; p < 5; p++) {
          try {
            const feedRes = await axios.get('https://studio-api.prod.suno.com/api/feed/v2', {
              headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': CHROME_DESKTOP_UA
              },
              timeout: 8000
            });
            const allClips = feedRes.data?.clips || [];
            const now = Date.now();
            const recent = allClips.filter(c => {
              const t = new Date(c.created_at).getTime();
              return (now - t) < 90000;
            });
            if (recent.length > 0) {
              capturedClips = recent;
              console.log(`[Suno Generator] Found ${recent.length} recent clips from feed API!`);
              break;
            }
          } catch (e) {}
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    }

    if (!capturedClips || capturedClips.length === 0) {
      throw new Error('Suno telah menerima permintaan generate, namun pembuatan klip sedang antre. Silakan cek Koleksi beberapa saat lagi.');
    }

    return {
      success: true,
      clips: capturedClips,
      isCustomLyrics
    };
  } finally {
    try {
      if (genWin && !genWin.isDestroyed()) {
        genWin.destroy();
      }
    } catch (e) {}
  }
}

global.generateWithSunoBrowser = generateWithSunoBrowser;

module.exports = {
  generateWithSunoBrowser
};
