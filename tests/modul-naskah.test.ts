// M7 — NASKAH FASILITASI SEBAGAI LAPISAN PELAKSANA.
//
//   Modul → langkah pelaksanaan → lakukan → katakan → tanyakan → amati → putuskan
//
// Naskah adalah yang guru pegang SAAT MENGAJAR, sering dari layar HP. Ia bukan
// Modul kedua, bukan ringkasan, bukan esai, dan bukan skrip yang dibaca kata
// demi kata. Karena itu `aksi_guru` (lakukan) wajib di setiap unit sementara
// `ucapan_guru` dan `pertanyaan_kunci` boleh kosong — mewajibkan ucapan di
// setiap langkah justru menjadikannya skrip yang produk ini tolak.
//
// TIGA TINGKAT, DAN M7 HANYA MENEGAKKAN DUA:
//
//   naskah ADA dan SEJAJAR dengan Modul   → M7
//   setiap unit punya isi yang diperlukan → M7
//   kalimatnya bagus / pertanyaannya tepat → M9, bukan di sini
//
// Tidak ada satu pun pencocokan kata di berkas ini: apakah `aksi_guru` cukup
// konkret, apakah `ask` pedagogis, dan apakah `putusan_lanjut` intervensi
// terbaik semuanya M9.
//
// M7-REPRO-*   reproduksi gap: lolos sebelum, ditolak sesudah
// M7-A         naskah wajib ada
// M7-B..M7-D   paritas struktural dengan Modul (liputan + urutan)
// M7-E..M7-H   do / say / ask
// M7-I..M7-L   observe + decide-next di jangkar FORMATIF
// M7-Q..M7-T   SUMATIF dikecualikan — keputusan tidak selalu diambil di tempat
// M7-M..M7-N   integritas rujukan resource (sudah ditutup V12 — dijaga)
// M7-O..M7-P   naskah tidak punya waktu sendiri
// M7-KONTRAK   bentuk M7 sampai ke prompt otomatis
// M7-HIST      dokumen historis tetap terbaca
// M7-GEN       jalur penyusunan menyalakan kontrak M7
//
// TIDAK ADA panggilan model di berkas ini.

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  NASKAH_WAJIB, NASKAH_OPSIONAL, NASKAH_WAJIB_DI_JANGKAR, CABANG_PUTUSAN,
  NASKAH_TERLARANG_WAKTU, ASESMEN_REF_TANPA_PUTUSAN,
  KONTRAK_ROOT, kerangkaFase, perintahPerbaikanStruktural,
} from '../supabase/functions/generate-modul/contract.ts';

const EF_MODUL = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);
const FIXTURES = new URL('./fixtures/modul/', import.meta.url);

type Validator = (
  raw: unknown, nomorTp: number, jumlahPertemuan: number, jpPerPertemuan: number,
  durasiJp: number, jumlahMurid: number | null, manifest?: unknown,
  perangkatDigitalOk?: boolean, wajibJejakWarisan?: boolean,
  wajibKontrakAsesmenCurrent?: boolean, wajibResourceCurrent?: boolean,
  wajibKausalitasCurrent?: boolean, wajibNaskahCurrent?: boolean,
) => { valid: boolean; errors: string[] };

async function muatValidator(): Promise<Validator> {
  const penuh = await Deno.readTextFile(EF_MODUL);
  const batas = penuh.indexOf('// ── EDGE FUNCTION ─');
  assert(batas > 0, 'penanda EDGE FUNCTION tidak ada di index.ts');
  const tmp = new URL(`._modul-naskah-${crypto.randomUUID()}.ts`, new URL('.', EF_MODUL));
  try {
    await Deno.writeTextFile(tmp, penuh.slice(0, batas) + '\nexport { validateModulOutputV400 };\n');
    return (await import(tmp.href)).validateModulOutputV400 as Validator;
  } finally {
    await Deno.remove(tmp).catch(() => {});
  }
}

const validate = await muatValidator();

type Konten = Record<string, unknown>;
const ARG = [2, 3, 4, 40, 30] as const;

/** Modus M7 SAJA — milestone lain dimatikan supaya temuan yang terlihat murni
 *  temuan Naskah, bukan sisa M2/M4/M5/M6. */
function cekM7(k: Konten) {
  return validate(k, ...ARG, undefined, false, false, false, false, false, true);
}
/** Modus historis: seluruh kontrak current mati. */
function cekHistoris(k: Konten) {
  return validate(k, ...ARG, undefined, false, false, false, false, false, false);
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

/** Seluruh sub_langkah modul, apa adanya dari `pertemuan[]`. */
function refModul(k: Konten): string[] {
  const out: string[] = [];
  for (const pt of k.pertemuan as Konten[])
    for (const lk of pt.langkah as Konten[])
      for (const sl of lk.sub_langkah as Konten[]) out.push(String(sl.ref));
  return out;
}

/** Entri naskah untuk satu `ref`, dari pohon naskah. */
function entri(k: Konten, ref: string): Konten {
  for (const np of k.naskah_fasilitasi as Konten[])
    for (const lk of np.langkah as Konten[])
      for (const sl of lk.sub_langkah as Konten[]) if (sl.ref === ref) return sl;
    throw new Error(`entri naskah untuk ${ref} tidak ada`);
}

/** Sub_langkah modul yang menjadi jangkar asesmen (punya `asesmen_ref`). */
function refJangkar(k: Konten): string[] {
  const out: string[] = [];
  for (const pt of k.pertemuan as Konten[])
    for (const lk of pt.langkah as Konten[])
      for (const sl of lk.sub_langkah as Konten[])
        if (sl.asesmen_ref) out.push(String(sl.ref));
  return out;
}

/** Jangkar FORMATIF — yang menuntut amati + putusan lanjut. */
function refFormatif(k: Konten): string[] {
  const kecuali = ASESMEN_REF_TANPA_PUTUSAN as readonly string[];
  const out: string[] = [];
  for (const pt of k.pertemuan as Konten[])
    for (const lk of pt.langkah as Konten[])
      for (const sl of lk.sub_langkah as Konten[])
        if (sl.asesmen_ref && !kecuali.includes(String(sl.asesmen_ref))) out.push(String(sl.ref));
  return out;
}

/** Jangkar yang DIKECUALIKAN (SUMATIF). */
function refDikecualikan(k: Konten): string[] {
  const kecuali = ASESMEN_REF_TANPA_PUTUSAN as readonly string[];
  const out: string[] = [];
  for (const pt of k.pertemuan as Konten[])
    for (const lk of pt.langkah as Konten[])
      for (const sl of lk.sub_langkah as Konten[])
        if (sl.asesmen_ref && kecuali.includes(String(sl.asesmen_ref))) out.push(String(sl.ref));
  return out;
}

/**
 * FIXTURE KONTRAK SEKARANG.
 *
 * tp02 dipakai sebagai kerangka — naskahnya sudah meliput seluruh 24 sub_langkah
 * dengan urutan yang benar.
 *
 * SATU-SATUNYA jangkar asesmen di tp02 adalah SUMATIF, dan sejak koreksi M7.1
 * SUMATIF justru yang DIKECUALIKAN. Jadi fixture ini menambahkan satu jangkar
 * FORMATIF sungguhan — kalau tidak, aturan formatif tidak pernah benar-benar
 * teruji dan uji ini akan lulus karena tidak memeriksa apa pun.
 *
 * Hasilnya satu fixture yang memuat KEDUA jenis jangkar sekaligus:
 *   P1.MEMAHAMI.1    → FMT-01, lengkap dengan yang_diamati + putusan_lanjut
 *   P3.MENGAPLIKASI.2 → SUMATIF, sengaja TANPA keduanya
 */
async function fixtureSekarang(): Promise<Konten> {
  const k = await fixtureHistoris();

  // Jangkar formatif di modul, beserta entri rencana asesmennya supaya
  // dokumennya koheren — bukan sekadar `asesmen_ref` yang menggantung.
  const lk = ((k.pertemuan as Konten[])[0].langkah as Konten[]).find(x => x.nama === 'MEMAHAMI')!;
  const sl = (lk.sub_langkah as Konten[])[0];
  sl.asesmen_ref = 'FMT-01';
  (k.rencana_asesmen as Konten).asesmen_formatif = [{
    id: 'FMT-01', waktu_pertemuan: 1, fase_langkah: 'MEMAHAMI', teknik: 'observasi',
    instrumen_ref: ['ASM-01'], fungsi: 'Memeriksa pemahaman sebelum tahap penerapan.',
    referensi_kktp: ['K1'], cakupan_bukti: 'per_murid',
    umpan_balik: 'Koreksi bersama simbol yang paling banyak salah.',
  }];

  const e = entri(k, String(sl.ref));
  e.yang_diamati = [
    'Apakah murid menyebut simbol perawatan dengan tepat, satu per satu.',
    'Apakah urutan rekomendasinya runtut dari mencuci sampai menyimpan.',
  ];
  e.putusan_lanjut = {
    jika_tercapai: 'Lanjutkan ke tahap penerapan dan catat hasilnya di lembar pengamatan.',
    jika_belum:    'Minta murid mengulang bagian yang terlewat sambil melihat labelnya lagi.',
  };
  return k;
}

// ══ REPRODUKSI GAP — keadaan SEBELUM M7 ═════════════════════════════════════

Deno.test('M7-REPRO-1: naskah boleh meliput 1 dari 24 sub_langkah', async () => {
  const k = await fixtureSekarang();
  const semua = refModul(k);
  assertEquals(semua.length, 24);
  for (const np of k.naskah_fasilitasi as Konten[])
    for (const lk of np.langkah as Konten[]) lk.sub_langkah = [];
  ((k.naskah_fasilitasi as Konten[])[0].langkah as Konten[])[0].sub_langkah = [
    { ref: semua[0], aksi_guru: ['Sapa murid.'], ucapan_guru: [], pertanyaan_kunci: [] },
  ];
  terima(cekHistoris(k));                     // inilah gap-nya
  tolak(cekM7(k), 'naskah_fasilitasi tidak meliput');
});

Deno.test('M7-REPRO-2: seluruh entri naskah boleh kosong isinya', async () => {
  const k = await fixtureSekarang();
  for (const np of k.naskah_fasilitasi as Konten[])
    for (const lk of np.langkah as Konten[])
      for (const sl of lk.sub_langkah as Konten[]) {
        sl.aksi_guru = []; sl.ucapan_guru = []; sl.pertanyaan_kunci = [];
        delete sl.jika_kesulitan;
      }
  terima(cekHistoris(k));
  tolak(cekM7(k), 'aksi_guru kosong');
});

Deno.test('M7-REPRO-3: jangkar asesmen boleh tanpa panduan amati/putusan', async () => {
  const k = await fixtureSekarang();
  for (const ref of refJangkar(k)) {
    const e = entri(k, ref);
    delete e.yang_diamati;
    delete e.putusan_lanjut;
  }
  terima(cekHistoris(k));
  tolak(cekM7(k), 'guru diminta menilai tanpa diberi tahu apa yang harus diamati');
});

Deno.test('M7-REPRO-4: urutan naskah boleh berbeda dari modul', async () => {
  const k = await fixtureSekarang();
  for (const np of k.naskah_fasilitasi as Konten[])
    for (const lk of np.langkah as Konten[]) (lk.sub_langkah as Konten[]).reverse();
  terima(cekHistoris(k));
  tolak(cekM7(k), 'berbeda dari urutan di modul');
});

Deno.test('M7-BASE: fixture kontrak sekarang lolos di kedua modus', async () => {
  const k = await fixtureSekarang();
  terima(cekHistoris(k));
  terima(cekM7(k));
});

// ══ A — NASKAH WAJIB ADA ════════════════════════════════════════════════════

Deno.test('M7-A: penyusunan tanpa naskah → ditolak', async () => {
  for (const nilai of [[], null, undefined]) {
    const k = await fixtureSekarang();
    if (nilai === undefined) delete k.naskah_fasilitasi;
    else k.naskah_fasilitasi = nilai;
    tolak(cekM7(k), 'guru tidak punya panduan pelaksanaan');
  }
});

// ══ B–D — PARITAS STRUKTURAL DENGAN MODUL ═══════════════════════════════════

Deno.test('M7-B: satu sub_langkah modul yang tidak diliput → ditolak', async () => {
  const k = await fixtureSekarang();
  const lk = ((k.naskah_fasilitasi as Konten[])[0].langkah as Konten[])
    .find(x => x.nama === 'MEMAHAMI')!;
  const dibuang = (lk.sub_langkah as Konten[]).pop()!;
  const h = cekM7(k);
  tolak(h, 'naskah_fasilitasi tidak meliput 1 sub_langkah');
  // Pesannya menyebut ref yang hilang, supaya perbaikannya satu putaran.
  assert(h.errors.some(e => e.includes(String(dibuang.ref))),
    `pesan tidak menyebut ref yang hilang: ${h.errors.join(' | ')}`);
});

Deno.test('M7-C: entri naskah yang menunjuk sub_langkah TIDAK ADA → ditolak', async () => {
  // Arah ini sudah dijaga V11 sejak sebelum M7; uji ini menjaganya tetap hidup.
  const k = await fixtureSekarang();
  entri(k, refModul(k)[0]).ref = 'P9.MEMAHAMI.7';
  const h = validate(k, ...ARG, undefined, false, false, false, false, false, false);
  assert(h.errors.some(e => e.includes("ref='P9.MEMAHAMI.7' tidak ada di pertemuan[]")),
    `V11 hilang: ${h.errors.join(' | ')}`);
});

Deno.test('M7-D: urutan yang sejajar diterima, urutan yang dibalik ditolak', async () => {
  terima(cekM7(await fixtureSekarang()));

  const k = await fixtureSekarang();
  const lk = ((k.naskah_fasilitasi as Konten[])[0].langkah as Konten[])
    .find(x => x.nama === 'MEMAHAMI')!;
  (lk.sub_langkah as Konten[]).reverse();
  tolak(cekM7(k), 'berbeda dari urutan di modul');
});

// ══ E–H — DO / SAY / ASK ════════════════════════════════════════════════════

Deno.test('M7-E: aksi_guru (do) wajib di SETIAP unit', async () => {
  const a = await fixtureSekarang();
  entri(a, refModul(a)[0]).aksi_guru = [];
  tolak(cekM7(a), 'aksi_guru kosong — setiap langkah harus memberi guru tindakan yang konkret');

  const b = await fixtureSekarang();
  delete entri(b, refModul(b)[0]).aksi_guru;
  tolak(cekM7(b), 'aksi_guru kosong');

  const c = await fixtureSekarang();
  entri(c, refModul(c)[0]).aksi_guru = ['   '];
  tolak(cekM7(c), 'aksi_guru[0] kosong');
});

Deno.test('M7-F: ucapan_guru (say) BOLEH kosong — naskah bukan skrip', async () => {
  // Mewajibkan ucapan di setiap sub-langkah akan memaksa guru membaca kata demi
  // kata. Itu persis bentuk yang produk ini tolak.
  const k = await fixtureSekarang();
  for (const ref of refModul(k)) entri(k, ref).ucapan_guru = [];
  terima(cekM7(k));

  const b = await fixtureSekarang();
  for (const ref of refModul(b)) delete entri(b, ref).ucapan_guru;
  terima(cekM7(b));
});

Deno.test('M7-G: pertanyaan_kunci (ask) BOLEH kosong dan tidak dipaksa berjumlah tertentu', async () => {
  const k = await fixtureSekarang();
  for (const ref of refModul(k)) entri(k, ref).pertanyaan_kunci = [];
  terima(cekM7(k));

  // Satu pertanyaan pun cukup — tidak ada ambang jumlah yang sembarang.
  const b = await fixtureSekarang();
  entri(b, refModul(b)[0]).pertanyaan_kunci = ['Apa yang kamu lihat di label ini?'];
  terima(cekM7(b));
});

Deno.test('M7-H: field opsional yang ADA tidak boleh hampa', async () => {
  for (const medan of NASKAH_OPSIONAL) {
    const k = await fixtureSekarang();
    entri(k, refModul(k)[0])[medan] = ['  '];
    tolak(cekM7(k), `${medan}[0] kosong`);

    const b = await fixtureSekarang();
    entri(b, refModul(b)[0])[medan] = 'bukan array';
    tolak(cekM7(b), `${medan} harus array`);
  }
});

// ══ I–L — OBSERVE + DECIDE-NEXT DI JANGKAR ASESMEN ══════════════════════════

Deno.test('M7-I: jangkar FORMATIF tanpa yang_diamati → ditolak', async () => {
  const ref = refFormatif(await fixtureSekarang())[0];
  assert(ref, 'fixture harus punya minimal satu jangkar formatif');

  const a = await fixtureSekarang();
  delete entri(a, ref).yang_diamati;
  tolak(cekM7(a), 'guru diminta menilai tanpa diberi tahu apa yang harus diamati');

  const b = await fixtureSekarang();
  entri(b, ref).yang_diamati = [];
  tolak(cekM7(b), 'yang_diamati kosong padahal sub_langkah ini jangkar asesmen formatif');

  const c = await fixtureSekarang();
  entri(c, ref).yang_diamati = ['   '];
  tolak(cekM7(c), 'yang_diamati[0] kosong');
});

Deno.test('M7-J: jangkar FORMATIF tanpa putusan_lanjut → ditolak', async () => {
  const ref = refFormatif(await fixtureSekarang())[0];
  const a = await fixtureSekarang();
  delete entri(a, ref).putusan_lanjut;
  tolak(cekM7(a), 'mengamati tanpa tahu langkah berikutnya hanya mengukur');

  const b = await fixtureSekarang();
  entri(b, ref).putusan_lanjut = [];
  tolak(cekM7(b), 'putusan_lanjut tidak ada');
});

Deno.test('M7-K: kedua cabang keputusan wajib terisi di jangkar FORMATIF', async () => {
  const ref = refFormatif(await fixtureSekarang())[0];
  for (const cabang of CABANG_PUTUSAN) {
    const k = await fixtureSekarang();
    (entri(k, ref).putusan_lanjut as Konten)[cabang] = '';
    tolak(cekM7(k), `putusan_lanjut.${cabang} kosong`);

    const b = await fixtureSekarang();
    delete (entri(b, ref).putusan_lanjut as Konten)[cabang];
    tolak(cekM7(b), `putusan_lanjut.${cabang} kosong`);
  }
});

Deno.test('M7-L: jangkar lengkap → lolos; sub_langkah BUKAN jangkar tidak dituntut', async () => {
  const k = await fixtureSekarang();
  terima(cekM7(k));

  // Sub_langkah biasa tidak wajib punya yang_diamati/putusan_lanjut — memaksanya
  // akan menjadikan naskah dokumen administratif kedua.
  const biasa = refModul(k).filter(r => !refJangkar(k).includes(r));
  assert(biasa.length > 0);
  for (const ref of biasa) {
    const e = entri(k, ref);
    assertEquals(e.yang_diamati, undefined);
    assertEquals(e.putusan_lanjut, undefined);
  }
  terima(cekM7(k));
});

Deno.test('M7-L2: jangkar ditentukan MODUL, bukan naskah', async () => {
  // Menambah asesmen_ref formatif di modul langsung menuntut naskah melengkapinya.
  const k = await fixtureSekarang();
  const lk = ((k.pertemuan as Konten[])[0].langkah as Konten[]).find(x => x.nama === 'MENGAPLIKASI')!;
  const sl = (lk.sub_langkah as Konten[])[0];
  sl.asesmen_ref = 'FMT-02';
  tolak(cekM7(k), `naskah_fasilitasi ${sl.ref}.yang_diamati kosong`);
});

// ══ Q–T — SUMATIF DIKECUALIKAN ═════════════════════════════════════════
//
// KOREKSI M7.1. Versi pertama M7 memperlakukan FMT-xx dan SUMATIF sama, dan itu
// terlalu luas: guru kerap MENGUMPULKAN produk atau unjuk kerja sumatif lalu
// menilainya setelah kelas usai. Memaksa keputusan di tempat berarti mengarang
// kebiasaan yang guru memang tidak lakukan, lalu menolak modul yang sehat.

Deno.test('M7-Q: SUMATIF tanpa putusan_lanjut → LOLOS', async () => {
  const k = await fixtureSekarang();
  const ref = refDikecualikan(k)[0];
  assert(ref, 'fixture harus punya jangkar SUMATIF');
  assertEquals(entri(k, ref).putusan_lanjut, undefined,
    'fixture sengaja TIDAK memberi SUMATIF putusan_lanjut');
  terima(cekM7(k));
});

Deno.test('M7-R: SUMATIF tanpa yang_diamati → LOLOS', async () => {
  // Tidak diperluas demi simetri — lihat catatan ASESMEN_REF_TANPA_PUTUSAN.
  const k = await fixtureSekarang();
  const ref = refDikecualikan(k)[0];
  delete entri(k, ref).yang_diamati;
  delete entri(k, ref).putusan_lanjut;
  terima(cekM7(k));
});

Deno.test('M7-S: SUMATIF BOLEH punya keduanya, tetapi isinya tidak boleh hampa', async () => {
  const ref = refDikecualikan(await fixtureSekarang())[0];

  // Boleh ada — guru yang memang memutuskan di tempat tidak dihalangi.
  const a = await fixtureSekarang();
  entri(a, ref).yang_diamati   = ['Apakah alur konsultasinya runtut.'];
  entri(a, ref).putusan_lanjut = { jika_tercapai: 'Catat nilainya.', jika_belum: 'Beri kesempatan ulang.' };
  terima(cekM7(a));

  // Tetapi kalau ada, tidak boleh hampa — perlakuan yang sama dengan field
  // opsional lain di naskah. Ini BUKAN tuntutan baru, hanya integritas isi.
  const b = await fixtureSekarang();
  entri(b, ref).yang_diamati = ['   '];
  tolak(cekM7(b), 'yang_diamati[0] kosong');

  const c = await fixtureSekarang();
  entri(c, ref).putusan_lanjut = { jika_tercapai: '', jika_belum: 'Beri kesempatan ulang.' };
  tolak(cekM7(c), 'putusan_lanjut.jika_tercapai kosong');
});

Deno.test('M7-T: hanya SUMATIF yang dikecualikan', async () => {
  // DIAGNOSTIK sengaja TIDAK ada di daftar: ia bukan nilai asesmen_ref yang
  // dipakai sub_langkah mana pun — diagnostik punya `waktu` berupa kalimat di
  // rencana_asesmen, bukan jangkar di pertemuan[].
  assertEquals([...ASESMEN_REF_TANPA_PUTUSAN], ['SUMATIF']);

  // Dan jangkar apa pun DI LUAR daftar itu tetap menuntut keduanya.
  const k = await fixtureSekarang();
  const lk = ((k.pertemuan as Konten[])[1].langkah as Konten[]).find(x => x.nama === 'MEMAHAMI')!;
  const sl = (lk.sub_langkah as Konten[])[0];
  sl.asesmen_ref = 'FMT-03';
  tolak(cekM7(k), `naskah_fasilitasi ${sl.ref}.putusan_lanjut tidak ada`);
});

// ══ M–N — INTEGRITAS RUJUKAN RESOURCE (sudah ditutup V12) ═══════════════════

Deno.test('M7-M: naskah menyebut instrumen yang tidak ada → ditolak (V12, dijaga)', async () => {
  // SUDAH ditutup sebelum M7. Uji ini regression guard, bukan aturan baru:
  // kalau V12 hilang, M7 tidak akan menangkapnya sendiri.
  const k = await fixtureSekarang();
  entri(k, refModul(k)[0]).aksi_guru = ['Bagikan ASM-99 kepada setiap murid.'];
  const h = validate(k, ...ARG, undefined, false, false, false, false, false, false);
  assert(h.errors.some(e => e.includes("menyebut 'ASM-99' yang tidak ada di instrumen")),
    `V12 hilang: ${h.errors.join(' | ')}`);
});

Deno.test('M7-N: naskah mengarang struktur instrumen → ditolak (V12, dijaga)', async () => {
  const k = await fixtureSekarang();
  entri(k, refModul(k)[0]).aksi_guru = ['Minta murid membuka PBL-01 halaman dua.'];
  const h = validate(k, ...ARG, undefined, false, false, false, false, false, false);
  assert(h.errors.some(e => e.includes('mengarang struktur instrumen')),
    `V12 hilang: ${h.errors.join(' | ')}`);
});

// ══ O–P — NASKAH TIDAK PUNYA WAKTU SENDIRI ══════════════════════════════════

Deno.test('M7-O: naskah yang membawa durasi sendiri → ditolak', async () => {
  // Urutan dan durasi milik `pertemuan[]`. Timeline kedua hanya akan bertengkar
  // dengan yang pertama, dan guru tidak punya cara tahu mana yang benar.
  for (const medan of NASKAH_TERLARANG_WAKTU) {
    const k = await fixtureSekarang();
    entri(k, refModul(k)[0])[medan] = 15;
    tolak(cekM7(k), `${medan} tidak boleh ada`);
  }
});

Deno.test('M7-P: naskah tanpa field waktu → lolos, dan memang begitu bentuknya', async () => {
  const k = await fixtureSekarang();
  terima(cekM7(k));
  // Bentuk yang model diminta hasilkan tidak memuat satu pun field waktu.
  const bentuk = KONTRAK_ROOT.naskah_fasilitasi.bentuk ?? '';
  for (const medan of NASKAH_TERLARANG_WAKTU) {
    assert(!bentuk.includes(`"${medan}"`),
      `bentuk naskah menawarkan field waktu '${medan}' — itu timeline kedua`);
  }
});

// ══ KONTRAK M3 IKUT MEMBAWA BENTUK M7 ═══════════════════════════════════════

Deno.test('M7-KONTRAK: bentuk M7 sampai ke prompt dan pesan perbaikan otomatis', () => {
  const kerangka = kerangkaFase('B2');
  for (const medan of [...NASKAH_WAJIB, ...NASKAH_OPSIONAL, ...NASKAH_WAJIB_DI_JANGKAR]) {
    assertStringIncludes(kerangka, medan);
  }
  assertStringIncludes(kerangka, 'putusan_lanjut');
  for (const cabang of CABANG_PUTUSAN) assertStringIncludes(kerangka, cabang);

  assertStringIncludes(perintahPerbaikanStruktural('B2'), 'putusan_lanjut');

  // Naskah tetap keluaran Fase B2 dan tetap wajib di dokumen final.
  assertEquals(KONTRAK_ROOT.naskah_fasilitasi.fase, 'B2');
  assertEquals(KONTRAK_ROOT.naskah_fasilitasi.required, true);

  // Kontrak yang model lihat WAJIB menyebut pembedaan FMT vs SUMATIF — kalau
  // tidak, model akan menghasilkan putusan_lanjut untuk sumatif yang tidak
  // dituntut, atau melewatkannya di formatif yang dituntut.
  const catatan = KONTRAK_ROOT.naskah_fasilitasi.catatan ?? '';
  assertStringIncludes(catatan, 'FMT-xx');
  assertStringIncludes(catatan, 'SUMATIF');
});

Deno.test('M7-KONTRAK2: daftar field naskah adalah satu otoritas bersama', () => {
  // Kalau sebuah field ditambahkan ke kontrak tanpa masuk salah satu daftar ini,
  // validator tidak akan pernah memeriksanya.
  const semua = [...NASKAH_WAJIB, ...NASKAH_OPSIONAL, ...NASKAH_WAJIB_DI_JANGKAR];
  assertEquals(new Set(semua).size, semua.length, 'ada field yang terdaftar dua kali');
  assertEquals([...NASKAH_WAJIB], ['aksi_guru']);
  assert(!semua.includes('ref' as never), 'ref dijaga V11, bukan daftar isi');
});

// ══ HIST — DOKUMEN HISTORIS TETAP TERBACA ═══════════════════════════════════

Deno.test('M7-HIST: kelima fixture historis tetap pada baseline di modus historis', async () => {
  const harapan: Record<string, number> = {
    'tp02.json': 0, 'tp03.json': 0, 'tp04.json': 0, 'tp05.json': 1, 'tp06.json': 1,
  };
  for (const [nama, jumlah] of Object.entries(harapan)) {
    const raw = JSON.parse(await Deno.readTextFile(new URL(nama, FIXTURES)));
    const h = raw._harapan;
    const hasil = validate(raw.konten, h.nomor_tp, h.jumlah_pertemuan, h.jp_per_pertemuan,
      h.durasi_jp, h.jumlah_murid, undefined, h.perangkat_digital_ok,
      false, false, false, false, false);
    assertEquals(hasil.errors.length, jumlah,
      `${nama}: ${jumlah} temuan diharapkan, dapat ${hasil.errors.length} — ${hasil.errors.join(' | ')}`);
    for (const e of hasil.errors) {
      assert(!/yang_diamati|putusan_lanjut|tidak meliput|urutan sub_langkah/.test(e),
        `${nama}: aturan M7 bocor ke modus historis — ${e}`);
    }
  }
});

Deno.test('M7-HIST2: naskah historis memang belum punya field M7', async () => {
  // Dicatat sebagai fakta terukur, bukan diperbaiki: fixture historis adalah
  // bukti. Inilah sebabnya penegakan M7 dinyalakan pemanggil.
  const k = await fixtureHistoris();
  const medan = new Set<string>();
  for (const np of k.naskah_fasilitasi as Konten[])
    for (const lk of np.langkah as Konten[])
      for (const sl of lk.sub_langkah as Konten[]) Object.keys(sl).forEach(x => medan.add(x));
  assert(!medan.has('yang_diamati'));
  assert(!medan.has('putusan_lanjut'));
  terima(cekHistoris(k));
});

// ══ GEN — JALUR PENYUSUNAN ══════════════════════════════════════════════════

Deno.test('M7-GEN: jalur penyusunan menyalakan kontrak M7 di KEDUA pemanggilan', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  const panggilan = [...src.matchAll(/validateModulOutputV400\(\s*merged[A-Za-z]*,[^;]*?\);/gs)].map(m => m[0]);
  assertEquals(panggilan.length, 2,
    `diharapkan tepat 2 pemanggilan validator di jalur penyusunan, dapat ${panggilan.length}`);
  for (const p of panggilan) {
    // M2 + M4 + M5 + M6 + M7 — kelima bendera menyala.
    assertStringIncludes(p, 'true, true, true, true, true');
    assertStringIncludes(p, 'manifestFaseD');
  }
  assertStringIncludes(src, 'wajibNaskahCurrent = false');
});

Deno.test('M7-GEN2: Fase B2 memberitahu model field baru dan kapan wajib', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  const i = src.indexOf('function buildUserMessageFaseB2');
  assert(i > 0, 'buildUserMessageFaseB2 tidak ditemukan');
  const blok = src.slice(i, i + 4000);
  assertStringIncludes(blok, 'yang_diamati');
  assertStringIncludes(blok, 'putusan_lanjut');
  assertStringIncludes(blok, 'asesmen_ref');
  // Pembedaan FMT vs SUMATIF ikut sampai ke model.
  assertStringIncludes(blok, 'FMT-xx');
  assertStringIncludes(blok, 'SUMATIF keduanya TIDAK wajib');
  // Ambang tetap milik M4 — naskah tidak boleh membuat ambang kedua.
  assertStringIncludes(blok, 'jangan membuat ambang baru');
});
