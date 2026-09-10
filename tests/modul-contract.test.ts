// M3 — SATU OTORITAS BENTUK KELUARAN MODUL.
//
// Sampai M2 ada empat gambaran Modul yang ditulis tangan dan tidak pernah
// saling memeriksa: tipe TypeScript, validator runtime, kerangka JSON di
// SYSTEM_PROMPT, dan renderer. M3 menyatukan tiga yang pertama; renderer M8.
//
// M3-A..M3-F menguji kontrak dan validator.
// M3-G..M3-L menguji bahwa yang DIMINTA dari model berasal dari kontrak yang sama.
// M3-M..M3-R menjaga agar M2 dan pemeriksaan mutu yang sudah ada tidak hilang.
//
// TIDAK ADA panggilan model di berkas ini.

import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import {
  MODUL_SCHEMA_VERSION, KONTRAK_ROOT, ENUM_KONTRAK, URUTAN_LANGKAH_KONTRAK,
  rootWajib, rootFase, kerangkaFase, kerangkaSeluruhFase,
  ringkasanTanggungJawabFase, perintahPerbaikanStruktural,
  type FieldKontrak,
} from '../supabase/functions/generate-modul/contract.ts';

const EF_MODUL = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);
const FIXTURES = new URL('./fixtures/modul/', import.meta.url);

type Validator = (
  raw: unknown, nomorTp: number, jumlahPertemuan: number, jpPerPertemuan: number,
  durasiJp: number, jumlahMurid: number | null, manifest?: unknown,
  perangkatDigitalOk?: boolean, wajibJejakWarisan?: boolean,
) => { valid: boolean; errors: string[] };

/** Validator diambil dari SUMBER Edge Function, bukan disalin — pola yang sama
 *  dengan tests/validator-modul.ts. Berkas sementara ditaruh di samping
 *  sumbernya karena index.ts mengimpor modul tetangga secara relatif. */
async function muatValidator(): Promise<Validator> {
  const penuh = await Deno.readTextFile(EF_MODUL);
  const batas = penuh.indexOf('// ── EDGE FUNCTION ─');
  assert(batas > 0, 'penanda EDGE FUNCTION tidak ada di index.ts');
  const dir = new URL('.', EF_MODUL);
  const tmp = new URL(`._modul-contract-${crypto.randomUUID()}.ts`, dir);
  try {
    await Deno.writeTextFile(tmp, penuh.slice(0, batas) + '\nexport { validateModulOutputV400 };\n');
    const mod = await import(tmp.href);
    return mod.validateModulOutputV400 as Validator;
  } finally {
    await Deno.remove(tmp).catch(() => {});
  }
}

const validate = await muatValidator();

/** Modul produksi yang memang sehat, dipakai sebagai titik berangkat. */
async function fixtureSehat(): Promise<Record<string, unknown>> {
  const raw = JSON.parse(await Deno.readTextFile(new URL('tp02.json', FIXTURES)));
  return structuredClone(raw.konten) as Record<string, unknown>;
}
async function harapanFixture(nama: string) {
  const raw = JSON.parse(await Deno.readTextFile(new URL(nama, FIXTURES)));
  return { konten: raw.konten, harapan: raw._harapan };
}

/** Argumen validasi yang cocok dengan fixture tp02. */
async function argsSehat(nama = 'tp02.json') {
  const raw = JSON.parse(await Deno.readTextFile(new URL(nama, FIXTURES)));
  const h = raw._harapan;
  return [
    h.nomor_tp, h.jumlah_pertemuan, h.jp_per_pertemuan, h.durasi_jp,
    h.jumlah_murid, undefined, h.perangkat_digital_ok,
  ] as const;
}

// ═════════════════════════════════════════════════════════════════════════════
// KONTRAK DAN VALIDATOR
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('M3-A: versi schema punya satu otoritas, dan tidak ada literal kedua', async () => {
  assertEquals(MODUL_SCHEMA_VERSION, '4.0.0', 'M3 tidak boleh menaikkan versi — ini refactor');

  const bersih = (await Deno.readTextFile(EF_MODUL))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const literal = [...bersih.matchAll(/'4\.0\.0'|"4\.0\.0"/g)];
  assertEquals(literal.length, 0,
    `masih ada ${literal.length} literal versi di generate-modul — otoritasnya MODUL_SCHEMA_VERSION`);

  // Dan kontraknya sendiri yang menuliskannya, sekali.
  const kontrakSrc = await Deno.readTextFile(
    new URL('../supabase/functions/generate-modul/contract.ts', import.meta.url));
  assertEquals([...kontrakSrc.matchAll(/'4\.0\.0'/g)].length, 1);
});

Deno.test('M3-B: fixture produksi yang sehat lolos dengan versi dari otoritas', async () => {
  const k = await fixtureSehat();
  assertEquals(k.schema_version, MODUL_SCHEMA_VERSION);
  const v = validate(k, ...(await argsSehat()));
  assertEquals(v.errors, []);
  assert(v.valid);
});

Deno.test('M3-C: versi salah ditolak, sesuai kebijakan yang sudah ada', async () => {
  const k = await fixtureSehat();
  k.schema_version = '3.2.0';
  const v = validate(k, ...(await argsSehat()));
  assert(!v.valid);
  assert(v.errors.some(e => e.includes('schema_version') && e.includes(MODUL_SCHEMA_VERSION)),
    `pesan tidak menyebut versi yang diharapkan: ${v.errors.join('; ')}`);
});

Deno.test('M3-D: setiap bagian akar wajib yang dihapus menghasilkan temuan struktural', async () => {
  const args = await argsSehat();
  const wajibModel = Object.entries(KONTRAK_ROOT)
    .filter(([, f]) => f.required && f.fase !== 'server');
  assert(wajibModel.length >= 10, 'daftar bagian akar wajib mencurigakan pendek');

  for (const [nama] of wajibModel) {
    const k = await fixtureSehat();
    delete k[nama];
    const v = validate(k, ...args);
    assert(!v.valid, `menghapus ${nama} tetap lolos validasi`);
    assert(v.errors.some(e => e.includes(nama)),
      `menghapus ${nama} tidak menghasilkan temuan yang menyebutnya: ${v.errors.join('; ')}`);
  }
});

Deno.test('M3-E: field yang SEKARANG nullable tetap sah bernilai null', async () => {
  // DIPERBARUI OLEH M4 — dan pembaruan inilah buktinya M3 bekerja.
  //
  // Versi M3 uji ini menuntut kontrak menyatakan `asesmen_formatif` boleh null,
  // dengan catatan bahwa reviewer sudah menetapkan formatif akhirnya WAJIB dan
  // "uji ini AKAN dibalik di M4". M4 membalikkannya, dan yang perlu disunting
  // untuk membalikkannya hanya SATU tempat: `bentuk` di contract.ts. Prompt,
  // pesan perbaikan per fase, dan pesan perbaikan dokumen final ketiganya ikut
  // berubah tanpa disentuh — lihat M4-AH dan M4-AI.
  //
  // Yang uji ini jaga sekarang: diagnostik dan sumatif MASIH boleh null (
  // keduanya memang pilihan guru), dan dokumen historis tanpa formatif tetap
  // terbaca di modus historis.
  const k = await fixtureSehat();
  const ra = k.rencana_asesmen as Record<string, unknown>;
  ra.asesmen_formatif   = null;
  ra.asesmen_diagnostik = null;
  ra.asesmen_sumatif    = null;
  const v = validate(k, ...(await argsSehat()));
  assertEquals(v.errors.filter(e => /asesmen_(formatif|diagnostik|sumatif) tidak ada/.test(e)), []);

  const kontrakSrc = await Deno.readTextFile(
    new URL('../supabase/functions/generate-modul/contract.ts', import.meta.url));
  for (const jenis of ['asesmen_diagnostik', 'asesmen_sumatif']) {
    assert(new RegExp(`${jenis}": null \\|`).test(kontrakSrc),
      `kontrak tidak lagi menyatakan ${jenis} boleh null`);
  }
  // Dan formatif TIDAK lagi ditawarkan sebagai null (M4).
  assert(!/asesmen_formatif": null \|/.test(kontrakSrc),
    'kontrak masih membolehkan asesmen_formatif null — M4 mencabutnya');
});

Deno.test('M3-F: enum struktural yang salah ditolak validator', async () => {
  const args = await argsSehat();

  // nama_langkah di luar enum.
  const k1 = await fixtureSehat();
  ((k1.pertemuan as Array<Record<string, unknown>>)[0].langkah as Array<Record<string, unknown>>)[0].nama = 'PEMANASAN';
  const v1 = validate(k1, ...args);
  assert(!v1.valid, 'nama langkah di luar enum tetap lolos');

  // Enum yang divalidasi memang enum yang kontrak sebut.
  for (const nama of URUTAN_LANGKAH_KONTRAK) {
    assert(ENUM_KONTRAK.nama_langkah.includes(nama));
  }
  assertEquals(URUTAN_LANGKAH_KONTRAK.length, 6);
});

// ═════════════════════════════════════════════════════════════════════════════
// YANG DIMINTA DARI MODEL BERASAL DARI KONTRAK YANG SAMA
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('M3-G: kerangka prompt DIBANGKITKAN dari kontrak, bukan ditulis tangan', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  assert(src.includes('${kerangkaSeluruhFase()}'),
    'SYSTEM_PROMPT tidak memakai kerangka yang dibangkitkan');
  assert(src.includes('${ringkasanTanggungJawabFase()}'),
    'daftar tanggung jawab fase tidak dibangkitkan');

  // Bukan sekadar dipanggil: isinya memang berubah kalau kontraknya berubah.
  const sebelum = kerangkaSeluruhFase();
  assert(sebelum.includes('"catatan_guru"'));
  assert(sebelum.includes('FASE A:') && sebelum.includes('FASE D:'));
});

Deno.test('M3-H: setiap bagian akar yang model hasilkan muncul di kerangka', () => {
  const kerangka = kerangkaSeluruhFase();
  for (const [nama, f] of Object.entries(KONTRAK_ROOT)) {
    if (f.fase === 'server') {
      assert(!kerangka.includes(`"${nama}"`),
        `${nama} diisi backend tetapi tetap diminta dari model`);
      continue;
    }
    assert(kerangka.includes(`"${nama}"`), `${nama} tidak muncul di kerangka prompt`);
  }
  // Ringkasan tanggung jawab pun konsisten dengan kontrak.
  for (const fase of ['A', 'B', 'C', 'B2', 'D'] as const) {
    for (const nama of rootFase(fase)) {
      assert(ringkasanTanggungJawabFase().includes(nama),
        `${nama} tidak disebut di tanggung jawab fase ${fase}`);
    }
  }
});

Deno.test('M3-I: field nullable ditandai null di kerangka yang model terima', () => {
  const kerangka = kerangkaSeluruhFase();
  // `asesmen_formatif` dikeluarkan dari daftar ini oleh M4: ia tidak nullable
  // lagi. Perhatikan bahwa kerangkanya tidak disunting untuk itu — hanya
  // `bentuk` di kontrak yang berubah.
  for (const jenis of ['asesmen_diagnostik', 'asesmen_sumatif']) {
    assert(new RegExp(`"${jenis}":\\s*null \\|`).test(kerangka),
      `${jenis} tidak ditandai boleh null di kerangka`);
  }
  assert(!/"asesmen_formatif":\s*null/.test(kerangka),
    'kerangka masih menawarkan asesmen_formatif null — M4 mencabutnya');
  // Yang wajib TIDAK ditandai null.
  assert(!/"kktp":\s*null/.test(kerangka));
  assert(!/"pertemuan":\s*null/.test(kerangka));
});

Deno.test('M3-J: enum yang validator tegakkan sama persis dengan yang prompt beri', async () => {
  const kerangka = kerangkaSeluruhFase();
  for (const [nama, nilai] of Object.entries(ENUM_KONTRAK)) {
    for (const v of nilai) {
      assert(kerangka.includes(JSON.stringify(v)),
        `enum ${nama} nilai "${v}" tidak sampai ke kerangka prompt`);
    }
  }
  // Penanda enum benar-benar tergantikan — tidak ada <nama_enum> yang tersisa.
  assert(!/<[a-z_]+>/.test(kerangka), 'ada penanda enum yang tidak tergantikan di kerangka');

  // Dan validator memakai daftar yang sama, bukan salinannya.
  const bersih = (await Deno.readTextFile(EF_MODUL))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert(/URUTAN_LANGKAH = URUTAN_LANGKAH_KONTRAK/.test(bersih),
    'urutan langkah validator tidak berpangkal pada kontrak');
  assert(!/'PEMBUKA',\s*'ASESMEN_AWAL',\s*'MEMAHAMI'/.test(bersih),
    'daftar langkah masih ditulis ulang di generate-modul');
});

Deno.test('M3-K: perintah struktural pada PERBAIKAN berasal dari kontrak yang sama', async () => {
  const teks = perintahPerbaikanStruktural();
  assert(teks.includes(MODUL_SCHEMA_VERSION), 'perintah perbaikan tidak menyebut versi dari otoritas');
  for (const nama of rootWajib()) {
    if (KONTRAK_ROOT[nama].fase === 'server') {
      assert(!teks.includes(nama), `${nama} diisi backend tetapi diminta di pesan perbaikan`);
      continue;
    }
    assert(teks.includes(nama), `${nama} tidak disebut di perintah perbaikan`);
  }

  // Kedua jalur perbaikan memakainya: perbaikan validasi dan perbaikan JSON.
  // Sejak M3.1 keduanya memakai fungsi yang sama pada LINGKUP yang berbeda —
  // dokumen final tanpa argumen, per fase dengan `fase`. Yang dijaga di sini
  // tetap sama dan kini lebih ketat: dua jalur, satu kontrak, lingkup benar.
  const src = await Deno.readTextFile(EF_MODUL);
  assertEquals([...src.matchAll(/perintahPerbaikanStruktural\([^)]*\)/g)].length, 2,
    'tidak kedua jalur perbaikan memakai kontrak yang sama');
  assertEquals([...src.matchAll(/perintahPerbaikanStruktural\(\)/g)].length, 1,
    'jalur dokumen final tidak memakai lingkup final');
  assertEquals([...src.matchAll(/perintahPerbaikanStruktural\(fase\)/g)].length, 1,
    'jalur perbaikan JSON per fase tidak memakai lingkup fase');
});

Deno.test('M3-L: tidak ada blok kerangka final yang ditulis tangan di SYSTEM_PROMPT', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  assert(!/SCHEMA SKELETON/.test(src), 'blok skeleton lama masih ada');

  // Bagian akar tidak lagi didaftar manual di dalam string prompt. Yang boleh
  // menyebutnya hanyalah kontrak dan kode yang membacanya.
  const iPrompt = src.indexOf('const SYSTEM_PROMPT = `');
  const iAkhir  = src.indexOf("pelanggaran aturan.';", iPrompt);
  const prompt  = src.slice(iPrompt, iAkhir > 0 ? iAkhir : undefined);
  for (const nama of ['konteks_murid', 'materi_esensial', 'rancangan', 'metadata_pedagogis']) {
    assert(!new RegExp(`"${nama}":\\s*\\{`).test(prompt),
      `kerangka ${nama} masih ditulis tangan di SYSTEM_PROMPT`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PENJAGA DRIFT — YANG MEMBUAT MASALAH EMPAT-SCHEMA TIDAK KEMBALI
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('DRIFT-1: bagian akar baru di kontrak otomatis muncul di kerangka prompt', () => {
  // Bukan menguji string yang sama dua kali: kontraknya benar-benar diubah,
  // lalu kerangkanya dibangkitkan ulang dari objek yang sama.
  const sebelum = kerangkaSeluruhFase();
  const kunci = '__uji_drift__';
  const tambahan: FieldKontrak = {
    fase: 'D', kind: 'array', required: true,
    bentuk: `"${kunci}":[string]`,
  };
  KONTRAK_ROOT[kunci] = tambahan;
  try {
    const sesudah = kerangkaSeluruhFase();
    assertNotEquals(sesudah, sebelum,
      'menambah bagian akar ke kontrak tidak mengubah kerangka — prompt punya salinan sendiri');
    assert(sesudah.includes(`"${kunci}"`), 'bagian akar baru tidak sampai ke kerangka');
    assert(rootWajib().includes(kunci));
    assert(perintahPerbaikanStruktural().includes(kunci),
      'bagian akar baru tidak sampai ke perintah perbaikan');
  } finally {
    delete KONTRAK_ROOT[kunci];
  }
  assertEquals(kerangkaSeluruhFase(), sebelum, 'kontrak tidak pulih setelah uji');
});

Deno.test('DRIFT-2: enum baru di kontrak otomatis sampai ke kerangka', () => {
  const asli = [...ENUM_KONTRAK.mode_observasi];
  ENUM_KONTRAK.mode_observasi = [...asli, 'uji_drift'];
  try {
    assert(kerangkaSeluruhFase().includes('"uji_drift"'),
      'menambah nilai enum tidak mengubah kerangka — prompt punya daftar sendiri');
  } finally {
    ENUM_KONTRAK.mode_observasi = asli;
  }
  assert(!kerangkaSeluruhFase().includes('uji_drift'));
});

Deno.test('DRIFT-3: nilai enum di kerangka tidak boleh ada di luar kontrak', () => {
  // Setiap nilai enum yang dipakai di dalam bentuk kontrak ditulis lewat
  // penanda <nama_enum>. Kalau seseorang menuliskan nilainya langsung, ia
  // muncul di kerangka tanpa pernah lewat ENUM_KONTRAK — dan itu drift.
  const semua = new Set(Object.values(ENUM_KONTRAK).flat());
  for (const [nama, f] of Object.entries(KONTRAK_ROOT)) {
    if (!f.bentuk) continue;
    for (const nilai of semua) {
      assert(!f.bentuk.includes(`"${nilai}"`),
        `bentuk ${nama} menuliskan nilai enum "${nilai}" langsung — pakai penanda <nama_enum>`);
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// YANG TIDAK BOLEH HILANG
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('M3-M: jejak pewarisan M2 dikenal kontrak dan dituntut untuk dokumen baru', async () => {
  for (const nama of ['tp_anchor', 'atp_context', 'alokasi_server']) {
    const f = KONTRAK_ROOT[nama];
    assert(f, `${nama} tidak dikenal kontrak`);
    assertEquals(f.fase, 'server', `${nama} seharusnya diisi backend`);
    assertEquals(f.required, true);
    assertEquals(f.bentuk, undefined, `${nama} tidak boleh diminta dari model`);
  }

  // Dokumen BARU wajib membawanya …
  const k = await fixtureSehat();
  const args = await argsSehat();
  const vBaru = validate(k, args[0], args[1], args[2], args[3], args[4], undefined, args[6], true);
  assert(!vBaru.valid);
  for (const nama of ['tp_anchor', 'atp_context', 'alokasi_server']) {
    assert(vBaru.errors.some(e => e.includes(nama)), `${nama} tidak dituntut untuk dokumen baru`);
  }
  // … tetapi dokumen LAMA tidak dihakimi surut.
  assertEquals(validate(k, ...args).valid, true);
});

Deno.test('M3-N: jejak M2 tetap ikut ke dokumen final, dan hash M1 tidak tersentuh', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  const iMerge = src.indexOf('const merged: unknown = {');
  const blok = src.slice(iMerge, iMerge + 1800);
  for (const nama of ['tp_anchor', 'atp_context', 'alokasi_server']) {
    assert(blok.includes(nama), `${nama} hilang dari dokumen final`);
  }
  // Penyusunan menyalakan tuntutan jejak; jalur lain tidak. Sejak M4 argumen
  // sesudahnya adalah kontrak rantai bukti, jadi jalur penyusunan berbunyi
  // `true, true` — keduanya menyala. Lihat M4-AK.
  assert(/perangkatDigitalDiizinkan\(cd\), true(, true)?\)/.test(src),
    'jalur penyusunan tidak menuntut jejak pewarisan');

  // Semantik tp_snapshot_hash tidak disentuh M3.
  const anchorSrc = await Deno.readTextFile(
    new URL('../supabase/functions/generate-modul/anchor.ts', import.meta.url));
  assert(/export const FIELD_HASH/.test(anchorSrc));
  assert(!/atp_context/.test(anchorSrc), 'atp_context bocor ke perhitungan hash');
});

Deno.test('M3-O: metadata tambahan pada dokumen lama tidak menggagalkan validasi', async () => {
  const k = await fixtureSehat();
  k._draft = { fase_a: { catatan: 'sisa draft lama' } };
  k.metadata_tak_dikenal = { apa_saja: true };
  (k.identitas as Record<string, unknown>).field_lama = 'x';
  const v = validate(k, ...(await argsSehat()));
  assertEquals(v.errors, [], 'field tak dikenal ditolak — M3 bukan migrasi parser ketat');
  assert(v.valid);
});

Deno.test('M3-P: kelima contoh produksi memberi jumlah temuan yang sama dengan baseline M2', async () => {
  const baseline: Record<string, number> = {
    'tp02.json': 0, 'tp03.json': 0, 'tp04.json': 0, 'tp05.json': 1, 'tp06.json': 1,
  };
  for (const [nama, jumlah] of Object.entries(baseline)) {
    const { konten, harapan } = await harapanFixture(nama);
    const v = validate(
      konten, harapan.nomor_tp, harapan.jumlah_pertemuan, harapan.jp_per_pertemuan,
      harapan.durasi_jp, harapan.jumlah_murid, undefined, harapan.perangkat_digital_ok);
    assertEquals(v.errors.length, jumlah,
      `${nama}: ${v.errors.length} temuan, baseline ${jumlah} — ${v.errors.join('; ')}`);
    assertEquals(v.errors.length, harapan.jumlah_temuan, `${nama}: menyimpang dari _harapan berkasnya`);
  }
});

Deno.test('M3-Q: pemeriksaan kelayakan waktu tetap hidup — tidak terhapus saat refactor', async () => {
  const bersih = (await Deno.readTextFile(EF_MODUL))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const penanda of [
    'waktuPerKelompok(', 'MIN_MENIT_KELOMPOK_SUMATIF', 'MIN_MENIT_KELOMPOK_LATIHAN',
    "mode_pelaksanaan === 'bergantian'", "mode_pelaksanaan === 'individual'",
    'alokasi_waktu_total_menit', 'sum(sub_langkah',
  ]) {
    assert(bersih.includes(penanda), `pemeriksaan waktu hilang: ${penanda}`);
  }

  // Dan ia benar-benar menembak: kegiatan bergantian yang tidak muat ditolak.
  const k = await fixtureSehat();
  const sl = ((k.pertemuan as Array<Record<string, unknown>>)[0].langkah as Array<Record<string, unknown>>)
    .flatMap(l => l.sub_langkah as Array<Record<string, unknown>>)[0];
  sl.mode_pelaksanaan = 'bergantian';
  sl.ukuran_kelompok = 2;
  const v = validate(k, ...(await argsSehat()));
  assert(!v.valid && v.errors.some(e => /bergantian/.test(e)),
    `kelayakan waktu tidak lagi menembak: ${v.errors.join('; ')}`);
});

Deno.test('M3-R: seluruh M3 berjalan tanpa satu pun panggilan model', async () => {
  // Berkas kontrak murni: tidak ada jaringan, tidak ada env, tidak ada DB.
  const kontrakSrc = await Deno.readTextFile(
    new URL('../supabase/functions/generate-modul/contract.ts', import.meta.url));
  for (const terlarang of ['fetch(', 'Deno.env', 'createClient', 'generativelanguage']) {
    assert(!kontrakSrc.includes(terlarang), `contract.ts menyentuh ${terlarang}`);
  }
  // Berkas uji ini pun tidak menghubungi apa pun: satu-satunya izin yang ia
  // butuhkan adalah baca berkas dan tulis berkas sementara di samping sumber
  // Edge Function. Tidak ada --allow-net di perintah menjalankannya, jadi
  // panggilan jaringan apa pun akan gagal keras, bukan lolos diam-diam.
  let adaNet = true;
  try {
    await Deno.permissions.query({ name: 'net' });
    adaNet = (await Deno.permissions.query({ name: 'net' })).state === 'granted';
  } catch { adaNet = false; }
  assertEquals(adaNet, false, 'uji M3 dijalankan dengan izin jaringan — seharusnya tidak perlu');
});

// ═════════════════════════════════════════════════════════════════════════════
// M3.1 — PERBAIKAN YANG SADAR LINGKUPNYA
// ═════════════════════════════════════════════════════════════════════════════
//
// M3 memakai satu bentuk perintah perbaikan untuk dua jalur yang berbeda
// lingkupnya. Pada perbaikan JSON per fase hasilnya membantah dirinya sendiri:
// "hasilkan ulang HANYA object Fase B" disusul daftar seluruh bagian akar
// dokumen. Sekarang lingkupnya diberikan pemanggil, bukan ditebak dari label.

/** Bagian akar milik model (bukan yang diisi backend). */
const ROOT_MODEL = Object.entries(KONTRAK_ROOT)
  .filter(([, f]) => f.fase !== 'server').map(([k]) => k);

Deno.test('M3-S: perbaikan Fase A hanya menyebut bagian akar milik Fase A', () => {
  const teks = perintahPerbaikanStruktural('A');
  const milikA = rootFase('A');
  for (const nama of milikA) {
    assert(teks.includes(nama), `${nama} tidak disebut di perbaikan Fase A`);
  }
  // Dan tidak menyeret milik fase lain.
  for (const nama of ROOT_MODEL.filter(k => !milikA.includes(k))) {
    assert(!new RegExp(`\\b${nama}\\b`).test(teks.split('Kerangka yang diminta:')[0]),
      `perbaikan Fase A menuntut ${nama}, milik fase lain`);
  }
});

Deno.test('M3-T: perbaikan Fase A menyertakan manifest, meski ia bukan root wajib final', () => {
  // manifest keluaran nyata Fase A dan dipakai Fase B serta C, tetapi tidak ikut
  // ke dokumen final — sehingga daftar wajib final tidak memuatnya. Perbaikan
  // yang memakai daftar final akan menghasilkan Fase A yang lumpuh.
  assertEquals(KONTRAK_ROOT.manifest.required, false, 'manifest ternyata wajib di dokumen final');
  assertEquals(KONTRAK_ROOT.manifest.fase, 'A');
  assert(!rootWajib().includes('manifest'));

  assert(perintahPerbaikanStruktural('A').includes('manifest'),
    'perbaikan Fase A tidak menyebut manifest');
  assert(!perintahPerbaikanStruktural().includes('manifest'),
    'perbaikan dokumen final justru menuntut manifest');
});

Deno.test('M3-U: perbaikan Fase B hanya pertemuan', () => {
  const teks = perintahPerbaikanStruktural('B');
  const kepala = teks.split('Kerangka yang diminta:')[0];
  assert(kepala.includes('pertemuan'));
  for (const asing of ['kktp', 'instrumen_asesmen', 'naskah_fasilitasi', 'tindak_lanjut',
                       'identitas', 'catatan_guru', 'schema_version']) {
    assert(!new RegExp(`\\b${asing}\\b`).test(kepala),
      `perbaikan Fase B menuntut ${asing}`);
  }
});

Deno.test('M3-V: perbaikan Fase C hanya instrumen', () => {
  const kepala = perintahPerbaikanStruktural('C').split('Kerangka yang diminta:')[0];
  assertEquals(rootFase('C'), ['instrumen_pembelajaran', 'instrumen_asesmen']);
  for (const nama of rootFase('C')) assert(kepala.includes(nama));
  for (const asing of ['pertemuan', 'kktp', 'naskah_fasilitasi', 'tindak_lanjut']) {
    assert(!new RegExp(`\\b${asing}\\b`).test(kepala), `perbaikan Fase C menuntut ${asing}`);
  }
});

Deno.test('M3-W: perbaikan Fase B2 hanya naskah_fasilitasi', () => {
  const kepala = perintahPerbaikanStruktural('B2').split('Kerangka yang diminta:')[0];
  assertEquals(rootFase('B2'), ['naskah_fasilitasi']);
  assert(kepala.includes('naskah_fasilitasi'));
  for (const asing of ['pertemuan', 'instrumen_pembelajaran', 'tindak_lanjut', 'identitas']) {
    assert(!new RegExp(`\\b${asing}\\b`).test(kepala), `perbaikan Fase B2 menuntut ${asing}`);
  }
});

Deno.test('M3-X: perbaikan Fase D hanya tindak_lanjut dan catatan_guru', () => {
  const kepala = perintahPerbaikanStruktural('D').split('Kerangka yang diminta:')[0];
  assertEquals(rootFase('D'), ['tindak_lanjut', 'catatan_guru']);
  for (const nama of rootFase('D')) assert(kepala.includes(nama));
  for (const asing of ['pertemuan', 'kktp', 'naskah_fasilitasi', 'instrumen_asesmen']) {
    assert(!new RegExp(`\\b${asing}\\b`).test(kepala), `perbaikan Fase D menuntut ${asing}`);
  }
});

Deno.test('M3-Y: perbaikan dokumen final tetap menyebut seluruh akar wajib milik model', () => {
  const teks = perintahPerbaikanStruktural();
  for (const nama of rootWajib()) {
    if (KONTRAK_ROOT[nama].fase === 'server') continue;
    assert(teks.includes(nama), `${nama} hilang dari perbaikan dokumen final`);
  }
  assert(teks.includes(MODUL_SCHEMA_VERSION), 'perbaikan final tidak menyebut versi');
  // Lingkup final berbeda dari lingkup fase mana pun.
  for (const f of ['A', 'B', 'C', 'B2', 'D'] as const) {
    assertNotEquals(teks, perintahPerbaikanStruktural(f));
  }
});

Deno.test('M3-Z: callPhase menerima fase secara eksplisit dan bertipe, bukan menebak label', async () => {
  const src = await Deno.readTextFile(EF_MODUL);

  assert(/async function callPhase\([\s\S]{0,600}fase\?: FasePenghasil,/.test(src),
    'callPhase tidak menerima fase bertipe FasePenghasil');
  assert(/perintahPerbaikanStruktural\(fase\)/.test(src),
    'perbaikan JSON tidak memakai lingkup fase');

  // Tidak ada yang menyimpulkan fase dari kalimat untuk manusia.
  const bersih = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const pola of [/label\.includes\(/, /label\.match\(/, /label\.startsWith\(/,
                      /label\.slice\(/, /\/Fase [ABCD]\//]) {
    assert(!pola.test(bersih), `fase disimpulkan dari label: ${pola}`);
  }
});

Deno.test('M3-AA: setiap panggilan fase di produksi memberi lingkup yang benar', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  const panggilan = [...src.matchAll(/await callPhase\(([\s\S]*?)\n\s*\);/g)].map(m => m[1]);
  assertEquals(panggilan.length, 5, `jumlah panggilan fase berubah: ${panggilan.length}`);

  const harapan: Record<string, string> = {
    'Fase A': 'A', 'Fase B': 'B', 'Fase C': 'C', 'Fase D': 'D', 'Fase B2 (naskah)': 'B2',
  };
  const terlihat = new Set<string>();
  for (const blok of panggilan) {
    const label = blok.match(/'(Fase [^']*)'/)?.[1];
    assert(label && label in harapan, `label panggilan tidak dikenal: ${label}`);
    const fase = blok.match(/'(A|B|C|B2|D)',\s*$/m)?.[1];
    assertEquals(fase, harapan[label], `panggilan ${label} memberi lingkup ${fase}`);
    terlihat.add(harapan[label]);
  }
  assertEquals([...terlihat].sort(), ['A', 'B', 'B2', 'C', 'D'],
    'ada fase yang tidak punya panggilan produksi');
});

Deno.test('M3-AB: bagian akar baru pada satu fase hanya mengubah perbaikan fase ITU', () => {
  const sebelumB = perintahPerbaikanStruktural('B');
  const sebelumC = perintahPerbaikanStruktural('C');
  const sebelumFinal = perintahPerbaikanStruktural();

  KONTRAK_ROOT.__uji_b = {
    fase: 'B', kind: 'array', required: true, bentuk: `"__uji_b":[string]`,
  };
  try {
    const sesudahB = perintahPerbaikanStruktural('B');
    assertNotEquals(sesudahB, sebelumB, 'perbaikan Fase B tidak mengikuti kontrak');
    assert(sesudahB.includes('__uji_b'));

    // Fase lain TIDAK ikut berubah — inilah bukti bahwa lingkupnya benar-benar
    // per fase, bukan satu daftar yang kebetulan disaring.
    assertEquals(perintahPerbaikanStruktural('C'), sebelumC,
      'perbaikan Fase C ikut berubah oleh bagian akar milik Fase B');
    assert(!perintahPerbaikanStruktural('C').includes('__uji_b'));

    // Dokumen final ikut, karena ia memang wajib di dokumen final.
    assert(perintahPerbaikanStruktural().includes('__uji_b'));
  } finally {
    delete KONTRAK_ROOT.__uji_b;
  }
  assertEquals(perintahPerbaikanStruktural('B'), sebelumB, 'kontrak tidak pulih');
  assertEquals(perintahPerbaikanStruktural(), sebelumFinal);
});

Deno.test('M3-AC: nilai enum baru ikut ke perbaikan fase yang kerangkanya memakainya', () => {
  const asli = [...ENUM_KONTRAK.mode_pelaksanaan];
  ENUM_KONTRAK.mode_pelaksanaan = [...asli, 'uji_lingkup'];
  try {
    // Fase B memakai <mode_pelaksanaan> di kerangkanya.
    assert(perintahPerbaikanStruktural('B').includes('"uji_lingkup"'),
      'enum baru tidak sampai ke perbaikan Fase B');
    // Fase D tidak memakainya, jadi tidak ikut.
    assert(!perintahPerbaikanStruktural('D').includes('uji_lingkup'));
  } finally {
    ENUM_KONTRAK.mode_pelaksanaan = asli;
  }
  assert(!perintahPerbaikanStruktural('B').includes('uji_lingkup'));
});

Deno.test('M3-AD: bagian yang diisi backend tidak pernah diminta di perbaikan mana pun', () => {
  const server = Object.entries(KONTRAK_ROOT)
    .filter(([, f]) => f.fase === 'server').map(([k]) => k);
  assertEquals(server.sort(), ['alokasi_server', 'atp_context', 'tp_anchor']);

  const semua = [perintahPerbaikanStruktural(),
    ...(['A', 'B', 'C', 'B2', 'D'] as const).map(f => perintahPerbaikanStruktural(f))];
  for (const teks of semua) {
    for (const nama of server) {
      assert(!teks.includes(nama), `${nama} diminta dari model di salah satu pesan perbaikan`);
    }
  }
});

Deno.test('M3-AE: perbaikan khusus durasi tetap berlingkup Fase B', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  const i = src.indexOf('const repairMsg = hasDurasiError');
  assert(i > 0, 'cabang perbaikan durasi tidak ditemukan');
  const cabang = src.slice(i, src.indexOf('const repairText', i));

  // Cabang durasi membangun ulang pesan Fase B — yang kerangkanya sudah datang
  // dari kontrak — dan hanya menambahkan aturan durasi.
  assert(/buildUserMessageFaseB\(/.test(cabang), 'cabang durasi tidak lagi memakai pesan Fase B');
  assert(/durasi_menit HARUS/.test(cabang), 'aturan durasi hilang');

  // Ia TIDAK berubah menjadi perbaikan dokumen penuh.
  const bagianDurasi = cabang.slice(0, cabang.indexOf(': JSON.stringify(merged)'));
  assert(!/perintahPerbaikanStruktural\(/.test(bagianDurasi),
    'cabang durasi ikut menuntut bentuk dokumen penuh');

  // Dan aturan kelayakan waktu tidak disentuh M3.1.
  assert(src.includes('waktuPerKelompok('), 'pemeriksaan kelayakan waktu hilang');
});
