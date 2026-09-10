// M1 — IDENTITAS TP UNTUK MODUL AJAR.
//
// Menutup blocker yang terbukti di docs/MODULE-NASKAH-CONTRACT-LOCK.md §P:
// Modul terikat ke ATP hanya lewat nomor, sementara generate-atp menimpa
// progresi_tp di baris yang sama. Nomornya tetap resolve, ke TP yang berbeda.
//
// M1-A sampai M1-I menguji fungsi murni di anchor.ts.
// M1-J sampai M1-M menguji tabel kebenaran gerbang.
// M1-N sampai M1-Q menguji SUMBER generate-modul dan klien apa adanya — bukan
// salinan logikanya — dengan pola yang sama yang dipakai tests/atp-trace.mjs
// dan harness semantik ATP: yang diperiksa kode kirimnya sendiri.

import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import {
  bangunTpAnchor, kanonikAnchor, hitungTpSnapshotHash, periksaAnchor,
  keteranganKonflik, FIELD_HASH, KODE_STALE, KODE_LEGACY,
  punyaRiwayatPenyusunan, judulSama, KUNCI_DRAFT,
  type TpAnchor,
} from '../supabase/functions/generate-modul/anchor.ts';

const EF_MODUL   = new URL('../supabase/functions/generate-modul/index.ts', import.meta.url);
const KLIEN_CHAT = new URL('../guru/js/rancang-chat.js', import.meta.url);

/** Baris ATP tiruan berbentuk sama persis dengan yang generate-atp tuliskan. */
function atpRow(ubah: Record<string, unknown> = {}) {
  return {
    progresi_tp: [
      {
        nomor: 5, judul: 'Menyimak dialog pelayanan butik dan memahami gagasan utama',
        elemen: ['menyimak_berbicara'],
        tuntutan: ['BIE-E25-MB-1', 'BIE-E25-MB-2'],
        kategori_teks: ['fiksi', 'nonfiksi'],
        jp_alokasi: 12, jp_pertemuan: [2, 2, 2, 2, 2, 2], semester: 1,
        konteks: ['dialog pelayanan pelanggan'],
        catatan: 'keterangan yang boleh berubah tanpa mengubah tuntutan',
        ...ubah,
      },
    ],
    collected_data: { ATP_HASIL: { acuan_cp: { versi_cp: '046/H/KR/2025' } } },
  };
}

const ANCHOR = () => bangunTpAnchor(atpRow(), 'atp-1', 5)!;

/** Salinan anchor dengan satu field diubah. */
function ubah(a: TpAnchor, p: Partial<TpAnchor>): TpAnchor {
  return { ...a, ...p };
}

Deno.test('M1-A: potret kanonik yang sama menghasilkan hash yang sama', async () => {
  const a = ANCHOR();
  // Dibangun ulang dari baris ATP yang berbeda objek, isinya sama.
  const b = bangunTpAnchor(atpRow(), 'atp-1', 5)!;
  assertEquals(kanonikAnchor(a), kanonikAnchor(b));
  assertEquals(await hitungTpSnapshotHash(a), await hitungTpSnapshotHash(b));

  // Hash berbentuk SHA-256 heksadesimal, bukan kebetulan string kosong.
  const h = await hitungTpSnapshotHash(a);
  assertEquals(h.length, 64);
  assert(/^[0-9a-f]{64}$/.test(h), `bukan sha-256 hex: ${h}`);

  // Keterangan yang SENGAJA di luar hash: mengubahnya tidak menghentikan Modul.
  const dgnKonteksLain = bangunTpAnchor(
    atpRow({ konteks: ['latar lain'], catatan: 'disunting', elemen: ['membaca_memirsa'] }), 'atp-1', 5)!;
  assertEquals(await hitungTpSnapshotHash(dgnKonteksLain), h,
    'perubahan keterangan di luar FIELD_HASH ikut mengubah hash');

  // Daftar field yang masuk hash terdokumentasi dan tidak diam-diam bertambah.
  assertEquals(FIELD_HASH.length, 9);
});

Deno.test('M1-B: urutan tuntutan[] tidak mengubah hash', async () => {
  const a = ANCHOR();
  const b = ubah(a, { tuntutan: ['BIE-E25-MB-2', 'BIE-E25-MB-1'] });
  assertEquals(await hitungTpSnapshotHash(a), await hitungTpSnapshotHash(b));
});

Deno.test('M1-C: urutan kategori_teks[] tidak mengubah hash', async () => {
  const a = ANCHOR();
  const b = ubah(a, { kategori_teks: ['nonfiksi', 'fiksi'] });
  assertEquals(await hitungTpSnapshotHash(a), await hitungTpSnapshotHash(b));
});

Deno.test('M1-D: judul berubah → hash berubah', async () => {
  const a = ANCHOR();
  const b = ubah(a, { tp_judul: 'Menyimak dialog pelayanan butik dan mencatat detail' });
  assertNotEquals(await hitungTpSnapshotHash(a), await hitungTpSnapshotHash(b));

  // Tetapi perbedaan yang hanya spasi/normalisasi BUKAN perubahan.
  const c = ubah(a, { tp_judul: '  Menyimak dialog pelayanan butik   dan memahami gagasan utama ' });
  assertEquals(await hitungTpSnapshotHash(a), await hitungTpSnapshotHash(c));
});

Deno.test('M1-E: tuntutan berubah → hash berubah', async () => {
  const a = ANCHOR();
  for (const t of [
    ['BIE-E25-MB-1'],                                    // dikurangi
    ['BIE-E25-MB-1', 'BIE-E25-MB-3'],                    // diganti
    ['BIE-E25-MB-1', 'BIE-E25-MB-2', 'BIE-E25-MM-1'],    // ditambah
  ]) {
    assertNotEquals(await hitungTpSnapshotHash(a),
      await hitungTpSnapshotHash(ubah(a, { tuntutan: t })), `tuntutan ${t.join(',')}`);
  }
});

Deno.test('M1-F: kategori_teks berubah → hash berubah', async () => {
  const a = ANCHOR();
  assertNotEquals(await hitungTpSnapshotHash(a),
    await hitungTpSnapshotHash(ubah(a, { kategori_teks: ['nonfiksi'] })));
  assertNotEquals(await hitungTpSnapshotHash(a),
    await hitungTpSnapshotHash(ubah(a, { kategori_teks: [] })));
});

Deno.test('M1-G: semester berubah → hash berubah', async () => {
  const a = ANCHOR();
  assertNotEquals(await hitungTpSnapshotHash(a),
    await hitungTpSnapshotHash(ubah(a, { semester: 2 })));
  assertNotEquals(await hitungTpSnapshotHash(a),
    await hitungTpSnapshotHash(ubah(a, { semester: null })));
});

Deno.test('M1-H: jp_alokasi berubah → hash berubah', async () => {
  const a = ANCHOR();
  assertNotEquals(await hitungTpSnapshotHash(a),
    await hitungTpSnapshotHash(ubah(a, { jp_alokasi: 14 })));
});

Deno.test('M1-I: jp_pertemuan berubah → hash berubah, dan urutannya BERMAKNA', async () => {
  const a = ANCHOR();
  // Jumlah pertemuan berubah.
  assertNotEquals(await hitungTpSnapshotHash(a),
    await hitungTpSnapshotHash(ubah(a, { jp_pertemuan: [2, 2, 2, 2, 2] })));
  // Total sama, sebarannya berbeda — ini rancangan pertemuan yang berbeda.
  const b = bangunTpAnchor(atpRow({ jp_alokasi: 12, jp_pertemuan: [4, 4, 4] }), 'atp-1', 5)!;
  assertNotEquals(await hitungTpSnapshotHash(a), await hitungTpSnapshotHash(b));
  // Urutan TIDAK disortir: [2,4] dan [4,2] adalah dua rancangan berbeda.
  assertNotEquals(
    await hitungTpSnapshotHash(ubah(a, { jp_pertemuan: [2, 4] })),
    await hitungTpSnapshotHash(ubah(a, { jp_pertemuan: [4, 2] })));

  // versi CP juga masuk hash — CP yang berbeda adalah TP yang berbeda.
  const cpLain = bangunTpAnchor(
    { ...atpRow(), collected_data: { ATP_HASIL: { acuan_cp: { versi_cp: '032/H/KR/2024' } } } },
    'atp-1', 5)!;
  assertNotEquals(await hitungTpSnapshotHash(a), await hitungTpSnapshotHash(cpLain));
});

Deno.test('M1-J: Modul baru menerima hash hitungan server', () => {
  const g = periksaAnchor({ hashTersimpan: null, hashSekarang: 'abc', adaKontenFinal: false });
  assertEquals(g.status, 'BARU');
  assertEquals(g.boleh_generate, true);
  assertEquals(g.kode, null);
});

Deno.test('M1-K: Modul lama dengan hash sama → boleh lanjut', () => {
  const g = periksaAnchor({ hashTersimpan: 'abc', hashSekarang: 'abc', adaKontenFinal: true });
  assertEquals(g.status, 'COCOK');
  assertEquals(g.boleh_generate, true);
});

Deno.test('M1-L: Modul lama dengan hash berbeda → MODULE_TP_ANCHOR_STALE', () => {
  const g = periksaAnchor({ hashTersimpan: 'abc', hashSekarang: 'xyz', adaKontenFinal: true });
  assertEquals(g.status, 'STALE');
  assertEquals(g.kode, KODE_STALE);
  assertEquals(g.boleh_generate, false);

  // Berlaku juga untuk modul yang belum final: potret yang sudah dipaku tidak
  // boleh berpindah diam-diam di tengah penyusunan.
  assertEquals(
    periksaAnchor({ hashTersimpan: 'abc', hashSekarang: 'xyz', adaKontenFinal: false }).status,
    'STALE');

  // Keterangan konflik memuat yang guru perlukan, dan TIDAK memuat hash.
  const k = keteranganKonflik({
    nomorTpModul: 5, judulTpModul: 'Judul lama',
    anchorSekarang: ANCHOR(),
  });
  assertEquals((k.tp_modul as Record<string, unknown>).nomor, 5);
  assertEquals((k.tp_atp_kini as Record<string, unknown>).nomor, 5);
  assertEquals(k.atp_berubah, true);
  assert(!JSON.stringify(k).includes('hash'), 'keterangan konflik membocorkan hash');
});

Deno.test('M1-M: Modul lama berisi tanpa hash → LEGACY_UNVERIFIED, bukan cocok', () => {
  const g = periksaAnchor({ hashTersimpan: null, hashSekarang: 'abc', adaKontenFinal: true });
  assertEquals(g.status, 'LEGACY_UNVERIFIED');
  assertEquals(g.kode, KODE_LEGACY);
  assertEquals(g.boleh_generate, false, 'modul warisan tidak boleh disusun ulang diam-diam');

  // Hash kosong (string kosong) diperlakukan sama dengan tidak ada.
  assertEquals(
    periksaAnchor({ hashTersimpan: '', hashSekarang: 'abc', adaKontenFinal: true }).status,
    'LEGACY_UNVERIFIED');
});

Deno.test('M1-N: generate-modul tidak lagi menanyai tp_kktp seluruh kelas', async () => {
  // Komentar dibuang lebih dulu: berkas itu MENJELASKAN query lama yang dicabut,
  // dan penjelasan bukan pemakaian.
  const src = (await Deno.readTextFile(EF_MODUL))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  // Tidak ada satu pun query ke tabel itu di jalur generate — baca maupun tulis.
  assert(!/from\(\s*['"]tp_kktp['"]\s*\)/.test(src),
    'generate-modul masih membaca tabel tp_kktp');
  assert(!src.includes('tp_kktp'),
    'nama tabel tp_kktp masih dipakai di kode generate-modul');

  // Bentuk query lama yang dinyatakan invalid tidak boleh kembali.
  assert(!/eq\(\s*['"]tipe['"]\s*,\s*['"]KKTP['"]\s*\)/.test(src),
    'penyaring tipe=KKTP classroom-wide masih ada');
  assert(!/kktpList/.test(src), 'daftar KKTP kelas masih dirakit');
});

Deno.test('M1-O: Fase A menerima potret TP sekarang, dan potret itu dihitung server', async () => {
  const src = await Deno.readTextFile(EF_MODUL);

  // Anchor dibangun dari baris ATP sisi server, bukan dari badan permintaan.
  assert(/const tpAnchor[\s\S]{0,200}bangunTpAnchor\(/.test(src),
    'tpAnchor tidak dibangun dari bangunTpAnchor()');
  assert(/const hashSekarang = await hitungTpSnapshotHash\(tpAnchor\)/.test(src),
    'hash tidak dihitung ulang di server');

  // Fase A menerimanya. Sejak M2 pembawanya amplop `warisan` — isinya sama
  // ditambah makna tuntutan; yang dijaga di sini tetap sama: potret server
  // sampai ke Fase A, dan ia membawa tuntutan serta kategori, bukan judul saja.
  assert(/buildUserMessageFaseA\(\{[^)]*warisan/.test(src),
    'Fase A tidak menerima potret TP server');
  assert(/const warisan: WarisanAtp = \{[\s\S]{0,300}tpAnchor: tpAnchor/.test(src),
    'amplop warisan tidak berpangkal pada anchor server');
  assert(/tuntutan_cp: w\.tuntutan\.map/.test(src),
    'tuntutan CP tidak dikirim ke Fase A');
  assert(/kategori_teks_tp:\s*w\.tpAnchor\.kategori_teks/.test(src),
    'kategori_teks tidak dikirim ke Fase A');

  // Yang ditulis ke basis data SELALU hitungan server.
  assert(/tp_snapshot_hash: hashSekarang/.test(src),
    'hash yang ditulis bukan hitungan server');
  // Tidak ada satu pun tempat yang menulis hash dari badan permintaan klien.
  assert(!/tp_snapshot_hash:\s*(body|payload|req)/.test(src),
    'hash dari klien dipakai menulis');
});

Deno.test('M1-P: KKTP hasil Modul tetap milik Modul — tidak ditulis balik', async () => {
  const src = await Deno.readTextFile(EF_MODUL);

  // Tabel yang generate-modul tulisi: dokumen Modul, dan catatan pemakaian AI.
  // `tp_kktp` TIDAK termasuk — KKTP hasil Modul hidup di dokumen Modul saja.
  // NO AUTO SYNC, NO DUAL WRITE.
  const ditulis = [...new Set(
    [...src.matchAll(/from\(\s*['"]([a-z_]+)['"]\s*\)\s*\n?\s*\.(update|insert|upsert|delete)/g)]
      .map(m => m[1]))].sort();
  assertEquals(ditulis, ['ai_usage', 'modul_induk'],
    `daftar tabel yang ditulisi berubah: ${ditulis.join(', ')}`);

  // KKTP disusun, bukan diterima: instruksinya ada dan menyebut potret TP.
  // Sejak M2 potret itu bernama warisan_atp.tp dan membawa makna tuntutannya.
  assert(/instruksi_kktp:/.test(src), 'instruksi menyusun KKTP tidak ada');
  assert(/Susun KKTP untuk TP ini sendiri, dari warisan_atp\.tp/.test(src),
    'Fase A tidak diperintahkan menyusun KKTP dari potret TP');

  // Bentuk keluarannya tidak berubah, supaya fase berikutnya tidak pecah.
  assert(/type KktpItem = \{[\s\S]*?id_kktp:[\s\S]*?kriteria:[\s\S]*?ambang_batas:[\s\S]*?instrumen_bukti:/.test(src),
    'schema KktpItem berubah — di luar lingkup M1');
});

Deno.test('M1-Q: klien tidak lagi mengikat ulang Modul hanya karena nomornya cocok', async () => {
  const src = await Deno.readTextFile(KLIEN_CHAT);

  // Pola lama — menerima TP mana pun yang menempati nomor itu — sudah tidak ada.
  assert(!/_chat\.selected_tp\s*=\s*tp\s*\|\|\s*\{/.test(src),
    'klien masih mengikat selected_tp ke nomor tanpa pemeriksaan');
  assert(!/_chat\.selected_tp\s*=\s*matchTp\s*\|\|\s*\{/.test(src),
    'jalur daftar TP masih mengikat tanpa pemeriksaan');

  // Penggantinya memeriksa status potret lebih dulu.
  assertEquals(
    [...src.matchAll(/statusAnchorModul\(/g)].length >= 3, true,
    'statusAnchorModul tidak dipakai di kedua jalur pembukaan modul');
  assert(/_chat\.tp_anchor_status === 'CURRENT'/.test(src),
    'klien tidak menuntut status CURRENT sebelum memakai TP sekarang');

  // Ketiga keadaan punya nama, dan dua di antaranya punya kalimat untuk guru.
  for (const s of ['CURRENT', 'STALE', 'LEGACY_UNVERIFIED']) {
    assert(src.includes(s), `status ${s} tidak ada di klien`);
  }
  assert(/PESAN_ANCHOR\s*=\s*\{[\s\S]*STALE:[\s\S]*LEGACY_UNVERIFIED:/.test(src),
    'tidak ada kalimat untuk guru pada kedua status');

  // Klien TIDAK menghitung ulang hash — aturan kanoniknya satu tempat saja.
  assert(!/sha-?256/i.test(src) && !/crypto\.subtle/.test(src),
    'klien menghitung hash sendiri — kembar yang akan menyimpang');

  // Kode konflik dari server ditangani, dan tidak ditawari "coba lagi".
  assert(src.includes('MODULE_TP_ANCHOR_STALE') && src.includes('MODULE_TP_ANCHOR_LEGACY'),
    'klien tidak menangani konflik potret dari server');
});

Deno.test('M1-R: migration additif dan tidak pernah mengisi hash modul lama', async () => {
  const sql = await Deno.readTextFile(
    new URL('../supabase/migrations/20260910000001_modul-tp-snapshot-hash.sql', import.meta.url));

  assert(/ADD COLUMN IF NOT EXISTS tp_snapshot_hash text/i.test(sql), 'kolom tidak ditambahkan idempoten');
  // Additif: tidak ada yang dibuang, tidak ada baris yang disentuh.
  for (const terlarang of [/\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i, /\bDELETE\s+FROM\b/i, /\bUPDATE\s+public\.modul_induk\b/i]) {
    assert(!terlarang.test(sql.replace(/--.*$/gm, '')),
      `migration memuat perintah merusak: ${terlarang}`);
  }
  // Rollback dijelaskan.
  assert(/Rollback/i.test(sql), 'migration tidak menjelaskan rollback');
});

// ═════════════════════════════════════════════════════════════════════════════
// M1.1 — MENUTUP ADOPSI POTRET OLEH MODUL PRA-M1
// ═════════════════════════════════════════════════════════════════════════════
//
// M1 memakai satu pembeda: konten.schema_version. Dua kasus lolos karenanya:
//
//   CASE A  Modul pra-M1 yang berhenti di tengah jalan punya _draft.fase_a
//           tanpa schema_version → terbaca BARU → potret TP baru diadopsi di
//           atas draft milik TP lama.
//   CASE B  Baris yang benar-benar kosong tetap membawa judul yang dicatat saat
//           guru memilih TP. ATP disusun ulang lebih dulu → judul tidak cocok →
//           potret baru diadopsi, dan guru mendapat TP yang bukan pilihannya.

/** Baris modul_induk tiruan. */
function modulRow(p: { hash?: string | null; konten?: Record<string, unknown> } = {}) {
  return { tp_snapshot_hash: p.hash ?? null, konten: p.konten ?? {} };
}

Deno.test('M1-S: hash NULL + _draft.fase_a → LEGACY_UNVERIFIED', () => {
  const konten = { _draft: { fase_a: { identitas: {}, kktp: [] } } };
  assertEquals(punyaRiwayatPenyusunan(konten), true, 'draft fase_a tidak terbaca sebagai riwayat');
  assertEquals(typeof (konten as Record<string, unknown>).schema_version, 'undefined',
    'fixture harus BELUM final — itu inti CASE A');

  const g = periksaAnchor({
    hashTersimpan: null, hashSekarang: 'xyz',
    adaKontenFinal: false, adaRiwayat: punyaRiwayatPenyusunan(konten), judulCocok: true,
  });
  assertEquals(g.status, 'LEGACY_UNVERIFIED');
  assertEquals(g.kode, KODE_LEGACY);
  assertEquals(g.boleh_generate, false, 'draft pra-M1 boleh mengadopsi potret baru');
});

Deno.test('M1-T: hash NULL + fase_b / fase_c / fase_b2 → LEGACY_UNVERIFIED', () => {
  // Daftar fase mengikuti pipeline nyata dan tidak boleh menyusut diam-diam.
  assertEquals([...KUNCI_DRAFT].sort(), ['fase_a', 'fase_b', 'fase_b2', 'fase_c']);

  for (const f of KUNCI_DRAFT) {
    const konten = { _draft: { [f]: f === 'fase_b2' ? { naskah_fasilitasi: [] } : [{}] } };
    assertEquals(punyaRiwayatPenyusunan(konten), true, `${f} tidak terbaca sebagai riwayat`);
    const g = periksaAnchor({
      hashTersimpan: null, hashSekarang: 'xyz',
      adaKontenFinal: false, adaRiwayat: true, judulCocok: true,
    });
    assertEquals(g.status, 'LEGACY_UNVERIFIED', `${f} lolos gerbang`);
  }

  // Draft kosong atau null BUKAN riwayat — jangan menjebak baris yang bersih.
  assertEquals(punyaRiwayatPenyusunan({ _draft: {} }), false);
  assertEquals(punyaRiwayatPenyusunan({ _draft: { fase_a: null } }), false);
  assertEquals(punyaRiwayatPenyusunan({}), false);
  assertEquals(punyaRiwayatPenyusunan(null), false);
  // Fase yang tidak dikenal tidak dihitung — daftarnya sengaja eksplisit.
  assertEquals(punyaRiwayatPenyusunan({ _draft: { fase_z: {} } }), false);
});

Deno.test('M1-U: hash NULL + dokumen final → tetap LEGACY_UNVERIFIED', () => {
  const konten = { schema_version: '4.0.0', kktp: [] };
  assertEquals(punyaRiwayatPenyusunan(konten), true);
  const g = periksaAnchor({
    hashTersimpan: null, hashSekarang: 'xyz',
    adaKontenFinal: true, adaRiwayat: true, judulCocok: true,
  });
  assertEquals(g.status, 'LEGACY_UNVERIFIED');
  assertEquals(g.boleh_generate, false);
});

Deno.test('M1-V: hash NULL + benar-benar kosong + judul cocok → BARU', () => {
  const konten = {};
  assertEquals(punyaRiwayatPenyusunan(konten), false);
  const g = periksaAnchor({
    hashTersimpan: null, hashSekarang: 'xyz',
    adaKontenFinal: false, adaRiwayat: false, judulCocok: true,
  });
  assertEquals(g.status, 'BARU');
  assertEquals(g.boleh_generate, true);

  // Judul dibandingkan setelah dinormalkan — beda spasi bukan beda TP.
  assert(judulSama('  Menyimak dialog   pelayanan butik ', 'Menyimak dialog pelayanan butik'));
});

Deno.test('M1-W: hash NULL + kosong + judul BERBEDA → STALE, hash tidak diadopsi', () => {
  const g = periksaAnchor({
    hashTersimpan: null, hashSekarang: 'xyz',
    adaKontenFinal: false, adaRiwayat: false, judulCocok: false,
  });
  assertEquals(g.status, 'STALE');
  assertEquals(g.kode, KODE_STALE);
  assertEquals(g.boleh_generate, false,
    'baris kosong dengan judul tersimpan yang sudah berubah mengadopsi potret baru');

  assert(!judulSama('Judul lama', 'Judul baru'));
});

Deno.test('M1-X: Fase A memakai judul dari anchor server, bukan salinan baris Modul', async () => {
  const src = await Deno.readTextFile(EF_MODUL);

  // tp_teks berasal dari anchor server. Sejak M2 pembawanya amplop `warisan`,
  // jadi rujukannya params.warisan.tpAnchor.tp_judul — sumber yang sama.
  assert(/tp_teks:\s*params\.warisan\.tpAnchor\.tp_judul/.test(src)
      || /tp_teks:\s*w\.tpAnchor\.tp_judul/.test(src),
    'tp_teks tidak berasal dari anchor server');
  assert(!/tp_teks:\s*params\.tpJudul/.test(src), 'jalur lama tp_teks masih ada');

  // Dan sumber tpJudul itu sendiri kini anchor, sehingga tidak ada jalan lain
  // bagi judul lama untuk masuk ke Fase A.
  assert(/const nomorTp\s*=\s*tpAnchor\.nomor_tp/.test(src),
    'nomorTp tidak berasal dari anchor server');
  assert(/const tpJudul\s*=\s*tpAnchor\.tp_judul/.test(src),
    'tpJudul tidak berasal dari anchor server');
  assert(!/const tpJudul\s*=\s*String\(\(modul/.test(src),
    'tpJudul masih dibaca dari baris modul_induk');

  // Nilai baris modul_induk tetap ada — untuk deteksi dan pesan konflik saja.
  assert(/const judulTpModul\s*=/.test(src) && /judulTpModul, anchorSekarang/.test(src),
    'judul tersimpan tidak lagi dipakai untuk pesan konflik');
});

Deno.test('M1-Y: Modul pasca-M1 dengan draft parsial + hash sama → boleh dilanjutkan', () => {
  const row = modulRow({ hash: 'abc', konten: { _draft: { fase_a: {} } } });
  const g = periksaAnchor({
    hashTersimpan: row.tp_snapshot_hash, hashSekarang: 'abc',
    adaKontenFinal: false, adaRiwayat: punyaRiwayatPenyusunan(row.konten), judulCocok: true,
  });
  assertEquals(g.status, 'COCOK');
  assertEquals(g.boleh_generate, true, 'resume Modul pasca-M1 rusak');
});

Deno.test('M1-Z: Modul pasca-M1 dengan draft parsial + hash berbeda → STALE', () => {
  const row = modulRow({ hash: 'abc', konten: { _draft: { fase_a: {} } } });
  const g = periksaAnchor({
    hashTersimpan: row.tp_snapshot_hash, hashSekarang: 'xyz',
    adaKontenFinal: false, adaRiwayat: true, judulCocok: true,
  });
  assertEquals(g.status, 'STALE');
  assertEquals(g.kode, KODE_STALE);
  assertEquals(g.boleh_generate, false);
});

Deno.test('M1-AA: klien membaca _draft lama + hash NULL sebagai LEGACY_UNVERIFIED', async () => {
  const src = await Deno.readTextFile(KLIEN_CHAT);

  // Pembeda klien bukan lagi schema_version saja.
  assert(/function punyaRiwayatModul\(/.test(src), 'klien tidak punya pembaca riwayat draft');
  assert(/KUNCI_DRAFT_MODUL\s*=\s*\['fase_a', 'fase_b', 'fase_c', 'fase_b2'\]/.test(src),
    'daftar fase draft di klien tidak mengikuti pipeline nyata');
  assert(/if \(!modul\.tp_snapshot_hash && punyaRiwayatModul\(modul\.konten\)\) return 'LEGACY_UNVERIFIED'/.test(src),
    'klien masih memakai schema_version saja sebagai pembeda');
  assert(!/var berisi = !!\(modul\.konten && modul\.konten\.schema_version\)/.test(src),
    'pembeda lama masih ada di klien');

  // Tetap tidak menghitung hash sendiri.
  assert(!/sha-?256/i.test(src) && !/crypto\.subtle/.test(src),
    'klien menghitung hash sendiri');
});

Deno.test('M1-AB: hash tidak pernah ditulis sebelum gerbang lolos, dan tidak ada model call mendahuluinya', async () => {
  const src = await Deno.readTextFile(EF_MODUL);

  const iGerbang = src.indexOf('const gerbang = periksaAnchor({');
  const iTolak   = src.indexOf('if (!gerbang.boleh_generate) {');
  const iTulis   = src.indexOf('tp_snapshot_hash: hashSekarang');
  const iModel   = src.indexOf('await callPhase(');

  assert(iGerbang > 0 && iTolak > iGerbang, 'gerbang atau penolakannya tidak ditemukan');
  assert(iTulis > iTolak, 'hash ditulis sebelum gerbang menolak');
  assert(iModel > iTolak, 'model dipanggil sebelum gerbang menolak');

  // Hanya SATU tempat yang menulis hash, dan ia berada di jalur Fase A.
  assertEquals([...src.matchAll(/tp_snapshot_hash:\s*\w+/g)].length, 1,
    'lebih dari satu jalur menulis tp_snapshot_hash');

  // Penolakan benar-benar mengakhiri permintaan.
  const blokTolak = src.slice(iTolak, iTolak + 1200);
  assert(/return json\(\{[\s\S]*\}, 409\);/.test(blokTolak),
    'gerbang tidak mengembalikan konflik 409');
});

Deno.test('M1-AC: gerbang membaca keadaan draft dari baris Modul yang sebenarnya', async () => {
  const src = await Deno.readTextFile(EF_MODUL);

  // Riwayat dihitung dari konten baris, bukan dari badan permintaan.
  assert(/const adaRiwayat\s*=\s*punyaRiwayatPenyusunan\(kontenObj\)/.test(src),
    'riwayat tidak dihitung dari kontenObj');
  assert(/const judulCocok\s*=\s*judulSama\(judulTpModul, tpAnchor\.tp_judul\)/.test(src),
    'kecocokan judul tidak diperiksa terhadap anchor server');
  assert(/periksaAnchor\(\{[\s\S]{0,160}adaRiwayat[\s\S]{0,80}judulCocok/.test(src),
    'gerbang tidak menerima kedua tanda baru');

  // kontenObj memang berasal dari kolom konten baris modul_induk.
  assert(/const kontenObj\s*=\s*\(\(modul as Record<string, unknown>\)\.konten/.test(src),
    'kontenObj bukan konten baris Modul');
});
