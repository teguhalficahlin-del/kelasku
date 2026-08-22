import { test, expect } from '@playwright/test';
import { loginOrtu, loginOrtu2, tokenSesi, KUNCI_SESI, envHilang } from '../fixtures/auth.js';
import {
  tokenGuru, kelasUji, rosterByNis, bersihkanPenilaianUji, buatPenilaianUji,
  nilaiRosterMentah,
} from '../fixtures/db.js';

const WAJIB = ['TEST_BASE_URL', 'TEST_KODE_KELAS', 'TEST_SISWA_NAMA', 'TEST_SISWA_NIS'];

// Tambahan khusus test negatif: butuh anak kedua sebagai subjek "anak orang
// lain", dan kredensial guru untuk menyiapkan nilai miliknya.
const WAJIB_NEGATIF = [
  'TEST_GURU_EMAIL', 'TEST_GURU_PASSWORD', 'TEST_SISWA2_NAMA', 'TEST_SISWA2_NIS',
];

let _tokenGuru   = null;
let _kelas       = null;
let _roster2     = null;
let _siapNegatif = false;
let _galatSetup  = null;

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
  // Kegagalan penyiapan ditahan di sini, bukan dilempar keluar — beforeAll yang
  // melempar menjatuhkan seluruh describe, termasuk test yang tidak berkaitan.
  test.beforeAll(async () => {
    if (envHilang(...WAJIB, ...WAJIB_NEGATIF).length > 0) return;
    try {
      _tokenGuru = await tokenGuru();
      _kelas     = await kelasUji(_tokenGuru);
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

    // Yang paling penting: pesannya benar-benar masuk ke percakapan.
    await expect(bagian.locator('.note-item-content', { hasText: isi }))
      .toBeVisible({ timeout: 20000 });

    // Regresi: konfirmasi ini pernah tidak pernah sampai ke layar sama sekali.
    // Pengiriman yang berhasil memanggil render() yang mengganti seluruh isi
    // seksi, sehingga elemen status yang dipegang wireKomposer sudah terlepas
    // dari dokumen sebelum teksnya ditulis — orang tua menekan Kirim dan tidak
    // melihat satu pun tanda bahwa pesannya terkirim.
    await expect(bagian.locator('[id$="-msg"]')).toHaveText('Terkirim.', { timeout: 10000 });

    // Kotak tulis dikosongkan kembali setelah render ulang, siap dipakai lagi.
    await expect(bagian.locator('textarea')).toHaveValue('');
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

  // Regresi FIX-P2: permintaan nilai wajib membawa penyaring student_id, dan
  // isinya harus persis baris roster anak yang ditautkan ke orang tua ini.
  //
  // Penyaringnya diambil lewat RPC fn_child_roster_ids, bukan
  // fn_child_profile_ids: assessment_results.student_id menunjuk
  // classroom_roster(id) sejak 20260815000003, sedangkan fn_child_profile_ids
  // mengembalikan profiles(id) — ruang uuid yang berbeda dan tidak akan cocok
  // satu baris pun. Test ini ikut mengunci pilihan itu.
  //
  // Seperti padanannya di portal siswa, yang diuji adalah BENTUK permintaan.
  // Penolakan servernya diuji terpisah oleh 'ortu tidak bisa membaca nilai anak
  // orang lain' di bawah, yang memakai fixture anak kedua.
  test('nilai hanya menampilkan milik anak sendiri', async ({ page }) => {
    const menungguRpc = page.waitForResponse(
      r => r.url().includes('/rest/v1/rpc/fn_child_roster_ids'), { timeout: 20000 });
    const menungguNilai = page.waitForRequest(
      r => r.url().includes('/rest/v1/assessment_results'), { timeout: 20000 });

    await page.reload();

    const anakIds = await (await menungguRpc).json();
    expect(Array.isArray(anakIds)).toBe(true);
    expect(anakIds.length).toBeGreaterThan(0);

    const url = decodeURIComponent((await menungguNilai).url());
    expect(url).toContain('student_id=in.');

    const cocok = url.match(/student_id=in\.\(([^)]*)\)/);
    expect(cocok).not.toBeNull();
    const dipakai = cocok[1].split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);

    expect(dipakai.length).toBeGreaterThan(0);
    for (const id of dipakai) expect(anakIds).toContain(id);
  });

  // Test negatif sejati untuk FIX-P2 — akses lintas-anak.
  //
  // Permintaannya dikirim langsung ke REST API memakai token sesi orang tua
  // pertama, sehingga yang diuji adalah keputusan server, bukan penyaring di
  // dashboard. Kontrolnya memastikan barisnya memang ada dan memang terbaca
  // oleh orang tua anak kedua.
  test('ortu tidak bisa membaca nilai anak orang lain', async ({ page, browser }) => {
    // Kredensial belum diisi = dilewati. Penyiapan gagal = merah, sebab kalau
    // dibiarkan lewat, proteksi lintas-anak berhenti diuji tanpa tanda apa pun.
    test.skip(envHilang(...WAJIB_NEGATIF).length > 0,
      'Kredensial belum diisi: ' + envHilang(...WAJIB_NEGATIF).join(', '));
    expect(_galatSetup, 'Penyiapan penilaian uji gagal').toBeNull();
    expect(_siapNegatif).toBe(true);

    // (1) Ortu pertama: harus kosong, dan harus 200 — ditolak RLS berarti baris
    //     tidak terlihat, bukan permintaan yang error.
    const tokenOrtu1 = await tokenSesi(page, KUNCI_SESI.ortu);
    expect(tokenOrtu1).toBeTruthy();

    const dilihatOrtu1 = await nilaiRosterMentah(tokenOrtu1, _kelas.id, _roster2.id);
    expect(dilihatOrtu1.status).toBe(200);
    expect(dilihatOrtu1.body).toEqual([]);

    // (2) Ortu anak kedua atas baris anaknya sendiri: harus ada.
    const konteks2 = await browser.newContext();
    try {
      const halaman2 = await konteks2.newPage();
      await loginOrtu2(halaman2);
      const tokenOrtu2 = await tokenSesi(halaman2, KUNCI_SESI.ortu);
      expect(tokenOrtu2).toBeTruthy();

      const dilihatOrtu2 = await nilaiRosterMentah(tokenOrtu2, _kelas.id, _roster2.id);
      expect(dilihatOrtu2.status).toBe(200);
      expect(dilihatOrtu2.body.length).toBeGreaterThan(0);
    } finally {
      await konteks2.close();
    }
  });
});
