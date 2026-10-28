/**
 * AuraSound - Main Application Controller
 * Handles Navigation, Search, Audio Playback Dispatcher, Queue, Favorites, Playlists, and Mobile QR Connect
 */

// Global safeguard: automatically intercept and replace 120x90 grey dummy YouTube 404 placeholder thumbnails
document.addEventListener('load', (e) => {
  if (e.target && e.target.tagName === 'IMG') {
    const img = e.target;
    if (img.src && img.src.includes('ytimg.com') && img.naturalWidth === 120 && img.naturalHeight === 90) {
      img.src = '/images/supermix.jpg';
    }
  }
}, true);

class App {
  constructor() {
    this.currentTrack = null;
    this.queue = [];
    this.queueIndex = -1;

    // 1. Instant Synchronous User & Session Hydration (0ms delay / zero reset flash)
    const serverSession = (typeof window !== 'undefined' && window.__AURASOUND_SERVER_SESSION__) 
      ? window.__AURASOUND_SERVER_SESSION__ 
      : null;
    let localGoogleUser = null;
    try {
      localGoogleUser = JSON.parse(localStorage.getItem('aurasound_google_user') || 'null');
    } catch (e) {}

    this.currentUser = serverSession || localGoogleUser || null;

    if (this.currentUser && this.currentUser.email) {
      try {
        localStorage.setItem('aurasound_google_user', JSON.stringify({
          email: this.currentUser.email,
          name: this.currentUser.name,
          avatar: this.currentUser.avatar,
          provider: this.currentUser.provider || 'google'
        }));
        localStorage.setItem('aurasound_login_dismissed', 'true');
        if (this.currentUser.tasteProfile) {
          localStorage.setItem('aurasound_taste_completed', 'true');
        }
      } catch (e) {}
    }

    // 2. Initialize User Profile immediately
    let savedProfile = null;
    try {
      savedProfile = JSON.parse(localStorage.getItem('aurasound_user_profile') || 'null');
    } catch (e) {}

    const initialName = this.currentUser?.name || savedProfile?.name || 'User';
    const initialAvatar = this.currentUser?.avatar || savedProfile?.avatar || '/images/avatar.jpg';
    const initialLang = this.currentUser?.lang || savedProfile?.lang || 'id';

    this.userProfile = {
      name: initialName,
      avatar: initialAvatar,
      lang: initialLang
    };

    try {
      localStorage.setItem('aurasound_user_profile', JSON.stringify(this.userProfile));
    } catch (e) {}

    // 3. Immediately hydrate playHistory if available
    if (serverSession && Array.isArray(serverSession.playHistory) && serverSession.playHistory.length > 0) {
      try {
        const curHist = JSON.parse(localStorage.getItem('aurasound_play_history') || '[]');
        if (curHist.length === 0) {
          localStorage.setItem('aurasound_play_history', JSON.stringify(serverSession.playHistory));
        }
      } catch (e) {}
    }

    // 4. Load User-Isolated Favorites & Playlists immediately with real userKey
    this.favorites = (serverSession && Array.isArray(serverSession.favorites) && serverSession.favorites.length > 0)
      ? serverSession.favorites
      : this.loadFavorites();
    this.playlists = this.loadPlaylists();

    this.currentPlaylistDetail = null;
    this.trackToAddToPlaylist = null;
    this.nativeAudio = null;
    this.currentAudioMode = 'native'; // 'native' (full DSP EQ) | 'yt' (iframe fallback)
    this.activeTab = 'home';
    this.networkInfo = null;
    this.playlistCurrentPage = 1;
    this.playlistPageSize = 10;
    this.albumCurrentPage = 1;
    this.albumPageSize = 10;
    this.currentSearchFilter = 'all';
    this.lastSearchQuery = '';
    this.isShuffle = false;
    this.repeatMode = 'off'; // 'off' | 'all' | 'one'
    this.isMuted = false;
    this.lastVolume = 1.0;

    try { this.initElements(); } catch (e) { console.error('Error initializing elements:', e); }
    try { this.initGoogleAuth(); } catch (e) { console.error('Error initializing google auth:', e); }
    try { this.initProfile(); } catch (e) { console.error('Error initializing profile:', e); }
    try { this.restorePlaybackState(); } catch (e) { console.error('Error restoring playback state:', e); }
    try { this.initAudioElement(); } catch (e) { console.error('Error initializing audio element:', e); }
    try { this.initEventListeners(); } catch (e) { console.error('Error initializing event listeners:', e); }
    try { this.initTasteOnboarding(); } catch (e) { console.error('Error initializing taste onboarding:', e); }
    try { this.loadYTMHome('all'); } catch (e) { console.error('Error loading YTM Home:', e); }
    try { this.syncPlaylistsFromServer(); } catch (e) { console.error('Error syncing playlists:', e); }
    try { this.syncFavoritesFromDb(); } catch (e) { console.error('Error syncing favorites from db:', e); }
    try { this.fetchNetworkInfo(); } catch (e) { console.error('Error fetching network info:', e); }
    try { this.checkPWAInstall(); } catch (e) { console.error('Error checking PWA install:', e); }
    try { this.initEntranceAnimation(); } catch (e) { console.error('Error in entrance animation:', e); }
  }

  initElements() {
    this.playPauseBtn = document.getElementById('play-pause-btn');
    this.prevBtn = document.getElementById('prev-btn');
    this.nextBtn = document.getElementById('next-btn');
    this.shuffleBtn = document.getElementById('btn-shuffle');
    this.repeatBtn = document.getElementById('btn-repeat');
    this.repeatBadge = document.querySelector('#btn-repeat .repeat-badge');
    this.volumeBtn = document.getElementById('volume-icon-btn');
    this.volumeIconHigh = document.getElementById('volume-icon-high');
    this.volumeIconMuted = document.getElementById('volume-icon-muted');
    this.playerMiniVinyl = document.querySelector('.player-mini-vinyl');
    this.playerVinylLabelImg = document.getElementById('player-vinyl-label-img');
    this.progressBar = document.getElementById('progress-bar');
    this.currentTimeEl = document.getElementById('current-time');
    this.durationEl = document.getElementById('duration-time');
    this.volumeSlider = document.getElementById('volume-slider');
    this.playerThumb = document.getElementById('player-thumb');
    this.playerTitle = document.getElementById('player-title');
    this.playerArtist = document.getElementById('player-artist');
    this.badgeSource = document.getElementById('badge-source');
    this.badgeSourceText = document.getElementById('badge-source-text');
    this.visualizerCanvas = document.getElementById('visualizer-canvas');

    // Studio Cinema elements
    this.cinemaModal = document.getElementById('modal-studio-cinema');
    this.btnOpenCinema = document.getElementById('btn-open-cinema');
    this.btnCloseCinema = document.getElementById('btn-close-cinema');
    this.cinemaVisCanvas = document.getElementById('cinema-visualizer-canvas');
    this.cinemaTitle = document.getElementById('cinema-track-title');
    this.cinemaArtist = document.getElementById('cinema-track-artist');
    this.cinemaVinylThumb = document.getElementById('cinema-vinyl-thumb');
    this.cinemaTurntableDeck = document.querySelector('.cinema-turntable-deck');
    this.cinemaLyricsStream = document.getElementById('cinema-lyrics-stream');
    this.cinemaLyricsBadge = document.getElementById('cinema-lyrics-badge');
    this.cinemaProgressBar = document.getElementById('cinema-progress-bar');
    this.cinemaTimeCurrent = document.getElementById('cinema-time-current');
    this.cinemaTimeDuration = document.getElementById('cinema-time-duration');
    this.cinemaBtnPlay = document.getElementById('cinema-btn-play');
    this.cinemaBtnPrev = document.getElementById('cinema-btn-prev');
    this.cinemaBtnNext = document.getElementById('cinema-btn-next');
    this.cinemaBtnFav = document.getElementById('cinema-btn-fav');
    this.btnToggleCinemaVis = document.getElementById('btn-toggle-cinema-vis');
    this.isCinemaVisHidden = false;
    this.btnToggleRomaji = document.getElementById('btn-toggle-romaji');
    this.isRomajiEnabled = localStorage.getItem('aurasound_romaji_enabled') !== 'false';
    this.cinemaLeadInDots = document.getElementById('cinema-lead-in-dots');
    this.cinemaOffsetDisplay = document.getElementById('cinema-offset-display');
    this.currentLyricsLang = null;
    this.currentHasRomaji = false;
    this.currentLyricsData = [];
    this.activeLyricIdx = -1;
    this.lastScrolledLyricIdx = -1;
    this.currentLyricsTrackId = null;
    this.currentLeadingSilence = 0;
    this.hasWordSync = false;
  }

  checkCleanReset() {
    // Permanently disabled: user login & profile MUST NEVER be reset on restart
  }

  // ==========================================
  // ENTRANCE SPLASH & ONBOARDING FLOW (Splash -> Google Login -> Taste Selection)
  // ==========================================
  initEntranceAnimation() {
    const splash = document.getElementById('app-splash-screen');
    if (!splash) {
      this.triggerPostSplashFlow();
      return;
    }

    // Fast, clean, elegant exit (600ms)
    setTimeout(() => {
      splash.classList.add('splash-hiding');
    }, 600);

    setTimeout(() => {
      splash.style.display = 'none';
      this.triggerPostSplashFlow();
    }, 950);
  }

  async triggerPostSplashFlow() {
    if (!this.currentUser || !this.currentUser.email) {
      await this.restoreSessionFromServer();
    }

    // User is logged in -> NEVER popup Google modal or Selera Musik modal on startup!
    if (this.currentUser && this.currentUser.email) {
      const modal = document.getElementById('modal-google-auth');
      if (modal) modal.classList.remove('active');
      const tasteModal = document.getElementById('modal-taste-onboarding');
      if (tasteModal) tasteModal.classList.remove('active');
      try {
        localStorage.setItem('aurasound_taste_completed', 'true');
        localStorage.setItem('aurasound_login_dismissed', 'true');
      } catch (e) {}
      return;
    }

    // Only if user is NOT logged in and hasn't dismissed login
    const isLoginDismissed = localStorage.getItem('aurasound_login_dismissed');
    if (!isLoginDismissed) {
      this.openGoogleLoginModal();
    }
  }

  closeGoogleLoginModal() {
    try {
      localStorage.setItem('aurasound_login_dismissed', 'true');
    } catch (e) {}
    const modal = document.getElementById('modal-google-auth');
    if (modal) modal.classList.remove('active');
  }

  dismissGoogleModalToTaste() {
    try {
      localStorage.setItem('aurasound_login_dismissed', 'true');
    } catch (e) {}
    const modal = document.getElementById('modal-google-auth');
    if (modal) modal.classList.remove('active');
    const isTasteCompleted = localStorage.getItem('aurasound_taste_completed');
    if (!isTasteCompleted) {
      setTimeout(() => {
        this.openTasteModal();
      }, 350);
    }
  }

  getUserKey() {
    if (this.currentUser && this.currentUser.email) {
      return this.currentUser.email.toLowerCase();
    }
    return this.getDeviceId();
  }

  initGoogleAuth() {
    if (!this.currentUser || !this.currentUser.email) {
      try {
        this.currentUser = (typeof window !== 'undefined' && window.__AURASOUND_SERVER_SESSION__) 
          ? window.__AURASOUND_SERVER_SESSION__ 
          : JSON.parse(localStorage.getItem('aurasound_google_user') || 'null');
      } catch (e) {
        this.currentUser = null;
      }
    }

    if (this.currentUser && this.currentUser.email) {
      this.syncUserFromDb();
    } else {
      // Restore persistent session from server disk if not already loaded
      this.restoreSessionFromServer();
    }

    const clientId = '601468560899-3ih48jcehdsiblmv66qlaeb5rto431vd.apps.googleusercontent.com';
    this.googleClientId = clientId;

    const tryInitGsi = () => {
      try {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (res) => this.handleGoogleCredentialResponse(res),
            auto_select: false
          });
          this.renderGoogleSignInButton();
          return true;
        }
      } catch (e) {
        console.log('GSI initialize info:', e);
      }
      return false;
    };

    if (!tryInitGsi()) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (tryInitGsi() || attempts >= 20) {
          clearInterval(interval);
        }
      }, 500);
    }

    this.syncGoogleUI();
  }

  renderGoogleSignInButton() {
    try {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        const btnContainer = document.getElementById('google-official-btn');
        if (btnContainer) {
          btnContainer.innerHTML = '';
          window.google.accounts.id.renderButton(btnContainer, {
            theme: 'filled_blue',
            size: 'large',
            shape: 'pill',
            width: 320,
            text: 'signin_with',
            logo_alignment: 'left'
          });
        }
      }
    } catch (e) {
      console.warn('renderGoogleSignInButton error:', e);
    }
  }

  async restoreSessionFromServer() {
    try {
      const res = await fetch('/api/user/session');
      const data = await res.json();
      if (data.success && data.user && data.user.email) {
        this.currentUser = data.user;
        try {
          localStorage.setItem('aurasound_google_user', JSON.stringify({
            email: data.user.email,
            name: data.user.name,
            avatar: data.user.avatar,
            provider: data.user.provider || 'google'
          }));
          localStorage.setItem('aurasound_login_dismissed', 'true');
          localStorage.setItem('aurasound_taste_completed', 'true');
        } catch (e) {}

        this.userProfile = {
          name: data.user.name || this.userProfile?.name || 'User',
          avatar: data.user.avatar || this.userProfile?.avatar || '/images/avatar.jpg',
          lang: data.user.lang || this.userProfile?.lang || 'id'
        };
        try {
          localStorage.setItem('aurasound_user_profile', JSON.stringify(this.userProfile));
        } catch (e) {}

        if (Array.isArray(data.user.favorites)) {
          this.favorites = data.user.favorites;
          try {
            localStorage.setItem(this.getFavsStorageKey(), JSON.stringify(this.favorites));
          } catch (e) {}
          this.updateFavButtonState();
          if (this.activeTab === 'favorites') this.renderFavorites();
        }

        if (Array.isArray(data.user.playHistory) && data.user.playHistory.length > 0) {
          try {
            const localHist = this.getPlayHistory();
            if (!localHist || localHist.length === 0) {
              localStorage.setItem('aurasound_play_history', JSON.stringify(data.user.playHistory));
            }
          } catch (e) {}
        }

        // Immediately refresh user playlists and favorites
        try {
          this.playlists = this.loadPlaylists();
          this.syncPlaylistsFromServer();
          this.syncFavoritesFromDb();
        } catch (e) {}

        this.syncProfileUI();
        this.syncGoogleUI();

        const heroTitleGlow = document.querySelector('.aura-title-glow');
        if (heroTitleGlow) {
          heroTitleGlow.textContent = this.userProfile.name;
        }

        const modal = document.getElementById('modal-google-auth');
        if (modal) modal.classList.remove('active');
        const tasteModal = document.getElementById('modal-taste-onboarding');
        if (tasteModal) tasteModal.classList.remove('active');
      }
    } catch (err) {
      console.warn('restoreSessionFromServer error:', err);
    }
  }

  async syncUserFromDb() {
    if (!this.currentUser || !this.currentUser.email) return;
    try {
      const userKey = this.getUserKey();
      const res = await fetch(`/api/user/profile?userId=${encodeURIComponent(userKey)}`, {
        headers: {
          'x-user-email': this.currentUser.email,
          'x-user-id': userKey,
          'x-device-id': userKey
        }
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.currentUser = { ...this.currentUser, ...data.user };
        this.userProfile = {
          name: data.user.name || this.userProfile?.name || 'User',
          avatar: data.user.avatar || this.userProfile?.avatar || '/images/avatar.jpg',
          lang: data.user.lang || this.userProfile?.lang || 'id'
        };
        if (Array.isArray(data.user.favorites)) {
          this.favorites = data.user.favorites;
          try {
            localStorage.setItem(this.getFavsStorageKey(), JSON.stringify(this.favorites));
          } catch (e) {}
          this.updateFavButtonState();
          if (this.activeTab === 'favorites') this.renderFavorites();
        }
        if (Array.isArray(data.user.playHistory) && data.user.playHistory.length > 0) {
          try {
            const localHist = this.getPlayHistory();
            if (!localHist || localHist.length === 0) {
              localStorage.setItem('aurasound_play_history', JSON.stringify(data.user.playHistory));
            }
          } catch (e) {}
        }
        this.syncProfileUI();
        this.syncGoogleUI();
      }
    } catch (e) {
      console.warn('syncUserFromDb warning:', e);
    }
  }

  async syncFavoritesFromDb() {
    try {
      const userKey = this.getUserKey();
      const res = await fetch(`/api/user/favorites?userId=${encodeURIComponent(userKey)}`, {
        headers: {
          'x-user-email': this.currentUser?.email || '',
          'x-user-id': userKey,
          'x-device-id': userKey
        }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.favorites)) {
        this.favorites = data.favorites;
        try {
          localStorage.setItem(this.getFavsStorageKey(), JSON.stringify(this.favorites));
        } catch (e) {}
        this.updateFavButtonState();
        if (this.activeTab === 'favorites') this.renderFavorites();
      }
    } catch (e) {
      console.warn('syncFavoritesFromDb error:', e);
    }
  }

  handleGoogleCredentialResponse(response) {
    try {
      if (!response || !response.credential) return;
      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      const payload = JSON.parse(jsonPayload);
      if (payload && payload.email) {
        this.loginWithGoogle({
          email: payload.email,
          name: payload.name || payload.email.split('@')[0],
          avatar: payload.picture || `https://unavatar.io/google/${payload.email}`,
          provider: 'google',
          googleId: payload.sub
        });
      }
    } catch (err) {
      console.error('Error parsing Google credential:', err);
    }
  }

  submitQuickGoogleLogin() {
    const emailInput = document.getElementById('google-input-email');
    const nameInput = document.getElementById('google-input-name');
    if (!emailInput || !emailInput.value.trim()) {
      this.showToast('Silakan masukkan email Google (Gmail) Anda', 'error');
      return;
    }
    const email = emailInput.value.trim().toLowerCase();
    if (!email.includes('@') || !email.includes('.')) {
      this.showToast('Format email tidak valid. Masukkan email Gmail Anda.', 'error');
      return;
    }

    let name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      const rawUser = email.split('@')[0];
      name = rawUser.charAt(0).toUpperCase() + rawUser.slice(1);
    }

    const googleUser = {
      email,
      name,
      avatar: `https://unavatar.io/google/${email}`,
      provider: 'google',
      loggedInAt: Date.now()
    };

    this.loginWithGoogle(googleUser);
  }

  async loginWithGoogle(googleUser) {
    if (!googleUser || !googleUser.email) return;

    this.currentUser = googleUser;
    try {
      localStorage.setItem('aurasound_google_user', JSON.stringify({
        email: googleUser.email,
        name: googleUser.name,
        avatar: googleUser.avatar,
        provider: 'google'
      }));
      localStorage.setItem('aurasound_last_google_email', googleUser.email);
      localStorage.setItem('aurasound_last_google_name', googleUser.name || googleUser.email.split('@')[0]);
      localStorage.setItem('aurasound_login_dismissed', 'true');
    } catch (e) {}

    this.userProfile = {
      name: googleUser.name || 'User',
      avatar: googleUser.avatar || '/images/avatar.jpg',
      lang: this.userProfile?.lang || 'id'
    };
    try {
      localStorage.setItem('aurasound_user_profile', JSON.stringify(this.userProfile));
    } catch (e) {}

    // Persist & sync into Server Database
    try {
      const res = await fetch('/api/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: googleUser.email,
          name: googleUser.name,
          avatar: googleUser.avatar,
          provider: googleUser.provider || 'google',
          googleId: googleUser.googleId
        })
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.currentUser = data.user;
        this.userProfile = {
          name: data.user.name || googleUser.name || 'User',
          avatar: data.user.avatar || googleUser.avatar || '/images/avatar.jpg',
          lang: data.user.lang || this.userProfile?.lang || 'id'
        };
        if (Array.isArray(data.user.favorites)) {
          this.favorites = data.user.favorites;
          try {
            localStorage.setItem(this.getFavsStorageKey(), JSON.stringify(this.favorites));
          } catch (e) {}
        }
      }
    } catch (err) {
      console.warn('Sync login to server DB error:', err);
    }

    // Reload user-isolated playlists from server
    this.playlists = this.loadPlaylists();
    this.syncPlaylistsFromServer();

    this.syncProfileUI();
    this.syncGoogleUI();

    const modal = document.getElementById('modal-google-auth');
    if (modal) modal.classList.remove('active');

    const heroTitleGlow = document.querySelector('.aura-title-glow');
    if (heroTitleGlow) {
      heroTitleGlow.textContent = this.userProfile.name;
    }

    if (this.activeTab === 'favorites') {
      this.renderFavorites();
    } else if (this.activeTab === 'playlists') {
      this.renderPlaylists();
    }

    this.showToast(this.userProfile?.lang === 'en'
      ? `Logged in as ${this.userProfile.name} (${googleUser.email})! ✨`
      : `Akun Google aktif: ${this.userProfile.name} (${googleUser.email})! ✨`, 'success');

    // Step 3: Seamless transition to Pilih Selera Musik ONLY if not already completed
    const isTasteDone = localStorage.getItem('aurasound_taste_completed');
    if (!isTasteDone) {
      setTimeout(() => {
        this.openTasteModal();
      }, 400);
    }
  }

  logoutGoogle() {
    const isEn = this.userProfile?.lang === 'en';
    const msg = isEn ? 'Are you sure you want to log out of your Google account?' : 'Yakin ingin keluar dari akun Google ini?';
    if (!confirm(msg)) return;

    fetch('/api/user/logout', { method: 'POST' }).catch(() => {});

    try {
      localStorage.removeItem('aurasound_google_user');
    } catch (e) {}
    this.currentUser = null;

    this.userProfile = {
      name: 'User',
      avatar: '/images/avatar.jpg',
      lang: this.userProfile?.lang || 'id'
    };
    try {
      localStorage.setItem('aurasound_user_profile', JSON.stringify(this.userProfile));
    } catch (e) {}

    this.favorites = this.loadFavorites();
    this.playlists = this.loadPlaylists();
    this.syncPlaylistsFromServer();

    this.syncProfileUI();
    this.syncGoogleUI();

    const modal = document.getElementById('modal-google-auth');
    if (modal) modal.classList.remove('active');

    if (this.activeTab === 'favorites') {
      this.renderFavorites();
    } else if (this.activeTab === 'playlists') {
      this.renderPlaylists();
    }

    this.showToast(isEn ? 'Logged out from Google account' : 'Berhasil keluar dari akun Google', 'info');
  }

  syncGoogleUI() {
    const btnGoogleLogin = document.getElementById('btn-google-login');
    const googleLoginBtnText = document.getElementById('google-login-btn-text');
    const googleBadgeDot = document.getElementById('google-verified-badge');
    const activeCard = document.getElementById('google-active-user-card');
    const loginOptions = document.getElementById('google-login-options');
    const activeName = document.getElementById('google-active-name');
    const activeEmail = document.getElementById('google-active-email');
    const activeAvatar = document.getElementById('google-active-avatar');
    const profileGoogleEmail = document.getElementById('profile-google-email-text');
    const topUserAvatar = document.getElementById('top-user-avatar');
    const isMobile = window.innerWidth <= 768;

    if (this.currentUser && this.currentUser.email) {
      document.body.classList.add('user-logged-in');
      const displayName = this.currentUser.name || this.currentUser.email.split('@')[0];
      const displayAvatar = this.currentUser.avatar || '/images/avatar.jpg';

      if (btnGoogleLogin) {
        btnGoogleLogin.title = `Akun Google: ${this.currentUser.email}`;
        btnGoogleLogin.classList.add('google-logged-in');
      }
      if (googleLoginBtnText) {
        googleLoginBtnText.textContent = displayName;
      }
      if (googleBadgeDot) {
        googleBadgeDot.style.display = 'block';
        googleBadgeDot.title = `Akun Google Aktif: ${this.currentUser.email}`;
      }
      if (topUserAvatar) {
        topUserAvatar.src = displayAvatar;
        topUserAvatar.onerror = () => { topUserAvatar.src = '/images/avatar.jpg'; };
      }
      if (activeCard) activeCard.style.display = 'block';
      if (loginOptions) loginOptions.style.display = 'none';
      if (activeName) activeName.textContent = displayName;
      if (activeEmail) activeEmail.textContent = this.currentUser.email;
      if (activeAvatar) {
        activeAvatar.src = displayAvatar;
        activeAvatar.onerror = () => { activeAvatar.src = '/images/avatar.jpg'; };
      }
      if (profileGoogleEmail) {
        profileGoogleEmail.textContent = this.currentUser.email;
      }
    } else {
      document.body.classList.remove('user-logged-in');
      if (btnGoogleLogin) {
        btnGoogleLogin.title = 'Masuk dengan Akun Google Anda';
        btnGoogleLogin.classList.remove('google-logged-in');
      }
      if (googleLoginBtnText) {
        googleLoginBtnText.textContent = isMobile ? 'Masuk' : 'Masuk Google';
      }
      if (googleBadgeDot) {
        googleBadgeDot.style.display = 'none';
      }
      if (topUserAvatar) {
        topUserAvatar.src = '/images/avatar.jpg';
      }
      if (activeCard) activeCard.style.display = 'none';
      if (loginOptions) loginOptions.style.display = 'block';
      if (profileGoogleEmail) {
        profileGoogleEmail.textContent = 'Akun Google Belum Masuk';
      }
    }
  }

  handleProfileBadgeClick() {
    if (this.currentUser && this.currentUser.email) {
      this.openProfileModal();
    } else {
      this.openGoogleLoginModal();
    }
  }

  quickResumeLastAccount() {
    const email = localStorage.getItem('aurasound_last_google_email');
    const name = localStorage.getItem('aurasound_last_google_name') || (email ? email.split('@')[0] : 'User');
    if (email) {
      this.loginWithGoogle({
        email,
        name,
        avatar: `https://unavatar.io/google/${email}`,
        provider: 'google'
      });
    }
  }

  openGoogleLoginModal() {
    this.syncGoogleUI();
    this.renderGoogleSignInButton();

    // Check for last saved Google email for 1-Tap quick resume
    const lastEmail = localStorage.getItem('aurasound_last_google_email');
    const lastName = localStorage.getItem('aurasound_last_google_name') || (lastEmail ? lastEmail.split('@')[0] : '');
    const resumeBox = document.getElementById('google-recent-account-chip');
    if (resumeBox) {
      if (lastEmail && (!this.currentUser || !this.currentUser.email)) {
        resumeBox.style.display = 'block';
        const recentName = document.getElementById('recent-account-name');
        const recentEmail = document.getElementById('recent-account-email');
        const recentAvatar = document.getElementById('recent-account-avatar');
        if (recentName) recentName.textContent = lastName;
        if (recentEmail) recentEmail.textContent = lastEmail;
        if (recentAvatar) recentAvatar.src = `https://unavatar.io/google/${lastEmail}`;
      } else {
        resumeBox.style.display = 'none';
      }
    }

    const emailInput = document.getElementById('google-input-email');
    if (emailInput && !emailInput.value && lastEmail) {
      emailInput.value = lastEmail;
    }
    const nameInput = document.getElementById('google-input-name');
    if (nameInput && !nameInput.value && lastName) {
      nameInput.value = lastName;
    }

    const modal = document.getElementById('modal-google-auth');
    if (modal) modal.classList.add('active');
  }

  promptGoogleSwitch() {
    const activeCard = document.getElementById('google-active-user-card');
    const loginOptions = document.getElementById('google-login-options');
    const resumeBox = document.getElementById('google-recent-account-chip');
    if (resumeBox) resumeBox.style.display = 'none';
    if (activeCard) activeCard.style.display = 'none';
    if (loginOptions) {
      loginOptions.style.display = 'block';
      this.renderGoogleSignInButton();
      const emailInput = document.getElementById('google-input-email');
      if (emailInput) {
        emailInput.value = '';
        emailInput.focus();
      }
    }
  }

  openProfileModal() {
    this.syncProfileUI();
    this.syncGoogleUI();
    const modal = document.getElementById('modal-profile');
    if (modal) modal.classList.add('active');
  }

  initProfile() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('aurasound_user_profile') || 'null');
    } catch (e) {}

    const savedAvatar = saved?.avatar;
    const currentAvatar = this.currentUser?.avatar;
    let finalAvatar = '/images/avatar.jpg';
    if (savedAvatar && !savedAvatar.includes('unavatar.io')) {
      finalAvatar = savedAvatar;
    } else if (currentAvatar && !currentAvatar.includes('unavatar.io')) {
      finalAvatar = currentAvatar;
    } else if (savedAvatar) {
      finalAvatar = savedAvatar;
    } else if (currentAvatar) {
      finalAvatar = currentAvatar;
    }

    const activeName = (this.currentUser && this.currentUser.name)
      ? this.currentUser.name
      : ((saved && typeof saved.name === 'string' && saved.name.trim()) ? saved.name.trim() : 'User');

    this.userProfile = {
      name: activeName,
      avatar: finalAvatar,
      lang: saved?.lang || 'id'
    };

    this.tempAvatarDataUrl = null;

    this.syncProfileUI();
    this.syncGoogleUI();
    this.applyLanguage(this.userProfile.lang, false);
  }

  syncProfileUI() {
    if (!this.userProfile) return;
    const isEn = this.userProfile.lang === 'en';

    // Top bar badge
    const badgeImg = document.querySelector('#btn-profile-badge img');
    if (badgeImg && this.userProfile.avatar) {
      badgeImg.src = this.userProfile.avatar;
      badgeImg.onerror = () => { badgeImg.src = '/images/avatar.jpg'; };
    }
    const badge = document.getElementById('btn-profile-badge');
    if (badge) {
      badge.title = `${isEn ? 'User Profile' : 'Profil Akun'}: ${this.userProfile.name}`;
    }

    // Modal elements
    const previewImg = document.getElementById('profile-preview-img');
    if (previewImg && this.userProfile.avatar) {
      previewImg.src = this.userProfile.avatar;
      previewImg.onerror = () => { previewImg.src = '/images/avatar.jpg'; };
    }
    const nameInput = document.getElementById('profile-input-name');
    if (nameInput) {
      nameInput.value = this.userProfile.name;
    }

    // Direct real-time update of Home Hero Soundstage Greeting
    const heroTitleGlow = document.querySelector('.aura-title-glow');
    if (heroTitleGlow) {
      heroTitleGlow.textContent = this.userProfile.name;
    }

    // Language pills
    const pillId = document.getElementById('lang-pill-id');
    const pillEn = document.getElementById('lang-pill-en');
    const radioId = document.querySelector('input[name="app-language"][value="id"]');
    const radioEn = document.querySelector('input[name="app-language"][value="en"]');

    if (isEn) {
      if (pillId) pillId.classList.remove('active');
      if (pillEn) pillEn.classList.add('active');
      if (radioEn) radioEn.checked = true;
    } else {
      if (pillId) pillId.classList.add('active');
      if (pillEn) pillEn.classList.remove('active');
      if (radioId) radioId.checked = true;
    }
  }

  applyLanguage(lang, triggerRerender = true) {
    try {
      const isEn = (lang === 'en');
      if (this.userProfile) {
        this.userProfile.lang = lang;
      }

      // Helper to safely set text content
      const setText = (target, idText, enText) => {
        if (!target) return;
        let elements = [];
        if (typeof target === 'string') {
          try {
            elements = Array.from(document.querySelectorAll(target));
          } catch (e) {
            elements = [];
          }
        } else if ((typeof Element !== 'undefined' && target instanceof Element) || (target && target.nodeType === 1)) {
          elements = [target];
        } else if (target && (Array.isArray(target) || typeof target.forEach === 'function')) {
          elements = Array.from(target);
        }
        elements.forEach(el => {
          if (el) el.textContent = isEn ? enText : idText;
        });
      };

      // Helper to set text node inside an element with icons
      const setNodeText = (target, idText, enText) => {
        if (!target) return;
        let elements = [];
        if (typeof target === 'string') {
          try {
            elements = Array.from(document.querySelectorAll(target));
          } catch (e) {
            elements = [];
          }
        } else if ((typeof Element !== 'undefined' && target instanceof Element) || (target && target.nodeType === 1)) {
          elements = [target];
        } else if (target && (Array.isArray(target) || typeof target.forEach === 'function')) {
          elements = Array.from(target);
        }
        elements.forEach(el => {
          if (!el || !el.childNodes) return;
          el.childNodes.forEach(child => {
            const isText = child && (child.nodeType === 3 || (typeof Node !== 'undefined' && child.nodeType === Node.TEXT_NODE));
            if (isText && child.textContent && child.textContent.trim()) {
              child.textContent = isEn ? enText : idText;
            }
          });
        });
      };

    // 1. Navigation Text (Sidebar & Mobile Nav)
    setNodeText('.nav-link[data-tab="home"], .mobile-nav-item[data-tab="home"]', 'Beranda', 'Home');
    setNodeText('.nav-link[data-tab="playlists"]', 'Playlist Saya', 'My Playlists');
    setNodeText('.mobile-nav-item[data-tab="playlists"]', 'Playlist', 'Playlists');
    setNodeText('.nav-link[data-tab="favorites"]', 'Lagu Favorit', 'Liked Songs');
    setNodeText('.mobile-nav-item[data-tab="favorites"]', 'Favorit', 'Favorites');
    setNodeText('.mobile-nav-item[data-tab="search"]', 'Cari', 'Search');
    setNodeText('.mobile-nav-item[onclick*="modal-connect"]', 'HP Sync', 'Phone Sync');
    setNodeText('.nav-section-title', 'Menu Utama', 'Main Menu');
    setNodeText('#btn-open-connect', 'Buka di Handphone', 'Connect Phone');
    setNodeText('#btn-pwa-install', 'Pasang Aplikasi', 'Install App');

    const audioPill = document.querySelector('.audio-enhancer-pill');
    if (audioPill) {
      audioPill.title = isEn ? 'Audio tuned for Dolby Access and Nahimic processing' : 'Audio diselaraskan untuk diproses oleh Dolby Access dan Nahimic';
      const pillSub = audioPill.querySelector('div div:last-child');
      if (pillSub) pillSub.textContent = isEn ? 'Audio Enhancer Ready' : 'Audio Enhancer Siap';
    }

    // 2. Search Bar & Top Bar
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.placeholder = isEn ? 'Search songs, albums, artists, podcasts...' : 'Cari lagu, album, artis, podcast...';
    }
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
      searchBtn.title = isEn ? 'Search' : 'Cari';
    }
    const btnTopConnect = document.getElementById('btn-top-connect');
    if (btnTopConnect) {
      btnTopConnect.title = isEn ? 'Connect to Phone (Wi-Fi)' : 'Hubungkan ke HP (Wi-Fi)';
    }
    const testBtn = document.getElementById('btn-test-dsp-label');
    if (testBtn && !this.isDspTesting) {
      testBtn.textContent = isEn ? 'Test DSP Audio' : 'Tes Audio DSP';
    }
    const badge = document.getElementById('btn-profile-badge');
    if (badge) {
      badge.title = `${isEn ? 'User Profile' : 'Profil Akun'}: ${this.userProfile.name}`;
    }

    // 3. Mood Chips
    const allChip = document.querySelector('.ytm-chip[data-mood="all"]');
    if (allChip) allChip.textContent = isEn ? '✨ All' : '✨ Semua';
    const relaxChip = document.querySelector('.ytm-chip[data-mood="relax"]');
    if (relaxChip) relaxChip.textContent = isEn ? '☕ Relax & Chill' : '☕ Santai & Relax';

    // 4. Profile Modal Elements
    setText('#profile-modal-title', 'Profil Akun', 'User Profile');
    setText('#profile-modal-desc', 'Kelola profil pribadi dan preferensi bahasa Anda.', 'Manage your personal profile and language preferences.');
    setText('#label-profile-name', 'Nama Pengguna', 'Display Name');
    const profileNameInput = document.getElementById('profile-input-name');
    if (profileNameInput) {
      profileNameInput.placeholder = isEn ? 'Enter your name' : 'Masukkan nama Anda';
    }
    setText('#label-profile-lang', 'Pilih Bahasa', 'App Language');
    setText('#label-change-photo', 'Pilih Foto Baru', 'Choose New Photo');
    setText('#btn-save-profile', 'Simpan Perubahan', 'Save Changes');
    const avatarTriggerWrap = document.getElementById('profile-avatar-trigger');
    if (avatarTriggerWrap) {
      avatarTriggerWrap.title = isEn ? 'Click to change profile picture' : 'Klik untuk ganti foto profil';
    }

    // 5. Search View State
    const searchDisplay = document.getElementById('search-query-display');
    if (searchDisplay) {
      const cur = searchDisplay.textContent || '';
      if (!cur || cur.startsWith('Hasil') || cur.startsWith('Results') || cur.startsWith('Search')) {
        if (searchInput && searchInput.value.trim()) {
          searchDisplay.textContent = isEn ? `Results for: "${searchInput.value.trim()}"` : `Hasil untuk: "${searchInput.value.trim()}"`;
        } else {
          searchDisplay.textContent = isEn ? 'Search Results' : 'Hasil Pencarian';
        }
      }
    }
    const searchEmptyTitle = document.querySelector('#search-results .empty-state h3');
    const searchEmptyP = document.querySelector('#search-results .empty-state p');
    if (searchEmptyTitle) {
      searchEmptyTitle.textContent = isEn ? 'Start Searching Music' : 'Mulai Cari Musik';
    }
    if (searchEmptyP) {
      searchEmptyP.textContent = isEn ? 'Type a song title or artist name in the search bar above.' : 'Ketik judul lagu atau nama penyanyi di kolom pencarian di atas.';
    }

    // Search Filter Pills
    setText('.search-filter-pill[data-filter="all"] .filter-pill-label', 'Semua Versi', 'All Versions');
    setText('.search-filter-pill[data-filter="official"] .filter-pill-label', 'Official Saja', 'Official Only');
    setText('.search-filter-pill[data-filter="nonofficial"] .filter-pill-label', 'Bukan Official (Cover, Remix, Lyrics, Live, Dance)', 'Non-Official (Covers, Remixes, Lyrics, Live, Dance)');

    // 6. Favorites View
    const favTitle = document.querySelector('#view-favorites .section-title');
    if (favTitle) favTitle.textContent = isEn ? 'Liked Songs Collection' : 'Koleksi Lagu Favorit';
    const favEmptyTitle = document.querySelector('#favorites-list .empty-state h3');
    const favEmptyP = document.querySelector('#favorites-list .empty-state p');
    if (favEmptyTitle) favEmptyTitle.textContent = isEn ? 'No liked songs yet' : 'Belum ada lagu favorit';
    if (favEmptyP) favEmptyP.textContent = isEn ? 'Click the heart button on songs you like to collect them here.' : 'Klik tombol hati pada lagu yang Anda sukai untuk mengumpulkannya di sini.';

    // 7. Playlists View
    const plTitle = document.querySelector('#view-playlists .section-title');
    if (plTitle) plTitle.textContent = isEn ? 'My Playlists' : 'Playlist Akun Saya';
    const plDesc = document.querySelector('#view-playlists .section-header p');
    if (plDesc) plDesc.textContent = isEn ? 'Manage your Spotify & YouTube Music playlists and build personal collections.' : 'Kelola playlist Spotify & YouTube Music akun Anda dan buat koleksi lagu pribadi.';
    setNodeText('#btn-open-import-playlist', '+ Impor Playlist & Album', '+ Import Playlist & Album');
    setNodeText('button[onclick*="modal-create-playlist"]', '+ Buat Playlist Baru', '+ Create New Playlist');

    // 8. Suno AI Studio View
    setNodeText('#btn-suno-settings', '🔗 Hubungkan Akun Suno', '🔗 Connect Suno Account');
    const sunoPanels = document.querySelectorAll('.suno-panel');
    if (sunoPanels[0]) {
      setNodeText(sunoPanels[0].querySelector('.suno-panel-title'), 'Buat Lagu Baru dengan AI', 'Create New Song with AI');
      const sub = sunoPanels[0].querySelector('.suno-panel-subtitle');
      if (sub) sub.textContent = isEn ? 'Generate complete songs with instruments and vocals for free.' : 'Hasilkan lagu lengkap dengan instrumen dan vokal secara gratis.';
    }
    setText('label[for="suno-title"]', 'Judul Lagu (Opsional)', 'Song Title (Optional)');
    const sunoTitleInput = document.getElementById('suno-title');
    if (sunoTitleInput) sunoTitleInput.placeholder = isEn ? 'e.g.: Midnight Neon Highway' : 'Contoh: Senja di Pelabuhan';
    setText('label[for="suno-tags"]', 'Genre & Style Musik', 'Music Genre & Style');
    const sunoTagsInput = document.getElementById('suno-tags');
    if (sunoTagsInput) sunoTagsInput.placeholder = isEn ? 'e.g.: Dream pop, nostalgic acoustic, emotional vocal' : 'Contoh: Indonesian pop, nostalgic acoustic, emotional vocal';
    setText('label[for="suno-prompt"]', 'Deskripsi Tema / Lirik Custom', 'Custom Lyrics / Theme Description');
    const sunoPrompt = document.getElementById('suno-prompt');
    if (sunoPrompt) {
      sunoPrompt.placeholder = isEn
        ? "Write your own lyrics or prompt the AI: 'A mellow song about late night memories in the rain...'"
        : "Tulis lirik Anda sendiri atau beri tahu AI: 'Lagu tenang tentang kenangan masa kecil di tengah hujan rintik-rintik...'";
    }
    const instrumentalSpan = document.querySelector('.form-checkbox-wrapper span');
    if (instrumentalSpan) instrumentalSpan.textContent = isEn ? 'Instrumental Only (No Vocals)' : 'Musik Instrumental Saja (Tanpa Vokal)';
    setNodeText('#suno-generate-btn', 'Generate Lagu dengan Suno AI', 'Generate Song with Suno AI');
    if (sunoPanels[1]) {
      setNodeText(sunoPanels[1].querySelector('.suno-panel-title'), 'Daftar Lagu Hasil Suno AI', 'Generated AI Songs Library');
      const sub = sunoPanels[1].querySelector('.suno-panel-subtitle');
      if (sub) sub.textContent = isEn ? 'Created songs are saved automatically and ready to play.' : 'Lagu yang telah dibuat otomatis tersimpan dan siap diputar kapan saja.';
    }
    try {
      if (window.sunoStudio && typeof window.sunoStudio.renderHistory === 'function') {
        window.sunoStudio.renderHistory();
      }
    } catch (e) {
      console.warn('Suno render history warning:', e);
    }

    // 9. Persistent Bottom Player Bar Tooltips
    const playerTitleEl = document.getElementById('player-title');
    if (playerTitleEl && (playerTitleEl.textContent === 'Pilih Lagu untuk Diputar' || playerTitleEl.textContent === 'Select a Song to Play')) {
      playerTitleEl.textContent = isEn ? 'Select a Song to Play' : 'Pilih Lagu untuk Diputar';
    }
    const playerFavBtn = document.getElementById('player-fav-btn');
    if (playerFavBtn) playerFavBtn.title = isEn ? 'Like (Favorite Song)' : 'Favorit (Suka Lagu)';
    const btnShuffle = document.getElementById('btn-shuffle');
    if (btnShuffle) btnShuffle.title = isEn ? 'Shuffle' : 'Acak Lagu (Shuffle)';
    const prevBtn = document.getElementById('prev-btn');
    if (prevBtn) prevBtn.title = isEn ? 'Previous' : 'Sebelumnya';
    const playPauseBtn = document.getElementById('play-pause-btn');
    if (playPauseBtn) playPauseBtn.title = isEn ? 'Play / Pause' : 'Putar / Jeda';
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) nextBtn.title = isEn ? 'Next' : 'Berikutnya';
    const btnRepeat = document.getElementById('btn-repeat');
    if (btnRepeat) btnRepeat.title = isEn ? 'Repeat' : 'Ulangi Lagu (Repeat)';
    const specBezel = document.querySelector('.player-spectrum-bezel');
    if (specBezel) specBezel.title = isEn ? 'Real-Time Frequency Spectrum Visualizer' : 'Visualizer Spektrum Frekuensi Real-Time';
    const cinemaOpenBtn = document.getElementById('btn-open-cinema');
    if (cinemaOpenBtn) cinemaOpenBtn.title = isEn ? 'Studio Cinema & Fullscreen Visualizer' : 'Mode Panggung Studio & Visualizer Layar Penuh';
    const toggleEqBtn = document.getElementById('btn-toggle-eq');
    if (toggleEqBtn) toggleEqBtn.title = isEn ? 'Audio DSP Equalizer (Dolby & Nahimic)' : 'Audio DSP Equalizer (Dolby & Nahimic)';
    const volIconBtn = document.getElementById('volume-icon-btn');
    if (volIconBtn) volIconBtn.title = isEn ? 'Mute / Unmute Volume' : 'Bisukan / Nyalakan Suara';

    // 10. Studio Cinema Modal Tooltips & Text
    const cinemaTrackTitle = document.getElementById('cinema-track-title');
    if (cinemaTrackTitle && (cinemaTrackTitle.textContent === 'Pilih Lagu untuk Diputar' || cinemaTrackTitle.textContent === 'Select a Song to Play')) {
      cinemaTrackTitle.textContent = isEn ? 'Select a Song to Play' : 'Pilih Lagu untuk Diputar';
    }
    const cinemaHint = document.querySelector('.cinema-canvas-hint');
    if (cinemaHint) cinemaHint.textContent = isEn ? '💡 Click canvas to switch real-time visualizer styles' : '💡 Klik canvas untuk mengganti gaya visualizer real-time';
    const cinemaClose = document.getElementById('btn-close-cinema');
    if (cinemaClose) cinemaClose.title = isEn ? 'Close Studio Cinema (ESC)' : 'Tutup Studio Cinema (ESC)';
    const cinemaShuffle = document.getElementById('cinema-btn-shuffle');
    if (cinemaShuffle) cinemaShuffle.title = isEn ? 'Shuffle' : 'Acak (Shuffle)';
    const cinemaPrev = document.getElementById('cinema-btn-prev');
    if (cinemaPrev) cinemaPrev.title = isEn ? 'Previous' : 'Sebelumnya';
    const cinemaPlay = document.getElementById('cinema-btn-play');
    if (cinemaPlay) cinemaPlay.title = isEn ? 'Play / Pause' : 'Putar / Jeda';
    const cinemaNext = document.getElementById('cinema-btn-next');
    if (cinemaNext) cinemaNext.title = isEn ? 'Next' : 'Berikutnya';
    const cinemaFav = document.getElementById('cinema-btn-fav');
    if (cinemaFav) cinemaFav.title = isEn ? 'Like This Song' : 'Suka Lagu Ini';
    const lyricsNote = document.querySelector('.lyrics-loading-note');
    if (lyricsNote) lyricsNote.textContent = isEn ? 'Loading lyrics & rhythm...' : 'Memuat lirik & ritme lagu...';

    // 11. Equalizer Drawer Texts
    const eqCurveTitle = document.querySelector('.eq-curve-title');
    if (eqCurveTitle) eqCurveTitle.textContent = isEn ? 'Real-Time Frequency Response' : 'Respon Frekuensi Real-Time';
    const limiterBadge = document.querySelector('.limiter-badge');
    if (limiterBadge) {
      limiterBadge.title = isEn ? 'Master Brickwall Limiter prevents digital audio distortion' : 'Master Brickwall Limiter mencegah distorsi audio digital';
      setNodeText('.limiter-badge', 'Studio Limiter: Aktif', 'Studio Limiter: Active');
    }
    try {
      if (typeof this.updateEqStatusBanner === 'function') {
        this.updateEqStatusBanner();
      }
    } catch (e) {
      console.warn('updateEqStatusBanner warning:', e);
    }

    // 12. Modals (Connect, Token, Import, Create, Add)
    const connectModalTitle = document.querySelector('#modal-connect .modal-title');
    if (connectModalTitle) connectModalTitle.textContent = isEn ? 'Open on Your Mobile Phone 📱' : 'Buka di Handphone Anda 📱';
    const connectModalDesc = document.querySelector('#modal-connect .modal-desc');
    if (connectModalDesc) connectModalDesc.textContent = isEn ? 'Point your phone camera at the QR code below (make sure phone and laptop are on the same Wi-Fi).' : 'Arahkan kamera HP Anda ke QR Code di bawah (pastikan HP dan laptop terhubung ke Wi-Fi yang sama).';
    const connectTip = document.querySelector('#modal-connect p[style*="font-size: 0.78rem"]');
    if (connectTip) {
      connectTip.textContent = isEn
        ? '💡 On your mobile phone, you can tap "Add to Home Screen" to use it as a native app.'
        : '💡 Di HP, Anda bisa klik tombol "Tambahkan ke Layar Utama" (Add to Home Screen) agar bisa dipakai seperti aplikasi asli.';
    }

    const tokenModalTitle = document.querySelector('#modal-token .modal-title');
    if (tokenModalTitle) tokenModalTitle.textContent = isEn ? 'Connect Suno AI 🎵' : 'Hubungkan Suno AI 🎵';
    const tokenModalDesc = document.querySelector('#modal-token .modal-desc');
    if (tokenModalDesc) tokenModalDesc.textContent = isEn ? 'Select your connection method to Suno AI to generate studio-quality neural music:' : 'Pilih metode koneksi ke Suno AI untuk membuat musik neural berkualitas studio:';
    const autoLoginBtn = document.getElementById('btn-start-auto-login');
    if (autoLoginBtn) autoLoginBtn.innerHTML = isEn ? '🚀 Open Window & Sign In to Suno' : '🚀 Buka Jendela & Login ke Suno';

    const importModalTitle = document.querySelector('#modal-import-playlist .modal-title');
    if (importModalTitle) importModalTitle.textContent = isEn ? 'Import Playlist & Album 📥' : 'Impor Playlist & Album 📥';
    const importModalDesc = document.querySelector('#modal-import-playlist .modal-desc');
    if (importModalDesc) importModalDesc.innerHTML = isEn ? 'Paste playlist or album link from <strong>Spotify</strong> or <strong>YouTube Music</strong>.' : 'Tempel tautan / URL playlist maupun album dari <strong>Spotify</strong> atau <strong>YouTube Music</strong>.';
    const importGuide = document.querySelector('#modal-import-playlist div[style*="background"]');
    if (importGuide) {
      importGuide.innerHTML = isEn
        ? `<strong>💡 How to copy playlist link:</strong><br>
           • <strong>Spotify:</strong> Open Spotify -> Playlist/Album -> Tap <strong>Share</strong> -> choose <strong>Copy Link</strong>.<br>
           • <strong>YouTube Music:</strong> Open Playlist -> Tap <strong>Share</strong> -> choose <strong>Copy Link</strong>.<br>
           • <em>Note:</em> Playlist will be saved automatically to your Playlists tab with high-res cover art!`
        : `<strong>💡 Cara salin link:</strong><br>
           • <strong>Spotify:</strong> Buka Spotify -> Buka Playlist/Album -> Klik <strong>Bagikan (Share)</strong> -> <strong>Salin Tautan</strong>.<br>
           • <strong>YouTube Music:</strong> Buka Playlist -> Klik <strong>Bagikan (Share)</strong> -> <strong>Salin Link</strong>.<br>
           • <em>Tips:</em> Playlist akan otomatis tersimpan di tab Playlist kamu dengan cover art resolusi tinggi!`;
    }
    setText('label[for="input-playlist-url"]', 'URL / Link Playlist atau Album', 'Playlist or Album URL / Link');
    setText('#btn-submit-import', 'Mulai Impor Lagu', 'Start Importing Songs');

    const createModalTitle = document.querySelector('#modal-create-playlist .modal-title');
    if (createModalTitle) createModalTitle.textContent = isEn ? 'Create New Playlist 📁' : 'Buat Playlist Baru 📁';
    const createModalDesc = document.querySelector('#modal-create-playlist .modal-desc');
    if (createModalDesc) createModalDesc.textContent = isEn ? 'Give a name to your new custom playlist.' : 'Beri nama untuk daftar putar kustom Anda.';
    setText('label[for="input-playlist-name"]', 'Nama Playlist', 'Playlist Name');
    const createPlInput = document.getElementById('input-playlist-name');
    if (createPlInput) createPlInput.placeholder = isEn ? 'e.g.: Chill Focus, Midnight Lo-Fi, etc.' : 'Contoh: Lagu Kerja Santai, Lofi Malam, dll';
    const createPlBtn = document.querySelector('#modal-create-playlist button[type="submit"]');
    if (createPlBtn) createPlBtn.textContent = isEn ? 'Create Playlist' : 'Buat Playlist';

    const addPlTitle = document.querySelector('#modal-add-to-playlist .modal-title');
    if (addPlTitle) addPlTitle.textContent = isEn ? 'Add to Playlist ➕' : 'Tambah ke Playlist ➕';
    const addPlDesc = document.querySelector('#modal-add-to-playlist .modal-desc');
    if (addPlDesc) addPlDesc.textContent = isEn ? 'Select the playlist where you want to save this song:' : 'Pilih playlist tempat Anda ingin menyimpan lagu ini:';

    // 13. Dynamic Re-renders for Active Views
    if (triggerRerender) {
      if (this.currentAlbumDetail) {
        if (this.currentAlbumDetail.id === 'liked-music') {
          this.openLikedMusicDetail();
        } else {
          this.openHomeAlbumDetail(this.currentAlbumDetail.id);
        }
      } else if (this.cachedSections) {
        this.renderYTMFullHome(this.cachedSections, this.cachedUser);
      }
      if (this.activeTab === 'playlists') {
        this.renderPlaylists();
      } else if (this.activeTab === 'favorites') {
        this.renderFavorites();
      }
    }
    } catch (err) {
      console.warn('Error in applyLanguage:', err);
    }
  }

  initAudioElement() {
    this.nativeAudio = new Audio();
    this.nativeAudio.crossOrigin = 'anonymous';

    // Hook Web Audio Engine to Native Audio Element for Suno AI & Local audio
    if (window.audioEngine) {
      window.audioEngine.init(this.nativeAudio);
      if (this.visualizerCanvas) {
        window.audioEngine.setupVisualizer(this.visualizerCanvas);
      }
      this.updateEqStatusBanner();
    }

    // Native audio events
    this.nativeAudio.addEventListener('timeupdate', () => {
      if (this.currentAudioMode === 'native' || this.currentTrack?.type === 'suno' || this.currentTrack?.type === 'local') {
        const cur = this.nativeAudio.currentTime;
        const dur = this.nativeAudio.duration || 1;
        this.updateProgress(cur, dur);
        if (!this._lastStateSaveTime || Date.now() - this._lastStateSaveTime > 3000) {
          this._lastStateSaveTime = Date.now();
          this.persistPlaybackState();
        }
      }
    });

    const setBufferingState = (isBuffering) => {
      document.body.classList.toggle('audio-is-buffering', isBuffering);
      const playOrbs = document.querySelectorAll('.btn-play-orb, .cinema-play-orb');
      playOrbs.forEach(orb => orb.classList.toggle('is-buffering', isBuffering));
    };

    this.nativeAudio.addEventListener('loadstart', () => setBufferingState(true));
    this.nativeAudio.addEventListener('waiting', () => setBufferingState(true));
    this.nativeAudio.addEventListener('playing', () => setBufferingState(false));

    this.nativeAudio.addEventListener('canplay', () => {
      setBufferingState(false);
      if (this._pendingSeekTime && this._pendingSeekTime > 0) {
        const seek = this._pendingSeekTime;
        this._pendingSeekTime = 0;
        try {
          this.nativeAudio.currentTime = seek;
        } catch (e) {}
      }
    });

    this.nativeAudio.addEventListener('ended', () => {
      setBufferingState(false);
      this.playNext();
    });

    this.nativeAudio.addEventListener('play', () => {
      setBufferingState(false);
      this.updatePlayState(true);
      if (window.audioEngine) {
        window.audioEngine.isSimulatedVisualizer = false;
        window.audioEngine.resume();
      }
    });

    this.nativeAudio.addEventListener('pause', () => {
      setBufferingState(false);
      this.updatePlayState(false);
    });

    this.nativeAudio.addEventListener('error', () => {
      setBufferingState(false);
    });

    // YouTube Player Callbacks
    if (window.ytPlayer) {
      window.ytPlayer.onProgressCallback = (current, duration) => {
        if (this.currentAudioMode !== 'native' && (!this.currentTrack || this.currentTrack.type === 'youtube' || (this.currentTrack.type !== 'suno' && this.currentTrack.type !== 'local'))) {
          this.updateProgress(current, duration);
          if (!this._lastStateSaveTime || Date.now() - this._lastStateSaveTime > 3000) {
            this._lastStateSaveTime = Date.now();
            this.persistPlaybackState();
          }
        }
      };

      window.ytPlayer.onStateChangeCallback = (isPlaying) => {
        if (this.currentAudioMode !== 'native') {
          this.updatePlayState(isPlaying);
        }
      };
    }
  }

  initEventListeners() {
    // Save playback state when window closes or unloads
    window.addEventListener('beforeunload', () => this.persistPlaybackState());
    window.addEventListener('pagehide', () => this.persistPlaybackState());

    // Navigation Tabs
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = link.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Search Inputs (Top Bar & Dedicated Page Hero)
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchClearBtn = document.getElementById('btn-search-clear');

    const searchPageForm = document.getElementById('search-page-form');
    const searchPageInput = document.getElementById('search-page-input');
    const searchPageBtn = document.getElementById('search-page-btn');
    const searchPageClearBtn = document.getElementById('btn-search-page-clear');

    const executeSearch = (rawQuery) => {
      const q = (rawQuery !== undefined ? rawQuery : (searchInput ? searchInput.value : '')).trim();
      if (!q) return;

      // Sync both input fields
      if (searchInput && searchInput.value !== q) searchInput.value = q;
      if (searchPageInput && searchPageInput.value !== q) searchPageInput.value = q;

      // Hide mobile keyboard immediately to reveal search results
      if (searchInput) searchInput.blur();
      if (searchPageInput) searchPageInput.blur();

      this.switchTab('search');
      this.searchMusic(q);
    };

    const updateClearButtons = (val) => {
      const hasText = Boolean(val && val.trim().length > 0);
      if (searchClearBtn) searchClearBtn.style.display = hasText ? 'flex' : 'none';
      if (searchPageClearBtn) searchPageClearBtn.style.display = hasText ? 'flex' : 'none';
    };

    // 1. Top Bar Search Form & Input
    if (searchForm) {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        executeSearch(searchInput ? searchInput.value : '');
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (searchPageInput && searchPageInput.value !== searchInput.value) {
          searchPageInput.value = searchInput.value;
        }
        updateClearButtons(searchInput.value);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          executeSearch(searchInput.value);
        }
      });
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        executeSearch(searchInput ? searchInput.value : '');
      });
    }

    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        if (searchPageInput) searchPageInput.value = '';
        updateClearButtons('');
      });
    }

    // 2. In-Page Search Hero (Search Tab)
    if (searchPageForm) {
      searchPageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        executeSearch(searchPageInput ? searchPageInput.value : '');
      });
    }

    if (searchPageInput) {
      searchPageInput.addEventListener('input', () => {
        if (searchInput && searchInput.value !== searchPageInput.value) {
          searchInput.value = searchPageInput.value;
        }
        updateClearButtons(searchPageInput.value);
      });
      searchPageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          executeSearch(searchPageInput.value);
        }
      });
    }

    if (searchPageClearBtn) {
      searchPageClearBtn.addEventListener('click', () => {
        if (searchPageInput) {
          searchPageInput.value = '';
          searchPageInput.focus();
        }
        if (searchInput) searchInput.value = '';
        updateClearButtons('');
      });
    }

    // Player Controls
    if (this.playPauseBtn) {
      this.playPauseBtn.addEventListener('click', () => this.togglePlay());
    }
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => this.playPrev());
    }
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => this.playNext());
    }

    // Shuffle & Repeat
    if (this.shuffleBtn) {
      this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
    }
    if (this.repeatBtn) {
      this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
    }

    // Progress Bar scrub with dynamic gradient fill
    if (this.progressBar) {
      this.progressBar.addEventListener('input', (e) => {
        const seekTime = parseFloat(e.target.value);
        const max = parseFloat(this.progressBar.max) || 1;
        const pct = Math.min(100, Math.max(0, (seekTime / max) * 100));
        this.progressBar.style.setProperty('--seek-pct', `${pct.toFixed(2)}%`);
        if (this.currentTimeEl) {
          this.currentTimeEl.textContent = this.formatTime(seekTime);
        }
        if (this.currentAudioMode === 'native' || this.currentTrack?.type === 'suno' || this.currentTrack?.type === 'local') {
          if (this.nativeAudio) this.nativeAudio.currentTime = seekTime;
        } else {
          if (window.ytPlayer) window.ytPlayer.seekTo(seekTime);
        }
      });
    }

    // Volume Mute Button & Slider with dynamic track fill
    if (this.volumeBtn) {
      this.volumeBtn.addEventListener('click', () => this.toggleMute());
    }
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.setVolumeLevel(val / 100);
      });
      // Initial volume fill state
      this.volumeSlider.style.setProperty('--vol-pct', `${this.volumeSlider.value}%`);
    }

    // Favorite Button in Player Bar
    const favBtn = document.getElementById('player-fav-btn');
    if (favBtn) {
      favBtn.addEventListener('click', (e) => {
        if (this.currentTrack) {
          this.toggleFavorite(this.currentTrack, e);
        }
      });
    }

    // Modal Triggers
    const openConnectBtn = document.getElementById('btn-open-connect');
    const topConnectBtn = document.getElementById('btn-top-connect');
    const closeConnectBtn = document.getElementById('btn-close-connect');
    const connectModal = document.getElementById('modal-connect');

    if (openConnectBtn && connectModal) {
      openConnectBtn.addEventListener('click', () => connectModal.classList.add('active'));
    }
    if (topConnectBtn && connectModal) {
      topConnectBtn.addEventListener('click', () => connectModal.classList.add('active'));
    }
    if (closeConnectBtn && connectModal) {
      closeConnectBtn.addEventListener('click', () => connectModal.classList.remove('active'));
    }

    // Studio Cinema Fullscreen Modal Triggers
    if (this.btnOpenCinema) {
      this.btnOpenCinema.addEventListener('click', () => this.openStudioCinema());
    }
    const playerTrackInfo = document.querySelector('.player-track-info');
    if (playerTrackInfo) {
      playerTrackInfo.addEventListener('click', () => this.openStudioCinema());
    }
    const playerThumbWrapEl = document.getElementById('player-thumb-wrap');
    if (playerThumbWrapEl) {
      playerThumbWrapEl.addEventListener('click', () => this.openStudioCinema());
    }
    if (this.btnCloseCinema) {
      this.btnCloseCinema.addEventListener('click', () => this.closeStudioCinema());
    }

    // Visualizer Visibility Toggle (Visualizer vs Fullscreen Karaoke)
    if (this.btnToggleCinemaVis) {
      this.btnToggleCinemaVis.addEventListener('click', () => this.toggleCinemaVisualizer());
    }

    // Romaji / Pinyin Visibility Toggle (Cinema Lyrics)
    if (this.btnToggleRomaji) {
      this.btnToggleRomaji.addEventListener('click', () => this.toggleRomaji());
    }

    // Visualizer Mode Switchers (Cinema)
    document.querySelectorAll('.vis-mode-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.vis-mode-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const mode = chip.getAttribute('data-vismode') || 'spectrum';
        if (window.audioEngine) window.audioEngine.setCinemaVisMode(mode);
      });
    });

    if (this.cinemaVisCanvas) {
      this.cinemaVisCanvas.addEventListener('click', () => {
        if (window.audioEngine) {
          const newMode = window.audioEngine.cycleCinemaVisMode();
          document.querySelectorAll('.vis-mode-chip').forEach(c => {
            c.classList.toggle('active', c.getAttribute('data-vismode') === newMode);
          });
        }
      });
    }

    // Cinema Dock Playback Controls
    const cinemaShuffle = document.getElementById('cinema-btn-shuffle');
    if (cinemaShuffle) {
      cinemaShuffle.addEventListener('click', () => {
        this.toggleShuffle();
        cinemaShuffle.classList.toggle('active', this.isShuffle);
      });
    }
    if (this.cinemaBtnPlay) {
      this.cinemaBtnPlay.addEventListener('click', () => this.togglePlay());
    }
    if (this.cinemaBtnPrev) {
      this.cinemaBtnPrev.addEventListener('click', () => this.playPrev());
    }
    if (this.cinemaBtnNext) {
      this.cinemaBtnNext.addEventListener('click', () => this.playNext());
    }
    if (this.cinemaBtnFav) {
      this.cinemaBtnFav.addEventListener('click', (e) => {
        if (this.currentTrack) {
          this.toggleFavorite(this.currentTrack, e);
        }
      });
    }

    // Cinema Progress Bar scrubbing
    if (this.cinemaProgressBar) {
      this.cinemaProgressBar.addEventListener('input', (e) => {
        const seekTime = parseFloat(e.target.value);
        const max = parseFloat(this.cinemaProgressBar.max) || 1;
        const pct = Math.min(100, Math.max(0, (seekTime / max) * 100));
        this.cinemaProgressBar.style.setProperty('--seek-pct', `${pct.toFixed(2)}%`);
        if (this.cinemaTimeCurrent) {
          this.cinemaTimeCurrent.textContent = this.formatTime(seekTime);
        }
        if (this.progressBar) {
          this.progressBar.value = seekTime;
          this.progressBar.style.setProperty('--seek-pct', `${pct.toFixed(2)}%`);
        }
        if (this.currentTimeEl) {
          this.currentTimeEl.textContent = this.formatTime(seekTime);
        }
        if (this.currentAudioMode === 'native' || this.currentTrack?.type === 'suno' || this.currentTrack?.type === 'local') {
          if (this.nativeAudio) this.nativeAudio.currentTime = seekTime;
        } else {
          if (window.ytPlayer) window.ytPlayer.seekTo(seekTime);
        }
      });
    }

    // Interactive Sing-Along Lyrics Click-to-Seek
    if (this.cinemaLyricsStream) {
      this.cinemaLyricsStream.addEventListener('click', (e) => {
        const line = e.target.closest('.cinema-lyric-line');
        if (!line) return;
        const timeSec = parseFloat(line.getAttribute('data-time'));
        if (!isNaN(timeSec)) {
          this.seekToTimestamp(timeSec);
        }
      });
    }

    // Keyboard shortcuts for Studio Cinema (Escape to close, [ and ] for micro-offset, \ to reset)
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

      if (e.key === 'Escape' && this.cinemaModal && this.cinemaModal.classList.contains('active')) {
        this.closeStudioCinema();
      } else if (this.cinemaModal && this.cinemaModal.classList.contains('active')) {
        if (e.key === '[') {
          this.adjustCurrentTrackOffset(-0.10);
        } else if (e.key === ']') {
          this.adjustCurrentTrackOffset(+0.10);
        } else if (e.key === '\\') {
          this.resetCurrentTrackOffset();
        }
      }
    });

    // Android hardware/gesture back button handler to gracefully close Studio Cinema
    window.addEventListener('popstate', (e) => {
      if (this.cinemaModal && this.cinemaModal.classList.contains('active')) {
        this.closeStudioCinema(true);
      }
    });

    // Initialize rich micro-animations & parallax
    this.initInteractiveInteractions();

    // YouTube Music Mood Filter Chips
    document.querySelectorAll('.ytm-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.ytm-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const mood = chip.getAttribute('data-mood') || 'all';
        this.loadYTMHome(mood);
      });
    });

    // Equalizer Drawer Toggle
    const eqBtn = document.getElementById('btn-toggle-eq');
    const eqDrawer = document.getElementById('eq-drawer');
    const closeEqBtn = document.getElementById('btn-close-eq');

    if (eqBtn && eqDrawer) {
      eqBtn.addEventListener('click', () => {
        const isActive = eqDrawer.classList.toggle('active');
        if (isActive && window.audioEngine) {
          // Sync curve canvas size & render
          const canvas = document.getElementById('eq-curve-canvas');
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 50) {
              canvas.width = rect.width * (window.devicePixelRatio || 1);
              canvas.height = (rect.height || 75) * (window.devicePixelRatio || 1);
            }
          }
          window.audioEngine.drawEqCurve();
          this.updateEqStatusBanner();
        }
      });
    }
    if (closeEqBtn && eqDrawer) {
      closeEqBtn.addEventListener('click', () => eqDrawer.classList.remove('active'));
    }

    // EQ Preset Buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.getAttribute('data-preset');
        window.audioEngine.applyPreset(preset);
        this.showToast(`Preset "${btn.textContent.trim()}" diaktifkan!`, 'info');
      });
    });

    // Bass Boost Slider
    const bassSlider = document.getElementById('bass-boost-slider');
    if (bassSlider) {
      bassSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        window.audioEngine.setBassBoost(val);
        const label = document.getElementById('bass-boost-val');
        if (label) label.textContent = `+${val} dB`;
      });
    }

    // 3D Spatial Soundstage Slider
    const spatialSlider = document.getElementById('spatial-width-slider');
    if (spatialSlider) {
      spatialSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const widthMult = val / 100;
        window.audioEngine.setSpatialWidth(widthMult);
        const label = document.getElementById('spatial-width-val');
        if (label) {
          label.textContent = val === 100 ? '100% (Stereo)' : (val > 100 ? `${val}% (3D Surround)` : `${val}% (Fokus Mono)`);
        }
      });
    }

    // Live DSP Audio Tester Button
    const testDspBtn = document.getElementById('btn-test-dsp');
    if (testDspBtn) {
      testDspBtn.addEventListener('click', () => {
        if (this.isDspTesting) {
          this.stopDspTest();
        } else {
          this.startDspTest();
        }
      });
    }

    // Studio Cinema Equalizer Toggle & Controls
    const cinemaEqDrawer = document.getElementById('cinema-eq-drawer');
    const btnCinemaOpenDsp = document.getElementById('btn-cinema-open-dsp');
    const btnCinemaEq = document.getElementById('cinema-btn-eq');
    const btnCloseCinemaEq = document.getElementById('btn-close-cinema-eq');

    const toggleCinemaEq = () => {
      if (!cinemaEqDrawer) return;
      const isActive = cinemaEqDrawer.classList.toggle('active');
      if (isActive && window.audioEngine) {
        const canvas = document.getElementById('cinema-eq-curve-canvas');
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          if (rect.width > 50) {
            canvas.width = rect.width * (window.devicePixelRatio || 1);
            canvas.height = (rect.height || 75) * (window.devicePixelRatio || 1);
          }
        }
        window.audioEngine.drawEqCurve();
      }
    };

    if (btnCinemaOpenDsp) {
      btnCinemaOpenDsp.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCinemaEq();
      });
    }

    if (btnCinemaEq) {
      btnCinemaEq.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCinemaEq();
      });
    }

    if (btnCloseCinemaEq) {
      btnCloseCinemaEq.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cinemaEqDrawer) cinemaEqDrawer.classList.remove('active');
      });
    }

    // Studio Cinema EQ Preset Buttons
    document.querySelectorAll('.cinema-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset');
        if (window.audioEngine) {
          window.audioEngine.applyPreset(preset);
          this.showToast(`Preset "${btn.textContent.trim()}" diaktifkan! 🎧`, 'info');
        }
      });
    });

    // Studio Cinema Bass Boost Slider
    const cinemaBassSlider = document.getElementById('cinema-bass-boost-slider');
    if (cinemaBassSlider) {
      cinemaBassSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (window.audioEngine) {
          window.audioEngine.setBassBoost(val);
        }
      });
    }

    // Studio Cinema 3D Spatial Soundstage Slider
    const cinemaSpatialSlider = document.getElementById('cinema-spatial-width-slider');
    if (cinemaSpatialSlider) {
      cinemaSpatialSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (window.audioEngine) {
          window.audioEngine.setSpatialWidth(val / 100);
        }
      });
    }

    // Studio Cinema 10-Band Sliders
    for (let idx = 0; idx < 10; idx++) {
      const slider = document.getElementById(`cinema-eq-slider-${idx}`);
      if (slider) {
        slider.addEventListener('input', (e) => {
          if (window.audioEngine) {
            window.audioEngine.setBandGain(idx, parseFloat(e.target.value));
          }
        });
      }
    }

    // Suno AI Form submission
    const sunoForm = document.getElementById('suno-form');
    if (sunoForm) {
      sunoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('suno-title').value.trim();
        const tags = document.getElementById('suno-tags').value.trim();
        const prompt = document.getElementById('suno-prompt').value.trim();
        const instrumental = document.getElementById('suno-instrumental').checked;

        window.sunoStudio.generateSong({
          title,
          tags,
          prompt,
          make_instrumental: instrumental,
          model: 'v6-mini'
        });
      });
    }

    // Quick tag chips in Suno AI
    document.querySelectorAll('.tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tag = chip.getAttribute('data-tag');
        const tagsInput = document.getElementById('suno-tags');
        if (tagsInput) {
          if (tagsInput.value.length > 0 && !tagsInput.value.includes(tag)) {
            tagsInput.value += `, ${tag}`;
          } else if (!tagsInput.value.includes(tag)) {
            tagsInput.value = tag;
          }
        }
      });
    });

    // Playlist Import Form
    const formImportPl = document.getElementById('form-import-playlist');
    if (formImportPl) {
      formImportPl.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = document.getElementById('input-playlist-url').value.trim();
        if (url) {
          this.importPlaylist(url);
        }
      });
    }

    // Playlist Create Form
    const formCreatePl = document.getElementById('form-create-playlist');
    if (formCreatePl) {
      formCreatePl.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('input-playlist-name').value.trim();
        if (name) {
          this.createCustomPlaylist(name);
        }
      });
    }

    // Modal Profile Settings
    const profileBadge = document.getElementById('btn-profile-badge');
    const modalProfile = document.getElementById('modal-profile');
    const closeProfileBtn = document.getElementById('btn-close-profile');
    const avatarTrigger = document.getElementById('profile-avatar-trigger');
    const btnTriggerAvatar = document.getElementById('btn-trigger-avatar-file');
    const avatarInput = document.getElementById('profile-avatar-input');
    const pillId = document.getElementById('lang-pill-id');
    const pillEn = document.getElementById('lang-pill-en');
    const radioId = document.querySelector('input[name="app-language"][value="id"]');
    const radioEn = document.querySelector('input[name="app-language"][value="en"]');
    const formProfile = document.getElementById('form-profile');

    if (profileBadge && modalProfile) {
      profileBadge.addEventListener('click', () => {
        this.syncProfileUI();
        modalProfile.classList.add('active');
      });
    }

    const saveCurrentProfile = () => {
      const nameInput = document.getElementById('profile-input-name');
      const newName = (nameInput && nameInput.value.trim()) || 'User';
      const selectedRadio = document.querySelector('input[name="app-language"]:checked');
      const newLang = selectedRadio ? selectedRadio.value : (this.userProfile?.lang || 'id');

      this.userProfile.name = newName;
      this.userProfile.lang = newLang;
      if (this.tempAvatarDataUrl) {
        this.userProfile.avatar = this.tempAvatarDataUrl;
        this.tempAvatarDataUrl = null;
      }

      if (this.currentUser) {
        this.currentUser.name = newName;
        this.currentUser.avatar = this.userProfile.avatar;
        try {
          localStorage.setItem('aurasound_google_user', JSON.stringify(this.currentUser));
        } catch (e) {}
      }

      try {
        localStorage.setItem('aurasound_user_profile', JSON.stringify(this.userProfile));
      } catch (err) {
        console.warn('Failed to save user profile:', err);
      }

      // Persist to Server Database
      try {
        const userKey = this.getUserKey();
        fetch('/api/user/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': this.currentUser?.email || '',
            'x-user-id': userKey,
            'x-device-id': userKey
          },
          body: JSON.stringify({
            name: newName,
            avatar: this.userProfile.avatar,
            lang: newLang,
            userKey
          })
        }).then(res => res.json()).then(data => {
          if (data && data.success && data.user && data.user.avatar) {
            this.userProfile.avatar = data.user.avatar;
            if (this.currentUser) {
              this.currentUser.avatar = data.user.avatar;
              try {
                localStorage.setItem('aurasound_google_user', JSON.stringify(this.currentUser));
              } catch (e) {}
            }
            try {
              localStorage.setItem('aurasound_user_profile', JSON.stringify(this.userProfile));
            } catch (e) {}
            this.syncProfileUI();
            this.syncGoogleUI();
          }
        }).catch(err => console.warn('Save profile to DB warning:', err));
      } catch (e) {}

      this.syncProfileUI();
      this.applyLanguage(newLang, true);

      // Instantly update any greeting titles currently in DOM
      const heroTitleGlow = document.querySelector('.aura-title-glow');
      if (heroTitleGlow) {
        heroTitleGlow.textContent = newName;
      }
      if (this.cachedSections) {
        this.renderYTMFullHome(this.cachedSections, this.cachedUser);
      }

      if (modalProfile) modalProfile.classList.remove('active');
      this.showToast(newLang === 'en' ? `Profile saved: ${newName}! ✨` : `Profil tersimpan: ${newName}! ✨`, 'success');
    };

    if (closeProfileBtn && modalProfile) {
      closeProfileBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('profile-input-name');
        if (nameInput && nameInput.value.trim() && nameInput.value.trim() !== this.userProfile.name) {
          saveCurrentProfile();
        } else {
          modalProfile.classList.remove('active');
          this.tempAvatarDataUrl = null;
        }
      });
    }

    if (modalProfile) {
      modalProfile.addEventListener('click', (e) => {
        if (e.target === modalProfile) {
          const nameInput = document.getElementById('profile-input-name');
          if (nameInput && nameInput.value.trim() && nameInput.value.trim() !== this.userProfile.name) {
            saveCurrentProfile();
          } else {
            modalProfile.classList.remove('active');
            this.tempAvatarDataUrl = null;
          }
        }
      });
    }

    if (avatarInput) {
      if (avatarTrigger) avatarTrigger.addEventListener('click', () => avatarInput.click());
      if (btnTriggerAvatar) btnTriggerAvatar.addEventListener('click', () => avatarInput.click());

      avatarInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          if (file.size > 3 * 1024 * 1024) {
            this.showToast(this.userProfile?.lang === 'en' ? 'Image size is too large (max 3MB)' : 'Ukuran foto terlalu besar (maksimal 3MB)', 'error');
            return;
          }
          const reader = new FileReader();
          reader.onload = (loadEvent) => {
            this.tempAvatarDataUrl = loadEvent.target.result;
            const previewImg = document.getElementById('profile-preview-img');
            if (previewImg) previewImg.src = this.tempAvatarDataUrl;
          };
          reader.readAsDataURL(file);
        }
      });
    }

    if (pillId && radioId) {
      pillId.addEventListener('click', () => {
        radioId.checked = true;
        pillId.classList.add('active');
        if (pillEn) pillEn.classList.remove('active');
      });
    }

    if (pillEn && radioEn) {
      pillEn.addEventListener('click', () => {
        radioEn.checked = true;
        pillEn.classList.add('active');
        if (pillId) pillId.classList.remove('active');
      });
    }

    if (formProfile) {
      formProfile.addEventListener('submit', (e) => {
        e.preventDefault();
        saveCurrentProfile();
      });
    }
  }

  initInteractiveInteractions() {
    // On mobile touch devices, disable mousemove parallax and 3D card tilt to conserve GPU/battery and maintain 120 FPS
    if (('ontouchstart' in window) || window.innerWidth <= 768) {
      return;
    }

    // 1. Fluid Ambient Aurora Mesh Cursor Parallax on Beranda
    let mouseMoveRaf = null;
    window.addEventListener('mousemove', (e) => {
      if (mouseMoveRaf) return;
      mouseMoveRaf = requestAnimationFrame(() => {
        const xPct = (e.clientX / window.innerWidth) * 100;
        const yPct = (e.clientY / window.innerHeight) * 100;
        document.documentElement.style.setProperty('--mouse-x', `${xPct.toFixed(1)}%`);
        document.documentElement.style.setProperty('--mouse-y', `${yPct.toFixed(1)}%`);
        mouseMoveRaf = null;
      });
    }, { passive: true });

    // 2. Interactive 3D Card Tilt with Specular Dynamic Reflection
    const cardSelectors = '.aura-spotlight-card, .aura-bento-card, .aura-vinyl-card, .aura-cinema-card, .aura-mix-modern-card, .aura-resonance-tile, .modern-card, .quick-card, .explore-genre-card';
    let currentTiltedCard = null;
    let tiltRaf = null;

    document.addEventListener('mousemove', (e) => {
      const card = e.target.closest(cardSelectors);
      if (!card) {
        if (currentTiltedCard) {
          currentTiltedCard.style.transform = '';
          currentTiltedCard.style.removeProperty('--glare-x');
          currentTiltedCard.style.removeProperty('--glare-y');
          currentTiltedCard = null;
        }
        return;
      }

      if (currentTiltedCard && currentTiltedCard !== card) {
        currentTiltedCard.style.transform = '';
        currentTiltedCard.style.removeProperty('--glare-x');
        currentTiltedCard.style.removeProperty('--glare-y');
      }
      currentTiltedCard = card;

      if (tiltRaf) return;
      tiltRaf = requestAnimationFrame(() => {
        if (currentTiltedCard) {
          const rect = currentTiltedCard.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const rotX = ((y - centerY) / centerY) * -5.5;
          const rotY = ((x - centerX) / centerX) * 5.5;
          const glareX = (x / rect.width) * 100;
          const glareY = (y / rect.height) * 100;

          currentTiltedCard.style.transform = `perspective(900px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateY(-3px) scale3d(1.012, 1.012, 1.012)`;
          currentTiltedCard.style.setProperty('--glare-x', `${glareX.toFixed(1)}%`);
          currentTiltedCard.style.setProperty('--glare-y', `${glareY.toFixed(1)}%`);
        }
        tiltRaf = null;
      });
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      if (currentTiltedCard) {
        currentTiltedCard.style.transform = '';
        currentTiltedCard.style.removeProperty('--glare-x');
        currentTiltedCard.style.removeProperty('--glare-y');
        currentTiltedCard = null;
      }
    });

    // 3. Tactile Ripple Effect on Interactive Controls & Sidebar Navigation
    document.addEventListener('click', (e) => {
      const target = e.target.closest('.interactive-btn, .nav-link, .ytm-chip, .btn-primary, .btn-secondary, .tag-chip, .preset-btn, .vis-mode-chip, .cinema-ctrl-btn, .cinema-dock-play, .aura-btn-hero-primary, .aura-btn-hero-glass, .aura-btn-hero-outline');
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const circle = document.createElement('span');
      const diameter = Math.max(rect.width, rect.height) * 1.4;
      const radius = diameter / 2;

      circle.style.width = circle.style.height = `${diameter}px`;
      circle.style.left = `${e.clientX - rect.left - radius}px`;
      circle.style.top = `${e.clientY - rect.top - radius}px`;
      circle.className = 'interactive-ripple';

      const existing = target.querySelector('.interactive-ripple');
      if (existing) existing.remove();

      target.appendChild(circle);
      setTimeout(() => circle.remove(), 650);
    });
  }

  playLikedRadio() {
    // Invalidate cached album so it rebuilds fresh with current favorites
    if (this.homeAlbums) {
      delete this.homeAlbums['mix-liked-radio'];
    }
    this.playHomeAlbum('mix-liked-radio', false);
  }

  syncFavoritesCountAndViews() {
    const count = this.favorites ? this.favorites.length : 0;

    // 1. Update Hero button text
    const heroFavText = document.getElementById('hero-fav-count-text');
    if (heroFavText) {
      heroFavText.textContent = `Radio Favorit (${count})`;
    }

    // 2. Update Bento Pod stat count
    const bentoLikedCount = document.getElementById('bento-liked-count');
    if (bentoLikedCount) {
      bentoLikedCount.textContent = count;
    }

    // 3. Clear cached radio album so next click immediately regenerates with new favorites
    if (this.homeAlbums) {
      delete this.homeAlbums['mix-liked-radio'];
    }

    // 4. Update Favorites Tab if active
    if (this.activeTab === 'favorites') {
      this.renderFavorites();
    }

    // 5. Update Home Liked Music detail view if currently open
    const detailView = document.getElementById('home-album-detail-view');
    if (detailView && detailView.style.display !== 'none') {
      if (this.currentAlbumDetail?.id === 'liked-music') {
        const isEn = this.userProfile?.lang === 'en';
        const metaCount = document.getElementById('home-album-meta-count');
        if (metaCount) metaCount.textContent = `${count} ${isEn ? 'Songs' : 'Lagu'}`;
        const tracksCount = document.getElementById('home-album-tracks-count');
        if (tracksCount) tracksCount.textContent = `${isEn ? 'Liked Songs List' : 'Daftar Lagu Disukai'} (${count})`;

        this.currentAlbumDetail.tracks = this.favorites || [];
        this.renderPaginatedAlbumTracks(this.albumCurrentPage);
      } else if (this.currentAlbumDetail?.id === 'mix-liked-radio') {
        // Auto-refresh the Liked Radio view!
        this.openHomeAlbumDetail('mix-liked-radio');
      }
    }
  }

  spawnHeartBurst(clientX, clientY) {
    const count = 10;
    const icons = ['❤️', '💖', '✨', '🎶', '💫'];
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('span');
      particle.className = 'heart-burst-particle';
      particle.textContent = icons[Math.floor(Math.random() * icons.length)];

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const dist = 36 + Math.random() * 48;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 28;

      particle.style.setProperty('--dx', `${dx.toFixed(1)}px`);
      particle.style.setProperty('--dy', `${dy.toFixed(1)}px`);
      particle.style.setProperty('--r', `${(Math.random() * 60 - 30).toFixed(0)}deg`);
      particle.style.left = `${clientX}px`;
      particle.style.top = `${clientY}px`;
      particle.style.fontSize = `${13 + Math.floor(Math.random() * 9)}px`;

      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 900);
    }
  }

  openStudioCinema() {
    if (!this.cinemaModal) return;
    this.cinemaModal.classList.add('active');
    document.body.classList.add('cinema-mode-active');

    // Android Back Button / Gesture support via history state
    try {
      if (!window.history.state || window.history.state.modal !== 'cinema') {
        window.history.pushState({ modal: 'cinema' }, '');
      }
    } catch (e) {}

    if (window.audioEngine) {
      if (this.cinemaVisCanvas && !this._cinemaVisInitialized) {
        window.audioEngine.setupCinemaVisualizer(this.cinemaVisCanvas);
        this._cinemaVisInitialized = true;
      } else if (window.audioEngine && typeof window.audioEngine.syncCinemaCanvasSize === 'function') {
        window.audioEngine.syncCinemaCanvasSize();
      }

      // Sync active DSP preset label & buttons
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
      const curPreset = window.audioEngine.activePresetName || 'dolby';
      const chipText = document.getElementById('cinema-active-dsp-name');
      if (chipText) {
        chipText.textContent = labelNames[curPreset] || curPreset;
      }

      document.querySelectorAll('.cinema-preset-btn').forEach(btn => {
        const p = btn.getAttribute('data-preset');
        btn.classList.toggle('active', p === curPreset || (curPreset === 'bassHeavy' && p === 'bass') || (curPreset === 'electronic' && p === 'club'));
      });

      // Synchronize curve canvas sizing & render
      setTimeout(() => {
        const canvas = document.getElementById('cinema-eq-curve-canvas');
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          if (rect.width > 50) {
            canvas.width = rect.width * (window.devicePixelRatio || 1);
            canvas.height = (rect.height || 75) * (window.devicePixelRatio || 1);
          }
        }
        window.audioEngine.drawEqCurve();
      }, 120);
    }

    this.syncCinemaTrackInfo();
    this.updatePlayState(this.isPlayingState());
  }

  closeStudioCinema(fromPopState = false) {
    if (!this.cinemaModal) return;
    this.cinemaModal.classList.remove('active');
    document.body.classList.remove('cinema-mode-active');
    const cinemaEqDrawer = document.getElementById('cinema-eq-drawer');
    if (cinemaEqDrawer) cinemaEqDrawer.classList.remove('active');

    // Sync history state if user clicked on-screen close button ✕
    if (!fromPopState) {
      try {
        if (window.history.state && window.history.state.modal === 'cinema') {
          window.history.back();
        }
      } catch (e) {}
    }
  }

  toggleCinemaVisualizer() {
    this.isCinemaVisHidden = !this.isCinemaVisHidden;
    if (this.cinemaModal) {
      this.cinemaModal.classList.toggle('cinema-vis-hidden', this.isCinemaVisHidden);
    }
    if (this.btnToggleCinemaVis) {
      this.btnToggleCinemaVis.classList.toggle('active-karaoke', this.isCinemaVisHidden);
      const label = this.btnToggleCinemaVis.querySelector('.vis-toggle-label');
      if (label) {
        label.textContent = this.isCinemaVisHidden ? '🎤 Karaoke Fokus (Visualizer OFF)' : 'Visualizer: ON';
      }
    }
    if (!this.isCinemaVisHidden && window.audioEngine && this.cinemaVisCanvas) {
      setTimeout(() => {
        window.audioEngine.setupCinemaVisualizer(this.cinemaVisCanvas);
      }, 60);
    }
  }

  toggleRomaji() {
    this.isRomajiEnabled = !this.isRomajiEnabled;
    try {
      localStorage.setItem('aurasound_romaji_enabled', String(this.isRomajiEnabled));
    } catch (e) {}
    this.updateRomajiUI();
  }

  updateRomajiUI() {
    const panel = document.getElementById('cinema-lyrics-panel');
    if (panel) {
      panel.classList.toggle('hide-romaji', !this.isRomajiEnabled);
    }
    if (this.btnToggleRomaji) {
      this.btnToggleRomaji.classList.toggle('active', this.isRomajiEnabled);
      const label = this.btnToggleRomaji.querySelector('.romaji-chip-label');
      if (label) {
        let langName = 'Romaji';
        if (this.currentLyricsLang === 'ko') langName = 'Romaja';
        else if (this.currentLyricsLang === 'zh') langName = 'Pinyin';
        label.textContent = `${langName}: ${this.isRomajiEnabled ? 'ON' : 'OFF'}`;
      }
    }
  }

  isPlayingState() {
    if (this.currentAudioMode === 'native' || this.currentTrack?.type === 'suno' || this.currentTrack?.type === 'local') {
      return this.nativeAudio && !this.nativeAudio.paused;
    }
    if (window.ytPlayer) {
      if (typeof window.ytPlayer.isPlayingState === 'function') {
        return window.ytPlayer.isPlayingState();
      }
      return Boolean(window.ytPlayer.isPlaying);
    }
    return false;
  }

  cleanArtistName(artist) {
    if (!artist) return 'AuraSound';
    return artist
      .replace(/\s*•\s*(?:official\s*(?:music\s*video|video|audio|mv)?|mv|video|audio).*/gi, '')
      .replace(/\s*-\s*(?:topic|official|vevo|records|entertainment).*/gi, '')
      .replace(/\s*[\(\[\{](?:official\s*(?:music\s*video|video|audio|mv)?|mv|video|audio|hd|4k)[\)\]\}]/gi, '')
      .replace(/\b(?:official\s*music\s*video|official\s*mv|official\s*audio|official\s*video)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || artist;
  }

  syncCinemaTrackInfo() {
    if (!this.currentTrack) return;
    if (this.cinemaTitle) this.cinemaTitle.textContent = this.currentTrack.title;
    if (this.cinemaArtist) {
      this.cinemaArtist.textContent = this.cleanArtistName(this.currentTrack.artist);
    }
    if (this.cinemaVinylThumb) {
      this.cinemaVinylThumb.src = this.currentTrack.thumbnail || '/images/supermix.jpg';
      this.cinemaVinylThumb.onerror = () => { this.cinemaVinylThumb.src = '/images/supermix.jpg'; };
    }
    if (this.cinemaBtnFav) {
      const isFav = this.isFavorited(this.currentTrack.id);
      this.cinemaBtnFav.classList.toggle('active', isFav);
      const svg = this.cinemaBtnFav.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', isFav ? '#10b981' : 'none');
        svg.setAttribute('stroke', isFav ? '#10b981' : 'currentColor');
      }
    }
    this.renderCinemaLyrics(this.currentTrack);
  }

  async renderCinemaLyrics(track) {
    if (!this.cinemaLyricsStream || !track) return;

    this.activeLyricIdx = -1;
    this.lastScrolledLyricIdx = -1;
    this.currentLyricsData = [];
    this.lyricsAlignPending = false;
    if (this.cinemaLeadInDots) {
      this.cinemaLeadInDots.style.display = 'none';
    }

    const trackId = track.id || track.videoId || track.title;
    this.currentLyricsTrackId = trackId;

    // 1. If lyrics already cached in track instance
    if (track._parsedLyrics && Array.isArray(track._parsedLyrics) && track._parsedLyrics.length > 0) {
      this.currentLyricsData = track._parsedLyrics;
      this.currentLyricsLang = track._lyricsLang || null;
      this.currentHasRomaji = Boolean(track._hasRomaji);
      this.lyricsAlignPending = Boolean(track._lyricsAlignPending);
      this.displayLyricsList(this.currentLyricsData, track._lyricsType || 'synced', track._lyricsLang, this.currentHasRomaji);
      const curTime = this.getCurrentPlaybackTime();
      this.updateActiveLyricsLine(curTime);
      return;
    }

    // 2. If it's a Suno AI track with prompt lyrics
    if (track.type === 'suno' && track.prompt && typeof track.prompt === 'string' && track.prompt.includes('\n')) {
      const lines = track.prompt.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('[') && !l.startsWith('('));
      
      const duration = this.parseDuration(track.duration) || 180;
      const interval = duration / (lines.length + 1);
      this.currentLyricsData = lines.map((text, idx) => ({
        time: Math.floor(interval * (idx + 0.6)),
        text
      }));
      track._parsedLyrics = this.currentLyricsData;
      track._lyricsType = 'suno_ai';
      this.displayLyricsList(this.currentLyricsData, 'suno_ai');
      const curTime = this.getCurrentPlaybackTime();
      this.updateActiveLyricsLine(curTime);
      return;
    }

    // 3. Show sleek animated loading state
    this.cinemaLyricsStream.innerHTML = `
      <div class="cinema-lyrics-status">
        <div class="cinema-lyrics-pulse-wave">
          <span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="cinema-lyrics-status-text">Mencari lirik terbaik & sinkronisasi tempo...</div>
        <div class="cinema-lyrics-status-sub">${this.escapeHtml(track.title)}</div>
      </div>
    `;
    if (this.cinemaLyricsBadge) {
      this.cinemaLyricsBadge.style.display = 'inline-flex';
      this.cinemaLyricsBadge.className = 'cinema-lyrics-badge loading';
      this.cinemaLyricsBadge.textContent = 'MENCARI LIRIK...';
    }
    if (this.btnToggleRomaji) {
      this.btnToggleRomaji.style.display = 'none';
    }

    const durSec = Number(track.seconds) || this.parseDuration(track.duration) || (window.audioEngine?.getDuration() ? Math.round(window.audioEngine.getDuration()) : 0);
    if (durSec > 0 && !track.seconds) track.seconds = durSec;

    try {
      const queryParams = new URLSearchParams({
        title: track.title || '',
        artist: track.artist || '',
        duration: durSec > 0 ? String(durSec) : '',
        videoId: track.id || ''
      });

      const res = await fetch(`/api/lyrics?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();

      // Guard against race conditions if song switched during fetch
      if (this.currentLyricsTrackId !== trackId) return;

      this.currentLeadingSilence = Number(data.leadingSilence) || 0;
      this.hasWordSync = Boolean(data.hasWordSync);
      this.updateOffsetDisplay();

      // Primary: Use pre-romanized parsedLyrics if available from server
      if (data.found && data.parsedLyrics && Array.isArray(data.parsedLyrics) && data.parsedLyrics.length > 0) {
        this.currentLyricsData = data.parsedLyrics;
        this.currentLyricsLang = data.detectedLang || null;
        this.currentHasRomaji = Boolean(data.hasRomaji);
        track._parsedLyrics = data.parsedLyrics;
        track._lyricsType = data.syncedLyrics ? 'synced' : 'plain';
        track._lyricsLang = data.detectedLang || null;
        track._hasRomaji = this.currentHasRomaji;
        track._hasWordSync = this.hasWordSync;

        this.displayLyricsList(data.parsedLyrics, track._lyricsType, data.detectedLang, this.currentHasRomaji, this.hasWordSync);
        const curTime = this.getCurrentPlaybackTime();
        this.updateActiveLyricsLine(curTime);
        return;
      }

      if (data.found && data.syncedLyrics) {
        // Parse LRC format [mm:ss.xx] fallback
        const lrcLines = data.syncedLyrics.split('\n');
        const parsed = [];
        const lrcRegex = /^\[(\d{2}):(\d{2}(?:\.\d+)?)\]\s*(.*)$/;
        for (const line of lrcLines) {
          const match = line.trim().match(lrcRegex);
          if (match) {
            const m = parseInt(match[1], 10);
            const s = parseFloat(match[2]);
            const time = m * 60 + s;
            const text = match[3].trim();
            if (text) {
              parsed.push({ time, text });
            }
          }
        }

        if (parsed.length > 0) {
          this.currentLyricsData = parsed;
          track._parsedLyrics = parsed;
          track._lyricsType = 'synced';
          this.displayLyricsList(parsed, 'synced');
          const curTime = this.getCurrentPlaybackTime();
          this.updateActiveLyricsLine(curTime);
          return;
        }
      }

      if (data.found && data.plainLyrics) {
        // Plain lyrics: spread lines across duration
        const rawLines = data.plainLyrics.split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0 && !l.startsWith('[') && !l.startsWith('('));
        const dur = this.parseDuration(track.duration) || data.duration || 180;
        const interval = dur / (rawLines.length + 1);
        const parsed = rawLines.map((text, idx) => ({
          time: Math.floor(interval * (idx + 0.6)),
          text
        }));

        this.currentLyricsData = parsed;
        track._parsedLyrics = parsed;
        track._lyricsType = 'plain';
        this.displayLyricsList(parsed, 'plain');
        const curTime = this.getCurrentPlaybackTime();
        this.updateActiveLyricsLine(curTime);
        return;
      }

      if (data.instrumental) {
        if (this.cinemaLyricsBadge) {
          this.cinemaLyricsBadge.className = 'cinema-lyrics-badge info';
          this.cinemaLyricsBadge.textContent = 'INSTRUMENTAL';
        }
        if (this.btnToggleRomaji) {
          this.btnToggleRomaji.style.display = 'none';
        }
        if (this.cinemaLeadInDots) {
          this.cinemaLeadInDots.style.display = 'none';
        }
        this.cinemaLyricsStream.innerHTML = `
          <div class="cinema-lyrics-empty">
            <div class="cinema-lyrics-empty-icon">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
            </div>
            <div class="cinema-lyrics-empty-title">Trek Instrumental</div>
            <div class="cinema-lyrics-empty-desc">Lagu ini tidak memiliki vokal. Nikmati alunan instrumen & resonansi visualizer studio.</div>
          </div>
        `;
        return;
      }

      // No lyrics found
      if (this.cinemaLyricsBadge) {
        this.cinemaLyricsBadge.className = 'cinema-lyrics-badge muted';
        this.cinemaLyricsBadge.textContent = 'TIDAK ADA LIRIK';
      }
      if (this.btnToggleRomaji) {
        this.btnToggleRomaji.style.display = 'none';
      }
      if (this.cinemaLeadInDots) {
        this.cinemaLeadInDots.style.display = 'none';
      }
      this.cinemaLyricsStream.innerHTML = `
        <div class="cinema-lyrics-empty">
          <div class="cinema-lyrics-empty-icon">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          <div class="cinema-lyrics-empty-title">Lirik Belum Tersedia</div>
          <div class="cinema-lyrics-empty-desc">Lirik untuk lagu "<b>${this.escapeHtml(track.title)}</b>" belum terdaftar dalam database sinkronisasi.</div>
        </div>
      `;
    } catch (err) {
      if (this.currentLyricsTrackId !== trackId) return;
      if (this.cinemaLyricsBadge) {
        this.cinemaLyricsBadge.style.display = 'none';
      }
      if (this.btnToggleRomaji) {
        this.btnToggleRomaji.style.display = 'none';
      }
      if (this.cinemaLeadInDots) {
        this.cinemaLeadInDots.style.display = 'none';
      }
      this.cinemaLyricsStream.innerHTML = `
        <div class="cinema-lyrics-empty">
          <div class="cinema-lyrics-empty-desc">Gagal memuat lirik. Silakan periksa koneksi internet Anda.</div>
        </div>
      `;
    }
  }

  displayLyricsList(lines, type = 'synced', lang = null, hasRomaji = false, hasWordSync = false) {
    if (!this.cinemaLyricsStream) return;

    this.currentLyricsLang = lang || this.currentLyricsLang;
    const hasRomajiLines = Boolean(hasRomaji) || (Array.isArray(lines) && lines.some(item => Boolean(item.romaji)));
    this.currentHasRomaji = hasRomajiLines;
    this.hasWordSync = Boolean(hasWordSync) || (Array.isArray(lines) && lines.some(item => Array.isArray(item.words) && item.words.length > 0));

    // Handle Romaji Toggle Chip visibility
    if (this.btnToggleRomaji) {
      if (hasRomajiLines) {
        this.btnToggleRomaji.style.display = 'inline-flex';
        this.updateRomajiUI();
      } else {
        this.btnToggleRomaji.style.display = 'none';
      }
    }

    if (this.cinemaLyricsBadge) {
      this.cinemaLyricsBadge.style.display = 'inline-flex';
      if (type === 'synced') {
        if (this.hasWordSync) {
          if (this.currentLyricsLang === 'ja') {
            this.cinemaLyricsBadge.className = 'cinema-lyrics-badge romaji-ja';
            this.cinemaLyricsBadge.innerHTML = `<span class="badge-dot pulse"></span> 🇯🇵 SYLLABLE ROMAJI`;
          } else if (this.currentLyricsLang === 'ko') {
            this.cinemaLyricsBadge.className = 'cinema-lyrics-badge romaji-ko';
            this.cinemaLyricsBadge.innerHTML = `<span class="badge-dot pulse"></span> 🇰🇷 SYLLABLE ROMAJA`;
          } else if (this.currentLyricsLang === 'zh') {
            this.cinemaLyricsBadge.className = 'cinema-lyrics-badge romaji-zh';
            this.cinemaLyricsBadge.innerHTML = `<span class="badge-dot pulse"></span> 🇨🇳 SYLLABLE PINYIN`;
          } else {
            this.cinemaLyricsBadge.className = 'cinema-lyrics-badge synced';
            this.cinemaLyricsBadge.innerHTML = `<span class="badge-dot pulse"></span> ✨ APPLE TTML SYNC`;
          }
        } else {
          if (this.currentLyricsLang === 'ja') {
            this.cinemaLyricsBadge.className = 'cinema-lyrics-badge romaji-ja';
            this.cinemaLyricsBadge.innerHTML = `<span class="badge-dot pulse"></span> 🇯🇵 ROMAJI SYNC`;
          } else if (this.currentLyricsLang === 'ko') {
            this.cinemaLyricsBadge.className = 'cinema-lyrics-badge romaji-ko';
            this.cinemaLyricsBadge.innerHTML = `<span class="badge-dot pulse"></span> 🇰🇷 ROMAJA SYNC`;
          } else if (this.currentLyricsLang === 'zh') {
            this.cinemaLyricsBadge.className = 'cinema-lyrics-badge romaji-zh';
            this.cinemaLyricsBadge.innerHTML = `<span class="badge-dot pulse"></span> 🇨🇳 PINYIN SYNC`;
          } else {
            this.cinemaLyricsBadge.className = 'cinema-lyrics-badge synced';
            this.cinemaLyricsBadge.innerHTML = `<span class="badge-dot pulse"></span> KARAOKE SYNC`;
          }
        }
      } else if (type === 'suno_ai') {
        this.cinemaLyricsBadge.className = 'cinema-lyrics-badge suno';
        this.cinemaLyricsBadge.innerHTML = `<span class="badge-dot"></span> AI GENERATED`;
      } else {
        this.cinemaLyricsBadge.className = 'cinema-lyrics-badge plain';
        this.cinemaLyricsBadge.textContent = 'LIRIK TEKS';
      }
    }

    const panel = document.getElementById('cinema-lyrics-panel');
    if (panel) {
      panel.classList.toggle('hide-romaji', !this.isRomajiEnabled);
    }

    // Render Lyrics: Original Script + Syllable Spans + Romaji/Pinyin
    this.cinemaLyricsStream.innerHTML = lines.map((item, idx) => {
      let mainContent = '';
      if (Array.isArray(item.words) && item.words.length > 0) {
        let searchPos = 0;
        const lineText = item.text || '';
        mainContent = item.words.map((w, wIdx) => {
          let hasSpace = false;
          if (w.trailingSpace !== undefined && typeof w.trailingSpace === 'boolean') {
            hasSpace = w.trailingSpace;
          } else if (lineText) {
            const fIdx = lineText.indexOf(w.text, searchPos);
            if (fIdx !== -1) {
              searchPos = fIdx + w.text.length;
              hasSpace = (searchPos < lineText.length && /\s/.test(lineText[searchPos]));
            } else {
              hasSpace = (wIdx < item.words.length - 1);
            }
          } else {
            hasSpace = (wIdx < item.words.length - 1);
          }
          return `<span class="cinema-lyric-word ${hasSpace ? 'has-space' : ''}" data-begin="${w.begin}" data-end="${w.end}">${this.escapeHtml(w.text)}</span>`;
        }).join('');
      } else {
        mainContent = this.escapeHtml(item.text);
      }

      let romajiContent = '';
      if (item.romaji) {
        const rWords = (Array.isArray(item.romajiWords) && item.romajiWords.length > 0)
          ? item.romajiWords
          : (Array.isArray(item.words) && item.words.some(w => w.romaji) ? item.words.map(w => ({ text: w.romaji || w.text, begin: w.begin, end: w.end, trailingSpace: w.trailingSpace })) : null);

        if (rWords && rWords.length > 0) {
          let rSearchPos = 0;
          const romajiLineText = item.romaji || '';
          romajiContent = `<div class="lyric-romaji-text">` + rWords.map((w, wIdx) => {
            let hasSpace = false;
            if (romajiLineText) {
              const fIdx = romajiLineText.indexOf(w.text, rSearchPos);
              if (fIdx !== -1) {
                rSearchPos = fIdx + w.text.length;
                hasSpace = (rSearchPos < romajiLineText.length && /\s/.test(romajiLineText[rSearchPos]));
              } else {
                hasSpace = (wIdx < rWords.length - 1);
              }
            } else if (w.trailingSpace !== undefined && typeof w.trailingSpace === 'boolean') {
              hasSpace = w.trailingSpace;
            } else {
              hasSpace = (wIdx < rWords.length - 1);
            }
            return `<span class="cinema-lyric-word-romaji ${hasSpace ? 'has-space' : ''}" data-begin="${w.begin}" data-end="${w.end}">${this.escapeHtml(w.text)}</span>`;
          }).join('') + `</div>`;
        } else {
          romajiContent = `<div class="lyric-romaji-text">${this.escapeHtml(item.romaji)}</div>`;
        }
      }

      const hasWordSync = (Array.isArray(item.words) && item.words.length > 0) || (Array.isArray(item.romajiWords) && item.romajiWords.length > 0);
      return `
        <div class="cinema-lyric-line ${item.romaji ? 'has-romaji' : ''} ${hasWordSync ? 'has-word-sync' : ''}" data-idx="${idx}" data-time="${item.time}" title="Klik untuk lompat ke ${this.formatTime(item.time)}">
          <div class="lyric-main-text">${mainContent}</div>
          ${romajiContent}
        </div>
      `;
    }).join('');
  }

  getCurrentPlaybackTime() {
    if (this.currentAudioMode === 'native' || this.currentTrack?.type === 'suno' || this.currentTrack?.type === 'local') {
      return this.nativeAudio ? (this.nativeAudio.currentTime || 0) : 0;
    }
    return window.ytPlayer ? (window.ytPlayer.getCurrentTime() || 0) : 0;
  }

  startLyricsSyncLoop() {
    if (this._lyricsSyncRaf) return;
    const tick = () => {
      if (this.isPlaying) {
        const cur = this.getCurrentPlaybackTime();
        if (cur !== undefined && !isNaN(cur)) {
          this.updateActiveLyricsLine(cur);
        }
        this._lyricsSyncRaf = requestAnimationFrame(tick);
      } else {
        this._lyricsSyncRaf = null;
      }
    };
    this._lyricsSyncRaf = requestAnimationFrame(tick);
  }

  stopLyricsSyncLoop() {
    if (this._lyricsSyncRaf) {
      cancelAnimationFrame(this._lyricsSyncRaf);
      this._lyricsSyncRaf = null;
    }
  }

  seekToTimestamp(seekTime) {
    if (this.currentAudioMode === 'native' || this.currentTrack?.type === 'suno' || this.currentTrack?.type === 'local') {
      if (this.nativeAudio) {
        this.nativeAudio.currentTime = seekTime;
        if (this.nativeAudio.paused) this.nativeAudio.play().catch(() => {});
      }
    } else {
      if (window.ytPlayer) {
        window.ytPlayer.seekTo(seekTime);
        if (!window.ytPlayer.isPlaying) window.ytPlayer.play();
      }
    }
    const dur = this.parseDuration(this.currentTrack?.duration) || 180;
    const pct = Math.min(100, Math.max(0, (seekTime / dur) * 100));
    if (this.progressBar) {
      this.progressBar.value = seekTime;
      this.progressBar.style.setProperty('--seek-pct', `${pct.toFixed(2)}%`);
    }
    if (this.currentTimeEl) {
      this.currentTimeEl.textContent = this.formatTime(seekTime);
    }
    if (this.cinemaProgressBar) {
      this.cinemaProgressBar.value = seekTime;
      this.cinemaProgressBar.style.setProperty('--seek-pct', `${pct.toFixed(2)}%`);
    }
    if (this.cinemaTimeCurrent) {
      this.cinemaTimeCurrent.textContent = this.formatTime(seekTime);
    }
    this.lastScrolledLyricIdx = -1;
    this.updateActiveLyricsLine(seekTime);
  }

  updateActiveLyricsLine(currentSecs) {
    if (!this.cinemaLyricsStream || !this.currentLyricsData || this.currentLyricsData.length === 0) {
      if (this.cinemaLeadInDots) this.cinemaLeadInDots.style.display = 'none';
      return;
    }

    const userOffset = this.getCurrentTrackOffset();
    const isYt = (this.currentAudioMode !== 'native' && this.currentTrack?.type !== 'suno' && this.currentTrack?.type !== 'local');
    // True Acoustic Latency Alignment:
    // Neutralizes the ~220ms audio output queue latency of Chromium's YouTube iframe audio pipeline.
    // Locks syllable sweeps strictly onto the physical sound waves leaving the speakers,
    // permanently eliminating the forward-rush ("kecepetan").
    const acousticLatencyOffset = isYt ? -0.22 : 0.0;
    const syncTime = Math.max(0, currentSecs + acousticLatencyOffset + userOffset);
    let activeIdx = -1;
    for (let i = 0; i < this.currentLyricsData.length; i++) {
      if (syncTime >= this.currentLyricsData[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }

    // Better Lyrics Lead-in Countdown Dots (• • •) during intro and vocal breaks
    if (this.cinemaLeadInDots) {
      let showLeadIn = false;
      const firstLine = this.currentLyricsData[0];
      if (syncTime < firstLine.time) {
        // Intro countdown: 4.5s down to 0.2s before first lyric line
        const diff = firstLine.time - syncTime;
        if (diff <= 4.5 && diff >= 0.2) {
          showLeadIn = true;
        }
      } else if (activeIdx >= 0 && activeIdx < this.currentLyricsData.length - 1) {
        // Interlude break: when gap between current line and next line is >= 4.0s
        const currentLine = this.currentLyricsData[activeIdx];
        const nextLine = this.currentLyricsData[activeIdx + 1];
        const gap = nextLine.time - currentLine.time;
        if (gap >= 4.0) {
          const diff = nextLine.time - syncTime;
          if (diff <= 3.8 && diff >= 0.2) {
            showLeadIn = true;
          }
        }
      }
      this.cinemaLeadInDots.style.display = showLeadIn ? 'inline-flex' : 'none';
    }

    // Smooth scroll anticipation: subtle 120ms glide into the golden-ratio upper third (36%)
    const scrollLeadTime = syncTime + 0.12;
    let scrollTargetIdx = activeIdx;
    for (let i = 0; i < this.currentLyricsData.length; i++) {
      if (scrollLeadTime >= this.currentLyricsData[i].time) {
        scrollTargetIdx = i;
      } else {
        break;
      }
    }
    if (scrollTargetIdx !== this.lastScrolledLyricIdx && scrollTargetIdx >= 0) {
      this.lastScrolledLyricIdx = scrollTargetIdx;
      const targetLine = this.cinemaLyricsStream.querySelector(`.cinema-lyric-line[data-idx="${scrollTargetIdx}"]`);
      if (targetLine) {
        const stream = this.cinemaLyricsStream;
        const lineTop = targetLine.offsetTop;
        const lineHeight = targetLine.offsetHeight;
        const streamHeight = stream.clientHeight;
        const targetScroll = Math.max(0, lineTop - (streamHeight * 0.36) + (lineHeight / 2));
        stream.scrollTo({ top: targetScroll, behavior: 'smooth' });
      }
    }

    if (activeIdx !== this.activeLyricIdx) {
      this.activeLyricIdx = activeIdx;
      this.cinemaLyricsStream.classList.toggle('has-active', activeIdx >= 0);

      const lines = this.cinemaLyricsStream.querySelectorAll('.cinema-lyric-line');
      lines.forEach((line, idx) => {
        const isActive = (idx === activeIdx);
        line.classList.toggle('active', isActive);
        if (idx < activeIdx) {
          // Past lines: ensure all syllables are fully swept and marked passed
          if (line.classList.contains('has-word-sync')) {
            const allWords = line.querySelectorAll('.cinema-lyric-word, .cinema-lyric-word-romaji');
            allWords.forEach(w => {
              w.style.setProperty('--fill-pct', '100%');
              w.classList.remove('active');
              w.classList.add('passed');
            });
          }
        } else if (idx > activeIdx) {
          // Future lines: reset syllables to initial unhighlighted state
          if (line.classList.contains('has-word-sync')) {
            const allWords = line.querySelectorAll('.cinema-lyric-word, .cinema-lyric-word-romaji');
            allWords.forEach(w => {
              w.style.setProperty('--fill-pct', '0%');
              w.classList.remove('active', 'passed');
            });
          }
        }
      });
    }

    // Syllable-Level Continuous Gradient Sweep Animation (Apple Music & Better Lyrics standard)
    if (activeIdx >= 0) {
      const activeLineEl = this.cinemaLyricsStream.querySelector(`.cinema-lyric-line[data-idx="${activeIdx}"]`);
      if (activeLineEl && activeLineEl.classList.contains('has-word-sync')) {
        const words = activeLineEl.querySelectorAll('.cinema-lyric-word');
        words.forEach(w => {
          const begin = parseFloat(w.getAttribute('data-begin'));
          const end = parseFloat(w.getAttribute('data-end'));
          const duration = (isNaN(end) || isNaN(begin) || end <= begin) ? 0.3 : (end - begin);

          if (syncTime >= begin && syncTime < end) {
            let fillPct = ((syncTime - begin) / duration) * 100;
            if (isNaN(fillPct)) fillPct = 0;
            fillPct = Math.min(100, Math.max(0, fillPct));
            w.style.setProperty('--fill-pct', `${fillPct.toFixed(1)}%`);
            w.classList.add('active');
            w.classList.remove('passed');
          } else if (syncTime >= end) {
            w.style.setProperty('--fill-pct', '100%');
            w.classList.remove('active');
            w.classList.add('passed');
          } else {
            w.style.setProperty('--fill-pct', '0%');
            w.classList.remove('active', 'passed');
          }
        });

        const romajiWords = activeLineEl.querySelectorAll('.cinema-lyric-word-romaji');
        romajiWords.forEach(w => {
          const begin = parseFloat(w.getAttribute('data-begin'));
          const end = parseFloat(w.getAttribute('data-end'));
          const duration = (isNaN(end) || isNaN(begin) || end <= begin) ? 0.3 : (end - begin);

          if (syncTime >= begin && syncTime < end) {
            let fillPct = ((syncTime - begin) / duration) * 100;
            if (isNaN(fillPct)) fillPct = 0;
            fillPct = Math.min(100, Math.max(0, fillPct));
            w.style.setProperty('--fill-pct', `${fillPct.toFixed(1)}%`);
            w.classList.add('active');
            w.classList.remove('passed');
          } else if (syncTime >= end) {
            w.style.setProperty('--fill-pct', '100%');
            w.classList.remove('active');
            w.classList.add('passed');
          } else {
            w.style.setProperty('--fill-pct', '0%');
            w.classList.remove('active', 'passed');
          }
        });
      }
    }
  }

  getTrackOffsetKey() {
    if (!this.currentTrack) return null;
    return `aura_offset_${this.currentTrack.id || (this.currentTrack.title + '_' + (this.currentTrack.artist || ''))}`;
  }

  getCurrentTrackOffset() {
    // 100% Automatic Timing: manual calibration buttons have been removed.
    // Always return 0 so stale localStorage keys cannot distort acoustic synchronization.
    return 0;
  }

  adjustCurrentTrackOffset(deltaSec) {
    const key = this.getTrackOffsetKey();
    if (!key) return;
    let cur = this.getCurrentTrackOffset();
    cur = Math.round((cur + deltaSec) * 100) / 100;
    cur = Math.max(-5.0, Math.min(5.0, cur));
    localStorage.setItem(key, String(cur));
    this.updateOffsetDisplay();
    const t = this.getCurrentPlaybackTime();
    this.updateActiveLyricsLine(t);
    this.showToast(`Kalibrasi lirik: ${cur > 0 ? '+' : ''}${cur.toFixed(2)}s`, 'info');
  }

  resetCurrentTrackOffset() {
    const key = this.getTrackOffsetKey();
    if (!key) return;
    localStorage.removeItem(key);
    this.updateOffsetDisplay();
    const t = this.getCurrentPlaybackTime();
    this.updateActiveLyricsLine(t);
    this.showToast('Offset lirik direset ke 0.00s', 'info');
  }

  updateOffsetDisplay() {
    if (!this.cinemaOffsetDisplay) {
      this.cinemaOffsetDisplay = document.getElementById('cinema-offset-display');
    }
    if (this.cinemaOffsetDisplay) {
      const offset = this.getCurrentTrackOffset();
      this.cinemaOffsetDisplay.textContent = `${offset > 0 ? '+' : ''}${offset.toFixed(2)}s`;
      this.cinemaOffsetDisplay.style.color = offset !== 0 ? 'var(--accent-glow, #38ef7d)' : 'var(--text-muted, #8e8ea0)';
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('data-tab') === tabName);
    });

    document.querySelectorAll('.view-tab').forEach(view => {
      view.classList.toggle('active', view.id === `view-${tabName}`);
    });

    // Specific tab triggers
    if (tabName === 'suno') {
      window.sunoStudio.renderHistory();
    } else if (tabName === 'favorites') {
      this.renderFavorites();
    } else if (tabName === 'playlists') {
      this.renderPlaylists();
    } else if (tabName === 'home') {
      this.closeHomeAlbumDetail();
      if (!this.hasChosenTaste()) {
        this.renderHomeForSkippedUser();
      }
    } else if (tabName === 'search') {
      const searchPageInput = document.getElementById('search-page-input');
      const searchInput = document.getElementById('search-input');
      if (searchPageInput && !searchPageInput.value) {
        setTimeout(() => {
          try { searchPageInput.focus(); } catch (e) {}
        }, 150);
      } else if (searchInput && !searchInput.value) {
        setTimeout(() => {
          try { searchInput.focus(); } catch (e) {}
        }, 150);
      }
    }
  }

  quickSearch(query) {
    if (!query) return;
    const searchInput = document.getElementById('search-input');
    const searchPageInput = document.getElementById('search-page-input');
    if (searchInput) searchInput.value = query;
    if (searchPageInput) searchPageInput.value = query;

    const searchClearBtn = document.getElementById('btn-search-clear');
    const searchPageClearBtn = document.getElementById('btn-search-page-clear');
    if (searchClearBtn) searchClearBtn.style.display = 'flex';
    if (searchPageClearBtn) searchPageClearBtn.style.display = 'flex';

    if (searchInput) searchInput.blur();
    if (searchPageInput) searchPageInput.blur();

    this.switchTab('search');
    this.searchMusic(query);
  }

  async fetchNetworkInfo() {
    try {
      const res = await fetch('/api/network-info');
      const data = await res.json();
      if (data.success) {
        this.networkInfo = data;
        const qrImg = document.getElementById('connect-qrcode');
        const urlText = document.getElementById('connect-url-text');
        const ipBadge = document.getElementById('badge-mobile-ip');

        if (qrImg) qrImg.src = data.qrCode;
        if (urlText) {
          urlText.textContent = data.accessUrl;
          urlText.href = data.accessUrl;
        }
        if (ipBadge) {
          ipBadge.textContent = `HP: ${data.primaryIp}:${data.port}`;
        }
      }
    } catch (e) {
      console.warn('Network info unavailable:', e);
    }
  }

  setSearchFilter(filter) {
    this.currentSearchFilter = filter || 'all';

    // Update active pill UI classes
    const pills = document.querySelectorAll('.search-filter-pill');
    pills.forEach(pill => {
      if (pill.getAttribute('data-filter') === this.currentSearchFilter) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    // If there is an existing search query, immediately re-run the search!
    const searchInput = document.getElementById('search-input');
    const query = (this.lastSearchQuery || (searchInput ? searchInput.value : '')).trim();
    if (query) {
      this.switchTab('search');
      this.searchMusic(query, this.currentSearchFilter);
    }
  }

  renderLoadingState(text = 'Memuat...') {
    return `
      <div class="loading-state">
        <div class="simple-pulse-spinner" aria-hidden="true"></div>
        <p>${text}</p>
      </div>
    `;
  }

  async searchMusic(query, filter = this.currentSearchFilter || 'all') {
    this.lastSearchQuery = query;
    this.currentSearchFilter = filter;

    const resultsContainer = document.getElementById('search-results');
    const searchHeader = document.getElementById('search-query-display');
    const searchSubtitle = document.getElementById('search-meta-subtitle');
    const isEn = (this.userProfile?.lang === 'en');

    // Sync active filter pill UI
    const pills = document.querySelectorAll('.search-filter-pill');
    pills.forEach(pill => {
      if (pill.getAttribute('data-filter') === this.currentSearchFilter) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    const filterLabels = {
      all: isEn ? 'All Versions' : 'Semua Versi',
      official: isEn ? 'Official Only' : 'Official Saja',
      nonofficial: isEn ? 'Non-Official (Covers, Remixes, Lyrics, Live, Dance)' : 'Bukan Official (Cover, Remix, Lyrics, Live, Dance)'
    };

    if (searchHeader) {
      searchHeader.textContent = isEn ? `Results for: "${query}"` : `Hasil untuk: "${query}"`;
    }
    if (searchSubtitle) {
      searchSubtitle.style.display = 'block';
      searchSubtitle.textContent = isEn 
        ? `Filter: ${filterLabels[filter] || 'All'} • Searching YouTube Music...` 
        : `Filter: ${filterLabels[filter] || 'Semua'} • Mencari di YouTube Music...`;
    }

    if (resultsContainer) {
      resultsContainer.innerHTML = this.renderLoadingState(
        isEn ? 'Searching music on YouTube Music...' : 'Mencari di YouTube Music...',
        true,
        5
      );
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&page=1`);
      const data = await res.json();

      if (data.success && data.tracks && data.tracks.length > 0) {
        this.currentSearchQuery = query;
        this.currentSearchTracks = data.tracks;
        this.currentSearchPage = 1;
        this.currentSearchHasMore = Boolean(data.hasMore);

        if (searchSubtitle) {
          searchSubtitle.textContent = isEn
            ? `Found ${data.tracks.length} songs • Filter: ${filterLabels[filter] || 'All'}`
            : `Ditemukan ${data.tracks.length} lagu • Filter: ${filterLabels[filter] || 'Semua'}`;
        }
        this.renderTrackList(data.tracks, resultsContainer, { listKey: `search-${filter}` });

        if (data.hasMore) {
          const loadMoreWrap = document.createElement('div');
          loadMoreWrap.id = 'search-load-more-wrap';
          loadMoreWrap.style.cssText = 'text-align: center; margin: 24px 0 40px;';
          loadMoreWrap.innerHTML = `
            <button id="btn-load-more-search" class="btn-album-load-more" onclick="window.app.loadMoreSearchResults()">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
              <span>${isEn ? 'Load More Songs from YouTube Music' : 'Muat Lebih Banyak dari YouTube Music'}</span>
            </button>
          `;
          resultsContainer.appendChild(loadMoreWrap);
        }
      } else {
        if (searchSubtitle) {
          searchSubtitle.textContent = isEn
            ? `No songs found for ${filterLabels[filter] || 'this filter'}`
            : `Tidak ada lagu untuk filter ${filterLabels[filter] || 'ini'}`;
        }
        resultsContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <h3>${isEn ? 'No songs found' : 'Lagu tidak ditemukan'}</h3>
            <p>${filter === 'official' 
              ? (isEn ? 'No official releases found. Try "All Versions" or "Covers & Remixes".' : 'Tidak ditemukan rilisan official. Coba pilih "Semua Versi" atau "Cover & Remix".')
              : (filter === 'nonofficial' 
                ? (isEn ? 'No covers or remixes found for this track. Try "All Versions".' : 'Tidak ditemukan cover atau remix untuk lagu ini. Coba pilih "Semua Versi".')
                : (isEn ? 'Try another keyword or artist name.' : 'Coba kata kunci lain atau nama artis favorit Anda.'))}</p>
          </div>
        `;
      }
    } catch (err) {
      console.error('Search error:', err);
      if (searchSubtitle) searchSubtitle.style.display = 'none';
      resultsContainer.innerHTML = `<p class="error-msg">${isEn ? 'Failed to load search results.' : 'Gagal memuat hasil pencarian.'}</p>`;
    }
  }

  async loadMoreSearchResults() {
    if (!this.currentSearchQuery) return;
    const isEn = (this.userProfile?.lang === 'en');
    const nextPage = (this.currentSearchPage || 1) + 1;
    const btn = document.getElementById('btn-load-more-search');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <span class="simple-pulse-spinner" style="width: 16px; height: 16px; border-width: 2px; margin-right: 8px; display: inline-block; vertical-align: middle;"></span>
        <span>${isEn ? 'Loading more songs...' : 'Memuat lagu lainnya...'}</span>
      `;
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(this.currentSearchQuery)}&filter=${encodeURIComponent(this.currentSearchFilter || 'all')}&page=${nextPage}`);
      const data = await res.json();

      if (data.success && data.tracks && data.tracks.length > 0) {
        this.currentSearchPage = nextPage;
        this.currentSearchHasMore = Boolean(data.hasMore);

        const existingIds = new Set((this.currentSearchTracks || []).map(t => t.id));
        const newTracks = data.tracks.filter(t => !existingIds.has(t.id));

        if (newTracks.length > 0) {
          this.currentSearchTracks = (this.currentSearchTracks || []).concat(newTracks);
        }

        const resultsContainer = document.getElementById('search-results');
        const searchSubtitle = document.getElementById('search-meta-subtitle');
        if (searchSubtitle) {
          searchSubtitle.textContent = isEn
            ? `Showing ${this.currentSearchTracks.length} songs • YouTube Music Catalog`
            : `Menampilkan ${this.currentSearchTracks.length} lagu • Katalog YouTube Music`;
        }

        if (resultsContainer) {
          this.renderTrackList(this.currentSearchTracks, resultsContainer, { listKey: `search-${this.currentSearchFilter || 'all'}` });
          if (data.hasMore) {
            const loadMoreWrap = document.createElement('div');
            loadMoreWrap.id = 'search-load-more-wrap';
            loadMoreWrap.style.cssText = 'text-align: center; margin: 24px 0 40px;';
            loadMoreWrap.innerHTML = `
              <button id="btn-load-more-search" class="btn-album-load-more" onclick="window.app.loadMoreSearchResults()">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
                <span>${isEn ? 'Load More Songs from YouTube Music' : 'Muat Lebih Banyak dari YouTube Music'}</span>
              </button>
            `;
            resultsContainer.appendChild(loadMoreWrap);
          }
        }
      } else {
        if (btn) btn.style.display = 'none';
      }
    } catch (err) {
      console.error('loadMoreSearchResults error:', err);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>${isEn ? 'Try Again' : 'Coba Lagi'}</span>`;
      }
    }
  }

  getDeviceId() {
    if (this.currentUser && this.currentUser.email) {
      return 'usr_' + this.currentUser.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_');
    }
    let id = localStorage.getItem('aurasound_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      localStorage.setItem('aurasound_device_id', id);
    }
    return id;
  }

  // ==========================================
  // AI TASTE ONBOARDING & PERSONALIZATION
  // ==========================================
  initTasteOnboarding() {
    const modal = document.getElementById('modal-taste-onboarding');
    if (!modal) return;

    // Event handlers are initialized here; opening is orchestrated by post-splash flow

    // Genre Cards Multi-Select Click Handler
    const genreCards = modal.querySelectorAll('.taste-genre-card');
    const counterEl = document.getElementById('taste-genres-count');

    genreCards.forEach(card => {
      card.addEventListener('click', () => {
        card.classList.toggle('active');
        const newActiveCount = modal.querySelectorAll('.taste-genre-card.active').length;
        if (counterEl) {
          counterEl.textContent = `${newActiveCount} Dipilih`;
        }
      });
    });

    // Mood Chips Single-Select Click Handler
    const moodChips = modal.querySelectorAll('.taste-mood-chip');
    moodChips.forEach(chip => {
      chip.addEventListener('click', () => {
        moodChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });

    // Submit Button Click Handler
    const submitBtn = document.getElementById('btn-submit-taste');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.handleTasteSubmit());
    }

    // Close (X) & Skip Button Click Handlers (Permanently marks completed and renders clean home)
    const closeBtn = document.getElementById('btn-close-taste-modal');
    if (closeBtn) {
      closeBtn.onclick = () => this.skipTasteOnboarding();
    }

    const skipBtn = document.getElementById('btn-skip-taste');
    if (skipBtn) {
      skipBtn.onclick = () => this.skipTasteOnboarding();
    }

    // Backdrop click outside card also triggers skip & permanent dismissal
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.skipTasteOnboarding();
      }
    });
  }

  // ==========================================
  // PLAY HISTORY & TASTE HELPERS
  // ==========================================
  getPlayHistory() {
    try {
      const saved = localStorage.getItem('aurasound_play_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  }

  recordTrackToHistory(track) {
    if (!track || !track.id) return;
    try {
      let history = this.getPlayHistory();
      // Deduplicate by ID
      history = history.filter(h => h.id !== track.id);
      const artistName = track.artist || (track.author ? track.author.name : 'AuraSound');
      history.unshift({
        id: track.id,
        title: track.title,
        artist: artistName,
        duration: track.duration || '3:30',
        thumbnail: track.thumbnail || '/images/supermix.jpg',
        type: track.type || 'youtube',
        playedAt: Date.now()
      });
      if (history.length > 50) history = history.slice(0, 50);
      localStorage.setItem('aurasound_play_history', JSON.stringify(history));

      // Persist to Server Database asynchronously
      try {
        const userKey = this.getUserKey();
        fetch('/api/user/history', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': this.currentUser?.email || '',
            'x-user-id': userKey,
            'x-device-id': userKey
          },
          body: JSON.stringify({ track, userKey })
        }).catch(err => console.warn('Record history DB warning:', err));
      } catch (e) {}

      // Also notify tasteEngine
      if (window.tasteEngine) {
        window.tasteEngine.recordTrackStart(track);
      }

      // If user is currently viewing Home, dynamically update the home screen
      // so the new track & related tracks recommendations appear immediately!
      if (this.activeTab === 'home') {
        clearTimeout(this._refreshHomeDebounce);
        this._refreshHomeDebounce = setTimeout(() => {
          if (this.activeTab === 'home') {
            if (!this.hasChosenTaste()) {
              this.renderHomeForSkippedUser();
            } else {
              this.loadYTMHome('all');
            }
          }
        }, 800);
      }
    } catch (e) {
      console.warn('Failed to record track history:', e);
    }
  }

  hasChosenTaste() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('aurasound_chosen_taste') || localStorage.getItem('aurasound_taste_profile') || 'null');
    } catch (e) {}
    return !!(saved && Array.isArray(saved.genres) && saved.genres.length > 0);
  }

  getChosenTaste() {
    try {
      return JSON.parse(localStorage.getItem('aurasound_chosen_taste') || localStorage.getItem('aurasound_taste_profile') || 'null');
    } catch (e) {
      return null;
    }
  }

  skipTasteOnboarding() {
    const modal = document.getElementById('modal-taste-onboarding');
    if (modal) modal.classList.remove('active');

    // Permanently mark as completed so the popup NEVER shows up again on future visits
    localStorage.setItem('aurasound_taste_completed', 'true');
    localStorage.removeItem('aurasound_chosen_taste');
    localStorage.removeItem('aurasound_taste_profile');

    this.renderHomeForSkippedUser();
    this.showToast('Setup dilewati. Beranda disetel bersih. Mulai putar lagu apa saja untuk meracik Hypermix!', 'info');
  }

  openTasteModal() {
    const modal = document.getElementById('modal-taste-onboarding');
    if (!modal) return;

    // Pre-fill user name from Google account or profile
    const nameInput = document.getElementById('taste-input-name');
    if (nameInput) {
      const preferredName = (this.currentUser?.name) || (this.userProfile?.name && this.userProfile.name !== 'User' ? this.userProfile.name : '');
      if (preferredName) nameInput.value = preferredName;
    }

    // Pre-select existing genres & mood if saved
    const saved = this.getChosenTaste();
    const counterEl = document.getElementById('taste-genres-count');

    if (saved && Array.isArray(saved.genres) && saved.genres.length > 0) {
      modal.querySelectorAll('.taste-genre-card').forEach(c => {
        const g = c.dataset.genre;
        if (saved.genres.includes(g)) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });
      const activeCount = modal.querySelectorAll('.taste-genre-card.active').length;
      if (counterEl) counterEl.textContent = `${activeCount} Dipilih`;
    } else {
      modal.querySelectorAll('.taste-genre-card').forEach(c => c.classList.remove('active'));
      if (counterEl) counterEl.textContent = '0 Dipilih';
    }

    if (saved && saved.mood) {
      modal.querySelectorAll('.taste-mood-chip').forEach(c => {
        if (c.dataset.mood === saved.mood) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });
    }

    modal.classList.add('active');
  }

  async handleTasteSubmit() {
    const modal = document.getElementById('modal-taste-onboarding');
    const loadingOverlay = document.getElementById('taste-loading-overlay');
    const loadingTitle = document.getElementById('taste-loading-title');
    const loadingDesc = document.getElementById('taste-loading-desc');
    const progressBar = document.getElementById('taste-progress-bar');

    const nameInput = document.getElementById('taste-input-name');
    const chosenName = nameInput?.value?.trim() || (this.userProfile?.name && this.userProfile.name !== 'User' ? this.userProfile.name : 'Sobat Musik');

    const activeGenres = Array.from(modal.querySelectorAll('.taste-genre-card.active')).map(c => c.dataset.genre);
    const activeMoodChip = modal.querySelector('.taste-mood-chip.active');
    const chosenMood = activeMoodChip?.dataset?.mood || 'chill';

    if (activeGenres.length === 0) {
      this.showToast('Silakan pilih minimal 1 genre musik favorit Anda', 'info');
      return;
    }

    // Show AI synthesis loader
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    if (progressBar) progressBar.style.width = '25%';
    if (loadingTitle) loadingTitle.textContent = '🧠 Memetakan DNA Nada & Genre...';
    if (loadingDesc) loadingDesc.textContent = `Menyesuaikan resonansi untuk ${activeGenres.length} genre pilihanmu...`;

    try {
      setTimeout(() => {
        if (progressBar) progressBar.style.width = '65%';
        if (loadingTitle) loadingTitle.textContent = '✨ Meracik Beranda & Playlist Personal...';
        if (loadingDesc) loadingDesc.textContent = 'Mencari lagu-lagu terbaik dan terpopuler tanpa henti...';
      }, 500);

      const deviceId = this.getDeviceId();
      const res = await fetch('/api/recommendations/personalized-feed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId
        },
        body: JSON.stringify({
          name: chosenName,
          genres: activeGenres,
          mood: chosenMood,
          deviceId
        })
      });

      let data = null;
      try {
        const text = await res.text();
        data = JSON.parse(text);
      } catch (parseErr) {
        console.warn('Response from personalized-feed was not JSON:', parseErr.message);
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'Gagal memuat feed personalisasi dari server');
      }

      if (progressBar) progressBar.style.width = '95%';
      if (loadingTitle) loadingTitle.textContent = '🎧 Menyiapkan Beranda Eksklusifmu...';

      // Update user profile name
      if (this.userProfile) {
        this.userProfile.name = chosenName;
        localStorage.setItem('aurasound_user_profile', JSON.stringify(this.userProfile));
        this.syncProfileUI();
      }

      // Save taste profile & mark onboarding completed
      const chosenTaste = {
        name: chosenName,
        genres: activeGenres,
        mood: chosenMood,
        updatedAt: Date.now()
      };
      localStorage.setItem('aurasound_chosen_taste', JSON.stringify(chosenTaste));
      localStorage.setItem('aurasound_taste_profile', JSON.stringify(chosenTaste));
      localStorage.setItem('aurasound_taste_completed', 'true');

      // Auto-save AI Starter Playlist to user's playlists if returned
      if (data.aiStarterPlaylist) {
        if (!this.playlists) this.playlists = [];
        this.playlists = this.playlists.filter(p => !p.isAiMix);
        this.playlists.unshift(data.aiStarterPlaylist);
        this.savePlaylists();
      }

      // Smooth finish
      setTimeout(() => {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        modal.classList.remove('active');
        this.renderPersonalizedHome(data);
        this.showToast(`🎉 Feed musik AI siap! Selamat datang di AuraSound, ${chosenName}!`, 'success');
      }, 600);

    } catch (err) {
      console.warn('Taste submit error, using fallback:', err.message);
      if (loadingOverlay) loadingOverlay.style.display = 'none';
      modal.classList.remove('active');
      const fallbackTaste = {
        name: chosenName,
        genres: activeGenres,
        mood: chosenMood,
        updatedAt: Date.now()
      };
      localStorage.setItem('aurasound_chosen_taste', JSON.stringify(fallbackTaste));
      localStorage.setItem('aurasound_taste_profile', JSON.stringify(fallbackTaste));
      localStorage.setItem('aurasound_taste_completed', 'true');
      this.showToast(`Selamat datang di AuraSound, ${chosenName}!`, 'success');
      this.loadYTMHome('all');
    }
  }

  // ==========================================
  // YOUTUBE MUSIC HOME FEED CONTROLLER
  // ==========================================
  async loadYTMHome(mood = 'all') {
    const container = document.getElementById('ytm-home-sections');
    if (!container) return;

    const isEn = (this.userProfile?.lang === 'en');
    container.innerHTML = this.renderLoadingState(
      isEn ? 'Loading YouTube Music Home Feed...' : 'Memuat beranda YouTube Music...',
      true,
      4
    );

    try {
      // 1. If mood is 'all', check for user's personalized taste profile vs skipped/dynamic home
      if (mood === 'all') {
        if (this.hasChosenTaste()) {
          const savedTaste = this.getChosenTaste();
          const history = this.getPlayHistory();
          try {
            const res = await fetch('/api/recommendations/personalized-feed', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-device-id': this.getDeviceId()
              },
              body: JSON.stringify({
                name: this.userProfile?.name || savedTaste.name || 'Sobat Musik',
                genres: savedTaste.genres,
                mood: savedTaste.mood || 'chill',
                history: history.slice(0, 10),
                favorites: (this.favorites || []).slice(0, 10),
                deviceId: this.getDeviceId()
              })
            });
            const feedText = await res.text();
            const feedData = JSON.parse(feedText);
            if (feedData && feedData.success) {
              this.renderPersonalizedHome(feedData);
              return;
            }
          } catch (feedErr) {
            console.warn('Personalized feed failed, falling back to default home:', feedErr.message);
          }
        } else {
          // If user skipped or has not chosen any taste: render dynamically based on listening history
          await this.renderHomeForSkippedUser();
          return;
        }
      }

      // 2. Otherwise load category/mood feed from YouTube
      const res = await fetch(`/api/home?mood=${encodeURIComponent(mood)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load home feed');

      if (data.albums) {
        this.homeAlbums = data.albums;
      }

      if (data.moodData) {
        this.cachedMoodData = data.moodData;
        this.cachedUser = data.user;
        this.renderYTMMoodFeed(data.moodData, data.user);
      } else if (data.sections) {
        this.cachedSections = data.sections;
        this.cachedUser = data.user;
        this.renderYTMFullHome(data.sections, data.user);
      }
    } catch (err) {
      console.error('Error in loadYTMHome:', err);
      const isEn = (this.userProfile?.lang === 'en');
      container.innerHTML = `<p class="error-msg">${isEn ? 'Failed to load home feed' : 'Gagal memuat beranda'}: ${err.message}</p>`;
    }
  }

  // ==========================================
  // DYNAMIC SKIPPED USER CONTROLLER (INSTANT RELATED MUSIC)
  // ==========================================
  async renderHomeForSkippedUser() {
    const container = document.getElementById('ytm-home-sections');
    if (!container) return;

    let history = this.getPlayHistory();
    if ((!history || history.length === 0) && this.currentUser && Array.isArray(this.currentUser.playHistory) && this.currentUser.playHistory.length > 0) {
      history = this.currentUser.playHistory;
      try {
        localStorage.setItem('aurasound_play_history', JSON.stringify(history));
      } catch (e) {}
    }

    const importedPlaylists = (this.playlists || []).filter(p => p.isImported || p.source === 'spotify' || p.source === 'youtube');

    // 1. Pengguna belum pernah memutar lagu apapun dan belum mengimpor album (0 lagu & 0 album):
    if ((!history || history.length === 0) && importedPlaylists.length === 0) {
      this.renderEmptyCleanHome();
      return;
    }

    // 2. Begitu mulai mendengar lagu (>= 1 lagu) ATAU mengimpor album:
    // Langsung munculkan lagu yang berkaitan, album vinyl, dan supermix!
    await this.renderRelatedMusicHome(history || []);
  }

  renderEmptyHome() {
    this.renderHomeForSkippedUser();
  }

  // Pure clean state for 0 history plays
  renderEmptyCleanHome() {
    const container = document.getElementById('ytm-home-sections');
    if (!container) return;

    const isEn = (this.userProfile?.lang === 'en');
    const hour = new Date().getHours();
    let greeting = 'Selamat Datang';
    let greetingIcon = '✨';
    if (hour >= 4 && hour < 11) { greeting = 'Selamat Pagi'; greetingIcon = '🌅'; }
    else if (hour >= 11 && hour < 15) { greeting = 'Selamat Siang'; greetingIcon = '☀️'; }
    else if (hour >= 15 && hour < 18) { greeting = 'Selamat Sore'; greetingIcon = '🌇'; }
    else { greeting = 'Selamat Malam'; greetingIcon = '🌌'; }

    const userName = (this.userProfile?.name && this.userProfile.name !== 'User') ? this.userProfile.name : 'Sobat Musik';

    let html = `
      <section class="aura-hero-soundstage">
        <div class="aura-hero-mesh-glow"></div>
        <div class="aura-hero-inner">
          <div class="aura-hero-left">
            <div class="aura-greeting-capsule">
              <span class="aura-greeting-icon">${greetingIcon}</span>
              <span class="aura-greeting-tag">AURASOUND AI 2026</span>
              <span class="aura-greeting-dot"></span>
              <span class="aura-dsp-hi-res-tag">BERANDA BERSIH</span>
            </div>

            <h1 class="aura-hero-title">
              ${greeting}, <span class="aura-title-glow">${userName}</span>
            </h1>

            <p class="aura-hero-desc">
              Beranda Anda saat ini bersih tanpa lagu bawaan pengembang. Putar lagu apa saja lewat pencarian, atau atur selera musikmu agar AI dapat meracikkan playlist personal.
            </p>

            <div class="aura-hero-actions">
              <button class="aura-btn-hero-primary" onclick="window.app.openTasteModal()">
                <span style="font-size: 1.1rem;">🎨</span>
                <span>Atur Selera Musik AI</span>
              </button>

              <button class="aura-btn-hero-glass" onclick="window.app.switchTab('search')">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <span>Cari Lagu Sendiri</span>
              </button>

              <button class="aura-btn-hero-outline" onclick="document.getElementById('eq-drawer').classList.toggle('active')">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
                <span>Nahimic 3D Studio</span>
              </button>
            </div>
          </div>

          <div class="aura-hero-right">
            <div class="aura-turntable-card" onclick="window.app.openTasteModal()" style="cursor: pointer;" title="Klik untuk mengatur selera musik">
              <div class="aura-turntable-chassis">
                <div class="aura-vinyl-record">
                  <div class="aura-vinyl-grooves"></div>
                  <div class="aura-vinyl-sheen"></div>
                  <div class="aura-vinyl-center-label">
                    <div style="font-size: 2rem; display: flex; align-items: center; justify-content: center; height: 100%;">🎵</div>
                  </div>
                </div>
              </div>
              <div class="aura-turntable-footer">
                <span class="aura-turntable-text">SIAP DIPERSONALISASI • KLIK DI SINI</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Clean Neutral State Guidance Banner -->
      <section class="aura-section-wrap" style="margin-top: 24px;">
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px dashed rgba(255, 255, 255, 0.14); border-radius: 20px; padding: 46px 24px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 14px;">
          <div style="width: 68px; height: 68px; border-radius: 50%; background: rgba(16, 185, 129, 0.12); color: #34d399; display: flex; align-items: center; justify-content: center; font-size: 2rem; box-shadow: 0 0 24px rgba(16, 185, 129, 0.2);">
            🎧
          </div>
          <h3 style="font-size: 1.35rem; font-weight: 800; color: #fff; margin: 0;">Beranda Kamu Masih Bersih</h3>
          <p style="font-size: 0.92rem; color: #94a3b8; max-width: 520px; line-height: 1.6; margin: 0;">
            Kamu memilih untuk melewati setup selera musik. Beranda sengaja dikosongkan dari lagu-lagu pengembang. Mulai putar lagu apa saja lewat pencarian, dan rekomendasi lagu yang berkaitan akan langsung muncul otomatis di sini!
          </p>
          <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 10px;">
            <button class="aura-btn-hero-primary" onclick="window.app.switchTab('search')" style="padding: 12px 24px; font-size: 0.9rem;">
              <span>🔍 Jelajahi & Cari Musik</span>
            </button>
            <button class="aura-btn-hero-glass" onclick="window.app.openTasteModal()" style="padding: 12px 24px; font-size: 0.9rem;">
              <span>🎨 Atur Selera Musik (Genre & Vibe)</span>
            </button>
          </div>
        </div>
      </section>
    `;

    container.innerHTML = html;
  }

  // Instant Related Music Home: renders immediately once user has listened to >= 1 song
  async renderRelatedMusicHome(history) {
    const container = document.getElementById('ytm-home-sections');
    if (!container) return;

    const isEn = (this.userProfile?.lang === 'en');
    const userName = (this.userProfile?.name && this.userProfile.name !== 'User') ? this.userProfile.name : 'Sobat Musik';

    // Fetch dynamic recommendations directly derived from user's listened songs & imported albums
    let hypermixData = null;
    const importedPlaylists = (this.playlists || []).filter(p => p.isImported || p.source === 'spotify' || p.source === 'youtube');
    try {
      const res = await fetch('/api/recommendations/hypermix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, favorites: this.favorites || [], importedPlaylists })
      });
      hypermixData = await res.json();
    } catch (e) {
      console.warn('Related music fetch failed:', e.message);
    }

    const relatedTracks = (hypermixData && Array.isArray(hypermixData.tracks) && hypermixData.tracks.length > 0)
      ? hypermixData.tracks
      : (this.cachedSections?.quickPicks || history);

    // Load AI-driven dynamic albums & artist/vibe mixes
    let newReleases = (hypermixData && Array.isArray(hypermixData.dynamicAlbums) && hypermixData.dynamicAlbums.length > 0)
      ? hypermixData.dynamicAlbums
      : (this.cachedSections?.newReleases || null);

    let mixedForYou = (hypermixData && Array.isArray(hypermixData.dynamicMixes) && hypermixData.dynamicMixes.length > 0)
      ? hypermixData.dynamicMixes
      : (this.cachedSections?.mixedForYou || null);

    // Strictly ensure My Supermix is never in mixedForYou
    if (Array.isArray(mixedForYou)) {
      mixedForYou = mixedForYou.filter(m => m.id !== 'deck-supermix' && m.albumId !== 'deck-supermix' && m.title !== 'My Supermix');
    }

    if ((!newReleases || !this.homeAlbums) && (!hypermixData || !hypermixData.dynamicAlbums)) {
      try {
        const homeRes = await fetch('/api/home?mood=all');
        const homeJson = await homeRes.json();
        if (homeJson.success) {
          if (homeJson.sections && !newReleases) {
            this.cachedSections = homeJson.sections;
            newReleases = homeJson.sections.newReleases;
            mixedForYou = (homeJson.sections.mixedForYou || []).filter(m => m.id !== 'deck-supermix' && m.albumId !== 'deck-supermix' && m.title !== 'My Supermix');
          }
          if (homeJson.albums) {
            this.homeAlbums = homeJson.albums;
          }
        }
      } catch (e) {
        console.warn('Failed to load home albums for shelf:', e);
      }
    }

    // Register track collections
    this.registerTrackList('related-picks', relatedTracks);
    this.registerTrackList('recently-played', history);
    if (newReleases) this.registerTrackList('ytm-new-releases', newReleases);
    if (mixedForYou) this.registerTrackList('ytm-mixed', mixedForYou);

    const isAudioPlaying = (this.nativeAudio && !this.nativeAudio.paused) || (window.ytPlayer && window.ytPlayer.isPlaying);
    const heroThumb = history[0]?.thumbnail || importedPlaylists[0]?.thumbnail || relatedTracks[0]?.thumbnail || '/images/supermix.jpg';
    const topArtistNames = (hypermixData?.artists && hypermixData.artists.length > 0)
      ? hypermixData.artists.join(' • ')
      : (importedPlaylists[0]?.title || history.slice(0, 3).map(h => h.artist).join(' • ') || 'AuraSound AI');

    const hour = new Date().getHours();
    let greeting = 'Selamat Datang';
    let greetingIcon = '✨';
    if (hour >= 4 && hour < 11) { greeting = 'Selamat Pagi'; greetingIcon = '🌅'; }
    else if (hour >= 11 && hour < 15) { greeting = 'Selamat Siang'; greetingIcon = '☀️'; }
    else if (hour >= 15 && hour < 18) { greeting = 'Selamat Sore'; greetingIcon = '🌇'; }
    else { greeting = 'Selamat Malam'; greetingIcon = '🌌'; }

    let heroButtonLabel = isEn ? 'Play My Supermix' : 'Putar My Supermix';
    let turntableTag = 'SUPERMIX • TACTILE VINYL • HI-FI';
    let bentoSupermixBadge = 'SUPERMIX AI 2026';
    let bentoSupermixTitle = 'My Supermix';
    let bentoSupermixSubtitle = isEn ? 'Auto-Curated for Your Taste' : 'Racikan Otomatis Selera Anda';
    let bentoSupermixDesc = `Diramu otomatis dari artis dan lagu yang Anda nikmati (${topArtistNames}).`;

    if (importedPlaylists.length === 1) {
      const imp = importedPlaylists[0];
      const sourceName = imp.source === 'spotify' ? 'Spotify' : 'YouTube Music';
      heroButtonLabel = `Putar Supermix (${imp.title})`;
      turntableTag = `${imp.title.toUpperCase()} • SUPERMIX HI-FI`;
      bentoSupermixBadge = imp.source === 'spotify' ? 'SPOTIFY SUPERMIX' : 'ALBUM SUPERMIX';
      bentoSupermixTitle = `Supermix: ${imp.title}`;
      bentoSupermixSubtitle = `Impor dari ${sourceName} & Selera Musikmu`;
      bentoSupermixDesc = `Memadukan album "${imp.title}", riwayat dengar (${topArtistNames}), dan penemuan musik baru.`;
    } else if (importedPlaylists.length >= 2) {
      const imp1 = importedPlaylists[0];
      const imp2 = importedPlaylists[1];
      heroButtonLabel = 'Putar Crossover Supermix';
      turntableTag = 'CROSSOVER SUPERMIX • HI-FI';
      bentoSupermixBadge = 'CROSSOVER SUPERMIX';
      bentoSupermixTitle = `Fusion: ${imp1.title} × ${imp2.title}`;
      bentoSupermixSubtitle = 'Perpaduan 2 Album Impor & Selera Musik';
      bentoSupermixDesc = `Perpaduan hybrid cerdas antara "${imp1.title}", "${imp2.title}", dan selera musik Anda.`;
    }

    let html = `
      <!-- 1. SIGNATURE RELATED MUSIC HERO -->
      <section class="aura-hero-soundstage">
        <div class="aura-hero-mesh-glow"></div>
        <div class="aura-hero-inner">
          <div class="aura-hero-left">
            <div class="aura-greeting-capsule">
              <span class="aura-greeting-icon">✨</span>
              <span class="aura-greeting-tag">${bentoSupermixBadge} • AI SOUNDSTAGE</span>
              <span class="aura-greeting-dot"></span>
              <span class="aura-dsp-hi-res-tag">24-BIT / 96kHz HI-FI</span>
            </div>

            <h1 class="aura-hero-title">
              ${greeting}, <span class="aura-title-glow">${userName}</span>
            </h1>

            <p class="aura-hero-desc">
              ${bentoSupermixDesc} Suara disempurnakan dengan <strong>Dolby Atmos & Nahimic DSP</strong>.
            </p>

            <div class="aura-dna-bar">
              <div class="aura-dna-tag" title="Artis dan genre yang baru saja Anda nikmati">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 2v20M17 5v14M7 9v6M2 12v0M22 12v0"/></svg>
                <span>Terkait: <strong>${topArtistNames}</strong></span>
              </div>
              <div class="aura-dna-match-tag">
                <span class="aura-dna-pulse-dot"></span>
                <span>Rekomendasi Aktif</span>
              </div>
            </div>

            <div class="aura-hero-actions">
              <button class="aura-btn-hero-primary" onclick="window.app.playHomeAlbum('deck-supermix')">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                <span>${heroButtonLabel}</span>
              </button>

              <button class="aura-btn-hero-glass" onclick="window.app.openTasteModal()" title="Atur Selera Musik">
                <span style="font-size: 1rem;">🎨</span>
                <span>Atur Selera Musik</span>
              </button>

              <button class="aura-btn-hero-outline" onclick="document.getElementById('eq-drawer').classList.toggle('active')">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
                <span>Nahimic 3D Studio</span>
              </button>
            </div>
          </div>

          <div class="aura-hero-right">
            <div class="aura-turntable-card" onclick="window.app.openHomeAlbumDetail('deck-supermix')">
              <div class="aura-turntable-chassis">
                <div class="aura-vinyl-record ${isAudioPlaying ? 'is-spinning' : ''}">
                  <div class="aura-vinyl-grooves"></div>
                  <div class="aura-vinyl-sheen"></div>
                  <div class="aura-vinyl-center-label">
                    <img src="${heroThumb}" alt="Center Label" class="aura-vinyl-label-thumb" onerror="this.src='/images/supermix.jpg'">
                    <div class="aura-vinyl-hole"></div>
                  </div>
                </div>
                <div class="aura-turntable-tonearm ${isAudioPlaying ? 'on-record' : ''}">
                  <div class="aura-tonearm-head"></div>
                </div>
              </div>
              <div class="aura-turntable-footer">
                <div class="aura-live-eq-wave">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
                <span class="aura-turntable-text">${turntableTag}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. SONIC BENTO GRID -->
      <section class="aura-bento-section">
        <div class="aura-section-header-wrap">
          <div class="aura-section-title-box">
            <span class="aura-kicker-tag">ALGORITMA & SOUNDSTAGE</span>
            <h2 class="aura-modern-section-title">Sonic Pods Pintar</h2>
          </div>
          <span class="aura-section-subtext">Kurasi Otomatis & Tuning Akustik Nahimic</span>
        </div>

        <div class="aura-bento-grid">
          <!-- Pod 1: My Supermix / Album Supermix -->
          <div class="aura-bento-card aura-bento-supermix" onclick="window.app.openHomeAlbumDetail('deck-supermix')">
            <div class="aura-bento-bg" style="background-image: url('${heroThumb}');"></div>
            <div class="aura-bento-mesh"></div>
            <div class="aura-bento-top">
              <span class="aura-pill-badge aura-pill-emerald">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                ${bentoSupermixBadge}
              </span>
              <div class="aura-mini-equalizer"><span></span><span></span><span></span><span></span><span></span></div>
            </div>
            <div class="aura-bento-body">
              <span class="aura-bento-subtitle">${bentoSupermixSubtitle}</span>
              <h3 class="aura-bento-title">${bentoSupermixTitle}</h3>
              <p class="aura-bento-desc">
                ${bentoSupermixDesc}
              </p>
              <div class="aura-bento-actions">
                <button class="aura-btn-circle-play" onclick="event.stopPropagation(); window.app.playHomeAlbum('deck-supermix')" title="Putar Sekarang">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <span class="aura-bento-action-label">Buka Tracklist Supermix →</span>
              </div>
            </div>
          </div>

          <!-- Pod 2: Liked Music -->
          <div class="aura-bento-card aura-bento-liked" onclick="window.app.openLikedMusicDetail()">
            <div class="aura-bento-mesh-ruby"></div>
            <div class="aura-bento-top">
              <span class="aura-pill-badge aura-pill-ruby">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                KAPSUL HATI
              </span>
              <span class="aura-bento-stat-num" id="bento-liked-count">${this.favorites ? this.favorites.length : 0}</span>
            </div>
            <div class="aura-bento-body">
              <h3 class="aura-bento-title">Lagu yang Disukai</h3>
              <p class="aura-bento-desc">Stasiun radio tanpa henti dari kompilasi lagu favorit yang Anda sukai.</p>
              <div class="aura-bento-actions">
                <button class="aura-btn-circle-play aura-btn-ruby" onclick="event.stopPropagation(); window.app.playLikedRadio()" title="Putar Radio Favorit">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <span class="aura-bento-action-label">Putar Radio Favorit →</span>
              </div>
            </div>
          </div>

          <!-- Pod 3: DSP Studio -->
          <div class="aura-bento-card aura-bento-dsp">
            <div class="aura-bento-mesh-dsp"></div>
            <div class="aura-bento-top">
              <span class="aura-pill-badge aura-pill-cyan">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5v14M7 9v6M2 12v0M22 12v0"/></svg>
                NAHIMIC & DOLBY
              </span>
              <span class="aura-dsp-status-dot">DSP AKTIF</span>
            </div>
            <div class="aura-bento-body">
              <h3 class="aura-bento-title">Studio Spasial 3D</h3>
              <p class="aura-bento-desc">Ganti profil akustik langsung dengan satu klik:</p>
              <div class="aura-dsp-pills-row">
                <button class="aura-dsp-pill active" onclick="event.stopPropagation(); window.app.applyDspPreset('dolby')">Dolby Atmos</button>
                <button class="aura-dsp-pill" onclick="event.stopPropagation(); window.app.applyDspPreset('bass')">Bass Boost</button>
                <button class="aura-dsp-pill" onclick="event.stopPropagation(); window.app.applyDspPreset('vocal')">Vocal Clear</button>
                <button class="aura-dsp-pill" onclick="event.stopPropagation(); window.app.applyDspPreset('club')">Club DJ</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 3. RELATED TRACKS RECOMMENDATION -->
      <section class="aura-section-wrap">
        <div class="aura-section-header-wrap">
          <div class="aura-section-title-box">
            <span class="aura-kicker-tag">REKOMENDASI PERSONAL</span>
            <h2 class="aura-modern-section-title">✨ Lagu yang Berkaitan dengan Musikmu</h2>
          </div>
          <div class="ytm-section-actions">
            <button class="aura-pill-btn-primary" onclick="window.app.playFromRegistry('related-picks', 0)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Putar Semua
            </button>
          </div>
        </div>
        <div class="aura-resonance-grid" id="carousel-related-picks">
          ${relatedTracks.map((track, idx) => {
            const isCurrent = this.currentTrack?.id === track.id;
            const isFav = this.isFavorited(track.id);
            return `
              <div class="aura-resonance-tile ${isCurrent ? 'is-playing' : ''}" data-track-id="${track.id}" onclick="window.app.playFromRegistry('related-picks', ${idx})">
                <div class="aura-resonance-num"><span>${(idx + 1).toString().padStart(2, '0')}</span></div>
                <div class="aura-resonance-thumb-box">
                  <img src="${track.thumbnail}" alt="${track.title}" class="aura-resonance-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                  <div class="aura-resonance-play-icon">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div class="aura-resonance-info">
                  <div class="aura-resonance-title" title="${track.title}">${track.title}</div>
                  <div class="aura-resonance-meta">${track.artist}</div>
                </div>
                <div class="aura-resonance-right">
                  <button class="aura-resonance-heart-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.app.toggleFavoriteFromRegistry('related-picks', ${idx})" title="${isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  </button>
                  <span class="aura-resonance-duration">${track.duration || '3:30'}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <!-- 4. SECTION: BARU SAJA DIDENGARKAN -->
      <section class="aura-section-wrap">
        <div class="aura-section-header-wrap">
          <div class="aura-section-title-box">
            <span class="aura-kicker-tag">RIWAYAT AKTIVITAS</span>
            <h2 class="aura-modern-section-title">🕒 Baru Saja Didengarkan</h2>
          </div>
          <span class="aura-section-subtext">Lagu yang telah kamu nikmati di AuraSound</span>
        </div>
        <div class="aura-resonance-grid" id="carousel-recently-played">
          ${history.map((track, idx) => {
            const isCurrent = this.currentTrack?.id === track.id;
            const isFav = this.isFavorited(track.id);
            return `
              <div class="aura-resonance-tile ${isCurrent ? 'is-playing' : ''}" data-track-id="${track.id}" onclick="window.app.playFromRegistry('recently-played', ${idx})">
                <div class="aura-resonance-num"><span>${(idx + 1).toString().padStart(2, '0')}</span></div>
                <div class="aura-resonance-thumb-box">
                  <img src="${track.thumbnail}" alt="${track.title}" class="aura-resonance-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                  <div class="aura-resonance-play-icon">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div class="aura-resonance-info">
                  <div class="aura-resonance-title" title="${track.title}">${track.title}</div>
                  <div class="aura-resonance-meta">${track.artist}</div>
                </div>
                <div class="aura-resonance-right">
                  <button class="aura-resonance-heart-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.app.toggleFavoriteFromRegistry('recently-played', ${idx})" title="${isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  </button>
                  <span class="aura-resonance-duration">${track.duration || '3:30'}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;

    // 5. & 6. Append Exclusive Vinyl Shelf & Mixed Harmonies
    html += this.renderVinylShelfAndMixesHtml(newReleases, mixedForYou, isEn);

    container.innerHTML = html;
  }

  // ==========================================
  // EXCLUSIVE VINYL SHELF & MIXES RENDERER
  // ==========================================
  renderVinylShelfAndMixesHtml(newReleases, mixedForYou, isEn = false) {
    let html = '';

    // Koleksi Vinyl & Album Eksklusif (Algoritma Dinamis Berdasarkan Artis Dengar)
    if (newReleases && newReleases.length > 0) {
      html += `
        <section class="aura-section-wrap">
          <div class="aura-section-header-wrap">
            <div class="aura-section-title-box">
              <span class="aura-kicker-tag">ALGORITMA & VINYL AI</span>
              <h2 class="aura-modern-section-title">${isEn ? 'Personalized Vinyl & Album Shelf' : 'Koleksi Vinyl & Album Personal'}</h2>
            </div>
            <div class="aura-section-meta-badge">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>
              <span>${newReleases.length} ${isEn ? 'Editions Available' : 'Edisi Tersedia'}</span>
            </div>
          </div>

          <div class="aura-vinyl-shelf" id="carousel-new-releases">
            ${newReleases.map((album, idx) => `
              <div class="aura-vinyl-card" onclick="window.app.openHomeAlbumDetail('${album.albumId}')">
                <div class="aura-vinyl-jacket-wrap">
                  <!-- Vinyl Record Disc that slides out on hover -->
                  <div class="aura-vinyl-disc-slide">
                    <div class="aura-vinyl-disc-grooves"></div>
                    <div class="aura-vinyl-disc-reflection"></div>
                    <div class="aura-vinyl-disc-label">
                      <div class="aura-disc-hole"></div>
                    </div>
                  </div>

                  <!-- Vinyl Jacket Cover -->
                  <div class="aura-vinyl-jacket">
                    <img src="${album.thumbnail}" alt="${album.title}" class="aura-vinyl-jacket-cover" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                    <div class="aura-vinyl-jacket-sheen"></div>
                    <span class="aura-vinyl-badge">${album.badge || 'EP'}</span>
                    <div class="aura-vinyl-play-trigger" onclick="event.stopPropagation(); window.app.playHomeAlbum('${album.albumId}')" title="${isEn ? 'Play Album' : 'Putar Album'}">
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                </div>

                <div class="aura-vinyl-meta">
                  <div class="aura-vinyl-title" title="${album.title}">${album.title}</div>
                  <div class="aura-vinyl-artist">${album.artist}</div>
                  <div class="aura-vinyl-footer-row">
                    <span class="aura-vinyl-flac-tag">24-BIT FLAC</span>
                    <span class="aura-vinyl-dot">•</span>
                    <span class="aura-vinyl-link">${isEn ? 'Open Tracklist →' : 'Buka Tracklist →'}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </section>
      `;
    }

    // Harmoni Campuran Spesial (STRICTLY Filter out My Supermix, as Supermix has its own system)
    const cleanMixes = Array.isArray(mixedForYou)
      ? mixedForYou.filter(m => m && m.id !== 'deck-supermix' && m.albumId !== 'deck-supermix' && m.title !== 'My Supermix' && !(m.title && m.title.toLowerCase().includes('supermix')))
      : [];

    if (cleanMixes.length > 0) {
      let topArtists = [];
      if (window.tasteEngine) {
        topArtists = window.tasteEngine.getTopArtists(4);
      }
      html += `
        <section class="aura-section-wrap">
          <div class="aura-section-header-wrap">
            <div class="aura-section-title-box">
              <span class="aura-kicker-tag">CAMPURAN AI PERSONAL</span>
              <h2 class="aura-modern-section-title">${isEn ? 'Special Mixed Harmonies' : 'Harmoni Campuran Spesial'}</h2>
            </div>
            <div class="aura-section-meta-badge">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
              <span>${cleanMixes.length} ${isEn ? 'Personal Mixes' : 'Mix Dinamis'}</span>
            </div>
          </div>

          <div class="aura-mix-carousel" id="carousel-mixed">
            ${cleanMixes.map((track, idx) => {
              const isLiked = track.id === 'mix-liked';
              const clickAction = isLiked ? "window.app.openLikedMusicDetail()" : `window.app.openHomeAlbumDetail('${track.albumId || track.id}')`;
              const playAction = isLiked ? "event.stopPropagation(); window.app.playTrackList(window.app.favorites, 0)" : `event.stopPropagation(); window.app.playHomeAlbum('${track.albumId || track.id}')`;
              const subTitle = isLiked
                ? `${this.favorites ? this.favorites.length : 0} ${isEn ? 'Liked Songs' : 'Lagu Favorit'}`
                : track.artist;

              return `
                <div class="aura-mix-card" onclick="${clickAction}">
                  <div class="aura-mix-thumb-wrap">
                    <img src="${track.thumbnail}" alt="${track.title}" class="aura-mix-thumb" loading="lazy" onerror="this.src='/images/discover.jpg'">
                    <div class="aura-mix-play-btn" onclick="${playAction}" title="${isEn ? 'Play Now' : 'Putar Sekarang'}">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                  <div class="aura-mix-info">
                    <div class="aura-mix-title" title="${track.title}">${track.title}</div>
                    <div class="aura-mix-sub">${subTitle}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }

    return html;
  }

  // ==========================================
  // PERSONALIZED AI HOME FEED RENDERER (PRIORITIZES CHOSEN GENRES ON TOP)
  // ==========================================
  renderPersonalizedHome(feed) {
    const container = document.getElementById('ytm-home-sections');
    if (!container) return;

    const isEn = (this.userProfile?.lang === 'en');

    // Register all track collections in registry for immediate audio play
    if (feed.quickPicks) this.registerTrackList('ytm-quick-picks', feed.quickPicks);
    if (feed.aiStarterPlaylist?.tracks) this.registerTrackList('mockup-deck', feed.aiStarterPlaylist.tracks);
    if (feed.genreShelves) {
      feed.genreShelves.forEach((shelf, idx) => {
        this.registerTrackList(`shelf-genre-${idx}`, shelf.tracks);
      });
    }
    if (feed.moodShelf?.tracks) {
      this.registerTrackList('shelf-mood', feed.moodShelf.tracks);
    }
    if (feed.discoveryShelf?.tracks) {
      this.registerTrackList('shelf-discovery', feed.discoveryShelf.tracks);
    }

    // Time-based greeting
    const hour = new Date().getHours();
    let greeting = isEn ? 'Welcome' : 'Selamat Datang';
    let greetingIcon = '✨';
    if (hour >= 4 && hour < 11) {
      greeting = isEn ? 'Good Morning' : 'Selamat Pagi';
      greetingIcon = '🌅';
    } else if (hour >= 11 && hour < 15) {
      greeting = isEn ? 'Good Afternoon' : 'Selamat Siang';
      greetingIcon = '☀️';
    } else if (hour >= 15 && hour < 18) {
      greeting = isEn ? 'Good Evening' : 'Selamat Sore';
      greetingIcon = '🌇';
    } else {
      greeting = isEn ? 'Good Night' : 'Selamat Malam';
      greetingIcon = '🌌';
    }

    const userName = feed.user?.name || this.userProfile?.name || 'Sobat Musik';
    const isAudioPlaying = (this.nativeAudio && !this.nativeAudio.paused) || (window.ytPlayer && window.ytPlayer.isPlaying);
    const heroThumb = feed.quickPicks?.[0]?.thumbnail || '/images/supermix.jpg';
    const tasteSummary = feed.tasteSummary || 'Musik Favorit Pilihanmu';

    let html = '';

    // 1. SIGNATURE AURA SOUNDSTAGE HERO
    html += `
      <section class="aura-hero-soundstage">
        <div class="aura-hero-mesh-glow"></div>
        <div class="aura-hero-inner">
          <div class="aura-hero-left">
            <div class="aura-greeting-capsule">
              <span class="aura-greeting-icon">${greetingIcon}</span>
              <span class="aura-greeting-tag">AURASOUND AI ENGINE 2026</span>
              <span class="aura-greeting-dot"></span>
              <span class="aura-dsp-hi-res-tag">24-BIT / 96kHz HI-FI</span>
            </div>

            <h1 class="aura-hero-title">
              ${greeting}, <span class="aura-title-glow">${userName}</span>
            </h1>

            <p class="aura-hero-desc">
              ${isEn
                ? 'Your personalized AI algorithm has tailored your daily soundstage. Audio is processed live for <strong>Dolby Atmos & Nahimic DSP</strong>.'
                : 'Algoritma AI personal telah meracik panggung audio harian sesuai seleramu. Suara dioptimalkan secara live untuk <strong>Dolby Atmos & Nahimic DSP</strong>.'}
            </p>

            <div class="aura-dna-bar">
              <div class="aura-dna-tag" onclick="window.app.openTasteModal()" style="cursor: pointer;" title="Klik untuk mengubah selera musik">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 2v20M17 5v14M7 9v6M2 12v0M22 12v0"/></svg>
                <span>Taste DNA: <strong>${tasteSummary}</strong></span>
              </div>
              <div class="aura-dna-match-tag">
                <span class="aura-dna-pulse-dot"></span>
                <span>${isEn ? '100% Taste Resonance' : '100% Resonansi Selera'}</span>
              </div>
            </div>

            <div class="aura-hero-actions">
              <button class="aura-btn-hero-primary" onclick="window.app.playFromRegistry('ytm-quick-picks', 0)">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                <span>${isEn ? 'Play My Custom Mix' : 'Putar Mix Personalku'}</span>
              </button>

              <button class="aura-btn-hero-glass" onclick="window.app.openTasteModal()" title="Ubah Selera Musik">
                <span style="font-size: 1rem;">🎨</span>
                <span>${isEn ? 'Tune Taste AI' : 'Atur Selera Musik'}</span>
              </button>

              <button class="aura-btn-hero-outline" onclick="document.getElementById('eq-drawer').classList.toggle('active')" title="Buka Equalizer & DSP Drawer">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
                <span>Nahimic 3D Studio</span>
              </button>
            </div>
          </div>

          <div class="aura-hero-right">
            <div class="aura-turntable-card" onclick="window.app.playFromRegistry('ytm-quick-picks', 0)">
              <div class="aura-turntable-chassis">
                <div class="aura-vinyl-record ${isAudioPlaying ? 'is-spinning' : ''}">
                  <div class="aura-vinyl-grooves"></div>
                  <div class="aura-vinyl-sheen"></div>
                  <div class="aura-vinyl-center-label">
                    <img src="${heroThumb}" alt="Center Label" class="aura-vinyl-label-thumb" onerror="this.src='/images/supermix.jpg'">
                    <div class="aura-vinyl-hole"></div>
                  </div>
                </div>
                <div class="aura-turntable-tonearm ${isAudioPlaying ? 'on-record' : ''}">
                  <div class="aura-tonearm-head"></div>
                </div>
              </div>
              <div class="aura-turntable-footer">
                <div class="aura-live-eq-wave">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
                <span class="aura-turntable-text">AURA TACTILE VINYL • HI-FI</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    // 2. LANGSUNG DI ATAS: GENRE PILIHAN UTAMA! (Curated for user's selected genres)
    if (feed.genreShelves && feed.genreShelves.length > 0) {
      feed.genreShelves.forEach((shelf, sIdx) => {
        const shelfKey = `shelf-genre-${sIdx}`;
        html += `
          <section class="aura-section-wrap">
            <div class="aura-section-header-wrap">
              <div class="aura-section-title-box">
                <span class="aura-kicker-tag">GENRE PILIHAN UTAMA</span>
                <h2 class="aura-modern-section-title">${shelf.title}</h2>
              </div>
              <div class="ytm-section-actions">
                <button class="aura-pill-btn-primary" onclick="window.app.playFromRegistry('${shelfKey}', 0)">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  ${isEn ? 'Play All' : 'Putar Semua'}
                </button>
                <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('shelf-g-${sIdx}', -1)">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                </button>
                <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('shelf-g-${sIdx}', 1)">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                </button>
              </div>
            </div>

            <div class="aura-resonance-grid" id="carousel-shelf-g-${sIdx}">
              ${shelf.tracks.map((track, tIdx) => {
                const isCurrent = this.currentTrack?.id === track.id;
                const isFav = this.isFavorited(track.id);
                return `
                  <div class="aura-resonance-tile ${isCurrent ? 'is-playing' : ''}" data-track-id="${track.id}" onclick="window.app.playFromRegistry('${shelfKey}', ${tIdx})">
                    <div class="aura-resonance-num">
                      <span>${(tIdx + 1).toString().padStart(2, '0')}</span>
                    </div>

                    <div class="aura-resonance-thumb-box">
                      <img src="${track.thumbnail}" alt="${track.title}" class="aura-resonance-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                      <div class="aura-resonance-play-icon">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>

                    <div class="aura-resonance-info">
                      <div class="aura-resonance-title" title="${track.title}">${track.title}</div>
                      <div class="aura-resonance-meta">${track.artist}</div>
                    </div>

                    <div class="aura-resonance-right">
                      <button class="aura-resonance-heart-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.app.toggleFavoriteFromRegistry('${shelfKey}', ${tIdx})" title="${isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </button>
                      <span class="aura-resonance-duration">${track.duration || '3:30'}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>
        `;
      });
    }

    // 3. RESONANSI MUSIK CEPAT (Quick-Picks Grid from chosen genres)
    if (feed.quickPicks && feed.quickPicks.length > 0) {
      html += `
        <section class="aura-section-wrap">
          <div class="aura-section-header-wrap">
            <div class="aura-section-title-box">
              <span class="aura-kicker-tag">RESONANSI CEPAT PILIHAN</span>
              <h2 class="aura-modern-section-title">${isEn ? 'Quick Music Picks For You' : 'Resonansi Cepat Genre Pilihanmu'}</h2>
            </div>
            <div class="ytm-section-actions">
              <button class="aura-pill-btn-primary" onclick="window.app.playFromRegistry('ytm-quick-picks', 0)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                ${isEn ? 'Play All' : 'Putar Semua'}
              </button>
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('quick-picks', -1)">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              </button>
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('quick-picks', 1)">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>
          </div>

          <div class="aura-resonance-grid" id="carousel-quick-picks">
            ${feed.quickPicks.map((track, idx) => {
              const isCurrent = this.currentTrack?.id === track.id;
              const isFav = this.isFavorited(track.id);
              return `
                <div class="aura-resonance-tile ${isCurrent ? 'is-playing' : ''}" data-track-id="${track.id}" onclick="window.app.playFromRegistry('ytm-quick-picks', ${idx})">
                  <div class="aura-resonance-num">
                    ${isCurrent ? `
                      <div class="aura-mini-equalizer inline-eq"><span></span><span></span><span></span></div>
                    ` : `
                      <span>${(idx + 1).toString().padStart(2, '0')}</span>
                    `}
                  </div>

                  <div class="aura-resonance-thumb-box">
                    <img src="${track.thumbnail}" alt="${track.title}" class="aura-resonance-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                    <div class="aura-resonance-play-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>

                  <div class="aura-resonance-info">
                    <div class="aura-resonance-title" title="${track.title}">${track.title}</div>
                    <div class="aura-resonance-meta">${track.artist}</div>
                  </div>

                  <div class="aura-resonance-right">
                    <button class="aura-resonance-heart-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.app.toggleFavoriteFromRegistry('ytm-quick-picks', ${idx})" title="${isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    <span class="aura-resonance-duration">${track.duration || '3:30'}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }

    // 4. SIGNATURE SONIC PODS BENTO GRID
    html += `
      <section class="aura-bento-section">
        <div class="aura-section-header-wrap">
          <div class="aura-section-title-box">
            <span class="aura-kicker-tag">${isEn ? 'ALGORITHM & SOUNDSTAGE' : 'ALGORITMA & SOUNDSTAGE'}</span>
            <h2 class="aura-modern-section-title">${isEn ? 'Smart Sonic Pods' : 'Sonic Pods Pintar'}</h2>
          </div>
          <span class="aura-section-subtext">${isEn ? 'Auto-Curation & Nahimic Acoustic Tuning' : 'Kurasi Otomatis & Tuning Akustik Nahimic'}</span>
        </div>

        <div class="aura-bento-grid">
          <!-- Pod 1: My Custom Mix -->
          <div class="aura-bento-card aura-bento-supermix" onclick="window.app.playFromRegistry('ytm-quick-picks', 0)">
            <div class="aura-bento-bg" style="background-image: url('${heroThumb}');"></div>
            <div class="aura-bento-mesh"></div>
            <div class="aura-bento-top">
              <span class="aura-pill-badge aura-pill-emerald">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                AI MIX PERDANA 2026
              </span>
              <div class="aura-mini-equalizer">
                <span></span><span></span><span></span><span></span><span></span>
              </div>
            </div>
            <div class="aura-bento-body">
              <span class="aura-bento-subtitle">${isEn ? 'Personal Mix for You' : 'Racikan Otomatis Sesuai Seleramu'}</span>
              <h3 class="aura-bento-title">${feed.aiStarterPlaylist ? feed.aiStarterPlaylist.title : 'My Daily Mix'}</h3>
              <p class="aura-bento-desc">
                ${feed.tasteSummary ? `Selera Pilihan: ${feed.tasteSummary}` : 'Diramu secara real-time berdasarkan genre dan vibe kesukaanmu.'}
              </p>
              <div class="aura-bento-actions">
                <button class="aura-btn-circle-play" onclick="event.stopPropagation(); window.app.playFromRegistry('ytm-quick-picks', 0)" title="Putar Sekarang">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <span class="aura-bento-action-label">${isEn ? 'Play Custom Station →' : 'Putar Stasiun Personal →'}</span>
              </div>
            </div>
          </div>

          <!-- Pod 2: Liked Music Ruby Capsule -->
          <div class="aura-bento-card aura-bento-liked" onclick="window.app.openLikedMusicDetail()">
            <div class="aura-bento-mesh-ruby"></div>
            <div class="aura-bento-top">
              <span class="aura-pill-badge aura-pill-ruby">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                ${isEn ? 'HEART CAPSULE' : 'KAPSUL HATI'}
              </span>
              <span class="aura-bento-stat-num" id="bento-liked-count">${this.favorites ? this.favorites.length : 0}</span>
            </div>
            <div class="aura-bento-body">
              <h3 class="aura-bento-title">${isEn ? 'Liked Songs' : 'Lagu yang Disukai'}</h3>
              <p class="aura-bento-desc">${isEn ? 'Endless radio station compiled from your favorite liked songs.' : 'Stasiun radio tanpa henti dari kompilasi lagu favorit yang Anda sukai.'}</p>
              <div class="aura-bento-actions">
                <button class="aura-btn-circle-play aura-btn-ruby" onclick="event.stopPropagation(); window.app.playLikedRadio()" title="${isEn ? 'Play Liked Radio' : 'Putar Radio Favorit'}">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <span class="aura-bento-action-label">${isEn ? 'Play Liked Radio →' : 'Putar Radio Favorit →'}</span>
              </div>
            </div>
          </div>

          <!-- Pod 3: Nahimic 3D Studio & Preset Switcher -->
          <div class="aura-bento-card aura-bento-dsp">
            <div class="aura-bento-mesh-dsp"></div>
            <div class="aura-bento-top">
              <span class="aura-pill-badge aura-pill-cyan">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5v14M7 9v6M2 12v0M22 12v0"/></svg>
                NAHIMIC & DOLBY
              </span>
              <span class="aura-dsp-status-dot">${isEn ? 'DSP ACTIVE' : 'DSP AKTIF'}</span>
            </div>
            <div class="aura-bento-body">
              <h3 class="aura-bento-title">${isEn ? '3D Spatial Studio' : 'Studio Spasial 3D'}</h3>
              <p class="aura-bento-desc">${isEn ? 'Switch acoustic profiles instantly with one click:' : 'Ganti profil akustik langsung dengan satu klik:'}</p>
              <div class="aura-dsp-pills-row">
                <button class="aura-dsp-pill active" onclick="event.stopPropagation(); window.app.applyDspPreset('dolby')">Dolby Atmos</button>
                <button class="aura-dsp-pill" onclick="event.stopPropagation(); window.app.applyDspPreset('bass')">Bass Boost</button>
                <button class="aura-dsp-pill" onclick="event.stopPropagation(); window.app.applyDspPreset('vocal')">Vocal Clear</button>
                <button class="aura-dsp-pill" onclick="event.stopPropagation(); window.app.applyDspPreset('club')">Club DJ</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    // 4b. REKOMENDASI PERSONAL: ✨ Lagu yang Berkaitan dengan Musikmu
    if (feed.relatedTracks && feed.relatedTracks.length > 0) {
      this.registerTrackList('related-picks', feed.relatedTracks);
      const history = this.getPlayHistory();
      if (history.length > 0) {
        this.registerTrackList('recently-played', history);
      }
      html += `
        <section class="aura-section-wrap">
          <div class="aura-section-header-wrap">
            <div class="aura-section-title-box">
              <span class="aura-kicker-tag">REKOMENDASI PERSONAL</span>
              <h2 class="aura-modern-section-title">✨ Lagu yang Berkaitan dengan Musikmu</h2>
            </div>
            <div class="ytm-section-actions">
              <button class="aura-pill-btn-primary" onclick="window.app.playFromRegistry('related-picks', 0)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                ${isEn ? 'Play All' : 'Putar Semua'}
              </button>
            </div>
          </div>
          <div class="aura-resonance-grid" id="carousel-related-picks">
            ${feed.relatedTracks.map((track, idx) => {
              const isCurrent = this.currentTrack?.id === track.id;
              const isFav = this.isFavorited(track.id);
              return `
                <div class="aura-resonance-tile ${isCurrent ? 'is-playing' : ''}" data-track-id="${track.id}" onclick="window.app.playFromRegistry('related-picks', ${idx})">
                  <div class="aura-resonance-num"><span>${(idx + 1).toString().padStart(2, '0')}</span></div>
                  <div class="aura-resonance-thumb-box">
                    <img src="${track.thumbnail}" alt="${track.title}" class="aura-resonance-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                    <div class="aura-resonance-play-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                  <div class="aura-resonance-info">
                    <div class="aura-resonance-title" title="${track.title}">${track.title}</div>
                    <div class="aura-resonance-meta">${track.artist}</div>
                  </div>
                  <div class="aura-resonance-right">
                    <button class="aura-resonance-heart-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.app.toggleFavoriteFromRegistry('related-picks', ${idx})" title="${isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    <span class="aura-resonance-duration">${track.duration || '3:30'}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      `;

      if (history.length > 0) {
        html += `
          <section class="aura-section-wrap">
            <div class="aura-section-header-wrap">
              <div class="aura-section-title-box">
                <span class="aura-kicker-tag">RIWAYAT AKTIVITAS</span>
                <h2 class="aura-modern-section-title">🕒 Baru Saja Didengarkan</h2>
              </div>
              <span class="aura-section-subtext">Lagu yang telah kamu nikmati di AuraSound</span>
            </div>
            <div class="aura-resonance-grid" id="carousel-recently-played">
              ${history.map((track, idx) => {
                const isCurrent = this.currentTrack?.id === track.id;
                const isFav = this.isFavorited(track.id);
                return `
                  <div class="aura-resonance-tile ${isCurrent ? 'is-playing' : ''}" data-track-id="${track.id}" onclick="window.app.playFromRegistry('recently-played', ${idx})">
                    <div class="aura-resonance-num"><span>${(idx + 1).toString().padStart(2, '0')}</span></div>
                    <div class="aura-resonance-thumb-box">
                      <img src="${track.thumbnail}" alt="${track.title}" class="aura-resonance-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                      <div class="aura-resonance-play-icon">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>
                    <div class="aura-resonance-info">
                      <div class="aura-resonance-title" title="${track.title}">${track.title}</div>
                      <div class="aura-resonance-meta">${track.artist}</div>
                    </div>
                    <div class="aura-resonance-right">
                      <button class="aura-resonance-heart-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.app.toggleFavoriteFromRegistry('recently-played', ${idx})" title="${isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </button>
                      <span class="aura-resonance-duration">${track.duration || '3:30'}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>
        `;
      }
    }

    // 5. DYNAMIC MOOD SHELF
    if (feed.moodShelf && feed.moodShelf.tracks?.length > 0) {
      const moodShelfKey = 'shelf-mood';
      html += `
        <section class="aura-section-wrap">
          <div class="aura-section-header-wrap">
            <div class="aura-section-title-box">
              <span class="aura-kicker-tag">VIBE & SUASANA HATI</span>
              <h2 class="aura-modern-section-title">${feed.moodShelf.title}</h2>
            </div>
            <div class="ytm-section-actions">
              <button class="aura-pill-btn-primary" onclick="window.app.playFromRegistry('${moodShelfKey}', 0)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                ${isEn ? 'Play All' : 'Putar Semua'}
              </button>
            </div>
          </div>

          <div class="aura-resonance-grid" id="carousel-shelf-mood">
            ${feed.moodShelf.tracks.map((track, mIdx) => {
              const isCurrent = this.currentTrack?.id === track.id;
              const isFav = this.isFavorited(track.id);
              return `
                <div class="aura-resonance-tile ${isCurrent ? 'is-playing' : ''}" data-track-id="${track.id}" onclick="window.app.playFromRegistry('${moodShelfKey}', ${mIdx})">
                  <div class="aura-resonance-num">
                    <span>${(mIdx + 1).toString().padStart(2, '0')}</span>
                  </div>

                  <div class="aura-resonance-thumb-box">
                    <img src="${track.thumbnail}" alt="${track.title}" class="aura-resonance-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                    <div class="aura-resonance-play-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>

                  <div class="aura-resonance-info">
                    <div class="aura-resonance-title" title="${track.title}">${track.title}</div>
                    <div class="aura-resonance-meta">${track.artist}</div>
                  </div>

                  <div class="aura-resonance-right">
                    <button class="aura-resonance-heart-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.app.toggleFavoriteFromRegistry('${moodShelfKey}', ${mIdx})" title="${isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    <span class="aura-resonance-duration">${track.duration || '3:30'}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }

    // 6. DI PALING BAWAH DAN SEDIKIT AJA (HANYA 4-5 LAGU DI LUAR PILIHAN)
    if (feed.discoveryShelf && feed.discoveryShelf.tracks?.length > 0) {
      const discKey = 'shelf-discovery';
      html += `
        <section class="aura-section-wrap" style="opacity: 0.94; margin-top: 10px;">
          <div class="aura-section-header-wrap">
            <div class="aura-section-title-box">
              <span class="aura-kicker-tag" style="color: #94a3b8; border-color: rgba(255,255,255,0.15);">EKSPLORASI TAMBAHAN</span>
              <h2 class="aura-modern-section-title" style="font-size: 1.35rem;">${feed.discoveryShelf.title}</h2>
            </div>
            <span class="aura-section-subtext">${feed.discoveryShelf.subtitle}</span>
          </div>

          <div class="aura-resonance-grid" id="carousel-shelf-discovery">
            ${feed.discoveryShelf.tracks.map((track, dIdx) => {
              const isCurrent = this.currentTrack?.id === track.id;
              const isFav = this.isFavorited(track.id);
              return `
                <div class="aura-resonance-tile ${isCurrent ? 'is-playing' : ''}" data-track-id="${track.id}" onclick="window.app.playFromRegistry('${discKey}', ${dIdx})">
                  <div class="aura-resonance-num">
                    <span>${(dIdx + 1).toString().padStart(2, '0')}</span>
                  </div>

                  <div class="aura-resonance-thumb-box">
                    <img src="${track.thumbnail}" alt="${track.title}" class="aura-resonance-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                    <div class="aura-resonance-play-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>

                  <div class="aura-resonance-info">
                    <div class="aura-resonance-title" title="${track.title}">${track.title}</div>
                    <div class="aura-resonance-meta">${track.artist}</div>
                  </div>

                  <div class="aura-resonance-right">
                    <button class="aura-resonance-heart-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.app.toggleFavoriteFromRegistry('${discKey}', ${dIdx})" title="${isFav ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    <span class="aura-resonance-duration">${track.duration || '3:30'}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }

    // Also append exclusive vinyl shelf and special mixes if available
    const newReleases = (feed.dynamicAlbums && feed.dynamicAlbums.length > 0) ? feed.dynamicAlbums : (this.cachedSections?.newReleases || null);
    const mixedForYou = (feed.dynamicMixes && feed.dynamicMixes.length > 0) ? feed.dynamicMixes : (this.cachedSections?.mixedForYou || null);
    if (newReleases) this.registerTrackList('ytm-new-releases', newReleases);
    if (mixedForYou) this.registerTrackList('ytm-mixed', mixedForYou);
    html += this.renderVinylShelfAndMixesHtml(newReleases, mixedForYou, isEn);

    container.innerHTML = html;
  }

  scrollCarousel(id, direction) {
    const el = document.getElementById('carousel-' + id);
    if (el) {
      const scrollAmount = Math.max(300, el.clientWidth * 0.75) * direction;
      el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  }

  renderYTMFullHome(sections, user) {
    const container = document.getElementById('ytm-home-sections');
    if (!container) return;

    this.cachedSections = sections;
    this.cachedUser = user;

    // Register track collections into registry for seamless queuing
    if (sections.showcasePlaylists) this.registerTrackList('mockup-showcase', sections.showcasePlaylists);
    if (sections.deckPlaylists) this.registerTrackList('mockup-deck', sections.deckPlaylists);
    if (sections.listenAgain) this.registerTrackList('ytm-listen-again', sections.listenAgain);
    if (sections.quickPicks) this.registerTrackList('ytm-quick-picks', sections.quickPicks);
    if (sections.coversAndRemixes) this.registerTrackList('ytm-covers', sections.coversAndRemixes);
    if (sections.newReleases) this.registerTrackList('ytm-new-releases', sections.newReleases);
    if (sections.forgottenFavorites) this.registerTrackList('ytm-forgotten', sections.forgottenFavorites);
    if (sections.kpopHits) this.registerTrackList('ytm-kpop', sections.kpopHits);
    if (sections.mixedForYou) this.registerTrackList('ytm-mixed', sections.mixedForYou);

    const isEn = (this.userProfile?.lang === 'en');

    // Compute dynamic greeting based on time of day
    const hour = new Date().getHours();
    let greeting = isEn ? 'Welcome' : 'Selamat Datang';
    let greetingIcon = '✨';
    if (hour >= 4 && hour < 11) {
      greeting = isEn ? 'Good Morning' : 'Selamat Pagi';
      greetingIcon = '🌅';
    } else if (hour >= 11 && hour < 15) {
      greeting = isEn ? 'Good Afternoon' : 'Selamat Siang';
      greetingIcon = '☀️';
    } else if (hour >= 15 && hour < 18) {
      greeting = isEn ? 'Good Evening' : 'Selamat Sore';
      greetingIcon = '🌇';
    } else {
      greeting = isEn ? 'Good Night' : 'Selamat Malam';
      greetingIcon = '🌌';
    }

    const userName = this.userProfile?.name || 'User';
    const isAudioPlaying = (this.nativeAudio && !this.nativeAudio.paused) || (window.ytPlayer && window.ytPlayer.isPlaying);
    const heroThumb = (this.currentTrack && this.currentTrack.thumbnail) || '/images/supermix.jpg';

    // Live Taste DNA metrics from Taste Engine
    let topArtists = [];
    if (window.tasteEngine) {
      topArtists = window.tasteEngine.getTopArtists(4);
    }
    const tasteSummary = topArtists.length > 0
      ? topArtists.map(a => a.name).join(' • ')
      : 'Pop • J-Pop • Lo-Fi & EDM';

    let html = '';

    // =========================================================================
    // 1. SIGNATURE AURA SOUNDSTAGE HERO (Flagship Glassmorphic Cinematic Stage)
    // =========================================================================
    html += `
      <section class="aura-hero-soundstage">
        <div class="aura-hero-mesh-glow"></div>
        <div class="aura-hero-inner">
          <div class="aura-hero-left">
            <div class="aura-greeting-capsule">
              <span class="aura-greeting-icon">${greetingIcon}</span>
              <span class="aura-greeting-tag">AURASOUND ENGINE 2026</span>
              <span class="aura-greeting-dot"></span>
              <span class="aura-dsp-hi-res-tag">24-BIT / 96kHz HI-FI</span>
            </div>

            <h1 class="aura-hero-title">
              ${greeting}, <span class="aura-title-glow">${userName}</span>
            </h1>

            <p class="aura-hero-desc">
              ${isEn
                ? 'Your personal algorithm has mapped your daily audio resonance. Sound is optimized live for <strong>Dolby Atmos & Nahimic DSP</strong>.'
                : 'Algoritma personal Anda telah memetakan resonansi audio harian. Suara dioptimalkan secara live untuk <strong>Dolby Atmos & Nahimic DSP</strong>.'}
            </p>

            <!-- Real-time Taste DNA Status Bar -->
            <div class="aura-dna-bar">
              <div class="aura-dna-tag" title="${isEn ? 'Taste DNA updates automatically whenever you listen & like songs' : 'Taste DNA diperbarui otomatis setiap kali Anda mendengarkan & menyukai lagu'}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 2v20M17 5v14M7 9v6M2 12v0M22 12v0"/></svg>
                <span>Taste DNA: <strong>${tasteSummary}</strong></span>
              </div>
              <div class="aura-dna-match-tag">
                <span class="aura-dna-pulse-dot"></span>
                <span>${isEn ? '99% Taste Resonance' : '99% Resonansi Selera'}</span>
              </div>
            </div>

            <!-- Hero Action Launchpad -->
            <div class="aura-hero-actions">
              <button class="aura-btn-hero-primary" onclick="window.app.playHomeAlbum('deck-supermix')">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                <span>${isEn ? 'Play My Supermix' : 'Putar Supermix Saya'}</span>
              </button>

              <button class="aura-btn-hero-glass" onclick="window.app.openLikedMusicDetail()" title="${isEn ? 'Favorite Collection & Radio' : 'Koleksi & Radio Favorit'}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                <span id="hero-fav-count-text">${isEn ? 'Favorite Radio' : 'Radio Favorit'} (${this.favorites ? this.favorites.length : 0})</span>
              </button>

              <button class="aura-btn-hero-outline" onclick="document.getElementById('eq-drawer').classList.toggle('active')" title="${isEn ? 'Open Equalizer & DSP Drawer' : 'Buka Equalizer & DSP Drawer'}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
                <span>Nahimic 3D Studio</span>
              </button>
            </div>
          </div>

          <!-- Interactive 3D Vinyl Turntable Visualizer Widget -->
          <div class="aura-hero-right">
            <div class="aura-turntable-card" onclick="window.app.openHomeAlbumDetail('deck-supermix')">
              <div class="aura-turntable-chassis">
                <div class="aura-vinyl-record ${isAudioPlaying ? 'is-spinning' : ''}">
                  <div class="aura-vinyl-grooves"></div>
                  <div class="aura-vinyl-sheen"></div>
                  <div class="aura-vinyl-center-label">
                    <img src="${heroThumb}" alt="Center Label" class="aura-vinyl-label-thumb" onerror="this.src='/images/supermix.jpg'">
                    <div class="aura-vinyl-hole"></div>
                  </div>
                </div>
                <div class="aura-turntable-tonearm ${isAudioPlaying ? 'on-record' : ''}">
                  <div class="aura-tonearm-head"></div>
                </div>
              </div>
              <div class="aura-turntable-footer">
                <div class="aura-live-eq-wave">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
                <span class="aura-turntable-text">AURA TACTILE VINYL • HI-FI</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    // =========================================================================
    // 2. SIGNATURE SONIC PODS BENTO GRID (Asymmetrical 3-Pod Showcase)
    // =========================================================================
    html += `
      <section class="aura-bento-section">
        <div class="aura-section-header-wrap">
          <div class="aura-section-title-box">
            <span class="aura-kicker-tag">${isEn ? 'ALGORITHM & SOUNDSTAGE' : 'ALGORITMA & SOUNDSTAGE'}</span>
            <h2 class="aura-modern-section-title">${isEn ? 'Smart Sonic Pods' : 'Sonic Pods Pintar'}</h2>
          </div>
          <span class="aura-section-subtext">${isEn ? 'Auto-Curation & Nahimic Acoustic Tuning' : 'Kurasi Otomatis & Tuning Akustik Nahimic'}</span>
        </div>

        <div class="aura-bento-grid">
          <!-- Pod 1: My Supermix 2026 (Large Bento Card) -->
          <div class="aura-bento-card aura-bento-supermix" onclick="window.app.openHomeAlbumDetail('deck-supermix')">
            <div class="aura-bento-bg" style="background-image: url('/images/supermix.jpg');"></div>
            <div class="aura-bento-mesh"></div>
            <div class="aura-bento-top">
              <span class="aura-pill-badge aura-pill-emerald">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                SUPERMIX AI 2026
              </span>
              <div class="aura-mini-equalizer">
                <span></span><span></span><span></span><span></span><span></span>
              </div>
            </div>
            <div class="aura-bento-body">
              <span class="aura-bento-subtitle">${isEn ? 'Auto-Curated for Your Taste' : 'Racikan Otomatis Selera Anda'}</span>
              <h3 class="aura-bento-title">My Supermix</h3>
              <p class="aura-bento-desc">
                ${topArtists.length > 0 ? (isEn ? `Favorite Artists: ${topArtists.map(a => a.name).join(', ')}` : `Artis Favorit: ${topArtists.map(a => a.name).join(', ')}`) : (isEn ? 'Seamlessly synced with your listen history & favorite artists.' : 'Sinkronisasi riwayat dengar & artis kesukaan tanpa henti.')}
              </p>
              <div class="aura-bento-actions">
                <button class="aura-btn-circle-play" onclick="event.stopPropagation(); window.app.playHomeAlbum('deck-supermix')" title="${isEn ? 'Play Supermix' : 'Putar Supermix'}">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <span class="aura-bento-action-label">${isEn ? 'Open Full Tracklist →' : 'Buka Koleksi Lagu Lengkap →'}</span>
              </div>
            </div>
          </div>

          <!-- Pod 2: Liked Music Ruby Capsule -->
          <div class="aura-bento-card aura-bento-liked" onclick="window.app.openLikedMusicDetail()">
            <div class="aura-bento-mesh-ruby"></div>
            <div class="aura-bento-top">
              <span class="aura-pill-badge aura-pill-ruby">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                ${isEn ? 'HEART CAPSULE' : 'KAPSUL HATI'}
              </span>
              <span class="aura-bento-stat-num" id="bento-liked-count">${this.favorites ? this.favorites.length : 0}</span>
            </div>
            <div class="aura-bento-body">
              <h3 class="aura-bento-title">${isEn ? 'Liked Songs' : 'Lagu yang Disukai'}</h3>
              <p class="aura-bento-desc">${isEn ? 'Endless radio station compiled from your favorite liked songs.' : 'Stasiun radio tanpa henti dari kompilasi lagu favorit yang Anda sukai.'}</p>
              <div class="aura-bento-actions">
                <button class="aura-btn-circle-play aura-btn-ruby" onclick="event.stopPropagation(); window.app.playLikedRadio()" title="${isEn ? 'Play Liked Radio' : 'Putar Radio Favorit'}">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <span class="aura-bento-action-label">${isEn ? 'Play Liked Radio →' : 'Putar Radio Favorit →'}</span>
              </div>
            </div>
          </div>

          <!-- Pod 3: Nahimic 3D Studio & Preset Switcher -->
          <div class="aura-bento-card aura-bento-dsp">
            <div class="aura-bento-mesh-dsp"></div>
            <div class="aura-bento-top">
              <span class="aura-pill-badge aura-pill-cyan">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5v14M7 9v6M2 12v0M22 12v0"/></svg>
                NAHIMIC & DOLBY
              </span>
              <span class="aura-dsp-status-dot">${isEn ? 'DSP ACTIVE' : 'DSP AKTIF'}</span>
            </div>
            <div class="aura-bento-body">
              <h3 class="aura-bento-title">${isEn ? '3D Spatial Studio' : 'Studio Spasial 3D'}</h3>
              <p class="aura-bento-desc">${isEn ? 'Switch acoustic profiles instantly with one click:' : 'Ganti profil akustik langsung dengan satu klik:'}</p>
              <div class="aura-dsp-pills-row">
                <button class="aura-dsp-pill active" onclick="event.stopPropagation(); window.app.applyDspPreset('dolby')">Dolby Atmos</button>
                <button class="aura-dsp-pill" onclick="event.stopPropagation(); window.app.applyDspPreset('bass')">Bass Boost</button>
                <button class="aura-dsp-pill" onclick="event.stopPropagation(); window.app.applyDspPreset('vocal')">Vocal Clear</button>
                <button class="aura-dsp-pill" onclick="event.stopPropagation(); window.app.applyDspPreset('club')">Club DJ</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;

    // =========================================================================
    // 3. RESONANSI MUSIK CEPAT (Elevated Glass Quick-Picks Grid)
    // =========================================================================
    if (sections.quickPicks && sections.quickPicks.length > 0) {
      html += `
        <section class="aura-section-wrap">
          <div class="aura-section-header-wrap">
            <div class="aura-section-title-box">
              <span class="aura-kicker-tag">INSTANT RESONANCE</span>
              <h2 class="aura-modern-section-title">${isEn ? 'Quick Music Picks' : 'Resonansi Musik Cepat'}</h2>
            </div>
            <div class="ytm-section-actions">
              <button class="aura-pill-btn-primary" onclick="window.app.playFromRegistry('ytm-quick-picks', 0)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                ${isEn ? 'Play All' : 'Putar Semua'}
              </button>
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('quick-picks', -1)" title="${isEn ? 'Previous' : 'Sebelumnya'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              </button>
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('quick-picks', 1)" title="${isEn ? 'Next' : 'Berikutnya'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>
          </div>

          <div class="aura-resonance-grid" id="carousel-quick-picks">
            ${sections.quickPicks.map((track, idx) => {
              const isCurrent = this.currentTrack?.id === track.id;
              const isFav = this.isFavorited(track.id);
              return `
                <div class="aura-resonance-tile ${isCurrent ? 'is-playing' : ''}" data-track-id="${track.id}" onclick="window.app.playFromRegistry('ytm-quick-picks', ${idx})">
                  <div class="aura-resonance-num">
                    ${isCurrent ? `
                      <div class="aura-mini-equalizer inline-eq">
                        <span></span><span></span><span></span>
                      </div>
                    ` : `
                      <span>${(idx + 1).toString().padStart(2, '0')}</span>
                    `}
                  </div>

                  <div class="aura-resonance-thumb-box">
                    <img src="${track.thumbnail}" alt="${track.title}" class="aura-resonance-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                    <div class="aura-resonance-play-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>

                  <div class="aura-resonance-info">
                    <div class="aura-resonance-title" title="${track.title}">${track.title}</div>
                    <div class="aura-resonance-meta">${track.artist}</div>
                  </div>

                  <div class="aura-resonance-right">
                    <button class="aura-resonance-heart-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.app.toggleFavoriteFromRegistry('ytm-quick-picks', ${idx})" title="${isFav ? (isEn ? 'Remove from Liked' : 'Hapus dari Favorit') : (isEn ? 'Add to Liked' : 'Tambah ke Favorit')}">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    <span class="aura-resonance-duration">${track.duration || '3:30'}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }

    // =========================================================================
    // 4. KOLEKSI VINYL & ALBUM EKSKLUSIF (Tactile Vinyl Jacket Slide-Out Shelf)
    // =========================================================================
    if (sections.newReleases && sections.newReleases.length > 0) {
      html += `
        <section class="aura-section-wrap">
          <div class="aura-section-header-wrap">
            <div class="aura-section-title-box">
              <span class="aura-kicker-tag">TACTILE VINYL SHELF</span>
              <h2 class="aura-modern-section-title">${isEn ? 'Exclusive Vinyl & Album Shelf' : 'Koleksi Vinyl & Album Eksklusif'}</h2>
            </div>
            <div class="ytm-section-actions">
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('new-releases', -1)" title="${isEn ? 'Previous' : 'Sebelumnya'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              </button>
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('new-releases', 1)" title="${isEn ? 'Next' : 'Berikutnya'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>
          </div>

          <div class="aura-vinyl-shelf" id="carousel-new-releases">
            ${sections.newReleases.map((album, idx) => `
              <div class="aura-vinyl-card" onclick="window.app.openHomeAlbumDetail('${album.albumId}')">
                <div class="aura-vinyl-jacket-wrap">
                  <!-- Vinyl Record Disc that slides out on hover -->
                  <div class="aura-vinyl-disc-slide">
                    <div class="aura-vinyl-disc-grooves"></div>
                    <div class="aura-vinyl-disc-reflection"></div>
                    <div class="aura-vinyl-disc-label">
                      <div class="aura-disc-hole"></div>
                    </div>
                  </div>

                  <!-- Vinyl Jacket Cover -->
                  <div class="aura-vinyl-jacket">
                    <img src="${album.thumbnail}" alt="${album.title}" class="aura-vinyl-jacket-cover" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                    <div class="aura-vinyl-jacket-sheen"></div>
                    <span class="aura-vinyl-badge">${album.badge || 'EP'}</span>
                    <div class="aura-vinyl-play-trigger" onclick="event.stopPropagation(); window.app.playHomeAlbum('${album.albumId}')" title="${isEn ? 'Play Album' : 'Putar Album'}">
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                </div>

                <div class="aura-vinyl-meta">
                  <div class="aura-vinyl-title" title="${album.title}">${album.title}</div>
                  <div class="aura-vinyl-artist">${album.artist}</div>
                  <div class="aura-vinyl-footer-row">
                    <span class="aura-vinyl-flac-tag">24-BIT FLAC</span>
                    <span class="aura-vinyl-dot">•</span>
                    <span class="aura-vinyl-link">${isEn ? 'Open Tracklist →' : 'Buka Tracklist →'}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </section>
      `;
    }

    // =========================================================================
    // 5. OFFICIAL MUSIC VIDEOS & TOP HITS (Elevated 3-Row Compact Grid)
    // =========================================================================
    if (sections.coversAndRemixes && sections.coversAndRemixes.length > 0) {
      html += `
        <section class="aura-section-wrap">
          <div class="aura-section-header-wrap">
            <div class="aura-section-title-box">
              <span class="aura-kicker-tag">${isEn ? 'OFFICIAL SPOTLIGHT' : 'VIDEO MUSIK RESMI'}</span>
              <h2 class="aura-modern-section-title">${isEn ? 'Official Music Videos & Top Hits' : 'Video Musik Resmi & Hit Teratas'}</h2>
            </div>
            <div class="ytm-section-actions">
              <button class="aura-pill-btn-primary" onclick="window.app.playFromRegistry('ytm-covers', 0)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                ${isEn ? 'Play All' : 'Putar Semua'}
              </button>
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('covers', -1)" title="${isEn ? 'Previous' : 'Sebelumnya'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              </button>
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('covers', 1)" title="${isEn ? 'Next' : 'Berikutnya'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>
          </div>

          <div class="aura-resonance-grid" id="carousel-covers">
            ${sections.coversAndRemixes.map((track, idx) => {
              const isCurrent = this.currentTrack?.id === track.id;
              const isFav = this.isFavorited(track.id);
              return `
                <div class="aura-resonance-tile ${isCurrent ? 'is-playing' : ''}" data-track-id="${track.id}" onclick="window.app.playFromRegistry('ytm-covers', ${idx})">
                  <div class="aura-resonance-num">
                    ${isCurrent ? `
                      <div class="aura-mini-equalizer inline-eq"><span></span><span></span><span></span></div>
                    ` : `
                      <span>${(idx + 1).toString().padStart(2, '0')}</span>
                    `}
                  </div>

                  <div class="aura-resonance-thumb-box">
                    <img src="${track.thumbnail}" alt="${track.title}" class="aura-resonance-thumb" loading="lazy" onerror="this.src='/images/discover.jpg'">
                    <div class="aura-resonance-play-icon">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>

                  <div class="aura-resonance-info">
                    <div class="aura-resonance-title" title="${track.title}">${track.title}</div>
                    <div class="aura-resonance-meta">${track.artist}</div>
                  </div>

                  <div class="aura-resonance-right">
                    <button class="aura-resonance-heart-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.app.toggleFavoriteFromRegistry('ytm-covers', ${idx})" title="${isFav ? (isEn ? 'Remove from Liked' : 'Hapus dari Favorit') : (isEn ? 'Add to Liked' : 'Tambah ke Favorit')}">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    </button>
                    <span class="aura-resonance-duration">${track.duration || '3:30'}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }

    // =========================================================================
    // 6. PANGGUNG VISUAL & SESI LIVE (16:9 Cinema Widescreen Cards)
    // =========================================================================
    if (sections.forgottenFavorites && sections.forgottenFavorites.length > 0) {
      html += `
        <section class="aura-section-wrap">
          <div class="aura-section-header-wrap">
            <div class="aura-section-title-box">
              <span class="aura-kicker-tag">CINEMATIC STAGE</span>
              <h2 class="aura-modern-section-title">${isEn ? 'Visual Stage & Live Sessions' : 'Panggung Visual & Sesi Live'}</h2>
            </div>
            <div class="ytm-section-actions">
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('forgotten', -1)" title="${isEn ? 'Previous' : 'Sebelumnya'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              </button>
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('forgotten', 1)" title="${isEn ? 'Next' : 'Berikutnya'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>
          </div>

          <div class="aura-cinema-carousel" id="carousel-forgotten">
            ${sections.forgottenFavorites.map((track, idx) => {
              if (track.cardType === 'video') {
                return `
                  <div class="aura-cinema-card" onclick="window.app.playFromRegistry('ytm-forgotten', ${idx})">
                    <div class="aura-cinema-thumb-wrap">
                      <img src="${track.thumbnail}" alt="${track.title}" class="aura-cinema-thumb" loading="lazy" onerror="this.src='/images/liked.jpg'">
                      <div class="aura-cinema-overlay-play">
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                      <span class="aura-cinema-badge">LIVE 1080p</span>
                    </div>
                    <div class="aura-cinema-meta">
                      <div class="aura-cinema-title" title="${track.title}">${track.title}</div>
                      <div class="aura-cinema-artist">${track.artist}</div>
                    </div>
                  </div>
                `;
              } else {
                return `
                  <div class="aura-cinema-card" onclick="window.app.openHomeAlbumDetail('${track.albumId || 'pl-recap-26'}')">
                    <div class="aura-cinema-thumb-wrap">
                      <img src="${track.thumbnail}" alt="${track.title}" class="aura-cinema-thumb" loading="lazy" onerror="this.src='/images/liked.jpg'">
                      <div class="aura-cinema-overlay-play" onclick="event.stopPropagation(); window.app.playHomeAlbum('${track.albumId || 'pl-recap-26'}')">
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                      <span class="aura-cinema-badge">SEASON RECAP</span>
                    </div>
                    <div class="aura-cinema-meta">
                      <div class="aura-cinema-title" title="${track.title}">${track.title}</div>
                      <div class="aura-cinema-artist">${track.artist}</div>
                    </div>
                  </div>
                `;
              }
            }).join('')}
          </div>
        </section>
      `;
    }

    // =========================================================================
    // 7. HARMONI MIX & PLAYLIST PILIHAN (Mixed For You & K-Pop Hits)
    // =========================================================================
    if (sections.mixedForYou && sections.mixedForYou.length > 0) {
      html += `
        <section class="aura-section-wrap">
          <div class="aura-section-header-wrap">
            <div class="aura-section-title-box">
              <span class="aura-kicker-tag">MIXED FOR YOU</span>
              <h2 class="aura-modern-section-title">${isEn ? 'Special Mixed Harmonies' : 'Harmoni Campuran Spesial'}</h2>
            </div>
            <div class="ytm-section-actions">
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('mixed', -1)" title="${isEn ? 'Previous' : 'Sebelumnya'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              </button>
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('mixed', 1)" title="${isEn ? 'Next' : 'Berikutnya'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>
          </div>

          <div class="aura-mix-carousel" id="carousel-mixed">
            ${sections.mixedForYou.map((track, idx) => {
              const isLiked = track.id === 'mix-liked';
              const isSupermix = track.albumId === 'deck-supermix';
              const clickAction = isLiked ? "window.app.openLikedMusicDetail()" : `window.app.openHomeAlbumDetail('${track.albumId || 'deck-supermix'}')`;
              const playAction = isLiked ? "event.stopPropagation(); window.app.playTrackList(window.app.favorites, 0)" : `event.stopPropagation(); window.app.playHomeAlbum('${track.albumId || 'deck-supermix'}')`;
              const subTitle = isLiked
                ? `${this.favorites ? this.favorites.length : 0} ${isEn ? 'Liked Songs' : 'Lagu Favorit'}`
                : ((isSupermix && topArtists.length > 0)
                    ? topArtists.slice(0, 2).map(a => a.name).join(', ')
                    : track.artist);

              return `
                <div class="aura-mix-card" onclick="${clickAction}">
                  <div class="aura-mix-thumb-wrap">
                    <img src="${track.thumbnail}" alt="${track.title}" class="aura-mix-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                    <div class="aura-mix-play-btn" onclick="${playAction}" title="${isEn ? 'Play Now' : 'Putar Sekarang'}">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                  <div class="aura-mix-info">
                    <div class="aura-mix-title" title="${track.title}">${track.title}</div>
                    <div class="aura-mix-sub">${subTitle}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </section>
      `;
    }

    if (userName) {
      html = html.replace(/BIZLEE TEMPEST/gi, userName).replace(/Bizlee/gi, userName);
    }

    container.innerHTML = html;
  }

  // ==========================================
  // DSP PRESET SWITCHER FOR BENTO GRID
  // ==========================================
  applyDspPreset(presetName) {
    if (window.audioEngine) {
      window.audioEngine.applyPreset(presetName);
      const presetNames = {
        dolby: 'Dolby Atmos Enhancer',
        nahimic: 'Nahimic Bass & Clarity',
        bassHeavy: 'Bass Boost Extreme',
        bass: 'Bass Boost Extreme',
        vocal: 'Vocal Presence',
        electronic: 'EDM / Synth',
        club: 'EDM / Synth',
        flat: 'Flat / Natural'
      };
      const title = presetNames[presetName] || presetName.toUpperCase();
      this.showToast(`DSP Preset: ${title} diaktifkan! 🎚️`, 'info');
      document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-preset') === presetName || (presetName === 'bass' && btn.getAttribute('data-preset') === 'bassHeavy') || (presetName === 'club' && btn.getAttribute('data-preset') === 'electronic'));
      });
      document.querySelectorAll('.aura-dsp-pill').forEach(pill => {
        pill.classList.toggle('active', pill.getAttribute('onclick')?.includes(presetName));
      });
    }
  }

  renderYTMMoodFeed(moodData, user) {
    const container = document.getElementById('ytm-home-sections');
    if (!container) return;

    this.registerTrackList('ytm-mood-quick', moodData.quickPicks || []);
    this.registerTrackList('ytm-mood-videos', moodData.featuredVideos || []);
    this.registerTrackList('ytm-mood-albums', moodData.albums || []);

    const isEn = (this.userProfile?.lang === 'en');

    let html = `
      <section class="aura-section-wrap">
        <div class="aura-section-header-wrap">
          <div class="aura-section-title-box">
            <span class="aura-kicker-tag">MOOD HARMONIZER</span>
            <h2 class="aura-modern-section-title">${isEn ? 'Resonance' : 'Resonansi'}: ${moodData.title}</h2>
          </div>
          <div class="ytm-section-actions">
            <button class="aura-pill-btn-primary" onclick="window.app.playFromRegistry('ytm-mood-quick', 0)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              ${isEn ? 'Play All' : 'Putar Semua'}
            </button>
            <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('mood-quick', -1)" title="${isEn ? 'Previous' : 'Sebelumnya'}">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('mood-quick', 1)" title="${isEn ? 'Next' : 'Berikutnya'}">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
          </div>
        </div>
        <div class="aura-resonance-grid" id="carousel-mood-quick">
          ${(moodData.quickPicks || []).map((track, idx) => {
            const isCurrent = this.currentTrack?.id === track.id;
            const isFav = this.isFavorited(track.id);
            return `
              <div class="aura-resonance-tile ${isCurrent ? 'is-playing' : ''}" data-track-id="${track.id}" onclick="window.app.playFromRegistry('ytm-mood-quick', ${idx})">
                <div class="aura-resonance-num">
                  ${isCurrent ? `
                    <div class="aura-mini-equalizer inline-eq"><span></span><span></span><span></span></div>
                  ` : `
                    <span>${(idx + 1).toString().padStart(2, '0')}</span>
                  `}
                </div>
                <div class="aura-resonance-thumb-box">
                  <img src="${track.thumbnail}" alt="${track.title}" class="aura-resonance-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
                  <div class="aura-resonance-play-icon">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div class="aura-resonance-info">
                  <div class="aura-resonance-title" title="${track.title}">${track.title}</div>
                  <div class="aura-resonance-meta">${track.artist}</div>
                </div>
                <div class="aura-resonance-right">
                  <button class="aura-resonance-heart-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); window.app.toggleFavoriteFromRegistry('ytm-mood-quick', ${idx})" title="${isFav ? (isEn ? 'Remove from Liked' : 'Hapus dari Favorit') : (isEn ? 'Add to Liked' : 'Tambah ke Favorit')}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? '#ef4444' : 'none'}" stroke="${isFav ? '#ef4444' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  </button>
                  <span class="aura-resonance-duration">${track.duration || '3:30'}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;

    if (moodData.featuredVideos && moodData.featuredVideos.length > 0) {
      html += `
        <section class="aura-section-wrap">
          <div class="aura-section-header-wrap">
            <div class="aura-section-title-box">
              <span class="aura-kicker-tag">VISUAL STAGE</span>
              <h2 class="aura-modern-section-title">${isEn ? 'Popular Videos & Music' : 'Video & Musik Populer'}</h2>
            </div>
            <div class="ytm-section-actions">
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('mood-videos', -1)" title="${isEn ? 'Previous' : 'Sebelumnya'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
              </button>
              <button class="ytm-carousel-btn" onclick="window.app.scrollCarousel('mood-videos', 1)" title="${isEn ? 'Next' : 'Berikutnya'}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            </div>
          </div>
          <div class="aura-cinema-carousel" id="carousel-mood-videos">
            ${moodData.featuredVideos.map((track, idx) => `
              <div class="aura-cinema-card" onclick="window.app.playFromRegistry('ytm-mood-videos', ${idx})">
                <div class="aura-cinema-thumb-wrap">
                  <img src="${track.thumbnail}" alt="${track.title}" class="aura-cinema-thumb" loading="lazy" onerror="this.src='/images/chill_vibes.jpg'">
                  <div class="aura-cinema-overlay-play">
                    <svg viewBox="0 0 24 24" width="30" height="30" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
                  </div>
                </div>
                <div class="aura-cinema-meta">
                  <div class="aura-cinema-title" title="${track.title}">${track.title}</div>
                  <div class="aura-cinema-artist">${track.artist}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </section>
      `;
    }

    container.innerHTML = html;
  }

  // ==========================================
  // ALBUM & CURATED PLAYLIST DETAIL CONTROLLER
  // ==========================================
  async openHomeAlbumDetail(albumId) {
    if (!albumId) return;

    const sections = document.getElementById('ytm-home-sections');
    const chips = (document.getElementById('home-mood-chips-container') || document.getElementById('ytm-mood-chips'));
    const detailView = document.getElementById('home-album-detail-view');
    if (!detailView) return;

    const isEn = (this.userProfile?.lang === 'en');

    // Show loading state in detail view immediately
    if (sections) sections.style.display = 'none';
    if (chips) chips.style.display = 'none';
    detailView.style.display = 'block';
    detailView.innerHTML = `
      <div class="home-album-detail">
        <button class="home-album-nav-back" onclick="window.app.closeHomeAlbumDetail()">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          ${isEn ? 'Back to Home' : 'Kembali ke Beranda'}
        </button>
        ${this.renderLoadingState(isEn ? 'Loading album details & tracklist...' : 'Memuat detail album & daftar lagu...', true, 4)}
      </div>
    `;

    // Scroll main area to top
    const mainContent = document.querySelector('.main-content') || window;
    if (mainContent.scrollTo) mainContent.scrollTo({ top: 0, behavior: 'smooth' });

    let album = null;
    try {
      if (albumId === 'deck-supermix' || albumId === 'showcase-supermix') {
        const payload = window.tasteEngine ? window.tasteEngine.generateSupermixPayload() : {};
        const res = await fetch('/api/recommendations/supermix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success && data.album) album = data.album;
      } else if (albumId === 'mix-liked-radio') {
        const res = await fetch('/api/recommendations/liked-radio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ favorites: this.favorites || [] })
        });
        const data = await res.json();
        if (data.success && data.album) album = data.album;
      } else {
        const res = await fetch(`/api/home/album/${encodeURIComponent(albumId)}`);
        const data = await res.json();
        if (data.success && data.album) {
          album = data.album;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch album detail from API, checking local cache:', err);
    }

    if (!album && this.homeAlbums && this.homeAlbums[albumId]) {
      album = this.homeAlbums[albumId];
    }

    if (!album && this.playlists) {
      const pl = this.playlists.find(p => p.id === albumId || String(p.id) === String(albumId));
      if (pl) {
        album = {
          id: pl.id,
          title: pl.title,
          artist: pl.source === 'spotify' ? 'Spotify Imported Album' : (pl.source === 'youtube' ? 'YouTube Music Imported Album' : (pl.artist || 'AuraSound Album')),
          description: pl.description || `Koleksi ${pl.tracks?.length || 0} lagu yang diimpor ke AuraSound.`,
          thumbnail: pl.thumbnail || '/images/supermix.jpg',
          tracks: pl.tracks || [],
          badge: pl.source === 'spotify' ? 'SPOTIFY' : 'ALBUM',
          year: new Date().getFullYear(),
          genre: 'Imported Album'
        };
      } else if (albumId.startsWith('mix-fusion-')) {
        const imp = this.playlists.filter(p => p.isImported || p.source === 'spotify' || p.source === 'youtube');
        if (imp.length >= 2) {
          const mergedTracks = [];
          const maxT = Math.max(imp[0].tracks?.length || 0, imp[1].tracks?.length || 0);
          for (let i = 0; i < maxT; i++) {
            if (imp[0].tracks && imp[0].tracks[i]) mergedTracks.push(imp[0].tracks[i]);
            if (imp[1].tracks && imp[1].tracks[i]) mergedTracks.push(imp[1].tracks[i]);
          }
          album = {
            id: albumId,
            title: `${imp[0].title} × ${imp[1].title} Fusion`,
            artist: `${imp[0].title} & ${imp[1].title}`,
            description: `Perpaduan crossover harmonis antara album "${imp[0].title}" dan "${imp[1].title}".`,
            thumbnail: imp[0].thumbnail || imp[1].thumbnail || '/images/supermix.jpg',
            tracks: mergedTracks,
            badge: 'FUSION MIX',
            year: '2026',
            genre: 'Crossover Hybrid Mix'
          };
        }
      }
    }

    if (!album) {
      detailView.innerHTML = `
        <div class="home-album-detail">
          <button class="home-album-nav-back" onclick="window.app.closeHomeAlbumDetail()">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            ${isEn ? 'Back to Home' : 'Kembali ke Beranda'}
          </button>
          <div class="empty-state">
            <div class="empty-icon">💿</div>
            <h3>${isEn ? 'Album not found' : 'Album tidak ditemukan'}</h3>
            <p>${isEn ? 'This album or playlist is currently unavailable.' : 'Detail album atau playlist ini belum tersedia.'}</p>
          </div>
        </div>
      `;
      return;
    }

    this.currentAlbumDetail = album;
    const tracks = album.tracks || [];
    const totalDuration = album.totalDuration || `${tracks.length} ${isEn ? 'Songs' : 'Lagu'}`;

    detailView.innerHTML = `
      <div class="home-album-detail">
        <button class="home-album-nav-back" onclick="window.app.closeHomeAlbumDetail()">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          ${isEn ? 'Back to Home' : 'Kembali ke Beranda'}
        </button>

        <div class="home-album-banner">
          <div class="home-album-thumb-wrap">
            <img src="${album.thumbnail}" alt="${album.title}" class="home-album-thumb" onerror="this.src='/images/supermix.jpg'">
          </div>
          <div class="home-album-info">
            <div class="home-album-badge-row">
              <span class="home-album-badge">${album.type || 'ALBUM'}</span>
              <span class="home-album-hires-badge">24-BIT HI-RES • FLAC</span>
              ${album.badge ? `<span class="home-album-badge" style="background: rgba(6, 182, 212, 0.15); border-color: rgba(6, 182, 212, 0.3); color: #38bdf8;">${album.badge}</span>` : ''}
            </div>
            <h1 class="home-album-title">${album.title}</h1>
            <div class="home-album-artist">${album.artist || album.creator || 'AuraSound Music'}</div>
            <div class="home-album-meta">
              <span>${album.year || '2024 - 2026'}</span>
              <span class="home-album-meta-dot">•</span>
              <span id="home-album-meta-count">${tracks.length} ${isEn ? 'Songs' : 'Lagu'}</span>
              <span class="home-album-meta-dot">•</span>
              <span id="home-album-meta-duration">${totalDuration}</span>
            </div>
            ${album.description ? `<p class="home-album-desc">${album.description}</p>` : ''}

            <div class="home-album-actions">
              <button class="btn-album-play-all" onclick="window.app.playHomeAlbum('${album.id}', false)">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                ${isEn ? 'Play All' : 'Putar Semua'} (${tracks.length})
              </button>
              <button class="btn-album-secondary" onclick="window.app.playHomeAlbum('${album.id}', true)">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
                ${isEn ? 'Shuffle' : 'Acak'}
              </button>
              <button class="btn-album-save-lib" onclick="window.app.saveAlbumToUserPlaylists('${album.id}')">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                ${isEn ? 'Save to My Playlists' : 'Simpan ke Playlist Saya'}
              </button>
            </div>
          </div>
        </div>

        <div class="home-album-tracklist-section">
          <div class="home-album-section-heading">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--primary)" stroke-width="2.2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            <span id="home-album-tracks-count">${isEn ? 'Tracklist' : 'Daftar Lagu'} (${tracks.length})</span>
          </div>
          <div id="home-album-tracks-container" class="track-list"></div>
          <div id="home-album-pagination-box"></div>

          ${(album.type === 'playlist' || album.type === 'mix' || album.isAlbum || album.isImported || album.id === 'deck-supermix') ? `
          <div class="home-album-load-more-wrap">
            <button id="btn-load-more-album-tracks" class="btn-album-load-more" onclick="window.app.loadMoreAlbumTracks('${album.id}')">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
              <span>${isEn ? 'Load More Songs (Imported & YouTube Music)' : 'Muat Lebih Banyak Lagu (Gabungan Impor & YouTube Music)'}</span>
            </button>
          </div>
          ` : ''}
        </div>
      </div>
    `;

    this.albumCurrentPage = 1;
    this.renderPaginatedAlbumTracks(1);
  }

  renderPaginatedAlbumTracks(page = 1) {
    if (!this.currentAlbumDetail) return;
    const isEn = (this.userProfile?.lang === 'en');
    const album = this.currentAlbumDetail;
    const tracks = album.tracks || [];
    const container = document.getElementById('home-album-tracks-container');
    const paginationContainer = document.getElementById('home-album-pagination-box');

    if (!container) return;

    if (tracks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${album.id === 'liked-music' ? '❤️' : '💿'}</div>
          <h3>${album.id === 'liked-music'
            ? (isEn ? 'No liked songs yet' : 'Belum ada lagu yang disukai')
            : (isEn ? 'No tracks found' : 'Belum ada lagu')}</h3>
          <p>${album.id === 'liked-music'
            ? (isEn ? 'Click the heart button (❤️) on any song you listen to collect it here.' : 'Klik tombol hati (❤️) pada lagu yang Anda dengar untuk mengumpulkannya di sini.')
            : (isEn ? 'This album or playlist is currently empty.' : 'Daftar lagu dalam album ini belum tersedia.')}</p>
        </div>
      `;
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const pageSize = this.albumPageSize || 10;
    const totalPages = Math.ceil(tracks.length / pageSize);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    this.albumCurrentPage = currentPage;

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, tracks.length);
    const pageTracks = tracks.slice(startIndex, endIndex);

    const listKey = album.id === 'liked-music' ? 'liked-music' : `album-${album.id}`;
    this.registerTrackList(listKey, tracks);

    container.innerHTML = pageTracks.map((track, idx) => {
      const realIndex = startIndex + idx;
      const isCurrent = this.currentTrack && this.currentTrack.id === track.id;
      const isFav = this.isFavorited(track.id);
      return `
        <div class="track-row ${isCurrent ? 'active' : ''}" data-track-id="${track.id}" data-index="${realIndex + 1}" onclick="window.app.playFromRegistry('${listKey}', ${realIndex})">
          <span class="track-number">${isCurrent ? '▶' : realIndex + 1}</span>
          <img src="${track.thumbnail}" alt="${track.title}" class="track-row-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
          <div class="track-row-details">
            <div class="track-row-title">${track.title}</div>
            <div class="track-row-artist">${track.artist}</div>
          </div>
          <span class="track-row-duration">${track.duration}</span>
          <div class="track-row-actions" onclick="event.stopPropagation()">
            <button class="icon-btn row-fav-btn ${isFav ? 'active' : ''}" data-fav-track-id="${track.id}" onclick="window.app.toggleFavoriteFromRegistry('${listKey}', ${realIndex})" title="${isFav ? (isEn ? 'Remove from Liked' : 'Hapus dari Favorit') : (isEn ? 'Like' : 'Suka')}">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="${isFav ? '#10b981' : 'none'}" stroke="${isFav ? '#10b981' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <button class="icon-btn" onclick="window.app.promptAddToPlaylistFromRegistry('${listKey}', ${realIndex})" title="${isEn ? 'Add to Playlist' : 'Tambah ke Playlist'}">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Pagination controls
    if (paginationContainer) {
      if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
      }

      let pageButtonsHtml = `
        <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window.app.goToAlbumPage(${currentPage - 1})">
          ${isEn ? '‹ Prev' : '‹ Sebelumnya'}
        </button>
      `;

      const pagesToShow = [];
      if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pagesToShow.push(i);
      } else {
        pagesToShow.push(1);
        if (currentPage > 3) pagesToShow.push('...');
        
        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) pagesToShow.push(i);
        
        if (currentPage < totalPages - 2) pagesToShow.push('...');
        pagesToShow.push(totalPages);
      }

      pagesToShow.forEach(p => {
        if (p === '...') {
          pageButtonsHtml += `<span class="pagination-ellipsis">...</span>`;
        } else {
          pageButtonsHtml += `
            <button class="pagination-btn ${p === currentPage ? 'active' : ''}" onclick="window.app.goToAlbumPage(${p})">
              ${p}
            </button>
          `;
        }
      });

      pageButtonsHtml += `
        <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window.app.goToAlbumPage(${currentPage + 1})">
          ${isEn ? 'Next ›' : 'Berikutnya ›'}
        </button>
      `;

      paginationContainer.innerHTML = `
        <div class="pagination-wrapper">
          <div class="pagination-info">
            ${isEn
              ? `Showing <strong>${startIndex + 1} - ${endIndex}</strong> of <strong>${tracks.length}</strong> songs (Page ${currentPage} / ${totalPages})`
              : `Menampilkan <strong>${startIndex + 1} - ${endIndex}</strong> dari <strong>${tracks.length}</strong> lagu (Halaman ${currentPage} / ${totalPages})`}
          </div>
          <div class="pagination-controls">
            ${pageButtonsHtml}
            ${totalPages > 5 ? `
              <div class="pagination-jump">
                <span>${isEn ? 'Go to:' : 'Ke hal:'}</span>
                <select class="pagination-select" onchange="window.app.goToAlbumPage(parseInt(this.value))">
                  ${Array.from({ length: totalPages }, (_, i) => i + 1).map(p => `
                    <option value="${p}" ${p === currentPage ? 'selected' : ''}>${p}</option>
                  `).join('')}
                </select>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }
  }

  goToAlbumPage(page) {
    this.renderPaginatedAlbumTracks(page);
    const el = document.getElementById('home-album-tracks-container');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async loadMoreAlbumTracks(albumId) {
    const btn = document.getElementById('btn-load-more-album-tracks');
    if (!btn || !this.currentAlbumDetail) return;

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `
      <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
      <span>Mencari & Mengambil lagu baru dari YouTube...</span>
    `;

    try {
      const currentCount = (this.currentAlbumDetail.tracks || []).length;
      const userKey = this.getUserKey();
      const res = await fetch(`/api/home/album/${encodeURIComponent(albumId)}/more?offset=${currentCount}`, {
        headers: {
          'x-device-id': userKey,
          'x-user-id': userKey
        }
      });
      const data = await res.json();

      if (data.success && data.newTracks && data.newTracks.length > 0) {
        const cleanTitleKey = (str) => (str || '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
        const existingIds = new Set(this.currentAlbumDetail.tracks.map(t => t.id));
        const existingTitles = new Set(this.currentAlbumDetail.tracks.map(t => cleanTitleKey(t.title)).filter(k => k.length >= 2));

        const trulyNew = data.newTracks.filter(t => {
          if (existingIds.has(t.id)) return false;
          const k = cleanTitleKey(t.title);
          if (k.length >= 2 && existingTitles.has(k)) return false;
          existingIds.add(t.id);
          if (k.length >= 2) existingTitles.add(k);
          return true;
        });

        if (trulyNew.length > 0) {
          this.currentAlbumDetail.tracks.push(...trulyNew);

          const listKey = `album-${this.currentAlbumDetail.id}`;
          this.registerTrackList(listKey, this.currentAlbumDetail.tracks);

          this.renderPaginatedAlbumTracks(this.albumCurrentPage);

          const isEn = this.userProfile?.lang === 'en';
          const heading = document.getElementById('home-album-tracks-count');
          if (heading) heading.textContent = `${isEn ? 'Tracklist' : 'Daftar Lagu'} (${this.currentAlbumDetail.tracks.length})`;
          const metaCount = document.getElementById('home-album-meta-count');
          if (metaCount) metaCount.textContent = `${this.currentAlbumDetail.tracks.length} ${isEn ? 'Songs' : 'Lagu'}`;

          this.showToast(`+${trulyNew.length} lagu baru ditambahkan (Gabungan Impor & YouTube Music)! 🎶`, 'success');
        } else {
          this.showToast('Semua lagu yang ditemukan sudah ada di dalam album.', 'info');
        }
      } else {
        this.showToast('Tidak ada lagi lagu baru yang ditemukan untuk album ini.', 'info');
      }
    } catch (err) {
      console.error(err);
      this.showToast('Gagal memuat lagu tambahan: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  closeHomeAlbumDetail() {
    const sections = document.getElementById('ytm-home-sections');
    const chips = (document.getElementById('home-mood-chips-container') || document.getElementById('ytm-mood-chips'));
    const detailView = document.getElementById('home-album-detail-view');

    if (detailView) {
      detailView.style.display = 'none';
      detailView.innerHTML = '';
    }
    if (sections) sections.style.display = '';
    if (chips) chips.style.display = 'flex';
  }

  async playHomeAlbum(albumId, shuffle = false) {
    let album = null;
    if (this.currentAlbumDetail && this.currentAlbumDetail.id === albumId) {
      album = this.currentAlbumDetail;
    } else if (albumId === 'deck-supermix' || albumId === 'showcase-supermix') {
      try {
        const payload = window.tasteEngine ? window.tasteEngine.generateSupermixPayload() : {};
        const res = await fetch('/api/recommendations/supermix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success && data.album) album = data.album;
      } catch (e) {
        console.warn('Supermix playback fetch error:', e);
      }
    } else if (albumId === 'mix-liked-radio') {
      try {
        const res = await fetch('/api/recommendations/liked-radio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ favorites: this.favorites || [] })
        });
        const data = await res.json();
        if (data.success && data.album) album = data.album;
      } catch (e) {
        console.warn('Liked radio playback fetch error:', e);
      }
    } else if (this.homeAlbums && this.homeAlbums[albumId]) {
      album = this.homeAlbums[albumId];
    } else {
      try {
        const res = await fetch(`/api/home/album/${encodeURIComponent(albumId)}`);
        const data = await res.json();
        if (data.success && data.album) {
          album = data.album;
        }
      } catch (e) {
        console.warn('Failed to load album for playback:', e);
      }
    }

    if (!album && this.playlists) {
      const pl = this.playlists.find(p => p.id === albumId || String(p.id) === String(albumId));
      if (pl) {
        album = {
          id: pl.id,
          title: pl.title,
          tracks: pl.tracks || []
        };
      } else if (albumId.startsWith('mix-fusion-')) {
        const imp = this.playlists.filter(p => p.isImported || p.source === 'spotify' || p.source === 'youtube');
        if (imp.length >= 2) {
          const mergedTracks = [];
          const maxT = Math.max(imp[0].tracks?.length || 0, imp[1].tracks?.length || 0);
          for (let i = 0; i < maxT; i++) {
            if (imp[0].tracks && imp[0].tracks[i]) mergedTracks.push(imp[0].tracks[i]);
            if (imp[1].tracks && imp[1].tracks[i]) mergedTracks.push(imp[1].tracks[i]);
          }
          album = {
            id: albumId,
            title: `${imp[0].title} × ${imp[1].title} Fusion`,
            tracks: mergedTracks
          };
        }
      }
    }

    if (!album || !album.tracks || album.tracks.length === 0) {
      this.showToast('Tidak ada lagu dalam album ini', 'error');
      return;
    }

    let tracksToPlay = [...album.tracks];
    if (shuffle) {
      for (let i = tracksToPlay.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tracksToPlay[i], tracksToPlay[j]] = [tracksToPlay[j], tracksToPlay[i]];
      }
    }

    this.playTrackList(tracksToPlay, 0);
    this.showToast(shuffle ? `Memutar Acak: ${album.title} 🔀` : `Memutar: ${album.title} 💿`, 'success');
  }

  openLikedMusicDetail() {
    const detailView = document.getElementById('home-album-detail-view');
    const sections = document.getElementById('ytm-home-sections');
    const chips = (document.getElementById('home-mood-chips-container') || document.getElementById('ytm-mood-chips'));
    if (!detailView) return;

    if (sections) sections.style.display = 'none';
    if (chips) chips.style.display = 'none';
    detailView.style.display = 'block';

    const isEn = (this.userProfile?.lang === 'en');
    const tracks = this.favorites || [];
    const totalDuration = `${tracks.length} ${isEn ? 'Liked Songs' : 'Lagu Favorit'}`;

    const likedAlbum = {
      id: 'liked-music',
      type: 'playlist',
      badge: 'LIKED MUSIC',
      title: isEn ? 'Liked Songs' : 'Lagu yang Disukai',
      artist: isEn ? 'Your Handpicked Favorite Music Collection' : 'Koleksi Pribadi Lagu Favorit Anda',
      releaseYear: isEn ? 'Auto Synchronized' : 'Otomatis Disinkronkan',
      genre: isEn ? 'Personal Favorites Collection' : 'Koleksi Favorit Pribadi',
      thumbnail: '/images/liked_music.jpg',
      description: isEn
        ? 'All songs you marked with a heart (❤️). AuraSound algorithm uses this collection as the core base for your personalized My Supermix.'
        : 'Seluruh lagu yang Anda tandai dengan ikon hati (❤️). Algoritma AuraSound menggunakan kumpulan lagu ini sebagai basis utama peracikan My Supermix Anda.',
      totalDuration: totalDuration,
      tracks: tracks
    };
    this.currentAlbumDetail = likedAlbum;

    detailView.innerHTML = `
      <div class="home-album-detail">
        <button class="home-album-nav-back" onclick="window.app.closeHomeAlbumDetail()">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          ${isEn ? 'Back to Home' : 'Kembali ke Beranda'}
        </button>

        <div class="home-album-banner" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.18) 0%, rgba(15, 23, 42, 0.8) 50%, rgba(16, 185, 129, 0.1) 100%);">
          <div class="home-album-thumb-wrap" style="box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6), 0 0 24px rgba(239, 68, 68, 0.35);">
            <img src="/images/liked_music.jpg" alt="${likedAlbum.title}" class="home-album-thumb" onerror="this.src='/icons/icon.svg'">
          </div>
          <div class="home-album-info">
            <div class="home-album-badge-row">
              <span class="home-album-badge" style="background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.4); color: #f87171;">${isEn ? 'PERSONAL COLLECTION' : 'KOLEKSI PRIBADI'}</span>
              <span class="home-album-hires-badge">${isEn ? '❤️ FAVORITES' : '❤️ FAVORIT'}</span>
            </div>
            <h1 class="home-album-title">${likedAlbum.title}</h1>
            <div class="home-album-artist">${likedAlbum.artist}</div>
            <div class="home-album-meta">
              <span>${isEn ? 'Auto Updated' : 'Diperbarui Otomatis'}</span>
              <span class="home-album-meta-dot">•</span>
              <span id="home-album-meta-count">${tracks.length} ${isEn ? 'Songs' : 'Lagu'}</span>
            </div>
            <p class="home-album-desc">${likedAlbum.description}</p>

            <div class="home-album-actions">
              <button class="btn-album-play-all" style="background: linear-gradient(135deg, #ef4444 0%, #f43f5e 100%); color: #fff;" onclick="window.app.playTrackList(window.app.favorites, 0)">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                ${isEn ? 'Play All' : 'Putar Semua'} (${tracks.length})
              </button>
              <button class="btn-album-secondary" onclick="window.app.openHomeAlbumDetail('mix-liked-radio')">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg>
                ${isEn ? '📻 Play Liked Songs Radio' : '📻 Putar Radio Lagu yang Disukai'}
              </button>
            </div>
          </div>
        </div>

        <div class="home-album-tracklist-section">
          <div class="home-album-section-heading">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#ef4444" stroke="#ef4444" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span id="home-album-tracks-count">${isEn ? 'Liked Songs List' : 'Daftar Lagu Disukai'} (${tracks.length})</span>
          </div>
          <div id="home-album-tracks-container" class="track-list"></div>
          <div id="home-album-pagination-box"></div>
        </div>
      </div>
    `;

    this.albumCurrentPage = 1;
    this.renderPaginatedAlbumTracks(1);
  }

  async saveAlbumToUserPlaylists(albumId) {
    let album = this.currentAlbumDetail;
    if (!album || album.id !== albumId) {
      if (this.homeAlbums && this.homeAlbums[albumId]) {
        album = this.homeAlbums[albumId];
      } else {
        try {
          const res = await fetch(`/api/home/album/${encodeURIComponent(albumId)}`);
          const data = await res.json();
          if (data.success) album = data.album;
        } catch (e) {}
      }
    }

    if (!album) {
      this.showToast('Gagal memuat data album', 'error');
      return;
    }

    try {
      const userKey = this.getUserKey();
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': this.currentUser?.email || '',
          'x-user-id': userKey,
          'x-device-id': userKey
        },
        body: JSON.stringify({
          title: album.title,
          tracks: album.tracks || [],
          thumbnail: album.thumbnail,
          userEmail: this.currentUser?.email || '',
          userId: userKey,
          deviceId: userKey
        })
      });
      const data = await res.json();
      if (data.success && data.playlist) {
        this.playlists = this.playlists.filter(p => p.id !== data.playlist.id);
        this.playlists.unshift(data.playlist);
        this.savePlaylists();
        const isEn = this.userProfile?.lang === 'en';
        this.showToast(isEn ? `"${album.title}" saved to My Playlists! 🎧` : `"${album.title}" berhasil disimpan ke Playlist Saya! 🎧`, 'success');
      } else {
        throw new Error(data.error || 'Gagal menyimpan');
      }
    } catch (err) {
      const isEn = this.userProfile?.lang === 'en';
      const localPl = {
        id: 'pl-' + Date.now(),
        title: album.title,
        tracks: album.tracks || [],
        thumbnail: album.thumbnail || '/icons/icon.svg',
        createdAt: new Date().toLocaleDateString('id-ID'),
        isImported: false
      };
      this.playlists.unshift(localPl);
      this.savePlaylists();
      this.showToast(isEn ? `"${album.title}" saved to local playlists! 🎧` : `"${album.title}" disimpan ke Playlist lokal! 🎧`, 'success');
    }
  }

  registerTrackList(key, tracks) {
    if (!this.trackListRegistry) this.trackListRegistry = {};
    this.trackListRegistry[key] = tracks;
  }

  playFromRegistry(key, index) {
    const list = this.trackListRegistry?.[key] || [];
    if (list[index]) {
      this.playTrackList(list, index);
    }
  }

  toggleFavoriteFromRegistry(key, index, event = null) {
    const list = this.trackListRegistry?.[key] || [];
    if (list[index]) {
      this.toggleFavorite(list[index], event || window.event);
    }
  }

  promptAddToPlaylistFromRegistry(key, index) {
    const list = this.trackListRegistry?.[key] || [];
    if (list[index]) {
      this.promptAddToPlaylist(list[index]);
    }
  }

  renderTrackGrid(tracks, container, key = 'trending') {
    this.registerTrackList(key, tracks);
    container.innerHTML = tracks.map((track, idx) => `
      <div class="music-card" onclick="window.app.playFromRegistry('${key}', ${idx})">
        <div class="card-thumb-wrapper">
          <img src="${track.thumbnail}" alt="${track.title}" class="card-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
          <div class="card-play-btn">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <span class="card-duration">${track.duration}</span>
        </div>
        <div class="card-title" title="${track.title}">${track.title}</div>
        <div class="card-artist">${track.artist}</div>
      </div>
    `).join('');
  }

  renderTrackList(tracks, container, options = {}) {
    const isEn = this.userProfile?.lang === 'en';
    const listKey = options.listKey || 'search';
    this.registerTrackList(listKey, tracks);

    container.innerHTML = tracks.map((track, idx) => `
      <div class="track-row ${this.currentTrack?.id === track.id ? 'active' : ''}" data-track-id="${track.id}" data-index="${idx + 1}" onclick="window.app.playFromRegistry('${listKey}', ${idx})">
        <span class="track-number">${this.currentTrack?.id === track.id ? '▶' : idx + 1}</span>
        <img src="${track.thumbnail}" alt="${track.title}" class="track-row-thumb" loading="lazy" onerror="this.src='/images/supermix.jpg'">
        <div class="track-row-details">
          <div class="track-row-title">
            ${track.title}
            ${track.isOfficial ? `<span class="track-tag-badge track-tag-official">OFFICIAL</span>` : (track.tag === 'NON-OFFICIAL' ? `<span class="track-tag-badge track-tag-nonofficial">COVER / REMIX</span>` : '')}
          </div>
          <div class="track-row-artist">${track.artist}</div>
        </div>
        <span class="track-row-duration">${track.duration}</span>
        <div class="track-row-actions" onclick="event.stopPropagation()">
          <button class="icon-btn row-fav-btn ${this.isFavorited(track.id) ? 'active' : ''}" data-fav-track-id="${track.id}" onclick="window.app.toggleFavoriteFromRegistry('${listKey}', ${idx})" title="${this.isFavorited(track.id) ? (isEn ? 'Remove from Liked' : 'Hapus dari Favorit') : (isEn ? 'Like' : 'Suka')}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="${this.isFavorited(track.id) ? '#10b981' : 'none'}" stroke="${this.isFavorited(track.id) ? '#10b981' : 'currentColor'}" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          <button class="icon-btn" onclick="window.app.promptAddToPlaylistFromRegistry('${listKey}', ${idx})" title="${isEn ? 'Add to Playlist' : 'Tambah ke Playlist'}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          ${options.canDelete ? `
            <button class="icon-btn" onclick="window.app.removeTrackFromPlaylist('${options.playlistId}', '${track.id}')" title="${isEn ? 'Remove from Playlist' : 'Hapus dari Playlist'}" style="color: #f87171;">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  // ==========================================
  // PLAYBACK STATE PERSISTENCE (Desktop Session Restore)
  // ==========================================
  persistPlaybackState() {
    if (!this.currentTrack && (!this.queue || this.queue.length === 0)) return;
    try {
      const state = {
        currentTrack: this.currentTrack,
        queue: Array.isArray(this.queue) ? this.queue.slice(0, 50) : [],
        queueIndex: typeof this.queueIndex === 'number' ? this.queueIndex : 0,
        currentTime: this.nativeAudio ? (this.nativeAudio.currentTime || 0) : 0,
        duration: this.nativeAudio ? (this.nativeAudio.duration || 0) : 0,
        volume: typeof this.lastVolume === 'number' ? this.lastVolume : 1.0,
        isMuted: !!this.isMuted,
        isShuffle: !!this.isShuffle,
        repeatMode: this.repeatMode || 'off',
        savedAt: Date.now()
      };
      localStorage.setItem('aurasound_playback_state', JSON.stringify(state));

      // Also persist to server disk asynchronously (throttled)
      if (this.currentTrack) {
        if (!this._lastServerStateSave || Date.now() - this._lastServerStateSave > 2000) {
          this._lastServerStateSave = Date.now();
          fetch('/api/user/playback-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Failed to persist playback state:', e);
    }
  }

  restorePlaybackState() {
    try {
      let state = (typeof window !== 'undefined' && window.__AURASOUND_PLAYBACK_STATE__) 
        ? window.__AURASOUND_PLAYBACK_STATE__ 
        : null;
      if (!state) {
        const raw = localStorage.getItem('aurasound_playback_state');
        if (raw) state = JSON.parse(raw);
      }
      if (!state) return;

      // Restore volume & mute
      if (typeof state.volume === 'number') {
        this.lastVolume = state.volume;
        this.setVolumeLevel(state.isMuted ? 0 : state.volume);
      }
      if (state.isShuffle) {
        this.isShuffle = true;
        if (this.shuffleBtn) this.shuffleBtn.classList.add('active');
        const cinemaShuffle = document.getElementById('cinema-btn-shuffle');
        if (cinemaShuffle) cinemaShuffle.classList.add('active');
      }
      if (state.repeatMode && state.repeatMode !== 'off') {
        this.repeatMode = state.repeatMode;
        if (this.repeatBtn) this.repeatBtn.classList.add('active');
        if (this.repeatBadge) {
          this.repeatBadge.textContent = state.repeatMode === 'one' ? '1' : '∞';
        }
      }

      // Restore queue
      if (Array.isArray(state.queue) && state.queue.length > 0) {
        this.queue = state.queue;
        this.queueIndex = typeof state.queueIndex === 'number' ? state.queueIndex : 0;
      }

      // Restore track UI without auto-playing audio immediately
      if (state.currentTrack || state.track) {
        this.currentTrack = state.currentTrack || state.track;
        const track = this.currentTrack;

        if (this.playerTitle) this.playerTitle.textContent = track.title || 'Lagu';
        if (this.playerArtist) this.playerArtist.textContent = track.artist || 'AuraSound';
        if (this.playerThumb) {
          this.playerThumb.src = track.thumbnail || '/images/supermix.jpg';
          this.playerThumb.onerror = () => { this.playerThumb.src = '/images/supermix.jpg'; };
        }
        if (this.playerVinylLabelImg) {
          this.playerVinylLabelImg.src = track.thumbnail || '/images/supermix.jpg';
          this.playerVinylLabelImg.onerror = () => { this.playerVinylLabelImg.src = '/images/supermix.jpg'; };
        }
        const heroVinylThumb = document.querySelector('.aura-vinyl-label-thumb');
        if (heroVinylThumb) {
          heroVinylThumb.src = track.thumbnail || '/images/supermix.jpg';
          heroVinylThumb.onerror = () => { heroVinylThumb.src = '/images/supermix.jpg'; };
        }
        if (this.cinemaVinylThumb) {
          this.cinemaVinylThumb.src = track.thumbnail || '/images/supermix.jpg';
          this.cinemaVinylThumb.onerror = () => { this.cinemaVinylThumb.src = '/images/supermix.jpg'; };
        }
        if (this.badgeSourceText) {
          this.badgeSourceText.textContent = track.type === 'suno' ? 'SUNO AI • DSP' : 'YT MUSIC • 24-BIT';
        }
        if (this.badgeSource) {
          this.badgeSource.className = track.type === 'suno' ? 'player-hifi-badge badge-suno' : 'player-hifi-badge badge-yt';
        }

        const dur = (state.duration && state.duration > 0) ? state.duration : (this.parseDuration(track.duration) || 180);
        const cur = (state.currentTime && state.currentTime > 0) ? Math.min(state.currentTime, dur) : 0;
        this._pendingSeekTime = cur;
        this.updateProgress(cur, dur);
        this.updateFavButtonState();
      }
    } catch (e) {
      console.warn('Failed to restore playback state:', e);
    }
  }

  playTrackList(tracks, startIndex = 0) {
    if (!Array.isArray(tracks) || tracks.length === 0) return;

    // Directly preserve the exact tracks array and exact clicked index
    this.queue = [...tracks];
    const safeIndex = Math.min(Math.max(0, startIndex), this.queue.length - 1);
    this.queueIndex = safeIndex;
    this.persistPlaybackState();

    const selectedTrack = this.queue[this.queueIndex];
    if (selectedTrack) {
      this.playTrack(selectedTrack);
    }
  }

  addToQueue(track) {
    if (!track) return;
    const cleanKey = (str) => (str || '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const id = track.id || track.videoId;
    const titleKey = cleanKey(track.title);

    const exists = this.queue.some(t => {
      const tId = t.id || t.videoId;
      if (id && tId && id === tId) return true;
      if (titleKey && titleKey.length >= 2 && cleanKey(t.title) === titleKey) return true;
      return false;
    });

    if (exists) {
      this.showToast(`"${track.title}" sudah ada di dalam antrean ℹ️`, 'info');
      return;
    }

    this.queue.push(track);
    this.persistPlaybackState();
    this.showToast(`"${track.title}" ditambahkan ke antrean 🎶`, 'success');
  }

  async playTrack(track) {
    if (!track) return;

    if (track.id === 'mix-liked') {
      if (this.favorites && this.favorites.length > 0) {
        this.playTrackList(this.favorites, 0);
        this.showToast('Memutar Lagu Favorit Anda ❤️', 'success');
      } else {
        this.openLikedMusicDetail();
      }
      return;
    }

    // On-demand Spotify audio resolution (seamless matching without delay)
    if (track.id && (track.id.startsWith('sp_') || (track.isSpotify && !track.youtubeResolved))) {
      this.showToast(`Menyambungkan audio: ${track.title}...`, 'info');
      try {
        const resolveRes = await fetch(`/api/spotify/resolve?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist || '')}&id=${encodeURIComponent(track.spotifyId || track.id)}`);
        const resolveData = await resolveRes.json();
        if (resolveData.success && resolveData.videoId) {
          track.originalSpotifyId = track.id;
          track.id = resolveData.videoId;
          track.type = 'youtube';
          track.youtubeResolved = true;
          this.savePlaylists();
        }
      } catch (spErr) {
        console.warn('Spotify on-demand resolve error:', spErr);
      }
    }

    // Record playback metrics in TasteEngine and Play History
    if (window.tasteEngine) {
      if (this.currentTrackPlayStartTime && this.lastPlayedTrack) {
        const timePlayed = Math.floor((Date.now() - this.currentTrackPlayStartTime) / 1000);
        window.tasteEngine.recordTrackEnd(this.lastPlayedTrack, timePlayed, false);
      }
      this.lastPlayedTrack = track;
      this.currentTrackPlayStartTime = Date.now();
      window.tasteEngine.recordTrackStart(track);
    }
    this.recordTrackToHistory(track);

    if (!track.type) {
      track.type = 'youtube';
    }

    this.currentTrack = track;

    // Reset seekbar and time displays immediately for the new track
    const fallbackDur = this.parseDuration(track.duration) || 180;
    if (this.progressBar) {
      this.progressBar.max = fallbackDur;
      this.progressBar.value = 0;
      this.progressBar.style.setProperty('--seek-pct', '0%');
    }
    if (this.currentTimeEl) this.currentTimeEl.textContent = '0:00';
    if (this.durationEl) this.durationEl.textContent = track.duration || this.formatTime(fallbackDur);

    // Update Player UI
    if (this.playerTitle) this.playerTitle.textContent = track.title;
    if (this.playerArtist) this.playerArtist.textContent = track.artist || 'AuraSound';
    if (this.playerThumb) {
      this.playerThumb.src = track.thumbnail || '/images/supermix.jpg';
      this.playerThumb.onerror = () => { this.playerThumb.src = '/images/supermix.jpg'; };
    }
    if (this.playerVinylLabelImg) {
      this.playerVinylLabelImg.src = track.thumbnail || '/images/supermix.jpg';
      this.playerVinylLabelImg.onerror = () => { this.playerVinylLabelImg.src = '/images/supermix.jpg'; };
    }
    if (this.cinemaVinylThumb) {
      this.cinemaVinylThumb.src = track.thumbnail || '/images/supermix.jpg';
      this.cinemaVinylThumb.onerror = () => { this.cinemaVinylThumb.src = '/images/supermix.jpg'; };
    }
    if (this.badgeSourceText) {
      this.badgeSourceText.textContent = track.type === 'suno' ? 'SUNO AI • DSP' : (track.isSpotify ? 'SPOTIFY • 24-BIT' : 'YT MUSIC • 24-BIT');
    }
    if (this.badgeSource) {
      this.badgeSource.className = track.type === 'suno' ? 'player-hifi-badge badge-suno' : 'player-hifi-badge badge-yt';
    }

    if (this.cinemaModal && this.cinemaModal.classList.contains('active')) {
      this.syncCinemaTrackInfo();
    }

    this.updateFavButtonState();

    // Update active highlight in DOM track rows with accurate number restore
    document.querySelectorAll('.track-row').forEach((row, idx) => {
      const isThis = row.getAttribute('data-track-id') === track.id;
      row.classList.toggle('active', isThis);
      const numEl = row.querySelector('.track-number');
      if (numEl) {
        if (isThis) {
          numEl.textContent = '▶';
        } else {
          const originalIndex = row.getAttribute('data-index');
          numEl.textContent = originalIndex ? originalIndex : (idx + 1);
        }
      }
    });

    // Route playback based on type
    if (track.type === 'suno' || track.type === 'local') {
      this.currentAudioMode = 'native';
      // Pause YouTube player
      if (window.ytPlayer) window.ytPlayer.pause();

      let targetUrl = track.audio_url;
      if (!targetUrl || targetUrl.includes('/api/forbidden')) {
        targetUrl = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${track.id}.m4a`;
      }

      // Play via HTML5 Native Audio -> through Web Audio API EQ
      const streamUrl = `/api/proxy-audio?id=${encodeURIComponent(track.id || '')}&url=${encodeURIComponent(targetUrl)}`;
      this.nativeAudio.src = streamUrl;
      this.nativeAudio.play().catch(e => {
        console.warn('Native audio proxy play error, trying direct stream:', e);
        this.nativeAudio.src = targetUrl;
        this.nativeAudio.play().catch(err => console.error('Audio direct play error:', err));
      });

      this.updateMediaSession(track);
    } else {
      // YouTube Music track -> Route through /api/stream-audio for 100% Web Audio DSP processing
      if (window.ytPlayer) window.ytPlayer.pause();
      this.currentAudioMode = 'native';

      const streamUrl = `/api/stream-audio?id=${encodeURIComponent(track.id)}`;
      this.nativeAudio.src = streamUrl;

      const playPromise = this.nativeAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('Direct audio stream error, falling back to YouTube player:', err);
          this.currentAudioMode = 'yt';
          if (this.nativeAudio) this.nativeAudio.pause();
          window.ytPlayer.loadAndPlay(track);
          this.updateEqStatusBanner();
        });
      }

      this.nativeAudio.onerror = (e) => {
        if (this.currentAudioMode === 'native' && track.type !== 'suno' && track.type !== 'local') {
          console.warn('Native audio error event, falling back to YouTube player:', e);
          this.currentAudioMode = 'yt';
          this.nativeAudio.onerror = null;
          window.ytPlayer.loadAndPlay(track);
          this.updateEqStatusBanner();
        }
      };

      this.updateMediaSession(track);
    }

    if (track.id !== 'dsp-test-demo') {
      this.isDspTesting = false;
      const testBtnLabel = document.getElementById('btn-test-dsp-label');
      if (testBtnLabel) testBtnLabel.textContent = this.userProfile?.lang === 'en' ? 'Test DSP Audio' : 'Tes Audio DSP';
    }
    this.updateEqStatusBanner();

    this.updatePlayState(true);
    this.persistPlaybackState();
  }

  updateEqStatusBanner() {
    const textEl = document.getElementById('eq-status-text');
    const dotEl = document.getElementById('eq-status-dot');
    if (!textEl) return;
    const isEn = (this.userProfile?.lang === 'en');

    if (this.isDspTesting) {
      textEl.textContent = isEn ? 'DSP Test Mode Active (100% Live Filter)' : 'Mode Tes DSP Aktif (100% Termodifikasi)';
      if (dotEl) dotEl.className = 'status-indicator-dot dot-active';
    } else if (this.currentAudioMode === 'native') {
      textEl.textContent = isEn ? 'DSP Web Audio Engine Active (100% Live Filter)' : 'DSP Web Audio Engine Aktif (100% Termodifikasi)';
      if (dotEl) dotEl.className = 'status-indicator-dot dot-active';
    } else {
      textEl.textContent = isEn ? 'YouTube Music • Hi-Fi Direct Stream' : 'YouTube Music • Studio Hi-Fi';
      if (dotEl) dotEl.className = 'status-indicator-dot dot-yt';
    }
  }

  startDspTest() {
    if (this.isDspTesting) {
      this.stopDspTest();
      return;
    }

    const isEn = (this.userProfile?.lang === 'en');
    this.isDspTesting = true;
    const testTrack = {
      id: 'dsp-test-demo',
      title: 'AuraSound DSP Acoustic Beat (Demo)',
      artist: 'Web Audio DSP 32-Bit Studio Test',
      type: 'local',
      audio_url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
      thumbnail: '/images/supermix.jpg',
      duration: '2:27'
    };

    const testBtnLabel = document.getElementById('btn-test-dsp-label');
    if (testBtnLabel) testBtnLabel.textContent = isEn ? 'Stop Test' : 'Stop Tes';

    this.playTrack(testTrack);
    this.updateEqStatusBanner();
    this.showToast(isEn ? '🎧 DSP Test Mode Active! Switch presets now to hear the difference.' : '🎧 Mode Tes DSP Aktif! Silakan ganti preset sekarang untuk mendengar perbedaannya.', 'success');
  }

  stopDspTest() {
    const isEn = (this.userProfile?.lang === 'en');
    this.isDspTesting = false;
    const testBtnLabel = document.getElementById('btn-test-dsp-label');
    if (testBtnLabel) testBtnLabel.textContent = isEn ? 'Test DSP Audio' : 'Tes Audio DSP';

    if (this.nativeAudio) {
      this.nativeAudio.pause();
    }
    this.updatePlayState(false);
    this.updateEqStatusBanner();
    this.showToast(isEn ? 'DSP Test Mode Stopped.' : 'Mode Tes DSP Dihentikan.', 'info');
  }

  togglePlay() {
    if (!this.currentTrack) {
      if (this.queue && this.queue.length > 0) {
        this.playTrack(this.queue[0]);
      }
      return;
    }

    if (this.currentAudioMode === 'native' || this.currentTrack.type === 'suno' || this.currentTrack.type === 'local') {
      if (!this.nativeAudio.src || this.nativeAudio.src === '' || this.nativeAudio.src.endsWith('/')) {
        this.playTrack(this.currentTrack);
        return;
      }
      if (this.nativeAudio.paused) {
        this.nativeAudio.play().catch(e => {
          this.playTrack(this.currentTrack);
        });
      } else {
        this.nativeAudio.pause();
      }
    } else {
      window.ytPlayer.togglePlay();
    }
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    if (this.shuffleBtn) {
      this.shuffleBtn.classList.toggle('active', this.isShuffle);
    }
    const cinemaShuffle = document.getElementById('cinema-btn-shuffle');
    if (cinemaShuffle) {
      cinemaShuffle.classList.toggle('active', this.isShuffle);
    }
    this.persistPlaybackState();
    this.showToast(this.isShuffle ? 'Acak Lagu (Shuffle) Aktif 🔀' : 'Acak Lagu Dinonaktifkan', 'info');
  }

  toggleRepeat() {
    if (this.repeatMode === 'off') {
      this.repeatMode = 'all';
      if (this.repeatBtn) this.repeatBtn.classList.add('active');
      if (this.repeatBadge) this.repeatBadge.textContent = '';
      this.showToast('Ulangi Semua Lagu (Repeat All) 🔁', 'info');
    } else if (this.repeatMode === 'all') {
      this.repeatMode = 'one';
      if (this.repeatBtn) this.repeatBtn.classList.add('active');
      if (this.repeatBadge) this.repeatBadge.textContent = '1';
      this.showToast('Ulangi 1 Lagu Ini (Repeat One) 🔂', 'info');
    } else {
      this.repeatMode = 'off';
      if (this.repeatBtn) this.repeatBtn.classList.remove('active');
      if (this.repeatBadge) this.repeatBadge.textContent = '';
      this.showToast('Ulangi Lagu Dinonaktifkan', 'info');
    }
    this.persistPlaybackState();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      const current = parseFloat(this.volumeSlider ? this.volumeSlider.value : 100) / 100;
      if (current > 0) this.lastVolume = current;
      this.setVolumeLevel(0);
      this.showToast('Suara Dibisukan (Muted) 🔇', 'info');
    } else {
      const restoreVol = (this.lastVolume && this.lastVolume > 0) ? this.lastVolume : 0.8;
      this.setVolumeLevel(restoreVol);
      this.showToast('Suara Diaktifkan 🔊', 'info');
    }
  }

  setVolumeLevel(vol) {
    const clamped = Math.max(0, Math.min(1, vol));
    const pct = Math.round(clamped * 100);
    if (this.volumeSlider) {
      this.volumeSlider.value = pct;
      this.volumeSlider.style.setProperty('--vol-pct', `${pct}%`);
    }
    if (this.nativeAudio) this.nativeAudio.volume = clamped;
    if (window.ytPlayer) window.ytPlayer.setVolume(pct);

    const isMute = (pct === 0);
    this.isMuted = isMute;
    if (this.volumeIconHigh) this.volumeIconHigh.style.display = isMute ? 'none' : 'block';
    if (this.volumeIconMuted) this.volumeIconMuted.style.display = isMute ? 'block' : 'none';
    this.persistPlaybackState();
  }

  playNext() {
    if (this.queue.length === 0) return;

    // Repeat one single track
    if (this.repeatMode === 'one' && this.currentTrack) {
      this.playTrack(this.currentTrack);
      return;
    }

    // Shuffle playback
    if (this.isShuffle && this.queue.length > 1) {
      let nextIdx = Math.floor(Math.random() * this.queue.length);
      if (nextIdx === this.queueIndex) {
        nextIdx = (nextIdx + 1) % this.queue.length;
      }
      this.queueIndex = nextIdx;
      this.playTrack(this.queue[this.queueIndex]);
      return;
    }

    // Sequential queue
    if (this.queueIndex < this.queue.length - 1) {
      this.queueIndex++;
      this.playTrack(this.queue[this.queueIndex]);
    } else {
      // Loop back to start
      this.queueIndex = 0;
      this.playTrack(this.queue[0]);
    }
  }

  playPrev() {
    if (this.queue.length === 0) return;

    // If current song is already playing > 3 seconds, restart current track
    const currentTime = this.progressBar ? parseFloat(this.progressBar.value) : 0;
    if (currentTime > 3) {
      if (this.currentAudioMode === 'native' || this.currentTrack?.type === 'suno' || this.currentTrack?.type === 'local') {
        if (this.nativeAudio) this.nativeAudio.currentTime = 0;
      } else if (window.ytPlayer) {
        window.ytPlayer.seekTo(0);
      }
      return;
    }

    if (this.queueIndex > 0) {
      this.queueIndex--;
      this.playTrack(this.queue[this.queueIndex]);
    } else {
      // Loop to end of queue
      this.queueIndex = this.queue.length - 1;
      this.playTrack(this.queue[this.queueIndex]);
    }
  }

  updatePlayState(isPlaying) {
    this.isPlaying = Boolean(isPlaying);
    if (isPlaying) {
      if (window.audioEngine) window.audioEngine.resume();
      this.startLyricsSyncLoop();
    } else {
      this.stopLyricsSyncLoop();
    }
    if (!this.playPauseBtn) return;
    const playIcon = this.playPauseBtn.querySelector('.icon-play');
    const pauseIcon = this.playPauseBtn.querySelector('.icon-pause');

    if (isPlaying) {
      if (playIcon) playIcon.style.display = 'none';
      if (pauseIcon) pauseIcon.style.display = 'block';
    } else {
      if (playIcon) playIcon.style.display = 'block';
      if (pauseIcon) pauseIcon.style.display = 'none';
    }

    // Toggle global music playing classes for aura pulsing and equalizer animations
    document.body.classList.toggle('music-playing', isPlaying);
    document.body.classList.toggle('music-paused', !isPlaying);

    // Sync vinyl turntable rotation on Hero
    const vinyl = document.querySelector('.aura-vinyl-record');
    if (vinyl) {
      vinyl.classList.toggle('is-spinning', isPlaying);
    }
    const tonearm = document.querySelector('.aura-turntable-tonearm');
    if (tonearm) {
      tonearm.classList.toggle('on-record', isPlaying);
    }
    const vinylThumb = document.querySelector('.aura-vinyl-label-thumb');
    if (vinylThumb && this.currentTrack && this.currentTrack.thumbnail) {
      vinylThumb.src = this.currentTrack.thumbnail;
    }

    // Sync mini vinyl disc rotation & thumb wrap in bottom Hi-Fi player bar
    const playerThumbWrap = document.querySelector('.player-thumb-wrap');
    if (playerThumbWrap) {
      playerThumbWrap.classList.toggle('is-playing', isPlaying);
      playerThumbWrap.classList.toggle('is-paused', !isPlaying);
    }
    const miniVinyl = document.querySelector('.player-mini-vinyl');
    if (miniVinyl) {
      miniVinyl.classList.toggle('is-spinning', isPlaying);
    }
    if (this.playerVinylLabelImg && this.currentTrack?.thumbnail) {
      this.playerVinylLabelImg.src = this.currentTrack.thumbnail;
    }

    // Sync Studio Cinema turntable deck & controls
    if (this.cinemaTurntableDeck) {
      this.cinemaTurntableDeck.classList.toggle('is-spinning', isPlaying);
      const cinemaTonearm = document.getElementById('cinema-turntable-arm') || this.cinemaTurntableDeck.querySelector('.cinema-turntable-arm');
      if (cinemaTonearm) cinemaTonearm.classList.toggle('on-record', isPlaying);
    }
    if (this.cinemaBtnPlay) {
      const cPlayIcon = this.cinemaBtnPlay.querySelector('.cinema-icon-play, .icon-play');
      const cPauseIcon = this.cinemaBtnPlay.querySelector('.cinema-icon-pause, .icon-pause');
      if (cPlayIcon) cPlayIcon.style.display = isPlaying ? 'none' : 'block';
      if (cPauseIcon) cPauseIcon.style.display = isPlaying ? 'block' : 'none';
      this.cinemaBtnPlay.classList.toggle('is-playing', isPlaying);
      this.cinemaBtnPlay.setAttribute('title', isPlaying ? 'Jeda' : 'Putar');
    }

    // Update active highlight on resonance tiles
    if (this.currentTrack) {
      document.querySelectorAll('.aura-resonance-tile').forEach(tile => {
        const isCurrent = tile.getAttribute('data-track-id') === this.currentTrack.id;
        tile.classList.toggle('is-playing', isCurrent && isPlaying);
      });
    }
  }

  parseDuration(str) {
    if (!str || typeof str !== 'string') return 0;
    const parts = str.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  updateProgress(current, duration) {
    let dur = duration;
    if ((!dur || dur <= 0) && this.currentTrack?.duration) {
      dur = this.parseDuration(this.currentTrack.duration);
    }

    if (this.progressBar && dur > 0) {
      this.progressBar.max = dur;
      this.progressBar.value = current;
      const pct = Math.min(100, Math.max(0, (current / dur) * 100));
      this.progressBar.style.setProperty('--seek-pct', `${pct.toFixed(2)}%`);
    }
    if (this.currentTimeEl) {
      this.currentTimeEl.textContent = this.formatTime(current);
    }
    if (this.durationEl && dur > 0) {
      this.durationEl.textContent = this.formatTime(dur);
    }

    // Sync Studio Cinema progress bar & time displays
    if (this.cinemaProgressBar && dur > 0) {
      this.cinemaProgressBar.max = dur;
      this.cinemaProgressBar.value = current;
      const pct = Math.min(100, Math.max(0, (current / dur) * 100));
      this.cinemaProgressBar.style.setProperty('--seek-pct', `${pct.toFixed(2)}%`);
    }
    if (this.cinemaTimeCurrent) {
      this.cinemaTimeCurrent.textContent = this.formatTime(current);
    }
    if (this.cinemaTimeDuration && dur > 0) {
      this.cinemaTimeDuration.textContent = this.formatTime(dur);
    }

    // Dynamic Sing-Along lyrics line highlight & autoscroll
    this.updateActiveLyricsLine(current);
  }

  formatTime(secs) {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // ==========================================
  // PLAYLIST MANAGEMENT (Centralized Server DB with Google Account & Device Isolation)
  // ==========================================
  getPlaylistsStorageKey() {
    return 'aurasound_playlists_' + this.getUserKey();
  }

  loadPlaylists() {
    try {
      const scoped = JSON.parse(localStorage.getItem(this.getPlaylistsStorageKey()));
      if (Array.isArray(scoped) && scoped.length > 0) {
        return scoped.filter(p => p.title !== 'K-POP SONG' && p.title !== "J-POP SONG'S");
      }
      const general = JSON.parse(localStorage.getItem('aurasound_custom_playlists'));
      if (Array.isArray(general) && general.length > 0) {
        return general.filter(p => p.title !== 'K-POP SONG' && p.title !== "J-POP SONG'S");
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  savePlaylists() {
    try {
      localStorage.setItem(this.getPlaylistsStorageKey(), JSON.stringify(this.playlists));
    } catch (e) {}
  }

  async syncPlaylistsFromServer() {
    try {
      const userKey = this.getUserKey();
      const res = await fetch(`/api/playlists?userId=${encodeURIComponent(userKey)}`, {
        headers: {
          'x-user-email': this.currentUser?.email || '',
          'x-user-id': userKey,
          'x-device-id': userKey
        }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.playlists)) {
        const filtered = data.playlists.filter(p => p.title !== 'K-POP SONG' && p.title !== "J-POP SONG'S");
        this.playlists = filtered;
        this.savePlaylists();
        if (this.activeTab === 'playlists') {
          if (this.currentPlaylistDetail) {
            this.openPlaylistDetail(this.currentPlaylistDetail.id);
          } else {
            this.renderPlaylists();
          }
        }
      }
    } catch (err) {
      console.warn('Failed to sync playlists with server, using local cache:', err);
    }
  }

  async importPlaylist(url) {
    const btn = document.getElementById('btn-submit-import');
    const statusText = document.getElementById('import-status-text');
    if (btn) btn.disabled = true;
    const isSpotify = /spotify/i.test(url);
    if (statusText) statusText.textContent = isSpotify
      ? 'Menghubungkan ke Spotify dan mengambil daftar lagu...'
      : 'Menghubungkan ke YouTube Music dan mengambil daftar lagu...';

    try {
      const userKey = this.getUserKey();
      const res = await fetch('/api/playlist/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': this.currentUser?.email || '',
          'x-user-id': userKey,
          'x-device-id': userKey
        },
        body: JSON.stringify({
          url,
          userEmail: this.currentUser?.email || '',
          userId: userKey,
          deviceId: userKey
        })
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Gagal mengimpor playlist');
      }

      const importedPl = data.playlist;

      // Update in memory & cache
      this.playlists = this.playlists.filter(p => p.id !== importedPl.id);
      this.playlists.unshift(importedPl);
      this.savePlaylists();
      this.showToast(`Berhasil mengimpor "${importedPl.title}" (${importedPl.tracks.length} lagu)!`, 'success');

      // Invalidate home sections cache so Home immediately renders the new Vinyl Shelf & Supermix
      this.cachedSections = null;

      // Close modal & render
      document.getElementById('modal-import-playlist').classList.remove('active');
      document.getElementById('input-playlist-url').value = '';
      this.switchTab('playlists');
      this.openPlaylistDetail(importedPl.id);
    } catch (err) {
      alert(err.message);
    } finally {
      if (btn) btn.disabled = false;
      if (statusText) statusText.textContent = '';
    }
  }

  async createCustomPlaylist(name) {
    try {
      const userKey = this.getUserKey();
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': this.currentUser?.email || '',
          'x-user-id': userKey,
          'x-device-id': userKey
        },
        body: JSON.stringify({
          title: name,
          userEmail: this.currentUser?.email || '',
          userId: userKey,
          deviceId: userKey
        })
      });
      const data = await res.json();

      if (data.success && data.playlist) {
        this.playlists.unshift(data.playlist);
        this.savePlaylists();
        const isEn = this.userProfile?.lang === 'en';
        this.showToast(isEn ? `Playlist "${name}" created successfully! 📁` : `Playlist "${name}" berhasil dibuat! 📁`, 'success');

        document.getElementById('modal-create-playlist').classList.remove('active');
        document.getElementById('input-playlist-name').value = '';
        this.renderPlaylists();
      }
    } catch (err) {
      const isEn = this.userProfile?.lang === 'en';
      alert(isEn ? 'Failed to create playlist' : 'Gagal membuat playlist');
    }
  }

  async deletePlaylist(playlistId) {
    const isEn = this.userProfile?.lang === 'en';
    if (!confirm(isEn ? 'Are you sure you want to delete this playlist?' : 'Apakah Anda yakin ingin menghapus playlist ini?')) return;
    try {
      await fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
      this.playlists = this.playlists.filter(p => p.id !== playlistId);
      this.savePlaylists();
      this.showToast(isEn ? 'Playlist deleted successfully' : 'Playlist berhasil dihapus', 'info');
      this.closePlaylistDetail();
      this.renderPlaylists();
    } catch (err) {
      console.error(err);
    }
  }

  async removeTrackFromPlaylist(playlistId, trackId) {
    const isEn = this.userProfile?.lang === 'en';
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success && data.playlist) {
        const idx = this.playlists.findIndex(p => p.id === playlistId);
        if (idx !== -1) this.playlists[idx] = data.playlist;
        this.savePlaylists();
        this.showToast(isEn ? 'Track removed from playlist' : 'Lagu dihapus dari playlist', 'info');
        this.openPlaylistDetail(playlistId);
      }
    } catch (err) {
      console.error(err);
    }
  }

  renderPlaylists() {
    const isEn = this.userProfile?.lang === 'en';
    const container = document.getElementById('custom-playlists-container');
    const detailContainer = document.getElementById('playlist-detail-view');
    if (detailContainer) detailContainer.style.display = 'none';
    if (container) container.style.display = 'grid';

    if (!container) return;

    if (this.playlists.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">📂</div>
          <h3>${isEn ? 'No playlists in your account yet' : 'Belum ada playlist akun Anda'}</h3>
          <p>${isEn ? 'Import playlists from your YouTube Music account or create a new custom playlist with the buttons above.' : 'Impor playlist dari akun YouTube Music Anda atau buat playlist kustom baru dengan tombol di atas.'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.playlists.map(pl => {
      const count = pl.trackCount !== undefined ? pl.trackCount : (pl.tracks?.length || 0);
      const sourceName = pl.isImported
        ? (isEn ? 'YouTube Music Account' : 'Akun YouTube Music')
        : (isEn ? 'Custom Playlist' : 'Playlist Kustom');
      return `
        <div class="music-card" onclick="window.app.openPlaylistDetail('${pl.id}')">
          <div class="card-thumb-wrapper">
            <img src="${pl.thumbnail || '/icons/icon.svg'}" alt="${pl.title}" class="card-thumb" loading="lazy" onerror="this.src='/icons/icon.svg'">
            <div class="card-play-btn" onclick="event.stopPropagation(); window.app.playPlaylist('${pl.id}')" title="${isEn ? 'Play Playlist' : 'Putar Playlist'}">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <span class="card-duration">${count} ${isEn ? 'Songs' : 'Lagu'}</span>
          </div>
          <div class="card-title">${pl.title}</div>
          <div class="card-artist">${sourceName} • ${pl.createdAt}</div>
        </div>
      `;
    }).join('');
  }

  async openPlaylistDetail(playlistId) {
    let pl = this.playlists.find(p => p.id === playlistId);
    if (!pl) return;

    const isEn = this.userProfile?.lang === 'en';
    const gridContainer = document.getElementById('custom-playlists-container');
    const detailContainer = document.getElementById('playlist-detail-view');

    if (gridContainer) gridContainer.style.display = 'none';
    if (detailContainer) {
      detailContainer.style.display = 'block';
      detailContainer.innerHTML = `
        <div class="playlist-detail-header">
          <button class="btn-sidebar-action" onclick="window.app.closePlaylistDetail()" style="width: fit-content; margin-bottom: 16px;">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            ${isEn ? 'Back to Playlists' : 'Kembali ke Daftar Playlist'}
          </button>
          <div class="playlist-banner">
            <img src="${pl.thumbnail || '/icons/icon.svg'}" alt="${pl.title}" class="playlist-banner-thumb" loading="lazy" onerror="this.src='/icons/icon.svg'">
            <div class="playlist-banner-info">
              <span class="badge ${pl.isImported ? 'badge-yt' : 'badge-suno'}">${pl.isImported ? 'YOUTUBE MUSIC' : (isEn ? 'CUSTOM PLAYLIST' : 'PLAYLIST KUSTOM')}</span>
              <h2 class="playlist-banner-title">${pl.title}</h2>
              <p class="playlist-banner-meta">${pl.trackCount || pl.tracks?.length || 0} ${isEn ? 'songs' : 'lagu'} • ${isEn ? 'Created' : 'Dibuat'}: ${pl.createdAt}</p>
              <div class="playlist-action-btns">
                <button class="btn-generate-ai" onclick="window.app.playPlaylist('${pl.id}', false)" style="width: auto; padding: 10px 22px;">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  ${isEn ? 'Play All' : 'Putar Semua'}
                </button>
                <button class="btn-sidebar-action" onclick="window.app.playPlaylist('${pl.id}', true)">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                  ${isEn ? 'Shuffle' : 'Acak (Shuffle)'}
                </button>
                <button class="btn-sidebar-action" onclick="window.app.deletePlaylist('${pl.id}')" style="color: #f87171; border-color: rgba(239, 68, 68, 0.3);">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  ${isEn ? 'Delete Playlist' : 'Hapus Playlist'}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div id="playlist-tracks-list" class="track-list" style="margin-top: 24px;">
          ${this.renderLoadingState(isEn ? 'Loading tracklist...' : 'Memuat daftar lagu...', true, 4)}
        </div>
        <div id="playlist-pagination-box"></div>
      `;
    }

    // Fetch full playlist with tracks if not already loaded
    if (!pl.tracks || pl.tracks.length === 0) {
      try {
        const res = await fetch(`/api/playlists/${playlistId}`);
        const data = await res.json();
        if (data.success && data.playlist) {
          pl = data.playlist;
          const idx = this.playlists.findIndex(p => p.id === playlistId);
          if (idx !== -1) this.playlists[idx] = pl;
        }
      } catch (err) {
        console.warn(err);
      }
    }

    this.currentPlaylistDetail = pl;
    this.playlistCurrentPage = 1;
    this.renderPaginatedPlaylistTracks(1);
  }

  renderPaginatedPlaylistTracks(page = 1) {
    if (!this.currentPlaylistDetail) return;
    const isEn = this.userProfile?.lang === 'en';
    const pl = this.currentPlaylistDetail;
    const tracks = pl.tracks || [];
    const listContainer = document.getElementById('playlist-tracks-list');
    const paginationContainer = document.getElementById('playlist-pagination-box');

    if (!listContainer) return;

    if (tracks.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎵</div>
          <h3>${isEn ? 'This playlist is empty' : 'Playlist ini masih kosong'}</h3>
          <p>${isEn ? 'Search songs on Home or Search tab, then click "+" to add songs here.' : 'Cari lagu di tab Beranda atau Pencarian, lalu klik tombol "+" untuk memasukkan lagu ke sini.'}</p>
        </div>
      `;
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const pageSize = this.playlistPageSize || 10;
    const totalPages = Math.ceil(tracks.length / pageSize);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    this.playlistCurrentPage = currentPage;

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, tracks.length);
    const pageTracks = tracks.slice(startIndex, endIndex);

    const listKey = 'pl-' + pl.id;
    this.registerTrackList(listKey, tracks);

    listContainer.innerHTML = pageTracks.map((track, idx) => {
      const realIndex = startIndex + idx;
      const isCurrent = this.currentTrack && this.currentTrack.id === track.id;
      return `
        <div class="track-row ${isCurrent ? 'active' : ''}" data-track-id="${track.id}" onclick="window.app.playFromRegistry('${listKey}', ${realIndex})">
          <span class="track-number">${isCurrent ? '▶' : realIndex + 1}</span>
          <img src="${track.thumbnail}" alt="${track.title}" class="track-row-thumb" loading="lazy" onerror="this.src='/icons/icon.svg'">
          <div class="track-row-details">
            <div class="track-row-title">${track.title}</div>
            <div class="track-row-artist">${track.artist}</div>
          </div>
          <span class="track-row-duration">${track.duration}</span>
          <div class="track-row-actions" onclick="event.stopPropagation()">
            <button class="icon-btn row-fav-btn" onclick="window.app.toggleFavoriteFromRegistry('${listKey}', ${realIndex})" title="${isEn ? 'Like' : 'Suka'}">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="${this.isFavorited(track.id) ? '#10b981' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <button class="icon-btn" onclick="window.app.promptAddToPlaylistFromRegistry('${listKey}', ${realIndex})" title="${isEn ? 'Add to Playlist' : 'Tambah ke Playlist'}">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            </button>
            <button class="icon-btn" onclick="window.app.removeTrackFromPlaylist('${pl.id}', '${track.id}')" title="${isEn ? 'Remove from Playlist' : 'Hapus dari Playlist'}" style="color: #f87171;">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Pagination controls
    if (paginationContainer) {
      if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
      }

      let pageButtonsHtml = `
        <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window.app.goToPlaylistPage(${currentPage - 1})">
          ${isEn ? '‹ Prev' : '‹ Sebelumnya'}
        </button>
      `;

      const pagesToShow = [];
      if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pagesToShow.push(i);
      } else {
        pagesToShow.push(1);
        if (currentPage > 3) pagesToShow.push('...');
        
        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) pagesToShow.push(i);
        
        if (currentPage < totalPages - 2) pagesToShow.push('...');
        pagesToShow.push(totalPages);
      }

      pagesToShow.forEach(p => {
        if (p === '...') {
          pageButtonsHtml += `<span class="pagination-ellipsis">...</span>`;
        } else {
          pageButtonsHtml += `
            <button class="pagination-btn ${p === currentPage ? 'active' : ''}" onclick="window.app.goToPlaylistPage(${p})">
              ${p}
            </button>
          `;
        }
      });

      pageButtonsHtml += `
        <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window.app.goToPlaylistPage(${currentPage + 1})">
          ${isEn ? 'Next ›' : 'Berikutnya ›'}
        </button>
      `;

      paginationContainer.innerHTML = `
        <div class="pagination-wrapper">
          <div class="pagination-info">
            ${isEn
              ? `Showing <strong>${startIndex + 1} - ${endIndex}</strong> of <strong>${tracks.length}</strong> songs (Page ${currentPage} / ${totalPages})`
              : `Menampilkan <strong>${startIndex + 1} - ${endIndex}</strong> dari <strong>${tracks.length}</strong> lagu (Halaman ${currentPage} / ${totalPages})`}
          </div>
          <div class="pagination-controls">
            ${pageButtonsHtml}
            ${totalPages > 5 ? `
              <div class="pagination-jump">
                <span>${isEn ? 'Go to:' : 'Ke hal:'}</span>
                <select class="pagination-select" onchange="window.app.goToPlaylistPage(parseInt(this.value))">
                  ${Array.from({ length: totalPages }, (_, i) => i + 1).map(p => `
                    <option value="${p}" ${p === currentPage ? 'selected' : ''}>${p}</option>
                  `).join('')}
                </select>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }
  }

  goToPlaylistPage(page) {
    this.renderPaginatedPlaylistTracks(page);
    const el = document.getElementById('playlist-tracks-list');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  closePlaylistDetail() {
    this.currentPlaylistDetail = null;
    const gridContainer = document.getElementById('custom-playlists-container');
    const detailContainer = document.getElementById('playlist-detail-view');
    if (detailContainer) detailContainer.style.display = 'none';
    if (gridContainer) gridContainer.style.display = 'grid';
  }

  playPlaylist(playlistId, shuffle = false) {
    const isEn = this.userProfile?.lang === 'en';
    const pl = this.playlists.find(p => p.id === playlistId);
    if (!pl || pl.tracks.length === 0) {
      this.showToast(isEn ? 'Playlist is empty!' : 'Playlist kosong!', 'warning');
      return;
    }

    let tracks = [...pl.tracks];
    if (shuffle) {
      tracks = tracks.sort(() => Math.random() - 0.5);
    }

    this.playTrackList(tracks, 0);
    this.showToast(isEn ? `Playing playlist: "${pl.title}"` : `Memutar playlist: "${pl.title}"`, 'success');
  }

  promptAddToPlaylist(track) {
    this.trackToAddToPlaylist = track;
    const isEn = this.userProfile?.lang === 'en';
    const modal = document.getElementById('modal-add-to-playlist');
    const listEl = document.getElementById('modal-playlist-options');

    if (!modal || !listEl) return;

    if (this.playlists.length === 0) {
      listEl.innerHTML = `
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 14px;">${isEn ? 'You do not have any playlists yet. Create one first!' : 'Anda belum memiliki playlist. Buat terlebih dahulu!'}</p>
        <button class="btn-generate-ai" onclick="document.getElementById('modal-add-to-playlist').classList.remove('active'); document.getElementById('modal-create-playlist').classList.add('active')">
          ${isEn ? '+ Create New Playlist' : '+ Buat Playlist Baru'}
        </button>
      `;
    } else {
      listEl.innerHTML = this.playlists.map(pl => `
        <div class="playlist-select-item" onclick="window.app.confirmAddTrackToPlaylist('${pl.id}')">
          <div style="font-weight: 700; color: #fff;">${pl.title}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${pl.tracks.length} ${isEn ? 'songs' : 'lagu'}</div>
        </div>
      `).join('');
    }

    modal.classList.add('active');
  }

  async confirmAddTrackToPlaylist(playlistId) {
    if (!this.trackToAddToPlaylist) return;
    const isEn = this.userProfile?.lang === 'en';
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track: this.trackToAddToPlaylist })
      });
      const data = await res.json();
      if (data.success && data.playlist) {
        const idx = this.playlists.findIndex(p => p.id === playlistId);
        if (idx !== -1) this.playlists[idx] = data.playlist;
        this.savePlaylists();
        this.showToast(isEn ? `Added to "${data.playlist.title}"! 🎵` : `Ditambahkan ke "${data.playlist.title}"! 🎵`, 'success');
      }
    } catch (err) {
      console.error(err);
    }
    document.getElementById('modal-add-to-playlist').classList.remove('active');
    this.trackToAddToPlaylist = null;
  }

  // Favorites management
  getFavsStorageKey() {
    return 'aurasound_favs_' + this.getUserKey();
  }

  loadFavorites() {
    try {
      const scoped = JSON.parse(localStorage.getItem(this.getFavsStorageKey()));
      if (Array.isArray(scoped) && scoped.length > 0) return scoped;
      const general = JSON.parse(localStorage.getItem('aurasound_favs'));
      if (Array.isArray(general) && general.length > 0) return general;
      if (this.currentUser && Array.isArray(this.currentUser.favorites) && this.currentUser.favorites.length > 0) {
        return this.currentUser.favorites;
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  isFavorited(trackId) {
    return this.favorites.some(f => f.id === trackId);
  }

  toggleFavorite(track, event = null) {
    const isEn = this.userProfile?.lang === 'en';
    const isNowFav = !this.isFavorited(track.id);
    if (!isNowFav) {
      this.favorites = this.favorites.filter(f => f.id !== track.id);
      this.showToast(isEn ? 'Removed from Liked Songs' : 'Dihapus dari Favorit', 'info');
      if (window.tasteEngine) window.tasteEngine.recordLike(track, false);
    } else {
      this.favorites.unshift(track);
      this.showToast(isEn ? 'Added to Liked Songs ❤️' : 'Ditambahkan ke Favorit ❤️', 'success');
      if (window.tasteEngine) window.tasteEngine.recordLike(track, true);

      // Trigger vibrant Heart Particle Burst explosion
      let burstX = window.innerWidth / 2;
      let burstY = window.innerHeight / 2;
      if (event && event.clientX) {
        burstX = event.clientX;
        burstY = event.clientY;
      } else {
        const favBtn = document.getElementById('player-fav-btn');
        if (favBtn) {
          const rect = favBtn.getBoundingClientRect();
          burstX = rect.left + rect.width / 2;
          burstY = rect.top + rect.height / 2;
        }
      }
      this.spawnHeartBurst(burstX, burstY);
    }
    localStorage.setItem(this.getFavsStorageKey(), JSON.stringify(this.favorites));
    this.updateFavButtonState();

    // Persist to Server Database
    try {
      const userKey = this.getUserKey();
      fetch('/api/user/favorites/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': this.currentUser?.email || '',
          'x-user-id': userKey,
          'x-device-id': userKey
        },
        body: JSON.stringify({ track, userKey })
      }).catch(err => console.warn('Sync favorite to DB warning:', err));
    } catch (e) {}

    // Dynamically sync all favorite heart buttons in active lists with pop animation
    document.querySelectorAll(`[data-fav-track-id="${track.id}"]`).forEach(btn => {
      btn.classList.toggle('active', isNowFav);
      btn.classList.add('heart-pop-anim');
      setTimeout(() => btn.classList.remove('heart-pop-anim'), 600);
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', isNowFav ? '#10b981' : 'none');
        svg.setAttribute('stroke', isNowFav ? '#10b981' : 'currentColor');
      }
    });

    // Also sync cinema favorite button if currently shown
    if (this.cinemaBtnFav && this.currentTrack?.id === track.id) {
      this.cinemaBtnFav.classList.toggle('active', isNowFav);
      const cSvg = this.cinemaBtnFav.querySelector('svg');
      if (cSvg) {
        cSvg.setAttribute('fill', isNowFav ? '#10b981' : 'none');
        cSvg.setAttribute('stroke', isNowFav ? '#10b981' : 'currentColor');
      }
    }

    // Dynamically synchronize all favorite badges, counts, and views across the app
    this.syncFavoritesCountAndViews();
  }

  updateFavButtonState() {
    const favBtn = document.getElementById('player-fav-btn');
    if (!favBtn || !this.currentTrack) return;
    const isFav = this.isFavorited(this.currentTrack.id);
    favBtn.classList.toggle('active', isFav);
    const svg = favBtn.querySelector('svg');
    if (svg) {
      svg.setAttribute('fill', isFav ? '#10b981' : 'none');
      svg.setAttribute('stroke', isFav ? '#10b981' : 'currentColor');
    }

    // Sync cinema fav button
    if (this.cinemaBtnFav) {
      this.cinemaBtnFav.classList.toggle('active', isFav);
      const cSvg = this.cinemaBtnFav.querySelector('svg');
      if (cSvg) {
        cSvg.setAttribute('fill', isFav ? '#10b981' : 'none');
        cSvg.setAttribute('stroke', isFav ? '#10b981' : 'currentColor');
      }
    }
  }

  renderFavorites() {
    const isEn = this.userProfile?.lang === 'en';
    const container = document.getElementById('favorites-list');
    if (!container) return;

    if (this.favorites.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">❤️</div>
          <h3>${isEn ? 'No liked songs yet' : 'Belum ada lagu favorit'}</h3>
          <p>${isEn ? 'Click the heart button on songs you like to collect them here.' : 'Klik tombol hati pada lagu yang Anda sukai untuk mengumpulkannya di sini.'}</p>
        </div>
      `;
      return;
    }

    this.renderTrackList(this.favorites, container, { listKey: 'favorites' });
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

      navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
    }
  }

  showToast(message, type = 'info') {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `toast-visible toast-${type}`;
    setTimeout(() => {
      toast.className = '';
    }, 3200);
  }

  checkPWAInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      window.deferredPrompt = e;
      const installBtn = document.getElementById('btn-pwa-install');
      if (installBtn) {
        installBtn.style.display = 'inline-flex';
        installBtn.addEventListener('click', () => {
          if (window.deferredPrompt) {
            window.deferredPrompt.prompt();
            window.deferredPrompt = null;
            installBtn.style.display = 'none';
          }
        });
      }
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.log('SW registration error:', err);
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
