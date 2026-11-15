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
    this.preGainNode = null;      // Dynamic Headroom Compensation before Bus Glue Compressor
    this.glueCompressor = null;   // SSL-style Studio Bus Glue Compressor for cohesive master polish
    this.peakLimiter = null;      // Transparent True-Peak Limiter
    this.softClipperNode = null;  // Analog Tape Soft-Clipper
    this.subBassDeepNode = null;  // Seismic Sub-Bass Foundation (48Hz)
    this.subBassPunchNode = null; // Kick Drum Slam & Body (88Hz)
    this.stereoPanner = null;
    this.splitter = null;
    this.merger = null;
    this.midGainL = null;
    this.midGainR = null;
    this.baseSideGain = null;     // Full-bandwidth base stereo width (0..1)
    this.extraSideGain = null;    // High-passed (>130Hz) 3D width expansion
    this.sideHighPass = null;     // Keeps sub-bass (<130Hz) tight & centered
    this.binauralDelayL = null;
    this.binauralDelayR = null;
    this.binauralFilter = null;
    this.crossfeedGainL = null;
    this.crossfeedGainR = null;
    this.baseSideInverter = null;
    this.extraSideInverter = null;
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

    // Detect mobile device / Android APK (Desktop/Laptop settings remain 100% untouched)
    this.isMobile = (typeof window !== 'undefined') && (
      Boolean(window.AuraSoundAndroid) ||
      (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ''))
    );

    // Desktop / Laptop Presets (UNCHANGED)
    this.presets = {
      flat: {
        eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        bass: 0,
        width: 1.0,
        comp: { threshold: -6.0, ratio: 1.2, attack: 0.045, release: 0.22 }
      }, // Bit-Transparent Reference (Zero coloration, pure source dynamics)
      dolby: {
        eq: [3.5, 4, 1.5, -1.5, -1, 0.5, 2, 2.5, 3.5, 4.5],
        bass: 3,
        width: 1.35,
        comp: { threshold: -12.0, ratio: 2.0, attack: 0.040, release: 0.19 }
      }, // Dolby Atmos Holographic 3D (Wide cinema depth, airy 16kHz height, center-locked vocals)
      nahimic: {
        eq: [2.5, 4.5, 2, -2, -1.5, 1, 3, 3.5, 3, 2.5],
        bass: 4,
        width: 1.20,
        comp: { threshold: -12.5, ratio: 2.1, attack: 0.038, release: 0.17 }
      }, // Nahimic Bass & Clarity (Tight transient punch, mud-free mids, crisp instrumental detail)
      bassHeavy: {
        eq: [5.5, 6.5, 3, -2.5, -1.5, 0.5, 2, 2.5, 3, 2.5],
        bass: 7,
        width: 1.10,
        comp: { threshold: -11.5, ratio: 2.2, attack: 0.042, release: 0.18 }
      }, // Bass Boost Extreme (Deep physical subwoofer slam without masking vocals or pumping)
      vocal: {
        eq: [-1.5, 0, 1, -1.5, 0, 2.5, 3.5, 2.5, 2, 3],
        bass: 1,
        width: 1.08,
        comp: { threshold: -9.0, ratio: 1.6, attack: 0.030, release: 0.20 }
      }, // Studio Vocal Presence (Warm chest body, intimate 1k-2kHz forwardness, silky zero-sibilance highs)
      electronic: {
        eq: [4.5, 5.5, 2, -2, -2.5, 0, 2.5, 3.5, 4, 4.5],
        bass: 5.5,
        width: 1.30,
        comp: { threshold: -12.0, ratio: 2.1, attack: 0.036, release: 0.17 }
      } // EDM / Synth (Fast kick slam, sculpted mid-pocket, shimmering wide synth leads)
    };

    // Quick Aliases for Bento & Home feed preset pills
    this.presets.bass = this.presets.bassHeavy;
    this.presets.club = this.presets.electronic;

    // Mobile-Only Acoustic Profile (calibrated for smartphone speakers, IEMs & TWS drivers)
    this.mobilePresets = {
      flat: {
        eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        bass: 0,
        width: 1.0,
        comp: { threshold: -6.0, ratio: 1.2, attack: 0.045, release: 0.22 }
      },
      dolby: {
        eq: [4.5, 5.5, 2, -2, -1.5, 1, 3, 3.5, 4.5, 5.5],
        bass: 4,
        width: 1.50,
        comp: { threshold: -11.0, ratio: 1.9, attack: 0.035, release: 0.18 }
      },
      nahimic: {
        eq: [3, 5.5, 2.5, -2.5, -1.5, 1.5, 4, 4.5, 3.5, 3],
        bass: 5,
        width: 1.25,
        comp: { threshold: -11.5, ratio: 2.0, attack: 0.032, release: 0.16 }
      },
      bassHeavy: {
        eq: [6.5, 8, 4, -3, -2, 1, 2.5, 3, 3.5, 3],
        bass: 8,
        width: 1.12,
        comp: { threshold: -10.5, ratio: 2.1, attack: 0.038, release: 0.17 }
      },
      vocal: {
        eq: [-2, 0, 1.5, -2, 0.5, 3.5, 4.5, 3, 2.5, 3.5],
        bass: 1,
        width: 1.08,
        comp: { threshold: -8.5, ratio: 1.6, attack: 0.028, release: 0.19 }
      },
      electronic: {
        eq: [5.5, 7, 2.5, -2.5, -3, 0.5, 3.5, 4.5, 5, 5.5],
        bass: 6.5,
        width: 1.40,
        comp: { threshold: -11.0, ratio: 2.0, attack: 0.032, release: 0.16 }
      }
    };
    this.mobilePresets.bass = this.mobilePresets.bassHeavy;
    this.mobilePresets.club = this.mobilePresets.electronic;

    // Default active DSP gains (Desktop uses Laptop preset; Mobile uses Mobile Acoustic Profile)
    const initPreset = this.isMobile ? this.mobilePresets.dolby : this.presets.dolby;
    this.activePresetName = 'dolby';
    this.currentGains = [...initPreset.eq];
    this.currentBass = initPreset.bass;
    this.spatialWidth = initPreset.width;
    this.currentPlaybackMode = 'native';
  }

  getPresetTable() {
    return this.isMobile ? this.mobilePresets : this.presets;
  }

  syncNativeAndroidDsp() {
    if (!this.isMobile || typeof window === 'undefined') return;
    const bridge = window.AuraSoundAndroid;
    if (!bridge || typeof bridge.applyNativeDsp !== 'function') return;
    try {
      bridge.applyNativeDsp(
        JSON.stringify(this.currentGains || []),
        Number(this.currentBass || 0),
        Number(this.spatialWidth || 1.0)
      );
    } catch (e) {}
  }

  setAudioPlaybackMode(mode) {
    this.currentPlaybackMode = mode === 'yt' ? 'yt' : 'native';
    if (!this.isMobile || typeof window === 'undefined') return;
    const bridge = window.AuraSoundAndroid;
    if (!bridge) return;
    try {
      if (this.currentPlaybackMode === 'yt') {
        if (typeof bridge.setNativeDspBypass === 'function') {
          bridge.setNativeDspBypass(false);
        }
        this.syncNativeAndroidDsp();
      } else {
        if (typeof bridge.setNativeDspBypass === 'function') {
          bridge.setNativeDspBypass(true);
        }
      }
    } catch (e) {}
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
      // Produces deep chest-thumping subwoofer rumble without muddy boxiness or over-stacking
      const subDeepFreq = this.isMobile ? 55 : 48;
      const subDeepScale = this.isMobile ? 0.65 : 0.55;
      const subPunchFreq = this.isMobile ? 92 : 88;
      const subPunchQ = this.isMobile ? 1.65 : 1.85;
      const subPunchScale = this.isMobile ? 0.58 : 0.42;

      this.subBassDeepNode = this.audioCtx.createBiquadFilter();
      this.subBassDeepNode.type = 'lowshelf';
      this.subBassDeepNode.frequency.value = subDeepFreq;
      this.subBassDeepNode.gain.value = this.currentBass * subDeepScale;

      this.subBassPunchNode = this.audioCtx.createBiquadFilter();
      this.subBassPunchNode.type = 'peaking';
      this.subBassPunchNode.frequency.value = subPunchFreq;
      this.subBassPunchNode.Q.value = subPunchQ;
      this.subBassPunchNode.gain.value = this.currentBass * subPunchScale;

      // 2. 10-BAND PRECISION AUDIOPHILE EQ FILTERS (Constant-Q & Surgical Treble)
      this.eqFilters = this.frequencies.map((freq, index) => {
        const filter = this.audioCtx.createBiquadFilter();
        if (index === 0) {
          filter.type = 'lowshelf';
        } else if (index === this.frequencies.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = (freq === 64 || freq === 125) ? 1.45 : (freq >= 4000 ? 1.55 : 1.41);
        }
        filter.frequency.value = freq;
        filter.gain.value = this.currentGains[index] || 0;
        return filter;
      });

      // 3. TRUE 3D BINAURAL HOLOGRAPHIC SPATIALIZER (Zero Comb-Filtering + Sub-Bass Mono Lock)
      // Center-anchored to preserve punchy vocals and kick drum, while expanding >130Hz stereo ambience
      this.splitter = this.audioCtx.createChannelSplitter(2);
      this.merger = this.audioCtx.createChannelMerger(2);

      // Mid Channel (Center Anchor - dry vocals, kick & bass kept 100% solid & intact)
      this.midGainL = this.audioCtx.createGain();
      this.midGainR = this.audioCtx.createGain();
      this.midGainL.gain.value = 0.5;
      this.midGainR.gain.value = 0.5;

      // Side Channel (Stereo Ambience: S = 0.5*L - 0.5*R)
      const sideGainL = this.audioCtx.createGain();
      const sideGainR = this.audioCtx.createGain();
      sideGainL.gain.value = 0.5;
      sideGainR.gain.value = -0.5;

      // Base Side Gain (0.0 to 1.0 - bit-transparent at 1.0, pure mono at 0.0)
      const baseWidth = Math.min(1.0, this.spatialWidth);
      const extraWidth = Math.max(0.0, this.spatialWidth - 1.0);

      this.baseSideGain = this.audioCtx.createGain();
      this.baseSideGain.gain.value = baseWidth;

      this.baseSideInverter = this.audioCtx.createGain();
      this.baseSideInverter.gain.value = -1.0;

      // High-Pass Filter on Extra Width (>130Hz) so sub-bass stays tight & phase-coherent
      this.sideHighPass = this.audioCtx.createBiquadFilter();
      this.sideHighPass.type = 'highpass';
      this.sideHighPass.frequency.value = 130;
      this.sideHighPass.Q.value = 0.707;

      this.extraSideGain = this.audioCtx.createGain();
      this.extraSideGain.gain.value = extraWidth;

      this.extraSideInverter = this.audioCtx.createGain();
      this.extraSideInverter.gain.value = -1.0;

      // Asymmetric Anti-Correlated Haas Reflections (stays purely in Side field, zero center comb-filtering)
      this.binauralFilter = this.audioCtx.createBiquadFilter();
      this.binauralFilter.type = 'lowpass';
      this.binauralFilter.frequency.value = 6500; // Warm head-shadow acoustic dispersion
      this.binauralFilter.Q.value = 0.707;

      this.binauralDelayL = this.audioCtx.createDelay(0.05);
      this.binauralDelayL.delayTime.value = 0.011; // 11ms L early reflection
      this.binauralDelayR = this.audioCtx.createDelay(0.05);
      this.binauralDelayR.delayTime.value = 0.015; // 15ms R early reflection (asymmetric decorrelation)

      const crossfeedAmt = extraWidth > 0 ? Math.min(0.18, extraWidth * 0.18) : 0.0;
      this.crossfeedGainL = this.audioCtx.createGain();
      this.crossfeedGainL.gain.value = crossfeedAmt;
      this.crossfeedGainR = this.audioCtx.createGain();
      this.crossfeedGainR.gain.value = -crossfeedAmt;

      // Connect Mid-Side Matrix
      this.splitter.connect(this.midGainL, 0);
      this.splitter.connect(this.midGainR, 1);
      this.splitter.connect(sideGainL, 0);
      this.splitter.connect(sideGainR, 1);

      // Route Base Side (full bandwidth) and Extra Side (HPF >130Hz)
      sideGainL.connect(this.baseSideGain);
      sideGainR.connect(this.baseSideGain);
      sideGainL.connect(this.sideHighPass);
      sideGainR.connect(this.sideHighPass);
      this.sideHighPass.connect(this.extraSideGain);

      // Recombine Mid + Base Side + Extra Side
      this.midGainL.connect(this.merger, 0, 0);
      this.midGainR.connect(this.merger, 0, 0);
      this.baseSideGain.connect(this.merger, 0, 0);
      this.extraSideGain.connect(this.merger, 0, 0);

      this.midGainL.connect(this.merger, 0, 1);
      this.midGainR.connect(this.merger, 0, 1);
      this.baseSideGain.connect(this.baseSideInverter);
      this.baseSideInverter.connect(this.merger, 0, 1);
      this.extraSideGain.connect(this.extraSideInverter);
      this.extraSideInverter.connect(this.merger, 0, 1);

      // Add Differential Binaural 3D Ambience (disabled completely when width <= 1.0)
      this.sideHighPass.connect(this.binauralFilter);
      this.binauralFilter.connect(this.binauralDelayL);
      this.binauralFilter.connect(this.binauralDelayR);
      this.binauralDelayL.connect(this.crossfeedGainL);
      this.binauralDelayR.connect(this.crossfeedGainR);
      this.crossfeedGainL.connect(this.merger, 0, 0);
      this.crossfeedGainR.connect(this.merger, 0, 1);

      // 4. SPATIAL BALANCE PANNER (if supported)
      if (this.audioCtx.createStereoPanner) {
        this.stereoPanner = this.audioCtx.createStereoPanner();
        this.stereoPanner.pan.value = 0;
      }

      // 4b. DYNAMIC HEADROOM COMPENSATOR (Prevents bass pumping & keeps loudness consistent across modes)
      this.preGainNode = this.audioCtx.createGain();
      this.preGainNode.gain.value = this.computeHeadroomLinearGain();

      // 5. ADAPTIVE STUDIO BUS GLUE COMPRESSOR
      const presetTable = this.getPresetTable();
      const initComp = (presetTable[this.activePresetName] && presetTable[this.activePresetName].comp) || {
        threshold: -12.0,
        ratio: 2.0,
        attack: 0.040,
        release: 0.19
      };
      this.glueCompressor = this.audioCtx.createDynamicsCompressor();
      this.glueCompressor.threshold.value = initComp.threshold;
      this.glueCompressor.knee.value = 16.0;        // 16 dB ultra-soft analog knee
      this.glueCompressor.ratio.value = initComp.ratio;
      this.glueCompressor.attack.value = initComp.attack;
      this.glueCompressor.release.value = initComp.release;

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

        // Chain: source -> subBassDeep -> subBassPunch -> 10-Band EQ -> Mid-Side 3D Spatializer -> Panner -> Headroom Pre-Gain -> Glue Compressor -> Analyser -> Peak Limiter -> SoftClipper -> Gain -> Destination
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

        // Pipe through Headroom Compensator -> Studio Bus Glue Compressor -> Analyser -> True Peak Limiter -> Soft Clipper -> Master Gain
        postMerger.connect(this.preGainNode);
        this.preGainNode.connect(this.glueCompressor);
        this.glueCompressor.connect(this.analyser);
        this.analyser.connect(this.peakLimiter);
        this.peakLimiter.connect(this.softClipperNode);
        this.softClipperNode.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
      }

      this.isInitialized = true;
      console.log('AuraSound Full-Potential Studio DSP Engine initialized (Dual-Stage Bass, 3D Binaural, SSL Glue & Soft-Clipper).');

      // Unlock AudioContext immediately on first user touch/click (critical for Android WebView DSP)
      if (typeof document !== 'undefined' && !this._unlockBound) {
        this._unlockBound = true;
        const unlockAudio = () => {
          this.resume();
        };
        ['touchstart', 'pointerdown', 'click', 'keydown'].forEach(evt => {
          document.addEventListener(evt, unlockAudio, { passive: true });
        });
      }

      // On mobile, sync sliders to Mobile Acoustic Profile defaults
      if (this.isMobile) {
        this.applyPreset(this.activePresetName || 'dolby');
      }

      // Draw initial EQ curve
      setTimeout(() => this.drawEqCurve(), 100);
    } catch (err) {
      console.warn('Audio Context initialization error (will retry upon user gesture):', err);
    }
  }

  resume() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      return this.audioCtx.resume().catch(() => {});
    }
    return Promise.resolve();
  }

  getDuration() {
    if (this.sourceNode && this.sourceNode.mediaElement) {
      return this.sourceNode.mediaElement.duration || 0;
    }
    return 0;
  }

  computeHeadroomLinearGain() {
    const gains = Array.isArray(this.currentGains) ? this.currentGains : [];
    let posSum = 0;
    let maxPos = 0;
    for (let i = 0; i < gains.length; i++) {
      const g = Math.max(0, gains[i] || 0);
      posSum += g;
      if (g > maxPos) maxPos = g;
    }
    const posAvg = gains.length ? (posSum / gains.length) : 0;
    const bassEnergy = Math.max(0, this.currentBass || 0);
    const boostScore = bassEnergy * 0.26 + posAvg * 0.45 + maxPos * 0.14;
    // Mobile speakers/TWS have lower system output headroom; preserve loudness while Desktop keeps exact 3.2dB cap
    const attenDb = this.isMobile
      ? Math.min(1.4, boostScore * 0.35)
      : Math.min(3.2, boostScore * 0.85);
    return Math.pow(10, -attenDb / 20);
  }

  updateHeadroomGain() {
    if (this.preGainNode && this.audioCtx) {
      const now = this.audioCtx.currentTime || 0;
      const target = this.computeHeadroomLinearGain();
      this.preGainNode.gain.cancelScheduledValues(now);
      this.preGainNode.gain.setTargetAtTime(target, now, 0.05);
    }
  }

  setBandGain(bandIndex, gainValue) {
    const val = parseFloat(gainValue);
    this.currentGains[bandIndex] = val;
    if (this.eqFilters[bandIndex] && this.audioCtx) {
      const now = this.audioCtx.currentTime || 0;
      this.eqFilters[bandIndex].gain.cancelScheduledValues(now);
      this.eqFilters[bandIndex].gain.setTargetAtTime(val, now, 0.05);
    }
    this.updateHeadroomGain();
    if (!this._batchUpdating && this.currentPlaybackMode === 'yt') {
      this.syncNativeAndroidDsp();
    }
    const s1 = document.getElementById(`eq-slider-${bandIndex}`);
    if (s1 && s1.value != val) s1.value = val;
    const s2 = document.getElementById(`cinema-eq-slider-${bandIndex}`);
    if (s2 && s2.value != val) s2.value = val;
    this.drawEqCurve();
  }

  setBassBoost(gainValue) {
    const val = parseFloat(gainValue);
    this.currentBass = val;
    const subDeepScale = this.isMobile ? 0.65 : 0.55;
    const subPunchScale = this.isMobile ? 0.58 : 0.42;
    if (this.audioCtx) {
      const now = this.audioCtx.currentTime || 0;
      if (this.subBassDeepNode) {
        this.subBassDeepNode.gain.cancelScheduledValues(now);
        this.subBassDeepNode.gain.setTargetAtTime(val * subDeepScale, now, 0.05);
      }
      if (this.subBassPunchNode) {
        this.subBassPunchNode.gain.cancelScheduledValues(now);
        this.subBassPunchNode.gain.setTargetAtTime(val * subPunchScale, now, 0.05);
      }
    }
    this.updateHeadroomGain();
    if (!this._batchUpdating && this.currentPlaybackMode === 'yt') {
      this.syncNativeAndroidDsp();
    }
    ['bass-boost-slider', 'cinema-bass-boost-slider'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value != val) el.value = val;
    });
    ['bass-boost-val', 'cinema-bass-boost-val'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = `+${val} dB`;
    });
    this.drawEqCurve();
  }

  setSpatialWidth(widthMultiplier) {
    const val = Math.max(0, Math.min(2.0, parseFloat(widthMultiplier)));
    this.spatialWidth = val;
    if (this.audioCtx) {
      const now = this.audioCtx.currentTime || 0;
      const baseWidth = Math.min(1.0, val);
      const extraWidth = Math.max(0.0, val - 1.0);
      const crossfeedAmt = extraWidth > 0 ? Math.min(0.18, extraWidth * 0.18) : 0.0;

      if (this.baseSideGain) {
        this.baseSideGain.gain.cancelScheduledValues(now);
        this.baseSideGain.gain.setTargetAtTime(baseWidth, now, 0.05);
      }
      if (this.extraSideGain) {
        this.extraSideGain.gain.cancelScheduledValues(now);
        this.extraSideGain.gain.setTargetAtTime(extraWidth, now, 0.05);
      }
      if (this.crossfeedGainL && this.crossfeedGainR) {
        this.crossfeedGainL.gain.cancelScheduledValues(now);
        this.crossfeedGainR.gain.cancelScheduledValues(now);
        this.crossfeedGainL.gain.setTargetAtTime(crossfeedAmt, now, 0.05);
        this.crossfeedGainR.gain.setTargetAtTime(-crossfeedAmt, now, 0.05);
      }
      if (this.binauralDelayL && this.binauralDelayR) {
        const delayL = extraWidth > 0 ? Math.min(0.015, 0.009 + extraWidth * 0.006) : 0.011;
        const delayR = extraWidth > 0 ? Math.min(0.020, 0.013 + extraWidth * 0.007) : 0.015;
        this.binauralDelayL.delayTime.cancelScheduledValues(now);
        this.binauralDelayR.delayTime.cancelScheduledValues(now);
        this.binauralDelayL.delayTime.setTargetAtTime(delayL, now, 0.05);
        this.binauralDelayR.delayTime.setTargetAtTime(delayR, now, 0.05);
      }
    }
    if (!this._batchUpdating && this.currentPlaybackMode === 'yt') {
      this.syncNativeAndroidDsp();
    }
    const pct = Math.round(val * 100);
    ['spatial-width-slider', 'cinema-spatial-width-slider'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value != pct) el.value = pct;
    });
    const labelText = pct === 100 ? '100% (Stereo)' : (pct > 100 ? `${pct}% (3D Surround)` : `${pct}% (Fokus Mono)`);
    ['spatial-width-val', 'cinema-spatial-width-val'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = labelText;
    });
  }

  setSpatialPan(panValue) {
    if (this.stereoPanner && this.audioCtx) {
      const now = this.audioCtx.currentTime || 0;
      this.stereoPanner.pan.cancelScheduledValues(now);
      this.stereoPanner.pan.setTargetAtTime(panValue, now, 0.05);
    }
  }

  applyPreset(presetName) {
    const presetTable = this.getPresetTable();
    const preset = presetTable[presetName];
    if (!preset) return;

    this.activePresetName = presetName;

    const values = Array.isArray(preset) ? preset : preset.eq;
    const bassVal = (typeof preset.bass === 'number') ? preset.bass : 0;
    const widthVal = (typeof preset.width === 'number') ? preset.width : 1.0;

    this._batchUpdating = true;
    try {
      values.forEach((val, idx) => {
        this.setBandGain(idx, val);
      });

      this.setBassBoost(bassVal);
      this.setSpatialWidth(widthVal);
    } finally {
      this._batchUpdating = false;
    }

    // Apply mode-specific adaptive Bus Glue Compressor dynamics
    if (this.glueCompressor && this.audioCtx && preset.comp) {
      const now = this.audioCtx.currentTime || 0;
      this.glueCompressor.threshold.setTargetAtTime(preset.comp.threshold, now, 0.06);
      this.glueCompressor.ratio.setTargetAtTime(preset.comp.ratio, now, 0.06);
      this.glueCompressor.attack.setTargetAtTime(preset.comp.attack, now, 0.06);
      this.glueCompressor.release.setTargetAtTime(preset.comp.release, now, 0.06);
    }

    if (this.currentPlaybackMode === 'yt') {
      this.syncNativeAndroidDsp();
    }

    // Sync Preset Buttons Active State in both main drawer and cinema modal
    document.querySelectorAll('.preset-btn, .cinema-preset-btn').forEach(btn => {
      const p = btn.getAttribute('data-preset');
      btn.classList.toggle('active', p === presetName || (presetName === 'bassHeavy' && p === 'bass') || (presetName === 'electronic' && p === 'club'));
    });

    // Update cinema active DSP label chip
    const labelNames = {
      dolby: 'Dolby Atmos',
      nahimic: 'Nahimic Sound',
      bassHeavy: 'Bass Boost',
      bass: 'Bass Boost',
      vocal: 'Vocal Presence',
      electronic: 'EDM Synth',
      club: 'EDM Synth',
      flat: 'Flat Natural'
    };
    const chipText = document.getElementById('cinema-active-dsp-name');
    if (chipText) {
      chipText.textContent = labelNames[presetName] || presetName;
    }

    this.drawEqCurve();
  }

  // Draw Smooth Frequency Response Curve on Canvas
  drawSingleCurve(canvas, ctx) {
    if (!canvas || !ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return;

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

    // Calculate curve points with Dual-Stage Bass Booster contribution
    const count = this.frequencies.length;
    const padX = 20;
    const effWidth = width - padX * 2;
    const points = [];
    const s0 = this.isMobile ? 0.65 : 0.55;
    const s1 = this.isMobile ? 0.58 : 0.42;
    const s2 = this.isMobile ? 0.22 : 0.14;

    for (let i = 0; i < count; i++) {
      const x = padX + (i / (count - 1)) * effWidth;
      let gain = this.currentGains[i] || 0;
      if (i === 0) gain += (this.currentBass || 0) * s0;
      else if (i === 1) gain += (this.currentBass || 0) * s1;
      else if (i === 2) gain += (this.currentBass || 0) * s2;

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

  // Draw Real-Time Frequency Response Curve on Canvas
  drawEqCurve() {
    // 1. Main Drawer Canvas
    const el1 = document.getElementById('eq-curve-canvas');
    if (el1) {
      if (!this.curveCtx || this.curveCanvas !== el1) {
        this.curveCanvas = el1;
        this.curveCtx = el1.getContext('2d');
      }
      this.drawSingleCurve(this.curveCanvas, this.curveCtx);
    }

    // 2. Studio Cinema Canvas
    const el2 = document.getElementById('cinema-eq-curve-canvas');
    if (el2) {
      if (!this.cinemaCurveCtx || this.cinemaCurveCanvas !== el2) {
        this.cinemaCurveCanvas = el2;
        this.cinemaCurveCtx = el2.getContext('2d');
      }
      this.drawSingleCurve(this.cinemaCurveCanvas, this.cinemaCurveCtx);
    }
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
        if (rect.width > 20) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          this.cinemaCanvas.width = (rect.width || 600) * dpr;
          this.cinemaCanvas.height = (rect.height || 160) * dpr;
          this.cinemaCanvasCtx = this.cinemaCanvas.getContext('2d');
          if (this.cinemaCanvasCtx && dpr !== 1) {
            this.cinemaCanvasCtx.scale(dpr, dpr);
          }
          this._cachedCinemaWidth = rect.width;
          this._cachedCinemaHeight = rect.height;
        }
      }
    };
    this.syncCinemaCanvasSize = resize;
    resize();
    window.addEventListener('resize', resize, { passive: true });
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

  setPausedForBackground(paused) {
    this._isBackgroundPaused = Boolean(paused);
    if (this._isBackgroundPaused) {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    } else if ((this.canvas || this.cinemaCanvas) && !this.animationFrameId) {
      this.startVisualizerLoop();
    }
  }

  startVisualizerLoop() {
    if (this._isBackgroundPaused) return;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const render = () => {
      if (this._isBackgroundPaused) {
        this.animationFrameId = null;
        return;
      }
      this.drawVisualizer();
      this.drawCinemaVisualizer();
      this.animationFrameId = requestAnimationFrame(render);
    };

    render();
  }

  getPlaybackContext() {
    let isPlaying = false;
    let songTime = 0;

    // 1. Direct check on window.app
    if (window.app) {
      if (typeof window.app.isPlayingState === 'function') {
        isPlaying = Boolean(window.app.isPlayingState());
      } else if (typeof window.app.isPlaying === 'boolean') {
        isPlaying = window.app.isPlaying;
      }
    }

    // 2. Direct check on DOM body class (toggled by updatePlayState)
    if (!isPlaying && document.body && document.body.classList.contains('music-playing')) {
      isPlaying = true;
    }

    // 3. Check YouTube player state
    if (!isPlaying && window.ytPlayer) {
      if (typeof window.ytPlayer.isPlayingState === 'function') {
        isPlaying = Boolean(window.ytPlayer.isPlayingState());
      } else if (typeof window.ytPlayer.getPlayerState === 'function') {
        try {
          const s = window.ytPlayer.getPlayerState();
          isPlaying = (s === 1 || s === 3);
        } catch (e) {}
      } else {
        isPlaying = Boolean(window.ytPlayer.isPlaying);
      }
    }

    // 4. Check Native/Suno HTML Audio element
    if (!isPlaying && window.app && window.app.nativeAudio) {
      const na = window.app.nativeAudio;
      isPlaying = (!na.paused && !na.ended && (na.currentTime > 0 || na.readyState > 1));
    }

    // Fallback simulation flag
    if (!isPlaying && this.isSimulatedVisualizer) {
      isPlaying = true;
    }

    // Song time retrieval
    if (window.ytPlayer) {
      try {
        if (typeof window.ytPlayer.getCurrentTime === 'function') {
          songTime = window.ytPlayer.getCurrentTime() || 0;
        }
      } catch (e) {}
    }
    if (songTime === 0 && window.app && window.app.nativeAudio) {
      songTime = window.app.nativeAudio.currentTime || 0;
    }
    if (songTime === 0) {
      songTime = (Date.now() / 1000);
    }

    // Check if singing is active in synchronized lyrics
    const isSinging = Boolean(window.app && typeof window.app.activeLyricIdx === 'number' && window.app.activeLyricIdx >= 0);

    return { isPlaying, songTime, isSinging };
  }

  drawVisualizer() {
    if (!this.canvas || !this.canvasCtx) return;
    // Skip calculation & rendering if mini visualizer is hidden (e.g. on mobile devices)
    if (this.canvas.offsetParent === null) return;

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
    let hasRealAudioSignal = false;

    if (this.isInitialized && this.analyser && isPlaying) {
      bufferLength = this.analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let j = 0; j < bufferLength; j += 4) {
        sum += dataArray[j];
        if (sum > 20) {
          hasRealAudioSignal = true;
          break;
        }
      }
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

      if (hasRealAudioSignal) {
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
      } else {
        // Subtle ambient idle breathing when paused (looks alive and premium)
        targetPct = 0.05 + Math.sin((Date.now() / 1000) * 1.5 + i * 0.22) * 0.025;
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

      ctx.fillStyle = isPlaying ? gradient : 'rgba(6, 182, 212, 0.25)';
      ctx.beginPath();
      ctx.roundRect(x, height - barHeight, Math.max(barWidth, 2), barHeight, [4, 4, 0, 0]);
      ctx.fill();

      x += barWidth + 3;
    }
  }

  drawCinemaVisualizer() {
    if (!this.cinemaCanvas || !this.cinemaCanvasCtx) return;

    // Zero-overhead check: Do NOT compute or draw when Studio Cinema is closed!
    if (!window.app || !window.app.cinemaModal || !window.app.cinemaModal.classList.contains('active')) {
      return;
    }

    // Zero-overhead check on Mobile: Visualizer canvas is hidden on mobile screens (< 768px)
    if (window.innerWidth <= 768 || this.cinemaCanvas.offsetParent === null) {
      return;
    }

    const width = this._cachedCinemaWidth || (this.cinemaCanvas.width / (window.devicePixelRatio || 1)) || 600;
    const height = this._cachedCinemaHeight || (this.cinemaCanvas.height / (window.devicePixelRatio || 1)) || 160;
    if (width <= 0 || height <= 0) return;

    const ctx = this.cinemaCanvasCtx;
    const mode = this.cinemaVisMode || 'spectrum';
    const isMobile = (window.innerWidth <= 768);

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
      let hasRealAudioSignal = false;

      if (this.isInitialized && this.analyser && isPlaying) {
        bufferLength = this.analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let j = 0; j < bufferLength; j += 4) {
          sum += dataArray[j];
          if (sum > 20) {
            hasRealAudioSignal = true;
            break;
          }
        }
      }

      for (let i = 0; i < barCount; i++) {
        let targetPct = 0.04;

        if (hasRealAudioSignal) {
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
        } else {
          // Subtle resting ambient pulse when paused
          targetPct = 0.045 + Math.sin((Date.now() / 1000) * 1.8 + i * 0.16) * 0.02;
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
          if (!isMobile) {
            ctx.shadowColor = '#06b6d4';
            ctx.shadowBlur = 6;
          }
          ctx.beginPath();
          ctx.arc(x + barWidth / 2, Math.max(3, peakY), Math.min(barWidth / 2, 2.2), 0, Math.PI * 2);
          ctx.fill();
          if (!isMobile) ctx.shadowBlur = 0;
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
        if (!isMobile) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = isPlaying ? (8 + kickImpulse * 12) : 2;
        }
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, dynamicSize), 0, Math.PI * 2);
        ctx.fill();
      }
      if (!isMobile) ctx.shadowBlur = 0;
    }
  }
}

// Global instance
window.audioEngine = new AudioEngine();
