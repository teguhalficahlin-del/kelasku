# Revisi alur pertanyaan Tab Rancang — spesifikasi perilaku

> Disusun 8 September 2026 pada HEAD `897df77`. **Belum diimplementasikan.**
> Menunggu persetujuan Romo sesuai §21.3 CLAUDE.md.
>
> Disusun dari kode aktual (`rancang-chat-flow.js`, 63 pertanyaan), bukan dari
> `docs/DAFTAR-PERTANYAAN-RANCANG.md` yang pernah terbukti tertinggal dari
> commit-nya sendiri.

---

## 1. Dua masalah yang diselesaikan

Sepanjang penelusuran 7–8 September ditemukan dua kelas cacat yang berbeda,
dan keduanya harus dibaca bersama.

**Kelas pertama — pertanyaan yang jawabannya dibuang.** Guru diminta memutuskan
sesuatu yang lalu tidak dipakai. Sudah tercatat di CLAUDE.md sejak 5 September
("empat pertanyaan"), dan bertambah satu anggota baru hari ini.

**Kelas kedua — keputusan yang tidak pernah jadi pertanyaan.** MiClass memutuskan
hal yang seharusnya milik guru, dan tidak memberi tahu siapa pun. Ini yang
ditemukan Romo, dan yang lebih merugikan dari yang pertama.

> Yang pertama membuang waktu guru. Yang kedua **mengambil wewenangnya** atas
> dokumen yang ia tanda tangani dan bawa ke kelas.

---

## 2. Prinsip yang dipakai memutuskan

Empat aturan yang sudah berlaku di proyek ini, dipakai apa adanya:

1. **Sebelum menambah pertanyaan, tunjukkan baris kode yang membaca jawabannya.**
   Setiap pertanyaan baru di dokumen ini menyebut barisnya. Tanpa itu, ia tidak
   masuk.
2. **Kalau jawabannya memang tidak dipakai, buang atau ganti pertanyaannya** —
   jangan dipaksa disambungkan.
3. **Kesederhanaan lebih penting dari kelengkapan** (§23.2). Pertanyaan yang
   guru belum bisa jawab sebelum melihat apa pun tidak ditanyakan di depan.
4. **Istilah resmi dipakai di dokumen, bahasa guru dipakai di pertanyaan**
   (§23.2 poin 3).

---

## 3. Fase baru: PROFIL KELAS

Tiga fakta yang melekat pada **kelas**, bukan pada modul. Disimpan di
`rancang_settings`, **ditanyakan sekali per kelas**, lalu dipakai ulang oleh
ATP maupun setiap Modul.

| Pertanyaan | Asalnya | Dibaca di |
|---|---|---|
| `perlengkapan_kelas` | pindah dari SUMBER_STRATEGI (jalur Modul) | `generate-modul:1236` (`perlengkapanKelas`), **baru:** `generate-atp` |
| `jumlah_murid_kelas` | pindah dari KONTEKS_MODUL | `generate-modul:1166`, `:2113` |
| `bahasa_pengantar` | **baru** | `generate-modul` — `language_policy` (lihat §5b) |

**Kenapa dipindah.** Guru dengan 6 modul menjawab perlengkapan dan jumlah murid
**enam kali**, dan bisa menjawab berbeda-beda untuk kelas yang sama. Lebih
buruk: `generate-atp` tidak pernah menerimanya sama sekali, sehingga ATP
melahirkan TP seperti *"Menyimak kosakata alat jahit dari video tutorial"*
untuk kelas yang mungkin tanpa proyektor — lalu mesin modul dilarang menyebut
video. Judul TP menuntut sesuatu yang isi modulnya tidak boleh menyebut.

**Kapan ditanyakan.** Bukan di posisi tetap. Ditanyakan di awal funnel mana pun
yang pertama kali membutuhkannya, dan **dilewati kalau kelas itu sudah punya
jawabannya**. ATP lama yang dibuat sebelum fase ini ada tidak punya jawaban,
jadi guru akan ditanya sekali saat menyusun modul berikutnya.

---

## 4. Pertanyaan yang DIGANTI

### 4a. #54 `jenis_sumber` — "Sumber belajar apa yang digunakan?"

**Temuannya.** Delapan modul di produksi diperiksa. Buku teks muncul **hanya di
daftar** (`sumber_belajar`, `media_dan_alat`) — nol kali di deskripsi kegiatan,
nol di naskah, nol di instrumen. Jawaban guru berakhir sebagai satu baris hiasan.

**Yang lebih merugikan: video.** Dua modul yang gurunya mencentang "video
pembelajaran" **membangun kegiatan di atas video yang tidak ada** — dua dari
dua. Pada modul 7 September ia sampai ke naskah:

> *"Mari kita simak video percakapan singkat staf butik busana di layar proyektor."*
> *"Menghentikan video pada momen kunci saat staf menyampaikan salam."*
> *"Jika murid kesulitan menangkap ucapan di video, putar ulang segmen sapaan pembuka dua kali."*

Video itu tidak pernah dibuat MiClass. Guru berdiri di depan kelas di menit
ke-20 dengan naskah yang menyuruhnya memutar sesuatu yang tidak ia punya.

**Kenapa tidak bisa "disambungkan".** Menyuruh AI memakai buku atau video yang
isinya tidak pernah ia lihat hanya bisa dipatuhi dengan **mengarang** — halaman,
kutipan, adegan. Itu persis cacat "bahan hantu" yang dulu membuat Naskah
Fasilitasi berperilaku seperti kurikulum bayangan.

**Penggantinya.** Pertanyaan berubah dari *daftar centang* menjadi *pembagian
tugas*:

> **"Bahan apa yang akan Anda siapkan sendiri untuk pertemuan ini?"**
> · Buku teks yang saya pakai
> · Video atau audio pilihan saya
> · Artikel atau bacaan yang saya siapkan
> · Lingkungan sekitar / kunjungan ke dunia kerja
> · Narasumber dari industri
> · Tidak ada — cukup bahan dari MiClass

Lalu modul menulis apa adanya:

> **Sumber Belajar**
> · Disiapkan guru: buku teks, video pilihan Anda sendiri
> · Disediakan modul ini: PBL-01 contoh percakapan, PBL-02 kartu peran

**Aturan keras yang menyertainya** (di SYSTEM_PROMPT `generate-modul`):

> Bahan yang guru siapkan sendiri **DILARANG menjadi tulang punggung kegiatan**
> dan **DILARANG muncul di naskah sebagai instruksi konkret** — tanpa menyebut
> halaman, adegan, menit, atau isi. Boleh disebut sebagai pelengkap
> ("bila Anda punya bahan sendiri, gunakan di tahap ini"), tidak boleh
> dijadikan sandaran. Langkah pembelajaran hanya boleh bersandar pada instrumen
> yang ada di manifest.

Aturan ini **jauh lebih sempit** daripada pemeriksaan "bahan hantu" yang dulu
ditolak karena menjatuhkan 4 dari 5 modul: ia hanya menyasar bahan yang guru
sendiri nyatakan akan ia bawa, bukan semua bahan.

**Perbedaan yang membedakan sumber "latar" dan sumber "isi":**

| Jenis | Contoh | Bisa dipatuhi AI? |
|---|---|---|
| Latar kegiatan | lingkungan sekitar, narasumber industri | **ya** — AI merancang kegiatan tanpa perlu tahu isinya |
| Wadah isi | buku teks, video, artikel | **tidak** — isinya tidak pernah dilihat AI |

Yang pertama tetap boleh masuk ke kegiatan. Yang kedua tidak.

---

## 5. Pertanyaan BARU

Setiap pertanyaan di bawah menyebut baris yang akan membacanya. Semuanya
memakai opsi terakhir **"Minta rekomendasi MiClass"** dengan `aiRecommendation:
true` — pola yang sudah dipakai 17 pertanyaan lain dan sudah diverifikasi
bekerja (§8).

### 5a. Cara mengurutkan TP — fase PRIORITAS

**Yang terjadi sekarang.** `generate-atp/index.ts:167` menanam satu metode mati:

```
'4. Urutan TP: dari kompetensi dasar ke kompleks, memperhatikan prasyarat dan profil siswa.'
```

Satu metode saja, dan guru tidak pernah ditanya. Padahal **Panduan Pembelajaran
dan Asesmen 2025 hal. 23–24, Tabel 3.3 "Cara-Cara Menyusun Alur Tujuan
Pembelajaran"** menyediakan **enam** metode resmi beserta contohnya.

> **"Bagaimana urutan materi disusun sepanjang fase ini?"**
> · Dari yang mudah ke yang lebih sulit — kata pendek dulu, baru kalimat panjang
> · Bertahap sampai mandiri — dibantu penuh dulu, bantuan dikurangi pelan-pelan
> · Mengikuti langkah kerja — tahap demi tahap satu prosedur utuh
> · Dari benda nyata ke konsep — praktik dulu, teorinya menyusul
> · Kemampuan dasar dulu — yang sederhana jadi syarat yang kompleks
> · Dari gambaran umum ke rincian
> · Minta rekomendasi MiClass

Istilah resminya (Scaffolding, Pengurutan Prosedural, dst.) **tetap dicetak di
dokumen ATP**, tapi tidak dipakai untuk bertanya — §23.2 poin 3.

**Dibaca di:** `generate-atp/index.ts:167` — kalimat tetap diganti dengan metode
pilihan guru, dan penjelasan singkatnya dari Tabel 3.3.

**Batas yang tidak boleh dilanggar:** metode pengurutan menentukan **urutan**,
bukan **jumlah JP**. Penjaga `sum(jp_alokasi) = jp_operasional` dan kelipatan
satuan pertemuan **tidak ikut longgar** — kalau tidak, kelas cacat "ATP mustahil
dipenuhi" terbuka kembali.

### 5b. Bahasa pengantar — fase PROFIL KELAS

**Yang terjadi sekarang.** `language_policy` (`teacher_instruction`,
`student_instruction`, `target_language`) dihasilkan AI **tanpa satu pun aturan
di SYSTEM_PROMPT dan tanpa satu pun masukan guru.** Pada modul 7 September ia
memutuskan sendiri:

> *"Murid diarahkan menggunakan Bahasa Inggris penuh selama latihan dialog."*

Untuk kelas yang guru nyatakan "sedikit di bawah". Tiap generate bisa berbeda,
dan tidak ada yang akan tahu.

Ini yang **paling tersembunyi** di antara semua temuan: bukan aturan yang salah,
melainkan **ketiadaan aturan sama sekali**.

> **"Bahasa apa yang Anda pakai saat mengajar kelas ini?"**
> · Bahasa Indonesia, bahasa Inggris hanya untuk contoh dan latihan
> · Campur — penjelasan Indonesia, instruksi kelas bahasa Inggris sederhana
> · Bahasa Inggris sebagian besar waktu, Indonesia saat murid kesulitan
> · Bahasa Inggris penuh
> · Minta rekomendasi MiClass

**Dibaca di:** `generate-modul` — `language_policy` di Fase A berhenti dikarang
AI dan disalin dari jawaban guru, dengan aturan baru di SYSTEM_PROMPT bahwa
naskah dan instruksi murid harus mematuhinya.

### 5c. Teknik dan instrumen asesmen — fase ASESMEN_MODUL

**Yang terjadi sekarang.** `generate-modul/index.ts:1711` menyatakannya sendiri:

```
'Diagnostik: gunakan teknik_diagnostik untuk menentukan jenis instrumen. '
'Formatif:   AI menentukan teknik dan penempatan per entri F1/F2/F3 ... '
'Sumatif:    gunakan teknik_sumatif untuk menentukan jenis instrumen. '
```

| | Teknik | Instrumen |
|---|---|---|
| Diagnostik | guru pilih | **diturunkan dari teknik** — tidak pernah dipilih guru |
| Formatif | **AI yang tentukan** | **AI yang tentukan** |
| Sumatif | guru pilih | **diturunkan dari teknik** — tidak pernah dipilih guru |

**Panduan menetapkan sebaliknya.** Hal. 31: *"Tuliskan **teknik dan instrumen**
penilaian…"*. Hal. 35: *"**pendidik memilih dan/atau mengembangkan instrumen
asesmen** sesuai tujuan."* Yang memilih instrumen adalah pendidik.

Catatan 4 selama ini salah dirumuskan — ia ditulis sebagai "formatif tidak punya
pertanyaan teknik", seolah asimetri kosmetik. Yang sebenarnya: **instrumen tidak
pernah dipilih guru untuk ketiganya.**

Empat pertanyaan baru:

| Pertanyaan | Syarat muncul | Dibaca di |
|---|---|---|
| `teknik_formatif` | `gunakan_formatif = ya` | `:1711` — "AI menentukan teknik" → "gunakan `teknik_formatif`" |
| `instrumen_diagnostik` | `teknik_diagnostik ≠ rekomendasi` | `:1711` — "gunakan teknik untuk menentukan jenis instrumen" → "gunakan `instrumen_diagnostik`" |
| `instrumen_formatif` | `teknik_formatif ≠ rekomendasi` | `:1711` baris baru sejajar |
| `instrumen_sumatif` | `teknik_sumatif ≠ rekomendasi` | idem |

**Dua rancangan yang menjaga ini tetap waras:**

1. **Pilihan instrumen bergantung pada teknik yang baru dipilih.** Guru tidak
   bisa memilih pasangan yang bertengkar (teknik "tanya jawab lisan" dengan
   instrumen "soal pilihan ganda") — yang kalah nanti akan diam, dan itu kelas
   kesalahan yang berulang di proyek ini. Bahan bakunya sebelas jenis instrumen
   yang sudah dikenal mesin (`ISTILAH_INSTRUMEN`), jadi tidak ada jenis baru
   yang perlu diajari ke AI.
2. **Pertanyaan instrumen dilewati kalau tekniknya diserahkan ke MiClass.**
   Guru yang menjawab "rekomendasi" untuk teknik tidak masuk akal ditanya
   instrumennya. Guru buru-buru menambah **satu** ketukan; guru yang peduli
   menambah empat.

---

## 6. Perbaikan lain yang ikut

| # | Perubahan | Alasan |
|---|---|---|
| 47 | `jumlah_pertemuan` **dihapus** beserta rute mati `ubah_pertemuan` (`rancang-chat.js:2231`) | Kode mati sejak `fb62f0f`; tidak pernah dirender. Catatan 3 |
| 26 | `status_data_awal` — **+1 teks bebas** untuk jawaban "Ada sebagian data" | Satu-satunya jalur yang masih buntu. Sisa Catatan 1 |
| 44 | `jp_prasyarat` — syarat diperluas ke `terintegrasi` | Catatan 8: guru yang muridnya "jauh di bawah" lalu memilih "saat mengajar" berakhir nol JP tanpa pernah ditawari |
| 46 | `tindakan_review_atp` — **+3 rute**: Ubah profil siswa, Ubah konteks kejuruan, Ubah pengulangan | Catatan 7, yang paling merugikan guru |

---

## 7. Yang SENGAJA ditunda

Dua keputusan yang juga diambil MiClass tanpa bertanya, tapi **tidak layak
ditanyakan di depan.**

### 7a. Berapa TP dalam satu ATP — **SELESAI 8 September 2026** (`8397027`)

> **Keputusan Romo: kerjakan sekarang.** Sudah ter-deploy dan terverifikasi di
> produksi. Bukti: satu ATP 144 JP disusun jadi 10 TP, dipecah jadi **14**, lalu
> digabung jadi **9** — total JP tetap 144 dan nol TP di luar kelipatan 4 JP di
> ketiga putaran. Aritmetikanya tidak goyah sekali pun.
>
> Draf ATP kini menyebut kepadatannya dalam bahasa yang guru rasakan:
> *"Rata-rata 16 JP per TP — berarti 9 modul ajar sepanjang fase ini."*
>
> Yang BELUM diuji dengan dijalankan: cabang penolakan saat guru sudah menyentuh
> batas (TP tidak boleh lebih banyak daripada jumlah pertemuan). Ia terverifikasi
> lewat pembacaan kode dan lewat penjepit kedua di server, tapi belum pernah
> benar-benar dipicu — mencapainya butuh beberapa putaran generate berturut-turut
> pada kelas dengan jam sangat sedikit.



Guru memberi total jam; AI memutuskan pemecahannya. Lima ATP di produksi:

| ATP | Total JP | Jadi berapa TP | JP per TP |
|---|---|---|---|
| `e2ff7bfb` | 102 | 12 | 8,5 |
| `eb350cd3` | 124 | 9 | 13,8 |
| `eb9c0cdf` | 124 | 10 | 12,4 |
| `79246d4e` | 128 | 16 | 8,0 |
| `b455b27d` | 200 | 12 | 16,7 |

Dua ATP dengan jam **sama persis** menghasilkan 9 dan 10 TP; kepadatannya
merentang dua kali lipat. Jumlah TP = jumlah modul yang harus guru buat dan
ajarkan — itu keputusan beban kerja setahun.

### 7b. Pembagian menit antar tahap

Satu pertemuan 8 JP = 320 menit. Modul 7 September:

| Tahap | Pertemuan 1 | Pertemuan 2 |
|---|---|---|
| Pembuka | 20 | 20 |
| Asesmen awal | 30 | 20 |
| Memahami | 100 | 60 |
| Menerapkan | 110 | 160 |
| Refleksi | 30 | 30 |
| Penutup | 30 | 30 |

Pergeserannya masuk akal secara pedagogis — tapi itu penalaran AI, bukan
penilaian guru yang mengenal kelasnya.

### Kenapa ditunda, bukan dibuang

Keduanya sulit dijawab **sebelum guru melihat apa pun**. Ditanya di depan,
"mau berapa TP?" memaksa menebak dari nol; "Memahami berapa menit?" enam kali
per pertemuan akan mengubur guru.

Yang benar: **tampilkan, lalu izinkan mengubah.** Di layar tinjauan ATP guru
melihat "12 TP · rata-rata 16,7 JP per TP" dan boleh meminta dipecah lebih
banyak; di tampilan pertemuan menitnya bisa disesuaikan.

Itu menyambung langsung ke Catatan 7 (§6) — menambah rute revisi menyelesaikan
tiga hal sekaligus. **Spesifikasi terpisah**, dikerjakan sesudah revisi ini.

---

## 8. Yang sudah diverifikasi sebelum spesifikasi ini ditulis

Karena empat pertanyaan baru bersandar pada opsi "Minta rekomendasi MiClass",
jalur itu diperiksa lebih dulu — bukan diasumsikan bekerja.

| Pemeriksaan | Hasil |
|---|---|
| Pertanyaan dengan opsi rekomendasi | 18 |
| Lewat penjaga bervalidasi (`rancang-chat.js:1977-1987`) | 17 |
| Dikhususkan sengaja (`target_akhir_mode`) | 1 — berkomentar, terlihat bekerja |
| Opsi teknik tanpa terjemahan manusia | **nol** |
| Selisih `ISTILAH_TEKNIK` Edge Function vs klien | **nol — sinkron** |
| Jawaban ber-`source = ai_recommendation` di produksi | **10** |

Empat lapis penjaganya: nilai AI **divalidasi** terhadap daftar opsi sah; guru
melihat **alasannya** lalu memutuskan menerima atau memilih sendiri; yang
tersimpan **nilai opsi sungguhan** bukan kata "rekomendasi"; dan jaring
terakhir `ISTILAH_TEKNIK:1148` menerjemahkan `rekomendasi` → *"belum ditentukan
guru — tentukan teknik yang paling sesuai"* kalau ketiganya gagal.

**Yang belum terukur:** apakah rekomendasinya *bagus*. Itu penilaian pedagogis,
bukan pemeriksaan teknis, dan 10 jawaban terlalu sedikit untuk menyimpulkan.
Justru karena itu lapis kedua penting — rekomendasi yang meleset tetap tertahan
di mata guru.

---

## 9. Hitungan jujur

| | Sekarang | Revisi |
|---|---|---|
| Definisi pertanyaan | 63 | **69** |
| Per kelas, sekali seumur kelas | — | 3 |
| Per ATP | 46 | 48 |
| Per Modul | 17 | 18 (15 bagi guru yang menyerahkan teknik ke MiClass) |
| **Guru dengan 1 ATP + 6 modul** | **148** | **159** — atau **141** kalau teknik diserahkan |

**Bertambah, dan saya tidak menyamarkannya.** Yang berkurang bukan jumlah
pertanyaan, melainkan jumlah keputusan yang diambil diam-diam atas nama guru.

Untuk guru yang buru-buru, angkanya justru **turun** dari 148 ke 141 — karena
dua fakta kelas berhenti ditanya berulang dan empat pertanyaan asesmen selesai
dengan sekali ketuk "Minta rekomendasi MiClass". Guru yang ingin memutuskan
sendiri membayar sebelas ketukan tambahan untuk kendali penuh atas dokumennya.

Guru sibuk tidak dihukum; guru yang peduli tidak dikunci.

---

## 10. Yang TIDAK berubah

- Tidak ada perubahan pada penjaga aritmetika ATP: `sum(jp_alokasi) =
  jp_operasional`, kelipatan satuan pertemuan, pembulatan ke bawah.
- Tidak ada perubahan pada `trial_guard_*`, gerbang tier, atau
  `rancang_akses_uji_coba`.
- Tidak ada perubahan pada aturan yang memang standar Kurikulum Merdeka:
  ketiga pengalaman belajar wajib hadir, asesmen awal sebelum Memahami, ambang
  KKTP wajib terukur, larangan label "murid lemah/pandai".
- Data ATP dan Modul yang sudah ada tidak disentuh.

---

## 11. Risiko dan jalan mundur

| Risiko | Penanganan |
|---|---|
| `jenis_sumber` dibuang memutus jalan mundur `perangkatDigitalDiizinkan()` (`:1240`) yang dipakai modul lama dan peramban ber-cache lama | Jalur lama **dipertahankan utuh**. Kolom lamanya tidak dihapus dari `collected_data`; hanya pertanyaannya yang berhenti ditanyakan |
| ATP lama tidak punya jawaban PROFIL KELAS | Ditanyakan sekali saat funnel berikutnya membutuhkannya; tanpa jawaban, perilaku jatuh ke keadaan sekarang |
| Metode pengurutan melonggarkan penjaga JP | Masuk sebagai perintah **pengurutan**, sejajar dengan aturan lain — bukan menggantikannya. Diuji dengan harness aritmetika yang sudah ada |
| Instrumen pilihan guru bertengkar dengan tekniknya | Pilihan instrumen dibuat bergantung pada teknik |
| Prompt membesar → plafon token menyempit | **CLAUDE.md sudah mencatat ini roboh lima kali.** Plafon diperiksa ulang setiap prompt diperbesar; `anggaranToken*` sudah turunan, bukan angka mati |

---

## 12. Urutan pengerjaan

Bertahap, tiap tahap bisa diverifikasi sendiri (§21.3 poin 6).

1. **Migration** — kolom `perlengkapan_kelas`, `bahasa_pengantar` di
   `rancang_settings` (`jumlah_murid` sudah ada). Uji `BEGIN…ROLLBACK`.
2. **Fase PROFIL KELAS** + pemindahan dua pertanyaan. Verifikasi: guru dengan
   dua modul hanya ditanya sekali.
3. **`generate-atp`** — terima perlengkapan; ganti baris 167 dengan metode
   pilihan guru. Verifikasi: ATP untuk kelas tanpa perangkat digital tidak
   menghasilkan satu pun TP yang menuntut perangkat digital.
   **SELESAI & TERVERIFIKASI DI PRODUKSI, 8 September 2026** (`f8550a1`).
   Bukti: ATP `e7e8e002` untuk X TB Busana — kelas yang tercatat hanya punya
   proyektor dan speaker, tanpa internet. Metode yang dipilih guru: Scaffolding.

   | Yang diuji | Hasil |
   |---|---|
   | Fase PROFIL KELAS dilewati karena kelas sudah punya profil | ya |
   | Pertanyaan metode pengurutan muncul dengan kata-kata Tabel 3.3 | ya |
   | TP yang menuntut video/internet/audio/aplikasi | **0 dari 12** |
   | `sum(jp_alokasi)` = `jp_operasional` (136 − 4 pemetaan − 4 penguatan) | 128 = 128 |
   | TP yang bukan kelipatan satuan pertemuan (4 JP) | 0 |
   | Urutan mencerminkan Scaffolding | ya — TP 1 "Mengidentifikasi kosakata dasar", TP 12 "Mempresentasikan … **secara mandiri**" |

   Jalur "Minta rekomendasi MiClass" ikut teruji di fase yang sama: MiClass
   memilih opsi yang sah, menyebutkan alasannya dengan menyandingkan dua jawaban
   guru sebelumnya, dan jawabannya tercatat benar setelah "Gunakan rekomendasi".

   ATP uji dihapus setelah verifikasi — produksi bersih.
4. **Penggantian #54** + aturan keras bahan guru. Verifikasi: naskah tidak
   menyebut bahan guru sebagai instruksi konkret.
   **SELESAI & TERVERIFIKASI DI PRODUKSI, 8 September 2026** (`72984cd`).
   Bukti: modul `0db3f267` (TP 12, X TB Busana, 2 pertemuan × 8 JP), dengan guru
   sengaja mencentang **"Video atau audio pilihan saya"** dan **"Buku teks yang
   saya pakai"** — persis kombinasi yang dulu melahirkan cacatnya.

   | Yang diuji | Sebelum | Sesudah |
   |---|---|---|
   | Kata "video" di seluruh modul | kegiatan dibangun di atasnya, 2 dari 2 modul | **0** |
   | Kata "audio" di seluruh modul | — | **0** |
   | Bahan guru sebagai instruksi di naskah (23.270 karakter) | "Hentikan video pada momen kunci" | **0** |
   | Buku teks disebut | satu baris hiasan di daftar sumber | **satu baris tawaran**: *"Dapat dijadikan rujukan pengayaan contoh deskripsi pakaian bagi murid yang memerlukan variasi kosakata."* |

   Bentuk terakhir itulah yang dituju: bahan guru tercatat, dihargai, dan modul
   tetap utuh seandainya guru lupa membawanya.
5. **`language_policy`** disalin dari jawaban guru.
   **SELESAI, ter-deploy 8 September 2026** (`a35be88` + `fdddd29`).

   Bukti cacatnya, dari modul `0db3f267` yang disusun sebelum perbaikan ini —
   guru X TB menjawab **`campur`** ("penjelasan Indonesia, instruksi kelas
   bahasa target"), lalu model menuliskan kebalikan penekanannya:

   > *"Guru memandu kegiatan menggunakan bahasa Inggris komunikatif yang
   > diselingi bahasa Indonesia sederhana saat menjelaskan istilah teknis."*

   Itu `target_dominan`, bukan `campur`. Sekarang backend yang menetapkannya:

   > *"Guru menjelaskan konsep dalam Bahasa Indonesia dan memberi instruksi
   > kelas dalam Bahasa Inggris."*

   Ikut ditutup dalam tahap ini:
   - **`bahasa_pengantar` tidak punya jalur mundur di jalur Modul**, sementara
     `perlengkapan_kelas` dan `jumlah_murid_kelas` punya. Guru dengan ATP lama
     yang langsung menyusun Modul tidak akan pernah ditanya — dan
     `language_policy` kembali dikarang model, persis keadaan yang diperbaiki.
   - **Naskah tidak pernah diberi aturan bahasa.** `language_policy` sudah
     dikirim ke Fase B2 sejak dulu tapi tidak satu pun aturan merujuknya, jadi
     naskah bisa berbahasa apa saja tanpa ada yang mengeluh.
   - **Frasa cadangan bocor ke dokumen** untuk mapel tanpa bahasa target
     (Matematika, Bahasa Indonesia). Ditemukan jaring regresi
     `tests/kebijakan-bahasa.ts` sebelum ada guru yang mengalaminya.

   Terverifikasi: 8 kasus di `tests/kebijakan-bahasa.ts` lulus, dijalankan
   terhadap potongan kode kirimnya sendiri.

   **TERVERIFIKASI DI PRODUKSI** — modul `122cfbc5` (TP 11, X TB, 3 pertemuan),
   disusun sesudah deploy. `language_policy` yang tersimpan sama persis dengan
   rumusan backend untuk jawaban `campur`, dan — yang lebih penting — naskahnya
   benar-benar mematuhinya, sesuatu yang sebelumnya tidak pernah diatur:

   > *Katakan: "Good morning, everyone! Please take your seats and prepare your workspace."*
   > *Katakan: "Sebelum kita mulai berkarya hari ini di studio busana, mari kita berdoa bersama…"*

   Instruksi kelas dalam Bahasa Inggris, penjelasan dalam Bahasa Indonesia —
   persis "campur" seperti yang guru nyatakan.
6. **Empat pertanyaan asesmen** + perubahan `instruksi_manifest`.
   **SELESAI & TERVERIFIKASI DI PRODUKSI, 8 September 2026** (`c14d8ab`).

   Bukti: modul `2c40c35e` (TP 9, X TB). Guru menjawab tiga hal yang sebelumnya
   tidak pernah bisa ia tentukan, dan ketiganya dipatuhi persis:

   | Guru menjawab | Manifest yang dihasilkan |
   |---|---|
   | Diagnostik: tanya jawab → **lembar pengamatan** | ASM-01 `matriks_observasi` |
   | Formatif: **mengamati murid bekerja** (dulu AI yang memilih) | ASM-02 `matriks_observasi` |
   | Sumatif: proyek → **panduan proyek** | ASM-03 `panduan_proyek` |

   Penyaringan per teknik terbukti bekerja di layar: teknik "tanya jawab" hanya
   menawarkan dua instrumen yang cocok, dan teknik "mengamati" **tidak
   memunculkan pertanyaan instrumen sama sekali** — instrumennya memang hanya
   satu bentuk, jadi bertanya hanya menambah ketukan.

   Ketukan tambahan bagi guru: paling banyak tiga; nol bagi guru yang
   menyerahkan seluruh tekniknya ke MiClass.
7. **Perbaikan §6** — hapus kode mati, tambah rute revisi, perluas syarat.
   **SELESAI & TERVERIFIKASI DI PRODUKSI, 8 September 2026** (`b522640`).
   Diuji dengan menjalankan funnel ATP sampai tuntas, memilih justru kombinasi
   yang selama ini buntu:

   | Catatan | Yang diuji | Hasil |
   |---|---|---|
   | 1 (sisa) | "Ada sebagian data" | muncul lanjutan "Bagian mana yang sudah Anda ketahui…"; jawabannya tersimpan dan ikut ke `profil_siswa` di prompt |
   | 8 | "Saat mengajar" + isi 0 JP | pertanyaan JP kini muncul (dulu dilewati); nilai 0 diterima; ringkasan menulis "JP pengulangan kemampuan dasar: 0" |
   | 7 | menu revisi sesudah draf ATP tampil | delapan pilihan, termasuk tiga yang dulu hilang; "Ubah profil siswa" benar-benar mendarat di fase Profil Siswa |
   | 3 | `jumlah_pertemuan` + rute `ubah_pertemuan` | dihapus; alur Modul tetap jalan karena jumlah pertemuan diturunkan dari `selected_tp.jp_pertemuan` |

   ATP uji dihapus setelah verifikasi.

Tahap 3–6 menyentuh Edge Function → **berhenti dan tunggu konfirmasi Romo**
sebelum tiap deploy, sesuai §8 CLAUDE.md.

---

## 13. Definisi selesai

- [ ] Setiap pertanyaan baru punya baris kode yang membacanya — ditunjukkan,
      bukan dijanjikan
- [ ] `deno check` lulus untuk kedua Edge Function sebelum deploy
- [ ] `tests/validator-modul.ts` dijalankan sebelum dan sesudah
- [ ] Harness aritmetika ATP: kelima ATP produksi tidak berubah angkanya
- [ ] Uji end-to-end di produksi: satu ATP + satu Modul dengan pola jadwal yang
      belum pernah dipakai, diperiksa dari basis data
- [ ] Guru yang menjawab "Minta rekomendasi MiClass" untuk keempat pertanyaan
      baru menghasilkan modul yang sah
- [ ] `docs/DAFTAR-PERTANYAAN-RANCANG.md` diperbarui ke keadaan setelah revisi
- [ ] CLAUDE.md §12 dan §23.3 diperbarui
