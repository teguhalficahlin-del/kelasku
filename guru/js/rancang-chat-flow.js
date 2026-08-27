'use strict';

// Definisi pertanyaan chat interface Tab Rancang
// Setiap pertanyaan punya: id, fase, kind, prompt, options (opsional),
// constraints (opsional), helpText, skippable

const RANCANG_FLOW = {
  // ── BLOK 1 — Identitas Konteks (4 pertanyaan) ──
  BLOK1: [
    {
      id: 'mapel',
      kind: 'pilihan',
      prompt: 'Mata pelajaran apa yang akan Anda rancang ATP-nya?',
      options: [
        { value: 'bahasa_indonesia',              label: 'Bahasa Indonesia' },
        { value: 'bahasa_inggris',                label: 'Bahasa Inggris' },
        { value: 'informatika',                   label: 'Informatika' },
        { value: 'matematika',                    label: 'Matematika' },
        { value: 'pendidikan_agama',              label: 'Pendidikan Agama & Budi Pekerti' },
        { value: 'pendidikan_pancasila',          label: 'Pendidikan Pancasila' },
        { value: 'pjok',                          label: 'PJOK' },
        { value: 'projek_ipas',                   label: 'Projek IPAS' },
        { value: 'projek_kreatif_kewirausahaan',  label: 'Projek Kreatif & Kewirausahaan' },
        { value: 'sejarah',                       label: 'Sejarah' },
        { value: 'seni_budaya',                   label: 'Seni Budaya' },
      ],
      helpText: 'Pilih mapel yang akan Anda rancang ATP-nya.',
      skippable: false,
    },
    {
      id: 'mapel_agama',
      kind: 'pilihan',
      prompt: 'Agama apa yang Anda ampu?',
      options: [
        { value: 'pendidikan_agama_islam',                   label: 'Islam' },
        { value: 'pendidikan_agama_kristen',                 label: 'Kristen' },
        { value: 'pendidikan_agama_katolik',                 label: 'Katolik' },
        { value: 'pendidikan_agama_hindu',                   label: 'Hindu' },
        { value: 'pendidikan_agama_buddha',                  label: 'Buddha' },
        { value: 'pendidikan_agama_khonghucu',               label: 'Khonghucu' },
        { value: 'kepercayaan_terhadap_tuhan_yang_maha_esa', label: 'Kepercayaan' },
      ],
      helpText: 'Pilih agama yang sesuai dengan mapel Anda.',
      skippable: false,
      condition: { question_id: 'mapel', value: 'pendidikan_agama' },
    },
    {
      id: 'fase',
      kind: 'pilihan',
      prompt: 'Siswa Anda berada di fase mana?',
      options: [
        { value: 'fase_e', label: 'Fase E — Kelas 10' },
        { value: 'fase_f', label: 'Fase F — Kelas 11–12' },
      ],
      helpText: 'Fase E untuk kelas 10, Fase F untuk kelas 11 dan 12.',
      skippable: false,
    },
    {
      id: 'jp_per_minggu',
      kind: 'angka',
      prompt: 'Berapa jam pelajaran (JP) untuk mapel ini per minggu?',
      helpText: 'JP adalah satuan waktu mengajar. 1 JP biasanya 40–45 menit.',
      constraints: { min: 1, max: 20 },
      skippable: false,
    },
    {
      id: 'rombel',
      kind: 'teks_bebas',
      prompt: 'Anda mengajar di rombel mana? (nama kelas atau kelompok)',
      helpText: 'Contoh: XI AKL 1, X TKJ 2. Kalau mengampu lebih dari satu, pilih dulu satu rombel.',
      skippable: false,
    },
  ],

  // ── SMK — Konteks Kejuruan (10 pertanyaan) ──
  SMK: [
    {
      id: 'smk_tujuan',
      kind: 'pilihan_jamak',
      prompt: 'Apa tujuan utama pembelajaran Anda semester ini? (boleh pilih lebih dari satu)',
      options: [
        { value: 'pkl', label: 'PKL / Magang' },
        { value: 'dunia_kerja', label: 'Kontekstualisasi ke Dunia Kerja' },
        { value: 'sertifikasi', label: 'Sertifikasi Kompetensi (BNSP/LSP)' },
        { value: 'lks', label: 'LKS / Kompetisi' },
        { value: 'konsep_dasar', label: 'Penguatan Konsep Dasar' },
        { value: 'kewirausahaan', label: 'Kewirausahaan / UMKM' },
        { value: 'literasi', label: 'Penguatan Literasi' },
        { value: 'numerasi', label: 'Penguatan Numerasi' },
      ],
      helpText: 'Tujuan ini memengaruhi penekanan dan konteks ATP yang akan disusun.',
      skippable: false,
    },
    {
      id: 'smk_status_pkl',
      kind: 'pilihan',
      prompt: 'Bagaimana status PKL siswa semester ini?',
      options: [
        { value: 'tidak_ada', label: 'Tidak ada PKL' },
        { value: 'sebagian', label: 'Sebagian siswa sedang PKL' },
        { value: 'semua_pertengahan', label: 'Semua PKL di pertengahan semester' },
        { value: 'semua_akhir', label: 'Semua PKL di akhir semester' },
      ],
      helpText: 'Status PKL memengaruhi distribusi JP dan kedalaman materi.',
      skippable: false,
    },
    {
      id: 'smk_target_sertif',
      kind: 'pilihan',
      prompt: 'Apakah ada target sertifikasi untuk siswa?',
      options: [
        { value: 'tidak_ada', label: 'Tidak ada target sertifikasi' },
        { value: 'internal', label: 'Sertifikasi internal sekolah' },
        { value: 'eksternal', label: 'Eksternal LSP/BNSP' },
        { value: 'keduanya', label: 'Keduanya' },
      ],
      helpText: 'Sertifikasi eksternal membutuhkan penekanan kompetensi yang lebih spesifik.',
      skippable: false,
    },
    {
      id: 'smk_pola_jadwal',
      kind: 'pilihan',
      prompt: 'Bagaimana pola jadwal mengajar Anda?',
      options: [
        { value: 'jp_terpisah', label: 'JP terpisah setiap hari' },
        { value: 'blok', label: 'Sistem blok (JP terkumpul)' },
        { value: 'teori_praktik', label: 'Teori dulu lalu praktik' },
        { value: 'praktik_penuh', label: 'Praktik penuh' },
      ],
      helpText: 'Pola jadwal menentukan bagaimana aktivitas per pertemuan disusun.',
      skippable: false,
    },
    {
      id: 'smk_durasi_proyek',
      kind: 'pilihan',
      prompt: 'Berapa lama biasanya satu proyek atau unit pembelajaran berlangsung?',
      options: [
        { value: '1_minggu', label: '1 minggu' },
        { value: '2_4_minggu', label: '2–4 minggu' },
        { value: '5_8_minggu', label: '5–8 minggu' },
        { value: 'tidak_pakai', label: 'Tidak menggunakan proyek' },
      ],
      helpText: 'Durasi proyek memengaruhi jumlah dan kedalaman TP dalam ATP.',
      skippable: false,
    },
    {
      id: 'smk_hubungan_dudi',
      kind: 'pilihan_jamak',
      prompt: 'Seberapa aktif hubungan dengan industri/DUDI saat ini?',
      options: [
        { value: 'kunjungan', label: 'Kunjungan industri' },
        { value: 'narasumber', label: 'Guest teacher / narasumber' },
        { value: 'sponsorship', label: 'Sponsorship alat/bahan' },
        { value: 'teaching_factory', label: 'Teaching Factory' },
        { value: 'tidak_ada', label: 'Tidak ada hubungan DUDI' },
      ],
      helpText: 'Hubungan DUDI aktif memberi peluang kontekstualisasi nyata dalam ATP.',
      skippable: false,
    },
    {
      id: 'smk_industri_dominan',
      kind: 'teks_bebas',
      prompt: 'Industri apa yang dominan di daerah Anda?',
      helpText: 'Contoh: Tekstil, Pariwisata, Pertanian, Teknologi Informasi. ' +
                'Ini digunakan untuk kontekstualisasi contoh dalam ATP.',
      skippable: true,
    },
    {
      id: 'smk_mitra_dudi',
      kind: 'pilihan',
      prompt: 'Apakah sekolah punya mitra DUDI aktif saat ini?',
      options: [
        { value: 'tidak_ada', label: 'Tidak ada mitra aktif' },
        { value: 'ada', label: 'Ada mitra aktif' },
      ],
      helpText: 'Mitra aktif memberi peluang proyek berbasis kasus nyata.',
      skippable: false,
    },
    {
      id: 'smk_nama_mitra',
      kind: 'teks_bebas',
      prompt: 'Siapa nama mitra DUDI tersebut?',
      helpText: 'Nama perusahaan atau lembaga mitra. Boleh lebih dari satu, pisahkan dengan koma.',
      skippable: true,
      condition: { question_id: 'smk_mitra_dudi', value: 'ada' },
    },
    // DNK + DK (6 pertanyaan diagnostik) — muncul sebelum BLOK2
    {
      id: 'dnk_perasaan',
      kind: 'pilihan',
      prompt: 'Secara umum, bagaimana perasaan siswa terhadap mapel Anda?',
      options: [
        { value: 'antusias', label: 'Antusias dan termotivasi' },
        { value: 'biasa', label: 'Biasa saja' },
        { value: 'tidak_suka', label: 'Tidak terlalu suka' },
        { value: 'beragam', label: 'Sangat beragam' },
      ],
      helpText: 'Motivasi siswa memengaruhi pilihan pendekatan dan aktivitas dalam ATP.',
      skippable: false,
    },
    {
      id: 'dnk_relevansi',
      kind: 'pilihan',
      prompt: 'Menurut pengamatan Anda, seberapa relevan mapel ini bagi siswa?',
      options: [
        { value: 'sangat_relevan', label: 'Sangat relevan dengan kehidupan/karier mereka' },
        { value: 'cukup', label: 'Cukup relevan' },
        { value: 'tidak_relevan', label: 'Kurang relevan menurut siswa' },
        { value: 'tidak_tahu', label: 'Siswa tidak tahu relevansinya' },
      ],
      helpText: 'Relevansi yang dirasakan memengaruhi strategi motivasi dan kontekstualisasi.',
      skippable: false,
    },
    {
      id: 'dnk_kondisi',
      kind: 'pilihan',
      prompt: 'Bagaimana kondisi umum siswa saat masuk kelas?',
      options: [
        { value: 'segar', label: 'Segar dan siap belajar' },
        { value: 'lelah_fokus', label: 'Kadang lelah tapi masih bisa fokus' },
        { value: 'sering_lelah', label: 'Sering terlihat lelah atau tidak fokus' },
        { value: 'beragam', label: 'Sangat beragam tergantung hari' },
      ],
      helpText: 'Kondisi fisik siswa memengaruhi alokasi aktivitas aktif vs reflektif.',
      skippable: false,
    },
    {
      id: 'dk_konsep_dasar',
      kind: 'pilihan',
      prompt: 'Sejauh mana siswa sudah mengenal konsep dasar mapel ini sebelum semester ini?',
      options: [
        { value: 'belum', label: 'Belum sama sekali' },
        { value: 'sedikit', label: 'Sedikit — perlu banyak fondasi' },
        { value: 'cukup', label: 'Cukup — bisa langsung ke materi inti' },
        { value: 'sudah_baik', label: 'Sudah baik — bisa langsung ke pengembangan' },
      ],
      helpText: 'Pengetahuan awal menentukan titik mulai dan kedalaman TP pertama.',
      skippable: false,
    },
    {
      id: 'dk_instruksi',
      kind: 'pilihan',
      prompt: 'Bagaimana kemampuan siswa mengikuti instruksi bertahap?',
      options: [
        { value: 'perlu_berkali', label: 'Perlu dijelaskan berkali-kali' },
        { value: 'perlu_contoh', label: 'Perlu 2× penjelasan plus contoh konkret' },
        { value: 'sekali_contoh', label: 'Cukup sekali plus contoh' },
        { value: 'langsung_paham', label: 'Langsung paham instruksi' },
      ],
      helpText: 'Ini memengaruhi seberapa eksplisit panduan guru perlu ditulis di modul.',
      skippable: false,
    },
    {
      id: 'dk_hasil_sebelumnya',
      kind: 'pilihan',
      prompt: 'Bagaimana hasil belajar siswa secara umum di periode sebelumnya?',
      options: [
        { value: 'belum_ada_data', label: 'Belum ada data' },
        { value: 'bawah_rata', label: 'Di bawah rata-rata' },
        { value: 'rata_rata', label: 'Rata-rata' },
        { value: 'di_atas', label: 'Di atas rata-rata' },
      ],
      helpText: 'Data hasil belajar sebelumnya membantu kalibrasi tingkat kesulitan ATP.',
      skippable: false,
    },
  ],

  // ── BLOK 2 — Preferensi Pembelajaran (7 pertanyaan) ──
  BLOK2: [
    {
      id: 'karakter_kelas',
      kind: 'pilihan_jamak',
      prompt: 'Bagaimana karakter umum kelas Anda? (boleh pilih lebih dari satu)',
      options: [
        { value: 'pasif', label: 'Cenderung pasif' },
        { value: 'aktif', label: 'Aktif dan suka bertanya' },
        { value: 'sulit_kelompok', label: 'Sulit bekerja dalam kelompok' },
        { value: 'disiplin', label: 'Disiplin dan tertib' },
        { value: 'cepat_bosan', label: 'Cepat bosan dengan aktivitas monoton' },
        { value: 'beragam', label: 'Sangat beragam kemampuannya' },
      ],
      helpText: 'Karakter kelas memengaruhi pilihan model pembelajaran dan diferensiasi.',
      skippable: false,
    },
    {
      id: 'kemandirian',
      kind: 'pilihan',
      prompt: 'Seberapa mandiri siswa Anda dalam belajar?',
      options: [
        { value: 'sangat_mandiri', label: 'Sangat mandiri — bisa eksplorasi sendiri' },
        { value: 'perlu_arahan', label: 'Perlu arahan — butuh panduan bertahap' },
        { value: 'sangat_bergantung', label: 'Sangat bergantung pada guru' },
      ],
      helpText: 'Tingkat kemandirian menentukan seberapa banyak scaffolding dibutuhkan.',
      skippable: false,
    },
    {
      id: 'pendekatan',
      kind: 'pilihan',
      prompt: 'Pendekatan pembelajaran mana yang paling cocok untuk kelas Anda?',
      options: [
        { value: 'spiral', label: 'Spiral — materi diulang dengan kompleksitas meningkat' },
        { value: 'linear', label: 'Linear — satu topik tuntas baru lanjut' },
        { value: 'tematik', label: 'Tematik — dikelompokkan per tema besar' },
        { value: 'pbl', label: 'Problem-Based Learning' },
        { value: 'pjbl', label: 'Project-Based Learning' },
        { value: 'discovery', label: 'Discovery Learning' },
        { value: 'genre_based', label: 'Genre-Based (khusus Bahasa)' },
        { value: 'campuran', label: 'Campuran sesuai kebutuhan' },
      ],
      helpText: 'Pendekatan ini menjadi kerangka urutan TP dalam ATP.',
      skippable: false,
    },
    {
      id: 'gaya_mengajar',
      kind: 'pilihan',
      prompt: 'Cara mengajar yang paling sering Anda gunakan?',
      options: [
        { value: 'fasilitator', label: 'Fasilitator — siswa lebih aktif' },
        { value: 'presenter', label: 'Presenter — guru banyak menjelaskan' },
        { value: 'coach', label: 'Coach — banyak feedback individual' },
      ],
      helpText: 'Gaya mengajar memengaruhi porsi aktivitas guru vs siswa dalam modul.',
      skippable: false,
    },
    {
      id: 'penilaian_utama',
      kind: 'pilihan',
      prompt: 'Cara penilaian yang paling Anda andalkan?',
      options: [
        { value: 'praktik', label: 'Praktik / unjuk kerja' },
        { value: 'portofolio', label: 'Portofolio' },
        { value: 'presentasi', label: 'Presentasi' },
        { value: 'observasi', label: 'Observasi lapangan' },
        { value: 'produk', label: 'Produk / karya' },
        { value: 'tes_tertulis', label: 'Tes tertulis' },
        { value: 'kombinasi', label: 'Kombinasi beberapa cara' },
      ],
      helpText: 'Cara penilaian menentukan bentuk KKTP dan bukti ketercapaian TP.',
      skippable: false,
    },
    {
      id: 'dimensi_profil',
      kind: 'pilihan_jamak',
      prompt: 'Dimensi Profil Lulusan mana yang ingin Anda fokuskan? (boleh lebih dari satu)',
      options: [
        { value: 'semua', label: 'Semua dimensi terintegrasi' },
        { value: 'keimanan', label: 'Keimanan & Ketakwaan' },
        { value: 'kewargaan', label: 'Kewargaan' },
        { value: 'penalaran', label: 'Penalaran Kritis' },
        { value: 'kreativitas', label: 'Kreativitas' },
        { value: 'kolaborasi', label: 'Kolaborasi' },
        { value: 'kemandirian', label: 'Kemandirian' },
        { value: 'kesehatan', label: 'Kesehatan' },
        { value: 'komunikasi', label: 'Komunikasi' },
      ],
      helpText: 'Berdasarkan Permendikdasmen No. 10 Tahun 2025.',
      skippable: false,
    },
    {
      id: 'jp_pola',
      kind: 'pilihan',
      prompt: 'Bagaimana JP biasanya dibagi dalam satu minggu?',
      options: [
        { value: 'terpisah', label: 'Terpisah setiap hari (mis. 2×2 JP)' },
        { value: 'blok', label: 'Blok penuh sekaligus (mis. 1×4 JP)' },
        { value: 'campuran', label: 'Campuran tergantung minggu' },
      ],
      helpText: 'Pola JP memengaruhi bagaimana aktivitas per pertemuan dirancang.',
      skippable: false,
    },
  ],

  TARGET: [
    {
      id: 'target_akhir_fase', kind: 'pilihan',
      prompt: 'Bagaimana target akhir Fase E ditentukan untuk mapel ini?',
      options: [
        { value: 'rekomendasi_sistem', label: 'Minta rekomendasi sistem berdasarkan CP' },
        { value: 'pilih_dari_cp', label: 'Pilih dari target yang diturunkan sistem dari CP' },
        { value: 'masukkan_sendiri', label: 'Masukkan target sekolah untuk diperiksa kesesuaiannya' },
      ],
      helpText: 'Target ini menjadi arah ATP satu fase penuh.', skippable: false,
    },
    {
      id: 'target_sendiri', kind: 'teks_bebas',
      prompt: 'Tuliskan target akhir fase yang ingin Anda gunakan. Sistem akan memeriksa kesesuaiannya dengan CP.',
      helpText: 'Contoh: Siswa mampu berkomunikasi lisan dan tulis dalam konteks dunia kerja sederhana.',
      skippable: false, condition: { question_id: 'target_akhir_fase', value: 'masukkan_sendiri' },
    },
    {
      id: 'penguatan_elemen', kind: 'pilihan',
      prompt: 'Elemen atau kompetensi mana yang mendapat penguatan lebih dalam ATP ini?',
      options: [
        { value: 'seimbang', label: 'Seimbang pada seluruh elemen' },
        { value: 'menyimak_berbicara', label: 'Menyimak–Berbicara' },
        { value: 'membaca_memirsa', label: 'Membaca–Memirsa' },
        { value: 'menulis_presentasi', label: 'Menulis–Mempresentasikan' },
        { value: 'per_kemampuan', label: 'Berdasarkan kemampuan awal siswa' },
        { value: 'rekomendasi', label: 'Minta rekomendasi sistem' },
      ],
      helpText: 'Penguatan tidak berarti elemen lain diabaikan — semua elemen CP tetap dicakup.', skippable: false,
    },
    {
      id: 'target_kemandirian', kind: 'pilihan',
      prompt: 'Tingkat kemandirian apa yang ditargetkan pada akhir fase ini?',
      options: [
        { value: 'dengan_panduan', label: 'Dengan contoh dan panduan' },
        { value: 'bantuan_terbatas', label: 'Dengan bantuan terbatas' },
        { value: 'mandiri_dikenal', label: 'Mandiri dalam situasi yang dikenal' },
        { value: 'mandiri_baru', label: 'Mandiri dan mampu menerapkan dalam situasi baru' },
        { value: 'rekomendasi_cp', label: 'Minta sistem menentukan berdasarkan CP' },
      ],
      helpText: 'Tingkat kemandirian memengaruhi gradasi TP dalam ATP.', skippable: false,
    },
  ],

  PRIORITAS: [
    {
      id: 'target_prioritas', kind: 'pilihan_jamak',
      prompt: 'Apa target prioritas siswa dalam fase ini? (boleh pilih lebih dari satu)',
      options: [
        { value: 'tka', label: 'Lulus Tes Kemampuan Akademik (TKA)' },
        { value: 'dunia_kerja', label: 'Siap memasuki dunia kerja' },
        { value: 'pt', label: 'Siap melanjutkan ke perguruan tinggi' },
        { value: 'sertifikasi', label: 'Siap mengikuti sertifikasi kompetensi' },
        { value: 'pkl', label: 'Siap PKL' },
        { value: 'literasi', label: 'Literasi dan numerasi fungsional' },
      ],
      helpText: 'Target ini memengaruhi penekanan, konteks, dan distribusi TP dalam ATP.', skippable: false,
    },
    {
      id: 'timeline_tka', kind: 'pilihan',
      prompt: 'Kapan fondasi kemampuan untuk TKA ini ditargetkan tercapai?',
      options: [
        { value: 'akhir_fase', label: 'Akhir fase ini' },
        { value: 'bertahap', label: 'Dibangun bertahap dan dilanjutkan pada fase berikutnya' },
        { value: 'lainnya', label: 'Tentukan waktu lain' },
      ],
      helpText: 'TKA biasanya dilaksanakan di akhir Fase F — fondasi dibangun di Fase E.',
      skippable: false, condition: { question_id: 'target_prioritas', value: 'tka' },
    },
  ],

  KONTEKS_DUDI: [
    {
      id: 'kekuatan_konteks', kind: 'pilihan',
      prompt: 'Seberapa kuat konteks program keahlian dimasukkan ke dalam ATP?',
      options: [
        { value: 'seimbang', label: 'Seimbang — konteks kehidupan, akademik, dan kejuruan digunakan proporsional' },
        { value: 'dominan', label: 'Dominan kejuruan — sebagian besar penerapan menggunakan konteks program keahlian' },
        { value: 'terbatas', label: 'Kontekstual terbatas — konteks kejuruan hanya pada TP yang relevan' },
        { value: 'rekomendasi', label: 'Minta rekomendasi berdasarkan target dan penguatan yang dipilih' },
      ],
      helpText: 'Kontekstualisasi tidak mengubah CP — hanya memengaruhi contoh, situasi, dan penekanan.', skippable: false,
    },
    {
      id: 'ranah_dunia_kerja', kind: 'pilihan_jamak',
      prompt: 'Ranah dunia kerja mana yang ingin diprioritaskan? (pilih maksimal 5)',
      options: [
        { value: 'k3', label: 'Keselamatan dan kesehatan kerja' },
        { value: 'komunikasi_prof', label: 'Komunikasi profesional' },
        { value: 'kerja_tim', label: 'Kerja sama tim' },
        { value: 'pelayanan', label: 'Pelayanan pelanggan' },
        { value: 'dokumentasi', label: 'Dokumentasi dan pelaporan' },
        { value: 'literasi_digital', label: 'Literasi digital' },
        { value: 'pemecahan', label: 'Pemecahan masalah' },
        { value: 'mutu', label: 'Mutu layanan' },
        { value: 'etika', label: 'Etika kerja' },
        { value: 'wirausaha', label: 'Kewirausahaan' },
        { value: 'data', label: 'Penggunaan data' },
        { value: 'rekomendasi', label: 'Minta rekomendasi sistem' },
      ],
      helpText: 'Ranah ini menjadi konteks situasi dan contoh dalam TP.', skippable: false,
    },
    {
      id: 'kebutuhan_bidang', kind: 'pilihan_jamak',
      prompt: 'Kebutuhan spesifik bidang keahlian apa yang perlu diperhatikan?',
      options: [
        { value: 'kosakata_bidang', label: 'Kosakata atau istilah dasar bidang keahlian' },
        { value: 'dokumen_kerja', label: 'Dokumen kerja sederhana' },
        { value: 'prosedur', label: 'Prosedur kerja' },
        { value: 'teknologi', label: 'Perangkat atau teknologi bidang keahlian' },
        { value: 'komunikasi_klien', label: 'Komunikasi dengan pelanggan atau rekan kerja' },
        { value: 'etika_data', label: 'Etika dan kerahasiaan informasi' },
        { value: 'tidak_ada', label: 'Tidak ada kebutuhan khusus' },
        { value: 'rekomendasi', label: 'Minta rekomendasi sistem' },
      ],
      helpText: 'Kebutuhan ini memengaruhi pilihan teks, situasi, dan materi pendukung TP.', skippable: false,
    },
  ],

  WAKTU: [
    {
      id: 'jp_per_minggu', kind: 'angka', prompt: 'Berapa jam pelajaran (JP) untuk mapel ini per minggu?',
      helpText: 'Contoh: 2, 3, atau 4 JP. Satu JP biasanya 40–45 menit.', constraints: { min: 1, max: 20 }, skippable: false,
    },
    {
      id: 'durasi_jp', kind: 'pilihan', prompt: 'Berapa durasi satu JP di sekolah Anda?',
      options: [
        { value: '45', label: '45 menit' }, { value: '40', label: '40 menit' },
        { value: '35', label: '35 menit' }, { value: 'lain', label: 'Durasi lainnya' },
      ],
      helpText: 'Durasi JP menentukan total waktu pembelajaran dalam fase ini.', skippable: false,
    },
    {
      id: 'durasi_jp_lain', kind: 'angka', prompt: 'Berapa menit satu JP di sekolah Anda?',
      helpText: 'Tuliskan angka menit, misalnya: 50.', constraints: { min: 30, max: 60 },
      skippable: false, condition: { question_id: 'durasi_jp', value: 'lain' },
    },
    {
      id: 'minggu_efektif', kind: 'pilihan', prompt: 'Bagaimana Anda ingin menentukan minggu efektif pembelajaran?',
      options: [
        { value: 'isi_sendiri', label: 'Isi sendiri (per semester)' },
        { value: 'pakai_standar', label: 'Gunakan standar 36 minggu (18+18)' },
        { value: 'cari_kalender', label: 'Bantu cari dari kalender dinas daerah' },
      ],
      helpText: 'Minggu efektif menentukan total JP yang tersedia untuk ATP.', skippable: false,
    },
    {
      id: 'minggu_sem1', kind: 'angka', prompt: 'Berapa minggu efektif semester pertama?',
      helpText: 'Contoh: 18 minggu.', constraints: { min: 10, max: 22 }, skippable: false,
      condition: { question_id: 'minggu_efektif', value: 'isi_sendiri' },
    },
    {
      id: 'minggu_sem2', kind: 'angka', prompt: 'Berapa minggu efektif semester kedua?',
      helpText: 'Contoh: 18 minggu.', constraints: { min: 10, max: 22 }, skippable: false,
      condition: { question_id: 'minggu_efektif', value: 'isi_sendiri' },
    },
    {
      id: 'cadangan_jp', kind: 'pilihan', prompt: 'Apakah perlu cadangan JP untuk libur atau gangguan tak terduga?',
      options: [
        { value: 'tidak', label: 'Tidak perlu cadangan' }, { value: '4jp', label: 'Cadangkan 4 JP (1 minggu)' },
        { value: '8jp', label: 'Cadangkan 8 JP (2 minggu) — direkomendasikan' },
        { value: '12jp', label: 'Cadangkan 12 JP (3 minggu)' },
      ],
      helpText: 'Cadangan JP tidak dibebani TP baru — digunakan untuk penguatan atau remediasi jika tidak terpakai.', skippable: false,
    },
    {
      id: 'pola_jp', kind: 'pilihan', prompt: 'Bagaimana pola JP dalam satu minggu?',
      options: [
        { value: 'reguler', label: 'Reguler — JP terpisah setiap pertemuan' },
        { value: 'blok', label: 'Blok — semua JP dalam satu pertemuan' },
        { value: 'campuran', label: 'Campuran tergantung minggu' },
      ],
      helpText: 'Pola JP memengaruhi bagaimana aktivitas per pertemuan dirancang.', skippable: false,
    },
  ],

  PROFIL_SISWA: [
    {
      id: 'data_kemampuan_awal', kind: 'pilihan_jamak', prompt: 'Data apa yang tersedia tentang kemampuan awal siswa?',
      options: [
        { value: 'rapor', label: 'Nilai atau rapor fase sebelumnya' },
        { value: 'diagnostik', label: 'Hasil asesmen diagnostik' }, { value: 'observasi', label: 'Observasi guru' },
        { value: 'info_guru', label: 'Informasi dari guru sebelumnya' }, { value: 'portofolio', label: 'Tugas atau portofolio' },
        { value: 'belum_ada', label: 'Belum ada data' },
      ],
      helpText: 'Data ini digunakan untuk menentukan titik awal dan gradasi TP.', skippable: false,
    },
    {
      id: 'tindak_lanjut_profil', kind: 'pilihan', prompt: 'Bagaimana Anda ingin melanjutkan tanpa data kemampuan awal?',
      options: [
        { value: 'lanjut_tanpa', label: 'Lanjutkan — gunakan asumsi dari CP dan fase' },
        { value: 'isi_profil', label: 'Isi profil kemampuan awal terlebih dahulu' },
      ],
      helpText: 'ATP tetap bisa disusun tanpa data — titik awal ditentukan dari tuntutan CP.', skippable: false,
      condition: { question_id: 'data_kemampuan_awal', value: 'belum_ada' },
    },
    {
      id: 'cara_pemetaan', kind: 'pilihan', prompt: 'Bagaimana Anda ingin memperoleh profil kemampuan awal?',
      options: [
        { value: 'diagnostik_umum', label: 'Buat asesmen diagnostik umum' },
        { value: 'observasi_awal', label: 'Gunakan observasi awal selama pembelajaran' },
        { value: 'tugas_singkat', label: 'Gunakan tugas pemetaan singkat' },
        { value: 'perkiraan_guru', label: 'Masukkan perkiraan profesional guru' },
        { value: 'terpadu', label: 'Gabungkan asesmen, observasi, dan tugas singkat' },
        { value: 'rekomendasi', label: 'Minta sistem merekomendasikan cara paling efisien' },
      ],
      helpText: 'Pemetaan awal memberikan data nyata untuk diferensiasi di Modul Ajar.', skippable: false,
      condition: { question_id: 'tindak_lanjut_profil', value: 'isi_profil' },
    },
    {
      id: 'penguatan_prasyarat', kind: 'pilihan', prompt: 'Bagaimana penguatan prasyarat dimasukkan ke ATP?',
      options: [
        { value: 'awal_fase', label: 'Pada awal fase — sebelum TP pertama' },
        { value: 'disisipkan', label: 'Disisipkan sebelum TP yang membutuhkan' },
        { value: 'kombinasi', label: 'Kombinasi: penguatan awal dan terintegrasi' },
        { value: 'tidak_perlu', label: 'Tidak perlu' }, { value: 'rekomendasi', label: 'Minta rekomendasi sistem' },
      ],
      helpText: 'Penguatan prasyarat memastikan siswa siap mengikuti TP pertama.', skippable: false,
    },
  ],

  // ── BLOK 3 — Konteks Realistis Kelas (9 pertanyaan) ──
  BLOK3: [
    {
      id: 'jumlah_siswa',
      kind: 'pilihan',
      prompt: 'Berapa jumlah siswa di kelas ini?',
      options: [
        { value: 'kurang_20', label: 'Kurang dari 20 siswa' },
        { value: '20_30', label: '20–30 siswa' },
        { value: '31_36', label: '31–36 siswa' },
        { value: 'lebih_36', label: 'Lebih dari 36 siswa' },
      ],
      helpText: 'Jumlah siswa memengaruhi strategi diferensiasi dan pengelolaan kelas.',
      skippable: false,
    },
    {
      id: 'abk',
      kind: 'pilihan',
      prompt: 'Apakah ada siswa yang membutuhkan perhatian khusus di kelas ini?',
      options: [
        { value: 'tidak_ada', label: 'Tidak ada' },
        { value: 'ada', label: 'Ada' },
      ],
      helpText: 'Siswa berkebutuhan khusus memerlukan catatan diferensiasi tambahan.',
      skippable: false,
    },
    {
      id: 'abk_desc',
      kind: 'teks_bebas',
      prompt: 'Ceritakan singkat kondisi siswa tersebut.',
      helpText: 'Misalnya: ada siswa yang sulit fokus, kesulitan membaca, atau kondisi lain.',
      skippable: true,
      condition: { question_id: 'abk', value: 'ada' },
    },
    {
      id: 'fasilitas',
      kind: 'pilihan_jamak',
      prompt: 'Fasilitas apa yang tersedia di kelas Anda? (pilih semua yang ada)',
      options: [
        { value: 'proyektor', label: 'Proyektor / LCD' },
        { value: 'laptop', label: 'Laptop / komputer siswa' },
        { value: 'speaker', label: 'Speaker' },
        { value: 'lab', label: 'Lab komputer' },
        { value: 'wifi', label: 'Koneksi WiFi' },
        { value: 'printer', label: 'Printer' },
        { value: 'cetak', label: 'Lembar kerja cetak tersedia' },
        { value: 'tidak_ada', label: 'Tidak ada fasilitas khusus' },
      ],
      helpText: 'AI hanya merekomendasikan aktivitas yang sesuai dengan fasilitas yang ada.',
      skippable: false,
    },
    {
      id: 'situasi_hp',
      kind: 'pilihan',
      prompt: 'Bagaimana situasi HP dan kebijakan sekolah?',
      options: [
        { value: 'dilarang', label: 'HP dilarang dibawa ke kelas' },
        { value: 'boleh_semua', label: 'Boleh untuk belajar — semua siswa punya HP' },
        { value: 'boleh_sebagian', label: 'Boleh untuk belajar — hanya sebagian punya HP' },
        { value: 'bebas', label: 'HP bebas digunakan' },
        { value: 'tidak_ada_kebijakan', label: 'Tidak ada kebijakan jelas' },
      ],
      helpText: 'Kebijakan HP menentukan apakah aktivitas berbasis digital bisa digunakan.',
      skippable: false,
    },
    {
      id: 'akses_internet',
      kind: 'pilihan',
      prompt: 'Bagaimana akses internet di kelas?',
      options: [
        { value: 'tidak_ada', label: 'Tidak ada internet' },
        { value: 'kadang', label: 'Kadang ada, tidak stabil' },
        { value: 'stabil', label: 'Ada WiFi sekolah yang stabil' },
      ],
      helpText: 'Aktivitas online hanya disarankan kalau internet stabil.',
      skippable: false,
    },
    {
      id: 'materi_cetak',
      kind: 'pilihan_jamak',
      prompt: 'Materi cetak apa yang tersedia untuk siswa?',
      options: [
        { value: 'buku_teks', label: 'Buku teks pemerintah (BSE)' },
        { value: 'lks_sekolah', label: 'LKS dari sekolah' },
        { value: 'modul_guru', label: 'Modul buatan guru' },
        { value: 'bahan_dudi', label: 'Bahan dari DUDI' },
        { value: 'tidak_ada', label: 'Tidak ada bahan cetak' },
      ],
      helpText: 'Ketersediaan bahan cetak memengaruhi jenis tugas yang bisa diberikan.',
      skippable: false,
    },
    {
      id: 'aktivitas_dihindari',
      kind: 'pilihan_jamak',
      prompt: 'Aktivitas apa yang ingin Anda hindari di kelas ini?',
      options: [
        { value: 'ceramah_panjang', label: 'Ceramah satu arah lebih dari 10 menit' },
        { value: 'hafalan', label: 'Hafalan tanpa konteks' },
        { value: 'bahan_beli', label: 'Tugas yang butuh bahan dibeli siswa' },
        { value: 'kompetisi', label: 'Kompetisi antar siswa' },
        { value: 'mempermalukan', label: 'Aktivitas yang mempermalukan di depan kelas' },
        { value: 'tidak_ada', label: 'Tidak ada yang dihindari' },
      ],
      helpText: 'AI tidak akan menyarankan aktivitas yang ada di daftar ini.',
      skippable: false,
    },
    {
      id: 'daerah',
      kind: 'teks_bebas',
      prompt: 'Di daerah mana Anda mengajar? (opsional)',
      helpText: 'Contoh: Ujungbatu, Riau. Digunakan untuk kontekstualisasi contoh lokal.',
      skippable: true,
    },
  ],
};

// Urutan fase percakapan
const FASE_URUTAN = [
  'BLOK1',        // Identitas: mapel, fase, JP, rombel
  'SMK',          // Konteks kejuruan + diagnostik DNK/DK
  'BLOK2',        // Preferensi pembelajaran
  'TARGET',       // Target akhir fase + kemandirian
  'PRIORITAS',    // Target prioritas SMK + timeline
  'KONTEKS_DUDI', // Kekuatan konteks + ranah dunia kerja + kebutuhan bidang
  'WAKTU',        // Alokasi JP, durasi, minggu efektif, cadangan, pola
  'PROFIL_SISWA', // Kemampuan awal + cara pemetaan + penguatan prasyarat
  'ATP_REVIEW',   // Generate ATP — ditangani rancang-chat.js, bukan flow
  'BLOK3',        // Konteks Modul Ajar
  'DONE',
];

// Helper: ambil pertanyaan berikutnya berdasarkan jawaban terkumpul
function getNextQuestion(currentPhase, currentQId, collectedAnswers) {
  const questions = RANCANG_FLOW[currentPhase] || [];
  const currentIdx = questions.findIndex(q => q.id === currentQId);
  if (currentIdx === -1) return null;

  // Cari pertanyaan berikutnya yang kondisinya terpenuhi
  for (let i = currentIdx + 1; i < questions.length; i++) {
    const q = questions[i];
    if (!q.condition) return q;
    const depAnswer = collectedAnswers[q.condition.question_id];
    if (Array.isArray(depAnswer)) {
      if (depAnswer.includes(q.condition.value)) return q;
    } else {
      if (depAnswer === q.condition.value) return q;
    }
  }
  return null; // fase selesai
}

// Helper: fase berikutnya setelah fase ini selesai
function getNextPhase(currentPhase) {
  const idx = FASE_URUTAN.indexOf(currentPhase);
  if (idx === -1 || idx >= FASE_URUTAN.length - 1) return null;
  return FASE_URUTAN[idx + 1];
}
