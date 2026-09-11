// M6 — KAUSALITAS KONTEKS.
//
//   konteks ATP → keputusan rancangan → komponen modul yang terdampak
//
// Sampai M5 konteks diwarisi ke `atp_context`, dikirim ke model, lalu berhenti.
// Tidak ada satu pun field di dokumen yang menautkan sebuah keputusan kembali
// ke konteks yang menyebabkannya — jadi konteks dapat dibalik seluruhnya
// sementara rancangannya tidak berubah, dan dokumennya tetap lolos.
//
// TIGA TINGKAT, DAN M6 HANYA MENEGAKKAN DUA:
//
//   konteks ADA                        → sudah dijamin M2
//   konteks DIGUNAKAN (dapat ditelusuri) → M6
//   keputusannya TEPAT secara pedagogis  → M9, bukan di sini
//
// Karena itu tidak ada satu pun uji di berkas ini yang mencari kata seperti
// "scaffold", "sederhana", atau "bertahap". Apakah "tambah contoh bertahap"
// memang jawaban yang benar untuk kesiapan `jauh_di_bawah` adalah pembacaan
// makna — dan menilainya dengan pencocokan kata hanya akan berpura-pura.
//
// M6-REPRO-*    reproduksi gap: konteks dapat dibalik total tanpa akibat
// M6-A..M6-C    jejak ada, id, dan isinya
// M6-D..M6-H    sumber wajib benar-benar ada di potret ATP
// M6-I..M6-M    komponen terdampak wajib benar-benar ada di modul
// M6-N..M6-R    cakupan: kesiapan, A17, penekanan guru per TP
// M6-S..M6-U    program keahlian & jumlah murid TIDAK dipaksakan
// M6-V..M6-W    kelayakan waktu yang sudah ada tetap berjalan
// M6-HIST       dokumen historis tetap terbaca
// M6-GEN        jalur penyusunan menyalakan kontrak M6
//
// TIDAK ADA panggilan model di berkas ini.

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  KONTRAK_ROOT, ENUM_KONTRAK, AWALAN_KOMPONEN, SUMBER_WAJIB_BERJEJAK,
  kerangkaFase, perintahPerbaikanStruktural,
} from '../supabase/functions/generate-modul/contract.ts';

const EF_MODUL = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);
const FIXTURES = new URL('./fixtures/modul/', import.meta.url);

type Validator = (
  raw: unknown, nomorTp: number, jumlahPertemuan: number, jpPerPertemuan: number,
  durasiJp: number, jumlahMurid: number | null, manifest?: unknown,
  perangkatDigitalOk?: boolean, wajibJejakWarisan?: boolean,
  wajibKontrakAsesmenCurrent?: boolean, wajibResourceCurrent?: boolean,
  wajibKausalitasCurrent?: boolean,
) => { valid: boolean; errors: string[] };

async function muatValidator(): Promise<Validator> {
  const penuh = await Deno.readTextFile(EF_MODUL);
  const batas = penuh.indexOf('// ── EDGE FUNCTION ─');
  assert(batas > 0, 'penanda EDGE FUNCTION tidak ada di index.ts');
  const tmp = new URL(`._modul-kausalitas-${crypto.randomUUID()}.ts`, new URL('.', EF_MODUL));
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

/** Modus M6 SAJA — milestone lain dimatikan supaya temuan yang terlihat murni
 *  temuan kausalitas, bukan sisa M2/M4/M5. */
function cekM6(k: Konten) {
  return validate(k, ...ARG, undefined, false, false, false, false, true);
}
/** Modus historis: seluruh kontrak current mati. */
function cekHistoris(k: Konten) {
  return validate(k, ...ARG, undefined, false, false, false, false, false);
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

/** Potret ATP yang tegas — kalau kausalitas berarti apa pun, modul yang
 *  mengabaikannya tidak boleh lolos. Nilainya sengaja tidak netral. */
function atpContextTegas(): Konten {
  return {
    versi_cp: '2024', semester: 1,
    kesiapan_murid: {
      nilai: 'jauh_di_bawah', asal: 'keputusan_guru',
      arti: 'sebagian besar murid jauh di bawah prasyarat TP ini',
      dasar: 'hasil penilaian sebelumnya',
    },
    jumlah_murid:     { nilai: 30, asal: 'fakta' },
    program_keahlian: { nilai: 'Tata Busana', asal: 'fakta' },
    konteks_tugas:    { nilai: 'dominan_kerja', asal: 'keputusan_guru',
                        arti: 'sebagian besar contoh dan tugas berlatar dunia kerja' },
    prioritas_guru: [
      { kunci: 'literasi',    arti: 'penguatan literasi',  arahan: 'perbanyak membaca teks utuh' },
      { kunci: 'kemandirian', arti: 'kemandirian belajar', arahan: 'kurangi bantuan bertahap' },
    ],
    penerapan_prioritas: {
      // HANYA literasi yang ATP nyatakan berlaku untuk TP ini. `kemandirian`
      // sengaja TIDAK — supaya dapat diuji bahwa M6 tidak memaksa seluruh
      // penekanan memengaruhi setiap TP.
      untuk_tp_ini: [
        { prioritas: 'literasi', kunci: 'literasi', tp: [2], pengaruh: ['kegiatan'], alasan: 'TP ini berbasis teks' },
      ],
      seluruh_atp: [
        { prioritas: 'literasi',    kunci: 'literasi',    tp: [2], pengaruh: ['kegiatan'], alasan: 'TP ini berbasis teks' },
        { prioritas: 'kemandirian', kunci: 'kemandirian', tp: [5], pengaruh: ['asesmen'],  alasan: 'TP 5 proyek mandiri' },
      ],
    },
  };
}

function jejak(
  id: string, jenis: string, kunci: string, komponen: string[],
): Konten {
  return {
    id, sumber: { jenis, kunci },
    keputusan: `Keputusan rancangan yang bersumber pada ${jenis}=${kunci}.`,
    komponen_terdampak: komponen,
    penerapan: 'Diterapkan pada bagian modul yang disebut di komponen_terdampak.',
  };
}

/** Modul yang jejak kausalnya LENGKAP dan sah — titik berangkat semua uji. */
async function fixtureSekarang(): Promise<Konten> {
  const k = await fixtureHistoris();
  k.atp_context = atpContextTegas();
  k.keputusan_kontekstual = [
    jejak('KTX-01', 'kesiapan_murid', 'jauh_di_bawah', ['pertemuan:1', 'sub_langkah:P1.MEMAHAMI.1']),
    jejak('KTX-02', 'konteks_tugas',  'dominan_kerja', ['instrumen:PBL-01']),
    jejak('KTX-03', 'prioritas_guru', 'literasi',      ['kktp:K1']),
  ];
  return k;
}

function ktx(k: Konten, i = 0): Konten {
  return (k.keputusan_kontekstual as Konten[])[i];
}
function ctx(k: Konten): Konten {
  return k.atp_context as Konten;
}

// ══ REPRODUKSI GAP — keadaan SEBELUM M6 ═════════════════════════════════════

Deno.test('M6-REPRO-1: modul yang mengabaikan SELURUH konteks lolos sebelum M6', async () => {
  const k = await fixtureHistoris();
  k.atp_context = atpContextTegas();
  // Tidak ada keputusan_kontekstual sama sekali.
  terima(cekHistoris(k));                       // inilah gap-nya
  tolak(cekM6(k), 'keputusan_kontekstual harus array');
});

Deno.test('M6-REPRO-2: konteks dapat DIBALIK TOTAL tanpa akibat apa pun', async () => {
  // Dua modul dengan rancangan yang sama persis, konteks berlawanan.
  const a = await fixtureHistoris();
  a.atp_context = atpContextTegas();

  const b = structuredClone(a);
  (ctx(b).kesiapan_murid as Konten).nilai = 'jauh_di_atas';
  (ctx(b).konteks_tugas  as Konten).nilai = 'dominan_sekolah';
  ctx(b).prioritas_guru = [];
  ctx(b).penerapan_prioritas = { untuk_tp_ini: [], seluruh_atp: [] };

  // Sebelum M6: keduanya lolos, tak terbedakan.
  terima(cekHistoris(a));
  terima(cekHistoris(b));

  // Sesudah M6: keduanya ditolak karena tidak punya jejak sama sekali.
  assert(!cekM6(a).valid && !cekM6(b).valid,
    'M6 seharusnya menuntut jejak pada kedua modul');
});

Deno.test('M6-BASE: fixture berjejak lengkap lolos di kedua modus', async () => {
  const k = await fixtureSekarang();
  terima(cekHistoris(k));
  terima(cekM6(k));
});

// ══ A–C — JEJAK ADA, ID, DAN ISINYA ═════════════════════════════════════════

Deno.test('M6-A: keputusan_kontekstual kosong atau bukan array → ditolak', async () => {
  for (const nilai of [[], null, undefined, {}]) {
    const k = await fixtureSekarang();
    if (nilai === undefined) delete k.keputusan_kontekstual;
    else k.keputusan_kontekstual = nilai;
    tolak(cekM6(k), 'keputusan_kontekstual harus array ≥ 1 entri');
  }
});

Deno.test('M6-B: id jejak ganda / di luar urutan → ditolak', async () => {
  const a = await fixtureSekarang();
  ktx(a, 1).id = 'KTX-01';
  tolak(cekM6(a), "keputusan_kontekstual[1].id='KTX-01' ganda");

  const b = await fixtureSekarang();
  ktx(b, 2).id = 'KTX-09';
  tolak(cekM6(b), "diharapkan 'KTX-03'");

  const c = await fixtureSekarang();
  ktx(c, 0).id = '';
  tolak(cekM6(c), 'keputusan_kontekstual[0].id kosong');
});

Deno.test('M6-C: keputusan / penerapan kosong → ditolak', async () => {
  for (const field of ['keputusan', 'penerapan']) {
    const k = await fixtureSekarang();
    ktx(k, 0)[field] = '   ';
    tolak(cekM6(k), `keputusan_kontekstual[0].${field} kosong`);
  }
});

// ══ D–H — SUMBER WAJIB ADA DI POTRET ATP ════════════════════════════════════

Deno.test('M6-D: sumber tidak ada → ditolak', async () => {
  const k = await fixtureSekarang();
  delete ktx(k, 0).sumber;
  tolak(cekM6(k), 'keputusan_kontekstual[0].sumber tidak ada');
});

Deno.test('M6-E: jenis sumber di luar enum → ditolak', async () => {
  const k = await fixtureSekarang();
  (ktx(k, 0).sumber as Konten).jenis = 'firasat_guru';
  tolak(cekM6(k), "sumber.jenis='firasat_guru'");
});

Deno.test('M6-F: kunci sumber yang TIDAK ADA di potret ATP → ditolak', async () => {
  // Jejak yang menunjuk konteks yang tidak pernah ATP putuskan lebih buruk
  // daripada tidak ada jejak: ia terlihat seperti alasan, padahal karangan.
  const a = await fixtureSekarang();
  (ktx(a, 0).sumber as Konten).kunci = 'sedikit_di_bawah';   // ATP bilang jauh_di_bawah
  tolak(cekM6(a), "tidak ada di potret ATP untuk 'kesiapan_murid'");

  const b = await fixtureSekarang();
  (ktx(b, 1).sumber as Konten).kunci = 'dominan_sekolah';    // ATP bilang dominan_kerja
  tolak(cekM6(b), "tidak ada di potret ATP untuk 'konteks_tugas'");
});

Deno.test('M6-G: penekanan guru yang tidak pernah guru pilih → ditolak', async () => {
  const k = await fixtureSekarang();
  (ktx(k, 2).sumber as Konten).kunci = 'numerasi';           // tidak ada di prioritas_guru
  const h = cekM6(k);
  tolak(h, "tidak ada di potret ATP untuk 'prioritas_guru'");
  // Pesannya menyebut penekanan yang SAH, supaya perbaikannya satu putaran.
  const pesan = h.errors.find(e => e.includes('numerasi'))!;
  assertStringIncludes(pesan, 'literasi');
});

Deno.test('M6-H: kunci sumber kosong → ditolak', async () => {
  const k = await fixtureSekarang();
  (ktx(k, 0).sumber as Konten).kunci = '';
  tolak(cekM6(k), 'sumber.kunci kosong');
});

// ══ I–M — KOMPONEN TERDAMPAK WAJIB NYATA ════════════════════════════════════

Deno.test('M6-I: komponen_terdampak kosong → ditolak', async () => {
  const k = await fixtureSekarang();
  ktx(k, 0).komponen_terdampak = [];
  tolak(cekM6(k), 'komponen_terdampak kosong');
});

Deno.test('M6-J: bentuk rujukan yang tidak dikenal → ditolak', async () => {
  const a = await fixtureSekarang();
  ktx(a, 0).komponen_terdampak = ['seluruh modul'];
  tolak(cekM6(a), "tidak berbentuk '<jenis>:<id>'");

  const b = await fixtureSekarang();
  ktx(b, 0).komponen_terdampak = ['bagian:pembuka'];
  tolak(cekM6(b), "jenis komponen 'bagian' yang tidak dikenal");
});

Deno.test('M6-K: rujukan ke komponen yang TIDAK ADA → ditolak', async () => {
  const kasus: Array<[string, string]> = [
    ['pertemuan:9',                 'menunjuk pertemuan di luar 1..3'],
    ['sub_langkah:P9.MEMAHAMI.1',   'menunjuk sub_langkah yang tidak ada'],
    ['kktp:K9',                     'menunjuk KKTP yang tidak ada'],
    ['instrumen:PBL-99',            'menunjuk instrumen yang tidak ada'],
    ['asesmen:FMT-99',              'menunjuk asesmen yang tidak ada'],
  ];
  for (const [ref, pesan] of kasus) {
    const k = await fixtureSekarang();
    ktx(k, 0).komponen_terdampak = [ref];
    tolak(cekM6(k), pesan);
  }
});

Deno.test('M6-L: kelima bentuk rujukan yang sah diterima', async () => {
  const k = await fixtureSekarang();
  // Rujukan ke asesmen memerlukan rencana asesmen yang memuatnya.
  k.rencana_asesmen = {
    asesmen_diagnostik: null,
    asesmen_formatif: [{ id: 'FMT-01', waktu_pertemuan: 1, fase_langkah: 'MEMAHAMI',
      teknik: 'observasi', instrumen_ref: ['ASM-01'], fungsi: 'x',
      referensi_kktp: ['K1'], cakupan_bukti: 'per_murid', umpan_balik: 'y' }],
    asesmen_sumatif: null,
  };
  ktx(k, 0).komponen_terdampak = [
    'pertemuan:2',
    'sub_langkah:P1.MEMAHAMI.1',
    'kktp:K2',
    'instrumen:ASM-01',
    'asesmen:FMT-01',
  ];
  terima(cekM6(k));
});

Deno.test('M6-M: daftar awalan komponen adalah satu otoritas bersama', () => {
  // Kalau awalan ditambah di kontrak tanpa ditangani validator, rujukan yang
  // memakainya akan ditolak sebagai 'jenis tidak dikenal' — jadi daftar ini
  // wajib tetap menjadi satu-satunya sumber.
  assertEquals(Object.values(AWALAN_KOMPONEN).sort(),
    ['asesmen', 'instrumen', 'kktp', 'pertemuan', 'sub_langkah']);
});

// ══ N–R — CAKUPAN KONTEKS ═══════════════════════════════════════════════════

Deno.test('M6-N: kesiapan murid diwarisi tetapi tidak dipakai → ditolak', async () => {
  const k = await fixtureSekarang();
  k.keputusan_kontekstual = [
    jejak('KTX-01', 'konteks_tugas',  'dominan_kerja', ['instrumen:PBL-01']),
    jejak('KTX-02', 'prioritas_guru', 'literasi',      ['kktp:K1']),
  ];
  tolak(cekM6(k), "konteks 'kesiapan_murid' bernilai 'jauh_di_bawah' di potret ATP tetapi tidak ada");
});

Deno.test('M6-O: keputusan A17 diwarisi tetapi tidak dipakai → ditolak', async () => {
  const k = await fixtureSekarang();
  k.keputusan_kontekstual = [
    jejak('KTX-01', 'kesiapan_murid', 'jauh_di_bawah', ['pertemuan:1']),
    jejak('KTX-02', 'prioritas_guru', 'literasi',      ['kktp:K1']),
  ];
  tolak(cekM6(k), "konteks 'konteks_tugas' bernilai 'dominan_kerja'");
});

Deno.test('M6-P: penekanan guru yang ATP nyatakan berlaku untuk TP ini wajib diterapkan', async () => {
  const k = await fixtureSekarang();
  k.keputusan_kontekstual = [
    jejak('KTX-01', 'kesiapan_murid', 'jauh_di_bawah', ['pertemuan:1']),
    jejak('KTX-02', 'konteks_tugas',  'dominan_kerja', ['instrumen:PBL-01']),
  ];
  tolak(cekM6(k), "penekanan guru 'literasi' dinyatakan ATP berlaku untuk TP ini");
});

Deno.test('M6-Q: penekanan yang BUKAN untuk TP ini TIDAK dipaksakan', async () => {
  // `kemandirian` ada di prioritas_guru dan di seluruh_atp, tetapi ATP
  // menyatakannya berlaku untuk TP 5 — bukan TP ini. Memaksanya akan
  // menghasilkan kaitan yang dibuat-buat.
  const k = await fixtureSekarang();
  terima(cekM6(k));
  const kunciDijejak = (k.keputusan_kontekstual as Konten[])
    .map(x => (x.sumber as Konten).kunci);
  assert(!kunciDijejak.includes('kemandirian'),
    'fixture seharusnya TIDAK menjejakkan kemandirian');
});

Deno.test('M6-R: konteks yang ATP tidak tetapkan tidak dituntut berjejak', async () => {
  const k = await fixtureSekarang();
  (ctx(k).konteks_tugas as Konten).nilai = null;       // ATP tidak memutuskan A17
  k.keputusan_kontekstual = [
    jejak('KTX-01', 'kesiapan_murid', 'jauh_di_bawah', ['pertemuan:1']),
    jejak('KTX-02', 'prioritas_guru', 'literasi',      ['kktp:K1']),
  ];
  terima(cekM6(k));
});

// ══ S–U — PROGRAM KEAHLIAN & JUMLAH MURID TIDAK DIPAKSAKAN ══════════════════

Deno.test('M6-S: program keahlian TIDAK wajib berjejak', async () => {
  // Ada TP yang tidak bertambah baik karena dikaitkan ke dunia kerja, dan
  // memaksanya justru menghasilkan kaitan artifisial. M6 menjaga sumbernya
  // benar bila dipakai, bukan memaksa ia dipakai.
  const k = await fixtureSekarang();
  assertEquals((ctx(k).program_keahlian as Konten).nilai, 'Tata Busana');
  terima(cekM6(k));
  assert(!(SUMBER_WAJIB_BERJEJAK as readonly string[]).includes('program_keahlian'));
});

Deno.test('M6-T: bila program keahlian dijejakkan, sumbernya wajib potret ATP', async () => {
  const a = await fixtureSekarang();
  (a.keputusan_kontekstual as Konten[]).push(
    jejak('KTX-04', 'program_keahlian', 'Tata Busana', ['instrumen:PBL-02']));
  terima(cekM6(a));

  // Program keahlian dari sumber lain — mis. setelan kelas sekarang yang sudah
  // berubah — tidak boleh lolos. Otoritasnya potret ATP.
  const b = await fixtureSekarang();
  (b.keputusan_kontekstual as Konten[]).push(
    jejak('KTX-04', 'program_keahlian', 'Tata Boga', ['instrumen:PBL-02']));
  tolak(cekM6(b), "tidak ada di potret ATP untuk 'program_keahlian'");
});

Deno.test('M6-U: jumlah murid TIDAK wajib berjejak — penegakannya struktural', async () => {
  // Jumlah murid sudah punya penegakan yang jauh lebih kuat daripada jejak
  // kalimat: V3/V4/V4b menghitung kelayakan waktu dari angka. Menuntut jejak
  // di sini hanya menambah kalimat, bukan jaminan.
  const k = await fixtureSekarang();
  terima(cekM6(k));
  assert(!(SUMBER_WAJIB_BERJEJAK as readonly string[]).includes('jumlah_murid'));

  // Bila dijejakkan, kuncinya tetap harus cocok.
  const b = await fixtureSekarang();
  (b.keputusan_kontekstual as Konten[]).push(
    jejak('KTX-04', 'jumlah_murid', '30', ['pertemuan:3']));
  terima(cekM6(b));

  const c = await fixtureSekarang();
  (c.keputusan_kontekstual as Konten[]).push(
    jejak('KTX-04', 'jumlah_murid', '12', ['pertemuan:3']));
  tolak(cekM6(c), "tidak ada di potret ATP untuk 'jumlah_murid'");
});

// ══ V–W — KELAYAKAN WAKTU YANG SUDAH ADA TETAP BERJALAN ═════════════════════
//
// M6 TIDAK membangun ulang kelayakan waktu: V3/V4/V4b sudah menghitungnya dari
// angka terstruktur sejak sebelum M6, dan menambahkan aturan kedua di atasnya
// hanya akan menghasilkan dua otoritas yang bisa bertengkar. Kedua uji ini
// menjaga agar yang sudah ada tidak diam-diam hilang.

Deno.test('M6-V: bergantian yang mustahil terhadap jumlah murid tetap ditolak', async () => {
  const k = await fixtureSekarang();
  const lk = ((k.pertemuan as Konten[])[0].langkah as Konten[]).find(x => x.nama === 'MENGAPLIKASI')!;
  const sl = (lk.sub_langkah as Konten[])[0];
  sl.mode_pelaksanaan = 'bergantian';
  sl.ukuran_kelompok  = 2;         // 30 murid → 15 kelompok
  sl.durasi_menit     = 10;        // mustahil: 15 kelompok dalam 10 menit
  const h = validate(k, ...ARG, undefined, false, false, false, false, true);
  assert(h.errors.some(e => e.includes('bergantian memberi hanya')),
    `kelayakan waktu bergantian hilang: ${h.errors.join(' | ')}`);
});

Deno.test('M6-W: individual+semua yang mustahil tetap ditolak', async () => {
  const k = await fixtureSekarang();
  const lk = ((k.pertemuan as Konten[])[0].langkah as Konten[]).find(x => x.nama === 'MENGAPLIKASI')!;
  const sl = (lk.sub_langkah as Konten[])[0];
  sl.mode_pelaksanaan = 'individual';
  sl.mode_observasi   = 'semua';
  sl.durasi_menit     = 20;        // 30 murid × 2 menit = 60 menit
  const h = validate(k, ...ARG, undefined, false, false, false, false, true);
  assert(h.errors.some(e => e.includes('individual+semua membutuhkan')),
    `kelayakan waktu individual hilang: ${h.errors.join(' | ')}`);
});

// ══ KONTRAK M3 IKUT MEMBAWA BENTUK M6 ═══════════════════════════════════════

Deno.test('M6-KONTRAK: bentuk M6 sampai ke prompt dan pesan perbaikan otomatis', () => {
  const kerangka = kerangkaFase('A');
  assertStringIncludes(kerangka, 'keputusan_kontekstual');
  assertStringIncludes(kerangka, 'KTX-01');
  assertStringIncludes(kerangka, 'komponen_terdampak');
  for (const v of ENUM_KONTRAK.jenis_sumber_konteks) assertStringIncludes(kerangka, `"${v}"`);

  // Peta nama enum → nama field di pesan warisan wajib ikut: tanpa itu model
  // harus menebak, dan tebakannya akan gagal validasi.
  assertStringIncludes(kerangka, 'konteks_contoh_dan_tugas');
  assertStringIncludes(kerangka, 'penekanan_guru');

  assertStringIncludes(perintahPerbaikanStruktural('A'), 'keputusan_kontekstual');

  // `required: false` DISENGAJA — lihat catatan di contract.ts. Kalau ini
  // berubah menjadi true, dokumen historis akan gagal pemeriksaan bentuk akar.
  assertEquals(KONTRAK_ROOT.keputusan_kontekstual.required, false);
  assertEquals(KONTRAK_ROOT.keputusan_kontekstual.fase, 'A');
});

// ══ HIST — DOKUMEN HISTORIS TETAP TERBACA ═══════════════════════════════════

Deno.test('M6-HIST: kelima fixture historis tetap pada baseline di modus historis', async () => {
  const harapan: Record<string, number> = {
    'tp02.json': 0, 'tp03.json': 0, 'tp04.json': 0, 'tp05.json': 1, 'tp06.json': 1,
  };
  for (const [nama, jumlah] of Object.entries(harapan)) {
    const raw = JSON.parse(await Deno.readTextFile(new URL(nama, FIXTURES)));
    const h = raw._harapan;
    const hasil = validate(raw.konten, h.nomor_tp, h.jumlah_pertemuan, h.jp_per_pertemuan,
      h.durasi_jp, h.jumlah_murid, undefined, h.perangkat_digital_ok,
      false, false, false, false);
    assertEquals(hasil.errors.length, jumlah,
      `${nama}: ${jumlah} temuan diharapkan, dapat ${hasil.errors.length} — ${hasil.errors.join(' | ')}`);
    // Tidak satu pun temuan historis boleh berasal dari aturan M6.
    for (const e of hasil.errors) {
      assert(!/keputusan_kontekstual|komponen_terdampak|potret ATP|penekanan guru '/.test(e),
        `${nama}: aturan M6 bocor ke modus historis — ${e}`);
    }
  }
});

// ══ GEN — JALUR PENYUSUNAN ══════════════════════════════════════════════════

Deno.test('M6-GEN: jalur penyusunan menyalakan kontrak M6 di KEDUA pemanggilan', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  const panggilan = [...src.matchAll(/validateModulOutputV400\(\s*merged[A-Za-z]*,[^;]*?\);/gs)].map(m => m[0]);
  assertEquals(panggilan.length, 2,
    `diharapkan tepat 2 pemanggilan validator di jalur penyusunan, dapat ${panggilan.length}`);
  for (const p of panggilan) {
    // M2 + M4 + M5 + M6 — keempat bendera menyala.
    assertStringIncludes(p, 'true, true, true, true');
    assertStringIncludes(p, 'manifestFaseD');
  }
  // Bawaannya tetap mati: dokumen lama tidak dihakimi surut.
  assertStringIncludes(src, 'wajibKausalitasCurrent = false');
});
