/**
 * AuraSound Audio Engine - Web Audio DSP with 10-Band EQ, Bass Booster, 3D Spatializer
 * Optimized for Dolby Access and Nahimic system audio enhancement
 */

class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.sourceNode = null;
    this.analyser = null;
    this.gainNode = null;
    this.glueCompressor = null;   // SSL-style Studio Bus Glue Compressor for cohesive master polish
    this.peakLimiter = null;      // Transparent True-Peak Limiter
    this.softClipperNode = null;  // Analog Tape Soft-Clipper
    this.subBassDeepNode = null;  // Seismic Sub-Bass Foundation (50Hz)
    this.subBassPunchNode = null; // Kick Drum Slam & Body (85Hz)
    this.stereoPanner = null;
    this.splitter = null;
    this.merger = null;
    this.midGainL = null;
    this.midGainR = null;
    this.spatialWidthGain = null;
    this.binauralDelayL = null;
    this.binauralDelayR = null;
    this.binauralFilter = null;
    this.sideInverter = null;
    this.eqFilters = [];
    this.frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    this.isInitialized = false;
    this.canvas = null;
    this.canvasCtx = null;
    this.curveCanvas = null;
    this.curveCtx = null;
    this.animationFrameId = null;
    this.isSimulatedVisualizer = false;

    // Persistent physics buffers for realistic equalizer dynamics
    this.barCount = 36;
    this.bars = new Float32Array(36);
    this.cinemaBarCount = 54;
    this.cinemaBars = new Float32Array(54);
    this.cinemaPeaks = new Float32Array(54);
    this.cinemaPeakHold = new Int8Array(54);

    // Default active DSP gains (aligned with Dolby Atmos Enhancer)
    this.currentGains = [5, 6, 2, -1, -2, 0, 2, 4, 6, 5];
    this.currentBass = 4;
    this.spatialWidth = 1.45;

    this.presets = {
      flat: { eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bass: 0, width: 1.0 }, // Audiophile Bit-Perfect Reference (Flat / Natural)
      dolby: { eq: [5, 6, 2, -1, -2, 0, 2, 4, 6, 5], bass: 4, width: 1.45 }, // Dolby Atmos Holographic 3D (Cinematic depth, spatial air, zero harshness)
      nahimic: { eq: [2, 6, 4, 0, -1, 0, 3, 5, 3, 1], bass: 5, width: 1.25 }, // Nahimic Bass & Clarity (Punchy transient slam & razor-sharp vocal detail)
      bassHeavy: { eq: [8, 9, 6, 0, -2, -1, 1, 2, 4, 3], bass: 8, width: 1.15 }, // Music Video Club Bass Boost Extreme (Deep 808s, punchy kick, mud-free, sparkling highs)
      vocal: { eq: [-4, -2, 0, -2, -1, 1, 3, 5, 3, 2], bass: 0, width: 1.05 }, // Studio Music Video Vocal Presence (Intimate, forward, silky clarity, zero nasal harshness)
      electronic: { eq: [6, 7, 4, -1, -3, -1, 2, 4, 6, 5], bass: 7, width: 1.40 } // Festival EDM / Synth V-Curve (Punchy drops, soaring synths & bright sizzle)
    };

    // Quick Aliases for Bento & Home feed preset pills
    this.presets.bass = this.presets.bassHeavy;
    this.presets.club = this.presets.electronic;
  }

  // Smooth analog tape saturation curve to catch peaks without digital harshness
  createSoftClipCurve() {
    const samples = 4096;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / (samples - 1) - 1; // -1.0 to 1.0
      // 100% linear and transparent up to 0.82
      // Smooth hyperbolic tangent soft saturation for the top 18% to eliminate digital clipping
      if (x < -1) {
        curve[i] = -0.99;
      } else if (x > 1) {
        curve[i] = 0.99;
      } else if (x > 0.82) {
        curve[i] = 0.82 + 0.17 * Math.tanh((x - 0.82) / 0.17);
      } else if (x < -0.82) {
        curve[i] = -0.82 + 0.17 * Math.tanh((x + 0.82) / 0.17);
      } else {
        curve[i] = x;
      }
    }
    return curve;
  }

  init(audioElement) {
    if (this.isInitialized) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // Master Output Gain
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 1.0;

      // 1. DUAL-STAGE SUB-BASS ENGINE (Deep Foundation + Punch Slam)
      // Produces deep chest-thumping subwoofer rumble without muddy boxiness
      this.subBassDeepNode = this.audioCtx.createBiquadFilter();
      this.subBassDeepNode.type = 'lowshelf';
      this.subBassDeepNode.frequency.value = 50; // Deep 808 sub-bass foundation
      this.subBassDeepNode.gain.value = this.currentBass * 0.75;

      this.subBassPunchNode = this.audioCtx.createBiquadFilter();
      this.subBassPunchNode.type = 'peaking';
      this.subBassPunchNode.frequency.value = 85; // Snappy kick drum punch
      this.subBassPunchNode.Q.value = 1.6;
      this.subBassPunchNode.gain.value = this.currentBass * 0.55;

      // 2. 10-BAND PRECISION AUDIOPHILE EQ FILTERS
      this.eqFilters = this.frequencies.map((freq, index) => {
        const filter = this.audioCtx.createBiquadFilter();
        if (index === 0) {
          filter.type = 'lowshelf';
        } else if (index === this.frequencies.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = (freq === 64 || freq === 125) ? 1.5 : (freq >= 2000 ? 1.3 : 1.2);
        }
        filter.frequency.value = freq;
        filter.gain.value = this.currentGains[index] || 0;
        return filter;
      });

      // 3. TRUE 3D BINAURAL HOLOGRAPHIC SPATIALIZER
      // Center-anchored to preserve punchy vocals and kick drum, while expanding the stereo soundstage in 3D
      this.splitter = this.audioCtx.createChannelSplitter(2);
      this.merger = this.audioCtx.createChannelMerger(2);

      // Mid Channel (Center Anchor - dry vocals, kick & bass kept 100% solid & intact)
      this.midGainL = this.audioCtx.createGain();
      this.midGainR = this.audioCtx.createGain();
      this.midGainL.gain.value = 0.5;
      this.midGainR.gain.value = 0.5;

      // Side Channel (Stereo Ambience)
      const sideGainL = this.audioCtx.createGain();
      const sideGainR = this.audioCtx.createGain();
      sideGainL.gain.value = 0.5;
      sideGainR.gain.value = -0.5;

      // Spatial Width Multiplier
      this.spatialWidthGain = this.audioCtx.createGain();
      this.spatialWidthGain.gain.value = this.spatialWidth;

      // Binaural Haas Micro-Delay for Out-of-Head 3D Depth
      this.binauralDelayL = this.audioCtx.createDelay(0.05);
      this.binauralDelayL.delayTime.value = 0.012; // 12ms acoustic Haas depth
      this.binauralDelayR = this.audioCtx.createDelay(0.05);
      this.binauralDelayR.delayTime.value = 0.012;

      this.binauralFilter = this.audioCtx.createBiquadFilter();
      this.binauralFilter.type = 'lowpass';
      this.binauralFilter.frequency.value = 8500; // Head-shadow acoustic dispersion

      this.sideInverter = this.audioCtx.createGain();
      this.sideInverter.gain.value = -1.0;

      // Connect Mid-Side Matrix
      this.splitter.connect(this.midGainL, 0);
      this.splitter.connect(this.midGainR, 1);
      this.splitter.connect(sideGainL, 0);
      this.splitter.connect(sideGainR, 1);

      sideGainL.connect(this.spatialWidthGain);
      sideGainR.connect(this.spatialWidthGain);

      // Recombine Mid + Direct Side
      this.midGainL.connect(this.merger, 0, 0);
      this.midGainR.connect(this.merger, 0, 0);
      this.spatialWidthGain.connect(this.merger, 0, 0);

      this.midGainL.connect(this.merger, 0, 1);
      this.midGainR.connect(this.merger, 0, 1);
      this.spatialWidthGain.connect(this.sideInverter);
      this.sideInverter.connect(this.merger, 0, 1);

      // Add Binaural Depth Crossfeed
      this.spatialWidthGain.connect(this.binauralFilter);
      this.binauralFilter.connect(this.binauralDelayL);
      this.binauralFilter.connect(this.binauralDelayR);
      const crossfeedGain = this.audioCtx.createGain();
      crossfeedGain.gain.value = 0.22;
      this.binauralDelayL.connect(crossfeedGain);
      this.binauralDelayR.connect(crossfeedGain);
      crossfeedGain.connect(this.merger, 0, 0);
      crossfeedGain.connect(this.merger, 0, 1);

      // 4. SPATIAL BALANCE PANNER (if supported)
      if (this.audioCtx.createStereoPanner) {
        this.stereoPanner = this.audioCtx.createStereoPanner();
        this.stereoPanner.pan.value = 0;
      }

      // 5. STUDIO BUS GLUE COMPRESSOR (The Secret to Polished Mastered Sound)
      // Smooth 2.4:1 ratio with 35ms attack lets drums snap cleanly while gluing the mix together
      this.glueCompressor = this.audioCtx.createDynamicsCompressor();
      this.glueCompressor.threshold.value = -14.0; // dB
      this.glueCompressor.knee.value = 16.0;        // 16 dB ultra-soft analog knee
      this.glueCompressor.ratio.value = 2.4;        // 2.4:1 gentle musical glue
      this.glueCompressor.attack.value = 0.035;     // 35ms allows punchy drum transients to snap through
      this.glueCompressor.release.value = 0.22;     // 220ms smooth, breathing musical release

      // 6. TRUE-PEAK SAFETY LIMITER (Transparent Ceiling)
      this.peakLimiter = this.audioCtx.createDynamicsCompressor();
      this.peakLimiter.threshold.value = -1.5;      // dB catches true-peak overshoots
      this.peakLimiter.knee.value = 6.0;
      this.peakLimiter.ratio.value = 16.0;
      this.peakLimiter.attack.value = 0.015;        // 15ms safety catch
      this.peakLimiter.release.value = 0.15;

      // 7. ANALOG TAPE SOFT-CLIPPER WAVESHAPER (Rounds off rogue peaks softly, zero DAC crackle)
      this.softClipperNode = this.audioCtx.createWaveShaper();
      this.softClipperNode.curve = this.createSoftClipCurve();
      this.softClipperNode.oversample = '2x';

      // 8. SPECTRUM VISUALIZER ANALYSER
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.85;

      // Connect HTML5 Audio Element if provided
      if (audioElement) {
        this.sourceNode = this.audioCtx.createMediaElementSource(audioElement);

        // Chain: source -> subBassDeep -> subBassPunch -> 10-Band EQ -> Mid-Side 3D Spatializer -> Panner -> Glue Compressor -> Analyser -> Peak Limiter -> SoftClipper -> Gain -> Destination
        this.sourceNode.connect(this.subBassDeepNode);
        this.subBassDeepNode.connect(this.subBassPunchNode);

        let prevNode = this.subBassPunchNode;
        this.eqFilters.forEach(filter => {
          prevNode.connect(filter);
          prevNode = filter;
        });

        // Pipe into Mid-Side 3D Spatializer
        prevNode.connect(this.splitter);

        let postMerger = this.merger;
        if (this.stereoPanner) {
          postMerger.connect(this.stereoPanner);
          postMerger = this.stereoPanner;
        }

        // Pipe through Studio Bus Glue Compressor -> Analyser -> True Peak Limiter -> Soft Clipper -> Master Gain
        postMerger.connect(this.glueCompressor);
        this.glueCompressor.connect(this.analyser);
        this.analyser.connect(this.peakLimiter);
        this.peakLimiter.connect(this.softClipperNode);
        this.softClipperNode.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
      }

      this.isInitialized = true;
      console.log('AuraSound Full-Potential Studio DSP Engine initialized (Dual-Stage Bass, 3D Binaural, SSL Glue & Soft-Clipper).');

      // Draw initial EQ curve
      setTimeout(() => this.drawEqCurve(), 100);
    } catch (err) {
      console.warn('Audio Context initialization error (will retry upon user gesture):', err);
    }
  }

  resume() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setBandGain(bandIndex, gainValue) {
    const val = parseFloat(gainValue);
    this.currentGains[bandIndex] = val;
    if (this.eqFilters[bandIndex]) {
      this.eqFilters[bandIndex].gain.setTargetAtTime(val, this.audioCtx?.currentTime || 0, 0.05);
    }
    this.drawEqCurve();
  }

  setBassBoost(gainValue) {
    const val = parseFloat(gainValue);
    this.currentBass = val;
    if (this.subBassDeepNode && this.audioCtx) {
      this.subBassDeepNode.gain.setTargetAtTime(val * 0.75, this.audioCtx.currentTime || 0, 0.05);
    }
    if (this.subBassPunchNode && this.audioCtx) {
      this.subBassPunchNode.gain.setTargetAtTime(val * 0.55, this.audioCtx.currentTime || 0, 0.05);
    }
    this.drawEqCurve();
  }

  setSpatialWidth(widthMultiplier) {
    const val = Math.max(0, Math.min(2.0, parseFloat(widthMultiplier)));
    this.spatialWidth = val;
    if (this.spatialWidthGain && this.audioCtx) {
      this.spatialWidthGain.gain.setTargetAtTime(val, this.audioCtx.currentTime || 0, 0.05);
    }
    if (this.binauralDelayL && this.binauralDelayR && this.audioCtx) {
      const delayAmount = val > 1.0 ? Math.min(0.018, 0.008 + (val - 1.0) * 0.012) : 0.005;
      this.binauralDelayL.delayTime.setTargetAtTime(delayAmount, this.audioCtx.currentTime || 0, 0.05);
      this.binauralDelayR.delayTime.setTargetAtTime(delayAmount, this.audioCtx.currentTime || 0, 0.05);
    }
  }

  setSpatialPan(panValue) {
    if (this.stereoPanner) {
      this.stereoPanner.pan.setTargetAtTime(panValue, this.audioCtx?.currentTime || 0, 0.05);
    }
  }

  applyPreset(presetName) {
    const preset = this.presets[presetName];
    if (!preset) return;

    const values = Array.isArray(preset) ? preset : preset.eq;
    const bassVal = (typeof preset.bass === 'number') ? preset.bass : (presetName === 'dolby' ? 4 : (presetName === 'nahimic' ? 5 : (presetName === 'bassHeavy' || presetName === 'bass' ? 8 : (presetName === 'electronic' || presetName === 'club' ? 7 : 0))));
    const widthVal = (typeof preset.width === 'number') ? preset.width : (presetName === 'dolby' ? 1.45 : (presetName === 'nahimic' ? 1.25 : (presetName === 'electronic' || presetName === 'club' ? 1.40 : 1.0)));

    values.forEach((val, idx) => {
      this.setBandGain(idx, val);
      const slider = document.getElementById(`eq-slider-${idx}`);
      if (slider) slider.value = val;
    });

    this.setBassBoost(bassVal);
    const bassSlider = document.getElementById('bass-boost-slider');
    if (bassSlider) bassSlider.value = bassVal;
    const bassLabel = document.getElementById('bass-boost-val');
    if (bassLabel) bassLabel.textContent = `+${bassVal} dB`;

    this.setSpatialWidth(widthVal);
    const widthSlider = document.getElementById('spatial-width-slider');
    if (widthSlider) widthSlider.value = Math.round(widthVal * 100);
    const widthLabel = document.getElementById('spatial-width-val');
    if (widthLabel) {
      const pct = Math.round(widthVal * 100);
      widthLabel.textContent = pct === 100 ? '100% (Stereo)' : (pct > 100 ? `${pct}% (3D Surround)` : `${pct}% (Fokus Mono)`);
    }

    this.drawEqCurve();
  }

  // Draw Real-Time Frequency Response Curve on Canvas
  drawEqCurve() {
    if (!this.curveCanvas || !this.curveCtx) {
      const el = document.getElementById('eq-curve-canvas');
      if (el) {
        this.curveCanvas = el;
        this.curveCtx = el.getContext('2d');
      } else {
        return;
      }
    }

    const width = this.curveCanvas.width;
    const height = this.curveCanvas.height;
    const ctx = this.curveCtx;

    ctx.clearRect(0, 0, width, height);

    // Center 0 dB reference line
    const zeroY = height * 0.5;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(10, zeroY);
    ctx.lineTo(width - 10, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // +6dB and -6dB reference guides
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.moveTo(10, height * 0.25); ctx.lineTo(width - 10, height * 0.25);
    ctx.moveTo(10, height * 0.75); ctx.lineTo(width - 10, height * 0.75);
    ctx.stroke();

    // Calculate curve points with Bass Booster contribution
    const count = this.frequencies.length;
    const padX = 20;
    const effWidth = width - padX * 2;
    const points = [];

    for (let i = 0; i < count; i++) {
      const x = padX + (i / (count - 1)) * effWidth;
      let gain = this.currentGains[i] || 0;
      if (i === 0) gain += (this.currentBass || 0) * 0.75;
      else if (i === 1) gain += (this.currentBass || 0) * 0.5;
      else if (i === 2) gain += (this.currentBass || 0) * 0.2;

      const clampedGain = Math.max(-18, Math.min(18, gain));
      const y = zeroY - (clampedGain / 18) * (height * 0.44);
      points.push({ x, y, gain });
    }

    // Draw Smooth Spline Fill Path
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.lineTo(points[points.length - 1].x, height);
    ctx.lineTo(points[0].x, height);
    ctx.closePath();

    const fillGrad = ctx.createLinearGradient(0, 0, 0, height);
    fillGrad.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
    fillGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.16)');
    fillGrad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Draw Glowing Stroke Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

    const strokeGrad = ctx.createLinearGradient(0, 0, width, 0);
    strokeGrad.addColorStop(0, '#10b981');
    strokeGrad.addColorStop(0.5, '#06b6d4');
    strokeGrad.addColorStop(1, '#a855f7');

    ctx.strokeStyle = strokeGrad;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Glowing Control Points
    points.forEach((pt) => {
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 6;
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  // Setup Visualizer Canvas
  setupVisualizer(canvasElement) {
    this.canvas = canvasElement;
    if (!this.canvas) return;
    this.canvasCtx = this.canvas.getContext('2d');
    this.startVisualizerLoop();
  }

  setupCinemaVisualizer(canvasElement) {
    this.cinemaCanvas = canvasElement;
    if (!this.cinemaCanvas) return;
    this.cinemaCanvasCtx = this.cinemaCanvas.getContext('2d');

    if (!this.stardustParticles || this.stardustParticles.length === 0) {
      this.initStardustParticles();
    }

    const resize = () => {
      if (this.cinemaCanvas) {
        const rect = this.cinemaCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.cinemaCanvas.width = (rect.width || 600) * dpr;
        this.cinemaCanvas.height = (rect.height || 160) * dpr;
      }
    };
    resize();
    window.addEventListener('resize', resize);
  }

  initStardustParticles() {
    this.stardustParticles = [];
    for (let i = 0; i < 90; i++) {
      this.stardustParticles.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() * 2.5 + 1,
        speedX: (Math.random() - 0.5) * 0.002,
        speedY: (Math.random() - 0.5) * 0.002,
        color: ['#10b981', '#06b6d4', '#8b5cf6', '#ec4899', '#ffffff'][Math.floor(Math.random() * 5)],
        pulseOffset: Math.random() * Math.PI * 2
      });
    }
  }

  setCinemaVisMode(mode) {
    if (['spectrum', 'waveform', 'stars'].includes(mode)) {
      this.cinemaVisMode = mode;
    }
  }

  cycleCinemaVisMode() {
    const modes = ['spectrum', 'waveform', 'stars'];
    const curIdx = modes.indexOf(this.cinemaVisMode || 'spectrum');
    const nextMode = modes[(curIdx + 1) % modes.length];
    this.setCinemaVisMode(nextMode);
    return nextMode;
  }

  startVisualizerLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const render = () => {
      this.drawVisualizer();
      this.drawCinemaVisualizer();
      this.animationFrameId = requestAnimationFrame(render);
    };

    render();
  }

  getPlaybackContext() {
    let isPlaying = false;
    let songTime = 0;

    // Check YouTube player state
    if (window.ytPlayer) {
      if (typeof window.ytPlayer.isPlayingState === 'function') {
        isPlaying = window.ytPlayer.isPlayingState();
      } else if (typeof window.ytPlayer.getPlayerState === 'function') {
        isPlaying = (window.ytPlayer.getPlayerState() === 1);
      } else {
        isPlaying = Boolean(window.ytPlayer.isPlaying);
      }
      if (typeof window.ytPlayer.getCurrentTime === 'function') {
        songTime = window.ytPlayer.getCurrentTime() || 0;
      }
    }

    // Check Native/Suno HTML Audio element
    if (!isPlaying && window.app && window.app.audioPlayer) {
      if (!window.app.audioPlayer.paused && !window.app.audioPlayer.ended) {
        isPlaying = true;
        songTime = window.app.audioPlayer.currentTime || 0;
      }
    }

    // Fallback if simulation flag set without active player
    if (!isPlaying && this.isSimulatedVisualizer) {
      isPlaying = true;
      songTime = Date.now() / 1000;
    }

    // Check if singing is active in synchronized lyrics
    const isSinging = Boolean(window.app && typeof window.app.activeLyricIdx === 'number' && window.app.activeLyricIdx >= 0);

    return { isPlaying, songTime, isSinging };
  }

  drawVisualizer() {
    if (!this.canvas || !this.canvasCtx) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.canvasCtx;

    ctx.clearRect(0, 0, width, height);

    const { isPlaying, songTime, isSinging } = this.getPlaybackContext();
    const barCount = this.barCount || 36;
    const barWidth = Math.max(2, (width / barCount) - 3);

    if (!this.bars || this.bars.length !== barCount) {
      this.bars = new Float32Array(barCount);
    }

    let dataArray = null;
    let bufferLength = 0;
    if (this.isInitialized && this.analyser && isPlaying && !this.isSimulatedVisualizer) {
      bufferLength = this.analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);
    }

    // Musical Beat & Rhythm parameters (~124 BPM)
    const bps = 2.066;
    const beatPos = songTime * bps;
    const beatPhase = beatPos % 1;
    const measureBeat = Math.floor(beatPos) % 4;

    const isKickBeat = (measureBeat === 0 || measureBeat === 2);
    const kickEnvelope = Math.pow(Math.max(0, 1 - beatPhase * 3.6), 2.5) * (isKickBeat ? 0.95 : 0.5);
    const isSnareBeat = (measureBeat === 1 || measureBeat === 3);
    const snareEnvelope = Math.pow(Math.max(0, 1 - beatPhase * 4.0), 2.0) * (isSnareBeat ? 0.85 : 0.1);
    const hihatEnvelope = Math.max(0, 1 - ((beatPos * 4) % 1) * 4.2) * 0.45;
    const vocalEnergy = isSinging ? (0.45 * (Math.sin(songTime * 8) * 0.2 + 0.8)) : 0.06;

    let x = 0;
    for (let i = 0; i < barCount; i++) {
      let targetPct = 0.05;

      if (dataArray) {
        const dataIndex = Math.floor(i * (bufferLength / barCount));
        targetPct = ((dataArray[dataIndex] || 0) / 255);
      } else if (isPlaying) {
        if (i <= 10) {
          // Lows (Bass / Kick)
          const bassWeight = 1 - (i / 11);
          targetPct = (kickEnvelope * 0.7 * bassWeight) + (Math.sin(songTime * 2 + i) * 0.1 + 0.15);
        } else if (i <= 23) {
          // Mids (Vocals / Snare)
          const midWeight = Math.sin(((i - 10) / 13) * Math.PI);
          targetPct = (vocalEnergy * midWeight * 1.1) + (snareEnvelope * 0.4 * midWeight) + 0.14;
        } else {
          // Highs (Hi-hats / Treble)
          const trebWeight = (i - 23) / 13;
          targetPct = (hihatEnvelope * trebWeight * 0.75) + (Math.sin(songTime * 4.5 + i) * 0.1 + 0.14);
        }
        targetPct = Math.min(0.95, Math.max(0.04, targetPct));
      }

      // Smooth inertia
      if (targetPct > this.bars[i]) {
        this.bars[i] = this.bars[i] * 0.35 + targetPct * 0.65;
      } else {
        this.bars[i] = this.bars[i] * 0.86 + targetPct * 0.14;
      }

      const pct = this.bars[i];
      const barHeight = Math.max(5, pct * height * 0.9);

      const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
      gradient.addColorStop(0, '#10b981');
      gradient.addColorStop(0.5, '#06b6d4');
      gradient.addColorStop(1, '#8b5cf6');

      ctx.fillStyle = isPlaying ? gradient : 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.roundRect(x, height - barHeight, Math.max(barWidth, 2), barHeight, [4, 4, 0, 0]);
      ctx.fill();

      x += barWidth + 3;
    }
  }

  drawCinemaVisualizer() {
    if (!this.cinemaCanvas || !this.cinemaCanvasCtx) return;

    const width = this.cinemaCanvas.width;
    const height = this.cinemaCanvas.height;
    const ctx = this.cinemaCanvasCtx;
    const mode = this.cinemaVisMode || 'spectrum';

    ctx.clearRect(0, 0, width, height);

    const { isPlaying, songTime, isSinging } = this.getPlaybackContext();

    // Beat Rhythm & Vocal Intelligence Parameters
    const bpm = 124;
    const bps = bpm / 60; // 2.066 beats/sec
    const beatPos = songTime * bps;
    const beatPhase = beatPos % 1;
    const measureBeat = Math.floor(beatPos) % 4; // 0, 1, 2, 3 in 4/4 meter

    // Kick Drum Impulse (Beat 1 & 3)
    const isKickBeat = (measureBeat === 0 || measureBeat === 2);
    const kickCurve = Math.max(0, 1 - beatPhase * 3.8);
    const kickImpulse = isKickBeat ? Math.pow(kickCurve, 2.8) * 0.95 : Math.pow(kickCurve, 3.2) * 0.55;

    // Snare / Backbeat Punch (Beat 2 & 4)
    const isSnareBeat = (measureBeat === 1 || measureBeat === 3);
    const snareCurve = Math.max(0, 1 - beatPhase * 4.2);
    const snareImpulse = isSnareBeat ? Math.pow(snareCurve, 2.2) * 0.85 : 0.05;

    // Hi-Hat 16th-Note Subdivision Tick
    const sixteenthPhase = (beatPos * 4) % 1;
    const hihatImpulse = Math.max(0, 1 - sixteenthPhase * 4.5) * 0.52;

    // Vocal Presence from Real Synchronized Lyrics Engine
    const vocalMod = (Math.sin(songTime * 8.5) * 0.2 + Math.cos(songTime * 14.2) * 0.15 + 0.65);
    const vocalEnergy = isSinging ? (0.55 * vocalMod) : 0.08;

    const time = songTime * 3.5;

    if (mode === 'spectrum') {
      const barCount = 54;
      const gap = 3;
      const barWidth = Math.max(2, (width / barCount) - gap);

      if (!this.cinemaBars || this.cinemaBars.length !== barCount) {
        this.cinemaBars = new Float32Array(barCount);
        this.cinemaPeaks = new Float32Array(barCount);
        this.cinemaPeakHold = new Int8Array(barCount);
      }

      let dataArray = null;
      let bufferLength = 0;
      if (this.isInitialized && this.analyser && isPlaying && !this.isSimulatedVisualizer) {
        bufferLength = this.analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);
      }

      for (let i = 0; i < barCount; i++) {
        let targetPct = 0.04;

        if (dataArray) {
          const idx = Math.floor(i * (bufferLength / barCount));
          targetPct = (dataArray[idx] || 0) / 255;
        } else if (isPlaying) {
          // Multi-Band Beat & Vocal Synthesizer
          if (i <= 14) {
            // Low Frequencies (Sub-Bass & Bass Kick: 30Hz - 180Hz)
            const bassWeight = 1 - (i / 15);
            const subRumble = Math.sin(time * 0.6 + i * 0.3) * 0.12 + 0.18;
            targetPct = (kickImpulse * 0.75 * bassWeight) + subRumble + (Math.sin(time * 1.8 + i) * 0.08);
          } else if (i <= 35) {
            // Mid Frequencies (Vocals, Snare, Guitar, Piano: 200Hz - 3.5kHz)
            const vocalBandWeight = Math.sin(((i - 14) / 21) * Math.PI);
            const midWave = Math.sin(time * 2.2 + i * 0.45) * 0.15 + 0.15;
            targetPct = (vocalEnergy * vocalBandWeight * 1.1) + (snareImpulse * 0.45 * vocalBandWeight) + midWave;
          } else {
            // High Frequencies (Hi-hats, Crash Cymbals, Treble Air: 4kHz - 16kHz)
            const trebleWeight = (i - 35) / 18;
            const shimmer = Math.sin(time * 4.5 + i * 0.8) * 0.14 + 0.16;
            targetPct = (hihatImpulse * trebleWeight * 0.8) + shimmer + (Math.cos(time * 7 + i) * 0.06);
          }

          // Subtle organic jitter
          const jitter = (Math.sin(i * 13.7 + songTime * 19.3) * 0.5 + 0.5) * 0.07;
          targetPct = Math.min(0.96, Math.max(0.04, targetPct + jitter));
        }

        // Real Physical Inertia (Instant Attack + Exponential Gravity Decay)
        if (targetPct > this.cinemaBars[i]) {
          this.cinemaBars[i] = this.cinemaBars[i] * 0.35 + targetPct * 0.65; // Snappy attack
        } else {
          this.cinemaBars[i] = this.cinemaBars[i] * 0.88 + targetPct * 0.12; // Smooth gravity drop
        }

        const pct = this.cinemaBars[i];
        const barHeight = Math.max(4, pct * height * 0.92);
        const x = i * (barWidth + gap) + gap;
        const y = height - barHeight;

        // Dynamic Studio Gradient
        const grad = ctx.createLinearGradient(0, height, 0, y);
        grad.addColorStop(0, '#10b981');
        grad.addColorStop(0.35, '#06b6d4');
        grad.addColorStop(0.72, '#8b5cf6');
        grad.addColorStop(1, '#ec4899');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
        ctx.fill();

        // High-End Floating Peak Hold Dots Physics
        if (pct >= this.cinemaPeaks[i]) {
          this.cinemaPeaks[i] = pct;
          this.cinemaPeakHold[i] = 10; // Hold peak for 10 frames
        } else {
          if (this.cinemaPeakHold[i] > 0) {
            this.cinemaPeakHold[i]--;
          } else {
            this.cinemaPeaks[i] = Math.max(pct, this.cinemaPeaks[i] - 0.022);
          }
        }

        const peakPct = this.cinemaPeaks[i];
        if (peakPct > 0.08) {
          const peakY = height - (peakPct * height * 0.92) - 4;
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#06b6d4';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(x + barWidth / 2, Math.max(3, peakY), Math.min(barWidth / 2, 2.2), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    } else if (mode === 'waveform') {
      // 2. CYBER QUANTUM WAVEFORM (Fluid Pulsing Oscilloscope Ribbon with Beat Reactivity)
      const centerY = height / 2;
      const wavePoints = 120;
      const step = width / wavePoints;
      const beatBoost = isPlaying ? (1 + kickImpulse * 0.6) : 0.25;

      // Primary Wave
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = '#06b6d4';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 10;
      ctx.beginPath();

      for (let i = 0; i <= wavePoints; i++) {
        const x = i * step;
        const norm = (i / wavePoints) * Math.PI * 4;
        const amp = isPlaying ? (height * 0.32 * beatBoost) : (height * 0.04);
        const y = centerY + Math.sin(norm + songTime * 3.5) * amp * Math.cos(norm * 0.5 - songTime * 2.1);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Secondary Harmonizer Wave
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#a855f7';
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 8;
      ctx.beginPath();

      for (let i = 0; i <= wavePoints; i++) {
        const x = i * step;
        const norm = (i / wavePoints) * Math.PI * 5;
        const amp = isPlaying ? (height * 0.24 * (1 + snareImpulse * 0.5)) : (height * 0.03);
        const y = centerY + Math.cos(norm - songTime * 2.8) * amp * Math.sin(norm * 0.6 + songTime * 1.8);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (mode === 'stars') {
      // 3. STARDUST NEBULA PULSE (Beat-Accelerated 3D Particle Swarm)
      if (!this.stardustParticles) this.initStardustParticles();

      const speedMult = isPlaying ? (1.5 + kickImpulse * 2.8) : 0.4;
      const pulseAmp = isPlaying ? (1.2 + kickImpulse * 1.4) : 0.8;

      for (const p of this.stardustParticles) {
        p.x += p.speedX * speedMult;
        p.y += p.speedY * speedMult;

        if (p.x < 0) p.x = 1;
        if (p.x > 1) p.x = 0;
        if (p.y < 0) p.y = 1;
        if (p.y > 1) p.y = 0;

        const px = p.x * width;
        const py = p.y * height;
        const dynamicSize = p.size * (1 + Math.sin(songTime * 5 + p.pulseOffset) * 0.4 * pulseAmp);

        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = isPlaying ? (8 + kickImpulse * 12) : 2;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, dynamicSize), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
  }
}

// Global instance
window.audioEngine = new AudioEngine();
