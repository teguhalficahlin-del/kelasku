# MICLASS — ATP CP DECOMPOSITION LOCK REPORT

Pass 4. Tidak di-deploy, tidak di-push, tidak di-commit, tidak ada live-generate,
tidak menyentuh Modul maupun Naskah Fasilitasi.

---

## A. Final CP Authority

| | |
|---|---|
| Otoritas | **Keputusan Kepala BSKAP Nomor 046/H/KR/2025**, ditetapkan 16 Juli 2025 |
| Rumusan yang dipakai | teks **Indonesia**, Lampiran II angka 4 (Fase E) |
| Jalur SMK/MAK | Lampiran III angka I: Bahasa Inggris mengacu pada Lampiran II |
| Dicabut | 32/H/KR/2024 (Diktum KETUJUH) — hanya boleh dipakai sebagai pembanding sejarah |
| Berkas sumber | `Kepka_BSKAP_No_01k17e8396ajn15j3hcw0k773b.pdf`, hal. 136–137 |
| Kedudukan Panduan Mata Pelajaran 2025 | dokumen pendukung, **di bawah** Kepka |

Tidak ada perubahan pada `cp-data.json` maupun `cp-data.meta.json` di Pass 4 —
teks CP sudah benar sejak Pass 3. Yang dikunci di Pass 4 adalah **pembacaannya**.

---

## B. Human Decision on Print/Digital

**Keputusan peninjau, diterapkan apa adanya:**

```
berbagai media presentasi (cetak atau digital)
operator = CETAK  OR  DIGITAL          (bukan AND)
```

Tiga dasar yang disimpan bersama keputusannya di
`cp-acuan.json → review_catatan`, supaya tidak diperdebatkan ulang:

1. Kepka 046/H/KR/2025 adalah otoritas CP, berkedudukan **di atas** Panduan Mata
   Pelajaran.
2. Teks **Indonesia** Kepka adalah rumusan normatif yang dipakai.
3. Terjemahan Inggris **tidak dapat** dipakai menyelesaikan operator logis. Bukti
   yang menutup argumen itu ada di dokumen yang sama: pada elemen
   Membaca-Memirsa, Indonesia menulis *"tertulis **atau** teks multimodal"*
   sementara terjemahannya menulis *"written **and** multimodal texts"*. Kalau
   "and" pada terjemahan boleh mengalahkan "atau", elemen Membaca-Memirsa pun
   ikut berubah — dan tidak ada yang mengusulkan itu.

**Konsekuensi produk yang dikunci:**

- MiClass menempuh **jalur cetak**;
- media digital **tidak wajib**;
- guru **tidak** perlu menyediakan media digital;
- `BIE-E25-MP-2` tidak lagi `NEEDS HUMAN REVIEW`;
- requirement itu **FULLY SERVED**.

Keputusan ini **tidak boleh dibalik berdasarkan Panduan**, dan larangan itu
tertulis di dalam data, bukan hanya di laporan ini.

> **Satu hal yang sengaja tidak ikut disederhanakan.** "Berbagai media
> presentasi" tetap berarti lebih dari satu bentuk. Yang berubah hanya
> kategorinya (cetak, bukan digital), bukan keragamannya. `CASE V` menuntut
> sekurang-kurangnya tiga bentuk media cetak disebut sebagai cara layanan.

---

## C. Final Decomposition Table

**Sembilan tuntutan.** Angka ini HASIL, bukan target — lihat §E.

| ID | Elemen | Kompetensi | Lingkup materi | `sumber_cp` | Logika | Status |
|---|---|---|---|---|---|---|
| BIE-E25-MB-1 | Menyimak - Berbicara | memahami alur informasi secara keseluruhan, gagasan utama, dan detail dalam teks lisan fiksi dan non fiksi | berbagai macam topik yang relevan dengan topik sehari-hari atau isu terkini | "Memahami alur informasi … atau isu terkini;" | AND objek (alur ∧ gagasan utama ∧ detail); AND genre; **OR** topik | SAFE DECOMPOSITION |
| BIE-E25-MB-2 | Menyimak - Berbicara | menggunakan bahasa Inggris untuk mengungkapkan pendapat | topik yang dibahas | "menggunakan bahasa Inggris untuk mengungkapkan pendapat dan mempertahankan argumen tentang topik yang dibahas." *(dipakai bersama)* | AND terhadap MB-3; moda lisan **diwarisi** dari elemen | SAFE DECOMPOSITION |
| BIE-E25-MB-3 | Menyimak - Berbicara | mempertahankan argumen | topik yang dibahas | idem MB-2 *(dipakai bersama)* | AND terhadap MB-2; moda lisan **diwarisi** | SAFE DECOMPOSITION |
| BIE-E25-MM-1 | Membaca - Memirsa | memahami alur informasi secara keseluruhan | berbagai jenis teks fiksi dan non fiksi tertulis atau teks multimodal tentang topik sehari-hari atau isu terkini | kalimat utuh elemen *(dipakai bersama)* | AND terhadap MM-2; AND genre; **OR** moda; **OR** topik | SAFE DECOMPOSITION |
| BIE-E25-MM-2 | Membaca - Memirsa | menganalisis dan menyimpulkan informasi tersurat dan tersirat | idem MM-1 | kalimat utuh elemen *(dipakai bersama)* | AND verba; AND objek; AND genre; **OR** moda; **OR** topik | SAFE DECOMPOSITION |
| BIE-E25-MP-1 | Menulis - Mempresentasikan | mengomunikasikan gagasan dan pengalaman secara tertulis atau multimodal **untuk mencapai tujuan tertentu dengan struktur teks dan unsur kebahasaan yang tepat** | berbagai jenis teks fiksi dan nonfiksi | "Mengomunikasikan … unsur kebahasaan yang tepat;" | AND objek; **OR** moda; AND genre; **KUMULATIF** mutu keluaran | SAFE DECOMPOSITION |
| BIE-E25-MP-2 | Menulis - Mempresentasikan | menggunakan berbagai media presentasi | media presentasi cetak atau digital | "dengan menggunakan berbagai media presentasi (cetak atau digital)" | **OR** kategori media (cetak ∨ digital); AND keragaman ("berbagai") | SAFE DECOMPOSITION |
| BIE-E25-MP-4 | Menulis - Mempresentasikan | mengungkapkan pendapat | topik sehari-hari atau isu terkini | "mengungkapkan pendapat dan mempertahankan argumen tentang topik sehari-hari atau isu terkini." *(dipakai bersama)* | AND terhadap MP-5; **OR** topik; moda **diwarisi** | SAFE DECOMPOSITION |
| BIE-E25-MP-5 | Menulis - Mempresentasikan | mempertahankan argumen | topik sehari-hari atau isu terkini | idem MP-4 *(dipakai bersama)* | AND terhadap MP-4; **OR** topik; moda **diwarisi** | SAFE DECOMPOSITION |

**Nol tuntutan berstatus `NEEDS HUMAN REVIEW`.**
`BIE-E25-MP-3` **dipensiunkan** (§D.4). MP-4 dan MP-5 sengaja **tidak** dinomori
ulang, supaya perbandingan Pass 3 → Pass 4 tetap tidak ambigu; ID MP-3 tidak
boleh dipakai ulang.

---

## D. BEFORE → AFTER requirements

BEFORE/AFTER verbatim lengkapnya di
`docs/ATP-FINALIZATION-CHANGE-EVIDENCE.md` §21–§31.

### D.1 MB-1 — DITERIMA, tidak diubah

Hanya elemen induknya yang bertambah satu kalimat `logika_elemen` tentang
pewarisan moda. Rumusan tuntutannya utuh.

### D.2 MB-2 dan MB-3 — dua koreksi

| | BEFORE | AFTER |
|---|---|---|
| `lingkup_materi` | `topik yang dibahas **di kelas**` | `topik yang dibahas` |
| `kompetensi` MB-2 | `… mengungkapkan pendapat **secara lisan**` | `… mengungkapkan pendapat` |
| `kompetensi` MB-3 | `mempertahankan argumen **secara lisan**` | `mempertahankan argumen` |
| `sumber_cp` | dua potongan berbeda | satu anak kalimat, dipakai bersama |

`di kelas` tidak ada di CP. `secara lisan` berasal dari judul elemen, bukan dari
anak kalimat. Modanya tetap diketahui sistem: dinyatakan di `logika_elemen`
("MODA yang diwarisi seluruh tuntutan di elemen ini adalah lisan") dan di
`logika` tiap tuntutan — keduanya sudah dikirim ke penyusun lewat
`cp_anchor.tuntutan`, sehingga **tidak ada field baru tanpa konsumen**.

### D.3 MM-1 dan MM-2 — ketertelusuran diperbaiki

| | BEFORE | AFTER |
|---|---|---|
| `sumber_cp` MM-1 | `"Memahami alur informasi secara keseluruhan,"` | kalimat utuh elemen |
| `sumber_cp` MM-2 | mulai dari `"menganalisis …"` | kalimat utuh elemen |

Potongan lama hanya menopang verbanya. Genre, moda, dan topik di
`lingkup_materi` MM-1 tidak punya sumber sama sekali. Kini keduanya memakai
kalimat utuh yang sama — **ketertelusuran didahulukan atas keunikan potongan**.

### D.4 MP-1 + MP-3 lama — digabung

| | BEFORE | AFTER |
|---|---|---|
| MP-1 `kompetensi` | `mengomunikasikan gagasan dan pengalaman secara tertulis atau multimodal` | ditambah `untuk mencapai tujuan tertentu dengan struktur teks dan unsur kebahasaan yang tepat` |
| MP-3 | tuntutan tersendiri, `kompetensi: "**menghasilkan** teks yang mencapai tujuan tertentu …"` | **dihapus** |

Verba `menghasilkan` tidak ada di CP. Anak kalimatnya adalah **syarat** atas
kegiatan mengomunikasikan, bukan kompetensi kedua. Syaratnya tidak hilang:
ketiganya tetap tertulis di `kompetensi` MP-1 dan ditandai KUMULATIF di
`logika`; `cara_layanan` MP-3 lama (uraian struktur, daftar unsur kebahasaan,
contoh benar/keliru, rubrik) diserap utuh ke MP-1.

### D.5 MP-2 — media presentasi

| | BEFORE | AFTER |
|---|---|---|
| `status_dekomposisi` | `NEEDS HUMAN REVIEW` | `SAFE DECOMPOSITION` |
| `layanan` | `perlu_telaah_manusia` | `dilayani` |
| `kompetensi` | `menggunakan berbagai media presentasi **(cetak atau digital)**` | `menggunakan berbagai media presentasi` |
| `lingkup_materi` | `penyajian gagasan dan pengalaman yang sudah dikomunikasikan` | `media presentasi cetak atau digital` |
| `logika` | uraian sengketa | `OR pada kategori media: cetak ATAU digital` + dasar keputusannya |
| `cara_layanan` | menyebut jalur digital tidak dapat dipenuhi | enam bentuk media cetak, ditandai sebagai CARA layanan bukan tuntutan CP |

### D.6 MP-4 dan MP-5

| | BEFORE | AFTER |
|---|---|---|
| `kompetensi` | `mengungkapkan pendapat **secara tertulis atau melalui penyajian**` | `mengungkapkan pendapat` |
| | `mempertahankan argumen **secara tertulis atau melalui penyajian**` | `mempertahankan argumen` |
| `sumber_cp` | dua potongan berbeda | satu anak kalimat, dipakai bersama |

---

## E. Final demand count

```
9
```

Dihitung dari array final, bukan dari prompt:

| Elemen | Tuntutan |
|---|---:|
| Menyimak - Berbicara | 3 |
| Membaca - Memirsa | 2 |
| Menulis - Mempresentasikan | 4 |
| **Total** | **9** |

Riwayat: **7** (CP 2024) → **10** (CP 2025, Pass 3) → **9** (Pass 4, setelah
MP-3 digabung ke MP-1).

Seluruh yang bergantung pada jumlah kini mengikuti `WAJIB_BI.length` secara
otomatis. Angka `9` **tidak** di-hardcode di logika mana pun; ia muncul di uji
hanya sebagai penegasan atas nilai yang dihitung dari acuan
(`assertEquals(diperiksa, terpasang)` di CASE N menghitungnya sendiri).

`hitungTargetTp()` **tidak diubah**. Batas bawahnya turunan jumlah tuntutan:
`ceil(9/2) = 5`, sama dengan `ceil(10/2) = 5` — sehingga **matriksnya tidak
bergeser satu angka pun** dari Pass 3. Direcompute dan diperiksa ulang di §I.1.

---

## F. Full-Service capability

| ID | Dilayani? | Bagaimana | Pekerjaan tambahan guru |
|---|---|---|---|
| BIE-E25-MB-1 | **YA** | naskah simakan fiksi & non fiksi + pertanyaan pemahaman; teks lisan dari guru membacakan atau murid berbicara | tidak ada |
| BIE-E25-MB-2 | **YA** | pemantik, pertanyaan pendapat, petunjuk giliran bicara; interaksi langsung | tidak ada |
| BIE-E25-MB-3 | **YA** | naskah adu argumen, peran penyanggah, rambu bantahan | tidak ada |
| BIE-E25-MM-1 | **YA** | jalur *tertulis* (alternatif sah): bacaan, teks bertata-letak, tabel, formulir, jadwal, label | tidak ada |
| BIE-E25-MM-2 | **YA** | bacaan + pertanyaan analisis dan penyimpulan (termasuk yang tersirat) + kunci | tidak ada |
| BIE-E25-MP-1 | **YA** | contoh teks, kerangka, rambu penulisan, uraian struktur, daftar unsur kebahasaan, contoh benar/keliru, rubrik | tidak ada |
| BIE-E25-MP-2 | **YA** | jalur **cetak**: lembar presentasi, kartu bicara, handout, lembar informasi, formulir, selebaran tekstual — semuanya siap cetak | hanya **menggandakan**, yang memang diperbolehkan |
| BIE-E25-MP-4 | **YA** | pemantik isu, kerangka teks pendapat, rubrik | tidak ada |
| BIE-E25-MP-5 | **YA** | data & fakta pendukung, sanggahan tandingan, rubrik kekuatan argumen | tidak ada |

**9 dari 9 dilayani. Nol pekerjaan terselubung untuk guru.**

Tidak ada di mana pun: `partially supported`, `tambahkan bahan sendiri`,
`guru mencari media`, `guru membuat media digital` — dan `CASE U` menyapu seluruh
string acuan untuk membuktikannya, bukan mengandalkan pembacaan manual.

---

## G. Gate status

```
Bahasa Inggris × Fase E × 046/H/KR/2025   →   FULLY SUPPORTED
```

Dihitung `statusLayanan()`, bukan dituliskan:

| Syarat | Nilai |
|---|---|
| acuan ada | ✓ |
| `versi_cp === '046/H/KR/2025'` | ✓ |
| `versi_cp ∉ VERSI_CP_DICABUT` | ✓ |
| `review_status === 'diterima'` | ✓ |
| `cakupan.tidak_dilayani = ∅` | ✓ |
| `cakupan.perlu_telaah = ∅` | ✓ |
| **`alasan`** | `[]` |

`review_status: "diterima"` diberikan **hanya** untuk kombinasi ini. `CASE Z`
menegakkannya dengan mengumpulkan seluruh kombinasi ber-status diterima dan
menuntut hasilnya persis `['bahasa_inggris/fase_e']`.

Kombinasi lain tetap `NOT_SUPPORTED`, dan enum-nya masih hanya dua nilai.

---

## H. Cases V–Z

| Case | Yang dibuktikan | Hasil |
|---|---|---|
| **V** — authoritative OR resolved | operator OR dinyatakan tegas dan tidak terbaca AND; MP-2 `SAFE DECOMPOSITION` + `dilayani`; jalur cetak menyebut ≥3 bentuk media (aktual 6) sehingga "berbagai" tidak disusutkan; tidak ada beban media digital pada guru; dasar keputusan tercatat, bukan hanya hasilnya; kombinasi jadi `FULLY_SUPPORTED` | **PASS** |
| **W** — source may be shared | ≥3 anak kalimat dipakai bersama (aktual 3 pasang); MB-2≡MB-3, MM-1≡MM-2, MP-4≡MP-5; berbagi tidak merusak ketertelusuran — tiap potongan tetap verbatim; MM-1 kini dapat membuktikan genre, moda, dan topiknya | **PASS** |
| **X** — no invented competence verb | `BIE-E25-MP-3` tidak ada lagi; tidak ada kompetensi berverba `menghasilkan`; ketiga syarat mutu keluaran tetap utuh di MP-1 dan ditandai KUMULATIF; **verba pertama setiap kompetensi wajib ada di `sumber_cp`-nya** | **PASS** |
| **Y** — inherited element context | lingkup MB-2/MB-3 persis `topik yang dibahas` (tanpa "di kelas"); tidak ada `secara lisan` / `secara tertulis atau melalui penyajian` di kompetensi; moda tetap diketahui lewat `logika_elemen` dan `logika`; lingkup MP-4/MP-5 persis CP; **setiap kata isi di `kompetensi` dan `lingkup_materi` wajib ada di `sumber_cp`** — jaring yang menangkap "di kelas", "secara lisan", dan "menghasilkan" sekaligus tanpa menghafal daftarnya | **PASS** |
| **Z** — service opens only after accepted review | fixture identik, hanya `review_status` berbeda: cakupan sama-sama penuh, tetapi hanya yang `diterima` boleh membuka; keadaan nyata membuktikan kedua arah; status diterima hanya pada satu kombinasi | **PASS** |

---

## I. Regression A–U

| Case | Status | Catatan |
|---|---|---|
| A | hijau | `10` → `9`, dengan komentar bahwa jumlah adalah HASIL penguraian |
| B, C, D, E, F, G | hijau | tanpa suntingan |
| H (×2) | hijau | tanpa suntingan |
| I (×2) | hijau | `10` → `9` |
| J (×3) | hijau | tanpa suntingan |
| K, L, M | hijau | tanpa suntingan |
| **N** | hijau, diperkuat | jumlah tidak lagi ditulis tangan (`assertEquals(diperiksa, terpasang)` dihitung dari acuan); ditegaskan bahwa cakupan diukur pada GABUNGAN sumber sehingga potongan boleh dipakai bersama |
| **O** | hijau, direcompute | `10` → `9`; lantai tidak lagi ditulis `5` melainkan dihitung `Math.max(MIN_TP_PER_FASE, Math.ceil(WAJIB_BI.length / 2))` |
| P, Q, R, S | hijau | tanpa suntingan — tetap terhadap CP 2025 |
| **T** | hijau, diperkuat | keadaan nyata `NOT_SUPPORTED` → `FULLY_SUPPORTED`; fixture yang membuktikan gerbang masih menutup dipertahankan utuh, dan lima assertion baru ditambahkan |
| U | hijau | tanpa suntingan |
| CAKUPAN, KEPADATAN, DASAR, BAHASA, ARITMETIKA, JUDUL | hijau | tanpa suntingan |

**Tidak ada assertion yang dilemahkan.** Tiga uji yang angkanya berubah berubah
karena jumlah tuntutan memang berubah; `CASE N`, `CASE O`, dan `CASE T` justru
diperketat — dua di antaranya berhenti memakai angka yang ditulis tangan dan
mulai menghitungnya dari acuan.

### I.1 Matriks kepadatan TP — direcompute untuk 9 tuntutan

`hitungTargetTp()` tidak disentuh (Pass 4 §7). Karena `ceil(9/2) = ceil(10/2) = 5`,
**matriksnya identik dengan Pass 3** — tidak ada satu angka pun yang bergeser.

| JP | Satuan | Pertemuan | Readiness | Tuntutan | min | maks | Target TP | JP/TP |
|---:|---:|---:|---|---:|---:|---:|---:|---:|
| 48 | 4 | 12 | sesuai | 9 | 5 | 6 | **5** | 9,6 |
| 48 | 4 | 12 | sedikit_di_bawah | 9 | 5 | 6 | **5** | 9,6 |
| 48 | 4 | 12 | belum_diketahui | 9 | 5 | 6 | **5** | 9,6 |
| 48 | 4 | 12 | sangat_beragam | 9 | 5 | 6 | **5** | 9,6 |
| 48 | 4 | 12 | jauh_di_bawah | 9 | 5 | 6 | **5** | 9,6 |
| 72 | 4 | 18 | sesuai | 9 | 5 | 9 | **7** | 10,3 |
| 72 | 4 | 18 | sedikit_di_bawah | 9 | 5 | 9 | **6** | 12,0 |
| 72 | 4 | 18 | belum_diketahui | 9 | 5 | 9 | **6** | 12,0 |
| 72 | 4 | 18 | sangat_beragam | 9 | 5 | 9 | **5** | 14,4 |
| 72 | 4 | 18 | jauh_di_bawah | 9 | 5 | 9 | **5** | 14,4 |
| 108 | 4 | 27 | sesuai | 9 | 5 | 13 | **11** | 9,8 |
| 108 | 4 | 27 | sedikit_di_bawah | 9 | 5 | 13 | **9** | 12,0 |
| 108 | 4 | 27 | belum_diketahui | 9 | 5 | 13 | **9** | 12,0 |
| 108 | 4 | 27 | sangat_beragam | 9 | 5 | 13 | **8** | 13,5 |
| 108 | 4 | 27 | jauh_di_bawah | 9 | 5 | 13 | **8** | 13,5 |
| 126 | 2 | 63 | sesuai | 9 | 5 | 16 | **13** | 9,7 |
| 126 | 2 | 63 | sedikit_di_bawah | 9 | 5 | 16 | **11** | 11,5 |
| 126 | 2 | 63 | belum_diketahui | 9 | 5 | 16 | **11** | 11,5 |
| 126 | 2 | 63 | sangat_beragam | 9 | 5 | 16 | **9** | 14,0 |
| 126 | 2 | 63 | jauh_di_bawah | 9 | 5 | 16 | **9** | 14,0 |
| 144 | 4 | 36 | sesuai | 9 | 5 | 16 | **14** | 10,3 |
| 144 | 4 | 36 | sedikit_di_bawah | 9 | 5 | 16 | **12** | 12,0 |
| 144 | 4 | 36 | belum_diketahui | 9 | 5 | 16 | **12** | 12,0 |
| 144 | 4 | 36 | sangat_beragam | 9 | 5 | 16 | **10** | 14,4 |
| 144 | 4 | 36 | jauh_di_bawah | 9 | 5 | 16 | **10** | 14,4 |

Kasus batas:

| Kasus | Target |
|---|---|
| 16 JP, sesuai, 9 tuntutan | 3 (min 3, maks 3) |
| 24 JP, jauh_di_bawah, 9 tuntutan | 3 (min 3, maks 3) |
| 48 JP, sesuai, 2 tuntutan | 5 (min 3, maks 6) |
| 48 JP, sesuai, 12 tuntutan | 6 (min 6, maks 6) |
| 400 JP, sesuai, 9 tuntutan | 16 (min 5, maks 16) |
| 400 JP, jauh_di_bawah, 9 tuntutan | 16 (min 5, maks 16) |

Sifat yang diminta tetap utuh: bounded, berbasis JP, tidak linear tanpa batas,
kesiapan rendah tidak pernah menambah jumlah TP. Statusnya tetap
`HEURISTIC PRODUCT — provisional for semantic test`. Catatan Pass 3 masih
berlaku: pada 48 JP lantai CP bertemu batas atas, sehingga kesiapan tidak
mengubah jumlah TP di anggaran sekecil itu.

---

## J. Tests

```
deno test --allow-read tests/atp-kontrak.test.ts       → ok | 40 passed | 0 failed
node tests/atp-acuan-sinkron.mjs                       → LULUS
node tests/atp-trace.mjs --periksa                     → LULUS
deno run --allow-read scripts/validate-canonical-cp.ts → seluruh gerbang sesuai harapan
deno check supabase/functions/generate-atp/kontrak.ts  → Check ok
deno check supabase/functions/generate-atp/index.ts    → Check ok
deno check supabase/functions/generate-atp/acuan-cp.ts → Check ok
node --check guru/js/rancang-chat.js                   → ok
```

Baseline Pass 4 adalah 35 uji; sekarang **40**. Lima tambahan: `CASE V`, `W`,
`X`, `Y`, `Z`.

**Tidak dijalankan, dan sengaja:** `supabase db push`,
`supabase functions deploy`, `git commit`, `git push`, seluruh query ke
production DB, dan semantic live-generate.

---

## K. Files changed

| Berkas | Status | Bagian Pass 4 |
|---|---|---|
| `shared/data/cp-acuan.json` | ditulis ulang — 9 tuntutan, `review_status: diterima`, operator OR terkunci | §1–§9 |
| `supabase/functions/generate-atp/acuan-cp.ts` | dibangkitkan ulang | §7 |
| `tests/atp-kontrak.test.ts` | `CASE V`–`Z` baru; `A`/`I`/`N`/`O`/`T` disesuaikan | §10, §11 |
| `docs/ATP-FINALIZATION-CHANGE-EVIDENCE.md` | ditambah bagian PASS 4 (§21–§31) | §12 |
| `docs/ATP-FINALIZATION-CHANGE-EVIDENCE.diff` | dibangkitkan ulang (6.784 baris) | §12 |
| `docs/ATP-CP-DECOMPOSITION-LOCK-REPORT.md` | **baru** | §12 |

**Tidak disentuh di Pass 4:** `kontrak.ts`, `index.ts`, seluruh berkas klien,
`sw.js`, `guru/classroom.html`, `cp-data.json`, `cp-data.meta.json`,
`generate-modul`, dan Naskah Fasilitasi.

Versi cache tidak dinaikkan lagi: Pass 4 tidak menyentuh satu pun berkas JS, dan
kenaikan `chat-20260910a3` / `miclass-v26` dari Pass 3 belum di-deploy sehingga
sudah mencakup perubahan data ini.

---

## L. Remaining gaps

1. **Keluaran semantik belum pernah diuji terhadap model sungguhan.** Gap
   terbesar, dan satu-satunya yang tersisa dari daftar Pass 3 yang bersifat
   pokok. Yang dibuktikan 40 uji adalah kontraknya, bukan mutunya. Tiga hal yang
   perlu ikut diamati saat semantic test dijalankan: apakah penyusun
   memperlakukan jalur ALTERNATIF sebagai pemenuhan penuh (tidak menuntut
   tertulis *dan* multimodal sekaligus); apakah ia memperlakukan mutu keluaran
   MP-1 sebagai syarat alih-alih memecahnya jadi TP tersendiri; dan apakah
   "berbagai media presentasi" benar-benar diwujudkan lebih dari satu bentuk.
2. **219 mata pelajaran lain masih CP 2024 dan belum diaudit.** Tidak berbahaya
   hari ini — tak satu pun ada di acuan, dan `CASE Z` membuktikan status
   diterima hanya dimiliki satu kombinasi.
3. **Empat ATP produksi yang ada seluruhnya membawa potret CP 2024** dan akan
   ditolak `ATP_CP_VERSI_LAMA` saat disusun ulang. Perilaku yang benar, tetapi
   belum pernah dilihat guru sungguhan, dan penanda "dokumen sejarah" di layar
   serta DOCX belum ada — yang tersimpan baru `sumber_regulasi` di dalam data.
4. **Pewarisan moda hidup sebagai prosa, bukan sebagai field.** Itu keputusan
   sadar (§D.2): field tanpa konsumen dilarang. Konsekuensinya, `CASE Y` menjaga
   moda tidak bocor ke rumusan tuntutan, tetapi tidak ada yang menjaga
   `logika_elemen` tetap menyebutkan modanya bila elemen baru ditambahkan kelak.
5. **`hitungTargetTp()` tetap heuristic produk**, belum divalidasi terhadap
   keluaran nyata. Tidak berubah sejak Pass 2.
6. **Pita toleransi judul (13–16 kata) belum pernah terisi.** `catatan_mutu`
   baru akan punya isi setelah generate nyata.
7. **Elemen `nama` masih memakai ejaan 2024** ("Menulis - Mempresentasikan";
   Kepka 2025 menulis "Menulis-Mempresentasikan"). Dipertahankan demi stabilitas
   id elemen di ATP yang ada. Bedanya hanya spasi.

---

## M. Change evidence reference

```
docs/ATP-FINALIZATION-CHANGE-EVIDENCE.md    — §21–§31 memuat Pass 4, BEFORE/AFTER verbatim
docs/ATP-FINALIZATION-CHANGE-EVIDENCE.diff  — git diff HEAD + berkas baru, 6.784 baris, tidak diringkas
```

Laporan pass sebelumnya: `docs/ATP-ACCEPTANCE-CORRECTION-REPORT.md` (Pass 2),
`docs/ATP-CURRENT-CP-AUTHORITY-REPORT.md` (Pass 3).

---

`ATP ACCEPTANCE PASS 4 — READY FOR SEMANTIC TEST`
