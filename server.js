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
const wanakana = require('wanakana');
let lyricsRomanizer = require('./lyrics-romanizer');
function getLyricsRomanizer() {
  try {
    delete require.cache[require.resolve('./lyrics-romanizer')];
    lyricsRomanizer = require('./lyrics-romanizer');
  } catch (e) {
    // Keep existing instance if cache busting fails
  }
  return lyricsRomanizer;
}
const sunoLoginHelper = require('./suno-login-helper');
const deviceCredits = require('./device-credits');
const tasteFeed = require('./taste-feed');
const spotifyService = require('./spotify-service');
let ytdlInstance = null;
let chooseFormatFn = null;
async function getYtdl() {
  if (!ytdlInstance) {
    try {
      const mod = await import('@distube/ytdl-core');
      const YtdlClass = mod.Ytdl || mod.default?.Ytdl;
      chooseFormatFn = mod.chooseFormat || mod.default?.chooseFormat;
      if (YtdlClass) {
        const clientList = mod.Client ? [mod.Client.WebEmbedded, mod.Client.Tv, mod.Client.Mweb] : undefined;
        ytdlInstance = clientList ? new YtdlClass({ clients: clientList }) : new YtdlClass();
      }
    } catch (err) {
      console.warn('[ytdl] Could not load @distube/ytdl-core:', err.message);
    }
  }
  return { ytdl: ytdlInstance, chooseFormat: chooseFormatFn };
}
const streamUrlCache = new Map(); // videoId -> { url, mimeType, contentLength, expiresAt }

const app = express();
const PORT = process.env.PORT || 3000;

function getUnifiedDataDir() {
  if (process.env.AURASOUND_DATA_DIR && fs.existsSync(process.env.AURASOUND_DATA_DIR)) {
    return process.env.AURASOUND_DATA_DIR;
  }
  if (process.env.APPDATA) {
    const mainDir = path.join(process.env.APPDATA, 'AuraSound', 'data');
    if (!fs.existsSync(mainDir)) {
      try { fs.mkdirSync(mainDir, { recursive: true }); } catch (e) {}
    }
    return mainDir;
  }
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT || process.env.NOW_REGION);
  return (isServerless ? path.join('/tmp', 'data') : path.join(__dirname, 'data'));
}
const DATA_DIR = getUnifiedDataDir();
const AVATARS_DIR = path.join(DATA_DIR, 'avatars');
try {
  if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });
} catch (e) {}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Pre-hydrated Server Session & Playback Injection for Desktop Application (instant startup with 0ms reset)
app.get(['/', '/index.html'], (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  try {
    let html = fs.readFileSync(indexPath, 'utf8');
    const user = userDb.getActiveSession();
    let sessionScript = '';
    if (user && user.email) {
      const safeUser = {
        email: user.email,
        name: user.name || user.email.split('@')[0],
        avatar: user.avatar || `https://unavatar.io/google/${user.email}`,
        lang: user.lang || 'id',
        provider: user.provider || 'google',
        favorites: Array.isArray(user.favorites) ? user.favorites : [],
        playHistory: Array.isArray(user.playHistory) ? user.playHistory : [],
        tasteProfile: user.tasteProfile || null
      };
      sessionScript += `window.__AURASOUND_SERVER_SESSION__ = ${JSON.stringify(safeUser)};\n`;
    }

    // Playback state injection (disk fallback for zero reset)
    try {
      const pPath = path.join(DATA_DIR, 'playback.json');
      if (fs.existsSync(pPath)) {
        const pb = JSON.parse(fs.readFileSync(pPath, 'utf8'));
        if (pb && (pb.currentTrack || pb.track)) {
          sessionScript += `window.__AURASOUND_PLAYBACK_STATE__ = ${JSON.stringify(pb)};\n`;
        }
      }
    } catch (pe) {}

    if (sessionScript) {
      const injection = `
  <script id="aurasound-server-session-data">
    ${sessionScript}
  </script>`;
      html = html.replace('</head>', `${injection}\n</head>`);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(html);
  } catch (err) {
    console.warn('Error serving injected index.html:', err);
    return res.sendFile(indexPath, (sendErr) => {
      if (sendErr && !res.headersSent) {
        res.status(500).send('<html><body style="background:#070a12;color:#fff;text-align:center;padding:50px;font-family:sans-serif;"><h2>AuraSound Music Hub</h2><p>Menyiapkan sistem server...</p><script>setTimeout(()=>location.reload(), 1500);</script></body></html>');
      }
    });
  }
});

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res, filePath) => {
    if (/\.(jpg|jpeg|png|webp|svg|ico|mp3|wav|ogg)$/i.test(filePath)) {
      res.set('Cache-Control', 'public, max-age=604800, immutable');
    } else {
      res.set('Cache-Control', 'no-cache');
    }
  }
}));

// Persistent Playback State API (disk persistence fallback)
app.get('/api/user/playback-state', (req, res) => {
  try {
    const pPath = path.join(DATA_DIR, 'playback.json');
    if (fs.existsSync(pPath)) {
      const data = JSON.parse(fs.readFileSync(pPath, 'utf8'));
      return res.json({ success: true, state: data });
    }
  } catch (e) {}
  return res.json({ success: false });
});

app.post('/api/user/playback-state', (req, res) => {
  try {
    const pPath = path.join(DATA_DIR, 'playback.json');
    fs.writeFileSync(pPath, JSON.stringify(req.body, null, 2), 'utf8');
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

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

// Native YouTube Music Search Client (via Innertube)
let innertubeClient = null;
let innertubeInitPromise = null;

async function getInnertube() {
  if (innertubeClient) return innertubeClient;
  if (innertubeInitPromise) return innertubeInitPromise;

  innertubeInitPromise = (async () => {
    try {
      const { Innertube } = await import('youtubei.js');
      innertubeClient = await Innertube.create({ retrieve_player: false });
      return innertubeClient;
    } catch (e) {
      console.warn('Innertube init warning:', e.message);
      innertubeClient = null;
      return null;
    }
  })();

  return innertubeInitPromise;
}

async function searchYouTubeMusicSongs(query, limit = 25, page = 1) {
  try {
    const yt = await getInnertube();
    if (!yt || !yt.music) return [];

    let res = await yt.music.search(query, { type: 'song' });
    let shelf = res.contents?.[0];
    let items = shelf?.contents || [];

    // Support deep pagination via YouTube Music continuations
    if (page > 1 && res.has_continuation) {
      let currentPage = 1;
      let currentRes = res;
      while (currentPage < page && currentRes.has_continuation) {
        currentRes = await currentRes.getContinuation();
        currentPage++;
      }
      items = currentRes.contents?.contents || currentRes.contents || [];
    }

    return items.slice(0, limit).map(s => {
      const id = s.id;
      if (!id) return null;
      const title = s.title || '';
      const artist = s.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
      const duration = s.duration?.text || '0:00';
      const seconds = s.duration?.seconds || 0;

      // Extract high-res 1:1 square album thumbnail from YouTube Music
      let thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      if (s.thumbnails && s.thumbnails.length > 0) {
        const rawUrl = s.thumbnails[0].url || '';
        if (rawUrl.includes('googleusercontent.com')) {
          thumbnail = rawUrl.replace(/=w\d+-h\d+[^"]*/, '=w544-h544-l90-rj');
        } else if (rawUrl) {
          thumbnail = rawUrl;
        }
      }

      return {
        id,
        title,
        artist,
        album: s.album?.name || '',
        duration,
        seconds,
        thumbnail,
        views: 0,
        ago: '',
        type: 'youtube',
        isOfficial: true,
        tag: 'OFFICIAL',
        source: 'ytmusic'
      };
    }).filter(Boolean);
  } catch (e) {
    console.warn('searchYouTubeMusicSongs error:', e.message);
    return [];
  }
}

function sortTracksByRelevance(tracks, query) {
  if (!query || !Array.isArray(tracks) || tracks.length <= 1) return tracks;
  const qClean = query.toLowerCase().trim();
  const qWords = qClean.split(/\s+/).filter(w => w.length > 1);
  const wantsAlternative = /\b(karaoke|cover|remix|dj|instrumental|piano|sped up|slowed|live|acoustic|nightcore)\b/i.test(qClean);

  const scored = tracks.map((t, index) => {
    let score = (tracks.length - index) * 10; // YouTube Music ML baseline
    const title = (t.title || '').toLowerCase();
    const artist = (t.artist || '').toLowerCase();

    // 1. Filter out knockoffs / karaoke / piano covers if not requested
    const isKnockoff = /\b(karaoke|originally performed by|tribute to|piano version|piano karaoke|instrumental version|dj remix|sped up|slowed|nightcore|tribute)\b/i.test(title);
    if (isKnockoff && !wantsAlternative) {
      score -= 800;
    }

    // 2. Exact matches
    if (title === qClean) score += 200;
    if (artist === qClean) score += 120;

    // 3. Word matches
    for (const w of qWords) {
      if (title.includes(w)) score += 25;
      if (artist.includes(w)) score += 35; // Artist match is extremely valuable
    }

    // 4. Studio master priority
    if (t.source === 'ytmusic' || t.isOfficial) score += 30;
    if (title.includes('official audio') || artist.includes('- topic')) score += 40;
    if (/\b(?:mv|m\/v|official\s*music\s*video)\b/i.test(title) && !wantsAlternative) score -= 20;

    return { track: t, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.track);
}

// 2. Search Music on YouTube Music & Official Studio Catalogs (Unlimited Global Catalog)
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ success: false, error: 'Query parameter q is required' });
  }

  const filter = (req.query.filter || 'all').toLowerCase(); // 'all' | 'official' | 'nonofficial'
  const page = Math.max(1, parseInt(req.query.page) || 1);

  try {
    const seenIds = new Set();
    const seenTitles = new Set();
    const tracks = [];

    // Step A: Priority 1 - Authentic YouTube Music Studio Songs
    if (filter !== 'nonofficial') {
      try {
        const ytmSongs = await searchYouTubeMusicSongs(query, 25, page);
        for (const s of ytmSongs) {
          if (!s.id || seenIds.has(s.id)) continue;
          const titleKey = homeData.normalizeTrackKey ? homeData.normalizeTrackKey(s.title, s.artist) : s.title.toLowerCase();
          const dedupKey = `${(s.artist || '').toLowerCase()}:::${titleKey}`;
          if (titleKey && titleKey.length >= 2 && seenTitles.has(dedupKey)) continue;

          seenIds.add(s.id);
          if (titleKey && titleKey.length >= 2) seenTitles.add(dedupKey);
          tracks.push(s);

          if (tracks.length >= 25) break;
        }
      } catch (ytmErr) {
        console.warn('[Search] YouTube Music song query fallback:', ytmErr.message);
      }
    }

    // Step B: If YouTube Music returned plenty of results, sort by relevance and return
    if (tracks.length >= 8 && filter !== 'nonofficial') {
      const sorted = sortTracksByRelevance(tracks, query);
      return res.json({ success: true, count: sorted.length, filter, page, hasMore: sorted.length >= 8, tracks: sorted, source: 'ytmusic' });
    }

    // Step C: Fallback / Secondary Search or Non-Official Search (Covers, Remixes, Live)
    let searchQueries = [query];
    if (filter === 'official') {
      searchQueries = [
        `${query} official audio`,
        `${query} audio`,
        `${query} topic`,
        `${query} official`,
        query
      ];
    } else if (filter === 'nonofficial') {
      searchQueries = [`${query} cover remix lyrics dance`, `${query} live performance`, `${query} festival edm remix`, `${query} cover`];
    }

    for (const sq of searchQueries) {
      if (tracks.length >= 25) break;
      const results = await ytSearch(sq);
      const candidates = results.videos || [];

      // Sort candidates to prioritize official clean studio audio (Topic / Audio) over MVs with intro bumpers
      if (filter !== 'nonofficial' && !/\b(?:live|concert|cover|fancam)\b/i.test(query)) {
        candidates.sort((a, b) => {
          const aAuthor = (a.author?.name || '').toLowerCase();
          const bAuthor = (b.author?.name || '').toLowerCase();
          const aTitle = (a.title || '').toLowerCase();
          const bTitle = (b.title || '').toLowerCase();

          const aIsAudio = aAuthor.includes('topic') || aTitle.includes('official audio') || aTitle.includes('audio');
          const bIsAudio = bAuthor.includes('topic') || bTitle.includes('official audio') || bTitle.includes('audio');
          if (aIsAudio && !bIsAudio) return -1;
          if (!aIsAudio && bIsAudio) return 1;

          const aIsMv = /official\s*(?:music\s*video|mv)|m\/v/i.test(aTitle);
          const bIsMv = /official\s*(?:music\s*video|mv)|m\/v/i.test(bTitle);
          if (aIsMv && !bIsMv) return 1;
          if (!aIsMv && bIsMv) return -1;

          return 0;
        });
      }

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
          thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          views: v.views || 0,
          ago: v.ago || '',
          type: 'youtube',
          isOfficial: filter === 'nonofficial' ? false : isOfficial,
          tag: filter === 'nonofficial' ? 'NON-OFFICIAL' : (isOfficial ? 'OFFICIAL' : null),
          source: 'yt'
        });

        if (tracks.length >= 25) break;
      }
    }

    const finalTracks = sortTracksByRelevance(tracks, query);
    res.json({ success: true, count: finalTracks.length, filter, page, hasMore: finalTracks.length >= 8, tracks: finalTracks });
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
    let album = await homeData.getAlbumDetail(req.params.id);

    // If not found in default catalog, check user playlists DB
    if (!album) {
      const allPlaylists = playlistDb.getAllPlaylists();
      const pl = allPlaylists.find(p => p.id === req.params.id || String(p.id) === String(req.params.id));
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
      }
    }

    // Support dynamic Crossover Fusion mixes (mix-fusion-[id1]-[id2])
    if (!album && req.params.id.startsWith('mix-fusion-')) {
      const allPlaylists = playlistDb.getAllPlaylists().filter(p => p.isImported || p.source === 'spotify' || p.source === 'youtube');
      const pl1 = allPlaylists.find(p => req.params.id.includes(p.id)) || allPlaylists[0];
      const pl2 = allPlaylists.filter(p => p.id !== pl1?.id).find(p => req.params.id.includes(p.id)) || allPlaylists[1];
      if (pl1 && pl2) {
        const mergedTracks = [];
        const maxT = Math.max(pl1.tracks?.length || 0, pl2.tracks?.length || 0);
        for (let i = 0; i < maxT; i++) {
          if (pl1.tracks && pl1.tracks[i]) mergedTracks.push(pl1.tracks[i]);
          if (pl2.tracks && pl2.tracks[i]) mergedTracks.push(pl2.tracks[i]);
        }
        album = {
          id: req.params.id,
          title: `${pl1.title} × ${pl2.title} Fusion`,
          artist: `${pl1.title} & ${pl2.title}`,
          description: `Perpaduan crossover harmonis antara album "${pl1.title}" dan "${pl2.title}".`,
          thumbnail: pl1.thumbnail || pl2.thumbnail || '/images/supermix.jpg',
          tracks: mergedTracks,
          badge: 'FUSION MIX',
          year: '2026',
          genre: 'Crossover Hybrid Mix'
        };
      }
    }

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
    const userKey = req.headers['x-device-id'] || req.headers['x-user-id'] || req.query.deviceId || null;
    const newTracks = await homeData.fetchMoreAlbumTracks(req.params.id, offset, userKey);
    res.json({ success: true, newTracks, count: newTracks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2.7 Smart Personalized Recommendations (Supermix & Liked Radio)
app.post('/api/recommendations/supermix', async (req, res) => {
  try {
    const { topArtists, favorites, history, importedPlaylists } = req.body || {};
    const userKey = req.headers['x-device-id'] || req.body?.deviceId || null;
    let effectiveImported = Array.isArray(importedPlaylists) && importedPlaylists.length > 0
      ? importedPlaylists
      : playlistDb.getAllPlaylists(userKey).filter(p => p.isImported || p.source === 'spotify' || p.source === 'youtube');

    const supermix = await homeData.generatePersonalizedSupermix({
      topArtists,
      favorites,
      history,
      importedPlaylists: effectiveImported
    });
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
    const { name, genres, mood, history, favorites, importedPlaylists } = req.body || {};
    const deviceId = req.headers['x-device-id'] || req.body?.deviceId || null;
    let effectiveImported = Array.isArray(importedPlaylists) && importedPlaylists.length > 0
      ? importedPlaylists
      : playlistDb.getAllPlaylists(deviceId).filter(p => p.isImported || p.source === 'spotify' || p.source === 'youtube');

    const feed = await tasteFeed.generatePersonalizedFeed({
      name,
      genres,
      mood,
      history,
      favorites,
      importedPlaylists: effectiveImported,
      deviceId
    });
    res.json(feed);
  } catch (error) {
    console.error('Personalized feed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/recommendations/hypermix', async (req, res) => {
  try {
    const { history, favorites, importedPlaylists } = req.body || {};
    const userKey = req.headers['x-device-id'] || req.body?.deviceId || null;
    let effectiveImported = Array.isArray(importedPlaylists) && importedPlaylists.length > 0
      ? importedPlaylists
      : playlistDb.getAllPlaylists(userKey).filter(p => p.isImported || p.source === 'spotify' || p.source === 'youtube');

    const result = await tasteFeed.generateHypermix({
      history,
      favorites,
      importedPlaylists: effectiveImported
    });
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
    let tracks = await searchYouTubeMusicSongs(searchQuery, 15);
    if (!tracks || tracks.length < 5) {
      const results = await ytSearch(searchQuery);
      tracks = (results.videos || []).slice(0, 15).map(v => ({
        id: v.videoId,
        title: v.title,
        artist: v.author?.name || 'Popular Artist',
        duration: v.timestamp || '0:00',
        seconds: v.seconds || 0,
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        views: v.views || 0,
        type: 'youtube',
        isOfficial: true,
        tag: 'OFFICIAL'
      }));
    }

    res.json({ success: true, genre, tracks, source: 'ytmusic' });
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
      const { ytdl, chooseFormat } = await getYtdl();
      if (!ytdl) {
        return res.status(503).json({ success: false, error: 'Audio extractor not available on this server' });
      }
      const info = await ytdl.getInfo(videoId);
      let format;
      try {
        format = chooseFormat ? chooseFormat(info.formats, { filter: f => f.hasAudio && !f.hasVideo, quality: 'highestaudio' }) : null;
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

// 6. Import Playlist from YouTube Music / Spotify
app.post('/api/playlist/import', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL atau ID playlist diperlukan' });
  }

  // Handle Spotify Playlist / Album / Track Import
  if (spotifyService.isSpotifyUrl(url)) {
    try {
      const deviceId = req.headers['x-device-id'] || req.body?.deviceId || null;
      const newPlaylist = await spotifyService.importFromSpotify(url, deviceId);
      playlistDb.addOrUpdatePlaylist(newPlaylist);
      return res.json({
        success: true,
        playlist: newPlaylist
      });
    } catch (spErr) {
      console.error('Spotify import error:', spErr.message);
      return res.status(500).json({ success: false, error: `Gagal mengimpor dari Spotify: ${spErr.message}` });
    }
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

// 6.1 Resolve Spotify track audio on demand
app.get('/api/spotify/resolve', async (req, res) => {
  try {
    const { title, artist, id } = req.query;
    if (!title && !id) {
      return res.status(400).json({ success: false, error: 'Parameter title atau id diperlukan' });
    }
    const videoId = await spotifyService.resolveSpotifyTrack(title, artist, id);
    if (!videoId) {
      return res.status(404).json({ success: false, error: 'Audio untuk lagu Spotify ini tidak ditemukan' });
    }
    res.json({ success: true, videoId });
  } catch (err) {
    console.error('Spotify resolve error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Centralized Playlist Database Endpoints (User Google Account & Device Isolation)
app.get('/api/playlists', (req, res) => {
  try {
    const defaultUserKey = (userDb.getActiveSession() && userDb.getActiveSession().email) || null;
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.query.userId || req.query.userEmail || req.headers['x-device-id'] || req.query.deviceId || defaultUserKey;
    const playlists = playlistDb.getPlaylistsSummary(userKey);
    res.json({ success: true, count: playlists.length, playlists });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/playlists/:id', (req, res) => {
  try {
    const defaultUserKey = (userDb.getActiveSession() && userDb.getActiveSession().email) || null;
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.query.userId || req.query.userEmail || req.headers['x-device-id'] || req.query.deviceId || defaultUserKey;
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
    if (user && user.email) {
      userDb.setActiveSession(user);
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1b. Get active session across app restarts (persistent desktop session)
app.get(['/api/user/session', '/api/auth/session'], (req, res) => {
  try {
    const user = userDb.getActiveSession();
    if (user) {
      res.json({ success: true, user });
    } else {
      res.json({ success: false, user: null });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1c. Clear active session on explicit logout
app.post(['/api/user/logout', '/api/auth/logout'], (req, res) => {
  try {
    userDb.clearActiveSession();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1d. Server-backed Playback State Persistence (Current Track, Queue, Position)
const PLAYBACK_FILE = path.join(DATA_DIR, 'playback.json');

app.get('/api/playback/state', (req, res) => {
  try {
    if (fs.existsSync(PLAYBACK_FILE)) {
      const state = JSON.parse(fs.readFileSync(PLAYBACK_FILE, 'utf8'));
      return res.json({ success: true, state });
    }
    res.json({ success: false, state: null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/playback/state', (req, res) => {
  try {
    const state = req.body;
    if (state && typeof state === 'object') {
      fs.writeFileSync(PLAYBACK_FILE, JSON.stringify(state, null, 2), 'utf8');
      return res.json({ success: true });
    }
    res.json({ success: false });
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
    let { name, avatar, lang, tasteProfile } = req.body;

    // If an image was uploaded as Base64, save it permanently to disk!
    if (avatar && typeof avatar === 'string' && avatar.startsWith('data:image/')) {
      try {
        const matches = avatar.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const buffer = Buffer.from(matches[2], 'base64');
          const cleanKey = userDb.normalizeUserKey ? userDb.normalizeUserKey(userKey) : String(userKey).replace(/[^a-zA-Z0-9_-]/g, '_');
          const avatarPath = path.join(AVATARS_DIR, `${cleanKey}.png`);
          fs.writeFileSync(avatarPath, buffer);
          avatar = `/api/user/avatar?userId=${encodeURIComponent(cleanKey)}&v=${Date.now()}`;
        }
      } catch (avErr) {
        console.error('Error saving avatar image to disk:', avErr);
      }
    }

    const updated = userDb.updateUserProfile(userKey, { name, avatar, lang, tasteProfile });
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3b. Serve persistent user profile avatar
app.get('/api/user/avatar', (req, res) => {
  try {
    const userKey = req.query.userId || req.query.email || req.headers['x-user-email'];
    if (!userKey) {
      return res.sendFile(path.join(__dirname, 'public', 'images', 'avatar.jpg'));
    }
    const cleanKey = userDb.normalizeUserKey ? userDb.normalizeUserKey(userKey) : String(userKey).replace(/[^a-zA-Z0-9_-]/g, '_');
    const avatarPath = path.join(AVATARS_DIR, `${cleanKey}.png`);
    if (fs.existsSync(avatarPath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(avatarPath);
    }
    const user = userDb.getUser(userKey);
    if (user && user.avatar && user.avatar.startsWith('http') && !user.avatar.includes('/api/user/avatar')) {
      return res.redirect(user.avatar);
    }
    res.sendFile(path.join(__dirname, 'public', 'images', 'avatar.jpg'));
  } catch (e) {
    res.sendFile(path.join(__dirname, 'public', 'images', 'avatar.jpg'));
  }
});

// 4. Get user favorites
app.get('/api/user/favorites', (req, res) => {
  try {
    const defaultUserKey = (userDb.getActiveSession() && userDb.getActiveSession().email) || null;
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.query.userId || req.query.email || req.headers['x-device-id'] || req.query.deviceId || defaultUserKey;
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
    const defaultUserKey = (userDb.getActiveSession() && userDb.getActiveSession().email) || null;
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.body.email || req.body.userId || req.headers['x-device-id'] || req.body.deviceId || defaultUserKey;
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
    const defaultUserKey = (userDb.getActiveSession() && userDb.getActiveSession().email) || null;
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.body.email || req.body.userId || req.headers['x-device-id'] || req.body.deviceId || defaultUserKey;
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
    const defaultUserKey = (userDb.getActiveSession() && userDb.getActiveSession().email) || null;
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.query.userId || req.query.email || req.headers['x-device-id'] || req.query.deviceId || defaultUserKey;
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
    const defaultUserKey = (userDb.getActiveSession() && userDb.getActiveSession().email) || null;
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.body.email || req.body.userId || req.headers['x-device-id'] || req.body.deviceId || defaultUserKey;
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

// 10. Playlists CRUD & Server Persistence
app.get('/api/playlists', (req, res) => {
  try {
    const defaultUserKey = (userDb.getActiveSession() && userDb.getActiveSession().email) || null;
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.query.userId || req.query.email || req.headers['x-device-id'] || req.query.deviceId || defaultUserKey;
    const playlists = playlistDb.getAllPlaylists(userKey);
    res.json({ success: true, playlists });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/playlists/:id', (req, res) => {
  try {
    const defaultUserKey = (userDb.getActiveSession() && userDb.getActiveSession().email) || null;
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.query.userId || req.query.email || req.headers['x-device-id'] || req.query.deviceId || defaultUserKey;
    const playlist = playlistDb.getPlaylistById(req.params.id, userKey);
    if (!playlist) return res.status(404).json({ success: false, error: 'Playlist tidak ditemukan' });
    res.json({ success: true, playlist });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/playlists', (req, res) => {
  try {
    const defaultUserKey = (userDb.getActiveSession() && userDb.getActiveSession().email) || null;
    const userKey = req.headers['x-user-email'] || req.headers['x-user-id'] || req.body.email || req.body.userId || req.headers['x-device-id'] || req.body.deviceId || defaultUserKey;
    const { id, title, tracks, thumbnail, isImported } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Judul playlist diperlukan' });
    const pl = {
      id: id || ('pl_' + Date.now()),
      title,
      tracks: Array.isArray(tracks) ? tracks : [],
      thumbnail: thumbnail || (tracks && tracks[0] && tracks[0].thumbnail) || '/images/supermix.jpg',
      createdAt: new Date().toLocaleDateString('id-ID'),
      isImported: !!isImported,
      userEmail: req.headers['x-user-email'] || (userDb.getActiveSession()?.email) || '',
      userId: userKey || '',
      deviceId: userKey || ''
    };
    const saved = playlistDb.addOrUpdatePlaylist(pl);
    res.json({ success: true, playlist: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/playlists/:id', (req, res) => {
  try {
    playlistDb.deletePlaylist(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/playlists/:id/tracks', (req, res) => {
  try {
    const { track } = req.body;
    if (!track) return res.status(400).json({ success: false, error: 'Track diperlukan' });
    const pl = playlistDb.addTrackToPlaylist(req.params.id, track);
    if (!pl) return res.status(404).json({ success: false, error: 'Playlist tidak ditemukan' });
    res.json({ success: true, playlist: pl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/playlists/:id/tracks/:trackId', (req, res) => {
  try {
    const pl = playlistDb.removeTrackFromPlaylist(req.params.id, req.params.trackId);
    if (!pl) return res.status(404).json({ success: false, error: 'Playlist tidak ditemukan' });
    res.json({ success: true, playlist: pl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 8. REAL-TIME SYNCHRONIZED LYRICS API (LRCLIB Proxy with In-Memory Caching)
// ==========================================
const lyricsCache = new Map();
const MAX_LYRICS_CACHE = 500;

function applyVersionMismatchPenalty(score, candidateTitle, targetTitle) {
  const cTitle = (candidateTitle || '').toLowerCase();
  const tTitle = (targetTitle || '').toLowerCase();
  const mismatchKeywords = [
    /\b(?:japanese|jp)\s*ver/i,
    /\b(?:english|en|eng)\s*ver/i,
    /\b(?:korean|kr|kor)\s*ver/i,
    /\b(?:chinese|zh|cn)\s*ver/i,
    /\bday\s*ver/i,
    /\bnight\s*ver/i,
    /\bacoustic\b/i,
    /\bremix\b/i,
    /\bsped\s*up\b/i,
    /\bslowed\b/i,
    /\blive\b/i,
    /\binst(?:rumental)?\b/i,
    /伴奏/i
  ];

  for (const regex of mismatchKeywords) {
    if (regex.test(cTitle) && !regex.test(tTitle)) {
      score -= 500;
    }
  }
  return score;
}

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
      // Preserve language version tags like (Japanese Ver.), (English Ver.), (Korean Ver.), (Chinese Ver.)
      const isLangVer = /(?:japanese|english|korean|chinese|jp|en|kr|kor|zh|cn)\s*(?:ver|version)/i.test(tagContent);
      if (isLangVer) {
        res += ' (' + tagContent.trim() + ') ';
      } else if (/feat|ft\.|featuring|official|video|audio|mv|m\/v|remaster|hd|hq|4k|lyric|prod|clip|teaser|trailer|from\s+|ost|theme|anime|film|movie|ver\b|version|side\s+[a-z0-9]|part\s*\d+|with\s+|collaboration|主題歌|挿入歌|エンディング|オープニング|主题曲|片尾曲|插曲|歌いました/i.test(tagContent)) {
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

const LABEL_CHANNEL_REGEX = /^(?:hybe\s*labels?|1thek(?:\s*\(.*?\))?|smtown|jyp\s*entertainment|yg\s*entertainment|stone\s*music(?:\s*entertainment)?|starshiptv|starship|woollim|pledis|cube|fnc|kq\s*entertainment|theblacklabel|wm\s*entertainment|rbw|wakeone|mnet|kbs\s*kpop|mbc\s*kpop|sbs\s*kpop|genie\s*music|warner\s*music(?:\s*\w+)?|sony\s*music(?:\s*\w+)?|universal\s*music(?:\s*\w+)?|vevo|youtube(?:\s*music)?|nagaswara|aquarius\s*musikindo|musica\s*studios|trinity\s*optima(?:\s*production)?|avex|king\s*records|ponycanyon|topic|gemblog)$/i;

// High-Performance Dynamic Caches for External Public APIs
const sponsorBlockCache = new Map(); // videoId -> { introOffsetSec, totalNonMusicDuration, effectiveSongDuration }
const ytMetadataCache = new Map();    // videoId -> { title, artist, duration }

/**
 * Resolves non-music segments dynamically using the free public SponsorBlock API (sponsor.ajay.app).
 * Automatically calculates precise intro offsets and effective pure music duration for ANY video.
 */
async function resolveDynamicAudioSegments(videoId, videoDuration = 0) {
  if (!videoId) {
    return { introOffsetSec: 0, totalNonMusicDuration: 0, effectiveSongDuration: videoDuration };
  }
  const cached = sponsorBlockCache.get(videoId);
  if (cached) {
    return cached;
  }

  let introOffsetSec = 0;
  let totalNonMusicDuration = 0;
  let detectedVideoDuration = videoDuration || 0;

  try {
    const url = `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(videoId)}&category=music_offtopic`;
    const res = await axios.get(url, {
      timeout: 1800,
      headers: { 'User-Agent': 'AuraSound/4.13 (sponsorblock-client)' }
    });
    const segments = Array.isArray(res.data) ? res.data : [];
    for (const item of segments) {
      const itemVDur = Number(item.videoDuration) || 0;
      // Guard: If caller provided actual YouTube video duration, reject segments from a completely different cut/reupload
      if (videoDuration > 0 && itemVDur > 0 && Math.abs(itemVDur - videoDuration) > 10) {
        continue;
      }
      if (detectedVideoDuration <= 0 && itemVDur > 0) {
        detectedVideoDuration = itemVDur;
      }

      // Ignore downvoted segments
      if (item.votes !== undefined && Number(item.votes) < 0) continue;

      const seg = item.segment;
      if (Array.isArray(seg) && seg.length >= 2) {
        const segStart = Number(seg[0]) || 0;
        const segEnd = Number(seg[1]) || 0;
        const dur = Math.max(0, segEnd - segStart);

        // Intro offset: segment starting at beginning of video (<= 1.5s) and lasting between 2.0s and 120s
        if (segStart <= 1.5 && segEnd < 120) {
          const isVerified = (item.locked === 1) || (Number(item.votes) >= 1) || (segEnd >= 4.0);
          if (segEnd >= 2.0 && isVerified) {
            introOffsetSec = Math.max(introOffsetSec, segEnd);
            totalNonMusicDuration += dur;
          }
        }
      }
    }
  } catch (e) {
    // 404 or timeout means no non-music segments found (normal for pure studio tracks)
  }

  const baseDur = videoDuration > 0 ? videoDuration : detectedVideoDuration;
  // Intro offset is the primary non-music segment that changes song alignment with audio stream.
  // We do NOT subtract arbitrary middle/outro cuts from effectiveSongDuration because studio albums on Apple Music
  // match the full song length, not cut versions.
  const effectiveSongDuration = baseDur > 0
    ? Math.max(0, baseDur - introOffsetSec)
    : 0;

  const result = {
    introOffsetSec: parseFloat(introOffsetSec.toFixed(3)),
    totalNonMusicDuration: parseFloat(totalNonMusicDuration.toFixed(3)),
    detectedVideoDuration: parseFloat(baseDur.toFixed(3)),
    effectiveSongDuration: parseFloat(effectiveSongDuration.toFixed(3))
  };

  sponsorBlockCache.set(videoId, result);
  if (sponsorBlockCache.size > 1000) {
    sponsorBlockCache.delete(sponsorBlockCache.keys().next().value);
  }
  return result;
}

/**
 * Resolves clean track title, artist, and duration dynamically via YouTube Innertube metadata
 * with in-memory caching to eliminate the need for hardcoded song and artist dictionaries.
 */
async function resolveCanonicalTrackMetadata(videoId, rawTitle, rawArtist) {
  let cleanTitle = (rawTitle || '').trim();
  let cleanArtist = (rawArtist || '').trim();
  let duration = 0;

  if (videoId) {
    if (ytMetadataCache.has(videoId)) {
      const cached = ytMetadataCache.get(videoId);
      if (!cleanTitle) cleanTitle = cached.title || '';
      if (!cleanArtist || LABEL_CHANNEL_REGEX.test(cleanArtist)) cleanArtist = cached.artist || cleanArtist;
      duration = cached.duration || 0;
    } else if (!cleanTitle || !cleanArtist || LABEL_CHANNEL_REGEX.test(cleanArtist)) {
      try {
        const yt = await getInnertube();
        if (yt && typeof yt.getBasicInfo === 'function') {
          const basic = await yt.getBasicInfo(videoId);
          const bInfo = basic?.basic_info;
          if (bInfo) {
            if (bInfo.duration) duration = bInfo.duration;

            let author = (bInfo.author || '').replace(/\s*-\s*Topic$/i, '').trim();
            const isLabel = !author || LABEL_CHANNEL_REGEX.test(author);

            // Prioritize caller's artist if caller passed a real artist
            if (cleanArtist && !LABEL_CHANNEL_REGEX.test(cleanArtist)) {
              // keep cleanArtist
            } else if (!isLabel) {
              cleanArtist = author;
            }

            const bTitle = bInfo.title || '';
            if (!cleanTitle || cleanTitle.length < 2) {
              const quoteMatch = bTitle.match(/^(.+?)\s*[-_–—]?\s*['"“‘「『【《]([^'"”’」』】》]+)['"”’」』】》]/);
              if (quoteMatch) {
                const prefixArtist = quoteMatch[1].trim();
                const insideTitle = quoteMatch[2].trim();
                if (insideTitle.length > 0 && !/^(?:official|music\s*video|mv|audio|live|remix|hd|4k)$/i.test(insideTitle)) {
                  cleanTitle = insideTitle;
                  if (!cleanArtist || LABEL_CHANNEL_REGEX.test(cleanArtist)) {
                    cleanArtist = prefixArtist;
                  }
                }
              } else if (bTitle) {
                cleanTitle = bTitle;
              }
            }

            ytMetadataCache.set(videoId, {
              title: cleanTitle,
              artist: cleanArtist,
              duration
            });
            if (ytMetadataCache.size > 1000) {
              ytMetadataCache.delete(ytMetadataCache.keys().next().value);
            }
          }
        }
      } catch (e) {}
    }
  }

  const info = cleanLyricsTrackInfo(cleanTitle, cleanArtist);
  return {
    ...info,
    duration
  };
}

// Master Traditional to Simplified Chinese character conversion dictionary
const TRAD_TO_SIMP_MAP = {
  '倫': '伦', '傑': '杰', '棋': '棋', '紫': '紫', '鄧': '邓', '陳': '陈', '迅': '迅',
  '奕': '奕', '謙': '谦', '薛': '薛', '榮': '荣', '浩': '浩', '學': '学', '友': '友',
  '華': '华', '劉': '刘', '氣': '气', '球': '球', '愛': '爱', '說': '说', '聽': '听',
  '點': '点', '開': '开', '關': '关', '飛': '飞', '見': '见', '會': '会', '來': '来',
  '過': '过', '時': '时', '後': '后', '動': '动', '頭': '头', '風': '风', '車': '车',
  '電': '电', '長': '长', '門': '门', '間': '间', '問': '问', '題': '题', '國': '国',
  '場': '场', '聲': '声', '樂': '乐', '發': '发', '變': '变', '無': '无', '為': '为',
  '給': '给', '對': '对', '讓': '让', '這': '这', '個': '个', '們': '们', '還': '还',
  '樣': '样', '體': '体', '戀': '恋', '約': '约', '定': '定', '夢': '梦', '離': '离',
  '難': '难', '與': '与', '親': '亲', '紅': '红', '綠': '绿', '藍': '蓝', '黃': '黄',
  '楓': '枫', '簡': '简', '單': '单', '靜': '静', '煉': '炼', '情': '情', '影': '影',
  '退': '退', '蒲': '蒲', '公': '公', '英': '英', '北': '北', '夜': '夜', '曲': '曲',
  '稻': '稻', '香': '香', '青': '青', '花': '花', '瓷': '瓷', '秘': '秘', '密': '密',
  '哭': '哭', '等': '等', '課': '课', '光': '光', '年': '年', '外': '外', '葉': '叶',
  '惠': '惠', '美': '美', '雙': '双', '截': '截', '棍': '棍', '龍': '龙', '拳': '拳',
  '軌': '轨', '跡': '迹', '斷': '断', '絃': '弦', '藉': '借', '口': '口', '園': '园',
  '遊': '游', '會': '会', '髮': '发', '雪': '雪', '麥': '麦', '芽': '芽', '糖': '糖',
  '霍': '霍', '元': '元', '甲': '甲', '菊': '菊', '台': '台', '金': '金', '彩': '彩',
  '虹': '虹', '甜': '甜', '蜜': '蜜', '現': '现', '代': '代', '詞': '词', '編': '编',
  '製': '制', '作': '作', '演': '演', '唱': '唱', '錄': '录', '音': '音', '師': '师',
  '寫': '写', '專': '专', '輯': '辑', '帶': '带', '處': '处', '理': '理', '監': '监',
  '企': '企', '劃': '划', '產': '产', '品': '品', '發': '发', '行': '行', '原': '原',
  '創': '创', '翻': '翻', '評': '评', '論': '论', '廣': '广', '東': '东', '話': '话',
  '語': '语', '網': '网', '絡': '络', '傳': '传', '統': '统', '節': '节', '目': '目',
  '劇': '剧', '場': '场', '視': '视', '頻': '频', '線': '线', '上': '上', '級': '级',
  '屬': '属', '優': '优', '質': '质', '勝': '胜', '負': '负', '獲': '获', '獎': '奖',
  '寶': '宝', '貝': '贝', '兒': '儿', '童': '童', '歲': '岁', '月': '月', '憶': '忆',
  '認': '认', '真': '真', '識': '识', '別': '别', '歸': '归', '宿': '宿', '遠': '远',
  '近': '近', '邊': '边', '緣': '缘', '份': '份', '運': '运', '機': '机', '遇': '遇',
  '面': '面', '嚮': '向', '往': '往', '覺': '觉', '得': '得', '意': '意', '義': '义',
  '懷': '怀', '念': '念', '想': '想', '望': '望', '傷': '伤', '心': '心', '痛': '痛',
  '淚': '泪', '流': '流', '溫': '温', '柔': '柔', '熱': '热', '冷': '冷', '漠': '漠',
  '孤': '孤', '獨': '独', '寂': '寂', '寞': '寞', '歡': '欢', '笑': '笑', '悲': '悲',
  '哀': '哀', '愁': '愁', '苦': '苦', '快': '快', '慢': '慢', '重': '重', '輕': '轻',
  '深': '深', '淺': '浅', '高': '高', '低': '低', '張': '张', '王': '王', '李': '李',
  '趙': '赵', '孫': '孙', '周': '周', '吳': '吴', '鄭': '郑', '馮': '冯', '蘇': '苏',
  '綠': '绿', '派': '派', '對': '对', '車': '车', '飛': '飞', '落': '落', '日': '日',
  '草': '草', '東': '东', '沒': '没', '有': '有'
};

function toSimplifiedChinese(str) {
  if (!str) return '';
  return str.split('').map(c => TRAD_TO_SIMP_MAP[c] || c).join('');
}

function normalizeForCompare(str) {
  return toSimplifiedChinese(str || '')
    .toLowerCase()
    .replace(/[\s\-_:–—|()（）[\]【】'\"“”‘’·/.,]/g, '')
    .trim();
}

function cleanLyricsTrackInfo(rawTitle, rawArtist) {
  let title = (rawTitle || '').trim();
  let artist = (rawArtist || '').trim();

  const isChannelPublisher = !artist || LABEL_CHANNEL_REGEX.test(artist) || /labels?|records|entertainment|official|channel|vevo|tv$|blog$/i.test(artist);

  // 0. Handle parenthetical OST / Drama / Game theme song annotations
  // e.g. 有点甜 (《萌三国》网游主题曲|《微微一笑很倾城》电视剧插曲)
  const parenOstMatch = title.match(/^([^(（\[【《]+?)\s*[(（\[【《][^)]*(?:主题曲|插曲|片尾曲|片头曲|原声带|网游|电视剧|电影|OST|BGM|Theme|Soundtrack)[^)）\]】》]*[)）\]】》]?/i);
  if (parenOstMatch && parenOstMatch[1].trim().length >= 2) {
    title = parenOstMatch[1].trim();
  }

  // 1. Strip obvious junk tags in brackets at start/end
  const junkPattern = /\s*[\[(【](?:official\s*(?:music\s*video|mv|video|audio)?|music\s*video|lyric\s*video|audio|mv|m\/v|hd|4k|full\s*audio|visualizer|teaser|trailer|clip|special\s*clip|performance\s*video|dance\s*practice)[\])】]/gi;
  title = title.replace(junkPattern, ' ').trim();
  artist = artist.replace(junkPattern, ' ').trim();

  // Strip leading video tags like 【MV】, 【Official Video】, [MV]
  title = title.replace(/^\s*[【\[](?:official\s*(?:music\s*video|mv|video|audio)?|music\s*video|lyric\s*video|audio|mv|m\/v|hd|4k)[】\]]\s*/i, '').trim();

  // 2. Handle leading Chinese book title bracket 《Title》 at start of string (e.g. 《芒种》音阙诗听/赵方婧)
  const leadingBookTitle = title.match(/^\s*《([^》]+)》\s*(.*)$/);
  if (leadingBookTitle && !/official|mv|audio|video|hd|4k|remix|live/i.test(leadingBookTitle[1])) {
    title = leadingBookTitle[1].trim();
    const rest = leadingBookTitle[2].trim();
    if (!artist || isChannelPublisher || artist.length < 2) {
      const restArtistMatch = rest.match(/^([^\s|丨/]+(?:\/[^\s|丨/]+)?)/);
      if (restArtistMatch) {
        artist = restArtistMatch[1].trim();
      }
    }
  } else {
    // 3. Leading artist tag: 【Artist】 Title (e.g. 【Ado】新時代, 【Eve】廻廻奇譚)
    const leadingArtistMatch = title.match(/^\s*[【\[]([^】\]]+)[】\]]\s*(.+)$/);
    if (leadingArtistMatch && !/official|mv|audio|video|hd|4k|remix|live/i.test(leadingArtistMatch[1])) {
      if (isChannelPublisher || !artist) {
        artist = leadingArtistMatch[1].trim();
      }
      title = leadingArtistMatch[2].trim();
    } else {
      // 4. Quotes / Corner brackets: Artist 「Title」, Artist 『Title』, Artist 'Title'
      const cornerBracketMatch = title.match(/^(.+?)\s*[-_–—]?\s*['"“‘「『【《]([^'"”’」』】》]+)['"”’」』】》](.*)$/);
      if (cornerBracketMatch && cornerBracketMatch[2].trim().length > 0) {
        const inside = cornerBracketMatch[2].trim();
        const before = cornerBracketMatch[1].trim();
        if (!/^(?:official\s*(?:music\s*video|mv|video|audio)?|music\s*video|lyric\s*video|mv|hd|4k|live|remix|lyrics?|full\s*audio|visualizer)$/i.test(inside)) {
          title = inside;
          if (before.length > 0 && !/^(?:official|music\s*video|mv|audio|video|hd|4k)$/i.test(before)) {
            if (isChannelPublisher || !artist || /blackpink|bts|twice|exo|nct|red\s*velvet|seventeen|stray\s*kids|girls['’]?\s*generation|snsd/i.test(artist)) {
              artist = before;
            }
          }
        }
      } else if (title.includes(' _ ')) {
        const parts = title.split(' _ ');
        if (isChannelPublisher && parts[0].trim().length > 1) {
          artist = parts[0].trim();
          title = parts.slice(1).join(' _ ').trim();
        }
      } else if (title.includes(' - ')) {
        const dashParts = title.split(' - ');
        const p0 = dashParts[0].trim();
        const p1 = dashParts.slice(1).join(' - ').trim();
        if (isChannelPublisher && p0.length > 1) {
          artist = p0;
          title = p1;
        } else {
          const normArtist = normalizeForCompare(artist);
          const normP0 = normalizeForCompare(p0);
          const normP1 = normalizeForCompare(p1);
          const isKnownSoloArtist = /^(?:jennie|lisa|rose|rosé|jisoo|jungkook|jung\s*kook|jimin|v|suga|agust\s*d|j-hope|rm|jin|taeyeon|baekhyun|kai|nayeon|jihyo|tzuyu)$/i.test(p0);
          if (isKnownSoloArtist && /blackpink|bts|twice|exo|snsd|girls['’]?\s*generation/i.test(artist)) {
            artist = p0;
            title = p1;
          } else if (normP0 && normArtist && (normP0.includes(normArtist) || normArtist.includes(normP0))) {
            artist = p0;
            title = p1;
          } else if (normP1 && normArtist && (normP1.includes(normArtist) || normArtist.includes(normP1))) {
            artist = p1;
            title = p0;
          } else {
            // Bilingual title handling e.g. 'ひゅるりらぱっぱ - HYURURIRAPAPPA'
            const hasCjk0 = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(p0);
            const hasCjk1 = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(p1);
            if (hasCjk0 && !hasCjk1) {
              title = p0;
            } else if (!hasCjk0 && hasCjk1) {
              title = p1;
            } else {
              title = p1; // Standard YouTube naming is "Artist - Song Title", p1 is the track title!
            }
          }
        }
      }
    }
  }

  // Remove pipes and trailing info
  title = title.replace(/\|.*$/g, '').replace(/丨.*$/g, '').trim();

  // Detect and cleanly separate Asian + Latin bilingual titles like "클락션 (Klaxon)" or "晴天 (Sunny Day)"
  let extractedNativeTitle = '';
  let extractedLatinTitle = '';
  const bilingualParenMatch = title.match(/^([^(（\[【《]+?)\s*[(（\[【《]([^)）\]】》]+)[)）\]】》]$/);
  if (bilingualParenMatch) {
    const pA = bilingualParenMatch[1].trim();
    const pB = bilingualParenMatch[2].trim();
    const hasCjkA = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(pA);
    const hasCjkB = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(pB);
    const isLatinA = /^[A-Za-z0-9\s'.,!?-]+$/.test(pA);
    const isLatinB = /^[A-Za-z0-9\s'.,!?-]+$/.test(pB);

    if (hasCjkA && isLatinB && !/official|video|mv|audio|remix|live/i.test(pB)) {
      extractedNativeTitle = pA;
      extractedLatinTitle = pB;
      title = pA; // Keep native title clean!
    } else if (isLatinA && hasCjkB && !/official|video|mv|audio|remix|live/i.test(pB)) {
      extractedLatinTitle = pA;
      extractedNativeTitle = pB;
      title = pA; // Keep Latin title clean!
    }
  }

  // Extract Asian characters (Hangul, Hanzi, Kana)
  const asianTitleMatches = title.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g);
  let nativeTitle = extractedNativeTitle || (asianTitleMatches ? asianTitleMatches.join(' ').trim() : '');

  const asianArtistMatches = artist.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g);
  let nativeArtist = asianArtistMatches ? asianArtistMatches.join(' ').trim() : '';

  // Clean tags and parens like (feat. ...), (Official Music Video), etc.
  title = stripTagsAndParens(title);

  // Strip standalone suffix words
  title = title.replace(/\b(?:official\s*(?:music\s*video|video|audio|mv|lyric\s*video)?|music\s*video|lyric\s*video|visualizer|m\/v|mv)\b/gi, '');

  // Clean bracket artifacts while keeping internal contraction apostrophes (e.g. CAN'T, DON'T)
  title = title
    .replace(/[【】《》「」『』"“”]/g, ' ')
    .replace(/(?:^|\s)['‘’]|['‘’](?:\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Extract clean Latin Title for bilingual titles like "클락션 (Klaxon)"
  let titleLatin = extractedLatinTitle;
  if (!titleLatin) {
    const latinTitleMatches = title.match(/[A-Za-z0-9\s'-]+/g);
    titleLatin = latinTitleMatches ? latinTitleMatches.join(' ').replace(/\s+/g, ' ').trim() : '';
    if (titleLatin.length < 2) titleLatin = '';
  }

  // Clean artist
  artist = stripTagsAndParens(artist);
  artist = artist
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/\s*VEVO$/i, '')
    .replace(/[【】《》「」『』'\"“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  artist = artist.replace(/[\s\-_:–—|丨]+$/, '').replace(/^[\s\-_:–—|丨]+/, '').trim();

  // Dynamically extract Latin and Korean artist representations without hardcoded dictionaries
  const artistLatin = (artist.match(/[A-Za-z0-9&/.-]+/g) || []).join(' ').replace(/\s+/g, ' ').trim();
  const artistHangul = (artist.match(/[\uac00-\ud7af\u1100-\u11ff]+/g) || []).join(' ').replace(/\s+/g, ' ').trim();

  return {
    title,
    artist,
    artistLatin: artistLatin.length >= 2 ? artistLatin : '',
    artistHangul: artistHangul.length >= 2 ? artistHangul : '',
    nativeTitle,
    nativeArtist,
    titleLatin
  };
}

function isCreditOrHeaderLine(text, time, titleHints = []) {
  if (!text) return true;
  if (time > 45) return false;

  const t = text.trim();
  // Filter "Title - Artist" header lines that QQ/Kugou/NetEase inject before the vocals
  if (/\s[-–—]\s/.test(t) && t.length < 90) {
    if (time < 12) return true;
  }

  // Universal Credit / Studio Prefix: If string before : or ： matches any music production role
  const colonMatch = t.match(/^([^:：]{1,25})\s*[:：]/);
  if (colonMatch) {
    const prefix = colonMatch[1];
    if (/(?:作词|作曲|编曲|制作|演唱|混音|母带|录音|人声|弦乐|管乐|吉他|贝斯|鼓|和音|和声|和聲|合声|合聲|伴唱|配唱|监制|企划|出品|发行|原唱|翻唱|版权|管理|录音棚|录音室|录音师|混音师|母带师|编辑|工程|小提琴|大提琴|笛子|二胡|古筝|琵琶|钢琴|vocal|mixed|mastered|recorded|producer|arranged|written|composed|lyrics|guitar|bass|drums|piano)/i.test(prefix)) {
      return true;
    }
  }

  // Chinese & Asian credit markers
  const asianCreditRegex = /^(?:作\s*词|作\s*曲|编\s*曲|制\s*作(?:人)?|演\s*唱(?:者)?|混\s*音(?:师|室|工程)?|母\s*带(?:工程|处理|后期|师)?|录\s*音(?:师|室|棚|工程)?|人\s*声(?:录音|编辑|工程)(?:师|室|棚)?|弦\s*乐\s*监\s*制|吉\s*他(?:编写)?|贝\s*斯(?:编写)?|鼓\s*手?|弦\s*乐(?:编写)?|管\s*乐(?:编写)?|和\s*音(?:编写|设计)?|和\s*声(?:编写|设计)?|伴\s*唱|配\s*唱(?:制作人)?|古\s*筝(?:编写)?|二\s*胡|笛\s*子|琵\s*琶|小\s*提\s*琴(?:编写)?|大\s*提\s*琴(?:编写)?|钢\s*琴|监\s*制|企\s*划|出\s*品(?:人)?|发\s*行(?:人|方)?|原\s*唱|翻\s*唱|美\s*工|题\s*字|插\s*画|视\s*频|动\s*态|文\s*案|统\s*筹|词|曲|OP|SP)\s*[:：]/i;
  if (asianCreditRegex.test(t)) return true;

  // Korean credit markers
  const koreanCreditRegex = /^(?:작\s*사|작\s*곡|편\s*곡|프\s*로\s*듀\s*서|기\s*획|노\s*래|보\s*컬|코\s*러\s*스|믹\s*싱|마\s*스\s*터\s*링)\s*[:：]/i;
  if (koreanCreditRegex.test(t)) return true;

  // English & Studio credit markers
  const enCreditRegex = /^(?:(?:(?:original|sub|co)[- ]\s*)?publishers?|written\s*by|composed\s*by|arranged\s*by|produced\s*by|lyrics\s*by|music\s*by|mixed\s*by|mastered\s*by|vocals?\s*by|background\s*vocals?(?:\s*by)?|all\s*instrumentals?(?:\s*by)?|(?:acoustic\s*|electric\s*)?guitars?(?:\s*by)?|bass(?:\s*by)?|drums?(?:\s*by)?|strings?(?:\s*by)?|keys?(?:\s*by)?|synthesizer(?:\s*by)?|piano(?:\s*by)?|recorded\s*by|recording\s*studios?|mixing\s*studios?|vocal\s*(?:directed|director|editing|edite?|editor|engineer|production|producer|coach|design)(?:\s*by)?|digital\s*editing\s*by|digital\s*edit(?:ed|ing)\s*by|engineered\s*by|keyboard|executive\s*producers?)\b\s*[:：]?/i;
  if (enCreditRegex.test(t)) return true;

  // Kugou/NetEase/QQ LRC software artifacts
  if (/^(?:qq|lrc|by|hash|sign|offset|ti|ar|al)\s*[:：]/i.test(t)) return true;

  return false;
}

function buildSearchCandidates(title, artist, nativeTitle, nativeArtist, artistLatin, artistHangul, titleLatin) {
  const candidates = [];

  const mainLatin = artistLatin || (artist.match(/[A-Za-z0-9\s/&.-]+/g) || []).join(' ').trim();
  const mainAsian = artistHangul || nativeArtist || (artist.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g) || []).join(' ').trim();

  const titleAsian = nativeTitle || (title.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g) || []).join('').trim();
  const mainTitleLatin = titleLatin || (title.match(/[A-Za-z0-9\s/&.-]+/g) || []).join(' ').trim();

  // 1. Exact get candidates
  if (mainTitleLatin && mainLatin) candidates.push({ type: 'get', track: mainTitleLatin, artist: mainLatin });
  if (title && mainLatin) candidates.push({ type: 'get', track: title, artist: mainLatin });
  if (titleAsian && mainLatin) candidates.push({ type: 'get', track: titleAsian, artist: mainLatin });
  if (titleAsian && mainAsian) candidates.push({ type: 'get', track: titleAsian, artist: mainAsian });
  if (title && artist) candidates.push({ type: 'get', track: title, artist: artist });

  // 2. Search queries
  if (mainLatin && mainTitleLatin) candidates.push({ type: 'search', q: `${mainLatin} ${mainTitleLatin}` });
  if (mainLatin && title) candidates.push({ type: 'search', q: `${mainLatin} ${title}` });
  if (titleAsian && mainLatin) candidates.push({ type: 'search', q: `${titleAsian} ${mainLatin}` });
  if (titleAsian && mainAsian) candidates.push({ type: 'search', q: `${titleAsian} ${mainAsian}` });
  if (title && artist) candidates.push({ type: 'search', q: `${title} ${artist}` });
  if (mainTitleLatin) candidates.push({ type: 'search', q: mainTitleLatin });
  if (titleAsian) candidates.push({ type: 'search', q: titleAsian });
  if (title) candidates.push({ type: 'search', q: title });

  return candidates;
}

function pickBestLyrics(items, targetDuration, targetArtist, targetTitle = '', isMv = false) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const valid = items.filter(x => x && (x.syncedLyrics || x.plainLyrics));
  if (valid.length === 0) return null;

  const cleanTargetArtist = normalizeForCompare(targetArtist);
  const cleanTargetTitle = normalizeForCompare(targetTitle);

  const scored = valid.map(item => {
    let score = 0;
    const itemArtist = normalizeForCompare(item.artistName);
    const itemTrack = normalizeForCompare(item.trackName);

    if (cleanTargetArtist && itemArtist) {
      if (itemArtist.includes(cleanTargetArtist) || cleanTargetArtist.includes(itemArtist)) {
        score += 80;
      } else {
        score -= 300; // Strong penalty: completely different artist!
      }
    }

    if (cleanTargetTitle && itemTrack) {
      if (itemTrack.includes(cleanTargetTitle) || cleanTargetTitle.includes(itemTrack)) {
        score += 100;
      } else {
        score -= 120;
      }
    }

    if (item.syncedLyrics) score += 50;
    if (!item.instrumental) score += 20;

    if (targetDuration && targetDuration > 0 && item.duration) {
      const diff = Math.abs(item.duration - targetDuration);
      if (diff <= 2) {
        score += 100;
      } else if (diff <= 4) {
        score += 60;
      } else if (diff <= 8) {
        score += 20;
      } else if (isMv && item.duration < targetDuration && (targetDuration - item.duration) <= 90) {
        score += 45;
      } else if (!isMv && diff > 8) {
        score -= 250;
      }
    }

    score = applyVersionMismatchPenalty(score, item.trackName, targetTitle);

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 30) {
    return null;
  }
  if (!isMv && targetDuration > 0 && best.item?.duration && Math.abs(best.item.duration - targetDuration) > 12) {
    return null;
  }
  return best.item;
}

async function searchNetEaseLyrics(title, artist, targetDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv) {
  const simpTitle = toSimplifiedChinese(title);
  const simpArtist = toSimplifiedChinese(artist);
  const simpNativeTitle = toSimplifiedChinese(nativeTitle);

  const queries = [
    simpArtist && simpTitle ? `${simpArtist} ${simpTitle}` : null,
    artistLatin && title ? `${artistLatin} ${title}` : null,
    artistHangul && nativeTitle ? `${artistHangul} ${nativeTitle}` : null,
    artistHangul && title ? `${artistHangul} ${title}` : null,
    nativeTitle && artist ? `${artist} ${nativeTitle}` : null,
    simpNativeTitle && simpArtist ? `${simpArtist} ${simpNativeTitle}` : null,
    titleLatin && artistLatin ? `${artistLatin} ${titleLatin}` : null,
    simpTitle ? simpTitle : null,
    nativeTitle ? nativeTitle : null,
    `${artist} ${title}`,
    title
  ].filter(Boolean);

  const uniqueQueries = Array.from(new Set(queries)).slice(0, 3);
  for (const q of uniqueQueries) {
    try {
      const neSearchUrl = `https://music.163.com/api/search/get?s=${encodeURIComponent(q)}&type=1&limit=8`;
      const neRes = await axios.get(neSearchUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 2000
      });
      const songs = neRes.data?.result?.songs || [];
      if (!songs.length) continue;

      const scored = songs.map(song => {
        let score = 0;
        const durSec = Math.round((song.duration || 0) / 1000);
        const name = (song.name || '').toLowerCase();
        const artistName = (song.artists?.[0]?.name || '').toLowerCase();
        const cleanTargetArtist = (artist || '').toLowerCase();

        if (/cover|翻唱|伴奏|instrumental|dj版|karaoke/i.test(name)) score -= 80;
        if (/remix|热爱版|改编/i.test(name) && !/remix|热爱版|改编/i.test(title)) score -= 50;
        if (/live|现场|演唱会/i.test(name) && !/live/i.test(title)) score -= 30;

        const normSinger = normalizeForCompare(artistName);
        const normTarget = normalizeForCompare(artist);
        const normLatin = normalizeForCompare(artistLatin);
        const normHangul = normalizeForCompare(artistHangul);
        const isArtistMatch = Boolean(
          (normSinger && normTarget && (normSinger.includes(normTarget) || normTarget.includes(normSinger))) ||
          (normSinger && normLatin && (normSinger.includes(normLatin) || normLatin.includes(normSinger))) ||
          (normSinger && normHangul && (normSinger.includes(normHangul) || normHangul.includes(normSinger))) ||
          (normSinger && normLatin && normLatin.replace(/^g/, '') && normSinger.includes(normLatin.replace(/^g/, '')))
        );

        if (isArtistMatch) {
          score += 70;
        } else if (cleanTargetArtist && !isArtistMatch) {
          score -= 150;
        }

        const normSongName = normalizeForCompare(name);
        const normTargetTitle = normalizeForCompare(title);
        const normTitleLatin = normalizeForCompare(titleLatin);
        const normNativeTitle = normalizeForCompare(nativeTitle);

        const isTitleMatch = Boolean(
          (normSongName && normTargetTitle && (normSongName.includes(normTargetTitle) || normTargetTitle.includes(normSongName))) ||
          (normSongName && normTitleLatin && (normSongName.includes(normTitleLatin) || normTitleLatin.includes(normSongName))) ||
          (normSongName && normNativeTitle && (normSongName.includes(normNativeTitle) || normNativeTitle.includes(normSongName)))
        );

        if (isTitleMatch) {
          score += 100;
        } else {
          score -= 150;
        }

        if (targetDuration > 0 && durSec > 0) {
          const diff = Math.abs(durSec - targetDuration);
          if (diff <= 2) score += 100;
          else if (diff <= 4) score += 60;
          else if (diff <= 8) score += 20;
          else if (isMv && durSec < targetDuration && (targetDuration - durSec) <= 90) score += 45;
          else if (!isMv && diff > 8) score -= 250;

          // Anti TV-Size Guard: If target is full song (>130s), reject short TV-size versions (<110s)
          if (targetDuration > 130 && durSec < 110) {
            score -= 500;
          }
          if (/tv\s*(?:size|ver|version|edit)|anime\s*ver|short\s*ver/i.test(name) && !/tv\s*(?:size|ver)|short/i.test(title)) {
            score -= 500;
          }
        }

        score = applyVersionMismatchPenalty(score, name, title);

        return { song, durSec, score, isTitleMatch };
      });

      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (best && best.song?.id && best.score >= 50 && best.isTitleMatch) {
        const neLyrUrl = `https://music.163.com/api/song/lyric?os=pc&id=${best.song.id}&lv=-1&kv=-1&tv=-1&yv=-1`;
        const neLyrRes = await axios.get(neLyrUrl, { timeout: 3500 });

        // 1. Check for NetEase YRC (syllable-level precision) format first
        const yrcLyric = neLyrRes.data?.yrc?.lyric;
        if (yrcLyric && typeof yrcLyric === 'string' && yrcLyric.includes('[') && !/暂无歌词|纯音乐|没有填词/i.test(yrcLyric)) {
          const yrcParsed = parseNetEaseYrc(yrcLyric);
          if (yrcParsed && yrcParsed.length > 0) {
            const syncedLrc = yrcParsed.map(it => {
              const m = Math.floor(it.time / 60);
              const s = (it.time % 60).toFixed(2);
              return `[${String(m).padStart(2, '0')}:${String(s).padStart(5, '0')}] ${it.text}`;
            }).join('\n');
            return {
              id: `ne_${best.song.id}`,
              sourceName: 'NetEase YRC (Syllable Sync)',
              trackName: best.song.name || title,
              artistName: best.song.artists?.[0]?.name || artistLatin || artist,
              duration: best.durSec,
              syncedLyrics: syncedLrc,
              parsedLyrics: yrcParsed,
              hasWordSync: true
            };
          }
        }

        // 2. Standard LRC fallback
        const rawLrc = neLyrRes.data?.lrc?.lyric;
        if (rawLrc && typeof rawLrc === 'string' && rawLrc.includes('[') && !/暂无歌词|纯音乐|没有填词/i.test(rawLrc)) {
          return {
            id: `ne_${best.song.id}`,
            sourceName: 'NetEase Music',
            trackName: best.song.name || title,
            artistName: best.song.artists?.[0]?.name || artistLatin || artist,
            duration: best.durSec,
            syncedLyrics: rawLrc
          };
        }
      }
    } catch (e) {}
  }
  return null;
}

function parseNetEaseYrc(yrcText) {
  if (!yrcText || typeof yrcText !== 'string') return null;
  const lines = yrcText.split('\n');
  const parsedItems = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const lineMatch = trimmed.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!lineMatch) continue;
    const lineStartMs = parseInt(lineMatch[1], 10);
    const lineDurMs = parseInt(lineMatch[2], 10);
    const payload = lineMatch[3];

    const wordRegex = /\((\d+),(\d+),\d+\)([^(]+)/g;
    const words = [];
    let wMatch;
    let fullText = '';

    while ((wMatch = wordRegex.exec(payload)) !== null) {
      const wStartMs = parseInt(wMatch[1], 10);
      const wDurMs = parseInt(wMatch[2], 10);
      const rawWord = wMatch[3] || '';
      fullText += rawWord;
      const trailingSpace = /\s+$/.test(rawWord);
      const wText = rawWord.trim();
      if (wText) {
        words.push({
          text: wText,
          begin: parseFloat((wStartMs / 1000).toFixed(3)),
          end: parseFloat(((wStartMs + wDurMs) / 1000).toFixed(3)),
          trailingSpace
        });
      }
    }

    const cleanLineText = fullText.trim() || payload.replace(/\(\d+,\d+,\d+\)/g, '').trim();
    if (cleanLineText) {
      parsedItems.push({
        time: parseFloat((lineStartMs / 1000).toFixed(3)),
        endTime: parseFloat(((lineStartMs + lineDurMs) / 1000).toFixed(3)),
        text: cleanLineText,
        words: words.length > 0 ? words : null
      });
    }
  }
  return parsedItems.length > 0 ? parsedItems : null;
}

async function searchKugouLyrics(title, artist, targetDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv) {
  const simpTitle = toSimplifiedChinese(title);
  const simpArtist = toSimplifiedChinese(artist);
  const simpNativeTitle = toSimplifiedChinese(nativeTitle);

  const queries = [
    simpArtist && simpTitle ? `${simpArtist} ${simpTitle}` : null,
    artistLatin && title ? `${artistLatin} ${title}` : null,
    artistHangul && nativeTitle ? `${artistHangul} ${nativeTitle}` : null,
    artistHangul && title ? `${artistHangul} ${title}` : null,
    nativeTitle && artist ? `${artist} ${nativeTitle}` : null,
    simpNativeTitle && simpArtist ? `${simpArtist} ${simpNativeTitle}` : null,
    titleLatin && artistLatin ? `${artistLatin} ${titleLatin}` : null,
    simpTitle ? simpTitle : null,
    nativeTitle ? nativeTitle : null,
    `${artist} ${title}`,
    title
  ].filter(Boolean);

  const uniqueQueries = Array.from(new Set(queries)).slice(0, 3);
  for (const q of uniqueQueries) {
    try {
      const kgSearchUrl = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(q)}&page=1&pagesize=8`;
      const kgRes = await axios.get(kgSearchUrl, { timeout: 2000 });
      const songs = kgRes.data?.data?.info || [];
      if (!songs.length) continue;

      const scoredSongs = songs.map(s => {
        let score = 0;
        const dur = parseInt(s.duration, 10) || 0;
        const sName = (s.songname || '').toLowerCase();
        const sSinger = (s.singername || '').toLowerCase();
        const cleanArtist = (artist || '').toLowerCase();

        if (/cover|翻唱|伴奏|instrumental|dj版|karaoke/i.test(sName)) score -= 80;
        if (/remix/i.test(sName) && !/remix/i.test(title)) score -= 50;
        if (/live|现场|演唱会/i.test(sName) && !/live/i.test(title)) score -= 30;

        const normSinger = normalizeForCompare(sSinger);
        const normTarget = normalizeForCompare(artist);
        const normLatin = normalizeForCompare(artistLatin);
        const normHangul = normalizeForCompare(artistHangul);
        const isArtistMatch = Boolean(
          (normSinger && normTarget && (normSinger.includes(normTarget) || normTarget.includes(normSinger))) ||
          (normSinger && normLatin && (normSinger.includes(normLatin) || normLatin.includes(normSinger))) ||
          (normSinger && normHangul && (normSinger.includes(normHangul) || normHangul.includes(normSinger))) ||
          (normSinger && normLatin && normLatin.replace(/^g/, '') && normSinger.includes(normLatin.replace(/^g/, '')))
        );

        if (isArtistMatch) {
          score += 70;
        } else if (cleanArtist && !isArtistMatch) {
          score -= 150; // Heavy penalty: never accept a song by a different artist!
        }

        const normSongName = normalizeForCompare(sName);
        const normTargetTitle = normalizeForCompare(title);
        const normTitleLatin = normalizeForCompare(titleLatin);
        const normNativeTitle = normalizeForCompare(nativeTitle);

        const isTitleMatch = Boolean(
          (normSongName && normTargetTitle && (normSongName.includes(normTargetTitle) || normTargetTitle.includes(normSongName))) ||
          (normSongName && normTitleLatin && (normSongName.includes(normTitleLatin) || normTitleLatin.includes(normSongName))) ||
          (normSongName && normNativeTitle && (normSongName.includes(normNativeTitle) || normNativeTitle.includes(normSongName)))
        );

        if (isTitleMatch) {
          score += 100;
        } else {
          score -= 150;
        }

        if (targetDuration > 0 && dur > 0) {
          const diff = Math.abs(dur - targetDuration);
          if (diff <= 2) score += 100;
          else if (diff <= 4) score += 60;
          else if (diff <= 8) score += 20;
          else if (isMv && dur < targetDuration && (targetDuration - dur) <= 90) score += 45;
          else if (!isMv && diff > 8) score -= 250;

          // Anti TV-Size Guard: If target is full song (>130s), reject short TV-size versions (<110s)
          if (targetDuration > 130 && dur < 110) {
            score -= 500;
          }
          if (/tv\s*(?:size|ver|version|edit)|anime\s*ver|short\s*ver/i.test(sName) && !/tv\s*(?:size|ver)|short/i.test(title)) {
            score -= 500;
          }
        }

        score = applyVersionMismatchPenalty(score, sName, title);

        return { song: s, score, isTitleMatch };
      });

      scoredSongs.sort((a, b) => b.score - a.score);

      for (const { song, score, isTitleMatch } of scoredSongs.slice(0, 3)) {
        if (!song.hash || score < 50 || !isTitleMatch) continue;
        const candUrl = `http://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=&hash=${song.hash}`;
        const candRes = await axios.get(candUrl, { timeout: 3500 });
        const cands = candRes.data?.candidates || [];
        if (!cands.length) continue;

        cands.sort((a, b) => {
          const durA = Math.round((a.duration || 0) / 1000);
          const durB = Math.round((b.duration || 0) / 1000);
          const diffA = targetDuration > 0 && durA > 0 ? Math.abs(durA - targetDuration) : 0;
          const diffB = targetDuration > 0 && durB > 0 ? Math.abs(durB - targetDuration) : 0;
          const scoreA = (a.score || 0) - diffA * 5;
          const scoreB = (b.score || 0) - diffB * 5;
          return scoreB - scoreA;
        });

        const bestCand = cands[0];
        const dlUrl = `http://krcs.kugou.com/download?ver=1&client=mobi&id=${bestCand.id}&accesskey=${bestCand.accesskey}&fmt=lrc&charset=utf8`;
        const dlRes = await axios.get(dlUrl, { timeout: 3500 });
        if (dlRes.data?.content) {
          const decodedLrc = Buffer.from(dlRes.data.content, 'base64').toString('utf8');
          if (decodedLrc.includes('[')) {
            return {
              id: `kg_${bestCand.id}`,
              sourceName: 'Kugou Music',
              trackName: song.songname || title,
              artistName: song.singername || artistLatin || artist,
              duration: song.duration,
              adjustOffsetMs: 0,
              syncedLyrics: decodedLrc
            };
          }
        }
      }
    } catch (e) {}
  }
  return null;
}

async function searchQQMusicLyrics(title, artist, targetDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv) {
  const simpTitle = toSimplifiedChinese(title);
  const simpArtist = toSimplifiedChinese(artist);
  const simpNativeTitle = toSimplifiedChinese(nativeTitle);

  const queries = [
    simpArtist && simpTitle ? `${simpArtist} ${simpTitle}` : null,
    artistLatin && title ? `${artistLatin} ${title}` : null,
    artistHangul && nativeTitle ? `${artistHangul} ${nativeTitle}` : null,
    artistHangul && title ? `${artistHangul} ${title}` : null,
    nativeTitle && artist ? `${artist} ${nativeTitle}` : null,
    simpNativeTitle && simpArtist ? `${simpArtist} ${simpNativeTitle}` : null,
    titleLatin && artistLatin ? `${artistLatin} ${titleLatin}` : null,
    simpTitle ? simpTitle : null,
    nativeTitle ? nativeTitle : null,
    `${artist} ${title}`,
    title
  ].filter(Boolean);

  const uniqueQueries = Array.from(new Set(queries)).slice(0, 3);
  for (const q of uniqueQueries) {
    try {
      const qqSearchUrl = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=8&w=${encodeURIComponent(q)}&format=json`;
      const qqRes = await axios.get(qqSearchUrl, {
        headers: { 'Referer': 'https://y.qq.com', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 2000
      });
      const songList = qqRes.data?.data?.song?.list || [];
      if (!songList.length) continue;

      const scored = songList.map(s => {
        let score = 0;
        const dur = s.interval || 0;
        const sName = (s.songname || '').toLowerCase();
        const sSinger = (s.singer?.map(si => si.name).join(' ') || '').toLowerCase();
        const cleanArtist = (artist || '').toLowerCase();

        if (/cover|翻唱|伴奏|instrumental|dj版|karaoke/i.test(sName)) score -= 80;
        if (/remix/i.test(sName) && !/remix/i.test(title)) score -= 50;
        if (/live|现场|演唱会/i.test(sName) && !/live/i.test(title)) score -= 30;

        const normSinger = normalizeForCompare(sSinger);
        const normTarget = normalizeForCompare(artist);
        const normLatin = normalizeForCompare(artistLatin);
        const normHangul = normalizeForCompare(artistHangul);
        const isArtistMatch = Boolean(
          (normSinger && normTarget && (normSinger.includes(normTarget) || normTarget.includes(normSinger))) ||
          (normSinger && normLatin && (normSinger.includes(normLatin) || normLatin.includes(normSinger))) ||
          (normSinger && normHangul && (normSinger.includes(normHangul) || normHangul.includes(normSinger))) ||
          (normSinger && normLatin && normLatin.replace(/^g/, '') && normSinger.includes(normLatin.replace(/^g/, '')))
        );

        if (isArtistMatch) {
          score += 70;
        } else if (cleanArtist && !isArtistMatch) {
          score -= 150; // Heavy penalty: never accept a song by a different artist!
        }

        const normSongName = normalizeForCompare(sName);
        const normTargetTitle = normalizeForCompare(title);
        const normTitleLatin = normalizeForCompare(titleLatin);
        const normNativeTitle = normalizeForCompare(nativeTitle);

        const isTitleMatch = Boolean(
          (normSongName && normTargetTitle && (normSongName.includes(normTargetTitle) || normTargetTitle.includes(normSongName))) ||
          (normSongName && normTitleLatin && (normSongName.includes(normTitleLatin) || normTitleLatin.includes(normSongName))) ||
          (normSongName && normNativeTitle && (normSongName.includes(normNativeTitle) || normNativeTitle.includes(normSongName)))
        );

        if (isTitleMatch) {
          score += 100;
        } else {
          score -= 150;
        }

        if (targetDuration > 0 && dur > 0) {
          const diff = Math.abs(dur - targetDuration);
          if (diff <= 2) score += 100;
          else if (diff <= 4) score += 60;
          else if (diff <= 8) score += 20;
          else if (isMv && dur < targetDuration && (targetDuration - dur) <= 90) score += 45;
          else if (!isMv && diff > 8) score -= 250;

          // Anti TV-Size Guard: If target is full song (>130s), reject short TV-size versions (<110s)
          if (targetDuration > 130 && dur < 110) {
            score -= 500;
          }
          if (/tv\s*(?:size|ver|version|edit)|anime\s*ver|short\s*ver/i.test(sName) && !/tv\s*(?:size|ver)|short/i.test(title)) {
            score -= 500;
          }
        }

        score = applyVersionMismatchPenalty(score, sName, title);

        return { song: s, score, isTitleMatch };
      });

      scored.sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (best && best.song?.songmid && best.score >= 50 && best.isTitleMatch) {
        const lyrUrl = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${best.song.songmid}&format=json&nobase64=1`;
        const lyrRes = await axios.get(lyrUrl, {
          headers: { 'Referer': 'https://y.qq.com', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 3500
        });
        let rawLrc = lyrRes.data?.lyric;
        if (rawLrc && typeof rawLrc === 'string' && rawLrc.includes('[')) {
          rawLrc = rawLrc
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

          return {
            id: `qq_${best.song.songmid}`,
            sourceName: 'QQ Music',
            trackName: best.song.songname || title,
            artistName: best.song.singer?.map(si => si.name).join(' / ') || artistLatin || artist,
            duration: best.song.interval || targetDuration,
            syncedLyrics: rawLrc
          };
        }
      }
    } catch (e) {}
  }
  return null;
}

function generateInterpolatedWords(text, begin, end) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const duration = Math.max(0.1, (end || begin + 3) - begin);

  const isCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(trimmed);
  const tokens = [];

  if (isCjk && !trimmed.includes(' ')) {
    for (const ch of trimmed) {
      tokens.push({ text: ch, trailingSpace: false });
    }
  } else {
    const rawTokens = trimmed.split(/(\s+)/);
    for (let i = 0; i < rawTokens.length; i++) {
      const tok = rawTokens[i];
      if (/^\s+$/.test(tok)) {
        if (tokens.length > 0) tokens[tokens.length - 1].trailingSpace = true;
      } else if (tok) {
        tokens.push({ text: tok, trailingSpace: false });
      }
    }
  }

  if (tokens.length === 0) return null;

  const totalWeight = tokens.reduce((acc, t) => acc + Math.max(1, t.text.length), 0);
  let curTime = begin;

  return tokens.map((token, i) => {
    const weight = Math.max(1, token.text.length);
    const tokenDuration = (weight / totalWeight) * duration;
    const wBegin = curTime;
    const wEnd = (i === tokens.length - 1) ? (end || curTime + tokenDuration) : curTime + tokenDuration;
    curTime = wEnd;

    return {
      text: token.text,
      begin: parseFloat(wBegin.toFixed(3)),
      end: parseFloat(wEnd.toFixed(3)),
      trailingSpace: token.trailingSpace
    };
  });
}

let _braccatoParsers = null;
async function getBraccatoParsers() {
  if (!_braccatoParsers) {
    try {
      _braccatoParsers = await import('@braccato/parsers');
    } catch (e) {
      console.warn('Failed to load @braccato/parsers:', e.message);
    }
  }
  return _braccatoParsers;
}

async function getBraccatoTTMLParser() {
  const p = await getBraccatoParsers();
  return p?.parseTTMLContent || null;
}

function parseLyricsTimeStr(str) {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  if (str.includes(':')) {
    const parts = str.split(':');
    if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(str) || 0;
}

async function parseAppleMusicTTMLAsync(ttmlString, durationSec) {
  if (!ttmlString || typeof ttmlString !== 'string') return null;

  try {
    const parsers = await getBraccatoParsers();
    if (parsers?.parseTTMLContent) {
      const parsed = parsers.parseTTMLContent(ttmlString, {
        songDurationMs: (durationSec || 180) * 1000,
        instrumentalGapMs: 5000
      });
      if (parsed && Array.isArray(parsed.lyrics) && parsed.lyrics.length > 0) {
        // Extract official Apple transliteration if present (<transliteration xml:lang="...-Latn">)
        const translitMap = new Map();
        const transRegex = /<transliteration\s+[^>]*xml:lang="([^"]+)"[^>]*>([\s\S]*?)<\/transliteration>/gi;
        let transBlockMatch;
        let detectedTranslitLang = null;

        while ((transBlockMatch = transRegex.exec(ttmlString)) !== null) {
          const lang = transBlockMatch[1];
          if (lang.includes('Latn')) {
            detectedTranslitLang = lang.split('-')[0];
            const textTagRegex = /<text\s+[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/text>/gi;
            let textMatch;
            while ((textMatch = textTagRegex.exec(transBlockMatch[2])) !== null) {
              const lineKey = textMatch[1];
              const inner = textMatch[2];
              const spanRegex = /<span\s+([\s\S]*?)>([\s\S]*?)<\/span>/gi;
              const romajiWords = [];
              let sm;
              while ((sm = spanRegex.exec(inner)) !== null) {
                const sAttrs = sm[1];
                const bMatch = sAttrs.match(/\bbegin="([^"]+)"/i);
                const eMatch = sAttrs.match(/\bend="([^"]+)"/i);
                if (bMatch && eMatch) {
                  const wText = (sm[2].replace(/<[^>]+>/g, '').trim());
                  if (wText) {
                    romajiWords.push({
                      startTimeMs: Math.round(parseLyricsTimeStr(bMatch[1]) * 1000),
                      durationMs: Math.max(50, Math.round((parseLyricsTimeStr(eMatch[1]) - parseLyricsTimeStr(bMatch[1])) * 1000)),
                      words: /\s+$/.test(sm[2]) ? `${wText} ` : wText
                    });
                  }
                }
              }
              const fullRomajiText = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
              translitMap.set(lineKey, {
                text: fullRomajiText,
                parts: romajiWords.length > 0 ? romajiWords : undefined
              });
            }
            break;
          }
        }

        // Apply transliteration to parsed.lyrics directly & delete any translations
        for (const l of parsed.lyrics) {
          if (l.key && translitMap.has(l.key)) {
            const tr = translitMap.get(l.key);
            l.romanization = tr.text;
            if (tr.parts) l.timedRomanization = tr.parts;
          }
          if (l.romanization && (!l.timedRomanization || l.timedRomanization.length === 0)) {
            try {
              const romanizer = getLyricsRomanizer();
              const lTime = l.startTimeMs / 1000;
              const lEnd = (l.startTimeMs + l.durationMs) / 1000;
              const rWords = romanizer.interpolateLineWords(l.romanization, lTime, lEnd);
              if (rWords && rWords.length > 0) {
                l.timedRomanization = rWords.map(rw => ({
                  startTimeMs: Math.round(rw.begin * 1000),
                  durationMs: Math.max(50, Math.round((rw.end - rw.begin) * 1000)),
                  words: (rw.trailingSpace !== false) ? `${rw.text} ` : rw.text
                }));
              }
            } catch (e) {}
          }
          // Zero machine translation as requested
          delete l.translation;
          delete l.translations;
        }

        const items = parsed.lyrics.filter(l => !l.isInstrumental && l.words).map(item => {
          const time = parseFloat((item.startTimeMs / 1000).toFixed(3));
          const endTime = parseFloat(((item.startTimeMs + item.durationMs) / 1000).toFixed(3));
          let words = [];
          if (Array.isArray(item.parts) && item.parts.length > 0) {
            for (const p of item.parts) {
              const rawText = p.words || '';
              const trimmed = rawText.trim();
              if (!trimmed) {
                if (words.length > 0) words[words.length - 1].trailingSpace = true;
                continue;
              }
              const begin = parseFloat((p.startTimeMs / 1000).toFixed(3));
              const end = parseFloat(((p.startTimeMs + p.durationMs) / 1000).toFixed(3));
              words.push({
                text: trimmed,
                begin,
                end: Math.max(begin + 0.05, end),
                trailingSpace: /\s+$/.test(rawText)
              });
            }
          }
          if (words.length === 0) {
            words = null;
          }

          return {
            time: parseFloat(time.toFixed(3)),
            endTime: parseFloat(endTime.toFixed(3)),
            text: item.words,
            words,
            romaji: item.romanization || null,
            lang: parsed.language || detectedTranslitLang || null
          };
        });

        if (items.length > 0) {
          const lsMatch = ttmlString.match(/leadingSilence="([0-9.]+)"/i);
          const leadingSilence = lsMatch ? (parseFloat(lsMatch[1]) || 0) : 0;
          return {
            leadingSilence,
            items,
            braccatoLyrics: parsed.lyrics,
            lang: parsed.language || detectedTranslitLang || null,
            isWordSynced: Boolean(parsed.isWordSynced)
          };
        }
      }
    }
  } catch (e) {
    console.warn('Braccato TTML parse fallback:', e.message);
  }

  // Synchronous regex fallback
  return parseAppleMusicTTML(ttmlString);
}

async function parseAnyLyricsToBraccato(sourceData, durationSec, title, artist) {
  if (!sourceData) return null;
  const parsers = await getBraccatoParsers();
  const durMs = (durationSec || 180) * 1000;

  // 1. If source already provided braccatoLyrics
  if (Array.isArray(sourceData.braccatoLyrics) && sourceData.braccatoLyrics.length > 0) {
    return {
      lyrics: sourceData.braccatoLyrics,
      lang: sourceData.detectedLang || null,
      isWordSynced: Boolean(sourceData.hasWordSync)
    };
  }

  // 2. If source gave TTML string
  if (sourceData.ttmlString) {
    if (parsers?.parseTTMLContent) {
      const parsed = parsers.parseTTMLContent(sourceData.ttmlString, { songDurationMs: durMs, instrumentalGapMs: 5000 });
      if (parsed && Array.isArray(parsed.lyrics) && parsed.lyrics.length > 0) {
        return {
          lyrics: parsed.lyrics,
          lang: parsed.language || null,
          isWordSynced: Boolean(parsed.isWordSynced)
        };
      }
    }
  }

  // 3. If source gave NetEase YRC parsed items
  if (Array.isArray(sourceData.parsedLyrics) && sourceData.parsedLyrics.length > 0) {
    const braccatoLyrics = sourceData.parsedLyrics.map(it => {
      const startTimeMs = Math.round(it.time * 1000);
      const durationMs = it.endTime ? Math.max(500, Math.round((it.endTime - it.time) * 1000)) : 3500;
      return {
        startTimeMs,
        durationMs,
        words: it.text,
        parts: it.words ? it.words.map(w => ({
          startTimeMs: Math.round(w.begin * 1000),
          durationMs: Math.max(50, Math.round((w.end - w.begin) * 1000)),
          words: (w.trailingSpace !== false) ? `${w.text} ` : w.text
        })) : undefined
      };
    });
    return {
      lyrics: braccatoLyrics,
      lang: null,
      isWordSynced: sourceData.parsedLyrics.some(it => it.words && it.words.length > 0)
    };
  }

  // 4. If source gave syncedLyrics (LRC / QRC / Kugou / LRCLib)
  if (sourceData.syncedLyrics && typeof sourceData.syncedLyrics === 'string') {
    let raw = sourceData.syncedLyrics;
    // Pre-clean inline translation slash: "夜に駆ける / 向夜晚奔去" -> "夜に駆ける"
    raw = raw.split('\n').map(line => {
      if (line.includes('/') && !line.includes('<') && !line.includes('(')) {
        const parts = line.split('/');
        if (parts[0].trim().length > 0 && parts[1].trim().length > 0) {
          return parts[0].trim();
        }
      }
      return line;
    }).join('\n');

    if (parsers) {
      try {
        let parsed = null;
        if (parsers.parseLRC) {
          parsed = parsers.parseLRC(raw, durMs, { instrumentalGapMs: 5000 });
          if (parsers.lrcFixers && Array.isArray(parsed)) {
            parsers.lrcFixers(parsed);
          }
        } else if (parsers.detectParser) {
          parsed = parsers.detectParser(raw).parse(raw, durMs);
        }
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          for (const l of parsed) {
            if (!l.isInstrumental && l.words && (!l.parts || l.parts.length === 0)) {
              try {
                const romanizer = getLyricsRomanizer();
                const lTime = l.startTimeMs / 1000;
                const lEnd = (l.startTimeMs + l.durationMs) / 1000;
                const interpolated = romanizer.interpolateLineWords(l.words, lTime, lEnd);
                if (interpolated && interpolated.length > 0) {
                  l.parts = interpolated.map(w => ({
                    startTimeMs: Math.round(w.begin * 1000),
                    durationMs: Math.max(50, Math.round((w.end - w.begin) * 1000)),
                    words: (w.trailingSpace !== false) ? `${w.text} ` : w.text
                  }));
                }
              } catch (e) {}
            }
          }
          return {
            lyrics: parsed,
            lang: null,
            isWordSynced: true
          };
        }
      } catch (e) {
        console.warn('Braccato parse error for synced lyrics:', e.message);
      }
    }
  }

  // 5. If source gave plainLyrics
  if (sourceData.plainLyrics && typeof sourceData.plainLyrics === 'string') {
    if (parsers?.PlainParser) {
      try {
        const parsed = parsers.PlainParser.parse(sourceData.plainLyrics, durMs);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          return {
            lyrics: parsed,
            lang: null,
            isWordSynced: false
          };
        }
      } catch (e) {}
    }
  }

  return null;
}

function parseAppleMusicTTML(ttmlString) {
  if (!ttmlString || typeof ttmlString !== 'string') return null;

  let leadingSilence = 0;
  const lsMatch = ttmlString.match(/leadingSilence="([0-9.]+)"/i);
  if (lsMatch) leadingSilence = parseFloat(lsMatch[1]) || 0;

  const parseTimeStr = (str) => {
    if (!str) return 0;
    if (str.includes(':')) {
      const parts = str.split(':');
      if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(str) || 0;
  };

  const decodeXml = (s) => (s || '')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");

  // 1. Parse official transliterations (Romaji / Pinyin / Revised Romanization)
  const translitMap = new Map();
  const transRegex = /<transliteration\s+[^>]*xml:lang="([^"]+)"[^>]*>([\s\S]*?)<\/transliteration>/gi;
  let transBlockMatch;
  let detectedTranslitLang = null;

  while ((transBlockMatch = transRegex.exec(ttmlString)) !== null) {
    const lang = transBlockMatch[1];
    if (lang.includes('Latn')) {
      detectedTranslitLang = lang.split('-')[0];
      const textTagRegex = /<text\s+[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/text>/gi;
      let textMatch;
      while ((textMatch = textTagRegex.exec(transBlockMatch[2])) !== null) {
        const lineKey = textMatch[1];
        const inner = textMatch[2];
        const spanRegex = /<span\s+([\s\S]*?)>([\s\S]*?)<\/span>/gi;
        const romajiWords = [];
        let sm;
        while ((sm = spanRegex.exec(inner)) !== null) {
          const sAttrs = sm[1];
          const bMatch = sAttrs.match(/\bbegin="([^"]+)"/i);
          const eMatch = sAttrs.match(/\bend="([^"]+)"/i);
          if (bMatch && eMatch) {
            const wText = decodeXml(sm[2].replace(/<[^>]+>/g, '').trim());
            if (wText) {
              romajiWords.push({
                text: wText,
                begin: parseFloat(parseTimeStr(bMatch[1]).toFixed(3)),
                end: parseFloat(parseTimeStr(eMatch[1]).toFixed(3))
              });
            }
          }
        }
        const fullRomajiText = decodeXml(inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
        translitMap.set(lineKey, {
          text: fullRomajiText,
          words: romajiWords.length > 0 ? romajiWords : null
        });
      }
      break;
    }
  }

  // 2. Parse main lyrics lines (<p> tags)
  const pRegex = /<p\s+([\s\S]*?)>([\s\S]*?)<\/p>/gi;
  const spanRegex = /<span\s+([\s\S]*?)>([\s\S]*?)<\/span>(\s*)/gi;
  const items = [];
  let match;

  while ((match = pRegex.exec(ttmlString)) !== null) {
    const attrStr = match[1];
    const innerContent = match[2];
    const beginMatch = attrStr.match(/\bbegin="([^"]+)"/i);
    const endMatch = attrStr.match(/\bend="([^"]+)"/i);
    if (!beginMatch) continue;

    const time = parseTimeStr(beginMatch[1]);
    const endTime = endMatch ? parseTimeStr(endMatch[1]) : time + 3.0;

    const keyMatch = attrStr.match(/(?:itunes:key|lrc:key)="([^"]+)"/i);
    const lineKey = keyMatch ? keyMatch[1] : null;

    const words = [];
    let sm;
    while ((sm = spanRegex.exec(innerContent)) !== null) {
      const sAttrs = sm[1];
      const bMatch = sAttrs.match(/\bbegin="([^"]+)"/i);
      const eMatch = sAttrs.match(/\bend="([^"]+)"/i);
      if (bMatch && eMatch) {
        const wBegin = parseTimeStr(bMatch[1]);
        const wEnd = parseTimeStr(eMatch[1]);
        const rawSpanText = sm[2].replace(/<[^>]+>/g, '');
        const trailingInSpan = /\s+$/.test(rawSpanText);
        const trailingAfterSpan = Boolean(sm[3] && sm[3].length > 0);
        const wText = decodeXml(rawSpanText.trim());
        if (wText) {
          words.push({
            text: wText,
            begin: parseFloat(wBegin.toFixed(3)),
            end: parseFloat(wEnd.toFixed(3)),
            trailingSpace: trailingInSpan || trailingAfterSpan
          });
        }
      }
    }

    let text = decodeXml(innerContent.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    if (text) {
      const translit = lineKey ? translitMap.get(lineKey) : null;
      let finalWords = (Array.isArray(words) && words.length > 0) ? words : null;
      let finalRomajiWords = (translit?.words && translit.words.length > 0) ? translit.words : null;

      if (!finalWords && text) {
        try {
          const romanizer = getLyricsRomanizer();
          finalWords = romanizer.interpolateLineWords(text, time, endTime);
        } catch (e) {}
      }
      if (translit && translit.text && !finalRomajiWords) {
        try {
          const romanizer = getLyricsRomanizer();
          finalRomajiWords = romanizer.interpolateLineWords(translit.text, time, endTime);
        } catch (e) {}
      }

      items.push({
        time: parseFloat(time.toFixed(2)),
        endTime: parseFloat(endTime.toFixed(2)),
        text,
        words: finalWords,
        romaji: translit ? translit.text : null,
        romajiWords: finalRomajiWords,
        lang: detectedTranslitLang
      });
    }
  }

  return items.length > 0 ? { leadingSilence, items, lang: detectedTranslitLang } : null;
}

function computeTitleSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 1.0;
  if (s1.length < 3 || s2.length < 3) return 0;
  const getBigrams = (str) => {
    const bg = new Set();
    for (let i = 0; i < str.length - 1; i++) bg.add(str.substring(i, i + 2));
    return bg;
  };
  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);
  let inter = 0;
  for (const b of b1) if (b2.has(b)) inter++;
  return (2.0 * inter) / (b1.size + b2.size);
}

async function searchBetterLyrics(title, artist, targetDuration, videoId, artistLatin, artistHangul, titleLatin, nativeTitle, isMv, nativeArtist) {
  const cleanTitle = (title || '').replace(/['"‘’“”]/g, '').trim();
  const cleanArtist = (artist || '').replace(/['"‘’“”]/g, '').replace(/\([0-9]+\)/g, '').trim();
  const simpTitle = toSimplifiedChinese(cleanTitle);
  const simpArtist = toSimplifiedChinese(cleanArtist);

  const hasKana = /[\u3040-\u30ff]/.test(title) || /[\u3040-\u30ff]/.test(artist) || Boolean(nativeTitle && /[\u3040-\u30ff]/.test(nativeTitle)) || Boolean(nativeArtist && /[\u3040-\u30ff]/.test(nativeArtist));
  const hasHangul = /[\uac00-\ud7af]/.test(title) || /[\uac00-\ud7af]/.test(artist) || Boolean(nativeTitle && /[\uac00-\ud7af]/.test(nativeTitle)) || Boolean(nativeArtist && /[\uac00-\ud7af]/.test(nativeArtist)) || Boolean(artistHangul);
  const hasHanzi = /[\u4e00-\u9fff]/.test(title) || /[\u4e00-\u9fff]/.test(artist) || Boolean(nativeTitle && /[\u4e00-\u9fff]/.test(nativeTitle)) || Boolean(nativeArtist && /[\u4e00-\u9fff]/.test(nativeArtist));

  const isJapanese = hasKana || (hasHanzi && !hasHangul && /yoasobi|ado\b|aimyon|kenshi\s*yonezu|yorushika|tuki\b|zutomayo|eve\b|vocaloid|hatsune\s*miku|hololive|lisa\b|king\s*gnu|radwimps|one\s*ok\s*rock|official\s*hige\s*dandism|vaundy|fujii\s*kaze/i.test(`${title} ${artist}`));
  const isKorean = hasHangul || Boolean(artistHangul) || (!hasKana && /newjeans|bts|blackpink|aespa|twice|le\s*sserafim|stray\s*kids|ive|seventeen|itzy|nmixx|gidle|\(g\)i-dle|red\s*velvet|exo|iu\b|taeyeon|jungkook|illit|babymonster|riize|tws|boynextdoor|zerobaseone/i.test(`${title} ${artist}`));
  const isChinese = !isJapanese && hasHanzi;
  const isAsian = isJapanese || isKorean || isChinese;

  // 1. Build Smart Title Variants (Stripping Live, MV, Official Video, and splitting 'Artist - Title')
  const strippedTitle = cleanTitle.replace(/\s*[\(\[\{]?(?:official\s*)?(?:music\s*video|mv|live|concert|the first take|audio|lyrics?|lyric\s*video)[\)\]\}]?\s*/gi, ' ').trim();
  const strippedSimp = simpTitle.replace(/\s*[\(\[\{]?(?:official\s*)?(?:music\s*video|mv|live|concert|the first take|audio|lyrics?|lyric\s*video)[\)\]\}]?\s*/gi, ' ').trim();

  const titleVariants = new Set([cleanTitle]);
  if (strippedTitle) titleVariants.add(strippedTitle);
  if (simpTitle) titleVariants.add(simpTitle);
  if (strippedSimp) titleVariants.add(strippedSimp);
  if (titleLatin) titleVariants.add(titleLatin);
  if (nativeTitle) titleVariants.add(nativeTitle);

  // Extract CJK quotation and title brackets: 『 』, 「 」, 【 】, 《 》
  const bracketMatches = strippedTitle.matchAll(/[『「【《]([^』」】》]+)[』」】》]/g);
  for (const bm of bracketMatches) {
    if (bm[1]) titleVariants.add(bm[1].trim());
  }

  // Extract bilingual paren sub-titles (e.g. "클락션 (Klaxon)" -> "Klaxon", "클락션")
  const biMatch = cleanTitle.match(/^([^(（\[【《]+?)\s*[(（\[【《]([^)）\]】》]+)[)）\]】》]$/);
  if (biMatch) {
    const p1 = biMatch[1].trim();
    const p2 = biMatch[2].trim();
    if (!/official|mv|audio|video|remix|live/i.test(p2)) {
      titleVariants.add(p1);
      titleVariants.add(p2);
    }
  }

  if (cleanTitle.includes(' - ')) {
    const dParts = cleanTitle.split(' - ');
    if (dParts[0]?.trim()) titleVariants.add(dParts[0].trim());
    if (dParts[1]?.trim()) titleVariants.add(dParts[1].trim());
  }

  // Strip apostrophes and punctuation for English/Latin tracks (e.g. "I CAN'T STOP ME" -> "I CANT STOP ME")
  const noApos = cleanTitle.replace(/['"‘’“”]/g, '').trim();
  if (noApos) titleVariants.add(noApos);

  if (/hyur[ui]rapappa/i.test(cleanTitle)) {
    titleVariants.add('HYURURIRAPAPPA');
    titleVariants.add('ひゅるりらぱっぱ');
    titleVariants.add('ひゅるりらぱっぱ - HYURURIRAPAPPA');
  }

  // 2. Build Smart Artist Variants
  const artistVariants = new Set([cleanArtist]);
  const baseArtist = cleanArtist.replace(/\s*-\s*Topic$/i, '').replace(/\s+[0-9]+$/i, '').trim();
  if (baseArtist && baseArtist !== cleanArtist) artistVariants.add(baseArtist);
  if (cleanArtist.includes('&')) {
    cleanArtist.split('&').forEach(p => { if (p.trim()) artistVariants.add(p.trim()); });
  }
  if (simpArtist && simpArtist !== cleanArtist) artistVariants.add(simpArtist);
  if (artistLatin && artistLatin.toLowerCase() !== cleanArtist.toLowerCase()) artistVariants.add(artistLatin);
  if (artistHangul) artistVariants.add(artistHangul);
  if (nativeArtist) artistVariants.add(nativeArtist);

  // Specific Group Aliases (Essential for Apple Music TTML / Better Lyrics Master Catalog)
  if (/g\s*i-?dle|\(g\)i-?dle/i.test(cleanArtist)) {
    artistVariants.add('i-dle');
    artistVariants.add('(G)I-DLE');
    artistVariants.add('GIDLE');
  }
  if (/newjeans/i.test(cleanArtist)) artistVariants.add('NewJeans');
  if (/le\s*sserafim/i.test(cleanArtist)) artistVariants.add('LE SSERAFIM');
  if (/blackpink/i.test(cleanArtist)) {
    artistVariants.add('BLACKPINK');
    if (/불장난|playing\s*with\s*fire/i.test(cleanTitle)) {
      titleVariants.add('PLAYING WITH FIRE');
      titleVariants.add('불장난');
    }
    if (/마지막처럼|as\s*if\s*it(?:'|’)?s\s*your\s*last/i.test(cleanTitle)) {
      titleVariants.add("As If It's Your Last");
      titleVariants.add("마지막처럼");
    }
    if (/붐바야|boombayah/i.test(cleanTitle)) {
      titleVariants.add('BOOMBAYAH');
      titleVariants.add('붐바야');
    }
    if (/휘파람|whistle/i.test(cleanTitle)) {
      titleVariants.add('WHISTLE');
      titleVariants.add('휘파람');
    }
    if (/뚜두뚜두|ddu-du\s*ddu-du/i.test(cleanTitle)) {
      titleVariants.add('DDU-DU DDU-DU');
      titleVariants.add('뚜두뚜두');
    }
    if (/\b(?:solo|you\s*&\s*me|one\s*of\s*the\s*girls|mantra|ruby)\b/i.test(cleanTitle)) {
      artistVariants.add('JENNIE');
      artistVariants.add('Jennie');
    }
    if (/\b(?:lalisa|money|sg|rockstar|new\s*woman|moonlit\s*floor)\b/i.test(cleanTitle)) {
      artistVariants.add('LISA');
      artistVariants.add('Lisa');
    }
    if (/\b(?:on\s*the\s*ground|gone|hard\s*to\s*love|apt|number\s*one\s*girl|toxic\s*till\s*the\s*end)\b/i.test(cleanTitle)) {
      artistVariants.add('ROSÉ');
      artistVariants.add('ROSE');
      artistVariants.add('Rosé');
    }
    if (/\b(?:flower|all\s*eyes\s*on\s*me|꽃)\b/i.test(cleanTitle)) {
      artistVariants.add('JISOO');
      artistVariants.add('Jisoo');
    }
  }

  if (/bts|bangtan/i.test(cleanArtist)) {
    if (/\b(?:seven|standing\s*next\s*to\s*you|3d|left\s*and\s*right|dreamers|stay\s*alive|never\s*let\s*go)\b/i.test(cleanTitle)) {
      artistVariants.add('Jung Kook');
      artistVariants.add('Jungkook');
    }
    if (/\b(?:like\s*crazy|set\s*me\s*free|who|closer\s*than\s*this|filter|lie)\b/i.test(cleanTitle)) {
      artistVariants.add('Jimin');
    }
    if (/\b(?:slow\s*dancing|love\s*me\s*again|rainy\s*days|fri\(end\)s|christmas\s*tree|sweet\s*night|singularity)\b/i.test(cleanTitle)) {
      artistVariants.add('V');
    }
    if (/\b(?:daechwita|haegeum|people|amygdala|polaroid|interlude|eight)\b/i.test(cleanTitle)) {
      artistVariants.add('Agust D');
      artistVariants.add('SUGA');
    }
    if (/\b(?:more|arson|on\s*the\s*street|daydream|chicken\s*noodle\s*soup|hope\s*world)\b/i.test(cleanTitle)) {
      artistVariants.add('j-hope');
    }
    if (/\b(?:wild\s*flower|come\s*back\s*to\s*me|lost|indigo|moonchild|seoul)\b/i.test(cleanTitle)) {
      artistVariants.add('RM');
    }
    if (/\b(?:the\s*astronaut|i\'ll\s*be\s*there|running\s*wild|super\s*tuna|epiphany|moon|awake)\b/i.test(cleanTitle)) {
      artistVariants.add('Jin');
    }
  }

  // Split multiple artists (e.g. "ROSÉ & Bruno Mars" -> "ROSÉ", "Bruno Mars")
  if (cleanArtist.includes('&') || cleanArtist.includes(',')) {
    const parts = cleanArtist.split(/[&,]/).map(p => p.trim()).filter(p => p.length >= 2);
    for (const p of parts) artistVariants.add(p);
  }

  // 2.5 Bridge to Apple Music Master Catalog via iTunes Search (Only when Asian, bracketed, or multi-artist)
  let appleTrack = null;
  let appleArtist = null;
  let appleDur = 0;
  const needsAppleBridge = isAsian || /[(（\[【《]/.test(cleanTitle) || cleanArtist.includes('&') || cleanArtist.includes(',');
  if (needsAppleBridge) {
    try {
      const itunesTerm = `${strippedTitle || cleanTitle} ${cleanArtist}`.trim();
      const itunesRes = await axios.get('https://itunes.apple.com/search', {
        params: {
          term: itunesTerm,
          entity: 'song',
          country: isJapanese ? 'JP' : (isKorean ? 'KR' : 'US'),
          limit: 3
        },
        timeout: 1500
      });
      const itHit = (itunesRes.data?.results || []).find(h => {
        if (!h || !h.trackName) return false;
        const hArtist = (h.artistName || '').toLowerCase();
        const qArtist = cleanArtist.toLowerCase();
        const artistMatch = hArtist.includes(qArtist) || qArtist.includes(hArtist) || !cleanArtist;
        const durMatch = !targetDuration || !h.trackTimeMillis || Math.abs(Math.round(h.trackTimeMillis / 1000) - targetDuration) <= 6;
        return artistMatch || durMatch;
      }) || itunesRes.data?.results?.[0];

      if (itHit && itHit.trackName) {
        appleTrack = itHit.trackName;
        appleArtist = itHit.artistName;
        appleDur = itHit.trackTimeMillis ? Math.round(itHit.trackTimeMillis / 1000) : 0;
        if (appleTrack) titleVariants.add(appleTrack);
        if (appleArtist) artistVariants.add(appleArtist);
      }
    } catch (e) {}
  }

  // 3. STAGE 1: Better Lyrics Primary Provider (lyrics-api.binimum.org)
  const binimumQueries = [];
  if (appleTrack && appleArtist) {
    binimumQueries.push({ track: appleTrack, artist: appleArtist });
  }
  for (const t of titleVariants) {
    if (!t || t.length < 2) continue;
    for (const a of artistVariants) {
      if (!a || a.length < 2) continue;
      binimumQueries.push({ track: t, artist: a });
    }
  }
  // Only query without artist if cleanArtist is completely missing
  if (!cleanArtist) {
    for (const t of titleVariants) {
      if (t && t.length >= 2) binimumQueries.push({ track: t, artist: '' });
    }
  }

  // Deduplicate queries - top 4
  const seenBin = new Set();
  const uniqueBinQueries = binimumQueries.filter(q => {
    const k = `${q.track.toLowerCase()}___${q.artist.toLowerCase()}`;
    if (seenBin.has(k)) return false;
    seenBin.add(k);
    return true;
  }).slice(0, 4);

  let ttmlUrl = null;
  let pickedDuration = targetDuration || 180;
  let pickedTrackName = cleanTitle;
  let pickedArtistName = cleanArtist;
  const isLiveExplicit = /\b(?:live|tour|dome|concert|in seoul|in osaka|the show|budokan|stadium|arena tour)\b/i.test(cleanTitle);

  // Run binimum queries concurrently with artist-validated scoring
  if (uniqueBinQueries.length > 0) {
    try {
      const binPromises = uniqueBinQueries.map(async (q) => {
        try {
          const bRes = await axios.get('https://lyrics-api.binimum.org/', {
            params: {
              track: q.track,
              artist: q.artist,
              duration: targetDuration > 0 ? Math.round(targetDuration) : undefined
            },
            timeout: 2500
          });
          return bRes.data?.results || [];
        } catch (e) {
          return [];
        }
      });
      const settled = await Promise.allSettled(binPromises);
      const allHits = [];
      for (const res of settled) {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          for (const h of res.value) {
            if (h && h.lyricsUrl) allHits.push(h);
          }
        }
      }

      if (allHits.length > 0) {
        // Deduplicate by lyricsUrl
        const seenHits = new Set();
        const uniqueHits = allHits.filter(h => {
          if (seenHits.has(h.lyricsUrl)) return false;
          seenHits.add(h.lyricsUrl);
          return true;
        });

        // Score all candidate hits
        const scoredHits = uniqueHits.map(h => {
          let score = 0;
          const normHitArtist = normalizeForCompare(h.artist_name || '');
          const normHitTrack = normalizeForCompare(h.track_name || '');
          const normCleanTitle = normalizeForCompare(cleanTitle);

          // Artist match: check against all artistVariants
          const hasArtistMatch = Array.from(artistVariants).some(a => {
            if (!a) return false;
            const normA = normalizeForCompare(a);
            return normHitArtist.includes(normA) || normA.includes(normHitArtist);
          });

          if (hasArtistMatch) {
            score += 250;
          } else if (cleanArtist) {
            score -= 500;
          }

          // Title match: direct includes or Bigram similarity >= 0.75
          const hitLatin = (h.track_name || '').match(/[A-Za-z0-9]+/g)?.join('')?.toLowerCase() || '';
          const isTitleMatch = normHitTrack.includes(normCleanTitle) || normCleanTitle.includes(normHitTrack) ||
            (hitLatin && computeTitleSimilarity(hitLatin, normCleanTitle) >= 0.75) ||
            computeTitleSimilarity(normHitTrack, normCleanTitle) >= 0.75 ||
            Array.from(titleVariants).some(t => {
              const nt = normalizeForCompare(t);
              if (!nt) return false;
              if (normHitTrack.includes(nt) || nt.includes(normHitTrack)) return true;
              if (hitLatin && computeTitleSimilarity(hitLatin, nt) >= 0.75) return true;
              return computeTitleSimilarity(normHitTrack, nt) >= 0.75;
            });
          if (isTitleMatch) {
            score += 200;
          } else {
            score -= 300;
          }

          // Anti-Live / Concert filter: Never pick live concert tracks over studio originals!
          const isHitLive = /\b(?:live|tour|dome|concert|in seoul|in osaka|special final|the show|budokan|stadium|arena tour)\b/i.test(`${h.album_name || ''} ${h.track_name || ''}`);
          if (isHitLive && !isLiveExplicit) {
            score -= 800;
          } else if (!isHitLive) {
            score += 300;
          }

          // Syllable-level word sync priority
          if (h.timing_type === 'word') {
            score += 500;
          } else if (h.timing_type === 'line') {
            score += 100;
          }

          // Duration proximity
          const rawDur = Number(h.duration) || 0;
          const hDurSec = rawDur > 1000 ? Math.round(rawDur / 1000) : rawDur;
          if (targetDuration > 0 && hDurSec > 0) {
            const diff = Math.abs(hDurSec - targetDuration);
            if (diff <= 3) score += 200;
            else if (diff <= 6) score += 100;
            else score -= diff * 15;
          }

          return { hit: h, score, hDurSec };
        });

        scoredHits.sort((a, b) => b.score - a.score);
        const best = scoredHits[0];
        if (best && best.score > 0 && best.hit.lyricsUrl) {
          ttmlUrl = best.hit.lyricsUrl;
          pickedDuration = best.hDurSec || targetDuration || 180;
          pickedTrackName = best.hit.track_name || cleanTitle;
          pickedArtistName = best.hit.artist_name || cleanArtist;
        }
      }
    } catch (e) {}
  }

  // 4. STAGE 2: Direct lrc.red Search Fallback (Zero Intermediate .json Hop)
  if (!ttmlUrl) {
    const lrcRedQueries = [];
    if (cleanArtist) lrcRedQueries.push(cleanArtist);
    for (const a of artistVariants) {
      if (a && a.length >= 2 && a.toLowerCase() !== cleanArtist.toLowerCase()) {
        lrcRedQueries.push(a);
      }
    }
    for (const t of titleVariants) {
      if (t) {
        lrcRedQueries.push(t);
        if (cleanArtist) lrcRedQueries.push(`${t} ${cleanArtist}`);
      }
    }
    const seenLrc = new Set();
    const uniqueLrc = lrcRedQueries.filter(q => {
      const k = q.toLowerCase();
      if (seenLrc.has(k)) return false;
      seenLrc.add(k);
      return true;
    }).slice(0, 6);

    if (uniqueLrc.length > 0) {
      try {
        const lrcPromises = uniqueLrc.map(async (q) => {
          try {
            const sRes = await axios.get('https://lrc.red/search.json', {
              params: { q },
              headers: { 'User-Agent': 'AuraSound/4.14 (support@aurasound.app)' },
              timeout: 2000
            });
            return sRes.data?.hits || [];
          } catch (e) {
            return [];
          }
        });
        const lrcSettled = await Promise.allSettled(lrcPromises);
        const allLrcHits = [];
        for (const res of lrcSettled) {
          if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            for (const h of res.value) {
              if (h && h.isrc) allLrcHits.push(h);
            }
          }
        }
        if (allLrcHits.length > 0) {
          const scoredLrc = allLrcHits.map(h => {
            let score = 0;
            const normHitTitle = normalizeForCompare(h.title || '');
            const normCleanTitle = normalizeForCompare(cleanTitle);

            // Title match: direct includes or Bigram similarity >= 0.75
            const hitLatin = (h.title || '').match(/[A-Za-z0-9]+/g)?.join('')?.toLowerCase() || '';
            const isTitleMatch = normHitTitle.includes(normCleanTitle) || normCleanTitle.includes(normHitTitle) ||
              (hitLatin && computeTitleSimilarity(hitLatin, normCleanTitle) >= 0.75) ||
              computeTitleSimilarity(normHitTitle, normCleanTitle) >= 0.75 ||
              Array.from(titleVariants).some(t => {
                const nt = normalizeForCompare(t);
                if (!nt) return false;
                if (normHitTitle.includes(nt) || nt.includes(normHitTitle)) return true;
                if (hitLatin && computeTitleSimilarity(hitLatin, nt) >= 0.75) return true;
                return computeTitleSimilarity(normHitTitle, nt) >= 0.75;
              });

            if (!isTitleMatch) return { hit: h, score: -1000 };
            score += 500;

            const isHitLive = /\b(?:live|tour|dome|concert|the show|budokan|special final)\b/i.test(`${h.album || ''} ${h.title || ''}`);
            if (isHitLive && !isLiveExplicit) score -= 800;
            else if (!isHitLive) score += 200;

            if (targetDuration > 0 && h.duration > 0) {
              const diff = Math.abs(h.duration - targetDuration);
              if (diff <= 4) score += 200;
              else if (diff <= 8) score += 100;
              else score -= diff * 15;
            }
            return { hit: h, score };
          }).filter(s => s.score > 0);

          scoredLrc.sort((a, b) => b.score - a.score);
          const bestLrc = scoredLrc[0]?.hit;
          if (bestLrc) {
            ttmlUrl = `https://lrc.red/s/${bestLrc.isrc}.ttml`;
            pickedDuration = bestLrc.duration || targetDuration;
            pickedTrackName = bestLrc.title || cleanTitle;
            pickedArtistName = bestLrc.artist || cleanArtist;
          }
        }
      } catch (e) {}
    }
  }

  // 5. Fetch & Parse Apple Music TTML with Millisecond Syllable Precision
  if (ttmlUrl) {
    try {
      const ttmlRes = await axios.get(ttmlUrl, {
        headers: { 'User-Agent': 'AuraSound/4.14 (support@aurasound.app)' },
        timeout: 3200
      });

      // Anti-English-Dub TTML Validation:
      // If song is Asian, but TTML declares xml:lang="en" and contains zero Asian characters, reject!
      const isEn = /xml:lang="en"/i.test(ttmlRes.data);
      const hasAsianChars = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(ttmlRes.data);
      if (isAsian && isEn && !hasAsianChars) {
        // Dub rejected
      } else {
        const parsed = await parseAppleMusicTTMLAsync(ttmlRes.data, pickedDuration || targetDuration);
        if (parsed && parsed.items && parsed.items.length > 0) {
          const syncedLrc = parsed.items.map(it => {
            const m = Math.floor(it.time / 60);
            const s = (it.time % 60).toFixed(2);
            return `[${String(m).padStart(2, '0')}:${String(s).padStart(5, '0')}] ${it.text}`;
          }).join('\n');

          return {
            id: `bl_${ttmlUrl.split('/').pop().replace(/\.ttml$/i, '')}`,
            sourceName: 'Better Lyrics (Apple Music TTML)',
            trackName: pickedTrackName,
            artistName: pickedArtistName,
            duration: Math.round(pickedDuration || targetDuration),
            leadingSilence: parsed.leadingSilence || 0,
            parsedLyrics: parsed.items,
            braccatoLyrics: parsed.braccatoLyrics || null,
            syncedLyrics: syncedLrc,
            hasWordSync: parsed.items.some(it => it.words && it.words.length > 0),
            detectedLang: parsed.lang
          };
        }
      }
    } catch (e) {
      console.warn('Better Lyrics TTML fetch/parse error:', e.message);
    }
  }

  // Tier 3: api.betterlyrics.org fallback for cache hits
  try {
    const params = { s: cleanTitle };
    if (cleanArtist) params.a = cleanArtist;
    if (targetDuration > 0) params.d = Math.round(targetDuration);
    if (videoId) params.v = videoId;

    const blRes = await axios.get('https://api.betterlyrics.org/getLyrics', {
      params,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://music.youtube.com'
      },
      timeout: 2500
    });

    if (blRes.data && blRes.data.ttml) {
      const parsed = await parseAppleMusicTTMLAsync(blRes.data.ttml, targetDuration);
      if (parsed && parsed.items && parsed.items.length > 0) {
        const syncedLrc = parsed.items.map(it => {
          const m = Math.floor(it.time / 60);
          const s = (it.time % 60).toFixed(2);
          return `[${String(m).padStart(2, '0')}:${String(s).padStart(5, '0')}] ${it.text}`;
        }).join('\n');

        return {
          id: `bl_${Date.now()}`,
          sourceName: 'Better Lyrics (Apple Music TTML)',
          trackName: cleanTitle,
          artistName: cleanArtist,
          duration: targetDuration,
          leadingSilence: parsed.leadingSilence || 0,
          parsedLyrics: parsed.items,
          syncedLyrics: syncedLrc,
          hasWordSync: parsed.items.some(it => it.words && it.words.length > 0),
          detectedLang: parsed.lang
        };
      }
    }
  } catch (e) {}

  return null;
}

// High-precision Verified MV Intro Offset Dictionary (0ms Ground Truth)
const KNOWN_MV_OFFSETS = {
  // Jennie / BLACKPINK Solo
  'b73BI9eUkjM': 4.907, // JENNIE - SOLO Official MV (vocal at 7.38s, TTML at 2.47s -> offset +4.91s)

  // NewJeans
  'ArmDp-zijuc': 0,   // Super Shy (starts 0:00, outro challenge at 1:44)
  'jOTfBlKSQYY': 0,   // ETA (starts 0:00, FaceTime outro at 2:32)
  'js1CtxSY38I': 0,   // Hype Boy (starts 0:00)
  '_ZAgIHmHLdc': 38,  // OMG (hospital monologue intro)
  'pSUydWEqKwE': 40,  // Ditto Side A (camcorder school intro)
  'V37TaRdVUQY': 40,  // Ditto Side B
  'legxOmunZZ8': 25,  // Cool With You
  '11cta61Wi0g': 0,   // How Sweet (starts 0:00)

  // ILLIT
  'Vk5-c_v4gMU': 28,  // Magnetic (bedroom house intro)
  '9fZxM2lJ3gA': 0,   // Cherish (My Love)

  // (G)I-DLE
  'rTKqSmX9XhQ': 11,  // Klaxon (desert convertible car stalled)
  'oxZzG_vyMRU': 14,  // Queencard (mirror / plastic surgery intro)
  'fCO7f0SmrDc': 12,  // Nxde (black & white film reel intro)
  'Jh4QBu445Vg': 10,  // TOMBOY (car crash intro)
  'b89Un3Q0wU4': 0,   // Super Lady (starts 0:00)

  // aespa
  'phuiiNCxRMg': 14,  // Supernova (falling from sky into car)
  'D8VEhcPeSlc': 16,  // Drama (alleyway combat intro)
  'm4_9wy44cG4': 18,  // Armageddon (crater apocalypse intro)
  'wpGvA1v5gY8': 12,  // Spicy (mansion intro)
  '4TWR90KJl84': 0,   // Next Level (starts 0:00)
  'ZeerrnuLi5E': 0,   // Black Mamba (starts 0:00)
  'HehHEBshX6w': 0,   // Whiplash (starts 0:00)

  // Jung Kook & BTS
  'QU9c0053UAU': 43,  // Jung Kook - Seven (restaurant fight drama)
  'UNo0FET9714': 0,   // Jung Kook - 3D (starts 0:00)
  'gdZLi9oWNZg': 0,   // BTS - Dynamite (starts 0:00)
  'WMweEpGlu_U': 0,   // BTS - Butter (starts 0:00)
  'XsX3ATc3FbA': 7,   // BTS - Boy With Luv (ticket booth intro)
  'gwMa6gpoE9I': 0,   // BTS - Life Goes On
  '7C2z4GqqS5E': 0,   // BTS - Fake Love
  'MBdVXkSdhwU': 0,   // BTS - DNA

  // LE SSERAFIM
  'bNKXxwOQ48Y': 20,  // EASY (cathedral walk intro)
  'hLvWy2b877A': 28,  // Perfect Night (Overwatch animation intro)
  'pyf8cbqyfPs': 14,  // ANTIFRAGILE (meteorite falling intro)
  '4vbDFU3CTGQ': 0,   // FEARLESS (starts 0:00)
  'UBURTj20HXI': 0,   // CRAZY (starts 0:00)
  'dZs_cLHfn30': 0,   // UNFORGIVEN

  // BLACKPINK
  '9pdj4iJD08s': 0,   // PLAYING WITH FIRE Official MV (piano starts at 0:00)
  'gQlMMD8auMs': 0,   // Pink Venom (starts 0:00, outro challenge at 1:56)
  'POe9SOEKotk': 0,   // Shut Down (starts 0:00)
  'ioNng23DkIM': 0,   // How You Like That (starts 0:00)
  '2S24XxPR5gI': 0,   // Kill This Love (starts 0:00)
  'IHNzOHi8sJQ': 0,   // DDU-DU DDU-DU (starts 0:00)
  'bwmSjveL3Lc': 0,   // BOOMBAYAH (starts 0:00)
  'Amq-qlqbjYA': 0,   // AS IF IT'S YOUR LAST (starts 0:00)
  'dISNgvVpWlo': 0,   // Lovesick Girls (starts 0:00)

  // IVE
  '6ZUIwj3FgUY': 0,   // I AM (starts 0:00)
  'Y8JFxS1HlDo': 0,   // LOVE DIVE (starts 0:00)
  'F0B7HDiY-10': 0,   // After LIKE (starts 0:00)
  '07Z899GwCcY': 0,   // HEYA (starts 0:00)
  '--FmExEAsM8': 0,   // ELEVEN (starts 0:00)
  'pG6iaOMV46I': 0,   // Baddie (starts 0:00)

  // TWICE
  'aK2C9J74P8k': 0,   // Look At Me
  'i0p1bmr0EmE': 0,   // What is Love?
  'w4nihuYVTW0': 0,   // What is Love? (Official MV)
  '3ymwOvzhwHs': 0,   // Feel Special
  'V2hlQkVJZhE': 0,   // Talk that Talk
  'ePpPVE-GGJw': 0,   // The Feels
  'CM4CkVFmTds': 6.05, // TWICE - I CAN'T STOP ME M/V (flower bloom visual intro - vocal starts at 18.0s)
  'mAKsZ26SabQ': 0,   // YES or YES
  'rRzxEiBLQCA': 0,   // Heart Shaker
  'c7rCyll5AeY': 0,   // CHEER UP

  // BABYMONSTER
  'yd_uG3TtREs': 3.6,  // PSYCHO M/V (opening camera flash visual scene - vocal at 0:04)
  'Zp-Jhuhq0bQ': 1.1,  // DRIP M/V (opening audio logo - vocal at 0:09)
  'HkiaLCniIj8': 0,    // DRIP (Topic audio starts 0:00)
  '2wA_b6bbJNo': 0,    // SHEESH (starts 0:00)
  'olDWZk9B6aU': 0,    // BATTER UP (starts 0:00)
  'bUq6Q8_N2lY': 0,    // FOREVER (starts 0:00)
  'q3ei-x2uW6s': 0,    // CLIK CLAK (starts 0:00)

  // Stray Kids
  'TQTlCHxyuu8': 0,   // God's Menu (starts 0:00)
  'JsOOhs04Hg0': 15,  // S-Class (submarine intro)
  '0P0aQrm2LSQ': 30,  // Chk Chk Boom (Ryan Reynolds intro)
  'X-uJtV8ScYk': 0,   // MANIAC (starts 0:00)
  'easwzRPoy54': 0,   // Back Door (starts 0:00)
  'p42yvO_p1wY': 0,   // CASE 143 (starts 0:00)

  // SEVENTEEN
  '-_FiQ6h-xTk': 0,   // Super (starts 0:00)
  'Il-an3K9pjg': 12,  // Maestro (AI keyboard intro)
  'gRnuFC4Ualw': 0,   // HOT (starts 0:00)
  'CyzEtbG-sxY': 0,   // Rock with you
  'RwgfT_Q2VlU': 0,   // LOVE, MONEY, FAME (starts 0:00)

  // Japanese & Asian Artists (Music starts at 0:00)
  'ZRtdQ81jPUQ': 0,   // YOASOBI - アイドル (Idol Official MV - vocal starts at 0.59s)
  'oZpYEEcvu5I': 0,   // tuki. - 晩餐歌 (Bansanka)
  'p_KckcJxzrY': 0,   // tuki. - ひゅるりらぱっぱ (HYURURIRAPAPPA)
  'pZ7j0r5kR2Y': 23.633, // tuki. - 零-zero- Official MV (dramatic scene intro)
  'f779jFfN5-c': 23.633, // tuki. - 零-zero- Official MV variant
  'Y4nEEZwckuU': 0,   // YOASOBI - 群青 (Gunjou)
  'bu7nU9Mhpyo': 0,   // 周杰倫 - 告白氣球 (Love Confession MV - music starts 0:00)
  'DYptgVvkVLQ': 0,   // 周杰倫 - 晴天 (Sunny Day Official MV - music starts 0:00)
  '1_p02h0iX3o': 0,   // 米津玄師 - Lemon (Official MV)
  'qktbsB4a5Xw': 0,   // Ado - 新時代 (Official MV)
  'BEPSc8q6Bd8': 0,   // Hearts2Hearts - Lemon Tang
  'eqKhhG4FVoQ': 0    // Hearts2Hearts - FOCUS
};

// High-precision MV Intro Offset Resolver (Primary: KNOWN_MV_OFFSETS -> Fallback: SponsorBlock Public API)
async function getMvIntroOffset(videoId, videoDur, studioDur, isMv) {
  if (!videoId) return 0;

  // 1. Check KNOWN_MV_OFFSETS first (0ms ground truth)
  if (KNOWN_MV_OFFSETS[videoId] !== undefined) {
    return KNOWN_MV_OFFSETS[videoId];
  }

  // 2. Fallback to SponsorBlock Public API for unmapped videos
  try {
    const segs = await resolveDynamicAudioSegments(videoId, videoDur);
    if (segs && segs.introOffsetSec > 0) {
      return segs.introOffsetSec;
    }
  } catch (e) {}

  return 0;
}

function parseDurationSec(raw) {
  if (!raw) return 0;
  if (typeof raw === 'number') return Math.round(raw);
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (s.includes(':')) {
    const parts = s.split(':').map(p => parseInt(p, 10) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  return parseInt(s, 10) || 0;
}

app.get('/api/lyrics', async (req, res) => {
  const rawTitle = req.query.title;
  const rawArtist = req.query.artist;
  let duration = parseDurationSec(req.query.duration);
  const videoId = req.query.videoId || '';

  if (!rawTitle) {
    return res.status(400).json({ success: false, error: 'Judul lagu (title) diperlukan' });
  }

  // 1. Resolve canonical metadata dynamically (via Innertube + Unicode regex, zero hardcode)
  const meta = await resolveCanonicalTrackMetadata(videoId, rawTitle, rawArtist);
  const { title, artist, artistLatin, artistHangul, nativeTitle, nativeArtist, titleLatin } = meta;
  if (!duration && meta.duration) {
    duration = meta.duration;
  }

  const hasKnownMvOffset = Boolean(videoId && KNOWN_MV_OFFSETS[videoId] !== undefined);
  const isMvExplicit = /\b(?:mv|m\/v|music\s*video|official\s*(?:video|mv|film)|special\s*clip|performance\s*video|live|concert|the\s*first\s*take)\b|【mv】|\[mv\]|（live）|\(live\)/i.test(rawTitle || '');
  const isMv = isMvExplicit || hasKnownMvOffset;

  // 2. Resolve intro offset: Check KNOWN_MV_OFFSETS first (0ms ground truth), fallback to SponsorBlock
  let introOffsetSec = 0;
  let effectiveSongDuration = duration;
  if (hasKnownMvOffset) {
    introOffsetSec = KNOWN_MV_OFFSETS[videoId];
  } else if (videoId && duration > 20) {
    try {
      const segs = await resolveDynamicAudioSegments(videoId, duration);
      if (duration > 0 && effectiveSongDuration > 0 && Math.abs(duration - effectiveSongDuration) <= 4) {
        introOffsetSec = 0;
      } else {
        introOffsetSec = segs.introOffsetSec || 0;
      }
      if (segs.effectiveSongDuration > 0) effectiveSongDuration = segs.effectiveSongDuration;
    } catch (e) {}
  }
  console.log('[lyrics-query]', { title, artist, effectiveSongDuration, introOffsetSec, isMv, hasKnownMvOffset });

  const cacheKey = `v69___${normalizeForCompare(title)}___${normalizeForCompare(artist)}___${Math.round(effectiveSongDuration)}`;

  const bypassCache = req.query.nocache === '1' || req.query.refresh === 'true';

  if (!bypassCache && lyricsCache.has(cacheKey)) {
    const cached = lyricsCache.get(cacheKey);
    return res.json({ success: true, ...cached, fromCache: true });
  }

  const headers = { 'User-Agent': 'AuraSound/3.9 (https://github.com/aurasound)' };

  try {
    let syncedResult = null;
    let plainResult = null;

    const hasKana = /[\u3040-\u30ff]/.test(title) || /[\u3040-\u30ff]/.test(artist) || Boolean(nativeTitle && /[\u3040-\u30ff]/.test(nativeTitle)) || Boolean(nativeArtist && /[\u3040-\u30ff]/.test(nativeArtist));
    const hasHangul = /[\uac00-\ud7af]/.test(title) || /[\uac00-\ud7af]/.test(artist) || Boolean(nativeTitle && /[\uac00-\ud7af]/.test(nativeTitle)) || Boolean(nativeArtist && /[\uac00-\ud7af]/.test(nativeArtist)) || Boolean(artistHangul);
    const hasHanzi = /[\u4e00-\u9fff]/.test(title) || /[\u4e00-\u9fff]/.test(artist) || Boolean(nativeTitle && /[\u4e00-\u9fff]/.test(nativeTitle)) || Boolean(nativeArtist && /[\u4e00-\u9fff]/.test(nativeArtist));

    const isJapanese = hasKana || (hasHanzi && !hasHangul && /yoasobi|ado\b|aimyon|kenshi\s*yonezu|yorushika|tuki\b|zutomayo|eve\b|vocaloid|hatsune\s*miku|hololive|lisa\b|king\s*gnu|radwimps|one\s*ok\s*rock|official\s*hige\s*dandism|vaundy|fujii\s*kaze/i.test(`${title} ${artist}`));
    const isKorean = hasHangul || (!hasKana && /newjeans|bts|blackpink|aespa|twice|le\s*sserafim|stray\s*kids|ive|seventeen|itzy|nmixx|gidle|\(g\)i-dle|red\s*velvet|exo|iu\b|taeyeon|jungkook|illit|babymonster|riize|tws|boynextdoor|zerobaseone/i.test(`${title} ${artist}`));
    const isChinese = !isJapanese && hasHanzi;

    // Step 0: Better Lyrics Engine (Apple Music Syllable-Level TTML Master Catalog) - using effectiveSongDuration!
    syncedResult = await searchBetterLyrics(title, artist, effectiveSongDuration, videoId, artistLatin, artistHangul, titleLatin, nativeTitle, isMv, nativeArtist);

    // Step 1: For Korean songs, try LRCLib exact match using effectiveSongDuration
    if (!syncedResult && isKorean) {
      const exactCandidate = (artistLatin && (titleLatin || title)) ? { track: titleLatin || title, artist: artistLatin } : null;
      if (exactCandidate) {
        try {
          const getRes = await axios.get('https://lrclib.net/api/get', {
            params: {
              track_name: exactCandidate.track,
              artist_name: exactCandidate.artist
            },
            headers,
            timeout: 2500
          });
          if (getRes.data && getRes.data.syncedLyrics) {
            const getDur = getRes.data.duration;
            if (!effectiveSongDuration || !getDur || Math.abs(getDur - effectiveSongDuration) <= 5) {
              syncedResult = { ...getRes.data, sourceName: 'LRCLib' };
            }
          }
        } catch (e) {}
      }
    }

    // Step 2: Smart Multi-Catalog Search using effectiveSongDuration
    if (!syncedResult) {
      if (isJapanese) {
        // NetEase is the global #1 database for Japanese J-Pop & Anime synced lyrics
        syncedResult = await searchNetEaseLyrics(title, artist, effectiveSongDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv);
        if (!syncedResult) {
          syncedResult = await searchQQMusicLyrics(title, artist, effectiveSongDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv);
        }
        if (!syncedResult) {
          syncedResult = await searchKugouLyrics(title, artist, effectiveSongDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv);
        }
      } else if (isChinese) {
        // QQ Music is Tencent's master catalog for Chinese Mandopop & C-pop
        syncedResult = await searchQQMusicLyrics(title, artist, effectiveSongDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv);
        if (!syncedResult) {
          syncedResult = await searchKugouLyrics(title, artist, effectiveSongDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv);
        }
        if (!syncedResult) {
          syncedResult = await searchNetEaseLyrics(title, artist, effectiveSongDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv);
        }
      } else if (isKorean) {
        // QQ Music has the official licensed catalog for modern K-pop and rookie groups (Hearts2Hearts, etc.)
        syncedResult = await searchQQMusicLyrics(title, artist, effectiveSongDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv);
        if (!syncedResult) {
          syncedResult = await searchKugouLyrics(title, artist, effectiveSongDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv);
        }
        if (!syncedResult) {
          syncedResult = await searchNetEaseLyrics(title, artist, effectiveSongDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv);
        }
      }
    }

    // Step C: Try LRCLib for Synced Lyrics (or fallback if Asian engines had no match)
    if (!syncedResult) {
      const candidates = buildSearchCandidates(title, artist, nativeTitle, nativeArtist, artistLatin, artistHangul, titleLatin).slice(0, 3);
      for (const c of candidates) {
        try {
          if (c.type === 'get') {
            const getRes = await axios.get('https://lrclib.net/api/get', {
              params: {
                track_name: c.track,
                artist_name: c.artist
              },
              headers,
              timeout: 2000
            });
            if (getRes.data) {
              if (getRes.data.syncedLyrics) {
                if (!effectiveSongDuration || !getRes.data.duration || Math.abs(getRes.data.duration - effectiveSongDuration) <= 12) {
                  syncedResult = { ...getRes.data, sourceName: 'LRCLib' };
                  break;
                }
              } else if (getRes.data.plainLyrics && !plainResult) {
                plainResult = { ...getRes.data, sourceName: 'LRCLib' };
              }
            }
          } else if (c.type === 'search') {
            const searchRes = await axios.get('https://lrclib.net/api/search', {
              params: { q: c.q },
              headers,
              timeout: 2000
            });
            if (Array.isArray(searchRes.data) && searchRes.data.length > 0) {
              const picked = pickBestLyrics(searchRes.data, effectiveSongDuration, artistLatin || artist, titleLatin || title, isMv);
              if (picked) {
                if (picked.syncedLyrics) {
                  syncedResult = { ...picked, sourceName: 'LRCLib' };
                  break;
                } else if (picked.plainLyrics && !plainResult) {
                  plainResult = { ...picked, sourceName: 'LRCLib' };
                }
              }
            }
          }
        } catch (e) {}
      }
    }

    // Step D: If song didn't find synced lyrics in LRCLib, try external master engines concurrently
    if (!syncedResult) {
      const fallbackEngines = [
        searchQQMusicLyrics(title, artist, effectiveSongDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv),
        searchNetEaseLyrics(title, artist, effectiveSongDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv),
        searchKugouLyrics(title, artist, effectiveSongDuration, nativeTitle, artistLatin, artistHangul, titleLatin, isMv)
      ];
      try {
        const anyHit = await Promise.any(fallbackEngines.map(p => p.then(res => {
          if (res) return res;
          throw new Error('No hit');
        })));
        if (anyHit) syncedResult = anyHit;
      } catch (e) {}
    }

    // Fallback: If still no Synced Lyrics anywhere, use plain text lyrics
    const result = syncedResult || plainResult;

    let parsedLyrics = null;
    let detectedLang = null;
    let netShiftSec = 0;

    if (result && result.syncedLyrics) {
      // 1. LRC Header Offset: [offset:+/-ms] and adjustOffsetMs (in seconds)
      let lrcOffsetSec = 0;
      const offsetMatch = result.syncedLyrics.match(/\[offset:\s*([+-]?\d+)\]/i);
      if (offsetMatch) {
        lrcOffsetSec = (parseInt(offsetMatch[1], 10) || 0) / 1000;
      }
      if (result.adjustOffsetMs) {
        lrcOffsetSec += (result.adjustOffsetMs / 1000);
      }

      // 2. High-Precision MV Cinematic Intro from KNOWN_MV_OFFSETS / SponsorBlock
      let mvIntroDelaySec = (hasKnownMvOffset || introOffsetSec > 0) ? introOffsetSec : 0;
      if (!mvIntroDelaySec && (isMv || hasKnownMvOffset) && videoId) {
        mvIntroDelaySec = await getMvIntroOffset(videoId, duration, result.duration, isMv);
      }

      // 3. Apple Music TTML Leading Silence
      let leadingSilenceSec = Number(result.leadingSilence) || 0;

      const isBetterLyricsOrTtml = Boolean(
        (result.sourceName && /better\s*lyrics|apple\s*music/i.test(result.sourceName)) ||
        (result.id && String(result.id).startsWith('bl_'))
      );

      // Apply MV intro offset when confirmed present in video
      if (duration > 0 && result.duration > 0 && Math.abs(duration - result.duration) <= 4 && !hasKnownMvOffset) {
        netShiftSec = isBetterLyricsOrTtml ? 0 : -lrcOffsetSec;
      } else if (mvIntroDelaySec > 0) {
        netShiftSec = mvIntroDelaySec - (isBetterLyricsOrTtml ? 0 : lrcOffsetSec);
      } else {
        netShiftSec = isBetterLyricsOrTtml ? 0 : -lrcOffsetSec;
      }
    }

    let unifiedLyrics = null;
    if (result) {
      // 1. Unified Better Lyrics Engine Parser for ALL sources (TTML, LRC, QRC, YRC, Plain)
      const parsedBraccato = await parseAnyLyricsToBraccato(result, duration || result.duration, title, artist);
      unifiedLyrics = parsedBraccato?.lyrics || null;
      detectedLang = parsedBraccato?.lang || (result.detectedLang ? result.detectedLang.split('-')[0].toLowerCase() : null);

      if (unifiedLyrics && Array.isArray(unifiedLyrics) && unifiedLyrics.length > 0) {
        // Apply netShiftSec (MV intro offset / sync timing)
        if (netShiftSec !== 0) {
          const shiftMs = Math.round(netShiftSec * 1000);
          for (const l of unifiedLyrics) {
            l.startTimeMs = Math.max(0, l.startTimeMs + shiftMs);
            if (Array.isArray(l.parts)) {
              for (const p of l.parts) {
                p.startTimeMs = Math.max(0, p.startTimeMs + shiftMs);
              }
            }
            if (Array.isArray(l.timedRomanization)) {
              for (const p of l.timedRomanization) {
                p.startTimeMs = Math.max(0, p.startTimeMs + shiftMs);
              }
            }
          }
        }

        // Sort ascending by timestamp
        unifiedLyrics.sort((a, b) => a.startTimeMs - b.startTimeMs);

        // Deduplicate collision timestamps (< 80ms)
        const dedupedLyrics = [];
        for (let i = 0; i < unifiedLyrics.length; i++) {
          const curr = unifiedLyrics[i];
          if (dedupedLyrics.length === 0) {
            dedupedLyrics.push(curr);
            continue;
          }
          const prev = dedupedLyrics[dedupedLyrics.length - 1];
          if (Math.abs(curr.startTimeMs - prev.startTimeMs) < 80) {
            if (isKorean) {
              const prevKo = /[\uac00-\ud7af]/.test(prev.words || '');
              const currKo = /[\uac00-\ud7af]/.test(curr.words || '');
              if (!prevKo && currKo) dedupedLyrics[dedupedLyrics.length - 1] = curr;
              continue;
            } else if (isJapanese) {
              const prevJp = /[\u3040-\u30ff]/.test(prev.words || '');
              const currJp = /[\u3040-\u30ff]/.test(curr.words || '');
              if (!prevJp && currJp) dedupedLyrics[dedupedLyrics.length - 1] = curr;
              continue;
            } else {
              if ((!prev.parts && curr.parts) || ((curr.words || '').length > (prev.words || '').length)) {
                dedupedLyrics[dedupedLyrics.length - 1] = curr;
              }
              continue;
            }
          }
          dedupedLyrics.push(curr);
        }
        unifiedLyrics = dedupedLyrics;

        // Ensure reasonable line durations
        for (let i = 0; i < unifiedLyrics.length; i++) {
          const curr = unifiedLyrics[i];
          if (!curr.durationMs || curr.durationMs <= 0) {
            if (i < unifiedLyrics.length - 1) {
              const nextStart = unifiedLyrics[i + 1].startTimeMs;
              curr.durationMs = Math.max(500, Math.min(6000, nextStart - curr.startTimeMs - 80));
            } else {
              curr.durationMs = 4500;
            }
          } else if (i === unifiedLyrics.length - 1 && curr.durationMs > 10000) {
            curr.durationMs = 4500;
          }
        }

        // Filter out early credit headers & producer/composer lines before vocal onset
        const titleHints = [title, titleLatin, nativeTitle, artistLatin, artistHangul, result.trackName].filter(Boolean);
        unifiedLyrics = unifiedLyrics.filter(it => it.isInstrumental || !isCreditOrHeaderLine(it.words, it.startTimeMs / 1000, titleHints));

        // ABSOLUTE ZERO TRANSLATION: Remove any translation fields across all lines
        for (const l of unifiedLyrics) {
          delete l.translation;
          delete l.translations;
        }

        // Singable Phonetic Romanization: ONLY on sung lines (immune to instrumental off-by-1 offsets)
        const sungLines = unifiedLyrics.filter(l => !l.isInstrumental && l.words && l.words.trim());
        if (sungLines.length > 0) {
          try {
            const romanizer = getLyricsRomanizer();
            const processed = await romanizer.romanizeLyricsList(
              sungLines.map(l => ({
                text: l.words,
                time: l.startTimeMs / 1000,
                romaji: l.romanization || null,
                words: (Array.isArray(l.parts) && l.parts.length > 0) ? l.parts.filter(p => p.words && p.words.trim()).map(p => ({
                  text: p.words.trim(),
                  begin: p.startTimeMs / 1000,
                  end: (p.startTimeMs + p.durationMs) / 1000
                })) : null
              }))
            );
            if (processed && Array.isArray(processed.lines)) {
              let sungIdx = 0;
              for (const l of unifiedLyrics) {
                if (!l.isInstrumental && l.words && l.words.trim()) {
                  const r = processed.lines[sungIdx++];
                  if (!l.romanization && r && r.romaji) {
                    l.romanization = r.romaji;
                  }
                  if (!l.timedRomanization && r && Array.isArray(r.romajiWords) && r.romajiWords.length > 0 && Array.isArray(l.parts) && l.parts.length > 0) {
                    l.timedRomanization = r.romajiWords.map(rw => ({
                      startTimeMs: Math.round(rw.begin * 1000),
                      durationMs: Math.max(50, Math.round((rw.end - rw.begin) * 1000)),
                      words: (rw.trailingSpace !== false) ? `${rw.text} ` : rw.text
                    }));
                  }
                }
              }
              detectedLang = processed.detectedLang || detectedLang;
            }
          } catch (e) {
            console.warn('Lyrics romanization error:', e.message);
          }
        }

        // Build parsedLyrics for backward-compatible client consumers
        parsedLyrics = unifiedLyrics.filter(l => !l.isInstrumental && l.words && l.words.trim()).map(l => {
          const time = parseFloat((l.startTimeMs / 1000).toFixed(3));
          const endTime = parseFloat(((l.startTimeMs + l.durationMs) / 1000).toFixed(3));
          let words = null;
          if (Array.isArray(l.parts) && l.parts.length > 0) {
            const validParts = [];
            for (let pi = 0; pi < l.parts.length; pi++) {
              const p = l.parts[pi];
              const pText = (p.words || '').trim();
              if (!pText) {
                if (validParts.length > 0) validParts[validParts.length - 1].trailingSpace = true;
                continue;
              }
              validParts.push({
                text: pText,
                begin: parseFloat((p.startTimeMs / 1000).toFixed(3)),
                end: parseFloat(((p.startTimeMs + p.durationMs) / 1000).toFixed(3)),
                trailingSpace: /\s+$/.test(p.words || '')
              });
            }
            if (validParts.length > 0) words = validParts;
          }
          return {
            time,
            endTime,
            text: l.words,
            words,
            romaji: l.romanization || null,
            lang: detectedLang
          };
        });
      }
    }

    const braccatoLyrics = (unifiedLyrics && unifiedLyrics.length > 0) ? unifiedLyrics : null;

    const payload = result ? {
      found: true,
      id: result.id,
      source: result.sourceName || 'LRCLib',
      sourceName: result.sourceName || 'Better Lyrics',
      type: Boolean(result.hasWordSync || (parsedLyrics && parsedLyrics.some(l => l.words && l.words.length > 0))) ? 'syllable' : 'synced',
      title: result.trackName || title,
      artist: result.artistName || artist,
      album: result.albumName || '',
      duration: duration || result.duration,
      leadingSilence: 0,
      hasWordSync: Boolean(result.hasWordSync || (parsedLyrics && parsedLyrics.some(l => l.words && l.words.length > 0))),
      instrumental: Boolean(result.instrumental),
      syncedLyrics: result.syncedLyrics || null,
      plainLyrics: result.plainLyrics || null,
      parsedLyrics: parsedLyrics || null,
      braccatoLyrics: braccatoLyrics && braccatoLyrics.length > 0 ? braccatoLyrics : null,
      detectedLang: detectedLang || null,
      autoOffset: 0,
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
if (!process.env.VERCEL && !process.env.NO_SERVER_LISTEN) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    const primaryIp = getPrimaryIp();
    console.log(`\n======================================================`);
    console.log(`🎵 APLIKASI MUSIK BERHASIL DIJALANKAN!`);
    console.log(`💻 Akses di Laptop : http://localhost:${PORT}`);
    console.log(`📱 Akses di HP     : http://${primaryIp}:${PORT}`);
    console.log(`======================================================\n`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Server] Port ${PORT} already in use, reusing existing server instance.`);
    } else {
      console.error('[Server] Listen error:', err);
    }
  });
}

app.cleanLyricsTrackInfo = cleanLyricsTrackInfo;
app.getMvIntroOffset = getMvIntroOffset;
app.searchBetterLyrics = searchBetterLyrics;
app.parseAppleMusicTTML = parseAppleMusicTTML;
app.parseTTMLToLyrics = parseAppleMusicTTML;

module.exports = app;
