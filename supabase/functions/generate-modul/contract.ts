// KONTRAK BENTUK KELUARAN MODUL AJAR — M3.
//
// Berkas ini MURNI dan tidak memanggil apa pun: ia hanya mendeskripsikan bentuk
// dokumen Modul, dan menghasilkan kerangka yang diminta dari model. Sama
// alasannya dengan anchor.ts dan warisan.ts — yang paling mahal kalau salah
// adalah hal yang dipakai di dua tempat sekaligus.
//
// MASALAH YANG DITUTUP (docs/MODULE-NASKAH-CONTRACT-LOCK.md §R).
// Sampai M2 ada EMPAT gambaran Modul yang hidup bersamaan:
//
//   1. `type ModulOutput`                — dihapus saat runtime, nol penegakan
//   2. `validateModulOutputV400()`       — satu-satunya yang benar-benar menegakkan
//   3. kerangka JSON di SYSTEM_PROMPT    — yang model lihat
//   4. renderer                          — yang guru lihat
//
// Keempatnya ditulis tangan dan tidak pernah saling memeriksa. Akibatnya nyata
// dan terukur (lihat docs/MODULE-M3-SCHEMA-AUTHORITY-REPORT.md §B): empat
// bagian akar yang prompt jelaskan panjang lebar tidak pernah diperiksa
// validator sama sekali, satu batas jumlah yang validator tuntut tidak pernah
// disebut prompt, dan tiga bagian yang M2 tambahkan ke dokumen final tidak
// pernah masuk ke tipenya.
//
// M3 menyatukan nomor 1–3. Nomor 4 — renderer — adalah M8.
//
// APA YANG BERKAS INI MILIKI, DAN APA YANG TIDAK.
// Ia memiliki BENTUK: versi schema, bagian akar mana yang ada, fase mana yang
// menghasilkannya, mana yang boleh null, batas jumlah yang bersifat struktural,
// enum yang bersifat struktural, dan kerangka JSON yang dikirim ke model.
// Ia TIDAK memiliki MUTU: kelayakan waktu, aritmetika durasi, rotasi kelompok,
// beban pengamatan guru, dan seluruh pemeriksaan semantik lain tetap imperatif
// di validator, tempatnya sudah terbukti bekerja. M3 tidak menggantinya dengan
// mesin schema generik — itu akan membuang yang berhasil demi yang rapi.

/** Versi bentuk dokumen Modul. SATU-SATUNYA tempat angka ini ditulis.
 *  M3 TIDAK menaikkannya: refactor bukan perubahan semantik keluaran. */
export const MODUL_SCHEMA_VERSION = '4.0.0';

/** Fase yang benar-benar menghasilkan sebuah bagian akar. `server` berarti
 *  backend yang mengisinya, bukan model — dan karena itu ia tidak pernah muncul
 *  di kerangka yang diminta. */
export type FasePenghasil = 'A' | 'B' | 'C' | 'B2' | 'D' | 'server';

export type FieldKontrak = {
  fase:      FasePenghasil;
  kind:      'object' | 'array' | 'string';
  /** Wajib ada di dokumen FINAL. */
  required:  boolean;
  /** Boleh bernilai null — dan itu KEADAAN SEKARANG, bukan cita-cita.
   *  Lihat catatan nullability di bawah. */
  nullable?: boolean;
  /** Panjang minimum array, bila memang struktural. */
  min?:      number;
  /** Kerangka JSON yang dikirim ke model. Inilah satu-satunya salinan:
   *  SYSTEM_PROMPT dan pesan perbaikan sama-sama dibangkitkan dari sini, jadi
   *  mengubah bentuk di sini mengubah keduanya sekaligus. Kosong untuk bagian
   *  yang backend isi sendiri. */
  bentuk?:   string;
  catatan?:  string;
};

// NULLABILITY — KEADAAN SEKARANG, BUKAN CITA-CITA.
//
// `asesmen_diagnostik` dan `asesmen_sumatif` boleh null karena keduanya memang
// pilihan guru. `asesmen_formatif` TIDAK lagi — M4 mencabut kebolehan itu.
//
// Dan inilah bukti bahwa M3 bekerja: pencabutannya dilakukan DI SINI SAJA, di
// satu `bentuk` dan satu `catatan`. SYSTEM_PROMPT, pesan perbaikan per fase,
// dan pesan perbaikan dokumen final ketiganya berubah tanpa disunting, karena
// ketiganya dibangkitkan dari objek ini. Sebelum M3 perubahan sekecil ini
// menuntut tiga suntingan tangan yang tidak pernah saling memeriksa.
//
// Menuliskan cita-cita di kontrak yang menggambarkan keadaan adalah cara
// tercepat membuat kontrak berbohong.

export const KONTRAK_ROOT: Record<string, FieldKontrak> = {
  schema_version: {
    fase: 'A', kind: 'string', required: true,
    bentuk: `"schema_version": ${JSON.stringify(MODUL_SCHEMA_VERSION)}`,
  },
  identitas: {
    fase: 'A', kind: 'object', required: true,
    bentuk: `"identitas": {
    "mata_pelajaran":string,"jenjang":string,"fase":string,
    "nomor_tp":integer,"jumlah_pertemuan":integer,"jp_per_pertemuan":integer,
    "durasi_jp_menit":integer,"alokasi_waktu_total_menit":integer,
    "elemen_cp":[string],"jenis_dokumen":string,
    "konteks_kejuruan":{"bidang_keahlian":string|null,"program_keahlian":string|null,"konsentrasi_keahlian":string|null},
    "dasar_cp":string,"tujuan_pembelajaran":string
  }`,
  },
  kktp: {
    fase: 'A', kind: 'array', required: true, min: 1,
    catatan: 'id_kktp WAJIB berurutan K1, K2, … sesuai posisinya. '
           + 'tuntutan_ref WAJIB memakai ID tuntutan CP dari warisan_atp.tp.tuntutan_cp — '
           + 'jangan mengarang ID baru, dan gabungan seluruh tuntutan_ref WAJIB menutup SEMUA tuntutan TP ini. '
           + 'keputusan_ketercapaian adalah bentuk TERUKUR dari ambang_batas: yang dipakai guru untuk memutuskan; '
           + 'ambang_batas tetap ada sebagai penjelasan yang guru baca. '
           + 'instrumen_bukti WAJIB berisi ID instrumen asesmen (ASM-xx) yang benar-benar mengumpulkan bukti KKTP ini.',
    bentuk: `"kktp": [{"id_kktp":"K1","kriteria":string,"tuntutan_ref":["<ID tuntutan CP>"],
    "keputusan_ketercapaian":{"jenis":<jenis_keputusan>,"nilai_minimum":number,"satuan":string,"deskripsi":string},
    "ambang_batas":string,"instrumen_bukti":["ASM-01"]}]`,
  },
  konteks_murid: {
    fase: 'A', kind: 'object', required: true,
    bentuk: `"konteks_murid": {"kesiapan_awal":[string],"variasi_kemampuan":string,"kebutuhan_dukungan":[string]}`,
  },
  materi_esensial: {
    fase: 'A', kind: 'object', required: true,
    bentuk: `"materi_esensial": {"lingkup_materi":[string],"kosakata_kunci":[string],"konsep_utama":[string]}`,
  },
  rencana_asesmen: {
    fase: 'A', kind: 'object', required: true,
    // ASESMEN FORMATIF TIDAK LAGI NULLABLE (M4).
    //
    // Sampai M3 ketiganya boleh null, karena guru ditanya "pakai formatif atau
    // tidak". Reviewer menutup pertanyaan itu: memeriksa pemahaman murid selama
    // proses belajar bukan fitur pilihan, dan jawaban guru sekarang adalah
    // PREFERENSI TEKNIK, bukan tombol nyala-mati. Diagnostik dan sumatif tetap
    // boleh null — keduanya memang pilihan.
    catatan: 'asesmen_formatif WAJIB berisi minimal 1 entri dan TIDAK BOLEH null — '
           + 'memeriksa pemahaman murid selama proses belajar selalu ada. '
           + 'Diagnostik dan sumatif boleh null sesuai pilihan guru. '
           + 'id formatif WAJIB berurutan FMT-01, FMT-02, … '
           + 'Setiap entri formatif WAJIB punya sub_langkah nyata di Fase B dengan asesmen_ref = id-nya. '
           + 'cakupan_bukti="per_murid" berarti bukti terkumpul per individu; "kelompok" berarti per kelompok. '
           + 'Setiap KKTP WAJIB punya minimal satu jalur bukti per_murid yang merujuknya. '
           + 'Asesmen diagnostik TIDAK dihitung sebagai bukti ketercapaian TP.',
    bentuk: `"rencana_asesmen": {
    "asesmen_diagnostik": null | {"tujuan":string,"teknik":string,"instrumen_ref":[string],"waktu":string,"penggunaan_hasil":string},
    "asesmen_formatif": [{"id":"FMT-01","waktu_pertemuan":integer,"fase_langkah":<nama_langkah>,"teknik":string,
      "instrumen_ref":["ASM-01"],"fungsi":string,"referensi_kktp":["K1"],
      "cakupan_bukti":<cakupan_bukti>,"umpan_balik":string}],
    "asesmen_sumatif": null | {"deskripsi":string,"teknik":string,"instrumen_ref":["ASM-01"],"durasi_menit":integer,
      "referensi_kktp":["K1"],"cakupan_bukti":<cakupan_bukti>,
      "placement":{"pertemuan":integer,"fase":<nama_langkah>}}
  }`,
  },
  // ── M6: JEJAK KEPUTUSAN KONTEKSTUAL ───────────────────────────────────────
  //
  // MENGAPA BAGIAN INI ADA.
  //
  // Sampai M5, konteks ATP (kesiapan murid, keputusan A17, penekanan guru,
  // program keahlian, jumlah murid) diwarisi ke `atp_context` dan dikirim ke
  // model — lalu berhenti di situ. Tidak ada satu pun field di dokumen yang
  // menautkan sebuah keputusan rancangan kembali ke konteks yang menyebabkannya.
  //
  // Akibatnya terukur: konteks dapat DIBALIK SELURUHNYA (kesiapan
  // `jauh_di_bawah` menjadi `jauh_di_atas`, A17 `dominan_kerja` menjadi
  // `dominan_sekolah`, seluruh penekanan guru dihapus) sementara rancangan
  // modulnya tidak berubah satu baris pun, dan dokumennya tetap lolos. Konteks
  // yang tidak dapat mengubah apa pun bukan konteks; ia hiasan.
  //
  // BATAS YANG TEGAS. Bagian ini menegakkan bahwa konteks DIPAKAI dan jejaknya
  // menunjuk hal-hal yang benar-benar ada. Ia TIDAK menilai apakah keputusannya
  // tepat secara pedagogis — apakah "tambah contoh bertahap" memang jawaban yang
  // benar untuk kesiapan `jauh_di_bawah` adalah pembacaan makna, dan itu M9.
  //
  // `required: false` DI SINI DISENGAJA. Pemeriksaan bentuk akar yang umum
  // berlaku untuk SEMUA dokumen termasuk yang historis, sedangkan bagian ini
  // hanya dituntut pada penyusunan sekarang. Penegakannya karena itu dinyalakan
  // pemanggil lewat `wajibKausalitasCurrent`, pola yang sama dengan
  // `wajibJejakWarisan` (M2), `wajibKontrakAsesmenCurrent` (M4), dan
  // `wajibResourceCurrent` (M5). Prompt tetap memintanya: `kerangkaFase()`
  // menyertakan setiap bagian yang punya `bentuk`, tanpa melihat `required`.
  keputusan_kontekstual: {
    fase: 'A', kind: 'array', required: false, min: 1,
    catatan: 'WAJIB untuk modul yang disusun sekarang. Satu entri = satu keputusan rancangan '
           + 'yang benar-benar disebabkan konteks ATP. id berurutan KTX-01, KTX-02, … '
           + 'sumber.kunci WAJIB nilai yang persis ada di warisan_atp.konteks — jangan mengarang. '
           // Nama enum dan nama field di pesan warisan tidak sama persis; tanpa
           // peta ini model harus menebak, dan tebakannya akan gagal validasi.
           + 'Petanya: kesiapan_murid→warisan_atp.konteks.kesiapan_murid.kunci, '
           + 'konteks_tugas→warisan_atp.konteks.konteks_contoh_dan_tugas.kunci, '
           + 'prioritas_guru→warisan_atp.konteks.penekanan_guru[].kunci, '
           + 'program_keahlian→warisan_atp.konteks.program_keahlian.nilai, '
           + 'jumlah_murid→warisan_atp.konteks.jumlah_murid.nilai. '
           + 'komponen_terdampak WAJIB menunjuk bagian modul yang benar-benar ada, memakai bentuk '
           + '"pertemuan:1", "sub_langkah:P1.MEMAHAMI.1", "kktp:K1", "asesmen:FMT-01", atau "instrumen:PBL-01". '
           + 'WAJIB ada minimal satu entri untuk kesiapan murid, satu untuk keputusan konteks tugas, '
           + 'dan satu untuk SETIAP penekanan guru yang ATP nyatakan berlaku bagi TP ini. '
           + 'Program keahlian dan jumlah murid boleh dijejakkan bila memang memengaruhi, '
           + 'tetapi TIDAK wajib — jangan memaksakan konteks kejuruan ke setiap kegiatan.',
    bentuk: `"keputusan_kontekstual":[
    {"id":"KTX-01","sumber":{"jenis":<jenis_sumber_konteks>,"kunci":string},
     "keputusan":string,"komponen_terdampak":["pertemuan:1"],"penerapan":string}
  ]`,
  },
  rancangan: {
    fase: 'A', kind: 'object', required: true,
    bentuk: `"rancangan": {
    "strategi_pedagogis":string,"sumber_belajar":[{"sumber":string,"kategori":string,"fungsi":string}],
    "pemanfaatan_digital":string,"lingkungan_pembelajaran":string,
    "kemitraan_pembelajaran":string|null,"keselamatan_k3":string|null
  }`,
  },
  metadata_pedagogis: {
    fase: 'A', kind: 'object', required: true,
    bentuk: `"metadata_pedagogis": {
    "dimensi_profil_lulusan":[{"dimensi":string,"alasan":string,"indikator":string}],
    "karakteristik_materi":{"faktual":string,"konseptual":string,"prosedural":string},
    "language_policy":{"teacher_instruction":string,"student_instruction":string,"target_language":string|null}
  }`,
  },
  manifest: {
    fase: 'A', kind: 'object', required: false,
    catatan: 'Kontrak internal pipeline: dipakai Fase B dan C, TIDAK ikut ke dokumen final.',
    bentuk: `"manifest": {
    "pembelajaran_manifest":[{"id":"PBL-01","jenis":<jenis_instrumen_pembelajaran>,"untuk_murid":true,"digunakan_pada":["P1.MENGAPLIKASI"]}],
    "asesmen_manifest":[{"id":"ASM-01","jenis":<jenis_instrumen_asesmen>,"untuk_murid":false,"digunakan_pada":["P1.ASESMEN_AWAL"]}]
  }`,
  },
  pertemuan: {
    fase: 'B', kind: 'array', required: true, min: 1,
    catatan: 'Panjangnya WAJIB sama dengan jumlah_pertemuan. Tulis sub_langkah TANPA field ref — backend yang mengisinya.',
    bentuk: `"pertemuan":[
    {
      "nomor":1,"tujuan_pertemuan":string,"media_dan_alat":[string],
      "langkah":[
        {"nama":<nama_langkah>,"durasi_menit":integer,"prinsip":[string],
         "sub_langkah":[{"nomor":1,"deskripsi":string,"durasi_menit":integer,
                         "instrumen_ref":[string],"asesmen_ref":"SUMATIF",
                         "mode_pelaksanaan":<mode_pelaksanaan>,"mode_observasi":<mode_observasi>,
                         "ukuran_kelompok":integer}]}
      ]
    }
  ]`,
  },
  instrumen_pembelajaran: {
    fase: 'C', kind: 'array', required: true,
    catatan: 'Isi HANYA ID yang ada di manifest. Array kosong bila manifestnya kosong.',
    bentuk: `"instrumen_pembelajaran":[
    {"id":"PBL-01","judul":string,"jenis":<jenis_instrumen_pembelajaran>,"untuk_murid":true,
     "digunakan_pada":["P1.MENGAPLIKASI"],"konten_murid":object|null,"panduan_guru":object|null}
  ]`,
  },
  instrumen_asesmen: {
    fase: 'C', kind: 'array', required: true,
    catatan: 'Isi HANYA ID yang ada di manifest. Array kosong bila manifestnya kosong.',
    bentuk: `"instrumen_asesmen":[
    {"id":"ASM-01","judul":string,"jenis":<jenis_instrumen_asesmen>,"untuk_murid":false,
     "digunakan_pada":["P1.ASESMEN_AWAL"],"konten_murid":object|null,"panduan_guru":object|null}
  ]`,
  },
  // ── NASKAH FASILITASI — LAPISAN PELAKSANA (M7) ───────────────────────
  //
  // Naskah adalah yang guru pegang SAAT MENGAJAR, sering dari layar HP. Ia bukan
  // Modul kedua, bukan ringkasan, dan bukan naskah yang dibaca kata demi kata.
  // Bentuknya lima hal yang guru perlukan dalam hitungan detik:
  //
  //   lakukan apa        → aksi_guru
  //   katakan apa        → ucapan_guru      (boleh kosong — tidak setiap saat perlu)
  //   tanyakan apa       → pertanyaan_kunci (boleh kosong)
  //   amati apa          → yang_diamati     (M7)
  //   lalu putuskan apa  → putusan_lanjut   (M7)
  //
  // DUA YANG TERAKHIR ADALAH TAMBAHAN M7, dan alasannya terukur: sampai M6
  // naskah dapat meliput 1 dari 24 sub-langkah, seluruh entrinya boleh kosong,
  // dan sub-langkah yang menjadi JANGKAR ASESMEN FORMATIF tidak wajib
  // memberitahu guru apa pun tentang apa yang harus diamati atau apa yang
  // dilakukan sesudahnya. Guru berdiri di depan kelas memegang lembar yang
  // menyuruhnya menilai, tanpa satu kata pun tentang menilai apa.
  //
  // `putusan_lanjut` vs `jika_kesulitan`: yang pertama adalah struktur keputusan
  // (dua cabang, wajib di jangkar FORMATIF — SUMATIF dikecualikan, lihat
  // ASESMEN_REF_TANPA_PUTUSAN), yang kedua tetap catatan bebas yang
  // sudah ada dan dipertahankan untuk dokumen lama serta renderer. Pembagian
  // yang sama dengan `keputusan_ketercapaian` vs `ambang_batas` di M4.
  //
  // NASKAH TIDAK PUNYA WAKTU SENDIRI. Tidak ada `durasi_menit` di sini, dan itu
  // disengaja: urutan dan durasi sudah ditetapkan `pertemuan[]`. Timeline kedua
  // hanya akan bertengkar dengan yang pertama.
  naskah_fasilitasi: {
    fase: 'B2', kind: 'array', required: true,
    catatan: 'Panjangnya WAJIB sama dengan jumlah_pertemuan. field "ref" disalin PERSIS dari sub_langkah[].ref yang dikirim. '
           + 'WAJIB ada TEPAT SATU entri untuk SETIAP sub_langkah di pertemuan[], dengan URUTAN yang sama — '
           + 'naskah yang melewati sebagian langkah membuat guru kehilangan panduan tepat di tengah mengajar. '
           + 'aksi_guru WAJIB berisi (itulah tindakan konkret guru). ucapan_guru dan pertanyaan_kunci BOLEH kosong — '
           + 'guru tidak perlu membaca naskah setiap saat. '
           + 'Untuk sub_langkah yang menjadi jangkar asesmen FORMATIF (asesmen_ref = FMT-xx), WAJIB ada '
           + 'yang_diamati DAN putusan_lanjut: formatif terjadi DI TENGAH pembelajaran, jadi guru harus tahu '
           + 'apa yang diamati dan apa langkah berikutnya saat itu juga, baik ketika murid sudah maupun belum mencapainya. '
           + 'Untuk asesmen_ref = SUMATIF keduanya TIDAK diwajibkan: hasil sumatif kerap baru dinilai setelah kelas '
           + 'usai, jadi memaksa keputusan di tempat akan mengarang kebiasaan yang tidak dilakukan guru. '
           + 'DILARANG menulis durasi atau menit di naskah — waktu sudah ditetapkan pertemuan[].',
    bentuk: `"naskah_fasilitasi":[
    {"nomor":1,
     "langkah":[{"nama":<nama_langkah>,
                 "sub_langkah":[{"ref":"P1.PEMBUKA.1","aksi_guru":[string],"ucapan_guru":[string],
                                 "pertanyaan_kunci":[string],"jika_kesulitan":[string],
                                 "yang_diamati":[string],
                                 "putusan_lanjut":{"jika_tercapai":string,"jika_belum":string}}]}]}
  ]`,
  },
  tindak_lanjut: {
    fase: 'D', kind: 'object', required: true,
    bentuk: `"tindak_lanjut":{"pilihan_dukungan":[string](minimal 3),"dukungan_terstruktur":[string](minimal 2),"tantangan_lanjutan":[string]}`,
  },
  catatan_guru: {
    fase: 'D', kind: 'array', required: true, min: 3,
    bentuk: `"catatan_guru":[string](minimal 3 butir)`,
  },

  // ── DIISI BACKEND, BUKAN MODEL (M2) ─────────────────────────────────────────
  // Ketiganya jejak pewarisan ATP yang M2 pakukan ke dokumen. Mereka BUKAN
  // metadata hiasan yang kebetulan menempel: dokumen Modul yang baru wajib
  // memilikinya, dan itulah yang membuat modul dapat membuktikan sendiri dari
  // CP versi apa dan tuntutan mana ia disusun. Model tidak pernah diminta
  // menghasilkannya — karena itu tanpa `bentuk`.
  //
  // `required: true` berlaku untuk DOKUMEN BARU. Modul yang disusun sebelum M2
  // tidak memilikinya, dan menuntutnya secara surut berarti menghakimi dokumen
  // lama dengan aturan yang belum ada ketika ia dibuat — persis yang M1 dan
  // M2.1 tolak lakukan. Karena itu penegakannya dinyalakan pemanggil
  // (`wajibJejakWarisan`), dan jalur penyusunan selalu menyalakannya.
  tp_anchor:      { fase: 'server', kind: 'object', required: true,
                    catatan: 'Potret TP dari ATP (M1/M2). Backend yang mengisi.' },
  atp_context:    { fase: 'server', kind: 'object', required: true,
                    catatan: 'Keputusan dan keadaan ATP yang diwarisi (M2). Backend yang mengisi.' },
  alokasi_server: { fase: 'server', kind: 'object', required: true,
                    catatan: 'Alokasi pertemuan sisi server (M2). Backend yang mengisi.' },
};

/** Enum yang bersifat STRUKTURAL — bentuk, bukan mutu. Nilai-nilainya dipakai
 *  validator DAN disisipkan ke kerangka prompt lewat penanda `<nama_enum>`,
 *  sehingga daftar yang model lihat tidak bisa berbeda dari yang ditegakkan. */
export const ENUM_KONTRAK: Record<string, readonly string[]> = {
  nama_langkah: ['PEMBUKA', 'ASESMEN_AWAL', 'MEMAHAMI', 'MENGAPLIKASI', 'MEREFLEKSI', 'PENUTUP'],
  mode_pelaksanaan: ['simultan', 'bergantian', 'individual', 'kelompok_kecil'],
  mode_observasi:   ['semua', 'sampel', 'rotasi', 'mandiri'],
  jenis_instrumen_pembelajaran: ['dialog_baseline', 'dialog_model', 'teks_autentik', 'kartu_peran', 'custom'],
  // M6 — dari mana sebuah keputusan rancangan berasal. Kelimanya adalah konteks
  // yang ATP wariskan; tidak ada sumber di luar daftar ini, dan tidak ada yang
  // boleh dikarang model.
  jenis_sumber_konteks: [
    'kesiapan_murid', 'konteks_tugas', 'prioritas_guru', 'program_keahlian', 'jumlah_murid',
  ],
  // M4 — bentuk keputusan ketercapaian dan cakupan bukti. Keduanya STRUKTURAL:
  // validator menegakkannya dan prompt melihat daftar yang sama.
  jenis_keputusan: ['jumlah', 'persentase', 'rubrik'],
  cakupan_bukti:   ['per_murid', 'kelompok'],
  jenis_instrumen_asesmen: [
    'pemetaan_awal', 'matriks_observasi', 'lembar_refleksi', 'soal_latihan',
    'lembar_praktikum', 'panduan_proyek', 'custom',
  ],
};

/** Urutan langkah pembelajaran, diturunkan dari enum yang sama. */
export const URUTAN_LANGKAH_KONTRAK = ENUM_KONTRAK.nama_langkah;

/** Bagian akar yang WAJIB ada di dokumen final. */
export function rootWajib(): string[] {
  return Object.entries(KONTRAK_ROOT)
    .filter(([, f]) => f.required)
    .map(([k]) => k);
}

/** Bagian akar yang dihasilkan sebuah fase — dasar tanggung jawab tiap fase. */
export function rootFase(fase: FasePenghasil): string[] {
  return Object.entries(KONTRAK_ROOT).filter(([, f]) => f.fase === fase).map(([k]) => k);
}

/** Mengganti penanda `<nama_enum>` dengan daftar nilainya. Ini yang membuat
 *  enum di prompt mustahil menyimpang dari enum yang divalidasi. */
function sisipkanEnum(teks: string): string {
  return teks.replace(/<([a-z_]+)>/g, (cocok, nama: string) => {
    const nilai = ENUM_KONTRAK[nama];
    return nilai ? nilai.map(v => JSON.stringify(v)).join('|') : cocok;
  });
}

/**
 * Kerangka keluaran satu fase, DIBANGKITKAN dari kontrak.
 *
 * Sampai M3 teks seperti ini ditulis tangan di SYSTEM_PROMPT, di samping
 * validator yang juga ditulis tangan. Sekarang keduanya berpangkal pada objek
 * yang sama: menambah bagian akar, mengubah namanya, menjadikannya wajib, atau
 * mengubah enumnya otomatis mengubah apa yang model lihat.
 */
export function kerangkaFase(fase: FasePenghasil): string {
  const bagian = Object.entries(KONTRAK_ROOT)
    .filter(([, f]) => f.fase === fase && f.bentuk);
  if (!bagian.length) return '';
  const isi = bagian.map(([, f]) => '  ' + sisipkanEnum(f.bentuk!)).join(',\n');
  const catatan = bagian
    .filter(([, f]) => f.catatan)
    .map(([k, f]) => `  - ${k}: ${f.catatan}`);
  return `FASE ${fase}:\n{\n${isi}\n}`
    + (catatan.length ? `\nCATATAN FASE ${fase}:\n${catatan.join('\n')}` : '');
}

/** Seluruh kerangka untuk kelima fase penghasil. */
export function kerangkaSeluruhFase(): string {
  return (['A', 'B', 'C', 'B2', 'D'] as const)
    .map(kerangkaFase).filter(Boolean).join('\n\n');
}

/** Daftar bagian akar per fase — ringkas, untuk bagian "hasilkan field apa". */
export function ringkasanTanggungJawabFase(): string {
  return (['A', 'B', 'C', 'B2', 'D'] as const)
    .map(f => `FASE "${f}" — hasilkan object dengan field: ${rootFase(f).join(', ')}`)
    .join('\n');
}

/**
 * Perintah struktural untuk pesan PERBAIKAN. Sengaja fungsi yang sama sumbernya
 * dengan kerangka di atas: sampai M3 pesan perbaikan hanya berbunyi "hasilkan
 * JSON object penuh yang sudah benar", tanpa menyebut bentuk apa pun, sehingga
 * model harus mengingat kerangka dari panggilan sebelumnya.
 *
 * DUA LINGKUP, SATU KONTRAK (M3.1).
 *
 * M3 memakai satu bentuk untuk kedua jalur perbaikan, dan itu keliru pada satu
 * di antaranya. Perbaikan JSON di `callPhase()` bekerja PER FASE: ia meminta
 * model menghasilkan ulang object satu fase saja. Menyertakan daftar seluruh
 * bagian akar dokumen di situ membuat pesannya membantah dirinya sendiri —
 * "hasilkan ulang HANYA object Fase B" disusul "field akar yang wajib ada:
 * schema_version, identitas, kktp, …, catatan_guru".
 *
 * Sekarang lingkupnya diberikan pemanggil, bukan ditebak. Tanpa argumen ia
 * berbicara tentang DOKUMEN FINAL (jalur perbaikan validasi); dengan `fase` ia
 * berbicara tentang keluaran fase itu saja.
 *
 * Perhatikan bedanya dari `rootWajib()`: lingkup fase memakai TANGGUNG JAWAB
 * fase, bukan daftar wajib dokumen final. `manifest` adalah contohnya — ia
 * keluaran nyata Fase A dan dipakai Fase B dan C, tetapi tidak ikut ke dokumen
 * final, sehingga daftar wajib final tidak memuatnya. Perbaikan Fase A yang
 * tidak menyebut manifest akan menghasilkan Fase A yang lumpuh.
 */
export function perintahPerbaikanStruktural(fase?: FasePenghasil): string {
  if (fase) {
    const milikFase = rootFase(fase).filter(k => KONTRAK_ROOT[k].fase !== 'server');
    const kerangka = kerangkaFase(fase);
    return [
      `Bentuk keluaran fase ini tidak berubah.`,
      `Field yang WAJIB ada di object Fase ${fase}: ${milikFase.join(', ')}.`,
      'Jangan menambahkan field akar milik fase lain, dan jangan menghapus atau mengganti nama field.',
      ...(kerangka ? ['Kerangka yang diminta:\n' + kerangka] : []),
    ].join(' ');
  }
  return [
    `Bentuk dokumen tidak berubah. schema_version tetap ${JSON.stringify(MODUL_SCHEMA_VERSION)}.`,
    `Field akar yang WAJIB ada: ${rootWajib().filter(k => KONTRAK_ROOT[k].fase !== 'server').join(', ')}.`,
    'Jangan menghapus, mengganti nama, atau menambah field akar.',
  ].join(' ');
}

// ══ M5 — KELENGKAPAN RESOURCE ═══════════════════════════════════════════════
//
// PRINSIP PRODUK: MiClass menyediakan seluruh bahan yang guru dan murid perlukan
// untuk MENJALANKAN Modul. Modul tidak boleh memindahkan pekerjaan membuat
// konten pembelajaran kepada guru — tidak ada "cari teks sendiri", tidak ada
// "siapkan contoh sendiri", dan tidak ada instrumen yang tinggal judul.
//
// APA YANG M5 TEGAKKAN, DAN APA YANG TIDAK.
//
//   resource ADA                  → ditegakkan M5 (field ada, tidak kosong)
//   resource DAPAT DIPAKAI        → ditegakkan M5 (jumlah butir minimum, sub-field
//                                    yang tanpa isinya butir itu tak berarti)
//   resource BERMUTU secara isi   → BUKAN M5. Itu M9.
//
// Karena itu di bawah TIDAK ADA ambang panjang teks, tidak ada pencocokan kata,
// dan tidak ada daftar kata kunci. Sebuah `isi_teks` berisi satu kata akan
// lolos M5 — dan itu memang benar: yang tahu bahwa satu kata bukan teks bacaan
// adalah pembaca, bukan penghitung karakter. Menaruh ambang di sini hanya akan
// berpura-pura menilai mutu, dan pengalaman repo ini sudah mahal soal itu
// (lihat pelajaran V14 di CLAUDE.md).
//
// HUBUNGANNYA DENGAN BENTUK_INSTRUMEN DI index.ts.
//
// `BENTUK_INSTRUMEN` adalah bentuk yang DIKIRIM KE MODEL, berupa potongan teks
// mirip TypeScript. Tabel di bawah adalah bentuk yang DITEGAKKAN VALIDATOR,
// berupa data. Keduanya sengaja tetap terpisah: menurunkan teks prompt dari
// tabel ini akan mengubah kalimat yang model lihat, dan perubahan itu tidak
// dapat diuji tanpa memanggil model. Yang menjaga keduanya tidak menyimpang
// adalah uji sinkron M5-SYNC — pola yang sama dengan `atp-acuan-sinkron.mjs`:
// kalau satu jenis ditambahkan di satu tempat dan tidak di tempat lain, uji itu
// gagal. Menambah jenis instrumen berarti menyunting KEDUANYA.

/** Bentuk satu field resource yang wajib berisi. */
export type FieldResource =
  /** String yang tidak boleh kosong setelah di-trim. */
  | { field: string; bentuk: 'teks' }
  /** Array string; minimal `min` butir, dan tiap butir tidak boleh kosong. */
  | { field: string; bentuk: 'daftar_teks'; min: number }
  /** Array objek; minimal `min` butir. `wajib` = sub-field string yang tanpa
   *  isinya butir itu tidak berarti. `objek_wajib` = sub-objek beserta
   *  sub-field-nya sendiri (mis. kartu peran: peran_a.instruksi_peran). */
  | { field: string; bentuk: 'daftar_objek'; min: number; wajib: string[];
      objek_wajib?: Record<string, string[]> };

export type SpesifikasiResource = {
  /** Yang murid perlukan untuk mengerjakan. Diperiksa bila `untuk_murid=true`. */
  murid: FieldResource[];
  /** Yang guru perlukan untuk MENJALANKAN atau MENILAI. Diperiksa hanya bila
   *  instrumennya benar-benar dipakai jalur asesmen — lihat catatan di bawah. */
  guru?: FieldResource[];
  /** M9: lembar yang MURID kerjakan — tanpa konten muridnya, tidak ada yang
   *  dapat dikerjakan. Jenis ini wajib untuk_murid=true pada dokumen baru. */
  muridWajib?: boolean;
};

// MENGAPA `guru` HANYA DIPERIKSA UNTUK INSTRUMEN ASESMEN YANG DIPAKAI.
//
// Panduan guru dituntut ketika guru tidak dapat menjalankan atau menilai tanpa
// nya: kunci jawaban untuk soal yang jawabannya objektif, rubrik untuk yang
// dinilai berrubrik, legenda dan kolom untuk lembar pengamatan, panduan
// penafsiran untuk pemetaan awal.
//
// Ia TIDAK dituntut untuk instrumen pembelajaran (dialog, teks, kartu peran).
// Di sana bahan muridnya sendiri yang menjadi kegiatannya, dan menuntut catatan
// fasilitasi untuk setiap lembar bacaan akan menjatuhkan modul yang sehat tanpa
// menambah satu pun hal yang guru butuhkan. Gerbang yang terlalu lebar memakan
// jatah generate guru — itu pelajaran yang sudah dibayar di milestone Naskah.

export const RESOURCE_WAJIB: Record<string, SpesifikasiResource> = {
  // ── Instrumen pembelajaran ────────────────────────────────────────────────
  dialog_baseline: {
    murid: [
      { field: 'petunjuk', bentuk: 'teks' },
      // Dua giliran adalah lantai bentuk, bukan selera: percakapan dengan satu
      // giliran bukan percakapan.
      { field: 'giliran', bentuk: 'daftar_objek', min: 2, wajib: ['pembicara', 'ucapan'] },
    ],
  },
  dialog_model: {
    murid: [
      { field: 'petunjuk', bentuk: 'teks' },
      { field: 'giliran', bentuk: 'daftar_objek', min: 2, wajib: ['pembicara', 'ucapan'] },
    ],
  },
  teks_autentik: {
    murid: [
      { field: 'isi_teks', bentuk: 'teks' },
      { field: 'pertanyaan_panduan', bentuk: 'daftar_teks', min: 1 },
    ],
  },
  kartu_peran: {
    murid: [
      { field: 'set', bentuk: 'daftar_objek', min: 1,
        wajib: ['nama_set', 'nama_entitas'],
        objek_wajib: { peran_a: ['instruksi_peran'], peran_b: ['instruksi_peran'] } },
    ],
  },

  // ── Instrumen asesmen ─────────────────────────────────────────────────────
  pemetaan_awal: {
    murid: [
      { field: 'petunjuk', bentuk: 'teks' },
      { field: 'item_soal', bentuk: 'daftar_objek', min: 1, wajib: ['kalimat_konteks', 'kata_target'] },
    ],
    guru: [
      { field: 'tujuan_diagnostik', bentuk: 'teks' },
      { field: 'panduan_interpretasi', bentuk: 'teks' },
    ],
  },
  matriks_observasi: {
    // Lembar pengamatan biasanya milik guru (untuk_murid=false), sehingga
    // konten_murid null dan isi yang dapat dipakai justru ada di panduan_guru.
    murid: [
      { field: 'petunjuk', bentuk: 'teks' },
      { field: 'kolom_indikator', bentuk: 'daftar_objek', min: 1, wajib: ['id', 'label'] },
    ],
    guru: [
      { field: 'kode_legend', bentuk: 'teks' },
      { field: 'kolom_indikator', bentuk: 'daftar_objek', min: 1, wajib: ['id', 'label'] },
      { field: 'catatan_kritis', bentuk: 'teks' },
    ],
  },
  lembar_refleksi: {
    murid: [
      { field: 'pertanyaan', bentuk: 'daftar_objek', min: 1, wajib: ['prompt'] },
    ],
    guru: [
      { field: 'panduan_interpretasi', bentuk: 'teks' },
    ],
  },
  soal_latihan: {
    // M9 (Skenario 1): soal_latihan bertanda untuk_murid=false lolos M5 dengan
    // kunci jawaban saja — pemeriksaan `murid` hanya berjalan bila untuk_murid
    // true, jadi soal yang murid kerjakan tidak pernah ada.
    muridWajib: true,
    murid: [
      { field: 'petunjuk', bentuk: 'teks' },
      { field: 'soal', bentuk: 'daftar_objek', min: 1, wajib: ['pertanyaan'] },
    ],
    guru: [
      { field: 'kunci_jawaban', bentuk: 'daftar_teks', min: 1 },
      { field: 'panduan_penskoran', bentuk: 'teks' },
    ],
  },
  lembar_praktikum: {
    murid: [
      { field: 'tujuan', bentuk: 'teks' },
      { field: 'alat_bahan', bentuk: 'daftar_teks', min: 1 },
      { field: 'langkah_kerja', bentuk: 'daftar_teks', min: 1 },
      { field: 'pertanyaan_analisis', bentuk: 'daftar_teks', min: 1 },
    ],
    guru: [
      { field: 'rubrik_penilaian', bentuk: 'teks' },
    ],
  },
  panduan_proyek: {
    murid: [
      { field: 'deskripsi_proyek', bentuk: 'teks' },
      { field: 'tahapan', bentuk: 'daftar_objek', min: 1, wajib: ['judul', 'instruksi'] },
      { field: 'kriteria_produk', bentuk: 'daftar_teks', min: 1 },
      { field: 'pertanyaan_refleksi', bentuk: 'daftar_teks', min: 1 },
    ],
    guru: [
      { field: 'rubrik_penilaian', bentuk: 'teks' },
    ],
  },
};

/** Jenis yang sengaja TIDAK punya spesifikasi bentuk: `custom` ada supaya guru
 *  tidak terkurung oleh sepuluh jenis di atas. Ia tetap tidak boleh kosong —
 *  penegakannya di validator, bukan di tabel ini, karena yang bisa dituntut
 *  hanyalah "ada isinya", bukan isi apa. */
export const JENIS_TANPA_SPESIFIKASI = ['custom'] as const;

/** Jumlah kunci jawaban WAJIB sama dengan jumlah soal.
 *
 *  Ini satu-satunya aturan M5 yang membandingkan dua resource, dan ia
 *  deterministik sepenuhnya: sembilan soal dengan tujuh kunci berarti guru
 *  berhenti di soal kedelapan tanpa tahu jawabannya. Tidak ada penafsiran yang
 *  terlibat — hanya dua bilangan yang harus sama. */
export const KUNCI_SEPADAN_SOAL = { jenis: 'soal_latihan', murid: 'soal', guru: 'kunci_jawaban' } as const;


// ══ M6 — BENTUK RUJUKAN KOMPONEN TERDAMPAK ══════════════════════════════════
//
// `komponen_terdampak` menunjuk bagian modul yang terkena sebuah keputusan.
// Bentuknya sengaja berupa awalan tetap, bukan kalimat bebas: yang dapat
// diperiksa secara deterministik hanyalah rujukan yang punya bentuk.
//
// Satu tabel ini dipakai validator DAN uji, sehingga daftar awalan yang sah
// tidak dapat menyimpang di antara keduanya.

export const AWALAN_KOMPONEN = {
  pertemuan:   'pertemuan',    // "pertemuan:1"           → nomor pertemuan yang ada
  sub_langkah: 'sub_langkah',  // "sub_langkah:P1.MEMAHAMI.1" → ref sub_langkah yang ada
  kktp:        'kktp',         // "kktp:K1"               → id_kktp yang ada
  asesmen:     'asesmen',      // "asesmen:FMT-01"        → entri rencana_asesmen yang ada
  instrumen:   'instrumen',    // "instrumen:PBL-01"      → id instrumen yang ada
} as const;

/** Sumber konteks yang WAJIB punya minimal satu jejak keputusan.
 *
 *  `program_keahlian` dan `jumlah_murid` sengaja TIDAK di sini:
 *  - konteks kejuruan tidak boleh dipaksakan ke setiap modul; ada TP yang
 *    memang tidak bertambah baik karena dikaitkan ke dunia kerja, dan memaksanya
 *    justru menghasilkan kaitan yang dibuat-buat;
 *  - jumlah murid sudah punya penegakan STRUKTURAL sendiri yang jauh lebih kuat
 *    daripada sebuah jejak kalimat (V3/V4/V4b: kelayakan waktu bergantian,
 *    slot sumatif per murid, dan individual+semua).
 *
 *  `prioritas_guru` tidak ada di daftar ini karena cakupannya tidak tetap:
 *  yang dituntut adalah setiap penekanan yang ATP nyatakan berlaku bagi TP INI,
 *  dan daftar itu hanya diketahui saat validasi. */
export const SUMBER_WAJIB_BERJEJAK = ['kesiapan_murid', 'konteks_tugas'] as const;


// ══ M7 — KONTRAK NASKAH FASILITASI ══════════════════════════════════════════
//
// Satu tabel untuk validator dan uji, sehingga daftar field tidak dapat
// menyimpang di antara keduanya.

/** Field naskah yang WAJIB berisi di setiap unit eksekusi. `aksi_guru` sendirian
 *  di sini dengan sengaja: guru selalu MELAKUKAN sesuatu di setiap langkah,
 *  tetapi tidak selalu perlu MENGATAKAN atau MENANYAKAN sesuatu. Mewajibkan
 *  ucapan di setiap sub-langkah akan memaksa naskah menjadi skrip yang dibaca
 *  kata demi kata — persis yang produk ini tolak. */
export const NASKAH_WAJIB = ['aksi_guru'] as const;

/** Field naskah yang boleh kosong, tetapi kalau ada isinya tidak boleh hampa. */
export const NASKAH_OPSIONAL = ['ucapan_guru', 'pertanyaan_kunci', 'jika_kesulitan'] as const;

/** Field yang WAJIB ada ketika sub-langkahnya menjadi jangkar asesmen FORMATIF. */
export const NASKAH_WAJIB_DI_JANGKAR = ['yang_diamati'] as const;

/** Kedua cabang keputusan lanjut. Dua-duanya wajib di jangkar FORMATIF: guru
 *  perlu tahu langkahnya baik ketika murid sudah mencapai maupun belum. */
export const CABANG_PUTUSAN = ['jika_tercapai', 'jika_belum'] as const;

/**
 * Jangkar asesmen yang TIDAK dituntut `yang_diamati` maupun `putusan_lanjut`.
 *
 * MENGAPA SUMATIF DIKECUALIKAN.
 *
 * Rantai formatif menuntut keputusan DI TEMPAT: asesmen formatif terjadi di
 * tengah pembelajaran, guru mengamati bukti, memutuskan tercapai atau belum,
 * lalu melakukan sesuatu sebelum pelajaran berlanjut. Tanpa `putusan_lanjut`
 * guru hanya mengukur.
 *
 * Sumatif tidak bekerja begitu. Guru kerap MENGUMPULKAN produk atau unjuk kerja
 * lalu menilainya setelah kelas usai — dan itu praktik yang sah, bukan
 * kelalaian. Menuntut keputusan di tempat untuk setiap sumatif berarti
 * mengarang kebiasaan yang guru memang tidak lakukan, lalu menolak modul yang
 * sehat karenanya.
 *
 * Versi pertama M7 memperlakukan keduanya sama, dan itu terlalu luas.
 *
 * Daftar ini sengaja hanya memuat SUMATIF. `DIAGNOSTIK` tidak dimasukkan karena
 * ia bukan nilai `asesmen_ref` yang dipakai sub_langkah mana pun: diagnostik
 * punya `waktu` berupa kalimat di `rencana_asesmen`, bukan jangkar di
 * `pertemuan[]`. Menambahkannya berarti mengecualikan sesuatu yang tidak ada.
 */
export const ASESMEN_REF_TANPA_PUTUSAN = ['SUMATIF'] as const;

/** Nama field yang menandakan naskah mencoba memiliki waktunya sendiri.
 *  Urutan dan durasi adalah milik `pertemuan[]`; timeline kedua hanya akan
 *  bertengkar dengan yang pertama. */
export const NASKAH_TERLARANG_WAKTU = ['durasi_menit', 'durasi', 'menit', 'waktu', 'alokasi_menit'] as const;
