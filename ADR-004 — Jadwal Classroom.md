# ADR-004 — Jadwal Classroom

Status: ACCEPTED  
Tanggal: 4 Agustus 2026  
Decider: Romo (Teguh Riyono)

---

## ATURAN KERJA CLAUDE CODE

### Kapan lanjut:
- Setelah setiap migration berhasil di-apply dan terverifikasi di Supabase Dashboard
- Setelah setiap fungsi DB terdaftar dan SECURITY DEFINER dikonfirmasi
- Setelah halaman ter-render tanpa error di browser
- Setelah setiap checklist section terpenuhi

### Kapan STOP dan lapor:
- Migration mengandung DROP, ALTER TYPE, atau mengubah kolom berisi data
- Ditemukan konflik dengan kode existing yang tidak diantisipasi ADR ini
- Constraint ADR perlu dilanggar karena alasan teknis
- Anti bentrok mendeteksi jadwal yang sudah ada dan perlu keputusan bisnis

### Wajib dipatuhi:
- `/sip-start` di awal, `/sip-migration-check` sebelum setiap push, `/sip-invert` sebelum implementasi
- SECURITY DEFINER + REVOKE FROM PUBLIC + REVOKE FROM anon + GRANT TO authenticated untuk semua fungsi DB baru
- Semua query wajib filter `classroom_id` — tenant isolation tidak boleh bocor
- Dark theme: `--bg-base #0f172a`, `--accent #6366f1` — tidak boleh diubah
- Fluid typography via `clamp()` — tidak ada px hardcode untuk font dan tombol
- Mobile-first, fluid tanpa breakpoint hardcode
- WCAG AA minimum 4.5:1 untuk semua teks — hitung sebelum commit
- Konsisten dengan pola card, badge, tombol yang sudah ada di `guru/classroom.html`
- Diff verbatim wajib ditampilkan sebelum setiap push
- Verifikasi di browser + Supabase Dashboard sebelum laporan akhir

---

## Konteks

Guru memerlukan jadwal mingguan per classroom sebagai fondasi fitur absensi.
Tanpa jadwal, absensi tidak punya konteks sesi yang jelas — kapan pertemuan
berlangsung dan kapan absensi aktif atau non-aktif.

Jadwal dibuat per classroom (bukan per guru) karena setiap classroom
memiliki jadwal pertemuan yang berbeda. Satu guru yang memiliki banyak
classroom harus bisa mengelola jadwal masing-masing classroom secara
independen.

---

## Keputusan

### K1 — Jadwal Per Classroom, Berulang Mingguan

Setiap classroom memiliki jadwal mingguan sendiri. Jadwal berlaku berulang
setiap minggu — guru tidak perlu input ulang setiap minggu.

Satu classroom bisa memiliki lebih dari satu sesi per hari (contoh: pagi
dan siang). Sistem tidak membatasi jumlah sesi per hari.

### K2 — Unit Jadwal: Hari + Jam Mulai + Jam Selesai

Setiap baris jadwal mewakili satu slot waktu di satu hari dalam seminggu:
- `day_of_week`: SENIN / SELASA / RABU / KAMIS / JUMAT / SABTU
- `start_time`: jam mulai (TIME)
- `end_time`: jam selesai (TIME)

Tidak ada kolom topik — topik tidak dicatat di level jadwal maupun absensi.

### K3 — Jadwal Bisa Dinonaktifkan Sementara

Guru bisa menonaktifkan jadwal tertentu tanpa menghapusnya — untuk keperluan
libur, ujian, atau kondisi khusus lainnya. Nonaktifkan wajib disertai keterangan.

Kolom: `is_active BOOLEAN DEFAULT true`, `inactive_reason TEXT`.

Jadwal yang nonaktif tidak memicu sesi absensi.

### K4 — Anti Bentrok Wajib Diterapkan

Sistem menolak jadwal baru jika terjadi overlap waktu:

**Dalam satu classroom:** dua jadwal di hari yang sama tidak boleh overlap.

**Lintas classroom milik guru yang sama:** guru tidak bisa mengajar dua
classroom berbeda pada waktu yang overlap di hari yang sama.

Overlap terjadi jika:
`start_time_baru < end_time_existing AND end_time_baru > start_time_existing`

Fungsi DB `fn_check_schedule_conflict()` menangani validasi ini server-side.
Frontend juga melakukan validasi sebelum kirim ke DB.

### K5 — Akses Per Role

- **Guru**: CRUD penuh jadwal classroom miliknya
- **Siswa**: READ jadwal classroom yang diikutinya
- **Ortu**: READ jadwal classroom anak yang di-link

### K6 — Posisi UI

Tab "Jadwal & Absensi" ditempatkan di sebelah judul section "Tambah Siswa"
di `guru/classroom.html`. Klik tab membuka section jadwal dan absensi di
bawah section roster siswa.

Di portal siswa (`siswa/dashboard.html`) dan portal ortu (`ortu/dashboard.html`),
jadwal ditampilkan sebagai section tersendiri di bawah informasi classroom.

### K7 — Timezone

Semua perbandingan waktu menggunakan timezone lokal browser (`new Date()`
di frontend). DB menyimpan `TIME WITHOUT TIME ZONE` — frontend bertanggung
jawab mengirim waktu lokal yang benar.

---

## Schema

### Tabel `schedules` (sudah ada di init-schema, perlu tambah kolom)

```sql
-- Migration: tambah kolom inactive_reason ke tabel schedules yang sudah ada
ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS inactive_reason TEXT;

-- Pastikan kolom lain sudah ada (dari init-schema):
-- id, classroom_id, teacher_id, day_of_week, start_time, end_time,
-- is_active, created_at
```

### Fungsi Anti Bentrok

```sql
CREATE OR REPLACE FUNCTION fn_check_schedule_conflict(
  p_teacher_id    UUID,
  p_classroom_id  UUID,
  p_day_of_week   TEXT,
  p_start_time    TIME,
  p_end_time      TIME,
  p_exclude_id    UUID DEFAULT NULL
)
RETURNS TABLE (
  conflict_classroom_name TEXT,
  conflict_day            TEXT,
  conflict_start          TIME,
  conflict_end            TIME
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.name,
    s.day_of_week,
    s.start_time,
    s.end_time
  FROM schedules s
  JOIN classrooms c ON c.id = s.classroom_id
  WHERE s.teacher_id   = p_teacher_id
    AND s.day_of_week  = p_day_of_week
    AND s.is_active    = true
    AND (p_exclude_id IS NULL OR s.id != p_exclude_id)
    AND s.start_time   < p_end_time
    AND s.end_time     > p_start_time;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_check_schedule_conflict(UUID,UUID,TEXT,TIME,TIME,UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_check_schedule_conflict(UUID,UUID,TEXT,TIME,TIME,UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_check_schedule_conflict(UUID,UUID,TEXT,TIME,TIME,UUID) TO authenticated;
```

### RLS Schedules

```sql
-- Guru: CRUD miliknya
CREATE POLICY pol_schedules_guru_all ON schedules
  FOR ALL TO authenticated
  USING  (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id());

-- Siswa: READ classroom yang diikuti
CREATE POLICY pol_schedules_siswa_select ON schedules
  FOR SELECT TO authenticated
  USING (fn_is_classroom_member(classroom_id));

-- Ortu: READ classroom anak yang di-link
CREATE POLICY pol_schedules_ortu_select ON schedules
  FOR SELECT TO authenticated
  USING (fn_is_classroom_member(classroom_id));
```

---

## UI — Halaman Jadwal (guru/classroom.html)

### Layout tabel jadwal

Tabel satu baris per hari, Senin–Sabtu. Setiap baris menampilkan:
- Nama hari
- Jam mulai – Jam selesai (jika ada jadwal)
- Badge status: Aktif (hijau) / Nonaktif + keterangan (merah)
- Tombol: Edit / Nonaktifkan atau Aktifkan / Hapus

Baris yang belum ada jadwal menampilkan tombol "+ Tambah".

### Form tambah/edit jadwal

Form inline atau modal (glassmorphism, konsisten dengan pola existing):
- Dropdown hari (SENIN–SABTU)
- Input jam mulai (time picker)
- Input jam selesai (time picker)
- Validasi anti bentrok real-time sebelum simpan
- Pesan jika bentrok: "Bentrok dengan [Nama Classroom] [Hari] [Jam]"

### Portal siswa dan ortu

Jadwal ditampilkan sebagai card per hari yang ada jadwalnya:
- Nama hari + jam mulai–selesai
- Badge Aktif/Nonaktif
- Jika nonaktif: tampilkan keterangan

---

## Definisi Selesai — Claude Code Wajib Verifikasi

- [ ] Migration `inactive_reason` applied ke Supabase
- [ ] `fn_check_schedule_conflict` terdaftar di DB, SECURITY DEFINER ✓
- [ ] RLS `pol_schedules_*` terpasang di tabel schedules
- [ ] Tabel jadwal muncul di classroom.html dengan data yang benar
- [ ] Tambah jadwal baru berhasil tersimpan
- [ ] Anti bentrok menolak jadwal yang overlap dengan pesan yang benar
- [ ] Nonaktifkan jadwal memerlukan keterangan
- [ ] Portal siswa menampilkan jadwal classroom yang diikuti
- [ ] Portal ortu menampilkan jadwal classroom anak
- [ ] Tidak ada regresi di roster siswa, generate akun, hapus akun
- [ ] Semua teks memenuhi WCAG AA 4.5:1
- [ ] Tampilan rapi di layar 375px (mobile)

---

## Alternatif yang Ditolak

**Jadwal per guru (bukan per classroom)** — ditolak karena guru dengan
banyak classroom butuh jadwal berbeda per classroom. Satu template per guru
tidak cukup fleksibel.

**Input jadwal per minggu (bukan berulang)** — ditolak karena terlalu
merepotkan guru. Jadwal sekolah umumnya tetap sepanjang semester.