/**
 * sw.js — Service Worker untuk Portal Guru SIP Mandiri.
 *
 * Strategy:
 * - Network First untuk kode aplikasi (js/css/html) — versi terbaru selalu
 *   menang saat online, cache hanya dipakai sebagai cadangan saat offline.
 * - Cache First untuk aset yang benar-benar statis (font, gambar, ikon).
 * - Network Only untuk Supabase API.
 *
 * PENTING — naikkan CACHE_NAME setiap kali kode aplikasi berubah.
 * Handler `activate` menghapus semua cache yang namanya berbeda, sehingga
 * menaikkan angka ini membuang seluruh isi cache versi sebelumnya.
 * Sebelumnya nama ini dipatok 'sip-guru-v1' dan tidak pernah dinaikkan;
 * dikombinasikan dengan Cache First, setiap pengguna terkunci selamanya pada
 * versi JS yang pertama kali mereka muat.
 */
'use strict';

const CACHE_NAME = 'sip-guru-v2';

// URL relatif terhadap lokasi sw.js (/kelasku/guru/), bukan root domain.
// Sebelumnya ditulis '/guru/...' sehingga selalu 404 di GitHub Pages dan
// cache.addAll gagal seluruhnya — precache tidak pernah benar-benar jalan.
const PRECACHE_URLS = [
  'classroom.html',
  'dashboard.html',
  'js/api.js',
  'js/classroom.js',
  'js/classroom-rancang.js',
  'js/classroom-rancang-ai.js',
  'js/runtime-compiler.js',
  'js/runtime-db.js',
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

// Kode aplikasi — sering berubah, tidak boleh disajikan dari cache saat online.
function isAppCode(url) {
  try {
    return /\.(js|css|html)$/.test(new URL(url).pathname);
  } catch (_) {
    return false;
  }
}

// Aset yang isinya tidak berubah tanpa ganti nama file.
function isStaticAsset(url) {
  try {
    return /\.(woff2?|png|jpe?g|webp|svg|ico)$/.test(new URL(url).pathname);
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

  // NETWORK FIRST — kode aplikasi (js/css/html)
  // Cache diperbarui setiap kali jaringan berhasil, dan hanya dipakai sebagai
  // cadangan saat offline. Tanpa ini, perbaikan yang sudah di-deploy tidak
  // pernah sampai ke browser yang sudah punya versi lama di cache.
  if (isAppCode(url)) {
    event.respondWith(
      fetch(request).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, toCache));
        }
        return response;
      }).catch(() =>
        caches.match(request).then(cached => cached ?? offlineFallback())
      )
    );
    return;
  }

  // CACHE FIRST — aset statis (font, gambar, ikon)
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
