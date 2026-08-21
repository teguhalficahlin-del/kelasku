// Helper login untuk keempat portal.
//
// TIDAK ADA kredensial di berkas ini, dan tidak boleh pernah ada. Semuanya
// dibaca dari environment variable yang diisi lewat GitHub Secrets (atau .env
// lokal yang sudah masuk .gitignore).
//
// Setiap portal punya bentuk login yang berbeda:
//   guru  → email + password (Supabase Auth)
//   siswa → kode kelas + nama lengkap + NIS
//   ortu  → kode kelas + nama anak + NIS anak
//   admin → email + password, lalu diverifikasi ulang lewat Edge Function
//
// Sesi disimpan sebagai storage state di tests/.auth/ supaya spec berikutnya
// tidak perlu login ulang. Direktori itu diabaikan git — isinya token hidup.

import fs from 'node:fs';
import path from 'node:path';

const DIR_AUTH = path.join('tests', '.auth');

/** Ambil env var, atau undefined kalau kosong/tidak ada. */
export function env(nama) {
  const v = process.env[nama];
  return v && v.trim() !== '' ? v : undefined;
}

/**
 * Daftar env var yang hilang dari yang dibutuhkan sebuah spec.
 * Dipakai untuk melewati test dengan alasan yang jelas, bukan gagal dengan
 * pesan yang menyesatkan — kredensial yang belum diisi bukan bug aplikasi.
 */
export function envHilang(...nama) {
  return nama.filter(n => !env(n));
}

function simpanState(context, berkas) {
  fs.mkdirSync(DIR_AUTH, { recursive: true });
  return context.storageState({ path: path.join(DIR_AUTH, berkas) });
}

// ---------------------------------------------------------------------------
// Guru — email + password
// ---------------------------------------------------------------------------
export async function loginGuru(page) {
  await page.goto('guru/index.html');
  await page.fill('#email', env('TEST_GURU_EMAIL'));
  await page.fill('#password', env('TEST_GURU_PASSWORD'));
  await page.click('#btn-masuk');
  await page.waitForURL(/dashboard\.html/, { timeout: 20000 });
  await simpanState(page.context(), 'guru.json');
}

// ---------------------------------------------------------------------------
// Siswa — kode kelas + nama + NIS
// ---------------------------------------------------------------------------
export async function loginSiswa(page) {
  await page.goto('siswa/index.html');
  await page.fill('#inp-kode', env('TEST_KODE_KELAS'));
  await page.fill('#inp-nama', env('TEST_SISWA_NAMA'));
  await page.fill('#inp-nis',  env('TEST_SISWA_NIS'));
  await page.click('#btn-login');
  await page.waitForURL(/dashboard\.html/, { timeout: 20000 });
  await simpanState(page.context(), 'siswa.json');
}

// ---------------------------------------------------------------------------
// Ortu — kode kelas + nama anak + NIS anak
// ---------------------------------------------------------------------------
export async function loginOrtu(page) {
  await page.goto('ortu/index.html');
  await page.fill('#inp-kode',      env('TEST_KODE_KELAS'));
  await page.fill('#inp-nama-anak', env('TEST_SISWA_NAMA'));
  await page.fill('#inp-nis-anak',  env('TEST_SISWA_NIS'));
  await page.click('#btn-login');
  await page.waitForURL(/dashboard\.html/, { timeout: 20000 });
  await simpanState(page.context(), 'ortu.json');
}

// ---------------------------------------------------------------------------
// Admin — satu halaman, login dan dashboard bertukar tampil
// ---------------------------------------------------------------------------
export async function loginAdmin(page) {
  await page.goto('admin/index.html');
  await page.fill('#email', env('TEST_ADMIN_EMAIL'));
  await page.fill('#password', env('TEST_ADMIN_PASSWORD'));
  await page.click('#btn-masuk');
  // Bukan pindah halaman: #dashboard-view yang berubah dari display:none.
  await page.waitForSelector('#dashboard-view:visible', { timeout: 20000 });
  await simpanState(page.context(), 'admin.json');
}
