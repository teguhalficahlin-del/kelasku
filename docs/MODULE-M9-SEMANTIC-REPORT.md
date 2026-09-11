# MODULE M9 — SEMANTIC ACCEPTANCE

## STATUS AKHIR: MODULE M9 — ACCEPTED

Diputuskan peninjau, 11 September 2026. Bukti penerimaan yang dipromosikan:
`docs/m9-semantic-evidence/` (lihat README di sana). Bagian-bagian di bawah
bagian ini adalah **riwayat penemuan** — dipertahankan apa adanya, termasuk
status lama "READY FOR REVIEW", "HARD BLOCKER", dan "CORRECTION REQUIRED" yang
sudah digantikan keputusan ini.

### Matriks kanonik final

Model: Google Gemini `gemini-3.8-flash`. Harness setara produksi
(`tests/m9-semantic-harness.ts`). Maksimal satu lifecycle perbaikan produksi.

| Skenario | Kanonik | Galat awal | Perbaikan | Galat akhir | Status |
|---|---|---|---|---|---|
| S1 kesiapan `jauh_di_bawah` | attempt 6 | 3 | 1 — dokumen utuh | 0 | PASS |
| S2 kesiapan `sesuai` | attempt 8 | 1 (V13 lama) → 0 sesudah koreksi V13, tanpa generate ulang | 0 | 0 | PASS |
| S3 konteks kejuruan | attempt 7 | 1 (P3 = 185/180 menit) | 1 — perbaikan waktu terarah | 0 | PASS |
| S4 penekanan + A17 | attempt 4 | 0 | 0 | 0 | PASS, 1 MINOR |

BLOCKER = 0, MAJOR = 0.

**MINOR yang diterima (S4):** sumatif menilai "4 dari 5 kalimat" pada tulisan
bebas; satuan lima kalimat berasal dari lembar latihan formatif, bukan dari tugas
sumatif itu sendiri.

### Koreksi yang membentuk baseline (`generate-modul/index.ts`, `contract.ts`)

| Koreksi | Inti |
|---|---|
| D1 — enam langkah | aturan urutan langkah dari `URUTAN_LANGKAH` sampai ke Fase B |
| D3 — ambang KKTP | ambang mengukur mutu bukti, bukan jumlah artefak |
| Lifecycle perbaikan | `perbaikiModulSetelahValidasi()`: manifest asli, `injectSubLangkahRef`, naskah basi digugurkan dan B2 disusun ulang, `anggaranTokenPerbaikan`, bagian milik server dipasang kembali di jalur dokumen |
| V15 | klaim Inggris per klausa sesudah bingkai Indonesia (`klaimInggris`); korpus M9 8 → 0 positif palsu, tp05 tetap tertangkap |
| Waktu kelas besar | `MENIT_OBSERVASI_PER_MURID` + `batasWaktuKelas()` — angka konkret ke Fase A, Fase B, dan perbaikan |
| Koherensi bukti–resource | bahan tugas wajib entri manifest (termasuk sumatif), `muridWajib` di kontrak + gerbang M5, penyebut = jumlah butir, teks PBL bukan instrumen asesmen |
| Benda fisik | benda yang tidak dikonfirmasi hanya pilihan tambahan |
| V13 | penyangkal ≤ 4 kata sebelum istilah di klausa yang sama (`sebutanPerangkatDigital`); `hp`/`handphone` ditambahkan |
| Batas waktu perbaikan | `batasWaktuPerbaikan()`: 50 s lantai, 20 s + 2,5 ms/token, dibatasi sisa 135 s dari permintaan (idle timeout Supabase 150 s) |
| Perbaikan waktu terarah | `panduanPerbaikanDurasi()`: pertemuan sekarang + nomor/total/wajib/selisih dihitung dari struktur; pertemuan tanpa galat total dikembalikan persis |

Tidak dipasang, dengan bukti: invarian struktural "KKTP penghitung → lembar murid
di sumatif" — menolak S3 dan S4 yang sah
(`docs/m9-semantic-evidence/pendukung/invarian-sumatif-pengukuran.txt`).

### Perilaku perbaikan final

- Jalur waktu (galat memuat "durasi"): Fase B perbaikan dengan manifest asli,
  pertemuan sekarang, dan panduan per pertemuan → `injectSubLangkahRef` →
  naskah disusun ulang → validasi akhir. S3: P3 185 → 180 dengan hanya PENUTUP
  15 → 10; P1 dan P2 kembali identik.
- Jalur dokumen: model menyusun ulang dokumen; `tp_anchor`, `atp_context`,
  `alokasi_server` dipasang kembali dari dokumen asal.
- Batas waktu kedua jalur dari satu kebijakan. Bukti: perbaikan dokumen utuh
  terberat selesai 57,1 s di bawah batas 100 s (dahulu dibatalkan di 50 s).

### Regresi final

ATP 60/0, sinkron dan jejak LULUS; M1 29/0, M2 41/0, M3 34/0, M4 61/0, M5 41/0,
M6 29/0, M7 32/0, M8 23/0; perbaikan 9/0; koreksi M9 40/0; `deno check` hijau;
fixture historis `tp02=0 tp03=0 tp04=0 tp05=1 tp06=1`.

### Batas cakupan

Penerimaan semantik live saat ini dibuktikan **hanya untuk Bahasa Inggris Fase E**
(CP `046/H/KR/2025`) — satu-satunya kombinasi yang acuan CP-nya sudah ditinjau.
Tidak ada klaim validasi semantik lintas mapel. Seluruh koreksi M9 belum
di-deploy; Edge Function produksi masih versi lama.

---

## Riwayat penemuan

Laporan untuk ditinjau. Artefak semantik: `tests/artifacts/m9/`.

> **PEMBARUAN 11 September 2026 — koreksi jalur perbaikan (D2) dan bukti ulang.**
> Bagian "Koreksi D2" di bawah ini MENGGANTIKAN §4–§12 lama untuk keputusan
> penerimaan. Earlier evidence retained for discovery, not used for final
> semantic acceptance — lihat `tests/artifacts/m9/SUPERSEDED.md`.

---

## Putaran final — V15, koherensi bukti–resource, waktu kelas besar

**Status: TIDAK DAPAT DITUNTASKAN — hard blocker.** Kredit prabayar Gemini habis
(HTTP 429 "prepayment credits are depleted") sebelum S3 final selesai. Satu cacat
MAJOR tersisa di S2. M9 tetap koreksi.

### Koreksi yang dipasang (`generate-modul/index.ts`, `contract.ts`)

| Blocker | Akar | Koreksi |
|---|---|---|
| V15 positif palsu | seluruh ucapan `Katakan: '<bingkai Indonesia + Inggris>'` dicari di instrumen | `klaimInggris()`: klaim Inggris per klausa sesudah bingkai; pencocokan tetap verbatim. Korpus M9: 8 → 0 temuan; tp05 tetap 1 |
| Waktu kelas besar | model diberi rumus, validator memakai angka mati `2` | `MENIT_OBSERVASI_PER_MURID` + `batasWaktuKelas()` dari fungsi validator; angka konkret ke Fase A, Fase B, dan perbaikan Fase B |
| Koherensi bukti–resource | manifest Fase A tidak wajib memuat bahan tugas; M5 memeriksa isi murid hanya bila untuk_murid=true; KKTP bukti hanya matriks | aturan bahan-di-manifest (termasuk sumatif), `muridWajib` di kontrak + gerbang M5 dokumen baru, penyebut = jumlah butir (Fase A + C), KKTP penghitung butir wajib menyebut lembar butirnya |
| Benda fisik | SYSTEM_PROMPT menganggap kain/contoh produk pasti ada | hanya pilihan tambahan bila tidak dikonfirmasi |

Uji: `tests/modul-m9-koreksi.test.ts` — 17/0.

### Hasil kanonik final

| | Validator | Perbaikan | Koherensi KKTP→bukti→resource |
|---|---|---|---|
| S1 | **0** | 1 (dokumen) | PASS — ASM-03 lembar sumatif memuat teks + 14 soal (4+5+5) |
| S2 | **0** | 1 (dokumen) | **MAJOR** — sumatif menyuruh menjawab "lembar kerja" yang tidak ada; PBL-03 hanya 3 pertanyaan (K3 butuh 4), tidak ada tugas mengurutkan |
| S3 | — | — | tidak ada bukti final (kredit habis); attempt 3 sebelumnya koheren, basi |
| S4 | **0** | — | PASS; MINOR: "4 dari 5 kalimat" diterapkan ke tulisan bebas sumatif |

Waktu: S2 sumatif individual+semua 70 menit untuk 32 murid (batas 64) — dulu 60.

---

## Koreksi D2 — lifecycle perbaikan produksi

### Harness sebelumnya tidak setara produksi

`arahanTitikAwal` membaca `cd` modul (selalu null) padahal produksi membaca ATP
`PROFIL_SISWA.tingkat_kemampuan_awal`; `identitas` tidak dirakit backend; balasan
menggabungkan seluruh `parts`; S2/S3 memakai `sesuai_prasyarat` yang bukan nilai
A4. Semuanya dikoreksi. S1 attempt 4 dan seluruh bukti di bawah dibuat sesudahnya.

### Akar masalah (terbukti di Skenario 1 attempt 4)

| # | Cacat | Bukti |
|---|---|---|
| 1 | Fase B perbaikan menerima manifest KOSONG | instrumen_ref 7 → 0 |
| 2 | pertemuan perbaikan tidak melewati `injectSubLangkahRef` | ref 21 → 0 |
| 3 | naskah LAMA dipakai bersama pertemuan BARU | 42 galat rujukan/liputan |
| 4 | anggaran `anggaranToken` (12.000) | 1 dari 3 percobaan terpotong |
| 5 | jalur dokumen: bagian server (M3-AD) tidak pernah diminta, tidak dipasang kembali; `keputusan_kontekstual` tidak disebut perintah | S3: 4 galat pasti |

Model memperbaiki waktu dengan benar; pipeline yang merusak hasilnya.

### Perbaikan

`perbaikiModulSetelahValidasi()` di `generate-modul/index.ts` — satu fungsi murni
yang dipanggil EF, uji, dan harness. Jalur pertemuan: manifest asli →
`injectSubLangkahRef` → naskah lama digugurkan, B2 disusun ulang lewat
`susunNaskah` → validasi. Jalur dokumen: bagian `fase: 'server'` (KONTRAK_ROOT)
dipasang dari dokumen asal; perintah menyebut field akar dokumen itu sendiri.
Kedua jalur memakai `anggaranTokenPerbaikan`. Uji: `tests/modul-perbaikan.test.ts`
(R1–R9).

### Hasil live (gemini-3.8-flash)

| Kasus | BEFORE | Percobaan lifecycle | AFTER |
|---|---|---|---|
| S1 attempt 4 (pertemuan) | 4 | fix1 / **fix2** / fix3 | 1 (V15†) / **0** / 1 (V15†) |
| S2 attempt 2 (pertemuan) | 1 | fix1 / fix2 / fix3 | 2 / 1 / 23 — **tidak pernah 0** |
| S3 attempt 2 (dokumen) | 1 | fix1 (sebelum koreksi #5) / **fix2** | 4 / **0** |
| S4 attempt 2 | 0 | — | 0 |

† V15 positif palsu: 8 dari 8 temuan V15 di seluruh korpus M9 adalah ucapan guru
`Katakan: '<bingkai Indonesia + teks Inggris>'` yang teks Inggrisnya ADA persis
di instrumen. Validator tidak diubah (di luar mandat) — keputusan peninjau.

S2: model berulang memilih blok sumatif 60 menit dengan `individual+semua` untuk
32 murid (butuh 64), padahal S1 fix2 lolos untuk slot yang sama dengan `rotasi`.
MODEL BEHAVIOR; satu putaran perbaikan produksi tidak cukup untuk kasus ini.

### Koherensi KKTP → bukti → instrumen

| | Temuan | Severity |
|---|---|---|
| S1 | K2 "3 dari 4 langkah" — teks & kunci ASM-01 memuat 5 langkah | MAJOR |
| S1 | ASM-01/02 `soal_latihan` untuk_murid=false: hanya kunci, soalnya tidak ada | MAJOR |
| S1, S2 | sumatif P3 membaca "teks prosedur baru" yang tidak ada di instrumen mana pun | MAJOR (berulang) |
| S2 | K2 ambang "5 dari 6" vs keputusan "75% dari 6" (=4,5) | MAJOR |
| S4 | K2 "75% dari 8 kalimat" — tidak ada tugas yang menuntut 8 kalimat | MAJOR |
| S3 | koheren: ambang = indikator ASM-02, kartu peran menyediakan bahan | PASS |

Akar bersama: manifest Fase A tidak diwajibkan memuat SETIAP bahan yang tugas
butuhkan (teks sumatif), dan M5 memeriksa kebutuhan murid hanya bila
`untuk_murid=true` — `soal_latihan` untuk_murid=false lolos tanpa soal.

---

M1–M8 membuktikan **struktur**. M9 menjawab yang tidak dapat dijawab validator:
apakah Modul yang dihasilkan benar-benar masuk akal, sesuai konteks guru,
realistis dijalankan, dan pedagogis konsisten.

---

## 1. Checkpoint M8

```
MODULE M8 ACCEPTED BASELINE COMMIT = 767c6e2
```

8 berkas — 2.163 insertions. M8 suite 23/0 sebelum commit.

---

## 2. Jalur live generation

**Tersedia secara lokal, tanpa deploy dan tanpa menyentuh basis data.**

| | |
|---|---|
| Provider / model | Google Gemini, `gemini-3.8-flash` — **yang memang dikonfigurasi proyek** (`MODEL_AI` di `generate-modul/index.ts`) |
| Credential | `GOOGLE_API_KEY` **ada** di environment lokal (nama saja; nilainya tidak pernah dicetak, disimpan, atau di-commit) |
| Endpoint | `generativelanguage.googleapis.com/v1beta/…:generateContent` — sama persis dengan `callAI()` |
| Probe kesiapan | 1 panggilan minimal → HTTP 200, kuota sehat |

`supabase/.env` ada dan **sudah di-gitignore**; tidak ada rahasia yang tersentuh.

### Harness: `tests/m9-semantic-harness.ts`

Pipeline sungguhan ada di Edge Function dan menyentuh DB produksi — dan M9
dilarang deploy maupun menulis DB. Harness menjalankan **jalur yang sama**
secara lokal:

- `SYSTEM_PROMPT` dan kelima `buildUserMessage*` diambil **dari sumber EF**,
  bukan disalin — pola yang sama dengan seluruh uji M3–M8;
- anggaran token, urutan fase, dan bentuk permintaan mengikuti aslinya;
- hasil akhirnya divalidasi `validateModulOutputV400` dengan **seluruh bendera
  kontrak sekarang menyala** (M2+M4+M5+M6+M7).

Yang sengaja **tidak** direplikasi: penghitung kuota, pencatatan pemakaian, dan
penulisan `modul_induk` — ketiganya menyentuh DB dan tidak memengaruhi isi.

**Tidak ada deploy. Tidak ada tulisan ke DB produksi.**

---

## 3. Matriks skenario

Baseline semantik yang didukung: **Bahasa Inggris Fase E SMK**, CP `046/H/KR/2025`
— satu-satunya kombinasi yang `acuan-cp.ts` nyatakan sudah ditinjau dan diterima.
Tuntutan CP diambil dari acuan itu, bukan dikarang.

| # | Skenario | Kesiapan | A17 | Penekanan (untuk TP ini) | Murid | Tuntutan CP |
|---|---|---|---|---|---|---|
| 1 | Kesiapan sangat rendah | `jauh_di_bawah` | `seimbang` | literasi | 32 | MM-1, MM-2 |
| 2 | Pembanding kesiapan | `sesuai_prasyarat` | `seimbang` | literasi | 32 | MM-1, MM-2 |
| 3 | Konteks kejuruan | `sesuai_prasyarat` | `dominan_kerja` | komunikasi | 30 | MB-2, MB-3 |
| 4 | Penekanan + A17 | `sedikit_di_bawah` | `dominan_sehari_hari` | kemandirian | 28 | MP-1 |

Skenario 1 dan 2 **sengaja identik kecuali kesiapan** — itulah yang membuat
perbandingan kausalitasnya berarti.

**Jumlah panggilan: 26** (1 probe + 5 generate × 5 fase). Tidak ada puluhan retry:
satu attempt per skenario, kecuali Skenario 1 yang diulang sekali untuk
membandingkan BEFORE/AFTER perbaikan.

---

## 4. Hasil validasi kontrak per skenario

| Skenario | Attempt | Galat | Catatan |
|---|---|---|---|
| 1 | 1 (**BEFORE**) | **27** | sebelum perbaikan prompt |
| 1 | 2 (**AFTER**) | **2** | sesudah perbaikan |
| 2 | 1 | 4 | |
| 3 | 1 | **0 — LOLOS** | |
| 4 | 1 | **0 — LOLOS** | |

### Temuan positif terbesar: model MEMATUHI kontrak M4–M7

Ini menutup risiko terbuka yang saya catat di laporan M5, M6, M7, dan M8
(*"kepatuhan model terhadap bentuk baru belum terukur"*). Pada kelima generate:

| Kontrak | Hasil |
|---|---|
| `tuntutan_ref` (M4) | ada, dan gabungannya menutup seluruh tuntutan TP |
| `keputusan_ketercapaian` (M4) | terstruktur benar di setiap KKTP |
| `cakupan_bukti` (M4) | `per_murid` di setiap jalur bukti |
| `keputusan_kontekstual` (M6) | ketiga sumber wajib terjejak, ID `KTX-01…` berurutan |
| `yang_diamati` + `putusan_lanjut` (M7) | **tepat** di jangkar formatif, tidak di sub_langkah lain |
| Nama field instrumen (M5) | benar — divergensi `bagian_teks`/`butir_tugas` yang terukur pada tp02 **tidak berulang** |

**Nol galat M5, M6, M7 di seluruh generate.** Yang gagal hanyalah aturan waktu
dan struktur langkah — keduanya milik V2/V4/V11 yang jauh lebih tua.

---

## 5. Review semantik per skenario

Status: **PASS / DEFECT / NOT APPLICABLE**, dengan bukti dari artefak.

### Skenario 1 — kesiapan `jauh_di_bawah` (attempt 2)

| Rubrik | Status | Bukti |
|---|---|---|
| A. TP/CP fidelity | **PASS** | K1 gagasan utama+tujuan (MM-1), K2 alur/urutan langkah (MM-1), K3 menyimpulkan rincian tersurat (MM-2). Teks PBL-01 adalah teks prosedur Inggris sungguhan. |
| B. Readiness causality | **PASS** | lihat perbandingan §5.2 |
| C. A17 `seimbang` | **PASS** | "teks sehari-hari pada pertemuan awal, teks petunjuk kerja bengkel busana pada pertemuan berikutnya" — tafsir seimbang yang benar-benar terlihat di pertemuan |
| D. Penekanan literasi | **PASS** | "membaca teks utuh terbimbing daripada potongan kalimat acak" — dan PBL-01 memang teks utuh |
| E. Vocational authenticity | **PASS** | *Pressing an Open Plain Seam*: pressing cloth, seam allowance, shine marks — penalaran konstruksi busana yang nyata |
| F. KKTP quality | **DEFECT (MAJOR)** | K1 ambang = `jumlah 1 teks`. "Menemukan gagasan utama pada minimal 1 teks" mengukur **berapa teks**, bukan **seberapa tepat**. Guru tidak dapat membedakan tercapai dari belum. |
| G. Formative | **PASS** | FMT-01 (P1 MEMAHAMI) dan FMT-02 (P2 MENGAPLIKASI) — titik yang berguna, bukan formalitas |
| I/J. Resource ↔ activity | **PASS** | kegiatan "menandai kosakata kerja pada teks" ↔ PBL-01 memang memuat kata kerja imperatif bernomor |
| K. Time realism | **DEFECT (MAJOR)** | 2 galat tersisa: `bergantian` 16 kelompok dalam 25 menit; `individual+semua` 60 menit untuk 32 murid (butuh 64) |
| L. Naskah | **PASS** | `yang_diamati` hanya di 2 jangkar formatif, dan keduanya terkait bukti yang dikumpulkan |
| M. Internal consistency | **PASS** | tidak ditemukan kontradiksi Modul ↔ Naskah |

### 5.2 Skenario 1 vs 2 — kausalitas kesiapan (rubrik B)

Dua Modul dengan TP, CP, A17, penekanan, dan jumlah murid **identik**; hanya
kesiapan berbeda. Perbandingan substansi:

| | S1 `jauh_di_bawah` | S2 `sesuai_prasyarat` |
|---|---|---|
| Keputusan konteks | "pemodelan pembacaan bersama + penandaan visual **sebelum** murid membaca mandiri" | "**tanpa** modul prasyarat tata bahasa terpisah" |
| MEMAHAMI, sub-langkah pertama | guru **membacakan contoh pelafalan**, membedah struktur langkah demi langkah | murid **membaca mandiri** teks utuh |
| Urutan kemandirian | pemodelan → berpasangan → mandiri | mandiri **sejak pertemuan pertama** |
| Durasi MEMAHAMI | 60 menit | 50 menit |

**PASS.** Perbedaannya ada di **siapa yang membaca lebih dulu** dan **apakah ada
lapisan prasyarat** — perbedaan rancangan, bukan perbedaan kalimat.

Satu catatan **MINOR**: `kebutuhan_dukungan` S2 masih menyebut "pendampingan
bertahap" dan "glosarium visual". Itu sah sebagai diferensiasi bagi sebagian
murid, tetapi sedikit menumpulkan kontrasnya.

### Skenario 3 — konteks kejuruan (LOLOS, 0 galat)

| Rubrik | Status | Bukti |
|---|---|---|
| E. Vocational authenticity | **PASS — terkuat** | Kartu peran: katun twill (kuat, menyerap keringat) vs poliester campuran (tahan kusut, warna tidak pudar) untuk seragam kantor lapangan. Dialog: linen vs cotton combed untuk *summer casual dress*. Itu penalaran pemilihan bahan yang nyata, bukan kosmetik. |
| A. TP fidelity | **PASS** | TP = mengungkapkan pendapat + **mempertahankan argumen**. Kartu peran secara eksplisit memerintahkan *"Pertahankan pendapat Anda saat rekan mengusulkan bahan lain"* — konteks kejuruan **melayani** kompetensinya, bukan menghiasinya |
| C. A17 `dominan_kerja` | **PASS** | seluruh latihan bertema rapat pemilihan bahan dan evaluasi konsep di rumah mode |
| D. Penekanan komunikasi | **PASS** | "sebagian besar waktu untuk praktik berbicara berpasangan dan simulasi tim" |
| J. Activity ↔ resource | **PASS** | kegiatan simulasi rapat ↔ kartu peran memang menyediakan dua posisi yang berlawanan |

### Skenario 4 — penekanan + A17 (LOLOS, 0 galat)

| Rubrik | Status | Bukti |
|---|---|---|
| D. Penekanan `kemandirian` | **PASS — terkuat** | Progresi nyata lintas pertemuan: P1 **berpasangan** menyusun kerangka → P2 **menulis draf mandiri** → P3 **rencana perbaikan sendiri**. Persis `arahan` penekanannya ("kurangi bantuan secara bertahap"). |
| C. A17 `dominan_sehari_hari` | **PASS** | tema berbelanja pakaian, memilih seragam sekolah, menjahit di rumah — eksplisit *"tanpa membebani istilah teknis industri"*. Kontras bersih dengan S3. |
| G. Formative + L. Naskah | **PASS** | `amati`: kemampuan mengenali kata kerja lampau → `jika_tercapai`: lanjut berpasangan merancang kerangka; `jika_belum`: tegaskan tabel padanan kata kerja dan pandu membaca ulang. Itu keputusan mengajar yang benar-benar dapat dipakai. |
| M. Internal consistency | **PASS** | `komponen_terdampak` menunjuk pertemuan dan instrumen yang benar ada |

---

## 6. Daftar defect

| # | Defect | Severity | Akar masalah | Tindakan |
|---|---|---|---|---|
| D1 | ASESMEN_AWAL dihilangkan di pertemuan 2–3 → 20 dari 27 galat | **BLOCKER** | **PROMPT** | **DIPERBAIKI** |
| D2 | `individual` + `mode_observasi='semua'` tidak muat waktu | **MAJOR** | **PROMPT** (sebagian) + **MODEL BEHAVIOR** | **DIPERBAIKI sebagian** |
| D3 | Ambang KKTP terstruktur tetapi hampa (`jumlah 1 teks`) | **MAJOR** | MODEL BEHAVIOR | dilaporkan, tidak ditambal |
| D4 | `komponen_terdampak` memakai nama akar (`materi_esensial`) di luar kosakata M6 | **MINOR** | **CONTRACT** (kosakata M6 sempit) | dilaporkan |
| D5 | `bergantian` 16 kelompok dalam 25 menit | **MINOR** | MODEL BEHAVIOR | aturannya sudah ada di prompt |
| D6 | Bahasa scaffolding tetap muncul pada kesiapan `sesuai_prasyarat` | **MINOR** | MODEL BEHAVIOR | dilaporkan |

### D1 — akar masalah dan perbaikan

Validator menuntut **keenam langkah, urutan tetap, di setiap pertemuan** sejak
V4.0. Instruksi Fase B **tidak pernah mengatakannya**. Model menilai
ASESMEN_AWAL tidak perlu diulang di pertemuan 2 dan 3, menghilangkannya, dan
satu keputusan itu menggeser seluruh nama langkah sesudahnya — 20 galat dari
satu sebab.

Ini pola yang repo ini sudah kenal: **aturan yang ditegakkan validator tanpa
pernah dikatakan kepada model.** Bukan cacat model, bukan cacat validator.

Perbaikan (terkecil yang benar): satu kalimat di `output_instruction` Fase B,
dengan urutan **diturunkan dari `URUTAN_LANGKAH`** — bukan ditulis tangan —
supaya yang model lihat tidak dapat menyimpang dari yang validator tegakkan.

### D2 — akar masalah dan perbaikan

`SYSTEM_PROMPT` memuat aritmetika untuk `bergantian` tetapi **tidak** untuk
`individual` + `mode_observasi='semua'`, padahal validator menegakkannya dengan
rumus sendiri (`jumlah_murid × 2 menit`). Perbaikan: satu butir di bagian MODE
PELAKSANAAN, di sebelah aturan `bergantian` yang sudah ada.

### D3 — mengapa TIDAK ditambal

`keputusan_ketercapaian: { jenis: 'jumlah', nilai_minimum: 1, satuan: 'teks' }`
lolos M4 secara sah: berhingga, > 0, satuan terisi. Yang salah adalah
**sasarannya** — ia mengukur berapa teks, bukan seberapa tepat.

Menambalnya di validator berarti persis yang dilarang: aturan seperti *"tolak
bila satuan == 'teks'"* adalah heuristik yang berpura-pura memahami makna.
Perbaikan yang jujur ada di prompt (contoh ambang yang baik vs hampa), dan itu
perubahan yang layak diputuskan reviewer — bukan diselipkan ke M9 tanpa
pengukuran ulang.

---

## 7. BEFORE vs AFTER

Skenario 1, konteks identik, satu-satunya perubahan adalah dua kalimat prompt:

```
BEFORE (attempt 1)   27 galat
  [20] ASESMEN_AWAL hilang + seluruh nama langkah bergeser
  [ 5] individual+semua tidak muat waktu
  [ 1] ambang persentase tanpa penyebut
  [ 1] naskah mengutip kalimat yang tidak ada di instrumen

AFTER  (attempt 2)    2 galat
  [ 1] bergantian 16 kelompok dalam 25 menit
  [ 1] individual+semua 60 menit (butuh 64)
```

**D1 hilang seluruhnya.** D2 turun 5 → 1, dan sisanya 60 vs 64 menit — model kini
**menghitung**, hanya meleset tipis. Skenario 2, 3, 4 dijalankan setelah
perbaikan: D1 tidak muncul lagi di satu pun.

Perubahan sumbernya **20 baris tambahan, nol baris dihapus**.

---

## 8. Non-determinisme

- Model/provider dan timestamp tercatat di setiap `*-meta.json`.
- Satu attempt per skenario; Skenario 1 dua attempt (BEFORE/AFTER). **Tidak ada
  puluhan retry, dan tidak ada output buruk yang disembunyikan** — attempt 1
  yang gagal disimpan utuh dan dilaporkan di §7.
- D2 muncul di S1 (32 murid) dan S2 (32 murid), **tidak** di S3 (30) dan S4 (28).
  Sampelnya terlalu kecil untuk menyimpulkan ambang, tetapi arahnya konsisten:
  makin besar kelas, makin sering model salah hitung.
- Satu lucky output tidak dianggap bukti keandalan: dari 4 skenario, 2 lolos
  bersih dan 2 tersisa galat waktu.

---

## 9. Regresi deterministik

| Suite | Hasil |
|---|---|
| ATP `atp-kontrak` + sync + trace | 60/0, LULUS, LULUS |
| M1 / M2 / M3 | 29/0, 41/0, 34/0 |
| M4 / M5 / M6 | 61/0, 41/0, 29/0 |
| M7 / M8 | 32/0, 23/0 |
| `deno check` EF + harness | hijau |
| Fixture historis | `tp02=0 tp03=0 tp04=0 tp05=1 tp06=1` |

Tidak ada uji yang dilemahkan; perubahan M9 hanya menambah kalimat ke prompt.

---

## 10. Berkas yang berubah

| Berkas | Perubahan |
|---|---|
| `supabase/functions/generate-modul/index.ts` | +20 baris: aturan enam langkah di instruksi Fase B, aturan `individual+semua` di SYSTEM_PROMPT |
| `tests/m9-semantic-harness.ts` | **BARU** — harness generate + validasi lokal |
| `tests/artifacts/m9/*` | **BARU** — 15 artefak (input/output/meta × 5 generate) |
| `docs/MODULE-M9-SEMANTIC-REPORT.md` | **BARU** — laporan ini |

Nol perubahan kontrak, validator, schema, renderer, ATP, migration, atau DB.
Pemindaian artefak: **tidak ada kunci API**.

---

## 11. Risiko tersisa

1. **D2 belum tuntas.** Aturannya kini ada di prompt, tetapi model masih meleset
   di kelas besar. Di produksi galat ini masuk putaran perbaikan yang menerima
   daftar galat persis, jadi kemungkinan besar tertutup di situ — **tetapi itu
   belum diuji**, dan setiap putaran perbaikan menambah waktu tunggu guru.
2. **D3 (ambang hampa) adalah risiko yang sampai ke guru.** Tidak ada gerbang
   deterministik yang dapat menangkapnya, dan memang tidak boleh ada.
3. **Cakupan satu mapel.** Seluruh bukti Bahasa Inggris Fase E — satu-satunya
   kombinasi yang acuannya sudah diterima. Mapel lain belum punya acuan CP yang
   ditinjau, jadi belum dapat diuji semantik.
4. **Empat skenario, lima generate.** Cukup untuk menemukan D1 (yang besar) dan
   D2, tidak cukup untuk menyatakan keandalan.
5. **Perbaikan prompt belum di-deploy.** EF produksi masih versi lama; seluruh
   pengukuran M9 berjalan lokal.

---

## 12. Apakah layak pilot?

**Layak untuk pilot terbatas, dengan dua syarat.**

Dasarnya: 2 dari 4 skenario lolos bersih; kontrak M4–M7 dipatuhi model tanpa
satu pun galat; konten kejuruan dan progresi kemandirian **benar-benar bermutu**
— bukan sekadar lolos struktur. Defect yang tersisa tidak menghasilkan modul
menyesatkan: ia menghasilkan modul yang **ditolak validator** lalu diperbaiki.

Syaratnya:

1. **Deploy perbaikan prompt lebih dulu.** Tanpa itu guru mendapat D1 —
   kegagalan 27-galat yang memakan jatah generate. Ini yang paling mendesak.
2. **Amati satu putaran nyata untuk D2.** Kalau putaran perbaikan memang
   menutupnya, D2 turun menjadi soal kecepatan. Kalau tidak, ia menjadi
   kegagalan generate di kelas besar dan perlu penanganan lain.

D3 layak masuk daftar tinjauan berikutnya, bukan penahan pilot: ambang yang
hampa membuat guru menilai dengan pertimbangannya sendiri — tidak ideal, tetapi
tidak menyesatkan.

---

# MODULE M9 — SEMANTIC ACCEPTANCE READY FOR REVIEW

Tidak di-push. Tidak di-deploy. Tidak ada migration. Tidak ada penulisan ke basis
data produksi. Kunci API tidak pernah ditampilkan, disimpan, atau di-commit.
Perubahan M9 belum di-commit, menunggu keputusan acceptance reviewer.
