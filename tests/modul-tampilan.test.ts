// M8 — PARITAS RENDERER.
//
//   Modul JSON → renderer → dokumen yang guru lihat / unduh
//
// Masalah yang M8 cegah: data benar di JSON, tetapi renderer menyembunyikannya,
// salah menampilkannya, atau mengubah maknanya. Renderer BUKAN otoritas kedua —
// ia menyajikan nilai yang sudah ada, tidak memutuskan apa pun.
//
// APA YANG DIUJI DI SINI, DAN APA YANG TIDAK:
//
//   field punya jalur penyajian          → M8
//   nilainya muncul utuh dan berlabel    → M8
//   dokumen lama tidak menghasilkan sampah → M8
//   kalimatnya enak dibaca / rancangannya indah → BUKAN M8, dan bukan M9 juga:
//     itu penilaian visual yang tidak dapat dibuktikan deterministik
//
// Tidak ada uji piksel dan tidak ada ambang subjektif. Yang diperiksa: judul
// benar, nilai ada, daftar bersarang tidak hilang, field opsional tidak
// menghasilkan judul kosong, dan ID internal tidak bocor.
//
// M8-A..M8-C   otoritas penyajian: ambang M4, cakupan bukti, penjelasan
// M8-D..M8-F   pertimbangan konteks M6 — manusiawi, tanpa ID internal
// M8-G..M8-J   Naskah M7: amati, jika tercapai / jika belum, SUMATIF
// M8-K..M8-M   dokumen historis: tidak crash, tidak undefined, tidak judul kosong
// M8-N..M8-Q   paritas jalur: pratinjau DAN pengunduh memakai otoritas yang sama
// M8-S..M8-V   jalur .docx DIJALANKAN, bukan sekadar dibaca namanya
//
// TIDAK ADA panggilan model di berkas ini.

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

const AKAR      = new URL('../', import.meta.url);
const TAMPILAN  = new URL('guru/js/modul-tampilan.js', AKAR);
const PREVIEW   = new URL('guru/js/rancang-chat.js', AKAR);
const UNDUH     = new URL('guru/js/classroom-unduh.js', AKAR);
const HTML      = new URL('guru/classroom.html', AKAR);
const FIXTURES  = new URL('tests/fixtures/modul/', AKAR);

type Blok = { judul: string; keputusan: string | null; penerapan: string | null; terlihat: string[] };
type Grup = { label: string; butir: string[] };
type Tampilan = {
  kalimatKetercapaian:     (k: unknown) => string | null;
  kalimatPenjelasanAmbang: (k: unknown) => string | null;
  kalimatCakupanBukti:     (e: unknown) => string | null;
  blokPertimbanganKonteks: (k: unknown) => Blok[];
  blokNaskahTambahan:      (s: unknown) => Grup[];
  ISTILAH_SUMBER_KONTEKS:  Record<string, string>;
};

/** Dimuat dari SUMBER yang benar-benar dikirim ke peramban — bukan disalin ke
 *  harness. Berkasnya IIFE yang menempel ke global, jadi cukup dijalankan. */
async function muatTampilan(): Promise<Tampilan> {
  const src = await Deno.readTextFile(TAMPILAN);
  const sandbox: Record<string, unknown> = {};
  new Function('window', src)(sandbox);
  const mod = sandbox.ModulTampilan as Tampilan | undefined;
  assert(mod, 'ModulTampilan tidak terpasang ke global');
  return mod!;
}

const MT = await muatTampilan();

type Konten = Record<string, unknown>;

function kktp(keputusan: unknown, ambang?: string): Konten {
  const k: Konten = { id_kktp: 'K1', kriteria: 'Murid menyebut simbol perawatan.' };
  if (keputusan !== undefined) k.keputusan_ketercapaian = keputusan;
  if (ambang !== undefined) k.ambang_batas = ambang;
  return k;
}

// ══ A–C — AMBANG M4: OTORITAS TAMPIL, PERANNYA TIDAK DIBALIK ═════════════════

Deno.test('M8-A: keputusan_ketercapaian tampil sebagai kalimat yang dapat dihitung', () => {
  // Sebelum M8 field ini TIDAK muncul di satu renderer pun — guru melihat
  // penjelasannya dan kehilangan angka yang dipakai memutuskan.
  assertEquals(
    MT.kalimatKetercapaian(kktp({ jenis: 'jumlah', nilai_minimum: 4, satuan: 'simbol', deskripsi: 'x' })),
    'Tercapai bila minimal 4 simbol');

  // Bentuknya mengikuti jenisnya supaya tidak janggal.
  assertEquals(
    MT.kalimatKetercapaian(kktp({ jenis: 'rubrik', nilai_minimum: 3, satuan: 'level', deskripsi: 'x' })),
    'Tercapai bila minimal level 3');
  assertEquals(
    MT.kalimatKetercapaian(kktp({ jenis: 'persentase', nilai_minimum: 75, satuan: 'persen dari 4 tahapan', deskripsi: 'x' })),
    'Tercapai bila minimal 75 persen dari 4 tahapan');
});

Deno.test('M8-B: penyajian tidak MENGHITUNG apa pun — hanya menyusun ulang', () => {
  // Renderer bukan otoritas kedua: angka yang keluar wajib angka yang masuk.
  for (const nilai of [1, 4, 17, 80]) {
    const teks = MT.kalimatKetercapaian(kktp({ jenis: 'jumlah', nilai_minimum: nilai, satuan: 'butir', deskripsi: '' }));
    assertStringIncludes(String(teks), String(nilai));
  }
  // Ambang yang tidak sah tidak dikarang menjadi kalimat.
  for (const rusak of [{ jenis: 'jumlah', nilai_minimum: 'empat', satuan: 'butir' },
                       { jenis: 'jumlah', nilai_minimum: 4, satuan: '' },
                       { jenis: 'jumlah' }, null, undefined]) {
    assertEquals(MT.kalimatKetercapaian(kktp(rusak)), null);
  }
});

Deno.test('M8-C: ambang_batas tetap penjelasan, bukan pengganti otoritas', () => {
  // Deskripsi terstruktur diutamakan; ambang_batas dipakai bila itu yang ada
  // (dokumen lama). Perannya tidak pernah dibalik: `kalimatKetercapaian`
  // TIDAK pernah membaca ambang_batas.
  assertEquals(
    MT.kalimatPenjelasanAmbang(kktp({ jenis: 'jumlah', nilai_minimum: 4, satuan: 'simbol', deskripsi: 'Benar 4 dari 5.' }, 'minimal 4 aspek')),
    'Benar 4 dari 5.');
  assertEquals(MT.kalimatPenjelasanAmbang(kktp(undefined, 'minimal 4 aspek')), 'minimal 4 aspek');
  assertEquals(MT.kalimatPenjelasanAmbang(kktp(undefined)), null);
  // Dokumen lama: hanya ambang_batas, tanpa otoritas terstruktur.
  assertEquals(MT.kalimatKetercapaian(kktp(undefined, 'Mandiri')), null);

  assertEquals(MT.kalimatCakupanBukti({ cakupan_bukti: 'per_murid' }), 'bukti dikumpulkan per murid');
  assertEquals(MT.kalimatCakupanBukti({ cakupan_bukti: 'kelompok' }), 'bukti dikumpulkan per kelompok');
  assertEquals(MT.kalimatCakupanBukti({}), null);
});

// ══ D–F — PERTIMBANGAN KONTEKS (M6) ══════════════════════════════════════════

const KTX_CONTOH = {
  keputusan_kontekstual: [{
    id: 'KTX-01',
    sumber: { jenis: 'kesiapan_murid', kunci: 'jauh_di_bawah' },
    keputusan: 'Menambah tahap contoh bertahap sebelum murid bekerja sendiri.',
    komponen_terdampak: ['pertemuan:1', 'sub_langkah:P1.MEMAHAMI.1', 'kktp:K1'],
    penerapan: 'Diterapkan pada kegiatan membaca label di pertemuan pertama.',
  }],
};

Deno.test('M8-D: keputusan_kontekstual tampil — sebelum M8 tidak muncul sama sekali', () => {
  const blok = MT.blokPertimbanganKonteks(KTX_CONTOH);
  assertEquals(blok.length, 1);
  assertStringIncludes(blok[0].judul, 'Kesiapan murid');
  assertStringIncludes(blok[0].judul, 'jauh_di_bawah');   // nilai otoritas apa adanya
  assertStringIncludes(String(blok[0].keputusan), 'contoh bertahap');
  assertStringIncludes(String(blok[0].penerapan), 'pertemuan pertama');
});

Deno.test('M8-E: ID internal TIDAK bocor ke guru', () => {
  const blok = MT.blokPertimbanganKonteks(KTX_CONTOH);
  const semua = JSON.stringify(blok);
  assert(!semua.includes('KTX-01'), 'ID jejak bocor ke tampilan');
  assert(!semua.includes('sub_langkah:'), 'alamat sub_langkah bocor ke tampilan');
  assert(!semua.includes('kktp:K1'), 'alamat KKTP bocor ke tampilan');
  // Yang berguna bagi guru tetap disajikan, dalam bentuk manusiawi.
  assertEquals(blok[0].terlihat, ['Pertemuan 1']);
});

Deno.test('M8-F: jejak yang tidak dikenal atau kosong tidak menghasilkan sampah', () => {
  assertEquals(MT.blokPertimbanganKonteks({}), []);
  assertEquals(MT.blokPertimbanganKonteks({ keputusan_kontekstual: [] }), []);
  // Entri tanpa sumber dilewati, bukan tampil sebagai judul kosong.
  assertEquals(MT.blokPertimbanganKonteks({ keputusan_kontekstual: [{ id: 'KTX-01' }] }), []);
  // Sumber di luar daftar istilah tetap tampil apa adanya — dokumen boleh
  // memuat nilai yang belum pernah ada di peta.
  const b = MT.blokPertimbanganKonteks({
    keputusan_kontekstual: [{ sumber: { jenis: 'sumber_baru', kunci: 'x' }, keputusan: 'k', penerapan: 'p', komponen_terdampak: [] }],
  });
  assertEquals(b.length, 1);
  assertStringIncludes(b[0].judul, 'sumber_baru');
});

// ══ G–J — NASKAH M7 ═════════════════════════════════════════════════════════

Deno.test('M8-G: yang_diamati tampil berlabel', () => {
  const g = MT.blokNaskahTambahan({ yang_diamati: ['Apakah murid menyebut simbolnya.', 'Apakah urutannya runtut.'] });
  assertEquals(g.length, 1);
  assertEquals(g[0].label, 'Yang Diamati');
  assertEquals(g[0].butir.length, 2, 'daftar bersarang tidak boleh hilang');
});

Deno.test('M8-H: putusan_lanjut tampil sebagai dua keputusan terpisah', () => {
  const g = MT.blokNaskahTambahan({
    yang_diamati: ['Apakah murid menyebut simbolnya.'],
    putusan_lanjut: { jika_tercapai: 'Lanjut ke penerapan.', jika_belum: 'Ulangi bagian yang terlewat.' },
  });
  assertEquals(g.map(x => x.label), ['Yang Diamati', 'Jika Tercapai', 'Jika Belum']);
  assertEquals(g[1].butir, ['Lanjut ke penerapan.']);
  assertEquals(g[2].butir, ['Ulangi bagian yang terlewat.']);
});

Deno.test('M8-I: SUMATIF tanpa putusan_lanjut TIDAK terlihat rusak', () => {
  // M7.1 membolehkan sumatif tanpa keputusan lanjut. Renderer tidak boleh
  // menampilkan judul kosong atau tanda bahwa ada yang hilang — bagiannya
  // sekadar tidak ada.
  const hanyaAmati = MT.blokNaskahTambahan({ yang_diamati: ['Apakah alur konsultasinya runtut.'] });
  assertEquals(hanyaAmati.map(x => x.label), ['Yang Diamati']);

  const kosongSama_sekali = MT.blokNaskahTambahan({ ref: 'P3.MENGAPLIKASI.2' });
  assertEquals(kosongSama_sekali, [], 'sub_langkah tanpa field M7 tidak menghasilkan grup apa pun');
});

Deno.test('M8-J: field kosong/hampa tidak menghasilkan judul kosong', () => {
  assertEquals(MT.blokNaskahTambahan({ yang_diamati: [] }), []);
  assertEquals(MT.blokNaskahTambahan({ yang_diamati: ['   ', ''] }), []);
  assertEquals(MT.blokNaskahTambahan({ putusan_lanjut: { jika_tercapai: '', jika_belum: '  ' } }), []);
  // Satu cabang terisi, satu kosong → hanya yang terisi yang muncul.
  const g = MT.blokNaskahTambahan({ putusan_lanjut: { jika_tercapai: 'Lanjut.', jika_belum: '' } });
  assertEquals(g.map(x => x.label), ['Jika Tercapai']);
});

// ══ K–M — DOKUMEN HISTORIS ═══════════════════════════════════════════════════

Deno.test('M8-K: kelima dokumen historis tidak menghasilkan sampah tampilan', async () => {
  for (const nama of ['tp02', 'tp03', 'tp04', 'tp05', 'tp06']) {
    const konten = JSON.parse(await Deno.readTextFile(new URL(nama + '.json', FIXTURES))).konten;

    // Tidak crash, dan tidak menghasilkan bagian yang tidak ada isinya.
    assertEquals(MT.blokPertimbanganKonteks(konten), [],
      `${nama}: dokumen pra-M6 seharusnya tidak menghasilkan bagian konteks`);

    for (const k of (konten.kktp ?? [])) {
      // Dokumen pra-M4: otoritas terstruktur belum ada → null, bukan "undefined".
      const ambang = MT.kalimatKetercapaian(k);
      assert(ambang === null || typeof ambang === 'string');
      const penjelasan = MT.kalimatPenjelasanAmbang(k);
      assert(penjelasan === null || typeof penjelasan === 'string');
      for (const teks of [ambang, penjelasan]) {
        if (teks === null) continue;
        assert(!/undefined|null|\[object Object\]/.test(teks), `${nama}: sampah di "${teks}"`);
      }
    }

    for (const np of (konten.naskah_fasilitasi ?? []))
      for (const lk of (np.langkah ?? []))
        for (const sl of (lk.sub_langkah ?? [])) {
          const g = MT.blokNaskahTambahan(sl);
          assertEquals(g, [], `${nama}: naskah pra-M7 seharusnya tidak menghasilkan grup M7`);
        }
  }
});

Deno.test('M8-L: masukan rusak tidak menghasilkan "undefined" atau "[object Object]"', () => {
  const rusak: unknown[] = [null, undefined, 0, '', [], 'teks', { kktp: null }];
  for (const r of rusak) {
    assertEquals(MT.blokPertimbanganKonteks(r), []);
    assertEquals(MT.blokNaskahTambahan(r), []);
    assertEquals(MT.kalimatKetercapaian(r), null);
    assertEquals(MT.kalimatPenjelasanAmbang(r), null);
    assertEquals(MT.kalimatCakupanBukti(r), null);
  }
});

Deno.test('M8-M: nilai bukan-string tidak dipaksa menjadi teks', () => {
  // `[object Object]` lahir dari memaksa objek menjadi string. Di sini nilai
  // yang bukan teks ditolak, bukan dirangkai.
  assertEquals(MT.kalimatPenjelasanAmbang({ ambang_batas: { a: 1 } }), null);
  assertEquals(MT.kalimatCakupanBukti({ cakupan_bukti: { a: 1 } }), null);
  assertEquals(MT.blokNaskahTambahan({ yang_diamati: [{ a: 1 }] }), []);
});

// ══ N–Q — PARITAS JALUR KELUARAN ═══════════════════════════════════════════════

Deno.test('M8-N: ada TEPAT DUA jalur keluaran, dan keduanya memakai otoritas yang sama', async () => {
  // Pratinjau HTML dan pengunduh .docx adalah dua implementasi terpisah —
  // bukan satu sumber HTML. Karena itu paritasnya harus dibuktikan, bukan
  // diandaikan.
  const preview = await Deno.readTextFile(PREVIEW);
  const unduh   = await Deno.readTextFile(UNDUH);
  for (const [nama, src] of [['pratinjau', preview], ['pengunduh', unduh]] as const) {
    assertStringIncludes(src, 'ModulTampilan', `${nama} tidak memakai otoritas penyajian bersama`);
  }
});

Deno.test('M8-O: KEEMPAT fungsi otoritas dipakai di KEDUA renderer', async () => {
  // DIPERKETAT DI M8.1.
  //
  // Versi pertama uji ini MENDOKUMENTASIKAN bahwa dua fungsi belum dipakai
  // `.docx` — dan dokumentasi bukan gerbang. Selama guru melihat sesuatu di
  // layar lalu kehilangannya di berkas yang ia cetak, paritasnya belum ada.
  //
  // Sekarang keempatnya dituntut di kedua jalur. Daftarnya DITURUNKAN dari
  // ekspor otoritas yang sebenarnya, bukan ditulis tangan — sebuah daftar
  // hardcoded dapat menyatakan paritas atas fungsi yang sudah tidak ada.
  // KOMENTAR DIBUANG LEBIH DULU. Tanpa ini, menyebut nama fungsi di sebuah
  // komentar sudah cukup membuat gerbang ini hijau — dan gerbang yang dapat
  // dipuaskan oleh komentar bukan gerbang. Terbukti saat uji negatif: dengan
  // pemakaiannya dihapus dari badan dokumen, uji ini tetap lulus karena namanya
  // masih tertulis di komentar kepala.
  const buangKomentar = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const preview = buangKomentar(await Deno.readTextFile(PREVIEW));
  const unduh   = buangKomentar(await Deno.readTextFile(UNDUH));
  const src     = await Deno.readTextFile(TAMPILAN);

  const diekspor = [...src.matchAll(/^\s{4}(\w+):\s+\w+,?$/gm)].map(m => m[1])
    .filter(x => x.startsWith('kalimat') || x.startsWith('blok'));
  assertEquals(diekspor.sort(), [
    'blokNaskahTambahan', 'blokPertimbanganKonteks',
    'kalimatCakupanBukti', 'kalimatKetercapaian', 'kalimatPenjelasanAmbang',
  ], 'daftar fungsi otoritas berubah — tinjau paritasnya');

  // `kalimatPenjelasanAmbang` dipakai pratinjau; pengunduh mencetak
  // `ambang_batas` apa adanya lewat jalurnya sendiri yang sudah ada sejak
  // sebelum M8, jadi ia tidak dituntut di sana.
  const wajibKeduanya = diekspor.filter(x => x !== 'kalimatPenjelasanAmbang');
  assertEquals(wajibKeduanya.length, 4);

  // DIPANGGIL, bukan sekadar DISEBUT. Sebuah penjaga `typeof MT.fn !== 'function'`
  // menyebut namanya tanpa memakainya; uji negatif membuktikan penjaga semacam
  // itu cukup membuat pemeriksaan "nama muncul" tetap hijau padahal
  // pemanggilannya sudah dihapus. Yang dituntut di sini posisi pemanggilan,
  // termasuk bentuk rantai opsional `fn?.(`.
  const dipanggil = (src: string, fn: string) =>
    new RegExp(fn + String.raw`\s*\??\.?\s*\(`).test(src);

  for (const fn of wajibKeduanya) {
    assert(dipanggil(preview, fn), `pratinjau tidak memanggil ${fn}`);
    assert(dipanggil(unduh, fn),
      `pengunduh tidak memanggil ${fn} — guru melihatnya di layar lalu kehilangannya saat mencetak`);
  }
});

Deno.test('M8-P: otoritas penyajian dimuat SEBELUM kedua renderer', async () => {
  const html = await Deno.readTextFile(HTML);
  const iTampilan = html.indexOf('modul-tampilan.js');
  const iChat     = html.indexOf('rancang-chat.js?');
  const iUnduh    = html.indexOf('classroom-unduh.js');
  assert(iTampilan > 0, 'modul-tampilan.js tidak dimuat di classroom.html');
  assert(iTampilan < iChat,  'modul-tampilan.js harus dimuat sebelum rancang-chat.js');
  assert(iTampilan < iUnduh, 'modul-tampilan.js harus dimuat sebelum classroom-unduh.js');
});

Deno.test('M8-Q: versi cache dinaikkan bersama perubahan JS', async () => {
  // CLAUDE.md: naikkan ?v= di classroom.html DAN CACHE_NAME di sw.js setiap
  // kali kode aplikasi berubah. Pernah terlewat sebelumnya; dijaga di sini.
  const html = await Deno.readTextFile(HTML);
  const sw   = await Deno.readTextFile(new URL('sw.js', AKAR));
  assertStringIncludes(html, 'modul-tampilan.js?v=');
  const m = sw.match(/CACHE_NAME\s*=\s*'miclass-v(\d+)'/);
  assert(m, 'CACHE_NAME tidak ditemukan di sw.js');
  assert(Number(m![1]) >= 29, `CACHE_NAME masih v${m![1]} — belum dinaikkan untuk M8`);
});

// ══ S–V — JALUR .docx DIJALANKAN, BUKAN SEKADAR DIBACA NAMANYA ══════════════
//
// Memeriksa bahwa nama fungsi muncul di sumber tidak membuktikan keluarannya
// dipakai: sebuah pemanggilan yang hasilnya dibuang akan lolos pemeriksaan
// seperti itu. Karena itu kedua jalur .docx yang M8.1 tambahkan sengaja berupa
// FUNGSI DI LINGKUP MODUL, sehingga uji dapat mengambil sumbernya, menjalankan
// dengan `D` tiruan, dan menghitung paragraf yang benar-benar dihasilkan.

/** Paragraf tiruan — cukup untuk merekam teks yang renderer hasilkan. */
type ParagrafTiruan = { teks: string };

/** Mengambil satu fungsi dari sumber pengunduh dan menjalankannya. */
async function muatFungsiDocx(nama: string): Promise<
  (children: ParagrafTiruan[], arg: unknown, D: unknown, MT: unknown) => void
> {
  const src = await Deno.readTextFile(UNDUH);
  const awal = src.indexOf(`function ${nama}(`);
  assert(awal > 0, `fungsi ${nama} tidak ada di classroom-unduh.js`);

  // Potong sampai kurung kurawal penutupnya sendiri.
  let depth = 0, akhir = -1, mulai = src.indexOf('{', awal);
  for (let i = mulai; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { akhir = i + 1; break; } }
  }
  assert(akhir > 0, `kurung penutup ${nama} tidak ditemukan`);

  // `subLabel` dipakai blokKonteksDocx; disediakan sebagai tiruan.
  const kode = `
    function subLabel(t) { return { teks: String(t) }; }
    ${src.slice(awal, akhir)}
    return ${nama};`;
  return new Function(kode)() as never;
}

/** `docx` tiruan: Paragraph merekam teks dari TextRun atau dari .text. */
const D_TIRUAN = {
  Paragraph: function (opt: Record<string, unknown>) {
    const runs = Array.isArray(opt.children) ? opt.children as Array<{ teks?: string }> : [];
    return { teks: runs.map(r => r?.teks ?? '').join('') || String(opt.text ?? '') };
  },
  TextRun: function (opt: Record<string, unknown>) { return { teks: String(opt.text ?? '') }; },
};

function jalankan(
  fn: (c: ParagrafTiruan[], a: unknown, D: unknown, MT: unknown) => void, arg: unknown,
): string[] {
  const children: ParagrafTiruan[] = [];
  // `new` pada fungsi tiruan mengembalikan objeknya, jadi D dipakai apa adanya.
  fn(children, arg, D_TIRUAN, MT);
  return children.map(p => p.teks);
}

Deno.test('M8-S: .docx BENAR-BENAR menghasilkan paragraf Pertimbangan Konteks', async () => {
  const fn = await muatFungsiDocx('blokKonteksDocx');
  const keluaran = jalankan(fn, KTX_CONTOH).filter(t => t.trim().length);

  // Ada judul bagiannya, dan isinya benar-benar tercetak.
  assert(keluaran.some(t => t.includes('C2. Pertimbangan Konteks')), `judul hilang: ${keluaran.join(' | ')}`);
  assert(keluaran.some(t => t.includes('Kesiapan murid') && t.includes('jauh_di_bawah')),
    `sumber + nilai otoritas hilang: ${keluaran.join(' | ')}`);
  assert(keluaran.some(t => t.includes('contoh bertahap')), 'keputusan hilang');
  assert(keluaran.some(t => t.includes('pertemuan pertama')), 'penerapan hilang');
  assert(keluaran.some(t => t.includes('Terlihat pada: Pertemuan 1')), 'informasi pertemuan hilang');

  // ID internal tetap tidak bocor ke dokumen cetak.
  const semua = keluaran.join(' ');
  assert(!semua.includes('KTX-01'));
  assert(!semua.includes('sub_langkah:'));
  assert(!semua.includes('kktp:K1'));
});

Deno.test('M8-T: dokumen historis TIDAK menghasilkan judul kosong di .docx', async () => {
  const fn = await muatFungsiDocx('blokKonteksDocx');
  for (const konten of [{}, { keputusan_kontekstual: [] }, { keputusan_kontekstual: [{ id: 'KTX-01' }] }]) {
    assertEquals(jalankan(fn, konten), [], 'bagian konteks muncul padahal tidak ada isinya');
  }
  // Fixture produksi sungguhan.
  for (const nama of ['tp02', 'tp03', 'tp04', 'tp05', 'tp06']) {
    const konten = JSON.parse(await Deno.readTextFile(new URL(nama + '.json', FIXTURES))).konten;
    const keluaran = jalankan(fn, konten);
    assertEquals(keluaran, [], `${nama}: dokumen pra-M6 mendapat bagian konteks`);
  }
});

Deno.test('M8-U: .docx BENAR-BENAR mencetak cakupan bukti di jalur asesmen', async () => {
  const fn = await muatFungsiDocx('barisCakupanDocx');
  assertEquals(jalankan(fn, { id: 'FMT-01', cakupan_bukti: 'per_murid' }),
    ['bukti dikumpulkan per murid']);
  assertEquals(jalankan(fn, { cakupan_bukti: 'kelompok' }),
    ['bukti dikumpulkan per kelompok']);
});

Deno.test('M8-V: cakupan bukti yang tidak ada tidak menghasilkan kalimat palsu', async () => {
  const fn = await muatFungsiDocx('barisCakupanDocx');
  for (const entri of [{}, { id: 'FMT-01' }, { cakupan_bukti: '' }, { cakupan_bukti: null }, null]) {
    assertEquals(jalankan(fn, entri), [], `kalimat dikarang untuk ${JSON.stringify(entri)}`);
  }
  // Dan pada entri asesmen fixture historis yang memang belum punya field itu.
  for (const nama of ['tp02', 'tp05']) {
    const konten = JSON.parse(await Deno.readTextFile(new URL(nama + '.json', FIXTURES))).konten;
    const ra = konten.rencana_asesmen ?? {};
    for (const f of (ra.asesmen_formatif ?? [])) assertEquals(jalankan(fn, f), []);
    if (ra.asesmen_sumatif) assertEquals(jalankan(fn, ra.asesmen_sumatif), []);
  }
});

Deno.test('M8-W: kedua jalur .docx dipanggil dari badan dokumen, bukan hanya didefinisikan', async () => {
  // Fungsi yang ada tetapi tidak pernah dipanggil sama saja dengan tidak ada.
  const src = await Deno.readTextFile(UNDUH);
  const tanpaDefinisi = src.replace(/function (blokKonteksDocx|barisCakupanDocx)\([^)]*\)/g, '');
  assertStringIncludes(tanpaDefinisi, 'blokKonteksDocx(children, konten, D, window.ModulTampilan)');
  assertStringIncludes(tanpaDefinisi, 'barisCakupanDocx(children, af, D, window.ModulTampilan)');
  assertStringIncludes(tanpaDefinisi, 'barisCakupanDocx(children, suma, D, window.ModulTampilan)');

  // Dan C2 disisipkan SEBELUM bab D \u2014 penomoran A\u2013I tidak bergeser.
  const iKonteks = src.indexOf('blokKonteksDocx(children, konten');
  const iBabD    = src.indexOf("sectionHeading('D. Desain Pembelajaran')");
  assert(iKonteks > 0 && iKonteks < iBabD, 'C2 tidak berada tepat sebelum bab D');
  for (const bab of ['A. Identifikasi', 'B. Fokus Materi', 'C. Kriteria', 'D. Desain',
                     'E. Langkah', 'F. Asesmen', 'G. Tindak', 'H. Catatan', 'I. Instrumen']) {
    assertStringIncludes(src, bab, `penomoran bab bergeser: ${bab} hilang`);
  }
});

// \u2550\u2550 PENJAGA: RENDERER TIDAK MEMUTUSKAN \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550════

Deno.test('M8-R: otoritas penyajian tidak memuat aritmetika ambang', async () => {
  // Penjaga terhadap diri sendiri. Kalau suatu saat ada yang menghitung ambang
  // di renderer, ia menjadi otoritas kedua — dan uji ini gagal.
  const src = await Deno.readTextFile(TAMPILAN);
  const isi = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const pola of [/Math\./, /\bround\b/, /\bceil\b/, /\bfloor\b/, /nilai_minimum\s*[*/+-]/]) {
    assert(!pola.test(isi), `modul-tampilan.js memuat perhitungan: ${pola}`);
  }
});
