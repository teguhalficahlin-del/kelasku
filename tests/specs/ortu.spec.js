import { test, expect } from '@playwright/test';
import { loginOrtu, envHilang } from '../fixtures/auth.js';

const WAJIB = ['TEST_BASE_URL', 'TEST_KODE_KELAS', 'TEST_SISWA_NAMA', 'TEST_SISWA_NIS'];

/** Buka satu bagian collapse berdasarkan judulnya, lalu kembalikan wadahnya. */
async function bukaBagian(page, judul) {
  const bagian = page.locator('.notes-section', {
    has: page.locator('.sch-section-title', { hasText: judul }),
  }).first();
  await expect(bagian).toBeVisible({ timeout: 15000 });
  await bagian.locator('.sch-section-title').click();
  return bagian;
}

test.describe('Portal Ortu', () => {
  test.beforeEach(async ({ page }) => {
    const hilang = envHilang(...WAJIB);
    test.skip(hilang.length > 0, 'Kredensial belum diisi: ' + hilang.join(', '));
    await loginOrtu(page);
  });

  test('login berhasil dan mendarat di dashboard', async ({ page }) => {
    await expect(page).toHaveURL(/ortu\/dashboard\.html/);
  });

  test('dashboard menampilkan data anak', async ({ page }) => {
    const daftar = page.locator('#classroom-list');
    await expect(daftar).toBeVisible();
    await expect(daftar.locator('.classroom-card').first()).toBeVisible({ timeout: 15000 });
  });

  test('kirim pesan ke guru berhasil', async ({ page }) => {
    const bagian = await bukaBagian(page, 'Pesan');

    const isi = 'Uji otomatis pesan ortu ' + Date.now();
    await bagian.locator('textarea').fill(isi);
    await bagian.locator('button', { hasText: 'Kirim' }).click();

    // Konfirmasi pengiriman, lalu pesannya benar-benar muncul di percakapan.
    await expect(bagian.locator('span', { hasText: 'Terkirim.' })).toBeVisible({ timeout: 20000 });
    await expect(bagian.locator('.note-item-content', { hasText: isi })).toBeVisible();
  });

  test('catatan tampil dengan visibilitas yang benar', async ({ page }) => {
    const bagian = await bukaBagian(page, 'Catatan dari Guru');

    const item = bagian.locator('.note-item').first();
    await expect(item).toBeVisible({ timeout: 15000 });

    // Portal ortu hanya menarik baris is_visible_to_parent = true, jadi setiap
    // catatan harus berlabel salah satu dari dua kemungkinan itu — tidak pernah
    // "Siswa saja".
    await expect(item.locator('.note-item-meta')).toContainText(/Siswa & Ortu|Ortu saja/);
  });
});
