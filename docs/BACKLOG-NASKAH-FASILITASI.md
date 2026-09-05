# Naskah Fasilitasi — keadaan, keputusan terbuka, dan sisa pekerjaan

> **Status:** tidak ada pekerjaan mendesak. Ditulis 5 September 2026 setelah sehari
> penuh memperbaiki Naskah Fasilitasi, dan setelah Romo mempertanyakan apakah
> pekerjaan itu sepadan dengan biayanya.
>
> Dokumen ini sengaja berdiri sendiri: sesi mana pun bisa membacanya tanpa konteks
> percakapan sebelumnya.
>
> **HEAD saat ditulis:** `1b329ad` · Edge Function `generate-modul` terdeploy
> dengan gerbang V12–V16.

---

## 1. Baca ini lebih dulu: keputusan terbuka

**Apakah Naskah Fasilitasi layak tetap ada dalam bentuk sekarang?**

Ini bukan pertanyaan retoris, dan menjawabnya lebih berharga daripada seluruh
sisa daftar di dokumen ini.

Naskah adalah dokumen kedua yang dihasilkan berdampingan dengan Modul Ajar:
panduan langkah-demi-langkah berisi ucapan guru, aksi guru, pertanyaan kunci,
dan antisipasi kalau murid kesulitan. Ukurannya **45–58% dari seluruh isi modul**
(diukur pada lima modul di produksi, 5 September 2026).

Yang perlu ditimbang:

**Biayanya nyata dan terukur.** Ia satu fase generate tersendiri, keluaran
terbesar di pipeline, dan sumber hampir seluruh cacat yang ditemukan telaah ahli
kurikulum: tokoh yang dikarang, halaman yang tidak ada, durasi karangan, kutipan
palsu, bahan hantu, dan kriteria penilaian yang disalahsebutkan. Lima gerbang
validator (V12, V13, V15, dan sebagian V17 yang belum dipasang) ada semata-mata
untuk menjinakkannya.

**Manfaatnya belum terbukti.** Peninjau ahli menilai strukturnya bagus dan
berguna. Tapi **belum ada satu pun guru sungguhan yang mengatakan mereka
membutuhkannya**, dan belum ada yang mengajar dengannya.

Kalau naskah dibuat opsional atau dipangkas jadi ringkasan pendek per langkah:
Fase B2 hilang, generate jauh lebih cepat dan lebih jarang gagal, V12 dan V15
tidak perlu ada, plafon token berhenti jadi krisis berulang, dan seluruh masalah
"batas otoritas antara dua dokumen" lenyap karena tidak ada dokumen kedua yang
bisa bertentangan dengan yang pertama.

**Cara menjawabnya bukan dengan berdiskusi.** Berikan satu modul ke satu atau dua
guru SMK, minta mereka benar-benar mengajar dengannya, lalu tanyakan bagian mana
yang dibuka dan bagian mana yang dilewati. Kalau Naskah Fasilitasi tidak pernah
dibuka, separuh sistem baru saja terbukti bisa dihemat.

---

## 2. Apa yang sudah beres — jangan dikerjakan ulang

Semua sudah terpasang di produksi dan terverifikasi:

- **Bahasa manusia di Modul Ajar.** Nol kode mesin di kelima modul, kedua tab.
  Kunci opsi diterjemahkan sebelum masuk prompt, jadi strategi yang dipilih guru
  tidak lagi salah tercatat.
- **Batas otoritas Naskah.** Naskah menerima ISI instrumen (baris dialog,
  instruksi peran, label indikator), bukan hanya namanya. Ia berhenti mengarang
  tokoh, halaman, dan kutipan.
- **Fase B2 jadi permintaan sendiri**, tidak lagi menumpang di Fase C.
- **Tidak ada lagi plafon token berupa angka mati** di `generate-modul`.
- **Sebab teknis kegagalan tampil ke guru** sebagai baris kecil yang bisa disalin.
- **Jaring regresi** di `tests/validator-modul.ts` dengan lima modul contoh.

---

## 3. Sisa cacat yang terverifikasi — semuanya TIDAK mendesak

### 3a. Bahan hantu (4 dari 5 modul)

Naskah menyuruh guru membagikan benda yang tidak pernah dibuatkan sistem:
"lembar format pencatatan pesanan", "kartu simbol grafis", "lembar rumpang",
"lembar panduan kata kunci". Hanya TP 3 yang bersih.

**Aturan validatornya sudah ditulis dan diuji, lalu sengaja TIDAK dipasang**
karena menjatuhkan empat dari lima modul. Gerbang yang menolak 4 dari 5 generate
merugikan guru lebih besar daripada lembar yang harus mereka siapkan sendiri.

Larangannya sudah ada di `aturan_kepatuhan` Fase B2. **Ukur ulang setelah
beberapa generate berikutnya** — kalau angkanya sudah turun ke 1 dari 5, barulah
gerbangnya layak dipasang. Kodenya ada di riwayat commit `d2735f7`.

### 3b. Dua modul lama memuat cacat yang kini sudah dijaga

- TP 5: naskah menyuruh guru menunjuk judul *"How to Sew a Straight Seam"* pada
  lembar yang sebenarnya berjudul *"HOW TO SEW A PATCH POCKET ON A BLOUSE"*.
- TP 6: rubrik ASM-02 menilai empat aspek (K1–K4) padahal KKTP-nya tiga.

Keduanya akan ditolak kalau di-generate hari ini. **Modul lamanya dibiarkan** —
generate ulang memakan jatah dan cacatnya tidak menghalangi mengajar.

### 3c. Urutan alur muncul dalam tiga versi

Pada satu versi TP 6 yang sudah tergantikan, satu pertemuan mengajarkan alur
empat tahap, lalu lima tahap, lalu mnemonic empat tahap dengan kata berbeda.
**Belum diperiksa apakah masih terjadi** di modul sekarang.

---

## 4. Yang TIDAK terbukti sebagai masalah — jangan dikejar

**Kesalahan bahasa Inggris.** Telaah ahli menemukan `Greting`, `for evening
party`, `customer preference on`, `A-line silhouette or a fitted dress`,
`flatter your posture`. **Kelimanya nol di seluruh modul sekarang** — semuanya
hilang begitu modulnya di-generate ulang.

Artinya ini bukan cacat sistemik melainkan **variasi antar-generate**. Membangun
lapisan pemeriksaan bahasa untuk mengejarnya berarti membangun mesin untuk
masalah yang belum tentu ada pada generate berikutnya. Kalau suatu saat dikerjakan,
kerjakan sebagai penjaga konsistensi, bukan sebagai perbaikan bug.

---

## 5. Pelajaran cara kerja — ini yang paling mahal hari ini

**Telaah bukan daftar perintah kerja.** Peninjau bertugas menemukan; memutuskan
mana yang layak dikerjakan adalah pekerjaan berbeda. Dua puluh tiga temuan tidak
berarti dua puluh tiga pekerjaan. Sehari penuh habis karena langkah penyaringan
itu dilewati.

**Verifikasi jangan dibebankan ke Romo.** Seluruh alur generate bisa dijalankan
sendiri lewat panel Browser setelah Romo login sekali, dan keadaan modul bisa
dibaca langsung dari basis data lewat `supabase db query --linked`. Berkali-kali
Romo diminta login, mengeklik, dan menyalin pesan error yang sebenarnya bisa
diambil sendiri.

**Putuskan, lalu laporkan.** Kalibrasi validator, urutan pengerjaan, dan bentuk
harness adalah keputusan teknis — bukan bahan pertanyaan. Yang benar-benar milik
Romo hanya keputusan produk: kode ID dipertahankan atau tidak, modul lama
di-generate ulang atau tidak, bahan hantu dibuatkan sistem atau tidak.

**Ukur sebelum memasang gerbang.** Tiga dari lima aturan validator baru sempat
menjatuhkan modul yang sehat sebelum dipersempit. Jalankan
`deno run --allow-read --allow-write tests/validator-modul.ts` sebelum dan
sesudah menyentuh validator.

---

## 6. Perintah yang berguna

```bash
# Jaring regresi validator — jalankan sebelum & sesudah menyentuh validator
deno run --allow-read --allow-write tests/validator-modul.ts

# Type check wajib sebelum deploy Edge Function
deno check supabase/functions/generate-modul/index.ts

# Keadaan modul di produksi tanpa perlu login
supabase db query --linked -f <(echo "SELECT nomor_tp, status, updated_at FROM public.modul_induk ORDER BY nomor_tp;")

# Sisa jatah generate hari ini untuk sebuah kelas
supabase db query --linked -f <(echo "SELECT identifier, request_count FROM public.rate_limits WHERE endpoint='generate_modul' AND window_start >= CURRENT_DATE;")
```

**Catatan jatah:** batas 5× per hari per kelas, dan **hanya Fase A yang
menghitung**. Percobaan ulang setelah Fase A berhasil tidak memakan jatah sama
sekali — jadi kegagalan di fase belakang boleh diulang tanpa biaya.
