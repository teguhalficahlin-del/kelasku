# REQUIREMENTS — MIClass
# Spesifikasi Kebutuhan Produk

Versi: 0.1 (Draft)
Tanggal: 30 Juli 2026
Status: REVIEW

---

## 1. LATAR BELAKANG

MIClass adalah varian entry-level dari ekosistem Student Insight Platform,
dirancang untuk guru aktif di sekolah yang belum berlangganan SIP SMK versi institusi.

Satu atau beberapa guru dari sekolah yang sama dapat menggunakan MIClass
secara independen — tanpa koordinasi sistem antar guru, tanpa entitas sekolah
di dalam platform.

MIClass bukan untuk kegiatan di luar sekolah (les privat, bimbel).
Target pengguna adalah guru aktif yang mengajar di sekolah nyata.

---

## 2. TARGET PENGGUNA

| Persona | Deskripsi |
|---------|-----------|
| **Guru** | Guru aktif di sekolah, mendaftar mandiri, mengelola classroom sendiri |
| **Siswa** | Siswa aktif di sekolah, join classroom guru via kode, satu akun untuk semua classroom |
| **Ortu** | Orang tua siswa, join via kode siswa, akses terbatas ke data anak |

### Karakteristik Pengguna
- Guru tidak perlu izin institusi untuk mendaftar
- Satu guru bisa punya 1 sampai banyak classroom
- Satu siswa bisa terdaftar di classroom dari guru yang berbeda — cukup satu akun
- Ortu linked ke satu siswa, bisa lihat semua classroom yang diikuti anaknya

---

## 3. BATASAN PRODUK (SENGAJA TIDAK ADA)

| Item | Alasan |
|------|--------|
| Entitas sekolah (`school_id`) | Guru daftar mandiri — tidak terikat institusi di sistem |
| Role jabatan (WAKA, KEPSEK, TU, dll) | Tidak ada hierarki institusi |
| Portal admin institusi | Tidak ada admin sekolah |
| Koordinasi antar guru | Guru dari sekolah yang sama tidak terhubung di sistem |
| Absensi formal | Di luar scope versi ini |
| Notifikasi push | Fase berikutnya |
| Perangkat Ajar / AI pipeline | Fase berikutnya |
| Approval workflow | Tidak ada hierarki jabatan |

---

## 4. FITUR PER PORTAL

### 4.1 Portal Guru (`guru/`)

#### Onboarding
- Daftar akun (email + password)
- Buat classroom pertama saat onboarding
- Generate `classroom_code` otomatis
- Bagikan kode ke siswa

#### Manajemen Classroom
- Buat classroom baru
- Edit nama dan deskripsi classroom
- Arsipkan classroom (tidak hapus data)
- Lihat daftar siswa yang terdaftar per classroom
- Lihat daftar ortu yang terhubung per classroom

#### Catatan Siswa
- Tulis catatan per siswa per classroom
- Set visibilitas per catatan:
  - Hanya guru (default)
  - Visible ke siswa
  - Visible ke ortu
- Edit dan hapus catatan sendiri (hapus permanen)
- Filter catatan per siswa

#### Sesi Pembinaan
- Rekam sesi pembinaan per siswa
- Catat tanggal, durasi, ringkasan
- Visibilitas: hanya guru (tidak bisa dibagikan)

#### Forum Classroom
- Buat posting ke seluruh classroom
- Siswa dan ortu bisa baca dan komentar
- Guru bisa hapus komentar (hapus permanen)

#### Jadwal
- Input jadwal per classroom (hari, jam mulai, jam selesai, mata pelajaran)
- Siswa dan ortu bisa lihat jadwal classroom masing-masing

---

### 4.2 Portal Siswa (`siswa/`)

- Login satu akun untuk semua classroom
- Dashboard: daftar semua classroom yang diikuti
- Per classroom:
  - Lihat catatan yang di-flag `is_visible_to_student = true`
  - Baca dan komentar forum
  - Lihat jadwal
- Join classroom baru via `classroom_code`

---

### 4.3 Portal Ortu (`ortu/`)

- Login satu akun
- Dashboard: data anak yang di-link
- Per classroom anak:
  - Lihat catatan yang di-flag `is_visible_to_parent = true`
  - Baca dan komentar forum
  - Lihat jadwal
- Join via `classroom_code` → sistem tampilkan daftar siswa yang sudah terdaftar di classroom tersebut → ortu pilih nama anaknya → akun ortu di-linked ke siswa tersebut

---

### 4.4 Onboarding (`onboarding/`)

- Daftar akun guru
- Pilih role saat daftar: GURU / SISWA / ORTU
- Alur per role:
  - GURU: buat classroom pertama → generate kode → selesai
  - SISWA: masukkan `classroom_code` → terdaftar → selesai
  - ORTU: masukkan `classroom_code` → sistem tampilkan daftar siswa yang sudah join classroom tersebut → pilih nama anak → terdaftar → selesai

---

## 5. ATURAN BISNIS KRITIS

1. **Isolasi data per classroom** — guru hanya akses data classroom miliknya sendiri
2. **Satu akun per orang** — siswa yang ikut banyak classroom cukup satu login
3. **Visibilitas catatan dikontrol guru** — siswa/ortu tidak bisa minta akses catatan
4. **Sesi pembinaan selalu private** — tidak ada flag visibilitas, selalu hanya guru
5. **Classroom diarsip, tidak dihapus** — data historis harus tetap tersimpan
6. **Ortu linked ke siswa, bukan ke classroom** — ortu otomatis akses semua classroom anaknya
7. **Guru tidak bisa lihat data classroom guru lain** — meski dari sekolah yang sama di dunia nyata

---

## 6. NON-FUNCTIONAL REQUIREMENTS

| Item | Target |
|------|--------|
| Platform | Mobile-first, browser (PWA opsional fase berikutnya) |
| Device | Low-end Android (RAM 2GB, koneksi tidak stabil) |
| Auth | Supabase Auth (JWT) |
| Offline | Tidak di versi ini |
| Bahasa UI | Bahasa Indonesia |
