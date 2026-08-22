# TIER & LIFECYCLE — MIClass

> Dokumen keputusan produk untuk sistem tier, siklus hidup akun guru, dan hard
> delete. Seluruh isi dokumen ini **sudah dikunci oleh product owner**. Claude
> Code memakainya sebagai rujukan saat menulis migration — bukan sebagai bahan
> yang boleh dipertanyakan ulang.
>
> Ditulis: 22 Agustus 2026. Keadaan database yang dirujuk di sini diperiksa pada
> tanggal itu di proyek tertaut `teccdzetrdjowqemnuuc`.

---

## 1. TIER

Tiga tier, seluruhnya melekat pada `profiles.tier` (TEXT, NOT NULL, default
`'TRIAL'`).

| Tier | Durasi | Tab Rancang | Biaya | Status jual |
|------|--------|-------------|-------|-------------|
| `TRIAL` | 30 hari | Tidak | Gratis | Dijual |
| `GURU_GO` | 365 hari | Tidak | Berbayar | Dijual |
| `GURU_PRO` | 365 hari | **Ya** | Berbayar | **Belum dijual** — menunggu Tab Rancang stabil |

Satu-satunya pembeda fitur antar tier adalah **Tab Rancang**. Semua fitur lain —
kelola siswa, jadwal, absensi, penilaian, forum, catatan, sesi pembinaan —
tersedia identik di ketiga tier. Perbedaan `TRIAL` dan `GURU_GO` murni soal
durasi dan biaya.

`GURU_PRO` belum boleh dijual. Ia sudah ada di constraint dan di data (1 profil
per 22 Agustus 2026), tetapi penjualannya menunggu Tab Rancang stabil.

---

## 2. REGISTRASI

Guru memilih tier saat mendaftar: `TRIAL`, `GURU_GO`, atau `GURU_PRO`.

**Jalur `TRIAL` — otomatis, tanpa campur tangan manusia.**
Saat registrasi langsung disetel:

```
tier       = 'TRIAL'
expires_at = NOW() + INTERVAL '30 days'
is_active  = true
```

**Jalur `GURU_GO` / `GURU_PRO` — menunggu konfirmasi pembayaran manual.**
Guru mendaftar, lalu menunggu Romo mengonfirmasi pembayaran. Sebelum
dikonfirmasi, akun belum aktif. Setelah dikonfirmasi:

```
tier       = tier yang dipilih
expires_at = NOW() + INTERVAL '365 days'
is_active  = true
```

Konfirmasi dijalankan Romo lewat `fn_activate_guru`, yang akan diubah agar
menerima parameter tier (lihat §7, Migration A).

### Yang dihapus

`fn_guru_trial_start()` dan trigger `trg_guru_trial_start` **akan dihapus**.
Keduanya berasal dari model lama, di mana masa trial mulai berjalan saat guru
membuat classroom pertamanya (`AFTER INSERT ON classrooms`). Model itu tidak
berlaku lagi: masa berlaku kini ditetapkan saat registrasi, bukan saat classroom
pertama dibuat. Membiarkan trigger itu hidup berarti `expires_at` bisa ditimpa
diam-diam setelah registrasi.

---

## 3. UPGRADE PATH

| Dari | Ke | Hasil |
|------|-----|-------|
| `TRIAL` | `GURU_GO` | 365 hari penuh dari tanggal upgrade |
| `TRIAL` | `GURU_PRO` | 365 hari penuh dari tanggal upgrade |
| `GURU_GO` | `GURU_PRO` | 365 hari penuh dari tanggal upgrade |

Aturan yang berlaku untuk semua perpindahan:

- **Sisa durasi hangus.** Perpindahan tier tidak pernah menambahkan sisa hari
  lama ke masa baru. Selalu 365 hari penuh dihitung dari tanggal upgrade.
- **Tidak ada downgrade.** Tidak ada jalur `GURU_PRO` → `GURU_GO` maupun
  kembali ke `TRIAL`.
- **Setiap upgrade menunggu konfirmasi pembayaran manual** oleh Romo.

### Alur permintaan

Guru mengajukan tier baru → nilai masuk ke `profiles.tier_requested` → Romo
menyetujui secara manual lewat `fn_activate_guru` → `tier` dan `expires_at`
disetel, `tier_requested` dikosongkan.

Constraint `profiles_tier_requested_check` saat ini berbunyi
`CHECK (tier_requested = 'GURU_PRO')`, sehingga permintaan upgrade ke `GURU_GO`
akan ditolak database. Ini harus diperbaiki di Migration A.

---

## 4. LIFECYCLE AKUN GURU

Tiga keadaan, seluruhnya **dihitung dari `expires_at`** — tidak ada kolom status
tersimpan.

| Keadaan | Syarat | Baca | Tulis |
|---------|--------|------|-------|
| **Aktif** | `is_active = true AND expires_at > NOW()` | Ya | Ya |
| **Grace period** | expired, tetapi belum H+8 | Ya | **Tidak** |
| **Dihapus** | H+8 setelah expired | — | — |

Grace period dimulai saat `is_active = false` **atau** `expires_at <= NOW()`.

**Tidak ada kolom `grace_until`.** Batas grace adalah `expires_at + 8 hari`,
turunan murni dari `expires_at`. Menyimpannya sebagai kolom akan menciptakan
sumber kebenaran kedua yang bisa menyimpang saat masa berlaku diperpanjang.
Hitung on-the-fly.

---

## 5. GRACE PERIOD — hari per hari

| Hari | Akses | Banner in-app | Email |
|------|-------|---------------|-------|
| H+0 | Read-only | Ya | **Ya** — pemberitahuan pertama |
| H+1 | Read-only | Ya | — |
| H+2 | Read-only | Ya | — |
| H+3 | Read-only | Ya | **Ya** — pengingat |
| H+4 | Read-only | Ya | — |
| H+5 | Read-only | Ya | — |
| H+6 | Read-only | Ya | — |
| H+7 | Read-only | **Banner keras** | **Ya** — final, "besok data dihapus" |
| H+8 | — | — | **Hard delete otomatis** |

Banner in-app tampil sepanjang H+0 sampai H+7, disuplai
`fn_guru_trial_status()` yang sudah mengembalikan `hari_tersisa` dan `status`.
Email dikirim hanya di tiga titik: H+0, H+3, H+7.

---

## 6. ENFORCEMENT RLS — READ vs WRITE

Aturan yang ditegakkan di database:

- **Guru aktif** — boleh baca dan tulis.
- **Guru dalam grace period (H+0–H+7)** — boleh baca, **tidak boleh tulis**.
- **Guru H+8 ke atas** — sudah dihapus, tidak ada lagi yang perlu ditegakkan.
- **Siswa dan Ortu** — **tidak terpengaruh sama sekali** oleh enforcement tier.
  Mereka tetap tunduk pada policy masing-masing seperti sebelumnya.

### Fungsi

```sql
fn_guru_is_active()  -- SECURITY DEFINER, STABLE
-- role <> 'GURU' OR (is_active = true AND expires_at > NOW())
```

Bentuk `role <> 'GURU' OR ...` itu disengaja: ia mengembalikan `true` untuk
siswa dan ortu, sehingga memasangnya di tabel yang juga ditulis non-guru tidak
memblokir mereka. Ada lima policy tulis milik non-guru yang akan ikut terkena
policy restriktif ini — `pol_cm_siswa_insert`, `pol_cm_ortu_insert`,
`pol_comments_member_insert`, `pm_ortu_insert`, `pm_ortu_update_read` — dan
kelimanya harus tetap lolos.

### Cara pemasangan

Dipasang sebagai **`RESTRICTIVE` policy** untuk `INSERT`, `UPDATE`, dan `DELETE`
pada semua tabel yang bisa ditulis:

```sql
CREATE POLICY trial_guard_insert ON <tabel> AS RESTRICTIVE FOR INSERT
  TO authenticated WITH CHECK (fn_guru_is_active());
CREATE POLICY trial_guard_update ON <tabel> AS RESTRICTIVE FOR UPDATE
  TO authenticated USING (fn_guru_is_active()) WITH CHECK (fn_guru_is_active());
CREATE POLICY trial_guard_delete ON <tabel> AS RESTRICTIVE FOR DELETE
  TO authenticated USING (fn_guru_is_active());
```

### Kenapa bentuk ini

**Sifat read-only pada grace period bersifat struktural, bukan hasil
ketelitian.** `SELECT` tidak pernah disebut di satu pun policy di atas, jadi
tidak ada jalan bagi enforcement ini untuk memblokir pembacaan — bukan karena
kami hati-hati menulisnya, melainkan karena perintahnya tidak ada di sana. Ini
properti yang tidak bisa dicapai dengan menyunting policy yang sudah ada.

Alasan konkretnya: sepuluh policy yang ada memakai `cmd = ALL`, yang melayani
baca dan tulis sekaligus. Pada policy-policy itu `qual` dipakai bersama oleh
`SELECT` dan `DELETE`, sehingga menambahkan syarat aktif ke `qual` untuk
memblokir DELETE **akan ikut memblokir SELECT** — persis yang dilarang keputusan
produk. Policy restriktif terpisah menghindari jebakan itu sepenuhnya.

Konsekuensi lain yang sama pentingnya: **`fn_is_classroom_owner` tidak diubah,
dan tidak satu pun policy lama disunting.** Risiko regresi pada jalur baca dan
pada isolasi antar-classroom karena itu nol menurut konstruksi, bukan nol
menurut hasil pengujian.

Ongkosnya sekitar 54 objek policy baru (3 perintah × 18 tabel). Banyak, tetapi
seragam dan bisa dihasilkan satu loop, dan tidak satu pun menuntut pembacaan
policy lama.

### Kueri audit

Menemukan tabel tulis yang belum terpasang penjaga:

```sql
SELECT tablename FROM pg_policies
WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE'
  AND policyname LIKE 'trial_guard%';
```

### Batas jangkauan yang harus disadari

Dua belas dari tiga belas Edge Function memakai `SERVICE_ROLE`, yang
**melewati RLS sepenuhnya** — termasuk `phase2c-generate`, `phase2-material`,
`phase2a-planning`, `runtime-sync`, dan `generate-akun`. Enforcement RLS ini
nyata untuk pemanggilan PostgREST langsung, tetapi tidak menyentuh jalur Edge
Function. Gate di dalam Edge Function adalah pekerjaan tersendiri.

---

## 7. URUTAN PENGERJAAN — A → B → D → C

Urutan ini sudah dikunci. Perhatikan D mendahului C.

### Migration A — Schema

**Dependensi:** tidak ada. Ini fondasi; tiga item lain membacanya.

- Tambah `'GURU_GO'` ke constraint `profiles_tier_check`
- Perbaiki `profiles_tier_requested_check` agar mencakup `GURU_GO`
- Ubah `fn_activate_guru`: terima parameter `p_tier text`, setel `tier` dan
  `expires_at` sesuai tier
- Hapus `fn_guru_trial_start` dan `trg_guru_trial_start`
- Setel `expires_at` saat registrasi TRIAL (di `fn_handle_new_user` atau
  `generate-akun`)
- **Tidak ada kolom baru** — grace period dihitung on-the-fly dari `expires_at`

Yang perlu diperhatikan saat menulisnya: `fn_activate_guru` yang sekarang
**tidak menyentuh kolom `tier` sama sekali**. Ia hanya menyetel `is_active`,
`activated_at`, dan `expires_at = NOW() + INTERVAL '1 year'`. Guru yang
diaktifkan lewatnya tetap ber-`tier = 'TRIAL'` sambil punya masa setahun. Begitu
tier menjadi penentu akses Tab Rancang, ketidakcocokan ini langsung menjadi bug
perizinan.

### Migration B — RLS enforcement

**Dependensi:** A selesai. Definisi "aktif" bergantung pada tier dan masa
berlaku yang ditetapkan di A.

- Buat `fn_guru_is_active()` — `SECURITY DEFINER`, `STABLE`,
  `SET search_path TO 'public'`, dengan REVOKE dua lapis sesuai CLAUDE.md §7
- Pasang `RESTRICTIVE` policy INSERT/UPDATE/DELETE di semua tabel tulis
- `fn_is_classroom_owner` **tidak diubah**

### Item D — Email notifikasi

**Dependensi:** A selesai. **Tidak bergantung pada C.**

- Edge Function baru untuk kirim email H+0, H+3, H+7
- Tabel idempotency untuk mencegah email terkirim dua kali bila job berjalan
  ulang
- Via **Brevo API transaksional**, bukan SMTP relay Supabase Auth. SMTP relay
  yang ada sekarang hanya melayani email bawaan Supabase Auth (reset password)
  dan tidak bisa dipakai mengirim email sembarangan dari Edge Function.
- **`BREVO_API_KEY` harus dipasang product owner** ke secrets sebelum item ini
  dikerjakan. Per 22 Agustus 2026 secret itu belum ada.

### Item C — Hard delete otomatis

**Dependensi:** A, B, dan D — seluruhnya.

D mendahului C bukan karena alasan teknis, melainkan karena menghapus data guru
secara permanen sebelum jalur notifikasi terbukti bekerja berarti ada
kemungkinan nyata data hilang tanpa satu pun peringatan pernah sampai ke
pemiliknya. Notifikasi harus terbukti terkirim lebih dulu.

- **Supabase Scheduled Edge Function, bukan `pg_cron`.** Alasannya: untuk
  operasi yang merusak permanen, kegagalan harus terlihat. Log Scheduled
  Function tampil di dashboard Functions; kegagalan `pg_cron` tenggelam di
  `cron.job_run_details`.
- Jalankan setiap hari: identifikasi guru H+8 ke atas, eksekusi STEP 1–6 (§8)

### Catatan infrastruktur

`pg_cron 1.6.4` dan `pg_net 0.20.4` **tersedia tetapi belum aktif** di proyek
ini (per 22 Agustus 2026 — skema `cron` belum ada). Keduanya diaktifkan lewat
Supabase Dashboard → Database → Extensions, bukan lewat migration. Dengan
pilihan Scheduled Edge Function di atas, keduanya tidak diperlukan.

---

## 8. HARD DELETE H+8 — urutan operasi wajib

Urutan ini tidak boleh diubah. Ia ditentukan oleh arah foreign key, bukan oleh
selera.

### STEP 1 — Identifikasi siswa/ortu yang akan dihapus

Siswa dan ortu di kelas guru yang expired, **yang tidak punya
`classroom_members` aktif di kelas guru lain yang masih aktif**
(`is_active = true AND expires_at > NOW()`).

Tandai `profile_id` mereka. Jangan hapus dulu — penghapusannya di STEP 5.

Langkah ini ada karena satu siswa bisa terdaftar di kelas lebih dari satu guru.
Menghapus akun siswa saat satu gurunya kedaluwarsa akan memutus akses siswa itu
ke kelas guru lain yang masih membayar.

### STEP 2 — Hapus data `rancang_*` secara manual, berurutan

Kesembilan FK ini `ON DELETE RESTRICT`, jadi ia akan **memblokir** penghapusan
profil, bukan ikut terhapus. Urutan wajib:

1. `rancang_artifact_events`
2. `rancang_artifact_selections`
3. `rancang_artifact_versions`
4. `rancang_atp_revisions`
5. `rancang_tp_revisions`
6. `rancang_legacy_atp_mappings`
7. `rancang_meeting_allocations`
8. `classroom_jp_policies` — lewat `confirmed_by_profile_id`

### STEP 3 — Hapus `parent_messages`

`parent_messages.teacher_id` adalah `NO ACTION`, yang juga memblokir.

```sql
DELETE FROM parent_messages WHERE classroom_id IN (kelas guru expired);
```

### STEP 4 — Hapus semua data kelas

```
classroom_members, attendance, student_notes, guidance_sessions,
forum_comments, forum_posts, assessments, assessment_results,
grade_recap, schedules, tp_kktp, student_groups, classroom_roster,
rancang_dokumen, rancang_settings, rancang_planning_contexts,
rancang_artifacts, rancang_atp, rancang_pipeline_state,
teaching_context_classrooms, teaching_contexts,
authorized_teaching_scopes, wali_home_classrooms,
classrooms
```

`forum_comments` disebut sebelum `forum_posts` dengan sengaja:
`forum_comments.classroom_id` adalah `NO ACTION` dan akan memblokir penghapusan
`classrooms` bila ditinggalkan.

### STEP 5 — Hapus profil siswa/ortu yang ditandai di STEP 1

```sql
DELETE FROM profiles WHERE id IN (daftar dari STEP 1);
```

`profiles.user_id → auth.users` adalah `ON DELETE CASCADE`, jadi baris
`auth.users` ikut terhapus.

### STEP 6 — Hapus profil guru

```sql
DELETE FROM profiles WHERE id = guru_profile_id;
```

CASCADE ke `auth.users` otomatis.

---

## 9. FK YANG PERLU PENANGANAN MANUAL

| FK | Aturan | Akibat bila diabaikan |
|----|--------|----------------------|
| `rancang_artifact_events.profile_id` | RESTRICT | Delete gagal |
| `rancang_artifact_selections.selected_by` | RESTRICT | Delete gagal |
| `rancang_artifact_versions.created_by` | RESTRICT | Delete gagal |
| `rancang_artifact_versions.profile_id` | RESTRICT | Delete gagal |
| `rancang_atp_revisions.created_by` | RESTRICT | Delete gagal |
| `rancang_legacy_atp_mappings.adopted_by` | RESTRICT | Delete gagal |
| `rancang_meeting_allocations.confirmed_by_profile_id` | RESTRICT | Delete gagal |
| `rancang_tp_revisions.created_by` | RESTRICT | Delete gagal |
| `classroom_jp_policies.confirmed_by_profile_id` | RESTRICT | Delete gagal |
| `parent_messages.teacher_id` | NO ACTION | Delete gagal |

**Strategi: hapus manual berurutan di dalam Edge Function. JANGAN ubah menjadi
CASCADE.** Kesepuluh FK ini menjaga jejak audit `rancang_*`; mengubahnya menjadi
CASCADE berarti jejak itu bisa lenyap tanpa disengaja pada operasi lain yang
tidak ada hubungannya dengan hard delete.

Perhatikan bentuk kegagalannya: RESTRICT dan NO ACTION **menolak** `DELETE`,
tidak meninggalkannya separuh jalan. Tetapi kalau STEP 1–6 dijalankan sebagai
rangkaian perintah terpisah tanpa transaksi, kegagalan di langkah belakang akan
meninggalkan data yang sudah terhapus di langkah depan. Ini persis pola yang
merusak `semester-reset` (lihat `docs/AUDIT-FUNCTIONAL-TABS.md`). **Bungkus
seluruh STEP 1–6 dalam satu transaksi.**

---

## 10. YANG BELUM BOLEH DIKERJAKAN

- **Tab Rancang** — 15+ bug diketahui, sprint terpisah
- **Penjualan GURU_PRO** — menunggu Tab Rancang stabil
- **Diagnostik siswa** — fitur baru, belum didesain

---

## 11. KEADAAN DATA — 22 Agustus 2026

Diperiksa di proyek tertaut, sebagai titik awal sebelum Migration A:

```
tier,is_active,count
GURU_PRO,true,1
TRIAL,false,10
TRIAL,true,15
```

Kesepuluh guru `is_active = false` seluruhnya punya `trial_started_at IS NULL`
dan `expires_at IS NULL` — mereka **belum pernah memulai trial**, bukan
kedaluwarsa. Nol guru berstatus expired per tanggal ini.

Dua akibatnya untuk pelaksanaan:

1. `fn_guru_is_active()` mengevaluasi `expires_at > NOW()` menjadi NULL — dan
   karenanya tidak aktif — untuk kesepuluh profil itu. Di bawah model registrasi
   baru `expires_at` selalu terisi saat daftar, jadi `NULL` adalah keadaan
   warisan. **Migration A perlu memutuskan nasib kesepuluh baris ini**:
   di-backfill atau dibiarkan tidak aktif.
2. Migration B bisa dipasang tanpa memblokir seorang pun yang sedang bekerja —
   nol guru aktif akan kehilangan hak tulis pada saat pemasangan.

`parent_messages` berisi 40 baris milik 1 guru. Kesembilan tabel `rancang_*`
masih kosong, sehingga penghalang RESTRICT belum terasa hari ini — tetapi Tab
Rancang adalah fitur `GURU_PRO` yang akan segera mengisinya.
