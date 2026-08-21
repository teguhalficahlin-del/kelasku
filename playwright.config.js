import { defineConfig } from '@playwright/test';

// Last verified: 2026-08-21

// baseURL menunjuk ke akar aplikasi, termasuk awalan nama repo di GitHub Pages
// (mis. https://teguhalficahlin-del.github.io/kelasku). Semua spec memakai path
// relatif tanpa garis miring di depan supaya tetap benar di domain sendiri.
//
// Garis miring penutup WAJIB, dan ditambahkan di sini supaya tidak bergantung
// pada cara orang mengisi secret-nya. Tanpa itu, resolusi URL relatif membuang
// segmen terakhir: 'admin/index.html' terhadap '.../kelasku' menghasilkan
// '.../admin/index.html' — tanpa nama repo, HTTP 404, dan setiap test gagal
// dengan gejala menyesatkan ("selector tidak ditemukan") padahal yang salah
// adalah alamatnya.
const baseURL = process.env.TEST_BASE_URL
  ? process.env.TEST_BASE_URL.replace(/\/*$/, '/')
  : undefined;

export default defineConfig({
  testDir: './tests/specs',
  // Satu test bisa memuat halaman, login, lalu menunggu beberapa panggilan
  // jaringan; 30 detik terlalu ketat untuk runner CI yang jaringannya lebih
  // lambat daripada mesin pengembang.
  timeout: 60000,
  retries: 1,

  // Satu worker: seluruh spec berbagi satu classroom uji yang sama, dan test
  // yang menulis (pengumuman, absensi, pesan) akan saling menimpa kalau
  // dijalankan berbarengan.
  workers: 1,

  use: {
    baseURL,
    navigationTimeout: 30000,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],

  reporter: [
    ['html', { open: 'never' }],
    ['github'],
    ['list'],
  ],
});
