/**
 * AuraSound - Spotify Playlist & Album Importer 2026
 * Enables seamless importing of Spotify playlists, albums, and tracks
 * without requiring user developer credentials or OAuth logins.
 */

const axios = require('axios');
const ytSearch = require('yt-search');

const resolvedCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function isSpotifyUrl(url = '') {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return /open\.spotify\.com\/(playlist|album|track)\//i.test(trimmed) ||
         /spotify:(playlist|album|track):/i.test(trimmed) ||
         /spotify\.link\//i.test(trimmed);
}

function parseDuration(durationMs) {
  if (!durationMs || typeof durationMs !== 'number') return '3:30';
  const totalSec = Math.floor(durationMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

async function resolveSpotifyTrack(title = '', artist = '', id = '') {
  const cacheKey = `sp_${id || (artist + '_' + title)}`.toLowerCase();
  if (resolvedCache.has(cacheKey)) {
    const entry = resolvedCache.get(cacheKey);
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.videoId;
    }
  }

  const query = `${artist} - ${title} official audio`;
  try {
    const res = await ytSearch(query);
    const firstVid = res.videos?.[0];
    if (firstVid && firstVid.videoId) {
      resolvedCache.set(cacheKey, { videoId: firstVid.videoId, timestamp: Date.now() });
      return firstVid.videoId;
    }
  } catch (err) {
    console.warn(`Resolve error for "${query}":`, err.message);
  }

  // Backup simple search
  try {
    const backupRes = await ytSearch(`${title} ${artist}`);
    const backupVid = backupRes.videos?.[0];
    if (backupVid && backupVid.videoId) {
      resolvedCache.set(cacheKey, { videoId: backupVid.videoId, timestamp: Date.now() });
      return backupVid.videoId;
    }
  } catch (e) {}

  return null;
}

async function importFromSpotify(inputUrl, deviceId = null) {
  let cleanUrl = (inputUrl || '').trim();

  // If shortlink (spotify.link), resolve redirect
  if (/spotify\.link\//i.test(cleanUrl)) {
    try {
      const headRes = await axios.get(cleanUrl, {
        maxRedirects: 5,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      cleanUrl = headRes.request?.res?.responseUrl || cleanUrl;
    } catch (e) {
      console.warn('Spotify shortlink redirect failed:', e.message);
    }
  }

  const uriMatch = cleanUrl.match(/spotify:(playlist|album|track):([a-zA-Z0-9]+)/i);
  let type = 'playlist';
  let id = '';

  if (uriMatch) {
    type = uriMatch[1].toLowerCase();
    id = uriMatch[2];
  } else {
    const urlMatch = cleanUrl.match(/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/i);
    if (urlMatch) {
      type = urlMatch[1].toLowerCase();
      id = urlMatch[2];
    }
  }

  if (!id) {
    throw new Error('Link Spotify tidak valid. Pastikan link berbentuk https://open.spotify.com/playlist/... atau album/...');
  }

  const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
  const res = await axios.get(embedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    },
    timeout: 12000
  });

  const marker = 'id="__NEXT_DATA__"';
  const idx = res.data.indexOf(marker);
  if (idx === -1) {
    throw new Error('Gagal membaca data playlist Spotify. Pastikan link Spotify publik dan aktif.');
  }

  const start = res.data.indexOf('>', idx) + 1;
  const end = res.data.indexOf('</script>', start);
  const json = JSON.parse(res.data.substring(start, end));
  const entity = json.props?.pageProps?.state?.data?.entity;

  if (!entity) {
    throw new Error('Data playlist atau album Spotify tidak ditemukan.');
  }

  const images = entity.visualIdentity?.image || [];
  const coverArt = images[images.length - 1]?.url || images[0]?.url || '/images/supermix.jpg';
  const rawTracks = entity.trackList || [];

  if (rawTracks.length === 0 && entity.entityType === 'track') {
    // Single track import
    rawTracks.push(entity);
  }

  const playlistTitle = entity.name || (type === 'album' ? 'Spotify Album' : 'Spotify Playlist');
  const playlistSubtitle = entity.subtitle || entity.description || `Diimpor dari Spotify (${type})`;

  const parsedTracks = rawTracks.map((t, index) => {
    const duration = parseDuration(t.duration);
    const spId = t.uri ? t.uri.replace('spotify:track:', '') : `sp_${index}_${Date.now()}`;
    const trackTitle = t.title || 'Unknown Title';
    const trackArtist = t.subtitle || entity.subtitle || 'Spotify Artist';

    return {
      id: `sp_${spId}`,
      spotifyId: spId,
      title: trackTitle,
      artist: trackArtist,
      duration,
      thumbnail: coverArt,
      type: 'spotify',
      isSpotify: true,
      source: 'spotify',
      youtubeResolved: false
    };
  });

  // Pre-resolve first 3 tracks in parallel for instant playback with 0 delay!
  const preResolveCount = Math.min(3, parsedTracks.length);
  const preResolvePromises = [];

  for (let i = 0; i < preResolveCount; i++) {
    preResolvePromises.push((async (track) => {
      try {
        const vid = await resolveSpotifyTrack(track.title, track.artist, track.spotifyId);
        if (vid) {
          track.id = vid;
          track.type = 'youtube';
          track.youtubeResolved = true;
          track.thumbnail = `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`;
        }
      } catch (err) {}
    })(parsedTracks[i]));
  }

  await Promise.all(preResolvePromises);

  const newPlaylist = {
    id: `pl-sp-${Date.now()}`,
    title: playlistTitle,
    description: playlistSubtitle,
    originalId: id,
    source: 'spotify',
    sourceUrl: cleanUrl,
    tracks: parsedTracks,
    thumbnail: coverArt,
    createdAt: new Date().toLocaleDateString('id-ID'),
    isImported: true,
    deviceId: deviceId || null
  };

  return newPlaylist;
}

module.exports = {
  isSpotifyUrl,
  importFromSpotify,
  resolveSpotifyTrack
};
