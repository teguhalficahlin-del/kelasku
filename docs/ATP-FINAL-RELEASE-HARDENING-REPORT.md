# MICLASS — ATP FINAL RELEASE HARDENING REPORT

> **STATUS: `ATP FINAL HARDENING — READY FOR ACCEPTANCE`**
>
> Hardening kecil atas tiga sisa defect Pass 5 (RT-001, RT-002, RT-003). Tidak ada
> field, tabel, migration, metadata CP, atau pertanyaan baru. Seluruh bagian yang
> dikunci reviewer tidak disentuh.
>
> **Hasil verifikasi final (S1–S7, masukan identik):** **7/7 `FIRST_PASS`**, 7
> panggilan model, nol perbaikan, nol galat parse. Seluruh gerbang keras lolos.
> RT-001 dan RT-002 tertutup, termasuk bukti live: `magang` dipakai sebagai isi
> teks di dua kasus dan lolos. RT-003 turun dari 31/69 ke 9/69 judul berlabel,
> tetapi masih bertahan di S5.
>
> **Satu target reviewer tidak tercapai dan dilaporkan apa adanya:** S1↔S2
> (kesiapan) turun dari `CAUSAL` di Pass 5 menjadi `WEAK` di run ini. Tidak ada
> defect HIGH atau BLOCKER baru, dan tidak ada regression deterministik.

---

## A. Baseline

| | |
|---|---|
| Titik awal | working tree sesudah `ATP SEMANTIC RETEST — READY FOR REVIEW` (Pass 5) |
| Keputusan reviewer | ATP SEMANTIC BASELINE — ACCEPTED |
| Dikerjakan | RT-001 (MEDIUM), RT-002 (LOW), RT-003 (LOW) |
| Tidak dibuka (keputusan reviewer) | RT-004 `ACCEPTABLE SEMANTIC VARIANCE`; RT-005 `ACCEPTED CONSTRAINT CASE`; RT-006 `OBSERVATION — NOT DEFECT` |
| Bukti sebelumnya, tidak disentuh | `tests/artifacts/atp-semantic/` (82 berkas), `tests/artifacts/atp-semantic-pass5/` (71 berkas) |

---

## B. RT-001 Correction — validator menjaga ketergantungan, bukan topik

**Sebelum:** satu pola kata topik di `POLA_BAHAN_TERLARANG`:

```ts
  { pola: /\bkunjungan\b|\bnarasumber\b|\bstudi banding\b|\bmagang\b/i, sebut: 'kunjungan atau narasumber' },
```

"Menulis cerita fiksi pengalaman **magang** …" ditolak, dan satu-satunya
perbaikan S3 di Pass 5 habis karenanya.

**Sesudah:** pola diaudit dan dibagi dua kelompok.

| Kelompok | Isi | Diperiksa pada |
|---|---|---|
| **A — benda/acara bernama** (`POLA_BAHAN_TERLARANG`) | video, rekaman, gambar, slide, aplikasi/internet, alat audio — tidak berubah; `kunjungan` dipersempit menjadi acara bernama (`kunjungan industri/lapangan/kerja/perusahaan/pabrik`, `studi banding`); `narasumber` dan `magang` yang berdiri sendiri **dicabut** | seluruh judul, konteks, dan catatan |
| **B — kegiatan murid** (`POLA_KEGIATAN_LUAR`, baru) | verba + objek: `melakukan/menjalani/mengikuti/melaksanakan` + `magang/pkl/kunjungan/studi banding/observasi lapangan`; `pergi … magang`; `mengunjungi`; `mewawancarai` + `praktisi/narasumber/pekerja/karyawan/pemilik/pelaku usaha/ahli/pengusaha`; `mengundang/menghadirkan/mendatangkan/mencari` + `narasumber/praktisi/tamu` | hanya pada **bagian kegiatan** tiap kalimat, yaitu sebelum penanda isi teks |

`PENANDA_ISI_TEKS` — `cerita, cerpen, kisah, narasi, laporan, teks, dialog,
artikel, kasus, naskah, bacaan, tentang, mengenai, berlatar, bertema,
pengalaman, profil, surat, peran, simulasi`. Kegiatan yang muncul sesudah
penanda itu adalah topik bacaan yang disediakan MiClass, bukan tuntutan.
"Peran" dan "simulasi" termasuk di dalamnya: bermain peran mewawancarai
narasumber adalah interaksi di kelas.

Satu fungsi, `sebabKetergantungan()`, dipakai validator. Tidak ada blacklist
kata konteks kerja. Uji lama CASE J (enam fixture, termasuk "Menyusun laporan
kunjungan industri…" dan "Mewawancarai narasumber…", plus kalibrasi 16 judul
produksi) lolos **tanpa satu asersi pun diubah**.

---

## C. RT-002 Correction — bentuk media Modul tidak ditentukan ATP

- **SYSTEM_PROMPT:** aturan media presentasi kini berlaku eksplisit untuk
  judul, konteks, **dan** catatan. Bentuk media cetak spesifik dipilih dan
  dibuat lengkap pada Modul Ajar. Konteks tetap menyebut situasi, topik, dan
  jenis dokumen yang dibahas; yang tidak ditentukan hanya bentuk bahannya.
- **`batas_mutlak`:** kalimat yang sama, "di judul, konteks, maupun catatan".
- **`cara_layanan`:** tetap tidak dikirim, seperti sejak Pass 5.
- **Tidak ada regex baru di validator.** Sesuai keputusan reviewer, penjagaan
  ada di sumber (prompt dan data yang dikirim), bukan blacklist yang rapuh.

---

## D. RT-003 Correction — judul untuk guru

- **SYSTEM_PROMPT, seksi BAHASA JUDUL:** judul ditulis sebagaimana guru menyebut
  tujuan belajar. Nama jenis teks konkret dipakai bila membantu (cerita pendek,
  artikel, dialog, petunjuk, laporan), tanpa label metadata "fiksi"/"nonfiksi"
  hanya untuk membuktikan kategori. Disertai dua contoh ubahan dari reviewer.
- **Kalimat `kategori_teks` di FIELD SETIAP TP:** "Isi judul dan konteks TP harus
  sesuai kategorinya" (kalimat yang dibaca model sebagai perintah menulis
  labelnya) diganti "Isi TP harus sesuai kategorinya; kategorinya sudah tersimpan
  di field ini, jadi judul tidak perlu menyebutnya."
- **Tidak ada regex** yang melarang kata `fiksi`/`nonfiksi`. Uji AL membuktikan
  judul yang memuatnya tetap sah.

---

## E. Tests AK/AL

```
AK: validator menjaga ketergantungan, bukan topik — RT-001 ... ok
AL: bentuk media Modul tidak diminta di ATP; judul untuk guru — RT-002, RT-003 ... ok
```

| Kasus | Masukan | Harapan | Hasil |
|---|---|---|---|
| AK1 | Menulis cerita fiksi pengalaman magang menggunakan media presentasi cetak | lolos | lolos |
| AK2 | Melakukan magang di perusahaan untuk menulis laporan pengalaman kerja | ditolak | ditolak |
| AK3 | Mengunjungi bengkel industri untuk mengamati pelayanan pelanggan | ditolak | ditolak |
| AK4 | Membaca laporan pengalaman peserta magang dan menyimpulkan informasi | lolos | lolos |
| AK5 | Mewawancarai praktisi industri untuk memperoleh informasi | ditolak | ditolak |
| AK+ | dialog peserta magang–supervisor; kasus fiktif di tempat magang; artikel pengalaman PKL; bermain peran mewawancarai narasumber | lolos | lolos (4/4) |
| AK+ | menjalani magang di butik; mengikuti kunjungan ke pabrik; menghadirkan narasumber; catatan "murid mengunjungi usaha jahit" | ditolak | ditolak (4/4) |
| AL1 | user message tanpa lima contoh bentuk dari `cara_layanan` (fixture memastikan kelimanya memang ada di acuan) | lolos | lolos |
| AL1b | prompt dan batas mutlak menyebut judul, konteks, dan catatan | ada | ada |
| AL2 | `konteks: ["lembar informasi produk"]` | ATP **tidak** gagal (bukan blacklist) | valid |
| RT-003 | judul "Membaca cerita fiksi ilmiah tentang busana masa depan" | tetap sah | valid |

Satu penyesuaian di uji saya sendiri (AL): asersi pertama mencari frasa yang di
teks sumber terpecah dua baris string. Diganti ke frasa yang utuh dalam satu
baris; aturannya memang ada. Tidak ada asersi uji lama yang diubah.

---

## F. Regression — 50 existing tests

```
deno test --allow-read tests/atp-kontrak.test.ts      → ok | 52 passed | 0 failed   (50 lama + AK + AL)
node tests/atp-acuan-sinkron.mjs                      → LULUS — acuan CP sinkron (supabase/functions/generate-atp/acuan-cp.ts)
node tests/atp-trace.mjs --periksa                    → LULUS — docs/SPEC-ATP-KONTRAK.md sesuai dengan kontrak di kode.
deno check supabase/functions/generate-atp/kontrak.ts → Check
deno check supabase/functions/generate-atp/index.ts   → Check
deno check tests/atp-semantic-harness.ts              → Check
node --check guru/js/rancang-chat.js                  → ok
node --check guru/js/classroom-unduh.js               → ok
```

Invarian:

| | Bukti |
|---|---|
| `hitungTargetTp()` byte-identik | sha256 isi fungsi `60441f3c…d9723ca` sebelum = sesudah |
| CP 046/H/KR/2025, 9 tuntutan | `cp-acuan.json`, `acuan-cp.ts`, `cp-data.json`, `cp-data.meta.json` identik dengan hash Pass 5 (4/4 OK); `versi_cp: 046/H/KR/2025`; 9 ID `BIE-E25-*` |
| `generate-modul` | `git status --short` kosong |
| Klien, harness, `sw.js`, `classroom.html` | tidak disentuh di task ini |

---

## G. Source Freeze Proof

```
snapshot pra-live: 65 berkas (seluruh berkas termodifikasi/untracked di luar tests/artifacts dan tmp*)
sha256sum -c sesudah run → 65/65 identik
```

Tidak ada suntingan sumber sejak panggilan model pertama. Artefak bukti
baseline (82) dan Pass 5 (71) tetap utuh.

---

## H. Final Live S1–S7

| | |
|---|---|
| Masukan | `Sn-input.json` identik byte-for-byte dengan baseline (7/7); S1 dan S7 user message identik |
| Model/konfigurasi | `gemini-3.8-flash`, temperature tidak diset, `anggaranTokenAtp()` tidak diubah |
| SYSTEM_PROMPT | sha256 `fb332ffa7a766cbf3a38a6f9ca53a7c7b56a0a5024156a780b201ffc5694c699`, 10.063 karakter (Pass 5: 9.251) |
| Artefak | `tests/artifacts/atp-semantic-final/` |
| Kunci | environment Windows scope User, hanya untuk proses itu |

```
S1 BASELINE                   -> FIRST_PASS tp=11 panggilan=1 20629ms
S2 READINESS VERY LOW         -> FIRST_PASS tp=9  panggilan=1 32680ms
S3 VOCATIONAL CONTEXT CHANGE  -> FIRST_PASS tp=11 panggilan=1 11726ms
S4 TEACHER PRIORITY CHANGE    -> FIRST_PASS tp=11 panggilan=1 19111ms
S5 TEACHER OVERRIDES A17/A19  -> FIRST_PASS tp=11 panggilan=1 16280ms
S6 LOW TIME / LARGE CLASS     -> FIRST_PASS tp=5  panggilan=1 17812ms
S7 BASELINE REPEAT            -> FIRST_PASS tp=11 panggilan=1 26301ms
```

Kolom *Kat.*: F = fiksi, N = nonfiksi. Tuntutan disingkat tanpa `BIE-E25-`.
Semua ATP lolos validator produksi dengan nol galat dan nol peringatan. Isi
lengkap, termasuk konteks dan catatan, ada di `Sn-output-final.json`.

### H.1 S1 — BASELINE

A17 `seimbang` · A19 `hierarki` — "Kompetensi reseptif pemahaman alur dan gagasan utama dipelajari lebih dahulu sebagai prasyarat bagi analisis tersirat, sebelum murid melangkah ke kompetensi produktif lisan dan tulis."
Penerapan: PKL → TP 1, 3, 7, 9 · kemampuan dasar → TP 1, 2, 3.

| # | Sem | JP | Tuntutan | Kat. | Judul |
|---:|:-:|---:|---|:-:|---|
| 1 | 1 | 12 | MB-1 | N | Menyimak penjelasan alur kerja penjahitan busana dan mencatat gagasan utama |
| 2 | 1 | 10 | MB-1 | F | Menyimak cerita pendek perancang busana dan mengidentifikasi alur peristiwa tokoh |
| 3 | 1 | 10 | MM-1 | N | Membaca petunjuk perawatan kain busana untuk menemukan informasi penting |
| 4 | 1 | 10 | MM-1 | F | Membaca cerita pendek bertema peragaan busana untuk memahami alur cerita |
| 5 | 1 | 10 | MM-2 | N | Menganalisis artikel tren busana ramah lingkungan dan menyimpulkan pesan tersirat |
| 6 | 1 | 10 | MM-2 | F | Menganalisis cerita pendek fiksi busana dan menyimpulkan pesan moral tersirat |
| 7 | 2 | 12 | MB-2, MB-3 | — | Mengungkapkan pendapat dan mempertahankan argumen lisan tentang pemilihan bahan busana |
| 8 | 2 | 12 | MP-1 | F | Menulis cerita pendek tentang pengalaman merancang busana dengan struktur tepat |
| 9 | 2 | 14 | MP-1, MP-2 | N | Menulis deskripsi produk busana menggunakan media presentasi cetak secara tepat |
| 10 | 2 | 12 | MP-4 | — | Menulis tanggapan untuk mengungkapkan pendapat mengenai fenomena busana cepat |
| 11 | 2 | 14 | MP-5, MP-2 | — | Menulis dan mempertahankan argumen keberlanjutan busana melalui media presentasi cetak |

### H.2 S2 — READINESS VERY LOW

A17 `seimbang` · A19 `hierarki` — "…pemahaman reseptif menyimak dan membaca ditempatkan lebih dahulu sebagai prasyarat bagi keterampilan produktif, serta kemampuan menyatakan pendapat mendahului kemampuan mempertahankan argumen."
Penerapan: PKL → TP 5, 7, 9 · kemampuan dasar → TP 1, 2, 3.

| # | Sem | JP | Tuntutan | Kat. | Judul |
|---:|:-:|---:|---|:-:|---|
| 1 | 1 | 12 | MB-1 | N+F | Menyimak dialog dan petunjuk kerja busana untuk menemukan gagasan utama serta detail |
| 2 | 1 | 12 | MM-1, MM-2 | N | Membaca artikel tren busana untuk memahami alur dan menyimpulkan informasi penting |
| 3 | 1 | 12 | MM-1, MM-2 | F | Menganalisis alur dan menyimpulkan pesan tersirat dari cerita pendek dunia busana |
| 4 | 1 | 12 | MB-2 | — | Mengungkapkan pendapat lisan dalam diskusi pemilihan gaya busana dan etika kerja |
| 5 | 1 | 14 | MB-3 | — | Mempertahankan argumen lisan dalam forum diskusi pelayanan pelanggan butik busana |
| 6 | 2 | 16 | MP-1 | F | Menulis cerita pendek pengalaman berbusana dengan struktur teks yang runtut |
| 7 | 2 | 16 | MP-1, MP-2 | N | Menyusun teks deskripsi produk busana menggunakan media presentasi cetak secara tepat |
| 8 | 2 | 16 | MP-4 | — | Menulis teks opini tentang isu keberlanjutan lingkungan pada industri busana |
| 9 | 2 | 16 | MP-5, MP-2 | — | Menulis argumen industri busana dan mempertahankannya menggunakan media presentasi cetak |

TP 1 konteks: "kisah pengalaman **magang** di butik" — lolos pada panggilan pertama (bukti live RT-001).

### H.3 S3 — VOCATIONAL CHANGE (Teknik Otomotif)

A17 `seimbang` · A19 `hierarki`. Penerapan: PKL → TP 3, 4, 8, 10 · kemampuan dasar → TP 1, 2.

| # | Sem | JP | Tuntutan | Kat. | Judul |
|---:|:-:|---:|---|:-:|---|
| 1 | 1 | 12 | MB-1 | N | Menyimak dialog keseharian dan mencatat informasi pokok serta detailnya |
| 2 | 1 | 12 | MM-1 | F | Membaca teks cerita pendek dan merangkum alur peristiwanya |
| 3 | 1 | 12 | MM-1 | N | Membaca teks petunjuk servis bengkel dan menemukan informasi penting |
| 4 | 1 | 14 | MB-1, MB-2 | N | Menyimak laporan kendala mesin dan menyampaikan pendapat secara lisan |
| 5 | 1 | 12 | MP-1 | F | Menulis cerita pengalaman pribadi dengan struktur kalimat yang tepat |
| 6 | 2 | 10 | MB-1 | F | Menyimak penuturan dongeng rakyat dan menyimpulkan amanat ceritanya |
| 7 | 2 | 10 | MM-2 | F+N | Menganalisis makna tersirat pada cerita fiksi dan artikel lingkungan |
| 8 | 2 | 10 | MP-1, MP-2 | N | Menulis teks laporan servis menggunakan media presentasi cetak |
| 9 | 2 | 10 | MB-2, MB-3 | — | Menyampaikan dan mempertahankan argumen lisan tentang keselamatan berkendara |
| 10 | 2 | 12 | MP-2, MP-4 | — | Menulis teks opini tentang inovasi kendaraan listrik dan menyajikannya |
| 11 | 2 | 12 | MP-4, MP-5 | — | Menulis teks tanggapan untuk mempertahankan argumen atas isu kejuruan |

### H.4 S4 — PRIORITY CHANGE (pendidikan lanjut)

A17 `seimbang` (dasar menyebut `prioritas_guru`) · A19 `hierarki` (Pass 5: `mudah_sulit`).
Penerapan: pendidikan lanjut → TP 4, 9, 11 — "analisis wacana register akademik, penarikan simpulan tersirat, serta pertahanan argumen berbasis bukti objektif".

| # | Sem | JP | Tuntutan | Kat. | Judul |
|---:|:-:|---:|---|:-:|---|
| 1 | 1 | 12 | MB-1 | N | Menyimak dialog transaksi butik busana untuk menemukan alur dan gagasan utama |
| 2 | 1 | 12 | MM-1 | N | Membaca teks deskripsi bahan tekstil untuk mengidentifikasi gagasan utama dan alur informasi |
| 3 | 1 | 12 | MM-1, MM-2 | F | Membaca cerita pendek bertema perancang busana untuk menyimpulkan informasi tersurat dan tersirat |
| 4 | 1 | 14 | MM-2 | N | Menganalisis artikel **akademik** tentang dampak industri busana untuk menyimpulkan informasi tersirat |
| 5 | 1 | 12 | MP-1 | F | Menulis cerita pendek rekaan tentang pengalaman merancang busana dengan struktur yang tepat |
| 6 | 2 | 10 | MB-1 | F | Menyimak penuturan dongeng busana tradisional untuk memahami detail cerita dan alur peristiwa |
| 7 | 2 | 10 | MP-1, MP-2 | N | Menyusun laporan pembuatan busana menggunakan media presentasi cetak dengan tata bahasa tepat |
| 8 | 2 | 10 | MB-2 | — | Mengungkapkan pendapat lisan secara santun mengenai tren etika berbusana sehari-hari |
| 9 | 2 | 12 | MB-3 | — | Mempertahankan argumen lisan **berbasis bukti** dalam diskusi **akademik** isu fesyen cepat |
| 10 | 2 | 10 | MP-4 | — | Mengungkapkan pendapat tertulis mengenai etika konsumsi busana dengan struktur teks yang tepat |
| 11 | 2 | 12 | MP-2, MP-5 | — | Mempertahankan argumen tertulis dalam **esai akademik** menggunakan media presentasi cetak |

### H.5 S5 — TEACHER OVERRIDE (A17 `kehidupan`, A19 `mudah_sulit`)

Keputusan delegasi: kosong (benar). Penerapan: PKL → TP 8, 10, 11 · kemampuan dasar → TP 1, 2, 4.

| # | Sem | JP | Tuntutan | Kat. | Judul | Latar |
|---:|:-:|---:|---|:-:|---|---|
| 1 | 1 | 12 | MB-1 | N | Menyimak dialog nonfiksi keseharian untuk menemukan gagasan utama dan detail informasi | sekolah, rutinitas |
| 2 | 1 | 12 | MM-1 | F+N | Membaca teks fiksi dan nonfiksi untuk memahami alur informasi secara menyeluruh | umum |
| 3 | 1 | 12 | MB-1 | F | Menyimak cerita fiksi untuk memahami alur peristiwa dan detail karakter penokohan | remaja |
| 4 | 1 | 14 | MM-2 | N | Membaca artikel nonfiksi lingkungan untuk menganalisis informasi tersurat dan menyimpulkan makna | lingkungan |
| 5 | 1 | 12 | MP-1 | N | Menulis teks recount nonfiksi tentang pengalaman pribadi dengan struktur teks tepat | sekolah, liburan |
| 6 | 2 | 10 | MM-2 | F | Membaca cerita fiksi pendek untuk menganalisis dan menyimpulkan pesan moral tersirat | ketekunan |
| 7 | 2 | 10 | MB-2 | — | Mengungkapkan pendapat secara lisan dalam dialog tentang preferensi busana sehari-hari | sehari-hari |
| 8 | 2 | 10 | MB-3 | — | Mempertahankan argumen lisan dalam diskusi tentang pemilihan bahan busana kerja | **kerja** |
| 9 | 2 | 10 | MP-1 | F | Menulis cerita pendek fiksi sederhana berlatar studio busana dengan runtut | studio, **magang** (fiksi) |
| 10 | 2 | 12 | MP-2, MP-4 | — | Mengungkapkan pendapat tertulis mengenai etika kerja menggunakan media presentasi cetak | **kerja** |
| 11 | 2 | 12 | MP-2, MP-5 | — | Mempertahankan argumen tertulis tentang pelayanan pelanggan menggunakan media presentasi cetak | **kerja** |

Latar: 7 kehidupan/sekolah/umum (TP 1–7) : 4 kerja (TP 8–11). Mayoritas mengikuti pilihan guru.

### H.6 S6 — LOW TIME / LARGE CLASS (36 murid, jauh di bawah, 48 JP)

A17 `seimbang` · A19 `hierarki`. Penerapan: PKL → TP 3, 4 · kemampuan dasar → TP 1, 2.

| # | Sem | JP | Tuntutan | Kat. | Judul |
|---:|:-:|---:|---|:-:|---|
| 1 | 1 | 8 | MM-1, MM-2 | F+N | Membaca teks cerita dan informasi busana untuk menganalisis gagasan tersurat serta tersirat |
| 2 | 1 | 8 | MB-1 | F+N | Menyimak paparan lisan tentang busana untuk mengidentifikasi gagasan utama dan detail |
| 3 | 1 | 8 | MB-2, MB-3 | — | Menyampaikan pendapat dan mempertahankan argumen lisan dalam diskusi pemilihan bahan busana |
| 4 | 2 | 12 | MP-1, MP-2 | F+N | Menulis deskripsi karya busana dan mempresentasikannya menggunakan media presentasi cetak |
| 5 | 2 | 12 | MP-4, MP-5 | — | Menulis teks argumen untuk mempertahankan pendapat tentang isu etika industri busana |

TP 4 menyatakan `kategori_teks` fiksi+nonfiksi, tetapi judul dan konteksnya
("portofolio rancangan busana", "media presentasi cetak") hanya memuat
nonfiksi (FH-002).

### H.7 S7 — BASELINE REPEAT

A17 `seimbang` · A19 `hierarki`. Penerapan: PKL → TP 1, 2, 6, 8, 9 · kemampuan dasar → TP 1, 2, 3.

| # | Sem | JP | Tuntutan | Kat. | Judul |
|---:|:-:|---:|---|:-:|---|
| 1 | 1 | 10 | MB-1 | N | Menyimak dialog percakapan pemesanan busana untuk memahami gagasan utama dan detail |
| 2 | 1 | 10 | MM-1 | N | Membaca teks deskripsi label perawatan pakaian untuk menemukan alur informasi keseluruhan |
| 3 | 1 | 12 | MM-1, MM-2 | F | Membaca cerita inspiratif perancang busana untuk menganalisis informasi tersurat dan tersirat |
| 4 | 1 | 10 | MB-1 | F | Menyimak pembacaan dongeng busana tradisional untuk menangkap alur cerita dan karakter |
| 5 | 1 | 10 | MP-1 | F | Menulis cerita pendek tentang busana impian menggunakan struktur naratif yang runtut |
| 6 | 1 | 10 | MM-2 | N | Menganalisis teks petunjuk pembuatan busana untuk menyimpulkan informasi penting tersirat |
| 7 | 2 | 12 | MB-2 | — | Mengungkapkan pendapat lisan mengenai tren busana terkini dalam diskusi kelas berpasangan |
| 8 | 2 | 12 | MB-3 | — | Mempertahankan argumen lisan dalam simulasi presentasi pemilihan bahan busana ramah lingkungan |
| 9 | 2 | 14 | MP-1, MP-2 | N | Menulis teks deskripsi produk busana menggunakan media presentasi cetak secara tepat |
| 10 | 2 | 12 | MP-4 | — | Menulis ulasan busana untuk mengungkapkan pandangan pribadi tentang isu daur ulang pakaian |
| 11 | 2 | 14 | MP-5, MP-2 | — | Mempertahankan argumen tertulis tentang etika busana cepat menggunakan media presentasi cetak |

---

## I. Hard Gates

| Gate | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|---|---|---|---|---|---|---|
| H1 CP 046/H/KR/2025 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| H2 9/9 + fiksi/nonfiksi (C6) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅* | ✅ |
| H3 ID tidak karangan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| H4 Waktu (126=62+64; 48=24+24) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| H5 Sumber daya luar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| H6 OR tidak jadi AND | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| H7 Otoritas guru (S5) | — | — | — | — | ✅ | — | — |
| H8 Integritas delegasi | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| H9 Judul ≤16 (maks 12) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| H10 Status | FIRST_PASS | FIRST_PASS | FIRST_PASS | FIRST_PASS | FIRST_PASS | FIRST_PASS | FIRST_PASS |
| ≤2 tuntutan/TP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| tanpa `tipe` di teks mentah | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| bentuk media Modul (judul/konteks/catatan) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

\* S6 lolos C6 secara struktural. Isi TP 4 tidak mencerminkan kategori fiksi
yang diklaimnya (FH-002). Ini batas yang memang tidak dijaga regex, sesuai
keputusan Pass 5.

---

## J. Semantic Scores (preliminary)

| | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| P1 CP fidelity | 2 | 2 | 2 | 2 | 2 | 1 | 2 |
| P2 Logical progression | 2 | 2 | 1 | 1 | 2 | 2 | 1 |
| P3 Readiness realism | 2 | 1 | 2 | 2 | 2 | 1 | 2 |
| P4 Vocational contextualization | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| P5 Teacher-priority causality | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| P6 Time realism | 2 | 2 | 2 | 2 | 2 | 1 | 2 |
| P7 TP quality | 2 | 2 | 2 | 2 | 1 | 2 | 2 |
| P8 Full-service feasibility | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| **Total /16** | **16** | **15** | **15** | **15** | **15** | **13** | **15** |
| Pass 5 | 15 | 15 | 15 | 16 | 15 | 13 | 15 |

- **P2 = 1 (S3, S4, S7):** A19 `hierarki` dengan alasan "reseptif lalu
  produktif", tetapi satu TP menulis mendahului satu TP reseptif (S3 TP 5→6,
  S4 TP 5→6, S7 TP 5→6). Ini pola RT-004 yang sudah reviewer terima sebagai
  variance, sekarang muncul di 3 dari 6 kasus delegasi (Pass 5: 1 dari 6).
- **P3 = 1 (S2):** lihat §K S1↔S2.
- **P1 = 1 (S6):** FH-002.
- **P7:** naik di S1 dan S7 karena labelnya hilang; S5 tetap 1 (7/11 judul
  berlabel, termasuk "teks recount nonfiksi").

---

## K. Cross-case Comparison

| Pasangan | Target reviewer | Pass 5 | Final | Catatan |
|---|---|---|---|---|
| S1↔S2 | CAUSAL | CAUSAL | **WEAK** | lihat bawah |
| S1↔S3 | CONTEXTUAL | CONTEXTUAL | **CONTEXTUAL** | petunjuk servis bengkel, laporan kendala mesin, laporan servis, keselamatan berkendara, kendaraan listrik; dipadu keseharian (dongeng rakyat, liburan). Daftar tuntutan dan jam identik dengan S1 |
| S1↔S4 | CAUSAL | CAUSAL | **CAUSAL** | "artikel akademik" (TP 4), "argumen lisan berbasis bukti dalam diskusi akademik" (TP 9), "esai akademik" (TP 11); jejak menunjuk TP 4, 9, 11 dan isinya sesuai. A17 menyebut `prioritas_guru`. S1 tidak memuat satu pun register akademik |
| S1↔S5 | RESPECTED | RESPECTED | **RESPECTED** | 7 kehidupan : 4 kerja; urutan mudah→sulit; PKL diterapkan pada TP minoritas kerja |
| S1↔S7 | ≥ ACCEPTABLE_VARIANCE | STABLE | **ACCEPTABLE_VARIANCE** | keduanya berpola reseptif di semester 1 lalu produktif di semester 2, A17/A19 sama, pola jejak prioritas sama. S7 menyelipkan satu TP menulis (TP 5) di tengah blok reseptif; S1 tidak |

**S1↔S2 — `WEAK`.** Dilaporkan apa adanya, tidak dipoles:

| | S1 | S2 |
|---|---|---|
| TP / rata-rata JP per TP | 11 / 11,5 | 9 / 14 |
| JP TP awal (reseptif) | 12, 10, 10, 10, 10, 10 | 12, 12, 12 |
| Produksi tulis pertama | TP 8, semester 2 | TP 6, semester 2 |
| JP TP menulis | 12–14 | **16** tiap TP |
| Argumen lisan (MB-3) | semester 2 | **semester 1** (TP 5) |

S2 memang memberi TP menulis waktu yang lebih lapang, dan ujung fase tetap
utuh. Tetapi di run ini **S1 sendiri** juga menunda menulis ke semester 2,
sehingga pembeda urutan yang terlihat di Pass 5 hilang. S2 bahkan memajukan
argumen lisan ke semester 1, berlawanan dengan arahan kesiapan (RT-006 yang
reviewer golongkan observasi). Selisih yang tersisa sebagian besar berasal dari
heuristic jumlah TP (11 → 9), bukan dari penalaran kesiapan.

**Penyebab yang paling mungkin:** variansi model. Perubahan final hardening
tidak menyentuh arahan kesiapan (`ARAHAN_KESIAPAN` byte-identik, dan diff §O
hanya berisi aturan media, bahasa judul, dan validator B1). Satu run tidak dapat
membuktikannya.

---

## L. RT-001/002/003 Before vs After

| | Pass 5 (sebelum) | Final (sesudah) | Status |
|---|---|---|---|
| **RT-001** — `magang` sebagai topik | S3 ditolak B1, 1 perbaikan terbuang | AK1/AK4 lolos, AK2/3/5 ditolak; **live:** S2 TP 1 ("kisah pengalaman magang di butik") dan S5 TP 9 ("kisah fiksi pengalaman magang") lolos di panggilan pertama; perbaikan 0/7 | **CLOSED** |
| **RT-002** — bentuk media Modul | 5 kemunculan: S1 TP 7 konteks "lembar informasi", S4 TP 10/11 "lembar gagasan/tanggapan", S5 TP 7 catatan "kartu", S6 TP 4 "lembar portofolio" | **0** di judul, konteks, dan catatan pada 7/7 kasus; yang tersisa hanya frasa generik "media presentasi cetak" | **CLOSED** |
| **RT-003** — label kategori di judul | **31/69** judul (S1 6, S2 3, S3 5, S4 3, S5 7, S6 0, S7 7) | **9/69** (S1 1, S2 0, S3 1, S4 0, **S5 7**, S6 0, S7 0) | **PARTIAL** — hilang di 6/7 kasus, bertahan di S5 |

Hitungan RT-002/003 dari `Sn-output-final.json` kedua run dengan pola yang sama
(`\b(non ?fiksi|fiksi)\b` untuk label; daftar bentuk media untuk RT-002).

---

## M. Cost / Reliability

| | Baseline | Pass 5 | **Final** |
|---|---:|---:|---:|
| Panggilan model | 19 | 8 | **7** |
| First-pass | 1/7 | 6/7 | **7/7** |
| Perbaikan | 12 | 1 | **0** |
| Token masukan | 143.731 | 60.058 | 51.182 |
| Token keluaran | 31.995 | 16.731 | 15.169 |
| Token penalaran | 63.910 | 35.960 | 33.365 |
| **Token total** | **239.636** | **112.749** | **99.716** |
| Latensi per kasus | med 44,6 s / maks 52,8 s | med 25,8 s / maks 33,7 s | **med 19,1 s / maks 32,7 s** |

`usageMetadata`, verbatim dari `_summary.json`:

```
S1 [{"in":7462,"out":2654,"think":4273,"tot":14389}]
S2 [{"in":7545,"out":2043,"think":8945,"tot":18533}]
S3 [{"in":7466,"out":2640,"think":1031,"tot":11137}]
S4 [{"in":7414,"out":2418,"think":4145,"tot":13977}]
S5 [{"in":6314,"out":2141,"think":3086,"tot":11541}]
S6 [{"in":7519,"out":1194,"think":5249,"tot":13962}]
S7 [{"in":7462,"out":2079,"think":6636,"tot":16177}]
```

**Ruang plafon token — perlu diawasi.** S2 memakai 2.043 keluaran + 8.945
penalaran = 10.988 dari 16.400 (**67%**), naik dari puncak 60% di Pass 5.
SYSTEM_PROMPT kini 10.063 karakter, dan formula `anggaranTokenAtp()` tidak
diubah karena dikunci. Tidak ada pemotongan, tetapi penalaran S2 bervariasi
besar antar-run (5.658 → 8.945). Lihat FH-003.

---

## N. Files Changed

| Berkas | Perubahan |
|---|---|
| `supabase/functions/generate-atp/kontrak.ts` | +59 −8: pola B1 kelompok A dipersempit; `POLA_KEGIATAN_LUAR`, `PENANDA_ISI_TEKS`, `sebabKetergantungan()`; loop B1 memakai fungsi itu; batas mutlak media meliputi konteks/catatan |
| `supabase/functions/generate-atp/index.ts` | +16 −3: aturan media untuk judul/konteks/catatan; kalimat `kategori_teks`; aturan bahasa judul RT-003 |
| `tests/atp-kontrak.test.ts` | +84: AK, AL |
| `docs/ATP-FINAL-HARDENING-EVIDENCE.diff` | **baru** — diff khusus task ini (226 baris) |
| `docs/ATP-FINAL-RELEASE-HARDENING-REPORT.md` | **baru** — laporan ini |
| `tests/artifacts/atp-semantic-final/` | **baru** — artefak verifikasi final |

**Tidak disentuh:** seluruh daftar terkunci §0 prompt reviewer, klien
(`rancang-chat.js`, `classroom-unduh.js`, `classroom.html`, `sw.js`), harness,
`cp-acuan.json`/`acuan-cp.ts`, `generate-modul`, Naskah Fasilitasi, dan
artefak baseline serta Pass 5. Tidak ada field, tabel, migration, metadata CP,
atau pertanyaan baru.

---

## O. Change Evidence

Diff lengkap khusus final hardening, tanpa Pass 1–5:
**`docs/ATP-FINAL-HARDENING-EVIDENCE.diff`** (226 baris, `diff -u` terhadap
salinan yang diambil sebelum suntingan pertama task ini).

Potongan yang menentukan — loop B1, BEFORE:

```ts
    const judul = String(tp.judul ?? '');
    const menyeluruh = [judul, ...(tp.konteks ?? []), tp.catatan ?? ''].join(' | ');
    for (const { pola, sebut } of POLA_BAHAN_TERLARANG) {
      if (pola.test(menyeluruh)) {
        E('B1', `TP ${tp.nomor}: menuntut ${sebut}, bahan yang tidak disediakan MiClass dan tidak boleh dibebankan kepada guru — "${judul}"`);
        break;
      }
    }
```

AFTER:

```ts
    const judul = String(tp.judul ?? '');
    const sebut = sebabKetergantungan(judul, (tp.konteks ?? []).map(String), String(tp.catatan ?? ''));
    if (sebut) {
      E('B1', `TP ${tp.nomor}: menuntut ${sebut}, bahan yang tidak disediakan MiClass dan tidak boleh dibebankan kepada guru — "${judul}"`);
    }
```

```ts
export function sebabKetergantungan(judul: string, konteks: string[] = [], catatan = ''): string | null {
  const menyeluruh = [judul, ...konteks, catatan].join(' | ');
  for (const { pola, sebut } of POLA_BAHAN_TERLARANG) if (pola.test(menyeluruh)) return sebut;
  for (const kalimat of [judul, ...konteks, catatan]) {
    const bagian = bagianKegiatan(String(kalimat ?? ''));
    for (const { pola, sebut } of POLA_KEGIATAN_LUAR) if (pola.test(bagian)) return sebut;
  }
  return null;
}
```

SYSTEM_PROMPT — tambahan RT-003, verbatim:

```ts
  'Tulis judul sebagaimana guru menyebut tujuan belajar secara alami. Pakai nama jenis teks yang\n' +
  'konkret bila membantu (cerita pendek, artikel, dialog, petunjuk, laporan), tetapi jangan memasukkan\n' +
  'label metadata "fiksi"/"nonfiksi" hanya untuk membuktikan kategori — kategori_teks sudah\n' +
  'menyimpannya. Contoh: "Membaca teks nonfiksi tentang perawatan busana" menjadi "Membaca petunjuk\n' +
  'perawatan busana dan menyimpulkan informasi penting"; "Menulis cerita fiksi tentang …" menjadi\n' +
  '"Menulis cerita pendek tentang …".\n' +
```

---

## P. Remaining Defects

Tidak ada yang diperbaiki sesudah panggilan model pertama.

```
DEFECT ID : FH-001 (sisa RT-003)
SEVERITY  : LOW
CASES     : S5
EXPECTED  : judul ditulis untuk guru, tanpa label metadata fiksi/nonfiksi
ACTUAL    : 7/11 judul S5 masih berlabel ("dialog nonfiksi keseharian", "teks fiksi dan nonfiksi",
            "artikel nonfiksi lingkungan", "teks recount nonfiksi", "cerita fiksi pendek", …);
            kasus lain 0–1 judul
EVIDENCE  : tests/artifacts/atp-semantic-final/S5-output-final.json; §L
LIKELY LAYER: MODEL (satu kasus; aturan prompt sama untuk ketujuh kasus)
CATATAN   : sesuai keputusan reviewer, tidak ada regex. Juga "teks recount" adalah istilah genre
            yang kurang akrab bagi guru.
```

```
DEFECT ID : FH-002
SEVERITY  : MEDIUM
CASES     : S6
EXPECTED  : kategori_teks yang dinyatakan TP tercermin di isinya
ACTUAL    : TP 4 menyatakan fiksi+nonfiksi; judul dan konteks hanya memuat deskripsi karya dan
            portofolio (nonfiksi). MP-1 fiksi di S6 hanya "dipenuhi" oleh klaim metadata ini.
            Pass 5 S6 TP 4 masih menyebut "cerita busana".
EVIDENCE  : §H.6; S6-output-final.json
LIKELY LAYER: MODEL — C6 memeriksa metadata, bukan isi (keputusan desain Pass 5: genre tidak
            ditebak dari judul). Kasus ekstrem RT-005 memperbesar tekanannya.
DAMPAK    : Modul yang membaca kategori_teks akan menyusun bahan fiksi untuk TP 4 — cakupan tetap
            terlayani di hilir, tetapi ATP-nya sendiri tidak menunjukkannya.
```

```
DEFECT ID : FH-003 (pengamatan)
SEVERITY  : LOW
CASES     : S1↔S2
EXPECTED  : target reviewer S1↔S2 = CAUSAL
ACTUAL    : WEAK di run ini (Pass 5: CAUSAL) — §K
EVIDENCE  : H.1, H.2
LIKELY LAYER: MODEL (variansi antar-run); ARAHAN_KESIAPAN tidak berubah sejak Pass 5
```

```
DEFECT ID : FH-004 (pengamatan)
SEVERITY  : LOW
CASES     : semua
EXPECTED  : ruang plafon token lapang
ACTUAL    : puncak keluaran+penalaran 67% (S2), naik dari 60% (Pass 5) dan 57% (baseline)
EVIDENCE  : §M
LIKELY LAYER: kombinasi SYSTEM_PROMPT yang membesar dan variansi penalaran; anggaranTokenAtp() dikunci
```

Tetap berlaku, tidak dibuka (keputusan reviewer): RT-004 (kini 3/6 kasus
delegasi, masih satu TP menyimpang per kasus), RT-005, RT-006.

---

## Q. Release Recommendation

```
ATP FINAL HARDENING — READY FOR ACCEPTANCE
```

**Dasar:**

- RT-001 dan RT-002 tertutup dengan bukti deterministik dan bukti live.
  RT-003 turun 71% (31 → 9 judul), dengan satu kasus bertahan (FH-001, LOW).
- Nol regression deterministik: 50 uji lama lulus tanpa asersi diubah, dan
  seluruh invarian terkunci terbukti tidak berubah.
- Pipeline: 7/7 first pass, 7 panggilan, nol parse failure, nol perbaikan;
  biaya terendah dari ketiga run.
- Empat dari lima target cross-case terpenuhi (S1↔S3, S1↔S4, S1↔S5, S1↔S7).
- **Tidak ada defect HIGH atau BLOCKER baru.**

**Yang perlu reviewer timbang sebelum mengunci:**

1. **FH-003:** S1↔S2 `WEAK` di run ini. Kalau bukti kesiapan dari satu run
   Pass 5 dianggap belum cukup, pilihan termurah adalah mengulang S1/S2 beberapa
   kali tanpa mengubah kode, untuk memisahkan variansi dari regresi.
2. **FH-002 (MEDIUM):** klaim `kategori_teks` tanpa isi di S6. Cakupan tetap
   aman di hilir bila Modul membaca metadata itu; ini masukan untuk kontrak
   Modul, bukan alasan membuka ATP.
3. **FH-004:** plafon token 67%, untuk diperhatikan saat SYSTEM_PROMPT
   berikutnya diperbesar.

Tidak ada deploy, push, commit, migration, tulisan ke Supabase, pemakaian secret
produksi, maupun perubahan CP, Modul, atau Naskah. Keputusan penerimaan ada di
tangan reviewer.
