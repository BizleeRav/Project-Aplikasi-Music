const axios = require('axios');
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
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const CREATIONS_FILE = path.join(DATA_DIR, 'suno-creations.json');

// Ensure writable paths exist
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CREATIONS_FILE) && fs.existsSync(path.join(__dirname, 'data', 'suno-creations.json'))) {
    fs.copyFileSync(path.join(__dirname, 'data', 'suno-creations.json'), CREATIONS_FILE);
  } else if (!fs.existsSync(CREATIONS_FILE)) {
    fs.writeFileSync(CREATIONS_FILE, '[]', 'utf8');
  }
  if (!fs.existsSync(CONFIG_FILE) && fs.existsSync(path.join(__dirname, 'config.json'))) {
    fs.copyFileSync(path.join(__dirname, 'config.json'), CONFIG_FILE);
  }
} catch (e) {}

// Helper to get or save configuration
function getConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveConfig(data) {
  const current = getConfig();
  const updated = { ...current, ...data };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
  try {
    const repoConfig = path.join(__dirname, 'config.json');
    if (CONFIG_FILE !== repoConfig) {
      fs.writeFileSync(repoConfig, JSON.stringify(updated, null, 2), 'utf8');
    }
  } catch (e) {}
  return updated;
}

/**
 * Persistent Storage for User Creations (Pure Lagu Buatan Kita)
 */
function getCreations(deviceId = null) {
  if (fs.existsSync(CREATIONS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CREATIONS_FILE, 'utf8'));
      const list = Array.isArray(data) ? data : [];
      if (deviceId) {
        return list.filter(t => !t.deviceId || t.deviceId === deviceId);
      }
      return list;
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveCreations(list) {
  try {
    const dir = path.dirname(CREATIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CREATIONS_FILE, JSON.stringify(list, null, 2), 'utf8');
    const repoFile = path.join(__dirname, 'data', 'suno-creations.json');
    if (CREATIONS_FILE !== repoFile) {
      try { fs.writeFileSync(repoFile, JSON.stringify(list, null, 2), 'utf8'); } catch (e) {}
    }
  } catch (e) {
    console.error('Error saving creations:', e);
  }
}

let isSyncingFeed = false;
async function syncOfficialFeed(rawToken, deviceId = null) {
  if (isSyncingFeed) return [];
  isSyncingFeed = true;
  try {
    let cleanJwt = (rawToken || '').replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
    if (!cleanJwt || cleanJwt.length < 20) {
      const cfg = getConfig();
      cleanJwt = (cfg.suno_api_key || '').trim();
    }
    if ((!cleanJwt || cleanJwt.length < 20) && typeof global.getWarmEngineSessionToken === 'function') {
      try {
        const warmTok = await global.getWarmEngineSessionToken();
        if (warmTok && warmTok.length > 20) cleanJwt = warmTok;
      } catch (e) {}
    }
    if (!cleanJwt || cleanJwt.length < 20) return [];

    let clips = [];
    const headers = {
      'Authorization': `Bearer ${cleanJwt}`,
      'Cookie': `__session=${cleanJwt}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Origin': 'https://suno.com',
      'Referer': 'https://suno.com/'
    };

    // 1. Try feed/v3 (POST)
    try {
      const res = await axios.post('https://studio-api.prod.suno.com/api/feed/v3', {
        cursor: null,
        limit: 30
      }, {
        headers,
        timeout: 9000
      });
      if (Array.isArray(res.data?.clips) && res.data.clips.length > 0) {
        clips = res.data.clips;
      }
    } catch (e1) {}

    // 2. Try feed/v2 (GET) fallback
    if (!clips || clips.length === 0) {
      try {
        const res2 = await axios.get('https://studio-api.prod.suno.com/api/feed/v2', {
          headers,
          timeout: 9000
        });
        if (Array.isArray(res2.data?.clips) && res2.data.clips.length > 0) {
          clips = res2.data.clips;
        } else if (Array.isArray(res2.data) && res2.data.length > 0) {
          clips = res2.data;
        }
      } catch (e2) {}
    }

    if (Array.isArray(clips) && clips.length > 0) {
      const formatted = clips.map(c => formatOfficialClipTrack(c, {
        rawTitle: c.title,
        rawTags: c.metadata?.tags || c.tags,
        rawPrompt: c.metadata?.gpt_description_prompt || c.metadata?.prompt || c.prompt,
        customLyricsText: c.metadata?.prompt || c.lyrics,
        officialMv: c.major_model_version || 'v6-mini',
        deviceId
      }));

      // Invert array so newest clips get unshifted to the top of creations
      [...formatted].reverse().forEach(track => {
        addCreation(track, deviceId);
      });
      console.log(`[Suno Sync] Successfully synchronized ${formatted.length} songs from official Suno account!`);
      return formatted;
    }
    return [];
  } catch (err) {
    console.warn('[Suno Sync] Error syncing official feed:', err.message);
    return [];
  } finally {
    isSyncingFeed = false;
  }
}

function addCreation(track, deviceId = null) {
  if (!track || !track.id) return;
  const list = getCreations(); // load all
  const existingIdx = list.findIndex(t => t.id === track.id);
  if (existingIdx !== -1) {
    const prev = list[existingIdx];
    const merged = {
      ...prev,
      ...track,
      title: (track.title && track.title !== 'Membuat Judul & Lirik...' && track.title !== 'Lagu Baru')
        ? track.title
        : (prev.title && prev.title !== 'Membuat Judul & Lirik...' ? prev.title : (track.title || prev.title || 'Lagu Baru')),
      tags: (track.tags && track.tags !== 'Suno AI') ? track.tags : (prev.tags || track.tags || 'Suno AI'),
      prompt: track.prompt || prev.prompt || '',
      lyrics: (track.lyrics && track.lyrics.trim()) ? track.lyrics : (prev.lyrics || ''),
      deviceId: track.deviceId || prev.deviceId || deviceId || undefined,
      created_at: prev.created_at || track.created_at || 'Hari ini'
    };
    list[existingIdx] = merged;
    saveCreations(list);
    return merged;
  }

  if (deviceId && !track.deviceId) {
    track.deviceId = deviceId;
  }
  list.unshift(track);
  saveCreations(list);
  return track;
}

function deleteCreation(id) {
  const list = getCreations();
  const filtered = list.filter(t => t.id !== id);
  saveCreations(filtered);
  return { success: true, count: filtered.length };
}

function getCreationsPaginated({ page = 1, pageSize = 12, query = '', deviceId = null, apiKey = null }) {
  if (apiKey && apiKey.length > 20) {
    // sync removed
  }
  const all = getCreations(deviceId);
  const q = (query || '').toLowerCase().trim();

  const filtered = q
    ? all.filter(c => 
        (c.title && c.title.toLowerCase().includes(q)) ||
        (c.tags && c.tags.toLowerCase().includes(q)) ||
        (c.prompt && c.prompt.toLowerCase().includes(q)) ||
        (c.lyrics && c.lyrics.toLowerCase().includes(q))
      )
    : all;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.max(1, parseInt(pageSize, 10) || 12);
  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / size) || 1;
  const startIdx = (pageNum - 1) * size;
  const clips = filtered.slice(startIdx, startIdx + size);

  return {
    success: true,
    clips,
    page: pageNum,
    totalPages,
    totalCount,
    hasMore: pageNum < totalPages
  };
}

function extractAudioUrl(clip) {
  if (!clip) return '';
  if (Array.isArray(clip.media_urls) && clip.media_urls.length > 0) {
    const valid = clip.media_urls.find(m => m.url && !m.url.includes('/api/forbidden'));
    if (valid) return valid.url;
  }
  if (clip.audio_url && !clip.audio_url.includes('/api/forbidden')) {
    return clip.audio_url;
  }
  if (clip.id) {
    return `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clip.id}.m4a`;
  }
  return '';
}

/**
 * Built-in AI Music Sound & Composition Pool
 * Curated high-fidelity audio streams for zero-friction auto-generation
 */
const AUTO_SOUND_POOL = [
  {
    genre: 'epic_choir',
    audio_url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/fd76b10f-6084-43a4-862b-fdd2bdea70eb.m4a',
    thumbnail: 'https://cdn2.suno.ai/image_fd76b10f-6084-43a4-862b-fdd2bdea70eb.jpeg',
    duration: '4:11',
    seconds: 251,
    style: 'Epic Fantasy Orchestral Choir, Cinematic Symphony, Female Vocal & Grand Mixed Choir'
  },
  {
    genre: 'fantasy_cinematic',
    audio_url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/ad7577d7-a0d2-48bd-945d-5adce5a6a6bc.m4a',
    thumbnail: 'https://cdn2.suno.ai/image_ad7577d7-a0d2-48bd-945d-5adce5a6a6bc.jpeg',
    duration: '4:47',
    seconds: 287,
    style: 'Cinematic Fantasy Soundtrack, Epic Strings, Haunting Choir & Dramatic Climax'
  },
  {
    genre: 'symphonic_rock',
    audio_url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/09e212d4-267f-4908-812b-f86949be26ac.m4a',
    thumbnail: 'https://cdn2.suno.ai/image_09e212d4-267f-4908-812b-f86949be26ac.jpeg',
    duration: '3:10',
    seconds: 190,
    style: 'Symphonic Rock, Orchestral Strings, Choral Harmony & Expressive Duet'
  },
  {
    genre: 'acoustic',
    audio_url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/b694677e-ac85-4f6c-be9c-76d2e5a6323f.m4a',
    thumbnail: 'https://cdn2.suno.ai/image_b694677e-ac85-4f6c-be9c-76d2e5a6323f.jpeg',
    duration: '3:15',
    seconds: 195,
    style: 'Acoustic Guitar, Warm Melodic Vocal, Organic Village Ambience'
  },
  {
    genre: 'ballad',
    audio_url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/b0c9aea4-4ade-40d0-a339-dd4ca7f16eff.m4a',
    thumbnail: 'https://cdn2.suno.ai/image_b0c9aea4-4ade-40d0-a339-dd4ca7f16eff.jpeg',
    duration: '3:22',
    seconds: 202,
    style: 'Romantic Acoustic Ballad, Gentle Piano Chords, Warm Emotional Vocals'
  },
  {
    genre: 'pop',
    audio_url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/6a422c57-c8fd-4307-a6d6-c4a16db72c66.m4a',
    thumbnail: 'https://cdn2.suno.ai/image_6a422c57-c8fd-4307-a6d6-c4a16db72c66.jpeg',
    duration: '3:18',
    seconds: 198,
    style: 'Modern Melodic Pop, Rich Layered Harmony, Studio Master'
  },
  {
    genre: 'dance',
    audio_url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/a4d2af95-6506-47a5-b6cd-adb7af51af29.m4a',
    thumbnail: 'https://cdn2.suno.ai/image_a4d2af95-6506-47a5-b6cd-adb7af51af29.jpeg',
    duration: '3:20',
    seconds: 200,
    style: 'Upbeat Cinematic Folk-Pop Dance, Lively Harmony, Handclaps & Accordion'
  },
  {
    genre: 'synthwave',
    audio_url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/e9543b14-bfc4-437c-98bd-7da5cdb64a83.m4a',
    thumbnail: 'https://cdn2.suno.ai/image_e9543b14-bfc4-437c-98bd-7da5cdb64a83.jpeg',
    duration: '2:04',
    seconds: 124,
    style: 'Retro Synthwave, Cyberpunk Arpeggio, 80s Analog Synthesizer'
  },
  {
    genre: 'oriental',
    audio_url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/9d4d10b1-318e-4595-ac8a-3bb6b25a7949.m4a',
    thumbnail: 'https://cdn2.suno.ai/image_9d4d10b1-318e-4595-ac8a-3bb6b25a7949.jpeg',
    duration: '3:08',
    seconds: 188,
    style: 'Ancient Oriental Acoustic, Guzheng, Xiao Flute, Delicate Strings & Graceful Vocal'
  },
  {
    genre: 'anime',
    audio_url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/c96c54d0-118d-4858-8791-82c2ad4f0ba5.m4a',
    thumbnail: 'https://cdn2.suno.ai/image_c96c54d0-118d-4858-8791-82c2ad4f0ba5.jpeg',
    duration: '3:45',
    seconds: 225,
    style: 'J-Pop Anime Opening, Uplifting Melody, Bright Piano & Strings'
  },
  {
    genre: 'kpop',
    audio_url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/1a0f8150-a6ec-4236-a512-13844331c103.m4a',
    thumbnail: 'https://cdn2.suno.ai/image_1a0f8150-a6ec-4236-a512-13844331c103.jpeg',
    duration: '3:19',
    seconds: 199,
    style: 'K-Pop Modern Dance Pop, Layered Vocal Harmonies & Punchy Rhythm'
  }
];

/**
 * Detect whether input text is a musical prompt instruction / style description
 * rather than actual singable lyrics
 */
function isPromptInstruction(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();

  const signals = [
    'vocal arrangement', 'instruments:', 'instrument:', 'begin with', 'gradually introduce',
    'create a magical atmosphere', 'melodic progression', 'no rock', 'no rap',
    'no electronic', 'high-quality', 'must remain', 'soundtrack', 'orchestral choir',
    'female lead vocalist', 'male and female choir', 'french horns', 'woodwinds',
    'percussion', 'timpani', 'cinematic drums', 'tempo', 'bpm', 'acoustic guitar, warm',
    '140 bpm', '125 bpm', 'mastering', 'production', 'symphonic metal', 'duet chorus',
    'folk ensemble', 'section 1', 'section 2', 'vocal structure', 'female solo', 'male solo',
    'lead vocal', 'lead vocalist', 'acoustic guitar and accordion', 'whimsical', 'european folk',
    'folk dance', 'only one female', 'structure:'
  ];

  let matches = 0;
  for (const s of signals) {
    if (t.includes(s)) matches++;
  }
  if (matches >= 2) return true;
  if (t.includes('vocal arrangement:') || t.includes('instruments:') || t.includes('vocal arrangement') || t.includes('vocal structure')) return true;
  if (/section \d+/i.test(t) && (t.includes('solo') || t.includes('instruments') || t.includes('ensemble') || t.includes('tempo') || t.includes('vocal'))) return true;

  const hasLyricMarkers = /\[(verse|chorus|intro|bridge|outro|pre-chorus|hook|bait|reff)/i.test(text);
  if (!hasLyricMarkers) {
    if (t.includes('lagu ') || t.includes('tentang ') || t.includes('bertemakan ') || t.includes('gaya musik ') || t.includes('soundtrack') || t.includes('create a ') || t.includes('create an ') || t.includes('buatkan ') || t.includes('buat lagu')) {
      return true;
    }
    if (t.includes('cinematic') && (t.includes('vocals') || t.includes('soundtrack') || t.includes('orchestral') || t.includes('choir'))) {
      return true;
    }
  }

  return false;
}

/**
 * Returns true ONLY when the user explicitly wrote genuine multiline singable lyrics
 * with standalone section headers like [Verse 1], [Chorus], [Bait 1], [Reff].
 */
function isGenuineCustomLyrics(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 25) return false;
  if (isPromptInstruction(trimmed)) return false;
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 4) return false;
  return lines.some(l =>
    /^\[(verse|chorus|pre-chorus|post-chorus|bridge|intro|outro|hook|refrain|bait|reff|pra-reff|interlude|solo|coda)(\s*\d+|\s*[:\-].*)?\]$/i.test(l)
  );
}

/**
 * Intelligent Tags Derivation from Prompt if user left it blank
 */
function deriveTagsFromPrompt(prompt, userTags) {
  if (userTags && userTags.trim().length > 2) return userTags.trim();
  const p = (prompt || '').toLowerCase();
  if (p.includes('epic') || p.includes('choir') || p.includes('orchestr') || p.includes('fantasy') || p.includes('symphon') || p.includes('kingdom')) {
    return 'Epic Fantasy Orchestral Choir, Cinematic Symphony, Female Vocal & Grand Choir, 432Hz Master';
  }
  if (p.includes('synthwave') || p.includes('cyber') || p.includes('retro') || p.includes('80s')) {
    return 'Retro Synthwave, Cyberpunk Arpeggio, 80s Synthesizer, Analog Master';
  }
  if (p.includes('rock') || p.includes('metal')) {
    if (!/\b(no|tanpa|not)\s+rock\b/i.test(prompt)) {
      return 'Emotional Symphonic Rock, Driving Guitars, Dynamic Live Performance';
    }
  }
  if (p.includes('koplo') || p.includes('dangdut')) {
    return 'Dangdut Koplo Modern, Kendang Asik, Upbeat Melodic Vocal';
  }
  if (p.includes('ballad') || p.includes('romantis') || p.includes('piano')) {
    return 'Acoustic Piano Ballad, Warm Melodic Vocal, Emotional Studio Mix';
  }
  if (p.includes('lofi') || p.includes('chill') || p.includes('senja')) {
    return 'Lo-Fi Chill Beats, Relaxing Ambient Melodies, Warm Senja Vinyl';
  }
  if (p.includes('j-pop') || p.includes('anime') || p.includes('japanese')) {
    return 'J-Pop Anime Opening, Uplifting Melody, Bright Piano & Strings';
  }
  if (p.includes('k-pop') || p.includes('kpop') || p.includes('korean')) {
    return 'K-Pop Modern Dance Pop, Layered Harmonies, Punchy Bass';
  }
  return 'Indonesian Pop, Emotional Vocal, 432Hz Studio Mix';
}

/**
 * Select curated sound from pool matching requested style, safely ignoring negative prompts
 */
function pickSoundForTheme(prompt, tags) {
  let pClean = (prompt + ' ' + (tags || '')).toLowerCase();
  // Strip negative constraints like "No rock", "tanpa drum", so they don't falsely match rock
  pClean = pClean.replace(/\b(no|tanpa|not|jangan)\s+(rock|metal|rap|dance|electronic|koplo|pop)\b/gi, '');

  if (pClean.includes('choir') || pClean.includes('orchestr') || pClean.includes('fantasy') || pClean.includes('symphon') || pClean.includes('soundtrack') || pClean.includes('kingdom') || pClean.includes('epic')) {
    return AUTO_SOUND_POOL.find(s => s.genre === 'epic_choir') || AUTO_SOUND_POOL[0];
  }
  if (pClean.includes('synth') || pClean.includes('cyber') || pClean.includes('retro') || pClean.includes('80s')) {
    return AUTO_SOUND_POOL.find(s => s.genre === 'synthwave') || AUTO_SOUND_POOL[0];
  }
  if (pClean.includes('dance') || pClean.includes('upbeat') || pClean.includes('festival') || pClean.includes('folk')) {
    return AUTO_SOUND_POOL.find(s => s.genre === 'dance') || AUTO_SOUND_POOL[0];
  }
  if (pClean.includes('rock') || pClean.includes('metal') || pClean.includes('hard') || pClean.includes('gitar listrik')) {
    return AUTO_SOUND_POOL.find(s => s.genre === 'symphonic_rock') || AUTO_SOUND_POOL[0];
  }
  if (pClean.includes('ballad') || pClean.includes('piano') || pClean.includes('romantis') || pClean.includes('galau')) {
    return AUTO_SOUND_POOL.find(s => s.genre === 'ballad') || AUTO_SOUND_POOL[0];
  }
  if (pClean.includes('j-pop') || pClean.includes('anime') || pClean.includes('jpop') || pClean.includes('japanese')) {
    return AUTO_SOUND_POOL.find(s => s.genre === 'anime') || AUTO_SOUND_POOL[0];
  }
  if (pClean.includes('oriental') || pClean.includes('guzheng') || pClean.includes('mandarin') || pClean.includes('chinese')) {
    return AUTO_SOUND_POOL.find(s => s.genre === 'oriental') || AUTO_SOUND_POOL[0];
  }
  if (pClean.includes('k-pop') || pClean.includes('kpop') || pClean.includes('korean')) {
    return AUTO_SOUND_POOL.find(s => s.genre === 'kpop') || AUTO_SOUND_POOL[0];
  }
  if (pClean.includes('pop') || pClean.includes('indonesia')) {
    return AUTO_SOUND_POOL.find(s => s.genre === 'pop') || AUTO_SOUND_POOL[0];
  }
  if (pClean.includes('acoustic') || pClean.includes('akustik') || pClean.includes('senja')) {
    return AUTO_SOUND_POOL.find(s => s.genre === 'acoustic') || AUTO_SOUND_POOL[0];
  }
  return AUTO_SOUND_POOL[0];
}

/**
 * Intelligent Lyrics Generator matching Prompt & Theme
 */
function generateStructuredLyrics(title, prompt, tags, isInstrumental) {
  if (isInstrumental) {
    return '[Instrumental Audio • 24-Bit Studio Master]';
  }

  const p = (prompt || '').toLowerCase();
  const t = (tags || '').toLowerCase();

  // 1. Epic Fantasy Orchestral Choir / Symphony
  if (p.includes('choir') || p.includes('orchestr') || p.includes('fantasy') || p.includes('kingdom') || p.includes('mythic') || p.includes('symphon') || t.includes('fantasy')) {
    const isIndo = p.includes('kerajaan') || p.includes('hutan') || p.includes('lagu') || p.includes('suara');
    if (isIndo) {
      return `[Intro: Solo Vokal Wanita]
(Alunan lembut piano, lonceng magis, dan gesekan biola syahdu)
Aura aeterna, gema semesta...
Di balik kabut negeri yang purba
Cahaya bintang mulai menyapa...

[Bait 1: Vokal Utama Wanita]
Bisikan angin di hutan terlarang
Menuntun jiwa yang lama bimbang
Langkah melintasi gerbang legenda
Menyambut takdir raja dan ksatria
(Paduan suara perlahan mengalun lembut)

[Pra-Reff: Vokal Utama & Paduan Suara]
[Paduan Suara] Viam inveniam, stella ducens
Gendang pertempuran memanggil jiwa
Rembulan bersinar di angkasa
Saatnya bangkit menyongsong fajar!

[Reff: Vokal Utama Wanita & Megah Paduan Suara]
(Kresendo simfoni orkestra megah, harmoni paduan suara membahana)
Terbanglah tinggi melintasi samudera mimpi!
Gema keberanian takkan pernah mati!
Melawan bayang menggapai mahkota keabadian
Bersama kita ukir legenda di langit harapan!
[Paduan Suara] Gloria in excelsis! Aeterna lux!
Mahkota cahaya milik kita selamanya!

[Bait 2: Vokal Utama Wanita]
Di puncak menara kristal berkilau
Hilang sudah rasa gentar dan galau
Naga mistis menari di ufuk timur
Membawa damai yang kan berbaur

[Reff: Vokal Utama Wanita & Megah Paduan Suara]
(Seluruh paduan suara berpadu dengan vokal wanita bertenaga)
Terbanglah tinggi melintasi samudera mimpi!
Gema keberanian takkan pernah mati!
Melawan bayang menggapai mahkota keabadian
Bersama kita ukir legenda di langit harapan!
[Paduan Suara] Gloria in excelsis! Aeterna lux!
Mahkota cahaya milik kita selamanya!

[Bridge: Bagian Paduan Suara Akbar & Orkestra Penuh]
(Trompet Prancis, dentuman timpani dramatis, paduan suara agung)
[Paduan Suara]
Sancta fides, regnum renascitur!
Ex tenebris ad astra surgimus!
Menembus badai menuju tahta
Negeri dongeng penuh pesona!

[Reff Akhir: Klimaks Tertinggi Vokal Utama & Paduan Suara]
(Vokal wanita melengking tinggi berpadu harmoni paduan suara masif)
Terbanglah tinggi melintasi samudera mimpi!
Gema keberanian takkan pernah mati!
Melawan bayang menggapai mahkota keabadian
Bersama kita ukir legenda di langit harapan!
[Paduan Suara] Gloria in aeternum! Lux oritur!
Kemenangan abadi di pelukan semesta!

[Outro: Solo Wanita Melemah Bersama Koor Surgawi]
(Piano lembut, kecapi harpa, lonceng memudar hening)
Kerajaan tertidur dalam kedamaian emas...
[Paduan Suara - lembut berbisik] Dormi in pace... aeterna lux...
(Gesekan biola lembut menghilang perlahan)`;
    }

    // Default Epic Fantasy Choir in English & Latin choral chants
    return `[Intro: Female Solo]
(Delicate piano, magical bells, and soft orchestral strings)
Aura caelestis, somnia vetusta...
Beyond the veil where ancient waters flow
A legendary kingdom wakes below...

[Verse 1: Female Lead]
Whispers echo through the sacred trees
Silver memories floating on the breeze
Footsteps guided by a forgotten light
Leading our spirits through the silent night
(Subtle choir harmonies swell in response)
Legends awaken from their timeless sleep...

[Pre-Chorus: Female Lead with Choir]
(Choir emerges behind the singer, building tension)
[Choir] Viam inveniam, stella ducens
High above the mountain towers
Through the mystery of the hours
Feel the crescendo rise!

[Chorus: Female Lead & Full Mixed Choir]
(Massive orchestral crescendo, soaring choir harmonies)
Fly across the heavens where the brave belong!
Let the ancient kingdom echo with our song!
Through enchanted forests to the golden dawn
With a noble heart, we will carry on!
[Choir] Gloria in excelsis! Aeterna lux!
We shall crown the stars above!

[Verse 2: Female Lead]
Crystal rivers and the firebird's flight
Guiding our journey with celestial light
Every shadow bends to the holy flame
Every star remembers your name!

[Chorus: Female Lead & Full Mixed Choir]
(Powerful female lead with full mixed choir singing together)
Fly across the heavens where the brave belong!
Let the ancient kingdom echo with our song!
Through enchanted forests to the golden dawn
With a noble heart, we will carry on!
[Choir] Gloria in excelsis! Aeterna lux!
We shall crown the stars above!

[Bridge: Grand Choir Section with Full Symphony]
(French horns, thunderous timpani, and majestic choir)
[Choir]
Sancta fides, regnum renascitur!
Ex tenebris ad astra surgimus!
Through the tempest, through the fire
Lift our souls ever higher!
(Symphonic horns and strings swell to dramatic peak)

[Final Chorus: Female Lead & Massive Choir at Most Powerful]
(Emotional peak, soaring high female vocals and triumphant chorus)
Fly across the heavens where the brave belong!
Let the ancient kingdom echo with our song!
Through enchanted forests to the golden dawn
With a noble heart, we will carry on!
[Choir] Gloria in aeternum! Lux oritur!
We are the wonder in the starlit sky!

[Outro: Female Solo fading into Heavenly Choir]
(Gentle piano, harp, soft bells, heavenly choir whispering)
The kingdom rests in golden peace...
[Choir - soft celestial whisper] Dormi in pace... aeterna lux...
(Soft orchestral strings fade into silence)`;
  }

  if (p.includes('hujan') || p.includes('rain')) {
    return `[Verse 1]
Rintik hujan jatuh di beranda
Menyisakan bayang saat kita bersama
Di sudut kota yang pernah bercerita
Tentang janji yang tak sempat bermuara

[Pre-Chorus]
Dingin malam ini mengingatkanku
Akan hangat pelukmu yang dulu milikku

[Chorus]
Biarkan hujan membasuh luka ini
Mengalirkan sepi yang tak kunjung pergi
Meski langkahmu kini telah berlalu
Namamu tetap tersimpan di sukmaku

[Verse 2]
Kaca jendela mengembun perlahan
Kutuliskan namamu dalam angan
Waktu berganti musim pun bergulir
Namun rindu ini tak pernah berakhir

[Chorus]
Biarkan hujan membasuh luka ini
Mengalirkan sepi yang tak kunjung pergi
Meski langkahmu kini telah berlalu
Namamu tetap tersimpan di sukmaku

[Outro]
Hujan kan reda...
Dan hatiku kembali tenang...`;
  }

  if (p.includes('cinta') || p.includes('love') || p.includes('sayang') || t.includes('romantic')) {
    return `[Verse 1]
Saat pertama kali tatap matamu
Duniaku terhenti dalam detak itu
Ada rasa yang tak mampu kuucap
Menghangatkan jiwa di setiap dekap

[Pre-Chorus]
Kaulah melodi yang kucari selama ini
Menyempurnakan setiap nada sunyi

[Chorus]
Bersamamu ku temukan arti bahagia
Tak perlu kata untuk saling mengerti jiwa
Di setiap langkah genggam erat tanganku
Hingga senja menjemput usia kita berdua

[Verse 2]
Bintang malam jadi saksi bisu
Betapa tulus rasa ini padamu
Melewati badai ataupun mentari
Kuberjanji setia ada di sisi

[Outro]
Kaulah selamanya...
Melodi terindah dalam hidupku...`;
  }

  if (p.includes('senja') || p.includes('pantai') || p.includes('sunset') || t.includes('lofi') || t.includes('chill')) {
    return `[Verse 1]
Langit sore bergradasi jingga
Semilir angin membawa cerita
Duduk bersandar menikmati waktu
Melepas penat di hening hariku

[Pre-Chorus]
Segala gundah perlahan memudar
Tenggelam bersama mentari yang berpendar

[Chorus]
Nikmati senja dalam ketenangan
Melodi merdu memeluk angan
Esok kan datang dengan harapan baru
Biarkan malam mendekap jiwa yang teduh

[Outro]
Tenang di sini...
Bersama alunan harmoni...`;
  }

  // Default Poetic Lyrics
  return `[Verse 1]
Melangkah di antara riuh waktu
Mencari arti dari setiap bisu
Ada nada yang tak pernah pudar
Menyala terang bagai pendar

[Pre-Chorus]
Kala angan terbang melayang
Kutemukan melodi yang benderang

[Chorus]
Inilah harmoni suara hati
Mengalun indah tanpa henti
Membawa kita melintasi batasan
Menyatu dalam bait kenangan

[Verse 2]
Di setiap nada tersimpan cerita
Tentang perjuangan dan cita
Tak ada kata yang sia-sia
Bila melodi menjadi do'a

[Outro]
Terus mengalun...
Harmoni abadi...`;
}

/**
 * Intelligent Title Generator if user leaves it empty
 */
function generateCreativeTitle(prompt, tags) {
  const p = (prompt || '').toLowerCase();
  const t = (tags || '').toLowerCase();

  if (p.includes('choir') || p.includes('orchestr') || p.includes('fantasy') || p.includes('kingdom') || p.includes('mythic') || p.includes('ancient') || t.includes('fantasy')) {
    const fantasyTitles = [
      'Hymn of the Enchanted Dawn',
      'Crown of the Starlit Realm',
      'Echoes of the Ancient Kingdom',
      'Symphony of the Mythic Woods',
      'Whispers of the Celestial Choir'
    ];
    return fantasyTitles[Math.floor(Math.random() * fantasyTitles.length)];
  }
  if (p.includes('hujan') || p.includes('rain')) return 'Rintik di Ujung Senja';
  if (p.includes('senja') || p.includes('sunset')) return 'Lembayung Sore';
  if (p.includes('cinta') || p.includes('love')) return 'Dekap Melodi Hati';
  if (p.includes('kopi') || p.includes('pagi')) return 'Secangkir Cerita Pagi';
  if (p.includes('pantai') || p.includes('ombak')) return 'Semilir Angin Pesisir';
  if (p.includes('rindu') || p.includes('kenangan')) return 'Jejak Kenangan';
  if (t.includes('lofi') || t.includes('chill')) return 'Midnight Study Beat';
  if (t.includes('synthwave') || t.includes('cyber')) return 'Neon Horizon 1984';
  if (t.includes('koplo') || t.includes('dangdut')) return 'Goyang Senja Asik';
  if (t.includes('rock') && !/\b(no|tanpa|not)\s+rock\b/i.test(prompt)) return 'Gemuruh Jiwa Merdeka';

  const randomAdjectives = ['Harmoni', 'Melodi', 'Gema', 'Irama', 'Senandung'];
  const randomNouns = ['Semesta', 'Harapan', 'Bintang', 'Sukma', 'Anugerah'];
  const adj = randomAdjectives[Math.floor(Math.random() * randomAdjectives.length)];
  const noun = randomNouns[Math.floor(Math.random() * randomNouns.length)];
  return `${adj} ${noun}`;
}

/**
 * Normalizes input lyrics and prompt into structured singable lyrics and clean metadata
 */
function prepareLyricsAndPrompt({ prompt, lyrics, tags, title, make_instrumental }) {
  const finalTitle = (title || '').trim() || generateCreativeTitle(prompt, tags);
  const finalTags = deriveTagsFromPrompt(prompt, tags);

  let finalLyrics = '';
  let finalPrompt = (prompt || '').trim();
  let isArrangementInstruction = false;

  const promptTrimmed = (prompt || '').trim();
  const lyricsTrimmed = (lyrics || '').trim();

  if (make_instrumental) {
    finalLyrics = '';
  } else if (lyricsTrimmed.length > 0) {
    isArrangementInstruction = isPromptInstruction(lyricsTrimmed);
    if (isArrangementInstruction) {
      finalLyrics = '';
      if (!finalPrompt) finalPrompt = lyricsTrimmed;
    } else {
      finalLyrics = lyricsTrimmed;
    }
  } else if (promptTrimmed.length > 0) {
    const hasStructureMarkers = /\[(verse|chorus|intro|bridge|outro|hook|pre-chorus|solo|ensemble|female|male|section)/i.test(promptTrimmed) ||
      /section \d+/i.test(promptTrimmed) ||
      /vocal structure/i.test(promptTrimmed);

    if (hasStructureMarkers || promptTrimmed.length > 450) {
      isArrangementInstruction = isPromptInstruction(promptTrimmed);
      if (isArrangementInstruction) {
        finalLyrics = '';
        finalPrompt = promptTrimmed;
      } else {
        // Genuine singable lyrics written directly in prompt box
        finalLyrics = promptTrimmed;
      }
    } else {
      // Short descriptive prompt (< 450 chars, no section markers):
      // Keep finalLyrics empty so Suno uses Simple Mode and crafts genuine singing lyrics itself!
      finalLyrics = '';
      finalPrompt = promptTrimmed;
    }
  }

  return {
    finalTitle,
    finalTags,
    finalLyrics,
    finalPrompt: finalPrompt || finalTags,
    isArrangementInstruction
  };
}

/**
 * Verify third-party Suno API Key
 */
async function verifyApiKey(apiKey, provider = 'kie', customUrl = '') {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 6) {
    throw new Error('Format API Key terlalu pendek atau tidak valid.');
  }

  const cleanKey = apiKey.trim().replace(/^["']|["']$/g, '').trim();

  if (provider === 'goapi') {
    try {
      const res = await axios.get('https://api.goapi.ai/api/suno/v1/music/quota', {
        headers: { 'X-API-KEY': cleanKey },
        timeout: 10000
      });
      return {
        name: 'GoAPI Suno',
        credits: res.data?.data?.credits || res.data?.credits || 'Aktif'
      };
    } catch (e) {
      if (e.response && (e.response.status === 401 || e.response.status === 403)) {
        throw new Error('API Key GoAPI tidak valid atau kuota habis.');
      }
      return { name: 'GoAPI Suno', credits: 'Aktif' };
    }
  }

  if (provider === 'custom') {
    const base = (customUrl || 'http://localhost:8000').replace(/\/$/, '');
    try {
      await axios.get(`${base}/health`, {
        headers: { 'Authorization': `Bearer ${cleanKey}` },
        timeout: 8000
      });
      return { name: 'Custom Suno API', credits: 'Aktif' };
    } catch (e) {
      return { name: 'Custom Suno API', credits: 'Tersambung' };
    }
  }

  if (provider === 'suno_official') {
    let cleanJwt = cleanKey;
    const sessionMatch = cleanKey.match(/__session=([^;]+)/);
    if (sessionMatch) cleanJwt = sessionMatch[1].trim();
    let payload = null;
    try {
      const parts = cleanJwt.split('.');
      if (parts.length >= 2) {
        const decoded = Buffer.from(parts[1], 'base64').toString('utf8');
        payload = JSON.parse(decoded);
      }
    } catch (e) {}

    if (!payload && cleanKey.length < 15) {
      throw new Error('Format Token Sesi Akun Suno tidak valid.');
    }

    if (payload && payload.exp && Date.now() >= payload.exp * 1000) {
      throw new Error('Token Sesi Akun Suno sudah kedaluwarsa. Silakan ambil token baru.');
    }

    const shortId = payload?.sub ? ` (${payload.sub.slice(0, 10)}...)` : '';
    return {
      name: `Suno.com Resmi${shortId}`,
      credits: '50 Kredit Harian Suno'
    };
  }

  // Default: Kie.ai / SunoAPI
  const base = (customUrl || 'https://api.kie.ai').replace(/\/$/, '');
  try {
    const res = await axios.get(`${base}/api/v1/chat/credit`, {
      headers: { 'Authorization': `Bearer ${cleanKey}` },
      timeout: 10000
    });
    if (res.data && (res.data.code === 200 || res.data.code === 0)) {
      const credit = res.data.data !== undefined ? res.data.data : 'Aktif';
      return {
        name: 'Kie.ai Suno AI',
        credits: `${credit} Kredit`
      };
    } else {
      throw new Error(res.data?.msg || 'API Key Kie.ai tidak valid.');
    }
  } catch (e) {
    if (e.response && (e.response.status === 401 || e.response.status === 403)) {
      throw new Error('API Key Kie.ai tidak valid atau saldo akun habis.');
    }
    throw new Error(e.message || 'Gagal menghubungi Kie.ai Suno API.');
  }
}

/**
 * Get current API status (Always Active via Built-in Auto-Engine or Custom Key)
 */
async function getApiKeyInfo(overrideKey = null, overrideProvider = null) {
  const config = getConfig();
  let apiKey = overrideKey !== null ? (overrideKey || '').trim() : (config.suno_api_key || '').trim();
  let provider = overrideProvider || config.suno_provider || 'kie';
  if (apiKey.startsWith('eyJ') && provider !== 'custom') {
    provider = 'suno_official';
  }

  // If local server and no token in config, attempt auto-detect from local profile
  if (!apiKey && typeof process !== 'undefined' && !process.env.VERCEL) {
    try {
      const helper = require('./suno-login-helper');
      const profile = path.join(require('os').homedir(), 'AppData', 'Roaming', 'AuraSound', 'suno_browser_profile');
      if (fs.existsSync(profile)) {
        const sess = await helper.extractSunoSessionFromProfile(profile);
        if (sess && sess.token) {
          apiKey = sess.token;
          saveConfig({ suno_api_key: sess.token, suno_provider: 'suno_official' });
        }
      }
    } catch (e) {}
  }

  if (apiKey && apiKey.length > 5) {
    if (provider === 'suno_official') {
      let currentToken = apiKey;
      if (typeof global.getFreshSunoToken === 'function') {
        try {
          const fresh = await global.getFreshSunoToken();
          if (fresh) currentToken = fresh;
        } catch (e) {}
      }

      if (!currentToken || currentToken.length < 15) {
        return {
          configured: false,
          is_auto: false,
          provider: 'Suno.com (Belum Login)',
          providerCode: 'suno_official',
          credits: '0 Kredit',
          remaining_credits: 0,
          statusText: '⚠️ Akun Suno belum login. Silakan klik tombol "Sign In ke Suno AI".',
          totalCreations: getCreations().length
        };
      }

      let userHandle = null;
      let userId = 'Akun Resmi Suno.com';
      let isExpired = false;

      try {
        const parts = currentToken.split('.');
        if (parts.length >= 2) {
          const decoded = Buffer.from(parts[1], 'base64').toString('utf8');
          const payload = JSON.parse(decoded);
          if (payload?.sub) userId = `User ${payload.sub.slice(0, 8)}...`;
          if (payload?.['suno/handle']) {
            userHandle = `@${payload['suno/handle']}`;
            userId = userHandle;
          } else if (payload?.email) {
            userId = payload.email;
          }
          if (payload?.exp && Date.now() >= payload.exp * 1000) {
            isExpired = true;
          }
        }
      } catch (e) {}

      if (isExpired && typeof global.getFreshSunoToken === 'function') {
        try {
          const fresh = await global.getFreshSunoToken();
          if (fresh) {
            currentToken = fresh;
            isExpired = false;
            try {
              const parts = currentToken.split('.');
              if (parts.length >= 2) {
                const decoded = Buffer.from(parts[1], 'base64').toString('utf8');
                const payload = JSON.parse(decoded);
                if (payload?.sub) userId = `User ${payload.sub.slice(0, 8)}...`;
                if (payload?.['suno/handle']) {
                  userHandle = `@${payload['suno/handle']}`;
                  userId = userHandle;
                } else if (payload?.email) {
                  userId = payload.email;
                }
                if (payload?.exp && Date.now() >= payload.exp * 1000) {
                  isExpired = true;
                }
              }
            } catch (e) {}
          }
        } catch (e) {}
      }

      if (isExpired) {
        return {
          configured: false,
          is_expired: true,
          provider: 'Suno.com (Sesi Kedaluwarsa)',
          providerCode: 'suno_official',
          credits: 'Sesi Kedaluwarsa',
          remaining_credits: 0,
          statusText: '⚠️ Sesi Suno Anda telah berakhir. Klik "Ganti / Kelola Akun" untuk masuk kembali.',
          totalCreations: getCreations().length
        };
      }

      let remainingCredits = 50;
      let creditsDisplay = '50 Kredit Harian Suno';

      // Query real billing info from Suno
      try {
        const billRes = await axios.get('https://studio-api.prod.suno.com/api/billing/info/', {
          headers: buildSunoOfficialHeaders(currentToken),
          timeout: 5000
        });
        if (billRes.data) {
          const b = billRes.data;
          if (b.total_credits_left !== undefined) {
            remainingCredits = b.total_credits_left;
            creditsDisplay = `${remainingCredits} Kredit Tersisa`;
          } else if (b.credits !== undefined) {
            remainingCredits = b.credits;
            creditsDisplay = `${remainingCredits} Kredit Tersisa`;
          }
          if (b.handle) {
            userHandle = `@${b.handle}`;
            userId = userHandle;
          }
        }
      } catch (billErr) {
        try {
          const billRes2 = await axios.get('https://suno.com/a/api/billing/info/', {
            headers: buildSunoOfficialHeaders(currentToken),
            timeout: 4000
          });
          if (billRes2.data) {
            const b2 = billRes2.data;
            if (b2.total_credits_left !== undefined) {
              remainingCredits = b2.total_credits_left;
              creditsDisplay = `${remainingCredits} Kredit Tersisa`;
            }
            if (b2.handle) {
              userHandle = `@${b2.handle}`;
              userId = userHandle;
            }
          }
        } catch (e2) {}
      }

      const finalAccountName = userHandle || userId || 'Akun Resmi Suno.com';

      return {
        configured: true,
        is_auto: false,
        provider: 'Suno.com (Akun Resmi)',
        providerCode: 'suno_official',
        freshToken: currentToken,
        userHandle: finalAccountName,
        accountName: finalAccountName,
        credits: creditsDisplay,
        remaining_credits: remainingCredits,
        maskedKey: `${currentToken.slice(0, 6)}...${currentToken.slice(-4)}`,
        statusText: `🟢 Akun Resmi Suno.com Terhubung (${finalAccountName}) • ${creditsDisplay}`,
        totalCreations: getCreations().length
      };
    }

    const providerNames = {
      kie: 'Kie.ai Suno AI (Official Neural)',
      goapi: 'GoAPI Suno (Custom)',
      custom: 'Custom Suno API Server'
    };
    let creditsInfo = 'Aktif';
    let remaining_credits = undefined;
    let statusText = `🟢 Suno AI Terhubung (${creditsInfo}) • Siap Membuat Lagu Neural Asli`;
    try {
      if (provider === 'kie') {
        const res = await axios.get('https://api.kie.ai/api/v1/chat/credit', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          timeout: 5000
        });
        if (res.data && res.data.data !== undefined) {
          creditsInfo = `${res.data.data} Kredit`;
          remaining_credits = Number(res.data.data);
          if (remaining_credits < 10) {
            statusText = `⚠️ Saldo Kie.ai tersisa ${remaining_credits} kredit (butuh min. 10 kredit/lagu) • Top-up di kie.ai atau hubungkan Akun Suno Resmi`;
          }
        }
      }
    } catch (e) {
      // ignore
    }

    return {
      configured: true,
      is_auto: false,
      provider: providerNames[provider] || provider,
      providerCode: provider,
      credits: creditsInfo,
      remaining_credits,
      maskedKey: `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`,
      statusText,
      totalCreations: getCreations().length
    };
  }

  // DEFAULT: Built-in Studio Engine (Zero configuration required!)
  return {
    configured: true,
    is_auto: true,
    provider: 'Suno AI Studio Engine (Built-in)',
    providerCode: 'auto',
    credits: '5 Lagu / Hari',
    statusText: '🟢 Suno AI Studio Engine Aktif • Siap Membuat Lagu',
    totalCreations: getCreations().length
  };
}

function buildSunoOfficialHeaders(rawToken) {
  const cleanJwt = (rawToken || '').replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
  const cleanUa = typeof global.getCleanNativeUserAgent === 'function'
    ? global.getCleanNativeUserAgent()
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
  return {
    'Authorization': `Bearer ${cleanJwt}`,
    'Cookie': `__session=${cleanJwt}`,
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Referer': 'https://suno.com/',
    'Origin': 'https://suno.com',
    'User-Agent': cleanUa
  };
}

function resolveOfficialSunoModel(model) {
  const m = String(model || '').trim().toLowerCase();
  if (m === 'v6' || m === 'chirp-hawk') return 'chirp-hawk';
  if (m === 'v6-wild' || m === 'chirp-hawk-wild') return 'chirp-hawk-wild';
  if (m === 'v4' || m === 'chirp-v4') return 'chirp-v4';
  if (m === 'v3.5' || m === 'chirp-v3-5') return 'chirp-v3-5';
  if (m === 'v3' || m === 'chirp-v3-0') return 'chirp-v3-0';
  // Suno Official 2026 default model (v6-mini -> external_key: chirp-goose)
  return 'chirp-goose';
}

function formatSunoModelLabel(mvOrClip) {
  const raw = typeof mvOrClip === 'string'
    ? mvOrClip
    : (mvOrClip?.major_model_version || mvOrClip?.model_name || '');
  const s = String(raw).toLowerCase();
  if (s.includes('hawk')) return 'v6';
  if (s.includes('goose') || s.includes('v6-mini')) return 'v6-mini';
  if (s.includes('v4') || s === '4') return 'v4';
  if (s.includes('3')) return 'v3.5';
  return 'v6-mini';
}

function extractClipDurationSec(c, fallback = 120) {
  const rawDur = c?.metadata?.duration ?? c?.duration;
  const num = Number(rawDur);
  return (Number.isFinite(num) && num > 0) ? Math.round(num) : fallback;
}

function formatDurationSec(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function formatOfficialClipTrack(c, { rawTitle, rawTags, rawPrompt, customLyricsText, officialMv, deviceId }) {
  const clipId = c.id;
  const audioUrl = extractAudioUrl(c);
  const thumb = c.image_url || c.image_large_url || (clipId ? `https://cdn2.suno.ai/image_${clipId}.jpeg` : '/icons/icon.svg');
  const genuineLyrics = (c.metadata?.prompt || c.lyrics || '').trim();
  const rawDur = Number(c?.metadata?.duration ?? c?.duration);
  const hasRealDur = Number.isFinite(rawDur) && rawDur > 0;
  const durationSec = hasRealDur ? Math.round(rawDur) : 120;
  const durationStr = hasRealDur
    ? formatDurationSec(durationSec)
    : ((c.status === 'complete' || c.status === 'streaming') ? '2:00' : 'Sedang dibuat...');
  const verLabel = formatSunoModelLabel(c.major_model_version || c.model_name || officialMv);
  const resolvedTitle = (c.title && c.title.trim()) || rawTitle || ((c.status === 'complete' || c.status === 'streaming') ? (c.display_tags ? `Lagu Suno (${c.display_tags})` : 'Lagu Suno AI') : 'Membuat Judul & Lirik...');
  const resolvedTags = (c.metadata?.tags && c.metadata.tags.trim()) || c.tags || c.display_tags || rawTags || 'Suno AI';

  return {
    id: clipId,
    title: resolvedTitle,
    artist: `Suno ${verLabel} (Akun Resmi)`,
    tags: resolvedTags,
    prompt: c.metadata?.gpt_description_prompt || rawPrompt || '',
    lyrics: genuineLyrics || customLyricsText || '',
    model: verLabel === 'v3.5' ? 'chirp-v3-5' : verLabel,
    status: c.status || 'submitted',
    thumbnail: thumb,
    audio_url: audioUrl,
    duration: durationStr,
    seconds: durationSec,
    type: 'suno',
    created_at: 'Hari ini',
    deviceId: deviceId || undefined
  };
}

/**
 * Generate audio with Suno AI (Suno Official Hybrid Direct + Pre-Warmed Engine, Kie.ai, GoAPI, or Custom)
 */
async function generateSunoSong({ prompt, tags, title, make_instrumental = false, lyrics = '', model = 'v6-mini', apiKey: customApiKey = null, provider: customProvider = null, deviceId = null }) {
  const config = getConfig();
  const apiKey = customApiKey !== null ? (customApiKey || '').trim() : (config.suno_api_key || '').trim();
  let provider = (customProvider && customProvider !== 'auto')
    ? customProvider
    : (config.suno_provider || 'suno_official');
  if (apiKey.startsWith('eyJ') && provider !== 'custom') {
    provider = 'suno_official';
  }
  const customUrl = config.suno_custom_url || '';
  const isV35 = model === 'chirp-v3-5' || model === 'v3.5';
  const modelLabel = isV35 ? 'Suno v3.5' : 'Suno v6-mini';

  // 1. SUNO OFFICIAL ENGINE (Authentic Simple Mode by default; Custom Lyrics ONLY when genuine [Verse]/[Chorus] written)
  if (provider === 'suno_official') {
    const officialMv = resolveOfficialSunoModel(model);
    let officialToken = apiKey;

    if (typeof global.getFreshSunoToken === 'function') {
      try {
        const fresh = await global.getFreshSunoToken();
        if (fresh) officialToken = fresh;
      } catch (e) {}
    }

    const rawPrompt = (prompt || '').trim();
    const rawLyrics = (lyrics || '').trim();
    const rawTags = (tags || '').trim();
    const rawTitle = (title || '').trim();
    const wantInstrumental = Boolean(make_instrumental);

    const hasCustomLyrics = !wantInstrumental && (
      (rawLyrics.length > 0 && !isPromptInstruction(rawLyrics)) ||
      (rawLyrics.length === 0 && isGenuineCustomLyrics(rawPrompt))
    );
    const customLyricsText = hasCustomLyrics ? (rawLyrics || rawPrompt) : '';

    // Step 1A: Fast /api/c/check (~250ms) -> if required === false, generate via pure HTTP in ~1s (0 UI!)
    if (officialToken && officialToken.length > 20) {
      let challengeRequired = true;
      try {
        const checkRes = await axios.post(
          'https://studio-api.prod.suno.com/api/c/check',
          { ctype: 'generation' },
          {
            headers: buildSunoOfficialHeaders(officialToken),
            timeout: 4000
          }
        );
        if (checkRes.data && checkRes.data.required === false) {
          challengeRequired = false;
        }
      } catch (checkErr) {
        const st = checkErr.response?.status;
        if (st === 401) {
          console.warn('[Suno Generate] Token expired during /api/c/check, falling back to warm session.');
        }
      }

      if (!challengeRequired) {
        try {
          let genPayload;
          if (!hasCustomLyrics) {
            // Authentic Suno Simple Mode (supports up to 3,000 chars!)
            const simpleParts = [];
            if (rawTitle) simpleParts.push(`Title: ${rawTitle}`);
            if (wantInstrumental) simpleParts.push('Instrumental only, no vocals.');
            if (rawPrompt) simpleParts.push(rawPrompt);
            if (rawTags) {
              simpleParts.push(`Style: ${rawTags}`);
            } else {
              const pLower = rawPrompt.toLowerCase();
              if (pLower.includes('fantasy') || pLower.includes('kerajaan') || (pLower.includes('adventure') && !pLower.includes('folk'))) {
                simpleParts.push('Style: Epic Fantasy Orchestral, Cinematic Symphony, Piano & Strings, No Folk');
              }
            }
            const simpleDesc = simpleParts.join('\n').slice(0, 2950);
            genPayload = {
              gpt_description_prompt: simpleDesc,
              mv: officialMv,
              prompt: '',
              make_instrumental: wantInstrumental
            };
          } else {
            // Authentic Suno Advanced / Custom Lyrics Mode
            genPayload = {
              prompt: customLyricsText,
              tags: rawTags.slice(0, 950),
              title: rawTitle,
              mv: officialMv,
              make_instrumental: false
            };
          }

          console.log(`[Suno Generate] Direct HTTP allowed (required: false). Calling /api/generate/v2/ (${officialMv})...`);
          const sunoRes = await axios.post(
            'https://studio-api.prod.suno.com/api/generate/v2/',
            genPayload,
            {
              headers: buildSunoOfficialHeaders(officialToken),
              timeout: 25000
            }
          );

          const clips = sunoRes.data?.clips || sunoRes.data?.data?.clips || [];
          if (clips.length > 0) {
            const formattedClips = clips.map(c =>
              formatOfficialClipTrack(c, { rawTitle, rawTags, rawPrompt, customLyricsText, officialMv, deviceId })
            );
            [...formattedClips].reverse().forEach(trackObj => {
              addCreation(trackObj, deviceId);
            });
            return {
              success: true,
              is_auto: false,
              direct_api: true,
              data: formattedClips
            };
          }
        } catch (directErr) {
          const st = directErr.response?.status;
          if (st === 402) {
            throw new Error('Kuota kredit akun Suno Anda untuk hari ini telah habis. Kuota akan otomatis di-reset besok oleh Suno!');
          }
          console.warn('[Suno Generate] Direct HTTP generate fallback to warm engine:', st, directErr.response?.data || directErr.message);
        }
      }
    }

    // Step 1B: Pre-Warmed Persistent Suno Engine (Desktop Electron)
    if (typeof global.generateWithSunoBrowser === 'function') {
      console.log('[Suno Generate] Delegating to Pre-Warmed Suno Engine...');
      let genRes = null;
      try {
        genRes = await global.generateWithSunoBrowser({
          prompt: rawPrompt,
          lyrics: customLyricsText,
          tags: rawTags,
          title: rawTitle,
          make_instrumental: wantInstrumental,
          model: officialMv,
          rawPrompt,
          rawLyrics: customLyricsText,
          rawTags,
          rawTitle,
          hasCustomLyrics
        });
      } catch (browserErr) {
        console.warn('[Suno Generate] Browser generation error:', browserErr.message);
        // Emergency recovery: Check if Suno cloud successfully processed the song and sync immediately
        try {
          const synced = await syncOfficialFeed(officialToken, deviceId);
          if (Array.isArray(synced) && synced.length > 0) {
            console.log(`[Suno Generate] Emergency sync recovered ${synced.length} songs from official Suno account!`);
            return {
              success: true,
              is_auto: false,
              data: synced.slice(0, 2)
            };
          }
        } catch (syncErr) {}
        throw browserErr;
      }

      if (genRes && genRes.success && genRes.clips && genRes.clips.length > 0) {
        const formattedClips = genRes.clips.map(c =>
          formatOfficialClipTrack(c, { rawTitle, rawTags, rawPrompt, customLyricsText, officialMv, deviceId })
        );
        [...formattedClips].reverse().forEach(trackObj => {
          addCreation(trackObj, deviceId);
        });
        return {
          success: true,
          is_auto: false,
          data: formattedClips
        };
      }

      // Safety recovery: sync official feed before declaring error
      try {
        const synced = await syncOfficialFeed(officialToken, deviceId);
        if (Array.isArray(synced) && synced.length > 0) {
          return {
            success: true,
            is_auto: false,
            data: synced.slice(0, 2)
          };
        }
      } catch (syncErr) {}

      throw new Error('Suno belum mengembalikan lagu baru. Pastikan kuota kredit akun Suno Anda mencukupi.');
    }

    // Step 1C: Serverless / Android client fallback signal when /api/c/check requires client Turnstile session
    if (officialToken && officialToken.length > 20) {
      return {
        success: false,
        requires_client_engine: true,
        error: 'Sesi Suno memerlukan engine perangkat.'
      };
    }

    throw new Error('Silakan Sign In ke akun Suno Anda terlebih dahulu untuk membuat lagu.');
  }

  // Normalize inputs for 3rd-party API providers (Kie.ai, GoAPI, Custom)
  const {
    finalTitle,
    finalTags,
    finalLyrics,
    finalPrompt
  } = prepareLyricsAndPrompt({ prompt, lyrics, tags, title, make_instrumental });

  // 2. Third-party API providers (Kie.ai, GoAPI, Custom Server)
  if (apiKey && apiKey.length > 5) {
    try {

      if (provider === 'goapi') {
        const response = await axios.post(
          'https://api.goapi.ai/api/suno/v1/music/create',
          {
            prompt: finalLyrics,
            tags: finalTags,
            title: finalTitle,
            make_instrumental: Boolean(make_instrumental)
          },
          {
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            timeout: 30000
          }
        );
        const task = response.data?.data || response.data;
        const taskId = task?.task_id || task?.id;
        return {
          success: true,
          data: [{ id: taskId, title: finalTitle, tags: finalTags, status: 'submitted' }]
        };
      }

      if (provider === 'kie') {
        let kieModel = 'V3_5';
        if (model === 'v4' || model === 'chirp-v4') {
          kieModel = 'V4';
        } else if (model === 'v6' || model === 'chirp-v6' || model === 'v6-mini') {
          kieModel = 'V3_5';
        }

        try {
          // 1. Try Kie.ai createTask with model: 'suno' (proven official model)
          let taskId = null;
          try {
            const taskRes = await axios.post(
              'https://api.kie.ai/api/v1/jobs/createTask',
              {
                model: 'suno',
                input: {
                  prompt: finalLyrics,
                  title: finalTitle,
                  tags: finalTags,
                  make_instrumental: Boolean(make_instrumental)
                }
              },
              {
                headers: {
                  'Authorization': `Bearer ${apiKey.trim()}`,
                  'Content-Type': 'application/json'
                },
                timeout: 30000
              }
            );
            if (taskRes.data?.code === 200 && taskRes.data?.data?.taskId) {
              taskId = taskRes.data.data.taskId;
            } else if (taskRes.data?.code === 402 || taskRes.data?.msg?.toLowerCase().includes('credit')) {
              throw new Error(`Saldo kredit API Key Kie.ai Anda saat ini tidak mencukupi (${taskRes.data?.msg || 'Habis'}). Silakan top up di https://kie.ai atau gunakan akun Suno.com gratis Anda (50 kredit/hari) di menu Hubungkan Akun.`);
            }
          } catch (taskErr) {
            if (taskErr.message?.includes('Saldo kredit')) throw taskErr;
          }

          // 2. Fallback to /api/v1/generate if createTask didn't return taskId
          if (!taskId) {
            const response = await axios.post(
              'https://api.kie.ai/api/v1/generate',
              {
                prompt: finalLyrics,
                customMode: true,
                instrumental: Boolean(make_instrumental),
                model: kieModel,
                style: finalTags,
                title: finalTitle,
                callBackUrl: 'https://project-aplikasi-music.vercel.app/api/suno/callback'
              },
              {
                headers: {
                  'Authorization': `Bearer ${apiKey.trim()}`,
                  'Content-Type': 'application/json'
                },
                timeout: 30000
              }
            );

            if (response.data && response.data.code === 200 && response.data.data?.taskId) {
              taskId = response.data.data.taskId;
            } else if (response.data?.code === 402 || (response.data?.msg && response.data.msg.toLowerCase().includes('credit'))) {
              throw new Error(`Saldo kredit API Key Kie.ai Anda saat ini tidak mencukupi (${response.data?.msg || 'Habis'}). Silakan hubungkan akun Suno.com gratis Anda (50 kredit gratis setiap hari) di tombol 🔗 Hubungkan Akun Suno.`);
            } else {
              throw new Error(response.data?.msg || 'Gagal memulai pembuatan lagu di Kie.ai');
            }
          }
          return {
            success: true,
            is_auto: false,
            data: [
              {
                id: taskId,
                title: finalTitle,
                artist: `${modelLabel} (Kie.ai)`,
                tags: finalTags,
                prompt: finalPrompt,
                lyrics: finalLyrics,
                model: isV35 ? 'chirp-v3-5' : 'v4',
                status: 'submitted',
                created_at: 'Sedang Diproses...'
              }
            ]
          };
        } catch (kieErr) {
          if (kieErr.response?.data?.msg) {
            throw new Error(`Kie.ai Suno Error: ${kieErr.response.data.msg}`);
          }
          throw kieErr;
        }
      }

      if (provider === 'custom') {
        const baseUrl = (customUrl || 'http://localhost:8000').replace(/\/$/, '');
        const response = await axios.post(
          `${baseUrl}/api/v1/suno/generate`,
          {
            prompt: finalLyrics,
            tags: finalTags,
            title: finalTitle,
            make_instrumental: Boolean(make_instrumental),
            mv: 'chirp-v3-5'
          },
          {
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 30000
          }
        );

        const rawClips = response.data?.data?.clips || response.data?.clips || response.data?.data || response.data || [];
        const formatted = (Array.isArray(rawClips) ? rawClips : [rawClips]).map(c => {
          const clipId = c.id || c.task_id || c.clip_id;
          const audioUrl = c.audio_url || (clipId ? `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a` : '');
          const thumb = c.image_url || c.image_large_url || (clipId ? `https://cdn2.suno.ai/image_${clipId}.jpeg` : '/icons/icon.svg');
          const trackObj = {
            id: clipId,
            title: c.title || finalTitle,
            artist: 'Suno AI (Karya Saya)',
            tags: c.tags || finalTags,
            prompt: finalPrompt,
            lyrics: finalLyrics,
            status: c.status || 'complete',
            thumbnail: thumb,
            audio_url: audioUrl,
            duration: c.duration ? `${Math.floor(c.duration / 60)}:${Math.floor(c.duration % 60).toString().padStart(2, '0')}` : '2:00',
            seconds: c.duration || 120,
            type: 'suno',
            created_at: 'Hari ini'
          };
          addCreation(trackObj, deviceId);
          return trackObj;
        });

        return {
          success: true,
          data: formatted
        };
      }
    } catch (err) {
      console.warn('Suno API call failed:', err.message);
      throw err;
    }
  }

  // Do NOT fake-generate with pre-recorded mock songs!
  throw new Error('Silakan Sign In ke akun Suno Anda terlebih dahulu untuk membuat lagu.');
}

/**
 * Check generation status for songs
 */
async function checkSunoStatus(ids, customApiKey = null, customProvider = null, deviceId = null) {
  const config = getConfig();
  const apiKey = customApiKey !== null ? (customApiKey || '').trim() : (config.suno_api_key || '').trim();
  let provider = customProvider || config.suno_provider || 'suno_official';
  if (apiKey.startsWith('eyJ') && provider !== 'custom') {
    provider = 'suno_official';
  }
  const customUrl = config.suno_custom_url || '';
  const idsQuery = Array.isArray(ids) ? ids.join(',') : ids;

  if (!apiKey && typeof global.getFreshSunoToken !== 'function') {
    return { success: true, clips: [] };
  }

  try {
    if (provider === 'suno_official') {
      try {
        let currentToken = apiKey;
        if (typeof global.getFreshSunoToken === 'function') {
          try {
            const fresh = await global.getFreshSunoToken();
            if (fresh) currentToken = fresh;
          } catch (e) {}
        }

        if (!currentToken) {
          return { success: true, clips: [] };
        }

        let rawClips = [];

        // Check if electron generator has helper to fetch clips
        if (typeof global.fetchSunoClipsByIds === 'function') {
          try {
            const electronClips = await global.fetchSunoClipsByIds(ids);
            if (Array.isArray(electronClips) && electronClips.length > 0) {
              rawClips = electronClips;
            }
          } catch (e) {}
        }

        if (!rawClips || rawClips.length === 0) {
          try {
            const res = await axios.get(`https://studio-api.prod.suno.com/api/feed/v2?ids=${idsQuery}`, {
              headers: buildSunoOfficialHeaders(currentToken),
              timeout: 15000
            });
            rawClips = Array.isArray(res.data) ? res.data : (res.data?.clips || res.data?.data?.clips || []);
          } catch (fetchErr) {
            // will fallback below
          }
        }

        // Fallback: POST feed/v3 if feed/v2 returned empty or failed
        if (!rawClips || rawClips.length === 0) {
          for (const feedUrl of ['https://studio-api.prod.suno.com/api/feed/v3', 'https://suno.com/a/api/feed/v3']) {
            try {
              const feedRes = await axios.post(feedUrl, {
                cursor: null,
                limit: 20
              }, {
                headers: buildSunoOfficialHeaders(currentToken),
                timeout: 10000
              });
              const allClips = feedRes.data?.clips || [];
              const targetIds = new Set(Array.isArray(ids) ? ids : String(ids).split(','));
              rawClips = allClips.filter(c => targetIds.has(c.id));
              if (rawClips.length > 0) break;
            } catch (e2) {}
          }
        }

        const existingList = getCreations();
        const formatted = (rawClips || []).map(c => {
          const existing = existingList.find(x => x.id === c.id);
          const audioUrl = extractAudioUrl(c);
          const thumb = c.image_url || c.image_large_url || existing?.thumbnail || (c.id ? `https://cdn2.suno.ai/image_${c.id}.jpeg` : '/icons/icon.svg');
          const rawDur = Number(c?.metadata?.duration ?? c?.duration);
          const hasRealDur = Number.isFinite(rawDur) && rawDur > 0;
          const durationSec = hasRealDur ? Math.round(rawDur) : (existing?.seconds || 120);
          const durationStr = hasRealDur
            ? formatDurationSec(durationSec)
            : ((c.status === 'complete' || c.status === 'streaming') ? (existing?.duration && existing.duration !== 'Sedang dibuat...' ? existing.duration : '2:00') : 'Sedang dibuat...');
          const verLabel = formatSunoModelLabel(c);
          const genuineLyrics = (c.metadata?.prompt || '').trim();
          const genuinePrompt = (c.metadata?.gpt_description_prompt || existing?.prompt || '').trim();
          const resolvedTitle = (c.title && c.title.trim()) ||
            (existing?.title && existing.title !== 'Membuat Judul & Lirik...' ? existing.title : '') ||
            'Membuat Judul & Lirik...';
          const resolvedTags = (c.metadata?.tags && c.metadata.tags.trim()) || c.tags || existing?.tags || 'Suno AI';
          const finalLyricValue = genuineLyrics || existing?.lyrics || '';

          const trackObj = {
            id: c.id,
            title: resolvedTitle,
            artist: `Suno ${verLabel} (Akun Resmi)`,
            tags: resolvedTags,
            prompt: genuinePrompt,
            lyrics: finalLyricValue,
            status: c.status || 'complete',
            model: verLabel === 'v3.5' ? 'chirp-v3-5' : verLabel,
            thumbnail: thumb,
            audio_url: audioUrl,
            duration: durationStr,
            seconds: durationSec,
            type: 'suno',
            created_at: existing?.created_at || 'Hari ini'
          };
          if (existing || c.title || genuineLyrics || ((c.status === 'complete' || c.status === 'streaming') && audioUrl)) {
            addCreation(trackObj, deviceId);
          }
          return trackObj;
        });
        return { success: true, clips: formatted };
      } catch (sunoErr) {
        console.warn('Official Suno feed status error:', sunoErr.message);
      }
    }

    if (provider === 'goapi') {
      const res = await axios.get(`https://api.goapi.ai/api/suno/v1/music/fetch?task_id=${idsQuery}`, {
        headers: { 'X-API-KEY': apiKey },
        timeout: 15000
      });
      const rawClips = res.data?.data?.clips || res.data?.clips || [];
      const formatted = rawClips.map(c => {
        const audioUrl = extractAudioUrl(c);
        const thumb = c.image_url || c.image_large_url || (c.id ? `https://cdn2.suno.ai/image_${c.id}.jpeg` : '/icons/icon.svg');
        const trackObj = {
          id: c.id,
          title: c.title || 'Lagu Baru',
          artist: 'Suno AI (Karya Saya)',
          tags: c.metadata?.tags || c.tags || '',
          prompt: c.metadata?.prompt || c.prompt || '',
          status: c.status || 'complete',
          thumbnail: thumb,
          audio_url: audioUrl,
          duration: c.duration ? `${Math.floor(c.duration / 60)}:${Math.floor(c.duration % 60).toString().padStart(2, '0')}` : '2:00',
          seconds: c.duration || 120,
          type: 'suno',
          created_at: 'Hari ini'
        };
        if (c.status === 'complete') {
          addCreation(trackObj, deviceId);
        }
        return trackObj;
      });
      return { success: true, clips: formatted };
    }

    if (provider === 'kie') {
      const idList = Array.isArray(ids) ? ids : (typeof ids === 'string' ? ids.split(',') : []);
      const results = [];

      for (const taskId of idList) {
        const cleanTaskId = (taskId || '').trim();
        if (!cleanTaskId) continue;

        try {
          const res = await axios.get(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${cleanTaskId}`, {
            headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
            timeout: 15000
          });

          const jobData = res.data?.data;
          if (!jobData) continue;

          const state = (jobData.state || '').toLowerCase();

          if (state === 'success' && jobData.resultJson) {
            let parsedItems = [];
            try {
              const parsed = JSON.parse(jobData.resultJson);
              parsedItems = Array.isArray(parsed) ? parsed : (parsed.data || parsed.clips || [parsed]);
            } catch (pe) {
              console.error('Error parsing Kie resultJson:', pe);
            }

            for (const item of parsedItems) {
              const clipId = item.id || `${cleanTaskId}-${Math.random().toString(36).substring(2, 6)}`;
              const audioUrl = item.audio_url || item.stream_audio_url || '';
              const thumb = item.image_url || (item.id ? `https://cdn2.suno.ai/image_${item.id}.jpeg` : '/icons/icon.svg');
              const durationSec = Math.round(Number(item.duration) || 120);
              const durationStr = `${Math.floor(durationSec / 60)}:${Math.floor(durationSec % 60).toString().padStart(2, '0')}`;

              const trackObj = {
                id: clipId,
                title: item.title || 'Lagu Suno AI',
                artist: 'Suno AI (Neural Music)',
                tags: item.tags || '',
                prompt: item.prompt || '',
                lyrics: item.prompt || '',
                status: 'complete',
                thumbnail: thumb,
                audio_url: audioUrl,
                stream_audio_url: item.stream_audio_url || audioUrl,
                duration: durationStr,
                seconds: durationSec,
                type: 'suno',
                created_at: 'Hari ini'
              };

              addCreation(trackObj, deviceId);
              results.push(trackObj);
            }
          } else if (state === 'failed') {
            results.push({
              id: cleanTaskId,
              title: 'Gagal Dibuat',
              status: 'error',
              error: jobData.failReason || 'Gagal generate lagu via Suno AI'
            });
          } else {
            // waiting or generating
            results.push({
              id: cleanTaskId,
              title: 'Sedang Diproses...',
              status: 'generating',
              state: state
            });
          }
        } catch (taskErr) {
          console.warn(`Error checking Kie.ai taskId ${cleanTaskId}:`, taskErr.message);
        }
      }

      return { success: true, clips: results };
    }

    // Custom Server
    const baseUrl = (customUrl || 'http://localhost:8000').replace(/\/$/, '');
    const res = await axios.get(`${baseUrl}/api/v1/suno/feed?ids=${idsQuery}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 15000
    });

    const rawClips = Array.isArray(res.data) ? res.data : (res.data?.clips || res.data?.data?.clips || []);
    const formatted = rawClips.map(clip => {
      const audioUrl = extractAudioUrl(clip);
      const thumb = clip.image_url || clip.image_large_url || (clip.id ? `https://cdn2.suno.ai/image_${clip.id}.jpeg` : '/icons/icon.svg');
      const trackObj = {
        id: clip.id,
        title: clip.title || 'Lagu Baru',
        artist: 'Suno AI (Karya Saya)',
        tags: clip.metadata?.tags || clip.tags || '',
        prompt: clip.metadata?.prompt || clip.prompt || '',
        status: clip.status || 'complete',
        thumbnail: thumb,
        audio_url: audioUrl,
        duration: clip.duration ? `${Math.floor(clip.duration / 60)}:${Math.floor(clip.duration % 60).toString().padStart(2, '0')}` : '2:00',
        seconds: clip.duration || 120,
        type: 'suno',
        created_at: 'Hari ini'
      };
      if (clip.status === 'complete') {
        addCreation(trackObj);
      }
      return trackObj;
    });

    return { success: true, clips: formatted };
  } catch (e) {
    return { success: true, clips: [] };
  }
}

/**
 * Parse official Suno aligned_words into whole-word lyric lines with accurate section headers
 */
function parseAlignedWords(rawWords) {
  if (!Array.isArray(rawWords) || rawWords.length === 0) return [];

  const lines = [];
  let currentWords = [];
  let currentSection = '';

  for (let i = 0; i < rawWords.length; i++) {
    const item = rawWords[i];
    let rawStr = item.word || '';

    // Extract section header if present (e.g. "[Verse 1]\n" or "[Chorus]\n")
    const sectionMatch = rawStr.match(/\[(.*?)\]/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      rawStr = rawStr.replace(/\[.*?\]\s*/, '');
    }

    const endsWithNewline = /\n/.test(rawStr);
    const hasTrailingSpace = /\s$/.test(rawStr);
    const cleanedText = rawStr.replace(/\r?\n+/g, '').trim();

    if (cleanedText.length > 0) {
      const prevWord = currentWords[currentWords.length - 1];
      // Check if this is a contraction or continuation (e.g. "dawn’" + "s", or isolated punctuation)
      const isContraction = prevWord && (
        prevWord.text.endsWith("'") ||
        prevWord.text.endsWith("’") ||
        /^[’'](s|t|re|ve|ll|d|m)$/i.test(cleanedText) ||
        (prevWord.text.match(/[’']$/) && /^[a-zA-Z]$/.test(cleanedText)) ||
        /^[.,!?;:]+$/.test(cleanedText)
      );

      if (isContraction) {
        prevWord.text += cleanedText;
        prevWord.end = Math.max(prevWord.end, Math.round(item.end_s * 1000) / 1000);
        prevWord.trailingSpace = hasTrailingSpace;
      } else {
        currentWords.push({
          text: cleanedText,
          begin: Math.round(item.start_s * 1000) / 1000,
          end: Math.round(item.end_s * 1000) / 1000,
          trailingSpace: hasTrailingSpace
        });
      }
    }

    if (endsWithNewline && currentWords.length > 0) {
      currentWords[currentWords.length - 1].trailingSpace = false;
      const lineText = currentWords.map(w => w.text).join(' ');
      const startTime = currentWords[0].begin;
      const endTime = currentWords[currentWords.length - 1].end;

      lines.push({
        time: Math.round(startTime * 100) / 100,
        endTime: Math.round(endTime * 100) / 100,
        text: lineText,
        section: currentSection,
        words: currentWords
      });
      currentWords = [];
    }
  }

  if (currentWords.length > 0) {
    currentWords[currentWords.length - 1].trailingSpace = false;
    lines.push({
      time: Math.round(currentWords[0].begin * 100) / 100,
      endTime: Math.round(currentWords[currentWords.length - 1].end * 100) / 100,
      text: currentWords.map(w => w.text).join(' '),
      section: currentSection,
      words: currentWords
    });
  }

  return lines;
}

/**
 * Fallback: Reconstruct whole words from BPE tokens if aligned_words is unavailable
 */
function parseAlignedLyricsFallback(rawLines) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return [];

  return rawLines.map(l => {
    const cleanWords = [];
    (l.words || []).forEach(w => {
      const rawText = w.text || '';
      const isNewWord = rawText.startsWith(' ') || cleanWords.length === 0;
      const trimmed = rawText.trim();
      if (!trimmed) return;

      if (isNewWord || cleanWords.length === 0) {
        cleanWords.push({
          text: trimmed,
          begin: Math.round(w.start_s * 1000) / 1000,
          end: Math.round(w.end_s * 1000) / 1000,
          trailingSpace: true
        });
      } else {
        const last = cleanWords[cleanWords.length - 1];
        last.text += trimmed;
        last.end = Math.max(last.end, Math.round(w.end_s * 1000) / 1000);
      }
    });

    if (cleanWords.length > 0) {
      cleanWords[cleanWords.length - 1].trailingSpace = false;
    }

    return {
      time: Math.round(l.start_s * 100) / 100,
      endTime: Math.round(l.end_s * 100) / 100,
      text: (l.text || '').trim(),
      section: l.section || '',
      words: cleanWords
    };
  }).filter(l => l.text.length > 0);
}

/**
 * Parse CJK (Chinese / Japanese / Korean) native characters into character-by-character real-time synced lines
 */
function parseCjkAlignedLyrics(rawLines) {
  if (!Array.isArray(rawLines) || rawLines.length === 0) return [];

  return rawLines.map(l => {
    const rawWords = l.words || [];
    const words = rawWords.map(w => {
      const txt = (w.text || '').trim();
      return {
        text: txt,
        begin: Math.round(w.start_s * 1000) / 1000,
        end: Math.round(w.end_s * 1000) / 1000,
        trailingSpace: false
      };
    }).filter(w => w.text.length > 0);

    return {
      time: Math.round(l.start_s * 100) / 100,
      endTime: Math.round(l.end_s * 100) / 100,
      text: (l.text || '').trim(),
      section: l.section || '',
      words: words.length > 0 ? words : undefined
    };
  }).filter(l => l.text.length > 0 && !/^\s*\[(instrumental|solo|humming|guitar)[^\]]*\]\s*$/i.test(l.text) && !/^\s*\(instrumental[^)]*\)\s*$/i.test(l.text));
}

/**
 * Fetch Neural Word-by-Word Aligned Lyrics from Official Suno Feed
 */
async function getAlignedLyrics(clipId, userToken = null) {
  if (!clipId) return null;

  let cleanJwt = (userToken || '').replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();

  // Obtain fresh token from electron session
  if (typeof global.getFreshSunoToken === 'function') {
    try {
      const fresh = await global.getFreshSunoToken();
      if (fresh) cleanJwt = fresh;
    } catch (e) {}
  }

  // Try extracting from browser profile if token is missing
  if (!cleanJwt || cleanJwt.length < 20) {
    try {
      const helper = require('./suno-login-helper');
      const os = require('os');
      const profileDir = path.join(os.homedir(), 'AppData', 'Roaming', 'AuraSound', 'suno_browser_profile');
      const sess = await helper.extractSunoSessionFromProfile(profileDir);
      if (sess && sess.token) cleanJwt = sess.token;
    } catch(e) {}
  }

  // Also check saved config
  if (!cleanJwt || cleanJwt.length < 20) {
    const cfg = getConfig();
    if (cfg.suno_api_key) cleanJwt = cfg.suno_api_key;
  }

  const headers = cleanJwt && cleanJwt.length > 20
    ? buildSunoOfficialHeaders(cleanJwt)
    : {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

  const url = `https://studio-api.prod.suno.com/api/gen/${clipId}/aligned_lyrics/v2/`;

  try {
    const res = await axios.get(url, { headers, timeout: 10000 });
    const rawLyrics = res.data?.aligned_lyrics || [];
    const fullTextSample = rawLyrics.slice(0, 10).map(l => l.text || '').join(' ');
    const isCjkScript = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(fullTextSample);

    let parsedLyrics = [];

    if (isCjkScript && rawLyrics.length > 0) {
      // For Chinese Hanzi & Japanese Kanji/Kana: aligned_lyrics gives character-by-character real-time karaoke!
      parsedLyrics = parseCjkAlignedLyrics(rawLyrics);
    } else {
      // For Latin/Romaji/Pinyin/English: aligned_words gives clean, whole-word alignment without BPE fragmentation
      if (Array.isArray(res.data?.aligned_words) && res.data.aligned_words.length > 0) {
        parsedLyrics = parseAlignedWords(res.data.aligned_words);
      }
      if ((!parsedLyrics || parsedLyrics.length === 0) && rawLyrics.length > 0) {
        parsedLyrics = parseAlignedLyricsFallback(rawLyrics);
      }
    }

    // Filter out meta instrumental prompt instructions that aren't real sung lyrics
    if (Array.isArray(parsedLyrics)) {
      parsedLyrics = parsedLyrics.filter(l =>
        !/^\s*\[(instrumental|guitar solo|solo|humming|interlude|outro|intro)[^\]]*\]\s*$/i.test(l.text) &&
        !/^\s*\(instrumental[^)]*\)\s*$/i.test(l.text)
      );
    }

    if (Array.isArray(parsedLyrics) && parsedLyrics.length > 0) {
      return {
        found: true,
        hasWordSync: true,
        parsedLyrics,
        totalWords: res.data?.aligned_words?.length || 0
      };
    }
  } catch (err) {
    console.warn(`[Suno Aligned Lyrics] Failed for clip ${clipId}:`, err.response?.status, err.message);
  }

  return null;
}

module.exports = {
  getCreations,
  addCreation,
  deleteCreation,
  getCreationsPaginated,
  generateSunoSong,
  checkSunoStatus,
  getApiKeyInfo,
  verifyApiKey,
  getConfig,
  saveConfig,
  generateStructuredLyrics,
  prepareLyricsAndPrompt,
  pickSoundForTheme,
  syncOfficialFeed,
  getAlignedLyrics
};
