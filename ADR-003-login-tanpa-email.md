# ADR-003 — Login Tanpa Email + Model Bisnis SIP Mandiri

Status: ACCEPTED
Tanggal: 3 Agustus 2026
Decider: Romo (Teguh Riyono)

---

## Konteks

SIP Mandiri adalah produk komersial yang dijual ke guru aktif di sekolah.
Siswa dan ortu adalah pengguna akhir yang tidak boleh dibebani proses
teknis seperti membuat akun, mengingat email, atau mengingat password.
Semua akun siswa dan ortu di-generate oleh guru.

---

## Keputusan

### K1 — Login Siswa: Kode Kelas + Nama + NIS

Siswa tidak pernah melihat atau mengetik email. Login dilakukan dengan:
- Kode kelas (didapat dari guru via QR code atau link)
- Nama lengkap
- NIS

Sistem construct kredensial di balik layar:
- Email: `{nis}.{classroom_code}@sipmandiri.local`
- Password: NIS

### K2 — Login Ortu: Kode Kelas + Nama Anak + NIS Anak

Ortu tidak pernah melihat atau mengetik email. Login dilakukan dengan:
- Kode kelas (didapat dari guru via QR code atau link)
- Nama lengkap anak
- NIS anak

Sistem construct kredensial di balik layar:
- Email: `ortu.{nis}.{classroom_code}@sipmandiri.local`
- Password: NIS anak

### K3 — Akun Siswa dan Ortu Di-generate oleh Guru

Guru generate akun dari halaman Kelola Classroom. ~~Dua~~ **Dua** mode:
- Satu per satu: tombol "Generate Akun" per baris siswa
- ~~Sekaligus: tombol "Generate Semua" untuk semua siswa yang belum punya akun~~ **[DIHAPUS — 4 Agustus 2026]**
- Batch terpilih: checkbox multi-select + tombol "Generate Terpilih" **[BARU — 4 Agustus 2026]**

Setiap generate akun siswa otomatis generate akun ortu jika nama ortu
sudah diisi di roster.

**Generate Terpilih** memvalidasi bahwa semua siswa yang dipilih belum
punya akun — jika ada yang sudah punya akun, seluruh operasi ditolak
dengan pesan penolakan (tidak ada partial generate).

### K4 — Data Siswa dan Ortu via Manual atau Upload Excel

Guru input data siswa dengan dua cara:
- Manual: ketik nama siswa, NIS, nama ortu (opsional) satu per satu
- Upload Excel: file dengan kolom nama_siswa, nis, nama_ortu (boleh kosong)

Satu baris = satu siswa + satu ortu. Satu siswa hanya punya satu ortu.

### K5 — QR Code + Share Link per Kelas

Setiap kelas punya QR code dan link unik yang mengandung kode kelas:
- Siswa: `sipmandiri.com/siswa?kode={classroom_code}`
- Ortu: `sipmandiri.com/ortu?kode={classroom_code}`

Siswa/ortu scan QR atau klik link → kode kelas terisi otomatis →
tinggal ketik nama dan NIS. Ketik manual tetap bisa sebagai fallback.

### K6 — Session 30 Hari

Session siswa dan ortu dikonfigurasi 30 hari di Supabase dashboard.
Siswa/ortu tidak perlu login ulang selama 30 hari sejak login terakhir.
Ini menghemat kuota MAU Supabase secara signifikan.

### K7 — Model Bisnis: Trial + Berbayar

Alur aktivasi guru:
- Trial 30 hari gratis — akses penuh
- Setelah trial: transfer pembayaran → Romo verifikasi → kirim link
  aktivasi via email DAN WhatsApp → guru aktif 365 hari
- Perpanjangan: data tetap tersimpan, guru langsung lanjut bekerja

Trial habis tanpa bayar:
- Semua data dihapus permanen (hard delete)
- Jika kemudian bayar, mulai dari awal

Masa aktif habis (365 hari) tanpa perpanjang:
- Akun terkunci otomatis
- Data tetap tersimpan
- Aktif kembali setelah perpanjang

### K8 — Notifikasi Expiry via Banner + Email

Notifikasi dikirim pada:
- H-30: banner di dashboard + email
- H-7: banner di dashboard + email
- H-1: banner di dashboard + email

Untuk trial habis tanpa bayar (hard delete):
- H-7: banner + email peringatan data akan dihapus
- H-1: banner + email peringatan data akan dihapus

### K9 — Fitur Pendukung Bisnis

- Floating WhatsApp button untuk support guru
- Tombol download data per kelas (format diputuskan kemudian)
- Tombol "Lupa Password" di halaman login guru

---

## Perubahan dari ADR-002

| ADR-002 | ADR-003 |
|---------|---------|
| Siswa daftar sendiri via 3 langkah | Guru yang generate akun siswa |
| Ortu daftar sendiri via nama+NIS siswa | Guru yang generate akun ortu |
| Login siswa via NIS saja | Login siswa via kode+nama+NIS |
| Tidak ada model bisnis | Trial 30 hari + berbayar 365 hari |
| Tidak ada QR code | QR code + share link per kelas |

---

## Schema yang Perlu Ditambah

Kolom baru di tabel `profiles` untuk guru:
- `trial_started_at` timestamptz — waktu mulai trial
- `activated_at`    timestamptz — waktu aktivasi berbayar
- `expires_at`      timestamptz — waktu akses berakhir
- `is_active`       boolean     — status akun aktif/terkunci

Nilai `expires_at` dan `is_active` dikelola Romo via Supabase dashboard.

---

## Konsekuensi

### Positif
- Siswa dan ortu tidak perlu akun — hambatan adopsi minimal ✅
- Guru kontrol penuh siapa yang bisa masuk classroom ✅
- Model bisnis jelas — trial → berbayar → perpanjang ✅
- Session 30 hari menghemat kuota MAU Supabase ✅
- QR code memudahkan distribusi kode kelas ✅

### Negatif / Trade-off
- Kredensial siswa/ortu deterministik dari NIS — jika NIS bocor,
  akun bisa diakses orang lain. Mitigasi: kode kelas sebagai lapisan
  proteksi pertama
- Hard delete setelah trial adalah keputusan tidak bisa dibalik —
  perlu notifikasi yang cukup jelas sebelum terjadi
- Guru yang lupa generate akun = siswa tidak bisa masuk —
  perlu reminder di UI

---

## Addendum — 4 Agustus 2026

### Perubahan Mode Generate Akun (K3 direvisi)

Tombol "Generate Semua Akun" dihapus dari UI. Mode generate sekarang:
- Satu per satu via tombol "Generate Akun" per baris
- Batch via checkbox multi-select + "Generate Terpilih"

### Fitur Hapus Akun (BARU)

Guru bisa menghapus akun siswa dari halaman Kelola Classroom:
- **Hapus Terpilih** (batch): checkbox multi-select → hapus semua yang dipilih
  - Siswa sudah punya akun → hapus akun + roster via Edge Function `hapus-akun`
  - Siswa belum punya akun → hapus baris roster saja via anon client

Konfirmasi sebelum hapus batch:
- ≤ 10 siswa: `window.confirm`
- > 10 siswa: overlay konfirmasi dengan input teks "HAPUS" (untuk mencegah
  hapus tidak disengaja dalam jumlah besar)

### Trial Gate dan Hapus Terpilih

`updateSelectionUI()` mengecek `isExpired` untuk disable kedua tombol
Generate Terpilih dan Hapus Terpilih saat trial expired. Hapus roster-only
(siswa tanpa akun) tetap diblokir trial gate di UI, meski secara teknis
tidak memerlukan Edge Function.
