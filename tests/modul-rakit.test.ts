// KOREKSI M9 — PERAKITAN MODUL FINAL (smoke produksi 11 September 2026).
//
// Smoke produksi Modul fff9db36: Fase A/B/C/B2 berhasil, lalu Fase D menolak
// dokumennya sendiri — "keputusan_kontekstual harus array ≥ 1 entri" — karena
// handler merakit `merged` TANPA field M6 yang sudah dihasilkan Fase A.
// Perbaikan gagal, guru menerima HTTP 422, dan Modul tertinggal sebagai draft.
//
// Seluruh uji M9 hijau karena tests/m9-semantic-harness.ts merakit `merged`-nya
// SENDIRI dan kebetulan membawa field itu. Yang diuji adalah tiruan, bukan jalur
// produksi.
//
// Berkas ini TIDAK menulis tiruan perakitan. Ia memanggil rakitModulFinal() —
// fungsi yang sama yang dipanggil handler dan harness — dan mengunci bahwa
// hanya ada satu fungsi itu.
//
// RFA-1  keputusan_kontekstual Fase A sampai di dokumen final
// RFA-2  nilainya sampai tanpa diubah
// RFA-3  handler (dan harness) memakai otoritas perakitan yang sama
// RFA-4  jalur perbaikan melihat field itu sebelum ia dipanggil
// RFA-5  ekstraksi tidak menjatuhkan field akar mana pun
//
// TIDAK ADA panggilan model di berkas ini.

import { assert, assertEquals, assertStrictEquals } from 'jsr:@std/assert@1';
import { rakitModulFinal } from '../supabase/functions/generate-modul/assembly.ts';
import { KONTRAK_ROOT } from '../supabase/functions/generate-modul/contract.ts';

const EF_MODUL = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);
const HARNESS  = new URL('./m9-semantic-harness.ts', import.meta.url);

// Jalur perbaikan diambil dari SUMBER EF — pola yang sama dengan modul-perbaikan.test.ts.
// deno-lint-ignore no-explicit-any
async function muatEF(): Promise<any> {
  const penuh = await Deno.readTextFile(EF_MODUL);
  const batas = penuh.indexOf('// ── EDGE FUNCTION ─');
  assert(batas > 0, 'penanda EDGE FUNCTION tidak ada di index.ts');
  const tmp = new URL(`._modul-rakit-${crypto.randomUUID()}.ts`, new URL('.', EF_MODUL));
  try {
    await Deno.writeTextFile(tmp, penuh.slice(0, batas) + '\nexport { perbaikiModulSetelahValidasi };\n');
    return await import(tmp.href);
  } finally {
    await Deno.remove(tmp).catch(() => {});
  }
}
const M = await muatEF();

// ── Bahan: setiap nilai adalah penanda unik, supaya asal tiap field terbukti ──

const KTX = [{
  id: 'KTX-01',
  sumber: { jenis: 'kesiapan_murid', kunci: 'sebagian_besar_siap' },
  keputusan: 'PENANDA-KEPUTUSAN-KONTEKSTUAL',
  komponen_terdampak: ['pertemuan:1'],
  penerapan: 'PENANDA-PENERAPAN',
}];

function bahan(ubah: Record<string, unknown> = {}) {
  const faseAOutput: Record<string, unknown> = {
    identitas: {
      mata_pelajaran: 'AI-MAPEL', jenjang: 'AI-JENJANG', fase: 'AI-FASE',
      konteks_kejuruan: 'AI-KONTEKS-KEJURUAN', dasar_cp: 'AI-DASAR-CP',
      tujuan_pembelajaran: 'AI-TUJUAN',
    },
    kktp:                  [{ id_kktp: 'K1', penanda: 'A-KKTP' }],
    konteks_murid:         { penanda: 'A-KONTEKS-MURID' },
    materi_esensial:       { penanda: 'A-MATERI' },
    rencana_asesmen:       { penanda: 'A-RENCANA-ASESMEN' },
    rancangan:             { penanda: 'A-RANCANGAN' },
    metadata_pedagogis:    { penanda: 'A-METADATA' },
    keputusan_kontekstual: KTX,
    manifest:              { pembelajaran_manifest: [], asesmen_manifest: [] },
    ...ubah,
  };
  return {
    faseAOutput,
    faseBOutput: { pertemuan: [{ nomor: 1, penanda: 'B-PERTEMUAN' }] },
    faseCOutput: {
      instrumen_pembelajaran: [{ id: 'PBL-01', penanda: 'C-PBL' }],
      instrumen_asesmen:      [{ id: 'ASM-01', penanda: 'C-ASM' }],
    },
    faseDOutput: { tindak_lanjut: { penanda: 'D-TINDAK-LANJUT' }, catatan_guru: 'D-CATATAN' },
    naskahFinal: [{ nomor: 1, penanda: 'B2-NASKAH' }],
    identitasDB: { mapel: 'Bahasa Inggris', jenjang: 'SMK', fase: 'E' },
    nomorTp: 1, jumlahPertemuan: 2, jpPerPertemuan: 4, durasiJp: 45,
    elemenCp: [{ label: 'Menyimak - Berbicara', cp_text: 'CP-RESMI' }],
    tpAnchor: {
      atp_induk_id: 'atp-uji', nomor_tp: 1, tp_judul: 'TP uji', tuntutan: ['BIE-E25-MB-1'],
      kategori_teks: ['fiksi'], semester: 1, jp_alokasi: 8, jp_pertemuan: [4, 4],
      versi_cp: '046/H/KR/2025',
    },
    tuntutanTerurai: [{ id: 'BIE-E25-MB-1', penanda: 'SERVER-TUNTUTAN' }],
    kategoriWajib:   ['PENANDA-KATEGORI'],
    atpContext:      { penanda: 'SERVER-ATP-CONTEXT' },
    alokasiServer:   { penanda: 'SERVER-ALOKASI' },
  };
}

// Daftar field akar yang dirakit handler SEBELUM ekstraksi — disalin dari
// objek `merged` di supabase/functions/generate-modul/index.ts:4990-5017 pada
// 92c2c6c. Ini POTRET untuk membuktikan paritas, bukan implementasi perakitan:
// tidak ada nilai yang dirakit dari daftar ini.
const FIELD_AKAR_SEBELUM_EKSTRAKSI = [
  'schema_version', 'identitas', 'kktp', 'konteks_murid', 'materi_esensial',
  'rencana_asesmen', 'rancangan', 'pertemuan', 'naskah_fasilitasi',
  'instrumen_pembelajaran', 'instrumen_asesmen', 'tindak_lanjut', 'catatan_guru',
  'metadata_pedagogis', 'tp_anchor', 'atp_context', 'alokasi_server',
];

// ── RFA-1 ────────────────────────────────────────────────────────────────────

Deno.test('RFA-1 — keputusan_kontekstual dari Fase A sampai di dokumen final', () => {
  const b = bahan();
  assert(Array.isArray(b.faseAOutput.keputusan_kontekstual) && b.faseAOutput.keputusan_kontekstual.length > 0,
    'prasyarat: Fase A membawa keputusan_kontekstual');
  const dok = rakitModulFinal(b);
  assert('keputusan_kontekstual' in dok,
    'dokumen final kehilangan keputusan_kontekstual — persis cacat smoke produksi fff9db36');
  assert(Array.isArray(dok.keputusan_kontekstual) && (dok.keputusan_kontekstual as unknown[]).length >= 1,
    'keputusan_kontekstual final harus array ≥ 1 entri, sama dengan yang dituntut validator');
});

// ── RFA-2 ────────────────────────────────────────────────────────────────────

Deno.test('RFA-2 — nilai keputusan_kontekstual diteruskan persis, tidak disalin ulang atau diubah', () => {
  const salinan = structuredClone(KTX);
  const dok = rakitModulFinal(bahan());
  assertStrictEquals(dok.keputusan_kontekstual, KTX, 'harus objek yang sama dari Fase A');
  assertEquals(dok.keputusan_kontekstual, salinan, 'isinya tidak boleh berubah');
  assertEquals(KTX, salinan, 'perakitan tidak boleh memutasi keluaran Fase A');
});

// ── RFA-3 ────────────────────────────────────────────────────────────────────

Deno.test('RFA-3 — handler Fase D merakit lewat rakitModulFinal(), tanpa daftar field sendiri', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  assert(/import \{ rakitModulFinal \} from '\.\/assembly\.ts';/.test(src), 'index.ts tidak mengimpor otoritas perakitan');
  const handler = src.slice(src.indexOf('// ── EDGE FUNCTION ─'));
  const faseD = handler.slice(handler.indexOf("if (fase === 'D') {"));
  assert(faseD.length > 0 && handler.includes("if (fase === 'D') {"), 'blok Fase D tidak ditemukan');
  const iRakit = faseD.indexOf('const merged: unknown = rakitModulFinal({');
  const iValidasi = faseD.indexOf('validateModulOutputV400(merged,');
  assert(iRakit > 0, 'Fase D tidak merakit lewat rakitModulFinal()');
  assert(iValidasi > iRakit, 'validasi Fase D harus memeriksa dokumen hasil rakitModulFinal()');
  // Tidak boleh ada perakitan kembar di sisi mana pun dari EF. (Penanda yang
  // dipakai adalah penanda PERAKITAN DOKUMEN — `summary` respons HTTP Fase D
  // juga memuat schema_version, tetapi ia bukan dokumen.)
  assert(!/identitas:\s+identitasFinal/.test(src), 'index.ts masih merakit identitas final sendiri');
  assert(!/kktp:\s+faseAOutput\.kktp/.test(src), 'index.ts masih menulis literal dokumen final sendiri');
});

Deno.test('RFA-3b — harness M9 memakai otoritas perakitan yang sama, bukan daftar field sendiri', async () => {
  const src = await Deno.readTextFile(HARNESS);
  assert(/import \{ rakitModulFinal \} from '\.\.\/supabase\/functions\/generate-modul\/assembly\.ts';/.test(src),
    'harness tidak mengimpor rakitModulFinal');
  assert(src.includes('rakitModulFinal({'), 'harness tidak memanggil rakitModulFinal');
  assert(!/const merged = \{/.test(src), 'harness masih merakit dokumen final sendiri');
  assert(!/identitasFinal/.test(src), 'harness masih merakit identitas final sendiri');
});

// ── RFA-4 ────────────────────────────────────────────────────────────────────

Deno.test('RFA-4 — dokumen yang diserahkan ke perbaikan sudah membawa keputusan_kontekstual, dan perbaikan melindunginya', async () => {
  const merged = rakitModulFinal(bahan());
  assert(Object.keys(merged).includes('keputusan_kontekstual'),
    'Object.keys(merged) — dasar daftar field wajib perbaikan — tidak memuat keputusan_kontekstual');

  // Jalur dokumen (galat bukan durasi) — jalur yang ditempuh smoke produksi.
  // deno-lint-ignore no-explicit-any
  const panggil: any[] = [];
  await M.perbaikiModulSetelahValidasi({
    merged, errors: ['keputusan_kontekstual harus array ≥ 1 entri'],
    faseAOutput: bahan().faseAOutput,
    manifest: { pembelajaran_manifest: [], asesmen_manifest: [] },
    jumlahPertemuan: 2, jpPerPertemuan: 4, durasiJp: 45, jumlahMurid: 30,
    cd: {}, arahanTitikAwal: null, warisan: {},
    panggilAI: (pesan: string, maxTokens: number) => {
      panggil.push({ pesan, maxTokens });
      return Promise.resolve(JSON.stringify(merged));
    },
    susunNaskah: () => { throw new Error('jalur dokumen tidak boleh menyusun naskah'); },
    validasi: () => ({ valid: true, errors: [], output: null }),
  });
  assertEquals(panggil.length, 1);
  const pesan: string = panggil[0].pesan;
  const i = pesan.indexOf('Field akar dokumen ini yang WAJIB tetap ada:');
  assert(i > 0, 'daftar field akar tidak dikirim ke model');
  assert(pesan.slice(i).includes('keputusan_kontekstual'),
    'perbaikan tidak diberi tahu bahwa keputusan_kontekstual wajib tetap ada');
});

// ── RFA-5 ────────────────────────────────────────────────────────────────────

Deno.test('RFA-5 — field akar: seluruh field sebelum ekstraksi tetap ada, ditambah tepat satu field M6', () => {
  const dok = rakitModulFinal(bahan());
  assertEquals(
    Object.keys(dok).sort(),
    [...FIELD_AKAR_SEBELUM_EKSTRAKSI, 'keputusan_kontekstual'].sort(),
    'tidak boleh ada field akar yang hilang, dan tidak boleh ada field lain yang ditambahkan diam-diam');
});

Deno.test('RFA-5b — setiap field akar berasal dari sumber yang sama seperti sebelum ekstraksi', () => {
  const b = bahan();
  const dok = rakitModulFinal(b);
  assertEquals(dok.schema_version, '4.0.0');
  assertStrictEquals(dok.kktp, b.faseAOutput.kktp);
  assertStrictEquals(dok.konteks_murid, b.faseAOutput.konteks_murid);
  assertStrictEquals(dok.materi_esensial, b.faseAOutput.materi_esensial);
  assertStrictEquals(dok.rencana_asesmen, b.faseAOutput.rencana_asesmen);
  assertStrictEquals(dok.rancangan, b.faseAOutput.rancangan);
  assertStrictEquals(dok.metadata_pedagogis, b.faseAOutput.metadata_pedagogis);
  assertStrictEquals(dok.pertemuan, b.faseBOutput.pertemuan);
  assertStrictEquals(dok.naskah_fasilitasi, b.naskahFinal);
  assertStrictEquals(dok.instrumen_pembelajaran, b.faseCOutput.instrumen_pembelajaran);
  assertStrictEquals(dok.instrumen_asesmen, b.faseCOutput.instrumen_asesmen);
  assertStrictEquals(dok.tindak_lanjut, b.faseDOutput.tindak_lanjut);
  assertStrictEquals(dok.catatan_guru, b.faseDOutput.catatan_guru);
  assertStrictEquals(dok.atp_context, b.atpContext);
  assertStrictEquals(dok.alokasi_server, b.alokasiServer);
  assertEquals(dok.tp_anchor, {
    ...b.tpAnchor, tuntutan: b.tuntutanTerurai, tuntutan_id: b.tpAnchor.tuntutan,
    kategori_teks_wajib: b.kategoriWajib,
  });
  assertEquals(dok.identitas, {
    mata_pelajaran: 'Bahasa Inggris', jenjang: 'SMK', fase: 'E', nomor_tp: 1,
    jumlah_pertemuan: 2, jp_per_pertemuan: 4, durasi_jp_menit: 45,
    alokasi_waktu_total_menit: 360, elemen_cp: ['Menyimak - Berbicara'],
    jenis_dokumen: 'Modul Induk; guru mengadaptasi konteks kelas dan program keahlian',
    konteks_kejuruan: 'AI-KONTEKS-KEJURUAN', dasar_cp: 'Menyimak - Berbicara: CP-RESMI',
    tujuan_pembelajaran: 'AI-TUJUAN',
  });
  // manifest Fase A sengaja TIDAK masuk dokumen final (validator menerimanya terpisah).
  assert(!('manifest' in dok));
});

Deno.test('RFA-5c — nilai bawaan sama seperti sebelum ekstraksi', () => {
  const b = { ...bahan(), naskahFinal: undefined, faseCOutput: {}, elemenCp: [] };
  const dok = rakitModulFinal(b);
  assertEquals(dok.naskah_fasilitasi, []);
  assertEquals(dok.instrumen_pembelajaran, []);
  assertEquals(dok.instrumen_asesmen, []);
  assertEquals((dok.identitas as Record<string, unknown>).dasar_cp, 'AI-DASAR-CP',
    'tanpa elemen CP, dasar_cp jatuh ke keluaran AI seperti sebelumnya');
});

Deno.test('RFA-5d — setiap field akar kontrak milik fase penyusun hadir di dokumen final', () => {
  // Penjaga drift di masa depan: field baru di KONTRAK_ROOT yang dihasilkan
  // fase mana pun wajib ikut dirakit. `manifest` satu-satunya pengecualian —
  // ia kontrak identitas instrumen yang validator terima sebagai argumen
  // terpisah, bukan bagian dokumen yang guru arsipkan.
  const dok = rakitModulFinal(bahan());
  const tidakDirakit = Object.keys(KONTRAK_ROOT).filter(k => k !== 'manifest' && !(k in dok));
  assertEquals(tidakDirakit, [], `field kontrak tidak dirakit: ${tidakDirakit.join(', ')}`);
});
