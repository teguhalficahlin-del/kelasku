// IDENTITAS TP UNTUK MODUL AJAR — M1.
//
// Berkas ini MURNI: tidak menyentuh jaringan, database, maupun Deno.env. Ia
// dapat diimpor uji apa adanya, dan itu disengaja — identitas TP adalah hal
// yang paling mahal kalau salah dan paling murah kalau diuji.
//
// MASALAH YANG DITUTUP (docs/MODULE-NASKAH-CONTRACT-LOCK.md §P).
// `modul_induk` terikat ke ATP hanya lewat (atp_induk_id, nomor_tp) — sebuah
// bilangan posisi — sementara `generate-atp` menimpa `progresi_tp` DI BARIS
// YANG SAMA setiap kali ATP disusun ulang. Nomornya tetap resolve, ke TP yang
// berbeda. Modul lalu dibangun untuk TP yang bukan miliknya, tanpa satu pun
// galat, di klien maupun di server.
//
// YANG DIPILIH: SNAPSHOT HASH, BUKAN ID TP LINTAS REGENERASI.
// Keduanya menjawab pertanyaan yang berbeda. Id lintas regenerasi menjawab
// "apakah ini TP yang sama?" — pertanyaan yang tidak punya jawaban jujur, sebab
// TP nomor 5 setelah penyusunan ulang bisa saja kemampuan yang sama sekali
// lain. Snapshot hash menjawab "apakah ini POTRET TP yang persis dipakai Modul
// ini?" — dan itu selalu dapat dijawab dengan pasti. Kalau berubah, Modul
// berhenti dan bertanya, bukan menebak.

/** Potret TP yang dipakai satu Modul. Seluruh isinya berasal dari data ATP
 *  sisi server — klien tidak pernah menjadi otoritas (§12 M1). */
export type TpAnchor = {
  atp_induk_id:  string;
  nomor_tp:      number;
  tp_judul:      string;
  /** ID tuntutan CP yang TP ini pikul. Himpunan — urutannya tidak bermakna. */
  tuntutan:      string[];
  /** Kategori teks yang wajib tercakup. Himpunan — urutannya tidak bermakna. */
  kategori_teks: string[];
  semester:      number | null;
  jp_alokasi:    number | null;
  /** Distribusi JP per pertemuan. URUTANNYA BERMAKNA — jangan pernah disortir. */
  jp_pertemuan:  number[];
  /** Versi CP yang berlaku saat ATP disusun, dari ATP_HASIL.acuan_cp. */
  versi_cp:      string | null;
};

/** Baris ATP apa adanya, sebagaimana dibaca dari `atp_induk`. */
export type BarisAtp = {
  id?:             unknown;
  progresi_tp?:    unknown;
  collected_data?: unknown;
};

function teksRapi(v: unknown): string {
  return String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

function angkaAtauNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function daftarTeks(v: unknown): string[] {
  return Array.isArray(v) ? v.map(teksRapi).filter(Boolean) : [];
}

/**
 * Membangun potret TP dari data ATP sisi server.
 *
 * Mengembalikan null bila nomor TP itu TIDAK ADA di `progresi_tp` — keadaan
 * yang berarti Modul sudah yatim, dan pemanggilnya wajib menanganinya sebagai
 * konflik, bukan menambalnya dengan judul lama yang tersimpan.
 */
export function bangunTpAnchor(atp: BarisAtp, atpIndukId: string, nomorTp: number): TpAnchor | null {
  const progresi = Array.isArray(atp.progresi_tp)
    ? (atp.progresi_tp as Array<Record<string, unknown>>) : [];
  const tp = progresi.find(x => Number(x?.nomor) === Number(nomorTp));
  if (!tp) return null;

  const cd     = (atp.collected_data ?? {}) as Record<string, unknown>;
  const hasil  = (cd.ATP_HASIL ?? {}) as Record<string, unknown>;
  const acuan  = (hasil.acuan_cp ?? {}) as Record<string, unknown>;
  const versi  = teksRapi(acuan.versi_cp);

  return {
    atp_induk_id:  teksRapi(atpIndukId),
    nomor_tp:      Number(nomorTp),
    tp_judul:      teksRapi(tp.judul),
    tuntutan:      daftarTeks(tp.tuntutan),
    kategori_teks: daftarTeks(tp.kategori_teks),
    semester:      angkaAtauNull(tp.semester),
    jp_alokasi:    angkaAtauNull(tp.jp_alokasi),
    jp_pertemuan:  Array.isArray(tp.jp_pertemuan)
      ? (tp.jp_pertemuan as unknown[]).map(n => Number(n)).filter(n => Number.isFinite(n))
      : [],
    versi_cp:      versi || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// KANONIKALISASI — apa yang MASUK hash, dan bagaimana bentuknya
// ─────────────────────────────────────────────────────────────────────────────
//
// Sembilan field, dalam urutan tetap di bawah, tanpa kecuali:
//
//   atp_induk_id   apa adanya
//   nomor_tp       angka
//   tp_judul       NFC, spasi beruntun jadi satu, dipangkas ujungnya
//   tuntutan       DISORTIR — himpunan, urutan model tidak bermakna
//   kategori_teks  DISORTIR — himpunan, urutan model tidak bermakna
//   semester       angka atau null
//   jp_alokasi     angka atau null
//   jp_pertemuan   TIDAK DISORTIR — urutannya adalah rancangan pertemuan
//   versi_cp       teks atau null
//
// Yang SENGAJA TIDAK masuk: `konteks`, `catatan`, `elemen`, dan `tipe` warisan.
// Ketiganya keterangan yang dapat berubah tanpa mengubah apa yang dituntut dari
// murid, dan memasukkannya berarti menghentikan Modul karena suntingan redaksi.
//
// Hash TIDAK PERNAH boleh berasal dari nomor atau judul saja: judul dapat
// dipoles sementara tuntutannya diganti diam-diam, dan itu justru perubahan
// yang paling berbahaya bagi Modul yang sudah jadi.
export const FIELD_HASH: readonly string[] = [
  'atp_induk_id', 'nomor_tp', 'tp_judul', 'tuntutan',
  'kategori_teks', 'semester', 'jp_alokasi', 'jp_pertemuan', 'versi_cp',
];

/** Bentuk kanonik anchor — satu string, deterministik untuk isi yang sama. */
export function kanonikAnchor(a: TpAnchor): string {
  const pasangan: Array<[string, unknown]> = [
    ['atp_induk_id',  a.atp_induk_id],
    ['nomor_tp',      Number(a.nomor_tp)],
    ['tp_judul',      teksRapi(a.tp_judul)],
    ['tuntutan',      [...a.tuntutan].map(teksRapi).sort()],
    ['kategori_teks', [...a.kategori_teks].map(teksRapi).sort()],
    ['semester',      a.semester ?? null],
    ['jp_alokasi',    a.jp_alokasi ?? null],
    ['jp_pertemuan',  [...a.jp_pertemuan]],   // urutan dipertahankan
    ['versi_cp',      a.versi_cp ?? null],
  ];
  if (pasangan.length !== FIELD_HASH.length
      || pasangan.some(([k], i) => k !== FIELD_HASH[i])) {
    throw new Error('kanonikAnchor: daftar field menyimpang dari FIELD_HASH');
  }
  return JSON.stringify(pasangan);
}

/** SHA-256 heksadesimal atas bentuk kanonik. */
export async function hitungTpSnapshotHash(a: TpAnchor): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(kanonikAnchor(a)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// GERBANG — apakah Modul ini boleh disusun terhadap ATP yang sekarang
// ─────────────────────────────────────────────────────────────────────────────

/** Kunci draft yang BENAR-BENAR dipakai pipeline sekarang — diambil dari
 *  penulisan di index.ts (fase A/B/C/B2), bukan ditebak. Kalau pipeline
 *  menambah fase, daftar ini ikut, dan uji M1-T menjaganya. */
export const KUNCI_DRAFT: readonly string[] = ['fase_a', 'fase_b', 'fase_c', 'fase_b2'];

/**
 * Apakah baris Modul ini SUDAH PERNAH DISUSUN terhadap suatu potret TP.
 *
 * M1.1. Sampai M1, pembedanya hanya `konten.schema_version` — dokumen final.
 * Itu tidak cukup: Modul pra-M1 yang berhenti di tengah jalan punya
 * `_draft.fase_a` tanpa `schema_version`, dan karena itu dibaca sebagai baris
 * baru. Konsekuensinya nyata: ATP berubah, permintaan berikutnya masuk,
 * gerbang mengizinkan, dan Fase B menyusun pertemuan dari draft milik TP LAMA
 * dengan potret TP BARU. Dua TP dijahit jadi satu dokumen tanpa satu pun galat.
 *
 * Riwayat dibaca dari BEKAS PENYUSUNAN, bukan dari kelengkapannya.
 */
export function punyaRiwayatPenyusunan(konten: unknown): boolean {
  const k = (konten ?? {}) as Record<string, unknown>;
  if (typeof k.schema_version === 'string' && k.schema_version) return true;
  const draft = (k._draft ?? {}) as Record<string, unknown>;
  return KUNCI_DRAFT.some(f => {
    const v = draft[f];
    return v !== undefined && v !== null;
  });
}

/** Perbandingan judul yang mengabaikan spasi dan bentuk normalisasi saja. */
export function judulSama(a: unknown, b: unknown): boolean {
  return teksRapi(a) === teksRapi(b);
}

export type StatusAnchor =
  /** Modul baru, atau modul yang belum punya isi final: boleh memakai potret sekarang. */
  | 'BARU'
  /** Potret Modul sama dengan ATP sekarang: lanjut. */
  | 'COCOK'
  /** ATP berubah sejak Modul disusun: berhenti dan beri tahu guru. */
  | 'STALE'
  /** Modul lama tanpa potret, sudah berisi: boleh dibuka dan diunduh, tidak boleh
   *  dianggap cocok, dan tidak boleh disusun ulang tanpa keputusan eksplisit. */
  | 'LEGACY_UNVERIFIED';

export const KODE_STALE = 'MODULE_TP_ANCHOR_STALE';
export const KODE_LEGACY = 'MODULE_TP_ANCHOR_LEGACY';

/**
 * Keputusan gerbang. Sengaja fungsi murni tanpa I/O supaya seluruh tabel
 * kebenarannya diuji tanpa database (M1-J sampai M1-M).
 *
 * `hashTersimpan === null` pada modul yang SUDAH berisi TIDAK berarti cocok.
 * Ia berarti tidak diketahui — dan tidak diketahui bukan sinonim aman. Karena
 * itu ia tidak pernah di-backfill dari ATP sekarang: menghitungkan hash hari
 * ini untuk modul yang disusun dari potret kemarin justru memberi identitas
 * palsu kepada ketidakcocokan yang nyata.
 */
export function periksaAnchor(p: {
  hashTersimpan:  string | null;
  hashSekarang:   string;
  /** Dokumen final pernah ditulis. Dipertahankan sebagai bentuk ringkas
   *  `adaRiwayat` untuk pemanggil lama. */
  adaKontenFinal: boolean;
  /** M1.1. Ada bekas penyusunan apa pun — dokumen final ATAU draft fase.
   *  Bawaannya `adaKontenFinal`, sehingga pemanggil lama tidak berubah arti. */
  adaRiwayat?:    boolean;
  /** M1.1. Untuk baris yang benar-benar kosong: apakah judul TP yang tersimpan
   *  saat baris dibuat masih sama dengan judul TP di ATP sekarang.
   *  Bawaannya true — pemanggil yang tidak memeriksanya berperilaku seperti M1. */
  judulCocok?:    boolean;
}): { status: StatusAnchor; kode: string | null; boleh_generate: boolean } {
  if (!p.hashTersimpan) {
    // Pernah disusun terhadap potret yang tidak tercatat: potret sekarang TIDAK
    // boleh diadopsi diam-diam. Yang ada di draft berasal dari TP yang lain.
    if (p.adaRiwayat ?? p.adaKontenFinal) {
      return { status: 'LEGACY_UNVERIFIED', kode: KODE_LEGACY, boleh_generate: false };
    }
    // Baris benar-benar kosong, tetapi ia tetap membawa identitas minimum yang
    // dicatat SAAT GURU MEMILIH TP: nomor dan judul. Kalau judul itu tidak lagi
    // cocok, guru memilih potret yang sekarang sudah tidak ada — dan mengambil
    // potret baru berarti mengganti TP-nya tanpa ia tahu.
    if ((p.judulCocok ?? true) === false) {
      return { status: 'STALE', kode: KODE_STALE, boleh_generate: false };
    }
    return { status: 'BARU', kode: null, boleh_generate: true };
  }
  return p.hashTersimpan === p.hashSekarang
    ? { status: 'COCOK', kode: null,        boleh_generate: true }
    : { status: 'STALE', kode: KODE_STALE,  boleh_generate: false };
}

/**
 * Keterangan konflik untuk guru. Hanya yang ia perlukan untuk memutuskan —
 * bukan hash, bukan id, bukan nama field.
 */
export function keteranganKonflik(p: {
  nomorTpModul:  number;
  judulTpModul:  string;
  anchorSekarang: TpAnchor | null;
}): Record<string, unknown> {
  return {
    tp_modul:   { nomor: p.nomorTpModul, judul: p.judulTpModul },
    tp_atp_kini: p.anchorSekarang
      ? { nomor: p.anchorSekarang.nomor_tp, judul: p.anchorSekarang.tp_judul }
      : null,
    atp_berubah: true,
  };
}
