# Student Insight Platform — MIClass
# Konteks untuk Claude Code

> Baca SELURUH dokumen ini sebelum mengerjakan apapun.
> Dokumen ini adalah sumber kebenaran untuk **konteks produk** MIClass.
> Pasangannya, `AGENT_WORKING_RULES.md`, adalah sumber kebenaran untuk **aturan kerja agen**
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

---

## 12. STATUS PROYEK

**Fase saat ini: DEVELOPMENT AKTIF**
**HEAD:** `46de0aa` (per 25 Agustus 2026)

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
- [ ] Portal Guru: catatan siswa + sesi pembinaan
- [x] Portal Guru: jadwal classroom (ADR-004)
- [x] Portal Guru: absensi classroom (ADR-005)
- [x] Portal Guru: UX polish absensi + rekap (sesi 6 Agustus 2026)
- [ ] Portal Guru: forum
- [ ] Portal Siswa
- [ ] Portal Ortu
- [ ] Security audit
- [ ] Test suite

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
```

> Lima commit teratas (`dc8334f` … `a97eb61`) masih **belum terurai** di catatan
> sesi mana pun — isinya hanya diketahui dari judul commit. Tiga terakhir
> (`d5b36d3`, `5f2222c`, `46de0aa`) diuraikan di catatan sesi 25 Agustus 2026
> di bawah.

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
