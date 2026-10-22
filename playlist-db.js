const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'playlists.json');

// Ensure data directory exists
if (process.env.VERCEL) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE) && fs.existsSync(path.join(__dirname, 'data', 'playlists.json'))) {
      fs.copyFileSync(path.join(__dirname, 'data', 'playlists.json'), DB_FILE);
    }
  } catch (e) {}
} else if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-Memory Cache for 0ms ultra-fast response
let playlistsCache = null;

function loadFromDisk() {
  if (!fs.existsSync(DB_FILE)) return [];
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw) || [];
  } catch (err) {
    console.error('Error reading playlists DB from disk:', err);
    return [];
  }
}

function persistToDisk() {
  if (!playlistsCache) return;
  // Non-blocking asynchronous write to avoid locking event loop
  fs.writeFile(DB_FILE, JSON.stringify(playlistsCache, null, 2), 'utf8', (err) => {
    if (err) console.error('Error persisting playlists DB to disk:', err);
  });
}

function getAllPlaylists(deviceId = null) {
  if (playlistsCache === null) {
    playlistsCache = loadFromDisk();
    // Filter out any legacy hardcoded developer playlists that might linger in /tmp
    playlistsCache = playlistsCache.filter(p => p.title !== 'K-POP SONG' && p.title !== "J-POP SONG'S");
  }
  if (!deviceId) return playlistsCache;
  return playlistsCache.filter(p => !p.deviceId || p.deviceId === deviceId);
}

// Returns lightweight metadata (super fast for playlist card grids)
function getPlaylistsSummary(deviceId = null) {
  const all = getAllPlaylists(deviceId);
  return all.map(p => ({
    id: p.id,
    title: p.title,
    thumbnail: p.thumbnail,
    trackCount: p.tracks?.length || 0,
    createdAt: p.createdAt,
    isImported: p.isImported,
    deviceId: p.deviceId
  }));
}

function getPlaylistById(id, deviceId = null) {
  const all = getAllPlaylists();
  return all.find(p => p.id === id && (!deviceId || !p.deviceId || p.deviceId === deviceId)) || null;
}

function addOrUpdatePlaylist(playlist) {
  const all = getAllPlaylists();
  const idx = all.findIndex(p => p.id === playlist.id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], ...playlist };
  } else {
    all.unshift(playlist);
  }
  persistToDisk();
  return playlist;
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

module.exports = {
  getAllPlaylists,
  getPlaylistsSummary,
  getPlaylistById,
  addOrUpdatePlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist
};
