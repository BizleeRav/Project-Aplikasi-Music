/**
 * AuraSound - Taste Profile & Intelligent Music Recommendation Engine
 * Tracks user preferences: Likes, Complete Plays, Quick Skips, and Play Counts.
 * Calculates dynamic Artist affinity scores.
 * Powers "My Supermix", "Liked Music Radio", and live personalized Beranda sections.
 */

class TasteEngine {
  constructor() {
    this.storageKey = 'aurasound_taste_profile';
    this.taste = this.loadTasteProfile();
    this.currentTrack = null;
    this.currentPlayStart = null;
  }

  loadTasteProfile() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load taste profile from localStorage:', e);
    }
    return {
      artists: {}, // { [artistName]: { score: 10, plays: 2, likes: 1, skips: 0, lastPlayed: 0 } }
      genres: {},
      history: [], // Recent tracks played
      stats: { totalPlays: 0, totalLikes: 0, totalSkips: 0 }
    };
  }

  saveTasteProfile() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.taste));
    } catch (e) {
      console.warn('Failed to save taste profile to localStorage:', e);
    }
  }

  recordTrackStart(track) {
    if (!track || !track.id) return;
    this.currentTrack = track;
    this.currentPlayStart = Date.now();

    // Clean artist name
    const artist = (track.artist || 'AuraSound').split('•')[0].split(',')[0].trim();

    // Ensure artist entry exists
    if (!this.taste.artists[artist]) {
      this.taste.artists[artist] = { score: 1, plays: 0, likes: 0, skips: 0, lastPlayed: Date.now() };
    }
    this.taste.artists[artist].lastPlayed = Date.now();

    // Add to history (avoid duplicates at the top, limit to 60)
    this.taste.history = (this.taste.history || []).filter(h => h.id !== track.id);
    this.taste.history.unshift({
      id: track.id,
      title: track.title,
      artist: track.artist || 'AuraSound',
      thumbnail: track.thumbnail || '/images/supermix.jpg',
      duration: track.duration || '3:30',
      type: track.type || 'youtube',
      playedAt: Date.now()
    });

    if (this.taste.history.length > 60) {
      this.taste.history = this.taste.history.slice(0, 60);
    }

    this.saveTasteProfile();
  }

  recordTrackEnd(track, timePlayedSeconds = 0, completed = false) {
    const targetTrack = track || this.currentTrack;
    if (!targetTrack) return;

    const artist = (targetTrack.artist || 'AuraSound').split('•')[0].split(',')[0].trim();
    if (!this.taste.artists[artist]) {
      this.taste.artists[artist] = { score: 0, plays: 0, likes: 0, skips: 0, lastPlayed: Date.now() };
    }
    const stat = this.taste.artists[artist];
    stat.lastPlayed = Date.now();

    if (completed || timePlayedSeconds >= 45) {
      // Meaningful or complete play: +3 points
      stat.plays = (stat.plays || 0) + 1;
      stat.score = (stat.score || 0) + 3;
      this.taste.stats.totalPlays = (this.taste.stats.totalPlays || 0) + 1;
    } else if (timePlayedSeconds < 15 && timePlayedSeconds > 0) {
      // Quick skip within 15 seconds: -2 points (down to min 0)
      stat.skips = (stat.skips || 0) + 1;
      stat.score = Math.max(0, (stat.score || 0) - 2);
      this.taste.stats.totalSkips = (this.taste.stats.totalSkips || 0) + 1;
    }

    this.saveTasteProfile();
  }

  recordLike(track, isLiked) {
    if (!track) return;
    const artist = (track.artist || 'AuraSound').split('•')[0].split(',')[0].trim();
    if (!this.taste.artists[artist]) {
      this.taste.artists[artist] = { score: 0, plays: 0, likes: 0, skips: 0, lastPlayed: Date.now() };
    }
    const stat = this.taste.artists[artist];

    if (isLiked) {
      stat.likes = (stat.likes || 0) + 1;
      stat.score = (stat.score || 0) + 10; // High affinity boost
      this.taste.stats.totalLikes = (this.taste.stats.totalLikes || 0) + 1;
    } else {
      stat.likes = Math.max(0, (stat.likes || 0) - 1);
      stat.score = Math.max(0, (stat.score || 0) - 10);
      this.taste.stats.totalLikes = Math.max(0, (this.taste.stats.totalLikes || 0) - 1);
    }

    this.saveTasteProfile();
  }

  getTopArtists(limit = 6) {
    return Object.entries(this.taste.artists || {})
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit);
  }

  getRecentHistory(limit = 12) {
    return (this.taste.history || []).slice(0, limit);
  }

  generateSupermixPayload() {
    const topArtists = this.getTopArtists(5).map(a => a.name);
    const favorites = (window.app && window.app.favorites) ? window.app.favorites.slice(0, 15) : [];
    const history = this.getRecentHistory(15);
    return { topArtists, favorites, history };
  }
}

window.tasteEngine = new TasteEngine();
