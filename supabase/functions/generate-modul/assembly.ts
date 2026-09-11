// OTORITAS TUNGGAL PERAKITAN MODUL FINAL (koreksi M9, 11 September 2026).
//
// Fase D merakit `konten` final dari keluaran Fase A, B, C, B2, dan D. Sampai
// koreksi ini, perakitan itu ditulis DUA KALI: sekali di handler Edge Function,
// sekali di tests/m9-semantic-harness.ts. Keduanya menyimpang diam-diam — harness
// membawa `keputusan_kontekstual` (M6), handler tidak — sehingga seluruh uji M9
// hijau sementara setiap Modul baru di produksi gagal validasi Fase D dengan
// "keputusan_kontekstual harus array ≥ 1 entri", perbaikannya gagal, dan guru
// menerima HTTP 422 (smoke produksi, Modul fff9db36).
//
// Berkas ini adalah SATU-SATUNYA tempat daftar field akar dokumen final ditulis.
// Handler, uji regresi, dan harness semantik memanggil fungsi yang sama. Jangan
// menulis ulang daftar ini di tempat lain — kembar yang menyimpang sudah dibayar
// di produksi.
//
// Murni: tidak ada jaringan, tidak ada DB, tidak ada panggilan model.

import { MODUL_SCHEMA_VERSION } from './contract.ts';
import type { TpAnchor } from './anchor.ts';

export type BahanRakitModul = {
  faseAOutput:     Record<string, unknown>;
  faseBOutput:     Record<string, unknown>;
  faseCOutput:     Record<string, unknown>;
  faseDOutput:     Record<string, unknown>;
  /** Naskah fasilitasi final (B2, draft lama, atau disusun ulang di Fase D). */
  naskahFinal:     unknown[] | undefined;
  identitasDB:     Record<string, string>;
  nomorTp:         number;
  jumlahPertemuan: number;
  jpPerPertemuan:  number;
  durasiJp:        number;
  elemenCp:        Array<{ label: string; cp_text: string }>;
  tpAnchor:        TpAnchor;
  // Bagian milik server diteruskan apa adanya — perakitan tidak membacanya.
  tuntutanTerurai: unknown;
  kategoriWajib:   unknown;
  atpContext:      unknown;
  alokasiServer:   unknown;
};

export function rakitModulFinal(b: BahanRakitModul): Record<string, unknown> {
  const { faseAOutput, faseBOutput, faseCOutput, faseDOutput, identitasDB, elemenCp } = b;

  // Merge semua fase → ModulOutput V4.0
  // Identitas deterministik diambil dari DB params — tidak dari AI output
  // AI hanya dipercaya untuk dasar_cp, tujuan_pembelajaran, konteks_kejuruan
  const identitasAI = (faseAOutput.identitas ?? {}) as Record<string, unknown>;
  const identitasFinal: Record<string, unknown> = {
    mata_pelajaran:            identitasDB.mapel  || identitasAI.mata_pelajaran,
    jenjang:                   identitasDB.jenjang || identitasAI.jenjang,
    fase:                      identitasDB.fase   || identitasAI.fase,
    nomor_tp:                  b.nomorTp,
    jumlah_pertemuan:          b.jumlahPertemuan,
    jp_per_pertemuan:          b.jpPerPertemuan,
    durasi_jp_menit:           b.durasiJp,
    alokasi_waktu_total_menit: b.jumlahPertemuan * b.jpPerPertemuan * b.durasiJp,
    elemen_cp:                 elemenCp.map(e => e.label),
    jenis_dokumen:             'Modul Induk; guru mengadaptasi konteks kelas dan program keahlian',
    konteks_kejuruan:          identitasAI.konteks_kejuruan,
    // dasar_cp DIRAKIT BACKEND sejak 8 September 2026, bukan dipilih AI.
    //
    // Telaah ahli kurikulum menemukan "Dasar CP" yang dicetak di modul tidak
    // menjelaskan seluruh kompetensi yang dituntut KKTP-nya. Setelah
    // ditelusuri, teksnya TIDAK dikarang — ia verbatim dari CP resmi. Cacatnya
    // lebih halus: TP ini menyentuh TIGA elemen CP, tapi AI hanya menyalin
    // SATU. Akibatnya kriteria tentang menjawab pertanyaan audiens tidak bisa
    // ditelusuri ke dasar yang tercantum, dan guru mengarsipkan dokumen yang
    // rujukannya tidak lengkap.
    //
    // Memilih elemen mana yang dikutip bukan penilaian pedagogis — ia
    // penyalinan. Menyerahkannya ke model hanya menambah satu tempat lagi
    // yang bisa meleset tanpa ada yang mengeluh.
    dasar_cp:                  elemenCp.length
      ? elemenCp.map(e => `${e.label}: ${e.cp_text}`).join('\n\n')
      : identitasAI.dasar_cp,
    tujuan_pembelajaran:       identitasAI.tujuan_pembelajaran,
  };
  return {
    schema_version:         MODUL_SCHEMA_VERSION,
    identitas:              identitasFinal,
    kktp:                   faseAOutput.kktp,
    // JEJAK KAUSALITAS (M6). Disusun Fase A dan WAJIB pada dokumen yang disusun
    // sekarang (validator, wajibKausalitasCurrent). Handler lama tidak
    // membawanya ke sini, sehingga Fase D menolak setiap Modul baru dan
    // perbaikan tidak pernah diberi tahu field ini wajib tetap ada
    // (daftarnya diturunkan dari Object.keys dokumen ini).
    keputusan_kontekstual:  faseAOutput.keputusan_kontekstual,
    konteks_murid:          faseAOutput.konteks_murid,
    materi_esensial:        faseAOutput.materi_esensial,
    rencana_asesmen:        faseAOutput.rencana_asesmen,
    rancangan:              faseAOutput.rancangan,
    pertemuan:              faseBOutput.pertemuan,
    naskah_fasilitasi:      b.naskahFinal ?? [],
    instrumen_pembelajaran: faseCOutput.instrumen_pembelajaran ?? [],
    instrumen_asesmen:      faseCOutput.instrumen_asesmen ?? [],
    tindak_lanjut:          faseDOutput.tindak_lanjut,
    catatan_guru:           faseDOutput.catatan_guru,
    metadata_pedagogis:     faseAOutput.metadata_pedagogis,
    // JEJAK WARISAN (M2). Fase D menyusun `konten` final dari nol, jadi jejak
    // yang dipaku di Fase A harus ikut dibawa ke sini — kalau tidak, ia hilang
    // persis pada dokumen yang paling lama hidup. Validator tidak menolak
    // field di luar daftarnya; ia memeriksa yang ada, bukan melarang yang lain.
    tp_anchor: {
      ...b.tpAnchor,
      tuntutan: b.tuntutanTerurai,
      tuntutan_id: b.tpAnchor.tuntutan,
      kategori_teks_wajib: b.kategoriWajib,
    },
    atp_context:    b.atpContext,
    alokasi_server: b.alokasiServer,
  };
}
