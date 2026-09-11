// M9/D2 — LIFECYCLE PERBAIKAN SETELAH VALIDASI.
//
// Generate nyata M9 (Skenario 1 attempt 4) membuktikan jalur perbaikan produksi
// merusak modul yang sebenarnya dapat diselamatkan: model membereskan seluruh
// galat waktu, lalu validasi ulang menolak 43 galat buatan pipeline sendiri —
// manifest kosong, ref tidak disuntik, naskah lama dipakai bersama pertemuan
// baru, dan anggaran satu fase normal.
//
// Berkas ini mengunci KABELNYA, bukan kalimat model. Model, penyusun naskah, dan
// validator disuntikkan sebagai mata-mata; yang diuji adalah apa yang
// perbaikiModulSetelahValidasi() kirim, urutannya, dan dokumen yang ia serahkan
// ke validasi akhir.
//
// R1  Fase B perbaikan menerima manifest Fase A yang asli
// R2  pertemuan hasil perbaikan melewati injectSubLangkahRef() sebelum B2/validasi
// R3  naskah lama tidak dipakai kembali
// R4  B2 disusun ulang dari pertemuan baru + instrumen yang sama
// R5  kedua jalur memakai anggaranTokenPerbaikan()
// R6  tidak ada jalur yang menghasilkan pertemuan baru + naskah basi
// R7  Edge Function benar-benar memanggil lifecycle ini
//
// TIDAK ADA panggilan model di berkas ini.

import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';

const EF_MODUL = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);

// deno-lint-ignore no-explicit-any
async function muat(): Promise<any> {
  const penuh = await Deno.readTextFile(EF_MODUL);
  const batas = penuh.indexOf('// ── EDGE FUNCTION ─');
  assert(batas > 0, 'penanda EDGE FUNCTION tidak ada di index.ts');
  const tmp = new URL(`._modul-perbaikan-${crypto.randomUUID()}.ts`, new URL('.', EF_MODUL));
  try {
    await Deno.writeTextFile(tmp, penuh.slice(0, batas) +
      '\nexport { perbaikiModulSetelahValidasi, injectSubLangkahRef, anggaranToken, anggaranTokenPerbaikan };\n');
    return await import(tmp.href);
  } finally {
    await Deno.remove(tmp).catch(() => {});
  }
}
const M = await muat();

const MANIFEST = {
  pembelajaran_manifest: [{ id: 'PBL-01', jenis: 'teks_autentik', untuk_murid: true }],
  asesmen_manifest: [
    { id: 'ASM-01', jenis: 'matriks_observasi', untuk_murid: false },
    { id: 'ASM-02', jenis: 'matriks_observasi', untuk_murid: false },
  ],
};

const WARISAN = {
  tpAnchor: {
    atp_induk_id: 'uji', nomor_tp: 1, tp_judul: 'TP uji', tuntutan: ['BIE-E25-MM-1'],
    kategori_teks: ['nonfiksi'], semester: 1, jp_alokasi: 12, jp_pertemuan: [4, 4, 4],
    versi_cp: '046/H/KR/2025',
  },
  tuntutan: [{ id: 'BIE-E25-MM-1', kompetensi: 'memahami alur informasi', lingkup_materi: 'teks prosedur' }],
  kategoriWajib: ['nonfiksi'],
  alokasi: { pertemuan: [4, 4, 4] },
  // Bentuk konteks ATP yang sama dengan yang bangunAtpContext hasilkan —
  // warisanKonteks() membaca `.nilai` dari tiap field.
  atpContext: {
    versi_cp: '046/H/KR/2025', semester: 1,
    kesiapan_murid:   { nilai: 'jauh_di_bawah', asal: 'keputusan_guru', arti: 'jauh di bawah prasyarat' },
    jumlah_murid:     { nilai: 32, asal: 'fakta' },
    program_keahlian: { nilai: 'Tata Busana', asal: 'fakta' },
    konteks_tugas:    { nilai: 'seimbang', asal: 'keputusan_guru', arti: 'seimbang' },
    prioritas_guru:   [],
    penerapan_prioritas: { untuk_tp_ini: [], seluruh_atp: [] },
  },
};

// Pertemuan dari model — TANPA ref, seperti yang instruksi Fase B minta.
const PERTEMUAN_MODEL = [1, 2, 3].map(nomor => ({
  nomor,
  langkah: [
    { nama: 'MEMAHAMI', durasi_menit: 90, sub_langkah: [
      { nomor: 1, durasi_menit: 45, instrumen_ref: 'PBL-01' },
      { nomor: 2, durasi_menit: 45 },
    ] },
    { nama: 'MENGAPLIKASI', durasi_menit: 90, sub_langkah: [
      { nomor: 1, durasi_menit: 90, instrumen_ref: 'ASM-01' },
    ] },
  ],
}));

const NASKAH_BASI = [{ nomor: 1, penanda: 'NASKAH-BASI' }];
const NASKAH_BARU = [{ nomor: 1, penanda: 'NASKAH-BARU' }];

function merged() {
  return {
    schema_version: '4.0.0',
    pertemuan: [{ nomor: 1, penanda: 'PERTEMUAN-LAMA' }],
    naskah_fasilitasi: NASKAH_BASI,
    instrumen_pembelajaran: [{ id: 'PBL-01', untuk_murid: true }],
    instrumen_asesmen: [{ id: 'ASM-01', untuk_murid: false }, { id: 'ASM-02', untuk_murid: false }],
  };
}

const GALAT_DURASI = [
  'pertemuan 3.MENGAPLIKASI.sub_langkah[1]: individual+semua membutuhkan ≥64 menit (32 murid × 2 mnt) tapi durasi=60. Ganti pendekatan.',
  'pertemuan 3: Σlangkah.durasi_menit=170, diharapkan 180 (4 JP × 45 menit)',
];

// deno-lint-ignore no-explicit-any
function jalankan(errors: string[], balasanModel: unknown): Promise<any> & { jejak: any } {
  // deno-lint-ignore no-explicit-any
  const jejak: any = { urutan: [] as string[], panggil: [], naskah: [], validasi: [] };
  // deno-lint-ignore no-explicit-any
  const hasil: any = M.perbaikiModulSetelahValidasi({
    merged: merged(), errors, faseAOutput: { kktp: [] }, manifest: MANIFEST,
    jumlahPertemuan: 3, jpPerPertemuan: 4, durasiJp: 45, jumlahMurid: 32,
    cd: {}, arahanTitikAwal: null, warisan: WARISAN,
    panggilAI: (pesan: string, maxTokens: number) => {
      jejak.urutan.push('model');
      jejak.panggil.push({ pesan, maxTokens });
      return Promise.resolve(JSON.stringify(balasanModel));
    },
    susunNaskah: (pw: unknown[], ip: unknown[], ia: unknown[]) => {
      jejak.urutan.push('naskah');
      jejak.naskah.push({ pw, ip, ia });
      return Promise.resolve(NASKAH_BARU);
    },
    validasi: (dok: unknown) => {
      jejak.urutan.push('validasi');
      jejak.validasi.push(dok);
      return { valid: true, errors: [], output: null };
    },
  });
  hasil.jejak = jejak;
  return hasil;
}

function bagianFaseB(pesan: string) {
  const i = pesan.indexOf('\n\nERROR yang harus diperbaiki:');
  assert(i > 0, 'permintaan jalur pertemuan harus berupa pesan Fase B + daftar galat');
  return JSON.parse(pesan.slice(0, i));
}

Deno.test('R1 — Fase B perbaikan menerima manifest Fase A yang asli, bukan kosong', async () => {
  const p = jalankan(GALAT_DURASI, { pertemuan: PERTEMUAN_MODEL });
  const r = await p;
  assertEquals(r.jalur, 'pertemuan');
  const b = bagianFaseB(p.jejak.panggil[0].pesan);
  assertEquals(b.manifest, MANIFEST);
  assertEquals(b.instrumen_tersedia, ['PBL-01', 'ASM-01', 'ASM-02']);
  // Galat yang dikirim sama persis dengan yang validator hasilkan.
  assert(p.jejak.panggil[0].pesan.includes(`ERROR yang harus diperbaiki: ${GALAT_DURASI.join('; ')}.`));
});

Deno.test('R2 — pertemuan perbaikan disuntik ref oleh backend sebelum B2 dan validasi', async () => {
  const p = jalankan(GALAT_DURASI, { pertemuan: PERTEMUAN_MODEL });
  await p;
  const diharapkan = M.injectSubLangkahRef(PERTEMUAN_MODEL);
  assertEquals(p.jejak.naskah[0].pw, diharapkan, 'B2 menerima pertemuan BER-ref');
  assertEquals(p.jejak.validasi[0].pertemuan, diharapkan, 'validasi menerima pertemuan BER-ref');
  const refs = p.jejak.validasi[0].pertemuan.flatMap((pt: any) =>
    pt.langkah.flatMap((l: any) => l.sub_langkah.map((s: any) => s.ref)));
  assertEquals(refs.length, 9);
  assert(refs.includes('P1.MEMAHAMI.1') && refs.includes('P3.MENGAPLIKASI.1'));
  // instrumen_ref dari model tidak disentuh.
  assertEquals(p.jejak.validasi[0].pertemuan[0].langkah[0].sub_langkah[0].instrumen_ref, 'PBL-01');
});

Deno.test('R3 — naskah lama tidak dipakai kembali setelah pertemuan berganti', async () => {
  const p = jalankan(GALAT_DURASI, { pertemuan: PERTEMUAN_MODEL });
  const r = await p;
  assertNotEquals(p.jejak.validasi[0].naskah_fasilitasi, NASKAH_BASI);
  assertNotEquals(r.mergedFixed.naskah_fasilitasi, NASKAH_BASI);
  assert(!JSON.stringify(r.mergedFixed).includes('NASKAH-BASI'));
  assert(!JSON.stringify(r.mergedFixed).includes('PERTEMUAN-LAMA'));
});

Deno.test('R4 — B2 disusun ulang tepat sekali dari pertemuan baru dan instrumen yang sama', async () => {
  const p = jalankan(GALAT_DURASI, { pertemuan: PERTEMUAN_MODEL });
  const r = await p;
  assertEquals(p.jejak.naskah.length, 1);
  assertEquals(p.jejak.naskah[0].ip, merged().instrumen_pembelajaran);
  assertEquals(p.jejak.naskah[0].ia, merged().instrumen_asesmen);
  assertEquals(r.mergedFixed.naskah_fasilitasi, NASKAH_BARU);
});

Deno.test('R5 — kedua jalur memakai anggaranTokenPerbaikan(), bukan anggaran satu fase', async () => {
  const a = jalankan(GALAT_DURASI, { pertemuan: PERTEMUAN_MODEL });
  await a;
  const b = jalankan(['kktp[0].tuntutan_ref kosong'], merged());
  await b;
  const otoritas = M.anggaranTokenPerbaikan(3);
  assertEquals(a.jejak.panggil[0].maxTokens, otoritas);
  assertEquals(b.jejak.panggil[0].maxTokens, otoritas);
  assertNotEquals(otoritas, M.anggaranToken(3), 'uji hanya bermakna bila kedua otoritas berbeda');
});

Deno.test('R6 — urutan model → naskah → validasi; jalur dokumen tidak mencampur naskah basi', async () => {
  const a = jalankan(GALAT_DURASI, { pertemuan: PERTEMUAN_MODEL });
  await a;
  assertEquals(a.jejak.urutan, ['model', 'naskah', 'validasi']);

  // Jalur dokumen: model menyusun ulang SELURUH dokumen (termasuk naskahnya),
  // jadi yang divalidasi adalah keluaran model apa adanya — bukan campuran.
  const baru = { ...merged(), pertemuan: PERTEMUAN_MODEL, naskah_fasilitasi: NASKAH_BARU };
  const b = jalankan(['kktp[0].tuntutan_ref kosong'], baru);
  const rb = await b;
  assertEquals(rb.jalur, 'dokumen');
  assertEquals(b.jejak.urutan, ['model', 'validasi']);
  assertEquals(b.jejak.validasi[0], baru);
});

const SERVER = {
  tp_anchor:      { penanda: 'ANCHOR-SERVER' },
  atp_context:    { penanda: 'KONTEKS-SERVER' },
  alokasi_server: { pertemuan: [4, 4, 4] },
};

// deno-lint-ignore no-explicit-any
function jalankanDokumen(balasanModel: unknown): Promise<any> & { jejak: any } {
  // deno-lint-ignore no-explicit-any
  const jejak: any = { panggil: [], validasi: [] };
  // deno-lint-ignore no-explicit-any
  const hasil: any = M.perbaikiModulSetelahValidasi({
    merged: { ...merged(), keputusan_kontekstual: [{ id: 'KTX-01' }], ...SERVER },
    errors: ['kktp[2].ambang_batas tidak mengandung angka/level/kondisi terverifikasi'],
    faseAOutput: {}, manifest: MANIFEST,
    jumlahPertemuan: 3, jpPerPertemuan: 4, durasiJp: 45, jumlahMurid: 30,
    cd: {}, arahanTitikAwal: null, warisan: WARISAN,
    panggilAI: (pesan: string, maxTokens: number) => {
      jejak.panggil.push({ pesan, maxTokens });
      return Promise.resolve(JSON.stringify(balasanModel));
    },
    susunNaskah: () => { throw new Error('jalur dokumen tidak boleh menyusun naskah terpisah'); },
    validasi: (dok: unknown) => { jejak.validasi.push(dok); return { valid: true, errors: [], output: null }; },
  });
  hasil.jejak = jejak;
  return hasil;
}

Deno.test('R8 — jalur dokumen: bagian milik server dipasang kembali oleh backend, bukan dari model', async () => {
  // Model mengembalikan dokumen TANPA bagian server — persis Skenario 3 M9 —
  // dan satu yang mencoba mengarang tp_anchor sendiri.
  const dariModel = {
    ...merged(), keputusan_kontekstual: [{ id: 'KTX-01' }],
    kktp: [{ id_kktp: 'K3', ambang_batas: 'Skor minimal 3 dari 4 pada rubrik' }],
    tp_anchor: { penanda: 'KARANGAN-MODEL' },
  };
  const p = jalankanDokumen(dariModel);
  const r = await p;
  assertEquals(r.jalur, 'dokumen');
  const dok = p.jejak.validasi[0];
  assertEquals(dok.tp_anchor, SERVER.tp_anchor, 'tp_anchor harus dari dokumen asal, bukan karangan model');
  assertEquals(dok.atp_context, SERVER.atp_context);
  assertEquals(dok.alokasi_server, SERVER.alokasi_server);
  // Isi milik model tetap milik model.
  assertEquals(dok.kktp, dariModel.kktp);
});

Deno.test('R9 — jalur dokumen: perintah perbaikan menyebut setiap field akar milik model yang ada di dokumen', async () => {
  const p = jalankanDokumen(merged());
  await p;
  const pesan: string = p.jejak.panggil[0].pesan;
  const i = pesan.indexOf('Field akar dokumen ini yang WAJIB tetap ada:');
  assert(i > 0, 'daftar field akar dokumen tidak dikirim ke model');
  const daftar = pesan.slice(i);
  // keputusan_kontekstual — yang rootWajib() tidak sebut — kini disebut.
  assert(daftar.includes('keputusan_kontekstual'), 'keputusan_kontekstual tidak dilindungi');
  // Bagian server tetap TIDAK pernah diminta dari model (M3-AD).
  for (const k of Object.keys(SERVER)) assert(!daftar.includes(k), `${k} diminta dari model`);
});

Deno.test('R7 — Edge Function memanggil lifecycle yang sama, tanpa manifest kosong di perbaikan', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  const handler = src.slice(src.indexOf('// ── EDGE FUNCTION ─'));
  assert(handler.includes('await perbaikiModulSetelahValidasi({'), 'handler tidak memanggil lifecycle perbaikan');
  assert(handler.includes('manifest: manifestFaseD'), 'perbaikan harus menerima manifest Fase A');
  // Argumen kelima (batas waktu dari kebijakan terpusat) diperiksa T-W4 di
  // modul-m9-koreksi.test.ts; di sini yang dikunci: B2 lewat susunNaskah yang sama.
  assert(handler.includes('susunNaskah(faseAOutput, pw, ip, ia,'), 'B2 perbaikan harus lewat susunNaskah yang sama');
  assert(!/manifest:\s*\{\s*pembelajaran_manifest:\s*\[\]\s*,\s*asesmen_manifest:\s*\[\]\s*\}/.test(src),
    'manifest kosong tidak boleh lagi dikirim ke Fase B perbaikan');
});
