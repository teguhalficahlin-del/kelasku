// M5 — KELENGKAPAN RESOURCE.
//
// PRINSIP PRODUK: MiClass menyediakan seluruh bahan yang guru dan murid
// perlukan untuk MENJALANKAN Modul. Tidak ada "cari teks sendiri", tidak ada
// "siapkan contoh sendiri", dan tidak ada instrumen yang tinggal judul.
//
// TIGA TINGKAT, DAN M5 HANYA MENEGAKKAN DUA:
//
//   resource ADA                → M5
//   resource DAPAT DIPAKAI      → M5
//   resource BERMUTU secara isi → M9, bukan di sini
//
// Karena itu di berkas ini tidak ada satu pun uji yang menuntut panjang teks
// minimum atau kehadiran kata tertentu. Sebuah bacaan berisi satu kata akan
// lolos M5, dan itu memang benar: yang tahu satu kata bukan teks bacaan adalah
// pembaca, bukan penghitung karakter.
//
// M5-REPRO-*   reproduksi gap: lolos sebelum, ditolak sesudah
// M5-A..M5-F   kelengkapan bahan murid per jenis
// M5-G..M5-K   kelengkapan panduan guru, dan batas kapan ia dituntut
// M5-L..M5-N   kunci jawaban sepadan jumlah soal
// M5-O..M5-Q   'custom' bukan pintu belakang
// M5-SYNC      RESOURCE_WAJIB vs BENTUK_INSTRUMEN vs ENUM_KONTRAK (tingkat JENIS)
// M5-PARITY-*  paritas tingkat FIELD/PATH — dua arah drift wajib gagal
// M5-HIST      dokumen historis tetap terbaca
// M5-GEN       jalur penyusunan menyalakan kontrak M5
//
// TIDAK ADA panggilan model di berkas ini.

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  RESOURCE_WAJIB, JENIS_TANPA_SPESIFIKASI, KUNCI_SEPADAN_SOAL, ENUM_KONTRAK,
  type SpesifikasiResource,
} from '../supabase/functions/generate-modul/contract.ts';

const EF_MODUL = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);
const FIXTURES = new URL('./fixtures/modul/', import.meta.url);

type Validator = (
  raw: unknown, nomorTp: number, jumlahPertemuan: number, jpPerPertemuan: number,
  durasiJp: number, jumlahMurid: number | null, manifest?: unknown,
  perangkatDigitalOk?: boolean, wajibJejakWarisan?: boolean,
  wajibKontrakAsesmenCurrent?: boolean, wajibResourceCurrent?: boolean,
) => { valid: boolean; errors: string[] };

/** Bentuk yang DIKIRIM KE MODEL, per jenis instrumen. `km` = konten_murid,
 *  `pg` = panduan_guru. Nilainya potongan teks mirip TypeScript. */
type BentukInstrumen = Record<string, { km: string; pg: string }>;

/** Kedua otoritas diambil dari SUMBER Edge Function — bukan disalin ke harness.
 *  `BENTUK_INSTRUMEN` kebetulan berada di atas penanda EDGE FUNCTION, sehingga
 *  ia benar-benar objek yang dipakai menyusun pesan Fase C, bukan hasil
 *  pemindaian teks yang bisa keliru membaca. */
async function muatEF(): Promise<{ validate: Validator; bentuk: BentukInstrumen }> {
  const penuh = await Deno.readTextFile(EF_MODUL);
  const batas = penuh.indexOf('// ── EDGE FUNCTION ─');
  assert(batas > 0, 'penanda EDGE FUNCTION tidak ada di index.ts');
  const tmp = new URL(`._modul-resource-${crypto.randomUUID()}.ts`, new URL('.', EF_MODUL));
  try {
    await Deno.writeTextFile(tmp, penuh.slice(0, batas)
      + '\nexport { validateModulOutputV400, BENTUK_INSTRUMEN };\n');
    const mod = await import(tmp.href);
    return {
      validate: mod.validateModulOutputV400 as Validator,
      bentuk:   mod.BENTUK_INSTRUMEN as BentukInstrumen,
    };
  } finally {
    await Deno.remove(tmp).catch(() => {});
  }
}

const { validate, bentuk: BENTUK_INSTRUMEN } = await muatEF();

type Konten = Record<string, unknown>;

const ARG = [2, 3, 4, 40, 30] as const;

/** Modus M5 SAJA — M2 dan M4 dimatikan supaya temuan yang terlihat murni
 *  temuan kelengkapan resource, bukan sisa milestone lain. */
function cekM5(k: Konten) {
  return validate(k, ...ARG, undefined, false, false, false, true);
}
/** Modus historis: seluruh kontrak current mati. */
function cekHistoris(k: Konten) {
  return validate(k, ...ARG, undefined, false, false, false, false);
}

function tolak(hasil: { valid: boolean; errors: string[] }, potongan: string) {
  assert(!hasil.valid, 'diharapkan DITOLAK, tapi lolos');
  assert(hasil.errors.some(e => e.includes(potongan)),
    `tidak ada galat yang menyebut "${potongan}".\nGalat: ${hasil.errors.join(' | ')}`);
}
function terima(hasil: { valid: boolean; errors: string[] }) {
  assert(hasil.valid, `diharapkan LOLOS, ditolak karena: ${hasil.errors.join(' | ')}`);
}

async function fixtureHistoris(): Promise<Konten> {
  const raw = JSON.parse(await Deno.readTextFile(new URL('tp02.json', FIXTURES)));
  return structuredClone(raw.konten) as Konten;
}

/**
 * FIXTURE KONTRAK SEKARANG UNTUK M5.
 *
 * Bahan tp02 TIDAK dipakai apa adanya, dan alasannya adalah temuan M5 itu
 * sendiri: instrumen tp02 lengkap dan kaya, tetapi model menyimpannya di nama
 * field lain (`bagian_teks` alih-alih `isi_teks`, `butir_tugas` alih-alih
 * `soal`), dan `panduan_guru` ASM-01 bahkan memakai bentuk `matriks_observasi`
 * padahal jenisnya `soal_latihan`. Itu dokumen historis dan tetap dibiarkan
 * begitu (§27 M4: fixture historis adalah bukti, bukan bahan yang dirapikan).
 *
 * Di sini instrumennya disusun ulang MEMATUHI kontrak, dengan ID yang sama
 * supaya rujukan sub_langkah tp02 tetap sah.
 */
async function fixtureSekarang(): Promise<Konten> {
  const k = await fixtureHistoris();
  k.instrumen_pembelajaran = [pblTeks('PBL-01'), pblKartuPeran('PBL-02')];
  k.instrumen_asesmen      = [asmSoal('ASM-01')];
  return k;
}

function pblTeks(id: string): Konten {
  return {
    id, judul: 'Lembar label perawatan autentik', jenis: 'teks_autentik',
    untuk_murid: true, digunakan_pada: ['P1.MEMAHAMI', 'P2.MEMAHAMI'],
    konten_murid: {
      isi_teks: 'Fabric: 70% Mulberry Silk, 30% French Linen. Hand wash cold. Do not bleach.',
      pertanyaan_panduan: ['Simbol apa saja yang kamu temukan?', 'Apa arti "do not bleach"?'],
    },
    panduan_guru: null,
  };
}

function pblKartuPeran(id: string): Konten {
  return {
    id, judul: 'Kartu peran konsultasi pelanggan', jenis: 'kartu_peran',
    untuk_murid: true, digunakan_pada: ['P2.MENGAPLIKASI', 'P3.MENGAPLIKASI'],
    konten_murid: {
      set: [{
        nama_set: 'Konsultasi kain sutra', nama_entitas: 'Butik Sekar',
        peran_a: { jabatan: 'Pelanggan', instruksi_peran: 'Tanyakan cara mencuci gaun sutra.' },
        peran_b: { jabatan: 'Staf butik', instruksi_peran: 'Jelaskan perawatan berdasarkan label.' },
      }],
    },
    panduan_guru: null,
  };
}

function asmSoal(id: string): Konten {
  return {
    id, judul: 'Soal identifikasi simbol perawatan', jenis: 'soal_latihan',
    untuk_murid: true, digunakan_pada: ['P3.MENGAPLIKASI'],
    konten_murid: {
      petunjuk: 'Jawab ketiga pertanyaan berdasarkan label yang kamu terima.',
      soal: [
        { nomor: 1, pertanyaan: 'Sebutkan 4 simbol perawatan pada label.', tipe: 'uraian' },
        { nomor: 2, pertanyaan: 'Jelaskan komposisi serat kainnya.',       tipe: 'uraian' },
        { nomor: 3, pertanyaan: 'Berikan rekomendasi pencucian.',          tipe: 'uraian' },
      ],
    },
    panduan_guru: {
      kunci_jawaban: [
        'Hand wash 30C, do not bleach, flat dry, iron low heat.',
        '70% sutra murbei, 30% linen; halus dan mudah menyusut.',
        'Cuci tangan air dingin, keringkan datar di tempat teduh.',
      ],
      panduan_penskoran: 'Satu poin per simbol yang benar; maksimal 4 poin untuk soal 1.',
    },
  };
}

function pbl(k: Konten, i = 0): Konten { return (k.instrumen_pembelajaran as Konten[])[i]; }
function asm(k: Konten, i = 0): Konten { return (k.instrumen_asesmen as Konten[])[i]; }
function km(ins: Konten): Konten { return ins.konten_murid as Konten; }
function pg(ins: Konten): Konten { return ins.panduan_guru as Konten; }

/** Menjadikan ASM-01 instrumen yang DIPAKAI jalur asesmen, sehingga panduan
 *  guru dituntut. Tanpa ini ia hanya lembar yang tidak dipakai menilai. */
function pakaiUntukMenilai(k: Konten, id = 'ASM-01') {
  k.rencana_asesmen = {
    asesmen_diagnostik: null,
    asesmen_formatif: [{
      id: 'FMT-01', waktu_pertemuan: 1, fase_langkah: 'MEMAHAMI', teknik: 'observasi',
      instrumen_ref: [id], fungsi: 'Cek pemahaman.', referensi_kktp: ['K1'],
      cakupan_bukti: 'per_murid', umpan_balik: 'Koreksi bersama simbol yang paling banyak salah.',
    }],
    asesmen_sumatif: null,
  };
}

// ══ REPRODUKSI GAP — keadaan SEBELUM M5 ═════════════════════════════════════
//
// Sampai M4 satu-satunya pemeriksaan atas isi instrumen adalah V8, dan V8 hanya
// menanyakan apakah `konten_murid` null. Kelima keadaan di bawah lolos.

Deno.test('M5-REPRO-1: teks bacaan tanpa teks lolos sebelum M5', async () => {
  const k = await fixtureSekarang();
  km(pbl(k)).isi_teks = '';
  km(pbl(k)).pertanyaan_panduan = [];
  terima(cekHistoris(k));                       // inilah gap-nya
  tolak(cekM5(k), 'konten_murid.isi_teks kosong');
});

Deno.test('M5-REPRO-2: instrumen yang tinggal judul lolos sebelum M5', async () => {
  const k = await fixtureSekarang();
  pbl(k).konten_murid = {};
  terima(cekHistoris(k));
  tolak(cekM5(k), 'konten_murid.isi_teks tidak ada');
});

Deno.test('M5-REPRO-3: soal tanpa soal dan tanpa kunci lolos sebelum M5', async () => {
  const k = await fixtureSekarang();
  pakaiUntukMenilai(k);
  km(asm(k)).soal = [];
  asm(k).panduan_guru = null;
  terima(cekHistoris(k));
  tolak(cekM5(k), 'konten_murid.soal berisi 0 butir');
  tolak(cekM5(k), 'panduan_guru tidak ada');
});

Deno.test('M5-REPRO-4: kartu peran tanpa satu pun peran lolos sebelum M5', async () => {
  const k = await fixtureSekarang();
  km(pbl(k, 1)).set = [];
  terima(cekHistoris(k));
  tolak(cekM5(k), 'konten_murid.set berisi 0 butir');
});

Deno.test('M5-REPRO-5: soal yang ada tapi pertanyaannya kosong lolos sebelum M5', async () => {
  const k = await fixtureSekarang();
  (km(asm(k)).soal as Konten[])[1].pertanyaan = '';
  terima(cekHistoris(k));
  tolak(cekM5(k), 'konten_murid.soal[1].pertanyaan kosong');
});

Deno.test('M5-BASE: fixture kontrak sekarang lolos di kedua modus', async () => {
  const k = await fixtureSekarang();
  terima(cekHistoris(k));
  terima(cekM5(k));
});

// ══ A–F — KELENGKAPAN BAHAN MURID ═══════════════════════════════════════════

Deno.test('M5-A: konten_murid hilang untuk instrumen murid → ditolak', async () => {
  for (const nilai of [null, undefined]) {
    const k = await fixtureSekarang();
    if (nilai === undefined) delete pbl(k).konten_murid;
    else pbl(k).konten_murid = nilai;
    tolak(cekM5(k), 'murid tidak punya bahan untuk dikerjakan');
  }
});

Deno.test('M5-B: teks_autentik wajib punya isi teks DAN pertanyaan panduan', async () => {
  const a = await fixtureSekarang();
  km(pbl(a)).pertanyaan_panduan = [];
  tolak(cekM5(a), 'pertanyaan_panduan berisi 0 butir, minimal 1');

  const b = await fixtureSekarang();
  km(pbl(b)).pertanyaan_panduan = ['  '];
  tolak(cekM5(b), 'pertanyaan_panduan[0] kosong');
});

Deno.test('M5-C: kartu peran wajib berisi kedua perannya', async () => {
  const a = await fixtureSekarang();
  ((km(pbl(a, 1)).set as Konten[])[0].peran_b as Konten).instruksi_peran = '';
  tolak(cekM5(a), 'set[0].peran_b.instruksi_peran kosong');

  const b = await fixtureSekarang();
  delete (km(pbl(b, 1)).set as Konten[])[0].peran_a;
  tolak(cekM5(b), 'set[0].peran_a tidak ada');

  const c = await fixtureSekarang();
  (km(pbl(c, 1)).set as Konten[])[0].nama_entitas = '';
  tolak(cekM5(c), 'set[0].nama_entitas kosong');
});

Deno.test('M5-D: dialog wajib punya minimal dua giliran', async () => {
  const k = await fixtureSekarang();
  (k.instrumen_pembelajaran as Konten[])[0] = {
    id: 'PBL-01', judul: 'Contoh dialog konsultasi', jenis: 'dialog_model',
    untuk_murid: true, digunakan_pada: ['P1.MEMAHAMI'],
    konten_murid: { petunjuk: 'Simak dialog berikut.', giliran: [{ pembicara: 'Staf', ucapan: 'Selamat siang.' }] },
    panduan_guru: null,
  };
  // Percakapan dengan satu giliran bukan percakapan — lantai bentuk, bukan mutu.
  tolak(cekM5(k), 'giliran berisi 1 butir, minimal 2');
});

Deno.test('M5-E: pesan membedakan "tidak ada" dari "kosong", dan menyebut field yang ADA', async () => {
  // Inilah cacat tersering yang terukur di modul produksi: resource LENGKAP
  // tetapi disimpan di nama field lain. Pesan "kosong" akan menyesatkan.
  const k = await fixtureSekarang();
  pbl(k).konten_murid = { bagian_teks: [{ subjudul: 'Komposisi', konten: 'Silk 70%' }], judul_dokumen: 'Care label' };
  const h = cekM5(k);
  tolak(h, 'konten_murid.isi_teks tidak ada');
  const pesan = h.errors.find(e => e.includes('isi_teks'))!;
  assertStringIncludes(pesan, 'yang ada di sini:');
  assertStringIncludes(pesan, 'bagian_teks');
  // Dan TIDAK mengatakan "kosong" untuk dokumen yang justru penuh isi.
  assert(!pesan.includes('kosong'), `pesan menyesatkan: ${pesan}`);
});

Deno.test('M5-F: instrumen bukan-untuk-murid tidak dituntut bahan murid', async () => {
  const k = await fixtureSekarang();
  pakaiUntukMenilai(k);
  (k.instrumen_asesmen as Konten[])[0] = {
    id: 'ASM-01', judul: 'Lembar pengamatan guru', jenis: 'matriks_observasi',
    untuk_murid: false, digunakan_pada: ['P1.MEMAHAMI'],
    konten_murid: null,
    panduan_guru: {
      kode_legend: 'BT = belum terlihat, MT = mulai terlihat, T = terlihat',
      kolom_indikator: [{ id: 'I1', label: 'Menyebut simbol dengan tepat' }],
      catatan_kritis: 'Catat per murid pada kolom yang sesuai saat murid bekerja.',
    },
  };
  terima(cekM5(k));
});

// ══ G–K — PANDUAN GURU, DAN BATAS KAPAN IA DITUNTUT ═════════════════════════

Deno.test('M5-G: instrumen penilai tanpa panduan guru → ditolak', async () => {
  const k = await fixtureSekarang();
  pakaiUntukMenilai(k);
  asm(k).panduan_guru = null;
  tolak(cekM5(k), 'guru membutuhkan cara memakainya');
});

Deno.test('M5-H: soal penilai wajib punya kunci jawaban dan panduan penskoran', async () => {
  const a = await fixtureSekarang();
  pakaiUntukMenilai(a);
  pg(asm(a)).kunci_jawaban = [];
  tolak(cekM5(a), 'kunci_jawaban berisi 0 butir');

  const b = await fixtureSekarang();
  pakaiUntukMenilai(b);
  pg(asm(b)).panduan_penskoran = '';
  tolak(cekM5(b), 'panduan_penskoran kosong');
});

Deno.test('M5-I: instrumen asesmen yang TIDAK dipakai menilai tidak dituntut panduan guru', async () => {
  // Batas yang sengaja: panduan guru dituntut karena keputusan tentang murid
  // diambil dari instrumen itu. Kalau ia tidak dipakai jalur asesmen mana pun,
  // menuntutnya hanya menjatuhkan modul sehat tanpa menambah yang guru perlukan.
  const k = await fixtureSekarang();
  k.rencana_asesmen = { asesmen_diagnostik: null, asesmen_formatif: null, asesmen_sumatif: null };
  (k.kktp as Konten[]).forEach(x => { delete x.instrumen_bukti; });
  asm(k).panduan_guru = null;
  terima(cekM5(k));
});

Deno.test('M5-J: instrumen PEMBELAJARAN tidak dituntut panduan guru', async () => {
  const k = await fixtureSekarang();
  pbl(k).panduan_guru = null;
  pbl(k, 1).panduan_guru = null;
  terima(cekM5(k));
});

Deno.test('M5-K: panduan guru dituntut lewat keempat jalur pemakaian', async () => {
  const jalur: Array<[string, (k: Konten) => void]> = [
    ['formatif',   k => { pakaiUntukMenilai(k); }],
    ['sumatif',    k => {
      k.rencana_asesmen = { asesmen_diagnostik: null, asesmen_formatif: null,
        asesmen_sumatif: { deskripsi: 'x', teknik: 'tes_lisan', instrumen_ref: ['ASM-01'],
          durasi_menit: 80, referensi_kktp: ['K1'], cakupan_bukti: 'per_murid',
          placement: { fase: 'MENGAPLIKASI', pertemuan: 3 } } };
    }],
    ['diagnostik', k => {
      k.rencana_asesmen = { asesmen_formatif: null, asesmen_sumatif: null,
        asesmen_diagnostik: { tujuan: 'x', teknik: 'pemetaan_awal', instrumen_ref: ['ASM-01'],
          waktu: 'P1', penggunaan_hasil: 'y' } };
    }],
    ['instrumen_bukti', k => {
      k.rencana_asesmen = { asesmen_diagnostik: null, asesmen_formatif: null, asesmen_sumatif: null };
      (k.kktp as Konten[])[0].instrumen_bukti = ['ASM-01'];
    }],
  ];
  for (const [nama, pakai] of jalur) {
    const k = await fixtureSekarang();
    k.rencana_asesmen = {};
    (k.kktp as Konten[]).forEach(x => { delete x.instrumen_bukti; });
    pakai(k);
    asm(k).panduan_guru = null;
    tolak(cekM5(k), 'guru membutuhkan cara memakainya');
    assert(true, nama);
  }
});

// ══ L–N — KUNCI JAWABAN SEPADAN JUMLAH SOAL ═════════════════════════════════

Deno.test('M5-L: kunci jawaban lebih sedikit dari soal → ditolak', async () => {
  const k = await fixtureSekarang();
  pakaiUntukMenilai(k);
  pg(asm(k)).kunci_jawaban = ['a', 'b'];        // 3 soal, 2 kunci
  tolak(cekM5(k), '3 soal tetapi 2 kunci jawaban');
});

Deno.test('M5-M: kunci jawaban lebih banyak dari soal → ditolak', async () => {
  const k = await fixtureSekarang();
  pakaiUntukMenilai(k);
  pg(asm(k)).kunci_jawaban = ['a', 'b', 'c', 'd'];
  tolak(cekM5(k), '3 soal tetapi 4 kunci jawaban');
});

Deno.test('M5-N: jumlah sepadan → lolos', async () => {
  const k = await fixtureSekarang();
  pakaiUntukMenilai(k);
  assertEquals((km(asm(k)).soal as unknown[]).length, (pg(asm(k)).kunci_jawaban as unknown[]).length);
  terima(cekM5(k));
});

// ══ O–Q — 'custom' BUKAN PINTU BELAKANG ═════════════════════════════════════

Deno.test('M5-O: custom untuk murid dengan isi kosong → ditolak', async () => {
  for (const isi of [{}, { apa_saja: '' }, { daftar: [] }]) {
    const k = await fixtureSekarang();
    pbl(k).jenis = 'custom';
    pbl(k).konten_murid = isi;
    tolak(cekM5(k), 'konten_murid tidak berisi apa pun');
  }
});

Deno.test('M5-P: custom untuk murid dengan isi nyata → lolos', async () => {
  const k = await fixtureSekarang();
  pbl(k).jenis = 'custom';
  pbl(k).konten_murid = { tabel_data: [{ kota: 'Solo', suhu: 31 }], petunjuk: 'Analisis tabel.' };
  terima(cekM5(k));
});

Deno.test('M5-Q: custom bukan-untuk-murid tidak dituntut isi murid', async () => {
  const k = await fixtureSekarang();
  pakaiUntukMenilai(k);
  asm(k).jenis = 'custom';
  asm(k).konten_murid = null;
  asm(k).untuk_murid = false;
  terima(cekM5(k));
});

// ══ SYNC — SATU CAKUPAN JENIS, DUA TABEL ════════════════════════════════════

Deno.test('M5-SYNC: RESOURCE_WAJIB menutup persis jenis yang BENTUK_INSTRUMEN sebut', () => {
  // `BENTUK_INSTRUMEN` adalah bentuk yang DIKIRIM KE MODEL; `RESOURCE_WAJIB`
  // bentuk yang DITEGAKKAN VALIDATOR. Keduanya sengaja terpisah (menurunkan
  // teks prompt dari tabel akan mengubah kalimat yang model lihat, dan itu
  // tidak dapat diuji tanpa memanggil model). Uji ini menjaga cakupan JENIS;
  // paritas tingkat FIELD dijaga M5-PARITY-* di bawah.
  //
  // Objeknya diimpor dari sumber, bukan dipindai dengan regex: pemindaian teks
  // bisa keliru membaca dan lalu lulus karena alasan yang salah.
  assertEquals(Object.keys(RESOURCE_WAJIB).sort(), Object.keys(BENTUK_INSTRUMEN).sort(),
    'RESOURCE_WAJIB dan BENTUK_INSTRUMEN tidak menutup jenis yang sama');
});

Deno.test('M5-SYNC2: setiap jenis di enum kontrak punya spesifikasi atau pengecualian tegas', () => {
  const semua = [
    ...ENUM_KONTRAK.jenis_instrumen_pembelajaran,
    ...ENUM_KONTRAK.jenis_instrumen_asesmen,
  ];
  for (const jenis of semua) {
    const punya = Object.hasOwn(RESOURCE_WAJIB, jenis);
    const dikecualikan = (JENIS_TANPA_SPESIFIKASI as readonly string[]).includes(jenis);
    assert(punya !== dikecualikan,
      `jenis '${jenis}' harus punya spesifikasi ATAU dikecualikan tegas, tidak keduanya/tidak satu pun`);
  }
  // Dan tidak ada spesifikasi untuk jenis yang tidak ada di enum.
  for (const jenis of Object.keys(RESOURCE_WAJIB)) {
    assert(semua.includes(jenis), `RESOURCE_WAJIB memuat jenis '${jenis}' yang bukan enum kontrak`);
  }
});

Deno.test('M5-SYNC3: spesifikasi tidak memuat ambang mutu terselubung', () => {
  // Penjaga terhadap diri sendiri: M5 hanya boleh menuntut keberadaan dan
  // jumlah butir. Kalau suatu saat ada yang menambahkan ambang panjang teks ke
  // tabel ini, uji ini gagal dan pembahasannya kembali ke M9.
  for (const [jenis, spec] of Object.entries(RESOURCE_WAJIB) as Array<[string, SpesifikasiResource]>) {
    for (const f of [...spec.murid, ...(spec.guru ?? [])]) {
      assert(['teks', 'daftar_teks', 'daftar_objek'].includes(f.bentuk),
        `${jenis}.${f.field}: bentuk '${f.bentuk}' di luar tiga bentuk struktural`);
      if (f.bentuk !== 'teks') {
        assert(Number.isInteger(f.min) && f.min >= 1 && f.min <= 2,
          `${jenis}.${f.field}: min=${f.min} — ambang jumlah di atas 2 mulai menilai mutu, bukan bentuk`);
      }
    }
  }
  assertEquals(KUNCI_SEPADAN_SOAL.jenis, 'soal_latihan');
});

// ══ PARITY — PARITAS TINGKAT FIELD/PATH, DUA ARAH ═══════════════════════════
//
// AKAR MASALAH YANG DITUTUP DI SINI.
//
// M5-SYNC hanya membandingkan HIMPUNAN JENIS. Selama sebuah jenis ada di kedua
// tabel, isinya boleh menyimpang sepenuhnya tanpa satu pun uji memerah:
//
//   prompt   meminta  `bagian_teks`
//   validator menuntut `isi_teks`
//
// keduanya masih di jenis `teks_autentik`, jadi cakupan jenisnya tetap sama —
// dan modul yang dihasilkan model akan ditolak validator sendiri, di setiap
// generate, karena model mematuhi kontrak yang berbeda dari yang ditegakkan.
//
// Yang dijaga sekarang rantai penuhnya:
//
//   jenis instrumen
//     → field/path yang WAJIB menurut validator (RESOURCE_WAJIB)
//       → field/path yang model DIPERINTAHKAN menghasilkan (BENTUK_INSTRUMEN)
//
// Drift wajib gagal dari KEDUA arah: prompt berubah tanpa validator, dan
// validator berubah tanpa prompt.

/** Pohon field hasil pembacaan satu potongan `BENTUK_INSTRUMEN`.
 *  `true` = daun (nilai skalar), objek = bersarang. */
type PohonField = { [kunci: string]: PohonField | true };

/**
 * Pembaca potongan bentuk. Bukan parser TypeScript penuh, dan tidak perlu:
 * yang dibaca hanyalah nama field dan sarangnya, dari sepuluh potongan pendek
 * yang seluruhnya ditulis dengan tangan di satu tabel.
 *
 * Aturan bacanya:
 *   `{ a: string, b: [{ c: string }] }`  →  { a: true, b: { c: true } }
 *   `string[]`                            →  daun (bukan sarang)
 *   `a?: string`                          →  kunci `a` (tanda ? dibuang)
 *
 * Array diperlakukan TRANSPARAN: `b: [{ c: … }]` menjadikan `c` anak `b`,
 * sehingga jalur wajib `b[].c` dari RESOURCE_WAJIB dapat dicocokkan langsung.
 */
function bacaBentuk(teks: string): PohonField {
  let i = 0;
  const lewatiSpasi = () => { while (i < teks.length && /\s/.test(teks[i])) i++; };

  function bacaObjek(): PohonField {
    const pohon: PohonField = {};
    lewatiSpasi();
    if (teks[i] !== '{') throw new Error(`objek diharapkan pada posisi ${i}: ${teks.slice(i, i + 30)}`);
    i++;
    for (;;) {
      lewatiSpasi();
      if (teks[i] === '}') { i++; break; }
      if (teks[i] === ',') { i++; continue; }
      // nama kunci
      const mulai = i;
      while (i < teks.length && /[A-Za-z0-9_?]/.test(teks[i])) i++;
      const kunci = teks.slice(mulai, i).replace('?', '');
      if (!kunci) throw new Error(`kunci kosong pada posisi ${i}: ${teks.slice(mulai, mulai + 30)}`);
      lewatiSpasi();
      if (teks[i] !== ':') throw new Error(`':' diharapkan sesudah '${kunci}'`);
      i++;
      pohon[kunci] = bacaNilai();
    }
    return pohon;
  }

  function bacaNilai(): PohonField | true {
    lewatiSpasi();
    if (teks[i] === '{') return bacaObjek();
    if (teks[i] === '[') {
      i++;                       // array transparan
      lewatiSpasi();
      if (teks[i] === '{') {
        const anak = bacaObjek();
        lewatiSpasi();
        if (teks[i] === ']') i++;
        return anak;
      }
      // array skalar tertulis sebagai `[string]`
      while (i < teks.length && teks[i] !== ']') i++;
      if (teks[i] === ']') i++;
      return true;
    }
    // skalar: `string`, `number`, `string[]`, `string | null`, …
    let dalamKurung = 0;
    while (i < teks.length) {
      const c = teks[i];
      if (c === '[') dalamKurung++;
      else if (c === ']') { if (dalamKurung === 0) break; dalamKurung--; }
      else if ((c === ',' || c === '}') && dalamKurung === 0) break;
      i++;
    }
    return true;
  }

  const hasil = bacaObjek();
  return hasil;
}

/** Jalur field yang WAJIB menurut satu sisi spesifikasi. Tiap jalur berupa
 *  deret segmen; array diperlakukan transparan, sejajar dengan `bacaBentuk()`. */
function jalurWajib(daftar: readonly FieldResourceUji[]): string[][] {
  const jalur: string[][] = [];
  for (const f of daftar) {
    jalur.push([f.field]);
    if (f.bentuk !== 'daftar_objek') continue;
    for (const kunci of f.wajib ?? []) jalur.push([f.field, kunci]);
    for (const [sub, subField] of Object.entries(f.objek_wajib ?? {})) {
      jalur.push([f.field, sub]);
      for (const kunci of subField) jalur.push([f.field, sub, kunci]);
    }
  }
  return jalur;
}

/** Bentuk `FieldResource` yang uji ini perlukan — sengaja ditulis longgar agar
 *  uji drift dapat menyuntikkan spesifikasi rekaan tanpa melawan tipe. */
type FieldResourceUji = {
  field: string;
  bentuk: 'teks' | 'daftar_teks' | 'daftar_objek';
  min?: number;
  wajib?: string[];
  objek_wajib?: Record<string, string[]>;
} & Record<string, unknown>;

function adaDiPohon(pohon: PohonField, jalur: string[]): boolean {
  let simpul: PohonField | true = pohon;
  for (const segmen of jalur) {
    if (simpul === true || !Object.hasOwn(simpul, segmen)) return false;
    simpul = simpul[segmen];
  }
  return true;
}

/**
 * INTI KOREKSI: memeriksa paritas field/path antara kedua otoritas.
 *
 * Sengaja berupa fungsi yang menerima KEDUA otoritas sebagai argumen, bukan
 * membacanya sendiri dari modul. Itulah yang memungkinkan uji drift menyuntikkan
 * versi yang sudah dirusak dan membuktikan bahwa paritasnya memang gagal —
 * uji paritas yang hanya bisa dijalankan atas keadaan sehat tidak membuktikan
 * ia dapat mendeteksi apa pun.
 */
function pelanggaranParitas(
  specs: Record<string, { murid: readonly FieldResourceUji[]; guru?: readonly FieldResourceUji[] }>,
  bentuk: Record<string, { km: string; pg: string }>,
): string[] {
  const pelanggaran: string[] = [];
  for (const [jenis, spec] of Object.entries(specs)) {
    if ((JENIS_TANPA_SPESIFIKASI as readonly string[]).includes(jenis)) continue;
    const b = bentuk[jenis];
    if (!b) { pelanggaran.push(`${jenis}: tidak ada di BENTUK_INSTRUMEN`); continue; }

    const sisi: Array<['konten_murid' | 'panduan_guru', readonly FieldResourceUji[] | undefined, string]> = [
      ['konten_murid', spec.murid, b.km],
      ['panduan_guru', spec.guru,  b.pg],
    ];
    for (const [namaSisi, daftar, teksBentuk] of sisi) {
      if (!daftar || !daftar.length) continue;
      let pohon: PohonField;
      try {
        pohon = bacaBentuk(teksBentuk);
      } catch (e) {
        pelanggaran.push(`${jenis}.${namaSisi}: bentuk tidak dapat dibaca — ${(e as Error).message}`);
        continue;
      }
      for (const jalur of jalurWajib(daftar)) {
        if (!adaDiPohon(pohon, jalur))
          pelanggaran.push(`${jenis}.${namaSisi}: validator menuntut '${jalur.join('.')}', ` +
                           `tetapi model tidak diperintahkan menghasilkannya`);
      }
    }
  }
  return pelanggaran;
}

/** Salinan dalam kedua otoritas, supaya uji drift tidak mencemari uji lain. */
function salinSpec() {
  return structuredClone(RESOURCE_WAJIB) as unknown as
    Record<string, { murid: FieldResourceUji[]; guru?: FieldResourceUji[] }>;
}
function salinBentuk() {
  return structuredClone(BENTUK_INSTRUMEN) as Record<string, { km: string; pg: string }>;
}

/** Cakupan jenis — pemeriksaan LAMA (tingkat himpunan). Dipakai uji drift untuk
 *  membuktikan bahwa pemeriksaan lama tetap HIJAU pada masukan yang menyimpang;
 *  inilah reproduksi akar masalahnya. */
function jenisSepadan(
  specs: Record<string, unknown>, bentuk: Record<string, unknown>,
): boolean {
  const a = Object.keys(specs).sort();
  const b = Object.keys(bentuk).sort();
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// ── Pembaca bentuk harus dapat dipercaya lebih dulu ────────────────────────
//
// Paritas yang bertumpu pada pembaca yang keliru dapat lulus tanpa memeriksa
// apa pun. Karena itu pembacanya diuji sendiri, termasuk bahwa ia TIDAK
// menemukan field yang tidak ada.

Deno.test('M5-PARITY-PARSE: pembaca bentuk membaca sarang dan array dengan benar', () => {
  const pohon = bacaBentuk('{ set: [{ nama_set: string, peran_a: { jabatan?: string, instruksi_peran: string } }] }');
  assert(adaDiPohon(pohon, ['set']));
  assert(adaDiPohon(pohon, ['set', 'nama_set']));
  assert(adaDiPohon(pohon, ['set', 'peran_a']));
  assert(adaDiPohon(pohon, ['set', 'peran_a', 'instruksi_peran']));
  assert(adaDiPohon(pohon, ['set', 'peran_a', 'jabatan']), 'tanda ? harus dibuang dari nama kunci');
  // Yang TIDAK ada harus benar-benar tidak ditemukan.
  assert(!adaDiPohon(pohon, ['bagian_teks']));
  assert(!adaDiPohon(pohon, ['set', 'peran_c']));
  assert(!adaDiPohon(pohon, ['set', 'peran_a', 'nama_lain']));

  // Array skalar adalah DAUN, bukan sarang.
  const p2 = bacaBentuk('{ isi_teks: string, pertanyaan_panduan: string[] }');
  assert(adaDiPohon(p2, ['isi_teks']));
  assert(adaDiPohon(p2, ['pertanyaan_panduan']));
  assert(!adaDiPohon(p2, ['pertanyaan_panduan', 'apa_pun']));

  // Union bertanda null tetap daun.
  const p3 = bacaBentuk('{ rubrik_penilaian: string, catatan_k3: string | null }');
  assert(adaDiPohon(p3, ['catatan_k3']));
});

Deno.test('M5-PARITY-PARSE2: seluruh potongan BENTUK_INSTRUMEN dapat dibaca', () => {
  for (const [jenis, b] of Object.entries(BENTUK_INSTRUMEN)) {
    for (const [sisi, teks] of [['km', b.km], ['pg', b.pg]] as const) {
      const pohon = bacaBentuk(teks);
      assert(Object.keys(pohon).length > 0,
        `${jenis}.${sisi}: terbaca sebagai objek kosong — pembacanya keliru atau bentuknya kosong`);
    }
  }
});

// ── POSITIVE PARITY ────────────────────────────────────────────────────────

Deno.test('M5-PARITY: setiap field wajib validator ADA di bentuk yang model lihat', () => {
  const pelanggaran = pelanggaranParitas(salinSpec(), salinBentuk());
  assertEquals(pelanggaran, [],
    'paritas field/path antara RESOURCE_WAJIB dan BENTUK_INSTRUMEN pecah:\n' + pelanggaran.join('\n'));

  // PENJAGA ANTI-HAMPA. Uji paritas yang memeriksa nol jalur akan selalu hijau
  // dan tidak membuktikan apa pun. Di sini jumlah jalur yang benar-benar
  // diperiksa dihitung dan dituntut wajar — kalau suatu saat `jalurWajib()`
  // berhenti menghasilkan jalur (mis. karena bentuk spesifikasi berubah), uji
  // ini gagal alih-alih lulus dengan tenang.
  const specs = salinSpec();
  let jumlahJalur = 0;
  let jenisDiperiksa = 0;
  for (const [jenis, spec] of Object.entries(specs)) {
    if ((JENIS_TANPA_SPESIFIKASI as readonly string[]).includes(jenis)) continue;
    jenisDiperiksa++;
    jumlahJalur += jalurWajib(spec.murid).length + jalurWajib(spec.guru ?? []).length;
  }
  assertEquals(jenisDiperiksa, Object.keys(RESOURCE_WAJIB).length,
    'ada jenis berspesifikasi yang terlewat paritas');
  assert(jumlahJalur >= 40,
    `paritas hanya memeriksa ${jumlahJalur} jalur — terlalu sedikit untuk sepuluh jenis instrumen`);
});

Deno.test('M5-PARITY2: ketiga jenis yang diwajibkan reviewer diperiksa secara eksplisit', () => {
  // teks_autentik, soal_latihan, kartu_peran — beserta sarangnya.
  const kasus: Array<[string, 'km' | 'pg', string[]]> = [
    ['teks_autentik', 'km', ['isi_teks']],
    ['teks_autentik', 'km', ['pertanyaan_panduan']],
    ['soal_latihan',  'km', ['petunjuk']],
    ['soal_latihan',  'km', ['soal']],
    ['soal_latihan',  'km', ['soal', 'pertanyaan']],
    ['soal_latihan',  'pg', ['kunci_jawaban']],
    ['soal_latihan',  'pg', ['panduan_penskoran']],
    ['kartu_peran',   'km', ['set']],
    ['kartu_peran',   'km', ['set', 'nama_set']],
    ['kartu_peran',   'km', ['set', 'nama_entitas']],
    ['kartu_peran',   'km', ['set', 'peran_a', 'instruksi_peran']],
    ['kartu_peran',   'km', ['set', 'peran_b', 'instruksi_peran']],
  ];
  for (const [jenis, sisi, jalur] of kasus) {
    const pohon = bacaBentuk(BENTUK_INSTRUMEN[jenis][sisi]);
    assert(adaDiPohon(pohon, jalur),
      `${jenis}.${sisi}: '${jalur.join('.')}' tidak ada di bentuk yang model lihat`);
  }
});

Deno.test('M5-PARITY3: setiap jenis dengan spesifikasi guru punya bentuk panduan_guru', () => {
  for (const [jenis, spec] of Object.entries(RESOURCE_WAJIB) as Array<[string, SpesifikasiResource]>) {
    if (!spec.guru?.length) continue;
    const pg = BENTUK_INSTRUMEN[jenis]?.pg ?? '';
    assert(pg.trim().length > 0,
      `${jenis}: validator menuntut panduan_guru tetapi model tidak diberi bentuknya`);
  }
});

// ── NEGATIVE DRIFT — SISI PROMPT ───────────────────────────────────────────

Deno.test('M5-PARITY-DRIFT-PROMPT: field prompt diganti nama → paritas WAJIB gagal', () => {
  // Persis kasus yang terukur di modul produksi tp02: `isi_teks` → `bagian_teks`.
  const bentuk = salinBentuk();
  bentuk.teks_autentik.km = bentuk.teks_autentik.km.replace('isi_teks', 'bagian_teks');

  const pelanggaran = pelanggaranParitas(salinSpec(), bentuk);
  assert(pelanggaran.length > 0, 'drift nama field di sisi prompt tidak terdeteksi');
  assert(pelanggaran.some(x => x.includes('teks_autentik') && x.includes('isi_teks')),
    `pelanggaran tidak menyebut teks_autentik.isi_teks: ${pelanggaran.join(' | ')}`);

  // REPRODUKSI AKAR MASALAH: pemeriksaan LAMA tetap hijau atas masukan yang sama.
  assert(jenisSepadan(RESOURCE_WAJIB, bentuk),
    'cakupan jenis seharusnya masih sepadan — inilah sebabnya M5-SYNC saja tidak cukup');
});

Deno.test('M5-PARITY-DRIFT-PROMPT2: field prompt dihilangkan → paritas WAJIB gagal', () => {
  const bentuk = salinBentuk();
  // Kunci jawaban dibuang dari bentuk yang model lihat, validator tidak diubah.
  bentuk.soal_latihan.pg = '{ panduan_penskoran: string }';
  const pelanggaran = pelanggaranParitas(salinSpec(), bentuk);
  assert(pelanggaran.some(x => x.includes('soal_latihan') && x.includes('kunci_jawaban')),
    `hilangnya kunci_jawaban di sisi prompt tidak terdeteksi: ${pelanggaran.join(' | ')}`);
  assert(jenisSepadan(RESOURCE_WAJIB, bentuk));
});

Deno.test('M5-PARITY-DRIFT-PROMPT3: sarang prompt diubah → paritas WAJIB gagal', () => {
  const bentuk = salinBentuk();
  // peran_b hilang dari kartu peran; jenisnya tetap ada, sarangnya tidak.
  bentuk.kartu_peran.km =
    '{ set: [{ nama_set: string, nama_entitas: string, peran_a: { instruksi_peran: string } }] }';
  const pelanggaran = pelanggaranParitas(salinSpec(), bentuk);
  assert(pelanggaran.some(x => x.includes('kartu_peran') && x.includes('peran_b')),
    `hilangnya sarang peran_b tidak terdeteksi: ${pelanggaran.join(' | ')}`);

  // Dan sarang yang ada tapi sub-fieldnya diganti nama juga harus gagal.
  const bentuk2 = salinBentuk();
  bentuk2.kartu_peran.km = bentuk2.kartu_peran.km.replaceAll('instruksi_peran', 'arahan_peran');
  const p2 = pelanggaranParitas(salinSpec(), bentuk2);
  assert(p2.some(x => x.includes('peran_a.instruksi_peran')),
    `penggantian nama sub-field tidak terdeteksi: ${p2.join(' | ')}`);
});

// ── NEGATIVE DRIFT — SISI VALIDATOR ────────────────────────────────────────

Deno.test('M5-PARITY-DRIFT-VALIDATOR: validator menambah field wajib → paritas WAJIB gagal', () => {
  const specs = salinSpec();
  specs.teks_autentik.murid.push({ field: 'ringkasan_teks', bentuk: 'teks' });
  const pelanggaran = pelanggaranParitas(specs, salinBentuk());
  assert(pelanggaran.some(x => x.includes('teks_autentik') && x.includes('ringkasan_teks')),
    `field wajib baru di sisi validator tidak terdeteksi: ${pelanggaran.join(' | ')}`);

  // REPRODUKSI AKAR MASALAH dari arah sebaliknya.
  assert(jenisSepadan(specs, BENTUK_INSTRUMEN),
    'cakupan jenis seharusnya masih sepadan');
});

Deno.test('M5-PARITY-DRIFT-VALIDATOR2: validator mengganti nama field wajib → paritas WAJIB gagal', () => {
  const specs = salinSpec();
  const f = specs.soal_latihan.murid.find(x => x.field === 'soal')!;
  f.field = 'butir_tugas';                       // nama yang tp02 pakai
  const pelanggaran = pelanggaranParitas(specs, salinBentuk());
  assert(pelanggaran.some(x => x.includes('soal_latihan') && x.includes('butir_tugas')),
    `penggantian nama di sisi validator tidak terdeteksi: ${pelanggaran.join(' | ')}`);
  assert(jenisSepadan(specs, BENTUK_INSTRUMEN));
});

Deno.test('M5-PARITY-DRIFT-VALIDATOR3: validator menambah sub-field wajib → paritas WAJIB gagal', () => {
  const specs = salinSpec();
  const f = specs.soal_latihan.murid.find(x => x.field === 'soal')!;
  f.wajib = [...(f.wajib ?? []), 'skor_maksimal'];
  const pelanggaran = pelanggaranParitas(specs, salinBentuk());
  assert(pelanggaran.some(x => x.includes('soal.skor_maksimal')),
    `sub-field wajib baru tidak terdeteksi: ${pelanggaran.join(' | ')}`);

  // Begitu pula sub-objek bersarang yang baru.
  const specs2 = salinSpec();
  const g = specs2.kartu_peran.murid.find(x => x.field === 'set')!;
  g.objek_wajib = { ...(g.objek_wajib ?? {}), peran_c: ['instruksi_peran'] };
  const p2 = pelanggaranParitas(specs2, salinBentuk());
  assert(p2.some(x => x.includes('set.peran_c')),
    `sub-objek wajib baru tidak terdeteksi: ${p2.join(' | ')}`);
});

Deno.test('M5-PARITY-DRIFT-CUSTOM: custom tetap dikecualikan, bukan ikut dituntut', () => {
  // Keputusan M5 tentang `custom` tidak dibuka ulang: ia longgar dengan sengaja.
  const specs = salinSpec();
  (specs as Record<string, unknown>).custom = { murid: [{ field: 'apa_pun', bentuk: 'teks' }] };
  const pelanggaran = pelanggaranParitas(specs, salinBentuk());
  assert(!pelanggaran.some(x => x.startsWith('custom')),
    `custom seharusnya dilewati paritas: ${pelanggaran.join(' | ')}`);
});

// ══ HIST — DOKUMEN HISTORIS TETAP TERBACA ═══════════════════════════════════

Deno.test('M5-HIST: kelima fixture historis tidak berubah temuannya di modus historis', async () => {
  const harapan: Record<string, number> = {
    'tp02.json': 0, 'tp03.json': 0, 'tp04.json': 0, 'tp05.json': 1, 'tp06.json': 1,
  };
  for (const [nama, jumlah] of Object.entries(harapan)) {
    const raw = JSON.parse(await Deno.readTextFile(new URL(nama, FIXTURES)));
    const h = raw._harapan;
    const hasil = validate(raw.konten, h.nomor_tp, h.jumlah_pertemuan, h.jp_per_pertemuan,
      h.durasi_jp, h.jumlah_murid, undefined, h.perangkat_digital_ok, false, false, false);
    assertEquals(hasil.errors.length, jumlah,
      `${nama}: ${jumlah} temuan diharapkan, dapat ${hasil.errors.length} — ${hasil.errors.join(' | ')}`);
    // Tidak satu pun temuan historis boleh berasal dari aturan M5.
    for (const e of hasil.errors) {
      assert(!/konten_murid\.|panduan_guru\.|tidak berisi apa pun|kunci jawaban/.test(e),
        `${nama}: aturan M5 bocor ke modus historis — ${e}`);
    }
  }
});

Deno.test('M5-HIST2: tp02 memang menyimpang bentuk — terukur, dan hanya di modus M5', async () => {
  // Temuan nyata, dicatat sebagai bukti dan bukan diperbaiki: instrumen tp02
  // LENGKAP dan kaya, tetapi model memakai nama field sendiri, dan panduan_guru
  // ASM-01 justru berbentuk matriks_observasi padahal jenisnya soal_latihan.
  // Modul historis tidak dihakimi surut; yang penting divergensinya tidak lagi
  // tak terlihat.
  const k = await fixtureHistoris();
  terima(cekHistoris(k));

  const h = cekM5(k);
  assert(!h.valid, 'tp02 seharusnya menyimpang dari kontrak bentuk di modus M5');
  const pesan = h.errors.join(' | ');
  assertStringIncludes(pesan, 'bagian_teks');     // nama field yang dipakai model
  assertStringIncludes(pesan, 'butir_tugas');
  assertStringIncludes(pesan, 'kolom_indikator'); // bentuk matriks_observasi di soal_latihan
});

// ══ GEN — JALUR PENYUSUNAN ══════════════════════════════════════════════════

Deno.test('M5-GEN: jalur penyusunan menyalakan kontrak M5 di KEDUA pemanggilan', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  const panggilan = [...src.matchAll(/validateModulOutputV400\(\s*merged[A-Za-z]*,[^;]*?\);/gs)].map(m => m[0]);
  assertEquals(panggilan.length, 2,
    `diharapkan tepat 2 pemanggilan validator di jalur penyusunan, dapat ${panggilan.length}`);
  for (const p of panggilan) {
    // wajibJejakWarisan (M2) + wajibKontrakAsesmenCurrent (M4) + wajibResourceCurrent (M5)
    assertStringIncludes(p, 'true, true, true');
    assertStringIncludes(p, 'manifestFaseD');
  }
  // Bawaannya tetap mati: dokumen lama tidak dihakimi surut.
  assertStringIncludes(src, 'wajibResourceCurrent = false');
});
