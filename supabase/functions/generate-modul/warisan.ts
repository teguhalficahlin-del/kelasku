// PEWARISAN KEPUTUSAN ATP KE MODUL AJAR — M2.
//
// Berkas ini MURNI: tidak menyentuh jaringan, database, maupun Deno.env, dan
// dapat diimpor uji apa adanya. Sama alasannya dengan anchor.ts — yang paling
// mahal kalau salah adalah data yang diam-diam berasal dari sumber yang keliru.
//
// MASALAH YANG DITUTUP (docs/MODULE-NASKAH-CONTRACT-LOCK.md §A, §I, §O).
// Sampai M1, Modul menerima NOMOR dan JUDUL TP, lalu berhenti. Seluruh
// keputusan yang ATP baru saja ambil — tuntutan CP yang TP itu pikul, kategori
// teks yang wajib tercakup, porsi konteks A17, penekanan guru, kesiapan murid,
// versi CP — tidak pernah sampai. Modul karena itu tidak dapat bertentangan
// dengan ATP bukan karena patuh, melainkan karena tidak tahu.
//
// SATU NILAI SATU OTORITAS. Seluruh isi berkas ini berasal dari data ATP sisi
// server dan acuan CP yang SUDAH diterima ATP. Tidak ada teks tuntutan yang
// disalin ke sini, tidak ada daftar tuntutan kedua, dan tidak ada mapel atau
// fase yang ditulis keras. Definisi tuntutan diambil lewat helper milik ATP —
// `acuanUntuk()` dan `tuntutanWajib()` — sehingga kalau acuan CP berubah,
// Modul ikut berubah tanpa disunting.

import {
  acuanUntuk, tuntutanWajib, resolveDelegasi, prioritasDipilih,
  statusLayanan, jawaban, dasarProfilMurid,
  DELEGASI_SEMANTIK, LABEL_KONTEKS_TUGAS, LABEL_KESIAPAN,
  type PenerapanPrioritasTersimpan, type KeputusanMiClass,
} from '../generate-atp/kontrak.ts';
import type { TuntutanCp } from '../generate-atp/acuan-cp.ts';
import type { TpAnchor } from './anchor.ts';

// ─────────────────────────────────────────────────────────────────────────────
// ASAL SEBUAH NILAI
// ─────────────────────────────────────────────────────────────────────────────
//
// `kesiapan = jauh_di_bawah` dan `konteks_tugas = seimbang` bukan jenis data
// yang sama: yang pertama gambaran keadaan, yang kedua keputusan — dan
// keputusan itu bisa milik guru atau milik MiClass. Membedakannya sekarang
// jauh lebih murah daripada menebaknya nanti, saat seseorang bertanya kenapa
// sebuah modul berbentuk begitu.
export type Asal =
  | 'fakta'           // keadaan yang tercatat: jumlah murid, program keahlian
  | 'keputusan_guru'  // guru memilihnya sendiri
  | 'keputusan_atp';  // guru mendelegasikan; ATP yang memutuskan

export type Bernilai<T> = { nilai: T; asal: Asal };

// ─────────────────────────────────────────────────────────────────────────────
// 1. TUNTUTAN CP — dari ID menjadi makna
// ─────────────────────────────────────────────────────────────────────────────

export type TuntutanTerurai = {
  id:             string;
  kompetensi:     string;
  lingkup_materi: string;
  /** Cakupan yang WAJIB terpenuhi gabungan TP yang merujuk tuntutan ini —
   *  mis. kategori teks fiksi DAN nonfiksi. Ada hanya bila acuan menuntutnya.
   *  M2 meneruskannya; penegakan atas bahan nyata adalah M5. */
  cakupan_wajib?: TuntutanCp['cakupan_wajib'];
};

export const KODE_TUNTUTAN_ASING  = 'MODUL_TUNTUTAN_TIDAK_DIKENAL';
export const KODE_ACUAN_HILANG    = 'MODUL_ACUAN_CP_TIDAK_TERSEDIA';
export const KODE_TUNTUTAN_KOSONG = 'MODULE_TP_TUNTUTAN_TIDAK_TERSEDIA';
export const KODE_LAYANAN_CP      = 'MODUL_CP_TIDAK_DILAYANI';

/**
 * Menguraikan ID tuntutan TP menjadi kompetensi dan lingkup materinya, dari
 * acuan CP yang sama yang dipakai ATP.
 *
 * ID yang tidak dikenal adalah KEGAGALAN KERAS, bukan sesuatu yang dilewati.
 * Melewatinya berarti Modul menyusun untuk tuntutan yang tidak ada isinya —
 * persis kelas cacat yang M1 tutup di sisi identitas, dan tidak ada gunanya
 * ditutup di sana lalu dibuka lagi di sini.
 *
 * DAFTAR KOSONG JUGA KEGAGALAN (M2.1). Sampai M2 daftar kosong dikembalikan apa
 * adanya, dengan alasan "ATP lama tetap boleh dibuka". Alasan itu benar untuk
 * MEMBACA dokumen lama, tetapi fungsi ini hanya dipanggil di jalur MENYUSUN
 * Modul baru — dan menyusun Modul dari TP yang tidak punya kontrak tuntutan
 * berarti KKTP, materi, dan instrumennya diturunkan dari JUDUL. Itu persis
 * pengetahuan-nol yang M1 dan M2 tutup. Membuka dokumen lama tidak melewati
 * fungsi ini sama sekali (klien membaca `modul_induk` langsung), jadi menutup
 * jalur penyusunan tidak menutup jalur pembacaan.
 */
export function uraikanTuntutan(mapel: string, fase: string, ids: string[]): TuntutanTerurai[] {
  if (!ids.length) {
    throw Object.assign(
      new Error(
        'ATP ini tidak mencatat tuntutan Capaian Pembelajaran untuk TP tersebut, sehingga Modul Ajar '
        + 'belum dapat disusun darinya. Susun ulang ATP-nya lebih dulu agar tuntutan CP tiap TP tercatat.'),
      { code: KODE_TUNTUTAN_KOSONG });
  }
  const acuan = acuanUntuk(mapel, fase);
  if (!acuan) {
    throw Object.assign(
      new Error(`Acuan CP untuk ${mapel} fase ${fase} tidak tersedia, sehingga tuntutan TP tidak dapat diuraikan.`),
      { code: KODE_ACUAN_HILANG });
  }
  const peta = new Map(tuntutanWajib(acuan).map(w => [w.id, w.t]));
  const asing = ids.filter(id => !peta.has(id));
  if (asing.length) {
    throw Object.assign(
      new Error(`Tuntutan CP tidak dikenal di acuan ${mapel} fase ${fase}: ${asing.join(', ')}.`),
      { code: KODE_TUNTUTAN_ASING, tuntutan_asing: asing });
  }
  return ids.map(id => {
    const t = peta.get(id)!;
    return {
      id,
      kompetensi:     t.kompetensi,
      lingkup_materi: t.lingkup_materi,
      ...(t.cakupan_wajib ? { cakupan_wajib: t.cakupan_wajib } : {}),
    };
  });
}

/** Kategori teks yang WAJIB tercakup TP ini — gabungan `cakupan_wajib` seluruh
 *  tuntutannya, bukan tebakan dari `kategori_teks` yang TP nyatakan. Keduanya
 *  diteruskan supaya M5 dapat membandingkannya dengan bahan yang nyata. */
export function kategoriWajibDariTuntutan(tuntutan: TuntutanTerurai[]): string[] {
  const out = new Set<string>();
  for (const t of tuntutan) for (const k of t.cakupan_wajib?.kategori_teks ?? []) out.add(k);
  return [...out].sort();
}

/**
 * Gerbang layanan CP untuk PENYUSUNAN Modul baru (M2.1).
 *
 * Tidak ada daftar versi yang disalin ke sini: `statusLayanan()` milik ATP sudah
 * memeriksa versi berlaku, versi tercabut, status telaah, dan cakupan layanan.
 * Menyalinnya berarti dua gerbang yang suatu hari berbeda pendapat.
 *
 * Yang ditambahkan hanya satu pemeriksaan yang memang milik Modul: versi CP yang
 * DIWARISI dari ATP harus TERBUKTI sama dengan versi acuan yang berlaku
 * sekarang. ATP yang disusun di atas CP lama boleh tetap dibaca, tetapi Modul
 * baru tidak boleh lahir darinya diam-diam.
 *
 * VERSI KOSONG BUKAN VERSI YANG COCOK (M2.2). Sampai M2.1 syaratnya berbunyi
 * "kalau ada dan berbeda, tolak" — sehingga ATP yang tidak mencatat versinya
 * sama sekali justru LOLOS, dan diam-diam diperlakukan seolah berpangkal pada
 * acuan yang berlaku. Padahal yang kita ketahui tentangnya persis nol.
 *
 * Dan nol itu tidak boleh dibaca dua arah. `versi_cp` kosong TIDAK berarti "ATP
 * lama, pasti CP sebelumnya" — menebak begitu sama mengarangnya dengan menebak
 * bahwa ia CP sekarang. Statusnya TIDAK TERVERIFIKASI, dan untuk jalur
 * menyusun, tidak terverifikasi ditutup secara konservatif: yang salah di sini
 * bukan dokumen yang tertunda, melainkan Modul yang lahir di atas kompetensi
 * yang tidak dapat dipertanggungjawabkan asalnya. Jalannya ada dan jelas —
 * susun ulang ATP-nya lewat alur yang sekarang, yang selalu mencatat versinya.
 */
export function periksaLayananCp(
  mapel: string, fase: string, versiCpDiwarisi: string | null,
): { didukung: boolean; alasan: string[]; versi_acuan: string | null } {
  const s = statusLayanan(mapel, fase);
  const alasan = [...s.alasan];
  const versiAcuan = s.acuan?.versi_cp ?? null;
  const diwarisi = String(versiCpDiwarisi ?? '').trim();

  if (s.didukung) {
    if (!diwarisi) {
      alasan.push(
        'ATP ini tidak mencatat versi Capaian Pembelajaran yang dipakai ketika ia disusun, '
        + 'sehingga tidak dapat dipastikan bahwa TP-nya berpangkal pada acuan yang berlaku sekarang. '
        + 'Susun ulang ATP-nya lebih dulu.');
    } else if (!versiAcuan) {
      // Tidak seharusnya terjadi: statusLayanan() hanya melaporkan didukung
      // bila acuannya ada. Diperiksa supaya keadaan mustahil berhenti di sini
      // dengan sebab yang tertulis, bukan lolos tanpa jejak.
      alasan.push('Acuan CP yang berlaku tidak menyebutkan versinya, sehingga kecocokan tidak dapat diperiksa.');
    } else if (diwarisi !== versiAcuan) {
      alasan.push(
        `ATP ini disusun di atas CP ${diwarisi}, sedangkan acuan yang berlaku sekarang ${versiAcuan}.`);
    }
  }
  return { didukung: alasan.length === 0, alasan, versi_acuan: versiAcuan };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ALOKASI PERTEMUAN — satu otoritas, yaitu potret server
// ─────────────────────────────────────────────────────────────────────────────

export type AlokasiPertemuan = {
  jumlah_pertemuan: number;
  /** Angka tunggal untuk pemakai lama (validator waktu, identitas). */
  jp_per_pertemuan: number;
  /** Sebaran sebenarnya, apa adanya dari ATP. */
  jp_pertemuan:     number[];
  jp_alokasi:       number | null;
  sumber:           'anchor_server';
};

/**
 * Sampai M2 angka ini diturunkan dari `collected_data.PILIH_TP.selected_tp`,
 * yaitu SALINAN KLIEN, sementara potret identitas memakai
 * `progresi_tp[].jp_pertemuan` dari server. Dua sumber untuk satu angka: modul
 * dapat disusun dengan jumlah pertemuan yang berbeda dari yang potretnya
 * catat, dan tidak ada yang mengeluh.
 *
 * Sekarang hanya potret server yang berlaku. Tidak ada jalan mundur diam-diam
 * ke salinan klien selama anchor server tersedia — dan anchor server SELALU
 * tersedia di jalur ini, karena gerbang M1 sudah menolak permintaan yang
 * TP-nya tidak ada lagi di ATP.
 */
export function alokasiPertemuanDariAnchor(a: TpAnchor): AlokasiPertemuan {
  const jp = a.jp_pertemuan.filter(n => Number.isFinite(n) && n > 0);
  const jumlah = jp.length;
  // ATP menjamin setiap pertemuan berisi satuan yang sama (validator W5), jadi
  // pada ATP yang diterima seluruh angkanya seragam. Rata-rata dibulatkan hanya
  // menjadi jalan mundur untuk data lama yang tidak seragam — bukan bentuk yang
  // diharapkan, dan sengaja tidak disembunyikan.
  const seragam = jumlah > 0 && jp.every(n => n === jp[0]);
  const perPertemuan = jumlah === 0 ? 0
    : seragam ? jp[0]
    : Math.round(jp.reduce((s, n) => s + n, 0) / jumlah);
  return {
    jumlah_pertemuan: jumlah,
    jp_per_pertemuan: perPertemuan,
    jp_pertemuan:     jp,
    jp_alokasi:       a.jp_alokasi,
    sumber:           'anchor_server',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. KEPUTUSAN A17 YANG BERLAKU
// ─────────────────────────────────────────────────────────────────────────────

/** Pertanyaan A17 sebagaimana ATP menamainya — diambil dari kontrak ATP, tidak
 *  ditulis ulang, supaya perubahan nama di sana tidak memutus pencarian di sini. */
const A17 = DELEGASI_SEMANTIK.find(q => q.question_id === 'A17')!;

/**
 * Porsi konteks contoh dan tugas yang BENAR-BENAR berlaku.
 *
 * Modul TIDAK BOLEH memilih ulang. Dua jalur, keduanya sudah selesai di ATP:
 *   - guru menjawab sendiri  → `resolveDelegasi()` mengembalikan kuncinya;
 *   - guru mendelegasikan    → keputusannya tersimpan di ATP_HASIL.
 *
 * Yang dikembalikan kunci enum yang SAMA dengan yang ATP pakai, bukan
 * tafsiran baru.
 */
export function konteksTugasEfektif(
  cd: Record<string, unknown>,
  keputusanAtp: KeputusanMiClass[],
): Bernilai<string | null> & { arti: string | null } {
  const eksplisit = resolveDelegasi(cd).konteks_tugas;
  if (eksplisit) {
    return {
      nilai: eksplisit, asal: 'keputusan_guru',
      arti: LABEL_KONTEKS_TUGAS[eksplisit] ?? null,
    };
  }
  const dariAtp = keputusanAtp.find(k => k.pertanyaan === A17.pertanyaan);
  if (dariAtp) {
    // `kunci` ada sejak Pass 5; ATP lama hanya menyimpan label manusia, dan itu
    // dipetakan balik alih-alih ditebak.
    const kunci = dariAtp.kunci
      ?? Object.keys(LABEL_KONTEKS_TUGAS).find(k => LABEL_KONTEKS_TUGAS[k] === dariAtp.dipilih)
      ?? null;
    return { nilai: kunci, asal: 'keputusan_atp', arti: dariAtp.dipilih ?? null };
  }
  return { nilai: null, asal: 'keputusan_atp', arti: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AMPLOP KONTEKS ATP
// ─────────────────────────────────────────────────────────────────────────────

export type AtpContext = {
  versi_cp:  string | null;
  semester:  number | null;
  /** Keadaan yang guru laporkan, BUKAN keputusan pedagogis (M2.1). `dasar`
   *  menyebut dari mana gambaran itu berasal — hasil penilaian, pengamatan, atau
   *  pengakuan guru bahwa informasinya belum cukup. */
  kesiapan_murid:   Bernilai<string> & { arti: string; dasar: string | null };
  jumlah_murid:     Bernilai<number | null>;
  program_keahlian: Bernilai<string | null>;
  konteks_tugas:    Bernilai<string | null> & { arti: string | null };
  prioritas_guru:   Array<{ kunci: string; arti: string; arahan: string }>;
  /** Jejak penerapan penekanan guru dari ATP. `untuk_tp_ini` adalah bagian yang
   *  benar-benar menunjuk TP yang sedang disusun; `seluruh_atp` dipertahankan
   *  supaya asal-usulnya tetap dapat ditelusuri. */
  penerapan_prioritas: {
    untuk_tp_ini: PenerapanPrioritasTersimpan[];
    seluruh_atp:  PenerapanPrioritasTersimpan[];
  };
};

/** Jawaban guru di ATP sebagai teks rapi, memakai pembaca amplop milik ATP
 *  (`jawaban()` sudah menangani bentuk { value, … } maupun nilai telanjang). */
function teksJawaban(cd: Record<string, unknown>, fase: string, id: string): string | null {
  const v = jawaban(cd, fase, id);
  const t = String(v ?? '').trim();
  return t || null;
}

/** Membaca amplop hasil ATP apa adanya, tanpa mengarang bagian yang tidak ada. */
export function bacaAtpHasil(cd: Record<string, unknown>): {
  keputusan: KeputusanMiClass[];
  penerapan: PenerapanPrioritasTersimpan[];
  versi_cp:  string | null;
} {
  const hasil = (cd.ATP_HASIL ?? {}) as Record<string, unknown>;
  const dasar = (hasil.dasar_penyusunan ?? {}) as Record<string, unknown>;
  const acuan = (hasil.acuan_cp ?? {}) as Record<string, unknown>;
  return {
    keputusan: Array.isArray(dasar.keputusan_miclass)
      ? dasar.keputusan_miclass as KeputusanMiClass[] : [],
    penerapan: Array.isArray(dasar.penerapan_prioritas)
      ? dasar.penerapan_prioritas as PenerapanPrioritasTersimpan[] : [],
    versi_cp: typeof acuan.versi_cp === 'string' ? acuan.versi_cp : null,
  };
}

export function bangunAtpContext(p: {
  /** collected_data milik atp_induk — jawaban guru di alur ATP. */
  cd:               Record<string, unknown>;
  anchor:           TpAnchor;
  /** Fakta operasional kelas SEKARANG, dari rancang_settings. Sengaja current:
   *  validator waktu Modul memakai angka yang sama, dan jumlah murid memang
   *  keadaan hari ini, bukan keputusan yang ATP ambil. */
  jumlahMurid:      number | null;
}): AtpContext {
  const { keputusan, penerapan } = bacaAtpHasil(p.cd);
  // Jawaban guru dapat tersimpan sebagai nilai telanjang atau dalam amplop
  // { value, source, confirmed_by_teacher }; keduanya dibaca apa adanya.
  const kesiapanKunci = (() => {
    const v = (p.cd.PROFIL_SISWA as Record<string, unknown> | undefined)?.tingkat_kemampuan_awal;
    const raw = (v && typeof v === 'object' && 'value' in v)
      ? (v as { value: unknown }).value : v;
    return String(raw ?? '') || 'belum_diketahui';
  })();

  return {
    versi_cp: p.anchor.versi_cp,
    semester: p.anchor.semester,
    kesiapan_murid: {
      nilai: kesiapanKunci,
      arti:  LABEL_KESIAPAN[kesiapanKunci] ?? LABEL_KESIAPAN.belum_diketahui,
      // M2.1: KEADAAN yang guru laporkan, bukan keputusan pedagogis seperti A17.
      // Menandainya 'keputusan_guru' menyamakan dua hal yang berbeda jenis —
      // persis yang taksonomi ini dibuat untuk mencegah. 'fakta' di sini berarti
      // "keadaan yang tercatat menurut informasi guru", bukan klaim kebenaran
      // objektif; seberapa kuat dasarnya dinyatakan terpisah di `dasar`.
      asal:  'fakta',
      dasar: dasarProfilMurid(p.cd) || null,
    },
    jumlah_murid: { nilai: p.jumlahMurid ?? null, asal: 'fakta' },
    // M2.1: POTRET ATP, bukan rancang_settings sekarang. Program keahlian yang
    // benar-benar dipakai menyusun ATP ini tersimpan di jawaban gurunya sendiri;
    // kelas yang programnya kemudian diganti tidak boleh mengubah arti ATP yang
    // sudah diterima. Tidak ada jalan mundur ke settings: menebak bahwa nilai
    // sekarang adalah nilai yang dulu dipakai justru memalsukan riwayat.
    program_keahlian: { nilai: teksJawaban(p.cd, 'KONTEKS_CP', 'program_keahlian'), asal: 'fakta' },
    konteks_tugas:    konteksTugasEfektif(p.cd, keputusan),
    prioritas_guru:   prioritasDipilih(p.cd).map(x => ({
      kunci: x.prioritas, arti: x.arti, arahan: x.arahan,
    })),
    penerapan_prioritas: {
      untuk_tp_ini: penerapan.filter(x =>
        Array.isArray(x.tp) && x.tp.map(Number).includes(Number(p.anchor.nomor_tp))),
      seluruh_atp: penerapan,
    },
  };
}
