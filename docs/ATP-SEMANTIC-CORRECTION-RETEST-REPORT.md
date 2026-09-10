# MICLASS — ATP SEMANTIC CORRECTION PASS 5 + CONTROLLED RETEST

> **STATUS: `ATP SEMANTIC RETEST — READY FOR REVIEW`**
>
> Pass 5 memperbaiki defect yang terbukti di semantic test pertama, lalu
> menjalankan ulang S1–S7 dengan masukan yang **identik byte-for-byte**, model
> yang sama, dan konfigurasi yang sama. Kode dibekukan sejak retest dimulai
> (63/63 hash identik sebelum dan sesudah). Tidak ada deploy, commit, push, atau
> tulisan ke Supabase. Modul Ajar dan Naskah Fasilitasi tidak disentuh.
>
> **Hasil singkat:** 7/7 ATP lolos seluruh gerbang keras. Enam `FIRST_PASS`,
> satu `REPAIRED_ONCE`, dan tidak ada permintaan yang memakan tiga panggilan
> (baseline: 1 `FIRST_PASS`, 6 `FAILED_AFTER_REPAIR` dengan 3 panggilan).
> Total token turun dari 239.636 ke 112.749. Keempat perbandingan kausal
> naik (S1↔S2 `CAUSAL`, S1↔S4 `CAUSAL`, S1↔S5 `RESPECTED`, S1↔S7 `STABLE`).
> Sisa: satu salah tuduh validator lama (`magang`), bentuk media cetak masih
> muncul di bidang `konteks`/`catatan`, dan S6 menunjukkan kepadatan yang
> patut membuka kembali heuristic jumlah TP. Semuanya dicatat, tidak diperbaiki.

Bukti BEFORE tetap utuh: `docs/ATP-SEMANTIC-GENERATION-REPORT.md` dan
`tests/artifacts/atp-semantic/` (82 berkas, tidak disentuh). Artefak retest:
`tests/artifacts/atp-semantic-pass5/`.

---

## A. Baseline Semantic Defects

| ID | Severity baseline | Ringkas |
|---|---|---|
| SEM-001 | BLOCKER | `extractJson()` mencari array lebih dulu, sehingga objek `{keputusan_didelegasikan, tp}` terpotong. 100% gagal bila A17/A19 didelegasikan |
| SEM-002 | HIGH | repair JSON meminta "HANYA JSON array TP" sehingga keputusan hilang (D2) |
| SEM-003 | HIGH | MP-5 hanya dilayani TP bertipe `pengayaan` (S2, S5) |
| SEM-004 | HIGH | S5: pilihan guru A17 `kehidupan` kalah oleh perintah konteks kerja tanpa syarat |
| SEM-005 | MEDIUM | pilihan A19 tidak menggambarkan urutan yang benar-benar disusun |
| SEM-006 | MEDIUM → **HIGH** (reviewer) | fiksi DAN nonfiksi tidak tertelusur; 9/9 ID tidak cukup |
| SEM-007 | MEDIUM | prioritas `pendidikan_lanjut` (S4) hampir tak berbekas |
| SEM-008 | LOW | bentuk media cetak dari `cara_layanan` bocor ke judul TP |
| SEM-009 | LOW | TP inti diberi `tipe: prasyarat` |
| SEM-H-001 | LOW | `extractJson` dan teks repair disalin ke harness |
| SEM-H-002 | LOW | harness menimpa artefak panggilan 2 dengan panggilan 3 |
| SEM-DOC-001 | LOW | catatan "repair maksimum 1" keliru; kode bisa 3 panggilan |

---

## B. Correction Matrix

| Defect | Perubahan | Bukti deterministik | Status |
|---|---|---|---|
| SEM-001 | `extractJson()` dihapus. `parseKeluaranModel()` di `kontrak.ts` memakai `JSON.parse` utuh dulu, lalu satu code fence; narasi, dua dokumen, dan JSON rusak ditolak | AA, AB | CLOSED |
| SEM-002 | satu `pesanPerbaikanAtp()` yang selalu meminta objek kanonik; `susunDenganSatuPerbaikan()` paling banyak 2 panggilan; EF memakai orkestrator itu | AC, AD | CLOSED |
| SEM-003 | `tipe` dihapus dari SYSTEM_PROMPT; validator skema baru membuang `tipe` bila tetap muncul (`[S4-legacy]`); batas mutlak "tidak ada TP prasyarat/pengayaan" | AE | CLOSED |
| SEM-009 | idem, ditambah "Penguatan kemampuan dasar adalah DUKUNGAN di dalam TP" di `kesiapan_murid` | AE | CLOSED |
| K2 (gap S6) | validator: tuntutan unik per TP ≤ `MAKS_TUNTUTAN_PER_TP` (2) | AF | CLOSED |
| SEM-004 | kalimat program keahlian tidak lagi imperatif; `ARAHAN_KONTEKS_TUGAS` per pilihan A17 bertanda "KEPUTUSAN GURU"; urutan otoritas di SYSTEM_PROMPT | AG | CLOSED |
| SEM-005 | A19 diputuskan PALING AKHIR sebagai gambaran urutan yang sudah tersusun (prompt + butir pertimbangan A19) | — (semantik) | lihat §M |
| SEM-006 | `cakupan_wajib.kategori_teks` di `cp-acuan.json` (MB-1, MM-1, MM-2, MP-1); field TP `kategori_teks`; validator C6/C7 membaca aturan dari acuan | AI | CLOSED |
| SEM-007 | root `penerapan_prioritas`; `prioritasDipilih()`; validator P1–P4; renderer ATP + DOCX | AH | CLOSED (struktural) |
| SEM-008 | `cara_layanan` tidak lagi dikirim ke penyusun (tetap di acuan untuk audit); aturan "media presentasi cetak, tanpa bentuk konkret" | AJ | PARTIAL (lihat §R) |
| Readiness | `ARAHAN_KESIAPAN` per tingkat kesiapan; heuristic tidak diubah | — (semantik) | lihat §L |
| SEM-H-001 | harness mengimpor parser, pesan perbaikan, syarat, dan orkestrator produksi; tidak ada lagi yang disalin | `deno check`, AD | CLOSED |
| SEM-H-002 | artefak per panggilan: `Sn-call1-response.txt`, `Sn-call2-repair-prompt.txt`, `Sn-call2-response.txt`; folder via `--artefak` | artefak S3 | CLOSED |
| SEM-DOC-001 | komentar di `index.ts`, catatan `CLAUDE.md`, dan laporan ini menyatakan "paling banyak dua panggilan" | AD | CLOSED |

---

## C. Canonical Output Contract After Pass 5

Model SELALU mengembalikan satu objek:

```json
{
  "keputusan_didelegasikan": [
    { "question_id": "A19", "pilihan": "<kunci allowlist>", "alasan": "...", "dasar": ["<kunci dasar sah>"] }
  ],
  "penerapan_prioritas": [
    { "prioritas": "<kunci A16>", "tp": [3, 6], "pengaruh": ["urutan|alokasi_waktu|konteks|penekanan"], "alasan": "..." }
  ],
  "tp": [
    { "nomor": 1, "judul": "...", "elemen": ["..."], "tuntutan": ["..", ".."],
      "kategori_teks": ["fiksi", "nonfiksi"], "jp_alokasi": 8, "jp_pertemuan": [2,2,2,2], "semester": 1,
      "konteks": ["..."], "catatan": "..." }
  ]
}
```

- `keputusan_didelegasikan` kosong bila tidak ada keputusan terbuka.
- `penerapan_prioritas` kosong bila guru tidak memilih penekanan.
- Tidak ada `tipe`. `kategori_teks` wajib pada TP yang melayani tuntutan
  berkategori.
- Paling banyak 2 tuntutan per TP.
- **Kompatibilitas mundur:** array telanjang dan ATP lama ber-`tipe` tetap
  dibaca, dirender, dan diunduh. Tidak ada migration dan tidak ada ATP lama yang
  ditulis ulang. Renderer baru hanya menambah baris bila field barunya ada.

---

## D. Parser + Repair Contract

**Parser** — `parseKeluaranModel(teks)` (`kontrak.ts` §14):

1. `trim()`; kosong ditolak.
2. `JSON.parse()` atas SELURUH teks.
3. Bila gagal: tepat satu code fence (```` ``` ```` / ```` ```json ````) yang membungkus
   seluruh teks, lalu isinya di-parse.
4. Tidak ada fallback lain, dan tidak ada regex greedy. Narasi di depan atau
   belakang, dua dokumen, dua fence, dan JSON rusak ditolak.

**Orkestrator** — `susunDenganSatuPerbaikan(panggil, userMessage, syarat)` (`kontrak.ts` §17):

```text
CALL 1 → parse → validasi
  ├─ sah → FIRST_PASS (1 panggilan)
  └─ parse ATAU validasi gagal
       → pesanPerbaikanAtp(seluruh masalah, syarat)   // selalu objek kanonik
       → CALL 2 → parse → validasi
            ├─ sah → REPAIRED_ONCE (2 panggilan)
            └─ gagal → FAILED_AFTER_REPAIR (2 panggilan)
```

Tidak ada panggilan ketiga. Galat jaringan, timeout, dan pemotongan token
dilempar ke EF dan dipetakan ke pesan guru seperti sebelumnya. Timeout:
panggilan utama 60 detik; perbaikan `Math.max(10_000, 100_000 − elapsed)`.

---

## E. CP Internal Coverage Contract

- **Sumber:** `shared/data/cp-acuan.json`, di field baru
  `cakupan_wajib: { kategori_teks: ["fiksi","nonfiksi"] }` pada BIE-E25-MB-1,
  BIE-E25-MM-1, BIE-E25-MM-2, dan BIE-E25-MP-1. Keempatnya memuat "fiksi dan
  non fiksi" di rumusan normatif dengan logika AND. Teks CP, kompetensi, lingkup
  materi, dan 9 tuntutan **tidak berubah**. Versi acuan naik `2026-09-10d` →
  `2026-09-10e`, dan salinan EF dibangkitkan ulang.
- **TP:** `kategori_teks: ('fiksi'|'nonfiksi')[]`.
- **Validator:**
  - **C7:** TP yang melayani tuntutan berkategori wajib menyebut
    `kategori_teks`, dan nilainya hanya dari allowlist.
  - **C6:** untuk setiap tuntutan berkategori, gabungan `kategori_teks` seluruh
    TP yang merujuknya wajib memuat semua kategori yang diwajibkan.
- Aturan dibaca dari acuan (`bangunSyaratValidasi` → `tuntutan_kategori`); tidak
  ada ID yang di-hardcode di validator. Tidak ada tebakan genre dari judul.

---

## F. Priority Trace Contract

- `prioritasDipilih(cd)` mengambil pilihan A16 guru: `kebutuhan_sekolah` dan
  `tidak_ada` bukan penekanan, sedangkan uraian bebas masuk sebagai
  `uraian_guru`.
- Setiap penekanan terpilih wajib punya tepat satu entri `penerapan_prioritas`.
- **P1:** hanya prioritas yang dipilih guru, dan tidak ganda.
- **P2:** tidak ada penekanan terpilih yang tanpa jejak.
- **P3:** `tp` tidak kosong, dan setiap nomornya nyata.
- **P4:** `pengaruh` hanya dari `urutan`, `alokasi_waktu`, `konteks`,
  `penekanan`; alasan ≥ 25 huruf.
- Disimpan di `ATP_HASIL.dasar_penyusunan.penerapan_prioritas` sebagai frasa
  manusia. Layar review dan DOCX menampilkannya sebagai "Penekanan yang Anda
  minta → diterapkan terutama pada TP …".
- Apakah isi TP yang ditunjuk benar-benar mencerminkan penekanan itu tetap
  telaah manusia (§K, §L).

---

## G. Tests AA–AJ

```
AA: parser membaca objek utuh berisi dua atau tiga array — SEM-001 ... ok
AB: array historis tetap dibaca; yang bukan satu dokumen JSON ditolak ... ok
AC: perbaikan selalu meminta satu objek kanonik — SEM-002 ... ok
AD: satu permintaan guru paling banyak dua panggilan model ... ok
AE: TP baru tidak lagi dikelompokkan prasyarat/pengayaan — SEM-003, SEM-009 ... ok
AF: paling banyak dua tuntutan CP per TP ... ok
AG: pilihan eksplisit A17 memegang porsi konteks — SEM-004 ... ok
AH: setiap penekanan guru wajib punya jejak ke TP nyata — SEM-007 ... ok
AI: 9/9 ID belum cukup — kategori fiksi DAN nonfiksi wajib tercakup — SEM-006 ... ok
AJ: detail bentuk media Modul tidak dikirim ke penyusun ATP — SEM-008 ... ok
```

AD memakai penghitung panggilan tiruan untuk enam urutan (sah; rusak→sah;
invalid→sah; rusak terus; invalid terus; campuran). Semuanya berhenti di ≤2.
AD juga memeriksa sumber `index.ts`: orkestrator dipakai, tidak ada
`'perbaikan-2'`, tidak ada `extractJson(`, dan `callAI` hanya dipanggil di satu
tempat.

Satu penyesuaian jujur saat membangun uji: AE sempat gagal karena **komentar kode**
saya di tengah SYSTEM_PROMPT memuat `"tipe"` harfiah. Komentarnya diubah;
asersinya tidak dilonggarkan.

---

## H. Regression Pass 1–4

```
deno test --allow-read tests/atp-kontrak.test.ts  → ok | 50 passed | 0 failed   (40 lama + 10 baru)
node tests/atp-acuan-sinkron.mjs                  → LULUS — acuan CP sinkron (supabase/functions/generate-atp/acuan-cp.ts)
node tests/atp-trace.mjs --periksa                → LULUS — docs/SPEC-ATP-KONTRAK.md sesuai dengan kontrak di kode.
deno check kontrak.ts / index.ts / atp-semantic-harness.ts / atp-kontrak.test.ts → Check (keempatnya)
node --check guru/js/rancang-chat.js, guru/js/classroom-unduh.js → ok
```

- Tidak ada satu pun dari 40 uji lama yang diubah asersinya.
- CP 2025 dan 9 tuntutan tetap sama; yang bertambah hanya metadata `cakupan_wajib`.
- `hitungTargetTp()` tidak disentuh.
- `generate-modul` tidak disentuh (`git diff --stat` kosong).
- `docs/SPEC-ATP-KONTRAK.md` dibangkitkan ulang karena keterangan `dipakai`/
  `keputusan` untuk A1, A16, dan A17 di `KONTRAK_PERTANYAAN` diperbarui.

---

## I. Live Retest S1–S7

| | |
|---|---|
| Masukan | `Sn-input.json` identik byte-for-byte dengan baseline (`cmp`, 7/7); S1 dan S7 user message identik |
| Model/konfigurasi | `gemini-3.8-flash`, temperature tidak diset, `maxOutputTokens` via `anggaranTokenAtp()` (tidak diubah) |
| SYSTEM_PROMPT | sha256 `c0a30c2771c1ede8723a76539f5e10ba8d9c098cc6c385a0cdf5eab51f350985`, 9.251 karakter (baseline 6.521) |
| Perintah | `deno run --allow-read --allow-write --allow-env --allow-net tests/atp-semantic-harness.ts --artefak tests/artifacts/atp-semantic-pass5` |
| Kunci | dari environment Windows scope User, hanya untuk proses itu; tidak dicetak, tidak disimpan |

```
S1 BASELINE                   -> FIRST_PASS    tp=11 panggilan=1 19725ms
S2 READINESS VERY LOW         -> FIRST_PASS    tp=9  panggilan=1 23511ms
S3 VOCATIONAL CONTEXT CHANGE  -> REPAIRED_ONCE tp=11 panggilan=2 25796ms
S4 TEACHER PRIORITY CHANGE    -> FIRST_PASS    tp=11 panggilan=1 26926ms
S5 TEACHER OVERRIDES A17/A19  -> FIRST_PASS    tp=11 panggilan=1 26592ms
S6 LOW TIME / LARGE CLASS     -> FIRST_PASS    tp=5  panggilan=1 20824ms
S7 BASELINE REPEAT            -> FIRST_PASS    tp=11 panggilan=1 33739ms
```

Kolom *Kat.* = `kategori_teks` (F fiksi, N nonfiksi). Tuntutan disingkat tanpa
`BIE-E25-`. Semua ATP akhir lolos validator produksi dengan nol galat dan nol
peringatan.

### I.1 S1 — BASELINE (Tata Busana, 32 murid, sedikit di bawah, 126 JP)

- **A17 `seimbang`** — "Porsi seimbang memfasilitasi teks fiksi bertema keseharian sekaligus teks kerja nonfiksi bidang busana untuk kesiapan kerja." · dasar: `cp_anchor.tuntutan`, `prioritas_guru`, `konteks_kejuruan`
- **A19 `hierarki`** — "Keterampilan reseptif membaca dan menyimak diletakkan lebih dahulu sebagai fondasi sebelum murid memproduksi teks dan mempertahankan argumen." · dasar: `cp_anchor.tuntutan`, `kesiapan_murid`
- **Penerapan prioritas:**
  - kesiapan PKL dan dunia kerja → TP 2, 5, 7 (latar contoh dan tugas, penekanan isi)
  - penguatan kemampuan dasar → TP 1, 2 (urutan, porsi waktu)

| # | Sem | JP | Tuntutan | Kat. | Judul | Konteks |
|---:|:-:|---:|---|:-:|---|---|
| 1 | 1 | 12 | MM-1 | F | Membaca teks cerita fiksi busana dan menemukan informasi umum serta rinci | cerita rakyat pakaian adat; fabel busana |
| 2 | 1 | 10 | MM-1, MM-2 | N | Membaca teks nonfiksi bahan busana untuk menyimpulkan informasi tersurat dan tersirat | instruksi perawatan kain; spesifikasi tekstil |
| 3 | 1 | 10 | MM-2 | F | Menganalisis dan menyimpulkan amanat tersirat dalam teks narasi fiksi busana | cerpen penjahit tradisional |
| 4 | 1 | 10 | MB-1 | F | Menyimak pembacaan dongeng busana dan mencatat gagasan pokok serta alurnya | naskah dongeng tenun dibacakan guru |
| 5 | 1 | 10 | MB-1 | N | Menyimak dialog nonfiksi layanan pelanggan busana untuk mencatat rincian pesanan | dialog pemesanan di butik |
| 6 | 1 | 10 | MP-1 | F | Menulis draf cerita fiksi singkat berlatar perancang busana secara runtut | cerita rekaan desainer pemula |
| 7 | 2 | 12 | MP-1, MP-2 | N | Menulis deskripsi produk busana nonfiksi menggunakan media presentasi cetak sederhana | katalog busana cetak; **lembar informasi** produk |
| 8 | 2 | 14 | MB-2 | — | Mengungkapkan pendapat lisan tentang tren busana ramah lingkungan dalam diskusi | busana daur ulang |
| 9 | 2 | 12 | MB-3 | — | Mempertahankan argumen lisan saat menanggapi masukan rancangan busana dari teman | simulasi konsultasi desain |
| 10 | 2 | 14 | MP-4 | — | Menulis teks opini tentang isu etika dan keberlanjutan industri busana | limbah pakaian cepat saji |
| 11 | 2 | 12 | MP-5 | — | Menulis tanggapan untuk mempertahankan argumen atas kritik desain busana | surat tanggapan terhadap ulasan mode |

### I.2 S2 — READINESS VERY LOW

- **A17 `seimbang`** — "…penguatan kemampuan dasar murid dapat dimulai dari konteks kehidupan sehari-hari yang akrab, sebelum diterapkan pada situasi kerja bidang Tata Busana."
- **A19 `hierarki`** — "Keterampilan reseptif membaca dan menyimak ditempatkan lebih dahulu sebagai prasyarat pemerolehan kosakata dan struktur, sebelum murid berlanjut ke keterampilan produktif lisan dan tulisan argumentatif."
- **Penerapan prioritas:**
  - PKL → TP 1, 6, 7 (latar, isi)
  - kemampuan dasar → TP 1, 2, 3 (urutan, porsi waktu): "masing-masing 16 JP di awal fase"

| # | Sem | JP | Tuntutan | Kat. | Judul |
|---:|:-:|---:|---|:-:|---|
| 1 | 1 | 16 | MM-1, MM-2 | N | Membaca teks deskripsi busana dan menyimpulkan informasi bahan tekstil |
| 2 | 1 | 16 | MM-1, MM-2 | F | Membaca cerita fiksi busana nusantara dan menyimpulkan karakter tokoh utama |
| 3 | 1 | 16 | MB-1 | F+N | Menyimak narasi fiksi dan instruksi busana untuk mengidentifikasi detail isi |
| 4 | 1 | 14 | MB-2, MB-3 | — | Mengungkapkan pendapat lisan dan mempertahankan argumen tentang pilihan tren busana |
| 5 | 2 | 14 | MP-1 | F | Menulis cerita pendek fiksi mengenai pengalaman membuat gaun pesta busana |
| 6 | 2 | 14 | MP-1, MP-2 | N | Menulis lembar kerja produksi busana dan menyajikannya pada media presentasi cetak |
| 7 | 2 | 12 | MP-2 | — | Mempresentasikan profil koleksi busana kerja menggunakan media presentasi cetak |
| 8 | 2 | 12 | MP-4 | — | Menulis teks opini busana untuk mengungkapkan pandangan terhadap busana ramah lingkungan |
| 9 | 2 | 12 | MP-5 | — | Mempertahankan argumen secara tertulis mengenai isu etika produksi busana cepat |

### I.3 S3 — VOCATIONAL CHANGE (Teknik Otomotif) — `REPAIRED_ONCE`

- **Panggilan 1 ditolak satu galat:** `[B1] TP 5: menuntut kunjungan atau narasumber … — "Menulis cerita fiksi pengalaman magang memakai media presentasi cetak"`. Ini salah tuduh aturan Pass 2 (`\bmagang\b`); lihat RT-001.
- **Panggilan 2** mengganti TP 5 menjadi "montir pemula" dan lolos. Pesan perbaikannya verbatim di `S3-call2-repair-prompt.txt` (objek kanonik, satu kesempatan).
- **A17 `seimbang`** — "Konteks diseimbangkan antara situasi bengkel otomotif dan kehidupan sehari-hari agar murid terbantu memahami bacaan dasar sebelum mendalami teks kerja yang lebih teknis."
- **A19 `hierarki`** — "…berjenjang dari pemahaman reseptif menyimak dan membaca, analisis informasi tersurat dan tersirat, hingga produksi teks serta kemampuan mempertahankan argumen."
- **Penerapan prioritas:**
  - PKL → TP 1, 4, 6, 7, 9
  - kemampuan dasar → TP 1, 2, 3

| # | Sem | JP | Tuntutan | Kat. | Judul |
|---:|:-:|---:|---|:-:|---|
| 1 | 1 | 12 | MM-1 | N | Membaca panduan keselamatan bengkel otomotif dan menemukan gagasan utamanya |
| 2 | 1 | 10 | MB-1 | F | Menyimak narasi fiksi tentang mekanik muda dan merinci alur peristiwanya |
| 3 | 1 | 10 | MM-1, MM-2 | F | Membaca cerita pendek fiksi dan menyimpulkan pesan tersirat karakter tokoh |
| 4 | 1 | 10 | MM-2 | N | Menganalisis lembar petunjuk servis otomotif dan menyimpulkan penyebab kerusakan |
| 5 | 1 | 10 | MP-1, MP-2 | F | Menulis cerita fiksi tentang montir pemula memakai media presentasi cetak |
| 6 | 1 | 10 | MB-1 | N | Menyimak dialog nonfiksi konsultasi perawatan kendaraan dan mencatat detail perbaikannya |
| 7 | 2 | 14 | MP-1, MP-2 | N | Menulis laporan nonfiksi pemeriksaan mesin menggunakan media presentasi cetak |
| 8 | 2 | 12 | MB-2 | — | Mengungkapkan pendapat lisan mengenai pemilihan pelumas kendaraan yang tepat |
| 9 | 2 | 12 | MB-3 | — | Mempertahankan argumen lisan dalam diskusi menentukan metode perbaikan mesin |
| 10 | 2 | 12 | MP-4 | — | Menulis tanggapan untuk mengungkapkan pendapat tentang perkembangan kendaraan listrik |
| 11 | 2 | 14 | MP-5 | — | Menulis paragraf argumentatif untuk mempertahankan rekomendasi keselamatan berkendara |

### I.4 S4 — PRIORITY CHANGE (pendidikan lanjut)

- **A17 `seimbang`** — "…konteks kejuruan Tata Busana sekaligus menyediakan bahan teks bertema umum dan ilmiah untuk kesiapan pendidikan lanjut." · dasar menyebut `prioritas_guru`
- **A19 `mudah_sulit`** — "…dari pemahaman informasi eksplisit dalam teks deskriptif sederhana menuju analisis kritis tersirat dan pembuktian argumen kompleks."
- **Penerapan prioritas:** pendidikan lanjut → TP 8, 9, 11 (latar, isi): "pembacaan artikel analitis … penulisan esai argumen berbasis bukti … kesiapan tes akademik dan studi lanjut"

| # | Sem | JP | Tuntutan | Kat. | Judul |
|---:|:-:|---:|---|:-:|---|
| 1 | 1 | 12 | MB-1 | N | Menyimak pembacaan deskripsi bahan busana dan mencatat gagasan utama secara lisan |
| 2 | 1 | 12 | MM-1, MM-2 | N | Membaca artikel tren mode dunia dan menyimpulkan informasi penting dalam teks |
| 3 | 1 | 14 | MP-1, MP-2 | N | Menulis deskripsi spesifikasi produk busana menggunakan media presentasi cetak portofolio |
| 4 | 1 | 12 | MB-1 | F | Menyimak cerita fiksi inspiratif tentang perancang busana dan mengidentifikasi alur peristiwa |
| 5 | 1 | 12 | MM-1, MM-2 | F | Membaca cerita fiksi bertema mode dan menyimpulkan makna tersirat karakter tokoh |
| 6 | 2 | 10 | MP-1 | F | Menulis cerita fiksi pengalaman perancang busana pemula dengan tata bahasa tepat |
| 7 | 2 | 12 | MB-2, MB-3 | — | Menyampaikan pendapat dan mempertahankan argumen lisan tentang dampak industri tekstil cepat |
| 8 | 2 | 10 | MM-1, MM-2 | N | Menganalisis artikel akademik tentang keberlanjutan busana dan menyimpulkan implikasi sosialnya |
| 9 | 2 | 10 | MP-4, MP-5 | — | Menyusun teks esai akademik untuk menyampaikan dan mempertahankan argumen busana etis |
| 10 | 2 | 12 | MP-2, MP-4 | — | Menyampaikan pendapat mengenai standardisasi mutu busana menggunakan media presentasi cetak |
| 11 | 2 | 10 | MP-5 | — | Menulis sanggahan tertulis untuk mempertahankan argumen akademik dalam diskusi mode berkelanjutan |

### I.5 S5 — TEACHER OVERRIDE (A17 `kehidupan`, A19 `mudah_sulit`)

- **Keputusan delegasi:** kosong. Benar, karena tidak ada yang didelegasikan.
- **Penerapan prioritas:**
  - PKL → TP 6, 7, 9
  - kemampuan dasar → TP 1, 2, 3

| # | Sem | JP | Tuntutan | Kat. | Judul | Latar |
|---:|:-:|---:|---|:-:|---|---|
| 1 | 1 | 12 | MM-1 | N | Membaca teks deskriptif nonfiksi tentang kehidupan sekolah untuk memahami alur informasi utama | sekolah |
| 2 | 1 | 12 | MB-1 | F | Menyimak dongeng fiksi lisan dan mengidentifikasi alur informasi serta gagasan utama | cerita rakyat |
| 3 | 1 | 14 | MM-1, MM-2 | F | Membaca cerita naratif fiksi untuk menyimpulkan pesan moral dan karakter tokoh | remaja |
| 4 | 1 | 12 | MP-1, MP-2 | F | Menulis cerita pendek fiksi sederhana tentang pengalaman pribadi menggunakan media cetak | sekolah, keluarga |
| 5 | 1 | 12 | MB-1 | N | Menyimak dialog nonfiksi tentang busana sehari-hari untuk menemukan detail informasi | pakaian santai |
| 6 | 2 | 10 | MM-2 | N | Menganalisis dan menyimpulkan instruksi kerja nonfiksi pada panduan pembuatan busana | **kerja** |
| 7 | 2 | 10 | MP-1, MP-2 | N | Menulis petunjuk kerja nonfiksi perawatan busana dengan menggunakan media presentasi cetak | label cucian (antara) |
| 8 | 2 | 10 | MB-2 | — | Mengungkapkan pendapat lisan tentang tren busana ramah lingkungan dalam diskusi kelas | gaya hidup remaja |
| 9 | 2 | 12 | MB-3 | — | Mempertahankan argumen lisan dalam simulasi penanganan komplain pelanggan jasa busana | **kerja** |
| 10 | 2 | 12 | MP-4 | — | Menulis teks opini singkat untuk mengungkapkan pendapat tentang tata tertib sekolah | sekolah |
| 11 | 2 | 10 | MP-5 | — | Menulis teks eksposisi untuk mempertahankan argumen tentang dampak limbah pakaian | isu terkini |

Latar: **7 kehidupan/sekolah** (1, 2, 3, 4, 5, 8, 10), **2 kerja** (6, 9),
1 antara (7), 1 isu (11). Mayoritas mengikuti pilihan guru, dan situasi kerja
hadir sebagai minoritas yang relevan: tepat bentuk yang diminta
`ARAHAN_KONTEKS_TUGAS.kehidupan`. Prioritas PKL diterapkan justru pada TP
minoritas itu, tanpa mengalahkan A17.

### I.6 S6 — LOW TIME / LARGE CLASS (36 murid, jauh di bawah, 48 JP)

- **A17 `seimbang`**; **A19 `hierarki`** — "Kemampuan reseptif memahami teks bacaan dan tuturan lisan diletakkan lebih dahulu…"
- **Penerapan prioritas:**
  - PKL → TP 2, 4
  - kemampuan dasar → TP 1, 2

| # | Sem | JP | Tuntutan | Kat. | Judul |
|---:|:-:|---:|---|:-:|---|
| 1 | 1 | 8 | MM-1, MM-2 | F+N | Membaca teks cerita pendek dan profil desainer busana untuk menyimpulkan informasi |
| 2 | 1 | 8 | MB-1 | F+N | Menyimak cerita fabel dan instruksi kerja pembuatan busana untuk menemukan gagasan utama |
| 3 | 1 | 8 | MB-2, MB-3 | — | Mengungkapkan pendapat dan mempertahankan argumen lisan tentang pemilihan gaya busana |
| 4 | 2 | 12 | MP-1, MP-2 | F+N | Menulis cerita busana dan portofolio karya menggunakan media presentasi cetak |
| 5 | 2 | 12 | MP-4, MP-5 | — | Menulis teks eksposisi untuk mengungkapkan dan mempertahankan argumen isu industri busana |

### I.7 S7 — BASELINE REPEAT

- **A17 `seimbang`**; **A19 `hierarki`** — "…menempatkan kemampuan memahami informasi lisan dan tulis mendahului kemampuan menganalisis serta memproduksi pendapat dan argumen."
- **Penerapan prioritas:**
  - PKL → TP 1, 4, 7
  - kemampuan dasar → TP 1, 2, 3

| # | Sem | JP | Tuntutan | Kat. | Judul |
|---:|:-:|---:|---|:-:|---|
| 1 | 1 | 10 | MB-1 | N | Menyimak teks lisan nonfiksi tentang instruksi pembuatan pola busana |
| 2 | 1 | 10 | MB-1 | F | Menyimak cerita fiksi keseharian perancang busana untuk menemukan ide pokok |
| 3 | 1 | 12 | MM-1 | F+N | Membaca alur teks fiksi dan nonfiksi tentang tren busana |
| 4 | 1 | 10 | MM-2 | N | Menganalisis dan menyimpulkan informasi teks nonfiksi lembar spesifikasi kain |
| 5 | 1 | 10 | MM-2 | F | Menyimpulkan pesan tersirat dalam teks fiksi narasi peragaan busana |
| 6 | 1 | 10 | MP-1 | F | Menulis teks fiksi singkat tentang pengalaman merancang busana sekolah |
| 7 | 2 | 12 | MP-1, MP-2 | N | Menulis profil busana nonfiksi dan menyajikannya melalui media presentasi cetak |
| 8 | 2 | 14 | MB-2 | — | Mengungkapkan pendapat lisan mengenai pemilihan bahan busana ramah lingkungan |
| 9 | 2 | 14 | MB-3 | — | Mempertahankan argumen lisan dalam diskusi pemilihan konsep desain busana |
| 10 | 2 | 12 | MP-4 | — | Menulis teks opini singkat untuk mengungkapkan pendapat isu busana berkelanjutan |
| 11 | 2 | 12 | MP-2, MP-5 | — | Mempertahankan argumen tertulis tentang etika busana menggunakan media presentasi cetak |

---

## J. Hard Gates

| Gate | S1 | S2 | S3 | S4 | S5 | S6 | S7 | Keterangan |
|---|---|---|---|---|---|---|---|---|
| H1 CP 046/H/KR/2025 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | paritas CP sebelum panggilan; hanya ID `BIE-E25-*` |
| H2 Coverage 9/9 + kategori | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 9/9 ID; MB-1, MM-1, MM-2, MP-1 masing-masing fiksi **dan** nonfiksi (C6) |
| H3 ID tidak karangan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | C4 |
| H4 Waktu | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 126 = 62+64; 48 = 24+24; kelipatan 2 |
| H5 Sumber daya luar | ✅ | ✅ | ✅* | ✅ | ✅ | ✅ | ✅ | pemindai: nol. *S3 panggilan 1 ditolak B1 atas `magang` (salah tuduh, RT-001) |
| H6 OR tidak jadi AND | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | "multimodal"/"digital" tidak muncul; jalur tertulis/cetak penuh |
| H7 Otoritas guru (S5) | — | — | — | — | ✅ | — | — | nol keputusan A17/A19 dikeluarkan; latar 7 kehidupan : 2 kerja; urutan mudah→sulit |
| H8 Integritas delegasi | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | enum sah, alasan, dasar dari daftar sah |
| H9 Judul ≤16 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | maks 12 kata; pita 13–16: nol |
| H10 Status | FIRST_PASS | FIRST_PASS | REPAIRED_ONCE | FIRST_PASS | FIRST_PASS | FIRST_PASS | FIRST_PASS | tidak ada 3-call |
| + K2 ≤2 tuntutan/TP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | maks 2 di semua kasus |
| + tanpa `tipe` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `"tipe":` tidak ada di teks mentah mana pun (8/8 panggilan) |
| + judul tanpa bentuk media Modul | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | nol di judul; sisa di `konteks`/`catatan` (RT-002) |

---

## K. Semantic Scores P1–P8 (preliminary)

| | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| P1 CP fidelity | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| P2 Logical progression | 2 | 2 | 1 | 2 | 2 | 2 | 2 |
| P3 Readiness realism | 2 | 1 | 2 | 2 | 2 | 1 | 2 |
| P4 Vocational contextualization | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| P5 Teacher-priority causality | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| P6 Time realism | 2 | 2 | 2 | 2 | 2 | 1 | 2 |
| P7 TP quality | 1 | 2 | 2 | 2 | 1 | 1 | 1 |
| P8 Full-service feasibility | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| **Total /16** | **15** | **15** | **15** | **16** | **15** | **13** | **15** |
| Baseline | 12 | 12 | 12 | 12 | 11 | 9 | 12 |

Dasar skor yang bukan 2:

- **P2 S3 = 1.** A19 `hierarki` dengan alasan "reseptif → produktif", tetapi
  TP 5 (menulis) mendahului TP 6 (menyimak) di semester 1. Satu penyimpangan
  kecil; kasus lain konsisten.
- **P3 S2 = 1.** Menulis memang ditunda seluruhnya ke semester 2, dan TP awal
  dibuat lapang (16 JP). Tetapi TP 4 sudah menuntut mempertahankan argumen
  lisan di akhir semester 1: kemampuan produktif kompleks yang maju lebih cepat
  daripada arahan `jauh_di_bawah`.
- **P3/P6/P7 S6 = 1.** Lihat §N.
- **P7 = 1 pada S1, S5, S7.** Label `kategori_teks` ikut masuk kalimat judul
  ("Menyimak **dialog nonfiksi** layanan…", "Menulis **petunjuk kerja nonfiksi**…",
  "Menyimak **teks lisan nonfiksi**…"). Judul tetap jelas, tetapi terasa ditulis
  untuk validator, bukan untuk guru (RT-003).

Skor naik di setiap kasus; tidak ada skor yang turun.

---

## L. Cross-case Comparison

### S1 ↔ S2 — `CAUSAL` (baseline: WEAK)

| | S1 (sedikit di bawah) | S2 (jauh di bawah) |
|---|---|---|
| TP / JP per TP | 11 / 10–14 | 9 / 12–16 |
| Blok reseptif awal | TP 1–5, 52 JP | TP 1–3, **48 JP, masing-masing 16 JP** |
| Produksi tulis pertama | TP 6, semester 1 | **TP 5, semester 2** |
| MP-5 | TP 11, wajib | TP 9, wajib (tidak lagi pengayaan) |

Kesiapan kini mengubah jalannya: fondasi lebih lapang, produksi tulis ditunda
satu semester, dan ujung fase tetap sama. Catatan: TP 4 S2 (argumen lisan di
akhir semester 1) sedikit lebih cepat daripada arahannya.

### S1 ↔ S3 — `CONTEXTUAL` (baseline: CONTEXTUAL)

Latar berganti menyeluruh dan autentik: panduan K3 bengkel, petunjuk servis,
konsultasi perawatan kendaraan, laporan pemeriksaan mesin, pelumas, kendaraan
listrik, keselamatan berkendara. Seimbang juga dengan konteks keseharian
(cerpen remaja, isu publik). Daftar tuntutan, jam, dan struktur semester sama
dengan S1. Tidak ada competency drift.

### S1 ↔ S4 — `CAUSAL` (baseline: WEAK)

Pendidikan lanjut kini terlihat di isi TP, bukan hanya diklaim: "artikel tren
mode dunia" (TP 2), "artikel **akademik** tentang keberlanjutan… implikasi
sosialnya" (TP 8), "teks **esai akademik**" (TP 9), "sanggahan tertulis… argumen
**akademik**" (TP 11). A17 menyebut `prioritas_guru` dengan alasan "bahan teks
bertema umum dan ilmiah untuk kesiapan pendidikan lanjut". A19 bergeser ke
`mudah_sulit`. Jejak `penerapan_prioritas` menunjuk TP 8, 9, 11, dan ketiga TP
itu memang berisi yang diklaim. Kompetensi CP tidak berubah.

### S1 ↔ S5 — `RESPECTED` (baseline: PARTIAL)

Pilihan eksplisit guru ditaati: 7 dari 11 TP berlatar kehidupan/sekolah, kerja
menjadi minoritas relevan (2 TP), dan urutannya mudah→sulit. Program keahlian
tetap mengontekstualkan (busana sehari-hari, limbah pakaian) tanpa mengambil
alih porsi.

### S1 ↔ S7 — `STABLE` (baseline: ACCEPTABLE_VARIANCE)

Judulnya berbeda, tetapi kerangkanya hampir identik: TP 1–5 reseptif, TP 6
menulis fiksi di akhir semester 1, semester 2 berurutan MP-1+MP-2 nonfiksi →
MB-2 → MB-3 → MP-4 → MP-5; A17/A19 sama dengan alasan setara. Pola jejak
prioritas juga sama (kemampuan dasar pada TP awal, PKL pada TP dokumen kerja).

---

## M. Before vs After Defect Matrix

| Defect | BEFORE | AFTER | Status |
|---|---|---|---|
| SEM-001 | 6/7 gagal parse (objek terpotong) | 0 galat parse di 8 panggilan | **CLOSED** |
| SEM-002 | repair meminta array → D2 | satu perbaikan, objek kanonik (S3) | **CLOSED** |
| SEM-003 | MP-5 hanya di TP pengayaan (S2, S5) | tidak ada `tipe`; MP-5 di TP wajib di 7/7 | **CLOSED** |
| SEM-004 | S5: ≥5/11 kerja walau guru pilih kehidupan | S5: 7 kehidupan / 2 kerja | **CLOSED** |
| SEM-005 | A19 `hierarki` untuk susunan spiral (6/6) | pilihan sesuai urutan di 6/7; S3 satu TP menyimpang; S4 memilih `mudah_sulit` | **CLOSED** (sisa minor RT-004) |
| SEM-006 | fiksi hilang di MM/MP-1 pada 6 kasus | fiksi+nonfiksi di keempat tuntutan berkategori, 7/7, ditegakkan C6 | **CLOSED** |
| SEM-007 | S4 prioritas tak berbekas | S4 TP 8, 9, 11 berregister akademik; jejak cocok isi | **CLOSED** |
| SEM-008 | bentuk media di judul 7/7 | judul bersih 7/7; sisa di `konteks`/`catatan` 4 kasus | **PARTIAL** (RT-002) |
| SEM-009 | TP inti bertipe prasyarat (S1, S2, S5) | tidak ada `tipe` | **CLOSED** |
| K2 (gap S6) | TP dengan 3 tuntutan lolos | maks 2 di 7/7 | **CLOSED** |
| SEM-H-001 | parser dan repair disalin | harness mengimpor produksi | **CLOSED** |
| SEM-H-002 | artefak panggilan 2 tertimpa | `call1`/`call2` terpisah (S3) | **CLOSED** |
| SEM-DOC-001 | "repair maksimum 1" keliru | fakta "paling banyak 2" di kode, CLAUDE.md, laporan | **CLOSED** |

---

## N. S6 Heuristic Review

S6 kini memenuhi **kedua** syarat keras sekaligus: 9/9 tuntutan dengan
fiksi+nonfiksi, dan maksimal 2 tuntutan per TP. Artinya 5 TP masih *mungkin*
secara struktural. Harganya terlihat di isinya:

- **Tiap TP berkategori memikul kedua genre sekaligus.** TP 1 (8 JP): cerpen
  **dan** profil desainer, dengan penyimpulan tersurat dan tersirat. TP 2 (8 JP):
  fabel **dan** instruksi kerja. TP 4 (12 JP): cerita fiksi **dan** portofolio
  karya **dan** media presentasi.
- **Delapan JP adalah empat pertemuan** untuk murid yang "jauh di bawah" di
  kelas 36 orang, dan TP 3 menuntut pendapat **dan** argumen lisan dalam empat
  pertemuan itu.
- Rata-rata 9,6 JP per TP dan 1,8 tuntutan per TP, sama dengan catatan baseline.

**Penilaian:** layak di atas kertas, tetapi padat. Setiap TP menjadi dua tujuan
yang dijahit dengan "dan". Ini **bukti** bahwa pada anggaran kecil, lantai
`hitungTargetTp()` (`ceil(9/2) = 5`) bertemu dua aturan Pass 5 (≤2 tuntutan dan
kategori kumulatif), sehingga model terpaksa menumpuk genre di tiap TP.
Heuristic **tidak diubah** di Pass 5. Pertanyaan untuk peninjau: apakah pada
48 JP dengan kesiapan rendah target seharusnya 6 TP, atau kepadatan ini
diterima sebagai konsekuensi anggaran waktu sekolah.

---

## O. Cost / Reliability

| | Baseline | Retest Pass 5 |
|---|---:|---:|
| Panggilan model | 19 | **8** |
| Panggilan per kasus | 3,3,3,3,1,3,3 | 1,1,2,1,1,1,1 |
| Repair rate | 6/7 (dan tetap gagal) | 1/7 (berhasil) |
| First-pass (pipeline) | 1/7 | **6/7** |
| Token masukan | 143.731 | 60.058 |
| Token keluaran | 31.995 | 16.731 |
| Token penalaran | 63.910 | 35.960 |
| **Token total** | **239.636** | **112.749** (−53%) |
| Latensi per kasus | median 44.606 ms, maks 52.834 ms | median 25.796 ms, maks 33.739 ms |

`usageMetadata` per panggilan, verbatim dari `_summary.json`:

```
S1 [{"in":7243,"out":2326,"think":4031,"tot":13600}]
S2 [{"in":7326,"out":1846,"think":5658,"tot":14830}]
S3 [{"in":7247,"out":2364,"think":1977,"tot":11588},{"in":10409,"out":2375,"think":1783,"tot":14567}]
S4 [{"in":7195,"out":2113,"think":6152,"tot":15460}]
S5 [{"in":6095,"out":2102,"think":6261,"tot":14458}]
S6 [{"in":7300,"out":1501,"think":5102,"tot":13903}]
S7 [{"in":7243,"out":2104,"think":4996,"tot":14343}]
```

**Ruang plafon token.** SYSTEM_PROMPT bertambah dari 6.521 ke 9.251 karakter,
dan formula `anggaranTokenAtp()` tidak diubah demi komparabilitas. Pemakaian
keluaran+penalaran tertinggi ada di S5: 2.102 + 6.261 = 8.363 dari 14.000
(60%). Tidak ada pemotongan, tetapi ruangnya menyempit dibanding baseline
(puncak 57%). Perlu diawasi bila prompt diperbesar lagi (CLAUDE.md, "plafon
token roboh lima kali").

---

## P. Files Changed

| Berkas | Perubahan |
|---|---|
| `supabase/functions/generate-atp/kontrak.ts` | +523 −30: tipe baru, kamus arahan, `prioritasDipilih`, konteks A17/kesiapan/prioritas/media, validator K2/C6/C7/P1–P4/S4-legacy, `periksaPenerapanPrioritas`, `parseKeluaranModel`, `bangunSyaratValidasi`, `pesanPerbaikanAtp`, `susunDenganSatuPerbaikan`, keterangan `KONTRAK_PERTANYAAN` A1/A16/A17 |
| `supabase/functions/generate-atp/index.ts` | +156 −140: `extractJson` dihapus; SYSTEM_PROMPT kanonik; user message; langkah 9 lewat orkestrator; `penerapan_prioritas` ke `ATP_HASIL` |
| `shared/data/cp-acuan.json` | +25 −1: `cakupan_wajib` × 4; versi `2026-09-10e` |
| `supabase/functions/generate-atp/acuan-cp.ts` | dibangkitkan ulang |
| `tests/atp-acuan-sinkron.mjs` | tipe `TuntutanCp.cakupan_wajib` |
| `tests/atp-kontrak.test.ts` | +298: AA–AJ (40 uji lama tidak diubah) |
| `tests/atp-semantic-harness.ts` | evidence capture per panggilan, `--artefak`, impor produksi |
| `guru/js/rancang-chat.js` | +18: "Penekanan yang Anda minta", "Jenis teks" |
| `guru/js/classroom-unduh.js` | +25: idem di DOCX |
| `guru/classroom.html` | `chat-20260910a4`, `unduh-20260910a3` |
| `sw.js` | `miclass-v27` |
| `docs/SPEC-ATP-KONTRAK.md` | dibangkitkan ulang (`node tests/atp-trace.mjs`) |
| `CLAUDE.md` | catatan Pass 5 (fakta dua panggilan) |
| `docs/ATP-SEMANTIC-CORRECTION-EVIDENCE.diff` | **baru** — diff verbatim seluruh perubahan Pass 5 (2.066 baris) |
| `docs/ATP-SEMANTIC-CORRECTION-RETEST-REPORT.md` | **baru** — laporan ini |
| `tests/artifacts/atp-semantic-pass5/` | **baru** — artefak retest |

**Tidak disentuh:** `generate-modul`, Naskah Fasilitasi, teks CP normatif,
`hitungTargetTp()`, `hitungAlokasi()`, konfigurasi model, dan artefak baseline.

---

## Q. CHANGE EVIDENCE — VERBATIM

Diff lengkap, tidak diringkas: **`docs/ATP-SEMANTIC-CORRECTION-EVIDENCE.diff`**
(2.066 baris, `diff -u` setiap berkas terhadap salinan yang diambil sebelum
suntingan pertama Pass 5). Tiga potongan yang menentukan:

**Q.1 — `index.ts`: parser lama (dihapus)**

```ts
function extractJson(text: string): unknown {
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) return JSON.parse(arrMatch[0]);
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);
  throw new Error('Tidak ada JSON dalam respons');
}
```

**Q.2 — `kontrak.ts`: parser pengganti**

```ts
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
```

**Q.3 — `kontrak.ts` `bangunKonteksAtp()`: otoritas A17**

BEFORE:

```ts
  kejuruan.push(program
    ? `Kelas ini program keahlian ${program}. Pakai kosakata, situasi, dokumen kerja, dan tugas yang benar-benar ditemui di bidang itu.`
    : 'Program keahlian kelas ini belum tercatat. Pakai konteks umum kehidupan sehari-hari dan sekolah.');
  …
  if (delegasi.konteks_tugas && LABEL_KONTEKS_TUGAS[delegasi.konteks_tugas]) {
    kejuruan.push(LABEL_KONTEKS_TUGAS[delegasi.konteks_tugas]);
```

AFTER:

```ts
  kejuruan.push(program
    ? `Kelas ini program keahlian ${program}. Bila sebuah TP memakai situasi kerja, situasi itu harus autentik bagi bidang ${program} — kosakata, dokumen, dan tugas yang benar-benar ditemui di sana. ` +
      'Program keahlian TIDAK menentukan berapa banyak TP yang berlatar kerja; porsinya ditentukan keputusan konteks contoh dan tugas.'
    : 'Program keahlian kelas ini belum tercatat. Pakai konteks umum kehidupan sehari-hari dan sekolah.');
  …
  if (delegasi.konteks_tugas && ARAHAN_KONTEKS_TUGAS[delegasi.konteks_tugas]) {
    kejuruan.push(ARAHAN_KONTEKS_TUGAS[delegasi.konteks_tugas]);
```

**Q.4 — `index.ts`: langkah 9 (dua cabang repair, BEFORE) → orkestrator (AFTER)**

Blok BEFORE memuat `callAI(..., 'perbaikan-1')` dengan pesan
``JSON tidak valid. Hasilkan ulang HANYA JSON array TP yang valid.`` diikuti
`callAI(..., 'perbaikan-2')`. Keduanya dapat ditempuh berurutan; lihat diff.
AFTER:

```ts
  const syarat = bangunSyaratValidasi({
    alokasi, target_tp: targetTp.target, elemen: elemenCp, wajib,
    delegasi, dasar_tersedia: dasarBoleh, prioritas: prioritasDipilih(cd),
  });

  let hasilSusun: Awaited<ReturnType<typeof susunDenganSatuPerbaikan>>;
  try {
    hasilSusun = await susunDenganSatuPerbaikan(
      (pesan, fase) => callAI(
        pesan,
        fase === 'utama' ? 60_000 : Math.max(10_000, 100_000 - (Date.now() - startTime)),
        anggaranToken,
        fase,
      ),
      userMessage, syarat,
    );
  } catch (e) {
```

**Q.5 — `cp-acuan.json` (satu dari empat, pola sama)**

```json
                "logika": "AND pada objek pemahaman: … OR pada lingkup topik: …",
+               "cakupan_wajib": {
+                 "kategori_teks": [
+                   "fiksi",
+                   "nonfiksi"
+                 ]
+               },
                "layanan": "dilayani",
```

---

## R. Remaining Defects

Tidak ada yang diperbaiki sesudah retest dimulai.

```
DEFECT ID : RT-001
SEVERITY  : MEDIUM
CASES     : S3 (panggilan 1)
EXPECTED  : TP "Menulis cerita fiksi pengalaman magang memakai media presentasi cetak"
            diterima — menulis FIKSI tentang magang tidak menuntut magang/kunjungan
ACTUAL    : ditolak [B1] "menuntut kunjungan atau narasumber"; memakan satu perbaikan
EVIDENCE  : tests/artifacts/atp-semantic-pass5/S3-validation.json, S3-call2-repair-prompt.txt
LIKELY LAYER: CONTRACT — POLA_BAHAN_TERLARANG (Pass 2) memuat \bmagang\b; dikalibrasi
            pada 21 judul produksi, belum pada judul fiksi bertema kerja
DAMPAK    : bukan salah hasil (perbaikan berhasil), tetapi membakar satu panggilan dan,
            di produksi, satu kesempatan perbaikan yang seharusnya untuk masalah nyata
```

```
DEFECT ID : RT-002 (sisa SEM-008)
SEVERITY  : LOW
CASES     : S1 (TP 7 konteks "lembar informasi produk pakaian"), S4 (TP 10 "lembar gagasan
            cetak", TP 11 "lembar tanggapan kritis"), S5 (TP 7 catatan "format kartu
            petunjuk cetak"), S6 (TP 4 "lembar portofolio cetak")
EXPECTED  : bentuk konkret media presentasi tidak ditentukan ATP
ACTUAL    : judul bersih 7/7, tetapi bentuk media muncul di field konteks/catatan
EVIDENCE  : tests/artifacts/atp-semantic-pass5/_analisis.json; Sn-output-final.json
LIKELY LAYER: PROMPT — larangan di SYSTEM_PROMPT menyebut "di ATP cukup tulis media
            presentasi cetak" tanpa menyebut field konteks/catatan
DAMPAK    : rendah — konteks dan catatan tidak dicetak di DOCX dan tidak ditampilkan di
            ringkasan draf; tetapi akan dibaca generate-modul bila Modul memakainya
```

```
DEFECT ID : RT-003
SEVERITY  : LOW
CASES     : S1, S3, S5, S7 (paling nyata)
EXPECTED  : kategori teks disimpan di field terstruktur; judul ditulis untuk guru
ACTUAL    : label kategori ikut masuk kalimat judul — "dialog nonfiksi", "laporan nonfiksi",
            "teks lisan nonfiksi", "petunjuk kerja nonfiksi"
EVIDENCE  : §I.1 TP 2, 5, 7; §I.3 TP 6, 7; §I.5 TP 1, 5, 6, 7; §I.7 TP 1, 4, 7
LIKELY LAYER: PROMPT — "Isi judul dan konteks TP harus sesuai kategorinya" dibaca
            sebagai perintah menuliskan kata kategorinya
```

```
DEFECT ID : RT-004 (sisa SEM-005)
SEVERITY  : LOW
CASES     : S3
EXPECTED  : urutan TP sesuai pilihan A19 "hierarki" (reseptif → produktif)
ACTUAL    : TP 5 (menulis fiksi) mendahului TP 6 (menyimak dialog) di semester 1
EVIDENCE  : §I.3
LIKELY LAYER: MODEL
CATATAN   : 6 dari 7 kasus kini konsisten; kesamaan enum antar-kasus tidak dinilai sebagai
            defect sesuai keputusan peninjau
```

```
DEFECT ID : RT-005
SEVERITY  : MEDIUM (bukti untuk keputusan, bukan cacat kode)
CASES     : S6
EXPECTED  : 5 TP pada 48 JP melayani 9 tuntutan dengan wajar
ACTUAL    : struktural lolos, tetapi setiap TP berkategori memikul dua genre, dan TP 4
            memikul tiga produk (cerita fiksi, portofolio, media presentasi) dalam 12 JP
            untuk 36 murid yang jauh di bawah
EVIDENCE  : §I.6, §N
LIKELY LAYER: HEURISTIC — lantai hitungTargetTp() bertemu K2 dan C6; tidak diubah di Pass 5
```

```
DEFECT ID : RT-006 (pengamatan)
SEVERITY  : LOW
CASES     : S2
EXPECTED  : kemampuan produktif kompleks tidak dimajukan sebelum fondasinya terbangun
            (ARAHAN_KESIAPAN.jauh_di_bawah)
ACTUAL    : TP 4 menuntut mempertahankan argumen lisan (MB-3) di akhir semester 1
EVIDENCE  : §I.2
LIKELY LAYER: MODEL / PROMPT
```

**Bukan defect, dicatat:** ruang plafon token menyempit (puncak 60% di S5) karena
SYSTEM_PROMPT membesar 42% sementara `anggaranTokenAtp()` sengaja tidak diubah
(§O).

---

## S. Final Status

```
ATP SEMANTIC RETEST — READY FOR REVIEW
```

Pemeriksaan penutup, verbatim:

```
sha256 63 berkas sesudah retest vs snapshot pra-live → 63/63 identik
deno test --allow-read tests/atp-kontrak.test.ts     → ok | 50 passed | 0 failed
node tests/atp-acuan-sinkron.mjs                     → LULUS — acuan CP sinkron (supabase/functions/generate-atp/acuan-cp.ts)
node tests/atp-trace.mjs --periksa                   → LULUS — docs/SPEC-ATP-KONTRAK.md sesuai dengan kontrak di kode.
pemindaian rahasia tests/artifacts/atp-semantic-pass5/ → BERSIH
nilai GOOGLE_API_KEY di tests/artifacts/, docs/, scratchpad → tidak ditemukan
tests/artifacts/atp-semantic/ (baseline)             → 82 berkas, tidak disentuh
git diff --stat -- supabase/functions/generate-modul → kosong
```

Tidak ada deploy, commit, push, tulisan ke Supabase, perubahan akun guru,
pemakaian secret produksi, sentuhan ke Modul atau Naskah, maupun perubahan CP
normatif. Keputusan penerimaan ada di tangan peninjau.
