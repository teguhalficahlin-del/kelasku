# MODULE M7 — NASKAH FASILITASI

Laporan untuk ditinjau. Bukti diff verbatim: `docs/MODULE-M7-NASKAH-EVIDENCE.diff`.

> **Memuat KOREKSI TERARAH M7.1 — formatif dan sumatif tidak diperlakukan sama.**
> Uraian lengkapnya §7a.

Naskah adalah yang guru pegang **saat mengajar**, sering dari layar HP. Rantai
yang M7 tegakkan:

```
Modul → langkah pelaksanaan → lakukan → katakan → tanyakan → amati → putuskan
```

**Tiga tingkat, dan M7 hanya menegakkan dua:**

| | |
|---|---|
| naskah **ADA dan SEJAJAR** dengan Modul | ditegakkan M7 |
| setiap unit punya **isi yang diperlukan** | ditegakkan M7 |
| kalimatnya **bagus / pertanyaannya tepat** | **M9**, bukan di sini |

Tidak ada satu pun pencocokan kata di M7. Apakah `aksi_guru` cukup konkret,
apakah `ucapan_guru` terdengar wajar, apakah `pertanyaan_kunci` pedagogis, dan
apakah `putusan_lanjut` intervensi terbaik — semuanya M9.

---

## 1. Checkpoint M6

```
MODULE M6 ACCEPTED BASELINE COMMIT = f742a68
```

Commit lokal, belum di-push. Enam berkas (`contract.ts`, `index.ts`,
`tests/modul-contract.test.ts`, `tests/modul-kausalitas.test.ts`, dan dua dokumen
bukti) — 2.147 insertions. M6 suite 29/0 sebelum commit. Pemindaian rahasia
bersih; artefak eksperimen tetap untracked.

---

## 2. Struktur Naskah: sebelum dan sesudah

**Sebelum** — `NaskahSubLangkah`, dibuat **Fase B2**:

```ts
{ ref, ucapan_guru[], aksi_guru[], pertanyaan_kunci[], jika_kesulitan?[] }
```

Dipetakan ke bentuk konseptual yang reviewer kunci:

| Konsep | Field | Keadaan sebelum M7 |
|---|---|---|
| **do** | `aksi_guru` | ada — **tidak pernah divalidasi** |
| **say** | `ucapan_guru` | ada — tidak pernah divalidasi |
| **ask** | `pertanyaan_kunci` | ada — tidak pernah divalidasi |
| **observe** | — | **TIDAK ADA sama sekali** |
| **decide-next** | `jika_kesulitan` | opsional, **satu sisi saja**, tidak pernah dituntut |

**Sesudah** — dua field baru, dan yang lama tetap:

```ts
{ ref, aksi_guru[], ucapan_guru[], pertanyaan_kunci[],
  yang_diamati?[],                                   // observe   (M7)
  putusan_lanjut?: { jika_tercapai, jika_belum },    // decide    (M7)
  jika_kesulitan?[] }                                // tetap, untuk dokumen lama
```

`putusan_lanjut` vs `jika_kesulitan`: yang pertama struktur keputusan dua cabang
(wajib di jangkar FORMATIF; SUMATIF dikecualikan — lihat §7a), yang kedua tetap
catatan bebas yang sudah ada dan
dipertahankan untuk dokumen lama serta renderer. Pembagian yang sama dengan
`keputusan_ketercapaian` vs `ambang_batas` di M4 — bukan pola baru.

---

## 3. Audit dan gap yang direproduksi

### Validator Naskah yang sudah ada sebelum M7

| | Isi |
|---|---|
| **V11** | panjang naskah = jumlah pertemuan; nomor pertemuan; 6 langkah; urutan nama langkah; setiap `ref` yang naskah sebut ADA di `pertemuan[]` |
| **V12** | naskah tidak boleh menyebut instrumen yang tidak ada; tidak boleh mengarang "halaman dua"/"bagian kedua" |
| **V13** | perangkat digital di seluruh dokumen termasuk prosa naskah |
| **V15** | kutipan yang diakui ada di instrumen harus benar-benar ada |
| **V16** | indikator rubrik yang tidak punya KKTP |

### Gap yang direproduksi (probe deterministik, sebelum implementasi)

```
sub_langkah modul: 24 | dijangkau naskah: 24

LOLOS  GAP 1: naskah meliput 1 dari 24 sub_langkah
LOLOS  GAP 2: setiap entri naskah kosong (do/say/ask semuanya [])
GAP 3: field naskah yang ada : aksi_guru, jika_kesulitan, pertanyaan_kunci, ref, ucapan_guru
       field observe/decide  : TIDAK ADA
LOLOS  GAP 4: sub_langkah jangkar FMT-01, naskah tanpa panduan amati/keputusan
LOLOS  GAP 5: urutan sub_langkah naskah dibalik terhadap modul
```

Kelimanya terpasang permanen sebagai `M7-REPRO-1..4` dan `M7-I/J`.

**Gap 4 adalah yang paling merugikan guru:** sub-langkah yang menjadi jangkar
asesmen formatif adalah tempat guru mengumpulkan bukti tentang murid — dan naskah
boleh tidak menyebut satu kata pun tentang apa yang harus diamati. Guru berdiri
di depan kelas memegang lembar yang menyuruhnya menilai, tanpa diberi tahu
menilai apa.

### Gap yang ternyata SUDAH ditutup milestone lama — tidak dikerjakan ulang

| Reviewer minta | Sudah ditutup oleh |
|---|---|
| **C.** naskah menunjuk resource ID yang tidak ada → gagal | **V12** (terbukti: `ASM-99` ditolak) |
| **G.** naskah menunjuk asesmen yang tidak ada | V12 untuk ID instrumen; jangkar asesmen berasal dari `pertemuan[]`, dan M4 sudah menjamin `asesmen_ref` sah |
| **B.** entri naskah → sub_langkah yang tidak ada | **V11** |
| **H.** timing kedua | **tidak mungkin** — naskah tidak punya field waktu sama sekali |

Untuk keempatnya M7 menambahkan **regression guard**, bukan aturan baru:
`M7-M`, `M7-N`, `M7-C`, `M7-O/P`.

---

## 4. Perubahan kontrak/schema

`contract.ts` — bentuk naskah diperluas dan lima tabel otoritas ditambahkan:

| Tambahan | Peran |
|---|---|
| `NASKAH_WAJIB` | `['aksi_guru']` — satu-satunya yang wajib di setiap unit |
| `NASKAH_OPSIONAL` | `ucapan_guru`, `pertanyaan_kunci`, `jika_kesulitan` |
| `NASKAH_WAJIB_DI_JANGKAR` | `['yang_diamati']` |
| `CABANG_PUTUSAN` | `['jika_tercapai', 'jika_belum']` |
| `NASKAH_TERLARANG_WAKTU` | nama field yang menandakan timeline kedua |

`MODUL_SCHEMA_VERSION` **tidak dinaikkan** — konsisten dengan M4–M7 sebagai satu
rangkaian pengerasan V4 yang belum dirilis.

**Tidak ada migration, dan tidak ada yang membutuhkannya.**

Mekanisme M3 kembali terbukti: bentuk ditulis di satu tempat, lalu kerangka Fase
B2 dan pesan perbaikan per fase mengikuti tanpa disunting (`M7-KONTRAK`).

---

## 5. Paritas struktural

Setiap sub_langkah `pertemuan[]` wajib punya entri naskah, **dan urutannya wajib
sama**. Dicocokkan lewat `ref` — bukan kemiripan kalimat — karena `ref` sudah
diisi backend dan sudah dijaga V11 dari arah sebaliknya.

| Arah | Dijaga oleh |
|---|---|
| naskah → modul (entri menunjuk sub_langkah nyata) | V11, sebelum M7 (`M7-C`) |
| **modul → naskah** (setiap sub_langkah diliput) | **M7** (`M7-B`) |
| **urutan** naskah mengikuti urutan modul | **M7** (`M7-D`) |

Urutan penting karena guru membacanya sambil mengajar: naskah yang melompat-lompat
membuatnya kehilangan tempat. Pesan galat menyebut `ref` yang hilang agar
perbaikannya satu putaran.

---

## 6. do / say / ask / observe / decide-next

| Konsep | Field | Aturan M7 | Uji |
|---|---|---|---|
| **do** | `aksi_guru` | WAJIB di setiap unit, ≥ 1 butir, tidak hampa | `M7-E` |
| **say** | `ucapan_guru` | BOLEH kosong; kalau ada, tidak hampa | `M7-F`, `M7-H` |
| **ask** | `pertanyaan_kunci` | BOLEH kosong; tanpa ambang jumlah | `M7-G`, `M7-H` |
| **observe** | `yang_diamati` | WAJIB **di jangkar FORMATIF** (opsional di SUMATIF) | `M7-I`, `M7-R` |
| **decide** | `putusan_lanjut` | WAJIB **di jangkar FORMATIF**, kedua cabang terisi (opsional di SUMATIF) | `M7-J`, `M7-K`, `M7-Q` |

**Mengapa hanya `aksi_guru` yang wajib di setiap unit.** Guru selalu MELAKUKAN
sesuatu di setiap langkah, tetapi tidak selalu perlu MENGATAKAN atau MENANYAKAN
sesuatu. Mewajibkan ucapan di setiap sub-langkah akan memaksa naskah menjadi
skrip yang dibaca kata demi kata — persis bentuk yang prinsip produk ini tolak.
`M7-F` memakukannya: naskah dengan seluruh `ucapan_guru` kosong tetap **lolos**.

Kekonkretan kalimat tidak dinilai — hanya keberadaan dan keterkaitan ke unit
Modul nyata, sesuai batas yang reviewer tetapkan.

---

## 7. Integrasi jangkar formatif

**Jangkar ditentukan MODUL, bukan naskah:** sub_langkah yang punya `asesmen_ref`.

Sejak koreksi M7.1, tuntutannya dibedakan: `yang_diamati` dan `putusan_lanjut`
WAJIB di jangkar **formatif** (`FMT-xx`), dan **opsional** di `SUMATIF` — lihat
§7a.

`M7-L2` membuktikan arah otoritasnya: menambahkan `asesmen_ref` di modul langsung
menuntut naskah melengkapinya. Sebaliknya, sub_langkah biasa **tidak** dituntut
(`M7-L`) — memaksanya akan menjadikan naskah dokumen administratif kedua.

**Tidak ada ambang kedua.** `putusan_lanjut` adalah dua kalimat tindakan, bukan
angka; ambang ketercapaian tetap milik `keputusan_ketercapaian` M4. Instruksi
Fase B2 menyatakannya eksplisit — *"jangan membuat ambang baru"* (`M7-GEN2`),
dan `kktp` serta `rencana_asesmen` memang sudah dikirim ke Fase B2 sebagai acuan.

---

## 7a. KOREKSI TERARAH M7.1 — formatif vs sumatif

### Akar masalah, tepatnya

Blok validasi M7 memperlakukan **setiap** `asesmen_ref` sebagai satu jenis
jangkar:

```ts
const asesmenRef = jangkar.get(ref);
if (!asesmenRef) continue;
// … yang_diamati WAJIB, putusan_lanjut WAJIB, kedua cabang WAJIB
```

Itu terlalu luas. Rantai formatif memang menuntut keputusan **di tempat**:
asesmen formatif terjadi di tengah pembelajaran, guru mengamati bukti,
memutuskan tercapai atau belum, lalu melakukan sesuatu sebelum pelajaran
berlanjut. Tanpa `putusan_lanjut` guru hanya mengukur.

**Sumatif tidak bekerja begitu.** Guru kerap MENGUMPULKAN produk atau unjuk
kerja lalu menilainya setelah kelas usai — praktik yang sah, bukan kelalaian.
Menuntut keputusan di tempat untuk setiap sumatif berarti mengarang kebiasaan
yang guru memang tidak lakukan, lalu menolak modul yang sehat karenanya.

Terbukti pada fixture produksi: satu-satunya jangkar di tp02 adalah SUMATIF, dan
pada implementasi M7 sebelum koreksi ia ditolak:

```
DITOLAK — SUMATIF tanpa putusan_lanjut
  naskah_fasilitasi P3.MENGAPLIKASI.2.putusan_lanjut tidak ada padahal
  sub_langkah ini jangkar asesmen 'SUMATIF' — mengamati tanpa tahu langkah
  berikutnya hanya mengukur
```

Sesudah koreksi: **LOLOS**.

### Logika validator yang berubah

| | Sebelum | Sesudah |
|---|---|---|
| `asesmen_ref = FMT-xx` | `yang_diamati` + `putusan_lanjut` (2 cabang) WAJIB | **tidak berubah** |
| `asesmen_ref = SUMATIF` | sama-sama WAJIB | **keduanya OPSIONAL** |

Percabangannya satu tempat, dan daftar pengecualiannya data:

```ts
const dikecualikan = ASESMEN_REF_TANPA_PUTUSAN.includes(asesmenRef);
if (dikecualikan) { /* keduanya opsional */ continue; }
/* jangkar formatif: keduanya wajib */
```

**Tidak ada aturan pedagogis baru untuk SUMATIF.** `yang_diamati` juga TIDAK
diperluas demi simetri — sesuai arahan, requirement keduanya berlaku khusus
`FMT-xx`.

Satu hal yang tetap dijaga dan perlu terlihat: kalau sumatif KEBETULAN punya
`yang_diamati` atau `putusan_lanjut`, isinya tidak boleh hampa (`M7-S`). Itu
bukan tuntutan baru — perlakuan yang persis sama dengan field opsional lain di
naskah (`ucapan_guru`, `pertanyaan_kunci`), yaitu *"boleh tidak ada, tetapi
kalau ada tidak boleh kosong"*. Guru yang memang memutuskan di tempat tidak
dihalangi.

### Mengapa daftarnya hanya `['SUMATIF']`

`DIAGNOSTIK` sengaja TIDAK dimasukkan: ia bukan nilai `asesmen_ref` yang dipakai
sub_langkah mana pun. Diagnostik punya `waktu` berupa kalimat di
`rencana_asesmen`, bukan jangkar di `pertemuan[]`. Mengecualikannya berarti
mengecualikan sesuatu yang tidak ada. `M7-T` memakukan daftarnya dan sekaligus
membuktikan jangkar di luar daftar (mis. `FMT-03`) tetap menuntut keduanya.

### Fixture uji ikut diperbaiki — dan ini penting

Satu-satunya jangkar di tp02 adalah SUMATIF. Sesudah koreksi, SUMATIF justru
yang dikecualikan — sehingga uji formatif yang memakai `refJangkar()[0]` akan
menguji jangkar yang **tidak lagi tunduk pada aturan yang sedang diuji**, dan
lulus tanpa memeriksa apa pun.

Karena itu `fixtureSekarang()` kini menambahkan jangkar FORMATIF sungguhan
(`FMT-01` di `P1.MEMAHAMI.1`) beserta entri `rencana_asesmen`-nya supaya dokumen
tetap koheren. Hasilnya satu fixture yang memuat **kedua** jenis jangkar:

```
P1.MEMAHAMI.1     → FMT-01,  lengkap dengan yang_diamati + putusan_lanjut
P3.MENGAPLIKASI.2 → SUMATIF, sengaja TANPA keduanya
```

Jadi setiap kali suite dijalankan, keduanya diuji bersamaan.

---

## 8. Integritas rujukan resource

Sudah ditutup V12 sebelum M7, dan M7 **tidak menambah aturan baru** di sini —
hanya regression guard, karena kalau V12 hilang M7 tidak akan menangkapnya
sendiri:

- `M7-M`: naskah menyebut `ASM-99` yang tidak ada → ditolak;
- `M7-N`: naskah mengarang "PBL-01 halaman dua" → ditolak.

Naskah **menunjuk** resource Modul, tidak menduplikasi isinya — sesuai arahan.

---

## 9. Keselarasan waktu

**Naskah tidak punya waktu sendiri, dan itu sudah benar sejak sebelum M7:** tidak
ada satu pun field durasi di strukturnya. Yang M7 tambahkan adalah penjaga agar
keadaan itu tidak berubah diam-diam (`M7-O`): `durasi_menit`, `durasi`, `menit`,
`waktu`, `alokasi_menit` di entri naskah semuanya ditolak.

`M7-P` menjaga dari sisi kontrak: bentuk yang model diminta hasilkan tidak boleh
menawarkan satu pun field waktu.

Urutan dan durasi tetap milik `pertemuan[]`. **Tidak ada asumsi durasi baru yang
ditambahkan.** Fase B2 tetap menerima `jatah_waktu` yang backend hitung untuk
kegiatan bergantian — itu sudah ada sebelum M7 dan tidak disentuh.

---

## 10. Bentuk phone-friendly

Ditegakkan lewat sifat struktural, bukan penilaian subjektif dan bukan ambang
jumlah karakter:

- satu entri per unit eksekusi (`ref`), bukan satu blok narasi raksasa;
- field pendek yang terpisah per peran (do/say/ask/observe/decide);
- urutan yang dijamin mengikuti modul;
- rujukan berupa ID, bukan salinan isi.

Tidak ada ambang panjang teks — tidak ada dasar kontraknya, dan menebaknya akan
menjadi angka sembarang yang menyamar sebagai pedagogi.

---

## 11. Kompatibilitas historis

Pola M2–M6: bendera `wajibNaskahCurrent`, bawaan `false`, dinyalakan jalur
penyusunan di **kedua** pemanggilan validator (`M7-GEN`).

`M7-HIST` menegaskan dua hal: temuan kelima fixture tetap pada baseline, DAN
tidak satu pun temuannya berasal dari aturan M7. `M7-HIST2` mencatat fakta
terukurnya: naskah historis memang belum punya `yang_diamati` maupun
`putusan_lanjut` — itulah sebabnya penegakannya dinyalakan pemanggil. Dokumen
lama tetap terbaca dan dapat diunduh.

---

## 12. Uji deterministik

`tests/modul-naskah.test.ts` — **32 passed / 0 failed**. Tanpa panggilan model.

Terhadap strategi uji yang reviewer minta:

| | Uji |
|---|---|
| **A.** naskah wajib | `M7-A` |
| **B.** reference integrity | `M7-C` (V11, dijaga), `M7-B` (arah baru) |
| **C.** resource integrity | `M7-M`, `M7-N` (V12, dijaga) |
| **D.** formative anchor tanpa `observe` | `M7-I` |
| **E.** anchor formatif tanpa decide-next | `M7-J`, `M7-K` |
| **F.** positive formative execution | `M7-L`, `M7-BASE` |
| **M7.1** SUMATIF tanpa decide-next → LOLOS | `M7-Q`, `M7-R` |
| **M7.1** SUMATIF berisi tetapi hampa → ditolak | `M7-S` |
| **M7.1** daftar pengecualian hanya SUMATIF | `M7-T` |
| **G.** no invented assessment | `M7-L2` (jangkar dari modul), `M7-M` |
| **H.** no invented timing | `M7-O` (negatif), `M7-P` (positif) |
| **I.** historical | `M7-HIST`, `M7-HIST2` |

Setiap uji penolakan memeriksa **sebab**-nya lewat `tolak()`, bukan hanya
`valid === false`.

---

## 13. Regresi

| Suite | Sebelum | Sesudah |
|---|---|---|
| ATP `atp-kontrak.test.ts` | 60/0 | **60/0** |
| ATP `atp-acuan-sinkron.mjs` | LULUS | **LULUS** |
| ATP `atp-trace.mjs --periksa` | LULUS | **LULUS** |
| M1 `modul-anchor.test.ts` | 29/0 | **29/0** |
| M2 `modul-warisan.test.ts` | 41/0 | **41/0** |
| M3 `modul-contract.test.ts` | 34/0 | **34/0** |
| M4 `modul-assessment.test.ts` | 61/0 | **61/0** |
| M5 `modul-resource.test.ts` | 41/0 | **41/0** |
| M6 `modul-kausalitas.test.ts` | 29/0 | **29/0** |
| M7 `modul-naskah.test.ts` | 28/0 | **32/0** |
| `deno check` ×3 | hijau | **hijau** |

**Tidak ada satu pun uji milestone lama yang perlu disesuaikan.** Uji `GEN` tiap
milestone memakai `assertStringIncludes` atas deret bendera, sehingga bendera
keenam menambah panjang tanpa memutus pemeriksaan yang ada.

`node tests/verify-migrations.mjs` tetap melaporkan satu item pre-existing dari
M1 (`20260910000001` belum di-push). M7 tidak menyentuh migration.

---

## 14. Fixture historis

```
✓ tp02.json   0 temuan      ✓ tp03.json   0 temuan      ✓ tp04.json   0 temuan
✓ tp05.json   1 temuan      ✓ tp06.json   1 temuan
Semua 5 contoh sesuai harapan.
```

---

## 15. Berkas yang berubah

| Berkas | Peran |
|---|---|
| `supabase/functions/generate-modul/contract.ts` | bentuk + catatan naskah; `NASKAH_WAJIB`, `NASKAH_OPSIONAL`, `NASKAH_WAJIB_DI_JANGKAR`, `CABANG_PUTUSAN`, `NASKAH_TERLARANG_WAKTU`; **M7.1**: `ASESMEN_REF_TANPA_PUTUSAN` |
| `supabase/functions/generate-modul/index.ts` | tipe `NaskahSubLangkah`, bendera `wajibNaskahCurrent`, blok validasi naskah, instruksi Fase B2, 2 pemanggilan validator |
| `tests/modul-naskah.test.ts` | **BARU** — 32 uji (termasuk 4 uji M7.1) |
| `docs/MODULE-M7-NASKAH-EVIDENCE.diff` | **BARU** — bukti diff |
| `docs/MODULE-M7-NASKAH-REPORT.md` | **BARU** — laporan ini |

Renderer **tidak disentuh** — itu M8, dan `jika_kesulitan` sengaja dipertahankan
supaya renderer yang ada tidak berubah perilakunya.

---

## 16. Celah M7 yang tersisa

1. **`yang_diamati` tidak diperiksa terhadap KKTP yang diukur jangkar itu.**
   Naskah boleh menyebut hal yang diamati tanpa kaitan ke `referensi_kktp` entri
   asesmennya. Menautkannya secara deterministik menuntut struktur tambahan
   (mis. `kktp_ref` di entri naskah); menilai kesesuaian kalimatnya adalah M9.
   Ini kandidat paling jelas untuk penajaman berikutnya.
2. **Naskah tidak wajib menyebut instrumen yang sub_langkahnya pakai.** Modul
   menyatakan `instrumen_ref` di sub_langkah; naskah boleh tidak menyinggungnya.
   Menuntutnya berisiko salah tuduh — guru tidak selalu perlu menyebut lembar
   yang sudah ada di tangan murid.
3. **Kesepadanan `putusan_lanjut` dengan ambang M4 tidak diperiksa.** Kedua
   cabang wajib terisi, tetapi apakah "jika tercapai" benar-benar sejalan dengan
   `keputusan_ketercapaian` adalah pembacaan makna — M9. Yang dijaga sekarang:
   naskah tidak membuat ambang kedua.
4. **Sumatif tidak dituntut menyebut apa yang dikumpulkan.** Konsekuensi sadar
   dari M7.1: naskah boleh tidak menyebut apa pun di slot sumatif. Menuntutnya
   berarti mengembalikan persis keluasan yang baru saja dicabut. Kelengkapan
   instrumen sumatif tetap dijaga M5, dan rantai buktinya M4.
5. **Bentuk phone-friendly tidak diukur.** Tidak ada ambang panjang; naskah
   dengan satu `aksi_guru` sepanjang satu paragraf tetap lolos. Mengukurnya
   menuntut dasar kontrak yang belum ada.
6. **Kepatuhan model terhadap bentuk M7 belum terukur.** Sama seperti M5 dan M6:
   tanpa panggilan model, apakah model benar-benar menghasilkan `yang_diamati`
   dan `putusan_lanjut` di setiap jangkar baru terukur pada generate berikutnya
   setelah deploy. Beban tambahannya nyata — Fase B2 kini diminta menghasilkan
   dua field lagi untuk setiap jangkar asesmen, jadi plafon tokennya layak
   diperiksa pada generate pertama (pelajaran plafon token di CLAUDE.md).

---

# MODULE M7 — TARGETED CORRECTION COMPLETE — READY FOR REVIEW

Tidak di-push. Tidak di-deploy. Tidak ada migration. Tidak ada penulisan ke basis
data produksi. Tidak ada panggilan Gemini. M7 belum di-commit, menunggu keputusan
acceptance reviewer. M8 belum dimulai.
