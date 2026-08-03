# ADR-002 — Whitelist Siswa dan Mekanisme Join

Status: ACCEPTED
Tanggal: 3 Agustus 2026
Decider: Romo (Teguh Riyono)

---

## Konteks

ADR-001 menetapkan bahwa siswa join classroom via classroom_code secara
terbuka — siapapun yang punya kode bisa masuk. Kebutuhan baru: guru perlu
mengontrol siapa yang boleh join. Hanya siswa yang datanya sudah diinput
guru yang bisa membuat akun dan masuk ke classroom.

---

## Keputusan

### K1 — Guru Input Daftar Siswa Sebelum Siswa Bisa Join

Guru wajib menginput nama + NIS siswa ke dalam classroom sebelum siswa
bisa membuat akun. Siswa yang NIS-nya tidak ada di daftar akan ditolak.

### K2 — Tabel `classroom_roster` sebagai Whitelist

Data siswa yang diinput guru disimpan di tabel terpisah `classroom_roster`,
bukan langsung di `profiles`. `profiles` hanya berisi user yang sudah
punya akun aktif.

Struktur:
- full_name  → nama siswa (diinput guru)
- nis        → NIS siswa (diinput guru, unik per classroom)
- profile_id → NULL sampai siswa buat akun, diisi saat akun dibuat

### K3 — Siswa Join dengan NIS

Siswa membuka portal siswa → masukkan classroom_code + NIS →
sistem verifikasi NIS ada di roster classroom tersebut →
jika ada, siswa buat akun (nama sudah terisi dari data guru) + password →
profile_id di roster diisi → siswa masuk classroom.

### K4 — Ortu Join dengan Nama Siswa + NIS Siswa

Ortu tidak punya baris di roster. Ortu verifikasi identitas dengan
kombinasi nama siswa + NIS siswa di classroom yang dituju.
Jika cocok, ortu buat akun + password dan terhubung ke profile_id siswa
via linked_student_id di classroom_members.

Tidak ada kolom NIK — ortu diverifikasi via data siswa yang sudah ada.

### K5 — Guru Bisa Input Manual atau Upload Bulk

Guru bisa menginput siswa satu per satu via form, atau upload file
Excel/CSV dengan kolom: nama, NIS. Sistem import dan simpan ke
classroom_roster.

### K6 — NIS Unik per Classroom, Bukan Global

UNIQUE constraint pada (classroom_id, nis) — satu NIS bisa muncul
di classroom yang berbeda (guru berbeda), tapi tidak boleh duplikat
dalam satu classroom.

---

## Perubahan Schema

### Tabel Baru: `classroom_roster`

```sql
CREATE TABLE classroom_roster (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id  uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id    uuid NOT NULL REFERENCES profiles(id),
  full_name     text NOT NULL,
  nis           text NOT NULL,
  profile_id    uuid REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (classroom_id, nis)
);
```

### Perubahan Tabel `profiles`

Tambah kolom:
- nis  text — diisi saat siswa buat akun, NULL untuk guru/ortu

---

## Alternatif yang Ditolak

### Alternatif A — Siswa Join Terbuka (ADR-001 awal)
Ditolak karena guru tidak bisa mengontrol siapa yang masuk classroom.

### Alternatif B — NIK untuk Verifikasi Ortu
Ditolak karena menambah beban input guru (harus kumpulkan NIK ortu)
dan lebih kompleks. Verifikasi via nama + NIS siswa lebih sederhana
dan data yang guru sudah punya.

---

## Konsekuensi

### Positif
- Guru kontrol penuh siapa yang bisa join ✅
- Ortu tidak perlu data tambahan di luar nama + NIS anak ✅
- Schema tetap sederhana — satu tabel tambahan ✅

### Negatif / Trade-off
- Guru wajib input data siswa sebelum siswa bisa join — langkah ekstra
- Jika NIS salah diinput guru, siswa tidak bisa masuk — perlu fitur edit roster
