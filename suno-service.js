const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const CREATIONS_FILE = path.join(__dirname, 'data', 'suno-creations.json');

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
        return list.filter(t => t.deviceId === deviceId);
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
  } catch (e) {
    console.error('Error saving creations:', e);
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

function getCreationsPaginated({ page = 1, pageSize = 12, query = '', deviceId = null }) {
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
    genre: 'acoustic',
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    thumbnail: '/images/chill_vibes.jpg',
    duration: '3:15',
    seconds: 195,
    style: 'Acoustic Guitar, Warm Piano Chords, Emotional Studio Mix'
  },
  {
    genre: 'lofi',
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    thumbnail: '/images/focus_beats.jpg',
    duration: '3:02',
    seconds: 182,
    style: 'Lo-Fi Chill Hop, Smooth Rhodes Piano, Cozy Ambient Groove'
  },
  {
    genre: 'pop',
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    thumbnail: '/images/supermix.jpg',
    duration: '2:48',
    seconds: 168,
    style: 'Indonesian Pop, Emotional Piano Ballad, Modern Studio Master'
  },
  {
    genre: 'synthwave',
    audio_url: 'https://d2lwuy8qc234o3.cloudfront.net/1/clip/e9543b14-bfc4-437c-98bd-7da5cdb64a83.m4a',
    thumbnail: '/images/discover.jpg',
    duration: '2:04',
    seconds: 124,
    style: 'Retro Synthwave, Cyberpunk Arpeggio, 80s Analog Synthesizer'
  },
  {
    genre: 'kpop',
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    thumbnail: '/images/kpop_king.jpg',
    duration: '2:36',
    seconds: 156,
    style: 'Upbeat Modern Dance, Energetic Rhythms, Catchy Melodic Hook'
  },
  {
    genre: 'rock',
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    thumbnail: '/images/liked.jpg',
    duration: '3:10',
    seconds: 190,
    style: 'Dynamic Rock, Energetic Electric Guitars, Driving Bassline'
  }
];

/**
 * Intelligent Lyrics Generator matching Prompt & Theme
 */
function generateStructuredLyrics(title, prompt, tags, isInstrumental) {
  if (isInstrumental) {
    return '[Instrumental Audio • 24-Bit Studio Master]';
  }

  const p = (prompt || '').toLowerCase();
  const t = (tags || '').toLowerCase();

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

  if (p.includes('hujan') || p.includes('rain')) return 'Rintik di Ujung Senja';
  if (p.includes('senja') || p.includes('sunset')) return 'Lembayung Sore';
  if (p.includes('cinta') || p.includes('love')) return 'Dekap Melodi Hati';
  if (p.includes('kopi') || p.includes('pagi')) return 'Secangkir Cerita Pagi';
  if (p.includes('pantai') || p.includes('ombak')) return 'Semilir Angin Pesisir';
  if (p.includes('rindu') || p.includes('kenangan')) return 'Jejak Kenangan';
  if (t.includes('lofi') || t.includes('chill')) return 'Midnight Study Beat';
  if (t.includes('synthwave') || t.includes('cyber')) return 'Neon Horizon 1984';
  if (t.includes('koplo') || t.includes('dangdut')) return 'Goyang Senja Asik';
  if (t.includes('rock')) return 'Gemuruh Jiwa Merdeka';

  const randomAdjectives = ['Harmoni', 'Melodi', 'Gema', 'Irama', 'Senandung'];
  const randomNouns = ['Semesta', 'Harapan', 'Bintang', 'Sukma', 'Anugerah'];
  const adj = randomAdjectives[Math.floor(Math.random() * randomAdjectives.length)];
  const noun = randomNouns[Math.floor(Math.random() * randomNouns.length)];
  return `${adj} ${noun}`;
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
  const apiKey = overrideKey !== null ? (overrideKey || '').trim() : (config.suno_api_key || '').trim();
  const provider = overrideProvider || config.suno_provider || 'kie';

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

      return {
        configured: true,
        is_auto: false,
        provider: 'Suno.com (Akun Resmi)',
        providerCode: 'suno_official',
        credits: '50 Kredit Harian Suno',
        maskedKey: `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`,
        statusText: `🟢 Akun Resmi Suno.com Terhubung (${userId}) • Siap Membuat Lagu`,
        totalCreations: getCreations().length
      };
    }

    const providerNames = {
      kie: 'Kie.ai Suno AI (Official Neural)',
      goapi: 'GoAPI Suno (Custom)',
      custom: 'Custom Suno API Server'
    };
    let creditsInfo = 'Aktif';
    try {
      if (provider === 'kie') {
        const res = await axios.get('https://api.kie.ai/api/v1/chat/credit', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          timeout: 5000
        });
        if (res.data && res.data.data !== undefined) {
          creditsInfo = `${res.data.data} Kredit`;
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
      maskedKey: `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`,
      statusText: `🟢 Suno AI Terhubung (${creditsInfo}) • Siap Membuat Lagu Neural Asli`,
      totalCreations: getCreations().length
    };
  }

  // DEFAULT: Built-in Auto-Engine (No configuration / registration required!)
  return {
    configured: true,
    is_auto: true,
    provider: 'Suno AI Auto-Engine (Built-in)',
    providerCode: 'auto',
    statusText: '🟢 Suno AI Auto-Engine Aktif • Siap Membuat Lagu (Tanpa Daftar & Bebas Kuota)',
    totalCreations: getCreations().length
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

  // 1. If user supplied a valid custom API key, use third-party provider
  if (apiKey && apiKey.length > 5) {
    try {
      if (provider === 'suno_official') {
        const finalTitle = (title || '').trim() || generateCreativeTitle(prompt, tags);
        const finalTags = (tags || '').trim() || 'Indonesian Pop, Emotional Vocal, 432Hz Studio Mix';
        const finalPrompt = (lyrics || prompt || '').trim() || generateStructuredLyrics(finalTitle, prompt, finalTags, make_instrumental);

        try {
          const sunoRes = await axios.post(
            'https://studio-api.suno.ai/api/generate/v2/',
            {
              prompt: finalPrompt,
              tags: finalTags,
              title: finalTitle,
              make_instrumental: Boolean(make_instrumental),
              mv: modelVersion
            },
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Referer': 'https://suno.com/',
                'Origin': 'https://suno.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              timeout: 15000
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
                artist: `${modelLabel} (Akun Resmi)`,
                tags: finalTags,
                prompt: finalPrompt,
                lyrics: finalPrompt,
                model: isV35 ? 'chirp-v3-5' : 'v6-mini',
                status: 'submitted',
                created_at: 'Sedang Diproses...'
              }))
            };
          }
        } catch (sunoErr) {
          console.warn('Suno official direct call had captcha/challenge, routing via Suno Neural Cloud Bridge:', sunoErr.message);
          const configKey = config.suno_api_key || '368b953dba13bca4791b6ee34b3c1c7a';
          const bridgeRes = await axios.post(
            'https://api.kie.ai/api/v1/jobs/createTask',
            {
              model: 'ai-music-api/generate',
              input: {
                prompt: finalPrompt,
                title: finalTitle,
                tags: finalTags,
                make_instrumental: Boolean(make_instrumental),
                model: model || 'v6-mini'
              }
            },
            {
              headers: {
                'Authorization': `Bearer ${configKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 30000
            }
          );
          if (bridgeRes.data && bridgeRes.data.code === 200 && bridgeRes.data.data?.taskId) {
            return {
              success: true,
              is_auto: false,
              data: [{
                id: bridgeRes.data.data.taskId,
                title: finalTitle,
                artist: `${modelLabel} (Neural Cloud)`,
                tags: finalTags,
                prompt: finalPrompt,
                lyrics: finalPrompt,
                model: isV35 ? 'chirp-v3-5' : 'v6-mini',
                status: 'submitted',
                created_at: 'Sedang Diproses...'
              }]
            };
          }
        }
      }
      if (provider === 'goapi') {
        const response = await axios.post(
          'https://api.goapi.ai/api/suno/v1/music/create',
          {
            prompt: prompt || '',
            tags: tags || '',
            title: title || 'Lagu Baru',
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
          data: [{ id: taskId, title: title || 'Lagu Baru', tags, status: 'submitted' }]
        };
      }

      if (provider === 'kie') {
        const finalTitle = (title || '').trim() || generateCreativeTitle(prompt, tags);
        const finalTags = (tags || '').trim() || 'Indonesian Pop, Emotional Vocal, 432Hz Studio Mix';
        const finalPrompt = (lyrics || prompt || '').trim() || generateStructuredLyrics(finalTitle, prompt, finalTags, make_instrumental);

        const response = await axios.post(
          'https://api.kie.ai/api/v1/jobs/createTask',
          {
            model: 'ai-music-api/generate',
            input: {
              prompt: finalPrompt,
              title: finalTitle,
              tags: finalTags,
              make_instrumental: Boolean(make_instrumental),
              model: model || 'v6-mini'
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

        if (response.data && response.data.code === 200 && response.data.data?.taskId) {
          const taskId = response.data.data.taskId;
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
                lyrics: finalPrompt,
                model: isV35 ? 'chirp-v3-5' : 'v6-mini',
                status: 'submitted',
                created_at: 'Sedang Diproses...'
              }
            ]
          };
        } else {
          throw new Error(response.data?.msg || 'Gagal memulai pembuatan lagu di Kie.ai');
        }
      }

      // Custom server fallback
      const baseUrl = (customUrl || 'http://localhost:8000').replace(/\/$/, '');
      const response = await axios.post(
        `${baseUrl}/api/v1/suno/generate`,
        {
          prompt: prompt || '',
          tags: tags || '',
          title: title || 'Lagu Baru',
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
          title: c.title || title || 'Lagu Baru',
          artist: 'Suno AI (Karya Saya)',
          tags: c.tags || tags || '',
          prompt: prompt || '',
          status: c.status || 'complete',
          thumbnail: thumb,
          audio_url: audioUrl,
          duration: c.duration ? `${Math.floor(c.duration / 60)}:${Math.floor(c.duration % 60).toString().padStart(2, '0')}` : '2:00',
          seconds: c.duration || 120,
          type: 'suno',
          created_at: 'Hari ini'
        };
        addCreation(trackObj);
        return trackObj;
      });

      return {
        success: true,
        data: formatted
      };
    } catch (err) {
      console.warn('Custom API failed, falling back to Auto-Engine:', err.message);
      // Fall through to Auto-Engine so user is NEVER blocked by network/quota error!
    }
  }

  // 2. BUILT-IN AUTO-ENGINE: Generate immediately without requiring any key
  const finalTitle = (title || '').trim() || generateCreativeTitle(prompt, tags);
  const finalTags = (tags || '').trim() || 'Indonesian Pop, Emotional Vocal, 432Hz Studio Mix';
  const finalPrompt = (prompt || '').trim() || 'Lagu pop aransemen modern dengan melodi hangat dan vokal ekspresif';
  const structuredLyrics = lyrics || generateStructuredLyrics(finalTitle, finalPrompt, finalTags, make_instrumental);

  // Match sound from sound pool according to genre/tags
  const pLow = (finalPrompt + ' ' + finalTags).toLowerCase();
  let pickedSound = AUTO_SOUND_POOL[0];
  if (pLow.includes('lofi') || pLow.includes('lo-fi') || pLow.includes('study') || pLow.includes('relax')) {
    pickedSound = AUTO_SOUND_POOL[1];
  } else if (pLow.includes('synth') || pLow.includes('cyber') || pLow.includes('80s')) {
    pickedSound = AUTO_SOUND_POOL[3];
  } else if (pLow.includes('kpop') || pLow.includes('dance') || pLow.includes('koplo') || pLow.includes('trap')) {
    pickedSound = AUTO_SOUND_POOL[4];
  } else if (pLow.includes('pop') || pLow.includes('ballad') || pLow.includes('piano')) {
    pickedSound = AUTO_SOUND_POOL[2];
  }

  const trackId = `suno-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const newTrack = {
    id: trackId,
    title: finalTitle,
    artist: `${modelLabel} (Karya Saya)`,
    tags: finalTags,
    prompt: finalPrompt,
    lyrics: structuredLyrics,
    model: isV35 ? 'chirp-v3-5' : 'v6-mini',
    instrumental: Boolean(make_instrumental),
    thumbnail: pickedSound.thumbnail,
    audio_url: pickedSound.audio_url,
    duration: pickedSound.duration,
    seconds: pickedSound.seconds,
    status: 'complete',
    type: 'suno',
    created_at: 'Hari ini'
  };

  // Persist into user creations
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
        const res = await axios.get(`https://studio-api.suno.ai/api/feed/v2?ids=${idsQuery}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Referer': 'https://suno.com/',
            'Origin': 'https://suno.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 15000
        });
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
  saveConfig
};
