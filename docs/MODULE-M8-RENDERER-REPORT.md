# MODULE M8 — RENDERER PARITY

Laporan untuk ditinjau. Bukti diff verbatim: `docs/MODULE-M8-RENDERER-EVIDENCE.diff`.

```
Module JSON → renderer → dokumen yang guru lihat / unduh
```

> **Memuat KOREKSI TERARAH M8.1 — paritas `.docx` ditutup penuh.** Uraian §10a.

Renderer **bukan otoritas kedua**: ia menyajikan nilai yang sudah ada, tidak
memutuskan apa pun. `M8-B` dan `M8-R` menjaga itu secara deterministik.

---

## 1. Checkpoint M7

```
MODULE M7 ACCEPTED BASELINE COMMIT = bb06623
```

Lima berkas — 2.420 insertions. M7 suite 32/0 sebelum commit.

**Cleanup sebelum checkpoint:** tiga kalimat yang masih berbunyi *"wajib di
jangkar asesmen"* diluruskan menjadi *"wajib di jangkar FORMATIF"*. Ternyata
kalimat itu ada di **tiga** tempat, bukan satu: laporan M7 (§2), komentar
`contract.ts:264`, dan komentar `index.ts:404`. Dua yang terakhir lebih
merugikan — ia menyesatkan pembaca kode, bukan pembaca laporan. Hanya komentar;
nol perubahan logika, dan M7 tetap 32/0.

---

## 2. Arsitektur renderer

**Dua implementasi yang berdiri sendiri, bukan satu sumber HTML:**

| Jalur | Berkas | Keluaran |
|---|---|---|
| Pratinjau | `guru/js/rancang-chat.js` (`renderModulPreview`, 4.228 baris) | HTML di layar |
| Pengunduh | `guru/js/classroom-unduh.js` (1.192 baris) | `.docx` lewat pustaka `docx` dari CDN |

Keduanya membaca dokumen Modul langsung dan merangkainya sendiri. Tidak ada
lapisan bersama — dan keduanya sudah pernah menyalin tabel istilah dengan
tangan (komentar di `classroom-unduh.js:401`: *"disamakan dengan
ISTILAH_INSTRUMEN di rancang-chat.js"*). Itu pola yang mahal di repo ini.

**Tidak ada PDF/print terpisah:** guru mencetak dari `.docx`. Jadi jalur
keluarannya tepat dua, dan `M8-N` memakukan jumlah itu.

Pemetaan akar yang sudah ada di pratinjau: `identitas`, `kktp`, `konteks_murid`,
`rencana_asesmen`, `pertemuan`, `naskah_fasilitasi`, `instrumen_pembelajaran`,
`instrumen_asesmen`, `tindak_lanjut`, `catatan_guru`, `rancangan`,
`metadata_pedagogis`, `materi_esensial`. Fallback generik
(`renderGenerik`/`renderSisa`) hanya bekerja **di dalam isi instrumen**, bukan
di akar dokumen.

---

## 3. Gap yang direproduksi

Hitungan kemunculan nama field di kedua renderer, sebelum satu baris pun ditulis:

| Field | Milestone | Pratinjau | Pengunduh |
|---|---|---|---|
| `keputusan_ketercapaian` | M4 | **0** | **0** |
| `cakupan_bukti` | M4 | **0** | **0** |
| `tuntutan_ref` | M4 | **0** | **0** |
| `keputusan_kontekstual` | M6 | **0** | **0** |
| `komponen_terdampak` | M6 | **0** | **0** |
| `yang_diamati` | M7 | **0** | **0** |
| `putusan_lanjut` | M7 | **0** | **0** |
| `ambang_batas` | (lama) | 1 | 2 |

**Seluruh field yang M4–M7 tambahkan tidak muncul di satu renderer pun.**

Dan yang paling merugikan bukan sekadar hilangnya data: `ambang_batas`
(penjelasan manusiawi) **tampil**, sementara `keputusan_ketercapaian` (otoritas
keputusan runtime) **tidak**. Guru melihat kalimatnya dan kehilangan angka yang
dipakai memutuskan — persis pembalikan peran yang M8 larang.

Field-field ini **tidak** jatuh ke fallback generik; mereka hilang sepenuhnya,
karena fallback hanya berlaku di dalam isi instrumen.

### Yang ternyata SUDAH benar — tidak dikerjakan ulang

| Area | Keadaan |
|---|---|
| Naskah: field kosong → judul kosong | **sudah aman** — renderer memakai pola `arr.length ? … : ''` sejak sebelum M8 (reviewer test F) |
| Naskah: satu blok narasi raksasa | **tidak terjadi** — sudah per-sub_langkah dengan kelompok berlabel terpisah |
| Isi instrumen M5 | **sudah tersaji per jenis** lewat `renderKontenInstrumen` + jaring `renderGenerik`/`renderSisa` |

Untuk ketiganya M8 tidak menambah apa pun.

---

## 4. Perubahan per renderer

**Berkas baru `guru/js/modul-tampilan.js` — otoritas penyajian bersama.**

Alasannya bukan kerapian: dua renderer yang menyajikan field yang sama dengan
kode masing-masing akan menyimpang, dan repo ini sudah punya buktinya. Fungsinya
mengembalikan **data** (`{label, butir[]}`), bukan HTML — pratinjau merangkainya
menjadi HTML, pengunduh menjadi paragraf `.docx`, dan keduanya berangkat dari
kalimat yang sama.

| Fungsi | Peran |
|---|---|
| `kalimatKetercapaian(kktp)` | ambang M4 sebagai kalimat yang dapat dihitung |
| `kalimatPenjelasanAmbang(kktp)` | penjelasan manusiawinya |
| `kalimatCakupanBukti(entri)` | "bukti dikumpulkan per murid" |
| `blokPertimbanganKonteks(konten)` | jejak M6 dalam bentuk manusiawi |
| `blokNaskahTambahan(sl)` | amati + keputusan lanjut M7 |

Setiap fungsi mengembalikan `null`/`[]` ketika nilainya tidak ada — itulah yang
membuat dokumen lama tidak menghasilkan judul kosong.

| Renderer | Perubahan |
|---|---|
| `rancang-chat.js` | KKTP: ambang otoritas + penjelasan; formatif: cakupan bukti; bagian baru **C2. Pertimbangan Konteks**; Naskah: kelompok M7 |
| `classroom-unduh.js` | KKTP: ambang otoritas ikut tercetak; Naskah: kelompok M7 lewat `blokNaskah()`; **M8.1**: C2. Pertimbangan Konteks + cakupan bukti (formatif & penilaian akhir) |
| `classroom.html` | memuat `modul-tampilan.js` **sebelum** kedua renderer; `?v=` dinaikkan |
| `sw.js` | `CACHE_NAME` `miclass-v28` → `v29` |

Dua yang terakhir bukan formalitas — CLAUDE.md mencatat keduanya pernah
terlewat, dan guru yang offline mendapat kode lama. `M8-Q` menjaganya.

---

## 5. M4 — paritas asesmen

`keputusan_ketercapaian` kini tampil di **kedua** jalur, dengan bentuk kalimat
yang mengikuti jenisnya supaya tidak janggal:

```
jumlah      → "Tercapai bila minimal 4 simbol"
rubrik      → "Tercapai bila minimal level 3"
persentase  → "Tercapai bila minimal 75 persen dari 4 tahapan"
```

**Peran keduanya tidak dibalik.** `kalimatKetercapaian()` TIDAK pernah membaca
`ambang_batas`; `kalimatPenjelasanAmbang()` mengutamakan `deskripsi` terstruktur
dan jatuh ke `ambang_batas` hanya untuk dokumen lama (`M8-C`).

`cakupan_bukti` tampil di pratinjau sebagai kalimat, bukan kunci mentah.

**`tuntutan_ref` sengaja TIDAK ditampilkan.** ID seperti `T1`/`T2` adalah alamat
internal ke acuan CP; bagi guru ia tidak berarti apa-apa, dan menampilkannya
membuat dokumen terlihat seperti laporan audit. Rantainya tetap utuh di JSON dan
tetap dijaga M4. Dicatat di §14 sebagai keputusan sadar.

**Tidak ada ambang baru yang dihitung di renderer.** `M8-B` membuktikan angka
yang keluar adalah angka yang masuk; `M8-R` memindai sumbernya dan menolak
`Math.*`, pembulatan, atau aritmetika atas `nilai_minimum`.

---

## 6. M5 — paritas resource

**Tidak ada perubahan, dan itu kesimpulan audit — bukan kelalaian.** Isi
instrumen sudah disajikan per jenis oleh `renderKontenInstrumen`, dengan
`renderGenerik`/`renderSisa` sebagai jaring pengaman yang dipasang pada sesi
5 September 2026 justru untuk kasus ini. Soal tampil sebagai soal, dialog
sebagai dialog; tidak ada dump JSON.

Menambahkan lapisan kedua di atasnya akan menghasilkan dua penyaji untuk hal
yang sama — persis yang M8 larang.

---

## 7. M6 — paritas konteks

Bagian baru **"C2. Pertimbangan Konteks"** di pratinjau. Labelnya dipilih karena
guru memang melihatnya sebagai pertimbangan, bukan audit.

Yang **tidak** ditampilkan, sesuai arahan:

- **ID `KTX-01`** — guru tidak memerlukannya (`M8-E`);
- **alamat internal** `sub_langkah:P1.MEMAHAMI.1`, `kktp:K1`, `instrumen:PBL-01`.

Yang ditampilkan: label sumber manusiawi beserta nilai otoritasnya apa adanya
(`Kesiapan murid: jauh_di_bawah`), keputusannya, penerapannya, dan — dari
`komponen_terdampak` — hanya nomor pertemuan dalam bentuk "Pertemuan 1", karena
itulah satu-satunya bagian yang berguna bagi guru.

Nilai otoritas tidak diubah; hanya labelnya yang dimanusiakan.

---

## 8. M7 — paritas Naskah

Kelompok baru di **kedua** jalur, mengikuti urutan Modul yang sudah ada:

```
Aksi Guru → Ucapan Guru → Pertanyaan Kunci → Jika Kesulitan
          → Yang Diamati → Jika Tercapai → Jika Belum
```

Aturan yang dijaga:

- **hanya yang berisi yang muncul** (`M8-J`) — tidak ada judul kosong;
- `say`/`ask` tetap opsional, tidak dipaksa muncul;
- **SUMATIF tanpa `putusan_lanjut` tidak terlihat rusak** (`M8-I`): bagiannya
  sekadar tidak ada, bukan muncul kosong atau bertanda hilang. Ini konsekuensi
  langsung M7.1 dan harus benar di renderer, bukan hanya di validator;
- tidak ada timeline kedua — renderer tidak menambahkan durasi apa pun;
- daftar bersarang tidak hilang (`M8-G`).

---

## 9. Kompatibilitas historis

`M8-K` menjalankan kelima fixture produksi melalui seluruh fungsi penyajian:

- tidak crash;
- `keputusan_kontekstual` tidak ada → bagian konteks **tidak muncul**, bukan
  muncul kosong;
- naskah pra-M7 → nol kelompok M7;
- tidak satu pun keluaran memuat `undefined`, `null`, atau `[object Object]`.

`M8-L` menambah masukan rusak (`null`, `0`, `''`, `[]`, string, objek setengah)
dan menuntut `null`/`[]`, bukan pengecualian. `M8-M` menjaga sumber `[object
Object]` yang sebenarnya: nilai bukan-string ditolak, bukan dirangkai paksa.

Dokumen lama tetap dapat dibaca dan diunduh seperti sebelumnya.

---

## 10. Paritas pratinjau / unduh

`M8-N` memakukan bahwa jalurnya tepat dua dan **keduanya** memanggil otoritas
penyajian bersama. `M8-O` memeriksa per-fungsi, bukan per-nama-field mentah —
itulah yang membuat keduanya mustahil menyimpang diam-diam:

| | Pratinjau | Pengunduh |
|---|---|---|
| `kalimatKetercapaian` (M4) | ✅ | ✅ |
| `blokNaskahTambahan` (M7) | ✅ | ✅ |
| `blokPertimbanganKonteks` (M6) | ✅ | ✅ (M8.1) |
| `kalimatCakupanBukti` (M4) | ✅ | ✅ (M8.1) |

**Paritas penuh sejak M8.1** — lihat §10a.

`M8-P` menjaga urutan muat: otoritas wajib dimuat sebelum kedua renderer, kalau
tidak `window.ModulTampilan` belum ada saat renderer berjalan.

---

## 10a. KOREKSI TERARAH M8.1 — dua jalur `.docx` yang tertinggal

### Akar masalah

M8 memasang otoritas penyajian bersama, tetapi hanya DUA dari empat fungsinya
dipanggil `.docx`. Akibatnya guru **melihat** Pertimbangan Konteks dan cakupan
bukti di layar, lalu **kehilangannya** di berkas yang ia cetak — dan berkas itulah
yang ia bawa ke kelas.

Alasan yang saya berikan waktu itu adalah penomoran bab. Itu alasan yang salah:
data otoritas lebih penting daripada kenyamanan mempertahankan nomor. Dan
ternyata penomorannya sama sekali tidak perlu bergeser.

### Bagaimana `blokPertimbanganKonteks()` masuk ke `.docx`

Lewat fungsi lingkup modul `blokKonteksDocx(children, konten, D, MT)` di
`classroom-unduh.js`, sejajar dengan `blokNaskah()` yang sudah ada. Ia memanggil
otoritas bersama dan merangkai hasilnya menjadi paragraf:

```
C2. Pertimbangan Konteks          (subLabel)
  Kesiapan murid: jauh_di_bawah   (tebal)
  <keputusan>
  <penerapan>
  Terlihat pada: Pertemuan 1      (abu-abu, kecil)
```

**Tidak ada logika penyajian kedua.** Label manusiawi, penyaringan alamat
internal, dan bentuk "Pertemuan 1" seluruhnya berasal dari
`blokPertimbanganKonteks()` yang sama dengan pratinjau. `M8-S` membuktikan
`KTX-01`, `sub_langkah:`, dan `kktp:K1` tetap tidak bocor ke dokumen cetak.

### Bagaimana `kalimatCakupanBukti()` masuk ke `.docx`

Lewat `barisCakupanDocx(children, entri, D, MT)`, dipanggil di **dua** tempat di
bab F: pada setiap entri formatif dan pada penilaian akhir. Ia diam ketika
dokumennya tidak menyatakan cakupan — tidak ada kalimat yang dikarang (`M8-V`).

### Perubahan tata letak: NOL bab bergeser

"C2. Pertimbangan Konteks" disisipkan sebagai **subbagian** tepat sebelum bab D,
memakai `subLabel()` — bukan `sectionHeading()`. Penomoran A–I utuh seluruhnya,
dan labelnya sama persis dengan pratinjau. `M8-W` memakukan keduanya: posisi
sebelum bab D, dan kesembilan bab masih ada.

### `M8-O` diubah — dan itu memang harus

Versi sebelumnya **mendokumentasikan** bahwa dua fungsi belum dipakai `.docx`.
Dokumentasi bukan gerbang. Sekarang ia menuntut keempatnya di kedua renderer,
dengan dua penajaman yang lahir dari uji negatif:

1. **Daftarnya diturunkan dari ekspor otoritas yang sebenarnya**, bukan ditulis
   tangan — daftar hardcoded dapat menyatakan paritas atas fungsi yang sudah
   tidak ada.
2. **Komentar dibuang, dan yang dituntut posisi PEMANGGILAN** (`fn(` atau
   `fn?.(`). Uji negatif menunjukkan dua cara gerbang ini dapat dipuaskan palsu:
   nama yang muncul di komentar kepala, dan nama yang muncul di penjaga
   `typeof MT.fn !== 'function'`. Keduanya kini tidak cukup.

### Uji negatif — gerbangnya benar-benar menggigit

Dengan pemanggilan `blokPertimbanganKonteks` dihapus dari badan `.docx`:

```
M8-O  FAILED   keempat fungsi dipakai di kedua renderer
M8-S  FAILED   .docx benar-benar menghasilkan paragraf
M8-W  FAILED   dipanggil dari badan dokumen
FAILED | 20 passed | 3 failed
```

Dipulihkan → 23/23. Gerbang yang tidak dapat gagal tidak membuktikan apa pun;
ketiganya gagal dari sudut yang berbeda.

### Keluarannya DIJALANKAN, bukan dibaca namanya

Reviewer meminta bukti keluarannya dipakai, bukan sekadar nama fungsi muncul.
Karena itu kedua jalur `.docx` sengaja berupa fungsi lingkup modul: uji mengambil
sumbernya, menjalankannya dengan `docx` tiruan, dan menghitung paragraf yang
benar-benar dihasilkan (`M8-S`, `M8-U`). `M8-T` dan `M8-V` menjalankan hal yang
sama atas kelima fixture produksi dan menuntut **nol** paragraf.

---

## 11. Uji deterministik

`tests/modul-tampilan.test.ts` — **23 passed / 0 failed**. Tanpa panggilan model,
tanpa DOM, tanpa uji piksel.

| Reviewer minta | Uji |
|---|---|
| **A.** M4 renderer | `M8-A`, `M8-B`, `M8-C` |
| **B.** formative renderer | `M8-C` (cakupan bukti), `M8-G`, `M8-H` |
| **C.** resource renderer | audit §6 — sudah ada sebelum M8, tidak diubah |
| **D.** context decision renderer | `M8-D`, `M8-E`, `M8-F` |
| **E.** Naskah `do` | sudah ada sebelum M8; `M8-O` menjaga jalurnya |
| **F.** say/ask opsional → tanpa judul kosong | `M8-J` |
| **G.** Naskah `observe` | `M8-G` |
| **H.** Naskah decide-next | `M8-H` |
| **I.** SUMATIF exemption | `M8-I` |
| **J.** historis tanpa `undefined`/`[object Object]` | `M8-K`, `M8-L`, `M8-M` |
| **K.** tidak ada data loss | `M8-O` |
| **L.** paritas ekspor | `M8-N`, `M8-O`, `M8-P` |
| **M8.1 A.** jalur konteks `.docx` dijalankan | `M8-S`, `M8-W` |
| **M8.1 B.** jalur cakupan bukti `.docx` dijalankan | `M8-U`, `M8-W` |
| **M8.1 C.** konteks historis kosong → tanpa judul kosong | `M8-T` |
| **M8.1 D.** cakupan opsional → tanpa kalimat palsu | `M8-V` |
| **M8.1 E.** gerbang paritas empat fungsi × dua renderer | `M8-O` |

Otoritas penyajian dimuat dari **sumber yang benar-benar dikirim ke peramban**
(IIFE dijalankan atas sandbox), bukan disalin ke harness.

---

## 12. Regresi

| Suite | Sebelum | Sesudah |
|---|---|---|
| ATP `atp-kontrak` + sync + trace | 60/0, LULUS, LULUS | **sama** |
| M1 `modul-anchor` | 29/0 | **29/0** |
| M2 `modul-warisan` | 41/0 | **41/0** |
| M3 `modul-contract` | 34/0 | **34/0** |
| M4 `modul-assessment` | 61/0 | **61/0** |
| M5 `modul-resource` | 41/0 | **41/0** |
| M6 `modul-kausalitas` | 29/0 | **29/0** |
| M7 `modul-naskah` | 32/0 | **32/0** |
| M8 `modul-tampilan` | 18/0 | **23/0** |
| `deno check` EF | hijau | **hijau** |
| Sintaks 4 berkas frontend | — | **OK** |

Tidak ada kontrak M1–M7 yang diubah, dan tidak ada uji milestone lama yang perlu
disesuaikan. Fixture historis tetap `tp02=0 tp03=0 tp04=0 tp05=1 tp06=1`.

Tidak ada migration.

---

## 13. Berkas yang berubah

| Berkas | Peran |
|---|---|
| `guru/js/modul-tampilan.js` | **BARU** — otoritas penyajian bersama |
| `guru/js/rancang-chat.js` | KKTP ambang, cakupan bukti, bagian C2, kelompok Naskah M7 |
| `guru/js/classroom-unduh.js` | KKTP ambang, kelompok Naskah M7; **M8.1**: `blokKonteksDocx()` + `barisCakupanDocx()` |
| `guru/classroom.html` | memuat otoritas sebelum kedua renderer; `?v=` dinaikkan |
| `sw.js` | `CACHE_NAME` → `miclass-v29` |
| `tests/modul-tampilan.test.ts` | **BARU** — 23 uji (termasuk 5 uji M8.1) |
| `docs/MODULE-M8-RENDERER-EVIDENCE.diff` | **BARU** |
| `docs/MODULE-M8-RENDERER-REPORT.md` | **BARU** |

---

## 14. Celah M8 yang tersisa

~~**Pengunduh `.docx` belum menampilkan Pertimbangan Konteks dan cakupan
bukti.**~~ **DITUTUP di M8.1** — §10a. Keempat fungsi otoritas kini dipanggil di
kedua renderer, dan gerbangnya terbukti menggigit lewat uji negatif.

1. **`tuntutan_ref` tidak ditampilkan** (§5) — keputusan sadar. Kalau reviewer
   menghendaki guru melihat tuntutan CP, bentuk yang berguna adalah **teksnya**
   (`tp_anchor.tuntutan[].kompetensi`), bukan ID-nya; itu pekerjaan tersendiri.
2. **Mutu visual tidak diuji.** Yang dibuktikan: nilai ada, berlabel, berurutan,
   tidak bocor, tidak sampah. Apakah tata letaknya nyaman di layar HP tidak dapat
   dibuktikan deterministik, dan menebaknya dengan ambang karakter akan menjadi
   angka sembarang.
3. **Belum dijalankan di peramban sungguhan.** Uji M8 memanggil fungsi penyajian
   langsung dari sumbernya, dan sintaks ketiga berkas frontend diperiksa — tetapi
   `renderModulPreview` sendiri tidak dieksekusi dengan DOM. Risiko yang tersisa
   adalah kesalahan perangkaian di dalam renderer, bukan di otoritas penyajian.
   Satu kali membuka Tab Rancang akan menutup celah ini; pelajaran `deno check`
   di CLAUDE.md menunjukkan kesalahan semacam itu muncul sebagai kegagalan yang
   menyamar.
4. **Berkas `.docx` sungguhan tidak dibangun.** Kedua jalur barunya DIJALANKAN
   dengan `docx` tiruan dan paragrafnya dihitung (`M8-S`, `M8-U`), tetapi
   pustaka `docx` asli dimuat dari CDN saat runtime sehingga berkas akhirnya
   tidak dirakit di dalam uji. Yang tersisa adalah risiko pada perakitan
   dokumen, bukan pada isi yang dihasilkan.

---

# MODULE M8 — TARGETED CORRECTION COMPLETE — READY FOR REVIEW

Tidak di-push. Tidak di-deploy. Tidak ada migration. Tidak ada penulisan ke basis
data produksi. Tidak ada panggilan Gemini. M8 belum di-commit, menunggu keputusan
acceptance reviewer. M9 belum dimulai.
