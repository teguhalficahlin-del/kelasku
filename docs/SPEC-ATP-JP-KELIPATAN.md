# Spesifikasi Perilaku — ATP yang mustahil dipenuhi

> Status: **PERILAKU DISETUJUI ROMO — implementasi berjalan.**
> Menutup Temuan 1 telusur mesin generate, 5 September 2026.
>
> Keputusan Romo, 5 September 2026: **dibulatkan ke bawah.** 32,5 pertemuan
> menjadi 32. Pilihan "minta guru membetulkan angkanya" ditutup — lihat §6.
>
> Lingkup bertambah tiga hal atas keputusan Romo pada sesi yang sama — semuanya
> lahir dari pemeriksaan `docs/DAFTAR-PERTANYAAN-RANCANG.md`. Lihat **§7**.

---

## 1. Keadaan sekarang

Saat menyusun ATP, MiClass menuntut dua hal sekaligus dari AI:

- jatah JP setiap TP harus kelipatan **satuan pertemuan** guru;
- jumlah seluruh jatah TP harus sama persis dengan **JP tersisa untuk mengajar**.

Jumlah bilangan kelipatan 4 selalu kelipatan 4. Jadi kalau JP tersisa bukan
kelipatan satuan pertemuan, **tidak ada jawaban yang benar**. Bukan AI-nya yang
kurang pintar — soalnya memang tidak punya jawaban.

JP tersisa dihitung begini:

```
JP tersisa = (JP per minggu × minggu efektif)
             − JP kegiatan khusus
             − (minggu cadangan × JP per minggu)
             − JP pemetaan awal
             − JP penguatan awal
```

Suku pertama dan ketiga selalu kelipatan JP per minggu. Yang merusak
keseimbangan hanya tiga angka yang diketik bebas oleh guru:
**JP kegiatan khusus** (0–200), **JP pemetaan awal** (1–12), dan
**JP penguatan awal** (1–24). Tidak ada satu pun pemeriksaan kelipatan pada
ketiganya, di klien maupun di server.

### Yang dialami guru hari ini

Guru mengajar 4 JP per minggu, 36 minggu, cadangan 2 minggu. Di fase Profil
Siswa ia menjawab "pemetaan awal 2 JP" — jawaban paling wajar untuk sebuah tes
awal singkat.

JP tersisa = 144 − 8 − 2 = **134**. Dibagi 4 menyisakan 2.

1. Guru menekan "Buat draf ATP". Menunggu. → "AI gagal menghasilkan ATP yang valid. Silakan coba lagi."
2. Menekan "Coba lagi". Menunggu. → pesan yang sama.
3. Menekan "Coba lagi" sekali lagi. → "Batas generate ATP harian (3×) untuk ATP ini tercapai. Coba lagi besok."
4. Besok, lusa, minggu depan: sama persis.

Tidak ada satu kata pun yang menunjukkan bahwa yang salah adalah angka 2 di fase
Profil Siswa. Guru itu tidak punya jalan keluar.

### Kenapa belum ada laporan

Keempat ATP di produksi punya JP pemetaan = 0 dan JP penguatan = 0 — kedua
pertanyaan itu belum pernah dijawab dengan angka sungguhan. Satu-satunya
pengurang yang terpakai, JP kegiatan khusus, kebetulan bernilai 4 dan 12,
keduanya kelipatan 4. Dua ATP yang berhasil, berhasil karena **kebetulan**.

---

## 2. Perilaku yang diusulkan

**Prinsip: sistem yang menyesuaikan, bukan guru yang berhitung.**

Guru SMK menjawab "2 JP untuk tes awal" karena itulah rencananya. Ia tidak
seharusnya diminta memikirkan apakah 134 habis dibagi 4. MiClass yang tahu
satuan pertemuannya, jadi MiClass yang membereskan sisanya — lalu memberi tahu.

Cara memikirkannya dalam satuan yang dipakai guru: **jumlah pertemuan dibulatkan
ke bawah.** 32,5 pertemuan menjadi 32. Setengah pertemuan tidak bisa diajarkan,
jadi tidak dijadwalkan.

### Aturan inti

Setiap kali JP tersisa dihitung, kalau ia tidak habis dibagi satuan pertemuan:

1. JP tersisa **dibulatkan ke bawah** ke kelipatan satuan pertemuan terdekat.
2. Selisihnya dicatat sebagai barisnya sendiri — **JP tidak terjadwal** —
   bukan dibuang dan bukan disembunyikan.
3. Guru diberi tahu dalam satu kalimat, di ringkasan waktu yang memang sudah ia baca.

> **Kenapa bukan ditambahkan ke cadangan.** `jp_cadangan` selalu hasil
> `minggu cadangan × JP per minggu`. Menambahinya 2 JP membuat angka itu tidak
> lagi cocok dengan jawaban guru sendiri, dan guru yang menghitung ulang akan
> menemukan selisih yang tidak bisa ia jelaskan. Baris tersendiri lebih jujur
> dan kalimatnya justru lebih pendek.

Satuan pertemuan diambil dari pola jadwal yang sudah ditanyakan:

| Pola jadwal guru | Satuan pertemuan |
|---|---|
| Reguler — seluruh JP dalam satu pertemuan | JP per minggu |
| Reguler — dibagi beberapa pertemuan | JP per sesi |
| Sistem blok | JP per sesi |
| Pola belum dijawab, atau JP per sesi kosong | *tidak ada penyesuaian — lihat §2.3* |

### 2.1 Ketika guru menyelesaikan fase Waktu

Ringkasan waktu yang sudah ada sekarang berbunyi:

```
Alokasi kalender: 144 JP
Kegiatan khusus: 12 JP
Cadangan: 8 JP
Sisa sementara: 124 JP
```

Kalau sisa itu tidak habis dibagi satuan pertemuan, ringkasan bertambah satu
baris — dan hanya baris ini yang baru:

```
Alokasi kalender: 144 JP
Kegiatan khusus: 10 JP
Cadangan: 8 JP
Sisa sementara: 126 JP
Tidak terjadwal: 2 JP (kurang dari satu pertemuan penuh)
JP untuk mengajar: 124 JP — 31 pertemuan
```

Guru tetap punya tombol "Ubah data waktu" yang sudah ada. Ia tidak dipaksa
melakukan apa pun.

### 2.2 Ketika guru mengisi JP pemetaan awal atau JP penguatan awal

Kedua angka ini ditanyakan di fase yang berbeda, jauh setelah fase Waktu, dan
keduanya mengubah JP tersisa lagi. Perlakuannya sama persis: penyesuaian
dihitung ulang, dan guru diberi tahu satu kalimat **saat itu juga**, bukan
ditahan sampai ringkasan berikutnya.

> **Ketika** guru menjawab "2 JP" pada pertanyaan pemetaan awal, dengan jadwal
> 4 JP per pertemuan,
> **yang terjadi adalah** MiClass menampilkan:
> "Dicatat: 2 JP untuk pemetaan awal. JP mengajar jadi **132 JP — 33 pertemuan
> penuh**. Sisa 2 JP tidak cukup untuk satu pertemuan, jadi tidak dijadwalkan."
> lalu melanjutkan ke pertanyaan berikutnya tanpa jeda.

Angka yang guru ketik sendiri — 2 JP untuk pemetaan awal — **tidak pernah
diubah.** Yang dibulatkan hanya jumlah pertemuan mengajar.

Guru tidak ditanya, tidak dihentikan, dan tidak diminta mengulang.

### 2.3 Ketika satuan pertemuan belum diketahui

Terjadi pada dua keadaan: guru memilih "dibagi beberapa pertemuan" atau "sistem
blok" tetapi JP per sesi tidak terisi. Ini bukan kasus karangan — satu ATP di
produksi persis begitu, dan ia menghasilkan nol TP.

> **Ketika** pola jadwal terisi "dibagi beberapa pertemuan" tetapi JP per sesi
> kosong,
> **yang terjadi adalah** MiClass menanyakan ulang JP per sesi sebelum guru bisa
> lanjut, dengan kalimat: "MiClass perlu tahu berapa JP dalam satu pertemuan
> untuk membagi materi. Tanpa itu, alur pembelajaran tidak bisa disusun."

Pertanyaan itu berhenti bisa dilewati.

### 2.4 Pemeriksaan terakhir sebelum ATP disusun

Guru bisa melompat mundur dari layar persetujuan ("Ubah alokasi waktu", "Ubah
pengulangan kemampuan dasar") dan lewat di belakang ketiga titik di atas. Karena
itu penyesuaian dihitung **sekali lagi** tepat sebelum permintaan dikirim, dan
angka yang dikirim ke server adalah angka yang sudah disesuaikan.

Ini yang menjamin aturannya, bukan tiga titik sebelumnya. Tiga titik sebelumnya
ada supaya guru melihat apa yang terjadi pada waktunya, bukan sebagai kejutan.

### 2.5 Penjaga di server

Klien berjalan dari berkas JS yang tersimpan di peramban guru, dan riwayat
proyek ini sudah mencatat versi cache yang terlewat dinaikkan. Guru yang masih
memegang JS lama akan tetap mengirim angka yang mustahil.

Karena itu server memeriksa hal yang sama. Kalau JP tersisa tidak habis dibagi
satuan pertemuan, permintaan ditolak **sebelum jatah generate dipotong**, dengan
sebab yang jelas — bukan dibiarkan gagal dua kali lalu menghabiskan jatah.

> Pemeriksaan ini aritmetika murni: ia tidak mungkin salah menuduh. Berbeda dari
> gerbang validator Modul yang harus dikalibrasi ke modul nyata, di sini tidak
> ada yang perlu diukur — 134 memang tidak habis dibagi 4.

**Catatan pelaksanaan:** hari ini jatah dipotong di baris 229, sebelum ATP
dibaca di baris 248. Supaya penolakan ini tidak ikut memakan jatah, pemotongan
jatah harus dipindah ke belakang validasi. Itu juga membereskan Temuan 3 —
sekarang ATP yang datanya belum lengkap pun memakan satu dari tiga jatah harian.

---

## 3. Yang TIDAK berubah

- Tidak ada pertanyaan baru untuk guru. Jumlah layar tetap sama.
- Tidak ada pertanyaan lama yang dihapus.
- Rentang jawaban yang diperbolehkan tidak dipersempit — guru tetap boleh
  menjawab 2 JP untuk pemetaan awal.
- Aturan kelipatan di sisi AI tidak dilonggarkan. Yang berubah hanya:
  soalnya sekarang selalu punya jawaban.
- ATP yang sudah ada tidak disentuh dan tidak perlu disusun ulang.

## 4. Berkas yang akan terpengaruh

| Berkas | Perubahan |
|---|---|
| `guru/js/rancang-chat.js` | `calculateAllocation()` menghitung penyesuaian; tiga titik pemberitahuan; penjaga sebelum generate |
| `guru/js/rancang-chat-flow.js` | JP per sesi berhenti bisa dilewati untuk pola dibagi/blok |
| `guru/classroom.html` | nomor versi cache JS dinaikkan |
| `supabase/functions/generate-atp/index.ts` | penjaga kelipatan; pemotongan jatah dipindah ke belakang validasi |

Tidak ada migration. Tidak ada perubahan schema. Tidak ada data lama yang
dimigrasikan.

## 5. Cara memverifikasi

Tanpa melibatkan Romo, lewat panel Browser sesudah satu kali login:

1. ATP baru, 4 JP/minggu, 36 minggu, cadangan 2 minggu, pola reguler satu pertemuan.
2. Di Profil Siswa jawab pemetaan awal **2 JP** — angka yang hari ini mematikan ATP.
3. Yang harus terlihat: kalimat penyesuaian muncul, dan ATP selesai disusun.
4. Ulangi dengan JP penguatan awal **3 JP** — dua pengurang sekaligus.
5. Ulangi dengan pola "dibagi beberapa pertemuan" dan JP per sesi dikosongkan.
6. Baca `atp_induk.collected_data->'WAKTU'->'perhitungan'` lewat
   `supabase db query --linked` dan pastikan JP operasional yang tersimpan
   habis dibagi satuan pertemuan.

Jatah 3× per hari per ATP tetap berlaku selama pengujian, jadi setiap ATP uji
dibuat baru — bukan ATP yang sama diulang.

---

## 6. Keputusan yang sudah diambil

**Kalau JP tersisa tidak pas dibagi, MiClass yang membulatkan sendiri, atau
guru yang diminta membetulkan angkanya?**

**Keputusan Romo, 5 September 2026: MiClass membulatkan ke bawah.**
32,5 pertemuan menjadi 32.

Pilihan kedua — meminta guru mengetik ulang angkanya — ditutup, dan alasannya
dicatat di sini supaya tidak diperdebatkan ulang: ia tidak memberi guru kendali
lebih besar. Pada contoh Bu Sri, membetulkan berarti menaikkan tes awal dari
2 JP ke 4 JP, karena turun ke 1 JP juga tidak pas dan satu-satunya arah adalah
naik. JP mengajarnya berakhir di 132 pada kedua pilihan. Bedanya cuma: pada
pilihan pertama sisanya menganggur, pada pilihan kedua sisanya terpakai untuk
tes yang dua kali lebih panjang daripada yang guru rencanakan.

Biaya yang tetap diakui: MiClass memberi tahu, tapi tidak meminta izin. Yang
diringankan — angka yang guru ketik sendiri tidak pernah diubah; yang dibulatkan
hanya jumlah pertemuan mengajar, dan sisanya tampil sebagai barisnya sendiri di
ringkasan.

---

# 7. Lingkup tambahan — keputusan Romo 5 September 2026

Ketiganya lahir dari pemeriksaan `docs/DAFTAR-PERTANYAAN-RANCANG.md`. Dikerjakan
dalam putaran yang sama karena ketiganya menyentuh berkas alur yang sama dan
diuji dalam satu kali jalan di Browser.

## 7a. Pertanyaan kemampuan awal — tanpa syarat

**Masalah.** Lima dari delapan pertanyaan fase Profil Siswa hanya muncul bagi
guru yang menjawab "Belum ada data sama sekali". Guru yang menjawab "Ya, saya
sudah punya data" — yang paling tahu keadaan muridnya — tidak pernah ditanya
apa isi data itu, dan tidak punya tempat menyatakan muridnya jauh tertinggal.

**Perilaku baru.** Satu pertanyaan, ditanyakan kepada SEMUA guru apa pun jawaban
soal ketersediaan data, diletakkan tepat sesudahnya:

> **Dibandingkan kemampuan yang diharapkan di awal fase ini, di mana murid Anda
> sekarang?**
> - Sudah sesuai — bisa langsung masuk materi fase ini
> - Sedikit di bawah — perlu penyegaran singkat di awal
> - Jauh di bawah — banyak kemampuan dasar yang harus dibangun dulu
> - Sangat beragam — ada yang siap, ada yang jauh tertinggal

Opsi keempat wajib ada: itu keadaan paling umum di SMK dan sekarang sama sekali
tidak terwakili.

**Sampai ke AI tanpa perubahan Edge Function** — seluruh fase Profil Siswa sudah
dikirim lewat `unwrapPhaseData(cd.PROFIL_SISWA)`.

**Yang TIDAK dikerjakan sekarang:** menaikkan batas 24 JP penguatan awal, dan
percabangan khusus untuk jawaban "Jauh di bawah". Belum ada satu pun guru yang
pernah bisa menjawab pertanyaan ini, jadi belum ada yang bisa diukur. Pasang
pertanyaannya, lihat jawabannya, baru putuskan.

## 7b. Buang pertanyaan "Apa yang dilakukan dengan instrumen pemetaan?"

**Masalah.** Opsi "Minta MiClass membuat soalnya saat ATP selesai" menjanjikan
dokumen yang tidak ada mesin pembuatnya di seluruh repo. Nilainya memang ikut
terkirim ke AI sebagai keterangan, tapi tidak ada apa pun yang menghasilkan soal
yang dijanjikan.

Dua opsi tersisa — "Pakai soal yang sudah saya punya" dan "Catat rencana dan
lanjutkan ATP" — efeknya identik: dicatat, dikirim sebagai keterangan, tidak
mengubah ATP. Meminta guru memilih di antara keduanya adalah bentuk kecil dari
kebohongan yang sama.

**Keputusan Romo: buang seluruh pertanyaannya**, bukan hanya opsinya. Navigasi
mundur tetap tersedia lewat "Ubah profil siswa" di layar persetujuan ATP.

Yang ikut dibersihkan: penangan navigasi `tindakan_instrumen` = 'ubah'
(`rancang-chat.js:1706`) dan entri label (`rancang-chat.js:1319`). Jawaban lama
di `collected_data` dibiarkan — tidak ada yang membacanya.

## 7c. Perlengkapan kelas ditanyakan eksplisit

**Masalah.** Apakah Modul Ajar boleh menyebut proyektor, HP, atau internet
ditentukan oleh satu baris di `generate-modul/index.ts:1198` yang menyimpulkannya
dari centang sumber belajar:

```ts
return arr.includes('modul_digital') || arr.includes('video');
```

Guru tidak pernah ditanya apakah kelasnya punya perangkat. Guru yang mencentang
"Video pembelajaran" karena sesekali memutar video mendapat modul yang bebas
mengandaikan internet stabil; guru yang punya proyektor tapi mencentang "Artikel"
dan "Lingkungan sekitar" mendapat modul yang dilarang menyebut proyektor.

**Perilaku baru.** Pertanyaan pilih-banyak di fase Sumber & Strategi jalur Modul,
tepat setelah pertanyaan sumber belajar:

> **Perlengkapan apa yang benar-benar tersedia di kelas ini?** Pilih semua yang ada.
> - Proyektor / LCD
> - Laptop atau komputer guru
> - Komputer atau laptop untuk murid
> - HP murid boleh dipakai untuk belajar
> - Koneksi internet yang bisa diandalkan
> - Speaker atau pengeras suara
> - Lab atau bengkel praktik
> - Printer atau mesin fotokopi untuk menggandakan lembar kerja
> - *Tidak ada — hanya papan tulis dan alat tulis* (eksklusif)

Dua opsi di luar yang Romo sebutkan, beserta alasannya:

- **Printer.** Telaah ahli kurikulum menemukan naskah menyuruh guru membagikan
  lembar yang tidak pernah dibuatkan sistem, pada 4 dari 5 modul. Kalau guru
  tidak bisa menggandakan, seluruh rancangan berbasis lembar kerja memang tidak
  bisa dipakai. Ini satu-satunya pertanyaan yang menutup kelas cacat itu dari hulu.
- **Komputer murid dipisah dari laptop guru.** Satu proyektor di depan kelas dan
  satu laptop per murid menghasilkan rancangan yang sama sekali berbeda.

**Yang berubah di mesin.** `perangkatDigitalDiizinkan()` berhenti menebak dan
membaca jawaban ini. Nilainya **tetap boolean** supaya seluruh aturan
SYSTEM_PROMPT yang ada tidak perlu ditulis ulang — hanya sumbernya yang berganti.
Selain itu daftar perlengkapannya sendiri ikut dikirim ke prompt, sehingga modul
hanya boleh menyebut alat yang benar-benar ada. Guru yang punya proyektor tanpa
speaker berhenti menerima instruksi memutar audio.

**Kompatibilitas mundur — wajib.** Modul yang sudah ada dan guru yang perambannya
masih memegang JS lama tidak punya jawaban ini. Kalau jawabannya tidak ada,
sistem **kembali ke penyimpulan lama** dari daftar sumber. Tanpa ini setiap modul
yang sedang berjalan berubah perilaku diam-diam.

**Risiko yang diketahui: SYSTEM_PROMPT membesar.** Lima kali plafon token roboh
di berkas ini bukan karena keluarannya membesar melainkan karena sesuatu di
sekitarnya bertambah — Fase A pernah gagal dengan sisa empat token. Tambahannya
dijaga sependek mungkin (satu aturan menggantikan sebagian aturan lama, bukan
menumpuk), dan `tests/validator-modul.ts` dijalankan sebelum dan sesudah.

**Yang TIDAK dikerjakan sekarang:** memindahkan jawaban ini ke `rancang_settings`
per kelas. Tempat yang benar memang di sana — perlengkapan milik kelas, bukan
milik modul, dan guru dengan 6 modul kini menjawabnya 6 kali. Tapi itu menambah
satu migration, dan pertanyaannya perlu ada dulu serta terbukti jawabannya
dipakai. Pemindahannya bisa menyusul kapan saja tanpa membuang apa pun.
