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

const CACHE_NAME = 'miclass-v4';

// Relatif terhadap lokasi sw.js, sehingga tidak bergantung pada nama repo.
//
// WAJIB — tanpa berkas ini aplikasi tidak dapat berjalan sama sekali. Kegagalan
// menyimpannya membatalkan instalasi service worker: lebih baik service worker
// lama tetap melayani daripada yang baru aktif dengan cache separuh jadi.
const PRECACHE_WAJIB = [
  './',
  'index.html',
  'manifest.webmanifest',
  // Pustaka Supabase — satu-satunya dependensi keras. Sebelumnya diambil dari
  // CDN jsdelivr, sehingga jaringan sekolah yang memblokir CDN membuat seluruh
  // halaman gagal total.
  'shared/js/vendor/supabase-js-2.112.3.umd.js',
  'shared/js/supabase.js',
  'shared/js/config.js',
  'shared/js/custom-select.js',
  // Portal guru — halaman kerja utama.
  'guru/classroom.html',
  'guru/dashboard.html',
  'guru/index.html',
  'guru/css/guru.css',
  'shared/css/design-system.css',
  'shared/css/components.css',
  'guru/js/api.js',
  'guru/js/guru.js',
  'guru/js/classroom.js',
  'guru/js/classroom-schedule.js',
  'guru/js/classroom-attendance.js',
  'guru/js/classroom-notes.js',
  // Pemulihan password. Tujuan tautan dari email, jadi kerap dibuka di
  // perangkat dan jaringan yang berbeda dari sesi kerja biasa — justru saat
  // guru sedang terkunci di luar aplikasi.
  'guru/reset-password.html',
  'guru/js/reset-password.js',
];

// OPSIONAL — enak kalau ada, tetapi aplikasi tetap jalan tanpanya. Kegagalan
// menyimpan salah satunya tidak membatalkan instalasi.
const PRECACHE_OPSIONAL = [
  'icons/icon-192.png',
  'icons/icon-512.png',
  'shared/js/pwa.js',
  'shared/js/xlsx.full.min.js',
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
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Berkas opsional: kegagalan diabaikan, satu per satu supaya satu berkas
    // yang hilang tidak menjatuhkan sisanya.
    await Promise.all(PRECACHE_OPSIONAL.map(url =>
      cache.add(url).catch(err =>
        console.warn('[sw] precache opsional gagal:', url, err))));

    // Berkas wajib: kegagalan menggagalkan seluruh instalasi. Sebelumnya
    // kegagalan hanya dicatat console.warn lalu skipWaiting() tetap dijalankan,
    // sehingga service worker baru aktif dengan cache separuh jadi — dan yang
    // lama, yang cache-nya utuh, sudah telanjur dibuang oleh handler activate.
    await cache.addAll(PRECACHE_WAJIB);

    await self.skipWaiting();
  })());
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
