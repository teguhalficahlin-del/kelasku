# Student Insight Platform — MIClass
# Konteks untuk Claude Code

> Baca SELURUH dokumen ini sebelum mengerjakan apapun.
> Dokumen ini adalah sumber kebenaran untuk **konteks produk** MIClass.
> Pasangannya, `AGENT_RULES.md`, adalah sumber kebenaran untuk **aturan kerja agen**
> — wajib dibaca juga, dan menang kalau keduanya bertabrakan soal cara kerja.
>
> Proyek ini berdiri sendiri: jangan campur dengan proyek pendahulu (SIP SMK) — produk,
> schema, dan Supabase project-nya berbeda. Penyebutan "SIP SMK" di dokumen ini semuanya
> **sengaja**, bentuknya kontras/larangan, bukan sisa template yang lupa diganti.

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
**Repo GitHub:** `teguhalficahlin-del/kelasku`
**GitHub Pages:** `https://teguhalficahlin-del.github.io/kelasku/`
**Repo lokal:** `D:\ribuan_pengguna\CLAUDE\MIClass`

> Nama repo dan nama folder lokal memang berbeda — folder tetap `MIClass`,
> repo GitHub bernama `kelasku`. URL lama `.../MIClass.git` masih di-redirect,
> tapi jangan diandalkan. Nama `kelasku` juga yang dipakai path GitHub Pages
> (`shared/js/config.js`), jadi keduanya kini konsisten.

---

## 2. PAGAR PEMBATAS — BEDA DARI PROYEK PENDAHULU (SIP SMK)

Tabel ini bukan dokumentasi SIP SMK. Fungsinya satu: menandai pola yang **dilarang**
ikut tersalin ke sini. Kolom kiri = pola terlarang, kolom kanan = pola yang benar.

| Item | SIP SMK (JANGAN dipakai) | MIClass (yang benar) |
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

> Direktori `admin/` juga ada di repo (dipakai commit `dc48a6a`), tapi **belum
> terdokumentasi** di sini — bukan portal pengguna dan bukan role keempat.
> Perlu keputusan Romo: didokumentasikan sebagai apa? (lihat Temuan sesi 25 Agu 2026)

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
Jalankan `pwd` dan pastikan output mengandung `"MIClass"`.
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
| Cek kepemilikan | `fn_is_classroom_owner()` (guru) / `fn_is_classroom_member()` (siswa+ortu) |
| RLS subquery | Selalu via fungsi SECURITY DEFINER — BUKAN EXISTS mentah |
| Role valid | `GURU`, `SISWA`, `ORTU` — tidak ada yang lain, jangan tambah |
| Deploy edge function | `--project-ref teccdzetrdjowqemnuuc` — CLI ini TOLAK `--linked` di sini |
| `grade_recap` tanpa `teacher_id` | **Disengaja.** Ia satu-satunya tabel penilaian tanpa kolom itu; isolasinya lewat `fn_is_classroom_owner(classroom_id)`. Jangan tambahkan demi keseragaman — lihat catatan di bawah tabel. |

> **Catatan `grade_recap` vs §3.** §3 menyatakan `teacher_id` didenormalisasi ke
> setiap tabel fitur. `grade_recap` — dan `student_groups` — adalah pengecualian:
> keduanya tidak pernah punya kolom itu. Isolasi tenant-nya tetap utuh karena
> seluruh policy-nya berpangkal pada `classroom_id` lewat `fn_is_classroom_owner()`,
> `fn_is_classroom_member()`, dan `fn_is_my_child_roster_in_classroom()`.
>
> Konsekuensi yang perlu diingat: `fn_semester_reset`, `fn_tahun_ajaran_reset`, dan
> `fn_hard_delete_guru` menyapu tabel ini lewat `classroom_id = ANY(...)`, bukan
> lewat `teacher_id` langsung. Menambahkan kolomnya sekarang berarti menyunting
> ketiga fungsi itu tanpa ada yang bertambah aman.

---

## 12. STATUS PROYEK

**Fase saat ini: DEVELOPMENT AKTIF**
**HEAD:** `1b329ad` (per 5 September 2026)

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
- [x] Edge Functions deployed: `generate-akun`, `hapus-akun`, `phase2-material`, `phase2-meeting`, `phase2-followup`, `phase2-validator`, `runtime-sync`
- [x] Portal Guru: tab Penilaian — assessment_items + student_grades (sesi 6 Agustus 2026)
- [x] Portal Guru: Penilaian section Perencanaan selesai — CP/TP/KKTP CRUD, TP collapsed, grid KKTP, custom dropdown semester (sesi 7–8 Agustus 2026)
- [x] Portal Guru: Tab Rancang Pembelajaran — pipeline Step 6 (Tahap 1–7) selesai, Step 7 Document Hub selesai, Step 8 Runtime selesai (belum di-hardening); Putaran 9 (Hardening) belum dikerjakan
- [x] Portal Guru: catatan siswa + sesi pembinaan (`classroom-notes.js`)
- [x] Portal Guru: jadwal classroom (ADR-004)
- [x] Portal Guru: absensi classroom (ADR-005)
- [x] Portal Guru: UX polish absensi + rekap (sesi 6 Agustus 2026)
- [x] Portal Guru: forum dua arah guru-ortu + pengumuman siswa (`classroom-forum.js`, commit `0a382dd`); RLS audit F1/F2/F3 diperbaiki (`1eafda1`)
- [x] Portal Siswa: dashboard, bottom nav, halaman profil (ubah nama + PIN)
- [x] Portal Ortu: dashboard, pesan guru, forum, bottom nav, halaman profil, unread badge
- [x] Security audit Tab Rancang (`docs/AUDIT-RANCANG-UI.md`); audit forum RLS (`1eafda1`)
- [x] Tab Rancang: ModulOutput V4.0 — generate 4 fase tuntas, diaudit di produksi (sesi 5 September 2026)
- [x] Bahasa manusia di Modul Ajar & Naskah Fasilitasi — selesai & diverifikasi di
      produksi (sesi 5 September 2026). Termasuk perbaikan strategi yang salah
      tercatat: TP 3 & TP 6 sudah di-generate ulang dan kini menyebut strategi
      yang benar.
- [~] Test suite — jaring regresi validator Modul selesai (`tests/validator-modul.ts`,
      5 modul contoh dari produksi). Cakupan lain belum ditentukan.
- [ ] Hardening Tab Rancang — Putaran 9 (`docs/AUDIT-RANCANG-UI.md`, `docs/AUDIT-EF-API.md`)
- [ ] **KEPUTUSAN TERBUKA — apakah Naskah Fasilitasi layak tetap ada?**
      `docs/BACKLOG-NASKAH-FASILITASI.md`. Ia 45–58% dari isi modul, satu fase
      generate tersendiri, dan sumber hampir seluruh cacat yang ditemukan telaah
      ahli kurikulum. Manfaatnya belum terbukti: belum ada guru yang mengajar
      dengannya. Jawabannya bukan dari diskusi — beri satu modul ke guru
      sungguhan dan lihat bagian mana yang dibuka.

**Test pending manual:**
- Test 4.4: progress generate semua (butuh siswa baru tanpa akun)
- Test 8.4–8.5: cross-classroom isolation (butuh guru kedua)

**Fitur & fix sesi 6 Agustus 2026 — penilaian (HEAD ca290cb → c9b5d16):**

Arsitektur penilaian final (dua tabel menggantikan lima tabel lama):
- `assessment_items` (dari ALTER+RENAME `learning_objectives`): `id`, `classroom_id`,
  `teacher_id`, `academic_year`, `semester`, `judul`, `tipe` (CP/TP/KKTP/NILAI/LAINNYA),
  `konten`, `urutan`, `is_visible_siswa`, `is_visible_ortu`, `is_active`
- `student_grades` (dari ALTER+RENAME `grade_summaries`): `id`, `classroom_id`,
  `teacher_id`, `student_id`, `academic_year`, `semester`, `judul`, `nilai_angka`,
  `deskripsi`, `is_published`
- DROP: `tp_assessments`, `assessment_criteria`, `grading_settings`, schema `core`
- RLS: guru via `fn_is_classroom_owner`, siswa/ortu via `fn_is_classroom_member` +
  `is_visible_siswa/ortu` (items) atau `is_published` (grades)
- UI: tab "Penilaian" di `classroom.html` + `classroom-assessment.js` (lazy init,
  event delegation, CRUD kedua tabel, modal form, validasi `academic_year`)
- Portal siswa + ortu: section Nilai (hanya baris `is_published = true`)

**Fitur & fix sesi 6 Agustus 2026 — absensi (HEAD 2e7044f → 631e503):**

Fix:
- Dropdown pilih hari — semua 6 hari selalu tersedia (bukan hanya hari kosong)
- Sinkronisasi panel absensi setelah edit/nonaktifkan/hapus jadwal
  (`CustomEvent 'schedule-changed'` dari schedule.js, listener di attendance.js)
- Heading section classroom: `font-size: var(--fs-h3)`, `color: var(--gold)`
  via `.panel > h2.panel-header`
- Swipe absensi per sesi: tambah cek delta vertikal (`Math.abs(dx) <= Math.abs(dy)`)
- Tombol Export Excel: posisi kanan (`margin-left: auto`), tidak trigger collapse
  (`e.stopPropagation()`), selalu aktif (guard alert jika belum ada data)

Fitur baru:
- Rekap absensi: pagination 10 siswa per halaman, batasi 10 entri per siswa,
  notif download jika entri ≥ 10 (`renderRekapPage`, state `_rekapPage`)
- Swipe gesture di semua pagination: roster, absensi per sesi, rekap
  (`{ passive: true }`, threshold 50px, cek vertikal)
- Tombol Export Excel dipindah ke header `h2.panel-header` Rekap Absensi
  (disisipkan via JS setelah `initCollapseSections` wrap, class `btn-export-header`)
- Persist state UI via `localStorage` (key berbasis `classroomId`):
  * `sip_tab_<id>` → tab aktif (Kelola Siswa / Jadwal & Absensi)
  * `sip_collapse_<id>_<panelId>` → index section yang terbuka
  * `sip_roster_page_<id>` → halaman pagination roster terakhir

Label:
- Tab "Siswa" → "Kelola Siswa"
- Heading "Jadwal Mingguan" → "Jadwal Mengajar"

**Fitur & fix sesi 7–8 Agustus 2026 — Penilaian section Perencanaan (HEAD c9b5d16 → 2d0b7a1):**

UX & layout:
- TP default collapsed — konten + KKTP dibungkus `pai-tp-body` hidden saat tab dibuka
- KKTP row: layout grid (`1rem minmax(7rem,1fr) 4.5rem 6.5rem`) — tombol Edit/Hapus selalu sejajar vertikal
- Custom dropdown `#pai-semester-wrap` menggantikan `<select>` native — dark theme penuh,
  keyboard navigation (Enter/Space/Escape/ArrowUp/ArrowDown), `initSemesterDropdown()`
  dipanggil ulang setiap `renderPerencanaan()` agar listener tidak hilang setelah CRUD

Migrations baru:
- `20260807000001_*` — hierarchy assessment items
- `20260807000002_*` — KKTP batas range (batas_bawah, batas_atas)
- `20260808000001_*` — unique fix parent_id

**Migrations (urut kronologis — dibangun ulang dari `supabase/migrations/`,
25 Agustus 2026):**
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
20260806000001_assessment-core-schema.sql
20260806000003_assessment-tables.sql
20260806000004_assessment-rls.sql
20260806000005_assessment-rpc.sql
20260806000006_assessment-revisi.sql
20260807000001_assessment-hierarchy.sql
20260807000002_assessment-kktp-range.sql
20260808000001_assessment-items-unique-fix.sql
20260808000002_assessments_pelaksanaan.sql
20260808000003_rubrik_sumatif.sql
20260808000010_fix-asmt-judul-prefix.sql
20260808000011_assessment-publish.sql
20260808000012_tindak_lanjut_per_siswa.sql
20260808000013_assessments_rls_siswa_ortu.sql
20260809000001_fix_ai_ortu_select.sql
20260809000002_fix_fk_cascade_siswa.sql
20260809000003_fn-guru-trial-status-v2.sql
20260809000004_delete-auth-user-fn.sql
20260809000005_fix-fk-roster-teacher-cascade.sql
20260809000006_fix-fk-assessment-items-cascade.sql
20260809000007_fix-fk-all-teacher-cascade.sql
20260809000008_add-last-reset-at.sql
20260813000001_rancang-tables.sql
20260814000001_classrooms-identitas.sql
20260814000002_profiles-role-guru.sql
20260814000003_auto-create-profile.sql
20260815000001_penilaian-v2-schema.sql
20260815000002_assessment-add-tujuan-konten.sql
20260815000003_assessment-fk-roster.sql
20260815000004_tp-kktp-mapel.sql
20260815000005_tp-kktp-semester-nullable.sql
20260815000006_tp-kktp-rentang.sql
20260815000007_tp-kktp-fix-constraint.sql
20260815000008_tp-kktp-fix-mapel-inherit.sql
20260816000001_fix-teknik-check-add-tes-lisan.sql
20260816000002_grade-recap-fk-roster.sql
20260816000003_tier-system.sql
20260816000004_rancang-profil.sql
20260816000005_rancang-profil-elemen.sql
20260818000001_phase1_teaching_scope_foundation.sql
20260818000002_phase1_fk_lifecycle_fix.sql
20260818000003_phase2a_planning_foundation.sql
20260818000004_phase2a_allocation_policy_authority.sql
20260818000005_phase2b_artifact_lifecycle_foundation.sql
20260818000006_phase2c_generate_gate.sql
20260818000007_phase2_artifact_kinds.sql
20260818000008_pipeline_state_gate.sql
20260818000009_phase2_material_validator.sql
20260818000010_phase2_meeting_validator.sql
20260818000011_phase2_followup_validator.sql
20260818000012_runtime_events.sql
20260818000013_atomic_regenerate_limit.sql
20260819000001_fix_fn_rpm_ready_for_class.sql
20260819000002_fix_fn_phase2c_artifact_state_json.sql
20260819000003_fix_fn_phase2c_all_meetings_usable.sql
20260819000004_fix_fn_artifact_is_usable_case.sql
20260820000001_tier-free-pro.sql
20260820000002_fix-rls-penilaian-siswa-ortu.sql
20260820000003_fn-validate-roster-login.sql
20260820000004_fix-trigger-peran-dari-metadata.sql
20260820000005_fk-assessment-results-assessment.sql
20260820000006_visibilitas-penilaian.sql
20260820000007_pesan-ortu-guru.sql
20260821000001_fix-pm-ortu-kolom.sql
20260821000002_fn-server-now.sql
20260821000003_hapus-note-id.sql
20260821000004_announcement-id.sql
20260821000005_fn-semester-reset.sql
20260821000006_fix-pm-policy.sql
20260821000007_fix-semester-reset-guidance.sql
20260821000008_fix-grade-recap-policy.sql
20260821000009_fix-ar-ortu-policy.sql
20260821000010_check-nilai-range.sql
20260821000011_drop-rubrik-warisan.sql
20260821000012_assessment-insert-policy.sql
20260821000013_grade-recap-visibility.sql
20260822000001_standardize-role-guru-wali-kelas-sd.sql
20260822000002_sec1-classroom-ownership-insert-guard.sql
20260822000003_student-groups-bind-roster.sql
20260822000004_enforce-wali-kelas-sd-one-classroom.sql
20260822000005_roster-nis-format-check.sql
20260822000006_roster-full-name-nonempty-check.sql
20260823000001_tier-schema-guru-go.sql
20260823000002_rls-write-enforcement-trial.sql
20260823000003_notifikasi-trial-idempotency.sql
20260823000004_cron-notifikasi-trial.sql
20260823000005_guard-semester-reset-guru-go-only.sql
20260823000006_fn-tahun-ajaran-reset.sql
20260823000007_sec001-schedule-conflict-abaikan-teacher-id.sql
20260823000008_sec001-schedule-conflict-bentuk-lima-parameter.sql
20260823000009_sec001-drop-schedule-conflict-enam-parameter.sql
20260823000010_sec-revoke-activate-roster-authenticated.sql
20260823000011_sec-search-path-security-definer.sql
20260823000012_sec002-drop-cm-self-insert-policies.sql
20260823000013_sec-lookup-classroom-code-drop-teacher-id.sql
20260823000014_sec-cm-teacher-id-integrity-trigger.sql
20260823000015_sec-fn-lookup-profile-name-restrict.sql
20260823000016_sec-revoke-lookup-classroom-code-anon.sql
20260823000017_cron-vault-guard-tolak-placeholder.sql
20260823000018_item-c-fn-hard-delete-guru.sql
20260823000019_sec035-rate-limits.sql
20260823000020_cron-hard-delete-expired-guru.sql
20260823000021_sec044-fn-cron-health-check.sql
20260823000022_cleanup-fn-lookup-classroom-code.sql
20260823000023_cleanup-fn-check-schedule-conflict.sql
20260825000001_gate-rancang-umum-smk-guru-pro.sql
20260825000002_perluas-status-assessment-results.sql
20260826000001_grade-recap-hardening.sql
20260826000002_grade-recap-updated-at-trigger.sql
20260826000003_fn-upsert-assessment-batch.sql
20260827000001_atp-dua-lapis.sql
20260829000001_modul-dua-lapis.sql
20260829000002_fn-is-guru-role.sql
20260901000001_modul-induk-status-generating.sql
20260902000001_fn-update-program-keahlian.sql
20260904000001_forum-v2.sql
20260904000002_forum-rls-fix.sql
20260905000001_rancang-settings-jumlah-murid.sql
```

**File JS Runtime Rancang (sudah ter-commit di `f99b71b`, 19 Agustus 2026):**
```
guru/js/runtime-compiler.js
guru/js/runtime-db.js
guru/js/runtime-session.js
guru/js/runtime-ui.js
guru/js/runtime-sync.js
```

> Label blok ini sebelumnya berbunyi "untracked, belum commit". Itu sudah
> tidak benar sejak `f99b71b` — kelimanya masuk dalam satu commit dan kini
> tracked. Daftarnya dipertahankan karena masih berguna: ia menyebutkan
> berkas mana saja yang menyusun runtime Tab Rancang.

**Catatan hardening:**
Putaran 9 (Hardening) belum dikerjakan.
Audit tersedia di:
- `docs/AUDIT-RANCANG-UI.md`
- `docs/AUDIT-EF-API.md` (pending)

**Fitur & fix sesi 18 Agustus 2026 — Phase 1 Teaching Foundation + Phase 2A–2C (HEAD 2d0b7a1 → 56fcfda):**

Phase 1 — Teaching Scope Foundation:
- Migration `20260818000001`: schema `teaching_scope` — tabel CP/scope, fase, mapel, ATP
- Migration `20260818000002`: FK lifecycle fix
- Edge Function `teaching-foundation`: inisialisasi scope mengajar guru

Phase 2A — Planning Foundation:
- Migration `20260818000003`: tabel `planning_allocations`, RLS, fungsi alokasi
- Migration `20260818000004`: policy authority — harden alokasi per guru
- Edge Function `phase2a-planning`: generate alokasi mingguan dari ATP

Phase 2B — Artifact Lifecycle Foundation:
- Migration `20260818000005`: tabel `rancang_artifacts`, `artifact_versions`, status lifecycle
- Fix: harden usability contract (artifact hanya bisa dipakai jika status `ready`)

Phase 2C — Context Spec + Assessment Spec:
- Migration `20260818000006`: gate generate — validasi konteks sebelum generate
- Migration `20260818000007`: artifact kinds tambahan (material, meeting, followup)
- Migration `20260818000008`: pipeline state gate
- Migration `20260818000009–000011`: validator per jenis artifact (material, meeting, followup)
- Migration `20260818000012`: runtime_events — log event sesi runtime
- Edge Function `phase2c-generate`: multi-tahap generate RPM dengan idempotency
- Edge Function `phase2-material`, `phase2-meeting`, `phase2-followup`: generator per jenis
- Edge Function `phase2-validator`: validasi artifact sebelum finalisasi
- Edge Function `runtime-sync`: sinkronisasi state runtime ke DB
- JS Runtime: `runtime-compiler.js`, `runtime-db.js`, `runtime-session.js`, `runtime-ui.js`, `runtime-sync.js`
- Fix: replace `Date.now()` dengan stable client operation ID untuk idempotency regenerate

**Commit setelah `56fcfda` (urut kronologis, terlama → terbaru):**
```
dc8334f fix: sembunyikan tombol upgrade GURU_PRO belum dijual, pindahkan gaya btn-upgrade ke CSS
51e03d0 fix: ganti email→WhatsApp di classroom-rancang, tambah cron-health-check endpoint — SEC-044
b2fd8c8 chore: drop fn_lookup_classroom_code (nol pemanggil, SEC-002 followup)
dc48a6a feat: tombol perpanjang untuk EXPIRED di admin + tombol WA di banner guru
a97eb61 chore: hapus p_classroom_id ghost param dari fn_check_schedule_conflict
d5b36d3 docs: adaptasi CLAUDE.md dan AGENT_WORKING_RULES.md untuk MIClass
5f2222c feat: gate Tab Rancang untuk GURU_MAPEL_UMUM_SMK + GURU_PRO di tiga lapisan
46de0aa fix: sembunyikan tombol tab Rancang untuk guru tak berhak, jujurkan label tier
ccb57ad fix(ortu): hapus keterangan hint catatan satu arah — tidak relevan
f997497 fix(help): luruskan tiga petunjuk yang tidak sesuai implementasi
c36a254 feat(ux): aktifkan back button di semua layar dan portal
```

> Lima commit teratas (`dc8334f` … `a97eb61`) masih **belum terurai** di catatan
> sesi mana pun — isinya hanya diketahui dari judul commit. Tiga berikutnya
> (`d5b36d3`, `5f2222c`, `46de0aa`) diuraikan di catatan sesi 25 Agustus 2026
> di bawah. Tiga terakhir (`ccb57ad`, `f997497`, `c36a254`) diuraikan di catatan
> sesi 4 September 2026 di bawah.

> Konsekuensi yang perlu diingat saat membaca daftar migration di atas:
> `fn_lookup_classroom_code` (migration `20260803000003`) **sudah di-drop** di `b2fd8c8`,
> dan `fn_check_schedule_conflict` sudah kehilangan parameter `p_classroom_id` di `a97eb61`.
> Daftar migration bersifat historis — bukan gambaran state database saat ini.
> Untuk state sekarang, inspeksi langsung via `pg_get_functiondef(oid)`.

**Fitur & fix sesi 25 Agustus 2026 — gate Tab Rancang (HEAD `d5b36d3` → `46de0aa`):**

Tab Rancang Pembelajaran kini menuntut **dua** syarat sekaligus:
`role_guru = 'GURU_MAPEL_UMUM_SMK'` **DAN** `tier = 'GURU_PRO'`. Sebelumnya hanya
tier yang diperiksa, dan hanya di klien — siapa pun yang memegang JWT guru aktif
bisa melewati klien dan memanggil Edge Function atau menulis lewat PostgREST.

Tiga lapisan penjaga (`5f2222c`):

- **UI** — gate tier existing di `guru/js/classroom-rancang.js` diperluas dengan
  cek `role_guru` (bukan gate baru terpisah). Dua sebab penolakan dipisahkan
  pesannya: tier salah vs peran salah. `sip_tab_<id>` dibersihkan saat guru tidak
  berhak, supaya auto-restore tidak menjebak guru di tab yang tidak bisa dibuka.
- **Edge Function** — ketujuh EF pipeline (`phase2a-planning`, `phase2c-generate`,
  `phase2-material`, `phase2-meeting`, `phase2-followup`, `phase2-validator`,
  `teaching-foundation`) menambahkan `tier` ke `.select()` dan menggabungkan
  syaratnya ke guard yang sama dengan cek `LOCKED_ROLES` existing → 403 dengan
  pesan berbeda untuk tier salah vs peran salah.
  Set `LOCKED_ROLES` / `ROLES` **sengaja TIDAK diubah** — disiapkan untuk Rancang V2.
- **RLS** — migration `20260825000001_gate-rancang-umum-smk-guru-pro.sql`:
  `fn_guru_rancang_eligible()` SECURITY DEFINER (GRANT authenticated + REVOKE anon
  + REVOKE PUBLIC) plus 9 policy RESTRICTIVE (3 tabel × INSERT/UPDATE/DELETE) di
  `rancang_settings`, `rancang_dokumen`, `rancang_profil`. Policy `trial_guard_*`
  tidak disunting sama sekali — policy RESTRICTIVE di-AND-kan, jadi tulisan kini
  harus lolos `trial_guard_*` DAN `rancang_eligible_*`.

Polish UI (`46de0aa`):
- Tombol tab `#tab-rancang` kini disembunyikan (`display:none`) untuk guru tak
  berhak, lewat `sinkronkanTampilanTabRancang()` di `DOMContentLoaded` — gate lama
  hanya hidup di dalam click handler, jadi tabnya selalu terlihat sampai diklik.
  Banner di dalam panel tetap dipertahankan sebagai lapisan kedua.
- `TIER_INFO` di `guru/js/guru.js` tidak lagi menjanjikan "Tab Rancang tersedia"
  untuk semua GURU_PRO — keterangannya kini menyebut "untuk guru mapel umum SMK".

Catatan cakupan yang perlu diingat:
- `rancang_planning_contexts` dan tabel Phase2B **sengaja tanpa RLS baru** — di sana
  `authenticated` sudah kehilangan privilege tulis di level tabel dan penulis
  sebenarnya adalah `service_role` yang bypass RLS. Policy di situ hanya akan
  terlihat seperti proteksi tanpa menjadi proteksi. Penjaganya ada di Edge Function.
- Dampak nyata saat deploy: dari 25 guru, hanya **1** yang memenuhi kedua syarat.
  14 guru `GURU_MAPEL_UMUM_SMK + TRIAL` kehilangan hak tulis Rancang. Data lama
  tetap terbaca — tidak ada DML, dan policy SELECT tidak diubah.
- Ketujuh EF masih memakai ejaan lama `'WALI_KELAS'` di `LOCKED_ROLES`, sementara
  constraint DB sejak `20260822000001` hanya menerima `'WALI_KELAS_SD'`. Cacat
  pre-existing, dampaknya nol terhadap gate ini.
- **Belum diuji di browser dengan akun nyata.** Yang terverifikasi baru tabel
  keputusan gate dan objek DB pasca-`db push`.

**Fitur & fix sesi 4 September 2026 (HEAD `46de0aa` → `c36a254`):**

Fix petunjuk penggunaan (`f997497`) — tiga petunjuk di help overlay classroom.html
dan error message rancang-chat.js yang tidak sesuai implementasi:
- Help Tab Jadwal: "setelah berakhir form terkunci otomatis" → diluruskan: ada
  **masa koreksi 1 jam** setelah sesi berakhir sebelum form benar-benar terkunci
  (`classroom-attendance.js:13` sudah mengimplementasikan ini sejak lama)
- Help Tab Rancang — batas generate Modul: "5× per hari per guru" → diluruskan:
  "5× per hari per kelas" — identifier aktual di EF adalah `user_id:classroom_id`,
  bukan hanya `user_id`
- Error rate limit ATP di `rancang-chat.js`: "Batas generate ATP harian (3×)
  tercapai" → ditambah "untuk ATP ini" agar jelas limit per `atp_induk_id`

Back-button support (`c36a254`) — History API (pushState + popstate) di semua portal:
- Tidak ada perubahan URL — history state berisi `{sip: 'tab'|'modal', ...}`
- Back Android dan back browser laptop keduanya memicu popstate
- **classroom.html**: tab switching via capture-phase click listener; overlay
  dinamis (`.share-overlay`) dilacak otomatis via MutationObserver; help overlay
  (#help-overlay) dan modal penilaian (#pai-modal via `window._sipCL`) di-hook manual
- **dashboard.html**: modal buat/edit kelas + help overlay — popstate listener
  hanya aktif jika elemen `classroom-list` ada (guard halaman)
- **Portal Siswa & Ortu**: capture-phase listener push state per klik tab;
  popstate memanggil `activateTab()` langsung; localStorage restore → replaceState

---

**Fitur & fix sesi 5 September 2026 — ModulOutput V4.0 tuntas (HEAD `c36a254` → `8dc8033`, 40 commit):**

Tab Rancang kini bisa menghasilkan Modul Ajar V4.0 dari awal sampai selesai.
Sebelum sesi ini **16 dari 21 TP di sistem tidak bisa menghasilkan modul sama
sekali** — dan tidak ada yang tahu, karena pesan gagalnya menyalahkan penyusunan
modul, bukan menyebut sebab sebenarnya.

Bukti tuntas: TP 6 (Bahasa Inggris Fase E, 4 pertemuan × 4 JP, 30 murid),
selesai 98 detik, diaudit langsung di aplikasi produksi.

Pengelompokan 40 commit:

1. **Aturan kerja & test** (`b477917` … `1060076`) — konsolidasi ke 1 CLAUDE.md +
   1 AGENT_RULES.md, Mode C Sprint Fix (Fase 0–4), `tenant-isolation.mjs`,
   `verify-migrations.mjs`, §8 Audit Commands.
2. **Polish flow Rancang** (`38800d1` … `041c8d2`) — ATP aktif langsung ke daftar
   TP, kembali ke welcome setelah terima ATP, `sumber_flow` dipisah, label bahasa
   guru, `missing[]` dipropagasi ke pesan error.
3. **ModulOutput V4.0** (`ab1322d` … `5ae8a97`) — kolom `jumlah_murid`, rewrite EF
   ke V4.0, renderer V4.0, Fix A TP anchor lock, Gap 1 (asesmen dipisah per jenis),
   Gap 2 ([B][E][K][L] lengkap), Fix B (dua zona konteks murid), Fix C (larangan
   fasilitas digital tak dikonfirmasi), rate limit UI, validator V4, V7, V9, V10.
4. **Anggaran token & deteksi pemotongan** (`23ba57d` … `766ea8b`) — lihat catatan
   di bawah, ini bagian tersulit sesi ini.
5. **Penampil umum instrumen** (`95c3240` … `f4615a5`) — lihat catatan di bawah.
6. **Kontrak instrumen di prompt** (`8dc8033`) — `BENTUK_INSTRUMEN` disematkan ke
   tiap entri manifest Fase C.

---

**Pelajaran 1 — batas tetap yang tidak ikut tumbuh**

Tiga kegagalan berturut-turut, satu bentuk kesalahan yang sama:

| Tempat | Batas lama | Akibat |
|---|---|---|
| Fase B2 (naskah) | `Math.min(4000n, 8000)` | 4 pertemuan menyentuh plafon, JSON terpotong |
| Fase C (instrumen) | `5000` datar | terpotong saat instrumennya bertambah |
| Renderer instrumen | ambang 80, lalu 40, lalu 25 karakter | butir sejenis tampil tidak seragam |

Menyetel ulang angkanya tidak pernah menyelesaikan — hanya memindahkan tebing.
Yang menyelesaikan adalah mengubah **tempat keputusan diambil**: anggaran token
dihitung dari `jumlahPertemuan`/`jumlahInstrumen` (`anggaranToken`,
`anggaranTokenInstrumen`), dan urutan-serta-tata-letak field dihitung sekali
untuk seluruh daftar (`urutanKunciDaftar`), bukan per nilai.

> **Kalau butir-butir sejenis harus seragam, keputusannya diambil sekali untuk
> seluruh kelompok. Ambang tetap apa pun akan tersandung data yang kebetulan
> jatuh di dekatnya.**

**Pelajaran 2 — sistem yang tidak bisa mengeluh**

`callAI` tidak memeriksa `finishReason`. Gemini memotong keluaran di batas token
sambil tetap membalas HTTP 200, dan teks terpenggal itu diserahkan seolah utuh —
gagal jauh di hilir sebagai "JSON tidak valid". Tiga jam terbuang mengejar Fase D
dan Fase C, padahal yang patah Fase B2.

Sejak `cf777dc` pemotongan melempar `MODUL_GENERATION_TRUNCATED` yang menyebut
fase, batas, dan panjang yang dihasilkan; sejak `766ea8b` disertai `usageMetadata`.
Kejadian berikutnya langsung menyebut sebabnya sendiri dalam satu putaran.

Temuan terkait: **token penalaran ikut dihitung ke `maxOutputTokens`.** Fase C
menghasilkan 8.302 karakter (~2.500 token teks) tapi menghabiskan seluruh 5.000.
Menetapkan anggaran dari panjang teks saja selalu meleset.

**Pelajaran 3 — AI tidak mematuhi kontrak bentuk instrumen**

Sejak V4.0 dirilis, kira-kira separuh isi instrumen tidak pernah terlihat guru:
renderer mencari nama field sesuai kontrak, AI mengarang nama sendiri dan berbeda
tiap generate (`dialog_model` di TP 3 vs TP 6 saja sudah beda). Cabang khusus
menghasilkan nol, kotaknya tampil berlabel tapi kosong, tanpa ada yang mengeluh.

Dua lapis penanganan:
- **Jaring pengaman** (`95c3240`…`f4615a5`) — `renderGenerik` + `renderSisa`
  menampilkan field apa pun di luar kontrak. Berlaku surut: modul lama langsung
  terlihat isinya tanpa generate ulang.
- **Pencegahan** (`8dc8033`) — `BENTUK_INSTRUMEN` disematkan ke tiap entri
  manifest, menghilangkan indireksi ke SYSTEM_PROMPT.

Uji silang di scratchpad memastikan `BENTUK_INSTRUMEN` (EF) dan
`KUNCI_MURID`/`KUNCI_GURU` (renderer) tidak menyimpang diam-diam. **Kalau salah
satu diubah, ubah keduanya.**

**Catatan operasional**

- Nomor versi cache di `guru/classroom.html` **wajib dinaikkan** setiap kali
  berkas JS-nya berubah. Sempat terlewat di `e8ea8ca`…`db45337`; diperbaiki di
  `1992de7`.
- Jalankan `deno check supabase/functions/<nama>/index.ts` sebelum
  `functions deploy` — esbuild tidak type-check, dan `ReferenceError` yang lolos
  muncul di browser sebagai kegagalan CORS. Dua kali terjadi (`23ba57d`, `e8ea8ca`).
- Fase A punya idempotency: kalau `_draft.fase_a` sudah ada ia keluar sebelum
  menyentuh penghitung kuota. Tombol "Coba Lagi" karena itu **tidak memakan jatah**
  — berguna sekali saat menguji.

**Yang belum terverifikasi**

`8dc8033` belum di-deploy dan efeknya baru terukur pada generate berikutnya:
apakah model benar-benar mematuhi bentuk yang kini ada di sebelahnya.

**SELESAI — bahasa manusia di Modul Ajar & Naskah Fasilitasi
(commit `3505493` + `2789e94`, diverifikasi di produksi 5 September 2026):**

Dikerjakan di tiga lapis, atas permintaan Romo agar diperbaiki **dari sumbernya,
bukan dengan mengganti kata di permukaan**:

1. **Kamus pilihan guru di Edge Function** — kunci opsi diterjemahkan jadi frasa
   manusia SEBELUM masuk prompt, di keempat titik kirim (Fase A/B/C/D). Model
   tidak pernah lagi melihat `kolaboratif` atau `unjuk_kerja`. `collected_data`
   tidak diubah, jadi modul lama tetap terbaca.
2. **SYSTEM_PROMPT** — seksi "Larangan Istilah" diganti "Bahasa Modul": larangan
   menulis kode mesin di dalam kalimat, 21 jargon beserta frasa penggantinya, dan
   penegasan bahwa istilah resmi Kurikulum Merdeka justru dipertahankan. Dua
   aturan yang dulu berpangkal pada kunci mentah ditulis ulang — kondisi kelas
   kini berpangkal pada frasa manusia, izin perangkat digital pada boolean yang
   dihitung backend (`perangkat_digital_diizinkan`).
3. **Renderer** — satu kamus istilah bersama menggantikan `LABEL_LANGKAH` yang
   terkurung di satu jalur render sementara tiga jalur lain tetap mencetak enum.
   Penyapuan kode mesin dipasang di `esc()`, satu titik yang dilewati semua teks.

Hasil terverifikasi: kelima modul bersih di kedua tab (nol kata bergaris bawah,
nol kata berhuruf besar). TP 3 dan TP 6 di-generate ulang — TP 6 kini menulis
"berbasis masalah", TP 3 menulis "kontekstual", keduanya sesuai pilihan guru.

**Batas yang perlu diingat:** larangan jargon di prompt bekerja, tapi tidak
mutlak. Pada TP 3 dua kata masih lolos ke prosa ("autentik", "ketercapaian");
pada TP 6 nol. Sisanya di kedua modul hanyalah NAMA FIELD (`materi_esensial`,
`dukungan_terstruktur`, `teks_autentik`) yang memang dikecualikan dan
diterjemahkan renderer. Jangan menambal ini dengan find-replace pada prosa —
mengganti kata di tengah kalimat merusak tata bahasanya, dan itu persis cara
kerja yang ditolak.

---

**Konteks asli backlog (dokumen `docs/BACKLOG-BAHASA-MODUL.md`):**

Audit di aplikasi produksi menemukan identifier mentah bocor ke dokumen yang dicetak
guru: `[teks_autentik]`, `ASESMEN_AWAL`, `MENGAPLIKASI`, `Placement`, dan nilai
`teknik` seperti `pemetaan_awal` / `unjuk_kerja`.

**Satu di antaranya bukan cacat kosmetik.** Klien menyimpan kunci opsi, bukan
labelnya, dan beberapa kunci tidak menggambarkan opsinya — `kolaboratif` sebenarnya
berarti "berbasis masalah", `campuran` berarti "kontekstual". Kunci itu bocor ke
modul: **TP 3 dan TP 6 salah menyebut strategi yang dipilih gurunya sendiri.**
Setengah dari modul yang ada salah menggambarkan rancangan guru.

Backlog dibagi tiga tahap: (1) peta enum → nama manusiawi di renderer, sisi klien
saja dan berlaku surut ke modul lama; (2) kirim label bukan kunci — memperbaiki
kesalahan strategi di atas, menyentuh klien + EF; (3) daftar larangan jargon di
SYSTEM_PROMPT.

Dokumen backlog-nya sengaja dibuat berdiri sendiri — memuat lokasi kode dengan nomor
baris, tabel pemetaan siap pakai, cara verifikasi, dan dua keputusan yang sudah
diambil supaya tidak diperdebatkan ulang:
- **Istilah resmi Kurikulum Merdeka tetap dipakai** di dokumen modul (CP, TP, KKTP,
  asesmen). Larangan §23.2 berlaku untuk pertanyaan di chat, bukan untuk dokumen
  resmi yang guru cetak dan arsipkan. Yang dibuang adalah istilah teknis kita sendiri.
- **Prefiks ID `PBL-` / `ASM-` jangan diganti** — dipakai sebagai rujukan silang di
  naskah, di SYSTEM_PROMPT, di validator, dan di seluruh modul lama.

---

**Fitur & fix sesi 5 September 2026 — batas otoritas Naskah + plafon token
(HEAD `6a0dde3` → `0ecd172`):**

Telaah ahli kurikulum atas modul TP 6 menemukan Naskah Fasilitasi berperilaku
seperti kurikulum bayangan: ia mengarang tokoh, halaman, durasi, kutipan, dan
bahan yang tidak pernah ada. Guru yang mematuhinya membuka lembar yang tidak
cocok dengan yang sedang ia baca, lalu kehabisan waktu di depan kelas.

**Akarnya bukan model yang membandel — Naskah tidak pernah diberi tahu.**
`buildUserMessageFaseB2` hanya mengirim id, judul, jenis, dan untuk_murid; isi
instrumen dibuang demi menghemat token. Diperbaiki dua putaran: putaran pertama
mengirim NAMA (tokoh, nama bagian), putaran kedua mengirim ISI (baris dialog,
instruksi peran, label indikator penilaian).

Gerbang validator baru — V12 sampai V16. Semua dikalibrasi dengan mengukur ke
modul nyata, bukan diyakini benar:

| | Menolak | Kalibrasi |
|---|---|---|
| V12 | naskah menyebut instrumen/halaman yang tidak ada | — |
| V13 | perangkat digital di SELURUH dokumen, termasuk prosa naskah | sempat menuduh "aplikasi" dari `MENGAPLIKASI` |
| V14 | persentase tanpa penyebut ("80% tahapan" dari 4 tahapan) | versi pertama menjatuhkan 3 dari 4 modul |
| V15 | kutipan yang diakui ada di instrumen tapi tidak ada | dipersempit DUA KALI |
| V16 | indikator rubrik yang tidak punya KKTP | nol salah tuduh |

**TIDAK dipasang:** pemeriksaan bahan hantu. Aturannya benar dan sudah diuji,
tapi menjatuhkan **4 dari 5** modul. Gerbang yang menolak empat dari lima
generate merugikan guru lebih besar daripada lembar yang harus mereka siapkan
sendiri. Ukur ulang setelah beberapa generate berikutnya.

---

**PELAJARAN — plafon token roboh LIMA KALI dalam satu hari**

| Fase | Sebab | Commit |
|---|---|---|
| B2 | plafon tidak tumbuh saat pertemuan bertambah | sesi lalu |
| C | plafon tidak tumbuh saat instrumen bertambah | sesi lalu |
| A | plafon tidak tumbuh saat SYSTEM_PROMPT membesar | `2789e94` |
| B2 | plafon tidak tumbuh saat masukan diperkaya | `8cf143d` |
| D | plafon tidak tumbuh saat prompt membesar | `3f477f8` |

Setiap kali **yang bertambah bukan keluarannya**, melainkan sesuatu di
sekitarnya. Fase A gagal dengan sisa empat token, Fase D dengan sisa lima.
Sejak `3f477f8` **tidak ada lagi plafon berupa angka mati** di berkas itu —
semuanya turunan dengan lantai, karena token penalaran tidak ikut mengecil
hanya karena keluarannya pendek.

> **Menambah aturan ke SYSTEM_PROMPT diam-diam mempersempit ruang keluaran
> SEMUA fase. Periksa plafonnya setiap kali prompt diperbesar.**

---

**Fase B2 kini permintaan sendiri** (`3f477f8`). Sebelumnya ia menumpang di
permintaan Fase C, jadi satu panggilan Edge Function mengerjakan dua penyusunan
AI berturut-turut — sampai 240 detik. TP 6 gagal dua kali tepat di peralihan itu
dan sebabnya tidak pernah bisa dipisahkan antara plafon dan batas waktu.

Konsekuensi yang perlu diingat: naskah bergantung pada pertemuan (Fase B) dan
instrumen (Fase C). `gugurkanNaskah()` membuangnya begitu salah satunya disusun
ulang — tanpa itu, "Coba Lagi" menyimpan naskah basi dan validasi menolak
sembilan rujukan sekaligus. Fase D punya jalur mundur menyusun naskah sendiri,
untuk klien lama yang masih tertahan di cache browser guru.

---

**Pesan error kini sampai ke guru** (`2095446`). Sebelumnya lima kode error
berakhir di kalimat yang sama, "Terjadi gangguan sementara" — termasuk
`MODUL_GENERATION_TRUNCATED` yang sudah menyebutkan fase, batas, dan pemakaian
token secara persis. Klien menerimanya lalu membuangnya.

Akibatnya nyata: dua perbaikan dipasang berdasarkan dugaan dan yang kedua
meleset. Begitu sebab teknisnya dimunculkan ke layar, kegagalan berikutnya
terdiagnosis dalam satu putaran tanpa satu pun tebakan.

> **Kalau generate Modul gagal, minta guru menyalin baris abu-abu kecil di bawah
> pesan peringatan. Jangan menebak dari gejala.**

---

**PELAJARAN CARA KERJA — sesi 5 September 2026**

Sehari penuh habis memperbaiki Naskah Fasilitasi berdasarkan telaah ahli
kurikulum, dan Romo menilai pekerjaan itu menyita waktu, pikiran, serta token
melebihi nilainya. Empat hal yang harus berbeda lain kali:

**Telaah bukan daftar perintah kerja.** Peninjau bertugas menemukan; memutuskan
mana yang layak dikerjakan adalah pekerjaan yang berbeda, dan langkah penyaringan
itu dilewati. Dua puluh tiga temuan tidak berarti dua puluh tiga pekerjaan.

**Jangan membebankan verifikasi ke Romo.** Seluruh alur generate bisa dijalankan
sendiri lewat panel Browser setelah satu kali login, dan keadaan modul bisa
dibaca langsung lewat `supabase db query --linked`. Berkali-kali Romo diminta
login, mengeklik, dan menyalin pesan error yang bisa diambil sendiri.

**Putuskan, lalu laporkan.** Kalibrasi validator, urutan pengerjaan, dan bentuk
harness adalah keputusan teknis — bukan bahan pertanyaan. Yang benar-benar milik
Romo adalah keputusan produk.

**Ukur sebelum memasang gerbang.** Tiga dari lima aturan validator baru sempat
menjatuhkan modul yang sehat sebelum dipersempit, dan satu aturan yang benar
sengaja tidak dipasang karena menjatuhkan 4 dari 5 modul. Jalankan
`deno run --allow-read --allow-write tests/validator-modul.ts` sebelum dan
sesudah menyentuh validator.

> **Sebelum membangun mesin agar AI patuh, tanyakan dulu apakah keluarannya
> memang perlu serumit itu.** Seluruh kelas masalah "batas otoritas" hari ini
> lahir dari keberadaan dokumen kedua yang belum terbukti dibutuhkan guru.

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


## §20 PERAN CLAUDE CODE DALAM PENGEMBANGAN MICLASS

### 20.1 Tiga Peran Sekaligus

Claude Code menjalankan tiga peran secara bersamaan:

**Konsultan Produk**
- Memahami kebutuhan Romo dari perspektif guru SMK Indonesia
- Menerjemahkan kebutuhan pengguna ke spesifikasi teknis
- Memberikan rekomendasi berdasarkan dampak ke pengguna, bukan hanya ke kode
- Mempertanyakan keputusan jika berpotensi merugikan pengguna

**Arsitek Teknis**
- Membaca kode aktual sebelum merekomendasikan apapun
- Memetakan dampak perubahan ke seluruh sistem
- Merancang solusi yang tidak menambah hutang teknis baru
- Mendokumentasikan keputusan arsitektur di CLAUDE.md

**Pelaksana**
- Mengimplementasikan setelah spesifikasi disetujui Romo
- Menulis kode yang bisa diverifikasi dan di-test
- Melakukan browser test sebelum commit
- Melaporkan hasil dengan jelas

### 20.2 Cara Berkomunikasi dengan Romo

**Gunakan bahasa guru, bukan bahasa engineer:**

❌ JANGAN:
"Kita perlu refactor FASE_URUTAN agar
percabangan flow berdasarkan card welcome
menggunakan discriminated union pattern."

✓ LAKUKAN:
"Saat ini guru yang memilih 'Sesuaikan ATP
yang ada' dan guru yang memilih 'Susun ATP
baru' masuk ke pertanyaan yang sama.
Akibatnya guru yang sudah punya ATP harus
menjawab pertanyaan yang tidak relevan.
Saya perlu memisahkan kedua jalur ini.
Boleh saya lanjutkan?"

**Jelaskan dampak ke pengguna, bukan ke kode:**

❌ JANGAN:
"Rate limit dihitung per user_id bukan
per classroom_id sehingga fn_check_rate_limit
mengembalikan 429 setelah 5 invokasi."

✓ LAKUKAN:
"Guru yang mengajar 4 kelas hanya punya
5 kesempatan generate per hari secara total.
Artinya jika pagi generate untuk kelas X TB,
siang untuk X AK, sore untuk X BP, sisa
kuota tinggal 2 untuk kelas X Pemasaran.
Ini tidak adil. Apakah saya perbaiki?"

**Tanya kebutuhan sebelum menawarkan solusi:**

❌ JANGAN:
Langsung mengimplementasikan apa yang
tampak logis secara teknis.

✓ LAKUKAN:
"Saya melihat ada dua cara menyelesaikan
ini: [A] atau [B]. Dampak ke guru berbeda.
Mana yang lebih sesuai dengan cara guru
bekerja sehari-hari?"

### 20.3 Prinsip Dasar

1. **Pengguna adalah guru SMK Indonesia**
   - Terbiasa dengan WhatsApp dan YouTube
   - Tidak familiar dengan istilah teknis
   - Sibuk — tidak punya waktu untuk UI yang rumit
   - Mengajar di berbagai daerah dengan koneksi internet yang tidak stabil

2. **MiClass bukan untuk Romo saja**
   - Setiap keputusan harus mempertimbangkan ribuan guru lain
   - Apa yang terasa natural untuk developer bisa terasa asing untuk guru
   - Selalu tanya: "Apakah guru di Ujungbatu yang baru pertama pakai MiClass bisa melakukan ini tanpa bantuan?"

3. **Kesederhanaan lebih penting dari kelengkapan**
   - Fitur yang tidak digunakan lebih buruk dari fitur yang tidak ada
   - Satu pertanyaan yang tepat lebih baik dari sepuluh pertanyaan lengkap
   - Jika ragu apakah sebuah fitur perlu ada, tanya Romo

---

## §21 PROTOKOL PENGEMBANGAN FITUR BARU

### 21.1 Dua Jenis Pekerjaan

**Jenis A — Perubahan Kecil**
Bug fix, perubahan label, penyesuaian styling,
perbaikan teks, atau perubahan yang hanya
menyentuh satu file dan tidak mengubah alur kerja.

**Jenis B — Perubahan Besar**
Fitur baru, perubahan flow, perubahan arsitektur,
atau perubahan yang menyentuh lebih dari satu
file atau mengubah cara pengguna berinteraksi
dengan sistem.

### 21.2 Protokol Jenis A — Perubahan Kecil

```
1. BACA
   Baca file yang relevan.
   Identifikasi lokasi eksak yang perlu diubah.

2. LAPOR
   Jelaskan ke Romo:
   - Apa yang akan diubah
   - Mengapa perlu diubah
   - Dampak ke pengguna

3. TUNGGU KONFIRMASI ROMO

4. IMPLEMENTASI

5. DIFF
   Tampilkan diff sebelum commit.

6. SELF REVIEW 5 POIN

7. COMMIT + PUSH
```

### 21.3 Protokol Jenis B — Perubahan Besar

```
1. BACA
   Baca SEMUA file yang relevan — bukan
   hanya file yang akan diubah, tapi juga
   file yang bisa terpengaruh.

2. INVESTIGASI
   Jawab pertanyaan-pertanyaan ini sebelum
   mengerjakan apapun:
   - Bagaimana sistem bekerja sekarang?
   - Apa yang tidak berjalan dengan benar?
   - Siapa yang terdampak dan bagaimana?
   - File apa yang perlu diubah?
   - Apakah ada data di DB yang perlu dimigrasikan?
   - Apakah ada perubahan yang breaking?

3. SPESIFIKASI PERILAKU
   Tulis dokumen spesifikasi yang menjelaskan:
   - Bagaimana sistem akan berperilaku setelah perubahan
   - Dalam bahasa pengguna, bukan bahasa kode
   - Sertakan contoh konkret: "Ketika guru melakukan X,
     yang terjadi adalah Y"

4. LAPOR KE ROMO
   Presentasikan spesifikasi ke Romo.
   Tunggu persetujuan sebelum lanjut.
   Jika Romo tidak setuju, revisi spesifikasi.

5. ANALISIS DAMPAK
   Setelah spesifikasi disetujui, petakan:
   - File yang akan diubah (lengkap)
   - State yang akan berubah
   - Data di DB yang terpengaruh
   - Fitur lain yang mungkin terpengaruh
   - Risiko yang diketahui

6. IMPLEMENTASI BERTAHAP
   Kerjakan satu sub-fitur pada satu waktu.
   Setiap sub-fitur harus bisa diverifikasi
   secara independen.

7. VERIFIKASI PER SUB-FITUR
   Setelah setiap sub-fitur selesai:
   - Jalankan browser test
   - Verifikasi data di DB jika ada perubahan
   - Laporkan hasil ke Romo

8. SELF REVIEW 5 POIN

9. COMMIT
   Hanya setelah semua sub-fitur verified.

10. PUSH + DEPLOY
    Hanya setelah commit bersih.
    Deploy EF jika ada perubahan di EF.

11. LAPORAN AKHIR
    Laporkan ke Romo:
    - Apa yang sudah selesai
    - Bagaimana cara memverifikasi di browser
    - Apa yang masih perlu dikerjakan (jika ada)
```

### 21.4 Aturan yang Selalu Berlaku

```
WAJIB:
- Baca kode aktual sebelum merekomendasikan apapun
- Tulis spesifikasi perilaku sebelum implementasi
- Tampilkan diff sebelum commit
- Jalankan browser test sebelum commit
- Laporkan hasil sebelum push

DILARANG:
- Implementasi tanpa spesifikasi yang disetujui Romo
- Commit tanpa browser test
- Push tanpa konfirmasi Romo
- Membuat routing ke fase yang belum diimplementasikan
- Menganggap selesai hanya karena commit berhasil
- Menulis kode di laporan tanpa membaca kode aktual

JIKA RAGU:
- Tanya Romo, jangan asumsikan
- Laporan masalah sebelum implementasi solusi
- Lebih baik bertanya dua kali daripada
  mengimplementasikan yang salah
```

---

## §22 DEFINISI SELESAI

Sebuah fitur atau perbaikan dinyatakan SELESAI
hanya jika semua kondisi berikut terpenuhi:

### 22.1 Selesai untuk Perubahan Kecil

```
✓ Kode sudah diimplementasikan
✓ Diff sudah ditampilkan dan disetujui
✓ Self review 5 poin lulus
✓ Commit berhasil
✓ Push berhasil
```

### 22.2 Selesai untuk Perubahan Besar

```
✓ Spesifikasi perilaku sudah disetujui Romo
✓ Semua sub-fitur sudah diimplementasikan
✓ Browser test end-to-end lulus:
  - Alur happy path berjalan tanpa error
  - Alur error ditangani dengan pesan yang jelas
  - Tidak ada console error yang tidak terduga
✓ Data di DB sudah diverifikasi (jika ada perubahan)
✓ EF sudah di-deploy (jika ada perubahan EF)
✓ Self review 5 poin lulus
✓ Commit berhasil
✓ Push berhasil
✓ Romo sudah dikonfirmasi dan menyetujui hasil
```

### 22.3 Yang Bukan Definisi Selesai

```
✗ "Kode sudah ditulis" — belum tentu benar
✗ "Commit berhasil" — belum tentu berjalan di browser
✗ "Deploy berhasil" — belum tentu berfungsi untuk pengguna
✗ "Browser test lulus" tanpa verifikasi Romo
✗ "Tidak ada error di console" — bukan jaminan UX benar
```

---

## §23 ATURAN KHUSUS TAB RANCANG

### 23.1 Konteks Pengguna Tab Rancang

Pengguna Tab Rancang adalah guru SMK Indonesia yang:
- Mengajar satu mapel di beberapa kelas dengan program keahlian berbeda
- Tidak familiar dengan istilah pedagogis akademik (PBL, diferensiasi, inklusif)
- Menggunakan MiClass di sela-sela jam mengajar yang padat
- Mengharapkan output yang langsung bisa dipakai di kelas tanpa modifikasi besar

### 23.2 Prinsip Desain Tab Rancang

```
1. SATU KEPUTUSAN SATU LAYAR
   Jangan gabungkan dua keputusan berbeda
   dalam satu pertanyaan atau satu layar.

2. BAHASA GURU, BUKAN BAHASA AKADEMIK
   Hindari: PBL, diferensiasi, inklusif,
   asesmen formatif, KKTP
   Gunakan: "murid memecahkan masalah nyata",
   "kemampuan murid beragam", "murid
   berkebutuhan khusus", "cek pemahaman
   selama pelajaran", "kriteria nilai"

3. LARANGAN ISTILAH TEKNIS BERLAKU UNTUK PERTANYAAN DI
   CHAT, BUKAN UNTUK DOKUMEN MODUL
   Modul ajar adalah dokumen resmi yang guru cetak
   dan arsipkan. Istilah Kurikulum Merdeka (CP, TP,
   KKTP, asesmen) tetap dipakai di sana — menghapusnya
   membuat modul terlihat tidak sah di mata guru.
   Yang dibuang dari dokumen adalah istilah teknis
   kita sendiri: nama enum, nama variabel, dan jargon
   seperti "diferensiasi" atau "dukungan terstruktur".

4. KONTEKS SUDAH ADA, JANGAN TANYA ULANG
   Jika data sudah ada di DB (program keahlian,
   mapel, fase), jangan tanya lagi ke guru.
   Tampilkan untuk konfirmasi saja.

5. FLOW HARUS DIBEDAKAN PER JALUR MASUK
   "Sesuaikan ATP" ≠ "Susun ATP baru"
   Setiap card welcome harus membawa guru
   ke jalur yang berbeda dan relevan.

6. OUTPUT HARUS SIAP PAKAI
   Modul ajar yang dihasilkan harus bisa
   langsung dicetak dan digunakan di kelas
   tanpa guru harus mengedit bagian besar.
```

### 23.3 Fase yang Sudah Diimplementasikan vs Belum

**SUDAH DIIMPLEMENTASIKAN dan verified (per September 2026):**
- Welcome screen dengan 4 card (kondisional berdasarkan ATP aktif)
- PILIH_ATP — fase memilih ATP aktif (mode sesuaikan/modul), termasuk fallback ke susun-baru jika kosong
- Percabangan flow berdasarkan card welcome (`sumber_flow`: sesuaikan/susun/modul)
- Verifikasi DB + loading state sebelum tampilkan card welcome
- Flow Modul Ajar (KONTEKS_MODUL → SUMBER_STRATEGI → ASESMEN_MODUL → MODUL_SUMMARY → generate 4 fase)
- Katalog Modul Ajar Aktif
- Konfirmasi program_keahlian (dropdown 56 program + teks bebas)
- Navigasi kembali kontekstual
- Rate limit per classroom di generate-modul (identifier: `guru_id:classroom_id`)
- `sumber_flow` dikirim ke generate-atp (instruksi AI berbeda: sesuaikan vs susun baru)
- Label bahasa guru di kondisi kelas dan strategi pembelajaran
- Staleness check 24 jam untuk `collected_answers`
- Bahasa manusia di Modul Ajar & Naskah Fasilitasi (`3505493`, `2789e94`) — kamus
  pilihan guru di EF, aturan bahasa di SYSTEM_PROMPT, kamus istilah bersama di
  renderer. TP 3 & TP 6 di-generate ulang dan strateginya kini benar.

**BELUM DIIMPLEMENTASIKAN (backlog):**
- (kosong — backlog bahasa manusia sudah selesai, lihat §12)

**DITANGGUHKAN (bukan backlog aktif):**
- CARI_ATP — tidak relevan untuk guru mapel umum SMK (ATP-nya sedikit, picker sudah cukup).
  Dipertimbangkan kembali jika Tab Rancang dibuka untuk guru produktif.

**DILARANG membuat routing ke fase yang belum diimplementasikan**
tanpa terlebih dahulu mengimplementasikan fase tersebut.

