const { BrowserWindow, session } = require('electron');
const axios = require('axios');

const CHROME_DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

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

    try {
      const feedRes = await axios.post('https://suno.com/a/api/feed/v3', {
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

    return [];
  } catch (err) {
    console.warn('[fetchSunoClipsByIds] Error:', err.message);
    return [];
  }
};

/**
 * Executes authentic song generation inside Electron's authenticated Suno session.
 * Handles Simple, Custom Lyrics, and Arrangement modes accurately on suno.com/create.
 */
async function generateWithSunoBrowser({ prompt, lyrics, tags, title, make_instrumental, model, isArrangementInstruction, rawPrompt, rawLyrics }) {
  console.log('[Suno Generator] Initializing authentic in-app generation on suno.com...');
  const sunoSession = session.fromPartition('persist:suno_auth_session');

  // Silent in-background window: no window popups on user's screen during generation!
  // backgroundThrottling: false ensures Chromium executes timers and DOM without freezing.
  const genWin = new BrowserWindow({
    width: 600,
    height: 740,
    show: false,
    skipTaskbar: true,
    title: 'Suno AI Studio Engine',
    autoHideMenuBar: true,
    webPreferences: {
      session: sunoSession,
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  genWin.webContents.setUserAgent(CHROME_DESKTOP_UA);

  let capturedAuth = null;
  let capturedClips = null;
  let serverErrorMessage = null;
  let challengeShown = false;
  const existingClipIds = new Set();

  // Pre-seed capturedAuth with existing token if valid
  try {
    const sunoService = require('./suno-service');
    const existingKey = (sunoService.getConfig().suno_api_key || '').trim();
    if (existingKey.length > 20 && existingKey.startsWith('eyJ')) {
      capturedAuth = `Bearer ${existingKey}`;
    }
  } catch (e) {}

  try {
    // 1. Silent web navigation to https://suno.com/create without invasive CDP debuggers
    console.log('[Suno Generator] Loading https://suno.com/create silently in background...');
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

    // Pre-record existing clip IDs to strictly avoid false positive captures
    try {
      const initClips = await genWin.webContents.executeJavaScript(`
        (async () => {
          try {
            const res = await fetch('https://suno.com/a/api/feed/v3', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cursor: null, limit: 30 })
            });
            const d = await res.json();
            return (d.clips || []).map(c => c.id);
          } catch (e) {
            return [];
          }
        })()
      `).catch(() => []);
      if (Array.isArray(initClips)) {
        initClips.forEach(id => existingClipIds.add(id));
        console.log(`[Suno Generator] Recorded ${existingClipIds.size} existing clips in Suno account before generation.`);
      }
    } catch (e) {}

    // Determine generation mode:
    // 1. Simple Mode: Short prompt < 450 chars, no explicit lyrics, not arrangement instruction
    // 2. Custom Lyrics Mode: Singable lyrics provided
    // 3. Arrangement Mode: > 450 chars or musical/vocal arrangement instructions
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

    console.log(`[Suno Generator] Selected input mode: ${targetMode}`);

    if (targetMode === 'simple') {
      // MODE 1: SIMPLE MODE
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

          // Switch to Simple tab
          const btns = Array.from(document.querySelectorAll('button, [role="tab"], div[role="button"]'));
          const simpleBtn = btns.find(b => (b.innerText || '').trim().toLowerCase() === 'simple');
          if (simpleBtn) {
            simpleBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            simpleBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            simpleBtn.click();
            await new Promise(r => setTimeout(r, 600));
          }

          const tas = Array.from(document.querySelectorAll('textarea'));
          if (tas[0]) {
            setNativeValue(tas[0], ${JSON.stringify(simplePrompt)});
          }
        })()
      `);
    } else if (targetMode === 'custom_lyrics') {
      // MODE 2: CUSTOM LYRICS MODE
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

          // Switch to Advanced / Custom tab
          const btns = Array.from(document.querySelectorAll('button, [role="tab"], div[role="button"]'));
          const advBtn = btns.find(b => {
            const txt = (b.innerText || '').trim().toLowerCase();
            return txt === 'advanced' || txt === 'custom';
          });
          if (advBtn) {
            advBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            advBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            advBtn.click();
            await new Promise(r => setTimeout(r, 600));
          }

          // Clean lyrics editor content
          const lyricsBox = document.querySelector('.lyrics-editor-content, div[aria-label="Lyrics editor"], div[contenteditable="true"]');
          if (lyricsBox) {
            lyricsBox.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
          }

          // Set Style
          const tas = Array.from(document.querySelectorAll('textarea'));
          const styleBox = tas.find(t => {
            const ph = (t.placeholder || '').toLowerCase();
            return ph.includes('style') || ph.includes('battle rap') || ph.includes('electro dance') || ph.includes('darkwave') || ph.includes('genre');
          }) || tas[1] || tas[0];
          if (styleBox && ${JSON.stringify(tags || promptInput)}) {
            setNativeValue(styleBox, ${JSON.stringify((tags || promptInput).slice(0, 950))});
          }

          // Set Title
          const inputs = Array.from(document.querySelectorAll('input'));
          const titleInput = inputs.find(i => {
            const ph = (i.placeholder || i.getAttribute('aria-label') || '').toLowerCase();
            return ph.includes('title') || ph.includes('judul');
          });
          if (titleInput && ${JSON.stringify(title)}) {
            setNativeValue(titleInput, ${JSON.stringify(title)});
          }
        })()
      `);

      // Insert actual singable lyrics via Chromium native input
      if (lyricsInput) {
        await genWin.webContents.insertText(lyricsInput);
        await new Promise(r => setTimeout(r, 500));
      }
    } else {
      // MODE 3: LONG ARRANGEMENT PROMPT (>450 chars or vocal arrangement instructions)
      const { style: arrangementStyle, lyrics: arrangementLyrics } = processArrangementInstruction(promptInput, tags, title);
      console.log(`[Suno Generator] Mode 3 Style parsed (${arrangementStyle.length} chars), Lyrics structure created (${arrangementLyrics.length} chars)`);

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

          // Switch to Advanced / Custom tab
          const btns = Array.from(document.querySelectorAll('button, [role="tab"], div[role="button"]'));
          const advBtn = btns.find(b => {
            const txt = (b.innerText || '').trim().toLowerCase();
            return txt === 'advanced' || txt === 'custom';
          });
          if (advBtn) {
            advBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            advBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            advBtn.click();
            await new Promise(r => setTimeout(r, 600));
          }

          // Clean lyrics editor content
          const lyricsBox = document.querySelector('.lyrics-editor-content, div[aria-label="Lyrics editor"], div[contenteditable="true"]');
          if (lyricsBox) {
            lyricsBox.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
          }

          // Set Style (instrumentation, tempo, mood, genre up to 950 chars)
          const tas = Array.from(document.querySelectorAll('textarea'));
          const styleBox = tas.find(t => {
            const ph = (t.placeholder || '').toLowerCase();
            return ph.includes('style') || ph.includes('battle rap') || ph.includes('electro dance') || ph.includes('darkwave') || ph.includes('genre');
          }) || tas[1] || tas[0];
          if (styleBox && ${JSON.stringify(arrangementStyle)}) {
            setNativeValue(styleBox, ${JSON.stringify(arrangementStyle)});
          }

          // Set Title
          const inputs = Array.from(document.querySelectorAll('input'));
          const titleInput = inputs.find(i => {
            const ph = (i.placeholder || i.getAttribute('aria-label') || '').toLowerCase();
            return ph.includes('title') || ph.includes('judul');
          });
          if (titleInput && ${JSON.stringify(title)}) {
            setNativeValue(titleInput, ${JSON.stringify(title)});
          }
        })()
      `);

      // Insert clean structural vocal meta-tags
      if (arrangementLyrics) {
        await genWin.webContents.insertText(arrangementLyrics);
        await new Promise(r => setTimeout(r, 500));
      }
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

      // Dynamically extract fresh token from in-page Clerk session if needed
      if (!capturedAuth) {
        try {
          const freshJwt = await genWin.webContents.executeJavaScript(`
            (async () => {
              try {
                if (window.Clerk && window.Clerk.session) return await window.Clerk.session.getToken();
                const m = document.cookie.match(/__session=([^;]+)/);
                return m ? m[1] : null;
              } catch(e) { return null; }
            })()
          `);
          if (freshJwt && freshJwt.length > 20) {
            capturedAuth = `Bearer ${freshJwt}`;
          }
        } catch (e) {}
      }

      // Check if Cloudflare Turnstile interactive challenge requires user tap
      try {
        const turnstileActive = await genWin.webContents.executeJavaScript(`
          (() => {
            const ifr = document.querySelector('iframe[src*="cloudflare"], iframe[src*="turnstile"]');
            if (!ifr) return false;
            const rect = ifr.getBoundingClientRect();
            return rect.width > 20 && rect.height > 20;
          })()
        `);
        if (turnstileActive && !challengeShown) {
          challengeShown = true;
          console.log('[Suno Generator] Interactive challenge detected, temporarily showing verification window...');
          genWin.show();
          genWin.focus();
        }
      } catch (e) {}

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
                  body: JSON.stringify({ cursor: null, limit: 15 })
                });
                const d = await res.json();
                return { clips: d.clips || [], ok: res.ok };
              } catch (e) {
                return { error: e.message };
              }
            })()
          `);

          if (pageFeed && Array.isArray(pageFeed.clips) && pageFeed.clips.length > 0) {
            const newClips = pageFeed.clips.filter(c => !existingClipIds.has(c.id));
            if (newClips.length > 0) {
              capturedClips = newClips;
              console.log(`[Suno Generator] Successfully retrieved ${newClips.length} NEW clips from Suno feed!`);
              if (challengeShown) genWin.hide();
              break;
            }
          }
        } catch (e) {}
      }
    }

    if (!capturedClips || capturedClips.length === 0) {
      throw new Error('Suno sedang memproses pembuatan lagu di antrean. Silakan coba klik Generate kembali.');
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
      targetMode
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
  generateWithSunoBrowser,
  fetchSunoClipsByIds: global.fetchSunoClipsByIds
};
