const fs = require('fs');
const path = require('path');

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
const DB_FILE = path.join(DATA_DIR, 'playlists.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE) && fs.existsSync(path.join(__dirname, 'data', 'playlists.json'))) {
    fs.copyFileSync(path.join(__dirname, 'data', 'playlists.json'), DB_FILE);
  } else if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, '[]', 'utf8');
  }
} catch (e) {}

// In-Memory Cache for 0ms ultra-fast response
let playlistsCache = null;

function loadFromDisk() {
  let list = [];
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      list = JSON.parse(raw) || [];
    } catch (err) {
      console.error('Error reading playlists DB from disk:', err);
    }
  }

  // Fallback / merge with workspace backup if DB_FILE was empty or missing playlists
  const localFile = path.join(__dirname, 'data', 'playlists.json');
  if (localFile !== DB_FILE && fs.existsSync(localFile)) {
    try {
      const rawLocal = fs.readFileSync(localFile, 'utf8');
      const localList = JSON.parse(rawLocal) || [];
      if (Array.isArray(localList) && localList.length > 0) {
        if (!Array.isArray(list) || list.length === 0) {
          list = localList;
        } else {
          const idSet = new Set(list.map(p => p.id));
          for (const lp of localList) {
            if (!idSet.has(lp.id)) {
              list.push(lp);
              idSet.add(lp.id);
            }
          }
        }
      }
    } catch (e) {}
  }

  return Array.isArray(list) ? list : [];
}

function persistToDisk() {
  if (!playlistsCache) return;
  const content = JSON.stringify(playlistsCache, null, 2);
  // Non-blocking asynchronous write to avoid locking event loop
  fs.writeFile(DB_FILE, content, 'utf8', (err) => {
    if (err) console.error('Error persisting playlists DB to disk:', err);
  });
  // Also keep workspace data/playlists.json in sync so redeployments and restarts never lose playlists
  const localFile = path.join(__dirname, 'data', 'playlists.json');
  if (localFile !== DB_FILE) {
    try {
      fs.writeFile(localFile, content, 'utf8', () => {});
    } catch (e) {}
  }
}

function getAllPlaylists(userKey = null) {
  if (playlistsCache === null) {
    playlistsCache = loadFromDisk();
  }
  if (!userKey) return playlistsCache;
  const cleanKey = String(userKey).trim().toLowerCase();
  const normalizedKey = cleanKey.replace(/^usr_/, '').replace(/_gmail_com$/, '@gmail.com');

  // Check active server session to prevent isolating user from their own playlists
  let activeSessionEmail = null;
  try {
    const userDb = require('./user-db');
    const sess = userDb.getActiveSession();
    if (sess && sess.email) activeSessionEmail = sess.email.trim().toLowerCase();
  } catch (e) {}

  return playlistsCache.filter(p => {
    const pEmail = String(p.userEmail || '').trim().toLowerCase();
    const pUserId = String(p.userId || '').trim().toLowerCase();
    const pDevice = String(p.deviceId || '').trim().toLowerCase();
    if (!pEmail && !pUserId && !pDevice) return true; // Legacy or shared imported playlist
    if (pEmail === cleanKey || pEmail === normalizedKey) return true;
    if (pUserId === cleanKey || pUserId === normalizedKey) return true;
    if (pDevice === cleanKey || pDevice === normalizedKey) return true;

    // Active session match
    if (activeSessionEmail) {
      if (cleanKey === activeSessionEmail || normalizedKey === activeSessionEmail) {
        if (pEmail === activeSessionEmail || pUserId === activeSessionEmail || pDevice === activeSessionEmail) return true;
      }
      if (pEmail === activeSessionEmail || pUserId === activeSessionEmail || pDevice === activeSessionEmail) {
        return true;
      }
    }

    const pOwnerNorm = (pEmail || pUserId || pDevice).replace(/^usr_/, '').replace(/_gmail_com$/, '@gmail.com');
    return pOwnerNorm === normalizedKey;
  });
}

// Returns lightweight metadata (super fast for playlist card grids)
function getPlaylistsSummary(userKey = null) {
  const all = getAllPlaylists(userKey);
  return all.map(p => ({
    id: p.id,
    title: p.title,
    thumbnail: p.thumbnail,
    trackCount: p.trackCount !== undefined ? p.trackCount : (p.tracks?.length || 0),
    createdAt: p.createdAt,
    isImported: p.isImported,
    userEmail: p.userEmail,
    deviceId: p.deviceId
  }));
}

function getPlaylistById(id, userKey = null) {
  const all = getAllPlaylists();
  const cleanKey = userKey ? String(userKey).trim().toLowerCase() : null;
  const normalizedKey = cleanKey ? cleanKey.replace(/^usr_/, '').replace(/_gmail_com$/, '@gmail.com') : null;
  return all.find(p => {
    if (p.id !== id) return false;
    if (!cleanKey) return true;
    const pOwner = String(p.userEmail || p.userId || p.deviceId || '').trim().toLowerCase();
    if (!pOwner) return true;
    if (pOwner === cleanKey || pOwner === normalizedKey) return true;
    const pOwnerNorm = pOwner.replace(/^usr_/, '').replace(/_gmail_com$/, '@gmail.com');
    return pOwnerNorm === normalizedKey;
  }) || null;
}

function addOrUpdatePlaylist(playlist) {
  const all = getAllPlaylists();
  const idx = all.findIndex(p => p.id === playlist.id);
  if (idx !== -1) {
    const existing = all[idx];
    const incomingTracks = Array.isArray(playlist.tracks) && playlist.tracks.length > 0;
    const existingTracks = Array.isArray(existing.tracks) && existing.tracks.length > 0;
    all[idx] = {
      ...existing,
      ...playlist,
      tracks: incomingTracks ? playlist.tracks : (existingTracks ? existing.tracks : [])
    };
  } else {
    all.unshift(playlist);
  }
  persistToDisk();
  return playlist;
}

function bulkUpsertPlaylists(incomingPlaylists, userKey = null) {
  if (!Array.isArray(incomingPlaylists) || incomingPlaylists.length === 0) {
    return getAllPlaylists(userKey);
  }
  const all = getAllPlaylists();
  for (const pl of incomingPlaylists) {
    if (!pl || !pl.id || !pl.title) continue;
    
    const idx = all.findIndex(p => p.id === pl.id);
    const resolvedUserKey = userKey || pl.userEmail || pl.userId || pl.deviceId || '';
    const enriched = {
      ...pl,
      userId: pl.userId || resolvedUserKey,
      deviceId: pl.deviceId || resolvedUserKey,
      userEmail: pl.userEmail || (resolvedUserKey && resolvedUserKey.includes('@') ? resolvedUserKey : '')
    };

    if (idx !== -1) {
      const existing = all[idx];
      const hasTracksIncoming = Array.isArray(enriched.tracks) && enriched.tracks.length > 0;
      const hasTracksExisting = Array.isArray(existing.tracks) && existing.tracks.length > 0;
      all[idx] = {
        ...existing,
        ...enriched,
        tracks: hasTracksIncoming ? enriched.tracks : (hasTracksExisting ? existing.tracks : [])
      };
    } else {
      all.unshift(enriched);
    }
  }
  persistToDisk();
  return getAllPlaylists(userKey);
}

function deletePlaylist(id) {
  const all = getAllPlaylists();
  playlistsCache = all.filter(p => p.id !== id);
  persistToDisk();
  return true;
}

function addTrackToPlaylist(playlistId, track) {
  const all = getAllPlaylists();
  const pl = all.find(p => p.id === playlistId);
  if (!pl) return null;
  if (!pl.tracks) pl.tracks = [];
  
  if (!pl.tracks.some(t => t.id === track.id)) {
    pl.tracks.push(track);
    if (!pl.thumbnail || pl.thumbnail.includes('icon.svg')) {
      pl.thumbnail = track.thumbnail;
    }
    persistToDisk();
  }
  return pl;
}

function removeTrackFromPlaylist(playlistId, trackId) {
  const all = getAllPlaylists();
  const pl = all.find(p => p.id === playlistId);
  if (!pl) return null;
  pl.tracks = (pl.tracks || []).filter(t => t.id !== trackId);
  persistToDisk();
  return pl;
}

function resetAllPlaylists() {
  playlistsCache = [];
  persistToDisk();
  const repoFile = path.join(__dirname, 'data', 'playlists.json');
  try { fs.writeFileSync(repoFile, '[]', 'utf8'); } catch (e) {}
  return [];
}

module.exports = {
  getAllPlaylists,
  getPlaylistsSummary,
  getPlaylistById,
  addOrUpdatePlaylist,
  bulkUpsertPlaylists,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  resetAllPlaylists
};
