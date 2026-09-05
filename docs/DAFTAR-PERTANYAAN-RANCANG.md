# Daftar Pertanyaan Tab Rancang — untuk pemeriksaan Romo

> Dibangun langsung dari `guru/js/rancang-chat-flow.js` (478 baris), 5 September 2026.
> Kolom **Sampai ke AI?** ditelusuri ke `generate-atp/index.ts` dan `generate-modul/index.ts`.
>
> **62 pertanyaan** — 46 di jalur ATP, 16 di jalur Modul Ajar.
> Yang punya kolom "Muncul kalau" bersifat kondisional: guru tidak selalu melihatnya.

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
| 25 | **Apakah data kemampuan awal siswa tersedia?** | Ya sudah punya / Ada sebagian / Belum ada sama sekali | selalu |
| 26 | Bagaimana titik awal kemampuan siswa ditentukan? | Buat soal pemetaan / Observasi / Isi sendiri dari pengalaman / Anggap sesuai CP / Data simulasi / Rekomendasi | **jawaban 25 = Belum ada** |
| 27 | Bagaimana Anda menggambarkan kemampuan awal siswa saat ini? | teks bebas | **jawaban 26 = Isi sendiri** |
| 28 | Bagaimana pemetaan awal dilakukan? | Tes singkat / Observasi awal / Tugas pemetaan / Gabungan / Rekomendasi | **jawaban 26 = Buat soal** |
| 29 | Berapa JP yang digunakan untuk pemetaan awal? | 1–12 | **jawaban 26 = Buat soal** |
| 30 | Apa yang dilakukan dengan instrumen pemetaan? | Buat sekarang / Pakai soal saya / Catat & lanjut / Ubah metode | **jawaban 26 = Buat soal** |
| 31 | Bagaimana kesulitan siswa yang perlu diantisipasi ditentukan? | Perkiraan umum / Isi sendiri / Belum diketahui / Rekomendasi | selalu |
| 32 | Tuliskan kesulitan yang Anda perkirakan | teks bebas | jawaban 31 = Isi sendiri |

**Sampai ke AI?** Seluruh fase dikirim sebagai `profil_siswa`.

> **Lima dari delapan pertanyaan di fase ini tertutup** bagi guru yang menjawab
> "Ya, saya sudah punya data" atau "Ada sebagian data" pada #25. Lihat Catatan 1.

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

# BAGIAN B — JALUR MODUL AJAR (16 pertanyaan, 5 fase)

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

## B3. SUMBER_STRATEGI — 3 pertanyaan

| # | Pertanyaan | Pilihan | Muncul kalau |
|---|---|---|---|
| 54 | Sumber belajar apa yang digunakan? Pilih semua yang sesuai. | Buku teks / Modul digital / Video pembelajaran / Artikel atau bacaan pendek / Lingkungan sekitar atau dunia kerja / Sumber lain | selalu |
| 55 | Sumber lain apa yang akan digunakan? | teks bebas | pilih "Sumber lain" |
| 56 | **Strategi pembelajaran utama yang digunakan?** | Guru menjelaskan, murid berlatih (langsung) / Murid mengerjakan proyek konkret (berbasis proyek) / Murid menemukan sendiri (inkuiri) / Murid memecahkan masalah nyata (berbasis masalah) / Murid belajar di konteks industri (kontekstual) / Rekomendasi | selalu |

## B4. ASESMEN_MODUL — 5 pertanyaan

| # | Pertanyaan | Pilihan | Muncul kalau |
|---|---|---|---|
| 57 | Apakah modul ini perlu memetakan kemampuan awal murid sebelum pembelajaran dimulai? | Ya / Lewati | selalu |
| 58 | Bagaimana cara mengetahui kemampuan awal murid? | Pemetaan awal (angket/soal singkat) / Tanya jawab lisan / Observasi tugas pembuka / Rekomendasi | jawaban 57 = Ya |
| 59 | Apakah guru ingin mengecek pemahaman murid selama proses belajar? | Ya / Lewati | selalu |
| 60 | Apakah modul ini diakhiri dengan penilaian hasil belajar? | Ya / Lewati | selalu |
| 61 | Bagaimana bentuk penilaian akhir murid? | Tes tertulis / Unjuk kerja / Proyek atau produk / Praktikum / Presentasi / Rekomendasi | jawaban 60 = Ya |

> Diagnostik dan sumatif punya pertanyaan teknik; **formatif tidak** — MiClass yang
> menentukan sendiri tekniknya. Lihat Catatan 4.

## B5. MODUL_SUMMARY — 1 pertanyaan

| # | Pertanyaan | Pilihan |
|---|---|---|
| 62 | Ringkasan Modul Ajar siap disusun. Apakah data modul sudah sesuai? | Ya, buat Modul Ajar / Ubah kondisi kelas / Ubah sumber & strategi / Ubah asesmen |

**Sampai ke AI?** Seluruh `collected_data` Modul dikirim utuh ke Fase A, ditambah
jumlah murid, jumlah pertemuan, JP per pertemuan, durasi JP, elemen CP, dan daftar KKTP.

---

# CATATAN — pengamatan saat menyusun daftar ini

Ini pengamatan, **bukan daftar pekerjaan.** Yang layak dikerjakan adalah keputusan
terpisah.

### Catatan 1 — kemampuan awal hanya bisa dijelaskan oleh guru yang mengaku tidak punya data

Pertanyaan #26–30 semuanya bergantung pada #25 = "Belum ada data sama sekali".
Guru yang menjawab "Ya, saya sudah punya data" — yang justru paling tahu keadaan
muridnya — tidak pernah ditanya isi data itu, dan tidak punya tempat menuliskan
bahwa muridnya jauh tertinggal.

*Sudah diputuskan Romo 5 September 2026: satu pertanyaan tanpa syarat akan
ditambahkan setelah #25, digabung ke perbaikan JP kelipatan.*

### Catatan 2 — JP pemetaan dan JP penguatan tidak dipesan dari anggaran

Keduanya (#29 dan #44) dikirim ke AI sebagai keterangan, tapi **tidak dikurangkan
dari total JP**. AI diberi tahu guru ingin 3 JP penguatan, lalu diperintah menyusun
TP yang jumlahnya persis sama dengan seluruh JP tersedia. Akibatnya TP mengisi 100%
waktu dan penguatan itu tidak punya tempat.

Bertentangan dengan helpText #29 yang berbunyi: *"JP pemetaan diambil dari JP
efektif yang tersedia — bukan tambahan."*

Bukti: ATP `829b4e22` menjawab 3 JP penguatan; `WAKTU.perhitungan.jp_prasyarat`
tersimpan 0.

### Catatan 3 — pertanyaan #47 diabaikan bila ATP sudah punya distribusi pertemuan

`generate-modul` memakai `selected_tp.jp_pertemuan.length` dan hanya jatuh ke
jawaban guru bila daftar itu kosong (`index.ts:2116`). Karena ATP normal selalu
menghasilkan `jp_pertemuan`, jawaban guru pada #47 praktis tidak pernah terpakai.
Guru ditanya sesuatu yang jawabannya dibuang.

### Catatan 4 — asesmen formatif tidak punya pertanyaan teknik

Diagnostik (#58) dan sumatif (#61) menanyakan tekniknya; formatif tidak.
helpText-nya menyatakan MiClass yang menentukan. Asimetri ini disengaja atau tidak
— perlu ditegaskan.

### Catatan 5 — kunci opsi tidak selalu cocok dengan labelnya

Pada #56: kunci `kolaboratif` berlabel "berbasis masalah", `campuran` berlabel
"kontekstual". Pada #51: kunci `campuran_kemampuan` berlabel "Sebagian sedang PKL".

Ini kelas cacat yang pernah membuat TP 3 dan TP 6 salah menyebut strategi gurunya
sendiri. **Sudah ditangani** sejak `3505493` — kunci diterjemahkan ke frasa manusia
sebelum masuk prompt. Dicatat di sini supaya siapa pun yang membaca kode mentahnya
tidak salah menyimpulkan.

### Catatan 6 — ATP tidak pernah menanyakan jumlah murid

Jalur Modul menanyakannya (#52) dan memakainya untuk menentukan apakah kegiatan
bisa serentak atau bergantian. Jalur ATP tidak. Apakah jumlah murid perlu
memengaruhi penyusunan ATP — pertanyaan produk, belum pernah diputuskan.
