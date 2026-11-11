/**
 * AuraSound Smart Audio Cache
 * High-Performance IndexedDB Audio Cache for 0 KB Replay & Instant Playback
 * Preserves 100% Original Lossless/Hi-Fi Audio Quality Without Re-compression
 */
(function() {
  'use strict';

  class AuraAudioCache {
    constructor() {
      this.dbName = 'AuraAudioStore_v3';
      this.version = 1;
      this.storeName = 'audio_tracks';
      this.db = null;
      this.maxCachedTracks = 50; // Keep up to 50 tracks
      this.maxTotalSizeBytes = 300 * 1024 * 1024; // 300 MB maximum local cache
      this._initPromise = this.init();
    }

    async init() {
      if (typeof window === 'undefined' || !('indexedDB' in window)) {
        console.warn('[AudioCache] IndexedDB is not supported in this environment.');
        return null;
      }

      return new Promise((resolve) => {
        try {
          const req = window.indexedDB.open(this.dbName, this.version);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(this.storeName)) {
              const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
              store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
            }
          };
          req.onsuccess = (e) => {
            this.db = e.target.result;
            console.log('[AudioCache] IndexedDB Smart Audio Cache initialized successfully.');
            resolve(this.db);
          };
          req.onerror = (e) => {
            console.warn('[AudioCache] IndexedDB open failed:', e);
            resolve(null);
          };
        } catch (err) {
          console.warn('[AudioCache] Init error:', err);
          resolve(null);
        }
      });
    }

    async getAudioBlob(trackId) {
      if (!trackId) return null;
      try {
        await this._initPromise;
        if (!this.db) return null;

        return new Promise((resolve) => {
          const tx = this.db.transaction(this.storeName, 'readwrite');
          const store = tx.objectStore(this.storeName);
          const req = store.get(trackId);

          req.onsuccess = () => {
            const item = req.result;
            if (item && item.blob) {
              item.lastAccessed = Date.now();
              try {
                store.put(item);
              } catch (_) {}
              resolve(item.blob);
            } else {
              resolve(null);
            }
          };
          req.onerror = () => resolve(null);
        });
      } catch (err) {
        console.warn('[AudioCache] getAudioBlob error:', err);
        return null;
      }
    }

    async saveAudioBlob(trackId, blob, meta = {}) {
      if (!trackId || !blob || blob.size === 0) return false;
      try {
        await this._initPromise;
        if (!this.db) return false;

        await this.enforceQuotaLimit(blob.size);

        return new Promise((resolve) => {
          const tx = this.db.transaction(this.storeName, 'readwrite');
          const store = tx.objectStore(this.storeName);
          const record = {
            id: trackId,
            blob: blob,
            mimeType: blob.type || 'audio/webm',
            size: blob.size,
            title: meta.title || '',
            artist: meta.artist || '',
            lastAccessed: Date.now(),
            savedAt: Date.now()
          };
          const req = store.put(record);
          req.onsuccess = () => {
            const sizeMb = (blob.size / (1024 * 1024)).toFixed(2);
            console.log(`[AudioCache] ⚡ Smart Cache saved "${meta.title || trackId}" (${sizeMb} MB). Future replays use 0 KB!`);
            resolve(true);
          };
          req.onerror = () => resolve(false);
        });
      } catch (err) {
        console.warn('[AudioCache] saveAudioBlob error:', err);
        return false;
      }
    }

    async enforceQuotaLimit(newIncomingBytes = 0) {
      if (!this.db) return;
      try {
        const records = await new Promise((resolve) => {
          const tx = this.db.transaction(this.storeName, 'readonly');
          const store = tx.objectStore(this.storeName);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });

        if (!records || records.length === 0) return;

        let totalSize = records.reduce((sum, r) => sum + (r.size || 0), 0);
        // Sort oldest access first
        records.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));

        while (
          (records.length >= this.maxCachedTracks || (totalSize + newIncomingBytes) > this.maxTotalSizeBytes) &&
          records.length > 0
        ) {
          const oldest = records.shift();
          totalSize -= (oldest.size || 0);
          await new Promise((res) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).delete(oldest.id);
            tx.oncomplete = () => res();
            tx.onerror = () => res();
          });
          console.log(`[AudioCache] Evicted oldest cached track "${oldest.title || oldest.id}" to maintain 300 MB quota.`);
        }
      } catch (e) {
        console.warn('[AudioCache] Quota enforcement error:', e);
      }
    }

    async getCacheStats() {
      try {
        await this._initPromise;
        if (!this.db) return { count: 0, totalSizeMb: '0.00' };

        const records = await new Promise((resolve) => {
          const tx = this.db.transaction(this.storeName, 'readonly');
          const req = tx.objectStore(this.storeName).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });

        const totalBytes = records.reduce((sum, r) => sum + (r.size || 0), 0);
        return {
          count: records.length,
          totalSizeMb: (totalBytes / (1024 * 1024)).toFixed(2)
        };
      } catch (e) {
        return { count: 0, totalSizeMb: '0.00' };
      }
    }

    async clearCache() {
      try {
        await this._initPromise;
        if (!this.db) return;
        const tx = this.db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).clear();
        console.log('[AudioCache] Cache cleared successfully.');
      } catch (e) {
        console.warn('[AudioCache] Clear cache error:', e);
      }
    }
  }

  window.audioCache = new AuraAudioCache();
})();

