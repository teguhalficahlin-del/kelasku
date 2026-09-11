// UNDUH MODUL .docx — JALUR TOMBOL DIJALANKAN SUNGGUHAN (hotfix 11 Sep 2026).
//
// Smoke UI produksi: tombol "Unduh .docx" melempar
//   ReferenceError: konten is not defined
// dari generateModulDocx() — baris M8 memanggil blokKonteksDocx(children,
// konten, …) padahal variabel isi modul di fungsi itu bernama `k`. Cabangnya
// dilewati hampir SEMUA modul, lama maupun baru.
//
// Uji M8 lolos 23/0 karena tidak satu pun menjalankan generateModulDocx():
// helper-nya dijalankan terpisah, dan pemanggilnya hanya dicari sebagai TEKS —
// termasuk teks yang salah itu sendiri.
//
// Berkas ini menjalankan TIGA berkas yang benar-benar dimuat peramban guru,
// apa adanya, dalam satu `window`:
//   - guru/js/modul-tampilan.js   (otoritas penyajian bersama)
//   - library docx dari URL CDN yang SAMA dengan loadDocxLib() di pengunduh
//   - guru/js/classroom-unduh.js  (satu baris ditambahkan sebelum penutup IIFE
//                                  untuk mengekspos fungsi privatnya; tidak ada
//                                  logika yang disalin)
// Yang ditiru hanyalah API peramban: document, URL, setTimeout, alert.
//
// DOCX-1   Modul V4 terkini (fixture produksi fff9db36) → .docx terbentuk,
//          Pertimbangan Konteks tercetak dari isi modul itu sendiri
// DOCX-1b  jalur tombol penuh: generateModulDocx → saveDocx → berkas bernama
// DOCX-2   Modul historis tanpa hash (tp02–tp06) melewati cabang yang sama
//          tanpa jatuh, dan tidak mendapat bagian konteks kosong
//
// Jalankan:
//   deno test --allow-read --allow-net tests/modul-unduh-docx.test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';

const AKAR      = new URL('../', import.meta.url);
const UNDUH     = new URL('guru/js/classroom-unduh.js', AKAR);
const TAMPILAN  = new URL('guru/js/modul-tampilan.js', AKAR);
const FIX_V4    = new URL('tests/fixtures/unduh/modul-v4-tp01.json', AKAR);
const FIX_LAMA  = new URL('tests/fixtures/modul/', AKAR);

const ATP   = { mapel: 'Bahasa Inggris', fase: 'E', jenjang: 'SMK' };
const IDENT = {
  nama_guru: 'Guru Uji', nip_guru: '-', nama_kelas: 'X Uji', program_keahlian: 'Busana',
  semester: '1', tahun_ajaran: '2026/2027',
};

type Unduhan = { nama: string; tipe: string; ukuran: number };
// deno-lint-ignore no-explicit-any
type Peramban = { win: any; unduhan: Unduhan[] };

async function muatPeramban(): Promise<Peramban> {
  // deno-lint-ignore no-explicit-any
  const win: any = { addEventListener() {} };
  const unduhan: Unduhan[] = [];
  const blobs = new Map<string, Blob>();

  // 1. Otoritas penyajian bersama — dimuat sebelum pengunduh, seperti di classroom.html.
  new Function('window', await Deno.readTextFile(TAMPILAN))(win);
  assert(win.ModulTampilan, 'ModulTampilan tidak terpasang');

  // 2. Library docx dari URL yang SAMA dengan yang dimuat tombol di produksi.
  const src = await Deno.readTextFile(UNDUH);
  const cdn = src.match(/s\.src = '([^']*docx[^']*)'/)?.[1];
  assert(cdn, 'URL library docx tidak ditemukan di loadDocxLib()');
  const lib = await (await fetch(cdn!)).text();
  new Function('window', 'self', 'globalThis', 'module', 'exports', 'define', lib)(
    win, win, win, undefined, undefined, undefined);
  assert(win.docx?.Packer, 'library docx tidak terpasang ke window');

  // 3. Pengunduh apa adanya; satu baris mengekspos fungsi privat IIFE-nya.
  const penutup = src.lastIndexOf('}());');
  assert(penutup > 0, 'penutup IIFE classroom-unduh.js tidak ditemukan');
  const kode = src.slice(0, penutup) +
    'window.__ujiUnduh = { generateModulDocx: generateModulDocx, saveDocx: saveDocx };\n' +
    src.slice(penutup);

  const dokumen = {
    createElement(tag: string) {
      if (tag !== 'a') return { src: '', onload: null, onerror: null };
      return {
        href: '', download: '',
        click() {
          const b = blobs.get(this.href);
          unduhan.push({ nama: this.download, tipe: b?.type ?? '', ukuran: b?.size ?? 0 });
        },
      };
    },
    body: { appendChild() {}, removeChild() {} },
    head: { appendChild() {} },
    getElementById() { return null; },
    querySelectorAll() { return []; },
  };
  let n = 0;
  const url = {
    createObjectURL(b: Blob) { const u = `blob:uji/${++n}`; blobs.set(u, b); return u; },
    revokeObjectURL() {},
  };
  // saveDocx menjadwalkan pembersihan 1 detik kemudian; uji tidak menunggunya.
  const setTimeoutUji = () => 0;
  const alertUji = (m: string) => { throw new Error('alert dipanggil: ' + m); };

  new Function('window', 'document', 'URL', 'setTimeout', 'alert', kode)(
    win, dokumen, url, setTimeoutUji, alertUji);
  assert(win.__ujiUnduh?.generateModulDocx, 'generateModulDocx tidak terekspos');
  return { win, unduhan };
}

/** Teks polos word/document.xml dari berkas .docx yang benar-benar dikemas.
 *  Pembaca zip minimal di atas DecompressionStream bawaan — repo ini punya
 *  node_modules milik Playwright, jadi paket npm tambahan tidak dipakai. */
async function teksDocx(bytes: Uint8Array): Promise<string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  assert(eocd >= 0, 'bukan berkas zip (.docx)');
  const jumlah = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dek = new TextDecoder();
  for (let n = 0; n < jumlah; n++) {
    const metode = v.getUint16(p + 10, true);
    const ukuranZip = v.getUint32(p + 20, true);
    const panjangNama = v.getUint16(p + 28, true);
    const panjangEkstra = v.getUint16(p + 30, true);
    const panjangKomentar = v.getUint16(p + 32, true);
    const lokal = v.getUint32(p + 42, true);
    const nama = dek.decode(bytes.subarray(p + 46, p + 46 + panjangNama));
    if (nama === 'word/document.xml') {
      const awal = lokal + 30 + v.getUint16(lokal + 26, true) + v.getUint16(lokal + 28, true);
      const data = bytes.subarray(awal, awal + ukuranZip);
      const xml = metode === 0 ? dek.decode(data) : await new Response(
        new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      return xml.replace(/<[^>]+>/g, '');
    }
    p += 46 + panjangNama + panjangEkstra + panjangKomentar;
  }
  throw new Error('word/document.xml tidak ada di dalam .docx');
}

const P = await muatPeramban();
const V4 = JSON.parse(await Deno.readTextFile(FIX_V4));

// ── DOCX-1 ───────────────────────────────────────────────────────────────────

Deno.test('DOCX-1 — Modul V4 terkini: generateModulDocx() selesai dan Pertimbangan Konteks tercetak dari isinya', async () => {
  const k = V4.konten;
  assertEquals(k.schema_version, '4.0.0');
  assert(Array.isArray(k.keputusan_kontekstual) && k.keputusan_kontekstual.length === 3);
  assert(Array.isArray(k.pertemuan) && k.pertemuan.length > 0);
  assert(Array.isArray(k.naskah_fasilitasi) && k.naskah_fasilitasi.length > 0);
  assert(k.instrumen_pembelajaran?.length && k.instrumen_asesmen?.length);

  const doc = P.win.__ujiUnduh.generateModulDocx(
    { nomor_tp: V4.nomor_tp, tp_judul: V4.tp_judul, konten: k }, ATP, IDENT);
  const bytes: Uint8Array = await P.win.docx.Packer.toBuffer(doc);
  assert(bytes.length > 5000, `berkas .docx terlalu kecil: ${bytes.length} byte`);

  const teks = await teksDocx(bytes);
  assert(teks.includes('C2. Pertimbangan Konteks'), 'bagian Pertimbangan Konteks tidak tercetak');
  // Isi keputusan berasal dari objek konten modul ini — bukti blokKonteksDocx
  // menerima isi modul yang sebenarnya, bukan objek kosong atau yang lain.
  for (const e of k.keputusan_kontekstual) {
    const awal = String(e.keputusan).slice(0, 40);
    assert(teks.includes(awal), `keputusan konteks tidak tercetak: "${awal}"`);
  }
  assert(teks.includes('D. Desain Pembelajaran'), 'bab D hilang');
  assert(teks.indexOf('C2. Pertimbangan Konteks') < teks.indexOf('D. Desain Pembelajaran'),
    'C2 harus tercetak sebelum bab D');
  assert(!/KTX-0\d/.test(teks), 'ID internal KTX bocor ke dokumen cetak');
});

// ── DOCX-1b ──────────────────────────────────────────────────────────────────

Deno.test('DOCX-1b — jalur tombol penuh: generateModulDocx → saveDocx menghasilkan berkas .docx bernama', async () => {
  const sebelum = P.unduhan.length;
  const { generateModulDocx, saveDocx } = P.win.__ujiUnduh;
  const doc = generateModulDocx({ nomor_tp: V4.nomor_tp, tp_judul: V4.tp_judul, konten: V4.konten }, ATP, IDENT);
  await saveDocx(doc, 'Modul_TP1_uji.docx');
  assertEquals(P.unduhan.length, sebelum + 1, 'tidak ada berkas yang diserahkan untuk diunduh');
  const u = P.unduhan[P.unduhan.length - 1];
  assertEquals(u.nama, 'Modul_TP1_uji.docx');
  assert(u.ukuran > 5000, `blob terlalu kecil: ${u.ukuran}`);
  assertEquals(u.tipe, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});

// ── DOCX-2 ───────────────────────────────────────────────────────────────────

Deno.test('DOCX-2 — Modul historis tanpa hash melewati cabang yang sama tanpa jatuh', async () => {
  for (const nama of ['tp02', 'tp03', 'tp04', 'tp05', 'tp06']) {
    const f = JSON.parse(await Deno.readTextFile(new URL(nama + '.json', FIX_LAMA)));
    const k = f.konten;
    assert(!('tp_snapshot_hash' in f), `${nama}: fixture historis tidak boleh punya hash`);
    assert(!('keputusan_kontekstual' in k), `${nama}: fixture historis tidak punya jejak M6`);
    // Cabang yang jatuh di produksi: harus benar-benar dilewati fixture ini.
    const r = k.rancangan ?? {};
    const lewatCabang = !!(k.identitas?.tujuan_pembelajaran || r.strategi_pedagogis ||
      r.lingkungan_pembelajaran || r.kemitraan_pembelajaran || r.keselamatan_k3 ||
      r.pemanfaatan_digital || (Array.isArray(r.sumber_belajar) && r.sumber_belajar.length));
    assert(lewatCabang, `${nama}: tidak melewati cabang bab D — uji ini tidak membuktikan apa pun untuknya`);

    const doc = P.win.__ujiUnduh.generateModulDocx(
      { nomor_tp: Number(nama.slice(2)), tp_judul: `TP historis ${nama}`, konten: k }, ATP, IDENT);
    const bytes: Uint8Array = await P.win.docx.Packer.toBuffer(doc);
    assert(bytes.length > 5000, `${nama}: berkas .docx terlalu kecil`);
    const teks = await teksDocx(bytes);
    assert(teks.includes('D. Desain Pembelajaran'), `${nama}: bab D hilang`);
    assert(!teks.includes('C2. Pertimbangan Konteks'), `${nama}: dokumen pra-M6 mendapat bagian konteks kosong`);
  }
});
