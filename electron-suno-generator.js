const { BrowserWindow, session } = require('electron');
const axios = require('axios');

const CHROME_DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// Singleton Pre-Warmed Persistent Suno Engine state
let sunoEngineWin = null;
let engineInitPromise = null;
let isDestroyingEngine = false;
let isGeneratingBusy = false;

/**
 * Detect whether input text is a musical prompt instruction / style description
 * rather than actual singable lyrics
 */
function isPromptInstruction(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();

  const signals = [
    'vocal arrangement', 'instruments:', 'instrument:', 'begin with', 'gradually introduce',
    'create a magical atmosphere', 'melodic progression', 'no rock', 'no rap',
    'no electronic', 'high-quality', 'must remain', 'soundtrack', 'orchestral choir',
    'female lead vocalist', 'male and female choir', 'french horns', 'woodwinds',
    'percussion', 'timpani', 'cinematic drums', 'tempo', 'bpm', 'acoustic guitar, warm',
    '140 bpm', '125 bpm', 'mastering', 'production', 'symphonic metal', 'duet chorus',
    'folk ensemble', 'section 1', 'section 2', 'vocal structure', 'female solo', 'male solo',
    'lead vocal', 'lead vocalist', 'acoustic guitar and accordion', 'whimsical', 'european folk',
    'folk dance', 'only one female', 'structure:'
  ];

  let matches = 0;
  for (const s of signals) {
    if (t.includes(s)) matches++;
  }
  if (matches >= 2) return true;
  if (t.includes('vocal arrangement:') || t.includes('instruments:') || t.includes('vocal arrangement') || t.includes('vocal structure')) return true;
  if (/section \d+/i.test(t) && (t.includes('solo') || t.includes('instruments') || t.includes('ensemble') || t.includes('tempo') || t.includes('vocal'))) return true;

  const hasLyricMarkers = /\[(verse|chorus|intro|bridge|outro|pre-chorus|hook)/i.test(text);
  if (!hasLyricMarkers) {
    if (t.includes('lagu ') || t.includes('tentang ') || t.includes('bertemakan ') || t.includes('gaya musik ') || t.includes('soundtrack')) {
      return true;
    }
    if (t.includes('cinematic') && (t.includes('vocals') || t.includes('soundtrack') || t.includes('orchestral') || t.includes('choir'))) {
      return true;
    }
  }

  return false;
}

/**
 * Transforms complex musical/vocal arrangement instructions (>450 chars)
 * into rich Style of Music tags (<950 chars) and clean Suno vocal meta-tags
 * so Suno NEVER sings instruction text word-for-word!
 */
function processArrangementInstruction(promptText, tags, title) {
  const lines = (promptText || '').split('\n');
  const styleLines = [];
  const lyricStructure = [];
  let currentSection = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Detect section headers (e.g. "Section 1 — FEMALE SOLO: ...", "[Chorus: Full Choir]")
    const sectionMatch = line.match(/^(?:\[?(?:section\s*\d+|verse\s*\d*|chorus\s*\d*|intro|outro|bridge|hook|solo|pre-chorus)[^\]\n:]*\]?)(?:\s*[:—\-]\s*(.*))?$/i);
    if (sectionMatch) {
      let tag = line.replace(/^[\[\s]+|[\]\s]+$/g, '').trim();
      tag = tag.replace(/—|\-/g, ':').replace(/\s+/g, ' ');
      currentSection = `[${tag}]`;
      lyricStructure.push(currentSection);
      if (sectionMatch[1]) {
        const remainder = sectionMatch[1].trim();
        if (isPromptInstruction(remainder)) {
          styleLines.push(remainder);
        } else {
          lyricStructure.push(remainder);
        }
      }
      continue;
    }

    if (isPromptInstruction(line) || /^(instruments?|vocal|tempo|bpm|mood|production|arrangement|style):/i.test(line)) {
      styleLines.push(line.replace(/^(instruments?|vocal arrangement|style|mood):/i, '').trim());
    } else {
      if (currentSection) {
        lyricStructure.push(line);
      } else {
        styleLines.push(line);
      }
    }
  }

  const combinedStyle = [tags, ...styleLines].filter(Boolean).join(', ').replace(/\s+/g, ' ').slice(0, 950);
  let lyricText = lyricStructure.join('\n');
  if (!lyricText || lyricText.trim().length === 0) {
    lyricText = `[Intro: Instrumental Hook]\n\n[Section 1: Lead Solo]\n\n[Section 2: Dynamic Ensemble]\n\n[Chorus: Full Harmony]\n\n[Outro: Melodic Fade]`;
  }

  return {
    style: combinedStyle,
    lyrics: lyricText
  };
}

/**
 * Fetch Suno clips by IDs directly using Electron authenticated session
 */
global.fetchSunoClipsByIds = async (ids) => {
  try {
    const sunoSession = session.fromPartition('persist:suno_auth_session');
    const idArray = Array.isArray(ids) ? ids : (typeof ids === 'string' ? ids.split(',').map(s => s.trim()).filter(Boolean) : []);
    if (idArray.length === 0) return [];

    let token = null;
    if (typeof global.getFreshSunoToken === 'function') {
      token = await global.getFreshSunoToken();
    }
    if (!token) {
      const cookies = await sunoSession.cookies.get({ name: '__session' });
      token = cookies?.[0]?.value;
    }
    if (!token) return [];

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Cookie': `__session=${token}`,
      'Content-Type': 'application/json',
      'Origin': 'https://suno.com',
      'Referer': 'https://suno.com/',
      'User-Agent': CHROME_DESKTOP_UA
    };

    try {
      const res = await axios.get(`https://studio-api.prod.suno.com/api/feed/v2?ids=${idArray.join(',')}`, {
        headers,
        timeout: 8000
      });
      const clips = Array.isArray(res.data) ? res.data : (res.data?.clips || res.data?.data?.clips || []);
      if (clips.length > 0) return clips;
    } catch (e) {}

    for (const feedUrl of ['https://studio-api.prod.suno.com/api/feed/v3', 'https://suno.com/a/api/feed/v3']) {
      try {
        const feedRes = await axios.post(feedUrl, {
          cursor: null,
          limit: 20
        }, {
          headers,
          timeout: 8000
        });
        const allClips = feedRes.data?.clips || [];
        const idSet = new Set(idArray);
        const matched = allClips.filter(c => idSet.has(c.id));
        if (matched.length > 0) return matched;
      } catch (e2) {}
    }

    return [];
  } catch (err) {
    console.warn('[fetchSunoClipsByIds] Error:', err.message);
    return [];
  }
};

/**
 * Attach response observer once per page load (clean, without visibility spoofing)
 */
function injectPageFetchHook(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript(`
    try {
      if (!window.__sunoIntercepted) {
        window.__sunoIntercepted = true;
        window.__sunoGenClips = null;
        window.__sunoGenError = null;
        window.__sunoCaptchaRequired = null;
        window.__sunoUserCancelled = false;
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
          const url = (args[0] && typeof args[0] === 'string') ? args[0] : (args[0]?.url || '');
          const res = await originalFetch.apply(this, args);
          try {
            if (url.includes('/generate') || url.includes('/api/generate')) {
              const clone = res.clone();
              const data = await clone.json();
              if (data && data.clips && Array.isArray(data.clips) && data.clips.length > 0) {
                window.__sunoGenClips = data.clips;
              } else if (data && (data.detail || data.detail_fallback || data.error_type || data.message)) {
                window.__sunoGenError = data.detail || data.detail_fallback || data.error_type || data.message;
              }
            } else if (url.includes('/api/c/check') || url.includes('/c/check')) {
              const clone = res.clone();
              const data = await clone.json();
              if (data && typeof data.required === 'boolean') {
                window.__sunoCaptchaRequired = data.required;
              }
            }
          } catch (e) {}
          return res;
        };
      }
    } catch (e) {}
  `).catch(() => {});
}

/**
 * Initialize or reuse the Singleton Pre-Warmed Persistent Suno Engine window.
 * Keeps https://suno.com/create ready in memory so consecutive song generations
 * skip the 8-14s cold-start page reload completely.
 */
async function initWarmSunoEngine({ forceReload = false } = {}) {
  const sunoSession = session.fromPartition('persist:suno_auth_session');

  if (sunoEngineWin && !sunoEngineWin.isDestroyed() && !forceReload) {
    const currentUrl = sunoEngineWin.webContents.getURL() || '';
    if (currentUrl.includes('suno.com/create') && !currentUrl.includes('/sign-in') && !currentUrl.includes('/login')) {
      const mounted = await sunoEngineWin.webContents.executeJavaScript(`
        Boolean(document.querySelector('textarea') || document.querySelector('.lyrics-editor-content') || document.querySelector('button[aria-label="Create song"]'))
      `).catch(() => false);
      if (mounted) {
        injectPageFetchHook(sunoEngineWin);
        return sunoEngineWin;
      }
    }
  }

  if (engineInitPromise) {
    return engineInitPromise;
  }

  engineInitPromise = (async () => {
    try {
      if (!sunoEngineWin || sunoEngineWin.isDestroyed()) {
        isDestroyingEngine = false;
        sunoEngineWin = new BrowserWindow({
          width: 480,
          height: 540,
          show: false,
          skipTaskbar: true,
          focusable: true,
          title: 'Verifikasi Suno AI',
          autoHideMenuBar: true,
          backgroundColor: '#0b0f19',
          webPreferences: {
            session: sunoSession,
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false
          }
        });

        sunoEngineWin.setMenuBarVisibility(false);
        if (typeof sunoEngineWin.removeMenu === 'function') {
          sunoEngineWin.removeMenu();
        }
        sunoEngineWin.webContents.setUserAgent(CHROME_DESKTOP_UA);

        sunoEngineWin.webContents.on('dom-ready', () => injectPageFetchHook(sunoEngineWin));
        sunoEngineWin.webContents.on('did-finish-load', () => injectPageFetchHook(sunoEngineWin));

        // Preserve warm engine if user manually closes the verification dialog
        sunoEngineWin.on('close', (e) => {
          if (!isDestroyingEngine && sunoEngineWin && !sunoEngineWin.isDestroyed()) {
            e.preventDefault();
            try {
              sunoEngineWin.setAlwaysOnTop(false);
              sunoEngineWin.hide();
              sunoEngineWin.webContents.executeJavaScript('window.__sunoUserCancelled = true;').catch(() => {});
            } catch (err) {}
          }
        });

        sunoEngineWin.on('closed', () => {
          sunoEngineWin = null;
        });
      }

      console.log('[Suno Warm Engine] Pre-warming https://suno.com/create in background...');
      await sunoEngineWin.loadURL('https://suno.com/create');

      const finalUrl = sunoEngineWin.webContents.getURL() || '';
      if (!finalUrl.includes('/sign-in') && !finalUrl.includes('/login')) {
        for (let i = 0; i < 28; i++) {
          const ready = await sunoEngineWin.webContents.executeJavaScript(`
            Boolean(document.querySelector('textarea') || document.querySelector('.lyrics-editor-content') || document.querySelector('button[aria-label="Create song"]'))
          `).catch(() => false);
          if (ready) break;
          await new Promise(r => setTimeout(r, 350));
        }
        injectPageFetchHook(sunoEngineWin);
        console.log('[Suno Warm Engine] Standby ready on suno.com/create!');
      }

      return sunoEngineWin;
    } finally {
      engineInitPromise = null;
    }
  })();

  return engineInitPromise;
}

/**
 * Destroy the singleton warm engine cleanly on app quit or account disconnect
 */
function destroyWarmSunoEngine() {
  isDestroyingEngine = true;
  engineInitPromise = null;
  try {
    if (sunoEngineWin && !sunoEngineWin.isDestroyed()) {
      sunoEngineWin.destroy();
    }
  } catch (e) {}
  sunoEngineWin = null;
  isDestroyingEngine = false;
}

/**
 * Executes authentic song generation inside Electron's Pre-Warmed Suno session.
 * Handles Simple, Custom Lyrics, and Arrangement modes accurately on suno.com/create.
 */
async function generateWithSunoBrowser({ prompt, lyrics, tags, title, make_instrumental, model, isArrangementInstruction, rawPrompt, rawLyrics }) {
  if (isGeneratingBusy) {
    throw new Error('Pembuatan lagu sedang diproses. Mohon tunggu beberapa detik.');
  }
  isGeneratingBusy = true;

  let capturedAuth = null;
  let capturedClips = null;
  let serverErrorMessage = null;
  const existingClipIds = new Set();

  try {
    let genWin = await initWarmSunoEngine();
    let currentUrl = genWin.webContents.getURL() || '';

    // If warm engine was loaded before login, reload once to pick up session cookies
    if (currentUrl.includes('/sign-in') || currentUrl.includes('/login') || !currentUrl.includes('suno.com/create')) {
      genWin = await initWarmSunoEngine({ forceReload: true });
      currentUrl = genWin.webContents.getURL() || '';
    }

    if (currentUrl.includes('/sign-in') || currentUrl.includes('/login')) {
      throw new Error('Akun Suno Anda belum login di aplikasi atau sesi telah berakhir. Silakan klik tombol "Hubungkan Akun Suno" di AuraSound dan login kembali.');
    }

    // Ensure React workspace inputs are mounted
    let pageReady = false;
    for (let i = 0; i < 20; i++) {
      pageReady = await genWin.webContents.executeJavaScript(`
        Boolean(document.querySelector('textarea') || document.querySelector('.lyrics-editor-content') || document.querySelector('button[aria-label="Create song"]'))
      `).catch(() => false);
      if (pageReady) break;
      await new Promise(r => setTimeout(r, 300));
    }

    if (!pageReady) {
      genWin = await initWarmSunoEngine({ forceReload: true });
      pageReady = await genWin.webContents.executeJavaScript(`
        Boolean(document.querySelector('textarea') || document.querySelector('.lyrics-editor-content') || document.querySelector('button'))
      `).catch(() => false);
      if (!pageReady) {
        throw new Error('Halaman Suno tidak merespons. Pastikan perangkat terhubung ke internet.');
      }
    }

    // Reset capture state for this generation run
    injectPageFetchHook(genWin);
    await genWin.webContents.executeJavaScript(`
      window.__sunoGenClips = null;
      window.__sunoGenError = null;
      window.__sunoCaptchaRequired = null;
      window.__sunoUserCancelled = false;
    `).catch(() => {});

    // Obtain fresh JWT token (fast path via Electron cookie manager first, fallback to Clerk in-page)
    let rawToken = null;
    if (typeof global.getFreshSunoToken === 'function') {
      rawToken = await global.getFreshSunoToken().catch(() => null);
    }
    if (!rawToken) {
      rawToken = await genWin.webContents.executeJavaScript(`
        (async () => {
          try {
            if (window.Clerk && window.Clerk.session) {
              const tok = await window.Clerk.session.getToken();
              if (tok && typeof tok === 'string' && tok.length > 20) return tok;
            }
            const m = document.cookie.match(/__session=([^;]+)/);
            return (m && m[1]) ? m[1] : null;
          } catch (e) { return null; }
        })()
      `).catch(() => null);
    }
    if (!rawToken) {
      try {
        const sunoService = require('./suno-service');
        const existingKey = (sunoService.getConfig().suno_api_key || '').trim();
        if (existingKey.length > 20 && existingKey.startsWith('eyJ')) {
          rawToken = existingKey;
        }
      } catch (e) {}
    }
    if (rawToken && rawToken.length > 20) {
      capturedAuth = `Bearer ${rawToken}`;
    }

    // Pre-fetch existing clip IDs IN PARALLEL via HTTP while we fill the DOM form!
    const existingClipsPromise = (async () => {
      if (!rawToken) return;
      const headers = {
        'Authorization': `Bearer ${rawToken}`,
        'Cookie': `__session=${rawToken}`,
        'Content-Type': 'application/json',
        'Origin': 'https://suno.com',
        'Referer': 'https://suno.com/',
        'User-Agent': CHROME_DESKTOP_UA
      };
      for (const feedUrl of ['https://studio-api.prod.suno.com/api/feed/v3', 'https://suno.com/a/api/feed/v3']) {
        try {
          const res = await axios.post(feedUrl, { cursor: null, limit: 30 }, { headers, timeout: 4500 });
          const clips = res.data?.clips || [];
          if (Array.isArray(clips) && clips.length > 0) {
            clips.forEach(c => { if (c && c.id) existingClipIds.add(c.id); });
            return;
          }
        } catch (e) {}
      }
    })();

    // Determine generation mode:
    const promptInput = (prompt || rawPrompt || '').trim();
    const lyricsInput = (lyrics || rawLyrics || '').trim();

    let targetMode = 'simple';
    if (lyricsInput.length > 0 && !isArrangementInstruction) {
      targetMode = 'custom_lyrics';
    } else if (isArrangementInstruction || promptInput.length > 450) {
      targetMode = 'arrangement';
    } else {
      targetMode = 'simple';
    }

    console.log(`[Suno Warm Engine] Filling form instantly (mode: ${targetMode})...`);

    if (targetMode === 'simple') {
      const simplePrompt = [promptInput, tags].filter(Boolean).join('. ').slice(0, 450);
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

          const tabs = Array.from(document.querySelectorAll('[role="tab"], button, div[role="button"]'));
          const simpleTab = tabs.find(b => (b.innerText || b.textContent || '').trim().toLowerCase() === 'simple');
          if (simpleTab && simpleTab.getAttribute('aria-selected') !== 'true') {
            simpleTab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
            simpleTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            simpleTab.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
            simpleTab.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            simpleTab.click();
            await new Promise(r => setTimeout(r, 350));
          }

          const tas = Array.from(document.querySelectorAll('textarea')).filter(t => {
            const al = (t.getAttribute('aria-label') || '').toLowerCase();
            return !al.includes('cowriter') && !al.includes('sound') && !al.includes('script') && !al.includes('tone');
          });
          const promptBox = tas[0] || document.querySelector('textarea');
          if (promptBox) {
            setNativeValue(promptBox, ${JSON.stringify(simplePrompt)});
          }
        })()
      `);
    } else {
      const isArrangement = targetMode === 'arrangement';
      const parsed = isArrangement
        ? processArrangementInstruction(promptInput, tags, title)
        : { style: (tags || promptInput).slice(0, 950), lyrics: lyricsInput };

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

          const tabs = Array.from(document.querySelectorAll('[role="tab"], button, div[role="button"]'));
          const advTab = tabs.find(b => {
            const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
            return txt === 'advanced' || txt === 'custom';
          });
          if (advTab && advTab.getAttribute('aria-selected') !== 'true') {
            advTab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
            advTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            advTab.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
            advTab.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            advTab.click();
            await new Promise(r => setTimeout(r, 350));
          }

          const styleBox = document.querySelector('textarea[aria-label="Styles"]') ||
            Array.from(document.querySelectorAll('textarea')).find(t => {
              const al = (t.getAttribute('aria-label') || '').toLowerCase();
              const ph = (t.placeholder || '').toLowerCase();
              return al === 'styles' || ph.includes('style') || ph.includes('battle rap') || ph.includes('genre') || ph.includes('románticas');
            });
          if (styleBox) {
            setNativeValue(styleBox, ${JSON.stringify(parsed.style || '')});
          }

          const titleInput = document.querySelector('input[placeholder*="Song Title" i], input[placeholder*="Title" i], input[aria-label*="Title" i]');
          if (titleInput) {
            setNativeValue(titleInput, ${JSON.stringify(title || '')});
          }

          const lyricsBox = document.querySelector('div[aria-label="Lyrics editor"], .lyrics-editor-content, div[role="textbox"][contenteditable="true"]');
          if (lyricsBox) {
            lyricsBox.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
          }
        })()
      `);

      if (!make_instrumental && parsed.lyrics) {
        await genWin.webContents.insertText(parsed.lyrics);
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Sync Instrumental toggle accurately in both directions (ON and OFF) for warm session reuse
    const desiredInstrumental = Boolean(make_instrumental);
    await genWin.webContents.executeJavaScript(`
      (() => {
        const instrBtn = Array.from(document.querySelectorAll('button, [role="switch"], input[type="checkbox"]')).find(b => {
          const txt = (b.innerText || b.getAttribute('aria-label') || b.name || '').toLowerCase();
          return txt.includes('instrumental');
        });
        if (instrBtn) {
          const isChecked = instrBtn.getAttribute('aria-checked') === 'true' || instrBtn.checked === true || instrBtn.getAttribute('data-state') === 'checked';
          if (isChecked !== ${JSON.stringify(desiredInstrumental)}) {
            instrBtn.click();
          }
        }
      })()
    `).catch(() => {});

    // Ensure parallel existingClipIds request has settled + brief React flush
    await Promise.all([
      existingClipsPromise,
      new Promise(r => setTimeout(r, 350))
    ]);

    // Click the genuine Create button
    const tryClickCreate = () => genWin.webContents.executeJavaScript(`
      (() => {
        let createBtn = document.querySelector('button[aria-label="Create song"]');
        if (!createBtn) {
          const allBtns = Array.from(document.querySelectorAll('button')).filter(b => !b.closest('nav') && !b.closest('aside'));
          createBtn = allBtns.find(b => {
            const t = (b.innerText || b.textContent || '').trim().toLowerCase();
            return t === 'create' || t.startsWith('create (') || t.startsWith('create ');
          });
        }
        if (!createBtn) return { error: 'Tombol Create tidak ditemukan di Suno.' };
        if (createBtn.disabled) return { disabled: true, error: 'Tombol Create Suno saat ini nonaktif (kuota kredit habis atau input belum lengkap).' };

        createBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
        createBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
        createBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        createBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
        createBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        createBtn.click();
        return { success: true, text: (createBtn.innerText || createBtn.textContent || '').trim() };
      })()
    `);

    let clickResult = await tryClickCreate();
    if (clickResult && clickResult.disabled) {
      await new Promise(r => setTimeout(r, 600));
      clickResult = await tryClickCreate();
    }

    console.log('[Suno Warm Engine] Click Result:', clickResult);
    if (clickResult.error) {
      throw new Error(clickResult.error);
    }

    const clickTimeMs = Date.now();
    let challengeShown = false;

    for (let wait = 0; wait < 30; wait++) {
      await new Promise(r => setTimeout(r, 1000));

      try {
        const interceptRes = await genWin.webContents.executeJavaScript(`
          (() => {
            const turnstileFrame = Array.from(document.querySelectorAll('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]'))
              .find(f => f.offsetWidth > 10 && f.offsetHeight > 10);
            return {
              clips: window.__sunoGenClips,
              error: window.__sunoGenError,
              captchaRequired: window.__sunoCaptchaRequired,
              userCancelled: Boolean(window.__sunoUserCancelled),
              hasVisibleTurnstile: Boolean(turnstileFrame)
            };
          })()
        `);

        if (interceptRes?.userCancelled) {
          throw new Error('Verifikasi Suno dibatalkan.');
        }

        if (interceptRes?.error) {
          serverErrorMessage = interceptRes.error;
          throw new Error(`Suno Error: ${interceptRes.error}`);
        }

        if (interceptRes?.clips && Array.isArray(interceptRes.clips) && interceptRes.clips.length > 0) {
          capturedClips = interceptRes.clips;
          console.log(`[Suno Warm Engine] Captured ${capturedClips.length} clips directly from generate response!`);
          break;
        }

        // Only surface the already-loaded compact window if interactive human check is still pending after 1 tick
        if (!challengeShown && wait >= 1 && (interceptRes?.captchaRequired === true || interceptRes?.hasVisibleTurnstile)) {
          challengeShown = true;
          console.log('[Suno Warm Engine] Interactive verification requested by Suno. Showing instant warm window...');
          genWin.setSize(480, 540);
          genWin.center();
          genWin.setAlwaysOnTop(true);
          genWin.show();
          genWin.focus();
        }
      } catch (ie) {
        if (ie.message && (ie.message.includes('Suno Error:') || ie.message.includes('dibatalkan'))) {
          throw ie;
        }
      }

      // Fallback check via feed/v3 every 2nd tick in case response hook missed clips
      if (wait % 2 === 1 && capturedAuth) {
        try {
          const rawJwt = capturedAuth.replace(/^Bearer\s+/i, '').trim();
          const feedRes = await axios.post('https://studio-api.prod.suno.com/api/feed/v3', {
            cursor: null,
            limit: 12
          }, {
            headers: {
              'Authorization': capturedAuth,
              'Cookie': `__session=${rawJwt}`,
              'Content-Type': 'application/json',
              'Origin': 'https://suno.com',
              'Referer': 'https://suno.com/',
              'User-Agent': CHROME_DESKTOP_UA
            },
            timeout: 4000
          });
          const feedClips = feedRes.data?.clips || [];
          const newClips = feedClips.filter(c => {
            if (!c || !c.id || existingClipIds.has(c.id)) return false;
            if (c.created_at) {
              const t = new Date(c.created_at).getTime();
              if (t < (clickTimeMs - 20000)) return false;
            }
            return true;
          });
          if (newClips.length > 0) {
            capturedClips = newClips;
            console.log(`[Suno Warm Engine] Retrieved ${newClips.length} NEW clips via feed/v3!`);
            break;
          }
        } catch (e) {}
      }
    }

    if (!capturedClips || capturedClips.length === 0) {
      if (challengeShown) {
        throw new Error('Verifikasi Suno AI ("Verify you are human") belum selesai atau waktu habis.');
      }
      if (serverErrorMessage) {
        throw new Error(`Suno: ${serverErrorMessage}`);
      }
      throw new Error('Suno belum mengembalikan lagu baru. Pastikan akun Suno Anda masih memiliki kuota kredit yang mencukupi.');
    }

    // Sync refreshed token to persistent config
    if (capturedAuth) {
      try {
        const cleanTok = capturedAuth.replace(/^Bearer\s+/i, '').trim();
        const sunoService = require('./suno-service');
        sunoService.saveConfig({ suno_api_key: cleanTok, suno_provider: 'suno_official' });
      } catch (e) {}
    }

    return {
      success: true,
      clips: capturedClips,
      targetMode
    };
  } finally {
    isGeneratingBusy = false;
    try {
      if (sunoEngineWin && !sunoEngineWin.isDestroyed()) {
        sunoEngineWin.setAlwaysOnTop(false);
        sunoEngineWin.hide();
      }
    } catch (e) {}
  }
}

global.generateWithSunoBrowser = generateWithSunoBrowser;
global.initWarmSunoEngine = initWarmSunoEngine;
global.destroyWarmSunoEngine = destroyWarmSunoEngine;

module.exports = {
  generateWithSunoBrowser,
  initWarmSunoEngine,
  destroyWarmSunoEngine,
  processArrangementInstruction,
  fetchSunoClipsByIds: global.fetchSunoClipsByIds
};
