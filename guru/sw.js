/**
 * guru/sw.js — BATU NISAN.
 *
 * Service worker portal guru dipindahkan ke root situs (/sw.js) agar cakupannya
 * meliputi start_url manifest, syarat agar aplikasi dapat dipasang ke layar
 * utama. Berkas ini TIDAK boleh dihapus begitu saja: browser yang terlanjur
 * mendaftarkannya akan terus menjalankan salinan lama dari cache-nya sendiri,
 * dan menghapus berkas dari server tidak selalu mencabut pendaftaran itu.
 *
 * Isinya kini hanya membersihkan diri: buang seluruh cache lama, cabut
 * pendaftaran, lalu muat ulang halaman yang masih dikendalikannya agar
 * langsung beralih ke service worker root.
 *
 * Berkas ini boleh dihapus setelah cukup lama — perkiraan aman: satu semester,
 * ketika hampir semua perangkat sudah pernah membuka aplikasi lagi.
 */
'use strict';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.navigate(c.url));
  })());
});

// Tanpa handler fetch: seluruh permintaan langsung ke jaringan.
