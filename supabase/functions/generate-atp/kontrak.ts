// KONTRAK ATP — satu tempat untuk pertanyaan, konteks, keputusan, dan pemeriksaan.
//
// Berkas ini SENGAJA murni: tidak ada jaringan, tidak ada Deno.env, tidak ada
// basis data. Seluruh isinya bisa dijalankan oleh uji tanpa menyentuh produksi
// (tests/atp-kontrak.test.ts), dan itulah alasannya dipisahkan dari index.ts.
//
// Tiga hal yang sebelumnya tidak punya tempat tinggal, dan karena itu tidak
// pernah bisa diperiksa:
//
//   1. HUBUNGAN jawaban guru → keputusan ATP. Dulu seluruh collected_data
//      dilempar apa adanya ke prompt dan diharapkan model membacanya. Yang
//      ditanya tapi tidak dipakai tidak bisa dibedakan dari yang dipakai.
//   2. KEPUTUSAN yang guru delegasikan ("tentukan saat menyusun"). Dulu ia
//      hilang tanpa jejak: model memilih diam-diam, guru tidak pernah tahu apa
//      yang dipilih maupun atas dasar apa.
//   3. PEMERIKSAAN selain aritmetika. Validator lama hanya bisa menghitung;
//      ketergantungan pada video, cakupan CP, dan kepadatan TP lolos utuh.
//
// Lihat docs/SPEC-ATP-MODUL-BERBASIS-TEKS.md dan docs/SPEC-ATP-KONTRAK.md.

import { ACUAN_CP, type FaseAcuan, type TuntutanCp } from './acuan-cp.ts';

export const SKEMA_ATP = 'atp-1.0.0';

// ─────────────────────────────────────────────────────────────────────────────
// 1. BENTUK DATA
// ─────────────────────────────────────────────────────────────────────────────

export type ElemenCp = { id: string; label: string; cp_text: string };

export type TpEntry = {
  nomor: number;
  judul: string;
  elemen: string[];
  /** ID tuntutan CP dari acuan yang dilayani TP ini. Kosong hanya untuk ATP
   *  lama yang disusun sebelum acuan CP ada. */
  tuntutan?: string[];
  jp_alokasi: number;
  jp_pertemuan: number[];
  /** 1 atau 2. Satu TP tidak boleh terbelah dua semester. */
  semester?: number;
  konteks?: string[];
  /** Kategori teks yang dilayani TP ini. WAJIB bila TP melayani tuntutan yang
   *  acuannya menuntut cakupan_wajib.kategori_teks (Pass 5, SEM-006). Ini
   *  sumber kebenaran cakupan genre — bukan tebakan dari kata di judul. */
  kategori_teks?: string[];
  /** LEGACY. ATP yang disusun sebelum Pass 5 bisa memilikinya dan tetap dibaca,
   *  dirender, dan diunduh apa adanya. ATP baru TIDAK lagi memuatnya: setiap TP
   *  yang disusun adalah bagian wajib ATP (SEM-003, SEM-009). */
  tipe?: 'inti' | 'prasyarat' | 'pengayaan';
  catatan?: string;
};

export type KeputusanMiClass = {
  pertanyaan: string;
  didelegasikan_karena: 'guru memilih tentukan saat menyusun' | 'guru belum menjawab';
  dipilih: string;
  alasan: string;
  /** Bagaimana keputusan itu diambil.
   *  'aturan'     — deterministik di kode; aturannya dapat ditulis penuh dan
   *                 tidak menuntut pembacaan makna CP.
   *  'penyusunan' — diputuskan penyusun ATP di dalam panggilan yang sudah ada,
   *                 lalu divalidasi server terhadap allowlist dan terhadap
   *                 konteks yang benar-benar tersedia. */
  sumber?: 'aturan' | 'penyusunan';
  /** Hanya untuk sumber 'penyusunan'. Rujukan konteks yang menjadi dasarnya —
   *  bukan kalimat bebas, melainkan kunci dari daftar yang server izinkan.
   *  Klaim di luar daftar itu tidak pernah tersimpan sebagai fakta. */
  dasar?: string[];
  /** Hanya untuk sumber 'penyusunan'. Kunci enum yang dipilih, sebelum
   *  diterjemahkan jadi label manusia di `dipilih`. */
  kunci?: string;
};

export type Asumsi = { hal: string; sebab: string };

/** Amplop hasil ATP. Disimpan di atp_induk.collected_data.ATP_HASIL —
 *  BUKAN kolom baru: collected_data sudah jsonb dan sudah bisa ditulis klien
 *  maupun Edge Function, jadi kontrak ini tidak menuntut migration. */
export type AtpHasil = {
  schema_version: string;
  disusun_pada: string;
  acuan_cp: {
    versi: string; mapel: string; fase: string;
    /** Nomor regulasi CP yang menjadi dasar ATP ini. Disimpan supaya ATP lama
     *  dapat dikenali sebagai dokumen sejarah, bukan disangka ATP CP berlaku. */
    versi_cp: string;
    sumber_regulasi?: string;
  } | null;
  ringkasan: {
    jumlah_tp: number;
    total_jp: number;
    satuan_pertemuan: number;
    jumlah_pertemuan: number;
    target_jumlah_tp: number;
    asal_target_tp: 'permintaan guru' | 'hitungan MiClass';
  };
  /** Catatan mutu internal — TIDAK ditampilkan kepada guru. Isinya hal yang
   *  lolos gerbang tetapi berada di pita toleransi (mis. judul TP 13-16 kata).
   *  Guru tidak bisa berbuat apa-apa dengannya; yang membacanya adalah kita,
   *  saat menilai apakah pita toleransinya masih pada tempatnya. */
  catatan_mutu?: string[];
  anggaran_semester: { semester: number; minggu: number; jp: number }[];
  dasar_penyusunan: {
    dasar_profil_murid: string;
    konteks_dari_guru: string[];
    keputusan_miclass: KeputusanMiClass[];
    asumsi: Asumsi[];
    /** Jejak penekanan guru (A16) → TP yang menerapkannya. Sudah divalidasi dan
     *  diterjemahkan ke frasa manusia. Tidak ada pada ATP sebelum Pass 5. */
    penerapan_prioritas?: PenerapanPrioritasTersimpan[];
  };
  cakupan_cp: {
    diperiksa: boolean;
    tuntutan_wajib: string[];
    tuntutan_tercakup: string[];
    tuntutan_belum: string[];
  };
};

export type Konteks = {
  cp_anchor: {
    mapel: string; fase: string; jenjang: string; program_keahlian: string;
    elemen: { id: string; label: string; cp_text: string }[];
    tuntutan: {
      id: string; elemen: string; kompetensi: string; lingkup_materi: string;
      /** Hubungan AND/OR di dalam tuntutan. Dikirim ke penyusun karena
       *  memperlakukan jalur alternatif sebagai kewajiban kumulatif membuat TP
       *  menuntut lebih daripada yang CP minta. */
      logika: string;
      /** Cakupan kumulatif di dalam tuntutan (mis. fiksi DAN nonfiksi).
       *  `cara_layanan` SENGAJA tidak dikirim lagi (Pass 5, SEM-008): daftar
       *  bentuk media konkretnya adalah detail Modul dan terbukti bocor ke judul
       *  TP. Ia tetap hidup di acuan untuk audit layanan. */
      cakupan_wajib?: { kategori_teks?: string[] };
    }[];
  };
  kesiapan_murid: string[];
  prioritas_guru: string[];
  konteks_kejuruan: string[];
  anggaran_waktu: string[];
  keputusan_didelegasikan: string[];
  /** Pertanyaan yang guru delegasikan DAN yang penyusun harus jawab sendiri.
   *  Kosong berarti seluruh keputusan sudah diambil sebelum penyusunan. */
  keputusan_terbuka: {
    question_id: string;
    pertanyaan: string;
    opsi: { kunci: string; arti: string }[];
    pertimbangkan: string[];
    dasar_yang_boleh_disebut: string[];
  }[];
  /** Setiap penekanan yang guru pilih di A16. Penyusun WAJIB mengembalikan
   *  tepat satu entri penerapan_prioritas untuk masing-masing. */
  penerapan_prioritas_wajib: { prioritas: string; arti: string; arahan: string }[];
  batas_mutlak: string[];
};

/** Jejak penerapan satu penekanan guru, seperti yang penyusun kembalikan. */
export type PenerapanPrioritas = {
  prioritas: string;
  tp: number[];
  pengaruh: string[];
  alasan: string;
};

/** Bentuk yang disimpan di ATP_HASIL — sudah diterjemahkan ke frasa manusia
 *  supaya layar dan DOCX tidak pernah mencetak kunci mesin. */
export type PenerapanPrioritasTersimpan = {
  prioritas: string;
  kunci: string;
  tp: number[];
  pengaruh: string[];
  alasan: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. KONTRAK PERTANYAAN — question → stored → usage
// ─────────────────────────────────────────────────────────────────────────────
//
// jenis:
//   'A' generation input      — jawabannya memengaruhi isi ATP
//   'B' branching/UI          — jawabannya hanya mengatur alur pertanyaan
//   'C' deterministic         — jawabannya dihitung kode, tidak dikirim mentah
//
// Aturan yang dijaga uji: setiap pertanyaan ATP yang aktif WAJIB ada di sini,
// dan setiap entri wajib menyebut pemakainya. Pertanyaan tanpa pemakai adalah
// pertanyaan yang berbohong kepada guru — kelas cacat yang sudah ditemukan
// empat kali di corong ini (CLAUDE.md, "pertanyaan bisa berbohong").
export type EntriKontrak = {
  spec: string;         // A1..A20, A15a
  fase: string;         // fase corong tempat ia ditanyakan
  simpan: string;       // lokasi tersimpan
  jenis: 'A' | 'B' | 'C';
  dipakai: string;      // siapa yang membacanya
  keputusan: string;    // keputusan ATP apa yang dipengaruhinya
};

export const KONTRAK_PERTANYAAN: Record<string, EntriKontrak> = {
  konfirmasi_konteks: {
    spec: 'A1', fase: 'KONTEKS_CP', simpan: 'KONTEKS_CP.konfirmasi_konteks', jenis: 'B',
    dipakai: 'generate-atp langkah 5 (gerbang wajib "sesuai")',
    keputusan: 'menghentikan proses bila CP tidak sesuai — tidak ada generate, tidak ada kuota terpakai',
  },
  pilih_program_keahlian: {
    spec: 'A1', fase: 'KONTEKS_CP', simpan: 'KONTEKS_CP.pilih_program_keahlian', jenis: 'B',
    dipakai: 'klien — menentukan nilai program_keahlian', keputusan: '(cabang saja)',
  },
  program_keahlian_teks_bebas: {
    spec: 'A1', fase: 'KONTEKS_CP', simpan: 'KONTEKS_CP.program_keahlian_teks_bebas', jenis: 'B',
    dipakai: 'klien — menentukan nilai program_keahlian', keputusan: '(cabang saja)',
  },
  program_keahlian: {
    spec: 'A1', fase: 'KONTEKS_CP', simpan: 'KONTEKS_CP.program_keahlian', jenis: 'A',
    dipakai: 'bangunKonteksAtp → cp_anchor.program_keahlian + konteks_kejuruan',
    keputusan: 'keautentikan situasi kerja bila dipakai — bukan porsinya (milik A17) dan bukan kompetensinya',
  },
  jumlah_murid_kelas: {
    spec: 'A2', fase: 'PROFIL_KELAS', simpan: 'rancang_settings.jumlah_murid', jenis: 'A',
    dipakai: 'bangunKonteksAtp → batas_mutlak',
    keputusan: 'kelayakan TP: melarang tujuan yang menuntut tiap murid dinilai satu per satu di kelas besar',
  },
  bahasa_pengantar: {
    spec: 'A3', fase: 'PROFIL_KELAS', simpan: 'rancang_settings.bahasa_pengantar', jenis: 'A',
    dipakai: 'resolveDelegasi → bangunKonteksAtp.kesiapan_murid; generate-modul kebijakan bahasa',
    keputusan: 'bahasa judul TP dan dukungan bahasa yang diandaikan',
  },
  tingkat_kemampuan_awal: {
    spec: 'A4', fase: 'PROFIL_SISWA', simpan: 'PROFIL_SISWA.tingkat_kemampuan_awal', jenis: 'A',
    dipakai: 'bangunKonteksAtp → kesiapan_murid; hitungTargetTp; resolveDelegasi; generate-modul arahanTitikAwal',
    keputusan: 'titik awal progresi, kedalaman TP awal, dan kepadatan TP',
  },
  dasar_informasi_kesiapan: {
    spec: 'A5', fase: 'PROFIL_SISWA', simpan: 'PROFIL_SISWA.dasar_informasi_kesiapan', jenis: 'A',
    dipakai: 'bangunKonteksAtp → kesiapan_murid; dasarProfilMurid; kumpulkanAsumsi',
    keputusan: 'menandai profil murid sebagai bukti atau asumsi di hasil ATP',
  },
  kondisi_murid: {
    spec: 'A6', fase: 'PROFIL_SISWA', simpan: 'PROFIL_SISWA.kondisi_murid', jenis: 'B',
    dipakai: 'klien — membuka isian uraian', keputusan: '(cabang saja)',
  },
  kondisi_murid_uraian: {
    spec: 'A6', fase: 'PROFIL_SISWA', simpan: 'PROFIL_SISWA.kondisi_murid_uraian', jenis: 'A',
    dipakai: 'bangunKonteksAtp → kesiapan_murid',
    keputusan: 'penyesuaian titik awal dan urutan untuk kondisi yang guru sebutkan',
  },
  bantuan_konkret: {
    spec: 'A7', fase: 'PROFIL_SISWA', simpan: 'PROFIL_SISWA.bantuan_konkret', jenis: 'A',
    dipakai: 'bangunKonteksAtp → kesiapan_murid; kumpulkanAsumsi',
    keputusan: 'bentuk dukungan yang harus mungkin dilakukan di dalam TP',
  },
  bantuan_konkret_lain: {
    spec: 'A7', fase: 'PROFIL_SISWA', simpan: 'PROFIL_SISWA.bantuan_konkret_lain', jenis: 'A',
    dipakai: 'bangunKonteksAtp → kesiapan_murid', keputusan: 'sama dengan bantuan_konkret',
  },
  tahun_pelajaran: {
    spec: 'A8', fase: 'WAKTU', simpan: 'WAKTU.tahun_pelajaran', jenis: 'A',
    dipakai: 'bangunKonteksAtp → anggaran_waktu; identitas dokumen ATP',
    keputusan: 'tahun pelajaran yang tercetak pada ATP',
  },
  tahun_pelajaran_lain: {
    spec: 'A8', fase: 'WAKTU', simpan: 'WAKTU.tahun_pelajaran_lain', jenis: 'A',
    dipakai: 'bangunKonteksAtp → anggaran_waktu', keputusan: 'sama dengan tahun_pelajaran',
  },
  jp_per_minggu: {
    spec: 'A9', fase: 'WAKTU', simpan: 'WAKTU.jp_per_minggu', jenis: 'C',
    dipakai: 'hitungAlokasi → jp_operasional, satuan_pertemuan, anggaran semester',
    keputusan: 'seluruh anggaran waktu ATP',
  },
  durasi_jp: {
    spec: 'A10', fase: 'WAKTU', simpan: 'WAKTU.durasi_jp', jenis: 'A',
    dipakai: 'bangunKonteksAtp → anggaran_waktu; generate-modul durasi tahap',
    keputusan: 'panjang nyata satu pertemuan dalam menit',
  },
  durasi_jp_lain: {
    spec: 'A10', fase: 'WAKTU', simpan: 'WAKTU.durasi_jp_lain', jenis: 'A',
    dipakai: 'bangunKonteksAtp → anggaran_waktu; generate-modul', keputusan: 'sama dengan durasi_jp',
  },
  pola_jadwal: {
    spec: 'A11', fase: 'WAKTU', simpan: 'WAKTU.pola_jadwal', jenis: 'C',
    dipakai: 'hitungAlokasi → satuan_pertemuan',
    keputusan: 'kelipatan JP yang wajib dipatuhi setiap TP',
  },
  jp_per_sesi: {
    spec: 'A11', fase: 'WAKTU', simpan: 'WAKTU.jp_per_sesi', jenis: 'C',
    dipakai: 'hitungAlokasi → satuan_pertemuan', keputusan: 'sama dengan pola_jadwal',
  },
  minggu_efektif_mode: {
    spec: 'A12', fase: 'WAKTU', simpan: 'WAKTU.minggu_efektif_mode', jenis: 'C',
    dipakai: 'hitungAlokasi; kumpulkanAsumsi (menandai perkiraan sementara sebagai asumsi)',
    keputusan: 'apakah jumlah minggu berstatus data guru atau asumsi MiClass',
  },
  minggu_sem1: {
    spec: 'A12', fase: 'WAKTU', simpan: 'WAKTU.minggu_sem1', jenis: 'C',
    dipakai: 'hitungAlokasi → anggaran semester 1', keputusan: 'jumlah JP yang boleh ditempatkan di semester 1',
  },
  minggu_sem2: {
    spec: 'A12', fase: 'WAKTU', simpan: 'WAKTU.minggu_sem2', jenis: 'C',
    dipakai: 'hitungAlokasi → anggaran semester 2', keputusan: 'jumlah JP yang boleh ditempatkan di semester 2',
  },
  cadangan_minggu: {
    spec: 'A13', fase: 'WAKTU', simpan: 'WAKTU.cadangan_minggu', jenis: 'C',
    dipakai: 'hitungAlokasi → jp_cadangan', keputusan: 'JP yang disisihkan dari mengajar',
  },
  cadangan_minggu_lain: {
    spec: 'A13', fase: 'WAKTU', simpan: 'WAKTU.cadangan_minggu_lain', jenis: 'C',
    dipakai: 'hitungAlokasi → jp_cadangan', keputusan: 'sama dengan cadangan_minggu',
  },
  konfirmasi_waktu: {
    spec: 'A14', fase: 'WAKTU', simpan: 'WAKTU.konfirmasi_waktu', jenis: 'B',
    dipakai: 'klien — rute perbaikan waktu', keputusan: '(cabang saja)',
  },
  strategi_prasyarat: {
    spec: 'A15', fase: 'PENGUATAN_PRASYARAT', simpan: 'PENGUATAN_PRASYARAT.strategi_prasyarat', jenis: 'A',
    dipakai: 'resolveDelegasi → bangunKonteksAtp.kesiapan_murid',
    keputusan: 'penempatan penguatan kemampuan dasar: di awal, menyatu dengan topik, atau keduanya',
  },
  alokasi_prasyarat: {
    spec: 'A15a', fase: 'PENGUATAN_PRASYARAT', simpan: 'PENGUATAN_PRASYARAT.alokasi_prasyarat', jenis: 'B',
    dipakai: 'klien — membuka isian JP', keputusan: '(cabang saja)',
  },
  jp_prasyarat: {
    spec: 'A15a', fase: 'PENGUATAN_PRASYARAT', simpan: 'PENGUATAN_PRASYARAT.jp_prasyarat', jenis: 'C',
    dipakai: 'hitungAlokasi → jp_operasional; bangunKonteksAtp → kesiapan_murid',
    keputusan: 'JP yang dipesan lebih dulu untuk penguatan, sebelum TP membagi sisanya',
  },
  target_prioritas: {
    spec: 'A16', fase: 'PENGUATAN_PRASYARAT', simpan: 'PENGUATAN_PRASYARAT.target_prioritas', jenis: 'A',
    dipakai: 'prioritasDipilih → bangunKonteksAtp.prioritas_guru + penerapan_prioritas_wajib; validasiAtp P1–P4 (jejak penerapan)',
    keputusan: 'penekanan — urutan, porsi waktu, latar, atau isi — dengan jejak ke TP nyata; bukan bagian CP yang boleh diabaikan',
  },
  target_prioritas_uraian: {
    spec: 'A16', fase: 'PENGUATAN_PRASYARAT', simpan: 'PENGUATAN_PRASYARAT.target_prioritas_uraian', jenis: 'A',
    dipakai: 'prioritasDipilih (kunci uraian_guru) → prioritas_guru + penerapan_prioritas_wajib; validasiAtp P1–P4',
    keputusan: 'sama dengan target_prioritas',
  },
  konteks_tugas: {
    spec: 'A17', fase: 'KONTEKS_DUDI', simpan: 'KONTEKS_DUDI.konteks_tugas', jenis: 'A',
    dipakai: 'resolveDelegasi → bangunKonteksAtp.konteks_kejuruan',
    keputusan: 'OTORITAS porsi situasi kerja dibanding kehidupan sehari-hari pada contoh dan tugas TP — mengalahkan saran program keahlian',
  },
  situasi_khusus: {
    spec: 'A18', fase: 'KONTEKS_DUDI', simpan: 'KONTEKS_DUDI.situasi_khusus', jenis: 'B',
    dipakai: 'klien — membuka isian uraian', keputusan: '(cabang saja)',
  },
  situasi_khusus_uraian: {
    spec: 'A18', fase: 'KONTEKS_DUDI', simpan: 'KONTEKS_DUDI.situasi_khusus_uraian', jenis: 'A',
    dipakai: 'bangunKonteksAtp → konteks_kejuruan',
    keputusan: 'situasi yang wajib diutamakan atau dihindari di seluruh TP',
  },
  metode_pengurutan: {
    spec: 'A19', fase: 'KONTEKS_DUDI', simpan: 'KONTEKS_DUDI.metode_pengurutan', jenis: 'A',
    dipakai: 'resolveDelegasi → bangunKonteksAtp.prioritas_guru',
    keputusan: 'urutan TP sepanjang fase (Tabel 3.3 Panduan Pembelajaran dan Asesmen 2025)',
  },
  persetujuan_atp_summary: {
    spec: 'A20', fase: 'ATP_SUMMARY', simpan: 'ATP_SUMMARY.persetujuan_atp_summary', jenis: 'B',
    dipakai: 'generate-atp langkah 5 (gerbang wajib "generate")',
    keputusan: 'generate hanya berjalan setelah guru menyetujui arah ATP',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. KAMUS — kunci mesin → frasa manusia
// ─────────────────────────────────────────────────────────────────────────────
//
// Tidak ada kunci mentah yang boleh masuk prompt. "pasif_sangat_heterogen_
// rekomendasi" tidak bermakna apa pun bagi model; ia hanya terlihat seperti
// data. Pelajaran ini sudah dibayar di generate-modul (CLAUDE.md sesi
// 5 September) dan berlaku sama di sini.

export const LABEL_KESIAPAN: Record<string, string> = {
  sesuai:            'Sebagian besar murid sudah siap memulai fase ini.',
  sedikit_di_bawah:  'Murid sedikit di bawah titik awal fase dan perlu penyegaran singkat.',
  jauh_di_bawah:     'Banyak kemampuan dasar yang masih harus dibangun sebelum murid dapat mengerjakan tuntutan fase ini.',
  sangat_beragam:    'Kemampuan murid sangat beragam — ada yang siap, ada yang jauh tertinggal.',
  belum_diketahui:   'Kesiapan murid belum diketahui.',
};

export const LABEL_DASAR_KESIAPAN: Record<string, string> = {
  hasil_penilaian: 'Gambaran kesiapan ini berasal dari hasil penilaian atau pekerjaan murid.',
  pengamatan:      'Gambaran kesiapan ini berasal dari pengamatan dan pengalaman mengajar guru.',
  gabungan:        'Gambaran kesiapan ini berasal dari hasil penilaian sekaligus pengamatan guru.',
  belum_cukup:     'Guru menyatakan informasinya belum cukup — gambaran kesiapan berstatus perkiraan.',
};

export const LABEL_BANTUAN: Record<string, string> = {
  memahami_bacaan:          'memahami bacaan',
  menjawab_lisan:           'menjawab secara lisan',
  menyusun_tulisan:         'menyusun tulisan',
  mengikuti_urutan:         'mengikuti urutan kegiatan',
  mempertahankan_perhatian: 'mempertahankan perhatian',
  lainnya:                  'kebutuhan lain yang guru sebutkan',
  tidak_ada:                'tidak ada bantuan khusus yang diketahui',
  belum_diketahui:          'kebutuhan bantuan belum diketahui',
};

export const LABEL_PRIORITAS: Record<string, string> = {
  kemampuan_dasar:   'penguatan kemampuan dasar',
  kehidupan_sehari:  'penerapan pada kehidupan sehari-hari',
  pkl_kerja:         'kesiapan PKL dan dunia kerja',
  pendidikan_lanjut: 'kesiapan pendidikan lanjut dan tes akademik',
  kebutuhan_sekolah: 'kebutuhan khusus sekolah yang guru sebutkan',
  tidak_ada:         'tidak ada bagian yang perlu dikuatkan lebih dari yang lain',
};

export const LABEL_KONTEKS_TUGAS: Record<string, string> = {
  seimbang:  'Contoh dan tugas dibagi seimbang antara kehidupan sehari-hari dan situasi kerja.',
  kehidupan: 'Contoh dan tugas lebih banyak mengambil situasi kehidupan sehari-hari dan sekolah.',
  kerja:     'Contoh dan tugas lebih banyak mengambil situasi dunia kerja.',
};

// OTORITAS PROPORSI KONTEKS (Pass 5, SEM-004).
//
// Semantic test S5: guru memilih "kehidupan", tetapi konteks_kejuruan membuka
// dengan perintah tanpa syarat "Pakai kosakata, situasi, dokumen kerja …", dan
// perintah itu yang menang — 5 dari 11 TP berlatar kerja. Program keahlian kini
// hanya menentukan KEAUTENTIKAN situasi kerja bila dipakai; BERAPA BANYAK yang
// berlatar kerja ditentukan A17, dan pilihan eksplisit guru selalu menang.
export const ARAHAN_KONTEKS_TUGAS: Record<string, string> = {
  kehidupan:
    'KEPUTUSAN GURU — mayoritas TP berlatar kehidupan sehari-hari murid, sekolah, atau situasi umum yang masuk akal. ' +
    'Situasi kerja boleh muncul sebagai MINORITAS bila memang relevan, tetapi jangan dipaksakan. ' +
    'Keputusan ini mengalahkan saran konteks mana pun, termasuk program keahlian.',
  kerja:
    'KEPUTUSAN GURU — mayoritas TP boleh berlatar situasi dunia kerja program keahlian ini. ' +
    'Tuntutan yang situasi nyatanya ada di kehidupan sehari-hari tetap boleh memakai latar itu.',
  seimbang:
    'KEPUTUSAN GURU — situasi kehidupan sehari-hari atau sekolah DAN situasi kerja sama-sama hadir secara bermakna ' +
    'di sepanjang ATP; tidak ada yang sekadar tempelan.',
};

// PRIORITAS GURU (A16) — arah penerapan yang sah untuk tiap penekanan.
// Bukan daftar wajib; contoh bentuk pengaruh yang tidak mengubah kompetensi CP.
export const ARAHAN_PRIORITAS: Record<string, string> = {
  kemampuan_dasar:
    'fondasi kebahasaan dibangun lebih lapang di TP awal dan dikuatkan lagi saat topik membutuhkannya — bukan TP prasyarat tersendiri',
  kehidupan_sehari:
    'penerapan pada situasi sehari-hari murid yang nyata',
  pkl_kerja:
    'situasi kerja nyata yang relevan bagi program keahlian, dalam porsi yang diizinkan keputusan konteks contoh dan tugas',
  pendidikan_lanjut:
    'teks dengan register dan kompleksitas lebih akademik, penyimpulan, argumentasi berbasis bukti, dan konteks studi lanjut atau tes akademik yang relevan — tanpa mengubah kompetensi CP',
};

/** Kunci untuk prioritas yang guru tulis sendiri (target_prioritas_uraian). */
export const PRIORITAS_URAIAN = 'uraian_guru';

/** Allowlist bentuk pengaruh sebuah prioritas → frasa manusia. */
export const PENGARUH_PRIORITAS: Record<string, string> = {
  urutan:        'urutan',
  alokasi_waktu: 'porsi waktu',
  konteks:       'latar contoh dan tugas',
  penekanan:     'penekanan isi',
};

/** Allowlist kategori teks yang boleh disebut TP. */
export const KATEGORI_TEKS: Record<string, string> = { fiksi: 'fiksi', nonfiksi: 'nonfiksi' };

/** Batas tuntutan unik per TP (Pass 2 mendokumentasikannya sebagai heuristic;
 *  S6 semantic test membuktikannya belum ditegakkan). Pasangan mana pun boleh —
 *  yang dicegah hanya TP yang menumpuk banyak kemampuan. */
export const MAKS_TUNTUTAN_PER_TP = 2;

// KESIAPAN MURID — jalannya berubah, ujungnya tidak (Pass 5, readiness WEAK).
export const ARAHAN_KESIAPAN: Record<string, string> = {
  jauh_di_bawah:
    'Ujung fase TETAP tuntutan CP yang sama. Yang berubah jalannya: bahasa dan konteks TP awal dibuat lebih terjangkau, ' +
    'kemajuan dibuat lebih bertahap, dan kemampuan produktif yang kompleks (menulis argumen, mempertahankan argumen) ' +
    'tidak dimajukan sebelum fondasi pemahaman dan kalimatnya terbangun. Pakai JP per TP yang lebih lapang sebagai ruang ' +
    'berkembang. JANGAN membuat TP prasyarat, dan JANGAN menjadikan tuntutan ujung fase sebagai pilihan tambahan. ' +
    'Menulis kata "sederhana" di judul BUKAN penyesuaian kesiapan.',
  sangat_beragam:
    'Ujung fase TETAP sama untuk semua murid. TP dapat dimasuki dari beberapa titik awal: bahasa dan konteks TP awal ' +
    'terjangkau bagi yang tertinggal, dengan ruang tantangan bagi yang sudah siap. Jangan menurunkan kata kerja CP.',
  sedikit_di_bawah:
    'Ujung fase TETAP tuntutan CP yang sama. TP awal memberi penyegaran singkat di dalam topiknya sendiri, lalu progresi ' +
    'bergerak wajar menuju analisis dan produksi yang lebih kompleks.',
  sesuai:
    'Murid siap: TP boleh lebih cepat menuju analisis dan produksi yang kompleks. Jangan menambah tuntutan di luar CP.',
  belum_diketahui:
    'Kesiapan belum diketahui: mulai dari titik awal yang dijelaskan CP dengan kemajuan wajar. Jangan mengandaikan murid ' +
    'tertinggal maupun unggul.',
};

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESI KESIAPAN — KEBIJAKAN PRODUK, BUKAN ISI CP
// ─────────────────────────────────────────────────────────────────────────────
//
// Uji robustness readiness (empat pasangan S1↔S2 dengan masukan byte-identik,
// docs/ATP-READINESS-ROBUSTNESS-REPORT.md) menemukan satu mode kegagalan yang
// BERULANG dan hanya satu: pada kesiapan `jauh_di_bawah`, penyusun kadang
// memajukan "mempertahankan argumen" — menggabungkannya dengan "mengungkapkan
// pendapat" dalam satu TP, lalu menaruhnya di Semester 1, padahal baseline yang
// muridnya LEBIH siap justru memisahkan keduanya dan menundanya ke Semester 2.
// Tiga dari empat pengulangan benar; satu salah. Arahan prosa saja terbukti
// belum menjadi jaminan.
//
// APA YANG TABEL INI BUKAN. Ia bukan isi CP. Tuntutan CP, kompetensi, lingkup
// materi, logika, dan cakupan_wajib tidak disentuh sama sekali — ujung fase
// tetap sama persis, dan seluruh tuntutan tetap wajib terpetakan. Yang diatur
// di sini adalah JALAN menuju ujung itu untuk satu kondisi kesiapan ekstrem:
// urutan, pemisahan TP, dan penempatan semester. Karena itu ia tinggal di
// kontrak produk, bukan di cp-acuan.json.
//
// LINGKUPNYA SENGAJA SEMPIT. Hanya `jauh_di_bawah`. Kesiapan lain — termasuk
// `sedikit_di_bawah` — TIDAK tunduk pada aturan ini: menggabungkan MB-2+MB-3
// atau menaruh MB-3 di Semester 1 tetap sah di sana, sepanjang aturan ATP umum
// terpenuhi. Ini kebijakan untuk kondisi ekstrem, bukan aturan universal
// Bahasa Inggris.
//
// Aturan ditulis per ID tuntutan. Untuk mapel atau fase yang tidak memiliki ID
// itu, aturannya tidak berlaku dengan sendirinya — `aturanProgresiUntuk()`
// hanya mengembalikan aturan yang KEDUA ID-nya benar-benar ada di acuan yang
// sedang dipakai.
export type AturanProgresi = {
  /** Tuntutan yang harus dilayani lebih dulu. */
  dasar: string;
  /** Tuntutan lanjutan yang bergantung padanya. */
  lanjutan: string;
  /** Label manusia — dipakai di arahan untuk penyusun DAN di pesan galat, satu
   *  sumber, supaya prompt dan validator tidak bisa menyimpang diam-diam. */
  label_dasar: string;
  label_lanjutan: string;
  /** Semester tempat `lanjutan` wajib ditempatkan. null = tidak diatur. */
  semester_lanjutan: number | null;
};

export const ATURAN_PROGRESI_KESIAPAN: Record<string, AturanProgresi[]> = {
  jauh_di_bawah: [
    {
      dasar: 'BIE-E25-MB-2', lanjutan: 'BIE-E25-MB-3',
      label_dasar: 'mengungkapkan pendapat secara lisan',
      label_lanjutan: 'mempertahankan argumen secara lisan',
      semester_lanjutan: 2,
    },
    {
      dasar: 'BIE-E25-MP-4', lanjutan: 'BIE-E25-MP-5',
      label_dasar: 'mengungkapkan pendapat secara tertulis',
      label_lanjutan: 'mempertahankan argumen secara tertulis',
      semester_lanjutan: 2,
    },
  ],
};

/** Aturan progresi yang benar-benar berlaku: hanya untuk kesiapan yang punya
 *  entri, dan hanya aturan yang KEDUA tuntutannya ada di acuan yang dipakai. */
export function aturanProgresiUntuk(
  kesiapan: string,
  tuntutanAda: Iterable<string>,
): AturanProgresi[] {
  const ada = new Set([...tuntutanAda].map(String));
  return (ATURAN_PROGRESI_KESIAPAN[kesiapan] ?? [])
    .filter(a => ada.has(a.dasar) && ada.has(a.lanjutan));
}

/** Arahan untuk penyusun, DITURUNKAN dari tabel di atas. Validator memeriksa
 *  aturan yang sama persis; kalimat ini tidak pernah ditulis tangan. */
export function arahanProgresiKesiapan(aturan: AturanProgresi[]): string | null {
  if (!aturan.length) return null;
  const baris = aturan.map(a =>
    `- bangun kemampuan ${a.label_dasar} SEBELUM ${a.label_lanjutan}; keduanya BUKAN satu TP` +
    (a.semester_lanjutan ? `, dan ${a.label_lanjutan} ditempatkan Semester ${a.semester_lanjutan}` : '') + '.');
  return 'Urutan yang WAJIB dipatuhi untuk kelas jauh di bawah:\n' + baris.join('\n');
}

export const LABEL_BAHASA: Record<string, string> = {
  indonesia:         'Pengantar sepenuhnya Bahasa Indonesia.',
  indonesia_dominan: 'Pengantar Bahasa Indonesia; bahasa mata pelajaran dipakai untuk contoh dan latihan.',
  campur:            'Penjelasan Bahasa Indonesia, instruksi kelas memakai bahasa mata pelajaran.',
  target_dominan:    'Sebagian besar memakai bahasa mata pelajaran; Bahasa Indonesia dipakai saat murid kesulitan.',
  target_penuh:      'Sepenuhnya memakai bahasa mata pelajaran.',
};

export const METODE_PENGURUTAN: Record<string, string> = {
  mudah_sulit:
    'Urutkan dari konten yang paling mudah menuju yang paling sulit.',
  scaffolding:
    'Urutkan sebagai bantuan yang berkurang: standar yang dituntut naik sementara bantuan guru berkurang bertahap, sampai murid mandiri di TP terakhir.',
  prosedural:
    'Urutkan mengikuti tahapan satu prosedur kerja yang utuh, TP demi TP dari langkah awal sampai selesai.',
  konkret_abstrak:
    'Urutkan dari contoh yang konkret menuju konsep dan aturan yang lebih abstrak.',
  hierarki:
    'Urutkan hierarkis: kemampuan yang lebih sederhana lebih dulu karena menjadi syarat kemampuan yang lebih kompleks.',
  deduktif:
    'Urutkan dari yang umum menuju yang khusus.',
};

export const LABEL_PRASYARAT: Record<string, string> = {
  awal:         'Kemampuan dasar dikuatkan di awal, sebelum masuk materi fase.',
  terintegrasi: 'Kemampuan dasar dikuatkan saat topik yang membutuhkannya tiba, bukan sebagai blok tersendiri di awal.',
  kombinasi:    'Kemampuan dasar dikuatkan di awal dan diulang lagi saat topik membutuhkannya.',
  tidak_perlu:  'Tidak ada penguatan kemampuan dasar yang diperlukan.',
};

/** Nilai yang berarti "guru mendelegasikan keputusan ini kepada MiClass". */
export const DELEGASI = 'tentukan_saat_menyusun';

// ─────────────────────────────────────────────────────────────────────────────
// 4. PEMBACA JAWABAN
// ─────────────────────────────────────────────────────────────────────────────

export function unwrap(val: unknown): unknown {
  if (val !== null && val !== undefined && typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    if ('value' in obj) return obj.value;
  }
  return val;
}

/** Membaca satu jawaban dari collected_data. */
export function jawaban(cd: Record<string, unknown>, fase: string, id: string): unknown {
  const f = cd[fase] as Record<string, unknown> | undefined;
  if (!f) return undefined;
  return unwrap(f[id]);
}

function teks(v: unknown): string { return String(v ?? '').trim(); }
function daftar(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => String(x));
  const s = teks(v);
  return s ? [s] : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ANGGARAN WAKTU — deterministik, tidak pernah diserahkan ke AI
// ─────────────────────────────────────────────────────────────────────────────

export type Alokasi = {
  jp_per_minggu: number;
  minggu_sem1: number;
  minggu_sem2: number;
  minggu_efektif: number;
  jp_kalender: number;
  jp_cadangan: number;
  jp_prasyarat: number;
  satuan_pertemuan: number;
  jp_tidak_terjadwal: number;
  jp_operasional: number;
  jumlah_pertemuan: number;
  anggaran_semester: { semester: number; minggu: number; jp: number }[];
};

/** Perkiraan sementara MiClass saat guru belum memegang kalender sekolah. */
export const MINGGU_PERKIRAAN_PER_SEMESTER = 18;

/** Hitungan waktu ATP. SATU-SATUNYA tempat angkanya lahir.
 *
 *  KEGIATAN KHUSUS TIDAK LAGI DIKURANGKAN DI SINI, dan itu disengaja.
 *  SPEC A12 menetapkan minggu yang ditanyakan adalah minggu pembelajaran
 *  BERSIH — libur, kegiatan sekolah, dan ujian sudah dikurangi guru sebelum ia
 *  mengetikkan angkanya. Sebelum ini kegiatan khusus ditanyakan dalam JP
 *  sementara cadangan ditanyakan dalam minggu, dan SELURUH kelas masalah "ATP
 *  mustahil dipenuhi" lahir dari perbedaan satuan itu: pengurang dalam minggu
 *  selalu kelipatan JP per minggu, pengurang dalam JP tidak pernah dijamin
 *  begitu. Satu satuan untuk satu hal. */
export function hitungAlokasi(cd: Record<string, unknown>): Alokasi {
  const jpPerMinggu = Number(jawaban(cd, 'WAKTU', 'jp_per_minggu') ?? 0) || 0;
  const mode        = teks(jawaban(cd, 'WAKTU', 'minggu_efektif_mode'));
  const perkiraan   = mode === 'perkiraan_miclass';
  const sem1 = perkiraan ? MINGGU_PERKIRAAN_PER_SEMESTER : Number(jawaban(cd, 'WAKTU', 'minggu_sem1') ?? 0) || 0;
  const sem2 = perkiraan ? MINGGU_PERKIRAAN_PER_SEMESTER : Number(jawaban(cd, 'WAKTU', 'minggu_sem2') ?? 0) || 0;
  const minggu = sem1 + sem2;

  const cadVal = teks(jawaban(cd, 'WAKTU', 'cadangan_minggu'));
  const cadMinggu = cadVal === 'lain'
    ? Number(jawaban(cd, 'WAKTU', 'cadangan_minggu_lain') ?? 0) || 0
    : Number(cadVal || 0) || 0;
  const cadangan = cadMinggu * jpPerMinggu;

  const prasyarat = Number(jawaban(cd, 'PENGUATAN_PRASYARAT', 'jp_prasyarat') ?? 0) || 0;

  const pola      = teks(jawaban(cd, 'WAKTU', 'pola_jadwal'));
  const jpPerSesi = Number(jawaban(cd, 'WAKTU', 'jp_per_sesi') ?? 0) || 0;
  const satuan =
    pola === 'reguler_satu' && jpPerMinggu > 0 ? jpPerMinggu :
    (pola === 'reguler_bagi' || pola === 'blok') && jpPerSesi > 0 ? jpPerSesi : 0;

  const kalender = jpPerMinggu * minggu;
  // Jumlah bilangan kelipatan 4 selalu kelipatan 4. Kalau sisanya bukan
  // kelipatan satuan pertemuan, tidak ada susunan TP yang bisa memenuhi kedua
  // syarat generate sekaligus — model mana pun pasti gagal, jalur repair
  // mengulang kegagalan yang sama, dan guru menghabiskan jatah hariannya untuk
  // soal yang memang tidak punya jawaban.
  const mentah   = Math.max(0, kalender - cadangan - prasyarat);
  const sisaBagi = satuan > 0 ? mentah % satuan : 0;
  const operasional = mentah - sisaBagi;

  // Anggaran per semester. Keduanya kelipatan satuan pertemuan dan jumlahnya
  // PERSIS jp_operasional, sehingga selalu ada susunan TP yang memenuhinya —
  // syarat yang mustahil dipenuhi tidak boleh dibuat lagi.
  const anggaran: { semester: number; minggu: number; jp: number }[] = [];
  if (minggu > 0 && operasional > 0) {
    const langkah = satuan > 0 ? satuan : 1;
    const kasar   = (operasional * sem1) / minggu;
    const jp1     = Math.max(0, Math.min(operasional, Math.floor(kasar / langkah) * langkah));
    anggaran.push({ semester: 1, minggu: sem1, jp: jp1 });
    anggaran.push({ semester: 2, minggu: sem2, jp: operasional - jp1 });
  }

  return {
    jp_per_minggu: jpPerMinggu, minggu_sem1: sem1, minggu_sem2: sem2,
    minggu_efektif: minggu, jp_kalender: kalender, jp_cadangan: cadangan,
    jp_prasyarat: prasyarat, satuan_pertemuan: satuan,
    jp_tidak_terjadwal: sisaBagi, jp_operasional: operasional,
    jumlah_pertemuan: satuan > 0 ? operasional / satuan : 0,
    anggaran_semester: anggaran,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. KEPADATAN TP — HEURISTIK PRODUK, dan disebut begitu dengan sengaja
// ─────────────────────────────────────────────────────────────────────────────
//
// Dua ATP produksi dengan jam SAMA PERSIS (124 JP) menghasilkan 9 dan 10 TP;
// yang 200 JP jadi 12 TP sementara yang 128 JP jadi 16. Kepadatannya merentang
// dua kali lipat, dan jumlah TP adalah jumlah Modul Ajar yang harus guru susun
// dan ajarkan sepanjang fase. Itu keputusan beban kerja setahun yang selama ini
// diambil model tanpa aturan.
//
// YANG BERIKUT BUKAN TURUNAN DETERMINISTIK. Tidak ada rumus benar untuk
// "berapa TP yang pantas untuk 124 JP" — yang ada hanyalah pilihan produk yang
// dapat dijelaskan, dibatasi di kedua ujung, dan diuji di batasnya. Menyebutnya
// "deterministically correct" akan menyembunyikan justru bagian yang paling
// perlu ditinjau manusia. Ketiga konstanta di bawah adalah keputusan, bukan
// temuan.
//
// Pembagian peran yang dianut:
//   - JUMLAH tuntutan CP menentukan BATAS BAWAH. ATP dengan TP jauh lebih
//     sedikit daripada tuntutannya hampir pasti menggabungkan yang tidak
//     sebanding.
//   - JAM yang tersedia menentukan rentang di antara kedua batas.
//   - KESIAPAN murid menentukan KELAPANGAN tiap TP di dalam rentang itu, bukan
//     banyaknya. Murid yang tertinggal butuh langkah yang lebih lapang menuju
//     kompetensi yang sama — bukan lebih banyak tujuan yang lebih sempit.
//     Karena itu kesiapan yang lebih rendah menghasilkan TP yang LEBIH SEDIKIT.

/** Berapa JP yang dipakai satu TP, menurut kesiapan murid.
 *
 *  HEURISTIK. Angkanya menyatakan kelapangan, bukan hasil pengukuran — tetapi
 *  rentangnya dipilih agar memuat apa yang sudah ada: empat ATP produksi
 *  berkisar 8 sampai 17 JP per TP (128 JP/16 TP, 124 JP/10 TP, 200 JP/12 TP).
 *
 *  SATUANNYA JP, BUKAN PERTEMUAN, dan itu koreksi yang disengaja. Versi
 *  pertama menghitung dari jumlah pertemuan, sehingga kelas yang membagi 4 JP
 *  seminggu jadi dua pertemuan @2 JP dinilai punya dua kali lebih banyak
 *  "ruang" daripada kelas yang memakainya sekaligus — padahal jam mengajarnya
 *  sama persis. Panjang satu pertemuan adalah urusan jadwal sekolah, bukan
 *  ukuran seberapa besar satu tujuan pembelajaran. */
export const JP_PER_TP: Record<string, number> = {
  sesuai:           10,
  sedikit_di_bawah: 12,
  belum_diketahui:  12,
  sangat_beragam:   14,
  jauh_di_bawah:    14,
};

/** TP satu pertemuan bukan tujuan pembelajaran, melainkan rencana satu jam.
 *  Batas ini yang mencegah jam yang banyak berubah jadi TP yang remeh. */
export const MIN_PERTEMUAN_PER_TP = 2;

/** Batas beban kerja, bukan batas pedagogis. Lebih dari ini berarti guru
 *  diminta menyusun dan mengajarkan lebih dari enam belas Modul Ajar dalam satu
 *  fase. Batas inilah yang memutus kelinearan terhadap jam: jam yang bertambah
 *  sesudah titik ini menambah kelapangan tiap TP, bukan jumlah TP. */
export const MAKS_TP_PER_FASE = 16;

/** Lantai mutlak satu fase penuh. */
export const MIN_TP_PER_FASE = 3;

export function hitungTargetTp(
  alokasi: Alokasi,
  kesiapan: string,
  jumlahTuntutan: number,
  permintaanGuru?: number | null,
): { target: number; asal: 'permintaan guru' | 'hitungan MiClass'; maks: number; min: number } {
  const pertemuan = alokasi.jumlah_pertemuan > 0 ? Math.floor(alokasi.jumlah_pertemuan) : 0;

  const maks = pertemuan > 0
    ? Math.max(MIN_TP_PER_FASE,
        Math.min(Math.floor(pertemuan / MIN_PERTEMUAN_PER_TP), MAKS_TP_PER_FASE))
    : MAKS_TP_PER_FASE;

  // Batas bawah berpangkal pada STRUKTUR CP, bukan pada jam. Setengah dari
  // jumlah tuntutan, dibulatkan ke atas: tidak setiap tuntutan wajib punya TP
  // sendiri — dua tuntutan yang sejalan boleh dilayani satu TP — tetapi TP yang
  // memikul lebih dari dua tuntutan sekaligus sudah bukan satu tujuan.
  const minCp = jumlahTuntutan > 0 ? Math.ceil(jumlahTuntutan / 2) : MIN_TP_PER_FASE;
  const min = Math.min(Math.max(MIN_TP_PER_FASE, minCp), maks);

  const jepit = (n: number) => Math.max(min, Math.min(maks, n));

  if (typeof permintaanGuru === 'number' && Number.isFinite(permintaanGuru)) {
    return { target: jepit(Math.round(permintaanGuru)), asal: 'permintaan guru', maks, min };
  }
  const per   = JP_PER_TP[kesiapan] ?? JP_PER_TP.belum_diketahui;
  const kasar = alokasi.jp_operasional > 0 ? alokasi.jp_operasional / per : min;
  return { target: jepit(Math.round(kasar)), asal: 'hitungan MiClass', maks, min };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. KEPUTUSAN YANG DIDELEGASIKAN — dipisah dua, dan pemisahannya beralasan
// ─────────────────────────────────────────────────────────────────────────────
//
// SPEC §4: "Pilihan 'tentukan saat menyusun' hanya menyimpan pendelegasian
// keputusan. Ia tidak memanggil AI di tengah corong. Saat menyusun, MiClass
// memilih opsi yang paling sesuai... pilihan itu ditampilkan dalam ringkasan
// hasil agar guru dapat menilainya."
//
// Versi pertama memindahkan SELURUH keputusan itu ke kode, dengan alasan bahwa
// keputusan model tidak bisa dilaporkan jujur dan tidak bisa diuji. Alasan itu
// keliru, dan akibatnya terlihat: A17 selalu menjawab "seimbang" apa pun
// keadaannya, dan A19 memilih hanya dari kesiapan murid — sehingga CP yang
// jelas-jelas berupa satu prosedur berurutan tetap disusun sebagai bantuan yang
// berkurang, semata karena muridnya siap. Itu bukan keputusan kontekstual; itu
// tetapan yang menyamar jadi keputusan.
//
// Pembagiannya sekarang:
//
//   DETERMINISTIK (tetap di kode). Aturannya dapat ditulis penuh tanpa membaca
//   makna CP, dan hasilnya sama untuk masukan yang sama. A15 (kapan kemampuan
//   dasar dikuatkan) dan A3 (bahasa pengantar) masuk ke sini: keduanya
//   berpangkal pada satu variabel yang guru jawab sendiri — tingkat kemampuan
//   awal — dan opsinya membentuk tangga yang searah dengan variabel itu.
//   Tidak ada makna CP yang perlu ditafsirkan untuk memilihnya.
//
//   SEMANTIK (diputuskan penyusun ATP). A17 (konteks contoh dan tugas) dan A19
//   (metode pengurutan) menuntut pembacaan struktur tuntutan CP: apakah
//   tuntutannya berhubungan sebagai prasyarat, apakah lingkup materinya berupa
//   prosedur yang berurutan, apakah program keahlian punya situasi kerja yang
//   benar-benar memuat kompetensinya. Itu tidak dapat diturunkan dari satu
//   variabel, dan mereduksinya jadi tetapan lebih buruk daripada menyerahkannya
//   kepada penyusun yang dipaksa mempertanggungjawabkan pilihannya.
//
//   TIDAK ADA PANGGILAN AI TAMBAHAN. Keputusan semantik diambil DI DALAM
//   panggilan penyusunan ATP yang memang sudah ada, dikembalikan terstruktur
//   bersama daftar TP, lalu diperiksa server terhadap allowlist enum dan
//   terhadap konteks yang benar-benar tersedia. Aritmetika tetap tidak pernah
//   diserahkan kepada AI.

/** Satu pertanyaan yang boleh diputuskan penyusun ATP. */
export type PertanyaanSemantik = {
  /** ID SPEC — dipakai model sebagai kunci saat mengembalikan keputusannya. */
  question_id: string;
  /** ID pertanyaan di collected_data, dan fase tempatnya tersimpan. */
  kunci: string;
  fase: string;
  /** Label yang guru lihat di ringkasan hasil. */
  pertanyaan: string;
  /** Allowlist. Model TIDAK boleh membuat opsi di luar ini. */
  opsi: Record<string, string>;
  /** Yang wajib ditimbang sebelum memilih. Masuk ke prompt apa adanya. */
  pertimbangan: string[];
};

export const DELEGASI_SEMANTIK: PertanyaanSemantik[] = [
  {
    question_id: 'A17',
    kunci: 'konteks_tugas',
    fase: 'KONTEKS_DUDI',
    pertanyaan: 'Konteks contoh dan tugas',
    opsi: LABEL_KONTEKS_TUGAS,
    pertimbangan: [
      'kompetensi dan lingkup materi tiap tuntutan di cp_anchor — sebagian tuntutan hanya punya situasi nyata di dunia kerja, sebagian lagi hanya di kehidupan sehari-hari',
      'program keahlian kelas ini: apakah bidang itu benar-benar memuat situasi yang menuntut kompetensi ini, atau kaitannya dipaksakan',
      'kesiapan murid: konteks kerja yang asing menambah beban baru bagi murid yang kemampuan dasarnya masih dibangun',
      'situasi khusus yang guru minta diutamakan atau dihindari, bila ada',
      'batas layanan teks dan interaksi langsung: situasi kerja yang hanya dapat dihadirkan lewat alat, kunjungan, atau benda praktik tidak boleh dipilih',
    ],
  },
  {
    question_id: 'A19',
    kunci: 'metode_pengurutan',
    fase: 'KONTEKS_DUDI',
    pertanyaan: 'Urutan pembelajaran',
    opsi: METODE_PENGURUTAN,
    pertimbangan: [
      'STRUKTUR tuntutan CP lebih dulu: apakah tuntutannya membentuk satu prosedur yang berurutan, berjenjang sebagai prasyarat, atau berdiri sejajar tanpa urutan wajib',
      'hubungan prasyarat antar kemampuan: kemampuan yang menjadi syarat kemampuan lain harus lebih dulu, berapa pun kesiapan murid',
      'kesiapan murid: menentukan seberapa landai tangganya, BUKAN menggantikan struktur CP. CP yang berupa prosedur berurutan tetap disusun berurutan meskipun murid sudah siap',
      'jam yang tersedia dan pembagian semester: urutan yang menuntut satu prosedur utuh tidak boleh terbelah tanggung di batas semester',
      'batas layanan teks dan interaksi langsung',
      // Pass 5, SEM-005: semantic test mendapati "hierarki" dipilih dengan
      // alasan "reseptif lalu produktif" padahal susunannya spiral. Nama metode
      // wajib MENGGAMBARKAN urutan yang benar-benar tersusun, bukan menjadi
      // sinonim default untuk "belajar bertahap".
      'SETELAH daftar TP selesai disusun: nilai urutan akhir yang benar-benar terbentuk, lalu pilih opsi yang PALING AKURAT menggambarkannya. "hierarki" hanya bila kemampuan yang lebih sederhana memang seluruhnya mendahului yang kompleks; jangan memakainya sebagai sinonim "belajar bertahap". Alasan wajib menjelaskan pola urutan yang benar-benar ada di daftar TP',
    ],
  },
];

/** Rujukan konteks yang boleh dipakai sebagai `dasar` sebuah keputusan.
 *
 *  Ini yang membuat alasan tidak bisa dikarang. Model boleh menulis alasannya
 *  dengan kalimatnya sendiri, tetapi setiap dasar yang ia sebut harus berupa
 *  kunci dari daftar ini — dan daftarnya disusun per permintaan dari konteks
 *  yang benar-benar dikirim. Guru yang tidak menyebutkan situasi khusus membuat
 *  'situasi_khusus' tidak ada di daftar, sehingga keputusan yang mengaku
 *  berdasar situasi khusus ditolak, bukan disimpan sebagai fakta. */
export const DASAR_KETERANGAN: Record<string, string> = {
  'cp_anchor.tuntutan': 'kompetensi dan lingkup materi tuntutan CP (boleh disebut per ID, mis. cp_anchor.tuntutan.BIE-MB-1)',
  'cp_anchor.elemen':   'teks CP per elemen',
  'kesiapan_murid':     'gambaran kesiapan murid',
  'prioritas_guru':     'bagian yang guru ingin lebih dikuatkan',
  'konteks_kejuruan':   'program keahlian kelas ini',
  'situasi_khusus':     'situasi yang guru minta diutamakan atau dihindari',
  'jumlah_murid':       'jumlah murid di kelas ini',
  'anggaran_waktu':     'jam, pertemuan, dan pembagian semester',
  'batas_mutlak':       'batas layanan teks dan interaksi langsung',
};

/** Daftar dasar yang tersedia untuk SATU permintaan. Kunci yang konteksnya
 *  tidak dikirim tidak masuk daftar, dan karena itu tidak bisa diklaim. */
export function dasarTersedia(
  cd: Record<string, unknown>,
  info: { program_keahlian: string; jumlah_murid: number | null },
  tuntutanIds: string[],
): Set<string> {
  const out = new Set<string>([
    'cp_anchor.elemen', 'kesiapan_murid', 'prioritas_guru',
    'anggaran_waktu', 'batas_mutlak',
  ]);
  if (tuntutanIds.length) {
    out.add('cp_anchor.tuntutan');
    for (const id of tuntutanIds) out.add('cp_anchor.tuntutan.' + id);
  }
  if (info.program_keahlian) out.add('konteks_kejuruan');
  if (info.jumlah_murid) out.add('jumlah_murid');
  if (teks(jawaban(cd, 'KONTEKS_DUDI', 'situasi_khusus_uraian'))) out.add('situasi_khusus');
  return out;
}

export type HasilDelegasi = {
  /** null berarti keputusannya terbuka — diserahkan kepada penyusun ATP. */
  metode_pengurutan: string | null;
  konteks_tugas: string | null;
  strategi_prasyarat: string;
  bahasa_pengantar: string;
  /** Keputusan deterministik yang sudah diambil kode. */
  keputusan: KeputusanMiClass[];
  /** Pertanyaan semantik yang guru delegasikan dan penyusun harus jawab. */
  terbuka: PertanyaanSemantik[];
};

export function resolveDelegasi(cd: Record<string, unknown>): HasilDelegasi {
  const keputusan: KeputusanMiClass[] = [];
  const terbuka: PertanyaanSemantik[] = [];
  const kesiapan = teks(jawaban(cd, 'PROFIL_SISWA', 'tingkat_kemampuan_awal')) || 'belum_diketahui';

  const catat = (pertanyaan: string, kosong: boolean, dipilih: string, label: string, alasan: string) => {
    keputusan.push({
      pertanyaan,
      didelegasikan_karena: kosong ? 'guru belum menjawab' : 'guru memilih tentukan saat menyusun',
      dipilih: label, alasan, sumber: 'aturan', kunci: dipilih,
    });
    return dipilih;
  };

  // ── SEMANTIK — A17 dan A19 ────────────────────────────────────────────────
  const nilaiSemantik: Record<string, string | null> = {};
  for (const q of DELEGASI_SEMANTIK) {
    const v = teks(jawaban(cd, q.fase, q.kunci));
    if (q.opsi[v]) { nilaiSemantik[q.kunci] = v; continue; }
    nilaiSemantik[q.kunci] = null;
    terbuka.push(q);
  }

  // ── DETERMINISTIK — A15 ───────────────────────────────────────────────────
  //
  // Aturannya utuh dan muat dalam tiga baris, dan tidak satu pun barisnya
  // menuntut pembacaan makna CP: yang dipilih adalah KAPAN penguatan
  // ditempatkan, dan penempatan itu hanya bergantung pada seberapa jauh murid
  // dari titik awal fase — variabel yang guru jawab sendiri di A13.
  let prasyarat = teks(jawaban(cd, 'PENGUATAN_PRASYARAT', 'strategi_prasyarat'));
  if (!LABEL_PRASYARAT[prasyarat]) {
    const kosong = !prasyarat;
    const pilih = (kesiapan === 'jauh_di_bawah') ? 'kombinasi'
      : (kesiapan === 'sesuai') ? 'tidak_perlu' : 'terintegrasi';
    prasyarat = catat('Kapan kemampuan dasar dikuatkan', kosong, pilih, LABEL_PRASYARAT[pilih],
      pilih === 'kombinasi'
        ? 'Banyak kemampuan dasar yang masih harus dibangun, sehingga penguatan di awal saja tidak cukup.'
        : pilih === 'tidak_perlu'
          ? 'Murid sudah siap memulai fase, sehingga tidak ada kemampuan dasar yang perlu diulang lebih dulu.'
          : 'Penguatan yang menyatu dengan topik tidak memotong jam mengajar dan paling mudah dijalankan tanpa prasyarat tambahan.');
  }

  // ── DETERMINISTIK — A3 ────────────────────────────────────────────────────
  //
  // Sama bentuknya: satu variabel, tangga yang searah. Yang dipilih adalah
  // seberapa banyak bahasa mata pelajaran dipakai sebagai pengantar, dan
  // batasnya adalah risiko murid kehilangan ISI pelajaran karena bahasanya —
  // risiko yang naik persis seiring jarak murid dari titik awal fase.
  let bahasa = teks(jawaban(cd, 'PROFIL_KELAS', 'bahasa_pengantar'));
  if (!LABEL_BAHASA[bahasa]) {
    const kosong = !bahasa;
    const pilih = (kesiapan === 'sesuai') ? 'campur' : 'indonesia_dominan';
    bahasa = catat('Bahasa pengantar dan dukungan bahasa', kosong, pilih, LABEL_BAHASA[pilih],
      pilih === 'campur'
        ? 'Murid sudah siap, sehingga instruksi kelas dapat memakai bahasa mata pelajaran sementara penjelasan tetap Bahasa Indonesia.'
        : 'Pilihan yang paling sedikit menuntut prasyarat: penjelasan tetap Bahasa Indonesia sehingga murid tidak kehilangan isi pelajaran karena bahasanya.');
  }

  return {
    metode_pengurutan: nilaiSemantik.metode_pengurutan ?? null,
    konteks_tugas: nilaiSemantik.konteks_tugas ?? null,
    strategi_prasyarat: prasyarat, bahasa_pengantar: bahasa,
    keputusan, terbuka,
  };
}

/** Memisahkan keluaran penyusun jadi daftar TP dan daftar keputusan.
 *
 *  BACKWARD COMPATIBLE. Array telanjang tetap diterima sebagai daftar TP tanpa
 *  keputusan — bentuk yang dipakai seluruh ATP yang sudah ada, dan bentuk yang
 *  model kembalikan bila tidak ada satu pun pertanyaan didelegasikan. */
export function pisahkanKeluaran(raw: unknown): { tp: unknown; keputusan: unknown[]; penerapan: unknown[] | null } {
  if (Array.isArray(raw)) return { tp: raw, keputusan: [], penerapan: null };
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const tp = Array.isArray(o.tp) ? o.tp
      : Array.isArray(o.progresi_tp) ? o.progresi_tp
      : Array.isArray(o.atp) ? o.atp : raw;
    const k = o.keputusan_didelegasikan;
    const p = o.penerapan_prioritas;
    return { tp, keputusan: Array.isArray(k) ? k : [], penerapan: Array.isArray(p) ? p : null };
  }
  return { tp: raw, keputusan: [], penerapan: null };
}

/** Penekanan yang guru pilih di A16 — daftar yang WAJIB punya jejak penerapan.
 *
 *  `tidak_ada` bukan penekanan. `kebutuhan_sekolah` hanya penanda bahwa guru
 *  menuliskan sendiri isinya, sehingga yang dilacak adalah uraian itu
 *  (kunci PRIORITAS_URAIAN), bukan penandanya. Urutan mengikuti pilihan guru. */
export function prioritasDipilih(cd: Record<string, unknown>): { prioritas: string; arti: string; arahan: string }[] {
  const out: { prioritas: string; arti: string; arahan: string }[] = [];
  for (const p of daftar(jawaban(cd, 'PENGUATAN_PRASYARAT', 'target_prioritas'))) {
    if (p === 'tidak_ada' || p === 'kebutuhan_sekolah' || !LABEL_PRIORITAS[p]) continue;
    if (out.some(x => x.prioritas === p)) continue;
    out.push({ prioritas: p, arti: LABEL_PRIORITAS[p], arahan: ARAHAN_PRIORITAS[p] ?? '' });
  }
  const uraian = teks(jawaban(cd, 'PENGUATAN_PRASYARAT', 'target_prioritas_uraian'));
  if (uraian) out.push({ prioritas: PRIORITAS_URAIAN, arti: uraian, arahan: 'penekanan yang guru tulis sendiri' });
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. DASAR PROFIL MURID DAN ASUMSI
// ─────────────────────────────────────────────────────────────────────────────
//
// SPEC §2.1: "ATP menyatakan atas dasar apa profil murid disusun... dan menandai
// dengan jelas bagian yang berstatus asumsi. Profil yang berasal dari perkiraan
// tidak boleh ditampilkan seolah berasal dari bukti."

export function dasarProfilMurid(cd: Record<string, unknown>): string {
  const kesiapan = teks(jawaban(cd, 'PROFIL_SISWA', 'tingkat_kemampuan_awal'));
  if (!kesiapan || kesiapan === 'belum_diketahui') {
    return 'Belum ada informasi kesiapan yang cukup. Seluruh gambaran murid di ATP ini berstatus asumsi.';
  }
  const dasar = teks(jawaban(cd, 'PROFIL_SISWA', 'dasar_informasi_kesiapan'));
  return LABEL_DASAR_KESIAPAN[dasar]
    ?? 'Dasar informasi kesiapan tidak dinyatakan — gambaran murid berstatus perkiraan.';
}

export function kumpulkanAsumsi(cd: Record<string, unknown>, alokasi: Alokasi): Asumsi[] {
  const out: Asumsi[] = [];
  const kesiapan = teks(jawaban(cd, 'PROFIL_SISWA', 'tingkat_kemampuan_awal'));
  const dasar    = teks(jawaban(cd, 'PROFIL_SISWA', 'dasar_informasi_kesiapan'));

  if (!kesiapan || kesiapan === 'belum_diketahui') {
    out.push({ hal: 'Kesiapan murid di awal fase',
      sebab: 'Guru menyatakan kesiapan murid belum diketahui. Progresi disusun dari titik awal yang dijelaskan CP, bukan dari keadaan kelas.' });
  } else if (!dasar || dasar === 'pengamatan' || dasar === 'belum_cukup') {
    out.push({ hal: 'Gambaran kesiapan murid',
      sebab: 'Berasal dari pengamatan atau perkiraan guru, bukan dari hasil penilaian. Ia belum diverifikasi terhadap pekerjaan murid.' });
  }

  if (teks(jawaban(cd, 'WAKTU', 'minggu_efektif_mode')) === 'perkiraan_miclass') {
    out.push({ hal: 'Jumlah minggu pembelajaran bersih',
      sebab: `Memakai perkiraan sementara MiClass (${MINGGU_PERKIRAAN_PER_SEMESTER} minggu tiap semester), bukan kalender sekolah. Periksa ulang saat kalender terbit.` });
  }

  const bantuan = daftar(jawaban(cd, 'PROFIL_SISWA', 'bantuan_konkret'));
  if (bantuan.length === 0 || bantuan.includes('belum_diketahui')) {
    out.push({ hal: 'Kebutuhan bantuan belajar murid',
      sebab: 'Belum diketahui saat ATP disusun. Bentuk dukungan yang konkret ditetapkan pada Modul Ajar setelah guru mengenal kelasnya.' });
  }

  if (alokasi.jp_tidak_terjadwal > 0) {
    out.push({ hal: `${alokasi.jp_tidak_terjadwal} JP tidak terjadwal`,
      sebab: 'Sisa jam yang tidak cukup untuk satu pertemuan penuh, sehingga tidak dibagikan ke TP mana pun.' });
  }
  return out;
}

/** Konteks yang benar-benar guru berikan — dipisahkan dari keputusan MiClass
 *  dan dari asumsi, supaya guru dapat membedakan ketiganya di hasil. */
export function konteksDariGuru(cd: Record<string, unknown>, jumlahMurid: number | null): string[] {
  const out: string[] = [];
  const program = teks(jawaban(cd, 'KONTEKS_CP', 'program_keahlian'));
  if (program) out.push(`Program keahlian: ${program}`);
  if (jumlahMurid) out.push(`Jumlah murid: ${jumlahMurid}`);
  const tk = teks(jawaban(cd, 'PROFIL_SISWA', 'tingkat_kemampuan_awal'));
  if (tk && LABEL_KESIAPAN[tk]) out.push(LABEL_KESIAPAN[tk]);
  const kondisi = teks(jawaban(cd, 'PROFIL_SISWA', 'kondisi_murid_uraian'));
  if (kondisi) out.push(`Kondisi murid yang guru catat: ${kondisi}`);
  const bantuan = daftar(jawaban(cd, 'PROFIL_SISWA', 'bantuan_konkret'))
    .filter(b => b !== 'tidak_ada' && b !== 'belum_diketahui' && b !== 'lainnya')
    .map(b => LABEL_BANTUAN[b] ?? b);
  const bantuanLain = teks(jawaban(cd, 'PROFIL_SISWA', 'bantuan_konkret_lain'));
  if (bantuanLain) bantuan.push(bantuanLain);
  if (bantuan.length) out.push(`Bantuan yang murid perlukan: ${bantuan.join('; ')}`);
  const pr = daftar(jawaban(cd, 'PENGUATAN_PRASYARAT', 'target_prioritas'))
    .filter(p => p !== 'tidak_ada' && p !== 'kebutuhan_sekolah')
    .map(p => LABEL_PRIORITAS[p] ?? p);
  const prUraian = teks(jawaban(cd, 'PENGUATAN_PRASYARAT', 'target_prioritas_uraian'));
  if (prUraian) pr.push(prUraian);
  if (pr.length) out.push(`Bagian yang ingin lebih dikuatkan: ${pr.join('; ')}`);
  const situasi = teks(jawaban(cd, 'KONTEKS_DUDI', 'situasi_khusus_uraian'));
  if (situasi) out.push(`Situasi yang diutamakan atau dihindari: ${situasi}`);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. ACUAN CP — gerbang layanan dan sumber pemeriksaan cakupan
// ─────────────────────────────────────────────────────────────────────────────

export function kunciMapel(mapel: string): string {
  return String(mapel || '').toLowerCase()
    .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

export function kunciFase(fase: string): string {
  return 'fase_' + String(fase || '').toLowerCase().trim();
}

/** Catatan acuan untuk satu kombinasi, ADA ATAU TIDAK — bukan keputusan
 *  layanan. Sebelumnya fungsi ini merangkap gerbang dengan memeriksa
 *  `status === 'tersedia'`, sehingga satu-satunya cara menutup kombinasi adalah
 *  menyembunyikan uraiannya. Sekarang uraian dan keputusan dipisah:
 *  penguraian tetap dapat dibaca dan diuji meskipun layanannya tertutup. */
export function acuanUntuk(mapel: string, fase: string): FaseAcuan | null {
  const m = ACUAN_CP.acuan[kunciMapel(mapel)];
  if (!m) return null;
  return m[kunciFase(fase)] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9b. GERBANG LAYANAN — versi CP, penguraian, dan cakupan penuh
// ─────────────────────────────────────────────────────────────────────────────
//
// Sampai Pass 2 gerbang hanya menanyakan "apakah kombinasi ini ada di acuan".
// Tiga hal yang tidak ditanyakannya, dan ketiganya menentukan:
//
//   1. APAKAH ACUANNYA MASIH BERLAKU. Acuan lama berpangkal pada Keputusan
//      Kepala BSKAP 32/H/KR/2024, yang sudah dicabut Diktum KETUJUH Keputusan
//      Kepala BSKAP 046/H/KR/2025. Kombinasi yang acuannya menyebut regulasi
//      tercabut tidak boleh dilayani — ATP yang dihasilkannya memetakan CP yang
//      tidak lagi ada.
//   2. APAKAH PENGURAIANNYA SUDAH DITERIMA MANUSIA. Penguraian tuntutan adalah
//      pembacaan makna CP, dan tidak ada uji yang dapat membuktikannya benar.
//   3. APAKAH SELURUH TUNTUTANNYA DAPAT DILAYANI. Membuka layanan dengan
//      cakupan sebagian berarti menyerahkan sisanya kepada guru sebagai
//      pekerjaan yang tidak pernah disebut. Tidak ada status sebagian di sini.

/** Regulasi CP yang berlaku. Satu tempat, supaya "yang berlaku" tidak pernah
 *  jadi dua angka yang menyimpang diam-diam. */
export const VERSI_CP_BERLAKU = '046/H/KR/2025';

/** Regulasi CP yang sudah dicabut dan TIDAK BOLEH menjadi sumber generator. */
export const VERSI_CP_DICABUT = ['32/H/KR/2024', '032/H/KR/2024'];

export type HasilCakupan = {
  penuh: boolean;
  wajib: string[];
  dilayani: string[];
  tidak_dilayani: string[];
  perlu_telaah: string[];
};

/** Cakupan layanan satu acuan. Tuntutan yang belum terbukti dapat dilayani
 *  dihitung sebagai TIDAK tercakup — belum terbukti bukan berarti aman. */
export function cakupanLayanan(acuan: FaseAcuan | null): HasilCakupan {
  const out: HasilCakupan = { penuh: false, wajib: [], dilayani: [], tidak_dilayani: [], perlu_telaah: [] };
  if (!acuan) return out;
  for (const el of Object.values(acuan.elemen)) {
    for (const t of el.tuntutan) {
      out.wajib.push(t.id);
      if (t.layanan === 'dilayani') out.dilayani.push(t.id);
      else if (t.layanan === 'perlu_telaah_manusia') out.perlu_telaah.push(t.id);
      else out.tidak_dilayani.push(t.id);
    }
  }
  out.penuh = out.wajib.length > 0 && out.tidak_dilayani.length === 0 && out.perlu_telaah.length === 0;
  return out;
}

export type HasilLayanan = {
  didukung: boolean;
  kode: 'FULLY_SUPPORTED' | 'NOT_SUPPORTED';
  alasan: string[];
  cakupan: HasilCakupan;
  acuan: FaseAcuan | null;
};

export function statusLayanan(mapel: string, fase: string): HasilLayanan {
  const acuan = acuanUntuk(mapel, fase);
  const cakupan = cakupanLayanan(acuan);
  const alasan: string[] = [];

  if (!acuan) {
    alasan.push('Uraian tuntutan Capaian Pembelajaran untuk kombinasi ini belum disusun.');
    return { didukung: false, kode: 'NOT_SUPPORTED', alasan, cakupan, acuan: null };
  }
  if (VERSI_CP_DICABUT.includes(acuan.versi_cp)) {
    alasan.push(`Acuan kombinasi ini masih berpangkal pada ${acuan.versi_cp}, yang sudah dicabut dan tidak berlaku.`);
  } else if (acuan.versi_cp !== VERSI_CP_BERLAKU) {
    alasan.push(`Acuan kombinasi ini berpangkal pada ${acuan.versi_cp}, bukan pada ${VERSI_CP_BERLAKU} yang berlaku.`);
  }
  if (acuan.review_status !== 'diterima') {
    alasan.push('Penguraian tuntutan CP kombinasi ini belum selesai ditinjau.');
  }
  if (cakupan.tidak_dilayani.length) {
    alasan.push(`Tuntutan CP yang tidak dapat MiClass layani: ${cakupan.tidak_dilayani.join(', ')}.`);
  }
  if (cakupan.perlu_telaah.length) {
    alasan.push(`Tuntutan CP yang belum terbukti dapat MiClass layani: ${cakupan.perlu_telaah.join(', ')}.`);
  }
  const didukung = alasan.length === 0;
  return { didukung, kode: didukung ? 'FULLY_SUPPORTED' : 'NOT_SUPPORTED', alasan, cakupan, acuan };
}

/** Apakah teks CP yang tersimpan di ATP masih sama dengan CP yang berlaku.
 *
 *  Ini yang menutup lubang paling besar di alur lama: Edge Function TIDAK
 *  membaca cp-data.json sama sekali. Ia membaca `atp_induk.elemen_cp` — POTRET
 *  yang ditulis peramban saat corong dijalankan. Sebuah ATP yang dibuat sebelum
 *  CP diperbarui membawa teks CP lama di dalam barisnya sendiri, dan sampai
 *  sekarang tidak ada satu pun pemeriksaan yang menyadarinya. Menyusun ulang
 *  ATP itu berarti memetakan CP yang sudah dicabut, dengan seluruh gerbang
 *  hijau. */
export function periksaParitasCp(
  elemenCp: { id: string; label: string; cp_text: string }[],
  acuan: FaseAcuan | null,
): { cocok: boolean; masalah: string[] } {
  const masalah: string[] = [];
  if (!acuan) return { cocok: false, masalah: ['acuan CP tidak tersedia'] };

  const rapi = (t: string) => String(t ?? '').replace(/\s+/g, ' ').trim();
  const perId = new Map(elemenCp.map(e => [String(e.id), e]));

  for (const [id, el] of Object.entries(acuan.elemen)) {
    const e = perId.get(id);
    if (!e) { masalah.push(`elemen ${id} tidak ada di ATP ini`); continue; }
    if (rapi(e.cp_text) !== rapi(el.cp_normatif)) {
      masalah.push(`teks CP elemen ${id} berbeda dari CP ${acuan.versi_cp} yang berlaku`);
    }
  }
  for (const e of elemenCp) {
    if (!acuan.elemen[String(e.id)]) masalah.push(`elemen ${e.id} tidak dikenal di acuan CP`);
  }
  return { cocok: masalah.length === 0, masalah };
}

export function tuntutanWajib(acuan: FaseAcuan | null): { id: string; elemen: string; t: TuntutanCp }[] {
  if (!acuan) return [];
  const out: { id: string; elemen: string; t: TuntutanCp }[] = [];
  for (const [elemenId, el] of Object.entries(acuan.elemen)) {
    for (const t of el.tuntutan) out.push({ id: t.id, elemen: elemenId, t });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. BANGUN KONTEKS — bagian bermakna, bukan gumpalan JSON
// ─────────────────────────────────────────────────────────────────────────────

export function bangunKonteksAtp(
  cd: Record<string, unknown>,
  info: { mapel: string; fase: string; jenjang: string; jumlah_murid: number | null },
  alokasi: Alokasi,
  elemenCp: ElemenCp[],
  delegasi: HasilDelegasi,
  dasarBoleh?: Set<string>,
): Konteks {
  const acuan = acuanUntuk(info.mapel, info.fase);
  const program = teks(jawaban(cd, 'KONTEKS_CP', 'program_keahlian'));

  // ── cp_anchor ──
  const cp_anchor = {
    mapel: info.mapel, fase: info.fase, jenjang: info.jenjang,
    program_keahlian: program,
    elemen: elemenCp.map(e => ({ id: e.id, label: e.label, cp_text: e.cp_text })),
    // cara_layanan TIDAK dikirim (Pass 5, SEM-008). Daftar bentuk media
    // konkretnya — kartu, selebaran, dan sejenisnya — adalah detail Modul, dan
    // semantic test membuktikan ia bocor ke judul TP di 7 dari 7 kasus. Ia tetap
    // hidup di acuan untuk audit layanan (CASE V).
    tuntutan: tuntutanWajib(acuan).map(x => ({
      id: x.id, elemen: x.elemen, kompetensi: x.t.kompetensi,
      lingkup_materi: x.t.lingkup_materi,
      logika: x.t.logika,
      ...(x.t.cakupan_wajib ? { cakupan_wajib: x.t.cakupan_wajib } : {}),
    })),
  };

  // ── kesiapan_murid ──
  const kesiapan: string[] = [];
  const tk = teks(jawaban(cd, 'PROFIL_SISWA', 'tingkat_kemampuan_awal'));
  kesiapan.push(LABEL_KESIAPAN[tk] ?? LABEL_KESIAPAN.belum_diketahui);
  // Arahan kausal per tingkat kesiapan (Pass 5). Semantic test S1↔S2: tanpa
  // arahan ini kesiapan rendah hanya berubah jadi kata "sederhana" di judul.
  kesiapan.push(ARAHAN_KESIAPAN[tk] ?? ARAHAN_KESIAPAN.belum_diketahui);
  // Kebijakan progresi untuk kesiapan ekstrem. Kalimatnya DITURUNKAN dari
  // ATURAN_PROGRESI_KESIAPAN — tabel yang sama yang ditegakkan validator
  // (RDS1–RDS6), supaya yang diminta dari penyusun dan yang diperiksa sesudahnya
  // tidak pernah bisa berbeda. Tujuannya benar di panggilan pertama; validator
  // adalah jaring pengaman, bukan jalur utama.
  const arahanProgresi = arahanProgresiKesiapan(
    aturanProgresiUntuk(tk, tuntutanWajib(acuan).map(x => x.id)));
  if (arahanProgresi) kesiapan.push(arahanProgresi);
  kesiapan.push(dasarProfilMurid(cd));
  const kondisi = teks(jawaban(cd, 'PROFIL_SISWA', 'kondisi_murid_uraian'));
  if (kondisi) kesiapan.push('Kondisi murid yang guru catat: ' + kondisi);
  const bantuan = daftar(jawaban(cd, 'PROFIL_SISWA', 'bantuan_konkret'))
    .filter(b => b !== 'tidak_ada' && b !== 'belum_diketahui' && b !== 'lainnya')
    .map(b => LABEL_BANTUAN[b] ?? b);
  const bantuanLain = teks(jawaban(cd, 'PROFIL_SISWA', 'bantuan_konkret_lain'));
  if (bantuanLain) bantuan.push(bantuanLain);
  if (bantuan.length) {
    kesiapan.push('Murid memerlukan bantuan dalam: ' + bantuan.join('; ') +
      '. TP harus dapat dicapai dengan bantuan itu tersedia, bukan mengandaikan murid sudah mandiri.');
  }
  kesiapan.push(LABEL_PRASYARAT[delegasi.strategi_prasyarat] ?? LABEL_PRASYARAT.terintegrasi);
  // Pass 5, SEM-009: TP 1 yang melayani tuntutan inti sempat diberi tipe
  // "prasyarat", padahal jam penguatan sudah disisihkan di luar TP.
  kesiapan.push('Penguatan kemampuan dasar adalah DUKUNGAN di dalam TP menuju tuntutan CP — bukan TP tersendiri.');
  if (alokasi.jp_prasyarat > 0) {
    kesiapan.push(`${alokasi.jp_prasyarat} JP sudah disisihkan untuk penguatan kemampuan dasar dan TIDAK termasuk dalam jam yang dibagi ke TP.`);
  }
  kesiapan.push(LABEL_BAHASA[delegasi.bahasa_pengantar] ?? LABEL_BAHASA.indonesia_dominan);

  // ── prioritas_guru ──
  const prioritas: string[] = [];
  const dipilih = prioritasDipilih(cd);
  prioritas.push(dipilih.length
    ? 'Guru ingin bagian berikut lebih dikuatkan: ' + dipilih.map(p => p.arti).join('; ') + '.'
    : 'Guru tidak menyebut bagian yang perlu dikuatkan lebih dari yang lain.');
  prioritas.push('Penekanan ini mengatur urutan, porsi waktu, latar contoh, atau penekanan isi. Ia TIDAK menentukan bagian CP yang boleh diabaikan — seluruh tuntutan CP tetap wajib terpetakan.');
  if (dipilih.length) {
    // Pass 5, SEM-007: S4 "pendidikan lanjut" hampir tidak berbekas. Penekanan
    // kini wajib tampak di isi TP, dan jejaknya diperiksa validator.
    prioritas.push('Setiap penekanan di atas WAJIB benar-benar tampak di isi TP yang kau tunjuk sebagai penerapannya — bukan hanya disebut. ' +
      'Kalau sebuah penekanan tampak bertabrakan dengan keputusan eksplisit guru (mis. porsi konteks contoh dan tugas), keputusan eksplisit guru yang menang; ' +
      'terapkan penekanannya lewat urutan, porsi waktu, atau penekanan isi TP yang tetap sah.');
  }
  // Urutan pembelajaran hanya dinyatakan di sini kalau ia SUDAH diputuskan.
  // Kalau guru mendelegasikannya, ia tidak boleh muncul sebagai perintah —
  // penyusun yang memilihnya, dari bagian keputusan_terbuka.
  if (delegasi.metode_pengurutan && METODE_PENGURUTAN[delegasi.metode_pengurutan]) {
    prioritas.push('KEPUTUSAN GURU — urutan pembelajaran: ' + METODE_PENGURUTAN[delegasi.metode_pengurutan]);
  } else {
    prioritas.push('Urutan pembelajaran BELUM ditetapkan — lihat keputusan_terbuka. Putuskan PALING AKHIR, sebagai gambaran jujur atas urutan TP yang sudah kau susun; susunannya sendiri berpangkal pada struktur tuntutan CP lebih dulu, baru kesiapan murid.');
  }

  // ── konteks_kejuruan ──
  //
  // Pass 5, SEM-004. Kalimat pertama DULU berbunyi "Pakai kosakata, situasi,
  // dokumen kerja, dan tugas yang benar-benar ditemui di bidang itu" — perintah
  // tanpa syarat yang mengalahkan pilihan guru "kehidupan" di S5. Program
  // keahlian kini hanya menentukan KEAUTENTIKAN latar kerja bila dipakai;
  // PORSINYA milik A17.
  const kejuruan: string[] = [];
  kejuruan.push(program
    ? `Kelas ini program keahlian ${program}. Bila sebuah TP memakai situasi kerja, situasi itu harus autentik bagi bidang ${program} — kosakata, dokumen, dan tugas yang benar-benar ditemui di sana. ` +
      'Program keahlian TIDAK menentukan berapa banyak TP yang berlatar kerja; porsinya ditentukan keputusan konteks contoh dan tugas.'
    : 'Program keahlian kelas ini belum tercatat. Pakai konteks umum kehidupan sehari-hari dan sekolah.');
  kejuruan.push('Konteks kejuruan adalah ARENA PENERAPAN, bukan kompetensi pengganti. ' +
    `Kompetensi yang dituntut tetap kompetensi ${info.mapel}; program keahlian hanya menentukan latar contohnya.`);
  if (delegasi.konteks_tugas && ARAHAN_KONTEKS_TUGAS[delegasi.konteks_tugas]) {
    kejuruan.push(ARAHAN_KONTEKS_TUGAS[delegasi.konteks_tugas]);
  } else {
    kejuruan.push('Porsi konteks contoh dan tugas BELUM ditetapkan — lihat keputusan_terbuka. Pilih porsinya, lalu susun TP yang benar-benar mengikuti porsi pilihanmu. Timbang tiap tuntutan CP: sebagian hanya punya situasi nyata di dunia kerja, sebagian lagi hanya di kehidupan sehari-hari.');
  }
  const situasi = teks(jawaban(cd, 'KONTEKS_DUDI', 'situasi_khusus_uraian'));
  if (situasi) kejuruan.push('Situasi yang guru minta diutamakan atau dihindari: ' + situasi);

  // ── anggaran_waktu ──
  const tahunRaw = teks(jawaban(cd, 'WAKTU', 'tahun_pelajaran'));
  const tahun = tahunRaw === 'lainnya' ? teks(jawaban(cd, 'WAKTU', 'tahun_pelajaran_lain')) : tahunRaw;
  const durasiRaw = teks(jawaban(cd, 'WAKTU', 'durasi_jp'));
  const durasi = durasiRaw === 'lain'
    ? Number(jawaban(cd, 'WAKTU', 'durasi_jp_lain') ?? 45) || 45
    : Number(durasiRaw || 45) || 45;
  const waktu: string[] = [];
  if (tahun) waktu.push(`Tahun pelajaran ${tahun}.`);
  waktu.push(`${alokasi.jp_per_minggu} JP per minggu, satu JP ${durasi} menit.`);
  waktu.push(`Satu pertemuan berisi ${alokasi.satuan_pertemuan} JP. jp_alokasi setiap TP WAJIB kelipatan ${alokasi.satuan_pertemuan}, dan setiap angka di jp_pertemuan HARUS tepat ${alokasi.satuan_pertemuan}.`);
  waktu.push(`Jam yang dibagi ke TP: ${alokasi.jp_operasional} JP — ${alokasi.jumlah_pertemuan} pertemuan. sum(jp_alokasi) HARUS sama persis dengan angka itu.`);
  for (const a of alokasi.anggaran_semester) {
    waktu.push(`Semester ${a.semester}: ${a.minggu} minggu pembelajaran bersih, ${a.jp} JP. Jumlah jp_alokasi seluruh TP bersemester ${a.semester} HARUS sama persis dengan ${a.jp}.`);
  }
  if (alokasi.jp_cadangan > 0) waktu.push(`${alokasi.jp_cadangan} JP sudah disisihkan sebagai cadangan dan tidak dibagi ke TP.`);

  // ── keputusan_didelegasikan ──
  //
  // Dua daftar, sengaja dipisah. Yang pertama sudah final dan tidak boleh
  // ditawar penyusun; yang kedua justru pekerjaan yang diminta darinya.
  const didelegasikan = delegasi.keputusan.map(k =>
    `${k.pertanyaan}: guru menyerahkannya kepada MiClass. MiClass memilih "${k.dipilih}" — ${k.alasan}`);

  const boleh = dasarBoleh ? [...dasarBoleh] : Object.keys(DASAR_KETERANGAN);
  const terbuka = delegasi.terbuka.map(q => ({
    question_id: q.question_id,
    pertanyaan: q.pertanyaan,
    opsi: Object.entries(q.opsi).map(([kunci, arti]) => ({ kunci, arti })),
    pertimbangkan: q.pertimbangan,
    dasar_yang_boleh_disebut: boleh,
  }));

  // ── penerapan_prioritas_wajib ── (Pass 5, SEM-007)
  const penerapanWajib = dipilih.map(p => ({ prioritas: p.prioritas, arti: p.arti, arahan: p.arahan }));

  // ── batas_mutlak ──
  const batas: string[] = [
    'MiClass adalah layanan berbasis TEKS dan interaksi langsung. Yang dapat disediakan: bacaan, dialog, naskah simakan, kasus, data contoh, formulir, petunjuk peran, latihan, umpan balik, dan instrumen penilaian.',
    'DILARANG merumuskan TP yang bergantung pada video, rekaman audio, file suara, gambar, foto, poster, slide, aplikasi, internet, kunjungan industri, narasumber luar, atau benda praktik. MiClass tidak menghasilkannya, dan guru TIDAK BOLEH diminta mencari, membuat, mengunduh, membeli, atau membawanya.',
    'Kemampuan menyimak TETAP WAJIB dilayani. Sumber bunyinya adalah guru yang membacakan naskah atau murid yang berbicara — tulis kemampuannya, bukan alatnya. "Menyimak instruksi pengukuran pelanggan", BUKAN "Menyimak instruksi dari rekaman suara".',
    'Keterbatasan ini TIDAK boleh dipakai untuk menghapus, menurunkan, atau mengganti tuntutan CP. Seluruh tuntutan tetap wajib terpetakan; teks dan interaksi langsung adalah CARA memenuhinya.',
    'Baca bagian "logika" tiap tuntutan sebelum merumuskan TP. Yang di sana ditandai ALTERNATIF (mis. "tertulis ATAU multimodal") sudah terpenuhi penuh lewat satu jalur — JANGAN merumuskan TP yang menuntut kedua jalur sekaligus. Yang ditandai KUMULATIF wajib dipenuhi seluruhnya.',
    'Seluruh bahan yang dibutuhkan TP disusun MiClass. DILARANG merumuskan TP yang mengharuskan guru mencari, membuat, mengunduh, membeli, atau membawa bahan apa pun; menggandakan hasil cetak MiClass diperbolehkan.',
  ];
  if (info.jumlah_murid) {
    batas.push(`Kelas ini ${info.jumlah_murid} murid. TP harus dapat dijalankan dan dinilai dengan jumlah itu dalam jam yang tersedia.`);
    if (info.jumlah_murid > 30) {
      batas.push('Kelas besar: DILARANG merumuskan TP yang menuntut setiap murid tampil satu per satu dinilai guru — jamnya tidak akan cukup.');
    } else if (info.jumlah_murid < 15) {
      batas.push('Kelas kecil: hindari TP yang mensyaratkan banyak kelompok berjalan serentak atau audiens luas.');
    }
  } else {
    batas.push('Jumlah murid belum diketahui. Jangan mengandaikan kelas besar maupun kecil.');
  }
  batas.push('TP menyatakan KOMPETENSI yang dicapai dalam konteks yang relevan. Ia BUKAN rencana pelaksanaan: rotasi kelompok, pembagian pasangan, pengamatan sampel, dan langkah kegiatan adalah urusan Modul Ajar, bukan judul TP.');
  // Pass 5 — tiga batas yang semantic test buktikan tidak ditegakkan.
  batas.push(`Setiap TP memikul PALING BANYAK ${MAKS_TUNTUTAN_PER_TP} tuntutan CP. TP yang menumpuk lebih banyak kemampuan bukan lagi satu tujuan.`);
  batas.push('Setiap TP adalah bagian WAJIB ATP. Tidak ada TP prasyarat dan tidak ada TP pengayaan; tuntutan ujung fase tidak pernah menjadi pilihan tambahan.');
  // FINAL HARDENING, RT-002: larangan dulu hanya terbaca untuk judul.
  batas.push('Tuntutan media presentasi dipenuhi lewat berbagai media presentasi CETAK yang MiClass sediakan di Modul Ajar. ATP — di judul, konteks, maupun catatan — tidak menentukan bentuk media cetak spesifiknya; bentuk itu dipilih pada Modul Ajar.');

  return {
    cp_anchor, kesiapan_murid: kesiapan, prioritas_guru: prioritas,
    konteks_kejuruan: kejuruan, anggaran_waktu: waktu,
    keputusan_didelegasikan: didelegasikan, keputusan_terbuka: terbuka,
    penerapan_prioritas_wajib: penerapanWajib,
    batas_mutlak: batas,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. VALIDATOR — deterministik saja
// ─────────────────────────────────────────────────────────────────────────────
//
// Yang TIDAK dipasang di sini, dan sengaja: apakah TP benar-benar mewakili
// makna CP, apakah urutannya pedagogis, apakah konteks kejuruan terlalu
// dominan. Ketiganya tidak dapat dibuktikan regex, dan validator palsu yang
// memberi kesan masalah itu sudah selesai jauh lebih berbahaya daripada tidak
// ada validator sama sekali (CLAUDE.md, "gerbang validator: diukur, bukan
// diyakini"). Untuk ketiganya lihat SEMANTIC ACCEPTANCE di
// tests/atp-kontrak.test.ts.

/** Kata benda yang di dalam judul TP hanya bisa berarti ketergantungan pada
 *  bahan yang MiClass tidak sediakan.
 *
 *  KALIBRASI. Batas kata (\b) dipasang di kedua sisi, sehingga
 *  "mengaplikasikan" tidak tertangkap oleh /aplikasi/ dan "menggambarkan"
 *  tidak tertangkap oleh /gambar/. Yang dilarang adalah kata bendanya berdiri
 *  sendiri: di judul TP yang panjangnya belasan kata, kata benda itu selalu
 *  berarti bahan yang harus ada di tangan guru. Diukur terhadap 21 judul TP
 *  produksi (tests/fixtures/atp-produksi.json): nol salah tuduh. */
export const POLA_BAHAN_TERLARANG: { pola: RegExp; sebut: string }[] = [
  { pola: /\bvideo\b|\byoutube\b|\bfilm\b|\btayangan\b|\bmenonton\b/i, sebut: 'video' },
  { pola: /\brekaman\b|\baudio\b|\bpodcast\b|\bsiniar\b/i,             sebut: 'rekaman suara' },
  { pola: /\bgambar\b|\bfoto\b|\bposter\b|\bilustrasi\b/i,             sebut: 'gambar' },
  { pola: /\bslide\b|\bpowerpoint\b|\bppt\b|\bproyektor\b|\blcd\b/i,   sebut: 'slide atau proyektor' },
  { pola: /\baplikasi\b|\bsoftware\b|\bperangkat lunak\b|\bdaring\b|\bonline\b|\binternet\b|\bbrowsing\b/i, sebut: 'aplikasi atau internet' },
  // FINAL HARDENING, RT-001: dulu /\bkunjungan\b|\bnarasumber\b|\bmagang\b/ —
  // kata TOPIK. Semantic retest S3 menolak "Menulis cerita fiksi pengalaman
  // magang …" dan membakar satu-satunya kesempatan perbaikan. Yang tersisa di
  // sini hanya ACARA luar yang bernama (kunjungan industri, studi banding);
  // kegiatan luar yang dilakukan murid ditangkap POLA_KEGIATAN_LUAR di bawah.
  { pola: /\bkunjungan (industri|lapangan|kerja|perusahaan|pabrik)\b|\bstudi banding\b/i, sebut: 'kunjungan atau narasumber' },
  { pola: /\bspeaker\b|\bmikrofon\b|\bpengeras suara\b/i,              sebut: 'alat audio' },
];

/** Kegiatan luar yang DILAKUKAN murid — verba + objek, bukan kata topik.
 *
 *  Validator menjaga KETERGANTUNGAN, bukan topik. "Magang", "kunjungan", dan
 *  "narasumber" boleh menjadi isi teks yang MiClass sediakan (cerita tentang
 *  pengalaman magang, laporan kunjungan tokoh fiktif, dialog peserta magang
 *  dengan supervisor). Yang dilarang adalah TP yang menuntut murid benar-benar
 *  melakukannya. Pola ini hanya diperiksa pada bagian kalimat SEBELUM penanda
 *  isi teks (PENANDA_ISI_TEKS): sesudah "cerita", "laporan", "tentang", dan
 *  sejenisnya, kegiatan itu adalah topik bacaan, bukan tuntutan. */
export const POLA_KEGIATAN_LUAR: { pola: RegExp; sebut: string }[] = [
  {
    pola: new RegExp(
      '\\b(melakukan|menjalani|mengikuti|melaksanakan)\\s+(magang|pkl|praktik kerja lapangan|kunjungan|studi banding|observasi lapangan)\\b' +
      '|\\bpergi\\s+(ke\\s+\\S+\\s+)?magang\\b' +
      '|\\bmengunjungi\\b' +
      '|\\bmewawancarai\\s+(praktisi|narasumber|pekerja|karyawan|pemilik|pelaku usaha|ahli|pengusaha)\\b' +
      '|\\b(mengundang|menghadirkan|mendatangkan|mencari)\\s+(narasumber|praktisi|tamu)\\b',
      'i'),
    sebut: 'kunjungan atau narasumber',
  },
];

/** Kata yang menandai bahwa sisa kalimat adalah ISI teks yang disediakan —
 *  kegiatan luar sesudahnya adalah topik, bukan tuntutan. "peran" dan
 *  "simulasi" termasuk: bermain peran mewawancarai narasumber adalah interaksi
 *  di kelas, bukan wawancara sungguhan. */
export const PENANDA_ISI_TEKS =
  /\b(cerita|cerpen|kisah|narasi|laporan|teks|dialog|artikel|kasus|naskah|bacaan|tentang|mengenai|berlatar|bertema|pengalaman|profil|surat|peran|simulasi)\b/i;

/** Bagian kalimat yang menyatakan kegiatan murid — sebelum penanda isi teks. */
function bagianKegiatan(kalimat: string): string {
  const m = PENANDA_ISI_TEKS.exec(kalimat);
  return m ? kalimat.slice(0, m.index) : kalimat;
}

/** Sebab ketergantungan bahan/kegiatan luar pada satu TP, atau null. Kelompok A
 *  (benda dan acara bernama) diperiksa di seluruh judul/konteks/catatan;
 *  kelompok B (kegiatan murid) hanya pada bagian kegiatan tiap kalimat. */
export function sebabKetergantungan(judul: string, konteks: string[] = [], catatan = ''): string | null {
  const menyeluruh = [judul, ...konteks, catatan].join(' | ');
  for (const { pola, sebut } of POLA_BAHAN_TERLARANG) if (pola.test(menyeluruh)) return sebut;
  for (const kalimat of [judul, ...konteks, catatan]) {
    const bagian = bagianKegiatan(String(kalimat ?? ''));
    for (const { pola, sebut } of POLA_KEGIATAN_LUAR) if (pola.test(bagian)) return sebut;
  }
  return null;
}

/** Jargon yang tidak boleh muncul di judul TP. Daftar ini SEBELUMNYA hanya ada
 *  di prompt — yaitu hanya sebagai harapan. */
export const JARGON_TERLARANG: RegExp[] = [
  /\basesmen (formatif|sumatif)\b/i, /\bdiferensiasi\b/i, /\bscaffolding\b/i,
  /\bhots\b/i, /\btaksonomi bloom\b/i, /\bkompetensi (inti|dasar)\b/i,
  /\bindikator pencapaian\b/i, /\bcapaian pembelajaran\b/i, /\bkktp\b/i,
];

// KONTRAK PANJANG JUDUL TP — dua angka, dan keduanya dinyatakan sebagai
// kontrak, bukan sebagai selisih yang kebetulan ada.
//
//   SASARAN LUNAK  <= 12 kata. Inilah standarnya, dan dasarnya keterbacaan
//   guru: judul TP dibaca sekilas di daftar, dicetak di ATP, dan dipakai
//   sebagai nama Modul Ajar. Dua belas kata adalah panjang yang masih bisa
//   ditangkap dalam satu tarikan mata.
//
//   BATAS KERAS    = 16 kata. Ini BUKAN standar dan bukan pembenaran dari
//   keluaran lama — bahwa ATP lama pernah menghasilkan judul 15 kata tidak
//   menjadikan 15 kata benar. Ia semata-mata titik tempat penolakan mulai lebih
//   merugikan guru daripada judul yang kepanjangan: menolak SELURUH ATP karena
//   satu judul 13 kata membakar satu dari tiga jatah harian guru.
//
// Judul di antara keduanya lolos, tetapi dicatat di `peringatan` — catatan mutu
// internal, tidak ditampilkan kepada guru, karena guru tidak bisa berbuat
// apa-apa dengannya. Yang membacanya adalah kita, saat menilai apakah pita
// toleransi ini masih pada tempatnya.

/** Sasaran lunak. Dilanggar = dicatat, bukan ditolak. */
export const TARGET_KATA_JUDUL = 12;

/** Batas keras. Dilanggar = seluruh ATP ditolak. */
export const MAKS_KATA_JUDUL = 16;

export type HasilValidasi = {
  valid: boolean;
  errors: string[];
  entries: TpEntry[];
  /** Keputusan semantik yang penyusun kembalikan, SUDAH divalidasi dan sudah
   *  diterjemahkan ke label manusia. Kosong bila tidak ada yang didelegasikan. */
  keputusan: KeputusanMiClass[];
  /** Jejak penekanan guru, SUDAH divalidasi dan diterjemahkan ke frasa
   *  manusia. Kosong bila guru tidak memilih penekanan (Pass 5). */
  penerapan: PenerapanPrioritasTersimpan[];
  /** Catatan mutu internal — lolos gerbang, tetapi di pita toleransi.
   *  TIDAK ditampilkan kepada guru. */
  peringatan: string[];
};

export type SyaratValidasi = {
  jp_operasional: number;
  satuan_pertemuan: number;
  elemen_diizinkan: Set<string>;
  tuntutan_diizinkan: Set<string>;
  /** Kosong berarti acuan CP belum ada — pemeriksaan cakupan dilewati, dan
   *  hasilnya TIDAK boleh diberi status siap pakai (SPEC §2.3). */
  tuntutan_wajib: string[];
  anggaran_semester: { semester: number; jp: number }[];
  target_tp: number;
  /** Pertanyaan semantik yang guru delegasikan. Penyusun WAJIB mengembalikan
   *  tepat satu keputusan untuk masing-masing — tidak kurang, tidak lebih. */
  delegasi_terbuka?: PertanyaanSemantik[];
  /** Rujukan konteks yang benar-benar dikirim pada permintaan ini. Dasar di
   *  luar himpunan ini adalah klaim tentang sesuatu yang tidak ada. */
  dasar_tersedia?: Set<string>;
  /** Pass 5. Penekanan A16 yang WAJIB punya tepat satu jejak penerapan.
   *  undefined = pemeriksaan dilewati (validasi ATP lama/uji lama). */
  prioritas_wajib?: { prioritas: string; arti: string; arahan: string }[];
  /** Pass 5. ID tuntutan → kategori teks yang wajib tercakup GABUNGAN TP yang
   *  merujuknya. Dibaca dari cakupan_wajib di acuan, tidak ditulis tangan. */
  tuntutan_kategori?: Record<string, string[]>;
  /** Pass 5. Keluaran penyusunan BARU: field `tipe` lama dibuang dari entri,
   *  karena setiap TP ATP baru adalah bagian wajib ATP. */
  skema_baru?: boolean;
  /** Tingkat kesiapan murid apa adanya. Menyalakan aturan progresi kesiapan
   *  (RDS1–RDS6) HANYA untuk tingkat yang punya entri di
   *  ATURAN_PROGRESI_KESIAPAN. undefined atau tingkat lain = tidak diperiksa. */
  kesiapan?: string;
};

export function validasiAtp(raw: unknown, s: SyaratValidasi): HasilValidasi {
  const errors: string[] = [];
  const peringatan: string[] = [];
  const E = (kode: string, pesan: string) => errors.push(`[${kode}] ${pesan}`);

  // Array telanjang (ATP lama) maupun amplop objek sama-sama DIBACA. Bentuk
  // yang DIMINTA dari penyusun sejak Pass 5 selalu objek.
  const { tp: rawTp, keputusan: rawKeputusan, penerapan: rawPenerapan } = pisahkanKeluaran(raw);

  const terbuka = s.delegasi_terbuka ?? [];
  const keputusan = periksaKeputusan(rawKeputusan, terbuka, s.dasar_tersedia ?? null, E);

  if (!Array.isArray(rawTp) || rawTp.length === 0) {
    return {
      valid: false, errors: ['[S1] Respons bukan array TP atau kosong', ...errors],
      entries: [], keputusan: [], penerapan: [], peringatan,
    };
  }
  let entries = rawTp as TpEntry[];

  // Pass 5, SEM-003/SEM-009: ATP baru tidak mengelompokkan TP. Kalau model
  // tetap menulis `tipe`, ia DIBUANG dari ATP baru — tidak ditolak, karena
  // setiap TP memang wajib dan menolaknya hanya membakar satu perbaikan.
  if (s.skema_baru && entries.some(t => t && typeof t === 'object' && 'tipe' in t)) {
    peringatan.push('[S4-legacy] field tipe diabaikan — setiap TP ATP baru adalah bagian wajib ATP');
    entries = entries.map(t => {
      const { tipe: _abaikan, ...sisa } = t;
      return sisa as TpEntry;
    });
  }

  // Pass 5, SEM-007: jejak penekanan guru → TP nyata.
  const penerapan = s.prioritas_wajib
    ? periksaPenerapanPrioritas(rawPenerapan, s.prioritas_wajib, new Set(entries.map(t => Number(t?.nomor))), E)
    : [];

  // ── STRUKTUR ──
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]?.nomor !== i + 1) {
      E('S2', `nomor tidak berurutan: TP[${i}].nomor=${entries[i]?.nomor}, diharapkan ${i + 1}`);
    }
  }
  for (const tp of entries) {
    if (!tp.judul || !String(tp.judul).trim()) E('S3', `TP ${tp.nomor}: judul kosong`);
  }

  // ── CP: elemen dari allowlist, tidak ada ID karangan ──
  const elemenSalah: string[] = [];
  for (const tp of entries) {
    if (!Array.isArray(tp.elemen) || tp.elemen.length === 0) {
      E('C1', `TP ${tp.nomor}: tidak punya satu pun elemen CP`);
      continue;
    }
    for (const id of tp.elemen) if (!s.elemen_diizinkan.has(String(id))) elemenSalah.push(String(id));
  }
  if (elemenSalah.length) E('C2', `elemen ID tidak valid: ${[...new Set(elemenSalah)].join(', ')}`);

  // ── CP: tuntutan dan cakupan ──
  const tercakup = new Set<string>();
  if (s.tuntutan_wajib.length) {
    const tuntutanSalah: string[] = [];
    for (const tp of entries) {
      const t = Array.isArray(tp.tuntutan) ? tp.tuntutan : [];
      if (t.length === 0) { E('C3', `TP ${tp.nomor}: tidak menyebut satu pun tuntutan CP yang dilayaninya`); continue; }
      for (const id of t) {
        if (!s.tuntutan_diizinkan.has(String(id))) tuntutanSalah.push(String(id));
        else tercakup.add(String(id));
      }
    }
    if (tuntutanSalah.length) E('C4', `ID tuntutan CP tidak dikenal: ${[...new Set(tuntutanSalah)].join(', ')}`);
    const belum = s.tuntutan_wajib.filter(id => !tercakup.has(id));
    if (belum.length) E('C5', `tuntutan CP belum terpetakan ke TP mana pun: ${belum.join(', ')}`);
  }

  // ── CP: cakupan KUMULATIF di dalam tuntutan (Pass 5, SEM-006) ──
  //
  // 9/9 ID tercakup tidak berarti tuntutannya terpenuhi: "teks fiksi dan non
  // fiksi" menuntut KEDUA kategori, dan semantic test menemukan ATP yang
  // membaca dan menulis nonfiksi saja sambil lolos C5. Sumber kebenarannya
  // metadata `kategori_teks` yang TP nyatakan — BUKAN tebakan dari kata di
  // judul — dan aturannya dibaca dari cakupan_wajib acuan, bukan dari daftar ID.
  if (s.tuntutan_kategori && Object.keys(s.tuntutan_kategori).length) {
    const kategoriPerTuntutan = new Map<string, Set<string>>();
    for (const tp of entries) {
      const ids = (Array.isArray(tp.tuntutan) ? tp.tuntutan : []).map(String);
      const berkategori = ids.filter(id => s.tuntutan_kategori![id]);
      const kat = Array.isArray(tp.kategori_teks) ? tp.kategori_teks.map(x => String(x).trim()) : [];
      const asing = kat.filter(k => !KATEGORI_TEKS[k]);
      if (asing.length) {
        E('C7', `TP ${tp.nomor}: kategori_teks tidak dikenal: ${asing.join(', ')} — hanya ${Object.keys(KATEGORI_TEKS).join(', ')}`);
      }
      const sah = kat.filter(k => KATEGORI_TEKS[k]);
      if (berkategori.length && sah.length === 0) {
        E('C7', `TP ${tp.nomor}: melayani ${berkategori.join(', ')} yang menuntut kategori teks, tetapi tidak menyebut kategori_teks`);
      }
      for (const id of berkategori) {
        const himpunan = kategoriPerTuntutan.get(id) ?? new Set<string>();
        for (const k of sah) himpunan.add(k);
        kategoriPerTuntutan.set(id, himpunan);
      }
    }
    for (const [id, wajibKat] of Object.entries(s.tuntutan_kategori)) {
      if (!tercakup.has(id)) continue;   // sudah dilaporkan C5
      const ada = kategoriPerTuntutan.get(id) ?? new Set<string>();
      const kurang = wajibKat.filter(k => !ada.has(k));
      if (kurang.length) {
        E('C6', `tuntutan ${id} menuntut teks ${wajibKat.join(' dan ')}; gabungan TP yang merujuknya baru mencakup ` +
          `${[...ada].join(', ') || 'tidak satu pun'} (kurang: ${kurang.join(', ')})`);
      }
    }
  }

  // ── WAKTU ──
  for (const tp of entries) {
    if (typeof tp.jp_alokasi !== 'number' || !Number.isInteger(tp.jp_alokasi) || tp.jp_alokasi <= 0) {
      E('W1', `TP ${tp.nomor}: jp_alokasi harus integer > 0 (dapat: ${tp.jp_alokasi})`);
    } else if (s.satuan_pertemuan > 0 && tp.jp_alokasi % s.satuan_pertemuan !== 0) {
      E('W2', `TP ${tp.nomor}: jp_alokasi=${tp.jp_alokasi} bukan kelipatan satuan pertemuan ${s.satuan_pertemuan}`);
    }
  }
  for (const tp of entries) {
    if (!Array.isArray(tp.jp_pertemuan) || tp.jp_pertemuan.length === 0) {
      E('W3', `TP ${tp.nomor}: jp_pertemuan bukan array berisi`);
      continue;
    }
    const sum = tp.jp_pertemuan.reduce((a, b) => a + (Number(b) || 0), 0);
    if (sum !== tp.jp_alokasi) E('W4', `TP ${tp.nomor}: sum(jp_pertemuan)=${sum} !== jp_alokasi=${tp.jp_alokasi}`);
    if (s.satuan_pertemuan > 0) {
      const salah = tp.jp_pertemuan.filter(n => Number(n) !== s.satuan_pertemuan);
      if (salah.length) E('W5', `TP ${tp.nomor}: setiap pertemuan harus ${s.satuan_pertemuan} JP (dapat: ${tp.jp_pertemuan.join('+')})`);
    }
  }
  const totalJp = entries.reduce((sum, tp) =>
    sum + (Number.isInteger(tp.jp_alokasi) ? tp.jp_alokasi : 0), 0);
  if (totalJp !== s.jp_operasional) {
    E('W6', `sum(jp_alokasi)=${totalJp} !== jp_operasional=${s.jp_operasional}`);
  }

  // ── WAKTU: semester ──
  if (s.anggaran_semester.length) {
    const sah = new Set(s.anggaran_semester.map(a => a.semester));
    for (const tp of entries) {
      if (!sah.has(Number(tp.semester))) {
        E('W7', `TP ${tp.nomor}: semester harus salah satu dari ${[...sah].join('/')} (dapat: ${tp.semester})`);
      }
    }
    for (const a of s.anggaran_semester) {
      const jml = entries.filter(tp => Number(tp.semester) === a.semester)
        .reduce((sum, tp) => sum + (Number(tp.jp_alokasi) || 0), 0);
      if (jml !== a.jp) E('W8', `semester ${a.semester}: sum(jp_alokasi)=${jml} !== anggaran ${a.jp} JP`);
    }
  }

  // ── KEPADATAN ──
  // Toleransi satu TP: perintahnya berbunyi "sekitar", dan menolak seluruh ATP
  // karena meleset satu TP membakar jatah harian guru untuk selisih yang tidak
  // ia rasakan. Dua TP ke atas berarti perintahnya memang diabaikan.
  if (s.target_tp > 0 && Math.abs(entries.length - s.target_tp) > 1) {
    E('K1', `jumlah TP=${entries.length}, diminta sekitar ${s.target_tp} (selisih maksimal 1)`);
  }
  // Pass 5: batas tuntutan per TP. Pass 2 sudah menyebut "TP yang memikul lebih
  // dari dua tuntutan sudah bukan satu tujuan", tetapi hanya sebagai heuristic —
  // S6 semantic test menghasilkan satu TP berisi MP-2 + MP-4 + MP-5 yang lolos.
  // Pasangan mana pun boleh; yang dicegah hanya penumpukan.
  for (const tp of entries) {
    const unik = [...new Set((Array.isArray(tp.tuntutan) ? tp.tuntutan : []).map(String))];
    if (unik.length > MAKS_TUNTUTAN_PER_TP) {
      E('K2', `TP ${tp.nomor}: memikul ${unik.length} tuntutan CP (${unik.join(', ')}), batas ${MAKS_TUNTUTAN_PER_TP} per TP`);
    }
  }

  // ── PROGRESI KESIAPAN (RDS) ──
  //
  // Berlaku HANYA untuk tingkat kesiapan yang punya entri di
  // ATURAN_PROGRESI_KESIAPAN — hari ini hanya `jauh_di_bawah`. Kesiapan lain
  // melewati blok ini seluruhnya dan tidak bisa gagal karenanya.
  //
  // ATURAN OCCURRENCE. Satu tuntutan boleh muncul di beberapa TP. Yang dipakai
  // membandingkan urutan dan semester adalah KEMUNCULAN PERTAMA — TP bernomor
  // terkecil yang menyebut tuntutan itu. Alasannya: yang dijaga adalah kapan
  // sebuah kemampuan mulai DITUNTUT dari murid, bukan kapan ia terakhir
  // dilatih. Pengulangan sesudahnya bebas dan tidak diperiksa.
  //
  // Kode galat dipetakan per aturan: aturan ke-i memakai RDS(3i+1) urutan,
  // RDS(3i+2) penggabungan, RDS(3i+3) semester. Untuk kedua aturan yang berlaku
  // sekarang itu berarti MB-2/MB-3 → RDS1–RDS3, MP-4/MP-5 → RDS4–RDS6.
  const aturanProgresi = aturanProgresiUntuk(s.kesiapan ?? '', s.tuntutan_diizinkan);
  if (aturanProgresi.length) {
    /** Nomor TP kemunculan pertama sebuah tuntutan, null bila tidak ada. */
    const pertama = (id: string): TpEntry | null => {
      for (const tp of entries) {
        const t = (Array.isArray(tp?.tuntutan) ? tp.tuntutan : []).map(String);
        if (t.includes(id)) return tp;
      }
      return null;
    };
    const nomorAman = (tp: TpEntry) =>
      Number.isInteger(Number(tp.nomor)) ? Number(tp.nomor) : entries.indexOf(tp) + 1;

    aturanProgresi.forEach((a, i) => {
      const kodeUrutan   = `RDS${i * 3 + 1}`;
      const kodeGabung   = `RDS${i * 3 + 2}`;
      const kodeSemester = `RDS${i * 3 + 3}`;

      // TP yang menumpuk keduanya diperiksa lebih dulu: ia satu-satunya bentuk
      // pelanggaran yang membuat "urutan" tidak punya arti.
      const bersama = entries.find(tp => {
        const t = (Array.isArray(tp.tuntutan) ? tp.tuntutan : []).map(String);
        return t.includes(a.dasar) && t.includes(a.lanjutan);
      });
      if (bersama) {
        E(kodeGabung,
          `TP ${bersama.nomor}: ${a.label_dasar} (${a.dasar}) dan ${a.label_lanjutan} (${a.lanjutan}) ` +
          `digabung dalam satu TP; untuk kelas jauh di bawah keduanya harus TP terpisah`);
      }

      const tpDasar = pertama(a.dasar);
      const tpLanjutan = pertama(a.lanjutan);
      // Tuntutan yang sama sekali tidak terpetakan sudah dilaporkan C5 —
      // jangan menumpuk galat kedua untuk sebab yang sama.
      if (!tpDasar || !tpLanjutan) return;

      if (!bersama && nomorAman(tpLanjutan) < nomorAman(tpDasar)) {
        E(kodeUrutan,
          `TP ${tpLanjutan.nomor} menuntut ${a.label_lanjutan} (${a.lanjutan}) sebelum TP ${tpDasar.nomor} ` +
          `yang membangun ${a.label_dasar} (${a.dasar}); untuk kelas jauh di bawah urutannya harus terbalik`);
      }

      if (a.semester_lanjutan !== null && Number(tpLanjutan.semester) !== a.semester_lanjutan) {
        E(kodeSemester,
          `TP ${tpLanjutan.nomor}: ${a.label_lanjutan} (${a.lanjutan}) muncul pertama kali di semester ` +
          `${tpLanjutan.semester}; untuk kelas jauh di bawah ia ditempatkan Semester ${a.semester_lanjutan}`);
      }
    });
  }

  // ── BAHASA DAN KETERGANTUNGAN BAHAN ──
  for (const tp of entries) {
    const judul = String(tp.judul ?? '');
    const sebut = sebabKetergantungan(judul, (tp.konteks ?? []).map(String), String(tp.catatan ?? ''));
    if (sebut) {
      E('B1', `TP ${tp.nomor}: menuntut ${sebut}, bahan yang tidak disediakan MiClass dan tidak boleh dibebankan kepada guru — "${judul}"`);
    }
    for (const pola of JARGON_TERLARANG) {
      if (pola.test(judul)) { E('B2', `TP ${tp.nomor}: judul memakai jargon yang dilarang — "${judul}"`); break; }
    }
    const kata = judul.trim().split(/\s+/).filter(Boolean).length;
    if (kata > MAKS_KATA_JUDUL) {
      E('B3', `TP ${tp.nomor}: judul ${kata} kata, batas keras ${MAKS_KATA_JUDUL} — "${judul}"`);
    } else if (kata > TARGET_KATA_JUDUL) {
      peringatan.push(
        `[B3-toleransi] TP ${tp.nomor}: judul ${kata} kata, di atas sasaran ${TARGET_KATA_JUDUL} ` +
        `dan masih di bawah batas keras ${MAKS_KATA_JUDUL} — "${judul}"`);
    }
  }

  return { valid: errors.length === 0, errors, entries, keputusan, penerapan, peringatan };
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. PEMERIKSAAN KEPUTUSAN SEMANTIK
// ─────────────────────────────────────────────────────────────────────────────
//
// Keputusan yang penyusun kembalikan diperlakukan seperti keluaran lain: tidak
// dipercaya, diperiksa. Yang diperiksa BUKAN apakah pilihannya bijak — itu
// tidak dapat dibuktikan kode, dan validator palsu yang berpura-pura bisa lebih
// berbahaya daripada tidak ada validator (CLAUDE.md, "gerbang validator: diukur,
// bukan diyakini"). Yang diperiksa adalah empat hal yang memang dapat
// dibuktikan:
//
//   D1  keputusan hanya untuk pertanyaan yang benar-benar didelegasikan guru;
//   D2  setiap pertanyaan yang didelegasikan benar-benar dijawab;
//   D3  pilihannya ada di allowlist — tidak ada opsi karangan;
//   D4  alasannya ada dan bukan sekadar mengulang nama pilihannya;
//   D5  dasarnya merujuk konteks yang benar-benar dikirim.
//
// D5 adalah yang paling menentukan. Tanpa ia, "alasan" hanyalah kalimat, dan
// kalimat dapat mengarang apa saja — termasuk program keahlian yang tidak
// pernah tercatat atau situasi khusus yang tidak pernah guru sebutkan.

/** Panjang minimum alasan. Bukan mutu, hanya penyaring kalimat kosong. */
export const MIN_HURUF_ALASAN = 25;

export function periksaKeputusan(
  raw: unknown[],
  terbuka: PertanyaanSemantik[],
  dasarBoleh: Set<string> | null,
  E: (kode: string, pesan: string) => void,
): KeputusanMiClass[] {
  const out: KeputusanMiClass[] = [];
  const perluDijawab = new Map(terbuka.map(q => [q.question_id, q]));
  const sudah = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      E('D1', 'keputusan_didelegasikan berisi entri yang bukan objek');
      continue;
    }
    const o  = item as Record<string, unknown>;
    const qid = String(o.question_id ?? '').trim();
    const q   = perluDijawab.get(qid);

    if (!q) {
      E('D1', `keputusan untuk ${qid || '(tanpa question_id)'} tidak diminta — ` +
        (perluDijawab.size
          ? `yang didelegasikan guru hanya ${[...perluDijawab.keys()].join(', ')}`
          : 'guru tidak mendelegasikan satu pun keputusan'));
      continue;
    }
    if (sudah.has(qid)) { E('D1', `keputusan ganda untuk ${qid}`); continue; }
    sudah.add(qid);

    const pilihan = String(o.pilihan ?? '').trim();
    if (!q.opsi[pilihan]) {
      E('D3', `${qid}: pilihan "${pilihan}" bukan opsi yang sah — hanya boleh ${Object.keys(q.opsi).join(', ')}`);
      continue;
    }

    const alasan = String(o.alasan ?? '').trim();
    if (alasan.length < MIN_HURUF_ALASAN) {
      E('D4', `${qid}: alasan kosong atau terlalu pendek (${alasan.length} huruf, minimal ${MIN_HURUF_ALASAN})`);
      continue;
    }

    const dasar = Array.isArray(o.dasar) ? o.dasar.map(x => String(x).trim()).filter(Boolean) : [];
    if (dasar.length === 0) {
      E('D5', `${qid}: tidak menyebut satu pun dasar dari konteks yang tersedia`);
      continue;
    }
    if (dasarBoleh) {
      const asing = dasar.filter(d => !dasarBoleh.has(d));
      if (asing.length) {
        E('D5', `${qid}: dasar merujuk sesuatu yang tidak ada dalam konteks permintaan ini: ${asing.join(', ')} — ` +
          `yang tersedia: ${[...dasarBoleh].join(', ')}`);
        continue;
      }
    }

    out.push({
      pertanyaan: q.pertanyaan,
      didelegasikan_karena: 'guru memilih tentukan saat menyusun',
      dipilih: q.opsi[pilihan],
      alasan,
      sumber: 'penyusunan',
      dasar,
      kunci: pilihan,
    });
  }

  for (const [qid, q] of perluDijawab) {
    if (!sudah.has(qid)) {
      E('D2', `${qid} (${q.pertanyaan}) didelegasikan guru tetapi tidak dijawab di keputusan_didelegasikan`);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. JEJAK PENEKANAN GURU (Pass 5, SEM-007)
// ─────────────────────────────────────────────────────────────────────────────
//
// Semantic test S4: prioritas "pendidikan lanjut" masuk prompt lalu hampir tak
// berbekas, dan tidak ada apa pun yang bisa menunjukkannya. Penekanan kini wajib
// meninggalkan jejak, dan jejak itu diperiksa sekeras keputusan semantik. Yang
// diperiksa adalah yang DAPAT dibuktikan:
//
//   P1  hanya untuk penekanan yang benar-benar guru pilih; tidak ganda;
//   P2  setiap penekanan yang dipilih punya jejak;
//   P3  menunjuk TP yang ada, sekurang-kurangnya satu;
//   P4  bentuk pengaruhnya dari allowlist, dan alasannya bukan kalimat kosong.
//
// Apakah isi TP yang ditunjuk BENAR-BENAR mencerminkan penekanan itu tidak dapat
// dibuktikan kode — itu tetap telaah manusia atas keluaran nyata.

export function periksaPenerapanPrioritas(
  raw: unknown[] | null,
  wajib: { prioritas: string; arti: string; arahan: string }[],
  nomorSah: Set<number>,
  E: (kode: string, pesan: string) => void,
): PenerapanPrioritasTersimpan[] {
  const out: PenerapanPrioritasTersimpan[] = [];
  const perlu = new Map(wajib.map(p => [p.prioritas, p]));
  const sudah = new Set<string>();

  for (const item of raw ?? []) {
    if (!item || typeof item !== 'object') { E('P1', 'penerapan_prioritas berisi entri yang bukan objek'); continue; }
    const o = item as Record<string, unknown>;
    const kunci = String(o.prioritas ?? '').trim();
    const p = perlu.get(kunci);
    if (!p) {
      E('P1', `penerapan untuk "${kunci || '(tanpa prioritas)'}" tidak diminta — penekanan yang guru pilih hanya ` +
        (perlu.size ? [...perlu.keys()].join(', ') : '(tidak ada)'));
      continue;
    }
    if (sudah.has(kunci)) { E('P1', `penerapan ganda untuk ${kunci}`); continue; }
    sudah.add(kunci);

    const tp = Array.isArray(o.tp) ? o.tp.map(Number) : [];
    if (!tp.length) { E('P3', `${kunci}: tidak menunjuk satu pun TP`); continue; }
    const salah = tp.filter(n => !Number.isInteger(n) || !nomorSah.has(n));
    if (salah.length) { E('P3', `${kunci}: menunjuk TP yang tidak ada: ${salah.join(', ')}`); continue; }

    const pengaruh = Array.isArray(o.pengaruh) ? o.pengaruh.map(x => String(x).trim()).filter(Boolean) : [];
    const asing = pengaruh.filter(x => !PENGARUH_PRIORITAS[x]);
    if (!pengaruh.length || asing.length) {
      E('P4', `${kunci}: pengaruh harus satu atau lebih dari ${Object.keys(PENGARUH_PRIORITAS).join(', ')}` +
        (asing.length ? ` (dapat: ${asing.join(', ')})` : ''));
      continue;
    }
    const alasan = String(o.alasan ?? '').trim();
    if (alasan.length < MIN_HURUF_ALASAN) {
      E('P4', `${kunci}: alasan kosong atau terlalu pendek (${alasan.length} huruf, minimal ${MIN_HURUF_ALASAN})`);
      continue;
    }
    out.push({
      prioritas: p.arti, kunci,
      tp: [...new Set(tp)].sort((a, b) => a - b),
      pengaruh: [...new Set(pengaruh)].map(x => PENGARUH_PRIORITAS[x]),
      alasan,
    });
  }
  for (const [k, p] of perlu) {
    if (!sudah.has(k)) E('P2', `penekanan guru "${p.arti}" (${k}) tidak punya jejak di penerapan_prioritas`);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. PARSER KELUARAN MODEL (Pass 5, SEM-001)
// ─────────────────────────────────────────────────────────────────────────────
//
// Pengganti extractJson() di index.ts, yang mencari ARRAY lebih dulu dengan
// regex greedy: objek {"keputusan_didelegasikan":[…],"tp":[…]} terpotong dari
// "[" pertama sampai "]" terakhir, dan setiap ATP dengan keputusan terbuka
// gagal — 6 dari 7 kasus semantic test.
//
// Aturannya sengaja SEMPIT. Yang diterima hanya: seluruh keluaran adalah satu
// dokumen JSON, atau satu dokumen JSON yang dibungkus tepat satu code fence.
// Narasi di depan/belakang, dua dokumen, dan JSON rusak DITOLAK — parser yang
// memungut JSON dari tengah narasi diam-diam menerima keluaran yang melanggar
// kontrak "hanya JSON", dan kegagalan itu seharusnya terlihat (lalu diperbaiki
// satu kali), bukan disembunyikan.

export function parseKeluaranModel(teks: string): unknown {
  const t = String(teks ?? '').trim();
  if (!t) throw new Error('keluaran kosong');
  try {
    return JSON.parse(t);
  } catch { /* bukan JSON utuh — periksa satu code fence */ }

  const m = /^```[A-Za-z]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/.exec(t);
  if (m && !m[1].includes('```')) {
    try {
      return JSON.parse(m[1].trim());
    } catch (e) {
      throw new Error('isi code fence bukan JSON yang sah: ' + (e as Error).message);
    }
  }
  throw new Error('keluaran bukan satu dokumen JSON yang sah (ada teks lain, dua dokumen, atau JSON rusak)');
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. SYARAT VALIDASI — satu pembangun untuk Edge Function dan harness
// ─────────────────────────────────────────────────────────────────────────────

export function bangunSyaratValidasi(p: {
  alokasi: Alokasi;
  target_tp: number;
  elemen: ElemenCp[];
  wajib: { id: string; t: TuntutanCp }[];
  delegasi: HasilDelegasi;
  dasar_tersedia: Set<string>;
  prioritas: { prioritas: string; arti: string; arahan: string }[];
  /** Tingkat kesiapan murid. Menyalakan RDS1–RDS6 bila tingkatnya punya entri
   *  di ATURAN_PROGRESI_KESIAPAN. Dibiarkan kosong = tidak diperiksa. */
  kesiapan?: string;
}): SyaratValidasi {
  const kategori: Record<string, string[]> = {};
  for (const w of p.wajib) {
    const k = w.t.cakupan_wajib?.kategori_teks;
    if (k?.length) kategori[w.id] = [...k];
  }
  return {
    jp_operasional:     p.alokasi.jp_operasional,
    satuan_pertemuan:   p.alokasi.satuan_pertemuan,
    elemen_diizinkan:   new Set(p.elemen.map(e => e.id)),
    tuntutan_diizinkan: new Set(p.wajib.map(w => w.id)),
    tuntutan_wajib:     p.wajib.map(w => w.id),
    anggaran_semester:  p.alokasi.anggaran_semester.map(a => ({ semester: a.semester, jp: a.jp })),
    target_tp:          p.target_tp,
    delegasi_terbuka:   p.delegasi.terbuka,
    dasar_tersedia:     p.dasar_tersedia,
    prioritas_wajib:    p.prioritas,
    tuntutan_kategori:  kategori,
    skema_baru:         true,
    kesiapan:           p.kesiapan,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. PESAN PERBAIKAN — SATU bentuk, selalu objek kanonik (Pass 5, SEM-002)
// ─────────────────────────────────────────────────────────────────────────────
//
// Sampai Pass 4 ada dua teks perbaikan, dan yang pertama berbunyi "Hasilkan
// ulang HANYA JSON array TP" — juga saat ada keputusan terbuka. Model patuh,
// membuang keputusan guru, dan perbaikan kedua menolaknya. Sekarang satu teks,
// satu bentuk, membawa SELURUH masalah yang diketahui: ia satu-satunya
// kesempatan perbaikan.

export const BENTUK_KANONIK =
  '{"keputusan_didelegasikan": [...], "penerapan_prioritas": [...], "tp": [...]}';

export function pesanPerbaikanAtp(masalah: string[], s: SyaratValidasi): string {
  const terbuka = s.delegasi_terbuka ?? [];
  const prioritas = s.prioritas_wajib ?? [];
  const kategori = Object.entries(s.tuntutan_kategori ?? {});
  return [
    'Keluaranmu ditolak pemeriksa MiClass karena masalah berikut:',
    ...masalah.map(m => '- ' + m),
    '',
    'Perbaiki SEMUA masalah itu sekaligus — ini satu-satunya kesempatan perbaikan. Aturan yang tidak boleh dilanggar:',
    `- sum(jp_alokasi) = ${s.jp_operasional}; setiap jp_alokasi kelipatan ${s.satuan_pertemuan}; ` +
      `setiap angka jp_pertemuan tepat ${s.satuan_pertemuan}; ` +
      s.anggaran_semester.map(a => `semester ${a.semester} = ${a.jp} JP`).join('; ') +
      '; satu TP tidak terbelah dua semester.',
    `- sekitar ${s.target_tp} TP (selisih paling banyak satu).`,
    `- ID elemen hanya dari ${[...s.elemen_diizinkan].join(', ')}; ID tuntutan hanya dari ` +
      `${s.tuntutan_wajib.join(', ')} dan SEMUANYA wajib terpakai; paling banyak ${MAKS_TUNTUTAN_PER_TP} tuntutan per TP.`,
    ...(kategori.length
      ? [`- kategori_teks wajib ditulis pada TP yang melayani ${kategori.map(([id]) => id).join(', ')}, dan gabungan TP ` +
         `untuk tiap tuntutan itu wajib mencakup ${[...new Set(kategori.flatMap(([, k]) => k))].join(' dan ')}.`]
      : []),
    terbuka.length
      ? '- keputusan_didelegasikan wajib lengkap dan sah: ' +
        terbuka.map(q => `${q.question_id} pilih salah satu dari ${Object.keys(q.opsi).join('/')}`).join('; ') +
        (s.dasar_tersedia ? `; setiap dasar hanya boleh dari ${[...s.dasar_tersedia].join(', ')}.` : '.')
      : '- keputusan_didelegasikan kosong: tidak ada keputusan yang diserahkan kepadamu.',
    prioritas.length
      ? `- penerapan_prioritas wajib berisi tepat satu entri untuk masing-masing: ${prioritas.map(p => p.prioritas).join(', ')}; ` +
        `pengaruh hanya dari ${Object.keys(PENGARUH_PRIORITAS).join(', ')}; tp menunjuk nomor TP yang ada.`
      : '- penerapan_prioritas kosong: guru tidak meminta penekanan khusus.',
    '- tidak ada field tipe; setiap TP adalah bagian wajib ATP.',
    '',
    `Kembalikan HANYA satu objek JSON ${BENTUK_KANONIK} — keluaran penuh, bukan potongan, tanpa teks lain.`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 17. ORKESTRATOR — satu panggilan utama + PALING BANYAK satu perbaikan
// ─────────────────────────────────────────────────────────────────────────────
//
// Keputusan peninjau Pass 5: satu permintaan guru paling banyak DUA panggilan
// model. Sampai Pass 4 index.ts dapat menempuh perbaikan JSON lalu perbaikan
// validasi berurutan — tiga panggilan, tiga kali biaya, tanpa hasil. Batasnya
// kini tinggal di fungsi murni ini, sehingga dapat diuji tanpa jaringan dengan
// penghitung panggilan tiruan (tests/atp-kontrak.test.ts, AD).
//
// `panggil` adalah satu-satunya pintu ke model. Galat jaringan, batas waktu,
// dan pemotongan token DILEMPAR apa adanya — pemanggil yang memetakannya ke
// pesan guru.

export type PesanModel = { role: 'user' | 'assistant'; content: string };

export type PercobaanPenyusunan = {
  fase: 'utama' | 'perbaikan';
  teks: string;
  /** null bila keluaran dapat di-parse. */
  galat_parse: string | null;
  /** null bila keluaran tidak dapat di-parse. */
  validasi: HasilValidasi | null;
};

export type HasilPenyusunan = {
  ok: boolean;
  status: 'FIRST_PASS' | 'REPAIRED_ONCE' | 'FAILED_AFTER_REPAIR';
  /** Validasi percobaan TERAKHIR; null bila keluaran terakhirnya tidak dapat di-parse. */
  akhir: HasilValidasi | null;
  percobaan: PercobaanPenyusunan[];
  pesan_perbaikan: string | null;
};

export async function susunDenganSatuPerbaikan(
  panggil: (pesan: PesanModel[], fase: 'utama' | 'perbaikan') => Promise<string>,
  userMessage: string,
  s: SyaratValidasi,
): Promise<HasilPenyusunan> {
  const periksa = (teks: string, fase: 'utama' | 'perbaikan'): PercobaanPenyusunan => {
    try {
      return { fase, teks, galat_parse: null, validasi: validasiAtp(parseKeluaranModel(teks), s) };
    } catch (e) {
      return { fase, teks, galat_parse: (e as Error).message, validasi: null };
    }
  };

  const t1 = await panggil([{ role: 'user', content: userMessage }], 'utama');
  const p1 = periksa(t1, 'utama');
  if (p1.validasi?.valid) {
    return { ok: true, status: 'FIRST_PASS', akhir: p1.validasi, percobaan: [p1], pesan_perbaikan: null };
  }

  const masalah = p1.galat_parse
    ? [`[J1] keluaran bukan satu objek JSON yang sah: ${p1.galat_parse}`]
    : p1.validasi!.errors;
  const pesan = pesanPerbaikanAtp(masalah, s);
  const t2 = await panggil([
    { role: 'user', content: userMessage },
    { role: 'assistant', content: t1 },
    { role: 'user', content: pesan },
  ], 'perbaikan');
  const p2 = periksa(t2, 'perbaikan');
  const ok = !!p2.validasi?.valid;
  return {
    ok, status: ok ? 'REPAIRED_ONCE' : 'FAILED_AFTER_REPAIR',
    akhir: p2.validasi, percobaan: [p1, p2], pesan_perbaikan: pesan,
  };
}
