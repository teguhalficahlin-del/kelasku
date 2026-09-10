# MICLASS — ATP SEMANTIC GENERATION REPORT

> **STATUS: `ATP SEMANTIC TEST — READY FOR REVIEW`**
>
> Ketujuh kasus S1–S7 sudah dijalankan terhadap `gemini-3.8-flash` sungguhan
> (10 September 2026, 15:51–15:56), tanpa menyentuh Supabase maupun produksi.
>
> **Ringkasan dalam dua kalimat.** Model menghasilkan ATP yang **lolos seluruh
> gerbang struktural pada panggilan pertama di ketujuh kasus** — 9/9 tuntutan,
> JP dan semester tepat, jumlah TP tepat target, nol ketergantungan sumber daya
> luar. Tetapi **pipeline produksi menolak enam dari tujuh kasus** karena cacat
> parser `extractJson()` yang deterministik: setiap kali ada keputusan yang
> didelegasikan (A17/A19), generate-atp versi working tree **selalu** gagal
> (`SEM-001`, BLOCKER).
>
> Artinya dua hal yang harus dipisahkan peninjau:
> - **Mutu semantik model** — dapat ditinjau; keluaran mentahnya utuh dan valid
>   (§E–K). Ada cacat semantik nyata, terutama otoritas guru di S5 dan cakupan
>   genre fiksi (§P).
> - **Kesiapan pipeline** — belum siap di-deploy. `SEM-001` + `SEM-002` membuat
>   guru yang menyerahkan urutan atau konteks kepada MiClass tidak akan pernah
>   mendapat ATP.
>
> Tidak ada yang diperbaiki. Tidak ada deploy, push, maupun commit.

---

## A. Test Environment

| | |
|---|---|
| HEAD | `e3323b5` |
| Working tree | hasil Pass 1–4, **tidak berubah selama uji** — 63 berkas diverifikasi sha256 sebelum/sesudah (§R.3) |
| Suite baseline | `deno test tests/atp-kontrak.test.ts` → **40 passed / 0 failed** (dijalankan ulang sesudah uji) |
| Provider | Google Generative Language API v1beta |
| Kredensial | `GOOGLE_API_KEY` dari variabel lingkungan Windows scope *User*, dimuat hanya ke proses harness; tidak dicetak, tidak disimpan, tidak masuk artefak (§R.2) |
| Harness | `tests/atp-semantic-harness.ts` — **tidak diubah** |
| Perintah | `deno run --allow-read --allow-write --allow-env --allow-net tests/atp-semantic-harness.ts` |
| Artefak | `tests/artifacts/atp-semantic/` |

### A.1 Konfigurasi model — dibaca ulang dari working tree sebelum run

| Butir | Nilai | Asal |
|---|---|---|
| Model | **`gemini-3.8-flash`** | `index.ts:592`, `MODEL_AI` `index.ts:64` |
| Temperature | **tidak diset** — default penyedia | `generationConfig: { maxOutputTokens: maxTokens }` `index.ts:599` |
| Max output tokens | `anggaranTokenAtp()` — lantai 14.000, plafon 32.000 | `index.ts:52-59` |
| Response schema | tidak ada | — |
| Timeout utama | 60.000 ms | `index.ts:666` |
| Anggaran repair | `Math.max(10_000, 100_000 − elapsed)` | `index.ts:718`, `index.ts:745` |
| Retry jaringan | nol | — |
| Repair | **KOREKSI atas laporan sebelumnya** — lihat bawah | `index.ts:713-775` |

> **Koreksi fakta.** Laporan sebelumnya (dan prompt handoff) menyebut "repair
> maksimum 1, hanya satu cabang yang ditempuh". **Itu keliru.** Kodenya punya
> dua cabang yang dapat ditempuh **berurutan**: repair JSON (`index.ts:716-736`)
> lalu, kalau hasilnya gagal validasi, repair validasi (`index.ts:740-775`).
> Satu permintaan guru dapat memakan **tiga** panggilan model. Itu persis yang
> terjadi pada enam kasus di uji ini. Konfigurasi tidak diubah; yang dikoreksi
> hanya catatannya (`SEM-DOC-001`).

---

## B. Production-Parity Proof

Tidak berubah dari laporan sebelumnya, dan dikonfirmasi ulang oleh run ini:

```
model                : gemini-3.8-flash
temperature          : (tidak diset — default penyedia)
generationConfig     : generationConfig: { maxOutputTokens: maxTokens }
SYSTEM_PROMPT sha256 : c862bbc8fda8f388f6ed79c6a7cf7800e428ddb12fecc34fd397db8919f86172
SYSTEM_PROMPT panjang: 6521 karakter
CP                   : 046/H/KR/2025 | review: diterima | 9 tuntutan
```

**Tentang `SEM-H-001` (extractJson disalin).** Run ini membuktikan salinannya
**setia**: badan fungsi di harness identik dengan `index.ts:99-105` (hanya teks
pesan `throw` yang berbeda, dan cabang itu tidak tertempuh). Harness mereproduksi
cacat produksi `SEM-001` persis — justru karena salinannya benar. Defect tetap
LOW dan tetap tidak diperbaiki.

---

## C. Synthetic Cases

Tidak berubah. S1–S7 dipakai apa adanya dari harness; lihat tabel masukan di
riwayat laporan (`Sn-input.json`). Ringkas:

| | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|---|---|---|---|---|---|---|
| Beda dari S1 | — | kesiapan `jauh_di_bawah` | `Teknik Otomotif` | prioritas `pendidikan_lanjut` | guru pilih A17 `kehidupan`, A19 `mudah_sulit` | 36 murid, `jauh_di_bawah`, 48 JP | identik byte-for-byte |
| jp_op | 126 | 126 | 126 | 126 | 126 | 48 | 126 |
| Semester | 62/64 | 62/64 | 62/64 | 62/64 | 62/64 | 24/24 | 62/64 |
| Target TP | 11 | 9 | 11 | 11 | 11 | 5 | 11 |
| Keputusan terbuka | A17, A19 | A17, A19 | A17, A19 | A17, A19 | **kosong** | A17, A19 | A17, A19 |

---

## D. Generation Execution

### D.1 Status pipeline — seperti yang akan dialami guru

Keluaran harness, verbatim:

```
S1 BASELINE                    -> FAILED_AFTER_REPAIR tp=11 panggilan=3 46682ms
S2 READINESS VERY LOW          -> FAILED_AFTER_REPAIR tp=9  panggilan=3 50856ms
S3 VOCATIONAL CONTEXT CHANGE   -> FAILED_AFTER_REPAIR tp=11 panggilan=3 52834ms
S4 TEACHER PRIORITY CHANGE     -> FAILED_AFTER_REPAIR tp=11 panggilan=3 43166ms
S5 TEACHER OVERRIDES A17/A19   -> FIRST_PASS          tp=11 panggilan=1 17315ms
S6 LOW TIME / LARGE CLASS      -> FAILED_AFTER_REPAIR tp=5  panggilan=3 44606ms
S7 BASELINE REPEAT             -> FAILED_AFTER_REPAIR tp=11 panggilan=3 31759ms
```

### D.2 Apa yang sebenarnya terjadi — urutan tiga panggilan

Sama persis pada S1, S2, S3, S4, S6, S7:

| # | Panggilan | Yang dikirim model | Yang terjadi di pipeline |
|---|---|---|---|
| 1 | utama | objek `{"keputusan_didelegasikan":[…],"tp":[…]}` — **bentuk yang diminta prompt, JSON sah** | `extractJson()` mencoba regex array `/\[[\s\S]*\]/` **lebih dulu**. Ia menangkap dari `[` pertama (array keputusan) sampai `]` terakhir (akhir array TP) → potongan tidak sah → `SyntaxError` |
| 2 | repair JSON | pesan: *"JSON tidak valid. Hasilkan ulang HANYA JSON **array TP** yang valid."* → model patuh, mengirim array TP saja | parse berhasil, tetapi keputusan A17/A19 hilang → validator `[D2]` ×2 |
| 3 | repair validasi | pesan: *"…Kembalikan **objek** {"keputusan_didelegasikan": [...], "tp": [...]}"* → model patuh, mengirim objek | `extractJson()` gagal lagi dengan sebab yang sama → `FAILED_AFTER_REPAIR` |

Bukti deterministik — `extractJson` vs `JSON.parse` pada teks mentah yang sama
(`_diagnostik-parser.ts`):

```
S1 response-raw    | extractJson: THROW SyntaxError … position 717 | JSON.parse langsung: obj:keputusan_didelegasikan,tp
S1 repair-response | extractJson: THROW SyntaxError … position 814 | JSON.parse langsung: obj:keputusan_didelegasikan,tp
S2 response-raw    | extractJson: THROW …                          | JSON.parse langsung: obj:keputusan_didelegasikan,tp
…  (S3, S4, S6, S7 identik polanya — 12/12 teks objek gagal di extractJson, 12/12 sah di JSON.parse)
S5 response-raw    | extractJson: ARRAY len=11                     | JSON.parse langsung: array
```

S5 lolos **hanya** karena tidak ada keputusan terbuka, sehingga keluarannya
array — bentuk satu-satunya yang `extractJson` sanggup baca.

### D.3 Status diagnostik — mutu model, dipisahkan dari cacat parser

Teks mentah panggilan 1 dan 3 di-parse dengan `JSON.parse()` biasa, lalu
diperiksa **`validasiAtp()` produksi** dengan syarat yang dibangun persis seperti
`siapkan()` di harness. Ini **bukan** status produksi; ini jawaban atas
pertanyaan "seandainya parsernya benar".

| Case | Panggilan 1 | Panggilan 3 | TP | Total JP | Sem 1 / Sem 2 | Cakupan | Judul maks | Judul 13–16 | Keputusan |
|---|---|---|---:|---:|---|---|---:|---:|---|
| S1 | **valid**, 0 galat, 0 peringatan | valid | 11 | 126 | 62 / 64 | 9/9 | 12 | 0 | A17 `seimbang`, A19 `hierarki` |
| S2 | **valid** | valid | 9 | 126 | 62 / 64 | 9/9 | 12 | 0 | A17 `seimbang`, A19 `hierarki` |
| S3 | **valid** | valid | 11 | 126 | 62 / 64 | 9/9 | 9 | 0 | A17 `seimbang`, A19 `hierarki` |
| S4 | **valid** | valid | 11 | 126 | 62 / 64 | 9/9 | 12 | 0 | A17 `seimbang`, A19 `hierarki` |
| S5 | **valid** (status produksi juga) | — | 11 | 126 | 62 / 64 | 9/9 | 12 | 0 | — (tidak ada, benar) |
| S6 | **valid** | valid | 5 | 48 | 24 / 24 | 9/9 | 10 | 0 | A17 `seimbang`, A19 `hierarki` |
| S7 | **valid** | valid | 11 | 126 | 62 / 64 | 9/9 | 11 | 0 | A17 `seimbang`, A19 `hierarki` |

**7 dari 7 valid pada panggilan pertama.** Panggilan 3 hampir selalu mengulang
TP panggilan 1 kata demi kata (S2 merapikan beberapa judul; S7 beda satu kata);
keluaran di §E–K memakai panggilan 1.

---

## E–K. FULL ATP OUTPUT

Sumber: `Sn-response-raw.txt` (panggilan 1). Kolom *Tuntutan* menyingkat
`BIE-E25-`. Status produksi setiap kasus di §D.1.

### E. S1 — BASELINE (Tata Busana, 32 murid, sedikit di bawah, 126 JP)

Keputusan yang didelegasikan:
- **A17 `seimbang`** — "Konteks seimbang menjembatani kesiapan murid yang masih membangun pemahaman membaca dengan prioritas guru pada kesiapan kerja bidang Tata Busana." · dasar: `cp_anchor.tuntutan`, `kesiapan_murid`, `prioritas_guru`, `konteks_kejuruan`
- **A19 `hierarki`** — "Tuntutan CP menuntut penguasaan pemahaman informasi reseptif terlebih dahulu sebelum beralih ke analisis kritis dan produksi komunikasi produktif." · dasar: `cp_anchor.elemen`, `cp_anchor.tuntutan`, `kesiapan_murid`

| # | Sem | JP | Tipe | Tuntutan | Judul |
|---:|:-:|---:|---|---|---|
| 1 | 1 | 12 | prasyarat | MB-1 | Menyimak instruksi kerja penjahitan dan mencatat detail alur pesanan busana |
| 2 | 1 | 12 | inti | MM-1 | Membaca lembar spesifikasi busana dan menentukan alur informasi keseluruhan teks |
| 3 | 1 | 14 | inti | MM-2 | Menganalisis informasi tersurat dan tersirat dalam teks profil perancang busana |
| 4 | 1 | 12 | inti | MB-1, MB-2 | Menceritakan pengalaman menjahit busana secara lisan dan menyampaikan pendapat sederhana |
| 5 | 1 | 12 | inti | MP-1 | Menulis teks deskripsi busana kerja dengan struktur dan unsur bahasa yang tepat |
| 6 | 2 | 10 | inti | MB-1 | Menyimak cerita fiksi bertema perancang busana dan mengidentifikasi alur cerita |
| 7 | 2 | 10 | inti | MM-1, MM-2 | Membaca ulasan tren busana ramah lingkungan dan menyimpulkan gagasan utama |
| 8 | 2 | 10 | inti | MP-1, MP-4 | Menulis esai opini mengenai pemilihan bahan busana dan alasan pemilihannya |
| 9 | 2 | 12 | inti | MP-4, MP-5 | Menyusun teks argumen tertulis untuk mempertahankan konsep busana dari sanggahan |
| 10 | 2 | 12 | inti | MP-1, MP-2 | Mempresentasikan portofolio busana memakai lembar informasi cetak di hadapan rekan |
| 11 | 2 | 10 | inti | MB-2, MB-3 | Mempertahankan argumen secara lisan dalam diskusi kelompok tentang industri busana |

### F. S2 — READINESS VERY LOW

- **A17 `seimbang`** — "Memadukan situasi dunia kerja Tata Busana untuk kesiapan PKL dengan topik sehari-hari guna mengakomodasi murid yang masih membangun pemahaman dasar bacaan." · dasar: `prioritas_guru`, `kesiapan_murid`, `konteks_kejuruan`
- **A19 `hierarki`** — "Penguasaan informasi reseptif melalui menyimak dan membaca menjadi fondasi prasyarat sebelum murid melangkah ke keterampilan produktif berbicara dan menulis argumen." · dasar: `cp_anchor.tuntutan`, `kesiapan_murid`

| # | Sem | JP | Tipe | Tuntutan | Judul |
|---:|:-:|---:|---|---|---|
| 1 | 1 | 14 | prasyarat | MB-1 | Menyimak dialog pemesanan busana kerja dan mencatat gagasan utama serta detail teks |
| 2 | 1 | 12 | inti | MM-1, MM-2 | Membaca teks deskripsi kain dan menyimpulkan informasi tersurat maupun tersirat |
| 3 | 1 | 12 | inti | MP-1, MP-2 | Menulis kartu informasi perawatan pakaian dengan struktur teks serta media cetak |
| 4 | 1 | 12 | inti | MB-1, MB-2 | Menyimak cerita fiksi busana dan mengungkapkan pendapat sederhana secara lisan |
| 5 | 1 | 12 | inti | MM-1, MM-2 | Membaca cerita fiksi mode dan menganalisis alur serta pesan moral tersirat |
| 6 | 2 | 16 | inti | MB-2, MB-3 | Menyampaikan pendapat dan mempertahankan argumen lisan tentang etika berbusana di tempat kerja |
| 7 | 2 | 16 | inti | MM-2 | Membaca artikel tren busana ramah lingkungan dan menyimpulkan pandangan penulis |
| 8 | 2 | 16 | inti | MP-1, MP-4 | Menulis teks esai pendek mengungkapkan pendapat tentang isu industri busana |
| 9 | 2 | 16 | **pengayaan** | MP-2, **MP-5** | Menulis teks argumen busana berkelanjutan dan mempresentasikannya memakai selebaran cetak |

> MP-5 hanya dilayani TP 9, dan TP 9 bertipe **pengayaan** → `SEM-003`.

### G. S3 — VOCATIONAL CHANGE (Teknik Otomotif)

- **A17 `seimbang`** — "Tuntutan CP mencakup teks fiksi dan topik keseharian di samping nonfiksi, sementara prioritas guru menekankan kesiapan kerja otomotif sehingga pembagian konteks secara seimbang paling tepat melayani keduanya." · dasar: `cp_anchor.tuntutan`, `prioritas_guru`, `konteks_kejuruan`
- **A19 `hierarki`** — "Tuntutan CP menempatkan penguasaan pemahaman informasi reseptif sebagai prasyarat bertahap sebelum murid menganalisis, mengungkapkan opini, dan mempertahankan argumen secara mandiri." · dasar: `cp_anchor.tuntutan`, `kesiapan_murid`

| # | Sem | JP | Tipe | Tuntutan | Judul | Konteks |
|---:|:-:|---:|---|---|---|---|
| 1 | 1 | 12 | inti | MB-1 | Menyimak dialog keseharian dan instruksi lisan di bengkel otomotif | percakapan sehari-hari; instruksi lisan teknisi |
| 2 | 1 | 12 | inti | MM-1 | Membaca teks cerita pengalaman kerja dan manual servis otomotif | cerita pengalaman kerja; buku manual servis kendaraan |
| 3 | 1 | 12 | inti | MM-2 | Menganalisis informasi tersurat dan tersirat dalam lembar keselamatan kerja | SOP keselamatan kerja; tanda peringatan bahaya bengkel |
| 4 | 1 | 12 | inti | MB-2 | Menyampaikan pendapat lisan mengenai pelayanan bengkel dan rutinitas sekolah | percakapan dengan pelanggan bengkel; opini kegiatan sekolah |
| 5 | 1 | 14 | inti | MP-1, MP-2 | Menulis laporan perawatan berkala menggunakan selebaran cetak informatif | laporan perawatan berkala; selebaran cetak siap bagikan |
| 6 | 2 | 10 | inti | MB-1 | Menyimak paparan isu lingkungan terkait emisi kendaraan bermotor | naskah lisan isu emisi; cerita naratif fiksi polusi udara |
| 7 | 2 | 10 | inti | MM-1, MM-2 | Menyimpulkan isi artikel terkini tentang tren mobil listrik | artikel terkini tren otomotif; tabel data kendaraan listrik |
| 8 | 2 | 10 | inti | MB-3 | Mempertahankan argumen lisan dalam diskusi pemilihan komponen kendaraan | diskusi lisan perbandingan suku cadang; tanggapan terhadap bantahan rekan |
| 9 | 2 | 12 | inti | MP-1, MP-2 | Menyusun cerita fiksi bertema inovasi otomotif pada kartu presentasi | teks naratif fiksi bengkel masa depan; kartu presentasi cetak |
| 10 | 2 | 10 | inti | MP-4 | Menulis teks opini tentang aturan keselamatan berkendara di jalan | esai opini keselamatan jalan raya; rubrik pembaca surat kabar |
| 11 | 2 | 12 | inti | MP-5 | Menulis teks argumen tanggapan terhadap penggunaan bahan bakar alternatif | teks tanggapan isu bahan bakar nabati; data pendukung sanggahan tertulis |

### H. S4 — PRIORITY CHANGE (pendidikan lanjut)

- **A17 `seimbang`** — "Kombinasi konteks kehidupan sehari-hari dan situasi kerja busana memfasilitasi pemahaman bacaan bertahap sekaligus memperkuat relevansi kejuruan." · dasar: `cp_anchor.tuntutan`, `kesiapan_murid`, `konteks_kejuruan` — **tidak menyebut `prioritas_guru`**
- **A19 `hierarki`** — "Keterampilan reseptif memahami gagasan dan informasi teks menjadi syarat mendasar sebelum murid menganalisis serta memproduksi argumen kompleks." · dasar: `cp_anchor.tuntutan`, `kesiapan_murid`

| # | Sem | JP | Tipe | Tuntutan | Judul |
|---:|:-:|---:|---|---|---|
| 1 | 1 | 10 | inti | MB-1 | Menyimak pembacaan deskripsi busana sehari-hari dan mencatat gagasan utama serta detailnya |
| 2 | 1 | 10 | inti | MM-1 | Membaca teks nonfiksi tren busana dan menguraikan alur informasi secara keseluruhan |
| 3 | 1 | 10 | inti | MM-2 | Menganalisis informasi tersurat dan tersirat dalam teks fiksi bertema perancang busana |
| 4 | 1 | 10 | inti | MB-2 | Menyampaikan pendapat secara lisan mengenai pemilihan bahan busana dalam diskusi kelas |
| 5 | 1 | 12 | inti | MP-1 | Menulis teks deskripsi pengalaman merancang pakaian dengan struktur dan kebahasaan tepat |
| 6 | 1 | 10 | inti | MP-2 | Menyusun lembar informasi cetak mengenai panduan perawatan busana untuk dipresentasikan |
| 7 | 2 | 12 | inti | MB-1 | Menyimak narasi fiksi dunia mode dan mengidentifikasi alur cerita serta detailnya |
| 8 | 2 | 14 | inti | MM-1, MM-2 | Membaca artikel industri tekstil serta menyimpulkan informasi tersurat dan tersirat di dalamnya |
| 9 | 2 | 14 | inti | MB-2, MB-3 | Mengungkapkan dan mempertahankan argumen lisan tentang isu keberlanjutan limbah busana |
| 10 | 2 | 12 | inti | MP-4, MP-5 | Menulis teks esai argumentatif untuk mempertahankan pandangan mengenai etika industri busana |
| 11 | 2 | 12 | inti | MP-1, MP-2 | Menyajikan gagasan proyek busana menggunakan kartu bicara cetak dalam simulasi pameran |

### I. S5 — TEACHER OVERRIDE (A17 `kehidupan`, A19 `mudah_sulit`) — status produksi `FIRST_PASS`

Tidak ada `keputusan_didelegasikan` di keluaran — benar, karena tidak ada yang
didelegasikan.

| # | Sem | JP | Tipe | Tuntutan | Judul | Latar |
|---:|:-:|---:|---|---|---|---|
| 1 | 1 | 10 | prasyarat | MB-1 | Menyimak cerita lisan pengalaman perancang busana untuk mengidentifikasi gagasan utama dan detail | kerja/profesi |
| 2 | 1 | 10 | inti | MM-1 | Membaca teks deskripsi bahan kain dan cerita busana untuk memahami alur informasi | netral |
| 3 | 1 | 14 | inti | MM-2 | Menganalisis dan menyimpulkan informasi tersurat maupun tersirat dalam petunjuk kerja tata busana | **kerja** |
| 4 | 1 | 14 | inti | MP-1 | Menulis teks pengalaman praktik menjahit menggunakan struktur dan unsur bahasa yang tepat | praktik sekolah |
| 5 | 1 | 14 | inti | MP-1, MP-2 | Mempresentasikan deskripsi produk busana menggunakan media selebaran dan kartu informasi cetak | **kerja** |
| 6 | 2 | 10 | inti | MB-1 | Menyimak dialog instruksi pelayanan pelanggan butik untuk memahami rincian informasi kerja | **kerja** |
| 7 | 2 | 10 | inti | MB-2 | Mengungkapkan pendapat lisan mengenai pemilihan bahan dan tren busana ramah lingkungan | isu/sehari-hari |
| 8 | 2 | 10 | inti | MB-3 | Mempertahankan argumen lisan dalam diskusi pemilihan desain busana kerja secara santun | **kerja** |
| 9 | 2 | 12 | inti | MM-1, MM-2 | Menganalisis artikel isu etika industri garmen untuk menyimpulkan pandangan tersirat penulis | industri |
| 10 | 2 | 10 | inti | MP-4 | Menulis teks opini tentang standar keselamatan kerja di bengkel jahit busana | **kerja** |
| 11 | 2 | 12 | **pengayaan** | MP-2, **MP-5** | Menulis dan menyajikan argumen tertulis tentang busana berkelanjutan melalui lembar informasi | isu |

> Guru memilih **"lebih banyak situasi kehidupan sehari-hari dan sekolah"**.
> Sekurang-kurangnya 5 dari 11 TP berlatar situasi kerja, dan tak satu pun
> berlatar kehidupan sehari-hari murid di luar busana → `SEM-004`.
> MP-5 kembali hanya dilayani TP bertipe pengayaan → `SEM-003`.

### J. S6 — LOW TIME / LARGE CLASS (36 murid, jauh di bawah, 48 JP)

- **A17 `seimbang`** — "Konteks diseimbangkan antara keseharian dan kejuruan busana agar fondasi bahasa murid terbangun bertahap menuju kesiapan kerja." · dasar: `kesiapan_murid`, `prioritas_guru`, `konteks_kejuruan`
- **A19 `hierarki`** — "Kemampuan reseptif menyimak dan membaca ditempatkan lebih awal sebagai fondasi sebelum produksi lisan dan tulisan yang kompleks." · dasar: `cp_anchor.elemen`, `kesiapan_murid`

| # | Sem | JP | Tipe | Tuntutan | Judul |
|---:|:-:|---:|---|---|---|
| 1 | 1 | 8 | inti | MB-1 | Menyimak teks lisan dan mengidentifikasi informasi penting terkait busana |
| 2 | 1 | 8 | inti | MM-1, MM-2 | Membaca teks kerja busana serta menyimpulkan makna tersurat dan tersirat |
| 3 | 1 | 8 | inti | MP-1, MP-2 | Menulis teks deskriptif produk busana menggunakan media presentasi cetak |
| 4 | 2 | 12 | inti | MB-2, MB-3 | Mengungkapkan pendapat dan mempertahankan argumen lisan dalam diskusi busana |
| 5 | 2 | 12 | inti | MP-2, MP-4, MP-5 | Menulis teks opini dan mempertahankan argumen tertulis tentang busana |

### K. S7 — BASELINE REPEAT (masukan identik S1)

- **A17 `seimbang`** — "Memadukan situasi kehidupan sehari-hari dengan situasi kerja Tata Busana membantu menjembatani kesiapan murid secara bertahap sekaligus memenuhi prioritas persiapan kerja." · dasar: `cp_anchor.elemen`, `kesiapan_murid`, `prioritas_guru`, `konteks_kejuruan`
- **A19 `hierarki`** — "Kemampuan pemahaman reseptif dan gagasan awal perlu dikuasai lebih dahulu sebagai fondasi sebelum murid melakukan analisis mendalam, produksi teks, dan pertahanan argumen." · dasar: `cp_anchor.tuntutan`, `kesiapan_murid`, `prioritas_guru`

| # | Sem | JP | Tipe | Tuntutan | Judul | Konteks |
|---:|:-:|---:|---|---|---|---|
| 1 | 1 | 12 | inti | MM-1 | Membaca teks deskripsi busana sehari-hari untuk menemukan alur informasi dan detail | deskripsi gaya busana kasual; kosakata tekstil dasar |
| 2 | 1 | 12 | inti | MB-1 | Menyimak tuturan cerita pengalaman membuat busana untuk mengidentifikasi gagasan utama | cerita pengalaman menjahit; naskah simakan naratif busana |
| 3 | 1 | 12 | inti | MM-2 | Menganalisis dan menyimpulkan informasi tersurat maupun tersirat pada label petunjuk busana | label instruksi pencucian; lembar panduan perawatan bahan |
| 4 | 1 | 14 | inti | MP-1 | Menulis teks deskripsi pakaian santai dengan struktur teks dan kebahasaan tepat | katalog busana sederhana; lembar kerja rancangan busana |
| 5 | 1 | 12 | inti | MB-2 | Mengungkapkan pendapat lisan mengenai pemilihan bahan busana dalam dialog berpasangan | dialog pemilihan kain; percakapan dengan pelanggan busana |
| 6 | 2 | 10 | inti | MM-1, MM-2 | Membaca teks cerita tren mode untuk menyimpulkan pesan tersurat dan tersirat | kisah sejarah perancang busana; artikel tren pakaian kerja |
| 7 | 2 | 10 | inti | MB-1 | Menyimak pembacaan prosedur kerja pembuatan busana untuk mencatat detail instruksi | instruksi lisan pengukuran badan; tahapan pembuatan pola busana |
| 8 | 2 | 12 | inti | MB-2, MB-3 | Mempertahankan argumen lisan dalam diskusi pemilihan konsep seragam kerja | diskusi proyek busana kerja; tanya jawab konsep desain tim |
| 9 | 2 | 10 | inti | MP-1, MP-4 | Menulis teks opini singkat mengenai etika dan keberlanjutan industri busana | isu limbah tekstil; opini penggunaan kain ramah lingkungan |
| 10 | 2 | 12 | inti | MP-4, MP-5 | Menulis teks argumen untuk mempertahankan gagasan tentang efisiensi produksi busana | lembar argumen biaya produksi; tanggapan tertulis efisiensi jahit |
| 11 | 2 | 10 | inti | MP-1, MP-2 | Mempresentasikan lembar informasi rancangan busana kerja menggunakan media cetak terstruktur | handout spesifikasi busana; kartu presentasi portofolio pakaian |

---

## L. Hard Gates H1–H10

Gerbang dinilai atas keluaran model (panggilan 1). H10 memuat **dua** status:
yang dialami guru di pipeline produksi, dan yang akan terjadi seandainya
parsernya benar.

| Gate | S1 | S2 | S3 | S4 | S5 | S6 | S7 | Keterangan |
|---|---|---|---|---|---|---|---|---|
| **H1** CP 046/H/KR/2025 saja | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `periksaParitasCp()` sebelum panggilan; hanya ID `BIE-E25-*` di keluaran |
| **H2** Coverage 9/9 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | validator C5 lulus; tetapi lihat `SEM-003` (MP-5 via pengayaan di S2, S5) dan `SEM-006` (genre fiksi) |
| **H3** Tidak ada ID karangan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | validator C4 lulus |
| **H4** Waktu tepat | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 126 = 62+64; 48 = 24+24; semua jp kelipatan 2; tidak ada TP terbelah semester |
| **H5** Tanpa sumber daya luar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | pemindai kata terlarang: nol. Catatan batas: S3 "tanda peringatan bahaya bengkel", S7 "katalog busana" — keduanya bisa diwujudkan sebagai teks, tetapi Modul perlu menjaganya tidak menjadi gambar |
| **H6** OR tidak jadi AND | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | tak satu pun TP menuntut "tertulis dan multimodal"; kata "multimodal"/"digital" tidak muncul sama sekali |
| **H7** Otoritas guru (S5) | — | — | — | — | 🟡 | — | — | **struktural lulus** (nol keputusan A17/A19 dikeluarkan); **semantik gagal untuk A17**: latar kerja mendominasi walau guru memilih kehidupan sehari-hari (`SEM-004`). A19 `mudah_sulit` wajar tercermin |
| **H8** Integritas delegasi | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | enum sah, alasan ada, dasar seluruhnya dari daftar sah, nol bukti karangan. Catatan: pilihan **identik di 6/6 kasus** (`SEM-005`) |
| **H9** Judul ≤16 kata | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | maks 12 kata di semua kasus; pita 13–16: **nol** |
| **H10** Status — pipeline produksi | ❌ FAILED_AFTER_REPAIR | ❌ | ❌ | ❌ | ✅ FIRST_PASS | ❌ | ❌ | seluruh kegagalan berasal dari `SEM-001`/`SEM-002` |
| **H10** Status — diagnostik (parser benar) | FIRST_PASS | FIRST_PASS | FIRST_PASS | FIRST_PASS | FIRST_PASS | FIRST_PASS | FIRST_PASS | `_diagnostik-parser.json` |

---

## M. Preliminary Semantic Scores P1–P8

Skor pendahuluan Claude, 0–2. Peninjau akhir membaca keluarannya sendiri.

| | S1 | S2 | S3 | S4 | S5 | S6 | S7 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| P1 CP fidelity | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| P2 Logical progression | 1 | 1 | 1 | 1 | 2 | 1 | 1 |
| P3 Readiness realism | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| P4 Vocational contextualization | 2 | 2 | 2 | 2 | 1 | 1 | 2 |
| P5 Teacher-priority causality | 1 | 1 | 1 | 1 | 0 | 1 | 1 |
| P6 Time realism | 2 | 2 | 2 | 2 | 2 | 1 | 2 |
| P7 TP quality | 2 | 2 | 2 | 2 | 2 | 1 | 2 |
| P8 Full-service feasibility | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| **Total /16** | **12** | **12** | **12** | **12** | **11** | **9** | **12** |

Dasar skor yang bukan 2:

- **P1 = 1 di semua kasus.** CP menuntut fiksi **DAN** nonfiksi pada MM-1, MM-2,
  dan MP-1. Pada S1 tak satu pun TP membaca (MM) atau menulis (MP-1) teks fiksi;
  fiksi hanya ada di menyimak (TP 6). Pola serupa di S3 (MM tanpa fiksi), S4 dan
  S2 (MP-1 tanpa fiksi), S7 (keduanya tanpa fiksi yang eksplisit). Ditambah
  S2/S5: satu-satunya layanan MP-5 bertipe pengayaan. S6: judul TP 1 menurunkan
  MB-1 menjadi "mengidentifikasi informasi penting" (CP: alur keseluruhan,
  gagasan utama, **dan** detail).
- **P2 = 1.** A19 dipilih `hierarki` dengan alasan "reseptif lebih dulu,
  produktif kemudian", tetapi susunannya spiral dua putaran: S1 sudah berbicara
  (TP 4) dan menulis (TP 5) di semester 1, lalu kembali menyimak (TP 6) di
  semester 2. Spiral itu sendiri masuk akal secara pedagogis — yang salah adalah
  keputusan yang dilaporkan tidak menggambarkan urutan yang disusun (prompt
  menuntut keduanya sama). S5 (`mudah_sulit` pilihan guru) wajar.
- **P3 = 1.** Tidak ada TP yang mustahil, tetapi sinyal kesiapan hanya tampak
  di permukaan (kata "sederhana", TP 1 bertipe prasyarat). Detail di §N S1↔S2.
- **P4 = 1 pada S5** (latar mengabaikan pilihan guru) dan **S6** (latar generik
  "terkait busana", "teks kerja busana").
- **P5.** S5 = 0: pilihan guru A17 tidak ditaati. Lainnya 1: pilihan delegasi
  tidak pernah berubah antar-masukan; S4 lemah (§N).
- **P6/P7 = 1 pada S6.** 48 JP untuk 5 TP, rata-rata 1,8 tuntutan per TP; TP 2
  memadukan MM-1 dan MM-2 (fiksi dan nonfiksi, tersurat dan tersirat) dalam 8 JP
  untuk murid yang jauh di bawah. Ketat, tidak mustahil. Judulnya paling generik
  dari seluruh uji.
- **P8 = 2 di semua kasus.** Tidak ada ketergantungan pada bahan luar.

---

## N. Cross-Case Causal Review

### S1 ↔ S2 — kesiapan sedikit di bawah → jauh di bawah

| | S1 | S2 |
|---|---|---|
| TP | 11 | 9 (turun karena heuristic, sesuai target) |
| JP per TP | 10–14 | 12–16 (sem 2 seluruhnya 16) |
| TP 1 | menyimak instruksi kerja, prasyarat | menyimak dialog pemesanan, prasyarat, 14 JP |
| Produksi tulis pertama | TP 5 | **TP 3** (lebih awal) |
| Tuntutan paling berat (MP-5) | TP 9, inti | TP 9, **pengayaan** |

Perubahan nyata ada: TP lebih sedikit dan lebih panjang, teks awal lebih konkret
(deskripsi kain, kartu perawatan). Tetapi tangganya tidak lebih landai —
produksi tulis justru datang lebih awal — dan satu-satunya perubahan pada ujung
fase justru ke arah yang dilarang: tuntutan tersulit diturunkan jadi pengayaan.
Keputusan A17/A19 dan alasannya praktis sama dengan S1.

**Verdict: `WEAK`** (dengan satu gejala penurunan CP — `SEM-003`).

### S1 ↔ S3 — Tata Busana → Teknik Otomotif

Latar berganti menyeluruh dan relevan: manual servis, SOP keselamatan bengkel,
emisi kendaraan, mobil listrik, suku cadang, bahan bakar alternatif. Kompetensi
tetap kompetensi Bahasa Inggris; daftar tuntutan dan jam sama. S3 bahkan
menambahkan konteks keseharian (rutinitas sekolah, keselamatan berkendara) dan
satu-satunya menulis fiksi (TP 9).

**Verdict: `CONTEXTUAL`.**

### S1 ↔ S4 — prioritas PKL/dunia kerja → pendidikan lanjut/tes akademik

Ada pergeseran kecil: esai argumentatif, artikel industri tekstil, isu
keberlanjutan. Tetapi latar tetap kejuruan (panduan perawatan, simulasi
pameran, kartu bicara), tidak ada teks akademik atau jenis soal tes, porsi JP
membaca/menulis argumen tidak berbeda berarti dari S1 (14+12 vs 10+12), dan
**A17 di S4 tidak menyebut `prioritas_guru` sama sekali** — keputusannya identik
dengan S1.

**Verdict: `WEAK`.**

### S1 ↔ S5 — guru menentukan A17 `kehidupan`, A19 `mudah_sulit`

- Struktural: dihormati. Nol keputusan A17/A19 dikeluarkan model.
- A19 `mudah_sulit`: wajar tercermin (menyimak → membaca → menulis di semester 1;
  pendapat → argumen di semester 2).
- **A17 `kehidupan`: tidak ditaati.** Latar kerja (petunjuk kerja, pelayanan
  butik, desain busana kerja, keselamatan bengkel jahit, produk) mendominasi.
  Sebab yang paling mungkin ada di kontrak, bukan di model: `konteks_kejuruan`
  S5 berisi dua kalimat yang bertabrakan, dan yang pertama menang —

  ```
  "Kelas ini program keahlian Tata Busana. Pakai kosakata, situasi, dokumen kerja,
   dan tugas yang benar-benar ditemui di bidang itu."
  …
  "Contoh dan tugas lebih banyak mengambil situasi kehidupan sehari-hari dan sekolah."
  ```

**Verdict: `PARTIAL`.**

### S1 ↔ S7 — masukan identik byte-for-byte

Isi TP berbeda seluruhnya (tak satu judul pun sama), TP 1 berbeda (menyimak vs
membaca), dan distribusi tuntutan per TP berbeda. Tetapi filosofinya stabil:
keputusan A17/A19 sama, alasan setara, pola spiral dua putaran per semester
sama, rentang JP per TP sama (10–14), cakupan 9/9 sama, dan kontekstualisasinya
sama kuat. Di dalam satu percakapan, panggilan 3 mengulang panggilan 1 hampir
kata demi kata.

**Verdict: `ACCEPTABLE_VARIANCE`.** Guru yang menekan "susun ulang" akan mendapat
ATP yang berbeda isinya tetapi setara bentuk dan mutunya.

---

## O. Three Pass-4 Risks

| Risk | Hasil | Bukti |
|---|---|---|
| **A** — OR semantics | **LULUS, 7/7** | Tak satu pun TP menuntut tertulis **dan** multimodal, atau cetak **dan** digital. Kata "multimodal" dan "digital" tidak muncul di keluaran mana pun; jalur tertulis/cetak diperlakukan sebagai pemenuhan penuh |
| **B** — MP-1 sebagai syarat mutu | **LULUS, 7/7** | Tak ada TP tersendiri untuk "struktur dan unsur kebahasaan". Syarat mutu menempel pada kegiatan mengomunikasikan: S1 TP 5 "Menulis teks deskripsi busana kerja **dengan struktur dan unsur bahasa yang tepat**"; S4 TP 5, S5 TP 4, S7 TP 4 berpola sama |
| **C** — berbagai media presentasi | **PARTIAL** | "Berbagai" terpenuhi (≥2 bentuk) di S2, S3, S4, S5, S7; di S1 hanya satu TP dengan satu bentuk (lembar informasi). Tidak ada ATP yang berubah jadi daftar media. **Tetapi bentuk-bentuk dari `cara_layanan` bocor ke judul TP di 7/7 kasus**: "kartu bicara cetak", "selebaran cetak", "lembar informasi cetak", "kartu informasi", "handout" (konteks S7). Itu detail pelaksanaan Modul, persis yang diperingatkan Risk C → `SEM-008` |

---

## P. Defects Found

Tidak ada satu pun yang diperbaiki.

```
DEFECT ID : SEM-001
SEVERITY  : BLOCKER
CASES     : S1, S2, S3, S4, S6, S7 — setiap kasus yang punya keputusan terbuka
EXPECTED  : keluaran berbentuk {"keputusan_didelegasikan":[…],"tp":[…]} — bentuk
            yang diminta SYSTEM_PROMPT sendiri — di-parse utuh
ACTUAL    : extractJson() (index.ts:99-105) mencoba regex array /\[[\s\S]*\]/
            LEBIH DULU. Pada objek yang berisi dua array, regex greedy itu
            menangkap dari "[" array keputusan sampai "]" akhir array TP, lalu
            JSON.parse gagal. Cabang objek tidak pernah dicapai.
            Akibat: 100% kegagalan setiap kali A17 atau A19 didelegasikan,
            setelah tiga panggilan model.
EVIDENCE  : Sn-error.txt ("SyntaxError: Unexpected non-whitespace character after
            JSON at position …"); _diagnostik-parser.json — 12/12 teks objek gagal
            di extractJson, 12/12 sah di JSON.parse, dan 7/7 panggilan pertama
            valid menurut validasiAtp() produksi
LIKELY LAYER: CONTRACT (parser di Edge Function — bukan model, bukan prompt)
CATATAN   : tidak ada uji di tests/ yang menjaga extractJson; fungsi itu tinggal
            di index.ts dan tidak dapat diimpor tests/atp-kontrak.test.ts. Kode ini
            belum di-deploy — produksi masih versi lama — sehingga guru belum
            terdampak. Tetapi deploy apa adanya akan menutup jalur delegasi total.
```

```
DEFECT ID : SEM-002
SEVERITY  : HIGH
CASES     : S1, S2, S3, S4, S6, S7
EXPECTED  : pesan repair JSON meminta bentuk keluaran yang sama dengan permintaan
            asal
ACTUAL    : pesan repair JSON (index.ts:723) selalu berbunyi "Hasilkan ulang HANYA
            JSON array TP yang valid", juga saat keputusan terbuka tidak kosong.
            Model patuh, membuang keputusan, dan validator menolaknya [D2]. Pesan
            repair validasi (index.ts:764) lalu meminta objek — yang kembali
            dipatahkan SEM-001.
EVIDENCE  : Sn-validation.json — [D2] A17 dan A19 di keenam kasus; Sn-output.json
            berisi 11/9/11/11/5/11 TP dengan nol keputusan (keluaran panggilan 2)
LIKELY LAYER: PROMPT (teks repair)
```

```
DEFECT ID : SEM-003
SEVERITY  : HIGH
CASES     : S2, S5
EXPECTED  : setiap tuntutan CP wajib dilayani TP yang wajib diajarkan
ACTUAL    : BIE-E25-MP-5 (mempertahankan argumen tertulis) HANYA dilayani satu TP,
            dan TP itu bertipe "pengayaan" — S2 TP 9, S5 TP 11. Pengayaan lazim
            dibaca opsional; tuntutan wajib jadi tampak boleh dilewati. Pada S2
            ini terjadi tepat di kasus kesiapan rendah, arah yang dilarang
            SYSTEM_PROMPT ("TANPA menurunkan tuntutan CP di ujung fase").
EVIDENCE  : S2-response-raw.txt TP 9; S5-response-raw.txt TP 11; validator lulus
            (C5 hanya menghitung kemunculan ID, tidak melihat tipe)
LIKELY LAYER: CONTRACT (validator tidak menolak tuntutan wajib yang hanya
            dilayani TP pengayaan) + PROMPT
```

```
DEFECT ID : SEM-004
SEVERITY  : HIGH
CASES     : S5
EXPECTED  : guru memilih A17 "kehidupan" — contoh dan tugas lebih banyak dari
            situasi sehari-hari dan sekolah
ACTUAL    : sekurang-kurangnya 5 dari 11 TP berlatar kerja (petunjuk kerja,
            pelayanan pelanggan butik, desain busana kerja, standar keselamatan
            bengkel jahit, produk busana); tak satu pun berlatar kehidupan
            sehari-hari murid di luar busana
EVIDENCE  : S5-response-raw.txt; S5-user-message.json → konteks_kejuruan memuat
            "Pakai kosakata, situasi, dokumen kerja, dan tugas yang benar-benar
            ditemui di bidang itu." SEBELUM "Contoh dan tugas lebih banyak
            mengambil situasi kehidupan sehari-hari dan sekolah."
LIKELY LAYER: CONTRACT (bangunKonteksAtp menulis kalimat kejuruan tanpa syarat,
            sehingga bertabrakan dengan pilihan A17 = kehidupan)
```

```
DEFECT ID : SEM-005
SEVERITY  : MEDIUM
CASES     : S1, S2, S3, S4, S6, S7
EXPECTED  : keputusan yang didelegasikan menimbang masukan dan tercermin di urutan
            TP
ACTUAL    : (a) A17 = seimbang dan A19 = hierarki di 6/6 kasus, tidak peduli
            kesiapan, program keahlian, prioritas, maupun jam.
            (b) alasan A19 selalu "reseptif lebih dulu, lalu produktif", tetapi
            urutan yang disusun spiral dua putaran — berbicara/menulis sudah di
            semester 1, lalu menyimak/membaca lagi di semester 2 (S1 TP 4–6,
            S3 TP 4–6, S7 TP 4–7). Prompt menuntut "metode pengurutan yang kau
            pilih adalah urutan TP yang benar-benar kau susun".
EVIDENCE  : bagian keputusan §E–K; tabel TP §E, §G, §K
LIKELY LAYER: MODEL (keputusan dan susunan dibuat terpisah) / PROMPT
```

```
DEFECT ID : SEM-006
SEVERITY  : MEDIUM
CASES     : S1, S2, S3, S4, S5, S7 (S6 terlalu generik untuk dinilai)
EXPECTED  : CP menuntut fiksi DAN nonfiksi pada MM-1, MM-2, MP-1 (logika AND di
            cp_anchor.tuntutan)
ACTUAL    : genre fiksi tidak tampak di sebagian tuntutan itu. S1: tak ada membaca
            maupun menulis fiksi. S3: membaca tanpa fiksi. S2, S4: menulis tanpa
            fiksi. S7: tak ada fiksi eksplisit di membaca maupun menulis.
EVIDENCE  : tabel TP §E–K
LIKELY LAYER: CONTRACT (tidak ada ketertelusuran di tingkat genre; validator
            hanya melihat ID tuntutan) / PROMPT. Bisa jadi Modul yang
            menutupnya, tetapi ATP tidak menjaminnya.
```

```
DEFECT ID : SEM-007
SEVERITY  : MEDIUM
CASES     : S4 (dibanding S1)
EXPECTED  : prioritas guru mengatur penekanan: porsi JP, urutan, arah contoh
ACTUAL    : pendidikan lanjut/tes akademik hampir tak berbekas — latar tetap
            kejuruan, tidak ada teks akademik, porsi JP setara S1, dan keputusan
            A17 di S4 tidak menyebut prioritas_guru sebagai dasar
EVIDENCE  : §H; S4-response-raw.txt
LIKELY LAYER: PROMPT / MODEL
```

```
DEFECT ID : SEM-008
SEVERITY  : LOW
CASES     : S1–S7
EXPECTED  : ATP menyatakan kompetensi; bentuk media cetak adalah urusan Modul
            (cara_layanan MP-2 menandainya "CARA MiClass melayani, bukan jenis
            yang CP tuntut")
ACTUAL    : bentuk dari cara_layanan muncul di judul TP: "kartu bicara cetak",
            "selebaran cetak", "lembar informasi cetak", "kartu informasi",
            "kartu presentasi"; "handout" di konteks S7 TP 11
EVIDENCE  : §O Risk C
LIKELY LAYER: PROMPT (cara_layanan ikut dikirim tanpa pembatas pemakaian)
```

```
DEFECT ID : SEM-009
SEVERITY  : LOW
CASES     : S1, S2, S5
EXPECTED  : 10 JP penguatan kemampuan dasar sudah disisihkan di luar TP
            ("terintegrasi", "tidak termasuk jam yang dibagi ke TP")
ACTUAL    : TP 1 yang melayani tuntutan inti MB-1 diberi tipe "prasyarat"
EVIDENCE  : S1/S2/S5 TP 1
LIKELY LAYER: PROMPT
```

```
DEFECT ID : SEM-H-002
SEVERITY  : LOW
CASES     : harness, bukan produk
EXPECTED  : setiap panggilan model meninggalkan teks mentahnya sendiri
ACTUAL    : bila KEDUA cabang repair ditempuh, harness menulis keduanya ke
            Sn-repair-prompt.txt dan Sn-repair-response.txt yang sama, sehingga
            teks panggilan 2 (repair JSON) tertimpa panggilan 3. Sn-validation.json
            dan Sn-output.json tetap mencatat hasil panggilan 2.
EVIDENCE  : S1-repair-prompt.txt berisi pesan repair validasi, bukan pesan repair
            JSON; _summary.json mencatat panggilan_model = 3
LIKELY LAYER: harness. Tidak mengubah kesimpulan: hasil panggilan 2 terbaca
            lewat Sn-output.json dan pesan repair-nya tertulis di index.ts:723.
```

```
DEFECT ID : SEM-DOC-001
SEVERITY  : LOW
CASES     : dokumentasi
EXPECTED  : catatan konfigurasi sesuai kode
ACTUAL    : laporan sebelumnya dan prompt handoff menyebut "repair maksimum 1".
            Kodenya menempuh repair JSON lalu repair validasi secara berurutan —
            hingga 3 panggilan model per permintaan guru.
EVIDENCE  : index.ts:713-775; enam kasus uji ini
LIKELY LAYER: dokumentasi
```

`SEM-H-001` (extractJson disalin ke harness) tetap LOW dan tetap terbuka; §B
menjelaskan mengapa salinan itu justru terbukti setia. `SEM-ENV-001`
(kredensial tidak ada) **tertutup**: kunci tersedia di lingkungan pengguna.

**Pengamatan yang bukan defect.** S6 (48 JP, jauh di bawah, 36 murid): lantai
struktur CP menentukan jumlah TP (5), rata-rata 1,8 tuntutan dan 9,6 JP per TP.
Model memenuhinya secara struktural, dan hasilnya paling generik dari seluruh
uji (P = 9/16). Ini masukan untuk status provisional `hitungTargetTp()`, bukan
bukti bahwa heuristic-nya salah. Heuristic tidak diubah.

---

## Q. Cost / Reliability

| | |
|---|---|
| Total panggilan model | **19** — 7 utama + 12 repair (6 kasus × 2 cabang repair) |
| First-pass success — pipeline produksi | **1/7** (S5) |
| First-pass validity — model, parser benar | **7/7** |
| Pemotongan `MAX_TOKENS` | nol |
| Token masukan (total) | 143.731 |
| Token keluaran (total) | 31.995 |
| Token penalaran (total) | 63.910 |
| Token total | 239.636 |
| Latensi per kasus | median 44.606 ms, maks 52.834 ms, min 17.315 ms (S5, satu panggilan) |
| Pemakaian plafon tertinggi | S2 panggilan 3: 1.639 keluaran + 7.703 penalaran = 9.342 dari 16.400 (57%) |

`usageMetadata` per panggilan, verbatim dari API (`_summary.json`):

```
S1 [{"in":6305,"out":1866,"think":3997,"tot":12168},{"in":8205,"out":1623,"think":2596,"tot":12424},{"in":8776,"out":1879,"think":4052,"tot":14707}]
S2 [{"in":6306,"out":1618,"think":3293,"tot":11217},{"in":7958,"out":1391,"think":1485,"tot":10834},{"in":8528,"out":1639,"think":7703,"tot":17870}]
S3 [{"in":6308,"out":2249,"think":4908,"tot":13465},{"in":8591,"out":1999,"think":2340,"tot":12930},{"in":9162,"out":2230,"think":5266,"tot":16658}]
S4 [{"in":6300,"out":1936,"think":2811,"tot":11047},{"in":8270,"out":1708,"think":2160,"tot":12138},{"in":8841,"out":1931,"think":4685,"tot":15457}]
S5 [{"in":5205,"out":1453,"think":4405,"tot":11063}]
S6 [{"in":6280,"out":1000,"think":3383,"tot":10663},{"in":7313,"out":782,"think":1230,"tot":9325},{"in":7883,"out":1016,"think":6342,"tot":15241}]
S7 [{"in":6305,"out":1973,"think":1816,"tot":10094},{"in":8312,"out":1725,"think":1438,"tot":11475},{"in":8883,"out":1977,"tot":10860}]
```

Seandainya `SEM-001` tidak ada, biaya per ATP adalah satu panggilan (~11–13 ribu
token total). Dengan cacat itu, setiap ATP berdelegasi memakan **tiga kali
lipat** dan tetap gagal.

---

## R. Files

| Berkas | Status |
|---|---|
| `tests/atp-semantic-harness.ts` | **tidak diubah** |
| `tests/artifacts/atp-semantic/Sn-*` | ditulis ulang oleh run (artefak pra-model yang sama dibangkitkan ulang dengan isi identik) + berkas baru `Sn-response-raw.txt`, `Sn-output.json`, `Sn-validation.json`, `Sn-repair-prompt.txt`, `Sn-repair-response.txt`, `Sn-error.txt`; `S5-output-final.json` |
| `tests/artifacts/atp-semantic/_summary.json` | status dan `usageMetadata` per panggilan |
| `tests/artifacts/atp-semantic/_run.log` | keluaran konsol harness, verbatim |
| `tests/artifacts/atp-semantic/_diagnostik-parser.ts` / `.json` | **baru** — diagnostik parser (§D.3); bukan harness, tidak mengimpor apa pun selain `kontrak.ts` |
| `docs/ATP-SEMANTIC-GENERATION-REPORT.md` | laporan ini, diperbarui |

`Sn-output-final.json` hanya ada untuk S5: harness menulisnya hanya bila
validasi akhir lulus, dan kasus lain gagal di pipeline.

### R.1 Kelengkapan artefak per kasus

| | input | context | system-prompt | user-message | response-raw | output | validation | repair-prompt | repair-response | output-final |
|---|---|---|---|---|---|---|---|---|---|---|
| S1–S4, S6, S7 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (panggilan 3) | ✓ (panggilan 3) | — (gagal) |
| S5 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |

### R.2 Pemindaian rahasia

```
grep -rlniE "AIza[0-9A-Za-z_-]{10}|sbp_[0-9a-f]{20}|eyJhbGciOi|service_role|apikey|authorization|Bearer |key=" tests/artifacts/
→ BERSIH
nilai GOOGLE_API_KEY dicari harfiah di tests/artifacts/, docs/, dan scratchpad
→ tidak ditemukan
```

### R.3 Kode produksi tidak berubah selama uji

63 berkas working tree (seluruh berkas termodifikasi dan untracked, di luar
`tests/artifacts/` dan `tmp*`) di-hash sha256 sebelum run dan diperiksa sesudahnya:

```
sha256sum -c hash-before.txt → 63 OK, 0 berubah
git diff --stat → 9 files changed, 1434 insertions(+), 1017 deletions(-)   (sama dengan sebelum uji)
```

Termasuk, sebelum dan sesudah:

```
84a9d97b…c291a  supabase/functions/generate-atp/index.ts
2d7f7674…8329b  supabase/functions/generate-atp/kontrak.ts
80dae768…ce6ba8 supabase/functions/generate-atp/acuan-cp.ts
1fd8e236…4586   shared/data/cp-acuan.json
```

Suite baseline sesudah uji:

```
deno test --allow-read tests/atp-kontrak.test.ts  → ok | 40 passed | 0 failed
node tests/atp-acuan-sinkron.mjs                  → LULUS — acuan CP sinkron (supabase/functions/generate-atp/acuan-cp.ts)
node tests/atp-trace.mjs --periksa                → LULUS — docs/SPEC-ATP-KONTRAK.md sesuai dengan kontrak di kode.
```

Tidak ada koneksi Supabase, tidak ada `fn_check_rate_limit`, tidak ada tulisan
`atp_induk`, tidak ada `supabase db push`, `functions deploy`, `git commit`, maupun
`git push`.

---

## S. Final Test Status

```
ATP SEMANTIC TEST — READY FOR REVIEW
```

Yang perlu diputuskan peninjau, urut dampak:

1. **`SEM-001` + `SEM-002` menahan deploy.** Keduanya bukan soal mutu model;
   keduanya membuat jalur delegasi A17/A19 gagal total. Mutu keluaran model tidak
   dapat dinilai lewat pipeline sampai keduanya ditangani.
2. **`SEM-004`** — pilihan guru atas konteks tidak ditaati karena kontrak mengirim
   dua perintah yang bertabrakan.
3. **`SEM-003`** — tuntutan wajib yang hanya dilayani TP pengayaan lolos validator.
4. `SEM-005` s.d. `SEM-007` — mutu semantik: keputusan delegasi yang tidak
   bergerak, genre fiksi, dan prioritas yang lemah.

Pekerjaan berhenti di sini: tidak ada perbaikan, deploy, push, maupun commit,
dan Modul serta Naskah Fasilitasi tidak disentuh.
