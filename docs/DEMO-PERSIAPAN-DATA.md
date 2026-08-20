# Persiapan Data Demo MiClass

> Kerjakan **H-1**, bukan pada hari presentasi.
> Pasangan dokumen ini: `DEMO-SKRIP-PRESENTASI.md`.

---

## Kondisi saat dokumen ini ditulis

Diperiksa langsung ke basis data produksi, 20 Agustus 2026:

| Data | Jumlah | Catatan |
|---|---|---|
| Kelas | 1 — **X DPB**, kode `AFDAF1A5` | |
| Siswa di roster | 1 — Dini Andini, NIS `123321` | perlu ditambah |
| Siswa berakun | 1 | |
| Jadwal | 1 — **Kamis 01:54–01:58** | sisa pengujian, **harus diganti** |
| TP/KKTP | 2 | cukup |
| Penilaian | 2 | cukup |
| Nilai tersimpan | 2 | cukup |
| Catatan siswa | 1 | cukup |
| Pesan ortu–guru | 6 | sebaiknya dibersihkan agar demo bersih |

**Akun guru:**

| Email | Tier | Tab Rancang |
|---|---|---|
| `pemdesangaso@gmail.com` | TRIAL | tertutup, tampil banner Guru Pro |
| `parentingtangguh@gmail.com` | GURU_PRO | terbuka |

---

## Keputusan: pakai akun yang mana?

**Saran: pakai akun TRIAL (`pemdesangaso`).**

Alasannya bukan soal fitur, tapi soal risiko panggung. Dengan tier TRIAL, tab
Rancang **otomatis tertutup** dan hanya menampilkan banner "Fitur Guru Pro".
Tidak ada kemungkinan Anda atau peserta tanpa sengaja membukanya, dan
posisinya konsisten dengan slide roadmap: fitur itu memang belum dibuka.

Konsekuensi yang perlu Anda terima: seluruh data demo harus dibuat di kelas
milik akun itu, bukan di X DPB yang sekarang.

Bila Anda memilih tetap memakai `parentingtangguh` karena datanya sudah ada,
**jangan sekali pun menyentuh tab Rancang**, dan siapkan kalimat penolakan yang
sudah ada di skrip.

---

## Daftar periksa H-1

### 1. Berkas Excel daftar siswa

- [ ] Siapkan berkas berisi **30–35 nama** siswa fiktif namun wajar
- [ ] Kolom: `nama`, `nis`, `nama_ortu` — pakai `template-siswa.xlsx` di root repo
- [ ] NIS **wajib angka semua**; baris dengan NIS berhuruf akan dibuang diam-diam
- [ ] Sertakan **Dini Andini / 123321** di dalamnya bila memakai kelas yang sama
- [ ] Simpan di desktop laptop demo, beri nama pendek yang mudah dicari saat gugup

> Nama fiktif tapi wajar. "Siswa 1, Siswa 2" membuat demo terasa seperti mainan.

### 2. Jadwal yang mencakup jam presentasi

**Ini butir paling penting di seluruh dokumen.**

Panel absensi **mengunci diri di luar rentang jam jadwal**. Jadwal yang ada
sekarang Kamis 01:54–01:58 — bila presentasi jam 10.00, tombol absensi mati
dan Anda tidak bisa mengabsen di depan orang.

- [ ] Tab Jadwal & Absensi → hapus atau nonaktifkan jadwal lama
- [ ] Tambah jadwal: **hari presentasi**, jam **mulai 1 jam sebelum acara sampai 2 jam sesudahnya**
      (contoh: acara 10.00 → jadwal 09.00–12.00)
- [ ] Muat ulang halaman, pastikan panel absensi menampilkan sesi **AKTIF**,
      bukan "Sesi belum dimulai" atau "Sesi telah selesai"

### 3. Akun siswa dan orang tua

- [ ] Generate akun untuk **Dini Andini** (dan 2–3 siswa lain sebagai cadangan)
- [ ] Catat kredensialnya di kertas:

```
Kode kelas : ________
Nama anak  : Dini Andini
NIS        : 123321
```

- [ ] **Uji sendiri login orang tua** di HP, sampai berhasil masuk
- [ ] Setelah teruji, **keluar** dari akun itu supaya demo dimulai dari nol

> Login orang tua memerlukan **nama anak yang persis sama** dengan roster.
> Salah satu huruf saja akan ditolak.

### 4. Bersihkan percakapan lama

Ada 6 pesan dari pengujian. Kalau peserta membuka bagian Pesan dan melihat
percakapan uji coba dini hari, kesannya berantakan.

- [ ] Minta dihapus lewat sesi kerja dengan Claude Code, atau
- [ ] Pakai kelas baru yang bersih untuk demo

### 5. Isi awal supaya tidak terlihat kosong

- [ ] **2–3 catatan** untuk siswa berbeda, dengan tanggal yang berbeda
- [ ] **Absensi 2–3 hari sebelumnya** supaya rekap dan Export Excel ada isinya
- [ ] Pastikan **1 penilaian** punya nilai untuk beberapa siswa

> Panel yang kosong membuat produk terasa belum jadi. Panel yang terisi wajar
> membuatnya terasa sudah dipakai orang.

### 6. Uji ekspor

- [ ] Rekap Absensi → **Export Excel** → buka berkasnya, pastikan ada isinya
- [ ] Tab Penilaian → **Unduh Excel**
- [ ] Tab Catatan → **Export Excel**

Ketiganya akan Anda tekan di depan orang. Pastikan tidak ada yang mengunduh
berkas kosong.

### 7. Pemasangan ke layar utama

- [ ] Buka `https://teguhalficahlin-del.github.io/kelasku/` di HP
- [ ] Pastikan bilah **Install** muncul (Android) atau petunjuk Bagikan (iPhone Safari)
- [ ] Pasang, buka dari ikon, pastikan **tanpa bilah alamat**
- [ ] **Hapus lagi** pemasangannya supaya bisa didemokan ulang

> Bila bilahnya tidak muncul karena pernah Anda tutup: hapus data situs di HP,
> atau buka lewat jendela penyamaran.

### 8. Rekaman cadangan

- [ ] Rekam layar seluruh demo, **3 menit**, dari langkah 1 sampai penutup
- [ ] Simpan **di laptop**, bukan di cloud — jaringan tempat acara sering buruk
- [ ] Uji putar tanpa internet

### 9. Cetakan RPM — opsional

Bila ingin mengedarkan contoh keluaran RPM:

- [ ] Jalankan pipeline Rancang sampai Step 7 di akun `parentingtangguh`
- [ ] Unduh RPM Word, **baca sendiri halaman per halaman**
- [ ] Cetak 5–10 eksemplar

> Data pipeline lama sudah terhapus saat reset, jadi harus dibuat ulang.
> Renderer dokumen baru diperbaiki 20 Agustus — periksa sendiri hasilnya
> sebelum dicetak, jangan percaya begitu saja.

---

## Pagi hari presentasi

- [ ] Buka aplikasi di laptop, **login lebih dulu** — jangan login di panggung
- [ ] Buka tab kedua **mode penyamaran** di halaman login orang tua
- [ ] Muat ulang paksa (`Ctrl+Shift+R`) untuk memastikan versi terbaru
- [ ] Periksa panel absensi menampilkan sesi **AKTIF**
- [ ] Matikan notifikasi laptop dan HP
- [ ] Siapkan kertas kredensial orang tua di dekat laptop
- [ ] Siapkan berkas Excel di desktop, tidak terkubur dalam folder

---

## Yang harus dihindari

| Jangan | Akibat |
|---|---|
| Menekan **Hapus Kelas** | Gagal dengan pesan teknis dari basis data |
| Membuka tab **Rancang** | Belum siap |
| Membuat kelas baru di panggung | Modal pilih peran muncul, alur melambat |
| Membersihkan data situs saat demo | Sesi login ikut terhapus, Anda keluar sendiri |
| Mengandalkan wifi tempat acara | Siapkan tethering HP sebagai cadangan |

---

## Bila terjadi kesalahan di panggung

**Aturan tunggal: jangan mencoba memperbaiki di depan orang.**

- Halaman error atau blank → muat ulang sekali. Bila masih, lanjut ke bagian
  berikutnya dan katakan "bagian ini saya tunjukkan lewat rekaman".
- Peserta gagal login sebagai orang tua → pakai tab penyamaran di laptop yang
  sudah disiapkan. Ceritanya tetap utuh.
- Jaringan mati → putar rekaman, narasikan dengan skrip yang sama.

Anda kehilangan ruangan bukan karena ada yang gagal, melainkan karena
menghabiskan 60 detik menatap layar sambil diam.
