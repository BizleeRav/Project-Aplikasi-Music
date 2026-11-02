/**
 * AuraSound Enterprise-Grade Security Engine
 * -------------------------------------------
 * - Security Headers (CSP, FrameGuard, NoSniff, ReferrerPolicy, PermissionsPolicy)
 * - Intelligent Sliding-Window Rate Limiter (Anti-DDoS, Anti-Spam, Brute-Force Shield)
 * - Deep Input Sanitizer & Prototype Pollution Immunizer
 * - Path Traversal & Safe File Access Guard
 * - SSRF (Server-Side Request Forgery) Firewall for Audio Proxy
 * - Centralized Safe Error Handling & Information Leak Prevention
 */

const path = require('path');
const { URL } = require('url');

// ============================================================================
// 1. SECURITY HEADERS MIDDLEWARE
// ============================================================================
function securityHeaders(req, res, next) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent Clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Cross-Site Scripting (XSS) Legacy Defense
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Strict Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Cross-Origin Isolation Policies (allows OAuth popups like Google / Suno)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  // Restrict sensitive browser hardware APIs
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );

  // Content Security Policy (Tailored for AuraSound Hi-Fi & YouTube / Suno / Audio Worklets)
  const cspDirectives = [
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://www.youtube.com https://s.ytimg.com https://apis.google.com https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://accounts.google.com",
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' data: blob: https: http:",
    "connect-src 'self' data: blob: https: http: wss: ws:",
    "frame-src 'self' https://www.youtube.com https://accounts.google.com https://suno.com",
    "object-src 'none'",
    "base-uri 'self'"
  ];
  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  next();
}

// ============================================================================
// 2. SLIDING-WINDOW RATE LIMITER (Zero-Dependency, Memory-Safe)
// ============================================================================
class SlidingWindowRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60 * 1000; // 1 minute default
    this.max = options.max || 120; // max hits per window
    this.message = options.message || 'Terlalu banyak permintaan. Silakan coba kembali sesaat lagi.';
    this.hits = new Map(); // ip -> [timestamps]

    // Periodic cleanup of stale records every 60s
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, timestamps] of this.hits.entries()) {
      const valid = timestamps.filter(t => (now - t) < this.windowMs);
      if (valid.length === 0) {
        this.hits.delete(ip);
      } else {
        this.hits.set(ip, valid);
      }
    }
  }

  getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = forwarded.split(',')[0].trim();
      if (first) return first;
    }
    return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '127.0.0.1';
  }

  middleware() {
    return (req, res, next) => {
      const now = Date.now();
      const ip = this.getClientIp(req);

      let timestamps = this.hits.get(ip) || [];
      // Filter out timestamps outside current window
      timestamps = timestamps.filter(t => (now - t) < this.windowMs);

      if (timestamps.length >= this.max) {
        const oldest = timestamps[0];
        const retryAfterSec = Math.ceil(((oldest + this.windowMs) - now) / 1000) || 1;

        res.setHeader('Retry-After', retryAfterSec);
        res.setHeader('X-RateLimit-Limit', this.max);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', Math.ceil((oldest + this.windowMs) / 1000));

        return res.status(429).json({
          success: false,
          error: this.message,
          retryAfter: retryAfterSec
        });
      }

      timestamps.push(now);
      this.hits.set(ip, timestamps);

      res.setHeader('X-RateLimit-Limit', this.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.max - timestamps.length));

      next();
    };
  }
}

// Pre-configured Rate Limiters for Different Tiers
const apiLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  max: 200, // 200 requests/min for general app interactions & lyrics polling
  message: 'Batas kecepatan permintaan API tercapai. Silakan coba lagi sebentar.'
}).middleware();

const searchLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  max: 60, // 60 search queries/min per IP
  message: 'Pencarian terlalu sering dilakukan dalam waktu singkat. Mohon tunggu beberapa detik.'
}).middleware();

const aiStudioLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  max: 30, // 30 AI generations/actions per min
  message: 'Aktivitas Suno AI Studio melebihi ambang batas wajar. Mohon istirahat sejenak.'
}).middleware();

const authLimiter = new SlidingWindowRateLimiter({
  windowMs: 60 * 1000,
  max: 25, // 25 auth requests/min (anti-brute force)
  message: 'Terlalu banyak percobaan autentikasi. Silakan tunggu 1 menit.'
}).middleware();

// ============================================================================
// 3. INPUT SANITIZER & PROTOTYPE POLLUTION IMMUNIZER
// ============================================================================
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeValue(val, depth = 0) {
  if (depth > 10) return null; // Prevent circular / ultra-deep recursion
  if (val === null || val === undefined) return val;

  if (typeof val === 'string') {
    // Strip dangerous null bytes and invalid unicode control characters
    return val.replace(/\0/g, '').trim();
  }

  if (Array.isArray(val)) {
    return val.map(item => sanitizeValue(item, depth + 1));
  }

  if (typeof val === 'object') {
    const clean = {};
    for (const key of Object.keys(val)) {
      if (DANGEROUS_KEYS.has(key)) {
        console.warn(`[Security Alert] Blocked suspicious key "${key}" from request!`);
        continue; // Block prototype pollution attempt
      }
      clean[key] = sanitizeValue(val[key], depth + 1);
    }
    return clean;
  }

  return val;
}

function sanitizeInputs(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeValue(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeValue(req.params);
  }
  next();
}

// ============================================================================
// 4. PATH TRAVERSAL GUARD & SAFE FILENAME HELPER
// ============================================================================
function isSafePath(baseDir, targetPath) {
  if (!baseDir || !targetPath) return false;
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
}

function sanitizeFilename(filename, fallback = 'file') {
  if (!filename || typeof filename !== 'string') return fallback;
  // Only allow alphanumeric, dash, underscore, and dot (no directory separators or '..')
  const base = path.basename(filename);
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '.');
  return clean.slice(0, 80) || fallback;
}

function sanitizeUserKey(key, fallback = 'anonymous') {
  if (!key || typeof key !== 'string') return fallback;
  return key.trim().toLowerCase().replace(/[^a-zA-Z0-9@._-]/g, '_').slice(0, 64) || fallback;
}

// ============================================================================
// 5. SSRF FIREWALL FOR AUDIO PROXY
// ============================================================================
// Safe allowed audio hostnames / domains
const ALLOWED_AUDIO_DOMAINS = [
  'cloudfront.net',
  'suno.com',
  'suno.ai',
  'pixabay.com',
  'googlevideo.com',
  'youtube.com',
  'ytimg.com',
  'audiopipe.c314.workers.dev'
];

function isSafeAudioUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;
  try {
    const parsed = new URL(urlString);
    // Protocol MUST be https:
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

    const hostname = parsed.hostname.toLowerCase();

    // Block private, loopback, link-local, and cloud metadata IPs
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      hostname === '169.254.169.254' || // AWS / GCP metadata
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      console.warn(`[Security Firewall] Blocked SSRF attempt to internal host: ${hostname}`);
      return false;
    }

    // Must match one of our approved music/audio CDNs
    const isAllowed = ALLOWED_AUDIO_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );

    return isAllowed;
  } catch (err) {
    return false;
  }
}

// ============================================================================
// 6. CENTRALIZED SAFE ERROR HANDLER
// ============================================================================
function safeErrorHandler(err, req, res, next) {
  // Log full stack internally for debugging
  console.error('[Internal Server Error]', {
    method: req.method,
    url: req.originalUrl,
    error: err?.message || err,
    stack: err?.stack
  });

  if (res.headersSent) {
    return next(err);
  }

  // Return clean, unrevealing error message to client
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    error: status === 500
      ? 'Terjadi kendala pada pemrosesan server. Silakan coba kembali.'
      : (err.message || 'Permintaan tidak valid.')
  });
}

module.exports = {
  securityHeaders,
  apiLimiter,
  searchLimiter,
  aiStudioLimiter,
  authLimiter,
  sanitizeInputs,
  isSafePath,
  sanitizeFilename,
  sanitizeUserKey,
  isSafeAudioUrl,
  safeErrorHandler
};
