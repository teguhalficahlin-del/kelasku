/**
 * config.js — satu tempat untuk nilai yang bergantung pada tempat aplikasi
 * di-host.
 *
 * Sebelumnya path '/kelasku' ditanam langsung di classroom.js. Begitu aplikasi
 * dipindah ke domain sendiri, seluruh QR dan link berbagi yang sudah terlanjur
 * dibagikan guru ke siswa dan orang tua akan mati serentak — dan tidak ada
 * cara menariknya kembali.
 *
 * APP_BASE_PATH diturunkan dari lokasi berkas ini, bukan ditulis tetap:
 * config.js berada di <akar>/shared/js/, jadi naik dua tingkat selalu
 * menghasilkan akar aplikasi yang benar — di GitHub Pages dengan awalan nama
 * repo maupun di domain sendiri tanpa awalan. Pindah host tidak lagi menuntut
 * perubahan kode.
 *
 * Berkas ini harus dimuat sebelum berkas lain yang memakainya.
 */
(function () {
  'use strict';

  var akar = new URL('../../', document.currentScript.src);

  // Tanpa garis miring penutup, agar pemakainya menulis APP_BASE_PATH + '/siswa/'
  // dengan bentuk yang sama seperti sebelumnya.
  var path = akar.pathname.replace(/\/$/, '');

  window.SIP_CONFIG = {
    // Contoh: 'https://teguhalficahlin-del.github.io/kelasku'
    APP_BASE_URL:  akar.origin + path,
    APP_BASE_PATH: path,
  };
}());
