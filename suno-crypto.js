const axios = require('axios');
const https = require('https');

// Persistent Keep-Alive Agent for instant HTTP connection reuse
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  timeout: 15000
});

const rightsCache = new Map();
const fileSizeCache = new Map();

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
 * Fetch and derive Suno clip AES-CTR decryption keys (cached for 60 minutes)
 */
async function getClipCryptoKeys(clipId) {
  const cached = rightsCache.get(clipId);
  if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) {
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
    httpsAgent,
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
 * Determine exact file byte length via fast range probe (cached per clipId)
 */
async function getFileTotalLength(fetchUrl, clipId) {
  if (fileSizeCache.has(clipId)) {
    return fileSizeCache.get(clipId);
  }

  try {
    const res = await axios.get(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Range': 'bytes=0-0',
        'Referer': 'https://suno.com/'
      },
      httpsAgent,
      validateStatus: (s) => s === 206 || s === 200,
      timeout: 7000
    });

    let total = 0;
    const cr = res.headers['content-range'];
    if (cr) {
      const match = cr.match(/\/(\d+)$/);
      if (match) total = parseInt(match[1], 10);
    }
    if (!total && res.headers['content-length']) {
      total = parseInt(res.headers['content-length'], 10);
    }

    if (total > 0) {
      fileSizeCache.set(clipId, total);
      return total;
    }
  } catch (err) {
    console.warn(`[Suno Crypto] Fast size fetch failed for ${clipId}:`, err.message);
  }

  return 3679593; // Safe standard 128kbps m4a fallback size
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

  // Fetch encrypted slice from CloudFront via keep-alive connection
  const encryptedBuf = await new Promise((resolve, reject) => {
    const req = https.get(fetchUrl, {
      agent: httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Range': `bytes=${alignedStart}-${endByte}`,
        'Referer': 'https://suno.com/'
      },
      timeout: 15000
    }, res => {
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        return reject(new Error(`CloudFront returned status ${res.statusCode}`));
      }
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
 * Stream decrypted Suno audio to client with complete HTTP 206 Range & HEAD support
 */
async function streamDecryptedSunoAudio(req, res, clipId, targetUrl) {
  const fetchUrl = targetUrl || `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`;

  // Always set standard audio streaming headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Origin, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Accept-Ranges', 'bytes');

  const totalLength = await getFileTotalLength(fetchUrl, clipId);

  // 1. Instant HEAD response for browser preflight checks
  if (req.method === 'HEAD') {
    res.status(200);
    res.setHeader('Content-Length', totalLength);
    return res.end();
  }

  const rangeHeader = req.headers.range;

  // 2. HTTP 206 Partial Content Range streaming
  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    let start = parseInt(parts[0], 10) || 0;
    let end = parts[1] ? parseInt(parts[1], 10) : (totalLength > 0 ? totalLength - 1 : 0);

    if (start >= totalLength && totalLength > 0) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${totalLength}`);
      return res.end();
    }

    // Stream up to 512KB per range request for smooth buffering
    const maxChunk = 512 * 1024;
    if (end - start + 1 > maxChunk) {
      end = start + maxChunk - 1;
    }
    if (totalLength > 0 && end >= totalLength) {
      end = totalLength - 1;
    }

    const chunkLength = Math.max(0, end - start + 1);
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
    res.setHeader('Content-Length', chunkLength);

    const decryptedChunk = await decryptAudioRange(clipId, start, end, fetchUrl);
    return res.end(decryptedChunk);
  }

  // 3. Full file progressive stream (no Range header)
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
  return res.end();
}

module.exports = {
  isSunoEncrypted,
  extractClipId,
  getClipCryptoKeys,
  decryptAudioRange,
  streamDecryptedSunoAudio
};
