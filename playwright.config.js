import { defineConfig } from '@playwright/test';

// baseURL menunjuk ke akar aplikasi, termasuk awalan nama repo di GitHub Pages
// (mis. https://teguhalficahlin-del.github.io/kelasku). Semua spec memakai path
// relatif tanpa garis miring di depan supaya tetap benar di domain sendiri.
const baseURL = process.env.TEST_BASE_URL;

export default defineConfig({
  testDir: './tests/specs',
  timeout: 30000,
  retries: 1,

  // Satu worker: seluruh spec berbagi satu classroom uji yang sama, dan test
  // yang menulis (pengumuman, absensi, pesan) akan saling menimpa kalau
  // dijalankan berbarengan.
  workers: 1,

  use: {
    baseURL,
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
