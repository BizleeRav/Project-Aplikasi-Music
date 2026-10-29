/**
 * AuraSound YouTube Player Integration
 * Wraps YouTube IFrame API with event handling, progress tracking, and MediaSession
 */

class YTPlayerManager {
  constructor() {
    this.player = null;
    this.isReady = false;
    this.isPlaying = false;
    this.currentTrack = null;
    this.progressInterval = null;
    this.onStateChangeCallback = null;
    this.onProgressCallback = null;
    this._lastRawTime = 0;
    this._lastRawTimestamp = performance.now();
    this._interpolatedTime = 0;
    this.initYouTubeIFrameAPI();
  }

  initYouTubeIFrameAPI() {
    if (window.YT && window.YT.Player) {
      this.createPlayer();
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      this.createPlayer();
    };
  }

  createPlayer() {
    let container = document.getElementById('yt-player-wrapper');
    if (!container) {
      container = document.createElement('div');
      container.id = 'yt-player-wrapper';
      container.style.position = 'absolute';
      container.style.width = '1px';
      container.style.height = '1px';
      container.style.opacity = '0.01';
      container.style.pointerEvents = 'none';
      container.style.left = '-9999px';
      document.body.appendChild(container);
    }

    const playerDiv = document.createElement('div');
    playerDiv.id = 'yt-iframe-player';
    container.appendChild(playerDiv);

    this.player = new window.YT.Player('yt-iframe-player', {
      height: '200',
      width: '200',
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        html5: 1,
        vq: 'hd1080'
      },
      events: {
        onReady: () => {
          this.isReady = true;
          console.log('YouTube Player API Ready.');
        },
        onStateChange: (event) => {
          this.handleStateChange(event.data);
        },
        onError: (e) => {
          console.warn('YouTube Player Error code:', e.data);
          this.handlePlaybackError(e.data);
        }
      }
    });
  }

  async handlePlaybackError(errorCode) {
    // If not tried fallback yet and track has a title, attempt to find a playable alternative automatically
    if (this.currentTrack && !this.currentTrack._fallbackRetried && this.currentTrack.title) {
      this.currentTrack._fallbackRetried = true;
      console.log(`[YTPlayer] Error ${errorCode}. Searching playable audio for: "${this.currentTrack.title}"...`);

      try {
        const query = `${this.currentTrack.title} ${this.currentTrack.artist || ''} official audio`;
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        const candidateTracks = data.tracks || data.results || [];

        if (data.success && candidateTracks.length > 0) {
          const altTrack = candidateTracks.find(r => r.id !== this.currentTrack.id);
          if (altTrack) {
            console.log(`[YTPlayer] Found alternative: "${altTrack.title}" (${altTrack.id}), playing...`);
            this.currentTrack.id = altTrack.id;
            this.loadAndPlay(this.currentTrack);
            return;
          }
        }
      } catch (err) {
        console.warn('[YTPlayer] Fallback search error:', err);
      }
    }

    // If already retried or no alternative found, notify user and advance queue
    if (window.app && window.app.showToast) {
      window.app.showToast('Lagu ini memiliki batasan pemutaran, beralih ke lagu berikutnya...', 'warning');
    }
    if (window.app && window.app.playNext) {
      setTimeout(() => window.app.playNext(), 1200);
    }
  }

  loadAndPlay(track) {
    this.currentTrack = track;

    if (!this.player || !this.isReady) {
      setTimeout(() => this.loadAndPlay(track), 400);
      return;
    }

    try {
      this.player.loadVideoById({
        videoId: track.id,
        suggestedQuality: 'hd1080'
      });
      if (this.player.setPlaybackQuality) {
        this.player.setPlaybackQuality('hd1080');
      }
      if (this.player.unMute) {
        this.player.unMute();
      }
      if (this.player.setVolume) {
        const currentVol = (window.app && window.app.currentVolume !== undefined) ? Math.round(window.app.currentVolume * 100) : 100;
        this.player.setVolume(currentVol);
      }
      this.player.playVideo();
      this.startProgressTracker();
      this.updateMediaSession(track);

      // Trigger Visualizer
      if (window.audioEngine) {
        window.audioEngine.isSimulatedVisualizer = true;
        window.audioEngine.resume();
      }
    } catch (err) {
      console.error('Failed to load YouTube track:', err);
    }
  }

  togglePlay() {
    if (!this.player || !this.isReady) return;
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (this.player && this.isReady) {
      this.isPlaying = true;
      if (window.audioEngine) window.audioEngine.isSimulatedVisualizer = true;
      if (this.onStateChangeCallback) this.onStateChangeCallback(true);
      this.player.playVideo();
    }
  }

  pause() {
    if (this.player && this.isReady) {
      this.isPlaying = false;
      if (window.audioEngine) window.audioEngine.isSimulatedVisualizer = false;
      if (this.onStateChangeCallback) this.onStateChangeCallback(false);
      this.player.pauseVideo();
    }
  }

  isPlayingState() {
    if (this.player && this.isReady && typeof this.player.getPlayerState === 'function') {
      const state = this.player.getPlayerState();
      return state === 1 || state === 3; // playing or buffering
    }
    return Boolean(this.isPlaying);
  }

  seekTo(seconds) {
    this._lastRawTime = seconds;
    this._lastRawTimestamp = performance.now();
    this._interpolatedTime = seconds;
    if (this.player && this.isReady) {
      this.player.seekTo(seconds, true);
    }
  }

  getCurrentTime() {
    if (!this.player || !this.isReady || typeof this.player.getCurrentTime !== 'function') {
      return 0;
    }

    const raw = this.player.getCurrentTime() || 0;
    const now = performance.now();

    // If paused, stopped, buffering, or not playing, lock to exact raw time
    if (!this.isPlaying || this._isBuffering) {
      this._lastRawTime = raw;
      this._lastRawTimestamp = now;
      this._interpolatedTime = raw;
      return raw;
    }

    // Initialize baseline on first playback tick
    if (!this._lastRawTimestamp || this._lastRawTimestamp === 0) {
      this._lastRawTime = raw;
      this._lastRawTimestamp = now;
      this._interpolatedTime = raw;
      return raw;
    }

    // Exact wall-clock elapsed time since last frame in seconds (60-120 FPS render rate)
    const dt = Math.max(0, (now - this._lastRawTimestamp) / 1000);
    this._lastRawTimestamp = now;

    // Advance clock continuously at real-time rate (monotonically forward)
    // Clamped to 0.1s to prevent runaway spikes if CPU lagged or tab was hidden
    this._interpolatedTime += Math.min(dt, 0.1);

    // Strict Anti-Runaway Clamp:
    // When YouTube iframe stalls or buffers, never let clock drift more than 280ms ahead of last confirmed audio tick
    this._interpolatedTime = Math.min(this._interpolatedTime, this._lastRawTime + 0.28);

    // When YouTube iframe delivers a new time tick (~every 250ms)
    if (raw !== this._lastRawTime) {
      this._lastRawTime = raw;

      // Acoustic Audio IPC Lead Compensation (~65ms):
      // By the time YouTube posts `raw` across cross-origin iframe boundaries,
      // the sound from the speakers has already advanced by ~65ms.
      const calibratedTarget = raw + 0.065;
      const phaseError = calibratedTarget - this._interpolatedTime;

      // If phase error is large (> 0.35s): user scrubbed/seeked or track buffered -> snap immediately
      if (Math.abs(phaseError) > 0.35) {
        this._interpolatedTime = calibratedTarget;
      } else {
        // Continuous Phase-Locked Loop (PLL) damping filter:
        // Smoothly pull clock towards target by 20% of phase difference without jitter.
        // Result: 100% fluid, zero stutter, perfectly in sync with acoustic vocal onset.
        this._interpolatedTime += phaseError * 0.20;
      }
    }

    return this._interpolatedTime;
  }

  setVolume(volPercent) {
    if (this.player && this.isReady) {
      this.player.setVolume(volPercent);
    }
  }

  handleStateChange(playerState) {
    // Reset clock baseline on state transitions
    const curRaw = (this.player && typeof this.player.getCurrentTime === 'function') ? (this.player.getCurrentTime() || 0) : 0;
    this._lastRawTime = curRaw;
    this._lastRawTimestamp = performance.now();
    this._interpolatedTime = curRaw;

    // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    if (playerState === 1) {
      this.isPlaying = true;
      this._isBuffering = false;
      if (window.audioEngine) window.audioEngine.isSimulatedVisualizer = true;
      if (this.onStateChangeCallback) this.onStateChangeCallback(true);
    } else if (playerState === 3) {
      this._isBuffering = true;
    } else if (playerState === 2 || playerState === 0) {
      this.isPlaying = false;
      this._isBuffering = false;
      if (window.audioEngine) window.audioEngine.isSimulatedVisualizer = false;
      if (this.onStateChangeCallback) this.onStateChangeCallback(false);

      if (playerState === 0) {
        // Track ended -> record completion in taste engine and play next in queue
        if (window.tasteEngine && this.currentTrack) {
          try {
            const dur = this.player.getDuration ? (this.player.getDuration() || 180) : 180;
            window.tasteEngine.recordTrackEnd(this.currentTrack, dur, true);
          } catch (e) {}
        }
        if (window.app && window.app.playNext) {
          window.app.playNext();
        }
      }
    }
  }

  startProgressTracker() {
    if (this.progressInterval) clearInterval(this.progressInterval);

    this.progressInterval = setInterval(() => {
      if (this.player && this.isReady) {
        try {
          const state = this.player.getPlayerState ? this.player.getPlayerState() : -1;
          if (state === 1 || this.isPlaying) {
            const current = this.player.getCurrentTime ? (this.player.getCurrentTime() || 0) : 0;
            const duration = this.player.getDuration ? (this.player.getDuration() || 0) : 0;
            if (this.onProgressCallback) {
              this.onProgressCallback(current, duration);
            }
          }
        } catch (e) {}
      }
    }, 250);
  }

  updateMediaSession(track) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || 'AuraSound',
        album: 'AuraSound Music Hub',
        artwork: [
          { src: track.thumbnail || '/icons/icon.svg', sizes: '512x512', type: 'image/jpeg' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (window.app && window.app.playPrev) window.app.playPrev();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (window.app && window.app.playNext) window.app.playNext();
      });
    }
  }
}

window.ytPlayer = new YTPlayerManager();
