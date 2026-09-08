# Daftar Pertanyaan Tab Rancang — untuk pemeriksaan Romo

> Dibangun langsung dari `guru/js/rancang-chat-flow.js`, 5 September 2026.
> Kolom **Sampai ke AI?** ditelusuri ke `generate-atp/index.ts` dan `generate-modul/index.ts`.
>
> **63 pertanyaan** — 46 di jalur ATP, 17 di jalur Modul Ajar.
> Yang punya kolom "Muncul kalau" bersifat kondisional: guru tidak selalu melihatnya.
>
> **Direkonsiliasi 7 September 2026 pada HEAD `af3f32b`** (`rancang-chat-flow.js`,
> 517 baris). Daftar ini semula ditulis dari keadaan *sebelum* `696c415` — padahal
> commit yang sama juga mengubah alurnya. Tiga koreksi: fase A4 kini dibuka
> pertanyaan tingkat kemampuan awal tanpa syarat, pertanyaan "Apa yang dilakukan
> dengan instrumen pemetaan?" sudah dibuang, dan fase B3 bertambah pertanyaan
> perlengkapan kelas. Jumlah jalur ATP kebetulan tetap 46 karena satu masuk dan
> satu keluar.

---

# BAGIAN A — JALUR ATP (46 pertanyaan, 9 fase)

## A1. KONTEKS_CP — 4 pertanyaan

| # | Pertanyaan | Pilihan | Muncul kalau |
|---|---|---|---|
| 1 | MiClass menemukan data kelas dan CP berikut … Apakah pemahaman ini sudah benar? | Ya, sudah benar / Tidak, program keahlian perlu dikoreksi | selalu |
| 2 | Pilih program keahlian kelas ini | 50 program keahlian + "tidak ada di daftar" | jawaban 1 = Tidak |
| 3 | Tuliskan nama program keahlian kelas ini | teks bebas | jawaban 2 = tidak ada di daftar |
| 4 | Apakah Capaian Pembelajaran yang akan digunakan sudah sesuai? | Ya, CP sudah sesuai / Lihat ringkasan isi CP dulu / CP yang muncul bukan yang saya gunakan | selalu |

**Sampai ke AI?** Hanya `program_keahlian`. Sisanya gerbang konfirmasi.

## A2. PRIORITAS — 4 pertanyaan

| # | Pertanyaan | Pilihan | Muncul kalau |
|---|---|---|---|
| 5 | Apa prioritas utama siswa selama fase ini? Pilih maksimal tiga. | Fondasi TKA / Kesiapan dunia kerja / Kesiapan PKL / Kesiapan sertifikasi / Melanjutkan pendidikan / Literasi & numerasi fungsional / Target khusus sekolah / Tidak ada / Rekomendasi | selalu |
| 6 | Bagaimana fondasi TKA ditempatkan dalam ATP ini? | Selama fase ini / Lintas fase / Target waktu lain / Rekomendasi | pilih "Fondasi TKA" |
| 7 | Tuliskan target waktu untuk fondasi TKA | teks bebas | jawaban 6 = target waktu lain |
| 8 | Tuliskan target khusus sekolah yang perlu diperhatikan | teks bebas | pilih "Target khusus sekolah" |

**Sampai ke AI?** Seluruh fase dikirim sebagai `prioritas`.

## A3. WAKTU — 16 pertanyaan

| # | Pertanyaan | Pilihan / rentang | Muncul kalau |
|---|---|---|---|
| 9 | Berapa JP mata pelajaran ini per minggu? | 1–20 | selalu |
| 10 | Berapa durasi satu JP di sekolah Anda? | 45 / 40 / 35 menit / lainnya | selalu |
| 11 | Berapa menit durasi satu JP? | 30–60 | jawaban 10 = lainnya |
| 12 | ATP ini digunakan untuk tahun pelajaran berapa? | 2026/2027 / 2027/2028 / lainnya | selalu |
| 13 | Tuliskan tahun pelajaran yang digunakan | teks bebas | jawaban 12 = lainnya |
| 14 | Bagaimana minggu efektif ditentukan? | Isi sendiri / Dari kalender dinas / Asumsi 36 minggu | selalu |
| 15 | Berapa minggu efektif semester pertama? | 10–22 | jawaban 14 ≠ asumsi 36 |
| 16 | Berapa minggu efektif semester kedua? | 10–22 | jawaban 14 ≠ asumsi 36 |
| 17 | Apakah minggu efektif sudah mengurangi kegiatan khusus sekolah? | Sudah / Belum / Belum diketahui | selalu |
| 18 | Kegiatan apa yang masih mengurangi pembelajaran? | PKL / Projek / Ujian tambahan / Kegiatan program keahlian / Libur khusus / Lainnya / Belum diketahui / Tidak ada | jawaban 17 = Belum |
| 19 | **Berapa total JP untuk kegiatan khusus tersebut?** | **0–200** | jawaban 17 = Belum |
| 20 | Berapa cadangan untuk gangguan tak terduga? | 0 / 1 / 2 / 3 minggu / tentukan sendiri / rekomendasi | selalu |
| 21 | Berapa minggu cadangan yang Anda tentukan? | 0–10 | jawaban 20 = tentukan sendiri |
| 22 | Bagaimana pola JP dalam satu minggu? | Seluruh JP satu pertemuan / Dibagi beberapa pertemuan / Sistem blok | selalu |
| 23 | Berapa JP dalam satu pertemuan atau sesi? | 1–12 | jawaban 22 = dibagi / blok |
| 24 | Perhitungan waktu deterministik … sudah sesuai? | Ya, gunakan / Ubah data waktu | selalu |

**Sampai ke AI?** Bukan jawabannya, melainkan **tiga angka turunan**: `jp_operasional`,
`jp_per_pertemuan`, `pola_jadwal`. Jawaban mentah lainnya tidak dikirim.

## A4. PROFIL_SISWA — 8 pertanyaan

| # | Pertanyaan | Pilihan | Muncul kalau |
|---|---|---|---|
| 25 | **Dibandingkan kemampuan yang diharapkan di awal fase ini, di mana murid Anda sekarang?** | Sudah sesuai / Sedikit di bawah / Jauh di bawah / Sangat beragam | **selalu** |
| 26 | Apakah data kemampuan awal siswa tersedia? | Ya sudah punya / Ada sebagian / Belum ada sama sekali | selalu |
| 27 | Bagaimana titik awal kemampuan siswa ditentukan? | Buat soal pemetaan / Observasi / Isi sendiri dari pengalaman / Anggap sesuai CP / Data simulasi / Rekomendasi | **jawaban 26 = Belum ada** |
| 28 | Bagaimana Anda menggambarkan kemampuan awal siswa saat ini? | teks bebas | **jawaban 27 = Isi sendiri** |
| 29 | Bagaimana pemetaan awal dilakukan? | Tes singkat / Observasi awal / Tugas pemetaan / Gabungan / Rekomendasi | **jawaban 27 = Buat soal** |
| 30 | Berapa JP yang digunakan untuk pemetaan awal? | 1–12 | **jawaban 27 = Buat soal** |
| 31 | Bagaimana kesulitan siswa yang perlu diantisipasi ditentukan? | Perkiraan umum / Isi sendiri / Belum diketahui / Rekomendasi | selalu |
| 32 | Tuliskan kesulitan yang Anda perkirakan | teks bebas | jawaban 31 = Isi sendiri |

**Sampai ke AI?** Seluruh fase dikirim sebagai `profil_siswa` — termasuk #25,
karena `generate-atp/index.ts:372` meneruskan seluruh fase apa adanya
(`unwrapPhaseData(cd.PROFIL_SISWA)`), bukan memilih kolom satu per satu.

> Urutannya sengaja: **penilaian dulu, bukti kemudian.** #25 ditanyakan tanpa
> syarat sejak `696c415`, sehingga guru yang sudah punya data pun punya tempat
> menyatakan muridnya jauh tertinggal. Yang masih tertutup bagi jawaban "Ya, saya
> sudah punya data" dan "Ada sebagian data" pada #26 adalah #27–#30 — empat
> pertanyaan tentang *cara mengukur*, yang memang hanya relevan bila datanya
> belum ada. Lihat Catatan 1.
>
> Pertanyaan lama "Apa yang dilakukan dengan instrumen pemetaan?" sudah dibuang
> di `696c415` (keputusan Romo 5 September 2026): satu opsinya menjanjikan soal
> yang tidak ada mesin pembuatnya, dua opsi sisanya efeknya identik.

## A5. TARGET_FASE — 5 pertanyaan

| # | Pertanyaan | Pilihan | Muncul kalau |
|---|---|---|---|
| 33 | Bagaimana target akhir fase ditentukan? | Rekomendasi dari CP & profil / Masukkan target sendiri | selalu |
| 34 | Tuliskan target akhir fase yang ingin digunakan | teks bebas | jawaban 33 = target sendiri |
| 35 | Elemen mana yang perlu mendapat penguatan lebih besar? | Seimbang / Menyimak–Berbicara / Membaca–Memirsa / Menulis–Mempresentasikan / Setelah pemetaan / Rekomendasi | selalu |
| 36 | Di akhir fase ini, kemandirian seperti apa yang ingin dicapai? | Masih butuh contoh dan panduan / Mandiri dengan sedikit bantuan / Mandiri di situasi yang pernah dilatih / Mandiri di situasi baru / Rekomendasi | selalu |
| 37 | Ringkasan target fase … sudah sesuai? | Ya / Ubah target fase | selalu |

**Sampai ke AI?** Seluruh fase dikirim sebagai `target_fase_detail`.

## A6. KONTEKS_DUDI — 5 pertanyaan

| # | Pertanyaan | Pilihan | Muncul kalau |
|---|---|---|---|
| 38 | Seberapa kuat konteks program keahlian digunakan dalam ATP? | Seimbang / Dominan kejuruan / Hanya bagian relevan / Tidak diprioritaskan / Rekomendasi | selalu |
| 39 | Keterampilan dunia kerja apa yang ingin dikaitkan? (maks 5) | K3 / Komunikasi profesional / Kerja tim / Pelayanan pelanggan / Dokumentasi / Literasi digital / Pemecahan masalah / Mutu / Etika kerja / Kewirausahaan / Data / Tidak ada / Rekomendasi | jawaban 38 ≠ Tidak diprioritaskan |
| 40 | Hal apa dari dunia kerja yang perlu masuk ke pelajaran ini? | Kosakata lapangan / Dokumen kerja / Prosedur kerja / Teknologi lapangan / Komunikasi / Etika & kerahasiaan / Tidak ada / Rekomendasi | jawaban 38 ≠ Tidak diprioritaskan |
| 41 | Batas apa yang diterapkan saat menggunakan konteks kejuruan? | Tanpa batas / Hindari materi produktif yang belum dipelajari / Hindari data sensitif / Hanya sebagai contoh / Bukan target produktif / Rekomendasi | jawaban 38 ≠ Tidak diprioritaskan |
| 42 | Ringkasan konteks kejuruan … sudah sesuai? | Ya / Ubah konteks kejuruan | jawaban 38 ≠ Tidak diprioritaskan |

**Sampai ke AI?** Seluruh fase dikirim sebagai `konteks_dudi`.

## A7. PENGUATAN_PRASYARAT — 2 pertanyaan

| # | Pertanyaan | Pilihan | Muncul kalau |
|---|---|---|---|
| 43 | Apakah ada kemampuan dasar yang perlu diulang sebelum masuk materi baru? | Di awal semester / Saat mengajar / Keduanya / Tidak perlu / Rekomendasi | selalu |
| 44 | **Berapa JP yang digunakan untuk penguatan awal?** | **1–24** | jawaban 43 = Di awal / Keduanya |

**Sampai ke AI?** Seluruh fase dikirim sebagai `penguatan_prasyarat`. Lihat Catatan 2.

## A8. ATP_SUMMARY & ATP_REVIEW — 2 pertanyaan

| # | Pertanyaan | Pilihan |
|---|---|---|
| 45 | Pratinjau arah ATP … sudah sesuai? | Ya, buat draf ATP / Ubah prioritas / Ubah alokasi waktu / Ubah profil siswa / Ubah target fase / Ubah konteks kejuruan / Ubah pengulangan kemampuan dasar |
| 46 | Bagaimana draf ATP ingin ditindaklanjuti? | Terima ATP ini / Tinjau distribusi waktu / Buat ulang ATP / Ubah prioritas / Ubah target fase |

---

# BAGIAN B — JALUR MODUL AJAR (17 pertanyaan, 5 fase)

## B1. PILIH_TP — 1 pertanyaan

| # | Pertanyaan | Rentang |
|---|---|---|
| 47 | Berapa pertemuan yang akan digunakan untuk TP ini? | 1–30 |

> Lihat Catatan 3 — jawaban ini diabaikan bila ATP sudah punya distribusi pertemuan.

## B2. KONTEKS_MODUL — 6 pertanyaan

| # | Pertanyaan | Pilihan | Muncul kalau |
|---|---|---|---|
| 48 | Modul Ajar ini akan dibuat untuk … Sudah benar? | Ya, lanjutkan / Tidak, program keahlian perlu dikoreksi | selalu |
| 49 | Pilih program keahlian kelas ini | 50 program + "tidak ada di daftar" | jawaban 48 = Tidak |
| 50 | Tuliskan nama program keahlian kelas ini | teks bebas | jawaban 49 = tidak ada |
| 51 | **Murid di kelas ini…** | Punya kemampuan yang mirip-mirip / Ada yang sudah lancar, ada yang masih kesulitan / Ada yang butuh pendampingan khusus / Sebagian sedang PKL | selalu |
| 52 | Berapa murid di kelas ini? | 10–60 | selalu |
| 53 | Target kompetensi utama modul ini? | Pemahaman konsep / Keterampilan praktis / Sikap atau karakter / Terpadu / Rekomendasi | selalu |

## B3. SUMBER_STRATEGI — 4 pertanyaan

| # | Pertanyaan | Pilihan | Muncul kalau |
|---|---|---|---|
| 54 | Sumber belajar apa yang digunakan? Pilih semua yang sesuai. | Buku teks / Modul digital / Video pembelajaran / Artikel atau bacaan pendek / Lingkungan sekitar atau dunia kerja / Sumber lain | selalu |
| 55 | Sumber lain apa yang akan digunakan? | teks bebas | pilih "Sumber lain" |
| 56 | **Perlengkapan apa yang benar-benar tersedia di kelas ini? Pilih semua yang ada.** | Proyektor / Laptop guru / Komputer murid / HP murid / Internet andal / Speaker / Lab atau bengkel / Printer / Tidak ada — hanya papan tulis | **selalu** |
| 57 | **Strategi pembelajaran utama yang digunakan?** | Guru menjelaskan, murid berlatih (langsung) / Murid mengerjakan proyek konkret (berbasis proyek) / Murid menemukan sendiri (inkuiri) / Murid memecahkan masalah nyata (berbasis masalah) / Murid belajar di konteks industri (kontekstual) / Rekomendasi | selalu |

> #56 ditambahkan di `696c415`: izin perangkat digital tadinya
> **disimpulkan** dari centang sumber belajar — video dicentang berarti internet
> diandaikan stabil. Sekarang guru ditanya apa yang benar-benar ada, dan modul
> hanya boleh menyebut alat di daftar itu. Ini pertanyaan Modul, bukan ATP;
> lihat juga catatan "perlengkapan kelas per modul" di CLAUDE.md §23.3 — guru
> dengan 6 modul masih menjawabnya 6 kali.

## B4. ASESMEN_MODUL — 5 pertanyaan

| # | Pertanyaan | Pilihan | Muncul kalau |
|---|---|---|---|
| 58 | Apakah modul ini perlu memetakan kemampuan awal murid sebelum pembelajaran dimulai? | Ya / Lewati | selalu |
| 59 | Bagaimana cara mengetahui kemampuan awal murid? | Pemetaan awal (angket/soal singkat) / Tanya jawab lisan / Observasi tugas pembuka / Rekomendasi | jawaban 58 = Ya |
| 60 | Apakah guru ingin mengecek pemahaman murid selama proses belajar? | Ya / Lewati | selalu |
| 61 | Apakah modul ini diakhiri dengan penilaian hasil belajar? | Ya / Lewati | selalu |
| 62 | Bagaimana bentuk penilaian akhir murid? | Tes tertulis / Unjuk kerja / Proyek atau produk / Praktikum / Presentasi / Rekomendasi | jawaban 61 = Ya |

> Diagnostik (#59) dan sumatif (#62) punya pertanyaan teknik; **formatif (#60)
> tidak** — MiClass yang menentukan sendiri tekniknya. Lihat Catatan 4.

## B5. MODUL_SUMMARY — 1 pertanyaan

| # | Pertanyaan | Pilihan |
|---|---|---|
| 63 | Ringkasan Modul Ajar siap disusun. Apakah data modul sudah sesuai? | Ya, buat Modul Ajar / Ubah kondisi kelas / Ubah sumber & strategi / Ubah asesmen |

**Sampai ke AI?** Seluruh `collected_data` Modul dikirim utuh ke Fase A, ditambah
jumlah murid, jumlah pertemuan, JP per pertemuan, durasi JP, elemen CP, dan daftar KKTP.

---

# CATATAN — pengamatan saat menyusun daftar ini

Ini pengamatan, **bukan daftar pekerjaan.** Yang layak dikerjakan adalah keputusan
terpisah.

> **Rekonsiliasi 8 September 2026 (HEAD `649f616`).** Seluruh isi tabel ini
> ditelusuri ulang ke kode aktual pada tanggal ini.
>
> | | Catatan | Status |
> |---|---|---|
> | 1 | Kemampuan awal hanya bisa dijelaskan guru yang mengaku tidak punya data | **SELESAI** `696c415`; jalur "sebagian data" ditutup `b522640` |
> | 2 | JP pemetaan dan JP penguatan tidak dipesan dari anggaran | **SELESAI** `696c415` |
> | 3 | #47 diabaikan bila ATP sudah punya distribusi pertemuan | **SELESAI** `fb62f0f`; kode matinya dibuang `b522640` |
> | 4 | Asesmen formatif tidak punya pertanyaan teknik | **SELESAI** `c14d8ab` — ternyata lebih besar dari rumusannya: instrumen tidak pernah dipilih guru untuk KETIGA jenis asesmen, bukan hanya teknik formatif |
> | 5 | Kunci opsi tidak selalu cocok dengan labelnya | **SELESAI** `3505493` |
> | 6 | ATP tidak pernah menanyakan jumlah murid | **SEBAGIAN.** Pertanyaannya kini ada dan jawabannya sampai ke `collected_data.PROFIL_KELAS`, tapi `generate-atp` masih nol menyebut `jumlah_murid`. Sisanya pertanyaan produk — lihat Catatan 6 |
> | 7 | Menu revisi menyusut setelah draf ATP tampil | **SELESAI** `b522640` — tiga rute dikembalikan, ditambah pecah/gabung jumlah TP `8397027` |
> | 8 | Tuas JP penguatan bisa tercabut diam-diam | **SELESAI** `b522640` |
>
> **Tinggal Catatan 6, dan hanya separuhnya.** Selebihnya tertutup dan
> terverifikasi di produksi — buktinya di `docs/SPEC-REVISI-ALUR-PERTANYAAN.md` §12.
>
> Catatan 7 dan 8 ditambahkan saat rekonsiliasi — keduanya sudah terdokumentasi
> di tempat lain (CLAUDE.md §23.3 dan `BACKLOG-GO-LIVE-RANCANG.md` §4b) tapi
> tidak pernah masuk daftar ini. Itulah sebab angka "tujuh inkonsistensi" di
> CLAUDE.md tidak pernah cocok dengan enam Catatan di sini.

### Catatan 1 — kemampuan awal hanya bisa dijelaskan oleh guru yang mengaku tidak punya data — **SELESAI `696c415`**

Semula seluruh pertanyaan lanjutan fase ini bergantung pada "Belum ada data sama
sekali". Guru yang menjawab "Ya, saya sudah punya data" — yang justru paling tahu
keadaan muridnya — tidak pernah ditanya isi data itu, dan tidak punya tempat
menuliskan bahwa muridnya jauh tertinggal.

**Bukti selesai** — `guru/js/rancang-chat-flow.js:180-185`: `tingkat_kemampuan_awal`
ditulis **tanpa** `condition`, dan diletakkan sebelum `status_data_awal`
(baris 186). Empat opsinya termasuk "Jauh di bawah" dan "Sangat beragam".
Jawabannya sampai ke AI lewat `generate-atp/index.ts:372` yang meneruskan seluruh
`PROFIL_SISWA` sebagai `profil_siswa` — jadi pertanyaannya tidak sekadar
ditambahkan, tapi memang terbaca.

**Sisa yang belum tertutup:** jalur "Ada sebagian data" (#26 = `sebagian`) tetap
tidak punya lanjutan sendiri — ia melewati #27–#30 persis seperti "Ya, saya sudah
punya data", lalu langsung ke #31. Guru yang punya sebagian data tidak punya
tempat menyebutkan bagian mana yang ada. Ini yang selama ini disebut "jalan buntu
Ada sebagian data" di CLAUDE.md; setelah #25 ada, ia tidak lagi jalan buntu
(guru sudah menyatakan tingkat kemampuannya), tapi juga belum ditangani.

### Catatan 2 — JP pemetaan dan JP penguatan tidak dipesan dari anggaran — **SELESAI `696c415`**

Keduanya (#30 dan #44) dikirim ke AI sebagai keterangan, tapi **tidak dikurangkan
dari total JP**. AI diberi tahu guru ingin 3 JP penguatan, lalu diperintah menyusun
TP yang jumlahnya persis sama dengan seluruh JP tersedia. Akibatnya TP mengisi 100%
waktu dan penguatan itu tidak punya tempat.

Bertentangan dengan helpText #30 yang berbunyi: *"JP pemetaan diambil dari JP
efektif yang tersedia — bukan tambahan."*

Bukti lama: ATP `829b4e22` menjawab 3 JP penguatan; `WAKTU.perhitungan.jp_prasyarat`
tersimpan 0.

**Bukti selesai** — `guru/js/rancang-chat.js:1478`, di dalam `calculateAllocation()`:

```js
const mentah = Math.max(0, kalender - kegiatan - cadangan - pemetaan - prasyarat);
```

Keduanya dibaca di baris 1462–1463 dan sekarang benar-benar dikurangkan sebelum
`jp_operasional` dibulatkan ke kelipatan satuan pertemuan (baris 1479–1480).
Keduanya juga ikut dikembalikan sebagai `jp_pemetaan` dan `jp_prasyarat`
(baris 1483–1484), jadi angkanya terbaca di ringkasan yang dilihat guru.

### Catatan 3 — pertanyaan #47 — **SUDAH DITANGANI `fb62f0f`, tapi bangkainya tertinggal**

*Dikoreksi 7 September 2026 setelah alur Modul dijalankan sungguhan di produksi.
Rekonsiliasi sebelumnya salah membiarkan catatan ini terbuka: ia hanya
membaca `generate-modul`, tidak menelusuri apakah pertanyaannya masih
ditanyakan ke guru.*

Rumusan lama: "guru ditanya sesuatu yang jawabannya dibuang." **Itu tidak lagi
benar — guru tidak ditanya sama sekali.** `fb62f0f` (31 Agustus 2026,
"hapus PILIH_TP — jumlah pertemuan otomatis dari ATP") memotong pertanyaannya
dari alur. Saat guru memilih TP, `rancang-chat.js:1169-1181` mengisi jawabannya
sendiri dari distribusi ATP lalu langsung melompat ke fase berikutnya:

```js
const pertemuan  = Array.isArray(tp.jp_pertemuan) ? tp.jp_pertemuan : [];
const nPertemuan = pertemuan.length || 1;
const jumlahAnswer = { value: String(nPertemuan), source: 'otomatis', confirmed: true };
_chat.collected_answers.jumlah_pertemuan = jumlahAnswer;
await persistModulPhase('PILIH_TP');
await startPhase('KONTEKS_MODUL');
```

Diamati langsung di produksi 7 September 2026: setelah memilih TP 1, layar
berikutnya adalah kondisi kelas (#51), bukan pertanyaan jumlah pertemuan. Daftar
TP malah **menampilkan** distribusinya — "16 JP · 2 pertemuan (8+8 JP)" — jadi
guru melihat angkanya, hanya tidak diminta menebaknya.

**Yang benar-benar tersisa adalah kode mati, bukan pertanyaan yang sia-sia:**

1. `rancang-chat-flow.js` masih memuat definisi `jumlah_pertemuan` di fase
   `PILIH_TP` — tidak pernah dirender.
2. `rancang-chat.js:2231` masih memetakan `ubah_pertemuan → 'PILIH_TP'`, padahal
   tidak ada satu pun menu yang menghasilkan nilai `ubah_pertemuan`
   (#63 hanya menawarkan ubah kondisi kelas, sumber & strategi, asesmen).

Kalau rute itu suatu hari disambungkan kembali tanpa membaca catatan ini, guru
akan mendarat di pertanyaan yatim yang jawabannya memang ditimpa
`generate-modul/index.ts:2158-2162`. Membuang keduanya lebih aman daripada
membiarkannya menunggu.

Karena itu catatan ini **bukan lagi soal alur pertanyaan**, melainkan kebersihan
kode — bobotnya jauh lebih ringan dari yang tertulis di CLAUDE.md §12.

### Catatan 4 — asesmen formatif tidak punya pertanyaan teknik

Diagnostik (#59) dan sumatif (#62) menanyakan tekniknya; formatif (#60) tidak.
helpText-nya menyatakan MiClass yang menentukan. Asimetri ini disengaja atau tidak
— perlu ditegaskan.

**Masih terbuka per `af3f32b`** — `guru/js/rancang-chat-flow.js`, fase
`ASESMEN_MODUL` tetap 5 pertanyaan: `asesmen_awal` + `teknik_diagnostik`,
`asesmen_formatif` (tanpa lanjutan), `asesmen_sumatif` + `bentuk_sumatif`.

### Catatan 5 — kunci opsi tidak selalu cocok dengan labelnya — **SELESAI `3505493`**

Pada #57: kunci `kolaboratif` berlabel "berbasis masalah", `campuran` berlabel
"kontekstual". Pada #51: kunci `campuran_kemampuan` berlabel "Sebagian sedang PKL".

Ini kelas cacat yang pernah membuat TP 3 dan TP 6 salah menyebut strategi gurunya
sendiri. **Sudah ditangani** sejak `3505493` — kunci diterjemahkan ke frasa manusia
sebelum masuk prompt. Dicatat di sini supaya siapa pun yang membaca kode mentahnya
tidak salah menyimpulkan.

### Catatan 6 — ATP tidak pernah menanyakan jumlah murid

Jalur Modul menanyakannya (#52) dan memakainya untuk menentukan apakah kegiatan
bisa serentak atau bergantian. Jalur ATP tidak. Apakah jumlah murid perlu
memengaruhi penyusunan ATP — pertanyaan produk, belum pernah diputuskan.

**SEBAGIAN SELESAI per 8 September 2026 (`649f616`).**

Yang sudah berubah: `jumlah_murid_kelas` pindah ke fase `PROFIL_KELAS`,
ditanyakan **sekali per kelas**, disimpan ke `rancang_settings.jumlah_murid`,
DAN dipotret ke `collected_data.PROFIL_KELAS` milik ATP. Jadi datanya kini
sudah berada di tangan `generate-atp`.

**Yang belum: `generate-atp` tetap nol menyebut `jumlah_murid`.** Ia membaca
`cd.PROFIL_KELAS` hanya untuk mengambil `perlengkapan_kelas`
(`generate-atp/index.ts:440-442`). Menyambungkannya sekarang tinggal beberapa
baris — datanya sudah ada, tidak perlu pertanyaan baru dan tidak perlu migration.

**Tapi menyambungkannya belum tentu benar.** Pertanyaan produknya masih persis
seperti semula dan belum pernah diputuskan: *apakah jumlah murid seharusnya
memengaruhi penyusunan ATP?* ATP adalah rencana satu fase penuh yang berlaku
lintas kelas — `atp_induk` sengaja tidak punya `classroom_id`. Jumlah murid
adalah fakta satu kelas. Memasukkannya ke ATP berarti ATP yang sama tidak lagi
bisa dipakai untuk kelas lain dengan jumlah murid berbeda, dan itu bertentangan
dengan arsitektur dua lapis yang ada sekarang.

Kalau jawabannya "tidak perlu", Catatan ini ditutup sebagai **keputusan sadar**,
bukan sebagai pekerjaan yang tertinggal.

---

### Catatan 7 — menu revisi menyusut tepat saat guru bisa melihat hasilnya

**Ini "inkonsistensi ketujuh" yang selama ini disebut CLAUDE.md tapi tidak pernah
tertulis di sini.** Ia bukan salah hitung — ia memang ada, hanya terdokumentasi di
CLAUDE.md §23.3 dan `BACKLOG-GO-LIVE-RANCANG.md` §4c.

Sebelum draf ATP dibuat (#45, `ATP_SUMMARY`) guru punya tujuh pilihan, termasuk
rute ke Profil Siswa, Konteks Kejuruan, dan Pengulangan Kemampuan Dasar. Sesudah
draf ATP tampil (#46, `ATP_REVIEW`) tinggal lima, dan ketiga rute itu hilang:

| Rute | #45 `ATP_SUMMARY` | #46 `ATP_REVIEW` |
|---|---|---|
| Ubah prioritas | ada | ada |
| Ubah target fase | ada | ada |
| Ubah alokasi waktu | ada | hanya "Tinjau distribusi waktu" |
| **Ubah profil siswa** | ada | **hilang** |
| **Ubah konteks kejuruan** | ada | **hilang** |
| **Ubah pengulangan kemampuan dasar** | ada | **hilang** |

Bukti: `rancang-chat-flow.js:310-330`. Yang tersisa untuk guru yang baru sadar
ATP-nya tidak mengakomodasi murid tertinggal hanyalah "Buat ulang ATP" — yang
memakan satu dari tiga jatah hariannya. Menurut CLAUDE.md §23.3 ini yang paling
merugikan guru di antara semua inkonsistensi.

---

### Catatan 8 — tuas untuk murid tertinggal bisa tercabut diam-diam

Terdokumentasi di `BACKLOG-GO-LIVE-RANCANG.md` §4b, dimasukkan ke sini saat
rekonsiliasi supaya semua inkonsistensi alur pertanyaan ada di satu daftar.

#44 ("Berapa JP untuk penguatan awal?") hanya muncul bila #43 dijawab `awal` atau
`kombinasi` (`rancang-chat-flow.js:305-307`). Guru yang menjawab "Saat mengajar"
(`terintegrasi`) tidak pernah ditanya, sehingga `jp_prasyarat` = 0 — termasuk guru
yang di #25 baru saja menyatakan muridnya "jauh di bawah".

Sejak Catatan 2 ditutup, konsekuensinya berubah bentuk: dulu jawaban #44 diabaikan
untuk semua orang; sekarang jawaban itu dihormati, tapi guru yang paling
membutuhkannya justru tidak pernah ditawari mengisinya.
