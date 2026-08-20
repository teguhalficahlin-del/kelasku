/**
 * sw.js — Service Worker seluruh aplikasi MiClass.
 *
 * Diletakkan di root situs (bukan di /guru/) karena dua alasan:
 *   1. Cakupannya harus meliputi start_url manifest agar aplikasi dapat dipasang
 *      di layar utama. Service worker sebelumnya hanya bercakup /guru/.
 *   2. Portal siswa dan ortu ikut mendapat kemampuan offline yang sama.
 *
 * Strategi:
 * - Network First untuk kode aplikasi (js/css/html) — versi terbaru selalu
 *   menang saat online, cache hanya cadangan saat offline.
 * - Cache First untuk aset statis (ikon, font, gambar).
 * - Network Only untuk Supabase API.
 *
 * PENTING — naikkan CACHE_NAME setiap kali kode aplikasi berubah.
 * Handler `activate` menghapus semua cache bernama lain.
 */
'use strict';

const CACHE_NAME = 'miclass-v2';

// Relatif terhadap lokasi sw.js, sehingga tidak bergantung pada nama repo.
const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

const SUPABASE_HOSTS = ['supabase.co', 'supabase.in', 'supabase.com'];

/**
 * Ambil dari jaringan dengan validasi wajib ke server.
 *
 * cache:'no-cache' memaksa browser mengirim permintaan bersyarat
 * (If-None-Match). GitHub Pages menyetel Cache-Control max-age=600, jadi tanpa
 * ini browser boleh menyajikan berkas hingga 10 menit lama dari cache HTTP-nya
 * sendiri — di luar kendali service worker. Dengan ETag, berkas yang tidak
 * berubah dijawab 304 tanpa badan, sehingga biayanya nyaris nol sementara
 * kesegarannya dijamin setiap kali.
 *
 * Ini yang membuat pembaruan tidak pernah tertahan: bukan hanya melewati cache
 * service worker, tetapi juga cache HTTP browser.
 */
function ambilSegar(request) {
  return fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
}

function isSupabaseRequest(url) {
  try {
    const host = new URL(url).hostname;
    return SUPABASE_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch (_) {
    return false;
  }
}

function isAppCode(url) {
  try {
    return /\.(js|css|html)$/.test(new URL(url).pathname);
  } catch (_) {
    return false;
  }
}

function isStaticAsset(url) {
  try {
    return /\.(woff2?|png|jpe?g|webp|svg|ico|webmanifest)$/.test(new URL(url).pathname);
  } catch (_) {
    return false;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(err =>
        console.warn('[sw] precache sebagian gagal:', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = request.url;

  // NETWORK ONLY — panggilan Supabase tidak boleh di-cache
  if (isSupabaseRequest(url)) return;

  // Navigasi (membuka halaman): network dulu, cache sebagai cadangan offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      ambilSegar(request)
        .then(response => {
          if (response && response.status === 200) {
            const salinan = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, salinan));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./')))
    );
    return;
  }

  // NETWORK FIRST — kode aplikasi
  if (isAppCode(url)) {
    event.respondWith(
      ambilSegar(request)
        .then(response => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const salinan = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, salinan));
          }
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || Response.error()))
    );
    return;
  }

  // STALE-WHILE-REVALIDATE — aset statis (ikon, font, gambar)
  // Disajikan cepat dari cache, tetapi selalu diperbarui di latar belakang.
  // Sebelumnya cache-first murni: ikon yang diganti tidak akan pernah tampil
  // baru selama cache-nya masih ada.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const jaringan = fetch(request).then(response => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const salinan = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, salinan));
          }
          return response;
        }).catch(() => cached || Response.error());
        return cached || jaringan;
      })
    );
    return;
  }

  // Sisanya: network dulu, cache bila offline.
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then(cached => cached || Response.error()))
  );
});
