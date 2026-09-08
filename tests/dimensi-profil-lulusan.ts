// tests/dimensi-profil-lulusan.ts
//
// Jaring regresi untuk delapan Dimensi Profil Lulusan.
//
//   deno run --allow-read --allow-write tests/dimensi-profil-lulusan.ts
//
// Kasus "empat nama kurikulum lama dibuang" bukan karangan: keempat namanya
// diambil dari modul NYATA di produksi per 8 September 2026. Dari 14 isian
// dimensi di 8 modul, 11 memakai nama Profil Pelajar Pancasila yang sudah
// diganti ("Bernalar Kritis", "Mandiri", "Berkebinekaan Global") atau nama yang
// dikarang sendiri ("Komunikasi Efektif").
//
// Sumbernya DIPOTONG dari generate-modul, bukan disalin — salinan akan
// menyimpang diam-diam begitu kamusnya disunting.

const berkas = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);
const sumber = await Deno.readTextFile(berkas);
const potong = sumber.slice(
  sumber.indexOf('const DIMENSI_PROFIL_LULUSAN'),
  sumber.indexOf('// ── TITIK AWAL KEMAMPUAN MURID'),
);

const sementara = await Deno.makeTempFile({ suffix: '.ts' });
await Deno.writeTextFile(
  sementara,
  'function unwrap(v:any){return v&&typeof v==="object"&&"value" in v?v.value:v;}\n'
    + potong
    + '\nexport { DIMENSI_PROFIL_LULUSAN, dimensiPilihanGuru, saringDimensi };\n',
);
const mod = await import(new URL('file:///' + sementara.replaceAll('\\', '/')).href);
const DIMENSI_PROFIL_LULUSAN = mod.DIMENSI_PROFIL_LULUSAN as Record<string, string>;
const dimensiPilihanGuru = mod.dimensiPilihanGuru as (cd: Record<string, unknown>) => string[];
const saringDimensi = mod.saringDimensi as (faseA: Record<string, unknown>) => void;

let gagal = 0;
const cek = (nama: string, dapat: unknown, harus: unknown) => {
  const a = JSON.stringify(dapat), b = JSON.stringify(harus);
  if (a !== b) {
    gagal++;
    console.log('GAGAL  ' + nama + '\n  dapat: ' + a + '\n  harus: ' + b);
  } else {
    console.log('ok     ' + nama + '  -> ' + a);
  }
};

cek('delapan dimensi resmi', Object.values(DIMENSI_PROFIL_LULUSAN).length, 8);
cek('nama persis dokumen resmi hal. 5', Object.values(DIMENSI_PROFIL_LULUSAN), [
  'Keimanan dan Ketakwaan terhadap Tuhan YME', 'Kewargaan', 'Penalaran Kritis',
  'Kreativitas', 'Kolaborasi', 'Kemandirian', 'Kesehatan', 'Komunikasi',
]);

cek('pilihan guru diterjemahkan',
  dimensiPilihanGuru({ KONTEKS_MODUL: { dimensi_profil_lulusan: { value: ['komunikasi', 'kolaborasi'] } } }),
  ['Komunikasi', 'Kolaborasi']);
cek('rekomendasi = kosong (model yang memilih)',
  dimensiPilihanGuru({ KONTEKS_MODUL: { dimensi_profil_lulusan: { value: ['rekomendasi'] } } }), []);
cek('belum dijawab = kosong', dimensiPilihanGuru({}), []);

// Saringan terhadap keluaran model yang meniru cacat nyata di produksi.
const faseA: Record<string, unknown> = {
  metadata_pedagogis: {
    dimensi_profil_lulusan: [
      { dimensi: 'Bernalar Kritis' }, { dimensi: 'Mandiri' },
      { dimensi: 'Berkebinekaan Global' }, { dimensi: 'Komunikasi Efektif' },
      { dimensi: 'Komunikasi' }, { dimensi: 'Kolaborasi' },
    ],
  },
};
saringDimensi(faseA);
const sisa = ((faseA.metadata_pedagogis as Record<string, unknown>)
  .dimensi_profil_lulusan as Array<Record<string, unknown>>).map(d => d.dimensi);
cek('empat nama kurikulum lama dibuang', sisa, ['Komunikasi', 'Kolaborasi']);

const kosong: Record<string, unknown> = {};
saringDimensi(kosong);
cek('modul tanpa metadata tidak meledak', kosong, {});

console.log(gagal === 0 ? '\nSEMUA LULUS' : '\n' + gagal + ' GAGAL');
if (gagal > 0) Deno.exit(1);
