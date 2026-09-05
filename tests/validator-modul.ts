#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * tests/validator-modul.ts — jaring regresi untuk validator ModulOutput V4.0.
 *
 * KENAPA ADA.
 * Validator generate-modul punya belasan aturan, dan beberapa di antaranya
 * dikalibrasi dengan susah payah — keputusan yang tidak terlihat dari kodenya:
 *
 *   - ambang persentase (V14) sempat menjatuhkan TIGA DARI EMPAT modul sebelum
 *     dipersempit hanya ke satuan yang bisa dihitung jari ("80% tahapan" dari
 *     empat tahapan mustahil tercapai; "80% data terisi" wajar dan dibiarkan)
 *   - penelusuran kutipan (V15) dipersempit DUA KALI. Versi pertama menandai
 *     setiap kalimat Inggris berkutip di langkah yang menyebut instrumen, dan
 *     itu menyalakan peringatan di ketiga modul yang sehat — guru memang boleh
 *     mengucapkan kalimat Inggris karangannya sendiri
 *   - larangan perangkat digital (V13) sempat menuduh kata "aplikasi" yang
 *     ternyata potongan dari nama tahap MENGAPLIKASI
 *
 * Tanpa berkas ini, sesi berikutnya yang memperketat sebuah aturan tidak punya
 * cara tahu ia baru saja membuat empat modul sehat jadi ditolak. Gerbang yang
 * salah tuduh memakan jatah generate guru — lima kali sehari, tidak bisa
 * dikembalikan.
 *
 * CARA PAKAI.
 *   deno run --allow-read --allow-write tests/validator-modul.ts
 *
 * MENAMBAH CONTOH BARU.
 * Ambil modul dari basis data, simpan ke tests/fixtures/modul/tpNN.json
 * dengan bentuk { _harapan: {...}, konten: {...} }, lalu jalankan uji ini.
 * Modul yang SEHAT sama pentingnya dengan yang cacat: yang sehat menjaga agar
 * aturan tidak jadi terlalu galak.
 */

const AKAR = new URL('..', import.meta.url);
const SUMBER_EF = new URL('supabase/functions/generate-modul/index.ts', AKAR);
const DIR_FIXTURE = new URL('tests/fixtures/modul/', AKAR);

type Harapan = {
  nomor_tp: number;
  jumlah_pertemuan: number;
  jp_per_pertemuan: number;
  durasi_jp: number;
  jumlah_murid: number;
  perangkat_digital_ok: boolean;
  jumlah_temuan: number;
  catatan?: string;
};

type Validator = (
  raw: unknown, nomorTp: number, jumlahPertemuan: number, jpPerPertemuan: number,
  durasiJp: number, jumlahMurid: number | null, manifest?: unknown,
  perangkatDigitalOk?: boolean,
) => { valid: boolean; errors: string[] };

/**
 * Validator diambil dari sumber Edge Function yang sebenarnya, bukan disalin.
 * Salinan akan menyimpang diam-diam, dan uji yang menguji salinan tidak menguji
 * apa pun. Bagian di bawah penanda "── EDGE FUNCTION ──" dibuang karena
 * memanggil Deno.serve dan akan menyalakan server saat diimpor.
 */
async function muatValidator(): Promise<Validator> {
  const penuh = await Deno.readTextFile(SUMBER_EF);
  const batas = penuh.indexOf('// ── EDGE FUNCTION ─');
  if (batas < 0) throw new Error('Penanda "── EDGE FUNCTION ─" tidak ada di index.ts');

  const tmp = await Deno.makeTempFile({ suffix: '.ts' });
  try {
    await Deno.writeTextFile(tmp, penuh.slice(0, batas) + '\nexport { validateModulOutputV400 };\n');
    const mod = await import('file://' + tmp.replace(/\\/g, '/'));
    return mod.validateModulOutputV400 as Validator;
  } finally {
    await Deno.remove(tmp).catch(() => {});
  }
}

const hijau = (t: string) => `\x1b[32m${t}\x1b[0m`;
const merah = (t: string) => `\x1b[31m${t}\x1b[0m`;
const abu = (t: string) => `\x1b[90m${t}\x1b[0m`;

const validate = await muatValidator();

const berkas: string[] = [];
for await (const e of Deno.readDir(DIR_FIXTURE)) {
  if (e.isFile && e.name.endsWith('.json')) berkas.push(e.name);
}
berkas.sort();

if (!berkas.length) {
  console.error(merah('Tidak ada modul contoh. Uji ini tidak menguji apa pun.'));
  Deno.exit(2);
}

let gagal = 0;
for (const f of berkas) {
  const isi = JSON.parse(await Deno.readTextFile(new URL(f, DIR_FIXTURE)));
  const h = isi._harapan as Harapan | undefined;
  if (!h) {
    console.log(`${merah('✗')} ${f} tidak punya field _harapan`);
    gagal++;
    continue;
  }
  const hasil = validate(
    isi.konten, h.nomor_tp, h.jumlah_pertemuan, h.jp_per_pertemuan,
    h.durasi_jp, h.jumlah_murid, undefined, h.perangkat_digital_ok,
  );
  if (hasil.errors.length === h.jumlah_temuan) {
    console.log(`${hijau('✓')} ${f.padEnd(14)} ${hasil.errors.length} temuan  ${abu(h.catatan ?? '')}`);
  } else {
    gagal++;
    console.log(`${merah('✗')} ${f.padEnd(14)} diharapkan ${h.jumlah_temuan}, dapat ${hasil.errors.length}`);
    for (const e of hasil.errors) console.log(abu('      • ' + e.slice(0, 150)));
  }
}

console.log();
if (gagal) {
  console.log(merah(`${gagal} dari ${berkas.length} contoh tidak sesuai harapan.`));
  console.log(abu('Kalau perubahannya disengaja, perbarui _harapan di berkas contohnya —'));
  console.log(abu('tapi periksa dulu modul yang SEHAT: gerbang yang salah tuduh memakan jatah guru.'));
  Deno.exit(1);
}
console.log(hijau(`Semua ${berkas.length} contoh sesuai harapan.`));
