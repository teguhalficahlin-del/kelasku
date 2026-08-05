# Student Insight Platform — SIP Mandiri
# Konteks untuk Claude Code

> Baca SELURUH dokumen ini sebelum mengerjakan apapun.
> Dokumen ini adalah satu-satunya sumber kebenaran untuk SIP Mandiri.
> Jangan campur dengan SIP SMK — ini produk dan Supabase project yang berbeda.

---

## 1. IDENTITAS & DOMAIN

**Nama:** Student Insight Platform — Mandiri
**Domain:** Platform pencatatan siswa untuk guru aktif yang menggunakan secara mandiri,
tanpa keterikatan pada institusi sekolah di dalam sistem.

Fitur utama: manajemen classroom, catatan siswa, sesi pembinaan, forum, jadwal.

**Stack:**
- Backend: Supabase/PostgreSQL + Row Level Security (RLS)
- Frontend: Vanilla JS + HTML (tanpa framework)
- Hosting: GitHub Pages (static files)
- Auth: Supabase Auth (JWT)

**Supabase project ID:** `teccdzetrdjowqemnuuc`
**Repo GitHub:** `teguhalficahlin-del/sip-mandiri`
**Repo lokal:** `D:\ribuan_pengguna\CLAUDE\SIP Mandiri`

---

## 2. PERBEDAAN KRITIS DARI SIP SMK

| Item | SIP SMK | SIP Mandiri |
|------|---------|-------------|
| Tenant anchor | `school_id` | `classroom_id` |
| Entitas sekolah | Ada (`schools` table) | **Tidak ada** |
| Role | 15 role | 3 role: GURU, SISWA, ORTU |
| Portal | 9 portal | 3 portal + onboarding |
| Isolasi | Per sekolah | Per classroom |
| Guru | Terikat ke sekolah | Daftar mandiri |
| Siswa | Terikat ke sekolah | Join via classroom_code |

**JANGAN** menggunakan pola RLS SIP SMK di sini — anchor berbeda, semua policy
harus ditulis ulang dari awal.

---

## 3. TENANT ISOLATION (KRITIS — BACA DULU)

Lihat `ADR-001-tenant-isolation.md` untuk detail lengkap.

Ringkasan:
- Isolasi data per `classroom_id`
- Guru hanya akses classroom miliknya (`teacher_id = fn_current_profile_id()`)
- Siswa akses classroom yang diikuti via `classroom_members`
- Ortu akses classroom anak via `classroom_members` + `linked_student_id`
- `teacher_id` **didenormalisasi** ke setiap tabel fitur — jangan dihapus

---

## 4. ROLE SYSTEM

```
GURU   → pemilik classroom, full CRUD di classroom sendiri
SISWA  → member classroom, read-only terbatas
ORTU   → linked ke siswa, read-only terbatas
```

Tidak ada WAKA, KEPSEK, TU, ADMIN, SUPERADMIN, DUDI, STAKEHOLDER.

---

## 5. STRUKTUR PORTAL (3 portal + onboarding)

```
guru/         → guru/js/api.js + guru/js/guru.js
siswa/        → siswa/js/api.js + siswa/js/dashboard.js
ortu/         → ortu/js/api.js + ortu/js/portal.js
onboarding/   → onboarding/index.html (daftar akun + buat classroom pertama)
shared/       → komponen lintas portal
```

Setiap portal: `index.html` (login) + `dashboard.html` (main app).

---

## 6. SCHEMA DATABASE (8 tabel)

```
profiles              → semua user (GURU / SISWA / ORTU)
classrooms            → classroom milik guru (1 guru → banyak classroom)
classroom_members     → many-to-many siswa/ortu ↔ classroom
student_notes         → catatan per siswa, flag is_visible_to_student/parent
guidance_sessions     → sesi pembinaan, selalu private (tidak ada flag visibilitas)
forum_posts           → posting guru ke classroom
forum_comments        → komentar pada posting
schedules             → jadwal per classroom
```

Detail lengkap: `SCHEMA-v0.md`

---

## 7. FUNGSI HELPER KRITIS

| Fungsi | Keterangan |
|--------|-----------|
| `fn_current_profile_id()` | Ambil profile_id dari auth.uid() |
| `fn_is_classroom_owner(classroom_id)` | Cek guru adalah pemilik classroom |
| `fn_is_classroom_member(classroom_id)` | Cek user adalah member classroom |

Setiap fungsi SECURITY DEFINER wajib:
```sql
REVOKE EXECUTE ON FUNCTION nama FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION nama FROM anon;
GRANT EXECUTE ON FUNCTION nama TO authenticated;
```

---

## 8. CARA KERJA TIM

```
Romo (user) ←→ Claude Chat (architect-consultant)
                      ↓ prompt lengkap
               Claude Code (executor — otonomi tinggi)
                      ↓ laporan + diff verbatim
               Romo / Claude Chat (review + keputusan)
```

**Claude Code — otonomi penuh untuk:**
- Baca, tulis, edit file JS/HTML/SQL/config
- `git add`, `git commit` (setelah diff ditampilkan verbatim)
- `supabase db push --linked --dry-run`
- `BEGIN...ROLLBACK` test migration

**Claude Code — STOP + tunggu konfirmasi eksplisit untuk:**
- `supabase db push --linked` (real, bukan dry-run)
- `supabase functions deploy ...`
- `git push origin main`

---

## 9. ATURAN OUTPUT (NON-NEGOTIABLE)

- Semua output perintah, diff, dan SQL WAJIB ditampilkan **verbatim di badan teks**
  sebagai markdown code block
- Klaim "commit berhasil" tanpa bukti verbatim = tidak lengkap, akan diminta ulang
- Kalau output panjang: **pecah jadi beberapa pesan** — jangan disingkat

---

## 10. ATURAN WORKFLOW

### 10a. Verifikasi pwd — LANGKAH PERTAMA
Jalankan `pwd` dan pastikan output mengandung `"SIP Mandiri"`.
Jika tidak → STOP, laporkan ke user.

### 10b. Mode kerja

**Mode A (Investigasi)** — konteks belum final:
Claude Code investigasi → lapor rekomendasi → STOP → tunggu konfirmasi

**Mode B (Implementasi penuh)** — konteks sudah final:
Claude Code investigasi cepat → apply → commit → STOP (tanpa push)

### 10c. Migration
- Format nama: `YYYYMMDDHHMMSS_nama-fitur.sql` (14 digit)
- Selalu `IF NOT EXISTS` / `OR REPLACE` (idempotent)
- Urutan wajib:
  ```sql
  BEGIN; /* isi migration */ ROLLBACK;  -- test dulu
  BEGIN; /* isi migration */ COMMIT;    -- baru permanent
  ```

### 10d. Deploy — urutan wajib
```
supabase db push --linked --dry-run   → tampilkan verbatim → STOP
supabase db push --linked             → setelah konfirmasi
supabase functions deploy <nama> --project-ref [PROJECT_REF]
git push origin main                  → urutan TERAKHIR
```

### 10e. Self Review 5 Poin — wajib sebelum apply
1. Side effect ke classroom lain?
2. Migration idempotent?
3. REVOKE dua lapis jika ada SECURITY DEFINER baru?
4. Diff sudah ditampilkan verbatim?
5. Risiko data loss?

---

## 11. KONVENSI TEKNIS KRITIS

| Item | Aturan |
|------|--------|
| Inspeksi fungsi PostgreSQL | `pg_get_functiondef(oid)` — BUKAN `\df+` |
| Query ke database | `supabase db query -f file.sql` |
| `day_of_week` | `SENIN, SELASA, RABU, KAMIS, JUMAT, SABTU` |
| Tenant anchor | `classroom_id` — BUKAN `school_id` |
| Profile lookup | Selalu via `fn_current_profile_id()` — BUKAN `auth.uid()` langsung |
| RLS subquery | Selalu via fungsi SECURITY DEFINER — BUKAN EXISTS mentah |

---

## 12. STATUS PROYEK

**Fase saat ini: DEVELOPMENT AKTIF**
**HEAD:** `96984b6`

- [x] Dokumen rancangan selesai (REQUIREMENTS, SCHEMA-v0, ADR-001)
- [x] Supabase project baru dibuat
- [x] Repo GitHub dibuat
- [x] Migration pertama: schema + RLS
- [x] Portal Guru: onboarding + classroom
- [x] ADR-003 login tanpa email (siswa/ortu pakai username + PIN)
- [x] Generate akun siswa + ortu (single + semua sekaligus)
- [x] QR code + share link mobile-friendly
- [x] Trial 30 hari + trial gate classroom
- [x] Hapus akun siswa + ortu (end-to-end)
- [x] 6 slash commands di `.claude/commands/`
- [x] Edge Functions deployed: `generate-akun`, `hapus-akun`
- [ ] Portal Guru: catatan siswa + sesi pembinaan
- [x] Portal Guru: jadwal classroom (ADR-004)
- [x] Portal Guru: absensi classroom (ADR-005)
- [ ] Portal Guru: forum
- [ ] Portal Siswa
- [ ] Portal Ortu
- [ ] Security audit
- [ ] Test suite

**Test pending manual:**
- Test 4.4: progress generate semua (butuh siswa baru tanpa akun)
- Test 8.4–8.5: cross-classroom isolation (butuh guru kedua)

**Migrations (urut kronologis):**
```
20260730000001_init-schema.sql
20260803000001_add-roster.sql
20260803000002_fn-activate-roster.sql
20260803000003_fn-lookup-classroom-code.sql
20260803000004_fn-lookup-roster.sql
20260803000005_fn-lookup-profile-name.sql
20260803000006_profiles-guru-lifecycle.sql
20260803000007_roster-nama-ortu.sql
20260803000008_fn-validate-ortu-login.sql
20260803000009_fn-guru-trial-start.sql
20260803000010_fn-guru-trial-status.sql
20260804000001_fn-activate-guru.sql
20260804000002_fix-fk-hapus-akun.sql
20260804000003_fix-fk-student-notes-guidance.sql
20260804000004_fix-fk-forum-comments.sql
20260804000005_fix-rls-roster-siswa.sql
20260805000001_schedules-jadwal.sql
20260805000002_attendance.sql
```

---

## 13. REFERENSI CEPAT

```bash
# Status sesi
pwd && git log --oneline -5 && git status --short

# Inspeksi fungsi
supabase db query -f - <<'SQL'
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'nama_fungsi';
SQL

# Test migration
supabase db query -f supabase/migrations/YYYYMMDDHHMMSS_nama.sql

# Deploy (urutan wajib)
supabase db push --linked --dry-run
supabase db push --linked
git push origin main
```

---

## 14. SLASH COMMANDS TERSEDIA

Gunakan commands berikut untuk pola kerja berulang. Jalankan `/sip-start` di awal setiap sesi.

| Command | Kapan dipakai |
|---------|---------------|
| `/sip-start` | Verifikasi sesi pembuka — wajib di awal setiap sesi |
| `/sip-migration-check` | Validasi sebelum push migration |
| `/sip-fn-inspect <nama>` | Inspeksi body fungsi DB |
| `/sip-invert <deskripsi>` | Skenario gagal sebelum eksekusi |
| `/sip-deploy` | Urutan deploy yang aman |
| `/sip-audit-tenant` | Audit classroom isolation |
| `/plan` | Sebelum task kompleks |
| `/effort high` | Migration, RLS, multi-file |
| `/effort medium` | Bug fix single file, UI tweak |

Detail implementasi: `.claude/commands/`
