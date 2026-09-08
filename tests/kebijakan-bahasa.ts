// tests/kebijakan-bahasa.ts
//
// Jaring regresi untuk kebijakanBahasa() di generate-modul.
//
// Fungsinya tidak diekspor, jadi sumbernya DIPOTONG dari berkas kirimnya
// sendiri lalu diimpor — bukan disalin ulang ke sini. Salinan akan menyimpang
// diam-diam begitu kamusnya disunting; potongan tidak bisa.
//
//   deno run --allow-read --allow-write tests/kebijakan-bahasa.ts
//
// Dua kasus di bawah pernah GAGAL sungguhan pada 8 September 2026: mapel tanpa
// bahasa target (Matematika, Bahasa Indonesia) mencetak frasa cadangan
// "bahasa target mata pelajaran ini" ke dalam modul yang guru arsipkan.
type Kebijakan = {
  teacher_instruction: string;
  student_instruction: string;
  target_language: string | null;
};

const berkas = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);
const sumber = await Deno.readTextFile(berkas);
const potong = sumber.slice(
  sumber.indexOf('function bahasaTarget('),
  sumber.indexOf('const SYSTEM_PROMPT ='),
);

// Ditulis sebagai modul TypeScript sungguhan lalu diimpor. Tidak lewat
// new Function: potongannya masih memuat anotasi tipe, dan new Function hanya
// mengerti JavaScript.
const sementara = await Deno.makeTempFile({ suffix: '.ts' });
await Deno.writeTextFile(
  sementara,
  potong + '\nexport { bahasaTarget, kebijakanBahasa };\n',
);
const mod = await import(new URL('file:///' + sementara.replaceAll('\\', '/')).href);
const kebijakanBahasa = mod.kebijakanBahasa as
  (bp: string | null, mapel: string | null) => Kebijakan | null;

let gagal = 0;
const cek = (bp: string | null, mapel: string, ket: string, harus: string | null) => {
  const h = kebijakanBahasa(bp, mapel);
  const teks = h ? h.teacher_instruction : null;
  const ok = harus === null ? h === null : teks === harus;
  if (!ok) {
    gagal++;
    console.log('GAGAL  ' + ket + '\n  dapat: ' + teks + '\n  harus: ' + harus);
  } else {
    console.log('ok     ' + ket + (h ? '  -> ' + teks : '  -> null'));
  }
};

const ID = 'Guru menjelaskan dan memberi instruksi sepenuhnya dalam Bahasa Indonesia.';

cek('campur', 'Bahasa Inggris', 'X TB (campur, Inggris)',
  'Guru menjelaskan konsep dalam Bahasa Indonesia dan memberi instruksi kelas dalam Bahasa Inggris.');
cek('target_penuh', 'Bahasa Inggris', 'target penuh',
  'Guru mengajar sepenuhnya dalam Bahasa Inggris.');
cek('indonesia', 'Bahasa Inggris', 'indonesia', ID);

// Mapel tanpa bahasa target — kelima pilihan runtuh jadi satu.
cek('campur', 'Bahasa Indonesia', 'mapel Bahasa Indonesia', ID);
cek('campur', 'Matematika', 'mapel Matematika', ID);
cek('target_penuh', 'Matematika', 'Matematika + target_penuh', ID);

// Belum dijawab -> model yang menentukan, perilaku lama dipertahankan.
cek(null, 'Bahasa Inggris', 'belum dijawab', null);
cek('rekomendasi', 'Bahasa Inggris', 'nilai rekomendasi', null);

// Tidak satu pun frasa cadangan boleh sampai ke dokumen guru.
for (const [bp, mapel] of [['campur', 'Matematika'], ['target_dominan', 'Bahasa Indonesia']]) {
  const t = kebijakanBahasa(bp, mapel);
  if (t && /bahasa target mata pelajaran/.test(JSON.stringify(t))) {
    gagal++;
    console.log('GAGAL  frasa cadangan bocor pada ' + bp + ' / ' + mapel);
  }
}
console.log(gagal === 0 ? '\nSEMUA LULUS' : '\n' + gagal + ' GAGAL');
if (gagal > 0) Deno.exit(1);
