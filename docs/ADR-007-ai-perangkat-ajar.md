# ADR-007 — AI Generator Perangkat Ajar

Status: ACCEPTED
Tanggal: 9 Agustus 2026
Decider: Romo (Teguh Riyono)

---

## ATURAN KERJA CLAUDE CODE

### Kapan lanjut:
- Setelah tabel CP dan teaching_contexts applied dan terverifikasi
- Setelah Edge Function baru dapat dipanggil dari browser dan mengembalikan output valid
- Setelah UI tab "Rancang Pembelajaran" ter-render dan alur dialog berjalan penuh
- Setelah flag `is_ai_enabled` dapat dibaca oleh RLS dan UI

### Kapan STOP dan lapor:
- Tabel CP membutuhkan struktur yang berbeda dari rancangan di ADR ini
- Prompt template menghasilkan output yang tidak realistis secara konsisten
- Biaya token per sesi melebihi estimasi yang wajar untuk add-on berbayar
- Perlu keputusan bisnis baru: harga, trial AI, atau bundling dengan tier lain

### Wajib dipatuhi:
- `/sip-start` di awal, `/sip-migration-check` sebelum push, `/sip-invert` sebelum implementasi
- SECURITY DEFINER + REVOKE FROM PUBLIC + REVOKE FROM anon + GRANT TO authenticated
- Tenant isolation: semua data AI terikat `classroom_id` — tidak ada data global per guru
- Fitur ini berbayar — selalu cek `is_ai_enabled = true` sebelum memanggil Edge Function
- Output AI tidak menyebut fasilitas yang tidak dimiliki guru (berdasarkan jawaban Blok 3)
- Bahasa output: bahasa guru ke guru, bukan bahasa regulasi atau birokrasi

---

## Konteks

Guru SIP Mandiri membutuhkan alat bantu untuk menyusun perangkat ajar yang realistis
dan langsung bisa dijalankan di kelas — bukan dokumen administrasi formal yang hanya
memenuhi syarat supervisi.

Masalah yang ada saat ini:
- Guru menghabiskan waktu banyak untuk menyusun ATP, modul, dan rencana pertemuan
  dari awal setiap semester
- Dokumen yang dihasilkan sering terlalu ideal dan tidak mempertimbangkan kondisi nyata
  kelas (keterbatasan fasilitas, karakter siswa, jadwal yang tidak ideal)
- Guru SMK menghadapi kompleksitas tambahan: PKL, DUDI, sertifikasi, jadwal blok

Filosofi desain: **backward design** — alur dimulai dari Capaian Pembelajaran (CP)
yang ditetapkan pemerintah, bukan dari template dokumen administrasi.
Setiap output AI harus bisa langsung digunakan di kelas hari itu juga.

Fitur ini adalah **premium add-on** — tidak termasuk dalam akun dasar SIP Mandiri.

---

## Keputusan Arsitektur

### K1 — Data CP Disimpan di DB, Bukan Di-generate AI

Capaian Pembelajaran (CP) per mata pelajaran, per elemen, per fase (A–F),
dan per jenjang (SD/SMP/SMA/SMK) adalah data tetap dari pemerintah.
Data ini disimpan sebagai tabel referensi di database, bukan dihasilkan oleh AI.

**Alasan:**
- CP adalah dokumen regulasi yang tidak boleh diinterpretasi ulang secara acak
- Menyimpan CP di DB memungkinkan sistem menampilkan teks normatif yang tepat
  sebelum AI mulai bekerja
- AI hanya mengolah CP yang sudah dipilih guru — bukan mengarang CP baru

**Struktur tabel CP (referensi):**
```
capaian_pembelajaran
  id, jenjang, fase, mata_pelajaran, elemen, teks_cp, versi_dokumen
```

---

### K2 — Alur Dialog Guru: 3 Blok + Percabangan SMK

Guru menjawab pertanyaan bertahap dalam tiga blok utama.
Setiap blok menghasilkan satu output antara yang bisa dilihat guru sebelum lanjut.

---

#### BLOK 1 — Identitas Konteks (4 pertanyaan)

| Kode | Pertanyaan |
|------|-----------|
| B1-1 | Mata pelajaran apa yang akan Anda rancang? |
| B1-2 | Jenjang: SD / SMP / SMA / SMK |
| B1-3 | Fase: A / B / C / D / E / F |
| B1-4 | Berapa JP per minggu untuk mapel ini? |

**Output setelah Blok 1:**
Sistem menampilkan teks CP normatif dari DB sesuai pilihan guru,
disertai ringkasan konkret per elemen dengan bahasa sehari-hari:
> *"Bayangkan siswa Anda: di akhir fase ini mereka diharapkan bisa ..."*

Guru membaca ringkasan ini sebelum lanjut ke Blok 2 (atau Percabangan SMK).

---

#### PERCABANGAN SMK — 10 Pertanyaan Konteks Kejuruan

Muncul **hanya jika B1-2 = SMK**, antara Blok 1 dan Blok 2.

| Kode | Pertanyaan |
|------|-----------|
| SMK-1 | Jurusan / program keahlian |
| SMK-2 | Kelompok mapel: Normatif / Adaptif / Produktif |
| SMK-3 | Tujuan utama pembelajaran semester ini (multi-pilih): PKL, Dunia Kerja, Sertifikasi, LKS, Proyek Sekolah, Lainnya |
| SMK-4 | Apakah ada siswa yang sedang PKL semester ini? |
| SMK-5 | Target sertifikasi yang akan dicapai siswa (jika ada) |
| SMK-6 | Pola jadwal mengajar: reguler harian / blok / campuran |
| SMK-7 | Berapa lama proyek/unit produksi biasanya berlangsung? |
| SMK-8 | Seberapa aktif hubungan dengan industri/DUDI saat ini? |
| SMK-9 | Industri apa yang dominan di daerah Anda? |
| SMK-10 | Apakah ada mitra DUDI yang aktif saat ini? (nama opsional) |

Setelah SMK-10, lanjut ke Asesmen Diagnostik (DNK/DK) sebelum Blok 2.

---

#### ASESMEN DIAGNOSTIK DNK + DK (6 pertanyaan)

Muncul dalam dua situasi:
- Setelah Percabangan SMK (untuk guru SMK)
- Di awal Blok 2 untuk guru non-SMK (sebelum P-1)

Tujuan: membantu AI memahami kondisi nyata siswa sebelum merancang pengalaman belajar.

| Kode | Kategori | Pertanyaan |
|------|---------|-----------|
| DNK-1 | Non-Kognitif | Bagaimana perasaan umum siswa terhadap mapel ini? |
| DNK-2 | Non-Kognitif | Seberapa relevan mapel ini menurut persepsi siswa? |
| DNK-3 | Non-Kognitif | Bagaimana kondisi umum siswa saat masuk kelas? (semangat/lelah/bervariasi) |
| DK-1 | Kognitif | Sejauh mana siswa sudah mengenal konsep dasar mapel ini? |
| DK-2 | Kognitif | Seberapa baik siswa mengikuti instruksi bertahap? |
| DK-3 | Kognitif | Bagaimana hasil belajar siswa secara umum di periode sebelumnya? |

---

#### BLOK 2 — Preferensi Pembelajaran (7 pertanyaan)

| Kode | Pertanyaan |
|------|-----------|
| P-1 | Kemampuan awal siswa secara keseluruhan (untuk non-SMK — setelah DNK/DK) |
| P-2 | Karakter umum kelas (multi-pilih): aktif, pasif, kompetitif, kolaboratif, mudah terdistraksi, butuh struktur ketat, lainnya |
| P-3 | Tingkat kemandirian siswa: perlu banyak panduan / cukup mandiri / sangat mandiri |
| P-4 | Elemen CP mana yang ingin diprioritaskan semester ini? (dinamis — berdasarkan elemen CP yang tampil di output Blok 1) |
| P-5 | Pendekatan dan model pembelajaran: Spiral / Linear / Tematik / PBL / PjBL / Discovery / Campuran |
| P-6 | Gaya mengajar Anda yang paling nyaman: ceramah interaktif / diskusi / proyek / demonstrasi / campuran |
| P-7 | Cara penilaian yang paling sering Anda gunakan: observasi / portofolio / tes tertulis / produk / presentasi |

**Output setelah Blok 2:**
AI men-generate **draft ATP (Alur Tujuan Pembelajaran) per fase penuh** —
urutan TP yang logis, realistis sesuai JP per minggu, mempertimbangkan pendekatan
dan model pembelajaran yang dipilih.

Guru membaca draft ATP, dapat menyesuaikan urutan atau menghapus TP yang tidak relevan,
lalu mengkonfirmasi. Setelah konfirmasi, guru memilih **satu TP** yang akan dikerjakan
lebih detail di Blok 3.

---

#### BLOK 3 — Konteks Realistis Kelas (9 pertanyaan, setelah guru pilih satu TP)

| Kode | Pertanyaan |
|------|-----------|
| K-1 | Berapa jumlah siswa di kelas ini? |
| K-2 | Apakah ada siswa berkebutuhan khusus? (jenis dan jumlah, opsional) |
| K-3 | Fasilitas yang tersedia di kelas (multi-pilih): proyektor, laptop/PC siswa, papan tulis, alat peraga, lab, bengkel, lainnya |
| K-4 | Situasi HP: semua siswa punya HP / sebagian / tidak boleh dibawa / boleh untuk belajar |
| K-5 | Akses internet di kelas: lancar / tidak stabil / tidak ada |
| K-6 | Materi cetak: buku paket tersedia / hanya LKS / tidak ada materi cetak |
| K-7 | Aktivitas yang ingin dihindari di kelas ini (opsional) |
| K-8 | Kendala utama yang sering muncul di kelas Anda (opsional) |
| K-9 | Di daerah mana Anda mengajar? (opsional — untuk kontekstualisasi contoh) |

**Output setelah Blok 3:**
AI men-generate **rencana pertemuan lengkap** untuk TP yang dipilih guru.

---

### K3 — Format Output Rencana Pertemuan

Output adalah dokumen praktis dalam **bahasa guru ke guru** — bukan bahasa regulasi,
bukan bahasa birokrasi, bukan bahasa Permendikbud.

Satu output mencakup **satu TP penuh** (bisa beberapa pertemuan).
AI menyesuaikan jumlah pertemuan berdasarkan JP per minggu yang diisi di Blok 1.

**5 komponen wajib per TP:**

1. **Tujuan Pembelajaran**
   Ditulis dalam kalimat yang guru bisa baca langsung kepada siswa.

2. **Pengalaman Belajar** (tiga tahap berurutan)
   - Memahami: siswa diajak membangun pemahaman awal
   - Mengaplikasi: siswa mencoba menerapkan dalam konteks nyata
   - Merefleksi: siswa memaknai apa yang sudah dipelajari

3. **Asesmen + KKTP**
   Checklist pengamatan guru — apa yang perlu diamati, kapan, dan tanda ketercapaian.
   Format checklist, bukan rubrik formal.

4. **Lembar Kerja Siswa**
   - Tugas tulis yang bisa dikerjakan dengan atau tanpa HP (sesuai K-4)
   - Refleksi diri siswa (3–5 pertanyaan pendek)

5. **Tindak Lanjut**
   Tiga jalur berdasarkan hasil asesmen:
   - Pengayaan: untuk siswa yang sudah melampaui TP
   - Penguatan: untuk siswa yang mencapai TP tapi belum solid
   - Pendampingan: untuk siswa yang belum mencapai TP

**Per pertemuan berisi:**
- Tujuan hari ini (satu kalimat)
- Yang perlu disiapkan guru sebelum masuk kelas
- Aktivitas bertahap dengan alokasi waktu (dalam menit)
- Catatan guru: antisipasi situasi yang mungkin terjadi

**Aturan realistis:**
AI tidak menyebut fasilitas, alat, atau metode yang tidak tersedia berdasarkan
jawaban guru di Blok 3. Jika guru tidak punya proyektor, tidak ada aktivitas
yang mengandalkan slide presentasi.

---

### K4 — Tabel Database Baru

Diadopsi dari SIP SMK dengan penyesuaian kritis.

**Yang DIADOPSI dari SIP SMK:**

```
teaching_contexts     → konteks mengajar guru per classroom (Blok 1–3)
teacher_documents     → dokumen output yang dihasilkan AI
generation_jobs       → antrian dan status job AI
prompt_templates      → template prompt per tipe dokumen
```

**Yang TIDAK DIADOPSI:**

| Tabel SIP SMK | Alasan tidak diadopsi |
|---------------|-----------------------|
| `teacher_document_approvals` | Tidak ada Waka di SIP Mandiri |
| Prota dan Prosem | Di luar scope — SIP Mandiri fokus pada TP dan rencana pertemuan |
| `teacher_profiles` (terpisah) | Di SIP Mandiri, konteks guru melekat ke `profiles` + classroom |

**Perbedaan kritis dari SIP SMK:**

Di SIP SMK, `teaching_contexts` dicatat tapi **tidak masuk ke prompt AI**.
Di SIP Mandiri, **`teaching_contexts` WAJIB masuk ke prompt AI** — ini adalah
inti dari backward design berbasis kondisi nyata kelas.

**Struktur tabel baru:**

```sql
-- Jawaban guru per classroom (persisten, bisa diperbarui tiap semester)
teaching_contexts
  id, classroom_id, teacher_id,
  academic_year, semester,
  -- Blok 1
  mata_pelajaran, jenjang, fase, jp_per_minggu,
  -- SMK only (nullable untuk non-SMK)
  jurusan, kelompok_mapel, tujuan_utama, status_pkl,
  target_sertifikasi, pola_jadwal, durasi_proyek,
  hubungan_dudi, industri_dominan, mitra_dudi,
  -- DNK/DK
  dnk_perasaan, dnk_relevansi, dnk_kondisi_masuk,
  dk_konsep_dasar, dk_ikuti_instruksi, dk_hasil_sebelumnya,
  -- Blok 2
  kemampuan_awal, karakter_kelas, tingkat_kemandirian,
  elemen_prioritas, pendekatan_model, gaya_mengajar, cara_penilaian,
  -- Blok 3
  jumlah_siswa, siswa_abk, fasilitas_kelas, situasi_hp,
  akses_internet, materi_cetak, aktivitas_dihindari,
  kendala_kelas, daerah_mengajar,
  created_at, updated_at

-- Output dokumen yang dihasilkan AI
teacher_documents
  id, classroom_id, teacher_id, teaching_context_id,
  tipe_dokumen,  -- 'atp' | 'rencana_pertemuan'
  tp_dipilih,    -- TP yang dipilih guru dari draft ATP
  konten_json,   -- output terstruktur dari AI
  konten_teks,   -- versi plain text untuk ditampilkan ke guru
  versi, status, -- draft | final
  created_at, updated_at

-- Antrian job AI (untuk async generation)
generation_jobs
  id, classroom_id, teacher_id, document_id,
  status,         -- queued | running | done | failed
  model_used, prompt_tokens, completion_tokens,
  error_message,
  created_at, updated_at

-- Template prompt per tipe output
prompt_templates
  id, tipe_dokumen, versi,
  system_prompt, user_prompt_template,
  is_active,
  created_at
```

**Tenant isolation:**
Semua tabel menggunakan `classroom_id` sebagai anchor — konsisten dengan ADR-001.
RLS menggunakan `fn_is_classroom_owner(classroom_id)` untuk akses guru.

---

### K5 — Edge Functions Baru

| Nama | Tugas |
|------|-------|
| `generate-atp-mandiri` | Menerima jawaban Blok 1+2 + data CP dari DB → generate draft ATP |
| `generate-rencana-pertemuan` | Menerima jawaban Blok 1+2+3 + TP terpilih → generate rencana pertemuan |

Kedua fungsi:
- Wajib memvalidasi `is_ai_enabled = true` di `profiles` guru sebelum memanggil AI
- Menyimpan job ke `generation_jobs` sebelum memanggil model
- Mengupdate status job setelah selesai atau gagal
- Tidak pernah memanggil AI jika `teaching_contexts` belum lengkap

Pola implementasi mengikuti Edge Function yang sudah ada di repo (`generate-akun`, `hapus-akun`):
- TypeScript + Deno
- CORS header standar
- Error response konsisten

---

### K6 — UI Tab Baru di classroom.html

Tab baru: **"Rancang Pembelajaran"**
Ditambahkan di samping tab yang sudah ada (Kelola Siswa, Jadwal & Absensi, Penilaian).

Alur UI:
1. Guru membuka tab → sistem cek `is_ai_enabled`
2. Jika tidak aktif → tampilkan halaman info add-on + tombol upgrade
3. Jika aktif → tampilkan form dialog bertahap (Blok 1 → output CP → Blok 2 → draft ATP → pilih TP → Blok 3 → rencana pertemuan)
4. Setiap transisi blok: scroll ke atas, tampilkan output antara yang bisa guru baca
5. Output akhir: bisa disalin sebagai teks biasa atau dicetak

---

### K7 — Flag Premium di profiles

Kolom baru di tabel `profiles`:

```sql
is_ai_enabled BOOLEAN NOT NULL DEFAULT false
```

Flag ini diset oleh admin (manual untuk saat ini, otomatis setelah integrasi pembayaran).
RLS Edge Function memeriksa flag ini sebelum melanjutkan ke model AI.

---

## Konsekuensi

**Yang perlu dibangun sebelum fitur bisa digunakan:**

1. **Tabel CP** — data pemerintah perlu di-seed ke DB sebelum Blok 1 bisa berjalan
2. **Migration** untuk `teaching_contexts`, `teacher_documents`, `generation_jobs`, `prompt_templates`
3. **Migration** untuk kolom `is_ai_enabled` di `profiles`
4. **Edge Function** `generate-atp-mandiri` dan `generate-rencana-pertemuan`
5. **UI** tab "Rancang Pembelajaran" di `classroom.html` + file JS baru `classroom-ai.js`
6. **Prompt template** awal untuk kedua tipe output (disimpan di `prompt_templates`)

**Trade-off yang diterima:**

- Data CP di DB berarti perlu maintenance jika pemerintah merevisi CP — ini
  lebih baik daripada AI mengarang teks CP yang salah
- Alur 3 blok terasa panjang, tapi setiap blok menghasilkan output antara yang
  berguna — guru tidak menjawab ke "lubang hitam"
- SMK memiliki percabangan lebih panjang — ini trade-off yang disengaja karena
  kompleksitas konteks SMK memang berbeda

**Yang sengaja tidak dibangun:**

- Prota dan Prosem — terlalu administratif, tidak sejalan dengan filosofi backward design
- Approval workflow — tidak ada Waka di SIP Mandiri
- Sharing dokumen antar guru — isolasi per classroom, guru tidak berbagi dokumen AI
- Versi multi-model — untuk sekarang cukup satu model, model selection belum prioritas
