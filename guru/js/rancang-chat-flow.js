'use strict';

// Definisi pertanyaan chat interface Tab Rancang
// Setiap pertanyaan punya: id, fase, kind, prompt, options (opsional),
// constraints (opsional), helpText, skippable

const RANCANG_FLOW = {
  // ── BLOK 1 — Identitas Konteks (4 pertanyaan) ──
  BLOK1: [
    {
      id: 'mapel',
      kind: 'teks_bebas',
      prompt: 'Mata pelajaran apa yang akan Anda rancang untuk semester ini?',
      helpText: 'Tuliskan nama mapel Anda, misalnya: Bahasa Inggris, Matematika, PJOK.',
      skippable: false,
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
const FASE_URUTAN = ['BLOK1', 'SMK', 'BLOK2', 'ATP_REVIEW', 'BLOK3', 'DONE'];

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
    if (depAnswer === q.condition.value) return q;
  }
  return null; // fase selesai
}

// Helper: fase berikutnya setelah fase ini selesai
function getNextPhase(currentPhase) {
  const idx = FASE_URUTAN.indexOf(currentPhase);
  if (idx === -1 || idx >= FASE_URUTAN.length - 1) return null;
  return FASE_URUTAN[idx + 1];
}
