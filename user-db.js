const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.AURASOUND_DATA_DIR || (process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE) && fs.existsSync(path.join(__dirname, 'data', 'users.json'))) {
    fs.copyFileSync(path.join(__dirname, 'data', 'users.json'), DB_FILE);
  } else if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, '{}', 'utf8');
  }
} catch (e) {}

// In-Memory Cache for 0ms ultra-fast response
let usersCache = null;

function normalizeUserKey(key) {
  if (!key) return null;
  return String(key).trim().toLowerCase().replace(/[^a-zA-Z0-9@._-]/g, '_');
}

function loadFromDisk() {
  if (!fs.existsSync(DB_FILE)) return {};
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw) || {};
  } catch (err) {
    console.error('Error reading users DB from disk:', err);
    return {};
  }
}

function persistToDisk() {
  if (!usersCache) return;
  // Non-blocking asynchronous write to avoid locking event loop
  fs.writeFile(DB_FILE, JSON.stringify(usersCache, null, 2), 'utf8', (err) => {
    if (err) console.error('Error persisting users DB to disk:', err);
  });
}

function getAllUsers() {
  if (usersCache === null) {
    usersCache = loadFromDisk();
  }
  return usersCache;
}

function getUser(rawKey) {
  const all = getAllUsers();
  const key = normalizeUserKey(rawKey);
  if (!key) return null;

  // Direct match by email or key
  if (all[key]) return all[key];

  // Lookup by email or id inside values
  for (const u of Object.values(all)) {
    if (u.email && normalizeUserKey(u.email) === key) return u;
    if (u.id && normalizeUserKey(u.id) === key) return u;
  }
  return null;
}

function loginOrRegisterUser({ email, name, avatar, provider = 'google', googleId = null }) {
  const all = getAllUsers();
  const cleanEmail = email ? email.trim().toLowerCase() : null;
  const userKey = cleanEmail || (googleId ? `gid_${googleId}` : `usr_${Date.now()}`);
  const normKey = normalizeUserKey(userKey);

  let user = getUser(normKey);
  const now = Date.now();

  if (user) {
    // Existing user: update last login & info
    user.lastLoginAt = now;
    if (name && name.trim()) user.name = name.trim();
    if (avatar && avatar.trim()) user.avatar = avatar.trim();
    if (googleId) user.googleId = googleId;
    all[user.id || normKey] = user;
  } else {
    // New user registration
    const defaultName = cleanEmail ? (cleanEmail.split('@')[0].charAt(0).toUpperCase() + cleanEmail.split('@')[0].slice(1)) : 'User';
    user = {
      id: normKey,
      email: cleanEmail || '',
      name: name && name.trim() ? name.trim() : defaultName,
      avatar: avatar || (cleanEmail ? `https://unavatar.io/google/${cleanEmail}` : '/images/avatar.jpg'),
      lang: 'id',
      provider: provider || 'google',
      googleId: googleId || null,
      createdAt: now,
      lastLoginAt: now,
      favorites: [],
      playHistory: [],
      tasteProfile: null
    };
    all[normKey] = user;
  }

  persistToDisk();
  return user;
}

function updateUserProfile(rawKey, updates = {}) {
  const all = getAllUsers();
  const user = getUser(rawKey);
  if (!user) return null;

  if (typeof updates.name === 'string' && updates.name.trim()) {
    user.name = updates.name.trim();
  }
  if (typeof updates.avatar === 'string' && updates.avatar.trim()) {
    user.avatar = updates.avatar.trim();
  }
  if (typeof updates.lang === 'string' && updates.lang.trim()) {
    user.lang = updates.lang.trim();
  }
  if (updates.tasteProfile !== undefined) {
    user.tasteProfile = updates.tasteProfile;
  }

  user.updatedAt = Date.now();
  all[user.id] = user;
  persistToDisk();
  return user;
}

function getUserFavorites(rawKey) {
  const user = getUser(rawKey);
  return user ? (user.favorites || []) : [];
}

function toggleUserFavorite(rawKey, track) {
  if (!track || !track.id) return { favorites: [], isFavorited: false };
  const all = getAllUsers();
  let user = getUser(rawKey);

  if (!user) {
    // Create guest / shadow user if not yet logged in
    user = loginOrRegisterUser({ email: rawKey.includes('@') ? rawKey : `${rawKey}@guest.aurasound` });
  }

  if (!Array.isArray(user.favorites)) user.favorites = [];

  const idx = user.favorites.findIndex(f => f.id === track.id);
  let isFavorited = false;

  if (idx !== -1) {
    user.favorites.splice(idx, 1);
    isFavorited = false;
  } else {
    user.favorites.unshift({
      id: track.id,
      title: track.title || 'Untitled',
      artist: track.artist || 'Unknown Artist',
      duration: track.duration || '0:00',
      thumbnail: track.thumbnail || '/icons/icon.svg',
      type: track.type || 'youtube',
      addedAt: Date.now()
    });
    isFavorited = true;
  }

  all[user.id] = user;
  persistToDisk();
  return { favorites: user.favorites, isFavorited };
}

function setUserFavorites(rawKey, favorites) {
  const all = getAllUsers();
  let user = getUser(rawKey);
  if (!user) return [];
  user.favorites = Array.isArray(favorites) ? favorites : [];
  all[user.id] = user;
  persistToDisk();
  return user.favorites;
}

function getUserHistory(rawKey) {
  const user = getUser(rawKey);
  return user ? (user.playHistory || []) : [];
}

function addTrackToHistory(rawKey, track) {
  if (!track || !track.id) return [];
  const all = getAllUsers();
  let user = getUser(rawKey);
  if (!user) return [];

  if (!Array.isArray(user.playHistory)) user.playHistory = [];

  // Remove existing occurrence to avoid duplicates and bring to top
  user.playHistory = user.playHistory.filter(h => h.id !== track.id);
  user.playHistory.unshift({
    id: track.id,
    title: track.title || 'Untitled',
    artist: track.artist || 'Unknown Artist',
    duration: track.duration || '0:00',
    thumbnail: track.thumbnail || '/icons/icon.svg',
    type: track.type || 'youtube',
    playedAt: Date.now()
  });

  // Cap history at 100 recent songs to keep it super lightweight
  if (user.playHistory.length > 100) {
    user.playHistory = user.playHistory.slice(0, 100);
  }

  all[user.id] = user;
  persistToDisk();
  return user.playHistory;
}

function getUserTaste(rawKey) {
  const user = getUser(rawKey);
  return user ? user.tasteProfile : null;
}

function saveUserTaste(rawKey, tasteProfile) {
  return updateUserProfile(rawKey, { tasteProfile });
}

module.exports = {
  getUser,
  loginOrRegisterUser,
  updateUserProfile,
  getUserFavorites,
  toggleUserFavorite,
  setUserFavorites,
  getUserHistory,
  addTrackToHistory,
  getUserTaste,
  saveUserTaste
};
