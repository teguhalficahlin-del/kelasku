# MICLASS — ATP CURRENT CP AUTHORITY REPORT

Pass 3. Tidak di-deploy, tidak di-push, tidak di-commit, tidak menyentuh
production DB, tidak ada semantic live-generate, tidak menyentuh Modul maupun
Naskah Fasilitasi.

> **Hasil pokok yang perlu Romo ketahui lebih dulu.** Otoritas CP sudah
> dipindahkan ke 046/H/KR/2025 dan penguraiannya dibangun ulang dari nol.
> Konsekuensinya, gerbang layanan penuh menutup **Bahasa Inggris Fase E** —
> satu-satunya kombinasi yang selama ini terbuka. Sebabnya dua, dan keduanya
> dapat dibuka kembali dengan mengubah data, bukan kode: (1) satu tuntutan CP
> berdiri di atas pertentangan sumber resmi yang tidak boleh saya putuskan
> sendiri (§G.2), dan (2) penguraian barunya belum diterima peninjau (§I).
> Karena tidak ada deploy, tidak ada guru yang terpengaruh hari ini.

---

## A. Authority Verification

Sumber resmi ditemukan **di dalam repositori ini**, bukan dari internet, blog,
Scribd, modul guru, situs komersial, atau ringkasan AI.

| | |
|---|---|
| Berkas | `Kepka_BSKAP_No_01k17e8396ajn15j3hcw0k773b.pdf` (22,5 MB, 1.691 halaman) |
| Judul | Keputusan Kepala Badan Standar, Kurikulum, dan Asesmen Pendidikan Kementerian Pendidikan Dasar dan Menengah **Nomor 046/H/KR/2025** tentang Capaian Pembelajaran pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah |
| Ditetapkan | Jakarta, **16 Juli 2025** — Kepala Badan, **TONI TOHARUDIN**, NIP 197004011995121001 |
| Salinan | "Salinan sesuai dengan aslinya, Kepala Bagian Keuangan dan Umum, ELLIS DARMAYANTI, NIP 198002062010122002" |
| Halaman CP Bahasa Inggris Fase E | 136–137 (Lampiran II) |

Penunjukan jalur untuk SMK/MAK, verbatim dari **Lampiran III, angka I UMUM**:

> "Capaian Pembelajaran untuk Mata Pelajaran: … o. Bahasa Inggris; dan
> p. Informatika, mengacu pada lampiran II Keputusan Kepala Badan ini."

Jadi CP Bahasa Inggris untuk SMK/MAK adalah CP di **Lampiran II angka 4 (Fase E)**.

**Dokumen pendukung** (juga di repositori):
`3. Final Panduan Mata Pelajaran Bahasa Inggris_12_09_2025_Revisi 3.pdf` —
Panduan Mata Pelajaran Bahasa Inggris, Badan Standar, Kurikulum dan Asesmen
Pendidikan, Kemendikdasmen; Penanggung Jawab Dr. Laksmi Dewi, M.Pd., Kepala
Pusat Kurikulum dan Pembelajaran. CP Fase E ada di halaman 21–22.

**Cara verifikasi.** Teks diambil dengan **dua pengekstrak berbeda**
(`pdftotext -layout` dan PyMuPDF) dan hasilnya dicocokkan kata demi kata, supaya
artefak tata letak tidak menyelinap masuk sebagai teks normatif. Tidak ada
pengambilan dari luar berkas resmi ini.

---

## B. Revocation Evidence

Verbatim, **Diktum KETUJUH** Keputusan Kepala BSKAP Nomor 046/H/KR/2025
(halaman 5):

> "Pada saat Keputusan Kepala Badan ini berlaku Keputusan Kepala Badan Standar,
> Kurikulum, dan Asesmen Pendidikan Kementerian Pendidikan, Kebudayaan, Riset,
> dan Teknologi Nomor 32/H/KR/2024 Tentang Capaian Pembelajaran Pada Pendidikan
> Anak Usia Dini, Jenjang Pendidikan Dasar, Dan Jenjang Pendidikan Menengah Pada
> Kurikulum Merdeka dicabut dan dinyatakan tidak berlaku."

**Diktum KEDELAPAN**: "Keputusan Kepala Badan ini mulai berlaku sejak tanggal
ditetapkan" — 16 Juli 2025.

**Dua koreksi sitasi yang ikut ditemukan.** Acuan Pass 1/2 menulis
`"Kepmendikbudristek 032/H/KR/2024"`. Keduanya keliru:

1. Bentuknya **Keputusan Kepala BSKAP**, bukan Keputusan Menteri
   (Kepmendikbudristek).
2. Nomornya **32/H/KR/2024**, bukan 032/H/KR/2024.

Kedua ejaan dimasukkan ke daftar `VERSI_CP_DICABUT` supaya acuan lama tidak lolos
gerbang hanya karena angka nolnya berbeda.

---

## C. MiClass CP Data Audit

### C.1 Bagaimana CP dibangun dan diberi versi — SEBELUM Pass 3

| Pertanyaan | Jawaban |
|---|---|
| Apakah seluruh berkas masih CP 2024? | **Ya.** `shared/data/cp-data.json` memuat 220 mata pelajaran, dan seluruhnya berasal dari kumpulan CP 2024. Tidak ada satu pun yang berasal dari 046/H/KR/2025. |
| Apakah hanya sebagian? | Tidak — seluruhnya. |
| Apakah metadata menyebut 32/H/KR/2024? | **Tidak menyebut apa pun.** `cp-data.json` sama sekali tidak punya penanda regulasi, versi, tanggal, atau sumber. Sidecar `cp-data.meta.json` hanya memuat `{algorithm, revision, source}` — SHA-256 integritas berkas, bukan otoritas isinya. Satu-satunya klaim versi di seluruh repositori ada di `cp-acuan.json` (`"versi_cp": "Kepmendikbudristek 032/H/KR/2024"`), dan klaim itu salah bentuk sekaligus salah nomor. |
| Bagaimana peramban memilih CP? | `guru/classroom.html:225` `fetch('../shared/data/cp-data.json')` → `window._cpData`. `lookupCpElemen(mapel, fase)` menormalkan nama mapel jadi kunci, mengambil `elemen[]`, dan menyusun `{id, label, cp_text}`. |
| Bagaimana Edge Function mendapatkan CP? | **TIDAK mendapatkannya dari `cp-data.json` sama sekali.** `generate-atp` membaca kolom `atp_induk.elemen_cp` — POTRET yang ditulis peramban (`rancang-chat.js:2230`) saat baris ATP dibuat. Tidak ada pembacaan berkas CP, tidak ada perbandingan, tidak ada penanda versi. |
| Apakah ada hash/version/source metadata? | Hash ada (SHA-256 di sidecar, dipakai `scripts/validate-canonical-cp.ts`). Version dan source **tidak ada**. Hash membuktikan berkasnya tidak berubah — bukan bahwa isinya masih berlaku. |
| Apakah guru saat ini melihat CP 2024 di layar? | **Ya.** Layar konfirmasi Tab Rancang menampilkan `cp_umum` dan `cp_text` dari `cp-data.json`, yang seluruhnya CP 2024. |

### C.2 Lubang paling besar yang ditemukan audit ini

Karena Edge Function membaca **potret** `elemen_cp`, ATP yang dibuat sebelum CP
diperbarui membawa teks CP lama **di dalam barisnya sendiri**. Memperbarui
`cp-data.json` saja tidak menyentuhnya. Menyusun ulang ATP itu berarti memetakan
CP yang sudah dicabut, dengan seluruh gerbang hijau dan tanpa satu pun peringatan.

Pass 3 menutupnya dengan `periksaParitasCp()` (§I), bukan dengan migrasi data.

### C.3 Cakupan Pass 3

Yang diperbarui **hanya** `bahasa_inggris.fase_e`. 219 mata pelajaran lain dan
keempat fase Bahasa Inggris lainnya **tetap CP 2024 dan tetap belum diaudit** —
tetapi tidak satu pun dari mereka mengklaim diri sebagai layanan yang tersedia:
`cp-acuan.json` hanya memuat satu kombinasi, dan gerbang menutup semua yang tidak
ada di sana. Sistem tidak mengklaim kombinasi lain sebagai current.

---

## D. Bahasa Inggris Fase E — 2024 vs 2025

| Elemen | 2024 (32/H/KR/2024 — dicabut) | 2025 (046/H/KR/2025 — berlaku) | Dampak terhadap ATP |
|---|---|---|---|
| **Menyimak - Berbicara** | Tiga kalimat: (1) *berkomunikasi dengan guru, teman sebaya dan orang lain dalam berbagai macam situasi*; (2) *memahami alur informasi secara keseluruhan, gagasan utama dan detail dalam teks lisan fiksi dan non-fiksi*; (3) *mengungkapkan pendapat dan mempertahankan argumen* | Dua anak kalimat: *memahami alur informasi secara keseluruhan, gagasan utama dan detail dalam teks lisan fiksi dan non fiksi …; menggunakan bahasa Inggris untuk mengungkapkan pendapat dan mempertahankan argumen tentang topik yang dibahas* | **Satu tuntutan HILANG**: berkomunikasi lisan umum dengan guru/teman sebaya/orang lain tidak lagi dirumuskan di Fase E. TP yang menargetkannya kini menuntut lebih daripada yang CP minta. |
| **Membaca - Memirsa** | *membaca dan **merespon** berbagai macam teks **seperti narasi, deskripsi, prosedur, eksposisi, recount, dan report** untuk pembelajaran dan pencarian informasi*; *menganalisis dan **menginterpretasi** informasi **eksplisit dan implisit** … dari teks tulis **dan** multimodal* | *Memahami alur informasi secara keseluruhan, menganalisis dan **menyimpulkan** informasi **tersurat dan tersirat** … tertulis **atau** teks multimodal* | **Tiga perubahan material.** (a) Verba puncak naik: *menginterpretasi* → **menyimpulkan** (infer). (b) *membaca dan merespon* beserta daftar enam jenis teks **hilang** — lingkup materi tidak lagi mengunci genre. (c) Sumber teks berubah dari **DAN** (kumulatif) menjadi **ATAU** (alternatif) — ini yang membalik penilaian layanan multimodal, lihat §G.1. Ditambah satu kemampuan baru: *memahami alur informasi secara keseluruhan* pindah masuk ke elemen ini. |
| **Menulis - Mempresentasikan** | *menulis berbagai jenis teks fiksi dan non-fiksi, **melalui aktivitas yang dipandu**, menggunakan **beragam media** untuk berkomunikasi dan menyajikan gagasan dengan struktur dan unsur kebahasaan yang sesuai dengan tujuan dan konteks komunikatif* | *Mengomunikasikan gagasan dan pengalaman mereka secara **tertulis atau multimodal** … dengan menggunakan **berbagai media presentasi (cetak atau digital)** untuk mencapai tujuan tertentu dengan struktur teks dan unsur kebahasaan yang tepat; **mengungkapkan pendapat dan mempertahankan argumen** tentang topik sehari-hari atau isu terkini* | **Tingkat kemandirian NAIK**: *melalui aktivitas yang dipandu* **dihapus** — murid tidak lagi dirumuskan bekerja dengan pemanduan. **Kompetensi BARU masuk**: mengungkapkan pendapat dan mempertahankan argumen kini juga dituntut pada elemen ini, dengan lingkup topik yang berbeda dari elemen Menyimak-Berbicara. *beragam media* menjadi *berbagai media presentasi (cetak atau digital)* — lebih spesifik, dan justru karena itu menjadi titik sengketa (§G.2). |

**Konsekuensi yang diambil:** tidak ada TP, validator, atau kalibrasi lama yang
dibawa menyeberang. Penguraian dibangun ulang dari nol (§F), dan `MAKS_KATA_JUDUL`
serta `POLA_BAHAN_TERLARANG` tetap dipakai karena keduanya tidak berpangkal pada
isi CP melainkan pada keterbacaan dan batas layanan.

---

## E. Current CP Verbatim Map

Verbatim dari Kepka 046/H/KR/2025, Lampiran II, angka 4 (Fase E), halaman 136–137.
Tanda baca dan ejaan disalin apa adanya, termasuk *non fiksi* (dua kata) pada 4.1
dan 4.2 serta *nonfiksi* (satu kata) pada 4.3.

**4.1 Menyimak - Berbicara (Listening - Speaking)**

> Memahami alur informasi secara keseluruhan, gagasan utama dan detail dalam teks
> lisan fiksi dan non fiksi mengenai berbagai macam topik yang relevan dengan
> topik sehari-hari atau isu terkini; menggunakan bahasa Inggris untuk
> mengungkapkan pendapat dan mempertahankan argumen tentang topik yang dibahas.

**4.2 Membaca - Memirsa (Reading - Viewing)**

> Memahami alur informasi secara keseluruhan, menganalisis dan menyimpulkan
> informasi tersurat dan tersirat dari berbagai jenis teks fiksi dan non fiksi
> tertulis atau teks multimodal tentang topik sehari-hari atau isu terkini.

**4.3 Menulis-Mempresentasikan (Writing - Presenting)**

> Mengomunikasikan gagasan dan pengalaman mereka secara tertulis atau multimodal
> dalam berbagai jenis teks fiksi dan nonfiksi dengan menggunakan berbagai media
> presentasi (cetak atau digital) untuk mencapai tujuan tertentu dengan struktur
> teks dan unsur kebahasaan yang tepat; mengungkapkan pendapat dan mempertahankan
> argumen tentang topik sehari-hari atau isu terkini.

CP 2025 **tidak** merumuskan pernyataan umum per fase untuk Bahasa Inggris —
yang ada hanya rumusan per elemen. Karena itu `cp_umum` dikosongkan, bukan
diisi ringkasan buatan.

---

## F. New Atomic Decomposition

Sepuluh tuntutan, dibangun ulang dari nol. ID baru (`BIE-E25-*`) sengaja berbeda
dari ID lama (`BIE-*`) supaya rujukan ATP lama tidak diam-diam terbaca sebagai
rujukan CP baru.

| ID | Elemen | Kompetensi | Lingkup materi | `sumber_cp` (verbatim) | Logika | Status |
|---|---|---|---|---|---|---|
| BIE-E25-MB-1 | Menyimak - Berbicara | memahami alur informasi secara keseluruhan, gagasan utama, dan detail dalam teks lisan fiksi dan non fiksi | berbagai macam topik yang relevan dengan topik sehari-hari atau isu terkini | "Memahami alur informasi secara keseluruhan, gagasan utama dan detail dalam teks lisan fiksi dan non fiksi mengenai berbagai macam topik yang relevan dengan topik sehari-hari atau isu terkini;" | **AND** objek (alur ∧ gagasan utama ∧ detail); **AND** genre (fiksi ∧ non fiksi); **OR** topik (sehari-hari ∨ isu terkini) | SAFE DECOMPOSITION |
| BIE-E25-MB-2 | Menyimak - Berbicara | menggunakan bahasa Inggris untuk mengungkapkan pendapat secara lisan | topik yang dibahas di kelas | "menggunakan bahasa Inggris untuk mengungkapkan pendapat" | **AND** terhadap MB-3 | SAFE DECOMPOSITION |
| BIE-E25-MB-3 | Menyimak - Berbicara | mempertahankan argumen secara lisan | topik yang dibahas di kelas | "dan mempertahankan argumen tentang topik yang dibahas." | **AND** terhadap MB-2 | SAFE DECOMPOSITION |
| BIE-E25-MM-1 | Membaca - Memirsa | memahami alur informasi secara keseluruhan | berbagai jenis teks fiksi dan non fiksi tertulis atau teks multimodal tentang topik sehari-hari atau isu terkini | "Memahami alur informasi secara keseluruhan," | **AND** terhadap MM-2; **OR** moda (tertulis ∨ multimodal); **OR** topik | SAFE DECOMPOSITION |
| BIE-E25-MM-2 | Membaca - Memirsa | menganalisis dan menyimpulkan informasi tersurat dan tersirat | idem | "menganalisis dan menyimpulkan informasi tersurat dan tersirat dari berbagai jenis teks fiksi dan non fiksi tertulis atau teks multimodal tentang topik sehari-hari atau isu terkini." | **AND** verba (menganalisis ∧ menyimpulkan); **AND** objek (tersurat ∧ tersirat); **AND** genre; **OR** moda; **OR** topik | SAFE DECOMPOSITION |
| BIE-E25-MP-1 | Menulis - Mempresentasikan | mengomunikasikan gagasan dan pengalaman secara tertulis atau multimodal | berbagai jenis teks fiksi dan nonfiksi | "Mengomunikasikan gagasan dan pengalaman mereka secara tertulis atau multimodal dalam berbagai jenis teks fiksi dan nonfiksi" | **AND** objek (gagasan ∧ pengalaman); **OR** moda (tertulis ∨ multimodal); **AND** genre | SAFE DECOMPOSITION |
| BIE-E25-MP-2 | Menulis - Mempresentasikan | menggunakan berbagai media presentasi (cetak atau digital) | penyajian gagasan dan pengalaman yang sudah dikomunikasikan | "dengan menggunakan berbagai media presentasi (cetak atau digital)" | **SENGKETA SUMBER** — lihat §G.2 | **NEEDS HUMAN REVIEW** |
| BIE-E25-MP-3 | Menulis - Mempresentasikan | menghasilkan teks yang mencapai tujuan tertentu dengan struktur teks dan unsur kebahasaan yang tepat | teks fiksi dan nonfiksi yang murid hasilkan | "untuk mencapai tujuan tertentu dengan struktur teks dan unsur kebahasaan yang tepat;" | **KUMULATIF** terhadap MP-1 | SAFE DECOMPOSITION |
| BIE-E25-MP-4 | Menulis - Mempresentasikan | mengungkapkan pendapat secara tertulis atau melalui penyajian | topik sehari-hari atau isu terkini | "mengungkapkan pendapat" | **AND** terhadap MP-5; berbeda dari MB-2 (moda dan lingkup topik berbeda) | SAFE DECOMPOSITION |
| BIE-E25-MP-5 | Menulis - Mempresentasikan | mempertahankan argumen secara tertulis atau melalui penyajian | topik sehari-hari atau isu terkini | "dan mempertahankan argumen tentang topik sehari-hari atau isu terkini." | **AND** terhadap MP-4; **OR** topik | SAFE DECOMPOSITION |

### F.1 Klasifikasi yang diminta §9 untuk elemen Menulis-Mempresentasikan

| Butir | Klasifikasi | Alasan |
|---|---|---|
| 1. *tertulis atau multimodal* | **pilihan moda (ALTERNATIF)** | "atau" di teks Indonesia normatif, dan Panduan 2025 menulis sama. Satu jalur memenuhi penuh. |
| 2. *berbagai media presentasi* | **kompetensi tersendiri**, bukan kualifikator | Ia menuntut tindakan (menggunakan media), bukan sekadar menerangkan mutu teks. Karena itu ia berdiri sebagai BIE-E25-MP-2. |
| 3. *(cetak atau digital)* | **BELUM DAPAT DIPUTUSKAN** | Sumber resmi bertentangan — §G.2. |
| 4. *untuk mencapai tujuan tertentu* | **kompetensi**, digabung ke MP-3 | Ketepatan terhadap tujuan adalah hal yang dinilai, bukan latar. |
| 5. *struktur teks* | **requirement kumulatif**, di MP-3 | "yang tepat" mengikat keduanya sekaligus. |
| 6. *unsur kebahasaan* | **requirement kumulatif**, di MP-3 | idem |
| 7. *mengungkapkan pendapat* | **kompetensi tersendiri** (MP-4) | Anak kalimat setelah titik koma; lingkup topiknya berbeda dari elemen Menyimak-Berbicara. |
| 8. *mempertahankan argumen* | **kompetensi tersendiri** (MP-5) | Kemampuan yang berbeda dari 7: menahan posisi terhadap sanggahan. |

### F.2 Yang sengaja TIDAK dipecah, beserta alasannya

*menganalisis* dan *menyimpulkan* (MM-2) **tidak** dipecah jadi dua tuntutan
meskipun §10 menandai keduanya sebagai verba berbeda. Alasannya bukan
kenyamanan: keduanya berbagi satu anak kalimat sumber yang tidak dapat dibelah
tanpa memutus rujukan verbatim, dan tuntutan tanpa `sumber_cp` kontigu tidak
lolos CASE N. Hubungan AND-nya dinyatakan tegas di `logika`, sehingga tidak ada
yang hilang selain nomor ID.

---

## G. Full-Service Capability Audit

Diukur terhadap daftar kemampuan MiClass di Pass 3 §8, dan terhadap larangan
bergantung pada pekerjaan guru. Penggandaan hasil siap cetak dianggap boleh.

| ID | Dapat dilayani? | Bagaimana | Pekerjaan tambahan guru |
|---|---|---|---|
| BIE-E25-MB-1 | **YA** | MiClass menyusun naskah simakan fiksi dan non fiksi beserta pertanyaan pemahamannya. Teks lisan dihadirkan guru yang membacakan naskah itu atau murid yang berbicara — keduanya teks lisan menurut CP. | tidak ada |
| BIE-E25-MB-2 | **YA** | pemantik, pertanyaan pendapat, petunjuk giliran bicara; interaksi langsung | tidak ada |
| BIE-E25-MB-3 | **YA** | naskah adu argumen, peran penyanggah, rambu bantahan; interaksi antarmurid | tidak ada |
| BIE-E25-MM-1 | **YA** | jalur *tertulis* (ALTERNATIF yang sah) ditempuh penuh: bacaan, teks bertata-letak, tabel, formulir, jadwal, label | tidak ada |
| BIE-E25-MM-2 | **YA** | bacaan + pertanyaan analisis dan penyimpulan, termasuk informasi yang sengaja tersirat, beserta kuncinya | tidak ada |
| BIE-E25-MP-1 | **YA** | contoh teks, kerangka, rambu penulisan, instrumen penilaian untuk fiksi dan nonfiksi | tidak ada |
| BIE-E25-MP-2 | **BELUM DAPAT DIPASTIKAN** | jalur cetak: dokumen siap cetak — teks presentasi, kartu bicara, lembar sajian, selebaran teks. Jalur digital: MiClass tidak menghasilkan slide, berkas presentasi, atau sajian berbasis aplikasi. | bergantung pada §G.2 |
| BIE-E25-MP-3 | **YA** | uraian struktur tiap jenis teks, daftar unsur kebahasaan, contoh benar/keliru, rubrik | tidak ada |
| BIE-E25-MP-4 | **YA** | pemantik isu, kerangka teks pendapat, rubrik | tidak ada |
| BIE-E25-MP-5 | **YA** | data dan fakta pendukung, sanggahan tandingan, rubrik kekuatan argumen | tidak ada |

### G.1 Multimodal BUKAN kekurangan layanan — koreksi terhadap Pass 2

Pass 2 memberi `cakupan_teks: "sebagian"` pada dua tuntutan semata-mata karena
MiClass tidak menghasilkan gambar/video. Terhadap CP 2025 penilaian itu **salah
baca**, dan §9 memang memperingatkannya:

- CP 2025 Membaca-Memirsa: "tertulis **atau** teks multimodal" — **alternatif**.
- CP 2025 Menulis-Mempresentasikan: "secara tertulis **atau** multimodal" — **alternatif**.

Pada keduanya, Kepka dan Panduan 2025 sepakat memakai "atau". Karena CP
menyediakan jalur alternatif, **jalur tertulis adalah pemenuhan normatif penuh**,
bukan pemenuhan sebagian. Empat tuntutan yang di Pass 2 akan berstatus "sebagian"
kini berstatus **dilayani penuh**, dan itu bukan pelonggaran melainkan pembacaan
yang benar atas sumber yang benar.

Perlu dicatat sebaliknya: Panduan 2025 mendefinisikan teks multimodal sebagai
"teks yang mengandung aspek verbal, visual, dan audio" — kumulatif. MiClass
memang tidak dapat menghasilkannya. Justru karena itu penting bahwa CP menyebut
"atau": kalau ia menyebut "dan", kombinasi ini tertutup.

### G.2 SENGKETA SUMBER — `(cetak atau digital)`

Titik yang §9 minta diaudit khusus, dan ternyata memang bermasalah:

| Sumber | Teks Indonesia | Terjemahan Inggris di dokumen yang sama |
|---|---|---|
| **Kepka 046/H/KR/2025**, Lampiran II 4.3 (Fase E) | "berbagai media presentasi **(cetak atau digital)**" | "different media of presentation **(print and digital)**" |
| **Panduan Bahasa Inggris 2025**, butir 4.3 (Fase E) | "berbagai media presentasi **(cetak dan digital)**" | "different media of presentation **(print and digital)**" |
| Kepka 046/H/KR/2025, 5.3 (Fase F) | "(cetak **dan** digital)" | "(print and digital)" |
| Kepka 046/H/KR/2025, Fase F Tingkat Lanjut | "(cetak **atau** digital)" | "(print or digital)" |

Empat hal yang menyusul dari tabel itu:

1. Keputusan yang mengikat (Kepka) menulis **"atau"** untuk Fase E; Panduan
   menulis **"dan"** untuk rumusan yang sama.
2. Terjemahan Inggris di **kedua** dokumen menulis "and" — sehingga terjemahan
   tidak dapat dipakai memenangkan "atau".
3. Fase F di Kepka yang sama menulis "dan", sehingga "atau" pada Fase E **tidak**
   dapat dianggap pola yang konsisten dan disengaja.
4. Fase F Tingkat Lanjut menulis "atau" beserta terjemahan "or" — membuktikan
   dokumen ini **mampu** membedakan keduanya saat memang bermaksud begitu, yang
   justru membuat ketidaksesuaian pada Fase E lebih berat, bukan lebih ringan.

**Konsekuensinya menentukan hasil gerbang:**

- Kalau **ALTERNATIF**: jalur cetak memenuhi penuh → MiClass sanggup →
  kombinasi ini `FULLY SUPPORTED`.
- Kalau **KUMULATIF**: media presentasi digital wajib → MiClass tidak
  menghasilkannya, dan memenuhinya menuntut guru menyediakan perangkat,
  aplikasi, atau berkas → `NOT SUPPORTED`.

Saya **tidak memilih** di antara keduanya. Memilih "atau" adalah bacaan yang
paling nyaman bagi produk, dan §9 melarang persis itu. Statusnya
`NEEDS HUMAN REVIEW`, dan gerbang bersikap konservatif: belum terbukti dapat
dilayani diperlakukan sebagai belum dapat dilayani.

**Yang dibutuhkan untuk menutup ini** adalah satu keputusan manusia atas
pertanyaan: apakah Fase E menuntut media presentasi cetak *dan* digital
sekaligus, atau salah satunya cukup. Kalau jawabannya "salah satunya cukup",
kombinasi ini terbuka dengan mengubah satu nilai di `cp-acuan.json` — tanpa
menyentuh kode.

---

## H. Service Gate Result

```
Bahasa Inggris × Fase E   →   NOT SUPPORTED
```

Dua alasan, keduanya dikembalikan `statusLayanan()` apa adanya:

1. `Penguraian tuntutan CP kombinasi ini belum selesai ditinjau.`
   (`review_status: "pending"` — §12 melarang menyimpan klaim pemeriksaan manusia
   yang belum terjadi, dan `diperiksa_oleh: "manusia"` sudah dibuang.)
2. `Tuntutan CP yang belum terbukti dapat MiClass layani: BIE-E25-MP-2.`

Seluruh kombinasi lain: `NOT SUPPORTED` (tidak ada uraiannya).

**Tidak ada status `partially supported` di mana pun.** Enum-nya hanya dua nilai,
dan CASE T menegakkannya.

**Yang perlu Romo putuskan.** Tiga guru GURU_PRO yang gerbangnya dibuka
7 September 2026 akan kehilangan Tab Rancang begitu perubahan ini di-deploy.
Karena tidak ada deploy dan tidak ada push di Pass 3, **hari ini tidak ada guru
yang terpengaruh**. Membukanya kembali tidak menuntut penulisan kode: cukup
keputusan §G.2 ditambah penerimaan peninjau.

---

## I. Updated CP Gate

Gerbang lama hanya menanyakan "apakah kombinasi ini ada di acuan". Sekarang:

```text
SUPPORTED
=  acuan ada
AND acuan.versi_cp === VERSI_CP_BERLAKU ('046/H/KR/2025')
AND acuan.versi_cp ∉ VERSI_CP_DICABUT   ('32/H/KR/2024', '032/H/KR/2024')
AND acuan.review_status === 'diterima'
AND cakupan.tidak_dilayani = ∅
AND cakupan.perlu_telaah   = ∅
```

Salah satu false → **NO GENERATE**, dan **tidak memakai kuota AI**: kedua gerbang
berdiri sebelum `fn_check_rate_limit` dan sebelum panggilan AI mana pun. Urutan
itu diuji oleh `CASE I: gerbang acuan CP berdiri sebelum rate limit di Edge Function`.

**Empat lapis:**

| Lapis | Apa yang diperiksa | Berkas |
|---|---|---|
| Peramban | `statusLayananCp()` — aturan yang sama persis | `guru/js/rancang-chat.js` |
| Edge Function, langkah 5a | `statusLayanan()` | `supabase/functions/generate-atp/index.ts` |
| Edge Function, langkah 4b (**BARU**) | `periksaParitasCp()` — teks CP di `atp_induk.elemen_cp` vs CP yang berlaku; kode `ATP_CP_VERSI_LAMA`, HTTP 409 | idem |
| Uji | `CASE P/Q/R/T` | `tests/atp-kontrak.test.ts` |

**Kompatibilitas ATP lama.** ATP yang berisi potret CP 2024 **tetap dapat dibaca,
dirender, dan diunduh** sebagai dokumen sejarah — tidak ada perubahan pada jalur
baca maupun DOCX. Yang ditutup hanyalah **menyusun ulang** di atas CP yang tidak
berlaku, dan pesannya mengatakan itu dengan jelas, termasuk saran memulai ATP
baru. `ATP_HASIL.acuan_cp` kini menyimpan `sumber_regulasi`, sehingga ATP lama
dapat dikenali sebagai ATP CP lama alih-alih disangka ATP CP berlaku.

---

## J. Acceptance Cases P–U

| Case | Yang dibuktikan | Hasil |
|---|---|---|
| **P** — current CP version | `VERSI_CP_BERLAKU === '046/H/KR/2025'`; `cp-data.json` dan acuan menyebutnya; `mencabut = '32/H/KR/2024'`; empat rumusan khas CP 2024 (*berkomunikasi dengan guru, teman sebaya dan orang lain*, *membaca dan merespon berbagai macam teks seperti narasi*, *melalui aktivitas yang dipandu*, *menggunakan beragam media untuk berkomunikasi*) **tidak tersisa** sebagai sumber aktif; penanda 2025 (*menyimpulkan informasi tersurat dan tersirat*, *berbagai media presentasi*) ada | **PASS** |
| **Q** — revoked CP cannot generate | kedua ejaan (`32/…`, `032/…`) dikenali sebagai tercabut; tidak satu pun acuan terpasang memakainya; fixture berlayanan penuh yang versinya tercabut tetap dikenali tercabut | **PASS** |
| **R** — exact current CP parity | `cp_normatif` acuan == `cp-data.json` untuk ketiga elemen; potret mutakhir lolos; **potret CP 2024 ditolak dengan tepat 3 masalah**; elemen karangan ditolak; elemen yang hilang ditolak | **PASS** |
| **S** — OR semantics | ≥3 tuntutan bersumber "atau" wajib menyatakan alternatifnya; seluruh tuntutan Membaca-Memirsa berstatus `dilayani` (bukan sebagian) meskipun MiClass tidak menghasilkan multimodal; yang memang kumulatif tetap kumulatif; `logika` benar-benar dikirim ke penyusun; `batas_mutlak` memberi tahu penyusun bahwa jalur alternatif sudah memenuhi | **PASS** |
| **T** — full-service gate | satu tuntutan `tidak_dilayani` → cakupan tidak penuh; satu tuntutan `perlu_telaah_manusia` → **juga** tidak penuh; Bahasa Inggris Fase E nyata-nyata `NOT_SUPPORTED` dengan `BIE-E25-MP-2` disebut; hanya dua kode yang mungkin | **PASS** |
| **U** — no hidden teacher work | seluruh string acuan disapu pola pembebanan pekerjaan kepada guru; frasa yang pernah ada (*menambahkan bahannya sendiri*, *cakupan_teks*, *sebagian terpenuhi*) tidak boleh kembali; tidak ada status layanan di luar tiga yang sah; penyusun diberi larangan yang sama di `batas_mutlak` | **PASS** |

---

## K. Regression A–O

| Case | Status | Catatan |
|---|---|---|
| A | hijau | angka `7` → `10` — jumlah tuntutan CP 2025, bukan pelonggaran |
| B, C, D, E, F, G | hijau | tanpa suntingan |
| H (×2) | hijau | tanpa suntingan |
| I (×2) | hijau | `7` → `10`; komentar diluruskan karena keberadaan uraian dan keputusan layanan kini terpisah |
| J (×3) | hijau | tanpa suntingan |
| K, L, M | hijau | tanpa suntingan — arah delegasi A17/A19 Pass 2 dipertahankan utuh |
| **N** | **dibangun ulang** | terhadap CP 2025; kini juga memeriksa paritas `versi_cp` acuan vs sumber, identitas `cp_normatif`, kesahihan `status_dekomposisi`, keberadaan AND/OR di `logika`, dan kesahihan `layanan` |
| **O** | **direcompute** | `7` yang ditulis tangan diganti `WAJIB_BI.length`; lantai naik 4 → 5 karena tuntutan 7 → 10 |
| CAKUPAN, KEPADATAN, DASAR, BAHASA, ARITMETIKA, JUDUL | hijau | tanpa suntingan |

**Tidak ada expected test yang diubah agar hijau.** Tiga uji yang angkanya
berubah berubah karena jumlah tuntutan CP memang berubah, dan setiap perubahannya
dicatat di `docs/ATP-FINALIZATION-CHANGE-EVIDENCE.md` §19.

### K.1 Matriks kepadatan TP, direcompute untuk 10 tuntutan

`hitungTargetTp()` **tidak dibongkar** (Pass 3 §13). Yang berubah hanya batas
bawahnya, karena batas bawah memang turunan jumlah tuntutan CP: `ceil(10/2) = 5`
menggantikan `ceil(7/2) = 4`.

| JP | Satuan | Pertemuan | Readiness | Tuntutan | min | maks | Target TP | JP/TP |
|---:|---:|---:|---|---:|---:|---:|---:|---:|
| 48 | 4 | 12 | sesuai | 10 | 5 | 6 | **5** | 9,6 |
| 48 | 4 | 12 | sedikit_di_bawah | 10 | 5 | 6 | **5** | 9,6 |
| 48 | 4 | 12 | belum_diketahui | 10 | 5 | 6 | **5** | 9,6 |
| 48 | 4 | 12 | sangat_beragam | 10 | 5 | 6 | **5** | 9,6 |
| 48 | 4 | 12 | jauh_di_bawah | 10 | 5 | 6 | **5** | 9,6 |
| 72 | 4 | 18 | sesuai | 10 | 5 | 9 | **7** | 10,3 |
| 72 | 4 | 18 | sedikit_di_bawah | 10 | 5 | 9 | **6** | 12,0 |
| 72 | 4 | 18 | belum_diketahui | 10 | 5 | 9 | **6** | 12,0 |
| 72 | 4 | 18 | sangat_beragam | 10 | 5 | 9 | **5** | 14,4 |
| 72 | 4 | 18 | jauh_di_bawah | 10 | 5 | 9 | **5** | 14,4 |
| 108 | 4 | 27 | sesuai | 10 | 5 | 13 | **11** | 9,8 |
| 108 | 4 | 27 | sedikit_di_bawah | 10 | 5 | 13 | **9** | 12,0 |
| 108 | 4 | 27 | belum_diketahui | 10 | 5 | 13 | **9** | 12,0 |
| 108 | 4 | 27 | sangat_beragam | 10 | 5 | 13 | **8** | 13,5 |
| 108 | 4 | 27 | jauh_di_bawah | 10 | 5 | 13 | **8** | 13,5 |
| 126 | 2 | 63 | sesuai | 10 | 5 | 16 | **13** | 9,7 |
| 126 | 2 | 63 | sedikit_di_bawah | 10 | 5 | 16 | **11** | 11,5 |
| 126 | 2 | 63 | belum_diketahui | 10 | 5 | 16 | **11** | 11,5 |
| 126 | 2 | 63 | sangat_beragam | 10 | 5 | 16 | **9** | 14,0 |
| 126 | 2 | 63 | jauh_di_bawah | 10 | 5 | 16 | **9** | 14,0 |
| 144 | 4 | 36 | sesuai | 10 | 5 | 16 | **14** | 10,3 |
| 144 | 4 | 36 | sedikit_di_bawah | 10 | 5 | 16 | **12** | 12,0 |
| 144 | 4 | 36 | belum_diketahui | 10 | 5 | 16 | **12** | 12,0 |
| 144 | 4 | 36 | sangat_beragam | 10 | 5 | 16 | **10** | 14,4 |
| 144 | 4 | 36 | jauh_di_bawah | 10 | 5 | 16 | **10** | 14,4 |

Kasus batas:

| Kasus | Target |
|---|---|
| 16 JP, sesuai, 10 tuntutan | 3 (min 3, maks 3) |
| 24 JP, jauh_di_bawah, 10 tuntutan | 3 (min 3, maks 3) |
| 48 JP, sesuai, 2 tuntutan | 5 (min 3, maks 6) |
| 48 JP, sesuai, 12 tuntutan | 6 (min 6, maks 6) |
| 400 JP, sesuai, 10 tuntutan | 16 (min 5, maks 16) |
| 400 JP, jauh_di_bawah, 10 tuntutan | 16 (min 5, maks 16) |

**Satu akibat yang perlu dilihat.** Pada 48 JP, lantai CP (5) kini bertemu batas
atas (6) sehingga **kesiapan murid tidak lagi mengubah jumlah TP di anggaran
sekecil itu**. Ini bukan cacat baru dan bukan perubahan rumus — ia akibat
langsung lantai naik dari 4 ke 5. Sifat yang reviewer minta dipertahankan tetap
utuh: bounded, berbasis JP, tidak linear tanpa batas, dan kesiapan rendah tidak
pernah menambah jumlah TP. Status formulanya tetap
`HEURISTIC PRODUCT — provisional for semantic test`.

---

## L. Tests Run

```
deno test --allow-read tests/atp-kontrak.test.ts       → ok | 35 passed | 0 failed
node tests/atp-acuan-sinkron.mjs                       → LULUS
node tests/atp-trace.mjs --periksa                     → LULUS
deno run --allow-read scripts/validate-canonical-cp.ts → seluruh gerbang PASS/DENIED sesuai harapan
deno check supabase/functions/generate-atp/kontrak.ts  → Check ok
deno check supabase/functions/generate-atp/index.ts    → Check ok
deno check supabase/functions/generate-atp/acuan-cp.ts → Check ok
node --check guru/js/rancang-chat.js                   → ok
node --check guru/js/classroom-unduh.js                → ok
```

Baseline Pass 3 adalah 29 uji; sekarang **35**. Enam tambahan: `CASE P`, `Q`,
`R`, `S`, `T`, `U`.

**Tidak dijalankan, dan sengaja:** `supabase db push`, `supabase functions deploy`,
`git commit`, `git push`, seluruh query ke production DB, dan semantic
live-generate.

---

## M. Files Changed

| Berkas | Status | Gerbang Pass 3 |
|---|---|---|
| `shared/data/cp-data.json` | diubah (hanya `bahasa_inggris.fase_e`, 23 baris) | §4 |
| `shared/data/cp-data.meta.json` | hash diperbarui | §4 |
| `shared/data/cp-acuan.json` | ditulis ulang seluruhnya | §5, §6, §7, §12 |
| `supabase/functions/generate-atp/acuan-cp.ts` | dibangkitkan ulang | §4 |
| `supabase/functions/generate-atp/kontrak.ts` | diubah — gerbang, cakupan, paritas | §11 |
| `supabase/functions/generate-atp/index.ts` | diubah — dua gerbang baru sebelum kuota | §11 |
| `guru/js/rancang-chat.js` | diubah — gerbang klien mencerminkan server | §11 |
| `guru/classroom.html` | versi cache `chat-20260910a2` → `a3` | operasional |
| `sw.js` | `miclass-v25` → `miclass-v26` | operasional |
| `tests/atp-kontrak.test.ts` | `CASE N` dibangun ulang, `P`–`U` baru, `A`/`I`/`O` disesuaikan | §16, §17 |
| `tests/atp-acuan-sinkron.mjs` | tipe acuan baru | §5 |
| `docs/ATP-FINALIZATION-CHANGE-EVIDENCE.md` | ditambah bagian PASS 3 (§13–§20) | §18.O |
| `docs/ATP-FINALIZATION-CHANGE-EVIDENCE.diff` | dibangkitkan ulang (6.573 baris) | §18.O |
| `docs/ATP-CURRENT-CP-AUTHORITY-REPORT.md` | **baru** | §18 |

`guru/js/classroom-unduh.js`, `guru/js/rancang-chat-flow.js`, dan
`generate-modul` **tidak disentuh** di Pass 3.

---

## N. Remaining Gaps

1. **`(cetak atau digital)` belum terputus.** Gap yang paling menentukan.
   Sumber resmi bertentangan, dan gerbang tertutup karenanya. Butuh satu
   keputusan manusia; sesudahnya kombinasi ini terbuka lewat perubahan data.
2. **Penguraian sepuluh tuntutan belum ditinjau manusia.** `review_status:
   "pending"` menyatakannya apa adanya. Jumlah pemecahan yang tepat — sepuluh,
   bukan delapan atau dua belas — adalah penilaian kurikulum.
3. **219 mata pelajaran lain masih CP 2024 dan belum diaudit.** Tidak berbahaya
   hari ini karena tak satu pun berada di acuan, sehingga gerbang menutup
   semuanya. Ia menjadi pekerjaan besar begitu kombinasi kedua dibuka.
4. **`cp-data.json` masih tanpa penanda versi menyeluruh.** Metadata regulasi
   baru ada di `bahasa_inggris.fase_e`. Berkas ini belum punya cara menyatakan
   "sebagian isi saya sudah 2025, sebagian masih 2024" selain per fase.
5. **ATP produksi yang ada seluruhnya membawa potret CP 2024.** Keempatnya kini
   akan ditolak saat disusun ulang (`ATP_CP_VERSI_LAMA`) — perilaku yang benar,
   tetapi belum pernah dilihat guru sungguhan. Tampilan "dokumen sejarah" pada
   layar dan DOCX juga belum diberi penanda visual; yang tersimpan baru
   `sumber_regulasi` di dalam data.
6. **Keluaran semantik masih belum pernah diuji terhadap model sungguhan.** Tidak
   berubah sejak Pass 2, dan kini bertambah satu hal yang harus ikut diuji:
   apakah penyusun benar-benar memperlakukan jalur ALTERNATIF sebagai pemenuhan
   penuh alih-alih menuntut kedua jalur.
7. **`periksaParitasCp()` membandingkan teks, bukan menandatanganinya.** Potret
   yang diedit tangan agar sama persis akan lolos. Untuk sekarang cukup, karena
   penulisnya adalah peramban yang sama yang memuat `cp-data.json`.
8. **Elemen `nama` sengaja dipertahankan pada ejaan 2024** ("Menulis -
   Mempresentasikan"; Kepka 2025 menulis "Menulis-Mempresentasikan"). Alasannya
   stabilitas id elemen di seluruh ATP yang ada. Bedanya hanya spasi, tetapi ia
   memang bukan ejaan resmi 2025.

---

## O. CHANGE EVIDENCE — VERBATIM

```
docs/ATP-FINALIZATION-CHANGE-EVIDENCE.md    — §13–§20 memuat Pass 3, BEFORE/AFTER verbatim
docs/ATP-FINALIZATION-CHANGE-EVIDENCE.diff  — git diff HEAD + berkas baru, 6.573 baris, tidak diringkas
```

---

`ATP ACCEPTANCE PASS 3 — READY FOR REVIEW`
