import { test, expect } from '@playwright/test';
import { loginSiswa, envHilang } from '../fixtures/auth.js';

const WAJIB = ['TEST_BASE_URL', 'TEST_KODE_KELAS', 'TEST_SISWA_NAMA', 'TEST_SISWA_NIS'];

test.describe('Portal Siswa', () => {
  test.beforeEach(async ({ page }) => {
    const hilang = envHilang(...WAJIB);
    test.skip(hilang.length > 0, 'Kredensial belum diisi: ' + hilang.join(', '));
    await loginSiswa(page);
  });

  test('login berhasil dan mendarat di dashboard', async ({ page }) => {
    await expect(page).toHaveURL(/siswa\/dashboard\.html/);
  });

  test('dashboard menampilkan kartu kelas', async ({ page }) => {
    const daftar = page.locator('#classroom-list');
    await expect(daftar).toBeVisible();
    await expect(daftar.locator('.classroom-card').first()).toBeVisible({ timeout: 15000 });
  });

  test('catatan dari guru tampil', async ({ page }) => {
    const bagian = page.locator('.notes-section').first();
    await expect(bagian).toBeVisible({ timeout: 15000 });
    // Bagian ini collapsed secara bawaan — buka dulu lewat judulnya.
    await bagian.locator('.sch-section-title').click();
    await expect(bagian.locator('.note-item').first()).toBeVisible({ timeout: 15000 });
  });

  // Regresi FIX-2: pengumuman harus terbaca berbeda dari catatan pribadi.
  test('pengumuman tampil dengan badge Pengumuman Kelas', async ({ page }) => {
    const bagian = page.locator('.notes-section').first();
    await expect(bagian).toBeVisible({ timeout: 15000 });
    await bagian.locator('.sch-section-title').click();
    await expect(bagian.locator('.note-item').first()).toBeVisible({ timeout: 15000 });

    const badge = bagian.locator('.note-badge-pengumuman');
    const ada   = await badge.count();
    test.skip(ada === 0,
      'Belum ada pengumuman ber-announcement_id di kelas uji. ' +
      'Kirim satu pengumuman dari portal guru lebih dulu — pengumuman lama ' +
      'bernilai NULL dan memang tampil sebagai catatan biasa.');

    await expect(badge.first()).toContainText('Pengumuman Kelas');
  });

  // Regresi FIX-P1: permintaan nilai wajib membawa penyaring student_id, dan
  // isinya harus persis baris roster milik siswa yang login.
  //
  // Ini menguji BENTUK permintaan, bukan penolakan server. Membuktikan RLS
  // benar-benar menolak pembacaan nilai siswa lain menuntut siswa kedua di
  // kelas uji, yang belum ada di fixture — lihat backlog terpisah.
  //
  // Penyadapnya dipasang lebih dulu lalu halaman dimuat ulang, sebab beforeEach
  // sudah selesai login dan permintaan pertamanya lewat sebelum test ini mulai.
  test('nilai hanya menampilkan milik siswa yang login', async ({ page }) => {
    const menungguRoster = page.waitForResponse(
      r => r.url().includes('/rest/v1/classroom_roster'), { timeout: 20000 });
    const menungguNilai = page.waitForRequest(
      r => r.url().includes('/rest/v1/assessment_results'), { timeout: 20000 });

    await page.reload();

    const rosterIds = (await (await menungguRoster).json()).map(r => r.id);
    expect(rosterIds.length).toBeGreaterThan(0);

    const url = decodeURIComponent((await menungguNilai).url());
    expect(url).toContain('student_id=in.');

    // student_id=in.(uuid,uuid) — tanda kutip dibuang untuk berjaga-jaga bila
    // PostgREST kelak mengutip nilainya.
    const cocok = url.match(/student_id=in\.\(([^)]*)\)/);
    expect(cocok).not.toBeNull();
    const dipakai = cocok[1].split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);

    expect(dipakai.length).toBeGreaterThan(0);
    for (const id of dipakai) expect(rosterIds).toContain(id);
  });
});
