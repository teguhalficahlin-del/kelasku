import { test, expect } from '@playwright/test';
import { loginSiswa, loginSiswa2, tokenSesi, KUNCI_SESI, envHilang } from '../fixtures/auth.js';
import {
  tokenGuru, kelasUji, rosterByNis, bersihkanPenilaianUji, buatPenilaianUji,
  nilaiRosterMentah, buatAssessmentUjiKosong, simpanNilaiMentah,
} from '../fixtures/db.js';

const WAJIB = ['TEST_BASE_URL', 'TEST_KODE_KELAS', 'TEST_SISWA_NAMA', 'TEST_SISWA_NIS'];

// Tambahan khusus test negatif: butuh siswa kedua sebagai subjek "siswa lain",
// dan kredensial guru untuk menyiapkan nilai miliknya.
const WAJIB_NEGATIF = [
  'TEST_GURU_EMAIL', 'TEST_GURU_PASSWORD', 'TEST_SISWA2_NAMA', 'TEST_SISWA2_NIS',
];

let _tokenGuru   = null;
let _kelas       = null;
let _roster2     = null;
let _siapNegatif = false;
let _galatSetup  = null;

test.describe('Portal Siswa', () => {
  // Kegagalan penyiapan sengaja ditahan di sini, bukan dilempar keluar.
  // beforeAll yang melempar menjatuhkan SELURUH describe — pada run #15 satu
  // NIS yang tidak ketemu membuat 10 test yang sama sekali tidak berkaitan
  // ikut tidak berjalan. Yang boleh gagal hanyalah test yang benar-benar
  // bergantung pada penyiapan ini.
  test.beforeAll(async () => {
    if (envHilang(...WAJIB, ...WAJIB_NEGATIF).length > 0) return;
    try {
      _tokenGuru = await tokenGuru();
      _kelas     = await kelasUji(_tokenGuru);
      // Sapu sisa run yang mati sebelum sempat membersihkan, supaya penilaian
      // bertanda uji tidak menumpuk di kelas sungguhan.
      await bersihkanPenilaianUji(_tokenGuru, _kelas.id);
      _roster2 = await rosterByNis(_tokenGuru, _kelas.id, process.env.TEST_SISWA2_NIS);
      await buatPenilaianUji(_tokenGuru, _kelas, _roster2.id);
      _siapNegatif = true;
    } catch (err) {
      _galatSetup = err.message;
    }
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
  // Ini menguji BENTUK permintaan, bukan penolakan server. Penolakan servernya
  // diuji terpisah oleh 'siswa lain tidak bisa membaca nilai siswa kedua'
  // di bawah, yang memakai fixture siswa kedua.
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
    // Kredensial yang belum diisi memang bukan bug aplikasi — itu dilewati.
    // Tetapi penyiapan yang GAGAL harus merah: kalau dibiarkan lewat sebagai
    // skip, proteksi lintas-siswa berhenti diuji tanpa satu pun tanda merah.
    test.skip(envHilang(...WAJIB_NEGATIF).length > 0,
      'Kredensial belum diisi: ' + envHilang(...WAJIB_NEGATIF).join(', '));
    expect(_galatSetup, 'Penyiapan penilaian uji gagal').toBeNull();
    expect(_siapNegatif).toBe(true);

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

// ---------------------------------------------------------------------------
// Constraint rentang nilai — 20260821000010, commit 8942d17
// ---------------------------------------------------------------------------
//
// CHECK assessment_results_nilai_range: nilai IS NULL OR (nilai >= 0 AND nilai <= 100)
//
// Diuji lewat REST langsung memakai token GURU, bukan lewat layar. Batasan ini
// hidup di database, bukan di RLS dan bukan di klien — dan justru itu yang
// membuatnya perlu diuji dari sisi ini: penjaga di klien hanyalah atribut HTML
// min/max pada input di luar <form>, yang tidak pernah dievaluasi, sehingga
// jalur REST inilah yang benar-benar menahan nilai di luar rentang.
//
// Membedakan 400 dari 403 adalah inti ketiga test di bawah. 400 berarti CHECK
// rentang yang menolak; 403 berarti RLS menolak lebih dulu dan constraint-nya
// tidak pernah sempat diuji. Karena itu barisnya disusun agar SAH menurut
// policy INSERT yang dipasang bc4c7fd — classroom, assessment, dan roster
// ketiganya milik classroom yang sama, teacher_id milik guru yang login.
//
// Ditempatkan di berkas ini karena tests/specs/siswa.spec.js adalah salah satu
// berkas yang boleh disentuh pada ronde ini. Rumah yang lebih tepat sebenarnya
// berkas spec tersendiri, atau guru.spec.js — jalur yang diuji milik guru, bukan
// siswa. Layak dipindahkan bila kelak ada ronde yang membolehkannya.
test.describe('Constraint rentang nilai', () => {
  const WAJIB_CONSTRAINT = ['TEST_GURU_EMAIL', 'TEST_GURU_PASSWORD', 'TEST_SISWA_NIS'];

  let _token   = null;
  let _kls     = null;
  let _roster  = null;
  let _asmt    = null;
  let _galat   = null;

  test.beforeAll(async () => {
    if (envHilang(...WAJIB_CONSTRAINT).length > 0) return;
    try {
      _token = await tokenGuru();
      _kls   = await kelasUji(_token);
      // Sapu sisa run yang mati sebelum sempat membersihkan.
      await bersihkanPenilaianUji(_token, _kls.id);
      _roster = await rosterByNis(_token, _kls.id, process.env.TEST_SISWA_NIS);
      // Penilaian kosong, bukan buatPenilaianUji(): ketiga test di bawah menulis
      // barisnya sendiri, dan penilaian yang sudah berisi nilai untuk roster ini
      // akan membuat penulisan berikutnya gagal 409 karena UNIQUE
      // (assessment_id, student_id) — bukan 400 yang sedang diuji.
      _asmt = await buatAssessmentUjiKosong(_token, _kls);
    } catch (err) {
      _galat = err.message;
    }
  });

  test.afterAll(async () => {
    if (_token && _kls) await bersihkanPenilaianUji(_token, _kls.id);
  });

  test.beforeEach(() => {
    const hilang = envHilang(...WAJIB_CONSTRAINT);
    test.skip(hilang.length > 0, 'Kredensial belum diisi: ' + hilang.join(', '));
    // Penyiapan yang gagal harus merah, bukan lewat sebagai skip: kalau
    // dibiarkan, batas rentang nilai berhenti diuji tanpa satu pun tanda.
    expect(_galat, 'Penyiapan penilaian uji gagal').toBeNull();
    expect(_asmt).toBeTruthy();
  });

  function baris(nilai) {
    return {
      assessment_id: _asmt,
      classroom_id:  _kls.id,
      teacher_id:    _kls.teacher_id,
      student_id:    _roster.id,
      nilai,
    };
  }

  test('nilai di atas 100 ditolak', async () => {
    const hasil = await simpanNilaiMentah(_token, baris(150));
    expect(hasil.status, 'diharapkan 400 dari CHECK, bukan 403 dari RLS').toBe(400);
  });

  test('nilai di bawah 0 ditolak', async () => {
    const hasil = await simpanNilaiMentah(_token, baris(-1));
    expect(hasil.status, 'diharapkan 400 dari CHECK, bukan 403 dari RLS').toBe(400);
  });

  // NULL sengaja tetap sah: ia berarti "belum dinilai", berbeda dari nol.
  // Test ini mengunci pilihan itu — tanpanya, seseorang bisa memperketat
  // constraint menjadi NOT NULL dan tidak ada yang memberi tahu bahwa keadaan
  // "belum dinilai" ikut hilang.
  //
  // Dijalankan terakhir di antara ketiganya karena ia satu-satunya yang
  // benar-benar menulis baris. Barisnya ikut tersapu afterAll lewat CASCADE.
  test('nilai NULL tetap diterima', async () => {
    const hasil = await simpanNilaiMentah(_token, baris(null));
    expect(hasil.status, 'NULL berarti belum dinilai dan harus lolos').toBe(201);
  });
});
