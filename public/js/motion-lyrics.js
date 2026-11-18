/**
 * AuraSound Motion Lyrics Engine
 * Client-side word-by-word kinetic typography, motion scenes, and native UI lyric styles.
 * Zero extra network requests — consumes existing synced lyrics & carried-clock timing read-only.
 */
(function (global) {
  'use strict';

  const MOTION_STYLES = [
    { id: 'kinetic', label: 'Kinetic', renderer: 'dom' },
    { id: 'fisheye', label: 'Fisheye', renderer: 'dom' },
    { id: 'spotlight', label: 'Spotlight', renderer: 'dom' },
    { id: 'poster', label: 'Poster', renderer: 'dom' },
    { id: 'codestyle', label: 'Codestyle', renderer: 'dom' },
    { id: 'constellation', label: 'Constellation', renderer: 'canvas' },
    { id: 'branches', label: 'Branches', renderer: 'canvas' },
    { id: 'web', label: 'Web', renderer: 'canvas' },
    { id: 'wave', label: 'Wave', renderer: 'canvas' },
    { id: 'tuner', label: 'Tuner', renderer: 'canvas' },
    { id: 'messages', label: 'Messages', renderer: 'dom' },
    { id: 'notifications', label: 'Notifications', renderer: 'dom' },
    { id: 'payments', label: 'Payments', renderer: 'dom' },
    { id: 'search', label: 'Search', renderer: 'dom' },
    { id: 'map', label: 'Map', renderer: 'canvas' }
  ];

  const PALETTES = [
    { primary: '#38bdf8', secondary: '#818cf8', glow: 'rgba(56, 189, 248, 0.45)', rgb: '56, 189, 248' },
    { primary: '#fb7185', secondary: '#f472b6', glow: 'rgba(251, 113, 133, 0.45)', rgb: '251, 113, 133' },
    { primary: '#34d399', secondary: '#2dd4bf', glow: 'rgba(52, 211, 153, 0.45)', rgb: '52, 211, 153' },
    { primary: '#a78bfa', secondary: '#38bdf8', glow: 'rgba(167, 139, 250, 0.45)', rgb: '167, 139, 250' },
    { primary: '#fbbf24', secondary: '#fb923c', glow: 'rgba(251, 191, 36, 0.42)', rgb: '251, 191, 36' },
    { primary: '#60a5fa', secondary: '#22d3ee', glow: 'rgba(96, 165, 250, 0.45)', rgb: '96, 165, 250' }
  ];

  function hashString(str) {
    let h = 2166136261;
    const s = String(str || 'aurasound');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function easeOutCubic(x) {
    const t = Math.max(0, Math.min(1, x));
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutSine(x) {
    const t = Math.max(0, Math.min(1, x));
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  class MotionLyricsEngine {
    constructor(options = {}) {
      this.stageEl = options.stageEl || null;
      this.canvasEl = options.canvasEl || null;
      this.domEl = options.domEl || null;
      this.onSeek = typeof options.onSeek === 'function' ? options.onSeek : null;

      this.style = this.loadSavedStyle();
      this.palette = PALETTES[0];
      this.trackKey = '';
      this.trackMeta = { title: '', artist: '' };
      this.lyrics = [];
      this.showRomaji = true;

      this._wordCache = new WeakMap();
      this._romajiWordCache = new WeakMap();
      this._bgStars = [];
      this._lastRenderSignature = '';
      this._lastFisheyeWordIdx = -2;
      this._lastActiveIdx = -2;
      this._lastActiveWordIdx = -2;
      this._lastSyncedVisKey = '';
      this._cachedWordEls = null;
      this._cachedKineticWall = null;
      this._fisheyeRefs = null;
      this._currentWords = [];

      // Smooth damped interpolation state
      this._lastPerfNow = 0;
      this._wordGlows = [];
      this._wordBranchGrow = [];
      this._smoothLineProg = 0;
      this._wallRx = 0;
      this._wallRy = 0;
      this._camX = 0;
      this._camY = 0;
      this._dpr = Math.min(window.devicePixelRatio || 1, 2);
      this._canvasW = 0;
      this._canvasH = 0;

      this.initBgStars();
    }

    loadSavedStyle() {
      try {
        const saved = localStorage.getItem('aurasound_motion_style');
        if (saved && MOTION_STYLES.some(s => s.id === saved)) return saved;
      } catch (e) {}
      return 'kinetic';
    }

    setStyle(styleId) {
      if (!MOTION_STYLES.some(s => s.id === styleId)) return;
      this.style = styleId;
      try {
        localStorage.setItem('aurasound_motion_style', styleId);
      } catch (e) {}
      this._lastRenderSignature = '';
      this._lastFisheyeWordIdx = -2;
      this._lastSyncedVisKey = '';
      this._cachedWordEls = null;
      this._fisheyeRefs = null;
      this._tunerNeedleX = undefined;
      this.syncRendererVisibility(true);
    }

    getStyleConfig() {
      return MOTION_STYLES.find(s => s.id === this.style) || MOTION_STYLES[0];
    }

    setTrack(track, lyrics) {
      const key = track ? (track.id || track.videoId || track.title || '') : '';
      this.trackKey = key;
      this.trackMeta = {
        title: track?.title || 'AuraSound',
        artist: track?.artist || ''
      };
      this.lyrics = Array.isArray(lyrics) ? lyrics : [];
      this.palette = PALETTES[hashString(key || this.trackMeta.title) % PALETTES.length];
      if (this.stageEl) {
        this.stageEl.style.setProperty('--motion-primary', this.palette.primary);
        this.stageEl.style.setProperty('--motion-secondary', this.palette.secondary);
        this.stageEl.style.setProperty('--motion-glow', this.palette.glow);
        this.stageEl.style.setProperty('--motion-rgb', this.palette.rgb);
      }
      this._wordCache = new WeakMap();
      this._romajiWordCache = new WeakMap();
      this._lastRenderSignature = '';
      this._lastFisheyeWordIdx = -2;
      this._lastActiveIdx = -2;
      this._lastActiveWordIdx = -2;
      this._lastSyncedVisKey = '';
      this._cachedWordEls = null;
      this._fisheyeRefs = null;
      this._wordGlows = [];
      this._wordBranchGrow = [];
      this._smoothLineProg = 0;
      this._tunerNeedleX = undefined;
      this._camX = 0;
      this._camY = 0;
    }

    initBgStars() {
      this._bgStars = [];
      for (let i = 0; i < 48; i++) {
        this._bgStars.push({
          x: Math.random(),
          y: Math.random(),
          r: 0.6 + Math.random() * 1.4,
          phase: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 0.9
        });
      }
    }

    syncRendererVisibility(force = false) {
      const cfg = this.getStyleConfig();
      const visKey = `${cfg.renderer}|${this.style}|1`;
      if (!force && this._lastSyncedVisKey === visKey) return;
      this._lastSyncedVisKey = visKey;

      if (this.canvasEl) {
        this.canvasEl.style.display = cfg.renderer === 'canvas' ? 'block' : 'none';
      }
      if (this.domEl) {
        this.domEl.style.display = cfg.renderer === 'dom' ? 'flex' : 'none';
        this.domEl.setAttribute('data-motion-style', this.style);
      }
      if (cfg.renderer === 'canvas') {
        this.resizeCanvas();
      }
    }

    resizeCanvas() {
      if (!this.canvasEl || !this.stageEl) return;
      const rect = this.stageEl.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) return;
      this._dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.round(rect.width * this._dpr);
      const targetH = Math.round(rect.height * this._dpr);
      if (this.canvasEl.width !== targetW || this.canvasEl.height !== targetH) {
        this.canvasEl.width = targetW;
        this.canvasEl.height = targetH;
      }
      this._canvasW = rect.width;
      this._canvasH = rect.height;
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
            const begin = Number(w.begin);
            const safeBegin = Number.isFinite(begin) ? begin : line.time;
            let end = Number(w.end);
            if (!Number.isFinite(end) || end <= safeBegin) {
              const nextW = arr[idx + 1];
              end = nextW && Number.isFinite(Number(nextW.begin))
                ? Math.max(safeBegin + 0.08, Number(nextW.begin))
                : safeBegin + 0.28;
            }
            return {
              text: w.text,
              romaji: (typeof w.romaji === 'string' && w.romaji.trim()) ? w.romaji.trim() : '',
              begin: safeBegin,
              end: end,
              trailingSpace: w.trailingSpace !== false
            };
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
          const weight = Math.max(2, tok.length + 1);
          const slice = (weight / totalWeight) * totalDur;
          const wBegin = cursor;
          const wEnd = (i === tokens.length - 1) ? (start + totalDur) : (cursor + slice);
          cursor = wEnd;
          return {
            text: tok,
            romaji: '',
            begin: wBegin,
            end: Math.max(wBegin + 0.06, wEnd),
            trailingSpace: true
          };
        });
      }

      this._wordCache.set(line, words);
      return words;
    }

    getLineRomajiWords(lineIdx) {
      if (lineIdx < 0 || lineIdx >= this.lyrics.length) return [];
      const line = this.lyrics[lineIdx];
      if (!line || !line.romaji) return [];
      const cached = this._romajiWordCache.get(line);
      if (cached) return cached;

      let rWords = [];
      if (Array.isArray(line.romajiWords) && line.romajiWords.length > 0) {
        rWords = line.romajiWords
          .filter(w => w && typeof w.text === 'string' && w.text.length > 0)
          .map((w, idx, arr) => {
            const begin = Number(w.begin);
            const safeBegin = Number.isFinite(begin) ? begin : line.time;
            let end = Number(w.end);
            if (!Number.isFinite(end) || end <= safeBegin) {
              const nextW = arr[idx + 1];
              end = nextW && Number.isFinite(Number(nextW.begin))
                ? Math.max(safeBegin + 0.08, Number(nextW.begin))
                : safeBegin + 0.28;
            }
            return {
              text: w.text,
              begin: safeBegin,
              end: end,
              trailingSpace: w.trailingSpace !== false
            };
          });
      } else if (Array.isArray(line.words) && line.words.some(w => w && w.romaji)) {
        rWords = line.words
          .filter(w => w && (w.romaji || w.text))
          .map(w => ({
            text: (w.romaji || w.text || '').trim(),
            begin: Number(w.begin) || line.time,
            end: Number(w.end) || ((Number(w.begin) || line.time) + 0.25),
            trailingSpace: w.trailingSpace !== false
          }));
      }

      if (rWords.length === 0) {
        const tokens = String(line.romaji).trim().split(/\s+/).filter(Boolean);
        const nextLine = this.lyrics[lineIdx + 1];
        const start = Number(line.time) || 0;
        const rawEnd = line.endTime !== undefined
          ? Number(line.endTime)
          : (nextLine ? Number(nextLine.time) - 0.12 : start + 4.0);
        const totalDur = Math.max(0.65, Math.min(8.5, rawEnd - start));
        const totalWeight = tokens.reduce((acc, t) => acc + Math.max(2, t.length + 1), 0) || 1;
        let cursor = start;

        rWords = tokens.map((tok, i) => {
          const weight = Math.max(2, tok.length + 1);
          const slice = (weight / totalWeight) * totalDur;
          const wBegin = cursor;
          const wEnd = (i === tokens.length - 1) ? (start + totalDur) : (cursor + slice);
          cursor = wEnd;
          return {
            text: tok,
            begin: wBegin,
            end: Math.max(wBegin + 0.06, wEnd),
            trailingSpace: true
          };
        });
      }

      this._romajiWordCache.set(line, rWords);
      return rWords;
    }

    findActiveWord(words, syncTime) {
      if (!words || words.length === 0) return { index: -1, progress: 0 };
      let activeIdx = -1;
      let low = 0;
      let high = words.length - 1;

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
        const progress = Math.min(1, Math.max(0, (syncTime - w.begin) / dur));
        return { index: activeIdx, progress };
      }

      if (syncTime < words[0].begin) {
        return { index: -1, progress: 0 };
      }
      for (let i = words.length - 1; i >= 0; i--) {
        if (syncTime >= words[i].end) {
          return { index: i, progress: 1, inGap: true };
        }
      }
      return { index: -1, progress: 0 };
    }

    updateSmoothWordStates(activeIdx, words, wordState, dt) {
      if (activeIdx !== this._lastActiveIdx || this._wordGlows.length !== words.length) {
        this._wordGlows = new Array(words.length).fill(0);
        this._wordBranchGrow = new Array(words.length).fill(0);
        this._smoothLineProg = 0;
      }

      const rate = Math.min(1, dt * 14);
      const branchRate = Math.min(1, dt * 11);
      const activeW = wordState.index;

      for (let i = 0; i < words.length; i++) {
        let targetGlow = 0;
        let targetBranch = 0;
        if (activeW >= 0) {
          if (i < activeW) {
            targetGlow = 0.72;
            targetBranch = 1.0;
          } else if (i === activeW) {
            targetGlow = 0.35 + 0.65 * easeOutCubic(wordState.progress);
            targetBranch = 0.25 + 0.75 * easeOutCubic(wordState.progress);
          }
        }
        this._wordGlows[i] += (targetGlow - this._wordGlows[i]) * rate;
        this._wordBranchGrow[i] += (targetBranch - this._wordBranchGrow[i]) * branchRate;
      }

      const rawLineProg = activeW < 0
        ? 0
        : Math.min(1, (activeW + easeInOutSine(wordState.progress)) / Math.max(1, words.length));
      this._smoothLineProg += (rawLineProg - this._smoothLineProg) * Math.min(1, dt * 10);
    }

    render(syncTime, activeIdx, options = {}) {
      if (!this.stageEl) return;
      try {
        const nowPerf = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const dt = this._lastPerfNow ? Math.min(0.1, Math.max(0.004, (nowPerf - this._lastPerfNow) / 1000)) : 0.016;
        this._lastPerfNow = nowPerf;

        if (options.showRomaji !== undefined) {
          this.showRomaji = Boolean(options.showRomaji);
        }

        if (!this.lyrics || this.lyrics.length === 0) {
          this.renderEmptyState();
          return;
        }

        const cfg = this.getStyleConfig();
        this.syncRendererVisibility();

        const words = activeIdx >= 0 ? this.getLineWords(activeIdx) : [];
        const wordState = activeIdx >= 0 ? this.findActiveWord(words, syncTime) : { index: -1, progress: 0 };

        this.updateSmoothWordStates(activeIdx, words, wordState, dt);

        if (cfg.renderer === 'canvas') {
          this.renderCanvasScene(syncTime, activeIdx, words, wordState, dt);
        } else {
          this.renderDomStyle(syncTime, activeIdx, words, wordState, dt);
        }

        this._lastActiveIdx = activeIdx;
        this._lastActiveWordIdx = wordState.index;
      } catch (err) {
        console.warn('[MotionLyrics] Render error:', err);
      }
    }

    renderEmptyState() {
      this._lastSyncedVisKey = 'empty';
      this._cachedWordEls = null;
      if (this.canvasEl) this.canvasEl.style.display = 'none';
      if (this.domEl) {
        this.domEl.style.display = 'flex';
        this.domEl.setAttribute('data-motion-style', 'empty');
        if (this._lastRenderSignature !== 'empty_' + this.trackKey) {
          this._lastRenderSignature = 'empty_' + this.trackKey;
          this.domEl.innerHTML = `
            <div class="motion-empty-state">
              <div class="motion-empty-title">${escapeHtml(this.trackMeta.title || 'AuraSound')}</div>
              <div class="motion-empty-sub">Menunggu lirik tersinkronisasi untuk lagu ini</div>
            </div>
          `;
        }
      }
    }

    // =========================================================================
    // DOM RENDERERS (Kinetic, Fisheye, Spotlight, Codestyle, Messages, Notif, Payments)
    // =========================================================================
    renderDomStyle(syncTime, activeIdx, words, wordState, dt) {
      if (!this.domEl) return;
      const sig = `${this.style}|${this.trackKey}|${activeIdx}|${this.showRomaji ? 1 : 0}`;

      if (this.style === 'fisheye') {
        this.renderFisheye(syncTime, activeIdx, words, wordState, dt);
        return;
      }

      if (sig !== this._lastRenderSignature) {
        this._lastRenderSignature = sig;
        this._currentWords = words;
        this.buildDomForLine(activeIdx, words, syncTime);
        this._cachedWordEls = this.domEl.querySelectorAll('.motion-word');
        this._cachedRomajiEls = this.domEl.querySelectorAll('.motion-romaji-word');
        this._cachedKineticWall = (this.style === 'kinetic') ? this.domEl.querySelector('#motion-kinetic-wall') : null;
        this._lastDomWordIdx = -99;
        this._lastDomRomajiIdx = -99;
      }

      this.updateDomWordProgress(syncTime, activeIdx, words, wordState, dt);
    }

    buildWordsMarkup(words, extraClass = '') {
      if (!words || words.length === 0) return '';
      return words.map((w, i) => {
        const space = w.trailingSpace ? ' has-space' : '';
        return `<span class="motion-word ${extraClass}${space}" data-widx="${i}" style="--wp:0%">${escapeHtml(w.text)}</span>`;
      }).join('');
    }

    buildRomajiWordsMarkup(lineIdx, extraClass = '') {
      const rWords = this.getLineRomajiWords(lineIdx);
      if (!rWords || rWords.length === 0) {
        const line = this.lyrics[lineIdx];
        return line && line.romaji ? escapeHtml(line.romaji) : '';
      }
      return rWords.map((w, i) => {
        const space = w.trailingSpace ? ' has-space' : '';
        return `<span class="motion-romaji-word ${extraClass}${space}" data-rwidx="${i}" style="--wp:0%">${escapeHtml(w.text)}</span>`;
      }).join('');
    }

    buildDomForLine(activeIdx, words, syncTime) {
      const line = activeIdx >= 0 ? this.lyrics[activeIdx] : null;
      const prevLine = activeIdx > 0 ? this.lyrics[activeIdx - 1] : null;
      const nextLine = (activeIdx >= 0 && activeIdx + 1 < this.lyrics.length) ? this.lyrics[activeIdx + 1] : (activeIdx === -1 && this.lyrics[0] ? this.lyrics[0] : null);
      const romajiHtml = (this.showRomaji && line && line.romaji)
        ? `<div class="motion-romaji-sub">${this.buildRomajiWordsMarkup(activeIdx)}</div>`
        : '';

      if (this.style === 'kinetic') {
        if (!line) {
          this.domEl.innerHTML = `
            <div class="motion-kinetic-stage motion-wait-stage motion-smooth-enter">
              <div class="motion-wait-label">${escapeHtml(this.trackMeta.title)}</div>
              <div class="motion-wait-pulse"><span></span><span></span><span></span></div>
              ${nextLine ? `<div class="motion-wait-next">${escapeHtml(nextLine.text)}</div>` : ''}
            </div>
          `;
          return;
        }
        this.domEl.innerHTML = `
          <div class="motion-kinetic-stage motion-smooth-enter">
            <div class="motion-kinetic-wall" id="motion-kinetic-wall">
              <div class="motion-kinetic-line">${this.buildWordsMarkup(words, 'motion-kinetic-word')}</div>
              ${romajiHtml}
            </div>
          </div>
        `;
        return;
      }

      if (this.style === 'spotlight') {
        if (!line) {
          this.domEl.innerHTML = `
            <div class="motion-spotlight-stage motion-smooth-enter">
              <div class="motion-spot-dim">${escapeHtml(this.trackMeta.artist || 'AuraSound')}</div>
              <div class="motion-spot-main is-waiting">${escapeHtml(this.trackMeta.title)}</div>
              ${nextLine ? `<div class="motion-spot-dim">${escapeHtml(nextLine.text)}</div>` : ''}
            </div>
          `;
          return;
        }
        this.domEl.innerHTML = `
          <div class="motion-spotlight-stage">
            <div class="motion-spot-dim motion-spot-prev">${prevLine ? escapeHtml(prevLine.text) : '&nbsp;'}</div>
            <div class="motion-spot-main motion-smooth-enter">
              <div class="motion-spot-words">${this.buildWordsMarkup(words, 'motion-spot-word')}</div>
              ${romajiHtml}
            </div>
            <div class="motion-spot-dim motion-spot-next">${nextLine ? escapeHtml(nextLine.text) : '&nbsp;'}</div>
          </div>
        `;
        return;
      }

      if (this.style === 'codestyle') {
        const lineNum = activeIdx >= 0 ? activeIdx + 1 : 0;
        const pad = (n) => String(Math.max(1, n)).padStart(2, '0');
        const prevText = prevLine ? prevLine.text : '// ' + (this.trackMeta.title || 'audio.stream');
        const nextText = nextLine ? nextLine.text : 'await nextPhrase();';
        if (!line) {
          this.domEl.innerHTML = `
            <div class="motion-code-window">
              <div class="motion-code-topbar">
                <span class="mc-dots"><i></i><i></i><i></i></span>
                <span class="mc-filename">lyrics.ts</span>
                <span class="mc-meta">UTF-8</span>
              </div>
              <div class="motion-code-body">
                <div class="mc-row mc-muted"><span class="mc-ln">01</span><span class="mc-comment">// ${escapeHtml(this.trackMeta.title)} — ${escapeHtml(this.trackMeta.artist)}</span></div>
                <div class="mc-row mc-active"><span class="mc-ln">02</span><span class="mc-code-expr motion-smooth-enter"><span class="mc-kw">await</span> <span class="mc-fn">vocals</span>.<span class="mc-prop">enter</span>();<span class="mc-cursor"></span></span></div>
                <div class="mc-row mc-muted"><span class="mc-ln">03</span><span class="mc-comment">// next: ${escapeHtml(nextLine ? nextLine.text : 'ready')}</span></div>
              </div>
            </div>
          `;
          return;
        }
        this.domEl.innerHTML = `
          <div class="motion-code-window">
            <div class="motion-code-topbar">
              <span class="mc-dots"><i></i><i></i><i></i></span>
              <span class="mc-filename">lyrics.ts</span>
              <span class="mc-meta">Ln ${lineNum}</span>
            </div>
            <div class="motion-code-body">
              <div class="mc-row mc-muted"><span class="mc-ln">${pad(lineNum - 1)}</span><span class="mc-comment">// ${escapeHtml(prevText)}</span></div>
              <div class="mc-row mc-active">
                <span class="mc-ln">${pad(lineNum)}</span>
                <span class="mc-code-expr motion-smooth-enter"><span class="mc-kw">const</span> <span class="mc-var">verse_${pad(lineNum)}</span> <span class="mc-op">=</span> <span class="mc-quote">"</span><span class="mc-word-stream">${this.buildWordsMarkup(words, 'mc-word')}</span><span class="mc-cursor"></span><span class="mc-quote">"</span>;</span>
              </div>
              ${romajiHtml ? `<div class="mc-row mc-romaji-row"><span class="mc-ln">  </span><span class="mc-comment">// ${escapeHtml(line.romaji)}</span></div>` : ''}
              <div class="mc-row mc-muted"><span class="mc-ln">${pad(lineNum + 1)}</span><span class="mc-comment">// ${escapeHtml(nextText)}</span></div>
            </div>
          </div>
        `;
        return;
      }

      if (this.style === 'messages') {
        const startIdx = Math.max(0, (activeIdx >= 0 ? activeIdx : 0) - 2);
        const endIdx = activeIdx >= 0 ? activeIdx : -1;
        let threadHtml = '';

        for (let i = startIdx; i <= endIdx; i++) {
          const item = this.lyrics[i];
          const isCurrent = i === activeIdx;
          const isOutgoing = (i % 2 === 1);
          const sideCls = isOutgoing ? 'is-out' : 'is-in';
          const content = isCurrent
            ? this.buildWordsMarkup(words, 'msg-word')
            : escapeHtml(item.text);
          const subRomaji = (this.showRomaji && item.romaji)
            ? `<div class="msg-romaji">${isCurrent ? this.buildRomajiWordsMarkup(i) : escapeHtml(item.romaji)}</div>`
            : '';

          threadHtml += `
            <div class="msg-row ${sideCls} ${isCurrent ? 'is-current' : 'is-past'}" data-seek-time="${item.time}">
              <div class="msg-bubble">
                <div class="msg-text">${content}</div>
                ${subRomaji}
              </div>
            </div>
          `;
        }

        if (activeIdx < 0) {
          threadHtml = `
            <div class="msg-row is-in is-current">
              <div class="msg-bubble msg-typing">
                <span></span><span></span><span></span>
              </div>
            </div>
          `;
        }

        this.domEl.innerHTML = `
          <div class="motion-messages-wrap">
            <div class="msg-header">
              <span class="msg-contact">${escapeHtml(this.trackMeta.artist || 'Now Playing')}</span>
              <span class="msg-sub">${escapeHtml(this.trackMeta.title)}</span>
            </div>
            <div class="msg-thread">${threadHtml}</div>
          </div>
        `;
        this.bindSeekClicks();
        return;
      }

      if (this.style === 'notifications') {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const items = [];
        if (activeIdx >= 0) {
          for (let i = activeIdx; i >= Math.max(0, activeIdx - 2); i--) {
            items.push({ idx: i, item: this.lyrics[i], isTop: i === activeIdx });
          }
        }
        const cardsHtml = items.length > 0
          ? items.map((entry, stackIdx) => {
            const content = entry.isTop
              ? this.buildWordsMarkup(words, 'notif-word')
              : escapeHtml(entry.item.text);
            const subR = (this.showRomaji && entry.item.romaji)
              ? `<div class="notif-romaji">${entry.isTop ? this.buildRomajiWordsMarkup(entry.idx) : escapeHtml(entry.item.romaji)}</div>`
              : '';
            return `
              <div class="notif-card depth-${stackIdx} ${entry.isTop ? 'is-top' : ''}" data-seek-time="${entry.item.time}">
                <div class="notif-card-top">
                  <span class="notif-app">${escapeHtml(this.trackMeta.title)}</span>
                  <span class="notif-time">${entry.isTop ? 'now' : formatTime(entry.item.time)}</span>
                </div>
                <div class="notif-card-body">${content}</div>
                ${subR}
              </div>
            `;
          }).join('')
          : `
            <div class="notif-card depth-0 is-top">
              <div class="notif-card-top">
                <span class="notif-app">${escapeHtml(this.trackMeta.title)}</span>
                <span class="notif-time">now</span>
              </div>
              <div class="notif-card-body is-muted">${escapeHtml(this.trackMeta.artist || 'Listening...')}</div>
            </div>
          `;

        this.domEl.innerHTML = `
          <div class="motion-notif-wrap">
            <div class="notif-clock">${hh}:${mm}</div>
            <div class="notif-date">${escapeHtml(this.trackMeta.artist || 'AuraSound')}</div>
            <div class="notif-stack">${cardsHtml}</div>
          </div>
        `;
        this.bindSeekClicks();
        return;
      }

      if (this.style === 'payments') {
        const rows = [];
        if (activeIdx >= 0) {
          for (let i = activeIdx; i >= Math.max(0, activeIdx - 2); i--) {
            rows.push({ idx: i, item: this.lyrics[i], isTop: i === activeIdx });
          }
        }

        const feedHtml = rows.length > 0
          ? rows.map((entry, pos) => {
            const content = entry.isTop
              ? this.buildWordsMarkup(words, 'pay-word')
              : escapeHtml(entry.item.text);
            const subRomaji = (this.showRomaji && entry.item.romaji)
              ? `<div class="pay-row-romaji">${entry.isTop ? this.buildRomajiWordsMarkup(entry.idx) : escapeHtml(entry.item.romaji)}</div>`
              : '';
            const amt = ((entry.idx + 1) * 1.25).toFixed(2);
            return `
              <div class="pay-row pos-${pos} ${entry.isTop ? 'is-top' : ''}" data-seek-time="${entry.item.time}">
                <div class="pay-row-main">
                  <div class="pay-row-title">${content}</div>
                  ${subRomaji}
                  <div class="pay-row-meta">${escapeHtml(this.trackMeta.artist || 'Track')} • ${formatTime(entry.item.time)}</div>
                </div>
                <div class="pay-row-amount">+$${amt}</div>
              </div>
            `;
          }).join('')
          : `
            <div class="pay-row pos-0 is-top">
              <div class="pay-row-main">
                <div class="pay-row-title">${escapeHtml(this.trackMeta.title)}</div>
                <div class="pay-row-meta">Waiting for next lyric</div>
              </div>
              <div class="pay-row-amount">LIVE</div>
            </div>
          `;

        this.domEl.innerHTML = `
          <div class="motion-pay-wrap">
            <div class="pay-header">
              <span class="pay-label">Activity</span>
              <span class="pay-total">${formatTime(syncTime)}</span>
            </div>
            <div class="pay-list">${feedHtml}</div>
          </div>
        `;
        this.bindSeekClicks();
        return;
      }

      if (this.style === 'poster') {
        const lineNum = activeIdx >= 0 ? String(activeIdx + 1).padStart(2, '0') : '--';
        const totalLines = String(this.lyrics.length).padStart(2, '0');
        if (!line) {
          this.domEl.innerHTML = `
            <div class="motion-poster-sheet">
              <div class="poster-meta-top">
                <span>${escapeHtml(this.trackMeta.artist || 'AURASOUND')}</span>
                <span>00 / ${totalLines}</span>
              </div>
              <div class="poster-rule"></div>
              <div class="poster-hero-wait motion-smooth-enter">${escapeHtml(this.trackMeta.title)}</div>
              <div class="poster-rule"></div>
              <div class="poster-meta-bot">LIVE EDITION</div>
            </div>
          `;
          return;
        }

        // Partition words into contrasting typographic poster tiers (hero vs tight sub-tier)
        const tiers = [];
        let cursor = 0;
        let tierIdx = 0;
        while (cursor < words.length) {
          const remaining = words.length - cursor;
          const take = tierIdx % 2 === 0 ? Math.min(remaining, 2) : Math.min(remaining, 3);
          const sliceHtml = words.slice(cursor, cursor + take).map((w, j) => {
            const wIndex = cursor + j;
            const space = w.trailingSpace ? ' has-space' : '';
            return `<span class="motion-word poster-word${space}" data-widx="${wIndex}" style="--wp:0%">${escapeHtml(w.text)}</span>`;
          }).join('');
          const cls = (tierIdx % 2 === 0) ? 'poster-tier is-hero' : 'poster-tier is-editorial';
          tiers.push(`<div class="${cls}">${sliceHtml}</div>`);
          cursor += take;
          tierIdx++;
        }

        this.domEl.innerHTML = `
          <div class="motion-poster-sheet">
            <div class="poster-meta-top">
              <span>${escapeHtml(this.trackMeta.artist || 'AURASOUND')}</span>
              <span>${lineNum} / ${totalLines}</span>
            </div>
            <div class="poster-rule"></div>
            <div class="poster-tiers motion-smooth-enter">${tiers.join('')}</div>
            ${romajiHtml ? `<div class="poster-romaji">${this.buildRomajiWordsMarkup(activeIdx)}</div>` : ''}
            <div class="poster-rule"></div>
            <div class="poster-meta-bot">
              <span>${escapeHtml(this.trackMeta.title)}</span>
              <span>${formatTime(line.time)}</span>
            </div>
          </div>
        `;
        return;
      }

      if (this.style === 'search') {
        const suggestions = [];
        const startNext = activeIdx >= 0 ? activeIdx + 1 : 0;
        for (let i = startNext; i < Math.min(this.lyrics.length, startNext + 3); i++) {
          suggestions.push(this.lyrics[i]);
        }

        const queryHtml = line
          ? `<span class="search-query-words">${this.buildWordsMarkup(words, 'search-word')}</span><span class="search-caret"></span>`
          : `<span class="search-placeholder">${escapeHtml(this.trackMeta.title)} — ${escapeHtml(this.trackMeta.artist || 'Ready')}</span><span class="search-caret"></span>`;

        const romajiLine = (this.showRomaji && line && line.romaji)
          ? `<div class="search-romaji">${this.buildRomajiWordsMarkup(activeIdx)}</div>`
          : '';

        const suggHtml = suggestions.length > 0
          ? suggestions.map(sItem => `
              <div class="search-sugg-row" data-seek-time="${sItem.time}">
                <span class="search-sugg-text">${escapeHtml(sItem.text)}</span>
                <span class="search-sugg-time">${formatTime(sItem.time)}</span>
              </div>
            `).join('')
          : `<div class="search-sugg-row is-end"><span class="search-sugg-text">${escapeHtml(this.trackMeta.title)}</span><span class="search-sugg-time">End</span></div>`;

        this.domEl.innerHTML = `
          <div class="motion-search-wrap">
            <div class="search-box">
              <div class="search-top-label">${escapeHtml(this.trackMeta.artist || 'Search')} • ${formatTime(syncTime)}</div>
              <div class="search-input-line motion-smooth-enter">${queryHtml}</div>
              ${romajiLine}
            </div>
            <div class="search-sugg-list">${suggHtml}</div>
          </div>
        `;
        this.bindSeekClicks();
      }
    }

    renderFisheye(syncTime, activeIdx, words, wordState, dt) {
      if (!this.domEl) return;
      const line = activeIdx >= 0 ? this.lyrics[activeIdx] : null;
      const baseSig = `fisheye_shell|${this.trackKey}`;

      if (this._lastRenderSignature !== baseSig || !this._fisheyeRefs) {
        this._lastRenderSignature = baseSig;
        this._lastFisheyeWordIdx = -2;
        this.domEl.innerHTML = `
          <div class="motion-fisheye-stage">
            <div class="fe-lens-ring"></div>
            <div class="fe-stack">
              <div class="fe-word fe-prev"></div>
              <div class="fe-word fe-center"></div>
              <div class="fe-word fe-next"></div>
            </div>
            <div class="fe-romaji"></div>
            <div class="fe-context"></div>
          </div>
        `;
        this._fisheyeRefs = {
          prev: this.domEl.querySelector('.fe-prev'),
          center: this.domEl.querySelector('.fe-center'),
          next: this.domEl.querySelector('.fe-next'),
          romaji: this.domEl.querySelector('.fe-romaji'),
          context: this.domEl.querySelector('.fe-context'),
          ring: this.domEl.querySelector('.fe-lens-ring')
        };
      }

      const refs = this._fisheyeRefs;
      if (!line || words.length === 0) {
        if (this._lastFisheyeWordIdx !== -1) {
          this._lastFisheyeWordIdx = -1;
          refs.prev.textContent = '';
          refs.center.textContent = this.trackMeta.title || 'AuraSound';
          refs.center.classList.add('is-waiting');
          refs.next.textContent = '';
          refs.romaji.textContent = '';
          refs.context.textContent = this.trackMeta.artist || '';
        }
        return;
      }

      refs.center.classList.remove('is-waiting');
      const wIdx = wordState.index >= 0 ? wordState.index : 0;
      const wordKey = `${activeIdx}_${wIdx}_${this.showRomaji ? 1 : 0}`;

      if (this._lastFisheyeWordKey !== wordKey) {
        this._lastFisheyeWordKey = wordKey;
        const prevW = wIdx > 0 ? words[wIdx - 1].text : '\u00A0';
        const curW = words[wIdx] ? words[wIdx].text : '\u00A0';
        const nextW = (wIdx + 1 < words.length) ? words[wIdx + 1].text : '\u00A0';

        refs.prev.textContent = prevW;
        refs.center.textContent = curW;
        refs.next.textContent = nextW;
        refs.romaji.textContent = (this.showRomaji && line.romaji) ? line.romaji : '';
        refs.context.textContent = line.text || '';

        // Smooth optical spring glide on word change
        if (typeof refs.center.animate === 'function') {
          try {
            if (this._feCenterAnim) {
              try { this._feCenterAnim.cancel(); } catch (e) {}
            }
            if (this._fePrevAnim) {
              try { this._fePrevAnim.cancel(); } catch (e) {}
            }
            this._feCenterAnim = refs.center.animate(
              [
                { transform: 'translate3d(0, 12px, 0) scale(0.88)', opacity: 0.4 },
                { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 }
              ],
              { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
            );
            this._fePrevAnim = refs.prev.animate(
              [
                { transform: 'translate3d(0, 8px, 0) scale(1.04)', opacity: 0.5 },
                { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 0.28 }
              ],
              { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
            );
          } catch (e) {}
        }
      }

      const p = wordState.index >= 0 ? easeInOutSine(wordState.progress) : 0;
      const ringScale = 1.0 + Math.sin(p * Math.PI) * 0.06;
      if (refs.ring) {
        refs.ring.style.transform = `scale3d(${ringScale.toFixed(3)}, ${ringScale.toFixed(3)}, 1)`;
      }
    }

    updateDomWordProgress(syncTime, activeIdx, words, wordState, dt) {
      if (!this.domEl) return;

      // Smooth damped 3D drift for Kinetic mode on desktop
      if (this.style === 'kinetic' && this._cachedKineticWall && window.innerWidth > 768) {
        const targetRx = Math.sin(syncTime * 0.65) * 4.2;
        const targetRy = Math.cos(syncTime * 0.5) * 6.5;
        const lerpRate = Math.min(1, (dt || 0.016) * 8);
        this._wallRx += (targetRx - this._wallRx) * lerpRate;
        this._wallRy += (targetRy - this._wallRy) * lerpRate;
        this._cachedKineticWall.style.transform = `perspective(950px) rotateX(${this._wallRx.toFixed(2)}deg) rotateY(${this._wallRy.toFixed(2)}deg)`;
      }

      const wordEls = this._cachedWordEls;
      if (!wordEls || wordEls.length === 0) return;

      const wIdx = wordState.index;
      const pctFloat = (wordState.progress * 100).toFixed(1);

      if (wIdx !== this._lastDomWordIdx) {
        this._lastDomWordIdx = wIdx;
        for (let i = 0; i < wordEls.length; i++) {
          const el = wordEls[i];
          if (wIdx < 0) {
            el.classList.remove('is-active', 'is-passed');
            el.style.setProperty('--wp', '0%');
          } else if (i < wIdx) {
            el.classList.add('is-passed');
            el.classList.remove('is-active');
            el.style.setProperty('--wp', '100%');
          } else if (i === wIdx) {
            el.classList.add('is-active');
            el.classList.remove('is-passed');
            el.style.setProperty('--wp', `${pctFloat}%`);
          } else {
            el.classList.remove('is-active', 'is-passed');
            el.style.setProperty('--wp', '0%');
          }
        }
      } else if (wIdx >= 0 && wIdx < wordEls.length) {
        wordEls[wIdx].style.setProperty('--wp', `${pctFloat}%`);
      }

      // Sync Romaji word highlights independently if present
      const romajiEls = this._cachedRomajiEls;
      if (romajiEls && romajiEls.length > 0 && activeIdx >= 0) {
        const rWords = this.getLineRomajiWords(activeIdx);
        const rState = this.findActiveWord(rWords, syncTime);
        const rIdx = rState.index;
        const rPct = (rState.progress * 100).toFixed(1);

        if (rIdx !== this._lastDomRomajiIdx) {
          this._lastDomRomajiIdx = rIdx;
          for (let i = 0; i < romajiEls.length; i++) {
            const el = romajiEls[i];
            if (rIdx < 0) {
              el.classList.remove('is-active', 'is-passed');
              el.style.setProperty('--wp', '0%');
            } else if (i < rIdx) {
              el.classList.add('is-passed');
              el.classList.remove('is-active');
              el.style.setProperty('--wp', '100%');
            } else if (i === rIdx) {
              el.classList.add('is-active');
              el.classList.remove('is-passed');
              el.style.setProperty('--wp', `${rPct}%`);
            } else {
              el.classList.remove('is-active', 'is-passed');
              el.style.setProperty('--wp', '0%');
            }
          }
        } else if (rIdx >= 0 && rIdx < romajiEls.length) {
          romajiEls[rIdx].style.setProperty('--wp', `${rPct}%`);
        }
      }
    }

    bindSeekClicks() {
      if (!this.domEl || !this.onSeek) return;
      this.domEl.querySelectorAll('[data-seek-time]').forEach(el => {
        el.addEventListener('click', () => {
          const t = parseFloat(el.getAttribute('data-seek-time'));
          if (!isNaN(t)) this.onSeek(t);
        });
      });
    }

    // =========================================================================
    // CANVAS RENDERERS (Constellation, Branches, Web, Map)
    // =========================================================================
    renderCanvasScene(syncTime, activeIdx, words, wordState, dt) {
      if (!this.canvasEl) return;
      if (this._canvasW < 20 || this._canvasH < 20) {
        this.resizeCanvas();
      }
      const ctx = this.canvasEl.getContext('2d');
      if (!ctx || this._canvasW < 20 || this._canvasH < 20) return;

      ctx.save();
      ctx.scale(this._dpr, this._dpr);
      ctx.clearRect(0, 0, this._canvasW, this._canvasH);

      if (this.style === 'constellation') {
        this.drawConstellation(ctx, syncTime, activeIdx, words, wordState, dt);
      } else if (this.style === 'branches') {
        this.drawBranches(ctx, syncTime, activeIdx, words, wordState, dt);
      } else if (this.style === 'web') {
        this.drawWeb(ctx, syncTime, activeIdx, words, wordState, dt);
      } else if (this.style === 'wave') {
        this.drawWaveRibbon(ctx, syncTime, activeIdx, words, wordState, dt);
      } else if (this.style === 'tuner') {
        this.drawTunerDial(ctx, syncTime, activeIdx, words, wordState, dt);
      } else if (this.style === 'map') {
        this.drawCityMap(ctx, syncTime, activeIdx, words, wordState, dt);
      }

      ctx.restore();
    }

    drawConstellation(ctx, syncTime, activeIdx, words, wordState) {
      const w = this._canvasW;
      const h = this._canvasH;
      const rgb = this.palette.rgb;

      for (const s of this._bgStars) {
        const alpha = 0.14 + 0.26 * (0.5 + 0.5 * Math.sin(syncTime * s.speed + s.phase));
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (activeIdx < 0 || words.length === 0) {
        this.drawCanvasWaitLabel(ctx, w, h, this.trackMeta.title, this.trackMeta.artist);
        return;
      }

      const padX = Math.max(46, w * 0.11);
      const padY = Math.max(46, h * 0.18);
      const usableW = Math.max(60, w - padX * 2);
      const usableH = Math.max(60, h - padY * 2);
      const count = words.length;
      const seed = hashString(`${this.trackKey}_${activeIdx}`);

      const nodes = words.map((word, i) => {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const jitterX = (((seed >> (i % 16)) & 7) - 3.5) * 0.015;
        const waveY = Math.sin(i * 1.45 + (seed % 7)) * 0.34 + 0.5;
        return {
          x: padX + (t + jitterX) * usableW,
          y: padY + Math.max(0.1, Math.min(0.9, waveY)) * usableH,
          text: word.text
        };
      });

      const activeW = wordState.index;
      const smoothProg = easeInOutSine(wordState.progress);

      ctx.lineWidth = 1.6;
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        if (i < activeW) {
          ctx.strokeStyle = `rgba(${rgb}, 0.75)`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        } else if (i === activeW) {
          const px = a.x + (b.x - a.x) * smoothProg;
          const py = a.y + (b.y - a.y) * smoothProg;
          ctx.strokeStyle = `rgba(${rgb}, 0.92)`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
      }

      const fontSize = Math.max(12, Math.min(20, Math.round(w / 29)));
      const romajiSubSize = Math.max(10, Math.round(fontSize * 0.64));
      const rWords = this.showRomaji ? this.getLineRomajiWords(activeIdx) : [];
      const hasPerWordRomaji = this.showRomaji && (
        words.some(wd => Boolean(wd.romaji)) || (rWords.length === words.length && rWords.length > 0)
      );
      ctx.textAlign = 'center';

      nodes.forEach((n, i) => {
        const glow = this._wordGlows[i] || 0;
        const r = 2.6 + glow * 3.8;

        if (glow > 0.05) {
          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4.5);
          grad.addColorStop(0, `rgba(${rgb}, ${(glow * 0.65).toFixed(3)})`);
          grad.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 4.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = `rgba(255, 255, 255, ${(0.25 + glow * 0.75).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();

        const wordRomaji = hasPerWordRomaji ? (words[i].romaji || (rWords[i] ? rWords[i].text : '')) : '';
        const isTop = (i % 2 === 0);
        const labelOffset = isTop ? (wordRomaji ? -28 : -16) : 24;
        const labelY = Math.max(22, Math.min(h - (wordRomaji ? 70 : 56), n.y + labelOffset));
        const scale = 1 + glow * 0.08;

        ctx.save();
        ctx.translate(n.x, labelY);
        ctx.scale(scale, scale);
        ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.28 + glow * 0.72).toFixed(3)})`;
        ctx.fillText(n.text, 0, 0);
        if (wordRomaji) {
          ctx.font = `600 ${romajiSubSize}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = `rgba(${rgb}, ${(0.42 + glow * 0.58).toFixed(3)})`;
          ctx.fillText(wordRomaji, 0, Math.round(fontSize * 0.88));
        }
        ctx.restore();
      });

      this.drawCanvasRomaji(ctx, w, h, activeIdx, syncTime);
    }

    drawBranches(ctx, syncTime, activeIdx, words, wordState) {
      const w = this._canvasW;
      const h = this._canvasH;
      const rgb = this.palette.rgb;

      if (activeIdx < 0 || words.length === 0) {
        this.drawCanvasWaitLabel(ctx, w, h, this.trackMeta.title, this.trackMeta.artist);
        return;
      }

      const line = this.lyrics[activeIdx];
      const hasRomajiBar = Boolean(this.showRomaji && line && line.romaji);
      const startX = Math.max(36, w * 0.08);
      const endX = w - startX;
      const midY = hasRomajiBar ? h * 0.45 : h * 0.52;
      const count = words.length;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, midY);
      ctx.lineTo(endX, midY);
      ctx.stroke();

      ctx.strokeStyle = this.palette.primary;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(startX, midY);
      ctx.lineTo(startX + (endX - startX) * this._smoothLineProg, midY);
      ctx.stroke();

      const fontSize = Math.max(12, Math.min(20, Math.round(w / 30)));
      const romajiSubSize = Math.max(10, Math.round(fontSize * 0.64));
      const branchLen = Math.min(84, h * (hasRomajiBar ? 0.19 : 0.23));
      const rWords = this.showRomaji ? this.getLineRomajiWords(activeIdx) : [];
      const hasPerWordRomaji = this.showRomaji && (
        words.some(wd => Boolean(wd.romaji)) || (rWords.length === words.length && rWords.length > 0)
      );
      ctx.textAlign = 'center';

      words.forEach((word, i) => {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const bx = startX + t * (endX - startX);
        const dir = (i % 2 === 0) ? -1 : 1;
        const tipY = midY + dir * branchLen;
        const glow = this._wordGlows[i] || 0;
        const grow = this._wordBranchGrow[i] || 0;

        ctx.fillStyle = `rgba(${rgb}, ${(0.22 + glow * 0.78).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(bx, midY, 3 + glow * 1.8, 0, Math.PI * 2);
        ctx.fill();

        const curTipY = midY + (tipY - midY) * Math.max(0.15, grow);
        ctx.strokeStyle = glow > 0.1
          ? `rgba(${rgb}, ${(0.25 + glow * 0.75).toFixed(3)})`
          : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1.2 + glow * 1.1;
        ctx.beginPath();
        ctx.moveTo(bx, midY);
        ctx.quadraticCurveTo(bx + 12 * Math.max(0.2, grow), (midY + curTipY) / 2, bx, curTipY);
        ctx.stroke();

        if (glow > 0.05) {
          ctx.fillStyle = `rgba(255, 255, 255, ${glow.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(bx, curTipY, 2.5 + glow * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        const wordRomaji = hasPerWordRomaji ? (word.romaji || (rWords[i] ? rWords[i].text : '')) : '';
        const textY = dir === -1
          ? Math.max(20, tipY - (wordRomaji ? 28 : 14))
          : Math.min(h - (hasRomajiBar ? 68 : 22), tipY + 24);
        const scale = 1 + glow * 0.08;

        ctx.save();
        ctx.translate(bx, textY);
        ctx.scale(scale, scale);
        ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.25 + glow * 0.75).toFixed(3)})`;
        ctx.fillText(word.text, 0, 0);
        if (wordRomaji) {
          ctx.font = `600 ${romajiSubSize}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = `rgba(${rgb}, ${(0.42 + glow * 0.58).toFixed(3)})`;
          ctx.fillText(wordRomaji, 0, Math.round(fontSize * 0.88));
        }
        ctx.restore();
      });

      this.drawCanvasRomaji(ctx, w, h, activeIdx, syncTime);
    }

    drawWeb(ctx, syncTime, activeIdx, words, wordState) {
      const w = this._canvasW;
      const h = this._canvasH;
      const line = activeIdx >= 0 ? this.lyrics[activeIdx] : null;
      const hasRomajiBar = Boolean(this.showRomaji && line && line.romaji);
      const cx = w / 2;
      const cy = hasRomajiBar ? h * 0.44 : h * 0.5;
      const maxR = Math.min(w, h) * (hasRomajiBar ? 0.29 : 0.35);
      const rgb = this.palette.rgb;

      if (activeIdx < 0 || words.length === 0) {
        this.drawCanvasWaitLabel(ctx, w, h, this.trackMeta.title, this.trackMeta.artist);
        return;
      }

      const count = Math.max(3, words.length);

      for (let rIdx = 1; rIdx <= 3; rIdx++) {
        const ringR = (maxR * rIdx) / 3;
        ctx.strokeStyle = `rgba(255, 255, 255, ${rIdx === 3 ? 0.1 : 0.06})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= count; i++) {
          const ang = (i / count) * Math.PI * 2 - Math.PI / 2 + syncTime * 0.05;
          const px = cx + Math.cos(ang) * ringR;
          const py = cy + Math.sin(ang) * ringR;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      const fontSize = Math.max(12, Math.min(19, Math.round(w / 29)));
      const romajiSubSize = Math.max(10, Math.round(fontSize * 0.62));
      const rWords = this.showRomaji ? this.getLineRomajiWords(activeIdx) : [];
      const hasPerWordRomaji = this.showRomaji && (
        words.some(wd => Boolean(wd.romaji)) || (rWords.length === words.length && rWords.length > 0)
      );
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      words.forEach((word, i) => {
        const ang = (i / words.length) * Math.PI * 2 - Math.PI / 2 + syncTime * 0.05;
        const px = cx + Math.cos(ang) * maxR;
        const py = cy + Math.sin(ang) * maxR;
        const glow = this._wordGlows[i] || 0;

        ctx.strokeStyle = glow > 0.08
          ? `rgba(${rgb}, ${(0.2 + glow * 0.8).toFixed(3)})`
          : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1 + glow * 1.4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.stroke();

        ctx.fillStyle = `rgba(255, 255, 255, ${(0.22 + glow * 0.78).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, 2.8 + glow * 2.6, 0, Math.PI * 2);
        ctx.fill();

        const labelR = maxR + 24;
        const lx = Math.max(40, Math.min(w - 40, cx + Math.cos(ang) * labelR));
        const maxLy = hasRomajiBar ? h - 72 : h - 22;
        const ly = Math.max(20, Math.min(maxLy, cy + Math.sin(ang) * labelR));
        const scale = 1 + glow * 0.08;
        const wordRomaji = hasPerWordRomaji ? (word.romaji || (rWords[i] ? rWords[i].text : '')) : '';

        ctx.save();
        ctx.translate(lx, ly);
        ctx.scale(scale, scale);
        ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.26 + glow * 0.74).toFixed(3)})`;
        ctx.fillText(word.text, 0, wordRomaji ? -5 : 0);
        if (wordRomaji) {
          ctx.font = `600 ${romajiSubSize}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = `rgba(${rgb}, ${(0.4 + glow * 0.6).toFixed(3)})`;
          ctx.fillText(wordRomaji, 0, Math.round(fontSize * 0.68));
        }
        ctx.restore();
      });

      ctx.fillStyle = `rgba(${rgb}, 0.35)`;
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();

      this.drawCanvasRomaji(ctx, w, h, activeIdx, syncTime);
    }

    drawWaveRibbon(ctx, syncTime, activeIdx, words, wordState) {
      const w = this._canvasW;
      const h = this._canvasH;
      const rgb = this.palette.rgb;

      if (activeIdx < 0 || words.length === 0) {
        this.drawCanvasWaitLabel(ctx, w, h, this.trackMeta.title, this.trackMeta.artist);
        return;
      }

      const line = this.lyrics[activeIdx];
      const hasRomajiBar = Boolean(this.showRomaji && line && line.romaji);
      const baseY = hasRomajiBar ? h * 0.46 : h * 0.52;
      const padX = Math.max(36, w * 0.08);
      const usableW = Math.max(60, w - padX * 2);
      const count = words.length;
      const activeW = wordState.index;

      // Secondary harmonic echo ribbon
      ctx.strokeStyle = `rgba(${rgb}, 0.16)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const nx = x / Math.max(1, w);
        const y = baseY + Math.sin(nx * Math.PI * 2.4 - syncTime * 1.4) * 18;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Primary fluid wave ribbon reacting softly to active word peak
      const activeNormX = activeW >= 0
        ? (padX + ((count === 1 ? 0.5 : activeW / (count - 1)) * usableW)) / Math.max(1, w)
        : -1;

      ctx.strokeStyle = `rgba(${rgb}, 0.72)`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const nx = x / Math.max(1, w);
        let y = baseY + Math.sin(nx * Math.PI * 2.2 - syncTime * 1.1) * 12;
        if (activeNormX >= 0) {
          const dist = Math.abs(nx - activeNormX);
          const peak = Math.exp(-(dist * dist) / 0.008) * (16 + Math.sin(wordState.progress * Math.PI) * 10);
          y -= peak;
        }
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      const densityScale = count >= 7 ? Math.max(0.74, 1 - (count - 6) * 0.06) : 1;
      const fontSize = Math.max(11, Math.min(20, Math.round((w / 28) * densityScale)));
      const romajiSubSize = Math.max(9, Math.round(fontSize * 0.64));
      const rWords = this.showRomaji ? this.getLineRomajiWords(activeIdx) : [];
      const hasPerWordRomaji = this.showRomaji && (
        words.some(wd => Boolean(wd.romaji)) || (rWords.length === words.length && rWords.length > 0)
      );
      ctx.textAlign = 'center';

      words.forEach((word, i) => {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const wx = Math.max(36, Math.min(w - 36, padX + t * usableW));
        const nx = wx / Math.max(1, w);
        const glow = this._wordGlows[i] || 0;
        const waveY = baseY + Math.sin(nx * Math.PI * 2.2 - syncTime * 1.1) * 12 - glow * 22;

        if (glow > 0.06) {
          const grad = ctx.createRadialGradient(wx, waveY, 0, wx, waveY, 22);
          grad.addColorStop(0, `rgba(${rgb}, ${(glow * 0.55).toFixed(3)})`);
          grad.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(wx, waveY, 22, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = `rgba(255, 255, 255, ${(0.28 + glow * 0.72).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(wx, waveY, 2.5 + glow * 3, 0, Math.PI * 2);
        ctx.fill();

        const wordRomaji = hasPerWordRomaji ? (word.romaji || (rWords[i] ? rWords[i].text : '')) : '';
        const textY = Math.max(24, waveY - (wordRomaji ? 32 : 20));
        const scale = 1 + glow * 0.08;
        ctx.save();
        ctx.translate(wx, textY);
        ctx.scale(scale, scale);
        ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.28 + glow * 0.72).toFixed(3)})`;
        ctx.fillText(word.text, 0, 0);
        if (wordRomaji) {
          ctx.font = `600 ${romajiSubSize}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = `rgba(${rgb}, ${(0.42 + glow * 0.58).toFixed(3)})`;
          ctx.fillText(wordRomaji, 0, Math.round(fontSize * 0.88));
        }
        ctx.restore();
      });

      this.drawCanvasRomaji(ctx, w, h, activeIdx, syncTime);
    }

    drawTunerDial(ctx, syncTime, activeIdx, words, wordState, dt) {
      const w = this._canvasW;
      const h = this._canvasH;
      const rgb = this.palette.rgb;
      const cx = w / 2;

      if (activeIdx < 0 || words.length === 0) {
        this.drawCanvasWaitLabel(ctx, w, h, this.trackMeta.title, this.trackMeta.artist);
        return;
      }

      const line = this.lyrics[activeIdx];
      const hasRomajiBar = Boolean(this.showRomaji && line && line.romaji);
      const dialY = hasRomajiBar ? h * 0.5 : h * 0.54;
      const padX = Math.max(38, w * 0.1);
      const usableW = Math.max(60, w - padX * 2);
      const count = words.length;
      const activeW = wordState.index >= 0 ? wordState.index : 0;

      // Stationary horizontal frequency scale & tick marks (never shifts offscreen left)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX - 12, dialY);
      ctx.lineTo(w - padX + 12, dialY);
      ctx.stroke();

      const tickStep = 14;
      const startTick = cx - Math.floor((usableW / 2 + 12) / tickStep) * tickStep;
      const endTick = cx + Math.floor((usableW / 2 + 12) / tickStep) * tickStep;
      for (let x = startTick, stepIdx = 0; x <= endTick; x += tickStep, stepIdx++) {
        const isMajor = Math.abs(Math.round((x - cx) / tickStep)) % 5 === 0;
        const th = isMajor ? 14 : 7;
        ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.24)' : 'rgba(255, 255, 255, 0.09)';
        ctx.beginPath();
        ctx.moveTo(x, dialY - th / 2);
        ctx.lineTo(x, dialY + th / 2);
        ctx.stroke();
      }

      // Smooth gliding tuner reticle needle tracking active word across stationary dial
      const targetFrac = count === 1 ? 0.5 : activeW / (count - 1);
      const targetNeedleX = padX + targetFrac * usableW;
      if (this._tunerNeedleX === undefined || activeIdx !== this._lastActiveIdx) {
        this._tunerNeedleX = targetNeedleX;
      } else {
        this._tunerNeedleX += (targetNeedleX - this._tunerNeedleX) * Math.min(1, (dt || 0.016) * 14);
      }
      const needleX = this._tunerNeedleX;

      const needleGrad = ctx.createLinearGradient(0, dialY - 58, 0, dialY + 58);
      needleGrad.addColorStop(0, `rgba(${rgb}, 0)`);
      needleGrad.addColorStop(0.5, `rgba(${rgb}, 0.95)`);
      needleGrad.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.strokeStyle = needleGrad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(needleX, dialY - 58);
      ctx.lineTo(needleX, dialY + 58);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(needleX, dialY, 4.2, 0, Math.PI * 2);
      ctx.fill();

      // Fixed-position word markers cleanly anchored across the dial
      const densityScale = count >= 6 ? Math.max(0.72, 1 - (count - 5) * 0.06) : 1;
      const fontSize = Math.max(12, Math.min(22, Math.round((w / 26) * densityScale)));
      const romajiSubSize = Math.max(9, Math.round(fontSize * 0.6));
      const rWords = this.showRomaji ? this.getLineRomajiWords(activeIdx) : [];
      const hasPerWordRomaji = this.showRomaji && (
        words.some(wd => Boolean(wd.romaji)) || (rWords.length === words.length && rWords.length > 0)
      );
      const stagger = count >= 4;
      ctx.textAlign = 'center';

      words.forEach((word, i) => {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const wx = Math.max(38, Math.min(w - 38, padX + t * usableW));
        const glow = this._wordGlows[i] || 0;
        const isTop = !stagger || (i % 2 === 0);
        const labelY = isTop ? Math.max(46, dialY - 34) : Math.min(h - (hasRomajiBar ? 74 : 26), dialY + 38);

        ctx.fillStyle = `rgba(${rgb}, ${(0.22 + glow * 0.78).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(wx, dialY, 2.5 + glow * 1.6, 0, Math.PI * 2);
        ctx.fill();

        const alpha = 0.28 + glow * 0.72;
        const scale = 0.94 + glow * 0.14;
        const wordRomaji = hasPerWordRomaji ? (word.romaji || (rWords[i] ? rWords[i].text : '')) : '';

        ctx.save();
        ctx.translate(wx, labelY);
        ctx.scale(scale, scale);
        ctx.font = `${glow > 0.55 ? '900' : '700'} ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
        ctx.fillText(word.text, 0, 0);
        if (wordRomaji) {
          ctx.font = `600 ${romajiSubSize}px Inter, system-ui, sans-serif`;
          ctx.fillStyle = `rgba(${rgb}, ${(0.3 + glow * 0.7).toFixed(3)})`;
          ctx.fillText(wordRomaji, 0, Math.round(fontSize * 0.86));
        }
        ctx.restore();
      });

      // Subtle line counter badge centered at top
      ctx.font = '700 11px ui-monospace, SFMono-Regular, monospace';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
      ctx.textAlign = 'center';
      ctx.fillText(`${formatTime(syncTime)}  •  ${String(activeIdx + 1).padStart(2, '0')} / ${String(this.lyrics.length).padStart(2, '0')}`, cx, Math.max(20, dialY - 82));

      this.drawCanvasRomaji(ctx, w, h, activeIdx, syncTime);
    }

    drawCityMap(ctx, syncTime, activeIdx, words, wordState, dt) {
      const w = this._canvasW;
      const h = this._canvasH;
      const rgb = this.palette.rgb;
      const cx = w / 2;
      const cy = h * 0.42;

      // Stationary centered coordinate grid (does not drift left)
      const gridSize = 48;
      const offX = cx % gridSize;
      const offY = cy % gridSize;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let x = offX; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = offY; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.085)';
      ctx.lineWidth = 2;
      const majSize = gridSize * 3;
      const mOffX = cx % majSize;
      const mOffY = cy % majSize;
      for (let x = mOffX; x < w; x += majSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = mOffY; y < h; y += majSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (activeIdx < 0 || words.length === 0) {
        this.drawCanvasWaitLabel(ctx, w, h, this.trackMeta.title, this.trackMeta.artist);
        return;
      }

      // Centered symmetric waypoint window around active line
      const pins = [];
      const minI = Math.max(0, activeIdx - 2);
      const maxI = Math.min(this.lyrics.length - 1, activeIdx + 2);
      const span = Math.max(1, maxI - minI);
      const stepX = Math.min(82, (w - 96) / span);
      const midSlot = (maxI + minI) / 2;

      for (let i = minI; i <= maxI; i++) {
        const px = cx + (i - midSlot) * stepX;
        const py = cy + Math.sin(i * 0.85) * 34;
        pins.push({ i, x: px, y: py });
      }

      if (pins.length > 1) {
        ctx.strokeStyle = `rgba(${rgb}, 0.65)`;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pins.forEach((p, idxP) => {
          if (idxP === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }

      pins.forEach(p => {
        const isCur = p.i === activeIdx;
        if (isCur) {
          const pulse = 14 + Math.sin(syncTime * 3.6) * 3.5;
          ctx.fillStyle = `rgba(${rgb}, 0.25)`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = isCur ? '#ffffff' : 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, isCur ? 6.5 : 4, 0, Math.PI * 2);
        ctx.fill();
      });

      const line = this.lyrics[activeIdx];
      const hasRomaji = Boolean(this.showRomaji && line && line.romaji);
      const cardW = Math.min(w - 28, 540);
      const fontSize = Math.max(13, Math.min(19, Math.round(w / 29)));
      ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;

      // Wrap words into up to 2 centered rows so long lines stay centered and never clip
      const maxRowW = Math.max(80, cardW - 36);
      const textRows = [];
      let curRow = [];
      let curRowW = 0;
      for (let i = 0; i < words.length; i++) {
        const tok = words[i].text + (i < words.length - 1 ? ' ' : '');
        const tw = ctx.measureText(tok).width;
        if (curRow.length > 0 && curRowW + tw > maxRowW && textRows.length === 0) {
          textRows.push({ items: curRow, width: curRowW });
          curRow = [{ idx: i, text: words[i].text, tok, tw }];
          curRowW = tw;
        } else {
          curRow.push({ idx: i, text: words[i].text, tok, tw });
          curRowW += tw;
        }
      }
      if (curRow.length > 0) textRows.push({ items: curRow, width: curRowW });

      const twoRows = textRows.length > 1;
      const cardH = (twoRows ? 24 : 0) + (hasRomaji ? 104 : 84);
      const cardX = (w - cardW) / 2;
      const cardY = h - cardH - 14;

      ctx.fillStyle = 'rgba(10, 15, 28, 0.9)';
      ctx.strokeStyle = `rgba(${rgb}, 0.38)`;
      ctx.lineWidth = 1;
      this.roundRect(ctx, cardX, cardY, cardW, cardH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;

      const firstRowY = cardY + (hasRomaji ? 44 : (twoRows ? 46 : cardH * 0.56));
      const rowStepY = fontSize + 6;
      textRows.forEach((row, rIdx) => {
        const rWidth = row.items.reduce((s, it) => s + it.tw, 0);
        let cursorX = cardX + Math.max(16, (cardW - rWidth) / 2);
        const ry = firstRowY + rIdx * rowStepY;
        for (const it of row.items) {
          if (cursorX > cardX + cardW - 14) break;
          const glow = this._wordGlows[it.idx] || 0;
          ctx.fillStyle = `rgba(255, 255, 255, ${(0.3 + glow * 0.7).toFixed(3)})`;
          ctx.fillText(it.tok, cursorX, ry);
          cursorX += it.tw;
        }
      });

      if (hasRomaji) {
        const rWords = this.getLineRomajiWords(activeIdx);
        const rState = this.findActiveWord(rWords, syncTime);
        const rFont = Math.max(10, Math.min(13, Math.round(fontSize * 0.7)));
        ctx.font = `600 ${rFont}px Inter, system-ui, sans-serif`;
        const fullRomaji = rWords.map(rw => rw.text).join(' ');
        const rWidth = ctx.measureText(fullRomaji).width;
        const rY = cardY + cardH - 18;
        if (rWidth > cardW - 32) {
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
          ctx.fillText(fullRomaji, cardX + cardW / 2, rY, cardW - 32);
        } else {
          ctx.textAlign = 'left';
          let rX = cardX + (cardW - rWidth) / 2;
          for (let i = 0; i < rWords.length; i++) {
            const rTok = rWords[i].text + (rWords[i].trailingSpace ? ' ' : '');
            const rw = ctx.measureText(rTok).width;
            const isPast = rState.index >= 0 && i < rState.index;
            const isCur = i === rState.index;
            ctx.fillStyle = isCur
              ? '#ffffff'
              : (isPast ? `rgba(${rgb}, 0.95)` : 'rgba(148, 163, 184, 0.55)');
            ctx.fillText(rTok, rX, rY);
            rX += rw;
          }
        }
      }

      ctx.textAlign = 'center';
      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
      ctx.fillText(`${formatTime(syncTime)}  •  Stop ${activeIdx + 1} of ${this.lyrics.length}`, cardX + cardW / 2, cardY + 20);
    }

    drawCanvasWaitLabel(ctx, w, h, title, artist) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 22px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText(title || 'AuraSound', w / 2, h / 2 - 12);
      if (artist) {
        ctx.font = '500 13px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.fillText(artist, w / 2, h / 2 + 16);
      }
    }

    drawCanvasRomaji(ctx, w, h, activeIdx, syncTime) {
      if (!this.showRomaji || activeIdx < 0) return;
      const line = this.lyrics[activeIdx];
      if (!line || !line.romaji) return;

      const rgb = this.palette.rgb;
      const rWords = this.getLineRomajiWords(activeIdx);
      const rState = this.findActiveWord(rWords, syncTime);
      const fontSize = Math.max(12, Math.min(15, Math.round(w / 40)));
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;

      const fullText = rWords.length > 0 ? rWords.map(rw => rw.text).join(' ') : line.romaji;
      const textW = ctx.measureText(fullText).width;
      const maxPillW = w - 28;
      const pillW = Math.min(maxPillW, Math.max(120, textW + 28));
      const pillH = fontSize + 16;
      const pillX = (w - pillW) / 2;
      const pillY = h - pillH - 12;

      ctx.fillStyle = 'rgba(10, 15, 28, 0.78)';
      ctx.strokeStyle = `rgba(${rgb}, 0.34)`;
      ctx.lineWidth = 1;
      this.roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
      ctx.fill();
      ctx.stroke();

      ctx.textBaseline = 'middle';
      const centerY = pillY + pillH / 2;

      if (rWords.length === 0 || textW > maxPillW - 28) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
        ctx.fillText(fullText, w / 2, centerY, maxPillW - 24);
        return;
      }

      ctx.textAlign = 'left';
      let cursorX = (w - textW) / 2;
      for (let i = 0; i < rWords.length; i++) {
        const tok = rWords[i].text + (rWords[i].trailingSpace ? ' ' : '');
        const tw = ctx.measureText(tok).width;
        const isPast = rState.index >= 0 && i < rState.index;
        const isCur = i === rState.index;
        if (isCur) {
          ctx.fillStyle = '#ffffff';
        } else if (isPast) {
          ctx.fillStyle = `rgba(${rgb}, 0.95)`;
        } else {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.52)';
        }
        ctx.fillText(tok, cursorX, centerY);
        cursorX += tw;
      }
    }

    roundRect(ctx, x, y, width, height, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + width, y, x + width, y + height, radius);
      ctx.arcTo(x + width, y + height, x, y + height, radius);
      ctx.arcTo(x, y + height, x, y, radius);
      ctx.arcTo(x, y, x + width, y, radius);
      ctx.closePath();
    }
  }

  MotionLyricsEngine.STYLES = MOTION_STYLES;
  global.MotionLyricsEngine = MotionLyricsEngine;
})(window);
