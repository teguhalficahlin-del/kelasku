// v=chat-20260910-atp1
'use strict';

const opts = pairs => pairs.map(([value, label]) => ({ value, label }));
const pilihan = (id, prompt, pairs, extra = {}) => ({
  id, kind: 'pilihan', prompt, options: opts(pairs), helpText: extra.helpText || '',
  skippable: false, ...extra,
});
const jamak = (id, prompt, pairs, extra = {}) => ({
  id, kind: 'pilihan_jamak', prompt, options: opts(pairs), helpText: extra.helpText || '',
  skippable: false, ...extra,
});
const angka = (id, prompt, min, max, extra = {}) => ({
  id, kind: 'angka', prompt, constraints: { min, max }, helpText: extra.helpText || '',
  skippable: false, ...extra,
});
const konfirmasi = (id, prompt, pairs, extra = {}) => ({
  id, kind: 'konfirmasi', prompt, options: opts(pairs), helpText: extra.helpText || '',
  skippable: false, ...extra,
});

// Daftar 50 program keahlian SMK dari cp-data.json, diurutkan A-Z.
// Dipakai sebagai pilihan chip di konfirmasi / koreksi program keahlian.
const PROGRAM_KEAHLIAN_OPTIONS = [
  'Agribisnis Perikanan', 'Agribisnis Tanaman', 'Agribisnis Ternak',
  'Agriteknologi Pengolahan Hasil Pertanian', 'Akuntansi dan Keuangan Lembaga',
  'Animasi', 'Broadcasting dan Perfilman', 'Busana',
  'Desain dan Produksi Kriya', 'Desain Komunikasi Visual',
  'Desain Pemodelan dan Informasi Bangunan', 'Kecantikan dan Spa',
  'Kehutanan', 'Kimia Analisis', 'Konstruksi dan Perawatan Bangunan Sipil',
  'Kuliner', 'Layanan Kesehatan', 'Manajemen Perkantoran dan Layanan Bisnis',
  'Nautika Kapal Niaga', 'Nautika Kapal Penangkap Ikan', 'Pekerjaan Sosial',
  'Pemasaran', 'Pengembangan Perangkat Lunak dan Gim', 'Perhotelan',
  'Seni Pertunjukan', 'Seni Rupa', 'Teknik Elektronika',
  'Teknik Energi Terbarukan', 'Teknik Furnitur', 'Teknik Geologi Pertambangan',
  'Teknik Geospasial', 'Teknik Jaringan Komputer dan Telekomunikasi',
  'Teknik Ketenagalistrikan', 'Teknik Kimia Industri',
  'Teknik Konstruksi dan Perumahan', 'Teknik Konstruksi Kapal',
  'Teknik Laboratorium Medik', 'Teknik Logistik', 'Teknik Mesin',
  'Teknik Otomotif', 'Teknik Pengelasan dan Fabrikasi Logam',
  'Teknik Perawatan Gedung', 'Teknik Perminyakan', 'Teknik Pesawat Udara',
  'Teknik Tekstil', 'Teknika Kapal Niaga', 'Teknika Kapal Penangkap Ikan',
  'Teknologi Farmasi', 'Usaha Layanan Pariwisata', 'Usaha Pertanian Terpadu',
].map(p => [p, p]);

const PROGRAM_KEAHLIAN_PAIRS = [
  ...PROGRAM_KEAHLIAN_OPTIONS,
  ['__lainnya__', 'Program keahlian saya tidak ada di daftar ini'],
];

const RANCANG_FLOW = {
  // ══════════════════════════════════════════════════════════════════════════
  // ALUR PERTANYAAN ATP — 21 definisi (A1–A20 + A15a)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Sumber tunggal: docs/SPEC-ATP-MODUL-BERBASIS-TEKS.md §4. Teks, pilihan,
  // percabangan, dan maksudnya diambil dari sana — bukan dirancang ulang.
  //
  // MENGGANTIKAN 48 pertanyaan ATP lama. Yang dibuang bukan sekadar dipangkas
  // demi ringkas; masing-masing punya sebab:
  //
  //   kegiatan_sudah_dikurangi, kegiatan_khusus, jp_kegiatan_khusus
  //     Kegiatan khusus ditanyakan dalam JP sementara cadangan ditanyakan dalam
  //     minggu. Pengurang dalam minggu selalu kelipatan JP per minggu; pengurang
  //     dalam JP tidak pernah dijamin begitu. SELURUH kelas masalah "ATP
  //     mustahil dipenuhi" lahir dari perbedaan satuan itu. A12 menyelesaikannya
  //     di hulu: yang ditanyakan adalah minggu pembelajaran BERSIH — libur,
  //     kegiatan sekolah, dan ujian sudah dikurangi guru sebelum ia mengetik.
  //
  //   perlengkapan_kelas
  //     ATP dan Modul berbasis teks (SPEC §1). Tidak ada alat yang perlu
  //     ditanyakan, karena tidak ada alat yang boleh dituntut. Larangannya kini
  //     mutlak dan diperiksa validator (kontrak.ts POLA_BAHAN_TERLARANG), bukan
  //     bergantung pada apa yang kebetulan guru centang.
  //
  //   status_data_awal, tindakan_tanpa_data, sebagian_data_uraian,
  //   perkiraan_kemampuan_awal, cara_pemetaan, jp_pemetaan
  //     Enam layar yang berputar di tempat yang sama: guru menyebut keadaan
  //     muridnya, lalu ditanya apakah ada datanya, lalu ditanya bagaimana
  //     mengukurnya, lalu ditanya berapa jam untuk mengukurnya. A5 menanyakan
  //     satu hal yang benar-benar dipakai — DASAR informasi kesiapan — karena
  //     itulah yang menentukan apakah profil murid boleh ditampilkan sebagai
  //     bukti atau harus ditandai sebagai asumsi (SPEC §2.1).
  //
  //   kesulitan_mode, kesulitan_teks_guru
  //     Diganti A6 (kondisi yang perlu dicatat) dan A7 (bantuan konkret yang
  //     diperlukan) — dua hal berbeda yang dulu tercampur jadi satu tebakan.
  //
  //   target_akhir_mode, target_akhir_teks, penguatan_elemen,
  //   target_kemandirian, konfirmasi_target
  //     Seluruh fase TARGET_FASE. Target akhir fase SUDAH dinyatakan CP; meminta
  //     guru menuliskannya ulang berarti mengundang target yang bertentangan
  //     dengan acuan resminya. Penekanan diatur A16.
  //
  //   timeline_tka, target_sekolah_detail, ranah_dunia_kerja, kebutuhan_bidang,
  //   batas_konteks, konfirmasi_dudi
  //     Empat daftar centang yang jawabannya hanya menjadi baris hiasan di
  //     prompt. A17 dan A18 menggantikannya dengan dua keputusan yang benar-benar
  //     mengubah isi TP.
  //
  // Setiap pertanyaan di bawah WAJIB punya entri di KONTRAK_PERTANYAAN
  // (supabase/functions/generate-atp/kontrak.ts). tests/atp-kontrak.test.ts
  // menggagalkan diri kalau ada yang tertinggal di salah satu sisi — supaya
  // "pertanyaan yang berbohong" tidak bisa lahir lagi tanpa ketahuan.

  KONTEKS_CP: [
    // A1 — satu layar, bukan dua.
    //
    // Dulu konfirmasi program keahlian dan konfirmasi CP adalah dua pertanyaan
    // berurutan yang menampilkan blok identitas yang sama persis. A1
    // menggabungkannya dan menambah satu rute yang sebelumnya tidak ada:
    // MENGHENTIKAN proses. Sampai sekarang "CP yang muncul bukan yang saya
    // gunakan" hanya menampilkan penjelasan lalu mengembalikan guru ke
    // pertanyaan yang sama — ia tidak punya jalan keluar selain menyetujui CP
    // yang ia sendiri nyatakan salah.
    pilihan('konfirmasi_konteks',
      'MiClass akan menyusun ATP untuk:\n\n{{mapel}} · {{nama_kelas}} · Fase {{fase}}\nProgram keahlian: {{program_keahlian}}\n\nCapaian Pembelajaran resmi untuk mata pelajaran dan fase inilah yang menjadi dasar seluruh Tujuan Pembelajaran.\n\nApakah data ini sudah sesuai?', [
        ['sesuai',          'Ya, sudah sesuai — lanjutkan'],
        ['perbaiki_data',   'Perbaiki data kelas atau program keahlian'],
        ['lihat_cp',        'Lihat CP lengkap dulu'],
        ['cp_tidak_sesuai', 'CP ini bukan yang saya gunakan'],
      ], { helpText: 'ATP mencakup satu fase penuh dan seluruh tuntutan CP-nya.' }),
    pilihan('pilih_program_keahlian',
      'Pilih program keahlian kelas ini:',
      PROGRAM_KEAHLIAN_PAIRS,
      { condition: { question_id: 'konfirmasi_konteks', value: 'perbaiki_data' },
        helpText: 'Pilih dari daftar atau pilih opsi paling bawah jika tidak ada.' }),
    { id: 'program_keahlian_teks_bebas', kind: 'teks_bebas',
      prompt: 'Tuliskan nama program keahlian kelas ini:',
      helpText: 'Tulis nama lengkap sesuai kurikulum. Contoh: Kimia Analisis, Nautika Kapal Penangkap Ikan, Agribisnis Tanaman Pangan dan Hortikultura.',
      skippable: false,
      condition: { question_id: 'pilih_program_keahlian', value: '__lainnya__' } },
  ],

  // ── PROFIL KELAS ────────────────────────────────────────────────────────
  // Fakta yang melekat pada KELAS, bukan pada satu ATP atau satu modul.
  // Disimpan di rancang_settings, ditanyakan sekali per kelas, dipakai ulang.
  //
  // Perlengkapan kelas DIBUANG dari sini — lihat catatan di kepala blok ini.
  PROFIL_KELAS: [
    // A2
    angka('jumlah_murid_kelas', 'Berapa murid di kelas ini?', 1, 60,
      { helpText: 'Menentukan apakah sebuah tujuan masih mungkin dicapai dan dinilai dalam jam yang tersedia.' }),
    // A3 — dukungan bahasa, bukan hanya bahasa pengantar.
    //
    // Kunci SENGAJA generik ("target"), bukan menyebut nama bahasa: gerbang Tab
    // Rancang berlaku untuk seluruh guru mapel umum SMK, dan menanam
    // 'inggris_penuh' di sini berarti satu migration lagi begitu guru Bahasa
    // Indonesia atau Bahasa Jepang masuk.
    pilihan('bahasa_pengantar',
      'Bahasa pengantar dan dukungan bahasa apa yang membantu murid memahami pelajaran ini?', [
        ['indonesia',              'Bahasa Indonesia sepenuhnya'],
        ['indonesia_dominan',      'Bahasa Indonesia — istilah dan contoh bahasa lain bila relevan'],
        ['campur',                 'Campuran Bahasa Indonesia dan bahasa lain yang relevan'],
        ['target_dominan',         'Sebagian besar bahasa lain yang relevan'],
        ['target_penuh',           'Sepenuhnya bahasa lain yang relevan'],
        ['tentukan_saat_menyusun', 'Tentukan saat menyusun'],
      ], { helpText: 'Menentukan bahasa judul TP dan bahasa seluruh Modul kelas ini.' }),
  ],

  PROFIL_SISWA: [
    // A4 — kunci nilai TIDAK BOLEH diubah.
    //
    // generate-modul membacanya untuk membagi menit antar tahap
    // (ARAHAN_TITIK_AWAL). Kunci yang tidak cocok tidak menimbulkan galat; ia
    // hanya membuat arahan itu diam-diam tidak pernah terpakai. 'belum_diketahui'
    // adalah nilai BARU dan sengaja tidak punya arahan di sana — modul kembali
    // ke perilaku lama, bukan menebak.
    pilihan('tingkat_kemampuan_awal',
      'Bagaimana kesiapan murid memulai fase ini?', [
        ['sesuai',           'Sebagian besar sudah siap'],
        ['sedikit_di_bawah', 'Perlu penyegaran singkat lebih dulu'],
        ['jauh_di_bawah',    'Banyak kemampuan dasar yang perlu dibangun'],
        ['sangat_beragam',   'Sangat beragam — ada yang siap, ada yang jauh tertinggal'],
        ['belum_diketahui',  'Belum diketahui'],
      ], { helpText: 'Perkiraan Anda sudah cukup — tidak perlu menunggu hasil tes.' }),
    // A5 — inilah yang menentukan apakah profil murid boleh ditampilkan
    // sebagai bukti atau harus ditandai sebagai asumsi (SPEC §2.1). Dilewati
    // bila A4 belum diketahui: tidak ada gambaran yang perlu dicari dasarnya.
    pilihan('dasar_informasi_kesiapan',
      'Gambaran kesiapan tadi Anda dasarkan pada apa?', [
        ['hasil_penilaian', 'Hasil penilaian atau pekerjaan murid'],
        ['pengamatan',      'Pengamatan dan pengalaman mengajar'],
        ['gabungan',        'Keduanya'],
        ['belum_cukup',     'Belum cukup informasi'],
      ], { condition: { question_id: 'tingkat_kemampuan_awal',
                        values: ['sesuai', 'sedikit_di_bawah', 'jauh_di_bawah', 'sangat_beragam'] },
        helpText: 'ATP akan menyebutkan dasar ini apa adanya. Gambaran yang berasal dari perkiraan tidak akan ditampilkan seolah berasal dari bukti.' }),
    // A6 — KONDISI murid. Berbeda dari A7, dan SPEC §4 menegaskan keduanya
    // tidak boleh diperlakukan sebagai pertanyaan yang sama.
    pilihan('kondisi_murid',
      'Adakah kondisi, kemampuan awal, atau kesulitan belajar yang perlu dicatat?', [
        ['tidak_ada', 'Tidak ada'],
        ['ada',       'Ada — saya uraikan'],
      ]),
    { id: 'kondisi_murid_uraian', kind: 'teks_bebas',
      prompt: 'Tuliskan singkat kondisi atau kesulitan belajar yang perlu dicatat.',
      helpText: 'Contoh: dua murid kesulitan membaca teks panjang; satu murid baru pindah dari sekolah lain.',
      skippable: false,
      condition: { question_id: 'kondisi_murid', value: 'ada' } },
    // A7 — BANTUAN yang harus diberikan. Jawabannya menjadi syarat yang harus
    // bisa dipenuhi di dalam TP, bukan catatan tambahan.
    jamak('bantuan_konkret', 'Bantuan konkret apa yang diperlukan murid? Pilih semua yang berlaku.', [
      ['memahami_bacaan',          'Memahami bacaan'],
      ['menjawab_lisan',           'Menjawab secara lisan'],
      ['menyusun_tulisan',         'Menyusun tulisan'],
      ['mengikuti_urutan',         'Mengikuti urutan kegiatan'],
      ['mempertahankan_perhatian', 'Mempertahankan perhatian'],
      ['lainnya',                  'Kebutuhan lain — saya uraikan'],
      ['tidak_ada',                'Tidak ada yang diketahui'],
      ['belum_diketahui',          'Belum diketahui'],
    ], { constraints: { exclusive: ['tidak_ada', 'belum_diketahui'] },
      helpText: 'TP yang disusun harus tetap bisa dicapai dengan bantuan ini tersedia.' }),
    { id: 'bantuan_konkret_lain', kind: 'teks_bebas',
      prompt: 'Bantuan lain apa yang murid perlukan?',
      helpText: 'Satu atau dua kalimat sudah cukup.',
      skippable: false,
      condition: { question_id: 'bantuan_konkret', value: 'lainnya' } },
  ],

  WAKTU: [
    // A8
    pilihan('tahun_pelajaran', 'ATP ini mulai digunakan tahun pelajaran berapa?', [
      ['2026/2027', '2026/2027'], ['2027/2028', '2027/2028'], ['lainnya', 'Tahun pelajaran lainnya'],
    ]),
    { id: 'tahun_pelajaran_lain', kind: 'teks_bebas',
      prompt: 'Tuliskan tahun pelajaran yang digunakan:',
      helpText: 'Contoh: 2028/2029',
      skippable: false,
      condition: { question_id: 'tahun_pelajaran', value: 'lainnya' } },
    // A9 — JP per minggu.
    //
    // SPEC A9 menyebut kemungkinan JP berbeda menurut tahun atau periode.
    // Bagian itu BELUM dilayani: ia bagian dari pekerjaan "fase lintas tahun"
    // yang SPEC §2.3 nyatakan berlaku setelah pekerjaannya selesai. Yang
    // ditanyakan sekarang satu angka untuk seluruh fase, dan perbedaan antar
    // semester diserap A12 lewat jumlah minggu masing-masing.
    angka('jp_per_minggu', 'Berapa JP mata pelajaran ini per minggu?', 1, 20,
      { helpText: 'Nilai dari jadwal ditampilkan otomatis jika tersedia.' }),
    // A10
    pilihan('durasi_jp', 'Berapa menit satu JP di sekolah Anda?', [
      ['45', '45 menit'], ['40', '40 menit'], ['35', '35 menit'], ['lain', 'Durasi lainnya'],
    ]),
    angka('durasi_jp_lain', 'Berapa menit durasi satu JP?', 30, 60,
      { condition: { question_id: 'durasi_jp', value: 'lain' } }),
    // A11 — satuan pertemuan. Angka ini menentukan kelipatan JP yang wajib
    // dipatuhi setiap TP; tanpanya MiClass tidak bisa membagi materi ke
    // pertemuan sama sekali.
    pilihan('pola_jadwal', 'Bagaimana pola pertemuannya dalam satu minggu?', [
      ['reguler_satu', 'Seluruh JP dalam satu pertemuan'],
      ['reguler_bagi', 'Dibagi beberapa pertemuan'],
      ['blok',         'Jadwal blok'],
    ]),
    angka('jp_per_sesi', 'Berapa JP dalam satu pertemuan atau sesi?', 1, 12,
      { condition: { question_id: 'pola_jadwal', values: ['reguler_bagi', 'blok'] },
        helpText: 'Contoh: jika 4 JP dibagi 2 pertemuan isi 2; jika satu sesi blok 8 JP isi 8.' }),
    // A12 — minggu pembelajaran BERSIH.
    //
    // "Bersih" berarti minggu yang benar-benar tersedia untuk pembelajaran
    // reguler setelah libur, kegiatan sekolah, ujian, dan pengurang kalender
    // lain dihitung. Ia BELUM mengurangi JP untuk penguatan prasyarat dan
    // cadangan — keduanya ditanyakan terpisah dan dipesan dari anggaran ini.
    pilihan('minggu_efektif_mode', 'Bagaimana jumlah minggu itu ditentukan?', [
      ['isi_sendiri',       'Saya isi sendiri dari kalender sekolah'],
      ['perkiraan_miclass', 'Gunakan perkiraan sementara MiClass (18 + 18 minggu)'],
    ], { helpText: 'Perkiraan sementara akan ditandai sebagai asumsi di hasil ATP, bukan disamarkan jadi data kalender.' }),
    angka('minggu_sem1', 'Berapa minggu pembelajaran bersih di semester 1?', 1, 24,
      { condition: { question_id: 'minggu_efektif_mode', value: 'isi_sendiri' },
        helpText: 'Setelah libur, kegiatan sekolah, dan ujian dikurangi.' }),
    angka('minggu_sem2', 'Berapa minggu pembelajaran bersih di semester 2?', 1, 24,
      { condition: { question_id: 'minggu_efektif_mode', value: 'isi_sendiri' },
        helpText: 'Setelah libur, kegiatan sekolah, dan ujian dikurangi.' }),
    // A13 — cadangan, dalam MINGGU.
    //
    // Satuannya minggu dan bukan JP, dan itu bukan selera: cadangan dalam
    // minggu selalu kelipatan JP per minggu sehingga tidak pernah merusak
    // pembagian ke pertemuan. Pengurang dalam JP selalu bisa.
    pilihan('cadangan_minggu', 'Apakah perlu menyisihkan waktu cadangan untuk gangguan tak terduga?', [
      ['0',    'Tidak ada'], ['1', 'Kurangi 1 minggu'], ['2', 'Kurangi 2 minggu'],
      ['lain', 'Tentukan sendiri'],
    ], { helpText: 'Satu minggu cadangan setara dengan JP per minggu Anda.' }),
    angka('cadangan_minggu_lain', 'Berapa minggu cadangan yang Anda tentukan?', 0, 10,
      { condition: { question_id: 'cadangan_minggu', value: 'lain' } }),
    // A14
    konfirmasi('konfirmasi_waktu',
      'Perhitungan waktu:\n\n{{ringkasan_waktu}}\n\nApakah sudah sesuai?', [
        ['ya',           'Ya, gunakan perhitungan ini'],
        ['ubah_minggu',  'Perbaiki minggu atau cadangan'],
        ['ubah_jp',      'Perbaiki JP atau pola pertemuan'],
      ], { helpText: 'Perhitungan ini deterministik — dilakukan MiClass, bukan AI.' }),
  ],

  PENGUATAN_PRASYARAT: [
    // A15
    pilihan('strategi_prasyarat', 'Kapan kemampuan dasar dikuatkan?', [
      ['awal',                   'Di awal, sebelum masuk materi fase'],
      ['terintegrasi',           'Saat topik yang membutuhkannya tiba'],
      ['kombinasi',              'Keduanya'],
      ['tidak_perlu',            'Tidak diperlukan'],
      ['tentukan_saat_menyusun', 'Tentukan saat menyusun'],
    ]),
    // A15a — hanya muncul bila A15 memang memerlukan penguatan.
    //
    // Guru yang memilih menguatkan SAAT MENGAJAR dulu tidak pernah ditawari
    // jam untuk itu: pertanyaannya dilewati, jatahnya nol, dan tidak ada satu
    // kata pun yang memberitahunya. Ia merencanakan pengulangan yang tidak
    // punya tempat di ATP-nya sendiri.
    pilihan('alokasi_prasyarat', 'Apakah penguatan itu memerlukan alokasi jam tersendiri?', [
      ['menyatu',    'Tidak — menyatu dengan jam topiknya'],
      ['tersendiri', 'Ya — sisihkan jam khusus'],
    ], { condition: { question_id: 'strategi_prasyarat', values: ['awal', 'terintegrasi', 'kombinasi'] },
      helpText: 'Jam khusus diambil dari jam mengajar, jadi jam untuk TP berkurang sebanyak itu.' }),
    angka('jp_prasyarat', 'Berapa JP disisihkan untuk penguatan kemampuan dasar?', 1, 24,
      { condition: { question_id: 'alokasi_prasyarat', value: 'tersendiri' },
        helpText: 'Jam ini dipesan lebih dulu dari anggaran, sebelum TP membagi sisanya.' }),
    // A16 — maksimal DUA, bukan tiga.
    //
    // Angkanya dari SPEC dan bukan penyeragaman: prioritas yang terlalu banyak
    // berhenti menjadi penekanan dan berubah jadi daftar keinginan yang tidak
    // bisa dipenuhi sekaligus dalam jam yang sama.
    jamak('target_prioritas', 'Bagian apa yang ingin lebih dikuatkan? Maksimal dua.', [
      ['kemampuan_dasar',   'Kemampuan dasar'],
      ['kehidupan_sehari',  'Penerapan di kehidupan sehari-hari'],
      ['pkl_kerja',         'Kesiapan PKL dan dunia kerja'],
      ['pendidikan_lanjut', 'Kesiapan pendidikan lanjut atau tes akademik'],
      ['kebutuhan_sekolah', 'Kebutuhan khusus sekolah — saya uraikan'],
      ['tidak_ada',         'Tidak ada yang perlu dikuatkan lebih'],
    ], { constraints: { maxSelections: 2, exclusive: ['tidak_ada'] },
      helpText: 'Penekanan mengatur porsi waktu dan urutan. Ia tidak menentukan bagian CP yang boleh diabaikan — seluruh tuntutan CP tetap dipetakan.' }),
    { id: 'target_prioritas_uraian', kind: 'teks_bebas',
      prompt: 'Tuliskan kebutuhan khusus sekolah yang perlu diperhatikan.',
      helpText: 'MiClass memeriksa kesesuaiannya dengan CP dan fase.',
      skippable: false,
      condition: { question_id: 'target_prioritas', value: 'kebutuhan_sekolah' } },
  ],

  KONTEKS_DUDI: [
    // A17
    pilihan('konteks_tugas', 'Contoh dan tugas lebih banyak mengambil situasi apa?', [
      ['seimbang',               'Seimbang antara kehidupan dan dunia kerja'],
      ['kehidupan',              'Lebih banyak kehidupan sehari-hari dan sekolah'],
      ['kerja',                  'Lebih banyak situasi kerja'],
      ['tentukan_saat_menyusun', 'Tentukan saat menyusun'],
    ], { helpText: 'Konteks kejuruan adalah arena penerapan. Ia tidak mengubah kompetensi yang dituntut mata pelajaran ini.' }),
    // A18
    pilihan('situasi_khusus', 'Adakah situasi yang ingin diutamakan atau justru dihindari?', [
      ['tidak_ada', 'Tidak ada'],
      ['ada',       'Ada — saya uraikan'],
    ]),
    { id: 'situasi_khusus_uraian', kind: 'teks_bebas',
      prompt: 'Tuliskan situasi yang ingin diutamakan atau dihindari.',
      helpText: 'Contoh: utamakan pelayanan pelanggan di toko; hindari situasi yang memakai data pribadi pelanggan.',
      skippable: false,
      condition: { question_id: 'situasi_khusus', value: 'ada' } },
    // A19 — enam metode resmi Tabel 3.3 "Cara-Cara Menyusun Alur Tujuan
    // Pembelajaran", Panduan Pembelajaran dan Asesmen 2025 hal. 23-24.
    //
    // Label memakai bahasa guru dengan contoh; istilah resminya tetap dicetak
    // di dokumen ATP — larangan jargon berlaku untuk pertanyaan di chat, bukan
    // untuk dokumen yang guru arsipkan (CLAUDE.md §23.2 poin 3).
    pilihan('metode_pengurutan', 'Bagaimana urutan pembelajaran disusun sepanjang fase?', [
      ['mudah_sulit',            'Dari yang mudah ke yang lebih sulit'],
      ['hierarki',               'Kemampuan dasar dulu, baru yang membutuhkannya'],
      ['konkret_abstrak',        'Dari contoh konkret ke konsep'],
      ['deduktif',               'Dari gambaran umum ke rincian'],
      ['prosedural',             'Mengikuti urutan satu prosedur kerja'],
      ['scaffolding',            'Bantuan berkurang bertahap menuju mandiri'],
      ['tentukan_saat_menyusun', 'Tentukan saat menyusun'],
    ], { helpText: 'Menentukan urutan TP, bukan jumlah jamnya. Mengacu Tabel 3.3 Panduan Pembelajaran dan Asesmen 2025.' }),
  ],

  ATP_SUMMARY: [
    // A20
    konfirmasi('persetujuan_atp_summary',
      'Ringkasan arah ATP:\n\n{{atp_summary}}\n\nApakah sudah sesuai?', [
        ['generate',       'Ya, susun ATP'],
        ['ubah_profil',    'Ubah profil murid'],
        ['ubah_waktu',     'Ubah waktu'],
        ['ubah_prasyarat', 'Ubah penguatan atau penekanan'],
        ['ubah_konteks',   'Ubah konteks atau pengurutan'],
      ], { helpText: 'Penyusunan hanya berjalan setelah persetujuan Anda.' }),
  ],

  ATP_GENERATE: [],

  ATP_REVIEW: [
    // Tindakan pascahasil — BUKAN definisi pertanyaan tambahan (SPEC §4 akhir).
    // Empat rute pertama diminta SPEC; tiga terakhir (pecah, gabung, buat
    // ulang) adalah tindakan yang memakan jatah harian dan sudah ada.
    pilihan('tindakan_review_atp', 'Bagaimana ATP ini ingin ditindaklanjuti?', [
      ['terima',           'Gunakan ATP ini'],
      ['tp_lebih_banyak',  'Perbaiki TP — pecah jadi lebih banyak'],
      ['tp_lebih_sedikit', 'Perbaiki TP — gabungkan jadi lebih sedikit'],
      ['ubah_konteks',     'Perbaiki urutan atau konteks'],
      ['waktu',            'Perbaiki waktu'],
      ['ubah_profil',      'Perbaiki profil murid'],
      ['ubah_prasyarat',   'Perbaiki penguatan atau penekanan'],
      ['ulang',            'Susun ulang dengan jawaban yang sama'],
    ], { helpText: 'Mengubah jawaban lalu menyusun ulang biasanya lebih tepat daripada menyusun ulang dengan jawaban yang sama.' }),
  ],


  // PILIH_TP sengaja KOSONG.
  //
  // Sampai 8 September 2026 di sini ada pertanyaan 'jumlah_pertemuan'
  // ("Berapa pertemuan yang akan digunakan untuk TP ini?"). Ia tidak pernah
  // sekali pun tampil di layar: sejak fb62f0f, mengeklik sebuah TP langsung
  // mengisi jawabannya dari jp_pertemuan milik ATP lalu melompat ke
  // KONTEKS_MODUL. generate-modul pun tidak membacanya — jumlah pertemuan
  // diturunkan dari selected_tp.jp_pertemuan.
  //
  // Layar fase ini dirender penyusun daftar TP tersendiri, bukan mesin
  // pertanyaan, jadi daftar kosong memang bentuk yang benar.
  PILIH_TP: [],

  KONTEKS_MODUL: [
    pilihan('konfirmasi_program_keahlian_modul',
      'Modul Ajar ini akan dibuat untuk:\n\n{{mapel}} · {{nama_kelas}} · Fase {{fase}}\nProgram Keahlian: {{program_keahlian}}\n\nSemua instrumen — kosakata, dialog, teks orientasi, kartu simulasi — akan menggunakan konteks dunia kerja {{program_keahlian}}.\n\nSudah benar?', [
        ['ya', 'Ya, lanjutkan'],
        ['tidak', 'Tidak, program keahlian perlu dikoreksi'],
      ], { helpText: 'Program keahlian menentukan kosakata, latar dialog, dan konteks dokumen kerja di seluruh modul.' }),
    pilihan('pilih_program_keahlian_modul',
      'Pilih program keahlian kelas ini:',
      PROGRAM_KEAHLIAN_PAIRS,
      { condition: { question_id: 'konfirmasi_program_keahlian_modul', value: 'tidak' },
        helpText: 'Pilih dari daftar atau pilih opsi paling bawah jika tidak ada.' }),
    { id: 'program_keahlian_teks_bebas_modul', kind: 'teks_bebas',
      prompt: 'Tuliskan nama program keahlian kelas ini:',
      helpText: 'Tulis nama lengkap sesuai kurikulum. Contoh: Kimia Analisis, Nautika Kapal Penangkap Ikan, Agribisnis Tanaman Pangan dan Hortikultura.',
      skippable: false,
      condition: { question_id: 'pilih_program_keahlian_modul', value: '__lainnya__' } },
    pilihan('kondisi_kelas_modul', 'Murid di kelas ini...', [
      ['reguler',            'Punya kemampuan yang mirip-mirip'],
      ['diferensiasi',       'Ada yang sudah lancar, ada yang masih kesulitan'],
      ['inklusif',           'Ada yang butuh pendampingan khusus'],
      ['campuran_kemampuan', 'Sebagian sedang PKL'],
    ]),
    // JALUR MUNDUR — pindah ke fase PROFIL_KELAS sejak 8 September 2026.
    // Hanya muncul untuk kelas yang belum punya profil (ATP yang dibuat sebelum
    // fase itu ada). Tanpa ini, guru dengan ATP lama kehilangan pertanyaannya
    // sama sekali dan modulnya berubah perilaku diam-diam.
    angka('jumlah_murid_kelas', 'Berapa murid di kelas ini?', 10, 60,
      { condition: { question_id: 'profil_kelas_lengkap', value: 'tidak' },
        helpText: 'Digunakan untuk merancang instrumen dan menentukan apakah kegiatan bisa dilakukan serentak atau bergantian.' }),
    // Dimensi Profil Lulusan — bagian dari IDENTIFIKASI menurut Panduan
    // Pembelajaran dan Asesmen 2025 hal. 27:
    //
    //   "Pendidik melakukan identifikasi yang meliputi kesiapan murid,
    //    karakteristik materi pelajaran, juga dimensi profil lulusan yang akan
    //    dicapai... Pendidik DAPAT MEMILIH dimensi yang relevan dengan tujuan
    //    pembelajaran dan karakteristik mata pelajaran yang diajarkan."
    //
    // Sampai 8 September 2026 guru tidak pernah ditanya, dan mesin tidak punya
    // daftarnya. Hasilnya: 11 dari 14 isian di produksi memakai nama dari
    // Profil Pelajar Pancasila yang sudah diganti, atau nama yang dikarang.
    //
    // Delapan nama di bawah dikutip dari hal. 5 dokumen itu. Kalau daftar ini
    // diubah, ubah juga DIMENSI_PROFIL_LULUSAN di generate-modul — keduanya
    // memang harus disunting berpasangan.
    jamak('dimensi_profil_lulusan', 'Dimensi Profil Lulusan mana yang ingin dikuatkan lewat modul ini? Pilih maksimal tiga.', [
      ['keimanan',    'Keimanan dan Ketakwaan terhadap Tuhan YME'],
      ['kewargaan',   'Kewargaan'],
      ['penalaran',   'Penalaran Kritis'],
      ['kreativitas', 'Kreativitas'],
      ['kolaborasi',  'Kolaborasi'],
      ['kemandirian', 'Kemandirian'],
      ['kesehatan',   'Kesehatan'],
      ['komunikasi',  'Komunikasi'],
      ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { constraints: { maxSelections: 3, exclusive: ['rekomendasi'] },
      helpText: 'Dimensi ini dicantumkan di Modul Ajar dan menjadi bagian yang dinilai. Delapan pilihan di atas adalah dimensi resmi Panduan Pembelajaran dan Asesmen 2025.' }),
    pilihan('target_kompetensi_modul', 'Target kompetensi utama modul ini?', [
      ['pemahaman',  'Pemahaman konsep'],
      ['keterampilan', 'Keterampilan praktis'],
      ['sikap',      'Pembentukan sikap atau karakter'],
      ['terpadu',    'Terpadu — pemahaman, keterampilan, dan sikap'],
      ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true }),
  ],

  SUMBER_STRATEGI: [
    // MENGGANTIKAN 'jenis_sumber' (8 September 2026, SPEC-REVISI-ALUR-PERTANYAAN §4a).
    //
    // Pertanyaan lama berbentuk DAFTAR CENTANG sumber belajar, dan jawabannya
    // berakhir sebagai satu baris hiasan: delapan modul di produksi diperiksa,
    // buku teks muncul hanya di daftar sumber — nol kali di kegiatan, naskah,
    // maupun instrumen. Yang jauh lebih merugikan adalah 'video': dua dari dua
    // modul yang gurunya mencentangnya MEMBANGUN KEGIATAN DI ATAS VIDEO YANG
    // TIDAK ADA, sampai ke naskah ("hentikan video pada momen kunci"). Video itu
    // tidak pernah dibuat MiClass. Guru berdiri di depan kelas dengan naskah
    // yang menyuruhnya memutar sesuatu yang tidak ia punya.
    //
    // Sebabnya bukan model membandel: menyuruh AI memakai buku atau video yang
    // isinya tidak pernah ia lihat hanya bisa dipatuhi dengan MENGARANG.
    // Karena itu pertanyaannya berubah dari daftar centang menjadi PEMBAGIAN
    // TUGAS — apa yang guru bawa sendiri, apa yang MiClass sediakan.
    //
    // Kunci lama 'jenis_sumber' SENGAJA tidak dipakai ulang: modul yang sudah
    // jadi menyimpannya di collected_data, dan generate-modul masih membacanya
    // sebagai jalur mundur. Dua kunci berbeda supaya keduanya tidak tertukar.
    jamak('bahan_guru', 'Bahan apa yang akan Anda siapkan sendiri untuk modul ini?', [
      ['buku_teks',   'Buku teks yang saya pakai'],
      ['video_audio', 'Video atau audio pilihan saya'],
      ['artikel',     'Artikel atau bacaan yang saya siapkan'],
      ['lingkungan',  'Lingkungan sekitar atau kunjungan ke dunia kerja'],
      ['narasumber',  'Narasumber dari industri'],
      ['lainnya',     'Bahan lain yang saya siapkan sendiri'],
      ['tidak_ada',   'Tidak ada — cukup bahan dari MiClass'],
    ], { constraints: { exclusive: ['tidak_ada'] },
      helpText: 'MiClass tidak tahu isi buku atau video Anda, jadi ia tidak akan menyandarkan kegiatan padanya. Bahan Anda dicatat sebagai pelengkap, dan modul tetap bisa dipakai walau Anda lupa membawanya.' }),
    { id: 'bahan_guru_lainnya', kind: 'teks_bebas',
      prompt: 'Bahan lain apa yang akan Anda siapkan? (contoh: jobsheet, contoh produk, kain perca)',
      helpText: 'Deskripsi singkat sudah cukup — bahan ini dicatat sebagai pelengkap, bukan sebagai dasar kegiatan.',
      skippable: false,
      condition: { question_id: 'bahan_guru', value: 'lainnya' } },
    // Ditanyakan eksplisit, tidak lagi disimpulkan dari centang sumber belajar.
    // Sebelumnya perangkatDigitalDiizinkan() menebak dari ada-tidaknya 'video'
    // atau 'modul_digital' di jenis_sumber — dua hal yang sama sekali berbeda:
    // guru bisa memutar video sesekali tanpa punya internet stabil, dan bisa
    // punya proyektor tanpa pernah memakai modul digital.
    // JALUR MUNDUR — lihat catatan di KONTEKS_MODUL. Pindah ke PROFIL_KELAS.
    jamak('perlengkapan_kelas', 'Perlengkapan apa yang benar-benar tersedia di kelas ini? Pilih semua yang ada.', [
      ['proyektor',      'Proyektor / LCD'],
      ['laptop_guru',    'Laptop atau komputer guru'],
      ['komputer_murid', 'Komputer atau laptop untuk murid'],
      ['hp_murid',       'HP murid boleh dipakai untuk belajar'],
      ['internet',       'Koneksi internet yang bisa diandalkan'],
      ['speaker',        'Speaker atau pengeras suara'],
      ['lab',            'Lab atau bengkel praktik'],
      ['printer',        'Printer atau mesin fotokopi untuk menggandakan lembar kerja'],
      ['tidak_ada',      'Tidak ada — hanya papan tulis dan alat tulis'],
    ], { condition: { question_id: 'profil_kelas_lengkap', value: 'tidak' },
      constraints: { exclusive: ['tidak_ada'] },
      helpText: 'Modul hanya akan menyebut alat yang Anda centang di sini. Yang tidak tersedia tidak akan diminta.' }),
    // JALUR MUNDUR — sepasang dengan perlengkapan_kelas di atas.
    //
    // Tanpa ini ada lubang yang mudah terlewat: bahasa_pengantar hanya
    // ditanyakan di PROFIL_KELAS, dan PROFIL_KELAS hanya dilewati jalur ATP.
    // Guru yang kelasnya sudah punya ATP lama lalu langsung menyusun Modul
    // tidak akan pernah ditanya, sehingga generate-modul tidak punya jawaban
    // dan language_policy kembali dikarang model — persis keadaan yang sedang
    // diperbaiki. Dua pertanyaan profil lainnya sudah punya jalur mundur;
    // yang ini tertinggal.
    pilihan('bahasa_pengantar', 'Bahasa apa yang Anda pakai saat mengajar kelas ini?', [
      ['indonesia',         'Bahasa Indonesia sepenuhnya'],
      ['indonesia_dominan', 'Bahasa Indonesia — bahasa target hanya untuk contoh dan latihan'],
      ['campur',            'Campur — penjelasan Indonesia, instruksi kelas bahasa target'],
      ['target_dominan',    'Bahasa target sebagian besar waktu, Indonesia saat murid kesulitan'],
      ['target_penuh',      'Bahasa target sepenuhnya'],
      ['rekomendasi',       'Minta rekomendasi MiClass'],
    ], { condition: { question_id: 'profil_kelas_lengkap', value: 'tidak' },
      aiRecommendation: true,
      helpText: 'Menentukan bahasa naskah dan instruksi untuk murid di seluruh Modul kelas ini.' }),
    pilihan('strategi_utama', 'Strategi pembelajaran utama yang digunakan?', [
      ['ceramah_diskusi', 'Guru menjelaskan, murid berlatih dan menerapkan (langsung)'],
      ['pbl',         'Murid mengerjakan proyek konkret yang bisa dipamerkan (berbasis proyek)'],
      ['inquiry',     'Murid menemukan sendiri melalui eksplorasi dan eksperimen (inkuiri)'],
      ['kolaboratif', 'Murid memecahkan masalah nyata dari dunia kerja (berbasis masalah)'],
      ['campuran',    'Murid belajar langsung di konteks dunia kerja atau industri (kontekstual)'],
      ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true }),
  ],

  ASESMEN_MODUL: [
    // --- Diagnostik ---
    pilihan('gunakan_diagnostik', 'Apakah modul ini perlu memetakan kemampuan awal murid sebelum pembelajaran dimulai?', [
      ['ya',     'Ya — saya ingin mengecek kemampuan awal murid dulu'],
      ['lewati', 'Lewati — langsung masuk ke pembelajaran'],
    ], { helpText: 'Diagnostik membantu guru menyesuaikan cara mengajar dengan kondisi murid nyata.' }),
    pilihan('teknik_diagnostik', 'Bagaimana cara mengetahui kemampuan awal murid?', [
      ['pemetaan_awal',  'Pemetaan awal — angket atau soal singkat untuk dipetakan'],
      ['tanya_jawab',    'Tanya jawab lisan / tes singkat di awal pertemuan'],
      ['observasi_awal', 'Observasi — amati murid saat mengerjakan tugas pembuka'],
      ['rekomendasi',    'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true,
      condition: { question_id: 'gunakan_diagnostik', value: 'ya' } }),

    // Instrumen diagnostik — SATU pertanyaan per teknik.
    //
    // Sampai 8 September 2026 instrumen tidak pernah dipilih guru untuk ketiga
    // jenis asesmen: instruksi_manifest di generate-modul menurunkannya sendiri
    // dari teknik. Panduan Pembelajaran dan Asesmen 2025 hal. 35 menetapkan
    // sebaliknya — "pendidik memilih dan/atau mengembangkan instrumen asesmen
    // sesuai tujuan" — dan hal. 31 meminta modul menuliskan TEKNIK DAN
    // INSTRUMEN, dua hal, bukan satu.
    //
    // Kenapa satu pertanyaan per teknik, bukan satu daftar gabungan: guru tidak
    // boleh bisa memilih pasangan yang bertengkar — teknik "observasi" dengan
    // instrumen "soal pilihan ganda". Yang kalah nanti akan diam, dan itu kelas
    // kesalahan yang berulang di proyek ini. Mesin fase sudah bisa menyaring
    // lewat condition; tidak ada mesin baru yang perlu dibuat.
    //
    // Teknik yang instrumennya hanya punya satu bentuk masuk akal SENGAJA tidak
    // ditanya (tes tertulis → soal; observasi → lembar pengamatan). Pertanyaan
    // dengan satu jawaban benar hanyalah ketukan tambahan bagi guru yang sibuk.
    pilihan('instrumen_diag_pemetaan', 'Dengan apa kemampuan awal itu dipetakan?', [
      ['pemetaan_awal',  'Kartu pemetaan — beberapa butir singkat per kemampuan'],
      ['soal_latihan',   'Soal singkat tertulis'],
      ['lembar_refleksi', 'Lembar isian yang diisi murid sendiri'],
      ['rekomendasi',    'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true,
      condition: { question_id: 'teknik_diagnostik', value: 'pemetaan_awal' },
      helpText: 'Instrumen inilah yang akan MiClass susun isinya dan bisa Anda cetak.' }),
    pilihan('instrumen_diag_tanya', 'Dengan apa jawaban lisan murid dicatat?', [
      ['dialog_baseline',  'Daftar pertanyaan lisan yang dipakai guru'],
      ['matriks_observasi', 'Lembar pengamatan — centang per murid'],
      ['rekomendasi',      'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true,
      condition: { question_id: 'teknik_diagnostik', value: 'tanya_jawab' },
      helpText: 'Instrumen inilah yang akan MiClass susun isinya dan bisa Anda cetak.' }),

    // --- Formatif ---
    pilihan('gunakan_formatif', 'Apakah guru ingin mengecek pemahaman murid selama proses belajar berlangsung?', [
      ['ya',     'Ya — saya ingin memantau pemahaman murid di tengah pembelajaran'],
      ['lewati', 'Lewati — tidak perlu asesmen selama proses'],
    ], { helpText: 'Cek pemahaman di tengah pembelajaran, bukan penilaian akhir.' }),
    // Sampai 8 September 2026 teknik formatif adalah SATU-SATUNYA dari ketiganya
    // yang tidak pernah ditanyakan: instruksi_manifest berbunyi "Formatif: AI
    // menentukan teknik dan penempatan". helpText pertanyaan di atas bahkan
    // menyatakannya terang-terangan kepada guru.
    pilihan('teknik_formatif', 'Bagaimana cara mengecek pemahaman murid di tengah pembelajaran?', [
      ['tanya_jawab',     'Tanya jawab lisan di sela kegiatan'],
      ['observasi',       'Mengamati murid saat mereka bekerja'],
      ['latihan_singkat', 'Latihan singkat yang langsung dikoreksi'],
      ['refleksi',        'Murid menuliskan sendiri apa yang belum ia pahami'],
      ['rekomendasi',     'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true,
      condition: { question_id: 'gunakan_formatif', value: 'ya' },
      helpText: 'Penempatannya di pertemuan mana tetap diatur MiClass sesuai jumlah pertemuan.' }),
    pilihan('instrumen_form_tanya', 'Dengan apa hasil tanya jawab itu dicatat?', [
      ['matriks_observasi', 'Lembar pengamatan — centang per murid'],
      ['dialog_model',      'Contoh percakapan sebagai acuan jawaban'],
      ['rekomendasi',       'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true,
      condition: { question_id: 'teknik_formatif', value: 'tanya_jawab' },
      helpText: 'Instrumen inilah yang akan MiClass susun isinya dan bisa Anda cetak.' }),
    pilihan('instrumen_form_latihan', 'Latihan singkatnya berbentuk apa?', [
      ['soal_latihan',     'Soal latihan'],
      ['lembar_praktikum', 'Lembar praktik — murid mengerjakan langkah kerja'],
      ['rekomendasi',      'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true,
      condition: { question_id: 'teknik_formatif', value: 'latihan_singkat' },
      helpText: 'Instrumen inilah yang akan MiClass susun isinya dan bisa Anda cetak.' }),

    // --- Sumatif ---
    pilihan('gunakan_sumatif', 'Apakah modul ini diakhiri dengan penilaian hasil belajar?', [
      ['ya',     'Ya — ada penilaian di akhir untuk mengukur ketercapaian TP'],
      ['lewati', 'Lewati — tidak ada penilaian akhir dalam modul ini'],
    ], { helpText: 'Sumatif menghasilkan nilai yang dilaporkan ke murid dan orang tua.' }),
    pilihan('teknik_sumatif', 'Bagaimana bentuk penilaian akhir murid?', [
      ['tes_tertulis',  'Tes tertulis — soal pilihan ganda atau uraian'],
      ['unjuk_kerja',   'Unjuk kerja / kinerja — murid menunjukkan kemampuan secara langsung'],
      ['proyek',        'Proyek / produk — murid menghasilkan karya yang dinilai'],
      ['praktikum',     'Praktikum — murid melakukan prosedur kerja di lab atau bengkel'],
      ['presentasi',    'Presentasi — murid menyampaikan hasil di depan kelas'],
      ['rekomendasi',   'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true,
      condition: { question_id: 'gunakan_sumatif', value: 'ya' } }),
    pilihan('instrumen_sum_unjuk', 'Dengan apa unjuk kerja itu dinilai?', [
      ['matriks_observasi', 'Lembar pengamatan berisi indikator penilaian'],
      ['kartu_peran',       'Kartu bermain peran — murid memerankan situasi kerja'],
      ['rekomendasi',       'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true,
      condition: { question_id: 'teknik_sumatif', value: 'unjuk_kerja' },
      helpText: 'Instrumen inilah yang akan MiClass susun isinya dan bisa Anda cetak.' }),
    pilihan('instrumen_sum_proyek', 'Dengan apa proyek murid dinilai?', [
      ['panduan_proyek',    'Panduan proyek lengkap dengan kriteria produk'],
      ['matriks_observasi', 'Lembar pengamatan berisi indikator penilaian'],
      ['rekomendasi',       'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true,
      condition: { question_id: 'teknik_sumatif', value: 'proyek' },
      helpText: 'Instrumen inilah yang akan MiClass susun isinya dan bisa Anda cetak.' }),
    pilihan('instrumen_sum_praktikum', 'Dengan apa praktikum murid dinilai?', [
      ['lembar_praktikum',  'Lembar praktik berisi langkah kerja dan analisis'],
      ['matriks_observasi', 'Lembar pengamatan berisi indikator penilaian'],
      ['rekomendasi',       'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true,
      condition: { question_id: 'teknik_sumatif', value: 'praktikum' },
      helpText: 'Instrumen inilah yang akan MiClass susun isinya dan bisa Anda cetak.' }),
    pilihan('instrumen_sum_presentasi', 'Dengan apa presentasi murid dinilai?', [
      ['matriks_observasi', 'Lembar pengamatan berisi indikator penilaian'],
      ['panduan_proyek',    'Panduan penyusunan bahan presentasi beserta kriterianya'],
      ['rekomendasi',       'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true,
      condition: { question_id: 'teknik_sumatif', value: 'presentasi' },
      helpText: 'Instrumen inilah yang akan MiClass susun isinya dan bisa Anda cetak.' }),
  ],

  MODUL_SUMMARY: [
    konfirmasi('persetujuan_modul_summary',
      'Ringkasan Modul Ajar siap disusun.\n\nApakah data modul sudah sesuai?', [
        ['generate',       'Ya, buat Modul Ajar'],
        ['ubah_konteks',   'Ubah kondisi kelas'],
        ['ubah_strategi',  'Ubah sumber & strategi'],
        ['ubah_asesmen',   'Ubah asesmen'],
      ], { helpText: 'Generate hanya berjalan setelah persetujuan guru.' }),
  ],

  MODUL_GENERATE: [],

  MODUL_REVIEW: [],
};

// V1 AKTIF: KONTEKS_CP sampai ATP_REVIEW.
//
// Urutannya mengikuti docs/SPEC-ATP-MODUL-BERBASIS-TEKS.md §4: identitas, kelas,
// murid, waktu, penguatan dan penekanan, konteks dan pengurutan, persetujuan.
//
// DUA FASE DIBUANG. 'PRIORITAS' dilebur ke PENGUATAN_PRASYARAT karena A20
// menyediakan SATU rute revisi untuk keduanya ("ubah penguatan atau
// penekanan") — dua fase di balik satu tombol berarti guru mendarat di tempat
// yang tidak ia minta. 'TARGET_FASE' dibuang seluruhnya: target akhir fase
// sudah dinyatakan CP, dan meminta guru menuliskannya ulang mengundang target
// yang bertentangan dengan acuan resminya.
const FASE_URUTAN_V1 = [
  'KONTEKS_CP',          // A1 — identitas kelas, program keahlian, gerbang CP
  'PILIH_ATP',           // pilih ATP yang ada (hanya mode sesuaikan)
  'PROFIL_KELAS',        // A2-A3 — jumlah murid, dukungan bahasa
  'PROFIL_SISWA',        // A4-A7 — kesiapan, dasarnya, kondisi, bantuan konkret
  'WAKTU',               // A8-A14 — tahun, JP, pola, minggu bersih, cadangan
  'PENGUATAN_PRASYARAT', // A15, A15a, A16 — penguatan dan penekanan
  'KONTEKS_DUDI',        // A17-A19 — konteks, situasi khusus, pengurutan
  'ATP_SUMMARY',         // A20 — persetujuan guru
  'ATP_GENERATE',        // otomatis — tidak ada pertanyaan
  'ATP_REVIEW',          // tindakan pascahasil
  'DONE',
];

// V2 — jangan render di UI
const FASE_URUTAN_V2 = [
  'KONTEKS_MODUL',
  'SUMBER_STRATEGI',
  'ASESMEN_MODUL',
  'MODUL_SUMMARY',
  'MODUL_GENERATE',
  'MODUL_REVIEW',
];

const FASE_URUTAN = [...FASE_URUTAN_V1, ...FASE_URUTAN_V2];

function unwrapAnswer(answer) {
  return answer && typeof answer === 'object' && Object.hasOwn(answer, 'value')
    ? answer.value : answer;
}

function conditionMatches(condition, collectedAnswers) {
  const answer = unwrapAnswer(collectedAnswers[condition.question_id]);
  const expected = condition.values || [condition.value];
  if (Array.isArray(answer)) return expected.some(value => answer.includes(value));
  return expected.includes(answer);
}

function getNextQuestion(currentPhase, currentQId, collectedAnswers) {
  const questions = RANCANG_FLOW[currentPhase] || [];
  const currentIdx = questions.findIndex(q => q.id === currentQId);
  if (currentIdx === -1) return null;
  for (let i = currentIdx + 1; i < questions.length; i++) {
    const q = questions[i];
    if (!q.condition || conditionMatches(q.condition, collectedAnswers)) return q;
  }
  return null;
}

function getNextPhase(currentPhase) {
  const idx = FASE_URUTAN.indexOf(currentPhase);
  if (idx === -1 || idx >= FASE_URUTAN.length - 1) return null;
  return FASE_URUTAN[idx + 1];
}
