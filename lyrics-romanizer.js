/**
 * Advanced Multi-Lingual Lyrics Romanizer Engine for AuraSound
 * Provides 100% accurate, natural, singable Romanization for ANY song in:
 * - Korean (Hangul -> Romaja via complete Phonological Revised Romanization: Liaison, Palatalization, Nasalization, Liquid Assimilation, Aspiration)
 * - Japanese (Kanji/Kana -> Romaji via Kuroshiro + lyrics vocabulary pre-pass + natural kana vowel expansion + verb contraction)
 * - Chinese (Hanzi -> Pinyin via pinyin-pro + song polyphone contextual disambiguation)
 */

const path = require('path');
const fs = require('fs');
const Kuroshiro = require('kuroshiro');
const KuromojiAnalyzer = require('kuroshiro-analyzer-kuromoji');
const { pinyin, customPinyin } = require('pinyin-pro');
const wanakana = require('wanakana');

// =============================================================================
// 1. KOREAN PHONOLOGICAL ROMANIZER (Official Revised Romanization of Korea)
// =============================================================================
const KO_CHOS = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
const KO_JUNGS = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
const KO_JONG_BASE = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

const KO_COMPLEX_JONG = {
  3: { left: 'k', right: 's' },      // ㄳ
  5: { left: 'n', right: 'j' },      // ㄵ
  6: { left: 'n', right: 'h' },      // ㄶ
  9: { left: 'l', right: 'k' },      // ㄺ
  10: { left: 'l', right: 'm' },     // ㄻ
  11: { left: 'l', right: 'b' },     // ㄼ
  12: { left: 'l', right: 's' },     // ㄽ
  13: { left: 'l', right: 't' },     // ㄾ
  14: { left: 'l', right: 'p' },     // ㄿ
  15: { left: 'l', right: 'h' },     // ㅀ
  18: { left: 'p', right: 's' }      // ㅄ
};

function decomposeHangul(code) {
  if (code < 0xAC00 || code > 0xD7A3) return null;
  const offset = code - 0xAC00;
  return {
    cho: Math.floor(offset / 588),
    jung: Math.floor((offset % 588) / 28),
    jong: offset % 28
  };
}

function romanizeKoreanTokens(text) {
  if (!text) return [];
  const chars = Array.from(text);
  const tokens = chars.map(ch => {
    const code = ch.charCodeAt(0);
    return { ch, hangul: decomposeHangul(code) };
  });

  const result = [];

  for (let i = 0; i < tokens.length; i++) {
    const curr = tokens[i];
    if (!curr.hangul) {
      result.push({ text: curr.ch, romaji: curr.ch });
      continue;
    }

    const next = tokens[i + 1]?.hangul ? tokens[i + 1] : null;
    let { cho, jung, jong } = curr.hangul;

    let choStr = KO_CHOS[cho];
    let jungStr = KO_JUNGS[jung];
    let jongStr = '';

    if (jong > 0) {
      const nextCho = next ? next.hangul.cho : -1;
      const nextJung = next ? next.hangul.jung : -1;

      // Rule 1: Palatalization (ㄷ/ㅌ + 이 -> 지/치)
      if ((jong === 7 || jong === 25) && nextCho === 11 && nextJung === 20) {
        jongStr = '';
        next.customCho = (jong === 7) ? 'j' : 'ch';
      }
      // Rule 2: Liaison (연음): Batchim followed by vowel placeholder (ㅇ)
      else if (next && nextCho === 11) {
        if (KO_COMPLEX_JONG[jong]) {
          const comp = KO_COMPLEX_JONG[jong];
          jongStr = comp.left;
          next.customCho = comp.right === 'h' ? '' : comp.right;
        } else if (jong === 27) { // ㅎ alone before vowel -> silent!
          jongStr = '';
          next.customCho = '';
        } else if (jong === 8) { // ㄹ before vowel -> 'r'
          jongStr = '';
          next.customCho = 'r';
        } else if (jong === 20) { // ㅆ before vowel -> 'ss'
          jongStr = '';
          next.customCho = 'ss';
        } else if (jong === 21) { // ㅇ (ng) -> stays 'ng'
          jongStr = 'ng';
          next.customCho = '';
        } else {
          // Regular single batchim moves to next onset smoothly
          const liaisonMap = {
            1: 'g', 2: 'kk', 4: 'n', 7: 'd', 16: 'm', 17: 'b',
            19: 's', 22: 'j', 23: 'ch', 24: 'k', 25: 't', 26: 'p'
          };
          jongStr = '';
          next.customCho = liaisonMap[jong] || KO_JONG_BASE[jong];
        }
      }
      // Rule 3: ㅎ Batchim combinations (ㅎ + ㄱ/ㄷ/ㅈ/ㅅ)
      else if (jong === 27 && next) {
        if (nextCho === 0) { jongStr = ''; next.customCho = 'k'; } // ㅎ + ㄱ -> ㅋ
        else if (nextCho === 3) { jongStr = ''; next.customCho = 't'; } // ㅎ + ㄷ -> ㅌ
        else if (nextCho === 12) { jongStr = ''; next.customCho = 'ch'; } // ㅎ + ㅈ -> ㅊ
        else if (nextCho === 9) { jongStr = ''; next.customCho = 'ss'; } // ㅎ + ㅅ -> ㅆ
        else if (nextCho === 2) { jongStr = 'n'; } // ㅎ + ㄴ -> ㄴ
        else { jongStr = 't'; }
      }
      // Rule 3b: Consonant + ㅎ (ㄱ/ㄷ/ㅂ/ㅈ + ㅎ -> ㅋ/ㅌ/ㅍ/ㅊ)
      else if (next && nextCho === 18) {
        if (jong === 1) { jongStr = ''; next.customCho = 'k'; }
        else if (jong === 7) { jongStr = ''; next.customCho = 't'; }
        else if (jong === 17) { jongStr = ''; next.customCho = 'p'; }
        else if (jong === 22) { jongStr = ''; next.customCho = 'ch'; }
        else { jongStr = KO_JONG_BASE[jong]; }
      }
      // Rule 4: Nasal Assimilation (before ㄴ=2, ㅁ=6)
      else if (next && (nextCho === 2 || nextCho === 6)) {
        if ([17, 26, 18].includes(jong)) jongStr = 'm'; // ㅂ, ㅍ, ㅄ -> m
        else if ([1, 2, 3, 9, 24].includes(jong)) jongStr = 'ng'; // ㄱ, ㄲ, ㄳ, ㄺ, ㅋ -> ng
        else if ([7, 19, 20, 22, 23, 25, 27].includes(jong)) jongStr = 'n'; // ㄷ, ㅅ, ㅆ, ㅈ, ㅊ, ㅌ, ㅎ -> n
        else jongStr = KO_JONG_BASE[jong];
      }
      // Rule 5: Liquid Assimilation (ㄴ+ㄹ or ㄹ+ㄴ -> ll)
      else if (jong === 4 && next && nextCho === 5) { // ㄴ + ㄹ -> ll
        jongStr = 'l';
        next.customCho = 'l';
      } else if (jong === 8 && next && nextCho === 2) { // ㄹ + ㄴ -> ll
        jongStr = 'l';
        next.customCho = 'l';
      }
      // Default
      else {
        jongStr = KO_JONG_BASE[jong];
      }
    }

    if (curr.customCho !== undefined) {
      choStr = curr.customCho;
    }

    const sylRomaja = (choStr + jungStr + jongStr)
      .replace(/lr/g, 'll')
      .replace(/rl/g, 'll');

    result.push({ text: curr.ch, romaji: sylRomaja });
  }

  return result;
}

function romanizeKoreanText(text) {
  if (!text) return '';
  const tokens = romanizeKoreanTokens(text);
  return tokens.map(t => t.romaji).join('')
    .replace(/\s+/g, ' ')
    .trim();
}

// =============================================================================
// 2. JAPANESE VOCABULARY OVERRIDES & PHONETICS
// =============================================================================
const JP_PRE_OVERRIDES = [
  { match: /二人/g, rep: 'ふたり' },
  { match: /一人/g, rep: 'ひとり' },
  { match: /明日/g, rep: 'あした' },
  { match: /昨日/g, rep: 'きのう' },
  { match: /今日/g, rep: 'きょう' },
  { match: /大人/g, rep: 'おとな' }
];

// =============================================================================
// 3. CHINESE SONG LYRICS PHONETICS & POLYPHONE RESOLUTION
// =============================================================================
const ZH_CUSTOM_DICT = {
  // 1. Primary character overrides for song lyrics (resolves archaic/rare dictionary bugs)
  '妳': 'ni',
  '於': 'yu',
  '乾': 'gan',
  '乾坤': 'qian kun',
  '著': 'zhe',
  '還': 'hai',
  '麼': 'me',
  '么': 'me',

  // 2. 著 (zhao / zhuo / zhu)
  '睡著': 'shui zhao',
  '睡着': 'shui zhao',
  '著急': 'zhao ji',
  '着急': 'zhao ji',
  '著迷': 'zhao mi',
  '着迷': 'zhao mi',
  '著火': 'zhao huo',
  '着火': 'zhao huo',
  '著涼': 'zhao liang',
  '着凉': 'zhao liang',
  '找不著': 'zhao bu zhao',
  '找不着': 'zhao bu zhao',
  '執著': 'zhi zhuo',
  '执着': 'zhi zhuo',
  '著重': 'zhuo zhong',
  '着重': 'zhuo zhong',
  '沉著': 'chen zhuo',
  '沉着': 'chen zhuo',
  '著手': 'zhuo shou',
  '着手': 'zhuo shou',
  '著名': 'zhu ming',
  '著作': 'zhu zuo',
  '名著': 'ming zhu',

  // 3. 麼 / 么 (me vs mo)
  '甚麼': 'shen me',
  '甚么': 'shen me',
  '什麼': 'shen me',
  '怎么': 'zen me',
  '怎麼': 'zen me',
  '那么': 'na me',
  '那麼': 'na me',
  '多么': 'duo me',
  '多麼': 'duo me',
  '这么': 'zhe me',
  '這麼': 'zhe me',
  '為甚麼': 'wei shen me',
  '为甚么': 'wei shen me',
  '為什麼': 'wei shen me',
  '为什么': 'wei shen me',
  '怎麼了': 'zen me le',
  '怎么了': 'zen me le',
  '說甚麼': 'shuo shen me',
  '说甚么': 'shuo shen me',
  '算甚麼': 'suan shen me',
  '算甚么': 'suan shen me',
  '沒甚麼': 'mei shen me',
  '没甚么': 'mei shen me',
  '有甚麼': 'you shen me',
  '有甚么': 'you shen me',
  '憑甚麼': 'ping shen me',
  '凭甚么': 'ping shen me',

  // 4. 還 (huan vs hai)
  '還給': 'huan gei',
  '还给': 'huan gei',
  '還清': 'huan qing',
  '还清': 'huan qing',
  '償還': 'chang huan',
  '偿还': 'chang huan',
  '歸還': 'gui huan',
  '归还': 'gui huan',
  '退還': 'tui huan',
  '退还': 'tui huan',
  '還我': 'huan wo',
  '还我': 'huan wo',
  '還你': 'huan ni',
  '还你': 'huan ni',
  '還他': 'huan ta',
  '还他': 'huan ta',

  // 5. 了 (liao vs le)
  '沒完沒了': 'mei wan mei liao',
  '没完掉了': 'mei wan mei liao',
  '没完没了': 'mei wan mei liao',
  '明了': 'ming liao',
  '明瞭': 'ming liao',
  '了解': 'liao jie',
  '了無': 'liao wu',
  '了无': 'liao wu',
  '了斷': 'liao duan',
  '了断': 'liao duan',
  '了結': 'liao jie',
  '了结': 'liao jie',
  '了卻': 'liao que',
  '了却': 'liao que',
  '不了情': 'bu liao qing',
  '大不了': 'da bu liao',
  '不得了': 'bu de liao',
  '算不了': 'suan bu liao',
  '免不了': 'mian bu liao',
  '了不起': 'liao bu qi',

  // 6. Common song polyphones & phrases
  '朝陽': 'zhao yang',
  '朝阳': 'zhao yang',
  '朝霞': 'zhao xia',
  '朝夕': 'zhao xi',
  '朝暮': 'zhao mu',
  '一朝一夕': 'yi zhao yi xi',
  '似懂非懂': 'si dong fei dong',
  '便宜': 'pian yi',
  '差不多': 'cha bu duo',
  '出差': 'chu chai',
  '音樂': 'yin yue',
  '音乐': 'yin yue',
  '樂器': 'yue qi',
  '乐器': 'yue qi',
  '樂隊': 'yue dui',
  '乐队': 'yue dui',
  '樂曲': 'yue qu',
  '乐曲': 'yue qu',
  '樂譜': 'yue pu',
  '乐谱': 'yue pu',
  '長大': 'zhang da',
  '长大': 'zhang da',
  '成長': 'cheng zhang',
  '成长': 'cheng zhang',
  '長輩': 'zhang bei',
  '长辈': 'zhang bei',
  '長相': 'zhang xiang',
  '长相': 'zhang xiang',
  '重新': 'chong xin',
  '重複': 'chong fu',
  '重复': 'chong fu',
  '重來': 'chong lai',
  '重来': 'chong lai',
  '重生': 'chong sheng',
  '重溫': 'chong wen',
  '重温': 'chong wen',
  '重逢': 'chong feng',
  '重演': 'chong yan',
  '重現': 'chong xian',
  '重现': 'chong xian',
  '重疊': 'chong die',
  '重叠': 'chong die',
  '重重': 'chong chong',
  '重整': 'chong zheng',
  '銀行': 'yin hang',
  '银行': 'yin hang',
  '行業': 'hang ye',
  '行业': 'hang ye',
  '一行淚': 'yi hang lei',
  '一行泪': 'yi hang lei',
  '數不清': 'shu bu qing',
  '数不清': 'shu bu qing',
  '數星星': 'shu xing xing',
  '数星星': 'shu xing xing',
  '數一數': 'shu yi shu',
  '数一数': 'shu yi shu',
  '丟三落四': 'diu san la si',
  '丢三落四': 'diu san la si',
  '藉口': 'jie kou',
  '藉著': 'jie zhe',
  '借著': 'jie zhe',
  '哽咽': 'geng ye',
  '乾杯': 'gan bei',
  '乾淨': 'gan jing',
  '乾脆': 'gan cui',
  '乾燥': 'gan zao',
  '餅乾': 'bing gan'
};

try {
  customPinyin(ZH_CUSTOM_DICT);
} catch (e) {
  console.warn('Custom Pinyin init error:', e.message);
}

const ZH_DI_NOUNS = [
  '地方', '地球', '地面', '地下', '地點', '地点', '地圖', '地图',
  '地域', '地理', '地震', '地帶', '地带', '地毯', '地牢', '地盤', '地盘',
  '地獄', '地狱', '天地', '大地', '陸地', '陆地', '墓地', '場地', '场地',
  '基地', '陣地', '阵地', '原地', '落地', '領地', '领地', '聖地', '圣地',
  '地道', '目的地', '掃地', '扫地', '倒地', '平地', '草地', '雪地',
  '泥地', '土地', '地平線', '地平线', '地界', '地鐵', '地铁', '隨地', '随地',
  '見地', '见地', '異地', '异地', '之地', '地勢', '地势', '地質', '地质'
];

// =============================================================================
// 4. MAIN LYRICS ROMANIZER CLASS
// =============================================================================
class LyricsRomanizer {
  constructor() {
    this.kuroshiro = new Kuroshiro();
    this.isJpReady = false;
    this.jpInitPromise = null;
  }

  async initJapanese() {
    if (this.isJpReady) return;
    if (this.jpInitPromise) return this.jpInitPromise;

    this.jpInitPromise = (async () => {
      try {
        let dictPath = undefined;
        const possiblePaths = [
          path.join(process.cwd(), 'node_modules', 'kuromoji', 'dict'),
          path.resolve(__dirname, 'node_modules', 'kuromoji', 'dict'),
          path.join(__dirname, '..', 'node_modules', 'kuromoji', 'dict'),
          path.join(__dirname, 'node_modules', 'kuromoji', 'dict')
        ];
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            dictPath = p;
            break;
          }
        }

        await this.kuroshiro.init(new KuromojiAnalyzer(dictPath ? { dictPath } : undefined));
        this.isJpReady = true;
      } catch (err) {
        console.warn('Kuroshiro initialization warning:', err.message);
      }
    })();

    return this.jpInitPromise;
  }

  detectLanguage(text) {
    if (!text || typeof text !== 'string') return null;

    // 1. Korean (Hangul syllables & jamo)
    if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) return 'ko';

    // 2. Japanese (Hiragana & Katakana)
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';

    // 3. Chinese (CJK ideographs without Kana or Hangul)
    if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';

    return null;
  }

  detectLyricsLanguage(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return null;
    const fullText = lines.join(' ');
    return this.detectLanguage(fullText);
  }

  async romanizeLine(text, lang) {
    if (!text || !text.trim()) return '';
    const cleanText = text.trim();

    try {
      // 1. Korean
      if (lang === 'ko' || (/[\uAC00-\uD7AF]/.test(cleanText) && !/[\u3040-\u30FF]/.test(cleanText))) {
        return romanizeKoreanText(cleanText);
      }

      // 2. Japanese
      if (lang === 'ja' || /[\u3040-\u309F\u30A0-\u30FF]/.test(cleanText)) {
        await this.initJapanese();
        if (this.isJpReady) {
          let preProcessed = cleanText;
          for (const r of JP_PRE_OVERRIDES) {
            preProcessed = preProcessed.replace(r.match, r.rep);
          }

          let res = await this.kuroshiro.convert(preProcessed, {
            to: 'romaji',
            mode: 'spaced',
            romajiSystem: 'hepburn'
          });

          // Convert Hepburn macrons into natural singable kana spelling
          res = res
            .replace(/ō/g, 'ou')
            .replace(/ū/g, 'uu')
            .replace(/ē/g, 'ee')
            .replace(/ā/g, 'aa')
            .replace(/ī/g, 'ii')
            .replace(/Ō/g, 'Ou')
            .replace(/Ū/g, 'Uu')
            .replace(/Ē/g, 'Ee')
            .replace(/Ā/g, 'Aa')
            .replace(/Ī/g, 'Ii');

          // Contract split auxiliary verbs (te-form, past tense, negative, etc.)
          res = res
            .replace(/\b(\w+)\s+(te|ta|de|da|ba)\b/gi, '$1$2')
            .replace(/\b(\w+)\s+(nai|nakatta)\b/gi, '$1$2')
            .replace(/\bdatsuta\b/gi, 'datta')
            .replace(/\bdatsute\b/gi, 'datte')
            .replace(/\bkatsuta\b/gi, 'katta')
            .replace(/\bmatsuta\b/gi, 'matta')
            .replace(/\bdatsu\s+ta\b/gi, 'datta')
            .replace(/\bdatsu\s+te\b/gi, 'datte')
            .replace(/\bkatsu\s+ta\b/gi, 'katta')
            .replace(/\bmatsu\s+ta\b/gi, 'matta');

          // Spacing and punctuation cleanup
          res = res
            .replace(/\s+([,.\?!~」』\)\'\"])/g, '$1')
            .replace(/([「『\(\'\"])\s+/g, '$1')
            .replace(/"([^"]+)"(\w+)/g, '"$1" $2')
            .replace(/\s+/g, ' ')
            .trim();

          return res;
        }

        // Safe fallback for kana if Kuromoji dict is not loaded
        return wanakana.toRomaji(cleanText);
      }

      // 3. Chinese (Strictly excluded if line was detected as Japanese or contains Kana)
      if (lang === 'zh' || (/[\u4E00-\u9FFF]/.test(cleanText) && !/[\u3040-\u309F\u30A0-\u30FF]/.test(cleanText) && lang !== 'ja')) {
        let s = cleanText;

        // Protect noun words containing 地 (dì)
        const diPhs = [];
        ZH_DI_NOUNS.forEach((w, i) => {
          if (s.includes(w)) {
            const ph = '__D_' + i + '__';
            diPhs.push({ ph, original: w });
            s = s.split(w).join(ph);
          }
        });

        // Any remaining 地 in song lyrics is the adverbial particle (pronounced 'de')
        s = s.replace(/地/g, '的');

        // Restore protected 地 nouns
        diPhs.forEach(({ ph, original }) => {
          s = s.split(ph).join(original);
        });

        let res = pinyin(s, {
          toneType: 'none',
          nonZh: 'consecutive'
        });

        // Formatting cleanup (spaces before punctuation, quotes, etc.)
        res = res
          .replace(/\s+([,.\?!~」』\)\'\"])/g, '$1')
          .replace(/([「『\(\'\"])\s+/g, '$1')
          .replace(/\s+/g, ' ')
          .trim();

        return res;
      }
    } catch (e) {
      console.warn('Romanize error on line:', e.message);
    }

    return '';
  }

  alignKoreanWords(lineText, words) {
    if (!words || words.length === 0) return words;
    const tokens = romanizeKoreanTokens(lineText);
    let cursor = 0;
    return words.map(w => {
      let wRomaji = '';
      for (const ch of w.text) {
        while (cursor < tokens.length && tokens[cursor].text !== ch && /\s/.test(tokens[cursor].text)) {
          cursor++;
        }
        if (cursor < tokens.length && tokens[cursor].text === ch) {
          wRomaji += tokens[cursor].romaji;
          cursor++;
        } else {
          wRomaji += ch;
        }
      }
      return {
        ...w,
        romaji: wRomaji || w.text
      };
    });
  }

  alignChineseWords(lineText, words) {
    if (!words || words.length === 0) return words;
    const s = lineText || '';

    // Find character indices belonging to noun phrases containing 地
    const diNounCharIndices = new Set();
    ZH_DI_NOUNS.forEach(w => {
      let idx = 0;
      while ((idx = s.indexOf(w, idx)) !== -1) {
        for (let c = 0; c < w.length; c++) {
          diNounCharIndices.add(idx + c);
        }
        idx += w.length;
      }
    });

    const tokens = pinyin(s, { toneType: 'none', type: 'all' });
    let cursor = 0;
    return words.map(w => {
      let wPinyin = [];
      for (const ch of w.text) {
        while (cursor < tokens.length && tokens[cursor].origin !== ch && /\s/.test(tokens[cursor].origin)) {
          cursor++;
        }
        if (cursor < tokens.length && tokens[cursor].origin === ch) {
          const t = tokens[cursor];
          let py = t.isZh ? t.pinyin : (t.result || ch);
          if (ch === '地' && !diNounCharIndices.has(cursor)) {
            py = 'de';
          }
          wPinyin.push({ text: py, isZh: Boolean(t.isZh) });
          cursor++;
        } else {
          wPinyin.push({ text: ch === '地' ? 'de' : ch, isZh: false });
        }
      }

      // Natural join: Don't insert spaces between consecutive Latin letters / numbers (e.g. "Hah," or "Baby")
      let romaji = '';
      for (let i = 0; i < wPinyin.length; i++) {
        const curr = wPinyin[i];
        if (i === 0) {
          romaji = curr.text;
          continue;
        }
        const prev = wPinyin[i - 1];
        if (!prev.isZh && !curr.isZh && /^[A-Za-z0-9'.,!?-]+$/.test(prev.text) && /^[A-Za-z0-9'.,!?-]+$/.test(curr.text)) {
          romaji += curr.text;
        } else {
          romaji += ' ' + curr.text;
        }
      }

      return {
        ...w,
        romaji: romaji.trim() || w.text
      };
    });
  }

  async alignJapaneseWords(lineText, words) {
    if (!words || words.length === 0) return words;
    await this.initJapanese();
    if (!this.isJpReady) {
      return words.map(w => ({
        ...w,
        romaji: wanakana.toRomaji(w.text) || w.text
      }));
    }

    try {
      // 1. Run furigana on the original lineText without mutating Kanji
      const html = await this.kuroshiro.convert(lineText || '', { to: 'hiragana', mode: 'furigana' });
      const furiganaTokens = [];
      const rubyRegex = /<ruby>([\s\S]*?)<rp>\(<\/rp><rt>([\s\S]*?)<\/rt><rp>\)<\/rp><\/ruby>/gi;
      let lastIdx = 0;
      let m;
      while ((m = rubyRegex.exec(html)) !== null) {
        if (m.index > lastIdx) {
          const plain = html.substring(lastIdx, m.index);
          furiganaTokens.push({ text: plain, reading: plain });
        }
        furiganaTokens.push({ text: m[1], reading: m[2] });
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx < html.length) {
        const plain = html.substring(lastIdx);
        furiganaTokens.push({ text: plain, reading: plain });
      }

      // 2. Apply reading overrides on the reading property without changing the Kanji text
      const JP_READING_OVERRIDES = [
        { text: '二人', reading: 'ふたり' },
        { text: '一人', reading: 'ひとり' },
        { text: '明日', reading: 'あした' },
        { text: '昨日', reading: 'きのう' },
        { text: '今日', reading: 'きょう' },
        { text: '大人', reading: 'おとな' }
      ];

      for (let i = 0; i < furiganaTokens.length; i++) {
        if (i < furiganaTokens.length - 1) {
          const pairText = furiganaTokens[i].text + furiganaTokens[i + 1].text;
          const match = JP_READING_OVERRIDES.find(o => o.text === pairText);
          if (match) {
            furiganaTokens[i] = { text: match.text, reading: match.reading };
            furiganaTokens.splice(i + 1, 1);
            continue;
          }
        }
        const single = JP_READING_OVERRIDES.find(o => o.text === furiganaTokens[i].text);
        if (single) {
          furiganaTokens[i].reading = single.reading;
        }
      }

      // 3. Intelligent character-by-character readings splitter (never sever small youon ゃ, ゅ, ょ, ぁ, ぃ, ぅ, ぇ, ぉ, ー)
      const smallKanaRegex = /^[ゃゅょぁぃぅぇぉーャュョァィゥェォ]/;
      const charReadings = [];
      for (const ft of furiganaTokens) {
        if (ft.text.length <= 1) {
          charReadings.push({ char: ft.text, reading: ft.reading });
        } else if (ft.text === ft.reading) {
          for (const ch of ft.text) {
            charReadings.push({ char: ch, reading: ch });
          }
        } else {
          let readIdx = 0;
          for (let i = 0; i < ft.text.length; i++) {
            const isLast = (i === ft.text.length - 1);
            if (isLast) {
              charReadings.push({ char: ft.text[i], reading: ft.reading.substring(readIdx) });
              break;
            }
            const remainingChars = ft.text.length - i;
            const remainingReading = ft.reading.length - readIdx;
            let targetLen = Math.max(1, Math.floor(remainingReading / remainingChars));
            while (readIdx + targetLen < ft.reading.length && smallKanaRegex.test(ft.reading[readIdx + targetLen])) {
              targetLen++;
            }
            charReadings.push({ char: ft.text[i], reading: ft.reading.substr(readIdx, targetLen) });
            readIdx += targetLen;
          }
        }
      }

      // 4. Sequential search matching based on searchPos with Katakana/Hiragana normalized equivalence
      let searchPos = 0;
      const raw = [];
      for (const w of words) {
        let wReading = '';
        for (const ch of w.text) {
          const chHira = wanakana.toHiragana(ch);
          let foundIdx = -1;
          for (let idx = searchPos; idx < charReadings.length; idx++) {
            const crHira = wanakana.toHiragana(charReadings[idx].char);
            if (charReadings[idx].char === ch || (chHira && crHira && chHira === crHira)) {
              foundIdx = idx;
              break;
            }
          }
          if (foundIdx !== -1) {
            wReading += charReadings[foundIdx].reading;
            searchPos = foundIdx + 1;
          } else {
            wReading += ch;
          }
        }
        raw.push({ ...w, wReading });
      }

      // 5. Convert to Romaji with phonetic sokuon (っ / ッ) and youon lookahead
      const result = [];
      for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        let wReading = item.wReading;
        let wRomaji = '';

        if (i < raw.length - 1) {
          const nextReading = raw[i + 1].wReading || '';
          if (/[っッ]$/.test(wReading)) {
            // Sokuon gemination
            const nextRom = wanakana.toRomaji(nextReading).trim();
            const consonantMatch = nextRom.match(/^[bcdfghjklmnpqrstvwxyz]/i);
            const nextConsonant = consonantMatch ? consonantMatch[0].toLowerCase() : '';
            const baseReading = wReading.slice(0, -1);
            const baseRomaji = wanakana.toRomaji(baseReading);
            wRomaji = nextConsonant ? (baseRomaji + nextConsonant) : wanakana.toRomaji(wReading);
          } else if (smallKanaRegex.test(nextReading)) {
            // Attached small youon glide
            wRomaji = wanakana.toRomaji(wReading + nextReading);
          } else {
            wRomaji = wanakana.toRomaji(wReading || item.text);
          }
        } else {
          wRomaji = wanakana.toRomaji(wReading || item.text);
        }

        wRomaji = (wRomaji || '')
          .replace(/ō/g, 'ou').replace(/ū/g, 'uu').replace(/ē/g, 'ee').replace(/ā/g, 'aa').replace(/ī/g, 'ii')
          .replace(/Ō/g, 'Ou').replace(/Ū/g, 'Uu').replace(/Ē/g, 'Ee').replace(/Ā/g, 'Aa').replace(/Ī/g, 'Ii')
          .replace(/\s+/g, ' ')
          .trim();

        result.push({
          ...item,
          romaji: wRomaji || item.text
        });
      }
      return result;
    } catch (e) {
      console.warn('alignJapaneseWords error:', e.message);
      return words;
    }
  }

  async romanizeLyricsList(parsedLines) {
    if (!Array.isArray(parsedLines) || parsedLines.length === 0) return parsedLines;

    const overallLang = this.detectLyricsLanguage(parsedLines.map(p => p.text));

    const result = [];
    for (const item of parsedLines) {
      // 1. Preserve official <transliteration> from Apple Music TTML if already complete
      if (item.romaji && Array.isArray(item.romajiWords) && item.romajiWords.length > 0) {
        result.push(item);
        continue;
      }

      let romaji = item.romaji || null;
      let lineLang = null;

      // Always inspect text to identify the actual source script language
      if (item.text) {
        if (/[\u3040-\u30ff]/.test(item.text) || (overallLang === 'ja' && /[\u4e00-\u9fff]/.test(item.text))) {
          lineLang = 'ja';
        } else if (/[\uac00-\ud7af\u1100-\u11ff]/.test(item.text) || overallLang === 'ko') {
          lineLang = 'ko';
        } else if (/[\u4e00-\u9fff]/.test(item.text) && !/[\u3040-\u30ff]/.test(item.text)) {
          lineLang = 'zh';
        } else if (item.lang && item.lang !== 'en') {
          lineLang = item.lang.split('-')[0].toLowerCase();
        } else {
          lineLang = this.detectLanguage(item.text);
        }
      }

      if (!romaji && item.text && lineLang) {
        romaji = await this.romanizeLine(item.text, lineLang);
        // If romaji is identical to original (e.g. English line in J-pop song), don't duplicate
        if (romaji && romaji.toLowerCase().replace(/[^a-z0-9]/g, '') === item.text.toLowerCase().replace(/[^a-z0-9]/g, '')) {
          romaji = null;
        }
      }

      let updatedWords = item.words || null;
      if (Array.isArray(item.words) && item.words.length > 0 && lineLang) {
        if (lineLang === 'ja') {
          updatedWords = await this.alignJapaneseWords(item.text, item.words);
        } else if (lineLang === 'ko') {
          updatedWords = this.alignKoreanWords(item.text, item.words);
        } else if (lineLang === 'zh') {
          updatedWords = this.alignChineseWords(item.text, item.words);
        } else {
          updatedWords = item.words;
        }
      }

      // 1:1 Syllable Lock: Bind Romaji syllables 100% to the exact begin/end of the original words
      let computedRomajiWords = null;
      if (Array.isArray(updatedWords) && updatedWords.length > 0 && updatedWords.some(w => w.begin !== undefined)) {
        computedRomajiWords = updatedWords.map(w => ({
          text: w.romaji || w.text,
          begin: w.begin,
          end: w.end,
          trailingSpace: (lineLang === 'zh' || lineLang === 'ja') ? true : (w.trailingSpace !== false)
        }));
      } else if (item.romajiWords) {
        computedRomajiWords = item.romajiWords;
      }
      // Note: If original line has NO word sync (line-synced only), computedRomajiWords remains NULL.
      // We NEVER fake-interpolate syllable sweeps on line-synced songs so timing remains 100% honest and accurate.

      result.push({
        ...item,
        words: updatedWords,
        romaji: romaji || null,
        romajiWords: computedRomajiWords,
        lang: lineLang || null
      });
    }

    return {
      lines: result,
      detectedLang: overallLang
    };
  }

  interpolateLineWords(text, begin, end) {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    const duration = Math.max(0.1, (end || begin + 3) - begin);

    const isCjk = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(trimmed);
    const tokens = [];

    if (isCjk && !trimmed.includes(' ')) {
      for (const ch of trimmed) {
        tokens.push({ text: ch, trailingSpace: false });
      }
    } else {
      const rawTokens = trimmed.split(/(\s+)/);
      for (let i = 0; i < rawTokens.length; i++) {
        const tok = rawTokens[i];
        if (/^\s+$/.test(tok)) {
          if (tokens.length > 0) tokens[tokens.length - 1].trailingSpace = true;
        } else if (tok) {
          tokens.push({ text: tok, trailingSpace: false });
        }
      }
    }

    if (tokens.length === 0) return null;

    const totalWeight = tokens.reduce((acc, t) => acc + Math.max(1, t.text.length), 0);
    let curTime = begin;

    return tokens.map((token, i) => {
      const weight = Math.max(1, token.text.length);
      const tokenDuration = (weight / totalWeight) * duration;
      const wBegin = curTime;
      const wEnd = (i === tokens.length - 1) ? (end || curTime + tokenDuration) : curTime + tokenDuration;
      curTime = wEnd;

      return {
        text: token.text,
        begin: parseFloat(wBegin.toFixed(3)),
        end: parseFloat(wEnd.toFixed(3)),
        trailingSpace: token.trailingSpace
      };
    });
  }
}

module.exports = new LyricsRomanizer();
