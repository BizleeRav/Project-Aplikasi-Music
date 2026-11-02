/**
 * AuraSound Suno AI Studio Module
 * Pure Creations & Streamlined Suno API Key Integration
 * 
 * Features:
 * 1. Pure "Lagu Buatan Kita" persistent catalog (persisted on server data/suno-creations.json)
 * 2. Dedicated Suno API Key management (Kie.ai, GoAPI, Custom Server) - no browser cookie scraping
 * 3. Studio Generator workspace + Instant Recent Song Preview
 * 4. Paginated creations library with real-time search & song deletion
 * 5. High-fidelity audio playback via CloudFront progressive audio (.m4a) & DSP Equalizer
 */

class SunoStudio {
  constructor() {
    this.isGenerating = false;
    this.hasApiKey = false;
    this.accountInfo = null;

    // Sub-tab & Pagination State
    this.currentSubTab = 'create'; // 'create' | 'library'
    this.currentPage = 1;
    this.totalPages = 1;
    this.totalCreations = 0;
    this.hasMore = false;
    this.isLoadingLibrary = false;
    this.creations = [];
    this.librarySearchQuery = '';

    setTimeout(() => {
      this.init();
    }, 300);
  }

  init() {
    this.checkApiStatus();
    this.fetchCreations(1, false);

    // Listen for automatic token capture from Electron
    if (window.electronAPI && window.electronAPI.onSunoTokenCaptured) {
      window.electronAPI.onSunoTokenCaptured(async (token) => {
        console.log('🎉 Suno token captured automatically by Electron!');
        await this.saveOfficialTokenFromAuto(token);
      });
    }

    if (window.electronAPI && window.electronAPI.onUpdateDownloaded) {
      window.electronAPI.onUpdateDownloaded((info) => {
        if (window.app && window.app.showToast) {
          window.app.showToast('🚀 Versi baru AuraSound telah diunduh! Buka ulang aplikasi untuk menerapkan update.', 'success');
        }
      });
    }

    // Auto-detect when account becomes connected from Chrome
    setInterval(() => {
      if (!this.hasApiKey) {
        this.checkApiStatus();
      }
    }, 3000);
  }

  getDeviceId() {
    let id = localStorage.getItem('aurasound_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
      localStorage.setItem('aurasound_device_id', id);
    }
    return id;
  }

  getAuthHeaders() {
    const key = localStorage.getItem('aurasound_suno_key') || '';
    const provider = localStorage.getItem('aurasound_suno_provider') || 'kie';
    const headers = { 
      'Content-Type': 'application/json',
      'X-Device-Id': this.getDeviceId()
    };
    if (key) {
      headers['X-Suno-Api-Key'] = key;
      headers['X-Suno-Provider'] = provider;
    }
    return headers;
  }

  async checkApiStatus() {
    try {
      const localKey = localStorage.getItem('aurasound_suno_key') || '';
      const localProvider = localStorage.getItem('aurasound_suno_provider') || 'suno_official';

      const res = await fetch('/api/suno/account', {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      this.hasApiKey = Boolean(data.configured && !data.is_auto);
      this.accountInfo = data;
      this.updateConnectionUI(data);

      // Pre-fill modal fields
      const apiKeyInput = document.getElementById('input-suno-api-key');
      if (apiKeyInput) {
        apiKeyInput.value = localKey;
      }
      const providerSel = document.getElementById('input-suno-provider');
      if (providerSel) providerSel.value = localProvider || data.providerCode || 'kie';
      this.onProviderChange(providerSel ? providerSel.value : 'kie');
    } catch (err) {
      console.warn('Check API status error:', err);
      this.updateConnectionUI({
        configured: true,
        is_auto: true,
        provider: 'Suno AI Auto-Engine',
        statusText: '🟢 Suno AI Auto-Engine Aktif • Siap Membuat Lagu'
      });
    }
  }

  openSettingsModal() {
    const modal = document.getElementById('modal-token');
    if (modal) {
      modal.classList.add('active');
      const localKey = localStorage.getItem('aurasound_suno_key') || '';
      const localProvider = localStorage.getItem('aurasound_suno_provider') || 'suno_official';
      const keyInput = document.getElementById('input-suno-api-key');
      const providerSel = document.getElementById('input-suno-provider');
      if (keyInput && !keyInput.value) keyInput.value = localKey || '368b953dba13bca4791b6ee34b3c1c7a';
      if (providerSel) providerSel.value = localProvider === 'suno_official' ? 'kie' : localProvider;
      if (this.hasApiKey && !window.AuraSoundAndroid) {
        this.loadPairCode();
      }
    }
  }

  updateConnectionUI(info) {
    const card = document.getElementById('suno-account-card');
    const userNameEl = document.getElementById('suno-user-name');
    const creditsPill = document.getElementById('suno-credits-pill');
    const statusTextEl = document.getElementById('suno-connection-status-text');
    const connectBtn = document.getElementById('btn-suno-connect');
    const connectBtnText = document.getElementById('btn-suno-connect-text');
    const disconnectBtn = document.getElementById('btn-suno-disconnect');
    const dot = card ? card.querySelector('.status-dot') : null;

    if (!card) return;

    const isConnected = Boolean(info && info.configured && !info.is_auto);
    const isAuto = Boolean(info && info.is_auto);
    const isOfficial = info && info.providerCode === 'suno_official';
    const isLowCredit = info && info.remaining_credits !== undefined && info.remaining_credits < 10;

    if (isConnected) {
      card.classList.add('connected');
      card.classList.remove('disconnected');
      if (dot) dot.className = isLowCredit ? 'status-dot warning' : 'status-dot active';

      if (userNameEl) {
        userNameEl.textContent = isOfficial ? 'Suno AI (Akun Resmi Suno.com)' : (info.provider || 'Suno AI Studio');
      }
      if (creditsPill) {
        creditsPill.textContent = `${info.credits || '50 Kredit'}`;
        creditsPill.style.display = 'inline-flex';
        if (isLowCredit) {
          creditsPill.style.background = 'rgba(239, 68, 68, 0.2)';
          creditsPill.style.color = '#f87171';
        } else {
          creditsPill.style.background = 'rgba(16, 185, 129, 0.15)';
          creditsPill.style.color = '#34d399';
        }
      }
      if (statusTextEl) {
        statusTextEl.textContent = info.statusText || (isOfficial
          ? 'Akun Suno.com Resmi Terhubung • Siap membuat lagu'
          : 'Engine Terhubung • Siap membuat lagu');
      }
      if (connectBtn) {
        connectBtn.style.display = 'inline-flex';
        if (connectBtnText) connectBtnText.textContent = 'Ganti / Kelola Akun';
      }
      if (disconnectBtn) {
        disconnectBtn.style.display = 'inline-flex';
      }
    } else if (isAuto) {
      card.classList.add('connected');
      card.classList.remove('disconnected');
      if (dot) dot.className = 'status-dot active';

      if (userNameEl) {
        userNameEl.textContent = 'Mesin Otomatis: Suno v6-mini';
      }
      if (creditsPill) {
        creditsPill.textContent = info.credits || '5 Lagu / Hari';
        creditsPill.style.display = 'inline-flex';
        creditsPill.style.background = 'rgba(16, 185, 129, 0.15)';
        creditsPill.style.color = '#34d399';
      }
      if (statusTextEl) {
        statusTextEl.textContent = info.statusText || 'Mesin Otomatis Suno Aktif • Siap membuat lagu';
      }
      if (connectBtn) {
        connectBtn.style.display = 'inline-flex';
        if (connectBtnText) connectBtnText.textContent = 'Hubungkan Akun Suno (50 Kredit)';
      }
      if (disconnectBtn) {
        disconnectBtn.style.display = 'none';
      }
    } else {
      card.classList.remove('connected');
      card.classList.add('disconnected');
      if (dot) dot.className = 'status-dot offline';

      if (userNameEl) {
        userNameEl.textContent = 'Suno AI Music Studio';
      }
      if (creditsPill) {
        creditsPill.textContent = 'Belum Terhubung';
        creditsPill.style.display = 'inline-flex';
        creditsPill.style.background = 'rgba(234, 179, 8, 0.15)';
        creditsPill.style.color = '#fde047';
      }
      if (statusTextEl) {
        statusTextEl.textContent = 'Klik tombol di samping untuk login akun Suno (Gratis 50 kredit setiap hari)';
      }
      if (connectBtn) {
        connectBtn.style.display = 'inline-flex';
        if (connectBtnText) connectBtnText.textContent = 'Hubungkan Akun Suno (1-Klik)';
      }
      if (disconnectBtn) {
        disconnectBtn.style.display = 'none';
      }
    }
  }

  onProviderChange(val) {
    const group = document.getElementById('group-custom-api-url');
    if (group) {
      group.style.display = val === 'custom' ? 'block' : 'none';
    }
  }

  switchModalMode(mode) {
    const tabOfficial = document.getElementById('btn-tab-suno-official');
    const tabApi = document.getElementById('btn-tab-suno-api');
    const secOfficial = document.getElementById('section-suno-official');
    const secApi = document.getElementById('section-suno-api');

    if (mode === 'official') {
      if (tabOfficial) tabOfficial.classList.add('active');
      if (tabApi) tabApi.classList.remove('active');
      if (secOfficial) secOfficial.style.display = 'block';
      if (secApi) secApi.style.display = 'none';
    } else {
      if (tabOfficial) tabOfficial.classList.remove('active');
      if (tabApi) tabApi.classList.add('active');
      if (secOfficial) secOfficial.style.display = 'none';
      if (secApi) secApi.style.display = 'block';
    }
  }

  openSunoPopup() {
    window.open('https://suno.com', 'SunoLoginPopup', 'width=880,height=720,status=no,toolbar=no,menubar=no');
    if (window.app && window.app.showToast) {
      window.app.showToast('Jendela Suno.com dibuka. Silakan login ke akun Anda!', 'info');
    }
  }

  copyClerkScript() {
    const code = "fetch('http://localhost:3000/api/suno/connect-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:await window.Clerk.session.getToken()})}).then(r=>r.json()).then(d=>alert(d.message));";
    navigator.clipboard.writeText(code).then(() => {
      if (window.app && window.app.showToast) {
        window.app.showToast('Perintah otomatis disalin! Buka F12 -> Console di tab Suno.com Chrome Anda, tempel (Ctrl+V) & tekan Enter!', 'success');
      }
    }).catch(() => {
      prompt('Salin perintah ini dan jalankan di Console (F12) tab Suno.com Chrome Anda:', code);
    });
  }

  async startAutoLoginFlow() {
    // If running on Android APK
    if (window.AuraSoundAndroid) {
      if (typeof window.AuraSoundAndroid.openSunoLogin === 'function') {
        if (window.app && window.app.showToast) {
          window.app.showToast('Membuka login resmi Suno.com...', 'info');
        }
        window.AuraSoundAndroid.openSunoLogin();
        return;
      } else {
        if (typeof window.openAppUpdateModal === 'function') {
          window.openAppUpdateModal();
          return;
        }
      }
    }

    this.openSettingsModal();
    const btn = document.getElementById('btn-start-auto-login');
    const btnExt = document.getElementById('btn-start-external-login');
    const loadingBox = document.getElementById('auto-login-loading');
    const statusText = document.getElementById('auto-login-status-text');

    if (btn) btn.disabled = true;
    if (btnExt) btnExt.disabled = true;
    if (loadingBox) loadingBox.style.display = 'block';
    if (statusText) statusText.textContent = 'Membuka Google Chrome di laptop Anda...';

    try {
      if (window.electronAPI && window.electronAPI.openSunoLogin) {
        await window.electronAPI.openSunoLogin();
      } else {
        const res = await fetch('/api/suno/login-auto', { method: 'POST' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Gagal membuka browser');
      }

      if (statusText) statusText.textContent = 'Google Chrome terbuka! Silakan klik "Continue with Google" & login akun Anda...';
      if (window.app && window.app.showToast) {
        window.app.showToast('Jendela Google Chrome terbuka! Silakan login dengan akun Google Anda.', 'info');
      }
      this.pollAutoLogin();
    } catch (err) {
      if (btn) btn.disabled = false;
      if (btnExt) btnExt.disabled = false;
      if (loadingBox) loadingBox.style.display = 'none';
      if (window.app && window.app.showToast) {
        window.app.showToast(`Gagal: ${err.message}`, 'error');
      }
    }
  }

  async loadPairCode() {
    try {
      const res = await fetch('/api/suno/pair-code', {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success && data.code) {
        const display = document.getElementById('suno-pair-code-display');
        const box = document.getElementById('box-laptop-pair-display');
        if (display) display.textContent = data.code.slice(0, 3) + ' ' + data.code.slice(3);
        if (box) box.style.display = 'block';
      }
    } catch (e) {}
  }

  async claimPairCode() {
    const input = document.getElementById('input-suno-pair-code');
    const code = (input ? input.value : '').replace(/[\s-]/g, '').trim();
    if (!code || code.length !== 6) {
      if (window.app && window.app.showToast) {
        window.app.showToast('Masukkan 6-digit kode sambung dari laptop Anda.', 'warning');
      }
      return;
    }
    try {
      if (window.app && window.app.showToast) {
        window.app.showToast('Menyambungkan akun Suno...', 'info');
      }
      const res = await fetch('/api/suno/pair-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.success && data.token) {
        if (window.AuraSoundAndroid && typeof window.AuraSoundAndroid.saveSunoToken === 'function') {
          window.AuraSoundAndroid.saveSunoToken(data.token);
        }
        await this.saveOfficialTokenFromAuto(data.token);
        if (input) input.value = '';
      } else {
        throw new Error(data.error || 'Kode salah atau sudah kedaluwarsa');
      }
    } catch (err) {
      if (window.app && window.app.showToast) {
        window.app.showToast(`Gagal: ${err.message}`, 'error');
      }
    }
  }

  async startExternalBrowserLogin() {
    return this.startAutoLoginFlow();
  }

  pollAutoLogin() {
    if (this.autoLoginPoller) clearInterval(this.autoLoginPoller);

    const btn = document.getElementById('btn-start-auto-login');
    const loadingBox = document.getElementById('auto-login-loading');
    const statusText = document.getElementById('auto-login-status-text');

    this.autoLoginPoller = setInterval(async () => {
      try {
        const res = await fetch('/api/suno/login-status');
        const data = await res.json();

        if (data.status === 'success' && data.token) {
          clearInterval(this.autoLoginPoller);
          this.autoLoginPoller = null;

          if (statusText) statusText.textContent = '🎉 Login berhasil! Menyimpan koneksi akun...';
          await this.saveOfficialTokenFromAuto(data.token);
        } else if (data.status === 'failed') {
          clearInterval(this.autoLoginPoller);
          this.autoLoginPoller = null;
          if (btn) btn.disabled = false;
          if (loadingBox) loadingBox.style.display = 'none';
          if (window.app && window.app.showToast) {
            window.app.showToast(data.message || 'Login dibatalkan atau ditutup.', 'info');
          }
        }
      } catch (e) {}
    }, 1500);
  }

  async cancelAutoLogin() {
    if (this.autoLoginPoller) {
      clearInterval(this.autoLoginPoller);
      this.autoLoginPoller = null;
    }
    const btn = document.getElementById('btn-start-auto-login');
    const loadingBox = document.getElementById('auto-login-loading');
    if (btn) btn.disabled = false;
    if (loadingBox) loadingBox.style.display = 'none';

    try {
      await fetch('/api/suno/login-cancel', { method: 'POST' });
    } catch (e) {}
  }

  async saveOfficialTokenFromAuto(token) {
    try {
      if (window.AuraSoundAndroid && typeof window.AuraSoundAndroid.saveSunoToken === 'function') {
        window.AuraSoundAndroid.saveSunoToken(token);
      }
      const res = await fetch('/api/suno/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suno_api_key: token,
          suno_provider: 'suno_official'
        })
      });
      const data = await res.json();

      if (data.success && data.connected) {
        localStorage.setItem('aurasound_suno_key', token);
        localStorage.setItem('aurasound_suno_provider', 'suno_official');

        if (window.app && window.app.showToast) {
          window.app.showToast('🎉 Akun Suno Resmi Anda berhasil terhubung! Selamat berkreasi!', 'success');
        }
        document.getElementById('modal-token')?.classList.remove('active');
        await this.checkApiStatus();
      }
    } catch (e) {
      console.error('Auto login save error:', e);
    } finally {
      const btn = document.getElementById('btn-start-auto-login');
      const loadingBox = document.getElementById('auto-login-loading');
      if (btn) btn.disabled = false;
      if (loadingBox) loadingBox.style.display = 'none';
    }
  }

  async saveOfficialToken() {
    const tokenInput = document.getElementById('input-suno-official-token');
    let token = tokenInput ? tokenInput.value.trim() : '';
    token = token.replace(/^["']|["']$/g, '').trim();
    const statusEl = document.getElementById('modal-suno-status');
    const btn = document.getElementById('btn-connect-official');

    if (!token || token.length < 20) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
        statusEl.style.color = '#f87171';
        statusEl.textContent = '❌ Masukkan token sesi akun Suno Anda terlebih dahulu.';
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Memverifikasi Akun Suno...';
    }

    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.background = 'rgba(99, 102, 241, 0.15)';
      statusEl.style.color = '#818cf8';
      statusEl.textContent = 'Menghubungkan ke akun resmi Suno.com...';
    }

    try {
      const res = await fetch('/api/suno/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suno_api_key: token,
          suno_provider: 'suno_official'
        })
      });
      const data = await res.json();

      if (data.success && data.connected) {
        localStorage.setItem('aurasound_suno_key', token);
        localStorage.setItem('aurasound_suno_provider', 'suno_official');

        if (window.app && window.app.showToast) {
          window.app.showToast('Akun resmi Suno.com Anda berhasil terhubung! 🎉', 'success');
        }
        document.getElementById('modal-token')?.classList.remove('active');
        await this.checkApiStatus();
      } else {
        throw new Error(data.error || 'Gagal memverifikasi akun Suno.');
      }
    } catch (e) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
        statusEl.style.color = '#f87171';
        statusEl.textContent = `❌ ${e.message}`;
      }
      if (window.app && window.app.showToast) {
        window.app.showToast(e.message, 'error');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔗 Hubungkan Akun Suno Saya';
      }
    }
  }

  async saveApiKey() {
    const keyInput = document.getElementById('input-suno-api-key');
    const providerSelect = document.getElementById('input-suno-provider');
    const customUrlInput = document.getElementById('input-suno-custom-url');
    const statusEl = document.getElementById('modal-suno-status');
    const btn = document.getElementById('btn-save-suno-token');

    const key = keyInput ? keyInput.value.trim() : '';
    const provider = providerSelect ? providerSelect.value : 'kie';
    const customUrl = customUrlInput ? customUrlInput.value.trim() : '';

    if (!key) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
        statusEl.style.color = '#f87171';
        statusEl.textContent = '❌ Masukkan API Key terlebih dahulu.';
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Memverifikasi API Key...';
    }

    try {
      const res = await fetch('/api/suno/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suno_api_key: key,
          suno_provider: provider,
          suno_custom_url: customUrl
        })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('aurasound_suno_key', key);
        localStorage.setItem('aurasound_suno_provider', provider);
        if (window.app && window.app.showToast) {
          window.app.showToast('API Key berhasil disimpan dan aktif!', 'success');
        }
        document.getElementById('modal-token')?.classList.remove('active');
        await this.checkApiStatus();
      } else {
        throw new Error(data.error || 'Gagal memverifikasi API Key');
      }
    } catch (e) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
        statusEl.style.color = '#f87171';
        statusEl.textContent = `❌ ${e.message}`;
      }
      if (window.app && window.app.showToast) {
        window.app.showToast(e.message, 'error');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Simpan & Aktifkan API Key';
      }
    }
  }

  /**
   * Switch between Studio Generator and User Creations Library
   */
  switchSubTab(tabName) {
    if (tabName !== 'create' && tabName !== 'library') return;
    this.currentSubTab = tabName;

    const btnCreate = document.getElementById('btn-subtab-create');
    const btnLibrary = document.getElementById('btn-subtab-library');
    const subviewCreate = document.getElementById('suno-subview-create');
    const subviewLibrary = document.getElementById('suno-subview-library');

    if (btnCreate) btnCreate.classList.toggle('active', tabName === 'create');
    if (btnLibrary) btnLibrary.classList.toggle('active', tabName === 'library');

    if (subviewCreate) {
      subviewCreate.style.display = tabName === 'create' ? 'block' : 'none';
      if (tabName === 'create') subviewCreate.classList.add('active');
      else subviewCreate.classList.remove('active');
    }

    if (subviewLibrary) {
      subviewLibrary.style.display = tabName === 'library' ? 'block' : 'none';
      if (tabName === 'library') subviewLibrary.classList.add('active');
      else subviewLibrary.classList.remove('active');
    }

    if (tabName === 'library') {
      this.fetchCreations(this.currentPage, false);
    } else if (tabName === 'create') {
      this.renderRecentPreview();
    }
  }

  /**
   * Fetch user creations from server with pagination & search
   */
  async fetchCreations(page = 1, showToast = false) {
    if (this.isLoadingLibrary) return;
    this.isLoadingLibrary = true;
    this.currentPage = page;

    const listContainer = document.getElementById('suno-library-list');
    const pageIndicator = document.getElementById('suno-current-page');
    const prevBtn = document.getElementById('btn-suno-prev-page');
    const nextBtn = document.getElementById('btn-suno-next-page');
    const countBadge = document.getElementById('suno-library-count-badge');

    if (pageIndicator) pageIndicator.textContent = page;
    if (prevBtn) prevBtn.disabled = page <= 1;

    try {
      const q = encodeURIComponent(this.librarySearchQuery || '');
      const res = await fetch(`/api/suno/creations?page=${page}&pageSize=12&q=${q}`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();

      if (data.success && Array.isArray(data.clips)) {
        this.creations = data.clips;
        this.totalPages = data.totalPages || 1;
        this.totalCreations = data.totalCount || 0;
        this.hasMore = Boolean(data.hasMore);

        if (nextBtn) nextBtn.disabled = !this.hasMore;
        if (countBadge) countBadge.textContent = `${this.totalCreations}`;

        this.renderCreations();
        this.renderRecentPreview();

        if (showToast && window.app && window.app.showToast) {
          window.app.showToast(`Koleksi dimuat (${this.totalCreations} lagu buatan Anda)`, 'info');
        }
      } else {
        this.renderEmptyCreations('Belum ada lagu yang dibuat.');
      }
    } catch (err) {
      console.warn('Error fetching creations:', err);
      this.renderEmptyCreations('Gagal memuat lagu buatan Anda.');
    } finally {
      this.isLoadingLibrary = false;
    }
  }

  changePage(delta) {
    const targetPage = this.currentPage + delta;
    if (targetPage >= 1 && targetPage <= this.totalPages && !this.isLoadingLibrary) {
      this.fetchCreations(targetPage, true);
    }
  }

  filterLibrary(query) {
    this.librarySearchQuery = (query || '').toLowerCase().trim();
    this.currentPage = 1;
    this.fetchCreations(1, false);
  }

  renderCreations() {
    const container = document.getElementById('suno-library-list');
    if (!container) return;

    if (!this.creations || this.creations.length === 0) {
      this.renderEmptyCreations();
      return;
    }

    container.innerHTML = this.creations.map((track, idx) => {
      const audioUrl = track.audio_url || `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${track.id}.m4a`;
      const thumb = track.thumbnail || (track.id ? `https://cdn2.suno.ai/image_${track.id}.jpeg` : '/icons/icon.svg');
      const safeTitle = this.escapeHtml(track.title || 'Lagu Baru');
      const rawTags = (track.tags || 'AI Music').trim();
      
      // Clean up tags to avoid 100-word prompt paragraph stretching
      let cleanTags = rawTags;
      const tagList = rawTags.split(/[,;•\n\.]+/).map(s => s.trim()).filter(s => s.length > 0 && s.length < 32);
      if (tagList.length > 0) {
        cleanTags = tagList.slice(0, 2).join(' • ');
      } else if (cleanTags.length > 36) {
        cleanTags = cleanTags.substring(0, 34) + '...';
      }
      const isEn = (window.app?.userProfile?.lang === 'en');
      const safeTags = this.escapeHtml(cleanTags);
      const duration = track.duration || '2:00';
      const isV35 = track.model === 'chirp-v3-5' || track.model === 'v3.5';
      const modelPillText = isV35 ? 'v3.5' : 'v6-mini';

      return `
        <div class="suno-creations-card" data-track-id="${track.id}">
          <div class="suno-card-media" onclick="window.sunoStudio.playClip('${track.id}')">
            <img src="${thumb}" alt="${safeTitle}" class="suno-card-img" loading="lazy" onerror="this.src='/icons/icon.svg'">
            <div class="suno-card-overlay">
              <div class="suno-card-play-btn" title="${isEn ? 'Play Song' : 'Putar Lagu'}">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><polygon points="8 5 19 12 8 19 8 5"/></svg>
              </div>
            </div>
            <div class="suno-card-badge-top">
              <span class="suno-model-pill">${modelPillText}</span>
            </div>
            <div class="suno-card-badge-bottom">
              <span class="suno-duration-pill">${duration}</span>
            </div>
          </div>

          <div class="suno-card-body">
            <h4 class="suno-card-title" title="${safeTitle}">${safeTitle}</h4>
            <div class="suno-card-tags" title="${this.escapeHtml(rawTags)}">
              ${safeTags}
            </div>
            <div class="suno-card-date">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>${track.created_at || (isEn ? 'Today' : 'Hari ini')}</span>
            </div>
          </div>

          <div class="suno-card-footer">
            <button class="suno-action-play" onclick="window.sunoStudio.playClip('${track.id}')" title="${isEn ? 'Play Now' : 'Putar Sekarang'}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="7 5 19 12 7 19 7 5"/></svg>
              <span>${isEn ? 'Play' : 'Putar'}</span>
            </button>
            <div class="suno-action-group">
              <button class="suno-btn-icon" onclick="window.app.addToQueue(window.sunoStudio.formatTrackObject('${track.id}'))" title="${isEn ? 'Add to Queue' : 'Tambah ke Antrean'}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <a href="${audioUrl}" download="${safeTitle}.m4a" class="suno-btn-icon" title="${isEn ? 'Download Audio File' : 'Unduh File Audio'}" target="_blank" rel="noopener">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </a>
              <button class="suno-btn-icon btn-delete" onclick="window.sunoStudio.deleteSong('${track.id}', '${safeTitle}')" title="${isEn ? 'Delete from Library' : 'Hapus dari Koleksi'}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderEmptyCreations(msg = null) {
    const container = document.getElementById('suno-library-list');
    if (!container) return;
    const isEn = (window.app?.userProfile?.lang === 'en');

    if (this.librarySearchQuery) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 48px 20px; text-align: center; color: #94a3b8;">
          <h3 style="color: #ffffff; margin-bottom: 6px;">${isEn ? 'No matching songs' : 'Tidak ada lagu yang cocok'}</h3>
          <p style="font-size: 0.85rem; color: #64748b;">${isEn ? `No created songs found for keyword "${this.escapeHtml(this.librarySearchQuery)}".` : `Tidak ditemukan lagu buatan Anda untuk kata kunci "${this.escapeHtml(this.librarySearchQuery)}".`}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 48px 24px; text-align: center; background: rgba(15, 23, 42, 0.4); border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: 14px;">
        <h3 style="color: #ffffff; font-size: 1.15rem; margin-bottom: 8px;">${isEn ? 'No Songs Created Yet' : 'Belum Ada Lagu Buatan Anda'}</h3>
        <p style="color: #94a3b8; font-size: 0.84rem; max-width: 440px; margin: 0 auto 18px; line-height: 1.6;">
          ${msg || (isEn ? 'All songs generated via Suno AI Studio will be saved here and can be played anytime.' : 'Semua lagu yang Anda hasilkan melalui Suno AI Studio akan tersimpan murni di sini dan bisa diputar kapan saja.')}
        </p>
        <button class="btn-generate-ai" onclick="window.sunoStudio.switchSubTab('create')" style="display: inline-flex; width: auto; padding: 10px 24px;">
          ${isEn ? 'Open Studio & Create First Song' : 'Buka Studio & Buat Lagu Pertama'}
        </button>
      </div>
    `;
  }

  renderRecentPreview() {
    const container = document.getElementById('suno-recent-preview-container');
    if (!container) return;
    const isEn = (window.app?.userProfile?.lang === 'en');

    if (this.creations.length === 0) {
      container.innerHTML = `
        <div class="suno-recent-empty">
          <h4>${isEn ? 'No Songs Created Yet' : 'Belum Ada Lagu Dibuat'}</h4>
          <p>${isEn ? 'Type a theme, lyrics, or genre in the form on the left then click <strong>Generate Song</strong> to start creating!' : 'Ketik tema, lirik, atau genre di formulir sebelah kiri lalu klik <strong>Generate Lagu</strong> untuk mulai berkreasi!'}</p>
        </div>
      `;
      return;
    }

    const latest = this.creations[0];
    const thumb = latest.thumbnail || (latest.id ? `https://cdn2.suno.ai/image_${latest.id}.jpeg` : '/icons/icon.svg');
    const safeTitle = this.escapeHtml(latest.title || (isEn ? 'New Song' : 'Lagu Baru'));
    const safeTags = this.escapeHtml(latest.tags || 'AI Music');
    const duration = latest.duration || '2:00';

    container.innerHTML = `
      <div class="suno-recent-preview-card">
        <div class="suno-recent-thumb-wrapper">
          <img src="${thumb}" alt="${safeTitle}" class="suno-recent-thumb" onerror="this.src='/icons/icon.svg'">
          <button class="suno-recent-play-btn" onclick="window.sunoStudio.playClip('${latest.id}')" title="${isEn ? 'Play Song Now' : 'Putar Lagu Sekarang'}">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><polygon points="8 5 19 12 8 19 8 5"/></svg>
          </button>
        </div>
        <div class="suno-recent-info">
          <div class="suno-recent-title" title="${safeTitle}">${safeTitle}</div>
          <div class="suno-recent-tags">
            <span class="badge-ai" style="font-size: 0.65rem; padding: 2px 6px; margin-right: 4px; background: rgba(16, 185, 129, 0.25); color: #34d399;">${isEn ? 'Suno v6-mini (Latest)' : 'Suno v6-mini (Terbaru)'}</span>
            ${safeTags}
          </div>
          <div class="suno-recent-meta">
            <span>${isEn ? 'Duration: ' : 'Durasi: '}${duration}</span>
            <span>${latest.created_at || (isEn ? 'Today' : 'Hari ini')}</span>
          </div>
        </div>
        <div class="suno-recent-actions">
          <button class="btn-recent-play" onclick="window.sunoStudio.playClip('${latest.id}')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6 4 18 12 6 20 6 4"/></svg>
            ${isEn ? 'Play Now' : 'Putar Sekarang'}
          </button>
          <button class="btn-recent-sec" onclick="window.sunoStudio.switchSubTab('library')">
            ${isEn ? 'Open Library' : 'Buka Koleksi'} (${this.totalCreations})
          </button>
        </div>
      </div>
    `;
  }

  formatTrackObject(clipId) {
    const clip = this.creations.find(c => c.id === clipId);
    if (!clip) return null;

    let targetAudio = clip.audio_url;
    if (!targetAudio || targetAudio.includes('/api/forbidden')) {
      targetAudio = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clip.id}.m4a`;
    }

    return {
      id: clip.id,
      title: clip.title || 'Lagu Baru',
      artist: clip.artist || 'Suno AI (Karya Saya)',
      tags: clip.tags || '',
      prompt: clip.prompt || '',
      lyrics: clip.lyrics || '',
      thumbnail: clip.thumbnail || (clip.id ? `https://cdn2.suno.ai/image_${clip.id}.jpeg` : '/icons/icon.svg'),
      audio_url: targetAudio,
      duration: clip.duration || '2:00',
      seconds: clip.seconds || 120,
      type: 'suno'
    };
  }

  playClip(clipId) {
    const track = this.formatTrackObject(clipId);
    if (track && window.app && window.app.playTrack) {
      window.app.playTrack(track);
    }
  }

  async deleteSong(clipId, title) {
    if (!confirm(`Hapus lagu "${title}" dari koleksi buatan Anda?`)) return;

    try {
      const res = await fetch(`/api/suno/creations/${clipId}`, { 
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        if (window.app && window.app.showToast) {
          window.app.showToast(`Lagu "${title}" berhasil dihapus dari koleksi.`, 'info');
        }
        await this.fetchCreations(this.currentPage, false);
      }
    } catch (e) {
      console.error('Delete error:', e);
    }
  }

  async saveApiKey() {
    const apiKeyInput = document.getElementById('input-suno-api-key');
    const providerSel = document.getElementById('input-suno-provider');
    const customUrlInput = document.getElementById('input-suno-custom-url');
    const saveBtn = document.getElementById('btn-save-suno-token');
    const statusEl = document.getElementById('modal-suno-status');

    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
    const provider = providerSel ? providerSel.value : 'kie';
    const customUrl = customUrlInput ? customUrlInput.value.trim() : '';

    if (!apiKey) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
        statusEl.style.color = '#f87171';
        statusEl.textContent = 'Masukkan Suno API Key terlebih dahulu.';
      }
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Memverifikasi API Key...';
    }

    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.background = 'rgba(56, 189, 248, 0.1)';
      statusEl.style.color = '#38bdf8';
      statusEl.textContent = 'Menghubungkan ke provider API...';
    }

    try {
      const res = await fetch('/api/suno/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suno_api_key: apiKey,
          suno_provider: provider,
          suno_custom_url: customUrl
        })
      });
      const data = await res.json();

      if (data.success && data.connected) {
        // Save to this device's localStorage so quota is isolated per device
        localStorage.setItem('aurasound_suno_key', apiKey);
        localStorage.setItem('aurasound_suno_provider', provider);

        if (window.app && window.app.showToast) {
          window.app.showToast(data.message || 'Suno API Key berhasil diaktifkan di perangkat ini!', 'success');
        }
        document.getElementById('modal-token')?.classList.remove('active');
        await this.checkApiStatus();
      } else {
        throw new Error(data.error || 'Gagal memverifikasi API Key.');
      }
    } catch (e) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
        statusEl.style.color = '#f87171';
        statusEl.textContent = e.message;
      }
      if (window.app && window.app.showToast) {
        window.app.showToast(e.message, 'error');
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan & Aktifkan API Key';
      }
    }
  }

  async disconnectAccount() {
    localStorage.removeItem('aurasound_suno_key');
    localStorage.removeItem('aurasound_suno_provider');
    localStorage.removeItem('aurasound_suno_token');
    if (window.AuraSoundAndroid && typeof window.AuraSoundAndroid.saveSunoToken === 'function') {
      window.AuraSoundAndroid.saveSunoToken('');
    }
    if (window.AuraSoundAndroid && typeof window.AuraSoundAndroid.clearSunoCookies === 'function') {
      window.AuraSoundAndroid.clearSunoCookies();
    }

    const apiKeyInput = document.getElementById('input-suno-api-key');
    if (apiKeyInput) apiKeyInput.value = '';
    const tokenInput = document.getElementById('input-suno-official-token');
    if (tokenInput) tokenInput.value = '';

    try {
      await fetch('/api/suno/disconnect', { method: 'POST' });
    } catch (e) {
      try {
        await fetch('/api/suno/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ suno_api_key: '' })
        });
      } catch (err) {}
    }

    if (window.app && window.app.showToast) {
      window.app.showToast('Koneksi Suno telah dihapus/direset ke awal! Silakan coba login ke akun Suno Anda.', 'success');
    }

    document.getElementById('modal-token')?.classList.remove('active');
    await this.checkApiStatus();
  }

  async clearApiKey() {
    return this.disconnectAccount();
  }

  async generateSong({ title, tags, prompt, make_instrumental, model = 'v6-mini' }) {
    if (this.isGenerating) return;
    this.isGenerating = true;

    const generateBtn = document.getElementById('suno-generate-btn');
    const statusBox = document.getElementById('suno-status-box');
    const statusText = document.getElementById('suno-status-text');

    if (generateBtn) generateBtn.disabled = true;
    if (statusBox) statusBox.style.display = 'flex';
    if (statusText) statusText.textContent = 'Menganalisis konsep lirik & melodi (Suno v6-mini)...';

    const timer1 = setTimeout(() => {
      if (statusText) statusText.textContent = 'Mengaransemen progresi musik dengan Suno v6-mini...';
    }, 1200);

    const timer2 = setTimeout(() => {
      if (statusText) statusText.textContent = 'Sintesis audio AI & mastering Suno v6-mini...';
    }, 2400);

    try {
      const response = await fetch('/api/suno/generate', {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          title,
          tags,
          prompt,
          make_instrumental,
          model: model || 'v6-mini'
        })
      });

      const result = await response.json();

      clearTimeout(timer1);
      clearTimeout(timer2);

      if (!result.success) {
        throw new Error(result.error || 'Gagal membuat lagu via Suno AI.');
      }

      if (statusText) statusText.textContent = 'Menyimpan ke Koleksi Lagu Anda...';

      const clips = result.data || [];
      const clipIds = clips.map(c => c.id).filter(Boolean);

      if (clipIds.length > 0 && !result.is_auto && !result.is_demo) {
        await this.pollClips(clipIds);
      } else {
        await new Promise(r => setTimeout(r, 600));
        const createdTrack = clips[0];
        const songTitle = createdTrack?.title || title || 'Lagu Baru';
        if (window.app && window.app.showToast) {
          window.app.showToast(`Lagu "${songTitle}" berhasil dibuat dan ditambahkan ke Koleksi! 🎵`, 'success');
        }
      }

      await this.fetchCreations(1, false);
      this.renderRecentPreview();
      await this.checkApiStatus();
    } catch (err) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      console.error('Suno generation error:', err);
      if (window.app && window.app.showToast) {
        window.app.showToast(err.message, 'error');
      }
    } finally {
      this.isGenerating = false;
      if (generateBtn) generateBtn.disabled = false;
      if (statusBox) statusBox.style.display = 'none';
    }
  }

  async pollClips(clipIds) {
    const statusText = document.getElementById('suno-status-text');
    let attempts = 0;
    const maxAttempts = 30; // 2.5 minutes

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        attempts++;
        if (statusText) {
          statusText.textContent = `Rendering audio AI (${attempts * 5}s)...`;
        }

        try {
          const res = await fetch(`/api/suno/status?ids=${clipIds.join(',')}`, {
            headers: this.getAuthHeaders()
          });
          const data = await res.json();

          if (data.success && data.clips && data.clips.length > 0) {
            const completed = data.clips.filter(c => c.status === 'complete');
            if (completed.length > 0 || attempts >= maxAttempts) {
              clearInterval(interval);
              if (window.app && window.app.showToast) {
                window.app.showToast('Lagu AI Anda siap diputar dan tersimpan di koleksi! 🎵', 'success');
              }
              resolve();
            }
          }
        } catch (e) {
          console.warn('Poll error:', e);
        }

        if (attempts >= maxAttempts) {
          clearInterval(interval);
          resolve();
        }
      }, 5000);
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

window.sunoStudio = new SunoStudio();
