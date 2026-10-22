/**
 * AuraSound - AI Taste & Personalized Music Feed Engine 2026
 * Generates custom feeds, genre shelves, mood stations, and AI starter mixes
 * based on user's first-launch taste onboarding selections.
 */

const ytSearch = require('yt-search');
const playlistDb = require('./playlist-db');

// Cache to ensure fast responses (TTL: 2 hours)
const feedCache = new Map();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

// Curated Genre Catalog
const GENRES = {
  'pop-indo': {
    id: 'pop-indo',
    name: 'Pop Indonesia',
    icon: '🇮🇩',
    desc: 'Mahalini, Tulus, Bernadya, Tiara Andini, Sal Priadi',
    query: 'lagu pop indonesia hits official music video',
    gradient: 'linear-gradient(135deg, #ec4899, #8b5cf6)'
  },
  'western-pop': {
    id: 'western-pop',
    name: 'Western Pop Top Hits',
    icon: '🌎',
    desc: 'Taylor Swift, Bruno Mars, Billie Eilish, Sabrina Carpenter',
    query: 'billboard top pop hits official music video',
    gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)'
  },
  'lofi': {
    id: 'lofi',
    name: 'Lo-Fi & Chill Beats',
    icon: '☕',
    desc: 'Chillhop, Cafe Beats, Rileks Belajar & Santai',
    query: 'lofi hip hop chill beats relax single track',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)'
  },
  'rock-indie': {
    id: 'rock-indie',
    name: 'Rock & Indie',
    icon: '🎸',
    desc: 'Hindia, Sheila On 7, Feast, Coldplay, Arctic Monkeys',
    query: 'indie pop rock indonesia official mv',
    gradient: 'linear-gradient(135deg, #ef4444, #b91c1c)'
  },
  'edm-phonk': {
    id: 'edm-phonk',
    name: 'EDM, Phonk & Bass',
    icon: '⚡',
    desc: 'Drift Phonk, Alan Walker, Martin Garrix, Bass Boosted',
    query: 'drift phonk bass edm festival hits official audio',
    gradient: 'linear-gradient(135deg, #8b5cf6, #3b82f6)'
  },
  'kpop': {
    id: 'kpop',
    name: 'K-Pop Hits',
    icon: '🌸',
    desc: 'NewJeans, aespa, BTS, BLACKPINK, LE SSERAFIM',
    query: 'top kpop official mv hits',
    gradient: 'linear-gradient(135deg, #f43f5e, #ec4899)'
  },
  'jpop-anime': {
    id: 'jpop-anime',
    name: 'J-Pop & Anime OST',
    icon: '🎌',
    desc: 'Yoasobi, Ado, Kenshi Yonezu, Lisa, Anime Opening',
    query: 'top jpop anime ost official mv',
    gradient: 'linear-gradient(135deg, #ec4899, #a855f7)'
  },
  'koplo': {
    id: 'koplo',
    name: 'Dangdut Koplo Modern',
    icon: '💃',
    desc: 'Denny Caknan, Gilga Sahid, Happy Asmara, Shinta Arsinta',
    query: 'dangdut koplo modern official music video',
    gradient: 'linear-gradient(135deg, #eab308, #f97316)'
  },
  'hiphop-rnb': {
    id: 'hiphop-rnb',
    name: 'Hip-Hop & R&B',
    icon: '🎤',
    desc: 'The Weeknd, Drake, Kendrick Lamar, Rich Brian',
    query: 'hip hop rnb hits official music video',
    gradient: 'linear-gradient(135deg, #6366f1, #4f46e5)'
  },
  'akustik': {
    id: 'akustik',
    name: 'Akustik & Galau',
    icon: '🎹',
    desc: 'Petikan akustik syahdu, piano lembut, lagu santai',
    query: 'lagu akustik santai indonesia official lyric',
    gradient: 'linear-gradient(135deg, #10b981, #059669)'
  },
  'religi': {
    id: 'religi',
    name: 'Religi & Sholawat',
    icon: '🕌',
    desc: 'Opick, Maher Zain, Sholawat merdu menyejukkan hati',
    query: 'lagu religi islam sholawat merdu official',
    gradient: 'linear-gradient(135deg, #059669, #047857)'
  },
  'jazz': {
    id: 'jazz',
    name: 'Jazz & Soul',
    icon: '🎷',
    desc: 'Laufey, Tompi, Norah Jones, Jamie Cullum, Smooth Jazz',
    query: 'smooth modern jazz soul official audio',
    gradient: 'linear-gradient(135deg, #d97706, #b45309)'
  }
};

// Curated Mood Catalog
const MOODS = {
  'chill': {
    id: 'chill',
    name: 'Santai & Rileks',
    icon: '🧘',
    desc: 'Slow tempo, soothing vibes, healing',
    query: 'lagu santai akustik chill relax official',
    gradient: 'linear-gradient(135deg, #10b981, #06b6d4)'
  },
  'focus': {
    id: 'focus',
    name: 'Fokus Belajar & Kerja',
    icon: '📚',
    desc: 'Instrumental, ambient beats, deep work flow',
    query: 'deep focus study ambient instrumental beats',
    gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)'
  },
  'energy': {
    id: 'energy',
    name: 'Semangat & Workout',
    icon: '⚡',
    desc: 'Upbeat pumps, motivation booster, workout gym',
    query: 'workout pump energy booster music official',
    gradient: 'linear-gradient(135deg, #f97316, #ef4444)'
  },
  'melancholic': {
    id: 'melancholic',
    name: 'Melow & Galau',
    icon: '💔',
    desc: 'Lagu emosional, lirik mendalam, teman syahdu',
    query: 'lagu galau indonesia paling sedih melow official',
    gradient: 'linear-gradient(135deg, #64748b, #475569)'
  },
  'party': {
    id: 'party',
    name: 'Party & Ceria',
    icon: '🎉',
    desc: 'Dance party, ceria, upbeat grooves',
    query: 'party dance club remix upbeat viral',
    gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)'
  }
};

/**
 * Searches YouTube for single tracks (filters out multi-hour compilation mixes)
 */
async function fetchCategoryTracks(query, max = 10) {
  const cacheKey = `yt_query_${query}`;
  const cached = feedCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.tracks;
  }

  try {
    const res = await ytSearch(query);
    const videos = res.videos || [];
    // Prioritize single tracks between 1m20s and 8 minutes
    let singles = videos.filter(v => v.seconds >= 80 && v.seconds <= 500);
    if (singles.length < 5) {
      singles = videos.filter(v => v.seconds <= 900);
    }
    const tracks = singles.slice(0, max).map(v => ({
      id: v.videoId,
      title: v.title.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*Official[^)]*\)/gi, '').trim(),
      artist: v.author?.name || 'Artist',
      duration: v.timestamp || '3:30',
      views: v.views ? `${(v.views / 1000000).toFixed(1)}M views` : '',
      thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
      type: 'youtube'
    }));

    feedCache.set(cacheKey, { tracks, timestamp: Date.now() });
    return tracks;
  } catch (err) {
    console.error(`Error querying YouTube for "${query}":`, err.message);
    return [];
  }
}

/**
 * Main personalized feed generator
 */
async function generatePersonalizedFeed({ name = 'Sobat Musik', genres = ['pop-indo'], mood = 'chill', deviceId = null }) {
  const validGenres = Array.isArray(genres) && genres.length > 0 ? genres : ['pop-indo'];
  const userMood = MOODS[mood] ? mood : 'chill';
  const moodObj = MOODS[userMood];

  // Parallel fetch for each selected genre
  const genrePromises = validGenres.map(async (genreId) => {
    const genreMeta = GENRES[genreId] || GENRES['pop-indo'];
    const tracks = await fetchCategoryTracks(genreMeta.query, 12);
    return {
      genreId,
      meta: genreMeta,
      tracks
    };
  });

  // Fetch mood tracks
  const moodPromise = fetchCategoryTracks(moodObj.query, 12);

  const [genreResults, moodTracks] = await Promise.all([
    Promise.all(genrePromises),
    moodPromise
  ]);

  // Combine top tracks from selected genres for Quick Picks & AI Starter Playlist
  const seenIds = new Set();
  const allMixedTracks = [];

  genreResults.forEach(gr => {
    gr.tracks.forEach(t => {
      if (!seenIds.has(t.id)) {
        seenIds.add(t.id);
        allMixedTracks.push({ ...t, genreTag: gr.meta.name });
      }
    });
  });

  moodTracks.forEach(t => {
    if (!seenIds.has(t.id)) {
      seenIds.add(t.id);
      allMixedTracks.push({ ...t, genreTag: moodObj.name });
    }
  });

  // Top 9 tracks for Quick Picks
  const quickPicks = allMixedTracks.slice(0, 9);

  // Build Genre Shelves
  const genreShelves = genreResults.map((gr, idx) => ({
    id: `shelf-${gr.genreId}`,
    title: `${gr.meta.icon} Top Hits ${gr.meta.name}`,
    subtitle: gr.meta.desc,
    gradient: gr.meta.gradient,
    tracks: gr.tracks
  }));

  // Build Mood Shelf
  const moodShelf = {
    id: `shelf-mood-${moodObj.id}`,
    title: `${moodObj.icon} Vibe Pilihan Kamu: ${moodObj.name}`,
    subtitle: moodObj.desc,
    gradient: moodObj.gradient,
    tracks: moodTracks
  };

  // Build AI Starter Playlist
  const topGenreNames = genreResults.map(g => g.meta.name).join(', ');
  const aiStarterPlaylist = {
    id: `pl-ai-${Date.now()}`,
    title: `Mix Favorit ${name} 🎵`,
    description: `Diramu spesial oleh AI AuraSound berdasarkan selera pilihanmu: ${topGenreNames}.`,
    tracks: allMixedTracks.slice(0, 15),
    thumbnail: quickPicks[0]?.thumbnail || '/images/supermix.jpg',
    createdAt: new Date().toLocaleDateString('id-ID'),
    isImported: false,
    isAiMix: true,
    deviceId: deviceId
  };

  // If deviceId provided, auto-save this playlist into device's playlist database
  if (deviceId) {
    try {
      const existing = playlistDb.getAllPlaylists(deviceId);
      // Only insert if user has no playlists yet
      if (existing.length === 0) {
        playlistDb.addOrUpdatePlaylist(aiStarterPlaylist);
      }
    } catch (e) {
      console.warn('Failed to auto-seed starter playlist:', e.message);
    }
  }

  // Taste summary string for Hero stage
  const genreNameList = genreResults.map(g => g.meta.name);
  const tasteSummary = `${genreNameList.slice(0, 2).join(' • ')} • ${moodObj.name}`;

  return {
    success: true,
    user: {
      name,
      avatar: '/images/avatar.jpg'
    },
    tasteSummary,
    profile: {
      name,
      genres: validGenres,
      mood: userMood
    },
    quickPicks,
    genreShelves,
    moodShelf,
    aiStarterPlaylist
  };
}

module.exports = {
  GENRES,
  MOODS,
  generatePersonalizedFeed
};
