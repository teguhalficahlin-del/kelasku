// M2 — PEWARISAN KEPUTUSAN ATP KE MODUL AJAR.
//
// M1 mengikat Modul ke POTRET TP yang benar. M2 membuat Modul benar-benar
// MENERIMA apa yang ATP putuskan: tuntutan CP beserta maknanya, kategori teks,
// alokasi pertemuan sisi server, porsi konteks A17 yang berlaku, penekanan
// guru, kesiapan, program keahlian, jumlah murid, dan versi CP.
//
// M2-A..M2-M menguji fungsi murni di warisan.ts terhadap acuan CP yang nyata.
// M2-N..M2-T memeriksa SUMBER generate-modul apa adanya — bukan salinan
// logikanya — pola yang sama dengan M1-N..M1-AC dan tests/atp-trace.mjs.
//
// TIDAK ADA panggilan model di berkas ini. M2 adalah pipa, bukan semantik.

import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import {
  uraikanTuntutan, kategoriWajibDariTuntutan, alokasiPertemuanDariAnchor,
  konteksTugasEfektif, bangunAtpContext, bacaAtpHasil,
  KODE_TUNTUTAN_ASING, KODE_ACUAN_HILANG, KODE_TUNTUTAN_KOSONG,
  periksaLayananCp,
} from '../supabase/functions/generate-modul/warisan.ts';
import {
  bangunTpAnchor, hitungTpSnapshotHash, periksaAnchor,
} from '../supabase/functions/generate-modul/anchor.ts';
import {
  acuanUntuk, tuntutanWajib, LABEL_KONTEKS_TUGAS, LABEL_DASAR_KESIAPAN,
} from '../supabase/functions/generate-atp/kontrak.ts';

const EF_MODUL = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);

const MAPEL = 'Bahasa Inggris';
const FASE  = 'E';
const WAJIB = tuntutanWajib(acuanUntuk(MAPEL, FASE)).map(w => w.id);

/** ATP server: TP 5, sebaran pertemuan dan keputusan yang NYATA. */
function atpServer(ubahTp: Record<string, unknown> = {}, ubahCd: Record<string, unknown> = {}) {
  return {
    progresi_tp: [{
      nomor: 5, judul: 'Menyimak dialog pelayanan butik dan memahami gagasan utama',
      elemen: ['menyimak_berbicara'],
      tuntutan: ['BIE-E25-MB-1', 'BIE-E25-MB-2'],
      kategori_teks: ['fiksi', 'nonfiksi'],
      jp_alokasi: 8, jp_pertemuan: [2, 2, 4], semester: 1,
      ...ubahTp,
    }],
    collected_data: {
      KONTEKS_CP:   { konfirmasi_konteks: 'sesuai', program_keahlian: 'Tata Busana' },
      KONTEKS_DUDI: { konteks_tugas: 'kehidupan', situasi_khusus: 'tidak_ada', metode_pengurutan: 'scaffolding' },
      PROFIL_SISWA: { tingkat_kemampuan_awal: 'jauh_di_bawah', dasar_informasi_kesiapan: 'hasil_penilaian' },
      PENGUATAN_PRASYARAT: { strategi_prasyarat: 'terintegrasi', target_prioritas: ['pendidikan_lanjut'] },
      ATP_HASIL: {
        acuan_cp: { versi_cp: '046/H/KR/2025' },
        dasar_penyusunan: {
          keputusan_miclass: [],
          penerapan_prioritas: [
            { prioritas: 'kesiapan studi lanjut', kunci: 'pendidikan_lanjut',
              tp: [5, 7], pengaruh: ['penekanan isi'], alasan: 'TP 5 dan 7 memakai register akademik.' },
            { prioritas: 'penguatan kemampuan dasar', kunci: 'kemampuan_dasar',
              tp: [1, 2], pengaruh: ['urutan'], alasan: 'TP 1 dan 2 membangun fondasi.' },
          ],
        },
      },
      ...ubahCd,
    },
  };
}

const anchorDari = (atp: ReturnType<typeof atpServer>) => bangunTpAnchor(atp, 'atp-1', 5)!;

// ═════════════════════════════════════════════════════════════════════════════
// ALOKASI PERTEMUAN — SATU OTORITAS
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('M2-A: jumlah_pertemuan berasal dari jp_pertemuan anchor server', () => {
  const a = alokasiPertemuanDariAnchor(anchorDari(atpServer()));
  assertEquals(a.jumlah_pertemuan, 3, 'jumlah pertemuan bukan panjang jp_pertemuan server');
  assertEquals(a.jp_pertemuan, [2, 2, 4]);
  assertEquals(a.jp_alokasi, 8);
  assertEquals(a.sumber, 'anchor_server');

  // ATP yang diterima selalu seragam (validator W5), dan di situ angkanya persis.
  const seragam = alokasiPertemuanDariAnchor(
    anchorDari(atpServer({ jp_alokasi: 12, jp_pertemuan: [2, 2, 2, 2, 2, 2] })));
  assertEquals(seragam.jumlah_pertemuan, 6);
  assertEquals(seragam.jp_per_pertemuan, 2, 'sebaran seragam tidak menghasilkan angka persis');
});

Deno.test('M2-B: salinan klien yang basi TIDAK pernah menang atas anchor server', () => {
  // Fixture negatif §19: server [2,2,4], salinan klien sengaja [4,4].
  const server = atpServer();
  const anchor = anchorDari(server);
  const salinanKlienBasi = { PILIH_TP: { selected_tp: { jp_pertemuan: [4, 4] }, jumlah_pertemuan: 2 } };

  const a = alokasiPertemuanDariAnchor(anchor);
  assertEquals(a.jumlah_pertemuan, 3, 'salinan klien menang');
  assertNotEquals(a.jumlah_pertemuan,
    (salinanKlienBasi.PILIH_TP.selected_tp.jp_pertemuan).length);

  // Dan builder-nya memang tidak menerima collected_data Modul sama sekali:
  // satu-satunya masukannya adalah anchor server.
  assertEquals(alokasiPertemuanDariAnchor.length, 1,
    'alokasi pertemuan menerima masukan lain selain anchor server');

  // Sumber di jalur produksi juga tidak lagi menyebut salinan itu.
  // (Diperiksa penuh di M2-O.)
});

// ═════════════════════════════════════════════════════════════════════════════
// TUNTUTAN CP
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('M2-C: ID tuntutan diuraikan ke kompetensi dan lingkup materi yang nyata', () => {
  const t = uraikanTuntutan(MAPEL, FASE, ['BIE-E25-MB-1', 'BIE-E25-MB-2']);
  assertEquals(t.length, 2);
  assertEquals(t.map(x => x.id), ['BIE-E25-MB-1', 'BIE-E25-MB-2']);

  // Isinya BERASAL dari acuan, bukan disalin ke generate-modul.
  const acuan = new Map(tuntutanWajib(acuanUntuk(MAPEL, FASE)).map(w => [w.id, w.t]));
  for (const x of t) {
    assertEquals(x.kompetensi, acuan.get(x.id)!.kompetensi);
    assertEquals(x.lingkup_materi, acuan.get(x.id)!.lingkup_materi);
    assert(x.kompetensi.length > 10, `kompetensi ${x.id} kosong`);
  }
  // cakupan_wajib ikut bila acuan menuntutnya.
  assertEquals(t[0].cakupan_wajib?.kategori_teks, ['fiksi', 'nonfiksi']);
  assertEquals(t[1].cakupan_wajib, undefined, 'cakupan dikarang untuk tuntutan yang tidak menuntutnya');

  // M2.1: daftar kosong TIDAK lagi lolos di jalur penyusunan — lihat M2-AB.
  // Sampai M2 baris ini berbunyi `assertEquals(uraikanTuntutan(…, []), [])`,
  // dan itulah cacat D yang correction ini balik dengan sengaja.
});

Deno.test('M2-D: ID tuntutan yang tidak dikenal adalah kegagalan keras', () => {
  let kode: string | undefined;
  let asing: string[] | undefined;
  try {
    uraikanTuntutan(MAPEL, FASE, ['BIE-E25-MB-1', 'BIE-E25-ZZ-9']);
  } catch (e) {
    kode  = (e as { code?: string }).code;
    asing = (e as { tuntutan_asing?: string[] }).tuntutan_asing;
  }
  assertEquals(kode, KODE_TUNTUTAN_ASING, 'ID asing dilewati diam-diam');
  assertEquals(asing, ['BIE-E25-ZZ-9']);

  // Mapel/fase yang acuannya tidak ada juga gagal keras, bukan menghasilkan kosong.
  let kode2: string | undefined;
  try {
    uraikanTuntutan('Matematika', 'Z', ['APA-1']);
  } catch (e) { kode2 = (e as { code?: string }).code; }
  assertEquals(kode2, KODE_ACUAN_HILANG);
});

Deno.test('M2-E: kategori teks diteruskan — yang TP nyatakan DAN yang acuan tuntut', () => {
  const anchor = anchorDari(atpServer());
  assertEquals(anchor.kategori_teks, ['fiksi', 'nonfiksi']);

  const wajib = kategoriWajibDariTuntutan(uraikanTuntutan(MAPEL, FASE, anchor.tuntutan));
  assertEquals(wajib, ['fiksi', 'nonfiksi'],
    'kategori wajib tidak diturunkan dari cakupan_wajib acuan');

  // Tuntutan tanpa cakupan_wajib tidak menyumbang kategori.
  assertEquals(kategoriWajibDariTuntutan(uraikanTuntutan(MAPEL, FASE, ['BIE-E25-MB-2'])), []);
});

Deno.test('M2-F: versi CP diteruskan dari amplop ATP, bukan dari string prompt', () => {
  assertEquals(anchorDari(atpServer()).versi_cp, '046/H/KR/2025');
  assertEquals(bacaAtpHasil(atpServer().collected_data).versi_cp, '046/H/KR/2025');

  const ctx = bangunAtpContext({
    cd: atpServer().collected_data, anchor: anchorDari(atpServer()),
    jumlahMurid: 32,
  });
  assertEquals(ctx.versi_cp, '046/H/KR/2025');
});

// ═════════════════════════════════════════════════════════════════════════════
// KEPUTUSAN A17
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('M2-G: A17 eksplisit — keputusan guru dipakai apa adanya', () => {
  const cd = atpServer().collected_data;   // konteks_tugas: 'kehidupan'
  const a17 = konteksTugasEfektif(cd, []);
  assertEquals(a17.nilai, 'kehidupan');
  assertEquals(a17.asal, 'keputusan_guru');
  assertEquals(a17.arti, LABEL_KONTEKS_TUGAS.kehidupan);
});

Deno.test('M2-H: A17 didelegasikan — keputusan ATP dipakai, tidak dipilih ulang', () => {
  const server = atpServer({}, {
    KONTEKS_DUDI: { konteks_tugas: 'tentukan_saat_menyusun', situasi_khusus: 'tidak_ada' },
    ATP_HASIL: {
      acuan_cp: { versi_cp: '046/H/KR/2025' },
      dasar_penyusunan: {
        keputusan_miclass: [{
          pertanyaan: 'Konteks contoh dan tugas',
          didelegasikan_karena: 'guru memilih tentukan saat menyusun',
          dipilih: LABEL_KONTEKS_TUGAS.kerja, alasan: 'alasan penyusun',
          sumber: 'penyusunan', kunci: 'kerja',
        }],
        penerapan_prioritas: [],
      },
    },
  });
  const a17 = konteksTugasEfektif(server.collected_data, bacaAtpHasil(server.collected_data).keputusan);
  assertEquals(a17.nilai, 'kerja', 'keputusan ATP tidak dipakai');
  assertEquals(a17.asal, 'keputusan_atp');
  assertEquals(a17.arti, LABEL_KONTEKS_TUGAS.kerja);

  // ATP lama tanpa `kunci` tetap terbaca lewat labelnya, bukan ditebak.
  const lama = konteksTugasEfektif(server.collected_data, [{
    pertanyaan: 'Konteks contoh dan tugas',
    didelegasikan_karena: 'guru belum menjawab',
    dipilih: LABEL_KONTEKS_TUGAS.seimbang, alasan: 'x',
  }]);
  assertEquals(lama.nilai, 'seimbang');
  assertEquals(lama.asal, 'keputusan_atp');

  // Tidak ada keputusan sama sekali → null, BUKAN nilai karangan.
  assertEquals(konteksTugasEfektif(server.collected_data, []).nilai, null);
});

// ═════════════════════════════════════════════════════════════════════════════
// PENEKANAN GURU, KESIAPAN, KONTEKS KEJURUAN, JUMLAH MURID
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('M2-I: penekanan guru diteruskan apa adanya — tidak ditambah, tidak dihapus', () => {
  const ctx = bangunAtpContext({
    cd: atpServer().collected_data, anchor: anchorDari(atpServer()),
    jumlahMurid: 32,
  });
  assertEquals(ctx.prioritas_guru.map(p => p.kunci), ['pendidikan_lanjut']);
  assert(ctx.prioritas_guru[0].arti.length > 0);
  assert(ctx.prioritas_guru[0].arahan.length > 0, 'arahan penerapan penekanan hilang');

  // Guru tanpa penekanan tidak mendapat penekanan karangan.
  const tanpa = bangunAtpContext({
    cd: atpServer({}, { PENGUATAN_PRASYARAT: { strategi_prasyarat: 'terintegrasi', target_prioritas: [] } }).collected_data,
    anchor: anchorDari(atpServer()), jumlahMurid: 32,
  });
  assertEquals(tanpa.prioritas_guru, []);
});

Deno.test('M2-J: penerapan penekanan disaring ke TP ini, dengan jejak asalnya utuh', () => {
  const ctx = bangunAtpContext({
    cd: atpServer().collected_data, anchor: anchorDari(atpServer()),
    jumlahMurid: 32,
  });
  const untukTp = ctx.penerapan_prioritas.untuk_tp_ini;
  assertEquals(untukTp.length, 1, 'penyaringan ke TP 5 salah');
  assertEquals(untukTp[0].kunci, 'pendidikan_lanjut');
  assert(untukTp[0].tp.includes(5), 'entri yang lolos tidak menunjuk TP ini');
  assert(untukTp[0].pengaruh.length > 0 && untukTp[0].alasan.length > 0,
    'pengaruh atau alasan hilang saat diwariskan');

  // Asal-usulnya tetap dapat ditelusuri: seluruh penerapan ATP dipertahankan.
  assertEquals(ctx.penerapan_prioritas.seluruh_atp.length, 2);
});

Deno.test('M2-K: kesiapan murid diteruskan tanpa tafsir baru', () => {
  const ctx = bangunAtpContext({
    cd: atpServer().collected_data, anchor: anchorDari(atpServer()),
    jumlahMurid: 32,
  });
  assertEquals(ctx.kesiapan_murid.nilai, 'jauh_di_bawah');
  // M2.1: kesiapan adalah KEADAAN yang guru laporkan, bukan keputusan pedagogis.
  // Sampai M2 nilainya 'keputusan_guru', yang menyamakannya dengan A17.
  assertEquals(ctx.kesiapan_murid.asal, 'fakta');
  assert(ctx.kesiapan_murid.arti.length > 0, 'kesiapan tidak punya arti manusia');

  // Amplop { value, … } juga dibaca.
  const amplop = bangunAtpContext({
    cd: atpServer({}, { PROFIL_SISWA: { tingkat_kemampuan_awal: { value: 'sesuai' } } }).collected_data,
    anchor: anchorDari(atpServer()), jumlahMurid: 32,
  });
  assertEquals(amplop.kesiapan_murid.nilai, 'sesuai');

  // Tidak dijawab → belum_diketahui, bukan tebakan.
  const kosong = bangunAtpContext({
    cd: atpServer({}, { PROFIL_SISWA: {} }).collected_data,
    anchor: anchorDari(atpServer()), jumlahMurid: 32,
  });
  assertEquals(kosong.kesiapan_murid.nilai, 'belum_diketahui');
});

Deno.test('M2-L: program keahlian diteruskan sebagai fakta, bukan sebagai perintah', () => {
  const ctx = bangunAtpContext({
    cd: atpServer().collected_data, anchor: anchorDari(atpServer()),
    jumlahMurid: 32,
  });
  // M2.1: nilainya berasal dari POTRET ATP (KONTEKS_CP), bukan lagi dari
  // rancang_settings sekarang — pembuktian penuhnya di M2-W dan M2-AD.
  assertEquals(ctx.program_keahlian.nilai, 'Tata Busana');
  assertEquals(ctx.program_keahlian.asal, 'fakta',
    'program keahlian dicatat sebagai keputusan, padahal ia keadaan');
  // Porsi konteks tetap milik A17, bukan milik program keahlian.
  assertEquals(ctx.konteks_tugas.nilai, 'kehidupan');
  assertEquals(ctx.program_keahlian.nilai !== null && ctx.konteks_tugas.nilai === 'kehidupan', true);
});

Deno.test('M2-M: jumlah murid satu sumber, dan asalnya ditandai fakta', () => {
  const ctx = bangunAtpContext({
    cd: atpServer().collected_data, anchor: anchorDari(atpServer()),
    jumlahMurid: 32,
  });
  assertEquals(ctx.jumlah_murid.nilai, 32);
  assertEquals(ctx.jumlah_murid.asal, 'fakta');
  // Kelas yang belum mengisi jumlah murid tetap null, bukan angka bawaan.
  const nul = bangunAtpContext({
    cd: atpServer().collected_data, anchor: anchorDari(atpServer()),
    jumlahMurid: null,
  });
  assertEquals(nul.jumlah_murid.nilai, null);
});

// ═════════════════════════════════════════════════════════════════════════════
// BENTUK PIPELINE YANG SEBENARNYA
// ═════════════════════════════════════════════════════════════════════════════

Deno.test('M2-N: Fase A menerima amplop warisan, bukan lagi potret telanjang', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  assert(/warisan_atp: \{[\s\S]{0,200}tp:\s*warisanTp\(params\.warisan\)/.test(src),
    'Fase A tidak menerima warisan_atp');
  assert(/konteks:\s*warisanKonteks\(params\.warisan\)/.test(src),
    'Fase A tidak menerima konteks ATP');
  assert(/larangan:\s*LARANGAN_WARISAN/.test(src), 'larangan tidak dikirim');
  // Amplop dibangun sekali dari data server.
  assert(/const warisan: WarisanAtp = \{[\s\S]{0,300}tuntutan: tuntutanTerurai/.test(src),
    'amplop warisan tidak dibangun dari tuntutan yang diuraikan server');
});

Deno.test('M2-O: alokasi pertemuan hanya dari anchor server; salinan klien tidak dibaca lagi', async () => {
  const bersih = (await Deno.readTextFile(EF_MODUL))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  assert(/const alokasiTp\s*=\s*alokasiPertemuanDariAnchor\(tpAnchor\)/.test(bersih),
    'alokasi tidak dibangun dari anchor server');
  assert(/const jumlahPertemuan = alokasiTp\.jumlah_pertemuan/.test(bersih));
  assert(/const jpPerPertemuan\s*=\s*alokasiTp\.jp_per_pertemuan/.test(bersih));

  // Jalur lama benar-benar hilang — bukan sekadar tidak dipakai.
  assert(!/selected_tp/.test(bersih), 'salinan klien selected_tp masih dibaca');
  assert(!/jpPertemuanArr/.test(bersih), 'perakitan jp_pertemuan dari klien masih ada');
  assert(!/PILIH_TP/.test(bersih), 'PILIH_TP masih dibaca sebagai sumber waktu');

  // Fase B menerima alokasi server itu.
  assert(/alokasi_server:\s*params\.warisan\.alokasi/.test(await Deno.readTextFile(EF_MODUL)),
    'Fase B tidak menerima alokasi server');
});

Deno.test('M2-P: Fase C menerima tuntutan dan kategori, tanpa alokasi waktu', async () => {
  const src = await Deno.readTextFile(EF_MODUL);
  const iC = src.indexOf('function buildUserMessageFaseC');
  const iAkhir = src.indexOf('\nfunction ', iC + 10);
  const blokC = src.slice(iC, iAkhir > 0 ? iAkhir : undefined);

  assert(/warisan_atp: \{[\s\S]{0,160}tp:\s*warisanTp\(params\.warisan\)/.test(blokC),
    'Fase C tidak menerima tuntutan/kategori');
  assert(!/alokasi_server/.test(blokC),
    'Fase C menerima alokasi waktu yang bukan urusannya');

  // warisanTp memang membawa makna tuntutan dan kedua bentuk kategori.
  assert(/tuntutan_cp: w\.tuntutan\.map/.test(src));
  assert(/kategori_teks_tp:\s*w\.tpAnchor\.kategori_teks/.test(src));
  assert(/kategori_teks_wajib:\s*w\.kategoriWajib/.test(src));
});

Deno.test('M2-Q: jejak warisan tersimpan di dokumen Modul, bukan hanya di prompt', async () => {
  const src = await Deno.readTextFile(EF_MODUL);

  // Dipaku di Fase A …
  assert(/const jejakWarisan = \{[\s\S]{0,400}atp_context:\s*atpContext/.test(src),
    'jejak warisan tidak dipaku di Fase A');
  assert(/const draftA = \{ \.\.\.kontenObj, \.\.\.jejakWarisan/.test(src),
    'jejak tidak ikut tersimpan bersama draft');

  // … dan ikut ke dokumen final Fase D, yang menyusun konten dari nol.
  //
  // Sejak koreksi perakitan M9 (smoke produksi 11 Sep 2026) dokumen final
  // dirakit di SATU tempat — rakitModulFinal() di assembly.ts — dan handler
  // meneruskan nilai yang sama ke sana. Kedua sisi diperiksa: field ada di
  // perakitan, DAN handler mengisinya dari sumber yang sama seperti dulu.
  const rakit = await Deno.readTextFile(
    new URL('../supabase/functions/generate-modul/assembly.ts', import.meta.url));
  const iMerge = rakit.indexOf('export function rakitModulFinal(');
  assert(iMerge >= 0, 'otoritas perakitan dokumen final tidak ditemukan');
  const blokMerge = rakit.slice(iMerge);
  assert(/tp_anchor: \{/.test(blokMerge), 'tp_anchor hilang di dokumen final');
  assert(/atp_context:\s*b\.atpContext/.test(blokMerge), 'atp_context hilang di dokumen final');
  assert(/alokasi_server:\s*b\.alokasiServer/.test(blokMerge), 'alokasi server hilang di dokumen final');
  assert(/rakitModulFinal\(\{[\s\S]{0,400}atpContext, alokasiServer:\s*alokasiTp/.test(src),
    'handler tidak meneruskan atp_context dan alokasi server ke perakitan dokumen final');
  // Bentuk kaya untuk dibaca, ID mentah tetap disimpan berdampingan.
  assert(/tuntutan_id: b\.tpAnchor\.tuntutan/.test(blokMerge),
    'ID tuntutan mentah tidak disimpan berdampingan dengan bentuk kayanya');
});

Deno.test('M2-R: representasi kaya TIDAK mengubah tp_snapshot_hash M1', async () => {
  const anchor = anchorDari(atpServer());
  const sebelum = await hitungTpSnapshotHash(anchor);

  // Potret yang sama, tetapi tuntutannya diuraikan jadi objek untuk disimpan.
  const kaya = { ...anchor, tuntutan: uraikanTuntutan(MAPEL, FASE, anchor.tuntutan) };
  // Hash tetap dihitung dari anchor kanonik, bukan dari bentuk kayanya.
  assertEquals(await hitungTpSnapshotHash(anchor), sebelum);
  assertEquals(anchor.tuntutan, ['BIE-E25-MB-1', 'BIE-E25-MB-2'],
    'anchor kanonik ikut berubah jadi objek');
  assertEquals(Array.isArray(kaya.tuntutan) && typeof kaya.tuntutan[0] === 'object', true);

  // Nilai hash-nya sendiri stabil lintas jalankan (bukti byte-identical).
  assertEquals(sebelum.length, 64);
  assertEquals(await hitungTpSnapshotHash(bangunTpAnchor(atpServer(), 'atp-1', 5)!), sebelum);

  // Dan sumber produksi tetap menghitung hash dari anchor, bukan dari jejak.
  const src = await Deno.readTextFile(EF_MODUL);
  assert(/const hashSekarang = await hitungTpSnapshotHash\(tpAnchor\)/.test(src),
    'hash dihitung dari objek selain anchor kanonik');
});

Deno.test('M2-S: gerbang stale/legacy M1 tetap bekerja sesudah M2', async () => {
  const src = await Deno.readTextFile(EF_MODUL);

  // Gerbang masih ada, masih menerima kedua tanda M1.1, dan masih mendahului
  // seluruh pekerjaan M2.
  const iGerbang = src.indexOf('const gerbang = periksaAnchor({');
  const iTolak   = src.indexOf('if (!gerbang.boleh_generate) {');
  const iWarisan = src.indexOf('const warisan: WarisanAtp = {');
  const iModel   = src.indexOf('await callPhase(');
  assert(iGerbang > 0 && iTolak > iGerbang, 'gerbang M1 hilang');
  assert(iWarisan > iTolak, 'warisan dibangun sebelum gerbang menolak');
  assert(iModel > iTolak, 'model dipanggil sebelum gerbang menolak');
  assert(/adaRiwayat[\s\S]{0,80}judulCocok/.test(src), 'tanda M1.1 hilang dari gerbang');

  // Tabel kebenarannya tidak bergeser.
  assertEquals(periksaAnchor({ hashTersimpan: 'a', hashSekarang: 'b', adaKontenFinal: true }).status, 'STALE');
  assertEquals(periksaAnchor({ hashTersimpan: null, hashSekarang: 'b', adaKontenFinal: true }).status, 'LEGACY_UNVERIFIED');
  assertEquals(periksaAnchor({ hashTersimpan: 'a', hashSekarang: 'a', adaKontenFinal: true }).status, 'COCOK');
  assertEquals(
    periksaAnchor({ hashTersimpan: null, hashSekarang: 'b', adaKontenFinal: false, adaRiwayat: false, judulCocok: false }).status,
    'STALE');
});

Deno.test('M2-T: generate-modul tetap tidak membaca tp_kktp, dan tidak menyalin acuan CP', async () => {
  const bersih = (await Deno.readTextFile(EF_MODUL))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  assert(!bersih.includes('tp_kktp'), 'tp_kktp kembali dibaca di generate-modul');

  // Tidak ada daftar tuntutan kedua dan tidak ada mapel/fase yang ditulis keras
  // di jalur Modul: maknanya diambil lewat helper milik ATP.
  assert(!/BIE-E25-/.test(bersih), 'ID tuntutan ditulis keras di generate-modul');
  assert(!/'Bahasa Inggris'/.test(bersih), 'mapel ditulis keras di generate-modul');

  const warisanSrc = await Deno.readTextFile(
    new URL('../supabase/functions/generate-modul/warisan.ts', import.meta.url));
  assert(/from '\.\.\/generate-atp\/kontrak\.ts'/.test(warisanSrc),
    'warisan.ts tidak memakai acuan CP milik ATP');
  const wBersih = warisanSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert(!/BIE-E25-/.test(wBersih), 'warisan.ts menyalin ID tuntutan');
});

// ═════════════════════════════════════════════════════════════════════════════
// M2.1 — OTORITAS DAN ASAL-USUL
// ═════════════════════════════════════════════════════════════════════════════
//
// Empat cacat yang reviewer temukan, keempatnya satu bentuk yang sama: KEADAAN
// KELAS SEKARANG dipakai menentukan ARTI ATP YANG SUDAH DITERIMA, atau asal
// sebuah nilai dicatat keliru.

/** rancang_settings yang sengaja BERBEDA dari potret ATP. */
const SETTINGS_BASI = {
  mapel: 'Matematika', fase: 'F', jenjang: 'SMK',
  program_keahlian: 'Teknik Otomotif',
};

Deno.test('M2-U: arti tuntutan diuraikan dari baris ATP, bukan dari settings kelas', () => {
  const atp = atpServer();
  const anchor = anchorDari(atp);

  // ATP: Bahasa Inggris / E. Settings sengaja Matematika / F.
  const dariAtp = uraikanTuntutan(MAPEL, FASE, anchor.tuntutan);
  assertEquals(dariAtp.length, 2);
  assert(dariAtp[0].kompetensi.length > 10);

  // Kalau settings yang dipakai, hasilnya bukan sekadar berbeda — ia GAGAL,
  // karena acuan untuk kombinasi itu tidak ada. Itulah yang membuat cacat ini
  // berbahaya: ia mengubah arti ID yang sama.
  let kode: string | undefined;
  try {
    uraikanTuntutan(SETTINGS_BASI.mapel, SETTINGS_BASI.fase, anchor.tuntutan);
  } catch (e) { kode = (e as { code?: string }).code; }
  assertEquals(kode, KODE_ACUAN_HILANG,
    'kombinasi settings ternyata punya acuan — fixture tidak lagi membuktikan apa pun');
});

Deno.test('M2-V: mapel/fase ATP tidak tersedia → gagal keras, tanpa mundur ke settings', async () => {
  const bersih = (await Deno.readTextFile(EF_MODUL))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  // Identitas CP dibaca dari baris ATP …
  assert(/const atpMapel = String\(\(atp as Record<string, unknown>\)\.mapel/.test(bersih),
    'mapel tidak dibaca dari baris ATP');
  assert(/const atpFase\s*= String\(\(atp as Record<string, unknown>\)\.fase/.test(bersih),
    'fase tidak dibaca dari baris ATP');
  assert(/\.select\('mapel, fase, jenjang, elemen_cp, collected_data, progresi_tp'\)/.test(bersih),
    'baris ATP tidak lagi mengambil mapel dan fase');

  // … dan ketiadaannya menghentikan penyusunan.
  assert(/if \(!atpMapel \|\| !atpFase\) \{[\s\S]{0,400}\}, 422\);/.test(bersih),
    'ATP tanpa mapel/fase tidak dihentikan');

  // Tidak ada satu pun jalur yang menguraikan tuntutan memakai settings.
  assert(/uraikanTuntutan\(atpMapel, atpFase, tpAnchor\.tuntutan\)/.test(bersih),
    'penguraian tuntutan tidak memakai identitas ATP');
  assert(!/uraikanTuntutan\([^)]*settings/.test(bersih),
    'settings masih dipakai menguraikan tuntutan');

  // Gerbang layanan CP memakai helper ATP, bukan daftar versi yang disalin.
  assert(/periksaLayananCp\(atpMapel, atpFase, tpAnchor\.versi_cp\)/.test(bersih),
    'gerbang layanan CP tidak dijalankan atas identitas ATP');
  assert(!/046\/H\/KR\/2025/.test(bersih), 'daftar versi CP disalin ke generate-modul');
});

Deno.test('M2-V2: gerbang layanan CP memakai statusLayanan() ATP, dan menangkap versi warisan yang berbeda', () => {
  // Kombinasi yang benar-benar dilayani.
  const ok = periksaLayananCp(MAPEL, FASE, '046/H/KR/2025');
  assertEquals(ok.didukung, true, ok.alasan.join('; '));
  assertEquals(ok.versi_acuan, '046/H/KR/2025');

  // Kombinasi tanpa acuan.
  assertEquals(periksaLayananCp('Matematika', 'F', null).didukung, false);

  // ATP yang disusun di atas CP lain tidak boleh melahirkan Modul baru diam-diam.
  const beda = periksaLayananCp(MAPEL, FASE, '032/H/KR/2024');
  assertEquals(beda.didukung, false);
  assert(beda.alasan.some(a => a.includes('032/H/KR/2024')),
    'versi warisan yang berbeda tidak disebut alasannya');

  // M2.2: versi warisan kosong DITOLAK. Sampai M2.1 baris ini berbunyi
  // `assertEquals(…, null).didukung, true)` — dan justru itulah cacatnya: ATP
  // yang tidak mencatat versinya diperlakukan seolah berpangkal pada acuan yang
  // berlaku. Pembuktian penuhnya di M2-AI sampai M2-AL.
  assertEquals(periksaLayananCp(MAPEL, FASE, null).didukung, false);
});

Deno.test('M2-W: program keahlian diwarisi dari potret ATP, bukan dari settings sekarang', () => {
  const ctx = bangunAtpContext({
    cd: atpServer().collected_data, anchor: anchorDari(atpServer()), jumlahMurid: 32,
  });
  assertEquals(ctx.program_keahlian.nilai, 'Tata Busana');
  assertNotEquals(ctx.program_keahlian.nilai, SETTINGS_BASI.program_keahlian);

  // Builder tidak lagi punya pintu masuk untuk nilai dari settings.
  assert(!('programKeahlian' in (bangunAtpContext as unknown as Record<string, unknown>)),
    'builder masih mengenal parameter program dari settings');

  // ATP lama tanpa KONTEKS_CP → null, BUKAN ditebak dari keadaan sekarang.
  const tanpaSnapshot = bangunAtpContext({
    cd: atpServer({}, { KONTEKS_CP: {} }).collected_data,
    anchor: anchorDari(atpServer()), jumlahMurid: 32,
  });
  assertEquals(tanpaSnapshot.program_keahlian.nilai, null,
    'program keahlian ditebak dari keadaan sekarang');
});

Deno.test('M2-X: Fase C tidak lagi punya otoritas program keahlian sendiri', async () => {
  const src = await Deno.readTextFile(EF_MODUL);

  // Parameter paralelnya hilang seluruhnya — bukan sekadar tidak dipakai.
  assert(!/programKeahlian/.test(src),
    'jalur otoritas program keahlian yang paralel masih ada');
  assert(!/program_keahlian: settings\?\.program_keahlian/.test(src),
    'settings masih menjadi sumber program keahlian');

  // Satu-satunya jalannya lewat warisan, sama dengan fase lain.
  assert(/program_keahlian: \{ nilai: c\.program_keahlian\.nilai, asal: c\.program_keahlian\.asal \}/.test(src),
    'program keahlian tidak lagi dibawa warisanKonteks()');

  // identitas_db — yang SYSTEM_PROMPT sebut menentukan seluruh konteks dunia
  // kerja modul — kini juga berpangkal pada potret ATP.
  assert(/program_keahlian: atpContext\.program_keahlian\.nilai/.test(src),
    'identitas_db masih memakai program keahlian dari settings');
  assert(/mapel:\s*atpMapel/.test(src) && /fase:\s*atpFase/.test(src),
    'identitas_db masih memakai mapel/fase dari settings');
});

Deno.test('M2-Y: kesiapan murid dicatat sebagai keadaan, bukan keputusan', () => {
  const ctx = bangunAtpContext({
    cd: atpServer().collected_data, anchor: anchorDari(atpServer()), jumlahMurid: 32,
  });
  assertEquals(ctx.kesiapan_murid.asal, 'fakta');
  assertNotEquals(ctx.kesiapan_murid.asal, ctx.konteks_tugas.asal,
    'kesiapan dan A17 masih punya jenis asal yang sama');
});

Deno.test('M2-Z: A17 eksplisit tetap keputusan guru', () => {
  const ctx = bangunAtpContext({
    cd: atpServer().collected_data, anchor: anchorDari(atpServer()), jumlahMurid: 32,
  });
  assertEquals(ctx.konteks_tugas.nilai, 'kehidupan');
  assertEquals(ctx.konteks_tugas.asal, 'keputusan_guru');
});

Deno.test('M2-AA: A17 yang didelegasikan tetap keputusan ATP', () => {
  const server = atpServer({}, {
    KONTEKS_DUDI: { konteks_tugas: 'tentukan_saat_menyusun', situasi_khusus: 'tidak_ada' },
    ATP_HASIL: {
      acuan_cp: { versi_cp: '046/H/KR/2025' },
      dasar_penyusunan: {
        keputusan_miclass: [{
          pertanyaan: 'Konteks contoh dan tugas',
          didelegasikan_karena: 'guru memilih tentukan saat menyusun',
          dipilih: LABEL_KONTEKS_TUGAS.kerja, alasan: 'a', sumber: 'penyusunan', kunci: 'kerja',
        }],
        penerapan_prioritas: [],
      },
    },
  });
  const ctx = bangunAtpContext({
    cd: server.collected_data, anchor: anchorDari(server), jumlahMurid: 32,
  });
  assertEquals(ctx.konteks_tugas.nilai, 'kerja');
  assertEquals(ctx.konteks_tugas.asal, 'keputusan_atp');
});

Deno.test('M2-AB: TP tanpa tuntutan → penyusunan Modul GAGAL, tidak menebak dari judul', async () => {
  let kode: string | undefined;
  let pesan = '';
  try {
    uraikanTuntutan(MAPEL, FASE, []);
  } catch (e) {
    kode  = (e as { code?: string }).code;
    pesan = (e as Error).message;
  }
  assertEquals(kode, KODE_TUNTUTAN_KOSONG, 'daftar tuntutan kosong masih lolos');
  assertEquals(kode, 'MODULE_TP_TUNTUTAN_TIDAK_TERSEDIA', 'nama kode tidak stabil');
  assert(/tuntutan Capaian Pembelajaran/i.test(pesan),
    'pesan tidak menjelaskan bahwa kontrak tuntutan yang hilang');

  // Anchor TP tanpa tuntutan memang mungkin ada (ATP pra-acuan), dan justru itu
  // yang harus dihentikan di jalur penyusunan.
  const anchorTanpa = anchorDari(atpServer({ tuntutan: [] }));
  assertEquals(anchorTanpa.tuntutan, []);
  let kode2: string | undefined;
  try { uraikanTuntutan(MAPEL, FASE, anchorTanpa.tuntutan); }
  catch (e) { kode2 = (e as { code?: string }).code; }
  assertEquals(kode2, KODE_TUNTUTAN_KOSONG);

  // Dan galatnya benar-benar diteruskan sebagai penolakan, bukan ditelan.
  const src = await Deno.readTextFile(EF_MODUL);
  assert(/code:\s*err\.code \?\? KODE_TUNTUTAN_ASING/.test(src),
    'kode galat penguraian tuntutan tidak diteruskan ke pemanggil');
});

Deno.test('M2-AC: jalur MEMBACA Modul historis tidak ikut terblokir', async () => {
  // Gerbang §10 hanya hidup di generate-modul. Klien membuka, melihat, dan
  // mengunduh Modul lama lewat query langsung ke modul_induk — tidak satu pun
  // di antaranya memanggil Edge Function ini.
  const klien = await Deno.readTextFile(
    new URL('../guru/js/rancang-chat.js', import.meta.url));
  const api = await Deno.readTextFile(
    new URL('../guru/js/rancang-chat-api.js', import.meta.url));
  const unduh = await Deno.readTextFile(
    new URL('../guru/js/classroom-unduh.js', import.meta.url));

  for (const [nama, src] of [['rancang-chat', klien], ['rancang-chat-api', api], ['classroom-unduh', unduh]] as const) {
    assert(!/uraikanTuntutan|periksaLayananCp/.test(src),
      `${nama} ikut menjalankan gerbang penyusunan`);
  }
  // Pembacaan modul memang lewat select biasa.
  assert(/from\('modul_induk'\)[\s\S]{0,120}\.select\(/.test(api),
    'jalur baca Modul tidak lagi berupa select langsung');

  // Dan gerbangnya memang hanya ada di satu berkas.
  const ef = await Deno.readTextFile(EF_MODUL);
  assertEquals([...ef.matchAll(/uraikanTuntutan\(/g)].length, 1,
    'penguraian tuntutan dipanggil di lebih dari satu tempat di EF');
});

Deno.test('M2-AD: fixture otoritas negatif — potret ATP menang atas settings di kedua sumbu', () => {
  const atp = atpServer();                       // Bahasa Inggris / E, Tata Busana
  const anchor = anchorDari(atp);

  // Sumbu 1 — konteks kejuruan.
  const ctx = bangunAtpContext({ cd: atp.collected_data, anchor, jumlahMurid: 32 });
  assertEquals(ctx.program_keahlian.nilai, 'Tata Busana');
  assertNotEquals(ctx.program_keahlian.nilai, SETTINGS_BASI.program_keahlian);

  // Sumbu 2 — identitas CP.
  const t = uraikanTuntutan(MAPEL, FASE, anchor.tuntutan);
  assertEquals(t.map(x => x.id), anchor.tuntutan);
  assertEquals(periksaLayananCp(MAPEL, FASE, ctx.versi_cp).didukung, true);
  assertEquals(periksaLayananCp(SETTINGS_BASI.mapel, SETTINGS_BASI.fase, ctx.versi_cp).didukung, false,
    'kombinasi settings ternyata dilayani — fixture tidak kontras');

  // Keduanya berasal dari satu baris ATP yang sama, bukan dua sumber.
  assertEquals(anchor.atp_induk_id, 'atp-1');
});

Deno.test('M2-AE: jumlah murid tetap fakta operasional current, satu angka dengan validator', async () => {
  const ctx = bangunAtpContext({
    cd: atpServer().collected_data, anchor: anchorDari(atpServer()), jumlahMurid: 28,
  });
  assertEquals(ctx.jumlah_murid.nilai, 28);
  assertEquals(ctx.jumlah_murid.asal, 'fakta');

  const src = await Deno.readTextFile(EF_MODUL);
  // Satu variabel, dari rancang_settings, dipakai prompt DAN validator waktu.
  assert(/const jumlahMurid = settings\?\.jumlah_murid \?\? null/.test(src),
    'jumlah murid tidak lagi satu sumber dari rancang_settings');
  assert(/validateModulOutputV400\([^)]*jumlahMurid/.test(src),
    'validator waktu tidak memakai angka yang sama');
  assert(/bangunAtpContext\(\{[\s\S]{0,400}jumlahMurid,/.test(src),
    'atp_context tidak memakai angka yang sama');
});

Deno.test('M2-AF: dasar kesiapan diwarisi dari field ATP yang nyata, bukan kalimat buatan', () => {
  const ctx = bangunAtpContext({
    cd: atpServer().collected_data, anchor: anchorDari(atpServer()), jumlahMurid: 32,
  });
  // Fixture menjawab 'hasil_penilaian'; kalimatnya berasal dari kamus ATP.
  assertEquals(ctx.kesiapan_murid.dasar, LABEL_DASAR_KESIAPAN.hasil_penilaian);

  // Dasar yang berbeda menghasilkan kalimat yang berbeda — nilainya benar-benar
  // dibaca, bukan tetap.
  const pengamatan = bangunAtpContext({
    cd: atpServer({}, { PROFIL_SISWA: { tingkat_kemampuan_awal: 'sesuai', dasar_informasi_kesiapan: 'pengamatan' } }).collected_data,
    anchor: anchorDari(atpServer()), jumlahMurid: 32,
  });
  assertEquals(pengamatan.kesiapan_murid.dasar, LABEL_DASAR_KESIAPAN.pengamatan);
  assertNotEquals(pengamatan.kesiapan_murid.dasar, ctx.kesiapan_murid.dasar);

  // Kesiapan yang belum diketahui dinyatakan sebagai asumsi, bukan disembunyikan.
  const belum = bangunAtpContext({
    cd: atpServer({}, { PROFIL_SISWA: {} }).collected_data,
    anchor: anchorDari(atpServer()), jumlahMurid: 32,
  });
  assert(/asumsi/i.test(belum.kesiapan_murid.dasar ?? ''),
    'kesiapan tanpa informasi tidak ditandai sebagai asumsi');
});

// ═════════════════════════════════════════════════════════════════════════════
// M2.2 — VERSI CP HARUS DAPAT DIBUKTIKAN
// ═════════════════════════════════════════════════════════════════════════════
//
// Sampai M2.1 gerbang versi berbunyi "kalau ada dan berbeda, tolak", sehingga
// ATP yang tidak mencatat versinya sama sekali JUSTRU LOLOS — diam-diam
// diperlakukan seolah berpangkal pada acuan yang berlaku.
//
// VERSI TIDAK DIKETAHUI BUKAN VERSI YANG COCOK. Dan tidak diketahui juga tidak
// boleh dibaca ke arah sebaliknya: kosong tidak berarti "pasti CP lama".

Deno.test('M2-AG: versi warisan sama persis dengan acuan berlaku → lolos', () => {
  // Versinya diambil dari acuan yang berlaku, bukan ditulis sebagai angka mati.
  const versiBerlaku = acuanUntuk(MAPEL, FASE)!.versi_cp;
  const r = periksaLayananCp(MAPEL, FASE, versiBerlaku);
  assertEquals(r.didukung, true, r.alasan.join('; '));
  assertEquals(r.alasan, []);
  assertEquals(r.versi_acuan, versiBerlaku);
});

Deno.test('M2-AH: versi warisan berbeda dari acuan berlaku → ditolak', () => {
  const versiBerlaku = acuanUntuk(MAPEL, FASE)!.versi_cp;
  const versiLain = `${versiBerlaku}-BUKAN`;
  const r = periksaLayananCp(MAPEL, FASE, versiLain);
  assertEquals(r.didukung, false);
  assert(r.alasan.some(a => a.includes(versiLain) && a.includes(versiBerlaku)),
    'alasan tidak menyebut kedua versi yang dibandingkan');
});

Deno.test('M2-AI: versi warisan null → ditolak', () => {
  const r = periksaLayananCp(MAPEL, FASE, null);
  assertEquals(r.didukung, false, 'ATP tanpa catatan versi masih boleh melahirkan Modul baru');
  assertEquals(r.alasan.length, 1, 'lebih dari satu sebab untuk satu keadaan');
  // Kombinasinya sendiri memang dilayani — yang menolak murni ketiadaan versi.
  assertEquals(periksaLayananCp(MAPEL, FASE, r.versi_acuan).didukung, true);
});

Deno.test('M2-AJ: versi warisan string kosong atau spasi → ditolak', () => {
  for (const v of ['', '   ', '\t']) {
    const r = periksaLayananCp(MAPEL, FASE, v);
    assertEquals(r.didukung, false, `versi ${JSON.stringify(v)} lolos`);
  }
  // Dan alasannya sama dengan null — keduanya keadaan yang sama.
  assertEquals(periksaLayananCp(MAPEL, FASE, '').alasan,
               periksaLayananCp(MAPEL, FASE, null).alasan);
});

Deno.test('M2-AK: kombinasi yang tidak dilayani ditolak, versi apa pun yang diberikan', () => {
  const versiBerlaku = acuanUntuk(MAPEL, FASE)!.versi_cp;
  for (const v of [versiBerlaku, 'apa pun', null, '']) {
    const r = periksaLayananCp('Matematika', 'F', v);
    assertEquals(r.didukung, false, `mapel tak dilayani lolos dengan versi ${JSON.stringify(v)}`);
  }
  // Sebabnya datang dari statusLayanan(), bukan dari pemeriksaan versi.
  assert(periksaLayananCp('Matematika', 'F', versiBerlaku).alasan.length > 0);
  assertEquals(periksaLayananCp('Matematika', 'F', versiBerlaku).versi_acuan, null);
});

Deno.test('M2-AL: alasan versi kosong menyatakan TIDAK TERVERIFIKASI, bukan menuduh CP lama', () => {
  const [alasan] = periksaLayananCp(MAPEL, FASE, null).alasan;

  assert(/tidak mencatat versi/i.test(alasan),
    'alasan tidak menyebut bahwa versinya memang tidak tercatat');
  assert(/tidak dapat dipastikan|belum dapat dipastikan/i.test(alasan),
    'alasan tidak menyatakan ketidakpastiannya');
  assert(/susun ulang/i.test(alasan), 'alasan tidak memberi jalan keluar kepada guru');

  // TIDAK boleh mengklaim tahu versi mana yang dipakai — menebak "pasti CP lama"
  // sama mengarangnya dengan menebak "pasti CP sekarang".
  assert(!/\d{3}\/H\/KR\/\d{4}/.test(alasan),
    'alasan menyebut nomor versi tertentu padahal versinya tidak diketahui');
  assert(!/lama|kedaluwarsa|dicabut|2024/i.test(alasan),
    'alasan menuduh ATP berpangkal pada CP lama padahal itu tidak diketahui');
});

Deno.test('M2-AM: gerbang versi tidak menyentuh jalur membaca dokumen lama', async () => {
  for (const berkas of ['rancang-chat.js', 'rancang-chat-api.js', 'classroom-unduh.js']) {
    const src = await Deno.readTextFile(new URL(`../guru/js/${berkas}`, import.meta.url));
    assert(!/periksaLayananCp|versi_acuan/.test(src),
      `${berkas} ikut menjalankan gerbang versi`);
  }
  // Di server pun gerbangnya hanya satu titik, dan hanya di jalur penyusunan.
  const ef = await Deno.readTextFile(EF_MODUL);
  assertEquals([...ef.matchAll(/periksaLayananCp\(/g)].length, 1,
    'gerbang versi dipanggil di lebih dari satu tempat');

  // Urutannya: sesudah anchor M1 dan gerbangnya, sebelum penguraian tuntutan
  // dan sebelum satu pun panggilan model.
  const iAnchor  = ef.indexOf('const gerbang = periksaAnchor({');
  const iVersi   = ef.indexOf('periksaLayananCp(atpMapel, atpFase');
  const iTuntutan = ef.indexOf('uraikanTuntutan(atpMapel, atpFase');
  const iModel   = ef.indexOf('await callPhase(');
  assert(iAnchor > 0 && iVersi > iAnchor, 'gerbang versi mendahului gerbang anchor M1');
  assert(iTuntutan > iVersi, 'tuntutan diuraikan sebelum versi diperiksa');
  assert(iModel > iVersi, 'model dipanggil sebelum versi diperiksa');
});

Deno.test('M2-AN: nomor versi tidak pernah ditulis keras — otoritasnya helper ATP', async () => {
  const bersih = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const pola = /\d{3}\/H\/KR\/\d{4}/;

  for (const [nama, url] of [
    ['generate-modul/index.ts', EF_MODUL],
    ['generate-modul/warisan.ts', new URL('../supabase/functions/generate-modul/warisan.ts', import.meta.url)],
    ['generate-modul/anchor.ts', new URL('../supabase/functions/generate-modul/anchor.ts', import.meta.url)],
  ] as const) {
    assert(!pola.test(bersih(await Deno.readTextFile(url))),
      `${nama} menuliskan nomor versi CP secara langsung`);
  }

  // Otoritasnya memang statusLayanan() milik ATP.
  const warisanSrc = await Deno.readTextFile(
    new URL('../supabase/functions/generate-modul/warisan.ts', import.meta.url));
  assert(/const s = statusLayanan\(mapel, fase\)/.test(warisanSrc),
    'gerbang versi tidak berpangkal pada statusLayanan()');
  assert(/const versiAcuan = s\.acuan\?\.versi_cp/.test(warisanSrc),
    'versi acuan tidak dibaca dari hasil statusLayanan()');
});
