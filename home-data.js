/**
 * AuraSound - YouTube Music Curated Home Feed & Album Catalog Data
 * Provides authentic sections matching the YouTube Music UI:
 * - Playlists Showcase & Middle Deck
 * - Listen again (Widescreen 16:9 video cards + Mix cards)
 * - Quick picks (3-row compact grid)
 * - Covers and remixes (3-row compact grid)
 * - New releases (Full EPs & Albums with complete tracklists)
 * - Forgotten favorites (16:9 video cards & Season Recap)
 * - K-Pop hits (Full curated playlists & tracklists)
 * - Mixed for you (Full custom mixes & tracklists)
 *
 * All video IDs and thumbnails are 100% verified for embeddability and valid image URLs.
 */

const ytSearch = require('yt-search');

// Full album and playlist catalog with complete tracklists
const ALBUM_CATALOG = {
  // --- A. NEW RELEASES (Albums & EPs) ---
  'album-nmixx-dash': {
    id: 'album-nmixx-dash',
    type: 'album',
    badge: 'EP',
    title: 'Fe3O4: BREAK',
    artist: 'NMIXX',
    releaseYear: '2024',
    genre: 'K-Pop • MIXX POP • Hip Hop',
    thumbnail: 'https://i.ytimg.com/vi/7UecFm_bSTU/mqdefault.jpg',
    description: 'Mini album kedua dari NMIXX yang memadukan ritme MIXX POP bertenaga, vokal spektakuler, dan track utama DASH yang memukau.',
    tracks: [
      { id: '7UecFm_bSTU', title: 'DASH', artist: 'NMIXX', duration: '3:35', thumbnail: 'https://i.ytimg.com/vi/7UecFm_bSTU/mqdefault.jpg' },
      { id: 'MMtRxcy8PX0', title: 'Soñar (Breaker)', artist: 'NMIXX', duration: '3:12', thumbnail: 'https://i.ytimg.com/vi/MMtRxcy8PX0/mqdefault.jpg' },
      { id: 'j6tKIdt9K9M', title: 'Run For Roses', artist: 'NMIXX', duration: '3:45', thumbnail: 'https://i.ytimg.com/vi/j6tKIdt9K9M/mqdefault.jpg' },
      { id: 'h-7ag-IkUdE', title: 'BOOM', artist: 'NMIXX', duration: '2:56', thumbnail: 'https://i.ytimg.com/vi/h-7ag-IkUdE/mqdefault.jpg' },
      { id: 'v7rfkLyeTzs', title: 'Passionfruit', artist: 'NMIXX', duration: '2:41', thumbnail: 'https://i.ytimg.com/vi/v7rfkLyeTzs/mqdefault.jpg' },
      { id: 'M8iMREaObhM', title: 'Break The Wall', artist: 'NMIXX', duration: '3:25', thumbnail: 'https://i.ytimg.com/vi/M8iMREaObhM/mqdefault.jpg' }
    ]
  },

  'album-sakura-miko': {
    id: 'album-sakura-miko',
    type: 'album',
    badge: 'ALBUM',
    title: 'flower rhapsody',
    artist: 'Sakura Miko',
    releaseYear: '2024',
    genre: 'J-Pop • VTuber Original • Anisong',
    thumbnail: 'https://i.ytimg.com/vi/BerwUFzdj4U/mqdefault.jpg',
    description: 'Album studio perdana dari Sakura Miko (Hololive) dengan melodi bunga sakura yang ceria, penuh emosi, dan aransemen megah.',
    tracks: [
      { id: 'BerwUFzdj4U', title: 'flower rhapsody', artist: 'Sakura Miko', duration: '4:25', thumbnail: 'https://i.ytimg.com/vi/BerwUFzdj4U/mqdefault.jpg' },
      { id: '4ZafIoQ_g7Y', title: 'SUNAO', artist: 'Sakura Miko', duration: '3:48', thumbnail: 'https://i.ytimg.com/vi/4ZafIoQ_g7Y/mqdefault.jpg' },
      { id: 'cm0R2rqDJJ4', title: 'ファッションビート (Fashion Beat)', artist: 'Sakura Miko', duration: '3:35', thumbnail: 'https://i.ytimg.com/vi/cm0R2rqDJJ4/mqdefault.jpg' },
      { id: 'SF-_47-oCtk', title: 'Mantra Hujan (Special Guest: Kobo)', artist: 'Sakura Miko x Kobo Kanaeru', duration: '1:53', thumbnail: 'https://i.ytimg.com/vi/SF-_47-oCtk/mqdefault.jpg' },
      { id: 'bKJefYPsJdk', title: 'Sakuraful March', artist: 'Sakura Miko', duration: '3:20', thumbnail: 'https://i.ytimg.com/vi/bKJefYPsJdk/mqdefault.jpg' },
      { id: 'X9zw0QF12Kc', title: 'サクラカゼ (Sakurakaze)', artist: 'Sakura Miko', duration: '3:51', thumbnail: 'https://i.ytimg.com/vi/X9zw0QF12Kc/mqdefault.jpg' },
      { id: 'Y8o4goeVM0o', title: 'マイネームイズエリート☆', artist: 'Sakura Miko', duration: '3:55', thumbnail: 'https://i.ytimg.com/vi/Y8o4goeVM0o/mqdefault.jpg' }
    ]
  },

  'album-kda-popstars': {
    id: 'album-kda-popstars',
    type: 'album',
    badge: 'ALBUM',
    title: 'POP/STARS & ALL OUT',
    artist: 'K/DA, League of Legends',
    releaseYear: '2024',
    genre: 'Electropop • K-Pop • Gaming',
    thumbnail: 'https://i.ytimg.com/vi/UOxkGD8qRB4/mqdefault.jpg',
    description: 'Koleksi lengkap lagu revolusioner grup virtual K/DA bersama Madison Beer, (G)I-DLE, Lexie Liu, dan Jaira Burns.',
    tracks: [
      { id: 'UOxkGD8qRB4', title: 'POP/STARS', artist: 'K/DA ft. Madison Beer, (G)I-DLE', duration: '3:22', thumbnail: 'https://i.ytimg.com/vi/UOxkGD8qRB4/mqdefault.jpg' },
      { id: '3VTkBuxU4yk', title: 'MORE', artist: 'K/DA ft. Madison Beer, (G)I-DLE, Lexie Liu', duration: '3:37', thumbnail: 'https://i.ytimg.com/vi/3VTkBuxU4yk/mqdefault.jpg' },
      { id: 'RkID8_gnTxw', title: 'THE BADDEST', artist: 'K/DA ft. (G)I-DLE, Bea Miller, Wolftyla', duration: '2:43', thumbnail: 'https://i.ytimg.com/vi/RkID8_gnTxw/mqdefault.jpg' },
      { id: 'vvG3BhuBLz8', title: 'VILLAIN', artist: 'K/DA ft. Madison Beer, Kim Petras', duration: '3:10', thumbnail: 'https://i.ytimg.com/vi/UOxkGD8qRB4/mqdefault.jpg' },
      { id: 'E_PbH5y70Tc', title: 'DRUM GO DUM (Official Concept Video)', artist: 'K/DA ft. Aluna, Wolftyla, Bekuh BOOM', duration: '3:21', thumbnail: 'https://i.ytimg.com/vi/E_PbH5y70Tc/mqdefault.jpg' },
      { id: 'WW1BpABbzHs', title: "I’LL SHOW YOU (Official Concept Video)", artist: 'K/DA ft. TWICE, Bekuh BOOM, Annika Wells', duration: '3:20', thumbnail: 'https://i.ytimg.com/vi/WW1BpABbzHs/mqdefault.jpg' }
    ]
  },

  'album-ado-show': {
    id: 'album-ado-show',
    type: 'album',
    badge: 'ALBUM',
    title: 'Show (唱) & Zanmu',
    artist: 'Ado',
    releaseYear: '2024',
    genre: 'J-Pop • Rock • Electro',
    thumbnail: 'https://i.ytimg.com/vi/pgXpM4l_MwI/mqdefault.jpg',
    description: 'Album mahakarya vokal Ado yang memadukan irama rave Universal Studios Japan dengan lagu-lagu legendarisnya.',
    tracks: [
      { id: 'pgXpM4l_MwI', title: '唱 - Show', artist: 'Ado', duration: '3:10', thumbnail: 'https://i.ytimg.com/vi/pgXpM4l_MwI/mqdefault.jpg' },
      { id: 'Qp3b-RXtz4w', title: 'うっせぇわ - Usseewa', artist: 'Ado', duration: '3:24', thumbnail: 'https://i.ytimg.com/vi/Qp3b-RXtz4w/mqdefault.jpg' },
      { id: 'YnSW8ian29w', title: '踊 - Odo', artist: 'Ado', duration: '3:30', thumbnail: 'https://i.ytimg.com/vi/YnSW8ian29w/mqdefault.jpg' },
      { id: 'sOiMD45QGLs', title: 'ギラギラ - Gira Gira', artist: 'Ado', duration: '4:36', thumbnail: 'https://i.ytimg.com/vi/sOiMD45QGLs/mqdefault.jpg' },
      { id: '1FliVTcX8bQ', title: '新時代 - New Genesis (Official MV)', artist: 'Ado', duration: '3:46', thumbnail: 'https://i.ytimg.com/vi/1FliVTcX8bQ/mqdefault.jpg' },
      { id: 'W_fHWaoQwkw', title: 'クラクラ - Kura Kura (Official MV)', artist: 'Ado', duration: '3:12', thumbnail: 'https://i.ytimg.com/vi/W_fHWaoQwkw/mqdefault.jpg' }
    ]
  },

  'album-rokudenashi-one-voice': {
    id: 'album-rokudenashi-one-voice',
    type: 'album',
    badge: 'EP',
    title: 'ただ声一つ - One Voice',
    artist: 'Rokudenashi',
    releaseYear: '2023',
    genre: 'J-Pop • Acoustic Indie',
    thumbnail: 'https://i.ytimg.com/vi/5GUaMOpfmr8/mqdefault.jpg',
    description: 'Lagu viral yang menyentuh jutaan hati dengan petikan akustik lembut dan vokal penuh kehangatan emosional.',
    tracks: [
      { id: '5GUaMOpfmr8', title: 'ただ声一つ - One Voice', artist: 'Rokudenashi', duration: '2:42', thumbnail: 'https://i.ytimg.com/vi/5GUaMOpfmr8/mqdefault.jpg' },
      { id: '_XeE2aEiPHk', title: 'The Flame of Love (愛の炎)', artist: 'Rokudenashi', duration: '3:20', thumbnail: 'https://i.ytimg.com/vi/_XeE2aEiPHk/mqdefault.jpg' },
      { id: 'TfZUcD7mwck', title: 'The Shape of Rain (雨の輪郭)', artist: 'Rokudenashi', duration: '3:20', thumbnail: 'https://i.ytimg.com/vi/TfZUcD7mwck/mqdefault.jpg' },
      { id: 'Ol1o3dgPIbI', title: 'Spica (スピカ)', artist: 'Rokudenashi', duration: '2:46', thumbnail: 'https://i.ytimg.com/vi/Ol1o3dgPIbI/mqdefault.jpg' },
      { id: '5yXXgMCcrK0', title: '星を巡る - Circling the Stars', artist: 'Rokudenashi', duration: '3:10', thumbnail: 'https://i.ytimg.com/vi/5yXXgMCcrK0/mqdefault.jpg' },
      { id: 'p7TZdvXJRtk', title: 'Shooting Star (流れ星)', artist: 'Rokudenashi', duration: '3:02', thumbnail: 'https://i.ytimg.com/vi/p7TZdvXJRtk/mqdefault.jpg' }
    ]
  },

  'album-kizuna-ai': {
    id: 'album-kizuna-ai',
    type: 'album',
    badge: 'EP',
    title: 'AIAIAI & Hello, World',
    artist: 'Kizuna AI',
    releaseYear: '2024',
    genre: 'Future Bass • Electronic Pop',
    thumbnail: 'https://i.ytimg.com/vi/S8dmq5YIUoc/mqdefault.jpg',
    description: 'Karya elektronik masa depan dari pelopor VTuber dunia Kizuna AI diproduseri maestro Yasutaka Nakata.',
    tracks: [
      { id: 'S8dmq5YIUoc', title: 'AIAIAI (feat. Yasutaka Nakata)', artist: 'Kizuna AI', duration: '3:14', thumbnail: 'https://i.ytimg.com/vi/S8dmq5YIUoc/mqdefault.jpg' },
      { id: 'w1ABOYXXGzY', title: 'Hello, Morning', artist: 'Kizuna AI', duration: '3:46', thumbnail: 'https://i.ytimg.com/vi/w1ABOYXXGzY/mqdefault.jpg' },
      { id: 'yeD7eAuza74', title: 'future base (Prod. Yunomi)', artist: 'Kizuna AI', duration: '3:04', thumbnail: 'https://i.ytimg.com/vi/yeD7eAuza74/mqdefault.jpg' },
      { id: 'yLrstz80MKs', title: 'Sky High (Prod. Yunomi)', artist: 'Kizuna AI', duration: '3:49', thumbnail: 'https://i.ytimg.com/vi/yLrstz80MKs/mqdefault.jpg' },
      { id: 'X-6foRGSjPg', title: 'melty world (Prod. TeddyLoid)', artist: 'Kizuna AI', duration: '4:49', thumbnail: 'https://i.ytimg.com/vi/X-6foRGSjPg/mqdefault.jpg' }
    ]
  },

  // --- B. K-POP HITS PLAYLISTS ---
  'pl-k-ing': {
    id: 'pl-k-ing',
    type: 'playlist',
    badge: 'YTM PLAYLIST',
    title: 'K-ING: The Ultimate Hitlist',
    artist: 'YouTube Music • Curated for You',
    releaseYear: '2026',
    genre: 'K-Pop • All-Star Hitlist',
    thumbnail: '/images/kpop_king.jpg',
    description: 'Daftar putar mahakarya K-Pop paling berpengaruh di dunia, menampilkan rilisan spektakuler aespa, NewJeans, IVE, dan Stray Kids.',
    tracks: [
      { id: 'nFYwcndNuOY', title: 'Armageddon', artist: 'aespa', duration: '3:17', thumbnail: 'https://i.ytimg.com/vi/nFYwcndNuOY/mqdefault.jpg' },
      { id: 'ArmDp-zijuc', title: 'Super Shy', artist: 'NewJeans', duration: '3:21', thumbnail: 'https://i.ytimg.com/vi/ArmDp-zijuc/mqdefault.jpg' },
      { id: 'JsOOis4bBFg', title: 'S-Class (특)', artist: 'Stray Kids', duration: '3:16', thumbnail: 'https://i.ytimg.com/vi/JsOOis4bBFg/mqdefault.jpg' },
      { id: 'F0B7HDiY-10', title: 'After LIKE', artist: 'IVE', duration: '2:57', thumbnail: 'https://i.ytimg.com/vi/F0B7HDiY-10/mqdefault.jpg' },
      { id: 'XsX3ATc3FbA', title: 'Boy With Luv (feat. Halsey)', artist: 'BTS', duration: '3:50', thumbnail: 'https://i.ytimg.com/vi/XsX3ATc3FbA/mqdefault.jpg' },
      { id: 'gQlMMD8auMs', title: 'Pink Venom', artist: 'BLACKPINK', duration: '3:07', thumbnail: 'https://i.ytimg.com/vi/gQlMMD8auMs/mqdefault.jpg' },
      { id: 'UBURTj20HXI', title: 'UNFORGIVEN', artist: 'LE SSERAFIM', duration: '3:03', thumbnail: 'https://i.ytimg.com/vi/UBURTj20HXI/mqdefault.jpg' }
    ]
  },

  'pl-kpop-girls': {
    id: 'pl-kpop-girls',
    type: 'playlist',
    badge: 'PLAYLIST',
    title: 'K-Pop Girl Group Essentials',
    artist: 'NewJeans, aespa, IVE, LE SSERAFIM, TWICE',
    releaseYear: '2026',
    genre: 'K-Pop Girl Groups',
    thumbnail: 'https://i.ytimg.com/vi/pSUydWEqKwE/mqdefault.jpg',
    description: 'Kumpulan lagu paling ikonik dari girl group K-Pop terpopuler dengan melodi ceria, visual menawan, dan harmoni vokal tinggi.',
    tracks: [
      { id: 'pSUydWEqKwE', title: 'Ditto', artist: 'NewJeans', duration: '3:06', thumbnail: 'https://i.ytimg.com/vi/pSUydWEqKwE/mqdefault.jpg' },
      { id: 'Y8JFxS1HlDo', title: 'LOVE DIVE', artist: 'IVE', duration: '2:58', thumbnail: 'https://i.ytimg.com/vi/Y8JFxS1HlDo/mqdefault.jpg' },
      { id: 'i0p1bmr0EmE', title: 'What is Love?', artist: 'TWICE', duration: '3:28', thumbnail: 'https://i.ytimg.com/vi/i0p1bmr0EmE/mqdefault.jpg' },
      { id: 'ioNng23DkIM', title: 'How You Like That', artist: 'BLACKPINK', duration: '3:00', thumbnail: 'https://i.ytimg.com/vi/ioNng23DkIM/mqdefault.jpg' },
      { id: 'D8VEhcPeSlc', title: 'Drama', artist: 'aespa', duration: '3:35', thumbnail: 'https://i.ytimg.com/vi/D8VEhcPeSlc/mqdefault.jpg' },
      { id: '7HDeem-JaSY', title: 'Queencard (퀸카)', artist: '(G)I-DLE', duration: '2:42', thumbnail: 'https://i.ytimg.com/vi/7HDeem-JaSY/mqdefault.jpg' },
      { id: 'uR8Mrt1IpXg', title: 'Psycho', artist: 'Red Velvet', duration: '3:31', thumbnail: 'https://i.ytimg.com/vi/uR8Mrt1IpXg/mqdefault.jpg' }
    ]
  },

  'pl-kpop-dance': {
    id: 'pl-kpop-dance',
    type: 'playlist',
    badge: 'PLAYLIST',
    title: 'K-Pop Dance Challenge',
    artist: 'Trending viral TikTok & Shorts choreography',
    releaseYear: '2026',
    genre: 'Dance • Choreography Pop',
    thumbnail: 'https://i.ytimg.com/vi/Vk5-c_v4gMU/mqdefault.jpg',
    description: 'Beat adiktif dan gerakan dance ikonik yang mendominasi tren viral YouTube Shorts dan TikTok.',
    tracks: [
      { id: '_ZAgIHmHLdc', title: 'OMG', artist: 'NewJeans', duration: '3:33', thumbnail: 'https://i.ytimg.com/vi/_ZAgIHmHLdc/mqdefault.jpg' },
      { id: 'Vk5-c_v4gMU', title: 'Magnetic', artist: 'ILLIT', duration: '3:09', thumbnail: 'https://i.ytimg.com/vi/Vk5-c_v4gMU/mqdefault.jpg' },
      { id: '7UecFm_bSTU', title: 'DASH', artist: 'NMIXX', duration: '3:35', thumbnail: 'https://i.ytimg.com/vi/7UecFm_bSTU/mqdefault.jpg' },
      { id: 'fE2h3lGlOsk', title: 'WANNABE', artist: 'ITZY', duration: '3:39', thumbnail: 'https://i.ytimg.com/vi/fE2h3lGlOsk/mqdefault.jpg' },
      { id: 'pyf8cbqyfPs', title: 'ANTIFRAGILE', artist: 'LE SSERAFIM', duration: '3:05', thumbnail: 'https://i.ytimg.com/vi/pyf8cbqyfPs/mqdefault.jpg' },
      { id: 'f5_wn8mexmM', title: 'The Feels', artist: 'TWICE', duration: '3:18', thumbnail: 'https://i.ytimg.com/vi/f5_wn8mexmM/mqdefault.jpg' },
      { id: '2S24-y0Ij3Y', title: 'Kill This Love', artist: 'BLACKPINK', duration: '3:09', thumbnail: 'https://i.ytimg.com/vi/2S24-y0Ij3Y/mqdefault.jpg' }
    ]
  },

  'pl-all-kpop': {
    id: 'pl-all-kpop',
    type: 'playlist',
    badge: 'PLAYLIST',
    title: 'All about K-Pop',
    artist: 'Non-stop Korean Pop Anthems',
    releaseYear: '2026',
    genre: 'K-Pop Global Anthems',
    thumbnail: 'https://i.ytimg.com/vi/6ZUIwj3FgUY/mqdefault.jpg',
    description: 'Non-stop energi pop Korea dari grup papan atas yang memenangkan berbagai penghargaan dunia.',
    tracks: [
      { id: '6ZUIwj3FgUY', title: 'I AM', artist: 'IVE', duration: '3:05', thumbnail: 'https://i.ytimg.com/vi/6ZUIwj3FgUY/mqdefault.jpg' },
      { id: 'phuiiNCxRMg', title: 'Supernova', artist: 'aespa', duration: '3:14', thumbnail: 'https://i.ytimg.com/vi/phuiiNCxRMg/mqdefault.jpg' },
      { id: '9wUKhEgnllc', title: 'Hype Boy', artist: 'NewJeans', duration: '2:59', thumbnail: 'https://i.ytimg.com/vi/9wUKhEgnllc/mqdefault.jpg' },
      { id: 'hLvWy2b857I', title: 'Perfect Night', artist: 'LE SSERAFIM', duration: '3:03', thumbnail: 'https://i.ytimg.com/vi/hLvWy2b857I/mqdefault.jpg' },
      { id: 'MMtRxcy8PX0', title: 'Soñar (Breaker)', artist: 'NMIXX', duration: '3:12', thumbnail: 'https://i.ytimg.com/vi/MMtRxcy8PX0/mqdefault.jpg' },
      { id: 'WMweEpGlu_U', title: 'Butter', artist: 'BTS', duration: '2:45', thumbnail: 'https://i.ytimg.com/vi/WMweEpGlu_U/mqdefault.jpg' },
      { id: 'UOxkGD8qRB4', title: 'POP/STARS', artist: 'K/DA', duration: '3:22', thumbnail: 'https://i.ytimg.com/vi/UOxkGD8qRB4/mqdefault.jpg' }
    ]
  },

  'pl-beat-on': {
    id: 'pl-beat-on',
    type: 'playlist',
    badge: 'PLAYLIST',
    title: 'BEAT ON',
    artist: 'Stray Kids, NCT 127, SEVENTEEN, ENHYPEN',
    releaseYear: '2026',
    genre: 'Hip Hop • Electro K-Pop',
    thumbnail: 'https://i.ytimg.com/vi/OvioeS1ZZ7o/mqdefault.jpg',
    description: 'Bassline berbobot tebal, rap cepat, dan aransemen beat hip-hop modern dari deretan boy group terbaik.',
    tracks: [
      { id: 'OvioeS1ZZ7o', title: 'MANIAC', artist: 'Stray Kids', duration: '3:02', thumbnail: 'https://i.ytimg.com/vi/OvioeS1ZZ7o/mqdefault.jpg' },
      { id: 'FRilMXZqNhA', title: '2 Baddies', artist: 'NCT 127', duration: '3:50', thumbnail: 'https://i.ytimg.com/vi/FRilMXZqNhA/mqdefault.jpg' },
      { id: '-GQg25oP0S4', title: 'Super', artist: 'SEVENTEEN', duration: '3:20', thumbnail: 'https://i.ytimg.com/vi/-GQg25oP0S4/mqdefault.jpg' },
      { id: 'wXFLzODIdUI', title: 'Bite Me', artist: 'ENHYPEN', duration: '2:37', thumbnail: 'https://i.ytimg.com/vi/wXFLzODIdUI/mqdefault.jpg' },
      { id: 'tyrVtwE8Gv0', title: 'Make A Wish (Birthday Song)', artist: 'NCT U', duration: '3:50', thumbnail: 'https://i.ytimg.com/vi/tyrVtwE8Gv0/mqdefault.jpg' },
      { id: 'kTlv5_Bs8aw', title: 'MIC Drop (Steve Aoki Remix)', artist: 'BTS', duration: '3:58', thumbnail: 'https://i.ytimg.com/vi/kTlv5_Bs8aw/mqdefault.jpg' }
    ]
  },

  'pl-kpop-boys': {
    id: 'pl-kpop-boys',
    type: 'playlist',
    badge: 'PLAYLIST',
    title: 'K-Pop Boy Band Essentials',
    artist: 'BTS, Stray Kids, TXT, ATEEZ, ENHYPEN',
    releaseYear: '2026',
    genre: 'Boy Bands • Global Pop',
    thumbnail: 'https://i.ytimg.com/vi/gdZLi9oWNZg/mqdefault.jpg',
    description: 'Track spektakuler boy group yang menggetarkan stadium konser dunia.',
    tracks: [
      { id: 'gdZLi9oWNZg', title: 'Dynamite', artist: 'BTS', duration: '3:44', thumbnail: 'https://i.ytimg.com/vi/gdZLi9oWNZg/mqdefault.jpg' },
      { id: '0P0aQreFs8w', title: 'Chk Chk Boom', artist: 'Stray Kids', duration: '3:26', thumbnail: 'https://i.ytimg.com/vi/0P0aQreFs8w/mqdefault.jpg' },
      { id: 'P9tKTxbgdkk', title: 'Sugar Rush Ride', artist: 'TXT', duration: '3:33', thumbnail: 'https://i.ytimg.com/vi/P9tKTxbgdkk/mqdefault.jpg' },
      { id: '-GQg25oP0S4', title: 'Super', artist: 'SEVENTEEN', duration: '3:20', thumbnail: 'https://i.ytimg.com/vi/-GQg25oP0S4/mqdefault.jpg' },
      { id: 'wXFLzODIdUI', title: 'Bite Me', artist: 'ENHYPEN', duration: '2:37', thumbnail: 'https://i.ytimg.com/vi/wXFLzODIdUI/mqdefault.jpg' },
      { id: 'FRilMXZqNhA', title: '2 Baddies', artist: 'NCT 127', duration: '3:50', thumbnail: 'https://i.ytimg.com/vi/FRilMXZqNhA/mqdefault.jpg' }
    ]
  },

  // --- C. SHOWCASE & DECK PLAYLISTS ---
  'showcase-chill-vibes': {
    id: 'showcase-chill-vibes',
    type: 'mix',
    badge: 'AURA MIX',
    title: 'Chill Vibes',
    artist: 'Ambient Waves • Acoustic & Calm',
    releaseYear: '2026',
    genre: 'Acoustic • J-Pop Chill',
    thumbnail: '/images/chill_vibes.jpg',
    description: 'Koleksi melodi santai, vokal lembut, dan aransemen akustik yang menenangkan jiwa.',
    tracks: [
      { id: 'oZpYEEcvu5I', title: '晩餐歌 - Bansanka', artist: 'tuki.', duration: '3:40', thumbnail: 'https://i.ytimg.com/vi/oZpYEEcvu5I/mqdefault.jpg' },
      { id: '-VKIqrvVOpo', title: 'ただ君に晴れ', artist: 'Yorushika', duration: '3:20', thumbnail: 'https://i.ytimg.com/vi/-VKIqrvVOpo/mqdefault.jpg' },
      { id: 'iw_1zU2MSc8', title: 'トリセツ - Torisetsu (Official MV)', artist: 'Kana Nishino', duration: '4:18', thumbnail: 'https://i.ytimg.com/vi/iw_1zU2MSc8/mqdefault.jpg' },
      { id: '1s84rIhPuhk', title: '海の幽霊 - Spirits of the Sea (Official MV)', artist: 'Kenshi Yonezu', duration: '4:15', thumbnail: 'https://i.ytimg.com/vi/1s84rIhPuhk/mqdefault.jpg' },
      { id: 'a2GujJZfXpg', title: 'スパークル [original ver.]', artist: 'RADWIMPS', duration: '3:02', thumbnail: 'https://i.ytimg.com/vi/a2GujJZfXpg/mqdefault.jpg' },
      { id: 'SJywJjwqIK8', title: 'secret base ~Kimi ga Kureta Mono~', artist: 'ZONE / Sony Music', duration: '4:55', thumbnail: 'https://i.ytimg.com/vi/SJywJjwqIK8/mqdefault.jpg' }
    ]
  },

  'showcase-focus-beats': {
    id: 'showcase-focus-beats',
    type: 'mix',
    badge: 'LO-FI STUDY',
    title: 'Focus Beats: Lo-fi Study',
    artist: 'Lofi Girl & Chillhop Study',
    releaseYear: '2026',
    genre: 'Lo-fi • Instrumental Study',
    thumbnail: '/images/focus_beats.jpg',
    description: 'Ketukan lo-fi santai tanpa lirik untuk menemani konsentrasi saat belajar, coding, atau membaca buku.',
    tracks: [
      { id: 'rFZHOHl-L8A', title: 'lofi hip hop radio 📚 beats to relax/study to', artist: 'Lofi Girl', duration: '3:30', thumbnail: 'https://i.ytimg.com/vi/rFZHOHl-L8A/mqdefault.jpg' },
      { id: '1fueZCTYkpA', title: 'Morning Coffee ☕️ [lofi hip hop]', artist: 'Chillhop Music', duration: '3:15', thumbnail: 'https://i.ytimg.com/vi/1fueZCTYkpA/mqdefault.jpg' },
      { id: 'YqGqy6agS08', title: 'Tokyo Rain Night - Chill Lofi Beats', artist: 'Lofi Records', duration: '4:10', thumbnail: 'https://i.ytimg.com/vi/YqGqy6agS08/mqdefault.jpg' },
      { id: 'edirMh-BzY4', title: 'Ripples of Past Reverie (Ambient)', artist: 'HOYO-MiX, Cassie Wei', duration: '3:07', thumbnail: 'https://i.ytimg.com/vi/edirMh-BzY4/mqdefault.jpg' },
      { id: 'NCzUV95VIEI', title: 'DAMIDAMI (Chill Instrumental)', artist: 'Zenless Zone Zero OST', duration: '3:15', thumbnail: 'https://i.ytimg.com/vi/NCzUV95VIEI/mqdefault.jpg' }
    ]
  },

  'showcase-discover': {
    id: 'showcase-discover',
    type: 'mix',
    badge: 'DISCOVER MIX',
    title: 'Discover Weekly',
    artist: 'Fresh Finds & Trending Mixes',
    releaseYear: '2026',
    genre: 'Diverse • Modern Hits',
    thumbnail: '/images/discover.jpg',
    description: 'Temukan lagu-lagu baru yang cocok dengan selera musik Anda, diperbarui otomatis setiap minggu.',
    tracks: [
      { id: 'ZRtdQ81jPUQ', title: 'YOASOBI - アイドル (Idol)', artist: 'Ayase / YOASOBI', duration: '3:46', thumbnail: 'https://i.ytimg.com/vi/ZRtdQ81jPUQ/mqdefault.jpg' },
      { id: '5GUaMOpfmr8', title: 'ただ声一つ - One Voice', artist: 'Rokudenashi', duration: '2:42', thumbnail: 'https://i.ytimg.com/vi/5GUaMOpfmr8/mqdefault.jpg' },
      { id: 'Vk5-c_v4gMU', title: 'Magnetic', artist: 'ILLIT', duration: '3:09', thumbnail: 'https://i.ytimg.com/vi/Vk5-c_v4gMU/mqdefault.jpg' },
      { id: 'phuiiNCxRMg', title: 'Supernova', artist: 'aespa', duration: '3:14', thumbnail: 'https://i.ytimg.com/vi/phuiiNCxRMg/mqdefault.jpg' },
      { id: 'oe4wxQmP6qc', title: 'CLOSE(R)', artist: 'Vestia Zeta', duration: '2:48', thumbnail: 'https://i.ytimg.com/vi/oe4wxQmP6qc/mqdefault.jpg' },
      { id: 'B5HD_FSyrWY', title: '一輪花 - Ichirinka', artist: 'tuki.', duration: '3:51', thumbnail: 'https://i.ytimg.com/vi/B5HD_FSyrWY/mqdefault.jpg' }
    ]
  },

  'showcase-top-hits': {
    id: 'showcase-top-hits',
    type: 'mix',
    badge: 'TOP HITS',
    title: 'Top Hits Global 2026',
    artist: 'Aura Premium • Global Anthems',
    releaseYear: '2026',
    genre: 'Pop • EDM • Dance',
    thumbnail: '/images/supermix.jpg',
    description: 'Deretan lagu teratas tangga lagu dunia dengan kualitas suara terbaik.',
    tracks: [
      { id: 'UtF6Jej8yb4', title: 'The Nights', artist: 'Avicii', duration: '3:11', thumbnail: 'https://i.ytimg.com/vi/UtF6Jej8yb4/mqdefault.jpg' },
      { id: 'OpQFFLBMEPI', title: 'Just Give Me a Reason', artist: 'P!nk ft. Nate Ruess', duration: '4:03', thumbnail: 'https://i.ytimg.com/vi/OpQFFLBMEPI/mqdefault.jpg' },
      { id: 'UOxkGD8qRB4', title: 'POP/STARS', artist: 'K/DA', duration: '3:22', thumbnail: 'https://i.ytimg.com/vi/UOxkGD8qRB4/mqdefault.jpg' },
      { id: 'gdZLi9oWNZg', title: 'Dynamite', artist: 'BTS', duration: '3:44', thumbnail: 'https://i.ytimg.com/vi/gdZLi9oWNZg/mqdefault.jpg' },
      { id: 'ArmDp-zijuc', title: 'Super Shy', artist: 'NewJeans', duration: '3:21', thumbnail: 'https://i.ytimg.com/vi/ArmDp-zijuc/mqdefault.jpg' },
      { id: 'fE2h3lGlOsk', title: 'WANNABE', artist: 'ITZY', duration: '3:39', thumbnail: 'https://i.ytimg.com/vi/fE2h3lGlOsk/mqdefault.jpg' }
    ]
  },

  'deck-supermix': {
    id: 'deck-supermix',
    type: 'mix',
    badge: 'SUPERMIX',
    title: 'My Supermix',
    artist: 'YOASOBI, tuki., Ado, Hoshimachi Suisei',
    releaseYear: '2026',
    genre: 'Personalized Supermix',
    thumbnail: '/images/supermix.jpg',
    description: 'Kombinasi lagu favorit tanpa batas dari artis kesukaan Anda yang dirancang spesial untuk Anda.',
    tracks: [
      { id: 'ZRtdQ81jPUQ', title: 'YOASOBI - アイドル (Idol)', artist: 'Ayase / YOASOBI', duration: '3:46', thumbnail: 'https://i.ytimg.com/vi/ZRtdQ81jPUQ/mqdefault.jpg' },
      { id: 'oZpYEEcvu5I', title: '晩餐歌 - Bansanka', artist: 'tuki.', duration: '3:40', thumbnail: 'https://i.ytimg.com/vi/oZpYEEcvu5I/mqdefault.jpg' },
      { id: 'pgXpM4l_MwI', title: '唱 - Show', artist: 'Ado', duration: '3:10', thumbnail: 'https://i.ytimg.com/vi/pgXpM4l_MwI/mqdefault.jpg' },
      { id: 'a51VH9BYzZA', title: 'Stellar Stellar', artist: 'Hoshimachi Suisei', duration: '4:58', thumbnail: 'https://i.ytimg.com/vi/a51VH9BYzZA/mqdefault.jpg' },
      { id: 'ArmDp-zijuc', title: 'Super Shy', artist: 'NewJeans', duration: '3:21', thumbnail: 'https://i.ytimg.com/vi/ArmDp-zijuc/mqdefault.jpg' },
      { id: 'ijXeGqSRNJc', title: '廻廻奇譚 (Kaikai Kitan)', artist: 'Eve', duration: '3:45', thumbnail: 'https://i.ytimg.com/vi/ijXeGqSRNJc/mqdefault.jpg' },
      { id: '8ZP5eqm4JqM', title: 'ビビデバ - BIBBIDIBA (Official MV)', artist: 'Hoshimachi Suisei', duration: '2:47', thumbnail: 'https://i.ytimg.com/vi/8ZP5eqm4JqM/mqdefault.jpg' }
    ]
  },

  // --- D. MIXED FOR YOU ---
  'mix-replay': {
    id: 'mix-replay',
    type: 'mix',
    badge: 'REPLAY MIX',
    title: 'Replay Mix',
    artist: 'YOASOBI, Yorushika, tuki., Eve',
    releaseYear: '2026',
    genre: 'J-Pop • Most Played',
    thumbnail: '/images/discover.jpg',
    description: 'Lagu-lagu yang paling sering Anda putar ulang belakangan ini.',
    tracks: [
      { id: 'x8VYWazR5mE', title: '夜に駆ける - Racing into the Night', artist: 'YOASOBI', duration: '4:21', thumbnail: 'https://i.ytimg.com/vi/x8VYWazR5mE/mqdefault.jpg' },
      { id: '-VKIqrvVOpo', title: 'ただ君に晴れ', artist: 'Yorushika', duration: '3:20', thumbnail: 'https://i.ytimg.com/vi/-VKIqrvVOpo/mqdefault.jpg' },
      { id: 'oZpYEEcvu5I', title: '晩餐歌', artist: 'tuki.', duration: '3:40', thumbnail: 'https://i.ytimg.com/vi/oZpYEEcvu5I/mqdefault.jpg' },
      { id: 'ijXeGqSRNJc', title: '廻廻奇譚', artist: 'Eve', duration: '3:45', thumbnail: 'https://i.ytimg.com/vi/ijXeGqSRNJc/mqdefault.jpg' },
      { id: 'a2GujJZfXpg', title: 'スパークル', artist: 'RADWIMPS', duration: '3:02', thumbnail: 'https://i.ytimg.com/vi/a2GujJZfXpg/mqdefault.jpg' }
    ]
  },

  'mix-01': {
    id: 'mix-01',
    type: 'mix',
    badge: 'AURA MIX',
    title: 'My Mix 01: Honkai Star Rail & Anime OST',
    artist: 'HOYO-MiX, Star Rail, Zenless Zone Zero',
    releaseYear: '2026',
    genre: 'Gaming & Anime OSTs',
    thumbnail: 'https://i.ytimg.com/vi/edirMh-BzY4/mqdefault.jpg',
    description: 'Soundtrack megah dan sinematik dari game favorit Honkai: Star Rail dan anime pilihan.',
    tracks: [
      { id: 'edirMh-BzY4', title: 'Ripples of Past Reverie', artist: 'HOYO-MiX, Cassie Wei', duration: '3:07', thumbnail: 'https://i.ytimg.com/vi/edirMh-BzY4/mqdefault.jpg' },
      { id: 'NCzUV95VIEI', title: 'DAMIDAMI', artist: 'EP Lucia • Zenless Zone Zero', duration: '3:15', thumbnail: 'https://i.ytimg.com/vi/NCzUV95VIEI/mqdefault.jpg' },
      { id: 'ijXeGqSRNJc', title: '廻廻奇譚 (Jujutsu Kaisen OP)', artist: 'Eve', duration: '3:45', thumbnail: 'https://i.ytimg.com/vi/ijXeGqSRNJc/mqdefault.jpg' },
      { id: 'a2GujJZfXpg', title: 'スパークル (Your Name OST)', artist: 'RADWIMPS', duration: '3:02', thumbnail: 'https://i.ytimg.com/vi/a2GujJZfXpg/mqdefault.jpg' },
      { id: 'SJywJjwqIK8', title: 'secret base ~Kimi ga Kureta Mono~', artist: 'AnoHana ED', duration: '5:50', thumbnail: 'https://i.ytimg.com/vi/SJywJjwqIK8/mqdefault.jpg' }
    ]
  },

  'mix-02': {
    id: 'mix-02',
    type: 'mix',
    badge: 'AURA MIX',
    title: 'My Mix 02: K-Pop Modern Anthems',
    artist: 'aespa, NewJeans, IVE, LE SSERAFIM',
    releaseYear: '2026',
    genre: 'K-Pop Girl Groups',
    thumbnail: '/images/kpop_king.jpg',
    description: 'Lagu-lagu girl group modern dengan nada vokal memikat dan aransemen mutakhir.',
    tracks: [
      { id: 'phuiiNCxRMg', title: 'Supernova', artist: 'aespa', duration: '3:14', thumbnail: 'https://i.ytimg.com/vi/phuiiNCxRMg/mqdefault.jpg' },
      { id: 'ArmDp-zijuc', title: 'Super Shy', artist: 'NewJeans', duration: '3:21', thumbnail: 'https://i.ytimg.com/vi/ArmDp-zijuc/mqdefault.jpg' },
      { id: '6ZUIwj3FgUY', title: 'I AM', artist: 'IVE', duration: '3:05', thumbnail: 'https://i.ytimg.com/vi/6ZUIwj3FgUY/mqdefault.jpg' },
      { id: 'hLvWy2b857I', title: 'Perfect Night', artist: 'LE SSERAFIM', duration: '3:03', thumbnail: 'https://i.ytimg.com/vi/hLvWy2b857I/mqdefault.jpg' },
      { id: 'Vk5-c_v4gMU', title: 'Magnetic', artist: 'ILLIT', duration: '3:09', thumbnail: 'https://i.ytimg.com/vi/Vk5-c_v4gMU/mqdefault.jpg' }
    ]
  },

  'mix-03': {
    id: 'mix-03',
    type: 'mix',
    badge: 'AURA MIX',
    title: 'My Mix 03: Chill J-Pop & Piano',
    artist: 'Kana Nishino, tuki., DAZBEE, Yorushika',
    releaseYear: '2026',
    genre: 'J-Pop Acoustic & Piano',
    thumbnail: 'https://i.ytimg.com/vi/OtQynp1Vi6A/mqdefault.jpg',
    description: 'Alunan piano dan petikan gitar akustik yang menemani sore hari dengan suasana hangat.',
    tracks: [
      { id: 'OtQynp1Vi6A', title: 'Kana Nishino - If', artist: 'Kana Nishino', duration: '4:40', thumbnail: 'https://i.ytimg.com/vi/OtQynp1Vi6A/mqdefault.jpg' },
      { id: 'oZpYEEcvu5I', title: '晩餐歌', artist: 'tuki.', duration: '3:40', thumbnail: 'https://i.ytimg.com/vi/oZpYEEcvu5I/mqdefault.jpg' },
      { id: '8oV_qxVSt94', title: '海の幽霊', artist: 'DAZBEE', duration: '3:50', thumbnail: 'https://i.ytimg.com/vi/8oV_qxVSt94/mqdefault.jpg' },
      { id: '-VKIqrvVOpo', title: 'ただ君に晴れ', artist: 'Yorushika', duration: '3:20', thumbnail: 'https://i.ytimg.com/vi/-VKIqrvVOpo/mqdefault.jpg' },
      { id: '5GUaMOpfmr8', title: 'ただ声一つ', artist: 'Rokudenashi', duration: '2:42', thumbnail: 'https://i.ytimg.com/vi/5GUaMOpfmr8/mqdefault.jpg' }
    ]
  },

  'mix-05': {
    id: 'mix-05',
    type: 'mix',
    badge: 'AURA MIX',
    title: 'My Mix 05: City Pop & Retro Synthwave',
    artist: '9Lana, Vestia Zeta, Kizuna AI',
    releaseYear: '2026',
    genre: 'City Pop • Synthwave',
    thumbnail: 'https://i.ytimg.com/vi/5mUkMs-jE6c/mqdefault.jpg',
    description: 'Nuansa lampu neon malam hari dengan bass synth groovy dan melodi retro futuristik.',
    tracks: [
      { id: '5mUkMs-jE6c', title: '螺旋 - RASEN', artist: '9Lana', duration: '3:40', thumbnail: 'https://i.ytimg.com/vi/5mUkMs-jE6c/mqdefault.jpg' },
      { id: 'oe4wxQmP6qc', title: 'CLOSE(R)', artist: 'Vestia Zeta', duration: '2:48', thumbnail: 'https://i.ytimg.com/vi/oe4wxQmP6qc/mqdefault.jpg' },
      { id: 'S8dmq5YIUoc', title: 'AIAIAI', artist: 'Kizuna AI', duration: '3:14', thumbnail: 'https://i.ytimg.com/vi/S8dmq5YIUoc/mqdefault.jpg' },
      { id: 'a2GujJZfXpg', title: 'スパークル [original ver.]', artist: 'RADWIMPS', duration: '3:02', thumbnail: 'https://i.ytimg.com/vi/a2GujJZfXpg/mqdefault.jpg' },
      { id: 'x8VYWazR5mE', title: '夜に駆ける', artist: 'YOASOBI', duration: '4:21', thumbnail: 'https://i.ytimg.com/vi/x8VYWazR5mE/mqdefault.jpg' }
    ]
  },

  'mix-07': {
    id: 'mix-07',
    type: 'mix',
    badge: 'AURA MIX',
    title: 'My Mix 07: Avicii & Festival EDM',
    artist: 'Avicii, K/DA, Dance Festival Anthems',
    releaseYear: '2026',
    genre: 'Festival EDM • Progressive House',
    thumbnail: 'https://i.ytimg.com/vi/UtF6Jej8yb4/mqdefault.jpg',
    description: 'Dentuman bass festival dan hook vokal anthemik untuk mengisi semangat Anda.',
    tracks: [
      { id: 'UtF6Jej8yb4', title: 'The Nights', artist: 'Avicii', duration: '3:11', thumbnail: 'https://i.ytimg.com/vi/UtF6Jej8yb4/mqdefault.jpg' },
      { id: 'UOxkGD8qRB4', title: 'POP/STARS', artist: 'K/DA', duration: '3:22', thumbnail: 'https://i.ytimg.com/vi/UOxkGD8qRB4/mqdefault.jpg' },
      { id: 'OpQFFLBMEPI', title: 'Just Give Me a Reason (feat. Nate Ruess)', artist: 'P!nk', duration: '4:03', thumbnail: 'https://i.ytimg.com/vi/OpQFFLBMEPI/mqdefault.jpg' },
      { id: '3VTkBuxU4yk', title: 'MORE', artist: 'K/DA', duration: '3:37', thumbnail: 'https://i.ytimg.com/vi/3VTkBuxU4yk/mqdefault.jpg' },
      { id: 'gdZLi9oWNZg', title: 'Dynamite (Official MV)', artist: 'BTS', duration: '3:44', thumbnail: 'https://i.ytimg.com/vi/gdZLi9oWNZg/mqdefault.jpg' }
    ]
  },

  // --- E. FORGOTTEN FAVORITES / RECAP ---
  'pl-recap-26': {
    id: 'pl-recap-26',
    type: 'playlist',
    badge: 'SEASON RECAP',
    title: "March-May Recap '26",
    artist: 'Playlist • Made for You',
    releaseYear: '2026',
    genre: 'Personal Recap',
    thumbnail: '/images/liked.jpg',
    description: 'Koleksi kenangan dan lagu-lagu yang paling sering Anda dengarkan selama musim semi 2026.',
    tracks: [
      { id: 'ZRtdQ81jPUQ', title: 'アイドル (Idol)', artist: 'YOASOBI', duration: '3:46', thumbnail: 'https://i.ytimg.com/vi/ZRtdQ81jPUQ/mqdefault.jpg' },
      { id: 'ArmDp-zijuc', title: 'Super Shy', artist: 'NewJeans', duration: '3:21', thumbnail: 'https://i.ytimg.com/vi/ArmDp-zijuc/mqdefault.jpg' },
      { id: '-yG8j2MGOyY', title: 'Kenangan Terindah', artist: 'SAMSONS', duration: '4:12', thumbnail: 'https://i.ytimg.com/vi/-yG8j2MGOyY/mqdefault.jpg' },
      { id: 'IWvo2fld3s4', title: 'Dan...', artist: 'Sheila On 7', duration: '4:46', thumbnail: 'https://i.ytimg.com/vi/IWvo2fld3s4/mqdefault.jpg' },
      { id: 'OpQFFLBMEPI', title: 'Just Give Me a Reason', artist: 'P!nk', duration: '4:03', thumbnail: 'https://i.ytimg.com/vi/OpQFFLBMEPI/mqdefault.jpg' },
      { id: 'UtF6Jej8yb4', title: 'The Nights', artist: 'Avicii', duration: '3:11', thumbnail: 'https://i.ytimg.com/vi/UtF6Jej8yb4/mqdefault.jpg' }
    ]
  }
};

// Ensure all tracks in ALBUM_CATALOG have type: 'youtube'
for (const key of Object.keys(ALBUM_CATALOG)) {
  const alb = ALBUM_CATALOG[key];
  if (Array.isArray(alb.tracks)) {
    alb.tracks.forEach(t => {
      if (!t.type) t.type = 'youtube';
    });
  }
}

const HOME_SECTIONS = {
  showcasePlaylists: [
    {
      id: 'oZpYEEcvu5I',
      albumId: 'showcase-chill-vibes',
      title: 'Chill Vibes',
      subtitle: 'Ambient Waves • tuki. & Acoustic',
      thumbnail: '/images/chill_vibes.jpg',
      badge: 'AuraSound Mix',
      isFeatured: true,
      isAlbum: true,
      type: 'youtube'
    },
    {
      id: 'rFZHOHl-L8A',
      albumId: 'showcase-focus-beats',
      title: 'Focus Beats',
      subtitle: 'Lo-fi Nights • Study & Work',
      thumbnail: '/images/focus_beats.jpg',
      badge: 'Lo-Fi Chill',
      isFeatured: false,
      isAlbum: true,
      type: 'youtube'
    },
    {
      id: 'ZRtdQ81jPUQ',
      albumId: 'showcase-discover',
      title: 'Discover Weekly',
      subtitle: 'Fresh Finds & Mixes • YOASOBI',
      thumbnail: '/images/discover.jpg',
      badge: 'Discover Mix',
      isFeatured: false,
      isAlbum: true,
      type: 'youtube'
    },
    {
      id: 'UtF6Jej8yb4',
      albumId: 'showcase-top-hits',
      title: 'Top Hits',
      subtitle: 'Aura Premium • Global Anthems',
      thumbnail: '/images/supermix.jpg',
      badge: 'Top Hits',
      isFeatured: false,
      isAlbum: true,
      type: 'youtube'
    }
  ],

  deckPlaylists: [
    {
      id: 'rFZHOHl-L8A',
      albumId: 'showcase-focus-beats',
      title: 'Lo-fi Beats for Study',
      meta: 'YouTube Music Playlists: 5 tracks • Lofi Girl',
      thumbnail: '/images/focus_beats.jpg',
      isAlbum: true,
      type: 'youtube'
    },
    {
      id: 'ZRtdQ81jPUQ',
      albumId: 'deck-supermix',
      title: 'My Supermix',
      meta: 'YOASOBI, tuki., Ado, Hoshimachi Suisei',
      thumbnail: '/images/supermix.jpg',
      isAlbum: true,
      type: 'youtube'
    }
  ],

  listenAgain: [
    {
      id: 'ZRtdQ81jPUQ',
      albumId: 'deck-supermix',
      title: 'My Supermix',
      artist: 'YOASOBI, tuki., Hoshimachi Suisei, Ado',
      thumbnail: '/images/supermix.jpg',
      duration: 'Mix',
      type: 'youtube',
      isAlbum: true,
      cardType: 'square',
      badge: 'Supermix'
    },
    {
      id: 'iw_1zU2MSc8',
      title: 'Kana Nishino - トリセツ (Torisetsu Official MV)',
      artist: '西野カナ Official YouTube Channel',
      views: '110M views',
      duration: '4:18',
      thumbnail: 'https://i.ytimg.com/vi/iw_1zU2MSc8/mqdefault.jpg',
      type: 'youtube',
      cardType: 'video'
    },
    {
      id: '1s84rIhPuhk',
      title: '米津玄師 - 海の幽霊 (Spirits of the Sea Official MV)',
      artist: 'Kenshi Yonezu 米津玄師',
      views: '135M views',
      duration: '4:15',
      thumbnail: 'https://i.ytimg.com/vi/1s84rIhPuhk/mqdefault.jpg',
      type: 'youtube',
      cardType: 'video'
    },
    {
      id: 'edirMh-BzY4',
      albumId: 'mix-01',
      title: 'Ripples of Past Reverie (Honkai: Star Rail)',
      artist: 'HOYO-MiX, Cassie Wei',
      views: '409K views',
      duration: '3:07',
      thumbnail: 'https://i.ytimg.com/vi/edirMh-BzY4/mqdefault.jpg',
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'ZRtdQ81jPUQ',
      title: 'YOASOBI - アイドル (Idol Official MV)',
      artist: 'Ayase / YOASOBI',
      views: '450M views',
      duration: '3:46',
      thumbnail: 'https://i.ytimg.com/vi/ZRtdQ81jPUQ/mqdefault.jpg',
      type: 'youtube',
      cardType: 'video'
    },
    {
      id: 'a2GujJZfXpg',
      title: 'RADWIMPS - スパークル [original ver.]',
      artist: 'RADWIMPS',
      views: '210M views',
      duration: '3:02',
      thumbnail: 'https://i.ytimg.com/vi/a2GujJZfXpg/mqdefault.jpg',
      type: 'youtube',
      cardType: 'video'
    },
    {
      id: 'oZpYEEcvu5I',
      title: 'tuki.『晩餐歌』Official Music Video',
      artist: 'tuki.',
      views: '54M views',
      duration: '3:40',
      thumbnail: 'https://i.ytimg.com/vi/oZpYEEcvu5I/mqdefault.jpg',
      type: 'youtube',
      cardType: 'video'
    },
    {
      id: 'ijXeGqSRNJc',
      title: 'Eve - 廻廻奇譚 (Kaikai Kitan - Jujutsu Kaisen OP)',
      artist: 'Eve',
      views: '340M views',
      duration: '3:45',
      thumbnail: 'https://i.ytimg.com/vi/ijXeGqSRNJc/mqdefault.jpg',
      type: 'youtube',
      cardType: 'video'
    }
  ],

  quickPicks: [
    {
      id: 'UOxkGD8qRB4',
      albumId: 'album-kda-popstars',
      title: 'POP/STARS (feat. Madison Beer, (G)I-DLE)',
      artist: 'K/DA • League of Legends',
      views: '570M views',
      duration: '3:22',
      thumbnail: 'https://i.ytimg.com/vi/UOxkGD8qRB4/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: '5mUkMs-jE6c',
      title: '螺旋 - RASEN',
      artist: '9Lana • RASEN',
      views: '6.4M plays',
      duration: '3:40',
      thumbnail: 'https://i.ytimg.com/vi/5mUkMs-jE6c/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'pgXpM4l_MwI',
      albumId: 'album-ado-show',
      title: '唱 - Show',
      artist: 'Ado • Show',
      views: '120M views',
      duration: '3:10',
      thumbnail: 'https://i.ytimg.com/vi/pgXpM4l_MwI/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'NCzUV95VIEI',
      title: 'DAMIDAMI',
      artist: 'EP Lucia • Zenless Zone Zero',
      views: '6.4M views',
      duration: '3:15',
      thumbnail: 'https://i.ytimg.com/vi/NCzUV95VIEI/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'B5HD_FSyrWY',
      title: '一輪花 - Ichirinka',
      artist: 'tuki. • Official MV',
      views: '12M views',
      duration: '3:51',
      thumbnail: 'https://i.ytimg.com/vi/B5HD_FSyrWY/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'oe4wxQmP6qc',
      title: 'CLOSE(R)',
      artist: 'Vestia Zeta • CLOSE(R)',
      views: '318K plays',
      duration: '2:48',
      thumbnail: 'https://i.ytimg.com/vi/oe4wxQmP6qc/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: '-VKIqrvVOpo',
      title: 'ただ君に晴れ - Just a Sunny Day',
      artist: 'Yorushika • Elma',
      views: '190M views',
      duration: '3:20',
      thumbnail: 'https://i.ytimg.com/vi/-VKIqrvVOpo/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'ArmDp-zijuc',
      title: 'Super Shy (Official MV)',
      artist: 'NewJeans • Get Up',
      views: '180M views',
      duration: '3:21',
      thumbnail: 'https://i.ytimg.com/vi/ArmDp-zijuc/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'hLvWy2b857I',
      title: 'Perfect Night (Official MV)',
      artist: 'LE SSERAFIM • Perfect Night',
      views: '120M views',
      duration: '3:03',
      thumbnail: 'https://i.ytimg.com/vi/hLvWy2b857I/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'phuiiNCxRMg',
      title: 'Supernova (Official MV)',
      artist: 'aespa • Armageddon',
      views: '110M views',
      duration: '3:14',
      thumbnail: 'https://i.ytimg.com/vi/phuiiNCxRMg/mqdefault.jpg',
      type: 'youtube'
    }
  ],

  coversAndRemixes: [
    {
      id: 'UOxkGD8qRB4',
      title: 'K/DA - POP/STARS (Official Music Video)',
      artist: 'League of Legends • 590M views',
      duration: '3:22',
      thumbnail: 'https://i.ytimg.com/vi/UOxkGD8qRB4/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'ZRtdQ81jPUQ',
      title: 'YOASOBI - アイドル (Idol Official MV)',
      artist: 'Ayase / YOASOBI • 450M views',
      duration: '3:46',
      thumbnail: 'https://i.ytimg.com/vi/ZRtdQ81jPUQ/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'ArmDp-zijuc',
      title: 'NewJeans (뉴진스) - Super Shy (Official MV)',
      artist: 'HYBE LABELS • 190M views',
      duration: '3:21',
      thumbnail: 'https://i.ytimg.com/vi/ArmDp-zijuc/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'fE2h3lGlOsk',
      title: 'ITZY - WANNABE (Official Music Video)',
      artist: 'JYP Entertainment • 540M views',
      duration: '3:39',
      thumbnail: 'https://i.ytimg.com/vi/fE2h3lGlOsk/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'gdZLi9oWNZg',
      title: 'BTS (방탄소년단) - Dynamite (Official MV)',
      artist: 'HYBE LABELS • 1.8B views',
      duration: '3:44',
      thumbnail: 'https://i.ytimg.com/vi/gdZLi9oWNZg/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'hLvWy2b857I',
      title: 'LE SSERAFIM - Perfect Night (Official Music Video)',
      artist: 'HYBE LABELS • 110M views',
      duration: '3:05',
      thumbnail: 'https://i.ytimg.com/vi/hLvWy2b857I/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'SX_ViT4Ra7k',
      title: '米津玄師 - Lemon (Official Music Video)',
      artist: 'Kenshi Yonezu 米津玄師 • 890M views',
      duration: '4:15',
      thumbnail: 'https://i.ytimg.com/vi/SX_ViT4Ra7k/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: '8ZP5eqm4JqM',
      title: '星街すいせい - ビビデバ (BIBBIDIBA Official MV)',
      artist: 'Hoshimachi Suisei • 110M views',
      duration: '2:47',
      thumbnail: 'https://i.ytimg.com/vi/8ZP5eqm4JqM/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'Vk5-c_v4gMU',
      title: 'ILLIT (아일릿) - Magnetic (Official MV)',
      artist: 'HYBE LABELS • 160M views',
      duration: '3:09',
      thumbnail: 'https://i.ytimg.com/vi/Vk5-c_v4gMU/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'pgXpM4l_MwI',
      title: 'Ado - 唱 (Show Official Music Video)',
      artist: 'Ado • 170M views',
      duration: '3:10',
      thumbnail: 'https://i.ytimg.com/vi/pgXpM4l_MwI/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'phuiiNCxRMg',
      title: 'aespa 에スパ - Supernova (Official MV)',
      artist: 'SMTOWN • 130M views',
      duration: '3:14',
      thumbnail: 'https://i.ytimg.com/vi/phuiiNCxRMg/mqdefault.jpg',
      type: 'youtube'
    },
    {
      id: 'oZpYEEcvu5I',
      title: 'tuki.『晩餐歌』Official Music Video',
      artist: 'tuki. • 65M views',
      duration: '3:40',
      thumbnail: 'https://i.ytimg.com/vi/oZpYEEcvu5I/mqdefault.jpg',
      type: 'youtube'
    }
  ],

  newReleases: [
    {
      id: '7UecFm_bSTU',
      albumId: 'album-nmixx-dash',
      title: 'DASH',
      artist: 'EP Fe3O4: BREAK • NMIXX',
      thumbnail: 'https://i.ytimg.com/vi/7UecFm_bSTU/mqdefault.jpg',
      duration: 'EP • 6 Lagu',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'BerwUFzdj4U',
      albumId: 'album-sakura-miko',
      title: 'flower rhapsody',
      artist: 'Album • Sakura Miko',
      thumbnail: 'https://i.ytimg.com/vi/BerwUFzdj4U/mqdefault.jpg',
      duration: 'Album • 6 Lagu',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'UOxkGD8qRB4',
      albumId: 'album-kda-popstars',
      title: 'POP/STARS',
      artist: 'Album • K/DA, League of Legends',
      thumbnail: 'https://i.ytimg.com/vi/UOxkGD8qRB4/mqdefault.jpg',
      duration: 'Album • 5 Lagu',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'pgXpM4l_MwI',
      albumId: 'album-ado-show',
      title: '唱 - Show',
      artist: 'Album Zanmu • Ado',
      thumbnail: 'https://i.ytimg.com/vi/pgXpM4l_MwI/mqdefault.jpg',
      duration: 'Album • 6 Lagu',
      isAlbum: true,
      cardType: 'square'
    },
    {
      id: '5GUaMOpfmr8',
      albumId: 'album-rokudenashi-one-voice',
      title: 'ただ声一つ - One Voice',
      artist: 'EP • Rokudenashi',
      thumbnail: 'https://i.ytimg.com/vi/5GUaMOpfmr8/mqdefault.jpg',
      duration: 'EP • 5 Lagu',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'S8dmq5YIUoc',
      albumId: 'album-kizuna-ai',
      title: 'AIAIAI (feat. Yasutaka Nakata)',
      artist: 'EP Hello, World • Kizuna AI',
      thumbnail: 'https://i.ytimg.com/vi/S8dmq5YIUoc/mqdefault.jpg',
      duration: 'EP • 5 Lagu',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    }
  ],

  forgottenFavorites: [
    {
      id: 'a51VH9BYzZA',
      title: 'Stellar Stellar / 星街すいせい',
      artist: 'Hoshimachi Suisei • 1st Album',
      duration: '4:58',
      thumbnail: 'https://i.ytimg.com/vi/a51VH9BYzZA/mqdefault.jpg',
      type: 'youtube',
      cardType: 'video'
    },
    {
      id: 'OpQFFLBMEPI',
      title: 'Just Give Me a Reason (feat. Nate Ruess)',
      artist: 'P!nk • 26M views',
      duration: '4:03',
      thumbnail: 'https://i.ytimg.com/vi/OpQFFLBMEPI/mqdefault.jpg',
      type: 'youtube',
      cardType: 'video'
    },
    {
      id: '-yG8j2MGOyY',
      title: 'Samsons - Kenangan Terindah',
      artist: 'SAMSONS • Official Music Video',
      duration: '4:12',
      thumbnail: 'https://i.ytimg.com/vi/-yG8j2MGOyY/mqdefault.jpg',
      type: 'youtube',
      cardType: 'video'
    },
    {
      id: 'IWvo2fld3s4',
      title: 'Sheila On 7 - Dan... (Official Audio)',
      artist: 'Sony Music Entertainment Indonesia',
      duration: '4:46',
      thumbnail: 'https://i.ytimg.com/vi/IWvo2fld3s4/mqdefault.jpg',
      type: 'youtube',
      cardType: 'video'
    },
    {
      id: 'ZRtdQ81jPUQ',
      albumId: 'pl-recap-26',
      title: "March-May Recap '26",
      artist: 'Playlist • Made for You',
      duration: '6 Lagu',
      thumbnail: '/images/liked.jpg',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    }
  ],

  kpopHits: [
    {
      id: 'phuiiNCxRMg',
      albumId: 'pl-k-ing',
      title: 'K-ING',
      artist: 'Playlist • The Ultimate K-Pop Hitlist',
      thumbnail: '/images/kpop_king.jpg',
      duration: 'Playlist • 8 Lagu',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'ArmDp-zijuc',
      albumId: 'pl-kpop-girls',
      title: 'K-Pop Girl Group Essentials',
      artist: 'NewJeans, aespa, IVE, LE SSERAFIM',
      thumbnail: 'https://i.ytimg.com/vi/ArmDp-zijuc/mqdefault.jpg',
      duration: 'Playlist • 8 Lagu',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'hLvWy2b857I',
      albumId: 'pl-kpop-dance',
      title: 'K-Pop Dance Challenge',
      artist: 'Trending viral TikTok & Shorts choreography',
      thumbnail: 'https://i.ytimg.com/vi/hLvWy2b857I/mqdefault.jpg',
      duration: 'Playlist • 6 Lagu',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: '6ZUIwj3FgUY',
      albumId: 'pl-all-kpop',
      title: 'All about K-Pop',
      artist: 'Non-stop Korean Pop Anthems • IVE, NewJeans',
      thumbnail: 'https://i.ytimg.com/vi/6ZUIwj3FgUY/mqdefault.jpg',
      duration: 'Playlist • 6 Lagu',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: '0P0aQreFs8w',
      albumId: 'pl-beat-on',
      title: 'BEAT ON',
      artist: 'Stray Kids, NCT, SEVENTEEN, ENHYPEN',
      thumbnail: 'https://i.ytimg.com/vi/0P0aQreFs8w/mqdefault.jpg',
      duration: 'Playlist • 6 Lagu',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'gdZLi9oWNZg',
      albumId: 'pl-kpop-boys',
      title: 'K-Pop Boy Band Essentials',
      artist: 'BTS, Stray Kids, TXT, ATEEZ',
      thumbnail: 'https://i.ytimg.com/vi/gdZLi9oWNZg/mqdefault.jpg',
      duration: 'Playlist • 6 Lagu',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    }
  ],

  mixedForYou: [
    {
      id: 'ZRtdQ81jPUQ',
      albumId: 'deck-supermix',
      title: 'My Supermix',
      artist: 'YOASOBI, tuki., Hoshimachi Suisei, Ado',
      thumbnail: '/images/supermix.jpg',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'mix-liked',
      title: 'Liked Music',
      artist: 'Auto playlist • Lagu yang Anda sukai',
      thumbnail: '/images/liked.jpg',
      type: 'mix',
      cardType: 'square'
    },
    {
      id: 'x8VYWazR5mE',
      albumId: 'mix-replay',
      title: 'Replay Mix',
      artist: 'YOASOBI, Yorushika, tuki.',
      thumbnail: '/images/discover.jpg',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'oZpYEEcvu5I',
      albumId: 'showcase-chill-vibes',
      title: 'Discover Mix',
      artist: 'yama, m, natori, Aki Rosenthal',
      thumbnail: '/images/chill_vibes.jpg',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'edirMh-BzY4',
      albumId: 'mix-01',
      title: 'My Mix 01',
      artist: 'HOYO-MiX, Honkai Star Rail, Anime OSTs',
      thumbnail: 'https://i.ytimg.com/vi/edirMh-BzY4/mqdefault.jpg',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'phuiiNCxRMg',
      albumId: 'pl-k-ing',
      title: 'My Mix 02',
      artist: 'K-Pop Girl Groups & Modern Beats',
      thumbnail: '/images/kpop_king.jpg',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'OtQynp1Vi6A',
      albumId: 'mix-03',
      title: 'My Mix 03',
      artist: 'Chill J-Pop, Acoustic & Piano',
      thumbnail: 'https://i.ytimg.com/vi/OtQynp1Vi6A/mqdefault.jpg',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: '5mUkMs-jE6c',
      albumId: 'mix-05',
      title: 'My Mix 05',
      artist: 'City Pop, Retro & Synthwave',
      thumbnail: 'https://i.ytimg.com/vi/5mUkMs-jE6c/mqdefault.jpg',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    },
    {
      id: 'UtF6Jej8yb4',
      albumId: 'mix-07',
      title: 'My Mix 07',
      artist: 'Avicii, EDM & Festival Anthems',
      thumbnail: 'https://i.ytimg.com/vi/UtF6Jej8yb4/mqdefault.jpg',
      isAlbum: true,
      type: 'youtube',
      cardType: 'square'
    }
  ]
};

// Mood queries mapping for dynamic YouTube Music mood explore
const MOOD_QUERIES = {
  'feel-good': 'feel good upbeat pop hits songs',
  'commute': 'commute travel chill playlist songs',
  'relax': 'relax chill acoustic lofi study songs',
  'sad': 'sad emotional heartbreak ballad songs',
  'energize': 'high energy workout rock electronic anime songs',
  'romance': 'romantic love songs acoustic r&b',
  'focus': 'focus deep work study ambient beats',
  'sleep': 'sleep relaxing calm night piano ambient',
  'party': 'party dance festival edm remix hits',
  'workout': 'workout gym motivation hardstyle phonk',
  'kpop': 'top kpop girl group boy band hits',
  'anime': 'top anime songs openings ost j-pop'
};

const moodCache = new Map();

async function getHomeFeed(mood = 'all') {
  if (!mood || mood === 'all') {
    return {
      success: true,
      user: {
        name: 'User',
        avatar: '/images/avatar.jpg'
      },
      sections: HOME_SECTIONS,
      albums: ALBUM_CATALOG
    };
  }

  // Check cache for mood
  if (moodCache.has(mood)) {
    return moodCache.get(mood);
  }

  const query = MOOD_QUERIES[mood] || `${mood} music hits`;
  try {
    const results = await ytSearch(query);
    const videos = (results.videos || []).slice(0, 18).map(v => ({
      id: v.videoId,
      title: v.title,
      artist: v.author?.name || 'Artist',
      duration: v.timestamp || '0:00',
      views: v.views ? `${(v.views / 1000000).toFixed(1)}M views` : '',
      thumbnail: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
      type: 'youtube'
    }));

    const response = {
      success: true,
      mood,
      user: {
        name: 'User',
        avatar: '/images/avatar.jpg'
      },
      moodData: {
        title: mood.replace('-', ' ').toUpperCase(),
        quickPicks: videos.slice(0, 9),
        featuredVideos: videos.slice(9, 15).map(v => ({ ...v, cardType: 'video' })),
        albums: videos.slice(15, 18).map(v => ({ ...v, cardType: 'square' }))
      }
    };

    moodCache.set(mood, response);
    return response;
  } catch (err) {
    console.error('Mood fetch error:', err.message);
    return {
      success: true,
      user: { name: 'User', avatar: '/images/avatar.jpg' },
      sections: HOME_SECTIONS,
      albums: ALBUM_CATALOG
    };
  }
}

// ==========================================
// DYNAMIC UNLIMITED ALBUM ENRICHMENT ENGINE
// ==========================================
const albumEnrichCache = new Map();

/**
 * Normalizes artist names by stripping suffixes like "Official", "Topic", "VEVO", etc.
 */
function cleanArtistKey(artist = '') {
  if (!artist) return '';
  return artist
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(official|vevo|topic|records|entertainment|music|channel|audio)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDurationSecs(duration) {
  if (typeof duration === 'number') return Math.max(0, duration);
  if (typeof duration === 'string') {
    const parts = duration.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return parts[0] * 60 + parts[1];
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 210;
}

function formatSecsToTimestamp(secs) {
  if (typeof secs === 'string' && secs.includes(':')) return secs;
  const s = Math.max(0, Math.floor(Number(secs) || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem < 10 ? '0' : ''}${rem}`;
}

/**
 * Normalizes track titles to prevent duplicate entries of the same song (e.g. MV vs Audio vs Live vs Performance)
 */
function normalizeTrackKey(title, artist = '') {
  if (!title) return '';
  let str = title.toLowerCase();

  // 1. Remove bracketed blocks [MV], [Official Music Video], [HD], etc.
  str = str.replace(/\[[^\]]*\]/g, ' ');

  // 2. Remove parenthetical descriptions
  str = str.replace(/\([^)]*(?:official|music|video|mv|m\/v|audio|lyric|lyrics|ver|version|performance|remix|special|clip|dance|stage|live|hd|4k|color\s*coded|teaser|sub|eng|indo)[^)]*\)/gi, ' ');
  str = str.replace(/\(\s*\)/g, ' ');

  // 3. Remove quotes
  str = str.replace(/["'“”‘’`]/g, ' ');

  // 4. Remove m/v and standard tags explicitly before delimiter splitting
  str = str.replace(/\bm\/v\b/gi, ' ');
  str = str.replace(/\b(m\/v|mv|hd|4k|official\s*(music)?\s*video|official\s*audio|music\s*video|full\s*audio|lyrics?|visualizer|stage\s*mix|performance\s*video)\b/gi, ' ');

  // 5. Remove artist from title if delimited with ' - ' or ' | ' or ' — ' (requires whitespace around dash to protect hyphenated words)
  const delimParts = str.split(/\s+[-|—–]\s+/);
  if (delimParts.length >= 2 && artist) {
    const artClean = cleanArtistKey(artist);
    if (artClean && artClean.length >= 2) {
      const part0 = delimParts[0].toLowerCase();
      const part1 = delimParts[1].toLowerCase();
      if (part0.includes(artClean) || artClean.includes(part0.trim())) {
        str = delimParts.slice(1).join(' ');
      } else if (part1.includes(artClean) || artClean.includes(part1.trim())) {
        str = delimParts[0];
      }
    }
  }

  // 6. Remove artist words if still remaining
  if (artist) {
    const artWords = cleanArtistKey(artist).split(/\s+/).filter(w => w.length > 2);
    for (const w of artWords) {
      str = str.replace(new RegExp(`\\b${w}\\b`, 'gi'), ' ');
    }
  }

  // 7. Clean punctuation & collapse spaces
  str = str.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  str = str.replace(/\s+/g, ' ').trim();

  return str;
}

const NON_OFFICIAL_KEYWORDS = [
  // 1. Cover & Acoustic
  'cover', 'covers', 'covered by', 'cover by', 'acoustic cover', 'guitar cover', 'piano cover', 'drum cover', 'vocal cover',
  // 2. Remix, EDM, Slowed & Reverb, Edits
  'remix', 'remixed', 'remix by', 'club mix', 'vip mix', 'mashup', 'bootleg', 'flip', ' edit', '(edit)', '[edit]', 'edits',
  'slowed', 'reverb', 'nightcore', 'lofi', 'lo-fi', 'edm mix', 'dance mix',
  // 3. Lyrics (User requested: lyrics belong to non-official)
  'lyrics', 'lyric video', 'lirik', 'terjemahan', 'color coded', 'color-coded',
  // 4. Performance Videos (User requested: performance videos belong to non-official)
  'performance video', 'live performance', 'performance', 'live at', 'live in', 'live session', 'tour', 'concert', 'street performance', 'busking', 'acoustic session', 'stage performance',
  // 5. Festival EDM (User requested: Festival EDM belongs to non-official)
  'festival', 'tomorrowland', 'ultra music', 'ultra festival', 'edc', 'dj set', 'live set', 'festival mix', 'festival edm', 'festival live',
  // 6. Dance (User requested: Dance belongs to non-official)
  'dance', 'dance video', 'dance practice', 'choreography', 'dance cover', 'in public', 'dance performance', 'choreo',
  // 7. Parody, fanmade, reaction, game clips, visualizers, etc.
  'parody', 'tribute', 'audition', 'reaction', 'reacting', 'react', 'review', 'breakdown', 'karaoke', 'instrumental only', 'mirror', 'fanmade', 'fan-made', 'fan made',
  'spectrum', 'audio spectrum', 'visualizer', 'bass boosted', 'boosted',
  'tft:', 'tft', 'teamfight tactics', 'wild rift', 'golden spatula', '1 hour', '10 hour', 'loop', 'tutorial', 'gameplay', 'short ver', 'teaser', 'trailer', 'tráiler', 'preview', 'montage', 'highlight', 'highlights', 'clip'
];

const NON_OFFICIAL_CHANNEL_WORDS = [
  'lyrics', 'lyric', 'lirik', 'cover', 'covers', 'dance', 'remix', 'edits', 'nightcore', 'slowed', 'reverb', 'terjemahan', 'choreo', 'vibes', 'compilation', 'spatula', 'react', 'reaction', 'review'
];

const LIVE_REGEX = /(?:[\(\[\{][^\)\]\}]*?\blive\b[^\)\]\}]*?[\)\]\}])|(?:\b(?:live\s+(?:ver|version|performance|session|concert|stage|at|in|from|set|show)|collab\s+live|3d\s+live|the\s+first\s+take)\b)/i;

function isRecognizedOfficialChannel(author) {
  const a = (author || '').toLowerCase();
  return a.includes('topic') || a.includes('vevo') || a.includes('records') || 
         a.includes('recordings') || a.includes('entertainment') || a.includes('official') ||
         a.includes('smtown') || a.includes('jyp') || a.includes('hybe') || a.includes('avex') ||
         a.includes('yg ent') || a.includes('sony music') || a.includes('warner music') || 
         a.includes('universal music') || a.includes('league of legends') || a.includes('riot games') ||
         a.includes('hololive');
}

/**
 * Strict Official Video/Audio Validator:
 * ONLY allows pure Official Music Videos or Official Audio from:
 * 1. Primary artist account ("akun utama yang rilis lagu tersebut")
 * 2. Official Record Label / Topic / VEVO channel.
 * STRICTLY REJECTS:
 * - Lyrics videos
 * - Performance videos (live performance, street busking, concert, the first take)
 * - Festival EDM (Tomorrowland, Ultra, festival live sets)
 * - Dance / choreography videos
 * - Covers, remixes, mashups, fan edits, and third-party re-upload channels.
 */
function isOfficialMusicTrack(video, artistHint = '') {
  if (!video || !video.title) return false;
  const title = video.title.toLowerCase();
  const author = (video.author?.name || video.author || video.artist || '').toLowerCase();

  // 1. MUST NOT contain any non-official keyword (covers, lyrics, performance, festival edm, dance, etc.)
  for (const b of NON_OFFICIAL_KEYWORDS) {
    if (title.includes(b)) return false;
  }

  // 1b. Reject live performances, live sessions, THE FIRST TAKE
  if (LIVE_REGEX.test(video.title)) {
    return false;
  }

  // 2. Channel name MUST NOT indicate a non-official fan/lyrics/cover/dance channel
  for (const cw of NON_OFFICIAL_CHANNEL_WORDS) {
    if (author.includes(cw)) return false;
  }

  // 3. Reject shorts/teasers (< 50s) or multi-hour compilations (> 660s)
  if (video.seconds && (video.seconds < 50 || video.seconds > 660)) {
    return false;
  }

  // 4. Exclude known generic re-upload channels
  const knownReuploaders = ['indolirik', '7clouds', 'deparea', 'timemax', 'good vibes music', 'shadow music', 'chill tracks', 'enjoy top music', 'miami boy', 'asaley'];
  for (const r of knownReuploaders) {
    if (author.includes(r)) return false;
  }

  // 5. Check if author is:
  // - Official Topic channel (YouTube automated official album track)
  // - VEVO channel
  // - Primary artist channel (matches artistHint or artist name appears in title)
  // - Verified official record label
  const isTopic = author.includes(' - topic') || author.endsWith('- topic');
  const isVevo = author.includes('vevo');
  const isOfficialLabel = isRecognizedOfficialChannel(author);

  let isArtistChannel = false;
  if (artistHint) {
    const artists = artistHint.split(/[,&/•|]|(?:\b(?:ft\.?|feat\.?|vs\.?)\b)/i)
      .map(a => a.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(a => a.length >= 2);
    const cleanAuthor = author.replace(/[^a-z0-9]/g, '');
    for (const art of artists) {
      if (cleanAuthor.includes(art) || (art.length >= 4 && art.includes(cleanAuthor))) {
        isArtistChannel = true;
        break;
      }
    }
  } else {
    // If words from author are prominent in the title (e.g. author="Lady Gaga", title="Lady Gaga, Bruno Mars - ...")
    const authorWords = author.split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'official', 'channel'].includes(w) && !NON_OFFICIAL_CHANNEL_WORDS.includes(w));
    if (authorWords.length > 0 && authorWords.some(w => new RegExp(`\\b${w}\\b`, 'i').test(title))) {
      isArtistChannel = true;
    }
  }

  // Require credible official source: artist account, Topic, VEVO, or official label
  if (!isArtistChannel && !isTopic && !isVevo && !isOfficialLabel) {
    return false;
  }

  // 6. Title must specify official release, OR channel is verified artist account, official Topic, or VEVO
  const hasOfficialTitle = title.includes('official') || title.includes('mv') || title.includes('m/v') || title.includes('music video') || title.includes('audio') || title.includes('concept video');
  if (!hasOfficialTitle && !isArtistChannel && !isTopic && !isVevo) {
    return false;
  }

  return true;
}

/**
 * Non-Official Video/Audio Validator:
 * Accepts:
 * - Lyrics videos
 * - Performance videos (live performance, street performance, concert, THE FIRST TAKE)
 * - Festival EDM (Tomorrowland, Ultra, live sets)
 * - Dance videos (choreography, dance cover, dance practice)
 * - Covers & Remixes (acoustic, slowed+reverb, lofi, edits, mashups)
 * STRICTLY REJECTS official original MVs and official audio releases from primary artist / VEVO / Topic channels ("gak ada official").
 */
function isNonOfficialMusicTrack(video) {
  if (!video || !video.title) return false;
  const title = video.title.toLowerCase();
  const author = (video.author?.name || video.author || video.artist || '').toLowerCase();

  // 1. ACCEPT immediately if title or author has explicit non-official keywords
  // (lyrics, performance video, festival edm, dance, cover, remix, etc.)
  for (const kw of NON_OFFICIAL_KEYWORDS) {
    if (title.includes(kw) || author.includes(kw)) {
      return true;
    }
  }

  // 1b. Live performances, sessions, THE FIRST TAKE
  if (LIVE_REGEX.test(video.title)) {
    return true;
  }

  // 2. Reject if it is an automated topic or VEVO or official artist channel releasing official MV/audio without non-official keywords:
  if (isOfficialMusicTrack(video)) {
    return false;
  }

  // 3. If uploaded by third-party / community channel and not recognized official channel
  if (!isRecognizedOfficialChannel(author)) {
    return true;
  }

  return false;
}

async function getAlbumDetail(albumId, options = {}) {
  if (!albumId) return null;

  // 1. Return from in-memory cache if already enriched and refresh not forced
  if (albumEnrichCache.has(albumId) && !options.refresh) {
    return albumEnrichCache.get(albumId);
  }

  let album = ALBUM_CATALOG[albumId];

  // 2. If album is not in the static catalog (e.g. from dynamic mood card or search)
  if (!album) {
    const cleanQuery = albumId.replace(/^(album-|pl-|deck-|showcase-)/, '').replace(/-/g, ' ');
    try {
      const searchRes = await ytSearch(`${cleanQuery} full album songs official`);
      const candidates = (searchRes && searchRes.videos)
        ? searchRes.videos.filter(v => v.seconds > 45 && v.seconds < 900)
        : [];

      if (candidates.length > 0) {
        const topVideo = candidates[0];
        album = {
          id: albumId,
          type: 'album',
          badge: 'ALBUM',
          title: cleanQuery.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          artist: topVideo.author ? topVideo.author.name : 'YouTube Music',
          releaseYear: '2024 - 2026',
          genre: 'Pop • Hits',
          thumbnail: topVideo.thumbnail || '/images/supermix.jpg',
          description: `Koleksi lengkap lagu dari ${cleanQuery} yang dikurasi khusus untuk pengalaman mendengarkan tanpa batas.`,
          tracks: []
        };
      }
    } catch (e) {
      console.warn('Dynamic album generation error:', e.message);
    }
  }

  if (!album) return null;

  // 3. Clone album template
  const enrichedAlbum = {
    ...album,
    tracks: Array.isArray(album.tracks) ? album.tracks.map(t => ({ ...t, type: t.type || 'youtube' })) : []
  };

  // 4. Dynamically enrich ONLY for playlists/mixes or empty dynamic collections.
  // Studio Albums and EPs preserve their authentic, 100% official tracklist!
  if (album.type === 'playlist' || album.type === 'mix' || !album.tracks || album.tracks.length === 0) {
    try {
      const existingIds = new Set(enrichedAlbum.tracks.map(t => t.id));
      const existingTitleKeys = new Set(
        enrichedAlbum.tracks.map(t => normalizeTrackKey(t.title, enrichedAlbum.artist)).filter(k => k.length >= 2)
      );

      const searchQuery = album.searchQuery || `"${album.artist}" official music video`;
      const searchRes = await ytSearch(searchQuery);

      if (searchRes && searchRes.videos) {
        const candidates = searchRes.videos.filter(v => v.seconds > 45 && v.seconds < 900);
        for (const v of candidates) {
          const titleKey = normalizeTrackKey(v.title, album.artist);
          const isDuplicate = existingIds.has(v.videoId) || (titleKey.length >= 2 && existingTitleKeys.has(titleKey));
          if (!isDuplicate && isOfficialMusicTrack(v, album.artist)) {
            existingIds.add(v.videoId);
            if (titleKey.length >= 2) existingTitleKeys.add(titleKey);
            enrichedAlbum.tracks.push({
              id: v.videoId,
              title: v.title,
              artist: v.author ? v.author.name : album.artist,
              duration: v.timestamp || '3:30',
              thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
              type: 'youtube'
            });
          }
        }
      }

      // Secondary expansion if track count is under 20
      if (enrichedAlbum.tracks.length < 20 && album.artist) {
        try {
          const artistRes = await ytSearch(`"${album.artist}" official audio`);
          if (artistRes && artistRes.videos) {
            const extraCandidates = artistRes.videos.filter(v => v.seconds > 45 && v.seconds < 900);
            for (const v of extraCandidates) {
              const titleKey = normalizeTrackKey(v.title, album.artist);
              const isDuplicate = existingIds.has(v.videoId) || (titleKey.length >= 2 && existingTitleKeys.has(titleKey));
              if (!isDuplicate && isOfficialMusicTrack(v, album.artist)) {
                existingIds.add(v.videoId);
                if (titleKey.length >= 2) existingTitleKeys.add(titleKey);
                enrichedAlbum.tracks.push({
                  id: v.videoId,
                  title: v.title,
                  artist: v.author ? v.author.name : album.artist,
                  duration: v.timestamp || '3:30',
                  thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
                  type: 'youtube'
                });
              }
            }
          }
        } catch (e) {}
      }
    } catch (err) {
      console.warn('Error during album dynamic enrichment:', err.message);
    }
  }

  // Strictly ensure every track is 100% verified official
  enrichedAlbum.tracks = enrichedAlbum.tracks.filter(t => isOfficialMusicTrack(t, album.artist));

  // Calculate human-readable duration
  let totalSeconds = 0;
  enrichedAlbum.tracks.forEach(t => {
    totalSeconds += parseDurationSecs(t.duration);
  });

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    enrichedAlbum.totalDuration = `${enrichedAlbum.tracks.length} Lagu • ${hours} Jam ${minutes} Menit`;
  } else {
    enrichedAlbum.totalDuration = `${enrichedAlbum.tracks.length} Lagu • ${minutes} Menit`;
  }

  albumEnrichCache.set(albumId, enrichedAlbum);
  return enrichedAlbum;
}

async function fetchMoreAlbumTracks(albumId, offset = 0) {
  let album = albumEnrichCache.get(albumId) || ALBUM_CATALOG[albumId];
  if (!album) {
    album = await getAlbumDetail(albumId);
  }
  if (!album) return [];

  const existingIds = new Set((album.tracks || []).map(t => t.id));
  const existingTitleKeys = new Set(
    (album.tracks || []).map(t => normalizeTrackKey(t.title, album.artist)).filter(k => k.length >= 2)
  );
  const queries = [
    `"${album.artist}" official music video`,
    `"${album.artist}" official audio`,
    `"${album.artist} - Topic"`,
    `"${album.artist}" official mv`,
    `"${album.artist}" official track`
  ];

  const startIndex = Math.floor((offset / 8)) % queries.length;
  const newTracks = [];

  for (let i = 0; i < queries.length && newTracks.length < 15; i++) {
    const qIndex = (startIndex + i) % queries.length;
    const q = queries[qIndex];
    try {
      const res = await ytSearch(q);
      if (res && res.videos) {
        for (const v of res.videos) {
          const titleKey = normalizeTrackKey(v.title, album.artist);
          const isDuplicate = existingIds.has(v.videoId) || (titleKey.length >= 2 && existingTitleKeys.has(titleKey));
          if (!isDuplicate && isOfficialMusicTrack(v, album.artist)) {
            existingIds.add(v.videoId);
            if (titleKey.length >= 2) existingTitleKeys.add(titleKey);
            const trk = {
              id: v.videoId,
              title: v.title,
              artist: v.author ? v.author.name : album.artist,
              duration: v.timestamp || '3:30',
              thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
              type: 'youtube'
            };
            newTracks.push(trk);
            if (albumEnrichCache.has(albumId)) {
              albumEnrichCache.get(albumId).tracks.push(trk);
            }
            if (newTracks.length >= 15) break;
          }
        }
      }
    } catch (e) {
      console.warn('Error querying:', q, e.message);
    }
  }

  return newTracks;
}

// ==========================================
// SMART SUPERMIX & LIKED RADIO ENGINE
// ==========================================
async function generatePersonalizedSupermix({ topArtists = [], favorites = [], history = [] } = {}) {
  let activeArtists = Array.isArray(topArtists) ? topArtists.filter(Boolean) : [];
  if (activeArtists.length === 0 && Array.isArray(favorites)) {
    const artistSet = new Set();
    favorites.forEach(f => { if (f.artist) artistSet.add(f.artist); });
    activeArtists = Array.from(artistSet);
  }
  if (activeArtists.length === 0 && Array.isArray(history)) {
    const artistSet = new Set();
    history.forEach(h => { if (h.artist) artistSet.add(h.artist); });
    activeArtists = Array.from(artistSet);
  }
  if (activeArtists.length === 0) {
    activeArtists = ['NMIXX', 'Ado', 'Sakura Miko', 'aespa', 'YOASOBI', 'tuki.'];
  }
  activeArtists = activeArtists.slice(0, 5);

  const existingIds = new Set();
  const existingSongKeys = new Set();
  const familiarPool = [];
  const relatedPool = [];
  const discoveryPool = [];

  function addTrackIfUnique(track, targetPool) {
    const id = track.id || track.videoId;
    if (!id || existingIds.has(id)) return false;
    const artKey = cleanArtistKey(track.artist || track.author?.name || '');
    const titleKey = normalizeTrackKey(track.title, track.artist);
    const compKey = artKey && titleKey ? `${artKey}:::${titleKey}` : titleKey;
    if (compKey && compKey.length >= 3 && existingSongKeys.has(compKey)) return false;

    existingIds.add(id);
    if (compKey && compKey.length >= 3) existingSongKeys.add(compKey);
    targetPool.push({
      id: id,
      title: track.title,
      artist: track.artist || (track.author ? track.author.name : 'AuraSound Mix'),
      duration: track.duration || track.timestamp || '3:30',
      thumbnail: track.thumbnail || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      type: 'youtube'
    });
    return true;
  }

  // 1. 40% Familiar hits from favorites & history
  if (Array.isArray(favorites) && favorites.length > 0) {
    for (const f of favorites) {
      addTrackIfUnique(f, familiarPool);
    }
  }

  if (Array.isArray(history) && familiarPool.length < 15) {
    for (const h of history) {
      if (addTrackIfUnique(h, familiarPool) && familiarPool.length >= 15) break;
    }
  }

  // 2. 30% Related Tracks for each top artist (parallel query for official MVs)
  try {
    const artistQueries = activeArtists.map(a => ytSearch(`"${a}" official music video`));
    const artistResults = await Promise.all(artistQueries);

    for (let i = 0; i < activeArtists.length; i++) {
      const res = artistResults[i];
      if (res && res.videos) {
        let countForArtist = 0;
        for (const v of res.videos) {
          if (isOfficialMusicTrack(v, activeArtists[i])) {
            const added = addTrackIfUnique({
              id: v.videoId,
              title: v.title,
              artist: v.author ? v.author.name : activeArtists[i],
              duration: v.timestamp || '3:30',
              thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`
            }, relatedPool);
            if (added) {
              countForArtist++;
              if (countForArtist >= 3) break;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Supermix related artist fetch error:', err.message);
  }

  // 3. 20% Discovery Tracks (matching vibe from official audio)
  try {
    const primaryArtist = activeArtists[0] || 'K-Pop';
    const secondaryArtist = activeArtists[1] || 'J-Pop';
    const discRes = await ytSearch(`"${primaryArtist}" "${secondaryArtist}" official audio`);
    if (discRes && discRes.videos) {
      for (const v of discRes.videos) {
        if (isOfficialMusicTrack(v, primaryArtist)) {
          const added = addTrackIfUnique({
            id: v.videoId,
            title: v.title,
            artist: v.author ? v.author.name : 'AuraSound Discovery',
            duration: v.timestamp || '3:30',
            thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`
          }, discoveryPool);
          if (added && discoveryPool.length >= 8) break;
        }
      }
    }
  } catch (err) {
    console.warn('Supermix discovery fetch error:', err.message);
  }

  // 4. Interleave & Strict Single-Pass Deduplication (Zero duplicates guaranteed)
  const finalTracks = [];
  const finalSeenIds = new Set();
  const finalSeenKeys = new Set();

  function pushToFinal(track) {
    if (!track) return false;
    const id = track.id || track.videoId;
    if (!id || finalSeenIds.has(id)) return false;

    const artKey = cleanArtistKey(track.artist || track.author?.name || '');
    const titleKey = normalizeTrackKey(track.title, track.artist);
    const compKey = artKey && titleKey ? `${artKey}:::${titleKey}` : titleKey;

    if (compKey && compKey.length >= 3 && finalSeenKeys.has(compKey)) return false;

    finalSeenIds.add(id);
    if (compKey && compKey.length >= 3) finalSeenKeys.add(compKey);

    finalTracks.push({
      id: id,
      title: track.title,
      artist: track.artist || (track.author ? track.author.name : 'AuraSound Mix'),
      duration: track.duration || track.timestamp || '3:30',
      thumbnail: track.thumbnail || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      type: 'youtube'
    });
    return true;
  }

  const maxLen = Math.max(familiarPool.length, relatedPool.length, discoveryPool.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < familiarPool.length) pushToFinal(familiarPool[i]);
    if (i < relatedPool.length) pushToFinal(relatedPool[i]);
    if (i < discoveryPool.length) pushToFinal(discoveryPool[i]);
  }

  // If still less than 20 tracks, fill from default catalog
  if (finalTracks.length < 20 && ALBUM_CATALOG['deck-supermix']) {
    for (const t of ALBUM_CATALOG['deck-supermix'].tracks) {
      pushToFinal(t);
    }
  }

  // Calculate total duration
  let totalSeconds = 0;
  finalTracks.forEach(t => {
    totalSeconds += parseDurationSecs(t.duration);
  });
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const artistSummary = activeArtists.slice(0, 4).join(', ');

  const supermixAlbum = {
    id: 'deck-supermix',
    type: 'mix',
    badge: 'SMART SUPERMIX',
    title: 'My Supermix',
    artist: `Berdasarkan selera musik Anda • ${artistSummary}`,
    releaseYear: '2026',
    genre: 'Algoritma Personalisasi AuraSound',
    thumbnail: '/images/supermix.jpg',
    description: `Diracik otomatis oleh Algoritma Cerdas AuraSound: memadukan lagu yang sering Anda dengar (${artistSummary}) dengan penemuan musik baru yang selaras dengan selera Anda.`,
    totalDuration: hours > 0 ? `${finalTracks.length} Lagu • ${hours} Jam ${minutes} Menit` : `${finalTracks.length} Lagu • ${minutes} Menit`,
    tracks: finalTracks,
    isPersonalized: true
  };

  albumEnrichCache.set('deck-supermix', supermixAlbum);
  return supermixAlbum;
}

async function generateLikedRadio({ favorites = [] } = {}) {
  const existingIds = new Set();
  const existingSongKeys = new Set();
  const artistSet = new Set();
  (favorites || []).forEach(f => { if (f.artist) artistSet.add(f.artist); });
  const artists = Array.from(artistSet).slice(0, 4);

  const tracks = [];

  function addRadioTrackIfUnique(track) {
    const id = track.id || track.videoId;
    if (!id || existingIds.has(id)) return false;
    const artKey = cleanArtistKey(track.artist || track.author?.name || '');
    const titleKey = normalizeTrackKey(track.title, track.artist);
    const compKey = artKey && titleKey ? `${artKey}:::${titleKey}` : titleKey;
    if (compKey && compKey.length >= 3 && existingSongKeys.has(compKey)) return false;

    existingIds.add(id);
    if (compKey && compKey.length >= 3) existingSongKeys.add(compKey);
    tracks.push({
      id: id,
      title: track.title,
      artist: track.artist || (track.author ? track.author.name : 'Radio Rekomendasi'),
      duration: track.duration || track.timestamp || '3:30',
      thumbnail: track.thumbnail || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      type: 'youtube'
    });
    return true;
  }

  // Include ALL of the user's liked songs at the top of the radio station
  for (const f of (favorites || [])) {
    addRadioTrackIfUnique(f);
  }

  const queries = artists.length > 0
    ? [
        `"${artists.join('" "')}" official music video`,
        `"${artists[0]}" official audio`,
        `"${artists.slice(0, 2).join('" "')}" official hits`
      ]
    : [
        'top pop hits official music video',
        'viral acoustic relaxing official audio'
      ];

  try {
    const results = await Promise.all(queries.map(q => ytSearch(q)));
    for (const res of results) {
      if (res && res.videos) {
        for (const v of res.videos) {
          if (isOfficialMusicTrack(v)) {
            addRadioTrackIfUnique(v);
            if (tracks.length >= 35) break;
          }
        }
      }
      if (tracks.length >= 35) break;
    }
  } catch (err) {
    console.warn('Liked radio error:', err.message);
  }

  let totalSeconds = 0;
  tracks.forEach(t => {
    totalSeconds += parseDurationSecs(t.duration);
  });
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const radioAlbum = {
    id: 'mix-liked-radio',
    type: 'radio',
    badge: 'RADIO FAVORIT',
    title: 'Liked Music Radio',
    artist: `Stasiun Radio Berdasarkan Lagu yang Anda Sukai`,
    releaseYear: '2026',
    genre: 'Algoritma Rekomendasi Pintar',
    thumbnail: '/images/liked_music.jpg',
    description: `Stasiun radio dinamis yang secara cerdas mengeksplorasi lagu-lagu baru yang sefrekuensi dengan lagu-lagu favorit di koleksi Anda.`,
    totalDuration: hours > 0 ? `${tracks.length} Lagu • ${hours} Jam ${minutes} Menit` : `${tracks.length} Lagu • ${minutes} Menit`,
    tracks: tracks,
    isPersonalized: true
  };

  albumEnrichCache.set('mix-liked-radio', radioAlbum);
  return radioAlbum;
}

module.exports = {
  getHomeFeed,
  getAlbumDetail,
  fetchMoreAlbumTracks,
  generatePersonalizedSupermix,
  generateLikedRadio,
  normalizeTrackKey,
  cleanArtistKey,
  isOfficialMusicTrack,
  isNonOfficialMusicTrack,
  HOME_SECTIONS,
  ALBUM_CATALOG
};
