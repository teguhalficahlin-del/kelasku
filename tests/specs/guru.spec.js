import { test, expect } from '@playwright/test';
import { loginGuru, envHilang } from '../fixtures/auth.js';

const WAJIB = ['TEST_BASE_URL', 'TEST_GURU_EMAIL', 'TEST_GURU_PASSWORD'];

test.describe('Portal Guru', () => {
  test.beforeEach(async ({ page }) => {
    const hilang = envHilang(...WAJIB);
    test.skip(hilang.length > 0, 'Kredensial belum diisi: ' + hilang.join(', '));
    await loginGuru(page);
  });

  test('login berhasil dan mendarat di dashboard', async ({ page }) => {
    await expect(page).toHaveURL(/guru\/dashboard\.html/);
  });

  test('dashboard menampilkan daftar kelas', async ({ page }) => {
    const daftar = page.locator('#classroom-list');
    await expect(daftar).toBeVisible();
    // Kartu kelas, bukan pesan kosong — akun uji memang punya satu kelas.
    await expect(daftar.locator('.classroom-card').first()).toBeVisible({ timeout: 15000 });
  });

  test('buka kelas lalu tab Jadwal & Absensi tampil', async ({ page }) => {
    await page.locator('#classroom-list .classroom-card').first().click();
    await page.waitForURL(/classroom\.html/, { timeout: 20000 });

    await page.click('#tab-jadwal');
    await expect(page.locator('#panel-jadwal')).toBeVisible();
    await expect(page.locator('#absensi-container')).toBeVisible();
  });

  // Regresi: tanda absensi pernah hilang begitu guru berpindah tab dan kembali.
  test('tanda absensi bertahan setelah pindah tab dan kembali', async ({ page }) => {
    await page.locator('#classroom-list .classroom-card').first().click();
    await page.waitForURL(/classroom\.html/, { timeout: 20000 });
    await page.click('#tab-jadwal');

    const kartu = page.locator('#absensi-container .abs-card');
    const jml   = await kartu.count();
    test.skip(jml === 0,
      'Kelas uji belum punya jadwal hari ini — panel absensi kosong. ' +
      'Tambahkan jadwal untuk hari ini di kelas uji agar test ini berjalan.');

    // Absensi hanya bisa diisi selama sesi berlangsung dan satu jam sesudahnya
    // (sessionStatus AKTIF atau KOREKSI di classroom-attendance.js). Di luar
    // jendela itu tombolnya memang disabled — itu perilaku yang benar, bukan
    // regresi. Tanpa pemeriksaan ini, test akan merah setiap kali CI kebetulan
    // jalan di jam yang salah, dan kegagalan palsu lebih buruk daripada tidak
    // ada test sama sekali.
    const tombolPertama = kartu.first().locator('.abs-status-btn[data-status="SAKIT"]');
    test.skip(await tombolPertama.isDisabled(),
      'Sesi absensi sedang di luar jendela pengisian (bukan AKTIF maupun ' +
      'KOREKSI). Jalankan saat ada sesi berlangsung, atau sampai satu jam ' +
      'setelah sesi berakhir.');

    const sasaran = Math.min(3, jml);
    for (let i = 0; i < sasaran; i++) {
      await kartu.nth(i).locator('.abs-status-btn[data-status="SAKIT"]').click();
    }
    // Tunggu simpan ke server sebelum berpindah tab.
    for (let i = 0; i < sasaran; i++) {
      await expect(kartu.nth(i).locator('.abs-status-btn[data-status="SAKIT"]'))
        .toHaveClass(/active/, { timeout: 10000 });
    }

    await page.click('#tab-catatan');
    await expect(page.locator('#panel-catatan')).toBeVisible();
    await page.click('#tab-jadwal');

    for (let i = 0; i < sasaran; i++) {
      await expect(kartu.nth(i).locator('.abs-status-btn[data-status="SAKIT"]'))
        .toHaveClass(/active/, { timeout: 15000 });
    }
  });

  // Regresi BUG-REG-1: fan-out pengumuman harus kembali menjadi SATU kartu.
  test('pengumuman muncul sebagai satu kartu, bukan satu per siswa', async ({ page }) => {
    await page.locator('#classroom-list .classroom-card').first().click();
    await page.waitForURL(/classroom\.html/, { timeout: 20000 });
    await page.click('#tab-catatan');

    const isi = 'Uji otomatis pengumuman ' + Date.now();

    await page.check('#notes-pengumuman');
    await page.fill('#notes-content', isi);
    await page.check('#notes-vis-student');
    await page.locator('#notes-form button[type=submit]').click();

    await expect(page.locator('#notes-status')).toContainText('Pengumuman terkirim', { timeout: 20000 });

    // Persis satu kartu memuat teks itu, dan kartunya berlabel pengumuman.
    const kartu = page.locator('#notes-list .note-card', { hasText: isi });
    await expect(kartu).toHaveCount(1);
    await expect(kartu.locator('.note-student-name')).toContainText('Pengumuman kelas');
  });

  test('Lupa password membuka form reset inline, bukan halaman baru', async ({ page }) => {
    await page.goto('guru/index.html');
    // Sesi aktif akan melempar ke dashboard; mulai dari keadaan bersih.
    await page.evaluate(() => localStorage.clear());
    await page.goto('guru/index.html');

    await page.click('#link-lupa');

    await expect(page.locator('#reset-panel')).toBeVisible();
    await expect(page.locator('#form-login')).toBeHidden();
    await expect(page).toHaveURL(/guru\/index\.html/);
  });

  // Regresi FIX-1: halaman reset hanya boleh dimasuki lewat tautan email.
  test('reset-password.html tanpa token menolak meski sesi tersimpan', async ({ page }) => {
    await page.goto('guru/reset-password.html');

    await expect(page.locator('#state-gagal')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#gagal-msg')).toContainText('tidak berlaku');
    await expect(page.locator('#state-form')).toBeHidden();
  });
});
