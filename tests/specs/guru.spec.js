import { test, expect } from '@playwright/test';
import { loginGuru, envHilang } from '../fixtures/auth.js';
import {
  tokenGuru, kelasUji, bersihkanJadwalUji, buatJadwalHariIni, hariIniUtc,
} from '../fixtures/db.js';

const WAJIB = ['TEST_BASE_URL', 'TEST_GURU_EMAIL', 'TEST_GURU_PASSWORD'];

// Diisi beforeAll: id jadwal sepanjang hari yang dibuat khusus untuk test
// absensi, supaya sesinya selalu AKTIF dan testnya tidak lagi bergantung pada
// jam berapa CI kebetulan berjalan.
let _idJadwalUji = null;
let _tokenUji    = null;
let _kelasUji    = null;

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
  test.beforeAll(async () => {
    if (envHilang(...WAJIB, 'TEST_KODE_KELAS').length > 0) return;
    // schedules.day_of_week tidak mengenal AHAD, jadi pada hari Minggu UTC
    // jadwal uji memang tidak bisa dibuat — satu-satunya hari test absensi
    // masih melewatkan diri.
    if (hariIniUtc() === 'AHAD') return;

    _tokenUji = await tokenGuru();
    _kelasUji = await kelasUji(_tokenUji);
    // Sapu sisa run sebelumnya lebih dulu: run yang mati sebelum sempat
    // membersihkan tidak boleh menumpuk menjadi jadwal palsu di layar guru.
    await bersihkanJadwalUji(_tokenUji, _kelasUji.id);
    _idJadwalUji = await buatJadwalHariIni(_tokenUji, _kelasUji);
  });

  test.afterAll(async () => {
    if (!_tokenUji || !_kelasUji) return;
    await bersihkanJadwalUji(_tokenUji, _kelasUji.id);
  });

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

    test.skip(!_idJadwalUji,
      'Jadwal uji tidak dapat dibuat (hari Minggu UTC — schedules.day_of_week ' +
      'tidak mengenal AHAD).');

    // Sesi buatan test ini saja, dikenali lewat id jadwalnya. Kelas uji juga
    // punya jadwal sungguhan milik guru, dan mengisi absensi di sesi itu
    // berarti mengubah data yang bukan urusan test.
    const sesi = page.locator(`.abs-session[data-schedule-id="${_idJadwalUji}"]`);
    await expect(sesi).toBeVisible({ timeout: 20000 });

    // Badan sesi tertutup secara bawaan (single expand).
    const badanSesi = sesi.locator('.abs-session-body');
    if (!(await badanSesi.isVisible())) {
      await sesi.locator('.abs-sesi-header').click();
    }
    await expect(badanSesi).toBeVisible({ timeout: 10000 });

    const kartu = sesi.locator('.abs-card');
    const jml   = await kartu.count();
    expect(jml, 'kelas uji harus punya siswa berakun').toBeGreaterThan(0);

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

    // Tunggu insert-nya sendiri, bukan jendela waktu yang ditebak. Satu
    // pengumuman menjadi satu baris per siswa, dan status di layar baru terisi
    // setelah seluruh insert kembali — pada percobaan pertama yang "dingin" itu
    // bisa melewati batas berapa pun yang dipatok, lalu lulus di retry. Test
    // yang bergantung pada retry untuk hijau tidak membuktikan apa-apa.
    const [respons] = await Promise.all([
      page.waitForResponse(r =>
        r.url().includes('/rest/v1/student_notes') &&
        r.request().method() === 'POST'),
      page.locator('#notes-form button[type=submit]').click(),
    ]);
    expect(respons.status(), 'insert pengumuman harus diterima server').toBeLessThan(300);

    await expect(page.locator('#notes-status')).toContainText('Pengumuman terkirim');

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

  // Regresi FIX-P6: tombol simpan penilaian harus menunjukkan bahwa proses
  // sedang berjalan, lalu pulih sendiri ketika gagal.
  //
  // Permintaan simpannya ditahan sebentar lalu DIBATALKAN, bukan diteruskan.
  // Dua alasan: penundaannya membuat keadaan "sedang menyimpan" cukup lama
  // untuk diperiksa tanpa mengandalkan waktu, dan pembatalannya memastikan
  // tidak ada penilaian sungguhan yang tertulis ke kelas uji — suite ini
  // memang menulis ke kelas nyata (lihat tests/fixtures/db.js).
  test('simpan nilai menampilkan loading state lalu pulih', async ({ page }) => {
    await bukaKelasPertama(page);

    await page.click('#tab-penilaian');
    const panel = page.locator('#panel-penilaian');
    await expect(panel).toBeVisible({ timeout: 20000 });

    // Akun yang tidak aktif mendapat banner tier menggantikan seluruh panel;
    // itu bukan kegagalan FIX-P6, jadi dilewati dengan alasan yang jelas.
    if (await panel.locator('.upgrade-tier-banner').count() > 0) {
      test.skip(true, 'Akun guru uji tidak aktif — tab Penilaian diganti banner tier.');
    }

    // Tab dimuat lewat jaringan lebih dulu; tombolnya baru ada setelah itu.
    const tombolTambah = panel.locator('[data-action="add-asmt"]');
    await expect(tombolTambah).toBeAttached({ timeout: 20000 });

    // Daftar Penilaian tertutup secara bawaan, dan keadaannya diingat
    // localStorage — buka hanya bila memang masih tertutup.
    await bukaPanel(page, 'Daftar Penilaian');
    await expect(tombolTambah).toBeVisible({ timeout: 10000 });
    await tombolTambah.click();

    const simpan = page.locator('#btn-asmt-save');
    await expect(simpan).toBeVisible({ timeout: 10000 });
    const labelAsli = (await simpan.textContent()).trim();

    // Tahan permintaan pembuatan penilaian, lalu batalkan.
    await page.route('**/rest/v1/assessments*', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      await new Promise(r => setTimeout(r, 3000));
      await route.abort();
    });

    await simpan.click();

    // Selama tertahan: penanda proses terlihat dan tombolnya terkunci.
    await expect(simpan).toHaveText('Menyimpan…', { timeout: 5000 });
    await expect(simpan).toBeDisabled();

    // Setelah dibatalkan: label semula kembali dan tombol bisa dipakai lagi,
    // sebab pemulihannya ada di blok finally — bukan hanya di jalur sukses.
    await expect(simpan).toHaveText(labelAsli, { timeout: 15000 });
    await expect(simpan).toBeEnabled();
    await expect(page.locator('#asmt-err')).toBeVisible();
  });
});
