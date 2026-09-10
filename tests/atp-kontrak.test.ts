// UJI PENERIMAAN ATP — Case A sampai J.
//
// Jalankan: deno test --allow-read tests/atp-kontrak.test.ts
//
// TIDAK MENYENTUH PRODUKSI. Tidak ada panggilan jaringan, tidak ada basis
// data, tidak ada panggilan AI. Seluruhnya menjalankan fungsi murni di
// supabase/functions/generate-atp/kontrak.ts atas fixture buatan, dan satu
// fixture nyata: 16 judul TP dari ATP produksi Bahasa Inggris Fase E
// (tests/fixtures/atp-produksi.json).
//
// DUA JENIS JAMINAN, DIPISAH TEGAS:
//
//   DETERMINISTIC GUARANTEE — dibuktikan uji di berkas ini. Aritmetika,
//   cakupan CP, ketergantungan bahan, kepadatan TP, pencatatan keputusan yang
//   didelegasikan, gerbang acuan CP.
//
//   SEMANTIC ACCEPTANCE — TIDAK dibuktikan di sini dan tidak boleh dianggap
//   selesai. Apakah TP benar-benar mewakili makna CP, apakah urutannya
//   pedagogis, apakah konteks kejuruan terlalu dominan. Uji di bawah hanya
//   membuktikan bahwa MASUKAN yang berbeda menghasilkan PERINTAH yang berbeda
//   kepada penyusun — bukan bahwa keluarannya benar. Ketiganya menunggu telaah
//   manusia atas keluaran nyata; lihat laporan §K.

import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import {
  hitungAlokasi, hitungTargetTp, resolveDelegasi, bangunKonteksAtp,
  dasarProfilMurid, kumpulkanAsumsi, konteksDariGuru,
  acuanUntuk, tuntutanWajib, validasiAtp, KONTRAK_PERTANYAAN,
  MINGGU_PERKIRAAN_PER_SEMESTER, MAKS_KATA_JUDUL, TARGET_KATA_JUDUL,
  MAKS_TP_PER_FASE, MIN_TP_PER_FASE, MIN_PERTEMUAN_PER_TP, JP_PER_TP,
  DELEGASI_SEMANTIK, DASAR_KETERANGAN, dasarTersedia, pisahkanKeluaran,
  statusLayanan, cakupanLayanan, periksaParitasCp,
  VERSI_CP_BERLAKU, VERSI_CP_DICABUT,
  METODE_PENGURUTAN, LABEL_KONTEKS_TUGAS, aturanProgresiUntuk,
  type Alokasi, type ElemenCp, type TpEntry,
} from '../supabase/functions/generate-atp/kontrak.ts';
import { ACUAN_CP } from '../supabase/functions/generate-atp/acuan-cp.ts';

// ─────────────────────────────────────────────────────────────────────────────
// PERKAKAS
// ─────────────────────────────────────────────────────────────────────────────

const ELEMEN_BI: ElemenCp[] = [
  { id: 'menyimak_berbicara',        label: 'Menyimak - Berbicara',        cp_text: 'CP menyimak berbicara.' },
  { id: 'membaca_memirsa',           label: 'Membaca - Memirsa',           cp_text: 'CP membaca memirsa.' },
  { id: 'menulis_mempresentasikan',  label: 'Menulis - Mempresentasikan',  cp_text: 'CP menulis mempresentasikan.' },
];

type Jawaban = Record<string, Record<string, unknown>>;

/** collected_data dasar: Bahasa Inggris Fase E, 4 JP/minggu dibagi 2 pertemuan
 *  @ 2 JP, 18+18 minggu bersih, 1 minggu cadangan. */
function cd(ubah: Partial<Jawaban> = {}): Record<string, unknown> {
  const dasar: Jawaban = {
    KONTEKS_CP: { konfirmasi_konteks: 'sesuai', program_keahlian: 'Busana' },
    PROFIL_KELAS: { jumlah_murid_kelas: 28, bahasa_pengantar: 'indonesia_dominan' },
    PROFIL_SISWA: {
      tingkat_kemampuan_awal: 'sedikit_di_bawah',
      dasar_informasi_kesiapan: 'hasil_penilaian',
      kondisi_murid: 'tidak_ada',
      bantuan_konkret: ['memahami_bacaan'],
    },
    WAKTU: {
      tahun_pelajaran: '2026/2027', jp_per_minggu: 4, durasi_jp: '45',
      pola_jadwal: 'reguler_bagi', jp_per_sesi: 2,
      minggu_efektif_mode: 'isi_sendiri', minggu_sem1: 18, minggu_sem2: 18,
      cadangan_minggu: '1', konfirmasi_waktu: 'ya',
    },
    PENGUATAN_PRASYARAT: {
      strategi_prasyarat: 'terintegrasi', alokasi_prasyarat: 'menyatu',
      target_prioritas: ['pkl_kerja'],
    },
    KONTEKS_DUDI: { konteks_tugas: 'kerja', situasi_khusus: 'tidak_ada', metode_pengurutan: 'scaffolding' },
    ATP_SUMMARY: { persetujuan_atp_summary: 'generate' },
  };
  const out: Jawaban = {};
  for (const k of Object.keys(dasar)) out[k] = { ...dasar[k], ...(ubah[k] ?? {}) };
  for (const k of Object.keys(ubah)) if (!out[k]) out[k] = ubah[k]!;
  return out as Record<string, unknown>;
}

function konteksDari(
  data: Record<string, unknown>,
  info: Partial<{ mapel: string; fase: string; jenjang: string; jumlah_murid: number | null }> = {},
) {
  const alokasi = hitungAlokasi(data);
  const delegasi = resolveDelegasi(data);
  return bangunKonteksAtp(
    data,
    {
      mapel: info.mapel ?? 'Bahasa Inggris', fase: info.fase ?? 'E',
      jenjang: info.jenjang ?? 'SMK',
      jumlah_murid: info.jumlah_murid === undefined ? 28 : info.jumlah_murid,
    },
    alokasi, ELEMEN_BI, delegasi,
  );
}

const WAJIB_BI = tuntutanWajib(acuanUntuk('Bahasa Inggris', 'E')).map(w => w.id);

/** Menyusun ATP yang SAH untuk sebuah alokasi: membagi anggaran tiap semester
 *  rata ke sejumlah TP, semuanya kelipatan satuan pertemuan, dan menyebar
 *  seluruh tuntutan CP. Dipakai sebagai keluaran AI tiruan. */
function atpSah(alokasi: Alokasi, jumlahTp: number, tuntutan = WAJIB_BI): TpEntry[] {
  const satuan = alokasi.satuan_pertemuan;
  const out: TpEntry[] = [];
  const perSemester = alokasi.anggaran_semester.map(a => ({ ...a, pertemuan: a.jp / satuan }));
  const totalPertemuan = perSemester.reduce((s, a) => s + a.pertemuan, 0);

  // Bagi jumlah TP ke semester sebanding pertemuannya, lalu bagi pertemuan tiap
  // semester ke TP-nya — sisa pembagian ditumpuk ke TP terakhir semester itu.
  let sisaTp = jumlahTp;
  const tpPerSemester = perSemester.map((a, i) => {
    if (i === perSemester.length - 1) return sisaTp;
    const n = Math.max(1, Math.min(sisaTp - 1, Math.round(jumlahTp * a.pertemuan / totalPertemuan)));
    sisaTp -= n;
    return n;
  });

  let nomor = 1;
  perSemester.forEach((a, si) => {
    const n = tpPerSemester[si];
    const dasar = Math.floor(a.pertemuan / n);
    let sisa = a.pertemuan - dasar * n;
    for (let i = 0; i < n; i++) {
      const pertemuan = dasar + (sisa > 0 ? 1 : 0);
      if (sisa > 0) sisa--;
      out.push({
        nomor: nomor++,
        judul: `Membaca dokumen kerja dan menjawab pertanyaan bagian ${nomor - 1}`,
        elemen: [ELEMEN_BI[(nomor - 2) % 3].id],
        tuntutan: [],
        jp_alokasi: pertemuan * satuan,
        jp_pertemuan: Array(pertemuan).fill(satuan),
        semester: a.semester,
      });
    }
  });
  // Sebar tuntutan CP: setiap TP mendapat sekurang-kurangnya satu, dan setiap
  // tuntutan muncul sekurang-kurangnya sekali.
  out.forEach((tp, i) => { tp.tuntutan!.push(tuntutan[i % tuntutan.length]); });
  tuntutan.forEach((t, i) => {
    if (!out.some(tp => tp.tuntutan!.includes(t))) out[i % out.length].tuntutan!.push(t);
  });
  return out;
}

function syaratDari(
  alokasi: Alokasi, targetTp: number, tuntutan = WAJIB_BI,
  tambahan: { delegasi_terbuka?: typeof DELEGASI_SEMANTIK; dasar_tersedia?: Set<string> } = {},
) {
  return {
    jp_operasional: alokasi.jp_operasional,
    satuan_pertemuan: alokasi.satuan_pertemuan,
    elemen_diizinkan: new Set(ELEMEN_BI.map(e => e.id)),
    tuntutan_diizinkan: new Set(tuntutan),
    tuntutan_wajib: tuntutan,
    anggaran_semester: alokasi.anggaran_semester.map(a => ({ semester: a.semester, jp: a.jp })),
    target_tp: targetTp,
    ...tambahan,
  };
}

/** collected_data yang mendelegasikan A17 dan A19 kepada penyusun. */
function cdDelegasi(ubah: Partial<Jawaban> = {}) {
  return cd({
    KONTEKS_DUDI: {
      konteks_tugas: 'tentukan_saat_menyusun',
      metode_pengurutan: 'tentukan_saat_menyusun',
      situasi_khusus: 'tidak_ada',
    },
    ...ubah,
  });
}

/** Keputusan yang sah untuk A17 dan A19, dipakai sebagai keluaran model tiruan. */
function keputusanSah(over: Record<string, unknown>[] = []) {
  const dasar = [
    { question_id: 'A19', pilihan: 'prosedural',
      alasan: 'Tuntutan CP-nya membentuk satu prosedur menulis yang harus dilalui berurutan.',
      dasar: ['cp_anchor.tuntutan'] },
    { question_id: 'A17', pilihan: 'kerja',
      alasan: 'Program keahlian kelas ini punya situasi kerja yang benar-benar menuntut kompetensi itu.',
      dasar: ['konteks_kejuruan', 'cp_anchor.tuntutan'] },
  ];
  return dasar.map(d => ({ ...d, ...(over.find(o => o.question_id === d.question_id) ?? {}) }));
}

const gabung = (xs: string[]) => xs.join(' ‖ ').toLowerCase();

// ═════════════════════════════════════════════════════════════════════════════
// KONTRAK — tidak ada masukan yatim di kedua arah
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('KONTRAK: setiap pertanyaan ATP aktif punya entri kontrak, dan sebaliknya', async () => {
  const berkas = await Deno.readTextFile(new URL('../guru/js/rancang-chat-flow.js', import.meta.url));

  // Fase ATP diambil dari FASE_URUTAN_V1 di berkas yang sama supaya uji ini
  // tidak menyimpan daftarnya sendiri — daftar kedua akan basi diam-diam.
  const blokUrutan = berkas.slice(berkas.indexOf('const FASE_URUTAN_V1'), berkas.indexOf('// V2 — jangan render'));
  const faseAtp = [...blokUrutan.matchAll(/'([A-Z_]+)'/g)].map(m => m[1])
    .filter(f => f !== 'DONE' && f !== 'ATP_GENERATE');

  const idPertanyaan = new Set<string>();
  for (const fase of faseAtp) {
    const mulai = berkas.indexOf(`\n  ${fase}: [`);
    if (mulai === -1) continue;                       // fase tanpa pertanyaan (PILIH_ATP)
    const akhir = berkas.indexOf('\n  ],', mulai);
    const blok = berkas.slice(mulai, akhir);
    for (const m of blok.matchAll(/(?:pilihan|jamak|angka|konfirmasi)\('([a-z0-9_]+)'/g)) idPertanyaan.add(m[1]);
    for (const m of blok.matchAll(/id: '([a-z0-9_]+)', kind:/g)) idPertanyaan.add(m[1]);
  }

  assert(idPertanyaan.size >= 20, `hanya ${idPertanyaan.size} pertanyaan terbaca — pembacaan berkas alur gagal`);

  const kontrak = new Set(Object.keys(KONTRAK_PERTANYAAN));
  // 'program_keahlian' dan 'tindakan_review_atp' tidak lahir dari definisi
  // pertanyaan: yang pertama hasil salah satu dari tiga jalur A1, yang kedua
  // tindakan pascahasil.
  kontrak.delete('program_keahlian');

  const yatimDiAlur = [...idPertanyaan].filter(id => !KONTRAK_PERTANYAAN[id] && id !== 'tindakan_review_atp');
  assertEquals(yatimDiAlur, [], 'pertanyaan ditanyakan ke guru tapi tidak punya entri kontrak');

  const yatimDiKontrak = [...kontrak].filter(id => !idPertanyaan.has(id));
  assertEquals(yatimDiKontrak, [], 'entri kontrak tanpa pertanyaan yang menghasilkannya');
});

Deno.test('KONTRAK: setiap entri menyebut pemakai dan keputusan yang dipengaruhinya', () => {
  for (const [id, e] of Object.entries(KONTRAK_PERTANYAAN)) {
    assert(e.dipakai.trim().length > 0, `${id}: tidak menyebut pemakainya`);
    assert(e.keputusan.trim().length > 0, `${id}: tidak menyebut keputusan yang dipengaruhinya`);
    if (e.jenis === 'A' || e.jenis === 'C') {
      assertNotEquals(e.keputusan, '(cabang saja)',
        `${id}: ditandai jenis ${e.jenis} tapi keputusannya "(cabang saja)"`);
    }
  }
});

Deno.test('KONTRAK: 21 definisi SPEC A1–A20 + A15a, tidak kurang tidak lebih', () => {
  const spec = new Set(Object.values(KONTRAK_PERTANYAAN).map(e => e.spec));
  const harusnya = [
    'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
    'A11', 'A12', 'A13', 'A14', 'A15', 'A15a', 'A16', 'A17', 'A18', 'A19', 'A20',
  ];
  assertEquals([...spec].sort(), [...harusnya].sort());
  assertEquals(spec.size, 21);
});

Deno.test('KONTRAK: rumus waktu klien dan Edge Function memberi angka yang sama', async () => {
  // Kembaran calculateAllocation() di rancang-chat.js diekstrak dari sumbernya
  // dan dijalankan apa adanya. Menyalin ulang logikanya ke sini akan menguji
  // salinan, bukan kode yang benar-benar dikirim ke peramban guru.
  // Akhiran baris dinormalkan lebih dulu: repositori ini disunting di Windows,
  // dan pencarian penanda berbasis LF diam-diam gagal terhadap CRLF.
  const berkas = (await Deno.readTextFile(new URL('../guru/js/rancang-chat.js', import.meta.url)))
    .replaceAll(String.fromCharCode(13), '');
  const mulai = berkas.indexOf('  function calculateAllocation() {');
  const akhir = berkas.indexOf('\n  }\n', berkas.indexOf('anggaran_semester: anggaran };', mulai));
  const sumber = berkas.slice(mulai, akhir + 4);
  assert(sumber.includes('jp_operasional'), 'gagal mengekstrak calculateAllocation');

  const data = cd();
  const klien = new Function('answerValue', `
    const MINGGU_PERKIRAAN_PER_SEMESTER = ${MINGGU_PERKIRAAN_PER_SEMESTER};
    ${sumber}
    return calculateAllocation();
  `)((id: string) => {
    for (const fase of Object.values(data)) {
      const f = fase as Record<string, unknown>;
      if (f && Object.hasOwn(f, id)) return f[id];
    }
    return undefined;
  }) as Record<string, unknown>;

  const server = hitungAlokasi(data);
  for (const kunci of ['jp_operasional', 'satuan_pertemuan', 'jumlah_pertemuan', 'jp_tidak_terjadwal', 'jp_cadangan']) {
    assertEquals(klien[kunci], (server as unknown as Record<string, unknown>)[kunci], `berbeda pada ${kunci}`);
  }
  assertEquals(klien.anggaran_semester, server.anggaran_semester);
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE A — kesiapan sangat rendah
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE A: kesiapan sangat rendah mengubah titik awal tanpa menghapus tuntutan CP', () => {
  const data = cd({ PROFIL_SISWA: {
    tingkat_kemampuan_awal: 'jauh_di_bawah', dasar_informasi_kesiapan: 'hasil_penilaian',
    kondisi_murid: 'tidak_ada', bantuan_konkret: ['memahami_bacaan', 'menyusun_tulisan'],
  } });
  const k = konteksDari(data);

  // (1) kesiapan sampai ke penyusun sebagai kalimat, bukan kunci mesin
  assert(gabung(k.kesiapan_murid).includes('banyak kemampuan dasar'),
    'kesiapan rendah tidak tercermin di konteks');
  assert(!gabung(k.kesiapan_murid).includes('jauh_di_bawah'), 'kunci mesin bocor ke prompt');

  // (2) tuntutan CP TETAP UTUH — seluruh tuntutan hasil penguraian sampai ke
  //     penyusun, tidak berkurang satu pun. Jumlahnya adalah HASIL penguraian,
  //     bukan target: tujuh (CP 2024) → sepuluh (CP 2025) → sembilan setelah
  //     MP-3 digabung ke MP-1 karena verbanya tidak ada di sumber.
  assertEquals(k.cp_anchor.tuntutan.length, WAJIB_BI.length);
  assertEquals(WAJIB_BI.length, 9);

  // (3) larangan menurunkan tuntutan dinyatakan eksplisit
  assert(gabung(k.batas_mutlak).includes('tidak boleh dipakai untuk menghapus, menurunkan'),
    'larangan menurunkan tuntutan CP tidak ada di batas mutlak');

  // (4) waktu/dukungan tercermin: MiClass memilih penguatan gabungan, dan
  //     bantuan yang guru sebut ikut jadi syarat
  const del = resolveDelegasi(cd({ PROFIL_SISWA: { tingkat_kemampuan_awal: 'jauh_di_bawah' },
    PENGUATAN_PRASYARAT: { strategi_prasyarat: 'tentukan_saat_menyusun' } }));
  assertEquals(del.strategi_prasyarat, 'kombinasi');
  assert(gabung(k.kesiapan_murid).includes('memahami bacaan'));
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE B — kesiapan lebih tinggi, CP dan waktu sama
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE B: kesiapan lebih tinggi menghasilkan perintah yang berbeda dari Case A', () => {
  const rendah = cd({ PROFIL_SISWA: { tingkat_kemampuan_awal: 'jauh_di_bawah', dasar_informasi_kesiapan: 'hasil_penilaian' } });
  const tinggi = cd({ PROFIL_SISWA: { tingkat_kemampuan_awal: 'sesuai',        dasar_informasi_kesiapan: 'hasil_penilaian' } });

  const aR = hitungAlokasi(rendah), aT = hitungAlokasi(tinggi);
  assertEquals(aR.jp_operasional, aT.jp_operasional);   // waktunya memang sama

  // (1) kepadatan TP berbeda, dan bedanya DAPAT DIJELASKAN: murid yang jauh
  //     tertinggal mendapat TP lebih sedikit dan lebih lapang.
  const tR = hitungTargetTp(aR, 'jauh_di_bawah', WAJIB_BI.length);
  const tT = hitungTargetTp(aT, 'sesuai',        WAJIB_BI.length);
  assert(tR.target < tT.target, `target TP tidak berbeda: ${tR.target} vs ${tT.target}`);
  assertEquals(tR.asal, 'hitungan MiClass');

  // (2) konteks kesiapan berbeda
  assertNotEquals(konteksDari(rendah).kesiapan_murid[0], konteksDari(tinggi).kesiapan_murid[0]);

  // (3) bukan keacakan: dua kali panggilan atas masukan yang sama identik
  assertEquals(hitungTargetTp(aR, 'jauh_di_bawah', WAJIB_BI.length).target, tR.target);
  assertEquals(konteksDari(rendah), konteksDari(rendah));
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE C — program keahlian berbeda, kompetensi tetap
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE C: program keahlian mengubah arena penerapan, bukan kompetensi CP', () => {
  const busana   = konteksDari(cd({ KONTEKS_CP: { konfirmasi_konteks: 'sesuai', program_keahlian: 'Busana' } }));
  const otomotif = konteksDari(cd({ KONTEKS_CP: { konfirmasi_konteks: 'sesuai', program_keahlian: 'Teknik Otomotif' } }));

  // (1) tuntutan CP identik — inilah yang tidak boleh bergeser
  assertEquals(busana.cp_anchor.tuntutan, otomotif.cp_anchor.tuntutan);
  assertEquals(busana.cp_anchor.elemen,   otomotif.cp_anchor.elemen);

  // (2) konteks kejuruan berbeda
  assertNotEquals(busana.konteks_kejuruan[0], otomotif.konteks_kejuruan[0]);
  assert(busana.konteks_kejuruan[0].includes('Busana'));
  assert(otomotif.konteks_kejuruan[0].includes('Teknik Otomotif'));

  // (3) larangan menggeser kompetensi dinyatakan di kedua konteks
  for (const k of [busana, otomotif]) {
    assert(gabung(k.konteks_kejuruan).includes('arena penerapan, bukan kompetensi pengganti'));
    assert(gabung(k.konteks_kejuruan).includes('kompetensi bahasa inggris'));
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE D — tidak ada bahan audiovisual
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE D: TP yang bergantung pada video atau rekaman ditolak; menyimak tetap boleh', () => {
  const alokasi = hitungAlokasi(cd());
  const target  = hitungTargetTp(alokasi, 'sedikit_di_bawah', WAJIB_BI.length).target;
  const syarat  = syaratDari(alokasi, target);

  // Menyimak TANPA menyebut alat: harus LOLOS.
  const sehat = atpSah(alokasi, target);
  sehat[0].judul = 'Menyimak instruksi pengukuran pelanggan dan mencatat ukurannya';
  assertEquals(validasiAtp(sehat, syarat).errors, []);

  // Menyimak DARI REKAMAN: harus ditolak.
  for (const judul of [
    'Menyimak instruksi pengukuran pelanggan dari rekaman suara',
    'Menyimak ulasan video tutorial menjahit dan mencatat langkahnya',
    'Membaca poster keselamatan kerja dan menjawab pertanyaan',
    'Mencari informasi produk melalui internet dan meringkasnya',
  ]) {
    const rusak = atpSah(alokasi, target);
    rusak[0].judul = judul;
    const h = validasiAtp(rusak, syarat);
    assert(h.errors.some(e => e.startsWith('[B1]')), `tidak ditolak: "${judul}"`);
  }

  // Batas mutlak menyatakan menyimak tetap wajib dilayani.
  assert(gabung(konteksDari(cd()).batas_mutlak).includes('kemampuan menyimak tetap wajib dilayani'));
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE E — kelas besar
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE E: kelas besar melarang penilaian satu per satu, tanpa memaksa detail rotasi ke judul TP', () => {
  const besar = konteksDari(cd({ PROFIL_KELAS: { jumlah_murid_kelas: 36 } }), { jumlah_murid: 36 });
  const kecil = konteksDari(cd({ PROFIL_KELAS: { jumlah_murid_kelas: 12 } }), { jumlah_murid: 12 });
  const tanpa = konteksDari(cd(), { jumlah_murid: null });

  assert(gabung(besar.batas_mutlak).includes('setiap murid tampil satu per satu'),
    'kelas besar tidak memicu larangan penilaian satu per satu');
  assert(gabung(besar.batas_mutlak).includes('36 murid'));
  assert(gabung(kecil.batas_mutlak).includes('kelas kecil'));
  assert(!gabung(kecil.batas_mutlak).includes('setiap murid tampil satu per satu'));

  // Jumlah tidak diketahui: TIDAK mengandaikan besar maupun kecil.
  assert(gabung(tanpa.batas_mutlak).includes('belum diketahui'));
  assert(!gabung(tanpa.batas_mutlak).includes('kelas besar:'));
  assert(!gabung(tanpa.batas_mutlak).includes('kelas kecil:'));

  // Rotasi kelompok TIDAK boleh dipaksa masuk judul TP.
  assert(gabung(besar.batas_mutlak).includes('rotasi kelompok'));
  assert(gabung(besar.batas_mutlak).includes('urusan modul ajar, bukan judul tp'));
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE F — prioritas guru berbeda
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE F: prioritas berbeda mengubah penekanan tanpa mengubah cakupan CP', () => {
  const kerja  = konteksDari(cd({ PENGUATAN_PRASYARAT: { strategi_prasyarat: 'terintegrasi', alokasi_prasyarat: 'menyatu', target_prioritas: ['pkl_kerja'] } }));
  const lanjut = konteksDari(cd({ PENGUATAN_PRASYARAT: { strategi_prasyarat: 'terintegrasi', alokasi_prasyarat: 'menyatu', target_prioritas: ['pendidikan_lanjut', 'kemampuan_dasar'] } }));

  assertNotEquals(kerja.prioritas_guru[0], lanjut.prioritas_guru[0]);
  assert(kerja.prioritas_guru[0].includes('kesiapan PKL dan dunia kerja'));
  assert(lanjut.prioritas_guru[0].includes('pendidikan lanjut'));

  // Cakupan CP TIDAK berubah, dan larangannya dinyatakan eksplisit.
  assertEquals(kerja.cp_anchor.tuntutan, lanjut.cp_anchor.tuntutan);
  for (const k of [kerja, lanjut]) {
    assert(gabung(k.prioritas_guru).includes('tidak menentukan bagian cp yang boleh diabaikan'));
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE G — anggaran semester berbeda
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE G: anggaran semester berimbang persis, dan validator menegakkannya', () => {
  const kasus = [
    { sem1: 18, sem2: 18, cadangan: '1' },
    { sem1: 20, sem2: 14, cadangan: '0' },
    { sem1: 10, sem2: 22, cadangan: '2' },
    { sem1: 17, sem2: 17, cadangan: 'lain' },
  ];
  for (const kk of kasus) {
    const data = cd({ WAKTU: {
      tahun_pelajaran: '2026/2027', jp_per_minggu: 4, durasi_jp: '45',
      pola_jadwal: 'reguler_bagi', jp_per_sesi: 2,
      minggu_efektif_mode: 'isi_sendiri', minggu_sem1: kk.sem1, minggu_sem2: kk.sem2,
      cadangan_minggu: kk.cadangan, cadangan_minggu_lain: 3, konfirmasi_waktu: 'ya',
    } });
    const a = hitungAlokasi(data);

    // (1) tidak ada JP yang hilang maupun muncul
    assertEquals(a.anggaran_semester.reduce((s, x) => s + x.jp, 0), a.jp_operasional,
      `anggaran semester tidak berjumlah jp_operasional untuk ${JSON.stringify(kk)}`);
    // (2) keduanya kelipatan satuan pertemuan — kalau tidak, tidak ada susunan
    //     TP yang bisa memenuhi keduanya sekaligus
    for (const x of a.anggaran_semester) {
      assertEquals(x.jp % a.satuan_pertemuan, 0, `anggaran semester ${x.semester} bukan kelipatan satuan`);
      assert(x.jp >= 0);
    }

    // (3) ATP yang mematuhi anggaran diterima
    const target = hitungTargetTp(a, 'sedikit_di_bawah', WAJIB_BI.length).target;
    assertEquals(validasiAtp(atpSah(a, target), syaratDari(a, target)).errors, []);
  }

  // (4) ATP yang menggeser satu pertemuan antar-semester DITOLAK, meski
  //     jumlah totalnya tetap benar
  const a = hitungAlokasi(cd());
  const target = hitungTargetTp(a, 'sedikit_di_bawah', WAJIB_BI.length).target;
  const geser = atpSah(a, target);
  const dariSem2 = geser.find(t => t.semester === 2)!;
  dariSem2.semester = 1;
  const h = validasiAtp(geser, syaratDari(a, target));
  assert(h.errors.some(e => e.startsWith('[W8]')), 'pergeseran semester tidak terdeteksi: ' + h.errors.join('; '));
  assert(!h.errors.some(e => e.startsWith('[W6]')), 'total JP seharusnya tetap benar');
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE H — keputusan didelegasikan
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE H: keputusan deterministik diambil kode, keputusan semantik dibuka untuk penyusun', () => {
  const data = cd({
    PROFIL_KELAS: { jumlah_murid_kelas: 28, bahasa_pengantar: 'tentukan_saat_menyusun' },
    PENGUATAN_PRASYARAT: { strategi_prasyarat: 'tentukan_saat_menyusun', target_prioritas: ['pkl_kerja'] },
    KONTEKS_DUDI: { konteks_tugas: 'tentukan_saat_menyusun', situasi_khusus: 'tidak_ada', metode_pengurutan: 'tentukan_saat_menyusun' },
  });
  const del = resolveDelegasi(data);

  // (1) A15 dan A3 diselesaikan kode — aturannya dapat ditulis penuh tanpa
  //     membaca makna CP, dan nilainya tidak pernah tersisa sebagai sentinel.
  assertEquals(del.keputusan.length, 2);
  for (const nilai of [del.strategi_prasyarat, del.bahasa_pengantar]) {
    assertNotEquals(nilai, 'tentukan_saat_menyusun');
    assert(nilai.length > 0);
  }
  for (const k of del.keputusan) {
    assertEquals(k.sumber, 'aturan');
    assert(k.dipilih.length > 3, `keputusan tanpa label: ${k.pertanyaan}`);
    assert(k.alasan.length > 20, `keputusan tanpa alasan: ${k.pertanyaan}`);
    assertEquals(k.didelegasikan_karena, 'guru memilih tentukan saat menyusun');
  }

  // (2) A17 dan A19 TIDAK diputuskan kode. Keduanya dibiarkan terbuka, dan
  //     nilainya null — bukan tetapan diam-diam yang menyamar jadi keputusan.
  assertEquals(del.terbuka.map(q => q.question_id).sort(), ['A17', 'A19']);
  assertEquals(del.metode_pengurutan, null);
  assertEquals(del.konteks_tugas, null);

  // (3) yang terbuka sampai ke penyusun LENGKAP: allowlist opsi, hal yang wajib
  //     ditimbang, dan daftar dasar yang boleh disebut.
  const k = bangunKonteksAtp(data,
    { mapel: 'Bahasa Inggris', fase: 'E', jenjang: 'SMK', jumlah_murid: 28 },
    hitungAlokasi(data), ELEMEN_BI, del,
    dasarTersedia(data, { program_keahlian: 'Busana', jumlah_murid: 28 }, WAJIB_BI));
  assertEquals(k.keputusan_didelegasikan.length, 2);
  assert(gabung(k.keputusan_didelegasikan).includes('miclass memilih'));
  assertEquals(k.keputusan_terbuka.length, 2);
  for (const q of k.keputusan_terbuka) {
    assert(q.opsi.length >= 3, `${q.question_id}: allowlist terlalu sempit`);
    assert(q.pertimbangkan.length >= 4, `${q.question_id}: pertimbangan terlalu sedikit`);
    assert(q.dasar_yang_boleh_disebut.length > 0);
  }

  // (4) prompt TIDAK boleh memerintahkan metode maupun konteks yang belum
  //     diputuskan — kalau ia tetap muncul, penyusun hanya diminta menyetujui.
  const semua = gabung([...k.prioritas_guru, ...k.konteks_kejuruan]);
  assert(semua.includes('belum ditetapkan'), 'metode/konteks terbuka masih diperintahkan');

  // (5) guru yang MENJAWAB tidak menghasilkan keputusan MiClass satu pun,
  //     dan tidak menyisakan pertanyaan terbuka.
  assertEquals(resolveDelegasi(cd()).keputusan.length, 0);
  assertEquals(resolveDelegasi(cd()).terbuka.length, 0);

  // (6) pertanyaan yang tidak terjawab sama sekali dibedakan sebabnya
  const kosong = resolveDelegasi({ PROFIL_SISWA: { tingkat_kemampuan_awal: 'sesuai' } });
  assert(kosong.keputusan.every(x => x.didelegasikan_karena === 'guru belum menjawab'));
});

Deno.test('CASE H: keluaran lama berupa array telanjang tetap diterima', () => {
  const data = cd();                       // tidak ada yang didelegasikan
  const alokasi = hitungAlokasi(data);
  const v = validasiAtp(atpSah(alokasi, 12), syaratDari(alokasi, 12));
  assert(v.valid, v.errors.join('; '));
  assertEquals(v.keputusan.length, 0);

  // Dan amplop objek dibaca sama benarnya.
  const { tp, keputusan } = pisahkanKeluaran({ tp: atpSah(alokasi, 12), keputusan_didelegasikan: [] });
  assert(Array.isArray(tp) && (tp as unknown[]).length === 12);
  assertEquals(keputusan.length, 0);
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE I — acuan CP tidak tersedia
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE I: kombinasi tanpa acuan CP ditutup sebelum generate', () => {
  assertEquals(acuanUntuk('Matematika', 'E'), null);
  assertEquals(acuanUntuk('Bahasa Inggris', 'F'), null);
  assertEquals(acuanUntuk('Mata Pelajaran Karangan', 'E'), null);
  assertEquals(acuanUntuk('', ''), null);

  // Kombinasi yang PUNYA uraian tetap dapat dibaca — keberadaan uraian dan
  // keputusan layanan sekarang dua hal yang berbeda (lihat CASE T).
  const ada = acuanUntuk('Bahasa Inggris', 'E');
  assert(ada !== null);
  assertEquals(Object.keys(ada!.elemen).length, 3);
  assertEquals(tuntutanWajib(ada).length, 9);

  // Penulisan nama mapel yang berbeda tetap dikenali.
  assert(acuanUntuk('bahasa inggris', 'e') !== null);
  assert(acuanUntuk('Bahasa  Inggris', 'E') !== null);
});

Deno.test('CASE I: gerbang acuan CP berdiri sebelum rate limit di Edge Function', async () => {
  // Urutan kode di index.ts ADALAH kontraknya: gerbang yang berdiri sesudah
  // rate limit akan memakan jatah harian guru untuk kombinasi yang memang
  // tidak akan pernah dilayani.
  const ef = await Deno.readTextFile(new URL('../supabase/functions/generate-atp/index.ts', import.meta.url));
  const gerbang = ef.indexOf('ATP_ACUAN_CP_TIDAK_TERSEDIA');
  const rateLimit = ef.indexOf("svc.rpc('fn_check_rate_limit'");
  const panggilAi = ef.indexOf('generativelanguage.googleapis.com');
  assert(gerbang > 0 && rateLimit > 0 && panggilAi > 0);
  assert(gerbang < rateLimit, 'gerbang acuan CP berada SESUDAH rate limit — jatah guru akan terpakai');
  assert(gerbang < panggilAi, 'gerbang acuan CP berada SESUDAH panggilan AI');
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE J — ketergantungan bahan terlarang, dan kalibrasinya
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE J: fixture ketergantungan terlarang ditolak dengan sebab yang benar', () => {
  const a = hitungAlokasi(cd());
  const target = hitungTargetTp(a, 'sedikit_di_bawah', WAJIB_BI.length).target;
  const syarat = syaratDari(a, target);

  const kasus: [string, string][] = [
    ['Menyimak wawancara pelanggan dari rekaman suara',            'rekaman suara'],
    ['Menonton video YouTube tentang prosedur kerja dan mencatat', 'video'],
    ['Menyusun laporan kunjungan industri ke perusahaan garmen',   'kunjungan atau narasumber'],
    ['Mewawancarai narasumber dari industri tentang standar mutu', 'kunjungan atau narasumber'],
    ['Membuat slide presentasi profil perusahaan',                 'slide atau proyektor'],
    ['Mendeskripsikan gambar produk busana dalam bahasa Inggris',  'gambar'],
  ];
  for (const [judul, sebut] of kasus) {
    const rusak = atpSah(a, target);
    rusak[0].judul = judul;
    const h = validasiAtp(rusak, syarat);
    const b1 = h.errors.filter(e => e.startsWith('[B1]'));
    assertEquals(b1.length, 1, `tidak persis satu penolakan untuk "${judul}": ${h.errors.join('; ')}`);
    assert(b1[0].includes(sebut), `sebab salah untuk "${judul}": ${b1[0]}`);
  }

  // Ketergantungan yang bersembunyi di konteks/catatan, bukan di judul.
  const lewatKonteks = atpSah(a, target);
  lewatKonteks[1].konteks = ['dijalankan sambil menonton video tutorial'];
  assert(validasiAtp(lewatKonteks, syarat).errors.some(e => e.startsWith('[B1]')));
});

Deno.test('CASE J: kalibrasi — 16 judul TP produksi lolos tanpa satu pun salah tuduh', async () => {
  const fx = JSON.parse(await Deno.readTextFile(
    new URL('./fixtures/atp-produksi.json', import.meta.url))) as { judul: string[] };
  assertEquals(fx.judul.length, 16);

  const a = hitungAlokasi(cd());
  const target = fx.judul.length;
  const syarat = syaratDari(a, target);
  const tp = atpSah(a, target);
  fx.judul.forEach((j, i) => { tp[i].judul = j; });

  const h = validasiAtp(tp, syarat);
  const salahTuduh = h.errors.filter(e =>
    e.startsWith('[B1]') || e.startsWith('[B2]') || e.startsWith('[B3]'));
  assertEquals(salahTuduh, [],
    'aturan bahasa/bahan menolak judul ATP produksi yang sehat — gerbangnya terlalu galak');

  // Kalibrasi batas kata DIUKUR, bukan diyakini: judul terpanjang produksi 15
  // kata, dan sepuluh dari enam belas melewati 12 kata yang diminta prompt.
  // Batas 12 sebagai gerbang keras akan menjatuhkan setiap ATP yang pernah
  // MiClass hasilkan.
  const panjang = fx.judul.map(j => j.trim().split(/\s+/).length);
  assertEquals(Math.max(...panjang), 15);
  assert(Math.max(...panjang) <= MAKS_KATA_JUDUL);
  assert(panjang.filter(n => n > 12).length >= 8);
});

Deno.test('CASE J: judul yang benar-benar membengkak tetap ditolak', () => {
  const a = hitungAlokasi(cd());
  const target = hitungTargetTp(a, 'sedikit_di_bawah', WAJIB_BI.length).target;
  const tp = atpSah(a, target);
  tp[0].judul = 'Mengidentifikasi dan menganalisis serta mengevaluasi fitur kebahasaan teks ' +
                'prosedur dalam konteks komunikasi profesional pada bidang keahlian tertentu';
  assert(validasiAtp(tp, syaratDari(a, target)).errors.some(e => e.startsWith('[B3]')));

  const jargon = atpSah(a, target);
  jargon[0].judul = 'Menerapkan diferensiasi dalam penguasaan kosakata teknis';
  assert(validasiAtp(jargon, syaratDari(a, target)).errors.some(e => e.startsWith('[B2]')));
});

// ═════════════════════════════════════════════════════════════════════════════
// CAKUPAN CP, KEPADATAN, DASAR DAN ASUMSI
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CAKUPAN: tuntutan CP yang tidak terpetakan menggagalkan ATP', () => {
  const a = hitungAlokasi(cd());
  const target = hitungTargetTp(a, 'sedikit_di_bawah', WAJIB_BI.length).target;
  const syarat = syaratDari(a, target);

  assertEquals(validasiAtp(atpSah(a, target), syarat).errors, []);

  // Satu tuntutan dibuang dari seluruh TP.
  const bolong = atpSah(a, target, WAJIB_BI.slice(0, 6));
  const h = validasiAtp(bolong, syarat);
  assert(h.errors.some(e => e.startsWith('[C5]') && e.includes(WAJIB_BI[6])),
    'tuntutan yang tidak terpetakan tidak terdeteksi: ' + h.errors.join('; '));

  // ID tuntutan karangan ditolak.
  const karangan = atpSah(a, target);
  karangan[0].tuntutan = ['BIE-XX-9'];
  assert(validasiAtp(karangan, syarat).errors.some(e => e.startsWith('[C4]')));

  // Elemen CP karangan ditolak.
  const elemenKarangan = atpSah(a, target);
  elemenKarangan[0].elemen = ['menulis_kreatif'];
  assert(validasiAtp(elemenKarangan, syarat).errors.some(e => e.startsWith('[C2]')));
});

Deno.test('KEPADATAN: model tidak bisa mengabaikan jumlah TP yang ditetapkan', () => {
  const a = hitungAlokasi(cd());
  const target = hitungTargetTp(a, 'sedikit_di_bawah', WAJIB_BI.length).target;
  const syarat = syaratDari(a, target);

  // Meleset satu TP: diterima (perintahnya berbunyi "sekitar").
  assertEquals(validasiAtp(atpSah(a, target - 1), syarat).errors.filter(e => e.startsWith('[K1]')), []);
  // Meleset dua TP: ditolak.
  assert(validasiAtp(atpSah(a, target - 2), syarat).errors.some(e => e.startsWith('[K1]')));
  assert(validasiAtp(atpSah(a, target + 2), syarat).errors.some(e => e.startsWith('[K1]')));

  // Permintaan guru pun dijepit kedua batas. Sebelum Pass 2 batas atasnya
  // adalah jumlah pertemuan itu sendiri — artinya guru boleh meminta satu TP
  // per pertemuan, dan 70 TP untuk satu fase lolos tanpa satu pun keberatan.
  const banyak = hitungTargetTp(a, 'sedikit_di_bawah', WAJIB_BI.length, 999);
  assertEquals(banyak.target, banyak.maks);
  assert(banyak.maks <= MAKS_TP_PER_FASE, `batas atas ${banyak.maks} melewati batas beban kerja`);
  assertEquals(banyak.asal, 'permintaan guru');
  const sedikit = hitungTargetTp(a, 'sedikit_di_bawah', WAJIB_BI.length, 1);
  assert(sedikit.target >= 3);
});

Deno.test('DASAR: perkiraan tidak pernah ditampilkan sebagai bukti', () => {
  assert(dasarProfilMurid(cd({ PROFIL_SISWA: { tingkat_kemampuan_awal: 'sesuai', dasar_informasi_kesiapan: 'hasil_penilaian' } }))
    .includes('hasil penilaian'));
  assert(dasarProfilMurid(cd({ PROFIL_SISWA: { tingkat_kemampuan_awal: 'sesuai', dasar_informasi_kesiapan: 'pengamatan' } }))
    .includes('pengamatan'));
  assert(dasarProfilMurid(cd({ PROFIL_SISWA: { tingkat_kemampuan_awal: 'belum_diketahui' } }))
    .includes('asumsi'));

  // Pengamatan → masuk daftar asumsi. Hasil penilaian → tidak.
  const dariPengamatan = cd({ PROFIL_SISWA: {
    tingkat_kemampuan_awal: 'sesuai', dasar_informasi_kesiapan: 'pengamatan', bantuan_konkret: ['memahami_bacaan'] } });
  const dariPenilaian = cd({ PROFIL_SISWA: {
    tingkat_kemampuan_awal: 'sesuai', dasar_informasi_kesiapan: 'hasil_penilaian', bantuan_konkret: ['memahami_bacaan'] } });
  assert(kumpulkanAsumsi(dariPengamatan, hitungAlokasi(dariPengamatan))
    .some(x => x.hal.includes('Gambaran kesiapan')));
  assertEquals(kumpulkanAsumsi(dariPenilaian, hitungAlokasi(dariPenilaian))
    .filter(x => x.hal.includes('Gambaran kesiapan')), []);

  // Perkiraan minggu MiClass selalu ditandai asumsi.
  const perkiraan = cd({ WAKTU: {
    tahun_pelajaran: '2026/2027', jp_per_minggu: 4, durasi_jp: '45',
    pola_jadwal: 'reguler_bagi', jp_per_sesi: 2,
    minggu_efektif_mode: 'perkiraan_miclass', cadangan_minggu: '0', konfirmasi_waktu: 'ya' } });
  assertEquals(hitungAlokasi(perkiraan).minggu_efektif, MINGGU_PERKIRAAN_PER_SEMESTER * 2);
  assert(kumpulkanAsumsi(perkiraan, hitungAlokasi(perkiraan))
    .some(x => x.hal.includes('minggu pembelajaran bersih')));

  // Konteks dari guru TIDAK mengandung keputusan MiClass maupun asumsi.
  const dariGuru = konteksDariGuru(cd(), 28);
  assert(dariGuru.some(x => x.includes('Busana')));
  assert(dariGuru.some(x => x.includes('28')));
  assert(!gabung(dariGuru).includes('miclass memilih'));
});

Deno.test('BAHASA: tidak ada kunci mesin yang lolos ke prompt', () => {
  const k = konteksDari(cd({
    PROFIL_SISWA: { tingkat_kemampuan_awal: 'sangat_beragam', dasar_informasi_kesiapan: 'gabungan',
      kondisi_murid: 'tidak_ada', bantuan_konkret: ['mempertahankan_perhatian', 'mengikuti_urutan'] },
  }));
  const semua = [
    ...k.kesiapan_murid, ...k.prioritas_guru, ...k.konteks_kejuruan,
    ...k.anggaran_waktu, ...k.keputusan_didelegasikan, ...k.batas_mutlak,
  ].join(' ');

  for (const kunci of [
    'sangat_beragam', 'sedikit_di_bawah', 'jauh_di_bawah', 'hasil_penilaian',
    'mempertahankan_perhatian', 'mengikuti_urutan', 'pkl_kerja',
    'indonesia_dominan', 'terintegrasi', 'reguler_bagi', 'tentukan_saat_menyusun',
  ]) {
    assert(!semua.includes(kunci), `kunci mesin bocor ke prompt: ${kunci}`);
  }
  // cp_anchor sengaja MEMAKAI id elemen — ia kontrak keluaran, bukan prosa.
  assertEquals(k.cp_anchor.elemen[0].id, 'menyimak_berbicara');
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE K — urutan yang didelegasikan bergantung pada STRUKTUR CP
// ═════════════════════════════════════════════════════════════════════════════
//
// BATAS UJI INI, dinyatakan supaya tidak dibaca lebih jauh dari isinya:
// yang dibuktikan di sini adalah KONTRAKNYA — bahwa struktur tuntutan CP
// benar-benar sampai kepada penyusun, bahwa ia diperintahkan menimbangnya
// SEBELUM kesiapan murid, dan bahwa seluruh enam metode terbuka baginya.
// Apakah penyusun benar-benar memilih berbeda untuk struktur CP yang berbeda
// TIDAK dibuktikan di sini dan berstatus PENDING sampai model dipanggil sungguhan
// (SEMANTIC ACCEPTANCE, lihat kepala berkas).

Deno.test('CASE K: struktur CP sampai ke penyusun dan didahulukan atas kesiapan murid', () => {
  const kesiapanSama = { PROFIL_SISWA: { tingkat_kemampuan_awal: 'sesuai', dasar_informasi_kesiapan: 'hasil_penilaian' } };

  // Dua acuan CP dengan STRUKTUR berbeda, kesiapan murid SAMA.
  const tuntutanProsedural = [
    { id: 'X-1', elemen: 'e', t: { id: 'X-1', kompetensi: 'menyusun kerangka teks', lingkup_materi: 'langkah pertama prosedur menulis', sumber_cp: '-', cakupan_teks: 'penuh' as const, layak_teks: true } },
    { id: 'X-2', elemen: 'e', t: { id: 'X-2', kompetensi: 'menulis draf dari kerangka', lingkup_materi: 'langkah kedua prosedur menulis', sumber_cp: '-', cakupan_teks: 'penuh' as const, layak_teks: true } },
  ];

  const data = cdDelegasi(kesiapanSama);
  const del  = resolveDelegasi(data);
  const k    = bangunKonteksAtp(data,
    { mapel: 'Bahasa Inggris', fase: 'E', jenjang: 'SMK', jumlah_murid: 28 },
    hitungAlokasi(data), ELEMEN_BI, del,
    dasarTersedia(data, { program_keahlian: 'Busana', jumlah_murid: 28 }, WAJIB_BI));

  const a19 = k.keputusan_terbuka.find(q => q.question_id === 'A19')!;

  // (1) SELURUH enam metode terbuka — tidak ada penyempitan diam-diam ke dua
  //     pilihan seperti versi deterministik dahulu.
  assertEquals(a19.opsi.length, Object.keys(METODE_PENGURUTAN).length);
  assert(a19.opsi.some(o => o.kunci === 'prosedural'), 'metode prosedural tidak ditawarkan');
  assert(a19.opsi.some(o => o.kunci === 'hierarki'));
  assert(a19.opsi.some(o => o.kunci === 'scaffolding'));

  // (2) struktur CP disebut LEBIH DULU daripada kesiapan murid di pertimbangan.
  const iStruktur = a19.pertimbangkan.findIndex(x => /struktur/i.test(x));
  const iSiap     = a19.pertimbangkan.findIndex(x => /kesiapan/i.test(x));
  assert(iStruktur >= 0 && iSiap >= 0);
  assert(iStruktur < iSiap, 'kesiapan murid mendahului struktur CP di daftar pertimbangan');

  // (3) kesiapan murid dilarang MENGGANTIKAN struktur CP, dan larangannya
  //     dinyatakan, bukan diharapkan.
  assert(gabung(a19.pertimbangkan).includes('bukan menggantikan struktur cp'));

  // (4) kompetensi dan lingkup materi tiap tuntutan benar-benar dikirim —
  //     tanpa itu tidak ada struktur yang bisa dibaca penyusun.
  for (const t of k.cp_anchor.tuntutan) {
    assert(t.kompetensi.length > 0 && t.lingkup_materi.length > 0, `${t.id} dikirim kosong`);
  }
  assert(tuntutanProsedural.length === 2);   // fixture struktur, dipakai di laporan

  // (5) kesiapan yang berbeda TIDAK lagi mengubah metode secara otomatis —
  //     karena kode memang tidak lagi memilihnya.
  const lain = resolveDelegasi(cdDelegasi({ PROFIL_SISWA: { tingkat_kemampuan_awal: 'jauh_di_bawah' } }));
  assertEquals(lain.metode_pengurutan, null);
  assertEquals(del.metode_pengurutan, null);
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE L — konteks kejuruan yang didelegasikan memakai konteks, bukan tetapan
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE L: A17 tidak pernah lagi menjadi "seimbang" tanpa konteks', () => {
  const data = cdDelegasi();
  const del  = resolveDelegasi(data);

  // (1) tidak ada tetapan. Kode tidak memilih apa pun untuk A17.
  assertEquals(del.konteks_tugas, null);
  assert(!del.keputusan.some(k => /konteks contoh/i.test(k.pertanyaan)),
    'A17 masih diputuskan kode');

  // (2) konteks yang relevan benar-benar tersedia sebagai dasar yang boleh
  //     disebut — program keahlian, kesiapan, tuntutan CP.
  const boleh = dasarTersedia(data, { program_keahlian: 'Busana', jumlah_murid: 28 }, WAJIB_BI);
  assert(boleh.has('konteks_kejuruan'));
  assert(boleh.has('kesiapan_murid'));
  assert(boleh.has('cp_anchor.tuntutan'));
  assert(boleh.has('jumlah_murid'));

  // (3) program keahlian yang berbeda mengubah konteks yang dikirim.
  const kBusana = konteksDari(cdDelegasi());
  const kTkj    = konteksDari(cdDelegasi({ KONTEKS_CP: { konfirmasi_konteks: 'sesuai', program_keahlian: 'Teknik Komputer dan Jaringan' } }));
  assertNotEquals(gabung(kBusana.konteks_kejuruan), gabung(kTkj.konteks_kejuruan));

  // (4) semua tiga porsi tetap terbuka — 'seimbang' bukan lagi jawaban tunggal.
  const a17 = kBusana.keputusan_terbuka.find(q => q.question_id === 'A17')!;
  assertEquals(a17.opsi.length, Object.keys(LABEL_KONTEKS_TUGAS).length);

  // (5) keputusan penyusun yang memakai konteks kejuruan diterima...
  const alokasi = hitungAlokasi(data);
  const syarat  = syaratDari(alokasi, 12, WAJIB_BI, { delegasi_terbuka: del.terbuka, dasar_tersedia: boleh });
  const v = validasiAtp({ tp: atpSah(alokasi, 12), keputusan_didelegasikan: keputusanSah() }, syarat);
  assert(v.valid, v.errors.join('; '));
  assertEquals(v.keputusan.length, 2);
  assert(v.keputusan.every(x => x.sumber === 'penyusunan'));
  assert(v.keputusan.find(x => /konteks contoh/i.test(x.pertanyaan))!.dasar!.includes('konteks_kejuruan'));

  // (6) ...dan kelas TANPA program keahlian membuat dasar itu hilang dari daftar,
  //     sehingga keputusan yang tetap mengklaimnya ditolak.
  const tanpaProgram = dasarTersedia(data, { program_keahlian: '', jumlah_murid: null }, WAJIB_BI);
  assert(!tanpaProgram.has('konteks_kejuruan'));
  assert(!tanpaProgram.has('jumlah_murid'));
  const v2 = validasiAtp({ tp: atpSah(alokasi, 12), keputusan_didelegasikan: keputusanSah() },
    syaratDari(alokasi, 12, WAJIB_BI, { delegasi_terbuka: del.terbuka, dasar_tersedia: tanpaProgram }));
  assert(!v2.valid);
  assert(v2.errors.some(e => e.startsWith('[D5]')), v2.errors.join('; '));
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE M — bukti tidak bisa dikarang
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE M: keputusan yang berdasar sesuatu yang tidak ada ditolak, tidak disimpan', () => {
  const data    = cdDelegasi();               // situasi_khusus_uraian TIDAK diisi
  const del     = resolveDelegasi(data);
  const alokasi = hitungAlokasi(data);
  const boleh   = dasarTersedia(data, { program_keahlian: 'Busana', jumlah_murid: 28 }, WAJIB_BI);
  const syarat  = syaratDari(alokasi, 12, WAJIB_BI, { delegasi_terbuka: del.terbuka, dasar_tersedia: boleh });
  const tp      = atpSah(alokasi, 12);

  assert(!boleh.has('situasi_khusus'), 'situasi khusus tersedia padahal guru tidak menyebutkannya');

  const tolak = (keputusan: unknown[], kode: string, apa: string) => {
    const v = validasiAtp({ tp, keputusan_didelegasikan: keputusan }, syarat);
    assert(!v.valid, `${apa}: lolos padahal harus ditolak`);
    assert(v.errors.some(e => e.startsWith(`[${kode}]`)), `${apa}: ${v.errors.join('; ')}`);
    // dan yang ditolak TIDAK pernah tersimpan sebagai fakta
    assert(!v.keputusan.some(k => /situasi/i.test(k.alasan) && k.dasar?.includes('situasi_khusus')));
  };

  // D5 — dasar yang tidak ada dalam konteks permintaan ini
  tolak(keputusanSah([{ question_id: 'A17', pilihan: 'kerja',
    alasan: 'Guru meminta situasi bengkel dihindari, sehingga contoh diambil dari administrasi.',
    dasar: ['situasi_khusus'] }]), 'D5', 'dasar karangan');

  // D5 — tuntutan CP yang tidak ada di acuan
  tolak(keputusanSah([{ question_id: 'A19', pilihan: 'prosedural',
    alasan: 'Tuntutan itu berupa prosedur yang berurutan sehingga urutannya mengikuti langkahnya.',
    dasar: ['cp_anchor.tuntutan.BIE-ZZ-9'] }]), 'D5', 'ID tuntutan karangan');

  // D3 — opsi karangan di luar allowlist
  tolak(keputusanSah([{ question_id: 'A19', pilihan: 'spiral_bertingkat',
    alasan: 'Urutan spiral dianggap paling sesuai untuk kelas ini sepanjang fase.',
    dasar: ['cp_anchor.tuntutan'] }]), 'D3', 'opsi karangan');

  // D4 — alasan kosong
  tolak(keputusanSah([{ question_id: 'A17', pilihan: 'kerja', alasan: 'kerja', dasar: ['konteks_kejuruan'] }]),
    'D4', 'alasan kosong');

  // D5 — tanpa dasar sama sekali
  tolak(keputusanSah([{ question_id: 'A17', pilihan: 'kerja',
    alasan: 'Contoh dan tugas diambil dari dunia kerja karena dianggap lebih bermanfaat.', dasar: [] }]),
    'D5', 'tanpa dasar');

  // D2 — pertanyaan yang didelegasikan tidak dijawab
  tolak(keputusanSah().filter(k => k.question_id === 'A17'), 'D2', 'A19 tidak dijawab');

  // D1 — menjawab pertanyaan yang tidak didelegasikan
  const vD1 = validasiAtp(
    { tp, keputusan_didelegasikan: [...keputusanSah(), { question_id: 'A15', pilihan: 'awal', alasan: 'Kemampuan dasar dikuatkan lebih dulu supaya murid siap.', dasar: ['kesiapan_murid'] }] },
    syarat);
  assert(!vD1.valid);
  assert(vD1.errors.some(e => e.startsWith('[D1]')), vD1.errors.join('; '));

  // Guru yang MENJAWAB sendiri: keputusan apa pun dari model ditolak.
  const vTutup = validasiAtp({ tp, keputusan_didelegasikan: keputusanSah() },
    syaratDari(alokasi, 12, WAJIB_BI, { delegasi_terbuka: [], dasar_tersedia: boleh }));
  assert(!vTutup.valid);
  assert(vTutup.errors.some(e => e.startsWith('[D1]')));
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE N — setiap tuntutan acuan punya sumber, dan tidak ada CP yang hilang
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE N: penguraian CP 2025 dapat ditelusuri dua arah', async () => {
  const cpData = JSON.parse(await Deno.readTextFile('shared/data/cp-data.json'));

  let diperiksa = 0;
  for (const [mapel, fase] of Object.entries(ACUAN_CP.acuan)) {
    for (const [kunciFase, acuan] of Object.entries(fase)) {
      const sumberFase = cpData[mapel]?.[kunciFase];
      assert(sumberFase, `acuan ${mapel}/${kunciFase} tidak punya sumber CP`);

      // Acuan dan sumber CP wajib menyebut regulasi yang SAMA, dan regulasi itu
      // wajib yang berlaku. Tanpa ini, teks boleh saja identik sementara
      // keduanya diam-diam mengklaim otoritas yang berbeda.
      assertEquals(acuan.versi_cp, sumberFase.versi_cp,
        `${mapel}/${kunciFase}: versi CP acuan dan sumber berbeda`);

      for (const [idElemen, el] of Object.entries(acuan.elemen)) {
        const normatif: string = (sumberFase.elemen as { nama: string; cp_normatif: string }[])
          .find(e => e.nama === el.label)?.cp_normatif ?? '';
        assert(normatif.length > 0, `${idElemen}: label "${el.label}" tidak cocok satu pun elemen CP`);

        // Teks normatif di acuan wajib identik dengan sumbernya — ini yang
        // membuat peramban dan Edge Function tidak mungkin membaca CP berbeda.
        assertEquals(el.cp_normatif, normatif, `${idElemen}: cp_normatif acuan menyimpang dari cp-data.json`);
        assert(el.logika_elemen.length > 20, `${idElemen}: hubungan logis antar anak kalimat tidak dinyatakan`);

        // ARAH 1 — setiap tuntutan berasal dari CP, verbatim.
        for (const t of el.tuntutan) {
          assert(typeof t.sumber_cp === 'string' && t.sumber_cp.length > 10,
            `${t.id}: tuntutan tanpa sumber CP`);
          assert(normatif.includes(t.sumber_cp),
            `${t.id}: sumber_cp bukan potongan verbatim dari cp_normatif elemennya`);
          assert(['EXACT', 'SAFE DECOMPOSITION', 'NEEDS HUMAN REVIEW'].includes(t.status_dekomposisi),
            `${t.id}: status_dekomposisi tidak sah (${t.status_dekomposisi})`);
          assert(t.status_dekomposisi !== 'INVALID', `${t.id}: penguraian tidak sah`);
          // Hubungan logis wajib dinyatakan, dan wajib menyebut AND atau OR —
          // tuntutan tanpa itu tidak dapat dibedakan alternatif dari kumulatif.
          assert(/\bAND\b|\bOR\b|ALTERNATIF|KUMULATIF|SENGKETA/i.test(t.logika),
            `${t.id}: hubungan AND/OR tidak dinyatakan di logika`);
          assert(['dilayani', 'tidak_dilayani', 'perlu_telaah_manusia'].includes(t.layanan),
            `${t.id}: status layanan tidak sah`);
          assert(t.cara_layanan.length > 30, `${t.id}: cara layanan tidak dijelaskan`);
          diperiksa++;
        }

        // ARAH 2 — tidak ada bagian CP yang tidak diklaim siapa pun.
        //
        // Diukur pada GABUNGAN sumber, bukan pada potongan per tuntutan, dan
        // itu disengaja: satu anak kalimat boleh menopang lebih dari satu
        // tuntutan (CASE W). Memaksa potongan unik akan memaksa lingkup materi
        // dipenggal dari kompetensinya, dan justru itu yang membuat MM-1 di
        // Pass 3 tidak dapat membuktikan genre, moda, dan topiknya.
        const gabungSumber = el.tuntutan.map(t => t.sumber_cp).join(' ').toLowerCase();
        const hilang = [...new Set(
          normatif.toLowerCase().replace(/[^a-zà-ÿ\s-]/g, ' ').split(/\s+/)
            .filter(w => w.length >= 4))]
          .filter(w => !gabungSumber.includes(w));
        assertEquals(hilang, [], `${idElemen}: bagian CP tidak diklaim tuntutan mana pun: ${hilang.join(', ')}`);
      }
    }
  }
  // Jumlahnya HASIL penguraian, bukan target. Yang dijaga di sini hanyalah
  // bahwa seluruh tuntutan yang benar-benar terpasang ikut diperiksa.
  const terpasang = Object.values(ACUAN_CP.acuan)
    .flatMap(f => Object.values(f))
    .flatMap(a => Object.values(a.elemen))
    .reduce((n, el) => n + el.tuntutan.length, 0);
  assertEquals(diperiksa, terpasang);
  assert(diperiksa >= 3, `hanya ${diperiksa} tuntutan diperiksa`);
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE O — batas kepadatan TP
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE O: jumlah TP terbatas di kedua ujung dan tidak melompat di batas', () => {
  const alokasiUntuk = (jp: number, satuan: number): Alokasi => ({
    jp_per_minggu: satuan * 2, minggu_sem1: 18, minggu_sem2: 18, minggu_efektif: 36,
    jp_kalender: jp, jp_cadangan: 0, jp_prasyarat: 0, satuan_pertemuan: satuan,
    jp_tidak_terjadwal: 0, jp_operasional: jp, jumlah_pertemuan: jp / satuan,
    anggaran_semester: [{ semester: 1, minggu: 18, jp: jp / 2 }, { semester: 2, minggu: 18, jp: jp / 2 }],
  });
  const KESIAPAN = ['sesuai', 'sedikit_di_bawah', 'belum_diketahui', 'sangat_beragam', 'jauh_di_bawah'];

  // (1) kedua batas dihormati di seluruh matriks
  for (const jp of [48, 72, 108, 126, 144, 400]) {
    const satuan = jp % 4 === 0 ? 4 : 2;
    for (const k of KESIAPAN) {
      const t = hitungTargetTp(alokasiUntuk(jp, satuan), k, WAJIB_BI.length);
      assert(t.target <= MAKS_TP_PER_FASE, `${jp} JP/${k}: ${t.target} TP melewati batas beban kerja`);
      assert(t.target >= MIN_TP_PER_FASE, `${jp} JP/${k}: ${t.target} TP di bawah lantai`);
      assert(t.target >= t.min && t.target <= t.maks, `${jp} JP/${k}: target di luar [min, maks]`);
      // tidak ada TP yang lebih pendek dari satu langkah utuh
      const pertemuanPerTp = (jp / satuan) / t.target;
      assert(pertemuanPerTp >= MIN_PERTEMUAN_PER_TP - 0.5,
        `${jp} JP/${k}: satu TP hanya ${pertemuanPerTp.toFixed(1)} pertemuan`);
    }
  }

  // (1b) lantai mengikuti jumlah tuntutan CP yang BENAR-BENAR terpasang —
  //      bukan angka yang ditulis tangan di uji. Saat penguraian dibangun
  //      ulang ke CP 2025 (7 -> 10 tuntutan), lantainya ikut naik 4 -> 5.
  assertEquals(WAJIB_BI.length, 9);
  assertEquals(hitungTargetTp(alokasiUntuk(144, 4), 'sesuai', WAJIB_BI.length).min,
    Math.max(MIN_TP_PER_FASE, Math.ceil(WAJIB_BI.length / 2)));

  // (2) lantai berpangkal pada STRUKTUR CP, bukan pada jam
  const kecil = alokasiUntuk(48, 4);
  assertEquals(hitungTargetTp(kecil, 'sesuai', 2).min, MIN_TP_PER_FASE);
  assert(hitungTargetTp(kecil, 'sesuai', 12).min > hitungTargetTp(kecil, 'sesuai', 2).min,
    'jumlah tuntutan CP tidak memengaruhi batas bawah');

  // (3) langkah kecil di masukan tidak menghasilkan lompatan di keluaran
  for (const k of KESIAPAN) {
    let sebelum = hitungTargetTp(alokasiUntuk(8, 4), k, WAJIB_BI.length).target;
    assert(JP_PER_TP[k] > 0);
    for (let jp = 12; jp <= 240; jp += 4) {
      const kini = hitungTargetTp(alokasiUntuk(jp, 4), k, WAJIB_BI.length).target;
      assert(kini >= sebelum, `${k}: target turun saat jam bertambah (${jp} JP)`);
      assert(kini - sebelum <= 1, `${k}: target melompat ${kini - sebelum} TP di ${jp} JP`);
      sebelum = kini;
    }
  }

  // (4) kesiapan yang lebih rendah memberi TP yang lebih SEDIKIT dan lebih
  //     lapang — bukan lebih banyak dan lebih sempit
  const besar = alokasiUntuk(108, 4);
  assert(hitungTargetTp(besar, 'jauh_di_bawah', WAJIB_BI.length).target
       < hitungTargetTp(besar, 'sesuai', WAJIB_BI.length).target);

  // (5) permintaan guru pun tetap dijepit kedua batas
  assertEquals(hitungTargetTp(besar, 'sesuai', WAJIB_BI.length, 99).target, hitungTargetTp(besar, 'sesuai', WAJIB_BI.length).maks);
  assertEquals(hitungTargetTp(besar, 'sesuai', WAJIB_BI.length, 1).target, hitungTargetTp(besar, 'sesuai', WAJIB_BI.length).min);
});

// ═════════════════════════════════════════════════════════════════════════════
// JUDUL TP — sasaran lunak vs batas keras
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('JUDUL: 12 kata bersih, 13-16 kata lolos dengan catatan, 17 kata ditolak', () => {
  const data = cd();
  const alokasi = hitungAlokasi(data);
  const syarat = syaratDari(alokasi, 12);
  const kata = (n: number) => Array.from({ length: n }, (_, i) => `kata${i + 1}`).join(' ');

  const ujiJudul = (n: number) => {
    const tp = atpSah(alokasi, 12);
    tp[0].judul = kata(n);
    return validasiAtp(tp, syarat);
  };

  // sasaran lunak — bersih, tanpa catatan apa pun
  const s12 = ujiJudul(TARGET_KATA_JUDUL);
  assert(s12.valid, s12.errors.join('; '));
  assertEquals(s12.peringatan.length, 0);

  // pita toleransi — lolos, TETAPI tercatat sebagai catatan mutu internal
  for (let n = TARGET_KATA_JUDUL + 1; n <= MAKS_KATA_JUDUL; n++) {
    const v = ujiJudul(n);
    assert(v.valid, `${n} kata seharusnya lolos: ${v.errors.join('; ')}`);
    assertEquals(v.peringatan.length, 1, `${n} kata seharusnya tercatat di pita toleransi`);
    assert(v.peringatan[0].includes('B3-toleransi'));
  }

  // batas keras
  const vGagal = ujiJudul(MAKS_KATA_JUDUL + 1);
  assert(!vGagal.valid);
  assert(vGagal.errors.some(e => e.startsWith('[B3]')), vGagal.errors.join('; '));

  // sasaran dan batas keras adalah DUA angka, dan sasaran lebih ketat
  assert(TARGET_KATA_JUDUL < MAKS_KATA_JUDUL);
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE P — CP yang dipakai generator adalah CP yang berlaku
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE P: Bahasa Inggris Fase E berpangkal pada 046/H/KR/2025', async () => {
  const cpData = JSON.parse(await Deno.readTextFile('shared/data/cp-data.json'));
  const fe = cpData.bahasa_inggris.fase_e;

  assertEquals(VERSI_CP_BERLAKU, '046/H/KR/2025');
  assertEquals(fe.versi_cp, VERSI_CP_BERLAKU);
  assertEquals(fe.mencabut, '32/H/KR/2024');
  assert(String(fe.sumber_regulasi).includes('046/H/KR/2025'));

  const acuan = acuanUntuk('Bahasa Inggris', 'E')!;
  assertEquals(acuan.versi_cp, VERSI_CP_BERLAKU);

  // Rumusan 2024 yang khas TIDAK BOLEH tersisa di mana pun sebagai sumber
  // aktif. Ketiganya adalah kalimat yang hanya ada di CP yang sudah dicabut.
  const seluruhTeks = [
    ...fe.elemen.map((e: { cp_normatif: string }) => e.cp_normatif),
    String(fe.cp_umum ?? ''),
    ...Object.values(acuan.elemen).map(el => el.cp_normatif),
  ].join(' ');
  for (const jejak2024 of [
    'berkomunikasi dengan guru, teman sebaya dan orang lain',
    'membaca dan merespon berbagai macam teks seperti narasi',
    'melalui aktivitas yang dipandu',
    'menggunakan beragam media untuk berkomunikasi',
  ]) {
    assert(!seluruhTeks.includes(jejak2024),
      `rumusan CP 2024 masih menjadi sumber aktif: "${jejak2024}"`);
  }

  // Dan penanda 2025 memang ada.
  assert(seluruhTeks.includes('menyimpulkan informasi tersurat dan tersirat'));
  assert(seluruhTeks.includes('berbagai media presentasi'));
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE Q — CP yang dicabut tidak bisa melewati gerbang
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE Q: acuan yang berpangkal pada CP tercabut tidak pernah didukung', () => {
  assert(VERSI_CP_DICABUT.includes('32/H/KR/2024'));
  assert(VERSI_CP_DICABUT.includes('032/H/KR/2024'));
  assert(!VERSI_CP_DICABUT.includes(VERSI_CP_BERLAKU));

  // Tidak satu pun acuan yang terpasang boleh menyebut regulasi tercabut.
  for (const [mapel, fase] of Object.entries(ACUAN_CP.acuan)) {
    for (const [kunciFase, acuan] of Object.entries(fase)) {
      assert(!VERSI_CP_DICABUT.includes(acuan.versi_cp),
        `${mapel}/${kunciFase} masih memakai ${acuan.versi_cp} yang sudah dicabut`);
    }
  }

  // Dan seandainya ada, gerbangnya menutup — bukan meloloskannya.
  const palsu = {
    status: 'tersedia', versi_cp: '32/H/KR/2024',
    sumber_regulasi: 'Keputusan Kepala BSKAP Nomor 32/H/KR/2024',
    ditetapkan: '2024-01-01', review_status: 'diterima',
    elemen: {
      e1: {
        label: 'E1', cp_normatif: 'teks lama', logika_elemen: 'AND',
        tuntutan: [{
          id: 'X-1', kompetensi: 'k', lingkup_materi: 'l', sumber_cp: 'teks lama',
          status_dekomposisi: 'SAFE DECOMPOSITION', logika: 'AND',
          layanan: 'dilayani' as const, cara_layanan: 'seluruhnya disusun MiClass tanpa bahan tambahan',
        }],
      },
    },
  };
  const cakupan = cakupanLayanan(palsu);
  assert(cakupan.penuh, 'fixture ini memang berlayanan penuh — yang menutup gerbang harus versinya');
  assert(VERSI_CP_DICABUT.includes(palsu.versi_cp),
    'fixture CP tercabut: versinya harus dikenali sebagai tercabut');
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE R — CP yang dilihat peramban, acuan, dan Edge Function identik
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE R: satu teks CP untuk peramban, acuan, dan Edge Function', async () => {
  const cpData = JSON.parse(await Deno.readTextFile('shared/data/cp-data.json'));
  const acuan  = acuanUntuk('Bahasa Inggris', 'E')!;
  const fe     = cpData.bahasa_inggris.fase_e;

  // (1) acuan (dipakai Edge Function) == cp-data.json (dimuat peramban)
  for (const [id, el] of Object.entries(acuan.elemen)) {
    const dariSumber = (fe.elemen as { nama: string; cp_normatif: string }[])
      .find(e => e.nama === el.label);
    assert(dariSumber, `elemen ${id} tidak ada di cp-data.json`);
    assertEquals(el.cp_normatif, dariSumber!.cp_normatif, `elemen ${id}: teks CP berbeda`);
  }

  // (2) potret elemen_cp milik ATP diperiksa terhadap CP yang berlaku.
  //     Inilah lubang yang ditutup Pass 3: Edge Function membaca potret di
  //     baris ATP, bukan cp-data.json, dan sampai sekarang tidak ada yang
  //     menyadari kalau potret itu sudah basi.
  const potretBaru = Object.entries(acuan.elemen).map(([id, el]) => ({
    id, label: el.label, cp_text: el.cp_normatif,
  }));
  assert(periksaParitasCp(potretBaru, acuan).cocok, 'potret CP mutakhir seharusnya lolos');

  // (3) potret CP 2024 — persis yang tersimpan di ATP produksi hari ini.
  const potretLama = [
    { id: 'menyimak_berbicara', label: 'Menyimak - Berbicara',
      cp_text: 'Peserta didik menggunakan bahasa Inggris untuk berkomunikasi dengan guru, teman sebaya dan orang lain dalam berbagai macam situasi. Peserta didik memahami alur informasi secara keseluruhan, gagasan utama dan detail dalam teks lisan fiksi dan non-fiksi mengenai berbagai macam topik yang relevan dengan topik sehari-hari atau isu terkini. Peserta didik menggunakan bahasa Inggris untuk mengungkapkan pendapat dan mempertahankan argumen tentang topik yang dibahas.' },
    { id: 'membaca_memirsa', label: 'Membaca - Memirsa', cp_text: 'Peserta didik membaca dan merespon berbagai macam teks seperti narasi, deskripsi, prosedur, eksposisi, recount, dan report untuk pembelajaran dan pencarian informasi.' },
    { id: 'menulis_mempresentasikan', label: 'Menulis - Mempresentasikan', cp_text: 'Peserta didik menulis berbagai jenis teks fiksi dan non-fiksi, melalui aktivitas yang dipandu, menggunakan beragam media untuk berkomunikasi dan menyajikan gagasan dengan struktur dan unsur kebahasaan yang sesuai dengan tujuan dan konteks komunikatif.' },
  ];
  const lama = periksaParitasCp(potretLama, acuan);
  assert(!lama.cocok, 'potret CP 2024 seharusnya ditolak');
  assertEquals(lama.masalah.length, 3);

  // (4) elemen karangan ditolak, elemen yang hilang ditolak
  assert(!periksaParitasCp([...potretBaru, { id: 'menulis_kreatif', label: 'X', cp_text: 'y' }], acuan).cocok);
  assert(!periksaParitasCp(potretBaru.slice(0, 2), acuan).cocok);
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE S — jalur alternatif tidak boleh diwajibkan sekaligus
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE S: "A atau B" tidak diperlakukan sebagai "A dan B"', () => {
  const acuan = acuanUntuk('Bahasa Inggris', 'E')!;
  const semua = Object.values(acuan.elemen).flatMap(el => el.tuntutan);

  // Tuntutan yang sumber CP-nya memuat "atau" WAJIB menyatakan alternatifnya,
  // dan TIDAK boleh dinyatakan sebagai layanan yang berkurang hanya karena
  // MiClass tidak menempuh jalur yang satunya lagi.
  const beralternatif = semua.filter(t => /\batau\b/i.test(t.sumber_cp));
  assert(beralternatif.length >= 3, `hanya ${beralternatif.length} tuntutan beralternatif ditemukan`);
  for (const t of beralternatif) {
    assert(/\bOR\b|ALTERNATIF|SENGKETA/i.test(t.logika),
      `${t.id}: sumber CP-nya memuat "atau" tetapi logikanya tidak menyatakan alternatif`);
  }

  // Kasus yang paling menentukan: "tertulis atau teks multimodal". MiClass
  // tidak menghasilkan teks multimodal, dan itu TIDAK menjadikan tuntutannya
  // terpenuhi sebagian — jalur tertulis adalah pemenuhan normatif penuh.
  const mm = acuan.elemen.membaca_memirsa.tuntutan;
  for (const t of mm) {
    assertEquals(t.layanan, 'dilayani',
      `${t.id}: jalur tertulis adalah pemenuhan penuh, bukan sebagian`);
  }
  const mp1 = semua.find(t => t.id === 'BIE-E25-MP-1')!;
  assertEquals(mp1.layanan, 'dilayani');
  assert(/tertulis ATAU multimodal|tertulis ATAU/i.test(mp1.logika) || /\bOR\b/.test(mp1.logika));

  // Sebaliknya: yang memang kumulatif tidak boleh diubah jadi alternatif demi
  // menyesuaikan kemampuan produk.
  const mb = acuan.elemen.menyimak_berbicara;
  assert(/KUMULATIF|AND/i.test(mb.logika_elemen));

  // Dan jalur alternatif itu benar-benar sampai ke penyusun.
  const k = konteksDari(cd());
  const dikirim = k.cp_anchor.tuntutan;
  assert(dikirim.length >= 1);
  assert(dikirim.every(t => typeof t.logika === 'string' && t.logika.length > 10),
    'hubungan AND/OR tidak dikirim ke penyusun');
  assert(gabung(k.batas_mutlak).includes('alternatif'),
    'penyusun tidak diberi tahu bahwa jalur alternatif sudah memenuhi');
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE T — gerbang layanan penuh
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE T: satu tuntutan wajib yang tak terlayani menutup kombinasi', () => {
  const buatAcuan = (layanan: 'dilayani' | 'tidak_dilayani' | 'perlu_telaah_manusia') => ({
    status: 'tersedia', versi_cp: VERSI_CP_BERLAKU,
    sumber_regulasi: 'Keputusan Kepala BSKAP Nomor 046/H/KR/2025',
    ditetapkan: '2025-07-16', review_status: 'diterima',
    elemen: {
      e1: {
        label: 'E1', cp_normatif: 'a b c', logika_elemen: 'AND kumulatif',
        tuntutan: [
          { id: 'T-1', kompetensi: 'k', lingkup_materi: 'l', sumber_cp: 'a',
            status_dekomposisi: 'SAFE DECOMPOSITION', logika: 'AND',
            layanan: 'dilayani' as const, cara_layanan: 'seluruhnya disusun MiClass tanpa bahan tambahan' },
          { id: 'T-2', kompetensi: 'k', lingkup_materi: 'l', sumber_cp: 'b',
            status_dekomposisi: 'SAFE DECOMPOSITION', logika: 'AND',
            layanan, cara_layanan: 'seluruhnya disusun MiClass tanpa bahan tambahan' },
        ],
      },
    },
  });

  assert(cakupanLayanan(buatAcuan('dilayani')).penuh);
  assert(!cakupanLayanan(buatAcuan('tidak_dilayani')).penuh,
    'satu tuntutan tak terlayani harus membuat cakupan tidak penuh');
  assert(!cakupanLayanan(buatAcuan('perlu_telaah_manusia')).penuh,
    'belum terbukti dapat dilayani bukan berarti aman');
  assertEquals(cakupanLayanan(buatAcuan('tidak_dilayani')).tidak_dilayani, ['T-2']);
  assertEquals(cakupanLayanan(buatAcuan('perlu_telaah_manusia')).perlu_telaah, ['T-2']);

  // Keadaan nyata sesudah keputusan peninjau 10 September 2026: Bahasa Inggris
  // Fase E TERBUKA, dan terbuka karena SELURUH tuntutannya terlayani — bukan
  // karena gerbangnya dilonggarkan. Fixture di atas membuktikan gerbangnya
  // masih menutup begitu satu tuntutan saja tidak terlayani.
  const st = statusLayanan('Bahasa Inggris', 'E');
  assertEquals(st.kode, 'FULLY_SUPPORTED');
  assertEquals(st.didukung, true);
  assertEquals(st.alasan, []);
  assertEquals(st.cakupan.tidak_dilayani, []);
  assertEquals(st.cakupan.perlu_telaah, []);
  assertEquals(st.cakupan.dilayani.length, st.cakupan.wajib.length);

  // Kombinasi yang tidak ada tetap tertutup, dan tidak ada status antara.
  for (const [m, f] of [['Matematika', 'E'], ['Bahasa Inggris', 'F'], ['', '']]) {
    const x = statusLayanan(m, f);
    assertEquals(x.kode, 'NOT_SUPPORTED');
  }
  // Hanya dua nilai yang mungkin — tidak ada "partially supported".
  const kodeSah = ['FULLY_SUPPORTED', 'NOT_SUPPORTED'];
  assert(kodeSah.includes(statusLayanan('Bahasa Inggris', 'E').kode));
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE U — tidak ada pekerjaan terselubung untuk guru
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE U: acuan tidak pernah membebankan pencarian bahan kepada guru', () => {
  // Seluruh teks acuan diperiksa. Di sinilah dulu kalimat itu berada:
  // "Guru yang ingin memenuhi sisi visual CP secara penuh perlu menambahkan
  // bahannya sendiri" — pekerjaan yang dibebankan lewat catatan, bukan lewat
  // keputusan produk.
  const teks: string[] = [];
  const kumpulkan = (v: unknown) => {
    if (typeof v === 'string') teks.push(v);
    else if (Array.isArray(v)) v.forEach(kumpulkan);
    else if (v && typeof v === 'object') Object.values(v).forEach(kumpulkan);
  };
  kumpulkan(ACUAN_CP);

  const PEKERJAAN_GURU =
    /guru[^.]{0,80}?\b(perlu|harus|perlu\s+juga|dapat|bisa)\b[^.]{0,60}?\b(mencari|membuat|menambahkan|mengunduh|melengkapi|menyediakan|menyiapkan sendiri|membeli|membawa)\b/i;
  for (const t of teks) {
    assert(!PEKERJAAN_GURU.test(t),
      `acuan membebankan pekerjaan bahan kepada guru: "${t.slice(0, 160)}"`);
  }
  // Frasa yang secara khusus pernah muncul dan tidak boleh kembali.
  for (const frasa of ['menambahkan bahannya sendiri', 'melengkapinya sendiri', 'cakupan_teks', 'sebagian terpenuhi']) {
    assert(!teks.some(t => t.includes(frasa)), `frasa terlarang muncul kembali: "${frasa}"`);
  }

  // Tidak ada status layanan "sebagian" di seluruh acuan — kalau tidak dapat
  // dilayani, yang tertutup adalah gerbangnya, bukan yang ditambal guru.
  const sah = ['dilayani', 'tidak_dilayani', 'perlu_telaah_manusia'];
  for (const fase of Object.values(ACUAN_CP.acuan)) {
    for (const acuan of Object.values(fase)) {
      for (const el of Object.values(acuan.elemen)) {
        for (const t of el.tuntutan) assert(sah.includes(t.layanan), `${t.id}: status layanan tidak sah`);
      }
    }
  }

  // Dan penyusun ATP diberi larangan yang sama secara tegas.
  const k = konteksDari(cd());
  const batas = gabung(k.batas_mutlak);
  assert(batas.includes('disusun miclass'), 'batas mutlak tidak menyatakan bahan disusun MiClass');
  assert(batas.includes('mencari, membuat, mengunduh'),
    'batas mutlak tidak melarang pembebanan bahan kepada guru');
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE V — operator "(cetak atau digital)" sudah diputuskan manusia
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE V: cetak ATAU digital — jalur cetak sendiri memenuhi penuh', () => {
  const acuan = acuanUntuk('Bahasa Inggris', 'E')!;
  const mp2 = Object.values(acuan.elemen)
    .flatMap(el => el.tuntutan).find(t => t.id === 'BIE-E25-MP-2')!;

  // (1) operatornya OR, dan itu dinyatakan — bukan disimpulkan pembaca.
  assert(/\bOR\b/.test(mp2.logika), 'operator OR tidak dinyatakan');
  assert(/cetak ATAU digital/i.test(mp2.logika));
  assert(!/\bAND\b[^.]{0,30}digital/i.test(mp2.logika), 'masih membaca cetak DAN digital');

  // (2) tidak lagi menunggu telaah manusia, dan tidak lagi menutup gerbang.
  assertEquals(mp2.status_dekomposisi, 'SAFE DECOMPOSITION');
  assertEquals(mp2.layanan, 'dilayani');

  // (3) jalur yang ditempuh adalah cetak, dan "berbagai" tidak disusutkan jadi
  //     satu jenis dokumen saja.
  assert(/cetak/i.test(mp2.cara_layanan));
  const bentuk = ['lembar presentasi', 'kartu bicara', 'handout', 'lembar informasi', 'formulir', 'selebaran'];
  const ada = bentuk.filter(b => mp2.cara_layanan.toLowerCase().includes(b));
  assert(ada.length >= 3, `hanya ${ada.length} bentuk media presentasi cetak disebut`);

  // (4) media digital TIDAK diwajibkan, dan tidak dibebankan kepada siapa pun.
  const teksMp2 = [mp2.kompetensi, mp2.lingkup_materi, mp2.logika, mp2.cara_layanan].join(' ');
  assert(!/guru[^.]{0,60}(menyediakan|membuat|mencari)[^.]{0,30}digital/i.test(teksMp2));

  // (5) keputusannya tercatat beserta dasarnya, bukan hanya hasilnya.
  assert(acuan.review_catatan!.includes('cetak atau digital'));
  assert(acuan.review_catatan!.includes('Kepka'), 'dasar otoritasnya tidak dicatat');

  // (6) dan seluruh kombinasi jadi terlayani penuh karenanya.
  assertEquals(statusLayanan('Bahasa Inggris', 'E').kode, 'FULLY_SUPPORTED');
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE W — satu anak kalimat boleh menopang lebih dari satu tuntutan
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE W: potongan sumber boleh dipakai bersama', () => {
  const acuan = acuanUntuk('Bahasa Inggris', 'E')!;
  const semua = Object.values(acuan.elemen).flatMap(el => el.tuntutan);

  // (1) benar-benar ada yang berbagi — dan itu SAH, bukan cacat.
  const perSumber = new Map<string, string[]>();
  for (const t of semua) {
    perSumber.set(t.sumber_cp, [...(perSumber.get(t.sumber_cp) ?? []), t.id]);
  }
  const berbagi = [...perSumber.values()].filter(ids => ids.length > 1);
  assert(berbagi.length >= 3, `hanya ${berbagi.length} anak kalimat yang dipakai bersama`);

  // (2) pasangan yang memang harus berbagi memang berbagi.
  const sumberDari = (id: string) => semua.find(t => t.id === id)!.sumber_cp;
  assertEquals(sumberDari('BIE-E25-MB-2'), sumberDari('BIE-E25-MB-3'));
  assertEquals(sumberDari('BIE-E25-MM-1'), sumberDari('BIE-E25-MM-2'));
  assertEquals(sumberDari('BIE-E25-MP-4'), sumberDari('BIE-E25-MP-5'));

  // (3) berbagi TIDAK menggagalkan ketertelusuran: setiap potongan tetap
  //     verbatim, dan gabungannya tetap menutupi cp_normatif (CASE N).
  for (const [id, el] of Object.entries(acuan.elemen)) {
    for (const t of el.tuntutan) {
      assert(el.cp_normatif.includes(t.sumber_cp), `${t.id}: sumber tidak verbatim di ${id}`);
    }
  }

  // (4) MM-1 kini dapat membuktikan SELURUH lingkupnya, bukan hanya verbanya.
  //     Di Pass 3 potongannya berhenti di "Memahami alur informasi secara
  //     keseluruhan," sehingga genre, moda, dan topik tidak punya sumber.
  const mm1 = semua.find(t => t.id === 'BIE-E25-MM-1')!;
  for (const bagian of ['fiksi dan non fiksi', 'tertulis atau teks multimodal', 'topik sehari-hari atau isu terkini']) {
    assert(mm1.sumber_cp.includes(bagian), `MM-1: "${bagian}" tidak tertelusur ke sumber`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE X — tidak ada verba kompetensi yang dikarang
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE X: verba kompetensi selalu berasal dari sumbernya', () => {
  const acuan = acuanUntuk('Bahasa Inggris', 'E')!;
  const semua = Object.values(acuan.elemen).flatMap(el => el.tuntutan);

  // (1) MP-3 lama TIDAK ADA LAGI. Verbanya, "menghasilkan", tidak pernah ada
  //     di CP; ia tuntutan yang lahir dari penguraian, bukan dari sumber.
  assertEquals(semua.filter(t => t.id === 'BIE-E25-MP-3').length, 0);
  for (const t of semua) {
    assert(!/^menghasilkan\b/i.test(t.kompetensi),
      `${t.id}: verba "menghasilkan" tidak ada di CP`);
  }

  // (2) mutu keluaran itu kini menjadi SYARAT di MP-1, bukan kompetensi
  //     tersendiri — dan syaratnya tetap utuh, tidak hilang saat digabung.
  const mp1 = semua.find(t => t.id === 'BIE-E25-MP-1')!;
  for (const syarat of ['mencapai tujuan tertentu', 'struktur teks', 'unsur kebahasaan']) {
    assert(mp1.kompetensi.includes(syarat), `MP-1 kehilangan syarat "${syarat}"`);
  }
  assert(/KUMULATIF/i.test(mp1.logika), 'MP-1 tidak menyatakan mutu keluaran sebagai syarat kumulatif');

  // (3) verba pertama tiap kompetensi wajib muncul di sumbernya. Dibandingkan
  //     pada akar kata: CP menulis "Mengomunikasikan"/"Memahami" berawalan
  //     kapital di awal kalimat, dan kompetensi menuliskannya huruf kecil.
  for (const t of semua) {
    const verba = t.kompetensi.trim().split(/\s+/)[0].toLowerCase();
    assert(t.sumber_cp.toLowerCase().includes(verba),
      `${t.id}: verba "${verba}" tidak ada di sumber_cp`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE Y — konteks elemen diwarisi, bukan ditambahkan ke rumusan
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE Y: pemecahan atomik tidak menambah keterangan yang tak ada di sumber', () => {
  const acuan = acuanUntuk('Bahasa Inggris', 'E')!;
  const semua = Object.values(acuan.elemen).flatMap(el => el.tuntutan);
  const cari = (id: string) => semua.find(t => t.id === id)!;

  // (1) lingkup MB-2/MB-3 persis seperti CP: "topik yang dibahas" — TANPA
  //     "di kelas", yang di Pass 3 ditambahkan dan tidak ada di sumber.
  for (const id of ['BIE-E25-MB-2', 'BIE-E25-MB-3']) {
    assertEquals(cari(id).lingkup_materi, 'topik yang dibahas');
  }

  // (2) moda TIDAK ditulis seolah bagian rumusan tuntutan.
  for (const id of ['BIE-E25-MB-2', 'BIE-E25-MB-3']) {
    assert(!/secara lisan/i.test(cari(id).kompetensi), `${id}: moda ditulis di kompetensi`);
  }
  for (const id of ['BIE-E25-MP-4', 'BIE-E25-MP-5']) {
    assert(!/secara tertulis|melalui penyajian/i.test(cari(id).kompetensi),
      `${id}: moda ditulis di kompetensi`);
  }

  // (3) modanya tetap diketahui sistem — diwarisi dari elemen, dan dinyatakan
  //     di logika_elemen serta di logika tuntutan, bukan dikarang jadi sumber.
  assert(/lisan/i.test(acuan.elemen.menyimak_berbicara.logika_elemen));
  assert(/diwarisi/i.test(cari('BIE-E25-MB-2').logika));
  assert(/diwarisi/i.test(cari('BIE-E25-MP-4').logika));

  // (4) lingkup MP-4/MP-5 persis seperti CP.
  for (const id of ['BIE-E25-MP-4', 'BIE-E25-MP-5']) {
    assertEquals(cari(id).lingkup_materi, 'topik sehari-hari atau isu terkini');
  }

  // (5) SETIAP kata isi di kompetensi dan lingkup_materi wajib ada di sumbernya.
  //     Inilah jaring yang menangkap "di kelas", "secara lisan", dan
  //     "menghasilkan" sekaligus, tanpa harus menghafal daftarnya.
  const ABAIKAN = new Set(['yang', 'dan', 'atau', 'dalam', 'untuk', 'dengan', 'pada', 'dari', 'tentang', 'secara', 'mereka', 'serta']);
  for (const t of semua) {
    const sumber = t.sumber_cp.toLowerCase();
    for (const teks of [t.kompetensi, t.lingkup_materi]) {
      for (const kata of teks.toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/\s+/)) {
        if (kata.length < 4 || ABAIKAN.has(kata)) continue;
        assert(sumber.includes(kata),
          `${t.id}: kata "${kata}" tidak ada di sumber_cp — keterangan yang ditambahkan`);
      }
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CASE Z — layanan hanya terbuka setelah peninjauan diterima
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('CASE Z: fixture identik, hanya review_status yang berbeda', () => {
  const buat = (review_status: string) => ({
    status: 'tersedia', versi_cp: VERSI_CP_BERLAKU,
    sumber_regulasi: 'Keputusan Kepala BSKAP Nomor 046/H/KR/2025',
    ditetapkan: '2025-07-16', review_status,
    elemen: {
      e1: {
        label: 'E1', cp_normatif: 'a b', logika_elemen: 'AND kumulatif',
        tuntutan: [{
          id: 'Z-1', kompetensi: 'k', lingkup_materi: 'l', sumber_cp: 'a b',
          status_dekomposisi: 'SAFE DECOMPOSITION', logika: 'AND',
          layanan: 'dilayani' as const, cara_layanan: 'seluruhnya disusun MiClass tanpa bahan tambahan',
        }],
      },
    },
  });

  // Cakupan layanannya IDENTIK di kedua fixture — yang membedakan hanya
  // peninjauan. Kode tidak boleh mengklaim validasi manusia yang belum terjadi.
  assert(cakupanLayanan(buat('pending')).penuh);
  assert(cakupanLayanan(buat('diterima')).penuh);

  // Keadaan nyata membuktikan kedua arahnya sekaligus: Bahasa Inggris Fase E
  // ditinjau dan diterima, dan karena itu — dan hanya karena itu ditambah
  // cakupan penuh — gerbangnya terbuka.
  const acuan = acuanUntuk('Bahasa Inggris', 'E')!;
  assertEquals(acuan.review_status, 'diterima');
  assertEquals(statusLayanan('Bahasa Inggris', 'E').kode, 'FULLY_SUPPORTED');

  // Sebaliknya, penguraian yang belum ditinjau tidak boleh membuka layanan,
  // sebanyak apa pun tuntutannya terlayani.
  const belum = { ...acuan, review_status: 'pending' };
  const alasanBelum: string[] = [];
  if (belum.review_status !== 'diterima') alasanBelum.push('belum ditinjau');
  assertEquals(alasanBelum.length, 1);
  assert(cakupanLayanan(belum).penuh, 'cakupannya penuh — yang menahan hanyalah peninjauan');

  // Dan penerimaan itu HANYA untuk satu kombinasi.
  const diterima: string[] = [];
  for (const [mapel, fase] of Object.entries(ACUAN_CP.acuan)) {
    for (const [kunciFase, a] of Object.entries(fase)) {
      if (a.review_status === 'diterima') diterima.push(`${mapel}/${kunciFase}`);
    }
  }
  assertEquals(diterima, ['bahasa_inggris/fase_e']);
});

Deno.test('ARITMETIKA: syarat yang mustahil dipenuhi tidak pernah dibuat', () => {
  // Pengurang cadangan selalu dalam MINGGU, sehingga selalu kelipatan JP per
  // minggu. Sisa yang tidak cukup satu pertemuan dilaporkan, bukan disembunyikan.
  for (const jpm of [2, 3, 4, 5, 6, 8]) {
    for (const sesi of [1, 2, 3, 4]) {
      if (sesi > jpm) continue;
      const a = hitungAlokasi(cd({ WAKTU: {
        tahun_pelajaran: '2026/2027', jp_per_minggu: jpm, durasi_jp: '45',
        pola_jadwal: 'reguler_bagi', jp_per_sesi: sesi,
        minggu_efektif_mode: 'isi_sendiri', minggu_sem1: 17, minggu_sem2: 15,
        cadangan_minggu: '2', konfirmasi_waktu: 'ya' } }));
      assertEquals(a.jp_operasional % a.satuan_pertemuan, 0,
        `jp_operasional tidak habis dibagi satuan untuk ${jpm} JP/minggu, sesi ${sesi}`);
      assertEquals(
        a.anggaran_semester.reduce((s, x) => s + x.jp, 0), a.jp_operasional);
      for (const x of a.anggaran_semester) assertEquals(x.jp % a.satuan_pertemuan, 0);
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PASS 5 — AA sampai AJ: koreksi berbasis bukti semantic test
// ═════════════════════════════════════════════════════════════════════════════
//
// Setiap kasus di bawah menutup satu defect yang TERBUKTI di
// docs/ATP-SEMANTIC-GENERATION-REPORT.md, dan gagal kalau defect itu kembali.

import {
  parseKeluaranModel, pesanPerbaikanAtp, susunDenganSatuPerbaikan,
  bangunSyaratValidasi, prioritasDipilih, MAKS_TUNTUTAN_PER_TP, PENGARUH_PRIORITAS,
  LABEL_PRIORITAS,
} from '../supabase/functions/generate-atp/kontrak.ts';

const WAJIB_OBJ_BI = tuntutanWajib(acuanUntuk('Bahasa Inggris', 'E'));
const TUNTUTAN_BERKATEGORI = WAJIB_OBJ_BI.filter(w => w.t.cakupan_wajib?.kategori_teks?.length).map(w => w.id);

/** Syarat validasi versi Pass 5, dibangun fungsi PRODUKSI yang sama dengan EF. */
function syaratP5(data: Record<string, unknown>, target = 12) {
  const alokasi = hitungAlokasi(data);
  const delegasi = resolveDelegasi(data);
  const dasar = dasarTersedia(data, { program_keahlian: 'Busana', jumlah_murid: 28 }, WAJIB_BI);
  return bangunSyaratValidasi({
    alokasi, target_tp: target, elemen: ELEMEN_BI, wajib: WAJIB_OBJ_BI,
    delegasi, dasar_tersedia: dasar, prioritas: prioritasDipilih(data),
    // Dibaca dari data yang sama seperti di produksi — bukan diberikan
    // terpisah, supaya aturan progresi kesiapan menyala di uji persis pada
    // kondisi ia menyala bagi guru.
    kesiapan: String((data.PROFIL_SISWA as Record<string, unknown> | undefined)?.tingkat_kemampuan_awal ?? ''),
  });
}

/** ATP sah bentuk Pass 5: tanpa `tipe`, dengan kategori_teks lengkap. */
function tpKanonik(data: Record<string, unknown>, n = 12): TpEntry[] {
  return atpSah(hitungAlokasi(data), n).map(tp => ({
    ...tp,
    ...((tp.tuntutan ?? []).some(t => TUNTUTAN_BERKATEGORI.includes(t)) ? { kategori_teks: ['fiksi', 'nonfiksi'] } : {}),
  }));
}

function keluaranKanonik(data: Record<string, unknown>, n = 12) {
  return {
    keputusan_didelegasikan: [] as unknown[],
    penerapan_prioritas: prioritasDipilih(data).map(p => ({
      prioritas: p.prioritas, tp: [1], pengaruh: ['konteks'],
      alasan: 'TP 1 memakai dokumen kerja nyata dari program keahlian kelas ini sebagai bacaannya.',
    })),
    tp: tpKanonik(data, n),
  };
}

function sumberSystemPrompt(ef: string): string {
  const i = ef.indexOf('const SYSTEM_PROMPT =');
  const j = ef.indexOf("pelanggaran aturan.';", i);
  assert(i >= 0 && j > i, 'SYSTEM_PROMPT tidak ditemukan di index.ts');
  return ef.slice(i, j);
}

const BACA_EF = () => Deno.readTextFile(new URL('../supabase/functions/generate-atp/index.ts', import.meta.url));

Deno.test('AA: parser membaca objek utuh berisi dua atau tiga array — SEM-001', () => {
  const data = cd();
  const obj = keluaranKanonik(data);

  // (1) tiga array — bentuk kanonik Pass 5 — dibaca UTUH.
  const tiga = parseKeluaranModel(JSON.stringify(obj, null, 2));
  assertEquals(tiga, obj);

  // (2) dua array — persis bentuk yang dipatahkan extractJson() lama.
  const dua = { keputusan_didelegasikan: [{ question_id: 'A17', pilihan: 'kerja', alasan: 'x', dasar: ['a', 'b'] }], tp: obj.tp };
  assertEquals(parseKeluaranModel(JSON.stringify(dua, null, 2)), dua);

  // (3) dibungkus satu code fence — dengan maupun tanpa label json.
  assertEquals(parseKeluaranModel('```json\n' + JSON.stringify(obj) + '\n```'), obj);
  assertEquals(parseKeluaranModel('```\n' + JSON.stringify(obj) + '\n```'), obj);

  // (4) dan keluaran kanonik itu lolos validator Pass 5.
  const v = validasiAtp(tiga, syaratP5(data));
  assert(v.valid, v.errors.join('; '));
});

Deno.test('AB: array historis tetap dibaca; yang bukan satu dokumen JSON ditolak', () => {
  const data = cd();
  const arr = atpSah(hitungAlokasi(data), 12);

  // (1) array lama — fenced maupun tidak — tetap terbaca.
  assertEquals(parseKeluaranModel(JSON.stringify(arr)), arr);
  assertEquals(parseKeluaranModel('```json\n' + JSON.stringify(arr) + '\n```'), arr);
  const { penerapan } = pisahkanKeluaran(arr);
  assertEquals(penerapan, null);

  // (2) ditolak: rusak, dua dokumen, narasi di depan atau di belakang.
  for (const [nama, teks] of [
    ['rusak', '{"tp": [1, 2,'],
    ['dua dokumen', JSON.stringify({ tp: [] }) + '\n' + JSON.stringify({ tp: [] })],
    ['dua array', '[1]\n[2]'],
    ['narasi di belakang', JSON.stringify({ tp: [] }) + '\nSemoga membantu!'],
    ['narasi di depan', 'Berikut ATP-nya:\n' + JSON.stringify({ tp: [] })],
    ['kosong', '   '],
    ['dua fence', '```json\n{"tp":[]}\n```\n```json\n{"tp":[]}\n```'],
  ] as const) {
    let lolos = false;
    try { parseKeluaranModel(teks); lolos = true; } catch { /* diharapkan */ }
    assert(!lolos, `parser menerima "${nama}"`);
  }
});

Deno.test('AC: perbaikan selalu meminta satu objek kanonik — SEM-002', async () => {
  const data = cdDelegasi({ PENGUATAN_PRASYARAT: { strategi_prasyarat: 'terintegrasi', target_prioritas: ['pkl_kerja'] } });
  const s = syaratP5(data);
  for (const masalah of [['[J1] keluaran bukan satu dokumen JSON yang sah'], ['[W6] sum salah', '[D2] A17 tidak dijawab']]) {
    const pesan = pesanPerbaikanAtp(masalah, s);
    for (const kunci of ['"keputusan_didelegasikan"', '"penerapan_prioritas"', '"tp"']) {
      assert(pesan.includes(kunci), `pesan perbaikan tidak meminta ${kunci}`);
    }
    assert(!/array TP/i.test(pesan), 'pesan perbaikan masih meminta array TP');
    for (const m of masalah) assert(pesan.includes(m), `masalah "${m}" tidak dibawa ke perbaikan`);
    assert(pesan.includes('A17') && pesan.includes('A19'), 'keputusan terbuka tidak diingatkan');
    assert(pesan.includes('pkl_kerja'), 'prioritas wajib tidak diingatkan');
  }
  // Tidak ada lagi teks perbaikan lain di Edge Function yang bisa meminta array.
  const ef = await BACA_EF();
  assert(!/HANYA JSON array/i.test(ef), 'index.ts masih memuat perintah "HANYA JSON array"');
});

Deno.test('AD: satu permintaan guru paling banyak dua panggilan model', async () => {
  const data = cd();
  const s = syaratP5(data);
  const baik = JSON.stringify(keluaranKanonik(data));
  const salahValidasi = JSON.stringify({ ...keluaranKanonik(data), tp: [] });

  async function jalan(jawaban: string[]) {
    let n = 0;
    const h = await susunDenganSatuPerbaikan(async () => jawaban[Math.min(n++, jawaban.length - 1)], 'pesan', s);
    return { h, n };
  }
  // pertama sah → 1 panggilan
  let r = await jalan([baik]);
  assertEquals([r.n, r.h.status, r.h.ok], [1, 'FIRST_PASS', true]);
  // JSON rusak lalu sah → 2 panggilan, dan masalah parse ikut ke perbaikan
  r = await jalan(['bukan json', baik]);
  assertEquals([r.n, r.h.status, r.h.ok], [2, 'REPAIRED_ONCE', true]);
  assert(r.h.pesan_perbaikan!.includes('[J1]'));
  // gagal validasi lalu sah
  r = await jalan([salahValidasi, baik]);
  assertEquals([r.n, r.h.status], [2, 'REPAIRED_ONCE']);
  // gagal terus — parse maupun validasi — BERHENTI di 2, tidak pernah 3
  for (const terus of [['bukan json'], [salahValidasi], ['bukan json', salahValidasi], [salahValidasi, 'bukan json']]) {
    r = await jalan(terus);
    assertEquals([r.n, r.h.status, r.h.ok], [2, 'FAILED_AFTER_REPAIR', false], `urutan ${terus.join(' → ')}`);
  }

  // Edge Function memakai orkestrator itu, dan tidak punya jalur perbaikan kedua.
  const ef = await BACA_EF();
  assert(ef.includes('susunDenganSatuPerbaikan('), 'index.ts tidak memakai orkestrator satu-perbaikan');
  assert(!ef.includes("'perbaikan-2'"), 'index.ts masih punya perbaikan kedua');
  assert(!/extractJson\s*\(/.test(ef.replace(/^\s*\/\/.*$/gm, '')), 'extractJson masih dipanggil');
  // Satu definisi + SATU tempat pemanggilan (di dalam orkestrator).
  assertEquals((ef.match(/\bcallAI\(/g) ?? []).length, 2, 'callAI dipanggil di lebih dari satu tempat');
});

Deno.test('AE: TP baru tidak lagi dikelompokkan prasyarat/pengayaan — SEM-003, SEM-009', async () => {
  const sp = sumberSystemPrompt(await BACA_EF());
  assert(!sp.includes('"tipe"'), 'SYSTEM_PROMPT masih meminta field tipe');
  assert(!/"prasyarat"\s*\|\s*"pengayaan"|"inti"\|/.test(sp), 'SYSTEM_PROMPT masih menawarkan enum tipe');

  const data = cd();
  // (1) keluaran tanpa tipe sah.
  const tanpa = keluaranKanonik(data);
  assert(tanpa.tp.every(t => !('tipe' in t)));
  assert(validasiAtp(tanpa, syaratP5(data)).valid);

  // (2) kalau model tetap menulisnya, ia dibuang dari ATP baru dan dicatat.
  const dengan = keluaranKanonik(data);
  (dengan.tp[8] as TpEntry).tipe = 'pengayaan';
  const v = validasiAtp(dengan, syaratP5(data));
  assert(v.valid, v.errors.join('; '));
  assert(v.entries.every(t => !('tipe' in t)), 'tipe lama ikut tersimpan di ATP baru');
  assert(v.peringatan.some(p => p.startsWith('[S4-legacy]')));

  // (3) ATP historis yang memilikinya tetap dibaca validator lama apa adanya.
  const lama = atpSah(hitungAlokasi(data), 12).map(t => ({ ...t, tipe: 'inti' as const }));
  const vl = validasiAtp(lama, syaratDari(hitungAlokasi(data), 12));
  assert(vl.valid && vl.entries.every(t => t.tipe === 'inti'));
});

Deno.test('AF: paling banyak dua tuntutan CP per TP', () => {
  assertEquals(MAKS_TUNTUTAN_PER_TP, 2);
  const data = cd();
  const dua = keluaranKanonik(data);
  dua.tp[9].tuntutan = ['BIE-E25-MB-1', 'BIE-E25-MB-2'];
  const v2 = validasiAtp(dua, syaratP5(data));
  assert(!v2.errors.some(e => e.startsWith('[K2]')), v2.errors.join('; '));

  const tiga = keluaranKanonik(data);
  tiga.tp[9].tuntutan = ['BIE-E25-MP-2', 'BIE-E25-MP-4', 'BIE-E25-MP-5'];
  const v3 = validasiAtp(tiga, syaratP5(data));
  assert(v3.errors.some(e => e.startsWith('[K2]') && e.includes('TP 10')), v3.errors.join('; '));
  // ID ganda tidak dihitung dua kali.
  const ganda = keluaranKanonik(data);
  ganda.tp[9].tuntutan = ['BIE-E25-MB-1', 'BIE-E25-MB-1', 'BIE-E25-MB-2'];
  assert(!validasiAtp(ganda, syaratP5(data)).errors.some(e => e.startsWith('[K2]')));
});

Deno.test('AG: pilihan eksplisit A17 memegang porsi konteks — SEM-004', () => {
  const kunciLama = 'pakai kosakata, situasi, dokumen kerja';
  for (const pilihan of ['kehidupan', 'kerja', 'seimbang']) {
    const k = konteksDari(cd({ KONTEKS_DUDI: { konteks_tugas: pilihan, situasi_khusus: 'tidak_ada', metode_pengurutan: 'scaffolding' } }));
    const kej = gabung(k.konteks_kejuruan);
    assert(!kej.includes(kunciLama), `${pilihan}: perintah kerja tanpa syarat masih ada`);
    assert(kej.includes('tidak menentukan berapa banyak tp yang berlatar kerja'));
    assert(kej.includes('keputusan guru'), `${pilihan}: pilihan guru tidak dinyatakan sebagai keputusan`);
  }
  const hidup = gabung(konteksDari(cd({ KONTEKS_DUDI: { konteks_tugas: 'kehidupan', situasi_khusus: 'tidak_ada', metode_pengurutan: 'scaffolding' } })).konteks_kejuruan);
  assert(hidup.includes('mayoritas tp berlatar kehidupan sehari-hari'));
  assert(hidup.includes('minoritas'));
  // Program keahlian tetap mengontekstualkan: namanya tetap sampai ke penyusun.
  assert(hidup.includes('busana'));
});

Deno.test('AH: setiap penekanan guru wajib punya jejak ke TP nyata — SEM-007', () => {
  const data = cd({ PENGUATAN_PRASYARAT: { strategi_prasyarat: 'terintegrasi', alokasi_prasyarat: 'menyatu', target_prioritas: ['pkl_kerja', 'kemampuan_dasar', 'tidak_ada'] } });
  const s = syaratP5(data);
  assertEquals(s.prioritas_wajib!.map(p => p.prioritas), ['pkl_kerja', 'kemampuan_dasar']);

  const sah = keluaranKanonik(data);
  const v = validasiAtp(sah, s);
  assert(v.valid, v.errors.join('; '));
  // Tersimpan sebagai frasa manusia, tidak ada kunci mesin untuk layar/DOCX.
  assertEquals(v.penerapan.map(p => p.prioritas), [LABEL_PRIORITAS.pkl_kerja, LABEL_PRIORITAS.kemampuan_dasar]);
  assert(v.penerapan.every(p => p.pengaruh.every(x => Object.values(PENGARUH_PRIORITAS).includes(x))));

  const tolak = (ubah: (o: ReturnType<typeof keluaranKanonik>) => void, kode: string) => {
    const o = keluaranKanonik(data); ubah(o);
    const h = validasiAtp(o, s);
    assert(h.errors.some(e => e.startsWith(`[${kode}]`)), `${kode} tidak menangkap: ${h.errors.join('; ')}`);
  };
  tolak(o => { o.penerapan_prioritas.pop(); }, 'P2');                                   // satu hilang
  tolak(o => { o.penerapan_prioritas.push({ ...o.penerapan_prioritas[0], prioritas: 'pendidikan_lanjut' }); }, 'P1'); // dikarang
  tolak(o => { o.penerapan_prioritas.push({ ...o.penerapan_prioritas[0] }); }, 'P1');  // ganda
  tolak(o => { o.penerapan_prioritas[0].tp = [99]; }, 'P3');                           // TP tidak ada
  tolak(o => { o.penerapan_prioritas[0].tp = []; }, 'P3');                             // kosong
  tolak(o => { o.penerapan_prioritas[0].pengaruh = ['rahasia']; }, 'P4');              // di luar allowlist
  tolak(o => { o.penerapan_prioritas[0].alasan = 'ya'; }, 'P4');                       // alasan kosong
  tolak(o => { delete (o as Record<string, unknown>).penerapan_prioritas; }, 'P2');    // tidak ada sama sekali

  // Tanpa penekanan yang dipilih, daftar kosong sah.
  const tanpa = cd({ PENGUATAN_PRASYARAT: { strategi_prasyarat: 'terintegrasi', alokasi_prasyarat: 'menyatu', target_prioritas: ['tidak_ada'] } });
  assert(validasiAtp(keluaranKanonik(tanpa), syaratP5(tanpa)).valid);
});

Deno.test('AI: 9/9 ID belum cukup — kategori fiksi DAN nonfiksi wajib tercakup — SEM-006', () => {
  // (0) sumbernya metadata acuan, bukan daftar ID di validator.
  assertEquals([...TUNTUTAN_BERKATEGORI].sort(), ['BIE-E25-MB-1', 'BIE-E25-MM-1', 'BIE-E25-MM-2', 'BIE-E25-MP-1']);
  const data = cd();
  const s = syaratP5(data);
  const mm1 = (o: ReturnType<typeof keluaranKanonik>) => o.tp.filter(t => t.tuntutan!.includes('BIE-E25-MM-1'));

  // hanya fiksi → gagal; hanya nonfiksi → gagal
  for (const satu of [['fiksi'], ['nonfiksi']]) {
    const o = keluaranKanonik(data);
    mm1(o).forEach(t => { t.kategori_teks = satu; });
    const h = validasiAtp(o, s);
    assert(h.errors.some(e => e.startsWith('[C6]') && e.includes('BIE-E25-MM-1')), `${satu}: ${h.errors.join('; ')}`);
  }
  // keduanya dalam satu TP → lolos
  const satuTp = keluaranKanonik(data);
  assert(validasiAtp(satuTp, s).valid);
  // gabungan dua TP → lolos
  const duaTp = keluaranKanonik(data);
  const t4 = mm1(duaTp)[0];
  t4.kategori_teks = ['fiksi'];
  const lain = duaTp.tp.find(t => t.tuntutan!.length === 1 && !TUNTUTAN_BERKATEGORI.includes(t.tuntutan![0]))!;
  lain.tuntutan!.push('BIE-E25-MM-1');
  lain.kategori_teks = ['nonfiksi'];
  const hDua = validasiAtp(duaTp, s);
  assert(hDua.valid, hDua.errors.join('; '));
  // TP yang melayani tuntutan berkategori tanpa menyebut kategorinya → gagal
  const tanpa = keluaranKanonik(data);
  delete mm1(tanpa)[0].kategori_teks;
  assert(validasiAtp(tanpa, s).errors.some(e => e.startsWith('[C7]')));
  // nilai di luar allowlist → gagal
  const aneh = keluaranKanonik(data);
  mm1(aneh)[0].kategori_teks = ['puisi'];
  assert(validasiAtp(aneh, s).errors.some(e => e.startsWith('[C7]')));
});

Deno.test('AJ: detail bentuk media Modul tidak dikirim ke penyusun ATP — SEM-008', async () => {
  const k = konteksDari(cd());
  const kirim = JSON.stringify(k).toLowerCase();
  for (const bentuk of ['cara_layanan', 'kartu bicara', 'handout', 'selebaran', 'lembar presentasi', 'lembar informasi']) {
    assert(!kirim.includes(bentuk), `"${bentuk}" masih dikirim ke penyusun ATP`);
  }
  // Sumbernya TIDAK dihapus dari acuan — ia masih dipakai audit layanan (CASE V).
  const mp2 = WAJIB_OBJ_BI.find(w => w.id === 'BIE-E25-MP-2')!;
  assert(mp2.t.cara_layanan.toLowerCase().includes('kartu bicara'));
  // cakupan_wajib ikut terkirim, supaya penyusun tahu yang kumulatif.
  assertEquals(k.cp_anchor.tuntutan.filter(t => t.cakupan_wajib).map(t => t.id).sort(), [...TUNTUTAN_BERKATEGORI].sort());
  // User message EF membawa daftar prioritas wajib.
  const ef = await BACA_EF();
  assert(ef.includes('penerapan_prioritas_wajib: konteks.penerapan_prioritas_wajib'));
});

// ═════════════════════════════════════════════════════════════════════════════
// FINAL HARDENING — AK (RT-001) dan AL (RT-002/RT-003)
// ═════════════════════════════════════════════════════════════════════════════

import { sebabKetergantungan } from '../supabase/functions/generate-atp/kontrak.ts';

/** Validasi satu judul lewat validator produksi penuh, bukan fungsi pembantu saja. */
function b1Untuk(judul: string, konteks?: string[], catatan?: string): string[] {
  const data = cd();
  const o = keluaranKanonik(data);
  o.tp[0].judul = judul;
  if (konteks) o.tp[0].konteks = konteks;
  if (catatan) o.tp[0].catatan = catatan;
  return validasiAtp(o, syaratP5(data)).errors.filter(e => e.startsWith('[B1]'));
}

Deno.test('AK: validator menjaga ketergantungan, bukan topik — RT-001', () => {
  // AK1 — magang sebagai isi teks: LOLOS (persis judul S3 yang dulu ditolak)
  assertEquals(b1Untuk('Menulis cerita fiksi pengalaman magang menggunakan media presentasi cetak'), []);
  // AK2 — magang sebagai syarat: DITOLAK
  assert(b1Untuk('Melakukan magang di perusahaan untuk menulis laporan pengalaman kerja').length === 1);
  // AK3 — kunjungan luar sebagai syarat: DITOLAK
  assert(b1Untuk('Mengunjungi bengkel industri untuk mengamati pelayanan pelanggan').length === 1);
  // AK4 — teks tentang magang yang MiClass sediakan: LOLOS
  assertEquals(b1Untuk('Membaca laporan pengalaman peserta magang dan menyimpulkan informasi'), []);
  // AK5 — wawancara praktisi luar: DITOLAK
  assert(b1Untuk('Mewawancarai praktisi industri untuk memperoleh informasi').length === 1);

  // Tambahan: contoh BOLEH dari peninjau lolos; bermain peran bukan wawancara sungguhan.
  for (const boleh of [
    'Menyimak dialog antara peserta magang dan supervisor di bengkel',
    'Menganalisis kasus fiktif di tempat magang dan menyimpulkan masalahnya',
    'Membaca artikel mengenai pengalaman PKL dan menyimpulkan pesan penulis',
    'Bermain peran mewawancarai narasumber tentang tren busana',
  ]) assertEquals(b1Untuk(boleh), [], `salah tuduh: "${boleh}"`);

  // Tambahan: contoh DILARANG dari peninjau tetap ditolak, juga lewat konteks/catatan.
  for (const larang of [
    'Menjalani magang di butik lalu menceritakan hasilnya',
    'Mengikuti kunjungan ke pabrik garmen dan mencatat prosesnya',
    'Menghadirkan narasumber dari industri untuk berbagi pengalaman',
  ]) assert(b1Untuk(larang).length === 1, `lolos padahal menuntut kegiatan luar: "${larang}"`);
  assert(b1Untuk('Menulis laporan singkat', undefined, 'murid mengunjungi usaha jahit di sekitar sekolah').length === 1);

  // Fungsi pembantu dan validator memberi sebab yang sama.
  assertEquals(sebabKetergantungan('Mewawancarai praktisi industri untuk memperoleh informasi'), 'kunjungan atau narasumber');
  assertEquals(sebabKetergantungan('Menulis cerita fiksi pengalaman magang menggunakan media presentasi cetak'), null);
});

Deno.test('AL: bentuk media Modul tidak diminta di ATP; judul untuk guru — RT-002, RT-003', async () => {
  // AL1 — user message tidak membawa contoh bentuk media dari cara_layanan.
  const kirim = JSON.stringify(konteksDari(cd())).toLowerCase();
  const mp2 = WAJIB_OBJ_BI.find(w => w.id === 'BIE-E25-MP-2')!;
  const contoh = ['lembar presentasi', 'kartu bicara', 'handout', 'lembar informasi', 'selebaran'];
  for (const c of contoh) {
    assert(mp2.t.cara_layanan.toLowerCase().includes(c), `fixture: "${c}" tidak ada di cara_layanan`);
    assert(!kirim.includes(c), `"${c}" dari cara_layanan terkirim ke penyusun ATP`);
  }

  // AL1b — aturannya meliputi judul, konteks, DAN catatan; di prompt dan di batas mutlak.
  const sp = sumberSystemPrompt(await BACA_EF()).toLowerCase();
  assert(/judul, di konteks, dan di catatan/.test(sp), 'aturan media tidak meliputi konteks dan catatan');
  assert(sp.includes('dipilih dan dibuat lengkap pada modul ajar'));
  const batas = gabung(konteksDari(cd()).batas_mutlak);
  assert(batas.includes('judul, konteks, maupun catatan'), 'batas mutlak media tidak meliputi konteks/catatan');

  // AL2 — BUKAN blacklist: konteks yang menyebut "lembar informasi produk" tidak
  // menggagalkan ATP. Penjaganya ada di sumber (prompt), bukan regex.
  const data = cd();
  const o = keluaranKanonik(data);
  o.tp[6].konteks = ['lembar informasi produk'];
  const v = validasiAtp(o, syaratP5(data));
  assert(v.valid, v.errors.join('; '));

  // RT-003 — aturan bahasa, bukan gerbang: judul yang memuat kata fiksi/nonfiksi tetap sah,
  // dan prompt menyatakan kategori_teks sebagai tempat informasinya.
  const f = keluaranKanonik(data);
  f.tp[0].judul = 'Membaca cerita fiksi ilmiah tentang busana masa depan';
  assert(validasiAtp(f, syaratP5(data)).valid);
  // Frasa diambil utuh dari satu baris string sumber (teks sumber, bukan string hasil gabungan).
  assert(sp.includes('label metadata "fiksi"/"nonfiksi" hanya untuk membuktikan kategori'),
    'aturan bahasa judul RT-003 tidak ada di prompt');
});

// ═════════════════════════════════════════════════════════════════════════════
// AM — PROGRESI KESIAPAN: jaminan, bukan harapan
// ═════════════════════════════════════════════════════════════════════════════
//
// Menutup satu mode kegagalan yang TERBUKTI berulang di
// docs/ATP-READINESS-ROBUSTNESS-REPORT.md: pada kesiapan `jauh_di_bawah`
// penyusun kadang menggabungkan "mengungkapkan pendapat" dengan "mempertahankan
// argumen" dalam satu TP dan memajukannya ke Semester 1, padahal baseline yang
// muridnya lebih siap justru memisahkan keduanya dan menundanya ke Semester 2.
//
// AM7 menjaga arah sebaliknya: aturan ini kebijakan untuk satu kondisi ekstrem,
// BUKAN aturan universal Bahasa Inggris. Kesiapan lain tidak boleh terkunci.

const JAUH = { PROFIL_SISWA: { tingkat_kemampuan_awal: 'jauh_di_bawah' } };

/** Memindahkan tuntutan ke TP tertentu, lalu menambal TP yang jadi kosong
 *  supaya yang diuji benar-benar RDS — bukan C3 yang kebetulan ikut menyala. */
function taruh(o: { tp: TpEntry[] }, penempatan: Record<string, number>) {
  const tujuan = new Set(Object.values(penempatan).map(n => n - 1));
  const dipindah = new Set(Object.keys(penempatan));

  // TP tujuan diisi PERSIS tuntutan yang diminta. Tuntutan lain yang kebetulan
  // menempatinya tergusur, dan dicarikan rumah baru di bawah — kalau tidak,
  // K2 (tiga tuntutan) atau C5 (tuntutan hilang) yang menyala, bukan RDS.
  const tergusur: string[] = [];
  o.tp.forEach((tp, i) => {
    const punya = (Array.isArray(tp.tuntutan) ? tp.tuntutan : []).map(String);
    if (tujuan.has(i)) {
      tergusur.push(...punya.filter(x => !dipindah.has(x)));
      tp.tuntutan = [];
    } else {
      tp.tuntutan = punya.filter(x => !dipindah.has(x));
    }
  });
  for (const [id, nomor] of Object.entries(penempatan)) {
    o.tp[nomor - 1].tuntutan = [...(o.tp[nomor - 1].tuntutan ?? []), id];
  }

  /** Menaruh satu tuntutan di TP mana pun yang masih punya ruang. */
  const rumahkan = (id: string) => {
    const t = o.tp.find((tp, i) => !tujuan.has(i) && (tp.tuntutan ?? []).length < MAKS_TUNTUTAN_PER_TP);
    assert(t, `fixture: tidak ada TP tersisa untuk ${id}`);
    t!.tuntutan = [...(t!.tuntutan ?? []), id];
    // Tuntutan berkategori menuntut fiksi DAN nonfiksi di TP yang merujuknya.
    if (TUNTUTAN_BERKATEGORI.includes(id)) t!.kategori_teks = ['fiksi', 'nonfiksi'];
  };
  for (const id of [...new Set(tergusur)]) if (!o.tp.some(t => (t.tuntutan ?? []).includes(id))) rumahkan(id);
  // TP yang jadi kosong tetap harus menyebut sekurang-kurangnya satu tuntutan.
  for (const t of o.tp) {
    if ((t.tuntutan ?? []).length === 0) {
      t.tuntutan = ['BIE-E25-MM-1'];
      t.kategori_teks = ['fiksi', 'nonfiksi'];
    }
  }
  return o;
}

/** Nomor TP pertama pada sebuah semester. */
function nomorDiSemester(o: { tp: TpEntry[] }, semester: number): number {
  const t = o.tp.find(x => Number(x.semester) === semester);
  assert(t, `fixture: tidak ada TP di semester ${semester}`);
  return Number(t!.nomor);
}

/** Kode galat RDS yang menyala. */
function kodeRds(errors: string[]): string[] {
  return errors.map(e => (e.match(/^\[(RDS\d)\]/) ?? [])[1]).filter(Boolean) as string[];
}

Deno.test('AM1: jauh_di_bawah — MB-2 dan MB-3 dalam satu TP ditolak', () => {
  const data = cd(JAUH);
  const o = taruh(keluaranKanonik(data), { 'BIE-E25-MB-2': 8, 'BIE-E25-MB-3': 8 });
  const v = validasiAtp(o, syaratP5(data));
  assert(!v.valid, 'MB-2+MB-3 satu TP lolos');
  assert(kodeRds(v.errors).includes('RDS2'), `RDS2 tidak menyala: ${v.errors.join('; ')}`);
});

Deno.test('AM2: jauh_di_bawah — MB-3 di Semester 1 ditolak', () => {
  const data = cd(JAUH);
  const dasar = keluaranKanonik(data);
  const s1 = nomorDiSemester(dasar, 1);
  const o = taruh(dasar, { 'BIE-E25-MB-2': s1, 'BIE-E25-MB-3': s1 + 1 });
  assertEquals(Number(o.tp[s1].semester), 1, 'fixture: TP penampung MB-3 bukan semester 1');
  const v = validasiAtp(o, syaratP5(data));
  assert(!v.valid, 'MB-3 di semester 1 lolos');
  assert(kodeRds(v.errors).includes('RDS3'), `RDS3 tidak menyala: ${v.errors.join('; ')}`);
});

Deno.test('AM3: jauh_di_bawah — MB-2 lebih dahulu, MB-3 Semester 2 diterima', () => {
  const data = cd(JAUH);
  const dasar = keluaranKanonik(data);
  const s2 = nomorDiSemester(dasar, 2);
  const o = taruh(dasar, {
    'BIE-E25-MB-2': s2 - 1, 'BIE-E25-MB-3': s2 + 1,
    'BIE-E25-MP-4': s2 + 2, 'BIE-E25-MP-5': s2 + 3,
  });
  const v = validasiAtp(o, syaratP5(data));
  assertEquals(kodeRds(v.errors), [], `RDS menyala padahal urutannya benar: ${v.errors.join('; ')}`);
  assert(v.valid, v.errors.join('; '));
});

Deno.test('AM4: jauh_di_bawah — MP-4 dan MP-5 dalam satu TP ditolak', () => {
  const data = cd(JAUH);
  const o = taruh(keluaranKanonik(data), { 'BIE-E25-MP-4': 9, 'BIE-E25-MP-5': 9 });
  const v = validasiAtp(o, syaratP5(data));
  assert(!v.valid, 'MP-4+MP-5 satu TP lolos');
  assert(kodeRds(v.errors).includes('RDS5'), `RDS5 tidak menyala: ${v.errors.join('; ')}`);
});

Deno.test('AM5: jauh_di_bawah — MP-5 di Semester 1 ditolak, dan urutan terbalik tertangkap', () => {
  const data = cd(JAUH);
  const dasar = keluaranKanonik(data);
  const s1 = nomorDiSemester(dasar, 1);
  const s2 = nomorDiSemester(dasar, 2);
  // MP-5 mendahului MP-4 DAN berada di semester 1: dua pelanggaran berbeda.
  const o = taruh(dasar, { 'BIE-E25-MP-5': s1 + 1, 'BIE-E25-MP-4': s2 + 1 });
  const v = validasiAtp(o, syaratP5(data));
  assert(!v.valid, 'MP-5 di semester 1 lolos');
  const kode = kodeRds(v.errors);
  assert(kode.includes('RDS6'), `RDS6 tidak menyala: ${v.errors.join('; ')}`);
  assert(kode.includes('RDS4'), `RDS4 tidak menyala padahal MP-5 mendahului MP-4: ${v.errors.join('; ')}`);
});

Deno.test('AM6: jauh_di_bawah — MP-4 lebih dahulu, MP-5 Semester 2 diterima', () => {
  const data = cd(JAUH);
  const dasar = keluaranKanonik(data);
  const s2 = nomorDiSemester(dasar, 2);
  const o = taruh(dasar, {
    'BIE-E25-MB-2': s2 - 1, 'BIE-E25-MB-3': s2,
    'BIE-E25-MP-4': s2 + 1, 'BIE-E25-MP-5': s2 + 2,
  });
  const v = validasiAtp(o, syaratP5(data));
  assertEquals(kodeRds(v.errors), [], `RDS menyala padahal urutannya benar: ${v.errors.join('; ')}`);
  assert(v.valid, v.errors.join('; '));
});

Deno.test('AM7: sedikit_di_bawah — fixture yang sama TIDAK terkena aturan kesiapan', () => {
  const jauh = cd(JAUH);
  const biasa = cd();   // sedikit_di_bawah
  assertEquals(
    String((biasa.PROFIL_SISWA as Record<string, unknown>).tingkat_kemampuan_awal), 'sedikit_di_bawah');

  const s1 = nomorDiSemester(keluaranKanonik(biasa), 1);
  const penempatan = { 'BIE-E25-MB-2': s1 + 1, 'BIE-E25-MB-3': s1 };   // terbalik, keduanya semester 1

  // jauh_di_bawah: ditolak.
  const vJauh = validasiAtp(taruh(keluaranKanonik(jauh), penempatan), syaratP5(jauh));
  assert(!vJauh.valid && kodeRds(vJauh.errors).length > 0, 'fixture tidak menjatuhkan jauh_di_bawah');

  // sedikit_di_bawah: fixture yang SAMA lolos.
  const vBiasa = validasiAtp(taruh(keluaranKanonik(biasa), penempatan), syaratP5(biasa));
  assertEquals(kodeRds(vBiasa.errors), [], 'aturan kesiapan ikut mengunci sedikit_di_bawah');
  assert(vBiasa.valid, vBiasa.errors.join('; '));

  // Dan MB-2+MB-3 dalam satu TP pun tetap sah di luar jauh_di_bawah —
  // fixture yang PERSIS sama dengan yang dijatuhkan AM1.
  const gabung2 = validasiAtp(
    taruh(keluaranKanonik(biasa), { 'BIE-E25-MB-2': 8, 'BIE-E25-MB-3': 8 }), syaratP5(biasa));
  assertEquals(kodeRds(gabung2.errors), []);
  assert(gabung2.valid, gabung2.errors.join('; '));
});

Deno.test('AM8: arahan untuk penyusun diturunkan dari tabel yang ditegakkan validator', () => {
  // Satu sumber, dua pemakai: kalau tabelnya berubah, kalimat di prompt ikut
  // berubah dengan sendirinya. Tidak ada kembar yang bisa menyimpang diam-diam.
  const aturan = aturanProgresiUntuk('jauh_di_bawah', WAJIB_BI);
  assertEquals(aturan.length, 2, 'kedua aturan progresi harus berlaku untuk Bahasa Inggris Fase E');

  // gabung() menormalkan ke huruf kecil — bandingkan dalam bentuk yang sama.
  const kirim = gabung(konteksDari(cd(JAUH)).kesiapan_murid);
  for (const a of aturan) {
    assert(kirim.includes(a.label_dasar.toLowerCase()), `arahan tidak menyebut "${a.label_dasar}"`);
    assert(kirim.includes(a.label_lanjutan.toLowerCase()), `arahan tidak menyebut "${a.label_lanjutan}"`);
    assert(kirim.includes(`semester ${a.semester_lanjutan}`), 'arahan tidak menyebut semester penempatan');
  }
  assert(kirim.includes('bukan satu tp'), 'arahan tidak melarang penggabungan TP');

  // Kesiapan lain tidak menerima arahan ini.
  assertEquals(aturanProgresiUntuk('sedikit_di_bawah', WAJIB_BI).length, 0);
  const kirimBiasa = gabung(konteksDari(cd()).kesiapan_murid);
  assert(!kirimBiasa.includes('wajib dipatuhi untuk kelas jauh di bawah'),
    'arahan kesiapan ekstrem bocor ke kesiapan lain');

  // Mapel yang tidak punya ID itu tidak terkena aturannya sama sekali.
  assertEquals(aturanProgresiUntuk('jauh_di_bawah', ['XYZ-1', 'XYZ-2']).length, 0);
});
