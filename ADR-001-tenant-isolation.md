# ADR-001 — Tenant Isolation MIClass

Status: ACCEPTED
Tanggal: 30 Juli 2026
Decider: Romo (Teguh Riyono)

---

## Konteks

MIClass digunakan oleh guru dari berbagai sekolah secara independen.
Satu atau beberapa guru dari sekolah yang sama bisa pakai MIClass,
tapi mereka tidak terhubung satu sama lain di dalam sistem.

Satu siswa bisa diajar oleh lebih dari satu guru pengguna MIClass —
misalnya Raka diajar Pak Andi (Matematika) dan Bu Sari (Bahasa Inggris),
keduanya dari sekolah yang sama, keduanya pakai MIClass secara mandiri.

Siswa harus bisa login **satu kali** dan mengakses classroom dari semua guru
yang mengajarnya — tanpa perlu akun terpisah per guru.

---

## Keputusan

### K1 — Unit Tenant adalah Classroom, bukan Guru dan bukan Sekolah

Isolasi data dilakukan per `classroom_id`, bukan per `teacher_id` atau `school_id`.

Setiap baris data di tabel fitur (catatan, sesi, forum, jadwal) terhubung ke
satu `classroom_id`. Akses dikontrol berdasarkan keanggotaan di classroom tersebut.

### K2 — Guru Bisa Punya Banyak Classroom

Tidak ada batasan jumlah classroom per guru. Setiap classroom independen —
data tidak bocor antar classroom meski dimiliki guru yang sama.

### K3 — Siswa Bisa Join Banyak Classroom dari Guru Berbeda

Relasi siswa ↔ classroom adalah many-to-many via tabel `classroom_members`.
Satu akun siswa bisa join classroom Pak Andi sekaligus classroom Bu Sari.

### K4 — Tidak Ada Entitas Sekolah di Database

Tidak ada tabel `schools`, tidak ada `school_id` di tabel manapun.
Guru dari sekolah yang sama tidak terhubung di sistem — ini disengaja.

### K5 — `teacher_id` Didenormalisasi ke Setiap Tabel Fitur

Setiap tabel fitur menyimpan `teacher_id` langsung (selain `classroom_id`).
Ini trade-off yang disengaja untuk efisiensi RLS — menghindari JOIN mahal
di dalam USING clause yang dievaluasi per baris.

### K6 — Supabase Project Baru, Terpisah dari SIP SMK

MIClass menggunakan Supabase project tersendiri.
Schema tidak boleh dicampur dengan SIP SMK meski strukturnya mirip.

### K7 — Format `classroom_code`: 8 Karakter Alphanumeric Uppercase

`classroom_code` dibuat dari `upper(substr(md5(random()::text), 1, 8))` — menghasilkan
8 karakter dari set `[0-9A-F]` (hexadecimal uppercase). Entropy ~32-bit.

**Alasan keputusan:**
- 32-bit entropy cukup untuk skala produk ini (ribuan classroom, bukan jutaan)
- 8 karakter mudah dibaca dan diketik guru di lapangan — dibandingkan UUID 36 karakter
- Uppercase menghindari ambiguitas antara `0`/`O` dan `1`/`l`/`I` di font umum
- Tidak ada mekanisme expiry kode di versi ini — guru yang ingin reset kode harus
  membuat classroom baru

**Trade-off yang diterima:** Jika skala produk tumbuh ke ratusan ribu classroom,
kemungkinan tabrakan naik dan perlu ditangani dengan retry loop saat generate kode.

### K8 — Alur Join Ortu: Dipilih dari Siswa yang Sudah Ada di Classroom

Ortu join classroom dengan urutan:
1. Masukkan `classroom_code`
2. Sistem menampilkan **hanya siswa yang sudah terdaftar di classroom tersebut**
3. Ortu memilih nama anaknya dari daftar tersebut
4. Sistem membuat baris `classroom_members` dengan `member_role = 'ORTU'` dan
   `linked_student_id` diisi dengan `profile_id` siswa yang dipilih

**Ortu tidak bisa memilih siswa dari luar classroom** — dropdown hanya berisi
siswa dengan `member_role = 'SISWA'` di classroom tersebut.

**Implikasi:** Siswa wajib join classroom lebih dulu sebelum ortu bisa terhubung.
Guru tidak perlu melakukan tindakan khusus untuk mengaktifkan akses ortu.

### K9 — Delete Strategy: Hard Delete untuk Catatan dan Komentar

`student_notes` dan `forum_comments` menggunakan hard delete — baris langsung
dihapus dari database, tidak ada kolom `is_deleted` atau `deleted_at`.

**Alasan:** Simplicity di fase pertama. Tidak ada kebutuhan audit trail atau
undo di versi ini. Menambah soft delete di kemudian hari lebih mudah daripada
menghapus kolom yang sudah ada dan menangani data tombstone-nya.

### K10 — Delete Strategy Roster: Hard Delete Baris Setelah Hapus Akun [BARU — 4 Agustus 2026]

Saat akun siswa dihapus via Edge Function `hapus-akun`, baris `classroom_roster`
ikut dihapus sepenuhnya (DELETE), bukan hanya di-SET NULL `profile_id`.

**Urutan hapus di Edge Function:**
1. Hapus `student_notes`, `guidance_sessions`, `forum_comments` siswa
2. Query NIS dari `classroom_roster` (untuk delete setelah user hilang)
3. Hapus `classroom_members` siswa
4. `deleteUser(siswa.user_id)` — cascade hapus `profiles`, FK SET NULL `classroom_roster.profile_id`
5. DELETE baris `classroom_roster` menggunakan `classroom_id + nis`

**Untuk siswa yang belum punya akun** (profile_id null): baris roster dihapus
langsung dari frontend via anon client (RLS `pol_roster_guru_all` mengizinkan DELETE
jika `teacher_id = fn_current_profile_id()`). Tidak memerlukan Edge Function.

**FK `classroom_roster.profile_id`** diubah ke `ON DELETE SET NULL`
(migration `20260804000002_fix-fk-hapus-akun.sql`) — baris roster bertahan saat
profiles dihapus, lalu Edge Function menghapus baris tersebut secara eksplisit.

---

## Alternatif yang Ditolak

### Alternatif A — `teacher_id` sebagai tenant anchor (owner-based)

Setiap data hanya bisa diakses oleh guru pemiliknya.

**Ditolak karena:** Siswa yang diajar dua guru berbeda harus punya dua akun
terpisah — bertentangan dengan keputusan K3 (satu login untuk semua classroom).

### Alternatif B — `school_id` sebagai tenant anchor

Guru mendaftar dengan nama sekolah, data diisolasi per sekolah.

**Ditolak karena:** Bertentangan dengan konsep "mandiri" — guru harus bisa
daftar tanpa terikat institusi. Selain itu, guru dari sekolah yang sama
tidak boleh saling melihat data satu sama lain.

---

## Konsekuensi

### Positif
- Satu akun siswa untuk semua classroom ✅
- Guru dari sekolah yang sama tidak bisa saling mengakses data ✅
- Satu guru bisa kelola banyak classroom tanpa batas ✅
- RLS sederhana: cek `classroom_id` membership ✅

### Negatif / Trade-off
- Denormalisasi `teacher_id` harus dijaga konsistensinya via trigger atau
  aplikasi — jika classroom berpindah pemilik (edge case), semua baris fitur
  perlu di-update
- Tidak ada fitur kolaborasi antar guru — jika kebutuhan ini muncul di masa
  depan, perlu ADR baru
- Siswa yang join classroom berbeda dari guru berbeda bisa lihat nama guru lain
  di dashboard mereka — ini acceptable dan by design

---

## Diagram Isolasi

```
[Pak Andi]──owns──[Classroom MTK]──members──[Raka (SISWA)]
                                 └─members──[Ibu Raka (ORTU)]

[Bu Sari] ──owns──[Classroom ENG]──members──[Raka (SISWA)]
                                 └─members──[Ibu Raka (ORTU)]

Pak Andi TIDAK BISA lihat data Classroom ENG
Bu Sari  TIDAK BISA lihat data Classroom MTK
Raka     BISA lihat kedua classroom (login sekali)
Ibu Raka BISA lihat kedua classroom (login sekali)
```
