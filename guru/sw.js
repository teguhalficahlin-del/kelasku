/**
 * sw.js — Service Worker untuk Portal Guru SIP Mandiri.
 * Strategy: Cache First untuk aset statis; Network Only untuk Supabase API.
 */
'use strict';

const CACHE_NAME = 'sip-guru-v1';

const PRECACHE_URLS = [
  '/guru/classroom.html',
  '/guru/dashboard.html',
  '/guru/js/api.js',
  '/guru/js/classroom.js',
  '/guru/js/classroom-rancang.js',
  '/guru/js/classroom-rancang-ai.js',
  '/guru/js/runtime-compiler.js',
  '/guru/js/runtime-db.js',
];

const SUPABASE_HOSTS = [
  'supabase.co',
  'supabase.in',
  'supabase.com',
];

function isSupabaseRequest(url) {
  try {
    const host = new URL(url).hostname;
    return SUPABASE_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch (_) {
    return false;
  }
}

function isStaticAsset(url) {
  try {
    const path = new URL(url).pathname;
    return /\.(js|css|html|woff2?|png|svg|ico)$/.test(path);
  } catch (_) {
    return false;
  }
}

// ── Install: precache ───────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(PRECACHE_URLS).catch(err =>
        console.warn('[sw] precache partial failure:', err)
      )
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event;

  // Never handle non-GET or POST requests
  if (request.method !== 'GET') return;

  const url = request.url;

  // NETWORK ONLY — Supabase API calls must not be cached
  if (isSupabaseRequest(url)) return;

  // CACHE FIRST — static assets
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, toCache));
          return response;
        }).catch(() => offlineFallback());
      })
    );
    return;
  }

  // NETWORK FIRST — everything else
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then(cached => cached ?? offlineFallback())
    )
  );
});

function offlineFallback() {
  return new Response(
    JSON.stringify({ error: 'offline', message: 'Tidak ada koneksi. Coba lagi saat online.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}
