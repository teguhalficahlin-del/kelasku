# ATP READINESS ROBUSTNESS REPORT

**Tanggal:** 10 September 2026
**Lingkup:** hanya S1 (BASELINE) ↔ S2 (READINESS VERY LOW), empat paired repetitions baru.
**Sifat:** uji bukti. **Tidak ada satu baris kode pun yang diubah.**

---

## A. FROZEN BASELINE

### A.1 Hash sumber — sebelum run

```
8d5cecc77fcd39287086df29df5bbbda60fb9c4f23d4576df410db9aaae8fddb  supabase/functions/generate-atp/index.ts
3814f3bb5cba5290f91d8c37d49aa5a1907621b265e8c9e40ded59ca58fd1a29  supabase/functions/generate-atp/kontrak.ts
277ded9e28945a03639f3a871c78839c7335629a56cb805083a15b768764481a  supabase/functions/generate-atp/acuan-cp.ts
d7cec47b947beca127a62610feb862a473754931cfb4171ff99b37f30df3427d  shared/data/cp-acuan.json
b80cc3e4bd12d43b6c3d59e48a244de525cfe52f55f82bb9b8fafa93ba6494c9  tests/atp-semantic-harness.ts
3bd090e5902f7735def489a140bc85ccb5e98d96a4f2a675742144fb55b71ddf  tests/atp-kontrak.test.ts
020666eed18a68aec29296972573373c8a3b74c26dea9fde52db9b2482699436  guru/js/rancang-chat.js
b6dda1ae9502cdc9e045dfa15f96fc76f3f3f11007e7967978fddb2cfe267d72  guru/js/rancang-chat-flow.js
```

### A.2 Structural suite — sebelum run

```
$ deno test --allow-read tests/atp-kontrak.test.ts
ok | 52 passed | 0 failed (106ms)

$ node tests/atp-acuan-sinkron.mjs
LULUS — acuan CP sinkron (supabase/functions/generate-atp/acuan-cp.ts)

$ node tests/atp-trace.mjs --periksa
LULUS — docs/SPEC-ATP-KONTRAK.md sesuai dengan kontrak di kode.
```

### A.3 Model / config

Diambil dari sumber `generate-atp/index.ts` oleh harness pada saat dijalankan, bukan disalin:

```
model                : gemini-3.8-flash
temperature          : (tidak diset — default penyedia)
generationConfig     : generationConfig: { maxOutputTokens: maxTokens }
SYSTEM_PROMPT sha256 : fb332ffa7a766cbf3a38a6f9ca53a7c7b56a0a5024156a780b201ffc5694c699
SYSTEM_PROMPT panjang: 10063 karakter
CP                   : 046/H/KR/2025 | review: diterima | 9 tuntutan
anggaran token       : 16400 (identik S1 dan S2)
maks panggilan/kasus : 2 (utama + paling banyak satu perbaikan) — pipeline produksi
```

`GOOGLE_API_KEY` diambil dari environment lokal pengguna, tidak pernah dicetak maupun masuk artefak. Tidak ada koneksi ke Supabase, tidak ada deploy, tidak ada commit.

---

## B. PAIRED INPUTS — bukti hanya readiness yang berbeda

Hash artefak masukan, keempat repetisi:

| Berkas | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| `S1-input.json` | `44b4e0b3…` | `44b4e0b3…` | `44b4e0b3…` | `44b4e0b3…` |
| `S1-user-message.json` | `fd4203c7…` | `fd4203c7…` | `fd4203c7…` | `fd4203c7…` |
| `S2-input.json` | `e0a34cd9…` | `e0a34cd9…` | `e0a34cd9…` | `e0a34cd9…` |
| `S2-user-message.json` | `29e97404…` | `29e97404…` | `29e97404…` | `29e97404…` |
| `S*-system-prompt.txt` | `fb332ffa…` | `fb332ffa…` | `fb332ffa…` | `fb332ffa…` |

**Masukan setiap repetisi byte-for-byte identik.** Satu-satunya sumber variasi adalah model itu sendiri.

Diff S1 ↔ S2 pada `collected_data`:

```diff
-    "tingkat_kemampuan_awal": "sedikit_di_bawah",
+    "tingkat_kemampuan_awal": "jauh_di_bawah",
```

Satu baris. Tidak ada yang lain.

Diff S1 ↔ S2 pada `userMessage` — pembandingan per kunci:

```
kunci IDENTIK : cp_anchor, prioritas_guru, konteks_kejuruan, anggaran_waktu,
                keputusan_didelegasikan, keputusan_terbuka,
                penerapan_prioritas_wajib, batas_mutlak
kunci BERBEDA : kesiapan_murid   (ARAHAN_KESIAPAN)
                instruksi        (hanya angka target TP: 11 vs 9)
```

Artinya: CP sama, waktu sama (jpOp 126, satuan pertemuan 2, 63 pertemuan, Semester 1 = 62 JP / Semester 2 = 64 JP), program sama (Tata Busana), jumlah murid sama (32), prioritas sama (`pkl_kerja`, `kemampuan_dasar`), A17/A19 sama-sama terbuka. `hitungTargetTp()` tidak disentuh: S1 target 11, S2 target 9 di keempat repetisi.

---

## C. R1

### C.1 R1-S1 — BASELINE (11 TP)

A17 = seimbang · A19 = hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 10 | MB-1 | Menyimak petunjuk kerja lisan dan mencatat gagasan utama pembuatan pola busana |
| 2 | 1 | 10 | MM-1 | Membaca teks petunjuk perawatan pakaian dan menemukan alur informasi secara menyeluruh |
| 3 | 1 | 10 | MM-2 | Menganalisis dan menyimpulkan informasi tersurat dan tersirat dalam lembar spesifikasi busana |
| 4 | 1 | 10 | MB-1 | Menyimak cerita pendek tentang penjahit dan mengidentifikasi alur peristiwa serta detail |
| 5 | 1 | 12 | MM-1, MM-2 | Membaca cerita pendek busana lalu menyimpulkan pesan tersurat dan tersirat antartokoh |
| 6 | 1 | 10 | MB-2 | Mengungkapkan pendapat lisan mengenai kesesuaian gaya busana dalam pergaulan sehari-hari |
| 7 | 2 | 12 | MB-3 | Mempertahankan argumen lisan dalam diskusi pemilihan material busana untuk pelanggan |
| 8 | 2 | 12 | MP-1 | Menulis cerita pendek tentang pengalaman merancang pakaian dengan struktur kalimat tepat |
| 9 | 2 | 14 | MP-1, MP-2 | Menulis deskripsi produk busana menggunakan media presentasi cetak untuk pelanggan |
| 10 | 2 | 12 | MP-4 | Mengungkapkan pendapat tertulis mengenai isu penanganan limbah tekstil dan lingkungan |
| 11 | 2 | 14 | MP-2, MP-5 | Mempertahankan argumen tertulis tentang busana berkelanjutan menggunakan media presentasi cetak |

Cakupan 9/9 tuntutan. Σ jp_alokasi = 126.

### C.2 R1-S2 — READINESS VERY LOW (9 TP)

A17 = seimbang · A19 = hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 16 | MM-1, MM-2 | Membaca petunjuk kerja busana untuk menemukan informasi tersurat dan tersirat |
| 2 | 1 | 14 | MM-1, MM-2 | Membaca cerita busana tradisional dan menyimpulkan pesan tersurat serta tersirat |
| 3 | 1 | 16 | MB-1 | Menyimak dialog pelayanan butik dan memahami gagasan utama serta detail percakapan |
| 4 | 1 | 16 | MB-1 | Menyimak cerita fiksi busana dan memahami alur informasi peristiwa penting |
| 5 | 2 | 14 | MP-1 | Menulis teks deskripsi busana kerja dengan struktur dan bahasa yang tepat |
| 6 | 2 | 12 | MP-1 | Menulis cerita pendek perancangan busana dengan struktur teks yang tepat |
| 7 | 2 | 12 | MP-2 | Mengomunikasikan rancangan busana kerja menggunakan media presentasi cetak |
| 8 | 2 | 14 | MB-2, MB-3 | Mengungkapkan pendapat dan mempertahankan argumen lisan tentang tren busana kerja |
| 9 | 2 | 12 | MP-4, MP-5 | Mengungkapkan pendapat dan mempertahankan argumen tertulis tentang pemilihan bahan busana |

Cakupan 9/9 tuntutan. Σ jp_alokasi = 126.

### C.3 Penilaian R1

- **R1 Endpoint fidelity — PASS.** 9/9 tuntutan. MB-3 dan MP-5 tetap ada dan tetap dirumuskan sebagai mempertahankan argumen. Tidak ada penurunan kemampuan akhir.
- **R2 Early progression — YA.** Semester 1 S2 **seluruhnya reseptif** (2 membaca + 2 menyimak). Baseline sudah menaruh produksi lisan (MB-2) di Semester 1. Yang berbeda jenis kegiatannya, bukan kata sifat di judulnya.
- **R3 Time/depth — YA.** TP reseptif awal S2 masing-masing 14–16 JP; empat TP reseptif memakan seluruh 62 JP Semester 1. Ruangnya benar-benar dipakai memanjangkan fondasi.
- **R4 Complex production timing — YA.** MB-3 di S1 pada TP 7/11 (Semester 2, awal); di S2 pada TP 8/9 (Semester 2, akhir). MP-5 sama-sama TP terakhir. Tidak ada kompetensi kompleks yang dimajukan.
- **R5 Beyond heuristic — YA.** Titik transisi reseptif→produktif berpindah lintas semester. 11 TP vs 9 TP tidak menuntut itu: baseline dengan 11 TP tetap bisa menaruh seluruh produksi di Semester 2 — dan pada R4 baseline memang melakukannya.

**Verdict R1: `CAUSAL`**

---

## D. R2

### D.1 R2-S1 — BASELINE (11 TP)

A17 = seimbang · A19 = hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 10 | MB-1 | Menyimak dialog instruksi kerja busana dan mengidentifikasi informasi penting |
| 2 | 1 | 10 | MB-1 | Menyimak narasi fiksi dunia mode dan menjelaskan gagasan utamanya |
| 3 | 1 | 10 | MM-1 | Membaca deskripsi jenis kain busana untuk memahami alur informasi teks |
| 4 | 1 | 10 | MM-2 | Menganalisis artikel tren busana dan menyimpulkan informasi penting di dalamnya |
| 5 | 1 | 12 | MP-1, MP-2 | Menulis panduan perawatan busana menggunakan media presentasi cetak secara tepat |
| 6 | 1 | 10 | MB-2 | Mengungkapkan pendapat lisan mengenai etika berpakaian di tempat kerja |
| 7 | 2 | 12 | MM-1, MM-2 | Membaca cerita fiksi perancang busana dan menyimpulkan pesan tersiratnya |
| 8 | 2 | 12 | MP-1 | Menulis cerita fiksi tentang dinamika kerja di sanggar busana |
| 9 | 2 | 14 | MB-3 | Menyampaikan dan mempertahankan argumen lisan tentang efisiensi bahan busana |
| 10 | 2 | 12 | MP-4 | Menulis teks opini tentang pemanfaatan busana daur ulang secara runtut |
| 11 | 2 | 14 | MP-5, MP-2 | Menulis teks argumen isu busana berkelanjutan menggunakan media presentasi cetak |

### D.2 R2-S2 — READINESS VERY LOW (9 TP)

A17 = seimbang · A19 = hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 14 | MB-1 | Menyimak petunjuk kerja penjahitan busana dan menjawab pertanyaan detail |
| 2 | 1 | 16 | MM-1, MM-2 | Membaca deskripsi bahan busana serta menyimpulkan informasi tersirat |
| 3 | 1 | 16 | MB-1 | Menyimak cerita fiksi busana dan menemukan alur ceritanya |
| 4 | 1 | 16 | MM-1, MM-2 | Membaca cerita fiksi busana dan menyimpulkan amanat ceritanya |
| 5 | 2 | 14 | MP-1 | Menulis pengalaman pribadi terkait praktik busana dengan struktur tepat |
| 6 | 2 | 12 | MP-1 | Menulis cerita rekaan tentang perancang busana dengan alur runtut |
| 7 | 2 | 12 | MP-2 | Menyajikan informasi perawatan pakaian menggunakan media presentasi cetak |
| 8 | 2 | 14 | MB-2, MB-3 | Menyampaikan pendapat dan mempertahankan argumen lisan tentang etika berbusana |
| 9 | 2 | 12 | MP-4, MP-5 | Menulis opini dan mempertahankan argumen tentang limbah industri busana |

### D.3 Penilaian R2

- **R1 Endpoint — PASS.** 9/9, ujung fase utuh.
- **R2 Early progression — YA.** Baseline menaruh **dua** TP produktif di Semester 1 (TP 5 menulis + media cetak, TP 6 pendapat lisan). S2 nol. Kompleksitas produksi di paruh awal berbeda secara kategorial, bukan bertingkat.
- **R3 Time/depth — YA.** Empat TP reseptif 14–16 JP mengisi penuh Semester 1; teks fiksi dan nonfiksi dipisah ke TP sendiri-sendiri alih-alih ditumpuk dalam satu TP.
- **R4 Complex production timing — YA.** MB-3 di S1 pada TP 9/11 (0,82), di S2 pada TP 8/9 (0,89) — proporsional lebih akhir; keduanya Semester 2. Tidak ada yang dimajukan.
- **R5 Beyond heuristic — YA.** Baseline memindahkan satu TP membaca ke Semester 2 (TP 7) dan menaruh menulis di Semester 1; S2 melakukan kebalikannya secara utuh. Pengelompokan lintas semester ini tidak ditentukan jumlah TP.

**Verdict R2: `CAUSAL`**

---

## E. R3

### E.1 R3-S1 — BASELINE (11 TP)

A17 = seimbang · A19 = hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 12 | MM-1 | Membaca teks petunjuk kerja busana dan merangkum alur informasi secara menyeluruh |
| 2 | 1 | 12 | MB-1 | Menyimak dialog pemesanan busana kerja dan mencatat gagasan pokok serta rinciannya |
| 3 | 1 | 14 | MM-1, MM-2 | Membaca cerita pendek bertema perancang busana lalu menyimpulkan makna tersurat dan tersirat |
| 4 | 1 | 12 | MB-1 | Menyimak narasi fiksi tentang penjahit tradisional dan menceritakan kembali alur kisahnya |
| 5 | 1 | 12 | MP-1 | Menulis catatan pengalaman praktik pembuatan busana dengan struktur teks yang tepat |
| 6 | 2 | 10 | MM-2 | Menganalisis artikel profil industri garmen lalu menyimpulkan gagasan utama dan implikasinya |
| 7 | 2 | 12 | MP-1 | Menulis cerita pendek rekaan tentang etika busana dengan unsur kebahasaan tepat |
| 8 | 2 | 10 | MB-2, MB-3 | Mengungkapkan dan mempertahankan pendapat secara lisan tentang busana kerja ramah lingkungan |
| 9 | 2 | 10 | MP-4, MP-5 | Menulis teks argumen tentang dampak limbah busana dan mempertahankan sudut pandang |
| 10 | 2 | 10 | MP-1, MP-2 | Mempresentasikan deskripsi busana kerja menggunakan media presentasi cetak dengan struktur runtut |
| 11 | 2 | 12 | MP-2, MP-5 | Mempertahankan argumen konsep desain busana menggunakan media presentasi cetak saat presentasi |

### E.2 R3-S2 — READINESS VERY LOW (9 TP)

A17 = seimbang · A19 = hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 14 | MB-1 | Menyimak narasi dan percakapan untuk menemukan ide pokok serta detail busana |
| 2 | 1 | 16 | MM-1 | Membaca cerita inspiratif dan teks profil untuk memahami alur informasi busana |
| 3 | 1 | 16 | MM-2 | Menganalisis dan menyimpulkan informasi tersurat serta tersirat dalam ulasan tren mode |
| 4 | 1 | 16 | MP-1 | Menulis cerita pendek dan teks deskripsi mengenai pengalaman merancang busana |
| 5 | 2 | 12 | MP-1, MP-2 | Menyusun teks deskripsi produk dan menyajikannya menggunakan media presentasi cetak |
| 6 | 2 | 12 | MB-2 | Mengungkapkan pendapat secara lisan tentang preferensi busana dalam konsultasi pelanggan |
| 7 | 2 | 12 | MB-3 | Mempertahankan argumen secara lisan dalam simulasi rapat produksi tata busana |
| 8 | 2 | 14 | MP-4 | Menulis teks opini untuk mengungkapkan pandangan terhadap penanganan limbah tekstil |
| 9 | 2 | 14 | MP-5 | Menulis teks argumen untuk mempertahankan sikap mengenai etika profesi busana |

### E.3 Penilaian R3

- **R1 Endpoint — PASS.** 9/9.
- **R2 Early progression — YA.** TP 1–3 S2 masing-masing memikul **satu** tuntutan; baseline sudah menumpuk MM-1+MM-2 pada TP 3. Beban kemampuan yang ditumpuk di awal lebih rendah, bukan sekadar lebih lambat.
- **R3 Time/depth — YA.** Fondasi reseptif S2 mendapat 46 JP di tiga TP (14/16/16); baseline memberi 38 JP tersebar di empat TP yang salah satunya sudah ganda.
- **R4 Complex production timing — NETRAL, tidak melanggar.** MB-3 di S1 pada TP 8/11 (0,73), di S2 pada TP 7/9 (0,78). Keduanya Semester 2. Tidak dimajukan, tetapi juga tidak jelas lebih akhir.
- **R5 Beyond heuristic — YA, dan ini yang menentukan.** Baseline **menggabungkan** pasangan argumentasi: MB-2+MB-3 dalam satu TP 10 JP, dan MP-4+MP-5 dalam satu TP 10 JP. S2, yang punya **lebih sedikit** TP, justru **memecahnya**: MB-2, MB-3, MP-4, MP-5 masing-masing satu TP sendiri, 12–14 JP. Jumlah TP yang lebih sedikit secara heuristik mendorong penumpukan yang lebih banyak; yang terjadi kebalikannya. Jumlah TP bertumpuk: 5 (S1) → 1 (S2). Ini tidak dapat dijelaskan oleh 11 vs 9.

**Verdict R3: `CAUSAL`** (catatan: dimensi R4 netral, bukan positif)

---

## F. R4

### F.1 R4-S1 — BASELINE (11 TP)

A17 = seimbang · **A19 = mudah_sulit** — satu-satunya run yang tidak memilih hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 12 | MM-1 | Membaca teks deskripsi tentang bahan busana untuk mengidentifikasi alur informasi keseluruhan |
| 2 | 1 | 12 | MM-1 | Membaca cerita pendek bertema pakaian tradisional untuk menemukan alur peristiwa utama |
| 3 | 1 | 12 | MM-2 | Menganalisis informasi tersurat dan tersirat dalam petunjuk perawatan pakaian |
| 4 | 1 | 12 | MM-2 | Menyimpulkan pesan tersirat dan karakter tokoh dalam cerita fiksi mode |
| 5 | 1 | 14 | MB-1 | Menyimak paparan lisan dan cerita busana untuk menemukan gagasan utama |
| 6 | 2 | 10 | MB-2 | Mengungkapkan pendapat secara lisan mengenai pemilihan busana kerja yang sesuai |
| 7 | 2 | 10 | MB-3 | Mempertahankan argumen secara lisan saat mendiskusikan konsep desain busana pelanggan |
| 8 | 2 | 10 | MP-1 | Menulis teks deskriptif tentang prosedur pembuatan busana dengan struktur tepat |
| 9 | 2 | 10 | MP-1, MP-2 | Menulis cerita pengalaman merancang busana menggunakan media presentasi cetak |
| 10 | 2 | 12 | MP-4 | Mengungkapkan pendapat secara tertulis mengenai tren busana ramah lingkungan terkini |
| 11 | 2 | 12 | MP-2, MP-5 | Mempertahankan argumen tertulis tentang pemilihan bahan menggunakan media presentasi cetak |

Semester 1 seluruhnya reseptif. Produksi seluruhnya Semester 2. MB-2 dan MB-3 masing-masing TP sendiri.

### F.2 R4-S2 — READINESS VERY LOW (9 TP)

A17 = seimbang · A19 = hierarki

| # | Sem | JP | Tuntutan | Judul |
|---|---|---|---|---|
| 1 | 1 | 14 | MM-1 | Membaca petunjuk pembuatan pola busana untuk memahami alur informasi secara keseluruhan |
| 2 | 1 | 12 | MM-1, MM-2 | Membaca cerita pendek tentang perancang busana untuk menyimpulkan pesan tersurat dan tersirat |
| 3 | 1 | 12 | MM-2 | Menganalisis artikel tren busana terkini untuk menyimpulkan informasi tersurat dan tersirat |
| 4 | 1 | 12 | MB-1 | Menyimak paparan profil butik dan kisah perancang untuk mengidentifikasi gagasan utama |
| **5** | **1** | **12** | **MB-2, MB-3** | **Melakukan percakapan lisan untuk mengungkapkan pendapat dan mempertahankan argumen tentang busana** |
| 6 | 2 | 16 | MP-1 | Menulis cerita pendek tentang pengalaman merancang busana dengan struktur kalimat tepat |
| 7 | 2 | 16 | MP-1, MP-2 | Menulis deskripsi produk busana menggunakan media presentasi cetak dengan tata bahasa tepat |
| 8 | 2 | 16 | MP-4 | Menulis teks tanggapan untuk mengungkapkan pendapat mengenai pemanfaatan limbah kain tekstil |
| 9 | 2 | 16 | MP-5 | Menulis esai argumentatif untuk mempertahankan argumen terkait pemilihan bahan busana berkelanjutan |

### F.3 Penilaian R4

- **R1 Endpoint — PASS.** 9/9 tuntutan tercakup, ujung fase tidak diturunkan.
- **R2 Early progression — TIDAK.** TP 5 (Semester 1) menumpuk **dua** tuntutan produktif kompleks — mengungkapkan pendapat **dan** mempertahankan argumen secara lisan — dengan JP terkecil di seluruh daftar S2 (12 JP). Baseline memberi kedua kemampuan itu TP terpisah dan menaruh keduanya di Semester 2.
- **R3 Time/depth — SEBAGIAN.** JP per TP memang lebih lapang, tetapi itu konsekuensi aritmetika 126/9. Ruang tambahan tidak dipakai memperlandai jalan menuju argumentasi; argumentasi justru didahulukan.
- **R4 Complex production timing — GAGAL.** MB-3 (mempertahankan argumen) muncul di **Semester 1**, TP 5/9, pada kelas "jauh di bawah" — sementara baseline yang muridnya lebih siap menundanya ke Semester 2, TP 7/11. Kelas yang jauh lebih lemah melakukan kompetensi kompleks satu semester **lebih awal**. Seluruh kemampuan menulis (MP-1) baru muncul di TP 6, jadi argumentasi lisan itu tiba **sebelum** fondasi produktif mana pun terbangun.
  `ARAHAN_KESIAPAN` menyatakan hal ini secara harfiah: *"kemampuan produktif yang kompleks (menulis argumen, mempertahankan argumen) tidak dimajukan sebelum fondasi pemahaman dan kalimatnya terbangun."* Instruksi itu dilanggar pada run yang justru menerimanya.
- **R5 Beyond heuristic — ADA, ARAHNYA SALAH.** Perbedaan yang tidak dapat dijelaskan 11 vs 9 memang ada (penempatan lintas semester + penumpukan MB-2/MB-3 jadi satu TP), tetapi ia membuat perjalanan **kurang** realistis, bukan lebih.
- **Alasan progression yang jelas — TIDAK ADA.** `penerapan_prioritas` run ini hanya menyebut TP 1 dan 2 sebagai penguatan fondasi dan tidak menyinggung TP 5 sama sekali. `dasar` untuk A19 menyebut `cp_anchor.tuntutan` dan `kesiapan_murid`, lalu menghasilkan urutan yang bertentangan dengan `kesiapan_murid`.

**Verdict R4: `WRONG`**

---

## G. PAIR VERDICT TABLE

| Pair | Endpoint | Early progression | Time/depth | Complex production | Beyond heuristic | Verdict |
|------|----------|-------------------|------------|--------------------|------------------|---------|
| R1 | PASS | YA — Semester 1 seluruhnya reseptif (S1: 1 TP produktif) | YA — 62 JP penuh untuk fondasi | YA — MB-3 0,89 vs 0,64 | YA — transisi reseptif→produktif pindah semester | **CAUSAL** |
| R2 | PASS | YA — S1 punya 2 TP produktif di Sem 1, S2 nol | YA — 4 TP reseptif 14–16 JP | YA — MB-3 0,89 vs 0,82 | YA — pengelompokan lintas semester dibalik | **CAUSAL** |
| R3 | PASS | YA — TP 1–3 tuntutan tunggal (S1 sudah ganda di TP 3) | YA — 46 JP fondasi di 3 TP | NETRAL — 0,78 vs 0,73, sama-sama Sem 2 | YA — TP bertumpuk 5→1 meski TP lebih sedikit | **CAUSAL** |
| R4 | PASS | TIDAK — MB-2+MB-3 ditumpuk di Sem 1, 12 JP | SEBAGIAN — JP lapang tapi tidak dipakai memperlandai | **GAGAL** — MB-3 di Sem 1 (S1: Sem 2) | ADA, arah salah | **WRONG** |

Catatan pembacaan: `meanJP` S2 selalu 14,0 dan S1 selalu 11,5 di keempat repetisi — itu 126/9 vs 126/11, murni aritmetika. Angka itu **tidak** dipakai sebagai bukti di baris mana pun.

Metrik pendukung, keempat pasangan:

| Run | TP | TP bertumpuk 2 tuntutan | TP produktif di Sem 1 | Posisi TP produktif pertama | Posisi MB-3/MP-5 pertama | Cakupan |
|---|---|---|---|---|---|---|
| R1-S1 | 11 | 3 | 1 | 6/11 | 7/11 (Sem 2) | 9/9 |
| R1-S2 | 9 | 4 | 0 | 5/9 | 8/9 (Sem 2) | 9/9 |
| R2-S1 | 11 | 3 | 2 | 5/11 | 9/11 (Sem 2) | 9/9 |
| R2-S2 | 9 | 4 | 0 | 5/9 | 8/9 (Sem 2) | 9/9 |
| R3-S1 | 11 | 5 | 1 | 5/11 | 8/11 (Sem 2) | 9/9 |
| R3-S2 | 9 | 1 | 1 | 4/9 | 7/9 (Sem 2) | 9/9 |
| R4-S1 | 11 | 2 | 0 | 6/11 | 7/11 (Sem 2) | 9/9 |
| R4-S2 | 9 | 3 | 1 | 5/9 | **5/9 (Sem 1)** | 9/9 |

---

## H. AGGREGATE RESULT

```text
CAUSAL = 3/4   (R1, R2, R3)
WEAK   = 0/4
WRONG  = 1/4   (R4)
```

Aturan §8: PASS menuntut minimal 3/4 `CAUSAL` **dan tidak ada `WRONG`**.
Syarat pertama terpenuhi. Syarat kedua tidak.

**Hasil: INCONCLUSIVE / FAIL.**

---

## I. COMPARISON WITH EARLIER RUNS (konteks saja — TIDAK masuk denominator)

| Run | Sumber | Verdict |
|---|---|---|
| Pass 5 | sumber pra-final-hardening | `CAUSAL` |
| Final hardening | sumber FINAL | `WEAK` |
| R1–R4 (laporan ini) | sumber FINAL, beku | 3 `CAUSAL`, 1 `WRONG` |

Pertanyaan yang memicu uji ini — *model variance atau readiness instruction yang belum cukup reliable?* — kini terjawab dengan bukti: **keduanya, tetapi variance-nya tidak simetris.** Dengan masukan byte-identik, empat pengulangan menghasilkan tiga perjalanan yang benar-benar terkontekstualisasi dan satu yang melanggar isi instruksinya sendiri. `ARAHAN_KESIAPAN` **berpengaruh** — ia bukan teks mati, dan R1/R2/R3 memperlihatkan pengaruh yang jelas melampaui jumlah TP — tetapi pengaruh itu belum menjadi jaminan.

Satu pola layak dicatat: run "final hardening" yang dinilai `WEAK` juga menempatkan mempertahankan argumen lisan di Semester 1 — gejala yang sama dengan R4 di sini, hanya lebih ringan. Jadi ini bukan kejadian tunggal melainkan mode kegagalan berulang pada satu dimensi yang sama: **penempatan MB-3 relatif terhadap fondasi produktif.**

---

## J. PIPELINE RELIABILITY

| Run | Status | Panggilan | Repair | Latensi | Prompt tok | Keluaran tok | Penalaran tok | Total tok | Maks kata judul |
|---|---|---|---|---|---|---|---|---|---|
| R1-S1 | FIRST_PASS | 1 | 0 | 14.722 ms | 7.462 | 2.191 | 2.438 | 12.091 | 11 |
| R1-S2 | FIRST_PASS | 1 | 0 | 17.820 ms | 7.545 | 1.886 | 4.226 | 13.657 | 11 |
| R2-S1 | FIRST_PASS | 1 | 0 | 17.235 ms | 7.462 | 2.364 | 3.230 | 13.056 | 10 |
| R2-S2 | FIRST_PASS | 1 | 0 | 15.540 ms | 7.545 | 2.088 | 2.274 | 11.907 | 9 |
| R3-S1 | FIRST_PASS | 1 | 0 | 30.725 ms | 7.462 | 2.571 | 5.795 | 15.828 | 12 |
| R3-S2 | FIRST_PASS | 1 | 0 | 32.222 ms | 7.545 | 1.897 | 8.447 | 17.889 | 11 |
| R4-S1 | FIRST_PASS | 1 | 0 | 19.829 ms | 7.462 | 2.116 | 4.633 | 14.211 | 11 |
| R4-S2 | FIRST_PASS | 1 | 0 | 23.583 ms | 7.545 | 2.152 | 5.482 | 15.179 | 12 |

**8/8 first pass. Nol repair. Nol kegagalan validasi. Nol pemotongan.**
Total 8 panggilan model — persis anggaran normal §4.

Terhadap plafon 16.400 `maxOutputTokens`: keluaran tertinggi 2.571 tok (R3-S1) dan penalaran tertinggi 8.447 tok (R3-S2); jumlah keduanya pada run terberat 10.344 tok, masih 63% plafon. Tidak ada `finishReason: MAX_TOKENS`. FH-004 tidak dibuka kembali; angka ini hanya dilaporkan.

Reliabilitas mekanis ATP pada baseline FINAL: **bersih.** Yang belum terbukti bukan pipeline-nya, melainkan keandalan semantik satu instruksi.

---

## K. SOURCE FREEZE PROOF

```
$ diff _freeze-before.txt _freeze-after.txt
(tidak ada keluaran)
FREEZE OK — identical
```

Kedelapan hash di §A.1 tidak berubah sesudah kedelapan panggilan model. Berkas bukti:
`tests/artifacts/atp-readiness-robustness/_freeze-before.txt` dan `_freeze-after.txt`.

Artefak run sebelumnya tetap utuh dan tidak tersentuh:
`tests/artifacts/atp-semantic/`, `tests/artifacts/atp-semantic-pass5/`, `tests/artifacts/atp-semantic-final/`.

Artefak run ini — 89 berkas di `tests/artifacts/atp-readiness-robustness/`, berpola `R{n}-S{1,2}-*` plus `R{n}-_parity.json`, `R{n}-_summary.json`, `R{n}-_system-prompt.txt`.

Tidak dilakukan: edit sumber, deploy, push, commit, migration, tulisan ke Supabase, sentuhan ke Modul atau Naskah, pengambilan secret produksi. S3–S7 tidak dijalankan; S6 tidak dijalankan. FH-001, FH-002, FH-004 tidak dibuka.

---

## L. RECOMMENDATION

# READINESS ROBUSTNESS — NOT PROVEN

Alasannya tunggal dan spesifik: **R4 = `WRONG`.** Bukan karena jumlah TP, bukan karena endpoint CP (utuh di 8/8 run), dan bukan karena pipeline (bersih di 8/8 run) — melainkan karena pada satu dari empat pengulangan dengan masukan identik, kesiapan "jauh di bawah" menghasilkan penempatan **mempertahankan argumen lisan di Semester 1**, satu semester lebih awal daripada baseline yang muridnya lebih siap, dan sebelum kemampuan produktif mana pun dibangun.

Sesuai §9: **tidak ada perbaikan yang dilakukan.** `ARAHAN_KESIAPAN` tidak disentuh. Prompt tidak disentuh. Pekerjaan berhenti di sini menunggu putusan reviewer.

Satu keterangan untuk dipertimbangkan bila reviewer memang menyusun correction: mode kegagalannya terpusat pada satu dimensi — penempatan MB-3 / MP-5 relatif terhadap fondasi produktif — dan muncul pula pada run final hardening yang dinilai `WEAK`. Ia lebih menyerupai satu ketentuan yang belum mengikat daripada kelemahan menyeluruh instruksi kesiapan.
