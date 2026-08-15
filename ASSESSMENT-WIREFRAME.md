# ASSESSMENT-WIREFRAME.md
# Panduan 42 Pola Wireframe Tab Penilaian — SIP Mandiri

> INSTRUKSI UNTUK CLAUDE CODE:
> 1. Baca file ini SEBELUM menyentuh classroom-assessment.js
> 2. Setiap modal penilaian WAJIB mengikuti pola yang sesuai
> 3. Jenis + Teknik + Instrumen menentukan pola mana yang dipakai
> 4. Header dan footer SELALU sama — jangan variasi
> 5. Body instrumen WAJIB sesuai pola — jangan improvisasi
> 6. Output per siswa WAJIB sesuai jenis penilaian

---

## 1. Prinsip Umum

- Semua field opsional — guru yang memutuskan seberapa lengkap mengisi
- Siswa selalu dipilih via dropdown + checklist per deskriptor/predikat
- Guru mengelompokkan siswa ke deskriptor — bukan menilai satu per satu
- Tujuan penilaian ada di semua jenis (Diagnostik / Formatif / Sumatif)
- Refleksi guru ada di semua jenis

---

## 2. Komponen Standar (berlaku semua 42 pola)

### HEADER MODAL (selalu tampil di atas body instrumen)

```
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik / Formatif / Sumatif ▼]
Teknik      [Observasi / Tes / Penugasan / Proyek / Portofolio / Unjuk Kerja ▼]
Instrumen   [sesuai teknik yang dipilih ▼]
```

### FOOTER MODAL (selalu tampil di bawah body instrumen)

```
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

### OUTPUT PER SISWA (berbeda per jenis — tampil di bawah body instrumen, sebelum footer)

**Diagnostik:**
```
Output per siswa
Pilih siswa → status → grup otomatis
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)
```

**Formatif:**
```
Output per siswa
Pilih siswa → status → umpan balik → tindak lanjut
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]
```

**Sumatif:**
```
Output per siswa
Pilih siswa → nilai angka → KKTP otomatis → tindak lanjut
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]
```

---

## 3. Aturan Cascade Teknik → Instrumen

| Teknik | Instrumen yang tersedia |
|--------|------------------------|
| Observasi | Lembar Observasi / Catatan Anekdot / Checklist |
| Tes | Pilihan Ganda / Uraian / Campuran |
| Penugasan | Rubrik / Checklist |
| Proyek | Rubrik / Checklist |
| Portofolio | Rubrik / Checklist |
| Unjuk Kerja | Rubrik / Checklist |

---

## 4. Pola Rubrik Standar (dipakai semua teknik ber-instrumen Rubrik)

- 4 predikat default: Sangat Berkembang / Berkembang Sesuai Harapan / Mulai Berkembang / Belum Berkembang
- Setiap predikat punya field deskripsi opsional (guru tulis sendiri)
- Setiap predikat punya dropdown + checklist siswa
- Aspek bisa ditambah bebas oleh guru

```
Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ Budi] [✓ Siti]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ Ahmad]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ Dewi]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼]
[+ Tambah aspek]
```

---

## 5. Pola Checklist Standar (dipakai semua teknik ber-instrumen Checklist)

- Item bisa ditambah bebas oleh guru
- Setiap item punya dropdown + checklist siswa (siswa yang SUDAH memenuhi item ini)

```
Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ Budi] [✓ Siti]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ Ahmad] [✓ Dewi]
[+ Tambah item]
```

---

## 6. Pola Lembar Observasi Standar

- Aspek observasi bisa ditambah bebas oleh guru
- Setiap aspek: nama aspek + indikator opsional + dropdown siswa per tingkat pengamatan

```
Aspek observasi 1: ___________________________
Indikator: [tuliskan indikator opsional...]
  Terlihat jelas: [pilih ▼] [✓ Budi] [✓ Siti]
  Terlihat: [pilih ▼] [✓ Ahmad]
  Belum terlihat: [pilih ▼] [✓ Dewi]
[+ Tambah aspek]
```

---

## 7. Pola Catatan Anekdot Standar

- Guru mencatat perilaku/kejadian spesifik per siswa atau per kejadian
- Bisa per siswa (1 siswa → catatan) atau per kejadian (1 kejadian → banyak siswa)

```
Mode: [Per Siswa / Per Kejadian ▼]

--- mode Per Siswa ---
Siswa: [pilih ▼]
Deskripsi kejadian: [tuliskan...]
Interpretasi: [tuliskan opsional...]

--- mode Per Kejadian ---
Deskripsi kejadian: [tuliskan...]
Siswa yang terlibat: [pilih ▼] [✓ Budi] [✓ Siti]
Interpretasi: [tuliskan opsional...]
[+ Tambah catatan]
```

---

## 8. Pola Tes — Pilihan Ganda Standar

- Jumlah soal bebas, bobot per soal bisa diisi atau dibiarkan sama rata
- Jawaban benar diisi guru, siswa dipilih per soal per jawaban (atau via rekap skor)

```
Jumlah soal: [___]
Bobot per soal: [sama rata / custom ▼]

Soal 1: [tuliskan pertanyaan opsional...]
  Kunci jawaban: [A/B/C/D ▼]
  Siswa menjawab benar: [pilih ▼] [✓ Budi]
  Siswa menjawab salah: [pilih ▼] [✓ Siti] [✓ Dewi]

Soal 2: [tuliskan pertanyaan opsional...]
  Kunci jawaban: [A/B/C/D ▼]
  Siswa menjawab benar: [pilih ▼] [✓ Ahmad]
  Siswa menjawab salah: [pilih ▼] [✓ Budi]

[+ Tambah soal]
Rekap skor dihitung otomatis dari pilihan di atas
```

---

## 9. Pola Tes — Uraian Standar

- Soal uraian bebas, rubrik penilaian opsional per soal
- Guru bisa langsung input skor per siswa per soal

```
Soal 1: [tuliskan pertanyaan opsional...]
  Skor maksimal: [___]
  Rubrik opsional: [tuliskan kriteria penilaian...]
  Input skor per siswa:
    [pilih siswa ▼] → Skor: [___]
    [+ Tambah siswa]

Soal 2: [tuliskan pertanyaan opsional...]
  Skor maksimal: [___]
  Rubrik opsional: [tuliskan kriteria penilaian...]
  Input skor per siswa:
    [pilih siswa ▼] → Skor: [___]
    [+ Tambah siswa]

[+ Tambah soal]
Total skor dihitung otomatis
```

---

## 10. Pola Tes — Campuran Standar

- Gabungan pilihan ganda + uraian dalam satu penilaian
- Bobot per bagian bisa diatur guru

```
Bagian A — Pilihan Ganda
  Jumlah soal: [___]   Bobot bagian: [___]%
  [ikuti pola Pilihan Ganda]

Bagian B — Uraian
  Jumlah soal: [___]   Bobot bagian: [___]%
  [ikuti pola Uraian]

Total bobot: 100%
Skor akhir dihitung otomatis
```

---

## 11. 42 Pola Lengkap

> Setiap pola menampilkan: Header (terisi) → Body instrumen → Output per siswa → Footer
> Header dan Footer selalu sama persis — lihat §2

---

### 1. Diagnostik × Observasi × Lembar Observasi

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Observasi ▼]
Instrumen   [Lembar Observasi ▼]

──────────────── BODY ──────────────────
Aspek observasi 1: ___________________________
Indikator: [tuliskan indikator opsional...]
  Terlihat jelas: [pilih ▼] [✓ nama siswa]
  Terlihat: [pilih ▼] [✓ nama siswa]
  Belum terlihat: [pilih ▼] [✓ nama siswa]

Aspek observasi 2: ___________________________
Indikator: [tuliskan indikator opsional...]
  Terlihat jelas: [pilih ▼] [✓ nama siswa]
  Terlihat: [pilih ▼] [✓ nama siswa]
  Belum terlihat: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 2. Diagnostik × Observasi × Catatan Anekdot

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Observasi ▼]
Instrumen   [Catatan Anekdot ▼]

──────────────── BODY ──────────────────
Mode: [Per Siswa / Per Kejadian ▼]

--- mode Per Siswa ---
Siswa: [pilih ▼]
Deskripsi kejadian: [tuliskan...]
Interpretasi: [tuliskan opsional...]

--- mode Per Kejadian ---
Deskripsi kejadian: [tuliskan...]
Siswa yang terlibat: [pilih ▼] [✓ nama siswa]
Interpretasi: [tuliskan opsional...]

[+ Tambah catatan]

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 3. Diagnostik × Observasi × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Observasi ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 4. Diagnostik × Tes × Pilihan Ganda

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Tes ▼]
Instrumen   [Pilihan Ganda ▼]

──────────────── BODY ──────────────────
Jumlah soal: [___]
Bobot per soal: [sama rata / custom ▼]

Soal 1: [tuliskan pertanyaan opsional...]
  Kunci jawaban: [A/B/C/D ▼]
  Siswa menjawab benar: [pilih ▼] [✓ nama siswa]
  Siswa menjawab salah: [pilih ▼] [✓ nama siswa]

Soal 2: [tuliskan pertanyaan opsional...]
  Kunci jawaban: [A/B/C/D ▼]
  Siswa menjawab benar: [pilih ▼] [✓ nama siswa]
  Siswa menjawab salah: [pilih ▼] [✓ nama siswa]

[+ Tambah soal]
Rekap skor dihitung otomatis

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 5. Diagnostik × Tes × Uraian

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Tes ▼]
Instrumen   [Uraian ▼]

──────────────── BODY ──────────────────
Soal 1: [tuliskan pertanyaan opsional...]
  Skor maksimal: [___]
  Rubrik opsional: [tuliskan kriteria penilaian...]
  Input skor per siswa:
    [pilih siswa ▼] → Skor: [___]
    [+ Tambah siswa]

Soal 2: [tuliskan pertanyaan opsional...]
  Skor maksimal: [___]
  Rubrik opsional: [tuliskan kriteria penilaian...]
  Input skor per siswa:
    [pilih siswa ▼] → Skor: [___]
    [+ Tambah siswa]

[+ Tambah soal]
Total skor dihitung otomatis

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 6. Diagnostik × Tes × Campuran

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Tes ▼]
Instrumen   [Campuran ▼]

──────────────── BODY ──────────────────
Bagian A — Pilihan Ganda
  Jumlah soal: [___]   Bobot bagian: [___]%
  Soal 1: [tuliskan pertanyaan opsional...]
    Kunci jawaban: [A/B/C/D ▼]
    Siswa menjawab benar: [pilih ▼] [✓ nama siswa]
    Siswa menjawab salah: [pilih ▼] [✓ nama siswa]
  [+ Tambah soal PG]

Bagian B — Uraian
  Jumlah soal: [___]   Bobot bagian: [___]%
  Soal 1: [tuliskan pertanyaan opsional...]
    Skor maksimal: [___]
    Rubrik opsional: [tuliskan kriteria penilaian...]
    Input skor per siswa:
      [pilih siswa ▼] → Skor: [___]
      [+ Tambah siswa]
  [+ Tambah soal uraian]

Total bobot: 100%
Skor akhir dihitung otomatis

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 7. Diagnostik × Penugasan × Rubrik

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Penugasan ▼]
Instrumen   [Rubrik ▼]

──────────────── BODY ──────────────────
Deskripsi tugas: [tuliskan opsional...]

Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 8. Diagnostik × Penugasan × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Penugasan ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Deskripsi tugas: [tuliskan opsional...]

Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 9. Diagnostik × Proyek × Rubrik

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Proyek ▼]
Instrumen   [Rubrik ▼]

──────────────── BODY ──────────────────
Nama proyek: [tuliskan opsional...]
Deskripsi: [tuliskan opsional...]

Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 10. Diagnostik × Proyek × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Proyek ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Nama proyek: [tuliskan opsional...]
Deskripsi: [tuliskan opsional...]

Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 11. Diagnostik × Portofolio × Rubrik

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Portofolio ▼]
Instrumen   [Rubrik ▼]

──────────────── BODY ──────────────────
Tema portofolio: [tuliskan opsional...]
Periode: [tuliskan opsional...]

Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 12. Diagnostik × Portofolio × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Portofolio ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Tema portofolio: [tuliskan opsional...]
Periode: [tuliskan opsional...]

Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 13. Diagnostik × Unjuk Kerja × Rubrik

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Unjuk Kerja ▼]
Instrumen   [Rubrik ▼]

──────────────── BODY ──────────────────
Deskripsi unjuk kerja: [tuliskan opsional...]

Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 14. Diagnostik × Unjuk Kerja × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Diagnostik ▼]
Teknik      [Unjuk Kerja ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Deskripsi unjuk kerja: [tuliskan opsional...]

Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Status: [PAHAM / BELUM_PAHAM / PERLU_PERHATIAN ▼]
Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 15. Formatif × Observasi × Lembar Observasi

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Observasi ▼]
Instrumen   [Lembar Observasi ▼]

──────────────── BODY ──────────────────
Aspek observasi 1: ___________________________
Indikator: [tuliskan indikator opsional...]
  Terlihat jelas: [pilih ▼] [✓ nama siswa]
  Terlihat: [pilih ▼] [✓ nama siswa]
  Belum terlihat: [pilih ▼] [✓ nama siswa]

Aspek observasi 2: ___________________________
Indikator: [tuliskan indikator opsional...]
  Terlihat jelas: [pilih ▼] [✓ nama siswa]
  Terlihat: [pilih ▼] [✓ nama siswa]
  Belum terlihat: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 16. Formatif × Observasi × Catatan Anekdot

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Observasi ▼]
Instrumen   [Catatan Anekdot ▼]

──────────────── BODY ──────────────────
Mode: [Per Siswa / Per Kejadian ▼]

--- mode Per Siswa ---
Siswa: [pilih ▼]
Deskripsi kejadian: [tuliskan...]
Interpretasi: [tuliskan opsional...]

--- mode Per Kejadian ---
Deskripsi kejadian: [tuliskan...]
Siswa yang terlibat: [pilih ▼] [✓ nama siswa]
Interpretasi: [tuliskan opsional...]

[+ Tambah catatan]

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 17. Formatif × Observasi × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Observasi ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 18. Formatif × Tes × Pilihan Ganda

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Tes ▼]
Instrumen   [Pilihan Ganda ▼]

──────────────── BODY ──────────────────
Jumlah soal: [___]
Bobot per soal: [sama rata / custom ▼]

Soal 1: [tuliskan pertanyaan opsional...]
  Kunci jawaban: [A/B/C/D ▼]
  Siswa menjawab benar: [pilih ▼] [✓ nama siswa]
  Siswa menjawab salah: [pilih ▼] [✓ nama siswa]

[+ Tambah soal]
Rekap skor dihitung otomatis

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 19. Formatif × Tes × Uraian

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Tes ▼]
Instrumen   [Uraian ▼]

──────────────── BODY ──────────────────
Soal 1: [tuliskan pertanyaan opsional...]
  Skor maksimal: [___]
  Rubrik opsional: [tuliskan kriteria penilaian...]
  Input skor per siswa:
    [pilih siswa ▼] → Skor: [___]
    [+ Tambah siswa]

[+ Tambah soal]
Total skor dihitung otomatis

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 20. Formatif × Tes × Campuran

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Tes ▼]
Instrumen   [Campuran ▼]

──────────────── BODY ──────────────────
Bagian A — Pilihan Ganda
  Jumlah soal: [___]   Bobot bagian: [___]%
  Soal 1: [tuliskan pertanyaan opsional...]
    Kunci jawaban: [A/B/C/D ▼]
    Siswa menjawab benar: [pilih ▼] [✓ nama siswa]
    Siswa menjawab salah: [pilih ▼] [✓ nama siswa]
  [+ Tambah soal PG]

Bagian B — Uraian
  Jumlah soal: [___]   Bobot bagian: [___]%
  Soal 1: [tuliskan pertanyaan opsional...]
    Skor maksimal: [___]
    Input skor per siswa:
      [pilih siswa ▼] → Skor: [___]
      [+ Tambah siswa]
  [+ Tambah soal uraian]

Total bobot: 100%
Skor akhir dihitung otomatis

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 21. Formatif × Penugasan × Rubrik

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Penugasan ▼]
Instrumen   [Rubrik ▼]

──────────────── BODY ──────────────────
Deskripsi tugas: [tuliskan opsional...]

Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 22. Formatif × Penugasan × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Penugasan ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Deskripsi tugas: [tuliskan opsional...]

Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 23. Formatif × Proyek × Rubrik

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Proyek ▼]
Instrumen   [Rubrik ▼]

──────────────── BODY ──────────────────
Nama proyek: [tuliskan opsional...]
Deskripsi: [tuliskan opsional...]

Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 24. Formatif × Proyek × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Proyek ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Nama proyek: [tuliskan opsional...]
Deskripsi: [tuliskan opsional...]

Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 25. Formatif × Portofolio × Rubrik

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Portofolio ▼]
Instrumen   [Rubrik ▼]

──────────────── BODY ──────────────────
Tema portofolio: [tuliskan opsional...]
Periode: [tuliskan opsional...]

Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 26. Formatif × Portofolio × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Portofolio ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Tema portofolio: [tuliskan opsional...]
Periode: [tuliskan opsional...]

Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 27. Formatif × Unjuk Kerja × Rubrik

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Unjuk Kerja ▼]
Instrumen   [Rubrik ▼]

──────────────── BODY ──────────────────
Deskripsi unjuk kerja: [tuliskan opsional...]

Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 28. Formatif × Unjuk Kerja × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Formatif ▼]
Teknik      [Unjuk Kerja ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Deskripsi unjuk kerja: [tuliskan opsional...]

Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Status: [TERCAPAI / BERKEMBANG / PERLU_DUKUNGAN ▼]
Umpan balik: [tuliskan umpan balik...]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 29. Sumatif × Observasi × Lembar Observasi

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Observasi ▼]
Instrumen   [Lembar Observasi ▼]

──────────────── BODY ──────────────────
Aspek observasi 1: ___________________________
Indikator: [tuliskan indikator opsional...]
  Terlihat jelas: [pilih ▼] [✓ nama siswa]
  Terlihat: [pilih ▼] [✓ nama siswa]
  Belum terlihat: [pilih ▼] [✓ nama siswa]

Aspek observasi 2: ___________________________
Indikator: [tuliskan indikator opsional...]
  Terlihat jelas: [pilih ▼] [✓ nama siswa]
  Terlihat: [pilih ▼] [✓ nama siswa]
  Belum terlihat: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 30. Sumatif × Observasi × Catatan Anekdot

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Observasi ▼]
Instrumen   [Catatan Anekdot ▼]

──────────────── BODY ──────────────────
Mode: [Per Siswa / Per Kejadian ▼]

--- mode Per Siswa ---
Siswa: [pilih ▼]
Deskripsi kejadian: [tuliskan...]
Interpretasi: [tuliskan opsional...]

--- mode Per Kejadian ---
Deskripsi kejadian: [tuliskan...]
Siswa yang terlibat: [pilih ▼] [✓ nama siswa]
Interpretasi: [tuliskan opsional...]

[+ Tambah catatan]

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 31. Sumatif × Observasi × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Observasi ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 32. Sumatif × Tes × Pilihan Ganda

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Tes ▼]
Instrumen   [Pilihan Ganda ▼]

──────────────── BODY ──────────────────
Jumlah soal: [___]
Bobot per soal: [sama rata / custom ▼]

Soal 1: [tuliskan pertanyaan opsional...]
  Kunci jawaban: [A/B/C/D ▼]
  Siswa menjawab benar: [pilih ▼] [✓ nama siswa]
  Siswa menjawab salah: [pilih ▼] [✓ nama siswa]

[+ Tambah soal]
Rekap skor dihitung otomatis

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 33. Sumatif × Tes × Uraian

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Tes ▼]
Instrumen   [Uraian ▼]

──────────────── BODY ──────────────────
Soal 1: [tuliskan pertanyaan opsional...]
  Skor maksimal: [___]
  Rubrik opsional: [tuliskan kriteria penilaian...]
  Input skor per siswa:
    [pilih siswa ▼] → Skor: [___]
    [+ Tambah siswa]

[+ Tambah soal]
Total skor dihitung otomatis

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 34. Sumatif × Tes × Campuran

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Tes ▼]
Instrumen   [Campuran ▼]

──────────────── BODY ──────────────────
Bagian A — Pilihan Ganda
  Jumlah soal: [___]   Bobot bagian: [___]%
  Soal 1: [tuliskan pertanyaan opsional...]
    Kunci jawaban: [A/B/C/D ▼]
    Siswa menjawab benar: [pilih ▼] [✓ nama siswa]
    Siswa menjawab salah: [pilih ▼] [✓ nama siswa]
  [+ Tambah soal PG]

Bagian B — Uraian
  Jumlah soal: [___]   Bobot bagian: [___]%
  Soal 1: [tuliskan pertanyaan opsional...]
    Skor maksimal: [___]
    Input skor per siswa:
      [pilih siswa ▼] → Skor: [___]
      [+ Tambah siswa]
  [+ Tambah soal uraian]

Total bobot: 100%
Skor akhir dihitung otomatis

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 35. Sumatif × Penugasan × Rubrik

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Penugasan ▼]
Instrumen   [Rubrik ▼]

──────────────── BODY ──────────────────
Deskripsi tugas: [tuliskan opsional...]

Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 36. Sumatif × Penugasan × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Penugasan ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Deskripsi tugas: [tuliskan opsional...]

Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 37. Sumatif × Proyek × Rubrik

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Proyek ▼]
Instrumen   [Rubrik ▼]

──────────────── BODY ──────────────────
Nama proyek: [tuliskan opsional...]
Deskripsi: [tuliskan opsional...]

Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 38. Sumatif × Proyek × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Proyek ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Nama proyek: [tuliskan opsional...]
Deskripsi: [tuliskan opsional...]

Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 39. Sumatif × Portofolio × Rubrik

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Portofolio ▼]
Instrumen   [Rubrik ▼]

──────────────── BODY ──────────────────
Tema portofolio: [tuliskan opsional...]
Periode: [tuliskan opsional...]

Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 40. Sumatif × Portofolio × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Portofolio ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Tema portofolio: [tuliskan opsional...]
Periode: [tuliskan opsional...]

Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 41. Sumatif × Unjuk Kerja × Rubrik

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Unjuk Kerja ▼]
Instrumen   [Rubrik ▼]

──────────────── BODY ──────────────────
Deskripsi unjuk kerja: [tuliskan opsional...]

Aspek 1: ___________________________
├── Sangat Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Berkembang Sesuai Harapan
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
├── Mulai Berkembang
│   Deskripsi: [tuliskan deskriptor...]
│   Siswa: [pilih ▼] [✓ nama siswa]
└── Belum Berkembang
    Deskripsi: [tuliskan deskriptor...]
    Siswa: [pilih ▼] [✓ nama siswa]

[+ Tambah aspek]

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

### 42. Sumatif × Unjuk Kerja × Checklist

```
──────────────── HEADER ────────────────
Tujuan penilaian
┌─────────────────────────────────────┐
│ Apa yang ingin diketahui/dipantau?  │
└─────────────────────────────────────┘
Jenis       [Sumatif ▼]
Teknik      [Unjuk Kerja ▼]
Instrumen   [Checklist ▼]

──────────────── BODY ──────────────────
Deskripsi unjuk kerja: [tuliskan opsional...]

Item 1: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
Item 2: ___________________________
  Siswa yang memenuhi: [pilih ▼] [✓ nama siswa]
[+ Tambah item]

──────────────── OUTPUT PER SISWA ──────
Nilai angka: [___] (0–100)
KKTP: [otomatis dari rentang KKTP yang sudah diset]
Tindak lanjut: [tuliskan tindak lanjut...]

──────────────── FOOTER ────────────────
Refleksi guru
┌─────────────────────────────────────┐
│ Catatan refleksi...                 │
└─────────────────────────────────────┘
[Batal]                  [Simpan Penilaian]
```

---

*ASSESSMENT-WIREFRAME.md — 42 pola lengkap, tidak boleh diringkas saat implementasi*
