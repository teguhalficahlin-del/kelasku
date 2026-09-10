#!/usr/bin/env node
// Membangkitkan docs/SPEC-ATP-KONTRAK.md dari KONTRAK_PERTANYAAN.
//
// Dokumen jejak "pertanyaan → data → keputusan" TIDAK ditulis tangan, dan itu
// disengaja. Dokumen yang ditulis tangan basi diam-diam begitu satu pertanyaan
// berubah, lalu dibaca sesi berikutnya sebagai kebenaran. Yang ini dibangkitkan
// dari kode yang benar-benar dipakai Edge Function, sehingga ia tidak bisa
// menyimpang tanpa kodenya ikut berubah.
//
// Pakai: node tests/atp-trace.mjs [--periksa]
//   tanpa argumen : tulis ulang docs/SPEC-ATP-KONTRAK.md
//   --periksa     : gagal kalau berkasnya sudah tidak sesuai kode

import { readFileSync, writeFileSync } from 'node:fs';

const TUJUAN = 'docs/SPEC-ATP-KONTRAK.md';
const SUMBER = 'supabase/functions/generate-atp/kontrak.ts';

// KONTRAK_PERTANYAAN diambil dengan mengeksekusi potongan sumbernya, bukan
// dengan mem-parsing teksnya: yang diuji harus objek yang sama yang dipakai
// Edge Function, bukan tafsiran kedua atasnya.
const src = readFileSync(SUMBER, 'utf8').split('\r\n').join('\n');
const mulai = src.indexOf('export const KONTRAK_PERTANYAAN');
const akhir = src.indexOf('\n};\n', mulai) + 3;
const potongan = src.slice(mulai, akhir)
  .replace('export const KONTRAK_PERTANYAAN: Record<string, EntriKontrak> =', 'return');
const KONTRAK = new Function(potongan)();

const JENIS = {
  A: 'A — masukan penyusunan',
  B: 'B — percabangan/tampilan',
  C: 'C — hitungan deterministik',
};

const urut = Object.entries(KONTRAK).sort((a, b) => {
  const n = (s) => {
    const m = /^A(\d+)(a?)$/.exec(s);
    return m ? Number(m[1]) * 10 + (m[2] ? 1 : 0) : 999;
  };
  return n(a[1].spec) - n(b[1].spec);
});

const baris = urut.map(([id, e]) =>
  `| ${e.spec} | \`${id}\` | ${e.fase} | \`${e.simpan}\` | ${e.jenis} | ${e.dipakai} | ${e.keputusan} |`);

const jumlahJenis = { A: 0, B: 0, C: 0 };
for (const [, e] of urut) jumlahJenis[e.jenis]++;

const isi = `# Kontrak ATP — pertanyaan, data, keputusan

**DIBANGKITKAN — jangan sunting berkas ini langsung.**
Sumber: \`${SUMBER}\` (\`KONTRAK_PERTANYAAN\`).
Bangun ulang: \`node tests/atp-trace.mjs\`.

Dokumen ini menjawab satu pertanyaan untuk setiap hal yang MiClass tanyakan
kepada guru di alur ATP: **jawabannya dipakai untuk apa?**

Latar belakangnya ada di CLAUDE.md — pemeriksaan seluruh pertanyaan Tab Rancang
menemukan empat pertanyaan yang meminta guru memutuskan sesuatu yang lalu
dibuang, satu di antaranya menjanjikan dokumen yang tidak ada mesin pembuatnya
di seluruh repositori. *Menambah pertanyaan itu murah; menyambungkannya ke hasil
tidak.* Tabel di bawah adalah sambungannya, dan
\`tests/atp-kontrak.test.ts\` menggagalkan diri kalau ada pertanyaan di salah
satu sisi yang tidak punya pasangan di sisi lain.

## Jenis

| Kode | Arti |
|---|---|
| A | **Masukan penyusunan.** Jawabannya memengaruhi isi ATP; ia diterjemahkan jadi frasa manusia lalu masuk ke bagian konteks yang dikirim ke penyusun. |
| B | **Percabangan/tampilan.** Jawabannya hanya mengatur pertanyaan berikutnya atau menjadi gerbang. Ia tidak dikirim sebagai konteks. |
| C | **Hitungan deterministik.** Jawabannya dibaca kode untuk menghitung waktu atau batas. Angkanya tidak pernah diserahkan kepada AI untuk dihitung. |

Sebaran saat ini: **${jumlahJenis.A} jenis A, ${jumlahJenis.B} jenis B, ${jumlahJenis.C} jenis C** — ${urut.length} entri.

## Jejak

| SPEC | ID pertanyaan | Fase | Tersimpan di | Jenis | Dibaca oleh | Keputusan ATP yang dipengaruhi |
|---|---|---|---|---|---|---|
${baris.join('\n')}

## Yang TIDAK ada di tabel ini, dan sebabnya

- \`program_keahlian\` bukan definisi pertanyaan tersendiri. Ia hasil dari salah
  satu dari tiga jalur A1: dikonfirmasi apa adanya, dipilih dari daftar, atau
  diketik guru. Nilainya tetap jenis A dan tetap tercantum.
- \`tindakan_review_atp\` adalah tindakan pascahasil, bukan pertanyaan corong
  (SPEC §4 akhir). Ia menentukan rute revisi, bukan isi ATP.
- Pertanyaan Modul Ajar (M1–M11) berada di luar cakupan dokumen ini.

## Keputusan yang diambil MiClass, bukan guru

Empat pertanyaan menyediakan pilihan **"tentukan saat menyusun"**: A3 bahasa
pengantar, A15 penempatan penguatan, A17 konteks tugas, dan A19 urutan
pembelajaran. Pilihan itu **tidak memanggil AI di tengah corong**; ia menyimpan
pendelegasian.

Keputusannya diambil **di kode** oleh \`resolveDelegasi()\`, bukan diserahkan
kepada model. Alasannya bukan selera: keputusan yang diambil model tidak bisa
dilaporkan kepada guru dengan jujur, tidak bisa diuji, dan berbeda tiap
generate. Setiap keputusan yang diambil dicatat beserta alasannya di
\`ATP_HASIL.dasar_penyusunan.keputusan_miclass\`, lalu ditampilkan di layar
hasil dan tercetak di dokumen ATP.

Aturan yang dipakai, ketika guru mendelegasikan atau tidak menjawab:

| Pertanyaan | Kesiapan murid | Yang MiClass pilih |
|---|---|---|
| A19 urutan pembelajaran | jauh di bawah / sangat beragam | Kemampuan dasar dulu (hierarki) |
| A19 urutan pembelajaran | selain itu | Bantuan berkurang menuju mandiri |
| A17 konteks tugas | apa pun | Seimbang |
| A15 penguatan | jauh di bawah | Di awal dan saat topik membutuhkannya |
| A15 penguatan | sudah siap | Tidak diperlukan |
| A15 penguatan | selain itu | Menyatu dengan topik |
| A3 bahasa | sudah siap | Campuran |
| A3 bahasa | selain itu | Bahasa Indonesia dominan |

Polanya satu: **kalau informasinya tidak cukup, pilih yang paling sedikit
menuntut prasyarat dan paling mudah dijalankan lewat teks dan interaksi
langsung** (SPEC §4).
`;

if (process.argv.includes('--periksa')) {
  let aktual = '';
  try { aktual = readFileSync(TUJUAN, 'utf8'); } catch { /* belum ada */ }
  if (aktual.split('\r\n').join('\n') !== isi) {
    console.error(`GAGAL — ${TUJUAN} tidak sesuai lagi dengan ${SUMBER}.`);
    console.error('Jalankan: node tests/atp-trace.mjs');
    process.exit(1);
  }
  console.log(`LULUS — ${TUJUAN} sesuai dengan kontrak di kode.`);
} else {
  writeFileSync(TUJUAN, isi);
  console.log(`ditulis: ${TUJUAN} (${urut.length} entri)`);
}
