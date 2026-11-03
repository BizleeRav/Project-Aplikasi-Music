const { BrowserWindow, session } = require('electron');
const axios = require('axios');

const CHROME_DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/**
 * Executes authentic song generation inside Electron's authenticated Suno session.
 * Connects directly to the user's official Suno account (ravenstars), handles
 * modern Lexical and Simple mode inputs, and presents a clean, visible window so
 * Cloudflare Turnstile bot verification passes naturally and the user can solve it if prompted.
 */
async function generateWithSunoBrowser({ prompt, lyrics, tags, title, make_instrumental, model }) {
  console.log('[Suno Generator] Initializing authentic in-app generation on suno.com...');
  const sunoSession = session.fromPartition('persist:suno_auth_session');

  // Show a visible, focused window so Cloudflare Turnstile treats it as a genuine user session.
  // When visible, Turnstile usually passes automatically, or the user can click "Verify you are human" directly.
  const genWin = new BrowserWindow({
    width: 600,
    height: 740,
    show: true,
    center: true,
    title: 'Suno AI Studio - Pembuatan Lagu Sedang Berlangsung...',
    autoHideMenuBar: true,
    alwaysOnTop: true,
    webPreferences: {
      session: sunoSession,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  genWin.webContents.setUserAgent(CHROME_DESKTOP_UA);

  let capturedAuth = null;
  let capturedClips = null;
  let serverErrorMessage = null;
  const pendingRequests = new Map();

  // Pre-seed capturedAuth with existing token if valid
  try {
    const sunoService = require('./suno-service');
    const existingKey = (sunoService.getConfig().suno_api_key || '').trim();
    if (existingKey.length > 20 && existingKey.startsWith('eyJ')) {
      capturedAuth = `Bearer ${existingKey}`;
    }
  } catch (e) {}

  try {
    // 1. Attach CDP to capture network responses and auth tokens
    try {
      genWin.webContents.debugger.attach('1.3');
      genWin.webContents.debugger.sendCommand('Network.enable');

      genWin.webContents.debugger.on('message', async (event, method, params) => {
        if (method === 'Network.requestWillBeSent') {
          const headers = params.request?.headers || {};
          if (headers.authorization && headers.authorization.startsWith('Bearer eyJ')) {
            capturedAuth = headers.authorization;
          }
          const url = params.request?.url || '';
          if (url.includes('/a/api/c/check') || url.includes('generate') || url.includes('/a/api/feed/v3')) {
            pendingRequests.set(params.requestId, url);
          }
        }

        if (method === 'Network.responseReceived') {
          const url = params.response?.url || '';
          if (url.includes('/a/api/c/check') || url.includes('generate') || url.includes('/a/api/feed/v3')) {
            pendingRequests.set(params.requestId, url);
          }
        }

        // Process response body once request has completely finished loading
        if (method === 'Network.loadingFinished') {
          const url = pendingRequests.get(params.requestId);
          if (url) {
            pendingRequests.delete(params.requestId);
            try {
              const bodyRes = await genWin.webContents.debugger.sendCommand('Network.getResponseBody', {
                requestId: params.requestId
              });
              if (bodyRes && bodyRes.body) {
                // A. Generate Endpoint Response
                if (url.includes('generate')) {
                  console.log('[Suno Generator] Captured generate network response body!');
                  try {
                    const parsed = JSON.parse(bodyRes.body);
                    if (parsed.clips && Array.isArray(parsed.clips) && parsed.clips.length > 0) {
                      capturedClips = parsed.clips;
                      console.log(`[Suno Generator] Successfully captured ${capturedClips.length} clips directly from generate response!`);
                      genWin.hide();
                    } else if (parsed.detail || parsed.detail_fallback || parsed.message) {
                      serverErrorMessage = parsed.detail || parsed.detail_fallback || parsed.message;
                      console.warn('[Suno Generator] Suno API returned message:', serverErrorMessage);
                    }
                  } catch (pe) {}
                }

                // B. Feed Endpoint Response
                if (url.includes('/a/api/feed/v3')) {
                  try {
                    const parsed = JSON.parse(bodyRes.body);
                    if (parsed.clips && Array.isArray(parsed.clips) && parsed.clips.length > 0) {
                      const now = Date.now();
                      const recent = parsed.clips.filter(c => {
                        const t = new Date(c.created_at).getTime();
                        return (now - t) < 60000;
                      });
                      if (recent.length > 0) {
                        capturedClips = recent;
                        console.log(`[Suno Generator] Feed listener captured ${recent.length} recent clips!`);
                        genWin.hide();
                      }
                    }
                  } catch (fe) {}
                }
              }
            } catch (e) {}
          }
        }

        if (method === 'Network.loadingFailed') {
          pendingRequests.delete(params.requestId);
        }
      });
    } catch (dbgErr) {
      console.warn('[Suno Generator] Debugger note:', dbgErr.message);
    }

    // 2. Load https://suno.com/create
    console.log('[Suno Generator] Loading https://suno.com/create in foreground...');
    await genWin.loadURL('https://suno.com/create');

    // Check if redirected to sign-in page
    const finalUrl = genWin.webContents.getURL();
    if (finalUrl.includes('/sign-in') || finalUrl.includes('/login')) {
      throw new Error('Akun Suno Anda belum login di aplikasi atau sesi telah berakhir. Silakan klik tombol "Sign In ke Suno AI" di AuraSound dan login kembali.');
    }

    // 3. Wait for DOM and React components to mount
    let pageReady = false;
    for (let i = 0; i < 30; i++) {
      pageReady = await genWin.webContents.executeJavaScript(`
        Boolean(document.querySelector('textarea') || document.querySelector('.lyrics-editor-content') || document.querySelector('button'))
      `).catch(() => false);
      if (pageReady) break;
      await new Promise(r => setTimeout(r, 400));
    }

    if (!pageReady) {
      throw new Error('Halaman Suno tidak merespons. Pastikan laptop terhubung ke internet.');
    }

    // Wait 2 seconds for initial session cookies & page hydration
    await new Promise(r => setTimeout(r, 2000));

    // Determine input mode: Custom lyrics vs Theme prompt
    const rawText = (lyrics || prompt || '').trim();
    const hasVerseMarkers = /\[(verse|chorus|intro|bridge|outro|hook|pre-chorus)/i.test(rawText);
    const isCustomLyrics = Boolean(hasVerseMarkers || (lyrics && lyrics.trim().length > 25 && lyrics.includes('\n')));

    let actualLyrics = (lyrics || '').trim();
    if (!actualLyrics && !make_instrumental && isCustomLyrics) {
      actualLyrics = rawText;
    }

    const genPayload = {
      isCustomLyrics: Boolean(actualLyrics),
      title: (title || '').trim(),
      lyrics: actualLyrics,
      prompt: rawText,
      tags: (tags || '').trim(),
      make_instrumental: Boolean(make_instrumental)
    };

    console.log('[Suno Generator] Filling form mode:', genPayload.isCustomLyrics ? 'Advanced' : 'Simple');

    // 4. Fill form inputs
    if (genPayload.isCustomLyrics) {
      // ADVANCED MODE: Set Lyrics, Styles, and Title
      await genWin.webContents.executeJavaScript(`
        (async () => {
          function setNativeValue(el, val) {
            if (!el) return;
            el.focus();
            const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) setter.call(el, val);
            else el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          }

          // Switch to Advanced tab if not active
          const btns = Array.from(document.querySelectorAll('button, [role="tab"]'));
          const advBtn = btns.find(b => (b.innerText || '').trim() === 'Advanced');
          if (advBtn) {
            advBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            advBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            advBtn.click();
            await new Promise(r => setTimeout(r, 600));
          }

          // Focus lyrics editor
          const lyricsBox = document.querySelector('.lyrics-editor-content, div[aria-label="Lyrics editor"]');
          if (lyricsBox) lyricsBox.focus();

          // Set Styles
          const tas = Array.from(document.querySelectorAll('textarea'));
          const styleBox = tas.find(t => {
            const ph = (t.placeholder || '').toLowerCase();
            return ph.includes('battle rap') || ph.includes('electro dance') || ph.includes('darkwave') || ph.includes('style');
          }) || tas[1] || tas[0];
          if (styleBox && ${JSON.stringify(genPayload.tags || genPayload.prompt)}) {
            setNativeValue(styleBox, ${JSON.stringify(genPayload.tags || genPayload.prompt)});
          }

          // Set Title
          const inputs = Array.from(document.querySelectorAll('input'));
          const titleInput = inputs.find(i => {
            const ph = (i.placeholder || i.getAttribute('aria-label') || '').toLowerCase();
            return ph.includes('title') || ph.includes('judul');
          });
          if (titleInput && ${JSON.stringify(genPayload.title)}) {
            setNativeValue(titleInput, ${JSON.stringify(genPayload.title)});
          }
        })()
      `);

      // Use Chromium's native text insertion for Lexical rich-text lyrics editor
      if (actualLyrics) {
        await genWin.webContents.insertText(actualLyrics);
        await new Promise(r => setTimeout(r, 500));
      }
    } else {
      // SIMPLE MODE: Single prompt textarea
      await genWin.webContents.executeJavaScript(`
        (async () => {
          function setNativeValue(el, val) {
            if (!el) return;
            el.focus();
            const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) setter.call(el, val);
            else el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          }

          // Switch to Simple tab
          const btns = Array.from(document.querySelectorAll('button, [role="tab"]'));
          const simpleBtn = btns.find(b => (b.innerText || '').trim() === 'Simple');
          if (simpleBtn) {
            simpleBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            simpleBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            simpleBtn.click();
            await new Promise(r => setTimeout(r, 600));
          }

          const tas = Array.from(document.querySelectorAll('textarea'));
          if (tas[0]) {
            const promptVal = [${JSON.stringify(genPayload.prompt)}, ${JSON.stringify(genPayload.tags)}].filter(Boolean).join('. ');
            setNativeValue(tas[0], promptVal);
          }
        })()
      `);
    }

    // Handle Instrumental toggle if requested
    if (make_instrumental) {
      await genWin.webContents.executeJavaScript(`
        (() => {
          const instrBtn = Array.from(document.querySelectorAll('button, [role="switch"], input[type="checkbox"]')).find(b => {
            const txt = (b.innerText || b.getAttribute('aria-label') || b.name || '').toLowerCase();
            return txt.includes('instrumental');
          });
          if (instrBtn) {
            const isChecked = instrBtn.getAttribute('aria-checked') === 'true' || instrBtn.checked === true;
            if (!isChecked) instrBtn.click();
          }
        })()
      `);
    }

    await new Promise(r => setTimeout(r, 1200));

    // 5. Click the Create button
    const clickResult = await genWin.webContents.executeJavaScript(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const createBtn = btns.find(b => {
          const txt = (b.innerText || b.textContent || '').trim();
          return txt === 'Create' || txt.startsWith('Create');
        });

        if (!createBtn) return { error: 'Tombol Create tidak ditemukan di Suno.' };
        if (createBtn.disabled) return { error: 'Tombol Create Suno saat ini nonaktif (kuota kredit habis atau input belum lengkap).' };

        createBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        createBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        createBtn.click();
        return { success: true, text: createBtn.innerText };
      })()
    `);

    console.log('[Suno Generator] Click Result:', clickResult);
    if (clickResult.error) {
      throw new Error(clickResult.error);
    }

    // 6. Poll for newly created clips in Suno's active feed (up to 60s)
    const startTimeMs = Date.now();
    console.log('[Suno Generator] Awaiting newly created song clips from Suno...');

    for (let wait = 0; wait < 30; wait++) {
      if (capturedClips && capturedClips.length > 0) break;
      if (serverErrorMessage) throw new Error(`Suno Error: ${serverErrorMessage}`);

      await new Promise(r => setTimeout(r, 2000));

      // If user resolved Turnstile challenge and Create button is active again, re-click Create
      if (wait >= 3 && wait % 3 === 0 && !capturedClips) {
        await genWin.webContents.executeJavaScript(`
          (() => {
            const hasTurnstile = Boolean(document.querySelector('iframe[src*="cloudflare"], iframe[src*="turnstile"], div[class*="turnstile"]'));
            if (!hasTurnstile) {
              const btns = Array.from(document.querySelectorAll('button'));
              const createBtn = btns.find(b => {
                const txt = (b.innerText || b.textContent || '').trim();
                return txt === 'Create' || txt.startsWith('Create');
              });
              if (createBtn && !createBtn.disabled) {
                createBtn.click();
              }
            }
          })()
        `).catch(() => {});
      }

      // Query page feed v3 directly via in-page fetch
      if (capturedAuth) {
        try {
          const pageFeed = await genWin.webContents.executeJavaScript(`
            (async () => {
              try {
                const res = await fetch('https://suno.com/a/api/feed/v3', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': ${JSON.stringify(capturedAuth)}
                  },
                  body: JSON.stringify({ cursor: null, limit: 10 })
                });
                const d = await res.json();
                return { clips: d.clips || [], ok: res.ok };
              } catch (e) {
                return { error: e.message };
              }
            })()
          `);

          if (pageFeed && Array.isArray(pageFeed.clips) && pageFeed.clips.length > 0) {
            const recent = pageFeed.clips.filter(c => {
              const t = new Date(c.created_at).getTime();
              return t >= (startTimeMs - 50000); // Created right during this generation session
            });

            if (recent.length > 0) {
              capturedClips = recent;
              console.log(`[Suno Generator] Successfully retrieved ${recent.length} newly submitted clips from Suno feed!`);
              genWin.hide();
              break;
            }
          }
        } catch (e) {}
      }
    }

    if (!capturedClips || capturedClips.length === 0) {
      throw new Error('Suno membutuhkan verifikasi keamanan. Silakan klik Generate kembali dan selesaikan verifikasi centang di jendela yang muncul.');
    }

    // Sync token to persistent config
    if (capturedAuth) {
      try {
        const rawToken = capturedAuth.replace(/^Bearer\s+/i, '').trim();
        const sunoService = require('./suno-service');
        sunoService.saveConfig({ suno_api_key: rawToken, suno_provider: 'suno_official' });
      } catch (e) {}
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
