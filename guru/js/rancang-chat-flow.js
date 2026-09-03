// v=chat-20260903f7
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
  KONTEKS_CP: [
    pilihan('konfirmasi_program_keahlian',
      'MiClass menemukan data kelas dan CP berikut:\n\n{{mapel}} · {{nama_kelas}} · Fase {{fase}}\nProgram Keahlian: {{program_keahlian}}\n\nATP akan menggunakan konteks dunia kerja yang relevan dengan program keahlian tersebut.\n\nApakah pemahaman ini sudah benar?', [
        ['ya', 'Ya, sudah benar'],
        ['tidak', 'Tidak, program keahlian perlu dikoreksi'],
      ], { helpText: 'Program keahlian menentukan konteks dunia kerja di seluruh ATP dan Modul Ajar.' }),
    pilihan('pilih_program_keahlian',
      'Pilih program keahlian kelas ini:',
      PROGRAM_KEAHLIAN_PAIRS,
      { condition: { question_id: 'konfirmasi_program_keahlian', value: 'tidak' },
        helpText: 'Pilih dari daftar atau pilih opsi paling bawah jika tidak ada.' }),
    { id: 'program_keahlian_teks_bebas', kind: 'teks_bebas',
      prompt: 'Tuliskan nama program keahlian kelas ini:',
      helpText: 'Contoh: Teknik Sepeda Motor, Agribisnis Holtikultura, Keperawatan.',
      skippable: false,
      condition: { question_id: 'pilih_program_keahlian', value: '__lainnya__' } },
    pilihan('konfirmasi_konteks',
      'Data kelas dan CP yang akan digunakan:\n\n{{mapel}} · {{nama_kelas}} · Fase {{fase}}\nProgram keahlian: {{program_keahlian}}\n\nApakah Capaian Pembelajaran yang akan digunakan sudah sesuai?', [
        ['sesuai', 'Ya, CP sudah sesuai — lanjutkan'],
        ['lihat_cp', 'Lihat ringkasan isi CP terlebih dahulu'],
        ['cp_tidak_sesuai', 'CP yang muncul bukan yang saya gunakan'],
      ], { helpText: 'ATP mencakup satu fase penuh dan seluruh elemen CP.' }),
  ],

  PRIORITAS: [
    jamak('target_prioritas', 'Apa prioritas utama siswa selama fase ini? Pilih maksimal tiga.', [
      ['fondasi_tka', 'Membangun fondasi TKA'], ['dunia_kerja', 'Kesiapan memasuki dunia kerja'],
      ['pkl', 'Kesiapan PKL'], ['sertifikasi', 'Kesiapan sertifikasi kompetensi'],
      ['pendidikan_lanjut', 'Kesiapan melanjutkan pendidikan'],
      ['literasi_numerasi', 'Literasi dan numerasi fungsional'],
      ['target_sekolah', 'Target khusus sekolah'], ['tidak_ada', 'Tidak ada prioritas khusus'],
      ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { constraints: { maxSelections: 3, exclusive: ['tidak_ada', 'rekomendasi'] }, aiRecommendation: true,
      helpText: 'Prioritas mengatur penekanan, bukan mengubah CP. Rekomendasi bersifat umum — Anda tetap bisa mengubahnya.' }),
    pilihan('timeline_tka', 'Bagaimana fondasi TKA ditempatkan dalam ATP ini?', [
      ['fase_ini', 'Dibangun selama fase ini'],
      ['lintas_fase', 'Dibangun pada fase ini dan dilanjutkan pada fase berikutnya'],
      ['lainnya', 'Tentukan target waktu lain'], ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { condition: { question_id: 'target_prioritas', value: 'fondasi_tka' }, aiRecommendation: true,
      helpText: 'Kelulusan TKA bukan hasil akhir langsung Fase E.' }),
    { id: 'timeline_tka_lain', kind: 'teks_bebas',
      prompt: 'Tuliskan target waktu untuk fondasi TKA:',
      helpText: 'Contoh: Diperkuat mulai semester genap, atau Ditargetkan selesai sebelum PKL.',
      skippable: false,
      condition: { question_id: 'timeline_tka', value: 'lainnya' } },
    { id: 'target_sekolah_detail', kind: 'teks_bebas',
      prompt: 'Tuliskan target khusus sekolah yang perlu diperhatikan.',
      helpText: 'MiClass memeriksa kesesuaiannya dengan CP dan fase.', skippable: false,
      condition: { question_id: 'target_prioritas', value: 'target_sekolah' } },
  ],

  WAKTU: [
    angka('jp_per_minggu', 'Berapa JP mata pelajaran ini per minggu?', 1, 20,
      { helpText: 'Nilai dari jadwal ditampilkan otomatis jika tersedia.' }),
    pilihan('durasi_jp', 'Berapa durasi satu JP di sekolah Anda?', [
      ['45', '45 menit'], ['40', '40 menit'], ['35', '35 menit'], ['lain', 'Durasi lainnya'],
    ]),
    angka('durasi_jp_lain', 'Berapa menit durasi satu JP?', 30, 60,
      { condition: { question_id: 'durasi_jp', value: 'lain' } }),
    pilihan('tahun_pelajaran', 'ATP ini digunakan untuk tahun pelajaran berapa?', [
      ['2026/2027', '2026/2027'], ['2027/2028', '2027/2028'], ['lainnya', 'Tahun pelajaran lainnya'],
    ]),
    { id: 'tahun_pelajaran_lain', kind: 'teks_bebas',
      prompt: 'Tuliskan tahun pelajaran yang digunakan:',
      helpText: 'Contoh: 2028/2029',
      skippable: false,
      condition: { question_id: 'tahun_pelajaran', value: 'lainnya' } },
    pilihan('minggu_efektif_mode', 'Bagaimana minggu efektif ditentukan?', [
      ['isi_sendiri', 'Isi sendiri'],
      ['cari_daerah', 'Dari kalender dinas pendidikan — isi jumlahnya sendiri'],
      ['standar_36', 'Gunakan asumsi sementara 36 minggu (18+18)'],
    ], { helpText: 'Data resmi dan asumsi disimpan dengan status berbeda.' }),
    angka('minggu_sem1', 'Berapa minggu efektif semester pertama?', 10, 22,
      { condition: { question_id: 'minggu_efektif_mode', values: ['isi_sendiri', 'cari_daerah'] },
        helpText: 'Cek kalender pendidikan dari dinas pendidikan provinsi Anda.' }),
    angka('minggu_sem2', 'Berapa minggu efektif semester kedua?', 10, 22,
      { condition: { question_id: 'minggu_efektif_mode', values: ['isi_sendiri', 'cari_daerah'] },
        helpText: 'Semester 2 biasanya 16–18 minggu efektif.' }),
    pilihan('kegiatan_sudah_dikurangi',
      'Apakah minggu efektif tersebut sudah mengurangi kegiatan khusus sekolah?', [
        ['sudah', 'Sudah — tidak ada pengurangan tambahan'],
        ['belum', 'Belum — ada kegiatan yang perlu dikurangi'],
        ['tidak_tahu', 'Belum diketahui — gunakan asumsi sementara'],
      ], { helpText: 'Mencegah pengurangan waktu dihitung dua kali.' }),
    jamak('kegiatan_khusus', 'Kegiatan apa yang masih mengurangi pembelajaran?', [
      ['pkl', 'PKL'], ['projek', 'Projek atau kegiatan sekolah'], ['asesmen', 'Ujian atau tes tambahan'],
      ['program', 'Kegiatan program keahlian'], ['libur', 'Libur khusus sekolah'],
      ['lainnya', 'Kegiatan lainnya'], ['belum_diketahui', 'Belum diketahui — sediakan cadangan umum'],
      ['tidak_ada', 'Tidak ada pengurangan tambahan'],
    ], { condition: { question_id: 'kegiatan_sudah_dikurangi', value: 'belum' },
      constraints: { exclusive: ['tidak_ada'] } }),
    angka('jp_kegiatan_khusus', 'Berapa total JP untuk kegiatan khusus tersebut?', 0, 200,
      { condition: { question_id: 'kegiatan_sudah_dikurangi', value: 'belum' } }),
    pilihan('cadangan_minggu', 'Berapa cadangan untuk gangguan tak terduga?', [
      ['0', 'Tidak ada cadangan'], ['1', '1 minggu'], ['2', '2 minggu'], ['3', '3 minggu'],
      ['lain', 'Tentukan sendiri'], ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true, helpText: 'Setiap minggu cadangan setara dengan JP per minggu Anda. Pilih sesuai kebiasaan sekolah.' }),
    angka('cadangan_minggu_lain', 'Berapa minggu cadangan yang Anda tentukan?', 0, 10,
      { condition: { question_id: 'cadangan_minggu', value: 'lain' } }),
    pilihan('pola_jadwal', 'Bagaimana pola JP dalam satu minggu?', [
      ['reguler_satu', 'Reguler — seluruh JP dalam satu pertemuan'],
      ['reguler_bagi', 'Reguler — dibagi beberapa pertemuan'],
      ['blok', 'Sistem blok'],
    ]),
    angka('jp_per_sesi', 'Berapa JP dalam satu pertemuan atau sesi?', 1, 12,
      { condition: { question_id: 'pola_jadwal', values: ['reguler_bagi', 'blok'] },
        helpText: 'Contoh: jika 4 JP dibagi 2 pertemuan isi 2; jika satu sesi blok 8 JP isi 8.' }),
    konfirmasi('konfirmasi_waktu',
      'Perhitungan waktu deterministik:\n\n{{ringkasan_waktu}}\n\nApakah perhitungan ini sudah sesuai?', [
        ['ya', 'Ya, gunakan perhitungan ini'], ['ubah', 'Ubah data waktu'],
      ], { helpText: 'Perhitungan dilakukan di JS, bukan AI.' }),
  ],

  PROFIL_SISWA: [
    pilihan('status_data_awal', 'Apakah data kemampuan awal siswa tersedia?', [
      ['aktual', 'Ya, saya sudah punya data kemampuan awal siswa'],
      ['sebagian', 'Ada sebagian data kemampuan awal siswa'],
      ['belum_ada', 'Belum ada data sama sekali'],
    ]),
    pilihan('tindakan_tanpa_data', 'Bagaimana titik awal kemampuan siswa ditentukan?', [
      ['pemetaan', 'Buat soal atau tugas untuk mengukur kemampuan awal'],
      ['observasi', 'Gunakan observasi pada pembelajaran awal'],
      ['perkiraan_guru', 'Isi sendiri berdasarkan pengalaman mengajar'],
      ['asumsi_cp', 'Anggap kemampuan awal sesuai deskripsi CP dan lanjutkan'],
      ['simulasi', 'Gunakan data simulasi (tidak disimpan sebagai data siswa nyata)'],
      ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { condition: { question_id: 'status_data_awal', value: 'belum_ada' }, aiRecommendation: true,
      helpText: 'Simulasi tidak disimpan sebagai data aktual.' }),
    { id: 'perkiraan_kemampuan_awal', kind: 'teks_bebas',
      prompt: 'Bagaimana Anda menggambarkan kemampuan awal siswa saat ini?',
      helpText: 'Contoh: Sebagian besar siswa bisa memahami teks pendek, tapi belum mampu menulis paragraf mandiri.',
      skippable: false,
      condition: { question_id: 'tindakan_tanpa_data', value: 'perkiraan_guru' } },
    pilihan('cara_pemetaan', 'Bagaimana pemetaan awal dilakukan?', [
      ['diagnostik', 'Tes singkat untuk mengetahui kemampuan awal'], ['observasi', 'Observasi awal'],
      ['tugas_singkat', 'Tugas pemetaan singkat'], ['terpadu', 'Gabungan tes, observasi, dan tugas'],
      ['rekomendasi', 'Minta rekomendasi paling efisien'],
    ], { condition: { question_id: 'tindakan_tanpa_data', value: 'pemetaan' }, aiRecommendation: true }),
    angka('jp_pemetaan', 'Berapa JP yang digunakan untuk pemetaan awal?', 1, 12,
      { condition: { question_id: 'tindakan_tanpa_data', value: 'pemetaan' },
        helpText: 'JP pemetaan diambil dari JP efektif yang tersedia — bukan tambahan. Semakin banyak JP pemetaan, semakin sedikit yang tersisa untuk mengajar TP.' }),
    pilihan('tindakan_instrumen', 'Apa yang dilakukan dengan instrumen pemetaan?', [
      ['buat_sekarang', 'Minta MiClass membuat soalnya saat ATP selesai'],
      ['gunakan_ada', 'Pakai soal yang sudah saya punya'],
      ['catat_lanjut', 'Catat rencana dan lanjutkan ATP'], ['ubah', 'Ubah metode atau alokasi pemetaan'],
    ], { condition: { question_id: 'tindakan_tanpa_data', value: 'pemetaan' } }),
    pilihan('kesulitan_mode', 'Bagaimana kesulitan siswa yang perlu diantisipasi ditentukan?', [
      ['asumsi_umum', 'Gunakan perkiraan umum untuk siswa kelas fase ini'],
      ['perkiraan_guru', 'Isi sendiri berdasarkan pengalaman mengajar'],
      ['belum_diketahui', 'Belum diketahui — jangan tetapkan kesulitan khusus'],
      ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true, helpText: 'Tanpa hasil aktual, kesulitan berstatus asumsi.' }),
    { id: 'kesulitan_teks_guru', kind: 'teks_bebas',
      prompt: 'Tuliskan kesulitan yang Anda perkirakan akan dihadapi siswa. Pisahkan dengan koma jika lebih dari satu.',
      helpText: 'Contoh: siswa kesulitan membaca teks panjang, kosakata terbatas.',
      skippable: false,
      condition: { question_id: 'kesulitan_mode', value: 'perkiraan_guru' } },
  ],

  TARGET_FASE: [
    pilihan('target_akhir_mode', 'Bagaimana target akhir fase ditentukan?', [
      ['rekomendasi', 'Minta rekomendasi berdasarkan CP dan profil siswa'],
      ['target_guru', 'Masukkan target sendiri'],
    ]),
    { id: 'target_akhir_teks', kind: 'teks_bebas', prompt: 'Tuliskan target akhir fase yang ingin digunakan.',
      helpText: 'Contoh: Siswa mampu membaca instruksi kerja sederhana dan meresponsnya secara mandiri. MiClass memeriksa kesesuaian dan keterukurannya.',
      skippable: false,
      condition: { question_id: 'target_akhir_mode', value: 'target_guru' } },
    pilihan('penguatan_elemen', 'Elemen mana yang perlu mendapat penguatan lebih besar?', [
      ['seimbang', 'Seimbang pada seluruh elemen'], ['menyimak_berbicara', 'Menyimak–Berbicara'],
      ['membaca_memirsa', 'Membaca–Memirsa'], ['menulis_presentasi', 'Menulis–Mempresentasikan'],
      ['setelah_pemetaan', 'Tentukan setelah hasil pemetaan'], ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true, helpText: 'Elemen adalah komponen Capaian Pembelajaran — misalnya Menyimak–Berbicara dan Membaca–Memirsa. Semua elemen tetap dicakup, hanya porsi penekanannya yang berbeda.' }),
    pilihan('target_kemandirian', 'Di akhir fase ini, kemandirian seperti apa yang ingin Anda capai untuk siswa dalam menggunakan {{mapel}}?', [
      ['panduan', 'Masih butuh contoh dan panduan guru'],
      ['bantuan_terbatas', 'Bisa mandiri dengan sedikit bantuan'],
      ['mandiri_dikenal', 'Mandiri di situasi yang sudah pernah dilatih'],
      ['mandiri_baru', 'Mandiri meski di situasi baru yang belum pernah dilatih'],
      ['rekomendasi', 'Minta rekomendasi berdasarkan CP dan profil'],
    ], { aiRecommendation: true }),
    konfirmasi('konfirmasi_target',
      'Ringkasan target fase:\n\n{{ringkasan_target}}\n\nApakah arah target fase sudah sesuai?', [
        ['ya', 'Ya, lanjutkan'], ['ubah', 'Ubah target fase'],
      ]),
  ],

  KONTEKS_DUDI: [
    pilihan('kekuatan_konteks', 'Seberapa kuat konteks program keahlian digunakan dalam ATP?', [
      ['seimbang', 'Seimbang — dunia kerja dan kehidupan sehari-hari'], ['dominan', 'Dominan kejuruan'],
      ['terbatas', 'Hanya pada bagian pelajaran yang memang relevan'], ['tidak_prioritas', 'Tidak diprioritaskan'],
      ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true, helpText: 'Kontekstualisasi tidak mengubah CP.' }),
    jamak('ranah_dunia_kerja', 'Ranah dunia kerja mana yang diprioritaskan? Pilih maksimal lima.', [
      ['k3', 'Keselamatan dan kesehatan kerja'], ['komunikasi_prof', 'Komunikasi profesional'],
      ['kerja_tim', 'Kerja sama tim'], ['pelayanan', 'Pelayanan pelanggan'],
      ['dokumentasi', 'Dokumentasi dan pelaporan'], ['literasi_digital', 'Literasi digital'],
      ['pemecahan', 'Pemecahan masalah'], ['mutu', 'Mutu layanan'], ['etika', 'Etika kerja'],
      ['wirausaha', 'Kewirausahaan'], ['data', 'Penggunaan data'],
      ['tidak_ada', 'Tidak ada ranah khusus'], ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { constraints: { maxSelections: 5, exclusive: ['tidak_ada', 'rekomendasi'] }, aiRecommendation: true,
      condition: { question_id: 'kekuatan_konteks', values: ['seimbang', 'dominan', 'terbatas', 'rekomendasi'] } }),
    jamak('kebutuhan_bidang', 'Kebutuhan bidang apa yang perlu diperhatikan?', [
      ['kosakata', 'Kosakata atau istilah dasar bidang'], ['dokumen', 'Dokumen kerja sederhana'],
      ['prosedur', 'Prosedur kerja'], ['teknologi', 'Perangkat atau teknologi bidang'],
      ['komunikasi', 'Komunikasi dengan pelanggan atau rekan kerja'],
      ['etika_data', 'Etika dan kerahasiaan informasi'], ['tidak_ada', 'Tidak ada kebutuhan khusus'],
      ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { constraints: { exclusive: ['tidak_ada', 'rekomendasi'] }, aiRecommendation: true,
      condition: { question_id: 'kekuatan_konteks', values: ['seimbang', 'dominan', 'terbatas', 'rekomendasi'] } }),
    jamak('batas_konteks', 'Batas apa yang diterapkan saat menggunakan konteks kejuruan?', [
      ['tanpa_batas', 'Tidak ada batasan khusus'],
      ['hindari_belum_dipelajari', 'Hindari materi produktif yang belum dipelajari'],
      ['hindari_sensitif', 'Hindari data atau dokumen sensitif'],
      ['penerapan_saja', 'Gunakan konteks dunia kerja hanya sebagai contoh, bukan target belajar'],
      ['bukan_target_produktif', 'Jangan jadikan kompetensi produktif sebagai target mapel'],
      ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { constraints: { exclusive: ['tanpa_batas', 'rekomendasi'] }, aiRecommendation: true,
      condition: { question_id: 'kekuatan_konteks', values: ['seimbang', 'dominan', 'terbatas', 'rekomendasi'] } }),
    konfirmasi('konfirmasi_dudi',
      'Ringkasan konteks kejuruan:\n\n{{ringkasan_dudi}}\n\nApakah pengaturan konteks sudah sesuai?', [
        ['ya', 'Ya, lanjutkan'], ['ubah', 'Ubah konteks kejuruan'],
      ]),
  ],

  PENGUATAN_PRASYARAT: [
    pilihan('strategi_prasyarat', 'Apakah ada kemampuan dasar yang perlu diulang sebelum masuk ke materi baru?', [
      ['awal', 'Di awal semester, sebelum masuk materi baru'],
      ['terintegrasi', 'Saat mengajar, tepat sebelum bagian yang membutuhkannya'],
      ['kombinasi', 'Keduanya — di awal semester dan saat mengajar'],
      ['tidak_perlu', 'Tidak perlu — siswa sudah siap'], ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true }),
    angka('jp_prasyarat', 'Berapa JP yang digunakan untuk penguatan awal?', 1, 24,
      { condition: { question_id: 'strategi_prasyarat', values: ['awal', 'kombinasi'] },
        helpText: 'Penguatan terintegrasi tetap di dalam alokasi TP.' }),
  ],

  ATP_SUMMARY: [
    konfirmasi('persetujuan_atp_summary',
      'Pratinjau arah ATP:\n\n{{atp_summary}}\n\nApakah arah ATP sudah sesuai?', [
        ['generate', 'Ya, buat draf ATP'], ['ubah_prioritas', 'Ubah prioritas'],
        ['ubah_waktu', 'Ubah alokasi waktu'], ['ubah_profil', 'Ubah profil siswa'],
        ['ubah_target', 'Ubah target fase'], ['ubah_konteks', 'Ubah konteks kejuruan'],
        ['ubah_prasyarat', 'Ubah pengulangan kemampuan dasar'],
      ], { helpText: 'Generate hanya berjalan setelah persetujuan guru.' }),
  ],

  ATP_GENERATE: [],

  ATP_REVIEW: [
    pilihan('tindakan_review_atp', 'Bagaimana draf ATP ingin ditindaklanjuti?', [
      ['terima',         'Terima ATP ini'],
      ['waktu',          'Tinjau distribusi waktu'],
      ['ulang',          'Buat ulang ATP'],
      ['ubah_prioritas', 'Ubah prioritas'],
      ['ubah_target',    'Ubah target fase'],
    ]),
  ],

  PILIH_TP: [
    angka('jumlah_pertemuan', 'Berapa pertemuan yang akan digunakan untuk TP ini?', 1, 30,
      { helpText: 'Pertemuan = satu sesi pembelajaran sesuai jadwal kelas.' }),
  ],

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
      helpText: 'Contoh: Teknik Sepeda Motor, Agribisnis Holtikultura, Keperawatan.',
      skippable: false,
      condition: { question_id: 'pilih_program_keahlian_modul', value: '__lainnya__' } },
    pilihan('kondisi_kelas_modul', 'Bagaimana kondisi kelas untuk modul ini?', [
      ['reguler',            'Kemampuan murid relatif seragam'],
      ['diferensiasi',       'Kemampuan murid sangat beragam'],
      ['inklusif',           'Ada murid berkebutuhan khusus'],
      ['campuran_kemampuan', 'Sebagian murid sedang PKL'],
    ]),
    pilihan('target_kompetensi_modul', 'Target kompetensi utama modul ini?', [
      ['pemahaman',  'Pemahaman konsep'],
      ['keterampilan', 'Keterampilan praktis'],
      ['sikap',      'Pembentukan sikap atau karakter'],
      ['terpadu',    'Terpadu — pemahaman, keterampilan, dan sikap'],
      ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { aiRecommendation: true }),
  ],

  SUMBER_STRATEGI: [
    jamak('jenis_sumber', 'Sumber belajar apa yang digunakan? Pilih semua yang sesuai.', [
      ['buku_teks',    'Buku teks'],
      ['modul_digital', 'Modul digital'],
      ['video',        'Video pembelajaran'],
      ['artikel',      'Artikel atau bacaan pendek'],
      ['lingkungan',   'Lingkungan sekitar atau konteks dunia kerja'],
      ['lainnya',      'Sumber lain'],
    ], { constraints: { exclusive: [] } }),
    { id: 'jenis_sumber_lainnya', kind: 'teks_bebas',
      prompt: 'Sumber lain apa yang akan digunakan? (contoh: narasumber industri, kunjungan industri, jobsheet, dll)',
      helpText: 'Deskripsi singkat sudah cukup — MiClass menyesuaikannya ke konteks pembelajaran.',
      skippable: false,
      condition: { question_id: 'jenis_sumber', value: 'lainnya' } },
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
    jamak('teknik_asesmen', 'Teknik asesmen apa yang digunakan?', [
      ['tes_tulis',   'Tes tulis'],
      ['tes_lisan',   'Tes lisan'],
      ['observasi',   'Observasi proses'],
      ['portofolio',  'Portofolio'],
      ['proyek',      'Proyek'],
      ['unjuk_kerja', 'Unjuk kerja'],
      ['rekomendasi', 'Minta rekomendasi MiClass'],
    ], { constraints: { exclusive: ['rekomendasi'] }, aiRecommendation: true }),
    pilihan('waktu_asesmen', 'Kapan asesmen utama dilakukan?', [
      ['awal',     'Di awal (diagnostik)'],
      ['proses',   'Selama proses (formatif)'],
      ['akhir',    'Di akhir pertemuan (sumatif)'],
      ['campuran', 'Campuran awal, proses, dan akhir'],
    ]),
  ],

  MODUL_SUMMARY: [
    konfirmasi('persetujuan_modul_summary',
      'Ringkasan Modul Ajar siap disusun.\n\nApakah data modul sudah sesuai?', [
        ['generate',       'Ya, buat Modul Ajar'],
        ['ubah_pertemuan', 'Ubah jumlah pertemuan'],
        ['ubah_konteks',   'Ubah konteks'],
        ['ubah_strategi',  'Ubah sumber & strategi'],
        ['ubah_asesmen',   'Ubah asesmen'],
      ], { helpText: 'Generate hanya berjalan setelah persetujuan guru.' }),
  ],

  MODUL_GENERATE: [],

  MODUL_REVIEW: [],
};

// V1 AKTIF: KONTEKS_CP sampai ATP_REVIEW
const FASE_URUTAN_V1 = [
  'KONTEKS_CP',      // Identitas kelas + validasi CP
  'PILIH_ATP',       // Pilih ATP yang ada (hanya mode sesuaikan) — skip otomatis jika susun baru
  'PRIORITAS',       // Fondasi TKA, kerja, PKL, pendidikan, target sekolah
  'WAKTU',           // JP, minggu efektif, kegiatan khusus, cadangan, pola jadwal
  'PROFIL_SISWA',    // Kemampuan awal, diagnostik, kesulitan, status data
  'TARGET_FASE',     // Target akhir, penguatan elemen, kemandirian
  'KONTEKS_DUDI',    // Kekuatan konteks, ranah kerja, kebutuhan, batasan
  'PENGUATAN_PRASYARAT', // Strategi dan alokasi prasyarat
  'ATP_SUMMARY',     // Validasi kesiapan + persetujuan guru
  'ATP_GENERATE',    // Otomatis — tidak ada pertanyaan ke guru
  'ATP_REVIEW',      // Guru terima atau revisi ATP
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
