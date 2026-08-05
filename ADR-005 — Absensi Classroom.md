# ADR-005 — Absensi Classroom

Status: ACCEPTED  
Tanggal: 4 Agustus 2026  
Decider: Romo (Teguh Riyono)

---

## ATURAN KERJA CLAUDE CODE

### Kapan lanjut:
- Setelah migration attendance applied dan terverifikasi di Supabase
- Setelah RLS dikonfirmasi aktif dan benar
- Setelah form absensi ter-render dan bisa diinteraksi di browser
- Setelah checklist per section terpenuhi

### Kapan STOP dan lapor:
- Migration mengandung DROP atau ALTER TYPE kolom berisi data
- Ditemukan konflik dengan jadwal atau roster yang tidak diantisipasi
- Perlu keputusan bisnis baru di luar lingkup ADR ini
- Export Excel memerlukan library baru yang tidak tersedia

### Wajib dipatuhi:
- `/sip-start` di awal, `/sip-migration-check` sebelum push, `/sip-invert` sebelum implementasi
- SECURITY DEFINER + REVOKE FROM PUBLIC + REVOKE FROM anon + GRANT TO authenticated
- Semua query filter `classroom_id` — tenant isolation wajib
- Dark theme `--bg-base #0f172a`, `--accent #6366f1` — tidak boleh diubah
- Fluid typography `clamp()` — tidak ada px hardcode
- Mobile-first, fluid tanpa breakpoint hardcode
- WCAG AA minimum 4.5:1 — hitung sebelum commit
- Konsisten dengan pola card dan pagination yang sudah ada di `guru/classroom.html`
- SheetJS sudah tersedia di `shared/js/xlsx.full.min.js` — gunakan untuk export Excel
- Diff verbatim wajib ditampilkan sebelum push
- Verifikasi browser + Supabase Dashboard sebelum laporan akhir

---

## Konteks

Setelah jadwal classroom terbentuk (ADR-004), guru membutuhkan fitur
untuk mencatat kehadiran siswa per sesi. Absensi hanya bisa dilakukan
saat sesi jadwal sedang berlangsung — tidak bisa input di luar jam jadwal.

---

## Keputusan

### K1 — Absensi Aktif Hanya Saat Sesi Jadwal Berlangsung

Form absensi hanya aktif jika dua kondisi terpenuhi:
1. Hari ini ada jadwal aktif untuk classroom ini
2. Waktu sekarang berada dalam rentang `start_time` – `end_time` jadwal

Jika tidak ada jadwal hari ini → tampilkan pesan "Tidak ada jadwal hari ini".
Jika jadwal ada tapi belum mulai → tampilkan "Sesi belum dimulai".
Jika jadwal sudah selesai → form di-disable, data yang tersimpan tidak bisa diubah.

Satu hari bisa punya dua sesi (pagi dan siang) — keduanya valid dan independen.
Setiap sesi mengacu ke `schedule_id` yang berbeda.

### K2 — Default Semua Siswa = Hadir

Saat form absensi dibuka, semua siswa sudah berstatus Hadir secara default.
Guru hanya perlu mengubah status siswa yang tidak hadir.
Ini menghemat waktu signifikan untuk kelas dengan banyak siswa.

### K3 — Status Kehadiran: H / S / I / A

Empat status yang bisa dipilih per siswa:
- **H** — Hadir
- **S** — Sakit
- **I** — Izin
- **A** — Alpha (tidak hadir tanpa keterangan)

Tombol toggle per siswa — hanya satu status aktif dalam satu waktu.
Tampilan: tombol H/S/I/A di sebelah nama siswa, status aktif highlighted.

### K4 — Pagination 10 Siswa, Swipe Kiri/Kanan

Daftar siswa di form absensi dibagi 10 per halaman — konsisten dengan
roster siswa di halaman Kelola Classroom (ADR-003).

Navigasi: tombol ← → + swipe gesture (touchstart/touchend).
Semua status tersimpan di memory saat pindah halaman — tidak hilang.
Tombol Simpan mengirim semua data semua halaman sekaligus.

### K5 — Simpan: Upsert, Yang Terakhir Yang Valid

Data absensi disimpan via upsert dengan conflict key
`(classroom_id, student_id, tanggal, schedule_id)`.

Selama sesi berlangsung, guru bisa simpan berkali-kali — data terakhir
yang menang. Setelah sesi selesai (melewati `end_time`), form di-disable
dan data tidak bisa diubah lagi.

### K6 — Card Ringkasan H/S/I/A

Di atas form absensi: card ringkasan jumlah + persentase per status.
Update otomatis setiap kali status siswa diubah (real-time di UI,
dihitung dari data di memory sebelum disimpan).

Format card:
H: 28 (93%) | S: 1 (3%) | I: 1 (3%) | A: 0 (0%)

### K7 — Rekap Absensi dengan Filter Rentang

Section rekap di bawah form absensi menampilkan tabel agregat.

Filter:
- Preset: Minggu ini / Bulan ini / Semester ini
- Custom: input tanggal mulai dan tanggal selesai

Card agregat di atas tabel (sama dengan K6, tapi untuk seluruh rentang):
Total sesi: 12 | H: 280 (87%) | S: 15 (5%) | I: 12 (4%) | A: 13 (4%)

Tabel rekap per siswa: Nama | H | S | I | A | % Kehadiran

Export ke Excel: tombol "Export Excel" menggunakan SheetJS
(`shared/js/xlsx.full.min.js`) — sudah tersedia di repo.

### K8 — Tidak Ada Batas Kehadiran Minimum

Sistem tidak membatasi atau menandai siswa berdasarkan persentase kehadiran.
Rekap hanya menampilkan data apa adanya — keputusan tindak lanjut ada di guru.

### K9 — Akses Per Role

- **Guru**: input absensi + lihat rekap semua siswa
- **Siswa**: READ rekap kehadiran diri sendiri di portal siswa
- **Ortu**: READ rekap kehadiran anak di portal ortu

### K10 — Timezone

Tanggal absensi menggunakan tanggal lokal browser (`new Date().toLocaleDateString`
atau format YYYY-MM-DD dari timezone lokal). Konsisten dengan ADR-004 K7.

---

## Schema

### Tabel Baru: `attendance`

```sql
CREATE TABLE attendance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  schedule_id  uuid NOT NULL REFERENCES schedules(id)  ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  teacher_id   uuid NOT NULL REFERENCES profiles(id),
  tanggal      date NOT NULL,
  status       text NOT NULL CHECK (status IN ('HADIR','SAKIT','IZIN','ALPHA')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (classroom_id, student_id, tanggal, schedule_id)
);

CREATE INDEX idx_attendance_classroom_tanggal
  ON attendance (classroom_id, tanggal);

CREATE INDEX idx_attendance_student
  ON attendance (student_id, tanggal);
```

### RLS Attendance

```sql
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Guru: CRUD absensi classroom miliknya
CREATE POLICY pol_attendance_guru_all ON attendance
  FOR ALL TO authenticated
  USING  (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id());

-- Siswa: READ absensi diri sendiri
CREATE POLICY pol_attendance_siswa_select ON attendance
  FOR SELECT TO authenticated
  USING (
    student_id = fn_current_profile_id()
    AND fn_is_classroom_member(classroom_id)
  );

-- Ortu: READ absensi anak yang di-link
CREATE POLICY pol_attendance_ortu_select ON attendance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.profile_id        = fn_current_profile_id()
        AND cm.member_role       = 'ORTU'
        AND cm.linked_student_id = attendance.student_id
        AND cm.classroom_id      = attendance.classroom_id
    )
  );
```

---

## UI — Halaman Jadwal & Absensi (guru/classroom.html)

### Section Absensi

[Tanggal otomatis: Selasa, 4 Agustus 2026]
[Sesi: 08.00 – 09.30] [Status: AKTIF / SELESAI / BELUM MULAI]

┌─────────────────────────────────────────┐
│ H: 28 (93%) S: 1 (3%) I: 1 (3%) A: 0 (0%) │
└─────────────────────────────────────────┘

← Halaman 1 dari 3 (30 siswa) →

[card siswa 1] Ahmad Pratama [H] [S] [I] [A]
[card siswa 2] Aisyah Permata [H] [S] [I] [A]
...
[card siswa 10] Budi Santoso [H] [S] [I] [A]

[Simpan Absensi]

Saat sesi SELESAI: semua tombol H/S/I/A dan tombol Simpan di-disable.
Tampilkan data absensi terakhir yang tersimpan (read-only).

### Section Rekap
[Filter: Minggu ini | Bulan ini | Semester ini | Custom]
[Dari: ____] [Sampai: ____]

┌──────────────────────────────────────────────────────┐
│ Total sesi: 12 H: 280 (87%) S:15 (5%) I:12 (4%) A:13 (4%) │
└──────────────────────────────────────────────────────┘

Nama | H | S | I | A | % Hadir
Ahmad Pratama | 10 | 1 | 0 | 1 | 83%
...

[Export Excel]

### Portal Siswa (siswa/dashboard.html)

Section "Kehadiran Saya" — READ ONLY:
- Jadwal classroom (dari ADR-004)
- Rekap absensi diri sendiri dengan filter rentang + preset

### Portal Ortu (ortu/dashboard.html)

Section "Kehadiran [Nama Anak]" — READ ONLY:
- Jadwal classroom anak
- Rekap absensi anak dengan filter rentang + preset

---

## Definisi Selesai — Claude Code Wajib Verifikasi

- [ ] Tabel `attendance` terbuat di Supabase dengan semua constraint
- [ ] RLS `pol_attendance_*` aktif dan benar (3 policy)
- [ ] Form absensi aktif saat sesi berlangsung, disable di luar sesi
- [ ] Default semua siswa = Hadir saat form dibuka
- [ ] Tombol H/S/I/A toggle dengan benar per siswa
- [ ] Pindah halaman tidak menghilangkan data yang sudah diisi
- [ ] Card ringkasan H/S/I/A update real-time saat status diubah
- [ ] Simpan: upsert berhasil, data tersimpan di Supabase
- [ ] Setelah sesi selesai: form di-disable, data read-only
- [ ] Rekap muncul dengan filter preset dan custom
- [ ] Card agregat rekap update saat filter berubah
- [ ] Export Excel berfungsi menggunakan SheetJS
- [ ] Siswa bisa lihat rekap diri sendiri di portal siswa
- [ ] Ortu bisa lihat rekap anak di portal ortu
- [ ] Tidak ada regresi di jadwal, roster, generate akun
- [ ] WCAG AA 4.5:1 untuk semua teks baru
- [ ] Tampilan rapi di layar 375px

---

## Alternatif yang Ditolak

**Default kosong (guru harus klik semua)** — ditolak karena terlalu
merepotkan. Di kelas 30+ siswa, klik satu per satu untuk yang hadir
jauh lebih lambat dari klik yang tidak hadir saja.

**Absensi bisa input kapan saja (tidak terikat jadwal)** — ditolak
karena tanpa batas waktu, data absensi tidak akurat dan bisa dimanipulasi.
Sesi yang sudah selesai tidak boleh bisa diubah.

**Soft delete absensi** — ditolak sesuai pola ADR-001 K9 — sistem
menggunakan hard delete dan upsert, tidak ada audit trail.
