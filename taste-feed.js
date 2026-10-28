/**
 * AuraSound - AI Taste & Personalized Music Feed Engine 2026
 * Generates custom feeds, genre shelves, mood stations, and AI starter mixes
 * based on user's first-launch taste onboarding selections.
 */

const ytSearch = require('yt-search');
const playlistDb = require('./playlist-db');

// Cache to ensure fast responses (TTL: 2 hours)
const feedCache = new Map();
const albumShelfCache = new Map();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

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
      console.warn('TasteFeed Innertube init warning:', e.message);
      innertubeClient = null;
      return null;
    }
  })();

  return innertubeInitPromise;
}

/**
 * Fetches authentic YouTube Music "Up Next" related tracks based on a video ID.
 * Returns up to 20 algorithmic recommendations from similar artists and vibes.
 */
async function getUpNextTracks(videoId, max = 15) {
  if (!videoId || typeof videoId !== 'string') return [];
  const cleanId = videoId.replace(/.*(?:v=|youtu\.be\/)/, '').split('&')[0];
  if (!cleanId || cleanId.length !== 11) return [];

  const cacheKey = `upnext_${cleanId}`;
  if (feedCache.has(cacheKey)) {
    const entry = feedCache.get(cacheKey);
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.tracks;
    }
  }

  try {
    const yt = await getInnertube();
    if (!yt || !yt.music) return [];

    const upNext = await yt.music.getUpNext(cleanId);
    const contents = upNext?.contents || [];
    // Skip item 0 which is the song itself
    const candidateItems = contents.slice(1, max + 8);

    const tracks = candidateItems.map(item => {
      const id = item.id || item.video_id;
      if (!id) return null;
      const title = item.title?.text || item.title || '';
      const artist = (item.artists || []).map(a => a.name).join(', ') || 'Unknown Artist';
      const duration = item.duration?.text || '3:30';

      let thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      if (item.thumbnails && item.thumbnails.length > 0) {
        const rawUrl = item.thumbnails[0].url || '';
        if (rawUrl.includes('googleusercontent.com')) {
          thumbnail = rawUrl.replace(/=w\d+-h\d+[^"]*/, '=w544-h544-l90-rj');
        } else if (rawUrl) {
          thumbnail = rawUrl;
        }
      }

      return {
        id,
        title: title.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*Official[^)]*\)/gi, '').trim(),
        artist,
        duration,
        thumbnail,
        type: 'youtube',
        isOfficial: true,
        tag: 'RELATED'
      };
    }).filter(t => t && t.id && t.title).slice(0, max);

    feedCache.set(cacheKey, { tracks, timestamp: Date.now() });
    return tracks;
  } catch (e) {
    console.warn(`UpNext fetch error for ${cleanId}:`, e.message);
    return [];
  }
}

function cleanSlug(str = '') {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'music';
}

// Curated Genre Catalog
const GENRES = {
  'pop-indo': {
    id: 'pop-indo',
    name: 'Pop Indonesia',
    icon: '🇮🇩',
    desc: 'Mahalini, Tulus, Bernadya, Tiara Andini, Sal Priadi',
    query: 'Mahalini Tulus Bernadya official music video',
    gradient: 'linear-gradient(135deg, #ec4899, #8b5cf6)'
  },
  'western-pop': {
    id: 'western-pop',
    name: 'Western Pop Top Hits',
    icon: '🌎',
    desc: 'Taylor Swift, Bruno Mars, Billie Eilish, Sabrina Carpenter',
    query: 'Taylor Swift Bruno Mars Billie Eilish official music video',
    gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)'
  },
  'lofi': {
    id: 'lofi',
    name: 'Lo-Fi & Chill Beats',
    icon: '☕',
    desc: 'Chillhop, Cafe Beats, Rileks Belajar & Santai',
    query: 'Lofi Fruits Music official audio single',
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
    query: 'The Weeknd Drake Kendrick Lamar official music video',
    gradient: 'linear-gradient(135deg, #6366f1, #4f46e5)'
  },
  'akustik': {
    id: 'akustik',
    name: 'Akustik & Galau',
    icon: '🎹',
    desc: 'Petikan akustik syahdu, piano lembut, lagu santai',
    query: 'lagu akustik indonesia official video',
    gradient: 'linear-gradient(135deg, #10b981, #059669)'
  },
  'religi': {
    id: 'religi',
    name: 'Religi & Sholawat',
    icon: '🕌',
    desc: 'Opick, Maher Zain, Sholawat merdu menyejukkan hati',
    query: 'Opick Maher Zain official music video',
    gradient: 'linear-gradient(135deg, #059669, #047857)'
  },
  'jazz': {
    id: 'jazz',
    name: 'Jazz & Soul',
    icon: '🎷',
    desc: 'Laufey, Tompi, Norah Jones, Jamie Cullum, Smooth Jazz',
    query: 'Laufey Norah Jones official music video',
    gradient: 'linear-gradient(135deg, #d97706, #b45309)'
  }
};

const GENRE_ALIASES = {
  'j-pop': 'jpop-anime',
  'jpop': 'jpop-anime',
  'jepang': 'jpop-anime',
  'anime': 'jpop-anime',
  'k-pop': 'kpop',
  'kpop': 'kpop',
  'korea': 'kpop',
  'korean': 'kpop',
  'indo': 'pop-indo',
  'indonesia': 'pop-indo',
  'western': 'western-pop',
  'pop': 'western-pop',
  'rock': 'rock-indie',
  'indie': 'rock-indie',
  'edm': 'edm-phonk',
  'phonk': 'edm-phonk',
  'dangdut': 'koplo',
  'rnb': 'hiphop-rnb',
  'hiphop': 'hiphop-rnb'
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
      seconds: v.seconds || 0,
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
async function generatePersonalizedFeed({ name = 'Sobat Musik', genres = ['pop-indo'], mood = 'chill', history = [], favorites = [], importedPlaylists = [], deviceId = null }) {
  const validGenres = Array.isArray(genres) && genres.length > 0 ? genres : ['pop-indo'];
  const userMood = MOODS[mood] ? mood : 'chill';
  const moodObj = MOODS[userMood];

  // Parallel fetch for each selected genre
  const genrePromises = validGenres.map(async (rawGenreId) => {
    const genreId = GENRE_ALIASES[rawGenreId] || rawGenreId;
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

  // If user has listening history or imported albums, compute true UpNext and dynamic mix recommendations in parallel!
  let hypermixPromise = Promise.resolve(null);
  if ((Array.isArray(history) && history.length > 0) || (Array.isArray(importedPlaylists) && importedPlaylists.length > 0)) {
    hypermixPromise = generateHypermix({ history, favorites, importedPlaylists }).catch(err => {
      console.warn('Personalized feed hypermix error:', err.message);
      return null;
    });
  }

  const [genreResults, moodTracks, hypermixResult] = await Promise.all([
    Promise.all(genrePromises),
    moodPromise,
    hypermixPromise
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

  // Build a small Discovery shelf for non-chosen tracks (strictly at the bottom, only 4-5 tracks)
  let discoveryShelf = null;
  try {
    const discTracks = await fetchCategoryTracks('popular songs official music video', 8);
    const filtered = discTracks.filter(t => !seenIds.has(t.id)).slice(0, 5);
    if (filtered.length > 0) {
      discoveryShelf = {
        id: 'shelf-discovery',
        title: '🌐 Eksplorasi Genre Lainnya (Trending Global)',
        subtitle: 'Hanya sedikit rekomendasi musik populer di luar genre favoritmu untuk referensi',
        tracks: filtered
      };
    }
  } catch (e) {
    console.warn('Failed to fetch discovery tracks:', e.message);
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
    relatedTracks: (hypermixResult && Array.isArray(hypermixResult.tracks)) ? hypermixResult.tracks : [],
    dynamicAlbums: (hypermixResult && Array.isArray(hypermixResult.dynamicAlbums) && hypermixResult.dynamicAlbums.length > 0)
      ? hypermixResult.dynamicAlbums
      : null,
    dynamicMixes: (hypermixResult && Array.isArray(hypermixResult.dynamicMixes) && hypermixResult.dynamicMixes.length > 0)
      ? hypermixResult.dynamicMixes
      : null,
    genreShelves,
    moodShelf,
    discoveryShelf,
    aiStarterPlaylist
  };
}

/**
 * AI Related Music, Dynamic Vinyl Shelf & Algorithmic Mixes Engine
 * Derives personalized albums and artist/vibe mixes directly from what the user listened to & liked.
 * Strictly avoids hardcoding and strictly omits duplicate Supermix.
 */
async function generateHypermix({ history = [], favorites = [], importedPlaylists = [] } = {}) {
  const validHistory = Array.isArray(history) ? history.filter(Boolean) : [];
  const validFavorites = Array.isArray(favorites) ? favorites.filter(Boolean) : [];
  const validImported = (Array.isArray(importedPlaylists) ? importedPlaylists : [])
    .filter(p => p && Array.isArray(p.tracks) && p.tracks.length > 0);

  const artistCounts = {};
  const historyTracks = [];
  const artistThumbMap = {};
  const seenIds = new Set();

  // Factor in artists from imported playlists (high weight)
  validImported.forEach(p => {
    (p.tracks || []).slice(0, 10).forEach(t => {
      const cleanArtist = (t.artist || '').split('•')[0].split(',')[0].replace(/feat\..*/i, '').trim();
      if (cleanArtist && cleanArtist.length > 1 && !cleanArtist.includes('AuraSound')) {
        artistCounts[cleanArtist] = (artistCounts[cleanArtist] || 0) + 4;
        if (t.thumbnail && !artistThumbMap[cleanArtist]) artistThumbMap[cleanArtist] = t.thumbnail;
      }
    });
  });

  validFavorites.forEach(f => {
    if (f && f.artist) {
      const cleanArtist = (f.artist || '').split('•')[0].split(',')[0].replace(/feat\..*/i, '').trim();
      if (cleanArtist && cleanArtist.length > 1 && !cleanArtist.includes('AuraSound')) {
        artistCounts[cleanArtist] = (artistCounts[cleanArtist] || 0) + 4; // High weight for liked tracks
        if (f.thumbnail && !artistThumbMap[cleanArtist]) artistThumbMap[cleanArtist] = f.thumbnail;
      }
    }
  });

  validHistory.forEach(h => {
    if (h && h.id && !seenIds.has(h.id)) {
      seenIds.add(h.id);
      historyTracks.push(h);
      const cleanArtist = (h.artist || '').split('•')[0].split(',')[0].replace(/feat\..*/i, '').trim();
      if (cleanArtist && cleanArtist.length > 1 && !cleanArtist.includes('AuraSound')) {
        artistCounts[cleanArtist] = (artistCounts[cleanArtist] || 0) + 2;
        if (h.thumbnail && !artistThumbMap[cleanArtist]) artistThumbMap[cleanArtist] = h.thumbnail;
      }
    }
  });

  let sortedArtists = Object.keys(artistCounts)
    .sort((a, b) => artistCounts[b] - artistCounts[a])
    .slice(0, 6);

  // If no artist could be cleanly parsed, fallback to latest song artist or title
  if (sortedArtists.length === 0 && historyTracks.length > 0) {
    const fallback = historyTracks[0].artist || historyTracks[0].title;
    if (fallback) sortedArtists = [fallback];
  }

  // Cold start baseline if history, favorites & imported playlists are completely empty
  if (sortedArtists.length === 0) {
    sortedArtists = ['YOASOBI', 'NewJeans', 'Ado', 'tuki.', 'aespa', 'Stray Kids'];
  }

  // 1. Query YouTube Music Up Next recommendations from imported albums, history & favorites
  const recentVideoIds = [];

  // Feed up to 2 tracks from imported albums for instant relevant discovery
  for (const p of validImported) {
    for (const t of (p.tracks || [])) {
      const rawId = (t?.id || '').replace(/.*(?:v=|youtu\.be\/)/, '').split('&')[0];
      if (rawId && rawId.length === 11 && !recentVideoIds.includes(rawId)) {
        recentVideoIds.push(rawId);
        if (recentVideoIds.length >= 2) break;
      }
    }
    if (recentVideoIds.length >= 2) break;
  }

  for (const h of validHistory) {
    const rawId = (h?.id || '').replace(/.*(?:v=|youtu\.be\/)/, '').split('&')[0];
    if (rawId && rawId.length === 11 && !recentVideoIds.includes(rawId)) {
      recentVideoIds.push(rawId);
      if (recentVideoIds.length >= 4) break;
    }
  }
  if (recentVideoIds.length < 4) {
    for (const f of validFavorites) {
      const rawId = (f?.id || '').replace(/.*(?:v=|youtu\.be\/)/, '').split('&')[0];
      if (rawId && rawId.length === 11 && !recentVideoIds.includes(rawId)) {
        recentVideoIds.push(rawId);
        if (recentVideoIds.length >= 4) break;
      }
    }
  }

  const upNextPromises = recentVideoIds.map(vid => getUpNextTracks(vid, 15));

  // Fallback / supplement: similar artists and vibes
  const relatedPromises = sortedArtists.slice(0, 4).map(async (art) => {
    try {
      const [similar, artistHits] = await Promise.all([
        fetchCategoryTracks(`lagu mirip ${art} official music video`, 6),
        fetchCategoryTracks(`"${art}" official music video`, 4)
      ]);
      return [...similar, ...artistHits];
    } catch (e) {
      return await fetchCategoryTracks(`"${art}" official music video`, 6);
    }
  });

  // 2. Parallel query YouTube for dynamic official albums/EPs for the Tactile Vinyl Shelf
  const albumPromises = sortedArtists.slice(0, 6).map(async (art) => {
    const cacheKey = `album_shelf_${cleanSlug(art)}`;
    if (albumShelfCache.has(cacheKey)) {
      return albumShelfCache.get(cacheKey);
    }
    try {
      const res = await ytSearch(`"${art}" full album official`);
      const v = (res && res.videos && res.videos.length > 0) ? res.videos[0] : null;
      let title = v?.title || `${art} Definitive Collection`;
      title = title
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\([^)]*(?:full|album|official|audio|stream)[^)]*\)/gi, '')
        .replace(/\b(full\s*album|official\s*album|full\s*ep)\b/gi, '')
        .trim();
      title = title.replace(new RegExp(`^${art}\\s*[-:]\\s*`, 'i'), '').trim();
      if (!title || title.length < 2) title = `${art} Collection`;

      const isEp = /ep|mini/i.test(v?.title || '');
      const dynamicAlbum = {
        id: `album-${cleanSlug(art)}`,
        albumId: `album-${cleanSlug(art)}`,
        title: title,
        artist: art,
        badge: isEp ? 'EP' : 'ALBUM',
        thumbnail: v?.thumbnail || artistThumbMap[art] || '/images/supermix.jpg',
        duration: isEp ? 'EP • Hi-Res' : 'Album • Hi-Res',
        isAlbum: true,
        type: 'youtube'
      };
      albumShelfCache.set(cacheKey, dynamicAlbum);
      return dynamicAlbum;
    } catch (e) {
      return {
        id: `album-${cleanSlug(art)}`,
        albumId: `album-${cleanSlug(art)}`,
        title: `${art} Collection`,
        artist: art,
        badge: 'ALBUM',
        thumbnail: artistThumbMap[art] || '/images/supermix.jpg',
        duration: 'Album • Hi-Res',
        isAlbum: true,
        type: 'youtube'
      };
    }
  });

  const [upNextResults, relatedResults, dynamicAlbums] = await Promise.all([
    Promise.all(upNextPromises),
    Promise.all(relatedPromises),
    Promise.all(albumPromises)
  ]);

  const mixTracks = [];
  const addedIds = new Set(seenIds);

  // Interleave tracks from imported albums
  const importedTracks = [];
  if (validImported.length === 1) {
    (validImported[0].tracks || []).slice(0, 8).forEach(t => {
      if (t && t.id && !addedIds.has(t.id)) {
        addedIds.add(t.id);
        importedTracks.push({
          ...t,
          tag: validImported[0].source === 'spotify' ? 'SPOTIFY' : 'ALBUM'
        });
      }
    });
  } else if (validImported.length >= 2) {
    const maxImpLen = Math.max(...validImported.map(p => (p.tracks || []).length));
    for (let i = 0; i < maxImpLen && importedTracks.length < 10; i++) {
      for (const p of validImported) {
        const t = p.tracks && p.tracks[i];
        if (t && t.id && !addedIds.has(t.id)) {
          addedIds.add(t.id);
          importedTracks.push({
            ...t,
            tag: 'FUSION'
          });
        }
      }
    }
  }

  // Interleave: imported tracks, true UpNext related tracks, and related hits
  const maxUpLen = Math.max(...upNextResults.map(r => r.length), 0);
  const totalRounds = Math.max(importedTracks.length, maxUpLen);

  for (let i = 0; i < totalRounds; i++) {
    if (importedTracks[i]) {
      mixTracks.push(importedTracks[i]);
    }
    for (const list of upNextResults) {
      if (list[i] && !addedIds.has(list[i].id)) {
        addedIds.add(list[i].id);
        mixTracks.push(list[i]);
      }
    }
  }

  // Supplement with artist hits if needed to ensure at least 15 tracks
  relatedResults.forEach(artistTracks => {
    artistTracks.forEach(t => {
      if (!addedIds.has(t.id)) {
        addedIds.add(t.id);
        mixTracks.push(t);
      }
    });
  });

  // If fewer than 8 tracks found, supplement with top trending songs
  if (mixTracks.length < 8) {
    try {
      const topQuery = sortedArtists[0] ? `top hits mirip ${sortedArtists[0]}` : 'trending music official hits';
      const backupTracks = await fetchCategoryTracks(topQuery, 12);
      backupTracks.forEach(t => {
        if (!addedIds.has(t.id)) {
          addedIds.add(t.id);
          mixTracks.push(t);
        }
      });
    } catch (e) {}
  }

  // If still completely empty (cold start with 0 history), allow history tracks
  if (mixTracks.length === 0) {
    historyTracks.forEach(t => mixTracks.push(t));
  }

  // Build Vinyl Shelf cards: Prepend Imported Albums at the beginning of the Tactile Vinyl Shelf!
  const importedVinylCards = validImported.map(p => ({
    id: p.id,
    albumId: p.id,
    title: p.title,
    artist: p.source === 'spotify' ? 'Spotify Import' : (p.source === 'youtube' ? 'YouTube Music Import' : (p.artist || 'Album Import')),
    badge: p.source === 'spotify' ? 'SPOTIFY' : 'ALBUM',
    thumbnail: p.thumbnail || '/images/supermix.jpg',
    duration: `${p.tracks?.length || 0} Lagu • Hi-Res`,
    isAlbum: true,
    isImported: true,
    source: p.source || 'imported',
    type: 'imported'
  }));

  const allDynamicAlbums = [...importedVinylCards, ...dynamicAlbums.filter(Boolean)];

  // 3. Build Algorithmic Dynamic Mixes for "Special Mixed Harmonies" (STRICTLY NO "My Supermix")
  const dynamicMixes = [];

  // If 2+ albums imported, create a special Crossover Fusion Mix!
  if (validImported.length >= 2) {
    const albA = validImported[0];
    const albB = validImported[1];
    dynamicMixes.push({
      id: `mix-fusion-${albA.id}-${albB.id}`,
      albumId: `mix-fusion-${albA.id}-${albB.id}`,
      title: `${albA.title} × ${albB.title} Fusion`,
      artist: `Crossover Hybrid Mix dari 2 album yang kamu impor`,
      thumbnail: albA.thumbnail || albB.thumbnail || '/images/supermix.jpg',
      type: 'mix',
      cardType: 'square'
    });
  }

  // Dedicated album mixes for imported albums
  validImported.forEach(p => {
    dynamicMixes.push({
      id: p.id,
      albumId: p.id,
      title: `${p.title} Mix`,
      artist: `Album ${p.title} (${p.tracks?.length || 0} lagu)`,
      thumbnail: p.thumbnail || '/images/supermix.jpg',
      type: 'mix',
      cardType: 'square'
    });
  });

  // Mix: Liked Music
  if (validFavorites.length > 0) {
    dynamicMixes.push({
      id: 'mix-liked',
      albumId: 'mix-liked',
      title: 'Liked Music',
      artist: `${validFavorites.length} Lagu Favorit`,
      thumbnail: validFavorites[0]?.thumbnail || '/images/liked.jpg',
      type: 'mix',
      cardType: 'square'
    });
  }

  // Mix: Replay Mix (Lagu yang sering diputar ulang)
  if (historyTracks.length > 0) {
    dynamicMixes.push({
      id: 'mix-replay',
      albumId: 'mix-replay',
      title: 'Replay Mix',
      artist: sortedArtists.slice(0, 3).join(', ') || 'Lagu favorit yang sering diulang',
      thumbnail: historyTracks[0]?.thumbnail || '/images/discover.jpg',
      type: 'mix',
      cardType: 'square'
    });
  }

  // Artist Mixes for each Top Artist
  sortedArtists.slice(0, 4).forEach(art => {
    dynamicMixes.push({
      id: `mix-artist-${cleanSlug(art)}`,
      albumId: `mix-artist-${cleanSlug(art)}`,
      title: `${art} Mix`,
      artist: `Koleksi terbaik ${art} & karya serupa`,
      thumbnail: artistThumbMap[art] || '/images/discover.jpg',
      type: 'mix',
      cardType: 'square'
    });
  });

  // Discover Mix
  dynamicMixes.push({
    id: 'showcase-discover',
    albumId: 'showcase-discover',
    title: 'Discover Mix',
    artist: 'Lagu baru yang selaras dengan seleramu',
    thumbnail: '/images/chill_vibes.jpg',
    type: 'mix',
    cardType: 'square'
  });

  // Focus Beats: Lo-fi Study
  dynamicMixes.push({
    id: 'showcase-focus-beats',
    albumId: 'showcase-focus-beats',
    title: 'Focus Beats: Lo-fi Study',
    artist: 'Ketukan lo-fi untuk konsentrasi & produktivitas',
    thumbnail: '/images/focus_beats.jpg',
    type: 'mix',
    cardType: 'square'
  });

  const artistLabel = sortedArtists.length > 0 ? sortedArtists.join(', ') : 'lagu yang kamu dengar';

  let mixTitle = '✨ Lagu yang Berkaitan';
  let mixDesc = `Diramu otomatis berdasarkan musik yang kamu dengarkan (${artistLabel}).`;
  if (validImported.length === 1) {
    mixTitle = `✨ Terinspirasi dari ${validImported[0].title}`;
    mixDesc = `Paduan lagu dari album "${validImported[0].title}" dan rekomendasi algoritma AuraSound.`;
  } else if (validImported.length >= 2) {
    mixTitle = `✨ Crossover Mix: ${validImported[0].title} & ${validImported[1].title}`;
    mixDesc = `Perpaduan hybrid dari 2 album yang Anda impor dan riwayat musik Anda.`;
  }

  return {
    success: true,
    isReady: true,
    count: validHistory.length,
    artists: sortedArtists,
    title: mixTitle,
    description: mixDesc,
    tracks: mixTracks.slice(0, 24),
    dynamicAlbums: allDynamicAlbums,
    dynamicMixes: dynamicMixes
  };
}

module.exports = {
  GENRES,
  MOODS,
  getUpNextTracks,
  generatePersonalizedFeed,
  generateHypermix
};

