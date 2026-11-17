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
    { id: 'codestyle', label: 'Codestyle', renderer: 'dom' },
    { id: 'constellation', label: 'Constellation', renderer: 'canvas' },
    { id: 'branches', label: 'Branches', renderer: 'canvas' },
    { id: 'web', label: 'Web', renderer: 'canvas' },
    { id: 'messages', label: 'Messages', renderer: 'dom' },
    { id: 'notifications', label: 'Notifications', renderer: 'dom' },
    { id: 'payments', label: 'Payments', renderer: 'dom' },
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
      this._bgStars = [];
      this._lastRenderSignature = '';
      this._lastFisheyeWordIdx = -2;
      this._lastActiveIdx = -2;
      this._lastActiveWordIdx = -2;
      this._currentWords = [];
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
      this.syncRendererVisibility();
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
      this._lastRenderSignature = '';
      this._lastFisheyeWordIdx = -2;
      this._lastActiveIdx = -2;
      this._lastActiveWordIdx = -2;
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

    syncRendererVisibility() {
      const cfg = this.getStyleConfig();
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

    /**
     * Returns word timing segments for a lyric line.
     * Uses real TTML/Suno word timestamps when available, or generates
     * proportional synthetic timings for standard line-synced lyrics.
     */
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
            begin: wBegin,
            end: Math.max(wBegin + 0.06, wEnd),
            trailingSpace: true
          };
        });
      }

      this._wordCache.set(line, words);
      return words;
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
      // Gap between words or after last word in line
      for (let i = words.length - 1; i >= 0; i--) {
        if (syncTime >= words[i].end) {
          return { index: i, progress: 1, inGap: true };
        }
      }
      return { index: -1, progress: 0 };
    }

    render(syncTime, activeIdx, options = {}) {
      if (!this.stageEl) return;
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

      if (cfg.renderer === 'canvas') {
        this.renderCanvasScene(syncTime, activeIdx, words, wordState);
      } else {
        this.renderDomStyle(syncTime, activeIdx, words, wordState);
      }

      this._lastActiveIdx = activeIdx;
      this._lastActiveWordIdx = wordState.index;
    }

    renderEmptyState() {
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
    renderDomStyle(syncTime, activeIdx, words, wordState) {
      if (!this.domEl) return;
      const sig = `${this.style}|${this.trackKey}|${activeIdx}|${this.showRomaji ? 1 : 0}`;

      if (this.style === 'fisheye') {
        this.renderFisheye(syncTime, activeIdx, words, wordState);
        return;
      }

      if (sig !== this._lastRenderSignature) {
        this._lastRenderSignature = sig;
        this._currentWords = words;
        this.buildDomForLine(activeIdx, words, syncTime);
      }

      this.updateDomWordProgress(syncTime, activeIdx, words, wordState);
    }

    buildWordsMarkup(words, extraClass = '') {
      if (!words || words.length === 0) return '';
      return words.map((w, i) => {
        const space = w.trailingSpace ? ' has-space' : '';
        return `<span class="motion-word ${extraClass}${space}" data-widx="${i}" style="--wp:0%">${escapeHtml(w.text)}</span>`;
      }).join('');
    }

    buildDomForLine(activeIdx, words, syncTime) {
      const line = activeIdx >= 0 ? this.lyrics[activeIdx] : null;
      const prevLine = activeIdx > 0 ? this.lyrics[activeIdx - 1] : null;
      const nextLine = (activeIdx >= 0 && activeIdx + 1 < this.lyrics.length) ? this.lyrics[activeIdx + 1] : (activeIdx === -1 && this.lyrics[0] ? this.lyrics[0] : null);
      const romajiHtml = (this.showRomaji && line && line.romaji)
        ? `<div class="motion-romaji-sub">${escapeHtml(line.romaji)}</div>`
        : '';

      if (this.style === 'kinetic') {
        if (!line) {
          this.domEl.innerHTML = `
            <div class="motion-kinetic-stage motion-wait-stage">
              <div class="motion-wait-label">${escapeHtml(this.trackMeta.title)}</div>
              <div class="motion-wait-pulse"><span></span><span></span><span></span></div>
              ${nextLine ? `<div class="motion-wait-next">${escapeHtml(nextLine.text)}</div>` : ''}
            </div>
          `;
          return;
        }
        this.domEl.innerHTML = `
          <div class="motion-kinetic-stage">
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
            <div class="motion-spotlight-stage">
              <div class="motion-spot-dim">${escapeHtml(this.trackMeta.artist || 'AuraSound')}</div>
              <div class="motion-spot-main is-waiting">${escapeHtml(this.trackMeta.title)}</div>
              ${nextLine ? `<div class="motion-spot-dim">${escapeHtml(nextLine.text)}</div>` : ''}
            </div>
          `;
          return;
        }
        this.domEl.innerHTML = `
          <div class="motion-spotlight-stage">
            <div class="motion-spot-dim motion-spot-prev">${prevLine ? escapeHtml(prevLine.text) : ''}</div>
            <div class="motion-spot-main">
              <div class="motion-spot-words">${this.buildWordsMarkup(words, 'motion-spot-word')}</div>
              ${romajiHtml}
            </div>
            <div class="motion-spot-dim motion-spot-next">${nextLine ? escapeHtml(nextLine.text) : ''}</div>
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
                <div class="mc-row mc-active"><span class="mc-ln">02</span><span class="mc-kw">await</span> <span class="mc-fn">vocals</span>.<span class="mc-prop">enter</span>();<span class="mc-cursor"></span></div>
                ${nextLine ? `<div class="mc-row mc-muted"><span class="mc-ln">03</span><span class="mc-comment">// next: ${escapeHtml(nextLine.text)}</span></div>` : ''}
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
                <span class="mc-code-expr"><span class="mc-kw">const</span> <span class="mc-var">verse_${pad(lineNum)}</span> <span class="mc-op">=</span> <span class="mc-quote">"</span><span class="mc-word-stream">${this.buildWordsMarkup(words, 'mc-word')}</span><span class="mc-cursor"></span><span class="mc-quote">"</span>;</span>
              </div>
              ${romajiHtml ? `<div class="mc-row mc-romaji-row"><span class="mc-ln">  </span><span class="mc-comment">// ${escapeHtml(line.romaji)}</span></div>` : ''}
              <div class="mc-row mc-muted"><span class="mc-ln">${pad(lineNum + 1)}</span><span class="mc-comment">// ${escapeHtml(nextText)}</span></div>
            </div>
          </div>
        `;
        return;
      }

      if (this.style === 'messages') {
        const startIdx = Math.max(0, (activeIdx >= 0 ? activeIdx : 0) - 3);
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
          const subRomaji = (isCurrent && this.showRomaji && item.romaji)
            ? `<div class="msg-romaji">${escapeHtml(item.romaji)}</div>`
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
            const subR = (entry.isTop && this.showRomaji && entry.item.romaji)
              ? `<div class="notif-romaji">${escapeHtml(entry.item.romaji)}</div>`
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
          for (let i = activeIdx; i >= Math.max(0, activeIdx - 3); i--) {
            rows.push({ idx: i, item: this.lyrics[i], isTop: i === activeIdx });
          }
        }

        const feedHtml = rows.length > 0
          ? rows.map((entry, pos) => {
            const content = entry.isTop
              ? this.buildWordsMarkup(words, 'pay-word')
              : escapeHtml(entry.item.text);
            const amt = ((entry.idx + 1) * 1.25).toFixed(2);
            return `
              <div class="pay-row pos-${pos} ${entry.isTop ? 'is-top' : ''}" data-seek-time="${entry.item.time}">
                <div class="pay-row-main">
                  <div class="pay-row-title">${content}</div>
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
      }
    }

    renderFisheye(syncTime, activeIdx, words, wordState) {
      if (!this.domEl) return;
      const line = activeIdx >= 0 ? this.lyrics[activeIdx] : null;
      if (!line || words.length === 0) {
        const waitSig = `fisheye_wait_${this.trackKey}`;
        if (this._lastRenderSignature !== waitSig) {
          this._lastRenderSignature = waitSig;
          this._lastFisheyeWordIdx = -2;
          this.domEl.innerHTML = `
            <div class="motion-fisheye-stage">
              <div class="fe-lens-ring"></div>
              <div class="fe-word fe-center is-waiting">${escapeHtml(this.trackMeta.title)}</div>
              <div class="fe-context">${escapeHtml(this.trackMeta.artist || '')}</div>
            </div>
          `;
        }
        return;
      }

      const wIdx = wordState.index >= 0 ? wordState.index : 0;
      const prevW = wIdx > 0 ? words[wIdx - 1].text : '';
      const curW = words[wIdx] ? words[wIdx].text : '';
      const nextW = (wIdx + 1 < words.length) ? words[wIdx + 1].text : '';
      const sig = `fisheye|${this.trackKey}|${activeIdx}|${wIdx}`;

      if (sig !== this._lastRenderSignature) {
        this._lastRenderSignature = sig;
        this._lastFisheyeWordIdx = wIdx;
        const romaji = (this.showRomaji && line.romaji) ? `<div class="fe-romaji">${escapeHtml(line.romaji)}</div>` : '';
        this.domEl.innerHTML = `
          <div class="motion-fisheye-stage">
            <div class="fe-lens-ring"></div>
            <div class="fe-stack">
              <div class="fe-word fe-prev">${escapeHtml(prevW)}</div>
              <div class="fe-word fe-center">${escapeHtml(curW)}</div>
              <div class="fe-word fe-next">${escapeHtml(nextW)}</div>
            </div>
            ${romaji}
            <div class="fe-context">${escapeHtml(line.text)}</div>
          </div>
        `;
      }

      const centerEl = this.domEl.querySelector('.fe-center');
      if (centerEl) {
        const p = wordState.index >= 0 ? wordState.progress : 0;
        const scale = 1.0 + Math.sin(Math.min(1, p) * Math.PI) * 0.14;
        centerEl.style.transform = `scale(${scale.toFixed(3)})`;
      }
    }

    updateDomWordProgress(syncTime, activeIdx, words, wordState) {
      if (!this.domEl) return;

      // Subtle continuous 3D wall drift for Kinetic mode
      if (this.style === 'kinetic') {
        const wall = this.domEl.querySelector('#motion-kinetic-wall');
        if (wall) {
          const rx = Math.sin(syncTime * 0.7) * 5;
          const ry = Math.cos(syncTime * 0.55) * 8;
          wall.style.transform = `perspective(950px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
        }
      }

      const wordEls = this.domEl.querySelectorAll('.motion-word');
      if (!wordEls || wordEls.length === 0) return;

      const wIdx = wordState.index;
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
          el.style.setProperty('--wp', `${Math.round(wordState.progress * 100)}%`);
        } else {
          el.classList.remove('is-active', 'is-passed');
          el.style.setProperty('--wp', '0%');
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
    renderCanvasScene(syncTime, activeIdx, words, wordState) {
      if (!this.canvasEl) return;
      this.resizeCanvas();
      const ctx = this.canvasEl.getContext('2d');
      if (!ctx || this._canvasW < 20 || this._canvasH < 20) return;

      ctx.save();
      ctx.scale(this._dpr, this._dpr);
      ctx.clearRect(0, 0, this._canvasW, this._canvasH);

      if (this.style === 'constellation') {
        this.drawConstellation(ctx, syncTime, activeIdx, words, wordState);
      } else if (this.style === 'branches') {
        this.drawBranches(ctx, syncTime, activeIdx, words, wordState);
      } else if (this.style === 'web') {
        this.drawWeb(ctx, syncTime, activeIdx, words, wordState);
      } else if (this.style === 'map') {
        this.drawCityMap(ctx, syncTime, activeIdx, words, wordState);
      }

      ctx.restore();
    }

    drawConstellation(ctx, syncTime, activeIdx, words, wordState) {
      const w = this._canvasW;
      const h = this._canvasH;
      const rgb = this.palette.rgb;

      // Ambient background stars
      for (const s of this._bgStars) {
        const alpha = 0.14 + 0.28 * (0.5 + 0.5 * Math.sin(syncTime * s.speed + s.phase));
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

      // Constellation connecting lines
      ctx.lineWidth = 1.6;
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i];
        const b = nodes[i + 1];
        if (i < activeW) {
          ctx.strokeStyle = `rgba(${rgb}, 0.72)`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        } else if (i === activeW) {
          const prog = Math.min(1, Math.max(0.05, wordState.progress));
          ctx.strokeStyle = `rgba(255, 255, 255, 0.12)`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();

          ctx.strokeStyle = `rgba(${rgb}, 0.9)`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(a.x + (b.x - a.x) * prog, a.y + (b.y - a.y) * prog);
          ctx.stroke();
        } else {
          ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Star nodes & labels
      const fontSize = Math.max(12, Math.min(22, Math.round(w / 28)));
      ctx.textAlign = 'center';

      nodes.forEach((n, i) => {
        const isPast = activeW >= 0 && i < activeW;
        const isCur = i === activeW;
        const r = isCur ? 5.5 + Math.sin(wordState.progress * Math.PI) * 2.5 : (isPast ? 4 : 2.6);

        if (isCur || isPast) {
          const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4.5);
          grad.addColorStop(0, `rgba(${rgb}, ${isCur ? 0.65 : 0.3})`);
          grad.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 4.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = isCur ? '#ffffff' : (isPast ? this.palette.primary : 'rgba(255, 255, 255, 0.25)');
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();

        const labelOffset = (i % 2 === 0) ? -16 : 24;
        const labelY = Math.max(20, Math.min(h - 14, n.y + labelOffset));
        ctx.font = `${isCur ? '800' : '600'} ${isCur ? fontSize + 2 : fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = isCur ? '#ffffff' : (isPast ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.28)');
        ctx.fillText(n.text, n.x, labelY);
      });

      this.drawCanvasRomaji(ctx, w, h, activeIdx);
    }

    drawBranches(ctx, syncTime, activeIdx, words, wordState) {
      const w = this._canvasW;
      const h = this._canvasH;
      const rgb = this.palette.rgb;

      if (activeIdx < 0 || words.length === 0) {
        this.drawCanvasWaitLabel(ctx, w, h, this.trackMeta.title, this.trackMeta.artist);
        return;
      }

      const startX = Math.max(36, w * 0.08);
      const endX = w - startX;
      const midY = h * 0.52;
      const count = words.length;
      const activeW = wordState.index;
      const lineProgress = activeW < 0 ? 0 : Math.min(1, (activeW + wordState.progress) / Math.max(1, count));

      // Base faint stem
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, midY);
      ctx.lineTo(endX, midY);
      ctx.stroke();

      // Active growing stem
      ctx.strokeStyle = this.palette.primary;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(startX, midY);
      ctx.lineTo(startX + (endX - startX) * lineProgress, midY);
      ctx.stroke();

      const fontSize = Math.max(12, Math.min(20, Math.round(w / 30)));
      const branchLen = Math.min(92, h * 0.24);
      ctx.textAlign = 'center';

      words.forEach((word, i) => {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const bx = startX + t * (endX - startX);
        const dir = (i % 2 === 0) ? -1 : 1;
        const tipY = midY + dir * branchLen;
        const isPast = activeW >= 0 && i < activeW;
        const isCur = i === activeW;
        const grow = isPast ? 1 : (isCur ? Math.min(1, 0.25 + wordState.progress * 0.75) : 0);

        // Stem node
        ctx.fillStyle = (isCur || isPast) ? this.palette.primary : 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(bx, midY, isCur ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fill();

        // Bezier branch
        const curTipY = midY + (tipY - midY) * (isPast || isCur ? grow : 1);
        ctx.strokeStyle = isCur ? '#ffffff' : (isPast ? `rgba(${rgb}, 0.75)` : 'rgba(255, 255, 255, 0.08)');
        ctx.lineWidth = isCur ? 2 : 1.3;
        ctx.beginPath();
        ctx.moveTo(bx, midY);
        ctx.quadraticCurveTo(bx + 12, (midY + curTipY) / 2, bx, curTipY);
        ctx.stroke();

        // Tip dot
        if (isCur || isPast) {
          ctx.fillStyle = isCur ? '#ffffff' : this.palette.secondary;
          ctx.beginPath();
          ctx.arc(bx, curTipY, isCur ? 5 : 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Word label
        const textY = tipY + dir * 18;
        ctx.font = `${isCur ? '800' : '600'} ${isCur ? fontSize + 2 : fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = isCur ? '#ffffff' : (isPast ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.24)');
        ctx.fillText(word.text, bx, Math.max(20, Math.min(h - 14, textY)));
      });

      this.drawCanvasRomaji(ctx, w, h, activeIdx);
    }

    drawWeb(ctx, syncTime, activeIdx, words, wordState) {
      const w = this._canvasW;
      const h = this._canvasH;
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) * 0.36;
      const rgb = this.palette.rgb;

      if (activeIdx < 0 || words.length === 0) {
        this.drawCanvasWaitLabel(ctx, w, h, this.trackMeta.title, this.trackMeta.artist);
        return;
      }

      const count = Math.max(3, words.length);
      const activeW = wordState.index;

      // Concentric web rings
      for (let rIdx = 1; rIdx <= 3; rIdx++) {
        const ringR = (maxR * rIdx) / 3;
        ctx.strokeStyle = `rgba(255, 255, 255, ${rIdx === 3 ? 0.1 : 0.06})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= count; i++) {
          const ang = (i / count) * Math.PI * 2 - Math.PI / 2 + syncTime * 0.06;
          const px = cx + Math.cos(ang) * ringR;
          const py = cy + Math.sin(ang) * ringR;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      const fontSize = Math.max(12, Math.min(20, Math.round(w / 28)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      words.forEach((word, i) => {
        const ang = (i / words.length) * Math.PI * 2 - Math.PI / 2 + syncTime * 0.06;
        const px = cx + Math.cos(ang) * maxR;
        const py = cy + Math.sin(ang) * maxR;
        const isPast = activeW >= 0 && i < activeW;
        const isCur = i === activeW;

        ctx.strokeStyle = isCur
          ? this.palette.primary
          : (isPast ? `rgba(${rgb}, 0.55)` : 'rgba(255, 255, 255, 0.08)');
        ctx.lineWidth = isCur ? 2.2 : 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.stroke();

        ctx.fillStyle = isCur ? '#ffffff' : (isPast ? this.palette.primary : 'rgba(255,255,255,0.22)');
        ctx.beginPath();
        ctx.arc(px, py, isCur ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();

        const labelR = maxR + 24;
        const lx = cx + Math.cos(ang) * labelR;
        const ly = cy + Math.sin(ang) * labelR;
        ctx.font = `${isCur ? '800' : '600'} ${isCur ? fontSize + 2 : fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = isCur ? '#ffffff' : (isPast ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.26)');
        ctx.fillText(word.text, Math.max(36, Math.min(w - 36, lx)), Math.max(18, Math.min(h - 18, ly)));
      });

      // Center core glow
      ctx.fillStyle = `rgba(${rgb}, 0.35)`;
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    drawCityMap(ctx, syncTime, activeIdx, words, wordState) {
      const w = this._canvasW;
      const h = this._canvasH;
      const rgb = this.palette.rgb;

      const idx = Math.max(0, activeIdx);
      const targetCamX = idx * 88;
      const targetCamY = Math.sin(idx * 0.7) * 44;
      this._camX += (targetCamX - this._camX) * 0.08;
      this._camY += (targetCamY - this._camY) * 0.08;

      // Dark vector street grid
      const gridSize = 48;
      const offX = -(this._camX % gridSize);
      const offY = -(this._camY % gridSize);

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

      // Major avenues
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.lineWidth = 2.5;
      const majSize = gridSize * 3;
      const mOffX = -(this._camX % majSize);
      const mOffY = -(this._camY % majSize);
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

      // Route path across pins around center
      const cx = w / 2;
      const cy = h * 0.44;
      const pins = [];
      const minI = Math.max(0, activeIdx - 3);
      const maxI = Math.min(this.lyrics.length - 1, activeIdx + 2);

      for (let i = minI; i <= maxI; i++) {
        const px = cx + (i * 88 - this._camX);
        const py = cy + (Math.sin(i * 0.7) * 44 - this._camY);
        pins.push({ i, x: px, y: py });
      }

      if (pins.length > 1) {
        ctx.strokeStyle = `rgba(${rgb}, 0.7)`;
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
          const pulse = 14 + Math.sin(syncTime * 4) * 4;
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

      // Floating minimal HUD card at bottom of map canvas
      const cardW = Math.min(w - 32, 540);
      const cardH = 88;
      const cardX = (w - cardW) / 2;
      const cardY = h - cardH - 18;

      ctx.fillStyle = 'rgba(10, 15, 28, 0.86)';
      ctx.strokeStyle = `rgba(${rgb}, 0.35)`;
      ctx.lineWidth = 1;
      this.roundRect(ctx, cardX, cardY, cardW, cardH, 16);
      ctx.fill();
      ctx.stroke();

      // Render active line words centered inside HUD card
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const fontSize = Math.max(14, Math.min(20, Math.round(w / 28)));
      ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;

      const fullLine = words.map(wItem => wItem.text).join(' ');
      const lineWidth = ctx.measureText(fullLine).width;
      const startTextX = lineWidth < cardW - 36
        ? cardX + (cardW - lineWidth) / 2
        : cardX + 18;
      let cursorX = startTextX;
      const textY = cardY + cardH * 0.48;
      const activeW = wordState.index;

      for (let i = 0; i < words.length; i++) {
        const tok = words[i].text + (words[i].trailingSpace ? ' ' : '');
        const tw = ctx.measureText(tok).width;
        if (cursorX + tw > cardX + cardW - 14) break;
        const isPast = activeW >= 0 && i < activeW;
        const isCur = i === activeW;
        ctx.fillStyle = isCur ? this.palette.primary : (isPast ? '#ffffff' : 'rgba(255, 255, 255, 0.34)');
        ctx.fillText(tok, cursorX, textY);
        cursorX += tw;
      }

      ctx.font = '600 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
      ctx.fillText(`${formatTime(syncTime)}  •  Stop ${activeIdx + 1} of ${this.lyrics.length}`, cardX + 18, cardY + 20);
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

    drawCanvasRomaji(ctx, w, h, activeIdx) {
      if (!this.showRomaji || activeIdx < 0) return;
      const line = this.lyrics[activeIdx];
      if (!line || !line.romaji) return;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = '600 13px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.82)';
      ctx.fillText(line.romaji, w / 2, h - 14);
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

