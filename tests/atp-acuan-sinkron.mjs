#!/usr/bin/env node
// Menjaga salinan acuan CP di Edge Function tetap identik dengan sumbernya.
//
// Acuan CP hidup di DUA tempat karena dipakai dua runtime: klien (gerbang di
// depan corong, sebelum guru menjawab apa pun) dan Edge Function (gerbang
// sebelum kuota AI terpakai). Supabase membundel hanya isi folder fungsinya,
// jadi ia tidak bisa membaca shared/data/. Pelajaran BENTUK_INSTRUMEN vs
// KUNCI_MURID (CLAUDE.md, sesi 5 September) sudah membuktikan bahwa "kalau
// salah satu diubah, ubah keduanya" tidak cukup sebagai komentar — ia harus
// jadi uji.
//
// Pakai: node tests/atp-acuan-sinkron.mjs [--tulis]
//   --tulis  membangun ulang salinan Edge Function dari sumbernya.

import { readFileSync, writeFileSync } from 'node:fs';

const SUMBER  = 'shared/data/cp-acuan.json';
const SALINAN = 'supabase/functions/generate-atp/acuan-cp.ts';

const KEPALA = `// DIBANGKITKAN — jangan sunting berkas ini langsung.
// Sumber: ${SUMBER}
// Bangun ulang: node tests/atp-acuan-sinkron.mjs --tulis
//
// Acuan CP berversi. Dua keluaran dari satu sumber: menentukan kombinasi
// mapel/fase yang boleh dibuka, dan memeriksa cakupan ATP yang dihasilkan.
// Lihat docs/SPEC-ATP-MODUL-BERBASIS-TEKS.md §3.

/** Apakah satu tuntutan dapat dilayani MiClass TANPA pekerjaan tambahan guru.
 *
 *  'perlu_telaah_manusia' BUKAN sinonim 'sebagian'. Tidak ada status sebagian
 *  lagi, dan itu keputusan produk: membuka layanan dengan cakupan sebagian
 *  berarti menyerahkan sisanya kepada guru sebagai pekerjaan terselubung. */
export type StatusLayanan = 'dilayani' | 'tidak_dilayani' | 'perlu_telaah_manusia';

export type TuntutanCp = {
  id: string;
  kompetensi: string;
  lingkup_materi: string;
  /** Potongan cp_normatif VERBATIM yang menjadi asal tuntutan ini. Wajib —
   *  tuntutan tanpa sumber adalah interpretasi tanpa jejak. */
  sumber_cp: string;
  /** SAFE DECOMPOSITION | NEEDS HUMAN REVIEW | EXACT | INVALID */
  status_dekomposisi: string;
  /** Hubungan logis di dalam dan di sekitar tuntutan ini: mana yang AND, mana
   *  yang OR, mana yang kualifikator. Wajib — memperlakukan setiap frasa CP
   *  sebagai kewajiban kumulatif adalah kesalahan baca yang mengubah hasil
   *  gerbang layanan. */
  logika: string;
  /** Cakupan KUMULATIF di dalam satu tuntutan yang tidak boleh hilang hanya
   *  karena ID-nya sudah muncul di satu TP. Contoh: "teks fiksi dan non fiksi"
   *  menuntut KEDUA kategori dilayani gabungan TP yang merujuk tuntutan ini.
   *  Dibaca validasiAtp() — tidak ada ID yang di-hardcode di validator. */
  cakupan_wajib?: { kategori_teks?: string[] };
  layanan: StatusLayanan;
  /** Bagaimana MiClass melayaninya. Dilarang memuat pekerjaan untuk guru.
   *  Untuk audit layanan SAJA — TIDAK dikirim ke penyusun ATP (Pass 5, SEM-008):
   *  daftar bentuk konkretnya terbukti bocor ke judul TP. */
  cara_layanan: string;
};

export type ElemenAcuan = {
  label: string;
  /** Teks CP normatif elemen ini, VERBATIM dari regulasi yang berlaku. Wajib
   *  identik dengan cp_normatif di shared/data/cp-data.json — itulah yang
   *  membuat klien dan Edge Function tidak mungkin membaca CP berlainan. */
  cp_normatif: string;
  logika_elemen: string;
  tuntutan: TuntutanCp[];
};

export type FaseAcuan = {
  /** 'tersedia' hanyalah SYARAT, bukan keputusan. Gerbang layanan dihitung
   *  statusLayanan() dari versi CP, status peninjauan, dan cakupan penuh. */
  status: string;
  alasan_status?: string;
  versi_cp: string;
  sumber_regulasi: string;
  ditetapkan: string;
  mencabut?: string;
  lampiran?: string;
  /** 'pending' | 'diterima'. TIDAK BOLEH menyatakan pemeriksaan manusia yang
   *  belum terjadi. */
  review_status: string;
  review_catatan?: string;
  elemen: Record<string, ElemenAcuan>;
};

export type AcuanCp = {
  versi: string;
  catatan: string;
  acuan: Record<string, Record<string, FaseAcuan>>;
};

export const ACUAN_CP: AcuanCp = `;

const data = JSON.parse(readFileSync(SUMBER, 'utf8'));
const isi  = KEPALA + JSON.stringify(data, null, 2) + ';\n';

if (process.argv.includes('--tulis')) {
  writeFileSync(SALINAN, isi);
  console.log('ditulis:', SALINAN);
  process.exit(0);
}

let aktual = '';
try { aktual = readFileSync(SALINAN, 'utf8'); } catch { /* belum ada */ }

if (aktual !== isi) {
  console.error('GAGAL — salinan acuan CP di Edge Function tidak sama dengan sumbernya.');
  console.error('Jalankan: node tests/atp-acuan-sinkron.mjs --tulis');
  process.exit(1);
}
console.log('LULUS — acuan CP sinkron (' + SALINAN + ')');
