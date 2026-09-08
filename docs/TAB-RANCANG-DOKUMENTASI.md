# TAB RANCANG PEMBELAJARAN — DOKUMENTASI TEKNIS

> Dihasilkan dari pembacaan kode aktual. Sumber utama:
> `guru/js/rancang-chat-flow.js`, `guru/js/rancang-chat.js`,
> `guru/js/rancang-chat-ui.js`, `guru/js/rancang-chat-api.js`
>
> Tanggal dokumentasi: 2026-09-02

---

## 1. ARSITEKTUR UMUM

### File-file yang Terlibat

| File | Fungsi |
|------|--------|
| `guru/js/rancang-chat-flow.js` | Mendefinisikan seluruh pertanyaan funnel (`RANCANG_FLOW`), urutan fase (`FASE_URUTAN`), dan helper routing |
| `guru/js/rancang-chat.js` | State tunggal (`_chat`), lifecycle init, navigasi antar fase, trigger generate ATP/Modul, handler input guru |
| `guru/js/rancang-chat-ui.js` | Renderer: welcome screen, picker ATP/Modul, chip, stream bubble, composer, dropdown searchable |
| `guru/js/rancang-chat-api.js` | Wrapper ke Supabase DB dan Edge Functions: CRUD `atp_induk`, `modul_induk`, `atp_adaptasi`, panggilan EF |

### Tabel DB yang Digunakan

| Tabel | Operasi | Tujuan |
|-------|---------|--------|
| `atp_induk` | INSERT, SELECT, UPDATE | Draft/aktif ATP per guru (mapel+fase+jenjang) |
| `atp_adaptasi` | UPSERT | Adaptasi waktu/profil/dudi per classroom |
| `modul_induk` | INSERT/UPSERT, SELECT, UPDATE | Draft/aktif Modul Ajar per guru+ATP+TP |
| `classrooms` | SELECT (via `window._classroom*`) | Metadata kelas (mapel, nama, program keahlian, fase) |
| `profiles` | SELECT via `fn_current_profile_id()`, `api.getProfile()` | Role guru, tier |
| `rancang_profil` | SELECT via `api.getRancangProfil()` | Profil rancang tersimpan guru |

### Edge Function yang Terlibat

| EF | URL | Dipanggil saat |
|----|-----|----------------|
| `generate-atp` | `.../functions/v1/generate-atp` | Fase `ATP_GENERATE` — guru setujui summary |
| `generate-modul` | `.../functions/v1/generate-modul` | Fase `MODUL_GENERATE` — 4 fase berurutan (A/B/C/D) |
| `evaluate-answer` | `.../functions/v1/evaluate-answer` | Input `teks_bebas` (validasi) & semua pertanyaan `rekomendasi` |

### Alur Data dari Guru ke AI ke Output

```
Guru membuka Tab Rancang
        ↓
initRancangChat(cId)
  ├─ waitForClassroomMeta()          (max 3000ms polling)
  ├─ getAtpIndukList()               (Supabase query, non-blocking)
  ├─ rcRenderWelcomeScreen()         (render langsung)
  └─ fetchAllModulAktifGuru()        (non-blocking, limit 10)

Guru pilih mode (susun/sesuaikan/modul)
        ↓
initChatShell(cId, panel, mode)
  ├─ getCurrentGuruId()              (RPC fn_current_profile_id)
  ├─ api.getRancangProfil()          (profil rancang)
  ├─ loadState()                     (localStorage key rc_atp_state_{guruId}_{classroomId})
  └─ startPhase('KONTEKS_CP')

Loop Tanya-Jawab per Fase:
  askQuestion(q)
    ├─ rcAppendBubble('ai', prompt)
    ├─ rcRenderChips / rcRenderDropdownSearch / rcSetComposerVisible
    └─ handleChipSelect / handleGuruInput
          ├─ Validasi deterministik (pilihan/angka) — tanpa AI
          ├─ callEvaluateAnswer()    (EF evaluate-answer, hanya teks_bebas)
          ├─ callRecommendation()    (EF evaluate-answer mode=recommendation)
          ├─ recordAnswer()          (simpan ke _chat.collected_answers)
          └─ advanceToNext(q)
               ├─ getNextQuestion()  (pertanyaan berikut di fase yang sama)
               ├─ persistCompletedPhase() (tulis ke DB saat fase selesai)
               └─ getNextPhase()    (fase berikutnya)

Fase ATP_GENERATE:
  triggerGenerateAtp()
    └─ callGenerateAtp(atpIndukId, expectedUpdatedAt)
         └─ POST /generate-atp
              → progresi_tp, summary
         → _chat.atp_draft = progresi_tp
         → startPhase('ATP_REVIEW')

Fase MODUL_GENERATE:
  triggerGenerateModul()
    └─ callGenerateModul(modulIndukId, classroomId, updatedAt, onProgress, signal)
         ├─ Fase A: POST /generate-modul {fase:'A'} → identitas, desain, asesmen
         ├─ Fase B: POST /generate-modul {fase:'B'} → pertemuan[]
         ├─ Fase C: POST /generate-modul {fase:'C'} → instrumen G1-G7
         └─ Fase D: POST /generate-modul {fase:'D'} → tindak_lanjut + finalisasi (status='aktif')
              → _chat.modul_konten = resD.konten
         → startPhase('MODUL_REVIEW')
```

---

## 2. WELCOME SCREEN

### Card yang Tersedia

| Card | `data-option` | Badge | Kondisi Muncul |
|------|--------------|-------|----------------|
| **Sesuaikan ATP yang ada** | `sesuaikan` | "Direkomendasikan" | Selalu tampil |
| **Modul Ajar Aktif** | *(katalog, bukan welcome card biasa)* | — | Hanya jika `fetchAllModulAktifGuru()` mengembalikan ≥1 modul |
| **Susun ATP baru** | `susun` | — | Selalu tampil |
| **Buat Modul Ajar** | `modul` | "Butuh ATP aktif" | Selalu tampil |

### Aksi yang Dipicu Setiap Card

| `data-option` | Aksi |
|--------------|------|
| `sesuaikan` | Jika `atpCount === 0` → alihkan ke `susun` + notice. Jika `atpCount > 0` → tampilkan `rcRenderAtpPicker` |
| `susun` | `initChatShell(cId, panel, 'susun')` — reset state, mulai dari `KONTEKS_CP` |
| `modul` | Jika ada ATP aktif → `rcRenderAtpPicker` (filter status='aktif', skipToModul=true). Jika tidak ada ATP aktif → alihkan ke `susun` + notice |
| Katalog (Modul Aktif) | `rcRenderModulPicker(panel, moduls, bukaModul, kembaliKeLayarUtama)` |

### Konten Badge ATP

```
atpCount === null/undefined  → "— ATP"
atpCount === 0               → "Belum ada ATP"
atpCount > 0                 → "{n} ATP tersimpan"
```

---

## 3. FLOW ATP — SESUAIKAN ATP YANG ADA (`mode='adaptasi'`)

Guru memilih ATP dari picker → `openAtpAdaptasi()` → `hydrateFromAtp(full)` → `initChatShell(cId, panel, 'adaptasi')` → `resumeAtpFromDb()`.

`resumeAtpFromDb()` menelusuri `collected_data` ATP yang tersimpan:
- Jika ada `progresi_tp` (TP sudah di-generate) → langsung `startPhase('ATP_REVIEW')`
- Jika ada fase yang tersimpan → lanjut dari fase yang belum selesai (maks. iterasi 20)
- Jika semua fase selesai tapi belum ada TP → arahkan ke `ATP_SUMMARY`

Setelah di `ATP_REVIEW`, guru mendapat semua pilihan di bawah [§ Flow ATP — Susun ATP Baru, bagian ATP_REVIEW].

---

## 4. FLOW ATP — SUSUN ATP BARU

Urutan fase (diambil dari `FASE_URUTAN_V1`):

```
KONTEKS_CP → SUMBER_ATP → PRIORITAS → WAKTU → PROFIL_SISWA
→ TARGET_FASE → KONTEKS_DUDI → PENGUATAN_PRASYARAT
→ ATP_SUMMARY → ATP_GENERATE → ATP_REVIEW → DONE
```

### Fase KONTEKS_CP

| ID Pertanyaan | Jenis | Prompt (eksak) | Options / Constraints |
|--------------|-------|----------------|----------------------|
| `konfirmasi_program_keahlian` | `pilihan` | "MiClass menemukan data kelas dan CP berikut:\n\n{{mapel}} · {{nama_kelas}} · Fase {{fase}}\nProgram Keahlian: {{program_keahlian}}\n\nATP akan menggunakan konteks dunia kerja yang relevan dengan program keahlian tersebut.\n\nApakah pemahaman ini sudah benar?" | `['ya','Sudah benar']`, `['tidak','Tidak, program keahlian perlu dikoreksi']` |
| `pilih_program_keahlian` | `pilihan` | "Pilih program keahlian kelas ini:" | 50 program A-Z + `['__lainnya__','Program keahlian saya tidak ada di daftar ini']`; **ditampilkan sebagai dropdown searchable** |
| `program_keahlian_teks_bebas` | `teks_bebas` | "Tuliskan nama program keahlian kelas ini:" | Condition: `pilih_program_keahlian === '__lainnya__'` |
| `konfirmasi_konteks` | `pilihan` | "Data kelas dan CP yang akan digunakan:\n\n{{mapel}} · {{nama_kelas}} · Fase {{fase}}\n\nApakah Capaian Pembelajaran yang akan digunakan sudah sesuai?" | `['sesuai','Ya, CP sudah sesuai — lanjutkan']`, `['lihat_cp','Lihat ringkasan isi CP terlebih dahulu']`, `['cp_tidak_sesuai','CP atau versinya tidak sesuai']` |

**Routing khusus KONTEKS_CP:**
- Jika `window._classroomProgram` kosong → `konfirmasi_program_keahlian` di-auto-jawab `'tidak'`, pertanyaan pertama yang ditampilkan adalah `pilih_program_keahlian`
- `lihat_cp` → tampilkan ringkasan CP (elemen + cp_umum dari `window._cpData`), lalu pertanyaan diulang tanpa merekam jawaban
- `cp_tidak_sesuai` → kembali ke awal KONTEKS_CP (`revisionDestination`)
- `sesuai` → tandai `confirmed_by_teacher=true` untuk mapel, nama_kelas, fase, jenjang, program_keahlian

### Fase SUMBER_ATP

| ID | Jenis | Prompt | Options |
|----|-------|--------|---------|
| `sumber_atp` | `pilihan` | "Apakah ATP untuk mapel dan fase ini sudah tersedia?" | `['baru','Belum ada — susun ATP induk baru']`, `['gunakan','Sudah ada — gunakan dan sesuaikan untuk kelas ini']`, `['periksa','Sudah ada — susun ulang, pastikan sesuai CP']`, `['referensi','Sudah ada — susun versi baru dengan ATP lama sebagai panduan']`, `['cari','Belum diketahui — cari ATP yang tersimpan di MiClass']` |

### Fase PRIORITAS

| ID | Jenis | Prompt | Constraints / Routing |
|----|-------|--------|-----------------------|
| `target_prioritas` | `pilihan_jamak` | "Apa prioritas utama siswa selama fase ini? Pilih maksimal tiga." | max 3, exclusive: `['tidak_ada','rekomendasi']`; options: `fondasi_tka`, `dunia_kerja`, `pkl`, `sertifikasi`, `pendidikan_lanjut`, `literasi_numerasi`, `target_sekolah`, `tidak_ada`, `rekomendasi` |
| `timeline_tka` | `pilihan` | "Bagaimana fondasi TKA ditempatkan dalam ATP ini?" | Condition: `target_prioritas` includes `fondasi_tka`; options: `fase_ini`, `lintas_fase`, `lainnya`, `rekomendasi` |
| `target_sekolah_detail` | `teks_bebas` | "Tuliskan target khusus sekolah yang perlu diperhatikan." | Condition: `target_prioritas` includes `target_sekolah` |

### Fase WAKTU

| ID | Jenis | Prompt | Constraints / Condition |
|----|-------|--------|------------------------|
| `jp_per_minggu` | `angka` | "Berapa JP mata pelajaran ini per minggu?" | min 1, max 20 |
| `durasi_jp` | `pilihan` | "Berapa durasi satu JP di sekolah Anda?" | `45`, `40`, `35`, `lain` |
| `durasi_jp_lain` | `angka` | "Berapa menit durasi satu JP?" | min 30, max 60; condition: `durasi_jp === 'lain'` |
| `tahun_pelajaran` | `pilihan` | "ATP ini digunakan untuk tahun pelajaran berapa?" | `2026/2027`, `2027/2028`, `lainnya` |
| `minggu_efektif_mode` | `pilihan` | "Bagaimana minggu efektif ditentukan?" | `isi_sendiri`, `cari_daerah`, `standar_36` |
| `minggu_sem1` | `angka` | "Berapa minggu efektif semester pertama?" | min 10, max 22; condition: `minggu_efektif_mode` in `['isi_sendiri','cari_daerah']` |
| `minggu_sem2` | `angka` | "Berapa minggu efektif semester kedua?" | min 10, max 22; condition: sama |
| `kegiatan_sudah_dikurangi` | `pilihan` | "Apakah minggu efektif tersebut sudah mengurangi kegiatan khusus sekolah?" | `sudah`, `belum`, `tidak_tahu` |
| `kegiatan_khusus` | `pilihan_jamak` | "Kegiatan apa yang masih mengurangi pembelajaran?" | exclusive: `['tidak_ada']`; condition: `kegiatan_sudah_dikurangi === 'belum'` |
| `jp_kegiatan_khusus` | `angka` | "Berapa total JP untuk kegiatan khusus tersebut?" | min 0, max 200; condition: sama |
| `cadangan_minggu` | `pilihan` | "Berapa cadangan untuk gangguan tak terduga?" | `0`, `1`, `2`, `3`, `lain`, `rekomendasi` |
| `pola_jadwal` | `pilihan` | "Bagaimana pola JP dalam satu minggu?" | `reguler_satu`, `reguler_bagi`, `blok`, `campuran`, `belum_diketahui` |
| `konfirmasi_waktu` | `konfirmasi` | "Perhitungan waktu deterministik:\n\n{{ringkasan_waktu}}\n\nApakah perhitungan ini sudah sesuai?" | `['ya','Gunakan perhitungan ini']`, `['ubah','Ubah data waktu']` |

**Kalkulasi deterministik (tanpa AI):**
```
jp_kalender    = jp_per_minggu × minggu_efektif
jp_operasional = jp_kalender − jp_kegiatan_khusus − jp_cadangan − jp_pemetaan − jp_prasyarat
```
Guard: jika `jp_operasional <= 0` setelah fase WAKTU selesai → tampilkan peringatan, kembali ke `minggu_efektif_mode`.

### Fase PROFIL_SISWA

| ID | Jenis | Prompt | Condition |
|----|-------|--------|-----------|
| `status_data_awal` | `pilihan` | "Apakah data kemampuan awal siswa tersedia?" | `aktual`, `sebagian`, `belum_ada` |
| `tindakan_tanpa_data` | `pilihan` | "Bagaimana titik awal kemampuan siswa ditentukan?" | Condition: `status_data_awal === 'belum_ada'`; options: `pemetaan`, `observasi`, `perkiraan_guru`, `asumsi_cp`, `simulasi`, `rekomendasi` |
| `cara_pemetaan` | `pilihan` | "Bagaimana pemetaan awal dilakukan?" | Condition: `tindakan_tanpa_data === 'pemetaan'`; options: `diagnostik`, `observasi`, `tugas_singkat`, `terpadu`, `rekomendasi` |
| `jp_pemetaan` | `angka` | "Berapa JP yang digunakan untuk pemetaan awal?" | min 1, max 12; condition: sama |
| `tindakan_instrumen` | `pilihan` | "Apa yang dilakukan dengan instrumen pemetaan?" | Condition: sama; options: `buat_sekarang`, `gunakan_ada`, `catat_lanjut`, `ubah` |
| `kesulitan_mode` | `pilihan` | "Bagaimana kesulitan siswa yang perlu diantisipasi ditentukan?" | `asumsi_umum`, `perkiraan_guru`, `belum_diketahui`, `rekomendasi` |
| `kesulitan_teks_guru` | `teks_bebas` | "Tuliskan kesulitan yang Anda perkirakan akan dihadapi siswa. Pisahkan dengan koma jika lebih dari satu." | Condition: `kesulitan_mode === 'perkiraan_guru'` |

**Computed saat `persistCompletedPhase('PROFIL_SISWA')`:**
- `kesulitan_diantisipasi` — resolved dari `kesulitan_mode`:
  - `belum_diketahui` → `{value: [], source: 'belum_diketahui'}`
  - `perkiraan_guru` → teks dari `kesulitan_teks_guru`
  - `asumsi_umum` → hardcoded per mapel+fase (contoh Bahasa Inggris Fase E: 3 item asumsi)

### Fase TARGET_FASE

| ID | Jenis | Prompt | Condition |
|----|-------|--------|-----------|
| `target_akhir_mode` | `pilihan` | "Bagaimana target akhir fase ditentukan?" | `rekomendasi`, `kandidat_cp`, `target_guru`, `atp_lama` |
| `target_akhir_teks` | `teks_bebas` | "Tuliskan target akhir fase yang ingin digunakan." | Condition: `target_akhir_mode === 'target_guru'` |
| `penguatan_elemen` | `pilihan` | "Elemen mana yang perlu mendapat penguatan lebih besar?" | `seimbang`, `menyimak_berbicara`, `membaca_memirsa`, `menulis_presentasi`, `setelah_pemetaan`, `rekomendasi` |
| `target_kemandirian` | `pilihan` | "Tingkat kemandirian apa yang ditargetkan pada akhir fase?" | `panduan`, `bantuan_terbatas`, `mandiri_dikenal`, `mandiri_baru`, `rekomendasi` |
| `konfirmasi_target` | `konfirmasi` | "Ringkasan target fase:\n\n{{ringkasan_target}}\n\nApakah arah target fase sudah sesuai?" | `['ya','Lanjutkan']`, `['ubah','Ubah target fase']` |

### Fase KONTEKS_DUDI

| ID | Jenis | Prompt | Constraints |
|----|-------|--------|-------------|
| `kekuatan_konteks` | `pilihan` | "Seberapa kuat konteks program keahlian digunakan dalam ATP?" | `seimbang`, `dominan`, `terbatas`, `tidak_prioritas`, `rekomendasi` |
| `ranah_dunia_kerja` | `pilihan_jamak` | "Ranah dunia kerja mana yang diprioritaskan? Pilih maksimal lima." | max 5, exclusive: `['tidak_ada','rekomendasi']`; 12 opsi |
| `kebutuhan_bidang` | `pilihan_jamak` | "Kebutuhan bidang apa yang perlu diperhatikan?" | exclusive: `['tidak_ada','rekomendasi']`; 7 opsi |
| `batas_konteks` | `pilihan_jamak` | "Batas apa yang diterapkan saat menggunakan konteks kejuruan?" | exclusive: `['tanpa_batas','rekomendasi']`; 5 opsi |
| `konfirmasi_dudi` | `konfirmasi` | "Ringkasan konteks kejuruan:\n\n{{ringkasan_dudi}}\n\nApakah pengaturan konteks sudah sesuai?" | `['ya','Lanjutkan']`, `['ubah','Ubah konteks kejuruan']` |

### Fase PENGUATAN_PRASYARAT

| ID | Jenis | Prompt | Condition |
|----|-------|--------|-----------|
| `strategi_prasyarat` | `pilihan` | "Bagaimana penguatan prasyarat dimasukkan ke ATP?" | `awal`, `terintegrasi`, `kombinasi`, `tidak_perlu`, `rekomendasi` |
| `jp_prasyarat` | `angka` | "Berapa JP yang digunakan untuk penguatan awal?" | min 1, max 24; condition: `strategi_prasyarat` in `['awal','kombinasi']` |

### Fase ATP_SUMMARY

| ID | Jenis | Prompt | Options |
|----|-------|--------|---------|
| `persetujuan_atp_summary` | `konfirmasi` | "Pratinjau arah ATP:\n\n{{atp_summary}}\n\nApakah arah ATP sudah sesuai?" | `generate`, `ubah_prioritas`, `ubah_waktu`, `ubah_profil`, `ubah_target`, `ubah_konteks`, `ubah_prasyarat` |

**Routing revisi dari `persetujuan_atp_summary`:**

| Nilai | Fase tujuan |
|-------|------------|
| `generate` | Lanjut ke `ATP_GENERATE` |
| `ubah_prioritas` | Kembali ke `PRIORITAS` |
| `ubah_waktu` | Kembali ke `WAKTU` |
| `ubah_profil` | Kembali ke `PROFIL_SISWA` |
| `ubah_target` | Kembali ke `TARGET_FASE` |
| `ubah_konteks` | Kembali ke `KONTEKS_DUDI` |
| `ubah_prasyarat` | Kembali ke `PENGUATAN_PRASYARAT` |

### Fase ATP_GENERATE

Tidak ada pertanyaan. Otomatis:
1. `rcAppendBubble('ai', '⏳ Menyusun Alur Tujuan Pembelajaran…')`
2. `callGenerateAtp(atp_induk_id, expected_updated_at)` — POST ke `/generate-atp`, timeout 110 detik
3. Respons: `{ progresi_tp, summary: { jumlah_tp, total_jp, elemen_tercakup } }`
4. Simpan ke `_chat.atp_draft`
5. Lanjut ke `ATP_REVIEW`

**Error codes dari generate-atp:**

| Code | Pesan ke guru | Retryable |
|------|--------------|-----------|
| `ATP_INPUT_INCOMPLETE` | "Data funnel belum lengkap: {missing}" | Tidak |
| `ATP_GENERATION_CONFLICT` | "Jawaban funnel berubah sejak disimpan. Muat ulang lalu coba lagi." | Tidak |
| `ATP_GENERATION_JP_MISMATCH` | "AI gagal menghasilkan ATP yang valid. Silakan coba lagi." | Ya |
| `ATP_GENERATION_INVALID_ELEMENT` | sama | Ya |
| `ATP_GENERATION_INVALID_JSON` | sama | Ya |
| `ATP_GENERATION_TIMEOUT` | "Waktu habis saat menyusun ATP. Silakan coba lagi." | Ya |
| `RATE_LIMIT` | "Batas generate ATP harian (3×) tercapai. Coba lagi besok." | Tidak |

### Fase ATP_REVIEW

Sebelum pertanyaan ditampilkan, `renderAtpDraftPreview()` menampilkan daftar TP (jumlah, JP total, elemen tercakup).

| ID | Jenis | Prompt | Options |
|----|-------|--------|---------|
| `tindakan_review_atp` | `pilihan` | "Bagaimana draf ATP ingin ditindaklanjuti?" | `terima`, `rumusan`, `urutan`, `waktu`, `ulang`, `ubah_prioritas`, `ubah_target` |

**Routing dari `tindakan_review_atp`:**

| Nilai | Aksi |
|-------|------|
| `terima` | `acceptAtp()` → update `status='aktif'` → `startPhase('DONE')` |
| `rumusan` | Tampilkan placeholder: "Fitur revisi rumusan TP per item akan tersedia di versi berikutnya." Lalu ulang pertanyaan |
| `urutan` | Tampilkan placeholder: "Fitur pengurutan TP manual akan tersedia di versi berikutnya." Lalu ulang pertanyaan |
| `waktu` | Kembali ke fase `WAKTU` |
| `ulang` | `triggerGenerateAtp()` — buat ATP baru tanpa merekam jawaban |
| `ubah_prioritas` | Kembali ke fase `PRIORITAS` |
| `ubah_target` | Kembali ke fase `TARGET_FASE` |

### Fase DONE

Tidak ada pertanyaan. Menampilkan:
1. Ringkasan ATP: `{mapel} · Fase {fase} · {n} TP · {total} JP` lalu daftar tiap TP
2. Daftar TP sebagai `rc-tp-list` — tiap TP adalah button dengan label + meta (JP · pertemuan)
3. Jika TP sudah punya modul aktif → tambah tombol "📄 Lihat Modul TP N"
4. Tombol "Nanti saja" → `kembaliKeLayarUtama()`

---

## 5. FLOW MODUL AJAR

Urutan fase (dari `FASE_URUTAN_V2`, dipanggil setelah guru pilih TP di fase DONE):

```
PILIH_TP → KONTEKS_MODUL → SUMBER_STRATEGI → ASESMEN_MODUL
→ MODUL_SUMMARY → MODUL_GENERATE → MODUL_REVIEW
```

Progress bar: "Modul Ajar · Langkah {1-4} dari 4 · {Konteks/Sumber & Strategi/Asesmen/Konfirmasi}"

### Fase PILIH_TP (implicit)

Guru mengklik salah satu TP dari daftar di fase DONE. Tidak ada pertanyaan dalam `RANCANG_FLOW['PILIH_TP']` — hanya:
- `jumlah_pertemuan` di-auto-jawab dari `tp.jp_pertemuan.length || 1`
- `persistModulPhase('PILIH_TP')` dipanggil — `ensureModulDraft()` membuat/menemukan baris `modul_induk` (upsert konflik `guru_id,atp_induk_id,nomor_tp`)

| ID | Jenis | Prompt | Constraints |
|----|-------|--------|-------------|
| `jumlah_pertemuan` | `angka` | "Berapa pertemuan yang akan digunakan untuk TP ini?" | min 1, max 30 |

### Fase KONTEKS_MODUL

Sebelum pertanyaan, ditampilkan bubble: "TP {n}. {judul}\n{jp} JP · {nPerm} pertemuan{distribusi}"

| ID | Jenis | Prompt | Condition / Options |
|----|-------|--------|---------------------|
| `konfirmasi_program_keahlian_modul` | `pilihan` | "Modul Ajar ini akan dibuat untuk:\n\n{{mapel}} · {{nama_kelas}} · Fase {{fase}}\nProgram Keahlian: {{program_keahlian}}\n\nSemua instrumen — kosakata, dialog, teks orientasi, kartu simulasi — akan menggunakan konteks dunia kerja {{program_keahlian}}.\n\nSudah benar?" | `['ya','Ya, lanjutkan']`, `['tidak','Tidak, program keahlian perlu dikoreksi']` |
| `pilih_program_keahlian_modul` | `pilihan` | "Pilih program keahlian kelas ini:" | Condition: `konfirmasi_program_keahlian_modul === 'tidak'`; dropdown searchable 50 program + `__lainnya__` |
| `program_keahlian_teks_bebas_modul` | `teks_bebas` | "Tuliskan nama program keahlian kelas ini:" | Condition: `pilih_program_keahlian_modul === '__lainnya__'` |
| `kondisi_kelas_modul` | `pilihan` | "Bagaimana kondisi kelas untuk modul ini?" | `reguler`, `diferensiasi`, `inklusif`, `campuran_kemampuan` |
| `target_kompetensi_modul` | `pilihan` | "Target kompetensi utama modul ini?" | `pemahaman`, `keterampilan`, `sikap`, `terpadu`, `rekomendasi` |

### Fase SUMBER_STRATEGI

| ID | Jenis | Prompt | Constraints |
|----|-------|--------|-------------|
| `jenis_sumber` | `pilihan_jamak` | "Sumber belajar apa yang digunakan? Pilih semua yang sesuai." | `buku_teks`, `modul_digital`, `video`, `artikel`, `lingkungan`, `lainnya` |
| `jenis_sumber_lainnya` | `teks_bebas` | "Sumber lain apa yang akan digunakan?" | Condition: `jenis_sumber` includes `lainnya` |
| `strategi_utama` | `pilihan` | "Strategi pembelajaran utama yang digunakan?" | `ceramah_diskusi`, `pbl`, `inquiry`, `kolaboratif`, `campuran`, `rekomendasi` |

### Fase ASESMEN_MODUL

| ID | Jenis | Prompt | Constraints |
|----|-------|--------|-------------|
| `teknik_asesmen` | `pilihan_jamak` | "Teknik asesmen apa yang digunakan?" | exclusive: `['rekomendasi']`; options: `tes_tulis`, `tes_lisan`, `observasi`, `portofolio`, `proyek`, `unjuk_kerja`, `rekomendasi` |
| `waktu_asesmen` | `pilihan` | "Kapan asesmen utama dilakukan?" | `awal`, `proses`, `akhir`, `campuran` |

### Fase MODUL_SUMMARY

Sebelum pertanyaan, ditampilkan ringkasan: "TP {n}: {judul}\n{jumlah} pertemuan · {jpPerPertemuan} JP per pertemuan\nTotal: {jpAlokasi} JP"

| ID | Jenis | Prompt | Options |
|----|-------|--------|---------|
| `persetujuan_modul_summary` | `konfirmasi` | "Ringkasan Modul Ajar siap disusun.\n\nApakah data modul sudah sesuai?" | `generate`, `ubah_pertemuan`, `ubah_konteks`, `ubah_strategi`, `ubah_asesmen` |

**Routing revisi dari `persetujuan_modul_summary`:**

| Nilai | Fase tujuan |
|-------|------------|
| `generate` | Lanjut ke `MODUL_GENERATE` |
| `ubah_pertemuan` | Kembali ke `PILIH_TP` |
| `ubah_konteks` | Kembali ke `KONTEKS_MODUL` |
| `ubah_strategi` | Kembali ke `SUMBER_STRATEGI` |
| `ubah_asesmen` | Kembali ke `ASESMEN_MODUL` |

### Fase MODUL_GENERATE

Tidak ada pertanyaan. Pipeline 4 fase berurutan melalui satu EF `generate-modul`:

| Fase | Label progress | Payload `fase` | Output |
|------|---------------|----------------|--------|
| A | "⏳ Menyusun identitas dan rencana asesmen…" | `'A'` | `identitas`, `identifikasi`, `desain_pembelajaran`, `rencana_asesmen` |
| B | "⏳ Merancang langkah pembelajaran…" | `'B'` | `pertemuan[]` |
| C | "⏳ Membuat instrumen asesmen…" | `'C'` | `instrumen` (G1-G7) |
| D | "⏳ Menyusun tindak lanjut dan finalisasi…" | `'D'` | `tindak_lanjut`, `catatan_guru`, merge + write final + `status='aktif'` |

Setiap fase menggunakan `expected_updated_at` dari respons fase sebelumnya untuk optimistic lock.

Tombol "✕ Batalkan" tersedia selama generate berlangsung (via `AbortController`).

**Error codes dari generate-modul:**

| Code | Pesan ke guru | Recovery |
|------|--------------|---------|
| `MODUL_INPUT_INCOMPLETE` | "Beberapa data belum lengkap. Kembali ke ringkasan untuk melengkapinya." | Tombol "← Kembali ke Ringkasan" |
| `MODUL_WRITE_CONFLICT` / `MODUL_GENERATION_CONFLICT` | "Modul ini sedang dibuka di halaman lain. Muat ulang lalu coba lagi." | Tombol "🔄 Muat Ulang" |
| `MODUL_NOT_FOUND` | "Modul tidak ditemukan. Muat ulang halaman." | Tombol "🔄 Muat Ulang" |
| `MODUL_GENERATION_INVALID_JSON` / `MODUL_GENERATION_INVALID_SCHEMA` / `MODUL_GENERATION_FAILED` | "MiClass belum berhasil menyusun modul. Jawaban Anda tersimpan. Silakan coba lagi." | Tombol "↺ Coba Lagi" |
| `MODUL_GENERATION_TIMEOUT` / `MODUL_STREAM_INCOMPLETE` / `MODUL_POLL_TIMEOUT` / `AI_ERROR` | "Terjadi gangguan sementara. Silakan coba lagi dalam beberapa menit." | Tombol "↺ Coba Lagi" |
| `RATE_LIMIT` | "Batas generate Modul hari ini (5×) sudah tercapai. Coba lagi besok ya." | Tidak ada tombol |
| Dibatalkan (`AbortError`) | "Generate dibatalkan. Progres parsial dihapus — Anda bisa mulai ulang kapan saja." | — |

### Fase MODUL_REVIEW

Menampilkan preview modul dari `_chat.modul_konten`. Deteksi `schema_version`:
- `'3.2.0'` → `_renderModulPreviewV320()` — tampilkan 9 bagian (header, tujuan, identifikasi, desain, asesmen, pertemuan, G1-G7, tindak lanjut, catatan guru)
- Selain itu → `_renderModulPreviewLama()`

**Chip berdasarkan konteks:**

Jika `viewing_existing_modul = true`:
```
['← Modul Ajar Aktif'] atau ['← Kembali ke daftar TP']
```

Jika modul baru dari flow:
```
['📄 Buka Modul Ajar', '↺ Buat Ulang', '← Kembali ke daftar TP']
```

---

## 6. NAVIGASI DAN BACK BUTTON

Tombol `← Rancang` (id `rc-back-btn`) perilakunya bergantung pada fase aktif:

| Fase | Label tombol | Aksi |
|------|-------------|------|
| Semua fase ATP (default) | `← Rancang` | Chip konfirmasi "Ya, kembali / Tidak, lanjutkan" → `kembaliKeLayarUtama()` |
| `KONTEKS_MODUL` | `← Pilih TP` | `startPhase('DONE')` |
| `SUMBER_STRATEGI` | `← Konteks Modul` | `goBackToPhase('KONTEKS_MODUL')` |
| `ASESMEN_MODUL` | `← Sumber & Strategi` | `goBackToPhase('SUMBER_STRATEGI')` |
| `MODUL_SUMMARY` | `← Asesmen` | `goBackToPhase('ASESMEN_MODUL')` |
| `MODUL_REVIEW` (dari katalog) | `← Modul Ajar Aktif` | `rcRenderModulPicker(panel, _katalogModuls, ...)` |
| `MODUL_REVIEW` (dari flow) | `← Daftar TP` | `rcClearChips(); startPhase('DONE')` |
| `MODUL_GENERATE` | *(disembunyikan)* | `btn.style.display = 'none'` |

`goBackToPhase(targetPhase)`: menghapus jawaban fase target dari `collected_answers`, bersihkan stream, lalu `startPhase(targetPhase)`.

**State yang dipertahankan saat kembali:** Jawaban fase-fase yang lebih maju tidak dihapus — jika guru tidak mengubah apa-apa, `processPhase` akan melewatinya otomatis.

**Guard reentrancy:** `_confirmingKembali` mencegah chip konfirmasi dirender lebih dari satu kali per klik. Selama konfirmasi terbuka, composer dibebaskan sementara agar chip bisa diklik meski composer sebelumnya disabled.

---

## 7. KATALOG MODUL AJAR AKTIF

### Kondisi Muncul

Card "Modul Ajar Aktif" muncul di welcome screen jika dan hanya jika `fetchAllModulAktifGuru()` mengembalikan ≥1 modul.

### Query DB

```javascript
// fetchAllModulAktifGuru()
window.supabaseClient
  .from('modul_induk')
  .select('id, atp_induk_id, nomor_tp, tp_judul, updated_at, atp_induk(mapel, fase)')
  .eq('status', 'aktif')
  .order('updated_at', { ascending: false })
  .limit(10)
```

### Aksi yang Tersedia

| Aksi | Dipicu dari | Hasil |
|------|------------|-------|
| Klik card "Modul Ajar Aktif" | Welcome screen | `rcRenderModulPicker(panel, moduls, bukaModul, kembaliKeLayarUtama)` |
| Pilih modul dari picker | Picker screen | `hydrateFromAtp(atpFull)` → set `selected_tp`, `modul_induk_id`, `modul_konten` → `initChatShell(cId, panel, 'modul')` |
| Di picker, tombol "← Menu Rancang" | Picker screen | `kembaliKeLayarUtama()` |

Di `MODUL_REVIEW` dari katalog, back button → kembali ke `rcRenderModulPicker`.

---

## 8. KONFIRMASI PROGRAM KEAHLIAN

### Di Mana Muncul

| Flow | ID Pertanyaan konfirmasi | ID Dropdown |
|------|------------------------|-------------|
| Flow ATP | `konfirmasi_program_keahlian` | `pilih_program_keahlian` |
| Flow Modul | `konfirmasi_program_keahlian_modul` | `pilih_program_keahlian_modul` |

### Daftar 50 Program Keahlian (A-Z, eksak dari kode)

```
Agribisnis Perikanan, Agribisnis Tanaman, Agribisnis Ternak,
Agriteknologi Pengolahan Hasil Pertanian, Akuntansi dan Keuangan Lembaga,
Animasi, Broadcasting dan Perfilman, Busana,
Desain dan Produksi Kriya, Desain Komunikasi Visual,
Desain Pemodelan dan Informasi Bangunan, Kecantikan dan Spa,
Kehutanan, Kimia Analisis, Konstruksi dan Perawatan Bangunan Sipil,
Kuliner, Layanan Kesehatan, Manajemen Perkantoran dan Layanan Bisnis,
Nautika Kapal Niaga, Nautika Kapal Penangkap Ikan, Pekerjaan Sosial,
Pemasaran, Pengembangan Perangkat Lunak dan Gim, Perhotelan,
Seni Pertunjukan, Seni Rupa, Teknik Elektronika,
Teknik Energi Terbarukan, Teknik Furnitur, Teknik Geologi Pertambangan,
Teknik Geospasial, Teknik Jaringan Komputer dan Telekomunikasi,
Teknik Ketenagalistrikan, Teknik Kimia Industri,
Teknik Konstruksi dan Perumahan, Teknik Konstruksi Kapal,
Teknik Laboratorium Medik, Teknik Logistik, Teknik Mesin,
Teknik Otomotif, Teknik Pengelasan dan Fabrikasi Logam,
Teknik Perawatan Gedung, Teknik Perminyakan, Teknik Pesawat Udara,
Teknik Tekstil, Teknika Kapal Niaga, Teknika Kapal Penangkap Ikan,
Teknologi Farmasi, Usaha Layanan Pariwisata, Usaha Pertanian Terpadu
```

Ditambah opsi: `['__lainnya__', 'Program keahlian saya tidak ada di daftar ini']`

Ditampilkan sebagai **dropdown searchable** (bukan chip biasa) untuk dua ID:
`pilih_program_keahlian` dan `pilih_program_keahlian_modul`.

### Cara Update ke DB

```javascript
// updateProgramKeahlianRpc()
window.supabaseClient.rpc('fn_update_program_keahlian', {
  p_classroom_id:     classroomId,
  p_program_keahlian: programKeahlian,
  p_bidang_keahlian:  bidangKeahlian,  // null jika tidak ditemukan di cp-data.json
})
```

`bidang_keahlian` di-lookup dari `window._cpData` via `lookupBidangFromProgram()`.

Dipanggil di dua titik:
1. Guru memilih dari dropdown (`pilih_program_keahlian` / `pilih_program_keahlian_modul`), value bukan `__lainnya__`
2. Guru submit `teks_bebas` (`program_keahlian_teks_bebas` / `program_keahlian_teks_bebas_modul`)

Jika RPC gagal → tampilkan "⚠ Gagal menyimpan program keahlian. Coba lagi." dan funnel tidak advance.

---

## 9. PENANGANAN ERROR

### Input Guru

| Kondisi | Respons |
|---------|---------|
| `pilihan`/`konfirmasi` — tidak cocok opsi | `CLARIFY`: "Pilih salah satu opsi yang tersedia." + tampilkan ulang chip |
| `pilihan_jamak` — tidak ada yang cocok / melebihi max | `CLARIFY`: "Pilih 1 sampai {max} opsi." |
| `pilihan_jamak` — nilai eksklusif digabung | `CLARIFY`: "Pilihan eksklusif tidak dapat digabungkan." |
| `angka` — bukan angka | `CLARIFY`: "Tuliskan angka, misalnya: 2 atau 4." |
| `angka` — di luar range | `CLARIFY`: "Angka harus antara {min} dan {max}." |
| `teks_bebas` — < 3 karakter | `CLARIFY`: "Jawaban terlalu singkat. Bisa lebih spesifik?" |
| `teks_bebas` — dipanggil AI (`callEvaluateAnswer`) dan gagal | `rcAppendBubble('sistem', '❌ Gagal memproses jawaban. Coba lagi.')` + tombol "↺ Coba lagi" |

### Persistensi DB (fase selesai)

- `ATP_WRITE_CONFLICT` / `MODUL_WRITE_CONFLICT` → tampilkan pesan konflik + tombol "↺ Coba lagi"
- Error lain → "Fase belum tersimpan ke database. Coba lagi sebelum melanjutkan." + tombol retry

### Rekomendasi AI

- Gagal → "Rekomendasi belum dapat dimuat. Silakan pilih sendiri." + ulang pertanyaan dengan chip opsi

---

## 10. RATE LIMIT DAN KUOTA

### Generate ATP

- Kuota: **3× per hari**
- Dihitung dan dicek di Edge Function `generate-atp` (sisi server)
- Error code: `RATE_LIMIT`
- Pesan ke guru: "Batas generate ATP harian (3×) tercapai. Coba lagi besok."

### Generate Modul

- Kuota: **5× per hari**
- Dihitung dan dicek di Edge Function `generate-modul` (sisi server)
- Error code: `RATE_LIMIT`
- Pesan ke guru: "Batas generate Modul hari ini (5×) sudah tercapai. Coba lagi besok ya."

### Evaluate Answer / Rekomendasi

- Tidak ada kuota eksplisit yang ditampilkan ke guru
- Gagal ditangani secara generic (CLARIFY atau "Rekomendasi belum dapat dimuat")

---

## 11. BACKLOG YANG DIKETAHUI

### Fitur Belum Dibangun — Direferensikan di Kode

| Fitur | Lokasi | Keterangan |
|-------|--------|-----------|
| Revisi rumusan TP per item | `handleChipSelect` (`tindakan_review_atp === 'rumusan'`) | Placeholder: "Fitur revisi rumusan TP per item akan tersedia di versi berikutnya." |
| Pengurutan TP manual | `handleChipSelect` (`tindakan_review_atp === 'urutan'`) | Placeholder: "Fitur pengurutan TP manual akan tersedia di versi berikutnya." |
| Pembuatan instrumen pemetaan awal (`buat_sekarang`) | `rancang-chat-flow.js` PROFIL_SISWA | Opsi ada di flow tapi tidak ada handler khusus — hanya direkam sebagai jawaban |
| Flow ATP V2 / Modul Ajar (penuh via FASE_URUTAN_V2) | `rancang-chat-flow.js` L402-411 | `FASE_URUTAN_V2` didefinisikan dan digabung ke `FASE_URUTAN` tapi labeled "V2 — jangan render di UI" |

### Bug / Cacat Diketahui — Belum Difix

| Masalah | Lokasi | Detail |
|---------|--------|--------|
| `WALI_KELAS` vs `WALI_KELAS_SD` di EF | Semua 7 Edge Function pipeline | EF pakai ejaan `'WALI_KELAS'` di `LOCKED_ROLES`, DB hanya terima `'WALI_KELAS_SD'` sejak migration `20260822000001`. Dampak: nol terhadap gate saat ini. |
| Phase MODUL_REVIEW: `acceptModulInduk()` tidak pernah dipanggil dari chip | `rancang-chat.js` L2204-2231 | Fungsi ada tapi tidak diekspos ke chip — tidak ada cara bagi guru menerima modul secara eksplisit dari dalam preview |

### TODO di Kode

```javascript
// rancang-chat-api.js — komentar internal
// Query langsung ke supabaseClient mengikuti preseden persistCompletedPhase —
// idealnya pindah ke rancang-chat-api.js saat file itu boleh disentuh lagi.
// (di openAtpAdaptasi, baris fetch atp_induk langsung)

// rancang-chat.js — komentar di triggerGenerateAtp
// Set LOCKED_ROLES / ROLES sengaja TIDAK diubah — disiapkan untuk Rancang V2.
```

---

## LAMPIRAN: State Objek `_chat`

```javascript
const _chat = {
  guru_id:              null,
  classroom_id:         null,
  atp_induk_id:         null,
  atp_updated_at:       null,
  profile:              null,   // rancang_profil
  teaching_context_id:  null,
  planning_context_id:  null,
  active_question_id:   null,
  collected_answers:    {},     // { [questionId]: { value, source, confirmed_by_teacher } }
  conversation_history: [],     // max 40 entri, hanya untuk display
  session_phase:        'KONTEKS_CP',
  atp_draft:            [],     // array progresi_tp dari DB
  selected_tp:          null,
  modul_induk_id:       null,
  modul_updated_at:     null,
  modul_konten:         null,   // konten lengkap modul (tidak di-persist di _chat state list)
  viewing_existing_modul: false,
  modul_source:         null,   // 'katalog' | 'flow'
  in_flight:            false,
  pending_multi:        {},
  modul_generating:     false,
};
```

**Persistensi localStorage:** key `rc_atp_state_{guruId}_{classroomId}`.
Fields yang disimpan: `active_question_id`, `atp_induk_id`, `atp_updated_at`, `collected_answers`, `conversation_history` (max 40), `session_phase`, `atp_draft`, `selected_tp`, `modul_induk_id`, `modul_updated_at`, `teaching_context_id`, `planning_context_id`.

Fields yang **tidak** disimpan ke localStorage: `modul_konten`, `viewing_existing_modul`, `modul_source`, `in_flight`, `pending_multi`, `modul_generating`.
