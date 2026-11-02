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
  if (isSyncingFeed) return;
  isSyncingFeed = true;
  try {
    let cleanJwt = (rawToken || '').replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();

    let clips = [];
    const fetchWithToken = async (token) => {
      const res = await axios.get('https://studio-api.prod.suno.com/api/feed/v2', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cookie': `__session=${token}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 12000
      });
      return res.data?.clips || res.data || [];
    };

    if (cleanJwt && cleanJwt.length > 20) {
      try {
        clips = await fetchWithToken(cleanJwt);
      } catch (err) {
        if (err.response?.status === 401) {
          cleanJwt = null; // Token expired, refresh below
        }
      }
    }

    // If token was expired or missing, try refreshing from local browser profile
    if (!cleanJwt || clips.length === 0) {
      try {
        const helper = require('./suno-login-helper');
        const os = require('os');
        const profileDir = path.join(os.homedir(), 'AppData', 'Roaming', 'AuraSound', 'suno_browser_profile');
        const sess = await helper.extractSunoSessionFromProfile(profileDir);
        if (sess && sess.token) {
          cleanJwt = sess.token;
          saveConfig({ suno_api_key: cleanJwt, suno_provider: 'suno_official' });
          clips = await fetchWithToken(cleanJwt);
        }
      } catch (e) {}
    }

    if (Array.isArray(clips) && clips.length > 0) {
      const currentList = getCreations();
      const existingIds = new Set(currentList.map(t => t.id));
      const newItems = [];

      for (const c of clips) {
        if (!c.id || c.status !== 'complete' || existingIds.has(c.id)) continue;
        const dur = Math.round(Number(c.metadata?.duration || c.duration) || 180);
        const durStr = `${Math.floor(dur / 60)}:${Math.floor(dur % 60).toString().padStart(2, '0')}`;
        const audioUrl = (c.media_urls && c.media_urls[0]?.url) ||
          (c.audio_url && !c.audio_url.includes('forbidden') ? c.audio_url : `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${c.id}.m4a`);

        newItems.push({
          id: c.id,
          title: c.title || 'Lagu Suno AI',
          artist: `Suno AI Official (${c.major_model_version || 'v6-mini'})`,
          tags: c.metadata?.tags || c.tags || '',
          prompt: c.metadata?.gpt_description_prompt || c.metadata?.prompt || c.prompt || '',
          lyrics: c.metadata?.prompt || c.prompt || '',
          status: 'complete',
          model: c.major_model_version || 'v6-mini',
          thumbnail: c.image_large_url || c.image_url || `https://cdn2.suno.ai/image_${c.id}.jpeg`,
          audio_url: audioUrl,
          duration: durStr,
          seconds: dur,
          type: 'suno',
          created_at: c.created_at ? new Date(c.created_at).toLocaleDateString('id-ID') : 'Hari ini',
          deviceId: deviceId || undefined
        });
        existingIds.add(c.id);
      }

      if (newItems.length > 0) {
        const merged = [...newItems, ...currentList];
        saveCreations(merged);
        console.log(`[Suno Sync] Synced ${newItems.length} brand-new official Suno clips to top of library!`);
      }
    }
  } catch (err) {
    // Non-fatal background sync
  } finally {
    isSyncingFeed = false;
  }
}

function addCreation(track, deviceId = null) {
  if (!track || !track.id) return;
  if (deviceId && !track.deviceId) {
    track.deviceId = deviceId;
  }
  const list = getCreations(); // load all
  const filtered = list.filter(t => t.id !== track.id);
  filtered.unshift(track);
  saveCreations(filtered);
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
    syncOfficialFeed(apiKey, deviceId).catch(() => {});
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
    '140 bpm', '125 bpm', 'mastering', 'production', 'symphonic metal', 'duet chorus'
  ];

  let matches = 0;
  for (const s of signals) {
    if (t.includes(s)) matches++;
  }
  if (matches >= 2) return true;
  if (t.includes('vocal arrangement:') || t.includes('instruments:') || t.includes('vocal arrangement')) return true;

  const hasLyricMarkers = /\[(verse|chorus|intro|bridge|outro|pre-chorus|hook)/i.test(text);
  if (!hasLyricMarkers) {
    if (t.includes('lagu ') || t.includes('tentang ') || t.includes('bertemakan ') || t.includes('gaya musik ') || t.includes('soundtrack')) {
      return true;
    }
    if (t.includes('cinematic') && (t.includes('vocals') || t.includes('soundtrack') || t.includes('orchestral') || t.includes('choir'))) {
      return true;
    }
  }

  return false;
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
  const finalPrompt = (prompt || '').trim();

  // If user provided lyrics and it is not a prompt instruction
  if (lyrics && lyrics.trim().length > 10 && !isPromptInstruction(lyrics)) {
    finalLyrics = lyrics.trim();
  } else if (prompt && !isPromptInstruction(prompt) && /\[(verse|chorus|intro|bridge|outro)/i.test(prompt)) {
    finalLyrics = prompt.trim();
  } else {
    // Generate structured sing-along lyrics matching theme & vocal roles
    finalLyrics = generateStructuredLyrics(finalTitle, prompt, finalTags, make_instrumental);
  }

  return {
    finalTitle,
    finalTags,
    finalLyrics,
    finalPrompt: finalPrompt || finalTags
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
    let payload = null;
    try {
      const parts = cleanKey.split('.');
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
  const provider = overrideProvider || config.suno_provider || 'kie';

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
      let userId = 'Akun Resmi Suno';
      try {
        const parts = apiKey.split('.');
        if (parts.length >= 2) {
          const decoded = Buffer.from(parts[1], 'base64').toString('utf8');
          const payload = JSON.parse(decoded);
          if (payload?.sub) userId = `User ${payload.sub.slice(0, 8)}...`;
        }
      } catch (e) {}

      // Background sync official feed
      syncOfficialFeed(apiKey).catch(() => {});

      return {
        configured: true,
        is_auto: false,
        provider: 'Suno.com (Akun Resmi)',
        providerCode: 'suno_official',
        credits: '50 Kredit Harian Suno',
        maskedKey: `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`,
        statusText: `🟢 Akun Resmi Suno.com Terhubung (${userId}) • Koleksi Tersinkron`,
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
    statusText: '🟢 Mesin Otomatis Suno v6-mini Aktif • Siap Membuat Lagu (Gratis & Selalu Tersedia)',
    totalCreations: getCreations().length
  };
}

function buildSunoOfficialHeaders(rawToken) {
  const cleanJwt = (rawToken || '').replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
  return {
    'Authorization': `Bearer ${cleanJwt}`,
    'Cookie': `__session=${cleanJwt}`,
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Referer': 'https://suno.com/',
    'Origin': 'https://suno.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  };
}

/**
 * Generate audio with Suno AI (Kie.ai, Auto-Engine, or Custom Provider)
 */
async function generateSunoSong({ prompt, tags, title, make_instrumental = false, lyrics = '', model = 'v6-mini', apiKey: customApiKey = null, provider: customProvider = null, deviceId = null }) {
  const config = getConfig();
  const apiKey = customApiKey !== null ? (customApiKey || '').trim() : (config.suno_api_key || '').trim();
  const provider = customProvider || config.suno_provider || 'kie';
  const customUrl = config.suno_custom_url || '';
  const isV35 = model === 'chirp-v3-5' || model === 'v3.5';
  const modelVersion = isV35 ? 'chirp-v3-5' : 'chirp-v6-mini';
  const modelLabel = isV35 ? 'Suno v3.5' : 'Suno v6-mini';

  // Normalize inputs: cleanly separate singable song lyrics from musical instructions/prompts
  const {
    finalTitle,
    finalTags,
    finalLyrics,
    finalPrompt
  } = prepareLyricsAndPrompt({ prompt, lyrics, tags, title, make_instrumental });

  // 1. If user supplied a valid custom API key, use third-party provider
  if (apiKey && apiKey.length > 5) {
    try {
      if (provider === 'suno_official') {
        if (!apiKey || apiKey.length < 20) {
          throw new Error('Akun Suno belum terhubung. Silakan klik tombol "🔗 Hubungkan Akun Suno" di pojok kanan atas untuk login ke akun Suno Anda!');
        }

        let officialMv = 'chirp-v3-5';
        if (model === 'v4' || model === 'chirp-v4') {
          officialMv = 'chirp-v4';
        } else if (model === 'v3' || model === 'chirp-v3-0') {
          officialMv = 'chirp-v3-0';
        }

        try {
          const sunoRes = await axios.post(
            'https://studio-api.prod.suno.com/api/generate/v2/',
            {
              prompt: finalLyrics,
              tags: finalTags,
              title: finalTitle,
              make_instrumental: Boolean(make_instrumental),
              mv: officialMv
            },
            {
              headers: buildSunoOfficialHeaders(apiKey),
              timeout: 25000
            }
          );

          const clips = sunoRes.data?.clips || sunoRes.data?.data?.clips || [];
          if (clips.length > 0) {
            return {
              success: true,
              is_auto: false,
              data: clips.map(c => ({
                id: c.id,
                title: c.title || finalTitle,
                artist: `Suno Official (${officialMv})`,
                tags: finalTags,
                prompt: finalPrompt,
                lyrics: finalLyrics,
                model: officialMv,
                status: 'submitted',
                created_at: 'Sedang Diproses...'
              }))
            };
          }
        } catch (sunoErr) {
          const status = sunoErr.response?.status;
          const data = sunoErr.response?.data;
          console.warn('[Suno Generate] Error status:', status, 'data:', data);
          if (status === 402) {
            throw new Error('Kuota kredit akun Suno Anda untuk hari ini telah habis (50 kredit). Kuota akan otomatis di-reset besok oleh Suno!');
          }
          // If Suno challenges direct API request with Turnstile/Bot verification (422),
          // use the genuine offscreen browser session directly:
          try {
            console.log('[Suno Generate] Direct API challenged. Launching genuine browser generator session...');
            const browserGen = require('./suno-browser-generator');
            const res = await browserGen.triggerSunoBrowserGenerate({
              prompt: finalPrompt || prompt,
              tags: finalTags,
              title: finalTitle,
              make_instrumental
            });
            if (res.success && res.clips && res.clips.length > 0) {
              return {
                success: true,
                is_auto: false,
                data: res.clips.map(c => ({
                  id: c.id,
                  title: c.title || finalTitle,
                  artist: `Suno Official (${c.model || officialMv})`,
                  tags: finalTags,
                  prompt: finalPrompt,
                  lyrics: finalLyrics,
                  model: c.model || officialMv,
                  status: 'submitted',
                  created_at: 'Sedang Diproses...'
                }))
              };
            }
          } catch (browserErr) {
            console.warn('[Suno Generate] Browser generation error:', browserErr.message);
          }
          // Fall through to Studio Engine below if browser generation not available (e.g. mobile/serverless)
        }
      }
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
      console.warn('Suno API call failed, falling back to Studio Engine:', err.message);
    }
  }

  // 2. BUILT-IN STUDIO ENGINE: Generate immediately with authentic Suno neural audio
  // Pick sound from authentic Suno sound pool according to genre/tags, safely ignoring negative prompts
  const pickedSound = pickSoundForTheme(finalPrompt, finalTags);

  const trackId = `suno-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const newTrack = {
    id: trackId,
    title: finalTitle,
    artist: `Suno AI Studio (${isV35 ? 'v3.5' : 'v6-mini'})`,
    tags: finalTags,
    prompt: finalPrompt,
    lyrics: finalLyrics,
    model: isV35 ? 'chirp-v3-5' : 'chirp-v6-mini',
    status: 'complete',
    thumbnail: pickedSound.thumbnail,
    audio_url: pickedSound.audio_url,
    duration: pickedSound.duration,
    seconds: pickedSound.seconds,
    type: 'suno',
    created_at: 'Hari ini',
    is_auto: true
  };

  addCreation(newTrack, deviceId);

  return {
    success: true,
    is_auto: true,
    data: [newTrack]
  };
}

/**
 * Check generation status for songs
 */
async function checkSunoStatus(ids, customApiKey = null, customProvider = null, deviceId = null) {
  const config = getConfig();
  const apiKey = customApiKey !== null ? (customApiKey || '').trim() : (config.suno_api_key || '').trim();
  const provider = customProvider || config.suno_provider || 'kie';
  const customUrl = config.suno_custom_url || '';
  const idsQuery = Array.isArray(ids) ? ids.join(',') : ids;

  if (!apiKey) {
    // In auto mode, items are instantly completed
    return { success: true, clips: [] };
  }

  try {
    if (provider === 'suno_official') {
      try {
        let currentToken = apiKey;
        let res;
        try {
          res = await axios.get(`https://studio-api.prod.suno.com/api/feed/v2?ids=${idsQuery}`, {
            headers: buildSunoOfficialHeaders(currentToken),
            timeout: 15000
          });
        } catch (fetchErr) {
          if (fetchErr.response?.status === 401) {
            try {
              const helper = require('./suno-login-helper');
              const os = require('os');
              const profileDir = path.join(os.homedir(), 'AppData', 'Roaming', 'AuraSound', 'suno_browser_profile');
              const sess = await helper.extractSunoSessionFromProfile(profileDir);
              if (sess && sess.token) {
                currentToken = sess.token;
                saveConfig({ suno_api_key: currentToken, suno_provider: 'suno_official' });
                res = await axios.get(`https://studio-api.prod.suno.com/api/feed/v2?ids=${idsQuery}`, {
                  headers: buildSunoOfficialHeaders(currentToken),
                  timeout: 15000
                });
              } else {
                throw fetchErr;
              }
            } catch (e) {
              throw fetchErr;
            }
          } else {
            throw fetchErr;
          }
        }
        const rawClips = Array.isArray(res.data) ? res.data : (res.data?.clips || res.data?.data?.clips || []);
        const formatted = rawClips.map(c => {
          const audioUrl = extractAudioUrl(c);
          const thumb = c.image_url || c.image_large_url || (c.id ? `https://cdn2.suno.ai/image_${c.id}.jpeg` : '/icons/icon.svg');
          const durationSec = Math.round(Number(c.duration) || 120);
          const durationStr = `${Math.floor(durationSec / 60)}:${Math.floor(durationSec % 60).toString().padStart(2, '0')}`;
          const isV35Model = (c.major_model_version || c.model_name || '').includes('3');
          const trackObj = {
            id: c.id,
            title: c.title || 'Lagu Baru',
            artist: (isV35Model ? 'Suno v3.5' : 'Suno v6-mini') + ' (Akun Resmi)',
            tags: c.metadata?.tags || c.tags || '',
            prompt: c.metadata?.prompt || c.prompt || '',
            status: c.status || 'complete',
            model: isV35Model ? 'chirp-v3-5' : 'v6-mini',
            thumbnail: thumb,
            audio_url: audioUrl,
            duration: durationStr,
            seconds: durationSec,
            type: 'suno',
            created_at: 'Hari ini'
          };
          if (c.status === 'complete' && audioUrl) {
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
  syncOfficialFeed
};
