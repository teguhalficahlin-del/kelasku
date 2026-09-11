# MODULE M5 — RESOURCE COMPLETENESS

Laporan untuk ditinjau. Bukti diff verbatim: `docs/MODULE-M5-RESOURCE-EVIDENCE.diff`.

Baseline: `MODULE M4 ACCEPTED = bbe5074`.

> **Memuat KOREKSI TERARAH M5.1 — paritas kontrak resource tingkat field/path.**
> Uraian lengkapnya §2a. Koreksi itu **test-only**: tidak satu baris sumber
> produksi berubah karenanya.

**Prinsip produk yang ditegakkan:** MiClass menyediakan seluruh bahan yang guru
dan murid perlukan untuk MENJALANKAN Modul. Pekerjaan membuat konten
pembelajaran tidak dipindahkan kepada guru.

**Tiga tingkat, dan M5 hanya menegakkan dua:**

| | |
|---|---|
| resource **ADA** | ditegakkan M5 |
| resource **DAPAT DIPAKAI** | ditegakkan M5 |
| resource **BERMUTU secara isi** | **M9**, bukan di sini |

Karena itu di seluruh M5 tidak ada satu pun ambang panjang teks, pencocokan
kata, atau daftar kata kunci. Bacaan berisi satu kata akan lolos M5 — dan itu
memang benar: yang tahu satu kata bukan teks bacaan adalah pembaca, bukan
penghitung karakter. `M5-SYNC3` adalah penjaga terhadap diri sendiri: kalau
suatu saat ada yang menyelipkan ambang mutu ke tabel spesifikasi, uji itu gagal.

---

## 1. Gap yang direproduksi

Audit sumber lebih dulu. Sampai M4, satu-satunya pemeriksaan atas ISI instrumen
adalah **V8**, dan V8 hanya menanyakan apakah `konten_murid` bernilai null:

```ts
if (ins.untuk_murid === true && ins.konten_murid === null) …
if (ins.untuk_murid === false && ins.konten_murid !== null) …
```

Kelima keadaan berikut karena itu **lolos**, dibuktikan dengan probe
deterministik sebelum satu baris aturan ditulis, dan kini terpasang sebagai
`M5-REPRO-1..5`:

| # | Keadaan | Akibat bagi guru |
|---|---|---|
| 1 | `teks_autentik` dengan `isi_teks: ""` | "bacalah teks berikut" — teksnya tidak ada |
| 2 | `konten_murid: {}` | instrumen tinggal judul |
| 3 | `soal_latihan` dengan `soal: []` dan `panduan_guru: null` | tanpa soal, tanpa kunci jawaban |
| 4 | `kartu_peran` dengan `set: []` | tidak ada peran untuk dimainkan |
| 5 | `soal` ada tetapi `pertanyaan: ""` | nomornya ada, pertanyaannya tidak |

**Yang TIDAK menjadi gap** — sudah dijaga sebelum M5, jadi tidak disentuh:

- **ghost ID** — V6 sudah memeriksa setiap `sub_langkah.instrumen_ref` ada di
  daftar instrumen;
- **identitas instrumen manifest ↔ array final** — V7 (dua arah) plus rantai
  bukti M4.

Jadi kelas "ghost resource" yang tersisa untuk M5 justru yang lebih halus:
**ID-nya ada, instrumennya kosong.** "Gunakan rubrik ASM-02" ketika ASM-02
hanya punya judul.

---

## 2. Perubahan kontrak/schema

`supabase/functions/generate-modul/contract.ts` — tiga tambahan, semuanya data:

| Tambahan | Peran |
|---|---|
| `RESOURCE_WAJIB` | field yang wajib berisi, per jenis instrumen (10 jenis) |
| `JENIS_TANPA_SPESIFIKASI` | `custom` — pengecualian yang ditulis tegas, bukan lubang |
| `KUNCI_SEPADAN_SOAL` | satu-satunya aturan M5 yang membandingkan dua resource |

Bentuk field dibatasi tiga saja, dan ketiganya struktural:

```
teks          → string, tidak kosong setelah trim
daftar_teks   → array string, minimal N butir, tiap butir tidak kosong
daftar_objek  → array objek, minimal N butir, dengan sub-field wajib
                (plus objek_wajib untuk sub-objek, mis. kartu peran peran_a/peran_b)
```

`MODUL_SCHEMA_VERSION` **tidak dinaikkan** — konsisten dengan keputusan §22 M4:
M4–M7 satu rangkaian pengerasan Modul V4 yang belum dirilis.

**Tidak ada migration, dan tidak ada yang membutuhkannya.** Kelengkapan resource
seluruhnya sifat keluaran Edge Function; tidak ada kolom, tabel, atau policy
yang terlibat.

### Hubungan dengan `BENTUK_INSTRUMEN` — dan mengapa keduanya tetap terpisah

`BENTUK_INSTRUMEN` (di `index.ts`, sejak `8dc8033`) adalah bentuk yang **dikirim
ke model**, berupa potongan teks mirip TypeScript. `RESOURCE_WAJIB` adalah
bentuk yang **ditegakkan validator**, berupa data.

Menurunkan teks prompt dari tabel akan mengubah kalimat yang model lihat, dan
perubahan itu **tidak dapat diuji tanpa memanggil model** — yang §31 larang.
Jadi keduanya dibiarkan terpisah, dan yang menjaga agar tidak menyimpang adalah
`M5-SYNC`: kedua tabel wajib menutup **persis** himpunan jenis yang sama.
`M5-SYNC2` mengikat keduanya ke `ENUM_KONTRAK`. Menambah jenis instrumen berarti
menyunting keduanya, dan lupa satu akan menjatuhkan uji — bukan lolos diam-diam.

---

## 2a. KOREKSI TERARAH M5.1 — paritas tingkat field/path

### Akar masalah, tepatnya

`M5-SYNC` dan `M5-SYNC2` membandingkan **himpunan jenis instrumen**, bukan isinya.
Selama sebuah jenis hadir di kedua tabel, field di dalamnya boleh menyimpang
sepenuhnya tanpa satu pun uji memerah:

```
prompt    (BENTUK_INSTRUMEN.teks_autentik.km)  meminta   `bagian_teks`
validator (RESOURCE_WAJIB.teks_autentik.murid) menuntut  `isi_teks`
```

Keduanya masih di jenis `teks_autentik`, jadi cakupan jenisnya tetap identik dan
uji lama tetap hijau. Akibatnya bukan teoretis: model akan mematuhi kontrak yang
BERBEDA dari yang ditegakkan, sehingga setiap generate ditolak validatornya
sendiri — persis divergensi yang §6 ukur pada tp02, tetapi kali ini tanpa ada
yang memberi tahu.

Uji lama tidak salah; ia hanya menjaga lapisan yang berbeda. Yang kurang adalah
lapisan di bawahnya.

### Bagaimana paritas field-level ditegakkan sekarang

Rantai yang dijaga:

```
jenis instrumen
  → field/path yang WAJIB menurut validator   (RESOURCE_WAJIB)
    → field/path yang model DIPERINTAHKAN hasilkan (BENTUK_INSTRUMEN)
```

Mekanismenya di `tests/modul-resource.test.ts`, tiga bagian:

| Fungsi | Peran |
|---|---|
| `bacaBentuk(teks)` | membaca satu potongan `BENTUK_INSTRUMEN` menjadi pohon field; array diperlakukan transparan sehingga `set: [{ peran_a: {…} }]` menjadikan `set.peran_a` sebuah jalur |
| `jalurWajib(daftar)` | menurunkan seluruh jalur wajib dari satu sisi spesifikasi, termasuk `wajib[]` dan `objek_wajib{}` yang bersarang |
| `pelanggaranParitas(specs, bentuk)` | mencocokkan keduanya dan melaporkan setiap jalur yang dituntut validator tetapi tidak diperintahkan kepada model |

**Kedua otoritas dibaca dari sumber aktual, bukan disalin.** `BENTUK_INSTRUMEN`
ternyata berada di atas penanda `// ── EDGE FUNCTION ─`, sehingga harness dapat
mengekspornya dan uji memakai **objek yang benar-benar dipakai menyusun pesan
Fase C** — bukan hasil pemindaian regex yang bisa keliru membaca lalu lulus
karena alasan yang salah. (Versi lama `M5-SYNC` memindai teks; sekarang ia
memakai objek yang sama. Itu penguatan, bukan pelemahan.)

**Cakupan yang benar-benar diperiksa: 52 jalur field/path untuk 10 jenis
non-`custom`.**

```
dialog_baseline=4  dialog_model=4  teks_autentik=2  kartu_peran=7
pemetaan_awal=6    matriks_observasi=9  lembar_refleksi=3
soal_latihan=5     lembar_praktikum=5   panduan_proyek=7
```

`pelanggaranParitas()` sengaja **menerima kedua otoritas sebagai argumen**, bukan
membacanya sendiri. Itulah yang memungkinkan uji drift menyuntikkan versi yang
sudah dirusak — uji paritas yang hanya dapat dijalankan atas keadaan sehat tidak
membuktikan ia mampu mendeteksi apa pun.

### Mengapa bukan satu otoritas tunggal

Menurunkan teks prompt dari `RESOURCE_WAJIB` akan mengubah kalimat yang model
lihat, dan **perubahan itu tidak dapat diuji tanpa memanggil model** — yang §31
larang. Jadi jalan yang diambil adalah yang reviewer sebut *minimal acceptable*:
paritas deterministik yang membaca kedua otoritas aktual. Tidak ada refactor
besar yang dipaksakan demi ideal arsitektur, dan tidak ada risiko diam-diam
mengubah perilaku generate.

### Penjaga anti-hampa

Uji paritas yang memeriksa nol jalur akan selalu hijau tanpa membuktikan apa pun.
Karena itu:

- `M5-PARITY-PARSE` menguji **pembacanya sendiri**, termasuk bahwa ia TIDAK
  menemukan field yang tidak ada (`bagian_teks`, `peran_c`, sub-field di bawah
  array skalar) — pembaca yang keliru dapat membuat paritas lulus hampa;
- `M5-PARITY-PARSE2` menuntut kesepuluh potongan bentuk benar-benar terbaca dan
  tidak menghasilkan objek kosong;
- `M5-PARITY` menghitung jumlah jalur yang diperiksa dan menuntutnya wajar
  (≥ 40), serta menuntut tidak ada jenis berspesifikasi yang terlewat.

### Drift gagal dari dua arah

**Sisi prompt** — bentuk yang model lihat berubah, validator tidak:

| Uji | Drift | Hasil |
|---|---|---|
| `M5-PARITY-DRIFT-PROMPT` | `isi_teks` → `bagian_teks` (kasus tp02 nyata) | **gagal**, menyebut `teks_autentik.isi_teks` |
| `M5-PARITY-DRIFT-PROMPT2` | `kunci_jawaban` dibuang dari bentuk | **gagal**, menyebut `soal_latihan.kunci_jawaban` |
| `M5-PARITY-DRIFT-PROMPT3` | `peran_b` dibuang; lalu `instruksi_peran` → `arahan_peran` | **gagal** pada keduanya |

**Sisi validator** — `RESOURCE_WAJIB` berubah, bentuk yang model lihat tidak:

| Uji | Drift | Hasil |
|---|---|---|
| `M5-PARITY-DRIFT-VALIDATOR` | menambah field wajib `ringkasan_teks` | **gagal** |
| `M5-PARITY-DRIFT-VALIDATOR2` | `soal` → `butir_tugas` (nama yang tp02 pakai) | **gagal** |
| `M5-PARITY-DRIFT-VALIDATOR3` | menambah sub-field `soal.skor_maksimal`; menambah sub-objek `set.peran_c` | **gagal** pada keduanya |

Dan **setiap** uji drift itu juga menegaskan bahwa pemeriksaan LAMA tingkat jenis
tetap **hijau** atas masukan yang sama (`jenisSepadan()`). Itulah reproduksi akar
masalahnya, terpasang permanen: kalau suatu saat ada yang menghapus paritas
field-level dan mengandalkan `M5-SYNC` saja, uji-uji ini menunjukkan persis apa
yang hilang.

`M5-PARITY-DRIFT-CUSTOM` menegaskan `custom` tetap dikecualikan sesuai keputusan
M5 — masalah `custom` tidak dibuka ulang.

---

## 3. Perubahan validator / generation

`supabase/functions/generate-modul/index.ts`:

| Perubahan | Isi |
|---|---|
| Bendera baru | `wajibResourceCurrent = false` — satu bendera per milestone, pola sama dengan `wajibJejakWarisan` (M2) dan `wajibKontrakAsesmenCurrent` (M4) |
| Blok validasi | kelengkapan bahan murid per jenis; kelengkapan panduan guru untuk instrumen asesmen yang dipakai; kunci sepadan soal; `custom` tidak boleh kosong |
| Jalur penyusunan | kedua pemanggilan validator kini `true, true, true` (dijaga `M5-GEN`) |

Tidak ada perubahan pada prompt, `BENTUK_INSTRUMEN`, manifest, atau alur
generate. Tidak ada perubahan pada ATP/M1/M2/M3/M4.

### Batas yang sengaja: kapan panduan guru dituntut

Panduan guru dituntut **hanya** untuk instrumen asesmen yang benar-benar dipakai
jalur asesmen — formatif, sumatif, diagnostik, atau `kktp[].instrumen_bukti`
(keempatnya diuji `M5-K`). Dari instrumen itulah keputusan tentang murid
diambil, jadi guru tidak boleh ditinggal di "silakan nilai sendiri".

Ia **tidak** dituntut untuk:

- instrumen pembelajaran — dialog, teks, kartu peran (`M5-J`). Di sana bahan
  muridnya sendiri yang menjadi kegiatannya, dan menuntut catatan fasilitasi
  untuk setiap lembar bacaan akan menjatuhkan modul sehat tanpa menambah satu
  pun hal yang guru butuhkan;
- instrumen asesmen yang tidak dipakai menilai (`M5-I`).

Gerbang yang terlalu lebar memakan jatah generate guru — pelajaran yang sudah
dibayar mahal di milestone Naskah (empat dari lima modul sehat berjatuhan).

---

## 4. Uji deterministik dan hasilnya

`tests/modul-resource.test.ts` — **41 passed / 0 failed**. Tanpa panggilan model.

```
deno test --allow-read --allow-write tests/modul-resource.test.ts
```

| Kelompok | Cakupan |
|---|---|
| `M5-REPRO-1..5` | kelima gap: lolos di modus historis, ditolak di modus M5 |
| `M5-BASE` | fixture kontrak sekarang sehat di kedua modus |
| `M5-A..M5-F` | bahan murid: hilang, teks tanpa pertanyaan panduan, kartu peran, dialog, pesan diagnostik, instrumen bukan-untuk-murid |
| `M5-G..M5-K` | panduan guru: dituntut, isinya lengkap, dan batas kapan TIDAK dituntut |
| `M5-L..M5-N` | kunci jawaban sepadan jumlah soal (kurang, lebih, sepadan) |
| `M5-O..M5-Q` | `custom` bukan pintu belakang |
| `M5-SYNC/2/3` | dua tabel satu cakupan JENIS; enum tertutup; tidak ada ambang mutu terselubung |
| `M5-PARITY-PARSE/2` | pembaca bentuk dapat dipercaya, termasuk menolak field yang tidak ada |
| `M5-PARITY/2/3` | paritas 52 jalur field/path; ketiga jenis yang reviewer wajibkan; setiap spesifikasi guru punya bentuknya |
| `M5-PARITY-DRIFT-PROMPT/2/3` | drift sisi prompt WAJIB gagal (3 bentuk drift) |
| `M5-PARITY-DRIFT-VALIDATOR/2/3` | drift sisi validator WAJIB gagal (4 bentuk drift) |
| `M5-PARITY-DRIFT-CUSTOM` | `custom` tetap dikecualikan |
| `M5-HIST/HIST2` | dokumen historis tetap terbaca, dan divergensi tp02 terukur |
| `M5-GEN` | jalur penyusunan menyalakan kontrak M5 di kedua pemanggilan |

Setiap uji penolakan memeriksa **sebab**-nya lewat pembantu `tolak()`, bukan
hanya `valid === false`.

---

## 5. Regresi ATP/M1/M2/M3/M4

| Suite | Sebelum | Sesudah |
|---|---|---|
| ATP `atp-kontrak.test.ts` | 60/0 | **60/0** |
| ATP `atp-acuan-sinkron.mjs` | LULUS | **LULUS** |
| ATP `atp-trace.mjs --periksa` | LULUS | **LULUS** |
| M1 `modul-anchor.test.ts` | 29/0 | **29/0** |
| M2 `modul-warisan.test.ts` | 41/0 | **41/0** |
| M3 `modul-contract.test.ts` | 34/0 | **34/0** |
| M4 `modul-assessment.test.ts` | 61/0 | **61/0** |
| M5 `modul-resource.test.ts` | 29/0 | **41/0** |
| `deno check` index.ts + contract.ts | hijau | **hijau** |

**Satu uji M3 disunting, dan hanya regexnya.** `M3-N` memakukan bentuk
pemanggilan validator sebagai `true(, true)?)`, sehingga bendera ketiga M5
menjatuhkannya. Regexnya dibuat `true(, true)*)` — yang diuji M3-N tetap
bendera PERTAMA (jejak pewarisan M2), dan itulah memang maksudnya. Mematok
jumlah bendera akan menjadikan uji M3 gagal setiap kali milestone baru diterima,
kegagalan yang tidak mengatakan apa pun tentang M3. Bendera milestone lain punya
ujinya sendiri: `M4-AK`, `M4-AO`, `M5-GEN`.

Tidak ada uji yang dilemahkan. Tidak ada berkas ATP/M1/M2/M4 yang disentuh.

`node tests/verify-migrations.mjs` tetap melaporkan satu item —
`20260910000001_modul-tp-snapshot-hash.sql` lokal belum di-push. **Pre-existing
dari M1**; M5 tidak menyentuh satu pun migration.

---

## 6. Hasil fixture historis

Modus historis, tidak berubah sama sekali:

```
✓ tp02.json   0 temuan   sehat — penjaga agar aturan tidak jadi galak
✓ tp03.json   0 temuan   sehat, memakai video jadi perangkat digital diizinkan
✓ tp04.json   0 temuan   sehat — disusun setelah Fase B2 dipisah
✓ tp05.json   1 temuan   naskah menunjuk judul yang tidak ada di PBL-01
✓ tp06.json   1 temuan   ASM-02 menilai K4 yang tidak punya KKTP
Semua 5 contoh sesuai harapan.
```

`M5-HIST` menegaskan dua hal: jumlah temuannya tetap, DAN tidak satu pun
temuannya berasal dari aturan M5 — jadi kebocoran aturan baru ke modus historis
akan terlihat, bukan tersembunyi di balik jumlah yang kebetulan sama.

### Pengukuran gerbang terhadap modul produksi — temuan yang perlu dilihat

Gerbang M5 diukur ke kelima modul produksi sebelum diterima, bukan diyakini
benar. Hasilnya:

| Modul | Temuan M5 (bila modus M5 dinyalakan) |
|---|---|
| tp03, tp04, tp05, tp06 | **0** |
| tp02 | **6** |

Enam temuan tp02 **bukan** resource yang hilang. Instrumen tp02 lengkap dan
kaya — teks label perawatan sungguhan, tiga butir tugas dengan target KKTP.
Yang terjadi: **model memakai nama field sendiri.**

```
teks_autentik  kontrak: isi_teks, pertanyaan_panduan
               tp02   : bagian_teks[{subjudul, konten}], judul_dokumen

soal_latihan   kontrak: petunjuk, soal[{pertanyaan}]
               tp02   : petunjuk_pengerjaan, butir_tugas[{pertanyaan_tugas}]

soal_latihan   kontrak: panduan_guru { kunci_jawaban, panduan_penskoran }
               tp02   : panduan_guru { kode_legend, kolom_indikator, catatan_kritis }
                        ← bentuk matriks_observasi, padahal jenisnya soal_latihan
```

Ini **defect yang sudah terdokumentasi** di CLAUDE.md sebagai "Pelajaran 3 — AI
tidak mematuhi kontrak bentuk instrumen", dan `BENTUK_INSTRUMEN` (`8dc8033`)
adalah ikhtiar pencegahannya yang **efeknya belum pernah terukur** karena belum
di-deploy. Sampai sekarang divergensi itu tidak terlihat: renderer punya
`renderGenerik`/`renderSisa` sebagai jaring pengaman, sehingga guru tetap melihat
isinya dan tidak ada yang mengeluh.

Tiga konsekuensi yang perlu reviewer timbang:

1. **tp02 tidak diperbaiki.** Ia bukti historis (§27 M4), dan modus historis
   tetap memberinya 0 temuan. `M5-HIST2` justru memakukan divergensinya sebagai
   fakta terukur.
2. **Gerbang M5 kini menjadi alat ukur kepatuhan bentuk itu.** Divergensi yang
   dulu senyap sekarang gagal keras di saat generate, dengan pesan yang menyebut
   field apa yang model pakai — bukan sekadar "kosong".
3. **Risikonya nyata dan tidak dapat diukur tanpa deploy:** kalau model tetap
   menyimpang, generate akan masuk putaran perbaikan lebih sering. Empat dari
   lima modul produksi patuh, jadi dasarnya tidak buruk — tetapi keempatnya
   disusun sebelum `BENTUK_INSTRUMEN` di-deploy, sehingga angka itu bukan
   ramalan.

Karena itulah pesan galat dibuat presisi — lihat berikutnya.

---

## 7. Berkas yang berubah

| Berkas | Peran |
|---|---|
| `supabase/functions/generate-modul/contract.ts` | `RESOURCE_WAJIB`, `JENIS_TANPA_SPESIFIKASI`, `KUNCI_SEPADAN_SOAL`, tipe `FieldResource`/`SpesifikasiResource` |
| `supabase/functions/generate-modul/index.ts` | impor, bendera `wajibResourceCurrent`, blok validasi kelengkapan resource, 2 pemanggilan validator |
| `tests/modul-contract.test.ts` | `M3-N`: regex bendera dibuat tahan tambahan (lihat §5) |
| `tests/modul-resource.test.ts` | **BARU** — 41 uji, termasuk 12 uji paritas M5.1 (`bacaBentuk`, `jalurWajib`, `pelanggaranParitas`) |
| `docs/MODULE-M5-RESOURCE-EVIDENCE.diff` | **BARU** — bukti diff |
| `docs/MODULE-M5-RESOURCE-REPORT.md` | **BARU** — laporan ini |

### Keputusan desain yang layak dilihat: pesan yang tidak menyesatkan

Percobaan pertama menghasilkan pesan `konten_murid.isi_teks kosong` pada dokumen
yang justru penuh teks — karena tekniknya `isi_teks` tidak ada, bukan kosong.
Pesan itu akan mengirim putaran perbaikan ke arah yang salah.

Sekarang pesannya membedakan keduanya, dan ketika field yang dituntut tidak ada
ia menyebut field apa saja yang **benar-benar ada**:

```
instrumen_pembelajaran[0] (PBL-01, teks_autentik).konten_murid.isi_teks
  tidak ada — yang ada di sini: bagian_teks, judul_dokumen
```

Deterministik sepenuhnya (daftar kunci objek), dan menjadikan pesannya cukup
untuk perbaikan dalam satu putaran. `M5-E` memakukannya, termasuk bahwa pesannya
TIDAK mengatakan "kosong" untuk dokumen yang penuh isi.

---

## 8. Celah M5 yang tersisa

Dilaporkan, bukan ditambal diam-diam.

~~**Drift kontrak resource antara prompt dan validator hanya dijaga di tingkat
jenis.**~~ **DITUTUP di M5.1** — lihat §2a. Paritas kini ditegakkan pada 52 jalur
field/path, dan drift gagal dari kedua arah.

1. **Kepatuhan bentuk oleh model belum terukur pasca-deploy.** Lihat §6. Ini
   celah pengetahuan, bukan celah kode: satu generate nyata akan menjawabnya.
2. **`custom` hanya dituntut "ada isinya".** Itu batas yang jujur — jenis custom
   ada supaya guru tidak terkurung sepuluh jenis, dan bentuk isinya memang tidak
   dapat ditentukan di muka. Konsekuensinya: `custom` adalah jalan paling longgar
   di M5, dan model yang kesulitan mematuhi bentuk bisa "lolos" dengan
   menyebut instrumennya custom. Tidak ada pemeriksaan yang mencegah itu tanpa
   menilai isi — yang berarti M9.
3. **Kesesuaian `jenis` dengan bentuk `panduan_guru` tidak diperiksa terpisah.**
   Divergensi tp02 (bentuk `matriks_observasi` di `soal_latihan`) tertangkap
   sebagai "field yang dituntut tidak ada", yang sudah cukup untuk menolak dan
   sudah menyebut field yang dipakai. Pemeriksaan "bentukmu milik jenis lain"
   akan lebih menjelaskan, tetapi menambah aturan yang bisa salah tuduh tanpa
   menambah satu pun penolakan baru.
4. **Kelengkapan Naskah Fasilitasi tidak disentuh** — itu M7. Naskah yang
   menyebut bahan tak tersedia masih dijaga V12 apa adanya.
5. **Kesepadanan resource dengan kegiatan tidak diperiksa.** Sebuah kegiatan
   yang menyebut "diskusikan tabel data" sementara instrumennya berupa dialog
   akan lolos: menilai kecocokan itu memerlukan pembacaan makna, dan itu M9.

---

## 9. Bukti

`docs/MODULE-M5-RESOURCE-EVIDENCE.diff` — hanya perubahan M5 sesudah checkpoint
M4 (`bbe5074`), termasuk berkas uji baru secara penuh.

---

# MODULE M5 — TARGETED CORRECTION COMPLETE — READY FOR REVIEW

Tidak di-push. Tidak di-deploy. Tidak ada migration. Tidak ada penulisan ke
basis data produksi. Tidak ada panggilan Gemini. M5 belum di-commit, menunggu
keputusan acceptance reviewer. M6 belum dimulai.
