// M4 — RANTAI BUKTI ASESMEN.
//
// TP → tuntutan CP → KKTP → asesmen → instrumen → bukti per murid → keputusan.
//
// Sampai M3 rantai itu ada di dokumen tanpa satu sambungan pun diperiksa
// kecuali penempatan sumatif. Berkas ini menegakkannya, dan lima uji pertama
// (M4-REPRO-*) MEREPRODUKSI cacat yang ada lebih dulu: masing-masing
// menunjukkan bahwa dokumen cacat LOLOS di modus historis, lalu ditolak di
// modus kontrak sekarang.
//
// M4-A..M4-C     preferensi formatif: tidak ada jalan ke "mati"
// M4-D..M4-F     formatif wajib non-null
// M4-G..M4-K     KKTP → tuntutan CP, dan ID KKTP
// M4-L..M4-N     ambang keputusan terstruktur
// M4-O..M4-U     rencana formatif → peristiwa di kelas → instrumen
// M4-V..M4-AC    cakupan bukti per murid, sumatif, diagnostik
// M4-AD..M4-AF   integritas rujukan instrumen
// M4-AG          umpan balik formatif
// M4-AH..M4-AI   propagasi kontrak M3 (prompt + perbaikan) tanpa salinan tangan
// M4-AJ..M4-AL   modus historis vs sekarang, dan tp_kktp tetap tak disentuh
// M4-AM..M4-AO   manifest Fase A tetap berlaku di jalur PERBAIKAN (M4.1)
//
// TIDAK ADA panggilan model di berkas ini.

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  KONTRAK_ROOT, ENUM_KONTRAK, kerangkaFase, perintahPerbaikanStruktural,
} from '../supabase/functions/generate-modul/contract.ts';

const EF_MODUL = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);
const FIXTURES = new URL('./fixtures/modul/', import.meta.url);

type Validator = (
  raw: unknown, nomorTp: number, jumlahPertemuan: number, jpPerPertemuan: number,
  durasiJp: number, jumlahMurid: number | null, manifest?: unknown,
  perangkatDigitalOk?: boolean, wajibJejakWarisan?: boolean,
  wajibKontrakAsesmenCurrent?: boolean,
) => { valid: boolean; errors: string[] };

type PreferensiFormatif = { wajib: true; teknik: string | null; sumber: 'AUTO' | 'GURU' };
type Resolver = (am: Record<string, unknown> | null | undefined) => PreferensiFormatif;

/** Diambil dari SUMBER Edge Function, bukan disalin — pola yang sama dengan
 *  tests/modul-contract.test.ts dan tests/validator-modul.ts. Yang diuji adalah
 *  kode yang benar-benar dikirim, bukan salinannya di harness. */
async function muatEF(): Promise<{ validate: Validator; resolve: Resolver }> {
  const penuh = await Deno.readTextFile(EF_MODUL);
  const batas = penuh.indexOf('// ── EDGE FUNCTION ─');
  assert(batas > 0, 'penanda EDGE FUNCTION tidak ada di index.ts');
  const dir = new URL('.', EF_MODUL);
  const tmp = new URL(`._modul-assessment-${crypto.randomUUID()}.ts`, dir);
  try {
    await Deno.writeTextFile(tmp, penuh.slice(0, batas)
      + '\nexport { validateModulOutputV400, resolvePreferensiFormatif };\n');
    const mod = await import(tmp.href);
    return {
      validate: mod.validateModulOutputV400 as Validator,
      resolve:  mod.resolvePreferensiFormatif as Resolver,
    };
  } finally {
    await Deno.remove(tmp).catch(() => {});
  }
}

const { validate, resolve } = await muatEF();

type Konten = Record<string, unknown>;

/** Modul produksi yang memang sehat — titik berangkat semua uji di bawah. */
async function fixtureHistoris(): Promise<Konten> {
  const raw = JSON.parse(await Deno.readTextFile(new URL('tp02.json', FIXTURES)));
  return structuredClone(raw.konten) as Konten;
}

/** Argumen validasi tp02, dari `_harapan` fixture-nya sendiri. */
const ARG = [2, 3, 4, 40, 30] as const;

function cekHistoris(k: Konten) {
  return validate(k, ...ARG, undefined, false, false, false);
}
function cekSekarang(k: Konten) {
  // wajibJejakWarisan sengaja false: yang diuji berkas ini rantai bukti M4,
  // bukan jejak warisan M2 yang sudah punya ujinya sendiri.
  return validate(k, ...ARG, undefined, false, false, true);
}

/**
 * FIXTURE KONTRAK SEKARANG (M4 §27).
 *
 * Kelima fixture produksi adalah BUKTI HISTORIS dan tidak disentuh: temuan
 * dasarnya (tp02=0 … tp06=1) harus tetap sama di modus historis. Fixture
 * kontrak sekarang dibangun DI ATAS salah satunya, di sini, sehingga aturan
 * baru diuji tanpa memalsukan dokumen lama agar seolah patuh.
 *
 * Perhatikan cara jangkar formatif dibuat: sub_langkah yang SUDAH ADA diberi
 * `asesmen_ref`, bukan sub_langkah baru yang disisipkan. Menambah sub_langkah
 * akan merusak rantai durasi (Σsub_langkah = durasi langkah) yang V1/V2 jaga,
 * dan uji yang gagal karena aritmetika waktu tidak akan mengatakan apa pun
 * tentang rantai bukti.
 */
async function fixtureSekarang(): Promise<Konten> {
  const k = await fixtureHistoris();

  // Otoritas tuntutan CP: tp_anchor, sebagaimana Fase D memakukannya.
  k.tp_anchor = { tuntutan_id: ['T1', 'T2'] };

  k.kktp = [
    kktp('K1', ['T1'], ['ASM-01'], { jenis: 'jumlah', nilai_minimum: 4, satuan: 'simbol', deskripsi: 'Benar minimal 4 dari 5 simbol.' }),
    kktp('K2', ['T1'], ['ASM-01'], { jenis: 'rubrik', nilai_minimum: 3, satuan: 'level', deskripsi: 'Mencapai level Mandiri.' }),
    kktp('K3', ['T2'], ['ASM-01'], { jenis: 'persentase', nilai_minimum: 75, satuan: 'persen dari 4 tahapan', deskripsi: '3 dari 4 tahapan konsultasi runtut.' }),
  ];

  k.rencana_asesmen = {
    asesmen_diagnostik: null,
    asesmen_formatif: [formatif('FMT-01', 1, 'MEMAHAMI', ['K1', 'K2'], ['ASM-01'], 'per_murid')],
    asesmen_sumatif: {
      deskripsi:      'Uji lisan terstruktur simulasi konsultasi penanganan kain.',
      teknik:         'tes_lisan',
      instrumen_ref:  ['ASM-01'],
      durasi_menit:   80,
      referensi_kktp: ['K1', 'K2', 'K3'],
      cakupan_bukti:  'per_murid',
      placement:      { fase: 'MENGAPLIKASI', pertemuan: 3 },
    },
  };

  jangkar(k, 1, 'MEMAHAMI', 1, 'FMT-01', ['PBL-01', 'ASM-01']);
  return k;
}

function kktp(id: string, tuntutan: string[], bukti: string[], keputusan: unknown): Konten {
  return {
    id_kktp: id,
    kriteria: `Kriteria terukur untuk ${id} yang dapat diamati guru saat murid bekerja.`,
    tuntutan_ref: tuntutan,
    keputusan_ketercapaian: keputusan,
    ambang_batas: 'minimal 4 dari 5 aspek',
    instrumen_bukti: bukti,
  };
}

function formatif(
  id: string, pertemuan: number, langkah: string, kktpRef: string[],
  instrumen: string[], cakupan: string,
): Konten {
  return {
    id, waktu_pertemuan: pertemuan, fase_langkah: langkah,
    teknik: 'observasi', instrumen_ref: instrumen,
    fungsi: 'Memeriksa pemahaman murid sebelum tahap penerapan.',
    referensi_kktp: kktpRef, cakupan_bukti: cakupan,
    umpan_balik: 'Guru mengoreksi bersama simbol yang paling banyak salah, lalu murid mengulang bagian itu.',
  };
}

/** Memberi `asesmen_ref` pada sub_langkah yang SUDAH ADA — lihat catatan di
 *  fixtureSekarang() tentang mengapa bukan menyisipkan sub_langkah baru. */
function jangkar(
  k: Konten, pertemuan: number, namaLangkah: string, nomorSub: number,
  ref: string | null, instrumenRef?: string[],
) {
  const p = (k.pertemuan as Konten[])[pertemuan - 1];
  const lk = (p.langkah as Konten[]).find(l => l.nama === namaLangkah);
  assert(lk, `langkah ${namaLangkah} tidak ada di pertemuan ${pertemuan}`);
  const sl = (lk!.sub_langkah as Konten[])[nomorSub - 1];
  assert(sl, `sub_langkah ${nomorSub} tidak ada`);
  if (ref === null) delete sl.asesmen_ref;
  else sl.asesmen_ref = ref;
  if (instrumenRef) sl.instrumen_ref = instrumenRef;
}

function ra(k: Konten): Konten {
  return k.rencana_asesmen as Konten;
}
function fmt(k: Konten, i = 0): Konten {
  return (ra(k).asesmen_formatif as Konten[])[i];
}

/** Menegaskan bahwa dokumen ditolak DAN sebabnya yang dimaksud. Menguji hanya
 *  `valid === false` akan lulus karena alasan yang salah. */
function tolak(hasil: { valid: boolean; errors: string[] }, potongan: string) {
  assert(!hasil.valid, `diharapkan DITOLAK, tapi lolos`);
  assert(
    hasil.errors.some(e => e.includes(potongan)),
    `tidak ada galat yang menyebut "${potongan}".\nGalat: ${hasil.errors.join(' | ')}`,
  );
}
function terima(hasil: { valid: boolean; errors: string[] }) {
  assert(hasil.valid, `diharapkan LOLOS, ditolak karena: ${hasil.errors.join(' | ')}`);
}

// ══ REPRODUKSI CACAT — keadaan SEBELUM M4 ═══════════════════════════════════
//
// Kelimanya wajib dibuktikan ada sebelum diperbaiki. Kalau salah satu uji ini
// mulai gagal, artinya cacatnya sudah tidak ada dan aturannya boleh dicabut.

Deno.test('M4-REPRO-1: asesmen_formatif=null lolos di modus historis', async () => {
  const k = await fixtureHistoris();
  assertEquals(ra(k).asesmen_formatif, null, 'fixture produksi ini memang tanpa formatif');
  terima(cekHistoris(k));   // inilah cacatnya: modul tanpa cek pemahaman, lolos
  tolak(cekSekarang(k), 'asesmen_formatif harus array');
});

Deno.test('M4-REPRO-2: KKTP historis tidak punya kaitan ke tuntutan CP', async () => {
  const k = await fixtureHistoris();
  for (const item of k.kktp as Konten[]) {
    assertEquals(item.tuntutan_ref, undefined, 'KKTP historis memang tanpa tuntutan_ref');
  }
  terima(cekHistoris(k));
  tolak(cekSekarang(k), 'tuntutan_ref kosong');
});

Deno.test('M4-REPRO-3: rencana formatif boleh tanpa peristiwa di kelas', async () => {
  const k = await fixtureSekarang();
  jangkar(k, 1, 'MEMAHAMI', 1, null);        // rencananya tetap, peristiwanya hilang
  terima(cekHistoris(k));
  tolak(cekSekarang(k), 'rencana asesmen tanpa peristiwa di kelas');
});

Deno.test('M4-REPRO-4: KKTP tanpa bukti per murid mana pun boleh lolos', async () => {
  const k = await fixtureSekarang();
  ra(k).asesmen_sumatif = null;
  jangkar(k, 3, 'MENGAPLIKASI', 2, null);    // buang penanda SUMATIF yang jadi yatim
  fmt(k).referensi_kktp = ['K1'];            // K2 dan K3 kehilangan seluruh buktinya
  terima(cekHistoris(k));
  tolak(cekSekarang(k), 'KKTP K3 tidak punya jalur bukti apa pun');
});

Deno.test('M4-REPRO-5: instrumen_bukti boleh terputus dari asesmennya', async () => {
  const k = await fixtureSekarang();
  ra(k).asesmen_sumatif = null;
  jangkar(k, 3, 'MENGAPLIKASI', 2, null);
  (k.instrumen_asesmen as Konten[]).push({
    id: 'ASM-02', judul: 'Lembar pengamatan kedua', jenis: 'matriks_observasi',
    untuk_murid: false, digunakan_pada: ['P1.MEMAHAMI'], konten_murid: null, panduan_guru: {},
  });
  // K3 menunjuk ASM-02, tetapi tidak ada asesmen per murid untuk K3 yang memakainya.
  (k.kktp as Konten[])[2].instrumen_bukti = ['ASM-02'];
  fmt(k).referensi_kktp = ['K1', 'K2', 'K3'];
  terima(cekHistoris(k));
  tolak(cekSekarang(k), 'terputus dari asesmennya');
});

// ══ FIXTURE KONTRAK SEKARANG ITU SENDIRI SEHAT ══════════════════════════════

Deno.test('M4-BASE: fixture kontrak sekarang lolos di kedua modus', async () => {
  const k = await fixtureSekarang();
  terima(cekHistoris(k));
  terima(cekSekarang(k));
});

// ══ A–C — PREFERENSI FORMATIF: TIDAK ADA JALAN KE "MATI" ════════════════════

Deno.test("M4-A: gunakan_formatif=false historis menjadi AUTO, bukan mati", () => {
  for (const nilai of ['lewati', 'tidak', false]) {
    const p = resolve({ gunakan_formatif: nilai });
    assertEquals(p.wajib, true, `nilai ${JSON.stringify(nilai)} tidak boleh mematikan formatif`);
    assertEquals(p.sumber, 'AUTO');
    assertEquals(p.teknik, null);
  }
});

Deno.test('M4-B: null / tidak ada field menjadi AUTO', () => {
  for (const am of [{ gunakan_formatif: null }, {}, null, undefined]) {
    const p = resolve(am as Record<string, unknown> | null | undefined);
    assertEquals(p.wajib, true);
    assertEquals(p.sumber, 'AUTO');
    assertEquals(p.teknik, null);
  }
});

Deno.test('M4-C: true + teknik didukung mempertahankan pilihan guru', () => {
  for (const teknik of ['tanya_jawab', 'observasi', 'latihan_singkat', 'refleksi']) {
    const p = resolve({ gunakan_formatif: 'ya', teknik_formatif: teknik });
    assertEquals(p.sumber, 'GURU', `teknik ${teknik} seharusnya dipertahankan`);
    assertEquals(p.teknik, teknik);
    assertEquals(p.wajib, true);
  }
});

Deno.test('M4-C2: jawaban BARU tanpa gunakan_formatif tetap dibaca', () => {
  // Pertanyaan sekarang hanya menyimpan teknik_formatif; tidak ada gunakan_*.
  assertEquals(resolve({ teknik_formatif: 'refleksi' }).sumber, 'GURU');
  assertEquals(resolve({ teknik_formatif: 'rekomendasi' }).sumber, 'AUTO');
  // Teknik yang tidak didukung tidak boleh menjadi janji kosong kepada guru.
  assertEquals(resolve({ teknik_formatif: 'wawancara_orang_tua' }).sumber, 'AUTO');
});

Deno.test('M4-C3: resolver TIDAK PERNAH menghasilkan "mati"', () => {
  const masukan: unknown[] = [
    null, undefined, {}, { gunakan_formatif: 'lewati' }, { gunakan_formatif: false },
    { gunakan_formatif: null }, { gunakan_formatif: 'ya' },
    { gunakan_formatif: 'lewati', teknik_formatif: 'observasi' },
    { teknik_formatif: null }, { teknik_formatif: '' },
  ];
  for (const m of masukan) {
    assertEquals(resolve(m as Record<string, unknown>).wajib, true,
      `masukan ${JSON.stringify(m)} menghasilkan formatif tidak wajib`);
  }
});

// ══ D–F — FORMATIF WAJIB NON-NULL ═══════════════════════════════════════════

Deno.test('M4-D: asesmen_formatif=null ditolak di kontrak sekarang', async () => {
  const k = await fixtureSekarang();
  ra(k).asesmen_formatif = null;
  tolak(cekSekarang(k), 'tidak boleh null');
});

Deno.test('M4-E: asesmen_formatif=[] ditolak', async () => {
  const k = await fixtureSekarang();
  ra(k).asesmen_formatif = [];
  tolak(cekSekarang(k), 'harus array ≥ 1 entri');
});

Deno.test('M4-F: ≥ 1 formatif sah melewati gerbang keberadaan asesmen', async () => {
  const k = await fixtureSekarang();
  const h = cekSekarang(k);
  terima(h);
  assertEquals((ra(k).asesmen_formatif as Konten[]).length >= 1, true);
});

// ══ G–K — KKTP → TUNTUTAN CP, DAN ID KKTP ═══════════════════════════════════

Deno.test('M4-G: KKTP tanpa tuntutan_ref ditolak', async () => {
  const k = await fixtureSekarang();
  delete (k.kktp as Konten[])[1].tuntutan_ref;
  tolak(cekSekarang(k), 'kktp[1].tuntutan_ref kosong');

  const k2 = await fixtureSekarang();
  (k2.kktp as Konten[])[1].tuntutan_ref = [];
  tolak(cekSekarang(k2), 'kktp[1].tuntutan_ref kosong');
});

Deno.test('M4-H: tuntutan_ref asing ditolak', async () => {
  const k = await fixtureSekarang();
  (k.kktp as Konten[])[0].tuntutan_ref = ['T9'];
  tolak(cekSekarang(k), "tuntutan_ref='T9' bukan tuntutan TP ini");
});

Deno.test('M4-I: satu tuntutan TP yang tidak terpetakan ditolak', async () => {
  const k = await fixtureSekarang();
  // K3 satu-satunya yang memikul T2; dialihkan ke T1, T2 kehilangan pengukurnya.
  (k.kktp as Konten[])[2].tuntutan_ref = ['T1'];
  tolak(cekSekarang(k), 'tuntutan CP tidak terpetakan ke KKTP mana pun: T2');
});

Deno.test('M4-J: gabungan pemetaan lengkap diterima', async () => {
  const k = await fixtureSekarang();
  terima(cekSekarang(k));

  // Satu tuntutan boleh dilayani lebih dari satu KKTP.
  const k2 = await fixtureSekarang();
  (k2.kktp as Konten[])[2].tuntutan_ref = ['T1', 'T2'];
  terima(cekSekarang(k2));
});

Deno.test('M4-K: id KKTP ganda / di luar urutan ditolak', async () => {
  const k = await fixtureSekarang();
  (k.kktp as Konten[])[1].id_kktp = 'K1';           // ganda
  tolak(cekSekarang(k), "kktp[1].id_kktp='K1'");

  const k2 = await fixtureSekarang();
  (k2.kktp as Konten[])[2].id_kktp = '';            // kosong
  tolak(cekSekarang(k2), 'kktp[2].id_kktp=');
});

// ══ L–N — AMBANG KEPUTUSAN TERSTRUKTUR ══════════════════════════════════════

Deno.test('M4-L: keputusan_ketercapaian hilang ditolak di kontrak sekarang', async () => {
  const k = await fixtureSekarang();
  delete (k.kktp as Konten[])[0].keputusan_ketercapaian;
  tolak(cekSekarang(k), 'kktp[0].keputusan_ketercapaian tidak ada');
  // ambang_batas berupa kalimat TIDAK boleh menyelamatkannya.
  assertEquals(typeof (k.kktp as Konten[])[0].ambang_batas, 'string');
});

Deno.test('M4-M: nilai_minimum tidak sah ditolak', async () => {
  for (const nilai of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, '4', null]) {
    const k = await fixtureSekarang();
    ((k.kktp as Konten[])[0].keputusan_ketercapaian as Konten).nilai_minimum = nilai;
    tolak(cekSekarang(k), 'nilai_minimum');
  }
});

Deno.test('M4-M2: jenis di luar enum, satuan/deskripsi kosong ditolak', async () => {
  const k = await fixtureSekarang();
  ((k.kktp as Konten[])[0].keputusan_ketercapaian as Konten).jenis = 'perasaan';
  tolak(cekSekarang(k), 'keputusan_ketercapaian.jenis=');

  const k2 = await fixtureSekarang();
  ((k2.kktp as Konten[])[1].keputusan_ketercapaian as Konten).satuan = '  ';
  tolak(cekSekarang(k2), 'keputusan_ketercapaian.satuan kosong');

  const k3 = await fixtureSekarang();
  ((k3.kktp as Konten[])[1].keputusan_ketercapaian as Konten).deskripsi = '';
  tolak(cekSekarang(k3), 'keputusan_ketercapaian.deskripsi kosong');
});

Deno.test('M4-N: ketiga jenis ambang terstruktur yang sah diterima', async () => {
  for (const jenis of ENUM_KONTRAK.jenis_keputusan) {
    const k = await fixtureSekarang();
    ((k.kktp as Konten[])[0].keputusan_ketercapaian as Konten).jenis = jenis;
    terima(cekSekarang(k));
  }
});

// ══ O–U — RENCANA FORMATIF → PERISTIWA → INSTRUMEN ══════════════════════════

Deno.test('M4-O: id formatif ganda / di luar urutan ditolak', async () => {
  const k = await fixtureSekarang();
  (ra(k).asesmen_formatif as Konten[]).push(
    formatif('FMT-01', 2, 'MEMAHAMI', ['K3'], ['ASM-01'], 'per_murid'));
  jangkar(k, 2, 'MEMAHAMI', 1, 'FMT-01', ['ASM-01']);
  tolak(cekSekarang(k), "asesmen_formatif[1].id='FMT-01' ganda");

  const k2 = await fixtureSekarang();
  fmt(k2).id = 'F1';   // ejaan lama
  tolak(cekSekarang(k2), "diharapkan 'FMT-01'");
});

Deno.test('M4-P: formatif tanpa jangkar pertemuan/langkah/asesmen_ref ditolak', async () => {
  // (a) pertemuan di luar jangkauan
  const a = await fixtureSekarang();
  fmt(a).waktu_pertemuan = 9;
  tolak(cekSekarang(a), 'di luar jangkauan');

  // (b) langkah yang disebut tidak ada di pertemuan itu.
  //
  // Keenam langkah selalu ada di modul yang sehat, jadi cabang ini hanya
  // tercapai kalau langkahnya benar-benar hilang — sifatnya penjaga terhadap
  // keluaran Fase B yang rusak. Menunjuk langkah yang ADA tapi tanpa jangkar
  // ditangani (c) di bawah.
  const b = await fixtureSekarang();
  const langkahP1 = (b.pertemuan as Konten[])[0].langkah as Konten[];
  (b.pertemuan as Konten[])[0].langkah = langkahP1.filter(l => l.nama !== 'MEREFLEKSI');
  fmt(b).fase_langkah = 'MEREFLEKSI';
  tolak(cekSekarang(b), "fase_langkah='MEREFLEKSI' tidak ada di pertemuan 1");

  // (c) tidak ada sub_langkah dengan asesmen_ref yang cocok
  const c = await fixtureSekarang();
  jangkar(c, 1, 'MEMAHAMI', 1, null);
  tolak(cekSekarang(c), "tidak punya sub_langkah dengan asesmen_ref='FMT-01'");

  // (d) jangkar ganda — kontraknya TEPAT SATU
  const d = await fixtureSekarang();
  jangkar(d, 1, 'MEMAHAMI', 2, 'FMT-01', ['ASM-01']);
  tolak(cekSekarang(d), "harus tepat 1");
});

Deno.test('M4-Q: jangkar formatif yang ada diterima', async () => {
  const k = await fixtureSekarang();
  terima(cekSekarang(k));
});

Deno.test('M4-R: instrumen formatif di luar manifest ditolak', async () => {
  const k = await fixtureSekarang();
  const manifest = {
    pembelajaran_manifest: [],
    asesmen_manifest: [{ id: 'ASM-99', jenis: 'soal_latihan', untuk_murid: true, digunakan_pada: [] }],
  };
  const h = validate(k, ...ARG, manifest, false, false, true);
  tolak(h, "instrumen_ref='ASM-01' tidak ada di manifest asesmen");
});

Deno.test('M4-S: instrumen formatif tidak ada di instrumen_asesmen[] final ditolak', async () => {
  const k = await fixtureSekarang();
  fmt(k).instrumen_ref = ['ASM-77'];
  jangkar(k, 1, 'MEMAHAMI', 1, 'FMT-01', ['ASM-77']);
  tolak(cekSekarang(k), "instrumen_ref='ASM-77' tidak ada di instrumen_asesmen[]");
});

Deno.test('M4-T: sub_langkah pelaksana tidak memakai instrumen yang diklaim → ditolak', async () => {
  const k = await fixtureSekarang();
  jangkar(k, 1, 'MEMAHAMI', 1, 'FMT-01', ['PBL-01']);   // ASM-01 dilepas
  tolak(cekSekarang(k), 'tidak memakai instrumen ASM-01');
});

Deno.test('M4-U: sub_langkah pelaksana memakai instrumennya → diterima', async () => {
  const k = await fixtureSekarang();
  jangkar(k, 1, 'MEMAHAMI', 1, 'FMT-01', ['ASM-01', 'PBL-01']);
  terima(cekSekarang(k));
});

// ══ V–AC — CAKUPAN BUKTI PER MURID, SUMATIF, DIAGNOSTIK ═════════════════════

/** Modul tanpa sumatif — bukti seluruhnya dari formatif. */
async function tanpaSumatif(): Promise<Konten> {
  const k = await fixtureSekarang();
  ra(k).asesmen_sumatif = null;
  jangkar(k, 3, 'MENGAPLIKASI', 2, null);
  fmt(k).referensi_kktp = ['K1', 'K2', 'K3'];
  return k;
}

Deno.test('M4-V: KKTP yang hanya punya bukti kelompok ditolak', async () => {
  const k = await tanpaSumatif();
  fmt(k).cakupan_bukti = 'kelompok';
  tolak(cekSekarang(k), 'hanya punya bukti kelompok');
});

Deno.test('M4-W: KKTP dengan bukti per murid diterima', async () => {
  terima(cekSekarang(await tanpaSumatif()));
});

Deno.test('M4-X: satu dari beberapa KKTP tanpa bukti per murid ditolak', async () => {
  const k = await tanpaSumatif();
  fmt(k).referensi_kktp = ['K1', 'K2'];
  (ra(k).asesmen_formatif as Konten[]).push(
    formatif('FMT-02', 2, 'MENGAPLIKASI', ['K3'], ['ASM-01'], 'kelompok'));
  jangkar(k, 2, 'MENGAPLIKASI', 1, 'FMT-02', ['ASM-01']);
  tolak(cekSekarang(k), 'KKTP K3 hanya punya bukti kelompok');
});

Deno.test('M4-Y: seluruh KKTP punya bukti per murid → diterima', async () => {
  const k = await tanpaSumatif();
  fmt(k).referensi_kktp = ['K1', 'K2'];
  (ra(k).asesmen_formatif as Konten[]).push(
    formatif('FMT-02', 2, 'MENGAPLIKASI', ['K3'], ['ASM-01'], 'per_murid'));
  jangkar(k, 2, 'MENGAPLIKASI', 1, 'FMT-02', ['ASM-01']);
  terima(cekSekarang(k));
});

Deno.test('M4-Z: bukti diagnostik TIDAK memenuhi cakupan KKTP', async () => {
  const k = await tanpaSumatif();
  fmt(k).referensi_kktp = ['K1', 'K2'];
  // Diagnostik yang menyebut K3 dan per murid sekalipun tidak boleh menutupnya:
  // memetakan titik awal bukan membuktikan ketercapaian.
  ra(k).asesmen_diagnostik = {
    tujuan: 'Memetakan kemampuan awal murid membaca label perawatan.',
    teknik: 'pemetaan_awal', instrumen_ref: ['ASM-01'],
    waktu: 'Pertemuan 1', penggunaan_hasil: 'Menentukan kelompok dukungan.',
    referensi_kktp: ['K3'], cakupan_bukti: 'per_murid',
  };
  tolak(cekSekarang(k), 'KKTP K3 tidak punya jalur bukti apa pun');
});

Deno.test('M4-AA: sumatif null + formatif menutup semua KKTP → diterima', async () => {
  const k = await tanpaSumatif();
  assertEquals(ra(k).asesmen_sumatif, null);
  terima(cekSekarang(k));
});

Deno.test('M4-AA2: sumatif null tetapi penanda SUMATIF yatim → ditolak', async () => {
  const k = await tanpaSumatif();
  jangkar(k, 3, 'MENGAPLIKASI', 2, 'SUMATIF');
  tolak(cekSekarang(k), "asesmen_ref='SUMATIF' padahal asesmen_sumatif=null");
});

Deno.test('M4-AB: sumatif per murid boleh menyumbang cakupan', async () => {
  const k = await fixtureSekarang();
  // Formatif hanya menutup K1 dan K2; K3 ditutup sumatif per murid.
  fmt(k).referensi_kktp = ['K1', 'K2'];
  terima(cekSekarang(k));

  // Kalau sumatifnya kelompok, K3 kehilangan bukti per muridnya.
  const k2 = await fixtureSekarang();
  fmt(k2).referensi_kktp = ['K1', 'K2'];
  (ra(k2).asesmen_sumatif as Konten).cakupan_bukti = 'kelompok';
  tolak(cekSekarang(k2), 'KKTP K3 hanya punya bukti kelompok');
});

Deno.test('M4-AC: referensi_kktp asing di sumatif ditolak', async () => {
  const k = await fixtureSekarang();
  (ra(k).asesmen_sumatif as Konten).referensi_kktp = ['K1', 'K9'];
  tolak(cekSekarang(k), "asesmen_sumatif.referensi_kktp='K9' bukan KKTP");

  const k2 = await fixtureSekarang();
  (ra(k2).asesmen_sumatif as Konten).referensi_kktp = [];
  tolak(cekSekarang(k2), 'asesmen_sumatif.referensi_kktp kosong');
});

Deno.test('M4-AC2: referensi_kktp asing di formatif ditolak', async () => {
  const k = await fixtureSekarang();
  fmt(k).referensi_kktp = ['K9'];
  tolak(cekSekarang(k), "referensi_kktp='K9' bukan KKTP di modul ini");
});

Deno.test('M4-AC3: cakupan_bukti di luar enum ditolak', async () => {
  const k = await fixtureSekarang();
  fmt(k).cakupan_bukti = 'per_meja';
  tolak(cekSekarang(k), 'cakupan_bukti=');

  const k2 = await fixtureSekarang();
  delete (ra(k2).asesmen_sumatif as Konten).cakupan_bukti;
  tolak(cekSekarang(k2), 'asesmen_sumatif.cakupan_bukti=');
});

// ══ AD–AF — INTEGRITAS RUJUKAN INSTRUMEN ════════════════════════════════════

Deno.test('M4-AD: instrumen_bukti berupa ID hantu ditolak', async () => {
  const k = await fixtureSekarang();
  (k.kktp as Konten[])[0].instrumen_bukti = ['ASM-404'];
  tolak(cekSekarang(k), "instrumen_bukti='ASM-404' tidak ada di instrumen_asesmen[]");

  const k2 = await fixtureSekarang();
  (k2.kktp as Konten[])[0].instrumen_bukti = [];
  tolak(cekSekarang(k2), 'kktp[0].instrumen_bukti kosong');
});

Deno.test('M4-AE: instrumen_bukti ada tapi tak dipakai jalur bukti KKTP itu → ditolak', async () => {
  const k = await fixtureSekarang();
  (k.instrumen_asesmen as Konten[]).push({
    id: 'ASM-02', judul: 'Lembar pengamatan kedua', jenis: 'matriks_observasi',
    untuk_murid: false, digunakan_pada: ['P1.MEMAHAMI'], konten_murid: null, panduan_guru: {},
  });
  (k.kktp as Konten[])[0].instrumen_bukti = ['ASM-02'];   // ada, tapi tidak dipakai untuk K1
  tolak(cekSekarang(k), 'terputus dari asesmennya');
});

Deno.test('M4-AF: instrumen asesmen final yang tidak dipakai di mana pun ditolak', async () => {
  const k = await fixtureSekarang();
  (k.instrumen_asesmen as Konten[]).push({
    id: 'ASM-03', judul: 'Lembar yang tak pernah dipakai', jenis: 'lembar_refleksi',
    untuk_murid: false, digunakan_pada: [], konten_murid: null, panduan_guru: {},
  });
  tolak(cekSekarang(k), "instrumen_asesmen 'ASM-03' tidak dipakai jalur asesmen mana pun");
});

// ══ AG — UMPAN BALIK FORMATIF ═══════════════════════════════════════════════

Deno.test('M4-AG: umpan_balik formatif kosong ditolak', async () => {
  for (const nilai of ['', '   ', null, undefined]) {
    const k = await fixtureSekarang();
    if (nilai === undefined) delete fmt(k).umpan_balik;
    else fmt(k).umpan_balik = nilai;
    tolak(cekSekarang(k), 'umpan_balik kosong');
  }
});

// ══ AH–AI — PROPAGASI KONTRAK M3, TANPA SALINAN TANGAN ══════════════════════

Deno.test('M4-AH: kerangka prompt Fase A memuat bentuk M4 dari kontrak', () => {
  const kerangka = kerangkaFase('A');

  // Formatif tidak lagi ditawarkan sebagai null.
  assertStringIncludes(kerangka, '"asesmen_formatif": [{');
  assert(!/"asesmen_formatif": null/.test(kerangka),
    'kerangka masih menawarkan asesmen_formatif null');
  // Diagnostik dan sumatif TETAP boleh null — keduanya memang pilihan guru.
  assertStringIncludes(kerangka, '"asesmen_diagnostik": null |');
  assertStringIncludes(kerangka, '"asesmen_sumatif": null |');

  // Field M4 dan enumnya, disisipkan dari ENUM_KONTRAK — bukan ditulis tangan.
  for (const potongan of ['tuntutan_ref', 'keputusan_ketercapaian', 'cakupan_bukti',
                          'referensi_kktp', 'FMT-01']) {
    assertStringIncludes(kerangka, potongan);
  }
  for (const v of ENUM_KONTRAK.jenis_keputusan) assertStringIncludes(kerangka, `"${v}"`);
  for (const v of ENUM_KONTRAK.cakupan_bukti)   assertStringIncludes(kerangka, `"${v}"`);
});

Deno.test('M4-AH2: SYSTEM_PROMPT tidak memuat kerangka asesmen tulisan tangan', async () => {
  const sumber = await Deno.readTextFile(EF_MODUL);
  const prompt = sumber.slice(sumber.indexOf('// ── SYSTEM PROMPT V4.0 ─'),
                              sumber.indexOf('// ── EDGE FUNCTION ─'));
  // Pernyataan lama yang membolehkan formatif null tidak boleh hidup lagi.
  assert(!/asesmen_formatif = null/.test(prompt),
    'SYSTEM_PROMPT masih menyatakan asesmen_formatif boleh null');
  // Bentuk JSON-nya hanya boleh berasal dari kontrak, bukan diketik ulang.
  assert(!/"asesmen_formatif":\s*null\s*\|/.test(prompt),
    'ada salinan kerangka asesmen tulisan tangan di SYSTEM_PROMPT');
});

Deno.test('M4-AI: pesan perbaikan ikut membawa bentuk M4 otomatis', () => {
  const perFase = perintahPerbaikanStruktural('A');
  for (const potongan of ['tuntutan_ref', 'keputusan_ketercapaian', 'cakupan_bukti', 'FMT-01']) {
    assertStringIncludes(perFase, potongan);
  }
  // Perbaikan berlingkup fase tetap menyebut tanggung jawab Fase A saja.
  assertStringIncludes(perFase, 'rencana_asesmen');
  assert(!perFase.includes('naskah_fasilitasi'),
    'perbaikan Fase A tidak boleh menuntut keluaran fase lain');

  // Dan lingkup dokumen final tetap menyebut rencana_asesmen sebagai akar wajib.
  assertStringIncludes(perintahPerbaikanStruktural(), 'rencana_asesmen');
});

Deno.test('M4-AI2: kontrak menyatakan formatif wajib di satu tempat saja', () => {
  const f = KONTRAK_ROOT.rencana_asesmen;
  assertEquals(f.required, true);
  assertStringIncludes(f.catatan ?? '', 'TIDAK BOLEH null');
  // Bentuknya sendiri yang menjadi otoritas — bukan komentar di validator.
  assert(!/"asesmen_formatif": null/.test(f.bentuk ?? ''));
});

// ══ AJ–AL — MODUS HISTORIS vs SEKARANG ══════════════════════════════════════

Deno.test('M4-AJ: kelima fixture historis tetap terbaca di modus historis', async () => {
  const harapan: Record<string, number> = {
    'tp02.json': 0, 'tp03.json': 0, 'tp04.json': 0, 'tp05.json': 1, 'tp06.json': 1,
  };
  for (const [nama, jumlah] of Object.entries(harapan)) {
    const raw = JSON.parse(await Deno.readTextFile(new URL(nama, FIXTURES)));
    const h = raw._harapan;
    const hasil = validate(
      raw.konten, h.nomor_tp, h.jumlah_pertemuan, h.jp_per_pertemuan, h.durasi_jp,
      h.jumlah_murid, undefined, h.perangkat_digital_ok, false, false,
    );
    assertEquals(hasil.errors.length, jumlah,
      `${nama}: ${jumlah} temuan diharapkan, dapat ${hasil.errors.length} — ${hasil.errors.join(' | ')}`);
    // Tidak satu pun temuannya boleh berasal dari aturan M4.
    for (const e of hasil.errors) {
      for (const kata of ['tuntutan_ref', 'keputusan_ketercapaian', 'cakupan_bukti', 'FMT-']) {
        assert(!e.includes(kata), `${nama}: aturan M4 bocor ke modus historis — ${e}`);
      }
    }
  }
});

Deno.test('M4-AK: jalur penyusunan selalu menyalakan modus kontrak sekarang', async () => {
  const sumber = await Deno.readTextFile(EF_MODUL);
  const panggilan = [...sumber.matchAll(/validateModulOutputV400\(\s*merged[A-Za-z]*,[^;]*?\);/gs)];
  assert(panggilan.length >= 2,
    `diharapkan ≥ 2 pemanggilan validator di jalur penyusunan, dapat ${panggilan.length}`);
  for (const p of panggilan) {
    assertStringIncludes(p[0], 'true, true');   // wajibJejakWarisan + kontrak M4
  }

  // Dan bawaan parameternya tetap false: dokumen lama tidak dihakimi surut.
  assertStringIncludes(sumber, 'wajibKontrakAsesmenCurrent = false');
});

Deno.test('M4-AL: generate-modul tetap tidak menyentuh tp_kktp', async () => {
  const sumber = await Deno.readTextFile(EF_MODUL);

  // Setiap penyebutan tp_kktp wajib berada di dalam komentar. Yang ada sekarang
  // justru catatan M1 yang menjelaskan MENGAPA tabel itu tidak dibaca —
  // termasuk contoh query yang sengaja dilumpuhkan sebagai penjelasan.
  const barisAktif: string[] = [];
  for (const baris of sumber.split('\n')) {
    const t = baris.trim();
    if (!t.includes('tp_kktp')) continue;
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    barisAktif.push(t);
  }
  assertEquals(barisAktif, [], `tp_kktp muncul di kode aktif: ${barisAktif.join(' | ')}`);
});

// ══ PERTANYAAN GURU (M4 §26) ════════════════════════════════════════════════

const FLOW = new URL('../guru/js/rancang-chat-flow.js', import.meta.url);

Deno.test('M4-UI-1: tidak ada lagi jalan mematikan formatif di pertanyaan guru', async () => {
  const src = await Deno.readTextFile(FLOW);
  const aktif = src.split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');
  assert(!/pilihan\(\s*'gunakan_formatif'/.test(aktif),
    'pertanyaan gunakan_formatif (ya/lewati) masih ada');
  assert(!/tidak perlu asesmen selama proses/.test(aktif),
    'opsi "tidak perlu asesmen selama proses" masih ditawarkan');
});

Deno.test('M4-UI-2: "Serahkan kepada MiClass" ada di pertanyaan teknik formatif', async () => {
  const src = await Deno.readTextFile(FLOW);
  const i = src.indexOf("pilihan('teknik_formatif'");
  assert(i > 0, 'pertanyaan teknik_formatif tidak ditemukan');
  const blok = src.slice(i, i + 1400);
  assertStringIncludes(blok, 'Serahkan kepada MiClass');
  // Tidak lagi bersyarat pada tombol yang sudah tidak ada.
  assert(!/condition:\s*\{\s*question_id:\s*'gunakan_formatif'/.test(blok),
    'teknik_formatif masih bersyarat pada gunakan_formatif');
});

Deno.test('M4-UI-3: jumlah pertanyaan asesmen TIDAK bertambah', async () => {
  const src = await Deno.readTextFile(FLOW);
  const aktif = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  const ids = [...aktif.matchAll(/pilihan\(\s*'([a-z0-9_]+)'/g)].map(m => m[1]);
  const asesmen = ids.filter(id => /^(gunakan|teknik|instrumen)_/.test(id));
  // Sebelum M4: gunakan_formatif + teknik_formatif = 2 pertanyaan formatif.
  // Sesudah M4: teknik_formatif saja = 1. Turun satu, tidak bertambah.
  const formatif = asesmen.filter(id => id.includes('form') || id.endsWith('_formatif'));
  assertEquals(formatif.includes('gunakan_formatif'), false);
  assertEquals(formatif.includes('teknik_formatif'), true);
  // Sebelum M4 daftar ini berisi 14 pertanyaan; sekarang 13. Batasnya ditulis
  // sebagai "tidak lebih dari 13" supaya penambahan pertanyaan baru — termasuk
  // yang niatnya baik — menjatuhkan uji ini, bukan lolos diam-diam.
  assertEquals(asesmen.length, 13,
    `jumlah pertanyaan asesmen berubah menjadi ${asesmen.length}: ${asesmen.join(', ')}`);
});

Deno.test('M4-UI-4: teknik yang ditawarkan hanya yang benar-benar didukung', async () => {
  const src = await Deno.readTextFile(FLOW);
  const i = src.indexOf("pilihan('teknik_formatif'");
  assert(i > 0, 'pertanyaan teknik_formatif tidak ditemukan');
  // Berhenti di penutup daftar opsi pertanyaan INI — tanpa batas ini potongannya
  // bocor ke pertanyaan instrumen sesudahnya dan ikut memungut opsinya.
  const akhir = src.indexOf('], {', i);
  assert(akhir > i, 'penutup daftar opsi teknik_formatif tidak ditemukan');
  const blok = src.slice(i, akhir);
  const opsi = [...blok.matchAll(/\['([a-z_]+)',/g)].map(m => m[1]);
  assertEquals(opsi.length, 5, `diharapkan 5 opsi teknik formatif, dapat ${opsi.join(', ')}`);
  const didukung = ['tanya_jawab', 'observasi', 'latihan_singkat', 'refleksi', 'rekomendasi'];
  for (const o of opsi) {
    assert(didukung.includes(o), `opsi '${o}' bukan teknik formatif yang didukung`);
  }
  // Dan backend memang mempertahankan tiap teknik yang ditawarkan.
  for (const o of opsi.filter(x => x !== 'rekomendasi')) {
    assertEquals(resolve({ teknik_formatif: o }).teknik, o,
      `teknik '${o}' ditawarkan ke guru tapi tidak dipertahankan backend`);
  }
});

// ══ AM–AO — MANIFEST FASE A BERLAKU JUGA DI JALUR PERBAIKAN (M4.1) ══════════
//
// Lubang yang ditutup: pemanggilan validator KEDUA — yang memeriksa keluaran
// perbaikan — mengirim `manifest: undefined`, warisan kode sebelum M4. Seluruh
// aturan yang berpangkal pada manifest Fase A karena itu dilewati tepat di
// putaran ketika model baru saja salah sekali, sehingga keluaran perbaikan boleh
// memperkenalkan instrumen yang ada di `instrumen_asesmen[]` final tetapi tidak
// pernah ada di manifest — lalu lolos.
//
// Manifest adalah kontrak IDENTITAS instrumen dan tidak berubah karena sebuah
// perbaikan: ia keluaran Fase A, sedangkan yang diperbaiki keluaran fase
// sesudahnya.

type Manifest = {
  pembelajaran_manifest: Array<Record<string, unknown>>;
  asesmen_manifest: Array<Record<string, unknown>>;
};

/** Manifest Fase A yang cocok dengan fixture — DITURUNKAN dari instrumen di
 *  dokumennya sendiri, bukan ditulis ulang, supaya ia tidak bisa menyimpang
 *  diam-diam dari fixture yang ia jaga. */
function manifestSekarang(k: Konten): Manifest {
  const entri = (i: Konten) => ({
    id: i.id, jenis: i.jenis, untuk_murid: i.untuk_murid,
    digunakan_pada: i.digunakan_pada,
  });
  return {
    pembelajaran_manifest: (k.instrumen_pembelajaran as Konten[]).map(entri),
    asesmen_manifest:      (k.instrumen_asesmen as Konten[]).map(entri),
  };
}

/** Seperti cekSekarang(), tetapi dengan manifest Fase A ikut dikirim — inilah
 *  bentuk pemanggilan yang KEDUA jalur (utama dan perbaikan) kini pakai. */
function cekSekarangDenganManifest(k: Konten, manifest?: Manifest) {
  return validate(k, ...ARG, manifest ?? manifestSekarang(k), false, false, true);
}

/** Instrumen asesmen tambahan yang berjalur bukti sah untuk K3, sehingga satu-
 *  satunya hal yang bisa menjatuhkannya adalah keanggotaan manifest. */
function tambahAsesmenBerjalurBukti(k: Konten, id: string) {
  (k.instrumen_asesmen as Konten[]).push({
    id, judul: `Lembar pengamatan ${id}`, jenis: 'matriks_observasi',
    untuk_murid: false, digunakan_pada: ['P2.MEMAHAMI'],
    konten_murid: null, panduan_guru: { cara_pakai: 'Dicentang per murid saat murid bekerja.' },
  });
  (ra(k).asesmen_formatif as Konten[]).push(
    formatif('FMT-02', 2, 'MEMAHAMI', ['K3'], [id], 'per_murid'));
  jangkar(k, 2, 'MEMAHAMI', 1, 'FMT-02', ['PBL-01', id]);
  (k.kktp as Konten[])[2].instrumen_bukti = [id];
}

Deno.test('M4-AM-BASE: fixture + manifest turunannya lolos', async () => {
  const k = await fixtureSekarang();
  terima(cekSekarangDenganManifest(k));
});

Deno.test('M4-AM: instrumen di instrumen_asesmen[] final tapi TIDAK di manifest Fase A → ditolak', async () => {
  const k = await fixtureSekarang();
  const manifestFaseA = manifestSekarang(k);   // dipotret SEBELUM ASM-03 ditambahkan
  tambahAsesmenBerjalurBukti(k, 'ASM-03');

  // ASM-03 sah di setiap sisi KECUALI manifest: ia ada di array final, dipakai
  // jalur bukti per murid untuk K3, dan jangkarnya memakainya.
  const h = cekSekarangDenganManifest(k, manifestFaseA);
  tolak(h, "'ASM-03' tidak ada di asesmen_manifest");

  // Dan inilah regresi yang sebenarnya dijaga: tanpa manifest — bentuk
  // pemanggilan LAMA di jalur perbaikan — dokumen yang sama LOLOS.
  terima(cekSekarang(k));
});

Deno.test('M4-AN: instrumen di manifest + array final + jalur bukti sah → lolos', async () => {
  const k = await fixtureSekarang();
  tambahAsesmenBerjalurBukti(k, 'ASM-03');
  // manifestSekarang() diturunkan SESUDAHNYA, jadi ASM-03 ada di ketiga tempat.
  terima(cekSekarangDenganManifest(k));
});

Deno.test('M4-AN2: aturan M4 yang bergantung manifest tetap hidup saat manifest dikirim', async () => {
  // Rujukan instrumen dari jalur bukti diperiksa terhadap manifest, bukan hanya
  // terhadap array final — untuk formatif, sumatif, diagnostik, dan
  // KKTP.instrumen_bukti sekaligus.
  const kasus: Array<[string, (k: Konten) => void, string]> = [
    ['formatif',  k => { fmt(k).instrumen_ref = ['ASM-01', 'ASM-09']; },            'ASM-09'],
    ['sumatif',   k => { (ra(k).asesmen_sumatif as Konten).instrumen_ref = ['ASM-09']; }, 'ASM-09'],
    ['kktp',      k => { (k.kktp as Konten[])[0].instrumen_bukti = ['ASM-09']; },    'ASM-09'],
    // Diagnostik ikut diperiksa walaupun ia BUKAN jalur bukti (lihat §K): yang
    // diuji di sini identitas instrumennya, bukan sumbangannya ke ketercapaian.
    ['diagnostik', k => {
      ra(k).asesmen_diagnostik = {
        tujuan:           'Memetakan kemampuan awal murid membaca label perawatan.',
        teknik:           'pemetaan_awal',
        instrumen_ref:    ['ASM-09'],
        waktu:            'Pertemuan 1, awal kegiatan',
        penggunaan_hasil: 'Menentukan murid yang perlu glosarium visual dua bahasa.',
      };
    }, 'ASM-09'],
  ];
  for (const [nama, rusak, id] of kasus) {
    const k = await fixtureSekarang();
    const manifestFaseA = manifestSekarang(k);
    // ASM-09 ada di array final tapi tidak di manifest.
    (k.instrumen_asesmen as Konten[]).push({
      id, judul: 'Instrumen di luar manifest', jenis: 'matriks_observasi',
      untuk_murid: false, digunakan_pada: [], konten_murid: null, panduan_guru: {},
    });
    rusak(k);
    const h = cekSekarangDenganManifest(k, manifestFaseA);
    assert(h.errors.some(e => e.includes(id) && e.includes('manifest')),
      `${nama}: rujukan ke ${id} lolos tanpa keluhan manifest — ${h.errors.join(' | ')}`);
  }
});

Deno.test('M4-AO: KEDUA pemanggilan validator di jalur penyusunan menerima manifest Fase A', async () => {
  const sumber = await Deno.readTextFile(EF_MODUL);
  const panggilan = [...sumber.matchAll(/validateModulOutputV400\(\s*merged[A-Za-z]*,[^;]*?\);/gs)]
    .map(m => m[0]);
  assertEquals(panggilan.length, 2,
    `diharapkan tepat 2 pemanggilan validator di jalur penyusunan, dapat ${panggilan.length}`);

  for (const p of panggilan) {
    assertStringIncludes(p, 'manifestFaseD');
    // Bentuk lama yang menghilangkan manifest tidak boleh kembali.
    assert(!/,\s*undefined\s*,/.test(p),
      `masih ada pemanggilan validator yang menghilangkan manifest: ${p.slice(0, 120)}`);
    assertStringIncludes(p, 'true, true');   // jejak warisan + kontrak M4
  }

  // Dan keduanya memakai manifest yang SAMA — satu potret Fase A, bukan dua.
  assertEquals(
    panggilan.filter(p => p.includes('manifestFaseD')).length, 2,
    'kedua pemanggilan harus memakai manifestFaseD yang sama',
  );
});
