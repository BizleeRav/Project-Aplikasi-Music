const fs = require('fs');
const path = require('path');

const CREDITS_FILE = path.join(__dirname, 'data', 'device-credits.json');
const DEFAULT_DAILY_CREDITS = 50; // 5 songs per device per day
const COST_PER_SONG = 10;

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadAllCredits() {
  if (fs.existsSync(CREDITS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveAllCredits(data) {
  try {
    const dir = path.dirname(CREDITS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CREDITS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving device credits:', e);
  }
}

/**
 * Get device-isolated credits. Automatically resets daily.
 */
function getDeviceCredits(deviceId, isOwner = false) {
  if (!deviceId || typeof deviceId !== 'string') {
    deviceId = 'guest_default';
  }

  const cleanId = deviceId.trim();
  const all = loadAllCredits();
  const today = getTodayString();

  if (!all[cleanId]) {
    all[cleanId] = {
      credits: DEFAULT_DAILY_CREDITS,
      last_reset: today,
      total_created: 0,
      created_at: new Date().toISOString()
    };
    saveAllCredits(all);
  } else {
    // Check if new day for daily refresh
    if (all[cleanId].last_reset !== today) {
      all[cleanId].credits = DEFAULT_DAILY_CREDITS;
      all[cleanId].last_reset = today;
      saveAllCredits(all);
    }
  }

  const user = all[cleanId];
  return {
    deviceId: cleanId,
    credits: user.credits,
    daily_limit: DEFAULT_DAILY_CREDITS,
    songs_remaining: Math.floor(user.credits / COST_PER_SONG),
    total_created: user.total_created || 0,
    cost_per_song: COST_PER_SONG,
    is_owner: isOwner,
    last_reset: user.last_reset
  };
}

/**
 * Deduct credits from a specific device
 */
function deductDeviceCredits(deviceId, cost = COST_PER_SONG) {
  if (!deviceId) return false;
  const cleanId = deviceId.trim();
  const all = loadAllCredits();
  const today = getTodayString();

  if (!all[cleanId]) {
    getDeviceCredits(cleanId);
  }

  const user = all[cleanId] || { credits: DEFAULT_DAILY_CREDITS };
  if (user.credits < cost) {
    return false;
  }

  user.credits = Math.max(0, user.credits - cost);
  user.total_created = (user.total_created || 0) + 1;
  user.last_used = new Date().toISOString();
  saveAllCredits(all);
  return true;
}

module.exports = {
  getDeviceCredits,
  deductDeviceCredits,
  COST_PER_SONG,
  DEFAULT_DAILY_CREDITS
};
