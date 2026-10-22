/**
 * Lyrics Romanizer Engine for AuraSound
 * Converts Japanese (Kanji/Kana -> Romaji), Korean (Hangul -> Romaja), and Chinese (Hanzi -> Pinyin)
 */

const Kuroshiro = require('kuroshiro');
const KuromojiAnalyzer = require('kuroshiro-analyzer-kuromoji');
const kpop = require('kpop');
const { pinyin } = require('pinyin-pro');

class LyricsRomanizer {
  constructor() {
    this.kuroshiro = new Kuroshiro();
    this.isJpReady = false;
    this.jpInitPromise = null;
    this.initJapanese();
  }

  async initJapanese() {
    if (this.isJpReady) return;
    if (this.jpInitPromise) return this.jpInitPromise;

    this.jpInitPromise = (async () => {
      try {
        await this.kuroshiro.init(new KuromojiAnalyzer());
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
    const hasHangul = /[\uAC00-\uD7AF\u1100-\u11FF]/.test(text);
    if (hasHangul) return 'ko';

    // 2. Japanese (Hiragana & Katakana)
    const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
    if (hasKana) return 'ja';

    // 3. Chinese (CJK ideographs without Kana)
    const hasCJK = /[\u4E00-\u9FFF]/.test(text);
    if (hasCJK) return 'zh';

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
      if (lang === 'ko' || (/[\uAC00-\uD7AF]/.test(cleanText) && !/[\u3040-\u30FF]/.test(cleanText))) {
        // Korean
        return kpop.romanize(cleanText);
      }

      if (lang === 'ja' || /[\u3040-\u309F\u30A0-\u30FF]/.test(cleanText)) {
        // Japanese
        await this.initJapanese();
        if (this.isJpReady) {
          let res = await this.kuroshiro.convert(cleanText, {
            to: 'romaji',
            mode: 'spaced',
            romajiSystem: 'hepburn'
          });
          // Fix sokuon contractions and spaced punctuation
          res = res
            .replace(/\bdatsu\s+ta\b/gi, 'datta')
            .replace(/\bdatsu\s+te\b/gi, 'datte')
            .replace(/\bkatsu\s+ta\b/gi, 'katta')
            .replace(/\bkatsu\s+te\b/gi, 'katte')
            .replace(/\bmatsu\s+ta\b/gi, 'matta')
            .replace(/\bmatsu\s+te\b/gi, 'matte')
            .replace(/\s+([,.\?!~」』\)\'\"])/g, '$1')
            .replace(/([「『\(\'\"])\s+/g, '$1')
            .replace(/\s+/g, ' ')
            .trim();
          return res;
        }
      }

      if (lang === 'zh' || /[\u4E00-\u9FFF]/.test(cleanText)) {
        // Chinese Pinyin
        const res = pinyin(cleanText, {
          toneType: 'none',
          nonZh: 'consecutive'
        });
        return res.replace(/\s+/g, ' ').trim();
      }
    } catch (e) {
      console.warn('Romanize error on line:', e.message);
    }

    return '';
  }

  async romanizeLyricsList(parsedLines) {
    if (!Array.isArray(parsedLines) || parsedLines.length === 0) return parsedLines;

    const overallLang = this.detectLyricsLanguage(parsedLines.map(p => p.text));

    const result = [];
    for (const item of parsedLines) {
      let romaji = null;
      let lineLang = null;

      if (item.text) {
        lineLang = this.detectLanguage(item.text) || overallLang;
        if (lineLang) {
          romaji = await this.romanizeLine(item.text, lineLang);
          // If romaji is identical to original (e.g. English line in J-pop song), don't duplicate
          if (romaji && romaji.toLowerCase().replace(/[^a-z0-9]/g, '') === item.text.toLowerCase().replace(/[^a-z0-9]/g, '')) {
            romaji = null;
          }
        }
      }

      result.push({
        ...item,
        romaji: romaji || null,
        lang: lineLang || null
      });
    }

    return {
      lines: result,
      detectedLang: overallLang
    };
  }
}

module.exports = new LyricsRomanizer();
