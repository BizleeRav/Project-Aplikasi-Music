const { BrowserWindow, session } = require('electron');
const axios = require('axios');

// Singleton Pre-Warmed Persistent Suno Engine state
let sunoEngineWin = null;
let engineInitPromise = null;
let isDestroyingEngine = false;
let isGeneratingBusy = false;
let userCancelledCurrentRun = false;
let isChallengeResolved = false;
let networkObserverAttached = false;

const genNetworkState = {
  active: false,
  runStartMs: 0,
  cCheckStartedAt: 0,
  generateStartedAt: 0,
  generateCompletedAt: 0,
  generateStatusCode: 0
};

function getCleanUserAgent() {
  if (typeof global.getCleanNativeUserAgent === 'function') {
    const ua = global.getCleanNativeUserAgent();
    if (ua) return ua;
  }
  try {
    if (session && session.defaultSession) {
      const raw = session.defaultSession.getUserAgent() || '';
      const cleaned = raw
        .replace(/\s*Electron\/[^\s]+/gi, '')
        .replace(/\s*AuraSound\/[^\s]+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (cleaned) return cleaned;
    }
  } catch (e) {}
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome || '134.0.0.0'} Safari/537.36`;
}

function hideEngineWindow() {
  try {
    if (sunoEngineWin && !sunoEngineWin.isDestroyed()) {
      try {
        sunoEngineWin.setShape([]);
      } catch (e) {}
      sunoEngineWin.setAlwaysOnTop(false);
      if (sunoEngineWin.isVisible()) {
        sunoEngineWin.hide();
      }
      sunoEngineWin.setSkipTaskbar(true);
    }
  } catch (e) {}
}

/**
 * Observe Suno generation requests from Electron's main process without touching
 * window.fetch or any renderer JavaScript globals on suno.com!
 */
function attachSessionNetworkObserver(sunoSession) {
  if (networkObserverAttached || !sunoSession) return;
  networkObserverAttached = true;

  sunoSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      if (genNetworkState.active && details.method === 'POST') {
        const u = details.url || '';
        if (u.includes('/api/c/check') || u.includes('/c/check')) {
          if (!genNetworkState.cCheckStartedAt) {
            genNetworkState.cCheckStartedAt = Date.now();
          }
        } else if (/\/api\/generate\b/i.test(u)) {
          isChallengeResolved = true;
          if (!genNetworkState.generateStartedAt) {
            genNetworkState.generateStartedAt = Date.now();
            console.log('[Suno Warm Engine] POST /api/generate detected! Hiding window immediately.');
          }
          // Instant 0ms auto-hide the moment generation request fires!
          hideEngineWindow();
        }
      }
    } catch (e) {}
    callback({ cancel: false });
  });

  sunoSession.webRequest.onCompleted((details) => {
    try {
      if (genNetworkState.active && details.method === 'POST') {
        const u = details.url || '';
        if (/\/api\/generate\b/i.test(u)) {
          genNetworkState.generateCompletedAt = Date.now();
          genNetworkState.generateStatusCode = details.statusCode || 200;
          console.log(`[Suno Warm Engine] POST /api/generate completed (HTTP ${genNetworkState.generateStatusCode}).`);
        }
      }
    } catch (e) {}
  });
}

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

  const hasLyricMarkers = /\[(verse|chorus|intro|bridge|outro|pre-chorus|hook|bait|reff)/i.test(text);
  if (!hasLyricMarkers) {
    if (t.includes('lagu ') || t.includes('tentang ') || t.includes('bertemakan ') || t.includes('gaya musik ') || t.includes('soundtrack') || t.includes('create a ') || t.includes('create an ') || t.includes('buatkan ') || t.includes('buat lagu')) {
      return true;
    }
    if (t.includes('cinematic') && (t.includes('vocals') || t.includes('soundtrack') || t.includes('orchestral') || t.includes('choir'))) {
      return true;
    }
  }

  return false;
}

/**
 * Returns true ONLY when the user explicitly wrote genuine multiline singable lyrics
 * with standalone section headers like [Verse 1], [Chorus], [Bait 1], [Reff].
 */
function isGenuineCustomLyrics(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 25) return false;
  if (isPromptInstruction(trimmed)) return false;
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 4) return false;
  return lines.some(l =>
    /^\[(verse|chorus|pre-chorus|post-chorus|bridge|intro|outro|hook|refrain|bait|reff|pra-reff|interlude|solo|coda)(\s*\d+|\s*[:\-].*)?\]$/i.test(l)
  );
}

/**
 * Intelligent Tags Derivation from Prompt when user left genre/style blank
 */
function deriveTagsFromPrompt(prompt, userTags) {
  if (userTags && userTags.trim().length > 2) return userTags.trim();
  const p = (prompt || '').toLowerCase();
  if (p.includes('epic') || p.includes('choir') || p.includes('orchestr') || p.includes('fantasy') || p.includes('symphon') || p.includes('kingdom')) {
    return 'Epic Fantasy Orchestral Choir, Cinematic Symphony, Female Vocal & Grand Choir, 432Hz Master';
  }
  if (p.includes('synthwave') || p.includes('cyber') || p.includes('retro') || p.includes('80s')) {
    return 'Retro Synthwave, Cyberpunk Arpeggio, 80s Synthesizer, Analog Master';
  }
  if (p.includes('rock') || p.includes('metal')) {
    if (!/\b(no|tanpa|not)\s+rock\b/i.test(prompt)) {
      return 'Emotional Symphonic Rock, Driving Guitars, Dynamic Live Performance';
    }
  }
  if (p.includes('koplo') || p.includes('dangdut')) {
    return 'Dangdut Koplo Modern, Kendang Asik, Upbeat Melodic Vocal';
  }
  if (p.includes('ballad') || p.includes('romantis') || p.includes('piano')) {
    return 'Acoustic Piano Ballad, Warm Melodic Vocal, Emotional Studio Mix';
  }
  if (p.includes('lofi') || p.includes('chill') || p.includes('senja')) {
    return 'Lo-Fi Chill Beats, Relaxing Ambient Melodies, Warm Senja Vinyl';
  }
  if (p.includes('j-pop') || p.includes('anime') || p.includes('japanese')) {
    return 'J-Pop Anime Opening, Uplifting Melody, Bright Piano & Strings';
  }
  if (p.includes('k-pop') || p.includes('kpop') || p.includes('korean')) {
    return 'K-Pop Modern Dance Pop, Layered Harmonies, Punchy Bass';
  }
  return 'Indonesian Pop, Emotional Vocal, 432Hz Studio Mix';
}

/**
 * Read the freshest live __session JWT directly from persist:suno_auth_session cookies
 */
async function readLiveSessionJwt(sunoSession) {
  try {
    const cookies = await sunoSession.cookies.get({});
    const candidates = cookies
      .filter(c => c && (c.name === '__session' || c.name.startsWith('__session')) && c.value && c.value.length > 20)
      .sort((a, b) => (a.name === '__session' ? -1 : b.name === '__session' ? 1 : 0));

    const nowSec = Date.now() / 1000;
    for (const sc of candidates) {
      try {
        const parts = sc.value.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          if (!payload?.exp || payload.exp > (nowSec + 3)) {
            return sc.value;
          }
        }
      } catch (e) {}
    }
    if (candidates[0]?.value) return candidates[0].value;
  } catch (e) {}

  if (typeof global.getFreshSunoToken === 'function') {
    try {
      const tok = await global.getFreshSunoToken();
      if (tok) return tok;
    } catch (e) {}
  }
  try {
    const sunoService = require('./suno-service');
    const cfgTok = sunoService.getConfig()?.suno_api_key;
    if (cfgTok && cfgTok.length > 20) return cfgTok;
  } catch (e) {}
  return null;
}

global.getWarmEngineSessionToken = async () => {
  try {
    if (sunoEngineWin && !sunoEngineWin.isDestroyed()) {
      const curUrl = sunoEngineWin.webContents.getURL() || '';
      if (curUrl.includes('suno.com') && !curUrl.includes('/sign-in') && !curUrl.includes('/login')) {
        const liveTok = await sunoEngineWin.webContents.executeJavaScript(`
          (async () => {
            try {
              if (window.Clerk && window.Clerk.session) {
                const t = await window.Clerk.session.getToken({ skipCache: true });
                if (t && typeof t === 'string' && t.length > 20) return t;
              }
              const m = document.cookie.match(/(?:^|;\\s*)__session=([^;]+)/);
              if (m && m[1]) return m[1];
              return null;
            } catch (e) { return null; }
          })()
        `).catch(() => null);
        if (liveTok && typeof liveTok === 'string' && liveTok.length > 20) {
          return liveTok;
        }
      }
    }
  } catch (e) {}
  return null;
};

/**
 * Fetch Suno clips by IDs directly using Electron authenticated session & in-page same-origin fallback
 */
global.fetchSunoClipsByIds = async (ids) => {
  try {
    const sunoSession = session.fromPartition('persist:suno_auth_session');
    const idArray = Array.isArray(ids) ? ids : (typeof ids === 'string' ? ids.split(',').map(s => s.trim()).filter(Boolean) : []);
    if (idArray.length === 0) return [];

    const token = await readLiveSessionJwt(sunoSession);
    const cleanUa = getCleanUserAgent();

    // 1. Fast same-origin fetch via warm engine if ready (uses live Clerk browser cookies automatically!)
    if (sunoEngineWin && !sunoEngineWin.isDestroyed()) {
      const curUrl = sunoEngineWin.webContents.getURL() || '';
      if (curUrl.includes('suno.com') && !curUrl.includes('/sign-in') && !curUrl.includes('/login')) {
        try {
          const inPageClips = await sunoEngineWin.webContents.executeJavaScript(`
            (async () => {
              try {
                const m = document.cookie.match(/(?:^|;\\s*)__session=([^;]+)/);
                const tok = (m && m[1]) ? m[1] : ${JSON.stringify(token || '')};
                const headers = { 'Accept': 'application/json' };
                if (tok) headers['Authorization'] = 'Bearer ' + tok;
                const r = await fetch('/a/api/feed/v2?ids=' + encodeURIComponent(${JSON.stringify(idArray.join(','))}), {
                  method: 'GET',
                  credentials: 'include',
                  headers
                });
                if (!r.ok) return null;
                const d = await r.json();
                const arr = Array.isArray(d) ? d : (d?.clips || d?.data?.clips || []);
                return Array.isArray(arr) && arr.length > 0 ? arr : null;
              } catch (e) { return null; }
            })()
          `);
          if (Array.isArray(inPageClips) && inPageClips.length > 0) {
            return inPageClips;
          }
        } catch (e) {}
      }
    }

    if (!token) return [];

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Cookie': `__session=${token}`,
      'Content-Type': 'application/json',
      'Origin': 'https://suno.com',
      'Referer': 'https://suno.com/',
      'User-Agent': cleanUa
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
 * Initialize or reuse the Singleton Pre-Warmed Persistent Suno Engine window.
 * Uses Desktop Studio dimensions (1050x680, >= 1024px) so Suno's Create split-pane
 * stays permanently mounted and never collapses into mobile My Workspace view!
 */
async function initWarmSunoEngine({ forceReload = false } = {}) {
  const sunoSession = session.fromPartition('persist:suno_auth_session');
  const cleanUa = getCleanUserAgent();
  sunoSession.setUserAgent(cleanUa);
  attachSessionNetworkObserver(sunoSession);

  if (sunoEngineWin && !sunoEngineWin.isDestroyed() && !forceReload) {
    const currentUrl = sunoEngineWin.webContents.getURL() || '';
    if (currentUrl.includes('suno.com/create') && !currentUrl.includes('/sign-in') && !currentUrl.includes('/login')) {
      const mounted = await sunoEngineWin.webContents.executeJavaScript(`
        Boolean(document.querySelector('textarea') || document.querySelector('button[aria-label="Create song"]'))
      `).catch(() => false);
      if (mounted) {
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
        const mainWin = (typeof global.getMainWindow === 'function') ? global.getMainWindow() : null;
        sunoEngineWin = new BrowserWindow({
          parent: (mainWin && !mainWin.isDestroyed()) ? mainWin : undefined,
          modal: false,
          width: 1050,
          height: 720,
          show: false,
          skipTaskbar: true,
          focusable: true,
          frame: false,
          transparent: true,
          resizable: false,
          title: 'Verifikasi Suno AI',
          autoHideMenuBar: true,
          backgroundColor: '#00000000',
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
        sunoEngineWin.webContents.setUserAgent(cleanUa);

        sunoEngineWin.webContents.on('before-input-event', (event, input) => {
          if (input.key === 'Escape') {
            userCancelledCurrentRun = true;
            hideEngineWindow();
          }
        });

        // Preserve warm engine if user manually closes the verification window
        sunoEngineWin.on('close', (e) => {
          if (!isDestroyingEngine && sunoEngineWin && !sunoEngineWin.isDestroyed()) {
            e.preventDefault();
            if (!isChallengeResolved) {
              userCancelledCurrentRun = true;
            }
            hideEngineWindow();
          }
        });

        sunoEngineWin.on('closed', () => {
          sunoEngineWin = null;
        });
      }

      console.log('[Suno Warm Engine] Pre-warming https://suno.com/create in background...');
      try {
        await sunoEngineWin.loadURL('https://suno.com/create');
      } catch (loadErr) {
        // Clerk 60s cookie refresh on initial load can trigger a harmless redirect/ERR_FAILED (-2)
        console.log('[Suno Warm Engine] Navigation transition:', loadErr?.message || loadErr);
      }

      for (let i = 0; i < 36; i++) {
        const curUrl = sunoEngineWin.webContents.getURL() || '';
        if (curUrl.includes('/sign-in') || curUrl.includes('/login')) {
          break;
        }
        const ready = await sunoEngineWin.webContents.executeJavaScript(`
          Boolean(document.querySelector('textarea') || document.querySelector('button[aria-label="Create song"]'))
        `).catch(() => false);
        if (ready) {
          console.log('[Suno Warm Engine] Standby ready on suno.com/create!');
          break;
        }
        await new Promise(r => setTimeout(r, 350));
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
 * Check if Suno's interactive Turnstile verification modal (div.fixed.inset-0.z-[1000]) is open
 */
async function checkInteractiveTurnstileModal(genWin) {
  if (!genWin || genWin.isDestroyed()) return { hasModal: false, pageError: null };
  try {
    return await genWin.webContents.executeJavaScript(`
      (() => {
        const overlays = Array.from(document.querySelectorAll('div.fixed.inset-0, [role="dialog"]'));
        const modal = overlays.find(el => {
          const cls = String(el.className || '');
          const st = window.getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
          if (el.offsetWidth < 100 || el.offsetHeight < 100) return false;
          if (cls.includes('z-[1000]')) return true;
          return Boolean(el.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"], [data-sitekey]'));
        });

        let pageError = null;
        const alerts = Array.from(document.querySelectorAll('[role="status"], [role="alert"], [data-sonner-toast]'));
        for (const a of alerts) {
          const txt = (a.innerText || a.textContent || '').trim();
          if (/insufficient credits|out of credits|not enough credits|upgrade your plan|daily limit/i.test(txt)) {
            pageError = 'Kuota kredit akun Suno Anda tidak mencukupi untuk membuat lagu.';
            break;
          }
        }

        return {
          hasModal: Boolean(modal),
          pageError
        };
      })()
    `);
  } catch (e) {
    return { hasModal: false, pageError: null };
  }
}

/**
 * Query newly created clips using both same-origin in-page fetch (immune to stale JWT)
 * and direct studio-api fallback with live session cookie.
 */
async function pollNewClips(genWin, sunoSession, existingClipIds, clickTimeMs, cleanUa) {
  let liveJwt = await readLiveSessionJwt(sunoSession);
  if (!liveJwt || liveJwt.length < 20) {
    try {
      const sunoService = require('./suno-service');
      liveJwt = sunoService.getConfig()?.suno_api_key;
    } catch (e) {}
  }

  // 1. Same-origin in-page fetch on suno.com/create (automatically carries live Clerk session)
  if (genWin && !genWin.isDestroyed()) {
    try {
      const pageClips = await genWin.webContents.executeJavaScript(`
        (async () => {
          try {
            const m = document.cookie.match(/(?:^|;\\s*)__session=([^;]+)/);
            const tok = (m && m[1]) ? m[1] : ${JSON.stringify(liveJwt || '')};
            const headers = { 'Content-Type': 'application/json' };
            if (tok) headers['Authorization'] = 'Bearer ' + tok;

            // Try feed/v3 (POST) first
            for (const ep of ['/a/api/feed/v3', '/api/feed/v3']) {
              try {
                const r3 = await fetch(ep, {
                  method: 'POST',
                  credentials: 'include',
                  headers,
                  body: JSON.stringify({ cursor: null, limit: 15 })
                });
                if (r3.ok) {
                  const d3 = await r3.json();
                  if (Array.isArray(d3?.clips) && d3.clips.length > 0) return d3.clips;
                }
              } catch (e3) {}
            }

            // Try feed/v2 (GET)
            for (const ep of ['/a/api/feed/v2', '/api/feed/v2', '/a/api/feed/', '/api/feed/']) {
              try {
                const r2 = await fetch(ep, {
                  method: 'GET',
                  credentials: 'include',
                  headers
                });
                if (r2.ok) {
                  const d2 = await r2.json();
                  if (Array.isArray(d2?.clips) && d2.clips.length > 0) return d2.clips;
                  if (Array.isArray(d2) && d2.length > 0) return d2;
                }
              } catch (e2) {}
            }

            return null;
          } catch (e) {
            return null;
          }
        })()
      `);
      if (Array.isArray(pageClips) && pageClips.length > 0) {
        const fresh = pageClips.filter(c => {
          if (!c || !c.id || existingClipIds.has(c.id)) return false;
          if (c.created_at) {
            const t = new Date(c.created_at).getTime();
            if (Number.isFinite(t) && t < (clickTimeMs - 15 * 60 * 1000)) return false;
          }
          return true;
        });
        if (fresh.length > 0) return { clips: fresh, jwt: liveJwt };
      }
    } catch (e) {}
  }

  // 2. Direct HTTP fallback via studio-api
  if (liveJwt && liveJwt.length > 20) {
    try {
      const feedRes = await axios.post('https://studio-api.prod.suno.com/api/feed/v3', {
        cursor: null,
        limit: 15
      }, {
        headers: {
          'Authorization': `Bearer ${liveJwt}`,
          'Cookie': `__session=${liveJwt}`,
          'Content-Type': 'application/json',
          'Origin': 'https://suno.com',
          'Referer': 'https://suno.com/',
          'User-Agent': cleanUa
        },
        timeout: 4500
      });
      const feedClips = feedRes.data?.clips || [];
      const fresh = feedClips.filter(c => {
        if (!c || !c.id || existingClipIds.has(c.id)) return false;
        if (c.created_at) {
          const t = new Date(c.created_at).getTime();
          if (Number.isFinite(t) && t < (clickTimeMs - 15 * 60 * 1000)) return false;
        }
        return true;
      });
      if (fresh.length > 0) return { clips: fresh, jwt: liveJwt };
    } catch (e) {
      try {
        const feedRes2 = await axios.get('https://studio-api.prod.suno.com/api/feed/v2', {
          headers: {
            'Authorization': `Bearer ${liveJwt}`,
            'Cookie': `__session=${liveJwt}`,
            'User-Agent': cleanUa
          },
          timeout: 4500
        });
        const feedClips2 = feedRes2.data?.clips || (Array.isArray(feedRes2.data) ? feedRes2.data : []);
        const fresh2 = feedClips2.filter(c => {
          if (!c || !c.id || existingClipIds.has(c.id)) return false;
          if (c.created_at) {
            const t = new Date(c.created_at).getTime();
            if (Number.isFinite(t) && t < (clickTimeMs - 15 * 60 * 1000)) return false;
          }
          return true;
        });
        if (fresh2.length > 0) return { clips: fresh2, jwt: liveJwt };
      } catch (e2) {}
    }
  }

  return { clips: null, jwt: liveJwt };
}

/**
 * Executes authentic song generation inside Electron's Pre-Warmed Suno session.
 * - Default: Suno Simple Mode (verbatim prompt up to 2,950 chars -> Suno writes Title, Tags & Lyrics!)
 * - Custom Lyrics: Suno Advanced Mode ONLY when genuine [Verse]/[Chorus] lyrics are provided.
 * - Silent Background First: Never pops up prematurely; only surfaces cleanly if Turnstile modal blocks,
 *   and auto-hides in <250ms the instant verification completes.
 */
async function generateWithSunoBrowser({
  prompt,
  lyrics,
  tags,
  title,
  make_instrumental,
  model,
  rawPrompt,
  rawLyrics,
  rawTags,
  rawTitle,
  hasCustomLyrics
}) {
  if (isGeneratingBusy) {
    throw new Error('Pembuatan lagu sedang diproses. Mohon tunggu beberapa detik.');
  }
  isGeneratingBusy = true;
  userCancelledCurrentRun = false;

  const sunoSession = session.fromPartition('persist:suno_auth_session');
  const cleanUa = getCleanUserAgent();
  const existingClipIds = new Set();

  genNetworkState.active = false;
  genNetworkState.runStartMs = 0;
  genNetworkState.cCheckStartedAt = 0;
  genNetworkState.generateStartedAt = 0;
  genNetworkState.generateCompletedAt = 0;
  genNetworkState.generateStatusCode = 0;

  try {
    let genWin = await initWarmSunoEngine();
    let currentUrl = genWin.webContents.getURL() || '';

    if (currentUrl.includes('/sign-in') || currentUrl.includes('/login') || !currentUrl.includes('suno.com/create')) {
      genWin = await initWarmSunoEngine({ forceReload: true });
      currentUrl = genWin.webContents.getURL() || '';
    }

    if (currentUrl.includes('/sign-in') || currentUrl.includes('/login')) {
      throw new Error('Akun Suno Anda belum login di aplikasi atau sesi telah berakhir. Silakan klik tombol "Hubungkan Akun Suno" di AuraSound dan login kembali.');
    }

    // Ensure React Studio Create workspace is mounted
    let pageReady = false;
    for (let i = 0; i < 20; i++) {
      pageReady = await genWin.webContents.executeJavaScript(`
        Boolean(document.querySelector('textarea') || document.querySelector('button[aria-label="Create song"]'))
      `).catch(() => false);
      if (pageReady) break;
      await new Promise(r => setTimeout(r, 300));
    }

    if (!pageReady) {
      genWin = await initWarmSunoEngine({ forceReload: true });
      pageReady = await genWin.webContents.executeJavaScript(`
        Boolean(document.querySelector('textarea') || document.querySelector('button[aria-label="Create song"]'))
      `).catch(() => false);
      if (!pageReady) {
        throw new Error('Halaman Suno tidak merespons. Pastikan perangkat terhubung ke internet.');
      }
    }

    // Dismiss any leftover modal overlay from a previous cancelled attempt
    await genWin.webContents.executeJavaScript(`
      (() => {
        const oldModal = Array.from(document.querySelectorAll('div.fixed.inset-0')).find(el => String(el.className || '').includes('z-[1000]'));
        if (oldModal) {
          oldModal.click();
        }
      })()
    `).catch(() => {});

    // Snapshot existing clip IDs IN PARALLEL while filling the form
    const existingClipsPromise = (async () => {
      try {
        const snap = await pollNewClips(genWin, sunoSession, new Set(), 0, cleanUa);
        if (Array.isArray(snap.clips)) {
          snap.clips.forEach(c => { if (c && c.id) existingClipIds.add(c.id); });
        }
      } catch (e) {}
      const tok = await readLiveSessionJwt(sunoSession);
      if (tok && existingClipIds.size === 0) {
        try {
          const res = await axios.post('https://studio-api.prod.suno.com/api/feed/v3', { cursor: null, limit: 30 }, {
            headers: {
              'Authorization': `Bearer ${tok}`,
              'Cookie': `__session=${tok}`,
              'Content-Type': 'application/json',
              'Origin': 'https://suno.com',
              'Referer': 'https://suno.com/',
              'User-Agent': cleanUa
            },
            timeout: 4500
          });
          (res.data?.clips || []).forEach(c => { if (c && c.id) existingClipIds.add(c.id); });
        } catch (e) {}
      }
    })();

    // Cleanly resolve clean user inputs without fake tags/titles
    const cleanPromptText = (rawPrompt !== undefined ? rawPrompt : (prompt || '')).trim();
    const cleanLyricsText = (rawLyrics !== undefined ? rawLyrics : (lyrics || '')).trim();
    const cleanTagsText = (rawTags !== undefined ? rawTags : (tags || '')).trim();
    const cleanTitleText = (rawTitle !== undefined ? rawTitle : (title || '')).trim();
    const wantInstrumental = Boolean(make_instrumental);

    const useCustomLyricsMode = typeof hasCustomLyrics === 'boolean'
      ? (hasCustomLyrics && !wantInstrumental)
      : (!wantInstrumental && (
          (cleanLyricsText.length > 0 && !isPromptInstruction(cleanLyricsText)) ||
          (cleanLyricsText.length === 0 && isGenuineCustomLyrics(cleanPromptText))
        ));

    const targetMode = useCustomLyricsMode ? 'custom_lyrics' : 'simple';
    console.log(`[Suno Warm Engine] Filling Suno Create form (mode: ${targetMode}, promptLen: ${cleanPromptText.length})...`);

    // Reset previous inputs & remove any old drafts from Suno storage so genres/styles never leak
    await genWin.webContents.executeJavaScript(`
      (() => {
        try {
          localStorage.removeItem('create_draft');
          sessionStorage.removeItem('create_draft');
        } catch (e) {}

        const allTextareas = Array.from(document.querySelectorAll('textarea'));
        for (const ta of allTextareas) {
          try {
            ta.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            const proto = window.HTMLTextAreaElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) setter.call(ta, '');
            else ta.value = '';
            ta.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          } catch (e) {}
        }

        const allInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
        for (const inp of allInputs) {
          try {
            if ((inp.placeholder || '').toLowerCase().includes('search')) continue;
            inp.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            const proto = window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) setter.call(inp, '');
            else inp.value = '';
            inp.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          } catch (e) {}
        }

        const lyricsEditors = Array.from(document.querySelectorAll('div[aria-label="Lyrics editor"], .lyrics-editor-content, div[role="textbox"][contenteditable="true"]'));
        for (const ed of lyricsEditors) {
          try {
            ed.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
          } catch (e) {}
        }
      })()
    `).catch(() => {});

    if (targetMode === 'simple') {
      const simpleParts = [];
      if (cleanTitleText) {
        simpleParts.push(`Title: ${cleanTitleText}`);
      }
      if (wantInstrumental) {
        simpleParts.push('Instrumental only, no vocals.');
      }
      if (cleanPromptText) {
        simpleParts.push(cleanPromptText);
      }
      if (cleanTagsText) {
        simpleParts.push(`Style: ${cleanTagsText}`);
      } else {
        const pLower = cleanPromptText.toLowerCase();
        if (pLower.includes('fantasy') || pLower.includes('kerajaan') || (pLower.includes('adventure') && !pLower.includes('folk'))) {
          simpleParts.push('Style: Epic Fantasy Orchestral, Cinematic Symphony, Piano & Strings, No Folk');
        }
      }
      const simpleDescription = simpleParts.join('\n').slice(0, 2950);

      const filledSimple = await genWin.webContents.executeJavaScript(`
        (async () => {
          function setNativeValue(el, val) {
            if (!el) return false;
            el.focus();
            try {
              document.execCommand('selectAll', false, null);
              document.execCommand('delete', false, null);
            } catch (e) {}
            const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) setter.call(el, val);
            else el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            return el.value === val;
          }

          const tabs = Array.from(document.querySelectorAll('[role="tab"], button, div[role="button"]'));
          const simpleTab = tabs.find(b => (b.innerText || b.textContent || '').trim().toLowerCase() === 'simple');
          if (simpleTab && simpleTab.getAttribute('aria-selected') !== 'true') {
            simpleTab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
            simpleTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            simpleTab.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
            simpleTab.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            simpleTab.click();
            await new Promise(r => setTimeout(r, 300));
          }

          const tas = Array.from(document.querySelectorAll('textarea')).filter(t => {
            const al = (t.getAttribute('aria-label') || '').toLowerCase();
            return !al.includes('cowriter') && !al.includes('sound') && !al.includes('script') && !al.includes('tone') && al !== 'styles';
          });
          const promptBox = tas[0] || document.querySelector('textarea');
          if (!promptBox) return { ok: false };

          setNativeValue(promptBox, ${JSON.stringify(simpleDescription)});
          return { ok: promptBox.value.trim().length > 0, len: promptBox.value.length };
        })()
      `);

      if (!filledSimple || !filledSimple.ok) {
        await genWin.webContents.executeJavaScript(`
          (() => {
            const ta = document.querySelector('textarea');
            if (ta) {
              ta.focus();
              ta.select();
            }
          })()
        `).catch(() => {});
        await genWin.webContents.insertText(simpleDescription);
      }
    } else {
      const lyricsToInsert = cleanLyricsText || cleanPromptText;
      const effectiveTags = cleanTagsText || deriveTagsFromPrompt(cleanPromptText || cleanLyricsText, '');
      const styleToInsert = effectiveTags.slice(0, 950);

      await genWin.webContents.executeJavaScript(`
        (async () => {
          function setNativeValue(el, val) {
            if (!el) return;
            el.focus();
            try {
              document.execCommand('selectAll', false, null);
              document.execCommand('delete', false, null);
            } catch (e) {}
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
            await new Promise(r => setTimeout(r, 300));
          }

          const styleBox = document.querySelector('textarea[aria-label="Styles"]') ||
            Array.from(document.querySelectorAll('textarea')).find(t => {
              const al = (t.getAttribute('aria-label') || '').toLowerCase();
              const ph = (t.placeholder || '').toLowerCase();
              return al === 'styles' || ph.includes('style') || ph.includes('genre');
            });
          if (styleBox) {
            setNativeValue(styleBox, ${JSON.stringify(styleToInsert)});
          }

          const titleInput = document.querySelector('input[placeholder*="Song Title" i], input[placeholder*="Title" i], input[aria-label*="Title" i]');
          if (titleInput) {
            setNativeValue(titleInput, ${JSON.stringify(cleanTitleText)});
          }

          const lyricsBox = document.querySelector('div[aria-label="Lyrics editor"], .lyrics-editor-content, div[role="textbox"][contenteditable="true"]');
          if (lyricsBox) {
            lyricsBox.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
          }
        })()
      `);

      if (lyricsToInsert) {
        await genWin.webContents.insertText(lyricsToInsert);
        await new Promise(r => setTimeout(r, 180));
      }
    }

    // If an Instrumental toggle switch exists in the current tab, sync its state
    await genWin.webContents.executeJavaScript(`
      (() => {
        const instrBtn = Array.from(document.querySelectorAll('[role="switch"], input[type="checkbox"]')).find(b => {
          const txt = (b.innerText || b.getAttribute('aria-label') || b.name || '').toLowerCase();
          return txt.includes('instrumental');
        });
        if (instrBtn) {
          const isChecked = instrBtn.getAttribute('aria-checked') === 'true' || instrBtn.checked === true || instrBtn.getAttribute('data-state') === 'checked';
          if (isChecked !== ${JSON.stringify(wantInstrumental)}) {
            instrBtn.click();
          }
        }
      })()
    `).catch(() => {});

    // Wait for existingClipIds snapshot & React input state commit
    await Promise.all([
      existingClipsPromise,
      new Promise(r => setTimeout(r, 300))
    ]);

    // Locate Create button coordinates for trusted click activation
    const locateCreateBtn = () => genWin.webContents.executeJavaScript(`
      (() => {
        let createBtn = document.querySelector('button[aria-label="Create song"]');
        if (!createBtn) {
          const allBtns = Array.from(document.querySelectorAll('button')).filter(b => !b.closest('nav') && !b.closest('aside'));
          createBtn = allBtns.find(b => {
            const t = (b.innerText || b.textContent || '').trim().toLowerCase();
            return t === 'create' || t.startsWith('create (') || t.startsWith('create ');
          });
        }
        if (!createBtn) return { error: 'Tombol Create tidak ditemukan di halaman Suno.' };
        createBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
        const rect = createBtn.getBoundingClientRect();
        return {
          disabled: Boolean(createBtn.disabled),
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          text: (createBtn.innerText || createBtn.textContent || '').trim()
        };
      })()
    `);

    let btnInfo = await locateCreateBtn();
    if (btnInfo && btnInfo.disabled) {
      await new Promise(r => setTimeout(r, 550));
      btnInfo = await locateCreateBtn();
    }

    if (!btnInfo || btnInfo.error) {
      throw new Error(btnInfo?.error || 'Tombol Create tidak ditemukan di Suno.');
    }
    if (btnInfo.disabled) {
      throw new Error('Tombol Create Suno saat ini nonaktif (pastikan kuota kredit akun Suno masih tersedia).');
    }

    const clickTimeMs = Date.now();
    genNetworkState.runStartMs = clickTimeMs;
    genNetworkState.cCheckStartedAt = 0;
    genNetworkState.generateStartedAt = 0;
    genNetworkState.generateCompletedAt = 0;
    genNetworkState.generateStatusCode = 0;
    genNetworkState.active = true;

    // Trigger Create click directly via DOM event chain (100% background compatible)
    const clickedOk = await genWin.webContents.executeJavaScript(`
      (() => {
        const createBtn = document.querySelector('button[aria-label="Create song"]') ||
          Array.from(document.querySelectorAll('button')).find(b => {
            const t = (b.innerText || b.textContent || '').trim().toLowerCase();
            return !b.closest('nav') && !b.closest('aside') && (t === 'create' || t.startsWith('create ') || t.startsWith('create('));
          });
        if (!createBtn) return { error: 'Tombol Create tidak ditemukan.' };
        if (createBtn.disabled) return { error: 'Tombol Create saat ini nonaktif (cek kuota kredit Suno Anda).' };
        createBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
        createBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        createBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        createBtn.click();
        return { ok: true };
      })()
    `);

    if (clickedOk && clickedOk.error) {
      throw new Error(clickedOk.error);
    }

    console.log('[Suno Warm Engine] Create triggered in background. Polling for newly created clips...');

    let capturedClips = null;
    let lastJwt = null;
    let lastFeedPollMs = 0;
    let lastChallengeCheckMs = 0;
    let challengeWindowShown = false;
    isChallengeResolved = false;
    const maxTotalWaitMs = 120000;

    while ((Date.now() - clickTimeMs) < maxTotalWaitMs) {
      await new Promise(r => setTimeout(r, 200));

      if (userCancelledCurrentRun) {
        throw new Error('Pembuatan lagu Suno dibatalkan.');
      }

      if (genNetworkState.generateStatusCode === 402) {
        throw new Error('Kuota kredit akun Suno Anda untuk hari ini telah habis.');
      }
      if (genNetworkState.generateStatusCode === 401 || genNetworkState.generateStatusCode === 403) {
        throw new Error('Sesi akun Suno kedaluwarsa atau ditolak. Silakan klik Ganti / Kelola Akun untuk login ulang.');
      }
      if (genNetworkState.generateStatusCode >= 429 && genNetworkState.generateStatusCode < 500) {
        throw new Error('Terlalu banyak permintaan ke Suno dalam waktu singkat. Coba lagi beberapa detik.');
      }

      const elapsedMs = Date.now() - clickTimeMs;

      // Check if Cloudflare Turnstile verification challenge modal is blocking
      const nowMs = Date.now();
      if ((nowMs - lastChallengeCheckMs) >= 400 && !genNetworkState.generateStartedAt) {
        lastChallengeCheckMs = nowMs;

        // 1. Check if the user has solved the Turnstile verification
        const turnstileStatus = await genWin.webContents.executeJavaScript(`
          (() => {
            const tokenInput = document.querySelector('[name*="cf-turnstile-response"], [name="turnstile_token"]');
            if (tokenInput && tokenInput.value && tokenInput.value.length > 20) {
              return { solved: true, token: tokenInput.value };
            }
            return { solved: false };
          })()
        `).catch(() => ({ solved: false }));

        if (turnstileStatus && turnstileStatus.solved && !isChallengeResolved) {
          isChallengeResolved = true;
          console.log('[Suno Warm Engine] Turnstile verified successfully by user! Auto-hiding window & submitting song...');
          hideEngineWindow();

          // Reset clickTimeMs so the timeout countdown starts fresh from submission
          clickTimeMs = Date.now();
          lastFeedPollMs = 0;

          // Auto-submit Create with verified token so song is generated immediately
          await genWin.webContents.executeJavaScript(`
            (() => {
              const createBtn = document.querySelector('button[aria-label="Create song"]') ||
                Array.from(document.querySelectorAll('button')).find(b => {
                  const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                  return !b.closest('nav') && !b.closest('aside') && (t === 'create' || t.startsWith('create ') || t.startsWith('create('));
                });
              if (createBtn && !createBtn.disabled) {
                createBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
                createBtn.click();
              }
            })()
          `).catch(() => {});
        }

        // 2. Detect visible Cloudflare Turnstile card to display ONLY the small verification box
        if (!challengeWindowShown && !isChallengeResolved) {
          const turnstileBox = await genWin.webContents.executeJavaScript(`
            (() => {
              const iframes = Array.from(document.querySelectorAll('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]'));
              const activeIframe = iframes.find(f => {
                const st = window.getComputedStyle(f);
                if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
                const r = f.getBoundingClientRect();
                return r.width >= 40 && r.height >= 20;
              });

              if (!activeIframe) {
                return null;
              }

              // Determine the card element wrapping the challenge
              let targetEl = activeIframe;
              let p = activeIframe.parentElement;
              while (p && p !== document.body && p !== document.documentElement) {
                const pr = p.getBoundingClientRect();
                if (pr.width >= 240 && pr.width <= 480 && pr.height >= 60 && pr.height <= 320) {
                  targetEl = p;
                }
                if (pr.width > 480 || pr.height > 320) {
                  break;
                }
                p = p.parentElement;
              }

              const r = targetEl.getBoundingClientRect();
              if (r.width < 40 || r.height < 20 || r.width > 520 || r.height > 360) return null;

              return {
                found: true,
                x: Math.max(0, Math.floor(r.x)),
                y: Math.max(0, Math.floor(r.y)),
                width: Math.min(480, Math.ceil(r.width)),
                height: Math.min(320, Math.ceil(r.height))
              };
            })()
          `).catch(() => null);

          if (turnstileBox && turnstileBox.found && !genNetworkState.generateStartedAt) {
            challengeWindowShown = true;
            console.log(`[Suno Warm Engine] Cloudflare Turnstile card detected at (${turnstileBox.x}, ${turnstileBox.y}, ${turnstileBox.width}x${turnstileBox.height})! Clipping window to verify box only...`);

            try {
              genWin.setShape([{
                x: turnstileBox.x,
                y: turnstileBox.y,
                width: turnstileBox.width,
                height: turnstileBox.height
              }]);
            } catch (shapeErr) {
              console.warn('[Suno Warm Engine] setShape fallback:', shapeErr.message);
            }

            genWin.setAlwaysOnTop(true, 'screen-saver');
            genWin.center();
            genWin.show();
            genWin.focus();
          }
        } else if (challengeWindowShown && !isChallengeResolved && genWin.isVisible()) {
          // If modal was dismissed or verified and gone from DOM
          const stillOpen = await genWin.webContents.executeJavaScript(`
            (() => {
              const iframes = Array.from(document.querySelectorAll('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]'));
              return iframes.some(f => {
                const st = window.getComputedStyle(f);
                return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0;
              });
            })()
          `).catch(() => false);

          if (!stillOpen) {
            console.log('[Suno Warm Engine] Turnstile challenge completed or dismissed. Auto-hiding window & submitting song...');
            isChallengeResolved = true;
            hideEngineWindow();

            // Reset clickTimeMs so the timeout countdown starts fresh from submission
            clickTimeMs = Date.now();
            lastFeedPollMs = 0;

            // Re-trigger Create click in case modal auto-closed upon success
            await genWin.webContents.executeJavaScript(`
              (() => {
                const createBtn = document.querySelector('button[aria-label="Create song"]') ||
                  Array.from(document.querySelectorAll('button')).find(b => {
                    const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                    return !b.closest('nav') && !b.closest('aside') && (t === 'create' || t.startsWith('create ') || t.startsWith('create('));
                  });
                if (createBtn && !createBtn.disabled) {
                  createBtn.click();
                }
              })()
            `).catch(() => {});
          }
        }
      }

      // Poll feed every 1.2s starting right after click
      if ((Date.now() - lastFeedPollMs) >= 1200) {
        lastFeedPollMs = Date.now();
        const pollRes = await pollNewClips(genWin, sunoSession, existingClipIds, clickTimeMs, cleanUa);
        if (pollRes.jwt) lastJwt = pollRes.jwt;
        if (Array.isArray(pollRes.clips) && pollRes.clips.length > 0) {
          if (pollRes.clips.length >= 2 || elapsedMs > 3500) {
            capturedClips = pollRes.clips;
            console.log(`[Suno Warm Engine] Captured ${capturedClips.length} authentic new Suno clips silently!`);
            break;
          }
        }
      }

      // Check for explicit error banners on the page
      if (elapsedMs % 1500 < 250) {
        const pageError = await genWin.webContents.executeJavaScript(`
          (() => {
            const alerts = Array.from(document.querySelectorAll('[role="status"], [role="alert"], [data-sonner-toast]'));
            for (const a of alerts) {
              const txt = (a.innerText || a.textContent || '').trim();
              if (/insufficient credits|out of credits|not enough credits|upgrade your plan|daily limit/i.test(txt)) {
                return 'Kuota kredit akun Suno Anda tidak mencukupi untuk membuat lagu.';
              }
            }
            return null;
          })()
        `).catch(() => null);
        if (pageError) throw new Error(pageError);
      }
    }

    if (!capturedClips || capturedClips.length === 0) {
      console.log('[Suno Warm Engine] Loop finished without clips. Performing safety check on recent feed for new creations...');
      try {
        const finalSnap = await pollNewClips(genWin, sunoSession, new Set(), Date.now(), cleanUa);
        if (Array.isArray(finalSnap.clips) && finalSnap.clips.length > 0) {
          const fifteenMinAgo = Date.now() - (15 * 60 * 1000);
          const recovered = finalSnap.clips.filter(c => {
            if (!c || !c.id || existingClipIds.has(c.id)) return false;
            const t = c.created_at ? new Date(c.created_at).getTime() : 0;
            return t >= fifteenMinAgo;
          });
          if (recovered.length > 0) {
            capturedClips = recovered;
            console.log(`[Suno Warm Engine] Final check successfully recovered ${capturedClips.length} clips!`);
          }
        }
      } catch (e) {}
    }

    if (!capturedClips || capturedClips.length === 0) {
      throw new Error('Suno belum mengembalikan lagu baru. Pastikan akun Suno Anda masih memiliki kuota kredit yang mencukupi.');
    }

    // Persist refreshed token to AuraSound config
    const finalJwt = lastJwt || await readLiveSessionJwt(sunoSession);
    if (finalJwt && finalJwt.length > 20) {
      try {
        const sunoService = require('./suno-service');
        sunoService.saveConfig({ suno_api_key: finalJwt, suno_provider: 'suno_official' });
      } catch (e) {}
    }

    return {
      success: true,
      clips: capturedClips,
      targetMode
    };
  } finally {
    genNetworkState.active = false;
    isGeneratingBusy = false;
    hideEngineWindow();
  }
}

global.generateWithSunoBrowser = generateWithSunoBrowser;
global.initWarmSunoEngine = initWarmSunoEngine;
global.destroyWarmSunoEngine = destroyWarmSunoEngine;

module.exports = {
  generateWithSunoBrowser,
  initWarmSunoEngine,
  destroyWarmSunoEngine,
  isPromptInstruction,
  isGenuineCustomLyrics,
  fetchSunoClipsByIds: global.fetchSunoClipsByIds
};
