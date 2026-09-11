// M9 — TIGA KOREKSI TERAKHIR: V15, KOHERENSI BUKTI–RESOURCE, WAKTU KELAS BESAR.
//
// V15-*  penelusuran kutipan naskah: bingkai Indonesia tidak lagi ikut dicari
//        di instrumen, tetapi kutipan karangan tetap ditolak
// T*     angka waktu konkret dihitung backend dengan otoritas yang SAMA dengan
//        validator, dan sampai ke Fase A, Fase B, dan perbaikan Fase B
// RC-*   bahan yang tugas butuhkan harus ada; lembar yang murid kerjakan tidak
//        boleh bertanda milik guru; penyebut ambang lahir dari tugas buktinya
// FIS    benda fisik yang tidak dikonfirmasi hanya pilihan tambahan
//
// TIDAK ADA panggilan model di berkas ini. Mutu semantik keluaran model diuji
// lewat generate live M9, bukan dengan pencocokan kata di sini.

import { assert, assertEquals } from 'jsr:@std/assert@1';

const EF_MODUL = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);
const FIXTURES = new URL('./fixtures/modul/', import.meta.url);

// deno-lint-ignore no-explicit-any
async function muat(): Promise<any> {
  const penuh = await Deno.readTextFile(EF_MODUL);
  const batas = penuh.indexOf('// ── EDGE FUNCTION ─');
  assert(batas > 0, 'penanda EDGE FUNCTION tidak ada di index.ts');
  const tmp = new URL(`._modul-m9k-${crypto.randomUUID()}.ts`, new URL('.', EF_MODUL));
  try {
    await Deno.writeTextFile(tmp, penuh.slice(0, batas) + '\nexport { ' + [
      'validateModulOutputV400', 'ambilKutipanInggris', 'klaimInggris', 'normalKutip',
      'batasWaktuKelas', 'MENIT_OBSERVASI_PER_MURID', 'JENIS_WAJIB_UNTUK_MURID',
      'buildUserMessageFaseB', 'buildUserMessageFaseC', 'perbaikiModulSetelahValidasi',
      'SYSTEM_PROMPT', 'sebutanPerangkatDigital', 'batasWaktuPerbaikan', 'BATAS_PERMINTAAN_MS',
      'anggaranTokenPerbaikan', 'anggaranTokenNaskah',
    ].join(', ') + ' };\n');
    return await import(tmp.href);
  } finally {
    await Deno.remove(tmp).catch(() => {});
  }
}
const M = await muat();
const SRC = await Deno.readTextFile(EF_MODUL);

// deno-lint-ignore no-explicit-any
type Fixture = { _harapan: any; konten: any };
const fixture = async (nama: string): Promise<Fixture> =>
  JSON.parse(await Deno.readTextFile(new URL(`${nama}.json`, FIXTURES)));

// Mode historis — persis tests/validator-modul.ts.
// deno-lint-ignore no-explicit-any
const validasiHistoris = (f: Fixture, k: any = f.konten) => M.validateModulOutputV400(
  k, f._harapan.nomor_tp, f._harapan.jumlah_pertemuan, f._harapan.jp_per_pertemuan,
  f._harapan.durasi_jp, f._harapan.jumlah_murid, undefined, f._harapan.perangkat_digital_ok);
// Mode kontrak sekarang — jalur penyusunan.
// deno-lint-ignore no-explicit-any
const validasiSekarang = (f: Fixture, k: any) => M.validateModulOutputV400(
  k, f._harapan.nomor_tp, f._harapan.jumlah_pertemuan, f._harapan.jp_per_pertemuan,
  f._harapan.durasi_jp, f._harapan.jumlah_murid, undefined, f._harapan.perangkat_digital_ok,
  true, true, true, true, true);

const galatV15 = (errors: string[]) =>
  errors.filter(e => e.startsWith('naskah_fasilitasi menyuruh guru menunjukkan kalimat'));

// Menyisipkan satu ucapan guru ke sub_langkah naskah pertama.
function sisipkanUcapan(k: unknown, ucapan: string) {
  const c = structuredClone(k) as Record<string, any>;
  const sl = c.naskah_fasilitasi[0].langkah[0].sub_langkah[0];
  sl.ucapan_guru = [...(Array.isArray(sl.ucapan_guru) ? sl.ucapan_guru : []), ucapan];
  return c;
}

// ══ V15 ═════════════════════════════════════════════════════════════════════

Deno.test('V15-D — positif sejati historis tp05 TETAP ditolak, tepat satu', async () => {
  const f = await fixture('tp05');
  const v = galatV15(validasiHistoris(f).errors);
  assertEquals(v.length, 1, v.join(' | '));
  assert(v[0].includes('How to Sew a Straight Seam'), v[0]);
});

Deno.test('V15-A — bingkai Indonesia + kutipan Inggris yang ADA di instrumen → lolos', async () => {
  const f = await fixture('tp05');
  const k = sisipkanUcapan(f.konten,
    "Katakan: 'Perhatikan lembar PBL-01. Langkah pertamanya adalah fold the top edge of the pocket fabric.'");
  assertEquals(galatV15(validasiHistoris(f, k).errors).length, 1, 'hanya positif sejati tp05 yang tersisa');
});

Deno.test('V15-B — kutipan Inggris murni yang ADA di instrumen → lolos', async () => {
  const f = await fixture('tp05');
  const k = sisipkanUcapan(f.konten, "Katakan: 'Baca PBL-01: First, fold the top edge of the pocket fabric.'");
  assertEquals(galatV15(validasiHistoris(f, k).errors).length, 1);
});

Deno.test('V15-C — kutipan Inggris yang TIDAK ada di instrumen → ditolak', async () => {
  const f = await fixture('tp05');
  const k = sisipkanUcapan(f.konten,
    "Katakan: 'Lihat PBL-01: Always wash the silk scarf with cold water first.'");
  const v = galatV15(validasiHistoris(f, k).errors);
  assertEquals(v.length, 2, v.join(' | '));
  assert(v.some(e => e.includes('silk scarf')));
});

Deno.test('V15-E — bingkai Indonesia + kutipan KARANGAN → tetap ditolak (tidak terlalu longgar)', async () => {
  const f = await fixture('tp05');
  const k = sisipkanUcapan(f.konten,
    "Katakan: 'Perhatikan PBL-01. Judulnya adalah How to Fold a Silk Scarf Quickly.'");
  const v = galatV15(validasiHistoris(f, k).errors);
  assertEquals(v.length, 2, v.join(' | '));
  assert(v.some(e => e.includes('How to Fold a Silk Scarf')));
});

Deno.test('V15-F — keenam bentuk positif palsu nyata dari generate M9 kini tidak ditandai', () => {
  // Baris diambil VERBATIM dari tests/artifacts/m9, beserta potongan instrumen aslinya.
  const kasus: Array<[string, string]> = [
    ["Katakan: 'Perhatikan lembar PBL-01. Judul teksnya adalah How to Iron a Cotton Shirt. Dari judul ini, kita langsung tahu apa tujuan teks ini dibuat.'",
     'How to Iron a Cotton Shirt\n\nIroning a cotton shirt makes it neat and ready to wear for work or school.'],
    ["Katakan: 'Coba lihat instruksi nomor dua: place the paper pattern pieces on top of the fabric following the fabric grainline.'",
     '2. Second, place the paper pattern pieces on top of the fabric following the fabric grainline.'],
    ["Katakan: 'Pegang lembar PBL-02 kalian. Lihat judulnya: How to Cut Fabric Using a Paper Pattern.'",
     'How to Cut Fabric Using a Paper Pattern\n\nIn a fashion workshop, cutting fabric accurately is an important first step.'],
    ["Katakan: 'Lihat lembar teks PBL-02 berjudul How to Cut Fabric Using a Paper Pattern.'",
     'How to Cut Fabric Using a Paper Pattern\n\nIn a fashion workshop, cutting fabric accurately is an important first step.'],
    ["Katakan: 'Perhatikan judulnya: How to Hem Trousers Using a Sewing Machine.'",
     'How to Hem Trousers Using a Sewing Machine\n\nHemming trousers is an essential finishing technique.'],
    // Kalimat Indonesia yang kebetulan menyebut "how to" — tidak mengklaim kutipan.
    ["Katakan: 'Perhatikan judul teks pada PBL-01. Judul pada teks prosedur selalu memberi tahu kita tujuan utama dari apa yang akan dikerjakan. Kata how to langsung menunjukkan apa hasil akhir yang ingin dicapai.'",
     'How to Thread a Sewing Machine'],
  ];
  for (const [baris, teks] of kasus) {
    const isi = M.normalKutip(JSON.stringify({ isi_teks: teks }));
    for (const kutipan of M.ambilKutipanInggris(baris))
      for (const klaim of M.klaimInggris(kutipan))
        assert(isi.includes(M.normalKutip(klaim)), `positif palsu masih ada: "${klaim}" ← ${baris}`);
  }
});

// ══ WAKTU ═══════════════════════════════════════════════════════════════════

Deno.test('T1 — batasWaktuKelas memakai otoritas yang sama dengan validator', () => {
  const b = M.batasWaktuKelas(32);
  assertEquals(b.individual_semua_minimal_menit, 32 * M.MENIT_OBSERVASI_PER_MURID);
  assertEquals(b.individual_semua_minimal_menit, 64);
  assertEquals(M.batasWaktuKelas(null), null);
  assert(SRC.includes('const mntPerMurid = MENIT_OBSERVASI_PER_MURID;'),
    'validator V4 harus memakai konstanta yang sama, bukan angka sendiri');
});

Deno.test('T2 — angka individual+semua yang dikirim = angka yang validator tegakkan', async () => {
  const f = await fixture('tp02');
  const batas = M.batasWaktuKelas(f._harapan.jumlah_murid).individual_semua_minimal_menit;
  const pasang = (durasi: number) => {
    const k = structuredClone(f.konten);
    Object.assign(k.pertemuan[0].langkah[0].sub_langkah[0],
      { mode_pelaksanaan: 'individual', mode_observasi: 'semua', durasi_menit: durasi });
    return validasiHistoris(f, k).errors.filter((e: string) => e.includes('individual+semua'));
  };
  const kurang = pasang(batas - 1);
  assertEquals(kurang.length, 1);
  assert(kurang[0].includes(`≥${batas} menit`), kurang[0]);
  assertEquals(pasang(batas).length, 0, 'tepat di batas harus lolos');
});

Deno.test('T3 — tabel bergantian yang dikirim = angka yang validator tegakkan', async () => {
  const f = await fixture('tp02');
  const tabel = M.batasWaktuKelas(f._harapan.jumlah_murid).bergantian_minimal_menit_per_ukuran_kelompok;
  const pasang = (durasi: number) => {
    const k = structuredClone(f.konten);
    Object.assign(k.pertemuan[0].langkah[0].sub_langkah[0],
      { mode_pelaksanaan: 'bergantian', ukuran_kelompok: 2, mode_observasi: 'semua', durasi_menit: durasi });
    return validasiHistoris(f, k).errors.filter((e: string) =>
      e.startsWith('pertemuan 1.') && e.includes('bergantian memberi hanya'));
  };
  const kurang = pasang(tabel['2'].latihan - 1);
  assertEquals(kurang.length, 1);
  assert(kurang[0].includes(`durasi harus ≥${tabel['2'].latihan} menit`), kurang[0]);
  assertEquals(pasang(tabel['2'].latihan).length, 0);
});

const WARISAN = {
  tpAnchor: {
    atp_induk_id: 'uji', nomor_tp: 1, tp_judul: 'TP uji', tuntutan: ['BIE-E25-MM-1'],
    kategori_teks: ['nonfiksi'], semester: 1, jp_alokasi: 12, jp_pertemuan: [4, 4, 4],
    versi_cp: '046/H/KR/2025',
  },
  tuntutan: [{ id: 'BIE-E25-MM-1', kompetensi: 'memahami alur informasi', lingkup_materi: 'teks prosedur' }],
  kategoriWajib: ['nonfiksi'],
  alokasi: { pertemuan: [4, 4, 4] },
  atpContext: {
    versi_cp: '046/H/KR/2025', semester: 1,
    kesiapan_murid:   { nilai: 'sesuai', asal: 'keputusan_guru', arti: 'sudah siap' },
    jumlah_murid:     { nilai: 32, asal: 'fakta' },
    program_keahlian: { nilai: 'Tata Busana', asal: 'fakta' },
    konteks_tugas:    { nilai: 'seimbang', asal: 'keputusan_guru', arti: 'seimbang' },
    prioritas_guru: [], penerapan_prioritas: { untuk_tp_ini: [], seluruh_atp: [] },
  },
};
const MANIFEST = {
  pembelajaran_manifest: [{ id: 'PBL-01', jenis: 'teks_autentik', untuk_murid: true }],
  asesmen_manifest: [{ id: 'ASM-01', jenis: 'soal_latihan', untuk_murid: true }],
};
const pesanFaseB = () => JSON.parse(M.buildUserMessageFaseB({
  faseAOutput: {}, manifest: MANIFEST, jumlahPertemuan: 3, jpPerPertemuan: 4, durasiJp: 45,
  jumlahMurid: 32, cd: {}, arahanTitikAwal: null, warisan: WARISAN,
}));

Deno.test('T4 — Fase B dan perbaikan Fase B menerima batas yang SAMA', async () => {
  const b = pesanFaseB();
  assertEquals(b.batas_waktu_kelas_ini, M.batasWaktuKelas(32));
  let permintaan = '';
  await M.perbaikiModulSetelahValidasi({
    merged: { instrumen_pembelajaran: [], instrumen_asesmen: [] },
    errors: ['pertemuan 3.MENGAPLIKASI.sub_langkah[0]: individual+semua membutuhkan ≥64 menit (32 murid × 2 mnt) tapi durasi=60. Ganti pendekatan.'],
    faseAOutput: {}, manifest: MANIFEST, jumlahPertemuan: 3, jpPerPertemuan: 4, durasiJp: 45,
    jumlahMurid: 32, cd: {}, arahanTitikAwal: null, warisan: WARISAN,
    panggilAI: (p: string) => { permintaan = p; return Promise.resolve('{"pertemuan":[]}'); },
    susunNaskah: () => Promise.resolve([]),
    validasi: () => ({ valid: true, errors: [], output: null }),
  });
  const bagianB = JSON.parse(permintaan.slice(0, permintaan.indexOf('\n\nERROR yang harus diperbaiki:')));
  assertEquals(bagianB.batas_waktu_kelas_ini, M.batasWaktuKelas(32));
});

Deno.test('T5 — Fase A juga menerima batas waktu kelas (ia yang menentukan durasi sumatif)', () => {
  const a = SRC.slice(SRC.indexOf('function buildUserMessageFaseA('), SRC.indexOf('function buildUserMessageFaseB('));
  assert(a.includes('batas_waktu_kelas: batasWaktuKelas(params.jumlahMurid)'));
});

// ══ KOHERENSI BUKTI–RESOURCE ════════════════════════════════════════════════

Deno.test('RC-1/RC-2 — rujukan bukti ke instrumen yang tidak ada tetap ditolak (otoritas M4, dipakai ulang)', async () => {
  const f = await fixture('tp02');
  const k = structuredClone(f.konten);
  k.kktp[0].instrumen_bukti = ['ASM-99'];
  const e = validasiSekarang(f, k).errors;
  assert(e.some((x: string) => x.includes("instrumen_bukti='ASM-99'") && x.includes('tidak ada di')), e.join(' | '));
});

Deno.test('RC-3 — lembar yang murid kerjakan tidak boleh bertanda milik guru (dokumen baru saja)', async () => {
  assert(M.JENIS_WAJIB_UNTUK_MURID.includes('soal_latihan'), 'diturunkan dari RESOURCE_WAJIB');
  const f = await fixture('tp02');
  const k = structuredClone(f.konten);
  k.instrumen_asesmen.push({
    id: 'ASM-77', judul: 'Soal cek fakta', jenis: 'soal_latihan', untuk_murid: false,
    digunakan_pada: [], konten_murid: null,
    panduan_guru: { kunci_jawaban: ['1. a'], panduan_penskoran: 'satu poin per butir' },
  });
  const cocok = (e: string) => e.includes('ASM-77') && e.includes('lembar yang murid kerjakan');
  assert(validasiSekarang(f, k).errors.some(cocok), 'dokumen baru harus ditolak');
  assert(!validasiHistoris(f, k).errors.some(cocok), 'dokumen lama tidak dihakimi surut');
});

Deno.test('RC-4 — bahan tugas (termasuk sumatif) wajib entri manifest; Fase B wajib merujuknya', () => {
  const a = SRC.slice(SRC.indexOf('function buildUserMessageFaseA('), SRC.indexOf('function buildUserMessageFaseB('));
  assert(a.includes('WAJIB menjadi') && a.includes('entri manifest'), 'aturan bahan-di-manifest hilang');
  assert(a.includes('Jangan merancang "teks baru" yang tidak ada di manifest'));
  assert(a.includes('JENIS_WAJIB_UNTUK_MURID.join'), 'daftar jenis harus dari kontrak');
  assert(pesanFaseB().instruksi_instrumen_ref.includes('instrumen_ref WAJIB menunjuk instrumen yang memuat bahannya'));
});

Deno.test('RC-5 — penyebut ambang = jumlah butir tugas bukti (Fase A dan Fase C)', () => {
  const a = SRC.slice(SRC.indexOf('function buildUserMessageFaseA('), SRC.indexOf('function buildUserMessageFaseB('));
  assert(a.includes('PENYEBUT ambang'));
  assert(a.includes('ambang_batas dan keputusan_ketercapaian WAJIB menyatakan batas yang SAMA'));
  const c = JSON.parse(M.buildUserMessageFaseC({ faseAOutput: {}, manifest: MANIFEST, cd: {}, warisan: WARISAN }));
  assert(c.output_instruction.includes('WAJIB sama dengan penyebut ambang_batas KKTP itu'));
});

Deno.test('RC-6 — KKTP yang menghitung butir murid wajib menyebut instrumen yang memuat butirnya (termasuk sumatif)', () => {
  const a = SRC.slice(SRC.indexOf('function buildUserMessageFaseA('), SRC.indexOf('function buildUserMessageFaseB('));
  assert(a.includes('instrumen_bukti WAJIB memuat instrumen untuk_murid=true'));
  assert(a.includes('Matriks observasi hanya mencatat hasil; ia tidak memuat butirnya.'));
  assert(a.includes('matriks observasi penilaian') && a.includes('tidak menggantikannya'));
  const c = JSON.parse(M.buildUserMessageFaseC({ faseAOutput: {}, manifest: MANIFEST, cd: {}, warisan: WARISAN }));
  assert(c.output_instruction.includes('Lembar butir untuk sumatif memuat pertanyaan tentang teks SUMATIF itu sendiri'));
});

// ── RC-7: kasus setara S2 final ────────────────────────────────────────────
//
// Struktur yang ada TIDAK memuat klaim "murid mengerjakan butir yang dihitung":
// keputusan_ketercapaian jenis 'jumlah' menghitung soal terjawab (S2) tetapi juga
// ujaran yang diamati (S3) dan kalimat di tulisan murid sendiri (S4). Calon
// invarian "KKTP penghitung → sumatif wajib punya instrumen untuk_murid" diukur
// pada bukti kanonik dan MENOLAK S3 dan S4 yang sah — tidak dipasang.
//
// Yang dapat dikunci secara struktural adalah setiap VARIAN S2 yang punya
// jejak di struktur: rujukan sumatif ke teks PBL, lembar yang bertanda milik
// guru, lembar tanpa butir murid, dan lembar yang tidak ada. Keempatnya
// ditegakkan otoritas yang sudah ada (M4 instrumenAsing, M5, muridWajib).

// deno-lint-ignore no-explicit-any
function denganLembarSumatif(k: any, lembar: Record<string, unknown> | null, ref: string[]) {
  const c = structuredClone(k);
  if (lembar) c.instrumen_asesmen.push(lembar);
  c.rencana_asesmen.asesmen_sumatif = {
    ...(c.rencana_asesmen.asesmen_sumatif ?? {}),
    deskripsi: 'membaca teks prosedur dan menjawab soal', teknik: 'unjuk kerja',
    instrumen_ref: ref, durasi_menit: 60, referensi_kktp: ['K1'], cakupan_bukti: 'per_murid',
    placement: { pertemuan: 3, fase: 'MENGAPLIKASI' },
  };
  return c;
}
const LEMBAR_SAH = {
  id: 'ASM-78', judul: 'Lembar soal sumatif', jenis: 'soal_latihan', untuk_murid: true,
  digunakan_pada: ['P3.MENGAPLIKASI'],
  konten_murid: { petunjuk: 'Jawablah berdasarkan teks.', soal: [
    { nomor: 1, pertanyaan: 'What is the main idea of the text?', tipe: 'isian singkat' }] },
  panduan_guru: { kunci_jawaban: ['1. ...'], panduan_penskoran: 'satu poin per butir' },
};
const galatUntuk = (e: string[], id: string) => e.filter(x => x.includes(id));

Deno.test('RC-7a — sumatif merujuk teks bacaan PBL, bukan lembar soal → ditolak', async () => {
  const f = await fixture('tp02');
  const e = validasiSekarang(f, denganLembarSumatif(f.konten, null, ['PBL-01'])).errors;
  assert(e.some((x: string) => x.includes("asesmen_sumatif.instrumen_ref='PBL-01'") && x.includes('tidak ada di')),
    e.filter((x: string) => x.includes('sumatif')).join(' | '));
});

Deno.test('RC-7b — lembar soal sumatif bertanda milik guru → ditolak', async () => {
  const f = await fixture('tp02');
  const k = denganLembarSumatif(f.konten,
    { ...LEMBAR_SAH, untuk_murid: false, konten_murid: null }, ['ASM-78']);
  assert(galatUntuk(validasiSekarang(f, k).errors, 'ASM-78').some(x => x.includes('lembar yang murid kerjakan')));
});

Deno.test('RC-7c — lembar soal sumatif tanpa butir murid → ditolak', async () => {
  const f = await fixture('tp02');
  const k = denganLembarSumatif(f.konten,
    { ...LEMBAR_SAH, konten_murid: { petunjuk: 'Jawablah.', soal: [] } }, ['ASM-78']);
  assert(galatUntuk(validasiSekarang(f, k).errors, 'ASM-78').some(x => x.includes('soal')),
    galatUntuk(validasiSekarang(f, k).errors, 'ASM-78').join(' | '));
});

Deno.test('RC-7d — sumatif merujuk lembar soal yang tidak ada → ditolak', async () => {
  const f = await fixture('tp02');
  const e = validasiSekarang(f, denganLembarSumatif(f.konten, null, ['ASM-78'])).errors;
  assert(e.some((x: string) => x.includes("asesmen_sumatif.instrumen_ref='ASM-78'") && x.includes('tidak ada di')));
});

Deno.test('RC-7e — pasangan positif: lembar soal sumatif nyata, untuk murid, berbutir → tidak ada galat untuknya', async () => {
  const f = await fixture('tp02');
  const e = validasiSekarang(f, denganLembarSumatif(f.konten, LEMBAR_SAH, ['ASM-78'])).errors;
  assertEquals(galatUntuk(e, 'ASM-78'), [], galatUntuk(e, 'ASM-78').join(' | '));
});

Deno.test('RC-7f — perintah Fase A dan SYSTEM_PROMPT menutup jalan keluar S2', () => {
  const a = SRC.slice(SRC.indexOf('function buildUserMessageFaseA('), SRC.indexOf('function buildUserMessageFaseB('));
  assert(a.includes('Teks bacaan (PBL-xx) BUKAN instrumen asesmen'));
  assert(a.includes('WAJIB disebut di asesmen_sumatif.instrumen_ref serta di'));
  assert(M.SYSTEM_PROMPT.includes('TAMBAHKAN\n                                     soal_latihan untuk_murid=true'));
});

// ══ V13 — PENYANGKALAN PERANGKAT ════════════════════════════════════════════
//
// Diuji lewat VALIDATOR ASLI pada tp02 (perangkat_digital_ok=false, 0 temuan):
// satu ucapan disisipkan ke naskah, lalu galat V13 dihitung.

const galatV13 = (e: string[]) => e.filter(x => x.startsWith('guru menyatakan kelas tanpa perangkat digital'));
async function v13Untuk(ucapan: string) {
  const f = await fixture('tp02');
  return galatV13(validasiHistoris(f, sisipkanUcapan(f.konten, ucapan)).errors);
}

Deno.test('V13-0 — tp02 tanpa sisipan: nol galat V13 (garis dasar)', async () => {
  const f = await fixture('tp02');
  assertEquals(galatV13(validasiHistoris(f).errors), []);
});

Deno.test('V13-A — "Buka kamus di ponsel." → ditolak', async () => {
  const e = await v13Untuk('Katakan: Buka kamus di ponsel.');
  assertEquals(e.length, 1);
  assert(e[0].includes('ponsel'));
});

Deno.test('V13-B — "Gunakan HP untuk mencari…" → ditolak', async () => {
  const e = await v13Untuk('Katakan: Gunakan HP untuk mencari arti kata sulit.');
  assertEquals(e.length, 1);
  assert(e[0].includes('hp'));
});

Deno.test('V13-C — "Tanpa membuka kamus ponsel." → lolos (kalimat S2 attempt 8 verbatim)', async () => {
  assertEquals(await v13Untuk('Katakan: Kerjakan secara mandiri di lembar masing-masing tanpa membuka kamus ponsel atau bertanya kepada teman.'), []);
  assertEquals(await v13Untuk('Katakan: Tanpa membuka kamus ponsel.'), []);
});

Deno.test('V13-D — "Jangan gunakan HP." → lolos', async () => {
  assertEquals(await v13Untuk('Katakan: Jangan gunakan HP.'), []);
});

Deno.test('V13-E — penyangkal di dekatnya tidak meloloskan tuntutan perangkat yang berdiri sendiri', async () => {
  // Klausa lain.
  assertEquals((await v13Untuk('Katakan: Jangan bertanya kepada teman. Gunakan ponsel untuk mencari artinya.')).length, 1);
  // Klausa yang sama, tetapi penyangkalnya jauh dan milik kata kerja lain.
  assertEquals((await v13Untuk('Katakan: Jangan bertanya kepada teman lalu gunakan ponsel untuk mencari artinya.')).length, 1);
  // Penyangkal SESUDAH istilah tidak menyangkalnya.
  assertEquals((await v13Untuk('Katakan: Buka ponsel, jangan buka buku.')).length, 1);
});

Deno.test('V13-F — istilah lama tetap tertangkap (tidak ada positif sejati yang hilang)', () => {
  for (const t of ['memotret', 'kamera', 'proyektor', 'laptop', 'internet', 'youtube', 'wi-fi', 'mengunduh'])
    assertEquals(M.sebutanPerangkatDigital(`Minta murid ${t} hasil kerjanya.`), [t], t);
});

// ══ BATAS WAKTU PERBAIKAN ═══════════════════════════════════════════════════

Deno.test('T-W1 — perbaikan dokumen utuh mendapat batas lebih besar dari 50 detik', () => {
  const b = M.batasWaktuPerbaikan(M.anggaranTokenPerbaikan(3), M.BATAS_PERMINTAAN_MS);
  assert(b > 50_000, `batas ${b} ms tidak melampaui 50 detik lama`);
  assertEquals(b, 100_000);
});

Deno.test('T-W2 — panggilan kecil tidak otomatis mendapat batas maksimum', () => {
  assertEquals(M.batasWaktuPerbaikan(4_000, M.BATAS_PERMINTAAN_MS), 50_000);
  assert(M.batasWaktuPerbaikan(4_000, M.BATAS_PERMINTAAN_MS) < M.batasWaktuPerbaikan(32_000, M.BATAS_PERMINTAAN_MS));
});

Deno.test('T-W3 — tidak ada panggilan tak berbatas; sisa permintaan selalu dihormati', () => {
  assert(M.BATAS_PERMINTAAN_MS < 150_000, 'harus di bawah request idle timeout Supabase (150 detik)');
  assertEquals(M.batasWaktuPerbaikan(1_000_000, M.BATAS_PERMINTAAN_MS), M.BATAS_PERMINTAAN_MS);
  assertEquals(M.batasWaktuPerbaikan(32_000, 30_000), 30_000);
  assertEquals(M.batasWaktuPerbaikan(32_000, -5_000), 1_000);
  for (const t of [0, 4_000, 32_000, 60_000, Number.MAX_SAFE_INTEGER])
    assert(Number.isFinite(M.batasWaktuPerbaikan(t, M.BATAS_PERMINTAAN_MS)));
});

Deno.test('T-W4 — lifecycle perbaikan EF memakai kebijakan terpusat untuk KEDUA panggilannya', () => {
  const h = SRC.slice(SRC.indexOf('await perbaikiModulSetelahValidasi({'));
  const blok = h.slice(0, h.indexOf('validasi: (mergedFixed)'));
  assertEquals((blok.match(/batasWaktuPerbaikan\(/g) ?? []).length, 2, 'perbaikan dan B2 perbaikan');
  assert(blok.includes('BATAS_PERMINTAAN_MS - (Date.now() - startTime)'), 'batas dihitung terhadap sisa permintaan');
  assert(!/callAI\([^)]*50_000/.test(SRC), 'angka mati 50_000 tidak boleh kembali di jalur perbaikan');
});

Deno.test('T-W5 — panggilan fase biasa tetap berbatas', () => {
  // Fase A/B/C/D memanggil callPhase dengan angka langsung; B2 lewat bawaan
  // parameter susunNaskah (dipakai jalur normal B2 dan jalur mundur Fase D).
  const batas = [...SRC.matchAll(/(\d+)_000,\s*anggaranToken/g)].map(m => Number(m[1]) * 1000);
  assertEquals(batas.length, 4, `fase A/B/C/D ditemukan ${batas.length}`);
  const b2 = /timeoutMs = (\d+)_000,/.exec(SRC.slice(SRC.indexOf('async function susunNaskah(')));
  assert(b2, 'bawaan batas waktu susunNaskah hilang');
  batas.push(Number(b2![1]) * 1000);
  for (const b of batas) assert(b > 0 && b <= 120_000, `batas fase ${b} ms`);
});

// ══ PERBAIKAN DURASI TERARAH (S3 attempt 7) ═════════════════════════════════
//
// Kasus nyata: P3 = 15+10+15+115+15+15 = 185, target 180. Perbaikan lama tidak
// pernah melihat pertemuan yang salah.

const langkahP = (menit: number[]) => ['PEMBUKA', 'ASESMEN_AWAL', 'MEMAHAMI', 'MENGAPLIKASI', 'MEREFLEKSI', 'PENUTUP']
  .map((nama, i) => ({ nama, durasi_menit: menit[i], sub_langkah: [{ nomor: 1, durasi_menit: menit[i] }] }));
const PERTEMUAN_S3 = [
  { nomor: 1, langkah: langkahP([15, 15, 45, 80, 15, 10]) },   // 180
  { nomor: 2, langkah: langkahP([15, 10, 25, 105, 15, 10]) },  // 180
  { nomor: 3, langkah: langkahP([15, 10, 15, 115, 15, 15]) },  // 185
];
const GALAT_S3 = ['pertemuan 3: Σlangkah.durasi_menit=185, diharapkan 180 (4 JP × 45 menit)'];

async function mintaPerbaikanDurasi(pertemuan: unknown[], errors: string[]) {
  let permintaan = '';
  await M.perbaikiModulSetelahValidasi({
    merged: { pertemuan, instrumen_pembelajaran: [], instrumen_asesmen: [] },
    errors, faseAOutput: {}, manifest: MANIFEST, jumlahPertemuan: 3, jpPerPertemuan: 4, durasiJp: 45,
    jumlahMurid: 30, cd: {}, arahanTitikAwal: null, warisan: WARISAN,
    panggilAI: (p: string) => { permintaan = p; return Promise.resolve('{"pertemuan":[]}'); },
    susunNaskah: () => Promise.resolve([]),
    validasi: () => ({ valid: true, errors: [], output: null }),
  });
  return permintaan;
}
const panduanDari = (permintaan: string) => {
  const m = /PANDUAN_PERBAIKAN_WAKTU: (\{.*?\})\. /s.exec(permintaan);
  assert(m, 'PANDUAN_PERBAIKAN_WAKTU tidak ada di permintaan perbaikan');
  return JSON.parse(m![1]);
};

Deno.test('TR-1 — 185 → 180 menghasilkan panduan pertemuan 3, selisih −5, dari backend', async () => {
  const r = await mintaPerbaikanDurasi(PERTEMUAN_S3, GALAT_S3);
  const pd = panduanDari(r);
  assertEquals(pd.pertemuan_bermasalah, [{ nomor: 3, total_sekarang: 185, total_wajib: 180, selisih: -5 }]);
  assert(r.includes('Pertemuan 3: total sekarang 185 menit, wajib 180 menit — kurangi tepat 5 menit di pertemuan 3 saja'));
  // Pertemuan yang sedang diperbaiki kini dikirim.
  assert(r.includes('PERTEMUAN_SEKARANG (hasil yang sedang diperbaiki): '));
});

Deno.test('TR-2 — pertemuan tanpa galat total wajib dikembalikan persis', async () => {
  const r = await mintaPerbaikanDurasi(PERTEMUAN_S3, GALAT_S3);
  assertEquals(panduanDari(r).pertemuan_tanpa_galat_total, [1, 2]);
  assert(r.includes('Pertemuan 1, 2 tidak punya galat total waktu: kembalikan PERSIS seperti di PERTEMUAN_SEKARANG'));
});

Deno.test('TR-3 — galat di pertemuan 2 dan 3 disebut dengan selisih masing-masing', async () => {
  const p = structuredClone(PERTEMUAN_S3);
  p[1].langkah[3].durasi_menit = 100;   // P2 = 175
  const r = await mintaPerbaikanDurasi(p, ['durasi']);
  const pd = panduanDari(r);
  assertEquals(pd.pertemuan_bermasalah, [
    { nomor: 2, total_sekarang: 175, total_wajib: 180, selisih: 5 },
    { nomor: 3, total_sekarang: 185, total_wajib: 180, selisih: -5 },
  ]);
  assert(r.includes('tambah tepat 5 menit di pertemuan 2 saja'));
  assert(r.includes('kurangi tepat 5 menit di pertemuan 3 saja'));
  assertEquals(pd.pertemuan_tanpa_galat_total, [1]);
});

Deno.test('TR-4 — angka diturunkan dari STRUKTUR, bukan dari kalimat galat', async () => {
  // Kalimat galat dengan angka yang berbeda — panduan tetap mengikuti struktur.
  const r = await mintaPerbaikanDurasi(PERTEMUAN_S3, ['pertemuan 9: Σlangkah.durasi_menit=999, diharapkan 1 (durasi)']);
  assertEquals(panduanDari(r).pertemuan_bermasalah, [{ nomor: 3, total_sekarang: 185, total_wajib: 180, selisih: -5 }]);
  const f = SRC.slice(SRC.indexOf('function panduanPerbaikanDurasi('), SRC.indexOf('async function perbaikiModulSetelahValidasi('));
  assert(!/errors|Σlangkah|diharapkan/.test(f.replace(/\/\/.*$/gm, '')), 'panduan tidak boleh membaca teks galat');
});

Deno.test('TR-5 — batas waktu kelas yang sudah diterima tetap ikut, dan jalur dokumen tidak berubah', async () => {
  const r = await mintaPerbaikanDurasi(PERTEMUAN_S3, GALAT_S3);
  const bagianB = JSON.parse(r.slice(0, r.indexOf('\n\nERROR yang harus diperbaiki:')));
  assertEquals(bagianB.batas_waktu_kelas_ini, M.batasWaktuKelas(30));
  assert(r.includes('sambil menjaga batas_waktu_kelas_ini'));
  // Jalur dokumen (galat tanpa "durasi") tidak menerima panduan ini.
  const d = await mintaPerbaikanDurasi(PERTEMUAN_S3, ['kktp[0].tuntutan_ref kosong']);
  assert(!d.includes('PANDUAN_PERBAIKAN_WAKTU'));
});

// ══ BENDA FISIK ═════════════════════════════════════════════════════════════

Deno.test('FIS — benda fisik yang tidak dikonfirmasi hanya pilihan tambahan', () => {
  assert(M.SYSTEM_PROMPT.includes('PILIHAN TAMBAHAN'));
  assert(!M.SYSTEM_PROMPT.includes('ruang praktik, alat ukur, kain, contoh produk;'),
    'daftar lama yang menganggap kain pasti tersedia masih ada');
});
