const axios = require('axios');
const https = require('https');

const rightsCache = new Map();

/**
 * Align big integer increment for AES-CTR 16-byte block counter
 */
function incrementIv(iv, blockOffset) {
  const r = new Uint8Array(16);
  r.set(iv);
  if (blockOffset === 0n || blockOffset === 0) return r;
  let n = BigInt(0);
  for (let e = 0; e < 16; e++) n = (n << 8n) | BigInt(r[e]);
  n += BigInt(blockOffset);
  for (let e = 15; e >= 0; e--) {
    r[e] = Number(n & 255n);
    n >>= 8n;
  }
  return r;
}

/**
 * Fetch and derive Suno clip AES-CTR decryption keys
 */
async function getClipCryptoKeys(clipId) {
  const cached = rightsCache.get(clipId);
  if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) {
    return cached;
  }

  const res = await axios.post('https://suno.com/a/api/mango/rights', {
    content_params: {
      content_id: clipId,
      content_type: 'clip'
    }
  }, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Referer': 'https://suno.com/create',
      'Origin': 'https://suno.com'
    },
    timeout: 10000
  });

  const { key: encKey, iv: encIv, glt } = res.data;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(glt));
  const gltKey = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['decrypt']);

  async function decryptEnvelope(encBase64) {
    const raw = Uint8Array.from(Buffer.from(encBase64, 'base64'));
    const iv = raw.slice(0, 12);
    const ciphertext = raw.slice(12);
    const additionalData = new TextEncoder().encode(clipId);
    const dec = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData },
      gltKey,
      ciphertext
    );
    return new Uint8Array(dec);
  }

  const rawAesKey = await decryptEnvelope(encKey);
  const rawIv = await decryptEnvelope(encIv);
  const aesKey = await crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-CTR' }, false, ['decrypt']);

  const entry = { rawAesKey, aesKey, rawIv, timestamp: Date.now() };
  rightsCache.set(clipId, entry);
  return entry;
}

/**
 * Decrypt a specific byte range of a Suno clip
 */
async function decryptAudioRange(clipId, startByte, endByte, targetUrl) {
  const { aesKey, rawIv } = await getClipCryptoKeys(clipId);

  const fetchUrl = targetUrl || `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`;

  // Align start to 16-byte block boundary for AES-CTR
  const alignedStart = Math.floor(startByte / 16) * 16;
  const byteOffsetInBlock = startByte - alignedStart;
  const blockOffset = BigInt(alignedStart / 16);

  // Fetch encrypted slice from CloudFront
  const encryptedBuf = await new Promise((resolve, reject) => {
    const req = https.get(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Range': `bytes=${alignedStart}-${endByte}`,
        'Referer': 'https://suno.com/'
      },
      timeout: 15000
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });

  if (!encryptedBuf || encryptedBuf.length === 0) {
    throw new Error('Empty response from CloudFront audio source');
  }

  const counter = incrementIv(rawIv, blockOffset);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CTR', counter, length: 128 },
    aesKey,
    encryptedBuf
  );

  return Buffer.from(decrypted).slice(byteOffsetInBlock);
}

/**
 * Check if a URL or clip ID corresponds to Suno encrypted audio
 */
function isSunoEncrypted(url, id) {
  if (url && (url.includes('d2lwuy8qc234o3.cloudfront.net') || url.includes('/1/clip/') || url.includes('dn3ebm5xp8ng9.cloudfront.net'))) {
    return true;
  }
  if (id && /^[a-zA-Z0-9_-]{8,64}$/.test(id) && !id.startsWith('mix-') && !id.startsWith('dsp-')) {
    return true;
  }
  return false;
}

/**
 * Extract clean UUID clip ID
 */
function extractClipId(url, id) {
  if (id && /^[a-f0-9-]{36}$/i.test(id)) return id;
  if (url) {
    const match = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (match) return match[1];
  }
  return id || '';
}

/**
 * Stream decrypted Suno audio to client with HTTP 206 Range support
 */
async function streamDecryptedSunoAudio(req, res, clipId, targetUrl) {
  const fetchUrl = targetUrl || `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`;

  // 1. Get total file length via HEAD request
  let totalLength = 0;
  try {
    const headRes = await axios.head(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://suno.com/'
      },
      timeout: 10000
    });
    totalLength = parseInt(headRes.headers['content-length'] || '0', 10);
  } catch (headErr) {
    // Fallback default ~4.5MB
    totalLength = 4638891;
  }

  const rangeHeader = req.headers.range;

  let start = 0;
  let end = totalLength > 0 ? totalLength - 1 : 4638890;

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    start = parseInt(parts[0], 10) || 0;
    if (parts[1]) {
      end = parseInt(parts[1], 10);
    }

    // Cap chunk size per request to 512KB for instant response and smooth streaming
    const maxChunk = 512 * 1024;
    if (end - start + 1 > maxChunk) {
      end = start + maxChunk - 1;
    }
    if (totalLength > 0 && end >= totalLength) {
      end = totalLength - 1;
    }

    const chunkLength = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
    res.setHeader('Content-Length', chunkLength);

    const decryptedChunk = await decryptAudioRange(clipId, start, end, fetchUrl);
    return res.end(decryptedChunk);
  }

  // Full file stream (e.g. for fetch() or direct download)
  res.status(200);
  res.setHeader('Content-Length', totalLength);

  let current = 0;
  const chunkSize = 512 * 1024;
  while (current < totalLength) {
    if (res.writableEnded || res.destroyed) break;
    const chunkEnd = Math.min(totalLength - 1, current + chunkSize - 1);
    const chunk = await decryptAudioRange(clipId, current, chunkEnd, fetchUrl);
    res.write(chunk);
    current = chunkEnd + 1;
  }
  res.end();
}

module.exports = {
  isSunoEncrypted,
  extractClipId,
  getClipCryptoKeys,
  decryptAudioRange,
  streamDecryptedSunoAudio
};
