import { test, expect } from '@playwright/test';
import { loginGuru, envHilang } from '../fixtures/auth.js';

const WAJIB = ['TEST_BASE_URL', 'TEST_GURU_EMAIL', 'TEST_GURU_PASSWORD'];

/**
 * Buka kelas pertama dari dashboard guru.
 *
 * Kartu kelas BUKAN tautan: satu-satunya handler padanya adalah accordion yang
 * membuka dan menutup badan kartu (guru.js, listener pada .card-header).
 * Tautan ke classroom.html ada di dalam badan itu — dan badannya tersembunyi
 * secara bawaan. Test yang mengklik kartunya lalu menunggu perpindahan halaman
 * akan menunggu selamanya, dan itu bukan cacat aplikasi melainkan salah paham
 * tentang alurnya. Urutan di bawah meniru apa yang benar-benar dilakukan guru.
 */
async function bukaKelasPertama(page) {
  const kartu = page.locator('#classroom-list .classroom-card').first();
  await expect(kartu).toBeVisible({ timeout: 20000 });

  const badan = kartu.locator('.card-body-collapse');
  // Kartu pertama dibuka otomatis oleh dashboard; klik hanya bila masih tertutup,
  // sebab mengklik kartu yang sudah terbuka justru menutupnya.
  if (!(await badan.isVisible())) {
    await kartu.locator('.card-header').click();
  }
  await expect(badan).toBeVisible({ timeout: 10000 });

  await kartu.locator('a.btn-kelola').click();
  await page.waitForURL(/classroom\.html/, { timeout: 20000 });
}

/**
 * Buka satu section collapse di dalam tab, berdasarkan judul di h2-nya.
 *
 * Panel di tab Jadwal & Absensi dibungkus initCollapseSections (classroom.js):
 * hanya panel pertama yang terbuka, sisanya display:none. Jadi
 * "Absensi Hari Ini" tertutup saat tab baru dibuka — wadahnya ada di DOM tapi
 * hidden, dan menunggunya terlihat tanpa membukanya akan gagal selamanya.
 */
async function bukaPanel(page, judul) {
  const panel = page.locator('.panel', {
    has: page.locator('h2.panel-header', { hasText: judul }),
  }).first();
  await expect(panel).toBeVisible({ timeout: 20000 });

  const badan = panel.locator('.panel-body-collapse');
  // Mengklik header panel yang sudah terbuka justru menutupnya, dan keadaan
  // awalnya diingat localStorage — jadi klik hanya bila memang masih tertutup.
  if (!(await badan.isVisible())) {
    await panel.locator('h2.panel-header').click();
  }
  await expect(badan).toBeVisible({ timeout: 10000 });
  return panel;
}

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
    await bukaKelasPertama(page);

    await page.click('#tab-jadwal');
    await expect(page.locator('#panel-jadwal')).toBeVisible();

    await bukaPanel(page, 'Absensi Hari Ini');
    await expect(page.locator('#absensi-container')).toBeVisible();
  });

  // Regresi: tanda absensi pernah hilang begitu guru berpindah tab dan kembali.
  test('tanda absensi bertahan setelah pindah tab dan kembali', async ({ page }) => {
    await bukaKelasPertama(page);
    await page.click('#tab-jadwal');
    await bukaPanel(page, 'Absensi Hari Ini');

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

  // Regresi FIX-A: penanda "sudah dirender" pernah dipasang sebelum render
  // selesai, sehingga satu kegagalan memuat mengunci panel absensi kosong
  // sampai halaman dimuat ulang — pindah tab berapa kali pun tidak menolong.
  test('panel absensi tidak terkunci setelah gagal memuat', async ({ page }) => {
    await bukaKelasPertama(page);

    // Jatuhkan permintaan jadwal supaya render pertama benar-benar gagal.
    await page.route('**/rest/v1/schedules**', route => route.abort());

    await page.click('#tab-jadwal');
    await bukaPanel(page, 'Absensi Hari Ini');
    await expect(page.locator('#absensi-container'))
      .toContainText('Gagal memuat absensi', { timeout: 20000 });

    // Jaringan pulih; guru cukup membuka kembali tab ini.
    await page.unroute('**/rest/v1/schedules**');
    await page.click('#tab-catatan');
    await expect(page.locator('#panel-catatan')).toBeVisible();
    await page.click('#tab-jadwal');

    // Panel memuat ulang dengan sendirinya: pesan gagalnya hilang, diganti isi
    // yang sebenarnya — entah kartu sesi, entah keterangan tidak ada jadwal.
    await expect(page.locator('#absensi-container'))
      .not.toContainText('Gagal memuat absensi', { timeout: 20000 });
  });

  // Regresi BUG-REG-1: fan-out pengumuman harus kembali menjadi SATU kartu.
  test('pengumuman muncul sebagai satu kartu, bukan satu per siswa', async ({ page }) => {
    await bukaKelasPertama(page);
    await page.click('#tab-catatan');

    const isi = 'Uji otomatis pengumuman ' + Date.now();

    await page.check('#notes-pengumuman');
    // terapkanModePengumuman() melepas atribut required dari dropdown siswa dan
    // menonaktifkannya. Tanpa menunggu itu selesai, submit bisa terjadi lebih
    // dulu dan ditolak validasi bawaan browser pada <select> yang required tapi
    // kosong — tanpa pesan apa pun, sehingga gejalanya hanya "status tetap
    // kosong" dan penyebabnya tidak terbaca sama sekali.
    await expect(page.locator('#notes-student-select')).toBeDisabled({ timeout: 10000 });

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
