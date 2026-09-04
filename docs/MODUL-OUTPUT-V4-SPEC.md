# ModulOutput V4.0 — Spesifikasi Final

> Status: **SPEC LOCKED — READY FOR IMPLEMENTATION**
> Dibuat: 4 September 2026
> Review: ChatGPT putaran 1–8 (SPEC LOCKED putaran 8)
> Keputusan Romo: 4 September 2026

---

## Prinsip Arsitektur

```
MODULOUTPUT V4.0
kaya secara semantik (memori pedagogis sistem)
        ↓
RENDERER (rancang-chat.js)
selektif secara UX
        ↓
DOKUMEN GURU (modul ajar + lampiran instrumen)
ringkas dan operasional
```

**Schema adalah memori pedagogis sistem. Dokumen adalah antarmuka guru.**

LKPD bukan dokumen terpisah — instrumen dengan `untuk_murid: true` dicetak guru
dari lampiran modul ajar yang sama.

---

## Pipeline Generate V4.0

```
FASE A   → Pedagogical Blueprint + Instrument Manifest (pembelajaran + asesmen)
VALIDATE A (field wajib, KKTP observable/verifiable, manifest konsisten)
         ↓
FASE B1  → pertemuan[] — hanya boleh referensikan ID dari manifest
           backend menulis sub_langkah.ref deterministik: "P{n}.{NamaLangkah}.{nomor}"
           backend validasi nomor sub_langkah unik + berurutan dalam setiap langkah sebelum bentuk ref
VALIDATE B1 + TIME BUDGET (Σdurasi_sub = durasi_fase; feasibility)
         ↓
FASE C   → isi konten instrumen per ID manifest — tidak boleh buat ID baru
           setiap type wajib punya konten_murid + panduan_guru (TypeScript explicit contract)
VALIDATE C (manifest integrity + placement; untuk_murid === konten_murid !== null)
         ↓
FASE B2  → naskah_fasilitasi[] — dibuat SETELAH instrumen final tersedia
           konteks yang dikirim: pertemuan[], konteks_murid, kktp[],
           instrumen yang DIREFERENSIKAN pertemuan saja (bukan semua instrumen),
           rencana_asesmen — hanya entri yang placement/waktu_pertemuan + fase_langkah
             cocok dengan pertemuan yang sedang di-generate; field yang dikirim:
             teknik, instrumen_ref, fungsi, umpan_balik, referensi_kktp,
             dan sumatif.durasi_menit jika pertemuan ini punya slot SUMATIF,
           rancangan.keselamatan_k3 (jika tidak null), language_policy
           AI TIDAK membuat ref — backend suntikkan ref dari pertemuan[] yang sudah ada
VALIDATE B2 + NASKAH ALIGNMENT (Validator 10)
         ↓
FASE D   → tindak_lanjut, catatan_guru, merge, write final, status='aktif'
GLOBAL VALIDATE → final ModulOutput
```

> Pipeline: **A → B1 → C → B2 → D** (5 LLM call)
> B2 setelah C agar naskah bisa menyebut konten instrumen yang konkret (teks soal, kartu peran, dll.)
> `sub_langkah.ref` dibuat backend secara deterministik — bukan oleh AI — untuk menghindari error format.

### Instrument Manifest (kontrak internal pipeline, tidak masuk ModulOutput final)

Dihasilkan di Fase A, dikirim ke Fase B dan C:

```json
{
  "pembelajaran_manifest": [
    { "id": "PBL-01", "jenis": "kartu_peran",   "untuk_murid": true,  "digunakan_pada": ["P1.MENGAPLIKASI"] },
    { "id": "PBL-02", "jenis": "teks_autentik", "untuk_murid": true,  "digunakan_pada": ["P1.MEMAHAMI"] }
  ],
  "asesmen_manifest": [
    { "id": "ASM-01", "jenis": "pemetaan_awal",    "untuk_murid": false, "digunakan_pada": ["P1.ASESMEN_AWAL"] },
    { "id": "ASM-02", "jenis": "matriks_observasi","untuk_murid": false, "digunakan_pada": ["P1.MENGAPLIKASI"] },
    { "id": "ASM-03", "jenis": "lembar_refleksi",  "untuk_murid": true,  "digunakan_pada": ["P2.MEREFLEKSI"] }
  ]
}
```

Fase B hanya boleh referensikan ID yang ada di manifest.
Fase C mengisi `konten` per ID — tidak boleh tambah atau hapus ID.

---

## Schema V4.0 — Root Type

```typescript
type ModulOutput = {
  schema_version: '4.0.0';

  identitas:              Identitas;              // A
  kktp:                   KktpItem[];             // A — first-class, naik ke root
  konteks_murid:          KonteksMurid;           // A
  materi_esensial:        MateriEsensial;         // A
  rencana_asesmen:        RencanaAsesmen;         // A — setiap komponen | null
  rancangan:              Rancangan;              // A
  pertemuan:              Pertemuan[];            // B — dokumen resmi (orang ketiga, formal)
  naskah_fasilitasi:      NaskahPertemuan[];      // B — panduan praktis guru (imperatif)
  instrumen_pembelajaran: InstrumenPembelajaran[]; // C — [] jika guru tidak pilih
  instrumen_asesmen:      InstrumenAsesmen[];     // C — [] jika semua asesmen null
  tindak_lanjut:          TindakLanjut;           // D
  catatan_guru:           string[];               // D — maks 7
  metadata_pedagogis:     MetadataPedagogis;      // A — tidak tampil di dokumen utama
};
```

---

## A. Identitas

```typescript
type Identitas = {
  // Deterministik dari DB
  mata_pelajaran:            string;
  jenjang:                   string;
  fase:                      string;
  nomor_tp:                  number;
  jumlah_pertemuan:          number;
  jp_per_pertemuan:          number;
  durasi_jp_menit:           number;
  alokasi_waktu_total_menit: number;  // jumlah_pertemuan × jp_per_pertemuan × durasi_jp_menit
  elemen_cp:                 string[];
  jenis_dokumen:             string;
  konteks_kejuruan: {
    bidang_keahlian:      string | null;
    program_keahlian:     string | null;
    konsentrasi_keahlian: string | null;
  };

  // Dihasilkan AI
  dasar_cp:            string;
  tujuan_pembelajaran: string;
};
```

---

## B. KKTP (first-class — naik ke root)

```typescript
type KktpItem = {
  id_kktp:         string;    // 'K1', 'K2', ... berurutan
  kriteria:        string;    // non-empty
  ambang_batas:    string;    // WAJIB observable/verifiable — contoh valid:
                              //   "minimal 6 dari 10 kosakata benar"
                              //   "minimal level Mandiri pada rubrik kelancaran"
                              //   "memuat minimal 4 unsur wajib dialog"
                              //   "skor ≥ 70% pada tes tulis"
                              // DILARANG: "dengan tepat", "secara lancar" (tanpa ukuran)
  instrumen_bukti: string[];  // ref ke instrumen_asesmen[].id dan/atau {F1,F2,F3}
                              // [] jika guru tidak memilih asesmen
};
```

---

## C. Konteks Murid

```typescript
type KonteksMurid = {
  kesiapan_awal:      string[]; // ≥ 3 kemampuan awal yang diasumsikan dimiliki murid
  variasi_kemampuan:  string;   // deskripsi kondisi kelas
  kebutuhan_dukungan: string[]; // ≥ 2 bentuk dukungan yang mungkin dibutuhkan
};
```

---

## D. Materi Esensial

```typescript
type MateriEsensial = {
  lingkup_materi: string[]; // ≥ 3 butir
  kosakata_kunci: string[];  // ≥ 5 item — mapel-agnostic
  konsep_utama:   string[];  // ≥ 2 konsep/prinsip fondasi TP ini
};
```

---

## E. Rencana Asesmen

Guru memilih komponen asesmen di KONTEKS_MODUL flow (multi-select).
Setiap komponen independen — bisa pilih satu, kombinasi, atau tidak sama sekali.

```typescript
// Mapping teknik → jenis instrumen yang di-generate:
//
// DIAGNOSTIK:
//   "Pemetaan awal"              → pemetaan_awal
//   "Tanya jawab lisan / tes singkat" → soal_latihan
//   "Observasi kemampuan awal"   → matriks_observasi
//
// FORMATIF:
//   "Observasi unjuk kerja"      → matriks_observasi
//   "Penilaian diri"             → lembar_refleksi
//   "Penilaian antarteman"       → lembar_refleksi (versi peer)
//   "Kuis / tes singkat"         → soal_latihan
//   "Praktik / simulasi"         → matriks_observasi
//
// SUMATIF:
//   "Tes tertulis"               → soal_latihan (dengan kunci jawaban)
//   "Unjuk kerja / kinerja"      → matriks_observasi
//   "Proyek / produk"            → panduan_proyek
//   "Praktikum"                  → lembar_praktikum
//   "Presentasi"                 → matriks_observasi

type RencanaAsesmen = {
  // null jika guru tidak memilih diagnostik
  asesmen_diagnostik: {
    tujuan:           string;
    teknik:           string;    // satu teknik dari mapping di atas
    instrumen_ref:    string[];  // ref ke instrumen_asesmen[].id
    waktu:            string;
    penggunaan_hasil: string;
  } | null;

  // null jika guru tidak memilih formatif
  asesmen_formatif: Array<{
    id:              string;        // 'F1', 'F2', 'F3' berurutan
    waktu_pertemuan: number;
    fase_langkah:    NamaLangkah;
    teknik:          string;        // satu teknik dari mapping di atas
    instrumen_ref:   string[];      // ref ke instrumen_asesmen[].id; [] jika tidak ada instrumen formal
    fungsi:          string;        // WAJIB bahasa Indonesia
                                    // DILARANG: "as learning", "for learning"
    referensi_kktp:  string[];      // ["K1", "K2"]
    umpan_balik:     string;
  }> | null;

  // null jika guru tidak memilih sumatif
  // Jika tidak null: HARUS ada sub_langkah dengan asesmen_ref = "SUMATIF"
  asesmen_sumatif: {
    deskripsi:     string;
    teknik:        string;    // satu teknik dari mapping di atas
    instrumen_ref: string[];  // ref ke instrumen_asesmen[].id
    durasi_menit:  number;
    placement: {
      pertemuan: number;
      fase:      NamaLangkah;
    };
  } | null;
};
```

---

## F. Rancangan Pembelajaran

```typescript
type Rancangan = {
  strategi_pedagogis:      string;
  sumber_belajar:          Array<{ sumber: string; kategori: string; fungsi: string }>;
  pemanfaatan_digital:     string;
  lingkungan_pembelajaran: string;
  kemitraan_pembelajaran:  string | null;
  keselamatan_k3:          string | null;
};
```

---

## G. Pertemuan

```typescript
type NamaLangkah =
  | 'PEMBUKA' | 'ASESMEN_AWAL' | 'MEMAHAMI'
  | 'MENGAPLIKASI' | 'MEREFLEKSI' | 'PENUTUP';

type ModePelaksanaan = 'simultan' | 'bergantian' | 'individual' | 'kelompok_kecil';
type ModeObservasi   = 'semua' | 'sampel' | 'rotasi' | 'mandiri';

type SubLangkah = {
  nomor:             number;
  ref:               string;           // WAJIB — ID stabil format "P{nomor}.{NamaLangkah}.{nomor}"
                                       // Contoh: "P1.MENGAPLIKASI.3", "P2.PENUTUP.1"
                                       // Dipakai naskah_fasilitasi untuk referensi yang tidak ambigu
  deskripsi:         string;           // formal, orang ketiga — untuk dokumen resmi
  durasi_menit:      number;           // WAJIB — integer > 0
                                       // Σdurasi_sub_langkah HARUS === durasi_menit langkah induk
  instrumen_ref?:    string[];         // ref ke instrumen_pembelajaran[].id ATAU instrumen_asesmen[].id
  asesmen_ref?:      'SUMATIF' | string; // "SUMATIF" jika ini slot sumatif
  mode_pelaksanaan?: ModePelaksanaan;
  mode_observasi?:   ModeObservasi;
  ukuran_kelompok?:  number;
};

type Langkah = {
  nama:         NamaLangkah;
  durasi_menit: number;
  prinsip:      string[];
  sub_langkah:  SubLangkah[];
};

type Pertemuan = {
  nomor:            number;
  tujuan_pertemuan: string;
  media_dan_alat:   string[];
  langkah:          Langkah[]; // tepat 6, urutan wajib
  catatan_guru?:    string;
};
```

---

## H. Naskah Fasilitasi

Di-generate di **Fase B** bersamaan dengan `pertemuan[]`.
Struktur paralel dengan `pertemuan[]` — nomor pertemuan dan sub_langkah harus selaras.

Tujuan: guru bisa langsung jalan di kelas tanpa kebingungan harus ngomong apa.
Bahasa: imperatif, orang pertama, percakapan nyata.

```typescript
type NaskahSubLangkah = {
  ref:               string;    // HARUS identik dengan SubLangkah.ref ("P1.MENGAPLIKASI.3")
  ucapan_guru:       string[];  // kalimat yang diucapkan guru — tiap elemen satu momen ucapan
                                // Contoh: ["Katakan: 'Sekarang ambil kartu peran masing-masing.'",
                                //          "Tunggu sampai semua murid memegang kartu."]
  aksi_guru:         string[];  // tindakan yang dilakukan guru (non-verbal)
                                // Contoh: ["Pantau apakah semua murid membaca instruksi.",
                                //          "Catat murid yang terlihat bingung."]
  pertanyaan_kunci:  string[];  // pertanyaan pemantik atau cek pemahaman
                                // Contoh: ["Apa yang kalian temukan dari teks tadi?"]
  jika_kesulitan?:   string[];  // antisipasi jika murid kesulitan
                                // Contoh: ["Jika murid belum mulai: 'Coba baca baris pertama dulu.'"]
};

type NaskahPertemuan = {
  nomor: number;  // harus identik dengan pertemuan[].nomor yang sesuai
  langkah: Array<{
    nama:        NamaLangkah;
    sub_langkah: NaskahSubLangkah[];
  }>;
};
```

**Aturan penulisan naskah:**
- `ucapan_guru`: satu elemen = satu momen ucapan; mulai dengan "Katakan:", "Tanyakan:", "Umumkan:"
- `aksi_guru`: satu elemen = satu tindakan; mulai dengan kata kerja: "Pantau", "Bagikan", "Tulis"
- `jika_kesulitan`: opsional tapi sangat dianjurkan untuk sub_langkah unjuk kerja
- Tidak perlu formal — yang penting bisa dibaca cepat di HP saat mengajar

**Renderer:** ditampilkan sebagai tab "Naskah" atau tombol "Lihat Panduan Mengajar"
yang terpisah dari tab "Modul Ajar Resmi". Tidak masuk dokumen yang dilaporkan
ke kepala sekolah atau pengawas.

---

## J. Instrumen Pembelajaran

Dipakai di langkah aktivitas. Bukan untuk mengukur pencapaian.
**Array tempat instrumen berada menentukan perannya** — jenis yang sama bisa muncul
di kedua array jika fungsinya berbeda. Jangan duplikasi instrumen yang sama.

`untuk_murid: boolean` — apakah instrumen ini dicetak dan dibagikan ke murid.

Setiap instrumen memiliki pemisahan konten:
- `konten_murid` — bagian yang dicetak untuk murid (null jika instrumen hanya untuk guru)
- `panduan_guru` — bagian yang hanya dilihat guru (kunci jawaban, panduan penskoran, catatan)

Renderer cetak-murid TIDAK PERNAH merender `panduan_guru`.

```typescript
type InstrumenPembelajaranBase = {
  id:             string;    // prefix PBL- dari manifest
  judul:          string;
  untuk_murid:    boolean;
  digunakan_pada: string[];  // ["P1.MENGAPLIKASI"]
};

type InstrumenPembelajaran =
  | InstrumenDialog
  | InstrumenTeksAutentik
  | InstrumenKartuPeran
  | InstrumenCustomPembelajaran;

type InstrumenDialog = InstrumenPembelajaranBase & {
  jenis: 'dialog_baseline' | 'dialog_model';
  // untuk_murid: true → konten_murid wajib ada
  konten_murid: {
    petunjuk: string;
    giliran:  Array<{ pembicara: string; ucapan: string }>;
  };
  panduan_guru: {
    catatan_fasilitasi: string;  // tips penggunaan dialog di kelas
  } | null;
};

type InstrumenTeksAutentik = InstrumenPembelajaranBase & {
  jenis: 'teks_autentik';
  // untuk_murid: true → konten_murid wajib ada
  konten_murid: {
    isi_teks:            string;
    pertanyaan_panduan:  string[];
  };
  panduan_guru: {
    nama_entitas:        string;
    catatan_konteks:     string;  // latar belakang teks untuk guru
  } | null;
};

type InstrumenKartuPeran = InstrumenPembelajaranBase & {
  jenis: 'kartu_peran';
  // untuk_murid: true → konten_murid wajib ada
  konten_murid: {
    set: Array<{
      nama_set:     string;
      nama_entitas: string;
      peran_a: { nama?: string; jabatan?: string; instruksi_peran: string };
      peran_b: { nama?: string; jabatan?: string; instruksi_peran: string };
    }>;
  };
  panduan_guru: {
    fokus_pengamatan:   string;  // apa yang diamati guru saat murid pakai kartu ini
    catatan_fasilitasi: string;
  } | null;
};

type InstrumenCustomPembelajaran = InstrumenPembelajaranBase & {
  jenis: 'custom';
  konten_murid: Record<string, unknown> | null;
  panduan_guru: Record<string, unknown> | null;
};
```

---

## I. Instrumen Asesmen

Dipakai untuk mengukur pencapaian KKTP.
`untuk_murid: true` = murid juga mengisi (lembar refleksi, soal latihan, panduan proyek).

```typescript
type InstrumenAsesmenBase = {
  id:             string;    // prefix ASM- dari manifest
  judul:          string;
  untuk_murid:    boolean;
  digunakan_pada: string[];  // ["P1.ASESMEN_AWAL"]
};

type InstrumenAsesmen =
  | InstrumenPemetaanAwal
  | InstrumenObservasi
  | InstrumenRefleksi
  | InstrumenSoal
  | InstrumenPraktikum
  | InstrumenPanduanProyek
  | InstrumenCustomAsesmen;

// Definisi lengkap setiap type ada di §K. Instrumen Asesmen di bawah.
```

---

## K. Instrumen Asesmen

Dipakai untuk mengukur pencapaian KKTP.
**Beberapa jenis bisa muncul di kedua array** — misalnya `kartu_peran` bisa jadi
stimulus asesmen performa, `lembar_praktikum` bisa jadi kegiatan belajar atau asesmen.
Array tempat instrumen berada yang menentukan perannya.

Setiap instrumen memiliki pemisahan konten yang sama dengan instrumen pembelajaran:
- `konten_murid` — dicetak untuk murid (soal, lembar isian, panduan proyek)
- `panduan_guru` — hanya untuk guru (kunci jawaban, rubrik penskoran, catatan observasi)

Contoh `soal_latihan`:
```typescript
// Murid menerima:
konten_murid: { petunjuk: string; soal: Array<{nomor, pertanyaan, tipe}> }

// Guru memegang:
panduan_guru: { kunci_jawaban: string[]; panduan_penskoran: string }
```

```typescript
type InstrumenAsesmenBase = {
  id:             string;    // prefix ASM- dari manifest
  judul:          string;
  untuk_murid:    boolean;
  digunakan_pada: string[];
};

type InstrumenAsesmen =
  | InstrumenPemetaanAwal
  | InstrumenObservasi
  | InstrumenRefleksi
  | InstrumenSoal
  | InstrumenPraktikum
  | InstrumenPanduanProyek
  | InstrumenCustomAsesmen;
  // kartu_peran + teks_autentik bisa ada di asesmen_manifest jika fungsinya asesmen

type InstrumenPemetaanAwal = InstrumenAsesmenBase & {
  jenis: 'pemetaan_awal';
  // untuk_murid: true → konten_murid wajib ada
  konten_murid: {
    petunjuk:            string;
    item_soal:           Array<{ kalimat_konteks: string; kata_target: string }>;
    pertanyaan_menyimak: string[];
    situasi_respons:     string[];
  };
  panduan_guru: {
    tujuan_diagnostik:    string;
    panduan_interpretasi: string;
  } | null;
};

type InstrumenObservasi = InstrumenAsesmenBase & {
  jenis: 'matriks_observasi';
  // untuk_murid mengikuti manifest — bisa true (penilaian antarteman/self-observation)
  // Jika untuk_murid: true → konten_murid wajib ada; jika false → null
  konten_murid: {
    petunjuk:        string;
    kolom_indikator: Array<{ id: string; label: string }>;
  } | null;
  panduan_guru: {
    kode_legend:     string;
    kolom_indikator: Array<{ id: string; label: string }>;
    catatan_kritis:  string;
  };
};

type InstrumenRefleksi = InstrumenAsesmenBase & {
  jenis: 'lembar_refleksi';
  // untuk_murid: true → konten_murid wajib ada
  konten_murid: {
    pertanyaan: Array<{ nomor: number; prompt: string; jumlah_jawaban: number }>;
  };
  panduan_guru: {
    panduan_interpretasi: string;
  } | null;
};

type InstrumenSoal = InstrumenAsesmenBase & {
  jenis: 'soal_latihan';
  // untuk_murid: true → konten_murid wajib ada
  konten_murid: {
    petunjuk: string;
    soal:     Array<{ nomor: number; pertanyaan: string; tipe: string }>;
  };
  panduan_guru: {
    kunci_jawaban:     string[];
    panduan_penskoran: string;
  } | null;
};

type InstrumenPraktikum = InstrumenAsesmenBase & {
  jenis: 'lembar_praktikum';
  // untuk_murid: true → konten_murid wajib ada
  konten_murid: {
    tujuan:              string;
    alat_bahan:          string[];
    langkah_kerja:       string[];
    pertanyaan_analisis: string[];
  };
  panduan_guru: {
    rubrik_penilaian: string;
    catatan_k3:       string | null;
  } | null;
};

type InstrumenPanduanProyek = InstrumenAsesmenBase & {
  jenis: 'panduan_proyek';
  // untuk_murid: true → konten_murid wajib ada
  konten_murid: {
    deskripsi_proyek:    string;
    tahapan:             Array<{ nomor: number; judul: string; instruksi: string }>;
    kriteria_produk:     string[];
    pertanyaan_refleksi: string[];
  };
  panduan_guru: {
    rubrik_penilaian: string;
    contoh_produk:    string | null;
  } | null;
};

type InstrumenCustomAsesmen = InstrumenAsesmenBase & {
  jenis: 'custom';
  konten_murid: Record<string, unknown> | null;
  panduan_guru: Record<string, unknown> | null;
};

---

## L. Tindak Lanjut

```typescript
type TindakLanjut = {
  pilihan_dukungan:     string[]; // ≥ 3
  dukungan_terstruktur: string[]; // ≥ 2 — mapel-agnostic
  tantangan_lanjutan:   string[]; // ≥ 2
};
```

---

## M. Metadata Pedagogis (tidak tampil di dokumen utama)

```typescript
type MetadataPedagogis = {
  dimensi_profil_lulusan: Array<{ dimensi: string; alasan: string; indikator: string }>;
  karakteristik_materi:   { faktual: string; konseptual: string; prosedural: string };
  language_policy: {
    teacher_instruction: string;
    student_instruction: string;
    target_language:     string | null;
  };
};
```

---

## Validator V4.0 (9 aturan)

### 1. Durasi sub_langkah
```
Untuk setiap langkah di setiap pertemuan:
  Σ sub_langkah[].durasi_menit === langkah.durasi_menit
  → ERROR jika tidak sama persis
```

### 2. Durasi pertemuan
```
Σ langkah[].durasi_menit === jp_per_pertemuan × durasi_jp_menit
→ ERROR jika tidak sama persis
```

### 3. Time-feasibility (bergantian)
```
Input: jumlah_murid dari rancang_settings

Untuk setiap sub_langkah dengan mode_pelaksanaan = 'bergantian':
  ukuran     = sub_langkah.ukuran_kelompok (wajib ada)
  n_kelompok = ceil(jumlah_murid / ukuran)
  mnt_per    = estimasi dari deskripsi (default 3 mnt)
  diperlukan = n_kelompok × mnt_per + n_kelompok × 0.5 (transisi)

  Jika diperlukan > sub_langkah.durasi_menit:
    ERROR → AI wajib ganti ke 'simultan' atau 'sampel'
```

### 4. Time-feasibility (individual sequential)
```
Untuk sub_langkah dengan mode_pelaksanaan='individual' AND mode_observasi='semua':
  diperlukan = jumlah_murid × mnt_per_murid

  Jika diperlukan > sub_langkah.durasi_menit:
    ERROR → AI wajib ganti pendekatan
```

### 5. Sumatif — slot waktu nyata
```
SKIP jika asesmen_sumatif === null

Jika tidak null:
  Harus ada TEPAT SATU sub_langkah dengan asesmen_ref = "SUMATIF"
    di pertemuan[placement.pertemuan - 1] dalam langkah nama = placement.fase
  sub_langkah.durasi_menit HARUS === asesmen_sumatif.durasi_menit
  → ERROR jika tidak ditemukan di lokasi yang ditunjuk
  → ERROR jika durasi tidak cocok
  → ERROR jika "SUMATIF" ditemukan lebih dari satu kali
```

### 6. Referential integrity
```
SKIP jika instrumen_pembelajaran[] === [] DAN instrumen_asesmen[] === []

Jika instrumen tidak kosong:
  sub_langkah[].instrumen_ref → harus ada di pembelajaran[].id ATAU asesmen[].id
  asesmen_diagnostik.instrumen_ref → harus ada di asesmen[].id
  asesmen_formatif[].instrumen_ref → harus ada di asesmen[].id
  asesmen_sumatif.instrumen_ref → harus ada di asesmen[].id
  kktp[].instrumen_bukti → boleh [] atau berisi ID dari asesmen[].id atau {F1,F2,F3}

→ ERROR jika ada referensi yang tidak ditemukan
```

### 7. Manifest integrity + placement
```
SKIP jika kedua manifest kosong

Untuk setiap instrumen di instrumen_pembelajaran[]:
  harus ada entri di pembelajaran_manifest dengan id, jenis, digunakan_pada identik
  instrumen.untuk_murid HARUS === manifest.untuk_murid
  ID ini DILARANG muncul di instrumen_asesmen[]

Untuk setiap instrumen di instrumen_asesmen[]:
  harus ada entri di asesmen_manifest dengan id, jenis, digunakan_pada identik
  instrumen.untuk_murid HARUS === manifest.untuk_murid
  ID ini DILARANG muncul di instrumen_pembelajaran[]

Untuk setiap entri manifest (pembelajaran + asesmen):
  harus ada TEPAT SATU instrumen dengan id yang cocok di array yang sesuai

Fase B1: setiap instrumen_ref HARUS ada di pembelajaran_manifest ATAU asesmen_manifest

→ ERROR jika ada ketidakcocokan atau ID yang sama di kedua array
```

### 8. Konten instrumen — contract untuk_murid
```
Untuk setiap instrumen di instrumen_pembelajaran[] DAN instrumen_asesmen[]:
  untuk_murid === true  → konten_murid TIDAK BOLEH null
  untuk_murid === false → konten_murid HARUS null
  panduan_guru boleh null untuk instrumen apapun (opsional)

→ ERROR jika untuk_murid dan konten_murid tidak konsisten
  (mencegah kunci jawaban/rubrik bocor ke cetakan murid)
```

### 9. Mode pelaksanaan + observasi
```
mode_pelaksanaan = 'individual'     → ukuran_kelompok harus undefined atau 1
mode_pelaksanaan = 'kelompok_kecil' → ukuran_kelompok wajib >= 2
mode_pelaksanaan = 'bergantian'     → ukuran_kelompok wajib
mode_observasi   = 'sampel'         → dilarang jika asesmen_ref = "SUMATIF"

→ ERROR jika dilanggar
```

### 11. Naskah alignment (Fase B2)
```
jumlah naskah_fasilitasi[] HARUS === jumlah pertemuan[]
Untuk setiap naskah_fasilitasi[i]:
  naskah.nomor HARUS === pertemuan[i].nomor
  jumlah naskah.langkah HARUS === 6
  setiap naskah.langkah[j].nama HARUS === pertemuan[i].langkah[j].nama
  setiap NaskahSubLangkah.ref HARUS ada tepat satu di SubLangkah.ref pertemuan yang sesuai
  tidak boleh ada ref yang hilang atau tambahan

Catatan: ref di NaskahSubLangkah disalin dari pertemuan[] oleh backend — bukan dibuat AI.
Backend memverifikasi kecocokan ref sebelum menulis ke DB.

→ ERROR jika ada ketidakcocokan — naskah tidak boleh memandu aktivitas berbeda
  dari yang tercatat di modul resmi
```

### 10. KKTP ambang batas (heuristic)
```
Setiap kktp[].ambang_batas harus mengandung setidaknya satu dari:
  angka ("6", "70%", "4"), atau
  level rubrik ("Mandiri", "BT", "DD"), atau
  kondisi terverifikasi ("semua", "tidak ada kesalahan")

DILARANG hanya berisi kata sifat: "dengan tepat", "secara lancar", "dengan benar"
```

---

## Input Pipeline — Perubahan dari V3

### `jumlah_murid`
- Kolom baru: `rancang_settings.jumlah_murid INTEGER CHECK (jumlah_murid > 0)`
- Input UI: angka langsung (bukan chip rentang)
- Pertanyaan di KONTEKS_MODUL: *"Berapa jumlah siswa di kelas ini?"*

### `pilihan_asesmen` → diganti tiga pertanyaan terpisah di ASESMEN_MODUL

Masing-masing jenis asesmen adalah keputusan independen — guru bisa memilih,
melewati, atau mengombinasikan sesuai kebutuhan TP.

| Field | Tipe | Muncul jika |
|-------|------|-------------|
| `gunakan_diagnostik` | ya / lewati | selalu |
| `teknik_diagnostik`  | pilihan satu teknik | gunakan_diagnostik = ya |
| `gunakan_formatif`   | ya / lewati | selalu |
| `gunakan_sumatif`    | ya / lewati | selalu |
| `teknik_sumatif`     | pilihan satu teknik | gunakan_sumatif = ya |

Teknik formatif **tidak ditanya ke guru** — AI yang menentukan teknik dan penempatan
per entri `asesmen_formatif[]` berdasarkan jumlah pertemuan dan aktivitas.

**Mapping teknik → instrumen (tetap sama seperti komentar §E di atas).**

Komponen yang null di `rencana_asesmen` ditentukan dari `gunakan_*`:
- `gunakan_diagnostik = 'lewati'` → `asesmen_diagnostik: null`
- `gunakan_formatif   = 'lewati'` → `asesmen_formatif: null`
- `gunakan_sumatif    = 'lewati'` → `asesmen_sumatif: null`

---

## Backward Compatibility

| `schema_version` | Renderer |
|-----------------|---------|
| `'4.0.0'` | `_renderModulPreviewV400()` — baru |
| `'3.2.0'` | `_renderModulPreviewV320()` — existing |
| tidak ada | `_renderModulPreviewLama()` — existing |

---

## Renderer V4.0 — Dua Tampilan

### Tab 1: Modul Ajar Resmi
*(untuk kepala sekolah, pengawas — bahasa formal, orang ketiga)*

```
[A] Identitas Modul
[B] Capaian & Tujuan Pembelajaran
[C] Kriteria Ketercapaian (KKTP + ambang batas)
[D] Konteks Murid
[E] Materi Esensial
[F] Rencana Asesmen
    [F1] Diagnostik (jika tidak null): tujuan, teknik, waktu, penggunaan hasil
    [F2] Formatif (jika tidak null): per entri — teknik, fase, KKTP, umpan balik
    [F3] Sumatif (jika tidak null): teknik, durasi, placement
[G] Rancangan Pembelajaran
[H] Pertemuan 1 ... N
    - Tujuan + media/alat
    - Langkah: Pembuka → Asesmen Awal → Memahami → Mengaplikasi → Merefleksi → Penutup
    - Sub-langkah + durasi (deskripsi formal)
[I] Tindak Lanjut
[J] Catatan Guru
[K] Lampiran A — Instrumen Pembelajaran (urut digunakan_pada)
    ★ Untuk Murid  jika untuk_murid = true
[L] Lampiran B — Instrumen Asesmen (urut digunakan_pada)
    ★ Untuk Murid  jika untuk_murid = true
```

**Tidak ditampilkan:** `naskah_fasilitasi`, `metadata_pedagogis`, `language_policy`.

---

### Tab 2: Naskah Fasilitasi
*(untuk guru di kelas — bahasa imperatif, langsung, siap diucapkan)*

```
Pertemuan 1 ... N
  └─ PEMBUKA
       Sub-langkah 1
         Naskah guru: "Ucapkan salam dan minta murid berdiri sejenak..."
         Pertanyaan kunci: —
       Sub-langkah 2
         Naskah guru: "Katakan: 'Hari ini kita akan...'"
         Pertanyaan kunci: ["Apa yang kalian tahu tentang...?"]
  └─ ASESMEN AWAL
       ...
  └─ MEMAHAMI
       ...
  └─ (dst.)
```

**Tidak ditampilkan di tab ini:** deskripsi formal, instrumen, metadata.

---

## Checklist Implementasi

### Migration
- [ ] `ALTER TABLE rancang_settings ADD COLUMN jumlah_murid INTEGER CHECK (jumlah_murid > 0)`

### Flow (`rancang-chat-flow.js`)
- [ ] Tambah pertanyaan `jumlah_murid_kelas` di KONTEKS_MODUL (input angka)
- [ ] Di ASESMEN_MODUL: ganti `pilihan_asesmen` + `teknik_asesmen` + `waktu_asesmen` dengan:
  - `gunakan_diagnostik` → pilihan ya/lewati
  - `teknik_diagnostik`  → pilihan satu teknik (kondisional, 3 opsi + rekomendasi)
  - `gunakan_formatif`   → pilihan ya/lewati
  - `gunakan_sumatif`    → pilihan ya/lewati
  - `teknik_sumatif`     → pilihan satu teknik (kondisional, 5 opsi + rekomendasi)

### EF `generate-modul/index.ts`
- [ ] Types V4.0 (NaskahPertemuan, InstrumenPembelajaran, InstrumenAsesmen, semua discriminated union)
- [ ] Instrument Manifest terbagi: pembelajaran_manifest + asesmen_manifest
- [ ] SYSTEM_PROMPT skeleton V4.0 + manifest contract
- [ ] SYSTEM_PROMPT rules: LARANGAN ISTILAH + mapping teknik → instrumen
- [ ] SYSTEM_PROMPT Fase B1: generate pertemuan[] (formal); backend menulis sub_langkah.ref deterministik
- [ ] SYSTEM_PROMPT Fase C: setiap instrumen wajib punya konten_murid + panduan_guru sesuai contract
- [ ] SYSTEM_PROMPT Fase B2: generate naskah_fasilitasi[] SETELAH C; konteks: pertemuan[]+instrumen final+kktp+konteks_murid; backend suntikkan ref dari B1
- [ ] Validator V4.0 (9 aturan)
- [ ] User message builders: baca jumlah_murid + pilihan_asesmen, kirim manifest ke B & C
- [ ] Merge logic Fase D: field names baru

### Frontend (`rancang-chat.js`)
- [ ] `_renderModulPreviewV400()` baru — Tab "Modul Ajar Resmi" (Lampiran A + B, label ★ Untuk Murid)
- [ ] `_renderNaskahFasilitasiV400()` baru — Tab "Naskah Fasilitasi" (naskah_guru + pertanyaan_kunci)
- [ ] Tab switcher di preview: "Modul Resmi" | "Naskah Fasilitasi"
- [ ] Routing `renderModulPreview()` tambah cek `'4.0.0'`

### Deploy & push
- [ ] `supabase db push --linked --dry-run` → konfirmasi → push
- [ ] `supabase functions deploy generate-modul --project-ref teccdzetrdjowqemnuuc`
- [ ] `git push origin main`
