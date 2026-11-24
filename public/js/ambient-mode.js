/**
 * AuraSound Ambient Stage Engine (Desktop / Laptop Only)
 * Weyv-inspired borderless audio-reactive visualizers, bottom-left vinyl song wheel
 * (Now Playing + Up Next), 5 kinetic lyric animation styles (Stack, Rise, Pop, Karaoke, Scatter),
 * album mood color sync, and subtle desktop clock.
 */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const FONT = '"Inter Tight", Inter, system-ui, -apple-system, sans-serif';

  const THEMES = [
    {
      id: 'mood',
      label: 'Mood',
      stops: ['#38bdf8', '#818cf8', '#c084fc'],
      glow: '#38bdf8',
      tint: 'rgba(28, 54, 110, 0.36)',
      rgb: '56, 189, 248'
    },
    {
      id: 'nebula',
      label: 'Nebula',
      stops: ['#6366f1', '#a855f7', '#ec4899'],
      glow: '#a855f7',
      tint: 'rgba(76, 46, 140, 0.38)',
      rgb: '168, 85, 247'
    },
    {
      id: 'ember',
      label: 'Ember',
      stops: ['#f59e0b', '#f43f5e', '#c026d3'],
      glow: '#fb7185',
      tint: 'rgba(140, 50, 40, 0.38)',
      rgb: '251, 113, 133'
    },
    {
      id: 'mint',
      label: 'Mint',
      stops: ['#22d3ee', '#2dd4bf', '#a3e635'],
      glow: '#2dd4bf',
      tint: 'rgba(20, 92, 90, 0.38)',
      rgb: '45, 212, 191'
    },
    {
      id: 'ice',
      label: 'Ice',
      stops: ['#93c5fd', '#60a5fa', '#818cf8'],
      glow: '#93c5fd',
      tint: 'rgba(36, 64, 128, 0.38)',
      rgb: '147, 197, 253'
    },
    {
      id: 'sunset',
      label: 'Sunset',
      stops: ['#fbbf24', '#fb7185', '#8b5cf6'],
      glow: '#fb923c',
      tint: 'rgba(120, 60, 90, 0.38)',
      rgb: '251, 146, 60'
    },
    {
      id: 'mono',
      label: 'Mono',
      stops: ['#f8fafc', '#cbd5e1', '#94a3b8'],
      glow: '#e2e8f0',
      tint: 'rgba(30, 34, 44, 0.40)',
      rgb: '226, 232, 240'
    }
  ];

  const VIZ_STYLES = [
    { id: 'ring', label: 'Ring' },
    { id: 'aurora', label: 'Aurora' },
    { id: 'orb', label: 'Orb' },
    { id: 'waterfall', label: 'Waterfall' },
    { id: 'terrain', label: 'Terrain' },
    { id: 'scope', label: 'Scope' },
    { id: 'mirror', label: 'Mirror' }
  ];

  const LYRIC_STYLES = [
    { id: 'stack', label: 'Stack' },
    { id: 'rise', label: 'Rise' },
    { id: 'pop', label: 'Pop' },
    { id: 'karaoke', label: 'Karaoke' },
    { id: 'scatter', label: 'Scatter' }
  ];

  /* ------------------------------------------------------------- color utils */

  function hashString(str) {
    let h = 2166136261;
    const s = String(str || 'aurasound');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function hexToRgb(hex) {
    const value = String(hex || '#38bdf8').replace('#', '');
    const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
    const int = parseInt(full, 16) || 0;
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }

  function hslToHex(h, s, l) {
    const hue = ((h % 360) + 360) % 360 / 360;
    const sat = Math.max(0, Math.min(1, s));
    const lig = Math.max(0, Math.min(1, l));
    const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
    const p = 2 * lig - q;
    const hue2rgb = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const r = Math.round(hue2rgb(hue + 1 / 3) * 255);
    const g = Math.round(hue2rgb(hue) * 255);
    const b = Math.round(hue2rgb(hue - 1 / 3) * 255);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h: h * 360, s, l };
  }

  function buildHueSweptTheme(h, s = 0.78, l = 0.6) {
    const sat = Math.max(0.58, Math.min(0.92, s));
    const lig = Math.max(0.52, Math.min(0.68, l));
    const s0 = hslToHex(h - 32, sat, lig);
    const s1 = hslToHex(h, sat, Math.min(0.72, lig + 0.04));
    const s2 = hslToHex(h + 38, sat, lig);
    const [r, g, b] = hexToRgb(s1);
    return {
      id: 'mood',
      label: 'Mood',
      stops: [s0, s1, s2],
      glow: s1,
      tint: `rgba(${Math.round(r * 0.45)}, ${Math.round(g * 0.45)}, ${Math.round(b * 0.45)}, 0.38)`,
      rgb: `${r}, ${g}, ${b}`
    };
  }

  const rgbaCache = new Map();
  function rgba(hex, alpha) {
    const a = Math.round(alpha * 1000) / 1000;
    const key = hex + '|' + a;
    let val = rgbaCache.get(key);
    if (val === undefined) {
      const [r, g, b] = hexToRgb(hex);
      val = `rgba(${r}, ${g}, ${b}, ${a})`;
      if (rgbaCache.size > 512) rgbaCache.clear();
      rgbaCache.set(key, val);
    }
    return val;
  }

  function sampleStops(stops, t) {
    const clamped = Math.min(1, Math.max(0, t));
    const scaled = clamped * (stops.length - 1);
    const index = Math.min(stops.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const a = hexToRgb(stops[index]);
    const b = hexToRgb(stops[index + 1]);
    return `rgb(${Math.round(a[0] + (b[0] - a[0]) * local)}, ${Math.round(a[1] + (b[1] - a[1]) * local)}, ${Math.round(a[2] + (b[2] - a[2]) * local)})`;
  }

  function resample(source, count, outBuf) {
    const out = outBuf && outBuf.length === count ? outBuf : new Float32Array(count);
    if (!source || source.length === 0) return out;
    const ratio = source.length / count;
    for (let i = 0; i < count; i++) {
      const from = Math.floor(i * ratio);
      const to = Math.max(from + 1, Math.floor((i + 1) * ratio));
      let peak = 0;
      for (let j = from; j < to && j < source.length; j++) {
        if (source[j] > peak) peak = source[j];
      }
      out[i] = peak;
    }
    return out;
  }

  function featherEdges(ctx, width, height) {
    const inset = Math.max(10, Math.min(width, height) * 0.065);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const wipe = (x0, y0, x1, y1, x, y, w, h) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    };
    wipe(0, 0, inset, 0, 0, 0, inset, height);
    wipe(width, 0, width - inset, 0, width - inset, 0, inset, height);
    wipe(0, 0, 0, inset, 0, 0, width, inset);
    wipe(0, height, 0, height - inset, 0, height - inset, width, inset);
    ctx.restore();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));
  }

  function fitText(ctx, text, maxW) {
    const str = String(text || '');
    if (!str || maxW <= 8) return '';
    if (ctx.measureText(str).width <= maxW) return str;
    let lo = 0, hi = str.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(str.slice(0, mid) + '…').width <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return lo > 0 ? str.slice(0, lo) + '…' : '…';
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function easeOutCubic(x) {
    const t = Math.max(0, Math.min(1, x));
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutSine(x) {
    const t = Math.max(0, Math.min(1, x));
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  /* ------------------------------------------------------- AmbientStageEngine */

  class AmbientStageEngine {
    constructor(options = {}) {
      this.stageEl = options.stageEl || null;
      this.coverBgEl = options.coverBgEl || null;
      this.bgCanvas = options.bgCanvas || null;
      this.wheelCanvas = options.wheelCanvas || null;
      this.lyricsEl = options.lyricsEl || null;
      this.clockEl = options.clockEl || null;

      this.getPlaybackTime = typeof options.getPlaybackTime === 'function' ? options.getPlaybackTime : () => 0;
      this.getPlaybackDuration = typeof options.getPlaybackDuration === 'function' ? options.getPlaybackDuration : () => 180;
      this.getIsPlaying = typeof options.getIsPlaying === 'function' ? options.getIsPlaying : () => false;
      this.getQueueSongs = typeof options.getQueueSongs === 'function' ? options.getQueueSongs : () => [];
      this.onSelectSong = typeof options.onSelectSong === 'function' ? options.onSelectSong : null;
      this.onTogglePlay = typeof options.onTogglePlay === 'function' ? options.onTogglePlay : null;
      this.onSeek = typeof options.onSeek === 'function' ? options.onSeek : null;

      this.lyricStyle = this.loadPref('aurasound_ambient_lyric_style', LYRIC_STYLES, 'stack');
      this.vizStyle = this.loadPref('aurasound_ambient_viz_style', VIZ_STYLES, 'ring');
      this.themeId = this.loadPref('aurasound_ambient_theme', THEMES, 'mood');
      this.showClock = this.loadBoolPref('aurasound_ambient_clock', true);
      this.showEdgeGlow = this.loadBoolPref('aurasound_ambient_edge_glow', true);
      this.showRomaji = true;

      this.track = null;
      this.lyrics = [];
      this.activeIdx = -1;
      this.moodTheme = THEMES[0];

      // Image & thumbnail caches for canvas rendering
      this._coverImg = null;
      this._coverUrl = '';
      this._thumbCache = new Map();

      // Audio state buffers
      this._bands = new Float32Array(64);
      this._peaks = new Float32Array(64);
      this._wave = new Float32Array(128);
      this._bass = 0;
      this._mid = 0;
      this._treble = 0;
      this._level = 0;
      this._beat = 0;
      this._beatAt = 0;
      this._lastBeatSeen = 0;

      // Visualizer-specific persistent state
      this._spin = 0;
      this._flowLines = [];
      this._flowPulses = [];
      this._flowPulseSeen = 0;
      this._ringRipples = [];
      this._ringRippleSeen = 0;
      this._orbTurn = 0;
      this._orbKick = 0;
      this._orbSeen = 0;
      this._orbDots = this.buildOrbDots(760);
      this._wfHistory = [];
      this._wfCarry = 0;
      this._terrainRows = [];
      this._terrainScroll = 0;

      // Bottom-left Song Wheel state
      this._wheelAngle = 0;
      this._wheelSpinMix = 0;
      this._wheelArmSwing = 0;
      this._wheelArmLift = 0;
      this._wheelArmTouch = 0;
      this._wheelInGroove = false;
      this._wheelRoll = 0;
      this._wheelId = '';
      this._wheelKick = 0;
      this._wheelSeen = 0;
      this._wheelHits = [];
      this._wheelHoverKey = '';

      // Lyric rendering caches
      this._wordCache = new WeakMap();
      this._romajiCache = new WeakMap();
      this._lastLyricsSig = '';
      this._trackLyricsKey = '';
      this._cachedLineWordEls = [];
      this._lastClockSec = -1;
      this._edgePulse = 0.22;
      this._edgeBass = 0.1;
      this._edgeBeatFlash = 0;
      this._edgeBeatSeen = 0;
      this._prevBassSample = 0;
      this._kick = 0;
      this._wheelStageCx = 120;
      this._wheelStageCy = 0;
      this._wheelStageR = 72;

      this._running = false;
      this._rafId = null;
      this._lastFrameTs = 0;

      this.bindWheelEvents();
      this.applyThemeVars();
    }

    loadPref(key, list, fallback) {
      try {
        const v = localStorage.getItem(key);
        if (v && list.some(item => item.id === v)) return v;
      } catch (e) {}
      return fallback;
    }

    loadBoolPref(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        if (v === 'true') return true;
        if (v === 'false') return false;
      } catch (e) {}
      return fallback;
    }

    buildOrbDots(count) {
      const dots = [];
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const a = golden * i;
        dots.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r });
      }
      return dots;
    }

    setLyricStyle(id) {
      if (!LYRIC_STYLES.some(s => s.id === id)) return;
      this.lyricStyle = id;
      try { localStorage.setItem('aurasound_ambient_lyric_style', id); } catch (e) {}
      this._lastLyricsSig = '';
      if (this.lyricsEl) {
        this.lyricsEl.setAttribute('data-ambient-lyric', id);
      }
    }

    setVizStyle(id) {
      if (!VIZ_STYLES.some(s => s.id === id)) return;
      this.vizStyle = id;
      try { localStorage.setItem('aurasound_ambient_viz_style', id); } catch (e) {}
    }

    setTheme(id) {
      if (!THEMES.some(t => t.id === id)) return;
      this.themeId = id;
      try { localStorage.setItem('aurasound_ambient_theme', id); } catch (e) {}
      this.applyThemeVars();
    }

    toggleClock() {
      this.showClock = !this.showClock;
      try { localStorage.setItem('aurasound_ambient_clock', String(this.showClock)); } catch (e) {}
      if (this.clockEl) {
        this.clockEl.style.display = this.showClock ? '' : 'none';
      }
      return this.showClock;
    }

    toggleEdgeGlow() {
      this.showEdgeGlow = !this.showEdgeGlow;
      try { localStorage.setItem('aurasound_ambient_edge_glow', String(this.showEdgeGlow)); } catch (e) {}
      return this.showEdgeGlow;
    }

    getActiveTheme() {
      if (this.themeId === 'mood') return this.moodTheme || THEMES[0];
      return THEMES.find(t => t.id === this.themeId) || THEMES[0];
    }

    applyThemeVars() {
      const theme = this.getActiveTheme();
      if (this.stageEl) {
        this.stageEl.style.setProperty('--amb-stop-0', theme.stops[0]);
        this.stageEl.style.setProperty('--amb-stop-1', theme.stops[1] || theme.stops[0]);
        this.stageEl.style.setProperty('--amb-stop-2', theme.stops[2] || theme.stops[1] || theme.stops[0]);
        this.stageEl.style.setProperty('--amb-glow', theme.glow);
        this.stageEl.style.setProperty('--amb-tint', theme.tint);
        this.stageEl.style.setProperty('--amb-rgb', theme.rgb || '56, 189, 248');
      }
    }

    setTrack(track, lyrics) {
      const nextTrack = track || null;
      const nextLyrics = Array.isArray(lyrics) ? lyrics : [];
      const firstLine = nextLyrics[0];
      const lastLine = nextLyrics[nextLyrics.length - 1];
      const nextKey = [
        nextTrack ? (nextTrack.id || nextTrack.videoId || nextTrack.title || '') : '',
        nextLyrics.length,
        firstLine ? `${firstLine.time}|${firstLine.text || ''}` : '',
        lastLine ? `${lastLine.time}|${lastLine.text || ''}` : ''
      ].join('::');

      this.track = nextTrack;
      this.lyrics = nextLyrics;

      if (nextKey !== this._trackLyricsKey) {
        this._trackLyricsKey = nextKey;
        this._wordCache = new WeakMap();
        this._romajiCache = new WeakMap();
        this._lastLyricsSig = '';
        this._cachedLineWordEls = [];
      }

      const thumbUrl = (nextTrack && nextTrack.thumbnail) ? nextTrack.thumbnail : '/images/supermix.jpg';
      if (this.coverBgEl && this.coverBgEl.dataset.ambCover !== thumbUrl) {
        this.coverBgEl.dataset.ambCover = thumbUrl;
        this.coverBgEl.style.backgroundImage = `url("${thumbUrl.replace(/"/g, '\\"')}")`;
      }

      if (thumbUrl !== this._coverUrl) {
        this._coverUrl = thumbUrl;
        const img = new Image();
        img.onload = () => {
          if (this._coverUrl === thumbUrl) {
            this._coverImg = img;
          }
        };
        img.onerror = () => {
          if (this._coverUrl === thumbUrl) this._coverImg = null;
        };
        img.src = thumbUrl;
        this.extractMoodFromCover(thumbUrl, nextTrack);
      } else if (!this.moodTheme) {
        this.moodTheme = buildHueSweptTheme(hashString(nextTrack?.title || 'aurasound') % 360);
      }

      if (this.themeId === 'mood') {
        this.applyThemeVars();
      }
    }

    extractMoodFromCover(url, track) {
      const fallbackHue = hashString((track?.title || '') + (track?.artist || '')) % 360;
      const fallbackTheme = buildHueSweptTheme(fallbackHue, 0.78, 0.6);
      this.moodTheme = fallbackTheme;
      if (this.themeId === 'mood') this.applyThemeVars();

      if (!url || url.startsWith('data:')) return;
      try {
        const probe = new Image();
        probe.crossOrigin = 'anonymous';
        probe.onload = () => {
          if (this._coverUrl !== url) return;
          try {
            const c = document.createElement('canvas');
            c.width = 24;
            c.height = 24;
            const g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(probe, 0, 0, 24, 24);
            const data = g.getImageData(0, 0, 24, 24).data;
            let bestScore = -1;
            let bestHsl = null;
            for (let i = 0; i < data.length; i += 4) {
              const a = data[i + 3];
              if (a < 180) continue;
              const r = data[i], gr = data[i + 1], b = data[i + 2];
              const hsl = rgbToHsl(r, gr, b);
              // Prefer vibrant mid-brightness colors over dark grey/white
              const lumWeight = 1 - Math.abs(hsl.l - 0.52) * 1.4;
              const score = hsl.s * 1.6 + Math.max(0, lumWeight) * 0.7;
              if (hsl.s > 0.22 && hsl.l > 0.16 && hsl.l < 0.86 && score > bestScore) {
                bestScore = score;
                bestHsl = hsl;
              }
            }
            if (bestHsl) {
              this.moodTheme = buildHueSweptTheme(bestHsl.h, bestHsl.s, bestHsl.l);
              if (this.themeId === 'mood') this.applyThemeVars();
            }
          } catch (e) {
            // Tainted canvas on cross-origin thumbnail; keep deterministic hue-swept palette
          }
        };
        probe.src = url;
      } catch (e) {}
    }

    getCachedThumb(url) {
      if (!url) return null;
      let entry = this._thumbCache.get(url);
      if (entry) return entry.loaded ? entry.img : null;
      const img = new Image();
      entry = { img, loaded: false };
      this._thumbCache.set(url, entry);
      if (this._thumbCache.size > 48) {
        const firstKey = this._thumbCache.keys().next().value;
        this._thumbCache.delete(firstKey);
      }
      img.onload = () => { entry.loaded = true; };
      img.src = url;
      return null;
    }

    /* ----------------------------------------------------------- RAF lifecycle */

    start() {
      if (this._running) return;
      if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
      this._running = true;
      this._lastFrameTs = performance.now();
      if (this.clockEl) {
        this.clockEl.style.display = this.showClock ? '' : 'none';
      }
      if (this.lyricsEl) {
        this.lyricsEl.setAttribute('data-ambient-lyric', this.lyricStyle);
      }
      this.resizeCanvases();
      const loop = (now) => {
        if (!this._running) return;
        if (typeof window !== 'undefined' && window.innerWidth <= 768) {
          this.stop();
          return;
        }
        if (!document.hidden) {
          this.tick(now);
        }
        this._rafId = requestAnimationFrame(loop);
      };
      this._rafId = requestAnimationFrame(loop);
    }

    stop() {
      this._running = false;
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    }

    resizeCanvases() {
      const rawDpr = window.devicePixelRatio || 1;
      const bgDpr = Math.min(rawDpr, 1.5);
      const whDpr = Math.min(rawDpr, 2);
      let stageRect = null;
      if (this.bgCanvas && this.stageEl) {
        stageRect = this.stageEl.getBoundingClientRect();
        const w = Math.max(1, Math.round(stageRect.width));
        const h = Math.max(1, Math.round(stageRect.height));
        const tw = Math.round(w * bgDpr);
        const th = Math.round(h * bgDpr);
        if (this.bgCanvas.width !== tw || this.bgCanvas.height !== th) {
          this.bgCanvas.width = tw;
          this.bgCanvas.height = th;
        }
        this._bgW = w;
        this._bgH = h;
        this._bgDpr = bgDpr;
      }
      if (this.wheelCanvas) {
        const rect = this.wheelCanvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        const tw = Math.round(w * whDpr);
        const th = Math.round(h * whDpr);
        if (this.wheelCanvas.width !== tw || this.wheelCanvas.height !== th) {
          this.wheelCanvas.width = tw;
          this.wheelCanvas.height = th;
        }
        this._whW = w;
        this._whH = h;
        this._whDpr = whDpr;

        if (stageRect && rect.width > 0 && rect.height > 0) {
          const r = Math.max(48, Math.min(h * 0.365, w * 0.215));
          this._wheelStageCx = (rect.left - stageRect.left) + r * 1.18;
          this._wheelStageCy = (rect.top - stageRect.top) + h * 0.49;
          this._wheelStageR = r;
        }
      }
    }

    /* ----------------------------------------------------------- audio adapter */

    sampleAudioFrame(nowMs, dtMs) {
      const isPlaying = Boolean(this.getIsPlaying());
      const songTime = this.getPlaybackTime() || 0;
      const isSinging = this.activeIdx >= 0;

      const ae = global.audioEngine;
      let state = null;
      if (ae && typeof ae.computeCinemaAudioState === 'function') {
        state = ae.computeCinemaAudioState(isPlaying, songTime, isSinging);
      }

      const bands = this._bands;
      const peaks = this._peaks;
      const wave = this._wave;

      if (state && ae && ae.cinemaBars) {
        const srcBars = ae.cinemaBars;
        const srcPeaks = ae.cinemaPeaks || srcBars;
        const n = bands.length;
        for (let i = 0; i < n; i++) {
          const si = Math.min(srcBars.length - 1, Math.floor((i / n) * srcBars.length));
          const b = isPlaying ? srcBars[si] : (0.04 + 0.03 * Math.sin(nowMs * 0.0018 + i * 0.22));
          bands[i] = bands[i] * 0.35 + b * 0.65;
          peaks[i] = Math.max(bands[i], (srcPeaks[si] || b) * (isPlaying ? 1 : 0.4));
        }

        if (state.timeData && state.bufferLength > 0) {
          for (let i = 0; i < wave.length; i++) {
            const wi = Math.min(state.bufferLength - 1, Math.floor((i / wave.length) * state.bufferLength));
            wave[i] = (state.timeData[wi] - 128) / 128;
          }
        } else {
          for (let i = 0; i < wave.length; i++) {
            const p = i / (wave.length - 1);
            const amp = isPlaying ? (0.18 + state.bassEnergy * 0.55) : 0.08;
            wave[i] = amp * (
              Math.sin(p * Math.PI * 4 + songTime * 5.2) * 0.65 +
              Math.cos(p * Math.PI * 9 - songTime * 8.4) * 0.35
            );
          }
        }

        const targetBass = isPlaying ? Math.min(1, state.bassEnergy * 1.15 + state.kickImpulse * 0.32) : 0.1;
        const targetMid = isPlaying ? Math.min(1, state.midEnergy * 1.15 + state.vocalEnergy * 0.22) : 0.08;
        const targetTreble = isPlaying ? Math.min(1, state.trebleEnergy * 1.2 + state.hihatImpulse * 0.25) : 0.06;

        this._bass += (targetBass - this._bass) * 0.32;
        this._mid += (targetMid - this._mid) * 0.26;
        this._treble += (targetTreble - this._treble) * 0.3;
        this._level = this._bass * 0.48 + this._mid * 0.34 + this._treble * 0.18;

        const kickNow = isPlaying ? Math.max(state.kickImpulse, state.bassEnergy > 0.55 ? (state.bassEnergy - 0.15) : 0) : 0;
        const bassJump = isPlaying ? Math.max(0, state.bassEnergy - (this._prevBassSample || 0)) : 0;
        this._prevBassSample = state.bassEnergy || 0;
        if ((kickNow > this._beat + 0.15 || bassJump > 0.1) && nowMs - this._beatAt > 170) {
          this._beatAt = nowMs;
        }
        this._beat = Math.max(this._beat * 0.86, kickNow);
        this._kick = isPlaying ? Math.min(1, Math.max(state.kickImpulse || 0, bassJump * 2.6)) : 0;
      } else {
        // Fallback gentle ambient breathing if audioEngine unavailable
        for (let i = 0; i < bands.length; i++) {
          const p = i / (bands.length - 1);
          bands[i] = Math.max(0.02, (0.06 + 0.04 * Math.sin(nowMs * 0.002 + p * 6)) * (1 - p * 0.4));
          peaks[i] = bands[i];
        }
        for (let i = 0; i < wave.length; i++) {
          const p = i / (wave.length - 1);
          wave[i] = 0.09 * Math.sin(nowMs * 0.003 + p * Math.PI * 4);
        }
        this._bass = 0.12;
        this._mid = 0.1;
        this._treble = 0.08;
        this._level = 0.1;
        this._beat *= 0.9;
        this._kick = 0;
      }

      return {
        bands,
        peaks,
        wave,
        bass: this._bass,
        mid: this._mid,
        treble: this._treble,
        level: this._level,
        beat: this._beat,
        kick: this._kick,
        beatAt: this._beatAt,
        time: nowMs,
        step: Math.min(3, Math.max(0.4, dtMs / 16.667)),
        live: isPlaying ? 1 : 0,
        theme: this.getActiveTheme()
      };
    }

    /* --------------------------------------------------------------- main tick */

    tick(now) {
      const dtMs = Math.min(60, Math.max(4, now - (this._lastFrameTs || now)));
      this._lastFrameTs = now;

      this.resizeCanvases();
      const frame = this.sampleAudioFrame(now, dtMs);
      const syncTime = this.getPlaybackTime() || 0;

      // Update active lyric index & stage reactive bass pulse CSS variable
      this.activeIdx = this.findActiveLineIndex(syncTime);
      if (this.stageEl) {
        this.stageEl.style.setProperty('--amb-bass', this._bass.toFixed(3));
        this.stageEl.style.setProperty('--amb-beat', this._beat.toFixed(3));
      }

      this.renderBackgroundVisualizer(frame);
      this.renderSongWheel(frame);
      this.renderLyrics(syncTime, frame);
      if (this.showClock) this.renderClock();
    }

    /* -------------------------------------------------- background visualizers */

    renderBackgroundVisualizer(frame) {
      if (!this.bgCanvas || !this._bgW || !this._bgH) return;
      const ctx = this.bgCanvas.getContext('2d');
      const dpr = this._bgDpr || 1;
      const w = this._bgW;
      const h = this._bgH;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const f = Object.assign({}, frame, { ctx, width: w, height: h });

      this.drawBgAmbientLight(f);

      switch (this.vizStyle) {
        case 'aurora':
          this.drawBgAurora(f);
          break;
        case 'orb':
          this.drawBgOrb(f);
          break;
        case 'waterfall':
          this.drawBgWaterfall(f);
          break;
        case 'terrain':
          this.drawBgTerrain(f);
          break;
        case 'scope':
          this.drawBgScope(f);
          break;
        case 'mirror':
          this.drawBgMirror(f);
          break;
        case 'ring':
        default:
          this.drawBgFlow(f);
          this.drawBgRing(f);
          break;
      }

      if (this.showEdgeGlow) {
        this.drawEdgeGlow(f);
      }
    }

    drawBgAmbientLight(f) {
      const { ctx, width: w, height: h, theme, bass, mid, level, beat, time } = f;
      const t = time * 0.00032;
      const c0 = theme.stops[0];
      const c1 = theme.stops[1] || c0;
      const c2 = theme.stops[2] || c1;
      const beatPop = Math.max(beat, this._edgeBeatFlash || 0);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Center stage atmospheric bloom behind visualizer (kept soft so lyrics below stay high-contrast)
      const cx1 = w * (0.44 + Math.cos(t) * 0.08);
      const cy1 = h * (0.31 + Math.sin(t * 1.2) * 0.04);
      const r1 = Math.min(w, h) * (0.44 + bass * 0.09 + beatPop * 0.05);
      const g1 = ctx.createRadialGradient(cx1, cy1, 0, cx1, cy1, r1);
      g1.addColorStop(0, rgba(c0, 0.14 + level * 0.12 + beatPop * 0.06));
      g1.addColorStop(0.5, rgba(c1, 0.06 + bass * 0.05));
      g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      // Counter-drift secondary wash
      const cx2 = w * (0.58 + Math.sin(t * 0.85) * 0.09);
      const cy2 = h * (0.36 + Math.cos(t * 1.1) * 0.04);
      const r2 = Math.min(w, h) * (0.40 + mid * 0.08);
      const g2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, r2);
      g2.addColorStop(0, rgba(c2, 0.12 + mid * 0.10));
      g2.addColorStop(0.55, rgba(theme.glow, 0.05));
      g2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      // Fullscreen unclipped volumetric aura centered right behind the bottom-left vinyl disc
      const vx = this._wheelStageCx || Math.min(w * 0.14, 125);
      const vy = this._wheelStageCy || (h - 135);
      const vRadius = this._wheelStageR || 76;
      const vr = Math.max(vRadius * (2.55 + bass * 0.48 + beatPop * 0.38), Math.min(w, h) * 0.34);
      const vg = ctx.createRadialGradient(vx, vy, vRadius * 0.25, vx, vy, vr);
      vg.addColorStop(0, rgba(theme.glow, 0.26 + bass * 0.22 + beatPop * 0.18));
      vg.addColorStop(0.32, rgba(c0, 0.16 + bass * 0.14 + beatPop * 0.10));
      vg.addColorStop(0.66, rgba(c2, 0.06 + level * 0.05));
      vg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      ctx.restore();
    }

    drawEdgeGlow(f) {
      const { ctx, width: w, height: h, theme, bass, mid, treble, level, beat, kick, beatAt, live, time, step } = f;
      const t = time * 0.00055;
      const s = step || 1;

      if (beatAt && beatAt !== this._edgeBeatSeen && live > 0.5) {
        this._edgeBeatSeen = beatAt;
        this._edgeBeatFlash = Math.min(1, 0.65 + bass * 0.45);
      }
      if (live > 0.5 && kick > 0.32) {
        this._edgeBeatFlash = Math.max(this._edgeBeatFlash, Math.min(1, kick * 0.95));
      }
      this._edgeBeatFlash *= Math.pow(0.84, s);

      const rawTarget = live > 0.5
        ? Math.min(1.35, 0.16 + bass * 0.55 + beat * 0.45 + this._edgeBeatFlash * 0.65 + level * 0.15)
        : 0.22;
      const atkEase = 1 - Math.pow(1 - (rawTarget > this._edgePulse ? 0.5 : 0.14), s);
      this._edgePulse += (rawTarget - this._edgePulse) * atkEase;
      this._edgeBass += (bass - this._edgeBass) * (1 - Math.pow(1 - 0.32, s));

      const pulse = this._edgePulse;
      const sBass = this._edgeBass;
      const beatBurst = Math.max(beat * 0.85, this._edgeBeatFlash);
      const c0 = theme.stops[0];
      const c1 = theme.stops[1] || c0;
      const c2 = theme.stops[2] || c1;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // 1. Silky drifting radial light curtains hugging the top screen bezel (expands smoothly with beat)
      const topR = Math.max(w * 0.44, 360) * (1 + beatBurst * 0.16);
      const topY = -topR * 0.60;
      const shiftX = Math.sin(t) * w * 0.12;

      const topLeftCurtain = ctx.createRadialGradient(w * 0.30 + shiftX, topY, 0, w * 0.30 + shiftX, topY, topR);
      topLeftCurtain.addColorStop(0, rgba('#ffffff', 0.18 + beatBurst * 0.34));
      topLeftCurtain.addColorStop(0.55, rgba(c0, 0.20 + pulse * 0.30));
      topLeftCurtain.addColorStop(0.78, rgba(c1, 0.09 + pulse * 0.13));
      topLeftCurtain.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = topLeftCurtain;
      ctx.fillRect(0, 0, w, Math.min(h * 0.5, topR * 0.5));

      const topRightCurtain = ctx.createRadialGradient(w * 0.70 - shiftX, topY, 0, w * 0.70 - shiftX, topY, topR);
      topRightCurtain.addColorStop(0, rgba('#ffffff', 0.15 + beatBurst * 0.30));
      topRightCurtain.addColorStop(0.55, rgba(c2, 0.18 + pulse * 0.28));
      topRightCurtain.addColorStop(0.78, rgba(theme.glow, 0.08 + pulse * 0.12));
      topRightCurtain.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = topRightCurtain;
      ctx.fillRect(0, 0, w, Math.min(h * 0.5, topR * 0.5));

      // Feathered top atmospheric wash expanding inward on beat
      const topDepth = Math.round(44 + sBass * 58 + beatBurst * 54);
      const topWash = ctx.createLinearGradient(0, 0, 0, topDepth);
      topWash.addColorStop(0, rgba('#ffffff', 0.10 + beatBurst * 0.28));
      topWash.addColorStop(0.18, rgba(theme.glow, 0.16 * pulse + beatBurst * 0.22 + 0.06));
      topWash.addColorStop(0.55, rgba(c1, 0.08 * pulse + beatBurst * 0.08));
      topWash.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = topWash;
      ctx.fillRect(0, 0, w, topDepth);

      // 2. Beat-reactive organic corner blooms (drawn unclipped on full viewport bounds)
      const cornerR = Math.min(w, h) * (0.30 + sBass * 0.11 + beatBurst * 0.13);
      const tl = ctx.createRadialGradient(0, 0, 0, 0, 0, cornerR);
      tl.addColorStop(0, rgba('#ffffff', 0.16 + beatBurst * 0.28));
      tl.addColorStop(0.24, rgba(c0, 0.20 * pulse + beatBurst * 0.20 + 0.06));
      tl.addColorStop(0.64, rgba(c1, 0.08 * pulse + beatBurst * 0.07));
      tl.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = tl;
      ctx.fillRect(0, 0, w, h);

      const tr = ctx.createRadialGradient(w, 0, 0, w, 0, cornerR);
      tr.addColorStop(0, rgba('#ffffff', 0.14 + beatBurst * 0.25));
      tr.addColorStop(0.24, rgba(c2, 0.18 * pulse + beatBurst * 0.18 + 0.06));
      tr.addColorStop(0.64, rgba(c1, 0.07 * pulse + beatBurst * 0.06));
      tr.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = tr;
      ctx.fillRect(0, 0, w, h);

      // 3. Soft side perimeter glows breathing with beat & mid/treble
      const sideDepth = Math.round(54 + mid * 48 + beatBurst * 46);
      const leftGrad = ctx.createLinearGradient(0, 0, sideDepth, 0);
      leftGrad.addColorStop(0, rgba('#ffffff', beatBurst * 0.12));
      leftGrad.addColorStop(0.14, rgba(c0, 0.16 * pulse + beatBurst * 0.16 + 0.04));
      leftGrad.addColorStop(0.5, rgba(c1, 0.06 * pulse));
      leftGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = leftGrad;
      ctx.fillRect(0, 0, sideDepth, h);

      const rightGrad = ctx.createLinearGradient(w, 0, w - sideDepth, 0);
      rightGrad.addColorStop(0, rgba('#ffffff', beatBurst * 0.10 + treble * 0.08));
      rightGrad.addColorStop(0.14, rgba(c2, 0.15 * pulse + beatBurst * 0.15 + 0.04));
      rightGrad.addColorStop(0.5, rgba(c1, 0.05 * pulse));
      rightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = rightGrad;
      ctx.fillRect(w - sideDepth, 0, sideDepth, h);

      // 4. Bottom perimeter beat aura
      const botDepth = Math.round(42 + sBass * 38 + beatBurst * 36);
      const botGrad = ctx.createLinearGradient(0, h, 0, h - botDepth);
      botGrad.addColorStop(0, rgba(theme.glow, 0.13 * pulse + beatBurst * 0.16 + 0.04));
      botGrad.addColorStop(0.5, rgba(c1, 0.06 * pulse + beatBurst * 0.05));
      botGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, h - botDepth, w, botDepth);

      ctx.restore();
    }

    drawBgFlow(f) {
      const { ctx, width: w, height: h, theme, time, beatAt, bass, level, beat } = f;
      const t = time / 1000;
      const RIBBONS = 6;
      const PULSE_MS = 2600;
      if (beatAt && beatAt !== this._flowPulseSeen) {
        this._flowPulseSeen = beatAt;
        this._flowPulses.push(beatAt);
        if (this._flowPulses.length > 4) this._flowPulses.shift();
      }

      const count = Math.max(32, Math.min(180, Math.round(w / 10)));
      const dx = w / (count - 1);
      const mid = h * 0.335;
      const swell = 0.42 + bass * 0.78 + level * 0.36;
      const reach = w * 0.5;
      const bump = Math.max(60, w * 0.075);

      for (let r = 0; r < RIBBONS; r++) {
        if (!this._flowLines[r] || this._flowLines[r].length !== count) {
          this._flowLines[r] = new Float32Array(count);
        }
        const ys = this._flowLines[r];
        const p = r / (RIBBONS - 1);
        const dir = r % 2 ? -1 : 1;
        const amp = h * (0.06 + 0.048 * Math.sin(p * Math.PI)) * swell;
        const k = (TAU / w) * (1.15 + p * 0.9);
        const speed = (0.4 + p * 0.28) * dir;
        const lift = (p - 0.5) * h * 0.18;

        for (let i = 0; i < count; i++) {
          const x = i * dx;
          const out = Math.abs(x - reach);
          let push = 0;
          for (let n = 0; n < this._flowPulses.length; n++) {
            const age = (time - this._flowPulses[n]) / PULSE_MS;
            if (age < 0 || age > 1) continue;
            const d = (out - age * reach * 1.15) / bump;
            push += Math.exp(-d * d) * (1 - age);
          }
          ys[i] =
            mid + lift +
            amp * (
              Math.sin(x * k + t * speed + r * 1.7) * 0.62 +
              Math.sin(x * k * 2.3 - t * speed * 1.5 + r * 0.9) * 0.26 +
              Math.sin(x * k * 0.5 + t * 0.21 + r * 2.6) * 0.3
            ) -
            push * h * 0.07 * (r % 2 ? -1 : 1);
        }
      }

      const paint = ctx.createLinearGradient(0, 0, w, 0);
      const stops = theme.stops;
      const ramp = stops.concat(stops.slice(0, -1).reverse());
      ramp.forEach((s, i) => paint.addColorStop(i / (ramp.length - 1), s));

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      ctx.fillStyle = paint;
      ctx.globalAlpha = 0.045 + level * 0.045;
      for (let r = 0; r < RIBBONS - 1; r++) {
        const a = this._flowLines[r];
        const b = this._flowLines[r + 1];
        ctx.beginPath();
        ctx.moveTo(0, a[0]);
        for (let i = 1; i < count; i++) ctx.lineTo(i * dx, a[i]);
        for (let i = count - 1; i >= 0; i--) ctx.lineTo(i * dx, b[i]);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = paint;
      for (let r = 0; r < RIBBONS; r++) {
        const ys = this._flowLines[r];
        ctx.beginPath();
        ctx.moveTo(0, ys[0]);
        for (let i = 1; i < count - 1; i++) {
          ctx.quadraticCurveTo(i * dx, ys[i], (i + 0.5) * dx, (ys[i] + ys[i + 1]) / 2);
        }
        ctx.lineTo(w, ys[count - 1]);
        ctx.globalAlpha = 0.08 + beat * 0.06;
        ctx.lineWidth = 8;
        ctx.stroke();

        ctx.globalAlpha = 0.34 + 0.28 * Math.sin((r / (RIBBONS - 1)) * Math.PI) + beat * 0.1;
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
      ctx.restore();
    }

    drawBgRing(f) {
      const { ctx, width: w, height: h, theme, bass, beat, level, step, beatAt } = f;
      const cx = w * 0.5;
      const cy = h * 0.335;
      const radius = Math.min(w, h) * 0.15;
      const maxSpoke = Math.min(w, h) * 0.085;

      this._spin += (0.00022 + level * 0.0012) * 16.667 * step;

      if (beatAt && beatAt !== this._ringRippleSeen && f.live > 0.5) {
        this._ringRippleSeen = beatAt;
        this._ringRipples.push({ p: 0, strength: 0.5 + bass * 0.5 });
        if (this._ringRipples.length > 5) this._ringRipples.shift();
      }

      // Soft bass ripples expanding from center
      ctx.save();
      for (let i = this._ringRipples.length - 1; i >= 0; i--) {
        const rp = this._ringRipples[i];
        rp.p += 0.012 * step;
        if (rp.p >= 1) {
          this._ringRipples.splice(i, 1);
          continue;
        }
        const rr = radius * (0.9 + rp.p * 1.9);
        ctx.strokeStyle = rgba(theme.glow, (1 - rp.p) * 0.26 * rp.strength);
        ctx.lineWidth = Math.max(1, (1 - rp.p) * 2.5);
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();

      const half = 48;
      const values = resample(f.bands, half);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this._spin);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, ((Math.PI * radius) / half) * 0.46);
      ctx.shadowColor = rgba(theme.glow, 0.42);
      ctx.shadowBlur = 10 + beat * 16;

      const groups = 14;
      for (let g = 0; g < groups; g++) {
        ctx.strokeStyle = sampleStops(theme.stops, g / (groups - 1));
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        for (let i = 0; i < half; i++) {
          const t = i / (half - 1);
          if (Math.min(groups - 1, Math.floor(t * groups)) !== g) continue;
          const outer = radius + Math.max(2, maxSpoke * values[i]);
          for (let side = 0; side < 2; side++) {
            const a = (side === 0 ? t : -t) * Math.PI - Math.PI / 2;
            const c = Math.cos(a), s = Math.sin(a);
            ctx.moveTo(c * radius, s * radius);
            ctx.lineTo(c * outer, s * outer);
          }
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      const core = radius * (0.76 + bass * 0.14 + beat * 0.05);
      const disc = ctx.createRadialGradient(0, 0, core * 0.1, 0, 0, core);
      disc.addColorStop(0, rgba(theme.stops[0], 0.26));
      disc.addColorStop(1, rgba(theme.stops[theme.stops.length - 1], 0.02));
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(0, 0, core, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = rgba('#ffffff', 0.12 + beat * 0.16);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(0, 0, radius - 5, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    drawBgAurora(f) {
      const { ctx, width: w, height: h, theme, bass, mid, treble, beat, time } = f;
      const t = time * 0.0004;
      const blobs = [
        { energy: bass, phase: 0, speed: 1.0, size: 0.44, stop: 0 },
        { energy: mid, phase: 2.1, speed: 1.35, size: 0.36, stop: 0.5 },
        { energy: treble, phase: 4.2, speed: 1.7, size: 0.29, stop: 1 }
      ];

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const blob of blobs) {
        const wobble = 0.16 + blob.energy * 0.28;
        const x = w * (0.5 + Math.cos(t * blob.speed + blob.phase) * wobble);
        const y = h * (0.46 + Math.sin(t * blob.speed * 1.3 + blob.phase) * wobble);
        const r = Math.min(w, h) * blob.size * (0.55 + blob.energy * 0.55 + beat * 0.08);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const col = sampleStops(theme.stops, blob.stop);
        g.addColorStop(0, col.replace('rgb(', 'rgba(').replace(')', `, ${0.42 + blob.energy * 0.3})`));
        g.addColorStop(0.38, col.replace('rgb(', 'rgba(').replace(')', `, ${0.22 + blob.energy * 0.12})`));
        g.addColorStop(0.72, col.replace('rgb(', 'rgba(').replace(')', ', 0.06)'));
        g.addColorStop(1, col.replace('rgb(', 'rgba(').replace(')', ', 0)'));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      const half = 36;
      const values = resample(f.bands, half);
      const total = half * 2;
      const baseline = h * 1.02;
      const maxRise = h * 0.36;
      const pts = [];
      for (let i = 0; i < total; i++) {
        const idx = i < half ? half - 1 - i : i - half;
        pts.push({
          x: (i / (total - 1)) * w,
          y: baseline - Math.pow(values[idx], 1.1) * maxRise
        });
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, baseline);
      ctx.lineTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.lineTo(w, baseline);
      ctx.closePath();

      const fill = ctx.createLinearGradient(0, baseline - maxRise, 0, baseline);
      fill.addColorStop(0, rgba(theme.stops[theme.stops.length - 1], 0.52));
      fill.addColorStop(0.45, rgba(theme.stops[1] || theme.stops[0], 0.3));
      fill.addColorStop(1, rgba(theme.stops[0], 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = fill;
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.strokeStyle = rgba('#ffffff', 0.45 + beat * 0.25);
      ctx.lineWidth = 1.6;
      ctx.shadowColor = rgba(theme.glow, 0.6);
      ctx.shadowBlur = 10 + beat * 12;
      ctx.stroke();
      ctx.restore();
    }

    drawBgOrb(f) {
      const { ctx, width: w, height: h, theme, bands, wave, level, bass, step, beatAt } = f;
      this._orbTurn += (0.0035 + level * 0.016) * step;
      if (beatAt && beatAt !== this._orbSeen && f.live > 0.5) {
        this._orbSeen = beatAt;
        this._orbKick = 1;
      }
      this._orbKick *= Math.pow(0.9, step);

      const cx = w * 0.5;
      const cy = h * 0.335;
      const radius = Math.min(w, h) * 0.165;
      const tiltCos = Math.cos(0.38);
      const tiltSin = Math.sin(0.38);
      const cos = Math.cos(this._orbTurn);
      const sin = Math.sin(this._orbTurn);

      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.65);
      core.addColorStop(0, rgba(theme.glow, 0.18 + bass * 0.26 + this._orbKick * 0.14));
      core.addColorStop(1, rgba(theme.glow, 0));
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const GROUPS = 8;
      const depths = [0, 1, 2];
      const alphas = [0.16, 0.4, 0.85];
      const dotBase = Math.max(1.1, radius * 0.015);

      for (let g = 0; g < GROUPS; g++) {
        ctx.fillStyle = sampleStops(theme.stops, g / (GROUPS - 1));
        for (let di = 0; di < depths.length; di++) {
          ctx.globalAlpha = alphas[di];
          ctx.beginPath();
          for (let i = 0; i < this._orbDots.length; i++) {
            const p0 = this._orbDots[i];
            const lat = Math.abs(p0.y);
            if (Math.min(GROUPS - 1, Math.floor(lat * GROUPS)) !== g) continue;
            const band = bands[Math.min(bands.length - 1, Math.floor(lat * 0.85 * bands.length))] || 0;
            const lon = (Math.atan2(p0.z, p0.x) / TAU + 0.5) * (wave.length - 1);
            const ripple = wave[Math.floor(lon)] || 0;
            const r = radius * (1 + band * 0.42 + ripple * 0.14 + this._orbKick * 0.09);

            const x = p0.x * cos - p0.z * sin;
            const z0 = p0.x * sin + p0.z * cos;
            const y = p0.y * tiltCos - z0 * tiltSin;
            const z = p0.y * tiltSin + z0 * tiltCos;
            const bucket = z < -0.35 ? 0 : z < 0.3 ? 1 : 2;
            if (bucket !== depths[di]) continue;

            const depth = 1 + z * 0.22;
            const px = cx + x * r * depth;
            const py = cy + y * r * depth;
            const sz = dotBase * (0.55 + (z + 1) * 0.45) * (di === 2 ? 1 + band * 0.75 : 1);
            ctx.moveTo(px + sz, py);
            ctx.arc(px, py, sz, 0, TAU);
          }
          ctx.fill();
        }
      }
      ctx.restore();
    }

    drawBgWaterfall(f) {
      const { ctx, width: w, height: h, theme, step } = f;
      const RIDGES = 38;
      const POINTS = 72;
      this._wfCarry += step * 0.45;
      while (this._wfCarry >= 1) {
        this._wfCarry -= 1;
        const row = Float32Array.from(resample(f.bands, POINTS));
        this._wfHistory.push(row);
        if (this._wfHistory.length > RIDGES) this._wfHistory.shift();
      }
      const n = this._wfHistory.length;
      if (!n) return;

      const top = h * 0.22;
      const bottom = h * 0.86;
      ctx.save();
      ctx.lineJoin = 'round';
      for (let k = 0; k < n; k++) {
        const near = n === 1 ? 1 : k / (n - 1);
        const base = top + (bottom - top) * Math.pow(near, 1.15);
        const span = w * (0.52 + 0.36 * near);
        const left = (w - span) / 2;
        const amp = h * (0.13 + 0.2 * near);
        const vals = this._wfHistory[k];

        ctx.beginPath();
        for (let i = 0; i < POINTS; i++) {
          const p = i / (POINTS - 1);
          const taper = Math.pow(Math.sin(Math.PI * p), 1.6);
          const x = left + span * p;
          const y = base - amp * vals[i] * taper;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.save();
        ctx.lineTo(left + span, h);
        ctx.lineTo(left, h);
        ctx.closePath();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        for (let i = 0; i < POINTS; i++) {
          const p = i / (POINTS - 1);
          const taper = Math.pow(Math.sin(Math.PI * p), 1.6);
          const x = left + span * p;
          const y = base - amp * vals[i] * taper;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        const col = sampleStops(theme.stops, near);
        const fade = ctx.createLinearGradient(left, 0, left + span, 0);
        fade.addColorStop(0, 'rgba(0,0,0,0)');
        fade.addColorStop(0.22, col);
        fade.addColorStop(0.78, col);
        fade.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = fade;
        ctx.globalAlpha = 0.14 + 0.78 * near;
        ctx.lineWidth = 0.9 + near * 1.4;
        ctx.stroke();
      }
      ctx.restore();
    }

    drawBgTerrain(f) {
      const { ctx, width: w, height: h, theme, bass, beat, step } = f;
      const ROWS = 24;
      const COLS = 44;
      this._terrainScroll += 0.03 * step * (0.6 + f.level * 1.2);
      if (this._terrainScroll >= 1) {
        this._terrainScroll -= 1;
        this._terrainRows.unshift(Float32Array.from(resample(f.bands, COLS)));
        if (this._terrainRows.length > ROWS) this._terrainRows.pop();
      }
      while (this._terrainRows.length < ROWS) {
        this._terrainRows.push(new Float32Array(COLS));
      }

      const horizonY = h * 0.42;
      const sunR = Math.min(w, h) * (0.11 + bass * 0.025 + beat * 0.015);
      const sunGrad = ctx.createRadialGradient(w * 0.5, horizonY - sunR * 0.15, 0, w * 0.5, horizonY - sunR * 0.15, sunR * 2.2);
      sunGrad.addColorStop(0, rgba(theme.stops[theme.stops.length - 1], 0.55));
      sunGrad.addColorStop(0.45, rgba(theme.glow, 0.25));
      sunGrad.addColorStop(1, rgba(theme.glow, 0));
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, horizonY - sunR * 2.5, w, sunR * 3.5);

      ctx.save();
      for (let r = ROWS - 1; r >= 0; r--) {
        const z = (r + this._terrainScroll) / ROWS; // 0 near .. 1 far
        const persp = Math.pow(1 - z * 0.85, 1.5);
        const yBase = horizonY + (h - horizonY) * (1 - z * 0.92);
        const span = w * (0.45 + 0.9 * (1 - z));
        const left = (w - span) / 2;
        const vals = this._terrainRows[r];
        const amp = h * 0.16 * persp;

        ctx.beginPath();
        for (let c = 0; c < COLS; c++) {
          const p = c / (COLS - 1);
          // Mountains rise toward the sides, flat valley in the middle
          const sideBoost = 0.25 + 1.35 * Math.pow(Math.abs(p - 0.5) * 2, 1.4);
          const x = left + span * p;
          const y = yBase - (vals[c] || 0) * amp * sideBoost;
          if (c) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.strokeStyle = sampleStops(theme.stops, 1 - z);
        ctx.globalAlpha = Math.max(0.05, (1 - z) * 0.65);
        ctx.lineWidth = 0.8 + (1 - z) * 1.4;
        ctx.stroke();
      }
      ctx.restore();
      featherEdges(ctx, w, h);
    }

    drawBgScope(f) {
      const { ctx, width: w, height: h, theme, wave, level, beat } = f;
      const cx = w * 0.5;
      const cy = h * 0.335;
      const r = Math.min(w, h) * 0.175 * (0.7 + level * 0.45);
      const len = wave.length;
      const offset = Math.floor(len * 0.25);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      theme.stops.forEach((s, i) => grad.addColorStop(i / (theme.stops.length - 1), s));

      ctx.strokeStyle = grad;
      ctx.shadowColor = rgba(theme.glow, 0.7);
      ctx.shadowBlur = 12 + beat * 16;
      ctx.lineWidth = 2.4;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const a = (i / len) * TAU;
        const wx = wave[i] || 0;
        const wy = wave[(i + offset) % len] || 0;
        const px = cx + (Math.cos(a) * 0.55 + wx * 0.85) * r;
        const py = cy + (Math.sin(a) * 0.55 + wy * 0.85) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    drawBgMirror(f) {
      const { ctx, width: w, height: h, theme, bands, peaks, beat } = f;
      const padX = w * 0.08;
      const cy = h * 0.335;
      const usable = w - padX * 2;
      const count = Math.max(24, Math.min(88, Math.round(usable / 12)));
      // Use the active musical range (~82% of bands) mirrored symmetrically so both edges match
      const halfCount = Math.ceil(count / 2);
      const activeSpan = Math.max(8, Math.floor(bands.length * 0.82));
      const halfVals = resample(bands.subarray(0, activeSpan), halfCount);
      const halfPeaks = resample(peaks.subarray(0, activeSpan), halfCount);
      const values = new Float32Array(count);
      const pVals = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const distFromCenter = Math.abs(i - (count - 1) / 2) / Math.max(1, (count - 1) / 2);
        const si = Math.min(halfCount - 1, Math.floor(distFromCenter * (halfCount - 1)));
        values[i] = halfVals[si];
        pVals[i] = halfPeaks[si];
      }
      const slot = usable / count;
      const barW = Math.max(2.5, slot * 0.56);
      const maxReach = h * 0.165;

      const grad = ctx.createLinearGradient(padX, 0, w - padX, 0);
      theme.stops.forEach((s, i) => grad.addColorStop(i / (theme.stops.length - 1), s));

      ctx.save();
      ctx.fillStyle = grad;
      ctx.shadowColor = rgba(theme.glow, 0.45);
      ctx.shadowBlur = 10 + beat * 14;
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const reach = Math.max(barW * 0.5, values[i] * maxReach);
        const x = padX + i * slot + (slot - barW) / 2;
        ctx.roundRect(x, cy - reach, barW, reach * 2, barW / 2);
      }
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba('#ffffff', 0.28);
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const reach = pVals[i] * maxReach;
        if (reach < barW) continue;
        const x = padX + i * slot + (slot - barW) / 2;
        ctx.roundRect(x, cy - reach - 4, barW, 2, 1);
        ctx.roundRect(x, cy + reach + 2, barW, 2, 1);
      }
      ctx.fill();
      ctx.restore();
      featherEdges(ctx, w, h);
    }

    /* -------------------------------------------------- bottom-left song wheel */

    bindWheelEvents() {
      if (!this.wheelCanvas) return;
      this.wheelCanvas.addEventListener('mousemove', (e) => {
        const hit = this.hitTestWheel(e);
        this._wheelHoverKey = hit ? hit.key : '';
        this.wheelCanvas.style.cursor = (hit && (!hit.now || hit.isDisc)) ? 'pointer' : 'default';
      });
      this.wheelCanvas.addEventListener('mouseleave', () => {
        this._wheelHoverKey = '';
        if (this.wheelCanvas) this.wheelCanvas.style.cursor = 'default';
      });
      this.wheelCanvas.addEventListener('click', (e) => {
        const hit = this.hitTestWheel(e);
        if (!hit) return;
        if (hit.isDisc) {
          if (this.onTogglePlay) this.onTogglePlay();
          return;
        }
        if (!hit.now && this.onSelectSong) {
          this.onSelectSong(hit.song);
        }
      });
    }

    hitTestWheel(e) {
      if (!this.wheelCanvas || !this._wheelHits.length) return null;
      const rect = this.wheelCanvas.getBoundingClientRect();
      const scaleX = this._whW ? (this._whW / Math.max(1, rect.width)) : 1;
      const scaleY = this._whH ? (this._whH / Math.max(1, rect.height)) : 1;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      // Test front-to-back in exact rotated & scaled local card coordinates
      for (let i = 0; i < this._wheelHits.length; i++) {
        const h = this._wheelHits[i];
        if (h.isDisc) {
          const dx = x - h.cx;
          const dy = y - h.cy;
          if ((dx * dx + dy * dy) <= h.r * h.r) {
            return h;
          }
          continue;
        }
        const dx = x - h.cx;
        const dy = y - h.cy;
        const cosA = Math.cos(-h.angle);
        const sinA = Math.sin(-h.angle);
        const invS = 1 / Math.max(0.2, h.scale || 1);
        const lx = (dx * cosA - dy * sinA) * invS;
        const ly = (dx * sinA + dy * cosA) * invS;
        if (lx >= h.lx && lx <= h.lx + h.lw && ly >= h.ly && ly <= h.ly + h.lh) {
          return h;
        }
      }
      return null;
    }

    renderSongWheel(f) {
      if (!this.wheelCanvas || !this._whW || !this._whH) return;
      const ctx = this.wheelCanvas.getContext('2d');
      const dpr = this._whDpr || 1;
      const w = this._whW;
      const h = this._whH;
      const { theme, step, bass, beatAt, live } = f;
      const ease = (rate) => 1 - Math.pow(1 - rate, step);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.wheelCanvas.width, this.wheelCanvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Update spin, kick & tonearm physics
      if (beatAt && beatAt !== this._wheelSeen && live > 0.5) {
        this._wheelSeen = beatAt;
        this._wheelKick = 1;
      }
      this._wheelKick *= Math.pow(0.89, step);

      const playing = live > 0.3 ? 1 : 0;
      const targetArm = playing;
      if (playing) {
        this._wheelArmSwing += (1 - this._wheelArmSwing) * ease(0.065);
        this._wheelArmLift += (0 - this._wheelArmLift) * ease(0.11);
        if (this._wheelArmSwing > 0.9 && !this._wheelInGroove) {
          this._wheelInGroove = true;
          this._wheelArmTouch = 1;
        }
      } else {
        this._wheelInGroove = false;
        this._wheelArmLift += (1 - this._wheelArmLift) * ease(0.12);
        this._wheelArmSwing += (0 - this._wheelArmSwing) * ease(0.06);
      }
      this._wheelArmTouch *= Math.pow(0.92, step);
      this._wheelSpinMix += (targetArm - this._wheelSpinMix) * ease(0.07);
      this._wheelAngle = (this._wheelAngle + (33.333 / 60) * TAU * (step / 60) * this._wheelSpinMix) % TAU;

      // Resolve songs for the wheel: [current, next1, next2, next3]
      const songs = this.getQueueSongs() || [];
      const curSong = songs[0];
      const wheelKey = curSong ? `${curSong.id || ''}|${curSong.title || ''}` : '';
      if (wheelKey && wheelKey !== this._wheelId) {
        if (this._wheelId) this._wheelRoll -= 1;
        this._wheelId = wheelKey;
      }
      this._wheelRoll += (0 - this._wheelRoll) * ease(0.085);

      const radius = Math.max(48, Math.min(h * 0.365, w * 0.215));
      const cx = radius * 1.18;
      const cy = h * 0.49;

      // Tight inner platter rim glow strictly bounded inside wheelCanvas (wide room glow lives on full-screen bgCanvas -> zero clipped line)
      const safeHaloR = Math.max(radius + 4, Math.min(cx - 2, cy - 2, h - cy - 2, radius * 1.24));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const innerHalo = ctx.createRadialGradient(cx, cy, radius * 0.82, cx, cy, safeHaloR);
      innerHalo.addColorStop(0, rgba('#ffffff', 0.10 + this._wheelKick * 0.16));
      innerHalo.addColorStop(0.35, rgba(theme.glow, 0.32 + bass * 0.34 + this._wheelKick * 0.22));
      innerHalo.addColorStop(0.74, rgba(theme.stops[0], 0.10 + bass * 0.08));
      innerHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = innerHalo;
      ctx.beginPath();
      ctx.arc(cx, cy, safeHaloR, 0, TAU);
      ctx.fill();
      ctx.restore();

      // Soft physical drop shadow bounded cleanly inside wheelCanvas
      const shadowCy = cy + radius * 0.08;
      const safeShadowR = Math.max(radius + 2, Math.min(cx - 2, shadowCy - 2, h - shadowCy - 2, radius * 1.14));
      const floorShadow = ctx.createRadialGradient(cx, shadowCy, radius * 0.65, cx, shadowCy, safeShadowR);
      floorShadow.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
      floorShadow.addColorStop(0.75, 'rgba(0, 0, 0, 0.16)');
      floorShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = floorShadow;
      ctx.beginPath();
      ctx.arc(cx, shadowCy, safeShadowR, 0, TAU);
      ctx.fill();

      // Draw Vinyl Record at (cx, cy)
      ctx.save();
      ctx.translate(cx, cy);
      this.drawVinylDisc(ctx, f, theme, radius);
      ctx.restore();

      // Draw Tonearm
      this.drawVinylTonearm(ctx, cx, cy, radius, theme, bass);

      // Draw fanned song rows along the right arc of the vinyl ring
      const cardHits = [];
      if (!songs.length) {
        this._wheelHits = [{ key: '__disc__', isDisc: true, now: true, cx, cy, r: radius * 1.04 }];
        ctx.save();
        ctx.font = `600 13px ${FONT}`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.textBaseline = 'middle';
        ctx.fillText('Pilih lagu untuk diputar', cx + radius * 1.14, cy);
        ctx.restore();
        return;
      }

      const GAP = 0.39;
      const START = -0.38;
      const ringDist = radius * 1.14;
      const accent = theme.stops[theme.stops.length - 1];
      const titleSize = Math.max(11, Math.min(14, radius * 0.138));
      const artistSize = Math.max(9.5, Math.min(11.5, radius * 0.11));

      // Calculate playback progress for Now Playing micro-bar
      const curTime = this.getPlaybackTime() || 0;
      const curDur = Math.max(1, this.getPlaybackDuration() || 180);
      const songPct = Math.max(0, Math.min(1, curTime / curDur));

      ctx.save();
      ctx.textBaseline = 'middle';

      for (let i = Math.min(songs.length - 1, 2); i >= 0; i--) {
        const song = songs[i];
        const turn = START + (i - this._wheelRoll) * GAP;
        const away = Math.abs(turn);
        if (away > 1.4) continue;

        const near = Math.cos(Math.min(1.4, away));
        const scale = 0.72 + 0.28 * near;
        const isHover = !song.now && this._wheelHoverKey === song.key;
        const alpha = Math.max(0, Math.min(1, 1.35 - away * 0.72)) * (song.now ? 1 : (isHover ? 1 : 0.82));
        if (alpha <= 0.02) continue;

        const reach = ringDist + radius * 0.1 * away;
        const rx = cx + Math.cos(turn) * reach;
        const ry = cy + Math.sin(turn) * reach * 0.92;
        const angle = turn * 0.36;

        const thumbSize = radius * (song.now ? 0.36 : 0.28);
        const rowW = Math.max(128, (w - rx - 12) / scale);

        // Front-to-back exact local hitbox with generous +8px clickable margin
        cardHits.unshift({
          key: song.key,
          now: Boolean(song.now),
          isDisc: false,
          song,
          cx: rx,
          cy: ry,
          angle,
          scale,
          lx: -12,
          ly: -thumbSize / 2 - 11,
          lw: rowW + 14,
          lh: thumbSize + 22
        });

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(rx, ry);
        ctx.rotate(angle);
        ctx.scale(scale, scale);

        // Subtle frosted backing pill for readability over busy backgrounds
        roundRectPath(ctx, -6, -thumbSize / 2 - 5, rowW, thumbSize + 10, 12);
        ctx.fillStyle = song.now
          ? 'rgba(8, 13, 26, 0.58)'
          : (isHover ? 'rgba(255, 255, 255, 0.16)' : 'rgba(8, 13, 26, 0.38)');
        ctx.fill();
        if (song.now || isHover) {
          ctx.strokeStyle = song.now ? rgba(theme.glow, 0.48) : rgba(theme.stops[0], 0.58);
          ctx.lineWidth = isHover ? 1.4 : 1;
          ctx.stroke();
        }

        const art = song.now ? this._coverImg : this.getCachedThumb(song.thumbnail);
        ctx.save();
        ctx.shadowColor = song.now ? rgba(theme.glow, 0.7) : 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = song.now ? 12 * (0.6 + this._wheelKick * 0.6) : 5;
        roundRectPath(ctx, 0, -thumbSize / 2, thumbSize, thumbSize, thumbSize * 0.16);
        ctx.fillStyle = '#141824';
        ctx.fill();
        ctx.restore();

        ctx.save();
        roundRectPath(ctx, 0, -thumbSize / 2, thumbSize, thumbSize, thumbSize * 0.16);
        ctx.clip();
        if (art && art.complete && art.naturalWidth) {
          const sc = thumbSize / Math.min(art.naturalWidth, art.naturalHeight);
          const dw = art.naturalWidth * sc;
          const dh = art.naturalHeight * sc;
          ctx.drawImage(art, (thumbSize - dw) / 2, -thumbSize / 2 + (thumbSize - dh) / 2, dw, dh);
        } else {
          const dg = ctx.createLinearGradient(0, -thumbSize / 2, thumbSize, thumbSize / 2);
          theme.stops.forEach((s, idx) => dg.addColorStop(idx / (theme.stops.length - 1), s));
          ctx.fillStyle = dg;
          ctx.fillRect(0, -thumbSize / 2, thumbSize, thumbSize);
        }
        ctx.restore();

        const tx = thumbSize + 11;
        const room = Math.max(40, rowW - tx - 10);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 5;

        if (song.now) {
          ctx.font = `800 ${Math.max(8, artistSize * 0.78)}px ${FONT}`;
          ctx.fillStyle = accent;
          ctx.fillText(live ? 'NOW PLAYING' : 'PAUSED', tx, -titleSize * 1.18);

          ctx.font = `700 ${titleSize * 1.04}px ${FONT}`;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(fitText(ctx, song.title, room), tx, -1.5);

          ctx.font = `500 ${artistSize * 0.96}px ${FONT}`;
          ctx.fillStyle = 'rgba(226, 232, 240, 0.72)';
          ctx.fillText(fitText(ctx, song.artist || 'AuraSound', room), tx, titleSize * 0.85);

          // Subtle progress bar cleanly below artist line
          const barY = thumbSize / 2 + 2;
          const barW = Math.min(room, 110);
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
          roundRectPath(ctx, tx, barY, barW, 2.2, 1.1);
          ctx.fill();
          ctx.fillStyle = accent;
          roundRectPath(ctx, tx, barY, Math.max(3, barW * songPct), 2.2, 1.1);
          ctx.fill();
        } else {
          const badge = i === 1 ? 'UP NEXT' : 'QUEUE';
          ctx.font = `800 ${Math.max(8, artistSize * 0.74)}px ${FONT}`;
          ctx.fillStyle = i === 1 ? rgba(theme.stops[0], 0.95) : 'rgba(148, 163, 184, 0.85)';
          ctx.fillText(badge, tx, -titleSize * 0.92);

          ctx.font = `600 ${titleSize * 0.92}px ${FONT}`;
          ctx.fillStyle = isHover ? '#ffffff' : 'rgba(248, 250, 252, 0.92)';
          ctx.fillText(fitText(ctx, song.title, room), tx, 1);

          ctx.font = `500 ${artistSize * 0.92}px ${FONT}`;
          ctx.fillStyle = 'rgba(203, 213, 225, 0.62)';
          ctx.fillText(fitText(ctx, song.artist || '', room), tx, titleSize * 0.9);
        }

        ctx.restore();
      }
      ctx.restore();
      // Keep queue cards prioritized over the vinyl disc hitbox
      cardHits.push({ key: '__disc__', isDisc: true, now: true, cx, cy, r: radius * 1.04 });
      this._wheelHits = cardHits;
    }

    drawVinylDisc(ctx, f, theme, radius) {
      const body = ctx.createRadialGradient(0, 0, radius * 0.3, 0, 0, radius);
      body.addColorStop(0, '#1e1e29');
      body.addColorStop(0.75, '#0e0f17');
      body.addColorStop(0.97, '#090a10');
      body.addColorStop(1, '#2d2e3d');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.fill();

      // Grooves: subtle ambient tracks + audio-reactive lit arcs
      const GROOVES = 38;
      const inner = radius * 0.4;
      const outer = radius * 0.95;
      const gap = (outer - inner) / GROOVES;
      const vals = resample(f.bands, GROOVES);

      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(0.6, gap * 0.35);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
      ctx.beginPath();
      for (let i = 0; i < GROOVES; i++) {
        const r = inner + gap * (i + 0.5);
        ctx.moveTo(r, 0);
        ctx.arc(0, 0, r, 0, TAU);
      }
      ctx.stroke();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = Math.max(0.9, gap * 0.65);
      for (let i = 0; i < GROOVES; i++) {
        const v = vals[GROOVES - 1 - i];
        if (v < 0.03) continue;
        const r = inner + gap * (i + 0.5);
        const start = this._wheelAngle + i * 0.61;
        ctx.strokeStyle = sampleStops(theme.stops, i / (GROOVES - 1));
        ctx.globalAlpha = Math.min(1, 0.18 + v * 0.95);
        ctx.beginPath();
        ctx.arc(0, 0, r, start, start + 0.25 + v * TAU * 0.78);
        ctx.stroke();
      }
      ctx.restore();

      // Studio dual-beam specular sheen across the lacquer surface
      const labelR = radius * 0.35;
      if (ctx.createConicGradient) {
        const sheen = ctx.createConicGradient(-Math.PI * 0.28, 0, 0);
        sheen.addColorStop(0, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.05, 'rgba(255,255,255,0.16)');
        sheen.addColorStop(0.11, rgba(theme.stops[0], 0.10));
        sheen.addColorStop(0.17, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.49, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.55, 'rgba(255,255,255,0.12)');
        sheen.addColorStop(0.61, rgba(theme.stops[theme.stops.length - 1], 0.08));
        sheen.addColorStop(0.67, 'rgba(255,255,255,0)');
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, TAU);
        ctx.arc(0, 0, labelR * 1.06, 0, TAU, true);
        ctx.fill();
      }

      // Outer luminous rim ring catching stage light
      ctx.save();
      ctx.strokeStyle = rgba(theme.glow, 0.36 + f.bass * 0.32);
      ctx.lineWidth = 1.25;
      ctx.shadowColor = rgba(theme.glow, 0.65);
      ctx.shadowBlur = 8 + f.beat * 8;
      ctx.beginPath();
      ctx.arc(0, 0, radius - 0.6, 0, TAU);
      ctx.stroke();
      ctx.restore();

      // Rotating center album label
      ctx.save();
      ctx.rotate(this._wheelAngle);
      ctx.beginPath();
      ctx.arc(0, 0, labelR, 0, TAU);
      ctx.clip();
      if (this._coverImg && this._coverImg.complete && this._coverImg.naturalWidth) {
        const sc = (labelR * 2) / Math.min(this._coverImg.naturalWidth, this._coverImg.naturalHeight);
        const dw = this._coverImg.naturalWidth * sc;
        const dh = this._coverImg.naturalHeight * sc;
        ctx.drawImage(this._coverImg, -dw / 2, -dh / 2, dw, dh);
      } else {
        const lg = ctx.createLinearGradient(-labelR, -labelR, labelR, labelR);
        theme.stops.forEach((s, idx) => lg.addColorStop(idx / (theme.stops.length - 1), s));
        ctx.fillStyle = lg;
        ctx.fillRect(-labelR, -labelR, labelR * 2, labelR * 2);
      }
      ctx.restore();

      // Glossy top-left dome reflection over center label
      const dome = ctx.createLinearGradient(-labelR, -labelR, labelR * 0.6, labelR * 0.6);
      dome.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
      dome.addColorStop(0.45, 'rgba(255, 255, 255, 0.04)');
      dome.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = dome;
      ctx.beginPath();
      ctx.arc(0, 0, labelR, 0, TAU);
      ctx.fill();

      // Luminous label rim + spindle hole
      ctx.save();
      ctx.strokeStyle = rgba(theme.glow, 0.72 + f.bass * 0.25);
      ctx.shadowColor = rgba(theme.glow, 0.7);
      ctx.shadowBlur = 8;
      ctx.lineWidth = Math.max(1.5, radius * 0.02);
      ctx.beginPath();
      ctx.arc(0, 0, labelR, 0, TAU);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#0c0f18';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(3, radius * 0.055), 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    drawVinylTonearm(ctx, cx, cy, radius, theme, bass) {
      const px = cx + radius * 0.88;
      const py = cy - radius * 0.86;
      const restAngle = Math.PI * 0.62;
      const playAngle = Math.PI * 0.82;
      const curAngle = restAngle + (playAngle - restAngle) * this._wheelArmSwing;
      const len = radius * 0.82;

      ctx.save();
      ctx.translate(px, py);

      // Pivot housing
      ctx.fillStyle = '#272732';
      ctx.strokeStyle = rgba(theme.glow, 0.35);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(6, radius * 0.085), 0, TAU);
      ctx.fill();
      ctx.stroke();

      ctx.rotate(curAngle - this._wheelArmLift * 0.08);
      // Shadow
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = Math.max(2.2, radius * 0.032);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(len, 4);
      ctx.stroke();

      // Brushed rod
      const rodGrad = ctx.createLinearGradient(0, 0, len, 0);
      rodGrad.addColorStop(0, '#a1a1aa');
      rodGrad.addColorStop(0.6, '#ffffff');
      rodGrad.addColorStop(1, '#71717a');
      ctx.strokeStyle = rodGrad;
      ctx.lineWidth = Math.max(1.8, radius * 0.025);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();

      // Glowing cartridge head + stylus tip contact bloom
      const cw = Math.max(7, radius * 0.11);
      const ch = Math.max(4, radius * 0.06);
      if (this._wheelInGroove) {
        const tipGlow = ctx.createRadialGradient(len, 0, 0, len, 0, radius * 0.22);
        tipGlow.addColorStop(0, rgba('#ffffff', 0.38 + bass * 0.32));
        tipGlow.addColorStop(0.35, rgba(theme.glow, 0.36 + bass * 0.28));
        tipGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = tipGlow;
        ctx.beginPath();
        ctx.arc(len, 0, radius * 0.22, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = theme.stops[0];
      ctx.shadowColor = rgba(theme.glow, 0.75 + bass * 0.25);
      ctx.shadowBlur = 10 + this._wheelArmTouch * 12;
      roundRectPath(ctx, len - cw * 0.4, -ch / 2, cw, ch, 2);
      ctx.fill();
      ctx.restore();
    }

    /* ------------------------------------------------ Weyv Lyric Animations */

    findActiveLineIndex(syncTime) {
      const lyrics = this.lyrics;
      if (!lyrics || !lyrics.length) return -1;
      let low = 0, high = lyrics.length - 1;
      let activeIdx = -1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const cur = lyrics[mid];
        const next = lyrics[mid + 1];
        const start = Number(cur.time) || 0;
        const nominalEnd = cur.endTime !== undefined ? Number(cur.endTime) : (next ? Number(next.time) : start + 5.0);
        const end = (next && Number(next.time) > start) ? Math.min(nominalEnd, Number(next.time)) : nominalEnd;
        if (syncTime >= start && syncTime < end) {
          activeIdx = mid;
          break;
        } else if (syncTime < start) {
          high = mid - 1;
        } else {
          if (!next || syncTime < Number(next.time)) {
            activeIdx = mid;
            break;
          }
          low = mid + 1;
        }
      }
      return activeIdx;
    }

    getLineWords(lineIdx) {
      if (lineIdx < 0 || lineIdx >= this.lyrics.length) return [];
      const line = this.lyrics[lineIdx];
      if (!line) return [];
      const cached = this._wordCache.get(line);
      if (cached) return cached;

      let words = [];
      if (Array.isArray(line.words) && line.words.length > 0) {
        words = line.words
          .filter(w => w && typeof w.text === 'string' && w.text.length > 0)
          .map((w, idx, arr) => {
            const begin = Number.isFinite(Number(w.begin)) ? Number(w.begin) : Number(line.time) || 0;
            let end = Number(w.end);
            if (!Number.isFinite(end) || end <= begin) {
              const nextW = arr[idx + 1];
              end = nextW && Number.isFinite(Number(nextW.begin))
                ? Math.max(begin + 0.08, Number(nextW.begin))
                : begin + 0.28;
            }
            return { text: w.text, begin, end, trailingSpace: w.trailingSpace !== false };
          });
      }

      if (words.length === 0) {
        const text = (line.text || '').trim();
        const tokens = text ? text.split(/\s+/) : [];
        const nextLine = this.lyrics[lineIdx + 1];
        const start = Number(line.time) || 0;
        const rawEnd = line.endTime !== undefined
          ? Number(line.endTime)
          : (nextLine ? Number(nextLine.time) - 0.12 : start + 4.0);
        const totalDur = Math.max(0.65, Math.min(8.5, rawEnd - start));
        const totalWeight = tokens.reduce((acc, t) => acc + Math.max(2, t.length + 1), 0) || 1;
        let cursor = start;
        words = tokens.map((tok, i) => {
          const slice = (Math.max(2, tok.length + 1) / totalWeight) * totalDur;
          const wBegin = cursor;
          const wEnd = (i === tokens.length - 1) ? (start + totalDur) : (cursor + slice);
          cursor = wEnd;
          return { text: tok, begin: wBegin, end: Math.max(wBegin + 0.06, wEnd), trailingSpace: true };
        });
      }

      this._wordCache.set(line, words);
      return words;
    }

    findActiveWord(words, syncTime) {
      if (!words || !words.length) return { index: -1, progress: 0 };
      let activeIdx = -1;
      let low = 0, high = words.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const w = words[mid];
        if (syncTime >= w.begin && syncTime < w.end) {
          activeIdx = mid;
          break;
        } else if (syncTime < w.begin) {
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }
      if (activeIdx !== -1) {
        const w = words[activeIdx];
        const dur = Math.max(0.02, w.end - w.begin);
        return { index: activeIdx, progress: Math.min(1, Math.max(0, (syncTime - w.begin) / dur)) };
      }
      if (syncTime < words[0].begin) return { index: -1, progress: 0 };
      for (let i = words.length - 1; i >= 0; i--) {
        if (syncTime >= words[i].end) return { index: i, progress: 1, inGap: true };
      }
      return { index: -1, progress: 0 };
    }

    renderLyrics(syncTime, frame) {
      if (!this.lyricsEl) return;
      const trackKey = this.track ? (this.track.id || this.track.title || '') : '';
      const activeIdx = this.activeIdx;
      const hasLyrics = this.lyrics.length > 0;

      // Check intro / instrumental pause
      let inLeadIn = false;
      let leadInDiff = 0;
      let nextPreview = '';
      if (hasLyrics) {
        const first = this.lyrics[0];
        if (first && syncTime < first.time) {
          leadInDiff = first.time - syncTime;
          inLeadIn = true;
          nextPreview = first.text || '';
        } else if (activeIdx >= 0 && activeIdx < this.lyrics.length - 1) {
          const cur = this.lyrics[activeIdx];
          const nxt = this.lyrics[activeIdx + 1];
          const curEnd = cur.endTime || (cur.time + 3.2);
          if (nxt.time - curEnd >= 3.8 && syncTime > curEnd + 0.35 && syncTime < nxt.time) {
            inLeadIn = true;
            leadInDiff = nxt.time - syncTime;
            nextPreview = nxt.text || '';
          }
        }
      }

      const modeKey = !hasLyrics ? 'empty' : (inLeadIn ? 'leadin' : this.lyricStyle);
      const sig = `${trackKey}|${modeKey}|${activeIdx}|${this.showRomaji ? 1 : 0}`;

      if (sig !== this._lastLyricsSig) {
        this._lastLyricsSig = sig;
        this.lyricsEl.setAttribute('data-ambient-lyric', this.lyricStyle);

        if (!hasLyrics) {
          const tTitle = escapeHtml(this.track?.title || 'AuraSound Studio');
          const tArtist = escapeHtml(this.track?.artist || 'Ambient Mode');
          this.lyricsEl.innerHTML = `
            <div class="amb-empty-stage">
              <div class="amb-empty-eyebrow">AMBIENT STAGE</div>
              <div class="amb-empty-title">${tTitle}</div>
              <div class="amb-empty-artist">${tArtist}</div>
            </div>
          `;
          this._cachedLineWordEls = [];
          return;
        }

        if (inLeadIn) {
          const dotsHtml = leadInDiff <= 4.5
            ? `<div class="amb-leadin-dots"><span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span></div>`
            : `<div class="amb-leadin-eyebrow">INSTRUMENTAL</div>`;
          this.lyricsEl.innerHTML = `
            <div class="amb-leadin-stage">
              ${dotsHtml}
              ${nextPreview ? `<div class="amb-leadin-next">${escapeHtml(nextPreview)}</div>` : ''}
            </div>
          `;
          this._cachedLineWordEls = [];
          return;
        }

        // Build DOM for active Weyv lyric style
        this.buildLyricStyleDom(activeIdx, trackKey);
      }

      if (!hasLyrics || inLeadIn || activeIdx < 0) {
        if (inLeadIn && leadInDiff <= 4.5) {
          const d1 = this.lyricsEl.querySelector('.amb-leadin-dots .d1');
          const d2 = this.lyricsEl.querySelector('.amb-leadin-dots .d2');
          const d3 = this.lyricsEl.querySelector('.amb-leadin-dots .d3');
          if (d1 && d2 && d3) {
            d1.classList.toggle('lit', leadInDiff <= 3.0);
            d2.classList.toggle('lit', leadInDiff <= 2.0);
            d3.classList.toggle('lit', leadInDiff <= 1.0);
          }
        }
        return;
      }

      // Per-frame 60fps word sweep / pop / scatter updates (dirty-checked to prevent style flicker)
      const words = this.getLineWords(activeIdx);
      const wordState = this.findActiveWord(words, syncTime);
      const els = this._cachedLineWordEls;
      if (els && els.length) {
        for (let i = 0; i < els.length; i++) {
          const el = els[i];
          const isPassed = wordState.index >= 0 && (i < wordState.index || (i === wordState.index && wordState.inGap));
          const isActive = i === wordState.index && !wordState.inGap;
          const pct = isPassed ? 100 : (isActive ? Math.round(easeInOutSine(wordState.progress) * 100) : 0);

          if (el._ambPassed !== isPassed) {
            el._ambPassed = isPassed;
            el.classList.toggle('is-passed', isPassed);
          }
          if (el._ambActive !== isActive) {
            el._ambActive = isActive;
            el.classList.toggle('is-active', isActive);
          }
          if (el._ambPct !== pct) {
            el._ambPct = pct;
            el.style.setProperty('--wp', pct + '%');
          }
          if (this.lyricStyle === 'pop') {
            const popScale = (isActive
              ? (1 + Math.sin(Math.min(1, wordState.progress) * Math.PI) * 0.16)
              : (isPassed ? 1.02 : 0.96)).toFixed(3);
            if (el._ambPopScale !== popScale) {
              el._ambPopScale = popScale;
              el.style.setProperty('--pop-scale', popScale);
            }
          }
        }
      }

      if (this.lyricStyle === 'karaoke') {
        const progBar = this.lyricsEl.querySelector('.amb-karaoke-fill');
        if (progBar) {
          const totalPct = (words.length
            ? Math.min(100, Math.max(0, ((Math.max(0, wordState.index) + (wordState.index >= 0 ? wordState.progress : 0)) / words.length) * 100))
            : 0).toFixed(1);
          if (progBar._ambTotalPct !== totalPct) {
            progBar._ambTotalPct = totalPct;
            progBar.style.width = totalPct + '%';
          }
        }
      }
    }

    buildWordsHtml(words, trackKey, activeIdx) {
      const style = this.lyricStyle;
      const seedBase = hashString(`${trackKey}_${activeIdx}`);
      return words.map((w, i) => {
        const spaceCls = w.trailingSpace ? 'has-space' : '';
        const escaped = escapeHtml(w.text);
        if (style === 'karaoke') {
          return `<span class="amb-word amb-k-word ${spaceCls}"><span class="amb-k-base">${escaped}</span><span class="amb-k-fill" aria-hidden="true">${escaped}</span></span>`;
        }
        if (style === 'scatter') {
          const h1 = hashString(`${seedBase}_x_${i}`);
          const h2 = hashString(`${seedBase}_y_${i}`);
          const h3 = hashString(`${seedBase}_r_${i}`);
          const dx = ((h1 % 9) - 4);
          const dy = ((h2 % 20) - 10);
          const rot = ((h3 % 9) - 4) * 0.5;
          return `<span class="amb-word ${spaceCls}" style="--sx:${dx}px;--sy:${dy}px;--sr:${rot.toFixed(1)}deg;">${escaped}</span>`;
        }
        return `<span class="amb-word ${spaceCls}">${escaped}</span>`;
      }).join('');
    }

    buildLyricStyleDom(activeIdx, trackKey) {
      const lyrics = this.lyrics;
      const curLine = lyrics[activeIdx];
      if (!curLine) {
        this.lyricsEl.innerHTML = '';
        this._cachedLineWordEls = [];
        return;
      }

      const words = this.getLineWords(activeIdx);
      const activeHtml = this.buildWordsHtml(words, trackKey, activeIdx);
      const romajiHtml = (this.showRomaji && curLine.romaji)
        ? `<div class="amb-romaji-sub">${escapeHtml(curLine.romaji)}</div>`
        : '';

      const renderLineRef = (idx, role) => {
        if (idx < 0 || idx >= lyrics.length) return '';
        const l = lyrics[idx];
        return `<div class="amb-line-ref ${role}" data-seek="${Number(l.time) || 0}">${escapeHtml(l.text)}</div>`;
      };

      let html = '';
      if (this.lyricStyle === 'stack') {
        html = `
          <div class="amb-stack-wrap">
            ${renderLineRef(activeIdx - 1, 'is-prev')}
            <div class="amb-active-line amb-anim-stack" data-seek="${Number(curLine.time) || 0}">
              <div class="amb-active-words">${activeHtml}</div>
              ${romajiHtml}
            </div>
            ${renderLineRef(activeIdx + 1, 'is-next')}
            ${renderLineRef(activeIdx + 2, 'is-far')}
          </div>
        `;
      } else if (this.lyricStyle === 'rise') {
        html = `
          <div class="amb-rise-wrap">
            ${renderLineRef(activeIdx - 1, 'is-prev')}
            <div class="amb-active-line amb-anim-rise" data-seek="${Number(curLine.time) || 0}">
              <div class="amb-active-words">${activeHtml}</div>
              ${romajiHtml}
            </div>
            ${renderLineRef(activeIdx + 1, 'is-next')}
          </div>
        `;
      } else if (this.lyricStyle === 'pop') {
        html = `
          <div class="amb-pop-wrap">
            <div class="amb-active-line amb-anim-pop" data-seek="${Number(curLine.time) || 0}">
              <div class="amb-active-words">${activeHtml}</div>
              ${romajiHtml}
            </div>
            ${renderLineRef(activeIdx + 1, 'is-next')}
          </div>
        `;
      } else if (this.lyricStyle === 'karaoke') {
        html = `
          <div class="amb-karaoke-wrap">
            <div class="amb-active-line amb-anim-karaoke" data-seek="${Number(curLine.time) || 0}">
              <div class="amb-active-words">${activeHtml}</div>
              ${romajiHtml}
              <div class="amb-karaoke-track"><div class="amb-karaoke-fill"></div></div>
            </div>
            ${renderLineRef(activeIdx + 1, 'is-next')}
          </div>
        `;
      } else {
        // Scatter
        html = `
          <div class="amb-scatter-wrap">
            <div class="amb-active-line amb-anim-scatter" data-seek="${Number(curLine.time) || 0}">
              <div class="amb-active-words amb-scatter-words">${activeHtml}</div>
              ${romajiHtml}
            </div>
            ${renderLineRef(activeIdx + 1, 'is-next')}
          </div>
        `;
      }

      this.lyricsEl.innerHTML = html;
      this._cachedLineWordEls = Array.from(this.lyricsEl.querySelectorAll('.amb-active-words .amb-word'));

      // Bind click-to-seek on lines
      this.lyricsEl.querySelectorAll('[data-seek]').forEach(el => {
        el.addEventListener('click', () => {
          const t = parseFloat(el.getAttribute('data-seek'));
          if (Number.isFinite(t) && this.onSeek) {
            this.onSeek(t);
          }
        });
      });
    }

    /* ----------------------------------------------------------- desktop clock */

    renderClock() {
      if (!this.clockEl) return;
      const now = new Date();
      const sec = now.getSeconds();
      if (sec === this._lastClockSec) return;
      this._lastClockSec = sec;

      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(sec).padStart(2, '0');
      const dateStr = now.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'short'
      });

      this.clockEl.innerHTML = `
        <div class="amb-clock-time">${hh}:${mm}<span class="amb-clock-sec">:${ss}</span></div>
        <div class="amb-clock-date">${escapeHtml(dateStr)}</div>
      `;
    }
  }

  AmbientStageEngine.THEMES = THEMES;
  AmbientStageEngine.VIZ_STYLES = VIZ_STYLES;
  AmbientStageEngine.LYRIC_STYLES = LYRIC_STYLES;
  global.AmbientStageEngine = AmbientStageEngine;
})(window);

