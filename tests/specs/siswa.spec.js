import { test, expect } from '@playwright/test';
import { loginSiswa, loginSiswa2, tokenSesi, KUNCI_SESI, envHilang } from '../fixtures/auth.js';
import {
  tokenGuru, kelasUji, rosterByNis, bersihkanPenilaianUji, buatPenilaianUji,
  nilaiRosterMentah,
} from '../fixtures/db.js';

const WAJIB = ['TEST_BASE_URL', 'TEST_KODE_KELAS', 'TEST_SISWA_NAMA', 'TEST_SISWA_NIS'];

// Tambahan khusus test negatif: butuh siswa kedua sebagai subjek "siswa lain",
// dan kredensial guru untuk menyiapkan nilai miliknya.
const WAJIB_NEGATIF = [
  'TEST_GURU_EMAIL', 'TEST_GURU_PASSWORD', 'TEST_SISWA2_NAMA', 'TEST_SISWA2_NIS',
];

let _tokenGuru = null;
let _kelas     = null;
let _roster2   = null;
let _siapNegatif = false;

test.describe('Portal Siswa', () => {
  test.beforeAll(async () => {
    if (envHilang(...WAJIB, ...WAJIB_NEGATIF).length > 0) return;
    _tokenGuru = await tokenGuru();
    _kelas     = await kelasUji(_tokenGuru);
    // Sapu sisa run yang mati sebelum sempat membersihkan, supaya penilaian
    // bertanda uji tidak menumpuk di kelas sungguhan.
    await bersihkanPenilaianUji(_tokenGuru, _kelas.id);
    _roster2 = await rosterByNis(_tokenGuru, _kelas.id, process.env.TEST_SISWA2_NIS);
    await buatPenilaianUji(_tokenGuru, _kelas, _roster2.id);
    _siapNegatif = true;
  });

  test.afterAll(async () => {
    if (_tokenGuru && _kelas) await bersihkanPenilaianUji(_tokenGuru, _kelas.id);
  });

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
    // Dashboard menanyakan classroom_roster dua kali. Yang pertama milik
    // getClassrooms() dan memilih 'nama_ortu, classrooms(...)' — barisnya tidak
    // punya kolom id sama sekali. Yang dicari di sini adalah permintaan kedua,
    // milik getMyRosterIds(), yang memilih persis kolom id. Tanpa pembeda ini
    // penyadapnya menangkap yang pertama dan rosterIds berisi [undefined].
    const menungguRoster = page.waitForResponse(
      r => r.url().includes('/rest/v1/classroom_roster')
        && /[?&]select=id(&|$)/.test(decodeURIComponent(r.url())),
      { timeout: 20000 });
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

  // Test negatif sejati untuk FIX-P1: yang diuji adalah apa yang SERVER izinkan
  // dibaca, bukan apa yang klien pilih untuk ditampilkan. Permintaannya
  // dikirim langsung ke REST API memakai token sesi siswa pertama, sehingga
  // penyaring .in() di dashboard sama sekali tidak ikut campur.
  //
  // Kontrolnya penting: baris nilai milik siswa kedua dipastikan memang ada dan
  // memang terbaca oleh siswa kedua sendiri. Tanpa itu, hasil kosong pada siswa
  // pertama tidak membuktikan apa-apa — bisa saja barisnya tidak pernah ada.
  test('siswa lain tidak bisa membaca nilai siswa kedua', async ({ page, browser }) => {
    test.skip(!_siapNegatif,
      'Penyiapan dilewati — butuh ' + WAJIB_NEGATIF.join(', ') + '.');

    // (1) Siswa pertama: harus kosong, dan harus 200 — ditolak RLS berarti
    //     baris tidak terlihat, bukan permintaan yang error.
    const tokenSiswa1 = await tokenSesi(page, KUNCI_SESI.siswa);
    expect(tokenSiswa1).toBeTruthy();

    const dilihatSiswa1 = await nilaiRosterMentah(tokenSiswa1, _kelas.id, _roster2.id);
    expect(dilihatSiswa1.status).toBe(200);
    expect(dilihatSiswa1.body).toEqual([]);

    // (2) Siswa kedua atas barisnya sendiri: harus ada. Konteks terpisah supaya
    //     sesi siswa pertama di atas tidak tertimpa.
    const konteks2 = await browser.newContext();
    try {
      const halaman2 = await konteks2.newPage();
      await loginSiswa2(halaman2);
      const tokenSiswa2 = await tokenSesi(halaman2, KUNCI_SESI.siswa);
      expect(tokenSiswa2).toBeTruthy();

      const dilihatSiswa2 = await nilaiRosterMentah(tokenSiswa2, _kelas.id, _roster2.id);
      expect(dilihatSiswa2.status).toBe(200);
      expect(dilihatSiswa2.body.length).toBeGreaterThan(0);
    } finally {
      await konteks2.close();
    }
  });
});
