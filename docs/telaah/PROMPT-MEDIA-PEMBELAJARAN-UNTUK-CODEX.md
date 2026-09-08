# Prompt konsultasi media pembelajaran — untuk Codex

> Ini BUKAN telaah cacat. Ini permintaan pendapat ahli tentang arah produk.
>
> Lampirkan bersama prompt ini:
> - `Modul_TP2_Membaca_simbol_dan_teks_petunj.docx` — contoh nyata masalahnya
> - `ATP_Bahasa_Inggris_FaseE.docx`
> - Kedua PDF panduan
>
> Disusun 9 September 2026.

---

## PROMPT (salin mulai baris berikut)

Anda sudah tiga kali menelaah keluaran MiClass, jadi Anda mengenal produknya.
Kali ini saya tidak meminta telaah cacat. **Saya meminta pendapat Anda sebagai
ahli tentang satu keputusan arah produk yang belum saya ambil.**

### Masalah yang memunculkan pertanyaan ini

Telaah Anda yang terakhir menemukan: modul TP 2 meminta murid membaca **simbol**
perawatan pakaian, tetapi bahan yang disediakan hanya teks. Tidak ada satu pun
gambar simbol di seluruh berkas.

Setelah ditelusuri, akarnya bukan kelalaian penulisan. Akarnya adalah fakta yang
belum pernah dinyatakan di mana pun dalam sistem:

> **MiClass hanya menghasilkan teks. Tidak pernah gambar, ikon, foto, audio,
> maupun video.**

Selama ini mesin tidak mengetahui batas itu, jadi ia menyusun pelajaran yang
menuntut media yang tidak akan pernah ada — dan guru baru menemukannya saat
sudah berdiri di depan kelas.

Sekarang saya harus memutuskan apa yang MiClass lakukan tentang media. Dan saya
tidak ingin memutuskannya sendiri dari sudut pandang teknis.

### Yang perlu Anda ketahui tentang kelasnya

Ini bukan sekolah dengan sarana lengkap. Angka-angka berikut dari kelas nyata
yang menghasilkan berkas terlampir:

- **10 murid**
- **Ada proyektor dan pengeras suara**
- **TIDAK ADA internet yang bisa diandalkan** — ini lazim di kelas sasaran kami
- Guru mengajar Bahasa Inggris di program keahlian Busana, di sela jam padat
- Terbiasa WhatsApp dan YouTube; tidak terbiasa perkakas teknis
- Dokumen akhirnya adalah berkas Word yang **dicetak dan diarsipkan**

Perhatikan konsekuensi yang mudah terlewat: **punya proyektor tidak berarti punya
bahan untuk diproyeksikan.** Alat dan bahan adalah dua hal berbeda — pembedaan
itu sudah tiga kali kami perbaiki di tempat yang berbeda.

### Yang sudah terbukti mungkin secara teknis

Saya sudah menguji ini, bukan memperkirakan:

1. **MiClass bisa menggambar bentuk vektor dan menyisipkannya ke Word.** Rantai
   SVG → PNG → dokumen berjalan sepenuhnya di peramban guru: tanpa server, tanpa
   internet, tanpa biaya. Sekitar 3 KB per gambar.
2. **MiClass bisa menuliskan teks apa pun**, termasuk perintah siap salin untuk
   dipakai guru di layanan pembuat gambar di luar aplikasi.
3. **MiClass TIDAK bisa** menghasilkan foto, audio, atau video. Itu bukan
   keterbatasan yang akan hilang; itu keputusan biaya dan mutu.

Yang belum diketahui: apakah AI bisa diandalkan menggambar **simbol berstandar**
(ISO 3758) secara tepat. Dugaan saya tidak — model bahasa lemah pada geometri
presisi, dan simbol yang salah lebih berbahaya daripada tidak ada simbol, karena
guru akan mengajarkannya sebagai benar.

### Yang saya minta dari Anda

**Bukan daftar panjang gagasan.** Saya minta penilaian ahli yang menyaring.

Untuk setiap media yang menurut Anda layak dipertimbangkan, tulis:

```
MEDIA     : apa persisnya
UNTUK APA : kebutuhan belajar yang mana — kapan ia benar-benar diperlukan,
            bukan sekadar mempercantik
SUMBER    : MiClass membuatnya | guru menyediakannya | pihak ketiga
LURING    : bekerja tanpa internet? ya / tidak
RISIKO    : apa yang rusak kalau ini salah atau tidak tersedia
PUTUSAN   : kerjakan sekarang | nanti | jangan sama sekali
```

Lalu jawab lima pertanyaan ini secara langsung:

**1. Media apa yang benar-benar dibutuhkan guru Bahasa Inggris SMK**, dan mana
yang sebenarnya hanya membuat dokumen terlihat lebih bagus? Saya lebih
membutuhkan Anda memangkas daripada menambah.

**2. Untuk objek belajar yang wujudnya visual atau bunyi** — simbol perawatan,
diagram pola, percakapan yang harus didengar — mana yang lebih tepat:

   - MiClass menggambar/menyediakannya sendiri,
   - MiClass menyuruh guru membawa benda nyata dari lingkungannya,
   - atau pelajaran itu dirancang ulang supaya tidak bergantung padanya?

   Untuk kasus simbol perawatan, kelasnya adalah bengkel busana yang penuh
   pakaian berlabel. Apakah itu mengubah jawaban Anda?

**3. Video.** Kami tidak memproduksinya. Apakah menurut Anda MiClass sebaiknya
   (a) tidak menyentuh video sama sekali, (b) menyarankan guru mencarinya
   sendiri, atau (c) sesuatu yang lain? Ingat kelasnya sering tanpa internet.

**4. Apakah "MiClass menuliskan perintah siap salin untuk pembuat gambar AI"**
   ide yang baik? Saya melihat dua sisi: untuk gambar ilustratif tampak
   berguna, untuk gambar yang harus tepat tampak berbahaya. Apakah pembedaan
   itu benar menurut Anda, atau ada cara berpikir yang lebih baik?

**5. Apa yang paling sering salah** saat modul ajar memuat media, menurut
   pengalaman Anda memeriksa dokumen pembelajaran? Saya ingin tahu jebakannya
   sebelum membangun, bukan sesudah.

### Batasan yang saya minta Anda patuhi

- **Jangan mengarang ketentuan.** Kalau panduan tidak menetapkan sesuatu tentang
  media, katakan begitu, lalu nyatakan pendapat Anda sebagai pendapat.
- **Utamakan yang bekerja tanpa internet.** Gagasan yang menuntut sambungan
  stabil hanya berguna bagi sebagian kecil guru sasaran kami.
- **Perhitungkan waktu guru.** Setiap media yang harus guru siapkan sendiri
  adalah pekerjaan tambahan yang tidak ia setujui. Kalau menurut Anda pekerjaan
  itu sepadan, katakan alasannya.
- **Boleh menjawab "tidak perlu media tambahan sama sekali".** Kalau menurut
  Anda modul teks yang ditulis baik sudah cukup untuk pembelajaran bahasa di
  konteks ini, itu jawaban yang saya hargai — dan lebih jarang diberikan
  daripada daftar fitur.

### Penutup yang saya minta

Tiga hal, singkat:

1. **Tiga media terpenting**, diurutkan. Kalau saya hanya sanggup membangun tiga,
   mana yang paling mengubah pembelajaran di kelas.
2. **Apa yang sebaiknya TIDAK dibangun**, beserta alasannya. Ini sama pentingnya.
3. **Apa yang perlu saya ketahui tetapi belum saya tanyakan.** Anda melihat
   produk ini dari luar; saya melihatnya dari dalam dan pasti ada yang tidak
   saya sadari.

## (akhir prompt)
