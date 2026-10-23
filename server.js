const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const ytSearch = require('yt-search');
const axios = require('axios');
const sunoService = require('./suno-service');
const playlistDb = require('./playlist-db');
const userDb = require('./user-db');
const homeData = require('./home-data');
const lyricsRomanizer = require('./lyrics-romanizer');
const sunoLoginHelper = require('./suno-login-helper');
const deviceCredits = require('./device-credits');
const tasteFeed = require('./taste-feed');
const { Ytdl, chooseFormat } = require('@distube/ytdl-core');
const ytdl = new Ytdl();
const streamUrlCache = new Map(); // videoId -> { url, mimeType, contentLength, expiresAt }

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(jpg|jpeg|png|webp|svg|ico|mp3|wav|ogg)$/i.test(filePath)) {
      res.set('Cache-Control', 'public, max-age=604800, immutable');
    } else {
      res.set('Cache-Control', 'no-cache');
    }
  }
}));

// Helper to determine Local Network IP, prioritizing Wi-Fi
function getNetworkIps() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Skip link-local 169.254.x.x
        if (iface.address.startsWith('169.254.')) continue;
        
        const isVirtual = /virtual|vbox|vmware|wsl/i.test(name) || iface.address.startsWith('192.168.56.');
        const isWifi = /wi-?fi|wireless|wlan/i.test(name);
        
        candidates.push({
          name,
          address: iface.address,
          isWifi,
          isVirtual,
          priority: isWifi ? 10 : (isVirtual ? 1 : 5)
        });
      }
    }
  }
  
  // Sort by priority descending
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates;
}

function getPrimaryIp() {
  const ips = getNetworkIps();
  return ips.length > 0 ? ips[0].address : 'localhost';
}

// 1. Get Network Info & QR Code for Mobile Connection
app.get('/api/network-info', async (req, res) => {
  try {
    const primaryIp = getPrimaryIp();
    const allIps = getNetworkIps();
    const accessUrl = `http://${primaryIp}:${PORT}`;
    const qrCodeDataUrl = await QRCode.toDataURL(accessUrl, {
      margin: 2,
      width: 280,
      color: {
        dark: '#10b981',
        light: '#0b0f17'
      }
    });

    res.json({
      success: true,
      primaryIp,
      allIps,
      port: PORT,
      accessUrl,
      qrCode: qrCodeDataUrl
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/download/apk', (req, res) => {
  const distPath = path.join(__dirname, 'dist', 'AuraSound.apk');
  const pubPath = path.join(__dirname, 'public', 'download', 'AuraSound.apk');
  const apkPath = fs.existsSync(distPath) ? distPath : (fs.existsSync(pubPath) ? pubPath : null);

  if (apkPath) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.download(apkPath, 'AuraSound.apk');
  } else {
    res.status(404).send('File APK belum tersedia.');
  }
});

// 2. Search Music on YouTube / YouTube Music
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ success: false, error: 'Query parameter q is required' });
  }

  const filter = (req.query.filter || 'all').toLowerCase(); // 'all' | 'official' | 'nonofficial'

  try {
    let searchQueries = [query];
    if (filter === 'official') {
      searchQueries = [`${query} official music video`, `${query} official audio`, `${query} official`, query];
    } else if (filter === 'nonofficial') {
      searchQueries = [`${query} cover remix lyrics dance`, `${query} live performance`, `${query} festival edm remix`, `${query} cover`];
    }

    const seenIds = new Set();
    const seenTitles = new Set();
    const tracks = [];

    for (const sq of searchQueries) {
      if (tracks.length >= 25) break;
      const results = await ytSearch(sq);
      const candidates = results.videos || [];

      for (const v of candidates) {
        if (v.seconds < 30 || v.seconds > 1200) continue; // skip 10 hour loops or <30s shorts
        if (seenIds.has(v.videoId)) continue;

        // Apply strict filtering
        if (filter === 'official') {
          if (!homeData.isOfficialMusicTrack(v)) continue;
        } else if (filter === 'nonofficial') {
          if (!homeData.isNonOfficialMusicTrack(v)) continue;
        }

        const titleKey = homeData.normalizeTrackKey ? homeData.normalizeTrackKey(v.title, v.author?.name) : v.title;
        // In nonofficial mode, allow multiple creators covering the same song
        const dedupKey = filter === 'nonofficial'
          ? `${(v.author?.name || '').toLowerCase()}:::${titleKey}`
          : titleKey;

        if (dedupKey && dedupKey.length >= 2 && seenTitles.has(dedupKey)) continue;

        seenIds.add(v.videoId);
        if (dedupKey && dedupKey.length >= 2) seenTitles.add(dedupKey);

        const isOfficial = homeData.isOfficialMusicTrack(v);
        tracks.push({
          id: v.videoId,
          title: v.title,
          artist: v.author?.name || 'Unknown Artist',
          duration: v.timestamp || '0:00',
          seconds: v.seconds || 0,
          thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
          views: v.views || 0,
          ago: v.ago || '',
          type: 'youtube',
          isOfficial: filter === 'nonofficial' ? false : isOfficial,
          tag: filter === 'nonofficial' ? 'NON-OFFICIAL' : (isOfficial ? 'OFFICIAL' : null)
        });

        if (tracks.length >= 25) break;
      }
    }

    res.json({ success: true, count: tracks.length, filter, tracks });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Failed to search music' });
  }
});

// 2.5 YouTube Music Home Feed (Listen again, Quick picks, Covers, New releases, etc.)
app.get('/api/home', async (req, res) => {
  try {
    const mood = req.query.mood || 'all';
    const feed = await homeData.getHomeFeed(mood);
    res.json(feed);
  } catch (error) {
    console.error('Home feed error:', error);
    res.status(500).json({ success: false, error: 'Failed to load home feed' });
  }
});

// 2.6 Album & Curated Playlist Details
app.get('/api/home/album/:id', async (req, res) => {
  try {
    const album = await homeData.getAlbumDetail(req.params.id);
    if (!album) {
      return res.status(404).json({ success: false, error: 'Album tidak ditemukan' });
    }
    res.json({ success: true, album });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/home/album/:id/more', async (req, res) => {
  try {
    const offset = parseInt(req.query.offset) || 0;
    const newTracks = await homeData.fetchMoreAlbumTracks(req.params.id, offset);
    res.json({ success: true, newTracks, count: newTracks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2.7 Smart Personalized Recommendations (Supermix & Liked Radio)
app.post('/api/recommendations/supermix', async (req, res) => {
  try {
    const { topArtists, favorites, history } = req.body || {};
    const supermix = await homeData.generatePersonalizedSupermix({ topArtists, favorites, history });
    res.json({ success: true, album: supermix });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/recommendations/liked-radio', async (req, res) => {
  try {
    const { favorites } = req.body || {};
    const radio = await homeData.generateLikedRadio({ favorites });
    res.json({ success: true, album: radio });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2.8 AI Dynamic Personalized Feed & Taste Setup (First-launch & Custom Preferences)
app.post('/api/recommendations/personalized-feed', async (req, res) => {
  try {
    const { name, genres, mood } = req.body || {};
    const deviceId = req.headers['x-device-id'] || req.body?.deviceId || null;
    const feed = await tasteFeed.generatePersonalizedFeed({ name, genres, mood, deviceId });
    res.json(feed);
  } catch (error) {
    console.error('Personalized feed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/recommendations/hypermix', async (req, res) => {
  try {
    const { history, favorites } = req.body || {};
    const result = await tasteFeed.generateHypermix({ history, favorites });
    res.json(result);
  } catch (error) {
    console.error('Hypermix recommendation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/taste/genres', (req, res) => {
  res.json({ success: true, genres: tasteFeed.GENRES, moods: tasteFeed.MOODS });
});

// 3. Trending & Curated Playlists
app.get('/api/trending', async (req, res) => {
  const genre = req.query.genre || 'hits';
  
  const queryMap = {
    hits: 'Top Hits Indonesia Spotify 2026',
    pop: 'Top Pop Hits Global 2026',
    lofi: 'Lofi Hip Hop Chill Beats relaxing audio',
    rock: 'Rock Classic and Modern Hits',
    edm: 'EDM Festival Dance Music 2026',
    indie: 'Indie Indonesia viral playlist'
  };

  const searchQuery = queryMap[genre] || queryMap.hits;

  try {
    const results = await ytSearch(searchQuery);
    const tracks = (results.videos || []).slice(0, 15).map(v => ({
      id: v.videoId,
      title: v.title,
      artist: v.author?.name || 'Popular Artist',
      duration: v.timestamp || '0:00',
      seconds: v.seconds || 0,
      thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
      views: v.views || 0,
      type: 'youtube'
    }));

    res.json({ success: true, genre, tracks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Suno AI Music Studio & User Creations API (Built-in Auto-Engine & Custom API)
// Helper to extract client-provided key & protect server's private key from remote devices
function getEffectiveSunoCredentials(req) {
  const clientKey = (req.headers['x-suno-api-key'] || req.query.api_key || req.body?.api_key || '').trim();
  const clientProvider = (req.headers['x-suno-provider'] || req.query.provider || req.body?.provider || 'kie').trim();

  // If client explicitly provided their own key, prioritize it
  if (clientKey.length > 5) {
    return { key: clientKey, provider: clientProvider, isClientKey: true };
  }

  // System-wide Default: Use server's built-in Suno AI Neural engine
  // End users can generate songs directly without needing to know what an API key is!
  const cfg = sunoService.getConfig();
  return {
    key: cfg.suno_api_key || '368b953dba13bca4791b6ee34b3c1c7a',
    provider: cfg.suno_provider || 'kie',
    isClientKey: false
  };
}

app.get('/api/suno/account', async (req, res) => {
  try {
    const creds = getEffectiveSunoCredentials(req);
    const deviceId = (req.headers['x-device-id'] || req.query.device_id || '').trim() || 'guest_default';
    const ip = req.ip || req.connection?.remoteAddress || '';
    const isLocalhost = ip.includes('127.0.0.1') || ip === '::1' || ip === 'localhost';

    // If client provided their own personal key, return their key account info
    if (creds.isClientKey) {
      const info = await sunoService.getApiKeyInfo(creds.key, creds.provider);
      return res.json(info);
    }

    // Default System Engine with Isolated Per-Device Credits (Option 3)
    const quota = deviceCredits.getDeviceCredits(deviceId, isLocalhost);
    const totalCreations = sunoService.getCreations().length;

    res.json({
      configured: true,
      is_auto: false,
      is_device_quota: true,
      provider: 'Suno AI Neural Studio',
      providerCode: 'kie',
      deviceId: quota.deviceId,
      credits: `${quota.credits} Kredit (${quota.songs_remaining} Lagu Hari Ini)`,
      remaining_credits: quota.credits,
      daily_limit: quota.daily_limit,
      songs_remaining: quota.songs_remaining,
      cost_per_song: quota.cost_per_song,
      statusText: `🟢 Suno AI Aktif • Sisa Kuota Perangkat: ${quota.credits} Kredit (${quota.songs_remaining} Lagu Hari Ini)`,
      totalCreations
    });
  } catch (error) {
    res.status(500).json({ configured: true, is_auto: true, error: error.message });
  }
});

app.get('/api/suno/config', (req, res) => {
  const creds = getEffectiveSunoCredentials(req);
  res.json({
    hasKey: Boolean(creds.key),
    provider: creds.provider || 'kie',
    customUrl: ''
  });
});

app.post('/api/suno/config', async (req, res) => {
  try {
    const { suno_api_key, suno_provider = 'kie', suno_custom_url = '' } = req.body;
    if (!suno_api_key || suno_api_key.trim().length === 0) {
      const ip = req.ip || req.connection?.remoteAddress || '';
      const isLocalhost = ip.includes('127.0.0.1') || ip === '::1' || ip === 'localhost';
      if (isLocalhost) {
        sunoService.saveConfig({ suno_api_key: '', suno_provider, suno_custom_url });
      }
      return res.json({ success: true, message: 'Kembali ke Suno Auto-Engine (Built-in)' });
    }

    const testResult = await sunoService.verifyApiKey(suno_api_key, suno_provider, suno_custom_url);
    const ip = req.ip || req.connection?.remoteAddress || '';
    const isLocalhost = ip.includes('127.0.0.1') || ip === '::1' || ip === 'localhost';
    if (isLocalhost) {
      sunoService.saveConfig({
        suno_api_key: suno_api_key.trim(),
        suno_provider,
        suno_custom_url: suno_custom_url.trim()
      });
    }

    res.json({
      success: true,
      connected: true,
      provider: testResult.name,
      credits: testResult.credits,
      message: `Berhasil terhubung ke ${testResult.name}!`
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/suno/creations', (req, res) => {
  try {
    const { page = 1, pageSize = 12, q = '' } = req.query;
    const deviceId = (req.headers['x-device-id'] || req.query.device_id || '').trim();
    const result = sunoService.getCreationsPaginated({ page, pageSize, query: q, deviceId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/suno/creations', (req, res) => {
  try {
    const { track } = req.body;
    const deviceId = (req.headers['x-device-id'] || req.body?.device_id || '').trim();
    if (!track || !track.id) return res.status(400).json({ success: false, error: 'Track tidak valid' });
    const saved = sunoService.addCreation(track, deviceId);
    res.json({ success: true, track: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/suno/creations/:id', (req, res) => {
  try {
    const result = sunoService.deleteCreation(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/suno/generate', async (req, res) => {
  try {
    const { prompt, tags, title, make_instrumental, lyrics, model } = req.body;
    const creds = getEffectiveSunoCredentials(req);
    const deviceId = (req.headers['x-device-id'] || req.body?.device_id || '').trim() || 'guest_default';
    const ip = req.ip || req.connection?.remoteAddress || '';
    const isLocalhost = ip.includes('127.0.0.1') || ip === '::1' || ip === 'localhost';

    // Check device-isolated credits if using built-in system engine
    if (!creds.isClientKey) {
      const quota = deviceCredits.getDeviceCredits(deviceId, isLocalhost);
      if (quota.credits < deviceCredits.COST_PER_SONG) {
        return res.status(403).json({
          success: false,
          error: `Kuota kredit harian perangkat ini telah habis (${quota.credits} kredit). Kuota ${quota.daily_limit} kredit (5 lagu) akan otomatis di-reset besok!`
        });
      }
    }

    const result = await sunoService.generateSunoSong({
      prompt,
      tags,
      title,
      make_instrumental,
      lyrics,
      model: model || 'v6-mini',
      apiKey: creds.key,
      provider: creds.provider,
      deviceId: deviceId
    });

    // Deduct isolated credits for this device upon generation start
    if (result && result.success && !creds.isClientKey) {
      deviceCredits.deductDeviceCredits(deviceId, deviceCredits.COST_PER_SONG);
      const updatedQuota = deviceCredits.getDeviceCredits(deviceId, isLocalhost);
      result.remaining_credits = updatedQuota.credits;
      result.songs_remaining = updatedQuota.songs_remaining;
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/suno/status', async (req, res) => {
  try {
    const ids = req.query.ids ? req.query.ids.split(',') : [];
    const creds = getEffectiveSunoCredentials(req);
    const deviceId = (req.headers['x-device-id'] || req.query.device_id || '').trim();
    const result = await sunoService.checkSunoStatus(ids, creds.key, creds.provider, deviceId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Automated Suno.com Login Window Launcher & Poller
app.post('/api/suno/login-auto', async (req, res) => {
  try {
    const result = await sunoLoginHelper.launchAutomaticSunoLogin();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/suno/login-status', (req, res) => {
  const status = sunoLoginHelper.getLoginStatus();
  res.json(status);
});

app.post('/api/suno/login-cancel', (req, res) => {
  sunoLoginHelper.cancelLogin();
  res.json({ success: true, message: 'Login dibatalkan' });
});

app.post('/api/suno/disconnect', (req, res) => {
  try {
    sunoLoginHelper.clearLoginSessionProfile();
  } catch (e) {}
  sunoService.saveConfig({
    suno_mode: 'auto',
    suno_api_key: '',
    suno_provider: 'kie',
    suno_custom_url: ''
  });
  res.json({ success: true, message: 'Koneksi Suno berhasil dihapus dan direset ke awal.' });
});

// 5. High-Fidelity Audio Streaming Proxy (Supports Range 206 & Progressive Streams)
app.get('/api/proxy-audio', async (req, res) => {
  const { url, id } = req.query;
  let targetUrl = url;

  if (!targetUrl || targetUrl.includes('/api/forbidden')) {
    if (id) {
      targetUrl = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${id}.m4a`;
    } else {
      return res.status(400).send('Missing audio URL or ID');
    }
  }

  try {
    const rangeHeader = req.headers.range || 'bytes=0-';
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Range': rangeHeader
    };
    if (targetUrl.includes('pixabay.com')) {
      reqHeaders['Referer'] = 'https://pixabay.com/';
    } else if (targetUrl.includes('suno.com') || targetUrl.includes('cloudfront.net')) {
      reqHeaders['Referer'] = 'https://suno.com/';
    }

    const audioRes = await axios.get(targetUrl, {
      headers: reqHeaders,
      responseType: 'stream',
      timeout: 15000,
      validateStatus: (status) => (status >= 200 && status < 300) || status === 206
    });

    res.status(audioRes.status);
    const contentType = targetUrl.endsWith('.m4a') ? 'audio/mp4' : (audioRes.headers['content-type'] || 'audio/mpeg');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    if (audioRes.headers['content-range']) {
      res.setHeader('Content-Range', audioRes.headers['content-range']);
    }
    if (audioRes.headers['content-length']) {
      res.setHeader('Content-Length', audioRes.headers['content-length']);
    }
    audioRes.data.pipe(res);
  } catch (err) {
    console.warn('Proxy audio error:', err.message);
    if (!res.headersSent) {
      res.status(502).send('Failed to stream audio');
    }
  }
});

// 5b. Direct YouTube Music Audio Stream for Full Web Audio DSP Equalizer Processing
app.get('/api/stream-audio', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) {
    return res.status(400).json({ success: false, error: 'Video ID is required' });
  }

  try {
    let cached = streamUrlCache.get(videoId);
    if (!cached || Date.now() > cached.expiresAt) {
      const info = await ytdl.getInfo(videoId);
      let format;
      try {
        format = chooseFormat(info.formats, { filter: f => f.hasAudio && !f.hasVideo, quality: 'highestaudio' });
      } catch (e) {
        try {
          format = chooseFormat(info.formats, { filter: 'audioonly' });
        } catch (e2) {
          format = (info.formats || []).find(f => f.hasAudio);
        }
      }

      if (!format || !format.url) {
        return res.status(404).json({ success: false, error: 'Audio stream format not available' });
      }

      cached = {
        url: format.url,
        mimeType: format.mimeType || 'audio/webm',
        contentLength: format.contentLength,
        expiresAt: Date.now() + 3 * 3600 * 1000 // 3 hours cache
      };
      streamUrlCache.set(videoId, cached);
    }

    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': '*/*'
    };
    if (req.headers.range) {
      reqHeaders['Range'] = req.headers.range;
    }

    const audioRes = await axios.get(cached.url, {
      headers: reqHeaders,
      responseType: 'stream',
      timeout: 25000,
      validateStatus: (status) => (status >= 200 && status < 300) || status === 206
    });

    res.status(audioRes.status);
    res.setHeader('Content-Type', cached.mimeType || 'audio/webm');
    res.setHeader('Accept-Ranges', 'bytes');
    if (audioRes.headers['content-range']) {
      res.setHeader('Content-Range', audioRes.headers['content-range']);
    }
    if (audioRes.headers['content-length']) {
      res.setHeader('Content-Length', audioRes.headers['content-length']);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    audioRes.data.pipe(res);

    req.on('close', () => {
      if (audioRes.data && typeof audioRes.data.destroy === 'function') {
        audioRes.data.destroy();
      }
    });
  } catch (err) {
    // If upstream token expired, evict cache
    streamUrlCache.delete(videoId);
    console.warn(`[Stream-Audio] Error for ${videoId}:`, err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// 6. Import Playlist from YouTube / YouTube Music
app.post('/api/playlist/import', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL atau ID playlist diperlukan' });
  }

  try {
    const match = url.match(/[?&]list=([^&]+)/) || [null, url.trim()];
    const listId = match[1];
    if (!listId) {
      return res.status(400).json({ success: false, error: 'ID Playlist tidak valid' });
    }

    const browseId = listId.startsWith('VL') ? listId : 'VL' + listId;
    const response = await axios.post('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
      browseId,
      context: {
        client: {
          hl: 'id',
          gl: 'ID',
          clientName: 'WEB',
          clientVersion: '2.20240101.01.00'
        }
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    const data = response.data;
    const title = data.header?.playlistHeaderRenderer?.title?.simpleText 
               || data.metadata?.playlistMetadataRenderer?.title 
               || 'Playlist Akun Saya';

    // Helper to parse lockup items and find continuation token
    const parseLockupItems = (items) => {
      const parsedTracks = [];
      let nextToken = null;

      for (const item of items) {
        const lockup = item.lockupViewModel;
        if (lockup && lockup.contentId) {
          const meta = lockup.metadata?.lockupMetadataViewModel;
          const trackTitle = meta?.title?.content || lockup.rendererContext?.accessibilityContext?.label || 'Unknown Track';
          const artist = meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || 'YouTube Music';
          
          let duration = '3:30';
          const acc = lockup.rendererContext?.accessibilityContext?.label || '';
          const durMatch = acc.match(/(\d+)\s*menit(?:,\s*(\d+)\s*detik)?/i);
          if (durMatch) {
            const m = durMatch[1];
            const s = durMatch[2] ? (durMatch[2].length === 1 ? '0' + durMatch[2] : durMatch[2]) : '00';
            duration = `${m}:${s}`;
          }

          parsedTracks.push({
            id: lockup.contentId,
            title: trackTitle,
            artist,
            duration,
            thumbnail: `https://i.ytimg.com/vi/${lockup.contentId}/mqdefault.jpg`,
            type: 'youtube'
          });
        }

        // Check for continuation
        const cont = item.continuationItemViewModel || item.continuationItemRenderer;
        if (cont) {
          nextToken = cont.continuationCommand?.innertubeCommand?.continuationCommand?.token 
                   || cont.continuationEndpoint?.continuationCommand?.token;
        }
      }

      return { parsedTracks, nextToken };
    };

    const sectionList = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
    const initialItems = sectionList?.contents?.[0]?.itemSectionRenderer?.contents || [];

    const firstPage = parseLockupItems(initialItems);
    const allTracks = [...firstPage.parsedTracks];
    let continuationToken = firstPage.nextToken;
    let pageCount = 1;
    const maxPages = 15; // Supports up to ~1,500 songs!

    // Fetch subsequent pages if continuation token exists
    while (continuationToken && pageCount < maxPages && allTracks.length < 1500) {
      pageCount++;
      try {
        const contResponse = await axios.post('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
          continuation: continuationToken,
          context: {
            client: {
              hl: 'id',
              gl: 'ID',
              clientName: 'WEB',
              clientVersion: '2.20240101.01.00'
            }
          }
        }, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 15000
        });

        const actions = contResponse.data.onResponseReceivedActions || contResponse.data.onResponseReceivedEndpoints || [];
        const contItems = actions[0]?.appendContinuationItemsAction?.continuationItems || [];
        if (contItems.length === 0) break;

        const nextPage = parseLockupItems(contItems);
        allTracks.push(...nextPage.parsedTracks);
        continuationToken = nextPage.nextToken;
      } catch (contErr) {
        console.warn('Continuation page error:', contErr.message);
        break;
      }
    }

    const newPlaylist = {
      id: 'pl-' + Date.now(),
      title,
      originalId: listId,
      tracks: allTracks,
      thumbnail: allTracks[0]?.thumbnail || '/icons/icon.svg',
      createdAt: new Date().toLocaleDateString('id-ID'),
      isImported: true,
      deviceId: req.headers['x-device-id'] || req.body?.deviceId || null
    };
    playlistDb.addOrUpdatePlaylist(newPlaylist);

    res.json({
      success: true,
      playlist: newPlaylist
    });
  } catch (error) {
    console.error('Playlist import error:', error.message);
    res.status(500).json({ success: false, error: 'Gagal mengambil playlist. Pastikan playlist disetel sebagai Publik atau Tidak Terdaftar (Unlisted) di akun Anda.' });
  }
});

// 7. Centralized Playlist Database Endpoints (User Google Account & Device Isolation)
app.get('/api/playlists', (req, res) => {
  try {
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.query.userId || req.query.userEmail || req.headers['x-device-id'] || req.query.deviceId || null;
    const playlists = playlistDb.getPlaylistsSummary(userKey);
    res.json({ success: true, count: playlists.length, playlists });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/playlists/:id', (req, res) => {
  try {
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.query.userId || req.query.userEmail || req.headers['x-device-id'] || req.query.deviceId || null;
    const pl = playlistDb.getPlaylistById(req.params.id, userKey);
    if (!pl) return res.status(404).json({ success: false, error: 'Playlist tidak ditemukan' });
    res.json({ success: true, playlist: pl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/playlists', (req, res) => {
  try {
    const { title, tracks, thumbnail } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Nama playlist diperlukan' });
    const trackList = Array.isArray(tracks) ? tracks : [];
    const userEmail = req.headers['x-user-email'] || req.body.userEmail || null;
    const userId = req.headers['x-user-id'] || req.body.userId || null;
    const deviceId = req.headers['x-device-id'] || req.body.deviceId || null;
    const newPl = {
      id: 'pl-' + Date.now(),
      title: title.trim(),
      tracks: trackList,
      thumbnail: thumbnail || (trackList[0] ? trackList[0].thumbnail : '/icons/icon.svg'),
      createdAt: new Date().toLocaleDateString('id-ID'),
      isImported: false,
      userEmail,
      userId,
      deviceId: userEmail || userId || deviceId
    };
    playlistDb.addOrUpdatePlaylist(newPl);
    res.json({ success: true, playlist: newPl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/playlists/:id', (req, res) => {
  try {
    playlistDb.deletePlaylist(req.params.id);
    res.json({ success: true, message: 'Playlist berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/playlists/:id/tracks', (req, res) => {
  try {
    const { track } = req.body;
    if (!track) return res.status(400).json({ success: false, error: 'Track diperlukan' });
    const updated = playlistDb.addTrackToPlaylist(req.params.id, track);
    if (!updated) return res.status(404).json({ success: false, error: 'Playlist tidak ditemukan' });
    res.json({ success: true, playlist: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/playlists/:id/tracks/:trackId', (req, res) => {
  try {
    const updated = playlistDb.removeTrackFromPlaylist(req.params.id, req.params.trackId);
    if (!updated) return res.status(404).json({ success: false, error: 'Playlist tidak ditemukan' });
    res.json({ success: true, playlist: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// USER ACCOUNT & DATABASE ENDPOINTS (Lightweight Server Database)
// ==========================================

// 1. Login or register user with Google credentials
app.post('/api/user/login', (req, res) => {
  try {
    const { email, name, avatar, provider, googleId } = req.body;
    if (!email && !googleId) {
      return res.status(400).json({ success: false, error: 'Email atau ID Google diperlukan' });
    }
    const user = userDb.loginOrRegisterUser({ email, name, avatar, provider, googleId });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get user profile
app.get('/api/user/profile', (req, res) => {
  try {
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.query.userId || req.query.email || req.headers['x-device-id'] || req.query.deviceId;
    if (!userKey) {
      return res.status(400).json({ success: false, error: 'userKey diperlukan' });
    }
    const user = userDb.getUser(userKey);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Update user profile (name, avatar, lang)
app.post('/api/user/profile', (req, res) => {
  try {
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.body.email || req.body.userId || req.headers['x-device-id'] || req.body.deviceId;
    if (!userKey) {
      return res.status(400).json({ success: false, error: 'userKey diperlukan' });
    }
    const { name, avatar, lang, tasteProfile } = req.body;
    const updated = userDb.updateUserProfile(userKey, { name, avatar, lang, tasteProfile });
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Get user favorites
app.get('/api/user/favorites', (req, res) => {
  try {
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.query.userId || req.query.email || req.headers['x-device-id'] || req.query.deviceId;
    if (!userKey) {
      return res.json({ success: true, favorites: [] });
    }
    const favorites = userDb.getUserFavorites(userKey);
    res.json({ success: true, favorites });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Toggle user favorite
app.post('/api/user/favorites/toggle', (req, res) => {
  try {
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.body.email || req.body.userId || req.headers['x-device-id'] || req.body.deviceId;
    const { track } = req.body;
    if (!userKey || !track) {
      return res.status(400).json({ success: false, error: 'userKey dan track diperlukan' });
    }
    const result = userDb.toggleUserFavorite(userKey, track);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Batch sync user favorites
app.post('/api/user/favorites/sync', (req, res) => {
  try {
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.body.email || req.body.userId || req.headers['x-device-id'] || req.body.deviceId;
    const { favorites } = req.body;
    if (!userKey || !Array.isArray(favorites)) {
      return res.status(400).json({ success: false, error: 'userKey dan array favorites diperlukan' });
    }
    const updated = userDb.setUserFavorites(userKey, favorites);
    res.json({ success: true, favorites: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Get play history
app.get('/api/user/history', (req, res) => {
  try {
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.query.userId || req.query.email || req.headers['x-device-id'] || req.query.deviceId;
    if (!userKey) return res.json({ success: true, history: [] });
    const history = userDb.getUserHistory(userKey);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Add track to play history
app.post('/api/user/history', (req, res) => {
  try {
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.body.email || req.body.userId || req.headers['x-device-id'] || req.body.deviceId;
    const { track } = req.body;
    if (!userKey || !track) return res.status(400).json({ success: false, error: 'userKey dan track diperlukan' });
    const history = userDb.addTrackToHistory(userKey, track);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. AI Taste Profile
app.get('/api/user/taste', (req, res) => {
  try {
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.query.userId || req.query.email || req.headers['x-device-id'] || req.query.deviceId;
    if (!userKey) return res.json({ success: true, tasteProfile: null });
    const tasteProfile = userDb.getUserTaste(userKey);
    res.json({ success: true, tasteProfile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/user/taste', (req, res) => {
  try {
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.body.email || req.body.userId || req.headers['x-device-id'] || req.body.deviceId;
    const { tasteProfile } = req.body;
    if (!userKey) return res.status(400).json({ success: false, error: 'userKey diperlukan' });
    userDb.saveUserTaste(userKey, tasteProfile);
    res.json({ success: true, tasteProfile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 8. REAL-TIME SYNCHRONIZED LYRICS API (LRCLIB Proxy with In-Memory Caching)
// ==========================================
const lyricsCache = new Map();
const MAX_LYRICS_CACHE = 500;

function stripTagsAndParens(text) {
  let res = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '(' || text[i] === '[' || text[i] === '{') {
      const openChar = text[i];
      const closeChar = openChar === '(' ? ')' : openChar === '[' ? ']' : '}';
      let depth = 1;
      let tagContent = '';
      i++;
      while (i < text.length && depth > 0) {
        if (text[i] === openChar) depth++;
        else if (text[i] === closeChar) depth--;
        if (depth > 0) tagContent += text[i];
        i++;
      }
      if (/feat|ft\.|featuring|official|video|audio|mv|remaster|hd|hq|4k|lyric|prod/i.test(tagContent) ||
          /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/.test(tagContent)) {
        // Drop it
      } else {
        res += ' ' + tagContent + ' ';
      }
    } else {
      res += text[i];
      i++;
    }
  }
  return res;
}

function cleanLyricsTrackInfo(rawTitle, rawArtist) {
  let title = (rawTitle || '').trim();
  let artist = (rawArtist || '').trim();

  // 1. Handle Asian bracket pattern: 'Artist【 Song Title 】Extra' or '【 Song Title 】Artist'
  const bracketMatch = title.match(/^(.+?)\s*[【《「『]([^】》」』]+)[】》」』](.*)$/);
  if (bracketMatch) {
    const before = bracketMatch[1].trim();
    const inside = bracketMatch[2].trim();
    const isTag = /^(?:official\s*(?:music\s*video|mv|video|audio)?|music\s*video|lyric\s*video|mv|hd|4k|live|remix|lyrics?|full\s*audio|visualizer)$/i.test(inside);
    if (!isTag && inside.length > 0) {
      title = inside;
      if (before.length > 1) artist = before;
    }
  }

  // 2. Handle 'Artist - Song Title'
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    const left = parts[0].trim();
    const right = parts.slice(1).join(' - ').trim();
    if (right.length > 0) {
      title = right;
      if (left.length > 1) artist = left;
    }
  }

  // 3. Remove pipes and trailing info: | Official Music Video ...
  title = title.replace(/\|.*$/g, '');

  // 4. Strip tags and parens like (feat. ...), (Official Music Video), etc.
  title = stripTagsAndParens(title);

  // 5. Strip standalone suffix words
  title = title.replace(/\b(?:official\s*(?:music\s*video|video|audio|mv|lyric\s*video)?|music\s*video|lyric\s*video|visualizer|m\/v|mv)\b/gi, '');

  // 6. Clean bracket artifacts
  title = title.replace(/[【】《》「」『』'\"“”‘’]/g, ' ').replace(/\s+/g, ' ').trim();

  // 7. Clean artist
  artist = stripTagsAndParens(artist);
  artist = artist
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*VEVO$/i, '')
    .replace(/\b(?:official|channel|music|records|label|entertainment)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { title, artist };
}

function buildSearchCandidates(title, artist) {
  const candidates = [];

  const artistEn = (artist.match(/[A-Za-z0-9\s/&.-]+/g) || []).join(' ').trim();
  const artistAsian = (artist.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g) || []).join(' ').trim();

  const titleAsian = (title.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g) || []).join('').trim();
  const titleEn = (title.match(/[A-Za-z0-9\s/&.-]+/g) || []).join(' ').trim();

  // 1. Exact get candidates
  if (title && artist) candidates.push({ type: 'get', track: title, artist: artist });
  if (titleAsian && artistEn) candidates.push({ type: 'get', track: titleAsian, artist: artistEn });
  if (title && artistEn && artistEn !== artist) candidates.push({ type: 'get', track: title, artist: artistEn });
  if (titleAsian && artistAsian && artistAsian !== artist) candidates.push({ type: 'get', track: titleAsian, artist: artistAsian });
  if (titleEn && artistEn && titleEn !== title) candidates.push({ type: 'get', track: titleEn, artist: artistEn });

  // 2. Search queries
  if (title && artistEn) candidates.push({ type: 'search', q: `${title} ${artistEn}` });
  if (titleAsian && artistEn) candidates.push({ type: 'search', q: `${titleAsian} ${artistEn}` });
  if (title && artist) candidates.push({ type: 'search', q: `${title} ${artist}` });
  if (titleAsian) candidates.push({ type: 'search', q: titleAsian });
  if (title) candidates.push({ type: 'search', q: title });

  return candidates;
}

function pickBestLyrics(items, targetDuration, targetArtist) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const valid = items.filter(x => x && (x.syncedLyrics || x.plainLyrics));
  if (valid.length === 0) return null;

  const cleanTarget = (targetArtist || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');

  const scored = valid.map(item => {
    let score = 0;
    const itemArtist = (item.artistName || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');

    if (cleanTarget && itemArtist) {
      if (itemArtist.includes(cleanTarget) || cleanTarget.includes(itemArtist)) {
        score += 80;
      }
    }

    if (item.syncedLyrics) score += 40;
    if (!item.instrumental) score += 20;

    if (targetDuration && targetDuration > 0 && item.duration) {
      const diff = Math.abs(item.duration - targetDuration);
      if (diff <= 3) score += 30;
      else if (diff <= 8) score += 15;
      else if (diff <= 20) score += 5;
    }

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.item || valid[0];
}

app.get('/api/lyrics', async (req, res) => {
  const rawTitle = req.query.title;
  const rawArtist = req.query.artist;
  const duration = parseInt(req.query.duration, 10) || 0;

  if (!rawTitle) {
    return res.status(400).json({ success: false, error: 'Judul lagu (title) diperlukan' });
  }

  const { title, artist } = cleanLyricsTrackInfo(rawTitle, rawArtist);
  const cacheKey = `${title.toLowerCase()}___${artist.toLowerCase()}`;

  if (lyricsCache.has(cacheKey)) {
    const cached = lyricsCache.get(cacheKey);
    return res.json({ success: true, ...cached, fromCache: true });
  }

  const headers = { 'User-Agent': 'AuraSound/3.9 (https://github.com/aurasound)' };

  try {
    let result = null;
    const candidates = buildSearchCandidates(title, artist);

    for (const c of candidates) {
      try {
        if (c.type === 'get') {
          const getRes = await axios.get('https://lrclib.net/api/get', {
            params: {
              track_name: c.track,
              artist_name: c.artist,
              ...(duration > 0 ? { duration } : {})
            },
            headers,
            timeout: 4000
          });
          if (getRes.data && (getRes.data.syncedLyrics || getRes.data.plainLyrics)) {
            result = getRes.data;
            break;
          }
        } else if (c.type === 'search') {
          const searchRes = await axios.get('https://lrclib.net/api/search', {
            params: { q: c.q },
            headers,
            timeout: 4000
          });
          const picked = pickBestLyrics(searchRes.data, duration, artist);
          if (picked) {
            result = picked;
            break;
          }
        }
      } catch (e) {
        // Try next candidate
      }
    }

    let parsedLyrics = null;
    let detectedLang = null;

    if (result && result.syncedLyrics) {
      const lrcLines = result.syncedLyrics.split('\n');
      const items = [];
      const lrcRegex = /^\[(\d{2}):(\d{2}(?:\.\d+)?)\]\s*(.*)$/;
      for (const line of lrcLines) {
        const match = line.trim().match(lrcRegex);
        if (match) {
          const m = parseInt(match[1], 10);
          const s = parseFloat(match[2]);
          const time = m * 60 + s;
          const text = match[3].trim();
          if (text) {
            items.push({ time, text });
          }
        }
      }

      // 1. Sort strictly by timestamp ascending so lyrics never jump out of order
      items.sort((a, b) => a.time - b.time);

      // 2. Filter out early credit headers (< 3.5s) like "词：...", "曲：...", "Written by: ..."
      const creditRegex = /^(?:词[：:]|曲[：:]|作词[：:]|作曲[：:]|编曲[：:]|制作[：:]|lrc[：:]|by[：:]|written by|produced by|arranger|lyrics by)/i;
      const cleanItems = items.filter(it => !(it.time < 3.5 && creditRegex.test(it.text)));
      const finalItems = cleanItems.length > 0 ? cleanItems : items;

      if (finalItems.length > 0) {
        try {
          const romanized = await lyricsRomanizer.romanizeLyricsList(finalItems);
          parsedLyrics = romanized.lines;
          detectedLang = romanized.detectedLang;
        } catch (e) {
          console.warn('Romanizer sync error:', e.message);
          parsedLyrics = finalItems.map(it => ({ ...it, romaji: null, lang: null }));
        }
      }
    } else if (result && result.plainLyrics) {
      const rawLines = result.plainLyrics.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.startsWith('[') && !l.startsWith('('));
      const dur = duration || result.duration || 180;
      const interval = dur / (rawLines.length + 1);
      const items = rawLines.map((text, idx) => ({
        time: Math.floor(interval * (idx + 0.6)),
        text
      }));
      if (items.length > 0) {
        try {
          const romanized = await lyricsRomanizer.romanizeLyricsList(items);
          parsedLyrics = romanized.lines;
          detectedLang = romanized.detectedLang;
        } catch (e) {
          console.warn('Romanizer plain error:', e.message);
          parsedLyrics = items.map(it => ({ ...it, romaji: null, lang: null }));
        }
      }
    }

    const payload = result ? {
      found: true,
      id: result.id,
      title: result.trackName || title,
      artist: result.artistName || artist,
      album: result.albumName || '',
      duration: result.duration || duration,
      instrumental: Boolean(result.instrumental),
      syncedLyrics: result.syncedLyrics || null,
      plainLyrics: result.plainLyrics || null,
      parsedLyrics: parsedLyrics || null,
      detectedLang: detectedLang || null,
      hasRomaji: Boolean(parsedLyrics && parsedLyrics.some(l => Boolean(l.romaji)))
    } : {
      found: false,
      title,
      artist
    };

    // Cache result
    if (lyricsCache.size >= MAX_LYRICS_CACHE) {
      const firstKey = lyricsCache.keys().next().value;
      lyricsCache.delete(firstKey);
    }
    lyricsCache.set(cacheKey, payload);

    res.json({ success: true, ...payload, fromCache: false });
  } catch (error) {
    console.error('Lyrics API error:', error.message);
    res.status(500).json({ success: false, error: 'Gagal mengambil lirik' });
  }
});

// Start Server
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    const primaryIp = getPrimaryIp();
    console.log(`\n======================================================`);
    console.log(`🎵 APLIKASI MUSIK BERHASIL DIJALANKAN!`);
    console.log(`💻 Akses di Laptop : http://localhost:${PORT}`);
    console.log(`📱 Akses di HP     : http://${primaryIp}:${PORT}`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
