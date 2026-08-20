/**
 * pwa.js — pendaftaran service worker + bantuan pemasangan ke layar utama.
 *
 * Dimuat oleh semua halaman masuk. Satu berkas agar tag di tiap halaman cukup
 * satu baris, dan agar perilaku pemasangan seragam di seluruh portal.
 *
 * Android/Chrome : menampilkan tombol "Install" saat browser menyatakan
 *                  aplikasi memenuhi syarat (event beforeinstallprompt).
 * iOS/Safari     : tidak punya event itu sama sekali — pemasangan hanya lewat
 *                  menu Bagikan. Karena itu ditampilkan petunjuk singkat.
 */
(function () {
  'use strict';

  // Lokasi sw.js dan cakupannya diturunkan dari lokasi berkas ini, sehingga
  // tidak bergantung pada nama repo maupun kedalaman folder halaman pemanggil.
  var akar = new URL('../../', document.currentScript.src).href;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      // updateViaCache:'none' -> berkas sw.js sendiri tidak pernah diambil dari
      // cache HTTP. Tanpa ini, perubahan pada service worker bisa tertahan
      // selama masa berlaku Cache-Control yang disetel GitHub Pages.
      navigator.serviceWorker.register(akar + 'sw.js', {
        scope: akar,
        updateViaCache: 'none',
      }).then(function (reg) {
        // Paksa pemeriksaan pembaruan setiap halaman dibuka, bukan menunggu
        // jadwal pemeriksaan bawaan browser.
        reg.update();

        // Dan setiap kali pengguna kembali ke tab ini. Guru sering membiarkan
        // aplikasi terbuka berjam-jam; tanpa ini mereka tetap memegang service
        // worker lama sampai benar-benar memuat ulang halaman.
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') reg.update();
        });
      }).catch(function (e) {
        console.warn('[pwa] pendaftaran service worker gagal:', e);
      });
    });
  }

  function sudahTerpasang() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  function iniIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
           // iPadOS 13+ menyamar sebagai desktop Safari
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  // Di iOS, hanya Safari yang dapat menambahkan ke layar utama. Chrome, Firefox,
  // dan Edge versi iOS memakai mesin yang sama tetapi tidak menyediakan menu itu,
  // sehingga petunjuk "buka menu Bagikan" justru menyesatkan di sana.
  function iniSafariIos() {
    return iniIos() && !/crios|fxios|edgios|opios/i.test(navigator.userAgent);
  }

  function buatBilah(isiHtml) {
    var bar = document.createElement('div');
    bar.id = 'pwa-install-bar';
    bar.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:9999;' +
      'display:flex;align-items:center;gap:.75rem;' +
      'padding:.75rem 1rem;background:#13131A;color:#F5F5F7;' +
      'border-top:1px solid rgba(212,175,55,.35);' +
      'font-family:inherit;font-size:.875rem;box-shadow:0 -4px 16px rgba(0,0,0,.4)';
    bar.innerHTML = isiHtml;
    document.body.appendChild(bar);

    var tutup = bar.querySelector('#pwa-tutup');
    if (tutup) {
      tutup.addEventListener('click', function () {
        bar.remove();
        try { localStorage.setItem('pwa_bilah_ditutup', '1'); } catch (_) {}
      });
    }
    return bar;
  }

  function pernahDitutup() {
    try { return localStorage.getItem('pwa_bilah_ditutup') === '1'; } catch (_) { return false; }
  }

  if (sudahTerpasang() || pernahDitutup()) return;

  // ── Android / Chrome ──────────────────────────────────────────────────────
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    var prompt = e;

    var bar = buatBilah(
      '<span style="flex:1">Install MiClass untuk membukanya langsung dari layar utama.</span>' +
      '<button id="pwa-install" style="padding:.4rem .9rem;border:none;border-radius:.35rem;' +
      'background:#D4AF37;color:#0A0A0F;font-weight:600;cursor:pointer;font-family:inherit">Install</button>' +
      '<button id="pwa-tutup" aria-label="Tutup" style="background:transparent;border:none;' +
      'color:#9A9AA5;font-size:1.25rem;line-height:1;cursor:pointer;padding:0 .25rem">&times;</button>'
    );

    bar.querySelector('#pwa-install').addEventListener('click', function () {
      bar.remove();
      prompt.prompt();
    });
  });

  // ── iOS / Safari ──────────────────────────────────────────────────────────
  // Tidak ada API pemasangan di iOS; satu-satunya jalan adalah menu Bagikan.
  if (iniSafariIos()) {
    window.addEventListener('load', function () {
      buatBilah(
        '<span style="flex:1">Install ke layar utama: ketuk tombol <strong>Bagikan</strong> ' +
        'di bilah Safari, lalu pilih <strong>Tambahkan ke Layar Utama</strong>.</span>' +
        '<button id="pwa-tutup" aria-label="Tutup" style="background:transparent;border:none;' +
        'color:#9A9AA5;font-size:1.25rem;line-height:1;cursor:pointer;padding:0 .25rem">&times;</button>'
      );
    });
  }
}());
